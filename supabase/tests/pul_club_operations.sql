-- Local regression. Every fixture and delivery is rolled back.
begin;
set local plpgsql.check_asserts=on;

create function pg_temp.actor(id uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub',coalesce(id::text,''),true)
$$;
create function pg_temp.room(room uuid,op text,input jsonb default '{}',request uuid default gen_random_uuid()) returns jsonb
language sql as $$ select public.mutate_club_participation('ops-club',room,op,request,input) $$;
create function pg_temp.expect_error(query text,code text) returns void language plpgsql as $$
begin
  execute query;
  raise exception 'expected %, got success',code;
exception when others then
  if sqlstate<>code then raise; end if;
end $$;

do $$
declare
  chair uuid:=gen_random_uuid(); vice uuid:=gen_random_uuid(); organizer uuid:=gen_random_uuid();
  first_member uuid:=gen_random_uuid(); second_member uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid();
  y_chair uuid:=gen_random_uuid(); y_vice uuid:=gen_random_uuid(); y_club uuid:=gen_random_uuid();
  cross_room uuid; cross_event uuid; cross_key text; source jsonb;
  actor uuid; club uuid:=gen_random_uuid(); host uuid:=gen_random_uuid(); course uuid:=gen_random_uuid();
  scheduled uuid:=gen_random_uuid(); other_schedule uuid:=gen_random_uuid();
  t_room uuid; m_room uuid; phone_room uuid; phone_event uuid; phone_key text; event_id uuid; event_key text; event_data jsonb; registration jsonb;
  multi_room uuid; multi_event uuid; multi_key text;
  info jsonb; preview jsonb; result jsonb; payload jsonb; mail uuid; request uuid;
  person uuid:=gen_random_uuid(); saved jsonb; round_data jsonb; day date:=(now() at time zone 'Asia/Seoul')::date;
  season integer:=extract(year from day);
begin
  foreach actor in array array[chair,vice,organizer,first_member,second_member,outsider,y_chair,y_vice] loop
    insert into auth.users(id,instance_id,aud,role,email) values
      (actor,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',actor||'@club-local.test');
    update public.user_profiles set display_name=case actor when first_member then '가상 회원 가' when second_member then '가상 회원 나' else '가상 운영진' end
      where user_id=actor;
    insert into public.consent_records(user_id,consent_type,consent_version,decision)
      values(actor,'terms_required','terms-dev-v1','granted'),(actor,'privacy_required','privacy-dev-v1','granted');
    insert into private.member_basics(user_id,contact_phone) values(actor,'01055550000');
  end loop;
  insert into public.clubs(id,legacy_key,name,club_status,directory_is_public) values
    (club,'ops-club','격리 참가 동호회','active',true),(host,'ops-host','격리 개최 동호회','active',true),
    (y_club,'ops-club-y','격리 참가 동호회 Y','active',true);
  insert into public.club_memberships(club_id,user_id,joined_at)
    select club,x,(make_date(season,1,1)-1)::timestamp at time zone 'Asia/Seoul' from unnest(array[chair,vice,first_member,second_member]) x
    union all select host,organizer,now()
    union all select y_club,x,now() from unnest(array[y_chair,y_vice,first_member]) x;
  set local session_replication_role=replica;
  insert into public.club_role_assignments(membership_id,role_code,assigned_by)
    select id,case when user_id in(vice,y_vice) then 'club_vice_admin' else 'club_admin' end,user_id
    from public.club_memberships where user_id in(chair,vice,organizer,y_chair,y_vice);
  set local session_replication_role=origin;
  insert into public.courses(id,course_key,name,course_type,region,city,address,holes,operation_code,description,course_status)
    values(course,'ops-field','격리 필드 구장','field','경기','시험시','경기 시험시 1',18,'walkIn','시험용 구장에 대한 안내입니다.','active');
  insert into public.course_club_links(course_id,club_id,created_by) values(course,club,chair),(course,y_club,y_chair);
  insert into public.club_official_events(id,club_id,creator_user_id,creator_role_code,event_type,title,starts_at,location,participant_target)
    values(scheduled,club,chair,'club_admin','monthly_meeting','격리 월례회',now()+interval '2 days','격리 필드 구장','전체 회원'),
      (other_schedule,host,organizer,'club_admin','monthly_meeting','다른 동호회 월례회',now()+interval '2 days','격리 필드 구장','전체 회원');

  set local role authenticated;
  perform pg_temp.actor(organizer);
  event_data:=jsonb_build_object('scope','club','hostKey','ops-host','venueKey','ops-field','title','격리 단체 접수 대회',
    'matchType','field','playedOn',day+2,'region','경기','playedCourseName','격리 필드 구장','summary','격리 대회 업무 검증 안내입니다.',
    'divisions',jsonb_build_array('시니어부'),'fee',1000,'clubLimit',1,'clubLimitScope','combined',
    'deadline',(day+1)::text||'T22:00','capacity',9);
  registration:=public.register_pul_tournament(gen_random_uuid(),event_data);
  event_key:=registration->>'key';
  reset role;
  select id into event_id from public.events where public.events.event_key=registration->>'key';

  set local role authenticated;
  perform pg_temp.actor(vice);
  perform pg_temp.expect_error(format('select pg_temp.room(null,%L,%L)','create',jsonb_build_object('kind','tournament','target',event_id)),'42501');
  perform pg_temp.actor(chair);
  perform pg_temp.expect_error(format('select pg_temp.room(null,%L,%L)','create',jsonb_build_object('kind','monthly','target','event:'||other_schedule)),'42501');
  t_room:=(pg_temp.room(null,'create',jsonb_build_object('kind','tournament','target',event_id,'phoneAllowed',true))->>'roomId')::uuid;
  m_room:=(pg_temp.room(null,'create',jsonb_build_object('kind','monthly','target','event:'||scheduled))->>'roomId')::uuid;
  assert jsonb_array_length(public.get_club_participation('ops-club',null)->'rooms')=2;
  assert public.get_tournament_signup(event_key)->'polls'->0->>'roomId'=t_room::text;

  preview:=pg_temp.room(t_room,'preview_notice','{"audience":"all"}');
  assert preview->>'count'='3';
  payload:=jsonb_build_object('audience','all','body','격리 모집 공지','token',preview->>'token');
  request:=gen_random_uuid();
  assert pg_temp.room(t_room,'notice',payload,request)->>'sent'='3';
  assert pg_temp.room(t_room,'notice',payload,request)->>'replayed'='true';
  info:=public.get_club_participation(null,t_room);
  mail:=(info->'notices'->0->>'id')::uuid;
  assert jsonb_array_length(info->'notices')=1;

  perform pg_temp.actor(outsider);
  perform pg_temp.expect_error(format('select public.get_club_participation(null,%L)',t_room),'42501');
  perform pg_temp.expect_error(format('select public.get_messaging_message(%L,false)',mail),'P0002');
  perform pg_temp.expect_error('select public.get_club_annual_activity(''ops-club'',2025)','42501');
  perform pg_temp.actor(vice);
  assert public.get_club_annual_activity('ops-club',season) ? 'members';
  assert not (public.get_club_participation(null,t_room) ? 'members');

  perform pg_temp.actor(first_member);
  assert public.get_messaging_message(mail,false)->>'body' like '%/club-participation/'||t_room;
  assert not (public.get_club_participation(null,t_room) ? 'members');
  perform pg_temp.expect_error(format('select pg_temp.room(%L,%L)',t_room,'close'),'42501');
  perform pg_temp.expect_error(format('select pg_temp.room(%L,%L,%L)',t_room,'respond','{"response":"yes"}'),'22023');
  perform pg_temp.expect_error(format('select public.mutate_tournament_signup(%L,%L,gen_random_uuid(),%L)',
    event_key,'respond',jsonb_build_object('club',club,'state','yes')),'PT409');
  perform pg_temp.room(t_room,'respond','{"response":"maybe"}');
  perform pg_temp.room(t_room,'respond','{"response":"yes","consent":true,"seenName":"가상 회원 가","seenPhone":"01055550000","phoneAllowed":true}');
  perform pg_temp.room(m_room,'respond','{"response":"yes"}');
  perform pg_temp.actor(second_member);
  perform pg_temp.room(t_room,'respond','{"response":"no"}');
  perform pg_temp.room(t_room,'respond','{"response":"yes","consent":true,"seenName":"가상 회원 나"}');
  perform pg_temp.room(m_room,'respond','{"response":"yes"}');

  perform pg_temp.actor(chair);
  info:=public.get_club_participation(null,t_room);
  assert info->'members'->0->>'id'=first_member::text and info->'members'->1->>'id'=second_member::text;
  assert jsonb_array_length(info->'members')=4;
  preview:=pg_temp.room(t_room,'preview_notice','{"audience":"yes"}');
  assert preview->>'count'='2';
  assert pg_temp.room(t_room,'notice',jsonb_build_object('audience','yes','body','격리 준비 안내','token',preview->>'token'))->>'sent'='2';
  preview:=pg_temp.room(t_room,'preview_notice','{"audience":"unanswered"}');
  assert preview->>'count'='1';
  assert pg_temp.room(t_room,'notice',jsonb_build_object('audience','unanswered','body','격리 미응답 재안내','token',preview->>'token'))->>'sent'='1';
  assert jsonb_array_length(public.get_club_participation(null,t_room)->'notices')=3;

  payload:=jsonb_build_object('members',array[first_member,second_member],'fields',array['name','phone','club','division']);
  perform pg_temp.expect_error(format('select pg_temp.room(%L,%L,%L)',t_room,'preview_submit',payload),'PT409');
  payload:=jsonb_build_object('members',array[first_member,second_member],'fields',array['name','club','division']);
  preview:=pg_temp.room(t_room,'preview_submit',payload);
  assert not (preview->'members'->0 ? 'phone');
  perform pg_temp.expect_error(format('select pg_temp.room(%L,%L,%L)',t_room,'submit',
    payload||jsonb_build_object('token',preview->>'token')),'PT409');
  perform pg_temp.actor(organizer);
  assert jsonb_array_length(public.get_tournament_signup(event_key)->'roster')=0;
  perform pg_temp.actor(chair);
  payload:=jsonb_build_object('members',array[first_member],'fields',array['name','club','division']);
  perform pg_temp.expect_error(format('select pg_temp.room(%L,%L,%L)',t_room,'preview_submit',
    payload||'{"fields":["phone"]}'),'22023');
  preview:=pg_temp.room(t_room,'preview_submit',payload);
  assert preview->'members'->0->>'name'='가상 회원 가';
  perform pg_temp.expect_error(format('select pg_temp.room(%L,%L,%L)',t_room,'submit',payload||'{"token":"stale"}'),'PT409');
  request:=gen_random_uuid();
  payload:=payload||jsonb_build_object('token',preview->>'token');
  assert pg_temp.room(t_room,'submit',payload,request)->>'submitted'='1';
  assert pg_temp.room(t_room,'submit',payload,request)->>'replayed'='true';
  perform pg_temp.expect_error(format('select pg_temp.room(%L,%L,%L)',t_room,'submit',payload),'PT409');
  perform pg_temp.actor(organizer);
  info:=public.get_tournament_signup(event_key);
  assert jsonb_array_length(info->'roster')=1;
  assert info->'roster'->0->>'name'='가상 회원 가' and info->'roster'->0->>'phone' is null;
  assert info->'roster'->0->>'division'='시니어부';

  -- Phone is available only when the member consented and the chair selected it.
  registration:=public.register_pul_tournament(gen_random_uuid(),event_data||'{"title":"격리 전화번호 선택 대회"}');
  phone_key:=registration->>'key';
  reset role;
  select id into phone_event from public.events where public.events.event_key=phone_key;
  set local role authenticated;
  perform pg_temp.actor(chair);
  phone_room:=(pg_temp.room(null,'create',jsonb_build_object('kind','tournament','target',phone_event,'phoneAllowed',true))->>'roomId')::uuid;
  assert public.get_club_participation(null,phone_room)->'requiredFields'='["name"]'::jsonb;
  perform pg_temp.actor(first_member);
  perform pg_temp.room(phone_room,'respond','{"response":"yes","consent":true,"seenName":"가상 회원 가","seenPhone":"01055550000","phoneAllowed":true}');
  perform pg_temp.actor(chair);
  payload:=jsonb_build_object('members',array[first_member],'fields',array['name','phone']);
  preview:=pg_temp.room(phone_room,'preview_submit',payload);
  assert preview->'fields'='["name","phone"]'::jsonb;
  assert (preview->'members'->0)-'id'='{"name":"가상 회원 가","phone":"01055550000"}'::jsonb;
  assert pg_temp.room(phone_room,'submit',payload||jsonb_build_object('token',preview->>'token'))->>'submitted'='1';
  perform pg_temp.expect_error(format('select public.get_tournament_shared_roster(%L,%L)',phone_key,phone_room),'42501');
  perform pg_temp.actor(outsider);
  perform pg_temp.expect_error(format('select public.get_tournament_shared_roster(%L,%L)',phone_key,phone_room),'42501');
  assert not (public.get_tournament_signup(phone_key) ? 'sharedRosters');
  perform pg_temp.actor(organizer);
  info:=public.get_tournament_signup(phone_key);
  result:=public.get_tournament_shared_roster(phone_key,phone_room);
  assert result=info->'sharedRosters'->0 and result->'fields'='["name","phone"]'::jsonb;
  assert result->'members'='[{"name":"가상 회원 가","phone":"01055550000"}]'::jsonb;
  assert public.get_tournament_shared_roster(event_key,phone_room) is null;
  assert info->'roster'->0->>'phone'='01055550000';
  assert info->'roster'->0->>'club' is null and info->'roster'->0->>'clubId' is null
    and info->'roster'->0->>'division' is null;
  assert info->'roster'->0->'sources'->0->>'club' is null and info->'roster'->0->'sources'->0->>'division' is null;
  assert info->'roster'->0->'sources'->0->>'id' like 'room:%';
  payload:=jsonb_build_object('participant',info->'roster'->0->>'id','version',info->'roster'->0->>'version');
  perform pg_temp.expect_error(format('select public.mutate_tournament_signup(%L,%L,gen_random_uuid(),%L)',
    phone_key,'resolve',payload||jsonb_build_object('state',club)),'22023');
  perform public.mutate_tournament_signup(phone_key,'resolve',gen_random_uuid(),payload
    ||jsonb_build_object('state',info->'roster'->0->'sources'->0->>'id'));
  assert public.get_tournament_signup(phone_key)->'roster'->0->>'finalSource' like 'room:%';
  reset role;
  assert exists(select 1 from private.tournament_roster r where r.event_id=phone_event and r.user_id=first_member
    and r.club_id=club and r.division='시니어부' and r.active);
  update public.events set registration_status='closed' where id=phone_event;
  set local role authenticated;
  perform pg_temp.actor(organizer);
  assert public.mutate_tournament_signup(phone_key,'roster',gen_random_uuid(),'{}')->>'sent'='1';
  reset role;
  assert exists(select 1 from private.tournament_messages t join public.messaging_messages m on m.id=t.message_id
    where t.event_id=phone_event and t.purpose='roster' and m.body='격리 전화번호 선택 대회 · 신청 명단을 확인해 주세요.');
  set local role authenticated;
  perform pg_temp.actor(organizer);

  registration:=public.register_pul_tournament(gen_random_uuid(),
    event_data||'{"title":"격리 다부문 대회","divisions":["일반부","시니어부"]}');
  multi_key:=registration->>'key';
  reset role;
  select id into multi_event from public.events where public.events.event_key=multi_key;
  set local role authenticated;
  perform pg_temp.actor(chair);
  multi_room:=(pg_temp.room(null,'create',jsonb_build_object('kind','tournament','target',multi_event,'phoneAllowed',true))->>'roomId')::uuid;
  assert public.get_club_participation(null,multi_room)->'requiredFields'='["name","division"]'::jsonb;
  perform pg_temp.actor(second_member);
  perform pg_temp.room(multi_room,'respond','{"response":"yes","division":"일반부","consent":true,"seenName":"가상 회원 나"}');
  perform pg_temp.actor(chair);
  payload:=jsonb_build_object('members',array[second_member],'fields',array['name','phone']);
  perform pg_temp.expect_error(format('select pg_temp.room(%L,%L,%L)',multi_room,'preview_submit',payload),'22023');
  perform pg_temp.expect_error(format('select pg_temp.room(%L,%L,%L)',multi_room,'preview_submit',
    payload||'{"fields":["name","division","phone"]}'),'PT409');
  payload:=payload||'{"fields":["name","division"]}';
  preview:=pg_temp.room(multi_room,'preview_submit',payload);
  assert pg_temp.room(multi_room,'submit',payload||jsonb_build_object('token',preview->>'token'))->>'submitted'='1';
  perform pg_temp.actor(organizer);
  assert public.get_tournament_shared_roster(multi_key,multi_room)->'members'='[{"name":"가상 회원 나","division":"일반부"}]'::jsonb;
  assert public.get_tournament_signup(multi_key)->'roster'->0->>'phone' is null;

  -- M1: X shares only the name, then a separate legacy group Y becomes the final route.
  registration:=public.register_pul_tournament(gen_random_uuid(),event_data||'{"title":"격리 교차 동호회 대회"}');
  cross_key:=registration->>'key';
  reset role;
  select id into cross_event from public.events where public.events.event_key=cross_key;
  set local role authenticated;
  perform pg_temp.actor(chair);
  cross_room:=(pg_temp.room(null,'create',jsonb_build_object('kind','tournament','target',cross_event))->>'roomId')::uuid;
  perform pg_temp.actor(first_member);
  perform pg_temp.room(cross_room,'respond','{"response":"yes","consent":true,"seenName":"가상 회원 가"}');
  perform pg_temp.actor(chair);
  payload:=jsonb_build_object('members',array[first_member],'fields',array['name']);
  preview:=pg_temp.room(cross_room,'preview_submit',payload);
  assert pg_temp.room(cross_room,'submit',payload||jsonb_build_object('token',preview->>'token'))->>'submitted'='1';

  perform pg_temp.actor(y_chair);
  perform public.mutate_tournament_signup(cross_key,'poll',gen_random_uuid(),jsonb_build_object('club',y_club));
  perform pg_temp.actor(first_member);
  perform public.mutate_tournament_signup(cross_key,'respond',gen_random_uuid(),jsonb_build_object('club',y_club,'state','yes'));
  perform pg_temp.actor(y_chair);
  select p.value into info from jsonb_array_elements(public.get_tournament_signup(cross_key)->'polls') p(value)
  where p.value->>'clubId'=y_club::text;
  perform public.mutate_tournament_signup(cross_key,'group',gen_random_uuid(),
    jsonb_build_object('club',y_club,'version',info->'version','members',array[first_member]));

  perform pg_temp.actor(organizer);
  result:=public.get_tournament_signup(cross_key)->'roster'->0;
  assert result->>'conflict'='true';
  perform public.mutate_tournament_signup(cross_key,'resolve',gen_random_uuid(),
    jsonb_build_object('participant',result->>'id','version',result->'version','state',y_club));
  foreach actor in array array[y_chair,y_vice] loop
    perform pg_temp.actor(actor);
    info:=public.get_tournament_signup(cross_key);
    assert info->>'host'='false' and jsonb_array_length(info->'roster')=1;
    result:=info->'roster'->0;
    assert result->>'own'='false' and result->>'name'='가상 회원 가'
      and result->>'canEnter'='true' and result->>'clubId'=y_club::text
      and result->>'division'='시니어부' and result->>'finalSource'=y_club::text;
    assert result->'sources'='[]'::jsonb, 'M1: Y manager receives private X source metadata';
    assert strpos(info::text,'격리 참가 동호회"')=0 and strpos(info::text,club::text)=0;
  end loop;

  perform pg_temp.actor(first_member);
  info:=public.get_tournament_signup(cross_key);
  result:=info->'roster'->0;
  assert info->>'host'='false' and result->>'own'='true' and result->>'finalSource'=y_club::text;
  assert result->'sources' @> jsonb_build_array(
    jsonb_build_object('id',club,'club','격리 참가 동호회','division','시니어부'),
    jsonb_build_object('id',y_club,'club','격리 참가 동호회 Y','division','시니어부'));
  assert jsonb_array_length(result->'sources')=2;

  perform pg_temp.actor(organizer);
  info:=public.get_tournament_signup(cross_key);
  result:=info->'roster'->0;
  assert info->>'host'='true' and result->>'finalSource'=y_club::text;
  assert jsonb_array_length(result->'sources')=2 and result->'sources' @> jsonb_build_array(
    jsonb_build_object('id',y_club,'club','격리 참가 동호회 Y','division','시니어부'));
  select x.value into source from jsonb_array_elements(result->'sources') x(value) where x.value->>'id' like 'room:%';
  assert source is not null and source->>'club' is null and source->>'division' is null;
  assert info->'sharedRosters'->0->'fields'='["name"]'::jsonb
    and info->'sharedRosters'->0->'members'='[{"name":"가상 회원 가"}]'::jsonb;
  raise notice 'M1: Y chair and vice sources empty, member and organizer sources preserved';

  perform pg_temp.actor(first_member);
  perform pg_temp.expect_error(format('select pg_temp.room(%L,%L,%L)',t_room,'respond','{"response":"no"}'),'PT409');
  perform pg_temp.expect_error(format('select public.confirm_club_annual_award(%L,%L,%L,%L,%L)',
    'ops-club',season,'perfect','',first_member),'42501');
  perform pg_temp.actor(chair);
  assert (public.get_club_annual_activity('ops-club',season)->'recruitment'->0->>'count')::int=2;
  perform pg_temp.room(m_room,'close');
  perform pg_temp.actor(second_member);
  perform pg_temp.expect_error(format('select pg_temp.room(%L,%L,%L)',m_room,'respond','{"response":"no"}'),'PT409');

  reset role;
  update public.club_official_events set starts_at=now()-interval '1 hour',event_status='completed' where id=scheduled;
  update public.events e set start_date=day-1,end_date=null where e.id=event_id;
  set local role authenticated;
  perform pg_temp.actor(vice);
  round_data:=jsonb_build_object('date',day,'title','격리 월례회','eventId',scheduled,'course','격리 필드 구장','gameType','field',
    'comparison_basis','outdoor_18_single','rows',jsonb_build_array(jsonb_build_object('id',person,'kind','member','userId',first_member,'score',null)));
  saved:=public.save_club_monthly_scores('ops-club',gen_random_uuid(),round_data);
  assert saved ? 'id';
  info:=public.get_club_monthly_scores('ops-club',season,true);
  assert info->'sheets'->0->'rows'->0->>'userId'=first_member::text and info->'sheets'->0->'rows'->0->>'score' is null;
  assert public.confirm_club_annual_award('ops-club',season,'perfect','',first_member);
  assert public.confirm_club_annual_award('ops-club',season,'perfect','',first_member);
  assert jsonb_array_length(public.get_club_annual_activity('ops-club',season)->'awards')=1;
  perform pg_temp.actor(chair);
  perform pg_temp.room(m_room,'archive');
  perform pg_temp.room(t_room,'archive');
  info:=public.get_club_participation(null,t_room);
  assert info->>'archived'='true' and info->'submission'->>'count'='1' and jsonb_array_length(info->'notices')=3;
  assert jsonb_array_length(info->'members')=4;
  reset role;
end $$;

rollback;

