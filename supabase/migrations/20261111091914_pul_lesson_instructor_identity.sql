begin;

lock table public.lesson_videos, private.lesson_instructor_bookmarks in access exclusive mode;

create table private.lesson_instructors (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  channel_name text not null check (channel_name = pg_catalog.btrim(channel_name) and pg_catalog.char_length(channel_name) between 1 and 120),
  instructor_name text not null check (instructor_name = pg_catalog.btrim(instructor_name) and pg_catalog.char_length(instructor_name) between 1 and 100),
  unique (channel_name, instructor_name)
);

alter table private.lesson_instructors enable row level security;
alter table private.lesson_instructors force row level security;
revoke all on table private.lesson_instructors from public, anon, authenticated, service_role;

insert into private.lesson_instructors (channel_name, instructor_name)
select channel_name, instructor_name from public.lesson_videos
union
select channel_name, instructor_name from private.lesson_instructor_bookmarks;

alter table public.lesson_videos
  add column instructor_id uuid references private.lesson_instructors (id);

alter table public.lesson_videos disable trigger lesson_videos_set_updated_at;

update public.lesson_videos as video
set instructor_id = instructor.id
from private.lesson_instructors as instructor
where video.channel_name = instructor.channel_name
  and video.instructor_name = instructor.instructor_name;

alter table public.lesson_videos enable trigger lesson_videos_set_updated_at;
alter table public.lesson_videos alter column instructor_id set not null;

drop index public.lesson_videos_public_instructor_idx;
create index lesson_videos_public_instructor_idx
  on public.lesson_videos (instructor_id, is_featured desc, created_at desc, video_key)
  where publication_status = 'published';

alter table private.lesson_instructor_bookmarks
  add column instructor_id uuid references private.lesson_instructors (id);

update private.lesson_instructor_bookmarks as bookmark
set instructor_id = instructor.id
from private.lesson_instructors as instructor
where bookmark.channel_name = instructor.channel_name
  and bookmark.instructor_name = instructor.instructor_name;

drop function public.list_my_lesson_instructor_bookmarks(jsonb);
drop function public.set_lesson_instructor_bookmark(text, text, boolean);

alter table private.lesson_instructor_bookmarks
  drop constraint lesson_instructor_bookmarks_pkey,
  drop column channel_name,
  drop column instructor_name,
  add primary key (user_id, instructor_id);

create function private.link_lesson_video_instructor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
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

revoke all on function private.link_lesson_video_instructor() from public, anon, authenticated, service_role;

create trigger lesson_videos_link_instructor
before insert or update of channel_name, instructor_name, instructor_id on public.lesson_videos
for each row execute function private.link_lesson_video_instructor();

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
    'instructor_id', instructor.id,
    'channel_name', instructor.channel_name,
    'instructor_name', instructor.instructor_name,
    'level', p_video.level,
    'duration_text', p_video.duration_text,
    'description', p_video.description,
    'youtube_url', p_video.youtube_url,
    'youtube_channel_url', p_video.youtube_channel_url,
    'thumbnail_type', p_video.thumbnail_type,
    'tags', p_video.tags,
    'is_featured', p_video.is_featured
  )
  from private.lesson_instructors as instructor
  where instructor.id = p_video.instructor_id;
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
  join private.lesson_instructors as instructor on instructor.id = video.instructor_id
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

create function public.get_public_lesson_instructor_video(p_instructor_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.public_lesson_video_json(video)
  from public.lesson_videos as video
  where video.instructor_id = p_instructor_id
    and video.publication_status = 'published'
  order by video.is_featured desc, video.created_at desc, video.video_key
  limit 1;
$$;

revoke all on function public.get_public_lesson_instructor_video(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_lesson_instructor_video(uuid) to anon, authenticated;

create function public.list_my_lesson_instructor_bookmarks(p_instructor_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := private.require_active_lesson_video_bookmark_reader();
begin
  if p_instructor_ids is null or pg_catalog.cardinality(p_instructor_ids) > 24 then
    raise exception '조회할 교습가를 확인해 주세요.';
  end if;

  return coalesce((
    select pg_catalog.jsonb_agg(bookmark.instructor_id)
    from private.lesson_instructor_bookmarks as bookmark
    where bookmark.user_id = v_actor_id
      and bookmark.instructor_id = any (p_instructor_ids)
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_my_lesson_instructor_bookmarks(uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.list_my_lesson_instructor_bookmarks(uuid[]) to authenticated;

create function public.set_lesson_instructor_bookmark(p_instructor_id uuid, p_saved boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := private.require_active_lesson_video_bookmark_actor();
begin
  if p_saved is null or p_instructor_id is null then
    raise exception '관심 교습가 정보를 확인해 주세요.';
  end if;

  if p_saved then
    perform 1
    from public.lesson_videos as video
    where video.instructor_id = p_instructor_id and video.publication_status = 'published'
    limit 1
    for share;

    if not found then
      raise exception '공개된 교습가를 찾을 수 없습니다.';
    end if;

    insert into private.lesson_instructor_bookmarks (user_id, instructor_id)
    values (v_actor_id, p_instructor_id)
    on conflict (user_id, instructor_id) do nothing;
  else
    delete from private.lesson_instructor_bookmarks as bookmark
    where bookmark.user_id = v_actor_id and bookmark.instructor_id = p_instructor_id;
  end if;

  return p_saved;
end;
$$;

revoke all on function public.set_lesson_instructor_bookmark(uuid, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.set_lesson_instructor_bookmark(uuid, boolean) to authenticated;

create function public.get_lesson_video_for_management(p_video_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_lesson_directory_manager();
  return (
    select pg_catalog.jsonb_build_object(
      'video', private.public_lesson_video_json(video),
      'version', video.version,
      'publication_status', video.publication_status
    )
    from public.lesson_videos as video
    where video.video_key = p_video_key
  );
end;
$$;

revoke all on function public.get_lesson_video_for_management(text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_lesson_video_for_management(text) to authenticated;

create function public.rename_lesson_instructor(
  p_instructor_id uuid,
  p_expected_channel_name text,
  p_expected_instructor_name text,
  p_channel_name text,
  p_instructor_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := private.require_lesson_directory_manager();
  v_instructor private.lesson_instructors%rowtype;
  v_channel_name text := pg_catalog.btrim(p_channel_name);
  v_instructor_name text := pg_catalog.btrim(p_instructor_name);
begin
  if v_channel_name is null or pg_catalog.char_length(v_channel_name) not between 1 and 120
     or v_instructor_name is null or pg_catalog.char_length(v_instructor_name) not between 1 and 100 then
    raise exception '채널명과 교습가 활동명을 확인해 주세요.';
  end if;

  -- Take the video lock before touching the profile so edits cannot attach a video mid-rename.
  lock table public.lesson_videos in exclusive mode;

  select instructor.* into v_instructor
  from private.lesson_instructors as instructor
  where instructor.id = p_instructor_id
  for update;
  if not found then
    raise exception '교습가 프로필을 찾을 수 없습니다.';
  end if;
  if (v_instructor.channel_name, v_instructor.instructor_name) is distinct from
     (p_expected_channel_name, p_expected_instructor_name) then
    raise exception '교습가 프로필이 변경되었습니다. 최신 정보를 다시 확인해 주세요.';
  end if;

  begin
    update private.lesson_instructors
    set channel_name = v_channel_name, instructor_name = v_instructor_name
    where id = p_instructor_id
      and (channel_name, instructor_name) is distinct from (v_channel_name, v_instructor_name);
  exception when unique_violation then
    raise exception using errcode = '23505', message = '같은 채널명과 활동명을 사용 중인 다른 교습가가 있습니다.';
  end;

  update public.lesson_videos
  set channel_name = v_channel_name, instructor_name = v_instructor_name,
      updated_by = v_actor_id, version = version + 1
  where instructor_id = p_instructor_id
    and (channel_name, instructor_name) is distinct from (v_channel_name, v_instructor_name);

  return p_instructor_id;
end;
$$;

revoke all on function public.rename_lesson_instructor(uuid, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.rename_lesson_instructor(uuid, text, text, text, text) to authenticated;

commit;
