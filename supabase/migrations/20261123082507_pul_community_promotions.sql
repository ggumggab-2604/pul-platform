-- Promotional metadata shares community ownership, quotas, reports and moderation.
create table private.community_promotions (
  post_id uuid primary key references public.community_posts(id) on delete cascade,
  field text not null,
  trade text not null,
  scope text not null check (scope in ('visit','service','delivery','online')),
  province text not null,
  districts text[] not null,
  address text not null,
  contact text not null,
  deadline date,
  source_kind text check (source_kind in ('event','club','education','lesson','course','sale')),
  source_key text,
  nearby_course_key text,
  related_sale_id uuid,
  check ((source_kind is null) = (source_key is null))
);
alter table private.community_promotions enable row level security;
revoke all on private.community_promotions from public, anon, authenticated, service_role;

alter table public.promotions add column community_post_id uuid
  references private.community_promotions(post_id) on delete restrict;
alter table public.promotions add constraint promotions_community_advertisement
  check (community_post_id is null or content_kind='advertisement');
create index promotions_community_post_idx on public.promotions(community_post_id)
  where community_post_id is not null;

create table private.community_banner_requests (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references private.community_promotions(post_id) on delete cascade,
  slot_code text not null references public.promotion_slots(slot_code),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  requested_at timestamptz not null default now(),
  promotion_id uuid unique references public.promotions(id) on delete restrict,
  unique (post_id, slot_code, starts_at, ends_at)
);
alter table private.community_banner_requests enable row level security;
revoke all on private.community_banner_requests from public, anon, authenticated, service_role;

create function private.community_source(p_kind text, p_key text) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v jsonb;
  v_recruitment text;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if p_key is null then return null; end if;
  case p_kind
    when 'event' then
      v := public.get_public_event(p_key);
      v_recruitment := case
        when v->>'registration_status' in ('closed','ended') or (v->>'end_date')::date < v_today then 'closed'
        when v->>'registration_status' = 'open' then 'open' end;
    when 'club' then
      v := public.get_public_club(p_key);
      v_recruitment := case v->>'recruitment_status' when 'closed' then 'closed' when 'recruiting' then 'open' end;
    when 'education' then
      v := public.get_public_certification_course(p_key);
      v_recruitment := case
        when v->>'recruit_status' = 'closed' then 'closed'
        when v->>'recruit_status' in ('recruiting','accepting') then 'open' end;
    when 'lesson' then
      v := public.get_university_department_detail(p_key);
      v_recruitment := case
        when (v->>'recruitment_end')::date < v_today then 'closed'
        when (v->>'recruitment_start')::date <= v_today and v->>'recruitment_title' is not null then 'open' end;
    when 'course' then v := public.get_public_course(p_key);
    when 'sale' then
      if p_key !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then return null; end if;
      v := public.get_market_listing(p_key::uuid);
    else return null;
  end case;
  if v is null or v = 'null'::jsonb then return null; end if;
  return jsonb_strip_nulls(jsonb_build_object(
    'kind', p_kind, 'key', p_key, 'title', coalesce(v->>'title',v->>'name',v->>'department_name',p_key),
    'visibility', 'public', 'recruitment', v_recruitment
  ));
exception when raise_exception then
  if sqlerrm like '%찾을 수 없%' then return null; end if;
  raise;
end;
$$;
revoke all on function private.community_source(text,text) from public, anon, authenticated, service_role;

create function private.community_promotion_visible(p_id uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1 from private.community_promotions m join public.community_posts p on p.id=m.post_id
    where p.id=p_id and p.post_status='published'
      and (m.source_key is null or private.community_source(m.source_kind,m.source_key) is not null)
      and (m.nearby_course_key is null or private.community_source('course',m.nearby_course_key) is not null)
      and (m.related_sale_id is null or private.community_source('sale',m.related_sale_id::text) is not null)
  );
$$;
revoke all on function private.community_promotion_visible(uuid) from public, anon, authenticated, service_role;

create function private.community_promotion_json(p public.community_posts, m private.community_promotions) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id',p.id,'title',p.title,'body',p.body,'field',m.field,'trade',m.trade,'scope',m.scope,
    'province',m.province,'districts',m.districts,'address',m.address,'contact',m.contact,'deadline',m.deadline,
    'createdAt',extract(epoch from p.created_at)*1000,'version',p.version,'visibility','public',
    'owner',coalesce(p.author_user_id=auth.uid(),false),
    'source',private.community_source(m.source_kind,m.source_key),
    'nearbyCourse',private.community_source('course',m.nearby_course_key),
    'relatedSale',private.community_source('sale',m.related_sale_id::text)
  ));
$$;
revoke all on function private.community_promotion_json(public.community_posts,private.community_promotions) from public, anon, authenticated, service_role;

create function public.get_community_promotion(p_post_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.community_promotion_json(p,m)
  from private.community_promotions m join public.community_posts p on p.id=m.post_id
  where p.id=p_post_id and private.community_promotion_visible(p.id);
$$;
revoke all on function public.get_community_promotion(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_community_promotion(uuid) to anon, authenticated;

create function public.save_community_promotion(p_post_id uuid, p_version integer, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_field text := p_payload->>'field';
  v_trade text := coalesce(p_payload->>'trade','');
  v_scope text := p_payload->>'scope';
  v_province text := coalesce(p_payload->>'province','');
  v_districts text[];
  v_address text := btrim(coalesce(p_payload->>'address',''));
  v_contact text := btrim(coalesce(p_payload->>'contact',''));
  v_kind text := nullif(p_payload->>'sourceKind','');
  v_key text := nullif(btrim(p_payload->>'sourceKey'),'');
  v_course text := nullif(btrim(p_payload->>'nearbyCourseKey'),'');
  v_sale text := nullif(lower(btrim(p_payload->>'relatedSaleId')),'');
  v_id uuid;
  v_result jsonb;
begin
  perform private.community_assert_active_actor();
  if p_post_id is not null and not exists (select 1 from private.community_promotions where post_id=p_post_id) then
    raise exception '홍보 글을 찾을 수 없습니다.';
  end if;
  if not coalesce(case v_field
      when 'local' then v_trade in ('식당·카페','숙박','쇼핑·특산품','관광·체험')
      when 'service' then v_trade in ('출장 수리','청소','차량·단체 이동')
      when 'education' then v_trade in ('파크골프 레슨·강습','교육기관 수강생 모집','일반 강좌')
      when 'equipment' then v_trade in ('파크골프채·용품','스크린 시설','기타 관련 시설')
      when 'events' then v_trade=''
      when 'clubs' then v_trade='' end,false)
     or v_scope is null or v_scope not in ('visit','service','delivery','online')
     or char_length(v_address)>160 or char_length(v_contact)>160
     or coalesce(jsonb_typeof(p_payload->'districts'),'') <> 'array' then
    raise exception '분야·업종과 이용 범위를 확인해 주세요.';
  end if;
  select coalesce(array_agg(distinct btrim(x) order by btrim(x)),array[]::text[]) into v_districts
  from jsonb_array_elements_text(p_payload->'districts') x;
  if v_scope in ('visit','service') then
    if v_province not in ('서울','부산','대구','인천','광주','대전','울산','세종','경기','강원','충북','충남','전북','전남','경북','경남','제주')
      or cardinality(v_districts) not between 1 and 12
      or (v_scope='visit' and cardinality(v_districts)<>1)
      or exists (select 1 from unnest(v_districts) d where d is null or d !~ '^[가-힣]{1,20}[시군구]( [가-힣]{1,20}구)?$') then
      raise exception '시·도와 시·군·구를 확인해 주세요.';
    end if;
  else
    v_province := '';
    v_districts := array[]::text[];
  end if;
  if (v_kind is null) <> (v_key is null)
     or (v_key is not null and (v_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' or private.community_source(v_kind,v_key) is null))
     or (v_course is not null and (v_course !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' or private.community_source('course',v_course) is null))
     or (v_sale is not null and private.community_source('sale',v_sale) is null) then
    raise exception '연결할 공개 원본의 키를 확인해 주세요.';
  end if;
  v_id := (public.mutate_community_post(case when p_post_id is null then 'create' else 'update' end,
      p_post_id,p_version,jsonb_build_object('category','free','title',p_payload->>'title','body',p_payload->>'body'))->>'post_id')::uuid;
  insert into private.community_promotions
    (post_id,field,trade,scope,province,districts,address,contact,deadline,source_kind,source_key,nearby_course_key,related_sale_id)
  values (v_id,v_field,v_trade,v_scope,v_province,v_districts,v_address,v_contact,
    nullif(p_payload->>'deadline','')::date,v_kind,v_key,v_course,v_sale::uuid)
  on conflict (post_id) do update set field=excluded.field,trade=excluded.trade,scope=excluded.scope,
    province=excluded.province,districts=excluded.districts,address=excluded.address,contact=excluded.contact,
    deadline=excluded.deadline,source_kind=excluded.source_kind,source_key=excluded.source_key,
    nearby_course_key=excluded.nearby_course_key,related_sale_id=excluded.related_sale_id;
  v_result := public.get_community_promotion(v_id);
  if v_result is null then raise exception '연결할 공개 원본의 상태를 다시 확인해 주세요.'; end if;
  return v_result;
end;
$$;
revoke all on function public.save_community_promotion(uuid,integer,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_community_promotion(uuid,integer,jsonb) to authenticated;

create function private.pause_community_banners() returns trigger
language plpgsql set search_path = '' as $$
begin
  update public.promotion_placements a
  set publication_status='hidden', version=a.version+1, updated_at=now()
  from public.promotions b
  where a.promotion_id=b.id and b.community_post_id=new.id
    and a.publication_status='published' and a.ends_at>now();
  return null;
end;
$$;
revoke all on function private.pause_community_banners() from public, anon, authenticated, service_role;
create trigger community_post_pause_banners after update of post_status on public.community_posts
for each row when (old.post_status='published' and new.post_status<>'published')
execute function private.pause_community_banners();

create function private.assert_community_banner_public() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.publication_status='published' and exists (
    select 1 from public.promotions p where p.id=new.promotion_id and p.community_post_id is not null
    and not private.community_promotion_visible(p.community_post_id)
  ) then raise exception '먼저 연결할 공개 홍보 글을 확인해 주세요.'; end if;
  return new;
end;
$$;
revoke all on function private.assert_community_banner_public() from public, anon, authenticated, service_role;
create trigger promotion_placement_community_guard before insert or update of publication_status
on public.promotion_placements for each row execute function private.assert_community_banner_public();

create function public.list_community_banner_slots() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('code',slot_code,'label',display_name)
    order by sort_order,slot_code),'[]'::jsonb)
  from public.promotion_slots where is_enabled and 'advertisement'=any(allowed_content_kinds);
$$;

create function public.request_community_banner(p_post_id uuid,p_slot text,p_start timestamptz,p_end timestamptz) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := private.community_assert_active_actor();
  v_id uuid;
begin
  perform 1 from public.community_posts p where p.id=p_post_id and p.author_user_id=v_actor for share;
  if not found or not private.community_promotion_visible(p_post_id) then
    raise exception '본인의 공개 홍보 글만 신청할 수 있습니다.';
  end if;
  if not exists(select 1 from public.promotion_slots where slot_code=p_slot and is_enabled and 'advertisement'=any(allowed_content_kinds))
    or p_start is null or p_end is null or not isfinite(p_start) or not isfinite(p_end)
    or p_end<=greatest(now(),p_start) then
    raise exception '배너 자리와 게시 기간을 확인해 주세요.';
  end if;
  insert into private.community_banner_requests(post_id,slot_code,starts_at,ends_at)
    values(p_post_id,p_slot,p_start,p_end) on conflict (post_id,slot_code,starts_at,ends_at) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from private.community_banner_requests
    where post_id=p_post_id and slot_code=p_slot and starts_at=p_start and ends_at=p_end;
  end if;
  return v_id;
end;
$$;

create function public.list_community_banner_requests() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.promotion_assert_manager();
  return coalesce((
    select jsonb_agg(to_jsonb(q) order by q.requested_at desc,q.id desc)
    from (
      select r.id,r.post_id,p.title,m.field,m.trade,r.slot_code,r.starts_at,r.ends_at,r.requested_at,b.promotion_key,
        private.community_promotion_visible(p.id) and s.is_enabled and 'advertisement'=any(s.allowed_content_kinds) and r.ends_at>now() as available
      from private.community_banner_requests r join public.community_posts p on p.id=r.post_id
      join private.community_promotions m on m.post_id=r.post_id
      join public.promotion_slots s on s.slot_code=r.slot_code
      left join public.promotions b on b.id=r.promotion_id
      order by (r.promotion_id is null) desc,r.requested_at desc,r.id desc limit 60
    ) q
  ),'[]'::jsonb);
end;
$$;

create function public.accept_community_banner_request(p_request_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_request private.community_banner_requests%rowtype;
  v_post public.community_posts%rowtype;
  v_result jsonb;
  v_key text;
  v_banner_id uuid;
begin
  perform private.promotion_assert_manager();
  select * into v_request from private.community_banner_requests where id=p_request_id for update;
  if not found then raise exception '배너 신청을 찾을 수 없습니다.'; end if;
  if v_request.promotion_id is not null then
    return (select promotion_key from public.promotions where id=v_request.promotion_id);
  end if;
  select * into v_post from public.community_posts where id=v_request.post_id for share;
  if not private.community_promotion_visible(v_post.id) or v_request.ends_at<=now()
    or not exists(select 1 from public.promotion_slots where slot_code=v_request.slot_code and is_enabled and 'advertisement'=any(allowed_content_kinds)) then
    raise exception '공개 홍보 글과 신청 기간을 확인해 주세요.';
  end if;
  v_result := public.mutate_promotion(gen_random_uuid(),'create',null,null,jsonb_build_object(
    'content_kind','advertisement','title',v_post.title,
    'summary',left(case when char_length(v_post.body)<10 then '커뮤니티 홍보 · '||v_post.body else v_post.body end,500),
    'link_type','none'
  ));
  v_key := v_result->'promotion'->>'promotion_key';
  update public.promotions set community_post_id=v_request.post_id where promotion_key=v_key returning id into v_banner_id;
  perform public.mutate_promotion_placement(gen_random_uuid(),'create',null,null,jsonb_build_object(
    'slot_code',v_request.slot_code,'promotion_key',v_key,'starts_at',v_request.starts_at,'ends_at',v_request.ends_at));
  update private.community_banner_requests set promotion_id=v_banner_id where id=p_request_id;
  return v_key;
end;
$$;

create function public.set_promotion_community_post(p_key text,p_version integer,p_post_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.promotion_assert_manager();
begin
  if p_post_id is not null then
    perform 1 from public.community_posts where id=p_post_id for share;
    if not private.community_promotion_visible(p_post_id) then raise exception '공개 홍보 글을 선택해 주세요.'; end if;
  end if;
  if exists (select 1 from public.promotions b join private.community_banner_requests r on r.promotion_id=b.id
    where b.promotion_key=p_key and r.post_id is distinct from p_post_id) then
    raise exception '신청에서 만든 광고의 연결 글은 유지해 주세요.';
  end if;
  update public.promotions set community_post_id=p_post_id, version=version+1,updated_at=now(),updated_by=v_actor
  where promotion_key=p_key and version=p_version and content_kind='advertisement' and content_status<>'archived';
  if not found then raise exception '광고 유형과 최신 버전을 확인해 주세요.'; end if;
end;
$$;

create function public.get_promotion_community_selection(p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.promotion_assert_manager();
  return (select jsonb_build_object('id',b.community_post_id,'title',p.title,'field',m.field,'trade',m.trade,
    'locked',exists(select 1 from private.community_banner_requests r where r.promotion_id=b.id))
    from public.promotions b left join public.community_posts p on p.id=b.community_post_id
    left join private.community_promotions m on m.post_id=p.id where b.promotion_key=p_key);
end;
$$;

create function public.list_community_promotions(
  p_field text,p_trade text,p_province text,p_district text,p_offset integer default 0
) returns jsonb language sql stable security definer set search_path = '' as $$
  with slot_groups as (
    select array_agg(slot_code order by slot_code) codes
    from (select slot_code,row_number() over (order by slot_code) as n from public.promotion_slots where is_enabled) slots
    group by (n-1)/20
  ), pinned as materialized (
    select distinct b.community_post_id as post_id
    from slot_groups s cross join lateral jsonb_array_elements(public.get_active_promotions_for_slots(s.codes)) active
    join public.promotions b on b.promotion_key=active->>'promotion_key'
    where b.community_post_id is not null
  ), entries as (
    select private.community_promotion_json(p,m) || jsonb_build_object('paid', pin.post_id is not null) as item,
      p.created_at,p.id,pin.post_id is not null as paid
    from private.community_promotions m join public.community_posts p on p.id=m.post_id
    left join pinned pin on pin.post_id=m.post_id
    where (nullif(p_field,'') is null or m.field=p_field)
      and (nullif(p_trade,'') is null or m.trade=p_trade)
      and (nullif(p_province,'') is null or m.province=p_province)
      and (nullif(p_district,'') is null or p_district=any(m.districts))
      and private.community_promotion_visible(m.post_id)
    order by paid desc,p.created_at desc,p.id desc limit 25 offset greatest(p_offset,0)
  )
  select jsonb_build_object(
    'items',coalesce((select jsonb_agg(item order by paid desc,created_at desc,id desc) from
      (select * from entries order by paid desc,created_at desc,id desc limit 24) first_page),'[]'::jsonb),
    'hasMore',(select count(*)=25 from entries),
    'districts',coalesce((select jsonb_agg(distinct d order by d) from private.community_promotions m
      cross join lateral unnest(m.districts) d where m.province=p_province and private.community_promotion_visible(m.post_id)),'[]'::jsonb)
  );
$$;

create function public.list_my_community_banner_posts() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.community_assert_active_actor();
begin
  return coalesce((
    select jsonb_agg(to_jsonb(q) order by q.created_at desc,q.id desc) from (
      select p.id,p.title,m.field,m.trade,p.created_at
      from public.community_posts p join private.community_promotions m on m.post_id=p.id
      where p.author_user_id=v_actor and private.community_promotion_visible(p.id)
      order by p.created_at desc,p.id desc limit 100
    ) q
  ),'[]'::jsonb);
end;
$$;

revoke all on function public.list_community_banner_slots(),public.request_community_banner(uuid,text,timestamptz,timestamptz),
  public.list_community_banner_requests(),public.accept_community_banner_request(uuid),
  public.set_promotion_community_post(text,integer,uuid),public.get_promotion_community_selection(text),
  public.list_community_promotions(text,text,text,text,integer),public.list_my_community_banner_posts()
from public, anon, authenticated, service_role;
grant execute on function public.list_community_banner_slots(),public.request_community_banner(uuid,text,timestamptz,timestamptz),
  public.list_community_banner_requests(),public.accept_community_banner_request(uuid),
  public.set_promotion_community_post(text,integer,uuid),public.get_promotion_community_selection(text),
  public.list_my_community_banner_posts() to authenticated;
grant execute on function public.list_community_promotions(text,text,text,text,integer) to anon, authenticated;

-- Preserve existing RPC shapes. The banner lookup is also the notice eligibility source.

create or replace function public.get_active_promotions_for_slots(
  p_slot_codes text[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_result jsonb := '[]'::jsonb;
begin
  if p_slot_codes is null
     or pg_catalog.cardinality(p_slot_codes) not between 1 and 20 then
    raise exception '배너 슬롯은 한 번에 1개 이상 20개 이하로 조회해 주세요.';
  end if;
  if exists (
    select 1
    from pg_catalog.unnest(p_slot_codes) as requested(slot_code)
    where requested.slot_code is null
      or requested.slot_code <> pg_catalog.btrim(requested.slot_code)
      or pg_catalog.char_length(requested.slot_code) > 80
      or requested.slot_code !~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+){2,3}$'
  ) then
    raise exception '배너 슬롯 코드를 확인해 주세요.';
  end if;
  if pg_catalog.cardinality(p_slot_codes) <> (
    select pg_catalog.count(distinct requested.slot_code)::integer
    from pg_catalog.unnest(p_slot_codes) as requested(slot_code)
  ) then
    raise exception '배너 슬롯 코드를 중복해서 요청할 수 없습니다.';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'slot_code', listed.slot_code,
        'promotion_key', listed.promotion_key,
        'title', listed.title,
        'summary', listed.summary,
        'content_kind', listed.content_kind,
        'link_type', listed.link_type,
        'external_url', listed.external_url,
        'detail_slug', listed.slug,
        'desktop_media', pg_catalog.jsonb_build_object(
          'bucket', listed.desktop_bucket,
          'path', listed.desktop_path,
          'width', listed.desktop_width,
          'height', listed.desktop_height,
          'alt', listed.desktop_alt
        ),
        'mobile_media', case
          when listed.mobile_path is null then null
          else pg_catalog.jsonb_build_object(
            'bucket', listed.mobile_bucket,
            'path', listed.mobile_path,
            'width', listed.mobile_width,
            'height', listed.mobile_height,
            'alt', listed.mobile_alt
          )
        end,
        'starts_at', listed.starts_at,
        'ends_at', listed.ends_at
      )
      order by listed.sort_order, listed.slot_code
    ),
    '[]'::jsonb
  )
  into v_result
  from (
    select
      slot.slot_code,
      slot.sort_order,
      slot.desktop_width,
      slot.desktop_height,
      slot.mobile_width,
      slot.mobile_height,
      promotion.promotion_key,
      promotion.title,
      promotion.summary,
      promotion.content_kind,
      case when promotion.community_post_id is not null then 'community_post' else promotion.link_type end as link_type,
      case when promotion.community_post_id is null then promotion.external_url end as external_url,
      coalesce(promotion.community_post_id::text,promotion.slug) as slug,
      placement.starts_at,
      placement.ends_at,
      desktop_media.storage_bucket as desktop_bucket,
      desktop_media.storage_path as desktop_path,
      desktop_media.alt_text as desktop_alt,
      mobile_media.storage_bucket as mobile_bucket,
      mobile_media.storage_path as mobile_path,
      mobile_media.alt_text as mobile_alt
    from public.promotion_slots as slot
    join public.promotion_placements as placement
      on placement.slot_code = slot.slot_code
     and placement.publication_status = 'published'
     and placement.starts_at <= v_now
     and placement.ends_at > v_now
    join public.promotions as promotion
      on promotion.id = placement.promotion_id
     and promotion.content_status = 'ready'
    join public.promotion_media as desktop_media
      on desktop_media.promotion_id = promotion.id
     and desktop_media.variant = 'desktop_banner'
     and desktop_media.media_status = 'available'
    left join public.promotion_media as mobile_media
      on mobile_media.promotion_id = promotion.id
     and mobile_media.variant = 'mobile_banner'
     and mobile_media.media_status = 'available'
    where slot.slot_code = any (p_slot_codes)
      and slot.is_enabled
      and (promotion.community_post_id is null or private.community_promotion_visible(promotion.community_post_id))
      and (
        slot.format_code not in ('home_hero', 'mobile_feed')
        or mobile_media.id is not null
      )
  ) as listed;

  return v_result;
end;
$$;

-- The legacy board keeps its own categories and pagination.

create or replace function public.list_community_posts(
  p_category_code text default null,
  p_keyword text default null,
  p_sort_order text default 'latest',
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
  v_viewer_id uuid := auth.uid();
  v_keyword text := nullif(pg_catalog.btrim(p_keyword), '');
  v_total integer;
  v_items jsonb;
begin
  if p_category_code is not null
     and p_category_code not in ('free', 'question', 'review', 'equipment', 'course', 'club', 'lostFound', 'marketReview') then
    raise exception '게시글 카테고리를 확인해 주세요.';
  end if;
  if p_sort_order not in ('latest', 'comments') then
    raise exception '게시글 정렬 방식을 확인해 주세요.';
  end if;
  if p_limit not between 1 and 30 or p_offset < 0 then
    raise exception '페이지 범위를 확인해 주세요.';
  end if;

  select count(*)::integer
  into v_total
  from public.community_posts as post
  where post.post_status = 'published'
    and not exists (select 1 from private.community_promotions m where m.post_id=post.id)
    and (p_category_code is null or post.category_code = p_category_code)
    and (
      v_keyword is null
      or post.title ilike '%' || v_keyword || '%'
      or post.body ilike '%' || v_keyword || '%'
    );

  with eligible as (
    select
      post.*,
      (
        select count(*)::integer
        from public.community_comments as comment
        where comment.post_id = post.id
          and comment.removed_at is null and comment.moderation_hidden_at is null
      ) as comment_count
    from public.community_posts as post
    where post.post_status = 'published'
      and not exists (select 1 from private.community_promotions m where m.post_id=post.id)
      and (p_category_code is null or post.category_code = p_category_code)
      and (
        v_keyword is null
        or post.title ilike '%' || v_keyword || '%'
        or post.body ilike '%' || v_keyword || '%'
      )
  ), page as (
    select eligible.*
    from eligible
    order by
      case when p_sort_order = 'comments' then eligible.comment_count end desc,
      eligible.created_at desc,
      eligible.id desc
    limit p_limit
    offset p_offset
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', page.id,
        'title', page.title,
        'summary', pg_catalog.left(page.body, 180),
        'category', page.category_code,
        'author_display_name', private.community_actor_display_name(page.author_user_id, v_viewer_id),
        'created_at', page.created_at,
        'updated_at', page.updated_at,
        'version', page.version,
        'can_edit', coalesce(page.author_user_id = v_viewer_id, false),
        'comment_count', page.comment_count,
        'question_type', page.question_type,
        'question_status', case
          when page.category_code <> 'question' then null
          when page.question_resolved_at is not null then 'resolved'
          when page.comment_count > 0 then 'answered'
          else 'waiting'
        end,
        'review_type', page.review_type,
        'rating', page.rating,
        'lost_found_kind', page.lost_found_kind,
        'lost_found_item_name', page.lost_found_item_name,
        'lost_found_place', page.lost_found_place,
        'lost_found_date', page.lost_found_date,
        'lost_found_status', page.lost_found_status
      )
      order by
        case when p_sort_order = 'comments' then page.comment_count end desc,
        page.created_at desc,
        page.id desc
    ),
    '[]'::jsonb
  )
  into v_items
  from page;

  return jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', p_offset + jsonb_array_length(v_items) < v_total
  );
end;
$$;

create or replace function public.get_community_post(p_post_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_post public.community_posts%rowtype;
  v_comment_count integer;
begin
  select post.*
  into v_post
  from public.community_posts as post
  where post.id = p_post_id
    and post.post_status = 'published'
    and (not exists (select 1 from private.community_promotions m where m.post_id=post.id)
      or private.community_promotion_visible(post.id));

  if not found then
    raise exception '게시글을 찾을 수 없습니다.';
  end if;

  select count(*)::integer
  into v_comment_count
  from public.community_comments as comment
  where comment.post_id = v_post.id
    and comment.removed_at is null and comment.moderation_hidden_at is null;

  return jsonb_build_object(
    'id', v_post.id,
    'title', v_post.title,
    'body', v_post.body,
    'category', v_post.category_code,
    'status', v_post.post_status,
    'author_display_name', private.community_actor_display_name(v_post.author_user_id, v_viewer_id),
    'created_at', v_post.created_at,
    'updated_at', v_post.updated_at,
    'version', v_post.version,
    'can_edit', coalesce(v_post.author_user_id = v_viewer_id, false),
    'comment_count', v_comment_count,
    'question_type', v_post.question_type,
    'question_status', case
      when v_post.category_code <> 'question' then null
      when v_post.question_resolved_at is not null then 'resolved'
      when v_comment_count > 0 then 'answered'
      else 'waiting'
    end,
    'review_type', v_post.review_type,
    'rating', v_post.rating,
    'lost_found_kind', v_post.lost_found_kind,
    'lost_found_item_name', v_post.lost_found_item_name,
    'lost_found_place', v_post.lost_found_place,
    'lost_found_date', v_post.lost_found_date,
    'lost_found_status', v_post.lost_found_status
  );
end;
$$;

create or replace function public.list_community_comments(
  p_post_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_total integer;
  v_items jsonb;
begin
  if p_limit not between 1 and 100 or p_offset < 0 then
    raise exception '댓글 페이지 범위를 확인해 주세요.';
  end if;

  perform 1
  from public.community_posts as post
  where post.id = p_post_id
    and post.post_status = 'published'
      and (not exists (select 1 from private.community_promotions m where m.post_id=post.id)
      or private.community_promotion_visible(post.id));
  if not found then
    raise exception '게시글을 찾을 수 없습니다.';
  end if;

  select count(*)::integer
  into v_total
  from public.community_comments as comment
  where comment.post_id = p_post_id
    and comment.removed_at is null and comment.moderation_hidden_at is null;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', page.id,
        'body', page.body,
        'author_display_name', private.community_actor_display_name(page.author_user_id, v_viewer_id),
        'created_at', page.created_at,
        'updated_at', page.updated_at,
        'version', page.version,
        'can_edit', coalesce(page.author_user_id = v_viewer_id, false)
      )
      order by page.created_at, page.id
    ),
    '[]'::jsonb
  )
  into v_items
  from (
    select comment.*
    from public.community_comments as comment
    where comment.post_id = p_post_id
      and comment.removed_at is null and comment.moderation_hidden_at is null
    order by comment.created_at, comment.id
    limit p_limit
    offset p_offset
  ) as page;

  return jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', p_offset + jsonb_array_length(v_items) < v_total
  );
end;
$$;

