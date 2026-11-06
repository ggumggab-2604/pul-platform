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
    values(field_entry,a,photo,1,false,44,true) returning id into news;

  set local role anon;
  perform set_config('request.jwt.claim.sub','',true);
  perform pg_temp.expect_error(format('select public.find_cross_club_tournament_result(%L,%L,%L,%L)','hof-b',field,player,'일반부'),'42501');
  result:=public.get_hall_tournament_awards(yr,null,'hof-field') #> '{items,0,winners}';
  assert jsonb_array_length(result)=1 and result #>> '{0,name}'='김O명';
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',player::text,true);
  perform pg_temp.expect_error(format('select public.find_cross_club_tournament_result(%L,%L,%L,%L)','hof-b',field,player,'일반부'),'42501');
  perform set_config('request.jwt.claim.sub',b::text,true);
  perform pg_temp.expect_error(format('select public.find_cross_club_tournament_result(%L,%L,%L,%L)','hof-b',field,outsider,'일반부'),'42501');
  assert public.find_cross_club_tournament_result('hof-b',field,namesake,'일반부') is null;
  assert public.find_cross_club_tournament_result('hof-b',field,player,'시니어부') is null;
  assert public.find_cross_club_tournament_result('hof-b',other,player,'일반부') is null;
  original:=public.find_cross_club_tournament_result('hof-b',field,player,'일반부');
  assert original=jsonb_build_object('id',field_entry,'revision',revision,'place',1,'score',44,'tied',false,'eventKey','hof-field');
  perform pg_temp.expect_error(format('select public.save_club_tournament(%L,%L,%L)','hof-b',gen_random_uuid(),draft),'23505');
  entry:=roster||jsonb_build_object('cross_result',original||jsonb_build_object('revision',revision-1));
  perform pg_temp.expect_error(format('select public.save_club_tournament(%L,%L,%L)','hof-b',gen_random_uuid(),
    draft||jsonb_build_object('entries',jsonb_build_array(entry))),'PT409');
  entry:=roster||jsonb_build_object('cross_result',original,'attendance','absent','award','unconfirmed','place',null,'score',null);
  perform pg_temp.expect_error(format('select public.save_club_tournament(%L,%L,%L)','hof-b',gen_random_uuid(),
    draft||jsonb_build_object('entries',jsonb_build_array(entry))),'42501');
  entry:=roster||jsonb_build_object('cross_result',original);
  request_id:=gen_random_uuid();
  saved:=public.save_club_tournament('hof-b',request_id,draft||jsonb_build_object('entries',jsonb_build_array(entry)));
  b_sheet:=(saved->>'id')::uuid;
  assert public.save_club_tournament('hof-b',request_id,draft||jsonb_build_object('entries',jsonb_build_array(entry)))=saved||'{"replayed":true}'::jsonb;
  result:=public.get_club_tournaments('hof-b') #> '{tournaments,0,entries,0}';
  assert (result->>'linked')::boolean and (result->>'score')::int=44 and result->>'source_event_key'='hof-field';
  assert not (result?'source_entry_id');
  perform pg_temp.expect_error(format('select public.prepare_tournament_award_photo(%L,%L)',result->>'id','image/jpeg'),'42501');
  reset role;
  assert (select count(*)=1 from private.hall_confirmed_tournament_results where competition_id=field);
  assert (select count(*)=1 from private.public_personal_score_sources where linked_event_id=field);
  assert (select source_entry_id=field_entry and not confirmed and score is null and place is null
    from private.club_tournament_entries where tournament_id=b_sheet);

  set local role authenticated;
  perform set_config('request.jwt.claim.sub',c::text,true);
  entry:=roster||jsonb_build_object('score',46,'place',2,'tied',true,'cross_result',original||jsonb_build_object('reason','주최 자료 확인'));
  request_id:=gen_random_uuid();
  saved:=public.save_club_tournament('hof-c',request_id,draft||jsonb_build_object('entries',jsonb_build_array(entry)));
  c_sheet:=(saved->>'id')::uuid;
  assert public.save_club_tournament('hof-c',request_id,draft||jsonb_build_object('entries',jsonb_build_array(entry)))=saved||'{"replayed":true}'::jsonb;
  result:=public.get_club_tournaments('hof-c') #> '{tournaments,0,entries,0}';
  assert result->>'correction_status'='pending' and result->>'score' is null;
  assert (public.get_hall_tournament_awards(yr,null,'hof-field') #>> '{items,0,winners,0,score}')::int=44;
  assert (public.get_tournament_award_news(null,null,news) #>> '{0,score}')::int=44;
  perform pg_temp.expect_error(format('select public.save_club_tournament(%L,%L,%L)','hof-c',gen_random_uuid(),
    draft||jsonb_build_object('id',c_sheet,'version',1,'entries',jsonb_build_array(entry))),'PT409');

  perform set_config('request.jwt.claim.sub',a::text,true);
  q:=(public.get_club_tournaments('hof-a') #>> '{external_corrections,0,id}')::uuid;
  assert q is not null;
  perform pg_temp.expect_error(format('select public.save_club_tournament(%L,%L,%L)','hof-a',gen_random_uuid(),
    draft||jsonb_build_object('id',field_sheet,'version',2,'entries',jsonb_build_array(roster||jsonb_build_object('score',45)))),'PT409');
  perform set_config('request.jwt.claim.sub',c::text,true);
  perform pg_temp.expect_error(format('select public.review_pul_tournament_correction(%L,%L,true)','hof-field',q),'42501');
  perform set_config('request.jwt.claim.sub',a::text,true);
  perform public.review_pul_tournament_correction('hof-field',q,false);
  perform public.review_pul_tournament_correction('hof-field',q,false);
  perform pg_temp.expect_error(format('select public.review_pul_tournament_correction(%L,%L,true)','hof-field',q),'PT409');
  old_q:=q;
  assert (public.get_hall_tournament_awards(yr,null,'hof-field') #>> '{items,0,winners,0,score}')::int=44;

  perform set_config('request.jwt.claim.sub',c::text,true);
  perform public.save_club_tournament('hof-c',gen_random_uuid(),
    draft||jsonb_build_object('id',c_sheet,'version',1,'entries',jsonb_build_array(entry)));
  perform set_config('request.jwt.claim.sub',a::text,true);
  q:=(public.get_club_tournaments('hof-a') #>> '{external_corrections,0,id}')::uuid;
  assert q<>old_q;
  reset role;
  update public.events set publication_status='hidden' where id=field;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',b::text,true);
  assert public.find_cross_club_tournament_result('hof-b',field,player,'일반부') is null;
  assert public.get_club_tournaments('hof-b') #>> '{tournaments,0,entries,0,score}' is null;
  assert public.get_hall_tournament_awards(yr,null,'hof-field')->'items'='[]'::jsonb;
  assert public.get_tournament_award_news(null,null,news)='[]'::jsonb;
  perform pg_temp.expect_error(format('select public.get_tournament_award_photo(%L)',photo),'42501');
  perform set_config('request.jwt.claim.sub',a::text,true);
  perform pg_temp.expect_error(format('select public.review_pul_tournament_correction(%L,%L,true)','hof-field',q),'PT409');
  reset role;
  update public.events set publication_status='published' where id=field;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',a::text,true);
  perform public.review_pul_tournament_correction('hof-field',q,true);
  perform public.review_pul_tournament_correction('hof-field',q,true);
  result:=public.get_tournament_award_news(null,null,news)->0;
  assert (result->>'score')::int=46 and (result->>'place')::int=2 and (result->>'tied')::boolean and (result->>'confirmed')::boolean;
  result:=public.get_hall_tournament_awards(yr,null,'hof-field') #> '{items,0,winners,0}';
  assert (result->>'score')::int=46 and (result->>'place')::int=2 and (result->>'tied')::boolean;
  perform set_config('request.jwt.claim.sub',b::text,true);
  assert (public.get_club_tournaments('hof-b') #>> '{tournaments,0,entries,0,score}')::int=46;
  perform set_config('request.jwt.claim.sub',c::text,true);
  assert (public.get_club_tournaments('hof-c') #>> '{tournaments,0,entries,0,score}')::int=46;
  reset role;
  assert (select count(*)=2 from private.club_tournament_entries where source_entry_id=field_entry and score is null);
  assert (select result_revision=revision+1 from private.club_tournament_entries where id=field_entry);
  assert (select count(*)=1 from private.public_personal_score_sources where linked_event_id=field);

  -- A previously linked club can request another correction without losing the current projection.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',b::text,true);
  original:=public.find_cross_club_tournament_result('hof-b',field,player,'일반부');
  entry:=roster||jsonb_build_object('score',48,'place',2,'tied',true,'cross_result',original||jsonb_build_object('reason','연결 후 정정'));
  saved:=public.save_club_tournament('hof-b',gen_random_uuid(),
    draft||jsonb_build_object('id',b_sheet,'version',1,'entries',jsonb_build_array(entry)));
  result:=public.get_club_tournaments('hof-b') #> '{tournaments,0,entries,0}';
  assert result->>'correction_status'='pending' and (result->>'score')::int=46;
  perform set_config('request.jwt.claim.sub',a::text,true);
  q:=(public.get_club_tournaments('hof-a') #>> '{external_corrections,0,id}')::uuid;
  perform public.review_pul_tournament_correction('hof-field',q,true);
  perform set_config('request.jwt.claim.sub',b::text,true);
  result:=public.get_club_tournaments('hof-b') #> '{tournaments,0,entries,0}';
  assert result->>'correction_status'='approved' and (result->>'score')::int=48;
  reset role;

  -- A managed screen event publishes only after the organizer confirms; its review authority stays with the host.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',a::text,true);
  draft:=draft||jsonb_build_object('event_id',screen,'comparison_basis','other','entries',jsonb_build_array(roster));
  perform public.save_club_tournament('hof-a',gen_random_uuid(),draft);
  perform set_config('request.jwt.claim.sub',b::text,true);
  assert public.find_cross_club_tournament_result('hof-b',screen,player,'일반부') is null;
  result:=public.get_pul_tournament_host_results('hof-screen');
  screen_entry:=(result #>> '{entries,0,entry}')::uuid;
  perform public.finalize_pul_tournament_results('hof-screen',result->>'reviewToken');
  original:=public.find_cross_club_tournament_result('hof-b',screen,player,'일반부');
  assert (original->>'id')::uuid=screen_entry;
  perform set_config('request.jwt.claim.sub',c::text,true);
  entry:=roster||jsonb_build_object('score',49,'cross_result',original||jsonb_build_object('reason','스크린 자료 정정'));
  perform public.save_club_tournament('hof-c',gen_random_uuid(),draft||jsonb_build_object('entries',jsonb_build_array(entry)));
  perform set_config('request.jwt.claim.sub',b::text,true);
  q:=(public.get_pul_tournament_host_results('hof-screen') #>> '{corrections,0,id}')::uuid;
  perform set_config('request.jwt.claim.sub',a::text,true);
  perform pg_temp.expect_error(format('select public.review_pul_tournament_correction(%L,%L,true)','hof-screen',q),'42501');
  perform set_config('request.jwt.claim.sub',b::text,true);
  perform public.review_pul_tournament_correction('hof-screen',q,true);
  result:=public.get_hall_tournament_awards(yr,null,'hof-screen') #> '{items,0}';
  assert result->>'gameType'='screen' and (result #>> '{winners,0,score}')::int=49;
  reset role;
  assert not exists (select 1 from private.public_personal_score_sources where linked_event_id=screen);
  raise notice 'PASS: authorization, identity, same-value links, stale preview, no duplicates, pending/reject/approve/retry, event hiding, news sync, host and external review';
end
$$;
rollback;
