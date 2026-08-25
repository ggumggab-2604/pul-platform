-- PUL 9-1A: keep bookmark reads compatible with PostgREST read-only transactions.

create function private.require_active_lesson_video_bookmark_reader()
returns uuid
language plpgsql
stable
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
    and account.account_status = 'active';

  if not found then
    raise exception '정상 계정에서만 관심 영상을 이용할 수 있습니다.';
  end if;

  return v_actor_id;
end;
$$;

comment on function private.require_active_lesson_video_bookmark_reader() is
  'Returns auth.uid() after a lock-free active-account check suitable for read-only bookmark transactions.';

revoke all on function private.require_active_lesson_video_bookmark_reader()
  from public, anon, authenticated, service_role;

comment on function private.require_active_lesson_video_bookmark_actor() is
  'Returns auth.uid() only after locking and verifying the active user account for bookmark mutations.';

create or replace function public.list_my_lesson_video_bookmarks(
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
  v_actor_id := private.require_active_lesson_video_bookmark_reader();

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
