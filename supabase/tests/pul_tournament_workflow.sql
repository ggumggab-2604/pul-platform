-- Run on an isolated local Supabase with ON_ERROR_STOP. All fixtures and deliveries roll back.
begin;
set local plpgsql.check_asserts=on;

create function pg_temp.actor(id uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub',coalesce(id::text,''),true)
$$;
create function pg_temp.op(event_key text,operation text,input jsonb default '{}',request uuid default gen_random_uuid())
returns jsonb language sql as $$
  select public.mutate_tournament_signup(event_key,operation,request,input)
$$;
create function pg_temp.participant(event_key text, participant_name text) returns jsonb language sql as $$
  select jsonb_build_object('participant',x->>'id','version',x->'version')
  from jsonb_array_elements(public.get_tournament_signup(event_key)->'roster') x
  where x->>'name'=participant_name and not (x->>'guest')::boolean
$$;
create function pg_temp.expect_error(query text,code text) returns void language plpgsql as $$
begin
  execute query;
  raise exception 'expected %, got success',code;
exception when others then
  if sqlstate<>code then raise; end if;
end
$$;

do $$
declare
  organizer uuid:=gen_random_uuid();
  president_a uuid:=gen_random_uuid();
  president_b uuid:=gen_random_uuid();
  outsider uuid:=gen_random_uuid();
  players uuid[]:=array(select gen_random_uuid() from generate_series(1,7));
  names text[]:=array['가우리','나우리','다우리','라우리','마우리','바우리','사우리'];
  club_a uuid:=gen_random_uuid();
  club_b uuid:=gen_random_uuid();
  host_club uuid:=gen_random_uuid();
  field_course uuid:=gen_random_uuid();
  screen_course uuid:=gen_random_uuid();
  new_field uuid:=gen_random_uuid();
  new_screen uuid:=gen_random_uuid();
  account uuid;
  kind text;
  host_key text;
  venue_key text;
  changed_venue text;
  played_course text;
  event_key text;
  competition uuid;
  registration jsonb;
  roster jsonb;
  snapshot jsonb;
  submission jsonb;
  receipt jsonb;
  guest uuid;
  request uuid;
  mail uuid;
  pending_id uuid;
  correction uuid;
  old_token text;
  old_revision int;
  basis text;
  period text;
  missed int;
  i int;
  day date:=(statement_timestamp() at time zone 'Asia/Seoul')::date;
begin
  foreach account in array players||array[organizer,president_a,president_b,outsider] loop
    insert into auth.users(id,instance_id,aud,role,email) values
      (account,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',account||'@tournament-local.test');
    insert into public.user_accounts(id) values(account) on conflict do nothing;
    insert into public.user_profiles(user_id,display_name)
      values(account,coalesce(names[array_position(players,account)],'테스트 운영진'))
      on conflict(user_id) do update set display_name=excluded.display_name;
    insert into public.consent_records(user_id,consent_type,consent_version,decision)
      values(account,'terms_required','terms-dev-v1','granted'),(account,'privacy_required','privacy-dev-v1','granted');
    insert into private.member_basics(user_id,contact_phone)
      values(account,'0105555000'||coalesce(array_position(players,account),0));
  end loop;
  insert into public.clubs(id,legacy_key,name,club_status,directory_is_public) values
    (club_a,'workflow-a','참가 동호회 가','active',true),
    (club_b,'workflow-b','참가 동호회 나','active',true),
    (host_club,'workflow-host','개최 동호회','active',true);
  insert into public.club_memberships(club_id,user_id,membership_status)
    select club_a,u,'active' from unnest(players[1:5]||array[president_a]) u
    union all select club_b,u,'active' from unnest(array[players[4],players[6],players[7],president_b]) u
    union all select host_club,organizer,'active';
  set local session_replication_role=replica;
  insert into public.club_role_assignments(membership_id,role_code,assigned_by)
    select m.id,'club_admin',m.user_id from public.club_memberships m where m.user_id in(organizer,president_a,president_b);
  set local session_replication_role=origin;
  insert into public.courses(id,course_key,name,course_type,region,city,address,holes,operation_code,description,course_status,bay_count)
  values(field_course,'workflow-field','시험 필드 구장','field','경기','시험시','경기 시험시 1',18,'walkIn','시험용 구장에 대한 안내입니다.','active',6),
        (screen_course,'workflow-screen','시험 스크린 매장','screen','경기','시험시','경기 시험시 2',18,'walkIn','시험용 구장에 대한 안내입니다.','active',6),
        (new_field,'workflow-field-new','변경 필드 구장','field','경기','시험시','경기 시험시 3',18,'walkIn','시험용 구장에 대한 안내입니다.','active',6),
        (new_screen,'workflow-screen-new','변경 스크린 매장','screen','경기','시험시','경기 시험시 4',18,'walkIn','시험용 구장에 대한 안내입니다.','active',6);
  insert into private.course_stewards(course_id,user_id,granted_by) values(screen_course,organizer,organizer);
  insert into public.course_club_links(course_id,club_id,created_by)
    values(field_course,club_a,president_a),(screen_course,club_a,president_a),
          (new_field,club_b,president_b),(new_screen,club_b,president_b);
  insert into public.course_bookmarks(user_id,course_id)
    values(players[1],field_course),(players[6],field_course),(players[1],screen_course),(players[6],screen_course);

  foreach kind in array array['field','screen'] loop
    host_key:=case when kind='field' then 'workflow-host' else 'workflow-screen' end;
    venue_key:='workflow-'||kind;
    changed_venue:=venue_key||'-new';
    played_course:=case when kind='field' then 'AB 코스' else '한솔 가상 코스' end;
    set local role authenticated;
    perform pg_temp.actor(organizer);
    request:=gen_random_uuid();
    submission:=jsonb_build_object('scope',case when kind='field' then 'club' else 'course' end,
      'hostKey',host_key,'venueKey',venue_key,'title','격리 대회 '||kind,'matchType',kind,
      'playedOn',day+1,'region','경기','playedCourseName',played_course,'summary','격리 대회 업무 검증 안내입니다.',
      'divisions',jsonb_build_array('일반부'),'fee',1000,'deadline',(day+1)::text||'T00:00','capacity',9,'guests',true);
    registration:=public.register_pul_tournament(request,submission);
    assert registration=public.register_pul_tournament(request,submission)-'replayed';
    assert (registration->>'published')::boolean;
    event_key:=registration->>'key';
    assert public.get_public_event(event_key)->>'title'='격리 대회 '||kind;
    assert public.get_public_tournament_course(event_key)=played_course;
    assert public.course_content_overview(venue_key)->'events' @> jsonb_build_array(jsonb_build_object('key',event_key));
    assert public.get_tournament_signup(event_key)->>'capacity'='9';
    reset role;
    select e.id into competition from public.events e where e.event_key=registration->>'key';

    set local role authenticated;
    perform pg_temp.actor(organizer);
    request:=gen_random_uuid();
    receipt:=pg_temp.op(event_key,'general','{}',request);
    assert receipt->>'sent'='7';
    assert pg_temp.op(event_key,'general','{}',request)->>'sent'='7';
    assert pg_temp.op(event_key,'general')->>'sent'='0';
    assert pg_temp.op(event_key,'invite',jsonb_build_object('club',club_b,'body','초청 안내',
      'benefit','단체 할인','terms','네 명부터','expires',day))->>'sent'='1';
    reset role;
    select tm.message_id into mail from private.tournament_messages tm where tm.event_id = competition and tm.purpose='general';
    assert (select count(*) from public.messaging_recipients r where r.message_id=mail and r.recipient_user_id=players[1])=1;
    assert (select count(*) from public.messaging_recipients r where r.message_id=mail and r.recipient_user_id=players[2])=1;
    assert not exists(select 1 from private.tournament_messages tm join public.messaging_recipients r using(message_id)
      where tm.event_id = competition and tm.purpose='invite' and r.recipient_user_id<>president_b);
    set local role authenticated;
    perform pg_temp.actor(outsider);
    perform pg_temp.expect_error(format('select public.get_messaging_message(%L,false)',mail),'P0002');
    perform pg_temp.expect_error(format('select pg_temp.op(%L,%L)',event_key,'general'),'42501');
    perform pg_temp.actor(president_b);
    assert (select x->>'invited' from jsonb_array_elements(public.get_tournament_signup(event_key)->'clubs') x where x->>'id'=club_b::text)='true';
    perform pg_temp.actor(president_a);
    assert public.get_messaging_message(mail,false)->>'event_key'=event_key;
    assert pg_temp.op(event_key,'poll',jsonb_build_object('club',club_a))->>'sent'='5';
    for i in 1..5 loop
      perform pg_temp.actor(players[i]);
      if i=1 then
        perform pg_temp.op(event_key,'respond',jsonb_build_object('club',club_a,'state','maybe'));
        perform pg_temp.op(event_key,'respond',jsonb_build_object('club',club_a,'state','no'));
      end if;
      perform pg_temp.op(event_key,'respond',jsonb_build_object('club',club_a,'state','yes'));
    end loop;
    perform pg_temp.actor(president_a);
    snapshot:=public.get_tournament_signup(event_key);
    assert jsonb_array_length(snapshot #> '{polls,0,rows}')=5;
    assert snapshot #> '{polls,0,rows,0,phone}' is null;
    request:=gen_random_uuid();
    submission:=jsonb_build_object('club',club_a,'version',snapshot #> '{polls,0,version}','members',players[1:5]);
    perform pg_temp.op(event_key,'group',submission,request);
    assert pg_temp.op(event_key,'group',submission,request)->>'replayed'='true';
    for i in 4..7 loop
      perform pg_temp.actor(players[i]);
      assert public.get_tournament_signup(event_key)#>>'{profile,name}'=names[i];
      assert public.get_tournament_signup(event_key)#>>'{profile,phone}'='0105555000'||i;
      submission:=jsonb_build_object('name',names[i],'phone',case when i=6 then '+82 10-5555-0006' else '010-5555-000'||i end,
        'club',case when i in (4,6) then club_b when i=5 then club_a end);
      request:=gen_random_uuid();
      perform pg_temp.op(event_key,'individual',submission,request);
      assert pg_temp.op(event_key,'individual',submission,request)->>'replayed'='true';
    end loop;
    perform pg_temp.actor(organizer);
    roster:=public.get_tournament_signup(event_key)->'roster';
    assert jsonb_array_length(roster)=7;
    assert (select count(*) from jsonb_array_elements(roster) r where r->>'channel'='both')=2;
    assert (select count(*) from jsonb_array_elements(roster) r where (r->>'conflict')::boolean)=1;
    perform pg_temp.op(event_key,'resolve',pg_temp.participant(event_key,names[4])||jsonb_build_object('state',club_a));
    assert (select count(*) from jsonb_array_elements(public.get_tournament_signup(event_key)->'roster') r
      where (r->>'conflict')::boolean)=0;
    raise notice '%: group 5 + individual 4 - overlap 2 = 7',kind;

    set local role anon;
    perform pg_temp.actor(null);
    assert public.get_tournament_signup(event_key)->'roster'='[]'::jsonb;
    assert public.get_tournament_signup(event_key)->'profile'='null'::jsonb;
    perform pg_temp.expect_error(format('select pg_temp.op(%L,%L,%L)',event_key,'individual',
      '{"state":"cancel","name":"비회원 검증","phone":"01055558888"}'),'22023');
    guest:=gen_random_uuid();
    submission:=jsonb_build_object('name',names[6],'phone','01055550006','nickname','선택 닉네임');
    perform pg_temp.op(event_key,'individual',submission,guest);
    perform pg_temp.op(event_key,'individual',submission,guest);
    reset role;

    set local role authenticated;
    perform pg_temp.actor(organizer);
    roster:=public.get_tournament_signup(event_key)->'roster';
    assert jsonb_array_length(roster)=8;
    submission:=(select jsonb_build_object('participant',x->>'id','version',x->'version','state',x->'candidates'->>0)
      from jsonb_array_elements(roster) x where (x->>'guest')::boolean);
    perform pg_temp.op(event_key,'duplicate',submission);
    perform pg_temp.actor(outsider);
    perform pg_temp.op(event_key,'individual',jsonb_build_object('name','취소 대상','phone','01055557777'));
    perform pg_temp.op(event_key,'individual','{"state":"cancel"}');
    perform pg_temp.actor(organizer);
    snapshot:=public.get_tournament_signup(event_key);
    request:=gen_random_uuid();
    submission:=jsonb_build_object('state','schedule','version',snapshot->'version','body','집결 시간과 장소 변경 안내',
      'venueKey',changed_venue,'playedOn',day+2,'playedCourse',played_course||' 변경');
    assert pg_temp.op(event_key,'change',submission,request)->>'sent'='7';
    assert pg_temp.op(event_key,'change',submission,request)->>'sent'='7';
    assert public.get_public_event(event_key)->>'start_date'=(day+2)::text;
    assert public.get_public_tournament_course(event_key)=played_course||' 변경';
    assert public.course_content_overview(changed_venue)->'events' @> jsonb_build_array(jsonb_build_object('key',event_key));
    assert not (public.course_content_overview(venue_key)->'events' @> jsonb_build_array(jsonb_build_object('key',event_key)));
    reset role;
    assert (select count(*) from private.tournament_messages tm join public.messaging_recipients r using(message_id)
      where tm.event_id = competition and tm.purpose='change' and r.recipient_user_id=players[4])=1;
    assert not exists(select 1 from private.tournament_messages tm join public.messaging_recipients r using(message_id)
      where tm.event_id = competition and tm.purpose='change' and r.recipient_user_id=outsider);

    -- Advance the competition clock with fixture data. All real transitions below use the RPC.
    update public.events e set start_date=day where e.id = competition;
    update private.tournament_signup s set deadline=statement_timestamp()-interval '1 minute' where s.event_id = competition;
    set local role authenticated;
    perform pg_temp.actor(organizer);
    assert public.get_public_event(event_key)->>'registration_status'='closed';
    request:=gen_random_uuid();
    assert pg_temp.op(event_key,'roster','{}',request)->>'sent'='2';
    assert pg_temp.op(event_key,'roster','{}',request)->>'sent'='2';
    for i in 1..7 loop
      perform pg_temp.op(event_key,'roster_state',pg_temp.participant(event_key,names[i])||
        jsonb_build_object('state',case when i=2 then 'absent' else 'attended' end));
    end loop;
    perform pg_temp.op(event_key,'attendance_close');
    assert pg_temp.op(event_key,'actual')->>'sent'='2';
    missed:=2;
    if kind='field' then
      perform pg_temp.op(event_key,'result',pg_temp.participant(event_key,names[1])||'{"place":3,"score":49}');
      old_token:=public.get_tournament_signup(event_key)->>'reviewToken';
      perform pg_temp.actor(outsider);
      perform pg_temp.expect_error(format('select pg_temp.op(%L,%L,%L)',event_key,'attendance_reopen',
        jsonb_build_object('reviewToken',old_token)),'42501');
      perform pg_temp.actor(organizer);
      perform pg_temp.op(event_key,'attendance_reopen',jsonb_build_object('reviewToken',old_token));
      assert public.get_tournament_signup(event_key)->>'attendanceReopened'='true';
      assert public.get_tournament_signup(event_key)->>'open'='false';
      perform pg_temp.expect_error(format('select pg_temp.op(%L,%L)',event_key,'actual'),'PT409');
      perform pg_temp.op(event_key,'roster_state',pg_temp.participant(event_key,names[1])||'{"state":"absent"}');
      perform pg_temp.op(event_key,'roster_state',pg_temp.participant(event_key,names[2])||'{"state":"attended"}');
      assert exists(select 1 from jsonb_array_elements(public.get_tournament_signup(event_key)->'roster') x
        where x->>'name'=names[1] and x->>'attendance'='absent' and x->'score'='null');
      perform pg_temp.op(event_key,'attendance_close');
      perform pg_temp.expect_error(format('select pg_temp.op(%L,%L,%L)',event_key,'finalize',
        jsonb_build_object('reviewToken',old_token)),'PT409');
      assert pg_temp.op(event_key,'actual')->>'sent'='1';
      reset role;
      assert exists(select 1 from private.tournament_messages tm join public.messaging_messages m on m.id=tm.message_id
        where tm.event_id=competition and tm.purpose='actual' and tm.club_id=club_a and m.body like '%나우리%'
          and m.body not like '%가우리%');
      set local role authenticated;
      perform pg_temp.actor(organizer);
      missed:=1;
      raise notice 'AFTER M3: organizer-only reopen, two-way attendance edits, draft cleared, stale finalize blocked, changed roster resent';
    end if;
    reset role;
    assert (select count(*) from private.tournament_messages tm where tm.event_id = competition and tm.purpose='roster')=2;
    select tm.message_id into mail from private.tournament_messages tm where tm.event_id = competition and tm.purpose='roster' and tm.club_id=club_b;
    set local role authenticated;
    perform pg_temp.actor(president_a);
    perform pg_temp.expect_error(format('select public.get_messaging_message(%L,false)',mail),'P0002');
    perform pg_temp.actor(president_b);
    snapshot:=public.get_messaging_message(mail,false);
    assert snapshot->>'body' like '%바우리%' and snapshot->>'body' not like '%가우리%' and snapshot->>'body' not like '%010%';
    perform pg_temp.actor(players[7]);
    perform pg_temp.op(event_key,'result',pg_temp.participant(event_key,names[7])||'{"place":1,"score":43}');
    perform pg_temp.actor(president_b);
    perform pg_temp.op(event_key,'result',pg_temp.participant(event_key,names[6])||'{"place":2,"score":44}');
    perform pg_temp.actor(organizer);
    assert not exists(select 1 from jsonb_array_elements(public.get_public_tournament_results(event_key)) x);
    for i in 1..7 loop
      if i<>missed then
        perform pg_temp.op(event_key,'result',pg_temp.participant(event_key,names[i])||jsonb_build_object(
          'place',case when i=7 then 1 when i=6 then 2 when i in (1,2) then 3 when i in (3,4) then 4 else 6 end,'score',case when i=7 then 43 when i in (3,4) then 48 else 44+i end,'tied',i in (3,4)));
      end if;
    end loop;
    request:=gen_random_uuid();
    submission:=jsonb_build_object('reviewToken',public.get_tournament_signup(event_key)->'reviewToken','comparisonBasis','outdoor_18_single');
    if kind='screen' then
      perform pg_temp.expect_error(format('select pg_temp.op(%L,%L,%L)',event_key,'finalize',submission),'22023');
      submission:=submission||'{"comparisonBasis":"other"}';
    end if;
    perform pg_temp.op(event_key,'finalize',submission,request);
    perform pg_temp.op(event_key,'finalize',submission,request);
    perform pg_temp.expect_error(format('select pg_temp.op(%L,%L,%L)',event_key,'attendance_reopen',
      jsonb_build_object('reviewToken',public.get_tournament_signup(event_key)->'reviewToken')),'PT409');
    perform pg_temp.expect_error(format('select pg_temp.op(%L,%L,%L)',event_key,'roster_state',
      pg_temp.participant(event_key,names[7])||'{"state":"absent"}'),'PT409');
    reset role;
    assert not exists(select 1 from private.club_tournaments t where t.event_id=competition
      and t.comparison_basis<>submission->>'comparisonBasis');
    assert (select count(*) from private.hall_national_score_sources t where t.linked_event_id=competition)
      =case when kind='field' then 6 else 0 end;
    set local role anon;
    perform pg_temp.actor(null);
    roster:=public.get_public_tournament_results(event_key);
    assert jsonb_array_length(roster)=6;
    assert roster @> '[{"place":1,"score":43,"name":"사O리","affiliationPending":true}]';
    assert public.get_public_tournament_results(p_course_key=>changed_venue) @> '[{"place":1,"score":43,"affiliationPending":true}]';
    assert public.get_hall_tournament_awards(extract(year from day)::int,null,event_key)#>'{items,0,winners}'
      @> '[{"place":1,"score":43,"affiliationPending":true}]';
    assert public.get_hall_latest_records() @> jsonb_build_array(jsonb_build_object('eventKey',event_key,'affiliationPending',true));
    if kind='field' then
      foreach period in array array['month','year','all','today'] loop
        assert public.get_hall_national_scores(period)->'items' @> '[{"name":"사O리","score":43}]';
      end loop;
      assert public.get_hall_latest_records() @> jsonb_build_array(jsonb_build_object('eventKey',event_key,'kind','score'));
      reset role;
      update private.tournament_participants set result_at=((day-1)+time '23:59') at time zone 'Asia/Seoul'
      where event_id=competition and user_id=players[7];
      set local role anon;
      assert not (public.get_hall_national_scores('today')->'items' @> '[{"name":"사O리"}]');
      assert public.get_hall_national_scores('all')->'items' @> '[{"name":"사O리","score":43}]';
      reset role;
      update private.tournament_participants set result_at=(day+time '00:01') at time zone 'Asia/Seoul'
      where event_id=competition and user_id=players[7];
      set local role anon;
      assert public.get_hall_national_scores('today')->'items' @> '[{"name":"사O리","score":43}]';
    else
      assert not (public.get_hall_latest_records() @> jsonb_build_array(jsonb_build_object('eventKey',event_key,'kind','score')));
    end if;
    set local role authenticated;
    perform pg_temp.actor(players[7]);
    assert public.get_public_tournament_results(event_key) @> '[{"place":1,"name":"사우리"}]';
    pending_id:=(pg_temp.participant(event_key,names[7])->>'participant')::uuid;
    perform pg_temp.op(event_key,'result',pg_temp.participant(event_key,names[7])||
      '{"place":1,"score":42,"reason":"동호회 확인 중 공식 성적 정정 요청"}');
    perform pg_temp.actor(organizer);
    correction:=(public.get_pul_tournament_host_results(event_key)#>>'{corrections,0,id}')::uuid;
    assert correction is not null;
    assert public.get_public_tournament_results(event_key) @> '[{"place":1,"score":43,"affiliationPending":true}]';
    if kind='field' then
      perform public.review_pul_tournament_correction(event_key,correction,false,null);
    end if;
    perform pg_temp.actor(president_a);
    perform pg_temp.expect_error(format('select pg_temp.op(%L,%L,%L)',event_key,'affiliation',
      jsonb_build_object('participant',pending_id,'club',club_a)),'42501');
    if kind='field' then
      perform pg_temp.actor(players[7]);
    else
      perform pg_temp.actor(president_b);
      assert public.get_tournament_signup(event_key)->'affiliations' @> jsonb_build_array(jsonb_build_object('id',pending_id));
    end if;
    perform pg_temp.op(event_key,'affiliation',jsonb_build_object('participant',pending_id,'club',club_b));
    assert public.get_public_tournament_results(event_key) @> '[{"place":1,"score":43,"affiliationPending":false,"club":"참가 동호회 나"}]';
    reset role;
    assert (select count(*) from private.hall_national_score_sources x
      where x.linked_event_id=competition and x.user_id=players[7] and x.score=43)
      =case when kind='field' then 1 else 0 end;
    set local role authenticated;
    perform pg_temp.actor(president_b);
    assert exists(select 1 from jsonb_array_elements(public.get_club_tournaments('workflow-b')->'tournaments') x
      where x->>'event_id'=competition::text and x->'entries' @> '[{"place":1,"score":43}]');
    if kind='field' then
      perform pg_temp.actor(players[7]);
      perform pg_temp.op(event_key,'result',pg_temp.participant(event_key,names[7])||
        '{"place":1,"score":42,"reason":"공식 성적 정정 확인 요청"}');
    end if;
    perform pg_temp.actor(organizer);
    correction:=(public.get_pul_tournament_host_results(event_key)#>>'{corrections,0,id}')::uuid;
    assert correction is not null;
    assert public.get_public_tournament_results(event_key) @> '[{"place":1,"score":43}]';
    perform public.review_pul_tournament_correction(event_key,correction,true,null);
    assert public.get_public_tournament_results(event_key) @> '[{"place":1,"score":42,"affiliationPending":false}]';
    reset role;
    raise notice '%: notifications, 7 applicants / 6 attended, results and correction PASS',kind;
    if kind='field' then
      update public.clubs set directory_is_public=false where id=club_b;
      set local role authenticated;
      perform pg_temp.actor(organizer);
      assert not (public.get_public_tournament_results(event_key) @> '[{"place":1}]');
      perform pg_temp.op(event_key,'result',pg_temp.participant(event_key,names[7])||
        '{"place":1,"score":41,"reason":"비공개 동호회 원본 정정"}');
      correction:=(public.get_pul_tournament_host_results(event_key)#>>'{corrections,0,id}')::uuid;
      perform pg_temp.actor(outsider);
      perform pg_temp.expect_error(format('select public.review_pul_tournament_correction(%L,%L,true,null)',event_key,correction),'42501');
      perform pg_temp.expect_error(format('select public.review_pul_tournament_correction(%L,%L,false,null)',event_key,correction),'42501');
      perform pg_temp.actor(organizer);
      perform public.review_pul_tournament_correction(event_key,correction,false,null);
      assert (select x->>'score' from jsonb_array_elements(public.get_tournament_signup(event_key)->'roster') x
        where x->>'id'=pending_id::text)='42';
      perform pg_temp.op(event_key,'result',pg_temp.participant(event_key,names[7])||
        '{"place":1,"score":41,"reason":"비공개 원본 정정 승인"}');
      correction:=(public.get_pul_tournament_host_results(event_key)#>>'{corrections,0,id}')::uuid;
      perform public.review_pul_tournament_correction(event_key,correction,true,null);
      assert not (public.get_public_tournament_results(event_key) @> '[{"place":1}]');
      reset role;
      update public.clubs set directory_is_public=true where id=club_b;
      update public.club_memberships set membership_status='left',left_at=now() where club_id=club_b and user_id=players[7];
      set local role authenticated;
      perform pg_temp.actor(organizer);
      perform pg_temp.op(event_key,'result',pg_temp.participant(event_key,names[7])||
        '{"place":1,"score":44,"reason":"경기 후 탈퇴한 참가자 정정"}');
      correction:=(public.get_pul_tournament_host_results(event_key)#>>'{corrections,0,id}')::uuid;
      assert public.get_public_tournament_results(event_key) @> '[{"place":1,"score":41}]';
      reset role;
      update private.club_tournament_entries set result_revision=result_revision+1
      where id=pending_id returning result_revision-1 into old_revision;
      set local role authenticated;
      perform pg_temp.actor(organizer);
      perform pg_temp.expect_error(format('select public.review_pul_tournament_correction(%L,%L,true,null)',event_key,correction),'PT409');
      perform pg_temp.expect_error(format('select public.review_pul_tournament_correction(%L,%L,false,null)',event_key,correction),'PT409');
      reset role;
      update private.club_tournament_entries set result_revision=old_revision where id=pending_id;
      set local role authenticated;
      perform pg_temp.actor(organizer);
      perform public.review_pul_tournament_correction(event_key,correction,true,null);
      assert public.get_public_tournament_results(event_key) @> '[{"place":1,"score":44}]';
      perform pg_temp.op(event_key,'result',pg_temp.participant(event_key,names[7])||
        '{"place":1,"score":45,"reason":"탈퇴 참가자 정정 반려 확인"}');
      correction:=(public.get_pul_tournament_host_results(event_key)#>>'{corrections,0,id}')::uuid;
      perform public.review_pul_tournament_correction(event_key,correction,false,null);
      assert public.get_public_tournament_results(event_key) @> '[{"place":1,"score":44}]';
      reset role;
      update public.club_memberships set membership_status='active',left_at=null where club_id=club_b and user_id=players[7];
      raise notice 'AFTER M2: private and former member corrections approved/rejected, old source version protected, unauthorized actor blocked';
    end if;
  end loop;

  foreach basis in array array['other','unconfirmed'] loop
    set local role authenticated;
    perform pg_temp.actor(organizer);
    registration:=public.register_pul_tournament(gen_random_uuid(),jsonb_build_object(
      'scope','club','hostKey','workflow-host','venueKey','workflow-field','title','비집계 필드 '||basis,
      'matchType','field','playedOn',day+1,'region','경기','playedCourseName','비집계 경기',
      'summary','기준이 다르거나 미확인인 필드 경기입니다.','divisions',jsonb_build_array('일반부'),
      'fee',0,'deadline',(day+1)::text||'T00:00','capacity',5,'guests',false));
    event_key:=registration->>'key';
    perform pg_temp.actor(players[1]);
    perform pg_temp.op(event_key,'individual',jsonb_build_object('name',names[1],'phone','01055550001','club',club_a));
    reset role;
    select e.id into competition from public.events e where e.event_key=registration->>'key';
    update public.events set start_date=day,registration_status='closed' where id=competition;
    update private.tournament_signup set deadline=statement_timestamp()-interval '1 minute' where event_id=competition;
    set local role authenticated;
    perform pg_temp.actor(organizer);
    perform pg_temp.op(event_key,'roster_state',pg_temp.participant(event_key,names[1])||'{"state":"attended"}');
    perform pg_temp.op(event_key,'attendance_close');
    perform pg_temp.op(event_key,'result',pg_temp.participant(event_key,names[1])||'{"place":1,"score":30}');
    perform pg_temp.op(event_key,'finalize',jsonb_build_object(
      'comparisonBasis',basis,'reviewToken',public.get_tournament_signup(event_key)->'reviewToken'));
    assert public.get_hall_tournament_awards(extract(year from day)::int,null,event_key)#>'{items,0,winners}'
      @> '[{"place":1,"score":30}]';
    assert not (public.get_hall_latest_records() @> jsonb_build_array(jsonb_build_object('eventKey',event_key,'kind','score')));
    reset role;
    assert not exists(select 1 from private.hall_national_score_sources x where x.linked_event_id=competition);
  end loop;
  raise notice 'AFTER M1: four national periods, latest record, affiliation dedup, screen/other/unconfirmed exclusion and retained awards';

  -- An external applicant gets no host workspace until the existing PUL publish action.
  update public.user_accounts set platform_role='platform_admin' where id=outsider;
  set local role authenticated;
  perform pg_temp.actor(players[7]);
  submission:=jsonb_build_object('scope','external','hostKey','','venueKey','workflow-field','title','외부 개최 검증',
    'matchType','field','playedOn',day+1,'region','경기','playedCourseName','외부 필드 코스',
    'organizer','시험 외부 주최자','summary','기존 PUL 승인 과정을 검증합니다.','divisions',jsonb_build_array('일반부','여성부'),
    'fee',0,'deadline',(day+1)::text||'T00:00','capacity',1,'guests',false);
  registration:=public.register_pul_tournament(gen_random_uuid(),submission);
  event_key:=registration->>'key';
  assert not (registration->>'published')::boolean;
  assert public.get_tournament_signup(event_key) is null;
  perform pg_temp.expect_error(format('select public.mutate_event(%L,%L,1,%L)','publish',event_key,'{}'),'P0001');
  perform pg_temp.actor(outsider);
  assert public.mutate_event('publish',event_key,1,'{}')->>'publication_status'='published';
  perform pg_temp.actor(players[7]);
  assert public.get_tournament_signup(event_key)->>'host'='true';
  perform pg_temp.actor(players[1]);
  perform pg_temp.expect_error(format('select pg_temp.op(%L,%L,%L)',event_key,'individual',
    '{"name":"가우리","phone":"01055550001"}'),'22023');
  perform pg_temp.op(event_key,'individual','{"name":"가우리","phone":"01055550001","division":"일반부"}');
  perform pg_temp.actor(players[2]);
  perform pg_temp.expect_error(format('select pg_temp.op(%L,%L,%L)',event_key,'individual',
    '{"name":"나우리","phone":"01055550002","division":"여성부"}'),'PT409');
  assert public.get_tournament_signup(event_key)->'roster'='[]'::jsonb;
  set local role anon;
  perform pg_temp.actor(null);
  perform pg_temp.expect_error(format('select pg_temp.op(%L,%L,%L)',event_key,'individual',
    '{"name":"나우리","phone":"01055550002","division":"여성부"}'),'42501');
  set local role authenticated;
  perform pg_temp.actor(players[7]);
  snapshot:=public.get_tournament_signup(event_key);
  assert pg_temp.op(event_key,'change',jsonb_build_object('state','cancel','version',snapshot->'version',
    'body','외부 대회 취소 안내'))->>'sent'='1';
  assert public.get_tournament_signup(event_key)->>'cancelled'='true';
  assert public.get_public_event(event_key)->>'registration_status'='ended';
  reset role;
  raise notice 'external: approval, multiple divisions, capacity, guest gate and cancellation PASS';
end
$$;

set constraints all immediate;
rollback;
