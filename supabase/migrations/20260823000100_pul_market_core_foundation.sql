-- PUL 8-9: real-data marketplace listings, wanted requests, and signed product media.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'market-media',
  'market-media',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
);

create table public.market_listings (
  id uuid primary key default gen_random_uuid(),
  seller_user_id uuid not null references public.user_accounts (id),
  title text not null,
  category_code text not null,
  price_amount bigint not null,
  region_code text not null,
  condition_code text not null,
  trade_type_code text not null,
  listing_status text not null default 'selling',
  description text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz,
  version integer not null default 1,
  constraint market_listings_title_check
    check (title = pg_catalog.btrim(title) and pg_catalog.char_length(title) between 2 and 100),
  constraint market_listings_category_check
    check (category_code in ('club', 'ball', 'bag', 'apparel', 'shoes', 'practice', 'other')),
  constraint market_listings_price_check check (price_amount between 1 and 1000000000),
  constraint market_listings_region_check
    check (region_code in ('서울', '경기', '인천', '충청', '강원', '전라', '경상', '제주')),
  constraint market_listings_condition_check
    check (condition_code in ('likeNew', 'lightUse', 'normal', 'needsRepair')),
  constraint market_listings_trade_type_check
    check (trade_type_code in ('direct', 'delivery', 'negotiable')),
  constraint market_listings_status_check
    check (listing_status in ('selling', 'reserved', 'sold', 'removed')),
  constraint market_listings_description_check
    check (description = pg_catalog.btrim(description) and pg_catalog.char_length(description) between 10 and 2000),
  constraint market_listings_removed_check
    check ((listing_status = 'removed') = (removed_at is not null)),
  constraint market_listings_version_check check (version >= 1)
);

create index market_listings_public_page_idx
  on public.market_listings (created_at desc, id desc)
  where listing_status <> 'removed';
create index market_listings_public_filters_idx
  on public.market_listings (category_code, region_code, listing_status, created_at desc, id desc)
  where listing_status <> 'removed';
create index market_listings_owner_idx
  on public.market_listings (seller_user_id, created_at desc);

create table public.market_buy_requests (
  id uuid primary key default gen_random_uuid(),
  author_user_id uuid not null references public.user_accounts (id),
  title text not null,
  category_code text not null,
  budget_amount bigint not null,
  region_code text not null,
  summary text not null,
  request_status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz,
  version integer not null default 1,
  constraint market_buy_requests_title_check
    check (title = pg_catalog.btrim(title) and pg_catalog.char_length(title) between 2 and 100),
  constraint market_buy_requests_category_check
    check (category_code in ('club', 'ball', 'bag', 'apparel', 'shoes', 'practice', 'other')),
  constraint market_buy_requests_budget_check check (budget_amount between 1 and 1000000000),
  constraint market_buy_requests_region_check
    check (region_code in ('서울', '경기', '인천', '충청', '강원', '전라', '경상', '제주')),
  constraint market_buy_requests_summary_check
    check (summary = pg_catalog.btrim(summary) and pg_catalog.char_length(summary) between 10 and 1000),
  constraint market_buy_requests_status_check check (request_status in ('open', 'closed', 'removed')),
  constraint market_buy_requests_removed_check
    check ((request_status = 'removed') = (removed_at is not null)),
  constraint market_buy_requests_version_check check (version >= 1)
);

create index market_buy_requests_public_page_idx
  on public.market_buy_requests (created_at desc, id desc)
  where request_status <> 'removed';
create index market_buy_requests_owner_idx
  on public.market_buy_requests (author_user_id, created_at desc);

create table public.market_listing_media (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.market_listings (id) on delete cascade,
  uploaded_by_user_id uuid not null references public.user_accounts (id),
  storage_bucket text not null default 'market-media',
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
  version integer not null default 1,
  constraint market_listing_media_bucket_check check (storage_bucket = 'market-media'),
  constraint market_listing_media_path_check
    check (storage_path = listing_id::text || '/' || id::text || '/original'),
  constraint market_listing_media_sort_check check (sort_order between 0 and 4),
  constraint market_listing_media_status_check
    check (media_status in ('pending_upload', 'available', 'failed', 'removed')),
  constraint market_listing_media_mime_check
    check (declared_mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  constraint market_listing_media_size_check check (declared_size_bytes between 1 and 8388608),
  constraint market_listing_media_verified_check
    check (
      (media_status = 'pending_upload' and verified_mime_type is null and verified_size_bytes is null and available_at is null and removed_at is null)
      or (media_status = 'failed' and available_at is null and removed_at is null)
      or (media_status = 'available' and verified_mime_type = declared_mime_type and verified_size_bytes = declared_size_bytes and available_at is not null and removed_at is null)
      or (media_status = 'removed' and removed_at is not null)
    ),
  constraint market_listing_media_version_check check (version >= 1)
);

create unique index market_listing_media_active_order_uidx
  on public.market_listing_media (listing_id, sort_order)
  where media_status in ('pending_upload', 'available');
create index market_listing_media_available_idx
  on public.market_listing_media (listing_id, sort_order)
  where media_status = 'available';

create table public.market_status_history (
  id uuid primary key default gen_random_uuid(),
  entity_kind text not null,
  listing_id uuid references public.market_listings (id) on delete cascade,
  buy_request_id uuid references public.market_buy_requests (id) on delete cascade,
  entity_version integer not null,
  from_status text,
  to_status text not null,
  actor_user_id uuid not null references public.user_accounts (id),
  request_id uuid not null,
  created_at timestamptz not null default now(),
  constraint market_status_history_kind_check check (entity_kind in ('listing', 'buy_request')),
  constraint market_status_history_entity_check check (
    (entity_kind = 'listing' and listing_id is not null and buy_request_id is null)
    or (entity_kind = 'buy_request' and listing_id is null and buy_request_id is not null)
  ),
  constraint market_status_history_version_check check (entity_version >= 1)
);

create unique index market_listing_status_history_version_uidx
  on public.market_status_history (listing_id, entity_version)
  where entity_kind = 'listing';
create unique index market_buy_request_status_history_version_uidx
  on public.market_status_history (buy_request_id, entity_version)
  where entity_kind = 'buy_request';

create table private.market_mutation_requests (
  actor_user_id uuid not null references public.user_accounts (id),
  request_id uuid not null,
  action_code text not null,
  request_fingerprint text not null,
  result_data jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (actor_user_id, request_id),
  constraint market_mutation_requests_result_check
    check ((completed_at is null and result_data is null) or (completed_at is not null and result_data is not null))
);

create table private.market_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references public.user_accounts (id),
  request_id uuid not null,
  action_code text not null,
  entity_kind text not null,
  entity_id uuid not null,
  before_data jsonb,
  after_data jsonb not null,
  created_at timestamptz not null default now(),
  unique (actor_user_id, request_id)
);

create trigger market_listings_set_updated_at
before update on public.market_listings
for each row execute function public.set_user_foundation_updated_at();
create trigger market_buy_requests_set_updated_at
before update on public.market_buy_requests
for each row execute function public.set_user_foundation_updated_at();
create trigger market_listing_media_set_updated_at
before update on public.market_listing_media
for each row execute function public.set_user_foundation_updated_at();

alter table public.market_listings enable row level security;
alter table public.market_listings force row level security;
alter table public.market_buy_requests enable row level security;
alter table public.market_buy_requests force row level security;
alter table public.market_listing_media enable row level security;
alter table public.market_listing_media force row level security;
alter table public.market_status_history enable row level security;
alter table public.market_status_history force row level security;

revoke all on table public.market_listings from public, anon, authenticated, service_role;
revoke all on table public.market_buy_requests from public, anon, authenticated, service_role;
revoke all on table public.market_listing_media from public, anon, authenticated, service_role;
revoke all on table public.market_status_history from public, anon, authenticated, service_role;
revoke all on table private.market_mutation_requests from public, anon, authenticated, service_role;
revoke all on table private.market_audit_log from public, anon, authenticated, service_role;

create function private.market_actor_display_name(p_user_id uuid, p_viewer_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when profile.user_id is null then 'PUL 회원'
    when profile.profile_visibility = 'public' or profile.user_id = p_viewer_id
      then coalesce(nullif(pg_catalog.btrim(profile.nickname), ''), nullif(pg_catalog.btrim(profile.display_name), ''), 'PUL 회원')
    else 'PUL 회원'
  end
  from (select 1) as singleton
  left join public.user_profiles as profile on profile.user_id = p_user_id;
$$;

revoke all on function private.market_actor_display_name(uuid, uuid)
  from public, anon, authenticated, service_role;

create function private.market_assert_active_actor()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_status text;
begin
  if v_actor_id is null then
    raise exception '로그인이 필요합니다.';
  end if;
  select account.account_status into v_status
  from public.user_accounts as account
  where account.id = v_actor_id
  for share;
  if v_status is distinct from 'active' then
    raise exception '정상 활동 계정만 장터를 이용할 수 있습니다.';
  end if;
  return v_actor_id;
end;
$$;

revoke all on function private.market_assert_active_actor()
  from public, anon, authenticated, service_role;

create function private.market_claim_request(
  p_actor_user_id uuid,
  p_request_id uuid,
  p_action_code text,
  p_request_payload jsonb
)
returns table (replayed boolean, result_data jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request private.market_mutation_requests%rowtype;
  v_fingerprint text := md5(p_request_payload::text);
begin
  if p_request_id is null then
    raise exception 'request_id가 필요합니다.';
  end if;
  insert into private.market_mutation_requests (
    actor_user_id, request_id, action_code, request_fingerprint
  ) values (
    p_actor_user_id, p_request_id, p_action_code, v_fingerprint
  ) on conflict do nothing;

  select request.* into v_request
  from private.market_mutation_requests as request
  where request.actor_user_id = p_actor_user_id and request.request_id = p_request_id
  for update;

  if v_request.action_code <> p_action_code or v_request.request_fingerprint <> v_fingerprint then
    raise exception 'request_id가 다른 장터 요청에 이미 사용되었습니다.';
  end if;
  if v_request.completed_at is not null then
    return query select true, v_request.result_data;
    return;
  end if;
  return query select false, null::jsonb;
end;
$$;

revoke all on function private.market_claim_request(uuid, uuid, text, jsonb)
  from public, anon, authenticated, service_role;

create function private.market_complete_request(
  p_actor_user_id uuid,
  p_request_id uuid,
  p_result_data jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  update private.market_mutation_requests
  set result_data = p_result_data, completed_at = now()
  where actor_user_id = p_actor_user_id
    and request_id = p_request_id
    and completed_at is null;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception '장터 요청 완료 기록을 저장하지 못했습니다.';
  end if;
end;
$$;

revoke all on function private.market_complete_request(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;

create function public.list_market_listings(
  p_keyword text default null,
  p_category_code text default null,
  p_region_code text default null,
  p_listing_status text default null,
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
  v_keyword text := nullif(pg_catalog.btrim(p_keyword), '');
  v_limit integer := least(greatest(coalesce(p_limit, 24), 1), 30);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_items jsonb;
  v_total integer;
begin
  if p_category_code is not null and p_category_code not in ('club', 'ball', 'bag', 'apparel', 'shoes', 'practice', 'other') then
    raise exception '카테고리 입력을 확인해 주세요.';
  end if;
  if p_region_code is not null and p_region_code not in ('서울', '경기', '인천', '충청', '강원', '전라', '경상', '제주') then
    raise exception '지역 입력을 확인해 주세요.';
  end if;
  if p_listing_status is not null and p_listing_status not in ('selling', 'reserved', 'sold') then
    raise exception '판매 상태 입력을 확인해 주세요.';
  end if;

  select pg_catalog.count(*) into v_total
  from public.market_listings as listing
  where listing.listing_status <> 'removed'
    and (p_category_code is null or listing.category_code = p_category_code)
    and (p_region_code is null or listing.region_code = p_region_code)
    and (p_listing_status is null or listing.listing_status = p_listing_status)
    and (v_keyword is null or listing.title ilike '%' || v_keyword || '%' or listing.description ilike '%' || v_keyword || '%');

  select coalesce(pg_catalog.jsonb_agg(page.item order by page.created_at desc, page.id desc), '[]'::jsonb)
  into v_items
  from (
    select listing.id, listing.created_at,
      pg_catalog.jsonb_build_object(
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
        'seller_display_name', private.market_actor_display_name(listing.seller_user_id, v_actor_id),
        'created_at', listing.created_at,
        'updated_at', listing.updated_at,
        'version', listing.version,
        'can_edit', listing.seller_user_id = v_actor_id,
        'image_paths', coalesce((
          select pg_catalog.jsonb_agg(media.storage_path order by media.sort_order, media.id)
          from public.market_listing_media as media
          where media.listing_id = listing.id and media.media_status = 'available'
        ), '[]'::jsonb)
      ) as item
    from public.market_listings as listing
    where listing.listing_status <> 'removed'
      and (p_category_code is null or listing.category_code = p_category_code)
      and (p_region_code is null or listing.region_code = p_region_code)
      and (p_listing_status is null or listing.listing_status = p_listing_status)
      and (v_keyword is null or listing.title ilike '%' || v_keyword || '%' or listing.description ilike '%' || v_keyword || '%')
    order by listing.created_at desc, listing.id desc
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

comment on function public.list_market_listings(text, text, text, text, integer, integer) is
  'Public paginated market listing read without private seller identifiers.';
revoke all on function public.list_market_listings(text, text, text, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_market_listings(text, text, text, text, integer, integer)
  to anon, authenticated;

create function public.get_market_listing(p_listing_id uuid)
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
    'can_edit', listing.seller_user_id = auth.uid(),
    'image_paths', coalesce((
      select pg_catalog.jsonb_agg(media.storage_path order by media.sort_order, media.id)
      from public.market_listing_media as media
      where media.listing_id = listing.id and media.media_status = 'available'
    ), '[]'::jsonb)
  )
  from public.market_listings as listing
  where listing.id = p_listing_id and listing.listing_status <> 'removed';
$$;

comment on function public.get_market_listing(uuid) is
  'Public detail read for one visible market listing.';
revoke all on function public.get_market_listing(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_market_listing(uuid) to anon, authenticated;

create function public.list_market_buy_requests(
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
  v_limit integer := least(greatest(coalesce(p_limit, 24), 1), 30);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_items jsonb;
  v_total integer;
begin
  select pg_catalog.count(*) into v_total
  from public.market_buy_requests as request
  where request.request_status <> 'removed';

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
        'can_edit', request.author_user_id = v_actor_id
      ) as item
    from public.market_buy_requests as request
    where request.request_status <> 'removed'
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

comment on function public.list_market_buy_requests(integer, integer) is
  'Public paginated wanted-post read without private author identifiers.';
revoke all on function public.list_market_buy_requests(integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_market_buy_requests(integer, integer)
  to anon, authenticated;

create function public.get_market_buy_request(p_buy_request_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'id', request.id,
    'title', request.title,
    'category', request.category_code,
    'region', request.region_code,
    'budget', request.budget_amount,
    'summary', request.summary,
    'author_display_name', private.market_actor_display_name(request.author_user_id, auth.uid()),
    'request_status', request.request_status,
    'created_at', request.created_at,
    'updated_at', request.updated_at,
    'version', request.version,
    'can_edit', request.author_user_id = auth.uid()
  )
  from public.market_buy_requests as request
  where request.id = p_buy_request_id and request.request_status <> 'removed';
$$;

comment on function public.get_market_buy_request(uuid) is
  'Public detail read for one visible wanted post.';
revoke all on function public.get_market_buy_request(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_market_buy_request(uuid) to anon, authenticated;

create function public.mutate_market_listing(
  p_operation text,
  p_listing_id uuid,
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
  v_action text := 'market.listing.' || coalesce(p_operation, '');
  v_claim record;
  v_listing public.market_listings%rowtype;
  v_before jsonb;
  v_result jsonb;
  v_title text := nullif(pg_catalog.btrim(p_payload->>'title'), '');
  v_category text := p_payload->>'category';
  v_region text := p_payload->>'region';
  v_condition text := p_payload->>'condition';
  v_trade_type text := p_payload->>'trade_type';
  v_description text := nullif(pg_catalog.btrim(p_payload->>'description'), '');
  v_price bigint;
  v_next_status text;
  v_removed_paths jsonb := '[]'::jsonb;
begin
  if p_operation not in ('create', 'update', 'reserve', 'sell', 'delete') then
    raise exception '지원하지 않는 판매글 작업입니다.';
  end if;
  if p_operation = 'create' and p_listing_id is not null then
    raise exception '새 판매글에는 기존 식별자를 사용할 수 없습니다.';
  end if;
  if p_operation <> 'create' and p_listing_id is null then
    raise exception '판매글 식별자가 필요합니다.';
  end if;

  select * into v_claim from private.market_claim_request(
    v_actor_id, p_request_id, v_action,
    pg_catalog.jsonb_build_object(
      'operation', p_operation, 'listing_id', p_listing_id,
      'expected_version', p_expected_version, 'payload', coalesce(p_payload, '{}'::jsonb)
    )
  );
  if v_claim.replayed then
    return v_claim.result_data || pg_catalog.jsonb_build_object('replayed', true);
  end if;

  if p_operation in ('create', 'update') then
    if v_title is null or pg_catalog.char_length(v_title) not between 2 and 100 then
      raise exception '상품명은 2~100자로 입력해 주세요.';
    end if;
    if v_category not in ('club', 'ball', 'bag', 'apparel', 'shoes', 'practice', 'other') then
      raise exception '카테고리 입력을 확인해 주세요.';
    end if;
    if coalesce(p_payload->>'price', '') !~ '^[0-9]+$' then
      raise exception '가격은 숫자로 입력해 주세요.';
    end if;
    v_price := (p_payload->>'price')::bigint;
    if v_price not between 1 and 1000000000 then
      raise exception '가격 입력 범위를 확인해 주세요.';
    end if;
    if v_region not in ('서울', '경기', '인천', '충청', '강원', '전라', '경상', '제주') then
      raise exception '지역 입력을 확인해 주세요.';
    end if;
    if v_condition not in ('likeNew', 'lightUse', 'normal', 'needsRepair') then
      raise exception '상품 상태 입력을 확인해 주세요.';
    end if;
    if v_trade_type not in ('direct', 'delivery', 'negotiable') then
      raise exception '거래 방식 입력을 확인해 주세요.';
    end if;
    if v_description is null or pg_catalog.char_length(v_description) not between 10 and 2000 then
      raise exception '상품 설명은 10~2000자로 입력해 주세요.';
    end if;
  end if;

  if p_operation = 'create' then
    insert into public.market_listings (
      seller_user_id, title, category_code, price_amount, region_code,
      condition_code, trade_type_code, description
    ) values (
      v_actor_id, v_title, v_category, v_price, v_region,
      v_condition, v_trade_type, v_description
    ) returning * into v_listing;
  else
    select listing.* into v_listing
    from public.market_listings as listing
    where listing.id = p_listing_id
    for update;
    if v_listing.id is null or v_listing.listing_status = 'removed' then
      raise exception '판매글을 찾을 수 없습니다.';
    end if;
    if v_listing.seller_user_id <> v_actor_id then
      raise exception '본인의 판매글만 변경할 수 있습니다.';
    end if;
    if p_expected_version is null or p_expected_version <> v_listing.version then
      raise exception '판매글이 변경되었습니다. 새로고침 후 다시 시도해 주세요.';
    end if;
    v_before := pg_catalog.to_jsonb(v_listing);

    if p_operation = 'update' then
      if v_listing.listing_status = 'sold' then
        raise exception '거래 완료된 판매글은 수정할 수 없습니다.';
      end if;
      update public.market_listings
      set title = v_title, category_code = v_category, price_amount = v_price,
          region_code = v_region, condition_code = v_condition,
          trade_type_code = v_trade_type, description = v_description,
          version = version + 1
      where id = v_listing.id returning * into v_listing;
    elsif p_operation = 'reserve' then
      if v_listing.listing_status <> 'selling' then
        raise exception '판매중인 글만 예약중으로 변경할 수 있습니다.';
      end if;
      v_next_status := 'reserved';
    elsif p_operation = 'sell' then
      if v_listing.listing_status <> 'reserved' then
        raise exception '예약중인 글만 거래완료로 변경할 수 있습니다.';
      end if;
      v_next_status := 'sold';
    else
      select coalesce(pg_catalog.jsonb_agg(media.storage_path), '[]'::jsonb)
      into v_removed_paths
      from public.market_listing_media as media
      where media.listing_id = v_listing.id and media.media_status = 'available';
      update public.market_listing_media
      set media_status = 'removed', removed_at = now(), version = version + 1
      where listing_id = v_listing.id and media_status in ('pending_upload', 'available');
      v_next_status := 'removed';
    end if;

    if v_next_status is not null then
      update public.market_listings
      set listing_status = v_next_status,
          removed_at = case when v_next_status = 'removed' then now() else null end,
          version = version + 1
      where id = v_listing.id returning * into v_listing;
    end if;
  end if;

  if p_operation = 'create' or v_before->>'listing_status' is distinct from v_listing.listing_status then
    insert into public.market_status_history (
      entity_kind, listing_id, entity_version, from_status, to_status, actor_user_id, request_id
    ) values (
      'listing', v_listing.id, v_listing.version,
      case when p_operation = 'create' then null else v_before->>'listing_status' end,
      v_listing.listing_status, v_actor_id, p_request_id
    );
  end if;

  v_result := pg_catalog.jsonb_build_object(
    'request_id', p_request_id,
    'listing_id', v_listing.id,
    'sale_status', v_listing.listing_status,
    'version', v_listing.version,
    'replayed', false,
    'removed_storage_paths', v_removed_paths
  );
  insert into private.market_audit_log (
    actor_user_id, request_id, action_code, entity_kind, entity_id, before_data, after_data
  ) values (
    v_actor_id, p_request_id, v_action, 'listing', v_listing.id, v_before,
    pg_catalog.jsonb_build_object('status', v_listing.listing_status, 'version', v_listing.version)
  );
  perform private.market_complete_request(v_actor_id, p_request_id, v_result);
  return v_result;
end;
$$;

comment on function public.mutate_market_listing(text, uuid, integer, jsonb, uuid) is
  'Owner-only idempotent create, edit, selling-to-reserved-to-sold transition, and soft delete.';
revoke all on function public.mutate_market_listing(text, uuid, integer, jsonb, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.mutate_market_listing(text, uuid, integer, jsonb, uuid)
  to authenticated;

create function public.mutate_market_buy_request(
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
    v_before := pg_catalog.to_jsonb(v_request);
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

create function public.create_market_media_upload_intent(
  p_listing_id uuid,
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
  v_listing public.market_listings%rowtype;
  v_media_id uuid := gen_random_uuid();
  v_sort_order smallint;
begin
  select listing.* into v_listing
  from public.market_listings as listing
  where listing.id = p_listing_id
  for update;
  if v_listing.id is null or v_listing.listing_status = 'removed' then
    raise exception '판매글을 찾을 수 없습니다.';
  end if;
  if v_listing.seller_user_id <> v_actor_id then
    raise exception '본인의 판매글에만 사진을 등록할 수 있습니다.';
  end if;
  if v_listing.listing_status = 'sold' then
    raise exception '거래 완료된 판매글에는 사진을 등록할 수 없습니다.';
  end if;
  if p_declared_mime_type not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'JPG, PNG, WebP 이미지만 등록할 수 있습니다.';
  end if;
  if p_declared_size_bytes is null or p_declared_size_bytes not between 1 and 8388608 then
    raise exception '사진 파일은 8MB 이하여야 합니다.';
  end if;

  select candidate.sort_order into v_sort_order
  from pg_catalog.generate_series(0, 4) as candidate(sort_order)
  where not exists (
    select 1 from public.market_listing_media as media
    where media.listing_id = p_listing_id
      and media.sort_order = candidate.sort_order
      and media.media_status in ('pending_upload', 'available')
  )
  order by candidate.sort_order limit 1;
  if v_sort_order is null then
    raise exception '상품 사진은 최대 5장까지 등록할 수 있습니다.';
  end if;

  insert into public.market_listing_media (
    id, listing_id, uploaded_by_user_id, storage_path, sort_order,
    declared_mime_type, declared_size_bytes
  ) values (
    v_media_id, p_listing_id, v_actor_id,
    p_listing_id::text || '/' || v_media_id::text || '/original', v_sort_order,
    p_declared_mime_type, p_declared_size_bytes
  );
  return pg_catalog.jsonb_build_object(
    'media_id', v_media_id, 'media_status', 'pending_upload',
    'sort_order', v_sort_order, 'version', 1
  );
end;
$$;

comment on function public.create_market_media_upload_intent(uuid, text, bigint) is
  'Creates one owner-scoped metadata intent for a server-signed market image upload.';
revoke all on function public.create_market_media_upload_intent(uuid, text, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.create_market_media_upload_intent(uuid, text, bigint)
  to authenticated;

create function public.get_market_media_upload_context_server(
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

create function public.finalize_market_media_upload_server(
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
  v_status text;
  v_media public.market_listing_media%rowtype;
  v_listing public.market_listings%rowtype;
begin
  select account.account_status into v_status
  from public.user_accounts as account
  where account.id = p_actor_user_id for share;
  if v_status is distinct from 'active' then
    raise exception '정상 활동 계정만 사진 등록을 완료할 수 있습니다.';
  end if;
  select media.* into v_media
  from public.market_listing_media as media
  where media.id = p_media_id for update;
  if v_media.id is null or v_media.uploaded_by_user_id <> p_actor_user_id then
    raise exception '사진 업로드 정보를 찾을 수 없습니다.';
  end if;
  select listing.* into v_listing
  from public.market_listings as listing
  where listing.id = v_media.listing_id for share;
  if v_listing.seller_user_id <> p_actor_user_id or v_listing.listing_status not in ('selling', 'reserved') then
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
  update public.market_listing_media
  set media_status = 'available', verified_mime_type = p_verified_mime_type,
      verified_size_bytes = p_verified_size_bytes, available_at = now(), version = version + 1
  where id = v_media.id;
  return pg_catalog.jsonb_build_object('media_id', v_media.id, 'media_status', 'available', 'version', v_media.version + 1, 'replayed', false);
end;
$$;

comment on function public.finalize_market_media_upload_server(uuid, uuid, text, bigint) is
  'Service-only byte-verified market photo finalize.';
revoke all on function public.finalize_market_media_upload_server(uuid, uuid, text, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.finalize_market_media_upload_server(uuid, uuid, text, bigint)
  to service_role;

create function public.mark_market_media_upload_failed_server(
  p_actor_user_id uuid,
  p_media_id uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.market_listing_media
  set media_status = 'failed', version = version + 1
  where id = p_media_id and uploaded_by_user_id = p_actor_user_id and media_status = 'pending_upload';
$$;

revoke all on function public.mark_market_media_upload_failed_server(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.mark_market_media_upload_failed_server(uuid, uuid)
  to service_role;

comment on table public.market_listings is
  'Public marketplace sale listings. Writes are allowed only through owner-checked RPCs.';
comment on table public.market_buy_requests is
  'Public marketplace wanted posts. Writes are allowed only through owner-checked RPCs.';
comment on table public.market_listing_media is
  'Metadata for up to five byte-verified product images in the market-media bucket.';
comment on table public.market_status_history is
  'Append-only listing and wanted-post status history tied to entity version.';
