-- PUL 9-3D-4A: optional date-only fields and permission-scoped certification management reads.
-- Existing human-readable schedule text remains authoritative when a date is not confirmed.

alter table public.certification_courses
  add column starts_on date,
  add column ends_on date,
  add constraint certification_courses_typed_date_order_check check (
    starts_on is null or ends_on is null or starts_on <= ends_on
  );

alter table public.certification_exam_schedules
  add column application_starts_on date,
  add column application_ends_on date,
  add column exam_on date,
  add column result_on date,
  add constraint certification_exam_schedules_application_date_order_check check (
    application_starts_on is null
    or application_ends_on is null
    or application_starts_on <= application_ends_on
  );

alter table public.certification_jobs
  add column application_starts_on date,
  add column application_ends_on date,
  add constraint certification_jobs_application_date_order_check check (
    application_starts_on is null
    or application_ends_on is null
    or application_starts_on <= application_ends_on
  );

create function private.certification_date_from_jsonb(
  p_payload jsonb,
  p_key text
)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_text text;
begin
  if p_payload is null
     or pg_catalog.jsonb_typeof(p_payload) <> 'object'
     or p_key is null then
    raise exception '날짜 입력값을 확인해 주세요.' using errcode = '22023';
  end if;

  if not (p_payload ? p_key)
     or pg_catalog.jsonb_typeof(p_payload -> p_key) = 'null' then
    return null;
  end if;

  if pg_catalog.jsonb_typeof(p_payload -> p_key) <> 'string' then
    raise exception '날짜는 YYYY-MM-DD 또는 null로 입력해 주세요.'
      using errcode = '22023';
  end if;

  v_text := p_payload ->> p_key;
  if v_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception '날짜는 YYYY-MM-DD 또는 null로 입력해 주세요.'
      using errcode = '22023';
  end if;

  begin
    return v_text::date;
  exception
    when invalid_datetime_format or datetime_field_overflow then
      raise exception '실제 존재하는 날짜를 YYYY-MM-DD로 입력해 주세요.'
        using errcode = '22023';
  end;
end;
$$;

comment on function private.certification_date_from_jsonb(jsonb, text) is
  'Strict optional date-only JSON parser; accepts an exact YYYY-MM-DD string, JSON null, or an absent key.';

revoke all on function private.certification_date_from_jsonb(jsonb, text)
  from public, anon, authenticated, service_role;

create or replace function private.public_certification_course_json(
  p_course public.certification_courses
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'course_key', p_course.course_key,
    'title', p_course.title,
    'category', p_course.category,
    'provider_type', p_course.provider_type,
    'provider_name', p_course.provider_name,
    'region', p_course.region,
    'course_method', p_course.course_method,
    'target_text', p_course.target_text,
    'schedule_text', p_course.schedule_text,
    'starts_on', p_course.starts_on,
    'ends_on', p_course.ends_on,
    'price_text', p_course.price_text,
    'recruit_status', p_course.recruit_status,
    'description', p_course.description,
    'official_url', p_course.official_url,
    'application_url', p_course.application_url,
    'is_featured', p_course.is_featured
  );
$$;

revoke all on function private.public_certification_course_json(public.certification_courses)
  from public, anon, authenticated, service_role;

create or replace function private.public_certification_exam_schedule_json(
  p_schedule public.certification_exam_schedules
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'schedule_key', p_schedule.schedule_key,
    'exam_name', p_schedule.exam_name,
    'exam_type', p_schedule.exam_type,
    'organization_name', p_schedule.organization_name,
    'application_period', p_schedule.application_period,
    'application_starts_on', p_schedule.application_starts_on,
    'application_ends_on', p_schedule.application_ends_on,
    'exam_date_text', p_schedule.exam_date_text,
    'exam_on', p_schedule.exam_on,
    'venue_announcement', p_schedule.venue_announcement,
    'result_date_text', p_schedule.result_date_text,
    'result_on', p_schedule.result_on,
    'required_items', p_schedule.required_items,
    'official_url', p_schedule.official_url,
    'schedule_status', p_schedule.schedule_status
  );
$$;

revoke all on function private.public_certification_exam_schedule_json(public.certification_exam_schedules)
  from public, anon, authenticated, service_role;

create or replace function private.public_certification_job_json(
  p_job public.certification_jobs
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'job_key', p_job.job_key,
    'title', p_job.title,
    'role_type', p_job.role_type,
    'region', p_job.region,
    'schedule_text', p_job.schedule_text,
    'application_starts_on', p_job.application_starts_on,
    'application_ends_on', p_job.application_ends_on,
    'role_description', p_job.role_description,
    'condition_text', p_job.condition_text,
    'pay_text', p_job.pay_text,
    'organizer_name', p_job.organizer_name,
    'organizer_type', p_job.organizer_type,
    'recruit_status', p_job.recruit_status,
    'official_url', p_job.official_url,
    'application_url', p_job.application_url
  );
$$;

revoke all on function private.public_certification_job_json(public.certification_jobs)
  from public, anon, authenticated, service_role;

create function private.certification_actor_has_management_permission(p_actor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_actor_id is not null
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
        and mapping.permission_code = 'certification.manage'
    ),
    false
  );
$$;

comment on function private.certification_actor_has_management_permission(uuid) is
  'Checks active-account certification.manage capability without taking a row lock.';

revoke all on function private.certification_actor_has_management_permission(uuid)
  from public, anon, authenticated, service_role;

create function private.management_certification_course_json(
  p_course public.certification_courses
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select private.public_certification_course_json(p_course)
    || pg_catalog.jsonb_build_object(
      'publication_status', p_course.publication_status,
      'version', p_course.version,
      'updated_at', p_course.updated_at
    );
$$;

comment on function private.management_certification_course_json(public.certification_courses) is
  'Exact editable course DTO without internal row or actor identifiers.';

revoke all on function private.management_certification_course_json(public.certification_courses)
  from public, anon, authenticated, service_role;

create function private.management_certification_exam_schedule_json(
  p_schedule public.certification_exam_schedules
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select private.public_certification_exam_schedule_json(p_schedule)
    || pg_catalog.jsonb_build_object(
      'publication_status', p_schedule.publication_status,
      'version', p_schedule.version,
      'updated_at', p_schedule.updated_at
    );
$$;

comment on function private.management_certification_exam_schedule_json(public.certification_exam_schedules) is
  'Exact editable exam schedule DTO without internal row or actor identifiers.';

revoke all on function private.management_certification_exam_schedule_json(public.certification_exam_schedules)
  from public, anon, authenticated, service_role;

create function private.management_certification_job_json(
  p_job public.certification_jobs
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select private.public_certification_job_json(p_job)
    || pg_catalog.jsonb_build_object(
      'publication_status', p_job.publication_status,
      'version', p_job.version,
      'updated_at', p_job.updated_at
    );
$$;

comment on function private.management_certification_job_json(public.certification_jobs) is
  'Exact editable job DTO without internal row or actor identifiers.';

revoke all on function private.management_certification_job_json(public.certification_jobs)
  from public, anon, authenticated, service_role;

create function public.list_certification_courses_for_management(
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
  v_actor_id uuid := auth.uid();
  v_keyword text := nullif(pg_catalog.btrim(p_keyword), '');
  v_total integer;
  v_items jsonb;
begin
  if not private.certification_actor_has_management_permission(v_actor_id) then
    raise exception '자격증·심판 정보 운영 권한이 없습니다.' using errcode = '42501';
  end if;
  if v_keyword is not null and pg_catalog.char_length(v_keyword) > 100 then
    raise exception '검색어는 100자 이내로 입력해 주세요.' using errcode = '22023';
  end if;
  if p_publication_status is not null
     and p_publication_status not in ('published', 'hidden', 'removed') then
    raise exception '공개 상태를 확인해 주세요.' using errcode = '22023';
  end if;
  if p_limit is null or p_limit not between 1 and 50
     or p_offset is null or p_offset < 0 then
    raise exception '페이지 범위를 확인해 주세요.' using errcode = '22023';
  end if;

  with matching as (
    select course.*
    from public.certification_courses as course
    where (p_publication_status is null or course.publication_status = p_publication_status)
      and (
        v_keyword is null
        or pg_catalog.strpos(
          pg_catalog.lower(pg_catalog.concat_ws(
            ' ', course.title, course.provider_name, course.region,
            course.target_text, course.schedule_text
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
          private.management_certification_course_json(page)
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

comment on function public.list_certification_courses_for_management(text, text, integer, integer) is
  'Authenticated certification.manage course list including hidden and removed rows without row locks.';

revoke all on function public.list_certification_courses_for_management(text, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_certification_courses_for_management(text, text, integer, integer)
  to authenticated;

create function public.get_certification_course_for_management(p_course_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_key text := nullif(pg_catalog.btrim(p_course_key), '');
  v_course public.certification_courses%rowtype;
begin
  if not private.certification_actor_has_management_permission(v_actor_id) then
    raise exception '자격증·심판 정보 운영 권한이 없습니다.' using errcode = '42501';
  end if;
  if v_key is null or v_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' then
    raise exception '교육과정을 찾을 수 없습니다.' using errcode = '22023';
  end if;

  select course.*
  into v_course
  from public.certification_courses as course
  where course.course_key = v_key;

  if not found then
    raise exception '교육과정을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  return private.management_certification_course_json(v_course);
end;
$$;

comment on function public.get_certification_course_for_management(text) is
  'Authenticated certification.manage course detail including hidden and removed rows without row locks.';

revoke all on function public.get_certification_course_for_management(text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_certification_course_for_management(text)
  to authenticated;

create function public.list_certification_exam_schedules_for_management(
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
  v_actor_id uuid := auth.uid();
  v_keyword text := nullif(pg_catalog.btrim(p_keyword), '');
  v_total integer;
  v_items jsonb;
begin
  if not private.certification_actor_has_management_permission(v_actor_id) then
    raise exception '자격증·심판 정보 운영 권한이 없습니다.' using errcode = '42501';
  end if;
  if v_keyword is not null and pg_catalog.char_length(v_keyword) > 100 then
    raise exception '검색어는 100자 이내로 입력해 주세요.' using errcode = '22023';
  end if;
  if p_publication_status is not null
     and p_publication_status not in ('published', 'hidden', 'removed') then
    raise exception '공개 상태를 확인해 주세요.' using errcode = '22023';
  end if;
  if p_limit is null or p_limit not between 1 and 50
     or p_offset is null or p_offset < 0 then
    raise exception '페이지 범위를 확인해 주세요.' using errcode = '22023';
  end if;

  with matching as (
    select schedule.*
    from public.certification_exam_schedules as schedule
    where (p_publication_status is null or schedule.publication_status = p_publication_status)
      and (
        v_keyword is null
        or pg_catalog.strpos(
          pg_catalog.lower(pg_catalog.concat_ws(
            ' ', schedule.exam_name, schedule.organization_name,
            schedule.application_period, schedule.exam_date_text
          )),
          pg_catalog.lower(v_keyword)
        ) > 0
      )
  ), page as (
    select matching.*
    from matching
    order by matching.updated_at desc, matching.schedule_key
    limit p_limit
    offset p_offset
  )
  select
    (select pg_catalog.count(*)::integer from matching),
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          private.management_certification_exam_schedule_json(page)
          order by page.updated_at desc, page.schedule_key
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

comment on function public.list_certification_exam_schedules_for_management(text, text, integer, integer) is
  'Authenticated certification.manage exam schedule list including hidden and removed rows without row locks.';

revoke all on function public.list_certification_exam_schedules_for_management(text, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_certification_exam_schedules_for_management(text, text, integer, integer)
  to authenticated;

create function public.get_certification_exam_schedule_for_management(p_schedule_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_key text := nullif(pg_catalog.btrim(p_schedule_key), '');
  v_schedule public.certification_exam_schedules%rowtype;
begin
  if not private.certification_actor_has_management_permission(v_actor_id) then
    raise exception '자격증·심판 정보 운영 권한이 없습니다.' using errcode = '42501';
  end if;
  if v_key is null or v_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' then
    raise exception '시험 일정을 찾을 수 없습니다.' using errcode = '22023';
  end if;

  select schedule.*
  into v_schedule
  from public.certification_exam_schedules as schedule
  where schedule.schedule_key = v_key;

  if not found then
    raise exception '시험 일정을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  return private.management_certification_exam_schedule_json(v_schedule);
end;
$$;

comment on function public.get_certification_exam_schedule_for_management(text) is
  'Authenticated certification.manage exam schedule detail including hidden and removed rows without row locks.';

revoke all on function public.get_certification_exam_schedule_for_management(text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_certification_exam_schedule_for_management(text)
  to authenticated;

create function public.list_certification_jobs_for_management(
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
  v_actor_id uuid := auth.uid();
  v_keyword text := nullif(pg_catalog.btrim(p_keyword), '');
  v_total integer;
  v_items jsonb;
begin
  if not private.certification_actor_has_management_permission(v_actor_id) then
    raise exception '자격증·심판 정보 운영 권한이 없습니다.' using errcode = '42501';
  end if;
  if v_keyword is not null and pg_catalog.char_length(v_keyword) > 100 then
    raise exception '검색어는 100자 이내로 입력해 주세요.' using errcode = '22023';
  end if;
  if p_publication_status is not null
     and p_publication_status not in ('published', 'hidden', 'removed') then
    raise exception '공개 상태를 확인해 주세요.' using errcode = '22023';
  end if;
  if p_limit is null or p_limit not between 1 and 50
     or p_offset is null or p_offset < 0 then
    raise exception '페이지 범위를 확인해 주세요.' using errcode = '22023';
  end if;

  with matching as (
    select job.*
    from public.certification_jobs as job
    where (p_publication_status is null or job.publication_status = p_publication_status)
      and (
        v_keyword is null
        or pg_catalog.strpos(
          pg_catalog.lower(pg_catalog.concat_ws(
            ' ', job.title, job.region, job.organizer_name,
            job.role_description, job.schedule_text
          )),
          pg_catalog.lower(v_keyword)
        ) > 0
      )
  ), page as (
    select matching.*
    from matching
    order by matching.updated_at desc, matching.job_key
    limit p_limit
    offset p_offset
  )
  select
    (select pg_catalog.count(*)::integer from matching),
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          private.management_certification_job_json(page)
          order by page.updated_at desc, page.job_key
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

comment on function public.list_certification_jobs_for_management(text, text, integer, integer) is
  'Authenticated certification.manage job list including hidden and removed rows without row locks.';

revoke all on function public.list_certification_jobs_for_management(text, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_certification_jobs_for_management(text, text, integer, integer)
  to authenticated;

create function public.get_certification_job_for_management(p_job_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_key text := nullif(pg_catalog.btrim(p_job_key), '');
  v_job public.certification_jobs%rowtype;
begin
  if not private.certification_actor_has_management_permission(v_actor_id) then
    raise exception '자격증·심판 정보 운영 권한이 없습니다.' using errcode = '42501';
  end if;
  if v_key is null or v_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' then
    raise exception '구인 공고를 찾을 수 없습니다.' using errcode = '22023';
  end if;

  select job.*
  into v_job
  from public.certification_jobs as job
  where job.job_key = v_key;

  if not found then
    raise exception '구인 공고를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  return private.management_certification_job_json(v_job);
end;
$$;

comment on function public.get_certification_job_for_management(text) is
  'Authenticated certification.manage job detail including hidden and removed rows without row locks.';

revoke all on function public.get_certification_job_for_management(text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_certification_job_for_management(text)
  to authenticated;

create or replace function public.mutate_certification_course(
  p_operation text,
  p_course_key text,
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
  v_course public.certification_courses%rowtype;
  v_key text := nullif(pg_catalog.btrim(p_course_key), '');
begin
  v_actor_id := private.require_certification_directory_manager();
  if p_operation not in ('create', 'update', 'publish', 'hide', 'remove') then
    raise exception '교육과정 작업을 확인해 주세요.';
  end if;
  if v_key is null or v_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' then
    raise exception '공개 course key를 확인해 주세요.';
  end if;
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception '교육과정 입력값을 확인해 주세요.';
  end if;

  if p_operation = 'create' then
    if p_expected_version is not null then
      raise exception '신규 등록에는 기존 version을 사용할 수 없습니다.';
    end if;
    if exists (
      select 1 from public.certification_courses as course
      where course.course_key = v_key
    ) then
      raise exception '이미 사용 중인 course key입니다.';
    end if;
  else
    if p_expected_version is null or p_expected_version < 1 then
      raise exception '현재 version을 확인해 주세요.';
    end if;
    select course.*
    into v_course
    from public.certification_courses as course
    where course.course_key = v_key
    for update;
    if not found then
      raise exception '교육과정을 찾을 수 없습니다.';
    end if;
    if v_course.version <> p_expected_version then
      raise exception '교육과정 정보가 변경되었습니다. 최신 정보를 다시 확인해 주세요.';
    end if;
    if v_course.publication_status = 'removed' and p_operation <> 'remove' then
      raise exception '제거된 교육과정은 다시 변경하거나 공개할 수 없습니다.';
    end if;
  end if;

  if p_operation in ('create', 'update') then
    if exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_payload) as supplied(key)
      where supplied.key not in (
        'title', 'category', 'provider_type', 'provider_name', 'region',
        'course_method', 'target_text', 'schedule_text', 'starts_on',
        'ends_on', 'price_text', 'recruit_status', 'description',
        'official_url', 'application_url', 'is_featured'
      )
    ) then
      raise exception '지원하지 않는 교육과정 입력값이 포함되어 있습니다.';
    end if;
    if pg_catalog.jsonb_typeof(p_payload -> 'is_featured') is distinct from 'boolean' then
      raise exception '교육과정 추천 여부를 확인해 주세요.';
    end if;

    if p_operation = 'create' then
      insert into public.certification_courses (
        course_key, title, category, provider_type, provider_name, region,
        course_method, target_text, schedule_text, starts_on, ends_on,
        price_text, recruit_status, description, official_url, application_url,
        is_featured, publication_status, created_by, updated_by
      ) values (
        v_key, pg_catalog.btrim(p_payload ->> 'title'), p_payload ->> 'category',
        p_payload ->> 'provider_type', pg_catalog.btrim(p_payload ->> 'provider_name'),
        pg_catalog.btrim(p_payload ->> 'region'), p_payload ->> 'course_method',
        pg_catalog.btrim(p_payload ->> 'target_text'),
        pg_catalog.btrim(p_payload ->> 'schedule_text'),
        private.certification_date_from_jsonb(p_payload, 'starts_on'),
        private.certification_date_from_jsonb(p_payload, 'ends_on'),
        pg_catalog.btrim(p_payload ->> 'price_text'),
        p_payload ->> 'recruit_status', pg_catalog.btrim(p_payload ->> 'description'),
        pg_catalog.btrim(p_payload ->> 'official_url'),
        nullif(pg_catalog.btrim(p_payload ->> 'application_url'), ''),
        (p_payload ->> 'is_featured')::boolean, 'hidden', v_actor_id, v_actor_id
      )
      returning * into v_course;
    else
      update public.certification_courses as course
      set title = pg_catalog.btrim(p_payload ->> 'title'),
          category = p_payload ->> 'category',
          provider_type = p_payload ->> 'provider_type',
          provider_name = pg_catalog.btrim(p_payload ->> 'provider_name'),
          region = pg_catalog.btrim(p_payload ->> 'region'),
          course_method = p_payload ->> 'course_method',
          target_text = pg_catalog.btrim(p_payload ->> 'target_text'),
          schedule_text = pg_catalog.btrim(p_payload ->> 'schedule_text'),
          starts_on = case
            when p_payload ? 'starts_on'
              then private.certification_date_from_jsonb(p_payload, 'starts_on')
            else course.starts_on
          end,
          ends_on = case
            when p_payload ? 'ends_on'
              then private.certification_date_from_jsonb(p_payload, 'ends_on')
            else course.ends_on
          end,
          price_text = pg_catalog.btrim(p_payload ->> 'price_text'),
          recruit_status = p_payload ->> 'recruit_status',
          description = pg_catalog.btrim(p_payload ->> 'description'),
          official_url = pg_catalog.btrim(p_payload ->> 'official_url'),
          application_url = nullif(pg_catalog.btrim(p_payload ->> 'application_url'), ''),
          is_featured = (p_payload ->> 'is_featured')::boolean,
          updated_by = v_actor_id,
          version = course.version + 1
      where course.id = v_course.id
      returning * into v_course;
    end if;
  elsif p_payload <> '{}'::jsonb then
    raise exception '이 작업에는 추가 입력값을 사용할 수 없습니다.';
  elsif p_operation = 'publish' then
    update public.certification_courses as course
    set publication_status = 'published', updated_by = v_actor_id,
        version = course.version + 1
    where course.id = v_course.id
    returning * into v_course;
  elsif p_operation = 'hide' then
    update public.certification_courses as course
    set publication_status = 'hidden', updated_by = v_actor_id,
        version = course.version + 1
    where course.id = v_course.id
    returning * into v_course;
  elsif p_operation = 'remove' then
    update public.certification_courses as course
    set publication_status = 'removed', is_featured = false,
        updated_by = v_actor_id, version = course.version + 1
    where course.id = v_course.id
    returning * into v_course;
  end if;

  return pg_catalog.jsonb_build_object(
    'course_key', v_course.course_key,
    'publication_status', v_course.publication_status,
    'version', v_course.version
  );
end;
$$;

comment on function public.mutate_certification_course(text, text, integer, jsonb) is
  'Active certification.manage platform operator-only course mutation with optional strict date-only fields.';

revoke all on function public.mutate_certification_course(text, text, integer, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.mutate_certification_course(text, text, integer, jsonb)
  to authenticated;

create or replace function public.mutate_certification_exam_schedule(
  p_operation text,
  p_schedule_key text,
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
  v_schedule public.certification_exam_schedules%rowtype;
  v_key text := nullif(pg_catalog.btrim(p_schedule_key), '');
begin
  v_actor_id := private.require_certification_directory_manager();
  if p_operation not in ('create', 'update', 'publish', 'hide', 'remove') then
    raise exception '시험 일정 작업을 확인해 주세요.';
  end if;
  if v_key is null or v_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' then
    raise exception '공개 schedule key를 확인해 주세요.';
  end if;
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception '시험 일정 입력값을 확인해 주세요.';
  end if;

  if p_operation = 'create' then
    if p_expected_version is not null then
      raise exception '신규 등록에는 기존 version을 사용할 수 없습니다.';
    end if;
    if exists (
      select 1 from public.certification_exam_schedules as schedule
      where schedule.schedule_key = v_key
    ) then
      raise exception '이미 사용 중인 schedule key입니다.';
    end if;
  else
    if p_expected_version is null or p_expected_version < 1 then
      raise exception '현재 version을 확인해 주세요.';
    end if;
    select schedule.*
    into v_schedule
    from public.certification_exam_schedules as schedule
    where schedule.schedule_key = v_key
    for update;
    if not found then
      raise exception '시험 일정을 찾을 수 없습니다.';
    end if;
    if v_schedule.version <> p_expected_version then
      raise exception '시험 일정이 변경되었습니다. 최신 정보를 다시 확인해 주세요.';
    end if;
    if v_schedule.publication_status = 'removed' and p_operation <> 'remove' then
      raise exception '제거된 시험 일정은 다시 변경하거나 공개할 수 없습니다.';
    end if;
  end if;

  if p_operation in ('create', 'update') then
    if exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_payload) as supplied(key)
      where supplied.key not in (
        'exam_name', 'exam_type', 'organization_name', 'application_period',
        'application_starts_on', 'application_ends_on', 'exam_date_text',
        'exam_on', 'venue_announcement', 'result_date_text', 'result_on',
        'required_items', 'official_url', 'schedule_status'
      )
    ) then
      raise exception '지원하지 않는 시험 일정 입력값이 포함되어 있습니다.';
    end if;

    if p_operation = 'create' then
      insert into public.certification_exam_schedules (
        schedule_key, exam_name, exam_type, organization_name,
        application_period, application_starts_on, application_ends_on,
        exam_date_text, exam_on, venue_announcement, result_date_text,
        result_on, required_items, official_url, schedule_status,
        publication_status, created_by, updated_by
      ) values (
        v_key, pg_catalog.btrim(p_payload ->> 'exam_name'), p_payload ->> 'exam_type',
        pg_catalog.btrim(p_payload ->> 'organization_name'),
        pg_catalog.btrim(p_payload ->> 'application_period'),
        private.certification_date_from_jsonb(p_payload, 'application_starts_on'),
        private.certification_date_from_jsonb(p_payload, 'application_ends_on'),
        pg_catalog.btrim(p_payload ->> 'exam_date_text'),
        private.certification_date_from_jsonb(p_payload, 'exam_on'),
        pg_catalog.btrim(p_payload ->> 'venue_announcement'),
        pg_catalog.btrim(p_payload ->> 'result_date_text'),
        private.certification_date_from_jsonb(p_payload, 'result_on'),
        pg_catalog.btrim(p_payload ->> 'required_items'),
        pg_catalog.btrim(p_payload ->> 'official_url'),
        p_payload ->> 'schedule_status', 'hidden', v_actor_id, v_actor_id
      )
      returning * into v_schedule;
    else
      update public.certification_exam_schedules as schedule
      set exam_name = pg_catalog.btrim(p_payload ->> 'exam_name'),
          exam_type = p_payload ->> 'exam_type',
          organization_name = pg_catalog.btrim(p_payload ->> 'organization_name'),
          application_period = pg_catalog.btrim(p_payload ->> 'application_period'),
          application_starts_on = case
            when p_payload ? 'application_starts_on'
              then private.certification_date_from_jsonb(p_payload, 'application_starts_on')
            else schedule.application_starts_on
          end,
          application_ends_on = case
            when p_payload ? 'application_ends_on'
              then private.certification_date_from_jsonb(p_payload, 'application_ends_on')
            else schedule.application_ends_on
          end,
          exam_date_text = pg_catalog.btrim(p_payload ->> 'exam_date_text'),
          exam_on = case
            when p_payload ? 'exam_on'
              then private.certification_date_from_jsonb(p_payload, 'exam_on')
            else schedule.exam_on
          end,
          venue_announcement = pg_catalog.btrim(p_payload ->> 'venue_announcement'),
          result_date_text = pg_catalog.btrim(p_payload ->> 'result_date_text'),
          result_on = case
            when p_payload ? 'result_on'
              then private.certification_date_from_jsonb(p_payload, 'result_on')
            else schedule.result_on
          end,
          required_items = pg_catalog.btrim(p_payload ->> 'required_items'),
          official_url = pg_catalog.btrim(p_payload ->> 'official_url'),
          schedule_status = p_payload ->> 'schedule_status',
          updated_by = v_actor_id,
          version = schedule.version + 1
      where schedule.id = v_schedule.id
      returning * into v_schedule;
    end if;
  elsif p_payload <> '{}'::jsonb then
    raise exception '이 작업에는 추가 입력값을 사용할 수 없습니다.';
  elsif p_operation = 'publish' then
    update public.certification_exam_schedules as schedule
    set publication_status = 'published', updated_by = v_actor_id,
        version = schedule.version + 1
    where schedule.id = v_schedule.id
    returning * into v_schedule;
  elsif p_operation = 'hide' then
    update public.certification_exam_schedules as schedule
    set publication_status = 'hidden', updated_by = v_actor_id,
        version = schedule.version + 1
    where schedule.id = v_schedule.id
    returning * into v_schedule;
  elsif p_operation = 'remove' then
    update public.certification_exam_schedules as schedule
    set publication_status = 'removed', updated_by = v_actor_id,
        version = schedule.version + 1
    where schedule.id = v_schedule.id
    returning * into v_schedule;
  end if;

  return pg_catalog.jsonb_build_object(
    'schedule_key', v_schedule.schedule_key,
    'publication_status', v_schedule.publication_status,
    'version', v_schedule.version
  );
end;
$$;

comment on function public.mutate_certification_exam_schedule(text, text, integer, jsonb) is
  'Active certification.manage platform operator-only exam mutation with optional strict date-only fields.';

revoke all on function public.mutate_certification_exam_schedule(text, text, integer, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.mutate_certification_exam_schedule(text, text, integer, jsonb)
  to authenticated;

create or replace function public.mutate_certification_job(
  p_operation text,
  p_job_key text,
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
  v_job public.certification_jobs%rowtype;
  v_key text := nullif(pg_catalog.btrim(p_job_key), '');
begin
  v_actor_id := private.require_certification_directory_manager();
  if p_operation not in ('create', 'update', 'publish', 'hide', 'remove') then
    raise exception '구인 공고 작업을 확인해 주세요.';
  end if;
  if v_key is null or v_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' then
    raise exception '공개 job key를 확인해 주세요.';
  end if;
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception '구인 공고 입력값을 확인해 주세요.';
  end if;

  if p_operation = 'create' then
    if p_expected_version is not null then
      raise exception '신규 등록에는 기존 version을 사용할 수 없습니다.';
    end if;
    if exists (
      select 1 from public.certification_jobs as job
      where job.job_key = v_key
    ) then
      raise exception '이미 사용 중인 job key입니다.';
    end if;
  else
    if p_expected_version is null or p_expected_version < 1 then
      raise exception '현재 version을 확인해 주세요.';
    end if;
    select job.*
    into v_job
    from public.certification_jobs as job
    where job.job_key = v_key
    for update;
    if not found then
      raise exception '구인 공고를 찾을 수 없습니다.';
    end if;
    if v_job.version <> p_expected_version then
      raise exception '구인 공고가 변경되었습니다. 최신 정보를 다시 확인해 주세요.';
    end if;
    if v_job.publication_status = 'removed' and p_operation <> 'remove' then
      raise exception '제거된 구인 공고는 다시 변경하거나 공개할 수 없습니다.';
    end if;
  end if;

  if p_operation in ('create', 'update') then
    if exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_payload) as supplied(key)
      where supplied.key not in (
        'title', 'role_type', 'region', 'schedule_text',
        'application_starts_on', 'application_ends_on', 'role_description',
        'condition_text', 'pay_text', 'organizer_name', 'organizer_type',
        'recruit_status', 'official_url', 'application_url'
      )
    ) then
      raise exception '지원하지 않는 구인 공고 입력값이 포함되어 있습니다.';
    end if;

    if p_operation = 'create' then
      insert into public.certification_jobs (
        job_key, title, role_type, region, schedule_text,
        application_starts_on, application_ends_on, role_description,
        condition_text, pay_text, organizer_name, organizer_type,
        recruit_status, official_url, application_url, publication_status,
        created_by, updated_by
      ) values (
        v_key, pg_catalog.btrim(p_payload ->> 'title'), p_payload ->> 'role_type',
        pg_catalog.btrim(p_payload ->> 'region'),
        pg_catalog.btrim(p_payload ->> 'schedule_text'),
        private.certification_date_from_jsonb(p_payload, 'application_starts_on'),
        private.certification_date_from_jsonb(p_payload, 'application_ends_on'),
        pg_catalog.btrim(p_payload ->> 'role_description'),
        pg_catalog.btrim(p_payload ->> 'condition_text'),
        pg_catalog.btrim(p_payload ->> 'pay_text'),
        pg_catalog.btrim(p_payload ->> 'organizer_name'),
        pg_catalog.btrim(p_payload ->> 'organizer_type'),
        p_payload ->> 'recruit_status',
        nullif(pg_catalog.btrim(p_payload ->> 'official_url'), ''),
        nullif(pg_catalog.btrim(p_payload ->> 'application_url'), ''),
        'hidden', v_actor_id, v_actor_id
      )
      returning * into v_job;
    else
      update public.certification_jobs as job
      set title = pg_catalog.btrim(p_payload ->> 'title'),
          role_type = p_payload ->> 'role_type',
          region = pg_catalog.btrim(p_payload ->> 'region'),
          schedule_text = pg_catalog.btrim(p_payload ->> 'schedule_text'),
          application_starts_on = case
            when p_payload ? 'application_starts_on'
              then private.certification_date_from_jsonb(p_payload, 'application_starts_on')
            else job.application_starts_on
          end,
          application_ends_on = case
            when p_payload ? 'application_ends_on'
              then private.certification_date_from_jsonb(p_payload, 'application_ends_on')
            else job.application_ends_on
          end,
          role_description = pg_catalog.btrim(p_payload ->> 'role_description'),
          condition_text = pg_catalog.btrim(p_payload ->> 'condition_text'),
          pay_text = pg_catalog.btrim(p_payload ->> 'pay_text'),
          organizer_name = pg_catalog.btrim(p_payload ->> 'organizer_name'),
          organizer_type = pg_catalog.btrim(p_payload ->> 'organizer_type'),
          recruit_status = p_payload ->> 'recruit_status',
          official_url = nullif(pg_catalog.btrim(p_payload ->> 'official_url'), ''),
          application_url = nullif(pg_catalog.btrim(p_payload ->> 'application_url'), ''),
          updated_by = v_actor_id,
          version = job.version + 1
      where job.id = v_job.id
      returning * into v_job;
    end if;
  elsif p_payload <> '{}'::jsonb then
    raise exception '이 작업에는 추가 입력값을 사용할 수 없습니다.';
  elsif p_operation = 'publish' then
    update public.certification_jobs as job
    set publication_status = 'published', updated_by = v_actor_id,
        version = job.version + 1
    where job.id = v_job.id
    returning * into v_job;
  elsif p_operation = 'hide' then
    update public.certification_jobs as job
    set publication_status = 'hidden', updated_by = v_actor_id,
        version = job.version + 1
    where job.id = v_job.id
    returning * into v_job;
  elsif p_operation = 'remove' then
    update public.certification_jobs as job
    set publication_status = 'removed', updated_by = v_actor_id,
        version = job.version + 1
    where job.id = v_job.id
    returning * into v_job;
  end if;

  return pg_catalog.jsonb_build_object(
    'job_key', v_job.job_key,
    'publication_status', v_job.publication_status,
    'version', v_job.version
  );
end;
$$;

comment on function public.mutate_certification_job(text, text, integer, jsonb) is
  'Active certification.manage platform operator-only job mutation with optional strict date-only fields.';

revoke all on function public.mutate_certification_job(text, text, integer, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.mutate_certification_job(text, text, integer, jsonb)
  to authenticated;
