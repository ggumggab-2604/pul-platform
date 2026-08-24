insert into public.platform_permission_definitions (code, description, is_active)
values (
  'market.partnership_inquiries.manage',
  '장터 광고·입점·제휴 문의를 조회하고 처리합니다.',
  true
);

insert into public.platform_role_permissions (platform_role, permission_code)
values ('platform_admin', 'market.partnership_inquiries.manage');

create table public.market_partnership_inquiries (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  inquiry_key text not null default pg_catalog.encode(extensions.gen_random_bytes(16), 'hex'),
  requester_user_id uuid not null references public.user_accounts (id),
  inquiry_type text not null,
  organization_name text not null,
  proposal_summary text not null,
  source_url text,
  inquiry_status text not null default 'pending',
  created_at timestamptz not null default pg_catalog.now(),
  resolved_at timestamptz,
  resolved_by uuid references public.user_accounts (id),
  constraint market_partnership_inquiries_inquiry_key_uidx unique (inquiry_key),
  constraint market_partnership_inquiries_inquiry_key_check check (
    inquiry_key ~ '^[0-9a-f]{32}$'
  ),
  constraint market_partnership_inquiries_type_check check (
    inquiry_type in ('advertising', 'shop_entry', 'partnership')
  ),
  constraint market_partnership_inquiries_organization_name_check check (
    organization_name = pg_catalog.btrim(organization_name)
    and pg_catalog.char_length(organization_name) between 2 and 120
  ),
  constraint market_partnership_inquiries_proposal_summary_check check (
    proposal_summary = pg_catalog.btrim(proposal_summary)
    and pg_catalog.char_length(proposal_summary) between 10 and 3000
  ),
  constraint market_partnership_inquiries_source_url_check check (
    source_url is null
    or private.valid_news_external_url(source_url)
  ),
  constraint market_partnership_inquiries_status_check check (
    inquiry_status in ('pending', 'resolved', 'dismissed')
  ),
  constraint market_partnership_inquiries_resolution_check check (
    (
      inquiry_status = 'pending'
      and resolved_at is null
      and resolved_by is null
    )
    or (
      inquiry_status in ('resolved', 'dismissed')
      and resolved_at is not null
      and resolved_by is not null
    )
  )
);

comment on table public.market_partnership_inquiries is
  'Private active-member market advertising, shop-entry, and partnership inquiries with platform-admin resolution and no automatic publication or commercial contract.';

create index market_partnership_inquiries_status_created_idx
  on public.market_partnership_inquiries (inquiry_status, created_at desc, inquiry_key);

create index market_partnership_inquiries_requester_created_idx
  on public.market_partnership_inquiries (requester_user_id, created_at desc);

create index market_partnership_inquiries_resolved_by_idx
  on public.market_partnership_inquiries (resolved_by)
  where resolved_by is not null;

alter table public.market_partnership_inquiries enable row level security;
alter table public.market_partnership_inquiries force row level security;

revoke all on table public.market_partnership_inquiries
  from public, anon, authenticated, service_role;

create function private.require_market_partnership_inquiry_manager()
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
  join public.platform_role_permissions as mapping
    on mapping.platform_role = account.platform_role
  join public.platform_permission_definitions as permission
    on permission.code = mapping.permission_code
   and permission.is_active
  where account.id = v_actor_id
    and account.account_status = 'active'
    and mapping.permission_code = 'market.partnership_inquiries.manage';

  if not found then
    raise exception '장터 광고·입점·제휴 문의 운영 권한이 없습니다.';
  end if;

  return v_actor_id;
end;
$$;

comment on function private.require_market_partnership_inquiry_manager() is
  'Requires the active actor to hold the explicit market.partnership_inquiries.manage platform permission.';

revoke all on function private.require_market_partnership_inquiry_manager()
  from public, anon, authenticated, service_role;

create function public.submit_market_partnership_inquiry(
  p_inquiry_type text,
  p_organization_name text,
  p_proposal_summary text,
  p_source_url text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_organization_name text := nullif(pg_catalog.btrim(p_organization_name), '');
  v_proposal_summary text := nullif(pg_catalog.btrim(p_proposal_summary), '');
  v_source_url text := nullif(pg_catalog.btrim(p_source_url), '');
  v_inquiry public.market_partnership_inquiries%rowtype;
begin
  v_actor_id := private.market_assert_active_actor();

  if p_inquiry_type is null
     or p_inquiry_type not in ('advertising', 'shop_entry', 'partnership') then
    raise exception '문의 유형을 확인해 주세요.';
  end if;
  if v_organization_name is null
     or pg_catalog.char_length(v_organization_name) not between 2 and 120 then
    raise exception '업체·단체명은 2~120자로 입력해 주세요.';
  end if;
  if v_proposal_summary is null
     or pg_catalog.char_length(v_proposal_summary) not between 10 and 3000 then
    raise exception '문의 내용은 10~3000자로 입력해 주세요.';
  end if;
  if v_source_url is not null and not private.valid_news_external_url(v_source_url) then
    raise exception '확인 URL은 https:// 주소로 500자 이내로 입력해 주세요.';
  end if;

  insert into public.market_partnership_inquiries (
    requester_user_id,
    inquiry_type,
    organization_name,
    proposal_summary,
    source_url
  ) values (
    v_actor_id,
    p_inquiry_type,
    v_organization_name,
    v_proposal_summary,
    v_source_url
  )
  returning * into v_inquiry;

  return pg_catalog.jsonb_build_object(
    'inquiry_key', v_inquiry.inquiry_key,
    'inquiry_status', v_inquiry.inquiry_status
  );
end;
$$;

comment on function public.submit_market_partnership_inquiry(text, text, text, text) is
  'Active authenticated member submission for private market advertising, shop-entry, or partnership review without internal UUIDs, automatic publication, pricing, or payment.';

revoke all on function public.submit_market_partnership_inquiry(text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_market_partnership_inquiry(text, text, text, text)
  to authenticated;

create function public.list_market_partnership_inquiries_for_management(
  p_status text default 'pending',
  p_limit integer default 30,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer;
  v_items jsonb;
begin
  perform private.require_market_partnership_inquiry_manager();

  if p_status is not null and p_status not in ('pending', 'resolved', 'dismissed') then
    raise exception '문의 상태를 확인해 주세요.';
  end if;
  if p_limit is null
     or p_limit not between 1 and 50
     or p_offset is null
     or p_offset < 0 then
    raise exception '페이지 범위를 확인해 주세요.';
  end if;

  select pg_catalog.count(*)::integer
  into v_total
  from public.market_partnership_inquiries as inquiry
  where p_status is null or inquiry.inquiry_status = p_status;

  with page as (
    select inquiry.*
    from public.market_partnership_inquiries as inquiry
    where p_status is null or inquiry.inquiry_status = p_status
    order by inquiry.created_at desc, inquiry.inquiry_key
    limit p_limit
    offset p_offset
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'inquiry_key', page.inquiry_key,
        'inquiry_type', page.inquiry_type,
        'organization_name', page.organization_name,
        'proposal_summary', page.proposal_summary,
        'source_url', page.source_url,
        'inquiry_status', page.inquiry_status,
        'created_at', page.created_at,
        'resolved_at', page.resolved_at
      ) order by page.created_at desc, page.inquiry_key
    ),
    '[]'::jsonb
  )
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

comment on function public.list_market_partnership_inquiries_for_management(text, integer, integer) is
  'Active market partnership inquiry manager-only bounded list without requester or internal UUID fields.';

revoke all on function public.list_market_partnership_inquiries_for_management(text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_market_partnership_inquiries_for_management(text, integer, integer)
  to authenticated;

create function public.resolve_market_partnership_inquiry(
  p_inquiry_key text,
  p_resolution text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_inquiry_key text := nullif(pg_catalog.btrim(p_inquiry_key), '');
  v_inquiry public.market_partnership_inquiries%rowtype;
begin
  v_actor_id := private.require_market_partnership_inquiry_manager();

  if v_inquiry_key is null or v_inquiry_key !~ '^[0-9a-f]{32}$' then
    raise exception '처리할 문의를 확인해 주세요.';
  end if;
  if p_resolution is null or p_resolution not in ('resolved', 'dismissed') then
    raise exception '처리 결과를 확인해 주세요.';
  end if;

  select inquiry.*
  into v_inquiry
  from public.market_partnership_inquiries as inquiry
  where inquiry.inquiry_key = v_inquiry_key
  for update;

  if not found then
    raise exception '처리할 문의를 찾을 수 없습니다.';
  end if;
  if v_inquiry.inquiry_status <> 'pending' then
    raise exception '이미 처리된 광고·입점·제휴 문의입니다.';
  end if;

  update public.market_partnership_inquiries as inquiry
  set inquiry_status = p_resolution,
      resolved_at = pg_catalog.now(),
      resolved_by = v_actor_id
  where inquiry.id = v_inquiry.id
    and inquiry.inquiry_status = 'pending'
  returning * into v_inquiry;

  if not found then
    raise exception '광고·입점·제휴 문의 처리 상태가 변경되었습니다.';
  end if;

  return pg_catalog.jsonb_build_object(
    'inquiry_key', v_inquiry.inquiry_key,
    'inquiry_status', v_inquiry.inquiry_status,
    'resolved_at', v_inquiry.resolved_at
  );
end;
$$;

comment on function public.resolve_market_partnership_inquiry(text, text) is
  'Active market partnership inquiry manager-only terminal acknowledgement without automatic listing, advertising, pricing, payment, or contract changes.';

revoke all on function public.resolve_market_partnership_inquiry(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_market_partnership_inquiry(text, text)
  to authenticated;
