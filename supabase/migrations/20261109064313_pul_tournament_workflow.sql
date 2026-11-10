create table private.tournament_signup (
  event_id uuid primary key references private.tournament_hosts(event_id),
  divisions text[] not null check (cardinality(divisions) between 1 and 4 and divisions <@ array['일반부','시니어부','여성부','여성시니어부']),
  fee integer not null check (fee between 0 and 100000000),
  deadline timestamptz not null,
  capacity integer not null check (capacity between 1 and 1000),
  guests boolean not null,
  comparison_basis text not null default 'unconfirmed' check (comparison_basis in ('unconfirmed','outdoor_18_single','other')),
  attendance_revision integer not null default 0,
  attendance_closed boolean not null default false
);

create table private.tournament_participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references private.tournament_signup(event_id),
  user_id uuid references public.user_accounts(id) on delete set null,
  guest boolean not null default false,
  name text not null check (char_length(name) between 1 and 100 and name !~ '[[:cntrl:]]'),
  phone text check (phone ~ '^01[0-9]{8,9}$'),
  nickname text check (char_length(nickname) <= 50),
  individual_division text,
  individual_club uuid references public.clubs(id),
  chosen_source text,
  status text not null default 'received' check (status in ('received','confirmed','cancelled')),
  attendance text check (attendance in ('attended','absent')),
  duplicate_of uuid references private.tournament_participants(id),
  version integer not null default 1,
  score integer check (score between 1 and 1000),
  place integer check (place between 1 and 1000),
  tied boolean not null default false,
  proposed_by uuid references public.user_accounts(id) on delete set null,
  result_entry uuid unique references private.club_tournament_entries(id),
  result_club uuid references public.clubs(id),
  result_at timestamptz,
  unique (event_id,user_id)
);

alter table private.tournament_result_corrections
  alter column entry_id drop not null,
  add column participant_id uuid references private.tournament_participants(id),
  add constraint tournament_correction_one_source check (num_nonnulls(entry_id,participant_id)=1);
create unique index tournament_participant_pending_correction on private.tournament_result_corrections(participant_id)
  where participant_id is not null and status='pending';

create index tournament_participants_event on private.tournament_participants(event_id);
create index tournament_participants_user on private.tournament_participants(user_id);

create table private.tournament_club_polls (
  event_id uuid not null references private.tournament_signup(event_id),
  club_id uuid not null references public.clubs(id),
  version integer not null default 1,
  primary key(event_id,club_id)
);

create table private.tournament_club_responses (
  event_id uuid not null,
  club_id uuid not null,
  user_id uuid not null references public.user_accounts(id) on delete cascade,
  response text not null check (response in ('yes','no','maybe')),
  division text,
  submitted_division text,
  primary key(event_id,club_id,user_id),
  foreign key(event_id,club_id) references private.tournament_club_polls(event_id,club_id)
);

create index tournament_submitted_responses_member
  on private.tournament_club_responses(event_id,user_id) where submitted_division is not null;

alter table private.tournament_signup enable row level security;
alter table private.tournament_participants enable row level security;
alter table private.tournament_club_polls enable row level security;
alter table private.tournament_club_responses enable row level security;
revoke all on private.tournament_signup, private.tournament_participants, private.tournament_club_polls,
  private.tournament_club_responses from public, anon, authenticated, service_role;

create view private.tournament_roster as
select p.*, coalesce(p.result_club,case when private.tournament_entry_member(choice.club_id,p.user_id) then choice.club_id end) as club_id, choice.division,
  coalesce(choice.conflict,false) as conflict,
  case when p.individual_division is not null and choice.group_count > 0 then 'both'
       when p.individual_division is not null then 'individual' else 'group' end as channel,
  coalesce(choice.sources,'[]'::jsonb) as sources,
  p.status <> 'cancelled' and p.duplicate_of is null and choice.division is not null
    and (p.guest or private.messaging_account_available(p.user_id)) as active
from private.tournament_participants p
left join lateral (
  select (array_agg(s.club_id order by s.source=p.chosen_source desc nulls last,s.source))[1] as club_id,
    (array_agg(s.division order by s.source=p.chosen_source desc nulls last,s.source))[1] as division,
    count(*) filter (where s.source<>'individual') as group_count,
    count(distinct (s.club_id,s.division)) > 1 and not coalesce(bool_or(s.source=p.chosen_source),false) as conflict,
    jsonb_agg(jsonb_build_object('id',s.source,'club',c.name,'division',s.division) order by s.source) as sources
  from (
    select 'individual'::text as source,p.individual_club as club_id,p.individual_division as division
    where p.individual_division is not null
    union all
    select r.club_id::text,r.club_id,r.submitted_division
    from private.tournament_club_responses r
    where r.event_id=p.event_id and r.user_id=p.user_id and r.submitted_division is not null
      and private.tournament_entry_member(r.club_id,r.user_id)
  ) s left join public.clubs c on c.id=s.club_id
) choice on true;
revoke all on private.tournament_roster from public, anon, authenticated, service_role;

create function private.tournament_mobile(p_phone text) returns text
language sql immutable set search_path='' as $$
  select case when mobile ~ '^01[0-9]{8,9}$' then mobile end
  from (select regexp_replace(regexp_replace(p_phone,'[[:space:]()-]','','g'),'^[+]?821','01') as mobile) normalized
$$;
revoke all on function private.tournament_mobile(text) from public,anon,authenticated,service_role;

create function private.tournament_signup_open(e public.events, s private.tournament_signup) returns boolean
language sql stable set search_path='' as $$
  select e.publication_status='published' and e.occurrence_status='scheduled'
    and e.registration_status='open' and s.deadline > statement_timestamp() and not s.attendance_closed
$$;

create function private.tournament_president(c uuid) returns uuid
language sql stable set search_path='' as $$
  select m.user_id from public.club_memberships m
  where m.club_id=c and m.membership_status='active'
    and private.messaging_account_available(m.user_id) and private.club_user_is_active_admin(m.user_id,c)
  order by m.id limit 1
$$;

alter function public.register_pul_tournament(uuid,jsonb) set schema private;
revoke all on function private.register_pul_tournament(uuid,jsonb) from public,anon,authenticated,service_role;

create function public.register_pul_tournament(p_request_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  saved jsonb;
  event public.events;
  sections text[];
  deadline timestamptz;
begin
  if not (p_payload ? 'divisions') then
    return private.register_pul_tournament(p_request_id,p_payload);
  end if;
  select array_agg(distinct btrim(value) order by btrim(value)) into sections
  from jsonb_array_elements_text(p_payload->'divisions');
  deadline := (p_payload->>'deadline')::timestamp at time zone 'Asia/Seoul';
  if sections is null or not (sections <@ array['일반부','시니어부','여성부','여성시니어부'])
    or deadline is null then
    raise exception '참가 부문과 신청 마감일을 확인해 주세요.' using errcode='22023';
  end if;
  saved := private.register_pul_tournament(p_request_id,p_payload);
  select * into event from public.events where event_key=saved->>'key';
  if not exists (select 1 from private.tournament_signup where event_id=event.id) then
    if event.related_course_id is null or deadline <= statement_timestamp()
      or (deadline at time zone 'Asia/Seoul')::date > event.start_date then
      raise exception '등록 구장과 경기일 이전의 신청 마감일을 확인해 주세요.' using errcode='22023';
    end if;
    insert into private.tournament_signup(event_id,divisions,fee,deadline,capacity,guests)
    values(event.id,sections,(p_payload->>'fee')::int,deadline,(p_payload->>'capacity')::int,
      coalesce((p_payload->>'guests')::boolean,false));
    update public.events set registration_status='open',
      schedule_note=nullif(btrim(p_payload->>'scheduleNote'),'') where id=event.id;
  end if;
  return saved;
end
$$;

create or replace function private.tournament_host_can_finalize(p_host private.tournament_hosts,p_actor uuid)
returns boolean language sql stable set search_path='' as $$
  select coalesce(private.messaging_account_available(p_actor) and (
    (p_host.host_club_id is not null and private.club_user_is_active_admin_or_vice_admin(p_actor,p_host.host_club_id))
    or (p_host.host_course_id is not null and private.course_current_operator(p_host.host_course_id,p_actor))
    or (num_nonnulls(p_host.host_club_id,p_host.host_course_id)=0 and exists (
      select 1 from private.tournament_signup s join public.events e on e.id=s.event_id
      where s.event_id=p_host.event_id and e.created_by=p_actor and e.publication_status='published'
    ))
  ),false)
$$;

create or replace function private.tournament_has_managed_host(p_event uuid) returns boolean
language sql stable set search_path='' as $$
  select exists (select 1 from private.tournament_hosts h where h.event_id=p_event
    and (num_nonnulls(h.host_club_id,h.host_course_id)>0
      or exists(select 1 from private.tournament_signup s where s.event_id=p_event)))
$$;

create function private.tournament_roster_review(event uuid) returns text
language sql stable set search_path='' as $$
  select md5(s.attendance_revision::text||':'||coalesce((
    select jsonb_agg(jsonb_build_array(r.id,r.version,r.attendance,r.club_id,r.division,r.conflict) order by r.id)::text
    from private.tournament_roster r where r.event_id=event and r.active
  ),'[]'))
  from private.tournament_signup s where s.event_id=event
$$;
revoke all on function private.tournament_roster_review(uuid) from public,anon,authenticated,service_role;

create function public.get_tournament_signup(p_event_key text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  e public.events;
  s private.tournament_signup;
  h private.tournament_hosts;
  a uuid:=auth.uid();
  host boolean;
begin
  select * into e from public.events where event_key=p_event_key and publication_status='published';
  select * into s from private.tournament_signup where event_id=e.id;
  if not found then return null; end if;
  select * into h from private.tournament_hosts where event_id=e.id;
  if not private.messaging_account_available(a) then a:=null; end if;
  host:=private.tournament_host_can_finalize(h,a);
  return jsonb_build_object('divisions',s.divisions,'fee',s.fee,'deadline',s.deadline,'capacity',s.capacity,
    'guests',s.guests,'open',private.tournament_signup_open(e,s),'host',host,'version',e.version,
    'generalSent',host and exists(select 1 from private.tournament_messages m where m.event_id=e.id and m.purpose='general'),
    'cancelled',e.occurrence_status='cancelled','playedOn',e.start_date,'venue',e.venue_name,
    'scheduleNote',e.schedule_note,'playedCourse',h.played_course_name,'attendanceClosed',s.attendance_closed,'finalized',h.finalized_at is not null,
    'reviewToken',case when host then private.tournament_roster_review(e.id) end,
    'attendanceReopened',s.attendance_revision>0 and not s.attendance_closed,
    'profile',(select jsonb_build_object('name',p.display_name,'phone',coalesce(b.contact_phone,u.phone))
      from public.user_profiles p left join private.member_basics b on b.user_id=p.user_id
      left join auth.users u on u.id=p.user_id where p.user_id=a),
    'clubs',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,
      'president',private.tournament_president(c.id)=a,'invited',c.id=h.host_club_id or exists(select 1 from private.tournament_messages tm
        where tm.event_id=e.id and tm.club_id=c.id and tm.purpose='invite'),'home',exists(select 1 from public.course_club_links l
        where l.club_id=c.id and l.course_id=e.related_course_id)) order by c.name)
      from public.clubs c where c.club_status='active' and exists(select 1 from public.club_memberships m
        where m.club_id=c.id and m.user_id=a and m.membership_status='active')),'[]'::jsonb),
    'affiliations',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'clubId',c.id,'club',c.name,'name',r.name,
      'division',r.division,'place',r.place,'score',r.score) order by c.name,r.name)
      from private.tournament_roster r
      join public.club_memberships m on m.user_id=r.user_id and m.membership_status='active'
      join public.clubs c on c.id=m.club_id and c.club_status='active'
      where r.event_id=e.id and h.finalized_at is not null and r.active and not r.guest
        and r.club_id is null and r.result_at is not null and private.tournament_president(c.id)=a),'[]'::jsonb),
    'inviteClubs',case when host then coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name) order by c.name)
      from public.clubs c where c.club_status='active' and c.directory_is_public and private.tournament_president(c.id) is not null),'[]'::jsonb) end,
    'polls',coalesce((select jsonb_agg(jsonb_build_object('club',c.name,'clubId',c.id,'version',poll.version,
        'manager',private.tournament_president(c.id)=a,
        'own',(select jsonb_build_object('response',r.response,'division',r.division,'submitted',r.submitted_division)
          from private.tournament_club_responses r where (r.event_id,r.club_id,r.user_id)=(e.id,c.id,a)),
        'rows',case when private.tournament_president(c.id)=a then coalesce((select jsonb_agg(jsonb_build_object(
          'id',r.user_id,'name',coalesce(p.display_name,'이름 미등록'),'response',r.response,'division',r.division,
          'submitted',r.submitted_division,'status',ro.status) order by p.display_name,r.user_id)
          from private.tournament_club_responses r left join public.user_profiles p on p.user_id=r.user_id
          left join private.tournament_roster ro on (ro.event_id,ro.user_id)=(e.id,r.user_id)
          where (r.event_id,r.club_id)=(e.id,c.id) and private.tournament_entry_member(c.id,r.user_id)),'[]'::jsonb) end
      ) order by c.name) from private.tournament_club_polls poll join public.clubs c on c.id=poll.club_id
      where poll.event_id=e.id and private.tournament_entry_member(c.id,a)),'[]'::jsonb),
    'roster',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,
      'phone',case when host or r.user_id=a then r.phone end,'nickname',case when host then r.nickname end,
      'clubId',r.club_id,'club',c.name,'division',r.division,'individualDivision',r.individual_division,
      'individualClub',r.individual_club,'status',case when r.active and e.occurrence_status<>'cancelled' then r.status else 'cancelled' end,
      'attendance',r.attendance,'conflict',r.conflict,'version',r.version,'channel',r.channel,'sources',r.sources,
      'duplicate',r.duplicate_of,'candidates',case when host and r.guest and r.active then coalesce((select jsonb_agg(other.id)
        from private.tournament_roster other where other.event_id=e.id and other.id<>r.id and other.active
          and lower(btrim(other.name))=lower(btrim(r.name)) and other.phone=r.phone),'[]'::jsonb) end,
      'place',coalesce(entry.place,r.place),'score',coalesce(entry.score,r.score),'tied',coalesce(entry.tied,r.tied),
      'official',r.result_at is not null,'own',r.user_id=a,'guest',r.guest,
      'canEnter',r.user_id=a or private.club_user_is_active_admin_or_vice_admin(a,r.club_id)
    ) order by r.name,r.id) from private.tournament_roster r left join public.clubs c on c.id=r.club_id
      left join private.club_tournament_entries entry on entry.id=r.result_entry
      where r.event_id=e.id and (r.guest or private.messaging_account_available(r.user_id))
        and (host or r.user_id=a or (r.active and not r.conflict and private.club_user_is_active_admin_or_vice_admin(a,r.club_id)))),'[]'::jsonb));
end
$$;


create table private.tournament_messages (
  message_id uuid primary key references public.messaging_messages(id) on delete cascade,
  event_id uuid not null references private.tournament_signup(event_id),
  club_id uuid references public.clubs(id),
  purpose text not null check (purpose in ('general','invite','poll','roster','actual','change')),
  sent_at timestamptz not null
);
create index tournament_messages_event on private.tournament_messages(event_id,purpose,sent_at);
create unique index tournament_general_once on private.tournament_messages(event_id) where purpose='general';
alter table private.tournament_messages enable row level security;
revoke all on private.tournament_messages from public,anon,authenticated,service_role;

create function private.send_tournament_notice(e public.events, notice_type text, club uuid, notice_body text, audience uuid[])
returns integer language plpgsql set search_path='' as $$
declare
  ids uuid[];
  sent timestamptz:=clock_timestamp();
  message uuid;
  actor uuid:=auth.uid();
begin
  select array(select distinct recipient from unnest(audience) recipient
    where recipient<>actor and private.messaging_account_available(recipient) order by recipient limit 10001) into ids;
  if cardinality(ids)=0 then return 0; end if;
  if cardinality(ids)>10000 or char_length(notice_body) not between 1 and 2000 then
    raise exception '쪽지 내용 또는 수신 인원 한도를 확인해 주세요.' using errcode='22023';
  end if;
  if exists(select 1 from private.tournament_messages tm join public.messaging_messages m on m.id=tm.message_id
    where tm.event_id=e.id and tm.purpose=notice_type and tm.club_id is not distinct from club
      and tm.sent_at>sent-interval '3 minutes' and m.body_hash=md5(notice_body)
      and ids=array(select r.recipient_user_id from public.messaging_recipients r where r.message_id=m.id order by r.recipient_user_id))
  then return 0; end if;
  if notice_type in ('invite','change') and (select count(*) from private.tournament_messages tm
    where tm.event_id=e.id and tm.purpose=notice_type and tm.sent_at>sent-interval '24 hours')>=100 then
    raise exception '이 대회의 오늘 발송 한도에 도달했습니다.' using errcode='PT409';
  end if;
  insert into public.messaging_messages(kind,sender_user_id,body,body_hash,recipient_key,request_id,request_fingerprint,
    first_contact,created_at,broadcast_recipient_count)
  values('tournament_broadcast',actor,notice_body,md5(notice_body),'tournament:'||e.id,gen_random_uuid(),md5(notice_body),false,sent,cardinality(ids))
  returning id into message;
  insert into private.tournament_messages values(message,e.id,club,notice_type,sent);
  insert into public.messaging_recipients(message_id,recipient_user_id,received_at)
  select message,recipient,sent from unnest(ids) recipient;
  return cardinality(ids);
end
$$;

create function public.mutate_tournament_signup(p_event_key text,p_operation text,p_request_id uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  e public.events;
  s private.tournament_signup;
  h private.tournament_hosts;
  r private.tournament_roster;
  entry private.club_tournament_entries;
  poll private.tournament_club_polls;
  venue public.courses;
  a uuid:=auth.uid();
  host boolean;
  c uuid:=nullif(p_input->>'club','')::uuid;
  pid uuid:=nullif(p_input->>'participant','')::uuid;
  division text:=nullif(p_input->>'division','');
  applicant_name text:=btrim(p_input->>'name');
  applicant_phone text:=private.tournament_mobile(p_input->>'phone');
  prior jsonb;
  fingerprint jsonb:=jsonb_build_array(p_event_key,p_operation,p_input);
  result jsonb;
  selected uuid[];
  affected uuid[];
  n int:=0;
  total int;
  message text;
  heading text;
  row record;
  state text:=coalesce(p_input->>'state','');
  open boolean;
  guests boolean;
  had_group boolean;
begin
  perform private.messaging_assert_read_committed();
  select * into e from public.events where event_key=p_event_key and publication_status='published';
  if e.id is null or p_request_id is null or p_operation is null or p_input is null then
    raise exception '공개 대회와 요청 번호를 확인해 주세요.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('pul-tournament:'||e.id,0));
  select * into e from public.events where id=e.id and publication_status='published' for update;
  select * into s from private.tournament_signup where event_id=e.id;
  if not found then raise exception '대회 신청이 열리지 않았습니다.' using errcode='42501'; end if;
  select * into h from private.tournament_hosts where event_id=e.id;
  host:=private.tournament_host_can_finalize(h,a);
  open:=private.tournament_signup_open(e,s);
  guests:=a is null and s.guests and p_operation='individual';
  if not guests then
    if not coalesce(private.messaging_account_available(a),false) then
      raise exception '활동 중인 회원 계정으로 로그인해 주세요.' using errcode='42501';
    end if;
    prior:=private.club_extension_previous(a,p_request_id,'event.tournament.signup',fingerprint);
    if prior is not null then return prior; end if;
  elsif exists (select 1 from private.tournament_participants p
    where p.id=p_request_id and p.event_id=e.id and p.guest and p.name=applicant_name and p.phone=applicant_phone
      and p.individual_division=coalesce(division,case when cardinality(s.divisions)=1 then s.divisions[1] end)
      and p.nickname is not distinct from nullif(btrim(p_input->>'nickname'),'')) then
    return jsonb_build_object('done',true);
  end if;
  if p_operation in ('roster_state','resolve','duplicate','attendance_close','attendance_reopen','finalize','change','general','invite','roster','actual')
      and not host then
    raise exception '현재 대회 개최자만 처리할 수 있습니다.' using errcode='42501';
  end if;
  if p_operation in ('individual','poll','respond','group','roster_state','resolve','duplicate')
      and (e.occurrence_status='cancelled' or s.attendance_closed) then
    raise exception '접수와 명단 확인이 종료됐습니다.' using errcode='PT409';
  end if;
  if s.attendance_revision>0 and (
    p_operation in ('individual','poll','respond','group','resolve','duplicate')
    or (p_operation='roster_state' and state not in ('attended','absent'))
  ) then
    raise exception '다시 연 출전 확인에서는 실제 참가와 미출전만 수정할 수 있습니다.' using errcode='PT409';
  end if;
  if c is not null and not exists(select 1 from public.clubs where id=c and club_status='active') then
    raise exception '활동 중인 동호회를 선택해 주세요.' using errcode='22023';
  end if;
  if pid is not null then
    select * into r from private.tournament_roster where id=pid and event_id=e.id;
    if not found or (r.version is distinct from (p_input->>'version')::int and p_operation<>'affiliation') then
      raise exception '참가 명단이 변경됐습니다. 다시 확인해 주세요.' using errcode='PT409';
    end if;
  end if;
  if cardinality(s.divisions)=1 then division:=s.divisions[1]; end if;
  heading:=e.title||' · '||to_char(e.start_date,'YYYY-MM-DD')||' · '||e.venue_name;

  case p_operation
  when 'individual' then
    if guests and state<>'' then
      raise exception '비회원은 새 접수만 제출할 수 있습니다.' using errcode='22023';
    end if;
    if state='cancel' and not guests then
      update private.tournament_participants set individual_division=null,individual_club=null,
        chosen_source=null,status=case when status='cancelled' then status else 'received' end,attendance=null,version=version+1
      where event_id=e.id and user_id=a and individual_division is not null;
    else
      if not open or not coalesce(division=any(s.divisions),false)
        or coalesce(char_length(applicant_name),0) not between 1 and 100 or applicant_phone is null
        or (c is not null and (guests or not private.tournament_entry_member(c,a))) then
        raise exception '접수 기간, 이름, 휴대전화, 소속과 참가 부문을 확인해 주세요.' using errcode='22023';
      end if;
      if guests then
        insert into private.tournament_participants(id,event_id,guest,name,phone,nickname,individual_division)
        values(p_request_id,e.id,true,applicant_name,applicant_phone,nullif(btrim(p_input->>'nickname'),''),division);
      else
        insert into private.tournament_participants(event_id,user_id,name,phone,individual_division,individual_club)
        values(e.id,a,applicant_name,applicant_phone,division,c)
        on conflict(event_id,user_id) do update set name=excluded.name,phone=excluded.phone,
          individual_division=excluded.individual_division,individual_club=excluded.individual_club,
          chosen_source=null,status='received',attendance=null,version=tournament_participants.version+1
        where tournament_participants.status<>'cancelled';
        if not found then raise exception '취소된 접수는 개최자에게 문의해 주세요.' using errcode='PT409'; end if;
      end if;
    end if;
  when 'poll' then
    if not open or private.tournament_president(c) is distinct from a or not (
      exists(select 1 from public.course_club_links l where l.club_id=c and l.course_id=e.related_course_id)
      or exists(select 1 from private.tournament_messages m where m.event_id=e.id and m.club_id=c and m.purpose='invite')
      or c=h.host_club_id
    ) is true then
      raise exception '개최 안내나 초청을 받은 동호회의 현재 회장만 의견을 열 수 있습니다.' using errcode='42501';
    end if;
    insert into private.tournament_club_polls(event_id,club_id) values(e.id,c) on conflict do nothing;
    if found then
      n:=private.send_tournament_notice(e,'poll',c,'회원 참가 의견 받기 · '||heading,
        array(select m.user_id from public.club_memberships m where m.club_id=c and m.membership_status='active'));
    end if;
  when 'respond' then
    if not open or not private.tournament_entry_member(c,a)
      or state not in ('yes','no','maybe') or state is null
      or (state='yes' and not coalesce(division=any(s.divisions),false))
      or not exists(select 1 from private.tournament_club_polls where event_id=e.id and club_id=c) then
      raise exception '동호회 소속과 응답 기간, 참가 부문을 확인해 주세요.' using errcode='42501';
    end if;
    select exists(select 1 from private.tournament_club_responses x where (x.event_id,x.club_id,x.user_id)=(e.id,c,a)
      and x.submitted_division is not null) into had_group;
    insert into private.tournament_club_responses(event_id,club_id,user_id,response,division)
    values(e.id,c,a,state,case when state='yes' then division end)
    on conflict(event_id,club_id,user_id) do update set response=excluded.response,division=excluded.division,
      submitted_division=case when excluded.response='yes' then tournament_club_responses.submitted_division end;
    update private.tournament_club_polls set version=version+1 where event_id=e.id and club_id=c;
    if state<>'yes' and had_group then
      update private.tournament_participants set chosen_source=null,
        status=case when status='cancelled' then status else 'received' end,attendance=null,version=version+1
      where event_id=e.id and user_id=a;
    end if;
  when 'group' then
    select * into poll from private.tournament_club_polls where event_id=e.id and club_id=c;
    if private.tournament_president(c) is distinct from a or poll.event_id is null then
      raise exception '현재 동호회 회장만 단체 접수를 제출할 수 있습니다.' using errcode='42501';
    end if;
    if poll.version is distinct from (p_input->>'version')::int then
      raise exception '회원 응답이 변경됐습니다. 새 명단을 확인해 주세요.' using errcode='PT409';
    end if;
    selected:=array(select distinct value::uuid from jsonb_array_elements_text(p_input->'members'));
    if exists(select 1 from unnest(selected) u where not exists (
      select 1 from private.tournament_club_responses x where (x.event_id,x.club_id,x.user_id)=(e.id,c,u)
        and x.response='yes' and private.tournament_entry_member(c,u)
        and (open or x.submitted_division=x.division)
        and not exists(select 1 from private.tournament_participants p where (p.event_id,p.user_id)=(e.id,u) and p.status='cancelled')
    )) then
      raise exception '선택한 참가 희망자와 접수 기간을 확인해 주세요.' using errcode='PT409';
    end if;
    with changed as (
      update private.tournament_club_responses x
      set submitted_division=case when x.user_id=any(selected) then x.division end
      where x.event_id=e.id and x.club_id=c and x.submitted_division is distinct from
        case when x.user_id=any(selected) then x.division end
      returning x.user_id
    ) select array_agg(user_id) into affected from changed;
    insert into private.tournament_participants(event_id,user_id,name,phone)
    select e.id,u,coalesce(nullif(btrim(p.display_name),''),'이름 미등록'),
      private.tournament_mobile(coalesce(b.contact_phone,u_phone.phone))
    from unnest(selected) u left join public.user_profiles p on p.user_id=u
    left join private.member_basics b on b.user_id=u
    left join auth.users u_phone on u_phone.id=u
    on conflict(event_id,user_id) do nothing;
    update private.tournament_participants set chosen_source=null,
      status=case when status='cancelled' then status else 'received' end,attendance=null,version=version+1
    where event_id=e.id and user_id=any(affected);
    update private.tournament_club_polls set version=version+1 where event_id=e.id and club_id=c;
  when 'roster_state' then
    if r.id is null or state is null or state not in ('received','confirmed','cancelled','attended','absent')
      or (state in ('confirmed','attended','absent') and (not r.active or r.conflict))
      or (state in ('attended','absent') and e.start_date>(statement_timestamp() at time zone 'Asia/Seoul')::date) then
      raise exception '참가 상태, 충돌 정보와 경기일을 확인해 주세요.' using errcode='22023';
    end if;
    update private.tournament_participants
      set status=case when state in ('attended','absent') then 'confirmed' else state end,
        attendance=case when state in ('attended','absent') then state end,
        score=case when state='attended' and r.attendance='attended' then r.score end,
        place=case when state='attended' and r.attendance='attended' then r.place end,
        tied=state='attended' and coalesce(r.attendance='attended',false) and r.tied,
        result_at=case when state='attended' and r.attendance='attended' then r.result_at end,
        proposed_by=case when state='attended' and r.attendance='attended' then r.proposed_by end,
        version=version+1
      where id=r.id;
  when 'resolve' then
    if r.id is null or not r.active or not exists(select 1 from jsonb_array_elements(r.sources) x where x->>'id'=state) then
      raise exception '실제 접수 경로에서 소속과 부문을 선택해 주세요.' using errcode='22023';
    end if;
    update private.tournament_participants set chosen_source=state,status='received',attendance=null,version=version+1 where id=r.id;
  when 'duplicate' then
    if r.id is null or not r.active or not r.guest or not exists(select 1 from private.tournament_roster t
      where t.id=nullif(state,'')::uuid and t.id<>r.id and t.event_id=e.id and t.active
        and lower(btrim(t.name))=lower(btrim(r.name)) and t.phone=r.phone) then
      raise exception '이름과 휴대전화가 일치하는 활성 접수를 선택해 주세요.' using errcode='22023';
    end if;
    update private.tournament_participants set duplicate_of=state::uuid,status='cancelled',attendance=null,version=version+1 where id=r.id;
  when 'attendance_reopen' then
    if not s.attendance_closed or h.finalized_at is not null or e.occurrence_status='cancelled'
      or p_input->>'reviewToken' is distinct from private.tournament_roster_review(e.id) then
      raise exception '최신 출전 명단을 다시 확인해 주세요. 결과 확정 뒤에는 출전을 바꿀 수 없습니다.' using errcode='PT409';
    end if;
    update private.tournament_signup set attendance_closed=false,attendance_revision=attendance_revision+1 where event_id=e.id;
  when 'attendance_close' then
    if h.finalized_at is not null or e.occurrence_status='cancelled' or open or e.start_date>(statement_timestamp() at time zone 'Asia/Seoul')::date
      or exists(select 1 from private.tournament_roster t where t.event_id=e.id and t.active and (t.attendance is null or t.conflict)) then
      raise exception '신청 마감과 전체 출전 여부 확인을 먼저 마쳐 주세요.' using errcode='PT409';
    end if;
    update private.tournament_signup set attendance_closed=true where event_id=e.id;
    update public.events set registration_status='closed' where id=e.id and registration_status='open';
  when 'change' then
    if (state<>'message' and (s.attendance_closed or s.attendance_revision>0 or h.finalized_at is not null)) or e.occurrence_status='cancelled'
      or e.version is distinct from (p_input->>'version')::int then
      raise exception '대회 상태가 변경됐거나 출전 확인이 끝났습니다.' using errcode='PT409';
    end if;
    if state='cancel' then
      update public.events set occurrence_status='cancelled',registration_status='ended',
        version=version+1,updated_by=a,updated_at=now() where id=e.id;
      heading:='대회 취소 · '||heading;
    elsif state='schedule' then
      select * into venue from public.courses where course_key=p_input->>'venueKey' and course_status='active' and course_type=e.match_type;
      if nullif(p_input->>'venueKey','') is not null and venue.id is null then
        raise exception '같은 경기 종류의 운영 구장을 선택해 주세요.' using errcode='22023';
      end if;
      if nullif(p_input->>'playedOn','') is null or (p_input->>'playedOn')::date < (s.deadline at time zone 'Asia/Seoul')::date then
        raise exception '접수 마감 이후의 경기일을 선택해 주세요.' using errcode='22023';
      end if;
      if coalesce(char_length(btrim(p_input->>'playedCourse')),0) not between 1 and 200 then
        raise exception '실제 플레이 코스를 확인해 주세요.' using errcode='22023';
      end if;
      update private.tournament_hosts set played_course_name=btrim(p_input->>'playedCourse') where event_id=e.id;
      update public.events set start_date=(p_input->>'playedOn')::date,
        end_date=null,related_course_id=coalesce(venue.id,e.related_course_id),venue_name=coalesce(venue.name,e.venue_name),
        schedule_note=nullif(btrim(p_input->>'scheduleNote'),''),
        region=case
          when venue.region in ('서울','경기','인천','강원','충청','전라','경상','제주') then venue.region
          when venue.region in ('대전','세종','충북','충남') then '충청'
          when venue.region in ('광주','전북','전남') then '전라'
          when venue.region in ('부산','대구','울산','경북','경남') then '경상'
          else e.region end,
        version=version+1,updated_by=a,updated_at=now() where id=e.id returning * into e;
      heading:='일정·구장 변경 · '||e.title||' · '||to_char(e.start_date,'YYYY-MM-DD')||' · '||e.venue_name;
    elsif state is distinct from 'message' then
      raise exception '변경 안내 종류를 확인해 주세요.' using errcode='22023';
    end if;
    message:=btrim(p_input->>'body');
    if coalesce(char_length(message),0) not between 1 and 1000 then
      raise exception '안내 내용을 확인해 주세요.' using errcode='22023';
    end if;
    n:=private.send_tournament_notice(e,'change',null,
      heading||coalesce(chr(10)||e.schedule_note,'')||chr(10)||message,
      array(select t.user_id from private.tournament_roster t where t.event_id=e.id and t.active and t.user_id is not null));
  when 'general' then
    if e.occurrence_status='cancelled' then raise exception '취소한 대회입니다.' using errcode='PT409'; end if;
    if not exists(select 1 from private.tournament_messages m where m.event_id=e.id and m.purpose='general') then
      n:=private.send_tournament_notice(e,'general',null,'개최 안내 · '||heading,
        array(
          select b.user_id from public.course_bookmarks b where b.course_id=e.related_course_id
          union
          select m.user_id from public.course_club_links l join public.club_memberships m on m.club_id=l.club_id
          join public.clubs club on club.id=l.club_id and club.club_status='active'
          where l.course_id=e.related_course_id and m.membership_status='active'
          union
          select private.tournament_president(l.club_id) from public.course_club_links l where l.course_id=e.related_course_id
        ));
    end if;
  when 'invite' then
    if not open or private.tournament_president(c) is null
      or not exists(select 1 from public.clubs where id=c and directory_is_public) then
      raise exception '초청 기간과 대상 회장을 확인해 주세요.' using errcode='42501';
    end if;
    message:=btrim(p_input->>'body');
    if coalesce(char_length(message),0) not between 1 and 650
      or (nullif(btrim(p_input->>'benefit'),'') is not null and (
        coalesce(char_length(btrim(p_input->>'benefit')),0)>300
        or coalesce(char_length(btrim(p_input->>'terms')),0) not between 1 and 300
        or nullif(p_input->>'expires','') is null
        or (p_input->>'expires')::date not between (statement_timestamp() at time zone 'Asia/Seoul')::date
          and (s.deadline at time zone 'Asia/Seoul')::date
      )) then raise exception '초청 내용과 혜택의 인원·조건·마감일을 확인해 주세요.' using errcode='22023'; end if;
    n:=private.send_tournament_notice(e,'invite',c,'동호회 초청 · '||heading||chr(10)||message||
      case when nullif(btrim(p_input->>'benefit'),'') is not null then chr(10)||'혜택 · '||(p_input->>'benefit')
        ||chr(10)||'적용 인원·조건 · '||(p_input->>'terms')||chr(10)||'마감일 · '||(p_input->>'expires') else '' end,
      array[private.tournament_president(c)]);
  when 'roster', 'actual' then
    if open or e.occurrence_status='cancelled' or (p_operation='actual' and not s.attendance_closed)
      or exists(select 1 from private.tournament_roster t where t.event_id=e.id and t.active and t.conflict) then
      raise exception '마감, 참가 정보 충돌과 실제 출전 확인 상태를 확인해 주세요.' using errcode='PT409';
    end if;
    c:=null;
    for row in
      select t.club_id,t.name,t.division,t.status,t.attendance,club.name as club_name,
        count(*) over (partition by t.club_id) as applications,
        count(*) filter (where t.attendance='attended') over (partition by t.club_id) as attended
      from private.tournament_roster t join public.clubs club on club.id=t.club_id
      where t.event_id=e.id and t.active
      order by t.club_id,t.name,t.id
    loop
      if c is distinct from row.club_id then
        if message is not null then
          n:=n+private.send_tournament_notice(e,p_operation,c,message,array[private.tournament_president(c)]);
        end if;
        c:=row.club_id;
        heading:=e.title||' · '||row.club_name||' · 신청 '||row.applications||'명'
          ||case when p_operation='actual' then ' · 실제 참가 '||row.attended||'명' else '' end;
        message:=heading;
      end if;
      if p_operation='roster' or row.attendance='attended' then
        if char_length(message)>1700 then
          n:=n+private.send_tournament_notice(e,p_operation,c,message,array[private.tournament_president(c)]);
          message:=heading||' (계속)';
        end if;
        message:=message||chr(10)||row.name||' · '||row.division||' · '
          ||case when p_operation='actual' then '실제 참가' when row.status='confirmed' then '참가 확정' else '접수 완료' end;
      end if;
    end loop;
    if message is not null then
      n:=n+private.send_tournament_notice(e,p_operation,c,message,array[private.tournament_president(c)]);
    end if;
  when 'result', 'finalize', 'affiliation' then
    result:=private.save_tournament_workflow_result(e,s,h,r,p_operation,p_input);
  else
    raise exception '지원하는 대회 작업을 선택해 주세요.' using errcode='22023';
  end case;

  if p_operation in ('individual','group') and not (p_operation='individual' and state='cancel' and not guests) then
    select count(*) into total from private.tournament_roster t where t.event_id=e.id and t.active;
    if total>s.capacity then raise exception '대회 정원이 찼습니다.' using errcode='PT409'; end if;
  end if;
  result:=coalesce(result,jsonb_build_object('done',true,'sent',n));
  if not guests then
    perform private.club_extension_complete(a,p_request_id,'event.tournament.signup',fingerprint,result);
  end if;
  return result;
end
$$;


create or replace function private.guard_linked_tournament() returns trigger
language plpgsql set search_path = '' as $$
declare ev public.events; workflow_basis text;
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
    select s.comparison_basis into workflow_basis from private.tournament_signup s where s.event_id=new.event_id;
    if found then new.comparison_basis:=workflow_basis; end if;
    if ev.match_type = 'screen' and new.comparison_basis = 'outdoor_18_single' then
      raise exception '스크린 대회는 필드 18홀 순위에 포함할 수 없습니다.' using errcode = '22023';
    end if;
  end if;
  return new;
end
$$;

create function private.link_tournament_workflow_result(e public.events,s private.tournament_signup,r private.tournament_roster,c uuid)
returns uuid language plpgsql set search_path='' as $$
declare
  sheet uuid;
  person uuid;
  official private.club_tournament_entries;
begin
  if not private.tournament_entry_member(c,r.user_id) then
    raise exception '선수의 현재 동호회 소속을 확인해 주세요.' using errcode='42501';
  end if;
  select t.id into sheet from private.club_tournaments t where t.event_id=e.id and t.club_id=c;
  if sheet is null then
    insert into private.club_tournaments(club_id,title,played_on,course_id,course_name,event_id,divisions,comparison_basis)
    values(c,e.title,e.start_date,e.related_course_id,e.venue_name,e.id,s.divisions,s.comparison_basis) returning id into sheet;
  end if;
  person:=private.tournament_person(c,jsonb_build_object('user_id',r.user_id));
  select x.* into official from private.club_tournament_entries x
  where x.tournament_id=sheet and x.person_id=person and x.division=r.division;
  if official.confirmed and (official.excluded or official.source_entry_id is not null
      or (official.place,official.score,official.tied) is distinct from (r.place,r.score,r.tied)) then
    raise exception '다른 기존 공식 결과가 있습니다. 기존 정정 절차에서 확인해 주세요.' using errcode='PT409';
  end if;
  if not coalesce(official.confirmed,false) then
    insert into private.club_tournament_entries(id,tournament_id,person_id,display_name,division,intent,registration,attendance,
      place,score,tied,award,confirmed,confirmed_by)
    values(r.id,sheet,person,r.name,r.division,case when r.channel='group' then 'group' else 'individual' end,'complete','attended',
      r.place,r.score,r.tied,case when r.place<=3 then 'yes' else 'no' end,true,auth.uid())
    on conflict(tournament_id,person_id,division) do update set attendance='attended',registration='complete',
      place=excluded.place,score=excluded.score,tied=excluded.tied,award=excluded.award,confirmed=true,
      confirmed_by=auth.uid(),excluded=false,source_entry_id=null
    returning * into official;
  end if;
  update private.club_tournaments set version=version+1,updated_at=now() where id=sheet;
  return official.id;
end
$$;

create function private.save_tournament_workflow_result(e public.events,s private.tournament_signup,h private.tournament_hosts,
  r private.tournament_roster,op text,input jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare
  a uuid:=auth.uid();
  host boolean:=private.tournament_host_can_finalize(h,a);
  entered_score int:=nullif(input->>'score','')::int;
  entered_place int:=nullif(input->>'place','')::int;
  entered_tied boolean:=coalesce((input->>'tied')::boolean,false);
  club uuid:=nullif(input->>'club','')::uuid;
  reason text:=btrim(input->>'reason');
  basis text:=coalesce(nullif(input->>'comparisonBasis',''),case when e.match_type='screen' then 'other' else 'unconfirmed' end);
  entry private.club_tournament_entries;
  linked uuid;
begin
  if e.occurrence_status='cancelled' or not s.attendance_closed or
     e.start_date>(statement_timestamp() at time zone 'Asia/Seoul')::date then
    raise exception '경기 후 출전 확인을 마쳐 주세요.' using errcode='PT409';
  end if;
  if op='finalize' then
    if not host then raise exception '대회 개최자만 확정할 수 있습니다.' using errcode='42501'; end if;
    if h.finalized_at is not null then return jsonb_build_object('done',true); end if;
    if input->>'reviewToken' is distinct from private.tournament_roster_review(e.id) then
      raise exception '검토 중 명단이나 성적이 변경됐습니다. 다시 확인해 주세요.' using errcode='PT409';
    end if;
    if not exists(select 1 from private.tournament_roster t where t.event_id=e.id and t.active and t.attendance='attended')
      or exists(select 1 from private.tournament_roster t where t.event_id=e.id and t.active and t.attendance='attended'
        and (t.place is null or t.score is null or t.result_at is null)) then
      raise exception '실제 참가자 전원의 성적을 개최자가 확인해 주세요.' using errcode='PT409';
    end if;
    if exists (
      select 1 from private.tournament_roster t where t.event_id=e.id and t.active and t.attendance='attended'
      group by t.division,t.place having bool_or(t.tied) is distinct from (count(*)>1)
        or bool_and(t.tied) is distinct from (count(*)>1)
    ) then raise exception '같은 부문·순위의 공동 여부를 확인해 주세요.' using errcode='22023'; end if;
    if basis not in ('unconfirmed','outdoor_18_single','other')
      or (basis='outdoor_18_single' and e.match_type is distinct from 'field') then
      raise exception '실제 경기 기준을 확인해 주세요.' using errcode='22023';
    end if;
    update private.tournament_signup set comparison_basis=basis where event_id=e.id returning * into s;
    update private.club_tournaments set comparison_basis=basis,version=version+1,updated_at=now()
    where event_id=e.id and comparison_basis is distinct from basis;
    for r in select * from private.tournament_roster t where t.event_id=e.id and t.active and t.attendance='attended' order by t.id loop
      linked:=case when r.club_id is not null and private.tournament_entry_member(r.club_id,r.user_id)
        then private.link_tournament_workflow_result(e,s,r,r.club_id) end;
      update private.tournament_participants set result_entry=linked,result_club=case when linked is not null then r.club_id end,
        score=case when linked is null then r.score end,place=case when linked is null then r.place end,
        tied=linked is null and r.tied,version=version+1 where id=r.id;
    end loop;
    update private.tournament_hosts set finalized_at=clock_timestamp(),finalized_by=a where event_id=e.id;
    return jsonb_build_object('done',true);
  end if;
  if r.id is null or not r.active or r.attendance is distinct from 'attended' or r.conflict then
    raise exception '실제 참가가 확인된 명단에서 선택해 주세요.' using errcode='42501';
  end if;
  if op='affiliation' then
    if h.finalized_at is null or r.result_at is null or r.result_entry is not null or r.guest or r.user_id is null
      or r.club_id is not null or club is null
      or (a is distinct from r.user_id and private.tournament_president(club) is distinct from a)
      or not private.tournament_entry_member(club,r.user_id) then
      raise exception '선수 본인 또는 현재 실제 소속의 회장만 동호회를 연결할 수 있습니다.' using errcode='42501';
    end if;
    update private.tournament_participants set result_club=club where id=r.id;
    linked:=private.link_tournament_workflow_result(e,s,r,club);
    update private.tournament_result_corrections set entry_id=linked,participant_id=null,
      source_revision=(select result_revision from private.club_tournament_entries x where x.id=linked)
    where participant_id=r.id and status='pending';
    update private.tournament_participants set result_entry=linked,score=null,place=null,tied=false,version=version+1 where id=r.id;
    return jsonb_build_object('done',true);
  end if;
  if not (host or a is not distinct from r.user_id or private.club_user_is_active_admin_or_vice_admin(a,r.club_id)) then
    raise exception '본인 또는 해당 동호회 운영진만 성적을 입력할 수 있습니다.' using errcode='42501';
  end if;
  if entered_score is null or entered_score not between 1 and 1000 or entered_place is null or entered_place not between 1 and 1000 then
    raise exception '공식 타수와 순위를 확인해 주세요.' using errcode='22023';
  end if;
  if h.finalized_at is not null then
    select * into entry from private.club_tournament_entries x where x.id=r.result_entry and x.confirmed and not x.excluded;
    if (coalesce(entry.place,r.place),coalesce(entry.score,r.score),coalesce(entry.tied,r.tied))=(entered_place,entered_score,entered_tied) then
      return jsonb_build_object('done',true);
    end if;
    if (r.result_entry is not null and entry.id is null) or r.result_at is null
      or coalesce(char_length(reason),0) not between 5 and 500 then
      raise exception '원본 결과와 정정 사유를 확인해 주세요.' using errcode='22023';
    end if;
    if exists(select 1 from private.tournament_result_corrections q
      where (q.entry_id=entry.id or q.participant_id=r.id) and q.status='pending') then
      raise exception '이미 처리 대기 중인 정정이 있습니다.' using errcode='PT409';
    end if;
    insert into private.tournament_result_corrections(entry_id,participant_id,requested_by,reason,
      old_place,old_score,old_tied,new_place,new_score,new_tied,source_revision,requested_at)
    values(entry.id,case when entry.id is null then r.id end,a,reason,coalesce(entry.place,r.place),coalesce(entry.score,r.score),
      coalesce(entry.tied,r.tied),entered_place,entered_score,entered_tied,coalesce(entry.result_revision,r.version),statement_timestamp());
  else
    if not host and r.result_at is not null then
      if (r.place,r.score,r.tied)=(entered_place,entered_score,entered_tied) then return jsonb_build_object('done',true); end if;
      raise exception '개최자가 검토한 성적입니다. 결과 확정 후 정정을 요청해 주세요.' using errcode='PT409';
    end if;
    update private.tournament_participants set score=entered_score,place=entered_place,tied=entered_tied,proposed_by=a,
      result_at=case when host then clock_timestamp() end,version=version+1 where id=r.id;
  end if;
  return jsonb_build_object('done',true);
end
$$;

create function private.tournament_affiliation_pending(p_result uuid) returns boolean
language sql stable set search_path='' as $$
  select exists(select 1 from private.tournament_participants r where r.id=p_result
    and r.result_entry is null and r.result_at is not null and not r.guest and r.place between 1 and 3)
$$;

create function public.get_public_tournament_results(p_event_key text default null,p_course_key text default null)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('eventKey',x.event_key,'title',x.title,'date',x.played_on,
    'name',private.hall_viewer_name(x.user_id,x.display_name),'club',x.club_name,'division',x.division,
    'score',x.score,'place',x.place,'tied',x.tied,'affiliationPending',private.tournament_affiliation_pending(x.id),
    'approvalPending',private.tournament_approval_pending(x.id))
    order by x.played_on desc,x.event_key,x.division,x.place,x.id),'[]'::jsonb)
  from (
    select t.* from private.hall_confirmed_tournament_results t
    join public.events e on e.event_key=t.event_key and e.publication_status='published' and e.occurrence_status='scheduled'
    left join public.courses c on c.id=e.related_course_id and c.course_status='active'
    where (p_event_key is not null and t.event_key=p_event_key or p_course_key is not null and c.course_key=p_course_key)
      and t.played_on <= (statement_timestamp() at time zone 'Asia/Seoul')::date
    order by t.played_on desc,t.event_key,t.division,t.place,t.id limit case when p_event_key is null then 24 else 1000 end
  ) x
$$;



revoke all on function private.tournament_signup_open(public.events,private.tournament_signup),
  private.tournament_president(uuid),private.send_tournament_notice(public.events,text,uuid,text,uuid[]),
  private.link_tournament_workflow_result(public.events,private.tournament_signup,private.tournament_roster,uuid),
  private.save_tournament_workflow_result(public.events,private.tournament_signup,private.tournament_hosts,private.tournament_roster,text,jsonb),
  private.tournament_affiliation_pending(uuid) from public,anon,authenticated,service_role;
revoke all on function public.register_pul_tournament(uuid,jsonb), public.get_tournament_signup(text),
  public.mutate_tournament_signup(text,text,uuid,jsonb), public.get_public_tournament_results(text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.register_pul_tournament(uuid,jsonb) to authenticated;
grant execute on function public.get_tournament_signup(text), public.mutate_tournament_signup(text,text,uuid,jsonb),
  public.get_public_tournament_results(text,text) to anon,authenticated;

alter table public.messaging_messages drop constraint messaging_messages_kind_check;
alter table public.messaging_messages add constraint messaging_messages_kind_check
  check(kind in ('direct','platform_broadcast','club_broadcast','club_event_broadcast','course_broadcast','course_inquiry','tournament_broadcast'));
alter table public.messaging_messages drop constraint messaging_broadcast_shape_check;
alter table public.messaging_messages add constraint messaging_broadcast_shape_check check (
  (kind in ('direct','course_inquiry') and broadcast_recipient_count is null) or
  (kind in ('platform_broadcast','club_broadcast','club_event_broadcast','course_broadcast','tournament_broadcast')
    and broadcast_recipient_count between 1 and 10000 and broadcast_recipient_count is not null
    and reply_to_message_id is null and not first_contact)
);

create or replace function private.messaging_check_broadcast_batch()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from (select distinct message_id from new_receipts) n
    join public.messaging_messages m on m.id=n.message_id where m.kind in ('platform_broadcast','club_broadcast','club_event_broadcast','course_broadcast','tournament_broadcast')
      and m.broadcast_recipient_count<>(select count(*) from public.messaging_recipients r where r.message_id=m.id)) then
    raise exception 'messaging_delivery_invariant' using errcode='23514';
  end if;
  return null;
end;
$$;

create or replace function private.messaging_check_delivery()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_sender uuid; v_time timestamptz; v_kind text; v_count integer;
begin
  if tg_table_name = 'messaging_messages' then v_id := new.id; else v_id := new.message_id; end if;
  select m.sender_user_id, m.created_at, m.kind, m.broadcast_recipient_count into v_sender, v_time, v_kind, v_count from public.messaging_messages m where m.id = v_id;
  if v_kind='course_inquiry' then
    if not exists(select 1 from private.course_shared_messages where message_id=v_id)
       or exists(select 1 from public.messaging_recipients where message_id=v_id) then
      raise exception 'shared_delivery_invariant' using errcode='23514';end if;
    return null;
  end if;
  if v_kind in ('platform_broadcast','club_broadcast','club_event_broadcast','course_broadcast','tournament_broadcast') then
    if tg_table_name='messaging_recipients' then
      if new.recipient_user_id=v_sender or new.received_at<>v_time then
        raise exception 'messaging_delivery_invariant' using errcode='23514';
      end if;
    elsif (select count(*) from public.messaging_recipients where message_id=v_id)<>v_count
      or (v_kind='tournament_broadcast' and not exists(select 1 from private.tournament_messages where message_id=v_id)) then
      raise exception 'messaging_delivery_invariant' using errcode='23514';
    end if;
    return null;
  end if;
  if (select count(*) from public.messaging_recipients r where r.message_id = v_id) <> 1
    or exists (select 1 from public.messaging_recipients r where r.message_id = v_id
      and (r.recipient_user_id = v_sender or r.received_at <> v_time)) then
    raise exception 'messaging_delivery_invariant' using errcode = '23514';
  end if;
  return null;
end;
$$;

create or replace function private.messaging_list(p_box text,p_limit integer,p_cursor_at timestamptz,p_cursor_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.messaging_assert_actor(); v_rows jsonb; v_more boolean;
begin
  perform private.messaging_validate_page(p_limit,p_cursor_at,p_cursor_id);
  with eligible as (
    select m.id, m.body, m.kind, m.reply_to_message_id, m.sender_user_id as counterpart,
      r.received_at as sort_at, r.read_at
    from public.messaging_recipients r join public.messaging_messages m on m.id=r.message_id
    where p_box='inbox' and r.recipient_user_id=v_actor and r.hidden_at is null
      and (p_cursor_at is null or (r.received_at,r.message_id)<(p_cursor_at,p_cursor_id))
    union all
    select m.id, m.body, m.kind, m.reply_to_message_id, r.recipient_user_id, m.created_at, null::timestamptz
    from public.messaging_messages m left join public.messaging_recipients r on r.message_id=m.id
    where p_box='sent' and m.kind='direct' and m.sender_user_id=v_actor and m.sender_hidden_at is null
      and (p_cursor_at is null or (m.created_at,m.id)<(p_cursor_at,p_cursor_id))
    union all
    select m.id,m.body,m.kind,m.reply_to_message_id,null::uuid,m.created_at,null::timestamptz
    from public.messaging_messages m
    where p_box='sent' and m.kind in ('course_broadcast','tournament_broadcast') and m.sender_user_id=v_actor and m.sender_hidden_at is null
      and (p_cursor_at is null or (m.created_at,m.id)<(p_cursor_at,p_cursor_id))
  ), page as (select * from eligible order by sort_at desc,id desc limit p_limit+1),
  numbered as (select *,row_number() over(order by sort_at desc,id desc) as n from page)
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'counterpart_display',case when kind='platform_broadcast' then 'PUL 공지' when kind='club_broadcast' then '동호회 공지' when kind='club_event_broadcast' then '행사 안내' when kind='tournament_broadcast' then '대회 안내' when kind='course_broadcast' then '장소 운영공지' else private.messaging_display_name(counterpart) end,
    'preview',left(body,100),'at',sort_at,'read_at',read_at,'is_reply',reply_to_message_id is not null)
    order by sort_at desc,id desc) filter(where n<=p_limit),'[]'::jsonb), count(*)>p_limit
    into v_rows,v_more from numbered;
  return jsonb_build_object('items',v_rows,'has_more',v_more,'next_cursor',case when v_more then
    jsonb_build_object('at',v_rows->(p_limit-1)->>'at','id',v_rows->(p_limit-1)->>'id') else null end);
end;
$$;

create or replace function public.get_messaging_message(p_message_id uuid,p_mark_read boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.messaging_assert_actor(); v_m public.messaging_messages%rowtype;
  v_r public.messaging_recipients%rowtype; v_is_recipient boolean; v_counterpart uuid;
begin
  if p_mark_read is null then raise exception 'messaging_invalid' using errcode='22023'; end if;
  select m.* into v_m from public.messaging_messages m where m.id=p_message_id;
  if v_m.kind='course_inquiry' then raise exception '구장 문의함에서 확인해 주세요.' using errcode='P0002';end if;
  if v_m.kind in ('course_broadcast','tournament_broadcast') and v_m.sender_user_id=v_actor and v_m.sender_hidden_at is null then
    return jsonb_build_object('id',v_m.id,'kind',v_m.kind,'body',v_m.body,'counterpart_user_id',null,
      'counterpart_display',case when v_m.kind='tournament_broadcast' then '대회 안내' else '장소 운영공지' end,'created_at',v_m.created_at,'reply_to_message_id',null,
      'is_recipient',false,'read_at',null,'recipient_count',v_m.broadcast_recipient_count,'event_key', (select e.event_key from private.tournament_messages tm join public.events e on e.id=tm.event_id where tm.message_id=v_m.id and e.publication_status='published'));
  end if;
  if v_m.kind in ('platform_broadcast','club_broadcast','club_event_broadcast','course_broadcast','tournament_broadcast') then
    select r.* into v_r from public.messaging_recipients r
      where r.message_id=p_message_id and r.recipient_user_id=v_actor and r.hidden_at is null;
    if not found then raise exception 'messaging_not_found' using errcode='P0002'; end if;
    if p_mark_read then
      update public.messaging_recipients set read_at=coalesce(read_at,clock_timestamp())
        where message_id=p_message_id and recipient_user_id=v_actor and hidden_at is null returning * into v_r;
      if not found then raise exception 'messaging_not_found' using errcode='P0002'; end if;
    end if;
    return jsonb_build_object('id',v_m.id,'kind',v_m.kind,'body',v_m.body,'counterpart_user_id',null,
      'counterpart_display',case when v_m.kind='club_broadcast' then '동호회 공지' when v_m.kind='club_event_broadcast' then '행사 안내' when v_m.kind='tournament_broadcast' then '대회 안내' when v_m.kind='course_broadcast' then '장소 운영공지' else 'PUL 공지' end,'created_at',v_m.created_at,'reply_to_message_id',null,
      'is_recipient',true,'read_at',v_r.read_at,'event_key',(select e.event_key from private.tournament_messages tm join public.events e on e.id=tm.event_id where tm.message_id=v_m.id and e.publication_status='published'));
  end if;
  select r.* into v_r from public.messaging_recipients r where r.message_id=p_message_id;
  v_is_recipient := coalesce(v_r.recipient_user_id=v_actor,false);
  if v_m.sender_user_id=v_actor and v_m.sender_hidden_at is null then v_counterpart:=v_r.recipient_user_id;
  elsif v_is_recipient and v_r.hidden_at is null then
    v_counterpart:=v_m.sender_user_id;
    if p_mark_read then
      update public.messaging_recipients set read_at=coalesce(read_at,clock_timestamp())
        where message_id=p_message_id and recipient_user_id=v_actor and hidden_at is null returning * into v_r;
      if not found then raise exception 'messaging_not_found' using errcode='P0002'; end if;
    end if;
  else raise exception 'messaging_not_found' using errcode='P0002'; end if;
  -- The counterpart identifier supports block/unblock, never profile access.
  return jsonb_build_object('id',v_m.id,'kind',v_m.kind,'body',v_m.body,'counterpart_user_id',v_counterpart,'counterpart_display',private.messaging_display_name(v_counterpart),
    'created_at',v_m.created_at,'reply_to_message_id',v_m.reply_to_message_id,'is_recipient',v_is_recipient,
    'read_at',case when v_is_recipient then v_r.read_at else null end);
end;
$$;

create or replace function public.submit_messaging_report(p_message_id uuid,p_reason text,p_detail text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.messaging_assert_actor(); v_id uuid; v_detail text := private.messaging_trim(coalesce(p_detail,''));
begin
  perform private.messaging_assert_read_committed();
  if p_reason is null or p_reason not in ('spam','harassment','inappropriate','fraud','other') or char_length(v_detail)>1000 then
    raise exception 'messaging_invalid' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(1297303347,pg_catalog.hashtext(v_actor::text));
  perform private.messaging_assert_actor();
  if not exists(select 1 from public.messaging_messages where id=p_message_id and kind in ('direct','club_broadcast','club_event_broadcast','course_broadcast','tournament_broadcast')) then
    raise exception 'messaging_not_found' using errcode='P0002';
  end if;
  -- A hidden receipt still proves recipient relation; evidence is independent of hide.
  if not exists(select 1 from public.messaging_recipients where message_id=p_message_id and recipient_user_id=v_actor) then
    raise exception 'messaging_not_found' using errcode='P0002';
  end if;
  select id into v_id from public.messaging_reports where message_id=p_message_id and reporter_user_id=v_actor and status='open';
  if found then return jsonb_build_object('id',v_id,'duplicate',true); end if;
  if (select count(*) from public.messaging_reports where reporter_user_id=v_actor and created_at>clock_timestamp()-interval '24 hours')>=20 then
    raise exception 'messaging_report_quota' using errcode='P0001';
  end if;
  insert into public.messaging_reports(message_id,reporter_user_id,reason,detail) values(p_message_id,v_actor,p_reason,v_detail) returning id into v_id;
  return jsonb_build_object('id',v_id,'duplicate',false);
end;
$$;

create or replace function public.hide_messaging_message(p_message_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.messaging_assert_actor();
begin
  update public.messaging_messages set sender_hidden_at=coalesce(sender_hidden_at,clock_timestamp())
    where id=p_message_id and kind in ('direct','course_broadcast','tournament_broadcast') and sender_user_id=v_actor;
  if not found then
    update public.messaging_recipients set hidden_at=coalesce(hidden_at,clock_timestamp())
      where message_id=p_message_id and recipient_user_id=v_actor;
    if not found then raise exception 'messaging_not_found' using errcode='P0002'; end if;
  end if;
  return jsonb_build_object('id',p_message_id,'hidden',true);
end;
$$;

create or replace function private.guard_linked_tournament_result() returns trigger
language plpgsql set search_path = '' as $$
declare t private.club_tournaments; member uuid; approved boolean; locked boolean; applied boolean; late_affiliation boolean;
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
  late_affiliation := new.confirmed and not new.excluded and new.source_entry_id is null
    and (tg_op='INSERT' or not old.confirmed)
    and exists (select 1 from private.tournament_roster r
      where r.event_id=t.event_id and r.user_id=member and r.result_club=t.club_id
        and r.result_at is not null and r.result_entry is null and r.active and r.attendance='attended'
        and (r.division,r.place,r.score,r.tied)=(new.division,new.place,new.score,new.tied));
  if new.confirmed and not new.excluded and not coalesce(approved,false) and not coalesce(applied,false)
    and exists (select 1 from private.tournament_signup s where s.event_id=t.event_id)
    and not exists (select 1 from private.tournament_roster r
      where r.event_id=t.event_id and r.user_id=member and r.club_id=t.club_id
        and r.active and r.attendance='attended' and r.result_at is not null
        and (r.division,r.place,r.score,r.tied)=(new.division,new.place,new.score,new.tied))
  then raise exception '같은 대회에서 개최자가 확인한 출전 명단과 결과를 사용해 주세요.' using errcode='PT409'; end if;
  locked := exists (
    select 1 from private.tournament_hosts h where h.event_id=t.event_id and h.finalized_at is not null
  ) and ((tg_op='UPDATE' and old.confirmed and not old.excluded) or (new.confirmed and not new.excluded));
  if not approved and not coalesce(applied,false) and ((locked and not coalesce(late_affiliation,false)) or (not new.excluded and (
    (tg_op='UPDATE' and old.confirmed and exists (
      select 1 from private.tournament_result_corrections q where q.entry_id=new.id and q.status='pending'
    )) or ((new.confirmed or new.place is not null or new.score is not null) and exists (
      select 1 from private.tournament_result_corrections q where q.requesting_entry_id=new.id and q.status='pending'
    ))
  ))) then
    raise exception '확정 또는 정정 검토 중인 성적입니다. 정정 승인 후 변경할 수 있습니다.' using errcode='PT409';
  end if;
  if new.excluded or not new.confirmed then return new; end if;
  if not private.tournament_entry_member(t.club_id,member) and not (
    approved and exists (select 1 from private.tournament_participants p
      where p.event_id=t.event_id and p.result_entry=new.id and p.result_at is not null)
  ) then
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

create or replace function public.review_pul_tournament_correction(p_event_key text,p_correction uuid,p_approve boolean,p_rejection_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  h private.tournament_hosts; q private.tournament_result_corrections; t private.club_tournaments;
  src private.tournament_shareable_results; receiving private.club_tournaments;
  rejection text:=private.messaging_trim(p_rejection_reason);
  actor uuid:=auth.uid(); club_key text; managed boolean;
  signup_event public.events; pending_result private.tournament_participants;
  original private.club_tournament_entries;
  decision text:=case when p_approve then 'approved' else 'rejected' end;
begin
  perform private.messaging_assert_read_committed();
  if p_approve is null or not coalesce(private.messaging_account_available(actor),false) then
    raise exception '현재 정정 검토 권한을 확인해 주세요.' using errcode='42501';
  end if;
  select req.* into q from private.tournament_result_corrections req where req.id=p_correction;
  if q.participant_id is not null then
    select ev.* into signup_event from public.events ev join private.tournament_participants p on p.event_id=ev.id
    where p.id=q.participant_id and ev.event_key=p_event_key and ev.publication_status='published' and ev.occurrence_status='scheduled';
    perform pg_advisory_xact_lock(hashtextextended('pul-tournament:' || signup_event.id,0));
    select * into h from private.tournament_hosts where event_id=signup_event.id;
    if h.finalized_at is null or not private.tournament_host_can_finalize(h,actor) then
      raise exception '대회 주최자만 정정 요청을 처리할 수 있습니다.' using errcode='42501';
    end if;
    select * into q from private.tournament_result_corrections where id=p_correction for update;
    if q.status=decision then return; end if;
    if q.participant_id is null or q.status<>'pending' then
      raise exception '정정 요청이 변경됐습니다. 새로고침해 주세요.' using errcode='PT409';
    end if;
    select * into pending_result from private.tournament_participants r
    where r.id=q.participant_id and r.event_id=signup_event.id and r.status='confirmed'
      and r.attendance='attended' and r.result_entry is null and r.result_at is not null
    for update;
    if not found or pending_result.version<>q.source_revision
      or (pending_result.place,pending_result.score,pending_result.tied) is distinct from (q.old_place,q.old_score,q.old_tied) then
      raise exception '원본 성적의 버전이 변경됐습니다. 최신 성적을 확인해 주세요.' using errcode='PT409';
    end if;
    update private.tournament_result_corrections set status=decision,reviewed_by=actor,
      reviewed_at=statement_timestamp() where id=q.id;
    if p_approve then
      update private.tournament_participants set place=q.new_place,score=q.new_score,tied=q.new_tied,version=version+1
      where id=q.participant_id;
    end if;
    return;
  end if;
  select ts.* into t from private.tournament_result_corrections req
  join private.club_tournament_entries ent on ent.id=req.entry_id
  join private.club_tournaments ts on ts.id=ent.tournament_id
  join public.events ev on ev.id=ts.event_id and ev.event_key=p_event_key
  where req.id=p_correction;
  if not found then raise exception '정정 요청을 확인할 수 없습니다.' using errcode='42501'; end if;
  select * into h from private.tournament_hosts where event_id=t.event_id;
  managed:=q.applied_revision is null and private.tournament_has_managed_host(t.event_id);
  if managed and (h.finalized_at is null or not private.tournament_host_can_finalize(h,actor)) then
    raise exception '대회 주최자만 정정 요청을 처리할 수 있습니다.' using errcode='42501';
  end if;
  if managed and h.host_club_id is null then
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
  if q.applied_revision is not null and q.requested_by=actor then
    raise exception '직접 정정한 성적은 원본 동호회의 다른 회장·부회장이 처리해야 합니다.' using errcode='42501';
  end if;
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
  if managed and q.requesting_entry_id is null and exists (
    select 1 from private.tournament_participants p
    where p.event_id=t.event_id and p.result_entry=q.entry_id and p.result_at is not null
  ) then
    select e.* into original from private.club_tournament_entries e
    where e.id=q.entry_id and e.tournament_id=t.id and e.confirmed and not e.excluded
      and e.attendance='attended' and e.source_entry_id is null
    for update;
    if not private.tournament_scope_visible(t) or original.id is null or original.result_revision<>q.source_revision
      or (original.place,original.score,original.tied) is distinct from (q.old_place,q.old_score,q.old_tied) then
      raise exception '원본 성적이 변경됐습니다. 최신 성적을 확인해 주세요.' using errcode='PT409';
    end if;
  elsif p_approve then
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

create or replace view private.hall_confirmed_tournament_results as
with candidates as (
  select e.id, t.id as tournament_id, coalesce(t.event_id, t.id) as competition_id,
         ev.event_key, coalesce(ev.title, t.title) as title, coalesce(ev.start_date, t.played_on) as played_on,
         coalesce(ev.match_type, co.course_type, case when t.comparison_basis = 'outdoor_18_single' then 'field' end) as game_type,
         case when ev.match_type = 'screen' then coalesce(h.played_course_name, t.course_name)
              when h.played_course_name is not null then t.course_name || ' · ' || h.played_course_name
              else t.course_name end as course_name, t.club_id, c.name as club_name, p.user_id, e.division, e.place, e.tied, e.score,
         coalesce(workflow.result_at,e.score_entered_at) as score_entered_at,
         coalesce(h.finalized_at, e.result_confirmed_at) as result_confirmed_at,
         coalesce(nullif(btrim(pr.display_name), ''), e.display_name) as display_name,
         n.id as news_id
  from private.club_tournament_entries e
  join private.club_tournaments t on t.id = e.tournament_id
  join private.club_score_people p on p.id = e.person_id and p.club_id = t.club_id and not p.anonymized
  join public.user_accounts a on a.id = p.user_id and a.account_status = 'active'
  join public.clubs c on c.id = t.club_id and c.club_status = 'active' and c.directory_is_public
  left join public.user_profiles pr on pr.user_id = p.user_id
  left join public.events ev on ev.id = t.event_id
  left join private.tournament_hosts h on h.event_id = t.event_id
  left join private.tournament_participants workflow on workflow.result_entry=e.id and workflow.event_id=t.event_id
  left join public.courses co on co.id = t.course_id
  left join private.tournament_award_news n on n.entry_id = e.id and n.confirmed and not n.hidden
  where not e.excluded and e.confirmed and e.attendance = 'attended'
    and e.place is not null and e.score is not null
    and (t.event_id is null or (ev.publication_status = 'published' and ev.occurrence_status='scheduled'))
    and (not private.tournament_has_managed_host(t.event_id) or h.finalized_at is not null)
    and (workflow.result_entry is not null or not exists(select 1 from private.tournament_signup s where s.event_id=t.event_id))
    and (t.schedule_id is null or exists (
      select 1 from public.club_official_events se
      where se.id = t.schedule_id and se.event_status not in ('draft','cancelled') and se.moderation_status = 'visible'
    ))
), deduplicated as (
  select s.*, row_number() over (
    partition by competition_id, division, user_id
    order by result_confirmed_at, id
  ) as copy_order
  from candidates s
  where not exists (
    select 1 from candidates other
    where (other.competition_id, other.division, other.user_id) = (s.competition_id, s.division, s.user_id)
      and (other.place, other.tied, other.score, other.game_type) is distinct from (s.place, s.tied, s.score, s.game_type)
  )
)
select * from deduplicated where copy_order = 1
union all
select p.id,p.id,e.id,e.event_key,e.title,e.start_date,e.match_type,
  case when e.match_type='screen' then h.played_course_name else e.venue_name||' · '||h.played_course_name end,
  null::uuid,'무소속',p.user_id,p.division,p.place,p.tied,p.score,p.result_at,h.finalized_at,p.name,null::uuid,1::bigint
from private.tournament_roster p
join public.events e on e.id=p.event_id and e.publication_status='published' and e.occurrence_status='scheduled'
join private.tournament_hosts h on h.event_id=e.id and h.finalized_at is not null
where p.active and p.attendance='attended' and p.result_at is not null and p.result_entry is null;

create or replace view private.hall_national_score_sources as
select s.*, c.name as club_name, r.score_entered_at as entered_at
from private.public_personal_score_sources s
join public.clubs c on c.id = s.club_id
join private.club_monthly_sheets m on s.kind = 'monthly' and m.id = s.source_id
join private.club_monthly_scores r on r.sheet_id = m.id and r.person_id = s.person_id
where m.game_type is distinct from 'screen'
  and (m.event_id is null or exists (
    select 1 from public.club_official_events se
    where se.id = m.event_id and se.event_status not in ('draft','cancelled') and se.moderation_status = 'visible'
  ))
union all
select s.*, t.club_name, t.score_entered_at
from private.public_personal_score_sources s
join private.hall_confirmed_tournament_results t on s.kind = 'tournament' and t.id = s.source_id
where t.game_type = 'field'
union all
select null::uuid,null::uuid,'tournament'::text,t.tournament_id,t.id,t.played_on,t.title,t.course_name,
  e.related_course_id,t.competition_id,t.score,t.score_entered_at,'tournament:'||t.id,null::text,t.user_id,t.display_name,
  null::text,t.club_name,t.score_entered_at
from private.hall_confirmed_tournament_results t
join private.tournament_participants p on p.id=t.id and p.event_id=t.competition_id and p.result_entry is null
join private.tournament_signup signup on signup.event_id=t.competition_id and signup.comparison_basis='outdoor_18_single'
join public.events e on e.id=t.competition_id
where t.game_type='field' and t.user_id is not null;

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
          'division', division, 'place', place, 'tied', tied, 'score', score, 'newsId', news_id, 'approvalPending',private.tournament_approval_pending(id),'affiliationPending',private.tournament_affiliation_pending(id)
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
    (select 'score' as kind, greatest(s.entered_at, tournament.result_confirmed_at) as published_at,
            s.played_on, s.display_name, s.user_id, s.club_name, s.course_name, s.score, s.title as label, null::uuid as news_id,
            s.kind='tournament' and private.tournament_approval_pending(s.source_id) as approval_pending,
            tournament.event_key, s.kind='tournament' and private.tournament_affiliation_pending(s.source_id) as affiliation_pending
     from private.hall_national_score_sources s
     left join private.hall_confirmed_tournament_results tournament on s.kind='tournament' and tournament.id=s.source_id
     where s.played_on <= (statement_timestamp() at time zone 'Asia/Seoul')::date
     order by entered_at desc, source_key limit 8)
    union all
    (select case when t.place<=3 then 'award' else 'result' end, t.result_confirmed_at, t.played_on, t.display_name, t.user_id,
            t.club_name, t.course_name, t.score, t.title || ' · ' || t.place || '위', t.news_id, private.tournament_approval_pending(t.id), t.event_key, private.tournament_affiliation_pending(t.id)
     from private.hall_confirmed_tournament_results t where (t.place between 1 and 3 or exists (select 1 from private.tournament_signup s where s.event_id=t.competition_id))
       and t.game_type in ('field', 'screen') and t.played_on <= (statement_timestamp() at time zone 'Asia/Seoul')::date
     order by t.result_confirmed_at desc, t.id limit 8)
    union all
    (select 'special', r.published_at, r.played_on, r.display_name, r.target_user_id,
            r.club_name, r.course_name, null, r.record_type_code, null, false, null::text, false
     from private.hall_national_special_records r where r.played_on <= (statement_timestamp() at time zone 'Asia/Seoul')::date
     order by r.published_at desc, r.id limit 8)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'kind', kind, 'date', played_on, 'name', private.hall_viewer_name(user_id, display_name),
    'club', club_name, 'course', course_name, 'score', score, 'label', label, 'newsId', news_id, 'approvalPending',approval_pending,'eventKey',event_key,'affiliationPending',affiliation_pending
  ) order by published_at desc, kind, played_on desc, label), '[]'::jsonb)
  from (select * from recent order by published_at desc, kind, played_on desc, label limit 8) selected
$$;

alter function public.finalize_pul_tournament_results(text,text) set schema private;
revoke all on function private.finalize_pul_tournament_results(text,text) from public,anon,authenticated,service_role;
create function public.finalize_pul_tournament_results(p_event_key text,p_review_token text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from private.tournament_signup s join public.events e on e.id=s.event_id
    where e.event_key=p_event_key) then
    raise exception '대회 참가 명단에서 공식 결과를 확정해 주세요.' using errcode='42501';
  end if;
  perform private.finalize_pul_tournament_results(p_event_key,p_review_token);
end
$$;
revoke all on function public.finalize_pul_tournament_results(text,text) from public,anon,authenticated,service_role;
grant execute on function public.finalize_pul_tournament_results(text,text) to authenticated;

create function private.tournament_registration_status(e public.events) returns text
language sql stable set search_path='' as $$
  select case when e.occurrence_status='cancelled' then 'ended'
    when e.registration_status='open' and exists(select 1 from private.tournament_signup s
      where s.event_id=e.id and s.deadline<=statement_timestamp()) then 'closed'
    else e.registration_status end
$$;
revoke all on function private.tournament_registration_status(public.events) from public,anon,authenticated,service_role;

create or replace function private.public_event_json(p_event public.events)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'event_key', p_event.event_key,
    'title', p_event.title,
    'match_type', p_event.match_type,
    'event_scale', p_event.event_scale,
    'region', p_event.region,
    'venue_name', p_event.venue_name,
    'venue_type', p_event.venue_type,
    'start_date', p_event.start_date,
    'end_date', p_event.end_date,
    'schedule_note', p_event.schedule_note,
    'registration_status', private.tournament_registration_status(p_event),
    'target_audience', p_event.target_audience,
    'organizer', p_event.organizer,
    'summary', p_event.summary,
    'benefits', p_event.benefits,
    'recruitment_status', p_event.recruitment_status,
    'related_course', (
      select pg_catalog.jsonb_build_object(
        'course_key', course.course_key,
        'name', course.name
      )
      from public.courses as course
      where course.id = p_event.related_course_id
        and course.course_status = 'active'
    ),
    'official_url', p_event.official_url,
    'registration_url', p_event.registration_url,
    'registration_note', p_event.registration_note,
    'is_featured', p_event.is_featured
  );
$$;

create or replace function public.list_public_events(
  p_match_type text default null,
  p_region text default null,
  p_registration_status text default null,
  p_limit integer default 24,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_total integer;
  v_items jsonb;
begin
  if p_match_type is not null and p_match_type not in ('field', 'screen') then
    raise exception '시합 유형을 확인해 주세요.';
  end if;
  if p_region is not null and p_region not in ('서울', '경기', '인천', '강원', '충청', '전라', '경상', '제주', '장소 미정') then
    raise exception '지역을 확인해 주세요.';
  end if;
  if p_registration_status is not null and p_registration_status not in ('open', 'scheduled', 'closed', 'needCheck', 'ended') then
    raise exception '접수 상태를 확인해 주세요.';
  end if;
  if p_limit not between 1 and 50 or p_offset < 0 then
    raise exception '페이지 범위를 확인해 주세요.';
  end if;

  select pg_catalog.count(*)::integer
  into v_total
  from public.events as event
  where event.publication_status = 'published'
    and (p_match_type is null or event.match_type = p_match_type)
    and (p_region is null or event.region = p_region)
    and (p_registration_status is null or private.tournament_registration_status(event) = p_registration_status);

  with page as (
    select event.id
    from public.events as event
    where event.publication_status = 'published'
      and (p_match_type is null or event.match_type = p_match_type)
      and (p_region is null or event.region = p_region)
      and (p_registration_status is null or private.tournament_registration_status(event) = p_registration_status)
    order by
      (event.start_date is null),
      (event.start_date < current_date),
      case when event.start_date >= current_date then event.start_date end,
      case when event.start_date < current_date then event.start_date end desc,
      event.created_at desc,
      event.event_key
    limit p_limit
    offset p_offset
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      private.public_event_json(event)
      order by
        (event.start_date is null),
        (event.start_date < current_date),
        case when event.start_date >= current_date then event.start_date end,
        case when event.start_date < current_date then event.start_date end desc,
        event.created_at desc,
        event.event_key
    ),
    '[]'::jsonb
  )
  into v_items
  from page
  join public.events as event on event.id = page.id;

  return pg_catalog.jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', p_offset + pg_catalog.jsonb_array_length(v_items) < v_total
  );
end;
$$;

create or replace function private.course_content_overview(p_course_key text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.courses%rowtype; ev jsonb; can_send boolean:=false;
begin
 select * into c from public.courses where course_key=p_course_key and course_status='active';if not found then raise exception '구장을 찾을 수 없습니다.';end if;
 select coalesce(jsonb_agg(jsonb_build_object('key',e.event_key,'title',e.title,'start',e.start_date,'end',e.end_date,'note',e.schedule_note,'registration',private.tournament_registration_status(e),'phase',case when occurrence_status='cancelled' then 'cancelled' when start_date is null then 'unknown' when coalesce(end_date,start_date)<(now() at time zone 'Asia/Seoul')::date then 'past' when start_date>(now() at time zone 'Asia/Seoul')::date then 'upcoming' else 'ongoing' end) order by e.start_date desc nulls last,e.event_key),'[]') into ev from (select * from public.events where related_course_id=c.id and publication_status='published' order by start_date desc nulls last,event_key limit 50)e;
 if auth.uid() is not null then begin perform private.messaging_assert_course_broadcaster(c.id);can_send:=true;exception when others then can_send:=false;end;end if;
 return jsonb_build_object('counts',private.course_content_counts(c.id),'resources',private.course_content_list(p_course_key,null,6,0,true),'events',ev,'notices',case when c.course_type='screen' then private.course_content_notices(p_course_key,1,0) else jsonb_build_object('items','[]'::jsonb,'total',0) end,'contact_connected',exists(select 1 from private.course_inquiry_recipients r join private.course_stewards s on s.course_id=r.course_id and s.user_id=r.user_id and s.active where r.course_id=c.id and private.messaging_account_available(r.user_id)),'manager',private.course_actor_has_permission(auth.uid(),'courses.manage'),'steward',exists(select 1 from private.course_stewards where course_id=c.id and user_id=auth.uid() and active),'can_broadcast',can_send);
end $$;
create or replace function private.tournament_scope_visible(t private.club_tournaments) returns boolean
language sql stable set search_path='' as $$
  select (t.event_id is null or exists (
    select 1 from public.events ev where ev.id=t.event_id and ev.publication_status='published' and ev.occurrence_status='scheduled'
  )) and (t.schedule_id is null or exists (
    select 1 from public.club_official_events se where se.id=t.schedule_id
      and se.event_status not in ('draft','cancelled') and se.moderation_status='visible'
  ))
$$;

create or replace function public.get_pul_tournament_host_results(p_event_key text)
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
        'id', q.id, 'name', q.display_name, 'division', q.division, 'reason', q.reason,
        'oldPlace', q.old_place, 'oldScore', q.old_score, 'oldTied', q.old_tied,
        'newPlace', q.new_place, 'newScore', q.new_score, 'newTied', q.new_tied
      ) order by q.requested_at, q.id)
            from (
        select q.id,q.requested_at,q.reason,q.old_place,q.old_score,q.old_tied,q.new_place,q.new_score,q.new_tied,
          e.display_name,e.division
        from private.tournament_result_corrections q join private.club_tournament_entries e on e.id=q.entry_id
        join private.club_tournaments t on t.id=e.tournament_id
        where t.event_id=h.event_id and q.status='pending' and not e.excluded
        union all
        select q.id,q.requested_at,q.reason,q.old_place,q.old_score,q.old_tied,q.new_place,q.new_score,q.new_tied,r.name,r.division
        from private.tournament_result_corrections q join private.tournament_roster r on r.id=q.participant_id
        where r.event_id=h.event_id and q.status='pending' and r.active and r.result_entry is null
      ) q
    ), '[]'::jsonb));
end
$$;

notify pgrst, 'reload schema';
