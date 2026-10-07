-- Local candidate only. Requires the existing beta interest lineage through 20261020000109.
-- No course seed rows, existing IDs, legacy region/city/address, or old RPCs are changed.
begin;
create function private.course_address_region(p_address text) returns jsonb
language plpgsql immutable set search_path='' as $$
declare parts text[]; province text; district text;
begin
 parts := regexp_split_to_array(btrim(p_address), '\s+');
 province := ('{"서울": "서울", "서울특별시": "서울", "부산": "부산", "부산광역시": "부산", "대구": "대구", "대구광역시": "대구", "인천": "인천", "인천광역시": "인천", "광주": "광주", "광주광역시": "광주", "대전": "대전", "대전광역시": "대전", "울산": "울산", "울산광역시": "울산", "세종": "세종", "세종특별자치시": "세종", "경기": "경기", "경기도": "경기", "강원": "강원", "강원도": "강원", "강원특별자치도": "강원", "충북": "충북", "충청북도": "충북", "충남": "충남", "충청남도": "충남", "전북": "전북", "전라북도": "전북", "전북특별자치도": "전북", "전남": "전남", "전라남도": "전남", "경북": "경북", "경상북도": "경북", "경남": "경남", "경상남도": "경남", "제주": "제주", "제주도": "제주", "제주특별자치도": "제주"}'::jsonb)->>parts[1];
 if province is not null and parts[2] ~ '^[가-힣]+[시군구]$' then
  district := parts[2];
  if parts[2] ~ '시$' and parts[3] ~ '^[가-힣]+구$' then district := district || ' ' || parts[3]; end if;
 end if;
 return jsonb_build_object('province',province,'district',district);
end $$;
revoke all on function private.course_address_region(text) from public,anon,authenticated,service_role;
create function public.list_public_courses_v2(
  p_province text default null,
  p_district text default null,
  p_keyword text default null,
  p_course_type text default null,
  p_region text default null,
  p_operation_code text default null,
  p_holes text default null,
  p_feature_codes text[] default null,
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
  v_keyword text := nullif(pg_catalog.btrim(p_keyword), '');
  v_total integer;
  v_items jsonb;
begin
  if p_province is not null and p_province not in ('서울','부산','대구','인천','광주','대전','울산','세종','경기','강원','충북','충남','전북','전남','경북','경남','제주') then raise exception '시·도를 확인해 주세요.'; end if;
  if p_district is not null and (p_province is null or char_length(p_district)>40 or p_district !~ '^[가-힣]+[시군구]( [가-힣]+구)?$') then raise exception '시·군·구를 확인해 주세요.'; end if;
  if v_keyword is not null and pg_catalog.char_length(v_keyword) > 100 then
    raise exception '검색어는 100자 이내로 입력해 주세요.';
  end if;
  if p_course_type is not null and p_course_type not in ('field', 'screen') then
    raise exception '골프장 유형을 확인해 주세요.';
  end if;
  if p_region is not null
     and p_region not in ('서울', '경기', '인천', '충청', '강원', '전라', '경상', '제주') then
    raise exception '지역을 확인해 주세요.';
  end if;
  if p_operation_code is not null
     and p_operation_code not in ('reservation', 'phone', 'walkIn') then
    raise exception '운영 방식을 확인해 주세요.';
  end if;
  if p_course_type = 'field' and p_holes is not null and p_holes not in ('9', '18', '27_plus') then
    raise exception '홀 수 조건을 확인해 주세요.';
  end if;
  if p_feature_codes is not null
     and not p_feature_codes <@ array[
       'club_available',
       'event_history',
       'lesson_available',
       'equipment_rental',
       'parking'
     ]::text[] then
    raise exception '부가 정보 조건을 확인해 주세요.';
  end if;
  if p_limit is null or p_offset is null or p_limit not between 1 and 50 or p_offset < 0 then
    raise exception '페이지 범위를 확인해 주세요.';
  end if;

  with matching as (
    select course.*
    from public.courses as course
    where course.course_status = 'active'
      and (p_course_type is null or course.course_type = p_course_type)
      and (p_province is null or private.course_address_region(course.address)->>'province' = p_province)
      and (p_district is null or private.course_address_region(course.address)->>'district' = p_district)
      and (p_region is null or course.region = p_region)
      and (p_operation_code is null or course.operation_code = p_operation_code)
      and (
        p_course_type is distinct from 'field' or p_holes is null
        or (p_holes = '9' and course.holes = 9)
        or (p_holes = '18' and course.holes = 18)
        or (p_holes = '27_plus' and course.holes >= 27)
      )
      and (
        p_feature_codes is null
        or (
          (not ('parking' = any(p_feature_codes)) or course.parking_available is true)
          and (
            array_remove(p_feature_codes, 'parking') = '{}'::text[]
            or course.feature_codes @> array_remove(p_feature_codes, 'parking')
          )
        )
      )
      and (
        v_keyword is null
        or pg_catalog.strpos(
          pg_catalog.lower(
            course.name || ' ' || course.region || ' ' || course.city || ' ' || course.address
          ),
          pg_catalog.lower(v_keyword)
        ) > 0
      )
  ), page as (
    select matching.*
    from matching
    order by matching.name, matching.course_key
    limit p_limit
    offset p_offset
  )
  select
    (select count(*)::integer from matching),
    coalesce(
      (
        select jsonb_agg(
          private.public_course_json(page)
          order by page.name, page.course_key
        )
        from page
      ),
      '[]'::jsonb
    )
  into v_total, v_items;

  return jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', p_offset + p_limit < v_total
  );
end;
$$;

revoke all on function public.list_public_courses_v2(text, text, text, text, text, text, text, text[], integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_public_courses_v2(text, text, text, text, text, text, text, text[], integer, integer)
  to anon, authenticated;


create function public.list_public_course_regions() returns jsonb
language sql stable security definer set search_path='' as $$
 with locations as (
  select private.course_address_region(address) r from public.courses where course_status='active'
 ), grouped as (
  select r->>'province' province, coalesce(jsonb_agg(distinct r->>'district' order by r->>'district') filter(where r->>'district' is not null),'[]'::jsonb) districts
  from locations where r->>'province' is not null group by r->>'province'
 ) select coalesce(jsonb_agg(jsonb_build_object('province',province,'districts',districts) order by province),'[]'::jsonb) from grouped;
$$;
revoke all on function public.list_public_course_regions() from public,anon,authenticated,service_role;
grant execute on function public.list_public_course_regions() to anon,authenticated;

create table public.course_bookmarks (
 user_id uuid not null references public.user_accounts(id) on delete cascade,
 course_id uuid not null references public.courses(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(user_id,course_id)
);
create index course_bookmarks_page_idx on public.course_bookmarks(user_id,created_at desc,course_id);
alter table public.course_bookmarks enable row level security;
alter table public.course_bookmarks force row level security;
revoke all on table public.course_bookmarks from public,anon,authenticated,service_role;

create function private.set_course_interest(p_course_key text,p_saved boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; target public.courses;
begin
 actor := private.require_active_lesson_video_bookmark_actor();
 if p_course_key is null or p_course_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' or p_saved is null then raise exception '관심 구장을 확인해 주세요.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text || ':course:' || p_course_key,0));
 select * into target from public.courses where course_key=p_course_key for share;
 if p_saved then
  if target.id is null or target.course_status <> 'active' then raise exception '현재 저장할 수 없는 구장입니다.'; end if;
  insert into public.course_bookmarks(user_id,course_id) values(actor,target.id) on conflict(user_id,course_id) do nothing;
 else
  delete from public.course_bookmarks where user_id=actor and course_id=target.id;
 end if;
 return jsonb_build_object('id',p_course_key,'saved',p_saved);
end $$;
create function public.set_course_interest(p_course_key text,p_saved boolean) returns jsonb
language sql security invoker set search_path='' as $$ select private.set_course_interest(p_course_key,p_saved); $$;
create function private.course_interest_state(p_course_key text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare actor uuid;
begin
 actor := private.require_active_lesson_video_bookmark_reader();
 return exists(select 1 from public.course_bookmarks b join public.courses c on c.id=b.course_id where b.user_id=actor and c.course_key=p_course_key);
end $$;
create function public.course_interest_state(p_course_key text) returns boolean
language sql stable security invoker set search_path='' as $$ select private.course_interest_state(p_course_key); $$;
revoke all on function private.set_course_interest(text,boolean),public.set_course_interest(text,boolean),private.course_interest_state(text),public.course_interest_state(text) from public,anon,authenticated,service_role;
grant execute on function private.set_course_interest(text,boolean),public.set_course_interest(text,boolean),private.course_interest_state(text),public.course_interest_state(text) to authenticated;
create function private.list_my_interests_v6(p_kind text,p_limit integer,p_offset integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid; v_items jsonb; v_total integer;
begin
 v_actor:=private.require_active_lesson_video_bookmark_reader();
 if p_kind is null or p_kind not in ('all','market','lesson_video','vendor','startup_question','store','course')
    or p_limit is null or p_limit not between 1 and 24 or p_offset is null or p_offset<0 or p_offset>10000 then
   raise exception '관심목록 조회 범위를 확인해 주세요.';
 end if;
 select count(*)::integer into v_total from (
  select 1 from public.market_listing_bookmarks where user_id=v_actor and p_kind in ('all','market')
  union all select 1 from public.market_buy_request_bookmarks where user_id=v_actor and p_kind in ('all','market')
  union all select 1 from public.market_vendor_bookmarks where user_id=v_actor and p_kind in ('all','market','vendor')
  union all select 1 from public.startup_qa_bookmarks where user_id=v_actor and p_kind in ('all','market','startup_question')
  union all select 1 from public.market_store_bookmarks where user_id=v_actor and p_kind in ('all','market','store')
  union all select 1 from public.lesson_video_bookmarks where user_id=v_actor and p_kind in ('all','lesson_video')
  union all select 1 from public.course_bookmarks where user_id=v_actor and p_kind in ('all','course')
 ) q;
 with saved as (
  select 'market'::text kind,listing_id id,created_at from public.market_listing_bookmarks
   where user_id=v_actor and p_kind in ('all','market')
  union all
  select 'buy_request',buy_request_id,created_at from public.market_buy_request_bookmarks where user_id=v_actor and p_kind in ('all','market')
  union all
  select 'vendor',vendor_id,created_at from public.market_vendor_bookmarks where user_id=v_actor and p_kind in ('all','market','vendor')
  union all
  select 'startup_question',question_id,created_at from public.startup_qa_bookmarks where user_id=v_actor and p_kind in ('all','market','startup_question')
  union all
  select 'store',store_id,created_at from public.market_store_bookmarks where user_id=v_actor and p_kind in ('all','market','store')
  union all
  select 'lesson_video',lesson_video_id,created_at from public.lesson_video_bookmarks
   where user_id=v_actor and p_kind in ('all','lesson_video')
  union all select 'course',course_id,created_at from public.course_bookmarks where user_id=v_actor and p_kind in ('all','course')
 ), page as (
  select * from saved order by created_at desc,kind,id limit p_limit offset p_offset
 ), resolved as (
  select page.*,case when kind='store' then private.get_market_store(page.id) end store,case when kind='startup_question' then (select private.startup_qa_question_json(q) from public.startup_qa_questions q where q.id=page.id) end question,
   case when kind='vendor' then public.get_market_vendor(page.id) end vendor,
   case when kind='market' then public.get_market_listing(page.id) end market,
   case when kind='buy_request' then public.get_market_buy_request_v3(page.id) end wanted,
   case when kind='lesson_video' and v.publication_status='published'
    then private.public_lesson_video_json(v) end video,
   v.video_key, c.course_key, case when kind='course' and c.course_status='active' then private.public_course_json(c) end course
  from page left join public.lesson_videos v on kind='lesson_video' and v.id=page.id
  left join public.courses c on kind='course' and c.id=page.id
 )
 select coalesce(jsonb_agg(jsonb_build_object(
   'kind',kind,'id',case when kind='course' then course_key when kind in ('market','buy_request','vendor','startup_question','store') then id::text else video_key end,
   'saved_at',created_at,'available',case when kind='course' then course is not null when kind='store' then store is not null when kind='startup_question' then question is not null when kind='vendor' then vendor is not null when kind='market' then market is not null when kind='buy_request' then wanted is not null else video is not null end,
   'title',case when kind='course' then course->>'name' when kind='store' then store->'profile'->>'title' when kind='startup_question' then question->>'title' when kind='vendor' then vendor->'profile'->>'name' when kind='market' then market->>'name' when kind='buy_request' then wanted->>'title' else video->>'title' end,
   'store_photo',case when kind='store' then store->'profile'->'photos'->>0 end,
   'image_path',case when kind='market' then market->'image_paths'->>0 when kind='buy_request' then wanted->'image_paths'->>0 end,
   'price',case when kind='store' then store->'profile'->'askingPrice' when kind='market' then market->'price' when kind='buy_request' then wanted->'budget' end,
   'region',case when kind='course' then course->>'region' when kind='store' then store->'profile'->>'region' when kind='vendor' then vendor->'profile'->>'region' when kind='market' then market->>'region' when kind='buy_request' then wanted->>'region' end,
   'status',case when kind='store' then store->>'status' when kind='market' then market->>'sale_status' when kind='buy_request' then wanted->>'request_status' end,
   'url',case when kind='lesson_video' then video->>'youtube_url' end,
   'request_type',case when kind='buy_request' then wanted->>'request_type' end,
   'summary',case when kind='course' then course->>'address' when kind='store' then case store->>'status' when 'selling' then '매매 중' when 'negotiating' then '협의 중' else '거래 완료' end when kind='startup_question' then question->>'author' when kind='vendor' then vendor->'profile'->>'summary' when kind='lesson_video' then (video->>'channel_name') || ' · ' || (video->>'duration_text') end
 ) order by created_at desc,kind,id),'[]'::jsonb) into v_items from resolved;
 return jsonb_build_object('items',v_items,'has_more',p_offset+jsonb_array_length(v_items)<v_total);
end $$;
create function public.list_my_interests_v6(p_kind text,p_limit integer,p_offset integer) returns jsonb language sql stable security invoker set search_path='' as $$ select private.list_my_interests_v6(p_kind,p_limit,p_offset); $$;
revoke all on function private.list_my_interests_v6(text,integer,integer),public.list_my_interests_v6(text,integer,integer) from public,anon,authenticated,service_role;
grant execute on function private.list_my_interests_v6(text,integer,integer),public.list_my_interests_v6(text,integer,integer) to authenticated;
commit;
