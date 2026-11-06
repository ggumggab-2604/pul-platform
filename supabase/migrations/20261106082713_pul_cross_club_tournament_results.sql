-- A receiving sheet stores participation and a reference, never a second official score.
alter table private.club_tournament_entries
  add column source_entry_id uuid references private.club_tournament_entries(id),
  add column result_revision integer not null default 1,
  add constraint linked_tournament_entry_is_reference check (
    source_entry_id is null or (source_entry_id <> id and not confirmed and place is null
      and score is null and not tied and award = 'unconfirmed')
  );
alter table private.tournament_result_corrections
  add column requesting_entry_id uuid references private.club_tournament_entries(id),
  add column source_revision integer not null default 1;
create index club_tournament_event on private.club_tournaments(event_id) where event_id is not null;
create index tournament_entry_source on private.club_tournament_entries(source_entry_id) where source_entry_id is not null;
create index tournament_correction_requesting_entry on private.tournament_result_corrections(requesting_entry_id, requested_at desc)
where requesting_entry_id is not null;

create function private.tournament_entry_member(p_club uuid, p_user uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.club_memberships m join public.user_accounts a on a.id=m.user_id
    where m.club_id=p_club and m.user_id=p_user and m.membership_status='active' and a.account_status='active'
  )
$$;

create function private.tournament_scope_visible(t private.club_tournaments) returns boolean
language sql stable set search_path = '' as $$
  select (t.event_id is null or exists (
    select 1 from public.events ev where ev.id=t.event_id and ev.publication_status='published'
  )) and (t.schedule_id is null or exists (
    select 1 from public.club_official_events se where se.id=t.schedule_id
      and se.event_status not in ('draft','cancelled') and se.moderation_status='visible'
  ))
$$;

-- Exclude ambiguous legacy copies; never choose an origin by name or title.
create view private.tournament_shareable_results as
select e.id, e.division, e.place, e.tied, e.score, e.result_revision, e.award,
  t.id as tournament_id, t.club_id, t.event_id, p.user_id, ev.event_key
from private.club_tournament_entries e
join private.club_tournaments t on t.id=e.tournament_id
join private.club_score_people p on p.id=e.person_id and p.club_id=t.club_id and not p.anonymized
join public.clubs c on c.id=t.club_id and c.club_status='active' and c.directory_is_public
join public.events ev on ev.id=t.event_id and ev.start_date <= (statement_timestamp() at time zone 'Asia/Seoul')::date
left join private.tournament_hosts h on h.event_id=t.event_id
where e.confirmed and not e.excluded and e.attendance='attended' and e.division=any(t.divisions)
  and e.place is not null and e.score is not null and private.tournament_scope_visible(t)
  and private.tournament_entry_member(t.club_id,p.user_id)
  and (num_nonnulls(h.host_club_id,h.host_course_id)=0 or h.finalized_at is not null)
  and not exists (
    select 1 from private.club_tournaments ot join private.club_tournament_entries oe on oe.tournament_id=ot.id
    join private.club_score_people op on op.id=oe.person_id and op.user_id=p.user_id
    where ot.event_id=t.event_id and oe.division=e.division and oe.id<>e.id and oe.confirmed and not oe.excluded
  );
revoke all on private.tournament_shareable_results from public, anon, authenticated, service_role;
revoke all on function private.tournament_entry_member(uuid,uuid), private.tournament_scope_visible(private.club_tournaments)
from public, anon, authenticated, service_role;

create function public.find_cross_club_tournament_result(p_club_key text,p_event uuid,p_user uuid,p_division text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c uuid := private.monthly_club(p_club_key,true);
begin
  if not private.tournament_entry_member(c,p_user) then
    raise exception '현재 동호회 참가 회원을 선택해 주세요.' using errcode='42501';
  end if;
  -- An excluded roster row is not a participant until explicitly restored on the sheet.
  if exists (
    select 1 from private.club_tournaments t join private.club_tournament_entries e on e.tournament_id=t.id
    join private.club_score_people p on p.id=e.person_id and p.user_id=p_user
    where t.club_id=c and t.event_id=p_event and e.division=p_division and (e.excluded or not private.tournament_scope_visible(t))
  ) then return null; end if;
  return (select jsonb_build_object('id',s.id,'revision',s.result_revision,'eventKey',s.event_key,
      'place',s.place,'score',s.score,'tied',s.tied)
    from private.tournament_shareable_results s
    where s.event_id=p_event and s.user_id=p_user and s.division=p_division and s.club_id<>c);
end
$$;
revoke all on function public.find_cross_club_tournament_result(text,uuid,uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.find_cross_club_tournament_result(text,uuid,uuid,text) to authenticated;

create or replace function private.guard_linked_tournament_result() returns trigger
language plpgsql set search_path = '' as $$
declare t private.club_tournaments; member uuid; approved boolean; locked boolean;
begin
  if tg_op='UPDATE' and
    (new.attendance,new.place,new.score,new.tied,new.excluded,new.confirmed,new.award,new.source_entry_id)
    is not distinct from
    (old.attendance,old.place,old.score,old.tied,old.excluded,old.confirmed,old.award,old.source_entry_id)
  then return new; end if;
  if tg_op='UPDATE' then new.result_revision:=old.result_revision+1; end if;
  select * into t from private.club_tournaments where id=new.tournament_id;
  if t.event_id is null then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('pul-tournament:' || t.event_id,0));
  select p.user_id into member from private.club_score_people p
  where p.id=new.person_id and p.club_id=t.club_id and not p.anonymized;
  if new.source_entry_id is not null and not new.excluded and new.attendance='attended'
    and (tg_op='INSERT' or new.source_entry_id is distinct from old.source_entry_id or old.excluded or old.attendance<>'attended')
    and (not private.tournament_entry_member(t.club_id,member) or not private.tournament_scope_visible(t) or not exists (
      select 1 from private.tournament_shareable_results s
      where s.id=new.source_entry_id and s.event_id=t.event_id and s.user_id=member
        and s.division=new.division and s.club_id<>t.club_id
    )) then
    raise exception '현재 연결할 수 있는 원본 성적이 아닙니다.' using errcode='PT409';
  end if;
  select exists (
    select 1 from private.tournament_result_corrections q
    where q.entry_id=new.id and q.status='approved' and q.reviewed_by=auth.uid()
      and q.reviewed_at=statement_timestamp() and q.source_revision=old.result_revision
      and (new.place,new.score,new.tied)=(q.new_place,q.new_score,q.new_tied)
      and new.confirmed and not new.excluded and new.attendance='attended'
  ) into approved;
  locked := exists (
    select 1 from private.tournament_hosts h where h.event_id=t.event_id and h.finalized_at is not null
  ) and ((tg_op='UPDATE' and old.confirmed and not old.excluded) or (new.confirmed and not new.excluded));
  if not approved and (locked or (not new.excluded and (
    (tg_op='UPDATE' and old.confirmed and exists (
      select 1 from private.tournament_result_corrections q where q.entry_id=new.id and q.status='pending'
    )) or ((new.confirmed or new.place is not null or new.score is not null) and exists (
      select 1 from private.tournament_result_corrections q where q.requesting_entry_id=new.id and q.status='pending'
    ))
  ))) then
    raise exception '확정 또는 정정 검토 중인 성적입니다. 정정 승인 후 변경할 수 있습니다.' using errcode='PT409';
  end if;
  if new.excluded or not new.confirmed then return new; end if;
  if not private.tournament_entry_member(t.club_id,member) then
    raise exception '공식 결과에는 실제 참가한 현재 동호회 회원만 선택할 수 있습니다.' using errcode='42501';
  end if;
  if exists (
    select 1 from private.club_tournaments ot join private.club_tournament_entries e on e.tournament_id=ot.id
    join private.club_score_people p on p.id=e.person_id and p.user_id=member
    where ot.event_id=t.event_id and e.division=new.division and e.id<>new.id and e.confirmed and not e.excluded
  ) then
    raise exception '이 대회·부문에 이미 공식 결과가 있습니다. 기존 원본을 확인해 주세요.' using errcode='23505';
  end if;
  return new;
end
$$;
drop trigger guard_linked_tournament_result on private.club_tournament_entries;
create trigger guard_linked_tournament_result before insert or update of confirmed, attendance, place, score, tied, excluded, award, source_entry_id
on private.club_tournament_entries for each row execute function private.guard_linked_tournament_result();


create or replace function public.save_club_tournament(p_club_key text,p_request_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c uuid:=private.tournament_lock(p_club_key,true); t private.club_tournaments; old private.club_tournament_entries;
 r jsonb; request jsonb:=jsonb_build_object('club',c,'payload',p_payload); prior jsonb; result jsonb; pid uuid; eid uuid; n text; kept uuid[]:='{}'; ds text[]; competition uuid; src private.tournament_shareable_results; link uuid; reason text;
 cross_result jsonb; proposed_place integer; proposed_score integer; proposed_tied boolean;
 stored_place integer; stored_score integer; stored_tied boolean; stored_award text; stored_confirmed boolean;
 begin
 prior:=private.club_extension_previous(auth.uid(),p_request_id,'tournament.save',request);if prior is not null then return prior;end if;
 if p_request_id is null or jsonb_typeof(p_payload->'entries') is distinct from 'array' or jsonb_array_length(p_payload->'entries')>1000 then raise exception '참가 명단을 확인해 주세요.' using errcode='22023';end if;
 if nullif(p_payload->>'id','') is not null then
  select event_id into competition from private.club_tournaments where id=(p_payload->>'id')::uuid and club_id=c;
  if competition is not null then
    perform pg_advisory_xact_lock(hashtextextended('pul-tournament:' || competition,0));
  end if;
  select * into t from private.club_tournaments where id=(p_payload->>'id')::uuid and club_id=c for update;
  if not found then raise exception '이 동호회의 대회가 아닙니다.' using errcode='42501';end if;
  if t.version is distinct from (p_payload->>'version')::integer then raise exception '다른 수정이 먼저 저장되었습니다. 입력을 보관하고 새로 불러와 비교해 주세요.' using errcode='PT409';end if;
 end if;
 select array_agg(value) into ds from jsonb_array_elements_text(p_payload->'divisions');
 if nullif(p_payload->>'schedule_id','') is not null and not exists(select 1 from public.club_official_events where id=(p_payload->>'schedule_id')::uuid and club_id=c and event_type in('club_tournament','screen_tournament','friendly_match') and event_status not in('draft','cancelled') and moderation_status='visible') then raise exception '동호회 대회 일정을 확인해 주세요.' using errcode='22023';end if;
 if nullif(p_payload->>'event_id','') is not null and not exists(select 1 from public.events where id=(p_payload->>'event_id')::uuid and publication_status='published') then raise exception '대회 안내와 개최 구장 연결을 확인해 주세요.' using errcode='22023';end if;
 perform private.score_course_check(nullif(p_payload->>'course_id','')::uuid,nullif(p_payload->>'event_id','')::uuid,nullif(p_payload->>'schedule_id','')::uuid,p_payload->'course_confirmation',t.course_id);
 if t.id is null then
  insert into private.club_tournaments(club_id,title,played_on,course_id,course_name,event_id,schedule_id,divisions,format_note,note,comparison_basis)
  values(c,btrim(p_payload->>'title'),(p_payload->>'played_on')::date,nullif(p_payload->>'course_id','')::uuid,btrim(p_payload->>'course_name'),nullif(p_payload->>'event_id','')::uuid,nullif(p_payload->>'schedule_id','')::uuid,ds,coalesce(p_payload->>'format_note',''),coalesce(p_payload->>'note',''),coalesce(p_payload->>'comparison_basis','unconfirmed')) returning * into t;
 else
  -- Only an explicit, version-checked correction changes these snapshots; directory edits never do.
  update private.club_tournaments set title=btrim(p_payload->>'title'),played_on=(p_payload->>'played_on')::date,course_id=nullif(p_payload->>'course_id','')::uuid,course_name=btrim(p_payload->>'course_name'),event_id=nullif(p_payload->>'event_id','')::uuid,schedule_id=nullif(p_payload->>'schedule_id','')::uuid,divisions=ds,format_note=coalesce(p_payload->>'format_note',''),comparison_basis=case when p_payload?'comparison_basis' then p_payload->>'comparison_basis' else comparison_basis end,note=coalesce(p_payload->>'note',''),version=version+1,updated_at=now() where id=t.id returning * into t;
 end if;
 if t.event_id is not null then
  perform 1 from public.events where id=t.event_id and publication_status='published' for share;
  if not found then raise exception '현재 공개 중인 대회를 선택해 주세요.' using errcode='PT409'; end if;
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
  proposed_place:=nullif(r->>'place','')::integer;
  proposed_score:=nullif(r->>'score','')::integer;
  proposed_tied:=coalesce((r->>'tied')::boolean,false);
  stored_place:=proposed_place; stored_score:=proposed_score; stored_tied:=proposed_tied;
  stored_award:=r->>'award'; stored_confirmed:=r->>'attendance'='attended' and stored_award<>'unconfirmed';
  link:=old.source_entry_id; cross_result:=r->'cross_result'; reason:=null;
  if jsonb_typeof(cross_result)='object' then
    if t.event_id is null or old.excluded or old.confirmed
      or r->>'attendance' is distinct from 'attended' or proposed_place is null or proposed_place<1
      or proposed_score is null or proposed_score<1 or not private.tournament_scope_visible(t)
      or not private.tournament_entry_member(c,(r->>'user_id')::uuid)
      or not exists (select 1 from private.club_score_people p where p.id=pid and not p.anonymized) then
      raise exception '현재 참가 회원·부문의 성적만 연결하거나 정정을 요청할 수 있습니다.' using errcode='42501';
    end if;
    select * into src from private.tournament_shareable_results s
      where s.id=(cross_result->>'id')::uuid and s.event_id=t.event_id and s.club_id<>c
        and s.user_id=(r->>'user_id')::uuid and s.division=r->>'division' and (link is null or s.id=link);
    if not found or src.result_revision is distinct from (cross_result->>'revision')::integer then
      raise exception '원본이 변경됐거나 공개되지 않습니다. 원본을 다시 확인해 주세요.' using errcode='PT409';
    end if;
    if exists(select 1 from private.tournament_result_corrections where requesting_entry_id=old.id and status='pending') then
      raise exception '이미 이 참가 성적의 정정을 요청했습니다.' using errcode='PT409';
    end if;
    if (proposed_place,proposed_score,proposed_tied)=(src.place,src.score,src.tied) then
      link:=src.id;
    else
      reason:=btrim(coalesce(cross_result->>'reason',''));
      if char_length(reason) not between 2 and 500 then
        raise exception '원본과 다른 성적은 정정 사유를 입력해 주세요.' using errcode='22023';
      end if;
      if exists(select 1 from private.tournament_result_corrections where entry_id=src.id and status='pending') then
        raise exception '이미 원본 검토자가 처리 중인 정정 요청이 있습니다.' using errcode='PT409';
      end if;
    end if;
  end if;
  if link is not null or reason is not null then
    stored_place:=null; stored_score:=null; stored_tied:=false;
    stored_award:='unconfirmed'; stored_confirmed:=false;
  end if;
  if old.id is null then
    insert into private.club_tournament_entries(tournament_id,person_id,display_name,division,intent,registration,attendance,
      award,place,tied,score,confirmed,confirmed_by,source_entry_id)
    values(t.id,pid,n,r->>'division',r->>'intent',r->>'registration',r->>'attendance',
      stored_award,stored_place,stored_tied,stored_score,stored_confirmed,auth.uid(),link) returning id into eid;
  else
    update private.club_tournament_entries set intent=r->>'intent',registration=r->>'registration',attendance=r->>'attendance',
      award=stored_award,place=stored_place,tied=stored_tied,score=stored_score,confirmed=stored_confirmed,
      confirmed_by=auth.uid(),excluded=false,source_entry_id=link where id=old.id returning id into eid;
  end if;
  if eid=any(kept) then raise exception '같은 참가자·부문이 중복되었습니다.' using errcode='23505';end if;kept:=array_append(kept,eid);
  if reason is not null then
    insert into private.tournament_result_corrections(entry_id,requesting_entry_id,requested_by,reason,
      old_place,old_score,old_tied,new_place,new_score,new_tied,source_revision)
    values(src.id,eid,auth.uid(),reason,src.place,src.score,src.tied,proposed_place,proposed_score,proposed_tied,src.result_revision);
  end if;
  if link is not null or reason is not null then
    update private.tournament_award_news set hidden=true,version=version+1 where entry_id=eid and not hidden;
  else
    update private.tournament_award_news set confirmed=false,version=version+1 where entry_id=eid and confirmed
      and ((place,score,tied) is distinct from (stored_place,stored_score,stored_tied) or stored_award<>'yes');
  end if;
 end loop;
 update private.club_tournament_entries set excluded=true where tournament_id=t.id and not(id=any(kept));
 update private.tournament_award_news set hidden=true,version=version+1 where entry_id in(select id from private.club_tournament_entries where tournament_id=t.id and excluded) and not hidden;
 result:=jsonb_build_object('id',t.id,'version',t.version);perform private.club_extension_complete(auth.uid(),p_request_id,'tournament.save',request,result);return result;
end $$;

create or replace function public.get_club_tournaments(p_club_key text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c uuid:=private.monthly_club(p_club_key,false); manager boolean; result jsonb; begin
 manager:=private.club_user_is_active_admin_or_vice_admin(auth.uid(),c);
 select jsonb_build_object('club_key',p_club_key,'club_name',(select name from public.clubs where id=c),'user_id',auth.uid(),'can_edit',manager,
 'tournaments',coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('course_key',(select course_key from public.courses where id=t.course_id),'linked_course_name',(select name from public.courses where id=t.course_id),'played_course_name',(select played_course_name from private.tournament_hosts where event_id=t.event_id),
 'host_finalized',exists(select 1 from private.tournament_hosts where event_id=t.event_id and finalized_at is not null),
 'host_confirmation_pending',coalesce((select finalized_at is null and num_nonnulls(host_club_id,host_course_id)>0 from private.tournament_hosts where event_id=t.event_id),false),'entries',coalesce((
    select jsonb_agg((to_jsonb(e)-'source_entry_id')||jsonb_build_object(
      'user_id',p.user_id,'kind',p.kind,'linked',e.source_entry_id is not null,
      'source_event_key',src.event_key,
      'correction_status',case when manager then request.status end,
      'place',case when e.source_entry_id is null then e.place else src.place end,
      'score',case when e.source_entry_id is null then e.score else src.score end,
      'tied',case when e.source_entry_id is null then e.tied else coalesce(src.tied,false) end,
      'award',case when e.source_entry_id is null then e.award else coalesce(src.award,'unconfirmed') end,
      'confirmed',case when e.source_entry_id is null then e.confirmed else src.id is not null end,
      'news_id',case when not n.hidden and private.tournament_scope_visible(t) then n.id end,
      'news_version',n.version,'news_confirmed',n.confirmed and not n.hidden
    ) order by e.display_name,e.id)
    from private.club_tournament_entries e join private.club_score_people p on p.id=e.person_id
    left join private.tournament_shareable_results src on src.id=e.source_entry_id and src.event_id=t.event_id
      and src.user_id=p.user_id and src.division=e.division and not p.anonymized and e.attendance='attended'
      and e.division=any(t.divisions) and private.tournament_entry_member(c,p.user_id) and private.tournament_scope_visible(t)
    left join private.tournament_award_news n on n.entry_id=e.id
    left join lateral (
      select q.status from private.tournament_result_corrections q
      where manager and q.requesting_entry_id=e.id order by (q.status='pending') desc,q.requested_at desc,q.id limit 1
    ) request on true
    where e.tournament_id=t.id and not e.excluded
  ),'[]'::jsonb)) order by t.played_on desc,t.id) from private.club_tournaments t where t.club_id=c),'[]'::jsonb)) into result;
 if manager then result:=result||jsonb_build_object(
 'members',coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'person_id',p.id,'display_name',coalesce(pr.display_name,'이름 미등록'),'kind','member') order by pr.display_name,m.user_id) from public.club_memberships m join public.user_accounts a on a.id=m.user_id join public.user_profiles pr on pr.user_id=a.id left join private.club_score_people p on p.club_id=c and p.user_id=m.user_id where m.club_id=c and m.membership_status='active' and a.account_status='active' and not coalesce(p.anonymized,false)),'[]'::jsonb),
 'manual_people',coalesce((select jsonb_agg(jsonb_build_object('person_id',p.id,'user_id',null,'display_name',n.display_name,'kind','manual')) from private.club_score_people p join lateral(select display_name from private.club_tournament_entries where person_id=p.id order by id limit 1)n on true where p.club_id=c and p.kind='manual'),'[]'::jsonb),
 'courses',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'course_key',course_key) order by name) from public.courses where course_status<>'removed'),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'date',start_date,'version',version,'match_type',match_type,'played_course_name',(select played_course_name from private.tournament_hosts where event_id=events.id),'course_id',related_course_id,'course_name',coalesce((select name from public.courses where id=related_course_id),venue_name),'course_key',(select course_key from public.courses where id=related_course_id)) order by start_date desc) from public.events where publication_status='published'),'[]'::jsonb),
 'schedules',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'date',(starts_at at time zone 'Asia/Seoul')::date,'version',version,'course_key',linked_course_legacy_key,'course_name',coalesce((select name from public.courses where course_key=linked_course_legacy_key),location))) from public.club_official_events where club_id=c and event_type in('club_tournament','screen_tournament','friendly_match') and event_status not in('draft','cancelled') and moderation_status='visible'),'[]'::jsonb));end if;
 if manager then
   result:=result||jsonb_build_object('external_corrections',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',q.id,'eventKey',ev.event_key,'title',ev.title,'name',e.display_name,'division',e.division,'reason',q.reason,
      'oldPlace',q.old_place,'oldScore',q.old_score,'oldTied',q.old_tied,
      'newPlace',q.new_place,'newScore',q.new_score,'newTied',q.new_tied
    ) order by q.requested_at,q.id)
    from private.tournament_result_corrections q join private.club_tournament_entries e on e.id=q.entry_id
    join private.club_tournaments t on t.id=e.tournament_id and t.club_id=c
    join public.events ev on ev.id=t.event_id
    left join private.tournament_hosts h on h.event_id=t.event_id
    where q.status='pending' and num_nonnulls(h.host_club_id,h.host_course_id)=0
   ),'[]'::jsonb));
 end if;
 return result;
end $$;

create or replace function private.tournament_news_entry(p_entry uuid,p_manage boolean default false) returns private.club_tournament_entries
language plpgsql security definer set search_path='' as $$
declare e private.club_tournament_entries; c uuid; k text; p private.club_score_people; competition uuid; begin
 select * into e from private.club_tournament_entries where id=p_entry and not excluded;
 select club_id,event_id into c,competition from private.club_tournaments where id=e.tournament_id;
 select legacy_key into k from public.clubs where id=c;
 perform private.tournament_lock(k,p_manage);
 if competition is not null then
   perform pg_advisory_xact_lock(hashtextextended('pul-tournament:' || competition,0));
 end if;
 select * into e from private.club_tournament_entries where id=p_entry and not excluded;
 select * into p from private.club_score_people where id=e.person_id;
 if e.source_entry_id is not null or exists (
   select 1 from private.tournament_result_corrections where requesting_entry_id=e.id and status='pending'
 ) then raise exception '연결된 공식 성적은 원본 성적에서 관리합니다.' using errcode='42501'; end if;
 if e.id is null or p.anonymized or (not private.club_user_is_active_admin_or_vice_admin(auth.uid(),c) and p.user_id is distinct from auth.uid()) then raise exception '본인 또는 해당 동호회 회장·부회장만 등록할 수 있습니다.' using errcode='42501';end if;
 return e;
end $$;

create or replace function public.get_tournament_award_news(p_club_key text default null,p_course_key text default null,p_news_id uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'entry_id',e.id,'version',n.version,'tournament_version',t.version,'tournament_id',t.id,
 'title',t.title,'date',t.played_on,'course',t.course_name,'course_key',co.course_key,'club',c.name,'club_key',c.legacy_key,'name',private.hall_viewer_name(p.user_id, e.display_name),'division',e.division,
 'place',n.place,'tied',n.tied,'score',n.score,'award_name',n.award_name,'sentiment',n.sentiment,'photo_id',n.photo_id,'confirmed',n.confirmed and not exists (
    select 1 from private.tournament_hosts h where h.event_id=t.event_id
      and num_nonnulls(h.host_club_id,h.host_course_id)>0 and h.finalized_at is null
  ),'format_note',t.format_note,
 'can_edit',private.messaging_account_available(auth.uid()) and exists(select 1 from public.club_memberships m where m.club_id=c.id and m.user_id=auth.uid() and m.membership_status='active') and (p.user_id=auth.uid() or private.club_user_is_active_admin_or_vice_admin(auth.uid(),c.id)),
 'can_confirm',private.messaging_account_available(auth.uid()) and private.club_user_is_active_admin_or_vice_admin(auth.uid(),c.id),
 'can_pin_course',private.messaging_account_available(auth.uid()) and private.course_actor_has_permission(auth.uid(),'courses.manage'),
 'can_pin_national',private.messaging_account_available(auth.uid()) and public.current_user_has_platform_permission('hall_of_fame.records.correct'),
 'pins',coalesce((select jsonb_agg(scope) from private.tournament_award_pins where news_id=n.id),'[]'::jsonb),
 'comments',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',private.hall_viewer_name(author_id, display_name),'body',body,'date',created_at) order by created_at) from private.tournament_award_comments where news_id=n.id),'[]'::jsonb)) order by n.published_at desc,n.id),'[]'::jsonb)
 from private.tournament_award_news n join private.club_tournament_entries e on e.id=n.entry_id join private.club_score_people p on p.id=e.person_id
 join private.club_tournaments t on t.id=e.tournament_id join public.clubs c on c.id=t.club_id left join public.courses co on co.id=t.course_id
 where private.tournament_scope_visible(t) and not n.hidden and not e.excluded and not p.anonymized and c.club_status='active' and (c.directory_is_public or ((p_club_key=c.legacy_key or p_news_id=n.id) and private.club_user_has_permission(auth.uid(), c.id, 'club.posts.read'))) and (p_club_key is null or c.legacy_key=p_club_key) and (p_course_key is null or co.course_key=p_course_key) and (p_news_id is null or n.id=p_news_id);
$$;

create or replace function public.get_tournament_award_photo(p_photo_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p private.tournament_award_photos; begin
 select * into p from private.tournament_award_photos where id=p_photo_id and ready;
 if p.id is null or not (
  exists(select 1 from private.tournament_award_news n join private.club_tournament_entries e on e.id=n.entry_id join private.club_score_people sp on sp.id=e.person_id join private.club_tournaments t on t.id=e.tournament_id join public.clubs c on c.id=t.club_id where private.tournament_scope_visible(t) and n.photo_id=p.id and not n.hidden and not e.excluded and not sp.anonymized and c.club_status='active' and (c.directory_is_public or private.club_user_has_permission(auth.uid(), c.id, 'club.posts.read')))
  or (p.owner_id=auth.uid() and private.messaging_account_available(auth.uid()) and exists(select 1 from private.club_tournament_entries e join private.club_tournaments t on t.id=e.tournament_id join public.club_memberships m on m.club_id=t.club_id where e.id=p.entry_id and not e.excluded and m.user_id=auth.uid() and m.membership_status='active'))
 ) then raise exception '사진을 조회할 수 없습니다.' using errcode='42501';end if;
 return jsonb_build_object('path',p.object_path,'mime',p.mime);
end $$;

-- Same-club requests keep their existing host review route and now carry the reviewed revision.
drop function public.request_pul_tournament_correction(text,uuid,uuid,integer,integer,boolean,text);
create function public.request_pul_tournament_correction(
  p_club_key text,p_entry uuid,p_request_id uuid,p_place integer,p_score integer,p_tied boolean,
  p_reason text,p_source_revision integer
) returns void language plpgsql security definer set search_path = '' as $$
declare c uuid; competition uuid; src private.tournament_shareable_results; actor uuid:=auth.uid();
  payload jsonb:=jsonb_build_array(p_club_key,p_entry,p_place,p_score,p_tied,btrim(p_reason),p_source_revision);
begin
  c:=private.tournament_lock(p_club_key,true);
  if private.club_extension_previous(actor,p_request_id,'event.tournament.correction',payload) is not null then return; end if;
  select t.event_id into competition from private.club_tournaments t
  join private.club_tournament_entries e on e.tournament_id=t.id
  where t.club_id=c and e.id=p_entry;
  if competition is null then raise exception '이 동호회의 공식 대회 성적을 선택해 주세요.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('pul-tournament:' || competition,0));
  select * into src from private.tournament_shareable_results where id=p_entry and club_id=c;
  if not found or src.result_revision is distinct from p_source_revision
    or not exists(select 1 from private.tournament_hosts where event_id=competition and finalized_at is not null) then
    raise exception '확정된 원본 성적을 다시 확인해 주세요.' using errcode='PT409';
  end if;
  if p_place is null or p_place<1 or p_score is null or p_score<1 or p_tied is null
    or char_length(coalesce(btrim(p_reason),'')) not between 2 and 500
    or (p_place,p_score,p_tied)=(src.place,src.score,src.tied) then
    raise exception '변경할 순위·타수와 정정 사유를 확인해 주세요.' using errcode='22023';
  end if;
  if exists(select 1 from private.tournament_result_corrections where entry_id=p_entry and status='pending') then
    raise exception '이미 처리 중인 정정 요청이 있습니다.' using errcode='PT409';
  end if;
  insert into private.tournament_result_corrections(entry_id,requested_by,reason,old_place,old_score,old_tied,
    new_place,new_score,new_tied,source_revision)
  values(p_entry,actor,btrim(p_reason),src.place,src.score,src.tied,p_place,p_score,p_tied,src.result_revision);
  perform private.club_extension_complete(actor,p_request_id,'event.tournament.correction',payload,'{}'::jsonb);
end
$$;
revoke all on function public.request_pul_tournament_correction(text,uuid,uuid,integer,integer,boolean,text,integer)
from public, anon, authenticated, service_role;
grant execute on function public.request_pul_tournament_correction(text,uuid,uuid,integer,integer,boolean,text,integer) to authenticated;

create or replace function public.review_pul_tournament_correction(p_event_key text,p_correction uuid,p_approve boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  h private.tournament_hosts; q private.tournament_result_corrections; t private.club_tournaments;
  src private.tournament_shareable_results; receiving private.club_tournaments;
  actor uuid:=auth.uid(); club_key text; managed boolean;
  decision text:=case when p_approve then 'approved' else 'rejected' end;
begin
  perform private.messaging_assert_read_committed();
  if p_approve is null or not coalesce(private.messaging_account_available(actor),false) then
    raise exception '현재 정정 검토 권한을 확인해 주세요.' using errcode='42501';
  end if;
  select ts.* into t from private.tournament_result_corrections req
  join private.club_tournament_entries ent on ent.id=req.entry_id
  join private.club_tournaments ts on ts.id=ent.tournament_id
  join public.events ev on ev.id=ts.event_id and ev.event_key=p_event_key
  where req.id=p_correction;
  if not found then raise exception '정정 요청을 확인할 수 없습니다.' using errcode='42501'; end if;
  select * into h from private.tournament_hosts where event_id=t.event_id;
  managed:=num_nonnulls(h.host_club_id,h.host_course_id)>0;
  if managed and (h.finalized_at is null or not private.tournament_host_can_finalize(h,actor)) then
    raise exception '대회 주최자만 정정 요청을 처리할 수 있습니다.' using errcode='42501';
  end if;
  if managed and h.host_course_id is not null then
    perform private.course_next_lock();
  else
    -- External results reuse the original club's existing confirmation authority.
    select legacy_key into club_key from public.clubs where id=coalesce(h.host_club_id,t.club_id);
    perform private.tournament_lock(club_key,true);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('pul-tournament:' || t.event_id,0));
  perform 1 from public.events where id=t.event_id for share;
  if managed and not private.tournament_host_can_finalize(h,actor) then
    raise exception '현재 대회 주최 권한을 확인해 주세요.' using errcode='42501';
  end if;
  select * into q from private.tournament_result_corrections where id=p_correction for update;
  if q.status=decision then return; end if;
  if q.status<>'pending' then raise exception '이미 처리된 정정 요청입니다.' using errcode='PT409'; end if;
  if p_approve then
    select * into src from private.tournament_shareable_results where id=q.entry_id and event_id=t.event_id;
    if not found or src.result_revision<>q.source_revision
      or (src.place,src.score,src.tied) is distinct from (q.old_place,q.old_score,q.old_tied) then
      raise exception '원본이 변경됐거나 공개되지 않습니다. 승인할 수 없습니다.' using errcode='PT409';
    end if;
    if q.requesting_entry_id is not null then
      select rt.* into receiving from private.club_tournament_entries e
      join private.club_tournaments rt on rt.id=e.tournament_id and rt.event_id=src.event_id and rt.club_id<>src.club_id
      join public.clubs c on c.id=rt.club_id and c.club_status='active'
      join private.club_score_people p on p.id=e.person_id and p.club_id=rt.club_id and p.user_id=src.user_id and not p.anonymized
      where e.id=q.requesting_entry_id and e.division=src.division and e.division=any(rt.divisions)
        and e.attendance='attended' and not e.excluded and not e.confirmed and (e.source_entry_id is null or e.source_entry_id=src.id)
        and private.tournament_entry_member(rt.club_id,p.user_id) and private.tournament_scope_visible(rt);
      if not found then raise exception '요청 동호회의 참가 상태가 변경되어 승인할 수 없습니다.' using errcode='PT409'; end if;
    end if;
  end if;
  update private.tournament_result_corrections set status=decision,reviewed_by=actor,reviewed_at=statement_timestamp() where id=q.id;
  if p_approve then
    update private.club_tournament_entries set place=q.new_place,score=q.new_score,tied=q.new_tied,
      award=case when q.new_place between 1 and 3 then 'yes' else 'no' end where id=q.entry_id;
    update private.tournament_award_news set
      place=case when q.new_place between 1 and 3 then q.new_place else place end,
      score=q.new_score,tied=q.new_tied,hidden=hidden or q.new_place>3,version=version+1
    where entry_id=q.entry_id and confirmed;
    if receiving.id is not null then
      update private.club_tournament_entries set source_entry_id=q.entry_id where id=q.requesting_entry_id;
    end if;
    update private.club_tournaments set version=version+1,updated_at=now()
    where id=t.id or id=receiving.id;
  end if;
end
$$;

-- The linked entries stay outside every score aggregate. Suppress the canonical score if its event is hidden.
create or replace view private.public_personal_score_sources as
select s.* from private.personal_score_sources s join public.clubs c on c.id=s.club_id
left join private.tournament_hosts h on s.kind='tournament' and h.event_id=s.linked_event_id
left join private.club_tournaments t on s.kind='tournament' and t.id=s.event_id
where c.club_status='active' and c.directory_is_public and s.exclusion_reason is null and s.user_id is not null
  and (num_nonnulls(h.host_club_id,h.host_course_id)=0 or h.finalized_at is not null)
  and (t.id is null or private.tournament_scope_visible(t));

create or replace function public.register_tournament_intent(p_club_key text,p_request_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c uuid:=private.tournament_lock(p_club_key,false); t private.club_tournaments; pid uuid; result jsonb; request jsonb:=jsonb_build_object('club',c,'payload',p_payload); begin
 result:=private.club_extension_previous(auth.uid(),p_request_id,'tournament.intent',request);if result is not null then return result;end if;
 select * into t from private.club_tournaments where club_id=c and id=(p_payload->>'id')::uuid;
 if t.event_id is not null then
   perform pg_advisory_xact_lock(hashtextextended('pul-tournament:' || t.event_id,0));
   select * into t from private.club_tournaments where club_id=c and id=t.id for update;
 end if;
 if not found then raise exception '대회를 확인해 주세요.' using errcode='42501';end if;
 if t.version is distinct from (p_payload->>'version')::integer then raise exception '명단이 변경되었습니다. 새로 불러와 주세요.' using errcode='PT409';end if;
 if p_payload->>'intent' not in('individual','group') or not(p_payload->>'division'=any(t.divisions)) then raise exception '참가 방식과 부문을 선택해 주세요.' using errcode='22023';end if;
 pid:=private.tournament_person(c,jsonb_build_object('user_id',auth.uid()));
 if exists(select 1 from private.club_tournament_entries where tournament_id=t.id and person_id=pid and division=p_payload->>'division' and (registration='complete' or attendance<>'unconfirmed')) then raise exception '접수·참가 확인 뒤 변경은 회장·부회장에게 문의해 주세요.' using errcode='22023';end if;
 insert into private.club_tournament_entries(tournament_id,person_id,display_name,division,intent) values(t.id,pid,private.messaging_display_name(auth.uid()),p_payload->>'division',p_payload->>'intent') on conflict(tournament_id,person_id,division) do update set intent=excluded.intent,excluded=false;
 update private.club_tournaments set version=version+1,updated_at=now() where id=t.id;
 result:=jsonb_build_object('id',t.id);perform private.club_extension_complete(auth.uid(),p_request_id,'tournament.intent',request,result);return result;
end $$;

notify pgrst, 'reload schema';
