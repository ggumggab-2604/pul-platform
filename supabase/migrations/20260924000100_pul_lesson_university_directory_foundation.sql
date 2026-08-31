-- PUL Lessons university/department directory: minimal real-data foundation.

create table public.lesson_university_departments (
  id uuid primary key default gen_random_uuid(),
  department_key text not null,
  university_name text not null,
  department_name text not null,
  summary text not null,
  region text not null,
  official_url text,
  admissions_url text,
  publication_status text not null default 'hidden',
  version integer not null default 1,
  created_by uuid not null references public.user_accounts (id),
  updated_by uuid not null references public.user_accounts (id),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint lesson_university_departments_key_uidx unique (department_key),
  constraint lesson_university_departments_key_check check (
    department_key = pg_catalog.btrim(department_key)
    and department_key ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'
  ),
  constraint lesson_university_departments_university_name_check check (
    university_name = pg_catalog.btrim(university_name)
    and pg_catalog.char_length(university_name) between 2 and 160
  ),
  constraint lesson_university_departments_department_name_check check (
    department_name = pg_catalog.btrim(department_name)
    and pg_catalog.char_length(department_name) between 2 and 160
  ),
  constraint lesson_university_departments_summary_check check (
    summary = pg_catalog.btrim(summary)
    and pg_catalog.char_length(summary) between 10 and 1000
  ),
  constraint lesson_university_departments_region_check check (
    region in ('서울', '경기', '인천', '충청', '강원', '전라', '경상', '제주')
  ),
  constraint lesson_university_departments_official_url_check check (
    official_url is null
    or (
      private.valid_lesson_external_url(official_url)
      and official_url !~ '[[:space:]]'
    )
  ),
  constraint lesson_university_departments_admissions_url_check check (
    admissions_url is null
    or (
      private.valid_lesson_external_url(admissions_url)
      and admissions_url !~ '[[:space:]]'
    )
  ),
  constraint lesson_university_departments_publication_status_check check (
    publication_status in ('published', 'hidden')
  ),
  constraint lesson_university_departments_version_check check (version >= 1)
);

comment on table public.lesson_university_departments is
  'Operator-authored public directory of park-golf related university departments; no ranking, student verification, or admissions processing.';

create index lesson_university_departments_public_region_idx
  on public.lesson_university_departments (region, university_name, department_name, department_key)
  where publication_status = 'published';

create index lesson_university_departments_management_status_idx
  on public.lesson_university_departments (publication_status, updated_at desc, department_key);

create trigger lesson_university_departments_set_updated_at
before update on public.lesson_university_departments
for each row execute function public.set_user_foundation_updated_at();

alter table public.lesson_university_departments enable row level security;
alter table public.lesson_university_departments force row level security;

create policy lesson_university_departments_public_published_select
on public.lesson_university_departments
for select
to anon, authenticated
using (publication_status = 'published');

revoke all on table public.lesson_university_departments
  from public, anon, authenticated, service_role;

create table public.lesson_university_department_submission_requests (
  id uuid primary key default gen_random_uuid(),
  request_key uuid not null default gen_random_uuid(),
  requester_user_id uuid not null references public.user_accounts (id),
  client_request_id uuid not null,
  request_fingerprint text not null,
  university_name text not null,
  department_name text not null,
  region text not null,
  reference_url text,
  request_message text not null,
  request_status text not null default 'pending',
  version integer not null default 1,
  resolved_by uuid references public.user_accounts (id),
  resolution_note text,
  resolved_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint lesson_university_department_requests_key_uidx unique (request_key),
  constraint lesson_university_department_requests_actor_request_uidx
    unique (requester_user_id, client_request_id),
  constraint lesson_university_department_requests_fingerprint_check check (
    request_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  constraint lesson_university_department_requests_university_name_check check (
    university_name = pg_catalog.btrim(university_name)
    and pg_catalog.char_length(university_name) between 2 and 160
  ),
  constraint lesson_university_department_requests_department_name_check check (
    department_name = pg_catalog.btrim(department_name)
    and pg_catalog.char_length(department_name) between 2 and 160
  ),
  constraint lesson_university_department_requests_region_check check (
    region in ('서울', '경기', '인천', '충청', '강원', '전라', '경상', '제주')
  ),
  constraint lesson_university_department_requests_reference_url_check check (
    reference_url is null
    or (
      private.valid_lesson_external_url(reference_url)
      and reference_url !~ '[[:space:]]'
    )
  ),
  constraint lesson_university_department_requests_message_check check (
    request_message = pg_catalog.btrim(request_message)
    and pg_catalog.char_length(request_message) between 10 and 2000
  ),
  constraint lesson_university_department_requests_status_check check (
    request_status in ('pending', 'completed', 'closed')
  ),
  constraint lesson_university_department_requests_version_check check (version >= 1),
  constraint lesson_university_department_requests_resolution_note_check check (
    resolution_note is null
    or (
      resolution_note = pg_catalog.btrim(resolution_note)
      and pg_catalog.char_length(resolution_note) between 2 and 1000
    )
  ),
  constraint lesson_university_department_requests_resolution_shape_check check (
    (
      request_status = 'pending'
      and resolved_by is null
      and resolution_note is null
      and resolved_at is null
    )
    or (
      request_status in ('completed', 'closed')
      and resolved_by is not null
      and resolved_at is not null
    )
  )
);

comment on table public.lesson_university_department_submission_requests is
  'Private active-member requests to add or correct one university department directory entry; resolution never auto-creates a directory row.';

create unique index lesson_university_department_requests_pending_duplicate_uidx
  on public.lesson_university_department_submission_requests (
    requester_user_id,
    pg_catalog.lower(university_name),
    pg_catalog.lower(department_name)
  )
  where request_status = 'pending';

create index lesson_university_department_requests_status_created_idx
  on public.lesson_university_department_submission_requests (
    request_status,
    created_at,
    request_key
  );

create trigger lesson_university_department_requests_set_updated_at
before update on public.lesson_university_department_submission_requests
for each row execute function public.set_user_foundation_updated_at();

alter table public.lesson_university_department_submission_requests enable row level security;
alter table public.lesson_university_department_submission_requests force row level security;

create policy lesson_university_department_requests_own_select
on public.lesson_university_department_submission_requests
for select
to authenticated
using ((select auth.uid()) = requester_user_id);

create policy lesson_university_department_requests_manager_select
on public.lesson_university_department_submission_requests
for select
to authenticated
using (
  exists (
    select 1
    from public.user_accounts as account
    join public.platform_role_permissions as mapping
      on mapping.platform_role = account.platform_role
    join public.platform_permission_definitions as permission
      on permission.code = mapping.permission_code
     and permission.is_active
    where account.id = (select auth.uid())
      and account.account_status = 'active'
      and mapping.permission_code = 'lessons.manage'
  )
);

revoke all on table public.lesson_university_department_submission_requests
  from public, anon, authenticated, service_role;

create function private.public_lesson_university_department_json(
  p_department public.lesson_university_departments
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'department_key', p_department.department_key,
    'university_name', p_department.university_name,
    'department_name', p_department.department_name,
    'summary', p_department.summary,
    'region', p_department.region,
    'official_url', p_department.official_url,
    'admissions_url', p_department.admissions_url
  );
$$;

revoke all on function private.public_lesson_university_department_json(
  public.lesson_university_departments
) from public, anon, authenticated, service_role;

create function private.management_lesson_university_department_json(
  p_department public.lesson_university_departments
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.public_lesson_university_department_json(p_department)
    || pg_catalog.jsonb_build_object(
      'publication_status', p_department.publication_status,
      'version', p_department.version,
      'created_at', p_department.created_at,
      'updated_at', p_department.updated_at
    );
$$;

revoke all on function private.management_lesson_university_department_json(
  public.lesson_university_departments
) from public, anon, authenticated, service_role;

create function private.management_lesson_university_department_request_json(
  p_request public.lesson_university_department_submission_requests
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'request_key', p_request.request_key,
    'university_name', p_request.university_name,
    'department_name', p_request.department_name,
    'region', p_request.region,
    'reference_url', p_request.reference_url,
    'request_message', p_request.request_message,
    'request_status', p_request.request_status,
    'version', p_request.version,
    'resolution_note', p_request.resolution_note,
    'resolved_at', p_request.resolved_at,
    'created_at', p_request.created_at,
    'updated_at', p_request.updated_at
  );
$$;

revoke all on function private.management_lesson_university_department_request_json(
  public.lesson_university_department_submission_requests
) from public, anon, authenticated, service_role;

create function public.list_public_lesson_university_departments(
  p_keyword text default null,
  p_region text default null,
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
  v_keyword text := nullif(pg_catalog.btrim(p_keyword), '');
  v_total integer;
  v_items jsonb;
begin
  if v_keyword is not null and pg_catalog.char_length(v_keyword) > 100 then
    raise exception '검색어는 100자 이하로 입력해 주세요.';
  end if;
  if p_region is not null
     and p_region not in ('서울', '경기', '인천', '충청', '강원', '전라', '경상', '제주') then
    raise exception '지역을 확인해 주세요.';
  end if;
  if p_limit not between 1 and 50 or p_offset < 0 then
    raise exception '페이지 범위를 확인해 주세요.';
  end if;

  select pg_catalog.count(*)::integer
  into v_total
  from public.lesson_university_departments as department
  where department.publication_status = 'published'
    and (p_region is null or department.region = p_region)
    and (
      v_keyword is null
      or pg_catalog.strpos(
        pg_catalog.lower(pg_catalog.concat_ws(
          ' ', department.university_name, department.department_name,
          department.summary, department.region
        )),
        pg_catalog.lower(v_keyword)
      ) > 0
    );

  with page as (
    select department.id
    from public.lesson_university_departments as department
    where department.publication_status = 'published'
      and (p_region is null or department.region = p_region)
      and (
        v_keyword is null
        or pg_catalog.strpos(
          pg_catalog.lower(pg_catalog.concat_ws(
            ' ', department.university_name, department.department_name,
            department.summary, department.region
          )),
          pg_catalog.lower(v_keyword)
        ) > 0
      )
    order by department.university_name, department.department_name, department.department_key
    limit p_limit
    offset p_offset
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      private.public_lesson_university_department_json(department)
      order by department.university_name, department.department_name, department.department_key
    ),
    '[]'::jsonb
  )
  into v_items
  from page
  join public.lesson_university_departments as department on department.id = page.id;

  return pg_catalog.jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', p_offset + pg_catalog.jsonb_array_length(v_items) < v_total
  );
end;
$$;

comment on function public.list_public_lesson_university_departments(text, text, integer, integer) is
  'Published-only university department directory with keyword, region, and bounded pagination.';

revoke all on function public.list_public_lesson_university_departments(text, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_public_lesson_university_departments(text, text, integer, integer)
  to anon, authenticated;

create function public.list_lesson_university_departments_for_management(
  p_keyword text default null,
  p_publication_status text default null,
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
  v_keyword text := nullif(pg_catalog.btrim(p_keyword), '');
  v_total integer;
  v_items jsonb;
begin
  perform private.require_lesson_directory_manager();
  if v_keyword is not null and pg_catalog.char_length(v_keyword) > 100 then
    raise exception '검색어는 100자 이하로 입력해 주세요.';
  end if;
  if p_publication_status is not null
     and p_publication_status not in ('published', 'hidden') then
    raise exception '공개 상태를 확인해 주세요.';
  end if;
  if p_limit not between 1 and 50 or p_offset < 0 then
    raise exception '페이지 범위를 확인해 주세요.';
  end if;

  select pg_catalog.count(*)::integer
  into v_total
  from public.lesson_university_departments as department
  where (p_publication_status is null or department.publication_status = p_publication_status)
    and (
      v_keyword is null
      or pg_catalog.strpos(
        pg_catalog.lower(pg_catalog.concat_ws(
          ' ', department.university_name, department.department_name,
          department.summary, department.region
        )),
        pg_catalog.lower(v_keyword)
      ) > 0
    );

  with page as (
    select department.id
    from public.lesson_university_departments as department
    where (p_publication_status is null or department.publication_status = p_publication_status)
      and (
        v_keyword is null
        or pg_catalog.strpos(
          pg_catalog.lower(pg_catalog.concat_ws(
            ' ', department.university_name, department.department_name,
            department.summary, department.region
          )),
          pg_catalog.lower(v_keyword)
        ) > 0
      )
    order by department.updated_at desc, department.department_key
    limit p_limit
    offset p_offset
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      private.management_lesson_university_department_json(department)
      order by department.updated_at desc, department.department_key
    ),
    '[]'::jsonb
  )
  into v_items
  from page
  join public.lesson_university_departments as department on department.id = page.id;

  return pg_catalog.jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', p_offset + pg_catalog.jsonb_array_length(v_items) < v_total
  );
end;
$$;

revoke all on function public.list_lesson_university_departments_for_management(
  text, text, integer, integer
) from public, anon, authenticated, service_role;
grant execute on function public.list_lesson_university_departments_for_management(
  text, text, integer, integer
) to authenticated;

create function public.get_lesson_university_department_for_management(
  p_department_key text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_department public.lesson_university_departments%rowtype;
begin
  perform private.require_lesson_directory_manager();
  select department.*
  into v_department
  from public.lesson_university_departments as department
  where department.department_key = pg_catalog.btrim(p_department_key);
  if not found then
    raise exception '대학·학과 정보를 찾을 수 없습니다.';
  end if;
  return private.management_lesson_university_department_json(v_department);
end;
$$;

revoke all on function public.get_lesson_university_department_for_management(text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_lesson_university_department_for_management(text)
  to authenticated;

create function public.mutate_lesson_university_department(
  p_operation text,
  p_department_key text,
  p_expected_version integer default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_department public.lesson_university_departments%rowtype;
  v_key text := nullif(pg_catalog.btrim(p_department_key), '');
begin
  v_actor_id := private.require_lesson_directory_manager();
  if p_operation not in ('create', 'update', 'publish', 'hide') then
    raise exception '대학·학과 작업을 확인해 주세요.';
  end if;
  if v_key is null or v_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' then
    raise exception '공개 department key를 확인해 주세요.';
  end if;
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception '대학·학과 입력값을 확인해 주세요.';
  end if;

  if p_operation = 'create' then
    if p_expected_version is not null then
      raise exception '신규 등록에는 기존 version을 사용할 수 없습니다.';
    end if;
    if exists (
      select 1
      from public.lesson_university_departments as department
      where department.department_key = v_key
    ) then
      raise exception '이미 사용 중인 department key입니다.';
    end if;
  else
    if p_expected_version is null or p_expected_version < 1 then
      raise exception '현재 version을 확인해 주세요.';
    end if;
    select department.*
    into v_department
    from public.lesson_university_departments as department
    where department.department_key = v_key
    for update;
    if not found then
      raise exception '대학·학과 정보를 찾을 수 없습니다.';
    end if;
    if v_department.version <> p_expected_version then
      raise exception '대학·학과 정보가 변경되었습니다. 최신 정보를 다시 확인해 주세요.';
    end if;
  end if;

  if p_operation in ('create', 'update') then
    if exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_payload) as supplied(key)
      where supplied.key not in (
        'university_name', 'department_name', 'summary', 'region',
        'official_url', 'admissions_url'
      )
    ) or (
      select pg_catalog.count(*)
      from pg_catalog.jsonb_object_keys(p_payload)
    ) <> 6 then
      raise exception '지원하지 않는 대학·학과 입력값이 포함되어 있습니다.';
    end if;

    if p_operation = 'create' then
      insert into public.lesson_university_departments (
        department_key,
        university_name,
        department_name,
        summary,
        region,
        official_url,
        admissions_url,
        publication_status,
        created_by,
        updated_by
      ) values (
        v_key,
        pg_catalog.regexp_replace(pg_catalog.btrim(p_payload ->> 'university_name'), '\s+', ' ', 'g'),
        pg_catalog.regexp_replace(pg_catalog.btrim(p_payload ->> 'department_name'), '\s+', ' ', 'g'),
        pg_catalog.btrim(p_payload ->> 'summary'),
        p_payload ->> 'region',
        nullif(pg_catalog.btrim(p_payload ->> 'official_url'), ''),
        nullif(pg_catalog.btrim(p_payload ->> 'admissions_url'), ''),
        'hidden',
        v_actor_id,
        v_actor_id
      )
      returning * into v_department;
    else
      update public.lesson_university_departments as department
      set university_name = pg_catalog.regexp_replace(
            pg_catalog.btrim(p_payload ->> 'university_name'), '\s+', ' ', 'g'
          ),
          department_name = pg_catalog.regexp_replace(
            pg_catalog.btrim(p_payload ->> 'department_name'), '\s+', ' ', 'g'
          ),
          summary = pg_catalog.btrim(p_payload ->> 'summary'),
          region = p_payload ->> 'region',
          official_url = nullif(pg_catalog.btrim(p_payload ->> 'official_url'), ''),
          admissions_url = nullif(pg_catalog.btrim(p_payload ->> 'admissions_url'), ''),
          updated_by = v_actor_id,
          version = department.version + 1
      where department.id = v_department.id
      returning * into v_department;
    end if;
  elsif p_payload <> '{}'::jsonb then
    raise exception '이 작업에는 추가 입력값을 사용할 수 없습니다.';
  elsif p_operation = 'publish' then
    update public.lesson_university_departments as department
    set publication_status = 'published',
        updated_by = v_actor_id,
        version = department.version + 1
    where department.id = v_department.id
    returning * into v_department;
  else
    update public.lesson_university_departments as department
    set publication_status = 'hidden',
        updated_by = v_actor_id,
        version = department.version + 1
    where department.id = v_department.id
    returning * into v_department;
  end if;

  return pg_catalog.jsonb_build_object(
    'department_key', v_department.department_key,
    'publication_status', v_department.publication_status,
    'version', v_department.version
  );
end;
$$;

comment on function public.mutate_lesson_university_department(text, text, integer, jsonb) is
  'Active lessons.manage operator-only university department create, full update, publish, and hide mutation.';

revoke all on function public.mutate_lesson_university_department(text, text, integer, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.mutate_lesson_university_department(text, text, integer, jsonb)
  to authenticated;

create function public.submit_lesson_university_department_request(
  p_request_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_request public.lesson_university_department_submission_requests%rowtype;
  v_university_name text;
  v_department_name text;
  v_region text;
  v_reference_url text;
  v_request_message text;
  v_fingerprint text;
begin
  if v_actor_id is null then
    raise exception '로그인이 필요합니다.';
  end if;
  if p_request_id is null then
    raise exception '요청 식별값을 확인해 주세요.';
  end if;
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception '등록 요청 입력값을 확인해 주세요.';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_object_keys(p_payload) as supplied(key)
    where supplied.key not in (
      'university_name', 'department_name', 'region', 'reference_url', 'request_message'
    )
  ) or (
    select pg_catalog.count(*)
    from pg_catalog.jsonb_object_keys(p_payload)
  ) <> 5 then
    raise exception '지원하지 않는 등록 요청 입력값이 포함되어 있습니다.';
  end if;

  v_university_name := pg_catalog.regexp_replace(
    pg_catalog.btrim(p_payload ->> 'university_name'), '\s+', ' ', 'g'
  );
  v_department_name := pg_catalog.regexp_replace(
    pg_catalog.btrim(p_payload ->> 'department_name'), '\s+', ' ', 'g'
  );
  v_region := p_payload ->> 'region';
  v_reference_url := nullif(pg_catalog.btrim(p_payload ->> 'reference_url'), '');
  v_request_message := pg_catalog.btrim(p_payload ->> 'request_message');

  if v_university_name is null
     or pg_catalog.char_length(v_university_name) not between 2 and 160 then
    raise exception '대학명은 2~160자로 입력해 주세요.';
  end if;
  if v_department_name is null
     or pg_catalog.char_length(v_department_name) not between 2 and 160 then
    raise exception '학과·과정명은 2~160자로 입력해 주세요.';
  end if;
  if v_region not in ('서울', '경기', '인천', '충청', '강원', '전라', '경상', '제주') then
    raise exception '지역을 확인해 주세요.';
  end if;
  if v_reference_url is not null
     and (
       not private.valid_lesson_external_url(v_reference_url)
       or v_reference_url ~ '[[:space:]]'
     ) then
    raise exception '참고 URL은 https 주소로 입력해 주세요.';
  end if;
  if v_request_message is null
     or pg_catalog.char_length(v_request_message) not between 10 and 2000 then
    raise exception '요청 내용은 10~2000자로 입력해 주세요.';
  end if;

  perform 1
  from public.user_accounts as account
  where account.id = v_actor_id
    and account.account_status = 'active'
  for share;
  if not found then
    raise exception '현재 계정으로는 대학·학과 등록 요청을 제출할 수 없습니다.';
  end if;

  v_fingerprint := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'university_name', v_university_name,
          'department_name', v_department_name,
          'region', v_region,
          'reference_url', v_reference_url,
          'request_message', v_request_message
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  select request.*
  into v_request
  from public.lesson_university_department_submission_requests as request
  where request.requester_user_id = v_actor_id
    and request.client_request_id = p_request_id
  for update;
  if found then
    if v_request.request_fingerprint <> v_fingerprint then
      raise exception '같은 요청 식별값을 다른 내용에 재사용할 수 없습니다.';
    end if;
    return pg_catalog.jsonb_build_object(
      'request_key', v_request.request_key,
      'request_status', v_request.request_status,
      'version', v_request.version,
      'replayed', true
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_actor_id::text || ':' || pg_catalog.lower(v_university_name)
        || ':' || pg_catalog.lower(v_department_name),
      0
    )
  );

  if exists (
    select 1
    from public.lesson_university_department_submission_requests as request
    where request.requester_user_id = v_actor_id
      and request.request_status = 'pending'
      and pg_catalog.lower(request.university_name) = pg_catalog.lower(v_university_name)
      and pg_catalog.lower(request.department_name) = pg_catalog.lower(v_department_name)
  ) then
    raise exception '같은 대학·학과의 처리 중인 요청이 이미 있습니다.';
  end if;

  insert into public.lesson_university_department_submission_requests (
    requester_user_id,
    client_request_id,
    request_fingerprint,
    university_name,
    department_name,
    region,
    reference_url,
    request_message
  ) values (
    v_actor_id,
    p_request_id,
    v_fingerprint,
    v_university_name,
    v_department_name,
    v_region,
    v_reference_url,
    v_request_message
  )
  on conflict (requester_user_id, client_request_id) do nothing
  returning * into v_request;

  if not found then
    select request.*
    into v_request
    from public.lesson_university_department_submission_requests as request
    where request.requester_user_id = v_actor_id
      and request.client_request_id = p_request_id
    for update;
    if not found then
      raise exception '대학·학과 등록 요청을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.';
    end if;
    if v_request.request_fingerprint <> v_fingerprint then
      raise exception '같은 요청 식별값을 다른 내용에 재사용할 수 없습니다.';
    end if;
    return pg_catalog.jsonb_build_object(
      'request_key', v_request.request_key,
      'request_status', v_request.request_status,
      'version', v_request.version,
      'replayed', true
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'request_key', v_request.request_key,
    'request_status', v_request.request_status,
    'version', v_request.version,
    'replayed', false
  );
end;
$$;

comment on function public.submit_lesson_university_department_request(uuid, jsonb) is
  'Active authenticated member submits one replay-safe minimal university department registration or correction request.';

revoke all on function public.submit_lesson_university_department_request(uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_lesson_university_department_request(uuid, jsonb)
  to authenticated;

create function public.list_lesson_university_department_requests_for_management(
  p_request_status text default 'pending',
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
  perform private.require_lesson_directory_manager();
  if p_request_status is not null
     and p_request_status not in ('pending', 'completed', 'closed') then
    raise exception '요청 상태를 확인해 주세요.';
  end if;
  if p_limit not between 1 and 50 or p_offset < 0 then
    raise exception '페이지 범위를 확인해 주세요.';
  end if;

  select pg_catalog.count(*)::integer
  into v_total
  from public.lesson_university_department_submission_requests as request
  where p_request_status is null or request.request_status = p_request_status;

  with page as (
    select request.id
    from public.lesson_university_department_submission_requests as request
    where p_request_status is null or request.request_status = p_request_status
    order by request.created_at, request.request_key
    limit p_limit
    offset p_offset
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      private.management_lesson_university_department_request_json(request)
      order by request.created_at, request.request_key
    ),
    '[]'::jsonb
  )
  into v_items
  from page
  join public.lesson_university_department_submission_requests as request
    on request.id = page.id;

  return pg_catalog.jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', p_offset + pg_catalog.jsonb_array_length(v_items) < v_total
  );
end;
$$;

revoke all on function public.list_lesson_university_department_requests_for_management(
  text, integer, integer
) from public, anon, authenticated, service_role;
grant execute on function public.list_lesson_university_department_requests_for_management(
  text, integer, integer
) to authenticated;

create function public.resolve_lesson_university_department_request(
  p_request_key uuid,
  p_expected_version integer,
  p_resolution text,
  p_resolution_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_request public.lesson_university_department_submission_requests%rowtype;
  v_note text := nullif(pg_catalog.btrim(p_resolution_note), '');
begin
  v_actor_id := private.require_lesson_directory_manager();
  if p_request_key is null or p_expected_version is null or p_expected_version < 1 then
    raise exception '요청 식별값과 현재 version을 확인해 주세요.';
  end if;
  if p_resolution not in ('completed', 'closed') then
    raise exception '요청 처리 상태를 확인해 주세요.';
  end if;
  if v_note is not null and pg_catalog.char_length(v_note) not between 2 and 1000 then
    raise exception '처리 메모는 2~1000자로 입력해 주세요.';
  end if;

  select request.*
  into v_request
  from public.lesson_university_department_submission_requests as request
  where request.request_key = p_request_key
  for update;
  if not found then
    raise exception '대학·학과 등록 요청을 찾을 수 없습니다.';
  end if;
  if v_request.version <> p_expected_version then
    raise exception '등록 요청이 변경되었습니다. 최신 정보를 다시 확인해 주세요.';
  end if;
  if v_request.request_status <> 'pending' then
    raise exception '이미 처리된 등록 요청입니다.';
  end if;

  update public.lesson_university_department_submission_requests as request
  set request_status = p_resolution,
      version = request.version + 1,
      resolved_by = v_actor_id,
      resolution_note = v_note,
      resolved_at = pg_catalog.now()
  where request.id = v_request.id
  returning * into v_request;

  return private.management_lesson_university_department_request_json(v_request);
end;
$$;

comment on function public.resolve_lesson_university_department_request(uuid, integer, text, text) is
  'Active lessons.manage operator marks one pending request completed or closed; no directory row is created automatically.';

revoke all on function public.resolve_lesson_university_department_request(
  uuid, integer, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.resolve_lesson_university_department_request(
  uuid, integer, text, text
) to authenticated;
