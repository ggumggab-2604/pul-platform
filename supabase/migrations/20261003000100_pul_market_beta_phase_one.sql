-- PUL Beta market phase one. LOCAL CANDIDATE ONLY; deploy migration before new application.
-- Existing RPC argument and JSON contracts remain readable by the currently deployed Beta.
-- Contacts are explicitly entered, never sourced from Auth/profile; lists contain no contact columns.
begin;
alter table public.market_buy_requests
  add column public_contact_method text,
  add column public_contact_value text,
  add column public_contact_consent_at timestamptz,
  add constraint market_buy_requests_public_contact_check check (
    (
      public_contact_method is null
      and public_contact_value is null
      and public_contact_consent_at is null
    )
    or (
      public_contact_method is not null
      and public_contact_method in ('phone', 'sms', 'external_url')
      and public_contact_value is not null
      and public_contact_consent_at is not null
      and (
        (
          public_contact_method in ('phone', 'sms')
          and public_contact_value ~ '^[0-9]{8,15}$'
        )
        or (
          public_contact_method = 'external_url'
          and private.market_valid_contact_https_url(public_contact_value)
        )
      )
    )
  );

alter table public.market_startup_posts
  add column public_contact_method text,
  add column public_contact_value text,
  add column public_contact_consent_at timestamptz,
  add constraint market_startup_posts_public_contact_check check (
    (
      public_contact_method is null
      and public_contact_value is null
      and public_contact_consent_at is null
    )
    or (
      public_contact_method is not null
      and public_contact_method in ('phone', 'sms', 'external_url')
      and public_contact_value is not null
      and public_contact_consent_at is not null
      and (
        (
          public_contact_method in ('phone', 'sms')
          and public_contact_value ~ '^[0-9]{8,15}$'
        )
        or (
          public_contact_method = 'external_url'
          and private.market_valid_contact_https_url(public_contact_value)
        )
      )
    )
  );

create function private.market_contact_viewer_active() returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.user_accounts where id=auth.uid() and account_status='active');
$$;
revoke all on function private.market_contact_viewer_active() from public,anon,authenticated,service_role;
create or replace function public.get_market_listing(p_listing_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'id', listing.id,
    'name', listing.title,
    'category', listing.category_code,
    'seller_type', 'personal',
    'price', listing.price_amount,
    'region', listing.region_code,
    'condition', listing.condition_code,
    'trade_type', listing.trade_type_code,
    'sale_status', listing.listing_status,
    'description', listing.description,
    'seller_display_name', private.market_actor_display_name(listing.seller_user_id, auth.uid()),
    'created_at', listing.created_at,
    'updated_at', listing.updated_at,
    'version', listing.version,
    'can_edit', coalesce(listing.seller_user_id = auth.uid(), false),
    'image_paths', coalesce((
      select pg_catalog.jsonb_agg(media.storage_path order by media.sort_order, media.id)
      from public.market_listing_media as media
      where media.listing_id = listing.id and media.media_status = 'available'
    ), '[]'::jsonb),
    'public_contact_method', case
      when private.market_contact_viewer_active() and listing.listing_status in ('selling', 'reserved')
       and listing.public_contact_consent_at is not null
      then listing.public_contact_method
      else null
    end,
    'public_contact_value', case
      when private.market_contact_viewer_active() and listing.listing_status in ('selling', 'reserved')
       and listing.public_contact_consent_at is not null
      then listing.public_contact_value
      else null
    end
  )
  from public.market_listings as listing
  where listing.id = p_listing_id
    and listing.listing_status <> 'removed';
$$;

comment on function public.get_market_listing(uuid) is
  'Public detail read for one visible listing; listing-scoped contact is returned only while selling or reserved with explicit consent.';
revoke all on function public.get_market_listing(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_market_listing(uuid)
  to anon, authenticated;

create or replace function public.mutate_market_buy_request(
  p_operation text,
  p_buy_request_id uuid,
  p_expected_version integer,
  p_payload jsonb,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := private.market_assert_active_actor();
  v_action text := 'market.buy_request.' || coalesce(p_operation, '');
  v_claim record;
  v_request public.market_buy_requests%rowtype;
  v_before jsonb;
  v_result jsonb;
  v_title text := nullif(pg_catalog.btrim(p_payload->>'title'), '');
  v_category text := p_payload->>'category';
  v_region text := p_payload->>'region';
  v_summary text := nullif(pg_catalog.btrim(p_payload->>'summary'), '');
  v_budget bigint;
  v_next_status text;
begin
  if p_operation not in ('create', 'update', 'close', 'delete') then
    raise exception '지원하지 않는 구매요청 작업입니다.';
  end if;
  if p_operation = 'create' and p_buy_request_id is not null then
    raise exception '새 구매요청에는 기존 식별자를 사용할 수 없습니다.';
  end if;
  if p_operation <> 'create' and p_buy_request_id is null then
    raise exception '구매요청 식별자가 필요합니다.';
  end if;

  select * into v_claim from private.market_claim_request(
    v_actor_id, p_request_id, v_action,
    pg_catalog.jsonb_build_object(
      'operation', p_operation, 'buy_request_id', p_buy_request_id,
      'expected_version', p_expected_version, 'payload', coalesce(p_payload, '{}'::jsonb)
    )
  );
  if v_claim.replayed then
    return v_claim.result_data || pg_catalog.jsonb_build_object('replayed', true);
  end if;

  if p_operation in ('create', 'update') then
    if v_title is null or pg_catalog.char_length(v_title) not between 2 and 100 then
      raise exception '구매 희망 제목은 2~100자로 입력해 주세요.';
    end if;
    if v_category not in ('club', 'ball', 'bag', 'apparel', 'shoes', 'practice', 'other') then
      raise exception '카테고리 입력을 확인해 주세요.';
    end if;
    if coalesce(p_payload->>'budget', '') !~ '^[0-9]+$' then
      raise exception '희망 예산은 숫자로 입력해 주세요.';
    end if;
    v_budget := (p_payload->>'budget')::bigint;
    if v_budget not between 1 and 1000000000 then
      raise exception '희망 예산 입력 범위를 확인해 주세요.';
    end if;
    if v_region not in ('서울', '경기', '인천', '충청', '강원', '전라', '경상', '제주') then
      raise exception '지역 입력을 확인해 주세요.';
    end if;
    if v_summary is null or pg_catalog.char_length(v_summary) not between 10 and 1000 then
      raise exception '구매 희망 내용은 10~1000자로 입력해 주세요.';
    end if;
  end if;

  if p_operation = 'create' then
    insert into public.market_buy_requests (
      author_user_id, title, category_code, budget_amount, region_code, summary
    ) values (
      v_actor_id, v_title, v_category, v_budget, v_region, v_summary
    ) returning * into v_request;
  else
    select request.* into v_request
    from public.market_buy_requests as request
    where request.id = p_buy_request_id
    for update;
    if v_request.id is null or v_request.request_status = 'removed' then
      raise exception '구매요청을 찾을 수 없습니다.';
    end if;
    if v_request.author_user_id <> v_actor_id then
      raise exception '본인의 구매요청만 변경할 수 있습니다.';
    end if;
    if p_expected_version is null or p_expected_version <> v_request.version then
      raise exception '구매요청이 변경되었습니다. 새로고침 후 다시 시도해 주세요.';
    end if;
    v_before := pg_catalog.jsonb_build_object('request_status',v_request.request_status,'version',v_request.version);
    if p_operation = 'update' then
      if v_request.request_status <> 'open' then
        raise exception '종료된 구매요청은 수정할 수 없습니다.';
      end if;
      update public.market_buy_requests
      set title = v_title, category_code = v_category, budget_amount = v_budget,
          region_code = v_region, summary = v_summary, version = version + 1
      where id = v_request.id returning * into v_request;
    elsif p_operation = 'close' then
      if v_request.request_status <> 'open' then
        raise exception '진행중인 구매요청만 종료할 수 있습니다.';
      end if;
      v_next_status := 'closed';
    else
      v_next_status := 'removed';
    end if;
    if v_next_status is not null then
      update public.market_buy_requests
      set request_status = v_next_status,
          removed_at = case when v_next_status = 'removed' then now() else null end,
          version = version + 1
      where id = v_request.id returning * into v_request;
    end if;
  end if;

  if p_operation = 'create' or v_before->>'request_status' is distinct from v_request.request_status then
    insert into public.market_status_history (
      entity_kind, buy_request_id, entity_version, from_status, to_status, actor_user_id, request_id
    ) values (
      'buy_request', v_request.id, v_request.version,
      case when p_operation = 'create' then null else v_before->>'request_status' end,
      v_request.request_status, v_actor_id, p_request_id
    );
  end if;

  v_result := pg_catalog.jsonb_build_object(
    'request_id', p_request_id,
    'buy_request_id', v_request.id,
    'request_status', v_request.request_status,
    'version', v_request.version,
    'replayed', false
  );
  insert into private.market_audit_log (
    actor_user_id, request_id, action_code, entity_kind, entity_id, before_data, after_data
  ) values (
    v_actor_id, p_request_id, v_action, 'buy_request', v_request.id, v_before,
    pg_catalog.jsonb_build_object('status', v_request.request_status, 'version', v_request.version)
  );
  perform private.market_complete_request(v_actor_id, p_request_id, v_result);
  return v_result;
end;
$$;

comment on function public.mutate_market_buy_request(text, uuid, integer, jsonb, uuid) is
  'Owner-only idempotent create, edit, close, and soft delete for wanted posts.';
revoke all on function public.mutate_market_buy_request(text, uuid, integer, jsonb, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.mutate_market_buy_request(text, uuid, integer, jsonb, uuid)
  to authenticated;

create function public.list_market_buy_requests_v2(
  p_keyword text default null,
  p_category_code text default null,
  p_region_code text default null,
  p_request_status text default null,
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
  v_actor_id uuid := auth.uid();
  v_keyword text := nullif(pg_catalog.btrim(p_keyword),'');
  v_limit integer := least(greatest(coalesce(p_limit, 24), 1), 30);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_items jsonb;
  v_total integer;
begin
  if p_category_code is not null and p_category_code not in ('club','ball','bag','apparel','shoes','practice','other') then raise exception '카테고리 입력을 확인해 주세요.'; end if;
  if p_region_code is not null and p_region_code not in ('서울','경기','인천','충청','강원','전라','경상','제주') then raise exception '지역 입력을 확인해 주세요.'; end if;
  if p_request_status is not null and p_request_status not in ('open','closed') then raise exception '구매요청 상태 입력을 확인해 주세요.'; end if;
  select pg_catalog.count(*) into v_total
  from public.market_buy_requests as request
  where request.request_status <> 'removed'
    and (p_category_code is null or request.category_code=p_category_code)
    and (p_region_code is null or request.region_code=p_region_code)
    and (p_request_status is null or request.request_status=p_request_status)
    and (v_keyword is null or request.title ilike '%'||v_keyword||'%' or request.summary ilike '%'||v_keyword||'%');

  select coalesce(pg_catalog.jsonb_agg(page.item order by page.created_at desc, page.id desc), '[]'::jsonb)
  into v_items
  from (
    select request.id, request.created_at,
      pg_catalog.jsonb_build_object(
        'id', request.id,
        'title', request.title,
        'category', request.category_code,
        'region', request.region_code,
        'budget', request.budget_amount,
        'summary', request.summary,
        'author_display_name', private.market_actor_display_name(request.author_user_id, v_actor_id),
        'request_status', request.request_status,
        'created_at', request.created_at,
        'updated_at', request.updated_at,
        'version', request.version,
        'can_edit', coalesce(request.author_user_id = v_actor_id,false)
      ) as item
    from public.market_buy_requests as request
    where request.request_status <> 'removed'
    and (p_category_code is null or request.category_code=p_category_code)
    and (p_region_code is null or request.region_code=p_region_code)
    and (p_request_status is null or request.request_status=p_request_status)
    and (v_keyword is null or request.title ilike '%'||v_keyword||'%' or request.summary ilike '%'||v_keyword||'%')
    order by request.created_at desc, request.id desc
    limit v_limit offset v_offset
  ) as page;

  return pg_catalog.jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'has_more', v_offset + v_limit < v_total
  );
end;
$$;

comment on function public.list_market_buy_requests_v2(text, text, text, text, integer, integer) is
  'Public paginated wanted-post read without private author identifiers.';
revoke all on function public.list_market_buy_requests_v2(text, text, text, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_market_buy_requests_v2(text, text, text, text, integer, integer)
  to anon, authenticated;

create function public.get_market_buy_request_v2(p_buy_request_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select pg_catalog.jsonb_build_object('post',public.get_market_buy_request(r.id)||pg_catalog.jsonb_build_object('can_edit',coalesce(r.author_user_id=auth.uid(),false)),
 'public_contact_method',case when private.market_contact_viewer_active() and r.request_status='open' and r.public_contact_consent_at is not null then r.public_contact_method else null end,
 'public_contact_value',case when private.market_contact_viewer_active() and r.request_status='open' and r.public_contact_consent_at is not null then r.public_contact_value else null end)
 from public.market_buy_requests r where r.id=p_buy_request_id and r.request_status<>'removed';
$$;
revoke all on function public.get_market_buy_request_v2(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_market_buy_request_v2(uuid) to anon,authenticated;

create function public.mutate_market_buy_request_v2(p_operation text,p_buy_request_id uuid,p_expected_version integer,p_payload jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=private.market_assert_active_actor(); v_result jsonb; v_contact text;
begin
 if p_operation in ('create','update') then
   if p_payload->'public_contact_consent' is distinct from 'true'::jsonb then raise exception '연락처 공개 안내에 동의해 주세요.'; end if;
   v_contact:=private.market_normalize_public_contact(p_payload->>'public_contact_method',p_payload->>'public_contact_value');
 end if;
 -- The legacy idempotency fingerprint includes the entire payload, including explicit contact consent.
 v_result:=public.mutate_market_buy_request(p_operation,p_buy_request_id,p_expected_version,p_payload,p_request_id);
 if p_operation in ('create','update') and not (v_result->>'replayed')::boolean then
   update public.market_buy_requests set public_contact_method=p_payload->>'public_contact_method', public_contact_value=v_contact,public_contact_consent_at=now()
   where id=(v_result->>'buy_request_id')::uuid and author_user_id=v_actor;
 end if;
 return v_result;
end;
$$;
revoke all on function public.mutate_market_buy_request_v2(text,uuid,integer,jsonb,uuid) from public, anon, authenticated, service_role;
grant execute on function public.mutate_market_buy_request_v2(text,uuid,integer,jsonb,uuid) to authenticated;


-- Optional structured screen-resale fields. JSON keys are a closed contract; null and zero differ.
create function private.market_resale_details_valid(p jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare k text; n numeric;
begin
 if p is null or p='null'::jsonb then return true; end if;
 if pg_catalog.jsonb_typeof(p)<>'object' or (select pg_catalog.array_agg(key order by key) from pg_catalog.jsonb_object_keys(p) key)
   is distinct from array['areaSqm','askingPrice','bayCount','deposit','maintenance','monthlyRent','monthlyRevenue','negotiable','rentTerms']::text[] then return false; end if;
 foreach k in array array['areaSqm','bayCount','deposit','monthlyRent','maintenance','askingPrice','monthlyRevenue'] loop
   if p->k <> 'null'::jsonb then
     if pg_catalog.jsonb_typeof(p->k)<>'number' then return false; end if;
     n:=(p->>k)::numeric;
     if n<0 or n>(case when k='areaSqm' then 100000 when k='bayCount' then 1000 else 100000000000 end)
       or (k='areaSqm' and pg_catalog.round(n,2)<>n) or (k<>'areaSqm' and pg_catalog.trunc(n)<>n) then return false; end if;
   end if;
 end loop;
 if p->'negotiable'<>'null'::jsonb and pg_catalog.jsonb_typeof(p->'negotiable')<>'boolean' then return false; end if;
 if p->'rentTerms'<>'null'::jsonb and (pg_catalog.jsonb_typeof(p->'rentTerms')<>'string' or pg_catalog.char_length(p->>'rentTerms')>500) then return false; end if;
 return true;
end;
$$;
revoke all on function private.market_resale_details_valid(jsonb) from public,anon,authenticated,service_role;
alter table public.market_startup_posts add column resale_details jsonb,
 add constraint market_startup_resale_details_check check(private.market_resale_details_valid(resale_details)),
 add constraint market_startup_resale_category_check check(category_code='screenResale' or
   (resale_details is null and public_contact_method is null and public_contact_value is null and public_contact_consent_at is null));
create table public.market_startup_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.market_startup_posts (id) on delete cascade,
  uploaded_by_user_id uuid not null references public.user_accounts (id),
  storage_bucket text not null default 'market-startup-media',
  storage_path text not null unique,
  sort_order smallint not null,
  media_status text not null default 'pending_upload',
  declared_mime_type text not null,
  declared_size_bytes bigint not null,
  verified_mime_type text,
  verified_size_bytes bigint,
  available_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cleanup_checked_at timestamptz,
  version integer not null default 1,
  constraint market_startup_media_bucket_check check (storage_bucket = 'market-startup-media'),
  constraint market_startup_media_path_check
    check (storage_path = post_id::text || '/' || id::text || '/original'),
  constraint market_startup_media_sort_check check (sort_order between 0 and 4),
  constraint market_startup_media_status_check
    check (media_status in ('pending_upload', 'available', 'failed', 'removed')),
  constraint market_startup_media_mime_check
    check (declared_mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  constraint market_startup_media_size_check check (declared_size_bytes between 1 and 8388608),
  constraint market_startup_media_verified_check
    check (
      (media_status = 'pending_upload' and verified_mime_type is null and verified_size_bytes is null and available_at is null and removed_at is null)
      or (media_status = 'failed' and available_at is null and removed_at is null)
      or (media_status = 'available' and verified_mime_type = declared_mime_type and verified_size_bytes = declared_size_bytes and available_at is not null and removed_at is null)
      or (media_status = 'removed' and removed_at is not null)
    ),
  constraint market_startup_media_version_check check (version >= 1)
);

create unique index market_startup_media_active_order_uidx
  on public.market_startup_media (post_id, sort_order)
  where media_status in ('pending_upload', 'available');
create index market_startup_media_available_idx
  on public.market_startup_media (post_id, sort_order)
  where media_status = 'available';

alter table public.market_startup_media enable row level security;
alter table public.market_startup_media force row level security;
revoke all on table public.market_startup_media from public,anon,authenticated,service_role;
create trigger market_startup_media_set_updated_at before update on public.market_startup_media for each row execute function public.set_user_foundation_updated_at();
-- Cross-table invariant also applies to the unchanged legacy RPC.
create function private.market_startup_category_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.category_code <> 'screenResale' and exists(select 1 from public.market_startup_media
   where post_id=new.id and media_status in ('pending_upload','available')) then
   raise exception '사진이 있는 글은 매장매매 카테고리를 유지해 주세요.';
 end if;
 return new;
end;
$$;
revoke all on function private.market_startup_category_guard() from public,anon,authenticated,service_role;
create trigger market_startup_category_guard before update of category_code on public.market_startup_posts
 for each row execute function private.market_startup_category_guard();

-- Every media writer takes account -> post -> media. The first lookup is not a lock.
create function private.market_lock_startup_media(p_actor uuid,p_media uuid,p_require_active boolean default true)
returns public.market_startup_media language plpgsql security definer set search_path='' as $$
declare v_account text; v_post_id uuid; v_post public.market_startup_posts%rowtype; v_media public.market_startup_media%rowtype;
begin
 select account_status into v_account from public.user_accounts where id=p_actor for share;
 if v_account is null or (p_require_active and v_account<>'active') then raise exception '정상 활동 계정만 사진을 처리할 수 있습니다.'; end if;
 select post_id into v_post_id from public.market_startup_media where id=p_media and uploaded_by_user_id=p_actor;
 select * into v_post from public.market_startup_posts where id=v_post_id for update;
 select * into v_media from public.market_startup_media where id=p_media for update;
 if v_post.id is null or v_media.id is null or v_media.post_id<>v_post.id or
   v_post.author_user_id<>p_actor or v_media.uploaded_by_user_id<>p_actor then
   raise exception '사진 업로드 정보를 찾을 수 없습니다.';
 end if;
 return v_media;
end;
$$;
revoke all on function private.market_lock_startup_media(uuid,uuid,boolean) from public,anon,authenticated,service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('market-startup-media','market-startup-media',false,8388608,array['image/jpeg','image/png','image/webp']);
create function public.create_market_startup_media_upload_intent(
  p_post_key text,
  p_declared_mime_type text,
  p_declared_size_bytes bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := private.market_assert_active_actor();
  v_listing public.market_startup_posts%rowtype;
  v_media_id uuid := gen_random_uuid();
  p_post_id uuid;
  v_sort_order smallint;
begin
  select listing.* into v_listing
  from public.market_startup_posts as listing
  where listing.post_key = p_post_key
  for update;
  p_post_id := v_listing.id;
  if v_listing.id is null or v_listing.publication_status <> 'published' or v_listing.category_code <> 'screenResale' then
    raise exception '매장매매 글을 찾을 수 없습니다.';
  end if;
  if v_listing.author_user_id <> v_actor_id then
    raise exception '본인의 매장매매 글에만 사진을 등록할 수 있습니다.';
  end if;
  if v_listing.board_status <> 'open' then
    raise exception '거래 완료된 매장매매 글에는 사진을 등록할 수 없습니다.';
  end if;
  if p_declared_mime_type is null or p_declared_mime_type not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'JPG, PNG, WebP 이미지만 등록할 수 있습니다.';
  end if;
  if p_declared_size_bytes is null or p_declared_size_bytes not between 1 and 8388608 then
    raise exception '사진 파일은 8MB 이하여야 합니다.';
  end if;

  select candidate.sort_order into v_sort_order
  from pg_catalog.generate_series(0, 4) as candidate(sort_order)
  where not exists (
    select 1 from public.market_startup_media as media
    where media.post_id = p_post_id
      and media.sort_order = candidate.sort_order
      and media.media_status in ('pending_upload', 'available')
  )
  order by candidate.sort_order limit 1;
  if v_sort_order is null then
    raise exception '매장 사진은 최대 5장까지 등록할 수 있습니다.';
  end if;

  insert into public.market_startup_media (
    id, post_id, uploaded_by_user_id, storage_path, sort_order,
    declared_mime_type, declared_size_bytes
  ) values (
    v_media_id, p_post_id, v_actor_id,
    p_post_id::text || '/' || v_media_id::text || '/original', v_sort_order,
    p_declared_mime_type, p_declared_size_bytes
  );
  return pg_catalog.jsonb_build_object(
    'media_id', v_media_id, 'media_status', 'pending_upload',
    'sort_order', v_sort_order, 'version', 1
  );
end;
$$;

comment on function public.create_market_startup_media_upload_intent(text, text, bigint) is
  'Creates one owner-scoped metadata intent for a server-signed market image upload.';
revoke all on function public.create_market_startup_media_upload_intent(text, text, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.create_market_startup_media_upload_intent(text, text, bigint)
  to authenticated;

create function public.get_market_startup_media_upload_context_server(
  p_actor_user_id uuid,
  p_media_id uuid
)
returns table (
  media_id uuid,
  storage_bucket text,
  storage_path text,
  declared_mime_type text,
  declared_size_bytes bigint,
  media_version integer
)
language sql
security definer
set search_path = ''
as $$
  select media.id, media.storage_bucket, media.storage_path,
    media.declared_mime_type, media.declared_size_bytes, media.version
  from public.market_startup_media as media
  join public.market_startup_posts as listing on listing.id = media.post_id
  join public.user_accounts as account on account.id = p_actor_user_id
  where media.id = p_media_id
    and media.uploaded_by_user_id = p_actor_user_id
    and media.media_status in ('pending_upload','available')
    and listing.author_user_id = p_actor_user_id
    and listing.board_status='open' and listing.publication_status='published' and listing.category_code='screenResale'
    and account.account_status = 'active';
$$;

comment on function public.get_market_startup_media_upload_context_server(uuid, uuid) is
  'Service-only owner-scoped market upload context.';
revoke all on function public.get_market_startup_media_upload_context_server(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_market_startup_media_upload_context_server(uuid, uuid)
  to service_role;

create function public.finalize_market_startup_media_upload_server(
  p_actor_user_id uuid,
  p_media_id uuid,
  p_verified_mime_type text,
  p_verified_size_bytes bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_media public.market_startup_media%rowtype;
  v_listing public.market_startup_posts%rowtype;
begin
  v_media := private.market_lock_startup_media(p_actor_user_id,p_media_id);
  select listing.* into v_listing
  from public.market_startup_posts as listing
  where listing.id = v_media.post_id;
  if v_listing.author_user_id <> p_actor_user_id or v_listing.board_status <> 'open' or v_listing.publication_status <> 'published' or v_listing.category_code <> 'screenResale' then
    raise exception '사진 등록을 완료할 권한이 없습니다.';
  end if;
  if v_media.media_status = 'available' then
    if v_media.verified_mime_type = p_verified_mime_type and v_media.verified_size_bytes = p_verified_size_bytes then
      return pg_catalog.jsonb_build_object('media_id', v_media.id, 'media_status', 'available', 'version', v_media.version, 'replayed', true);
    end if;
    raise exception '이미 완료된 사진 정보와 검증 값이 다릅니다.';
  end if;
  if v_media.media_status <> 'pending_upload' then
    raise exception '완료할 수 없는 사진 업로드 상태입니다.';
  end if;
  if p_verified_mime_type <> v_media.declared_mime_type or p_verified_size_bytes <> v_media.declared_size_bytes then
    raise exception '업로드한 사진 파일이 등록 정보와 일치하지 않습니다.';
  end if;
  update public.market_startup_media
  set media_status = 'available', verified_mime_type = p_verified_mime_type,
      verified_size_bytes = p_verified_size_bytes, available_at = now(), version = version + 1
  where id = v_media.id;
  return pg_catalog.jsonb_build_object('media_id', v_media.id, 'media_status', 'available', 'version', v_media.version + 1, 'replayed', false);
end;
$$;

comment on function public.finalize_market_startup_media_upload_server(uuid, uuid, text, bigint) is
  'Service-only byte-verified market photo finalize.';
revoke all on function public.finalize_market_startup_media_upload_server(uuid, uuid, text, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.finalize_market_startup_media_upload_server(uuid, uuid, text, bigint)
  to service_role;

create function public.mark_market_startup_media_upload_failed_server(
  p_actor_user_id uuid,
  p_media_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.market_lock_startup_media(p_actor_user_id,p_media_id);
  update public.market_startup_media
  set media_status = 'failed', version = version + 1
  where id = p_media_id and uploaded_by_user_id = p_actor_user_id and media_status = 'pending_upload';
end;
$$;

revoke all on function public.mark_market_startup_media_upload_failed_server(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.mark_market_startup_media_upload_failed_server(uuid, uuid)
  to service_role;

-- Mark metadata removed even when the previous application uses its unchanged remove RPC.
create function private.market_startup_remove_media() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.publication_status in ('hidden','removed') or new.board_status='closed' then
   update public.market_startup_media set media_status='removed',removed_at=now(),version=version+1 where post_id=new.id and media_status<>'removed';
 end if;
 return new;
end;
$$;
revoke all on function private.market_startup_remove_media() from public,anon,authenticated,service_role;
create trigger market_startup_remove_media after update on public.market_startup_posts for each row execute function private.market_startup_remove_media();

create function private.market_startup_extras(p_post_key text) returns jsonb language sql stable security definer set search_path='' as $$
 select pg_catalog.jsonb_build_object('resale_details',p.resale_details,
 'public_contact_method',case when private.market_contact_viewer_active() and p.board_status='open' and p.public_contact_consent_at is not null then p.public_contact_method else null end,
 'public_contact_value',case when private.market_contact_viewer_active() and p.board_status='open' and p.public_contact_consent_at is not null then p.public_contact_value else null end,
 'image_paths',coalesce((select pg_catalog.jsonb_agg(m.storage_path order by m.sort_order,m.id) from public.market_startup_media m where m.post_id=p.id and m.media_status='available' and p.category_code='screenResale' and p.board_status='open'),'[]'::jsonb))
 from public.market_startup_posts p where p.post_key=p_post_key and p.publication_status='published';
$$;
revoke all on function private.market_startup_extras(text) from public,anon,authenticated,service_role;
create function public.get_market_startup_post_v2(p_post_key text) returns jsonb language sql stable security definer set search_path='' as $$
 select pg_catalog.jsonb_build_object('post',public.get_market_startup_post(p_post_key))||private.market_startup_extras(p_post_key);
$$;
revoke all on function public.get_market_startup_post_v2(text) from public, anon, authenticated, service_role;
grant execute on function public.get_market_startup_post_v2(text) to anon,authenticated;

create function public.get_my_market_startup_post_context_v2(p_post_key text) returns jsonb language sql stable security definer set search_path='' as $$
 select pg_catalog.jsonb_build_object('post',public.get_my_market_startup_post_mutation_context(p_post_key))||private.market_startup_extras(p_post_key);
$$;
revoke all on function public.get_my_market_startup_post_context_v2(text) from public, anon, authenticated, service_role;
grant execute on function public.get_my_market_startup_post_context_v2(text) to authenticated;

create function public.mutate_market_startup_post_v2(p_operation text,p_post_key text,p_expected_version integer,p_payload jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=private.market_assert_active_actor(); v_claim jsonb; v_result jsonb; v_contact text; v_paths jsonb:='[]'::jsonb;
begin
 if p_operation is null or p_operation not in ('create','update','close','remove') then raise exception '지원하지 않는 작업입니다.'; end if;
 v_claim := private.market_claim_sha256_request(v_actor,p_request_id,'market.startup.v2.'||p_operation,
   pg_catalog.jsonb_build_object('post_key',p_post_key,'version',p_expected_version,'payload',p_payload));
 if v_claim is not null then return v_claim||pg_catalog.jsonb_build_object('replayed',true); end if;
 -- Serialize category changes and removal with the owner upload-intent lock.
 if p_operation<>'create' then
   perform 1 from public.market_startup_posts where post_key=p_post_key for update;
 end if;
 if p_operation in ('create','update') then
   if not private.market_resale_details_valid(p_payload->'resale_details') then raise exception '매장 정보 입력 범위를 확인해 주세요.'; end if;
   if p_payload->>'category'<>'screenResale' and (nullif(p_payload->'resale_details','null'::jsonb) is not null or nullif(p_payload->>'public_contact_method','') is not null) then raise exception '매장 정보는 스크린 매매 글에만 입력할 수 있습니다.'; end if;
   if (p_payload->>'category'='screenResale' and p_payload->>'consultation_type'='transfer') or nullif(p_payload->>'public_contact_method','') is not null then
     if p_payload->'public_contact_consent' is distinct from 'true'::jsonb then raise exception '연락처 공개 안내에 동의해 주세요.'; end if;
     v_contact:=private.market_normalize_public_contact(p_payload->>'public_contact_method',p_payload->>'public_contact_value');
   end if;
   -- Existing photos cannot silently migrate to a different startup category.
   if p_operation='update' and p_payload->>'category'<>'screenResale' and exists(select 1 from public.market_startup_media m join public.market_startup_posts p on p.id=m.post_id where p.post_key=p_post_key and m.media_status in ('pending_upload','available')) then raise exception '사진이 있는 글은 매장매매 카테고리를 유지해 주세요.'; end if;
 end if;
 v_result:=public.mutate_market_startup_post(p_operation,p_post_key,p_expected_version,p_payload);
 if p_operation in ('close','remove') then
   select coalesce(pg_catalog.jsonb_agg(m.storage_path),'[]'::jsonb) into v_paths from public.market_startup_media m join public.market_startup_posts p on p.id=m.post_id where p.post_key=p_post_key and p.author_user_id=v_actor;
 end if;
 if p_operation in ('create','update') then
   update public.market_startup_posts set resale_details=nullif(p_payload->'resale_details','null'::jsonb),
   public_contact_method=case when v_contact is not null then p_payload->>'public_contact_method' else null end,
   public_contact_value=v_contact,public_contact_consent_at=case when v_contact is not null then now() else null end
   where post_key=v_result->>'post_key' and author_user_id=v_actor;
 end if;
 v_result:=v_result||pg_catalog.jsonb_build_object('removed_storage_paths',v_paths,'replayed',false);
 perform private.market_complete_request(v_actor,p_request_id,v_result);
 return v_result;
end;
$$;
revoke all on function public.mutate_market_startup_post_v2(text,text,integer,jsonb,uuid) from public, anon, authenticated, service_role;
grant execute on function public.mutate_market_startup_post_v2(text,text,integer,jsonb,uuid) to authenticated;


-- Preserve the official Beta upload-context contract, including during app rollback.
create or replace function public.get_market_media_upload_context_server(
  p_actor_user_id uuid,
  p_media_id uuid
)
returns table (
  media_id uuid,
  storage_bucket text,
  storage_path text,
  declared_mime_type text,
  declared_size_bytes bigint,
  media_version integer
)
language sql
security definer
set search_path = ''
as $$
  select media.id, media.storage_bucket, media.storage_path,
    media.declared_mime_type, media.declared_size_bytes, media.version
  from public.market_listing_media as media
  join public.market_listings as listing on listing.id = media.listing_id
  join public.user_accounts as account on account.id = p_actor_user_id
  where media.id = p_media_id
    and media.uploaded_by_user_id = p_actor_user_id
    and media.media_status = 'pending_upload'
    and listing.seller_user_id = p_actor_user_id
    and listing.listing_status in ('selling', 'reserved')
    and account.account_status = 'active';
$$;

comment on function public.get_market_media_upload_context_server(uuid, uuid) is
  'Service-only owner-scoped market upload context.';
revoke all on function public.get_market_media_upload_context_server(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_market_media_upload_context_server(uuid, uuid)
  to service_role;

-- Candidate-only state contract: recovery does not broaden the legacy upload RPC.
create function public.get_market_media_state_server(p_actor_user_id uuid,p_media_id uuid)
returns table(media_id uuid,storage_bucket text,storage_path text,declared_mime_type text,
  declared_size_bytes bigint,media_status text,media_version integer,listing_status text)
language sql stable security definer set search_path='' as $$
  select m.id,m.storage_bucket,m.storage_path,m.declared_mime_type,m.declared_size_bytes,
    m.media_status,m.version,p.listing_status
  from public.market_listing_media m join public.market_listings p on p.id=m.listing_id
  join public.user_accounts a on a.id=p_actor_user_id
  where m.id=p_media_id and m.uploaded_by_user_id=p_actor_user_id
    and p.seller_user_id=p_actor_user_id and a.account_status='active'
    and m.storage_bucket='market-media' and m.storage_path=p.id::text||'/'||m.id::text||'/original'
    and m.declared_mime_type in ('image/jpeg','image/png','image/webp')
    and m.declared_size_bytes between 1 and 8388608
    and m.media_status in ('pending_upload','available','failed','removed')
    and (m.media_status<>'available' or (m.verified_mime_type=m.declared_mime_type
      and m.verified_size_bytes=m.declared_size_bytes and m.available_at is not null));
$$;
revoke all on function public.get_market_media_state_server(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_market_media_state_server(uuid,uuid) to service_role;
create function public.get_market_startup_media_state_server(p_actor_user_id uuid,p_media_id uuid) returns text language sql stable security definer set search_path='' as $$
 select m.media_status from public.market_startup_media m join public.market_startup_posts p on p.id=m.post_id join public.user_accounts a on a.id=p_actor_user_id
 where m.id=p_media_id and m.uploaded_by_user_id=p_actor_user_id and p.author_user_id=p_actor_user_id and a.account_status='active';
$$;
revoke all on function public.get_market_startup_media_state_server(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_market_startup_media_state_server(uuid,uuid) to service_role;

-- Read URLs are issued only by the server after this live visibility check.
create function public.get_market_startup_media_read_context_server(p_post_key text,p_media_id uuid)
returns text language sql stable security definer set search_path='' as $$
 select m.storage_path from public.market_startup_media m join public.market_startup_posts p on p.id=m.post_id
 where p.post_key=p_post_key and m.id=p_media_id and p.publication_status='published'
 and p.board_status='open' and p.category_code='screenResale' and m.media_status='available';
$$;
revoke all on function public.get_market_startup_media_read_context_server(text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_market_startup_media_read_context_server(text,uuid) to service_role;

-- Browser callers supply an ID, never a bucket/path. Terminal states cannot finalize.
create function public.get_market_startup_media_cleanup_path_server(p_actor_user_id uuid,p_media_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare v_media public.market_startup_media%rowtype;
begin
 v_media:=private.market_lock_startup_media(p_actor_user_id,p_media_id);
 if v_media.media_status in ('failed','removed') then return v_media.storage_path; end if;
 return null;
end;
$$;
revoke all on function public.get_market_startup_media_cleanup_path_server(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_market_startup_media_cleanup_path_server(uuid,uuid) to service_role;

create function public.get_market_media_cleanup_path_server(p_actor_user_id uuid,p_media_id uuid)
returns text language sql stable security definer set search_path='' as $$
 select m.storage_path from public.market_listing_media m join public.market_listings p on p.id=m.listing_id
 join public.user_accounts a on a.id=p_actor_user_id where m.id=p_media_id and m.uploaded_by_user_id=p_actor_user_id
 and p.seller_user_id=p_actor_user_id and a.account_status='active' and m.media_status in ('failed','removed');
$$;
revoke all on function public.get_market_media_cleanup_path_server(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_market_media_cleanup_path_server(uuid,uuid) to service_role;

-- Bounded, repeatable sweep; never permanently acknowledge a path while an old
-- two-hour signed upload token could still recreate it. No Storage SQL deletes.
create function public.reconcile_market_startup_media_server(p_limit integer default 20)
returns table(storage_path text) language plpgsql security definer set search_path='' as $$
declare v_candidate record; v_media public.market_startup_media%rowtype; v_post public.market_startup_posts%rowtype;
begin
 for v_candidate in select q.* from (
   select m.id,m.uploaded_by_user_id,m.post_id from public.market_startup_media m
   join public.market_startup_posts p on p.id=m.post_id
   where m.media_status in ('failed','removed') or p.publication_status<>'published' or p.board_status<>'open'
      or (m.media_status='pending_upload' and m.created_at<clock_timestamp()-interval '2 hours 5 minutes')
   order by m.cleanup_checked_at nulls first,m.created_at,m.id limit greatest(1,least(coalesce(p_limit,20),100))
 ) q order by q.uploaded_by_user_id,q.post_id,q.id loop
   v_media:=private.market_lock_startup_media(v_candidate.uploaded_by_user_id,v_candidate.id,false);
   select * into v_post from public.market_startup_posts where id=v_media.post_id;
   if v_post.publication_status<>'published' or v_post.board_status<>'open' or v_post.category_code<>'screenResale' then
     update public.market_startup_media set media_status='removed',removed_at=coalesce(removed_at,now()),version=version+1
       where id=v_media.id and media_status<>'removed';
   elsif v_media.media_status='pending_upload' and v_media.created_at<clock_timestamp()-interval '2 hours 5 minutes' then
     update public.market_startup_media set media_status='failed',version=version+1 where id=v_media.id;
   elsif v_media.media_status not in ('failed','removed') then continue;
   end if;
   update public.market_startup_media set cleanup_checked_at=clock_timestamp() where id=v_media.id;
   storage_path:=v_media.storage_path; return next;
 end loop;
end;
$$;
revoke all on function public.reconcile_market_startup_media_server(integer) from public,anon,authenticated,service_role;
grant execute on function public.reconcile_market_startup_media_server(integer) to service_role;

commit;
