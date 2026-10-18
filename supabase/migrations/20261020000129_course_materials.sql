-- Course materials only. Existing 125 migrations remain unchanged.
begin;
create table private.course_resource_bookmarks (
 user_id uuid not null references public.user_accounts(id) on delete cascade,
 resource_id uuid not null references private.course_resources(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(user_id,resource_id)
);
create index course_resource_bookmarks_page_idx on private.course_resource_bookmarks(user_id,created_at desc,resource_id);
alter table private.course_resource_bookmarks enable row level security;
alter table private.course_resource_bookmarks force row level security;
revoke all on private.course_resource_bookmarks from public,anon,authenticated,service_role;

-- Same host/path/id contract as videoUrl(raw,true); no URL fetching.
create function private.course_material_youtube(p_url text) returns text language plpgsql immutable set search_path='' as $$
declare u text:=btrim(p_url); host text; path text; query text; id text;
begin
 if u is null or length(u)>1000 or u !~* '^https?://' or u ~ '[[:space:]\\]' then return null; end if;
 host:=lower(substring(u from '(?i)^https?://([^/?#]+)'));
 if host not in ('youtube.com','www.youtube.com','m.youtube.com','youtu.be') then return null;end if;
 path:=regexp_replace(u,'(?i)^https?://[^/?#]+','');
 if host='youtu.be' then id:=substring(path from '^/([A-Za-z0-9_-]{11})/?(?:[?#].*)?$');
 elsif path ~ '^/watch\?' then
  query:=split_part(split_part(path,'?',2),'#',1);
  -- First v parameter, matching URLSearchParams.get.
  select split_part(x,'=',2) into id from unnest(string_to_array(query,'&')) with ordinality a(x,n) where split_part(x,'=',1)='v' order by n limit 1;
 else id:=substring(path from '^/(?:shorts|live)/([A-Za-z0-9_-]{11})/?(?:[?#].*)?$');end if;
 if id ~ '^[A-Za-z0-9_-]{11}$' then return 'https://www.youtube.com/watch?v='||id;end if;return null;
end $$;
revoke all on function private.course_material_youtube(text) from public,anon,authenticated,service_role;

create function public.set_course_resource_interest(p_resource_id uuid,p_saved boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=private.require_active_lesson_video_bookmark_actor(); r private.course_resources%rowtype; c public.courses%rowtype;
begin
 if p_resource_id is null or p_saved is null then raise exception '자료 관심 상태를 확인해 주세요.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(a::text||':resource:'||p_resource_id::text,0));
 if p_saved then
  select * into r from private.course_resources where id=p_resource_id for share;
  select * into c from public.courses where id=r.course_id for share;
  if r.id is null or r.status<>'published' or c.course_status is distinct from 'active' then raise exception '현재 저장할 수 없는 자료입니다.' using errcode='P0002';end if;
  insert into private.course_resource_bookmarks(user_id,resource_id) values(a,p_resource_id) on conflict do nothing;
 else delete from private.course_resource_bookmarks where user_id=a and resource_id=p_resource_id;end if;
 return jsonb_build_object('id',p_resource_id,'saved',p_saved);
end $$;
revoke all on function public.set_course_resource_interest(uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.set_course_resource_interest(uuid,boolean) to authenticated;

create function public.course_resource_interest_states(p_ids uuid[]) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a uuid:=private.require_active_lesson_video_bookmark_reader(); result jsonb;
begin
 if p_ids is null or cardinality(p_ids) not between 1 and 24 or array_position(p_ids,null) is not null or cardinality(p_ids)<>(select count(distinct x) from unnest(p_ids)x) then raise exception '자료 조회 범위를 확인해 주세요.' using errcode='22023';end if;
 select coalesce(jsonb_object_agg(r.id,exists(select 1 from private.course_resource_bookmarks b where b.user_id=a and b.resource_id=r.id)),'{}') into result
 from private.course_resources r join public.courses c on c.id=r.course_id where r.id=any(p_ids) and ((r.status='published' and c.course_status='active') or exists(select 1 from private.course_resource_bookmarks b where b.user_id=a and b.resource_id=r.id));return result;
end $$;
revoke all on function public.course_resource_interest_states(uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.course_resource_interest_states(uuid[]) to authenticated;

-- Separate read contract leaves overview/featured ordering and old callers intact.
create function public.course_material_search(p_course_key text,p_kind text default null,p_query text default '',p_saved boolean default false,p_limit integer default 12,p_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.courses%rowtype;a uuid;items jsonb;total integer;q text:=btrim(coalesce(p_query,''));
begin
 select * into c from public.courses where course_key=p_course_key and course_status='active';if not found then raise exception '구장을 찾을 수 없습니다.' using errcode='P0002';end if;
 if p_kind is not null and p_kind not in ('video','yardage') or length(q)>200 or p_saved is null or p_limit is null or p_limit not between 1 and 24 or p_offset is null or p_offset not between 0 and 120000 then raise exception '자료 검색 조건을 확인해 주세요.' using errcode='22023';end if;
 if p_saved then a:=private.require_active_lesson_video_bookmark_reader();end if;
 with filtered as materialized (
  select r.* from private.course_resources r where r.course_id=c.id and r.status='published' and (p_kind is null or r.kind=p_kind)
  and (q='' or strpos(lower(r.title),lower(q))>0 or strpos(lower(r.description),lower(q))>0)
  and (not p_saved or exists(select 1 from private.course_resource_bookmarks b where b.user_id=a and b.resource_id=r.id))
 ), page as (select * from filtered order by created_at desc,id desc limit p_limit offset p_offset)
 select (select count(*) from filtered),coalesce(jsonb_agg(private.course_content_resource_json(page) order by created_at desc,id desc),'[]') into total,items from page;
 return jsonb_build_object('items',items,'total',total,'limit',p_limit,'offset',p_offset);
end $$;
revoke all on function public.course_material_search(text,text,text,boolean,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.course_material_search(text,text,text,boolean,integer,integer) to anon,authenticated;

CREATE OR REPLACE FUNCTION private.course_content_mutate(p_course_key text, p_action text, p_id uuid, p_version integer, p_request_id uuid, p_input jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a uuid:=private.require_course_applicant(); c public.courses%rowtype; r private.course_resources%rowtype; manager boolean; result jsonb; ids uuid[]; k text; url text; normalized text; scope_value text;
begin
 if not private.messaging_account_available(a) then raise exception '정상 활동 회원만 등록할 수 있습니다.' using errcode='42501';end if;
 select * into c from public.courses where course_key=p_course_key and course_status='active' for share;
 if not found then raise exception '구장을 찾을 수 없습니다.' using errcode='P0002';end if;
 manager:=private.course_can_manage(c.id,a);if p_action in ('hide','represent') then perform private.course_require_scope(c.id);end if;
 if p_action not in ('save','delete','represent','hide') then raise exception '자료 작업을 확인해 주세요.';end if;
 if p_id is not null then
 select * into r from private.course_resources where id=p_id and course_id=c.id for update;
 if not found then raise exception '자료를 찾을 수 없습니다.' using errcode='P0002';end if;
 if p_action in ('save','delete') and r.author_id is distinct from a or p_action in ('represent','hide') and not manager then raise exception '자료 관리 권한이 없습니다.' using errcode='42501';end if;
 elsif p_action<>'save' then raise exception '자료를 확인해 주세요.';end if;
 result:=private.course_claim_request(a,p_request_id,'course.resource_'||p_action,jsonb_build_object('course',c.id,'id',p_id,'version',p_version,'input',p_input));if result is not null then return result;end if;
 if r.id is not null and (r.version<>p_version or r.status<>'published') then raise exception '자료가 변경되었거나 공개되지 않았습니다. 새로고침해 주세요.' using errcode='PT409';end if;
 if p_action='save' then
 if p_input is null or jsonb_typeof(p_input)<>'object' or exists(select 1 from jsonb_object_keys(p_input) x where x not in ('kind','title','scope','description','video_url','reference_date','source','images')) then raise exception '자료 입력 항목을 확인해 주세요.';end if;
 k:=p_input->>'kind';url:=nullif(btrim(p_input->>'video_url'),'');
 scope_value:=case when r.id is null then '구장 전체' else r.scope end;
 if k='video' then
  normalized:=private.course_material_youtube(url);
  if normalized is not null then url:=normalized;
  elsif r.id is null or r.kind<>'video' or url is distinct from r.video_url then raise exception '유튜브 동영상 링크를 입력해 주세요.' using errcode='22023';end if;
 end if;
 if k not in ('video','yardage') or k is null or char_length(btrim(coalesce(p_input->>'title',''))) not between 2 and 120 or char_length(scope_value) not between 1 and 100 or char_length(coalesce(p_input->>'description',''))>3000 or char_length(coalesce(p_input->>'reference_date',''))>100 or char_length(coalesce(p_input->>'source',''))>300 then raise exception '자료 제목·분류·설명을 확인해 주세요.';end if;
 if c.course_type='screen' and k<>'video' then raise exception '스크린은 유튜브 동영상 링크만 등록할 수 있습니다.';end if;
 if k='video' and (url is null or char_length(url)>1000 or url !~ '^https?://[^/@[:space:]]+[^[:space:]]*$') then raise exception '영상 링크를 확인해 주세요.';end if;
 if k='yardage' and url is not null then raise exception '야디지북에는 이미지 자료를 선택해 주세요.';end if;
 if jsonb_typeof(coalesce(p_input->'images','[]'))<>'array' then raise exception '이미지 목록을 확인해 주세요.';end if;
 select coalesce(array_agg(value::uuid),'{}') into ids from jsonb_array_elements_text(coalesce(p_input->'images','[]'));
 if cardinality(ids)>8 or cardinality(ids)<>(select count(distinct x) from unnest(ids)x) or k='yardage' and cardinality(ids)=0 or k='video' and cardinality(ids)>0 then raise exception '야디지북은 중복 없이 1~8장을 선택해 주세요.';end if;
 perform id from private.course_resource_images where id=any(ids) order by id for update;
 if (select count(*) from private.course_resource_images i where i.id=any(ids) and i.owner_id=a and i.course_id=c.id and i.ready and (i.resource_id is null or i.resource_id=r.id))<>cardinality(ids) then raise exception '본인이 이 구장에 올린 이미지만 연결할 수 있습니다.' using errcode='42501';end if;
 if r.id is null then insert into private.course_resources(course_id,author_id,kind,title,scope,description,video_url,reference_date,source) values(c.id,a,k,btrim(p_input->>'title'),scope_value,coalesce(p_input->>'description',''),url,nullif(btrim(p_input->>'reference_date'),''),nullif(btrim(p_input->>'source'),'')) returning * into r;
 else update private.course_resources set kind=k,title=btrim(p_input->>'title'),scope=scope_value,description=coalesce(p_input->>'description',''),video_url=url,reference_date=nullif(btrim(p_input->>'reference_date'),''),source=nullif(btrim(p_input->>'source'),''),version=version+1,updated_at=now() where id=r.id returning * into r;end if;
 update private.course_resource_images set resource_id=null,position=null where resource_id=r.id and not(id=any(ids));
 update private.course_resource_images set resource_id=r.id,position=array_position(ids,id) where id=any(ids);
 elsif p_action='represent' then
 if c.course_type<>'field' then raise exception '스크린에는 대표 자료 기능이 없습니다.';end if;
 if jsonb_typeof(p_input->'enabled') is distinct from 'boolean' then raise exception '대표 상태를 확인해 주세요.';end if;
 update private.course_resources set representative=(p_input->>'enabled')::boolean,version=version+1,updated_at=now() where id=r.id returning * into r;
 else update private.course_resources set status=case when p_action='delete' then 'deleted' else 'hidden' end,representative=false,version=version+1,updated_at=now() where id=r.id returning * into r;end if;
 result:=jsonb_build_object('id',r.id,'version',r.version,'status',r.status);perform private.course_complete_request(a,p_request_id,result);return result;
end $function$
;

create function private.list_my_interests_v7(p_kind text,p_limit integer,p_offset integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid; v_items jsonb; v_total integer;
begin
 v_actor:=private.require_active_lesson_video_bookmark_reader();
 if p_kind is null or p_kind not in ('all','market','lesson_video','vendor','startup_question','store','course','course_resource')
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
  union all select 1 from private.course_resource_bookmarks where user_id=v_actor and p_kind in ('all','course_resource')
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
  union all select 'course_resource',resource_id,created_at from private.course_resource_bookmarks where user_id=v_actor and p_kind in ('all','course_resource')
 ), page as (
  select * from saved order by created_at desc,kind,id limit p_limit offset p_offset
 ), resolved as (
  select page.*,case when page.kind='store' then private.get_market_store(page.id) end store,case when page.kind='startup_question' then (select private.startup_qa_question_json(q) from public.startup_qa_questions q where q.id=page.id) end question,
   case when page.kind='vendor' then public.get_market_vendor(page.id) end vendor,
   case when page.kind='market' then public.get_market_listing(page.id) end market,
   case when page.kind='buy_request' then public.get_market_buy_request_v3(page.id) end wanted,
   case when page.kind='lesson_video' and v.publication_status='published'
    then private.public_lesson_video_json(v) end video,
   v.video_key, c.course_key, case when page.kind='course_resource' and r.status='published' and rc.course_status='active' then private.course_content_resource_json(r)||jsonb_build_object('course_key',rc.course_key,'course_name',rc.name) end resource, case when page.kind='course' and c.course_status='active' then private.public_course_json(c) end course
  from page left join public.lesson_videos v on page.kind='lesson_video' and v.id=page.id
  left join public.courses c on page.kind='course' and c.id=page.id
  left join private.course_resources r on page.kind='course_resource' and r.id=page.id left join public.courses rc on rc.id=r.course_id
 )
 select coalesce(jsonb_agg(jsonb_build_object(
   'kind',kind,'id',case when kind='course' then course_key when kind in ('course_resource','market','buy_request','vendor','startup_question','store') then id::text else video_key end,
   'saved_at',created_at,'available',case when kind='course_resource' then resource is not null when kind='course' then course is not null when kind='store' then store is not null when kind='startup_question' then question is not null when kind='vendor' then vendor is not null when kind='market' then market is not null when kind='buy_request' then wanted is not null else video is not null end,
   'course_key',resource->>'course_key','resource_video_url',resource->>'video_url','resource_image',resource->'images'->0->>'id',
   'title',case when kind='course_resource' then resource->>'title' when kind='course' then course->>'name' when kind='store' then store->'profile'->>'title' when kind='startup_question' then question->>'title' when kind='vendor' then vendor->'profile'->>'name' when kind='market' then market->>'name' when kind='buy_request' then wanted->>'title' else video->>'title' end,
   'store_photo',case when kind='store' then store->'profile'->'photos'->>0 end,
   'image_path',case when kind='market' then market->'image_paths'->>0 when kind='buy_request' then wanted->'image_paths'->>0 end,
   'price',case when kind='store' then store->'profile'->'askingPrice' when kind='market' then market->'price' when kind='buy_request' then wanted->'budget' end,
   'region',case when kind='course' then course->>'region' when kind='store' then store->'profile'->>'region' when kind='vendor' then vendor->'profile'->>'region' when kind='market' then market->>'region' when kind='buy_request' then wanted->>'region' end,
   'status',case when kind='store' then store->>'status' when kind='market' then market->>'sale_status' when kind='buy_request' then wanted->>'request_status' end,
   'url',case when kind='lesson_video' then video->>'youtube_url' end,
   'request_type',case when kind='buy_request' then wanted->>'request_type' end,
   'summary',case when kind='course_resource' then resource->>'course_name' when kind='course' then course->>'address' when kind='store' then case store->>'status' when 'selling' then '매매 중' when 'negotiating' then '협의 중' else '거래 완료' end when kind='startup_question' then question->>'author' when kind='vendor' then vendor->'profile'->>'summary' when kind='lesson_video' then (video->>'channel_name') || ' · ' || (video->>'duration_text') end
 ) order by created_at desc,kind,id),'[]'::jsonb) into v_items from resolved;
 return jsonb_build_object('items',v_items,'has_more',p_offset+jsonb_array_length(v_items)<v_total);
end $$;
revoke all on function private.list_my_interests_v7(text,integer,integer) from public,anon,authenticated,service_role;
create function public.list_my_interests_v7(p_kind text,p_limit integer,p_offset integer) returns jsonb language sql stable security definer set search_path='' as $$select private.list_my_interests_v7(p_kind,p_limit,p_offset)$$;
revoke all on function public.list_my_interests_v7(text,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.list_my_interests_v7(text,integer,integer) to authenticated;
commit;
