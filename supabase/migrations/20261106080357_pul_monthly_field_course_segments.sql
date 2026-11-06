-- Exact venue labels supplied by the course operator. No inferred or backfilled segments.
alter table public.courses add column course_segments text[] not null default '{}';
alter table private.club_monthly_sheets add column course_segments text[];

create function private.course_segment_labels(p_labels jsonb) returns text[]
language plpgsql immutable set search_path='' as $$
declare labels text[];
begin
 if p_labels is null or jsonb_typeof(p_labels)<>'array' then
  raise exception '코스 구간 목록을 확인해 주세요.' using errcode='22023';
 end if;
 if jsonb_array_length(p_labels)>24 or exists (
  select 1 from jsonb_array_elements(p_labels) item
  where jsonb_typeof(item)<>'string'
    or char_length(btrim(item #>> '{}')) not between 1 and 32
    or (item #>> '{}') ~ '[[:cntrl:]]'
 ) then
  raise exception '코스 구간은 1~32자 이름으로 최대 24개 등록할 수 있습니다.' using errcode='22023';
 end if;
 select coalesce(array_agg(btrim(item) order by ord),'{}') into labels
 from jsonb_array_elements_text(p_labels) with ordinality as input(item,ord);
 if (select count(distinct lower(label)) from unnest(labels) label)<>cardinality(labels) then
  raise exception '코스 구간 이름을 중복해서 등록할 수 없습니다.' using errcode='22023';
 end if;
 return labels;
end $$;
revoke all on function private.course_segment_labels(jsonb) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.course_management_save(p_course_key text, p_updated_at timestamp with time zone, p_request_id uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.courses%rowtype; a uuid; d jsonb; state jsonb; result jsonb; today date:=(now() at time zone 'Asia/Seoul')::date; cf date;ct date;pf date;pt date;os text;segments text[];
begin
 select * into c from public.courses where course_key=p_course_key and course_status='active' for update;
 if not found then raise exception '구장을 찾을 수 없습니다.' using errcode='P0002';end if;
 a:=private.course_require_scope(c.id);
 if p_request_id is null or p_input is null or jsonb_typeof(p_input)<>'object' then raise exception '요청을 확인해 주세요.' using errcode='22023';end if;
 result:=private.course_claim_request(a,p_request_id,'course.direct_information',jsonb_build_object('course',c.id,'base',p_updated_at,'input',p_input));if result is not null then return result;end if;
 if c.updated_at is distinct from p_updated_at then raise exception '다른 변경이 먼저 저장되었습니다. 입력을 유지하고 최신 내용을 확인해 주세요.' using errcode='PT409';end if;
 d:=private.course_application_draft(p_input->'course');state:=p_input->'state';
 if d->>'reservation_url' ~ '^https://[^/]*@' or d->>'reservation_url' ~ '[[:space:]\\]' then raise exception '예약 링크는 인증정보 없는 HTTPS 주소를 확인해 주세요.' using errcode='22023';end if;
 if d->>'course_type' is distinct from c.course_type or d->>'region' is distinct from c.region or d->>'city' is distinct from c.city then raise exception '유형·지역 변경은 기존 PUL 관리에서 처리해 주세요.' using errcode='22023';end if;
 if state is null or jsonb_typeof(state)<>'object' or exists(select 1 from jsonb_object_keys(state) k where k not in ('operating_status','closed_from','closed_to','closed_reason','planned_closed_from','planned_closed_to','planned_closed_reason')) then raise exception '운영 상태를 확인해 주세요.' using errcode='22023';end if;
 os:=nullif(state->>'operating_status','');cf:=nullif(state->>'closed_from','')::date;ct:=nullif(state->>'closed_to','')::date;pf:=nullif(state->>'planned_closed_from','')::date;pt:=nullif(state->>'planned_closed_to','')::date;
 if os is not null and os not in ('open','closed') or (cf is null)<>(ct is null) or (pf is null)<>(pt is null) or cf>ct or pf>pt
 or cf is not null and (os is distinct from 'closed' or cf>today or ct<today)
 or pf is not null and pf<=today or char_length(coalesce(state->>'closed_reason',''))>500 or char_length(coalesce(state->>'planned_closed_reason',''))>500
 or pf is not null and char_length(btrim(coalesce(state->>'planned_closed_reason','')))<2 then raise exception '현재 상태와 휴장 기간·사유를 확인해 주세요. 예정 휴장은 미래 기간으로 입력합니다.' using errcode='22023';end if;
 if p_input?'course_segments' then
  if c.course_type<>'field' then raise exception '필드 구장의 코스 구간만 등록할 수 있습니다.' using errcode='22023';end if;
  segments:=private.course_segment_labels(p_input->'course_segments');
 end if;
 update public.courses set course_segments=coalesce(segments,c.course_segments),name=d->>'name',address=d->>'address',holes=(d->>'holes')::smallint,bay_count=(d->>'bay_count')::integer,
 operating_hours=d->>'operating_hours',operation_code=d->>'operation_code',phone=d->>'phone',parking_available=(d->>'parking_available')::boolean,
 description=d->>'description',reservation_url=d->>'reservation_url',reservation_guide=d->>'reservation_guide',fee_guide=d->>'fee_guide',
 operating_status=os,closed_from=cf,closed_to=ct,closed_reason=nullif(btrim(state->>'closed_reason'),''),planned_closed_from=pf,planned_closed_to=pt,planned_closed_reason=nullif(btrim(state->>'planned_closed_reason'),''),updated_at=clock_timestamp() where id=c.id returning * into c;
 result:=jsonb_build_object('course_key',c.course_key,'updated_at',c.updated_at);perform private.course_complete_request(a,p_request_id,result);return result;
end $function$;

create or replace function private.course_management_read(p_course_key text,p_manage boolean) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c public.courses%rowtype; result jsonb;
begin
 select * into c from public.courses where course_key=p_course_key and course_status='active';
 if not found then raise exception '구장을 찾을 수 없습니다.' using errcode='P0002';end if;
 result:=private.course_state_json(c)||jsonb_build_object('course_segments',case when c.course_type='field' then c.course_segments else '{}'::text[] end,'can_manage',private.course_can_manage(c.id),'operator_count',(select count(*) from private.course_stewards s where s.course_id=c.id and private.course_current_operator(c.id,s.user_id)));
 if not p_manage then return result;end if;
 if not private.course_can_manage(c.id) then raise exception '담당 구장 관리 권한이 없습니다.' using errcode='42501';end if;
 return result||jsonb_build_object('course',private.public_course_json(c),'updated_at',c.updated_at,
 'resources',coalesce((select jsonb_agg(private.course_content_resource_json(r)||jsonb_build_object('status',r.status) order by r.created_at desc) from private.course_resources r where r.course_id=c.id and r.status='published'),'[]'),
 'photos',coalesce((select jsonb_agg(jsonb_build_object('media_key',media_key,'caption',caption,'version',version) order by created_at desc) from public.course_media where course_id=c.id and media_status='available'),'[]'),
 'reports',coalesce((select jsonb_agg(jsonb_build_object('id',id,'body',report_body,'status',report_status,'updated_at',updated_at) order by created_at desc) from public.course_information_reports where target_course_id=c.id),'[]'));
end $$;

create or replace function public.get_club_monthly_scores(p_club_key text,p_year integer,p_editor boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c uuid; result jsonb; begin
 c:=private.monthly_club(p_club_key,p_editor);
 if p_year is null or p_year not between 1 and 9999 then raise exception '연도를 확인해 주세요.' using errcode='22023'; end if;
 select jsonb_build_object('clubKey',p_club_key,'clubName',(select name from public.clubs where id=c),
 'year',p_year,'canEdit',private.club_user_is_active_admin_or_vice_admin(auth.uid(),c),
 'sheets',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'date',s.played_on,'title',s.title,'course',s.course_name,'courseSegments',s.course_segments,
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
 'homeCourses', coalesce((
   select jsonb_agg(jsonb_build_object('key', co.course_key, 'name', co.name, 'type', co.course_type) order by co.course_type)
   from public.course_club_links l
   join public.courses co on co.id = l.course_id and co.course_status = 'active'
   where l.club_id = c and not l.legacy_conflict
 ), '[]'::jsonb),
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
 schedule_id uuid; schedule_course_key text; known_game_type text; requested_game_type text; selected_game_type text; venue public.courses%rowtype; selected_segments text[]; course_snapshot text;
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
  select * into venue from public.courses where id=selected_course;
  known_game_type:=venue.course_type;
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
 course_snapshot:=btrim(p_payload->>'course');
 if p_payload?'courseSegments' and p_payload->'courseSegments'<>'null'::jsonb then
  selected_segments:=private.course_segment_labels(p_payload->'courseSegments');
 elsif sid is not null and selected_course is not distinct from s.course_id and not (p_payload?'courseSegments') then
  -- Older editors retain the recorded pair and its original spelling.
  selected_segments:=s.course_segments;
 end if;
 if sid is not null and selected_course is not distinct from s.course_id
    and selected_segments is not distinct from s.course_segments
    and (s.course_segments is not null or course_snapshot=s.course_name) then
  course_snapshot:=s.course_name;
 elsif selected_segments is not null then
  if venue.course_type is distinct from 'field' or cardinality(selected_segments)<>2
    or not (selected_segments <@ venue.course_segments) then
   raise exception '선택한 필드 구장에 등록된 서로 다른 코스 두 개를 선택해 주세요.' using errcode='22023';
  end if;
  course_snapshot:=venue.name||' '||case
   when selected_segments[1] ~ '^[A-Z]$' and selected_segments[2] ~ '^[A-Z]$'
    then selected_segments[1]||selected_segments[2]
   else array_to_string(selected_segments,' / ') end;
 elsif venue.course_type='field' and cardinality(venue.course_segments)>=2 then
  raise exception '실제로 돈 코스 두 개를 선택해 주세요.' using errcode='22023';
 end if;
 if char_length(course_snapshot)>200 then
  raise exception '저장할 구장명·코스가 너무 깁니다.' using errcode='22023';
 end if;
 if sid is null then
  insert into private.club_monthly_sheets(club_id,played_on,title,course_name,event_id,note,comparison_basis,course_id,game_type,course_segments)
  values(c,d,btrim(p_payload->>'title'),course_snapshot,schedule_id,coalesce(p_payload->>'note',''),coalesce(p_payload->>'comparison_basis','unconfirmed'),selected_course,selected_game_type,selected_segments) returning * into s;
 else
  update private.club_monthly_sheets set course_id=selected_course,played_on=d,title=btrim(p_payload->>'title'),course_name=course_snapshot,course_segments=selected_segments,event_id=schedule_id,game_type=selected_game_type,
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

notify pgrst, 'reload schema';
