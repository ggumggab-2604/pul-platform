-- PUL 9-3C: course operations management and information-report handling.
-- Public course reads and member report submission remain unchanged.

insert into public.platform_permission_definitions (
  code,
  description,
  is_active
)
values (
  'courses.manage',
  '골프장 운영 정보를 등록·수정하고 공개 상태와 정보 제보를 처리합니다.',
  true
);

insert into public.platform_role_permissions (
  platform_role,
  permission_code
)
values (
  'platform_admin',
  'courses.manage'
);

alter table public.course_information_reports
  add column resolved_at timestamptz,
  add column resolved_by uuid references public.user_accounts (id) on delete restrict,
  add column resolution_note text,
  add constraint course_information_reports_resolution_note_check
    check (
      resolution_note is null
      or (
        resolution_note = pg_catalog.btrim(resolution_note)
        and pg_catalog.char_length(resolution_note) between 2 and 500
      )
    ),
  add constraint course_information_reports_resolution_state_check
    check (
      (report_status = 'received' and resolved_at is null and resolved_by is null and resolution_note is null)
      or (report_status in ('handled', 'dismissed') and resolved_at is not null and resolved_by is not null)
    );

create index course_information_reports_target_created_idx
  on public.course_information_reports (target_course_id, created_at desc, id desc)
  where target_course_id is not null;

create table private.course_operation_requests (
  actor_id uuid not null references public.user_accounts (id) on delete cascade,
  request_id uuid not null,
  action_code text not null,
  request_fingerprint text not null,
  result_data jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  completed_at timestamptz,
  constraint course_operation_requests_pkey primary key (actor_id, request_id),
  constraint course_operation_requests_action_check
    check (
      action_code = pg_catalog.btrim(action_code)
      and action_code ~ '^course(\.information_report)?\.[a-z_]+$'
      and pg_catalog.char_length(action_code) <= 100
    ),
  constraint course_operation_requests_fingerprint_check
    check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint course_operation_requests_completion_check
    check (
      (completed_at is null and result_data is null)
      or (completed_at is not null and result_data is not null)
    )
);

comment on table private.course_operation_requests is
  'Private actor/request ledger for course management replay and request-ID payload conflict protection.';

alter table private.course_operation_requests enable row level security;
alter table private.course_operation_requests force row level security;
revoke all on table private.course_operation_requests
  from public, anon, authenticated, service_role;

create function private.course_actor_has_permission(
  p_actor_id uuid,
  p_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_actor_id is not null
    and p_permission_code is not null
    and exists (
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
    ),
    false
  );
$$;

revoke all on function private.course_actor_has_permission(uuid, text)
  from public, anon, authenticated, service_role;

create function private.require_course_manager()
returns table(actor_id uuid, platform_role text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_platform_role text;
begin
  if v_actor_id is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;

  select account.platform_role
  into v_platform_role
  from public.user_accounts as account
  join public.platform_role_permissions as mapping
    on mapping.platform_role = account.platform_role
  join public.platform_permission_definitions as permission
    on permission.code = mapping.permission_code
   and permission.is_active
  where account.id = v_actor_id
    and account.account_status = 'active'
    and mapping.permission_code = 'courses.manage'
  for share of account;

  if v_platform_role is null then
    raise exception '골프장 운영 권한이 없습니다.' using errcode = '42501';
  end if;

  actor_id := v_actor_id;
  platform_role := v_platform_role;
  return next;
end;
$$;

revoke all on function private.require_course_manager()
  from public, anon, authenticated, service_role;

create function private.course_claim_request(
  p_actor_id uuid,
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
  v_fingerprint text;
  v_existing private.course_operation_requests%rowtype;
begin
  if p_actor_id is null or p_request_id is null then
    raise exception '요청 식별자를 확인해 주세요.' using errcode = '22023';
  end if;
  if p_action_code is null or p_request_payload is null
     or pg_catalog.jsonb_typeof(p_request_payload) <> 'object' then
    raise exception '요청 내용을 확인해 주세요.' using errcode = '22023';
  end if;

  v_fingerprint := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(p_request_payload::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  insert into private.course_operation_requests (
    actor_id,
    request_id,
    action_code,
    request_fingerprint
  ) values (
    p_actor_id,
    p_request_id,
    p_action_code,
    v_fingerprint
  )
  on conflict (actor_id, request_id) do nothing;

  select request.*
  into v_existing
  from private.course_operation_requests as request
  where request.actor_id = p_actor_id
    and request.request_id = p_request_id
  for update;

  if v_existing.action_code <> p_action_code
     or v_existing.request_fingerprint <> v_fingerprint then
    raise exception '동일한 요청 식별자를 다른 작업에 재사용할 수 없습니다.'
      using errcode = '22023';
  end if;

  if v_existing.result_data is null
     and exists (
       select 1
       from public.audit_logs as audit
       where audit.actor_id = p_actor_id
         and audit.request_id = p_request_id
     ) then
    raise exception '동일한 요청 식별자는 이미 다른 완료 작업에서 사용되었습니다.'
      using errcode = '22023';
  end if;

  return v_existing.result_data;
end;
$$;

revoke all on function private.course_claim_request(uuid, uuid, text, jsonb)
  from public, anon, authenticated, service_role;

create function private.course_complete_request(
  p_actor_id uuid,
  p_request_id uuid,
  p_result_data jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_result_data is null or pg_catalog.jsonb_typeof(p_result_data) <> 'object' then
    raise exception '완료 결과 형식이 올바르지 않습니다.';
  end if;

  update private.course_operation_requests as request
  set result_data = p_result_data,
      completed_at = pg_catalog.now()
  where request.actor_id = p_actor_id
    and request.request_id = p_request_id
    and request.completed_at is null;

  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception '요청 완료 기록을 저장하지 못했습니다.';
  end if;
end;
$$;

revoke all on function private.course_complete_request(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;

create function private.course_write_audit(
  p_actor_id uuid,
  p_actor_role text,
  p_action text,
  p_target_type text,
  p_target_id text,
  p_before_summary jsonb,
  p_after_summary jsonb,
  p_request_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs (
    actor_id,
    actor_type,
    actor_role,
    action,
    target_type,
    target_id,
    before_summary,
    after_summary,
    metadata,
    request_id,
    outcome
  ) values (
    p_actor_id,
    'admin',
    p_actor_role,
    p_action,
    p_target_type,
    p_target_id,
    p_before_summary,
    p_after_summary,
    '{}'::jsonb,
    p_request_id,
    'success'
  );
exception when unique_violation then
  raise exception '동일한 요청 식별자는 이미 다른 완료 작업에서 사용되었습니다.'
    using errcode = '22023';
end;
$$;

revoke all on function private.course_write_audit(uuid, text, text, text, text, jsonb, jsonb, uuid)
  from public, anon, authenticated, service_role;

create function private.management_course_json(p_course public.courses)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'course_key', p_course.course_key,
    'name', p_course.name,
    'course_type', p_course.course_type,
    'region', p_course.region,
    'city', p_course.city,
    'address', p_course.address,
    'holes', p_course.holes,
    'operating_hours', p_course.operating_hours,
    'operation_code', p_course.operation_code,
    'phone', p_course.phone,
    'parking_available', p_course.parking_available,
    'feature_codes', p_course.feature_codes,
    'description', p_course.description,
    'reservation_url', p_course.reservation_url,
    'reservation_guide', p_course.reservation_guide,
    'fee_guide', p_course.fee_guide,
    'latitude', p_course.latitude,
    'longitude', p_course.longitude,
    'course_status', p_course.course_status,
    'updated_at', p_course.updated_at
  );
$$;

revoke all on function private.management_course_json(public.courses)
  from public, anon, authenticated, service_role;

create function public.list_courses_for_management(
  p_keyword text default null,
  p_region text default null,
  p_course_status text default null,
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
  v_actor_id uuid := auth.uid();
  v_keyword text := nullif(pg_catalog.btrim(p_keyword), '');
  v_total integer;
  v_items jsonb;
begin
  if not private.course_actor_has_permission(v_actor_id, 'courses.manage') then
    raise exception '골프장 운영 권한이 없습니다.' using errcode = '42501';
  end if;
  if v_keyword is not null and pg_catalog.char_length(v_keyword) > 100 then
    raise exception '검색어는 100자 이내로 입력해 주세요.' using errcode = '22023';
  end if;
  if p_region is not null
     and p_region not in ('서울', '경기', '인천', '충청', '강원', '전라', '경상', '제주') then
    raise exception '지역을 확인해 주세요.' using errcode = '22023';
  end if;
  if p_course_status is not null
     and p_course_status not in ('active', 'inactive', 'removed') then
    raise exception '공개 상태를 확인해 주세요.' using errcode = '22023';
  end if;
  if p_limit not between 1 and 50 or p_offset < 0 then
    raise exception '페이지 범위를 확인해 주세요.' using errcode = '22023';
  end if;

  with matching as (
    select course.*
    from public.courses as course
    where (p_region is null or course.region = p_region)
      and (p_course_status is null or course.course_status = p_course_status)
      and (
        v_keyword is null
        or pg_catalog.strpos(
          pg_catalog.lower(pg_catalog.concat_ws(
            ' ', course.name, course.region, course.city, course.address
          )),
          pg_catalog.lower(v_keyword)
        ) > 0
      )
  ), page as (
    select matching.*
    from matching
    order by matching.updated_at desc, matching.course_key
    limit p_limit
    offset p_offset
  )
  select
    (select pg_catalog.count(*)::integer from matching),
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          private.management_course_json(page)
          order by page.updated_at desc, page.course_key
        )
        from page
      ),
      '[]'::jsonb
    )
  into v_total, v_items;

  return pg_catalog.jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', p_offset + pg_catalog.jsonb_array_length(v_items) < v_total
  );
end;
$$;

revoke all on function public.list_courses_for_management(text, text, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_courses_for_management(text, text, text, integer, integer)
  to authenticated;

create function public.get_course_for_management(p_course_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_course public.courses%rowtype;
  v_key text := nullif(pg_catalog.btrim(p_course_key), '');
begin
  if not private.course_actor_has_permission(v_actor_id, 'courses.manage') then
    raise exception '골프장 운영 권한이 없습니다.' using errcode = '42501';
  end if;
  if v_key is null or v_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' then
    raise exception '골프장 정보를 찾을 수 없습니다.' using errcode = '22023';
  end if;

  select course.*
  into v_course
  from public.courses as course
  where course.course_key = v_key;

  if not found then
    raise exception '골프장 정보를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  return private.management_course_json(v_course);
end;
$$;

revoke all on function public.get_course_for_management(text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_course_for_management(text)
  to authenticated;

create function public.find_course_duplicate_candidates(
  p_name text,
  p_region text,
  p_city text,
  p_exclude_course_key text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_name text := nullif(pg_catalog.btrim(p_name), '');
  v_region text := nullif(pg_catalog.btrim(p_region), '');
  v_city text := nullif(pg_catalog.btrim(p_city), '');
  v_normalized_name text;
  v_items jsonb;
begin
  if not private.course_actor_has_permission(v_actor_id, 'courses.manage') then
    raise exception '골프장 운영 권한이 없습니다.' using errcode = '42501';
  end if;
  if v_name is null or pg_catalog.char_length(v_name) not between 2 and 120
     or v_region not in ('서울', '경기', '인천', '충청', '강원', '전라', '경상', '제주')
     or v_city is null or pg_catalog.char_length(v_city) > 100 then
    raise exception '중복 확인 정보를 확인해 주세요.' using errcode = '22023';
  end if;

  v_normalized_name := pg_catalog.lower(
    pg_catalog.regexp_replace(v_name, '[[:space:]]+', '', 'g')
  );

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'course_key', course.course_key,
        'name', course.name,
        'region', course.region,
        'city', course.city,
        'address', course.address,
        'course_status', course.course_status
      ) order by course.name, course.course_key
    ),
    '[]'::jsonb
  )
  into v_items
  from (
    select candidate.*
    from public.courses as candidate
    where (p_exclude_course_key is null or candidate.course_key <> p_exclude_course_key)
      and candidate.region = v_region
      and (
        pg_catalog.lower(
          pg_catalog.regexp_replace(candidate.name, '[[:space:]]+', '', 'g')
        ) = v_normalized_name
        or (
          candidate.city = v_city
          and (
            pg_catalog.strpos(pg_catalog.lower(candidate.name), pg_catalog.lower(v_name)) > 0
            or pg_catalog.strpos(pg_catalog.lower(v_name), pg_catalog.lower(candidate.name)) > 0
          )
        )
      )
    order by
      (pg_catalog.lower(pg_catalog.regexp_replace(candidate.name, '[[:space:]]+', '', 'g')) = v_normalized_name) desc,
      candidate.name,
      candidate.course_key
    limit 5
  ) as course;

  return v_items;
end;
$$;

revoke all on function public.find_course_duplicate_candidates(text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.find_course_duplicate_candidates(text, text, text, text)
  to authenticated;

create function public.mutate_managed_course(
  p_operation text,
  p_course_key text,
  p_expected_updated_at timestamptz,
  p_request_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_actor_role text;
  v_action_code text;
  v_request_payload jsonb;
  v_replay jsonb;
  v_result jsonb;
  v_course public.courses%rowtype;
  v_before jsonb;
  v_key text := nullif(pg_catalog.btrim(p_course_key), '');
  v_payload_key_count integer;
  v_feature_codes text[];
begin
  select manager.actor_id, manager.platform_role
  into v_actor_id, v_actor_role
  from private.require_course_manager() as manager;

  if p_operation not in ('create', 'update', 'activate', 'deactivate') then
    raise exception '골프장 작업을 확인해 주세요.' using errcode = '22023';
  end if;
  if p_request_id is null then
    raise exception '요청 식별자를 확인해 주세요.' using errcode = '22023';
  end if;
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception '골프장 입력값을 확인해 주세요.' using errcode = '22023';
  end if;

  v_action_code := 'course.' || p_operation;
  v_request_payload := pg_catalog.jsonb_build_object(
    'operation', p_operation,
    'course_key', v_key,
    'expected_updated_at', p_expected_updated_at,
    'payload', p_payload
  );
  v_replay := private.course_claim_request(
    v_actor_id,
    p_request_id,
    v_action_code,
    v_request_payload
  );
  if v_replay is not null then
    return v_replay;
  end if;

  if p_operation = 'create' then
    if v_key is not null or p_expected_updated_at is not null then
      raise exception '신규 등록에는 기존 골프장 식별자를 사용할 수 없습니다.' using errcode = '22023';
    end if;
  else
    if v_key is null or v_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'
       or p_expected_updated_at is null then
      raise exception '수정할 골프장과 최신 수정 시각을 확인해 주세요.' using errcode = '22023';
    end if;

    select course.*
    into v_course
    from public.courses as course
    where course.course_key = v_key
    for update;

    if not found then
      raise exception '골프장 정보를 찾을 수 없습니다.' using errcode = 'P0002';
    end if;
    if v_course.updated_at <> p_expected_updated_at then
      raise exception '골프장 정보가 변경되었습니다. 최신 내용을 다시 확인해 주세요.'
        using errcode = '40001';
    end if;
    if v_course.course_status = 'removed' then
      raise exception '제거된 골프장은 운영 화면에서 변경할 수 없습니다.' using errcode = '22023';
    end if;

    v_before := pg_catalog.jsonb_build_object(
      'name', v_course.name,
      'course_status', v_course.course_status,
      'updated_at', v_course.updated_at
    );
  end if;

  if p_operation in ('create', 'update') then
    if exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_payload) as supplied(key)
      where supplied.key not in (
        'name', 'course_type', 'region', 'city', 'address', 'holes',
        'operating_hours', 'operation_code', 'phone', 'parking_available',
        'feature_codes', 'description', 'reservation_url',
        'reservation_guide', 'fee_guide', 'latitude', 'longitude'
      )
    ) then
      raise exception '지원하지 않는 골프장 입력값이 포함되어 있습니다.' using errcode = '22023';
    end if;
    select pg_catalog.count(*)::integer
    into v_payload_key_count
    from pg_catalog.jsonb_object_keys(p_payload);
    if v_payload_key_count <> 17 then
      raise exception '필수 골프장 입력값을 모두 확인해 주세요.' using errcode = '22023';
    end if;
    if pg_catalog.jsonb_typeof(p_payload -> 'holes') <> 'number'
       or pg_catalog.jsonb_typeof(p_payload -> 'feature_codes') <> 'array'
       or pg_catalog.jsonb_typeof(p_payload -> 'parking_available') not in ('boolean', 'null')
       or pg_catalog.jsonb_typeof(p_payload -> 'latitude') not in ('number', 'null')
       or pg_catalog.jsonb_typeof(p_payload -> 'longitude') not in ('number', 'null') then
      raise exception '골프장 숫자·선택 입력값을 확인해 주세요.' using errcode = '22023';
    end if;
    if (p_payload -> 'latitude' = 'null'::jsonb) <> (p_payload -> 'longitude' = 'null'::jsonb) then
      raise exception '위도와 경도는 함께 입력해 주세요.' using errcode = '22023';
    end if;

    select coalesce(pg_catalog.array_agg(feature.value order by feature.value), '{}'::text[])
    into v_feature_codes
    from pg_catalog.jsonb_array_elements_text(p_payload -> 'feature_codes') as feature(value);

    if p_operation = 'create' then
      v_key := 'course-' || pg_catalog.replace(
        pg_catalog.gen_random_uuid()::text,
        '-',
        ''
      );

      insert into public.courses (
        course_key,
        name,
        course_type,
        region,
        city,
        address,
        holes,
        operating_hours,
        operation_code,
        phone,
        parking_available,
        feature_codes,
        description,
        reservation_url,
        reservation_guide,
        fee_guide,
        latitude,
        longitude,
        course_status
      ) values (
        v_key,
        pg_catalog.btrim(p_payload ->> 'name'),
        p_payload ->> 'course_type',
        p_payload ->> 'region',
        pg_catalog.btrim(p_payload ->> 'city'),
        pg_catalog.btrim(p_payload ->> 'address'),
        (p_payload ->> 'holes')::smallint,
        nullif(pg_catalog.btrim(p_payload ->> 'operating_hours'), ''),
        p_payload ->> 'operation_code',
        nullif(pg_catalog.btrim(p_payload ->> 'phone'), ''),
        case when p_payload -> 'parking_available' = 'null'::jsonb then null else (p_payload ->> 'parking_available')::boolean end,
        v_feature_codes,
        pg_catalog.btrim(p_payload ->> 'description'),
        nullif(pg_catalog.btrim(p_payload ->> 'reservation_url'), ''),
        nullif(pg_catalog.btrim(p_payload ->> 'reservation_guide'), ''),
        nullif(pg_catalog.btrim(p_payload ->> 'fee_guide'), ''),
        case when p_payload -> 'latitude' = 'null'::jsonb then null else (p_payload ->> 'latitude')::numeric end,
        case when p_payload -> 'longitude' = 'null'::jsonb then null else (p_payload ->> 'longitude')::numeric end,
        'inactive'
      )
      returning * into v_course;
    else
      update public.courses as course
      set name = pg_catalog.btrim(p_payload ->> 'name'),
          course_type = p_payload ->> 'course_type',
          region = p_payload ->> 'region',
          city = pg_catalog.btrim(p_payload ->> 'city'),
          address = pg_catalog.btrim(p_payload ->> 'address'),
          holes = (p_payload ->> 'holes')::smallint,
          operating_hours = nullif(pg_catalog.btrim(p_payload ->> 'operating_hours'), ''),
          operation_code = p_payload ->> 'operation_code',
          phone = nullif(pg_catalog.btrim(p_payload ->> 'phone'), ''),
          parking_available = case when p_payload -> 'parking_available' = 'null'::jsonb then null else (p_payload ->> 'parking_available')::boolean end,
          feature_codes = v_feature_codes,
          description = pg_catalog.btrim(p_payload ->> 'description'),
          reservation_url = nullif(pg_catalog.btrim(p_payload ->> 'reservation_url'), ''),
          reservation_guide = nullif(pg_catalog.btrim(p_payload ->> 'reservation_guide'), ''),
          fee_guide = nullif(pg_catalog.btrim(p_payload ->> 'fee_guide'), ''),
          latitude = case when p_payload -> 'latitude' = 'null'::jsonb then null else (p_payload ->> 'latitude')::numeric end,
          longitude = case when p_payload -> 'longitude' = 'null'::jsonb then null else (p_payload ->> 'longitude')::numeric end
      where course.id = v_course.id
      returning * into v_course;
    end if;
  elsif p_payload <> '{}'::jsonb then
    raise exception '공개 상태 변경에는 추가 입력값을 사용할 수 없습니다.' using errcode = '22023';
  elsif p_operation = 'activate' then
    update public.courses as course
    set course_status = 'active'
    where course.id = v_course.id
    returning * into v_course;
  elsif p_operation = 'deactivate' then
    update public.courses as course
    set course_status = 'inactive'
    where course.id = v_course.id
    returning * into v_course;
  end if;

  v_result := pg_catalog.jsonb_build_object(
    'course_key', v_course.course_key,
    'course_status', v_course.course_status,
    'updated_at', v_course.updated_at,
    'request_id', p_request_id
  );

  perform private.course_write_audit(
    v_actor_id,
    v_actor_role,
    v_action_code,
    'course',
    v_course.course_key,
    v_before,
    pg_catalog.jsonb_build_object(
      'name', v_course.name,
      'course_status', v_course.course_status,
      'updated_at', v_course.updated_at
    ),
    p_request_id
  );
  perform private.course_complete_request(v_actor_id, p_request_id, v_result);
  return v_result;
end;
$$;

revoke all on function public.mutate_managed_course(text, text, timestamptz, uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.mutate_managed_course(text, text, timestamptz, uuid, jsonb)
  to authenticated;

create function private.management_course_report_summary_json(
  p_report public.course_information_reports
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'report_id', p_report.id,
    'report_type', p_report.report_type,
    'course_name', p_report.course_name,
    'region', p_report.region,
    'report_status', p_report.report_status,
    'created_at', p_report.created_at,
    'updated_at', p_report.updated_at,
    'target_course_key', (
      select course.course_key
      from public.courses as course
      where course.id = p_report.target_course_id
    )
  );
$$;

revoke all on function private.management_course_report_summary_json(public.course_information_reports)
  from public, anon, authenticated, service_role;

create function public.list_course_information_reports_for_management(
  p_report_status text default null,
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
  v_actor_id uuid := auth.uid();
  v_total integer;
  v_items jsonb;
begin
  if not private.course_actor_has_permission(v_actor_id, 'courses.information_reports.read') then
    raise exception '골프장 정보 제보 조회 권한이 없습니다.' using errcode = '42501';
  end if;
  if p_report_status is not null
     and p_report_status not in ('received', 'handled', 'dismissed') then
    raise exception '제보 처리 상태를 확인해 주세요.' using errcode = '22023';
  end if;
  if p_limit not between 1 and 50 or p_offset < 0 then
    raise exception '페이지 범위를 확인해 주세요.' using errcode = '22023';
  end if;

  with matching as (
    select report.*
    from public.course_information_reports as report
    where p_report_status is null or report.report_status = p_report_status
  ), page as (
    select matching.*
    from matching
    order by
      (matching.report_status = 'received') desc,
      matching.created_at,
      matching.id
    limit p_limit
    offset p_offset
  )
  select
    (select pg_catalog.count(*)::integer from matching),
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          private.management_course_report_summary_json(page)
          order by (page.report_status = 'received') desc, page.created_at, page.id
        )
        from page
      ),
      '[]'::jsonb
    )
  into v_total, v_items;

  return pg_catalog.jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', p_offset + pg_catalog.jsonb_array_length(v_items) < v_total
  );
end;
$$;

revoke all on function public.list_course_information_reports_for_management(text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_course_information_reports_for_management(text, integer, integer)
  to authenticated;

create function public.get_course_information_report_for_management(p_report_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_report public.course_information_reports%rowtype;
  v_target jsonb;
begin
  if not private.course_actor_has_permission(v_actor_id, 'courses.information_reports.read') then
    raise exception '골프장 정보 제보 조회 권한이 없습니다.' using errcode = '42501';
  end if;
  if p_report_id is null then
    raise exception '제보를 찾을 수 없습니다.' using errcode = '22023';
  end if;

  select report.*
  into v_report
  from public.course_information_reports as report
  where report.id = p_report_id;

  if not found then
    raise exception '제보를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  select pg_catalog.jsonb_build_object(
    'course_key', course.course_key,
    'name', course.name,
    'address', course.address,
    'course_status', course.course_status,
    'updated_at', course.updated_at
  )
  into v_target
  from public.courses as course
  where course.id = v_report.target_course_id;

  return pg_catalog.jsonb_build_object(
    'report_id', v_report.id,
    'report_type', v_report.report_type,
    'course_name', v_report.course_name,
    'region', v_report.region,
    'location_description', v_report.location_description,
    'operation_details', v_report.operation_details,
    'report_body', v_report.report_body,
    'report_status', v_report.report_status,
    'created_at', v_report.created_at,
    'updated_at', v_report.updated_at,
    'resolved_at', v_report.resolved_at,
    'resolution_note', v_report.resolution_note,
    'target_course', v_target
  );
end;
$$;

revoke all on function public.get_course_information_report_for_management(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_course_information_report_for_management(uuid)
  to authenticated;

create function public.resolve_course_information_report_for_management(
  p_report_id uuid,
  p_resolution text,
  p_expected_updated_at timestamptz,
  p_resolution_note text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_actor_role text;
  v_report public.course_information_reports%rowtype;
  v_note text := nullif(pg_catalog.btrim(p_resolution_note), '');
  v_action_code text;
  v_replay jsonb;
  v_result jsonb;
begin
  select manager.actor_id, manager.platform_role
  into v_actor_id, v_actor_role
  from private.require_course_manager() as manager;

  if p_report_id is null or p_expected_updated_at is null or p_request_id is null
     or p_resolution not in ('handled', 'dismissed') then
    raise exception '제보 처리 요청을 확인해 주세요.' using errcode = '22023';
  end if;
  if v_note is not null and pg_catalog.char_length(v_note) not between 2 and 500 then
    raise exception '운영 메모는 2~500자로 입력해 주세요.' using errcode = '22023';
  end if;

  v_action_code := 'course.information_report.' || p_resolution;
  v_replay := private.course_claim_request(
    v_actor_id,
    p_request_id,
    v_action_code,
    pg_catalog.jsonb_build_object(
      'report_id', p_report_id,
      'resolution', p_resolution,
      'expected_updated_at', p_expected_updated_at,
      'resolution_note', v_note
    )
  );
  if v_replay is not null then
    return v_replay;
  end if;

  select report.*
  into v_report
  from public.course_information_reports as report
  where report.id = p_report_id
  for update;

  if not found then
    raise exception '제보를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  if v_report.updated_at <> p_expected_updated_at then
    raise exception '제보 상태가 변경되었습니다. 최신 내용을 다시 확인해 주세요.'
      using errcode = '40001';
  end if;
  if v_report.report_status <> 'received' then
    raise exception '이미 처리된 제보입니다.' using errcode = '22023';
  end if;

  update public.course_information_reports as report
  set report_status = p_resolution,
      resolved_at = pg_catalog.now(),
      resolved_by = v_actor_id,
      resolution_note = v_note
  where report.id = v_report.id
  returning * into v_report;

  v_result := pg_catalog.jsonb_build_object(
    'report_id', v_report.id,
    'report_status', v_report.report_status,
    'updated_at', v_report.updated_at,
    'request_id', p_request_id
  );

  perform private.course_write_audit(
    v_actor_id,
    v_actor_role,
    v_action_code,
    'course_information_report',
    v_report.id::text,
    pg_catalog.jsonb_build_object('report_status', 'received'),
    pg_catalog.jsonb_build_object('report_status', v_report.report_status),
    p_request_id
  );
  perform private.course_complete_request(v_actor_id, p_request_id, v_result);
  return v_result;
end;
$$;

revoke all on function public.resolve_course_information_report_for_management(uuid, text, timestamptz, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_course_information_report_for_management(uuid, text, timestamptz, text, uuid)
  to authenticated;

comment on function public.list_courses_for_management(text, text, text, integer, integer) is
  'Lists all course publication states for active courses.manage operators without internal UUIDs.';
comment on function public.get_course_for_management(text) is
  'Returns one complete course management record by stable public course key.';
comment on function public.find_course_duplicate_candidates(text, text, text, text) is
  'Returns up to five deterministic name/region/city duplicate candidates as a non-blocking warning.';
comment on function public.mutate_managed_course(text, text, timestamptz, uuid, jsonb) is
  'Creates inactive courses, updates course details, or activates/deactivates courses with stale-write and replay protection.';
comment on function public.list_course_information_reports_for_management(text, integer, integer) is
  'Lists privacy-minimized information-report summaries for explicit report readers.';
comment on function public.get_course_information_report_for_management(uuid) is
  'Returns one report body and optional current target course without reporter identity.';
comment on function public.resolve_course_information_report_for_management(uuid, text, timestamptz, text, uuid) is
  'Handles or dismisses one received report with optional short note, audit, replay protection, and stale-write detection.';
