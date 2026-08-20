create function private.valid_certification_external_url(p_url text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    p_url is not null
    and p_url = pg_catalog.btrim(p_url)
    and pg_catalog.char_length(p_url) between 12 and 500
    and p_url ~ '^https://[A-Za-z0-9][^[:space:]]*$'
    and p_url !~ '[[:cntrl:]]';
$$;

revoke all on function private.valid_certification_external_url(text)
  from public, anon, authenticated, service_role;

create table public.certification_courses (
  id uuid primary key default gen_random_uuid(),
  course_key text not null,
  title text not null,
  category text not null,
  provider_type text not null,
  provider_name text not null,
  region text not null,
  course_method text not null,
  target_text text not null,
  schedule_text text not null,
  price_text text not null,
  recruit_status text not null,
  description text not null,
  official_url text not null,
  application_url text,
  is_featured boolean not null default false,
  publication_status text not null default 'hidden',
  version integer not null default 1,
  created_by uuid not null references public.user_accounts (id),
  updated_by uuid not null references public.user_accounts (id),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint certification_courses_course_key_uidx unique (course_key),
  constraint certification_courses_course_key_check check (
    course_key = pg_catalog.btrim(course_key)
    and course_key ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'
  ),
  constraint certification_courses_title_check check (
    title = pg_catalog.btrim(title)
    and pg_catalog.char_length(title) between 2 and 160
  ),
  constraint certification_courses_category_check check (
    category in (
      'instructor', 'referee', 'life_sports', 'disabled_sports',
      'private_instructor', 'private_referee', 'completion'
    )
  ),
  constraint certification_courses_provider_type_check check (
    provider_type in (
      'national_exam', 'association', 'lifelong', 'foundation',
      'private_academy', 'online'
    )
  ),
  constraint certification_courses_provider_name_check check (
    provider_name = pg_catalog.btrim(provider_name)
    and pg_catalog.char_length(provider_name) between 2 and 160
  ),
  constraint certification_courses_region_check check (
    region = pg_catalog.btrim(region)
    and pg_catalog.char_length(region) between 1 and 80
  ),
  constraint certification_courses_method_check check (
    course_method in ('offline', 'online', 'hybrid', 'theory_practice')
  ),
  constraint certification_courses_target_check check (
    target_text = pg_catalog.btrim(target_text)
    and pg_catalog.char_length(target_text) between 2 and 300
  ),
  constraint certification_courses_schedule_check check (
    schedule_text = pg_catalog.btrim(schedule_text)
    and pg_catalog.char_length(schedule_text) between 2 and 500
  ),
  constraint certification_courses_price_check check (
    price_text = pg_catalog.btrim(price_text)
    and pg_catalog.char_length(price_text) between 1 and 100
  ),
  constraint certification_courses_recruit_status_check check (
    recruit_status in ('recruiting', 'accepting', 'waiting', 'closed')
  ),
  constraint certification_courses_description_check check (
    description = pg_catalog.btrim(description)
    and pg_catalog.char_length(description) between 10 and 3000
  ),
  constraint certification_courses_official_url_check check (
    private.valid_certification_external_url(official_url)
  ),
  constraint certification_courses_application_url_check check (
    application_url is null
    or private.valid_certification_external_url(application_url)
  ),
  constraint certification_courses_publication_status_check check (
    publication_status in ('published', 'hidden', 'removed')
  ),
  constraint certification_courses_version_check check (version >= 1)
);

comment on table public.certification_courses is
  'Operator-authored qualification and referee education directory; PUL does not accept course payments or applications.';

create index certification_courses_public_filter_idx
  on public.certification_courses (
    category, provider_type, region, course_method, recruit_status,
    is_featured desc, created_at desc, course_key
  )
  where publication_status = 'published';

create trigger certification_courses_set_updated_at
before update on public.certification_courses
for each row execute function public.set_user_foundation_updated_at();

alter table public.certification_courses enable row level security;
alter table public.certification_courses force row level security;

create policy certification_courses_public_published_select
on public.certification_courses
for select
to anon, authenticated
using (publication_status = 'published');

revoke all on table public.certification_courses
  from public, anon, authenticated, service_role;

create table public.certification_exam_schedules (
  id uuid primary key default gen_random_uuid(),
  schedule_key text not null,
  exam_name text not null,
  exam_type text not null,
  organization_name text not null,
  application_period text not null,
  exam_date_text text not null,
  venue_announcement text not null,
  result_date_text text not null,
  required_items text not null,
  official_url text not null,
  schedule_status text not null,
  publication_status text not null default 'hidden',
  version integer not null default 1,
  created_by uuid not null references public.user_accounts (id),
  updated_by uuid not null references public.user_accounts (id),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint certification_exam_schedules_schedule_key_uidx unique (schedule_key),
  constraint certification_exam_schedules_schedule_key_check check (
    schedule_key = pg_catalog.btrim(schedule_key)
    and schedule_key ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'
  ),
  constraint certification_exam_schedules_exam_name_check check (
    exam_name = pg_catalog.btrim(exam_name)
    and pg_catalog.char_length(exam_name) between 2 and 180
  ),
  constraint certification_exam_schedules_exam_type_check check (
    exam_type in (
      'life_sports', 'disabled_sports', 'park_instructor',
      'park_referee', 'private_instructor', 'private_referee'
    )
  ),
  constraint certification_exam_schedules_organization_check check (
    organization_name = pg_catalog.btrim(organization_name)
    and pg_catalog.char_length(organization_name) between 2 and 160
  ),
  constraint certification_exam_schedules_application_period_check check (
    application_period = pg_catalog.btrim(application_period)
    and pg_catalog.char_length(application_period) between 2 and 300
  ),
  constraint certification_exam_schedules_exam_date_check check (
    exam_date_text = pg_catalog.btrim(exam_date_text)
    and pg_catalog.char_length(exam_date_text) between 2 and 300
  ),
  constraint certification_exam_schedules_venue_check check (
    venue_announcement = pg_catalog.btrim(venue_announcement)
    and pg_catalog.char_length(venue_announcement) between 2 and 500
  ),
  constraint certification_exam_schedules_result_date_check check (
    result_date_text = pg_catalog.btrim(result_date_text)
    and pg_catalog.char_length(result_date_text) between 2 and 300
  ),
  constraint certification_exam_schedules_required_items_check check (
    required_items = pg_catalog.btrim(required_items)
    and pg_catalog.char_length(required_items) between 1 and 1000
  ),
  constraint certification_exam_schedules_official_url_check check (
    private.valid_certification_external_url(official_url)
  ),
  constraint certification_exam_schedules_status_check check (
    schedule_status in (
      'application_planned', 'application_open', 'application_closed',
      'exam_planned', 'venue_planned', 'result_planned'
    )
  ),
  constraint certification_exam_schedules_publication_status_check check (
    publication_status in ('published', 'hidden', 'removed')
  ),
  constraint certification_exam_schedules_version_check check (version >= 1)
);

comment on table public.certification_exam_schedules is
  'Operator-authored public official exam schedule directory; dates remain verified display text and PUL does not accept applications.';

create index certification_exam_schedules_public_filter_idx
  on public.certification_exam_schedules (
    exam_type, schedule_status, created_at desc, schedule_key
  )
  where publication_status = 'published';

create trigger certification_exam_schedules_set_updated_at
before update on public.certification_exam_schedules
for each row execute function public.set_user_foundation_updated_at();

alter table public.certification_exam_schedules enable row level security;
alter table public.certification_exam_schedules force row level security;

create policy certification_exam_schedules_public_published_select
on public.certification_exam_schedules
for select
to anon, authenticated
using (publication_status = 'published');

revoke all on table public.certification_exam_schedules
  from public, anon, authenticated, service_role;

create table public.certification_jobs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null,
  title text not null,
  role_type text not null,
  region text not null,
  schedule_text text not null,
  role_description text not null,
  condition_text text not null,
  pay_text text not null,
  organizer_name text not null,
  organizer_type text not null,
  recruit_status text not null,
  official_url text,
  application_url text,
  publication_status text not null default 'hidden',
  version integer not null default 1,
  created_by uuid not null references public.user_accounts (id),
  updated_by uuid not null references public.user_accounts (id),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint certification_jobs_job_key_uidx unique (job_key),
  constraint certification_jobs_job_key_check check (
    job_key = pg_catalog.btrim(job_key)
    and job_key ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'
  ),
  constraint certification_jobs_title_check check (
    title = pg_catalog.btrim(title)
    and pg_catalog.char_length(title) between 2 and 180
  ),
  constraint certification_jobs_role_type_check check (
    role_type in ('referee', 'instructor', 'staff', 'scorer', 'assistant')
  ),
  constraint certification_jobs_region_check check (
    region = pg_catalog.btrim(region)
    and pg_catalog.char_length(region) between 1 and 80
  ),
  constraint certification_jobs_schedule_check check (
    schedule_text = pg_catalog.btrim(schedule_text)
    and pg_catalog.char_length(schedule_text) between 2 and 500
  ),
  constraint certification_jobs_role_description_check check (
    role_description = pg_catalog.btrim(role_description)
    and pg_catalog.char_length(role_description) between 2 and 1500
  ),
  constraint certification_jobs_condition_check check (
    condition_text = pg_catalog.btrim(condition_text)
    and pg_catalog.char_length(condition_text) between 2 and 1500
  ),
  constraint certification_jobs_pay_check check (
    pay_text = pg_catalog.btrim(pay_text)
    and pg_catalog.char_length(pay_text) between 1 and 300
  ),
  constraint certification_jobs_organizer_name_check check (
    organizer_name = pg_catalog.btrim(organizer_name)
    and pg_catalog.char_length(organizer_name) between 2 and 160
  ),
  constraint certification_jobs_organizer_type_check check (
    organizer_type = pg_catalog.btrim(organizer_type)
    and pg_catalog.char_length(organizer_type) between 2 and 100
  ),
  constraint certification_jobs_recruit_status_check check (
    recruit_status in ('planned', 'recruiting', 'accepting', 'waiting', 'closed')
  ),
  constraint certification_jobs_official_url_check check (
    official_url is null
    or private.valid_certification_external_url(official_url)
  ),
  constraint certification_jobs_application_url_check check (
    application_url is null
    or private.valid_certification_external_url(application_url)
  ),
  constraint certification_jobs_public_contact_check check (
    official_url is not null or application_url is not null
  ),
  constraint certification_jobs_publication_status_check check (
    publication_status in ('published', 'hidden', 'removed')
  ),
  constraint certification_jobs_version_check check (version >= 1)
);

comment on table public.certification_jobs is
  'Operator-authored public referee, instructor, and event-staff job directory; PUL does not broker employment or assignments.';

create index certification_jobs_public_filter_idx
  on public.certification_jobs (
    role_type, region, recruit_status, created_at desc, job_key
  )
  where publication_status = 'published';

create trigger certification_jobs_set_updated_at
before update on public.certification_jobs
for each row execute function public.set_user_foundation_updated_at();

alter table public.certification_jobs enable row level security;
alter table public.certification_jobs force row level security;

create policy certification_jobs_public_published_select
on public.certification_jobs
for select
to anon, authenticated
using (publication_status = 'published');

revoke all on table public.certification_jobs
  from public, anon, authenticated, service_role;

insert into public.platform_permission_definitions (code, description, is_active)
values (
  'certification.manage',
  '공식 자격·심판 교육과정, 시험 일정, 구인 정보를 등록·수정·공개·숨김·제거합니다.',
  true
);

insert into public.platform_role_permissions (platform_role, permission_code)
values ('platform_admin', 'certification.manage');

create function private.public_certification_course_json(
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

create function private.public_certification_exam_schedule_json(
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
    'exam_date_text', p_schedule.exam_date_text,
    'venue_announcement', p_schedule.venue_announcement,
    'result_date_text', p_schedule.result_date_text,
    'required_items', p_schedule.required_items,
    'official_url', p_schedule.official_url,
    'schedule_status', p_schedule.schedule_status
  );
$$;

revoke all on function private.public_certification_exam_schedule_json(public.certification_exam_schedules)
  from public, anon, authenticated, service_role;

create function private.public_certification_job_json(
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

create function public.list_public_certification_courses(
  p_keyword text default null,
  p_category text default null,
  p_provider_type text default null,
  p_region text default null,
  p_course_method text default null,
  p_recruit_status text default null,
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
  v_keyword text := nullif(pg_catalog.btrim(p_keyword), '');
  v_region text := nullif(pg_catalog.btrim(p_region), '');
  v_total integer;
  v_items jsonb;
begin
  if v_keyword is not null and pg_catalog.char_length(v_keyword) > 100 then
    raise exception '검색어는 100자 이하로 입력해 주세요.';
  end if;
  if p_category is not null and p_category not in (
    'instructor', 'referee', 'life_sports', 'disabled_sports',
    'private_instructor', 'private_referee', 'completion'
  ) then
    raise exception '과정 구분을 확인해 주세요.';
  end if;
  if p_provider_type is not null and p_provider_type not in (
    'national_exam', 'association', 'lifelong', 'foundation',
    'private_academy', 'online'
  ) then
    raise exception '교육기관 유형을 확인해 주세요.';
  end if;
  if v_region is not null and pg_catalog.char_length(v_region) > 80 then
    raise exception '지역을 확인해 주세요.';
  end if;
  if p_course_method is not null and p_course_method not in (
    'offline', 'online', 'hybrid', 'theory_practice'
  ) then
    raise exception '교육 방식을 확인해 주세요.';
  end if;
  if p_recruit_status is not null and p_recruit_status not in (
    'recruiting', 'accepting', 'waiting', 'closed'
  ) then
    raise exception '모집 상태를 확인해 주세요.';
  end if;
  if p_limit not between 1 and 50 or p_offset < 0 then
    raise exception '페이지 범위를 확인해 주세요.';
  end if;

  select pg_catalog.count(*)::integer
  into v_total
  from public.certification_courses as course
  where course.publication_status = 'published'
    and (p_category is null or course.category = p_category)
    and (p_provider_type is null or course.provider_type = p_provider_type)
    and (v_region is null or course.region = v_region)
    and (p_course_method is null or course.course_method = p_course_method)
    and (p_recruit_status is null or course.recruit_status = p_recruit_status)
    and (
      v_keyword is null
      or pg_catalog.strpos(
        pg_catalog.lower(pg_catalog.concat_ws(
          ' ', course.title, course.provider_name, course.region,
          course.target_text, course.description
        )),
        pg_catalog.lower(v_keyword)
      ) > 0
    );

  with page as (
    select course.id
    from public.certification_courses as course
    where course.publication_status = 'published'
      and (p_category is null or course.category = p_category)
      and (p_provider_type is null or course.provider_type = p_provider_type)
      and (v_region is null or course.region = v_region)
      and (p_course_method is null or course.course_method = p_course_method)
      and (p_recruit_status is null or course.recruit_status = p_recruit_status)
      and (
        v_keyword is null
        or pg_catalog.strpos(
          pg_catalog.lower(pg_catalog.concat_ws(
            ' ', course.title, course.provider_name, course.region,
            course.target_text, course.description
          )),
          pg_catalog.lower(v_keyword)
        ) > 0
      )
    order by course.is_featured desc, course.created_at desc, course.course_key
    limit p_limit
    offset p_offset
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      private.public_certification_course_json(course)
      order by course.is_featured desc, course.created_at desc, course.course_key
    ),
    '[]'::jsonb
  )
  into v_items
  from page
  join public.certification_courses as course on course.id = page.id;

  return pg_catalog.jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', p_offset + pg_catalog.jsonb_array_length(v_items) < v_total
  );
end;
$$;

revoke all on function public.list_public_certification_courses(
  text, text, text, text, text, text, integer, integer
)
  from public, anon, authenticated, service_role;
grant execute on function public.list_public_certification_courses(
  text, text, text, text, text, text, integer, integer
)
  to anon, authenticated;

create function public.get_public_certification_course(p_course_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_course public.certification_courses%rowtype;
  v_key text := nullif(pg_catalog.btrim(p_course_key), '');
begin
  if v_key is null or v_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' then
    raise exception '교육과정을 찾을 수 없습니다.';
  end if;
  select course.*
  into v_course
  from public.certification_courses as course
  where course.course_key = v_key
    and course.publication_status = 'published';
  if not found then
    raise exception '교육과정을 찾을 수 없습니다.';
  end if;
  return private.public_certification_course_json(v_course);
end;
$$;

revoke all on function public.get_public_certification_course(text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_certification_course(text)
  to anon, authenticated;

create function public.list_public_certification_exam_schedules(
  p_exam_type text default null,
  p_schedule_status text default null,
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
  v_total integer;
  v_items jsonb;
begin
  if p_exam_type is not null and p_exam_type not in (
    'life_sports', 'disabled_sports', 'park_instructor',
    'park_referee', 'private_instructor', 'private_referee'
  ) then
    raise exception '시험 유형을 확인해 주세요.';
  end if;
  if p_schedule_status is not null and p_schedule_status not in (
    'application_planned', 'application_open', 'application_closed',
    'exam_planned', 'venue_planned', 'result_planned'
  ) then
    raise exception '시험 일정 상태를 확인해 주세요.';
  end if;
  if p_limit not between 1 and 50 or p_offset < 0 then
    raise exception '페이지 범위를 확인해 주세요.';
  end if;

  select pg_catalog.count(*)::integer
  into v_total
  from public.certification_exam_schedules as schedule
  where schedule.publication_status = 'published'
    and (p_exam_type is null or schedule.exam_type = p_exam_type)
    and (p_schedule_status is null or schedule.schedule_status = p_schedule_status);

  with page as (
    select schedule.id
    from public.certification_exam_schedules as schedule
    where schedule.publication_status = 'published'
      and (p_exam_type is null or schedule.exam_type = p_exam_type)
      and (p_schedule_status is null or schedule.schedule_status = p_schedule_status)
    order by schedule.created_at desc, schedule.schedule_key
    limit p_limit
    offset p_offset
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      private.public_certification_exam_schedule_json(schedule)
      order by schedule.created_at desc, schedule.schedule_key
    ),
    '[]'::jsonb
  )
  into v_items
  from page
  join public.certification_exam_schedules as schedule on schedule.id = page.id;

  return pg_catalog.jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', p_offset + pg_catalog.jsonb_array_length(v_items) < v_total
  );
end;
$$;

revoke all on function public.list_public_certification_exam_schedules(
  text, text, integer, integer
)
  from public, anon, authenticated, service_role;
grant execute on function public.list_public_certification_exam_schedules(
  text, text, integer, integer
)
  to anon, authenticated;

create function public.list_public_certification_jobs(
  p_role_type text default null,
  p_region text default null,
  p_recruit_status text default null,
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
  v_region text := nullif(pg_catalog.btrim(p_region), '');
  v_total integer;
  v_items jsonb;
begin
  if p_role_type is not null and p_role_type not in (
    'referee', 'instructor', 'staff', 'scorer', 'assistant'
  ) then
    raise exception '모집 역할을 확인해 주세요.';
  end if;
  if v_region is not null and pg_catalog.char_length(v_region) > 80 then
    raise exception '지역을 확인해 주세요.';
  end if;
  if p_recruit_status is not null and p_recruit_status not in (
    'planned', 'recruiting', 'accepting', 'waiting', 'closed'
  ) then
    raise exception '모집 상태를 확인해 주세요.';
  end if;
  if p_limit not between 1 and 50 or p_offset < 0 then
    raise exception '페이지 범위를 확인해 주세요.';
  end if;

  select pg_catalog.count(*)::integer
  into v_total
  from public.certification_jobs as job
  where job.publication_status = 'published'
    and (p_role_type is null or job.role_type = p_role_type)
    and (v_region is null or job.region = v_region)
    and (p_recruit_status is null or job.recruit_status = p_recruit_status);

  with page as (
    select job.id
    from public.certification_jobs as job
    where job.publication_status = 'published'
      and (p_role_type is null or job.role_type = p_role_type)
      and (v_region is null or job.region = v_region)
      and (p_recruit_status is null or job.recruit_status = p_recruit_status)
    order by job.created_at desc, job.job_key
    limit p_limit
    offset p_offset
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      private.public_certification_job_json(job)
      order by job.created_at desc, job.job_key
    ),
    '[]'::jsonb
  )
  into v_items
  from page
  join public.certification_jobs as job on job.id = page.id;

  return pg_catalog.jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', p_offset + pg_catalog.jsonb_array_length(v_items) < v_total
  );
end;
$$;

revoke all on function public.list_public_certification_jobs(
  text, text, text, integer, integer
)
  from public, anon, authenticated, service_role;
grant execute on function public.list_public_certification_jobs(
  text, text, text, integer, integer
)
  to anon, authenticated;

create function public.get_public_certification_job(p_job_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_job public.certification_jobs%rowtype;
  v_key text := nullif(pg_catalog.btrim(p_job_key), '');
begin
  if v_key is null or v_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' then
    raise exception '모집 공고를 찾을 수 없습니다.';
  end if;
  select job.*
  into v_job
  from public.certification_jobs as job
  where job.job_key = v_key
    and job.publication_status = 'published';
  if not found then
    raise exception '모집 공고를 찾을 수 없습니다.';
  end if;
  return private.public_certification_job_json(v_job);
end;
$$;

revoke all on function public.get_public_certification_job(text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_certification_job(text)
  to anon, authenticated;

create function private.require_certification_directory_manager()
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
    and mapping.permission_code = 'certification.manage'
  for share of account;
  if not found then
    raise exception '자격증·심판 정보 운영 권한이 없습니다.';
  end if;
  return v_actor_id;
end;
$$;

revoke all on function private.require_certification_directory_manager()
  from public, anon, authenticated, service_role;

create function public.mutate_certification_course(
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
        'course_method', 'target_text', 'schedule_text', 'price_text',
        'recruit_status', 'description', 'official_url', 'application_url',
        'is_featured'
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
        course_method, target_text, schedule_text, price_text, recruit_status,
        description, official_url, application_url, is_featured,
        publication_status, created_by, updated_by
      ) values (
        v_key, pg_catalog.btrim(p_payload ->> 'title'), p_payload ->> 'category',
        p_payload ->> 'provider_type', pg_catalog.btrim(p_payload ->> 'provider_name'),
        pg_catalog.btrim(p_payload ->> 'region'), p_payload ->> 'course_method',
        pg_catalog.btrim(p_payload ->> 'target_text'),
        pg_catalog.btrim(p_payload ->> 'schedule_text'),
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
  'Active certification.manage platform operator-only course create, update, publish, hide, and remove mutation.';

revoke all on function public.mutate_certification_course(text, text, integer, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.mutate_certification_course(text, text, integer, jsonb)
  to authenticated;

create function public.mutate_certification_exam_schedule(
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
        'exam_date_text', 'venue_announcement', 'result_date_text',
        'required_items', 'official_url', 'schedule_status'
      )
    ) then
      raise exception '지원하지 않는 시험 일정 입력값이 포함되어 있습니다.';
    end if;

    if p_operation = 'create' then
      insert into public.certification_exam_schedules (
        schedule_key, exam_name, exam_type, organization_name,
        application_period, exam_date_text, venue_announcement,
        result_date_text, required_items, official_url, schedule_status,
        publication_status, created_by, updated_by
      ) values (
        v_key, pg_catalog.btrim(p_payload ->> 'exam_name'), p_payload ->> 'exam_type',
        pg_catalog.btrim(p_payload ->> 'organization_name'),
        pg_catalog.btrim(p_payload ->> 'application_period'),
        pg_catalog.btrim(p_payload ->> 'exam_date_text'),
        pg_catalog.btrim(p_payload ->> 'venue_announcement'),
        pg_catalog.btrim(p_payload ->> 'result_date_text'),
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
          exam_date_text = pg_catalog.btrim(p_payload ->> 'exam_date_text'),
          venue_announcement = pg_catalog.btrim(p_payload ->> 'venue_announcement'),
          result_date_text = pg_catalog.btrim(p_payload ->> 'result_date_text'),
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
  'Active certification.manage platform operator-only exam schedule create, update, publish, hide, and remove mutation.';

revoke all on function public.mutate_certification_exam_schedule(text, text, integer, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.mutate_certification_exam_schedule(text, text, integer, jsonb)
  to authenticated;

create function public.mutate_certification_job(
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
        'title', 'role_type', 'region', 'schedule_text', 'role_description',
        'condition_text', 'pay_text', 'organizer_name', 'organizer_type',
        'recruit_status', 'official_url', 'application_url'
      )
    ) then
      raise exception '지원하지 않는 구인 공고 입력값이 포함되어 있습니다.';
    end if;

    if p_operation = 'create' then
      insert into public.certification_jobs (
        job_key, title, role_type, region, schedule_text, role_description,
        condition_text, pay_text, organizer_name, organizer_type,
        recruit_status, official_url, application_url, publication_status,
        created_by, updated_by
      ) values (
        v_key, pg_catalog.btrim(p_payload ->> 'title'), p_payload ->> 'role_type',
        pg_catalog.btrim(p_payload ->> 'region'),
        pg_catalog.btrim(p_payload ->> 'schedule_text'),
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
  'Active certification.manage platform operator-only job create, update, publish, hide, and remove mutation.';

revoke all on function public.mutate_certification_job(text, text, integer, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.mutate_certification_job(text, text, integer, jsonb)
  to authenticated;
