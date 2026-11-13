-- Local regression: this transaction leaves no fixture rows.
begin;
set local plpgsql.check_asserts = on;

create function pg_temp.university_actor(id uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(id::text, ''), true)
$$;
create function pg_temp.university_denied(query text, expected text default '42501') returns void language plpgsql as $$
begin
  execute query;
  raise exception 'expected permission denied: %', query;
exception when others then
  if sqlstate <> expected then raise; end if;
end
$$;

do $$
declare
  operator_id uuid := gen_random_uuid();
  member_id uuid := gen_random_uuid();
  staff_id uuid := gen_random_uuid();
  other_id uuid := gen_random_uuid();
  fixture_club uuid := gen_random_uuid();
  who uuid;
  request_id uuid := gen_random_uuid();
  consultation_id uuid;
  old_id uuid;
  old_version integer;
  candidate jsonb;
begin
  foreach who in array array[operator_id, member_id, staff_id, other_id] loop
    insert into auth.users(id,instance_id,aud,role,email)
    values(who,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',who||'@university-local.test');
  end loop;
  update public.user_accounts set platform_role='platform_admin' where id=operator_id;
  insert into public.clubs(id,legacy_key,name,club_status,directory_is_public)
    values(fixture_club,'uni-test-club','격리 동호회','active',true);
  -- Prepare the club administrator through the existing service-role workflow.
  set local role service_role;
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform public.appoint_initial_club_admin(fixture_club,member_id,operator_id,gen_random_uuid(),'격리 대학 회귀용 동호회 담당자');
  perform set_config('request.jwt.claims','{}',true);
  reset role;
  insert into public.lesson_university_departments(department_key,university_name,department_name,summary,region,official_url,admissions_url,publication_status,created_by,updated_by)
    values('uni-test-a','가상 대학','가상 학과','격리 데이터에서만 쓰는 테스트 학과입니다.','충청','https://example.test/official','https://example.test/apply','published',operator_id,operator_id),
          ('uni-test-b','가상 대학 B','가상 학과 B','격리 데이터에서만 쓰는 테스트 학과입니다.','충청',null,null,'hidden',operator_id,operator_id);
  select id,version into old_id,old_version from public.lesson_university_departments where department_key='uni-test-a';

  set local role anon;
  assert public.get_university_department_detail('uni-test-a')->>'admissions_url' = 'https://example.test/apply';
  assert public.get_university_department_detail('uni-test-b') is null;
  perform pg_temp.university_denied(format('select public.submit_university_consultation(%L,%L,%L)','uni-test-a',request_id,'비로그인 신청'));
  set local role authenticated;
  perform pg_temp.university_actor(operator_id);
  perform public.set_university_department_manager('uni-test-a',staff_id,true);
  perform public.set_university_department_manager('uni-test-b',other_id,true);
  assert (select count(*) from public.list_university_department_managers('uni-test-a')) = 1;

  perform pg_temp.university_actor(member_id);
  consultation_id := public.submit_university_consultation('uni-test-a',request_id,'원래 상담 요청');
  assert public.submit_university_consultation('uni-test-a',request_id,'재시도 본문') = consultation_id;
  assert public.get_university_department_detail('uni-test-a')->>'student_status' is null;
  perform pg_temp.university_denied('select public.get_university_workspace(''uni-test-a'',''consultations'')');
  perform pg_temp.university_denied('select * from public.lesson_university_consultations');
  perform pg_temp.university_denied(format('select public.set_university_department_manager(%L,%L,true)','uni-test-a',member_id), 'P0001');
  perform public.request_university_student('uni-test-a');
  perform public.request_university_student('uni-test-a');
  assert public.get_university_department_detail('uni-test-a')->>'student_status' = 'pending';

  perform pg_temp.university_actor(other_id);
  assert public.get_university_workspace('uni-test-b','profile')->>'publication_status' = 'hidden';
  perform pg_temp.university_denied('select public.get_university_workspace(''uni-test-a'',''students'')');
  perform pg_temp.university_denied(format('select public.update_university_contact(%L,%L,%L,null)','uni-test-a',consultation_id,'contacted'));
  perform pg_temp.university_denied(format('select public.approve_university_student(%L,%L)','uni-test-a',member_id));
  perform pg_temp.university_denied(format('select public.save_university_profile(%L,%L,1,''{}'')','uni-test-a',staff_id));

  perform pg_temp.university_actor(staff_id);
  assert jsonb_array_length(public.get_university_workspace('uni-test-a','students')->'items') = 1;
  assert public.get_university_workspace('uni-test-a','consultations')->'items'->0->>'body' = '원래 상담 요청';
  perform public.update_university_contact('uni-test-a',consultation_id,'contacted','처리 메모');
  perform public.approve_university_student('uni-test-a',member_id);
  perform public.approve_university_student('uni-test-a',member_id);
  assert jsonb_array_length(public.get_university_workspace('uni-test-a','consultations')->'items') = 1;
  assert public.get_university_workspace('uni-test-a','consultations')->'items'->0->>'contact_status' = 'contacted';
  assert not exists (select 1 from public.list_my_university_departments() where student_status is not null);

  perform pg_temp.university_actor(member_id);
  assert public.get_university_department_detail('uni-test-a')->>'student_status' = 'approved';
  assert exists (select 1 from public.list_my_university_departments() where student_status='approved' and not can_manage);

  set local role service_role;
  candidate := jsonb_build_object('summary','로컬에서 저장한 학과 소개 본문입니다.','guide_url','https://example.test/guide.pdf','admissions_url','https://example.test/new');
  perform pg_temp.university_denied(format('select public.save_university_profile(%L,%L,%s,%L)','uni-test-a',other_id,old_version,candidate));
  begin
    perform public.save_university_profile('uni-test-a',staff_id,old_version,candidate || '{"official_url":"http://example.test"}');
    raise exception 'invalid URL was accepted';
  exception when invalid_parameter_value then null;
  end;
  perform public.save_university_profile('uni-test-a',staff_id,old_version,candidate);
  perform pg_temp.university_denied(format('select public.save_university_profile(%L,%L,%s,%L)',
    'uni-test-a',staff_id,old_version,candidate || '{"guide_url":"https://example.test/stale.pdf"}'), 'PT409');
  reset role;
  assert (select id=old_id and version=old_version+1 and publication_status='published' and official_url is null
    and guide_url='https://example.test/guide.pdf' from public.lesson_university_departments where department_key='uni-test-a');

  set local role authenticated;
  perform pg_temp.university_actor(operator_id);
  perform public.set_university_department_manager('uni-test-a',staff_id,false);
  perform pg_temp.university_actor(staff_id);
  perform pg_temp.university_denied('select public.get_university_workspace(''uni-test-a'',''consultations'')');
end
$$;
rollback;
