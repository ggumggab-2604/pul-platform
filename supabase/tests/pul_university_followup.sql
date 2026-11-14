
-- Local regression. Fixtures roll back, including auth.users.
begin;
set local plpgsql.check_asserts=on;

create function pg_temp.followup_denied(p_sql text,p_state text)
returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'Expected %',p_state;
exception when others then
  if sqlstate<>p_state then raise; end if;
end
$$;

do $$
declare
  op uuid := gen_random_uuid();
  applicant uuid := gen_random_uuid();
  second_applicant uuid := gen_random_uuid();
  student uuid := gen_random_uuid();
  who uuid;
  req uuid := gen_random_uuid();
  req2 uuid := gen_random_uuid();
  retry uuid := gen_random_uuid();
  notice uuid := gen_random_uuid();
  event uuid := gen_random_uuid();
  k text := 'dept-'||req;
  base jsonb := jsonb_build_object('university_name','후속 격리 학교','department_name','후속 격리 학과',
    'campus','본교','region','충청','program_kind','degree','summary','후속 구현 격리 테스트 학과입니다.',
    'school_url','https://example.test/school','official_url','https://example.test/department',
    'guide_url','https://example.test/guide.pdf','admissions_url','https://example.test/admissions',
    'applicant_name','격리 신청자','position','교육 담당자','contact','office@example.test','verification','공식 담당 확인 페이지');
  item jsonb;
begin
  foreach who in array array[op,applicant,second_applicant,student] loop
    insert into auth.users(id,instance_id,aud,role,email)
    values(who,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',who||'@followup-local.test');
  end loop;
  update public.user_accounts set platform_role='platform_admin' where id=op;

  set local role service_role;
  perform public.submit_university_application(applicant,req,retry,null,'opening',null,base,null);
  assert (public.submit_university_application(applicant,req,retry,null,'opening',null,base,null)->>'replay')::boolean;
  perform public.submit_university_application(second_applicant,req2,gen_random_uuid(),null,'opening',null,base,null);

  set local role authenticated;
  perform set_config('request.jwt.claim.sub',student::text,true);
  assert public.get_university_applications(false,req)='[]'::jsonb;
  perform pg_temp.followup_denied(format('select public.review_university_application(%L,1,%L,null)',req,'approved'),'P0001');
  perform set_config('request.jwt.claim.sub',op::text,true);
  assert public.count_pending_university_applications()>=2;
  perform public.review_university_application(req,1,'revision','공식 자료 보완 요청');
  set local role service_role;
  perform public.submit_university_application(applicant,req,gen_random_uuid(),2,'opening',null,base,null);

  set local role authenticated;
  perform set_config('request.jwt.claim.sub',op::text,true);
  assert public.review_university_application(req,3,'approved',null)->>'status'='approved';
  assert (public.review_university_application(req,3,'approved',null)->>'replay')::boolean;
  perform pg_temp.followup_denied(format('select public.review_university_application(%L,1,%L,null)',req2,'approved'),'PT409');
  assert public.get_university_applications(true,req2)->0->>'status'='pending';
  assert public.review_university_application(req2,1,'rejected','이미 승인된 학과입니다.')->>'status'='rejected';
  perform set_config('request.jwt.claim.sub',second_applicant::text,true);
  assert public.get_university_applications(false,req2)->0->>'note'='이미 승인된 학과입니다.';
  perform set_config('request.jwt.claim.sub',op::text,true);
  assert public.get_university_department_detail(k) is null;
  perform public.mutate_lesson_university_department('publish',k,1,'{}');
  item:=public.get_university_department_detail(k);
  assert item->>'school_url'='https://example.test/school' and item->>'official_url'='https://example.test/department';
  assert not (item ? 'contact') and not (item ? 'verification');
  assert (public.find_existing_university_department('후속격리학교','후속 격리 학과','본교','충청','degree')->>'key')=k;
  assert public.find_existing_university_department('후속격리학교','후속 격리 학과','별도 캠퍼스','충청','degree') is null;
  assert public.find_existing_university_department('후속격리학교','후속 격리 학과','본교','충청','continuing') is null;

  perform set_config('request.jwt.claim.sub',student::text,true);
  perform public.request_university_student(k);
  perform pg_temp.followup_denied(format('select public.get_university_space(%L,%L)',k,'notice'),'42501');
  perform set_config('request.jwt.claim.sub',applicant::text,true);
  perform public.approve_university_student(k,student);
  set local role service_role;
  perform public.mutate_university_space(applicant,k,notice,'create','notice',null,'{"title":"격리 공지","body":"실습 안내"}',null);
  perform public.mutate_university_space(applicant,k,event,'create','event',null,
    jsonb_build_object('title','격리 일정','body','실습 안내','event_date',(current_date+10)::text,'event_time','13:00','place','캠퍼스'),null);
  perform public.mutate_university_space(student,k,event,'join','event',1,'{}',null);
  perform public.mutate_university_space(student,k,event,'join','event',1,'{}',null);
  perform pg_temp.followup_denied(format('select public.mutate_university_space(%L,%L,%L,%L,%L,null,%L,null)',
    student,k,gen_random_uuid(),'create','notice','{"title":"격리 공지","body":"학생 작성"}'),'42501');

  set local role authenticated;
  perform set_config('request.jwt.claim.sub',student::text,true);
  assert public.get_university_space(k,'notice')->'items'->0->>'title'='격리 공지';
  assert public.get_university_space(k,'event')->'items'->0->>'participants'='1';
  perform set_config('request.jwt.claim.sub',second_applicant::text,true);
  perform pg_temp.followup_denied(format('select public.get_university_space(%L,%L)',k,'event'),'42501');
  assert public.get_university_activity_photo(k,notice) is null;
  set local role service_role;
  perform public.mutate_university_space(student,k,event,'cancel','event',1,'{}',null);
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',student::text,true);
  assert public.get_university_space(k,'event')->'items'->0->>'participants'='0';
end
$$;
rollback;

