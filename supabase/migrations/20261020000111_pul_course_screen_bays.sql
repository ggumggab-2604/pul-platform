-- Follow-up to 20261020000110; apply after the verified beta migration lineage.
-- No backfill: historical screen holes and course identities remain intact.
begin;
alter table public.courses add column bay_count integer;
alter table public.courses alter column holes drop not null;
alter table public.courses alter column operation_code drop not null;
alter table public.courses drop constraint courses_holes_check;
alter table public.courses add constraint courses_holes_check check
  ((course_type = 'screen' or holes is not null) and (holes is null or holes between 1 and 32767));
alter table public.courses add constraint courses_bay_count_check check (bay_count is null or bay_count > 0);
alter table public.courses drop constraint courses_description_check;
alter table public.courses add constraint courses_description_check check
  (description = pg_catalog.btrim(description) and pg_catalog.char_length(description) between 0 and 2000);
comment on column public.courses.bay_count is '실제 이용 가능한 전체 타석 수. 룸·가상 코스·과거 홀 수에서 자동 변환하지 않음.';

-- Legacy null bays may remain only on an existing screen. A new screen requires bays.
create function private.check_course_screen_bays() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.course_type = 'screen' and new.bay_count is null then
    if tg_op = 'INSERT' then
      raise exception '실제 이용 가능한 전체 타석 수를 입력해 주세요.' using errcode = '23514';
    elsif old.course_type <> 'screen' or old.bay_count is not null then
      raise exception '실제 이용 가능한 전체 타석 수를 입력해 주세요.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.check_course_screen_bays() from public, anon, authenticated, service_role;
create trigger courses_screen_bays_check before insert or update on public.courses
for each row execute function private.check_course_screen_bays();

create or replace function private.public_course_json(p_course public.courses)
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
    'bay_count', p_course.bay_count,
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

create or replace function private.management_course_json(p_course public.courses)
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
    'bay_count', p_course.bay_count,
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

create or replace function public.mutate_managed_course(
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
        'name', 'course_type', 'region', 'city', 'address', 'holes', 'bay_count',
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
    if v_payload_key_count <> (case when p_payload ? 'bay_count' then 18 else 17 end) then
      raise exception '필수 골프장 입력값을 모두 확인해 주세요.' using errcode = '22023';
    end if;
    if pg_catalog.jsonb_typeof(p_payload -> 'holes') not in ('number', 'null')
       or (p_payload ? 'bay_count' and pg_catalog.jsonb_typeof(p_payload -> 'bay_count') not in ('number', 'null'))
       or pg_catalog.jsonb_typeof(p_payload -> 'feature_codes') <> 'array'
       or pg_catalog.jsonb_typeof(p_payload -> 'parking_available') not in ('boolean', 'null')
       or pg_catalog.jsonb_typeof(p_payload -> 'latitude') not in ('number', 'null')
       or pg_catalog.jsonb_typeof(p_payload -> 'longitude') not in ('number', 'null') then
      raise exception '골프장 숫자·선택 입력값을 확인해 주세요.' using errcode = '22023';
    end if;
    if (p_payload -> 'latitude' = 'null'::jsonb) <> (p_payload -> 'longitude' = 'null'::jsonb) then
      raise exception '위도와 경도는 함께 입력해 주세요.' using errcode = '22023';
    end if;

    if p_payload ->> 'course_type' = 'field' and (
      p_payload ->> 'holes' is null or (p_payload ->> 'holes')::numeric not between 1 and 32767
      or (p_payload ->> 'holes')::numeric <> pg_catalog.trunc((p_payload ->> 'holes')::numeric)) then
      raise exception '야외 홀 수는 1~32767의 정수로 입력해 주세요.' using errcode = '22023';
    end if;
    if p_payload ->> 'bay_count' is not null and (
      (p_payload ->> 'bay_count')::numeric not between 1 and 2147483647
      or (p_payload ->> 'bay_count')::numeric <> pg_catalog.trunc((p_payload ->> 'bay_count')::numeric)) then
      raise exception '타석 수는 양의 정수로 입력해 주세요.' using errcode = '22023';
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
        bay_count,
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
        case when p_payload ->> 'course_type' = 'field' then (p_payload ->> 'holes')::smallint else null end,
        (p_payload ->> 'bay_count')::integer,
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
          holes = case when p_payload ->> 'course_type' = 'field' then (p_payload ->> 'holes')::smallint else course.holes end,
          bay_count = case when p_payload ? 'bay_count' then (p_payload ->> 'bay_count')::integer else course.bay_count end,
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

commit;
