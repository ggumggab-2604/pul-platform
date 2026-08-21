create table public.lesson_video_bookmarks (
  user_id uuid not null
    references public.user_accounts (id) on delete cascade,
  lesson_video_id uuid not null
    references public.lesson_videos (id) on delete cascade,
  created_at timestamptz not null default pg_catalog.now(),
  constraint lesson_video_bookmarks_pkey primary key (user_id, lesson_video_id)
);

comment on table public.lesson_video_bookmarks is
  'Private per-member bookmarks for published external YouTube lesson videos.';

create index lesson_video_bookmarks_user_created_idx
  on public.lesson_video_bookmarks (user_id, created_at desc, lesson_video_id);

alter table public.lesson_video_bookmarks enable row level security;
alter table public.lesson_video_bookmarks force row level security;

revoke all on table public.lesson_video_bookmarks
  from public, anon, authenticated, service_role;

create function private.require_active_lesson_video_bookmark_actor()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  perform 1
  from public.user_accounts as account
  where account.id = v_actor_id
    and account.account_status = 'active'
  for share;

  if not found then
    raise exception '정상 계정에서만 관심 영상을 이용할 수 있습니다.';
  end if;

  return v_actor_id;
end;
$$;

comment on function private.require_active_lesson_video_bookmark_actor() is
  'Returns auth.uid() only after locking and verifying the active user account for bookmark reads and mutations.';

revoke all on function private.require_active_lesson_video_bookmark_actor()
  from public, anon, authenticated, service_role;

create function public.set_lesson_video_bookmark(
  p_video_key text,
  p_saved boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_video_id uuid;
  v_publication_status text;
  v_video_key text := nullif(pg_catalog.btrim(p_video_key), '');
begin
  v_actor_id := private.require_active_lesson_video_bookmark_actor();

  if v_video_key is null
     or v_video_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' then
    raise exception '무료 강의 영상 정보를 확인해 주세요.';
  end if;
  if p_saved is null then
    raise exception '관심 영상 저장 상태를 확인해 주세요.';
  end if;

  select video.id, video.publication_status
  into v_video_id, v_publication_status
  from public.lesson_videos as video
  where video.video_key = v_video_key
  for share;

  if not found then
    raise exception '무료 강의 영상을 찾을 수 없습니다.';
  end if;

  if p_saved then
    if v_publication_status <> 'published' then
      raise exception '현재 공개 중인 무료 강의 영상만 저장할 수 있습니다.';
    end if;

    insert into public.lesson_video_bookmarks (user_id, lesson_video_id)
    values (v_actor_id, v_video_id)
    on conflict (user_id, lesson_video_id) do nothing;
  else
    delete from public.lesson_video_bookmarks as bookmark
    where bookmark.user_id = v_actor_id
      and bookmark.lesson_video_id = v_video_id;
  end if;

  return pg_catalog.jsonb_build_object(
    'video_key', v_video_key,
    'saved', p_saved
  );
end;
$$;

comment on function public.set_lesson_video_bookmark(text, boolean) is
  'Idempotently saves or removes the active authenticated member bookmark identified by public video_key.';

revoke all on function public.set_lesson_video_bookmark(text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.set_lesson_video_bookmark(text, boolean)
  to authenticated;

create function public.list_my_lesson_video_bookmarks(
  p_video_keys text[] default null,
  p_category text default null,
  p_limit integer default 24,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_total integer;
  v_items jsonb;
begin
  v_actor_id := private.require_active_lesson_video_bookmark_actor();

  if p_category is not null and p_category not in (
    'beginner_intro', 'basic_stance', 'swing', 'tee_shot', 'putting', 'approach',
    'distance_control', 'direction', 'rules_manner', 'practical_strategy', 'equipment',
    'club_reservation', 'tournament_prep', 'cert_referee', 'other'
  ) then
    raise exception '영상 카테고리를 확인해 주세요.';
  end if;
  if p_limit not between 1 and 50 or p_offset < 0 then
    raise exception '페이지 범위를 확인해 주세요.';
  end if;
  if p_video_keys is not null and pg_catalog.cardinality(p_video_keys) > 50 then
    raise exception '한 번에 확인할 영상 수를 줄여 주세요.';
  end if;
  if p_video_keys is not null and exists (
    select 1
    from pg_catalog.unnest(p_video_keys) as supplied(video_key)
    where supplied.video_key is null
       or supplied.video_key <> pg_catalog.btrim(supplied.video_key)
       or supplied.video_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'
  ) then
    raise exception '무료 강의 영상 정보를 확인해 주세요.';
  end if;

  select pg_catalog.count(*)::integer
  into v_total
  from public.lesson_video_bookmarks as bookmark
  join public.lesson_videos as video on video.id = bookmark.lesson_video_id
  where bookmark.user_id = v_actor_id
    and video.publication_status = 'published'
    and (p_category is null or video.category = p_category)
    and (p_video_keys is null or video.video_key = any (p_video_keys));

  with page as (
    select bookmark.lesson_video_id, bookmark.created_at
    from public.lesson_video_bookmarks as bookmark
    join public.lesson_videos as video on video.id = bookmark.lesson_video_id
    where bookmark.user_id = v_actor_id
      and video.publication_status = 'published'
      and (p_category is null or video.category = p_category)
      and (p_video_keys is null or video.video_key = any (p_video_keys))
    order by bookmark.created_at desc, video.video_key
    limit p_limit
    offset p_offset
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      private.public_lesson_video_json(video)
      order by page.created_at desc, video.video_key
    ),
    '[]'::jsonb
  )
  into v_items
  from page
  join public.lesson_videos as video on video.id = page.lesson_video_id;

  return pg_catalog.jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', p_offset + pg_catalog.jsonb_array_length(v_items) < v_total
  );
end;
$$;

comment on function public.list_my_lesson_video_bookmarks(text[], text, integer, integer) is
  'Bounded own-only published lesson-video bookmarks, optionally intersected with current page video keys and category.';

revoke all on function public.list_my_lesson_video_bookmarks(text[], text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_my_lesson_video_bookmarks(text[], text, integer, integer)
  to authenticated;
