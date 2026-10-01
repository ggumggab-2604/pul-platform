-- AM: private interests; preserves existing lesson bookmarks, no data migration.
create table public.market_listing_bookmarks (
  user_id uuid not null references public.user_accounts(id) on delete cascade,
  listing_id uuid not null references public.market_listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);
create index market_listing_bookmarks_page_idx on public.market_listing_bookmarks(user_id, created_at desc, listing_id);
alter table public.market_listing_bookmarks enable row level security;
alter table public.market_listing_bookmarks force row level security;
revoke all on public.market_listing_bookmarks from public, anon, authenticated, service_role;
-- Keep private tables inaccessible. Only the checked RPCs below can read/write them.
create function private.set_market_interest(p_listing_id uuid, p_saved boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid; v_listing public.market_listings;
begin
  v_actor := private.require_active_lesson_video_bookmark_actor();
  if p_listing_id is null or p_saved is null then raise exception '관심상품 요청을 확인해 주세요.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor::text || ':' || p_listing_id::text,0));
  if p_saved then
    select * into v_listing from public.market_listings where id=p_listing_id for share;
    if v_listing.id is null or public.get_market_listing(p_listing_id) is null then
      raise exception '현재 저장할 수 없는 상품입니다.';
    end if;
    if v_listing.seller_user_id=v_actor then raise exception '내 상품은 관심목록에 저장할 수 없습니다.'; end if;
    insert into public.market_listing_bookmarks(user_id,listing_id) values(v_actor,p_listing_id)
      on conflict(user_id,listing_id) do nothing;
  else
    -- Unsave remains possible after the target becomes unavailable.
    delete from public.market_listing_bookmarks where user_id=v_actor and listing_id=p_listing_id;
  end if;
  return pg_catalog.jsonb_build_object('id',p_listing_id,'saved',p_saved);
end $$;
create function public.set_market_interest(p_listing_id uuid,p_saved boolean)
returns jsonb language sql security invoker set search_path='' as $$
 select private.set_market_interest(p_listing_id,p_saved);
$$;
create function private.market_interest_state(p_listing_id uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid;
begin
 v_actor:=private.require_active_lesson_video_bookmark_reader();
 return exists(select 1 from public.market_listing_bookmarks where user_id=v_actor and listing_id=p_listing_id);
end $$;
create function public.market_interest_state(p_listing_id uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select private.market_interest_state(p_listing_id);
$$;
create function private.list_my_interests(p_kind text,p_limit integer,p_offset integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid; v_items jsonb; v_total integer;
begin
 v_actor:=private.require_active_lesson_video_bookmark_reader();
 if p_kind is null or p_kind not in ('all','market','lesson_video')
    or p_limit is null or p_limit not between 1 and 24 or p_offset is null or p_offset<0 or p_offset>10000 then
   raise exception '관심목록 조회 범위를 확인해 주세요.';
 end if;
 select count(*)::integer into v_total from (
  select 1 from public.market_listing_bookmarks where user_id=v_actor and p_kind in ('all','market')
  union all select 1 from public.lesson_video_bookmarks where user_id=v_actor and p_kind in ('all','lesson_video')
 ) q;
 with saved as (
  select 'market'::text kind,listing_id id,created_at from public.market_listing_bookmarks
   where user_id=v_actor and p_kind in ('all','market')
  union all
  select 'lesson_video',lesson_video_id,created_at from public.lesson_video_bookmarks
   where user_id=v_actor and p_kind in ('all','lesson_video')
 ), page as (
  select * from saved order by created_at desc,kind,id limit p_limit offset p_offset
 ), resolved as (
  select page.*,case when kind='market' then public.get_market_listing(page.id) end market,
   case when kind='lesson_video' and v.publication_status='published'
    then private.public_lesson_video_json(v) end video,
   v.video_key
  from page left join public.lesson_videos v on kind='lesson_video' and v.id=page.id
 )
 select coalesce(jsonb_agg(jsonb_build_object(
   'kind',kind,'id',case when kind='market' then id::text else video_key end,
   'saved_at',created_at,'available',case when kind='market' then market is not null else video is not null end,
   'title',case when kind='market' then market->>'name' else video->>'title' end,
   'image_path',case when kind='market' then market->'image_paths'->>0 end,
   'price',case when kind='market' then market->'price' end,
   'region',case when kind='market' then market->>'region' end,
   'status',case when kind='market' then market->>'sale_status' end,
   'url',case when kind='lesson_video' then video->>'youtube_url' end,
   'summary',case when kind='lesson_video' then (video->>'channel_name') || ' · ' || (video->>'duration_text') end
 ) order by created_at desc,kind,id),'[]'::jsonb) into v_items from resolved;
 return jsonb_build_object('items',v_items,'has_more',p_offset+jsonb_array_length(v_items)<v_total);
end $$;
create function public.list_my_interests(p_kind text default 'all',p_limit integer default 12,p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path='' as $$
 select private.list_my_interests(p_kind,p_limit,p_offset);
$$;
revoke all on function private.set_market_interest(uuid,boolean),private.market_interest_state(uuid),private.list_my_interests(text,integer,integer),
 public.set_market_interest(uuid,boolean),public.market_interest_state(uuid),public.list_my_interests(text,integer,integer)
 from public,anon,authenticated,service_role;
grant usage on schema private to authenticated;
grant execute on function private.set_market_interest(uuid,boolean),private.market_interest_state(uuid),private.list_my_interests(text,integer,integer),
 public.set_market_interest(uuid,boolean),public.market_interest_state(uuid),public.list_my_interests(text,integer,integer) to authenticated;
