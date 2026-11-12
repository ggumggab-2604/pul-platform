alter table public.lesson_videos
  add column member_shared boolean not null default false,
  alter column instructor_id drop not null,
  add constraint lesson_videos_instructor_required check (member_shared or instructor_id is not null);

-- A shared link credits its YouTube channel without claiming a PUL instructor identity.
create or replace function private.link_lesson_video_instructor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.member_shared then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.instructor_id is distinct from old.instructor_id then
      raise exception '영상의 채널명과 교습가명으로 연결 대상을 확인해 주세요.';
    end if;

    if (new.channel_name, new.instructor_name) is not distinct from (old.channel_name, old.instructor_name)
       or exists (
         select 1 from private.lesson_instructors as instructor
         where instructor.id = old.instructor_id
           and (instructor.channel_name, instructor.instructor_name) = (new.channel_name, new.instructor_name)
       ) then
      return new;
    end if;
  end if;

  insert into private.lesson_instructors (channel_name, instructor_name)
  values (new.channel_name, new.instructor_name)
  on conflict (channel_name, instructor_name)
  do update set channel_name = excluded.channel_name
  returning id into new.instructor_id;
  return new;
end;
$$;

create or replace function private.public_lesson_video_json(p_video public.lesson_videos)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'video_key', p_video.video_key,
    'title', p_video.title,
    'category', p_video.category,
    'channel_name', coalesce(instructor.channel_name, p_video.channel_name),
    'instructor_name', coalesce(instructor.instructor_name, p_video.instructor_name),
    'level', p_video.level,
    'duration_text', p_video.duration_text,
    'description', p_video.description,
    'youtube_url', p_video.youtube_url,
    'youtube_channel_url', p_video.youtube_channel_url,
    'thumbnail_type', p_video.thumbnail_type,
    'tags', p_video.tags,
    'is_featured', p_video.is_featured
  ) || case when instructor.id is null then '{}'::jsonb
       else pg_catalog.jsonb_build_object('instructor_id', instructor.id) end
  from (select 1) as input
  left join private.lesson_instructors as instructor on instructor.id = p_video.instructor_id;
$$;

create or replace function public.get_public_lesson_video(
  p_video_key text,
  p_channel_name text,
  p_instructor_name text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.public_lesson_video_json(video)
  from public.lesson_videos as video
  left join private.lesson_instructors as instructor on instructor.id = video.instructor_id
  where video.publication_status = 'published'
    and (
      (p_video_key ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' and video.video_key = p_video_key)
      or (
        p_video_key is null
        and pg_catalog.char_length(p_channel_name) between 1 and 120
        and pg_catalog.char_length(p_instructor_name) between 1 and 100
        and instructor.channel_name = p_channel_name
        and instructor.instructor_name = p_instructor_name
      )
    )
  order by video.is_featured desc, video.created_at desc, video.video_key
  limit 1;
$$;

create table private.lesson_video_reports (
  video_id uuid not null references public.lesson_videos (id) on delete cascade,
  reporter_id uuid not null references public.user_accounts (id) on delete cascade,
  primary key (video_id, reporter_id)
);

alter table private.lesson_video_reports enable row level security;
alter table private.lesson_video_reports force row level security;
revoke all on table private.lesson_video_reports from public, anon, authenticated, service_role;

create function public.publish_shared_lesson_video(
  p_youtube_id text,
  p_category text,
  p_title text,
  p_channel_name text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_active_lesson_video_bookmark_actor();
  v_key text := 'yt-' || p_youtube_id;
  v_url text := 'https://www.youtube.com/watch?v=' || p_youtube_id;
  v_channel text := pg_catalog.btrim(pg_catalog.left(pg_catalog.btrim(p_channel_name), 100));
  v_inserted_key text;
begin
  if p_youtube_id is null or p_youtube_id !~ '^[A-Za-z0-9_-]{11}$'
    or p_category is null or p_category not in (
      'beginner_intro', 'basic_stance', 'swing', 'tee_shot', 'putting', 'approach',
      'distance_control', 'direction', 'rules_manner', 'practical_strategy',
      'equipment', 'club_reservation', 'tournament_prep', 'other'
    ) or p_title is null or pg_catalog.char_length(pg_catalog.btrim(p_title)) not between 2 and 160
    or v_channel is null or v_channel = '' then
    raise exception 'YouTube 영상 정보와 카테고리를 확인해 주세요.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.lesson_videos as video
    where video.youtube_url = v_url
      or video.youtube_url = 'https://youtu.be/' || p_youtube_id
  ) then
    raise exception '이미 등록된 YouTube 영상입니다.' using errcode = '23505';
  end if;

  insert into public.lesson_videos (
    video_key, title, category, channel_name, instructor_name, level, duration_text,
    description, youtube_url, publication_status, created_by, updated_by, member_shared
  ) values (
    v_key, pg_catalog.btrim(p_title), p_category, v_channel, v_channel, 'intro', '-',
    '회원이 공유한 파크골프 영상입니다.', v_url, 'published', v_actor, v_actor, true
  ) on conflict (video_key) do nothing returning video_key into v_inserted_key;

  if v_inserted_key is null then
    raise exception '이미 등록된 YouTube 영상입니다.' using errcode = '23505';
  end if;
  return v_inserted_key;
end;
$$;

create function public.report_lesson_video(p_video_key text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_active_lesson_video_bookmark_actor();
  v_video_id uuid;
begin
  if p_video_key is null or p_video_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' then
    raise exception '신고할 영상을 확인해 주세요.' using errcode = '22023';
  end if;

  -- Match the table-then-row lock order of instructor profile renames.
  lock table public.lesson_videos in row exclusive mode;
  select video.id into v_video_id
  from public.lesson_videos as video
  where video.video_key = p_video_key and video.publication_status = 'published'
  for update;
  if not found then
    raise exception '현재 공개된 영상을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  insert into private.lesson_video_reports (video_id, reporter_id)
  values (v_video_id, v_actor)
  on conflict do nothing;
  if not found then
    return 'already_reported';
  end if;

  if (select pg_catalog.count(*) from private.lesson_video_reports where video_id = v_video_id) >= 5 then
    update public.lesson_videos
    set publication_status = 'hidden', version = version + 1, updated_by = v_actor
    where id = v_video_id;
    return 'hidden';
  end if;
  return 'reported';
end;
$$;

revoke all on function public.publish_shared_lesson_video(text, text, text, text),
  public.report_lesson_video(text) from public, anon, authenticated, service_role;
grant execute on function public.publish_shared_lesson_video(text, text, text, text),
  public.report_lesson_video(text) to authenticated;
