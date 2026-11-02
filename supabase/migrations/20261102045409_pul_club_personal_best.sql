-- Only new schema is applied. Old score/source rows and migration identities are preserved.
alter table private.club_monthly_sheets add column comparison_basis text not null default 'unconfirmed'
 check(comparison_basis in ('unconfirmed','outdoor_18_single','other'));
alter table private.club_tournaments add column comparison_basis text not null default 'unconfirmed'
 check(comparison_basis in ('unconfirmed','outdoor_18_single','other'));
alter table private.club_monthly_scores add column excluded boolean not null default false;
alter table private.club_monthly_scores add column registered_at timestamptz;
update private.club_monthly_scores r set registered_at=s.created_at from private.club_monthly_sheets s where s.id=r.sheet_id;
alter table private.club_monthly_scores alter column registered_at set not null, alter column registered_at set default clock_timestamp();
-- shortcut: legacy tournament entries have no creation timestamp, use a fixed import instant plus IDs until historical registration evidence exists.
alter table private.club_tournament_entries add column registered_at timestamptz not null default transaction_timestamp();
alter table private.club_tournament_entries alter column registered_at set default clock_timestamp();
create function private.keep_score_registration() returns trigger language plpgsql set search_path='' as $$
begin new.registered_at:=old.registered_at;return new;end $$;
create trigger keep_monthly_registration before update on private.club_monthly_scores for each row execute function private.keep_score_registration();
create trigger keep_tournament_registration before update on private.club_tournament_entries for each row execute function private.keep_score_registration();
revoke all on function private.keep_score_registration() from public,anon,authenticated,service_role;


create or replace function public.get_club_monthly_scores(p_club_key text,p_year integer,p_editor boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c uuid; result jsonb; begin
 c:=private.monthly_club(p_club_key,p_editor);
 if p_year is null or p_year not between 1 and 9999 then raise exception '연도를 확인해 주세요.' using errcode='22023'; end if;
 select jsonb_build_object('clubKey',p_club_key,'clubName',(select name from public.clubs where id=c),
 'year',p_year,'canEdit',private.club_user_is_active_admin_or_vice_admin(auth.uid(),c),
 'sheets',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'date',s.played_on,'title',s.title,'course',s.course_name,
 'eventId',s.event_id,'comparison_basis',s.comparison_basis,'note',s.note,'version',s.version,'rows',coalesce((select jsonb_agg(jsonb_build_object(
 'id',p.id,'userId',p.user_id,'kind',p.kind,'name',r.display_name,'score',r.strokes) order by r.display_name,p.id)
 from private.club_monthly_scores r join private.club_score_people p on p.id=r.person_id where r.sheet_id=s.id and not r.excluded),'[]'::jsonb)) order by s.played_on)
 from private.club_monthly_sheets s where s.club_id=c and extract(year from s.played_on)=p_year),'[]'::jsonb)) into result;
 if p_editor then
 result:=result||jsonb_build_object(
 'members',coalesce((select jsonb_agg(jsonb_build_object('userId',m.user_id,'name',coalesce(nullif(btrim(p.display_name),''),'이름 미등록'),
 'id',sp.id) order by p.display_name,m.user_id) from public.club_memberships m join public.user_accounts a on a.id=m.user_id
 join public.user_profiles p on p.user_id=a.id left join private.club_score_people sp on sp.club_id=c and sp.user_id=m.user_id
 where m.club_id=c and m.membership_status='active' and a.account_status='active'),'[]'::jsonb),
 'manualPeople',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',n.display_name,'kind','manual','userId',null))
 from private.club_score_people p join lateral(select r.display_name from private.club_monthly_scores r join private.club_monthly_sheets s on s.id=r.sheet_id
 where r.person_id=p.id order by s.played_on desc limit 1)n on true where p.club_id=c and p.kind='manual'),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'date',(e.starts_at at time zone 'Asia/Seoul')::date,
 'course',coalesce(co.name,e.location)) order by e.starts_at) from public.club_official_events e left join public.courses co on co.course_key=e.linked_course_legacy_key
 where e.club_id=c and e.event_type='monthly_meeting' and e.event_status not in ('draft','cancelled') and e.moderation_status='visible'
 and extract(year from e.starts_at at time zone 'Asia/Seoul')=p_year),'[]'::jsonb));
 end if;
 return result;
end $$;

create or replace function public.save_club_monthly_scores(p_club_key text,p_request_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c uuid; actor uuid:=auth.uid(); s private.club_monthly_sheets; person private.club_score_people;
 prior jsonb; result jsonb; request_input jsonb; d date; sid uuid; pid uuid; uid uuid; item jsonb; n text; old_name text; kept uuid[]:='{}';
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
 else
  if exists(select 1 from private.club_monthly_sheets where club_id=c and date_trunc('month',played_on)=date_trunc('month',d)) then
   raise exception '이 월의 성적표가 이미 있습니다. 기존 성적표를 수정해 주세요.' using errcode='23505';end if;
 end if;
 if nullif(p_payload->>'eventId','') is not null and not exists(select 1 from public.club_official_events where id=(p_payload->>'eventId')::uuid
 and club_id=c and event_type='monthly_meeting' and event_status not in ('draft','cancelled') and moderation_status='visible'
 and date_trunc('month',starts_at at time zone 'Asia/Seoul')=date_trunc('month',d)) then
 raise exception '해당 월의 월례회 일정을 선택해 주세요.' using errcode='22023';end if;
 if sid is null then
  insert into private.club_monthly_sheets(club_id,played_on,title,course_name,event_id,note,comparison_basis) values(c,d,btrim(p_payload->>'title'),btrim(p_payload->>'course'),nullif(p_payload->>'eventId','')::uuid,coalesce(p_payload->>'note',''),coalesce(p_payload->>'comparison_basis','unconfirmed')) returning * into s;
 else
  update private.club_monthly_sheets set played_on=d,title=btrim(p_payload->>'title'),course_name=btrim(p_payload->>'course'),event_id=nullif(p_payload->>'eventId','')::uuid,
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
  if person.anonymized then n:='탈퇴 회원';end if;
  if n is null or length(n) not between 1 and 100 then raise exception '참가자 이름을 확인해 주세요.' using errcode='22023';end if;
  if item->'score' is not null and item->'score'<>'null'::jsonb and (jsonb_typeof(item->'score')<>'number' or item->>'score' !~ '^[1-9][0-9]*$') then raise exception '총타수는 양의 정수 또는 미입력이어야 합니다.' using errcode='22023';end if;
  insert into private.club_monthly_scores(sheet_id,person_id,display_name,strokes) values(s.id,pid,n,(item->>'score')::integer)
   on conflict(sheet_id,person_id) do update set strokes=excluded.strokes,excluded=false;
 end loop;
 update private.club_monthly_scores set excluded=true where sheet_id=s.id and not(person_id=any(kept));
 result:=jsonb_build_object('id',s.id,'version',s.version,'replayed',false);
 perform private.club_extension_complete(actor,p_request_id,'monthly.save',request_input,result);
 return result;
end $$;

create or replace function public.save_club_tournament(p_club_key text,p_request_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c uuid:=private.tournament_lock(p_club_key,true); t private.club_tournaments; old private.club_tournament_entries;
 r jsonb; request jsonb:=jsonb_build_object('club',c,'payload',p_payload); prior jsonb; result jsonb; pid uuid; eid uuid; n text; kept uuid[]:='{}'; ds text[]; begin
 prior:=private.club_extension_previous(auth.uid(),p_request_id,'tournament.save',request);if prior is not null then return prior;end if;
 if p_request_id is null or jsonb_typeof(p_payload->'entries') is distinct from 'array' or jsonb_array_length(p_payload->'entries')>1000 then raise exception '참가 명단을 확인해 주세요.' using errcode='22023';end if;
 if nullif(p_payload->>'id','') is not null then
  select * into t from private.club_tournaments where id=(p_payload->>'id')::uuid and club_id=c for update;
  if not found then raise exception '이 동호회의 대회가 아닙니다.' using errcode='42501';end if;
  if t.version is distinct from (p_payload->>'version')::integer then raise exception '다른 수정이 먼저 저장되었습니다. 입력을 보관하고 새로 불러와 비교해 주세요.' using errcode='PT409';end if;
 end if;
 select array_agg(value) into ds from jsonb_array_elements_text(p_payload->'divisions');
 if nullif(p_payload->>'schedule_id','') is not null and not exists(select 1 from public.club_official_events where id=(p_payload->>'schedule_id')::uuid and club_id=c and event_type in('club_tournament','screen_tournament','friendly_match') and event_status not in('draft','cancelled') and moderation_status='visible') then raise exception '동호회 대회 일정을 확인해 주세요.' using errcode='22023';end if;
 if nullif(p_payload->>'event_id','') is not null and not exists(select 1 from public.events where id=(p_payload->>'event_id')::uuid and publication_status='published' and (related_course_id is null or related_course_id=nullif(p_payload->>'course_id','')::uuid)) then raise exception '대회 안내와 개최 구장 연결을 확인해 주세요.' using errcode='22023';end if;
 if t.id is null then
  insert into private.club_tournaments(club_id,title,played_on,course_id,course_name,event_id,schedule_id,divisions,format_note,note,comparison_basis)
  values(c,btrim(p_payload->>'title'),(p_payload->>'played_on')::date,nullif(p_payload->>'course_id','')::uuid,btrim(p_payload->>'course_name'),nullif(p_payload->>'event_id','')::uuid,nullif(p_payload->>'schedule_id','')::uuid,ds,coalesce(p_payload->>'format_note',''),coalesce(p_payload->>'note',''),coalesce(p_payload->>'comparison_basis','unconfirmed')) returning * into t;
 else
  -- Only an explicit, version-checked correction changes these snapshots; directory edits never do.
  update private.club_tournaments set title=btrim(p_payload->>'title'),played_on=(p_payload->>'played_on')::date,course_id=nullif(p_payload->>'course_id','')::uuid,course_name=btrim(p_payload->>'course_name'),event_id=nullif(p_payload->>'event_id','')::uuid,schedule_id=nullif(p_payload->>'schedule_id','')::uuid,divisions=ds,format_note=coalesce(p_payload->>'format_note',''),comparison_basis=case when p_payload?'comparison_basis' then p_payload->>'comparison_basis' else comparison_basis end,note=coalesce(p_payload->>'note',''),version=version+1,updated_at=now() where id=t.id returning * into t;
 end if;
 for r in select value from jsonb_array_elements(p_payload->'entries') loop
  pid:=private.tournament_person(c,r);select * into old from private.club_tournament_entries where tournament_id=t.id and person_id=pid and division=r->>'division' for update;
  if not (r->>'division'=any(t.divisions)) then raise exception '대회에서 운영하는 부문을 선택해 주세요.' using errcode='22023';end if;
  if old.id is not null then n:=old.display_name;
  else
   if exists(select 1 from private.club_score_people p where p.id=pid and p.kind='member' and (p.anonymized or not exists(select 1 from public.club_memberships m join public.user_accounts a on a.id=m.user_id where m.club_id=c and m.user_id=p.user_id and m.membership_status='active' and a.account_status='active'))) then raise exception '신규 명단에는 현재 승인된 회원을 선택해 주세요.' using errcode='42501';end if;
   select case when p.anonymized then '탈퇴 회원' when p.kind='manual' then btrim(r->>'display_name') else (select pr.display_name from public.user_profiles pr join public.club_memberships m on m.user_id=pr.user_id where pr.user_id=p.user_id and m.club_id=c and m.membership_status='active') end into n from private.club_score_people p where p.id=pid;
  end if;
  if r->>'attendance'<>'attended' and (nullif(r->>'place','') is not null or nullif(r->>'score','') is not null or r->>'award'<>'unconfirmed') then raise exception '실제 참가 확인 후 결과를 입력해 주세요.' using errcode='22023';end if;
  insert into private.club_tournament_entries(tournament_id,person_id,display_name,division,intent,registration,attendance,award,place,tied,score,confirmed,confirmed_by)
   values(t.id,pid,n,r->>'division',r->>'intent',r->>'registration',r->>'attendance',r->>'award',nullif(r->>'place','')::integer,coalesce((r->>'tied')::boolean,false),nullif(r->>'score','')::integer,r->>'attendance'='attended' and r->>'award'<>'unconfirmed',auth.uid())
   on conflict(tournament_id,person_id,division) do update set intent=excluded.intent,registration=excluded.registration,attendance=excluded.attendance,award=excluded.award,place=excluded.place,tied=excluded.tied,score=excluded.score,confirmed=excluded.confirmed,confirmed_by=excluded.confirmed_by,excluded=false returning id into eid;
  if eid=any(kept) then raise exception '같은 참가자·부문이 중복되었습니다.' using errcode='23505';end if;kept:=array_append(kept,eid);
  -- An independent official correction cannot leave an inconsistent news card labelled confirmed.
  update private.tournament_award_news set confirmed=false,version=version+1 where entry_id=eid and confirmed and (place is distinct from nullif(r->>'place','')::integer or score is distinct from nullif(r->>'score','')::integer or tied is distinct from coalesce((r->>'tied')::boolean,false) or r->>'award'<>'yes');
 end loop;
 update private.club_tournament_entries set excluded=true where tournament_id=t.id and not(id=any(kept));
 update private.tournament_award_news set hidden=true,version=version+1 where entry_id in(select id from private.club_tournament_entries where tournament_id=t.id and excluded) and not hidden;
 result:=jsonb_build_object('id',t.id,'version',t.version);perform private.club_extension_complete(auth.uid(),p_request_id,'tournament.save',request,result);return result;
end $$;

create view private.club_personal_score_sources as
with originals as (
 select s.club_id,r.person_id,'monthly'::text kind,s.id event_id,s.id source_id,s.played_on,s.title,s.course_name,
 null::uuid course_id,s.event_id linked_event_id,r.strokes score,r.registered_at,
 ('monthly:'||s.id||':'||r.person_id) source_key,
 case when r.excluded then '제외된 성적' when r.strokes is null then '타수 미입력'
 when s.comparison_basis='unconfirmed' then '경기 기준 미확인' when s.comparison_basis<>'outdoor_18_single' then '이번 비교 조건 밖' else null end reason
 from private.club_monthly_scores r join private.club_monthly_sheets s on s.id=r.sheet_id
 union all
 select t.club_id,e.person_id,'tournament',t.id,e.id,t.played_on,t.title,t.course_name,t.course_id,t.event_id,e.score,e.registered_at,
 ('tournament:'||e.id),
 case when e.excluded then '제외된 성적' when e.attendance<>'attended' then '실제 참가 미확인'
 when not e.confirmed then '공식 확인 전' when e.place is null and e.score is null then '참가만 확인 · 성적 없음'
 when e.place is null then '공식 순위 없음' when e.score is null then '타수 미입력'
 when t.comparison_basis='unconfirmed' then '경기 기준 미확인' when t.comparison_basis<>'outdoor_18_single' then '이번 비교 조건 밖'
 when eligible.id is null then '집계 대상 아님' else null end
 from private.club_tournament_entries e join private.club_tournaments t on t.id=e.tournament_id
 left join private.tournament_eligible_results eligible on eligible.id=e.id
)
select o.*,p.user_id,coalesce(nullif(btrim(pr.display_name),''),'이름 미등록') display_name,
 case when p.user_id is null then '계정 미연결 참가자' else o.reason end exclusion_reason
from originals o join private.club_score_people p on p.id=o.person_id and p.club_id=o.club_id
join public.clubs c on c.id=o.club_id and c.club_status='active'
left join public.user_accounts a on a.id=p.user_id
left join public.user_profiles pr on pr.user_id=p.user_id
where not p.anonymized and ((p.kind='manual' and p.user_id is null) or
 (a.account_status='active' and exists(select 1 from public.club_memberships m where m.club_id=o.club_id and m.user_id=p.user_id and m.membership_status='active')));
revoke all on private.club_personal_score_sources from public,anon,authenticated,service_role;

create view private.club_personal_bests as
with candidates as (
 select s.*,row_number() over(partition by club_id,user_id order by score,registered_at,source_key) choice
 from private.club_personal_score_sources s where exclusion_reason is null and user_id is not null
), selected as (select * from candidates where choice=1)
select s.*,rank() over(partition by club_id order by score) ranking,
 count(*) over(partition by club_id,score)>1 tied from selected s;
revoke all on private.club_personal_bests from public,anon,authenticated,service_role;

create function public.get_club_personal_best_cards(p_club_key text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c uuid;begin
 if auth.uid() is not null and not private.messaging_account_available(auth.uid()) then return '[]'::jsonb;end if;
 select id into c from public.clubs cl where cl.legacy_key=p_club_key and cl.club_status='active' and
 (cl.directory_is_public or (private.messaging_account_available(auth.uid()) and exists(select 1 from public.club_memberships m where m.club_id=cl.id and m.user_id=auth.uid() and m.membership_status='active')));
 if c is null then return '[]'::jsonb;end if;
 return coalesce((select jsonb_agg(item order by score,played_on,registered_at,source_key,user_id) from (
 select jsonb_build_object('name',left(display_name,1)||'○○','score',score,'date',played_on,'course',course_name,'kind',kind,'rank',ranking,'tied',tied) item,
 score,played_on,registered_at,source_key,user_id from private.club_personal_bests where club_id=c
 order by score,played_on,registered_at,source_key,user_id limit 3)n),'[]'::jsonb);
end $$;
revoke all on function public.get_club_personal_best_cards(text) from public,anon,authenticated,service_role;
grant execute on function public.get_club_personal_best_cards(text) to anon,authenticated;

create function public.get_club_personal_bests(p_club_key text,p_person_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c uuid:=private.monthly_club(p_club_key,false); result jsonb;begin
 if p_person_id is not null and not exists(select 1 from private.club_score_people p join public.user_accounts a on a.id=p.user_id and a.account_status='active'
 join public.club_memberships m on m.user_id=p.user_id and m.club_id=p.club_id and m.membership_status='active'
 where p.id=p_person_id and p.club_id=c and not p.anonymized) then raise exception '현재 동호회 회원의 기록만 볼 수 있습니다.' using errcode='42501';end if;
 select jsonb_build_object('clubKey',p_club_key,'clubName',(select name from public.clubs where id=c),
 'items',coalesce((select jsonb_agg(jsonb_build_object('personId',person_id,'name',display_name,'score',score,'date',played_on,'course',course_name,'kind',kind,'eventId',event_id,'sourceId',source_id,'rank',ranking,'tied',tied,'isMine',user_id=auth.uid()) order by score,played_on,registered_at,source_key,user_id)
 from private.club_personal_bests where club_id=c and (p_person_id is null or person_id=p_person_id)),'[]'::jsonb),
 'missing',case when p_person_id is null then coalesce((select jsonb_agg(jsonb_build_object('name',coalesce(nullif(btrim(pr.display_name),''),'이름 미등록'),'isMine',m.user_id=auth.uid()) order by pr.display_name,m.id)
 from public.club_memberships m join public.user_accounts a on a.id=m.user_id and a.account_status='active' left join public.user_profiles pr on pr.user_id=m.user_id
 where m.club_id=c and m.membership_status='active' and not exists(select 1 from private.club_personal_bests b where b.club_id=c and b.user_id=m.user_id)),'[]'::jsonb) else '[]'::jsonb end,
 'excluded',coalesce((select jsonb_agg(jsonb_build_object('reason',exclusion_reason,'count',n) order by exclusion_reason) from (select exclusion_reason,count(*) n from private.club_personal_score_sources where club_id=c and exclusion_reason is not null and (p_person_id is null or person_id=p_person_id) group by exclusion_reason)x),'[]'::jsonb),
 'personName',case when p_person_id is not null then (select pr.display_name from private.club_score_people p join public.user_profiles pr on pr.user_id=p.user_id where p.id=p_person_id and p.club_id=c)end,
 'history',case when p_person_id is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('personId',person_id,'score',score,'date',played_on,'course',course_name,'title',title,'kind',kind,'eventId',event_id,'sourceId',source_id,'reason',exclusion_reason) order by played_on desc,registered_at,source_key) from private.club_personal_score_sources where club_id=c and person_id=p_person_id),'[]'::jsonb)end) into result;
 return result;
end $$;
revoke all on function public.get_club_personal_bests(text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_club_personal_bests(text,uuid) to authenticated;
