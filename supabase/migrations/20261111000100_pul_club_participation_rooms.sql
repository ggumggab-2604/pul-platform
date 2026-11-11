-- Club participation rooms retain existing tournament registration and messaging.
create table private.club_participation_rooms (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id),
  tournament_id uuid references private.tournament_signup(event_id),
  monthly_event_id uuid references public.club_official_events(id),
  monthly_sheet_id uuid references private.club_monthly_sheets(id),
  title text not null,
  allow_phone boolean not null default false,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  archived_at timestamptz,
  submitted_at timestamptz,
  submission jsonb,
  check (num_nonnulls(tournament_id,monthly_event_id,monthly_sheet_id)=1),
  unique (club_id,tournament_id), unique (monthly_event_id), unique (monthly_sheet_id)
);

create table private.club_participation_votes (
  room_id uuid not null references private.club_participation_rooms(id),
  user_id uuid not null references public.user_accounts(id) on delete cascade,
  response text check (response in ('yes','no','maybe')),
  division text,
  joined_queue_at timestamptz,
  consent_hash text,
  phone_allowed boolean not null default false,
  frozen boolean not null default false,
  primary key(room_id,user_id)
);

create table private.club_participation_notices (
  room_id uuid not null references private.club_participation_rooms(id),
  message_id uuid not null unique references public.messaging_messages(id) on delete cascade,
  audience text not null check (audience in ('all','yes','unanswered')),
  primary key(room_id,message_id)
);

alter table private.club_participation_rooms enable row level security;
alter table private.club_participation_votes enable row level security;
alter table private.club_participation_notices enable row level security;
revoke all on private.club_participation_rooms,private.club_participation_votes,private.club_participation_notices
  from public,anon,authenticated,service_role;

create table private.club_participation_entries (
  room_id uuid not null references private.club_participation_rooms(id),
  user_id uuid not null references public.user_accounts(id) on delete cascade,
  position integer not null check (position>0),
  route_id uuid not null unique default gen_random_uuid(),
  shared jsonb not null check (jsonb_typeof(shared)='object' and shared ? 'name'),
  primary key(room_id,user_id)
);

alter table private.club_participation_entries enable row level security;
revoke all on private.club_participation_entries from public,anon,authenticated,service_role;

-- Keep the old tournament screen from changing room-managed votes or bypassing the preview.
alter function public.mutate_tournament_signup(text,text,uuid,jsonb) rename to mutate_tournament_signup_terms;
alter function public.mutate_tournament_signup_terms(text,text,uuid,jsonb) set schema private;
revoke all on function private.mutate_tournament_signup_terms(text,text,uuid,jsonb)
  from public,anon,authenticated,service_role;

create function public.mutate_tournament_signup(p_event_key text,p_operation text,p_request_id uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_event uuid; c uuid; a uuid:=auth.uid(); host private.tournament_hosts; source text;
begin
  if p_operation in ('poll','respond','group') then
    c:=nullif(p_input->>'club','')::uuid;
    select e.id into v_event from public.events e where e.event_key=p_event_key;
    if v_event is not null then
      perform pg_advisory_xact_lock(hashtextextended('pul-tournament:'||v_event,0));
      if exists(select 1 from private.club_participation_rooms r where r.tournament_id=v_event
        and r.club_id=c) then
        if not private.messaging_account_available(a) or not private.tournament_entry_member(c,a) then
          raise exception '현재 동호회 회원만 이용할 수 있습니다.' using errcode='42501';
        end if;
        raise exception '동호회 참여방에서 응답과 단체 제출을 진행해 주세요.' using errcode='PT409';
      end if;
    end if;
  end if;
  if p_operation='resolve' then
    select e.id into v_event from public.events e where e.event_key=p_event_key and e.publication_status='published';
    if v_event is not null then
      perform pg_advisory_xact_lock(hashtextextended('pul-tournament:'||v_event,0));
      select h.* into host from private.tournament_hosts h where h.event_id=v_event;
      if not private.tournament_host_can_finalize(host,a) then
        raise exception '현재 대회 개최자만 처리할 수 있습니다.' using errcode='42501';
      end if;
      if p_input->>'state' like 'room:%' then
        select r.club_id::text into source from private.club_participation_entries x
        join private.club_participation_rooms r on r.id=x.room_id and r.tournament_id=v_event
        join private.tournament_participants p on p.event_id=v_event and p.user_id=x.user_id
        where p.id=nullif(p_input->>'participant','')::uuid and 'room:'||x.route_id=p_input->>'state';
        if source is null then
          raise exception '실제 접수 경로를 선택해 주세요.' using errcode='22023';
        end if;
        p_input:=jsonb_set(p_input,'{state}',to_jsonb(source));
      elsif exists(
        select 1 from private.club_participation_entries x
        join private.club_participation_rooms r on r.id=x.room_id and r.tournament_id=v_event
        join private.tournament_participants p on p.event_id=v_event and p.user_id=x.user_id
        where p.id=nullif(p_input->>'participant','')::uuid and r.club_id::text=p_input->>'state'
      ) then raise exception '실제 접수 경로를 선택해 주세요.' using errcode='22023';
      end if;
    end if;
  end if;
  return private.mutate_tournament_signup_terms(p_event_key,p_operation,p_request_id,p_input);
end $$;

alter function public.get_tournament_signup(text) rename to get_tournament_signup_terms;
alter function public.get_tournament_signup_terms(text) set schema private;
revoke all on function private.get_tournament_signup_terms(text) from public,anon,authenticated,service_role;

create function private.club_room_shared_rosters(p_event uuid,p_room uuid default null)
returns jsonb language sql stable set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'at',r.submitted_at,'fields',r.submission->'fields',
    'members',coalesce((select jsonb_agg(x.shared order by x.position)
      from private.club_participation_entries x where x.room_id=r.id and private.messaging_account_available(x.user_id)),'[]'::jsonb))
    order by r.submitted_at,r.id),'[]'::jsonb)
  from private.club_participation_rooms r
  where r.tournament_id=p_event and r.submitted_at is not null and (p_room is null or r.id=p_room)
$$;

create function private.club_room_host_participant(p_event uuid,p_item jsonb)
returns jsonb language plpgsql stable set search_path='' as $$
declare options jsonb; selected jsonb; final_source text; data jsonb;
begin
  with sources as (
    select x.value, x.ord, entry.route_id, entry.shared
    from jsonb_array_elements(p_item->'sources') with ordinality x(value,ord)
    join private.tournament_participants p on p.event_id=p_event and p.id=(p_item->>'id')::uuid
    left join private.club_participation_rooms r on r.tournament_id=p_event and r.club_id::text=x.value->>'id'
    left join private.club_participation_entries entry on entry.room_id=r.id and entry.user_id=p.user_id
  )
  select coalesce(jsonb_agg(case when route_id is null then value else jsonb_build_object(
      'id','room:'||route_id,'club',shared->'club','division',shared->'division') end order by ord),'[]'::jsonb),
    (array_agg(shared order by (value->>'id'=p_item->>'finalSource') desc nulls last,ord))[1],
    max(case when value->>'id'=p_item->>'finalSource' then coalesce('room:'||route_id,value->>'id') end)
  into options,selected,final_source from sources;
  data:=p_item||jsonb_build_object('sources',options,'finalSource',final_source);
  if selected is null and (jsonb_array_length(options)=0 or p_item->>'clubId' is not null) then
    select x.shared into selected from private.club_participation_entries x
    join private.club_participation_rooms r on r.id=x.room_id and r.tournament_id=p_event
    join private.tournament_participants p on p.event_id=p_event and p.user_id=x.user_id
    where p.id=(p_item->>'id')::uuid
      and (jsonb_array_length(options)=0 or r.club_id::text=p_item->>'clubId')
    order by r.submitted_at,r.id limit 1;
  end if;
  if selected is null then return data; end if;
  return data||jsonb_build_object('name',selected->'name','phone',selected->'phone','club',selected->'club',
    'clubId',null,'division',selected->'division','nickname',null,'limitedDisclosure',true);
end $$;

create function public.get_tournament_shared_roster(p_event_key text,p_submission uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare h private.tournament_hosts;
begin
  select host.* into h from private.tournament_hosts host join public.events e on e.id=host.event_id
  where e.event_key=p_event_key and e.publication_status='published';
  if h.event_id is null or not private.tournament_host_can_finalize(h,auth.uid()) then
    raise exception '현재 대회 개최자만 제출 명단을 내려받을 수 있습니다.' using errcode='42501';
  end if;
  if p_submission is null then return null; end if;
  return private.club_room_shared_rosters(h.event_id,p_submission)->0;
end $$;

-- These messages can be reopened by the organizer in Sent. The receiving chair can
-- see the club's full registration on the event page using their own club role.
alter function private.send_tournament_notice(public.events,text,uuid,text,uuid[]) rename to send_tournament_notice_base;
create function private.send_tournament_notice(e public.events,notice_type text,club uuid,notice_body text,audience uuid[])
returns integer language plpgsql set search_path='' as $$
begin
  if notice_type in ('roster','actual') and exists(
    select 1 from private.club_participation_rooms r where r.tournament_id=e.id and r.club_id=club
      and r.submitted_at is not null and not (r.submission->'fields' @> '["club","division"]'::jsonb)
  ) then
    notice_body:=e.title||case when notice_type='actual' then ' · 실제 출전 명단을 확인해 주세요.' else ' · 신청 명단을 확인해 주세요.' end;
  end if;
  return private.send_tournament_notice_base(e,notice_type,club,notice_body,audience);
end $$;

create function public.get_tournament_signup(p_event_key text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare data jsonb:=private.get_tournament_signup_terms(p_event_key); polls jsonb; roster jsonb; event_id uuid;
begin
  if data is null then return null; end if;
  select coalesce(jsonb_agg(case when r.id is null then p.value else
    (p.value - 'rows' - 'own') || jsonb_build_object('roomId',r.id) end order by p.ord),'[]'::jsonb) into polls
  from jsonb_array_elements(data->'polls') with ordinality p(value,ord)
  left join public.events e on e.event_key=p_event_key
  left join private.club_participation_rooms r on r.tournament_id=e.id and r.club_id=(p.value->>'clubId')::uuid;
  data:=jsonb_set(data,'{polls}',polls);
  if (data->>'host')::boolean then
    select e.id into event_id from public.events e where e.event_key=p_event_key;
    select coalesce(jsonb_agg(private.club_room_host_participant(event_id,x.value) order by x.ord),'[]'::jsonb)
      into roster from jsonb_array_elements(data->'roster') with ordinality x(value,ord);
    data:=data||jsonb_build_object('roster',roster,'sharedRosters',private.club_room_shared_rosters(event_id));
  else
    select coalesce(jsonb_agg(case when (x.value->>'own')::boolean then x.value
      else jsonb_set(x.value,'{sources}','[]'::jsonb) end order by x.ord),'[]'::jsonb)
      into roster from jsonb_array_elements(data->'roster') with ordinality x(value,ord);
    data:=jsonb_set(data,'{roster}',roster);
  end if;
  return data;
end $$;

create function private.club_room_state(r private.club_participation_rooms)
returns table (can_respond boolean, ended boolean) language sql stable set search_path='' as $$
  select r.closed_at is null and case
      when r.tournament_id is not null then coalesce(private.tournament_signup_open(e,t),false)
      when r.monthly_event_id is not null then m.moderation_status='visible'
        and m.event_status in ('scheduled','registration_open') and m.starts_at>statement_timestamp()
      else s.played_on>(statement_timestamp() at time zone 'Asia/Seoul')::date
    end,
    case when r.tournament_id is not null then e.occurrence_status='cancelled'
      or exists(select 1 from private.tournament_hosts h where h.event_id=e.id and h.finalized_at is not null)
      or coalesce(e.end_date,e.start_date)<(statement_timestamp() at time zone 'Asia/Seoul')::date
      when r.monthly_event_id is not null then m.event_status in ('completed','cancelled')
        or coalesce(m.ends_at,date_trunc('day',m.starts_at,'Asia/Seoul')+interval '24 hours')<=statement_timestamp()
      else s.played_on<=(statement_timestamp() at time zone 'Asia/Seoul')::date end
  from (select 1) seed
  left join public.events e on e.id=r.tournament_id
  left join private.tournament_signup t on t.event_id=r.tournament_id
  left join public.club_official_events m on m.id=r.monthly_event_id
  left join private.club_monthly_sheets s on s.id=r.monthly_sheet_id
$$;

create function private.club_room_members(r private.club_participation_rooms)
returns table (user_id uuid, name text, response text, division text, queued_at timestamptz)
language sql stable set search_path='' as $$
  select m.user_id,coalesce(nullif(btrim(p.display_name),''),'이름 미등록'),
    case when r.closed_at is not null or r.tournament_id is null then v.response else t.response end,
    case when r.closed_at is not null or r.tournament_id is null then v.division else t.division end,
    v.joined_queue_at
  from (
    select cm.user_id from public.club_memberships cm
    where r.closed_at is null and cm.club_id=r.club_id and cm.membership_status='active'
    union all
    select cv.user_id from private.club_participation_votes cv
    where r.closed_at is not null and cv.room_id=r.id and cv.frozen
  ) m
  left join public.user_profiles p on p.user_id=m.user_id
  left join private.club_participation_votes v on (v.room_id,v.user_id)=(r.id,m.user_id)
  left join private.tournament_club_responses t on (t.event_id,t.club_id,t.user_id)=(r.tournament_id,r.club_id,m.user_id)
  where private.messaging_account_available(m.user_id)
$$;

create function private.club_room_contact(u uuid)
returns table (name text, phone text) language sql stable set search_path='' as $$
  select nullif(btrim(p.display_name),''),private.tournament_mobile(coalesce(b.contact_phone,a.phone))
  from public.user_profiles p left join private.member_basics b on b.user_id=p.user_id
  left join auth.users a on a.id=p.user_id where p.user_id=u
$$;

create function private.club_room_audience(r private.club_participation_rooms, audience text)
returns uuid[] language sql stable set search_path='' as $$
  select array(select m.user_id from private.club_room_members(r) m
    where m.user_id<>auth.uid() and private.tournament_entry_member(r.club_id,m.user_id)
      and (audience='all' or audience='yes' and m.response='yes' or audience='unanswered' and m.response is null)
    order by m.user_id limit 10001)
$$;

create function private.club_room_required_fields(p_event uuid)
returns text[] language sql stable set search_path='' as $$
  select case when cardinality(s.divisions)>1 then array['name','division'] else array['name'] end
  from private.tournament_signup s where s.event_id=p_event
$$;

create function public.get_club_participation(p_club_key text,p_room uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r private.club_participation_rooms; c uuid; a uuid:=auth.uid(); chair boolean; data jsonb;
begin
  if p_room is not null then
    select * into r from private.club_participation_rooms where id=p_room;
    select legacy_key into p_club_key from public.clubs where id=r.club_id;
  end if;
  c:=private.monthly_club(p_club_key,false);
  chair:=private.tournament_president(c) is not distinct from a;
  if p_room is null then
    if not chair then raise exception '현재 회장만 참여방을 관리할 수 있습니다.' using errcode='42501'; end if;
    return jsonb_build_object(
      'clubName',(select name from public.clubs where id=c),
      'rooms',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'title',x.title,'kind',
        case when x.tournament_id is null then 'monthly' else 'tournament' end,'archived',x.archived_at is not null,
        'open',st.can_respond) order by x.created_at desc) from private.club_participation_rooms x
        cross join lateral private.club_room_state(x) st where x.club_id=c),'[]'::jsonb),
      'tournaments',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'label',e.start_date||' · '||e.title) order by e.start_date,e.id)
        from public.events e join private.tournament_signup s on s.event_id=e.id
        join private.tournament_hosts h on h.event_id=e.id
        where private.tournament_signup_open(e,s) and (h.host_club_id=c
          or exists(select 1 from public.course_club_links l where l.club_id=c and l.course_id=e.related_course_id)
          or exists(select 1 from private.tournament_messages n where n.event_id=e.id and n.club_id=c and n.purpose='invite'))
        and not exists(select 1 from private.club_participation_rooms x where x.club_id=c and x.tournament_id=e.id)
        and not exists(select 1 from private.tournament_club_responses v where v.event_id=e.id and v.club_id=c and v.submitted_division is not null)),'[]'::jsonb),
      'monthly',coalesce((select jsonb_agg(jsonb_build_object('id',q.kind||':'||q.id,'label',q.event_day||' · '||q.title) order by q.event_day desc,q.id)
        from (select 'event' kind,m.id,(m.starts_at at time zone 'Asia/Seoul')::date as event_day,m.title
              from public.club_official_events m where m.club_id=c and m.event_type='monthly_meeting'
                and m.event_status not in ('draft','cancelled') and m.moderation_status='visible'
                and not exists(select 1 from private.club_participation_rooms x where x.monthly_event_id=m.id)
              union all select 'sheet',s.id,s.played_on,s.title from private.club_monthly_sheets s
              where s.club_id=c and s.event_id is null
                and not exists(select 1 from private.club_participation_rooms x where x.monthly_sheet_id=s.id)) q),'[]'::jsonb));
  end if;

  if r.monthly_event_id is not null and not chair and not exists(
    select 1 from public.club_official_events e where e.id=r.monthly_event_id and e.moderation_status='visible'
      and e.event_status<>'draft'
  ) then raise exception '이 참여방을 열 수 없습니다.' using errcode='42501'; end if;
  if r.tournament_id is not null and not chair and not exists(
    select 1 from public.events e where e.id=r.tournament_id and e.publication_status='published'
  ) then raise exception '이 참여방을 열 수 없습니다.' using errcode='42501'; end if;
  select jsonb_build_object('id',r.id,'title',r.title,'clubKey',p_club_key,'clubName',(select name from public.clubs where id=c),
    'kind',case when r.tournament_id is null then 'monthly' else 'tournament' end,
    'eventKey',(select event_key from public.events where id=r.tournament_id),
    'divisions',(select divisions from private.tournament_signup where event_id=r.tournament_id),
    'requiredFields',private.club_room_required_fields(r.tournament_id),
    'entryOpen',(select private.tournament_signup_open(e,s) from public.events e join private.tournament_signup s on s.event_id=e.id where e.id=r.tournament_id),
    'chair',chair,'open',st.can_respond,'ended',st.ended,'closed',r.closed_at is not null,'archived',r.archived_at is not null,
    'allowPhone',r.allow_phone,'submittedAt',r.submitted_at,
    'own',(select jsonb_build_object('response',m.response,'division',m.division,'phoneAllowed',coalesce(v.phone_allowed,false))
      from private.club_room_members(r) m left join private.club_participation_votes v on v.room_id=r.id and v.user_id=m.user_id where m.user_id=a),
    'date',coalesce((select start_date from public.events where id=r.tournament_id),
      (select (starts_at at time zone 'Asia/Seoul')::date from public.club_official_events where id=r.monthly_event_id),
      (select played_on from private.club_monthly_sheets where id=r.monthly_sheet_id)),
    'contact',case when r.tournament_id is not null and st.can_respond then
      (select jsonb_build_object('name',x.name,'phone',case when r.allow_phone then x.phone end) from private.club_room_contact(a) x) end)
  into data from private.club_room_state(r) st;
  if not chair then return data; end if;
  return data||jsonb_build_object(
    'members',coalesce((select jsonb_agg(jsonb_build_object('id',m.user_id,'name',m.name,'response',m.response,
      'division',m.division,'consented',v.consent_hash is not null,'phoneAllowed',coalesce(v.phone_allowed,false))
      order by m.queued_at nulls last,m.name,m.user_id) from private.club_room_members(r) m
      left join private.club_participation_votes v on v.room_id=r.id and v.user_id=m.user_id),'[]'::jsonb),
    'notices',coalesce((select jsonb_agg(jsonb_build_object('id',msg.id,'at',msg.created_at,'body',msg.body,
      'count',msg.broadcast_recipient_count,'audience',n.audience) order by msg.created_at desc,msg.id)
      from private.club_participation_notices n join public.messaging_messages msg on msg.id=n.message_id
      where n.room_id=r.id),'[]'::jsonb),
    'submission',case when r.submission is not null then jsonb_build_object('fields',r.submission->'fields','count',r.submission->'count',
      'members',coalesce((select jsonb_agg(jsonb_build_object('name',m.name,'division',x.value->>'division') order by x.ord)
        from jsonb_array_elements(r.submission->'members') with ordinality x(value,ord)
        join private.club_room_members(r) m on m.user_id=(x.value->>'id')::uuid),'[]'::jsonb)) end);
end $$;

create function private.club_room_preview(r private.club_participation_rooms, selected uuid[], fields text[])
returns jsonb language plpgsql stable set search_path='' as $$
declare roster jsonb; c text; phone_selected boolean:='phone'=any(fields);
begin
  if not coalesce(private.club_room_required_fields(r.tournament_id) <@ fields,false) then
    if not coalesce('name'=any(fields),false) then
      raise exception '개최자에게 제출할 이름은 필수입니다.' using errcode='22023';
    end if;
    raise exception '여러 부문을 운영하는 대회는 개최자에게 참가 부문을 제출해야 합니다.' using errcode='22023';
  end if;
  if not (fields <@ array['name','club','division','phone']) or (phone_selected and not r.allow_phone) then
    raise exception '회원에게 사전 고지한 항목만 제출할 수 있습니다.' using errcode='22023';
  end if;
  if coalesce(cardinality(selected),0) not between 1 and 1000 then
    raise exception '제출할 참가 희망자를 선택해 주세요.' using errcode='22023';
  end if;
  if phone_selected and exists(select 1 from unnest(selected) u where not exists(
    select 1 from private.club_participation_votes v where v.room_id=r.id and v.user_id=u and v.phone_allowed
  )) then
    raise exception '전화번호 공유에 동의한 회원만 선택하거나 전화번호 항목을 해제해 주세요.' using errcode='PT409';
  end if;
  select name into c from public.clubs where id=r.club_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'name',x.name)
    || case when 'club'=any(fields) then jsonb_build_object('club',c) else '{}'::jsonb end
    || case when 'division'=any(fields) then jsonb_build_object('division',m.division) else '{}'::jsonb end
    || case when phone_selected then jsonb_build_object('phone',x.phone) else '{}'::jsonb end
    order by m.queued_at nulls last,m.name,m.user_id),'[]'::jsonb) into roster
  from private.club_room_members(r) m
  join private.club_participation_votes v on v.room_id=r.id and v.user_id=m.user_id
  cross join lateral private.club_room_contact(m.user_id) x
  left join private.tournament_participants p on (p.event_id,p.user_id)=(r.tournament_id,m.user_id)
  where m.user_id=any(selected) and m.response='yes' and m.division is not null
    and private.tournament_entry_member(r.club_id,m.user_id)
    and x.name is not null and (p.id is null or (p.status<>'cancelled' and p.name=x.name))
    and (not phone_selected or (v.phone_allowed and x.phone is not null and (p.phone is null or p.phone=x.phone)))
    and v.consent_hash=md5(jsonb_build_array(x.name,c,m.division,case when v.phone_allowed then x.phone end)::text);
  if jsonb_array_length(roster)<>cardinality(selected) then
    raise exception '선택한 회원의 응답, 공유 동의 또는 기존 접수 정보가 달라졌습니다. 명단과 회원 정보를 다시 확인해 주세요.' using errcode='PT409';
  end if;
  return jsonb_build_object('members',roster,'fields',fields,'token',encode(sha256(convert_to(
    jsonb_build_array(r.id,fields,roster,(select version from private.tournament_club_polls where event_id=r.tournament_id and club_id=r.club_id))::text,'UTF8')),'hex'));
end $$;

create function public.mutate_club_participation(p_club_key text,p_room uuid,p_op text,p_request uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  r private.club_participation_rooms; c uuid; a uuid:=auth.uid(); chair boolean; target uuid;
  e public.events; signup private.tournament_signup; sched public.club_official_events; sheet private.club_monthly_sheets;
  event_key text; state text:=p_input->>'response'; division text:=nullif(p_input->>'division','');
  allow_phone boolean:=coalesce((p_input->>'phoneAllowed')::boolean,false); contact_name text; contact_phone text; club_name text;
  requested_audience text:=p_input->>'audience'; body text; recipients uuid[]; msg uuid; sent_at timestamptz;
  result jsonb; preview jsonb; members uuid[]; fields text[]; fresh uuid[];
  vote private.club_participation_votes; can_respond boolean; ended boolean;
  fingerprint jsonb:=jsonb_build_array(p_club_key,p_room,p_op,p_input);
begin
  perform private.messaging_assert_read_committed();
  if p_room is not null then
    select * into r from private.club_participation_rooms where id=p_room;
    select legacy_key into p_club_key from public.clubs where id=r.club_id;
    target:=r.tournament_id;
  elsif p_op='create' and p_input->>'kind'='tournament' then
    target:=(p_input->>'target')::uuid;
  end if;
  c:=private.monthly_club(p_club_key,false);
  if target is not null then
    perform pg_advisory_xact_lock(hashtextextended('pul-tournament:'||target,0));
    select * into e from public.events where id=target;
    select * into signup from private.tournament_signup where event_id=target;
    event_key:=e.event_key;
  end if;
  if p_op='notice' then
    perform pg_advisory_xact_lock(1297303349,hashtext(c::text));
    perform pg_advisory_xact_lock(1297303345,hashtext(a::text));
  end if;
  perform id from public.clubs where id=c for update;
  perform id from public.user_accounts where id=a for share;
  perform user_id from public.user_profiles where user_id=a for share;
  perform id from public.consent_records where user_id=a for share;
  perform id from public.club_memberships where club_id=c and user_id=a for share;
  perform id from public.club_role_assignments where membership_id in
    (select id from public.club_memberships where club_id=c and user_id=a) for share;
  perform role_code from public.club_role_definitions where role_code='club_admin' for share;
  c:=private.monthly_club(p_club_key,false);
  chair:=private.tournament_president(c) is not distinct from a;
  if p_op is distinct from 'respond' and not chair then
    raise exception '현재 회장만 참여방을 관리할 수 있습니다.' using errcode='42501';
  end if;
  if p_room is not null then
    select * into r from private.club_participation_rooms where id=p_room and club_id=c for update;
    select st.can_respond,st.ended into can_respond,ended from private.club_room_state(r) st;
  elsif p_op is distinct from 'create' then
    raise exception '참여방을 선택해 주세요.' using errcode='22023';
  end if;
  if p_op not in ('preview_notice','preview_submit') then
    result:=private.club_extension_previous(a,p_request,'club.participation',fingerprint);
    if result is not null then return result; end if;
  end if;
  if r.archived_at is not null then raise exception '지난 참여방은 변경할 수 없습니다.' using errcode='PT409'; end if;
  select name into club_name from public.clubs where id=c;
  case p_op
  when 'create' then
    if p_room is not null then raise exception '이미 생성된 참여방입니다.' using errcode='22023'; end if;
    if target is not null then
      if not coalesce(private.tournament_signup_open(e,signup),false) or not (
        exists(select 1 from private.tournament_hosts h where h.event_id=target and h.host_club_id=c)
        or exists(select 1 from public.course_club_links l where l.club_id=c and l.course_id=e.related_course_id)
        or exists(select 1 from private.tournament_messages n where n.event_id=target and n.club_id=c and n.purpose='invite')
      ) then raise exception '개최 안내나 초청을 받은 접수 중 대회를 선택해 주세요.' using errcode='42501'; end if;
      if exists(select 1 from private.tournament_club_responses v where v.event_id=target and v.club_id=c and v.submitted_division is not null)
        then raise exception '기존 단체 접수가 있는 대회는 대회 화면에서 관리해 주세요.' using errcode='PT409'; end if;
      insert into private.tournament_club_polls(event_id,club_id) values(target,c) on conflict do nothing;
      insert into private.club_participation_rooms(club_id,tournament_id,title,allow_phone)
      values(c,target,e.title,allow_phone) on conflict(club_id,tournament_id) do nothing returning * into r;
    elsif p_input->>'kind'='monthly' then
      target:=split_part(p_input->>'target',':',2)::uuid;
      if split_part(p_input->>'target',':',1)='event' then
        select * into sched from public.club_official_events where id=target and club_id=c and event_type='monthly_meeting'
          and moderation_status='visible' and event_status not in ('draft','cancelled') for share;
      elsif split_part(p_input->>'target',':',1)='sheet' then
        select * into sheet from private.club_monthly_sheets where id=target and club_id=c and event_id is null for share;
      end if;
      if num_nonnulls(sched.id,sheet.id)<>1 then raise exception '이 동호회의 월례회 일정이나 기록을 선택해 주세요.' using errcode='42501'; end if;
      insert into private.club_participation_rooms(club_id,monthly_event_id,monthly_sheet_id,title)
      values(c,sched.id,sheet.id,coalesce(sched.title,sheet.title)) on conflict do nothing returning * into r;
    end if;
    if r.id is null then raise exception '이미 참여방이 있거나 연결할 행사가 없습니다.' using errcode='PT409'; end if;
    result:=jsonb_build_object('roomId',r.id);
  when 'respond' then
    if not coalesce(can_respond,false) or r.submitted_at is not null then
      raise exception '참가 모집이 마감되었습니다.' using errcode='PT409';
    end if;
    if state is null or state not in ('yes','no','maybe') then raise exception '응답을 선택해 주세요.' using errcode='22023'; end if;
    if r.tournament_id is not null then
      if state='yes' then
        if cardinality(signup.divisions)=1 then division:=signup.divisions[1]; end if;
        select name,phone into contact_name,contact_phone from private.club_room_contact(a);
        if p_input->>'consent' is distinct from 'true' or not coalesce(division=any(signup.divisions),false)
          or contact_name is null or contact_name is distinct from p_input->>'seenName'
          or (allow_phone and (not r.allow_phone or contact_phone is null or contact_phone is distinct from p_input->>'seenPhone')) then
          raise exception '공유할 정보와 참가 부문을 확인해 주세요. 회원 정보가 바뀌었다면 새로고침해 주세요.' using errcode='22023';
        end if;
      end if;
      perform private.mutate_tournament_signup_terms(event_key,'respond',md5(p_request::text||':room-vote')::uuid,
        jsonb_build_object('club',c,'state',state,'division',division));
    end if;
    insert into private.club_participation_votes(room_id,user_id,response,division,joined_queue_at,consent_hash,phone_allowed)
    values(r.id,a,state,case when state='yes' then division end,case when state='yes' then clock_timestamp() end,
      case when state='yes' and r.tournament_id is not null then
        md5(jsonb_build_array(contact_name,club_name,division,case when allow_phone then contact_phone end)::text) end,
      state='yes' and r.tournament_id is not null and allow_phone)
    on conflict(room_id,user_id) do update set response=excluded.response,division=excluded.division,
      joined_queue_at=case when excluded.response='yes' and club_participation_votes.response='yes'
        then club_participation_votes.joined_queue_at else excluded.joined_queue_at end,
      consent_hash=excluded.consent_hash,phone_allowed=excluded.phone_allowed;
    result:='{"done":true}'::jsonb;
  when 'preview_notice','notice' then
    if requested_audience is null or requested_audience not in ('all','yes','unanswered') or (requested_audience<>'yes' and not coalesce(can_respond,false)) then
      raise exception '발송 대상과 모집 상태를 확인해 주세요.' using errcode='22023';
    end if;
    perform private.messaging_assert_club_broadcaster(c,p_op='notice');
    recipients:=private.club_room_audience(r,requested_audience);
    result:=jsonb_build_object('count',cardinality(recipients),'token',encode(sha256(convert_to(
      jsonb_build_array(r.id,requested_audience,recipients)::text,'UTF8')),'hex'));
    if p_op='preview_notice' then
      return result||jsonb_build_object('recipients',coalesce((select jsonb_agg(m.name order by m.name,m.user_id)
        from private.club_room_members(r) m where m.user_id=any(recipients)),'[]'::jsonb));
    end if;
    if p_input->>'token' is distinct from result->>'token' then
      raise exception '발송 대상이 달라졌습니다. 인원을 다시 확인해 주세요.' using errcode='PT409';
    end if;
    if coalesce(char_length(private.messaging_trim(p_input->>'body')),0)=0 then
      raise exception '안내 내용을 입력해 주세요.' using errcode='22023';
    end if;
    body:=private.messaging_trim(p_input->>'body')||E'\n\n/club-participation/'||r.id;
    if cardinality(recipients) not between 1 and 10000 or char_length(body) not between 1 and 2000 or body is null then
      raise exception '안내 내용과 수신 인원을 확인해 주세요.' using errcode='22023';
    end if;
    sent_at:=clock_timestamp();
    if (select count(*) from public.messaging_club_broadcast_contexts cc join public.messaging_messages m on m.id=cc.message_id
        where cc.club_id=c and m.created_at>sent_at-interval '24 hours')>=20
      or exists(select 1 from private.club_participation_notices n join public.messaging_messages m on m.id=n.message_id
        where n.room_id=r.id and n.audience=requested_audience and m.created_at>sent_at-interval '3 minutes') then
      raise exception '최근 같은 대상에게 발송했거나 오늘 발송 한도에 도달했습니다.' using errcode='PT409';
    end if;
    insert into public.messaging_messages(kind,sender_user_id,body,body_hash,recipient_key,request_id,request_fingerprint,
      first_contact,created_at,broadcast_recipient_count)
    values('club_broadcast',a,body,encode(sha256(convert_to(private.messaging_normalize(body),'UTF8')),'hex'),'club:'||c,
      p_request,md5(fingerprint::text),false,sent_at,cardinality(recipients)) returning id into msg;
    insert into public.messaging_club_broadcast_contexts(message_id,club_id) values(msg,c);
    insert into public.messaging_recipients(message_id,recipient_user_id,received_at)
      select msg,u,sent_at from unnest(recipients) u;
    insert into private.club_participation_notices values(r.id,msg,requested_audience);
    insert into public.audit_logs(actor_id,actor_type,action,target_type,target_id,after_summary)
    values(a,'operator','messaging.club_broadcast.send','messaging_message',msg::text,
      jsonb_build_object('audience',requested_audience,'club_id',c,'room_id',r.id,'recipient_count',cardinality(recipients),'created_at',sent_at,'result','sent'));
    result:=jsonb_build_object('sent',cardinality(recipients));
  when 'close','archive' then
    if p_op='archive' and not coalesce(ended,false) then raise exception '행사 종료 후 지난 참여방으로 옮길 수 있습니다.' using errcode='PT409'; end if;
    if r.closed_at is null then
      insert into private.club_participation_votes(room_id,user_id,response,division,joined_queue_at,frozen)
      select r.id,m.user_id,m.response,m.division,m.queued_at,true from private.club_room_members(r) m
      on conflict(room_id,user_id) do update set response=excluded.response,division=excluded.division,frozen=true;
    end if;
    update private.club_participation_rooms set closed_at=coalesce(closed_at,clock_timestamp()),
      archived_at=case when p_op='archive' then clock_timestamp() end where id=r.id;
    result:='{"done":true}'::jsonb;
  when 'preview_submit','submit' then
    if r.tournament_id is null or not coalesce(private.tournament_signup_open(e,signup),false) or r.submitted_at is not null then
      raise exception '개최자 접수 기간과 기존 제출 여부를 확인해 주세요.' using errcode='PT409';
    end if;
    members:=array(select distinct value::uuid from jsonb_array_elements_text(p_input->'members') order by 1);
    fields:=array(select distinct value from jsonb_array_elements_text(p_input->'fields') order by 1);
    if p_op='submit' then
      perform id from public.user_accounts where id=any(members) order by id for share;
      perform user_id from public.user_profiles where user_id=any(members) order by user_id for share;
      perform user_id from private.member_basics where user_id=any(members) order by user_id for share;
      perform id from auth.users where id=any(members) order by id for share;
    end if;
    preview:=private.club_room_preview(r,members,fields);
    if p_op='preview_submit' then return preview; end if;
    if p_input->>'token' is distinct from preview->>'token' then
      raise exception '미리 본 명단과 현재 정보가 다릅니다. 제출 내용을 다시 확인해 주세요.' using errcode='PT409';
    end if;
    select array(select u from unnest(members) u where not exists
      (select 1 from private.tournament_participants p where p.event_id=target and p.user_id=u)) into fresh;
    perform private.mutate_tournament_signup_terms(event_key,'group',md5(p_request::text||':room-group')::uuid,
      jsonb_build_object('club',c,'members',members,'version',(select version from private.tournament_club_polls where event_id=target and club_id=c)));
    -- The legacy group insert fills phone from the profile. Persist exactly the reviewed value for new rows.
    update private.tournament_participants p set phone=x.value->>'phone',name=x.value->>'name'
    from jsonb_array_elements(preview->'members') x where p.event_id=target and p.user_id=(x.value->>'id')::uuid
      and (p.user_id=any(fresh) or ('phone'=any(fields) and p.phone is null));
    if r.closed_at is null then
      insert into private.club_participation_votes(room_id,user_id,response,division,joined_queue_at,frozen)
      select r.id,m.user_id,m.response,m.division,m.queued_at,true from private.club_room_members(r) m
      on conflict(room_id,user_id) do update set response=excluded.response,division=excluded.division,frozen=true;
    end if;
    insert into private.club_participation_entries(room_id,user_id,position,shared)
    select r.id,(x.value->>'id')::uuid,x.ord::int,x.value-'id'
    from jsonb_array_elements(preview->'members') with ordinality x(value,ord);
    update private.club_participation_rooms set submitted_at=clock_timestamp(),closed_at=coalesce(closed_at,clock_timestamp()),
      submission=jsonb_build_object('fields',fields,'count',cardinality(members),
        'members',(select jsonb_agg(jsonb_build_object('id',m.user_id,'division',m.division) order by m.queued_at,m.name,m.user_id)
          from private.club_room_members(r) m where m.user_id=any(members))) where id=r.id;
    result:=jsonb_build_object('done',true,'submitted',cardinality(members));
  else raise exception '지원하지 않는 참여방 요청입니다.' using errcode='22023';
  end case;
  perform private.club_extension_complete(a,p_request,'club.participation',fingerprint,result);
  return result;
end $$;

revoke all on function private.club_room_state(private.club_participation_rooms),
  private.club_room_members(private.club_participation_rooms),private.club_room_contact(uuid),
  private.club_room_audience(private.club_participation_rooms,text),private.club_room_preview(private.club_participation_rooms,uuid[],text[])
  from public,anon,authenticated,service_role;
revoke all on function public.mutate_tournament_signup(text,text,uuid,jsonb),public.get_tournament_signup(text),
  public.get_club_participation(text,uuid),public.mutate_club_participation(text,uuid,text,uuid,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.mutate_tournament_signup(text,text,uuid,jsonb),public.get_club_participation(text,uuid),
  public.mutate_club_participation(text,uuid,text,uuid,jsonb) to authenticated;


grant execute on function public.get_tournament_signup(text) to anon,authenticated;
revoke all on function private.club_room_required_fields(uuid),private.club_room_shared_rosters(uuid,uuid),
  private.club_room_host_participant(uuid,jsonb),private.send_tournament_notice(public.events,text,uuid,text,uuid[]),
  private.send_tournament_notice_base(public.events,text,uuid,text,uuid[]),public.get_tournament_shared_roster(text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_tournament_shared_roster(text,uuid) to authenticated;

