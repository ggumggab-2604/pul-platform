create table private.lesson_instructor_channels (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.user_accounts(id) on delete cascade,
  instructor_id uuid unique references private.lesson_instructors(id),
  channel_name text not null check (char_length(channel_name) between 1 and 120),
  instructor_name text not null check (char_length(instructor_name) between 1 and 100),
  channel_url text not null unique check (channel_url ~ '^https://www[.]youtube[.]com/(@[^/?#[:space:]]+|channel/UC[A-Za-z0-9_-]{22})$' and char_length(channel_url) <= 300),
  introduction text not null check (char_length(introduction) between 2 and 1000),
  status text not null default 'pending' check (status in ('pending', 'active', 'rejected', 'paused')),
  review_version integer not null default 1,
  reviewed_by uuid references public.user_accounts(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (status not in ('active', 'paused') or instructor_id is not null)
);

create table private.lesson_instructor_exclusive_videos (
  youtube_id text not null check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  channel_id uuid not null references private.lesson_instructor_channels(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 160),
  category text not null check (category in (
    'beginner_intro', 'basic_stance', 'swing', 'tee_shot', 'putting', 'approach',
    'distance_control', 'direction', 'rules_manner', 'practical_strategy',
    'equipment', 'club_reservation', 'tournament_prep', 'other'
  )),
  created_at timestamptz not null default now(),
  primary key (channel_id, youtube_id)
);

create table private.lesson_instructor_channel_posts (
  id uuid primary key,
  channel_id uuid not null references private.lesson_instructor_channels(id) on delete cascade,
  author_id uuid references public.user_accounts(id) on delete set null,
  kind text not null check (kind in ('question', 'notice')),
  body text not null check (char_length(body) between 2 and 2000),
  reply text check (char_length(reply) between 2 and 2000),
  created_at timestamptz not null default now()
);

alter table private.lesson_instructor_channels enable row level security;
alter table private.lesson_instructor_exclusive_videos enable row level security;
alter table private.lesson_instructor_channel_posts enable row level security;
revoke all on private.lesson_instructor_channels, private.lesson_instructor_exclusive_videos,
  private.lesson_instructor_channel_posts from public, anon, authenticated, service_role;

create index lesson_instructor_exclusive_videos_channel_idx
  on private.lesson_instructor_exclusive_videos (channel_id, created_at desc);
create index lesson_instructor_channel_posts_channel_idx
  on private.lesson_instructor_channel_posts (channel_id, kind, created_at desc);
create index lesson_videos_member_channel_idx
  on public.lesson_videos (created_by, created_at desc)
  where member_shared and publication_status = 'published';

-- The existing UUID remains the public profile and bookmark key.
create view private.active_lesson_instructor_channels as
select channel.id, channel.owner_id, channel.instructor_id, instructor.channel_name,
  instructor.instructor_name, channel.channel_url, channel.introduction, channel.reviewed_at
from private.lesson_instructor_channels channel
join private.lesson_instructors instructor on instructor.id = channel.instructor_id
join public.user_accounts account on account.id = channel.owner_id
where channel.status = 'active' and account.account_status = 'active';
revoke all on private.active_lesson_instructor_channels from public, anon, authenticated, service_role;

create function private.normalized_lesson_youtube_channel_path(p_url text)
returns text
language sql immutable strict set search_path = ''
as $$
  select case
    when path ~ '^@[^/?#[:space:]]+$' then lower(path)
    when path ~ '^(channel/UC[A-Za-z0-9_-]{22}|c/[^/?#[:space:]]+)$' then path
  end
  from (
    select regexp_replace(
      substring(btrim(p_url) from '(?i)^https://(?:www[.]|m[.])?youtube[.]com/([^?#[:space:]]+)(?:[?#].*)?$'),
      '(?:/(?:videos|featured|shorts|streams|playlists|community|channels|about|releases|podcasts))?/*$', ''
    ) as path
  ) parsed;
$$;
revoke all on function private.normalized_lesson_youtube_channel_path(text)
  from public, anon, authenticated, service_role;

alter table public.lesson_videos
  drop constraint lesson_videos_youtube_channel_url_check,
  add constraint lesson_videos_youtube_channel_url_check check (
    youtube_channel_url is null
    or private.valid_lesson_youtube_url(youtube_channel_url)
    or (
      youtube_channel_url like 'https://m.youtube.com/%'
      and private.valid_lesson_external_url(youtube_channel_url)
    )
  );

create function private.lesson_instructor_channel_application_json(channel private.lesson_instructor_channels)
returns jsonb
language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'id', channel.id, 'instructor_id', channel.instructor_id,
    'channel_name', channel.channel_name, 'instructor_name', channel.instructor_name,
    'channel_url', channel.channel_url, 'introduction', channel.introduction, 'status', channel.status,
    'review_version', channel.review_version
  );
$$;
revoke all on function private.lesson_instructor_channel_application_json(private.lesson_instructor_channels)
  from public, anon, authenticated, service_role;

create function public.get_my_lesson_instructor_channel()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select private.lesson_instructor_channel_application_json(channel)
  from private.lesson_instructor_channels channel
  join public.user_accounts account on account.id = channel.owner_id and account.account_status = 'active'
  where channel.owner_id = auth.uid();
$$;

create function public.apply_lesson_instructor_channel(
  p_channel_name text, p_instructor_name text, p_channel_url text, p_introduction text
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := private.require_active_lesson_video_bookmark_actor();
  v_id uuid;
begin
  insert into private.lesson_instructor_channels as channel
    (owner_id, channel_name, instructor_name, channel_url, introduction)
  values (v_actor, btrim(p_channel_name), btrim(p_instructor_name), btrim(p_channel_url), btrim(p_introduction))
  on conflict (owner_id) do update set
    channel_name = excluded.channel_name, instructor_name = excluded.instructor_name,
    channel_url = excluded.channel_url, introduction = excluded.introduction,
    status = 'pending', review_version = channel.review_version + 1, reviewed_at = null, reviewed_by = null
  where channel.status in ('pending', 'rejected')
  returning id into v_id;
  if v_id is null then
    raise exception '이미 개설된 채널입니다.' using errcode = 'PT409';
  end if;
  return v_id;
end;
$$;

create function public.list_lesson_instructor_channel_applications(p_offset integer default 0)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_lesson_directory_manager();
  return coalesce((
    select jsonb_agg(
      private.lesson_instructor_channel_application_json(channel)
      || jsonb_build_object('existing_instructors', coalesce(candidates.items, '[]'::jsonb))
      order by (channel.status = 'pending') desc, channel.created_at desc, channel.id
    )
    from (
      select * from private.lesson_instructor_channels
      order by (status = 'pending') desc, created_at desc, id
      limit 25 offset greatest(p_offset, 0)
    ) channel
    left join lateral (
      select jsonb_agg(jsonb_build_object(
        'id', instructor.id, 'channel_name', instructor.channel_name,
        'instructor_name', instructor.instructor_name,
        'linked_to_other', exists (
          select 1 from private.lesson_instructor_channels linked
          where linked.instructor_id = instructor.id and linked.id <> channel.id
        ),
        'videos', coalesce((
          select jsonb_agg(jsonb_build_object(
            'video_key', video.video_key, 'title', video.title, 'youtube_channel_url', video.youtube_channel_url
          ) order by video.created_at desc, video.video_key)
          from public.lesson_videos video where video.instructor_id = instructor.id
        ), '[]'::jsonb)
      ) order by instructor.channel_name, instructor.id) as items
      from private.lesson_instructors instructor
      where channel.status = 'pending' and channel.instructor_id is null
        and instructor.instructor_name = channel.instructor_name
    ) candidates on true
  ), '[]'::jsonb);
end;
$$;

create function public.review_lesson_instructor_channel(
  p_id uuid, p_action text, p_expected jsonb, p_payment_confirmed boolean default false,
  p_existing_instructor_id uuid default null, p_confirm_new_instructor boolean default false
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := private.require_lesson_directory_manager();
  v_channel private.lesson_instructor_channels;
  v_instructor uuid;
  v_url_matches uuid[];
begin
  select * into v_channel from private.lesson_instructor_channels where id = p_id for update;
  if not found or p_expected is distinct from private.lesson_instructor_channel_application_json(v_channel) then
    raise exception '신청 내용이 변경됐습니다. 다시 조회해 주세요.'
      using errcode = 'PT409', detail = 'application_changed';
  end if;
  if p_action = 'activate' and v_channel.status in ('pending', 'paused') then
    if p_payment_confirmed is not true then
      raise exception '홍보비 결제를 확인해 주세요.' using errcode = 'PT409', detail = 'payment_required';
    end if;
    if not exists (select 1 from public.user_accounts where id = v_channel.owner_id and account_status = 'active') then
      raise exception '활성 회원의 채널만 공개할 수 있습니다.' using errcode = '42501';
    end if;

    v_instructor := v_channel.instructor_id;
    if v_instructor is not null then
      if p_existing_instructor_id is not null or p_confirm_new_instructor is true then
        raise exception '이미 연결된 교습가는 변경할 수 없습니다.'
          using errcode = 'PT409', detail = 'instructor_linked';
      end if;
    elsif p_existing_instructor_id is not null then
      if p_confirm_new_instructor is true then
        raise exception '기존 교습가 연결 여부를 다시 확인해 주세요.'
          using errcode = 'PT409', detail = 'channel_url_confirmation';
      end if;
      v_instructor := p_existing_instructor_id;
    else
      select array_agg(instructor.id) into v_url_matches
      from private.lesson_instructors instructor
      where instructor.instructor_name = v_channel.instructor_name
        and exists (
          select 1 from public.lesson_videos video
          where video.instructor_id = instructor.id
            and private.normalized_lesson_youtube_channel_path(video.youtube_channel_url)
              = private.normalized_lesson_youtube_channel_path(v_channel.channel_url)
        );

      if cardinality(v_url_matches) = 1 and p_confirm_new_instructor is not true then
        v_instructor := v_url_matches[1];
      elsif v_url_matches is not null or (
        p_confirm_new_instructor is not true and exists (
          select 1 from private.lesson_instructors instructor
          where instructor.instructor_name = v_channel.instructor_name
        )
      ) then
        raise exception '기존 교습가의 채널 주소와 소유를 확인한 뒤 연결 대상을 선택해 주세요.'
          using errcode = 'PT409', detail = 'channel_url_confirmation';
      else
        insert into private.lesson_instructors (channel_name, instructor_name)
        values (v_channel.channel_name, v_channel.instructor_name)
        on conflict (channel_name, instructor_name) do nothing
        returning id into v_instructor;
        if v_instructor is null then
          raise exception '같은 이름의 기존 교습가가 있습니다. 채널 주소와 연결 대상을 확인해 주세요.'
            using errcode = 'PT409', detail = 'channel_url_confirmation';
        end if;
      end if;
    end if;

    -- Serialize approvals for one instructor, including applications with different YouTube address forms.
    perform 1 from private.lesson_instructors instructor
    where instructor.id = v_instructor
      and (v_channel.instructor_id is not null or instructor.instructor_name = v_channel.instructor_name)
    for update;
    if not found then
      raise exception '기존 교습가 정보를 다시 확인해 주세요.'
        using errcode = 'PT409', detail = 'channel_url_confirmation';
    end if;
    if exists (
      select 1 from private.lesson_instructor_channels linked
      where linked.instructor_id = v_instructor and linked.id <> p_id
    ) then
      raise exception '다른 신청 계정에 이미 연결된 교습가입니다.'
        using errcode = 'PT409', detail = 'instructor_linked';
    end if;

    begin
      update private.lesson_instructor_channels
      set instructor_id = v_instructor, status = 'active', review_version = review_version + 1,
        reviewed_by = v_actor, reviewed_at = now()
      where id = p_id;
    exception when unique_violation then
      raise exception '다른 신청 계정에 이미 연결된 교습가입니다.'
        using errcode = 'PT409', detail = 'instructor_linked';
    end;
  elsif (p_action = 'reject' and v_channel.status = 'pending') or (p_action = 'pause' and v_channel.status = 'active') then
    update private.lesson_instructor_channels
    set status = case when p_action = 'reject' then 'rejected' else 'paused' end,
      review_version = review_version + 1, reviewed_by = v_actor, reviewed_at = now()
    where id = p_id;
  else
    raise exception '신청 상태를 다시 확인해 주세요.' using errcode = 'PT409', detail = 'invalid_status';
  end if;
end;
$$;

-- Keep the free video RPC contract and prevent the same owner from duplicating their exclusive entry.
alter function public.publish_shared_lesson_video(text, text, text, text) set schema private;
revoke all on function private.publish_shared_lesson_video(text, text, text, text)
  from public, anon, authenticated, service_role;

create function public.publish_shared_lesson_video(
  p_youtube_id text, p_category text, p_title text, p_channel_name text
)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := private.require_active_lesson_video_bookmark_actor();
begin
  if p_youtube_id ~ '^[A-Za-z0-9_-]{11}$' then
    perform pg_advisory_xact_lock(hashtextextended('lesson-video:' || p_youtube_id, 0));
  end if;
  if exists (
    select 1 from private.lesson_instructor_channels channel
    join private.lesson_instructor_exclusive_videos video on video.channel_id = channel.id
    where channel.owner_id = v_actor and video.youtube_id = p_youtube_id
  ) then
    raise exception '이미 등록된 YouTube 영상입니다.' using errcode = '23505';
  end if;
  return private.publish_shared_lesson_video(p_youtube_id, p_category, p_title, p_channel_name);
end;
$$;

create function public.publish_lesson_instructor_channel_video(
  p_youtube_id text, p_category text, p_title text, p_channel_name text, p_exclusive boolean
)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := private.require_active_lesson_video_bookmark_actor();
  v_channel uuid;
  v_instructor uuid;
begin
  select id, instructor_id into v_channel, v_instructor from private.lesson_instructor_channels
  where owner_id = v_actor and status = 'active' for share;
  if not found then
    raise exception '활성 교습가 채널만 영상을 등록할 수 있습니다.' using errcode = '42501';
  end if;
  if p_exclusive is null then
    raise exception '공개 범위를 선택해 주세요.' using errcode = '22023';
  end if;
  if not p_exclusive then
    return public.publish_shared_lesson_video(p_youtube_id, p_category, p_title, p_channel_name);
  end if;
  if p_youtube_id is null or p_youtube_id !~ '^[A-Za-z0-9_-]{11}$' then
    raise exception 'YouTube 영상 주소를 확인해 주세요.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('lesson-video:' || p_youtube_id, 0));
  if exists (
    select 1 from public.lesson_videos video
    where (video.instructor_id = v_instructor or (video.member_shared and video.created_by = v_actor))
      and (
        video.video_key = 'yt-' || p_youtube_id
        or substring(video.youtube_url from '^https://(?:www[.]|m[.])?youtube[.]com/watch[?](?:[^#]*&)?v=([A-Za-z0-9_-]{11})(?:[&#]|$)') = p_youtube_id
        or substring(video.youtube_url from '^https://(?:youtu[.]be/|(?:www[.]|m[.])?youtube[.]com/(?:shorts|live|embed)/)([A-Za-z0-9_-]{11})(?:[/?#]|$)') = p_youtube_id
      )
  ) then
    raise exception '이미 등록된 YouTube 영상입니다.' using errcode = '23505';
  end if;
  insert into private.lesson_instructor_exclusive_videos (youtube_id, channel_id, title, category)
  values (p_youtube_id, v_channel, btrim(p_title), p_category);
  return p_youtube_id;
end;
$$;

create function public.list_public_lesson_instructor_channels(p_offset integer default 0)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'instructor_id', channel.instructor_id, 'instructor_name', channel.instructor_name,
    'channel_name', channel.channel_name, 'introduction', channel.introduction
  ) order by channel.reviewed_at desc, channel.instructor_id), '[]'::jsonb)
  from (
    select * from private.active_lesson_instructor_channels
    order by reviewed_at desc, instructor_id
    limit 25 offset greatest(p_offset, 0)
  ) channel;
$$;

create function public.get_public_lesson_instructor_channel(
  p_instructor_id uuid, p_category text default null, p_video_offset integer default 0, p_post_offset integer default 0
)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'instructor_id', channel.instructor_id, 'instructor_name', channel.instructor_name,
    'channel_name', channel.channel_name, 'channel_url', channel.channel_url, 'introduction', channel.introduction,
    'is_owner', coalesce(channel.owner_id = auth.uid(), false),
    'can_write', exists (
      select 1 from private.lesson_instructor_bookmarks bookmark
      join public.user_accounts account on account.id = bookmark.user_id and account.account_status = 'active'
      where bookmark.user_id = auth.uid() and bookmark.instructor_id = channel.instructor_id
    ),
    'videos', coalesce((
      select jsonb_agg(to_jsonb(item) - 'created_at' order by item.created_at desc, item.key)
      from (
        select * from (
          select video.video_key as key, video.title, video.category, video.youtube_url, false as exclusive, video.created_at
          from public.lesson_videos video
          where video.publication_status = 'published'
            and (video.instructor_id = channel.instructor_id or (video.member_shared and video.created_by = channel.owner_id))
            and (p_category is null or video.category = p_category)
          union all
          select video.youtube_id, video.title, video.category, 'https://www.youtube.com/watch?v=' || video.youtube_id, true, video.created_at
          from private.lesson_instructor_exclusive_videos video
          where video.channel_id = channel.id and (p_category is null or video.category = p_category)
        ) videos
        order by created_at desc, key limit 25 offset greatest(p_video_offset, 0)
      ) item
    ), '[]'::jsonb),
    'posts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', post.id, 'kind', post.kind, 'body', post.body, 'reply', post.reply, 'created_at', post.created_at
      ) order by (post.kind = 'notice') desc, post.created_at desc, post.id)
      from (
        select id, kind, body, reply, created_at
        from private.lesson_instructor_channel_posts
        where channel_id = channel.id
        order by (kind = 'notice') desc, created_at desc, id limit 21 offset greatest(p_post_offset, 0)
      ) post
    ), '[]'::jsonb)
  )
  from private.active_lesson_instructor_channels channel
  where channel.instructor_id = p_instructor_id;
$$;

create function public.mutate_lesson_instructor_channel_board(
  p_instructor_id uuid, p_post_id uuid, p_action text, p_body text
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := private.require_active_lesson_video_bookmark_actor();
  v_channel private.lesson_instructor_channels;
  v_body text := btrim(p_body);
begin
  select * into v_channel from private.lesson_instructor_channels
  where instructor_id = p_instructor_id and status = 'active' for share;
  if not found or not exists (
    select 1 from public.user_accounts where id = v_channel.owner_id and account_status = 'active'
  ) then
    raise exception '공개 교습가 채널을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  if p_action = 'question' then
    perform 1 from private.lesson_instructor_bookmarks
    where user_id = v_actor and instructor_id = p_instructor_id for share;
    if not found then
      raise exception '이 교습가를 관심 저장한 회원만 글을 쓸 수 있습니다.' using errcode = '42501';
    end if;
  elsif p_action not in ('notice', 'reply') or p_action is null or v_channel.owner_id <> v_actor then
    raise exception '해당 교습가만 공지와 답변을 작성할 수 있습니다.' using errcode = '42501';
  end if;

  if p_post_id is null or v_body is null or char_length(v_body) not between 2 and 2000 then
    raise exception '글 내용을 2~2,000자로 입력해 주세요.' using errcode = '22023';
  end if;
  if p_action = 'reply' then
    update private.lesson_instructor_channel_posts set reply = v_body
    where id = p_post_id and channel_id = v_channel.id and kind = 'question';
    if not found then
      raise exception '이 채널의 질문을 찾을 수 없습니다.' using errcode = 'P0002';
    end if;
  else
    insert into private.lesson_instructor_channel_posts (id, channel_id, author_id, kind, body)
    values (p_post_id, v_channel.id, v_actor, p_action, v_body)
    on conflict (id) do nothing;
    if not found and not exists (
      select 1 from private.lesson_instructor_channel_posts
      where id = p_post_id and channel_id = v_channel.id and author_id = v_actor and kind = p_action and body = v_body
    ) then
      raise exception '다른 글의 요청 번호입니다.' using errcode = 'PT409';
    end if;
  end if;
end;
$$;

create or replace function private.public_lesson_video_json(p_video public.lesson_videos)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'video_key', p_video.video_key, 'title', p_video.title, 'category', p_video.category,
    'channel_name', coalesce(instructor.channel_name, p_video.channel_name),
    'instructor_name', coalesce(instructor.instructor_name, p_video.instructor_name),
    'level', p_video.level, 'duration_text', p_video.duration_text, 'description', p_video.description,
    'youtube_url', p_video.youtube_url, 'youtube_channel_url', p_video.youtube_channel_url,
    'thumbnail_type', p_video.thumbnail_type, 'tags', p_video.tags, 'is_featured', p_video.is_featured
  ) || case when coalesce(instructor.id, channel.instructor_id) is null then '{}'::jsonb
       else jsonb_build_object('instructor_id', coalesce(instructor.id, channel.instructor_id)) end
  from (select 1) as input
  left join private.lesson_instructors instructor on instructor.id = p_video.instructor_id
  left join private.active_lesson_instructor_channels channel
    on p_video.member_shared and channel.owner_id = p_video.created_by;
$$;

create or replace function public.set_lesson_instructor_bookmark(p_instructor_id uuid, p_saved boolean)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := private.require_active_lesson_video_bookmark_actor();
begin
  if p_saved is null or p_instructor_id is null then
    raise exception '관심 교습가 정보를 확인해 주세요.';
  end if;
  if p_saved then
    if not exists (select 1 from private.active_lesson_instructor_channels where instructor_id = p_instructor_id) then
      perform 1 from public.lesson_videos as video
      where video.instructor_id = p_instructor_id and video.publication_status = 'published'
      limit 1 for share;
      if not found then
        raise exception '공개된 교습가를 찾을 수 없습니다.';
      end if;
    end if;
    insert into private.lesson_instructor_bookmarks (user_id, instructor_id)
    values (v_actor, p_instructor_id) on conflict (user_id, instructor_id) do nothing;
  else
    delete from private.lesson_instructor_bookmarks where user_id = v_actor and instructor_id = p_instructor_id;
  end if;
  return p_saved;
end;
$$;

revoke all on function public.get_my_lesson_instructor_channel(),
  public.apply_lesson_instructor_channel(text, text, text, text),
  public.list_lesson_instructor_channel_applications(integer),
  public.review_lesson_instructor_channel(uuid, text, jsonb, boolean, uuid, boolean),
  public.publish_shared_lesson_video(text, text, text, text),
  public.publish_lesson_instructor_channel_video(text, text, text, text, boolean),
  public.list_public_lesson_instructor_channels(integer),
  public.get_public_lesson_instructor_channel(uuid, text, integer, integer),
  public.mutate_lesson_instructor_channel_board(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;

grant execute on function public.get_my_lesson_instructor_channel(),
  public.apply_lesson_instructor_channel(text, text, text, text),
  public.list_lesson_instructor_channel_applications(integer),
  public.review_lesson_instructor_channel(uuid, text, jsonb, boolean, uuid, boolean),
  public.publish_shared_lesson_video(text, text, text, text),
  public.publish_lesson_instructor_channel_video(text, text, text, text, boolean),
  public.mutate_lesson_instructor_channel_board(uuid, uuid, text, text) to authenticated;

grant execute on function public.list_public_lesson_instructor_channels(integer),
  public.get_public_lesson_instructor_channel(uuid, text, integer, integer) to anon, authenticated;

-- Editing keeps using the actual curated linkage rather than the member's promotional channel.
create or replace function public.get_lesson_video_for_management(p_video_key text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_lesson_directory_manager();
  return (
    select jsonb_build_object(
      'video', case when video.instructor_id is null then private.public_lesson_video_json(video) - 'instructor_id'
        else private.public_lesson_video_json(video) end,
      'version', video.version, 'publication_status', video.publication_status
    )
    from public.lesson_videos video where video.video_key = p_video_key
  );
end;
$$;
