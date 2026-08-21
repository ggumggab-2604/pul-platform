create table public.certification_submission_requests (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  request_key text not null default pg_catalog.encode(extensions.gen_random_bytes(16), 'hex'),
  requester_user_id uuid not null references public.user_accounts (id),
  request_type text not null,
  title text not null,
  organization_name text not null,
  region text,
  summary text not null,
  source_url text,
  request_status text not null default 'pending',
  created_at timestamptz not null default pg_catalog.now(),
  resolved_at timestamptz,
  resolved_by uuid references public.user_accounts (id),
  constraint certification_submission_requests_request_key_uidx unique (request_key),
  constraint certification_submission_requests_request_key_check check (
    request_key ~ '^[0-9a-f]{32}$'
  ),
  constraint certification_submission_requests_type_check check (
    request_type in ('course_registration', 'job_registration')
  ),
  constraint certification_submission_requests_title_check check (
    title = pg_catalog.btrim(title)
    and pg_catalog.char_length(title) between 2 and 180
  ),
  constraint certification_submission_requests_organization_check check (
    organization_name = pg_catalog.btrim(organization_name)
    and pg_catalog.char_length(organization_name) between 2 and 160
  ),
  constraint certification_submission_requests_region_check check (
    region is null
    or (
      region = pg_catalog.btrim(region)
      and pg_catalog.char_length(region) between 1 and 80
    )
  ),
  constraint certification_submission_requests_summary_check check (
    summary = pg_catalog.btrim(summary)
    and pg_catalog.char_length(summary) between 10 and 3000
  ),
  constraint certification_submission_requests_source_url_check check (
    source_url is null
    or private.valid_certification_external_url(source_url)
  ),
  constraint certification_submission_requests_status_check check (
    request_status in ('pending', 'resolved', 'dismissed')
  ),
  constraint certification_submission_requests_resolution_check check (
    (
      request_status = 'pending'
      and resolved_at is null
      and resolved_by is null
    )
    or (
      request_status in ('resolved', 'dismissed')
      and resolved_at is not null
      and resolved_by is not null
    )
  )
);

comment on table public.certification_submission_requests is
  'Private active-member course and job registration requests with simple certification operator resolution.';

create index certification_submission_requests_status_created_idx
  on public.certification_submission_requests (
    request_status,
    created_at desc,
    request_key
  );

alter table public.certification_submission_requests enable row level security;
alter table public.certification_submission_requests force row level security;

revoke all on table public.certification_submission_requests
  from public, anon, authenticated, service_role;

create function public.submit_certification_submission_request(
  p_request_type text,
  p_title text,
  p_organization_name text,
  p_region text,
  p_summary text,
  p_source_url text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_account_status text;
  v_title text := nullif(pg_catalog.btrim(p_title), '');
  v_organization_name text := nullif(pg_catalog.btrim(p_organization_name), '');
  v_region text := nullif(pg_catalog.btrim(p_region), '');
  v_summary text := nullif(pg_catalog.btrim(p_summary), '');
  v_source_url text := nullif(pg_catalog.btrim(p_source_url), '');
  v_request public.certification_submission_requests%rowtype;
begin
  if v_actor_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select account.account_status
  into v_account_status
  from public.user_accounts as account
  where account.id = v_actor_id
  for share;

  if v_account_status is distinct from 'active' then
    raise exception '정상 활동 계정만 자격증·심판 등록 문의를 접수할 수 있습니다.';
  end if;

  if p_request_type is null
     or p_request_type not in ('course_registration', 'job_registration') then
    raise exception '등록 문의 유형을 확인해 주세요.';
  end if;
  if v_title is null or pg_catalog.char_length(v_title) not between 2 and 180 then
    raise exception '제목은 2~180자로 입력해 주세요.';
  end if;
  if v_organization_name is null
     or pg_catalog.char_length(v_organization_name) not between 2 and 160 then
    raise exception '기관·업체명은 2~160자로 입력해 주세요.';
  end if;
  if v_region is not null and pg_catalog.char_length(v_region) > 80 then
    raise exception '지역은 80자 이내로 입력해 주세요.';
  end if;
  if v_summary is null or pg_catalog.char_length(v_summary) not between 10 and 3000 then
    raise exception '안내 내용은 10~3000자로 입력해 주세요.';
  end if;
  if v_source_url is not null
     and not private.valid_certification_external_url(v_source_url) then
    raise exception '공식 확인 URL은 유효한 HTTPS 주소로 입력해 주세요.';
  end if;

  insert into public.certification_submission_requests (
    requester_user_id,
    request_type,
    title,
    organization_name,
    region,
    summary,
    source_url
  ) values (
    v_actor_id,
    p_request_type,
    v_title,
    v_organization_name,
    v_region,
    v_summary,
    v_source_url
  )
  returning * into v_request;

  return pg_catalog.jsonb_build_object(
    'request_key', v_request.request_key,
    'request_status', v_request.request_status
  );
end;
$$;

comment on function public.submit_certification_submission_request(text, text, text, text, text, text) is
  'Active authenticated member course or job registration request without automatic directory publication or internal UUID exposure.';

revoke all on function public.submit_certification_submission_request(text, text, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_certification_submission_request(text, text, text, text, text, text)
  to authenticated;

create function public.list_certification_submission_requests_for_management(
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
  perform private.require_certification_directory_manager();

  if p_status is not null and p_status not in ('pending', 'resolved', 'dismissed') then
    raise exception '등록 문의 상태를 확인해 주세요.';
  end if;
  if p_limit not between 1 and 50 or p_offset < 0 then
    raise exception '페이지 범위를 확인해 주세요.';
  end if;

  select pg_catalog.count(*)::integer
  into v_total
  from public.certification_submission_requests as request
  where p_status is null or request.request_status = p_status;

  with page as (
    select request.*
    from public.certification_submission_requests as request
    where p_status is null or request.request_status = p_status
    order by request.created_at desc, request.request_key
    limit p_limit
    offset p_offset
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'request_key', page.request_key,
        'request_type', page.request_type,
        'title', page.title,
        'organization_name', page.organization_name,
        'region', page.region,
        'summary', page.summary,
        'source_url', page.source_url,
        'request_status', page.request_status,
        'created_at', page.created_at,
        'resolved_at', page.resolved_at
      ) order by page.created_at desc, page.request_key
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

comment on function public.list_certification_submission_requests_for_management(text, integer, integer) is
  'Active certification.manage operator-only bounded request list without requester or internal UUID fields.';

revoke all on function public.list_certification_submission_requests_for_management(text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_certification_submission_requests_for_management(text, integer, integer)
  to authenticated;

create function public.resolve_certification_submission_request(
  p_request_key text,
  p_resolution text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_request_key text := nullif(pg_catalog.btrim(p_request_key), '');
  v_request public.certification_submission_requests%rowtype;
begin
  v_actor_id := private.require_certification_directory_manager();

  if v_request_key is null or v_request_key !~ '^[0-9a-f]{32}$' then
    raise exception '처리할 등록 문의를 확인해 주세요.';
  end if;
  if p_resolution is null or p_resolution not in ('resolved', 'dismissed') then
    raise exception '처리 결과를 확인해 주세요.';
  end if;

  select request.*
  into v_request
  from public.certification_submission_requests as request
  where request.request_key = v_request_key
  for update;

  if not found then
    raise exception '처리할 등록 문의를 찾을 수 없습니다.';
  end if;
  if v_request.request_status <> 'pending' then
    raise exception '이미 처리된 자격증·심판 등록 문의입니다.';
  end if;

  update public.certification_submission_requests as request
  set request_status = p_resolution,
      resolved_at = pg_catalog.now(),
      resolved_by = v_actor_id
  where request.id = v_request.id
    and request.request_status = 'pending'
  returning * into v_request;

  if not found then
    raise exception '자격증·심판 등록 문의 처리 상태가 변경되었습니다.';
  end if;

  return pg_catalog.jsonb_build_object(
    'request_key', v_request.request_key,
    'request_status', v_request.request_status,
    'resolved_at', v_request.resolved_at
  );
end;
$$;

comment on function public.resolve_certification_submission_request(text, text) is
  'Active certification.manage operator-only terminal request acknowledgement without automatic course or job mutation.';

revoke all on function public.resolve_certification_submission_request(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_certification_submission_request(text, text)
  to authenticated;
