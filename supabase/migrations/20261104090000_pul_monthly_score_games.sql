alter table private.club_monthly_sheets
 add column game_type text check (game_type in ('field','screen'));

create unique index club_monthly_one_sheet_per_event
 on private.club_monthly_sheets(event_id) where event_id is not null;
create index club_monthly_sheets_club_date on private.club_monthly_sheets(club_id,played_on);
drop index private.club_monthly_one_sheet;

create or replace function public.get_club_monthly_scores(p_club_key text,p_year integer,p_editor boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c uuid; result jsonb; begin
 c:=private.monthly_club(p_club_key,p_editor);
 if p_year is null or p_year not between 1 and 9999 then raise exception '연도를 확인해 주세요.' using errcode='22023'; end if;
 select jsonb_build_object('clubKey',p_club_key,'clubName',(select name from public.clubs where id=c),
 'year',p_year,'canEdit',private.club_user_is_active_admin_or_vice_admin(auth.uid(),c),
 'sheets',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'date',s.played_on,'title',s.title,'course',s.course_name,
 'courseKey',(select course_key from public.courses where id=s.course_id),'linkedCourse',(select name from public.courses where id=s.course_id),'eventId',s.event_id,'gameType',s.game_type,
 'medalEligible',s.event_id is null or (e.event_type='monthly_meeting' and e.event_status not in ('draft','cancelled') and e.moderation_status='visible'),
 'comparison_basis',s.comparison_basis,'note',s.note,'version',s.version,'rows',coalesce((select jsonb_agg(jsonb_build_object(
 'id',p.id,'userId',p.user_id,'kind',p.kind,'name',r.display_name,'score',r.strokes) || case when p_editor then jsonb_build_object('gender',r.saved_gender,'anonymized',p.anonymized) else '{}'::jsonb end order by r.display_name,p.id)
 from private.club_monthly_scores r join private.club_score_people p on p.id=r.person_id where r.sheet_id=s.id and not r.excluded),'[]'::jsonb)) order by s.played_on,s.id)
 from private.club_monthly_sheets s left join public.club_official_events e on e.id=s.event_id
 where s.club_id=c and extract(year from s.played_on)=p_year),'[]'::jsonb),
 'pendingMedalEvents',coalesce((select jsonb_agg(jsonb_build_object(
 'date',(e.starts_at at time zone 'Asia/Seoul')::date,'gameType',co.course_type) order by e.starts_at,e.id)
 from public.club_official_events e left join public.courses co on co.course_key=e.linked_course_legacy_key and co.course_status<>'removed'
 where e.club_id=c and e.event_type='monthly_meeting' and e.event_status not in ('draft','cancelled') and e.moderation_status='visible'
 and extract(year from e.starts_at at time zone 'Asia/Seoul')=p_year
 and (e.event_status='completed' or (e.starts_at at time zone 'Asia/Seoul')::date <= (now() at time zone 'Asia/Seoul')::date)
 and not exists(select 1 from private.club_monthly_sheets s where s.event_id=e.id)),'[]'::jsonb)) into result;
 if p_editor then
 result:=result||jsonb_build_object(
 'members',coalesce((select jsonb_agg(jsonb_build_object('userId',m.user_id,'name',coalesce(nullif(btrim(p.display_name),''),'이름 미등록'),
 'id',sp.id,'gender',coalesce(b.gender,sp.monthly_gender),'canSupplement',b.gender is null) order by p.display_name,m.user_id) from public.club_memberships m join public.user_accounts a on a.id=m.user_id
 join public.user_profiles p on p.user_id=a.id left join private.club_score_people sp on sp.club_id=c and sp.user_id=m.user_id
 left join private.member_basics b on b.user_id=m.user_id
 where m.club_id=c and not coalesce(sp.anonymized,false) and m.membership_status='active' and a.account_status='active'),'[]'::jsonb),
 'manualPeople',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',n.display_name,'kind','manual','userId',null,'gender',p.monthly_gender,'canSupplement',true))
 from private.club_score_people p join lateral(select r.display_name from private.club_monthly_scores r join private.club_monthly_sheets s on s.id=r.sheet_id
 where r.person_id=p.id order by s.played_on desc limit 1)n on true where p.club_id=c and p.kind='manual' and not p.anonymized),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'date',(e.starts_at at time zone 'Asia/Seoul')::date,
 'courseKey',e.linked_course_legacy_key,'gameType',case when co.course_status<>'removed' then co.course_type end,'version',e.version,'course',coalesce(co.name,e.location)) order by e.starts_at) from public.club_official_events e left join public.courses co on co.course_key=e.linked_course_legacy_key
 where e.club_id=c and e.event_type='monthly_meeting' and e.event_status not in ('draft','cancelled') and e.moderation_status='visible'
 and extract(year from e.starts_at at time zone 'Asia/Seoul')=p_year),'[]'::jsonb));
 end if;
 return result;
end $$;

create or replace function public.save_club_monthly_scores(p_club_key text,p_request_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c uuid; actor uuid:=auth.uid(); s private.club_monthly_sheets; person private.club_score_people;
 prior jsonb; result jsonb; request_input jsonb; d date; sid uuid; pid uuid; uid uuid; item jsonb; n text; old_name text; kept uuid[]:='{}'; selected_course uuid; account_gender text; target_status text; correction jsonb; reason text;
 schedule_id uuid; schedule_course_key text; known_game_type text; requested_game_type text; selected_game_type text;
begin
 perform private.messaging_assert_read_committed();
 c:=private.monthly_club(p_club_key,true);
 -- Match existing club writes: serialize against membership/role revocation before rechecking.
 perform id from public.clubs where id=c for update;
 perform id from public.user_accounts where id=actor for share;
 perform user_id from public.user_profiles where user_id=actor for share;
 perform id from public.consent_records where user_id=actor for share;
 perform id from public.club_memberships where club_id=c and user_id=actor for share;
 perform id from public.club_role_assignments where membership_id in(select id from public.club_memberships where club_id=c and user_id=actor) for share;
 perform role_code from public.club_role_definitions where role_code in ('club_admin','club_vice_admin') for share;
 c:=private.monthly_club(p_club_key,true);
 if p_request_id is null or p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception '저장 요청을 확인해 주세요.' using errcode='22023';end if;
 request_input:=jsonb_build_object('club',c,'payload',p_payload);
 prior:=private.club_extension_previous(actor,p_request_id,'monthly.save',request_input);
 if prior is not null then return prior;end if;
 if p_payload->>'date' is null or p_payload->>'date' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception '경기 날짜를 확인해 주세요.' using errcode='22023';end if;
 d:=(p_payload->>'date')::date;
 if jsonb_typeof(p_payload->'rows') is distinct from 'array' or jsonb_array_length(p_payload->'rows')=0 then raise exception '참가자를 선택해 주세요.' using errcode='22023';end if;
 if p_payload->>'title' is null or length(btrim(p_payload->>'title')) not between 1 and 120
 or p_payload->>'course' is null or length(btrim(p_payload->>'course')) not between 1 and 200
 or length(coalesce(p_payload->>'note',''))>4000 then raise exception '경기명·구장·비고를 확인해 주세요.' using errcode='22023';end if;
 sid:=nullif(p_payload->>'id','')::uuid;
 if sid is not null then
  select * into s from private.club_monthly_sheets where id=sid and club_id=c for update;
  if not found then raise exception '이 동호회의 성적표가 아닙니다.' using errcode='42501';end if;
  if s.version is distinct from (p_payload->>'version')::integer then raise exception '다른 수정이 먼저 저장되었습니다. 새로 불러온 뒤 다시 수정해 주세요.' using errcode='PT409';end if;
  if date_trunc('month',s.played_on)<>date_trunc('month',d) then raise exception '기존 성적표의 월은 변경할 수 없습니다.' using errcode='22023';end if;
 end if;
 schedule_id:=nullif(p_payload->>'eventId','')::uuid;
 if schedule_id is not null then
  select e.linked_course_legacy_key into schedule_course_key
  from public.club_official_events e
  where e.id=schedule_id and e.club_id=c and e.event_type='monthly_meeting'
  and e.event_status not in ('draft','cancelled') and e.moderation_status='visible'
  and date_trunc('month',e.starts_at at time zone 'Asia/Seoul')=date_trunc('month',d)
  for share of e;
  if not found and schedule_id is distinct from s.event_id then
   raise exception '해당 월의 월례회 일정을 선택해 주세요.' using errcode='22023';
  end if;
 end if;
 if p_payload?'courseKey' then
  if nullif(p_payload->>'courseKey','') is not null then
   select id into selected_course from public.courses where course_key=p_payload->>'courseKey' and (course_status<>'removed' or id=s.course_id);
   if not found then raise exception '실제 개최 구장을 다시 선택해 주세요.' using errcode='22023';end if;
  end if;
 else selected_course:=s.course_id;end if;
 perform private.score_course_check(selected_course,null,schedule_id,p_payload->'course_confirmation',s.course_id);
 if selected_course is not null then
  select course_type into known_game_type from public.courses where id=selected_course;
 elsif schedule_course_key is not null then
  select course_type into known_game_type from public.courses
  where course_key=schedule_course_key and course_status<>'removed' for share;
 end if;
 requested_game_type:=p_payload->>'gameType';
 if requested_game_type is not null and known_game_type is not null and requested_game_type<>known_game_type then
  raise exception '경기 종류가 확인된 구장 또는 일정과 일치하지 않습니다.' using errcode='22023';
 end if;
 -- A legacy edit without classification keeps an unclassified original when its references stay the same.
 selected_game_type:=coalesce(requested_game_type,
  case when sid is null or s.game_type is not null
    or selected_course is distinct from s.course_id or schedule_id is distinct from s.event_id
   then known_game_type end,s.game_type);
 if (selected_game_type is null and sid is null) or (selected_game_type is not null and selected_game_type not in ('field','screen')) then
  raise exception '18홀 경기 종류(필드 또는 스크린)를 선택해 주세요.' using errcode='22023';
 end if;
 if coalesce(known_game_type,selected_game_type)='screen' and coalesce(p_payload->>'comparison_basis',s.comparison_basis)='outdoor_18_single' then
  raise exception '스크린 경기의 최저타 비교 기준을 확인해 주세요.' using errcode='22023';
 end if;
 if sid is null then
  insert into private.club_monthly_sheets(club_id,played_on,title,course_name,event_id,note,comparison_basis,course_id,game_type)
  values(c,d,btrim(p_payload->>'title'),btrim(p_payload->>'course'),schedule_id,coalesce(p_payload->>'note',''),coalesce(p_payload->>'comparison_basis','unconfirmed'),selected_course,selected_game_type) returning * into s;
 else
  update private.club_monthly_sheets set course_id=selected_course,played_on=d,title=btrim(p_payload->>'title'),course_name=btrim(p_payload->>'course'),event_id=schedule_id,game_type=selected_game_type,
   comparison_basis=case when p_payload?'comparison_basis' then p_payload->>'comparison_basis' else comparison_basis end,note=coalesce(p_payload->>'note',''),version=version+1,updated_at=now() where id=sid returning * into s;
 end if;
 for item in select value from jsonb_array_elements(p_payload->'rows') loop
  pid:=(item->>'id')::uuid;uid:=nullif(item->>'userId','')::uuid;
  if pid is null or item->>'kind' is null or item->>'kind' not in ('member','manual') then raise exception '참가자 형식을 확인해 주세요.' using errcode='22023';end if;
  select * into person from private.club_score_people where id=pid;
  if found then
   if person.club_id<>c or person.user_id is distinct from uid or person.kind<>item->>'kind' then raise exception '다른 참가자 정보로 변경할 수 없습니다.' using errcode='42501';end if;
  else
   if item->>'kind'='member' then
    select sp.* into person from private.club_score_people sp where sp.club_id=c and sp.user_id=uid;
    if found then pid:=person.id;end if;
   end if;
   if person.id is null then
    if (item->>'kind'='member' and uid is null) or (item->>'kind'='manual' and uid is not null) then raise exception '회원 연결을 확인해 주세요.' using errcode='22023';end if;
    insert into private.club_score_people(id,club_id,user_id,kind) values(pid,c,uid,item->>'kind') returning * into person;
   end if;
  end if;
  if pid=any(kept) then raise exception '같은 참가자가 중복 선택되었습니다.' using errcode='23505';end if;
  kept:=array_append(kept,pid);
  select display_name into old_name from private.club_monthly_scores where sheet_id=s.id and person_id=pid;
  if old_name is not null then n:=old_name;
  elsif person.kind='member' then
   select coalesce(nullif(btrim(p.display_name),''),'이름 미등록') into n from public.club_memberships m join public.user_accounts a on a.id=m.user_id
    join public.user_profiles p on p.user_id=a.id where m.club_id=c and m.user_id=uid and m.membership_status='active' and a.account_status='active' for share of m,a,p;
   if not found or person.anonymized then raise exception '현재 승인된 회원을 선택해 주세요.' using errcode='42501';end if;
  else n:=btrim(item->>'name');end if;
  if item ? 'participantGender' or item ? 'genderCorrection' then
   if person.user_id is not null then
    select account_status into target_status from public.user_accounts where id=person.user_id for share;
    perform user_id from public.user_profiles where user_id=person.user_id for share;
   else target_status:='active';end if;
   select * into person from private.club_score_people where id=pid;
   if person.anonymized or target_status is distinct from 'active' then
    raise exception '분류를 수정할 수 없는 참가자입니다.' using errcode='42501';
   end if;
  end if;
  if item ? 'participantGender' then
   if item->'participantGender'<>'null'::jsonb and coalesce(item->>'participantGender','') not in ('male','female') then
    raise exception '참가자 보완 분류를 확인해 주세요.' using errcode='22023';
   end if;
   if person.user_id is not null and not exists (
    select 1 from public.club_memberships where club_id=c and user_id=person.user_id and membership_status='active' for share
   ) then raise exception '현재 승인된 회원의 참가자 정보만 보완할 수 있습니다.' using errcode='42501';end if;
   if exists (select 1 from private.member_basics where user_id=person.user_id and gender is not null) then
    raise exception '본인 기본정보가 등록되었습니다. 새로 불러온 뒤 분류를 확인해 주세요.' using errcode='PT409';
   end if;
   update private.club_score_people set monthly_gender=item->>'participantGender' where id=pid returning * into person;
  end if;
  if old_name is null and person.user_id is not null then
   -- Recheck after the existing active-member locks, which also serialize account erasure.
   select * into person from private.club_score_people where id=pid;
   if person.anonymized then raise exception '현재 승인된 회원을 선택해 주세요.' using errcode='42501';end if;
  end if;
  if person.anonymized then n:='탈퇴 회원';end if;
  select gender into account_gender from private.member_basics where user_id=person.user_id and old_name is null;
  if n is null or length(n) not between 1 and 100 then raise exception '참가자 이름을 확인해 주세요.' using errcode='22023';end if;
  if item->'score' is not null and item->'score'<>'null'::jsonb and (jsonb_typeof(item->'score')<>'number' or item->>'score' !~ '^[1-9][0-9]*$') then raise exception '총타수는 양의 정수 또는 미입력이어야 합니다.' using errcode='22023';end if;
  insert into private.club_monthly_scores(sheet_id,person_id,display_name,strokes,saved_gender)
   values(s.id,pid,n,(item->>'score')::integer,case when not person.anonymized then coalesce(account_gender,person.monthly_gender) end)
   on conflict(sheet_id,person_id) do update set strokes=excluded.strokes,excluded=false;
  if item ? 'genderCorrection' then
   correction:=item->'genderCorrection';
   reason:=private.messaging_trim(correction->>'reason');
   if old_name is null or jsonb_typeof(correction) is distinct from 'object'
    or not (correction ? 'gender')
    or (correction->'gender'<>'null'::jsonb and coalesce(correction->>'gender','') not in ('male','female'))
    or jsonb_typeof(correction->'reason') is distinct from 'string'
    or length(reason) not between 2 and 200 then
    raise exception '저장된 경기의 분류와 정정 사유(2~200자)를 확인해 주세요.' using errcode='22023';
   end if;
   update private.club_monthly_scores
    set saved_gender=correction->>'gender',gender_correction_reason=reason
    where sheet_id=s.id and person_id=pid;
  end if;
 end loop;
 update private.club_monthly_scores set excluded=true where sheet_id=s.id and not(person_id=any(kept));
 result:=jsonb_build_object('id',s.id,'version',s.version,'replayed',false);
 perform private.club_extension_complete(actor,p_request_id,'monthly.save',request_input,result);
 return result;
end $$;
