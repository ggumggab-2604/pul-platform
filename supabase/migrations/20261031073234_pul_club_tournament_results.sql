-- Local candidate only. No existing migration is replayed.
create table private.club_tournaments (
 id uuid primary key default gen_random_uuid(), club_id uuid not null references public.clubs(id),
 title text not null check(length(title) between 1 and 160), played_on date not null,
 course_id uuid references public.courses(id), course_name text not null check(length(course_name) between 1 and 200),
 event_id uuid references public.events(id), schedule_id uuid references public.club_official_events(id),
 divisions text[] not null check(cardinality(divisions) between 1 and 4 and divisions <@ array['일반부','시니어부','여성부','여성시니어부']),
 format_note text not null default '' check(length(format_note)<=120), note text not null default '' check(length(note)<=4000),
 version integer not null default 1, updated_at timestamptz not null default now()
);
create index club_tournaments_period on private.club_tournaments(club_id,played_on desc);
create table private.club_tournament_entries (
 id uuid primary key default gen_random_uuid(), tournament_id uuid not null references private.club_tournaments(id),
 person_id uuid not null references private.club_score_people(id), display_name text not null check(length(display_name) between 1 and 100),
 division text not null, intent text not null default 'none' check(intent in('none','individual','group')),
 registration text not null default 'unconfirmed' check(registration in('unconfirmed','requested','complete')),
 attendance text not null default 'unconfirmed' check(attendance in('unconfirmed','attended','absent')),
 award text not null default 'unconfirmed' check(award in('unconfirmed','yes','no')),
 place integer check(place>0), tied boolean not null default false, score integer check(score>0),
 confirmed boolean not null default false, confirmed_by uuid references public.user_accounts(id) on delete set null,
 excluded boolean not null default false,
 unique(tournament_id,person_id,division),
 check(award<>'yes' or (place is not null and score is not null)),
 check(not confirmed or attendance='attended')
);
create table private.tournament_award_photos (
 id uuid primary key default gen_random_uuid(), entry_id uuid not null references private.club_tournament_entries(id),
 owner_id uuid references public.user_accounts(id) on delete set null,
 object_path text not null unique, mime text not null check(mime in('image/jpeg','image/png','image/webp')),
 ready boolean not null default false, created_at timestamptz not null default now()
);
create table private.tournament_award_news (
 id uuid primary key default gen_random_uuid(), entry_id uuid not null unique references private.club_tournament_entries(id),
 author_id uuid references public.user_accounts(id) on delete set null,
 photo_id uuid not null references private.tournament_award_photos(id),
 place integer not null check(place between 1 and 3), tied boolean not null, score integer not null check(score>0),
 award_name text not null default '' check(length(award_name)<=120), sentiment text not null default '' check(length(sentiment)<=2000),
 confirmed boolean not null default false, hidden boolean not null default false,
 version integer not null default 1, published_at timestamptz not null default now()
);
create table private.tournament_award_comments (
 id uuid primary key default gen_random_uuid(), news_id uuid not null references private.tournament_award_news(id),
 author_id uuid references public.user_accounts(id) on delete set null, display_name text not null,
 body text not null check(length(btrim(body)) between 1 and 1000), created_at timestamptz not null default now()
);
create table private.tournament_award_pins (
 news_id uuid not null references private.tournament_award_news(id), scope text not null check(scope in('club','course','national')),
 primary key(news_id,scope)
);
alter table private.club_tournaments enable row level security;
alter table private.club_tournament_entries enable row level security;
alter table private.tournament_award_photos enable row level security;
alter table private.tournament_award_news enable row level security;
alter table private.tournament_award_comments enable row level security;
alter table private.tournament_award_pins enable row level security;
revoke all on private.club_tournaments,private.club_tournament_entries,private.tournament_award_photos,private.tournament_award_news,private.tournament_award_comments,private.tournament_award_pins from public,anon,authenticated,service_role;

-- All writes serialize with club role changes, then recheck current account/consent/membership.
create function private.tournament_lock(p_key text,p_write boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare c uuid; a uuid:=auth.uid(); begin
 perform private.messaging_assert_read_committed(); c:=private.monthly_club(p_key,p_write);
 perform id from public.clubs where id=c for update;
 perform id from public.user_accounts where id=a for share;
 perform user_id from public.user_profiles where user_id=a for share;
 perform id from public.consent_records where user_id=a for share;
 perform id from public.club_memberships where club_id=c and user_id=a for share;
 perform id from public.club_role_assignments where membership_id in(select id from public.club_memberships where club_id=c and user_id=a) for share;
 perform role_code from public.club_role_definitions where role_code in('club_admin','club_vice_admin') for share;
 return private.monthly_club(p_key,p_write);
end $$;

create function private.tournament_person(p_club uuid,p_row jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare p private.club_score_people; u uuid:=nullif(p_row->>'user_id','')::uuid; pid uuid:=nullif(p_row->>'person_id','')::uuid; begin
 if pid is not null then select * into p from private.club_score_people where id=pid;
  if found and (p.club_id<>p_club or p.user_id is distinct from u) then raise exception '참가자 연결을 변경할 수 없습니다.' using errcode='42501';end if;
 end if;
 if p.id is null and u is not null then select * into p from private.club_score_people where club_id=p_club and user_id=u;end if;
 if p.id is null then
  if u is not null and not exists(select 1 from public.club_memberships m join public.user_accounts a on a.id=m.user_id where m.club_id=p_club and m.user_id=u and m.membership_status='active' and a.account_status='active') then raise exception '현재 동호회 회원을 선택해 주세요.' using errcode='42501';end if;
  insert into private.club_score_people(id,club_id,user_id,kind) values(coalesce(pid,gen_random_uuid()),p_club,u,case when u is null then 'manual' else 'member' end) returning * into p;
 end if;
 return p.id;
end $$;

create function public.get_club_tournaments(p_club_key text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c uuid:=private.monthly_club(p_club_key,false); manager boolean; result jsonb; begin
 manager:=private.club_user_is_active_admin_or_vice_admin(auth.uid(),c);
 select jsonb_build_object('club_key',p_club_key,'club_name',(select name from public.clubs where id=c),'user_id',auth.uid(),'can_edit',manager,
 'tournaments',coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('course_key',(select course_key from public.courses where id=t.course_id),'entries',coalesce((select jsonb_agg(to_jsonb(e)||jsonb_build_object('user_id',p.user_id,'kind',p.kind,'news_id',case when not n.hidden then n.id end,'news_version',n.version,'news_confirmed',n.confirmed and not n.hidden) order by e.display_name,e.id)
 from private.club_tournament_entries e join private.club_score_people p on p.id=e.person_id left join private.tournament_award_news n on n.entry_id=e.id where e.tournament_id=t.id and not e.excluded),'[]'::jsonb)) order by t.played_on desc,t.id) from private.club_tournaments t where t.club_id=c),'[]'::jsonb)) into result;
 if manager then result:=result||jsonb_build_object(
 'members',coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'person_id',p.id,'display_name',coalesce(pr.display_name,'이름 미등록'),'kind','member') order by pr.display_name,m.user_id) from public.club_memberships m join public.user_accounts a on a.id=m.user_id join public.user_profiles pr on pr.user_id=a.id left join private.club_score_people p on p.club_id=c and p.user_id=m.user_id where m.club_id=c and m.membership_status='active' and a.account_status='active' and not coalesce(p.anonymized,false)),'[]'::jsonb),
 'manual_people',coalesce((select jsonb_agg(jsonb_build_object('person_id',p.id,'user_id',null,'display_name',n.display_name,'kind','manual')) from private.club_score_people p join lateral(select display_name from private.club_tournament_entries where person_id=p.id order by id limit 1)n on true where p.club_id=c and p.kind='manual'),'[]'::jsonb),
 'courses',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'course_key',course_key) order by name) from public.courses where course_status<>'removed'),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'date',start_date,'course_id',related_course_id,'course_name',venue_name) order by start_date desc) from public.events where publication_status='published'),'[]'::jsonb),
 'schedules',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'date',(starts_at at time zone 'Asia/Seoul')::date,'course_key',linked_course_legacy_key,'course_name',location)) from public.club_official_events where club_id=c and event_type in('club_tournament','screen_tournament','friendly_match') and event_status not in('draft','cancelled') and moderation_status='visible'),'[]'::jsonb));end if;
 return result;
end $$;

create function public.save_club_tournament(p_club_key text,p_request_id uuid,p_payload jsonb) returns jsonb
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
  insert into private.club_tournaments(club_id,title,played_on,course_id,course_name,event_id,schedule_id,divisions,format_note,note)
  values(c,btrim(p_payload->>'title'),(p_payload->>'played_on')::date,nullif(p_payload->>'course_id','')::uuid,btrim(p_payload->>'course_name'),nullif(p_payload->>'event_id','')::uuid,nullif(p_payload->>'schedule_id','')::uuid,ds,coalesce(p_payload->>'format_note',''),coalesce(p_payload->>'note','')) returning * into t;
 else
  -- Only an explicit, version-checked correction changes these snapshots; directory edits never do.
  update private.club_tournaments set title=btrim(p_payload->>'title'),played_on=(p_payload->>'played_on')::date,course_id=nullif(p_payload->>'course_id','')::uuid,course_name=btrim(p_payload->>'course_name'),event_id=nullif(p_payload->>'event_id','')::uuid,schedule_id=nullif(p_payload->>'schedule_id','')::uuid,divisions=ds,format_note=coalesce(p_payload->>'format_note',''),note=coalesce(p_payload->>'note',''),version=version+1,updated_at=now() where id=t.id returning * into t;
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

create function public.register_tournament_intent(p_club_key text,p_request_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c uuid:=private.tournament_lock(p_club_key,false); t private.club_tournaments; pid uuid; result jsonb; request jsonb:=jsonb_build_object('club',c,'payload',p_payload); begin
 result:=private.club_extension_previous(auth.uid(),p_request_id,'tournament.intent',request);if result is not null then return result;end if;
 select * into t from private.club_tournaments where club_id=c and id=(p_payload->>'id')::uuid for update;
 if not found then raise exception '대회를 확인해 주세요.' using errcode='42501';end if;
 if t.version is distinct from (p_payload->>'version')::integer then raise exception '명단이 변경되었습니다. 새로 불러와 주세요.' using errcode='PT409';end if;
 if p_payload->>'intent' not in('individual','group') or not(p_payload->>'division'=any(t.divisions)) then raise exception '참가 방식과 부문을 선택해 주세요.' using errcode='22023';end if;
 pid:=private.tournament_person(c,jsonb_build_object('user_id',auth.uid()));
 if exists(select 1 from private.club_tournament_entries where tournament_id=t.id and person_id=pid and division=p_payload->>'division' and (registration='complete' or attendance<>'unconfirmed')) then raise exception '접수·참가 확인 뒤 변경은 회장·부회장에게 문의해 주세요.' using errcode='22023';end if;
 insert into private.club_tournament_entries(tournament_id,person_id,display_name,division,intent) values(t.id,pid,private.messaging_display_name(auth.uid()),p_payload->>'division',p_payload->>'intent') on conflict(tournament_id,person_id,division) do update set intent=excluded.intent,excluded=false;
 update private.club_tournaments set version=version+1,updated_at=now() where id=t.id;
 result:=jsonb_build_object('id',t.id);perform private.club_extension_complete(auth.uid(),p_request_id,'tournament.intent',request,result);return result;
end $$;

create function private.tournament_news_entry(p_entry uuid,p_manage boolean default false) returns private.club_tournament_entries
language plpgsql security definer set search_path='' as $$
declare e private.club_tournament_entries; c uuid; k text; p private.club_score_people; begin
 select * into e from private.club_tournament_entries where id=p_entry and not excluded;
 select club_id into c from private.club_tournaments where id=e.tournament_id;select legacy_key into k from public.clubs where id=c;
 perform private.tournament_lock(k,p_manage);select * into p from private.club_score_people where id=e.person_id;
 if e.id is null or p.anonymized or (not private.club_user_is_active_admin_or_vice_admin(auth.uid(),c) and p.user_id is distinct from auth.uid()) then raise exception '본인 또는 해당 동호회 회장·부회장만 등록할 수 있습니다.' using errcode='42501';end if;
 return e;
end $$;

create function public.prepare_tournament_award_photo(p_entry_id uuid,p_mime text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e private.club_tournament_entries:=private.tournament_news_entry(p_entry_id); p private.tournament_award_photos; begin
 insert into private.tournament_award_photos(entry_id,owner_id,object_path,mime) values(e.id,auth.uid(),auth.uid()::text||'/'||gen_random_uuid()::text,p_mime) returning * into p;
 return jsonb_build_object('id',p.id,'path',p.object_path);
end $$;
create function public.complete_tournament_award_photo(p_photo_id uuid,p_owner_id uuid) returns void
language plpgsql security definer set search_path='' as $$begin
 update private.tournament_award_photos set ready=true where id=p_photo_id and owner_id=p_owner_id;
 if not found then raise exception '사진 업로드를 확인해 주세요.' using errcode='42501';end if;
end $$;

create function public.save_tournament_award_news(p_request_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e private.club_tournament_entries:=private.tournament_news_entry((p_payload->>'entry_id')::uuid); t private.club_tournaments; n private.tournament_award_news;
 manager boolean; result jsonb; begin
 result:=private.club_extension_previous(auth.uid(),p_request_id,'tournament.news',p_payload);if result is not null then return result;end if;
 select * into t from private.club_tournaments where id=e.tournament_id for update;
 if t.version is distinct from (p_payload->>'tournament_version')::integer then raise exception '대회 성적이 변경되었습니다. 새로 불러와 비교해 주세요.' using errcode='PT409';end if;
 manager:=private.club_user_is_active_admin_or_vice_admin(auth.uid(),t.club_id);
 select * into n from private.tournament_award_news where entry_id=e.id for update;
 if coalesce(n.version,0) is distinct from (p_payload->>'version')::integer then raise exception '수상 소식이 변경되었습니다. 새로 불러와 비교해 주세요.' using errcode='PT409';end if;
 if not exists(select 1 from private.tournament_award_photos p where p.id=(p_payload->>'photo_id')::uuid and p.entry_id=e.id and p.ready and (p.owner_id=auth.uid() or p.id=n.photo_id)) then raise exception '이 참가자의 공개할 사진을 올려 주세요.' using errcode='42501';end if;
 insert into private.tournament_award_news(entry_id,author_id,photo_id,place,tied,score,award_name,sentiment,confirmed)
 values(e.id,auth.uid(),(p_payload->>'photo_id')::uuid,(p_payload->>'place')::integer,coalesce((p_payload->>'tied')::boolean,false),(p_payload->>'score')::integer,btrim(coalesce(p_payload->>'award_name','')),btrim(coalesce(p_payload->>'sentiment','')),manager)
 on conflict(entry_id) do update set photo_id=excluded.photo_id,place=excluded.place,tied=excluded.tied,score=excluded.score,award_name=excluded.award_name,sentiment=excluded.sentiment,confirmed=excluded.confirmed,hidden=false,version=private.tournament_award_news.version+1 returning * into n;
 if manager then
  update private.club_tournament_entries set attendance='attended',award='yes',place=n.place,tied=n.tied,score=n.score,confirmed=true,confirmed_by=auth.uid() where id=e.id;
 else
  -- Keep previously verified numbers, but never expose a changed self-submission as verified.
  update private.club_tournament_entries set confirmed=false where id=e.id;
 end if;
 update private.club_tournaments set version=version+1,updated_at=now() where id=t.id;
 result:=jsonb_build_object('id',n.id,'confirmed',n.confirmed);perform private.club_extension_complete(auth.uid(),p_request_id,'tournament.news',p_payload,result);return result;
end $$;

create function public.confirm_tournament_award_news(p_request_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare n private.tournament_award_news; e private.club_tournament_entries; t private.club_tournaments; result jsonb; begin
 select * into n from private.tournament_award_news where id=(p_payload->>'id')::uuid and not hidden;
 if n.id is null then raise exception '수상 소식을 확인해 주세요.' using errcode='42501';end if;
 e:=private.tournament_news_entry(n.entry_id,true);
 result:=private.club_extension_previous(auth.uid(),p_request_id,'tournament.confirm',p_payload);if result is not null then return result;end if;
 select * into n from private.tournament_award_news where id=n.id for update;
 select * into t from private.club_tournaments where id=e.tournament_id for update;
 if n.version is distinct from (p_payload->>'version')::integer or t.version is distinct from (p_payload->>'tournament_version')::integer then raise exception '소식이나 성적이 변경되었습니다. 최신 내용을 확인해 주세요.' using errcode='PT409';end if;
 update private.club_tournament_entries set attendance='attended',award='yes',place=n.place,tied=n.tied,score=n.score,confirmed=true,confirmed_by=auth.uid() where id=e.id;
 update private.tournament_award_news set confirmed=true,version=version+1 where id=n.id;
 update private.club_tournaments set version=version+1,updated_at=now() where id=t.id;
 result:=jsonb_build_object('id',n.id);perform private.club_extension_complete(auth.uid(),p_request_id,'tournament.confirm',p_payload,result);return result;
end $$;

create view private.tournament_eligible_results as
 select e.*,t.club_id,t.course_id,t.played_on,t.format_note from private.club_tournament_entries e join private.club_tournaments t on t.id=e.tournament_id join private.club_score_people p on p.id=e.person_id
 where not e.excluded and not p.anonymized and p.user_id is not null and e.confirmed and e.attendance='attended' and e.place is not null and e.score is not null;
revoke all on private.tournament_eligible_results from public,anon,authenticated,service_role;

create function public.get_tournament_award_news(p_club_key text default null,p_course_key text default null,p_news_id uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'entry_id',e.id,'version',n.version,'tournament_version',t.version,'tournament_id',t.id,
 'title',t.title,'date',t.played_on,'course',t.course_name,'course_key',co.course_key,'club',c.name,'club_key',c.legacy_key,'name',e.display_name,'division',e.division,
 'place',n.place,'tied',n.tied,'score',n.score,'award_name',n.award_name,'sentiment',n.sentiment,'photo_id',n.photo_id,'confirmed',n.confirmed,'format_note',t.format_note,
 'can_edit',private.messaging_account_available(auth.uid()) and exists(select 1 from public.club_memberships m where m.club_id=c.id and m.user_id=auth.uid() and m.membership_status='active') and (p.user_id=auth.uid() or private.club_user_is_active_admin_or_vice_admin(auth.uid(),c.id)),
 'can_confirm',private.messaging_account_available(auth.uid()) and private.club_user_is_active_admin_or_vice_admin(auth.uid(),c.id),
 'can_pin_course',private.messaging_account_available(auth.uid()) and private.course_actor_has_permission(auth.uid(),'courses.manage'),
 'can_pin_national',private.messaging_account_available(auth.uid()) and public.current_user_has_platform_permission('hall_of_fame.records.correct'),
 'pins',coalesce((select jsonb_agg(scope) from private.tournament_award_pins where news_id=n.id),'[]'::jsonb),
 'comments',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',display_name,'body',body,'date',created_at) order by created_at) from private.tournament_award_comments where news_id=n.id),'[]'::jsonb)) order by n.published_at desc,n.id),'[]'::jsonb)
 from private.tournament_award_news n join private.club_tournament_entries e on e.id=n.entry_id join private.club_score_people p on p.id=e.person_id
 join private.club_tournaments t on t.id=e.tournament_id join public.clubs c on c.id=t.club_id left join public.courses co on co.id=t.course_id
 where not n.hidden and not e.excluded and not p.anonymized and c.club_status='active' and (p_club_key is null or c.legacy_key=p_club_key) and (p_course_key is null or co.course_key=p_course_key) and (p_news_id is null or n.id=p_news_id);
$$;

create function public.get_tournament_award_photo(p_photo_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p private.tournament_award_photos; begin
 select * into p from private.tournament_award_photos where id=p_photo_id and ready;
 if p.id is null or not (
  exists(select 1 from private.tournament_award_news n join private.club_tournament_entries e on e.id=n.entry_id join private.club_score_people sp on sp.id=e.person_id join private.club_tournaments t on t.id=e.tournament_id join public.clubs c on c.id=t.club_id where n.photo_id=p.id and not n.hidden and not e.excluded and not sp.anonymized and c.club_status='active')
  or (p.owner_id=auth.uid() and private.messaging_account_available(auth.uid()) and exists(select 1 from private.club_tournament_entries e join private.club_tournaments t on t.id=e.tournament_id join public.club_memberships m on m.club_id=t.club_id where e.id=p.entry_id and not e.excluded and m.user_id=auth.uid() and m.membership_status='active'))
 ) then raise exception '사진을 조회할 수 없습니다.' using errcode='42501';end if;
 return jsonb_build_object('path',p.object_path,'mime',p.mime);
end $$;

create function public.comment_tournament_award(p_request_id uuid,p_news_id uuid,p_body text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; input jsonb:=jsonb_build_object('id',p_news_id,'body',p_body); begin
 perform id from public.user_accounts where id=auth.uid() for share;
 perform user_id from public.user_profiles where user_id=auth.uid() for share;
 perform id from public.consent_records where user_id=auth.uid() for share;
 if not private.messaging_account_available(auth.uid()) or jsonb_array_length(public.get_tournament_award_news(null,null,p_news_id))=0 then raise exception '로그인 상태와 공개 소식을 확인해 주세요.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,17));
 result:=private.club_extension_previous(auth.uid(),p_request_id,'tournament.comment',input);if result is not null then return result;end if;
 insert into private.tournament_award_comments(news_id,author_id,display_name,body) values(p_news_id,auth.uid(),private.messaging_display_name(auth.uid()),btrim(p_body)) returning jsonb_build_object('id',id) into result;
 perform private.club_extension_complete(auth.uid(),p_request_id,'tournament.comment',input,result);return result;
end $$;

create function public.pin_tournament_award(p_news_id uuid,p_scope text,p_pin boolean) returns void
language plpgsql security definer set search_path='' as $$
declare t private.club_tournaments; begin
 select t0.* into t from private.tournament_award_news n join private.club_tournament_entries e on e.id=n.entry_id join private.club_tournaments t0 on t0.id=e.tournament_id where n.id=p_news_id and not n.hidden;
 perform id from public.user_accounts where id=auth.uid() for share;
 if not private.messaging_account_available(auth.uid()) or t.id is null then raise exception '현재 권한을 확인해 주세요.' using errcode='42501';end if;
 if p_scope='club' then perform private.tournament_lock((select legacy_key from public.clubs where id=t.club_id),true);
 elsif p_scope='national' then
  perform private.require_hall_of_fame_platform_permission(auth.uid(),'hall_of_fame.records.correct');
 elsif p_scope='course' then
  -- Course stewards only edit course information; they do not inherit public pin authority.
  if not private.course_actor_has_permission(auth.uid(),'courses.manage') then raise exception '해당 영역의 관리 권한이 필요합니다.' using errcode='42501';end if;
  if p_scope='course' and t.course_id is null then raise exception '개최 구장 연결이 필요합니다.' using errcode='22023';end if;
 else raise exception '고정 영역을 확인해 주세요.' using errcode='22023';end if;
 if p_pin then insert into private.tournament_award_pins values(p_news_id,p_scope) on conflict do nothing;else delete from private.tournament_award_pins where news_id=p_news_id and scope=p_scope;end if;
end $$;

create function private.tournament_anonymize() returns trigger language plpgsql security definer set search_path='' as $$
declare u uuid; begin
 if tg_table_name='user_accounts' then u:=old.id;if tg_op='UPDATE' and new.account_status<>'withdrawn' then return new;end if;
 else u:=old.user_id;if tg_op='UPDATE' and new.display_name is not null then return new;end if;end if;
 update private.club_tournament_entries set display_name='탈퇴 회원' where person_id in(select id from private.club_score_people where user_id=u);
 update private.tournament_award_news set hidden=true,sentiment='',award_name='',version=version+1 where author_id=u or entry_id in(select e.id from private.club_tournament_entries e join private.club_score_people p on p.id=e.person_id where p.user_id=u);
 update private.tournament_award_comments set display_name='탈퇴 회원',body='삭제된 댓글' where author_id=u;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
create trigger tournament_account_erasure before delete or update of account_status on public.user_accounts for each row execute function private.tournament_anonymize();
create trigger tournament_profile_erasure before delete or update of display_name on public.user_profiles for each row execute function private.tournament_anonymize();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('tournament-awards-private','tournament-awards-private',false,5242880,array['image/jpeg','image/png','image/webp']);
revoke all on function private.tournament_lock(text,boolean),private.tournament_person(uuid,jsonb),private.tournament_news_entry(uuid,boolean),private.tournament_anonymize() from public,anon,authenticated,service_role;
revoke all on function public.get_club_tournaments(text),public.save_club_tournament(text,uuid,jsonb),public.register_tournament_intent(text,uuid,jsonb),public.prepare_tournament_award_photo(uuid,text),public.complete_tournament_award_photo(uuid,uuid),public.save_tournament_award_news(uuid,jsonb),public.confirm_tournament_award_news(uuid,jsonb),public.get_tournament_award_news(text,text,uuid),public.get_tournament_award_photo(uuid),public.comment_tournament_award(uuid,uuid,text),public.pin_tournament_award(uuid,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.get_club_tournaments(text),public.save_club_tournament(text,uuid,jsonb),public.register_tournament_intent(text,uuid,jsonb),public.prepare_tournament_award_photo(uuid,text),public.save_tournament_award_news(uuid,jsonb),public.confirm_tournament_award_news(uuid,jsonb),public.comment_tournament_award(uuid,uuid,text),public.pin_tournament_award(uuid,text,boolean) to authenticated;
grant execute on function public.get_tournament_award_news(text,text,uuid),public.get_tournament_award_photo(uuid) to anon,authenticated;
grant execute on function public.complete_tournament_award_photo(uuid,uuid) to service_role;
