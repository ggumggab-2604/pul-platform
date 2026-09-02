-- PUL course information report hardening.
-- Existing routes, statuses, and course mutation responsibilities remain unchanged.

alter table public.course_information_reports
  add column correction_target text,
  add column submit_request_id uuid;

update public.course_information_reports
set correction_target = 'other'
where report_type = 'correction'
  and correction_target is null;

update public.course_information_reports
set submit_request_id = pg_catalog.gen_random_uuid()
where submit_request_id is null;

alter table public.course_information_reports
  alter column submit_request_id set not null,
  add constraint course_information_reports_correction_target_check check (
    (
      report_type = 'new_course'
      and correction_target is null
    )
    or (
      report_type = 'correction'
      and correction_target in (
        'name',
        'location',
        'phone',
        'operating_hours',
        'fee',
        'reservation',
        'course_details',
        'facilities',
        'map_location',
        'description',
        'media',
        'other'
      )
    )
  ),
  add constraint course_information_reports_reporter_submit_request_key
    unique (reporter_user_id, submit_request_id);

create unique index course_information_reports_one_received_correction_target_idx
  on public.course_information_reports (
    reporter_user_id,
    target_course_id,
    correction_target
  )
  where report_type = 'correction'
    and report_status = 'received'
    and reporter_user_id is not null;

comment on column public.course_information_reports.correction_target is
  'Structured public course field selected for a correction report; NULL for new-course reports.';
comment on column public.course_information_reports.submit_request_id is
  'Client mutation identifier correlated with the private course request ledger and submit audit.';

alter table public.course_information_reports
  drop constraint course_information_reports_reporter_user_id_fkey,
  alter column reporter_user_id drop not null,
  add constraint course_information_reports_reporter_user_id_fkey
    foreign key (reporter_user_id)
    references public.user_accounts (id)
    on delete set null,
  drop constraint course_information_reports_resolved_by_fkey,
  add constraint course_information_reports_resolved_by_fkey
    foreign key (resolved_by)
    references public.user_accounts (id)
    on delete set null,
  drop constraint course_information_reports_resolution_state_check,
  add constraint course_information_reports_resolution_state_check check (
    (
      report_status = 'received'
      and resolved_at is null
      and resolved_by is null
      and resolution_note is null
    )
    or (
      report_status in ('handled', 'dismissed')
      and resolved_at is not null
    )
  );

drop function public.submit_course_information_report(
  text,
  text,
  text,
  text,
  text,
  text,
  text
);

create function public.submit_course_information_report(
  p_request_id uuid,
  p_report_type text,
  p_course_key text default null,
  p_correction_target text default null,
  p_course_name text default null,
  p_region text default null,
  p_location_description text default null,
  p_operation_details text default null,
  p_report_body text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_account_status text;
  v_actor_role text;
  v_course public.courses%rowtype;
  v_target_course_id uuid;
  v_course_key text := nullif(pg_catalog.btrim(p_course_key), '');
  v_target text := nullif(pg_catalog.btrim(p_correction_target), '');
  v_course_name text := nullif(pg_catalog.btrim(p_course_name), '');
  v_region text := nullif(pg_catalog.btrim(p_region), '');
  v_location text := nullif(pg_catalog.btrim(p_location_description), '');
  v_operation text := nullif(pg_catalog.btrim(p_operation_details), '');
  v_body text := nullif(pg_catalog.btrim(p_report_body), '');
  v_payload jsonb;
  v_replay jsonb;
  v_report public.course_information_reports%rowtype;
  v_result jsonb;
begin
  if v_actor_id is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception '제보 요청 식별자가 필요합니다.' using errcode = '22023';
  end if;
  if p_report_type is null or p_report_type not in ('new_course', 'correction') then
    raise exception '제보 종류를 확인해 주세요.' using errcode = '22023';
  end if;

  if p_report_type = 'correction' then
    if v_course_key is null then
      raise exception '수정할 골프장을 확인해 주세요.' using errcode = '22023';
    end if;
    if v_target is null or v_target not in (
      'name',
      'location',
      'phone',
      'operating_hours',
      'fee',
      'reservation',
      'course_details',
      'facilities',
      'map_location',
      'description',
      'media',
      'other'
    ) then
      raise exception '수정 대상을 확인해 주세요.' using errcode = '22023';
    end if;
  else
    if v_course_key is not null then
      raise exception '신규 골프장 제보에는 기존 골프장을 지정할 수 없습니다.'
        using errcode = '22023';
    end if;
    if v_target is not null then
      raise exception '신규 골프장 제보에는 수정 대상을 지정할 수 없습니다.'
        using errcode = '22023';
    end if;
    if v_course_name is null
       or pg_catalog.char_length(v_course_name) not between 2 and 120 then
      raise exception '골프장명은 2~120자로 입력해 주세요.' using errcode = '22023';
    end if;
    if v_region is null
       or v_region not in ('서울', '경기', '인천', '충청', '강원', '전라', '경상', '제주') then
      raise exception '지역을 확인해 주세요.' using errcode = '22023';
    end if;
    if v_location is null
       or pg_catalog.char_length(v_location) not between 2 and 500 then
      raise exception '주소 또는 위치 설명을 2~500자로 입력해 주세요.'
        using errcode = '22023';
    end if;
  end if;

  if v_operation is not null
     and pg_catalog.char_length(v_operation) not between 2 and 1000 then
    raise exception '알고 있는 운영 정보는 2~1000자로 입력해 주세요.'
      using errcode = '22023';
  end if;
  if v_body is null or pg_catalog.char_length(v_body) not between 10 and 3000 then
    raise exception '제보 내용은 10~3000자로 입력해 주세요.' using errcode = '22023';
  end if;

  select account.account_status, account.platform_role
  into v_account_status, v_actor_role
  from public.user_accounts as account
  where account.id = v_actor_id
  for share;

  if not found or v_account_status <> 'active' then
    raise exception '정상 활동 계정만 골프장 정보를 제보할 수 있습니다.'
      using errcode = '42501';
  end if;

  v_payload := pg_catalog.jsonb_build_object(
    'action', 'course.information_report.submit',
    'report_type', p_report_type,
    'course_key', case when p_report_type = 'correction' then v_course_key else null end,
    'correction_target', v_target,
    'course_name', case when p_report_type = 'new_course' then v_course_name else null end,
    'region', case when p_report_type = 'new_course' then v_region else null end,
    'location_description', case when p_report_type = 'new_course' then v_location else null end,
    'operation_details', v_operation,
    'report_body', v_body
  );

  v_replay := private.course_claim_request(
    v_actor_id,
    p_request_id,
    'course.information_report.submit',
    v_payload
  );
  if v_replay is not null then
    return v_replay || pg_catalog.jsonb_build_object('replayed', true);
  end if;

  if p_report_type = 'correction' then
    select course.*
    into v_course
    from public.courses as course
    where course.course_key = v_course_key
      and course.course_status = 'active'
    for share;

    if not found then
      raise exception '수정할 골프장을 찾을 수 없습니다.' using errcode = 'P0002';
    end if;

    v_course_name := v_course.name;
    v_region := v_course.region;
    v_location := v_course.address;
    v_target_course_id := v_course.id;

    if exists (
      select 1
      from public.course_information_reports as existing
      where existing.reporter_user_id = v_actor_id
        and existing.target_course_id = v_course.id
        and existing.correction_target = v_target
        and existing.report_type = 'correction'
        and existing.report_status = 'received'
    ) then
      raise exception '같은 수정 대상에 확인 대기 중인 제보가 있습니다.'
        using errcode = '40901';
    end if;
  end if;

  insert into public.course_information_reports (
    reporter_user_id,
    submit_request_id,
    report_type,
    correction_target,
    target_course_id,
    course_name,
    region,
    location_description,
    operation_details,
    report_body
  ) values (
    v_actor_id,
    p_request_id,
    p_report_type,
    v_target,
    v_target_course_id,
    v_course_name,
    v_region,
    v_location,
    v_operation,
    v_body
  )
  returning * into v_report;

  insert into public.audit_logs (
    actor_id,
    actor_type,
    actor_role,
    action,
    target_type,
    target_id,
    before_summary,
    after_summary,
    reason,
    metadata,
    request_id,
    outcome
  ) values (
    v_actor_id,
    'user',
    v_actor_role,
    'course.information_report.submit',
    'course_information_report',
    v_report.id::text,
    null,
    pg_catalog.jsonb_build_object(
      'report_status', v_report.report_status,
      'report_type', v_report.report_type,
      'correction_target', v_report.correction_target
    ),
    '골프장 정보 제보 접수',
    pg_catalog.jsonb_build_object(
      'course_key', case when p_report_type = 'correction' then v_course_key else null end
    ),
    p_request_id,
    'success'
  );

  v_result := pg_catalog.jsonb_build_object(
    'report_id', v_report.id,
    'status', v_report.report_status,
    'request_id', p_request_id,
    'replayed', false
  );

  perform private.course_complete_request(v_actor_id, p_request_id, v_result);
  return v_result;
exception
  when unique_violation then
    raise exception '같은 수정 대상에 확인 대기 중인 제보가 있습니다.'
      using errcode = '40901';
end;
$$;

revoke all on function public.submit_course_information_report(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) from public, anon, authenticated, service_role;
grant execute on function public.submit_course_information_report(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) to authenticated;

comment on function public.submit_course_information_report(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) is
  'Active authenticated new-course or correction report intake with canonical replay protection, per-reporter received-target deduplication, one audit, and no course mutation.';

create or replace function private.management_course_report_summary_json(
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
    'correction_target', p_report.correction_target,
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

revoke all on function private.management_course_report_summary_json(
  public.course_information_reports
) from public, anon, authenticated, service_role;

create or replace function public.get_course_information_report_for_management(
  p_report_id uuid
)
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
  if not private.course_actor_has_permission(
    v_actor_id,
    'courses.information_reports.read'
  ) then
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
    'correction_target', v_report.correction_target,
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

comment on function public.get_course_information_report_for_management(uuid) is
  'Returns one privacy-minimized report with its correction target and optional current course snapshot.';
