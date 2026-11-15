-- Run against an isolated migrated PostgreSQL database with ON_ERROR_STOP.
begin;
set local plpgsql.check_asserts=on;

create function pg_temp.actor(id uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub',coalesce(id::text,''),true)
$$;

create function pg_temp.expect_error(command text,code text) returns void language plpgsql as $$
begin
  execute command;
  raise exception 'Expected SQLSTATE %, got success',code;
exception when others then
  if sqlstate<>code then raise; end if;
end
$$;

do $$
declare
  manager uuid:=gen_random_uuid();
  other_manager uuid:=gen_random_uuid();
  club_manager uuid:=gen_random_uuid();
  players uuid[]:=array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  who uuid;
  dept_a uuid:=gen_random_uuid();
  dept_b uuid:=gen_random_uuid();
  field_course uuid:=gen_random_uuid();
  screen_course uuid:=gen_random_uuid();
  field_meeting uuid:=gen_random_uuid();
  screen_meeting uuid:=gen_random_uuid();
  separate_meeting uuid:=gen_random_uuid();
  private_meeting uuid:=gen_random_uuid();
  upcoming_meeting uuid:=gen_random_uuid();
  unconfirmed_meeting uuid:=gen_random_uuid();
  club_a uuid:=gen_random_uuid();
  club_b uuid:=gen_random_uuid();
  official uuid:=gen_random_uuid();
  source uuid;
  data jsonb;
  roster jsonb;
  draft jsonb;
  club_reference jsonb;
  scored jsonb;
  corrected jsonb;
  year integer:=extract(year from (now() at time zone 'Asia/Seoul')::date - 1);
  day date:=(now() at time zone 'Asia/Seoul')::date - 1;
begin
  foreach who in array players||array[manager,other_manager,club_manager] loop
    insert into auth.users(id,instance_id,aud,role,email)
    values(who,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',who||'@university-score-local.test');
    insert into public.user_profiles(user_id,display_name)
    values(who,case who when players[1] then '김시험' when players[2] then '이시험' when players[3] then '박시험' else '격리계정' end)
    on conflict(user_id) do update set display_name=excluded.display_name;
    insert into public.consent_records(user_id,consent_type,consent_version,decision)
    values(who,'terms_required','terms-dev-v1','granted'),(who,'privacy_required','privacy-dev-v1','granted');
  end loop;
  insert into public.lesson_university_departments(id,department_key,university_name,department_name,summary,region,publication_status,created_by,updated_by)
  values(dept_a,'score-test-a','비공개 명단 격리 대학','비공개 명단 격리 학과','격리 시험을 위한 학과 설명입니다.','충청','published',manager,manager),
    (dept_b,'score-test-b','격리 대학 나','격리 학과 나','격리 시험을 위한 학과 설명입니다.','충청','published',other_manager,other_manager);
  insert into public.lesson_university_managers values(dept_a,manager),(dept_b,other_manager);
  insert into public.lesson_university_students(department_id,user_id,approved_at,approved_by)
  values(dept_a,players[1],now(),manager),(dept_a,players[2],now(),manager),(dept_a,players[3],now(),manager),
    (dept_b,players[4],now(),other_manager);
  insert into public.courses(id,course_key,name,course_type,region,city,address,holes,operation_code,description,course_status,bay_count)
  values(field_course,'uni-score-field','격리 필드 구장','field','충청','시험시','충청 시험시 1',18,'walkIn','격리 검증용 구장 안내입니다.','active',6),
    (screen_course,'uni-score-screen','격리 스크린 구장','screen','충청','시험시','충청 시험시 2',18,'walkIn','격리 검증용 구장 안내입니다.','active',6);
  insert into public.lesson_university_space_entries(id,department_id,author_id,kind,title,body,event_date,event_time,place)
  values(field_meeting,dept_a,manager,'event','내부 월례회','내부 일정 세부 내용',day,'09:00','내부 일정 장소'),
    (screen_meeting,dept_a,manager,'event','스크린 월례회','내부 일정 세부 내용',day,'10:00','내부 일정 장소'),
    (separate_meeting,dept_a,manager,'event','별도 실제 라운드','내부 일정 세부 내용',day,'11:00','내부 일정 장소'),
    (private_meeting,dept_a,manager,'event','비공개 성적표','내부 일정 세부 내용',day,'12:00','내부 일정 장소'),
    (upcoming_meeting,dept_a,manager,'event','예정 월례회','내부 일정 세부 내용',day+2,'12:00','내부 일정 장소'),
    (unconfirmed_meeting,dept_a,manager,'event','경기 기준 미확인','내부 일정 세부 내용',day,'13:00','내부 일정 장소');
  insert into public.lesson_university_event_members(entry_id,user_id)
  select field_meeting,u from unnest(players[1:3]) u
  union all select screen_meeting,players[1]
  union all select separate_meeting,players[1]
  union all select private_meeting,players[1]
  union all select unconfirmed_meeting,players[1];

  set local role authenticated;
  perform pg_temp.actor(manager);
  data:=public.get_university_monthly_score('score-test-a',field_meeting);
  assert jsonb_array_length(data->'roster')=3 and data->'rows'='[]'::jsonb;
  scored:=jsonb_build_array(jsonb_build_object('user_id',players[1],'strokes',50),jsonb_build_object('user_id',players[2],'strokes',50),
    jsonb_build_object('user_id',players[3],'strokes',null));
  perform public.save_university_monthly_scores('score-test-a',upcoming_meeting,1,0,'field',null,'unconfirmed',false,null);
  perform pg_temp.expect_error(format('select public.save_university_monthly_scores(%L,%L,1,1,%L,null,%L,false,%L)',
    'score-test-a',upcoming_meeting,'field','unconfirmed','[]'),'22023');
  perform public.save_university_monthly_scores('score-test-a',field_meeting,1,0,'field','uni-score-field','outdoor_18_single',true,scored);
  perform pg_temp.expect_error(format('select public.save_university_monthly_scores(%L,%L,1,0,%L,null,%L,false,%L)',
    'score-test-a',field_meeting,'field','unconfirmed',scored),'PT409');
  perform pg_temp.expect_error(format('select public.save_university_monthly_scores(%L,%L,1,1,%L,%L,%L,true,%L)',
    'score-test-a',field_meeting,'screen','uni-score-field','other',scored),'22023');
  perform pg_temp.expect_error(format('select public.save_university_monthly_scores(%L,%L,1,1,%L,null,%L,false,%L)',
    'score-test-a',field_meeting,'field','unconfirmed',jsonb_build_array(jsonb_build_object('user_id',players[4],'strokes',16))),'42501');
  perform pg_temp.expect_error(format('select public.save_university_monthly_scores(%L,%L,1,1,%L,null,%L,false,%L)',
    'score-test-a',field_meeting,'field','unconfirmed',jsonb_build_array(jsonb_build_object('user_id',players[1],'strokes',0))),'22023');

  perform public.save_university_monthly_scores('score-test-a',screen_meeting,1,0,'screen','uni-score-screen','other',true,
    jsonb_build_array(jsonb_build_object('user_id',players[1],'strokes',10)));
  perform public.save_university_monthly_scores('score-test-a',private_meeting,1,0,'field','uni-score-field','outdoor_18_single',false,
    jsonb_build_array(jsonb_build_object('user_id',players[1],'strokes',20)));

  perform public.save_university_monthly_scores('score-test-a',unconfirmed_meeting,1,0,'field','uni-score-field','unconfirmed',true,
    jsonb_build_array(jsonb_build_object('user_id',players[1],'strokes',15)));

  perform pg_temp.actor(players[1]);
  data:=public.get_university_monthly_score('score-test-a',field_meeting);
  assert jsonb_array_length(data->'rows')=3 and data->'roster'='[]'::jsonb;
  assert (select count(*)=2 from jsonb_array_elements(data->'rows') r where r->>'score'='50');
  assert (select count(*)=1 from jsonb_array_elements(data->'rows') r where r->'score'='null');
  perform pg_temp.expect_error(format('select public.get_university_monthly_score(%L,%L)','score-test-b',field_meeting),'42501');
  perform pg_temp.expect_error('select public.get_university_tournament_candidates(''score-test-a'',''uni-official'')','42501');
  perform pg_temp.expect_error(format('select public.save_university_monthly_scores(%L,%L,1,1,%L,null,%L,false,%L)',
    'score-test-a',field_meeting,'field','unconfirmed',scored),'42501');
  perform pg_temp.actor(other_manager);
  perform pg_temp.expect_error(format('select public.get_university_score_workspace(%L,%L)','score-test-a',year),'42501');
  assert public.get_university_monthly_score('score-test-b',field_meeting) is null;
  perform pg_temp.expect_error(format('select public.save_university_monthly_scores(%L,%L,1,1,%L,null,%L,false,%L)',
    'score-test-b',field_meeting,'field','unconfirmed',scored),'42501');
  perform pg_temp.actor(players[4]);
  perform pg_temp.expect_error(format('select public.get_university_monthly_score(%L,%L)','score-test-a',field_meeting),'42501');
  perform pg_temp.expect_error('select * from private.university_monthly_scores','42501');

  set local role service_role;
  perform public.mutate_university_space(players[1],'score-test-a',field_meeting,'cancel','event',1,'{}');
  perform pg_temp.expect_error(format('select public.mutate_university_space(%L,%L,%L,%L,%L,1,%L)',
    manager,'score-test-a',field_meeting,'delete','event','{}'),'PT409');
  set local role authenticated;
  perform pg_temp.actor(manager);
  corrected:=jsonb_build_array(jsonb_build_object('user_id',players[1],'strokes',46),jsonb_build_object('user_id',players[2],'strokes',50));
  perform public.save_university_monthly_scores('score-test-a',field_meeting,1,1,'field','uni-score-field','outdoor_18_single',true,corrected);
  assert public.get_university_monthly_score('score-test-a',field_meeting)->>'version'='2';
  assert jsonb_array_length(public.get_university_monthly_score('score-test-a',field_meeting)->'rows')=2;
  perform public.save_university_monthly_scores('score-test-a',separate_meeting,1,0,'field','uni-score-field','outdoor_18_single',true,
    jsonb_build_array(jsonb_build_object('user_id',players[1],'strokes',60)));
  data:=public.get_university_score_workspace('score-test-a',year);
  assert (select count(*)=4 from jsonb_array_elements(data->'sheets') r where r->>'gameType'='field');
  assert (select count(*)=1 from jsonb_array_elements(data->'sheets') r where r->>'gameType'='screen');
  assert exists(select 1 from jsonb_array_elements(data->'best') r where r->>'score'='20' and r->>'game'='field');
  assert exists(select 1 from jsonb_array_elements(data->'best') r where r->>'score'='10' and r->>'game'='screen');

  set local role anon;
  perform pg_temp.actor(null);
  perform pg_temp.expect_error(format('select public.get_university_score_workspace(%L,%L)','score-test-a',year),'42501');
  data:=public.get_hall_national_scores('all')->'items';
  assert data::text not like '%비공개 명단%' and data::text not like '%내부 일정%';
  assert exists(select 1 from jsonb_array_elements(data) r where r->>'name'='김O험' and r->>'score'='46');
  assert not exists(select 1 from jsonb_array_elements(data) r where (r->>'score')::numeric in (10,15,20));
  assert public.get_course_personal_best_cards('uni-score-field') #>> '{0,score}'='46';
  assert public.get_course_personal_best_cards('uni-score-screen')='[]'::jsonb;

  reset role;
  assert (select count(*)=2 from private.hall_national_score_sources where user_id=players[1]);
  assert (select count(*)=2 from private.public_personal_score_sources where user_id=players[1]);
  assert (select metric=53 from private.hall_ranked_scores('year') where user_id=players[1]);
  insert into public.clubs(id,legacy_key,name,club_status,directory_is_public)
  values(club_a,'uni-score-club-a','대표 동호회','active',true),(club_b,'uni-score-club-b','참조 동호회','active',true);
  insert into public.club_memberships(club_id,user_id,membership_status)
  values(club_a,club_manager,'active'),(club_b,club_manager,'active'),(club_a,players[1],'active'),(club_b,players[1],'active');
  set local session_replication_role=replica;
  insert into public.club_role_assignments(membership_id,role_code,assigned_by)
  select id,'club_admin',user_id from public.club_memberships where user_id=club_manager;
  set local session_replication_role=origin;
  insert into public.events(id,event_key,title,match_type,event_scale,region,venue_name,venue_type,start_date,
    registration_status,target_audience,organizer,summary,publication_status,created_by,updated_by,related_course_id)
  values(official,'uni-official','격리 공식 대회','field','friendly','충청','격리 필드 구장','field',day,
    'ended',array['회원'],'외부 개최','격리 시험을 위한 대회입니다.','published',club_manager,club_manager,field_course);

  set local role authenticated;
  perform pg_temp.actor(club_manager);
  roster:=jsonb_build_object('user_id',players[1],'division','일반부','intent','group',
    'registration','complete','attendance','attended','award','yes','place',1,'score',40,'tied',false);
  draft:=jsonb_build_object('title','격리 공식 대회','played_on',day,'course_name','격리 필드 구장',
    'event_id',official,'course_id',field_course,'course_confirmation',jsonb_build_object(
      'course_key','uni-score-field','event_id',official,'event_version',1,'event_course_id',field_course),
    'divisions',jsonb_build_array('일반부'),'comparison_basis','outdoor_18_single','entries',jsonb_build_array(roster));
  data:=public.save_club_tournament('uni-score-club-a',gen_random_uuid(),draft);
  source:=(public.get_club_tournaments('uni-score-club-a') #>> '{tournaments,0,entries,0,id}')::uuid;
  assert source is not null;
  club_reference:=public.find_cross_club_tournament_result('uni-score-club-b',official,players[1],'일반부');
  assert club_reference->>'id'=source::text;
  perform public.save_club_tournament('uni-score-club-b',gen_random_uuid(),
    draft||jsonb_build_object('entries',jsonb_build_array(roster||jsonb_build_object('cross_result',club_reference))));

  perform pg_temp.actor(manager);
  assert jsonb_array_length(public.get_university_tournament_candidates('score-test-a','uni-official'))=1;
  perform pg_temp.expect_error(format('select public.set_university_tournament_link(%L,%L,%L,%L,true)',
    'score-test-a','uni-official',players[1],'시니어부'),'22023');
  perform pg_temp.expect_error(format('select public.set_university_tournament_link(%L,%L,%L,%L,true)',
    'score-test-a','uni-official',players[4],'일반부'),'22023');
  perform public.set_university_tournament_link('score-test-a','uni-official',players[1],'일반부',true);
  perform public.set_university_tournament_link('score-test-a','uni-official',players[1],'일반부',true);
  assert public.get_university_tournament_candidates('score-test-a','uni-official')='[]'::jsonb;
  perform pg_temp.expect_error(format('select public.request_pul_tournament_correction(%L,%L,gen_random_uuid(),1,39,false,%L,1)',
    'uni-score-club-a',source,'학과 담당자 권한 검사'),'42501');
  assert public.get_university_score_workspace('score-test-a',year)#>>'{tournaments,0,score}'='40';
  assert public.get_course_personal_best_cards('uni-score-field')#>>'{0,score}'='40';
  reset role;
  assert (select count(*)=1 from private.university_tournament_links where event_id=official);
  assert (select count(*)=1 from private.hall_national_score_sources where linked_event_id=official);
  assert (select count(*)=1 from private.public_personal_score_sources where linked_event_id=official and course_id=field_course);
  assert (select metric=48.67 from private.hall_ranked_scores('year') where user_id=players[1]);

  set local role authenticated;
  perform pg_temp.actor(club_manager);
  perform public.save_club_tournament('uni-score-club-a',gen_random_uuid(),
    draft||data||jsonb_build_object('version',1,'entries',jsonb_build_array(roster||'{"score":39}'::jsonb)));
  assert public.get_club_tournaments('uni-score-club-b')#>>'{tournaments,0,entries,0,score}'='39';
  perform pg_temp.actor(players[1]);
  assert public.get_university_score_workspace('score-test-a',year)#>>'{tournaments,0,score}'='39';
  assert public.get_course_personal_best_cards('uni-score-field')#>>'{0,score}'='39';
  assert exists(select 1 from jsonb_array_elements(public.get_hall_national_scores('all')->'items') r where r->>'name'='김시험' and r->>'score'='39');

  reset role;
  update private.club_tournament_entries set excluded=true where id=source;
  set local role authenticated;
  perform pg_temp.actor(players[1]);
  assert public.get_university_score_workspace('score-test-a',year)->'tournaments'='[]'::jsonb;
  assert public.get_club_tournaments('uni-score-club-b')#>>'{tournaments,0,entries,0,score}' is null;
  assert public.get_course_personal_best_cards('uni-score-field')#>>'{0,score}'='46';
  assert exists(select 1 from jsonb_array_elements(public.get_hall_national_scores('all')->'items') r where r->>'name'='김시험' and r->>'score'='46');
  perform pg_temp.actor(manager);
  perform public.save_university_monthly_scores('score-test-a',field_meeting,1,2,'field','uni-score-field','outdoor_18_single',true,'[]');
  assert public.get_university_monthly_score('score-test-a',field_meeting)->'rows'='[]'::jsonb;
  assert public.get_course_personal_best_cards('uni-score-field')#>>'{0,score}'='60';
  assert exists(select 1 from jsonb_array_elements(public.get_hall_national_scores('all')->'items') r where r->>'name'='김O험' and r->>'score'='60');
  reset role;
  assert not exists(select 1 from private.hall_national_score_sources where linked_event_id=official or source_id=field_meeting);
  assert not exists(select 1 from private.public_personal_score_sources where linked_event_id=official or source_id=field_meeting);
end
$$;
rollback;

