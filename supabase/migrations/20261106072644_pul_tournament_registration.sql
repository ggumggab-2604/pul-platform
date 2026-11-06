create function public.register_pul_tournament(p_request_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  host_scope text := p_payload->>'scope';
  host_key text := p_payload->>'hostKey';
  match_kind text := p_payload->>'matchType';
  event_region text := p_payload->>'region';
  venue public.courses;
  venue_name text := btrim(p_payload->>'venueName');
  played_course text := btrim(p_payload->>'playedCourseName');
  host_name text := btrim(p_payload->>'organizer');
  club_id uuid;
  course_host_id uuid;
  saved public.events;
  prior jsonb;
  result jsonb;
begin
  perform private.messaging_assert_read_committed();
  if not coalesce(private.messaging_account_available(actor), false) then
    raise exception '활동 중인 회원 계정이 필요합니다.' using errcode = '42501';
  end if;
  if host_scope is null or host_scope not in ('club','course','external') then
    raise exception '대회 개최 유형을 확인해 주세요.' using errcode = '22023';
  end if;

  if host_scope = 'club' then
    club_id := private.tournament_lock(host_key, true);
    select name into host_name from public.clubs
    where id = club_id and club_status = 'active' and directory_is_public;
    if not found then raise exception '공개 동호회의 회장·부회장만 공개 대회를 등록할 수 있습니다.' using errcode = '42501'; end if;
  elsif host_scope = 'course' then
    perform private.course_next_lock();
    select * into venue from public.courses
    where course_key = host_key and course_type = 'screen' and course_status = 'active' for share;
    if not found or not private.course_current_operator(venue.id, actor) then
      raise exception '해당 스크린 매장의 운영자만 대회를 등록할 수 있습니다.' using errcode = '42501';
    end if;
    course_host_id := venue.id;
    match_kind := 'screen';
    host_name := venue.name;
  end if;

  prior := private.club_extension_previous(actor, p_request_id, 'event.tournament.register', p_payload);
  if prior is not null then return prior; end if;
  if host_scope <> 'course' and nullif(p_payload->>'venueKey', '') is not null then
    select * into venue from public.courses
    where course_key = p_payload->>'venueKey' and course_type = match_kind and course_status = 'active' for share;
    if not found then raise exception '경기 종류와 실제 개최 구장을 확인해 주세요.' using errcode = '22023'; end if;
  end if;
  if venue.id is not null then
    venue_name := venue.name;
    event_region := case
      when venue.region in ('서울','경기','인천','강원','충청','전라','경상','제주') then venue.region
      when venue.region in ('대전','세종','충북','충남') then '충청'
      when venue.region in ('광주','전북','전남') then '전라'
      when venue.region in ('부산','대구','울산','경북','경남') then '경상'
      else event_region end;
  end if;
  if match_kind is null or match_kind not in ('field','screen')
    or char_length(coalesce(played_course, '')) not between 1 and 200
    or nullif(p_payload->>'playedOn', '') is null
    or char_length(coalesce(venue_name,'')) not between 2 and 200
    or char_length(coalesce(host_name,'')) not between 2 and 200 then
    raise exception '개최 장소·코스·날짜와 주최 정보를 확인해 주세요.' using errcode = '22023';
  end if;

  insert into public.events (
    event_key, title, match_type, event_scale, region, venue_name, venue_type, start_date,
    registration_status, target_audience, organizer, summary, related_course_id,
    publication_status, created_by, updated_by
  ) values (
    'tournament-' || gen_random_uuid(), btrim(p_payload->>'title'), match_kind,
    case when host_scope = 'course' then 'store' else 'friendly' end, event_region, venue_name,
    match_kind, (p_payload->>'playedOn')::date, 'needCheck', array['파크골프 참가자'], host_name,
    btrim(p_payload->>'summary'), venue.id, case when host_scope = 'external' then 'hidden' else 'published' end, actor, actor
  ) returning * into saved;
  insert into private.tournament_hosts (event_id, host_club_id, host_course_id, played_course_name)
  values (saved.id, club_id, course_host_id, played_course);
  result := jsonb_build_object('key', saved.event_key, 'published', saved.publication_status = 'published');
  perform private.club_extension_complete(actor, p_request_id, 'event.tournament.register', p_payload, result);
  return result;
end
$$;
revoke all on function public.register_pul_tournament(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.register_pul_tournament(uuid, jsonb) to authenticated;

create function public.get_public_tournament_course(p_event_key text) returns text
language sql stable security definer set search_path = '' as $$
  select host.played_course_name
  from public.events event join private.tournament_hosts host on host.event_id = event.id
  where event.event_key = p_event_key and event.publication_status = 'published'
$$;
revoke all on function public.get_public_tournament_course(text) from public, anon, authenticated, service_role;
grant execute on function public.get_public_tournament_course(text) to anon, authenticated;

-- Linked club score sheets keep their own original IDs but take competition metadata from the event.
-- Existing unlinked sheets remain addressable and are never merged by title.
create function private.guard_linked_tournament() returns trigger
language plpgsql set search_path = '' as $$
declare ev public.events;
begin
  if tg_op = 'UPDATE' and old.event_id is not null and new.event_id is distinct from old.event_id then
    raise exception '연결된 원본 대회는 변경할 수 없습니다.' using errcode = 'PT409';
  end if;
  if new.event_id is null then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('pul-tournament:' || new.event_id, 0));
  if tg_op = 'INSERT' or new.event_id is distinct from old.event_id then
    if exists (select 1 from private.club_tournaments t where t.event_id = new.event_id and t.club_id = new.club_id and t.id <> new.id) then
      raise exception '이미 이 대회의 동호회 성적표가 있습니다. 기존 성적표를 열어 주세요.' using errcode = '23505';
    end if;
  end if;
  select * into ev from public.events where id = new.event_id;
  if found and exists (select 1 from private.tournament_hosts where event_id = new.event_id) then
    new.title := ev.title;
    new.played_on := ev.start_date;
    new.course_id := ev.related_course_id;
    new.course_name := ev.venue_name;
    if ev.match_type = 'screen' and new.comparison_basis = 'outdoor_18_single' then
      raise exception '스크린 대회는 필드 18홀 순위에 포함할 수 없습니다.' using errcode = '22023';
    end if;
  end if;
  return new;
end
$$;
revoke all on function private.guard_linked_tournament() from public, anon, authenticated, service_role;
create trigger guard_linked_tournament before insert or update on private.club_tournaments
for each row execute function private.guard_linked_tournament();

create table private.tournament_result_corrections (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references private.club_tournament_entries(id),
  requested_by uuid references public.user_accounts(id) on delete set null,
  reason text not null check (char_length(reason) between 2 and 500),
  old_place integer not null,
  old_score integer not null,
  old_tied boolean not null,
  new_place integer not null check (new_place > 0),
  new_score integer not null check (new_score > 0),
  new_tied boolean not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_at timestamptz not null default clock_timestamp(),
  reviewed_by uuid references public.user_accounts(id) on delete set null,
  reviewed_at timestamptz
);
alter table private.tournament_result_corrections enable row level security;
revoke all on private.tournament_result_corrections from public, anon, authenticated, service_role;
create unique index tournament_result_one_pending_correction on private.tournament_result_corrections(entry_id)
where status = 'pending';

create function private.guard_linked_tournament_result() returns trigger
language plpgsql set search_path = '' as $$
declare competition uuid; club uuid; member uuid;
begin
  select event_id, club_id into competition, club from private.club_tournaments where id = new.tournament_id;
  if competition is null then return new; end if;
  if tg_op = 'UPDATE' and (new.attendance, new.place, new.score, new.tied, new.excluded, new.confirmed)
      is not distinct from (old.attendance, old.place, old.score, old.tied, old.excluded, old.confirmed) then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('pul-tournament:' || competition, 0));
  if exists (select 1 from private.tournament_hosts h where h.event_id = competition and h.finalized_at is not null)
    and ((tg_op = 'UPDATE' and old.confirmed and not old.excluded) or (new.confirmed and not new.excluded))
    and not exists (
      select 1 from private.tournament_result_corrections q where q.entry_id = new.id and q.status = 'approved'
        and q.reviewed_by = auth.uid() and q.reviewed_at = statement_timestamp()
        and (new.place, new.score, new.tied) = (q.new_place, q.new_score, q.new_tied)
        and new.confirmed and not new.excluded and new.attendance = 'attended'
    ) then
    raise exception '주최자가 확정한 성적입니다. 정정 승인 후 변경할 수 있습니다.' using errcode = 'PT409';
  end if;
  if new.excluded or not new.confirmed then return new; end if;
  select p.user_id into member from private.club_score_people p
  join public.club_memberships m on m.user_id = p.user_id and m.club_id = club and m.membership_status = 'active'
  join public.user_accounts a on a.id = p.user_id and a.account_status = 'active'
  where p.id = new.person_id and p.club_id = club and not p.anonymized;
  if member is null then
    raise exception '공식 결과에는 실제 참가한 현재 동호회 회원만 선택할 수 있습니다.' using errcode = '42501';
  end if;
  if exists (
    select 1 from private.club_tournament_entries e
    join private.club_tournaments t on t.id = e.tournament_id and t.event_id = competition
    join private.club_score_people p on p.id = e.person_id and p.user_id = member
    where e.id <> new.id and e.division = new.division and e.confirmed and not e.excluded
  ) then
    raise exception '이 대회·부문에 이미 공식 결과가 있습니다. 기존 결과를 확인해 주세요.' using errcode = '23505';
  end if;
  return new;
end
$$;
revoke all on function private.guard_linked_tournament_result() from public, anon, authenticated, service_role;
create trigger guard_linked_tournament_result before insert or update of confirmed, attendance, place, score, tied, excluded
on private.club_tournament_entries for each row execute function private.guard_linked_tournament_result();

create or replace function public.get_club_tournaments(p_club_key text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c uuid:=private.monthly_club(p_club_key,false); manager boolean; result jsonb; begin
 manager:=private.club_user_is_active_admin_or_vice_admin(auth.uid(),c);
 select jsonb_build_object('club_key',p_club_key,'club_name',(select name from public.clubs where id=c),'user_id',auth.uid(),'can_edit',manager,
 'tournaments',coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('course_key',(select course_key from public.courses where id=t.course_id),'linked_course_name',(select name from public.courses where id=t.course_id),'played_course_name',(select played_course_name from private.tournament_hosts where event_id=t.event_id),
 'host_finalized',exists(select 1 from private.tournament_hosts where event_id=t.event_id and finalized_at is not null),
 'host_confirmation_pending',coalesce((select finalized_at is null and num_nonnulls(host_club_id,host_course_id)>0 from private.tournament_hosts where event_id=t.event_id),false),'entries',coalesce((select jsonb_agg(to_jsonb(e)||jsonb_build_object('user_id',p.user_id,'kind',p.kind,'news_id',case when not n.hidden then n.id end,'news_version',n.version,'news_confirmed',n.confirmed and not n.hidden) order by e.display_name,e.id)
 from private.club_tournament_entries e join private.club_score_people p on p.id=e.person_id left join private.tournament_award_news n on n.entry_id=e.id where e.tournament_id=t.id and not e.excluded),'[]'::jsonb)) order by t.played_on desc,t.id) from private.club_tournaments t where t.club_id=c),'[]'::jsonb)) into result;
 if manager then result:=result||jsonb_build_object(
 'members',coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'person_id',p.id,'display_name',coalesce(pr.display_name,'이름 미등록'),'kind','member') order by pr.display_name,m.user_id) from public.club_memberships m join public.user_accounts a on a.id=m.user_id join public.user_profiles pr on pr.user_id=a.id left join private.club_score_people p on p.club_id=c and p.user_id=m.user_id where m.club_id=c and m.membership_status='active' and a.account_status='active' and not coalesce(p.anonymized,false)),'[]'::jsonb),
 'manual_people',coalesce((select jsonb_agg(jsonb_build_object('person_id',p.id,'user_id',null,'display_name',n.display_name,'kind','manual')) from private.club_score_people p join lateral(select display_name from private.club_tournament_entries where person_id=p.id order by id limit 1)n on true where p.club_id=c and p.kind='manual'),'[]'::jsonb),
 'courses',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'course_key',course_key) order by name) from public.courses where course_status<>'removed'),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'date',start_date,'version',version,'match_type',match_type,'played_course_name',(select played_course_name from private.tournament_hosts where event_id=events.id),'course_id',related_course_id,'course_name',coalesce((select name from public.courses where id=related_course_id),venue_name),'course_key',(select course_key from public.courses where id=related_course_id)) order by start_date desc) from public.events where publication_status='published'),'[]'::jsonb),
 'schedules',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'date',(starts_at at time zone 'Asia/Seoul')::date,'version',version,'course_key',linked_course_legacy_key,'course_name',coalesce((select name from public.courses where course_key=linked_course_legacy_key),location))) from public.club_official_events where club_id=c and event_type in('club_tournament','screen_tournament','friendly_match') and event_status not in('draft','cancelled') and moderation_status='visible'),'[]'::jsonb));end if;
 return result;
end $$;

create function private.tournament_host_can_finalize(p_host private.tournament_hosts, p_actor uuid)
returns boolean language sql stable set search_path = '' as $$
  select coalesce(private.messaging_account_available(p_actor) and (
    (p_host.host_club_id is not null and private.club_user_is_active_admin_or_vice_admin(p_actor, p_host.host_club_id))
    or (p_host.host_course_id is not null and private.course_current_operator(p_host.host_course_id, p_actor))
  ), false)
$$;
revoke all on function private.tournament_host_can_finalize(private.tournament_hosts, uuid) from public, anon, authenticated, service_role;

create function public.get_pul_tournament_host_results(p_event_key text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare h private.tournament_hosts; rows jsonb;
begin
  select host.* into h from public.events ev join private.tournament_hosts host on host.event_id=ev.id
  where ev.event_key=p_event_key and ev.publication_status='published';
  if not private.tournament_host_can_finalize(h, auth.uid()) then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'entry', e.id, 'name', e.display_name, 'club', c.name, 'division', e.division, 'place', e.place, 'score', e.score, 'tied', e.tied
    ) order by e.division, e.place, e.id), '[]'::jsonb) into rows
    from private.club_tournaments t join private.club_tournament_entries e on e.tournament_id=t.id
    join public.clubs c on c.id=t.club_id and c.directory_is_public and c.club_status='active'
    join private.club_score_people p on p.id=e.person_id and p.user_id is not null and not p.anonymized
    join public.user_accounts a on a.id=p.user_id and a.account_status='active'
    where t.event_id=h.event_id and e.confirmed and not e.excluded and e.place is not null and e.score is not null;
  return jsonb_build_object('finalized', h.finalized_at is not null, 'entries', rows, 'reviewToken', md5(rows::text),
    'corrections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id, 'name', e.display_name, 'division', e.division, 'reason', q.reason,
        'oldPlace', q.old_place, 'oldScore', q.old_score, 'oldTied', q.old_tied,
        'newPlace', q.new_place, 'newScore', q.new_score, 'newTied', q.new_tied
      ) order by q.requested_at, q.id)
      from private.tournament_result_corrections q join private.club_tournament_entries e on e.id = q.entry_id
      join private.club_tournaments t on t.id = e.tournament_id
      where t.event_id = h.event_id and q.status = 'pending' and not e.excluded
    ), '[]'::jsonb));
end
$$;
revoke all on function public.get_pul_tournament_host_results(text) from public, anon, authenticated, service_role;
grant execute on function public.get_pul_tournament_host_results(text) to authenticated;

create function public.finalize_pul_tournament_results(p_event_key text, p_review_token text)
returns void language plpgsql security definer set search_path = '' as $$
declare h private.tournament_hosts; actor uuid := auth.uid(); event_date date; club_key text; reviewed jsonb;
begin
  perform private.messaging_assert_read_committed();
  select host.* into h from public.events ev join private.tournament_hosts host on host.event_id=ev.id
  where ev.event_key=p_event_key and ev.publication_status='published';
  if not private.tournament_host_can_finalize(h, actor) then
    raise exception '대회 주최자만 결과를 확정할 수 있습니다.' using errcode='42501';
  end if;
  if h.host_club_id is not null then
    select legacy_key into club_key from public.clubs where id=h.host_club_id;
    perform private.tournament_lock(club_key, true);
  else
    perform private.course_next_lock();
  end if;
  perform pg_advisory_xact_lock(hashtextextended('pul-tournament:' || h.event_id, 0));
  select ev.start_date into event_date from public.events ev
  where ev.id=h.event_id and ev.publication_status='published' for share;
  if not found or not private.tournament_host_can_finalize(h, actor) then
    raise exception '대회의 공개 상태와 주최 권한을 확인해 주세요.' using errcode='42501';
  end if;
  if event_date is null or event_date > (statement_timestamp() at time zone 'Asia/Seoul')::date then
    raise exception '경기일 이후 결과를 확정할 수 있습니다.' using errcode='22023';
  end if;
  reviewed := public.get_pul_tournament_host_results(p_event_key);
  if reviewed->>'reviewToken' is distinct from p_review_token or p_review_token is null then
    raise exception '검토하는 동안 성적이 변경됐습니다. 새로고침 후 다시 확인해 주세요.' using errcode='PT409';
  end if;
  if jsonb_array_length(reviewed->'entries') = 0 then
    raise exception '확정할 공식 결과를 먼저 입력해 주세요.' using errcode='22023';
  end if;
  update private.tournament_hosts set finalized_at=clock_timestamp(),finalized_by=actor
  where event_id=h.event_id and finalized_at is null;
end
$$;
revoke all on function public.finalize_pul_tournament_results(text, text) from public, anon, authenticated, service_role;
grant execute on function public.finalize_pul_tournament_results(text, text) to authenticated;

create function public.request_pul_tournament_correction(
  p_club_key text, p_entry uuid, p_request_id uuid, p_place integer, p_score integer, p_tied boolean, p_reason text
) returns void language plpgsql security definer set search_path = '' as $$
declare c uuid; t private.club_tournaments; e private.club_tournament_entries; actor uuid := auth.uid();
  payload jsonb := jsonb_build_array(p_club_key,p_entry,p_place,p_score,p_tied,btrim(p_reason));
begin
  c := private.tournament_lock(p_club_key,true);
  if private.club_extension_previous(actor,p_request_id,'event.tournament.correction',payload) is not null then return; end if;
  select * into t from private.club_tournaments
  where id=(select tournament_id from private.club_tournament_entries where id=p_entry) and club_id=c;
  if not found or t.event_id is null then raise exception '이 동호회의 연결된 대회 성적을 선택해 주세요.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('pul-tournament:' || t.event_id, 0));
  select * into e from private.club_tournament_entries where id=p_entry and confirmed and not excluded and attendance='attended' for update;
  if not found or e.place is null or e.score is null
     or not exists(select 1 from private.tournament_hosts where event_id=t.event_id and finalized_at is not null) then
    raise exception '주최자가 확정한 참가 성적만 정정을 요청할 수 있습니다.' using errcode='22023';
  end if;
  if p_place is null or p_place<1 or p_score is null or p_score<1 or p_tied is null
    or char_length(coalesce(btrim(p_reason),'')) not between 2 and 500
    or (p_place,p_score,p_tied)=(e.place,e.score,e.tied) then
    raise exception '변경할 순위·타수와 정정 사유를 확인해 주세요.' using errcode='22023';
  end if;
  if exists(select 1 from private.tournament_result_corrections where entry_id=p_entry and status='pending') then
    raise exception '이미 주최자가 검토 중인 정정 요청이 있습니다.' using errcode='PT409';
  end if;
  insert into private.tournament_result_corrections(entry_id,requested_by,reason,old_place,old_score,old_tied,new_place,new_score,new_tied)
  values (p_entry,actor,btrim(p_reason),e.place,e.score,e.tied,p_place,p_score,p_tied);
  perform private.club_extension_complete(actor,p_request_id,'event.tournament.correction',payload,'{}'::jsonb);
end
$$;
revoke all on function public.request_pul_tournament_correction(text,uuid,uuid,integer,integer,boolean,text) from public, anon, authenticated, service_role;
grant execute on function public.request_pul_tournament_correction(text,uuid,uuid,integer,integer,boolean,text) to authenticated;

create function public.review_pul_tournament_correction(p_event_key text,p_correction uuid,p_approve boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare h private.tournament_hosts; q private.tournament_result_corrections; e private.club_tournament_entries;
  actor uuid := auth.uid(); club_key text;
begin
  perform private.messaging_assert_read_committed();
  select host.* into h from private.tournament_hosts host join public.events ev on ev.id=host.event_id
  where ev.event_key=p_event_key and ev.publication_status='published' and host.finalized_at is not null;
  if not private.tournament_host_can_finalize(h,actor) or p_approve is null then
    raise exception '대회 주최자만 정정 요청을 처리할 수 있습니다.' using errcode='42501';
  end if;
  if h.host_club_id is not null then
    select legacy_key into club_key from public.clubs where id=h.host_club_id;
    perform private.tournament_lock(club_key,true);
  else
    perform private.course_next_lock();
  end if;
  perform pg_advisory_xact_lock(hashtextextended('pul-tournament:' || h.event_id, 0));
  perform 1 from public.events where id=h.event_id and publication_status='published' for share;
  if not found or not private.tournament_host_can_finalize(h,actor) then
    raise exception '현재 대회 주최 권한을 확인해 주세요.' using errcode='42501';
  end if;
  select req.* into q from private.tournament_result_corrections req
  join private.club_tournament_entries ent on ent.id=req.entry_id
  join private.club_tournaments t on t.id=ent.tournament_id and t.event_id=h.event_id
  where req.id=p_correction for update of req;
  if not found then raise exception '정정 요청을 찾을 수 없습니다.' using errcode='42501'; end if;
  if q.status=(case when p_approve then 'approved' else 'rejected' end) then return; end if;
  if q.status<>'pending' then raise exception '이미 처리된 정정 요청입니다.' using errcode='PT409'; end if;
  select * into e from private.club_tournament_entries where id=q.entry_id for update;
  if p_approve and (e.excluded or not e.confirmed or (e.place,e.score,e.tied) is distinct from (q.old_place,q.old_score,q.old_tied)) then
    raise exception '원본이 변경되어 다시 확인해야 합니다.' using errcode='PT409';
  end if;
  update private.tournament_result_corrections set status=case when p_approve then 'approved' else 'rejected' end,
    reviewed_by=actor,reviewed_at=statement_timestamp() where id=q.id;
  if p_approve then
    update private.club_tournament_entries set place=q.new_place,score=q.new_score,tied=q.new_tied,
      award=case when q.new_place between 1 and 3 then 'yes' else 'no' end
    where id=q.entry_id;
    update private.tournament_award_news set
      place=case when q.new_place between 1 and 3 then q.new_place else place end,
      score=q.new_score,tied=q.new_tied,hidden=hidden or q.new_place>3,version=version+1
    where entry_id=q.entry_id and confirmed;
  end if;
end
$$;
revoke all on function public.review_pul_tournament_correction(text,uuid,boolean) from public, anon, authenticated, service_role;
grant execute on function public.review_pul_tournament_correction(text,uuid,boolean) to authenticated;

notify pgrst, 'reload schema';
