-- Legacy pending requests keep their pre-approval behavior.
alter table private.tournament_result_corrections
  add column applied_revision integer,
  add column old_award text,
  add column news_reopen_version integer,
  add column national_periods text[] not null default '{}',
  add column rejection_reason text;

create table private.tournament_correction_messages (
  message_id uuid primary key references public.messaging_messages(id) on delete cascade,
  correction_id uuid not null references private.tournament_result_corrections(id)
);
alter table private.tournament_correction_messages enable row level security;
revoke all on private.tournament_correction_messages from public,anon,authenticated,service_role;

create function private.tournament_has_managed_host(p_event uuid) returns boolean
language sql stable set search_path='' as $$
  select exists (select 1 from private.tournament_hosts h
    where h.event_id=p_event and num_nonnulls(h.host_club_id,h.host_course_id)>0)
$$;

create function private.tournament_approval_pending(p_entry uuid) returns boolean
language sql stable set search_path='' as $$
  select exists (select 1 from private.tournament_result_corrections q
    where q.entry_id=p_entry and q.status='pending' and q.applied_revision is not null)
$$;

-- The override compares both versions against the same snapshot of everyone else's results.
create function private.hall_ranked_scores(p_period text,p_old_entry uuid default null,p_old_score integer default null)
returns table (
  source_id uuid, source_key text, kind text, played_on date, entered_at timestamptz,
  user_id uuid, display_name text, club_name text, course_name text, score integer,
  metric numeric, "position" bigint, tied boolean
)
language sql stable set search_path='' as $$
  with calendar as (
    select (statement_timestamp() at time zone 'Asia/Seoul')::date as today
  ), inputs as (
    select s.source_id,s.source_key,s.kind,s.played_on,s.entered_at,s.user_id,s.display_name,
      s.club_name,s.course_name,case when s.kind='tournament' and s.source_id=p_old_entry
        then p_old_score else s.score end as score
    from private.hall_national_score_sources s cross join calendar d
    where s.played_on<=d.today and case p_period
      when 'today' then s.entered_at >= (d.today::timestamp at time zone 'Asia/Seoul')
                    and s.entered_at < ((d.today+1)::timestamp at time zone 'Asia/Seoul')
      when 'month' then s.played_on >= date_trunc('month',d.today)::date
      when 'year' then s.played_on >= (d.today-interval '1 year')::date
      else true end
  ), candidates as (
    select i.*,
      row_number() over (
        partition by i.user_id
        order by case when p_period<>'year' then i.score end,
                 case when p_period='year' then i.played_on end desc,
                 case when p_period='year' then i.entered_at end desc,
                 i.entered_at,i.source_key
      ) as choice,
      avg(i.score) over (partition by i.user_id) as mean_score
    from inputs i
  ), chosen as (
    select c.source_id,c.source_key,c.kind,c.played_on,c.entered_at,c.user_id,c.display_name,
      c.club_name,c.course_name,c.score,case when p_period='year' then round(c.mean_score,2) else c.score end as metric
    from candidates c where c.choice=1
  )
  select c.*, rank() over (order by c.metric), count(*) over (partition by c.metric)>1
  from chosen c
$$;

create function private.sync_external_tournament_news(p_entry uuid,p_place integer,p_score integer,p_tied boolean,p_reopen_version integer)
returns void language sql set search_path='' as $$
  update private.tournament_award_news set
    place=case when p_place between 1 and 3 then p_place else place end,
    score=p_score,tied=p_tied,
    hidden=(hidden and version is distinct from p_reopen_version) or p_place>3,version=version+1
  where entry_id=p_entry
$$;

create function private.bump_external_tournament_sheets(p_entry uuid,p_already_saved uuid)
returns void language sql set search_path='' as $$
  update private.club_tournaments t set version=t.version+1,updated_at=now()
  where t.id is distinct from p_already_saved and t.id in (
    select e.tournament_id from private.club_tournament_entries e
    where e.id=p_entry or (e.source_entry_id=p_entry and not e.excluded)
  )
$$;

revoke all on function private.tournament_has_managed_host(uuid),private.tournament_approval_pending(uuid),
  private.hall_ranked_scores(text,uuid,integer),private.sync_external_tournament_news(uuid,integer,integer,boolean,integer),
  private.bump_external_tournament_sheets(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function private.messaging_create(p_recipient_id uuid, p_reply_id uuid, p_body text, p_request_id uuid, p_correction_notice boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := private.messaging_assert_actor();
  v_recipient uuid := p_recipient_id;
  v_original public.messaging_messages%rowtype;
  v_previous public.messaging_messages%rowtype;
  v_body text := private.messaging_trim(p_body);
  v_normal text := private.messaging_normalize(p_body);
  v_hash text; v_recipient_key text; v_fingerprint text; v_now timestamptz; v_id uuid; v_first boolean;
  v_recent integer; v_day integer; v_new_recent integer; v_new_day integer;
begin
  perform private.messaging_assert_read_committed();
  if p_request_id is null or v_body is null or char_length(v_body) not between 1 and 2000
    or (p_recipient_id is null) = (p_reply_id is null) then
    raise exception 'messaging_invalid' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(1297303345, pg_catalog.hashtext(v_actor::text));
  select m.* into v_previous from public.messaging_messages m
    where m.sender_user_id = v_actor and m.request_id = p_request_id;
  if found then
    -- A successful reply already fixed its counterpart. The original may now be
    -- hidden or its sender physically deleted; replay is only an acknowledgement.
    v_recipient_key := case when p_reply_id is not null then v_previous.recipient_key
      else pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_recipient_id::text,'UTF8')),'hex') end;
    v_fingerprint := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      pg_catalog.jsonb_build_array(case when p_reply_id is null then 'send' else 'reply' end,
        v_recipient_key, v_normal, p_reply_id)::text,'UTF8')),'hex');
    if v_previous.request_fingerprint <> v_fingerprint then
      raise exception 'messaging_replay_conflict' using errcode = '22023';
    end if;
    perform private.messaging_assert_actor();
    return pg_catalog.jsonb_build_object('id',v_previous.id,'created_at',v_previous.created_at);
  end if;
  -- Only new writes resolve the original's current participant relation.
  if p_reply_id is not null then
    select m.* into v_original from public.messaging_messages m where m.id = p_reply_id;
    if v_original.kind<>'direct' then raise exception 'messaging_not_found' using errcode='P0002'; end if;
    if v_original.sender_user_id = v_actor then
      select r.recipient_user_id into v_recipient from public.messaging_recipients r where r.message_id = p_reply_id;
    elsif exists (select 1 from public.messaging_recipients r where r.message_id = p_reply_id and r.recipient_user_id = v_actor) then
      v_recipient := v_original.sender_user_id;
    else raise exception 'messaging_not_found' using errcode = 'P0002'; end if;
  end if;
  v_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_normal,'UTF8')),'hex');
  v_recipient_key := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_recipient::text,'UTF8')),'hex');
  v_fingerprint := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_array(case when p_reply_id is null then 'send' else 'reply' end,
      v_recipient_key, v_normal, p_reply_id)::text,'UTF8')),'hex');
  if v_recipient is null or v_recipient = v_actor then
    raise exception 'messaging_recipient_unavailable' using errcode = 'P0002';
  end if;
  perform private.messaging_lock_pair(v_actor,v_recipient);
  -- Both accounts are locked in UUID order. Status changes winning first are seen;
  -- later changes wait until this send finishes. Profiles/consents use current snapshot.
  perform a.id from public.user_accounts a where a.id in (v_actor,v_recipient) order by a.id for share;
  perform private.messaging_assert_actor();
  if not private.messaging_account_available(v_recipient)
    or exists (select 1 from public.messaging_blocks b
      where (b.blocker_user_id=v_actor and b.blocked_user_id=v_recipient)
         or (b.blocker_user_id=v_recipient and b.blocked_user_id=v_actor)) then
    raise exception 'messaging_recipient_unavailable' using errcode = 'P0002';
  end if;
  if p_reply_id is not null then
    select m.* into v_original from public.messaging_messages m where m.id=p_reply_id for share;
    if v_original.sender_user_id=v_actor then
      if v_original.sender_hidden_at is not null then raise exception 'messaging_not_found' using errcode='P0002'; end if;
    else
      perform r.message_id from public.messaging_recipients r where r.message_id=p_reply_id
        and r.recipient_user_id=v_actor and r.hidden_at is null for share;
      if not found then raise exception 'messaging_not_found' using errcode='P0002'; end if;
    end if;
  end if;
  v_now := pg_catalog.clock_timestamp();
  if not p_correction_notice and exists (select 1 from public.messaging_messages m where m.kind='direct' and m.sender_user_id=v_actor and m.created_at > v_now-interval '3 seconds') then
    raise exception 'messaging_cooldown' using errcode='P0001';
  end if;
  select count(*) filter(where m.created_at > v_now-interval '10 minutes'), count(*),
    count(*) filter(where m.first_contact and m.created_at > v_now-interval '10 minutes'), count(*) filter(where m.first_contact)
    into v_recent,v_day,v_new_recent,v_new_day
    from public.messaging_messages m where m.kind='direct' and m.sender_user_id=v_actor and m.created_at > v_now-interval '24 hours';
  if v_recent >= 20 or v_day >= 100 then raise exception 'messaging_quota' using errcode='P0001'; end if;
  select not exists (select 1 from public.messaging_messages m
    where m.kind='direct' and m.sender_user_id=v_actor and m.recipient_key=v_recipient_key) into v_first;
  if v_first and (v_new_recent >= 5 or v_new_day >= 20) then raise exception 'messaging_new_recipient_quota' using errcode='P0001'; end if;
  if (select count(*) from public.messaging_messages m
      where m.kind='direct' and m.sender_user_id=v_actor and m.recipient_key=v_recipient_key and m.created_at > v_now-interval '10 minutes') >= 10 then
    raise exception 'messaging_recipient_quota' using errcode='P0001';
  end if;
  if not p_correction_notice and exists (select 1 from public.messaging_messages m
      where m.kind='direct' and m.sender_user_id=v_actor and m.recipient_key=v_recipient_key and m.created_at > v_now-interval '10 minutes' and m.body_hash=v_hash) then
    raise exception 'messaging_duplicate' using errcode='P0001';
  end if;
  if not p_correction_notice and (select count(distinct m.recipient_key) from public.messaging_messages m
      where m.kind='direct' and m.sender_user_id=v_actor and m.created_at > v_now-interval '10 minutes' and m.body_hash=v_hash) >= 3 then
    raise exception 'messaging_duplicate' using errcode='P0001';
  end if;
  insert into public.messaging_messages(sender_user_id,body,body_hash,recipient_key,reply_to_message_id,request_id,request_fingerprint,first_contact,created_at)
    values(v_actor,v_body,v_hash,v_recipient_key,p_reply_id,p_request_id,v_fingerprint,v_first,v_now) returning id into v_id;
  insert into public.messaging_recipients(message_id,recipient_user_id,received_at) values(v_id,v_recipient,v_now);
  return pg_catalog.jsonb_build_object('id',v_id,'created_at',v_now);
end;
$$;

revoke all on function private.messaging_create(uuid,uuid,text,uuid,boolean) from public,anon,authenticated,service_role;

create or replace function private.messaging_create(p_recipient_id uuid,p_reply_id uuid,p_body text,p_request_id uuid)
returns jsonb language sql security definer set search_path='' as $$
  select private.messaging_create(p_recipient_id,p_reply_id,p_body,p_request_id,false)
$$;

create function private.apply_external_tournament_correction(
  src private.tournament_shareable_results,p_receiver uuid,p_saved_sheet uuid,p_reason text,
  p_place integer,p_score integer,p_tied boolean
) returns void language plpgsql set search_path='' as $$
declare
  correction uuid; reopen_version integer; rank_periods text[]:='{}'; needs_review boolean;
  body text; recipient uuid; message_id uuid; recipient_count integer:=0;
begin
  insert into private.tournament_result_corrections(entry_id,requesting_entry_id,requested_by,reason,
    old_place,old_score,old_tied,new_place,new_score,new_tied,source_revision,applied_revision,old_award,requested_at)
  values(src.id,p_receiver,auth.uid(),p_reason,src.place,src.score,src.tied,p_place,p_score,p_tied,
    src.result_revision,src.result_revision+1,src.award,statement_timestamp())
  returning id into correction;
  update private.club_tournament_entries set place=p_place,score=p_score,tied=p_tied,
    award=case when p_place=src.place then src.award when p_place between 1 and 3 then 'yes' else 'no' end
  where id=src.id;
  if src.score<>p_score and exists (
    select 1 from private.hall_national_score_sources where kind='tournament' and source_id=src.id
  ) then
    select coalesce(array_agg(period),'{}') into rank_periods
    from unnest(array['month','year','all','today']) period
    left join lateral (
      select position,tied from private.hall_ranked_scores(period,src.id,src.score) where user_id=src.user_id
    ) before_rank on true
    left join lateral (
      select position,tied from private.hall_ranked_scores(period) where user_id=src.user_id
    ) after_rank on true
    where (before_rank.position,before_rank.tied) is distinct from (after_rank.position,after_rank.tied);
  end if;
  needs_review:=(src.place,src.tied) is distinct from (p_place,p_tied) or cardinality(rank_periods)>0;
  -- Erasure increments the news version even if the correction already hid it.
  select version+1 into reopen_version from private.tournament_award_news
  where entry_id=src.id and p_place>3 and not hidden for update;
  update private.tournament_result_corrections set
    status=case when needs_review then 'pending' else 'approved' end, national_periods=rank_periods,
    news_reopen_version=reopen_version
  where id=correction;
  perform private.sync_external_tournament_news(src.id,p_place,p_score,p_tied,null);
  perform private.bump_external_tournament_sheets(src.id,p_saved_sheet);

  select format(E'[대회 성적 정정] %s\n%s · %s\n변경 전 %s%s위 · %s타\n변경 후 %s%s위 · %s타\n수정 사유 %s\n\n%s',
    ev.title,e.display_name,e.division,case when src.tied then '공동 ' else '' end,src.place,src.score,
    case when p_tied then '공동 ' else '' end,p_place,p_score,p_reason,
    case when needs_review then '새 성적이 반영됐습니다. 승인 대기 중인 성적을 확인해 주세요.'
      else '착오나 문제가 있으면 이 쪽지에 답장해 주세요' end)
  into body from public.events ev cross join private.club_tournament_entries e
  where ev.id=src.event_id and e.id=src.id;

  for recipient in
    select distinct m.user_id from public.club_memberships m where m.club_id=src.club_id
      and private.club_user_is_active_admin_or_vice_admin(m.user_id,src.club_id)
      and private.messaging_account_available(m.user_id)
    order by m.user_id
  loop
    recipient_count:=recipient_count+1;
    if recipient=auth.uid() then continue; end if;
    begin
      message_id:=(private.messaging_create(recipient,null,body,gen_random_uuid(),true)->>'id')::uuid;
    exception when sqlstate 'P0002' or sqlstate 'P0001' then
      raise exception '원본 동호회 운영진에게 쪽지를 보낼 수 없어 성적을 저장하지 못했습니다.' using errcode='PT409';
    end;
    insert into private.tournament_correction_messages values(message_id,correction);
  end loop;
  if recipient_count=0 then
    raise exception '쪽지를 받을 수 있는 원본 동호회 운영진을 확인해 주세요.' using errcode='PT409';
  end if;
end
$$;
revoke all on function private.apply_external_tournament_correction(private.tournament_shareable_results,uuid,uuid,text,integer,integer,boolean)
from public,anon,authenticated,service_role;

create function public.get_tournament_correction_message(p_message_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',q.id,'clubKey',c.legacy_key)
  from private.tournament_correction_messages n
  join private.tournament_result_corrections q on q.id=n.correction_id and q.status='pending'
  join private.club_tournament_entries e on e.id=q.entry_id
  join private.club_tournaments t on t.id=e.tournament_id
  join public.clubs c on c.id=t.club_id
  join public.messaging_recipients r on r.message_id=n.message_id and r.recipient_user_id=auth.uid() and r.hidden_at is null
  where n.message_id=p_message_id and private.messaging_account_available(auth.uid())
    and private.club_user_is_active_admin_or_vice_admin(auth.uid(),c.id)
$$;
revoke all on function public.get_tournament_correction_message(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_tournament_correction_message(uuid) to authenticated;

create or replace function public.find_cross_club_tournament_result(p_club_key text,p_event uuid,p_user uuid,p_division text)
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
      'external',not private.tournament_has_managed_host(s.event_id),'place',s.place,'score',s.score,'tied',s.tied)
    from private.tournament_shareable_results s
    where s.event_id=p_event and s.user_id=p_user and s.division=p_division and s.club_id<>c);
end
$$;

create or replace function private.guard_linked_tournament_result() returns trigger
language plpgsql set search_path = '' as $$
declare t private.club_tournaments; member uuid; approved boolean; locked boolean; applied boolean;
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
  if tg_op='UPDATE' then
    select exists (
      select 1 from private.tournament_result_corrections q
      where q.entry_id=old.id and q.applied_revision is not null
        and new.confirmed and not new.excluded and new.attendance='attended'
        and new.source_entry_id is null and (
          (q.status='pending' and q.requested_by=auth.uid() and q.requested_at=statement_timestamp()
            and old.result_revision=q.source_revision
            and (new.place,new.score,new.tied)=(q.new_place,q.new_score,q.new_tied))
          or (q.status='rejected' and q.reviewed_by=auth.uid() and q.reviewed_at=statement_timestamp()
            and old.result_revision=q.applied_revision
            and (new.place,new.score,new.tied,new.award)=(q.old_place,q.old_score,q.old_tied,q.old_award))
        )
    ) into applied;
    if not applied and private.tournament_approval_pending(old.id) then
      raise exception '승인 대기 중인 원본 성적입니다.' using errcode='PT409';
    end if;
  end if;
  locked := exists (
    select 1 from private.tournament_hosts h where h.event_id=t.event_id and h.finalized_at is not null
  ) and ((tg_op='UPDATE' and old.confirmed and not old.excluded) or (new.confirmed and not new.excluded));
  if not approved and not coalesce(applied,false) and (locked or (not new.excluded and (
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

create or replace function public.save_club_tournament(p_club_key text,p_request_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c uuid; t private.club_tournaments; old private.club_tournament_entries;
 r jsonb; request jsonb; prior jsonb; result jsonb; pid uuid; eid uuid; n text; kept uuid[]:='{}'; ds text[]; competition uuid; src private.tournament_shareable_results; link uuid; reason text;
 cross_result jsonb; proposed_place integer; proposed_score integer; proposed_tied boolean;
 stored_place integer; stored_score integer; stored_tied boolean; stored_award text; stored_confirmed boolean;
 immediate boolean; requested_event uuid; lock_event uuid;
 begin
 if exists(select 1 from jsonb_array_elements(case when jsonb_typeof(p_payload->'entries')='array' then p_payload->'entries' else '[]'::jsonb end) x
   where jsonb_typeof(x->'cross_result')='object') then
   perform pg_advisory_xact_lock(hashtextextended('pul-tournament-cross-club-save',0));
 end if;
 c:=private.tournament_lock(p_club_key,true);
 request:=jsonb_build_object('club',c,'payload',p_payload);
 prior:=private.club_extension_previous(auth.uid(),p_request_id,'tournament.save',request);if prior is not null then return prior;end if;
 if p_request_id is null or jsonb_typeof(p_payload->'entries') is distinct from 'array' or jsonb_array_length(p_payload->'entries')>1000 then raise exception '참가 명단을 확인해 주세요.' using errcode='22023';end if;
 requested_event:=nullif(p_payload->>'event_id','')::uuid;
 select event_id into competition from private.club_tournaments where id=nullif(p_payload->>'id','')::uuid and club_id=c;
 for lock_event in select distinct id from unnest(array[competition,requested_event]) id where id is not null order by id loop
   perform pg_advisory_xact_lock(hashtextextended('pul-tournament:' || lock_event,0));
 end loop;
 if nullif(p_payload->>'id','') is not null then
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
  if (t.event_id,t.played_on,t.schedule_id,t.course_id,t.divisions,t.comparison_basis) is distinct from
      (requested_event,(p_payload->>'played_on')::date,nullif(p_payload->>'schedule_id','')::uuid,
       nullif(p_payload->>'course_id','')::uuid,ds,coalesce(p_payload->>'comparison_basis',t.comparison_basis))
     and exists (select 1 from private.club_tournament_entries e where e.tournament_id=t.id
       and private.tournament_approval_pending(e.id)) then
    raise exception '승인 대기 중인 원본 성적의 대회 정보를 변경할 수 없습니다.' using errcode='PT409';
  end if;
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
  link:=old.source_entry_id; cross_result:=r->'cross_result'; reason:=null; immediate:=false;
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
      immediate:=not private.tournament_has_managed_host(t.event_id);
      if immediate then
        if cross_result->>'external' is distinct from 'true' then
          raise exception '정정 방식이 변경되었습니다. 최신 화면에서 원본을 다시 확인해 주세요.' using errcode='PT409';
        end if;
        link:=src.id;
      elsif cross_result->>'external'='true' then
        raise exception '주최자 결과 관리 상태가 변경되었습니다. 원본을 다시 확인해 주세요.' using errcode='PT409';
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
  if immediate then
    perform private.apply_external_tournament_correction(src,eid,t.id,reason,proposed_place,proposed_score,proposed_tied);
  elsif reason is not null then
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
      'correction_rejection_reason',case when manager then request.rejection_reason end,
      'approval_pending',private.tournament_approval_pending(case when e.source_entry_id is null then e.id else src.id end),
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
      select q.status,q.rejection_reason from private.tournament_result_corrections q
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
      'id',q.id,'immediate',q.applied_revision is not null,'eventKey',ev.event_key,'title',ev.title,'name',e.display_name,'division',e.division,'reason',q.reason,
      'oldPlace',q.old_place,'oldScore',q.old_score,'oldTied',q.old_tied,
      'newPlace',q.new_place,'newScore',q.new_score,'newTied',q.new_tied
    ) order by q.requested_at,q.id)
    from private.tournament_result_corrections q join private.club_tournament_entries e on e.id=q.entry_id
    join private.club_tournaments t on t.id=e.tournament_id and t.club_id=c
    join public.events ev on ev.id=t.event_id
    left join private.tournament_hosts h on h.event_id=t.event_id
    where q.status='pending' and (q.applied_revision is not null or num_nonnulls(h.host_club_id,h.host_course_id)=0)
   ),'[]'::jsonb));
 end if;
 return result;
end $$;

create or replace function public.get_tournament_award_news(p_club_key text default null,p_course_key text default null,p_news_id uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'entry_id',e.id,'version',n.version,'tournament_version',t.version,'tournament_id',t.id,
 'title',t.title,'date',t.played_on,'course',t.course_name,'course_key',co.course_key,'club',c.name,'club_key',c.legacy_key,'name',private.hall_viewer_name(p.user_id, e.display_name),'division',e.division,
 'place',n.place,'tied',n.tied,'score',n.score,'award_name',n.award_name,'sentiment',n.sentiment,'photo_id',n.photo_id,'confirmed',n.confirmed and not exists (
    select 1 from private.tournament_hosts h where h.event_id=t.event_id
      and num_nonnulls(h.host_club_id,h.host_course_id)>0 and h.finalized_at is null
  ),'format_note',t.format_note,'approval_pending',private.tournament_approval_pending(e.id),
 'can_edit',not private.tournament_approval_pending(e.id) and private.messaging_account_available(auth.uid()) and exists(select 1 from public.club_memberships m where m.club_id=c.id and m.user_id=auth.uid() and m.membership_status='active') and (p.user_id=auth.uid() or private.club_user_is_active_admin_or_vice_admin(auth.uid(),c.id)),
 'can_confirm',not private.tournament_approval_pending(e.id) and private.messaging_account_available(auth.uid()) and private.club_user_is_active_admin_or_vice_admin(auth.uid(),c.id),
 'can_pin_course',private.messaging_account_available(auth.uid()) and private.course_actor_has_permission(auth.uid(),'courses.manage'),
 'can_pin_national',private.messaging_account_available(auth.uid()) and public.current_user_has_platform_permission('hall_of_fame.records.correct'),
 'pins',coalesce((select jsonb_agg(scope) from private.tournament_award_pins where news_id=n.id),'[]'::jsonb),
 'comments',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',private.hall_viewer_name(author_id, display_name),'body',body,'date',created_at) order by created_at) from private.tournament_award_comments where news_id=n.id),'[]'::jsonb)) order by n.published_at desc,n.id),'[]'::jsonb)
 from private.tournament_award_news n join private.club_tournament_entries e on e.id=n.entry_id join private.club_score_people p on p.id=e.person_id
 join private.club_tournaments t on t.id=e.tournament_id join public.clubs c on c.id=t.club_id left join public.courses co on co.id=t.course_id
 where private.tournament_scope_visible(t) and not n.hidden and not e.excluded and not p.anonymized and c.club_status='active' and (c.directory_is_public or ((p_club_key=c.legacy_key or p_news_id=n.id) and private.club_user_has_permission(auth.uid(), c.id, 'club.posts.read'))) and (p_club_key is null or c.legacy_key=p_club_key) and (p_course_key is null or co.course_key=p_course_key) and (p_news_id is null or n.id=p_news_id);
$$;

create or replace function public.save_tournament_award_news(p_request_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e private.club_tournament_entries:=private.tournament_news_entry((p_payload->>'entry_id')::uuid); t private.club_tournaments; n private.tournament_award_news;
 manager boolean; result jsonb; official boolean; begin
 result:=private.club_extension_previous(auth.uid(),p_request_id,'tournament.news',p_payload);if result is not null then return result;end if;
 select * into t from private.club_tournaments where id=e.tournament_id for update;
 if t.version is distinct from (p_payload->>'tournament_version')::integer then raise exception '대회 성적이 변경되었습니다. 새로 불러와 비교해 주세요.' using errcode='PT409';end if;
 manager:=private.club_user_is_active_admin_or_vice_admin(auth.uid(),t.club_id);
 select * into n from private.tournament_award_news where entry_id=e.id for update;
 if coalesce(n.version,0) is distinct from (p_payload->>'version')::integer then raise exception '수상 소식이 변경되었습니다. 새로 불러와 비교해 주세요.' using errcode='PT409';end if;
 if not exists(select 1 from private.tournament_award_photos p where p.id=(p_payload->>'photo_id')::uuid and p.entry_id=e.id and p.ready and (p.owner_id=auth.uid() or p.id=n.photo_id)) then raise exception '이 참가자의 공개할 사진을 올려 주세요.' using errcode='42501';end if;
 official:=e.confirmed and exists(select 1 from private.tournament_result_corrections q
   where q.entry_id=e.id and q.applied_revision is not null);
 if private.tournament_approval_pending(e.id) then
   raise exception '승인 대기 중인 성적의 수상 소식은 수정할 수 없습니다.' using errcode='PT409';
 end if;
 if official and (e.place not between 1 and 3 or (e.place,e.score,e.tied) is distinct from
     ((p_payload->>'place')::integer,(p_payload->>'score')::integer,coalesce((p_payload->>'tied')::boolean,false))) then
   raise exception '수상 소식의 순위·타수를 현재 공식 성적에 맞춰 주세요.' using errcode='PT409';
 end if;
 insert into private.tournament_award_news(entry_id,author_id,photo_id,place,tied,score,award_name,sentiment,confirmed)
 values(e.id,auth.uid(),(p_payload->>'photo_id')::uuid,(p_payload->>'place')::integer,coalesce((p_payload->>'tied')::boolean,false),(p_payload->>'score')::integer,btrim(coalesce(p_payload->>'award_name','')),btrim(coalesce(p_payload->>'sentiment','')),manager)
 on conflict(entry_id) do update set photo_id=excluded.photo_id,place=excluded.place,tied=excluded.tied,score=excluded.score,award_name=excluded.award_name,sentiment=excluded.sentiment,confirmed=excluded.confirmed,hidden=false,version=private.tournament_award_news.version+1 returning * into n;
 if official then
  null;
 elsif manager then
  update private.club_tournament_entries set attendance='attended',award='yes',place=n.place,tied=n.tied,score=n.score,confirmed=true,confirmed_by=auth.uid() where id=e.id;
 else
  -- Keep previously verified numbers, but never expose a changed self-submission as verified.
  update private.club_tournament_entries set confirmed=false where id=e.id;
 end if;
 update private.club_tournaments set version=version+1,updated_at=now() where id=t.id;
 result:=jsonb_build_object('id',n.id,'confirmed',n.confirmed);perform private.club_extension_complete(auth.uid(),p_request_id,'tournament.news',p_payload,result);return result;
end $$;

create or replace function public.confirm_tournament_award_news(p_request_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  n private.tournament_award_news;
  e private.club_tournament_entries;
  t private.club_tournaments;
  result jsonb;
begin
  select * into n from private.tournament_award_news where id=(p_payload->>'id')::uuid and not hidden;
  if not found then raise exception '수상 소식을 확인해 주세요.' using errcode='42501'; end if;
  e:=private.tournament_news_entry(n.entry_id,true);
  result:=private.club_extension_previous(auth.uid(),p_request_id,'tournament.confirm',p_payload);
  if result is not null then return result; end if;
  select * into n from private.tournament_award_news where id=n.id and not hidden for update;
  select * into t from private.club_tournaments where id=e.tournament_id for update;
  if n.id is null or n.version is distinct from (p_payload->>'version')::integer
    or t.version is distinct from (p_payload->>'tournament_version')::integer then
    raise exception '소식이나 성적이 변경되었습니다. 최신 내용을 확인해 주세요.' using errcode='PT409';
  end if;
  if private.tournament_approval_pending(e.id) then
    raise exception '승인 대기 중인 성적입니다. 정정 검토 화면을 확인해 주세요.' using errcode='PT409';
  end if;
  if t.event_id is not null and e.confirmed and e.place is not null and e.score is not null then
    if (e.place,e.score,e.tied) is distinct from (n.place,n.score,n.tied) then
      raise exception '수상 소식의 순위·타수가 공식 성적과 다릅니다. 공식 성적을 확인해 주세요.' using errcode='PT409';
    end if;
  else
    update private.club_tournament_entries
    set attendance='attended',award='yes',place=n.place,tied=n.tied,score=n.score,confirmed=true,confirmed_by=auth.uid()
    where id=e.id;
  end if;
  update private.tournament_award_news set confirmed=true,version=version+1 where id=n.id;
  update private.club_tournaments set version=version+1,updated_at=now() where id=t.id;
  result:=jsonb_build_object('id',n.id);
  perform private.club_extension_complete(auth.uid(),p_request_id,'tournament.confirm',p_payload,result);
  return result;
end
$$;

drop function public.review_pul_tournament_correction(text,uuid,boolean);

create or replace function public.review_pul_tournament_correction(p_event_key text,p_correction uuid,p_approve boolean,p_rejection_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  h private.tournament_hosts; q private.tournament_result_corrections; t private.club_tournaments;
  src private.tournament_shareable_results; receiving private.club_tournaments;
  rejection text:=private.messaging_trim(p_rejection_reason);
  actor uuid:=auth.uid(); club_key text; managed boolean;
  decision text:=case when p_approve then 'approved' else 'rejected' end;
begin
  perform private.messaging_assert_read_committed();
  if p_approve is null or not coalesce(private.messaging_account_available(actor),false) then
    raise exception '현재 정정 검토 권한을 확인해 주세요.' using errcode='42501';
  end if;
  select req.* into q from private.tournament_result_corrections req where req.id=p_correction;
  select ts.* into t from private.tournament_result_corrections req
  join private.club_tournament_entries ent on ent.id=req.entry_id
  join private.club_tournaments ts on ts.id=ent.tournament_id
  join public.events ev on ev.id=ts.event_id and ev.event_key=p_event_key
  where req.id=p_correction;
  if not found then raise exception '정정 요청을 확인할 수 없습니다.' using errcode='42501'; end if;
  select * into h from private.tournament_hosts where event_id=t.event_id;
  managed:=q.applied_revision is null and num_nonnulls(h.host_club_id,h.host_course_id)>0;
  if managed and (h.finalized_at is null or not private.tournament_host_can_finalize(h,actor)) then
    raise exception '대회 주최자만 정정 요청을 처리할 수 있습니다.' using errcode='42501';
  end if;
  if managed and h.host_course_id is not null then
    perform private.course_next_lock();
  else
    -- External results reuse the original club's existing confirmation authority.
    select legacy_key into club_key from public.clubs where id=case when managed then coalesce(h.host_club_id,t.club_id) else t.club_id end;
    perform private.tournament_lock(club_key,true);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('pul-tournament:' || t.event_id,0));
  perform 1 from public.events where id=t.event_id for share;
  if managed and not private.tournament_host_can_finalize(h,actor) then
    raise exception '현재 대회 주최 권한을 확인해 주세요.' using errcode='42501';
  end if;
  select * into q from private.tournament_result_corrections where id=p_correction for update;
  if q.status=decision then
    if q.applied_revision is not null and not p_approve and q.rejection_reason is distinct from rejection then
      raise exception '이미 다른 사유로 처리된 정정 요청입니다.' using errcode='PT409';
    end if;
    return;
  end if;
  if q.status<>'pending' then raise exception '이미 처리된 정정 요청입니다.' using errcode='PT409'; end if;
  if q.applied_revision is not null then
    if not p_approve and (rejection is null or char_length(rejection) not between 2 and 500) then
      raise exception '반려 사유를 2~500자로 입력해 주세요.' using errcode='22023';
    end if;
    if not exists (select 1 from private.club_tournament_entries e where e.id=q.entry_id
      and e.result_revision=q.applied_revision and (e.place,e.score,e.tied)=(q.new_place,q.new_score,q.new_tied)
      and e.confirmed and not e.excluded and e.attendance='attended') then
      raise exception '원본 성적의 버전이 변경되었습니다. 최신 성적을 확인해 주세요.' using errcode='PT409';
    end if;
    update private.tournament_result_corrections set status=decision, reviewed_by=actor,
      reviewed_at=statement_timestamp(), rejection_reason=case when not p_approve then rejection end where id=q.id;
    if not p_approve then
      update private.club_tournament_entries set place=q.old_place,score=q.old_score,tied=q.old_tied,award=q.old_award
        where id=q.entry_id;
      perform private.sync_external_tournament_news(q.entry_id,q.old_place,q.old_score,q.old_tied,q.news_reopen_version);
    end if;
    perform private.bump_external_tournament_sheets(q.entry_id,null);
    return;
  end if;
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
    where entry_id=q.entry_id;
    if receiving.id is not null then
      update private.club_tournament_entries set source_entry_id=q.entry_id where id=q.requesting_entry_id;
    end if;
    update private.club_tournaments set version=version+1,updated_at=now()
    where id=t.id or id=receiving.id;
  end if;
end
$$;

revoke all on function public.review_pul_tournament_correction(text,uuid,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.review_pul_tournament_correction(text,uuid,boolean,text) to authenticated;

create or replace function public.get_hall_national_scores(p_period text, p_limit integer default 20, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  today date := (statement_timestamp() at time zone 'Asia/Seoul')::date;
begin
  if p_period is null or p_period not in ('month', 'year', 'all', 'today')
     or p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset < 0 then
    raise exception '전국 순위 조회 범위를 확인해 주세요.' using errcode = '22023';
  end if;
  return (
    with ranked as (
      select * from private.hall_ranked_scores(p_period)
    ), page as (
      select * from ranked order by position, played_on desc, entered_at, source_key limit p_limit offset p_offset
    )
    select jsonb_build_object('date', today, 'total', (select count(*) from ranked), 'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'rank', s.position, 'tied', s.tied, 'score', s.metric, 'date', s.played_on,
        'club', s.club_name, 'course', s.course_name, 'name', private.hall_viewer_name(s.user_id, s.display_name),
        'approvalPending', (s.kind='tournament' and private.tournament_approval_pending(s.source_id)) or exists (
          select 1 from private.hall_national_score_sources ps
          join private.tournament_result_corrections q on q.entry_id=ps.source_id
          where ps.kind='tournament' and ps.user_id=s.user_id and q.status='pending'
            and q.applied_revision is not null and p_period=any(q.national_periods)
        ),
        'direction', case when s.score < baseline.average then 'up' when s.score > baseline.average then 'down' end
      ) order by s.position, s.played_on desc, s.entered_at, s.source_key)
      from page s
      left join lateral (
        select round(avg(b.score)) as average
        from private.hall_national_score_sources b
        where p_period <> 'year' and b.user_id = s.user_id and b.entered_at < s.entered_at
          and b.played_on between ((s.entered_at at time zone 'Asia/Seoul')::date - interval '1 year')::date
                              and (s.entered_at at time zone 'Asia/Seoul')::date
      ) baseline on true
    ), '[]'::jsonb))
  );
end
$$;

create or replace function public.get_hall_tournament_awards(p_year integer, p_month integer default null, p_event_key text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare period_start date; period_end date;
begin
  if p_year is null or p_year not between 1900 and 9998 or p_month not between 1 and 12 then
    raise exception '대회 결과 조회 기간을 확인해 주세요.' using errcode = '22023';
  end if;
  period_start := make_date(p_year, coalesce(p_month, 1), 1);
  period_end := (period_start + case when p_month is null then interval '1 year' else interval '1 month' end)::date;
  return (
    with winners as (
      select * from private.hall_confirmed_tournament_results
      where game_type in ('field', 'screen') and place between 1 and 3
        and (p_event_key is null or event_key = p_event_key)
        and played_on <= (statement_timestamp() at time zone 'Asia/Seoul')::date
    ), latest as (
      select distinct on (game_type) competition_id
      from winners order by game_type, played_on desc, competition_id
    ), grouped as (
      select competition_id, event_key, title, played_on, game_type,
        jsonb_agg(jsonb_build_object(
          'name', private.hall_viewer_name(user_id, display_name), 'club', club_name, 'course', course_name,
          'division', division, 'place', place, 'tied', tied, 'score', score, 'newsId', news_id, 'approvalPending',private.tournament_approval_pending(id)
        ) order by division, place, id) as winners
      from winners
      where (played_on >= period_start and played_on < period_end)
        or competition_id in (select competition_id from latest)
      group by competition_id, event_key, title, played_on, game_type
    ), projected as (
      select competition_id, played_on, jsonb_build_object(
        'id', competition_id, 'eventKey', event_key, 'title', title, 'date', played_on,
        'gameType', game_type, 'winners', winners
      ) as card from grouped
    )
    select jsonb_build_object(
      'latest', coalesce((select jsonb_agg(card order by played_on desc, competition_id) from projected
        where competition_id in (select competition_id from latest)), '[]'::jsonb),
      'items', coalesce((select jsonb_agg(card order by played_on desc, competition_id) from projected
        where p_event_key is not null or (played_on >= period_start and played_on < period_end)), '[]'::jsonb)
    )
  );
end
$$;

create or replace function public.get_hall_latest_records()
returns jsonb language sql stable security definer set search_path = '' as $$
  with recent as (
    (select 'score' as kind, s.entered_at as published_at, s.played_on, s.display_name, s.user_id,
            s.club_name, s.course_name, s.score, s.title as label, null::uuid as news_id, s.kind='tournament' and private.tournament_approval_pending(s.source_id) as approval_pending
     from private.hall_national_score_sources s
     where s.played_on <= (statement_timestamp() at time zone 'Asia/Seoul')::date
     order by entered_at desc, source_key limit 8)
    union all
    (select 'award', t.result_confirmed_at, t.played_on, t.display_name, t.user_id,
            t.club_name, t.course_name, t.score, t.title || ' · ' || t.place || '위', t.news_id, private.tournament_approval_pending(t.id)
     from private.hall_confirmed_tournament_results t where t.place between 1 and 3
       and t.game_type in ('field', 'screen') and t.played_on <= (statement_timestamp() at time zone 'Asia/Seoul')::date
     order by t.result_confirmed_at desc, t.id limit 8)
    union all
    (select 'special', r.published_at, r.played_on, r.display_name, r.target_user_id,
            r.club_name, r.course_name, null, r.record_type_code, null, false
     from private.hall_national_special_records r where r.played_on <= (statement_timestamp() at time zone 'Asia/Seoul')::date
     order by r.published_at desc, r.id limit 8)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'kind', kind, 'date', played_on, 'name', private.hall_viewer_name(user_id, display_name),
    'club', club_name, 'course', course_name, 'score', score, 'label', label, 'newsId', news_id, 'approvalPending',approval_pending
  ) order by published_at desc, kind, played_on desc, label), '[]'::jsonb)
  from (select * from recent order by published_at desc, kind, played_on desc, label limit 8) selected
$$;

notify pgrst, 'reload schema';
