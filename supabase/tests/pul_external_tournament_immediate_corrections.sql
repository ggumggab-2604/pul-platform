-- Run as postgres on a migrated local Supabase database: psql -X -v ON_ERROR_STOP=1 -f this-file.sql
-- Fixtures are synthetic and rolled back; exercise RPCs with the same authenticated/anon roles as PostgREST.
begin;
set local plpgsql.check_asserts = on;

create function pg_temp.expect_error(command text, code text) returns void language plpgsql as $$
begin
  execute command;
  raise exception 'expected SQLSTATE %, got success',code;
exception when others then
  if sqlstate<>code then raise; end if;
end
$$;

do $$
declare
  a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid();
  player uuid:=gen_random_uuid(); namesake uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid();
  club_a uuid:=gen_random_uuid(); club_b uuid:=gen_random_uuid(); club_c uuid:=gen_random_uuid();
  field uuid:=gen_random_uuid(); screen uuid:=gen_random_uuid(); other uuid:=gen_random_uuid();
  field_entry uuid; field_sheet uuid; b_sheet uuid; c_sheet uuid; screen_entry uuid; news uuid; photo uuid;
  former uuid:=gen_random_uuid(); platform_user uuid:=gen_random_uuid();
  before_payload jsonb; rank_row jsonb; message_id uuid; reply_id uuid; total_messages integer;
  withdrawal_case record;
  revision integer; q uuid; old_q uuid; request_id uuid;
  original jsonb; roster jsonb; entry jsonb; draft jsonb; saved jsonb; result jsonb;
  played date:=(statement_timestamp() at time zone 'Asia/Seoul')::date;
  yr integer:=extract(year from played);
begin
  insert into auth.users(id,instance_id,aud,role,email,created_at,updated_at)
    select u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',u||'@hof-local.test',now(),now()
    from unnest(array[a,b,c,player,namesake,outsider]) u;
  insert into public.user_accounts(id,platform_role,account_status)
    select u,'member','active' from unnest(array[a,b,c,player,namesake,outsider]) u on conflict (id) do nothing;
  insert into public.user_profiles(user_id,display_name,profile_visibility)
    select u,case when u in (player,namesake) then '김동명' else '테스트 회원' end,'private'
    from unnest(array[a,b,c,player,namesake,outsider]) u on conflict (user_id) do update set display_name=excluded.display_name,profile_visibility=excluded.profile_visibility;
  insert into public.consent_records(user_id,consent_type,consent_version,decision)
    select u,v.kind,v.version,'granted' from unnest(array[a,b,c,player,namesake,outsider]) u
    cross join (values ('terms_required','terms-dev-v1'),('privacy_required','privacy-dev-v1')) v(kind,version);
  insert into public.clubs(id,legacy_key,name,club_status,directory_is_public) values
    (club_a,'hof-a','원본 동호회','active',true),(club_b,'hof-b','연결 동호회','active',true),(club_c,'hof-c','요청 동호회','active',false);
  insert into public.club_memberships(club_id,user_id,membership_status) values
    (club_a,a,'active'),(club_b,b,'active'),(club_c,c,'active'),
    (club_a,player,'active'),(club_b,player,'active'),(club_c,player,'active'),(club_b,namesake,'active'),(club_a,outsider,'active');
  set local session_replication_role=replica;
  insert into public.club_role_assignments(membership_id,role_code,assigned_by)
    select id,'club_admin',user_id from public.club_memberships where user_id in(a,b,c);
  set local session_replication_role=origin;
  insert into public.events(id,event_key,title,match_type,event_scale,region,venue_name,venue_type,start_date,
    registration_status,target_audience,organizer,summary,publication_status,created_by,updated_by)
  values (field,'hof-field','테스트 필드','field','friendly','경기','시험 구장','field',played,'ended',array['회원'],'외부 주최','격리 테스트용 대회 안내','published',a,a),
    (screen,'hof-screen','테스트 스크린','screen','store','경기','시험 매장','screen',played,'ended',array['회원'],'PUL 주최','격리 테스트용 대회 안내','published',b,b),
    (other,'hof-other','독립 대회','field','friendly','경기','시험 구장','field',played,'ended',array['회원'],'외부 주최','격리 테스트용 대회 안내','published',a,a);
  insert into private.tournament_hosts(event_id,played_course_name,host_club_id)
    values (field,'필드 코스',null),(screen,'스크린 코스',club_b);
  roster:=jsonb_build_object('user_id',player,'display_name','ignored','division','일반부','intent','group',
    'registration','complete','attendance','attended','award','yes','place',1,'score',44,'tied',false);
  draft:=jsonb_build_object('title','테스트 필드','played_on',played,'course_name','시험 구장','event_id',field,
    'divisions',jsonb_build_array('일반부','시니어부'),'comparison_basis','outdoor_18_single','entries',jsonb_build_array(roster));

  set local role authenticated;
  perform set_config('request.jwt.claim.sub',a::text,true);
  field_sheet:=(public.save_club_tournament('hof-a',gen_random_uuid(),draft)->>'id')::uuid;
  result:=public.get_club_tournaments('hof-a') #> '{tournaments,0,entries,0}';
  field_entry:=(result->>'id')::uuid;
  revision:=(result->>'result_revision')::int;
  perform public.save_club_tournament('hof-a',gen_random_uuid(),draft||jsonb_build_object('id',field_sheet,'version',1,'note','기존 값 재저장'));
  reset role;
  insert into private.tournament_award_photos(entry_id,owner_id,object_path,mime,ready)
    values(field_entry,a,'hof-test-photo','image/jpeg',true) returning id into photo;
  insert into private.tournament_award_news(entry_id,author_id,photo_id,place,tied,score,confirmed)
    values(field_entry,a,photo,1,false,44,false) returning id into news;


  insert into auth.users(id,instance_id,aud,role,email,created_at,updated_at)
    select u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',u||'@hof-local.test',now(),now()
    from unnest(array[former,platform_user]) u;
  insert into public.user_accounts(id,platform_role,account_status)
    values(former,'member','active'),(platform_user,'platform_admin','active')
    on conflict(id) do update set platform_role=excluded.platform_role;
  insert into public.user_profiles(user_id,display_name)
    values(former,'전 운영진'),(platform_user,'플랫폼 관리자') on conflict(user_id) do nothing;
  insert into public.consent_records(user_id,consent_type,consent_version,decision)
    select u,v.kind,v.version,'granted' from unnest(array[former,platform_user]) u
    cross join (values ('terms_required','terms-dev-v1'),('privacy_required','privacy-dev-v1')) v(kind,version);
  insert into public.club_memberships(club_id,user_id,membership_status) values(club_a,former,'active');
  set local session_replication_role=replica;
  insert into public.club_role_assignments(membership_id,role_code,assigned_by,revoked_at,revoked_by)
    select id,'club_vice_admin',a,case when user_id=former then now() end,case when user_id=former then a end
    from public.club_memberships where club_id=club_a and user_id in(former,outsider);
  set local session_replication_role=origin;

  -- A second source participant and another club's official score keep ranking checks meaningful.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',a::text,true);
  result:=public.get_club_tournaments('hof-a') #> '{tournaments,0}';
  perform public.save_club_tournament('hof-a',gen_random_uuid(),draft||jsonb_build_object(
    'id',field_sheet,'version',(result->>'version')::int,'entries',jsonb_build_array(roster,
      roster||jsonb_build_object('user_id',outsider,'place',3,'score',65))));
  perform set_config('request.jwt.claim.sub',b::text,true);
  perform public.save_club_tournament('hof-b',gen_random_uuid(),draft||jsonb_build_object(
    'event_id',other,'entries',jsonb_build_array(roster||jsonb_build_object('user_id',namesake,'score',50))));
  original:=public.find_cross_club_tournament_result('hof-b',field,player,'일반부');
  saved:=public.save_club_tournament('hof-b',gen_random_uuid(),draft||jsonb_build_object(
    'entries',jsonb_build_array(roster||jsonb_build_object('cross_result',original))));
  b_sheet:=(saved->>'id')::uuid;
  result:=public.get_tournament_award_news(null,null,news)->0;
  before_payload:=jsonb_build_object('id',news,'version',(result->>'version')::int,
    'tournament_version',(result->>'tournament_version')::int);

  -- A score correction keeping every national/official rank sends replyable notices and completes immediately.
  perform set_config('request.jwt.claim.sub',c::text,true);
  original:=public.find_cross_club_tournament_result('hof-c',field,player,'일반부');
  entry:=roster||jsonb_build_object('score',45,'cross_result',original||jsonb_build_object('reason','타수 원장 재확인'));
  request_id:=gen_random_uuid();
  saved:=public.save_club_tournament('hof-c',request_id,draft||jsonb_build_object('entries',jsonb_build_array(entry)));
  c_sheet:=(saved->>'id')::uuid;
  assert public.save_club_tournament('hof-c',request_id,draft||jsonb_build_object('entries',jsonb_build_array(entry)))=saved||'{"replayed":true}'::jsonb;
  perform pg_temp.expect_error(format('select public.save_club_tournament(%L,%L,%L)','hof-c',gen_random_uuid(),
    draft||jsonb_build_object('id',c_sheet,'version',1,'entries',jsonb_build_array(entry))),'PT409');
  result:=public.get_club_tournaments('hof-c') #> '{tournaments,0,entries,0}';
  assert (result->>'score')::int=45 and (result->>'place')::int=1 and not (result->>'approval_pending')::boolean;
  reset role;
  assert (select count(*)=2 from private.tournament_correction_messages);
  assert not exists(select 1 from private.tournament_result_corrections where status='pending');
  assert (select count(*)=2 from public.messaging_messages where body like '%착오나 문제가 있으면 이 쪽지에 답장해 주세요%');
  select n.message_id into message_id from private.tournament_correction_messages n
    join public.messaging_recipients r on r.message_id=n.message_id where r.recipient_user_id=outsider;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',outsider::text,true);
  assert (public.list_messaging_inbox()->'items') @> jsonb_build_array(jsonb_build_object('id',message_id));
  assert public.get_messaging_message(message_id,false)->>'body' like '%변경 전 1위 · 44타%변경 후 1위 · 45타%';
  request_id:=gen_random_uuid();
  saved:=public.reply_messaging_message(message_id,'원장 대조했습니다. 감사합니다.',request_id);
  assert public.reply_messaging_message(message_id,'원장 대조했습니다. 감사합니다.',request_id)=saved;
  reply_id:=(saved->>'id')::uuid;
  perform set_config('request.jwt.claim.sub',c::text,true);
  assert (public.list_messaging_inbox()->'items') @> jsonb_build_array(jsonb_build_object('id',reply_id));
  raise notice 'PASS same-rank immediate/link sync, two current officers notified, receive/reply and replay without duplicates';

  -- Score-only changes use the existing national formulas and never infer tournament medals.
  original:=public.find_cross_club_tournament_result('hof-c',field,player,'일반부');
  result:=public.get_club_tournaments('hof-c') #> '{tournaments,0}';
  entry:=roster||jsonb_build_object('score',55,'cross_result',original||jsonb_build_object('reason','전국 순위 변경 타수 정정'));
  perform public.save_club_tournament('hof-c',gen_random_uuid(),draft||jsonb_build_object(
    'id',c_sheet,'version',(result->>'version')::int,'entries',jsonb_build_array(entry)));
  perform set_config('request.jwt.claim.sub',a::text,true);
  q:=(public.get_club_tournaments('hof-a') #>> '{external_corrections,0,id}')::uuid;
  assert q is not null;
  reset role;
  assert (select place=1 and award='yes' and score=55 from private.club_tournament_entries where id=field_entry);
  assert (select count(*)=2 from private.tournament_correction_messages where correction_id=q);
  select n.message_id into message_id from private.tournament_correction_messages n
    join public.messaging_recipients r on r.message_id=n.message_id where n.correction_id=q and r.recipient_user_id=a;
  set local role anon;
  perform set_config('request.jwt.claim.sub','',true);
  select value into rank_row from jsonb_array_elements(public.get_hall_national_scores('all')->'items') where (value->>'score')::int=55;
  assert rank_row->>'rank'='2' and (rank_row->>'approvalPending')::boolean and rank_row->>'name'='김O명';
  result:=public.get_hall_tournament_awards(yr,null,'hof-field') #> '{items,0,winners,0}';
  assert result->>'place'='1' and result->>'score'='55' and (result->>'approvalPending')::boolean;
  result:=public.get_tournament_award_news(null,null,news)->0;
  assert result->>'score'='55' and (result->>'approval_pending')::boolean;
  assert not (result->>'can_confirm')::boolean;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',a::text,true);
  assert public.get_tournament_correction_message(message_id)->>'id'=q::text;
  perform pg_temp.expect_error(format('select public.confirm_tournament_award_news(%L,%L)',gen_random_uuid(),before_payload),'PT409');
  perform pg_temp.expect_error(format('select public.confirm_tournament_award_news(%L,%L)',gen_random_uuid(),
    jsonb_build_object('id',news,'version',(result->>'version')::int,'tournament_version',(result->>'tournament_version')::int)),'PT409');
  perform set_config('request.jwt.claim.sub',player::text,true);
  perform pg_temp.expect_error(format('select public.save_club_tournament(%L,%L,%L)','hof-c',gen_random_uuid(),draft),'42501');
  perform pg_temp.expect_error(format('select public.review_pul_tournament_correction(%L,%L,true)','hof-field',q),'42501');
  perform set_config('request.jwt.claim.sub',former::text,true);
  perform pg_temp.expect_error(format('select public.review_pul_tournament_correction(%L,%L,true)','hof-field',q),'42501');
  perform set_config('request.jwt.claim.sub',platform_user::text,true);
  perform pg_temp.expect_error(format('select public.review_pul_tournament_correction(%L,%L,true)','hof-field',q),'42501');
  perform set_config('request.jwt.claim.sub',c::text,true);
  perform pg_temp.expect_error(format('select public.review_pul_tournament_correction(%L,%L,true)','hof-field',q),'42501');
  assert public.get_tournament_correction_message(message_id) is null;
  perform set_config('request.jwt.claim.sub',outsider::text,true);
  perform public.review_pul_tournament_correction('hof-field',q,true);
  perform public.review_pul_tournament_correction('hof-field',q,true);
  perform pg_temp.expect_error(format('select public.review_pul_tournament_correction(%L,%L,false,%L)','hof-field',q,'승인 뒤 반려'),'PT409');
  result:=public.get_tournament_award_news(null,null,news)->0;
  assert result->>'score'='55' and not (result->>'approval_pending')::boolean;
  raise notice 'PASS national rank change flags immediately, score-only official medal preserved, current VP approval and role/retry guards';

  -- Reject only this source, preserving an intervening edit to a different participant.
  perform set_config('request.jwt.claim.sub',b::text,true);
  original:=public.find_cross_club_tournament_result('hof-b',field,player,'일반부');
  select value into result from jsonb_array_elements(public.get_club_tournaments('hof-b')->'tournaments') where value->>'id'=b_sheet::text;
  entry:=roster||jsonb_build_object('score',55,'place',2,'tied',true,
    'cross_result',original||jsonb_build_object('reason','공동 공식 순위 변경'));
  perform public.save_club_tournament('hof-b',gen_random_uuid(),draft||jsonb_build_object(
    'id',b_sheet,'version',(result->>'version')::int,'entries',jsonb_build_array(entry)));
  perform set_config('request.jwt.claim.sub',a::text,true);
  q:=(public.get_club_tournaments('hof-a') #>> '{external_corrections,0,id}')::uuid;
  result:=public.get_club_tournaments('hof-a') #> '{tournaments,0}';
  perform public.save_club_tournament('hof-a',gen_random_uuid(),draft||jsonb_build_object(
    'id',field_sheet,'version',(result->>'version')::int,'note','검토 중 다른 회원 타수 정정',
    'entries',jsonb_build_array(roster||jsonb_build_object('score',55,'place',2,'tied',true),
      roster||jsonb_build_object('user_id',outsider,'place',3,'score',64))));
  result:=public.get_club_tournaments('hof-a') #> '{tournaments,0}';
  perform pg_temp.expect_error(format('select public.save_club_tournament(%L,%L,%L)','hof-a',gen_random_uuid(),
    draft||jsonb_build_object('id',field_sheet,'version',(result->>'version')::int,
      'entries',jsonb_build_array(roster||jsonb_build_object('score',56,'place',2,'tied',true)))),'PT409');
  perform pg_temp.expect_error(format('select public.review_pul_tournament_correction(%L,%L,false)','hof-field',q),'22023');
  perform public.review_pul_tournament_correction('hof-field',q,false,'공식 원장에 공동 순위 없음');
  perform public.review_pul_tournament_correction('hof-field',q,false,'공식 원장에 공동 순위 없음');
  perform pg_temp.expect_error(format('select public.review_pul_tournament_correction(%L,%L,false,%L)','hof-field',q,'다른 사유'),'PT409');
  reset role;
  assert (select place=1 and score=55 and not tied from private.club_tournament_entries where id=field_entry);
  assert (select score=64 from private.club_tournament_entries e join private.club_score_people p on p.id=e.person_id
    where e.tournament_id=field_sheet and p.user_id=outsider);
  assert (select rejection_reason='공식 원장에 공동 순위 없음' from private.tournament_result_corrections where id=q);
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',c::text,true);
  result:=public.get_club_tournaments('hof-c') #> '{tournaments,0,entries,0}';
  assert result->>'place'='1' and result->>'score'='55' and not (result->>'tied')::boolean;
  raise notice 'PASS official/tied post-review rejection restores only source, preserves another participant, reason and retry checks';

  -- Four-or-lower temporarily hides news. Reject restores its prior visibility and verified numbers.
  original:=public.find_cross_club_tournament_result('hof-c',field,player,'일반부');
  result:=public.get_club_tournaments('hof-c') #> '{tournaments,0}';
  entry:=roster||jsonb_build_object('score',55,'place',4,'award','no',
    'cross_result',original||jsonb_build_object('reason','4위 정정 사진 공개 검증'));
  perform public.save_club_tournament('hof-c',gen_random_uuid(),draft||jsonb_build_object(
    'id',c_sheet,'version',(result->>'version')::int,'entries',jsonb_build_array(entry)));
  perform set_config('request.jwt.claim.sub',a::text,true);
  assert public.get_tournament_award_news(null,null,news)='[]'::jsonb;
  perform pg_temp.expect_error(format('select public.confirm_tournament_award_news(%L,%L)',gen_random_uuid(),before_payload),'42501');
  q:=(public.get_club_tournaments('hof-a') #>> '{external_corrections,0,id}')::uuid;
  perform public.review_pul_tournament_correction('hof-field',q,false,'입상 원장으로 복원');
  result:=public.get_tournament_award_news(null,null,news)->0;
  assert result->>'score'='55' and result->>'place'='1' and not (result->>'confirmed')::boolean;
  perform pg_temp.expect_error(format('select public.confirm_tournament_award_news(%L,%L)',gen_random_uuid(),before_payload),'PT409');
  saved:=jsonb_build_object('id',news,'version',(result->>'version')::int,
    'tournament_version',(result->>'tournament_version')::int);
  perform public.confirm_tournament_award_news(gen_random_uuid(),saved);
  reset role;
  assert (select place=1 and score=55 and not tied from private.club_tournament_entries where id=field_entry);
  assert (select place=1 and score=55 and not tied and confirmed from private.tournament_award_news where id=news);
  raise notice 'PASS four-or-lower public hiding/rejection restoration and L1 stale/fresh confirmation without rollback';

  -- A notification error rolls back the score, sheet version and audit together.
  insert into public.messaging_blocks(blocker_user_id,blocked_user_id) values(a,c);
  select count(*) into total_messages from private.tournament_correction_messages;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',c::text,true);
  original:=public.find_cross_club_tournament_result('hof-c',field,player,'일반부');
  result:=public.get_club_tournaments('hof-c') #> '{tournaments,0}';
  entry:=roster||jsonb_build_object('score',54,'cross_result',original||jsonb_build_object('reason','알림 실패 원자성 검증'));
  perform pg_temp.expect_error(format('select public.save_club_tournament(%L,%L,%L)','hof-c',gen_random_uuid(),
    draft||jsonb_build_object('id',c_sheet,'version',(result->>'version')::int,'entries',jsonb_build_array(entry))),'PT409');
  assert (public.get_club_tournaments('hof-c') #>> '{tournaments,0,version}')::int=(result->>'version')::int;
  reset role;
  assert (select count(*)=total_messages from private.tournament_correction_messages);
  assert (select score=55 from private.club_tournament_entries where id=field_entry);
  assert not exists(select 1 from private.tournament_result_corrections where status='pending');
  raise notice 'PASS notification failure atomically preserves score, sheet version, audit and message count';

  delete from public.messaging_blocks where blocker_user_id=a and blocked_user_id=c;
  for withdrawal_case in select * from (values (2,former),(4,namesake)) as cases(place,author) loop
    -- The photographer is a different account from the active athlete.
    update private.tournament_award_news set author_id=withdrawal_case.author,hidden=false,version=version+1 where id=news;
    update private.tournament_award_photos set owner_id=withdrawal_case.author where id=photo;
    set local role authenticated;
    perform set_config('request.jwt.claim.sub',c::text,true);
    original:=public.find_cross_club_tournament_result('hof-c',field,player,'일반부');
    result:=public.get_club_tournaments('hof-c') #> '{tournaments,0}';
    entry:=roster||jsonb_build_object('score',56,'place',withdrawal_case.place,
      'award',case when withdrawal_case.place<=3 then 'yes' else 'no' end,
      'cross_result',original||jsonb_build_object('reason','작성자 탈퇴 뒤 반려'));
    perform public.save_club_tournament('hof-c',gen_random_uuid(),draft||jsonb_build_object(
      'id',c_sheet,'version',(result->>'version')::int,'entries',jsonb_build_array(entry)));
    reset role;
    assert (select hidden=(withdrawal_case.place>3) from private.tournament_award_news where id=news);
    update public.user_accounts set account_status='withdrawn' where id=withdrawal_case.author;
    assert (select hidden from private.tournament_award_news where id=news);
    set local role authenticated;
    perform set_config('request.jwt.claim.sub',a::text,true);
    q:=(public.get_club_tournaments('hof-a') #>> '{external_corrections,0,id}')::uuid;
    perform public.review_pul_tournament_correction('hof-field',q,false,'확정된 입상 원장 복원');
    set local role anon;
    perform set_config('request.jwt.claim.sub','',true);
    assert public.get_tournament_award_news('hof-a')='[]'::jsonb;
    assert public.get_tournament_award_news(null,null,news)='[]'::jsonb;
    perform pg_temp.expect_error(format('select public.get_tournament_award_photo(%L)',photo),'42501');
    reset role;
    assert (select place=1 and score=55 and award='yes' from private.club_tournament_entries where id=field_entry);
    assert (select hidden and place=1 and score=55 from private.tournament_award_news where id=news);
  end loop;
  raise notice 'M1 PASS: author withdrawal survives rejection with and without overlapping rank-based hiding';
end
$$;
rollback;
