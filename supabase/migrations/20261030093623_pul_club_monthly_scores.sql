-- Saved score sheets are private club records. All access goes through caller-scoped RPCs.
create table private.club_monthly_sheets (
 id uuid primary key default gen_random_uuid(), club_id uuid not null references public.clubs(id),
 played_on date not null, title text not null check(length(btrim(title)) between 1 and 120),
 course_name text not null check(length(btrim(course_name)) between 1 and 200),
 event_id uuid references public.club_official_events(id) on delete set null,
 note text not null default '' check(length(note)<=4000), version integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index club_monthly_one_sheet on private.club_monthly_sheets(club_id,extract(year from played_on),extract(month from played_on));
create table private.club_score_people (
 id uuid primary key, club_id uuid not null references public.clubs(id),
 user_id uuid references public.user_accounts(id) on delete set null,
 kind text not null check(kind in ('member','manual')), anonymized boolean not null default false,
 unique(club_id,user_id)
);
create table private.club_monthly_scores (
 sheet_id uuid not null references private.club_monthly_sheets(id) on delete cascade,
 person_id uuid not null references private.club_score_people(id),
 display_name text not null check(length(btrim(display_name)) between 1 and 100),
 strokes integer check(strokes>0), primary key(sheet_id,person_id)
);
alter table private.club_monthly_sheets enable row level security;
alter table private.club_score_people enable row level security;
alter table private.club_monthly_scores enable row level security;
revoke all on private.club_monthly_sheets,private.club_score_people,private.club_monthly_scores from public,anon,authenticated,service_role;

create function private.monthly_club(p_key text,p_write boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare c uuid; begin
 select id into c from public.clubs where legacy_key=p_key and club_status='active';
 if auth.uid() is null or not private.messaging_account_available(auth.uid()) or c is null
 or not exists(select 1 from public.club_memberships where club_id=c and user_id=auth.uid() and membership_status='active')
 or (p_write and not private.club_user_is_active_admin_or_vice_admin(auth.uid(),c)) then
  raise exception '현재 동호회 회원만 조회할 수 있으며 회장·부회장만 수정할 수 있습니다.' using errcode='42501';
 end if;
 return c;
end $$;

create function public.get_club_monthly_scores(p_club_key text,p_year integer,p_editor boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c uuid; result jsonb; begin
 c:=private.monthly_club(p_club_key,p_editor);
 if p_year is null or p_year not between 1 and 9999 then raise exception '연도를 확인해 주세요.' using errcode='22023'; end if;
 select jsonb_build_object('clubKey',p_club_key,'clubName',(select name from public.clubs where id=c),
 'year',p_year,'canEdit',private.club_user_is_active_admin_or_vice_admin(auth.uid(),c),
 'sheets',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'date',s.played_on,'title',s.title,'course',s.course_name,
 'eventId',s.event_id,'note',s.note,'version',s.version,'rows',coalesce((select jsonb_agg(jsonb_build_object(
 'id',p.id,'userId',p.user_id,'kind',p.kind,'name',r.display_name,'score',r.strokes) order by r.display_name,p.id)
 from private.club_monthly_scores r join private.club_score_people p on p.id=r.person_id where r.sheet_id=s.id),'[]'::jsonb)) order by s.played_on)
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

create function public.save_club_monthly_scores(p_club_key text,p_request_id uuid,p_payload jsonb) returns jsonb
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
  if s.version is distinct from (p_payload->>'version')::integer then raise exception '다른 수정이 먼저 저장되었습니다. 새로 불러온 뒤 다시 수정해 주세요.' using errcode='40001';end if;
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
  insert into private.club_monthly_sheets(club_id,played_on,title,course_name,event_id,note) values(c,d,btrim(p_payload->>'title'),btrim(p_payload->>'course'),nullif(p_payload->>'eventId','')::uuid,coalesce(p_payload->>'note','')) returning * into s;
 else
  update private.club_monthly_sheets set played_on=d,title=btrim(p_payload->>'title'),course_name=btrim(p_payload->>'course'),event_id=nullif(p_payload->>'eventId','')::uuid,
   note=coalesce(p_payload->>'note',''),version=version+1,updated_at=now() where id=sid returning * into s;
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
   on conflict(sheet_id,person_id) do update set strokes=excluded.strokes;
 end loop;
 delete from private.club_monthly_scores where sheet_id=s.id and not(person_id=any(kept));
 result:=jsonb_build_object('id',s.id,'version',s.version,'replayed',false);
 perform private.club_extension_complete(actor,p_request_id,'monthly.save',request_input,result);
 return result;
end $$;

-- Erasure follows account withdrawal/profile removal; routine display-name changes do not rewrite history.
create function private.monthly_anonymize() returns trigger language plpgsql security definer set search_path='' as $$
declare u uuid; begin
 if tg_table_name='user_accounts' then
  u:=old.id;
  if tg_op='UPDATE' and new.account_status<>'withdrawn' then return new;end if;
 else
  u:=old.user_id;
  if tg_op='UPDATE' and new.display_name is not null then return new;end if;
 end if;
 update private.club_monthly_scores set display_name='탈퇴 회원' where person_id in(select id from private.club_score_people where user_id=u);
 update private.club_score_people set anonymized=true where user_id=u;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
create trigger monthly_account_erasure before delete or update of account_status on public.user_accounts for each row execute function private.monthly_anonymize();
create trigger monthly_profile_erasure before delete or update of display_name on public.user_profiles for each row execute function private.monthly_anonymize();
revoke all on function private.monthly_club(text,boolean),private.monthly_anonymize() from public,anon,authenticated,service_role;
revoke all on function public.get_club_monthly_scores(text,integer,boolean),public.save_club_monthly_scores(text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.get_club_monthly_scores(text,integer,boolean),public.save_club_monthly_scores(text,uuid,jsonb) to authenticated;
