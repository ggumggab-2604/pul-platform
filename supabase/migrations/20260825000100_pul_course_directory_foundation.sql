create table public.courses (
  id uuid primary key default gen_random_uuid(),
  course_key text not null,
  name text not null,
  course_type text not null,
  region text not null,
  city text not null,
  address text not null,
  holes smallint not null,
  operating_hours text,
  operation_code text not null,
  phone text,
  parking_available boolean,
  feature_codes text[] not null default '{}'::text[],
  description text not null,
  reservation_url text,
  reservation_guide text,
  fee_guide text,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  course_status text not null default 'inactive',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint courses_course_key_uidx unique (course_key),
  constraint courses_course_key_check check (
    course_key = pg_catalog.btrim(course_key)
    and course_key ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'
  ),
  constraint courses_name_check check (
    name = pg_catalog.btrim(name)
    and pg_catalog.char_length(name) between 2 and 120
  ),
  constraint courses_type_check check (course_type in ('field', 'screen')),
  constraint courses_region_check check (
    region in ('서울', '경기', '인천', '충청', '강원', '전라', '경상', '제주')
  ),
  constraint courses_city_check check (
    city = pg_catalog.btrim(city)
    and pg_catalog.char_length(city) between 1 and 100
  ),
  constraint courses_address_check check (
    address = pg_catalog.btrim(address)
    and pg_catalog.char_length(address) between 2 and 300
  ),
  constraint courses_holes_check check (holes between 1 and 72),
  constraint courses_operating_hours_check check (
    operating_hours is null
    or (
      operating_hours = pg_catalog.btrim(operating_hours)
      and pg_catalog.char_length(operating_hours) between 1 and 200
    )
  ),
  constraint courses_operation_check check (
    operation_code in ('reservation', 'phone', 'walkIn')
  ),
  constraint courses_phone_check check (
    phone is null
    or (
      phone = pg_catalog.btrim(phone)
      and pg_catalog.char_length(phone) between 7 and 30
    )
  ),
  constraint courses_feature_codes_check check (
    feature_codes <@ array[
      'club_available',
      'event_history',
      'lesson_available',
      'equipment_rental'
    ]::text[]
    and pg_catalog.cardinality(feature_codes) <= 4
  ),
  constraint courses_description_check check (
    description = pg_catalog.btrim(description)
    and pg_catalog.char_length(description) between 10 and 2000
  ),
  constraint courses_reservation_url_check check (
    reservation_url is null
    or (
      reservation_url = pg_catalog.btrim(reservation_url)
      and pg_catalog.char_length(reservation_url) between 12 and 500
      and reservation_url ~ '^https://'
    )
  ),
  constraint courses_reservation_guide_check check (
    reservation_guide is null
    or (
      reservation_guide = pg_catalog.btrim(reservation_guide)
      and pg_catalog.char_length(reservation_guide) between 2 and 1000
    )
  ),
  constraint courses_fee_guide_check check (
    fee_guide is null
    or (
      fee_guide = pg_catalog.btrim(fee_guide)
      and pg_catalog.char_length(fee_guide) between 1 and 500
    )
  ),
  constraint courses_coordinates_check check (
    (latitude is null and longitude is null)
    or (
      latitude between -90 and 90
      and longitude between -180 and 180
    )
  ),
  constraint courses_status_check check (
    course_status in ('active', 'inactive', 'removed')
  )
);

create table public.course_information_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references public.user_accounts (id),
  report_type text not null,
  target_course_id uuid references public.courses (id),
  course_name text not null,
  region text not null,
  location_description text not null,
  operation_details text,
  report_body text not null,
  report_status text not null default 'received',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint course_information_reports_type_check check (
    report_type in ('new_course', 'correction')
  ),
  constraint course_information_reports_target_check check (
    (report_type = 'new_course' and target_course_id is null)
    or (report_type = 'correction' and target_course_id is not null)
  ),
  constraint course_information_reports_name_check check (
    course_name = pg_catalog.btrim(course_name)
    and pg_catalog.char_length(course_name) between 2 and 120
  ),
  constraint course_information_reports_region_check check (
    region in ('서울', '경기', '인천', '충청', '강원', '전라', '경상', '제주')
  ),
  constraint course_information_reports_location_check check (
    location_description = pg_catalog.btrim(location_description)
    and pg_catalog.char_length(location_description) between 2 and 500
  ),
  constraint course_information_reports_operation_check check (
    operation_details is null
    or (
      operation_details = pg_catalog.btrim(operation_details)
      and pg_catalog.char_length(operation_details) between 2 and 1000
    )
  ),
  constraint course_information_reports_body_check check (
    report_body = pg_catalog.btrim(report_body)
    and pg_catalog.char_length(report_body) between 10 and 3000
  ),
  constraint course_information_reports_status_check check (
    report_status in ('received', 'handled', 'dismissed')
  )
);

create index courses_public_directory_idx
  on public.courses (course_type, region, name, course_key)
  where course_status = 'active';

create index courses_public_operation_idx
  on public.courses (operation_code, holes, course_key)
  where course_status = 'active';

create index course_information_reports_status_created_idx
  on public.course_information_reports (report_status, created_at, id);

create index course_information_reports_reporter_created_idx
  on public.course_information_reports (reporter_user_id, created_at desc, id desc);

create trigger courses_set_updated_at
before update on public.courses
for each row execute function public.set_user_foundation_updated_at();

create trigger course_information_reports_set_updated_at
before update on public.course_information_reports
for each row execute function public.set_user_foundation_updated_at();

alter table public.courses enable row level security;
alter table public.courses force row level security;
alter table public.course_information_reports enable row level security;
alter table public.course_information_reports force row level security;

create policy courses_public_active_select
on public.courses
for select
to anon, authenticated
using (course_status = 'active');

revoke all on table public.courses
  from public, anon, authenticated, service_role;
revoke all on table public.course_information_reports
  from public, anon, authenticated, service_role;

create function private.public_course_json(p_course public.courses)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
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
    'longitude', p_course.longitude
  );
$$;

revoke all on function private.public_course_json(public.courses)
  from public, anon, authenticated, service_role;

create function public.list_public_courses(
  p_keyword text default null,
  p_course_type text default null,
  p_region text default null,
  p_operation_code text default null,
  p_holes text default null,
  p_feature_codes text[] default null,
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
  v_total integer;
  v_items jsonb;
begin
  if v_keyword is not null and pg_catalog.char_length(v_keyword) > 100 then
    raise exception '검색어는 100자 이내로 입력해 주세요.';
  end if;
  if p_course_type is not null and p_course_type not in ('field', 'screen') then
    raise exception '골프장 유형을 확인해 주세요.';
  end if;
  if p_region is not null
     and p_region not in ('서울', '경기', '인천', '충청', '강원', '전라', '경상', '제주') then
    raise exception '지역을 확인해 주세요.';
  end if;
  if p_operation_code is not null
     and p_operation_code not in ('reservation', 'phone', 'walkIn') then
    raise exception '운영 방식을 확인해 주세요.';
  end if;
  if p_holes is not null and p_holes not in ('9', '18', '27_plus') then
    raise exception '홀 수 조건을 확인해 주세요.';
  end if;
  if p_feature_codes is not null
     and not p_feature_codes <@ array[
       'club_available',
       'event_history',
       'lesson_available',
       'equipment_rental',
       'parking'
     ]::text[] then
    raise exception '부가 정보 조건을 확인해 주세요.';
  end if;
  if p_limit not between 1 and 50 or p_offset < 0 then
    raise exception '페이지 범위를 확인해 주세요.';
  end if;

  with matching as (
    select course.*
    from public.courses as course
    where course.course_status = 'active'
      and (p_course_type is null or course.course_type = p_course_type)
      and (p_region is null or course.region = p_region)
      and (p_operation_code is null or course.operation_code = p_operation_code)
      and (
        p_holes is null
        or (p_holes = '9' and course.holes = 9)
        or (p_holes = '18' and course.holes = 18)
        or (p_holes = '27_plus' and course.holes >= 27)
      )
      and (
        p_feature_codes is null
        or (
          (not ('parking' = any(p_feature_codes)) or course.parking_available is true)
          and (
            array_remove(p_feature_codes, 'parking') = '{}'::text[]
            or course.feature_codes @> array_remove(p_feature_codes, 'parking')
          )
        )
      )
      and (
        v_keyword is null
        or pg_catalog.strpos(
          pg_catalog.lower(
            course.name || ' ' || course.region || ' ' || course.city || ' ' || course.address
          ),
          pg_catalog.lower(v_keyword)
        ) > 0
      )
  ), page as (
    select matching.*
    from matching
    order by matching.name, matching.course_key
    limit p_limit
    offset p_offset
  )
  select
    (select count(*)::integer from matching),
    coalesce(
      (
        select jsonb_agg(
          private.public_course_json(page)
          order by page.name, page.course_key
        )
        from page
      ),
      '[]'::jsonb
    )
  into v_total, v_items;

  return jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', p_offset + p_limit < v_total
  );
end;
$$;

revoke all on function public.list_public_courses(text, text, text, text, text, text[], integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_public_courses(text, text, text, text, text, text[], integer, integer)
  to anon, authenticated;

create function public.get_public_course(p_course_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_key text := nullif(pg_catalog.btrim(p_course_key), '');
  v_course public.courses%rowtype;
begin
  if v_key is null or pg_catalog.char_length(v_key) > 64 then
    raise exception '골프장 정보를 찾을 수 없습니다.';
  end if;

  select course.*
  into v_course
  from public.courses as course
  where course.course_key = v_key
    and course.course_status = 'active';

  if not found then
    raise exception '골프장 정보를 찾을 수 없습니다.';
  end if;

  return private.public_course_json(v_course);
end;
$$;

revoke all on function public.get_public_course(text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_course(text)
  to anon, authenticated;

create function public.submit_course_information_report(
  p_report_type text,
  p_course_key text default null,
  p_course_name text default null,
  p_region text default null,
  p_location_description text default null,
  p_operation_details text default null,
  p_report_body text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_account_status text;
  v_course public.courses%rowtype;
  v_course_name text := nullif(pg_catalog.btrim(p_course_name), '');
  v_region text := nullif(pg_catalog.btrim(p_region), '');
  v_location text := nullif(pg_catalog.btrim(p_location_description), '');
  v_operation text := nullif(pg_catalog.btrim(p_operation_details), '');
  v_body text := nullif(pg_catalog.btrim(p_report_body), '');
  v_report public.course_information_reports%rowtype;
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
    raise exception '정상 활동 계정만 골프장 정보를 제보할 수 있습니다.';
  end if;

  if p_report_type not in ('new_course', 'correction') then
    raise exception '제보 종류를 확인해 주세요.';
  end if;

  if p_report_type = 'correction' then
    if nullif(pg_catalog.btrim(p_course_key), '') is null then
      raise exception '수정할 골프장을 확인해 주세요.';
    end if;

    select course.*
    into v_course
    from public.courses as course
    where course.course_key = pg_catalog.btrim(p_course_key)
      and course.course_status = 'active'
    for share;

    if not found then
      raise exception '수정할 골프장을 찾을 수 없습니다.';
    end if;

    v_course_name := v_course.name;
    v_region := v_course.region;
    v_location := v_course.address;
  elsif nullif(pg_catalog.btrim(p_course_key), '') is not null then
    raise exception '신규 골프장 제보에는 기존 골프장을 지정할 수 없습니다.';
  end if;

  if v_course_name is null or pg_catalog.char_length(v_course_name) not between 2 and 120 then
    raise exception '골프장명은 2~120자로 입력해 주세요.';
  end if;
  if v_region is null
     or v_region not in ('서울', '경기', '인천', '충청', '강원', '전라', '경상', '제주') then
    raise exception '지역을 확인해 주세요.';
  end if;
  if v_location is null or pg_catalog.char_length(v_location) not between 2 and 500 then
    raise exception '주소 또는 위치 설명을 2~500자로 입력해 주세요.';
  end if;
  if v_operation is not null and pg_catalog.char_length(v_operation) not between 2 and 1000 then
    raise exception '알고 있는 운영 정보는 2~1000자로 입력해 주세요.';
  end if;
  if v_body is null or pg_catalog.char_length(v_body) not between 10 and 3000 then
    raise exception '제보 내용은 10~3000자로 입력해 주세요.';
  end if;

  insert into public.course_information_reports (
    reporter_user_id,
    report_type,
    target_course_id,
    course_name,
    region,
    location_description,
    operation_details,
    report_body
  ) values (
    v_actor_id,
    p_report_type,
    v_course.id,
    v_course_name,
    v_region,
    v_location,
    v_operation,
    v_body
  )
  returning * into v_report;

  return jsonb_build_object(
    'report_id', v_report.id,
    'status', v_report.report_status
  );
end;
$$;

revoke all on function public.submit_course_information_report(text, text, text, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_course_information_report(text, text, text, text, text, text, text)
  to authenticated;

comment on table public.courses is
  'PUL 공개 골프장 directory의 안정적인 course key와 최소 운영 정보.';
comment on table public.course_information_reports is
  'active 회원의 신규 골프장·기존 골프장 정보수정 비공개 제보 접수함.';
comment on function public.list_public_courses(text, text, text, text, text, text[], integer, integer) is
  'active 골프장을 검색·필터·pagination하여 내부 UUID 없이 공개한다.';
comment on function public.get_public_course(text) is
  '안정적인 course key로 active 골프장 공개 상세를 반환한다.';
comment on function public.submit_course_information_report(text, text, text, text, text, text, text) is
  'active authenticated 회원의 신규 골프장 또는 정보수정 제보를 비공개 접수한다.';
