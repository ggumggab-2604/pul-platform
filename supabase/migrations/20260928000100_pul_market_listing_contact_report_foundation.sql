-- PUL Market listing public contact, private report inbox, and explicit moderation.
-- Report resolution and listing moderation intentionally remain separate operations.

-- Match ECMAScript trim without treating internal line breaks as missing content.
create function private.market_trim_text(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.btrim(p_value,
    U&'\0009\000a\000b\000c\000d\0020\00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff');
$$;
revoke all on function private.market_trim_text(text)
  from public, anon, authenticated, service_role;

-- Listing contacts need a stricter authority/port contract than legacy directory URLs.
create function private.market_valid_contact_https_url(p_url text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_url text[];
  v_authority text[];
  v_host text;
begin
  if p_url is null or p_url <> private.market_trim_text(p_url)
     or pg_catalog.char_length(p_url) not between 9 and 500
     or p_url ~ '[[:space:][:cntrl:]]'
     or p_url ~ U&'[\00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff]'
     or pg_catalog.strpos(p_url, pg_catalog.chr(92)) > 0 then
    return false;
  end if;
  v_url := pg_catalog.regexp_match(p_url, '^https://([^/?#]+)([/?#].*)?$');
  if v_url is null then return false; end if;
  v_authority := pg_catalog.regexp_match(v_url[1],
    '^(\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9.-]+)(:([0-9]{1,5}))?$');
  if v_authority is null then return false; end if;
  if v_authority[3] is not null and v_authority[3]::integer not between 1 and 65535 then
    return false;
  end if;
  v_host := v_authority[1];
  if pg_catalog.left(v_host, 1) = '[' then
    return pg_catalog.family(pg_catalog.substr(v_host, 2, pg_catalog.length(v_host) - 2)::inet) = 6;
  end if;
  if pg_catalog.right(v_host, 1) = '.' then
    v_host := pg_catalog.left(v_host, pg_catalog.length(v_host) - 1);
  end if;
  if pg_catalog.char_length(v_host) not between 1 and 253 or exists (
    select 1 from pg_catalog.unnest(pg_catalog.string_to_array(v_host, '.')) as label(value)
    where label.value !~ '^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$'
  ) then return false; end if;
  if v_host ~ '(^|\.)[0-9]+$' then
    if v_host !~ '^([0-9]{1,3}\.){3}[0-9]{1,3}$' then return false; end if;
    return pg_catalog.family(v_host::inet) = 4;
  end if;
  return true;
exception when invalid_text_representation then
  return false;
end;
$$;
revoke all on function private.market_valid_contact_https_url(text)
  from public, anon, authenticated, service_role;

insert into public.platform_permission_definitions (code, description, is_active)
values
  ('market.listing_reports.manage', '장터 판매글 신고를 조회하고 처리합니다.', true),
  ('market.listings.moderate', '장터 판매글을 운영 정책에 따라 비공개 처리합니다.', true);

insert into public.platform_role_permissions (platform_role, permission_code)
values
  ('platform_admin', 'market.listing_reports.manage'),
  ('platform_admin', 'market.listings.moderate');

alter table public.market_listings
  add column public_contact_method text,
  add column public_contact_value text,
  add column public_contact_consent_at timestamptz,
  add constraint market_listings_public_contact_check check (
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

comment on column public.market_listings.public_contact_method is
  'Listing-scoped contact channel explicitly entered by the seller; never derived from Auth or private profile data.';
comment on column public.market_listings.public_contact_value is
  'Canonical listing-scoped public contact returned only by the visible detail RPC while contact consent is effective.';
comment on column public.market_listings.public_contact_consent_at is
  'Time at which the seller explicitly confirmed public disclosure of this listing contact.';

alter table private.market_mutation_requests
  drop constraint market_mutation_requests_actor_user_id_fkey,
  add constraint market_mutation_requests_actor_user_id_fkey
    foreign key (actor_user_id)
    references public.user_accounts (id)
    on delete cascade;

alter table private.market_audit_log
  drop constraint market_audit_log_actor_user_id_fkey,
  alter column actor_user_id drop not null,
  add constraint market_audit_log_actor_user_id_fkey
    foreign key (actor_user_id)
    references public.user_accounts (id)
    on delete set null;

create table public.market_listing_reports (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  report_key text not null default pg_catalog.encode(extensions.gen_random_bytes(16), 'hex'),
  listing_id uuid not null references public.market_listings (id) on delete restrict,
  reporter_user_id uuid references public.user_accounts (id) on delete set null,
  submit_request_id uuid not null,
  reason_code text not null,
  note text not null,
  report_status text not null default 'received',
  version integer not null default 1,
  resolved_by uuid references public.user_accounts (id) on delete set null,
  resolution_note text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  resolved_at timestamptz,
  constraint market_listing_reports_report_key_key unique (report_key),
  constraint market_listing_reports_reporter_request_key unique (reporter_user_id, submit_request_id),
  constraint market_listing_reports_report_key_check check (report_key ~ '^[0-9a-f]{32}$'),
  constraint market_listing_reports_reason_check check (
    reason_code in (
      'fraud_or_false',
      'prohibited_or_inappropriate',
      'spam_or_duplicate',
      'privacy_exposure',
      'other'
    )
  ),
  constraint market_listing_reports_note_check check (
    note = private.market_trim_text(note)
    and pg_catalog.char_length(note) between 10 and 1000
  ),
  constraint market_listing_reports_status_check check (
    report_status in ('received', 'handled', 'dismissed')
  ),
  constraint market_listing_reports_version_check check (version >= 1),
  constraint market_listing_reports_resolution_note_check check (
    resolution_note is null
    or (
      resolution_note = private.market_trim_text(resolution_note)
      and pg_catalog.char_length(resolution_note) between 2 and 500
    )
  ),
  constraint market_listing_reports_resolution_check check (
    (
      report_status = 'received'
      and resolved_by is null
      and resolved_at is null
      and resolution_note is null
    )
    or (
      report_status in ('handled', 'dismissed')
      and resolved_at is not null
      and resolution_note is not null
    )
  )
);

create unique index market_listing_reports_one_received_reporter_listing_idx
  on public.market_listing_reports (reporter_user_id, listing_id)
  where report_status = 'received' and reporter_user_id is not null;
create index market_listing_reports_status_created_idx
  on public.market_listing_reports (report_status, created_at desc, report_key);
create index market_listing_reports_listing_created_idx
  on public.market_listing_reports (listing_id, created_at desc);
create index market_listing_reports_reporter_created_idx
  on public.market_listing_reports (reporter_user_id, created_at desc)
  where reporter_user_id is not null;
create index market_listing_reports_resolved_by_idx
  on public.market_listing_reports (resolved_by)
  where resolved_by is not null;

create trigger market_listing_reports_set_updated_at
before update on public.market_listing_reports
for each row execute function public.set_user_foundation_updated_at();

alter table public.market_listing_reports enable row level security;
alter table public.market_listing_reports force row level security;
revoke all on table public.market_listing_reports
  from public, anon, authenticated, service_role;

comment on table public.market_listing_reports is
  'Private active-member reports about visible market listings. Resolution never changes the listing automatically.';
comment on column public.market_listing_reports.report_key is
  'Opaque management identifier used instead of the internal report UUID.';
comment on column public.market_listing_reports.note is
  'Private report statement; it must not be copied into audit or request result metadata.';

create function private.market_actor_has_platform_permission(
  p_actor_id uuid,
  p_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1
    from public.user_accounts as account
    join public.platform_role_permissions as mapping
      on mapping.platform_role = account.platform_role
    join public.platform_permission_definitions as permission
      on permission.code = mapping.permission_code
     and permission.is_active
    where account.id = p_actor_id
      and account.account_status = 'active'
      and mapping.permission_code = p_permission_code
  ), false);
$$;

revoke all on function private.market_actor_has_platform_permission(uuid, text)
  from public, anon, authenticated, service_role;

create function private.market_require_platform_permission(p_permission_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  if not private.market_actor_has_platform_permission(v_actor_id, p_permission_code) then
    raise exception '장터 운영 권한이 없습니다.' using errcode = '42501';
  end if;
  return v_actor_id;
end;
$$;

revoke all on function private.market_require_platform_permission(text)
  from public, anon, authenticated, service_role;

create function private.market_claim_sha256_request(
  p_actor_user_id uuid,
  p_request_id uuid,
  p_action_code text,
  p_request_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request private.market_mutation_requests%rowtype;
  v_fingerprint text := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(p_request_payload::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
begin
  if p_request_id is null then
    raise exception 'request ID가 필요합니다.' using errcode = '22023';
  end if;

  insert into private.market_mutation_requests (
    actor_user_id,
    request_id,
    action_code,
    request_fingerprint
  ) values (
    p_actor_user_id,
    p_request_id,
    p_action_code,
    v_fingerprint
  ) on conflict do nothing;

  select request.*
  into v_request
  from private.market_mutation_requests as request
  where request.actor_user_id = p_actor_user_id
    and request.request_id = p_request_id
  for update;

  if v_request.action_code <> p_action_code
     or v_request.request_fingerprint <> v_fingerprint then
    raise exception 'request ID가 다른 장터 요청에 이미 사용되었습니다.'
      using errcode = '40901';
  end if;

  if v_request.completed_at is not null then
    return v_request.result_data;
  end if;

  return null;
end;
$$;

revoke all on function private.market_claim_sha256_request(uuid, uuid, text, jsonb)
  from public, anon, authenticated, service_role;

create function private.market_normalize_public_contact(
  p_method text,
  p_value text
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_value text := nullif(private.market_trim_text(p_value), '');
  v_digits text;
begin
  if p_method is null or p_method not in ('phone', 'sms', 'external_url') then
    raise exception '공개 연락 방법을 확인해 주세요.' using errcode = '22023';
  end if;
  if v_value is null then
    raise exception '공개 연락처를 입력해 주세요.' using errcode = '22023';
  end if;

  if p_method in ('phone', 'sms') then
    if v_value !~ '^[0-9+(). -]+$' then
      raise exception '전화번호는 숫자와 일반적인 구분 기호만 입력해 주세요.'
        using errcode = '22023';
    end if;
    v_digits := pg_catalog.regexp_replace(v_value, '[^0-9]', '', 'g');
    if pg_catalog.char_length(v_digits) not between 8 and 15 then
      raise exception '전화번호는 숫자 8~15자리로 입력해 주세요.' using errcode = '22023';
    end if;
    return v_digits;
  end if;

  if not private.market_valid_contact_https_url(v_value) then
    raise exception '외부 문의 주소는 올바른 https:// URL로 입력해 주세요.'
      using errcode = '22023';
  end if;
  return v_value;
end;
$$;

revoke all on function private.market_normalize_public_contact(text, text)
  from public, anon, authenticated, service_role;

-- Public ownership flags are total booleans, including anonymous requests.
-- Preserve existing ACLs, queries, and public visibility contracts.
CREATE OR REPLACE FUNCTION public.get_market_buy_request(p_buy_request_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    'can_edit', coalesce(request.author_user_id = auth.uid(), false)
  )
  from public.market_buy_requests as request
  where request.id = p_buy_request_id and request.request_status <> 'removed';
$function$;

CREATE OR REPLACE FUNCTION public.list_market_buy_requests(p_limit integer DEFAULT 24, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
        'can_edit', coalesce(request.author_user_id = v_actor_id, false)
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
$function$;

CREATE OR REPLACE FUNCTION public.list_market_listings(p_keyword text DEFAULT NULL::text, p_category_code text DEFAULT NULL::text, p_region_code text DEFAULT NULL::text, p_listing_status text DEFAULT NULL::text, p_limit integer DEFAULT 24, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
        'can_edit', coalesce(listing.seller_user_id = v_actor_id, false),
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
$function$;

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
      when listing.listing_status in ('selling', 'reserved')
       and listing.public_contact_consent_at is not null
      then listing.public_contact_method
      else null
    end,
    'public_contact_value', case
      when listing.listing_status in ('selling', 'reserved')
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

create or replace function public.mutate_market_listing(
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
  v_contact_method text := p_payload->>'public_contact_method';
  v_contact_value text;
  v_previous_contact_method text;
  v_previous_contact_value text;
  v_contact_changed boolean := false;
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
    v_actor_id,
    p_request_id,
    v_action,
    pg_catalog.jsonb_build_object(
      'operation', p_operation,
      'listing_id', p_listing_id,
      'expected_version', p_expected_version,
      'payload', coalesce(p_payload, '{}'::jsonb)
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
    if not coalesce(p_payload @> '{"public_contact_consent": true}'::jsonb, false) then
      raise exception '공개 연락처 안내를 확인하고 동의해 주세요.' using errcode = '22023';
    end if;
    v_contact_value := private.market_normalize_public_contact(
      v_contact_method,
      p_payload->>'public_contact_value'
    );
  end if;

  if p_operation = 'create' then
    insert into public.market_listings (
      seller_user_id,
      title,
      category_code,
      price_amount,
      region_code,
      condition_code,
      trade_type_code,
      description,
      public_contact_method,
      public_contact_value,
      public_contact_consent_at
    ) values (
      v_actor_id,
      v_title,
      v_category,
      v_price,
      v_region,
      v_condition,
      v_trade_type,
      v_description,
      v_contact_method,
      v_contact_value,
      pg_catalog.now()
    ) returning * into v_listing;
    v_contact_changed := true;
  else
    select listing.*
    into v_listing
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

    v_previous_contact_method := v_listing.public_contact_method;
    v_previous_contact_value := v_listing.public_contact_value;
    v_before := (
      pg_catalog.to_jsonb(v_listing)
      - 'public_contact_value'
      - 'public_contact_consent_at'
    ) || pg_catalog.jsonb_build_object(
      'contact_method', v_listing.public_contact_method,
      'contact_present', v_listing.public_contact_value is not null
    );

    if p_operation = 'update' then
      if v_listing.listing_status = 'sold' then
        raise exception '거래 완료된 판매글은 수정할 수 없습니다.';
      end if;
      v_contact_changed := v_previous_contact_method is distinct from v_contact_method
        or v_previous_contact_value is distinct from v_contact_value;
      update public.market_listings
      set title = v_title,
          category_code = v_category,
          price_amount = v_price,
          region_code = v_region,
          condition_code = v_condition,
          trade_type_code = v_trade_type,
          description = v_description,
          public_contact_method = v_contact_method,
          public_contact_value = v_contact_value,
          public_contact_consent_at = case
            when v_contact_changed then pg_catalog.now()
            else public_contact_consent_at
          end,
          version = version + 1
      where id = v_listing.id
      returning * into v_listing;
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
      where media.listing_id = v_listing.id
        and media.media_status = 'available';
      update public.market_listing_media
      set media_status = 'removed',
          removed_at = pg_catalog.now(),
          version = version + 1
      where listing_id = v_listing.id
        and media_status in ('pending_upload', 'available');
      v_next_status := 'removed';
    end if;

    if v_next_status is not null then
      update public.market_listings
      set listing_status = v_next_status,
          removed_at = case when v_next_status = 'removed' then pg_catalog.now() else null end,
          version = version + 1
      where id = v_listing.id
      returning * into v_listing;
    end if;
  end if;

  if p_operation = 'create'
     or v_before->>'listing_status' is distinct from v_listing.listing_status then
    insert into public.market_status_history (
      entity_kind,
      listing_id,
      entity_version,
      from_status,
      to_status,
      actor_user_id,
      request_id
    ) values (
      'listing',
      v_listing.id,
      v_listing.version,
      case when p_operation = 'create' then null else v_before->>'listing_status' end,
      v_listing.listing_status,
      v_actor_id,
      p_request_id
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
    actor_user_id,
    request_id,
    action_code,
    entity_kind,
    entity_id,
    before_data,
    after_data
  ) values (
    v_actor_id,
    p_request_id,
    v_action,
    'listing',
    v_listing.id,
    v_before,
    (
      pg_catalog.to_jsonb(v_listing)
      - 'public_contact_value'
      - 'public_contact_consent_at'
    ) || pg_catalog.jsonb_build_object(
      'status', v_listing.listing_status,
      'version', v_listing.version,
      'contact_method', v_listing.public_contact_method,
      'contact_present', v_listing.public_contact_value is not null,
      'contact_changed', v_contact_changed
    )
  );
  perform private.market_complete_request(v_actor_id, p_request_id, v_result);
  return v_result;
end;
$$;

comment on function public.mutate_market_listing(text, uuid, integer, jsonb, uuid) is
  'Owner-only idempotent listing mutation with explicit listing-scoped public contact consent and redacted audit summaries.';
revoke all on function public.mutate_market_listing(text, uuid, integer, jsonb, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.mutate_market_listing(text, uuid, integer, jsonb, uuid)
  to authenticated;

create function public.submit_market_listing_report(
  p_listing_id uuid,
  p_reason_code text,
  p_note text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := private.market_assert_active_actor();
  v_note text := nullif(private.market_trim_text(p_note), '');
  v_payload jsonb;
  v_replay jsonb;
  v_listing public.market_listings%rowtype;
  v_report public.market_listing_reports%rowtype;
  v_result jsonb;
begin
  if p_listing_id is null then
    raise exception '신고할 판매글을 확인해 주세요.' using errcode = '22023';
  end if;
  if p_reason_code is null or p_reason_code not in (
    'fraud_or_false',
    'prohibited_or_inappropriate',
    'spam_or_duplicate',
    'privacy_exposure',
    'other'
  ) then
    raise exception '신고 사유를 확인해 주세요.' using errcode = '22023';
  end if;
  if v_note is null or pg_catalog.char_length(v_note) not between 10 and 1000 then
    raise exception '신고 내용은 10~1000자로 입력해 주세요.' using errcode = '22023';
  end if;

  v_payload := pg_catalog.jsonb_build_object(
    'action', 'market.listing_report.submit',
    'listing_id', p_listing_id,
    'reporter_user_id', v_actor_id,
    'reason_code', p_reason_code,
    'note', v_note
  );
  v_replay := private.market_claim_sha256_request(
    v_actor_id,
    p_request_id,
    'market.listing_report.submit',
    v_payload
  );
  if v_replay is not null then
    return v_replay || pg_catalog.jsonb_build_object('replayed', true);
  end if;

  select listing.*
  into v_listing
  from public.market_listings as listing
  where listing.id = p_listing_id
  for share;
  if not found or v_listing.listing_status = 'removed' then
    raise exception '신고할 판매글을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  if v_listing.seller_user_id = v_actor_id then
    raise exception '본인의 판매글은 신고할 수 없습니다.' using errcode = '42501';
  end if;

  insert into public.market_listing_reports (
    listing_id,
    reporter_user_id,
    submit_request_id,
    reason_code,
    note
  ) values (
    v_listing.id,
    v_actor_id,
    p_request_id,
    p_reason_code,
    v_note
  ) returning * into v_report;

  v_result := pg_catalog.jsonb_build_object(
    'report_key', v_report.report_key,
    'report_status', v_report.report_status,
    'version', v_report.version,
    'request_id', p_request_id,
    'replayed', false
  );
  insert into private.market_audit_log (
    actor_user_id,
    request_id,
    action_code,
    entity_kind,
    entity_id,
    before_data,
    after_data
  ) values (
    v_actor_id,
    p_request_id,
    'market.listing_report.submit',
    'listing_report',
    v_report.id,
    null,
    pg_catalog.jsonb_build_object(
      'report_status', v_report.report_status,
      'reason_code', v_report.reason_code,
      'version', v_report.version,
      'listing_id', v_listing.id
    )
  );
  perform private.market_complete_request(v_actor_id, p_request_id, v_result);
  return v_result;
exception
  when unique_violation then
    raise exception '이미 확인 대기 중인 판매글 신고가 있습니다.' using errcode = '40901';
end;
$$;

comment on function public.submit_market_listing_report(uuid, text, text, uuid) is
  'Active non-owner report submission with SHA-256 request replay, one received report per reporter/listing, and redacted audit.';
revoke all on function public.submit_market_listing_report(uuid, text, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_market_listing_report(uuid, text, text, uuid)
  to authenticated;

create function public.list_market_listing_reports_for_management(
  p_status text default 'received',
  p_limit integer default 30,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_total integer;
  v_items jsonb;
begin
  perform private.market_require_platform_permission('market.listing_reports.manage');
  if p_status is null or p_status not in ('received', 'handled', 'dismissed', 'all') then
    raise exception '신고 상태를 확인해 주세요.' using errcode = '22023';
  end if;
  if p_limit is null or p_limit not between 1 and 50
     or p_offset is null or p_offset < 0 then
    raise exception '페이지 범위를 확인해 주세요.' using errcode = '22023';
  end if;

  select pg_catalog.count(*)::integer
  into v_total
  from public.market_listing_reports as report
  where p_status = 'all' or report.report_status = p_status;

  with page as (
    select report.*, listing.title as listing_title, listing.listing_status
    from public.market_listing_reports as report
    join public.market_listings as listing on listing.id = report.listing_id
    where p_status = 'all' or report.report_status = p_status
    order by report.created_at desc, report.report_key
    limit p_limit offset p_offset
  )
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'report_key', page.report_key,
      'listing_title', page.listing_title,
      'listing_status', page.listing_status,
      'reason_code', page.reason_code,
      'report_status', page.report_status,
      'version', page.version,
      'created_at', page.created_at,
      'resolved_at', page.resolved_at
    ) order by page.created_at desc, page.report_key
  ), '[]'::jsonb)
  into v_items
  from page;

  return pg_catalog.jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', p_offset + pg_catalog.jsonb_array_length(v_items) < v_total
  );
end;
$$;

comment on function public.list_market_listing_reports_for_management(text, integer, integer) is
  'Bounded platform-admin listing report inbox without reporter identifiers or listing contact data.';
revoke all on function public.list_market_listing_reports_for_management(text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_market_listing_reports_for_management(text, integer, integer)
  to authenticated;

create function public.get_market_listing_report_for_management(p_report_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_key text := nullif(pg_catalog.btrim(p_report_key), '');
  v_report public.market_listing_reports%rowtype;
  v_listing public.market_listings%rowtype;
begin
  perform private.market_require_platform_permission('market.listing_reports.manage');
  if v_key is null or v_key !~ '^[0-9a-f]{32}$' then
    raise exception '조회할 신고를 확인해 주세요.' using errcode = '22023';
  end if;

  select report.*
  into v_report
  from public.market_listing_reports as report
  where report.report_key = v_key;
  if not found then
    raise exception '판매글 신고를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  select listing.*
  into v_listing
  from public.market_listings as listing
  where listing.id = v_report.listing_id;

  return pg_catalog.jsonb_build_object(
    'report_key', v_report.report_key,
    'reason_code', v_report.reason_code,
    'note', v_report.note,
    'report_status', v_report.report_status,
    'version', v_report.version,
    'created_at', v_report.created_at,
    'resolved_at', v_report.resolved_at,
    'resolution_note', v_report.resolution_note,
    'listing', pg_catalog.jsonb_build_object(
      'id', v_listing.id,
      'name', v_listing.title,
      'seller_display_name', private.market_actor_display_name(v_listing.seller_user_id, auth.uid()),
      'sale_status', v_listing.listing_status,
      'version', v_listing.version
    )
  );
end;
$$;

comment on function public.get_market_listing_report_for_management(text) is
  'Platform-admin report detail with the private report statement and a minimal current listing snapshot.';
revoke all on function public.get_market_listing_report_for_management(text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_market_listing_report_for_management(text)
  to authenticated;

create function public.resolve_market_listing_report(
  p_report_key text,
  p_expected_version integer,
  p_resolution_status text,
  p_resolution_note text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := private.market_require_platform_permission('market.listing_reports.manage');
  v_key text := nullif(pg_catalog.btrim(p_report_key), '');
  v_note text := nullif(private.market_trim_text(p_resolution_note), '');
  v_payload jsonb;
  v_replay jsonb;
  v_report public.market_listing_reports%rowtype;
  v_result jsonb;
begin
  if v_key is null or v_key !~ '^[0-9a-f]{32}$' then
    raise exception '처리할 신고를 확인해 주세요.' using errcode = '22023';
  end if;
  if p_expected_version is null or p_expected_version < 1 then
    raise exception '신고 version을 확인해 주세요.' using errcode = '22023';
  end if;
  if p_resolution_status is null
     or p_resolution_status not in ('handled', 'dismissed') then
    raise exception '신고 처리 결과를 확인해 주세요.' using errcode = '22023';
  end if;
  if v_note is null or pg_catalog.char_length(v_note) not between 2 and 500 then
    raise exception '처리 메모는 2~500자로 입력해 주세요.' using errcode = '22023';
  end if;

  v_payload := pg_catalog.jsonb_build_object(
    'action', 'market.listing_report.resolve',
    'report_key', v_key,
    'expected_version', p_expected_version,
    'resolution_status', p_resolution_status,
    'resolution_note', v_note
  );
  v_replay := private.market_claim_sha256_request(
    v_actor_id,
    p_request_id,
    'market.listing_report.resolve',
    v_payload
  );
  if v_replay is not null then
    return v_replay || pg_catalog.jsonb_build_object('replayed', true);
  end if;

  select report.*
  into v_report
  from public.market_listing_reports as report
  where report.report_key = v_key
  for update;
  if not found then
    raise exception '판매글 신고를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  if v_report.version <> p_expected_version then
    raise exception '신고 상태가 변경되었습니다. 새로고침 후 다시 시도해 주세요.'
      using errcode = '40901';
  end if;
  if v_report.report_status <> 'received' then
    raise exception '이미 처리된 판매글 신고입니다.' using errcode = '40901';
  end if;

  update public.market_listing_reports
  set report_status = p_resolution_status,
      version = version + 1,
      resolved_by = v_actor_id,
      resolution_note = v_note,
      resolved_at = pg_catalog.now()
  where id = v_report.id
    and version = p_expected_version
    and report_status = 'received'
  returning * into v_report;
  if not found then
    raise exception '신고 상태가 변경되었습니다. 새로고침 후 다시 시도해 주세요.'
      using errcode = '40901';
  end if;

  v_result := pg_catalog.jsonb_build_object(
    'report_key', v_report.report_key,
    'report_status', v_report.report_status,
    'version', v_report.version,
    'resolved_at', v_report.resolved_at,
    'request_id', p_request_id,
    'replayed', false
  );
  insert into private.market_audit_log (
    actor_user_id,
    request_id,
    action_code,
    entity_kind,
    entity_id,
    before_data,
    after_data
  ) values (
    v_actor_id,
    p_request_id,
    'market.listing_report.resolve',
    'listing_report',
    v_report.id,
    pg_catalog.jsonb_build_object(
      'report_status', 'received',
      'version', p_expected_version
    ),
    pg_catalog.jsonb_build_object(
      'report_status', v_report.report_status,
      'version', v_report.version,
      'resolution_note_present', true
    )
  );
  perform private.market_complete_request(v_actor_id, p_request_id, v_result);
  return v_result;
end;
$$;

comment on function public.resolve_market_listing_report(text, integer, text, text, uuid) is
  'Platform-admin received-to-terminal report resolution; never changes the listing.';
revoke all on function public.resolve_market_listing_report(text, integer, text, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_market_listing_report(text, integer, text, text, uuid)
  to authenticated;

create function public.remove_market_listing_for_moderation(
  p_listing_id uuid,
  p_expected_version integer,
  p_reason text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := private.market_require_platform_permission('market.listings.moderate');
  v_reason text := nullif(private.market_trim_text(p_reason), '');
  v_payload jsonb;
  v_replay jsonb;
  v_listing public.market_listings%rowtype;
  v_before jsonb;
  v_result jsonb;
  v_removed_paths jsonb := '[]'::jsonb;
begin
  if p_listing_id is null then
    raise exception '비공개 처리할 판매글을 확인해 주세요.' using errcode = '22023';
  end if;
  if p_expected_version is null or p_expected_version < 1 then
    raise exception '판매글 version을 확인해 주세요.' using errcode = '22023';
  end if;
  if v_reason is null or pg_catalog.char_length(v_reason) not between 2 and 500 then
    raise exception '비공개 처리 사유는 2~500자로 입력해 주세요.' using errcode = '22023';
  end if;

  v_payload := pg_catalog.jsonb_build_object(
    'action', 'market.listing.moderate_remove',
    'listing_id', p_listing_id,
    'expected_version', p_expected_version,
    'reason', v_reason
  );
  v_replay := private.market_claim_sha256_request(
    v_actor_id,
    p_request_id,
    'market.listing.moderate_remove',
    v_payload
  );
  if v_replay is not null then
    return v_replay || pg_catalog.jsonb_build_object('replayed', true);
  end if;

  select listing.*
  into v_listing
  from public.market_listings as listing
  where listing.id = p_listing_id
  for update;
  if not found then
    raise exception '판매글을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  if v_listing.listing_status = 'removed' then
    raise exception '이미 비공개 처리된 판매글입니다.' using errcode = '40901';
  end if;
  if v_listing.version <> p_expected_version then
    raise exception '판매글이 변경되었습니다. 새로고침 후 다시 시도해 주세요.'
      using errcode = '40901';
  end if;

  v_before := (
    pg_catalog.to_jsonb(v_listing)
    - 'public_contact_value'
    - 'public_contact_consent_at'
  ) || pg_catalog.jsonb_build_object(
    'contact_method', v_listing.public_contact_method,
    'contact_present', v_listing.public_contact_value is not null
  );

  select coalesce(pg_catalog.jsonb_agg(media.storage_path), '[]'::jsonb)
  into v_removed_paths
  from public.market_listing_media as media
  where media.listing_id = v_listing.id
    and media.media_status = 'available';

  update public.market_listing_media
  set media_status = 'removed',
      removed_at = pg_catalog.now(),
      version = version + 1
  where listing_id = v_listing.id
    and media_status in ('pending_upload', 'available');

  update public.market_listings
  set listing_status = 'removed',
      removed_at = pg_catalog.now(),
      version = version + 1
  where id = v_listing.id
    and version = p_expected_version
    and listing_status <> 'removed'
  returning * into v_listing;
  if not found then
    raise exception '판매글이 변경되었습니다. 새로고침 후 다시 시도해 주세요.'
      using errcode = '40901';
  end if;

  insert into public.market_status_history (
    entity_kind,
    listing_id,
    entity_version,
    from_status,
    to_status,
    actor_user_id,
    request_id
  ) values (
    'listing',
    v_listing.id,
    v_listing.version,
    v_before->>'listing_status',
    'removed',
    v_actor_id,
    p_request_id
  );

  v_result := pg_catalog.jsonb_build_object(
    'request_id', p_request_id,
    'listing_id', v_listing.id,
    'sale_status', v_listing.listing_status,
    'version', v_listing.version,
    'replayed', false,
    'removed_storage_paths', v_removed_paths
  );
  insert into private.market_audit_log (
    actor_user_id,
    request_id,
    action_code,
    entity_kind,
    entity_id,
    before_data,
    after_data
  ) values (
    v_actor_id,
    p_request_id,
    'market.listing.moderate_remove',
    'listing',
    v_listing.id,
    v_before,
    pg_catalog.jsonb_build_object(
      'status', v_listing.listing_status,
      'version', v_listing.version,
      'moderation_reason_present', true,
      'contact_method', v_listing.public_contact_method,
      'contact_present', v_listing.public_contact_value is not null
    )
  );
  perform private.market_complete_request(v_actor_id, p_request_id, v_result);
  return v_result;
end;
$$;

comment on function public.remove_market_listing_for_moderation(uuid, integer, text, uuid) is
  'Explicit platform-admin listing removal with version, media lifecycle, history, redacted audit, and replay protection; reports are untouched.';
revoke all on function public.remove_market_listing_for_moderation(uuid, integer, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.remove_market_listing_for_moderation(uuid, integer, text, uuid)
  to authenticated;
