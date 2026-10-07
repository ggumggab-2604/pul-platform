-- After 00113. Schema only; verified local data is applied explicitly and separately.
begin;
alter table public.courses add column destination_kind text
  check (destination_kind in ('facility','building','entrance','parking'));
alter table public.courses add constraint courses_destination_coordinates_check
  check (destination_kind is null or (latitude is not null and longitude is not null));
comment on column public.courses.destination_kind is '검증된 좌표의 의미. 출입구/주차장 확인 전에는 주행 내비게이션에 직접 전달하지 않음. 출처는 명시적 적용 기록에 보존.';
create function private.invalidate_course_destination() returns trigger
language plpgsql set search_path = '' as $$
begin
  if row(old.course_key, old.name, old.address, old.course_type, old.latitude, old.longitude)
     is distinct from row(new.course_key, new.name, new.address, new.course_type, new.latitude, new.longitude) then
    new.destination_kind := null;
  end if;
  return new;
end;
$$;
revoke all on function private.invalidate_course_destination() from public, anon, authenticated, service_role;
create trigger courses_destination_invalidation before update on public.courses
for each row execute function private.invalidate_course_destination();
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
    'longitude', p_course.longitude,
    'destination_kind', p_course.destination_kind
  );
$$;


commit;
