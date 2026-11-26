-- Organization-owned accounting. Only authenticated, scope-checked RPCs reach these rows.
create table private.accounting_books (
  kind text not null check(kind in ('club','tournament','university','course')),
  owner_id uuid not null,
  opening_date date not null check(isfinite(opening_date)),
  opening_amount bigint not null check(abs(opening_amount)<=1000000000000),
  columns text[] not null default array['counterparty','event','receipt']::text[],
  primary key(kind,owner_id)
);
create table private.accounting_delegates (
  membership_id uuid primary key references public.club_memberships(id) on delete cascade,
  can_share boolean not null
);
create table private.accounting_categories (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  owner_id uuid not null,
  direction text not null check(direction in ('income','expense')),
  label text not null check(char_length(label) between 1 and 60),
  group_name text not null default 'general' check(group_name in ('general','dues','donation','fee','refund','support','agency_return')),
  foreign key(kind,owner_id) references private.accounting_books(kind,owner_id),
  unique(kind,owner_id,direction,label)
);
create table private.accounting_entries (
  id uuid primary key,
  kind text not null,
  owner_id uuid not null,
  entry_date date not null check(isfinite(entry_date)),
  category_id uuid not null references private.accounting_categories(id),
  amount bigint not null check(amount between 1 and 1000000000000),
  description text not null check(char_length(description) between 1 and 500),
  counterparty text check(char_length(counterparty)<=160),
  member_id uuid,
  event_id uuid,
  agency_event uuid references public.events(id),
  daily_total boolean not null default false,
  facility text check(char_length(facility)<=160),
  work_date date check(isfinite(work_date)),
  receipt_status text not null default 'later' check(receipt_status in ('attached','later','missing','na')),
  receipt_reason text check(char_length(receipt_reason)<=500),
  receipt_id uuid,
  receipt_mime text check(receipt_mime in ('image/jpeg','image/png','image/webp','application/pdf')),
  receipt_hash text check(receipt_hash ~ '^[0-9a-f]{64}$'),
  refund_of uuid references private.accounting_entries(id),
  transfer_id uuid references private.accounting_entries(id),
  return_of uuid references private.accounting_entries(id),
  cancelled boolean not null default false,
  version integer not null default 1,
  created_by uuid,
  created_name text not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_by uuid,
  updated_name text not null,
  updated_at timestamptz not null default clock_timestamp(),
  foreign key(kind,owner_id) references private.accounting_books(kind,owner_id),
  check((receipt_status='attached')=(receipt_id is not null)),
  check(num_nonnulls(receipt_id,receipt_mime,receipt_hash) in (0,3))
);
create index accounting_entries_period on private.accounting_entries(kind,owner_id,entry_date,id);
create unique index accounting_daily_charge on private.accounting_entries(owner_id,entry_date)
 where kind='course' and daily_total and not cancelled;
create index accounting_refunds on private.accounting_entries(refund_of) where not cancelled;
create index accounting_agency_returns on private.accounting_entries(return_of) where not cancelled;
create unique index accounting_transfer_once on private.accounting_entries(transfer_id) where not cancelled and transfer_id is not null;
create table private.accounting_audit (
  entry_id uuid not null references private.accounting_entries(id),
  version integer not null,
  before_values jsonb not null,
  after_values jsonb not null,
  reason text not null check(char_length(reason) between 1 and 500),
  primary key(entry_id,version)
);
create table private.accounting_requests (
  id uuid primary key,
  kind text not null,
  owner_id uuid not null,
  category_id uuid not null references private.accounting_categories(id),
  title text not null check(char_length(title) between 1 and 120),
  amount bigint not null check(amount between 1 and 1000000000000),
  starts date not null check(isfinite(starts)),
  due date not null check(isfinite(due) and due>=starts),
  period_start date check(isfinite(period_start)),
  period_end date check(isfinite(period_end)),
  event_id uuid,
  route text not null check(route in ('standard','agency','direct','official')),
  guidance text not null check(char_length(guidance) between 1 and 1200),
  link text check(char_length(link)<=500 and link ~ '^https://[^[:space:]]+$'),
  sent_at timestamptz,
  discarded_at timestamptz,
  foreign key(kind,owner_id) references private.accounting_books(kind,owner_id),
  check(route not in ('direct','official') or link is not null),
  check(sent_at is null or discarded_at is null),
  check((period_start is null and period_end is null) or (period_start is not null and period_end>=period_start and period_end is not null))
);
create table private.accounting_targets (
  request_id uuid not null references private.accounting_requests(id),
  user_id uuid not null,
  name text not null,
  acknowledged_at timestamptz,
  pledged bigint check(pledged between 0 and 1000000000000),
  resolution text check(resolution in ('exempt','cancelled')),
  primary key(request_id,user_id)
);
create index accounting_targets_user on private.accounting_targets(user_id,request_id);
create table private.accounting_allocations (
  transaction_id uuid not null references private.accounting_entries(id),
  request_id uuid not null,
  user_id uuid not null,
  amount bigint not null check(amount between 1 and 1000000000000),
  primary key(transaction_id,request_id,user_id),
  foreign key(request_id,user_id) references private.accounting_targets(request_id,user_id)
);
create index accounting_allocations_target on private.accounting_allocations(request_id,user_id);
create table private.accounting_publications (
  id uuid primary key,
  kind text not null,
  owner_id uuid not null,
  owner_name text not null,
  previous_id uuid unique references private.accounting_publications(id),
  snapshot jsonb not null,
  audience uuid[] not null,
  channel text not null check(channel in ('message','notice','both')),
  created_at timestamptz not null default clock_timestamp(),
  foreign key(kind,owner_id) references private.accounting_books(kind,owner_id)
);
create index accounting_publication_owner on private.accounting_publications(kind,owner_id,created_at desc);
create table private.accounting_operations (
  actor uuid not null,
  request_id uuid not null,
  fingerprint jsonb not null,
  result jsonb not null,
  primary key(actor,request_id)
);

do $$
declare name text;
begin
  foreach name in array array['books','delegates','categories','entries','audit','requests','targets','allocations','publications','operations'] loop
    execute format('alter table private.accounting_%I enable row level security',name);
    execute format('revoke all on private.accounting_%I from public,anon,authenticated,service_role',name);
  end loop;
end $$;

create function private.accounting_revoke_delegate() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='club_memberships' then
    delete from private.accounting_delegates where membership_id=old.id;
  else
    delete from private.accounting_delegates where membership_id=old.membership_id;
  end if;
  return null;
end $$;
create trigger accounting_membership_ended after update of membership_status on public.club_memberships
for each row when(old.membership_status='active' and new.membership_status<>'active')
execute function private.accounting_revoke_delegate();
create trigger accounting_presidency_ended after update of revoked_at on public.club_role_assignments
for each row when(old.role_code='club_admin' and old.revoked_at is null and new.revoked_at is not null)
execute function private.accounting_revoke_delegate();

create function private.accounting_access(k text,o uuid,a uuid) returns integer
language sql stable set search_path='' as $$
  select case when not coalesce(private.messaging_account_available(a),false) then 0
    when k='club' then case
      when private.tournament_president(o)=a then 3
      else coalesce((select case when d.can_share then 2 else 1 end
        from private.accounting_delegates d join public.club_memberships m on m.id=d.membership_id
        join public.clubs c on c.id=m.club_id
        where m.club_id=o and m.user_id=a and m.membership_status='active' and c.club_status='active'),0) end
    when k='tournament' and exists(select 1 from private.tournament_hosts h where h.event_id=o
      and private.tournament_host_can_finalize(h,a)) then 2
    when k='university' and private.university_manages(o,a) then 2
    when k='course' and private.course_current_operator(o,a) then 2
    else 0 end
$$;

create view private.accounting_owners as
 select 'club'::text kind,id,coalesce(slug,legacy_key,id::text) key,name from public.clubs where club_status='active'
 union all select 'tournament',e.id,e.event_key,e.title from public.events e join private.tournament_hosts h on h.event_id=e.id
 union all select 'university',id,department_key,university_name||' · '||department_name from public.lesson_university_departments
 union all select 'course',id,course_key,name from public.courses;
revoke all on private.accounting_owners from public,anon,authenticated,service_role;

create function private.accounting_people(k text,o uuid) returns table(user_id uuid,name text)
language sql stable set search_path='' as $$
  select u.id,coalesce(case when k='club' then private.club_registered_name(o,u.id) end,private.messaging_display_name(u.id),'회원')
  from (
    select m.user_id from public.club_memberships m where k='club' and m.club_id=o and m.membership_status='active'
    union
    select r.user_id from private.tournament_roster r where k='tournament' and r.event_id=o and r.active and r.status='confirmed'
    union
    select s.user_id from public.lesson_university_students s where k='university' and s.department_id=o and s.approved_at is not null
    union
    select s.user_id from public.course_notification_subscriptions s where k='course' and s.course_id=o and s.unsubscribed_at is null
  ) p join public.user_accounts u on u.id=p.user_id where private.messaging_account_available(u.id)
$$;

create function private.accounting_events(k text,o uuid) returns table(id uuid,name text,external boolean)
language sql stable set search_path='' as $$
  select e.id,e.title,false from public.club_official_events e
   where k='club' and e.club_id=o and e.event_status<>'draft'
  union all select e.id,e.title,true from public.events e
   where k='club' and e.publication_status='published' and exists(
     select 1 from private.club_participation_rooms r where r.club_id=o and r.tournament_id=e.id
     union all select 1 from private.tournament_club_responses r where r.club_id=o and r.event_id=e.id)
  union all select e.id,e.title,false from public.events e where k='tournament' and e.id=o
  union all select e.id,e.title,false from public.lesson_university_space_entries e
    where k='university' and e.department_id=o and e.kind='event'
  union all select e.id,e.title,false from public.events e join private.tournament_hosts h on h.event_id=e.id
    where k='course' and h.host_course_id=o
$$;

create function private.accounting_eligible(k text,o uuid,event uuid,route text,u uuid) returns boolean
language sql stable set search_path='' as $$
  select exists(select 1 from private.accounting_people(k,o) p where p.user_id=u)
  and case
    when k='club' and route in ('agency','direct') then exists(
      select 1 from private.tournament_roster r
      where r.event_id=event and r.user_id=u and r.status='confirmed' and r.active
      and (r.club_id=o or exists(select 1 from private.tournament_club_responses x
        where x.club_id=o and x.event_id=event and x.user_id=u and x.submitted_division is not null)))
    when k='club' and event is not null then exists(
      select 1 from public.club_official_event_participations p join public.club_memberships m on m.id=p.membership_id
      where p.event_id=event and m.club_id=o and m.user_id=u
      union all select 1 from private.club_participation_entries a join private.club_participation_rooms r on r.id=a.room_id
      where r.monthly_event_id=event and r.club_id=o and a.user_id=u and r.closed_at is not null)
    when k='university' and event is not null then exists(
      select 1 from public.lesson_university_event_members m where m.entry_id=event and m.user_id=u)
    else true end
$$;

create function private.accounting_entry_json(e private.accounting_entries) returns jsonb
language sql stable set search_path='' as $$
  select to_jsonb(e)-'receipt_hash'
$$;
create function private.accounting_report(k text,o uuid,first_day date,last_day date) returns jsonb
language plpgsql stable set search_path='' as $$
declare result jsonb;
begin
  if first_day is null or last_day is null or not isfinite(first_day) or not isfinite(last_day)
    or last_day<first_day or last_day-first_day>3660 then
    raise exception '정산 기간을 확인해 주세요.' using errcode='22023';
  end if;
  with movements as (
    select e.entry_date,c.direction,c.label,e.amount from private.accounting_entries e
    join private.accounting_categories c on c.id=e.category_id
    where e.kind=k and e.owner_id=o and not e.cancelled and e.agency_event is null and e.entry_date<=last_day
  ), grouped as (
    select direction,label,sum(amount)::text amount from movements where entry_date>=first_day
    group by direction,label
  ), totals as (
    select case when last_day>=b.opening_date then b.opening_amount else 0 end
      +coalesce(sum(case when m.direction='income' then m.amount else -m.amount end)
      filter(where m.entry_date<first_day),0) opening,
      coalesce(sum(m.amount) filter(where m.entry_date>=first_day and m.direction='income'),0) income,
      coalesce(sum(m.amount) filter(where m.entry_date>=first_day and m.direction='expense'),0) expense
    from private.accounting_books b left join movements m on true
    where b.kind=k and b.owner_id=o group by b.opening_amount,b.opening_date
  )
  select jsonb_build_object('from',first_day,'to',last_day,'opening',opening::text,'income',income::text,'expense',expense::text,
    'closing',(opening+income-expense)::text,'items',coalesce((select jsonb_agg(to_jsonb(g) order by direction,label) from grouped g),'[]'))
  into result from totals;
  return result;
end $$;

create function public.list_accounting_scopes() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(a) order by kind,name,id),'[]') from (
    select s.*,private.accounting_access(s.kind,s.id,auth.uid()) access from private.accounting_owners s
  ) a where access>0
$$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('accounting-receipts','accounting-receipts',false,4000000,array['image/jpeg','image/png','image/webp','application/pdf']);
create policy accounting_receipts_server_only on storage.objects as restrictive for all to anon,authenticated
using(bucket_id<>'accounting-receipts') with check(bucket_id<>'accounting-receipts');

create function private.accounting_target_status(p_request uuid,p_user uuid) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object('paid',x.paid,'refunded',x.refunded,'status',case
    when x.refunded>0 and x.paid-x.refunded=0 then 'refunded'
    when t.resolution is not null then t.resolution
    when x.paid-x.refunded>=r.amount then 'paid'
    when t.acknowledged_at is not null then 'pending'
    when x.paid>x.refunded then 'partial' else 'unpaid' end)
  from private.accounting_targets t join private.accounting_requests r on r.id=t.request_id
  cross join lateral (
    select coalesce(sum(a.amount) filter(where e.refund_of is null),0) paid,
           coalesce(sum(a.amount) filter(where e.refund_of is not null),0) refunded
    from private.accounting_allocations a join private.accounting_entries e on e.id=a.transaction_id and not e.cancelled
    where a.request_id=t.request_id and a.user_id=t.user_id
  ) x where t.request_id=p_request and t.user_id=p_user
$$;

create function public.get_accounting_workspace(k text,o uuid,first_day date,last_day date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare scope private.accounting_owners; a uuid:=auth.uid(); permission integer:=private.accounting_access(k,o,a);
begin
  select * into scope from private.accounting_owners where kind=k and id=o;
  if permission=0 or scope.id is null then raise exception '회계 권한이 필요합니다.' using errcode='42501'; end if;
  return jsonb_build_object(
    'scope',to_jsonb(scope)||jsonb_build_object('access',permission),
    'book',(select to_jsonb(b) from private.accounting_books b where kind=k and owner_id=o),
    'report',private.accounting_report(k,o,first_day,last_day),
    'categories',coalesce((select jsonb_agg(to_jsonb(c) order by direction,label) from private.accounting_categories c where kind=k and owner_id=o),'[]'),
    'people',coalesce((select jsonb_agg(to_jsonb(p) order by name,user_id) from private.accounting_people(k,o) p),'[]'),
    'events',coalesce((select jsonb_agg(to_jsonb(e)||jsonb_build_object('confirmed',array(
      select person.user_id from private.accounting_people(k,o) person
      where private.accounting_eligible(k,o,e.id,case when e.external then 'agency' else 'standard' end,person.user_id)
    )) order by name,id) from private.accounting_events(k,o) e),'[]'),
    'delegates',coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'can_share',d.can_share))
      from private.accounting_delegates d join public.club_memberships m on m.id=d.membership_id
      where k='club' and permission=3 and m.club_id=o),'[]'),
    'entries',coalesce((select jsonb_agg(private.accounting_entry_json(e) order by entry_date desc,id) from private.accounting_entries e
      where kind=k and owner_id=o and entry_date between first_day and last_day),'[]'),
    'agency',coalesce((select jsonb_agg(to_jsonb(t)) from (
      select e.agency_event event_id,sum(e.amount) filter(where c.direction='income') income,
        sum(e.amount) filter(where c.direction='expense') expense,
        sum(case when c.direction='income' then e.amount else -e.amount end) balance
      from private.accounting_entries e join private.accounting_categories c on c.id=e.category_id
      where e.kind=k and e.owner_id=o and e.agency_event is not null and not e.cancelled group by e.agency_event
    ) t),'[]'),
    'transfers',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'name',s.name,'date',e.entry_date,'amount',e.amount) order by e.entry_date,e.id)
      from private.accounting_entries e join private.accounting_categories c on c.id=e.category_id
      join public.clubs s on s.id=e.owner_id
      where k='tournament' and e.kind='club' and e.agency_event=o and not e.cancelled and c.label='대리 수납 송금'
        and not exists(select 1 from private.accounting_entries x where x.transfer_id=e.id and not x.cancelled)),'[]'),
    'requests',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('targets',(
      select jsonb_agg(to_jsonb(t)||private.accounting_target_status(r.id,t.user_id) order by t.name,t.user_id)
      from private.accounting_targets t where t.request_id=r.id
    )) order by r.starts desc,r.id) from private.accounting_requests r where kind=k and owner_id=o and discarded_at is null),'[]'),
    'publications',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'previous_id',p.previous_id,'created_at',p.created_at,
       'from',p.snapshot->>'from','to',p.snapshot->>'to') order by p.created_at desc)
      from private.accounting_publications p where kind=k and owner_id=o),'[]'));
end $$;

create function public.get_accounting_entry(k text,o uuid,p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare e private.accounting_entries;
begin
  if private.accounting_access(k,o,auth.uid())=0 then raise exception '회계 권한이 필요합니다.' using errcode='42501'; end if;
  select * into e from private.accounting_entries where id=p_id and kind=k and owner_id=o;
  if not found then raise exception '거래를 찾을 수 없습니다.' using errcode='P0002'; end if;
  return private.accounting_entry_json(e)||jsonb_build_object('audit',coalesce((
    select jsonb_agg(to_jsonb(h) order by h.version desc) from private.accounting_audit h where h.entry_id=e.id),'[]'));
end $$;

create function public.get_accounting_publication(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p private.accounting_publications; a uuid:=auth.uid();
begin
  select * into p from private.accounting_publications where id=p_id;
  if p.id is null or (private.accounting_access(p.kind,p.owner_id,a)=0 and not (
    coalesce(a=any(p.audience),false) and exists(select 1 from private.accounting_people(p.kind,p.owner_id) m where m.user_id=a)
  )) then raise exception '정산표를 확인할 수 없습니다.' using errcode='42501'; end if;
  return jsonb_build_object('id',p.id,'previous_id',p.previous_id,'owner_name',p.owner_name,
    'created_at',p.created_at,'snapshot',p.snapshot);
end $$;

create function public.get_accounting_payment(p_id uuid,p_ack boolean default false,p_pledge bigint default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=auth.uid(); r private.accounting_requests; t private.accounting_targets;
begin
  select * into r from private.accounting_requests where id=p_id and sent_at is not null for share;
  select * into t from private.accounting_targets where request_id=p_id and user_id=a;
  if r.id is null or t.user_id is null or not private.accounting_eligible(r.kind,r.owner_id,r.event_id,r.route,a) then
    raise exception '납부 요청을 확인할 수 없습니다.' using errcode='42501';
  end if;
  if p_ack or p_pledge is not null then
    if r.route in ('direct','official') or t.resolution is not null or
      (now() at time zone 'Asia/Seoul')::date<r.starts or
      (p_pledge is not null and not exists(select 1 from private.accounting_categories c where c.id=r.category_id and c.group_name='donation')) then
      raise exception '현재 납부 응답을 저장할 수 없습니다.' using errcode='22023';
    end if;
    update private.accounting_targets set acknowledged_at=case when p_ack then clock_timestamp() else acknowledged_at end,
      pledged=coalesce(p_pledge,pledged) where request_id=p_id and user_id=a returning * into t;
  end if;
  return jsonb_build_object('title',r.title,'amount',r.amount,'starts',r.starts,'due',r.due,'route',r.route,'guidance',r.guidance,'link',r.link,
    'period_start',r.period_start,'period_end',r.period_end,'pledged',t.pledged,
    'donation',(select group_name='donation' from private.accounting_categories where id=r.category_id))
    ||private.accounting_target_status(p_id,a);
end $$;

-- Operations share the existing mailbox and recipient schema. Bodies carry scoped links only.
create function private.accounting_message(a uuid,recipient uuid,body text) returns void
language plpgsql set search_path='' as $$
declare digest text; message_id uuid; sent_time timestamptz;
begin
  if a=recipient or not private.messaging_account_available(recipient) then return; end if;
  digest:=encode(sha256(convert_to(body,'UTF8')),'hex');
  insert into public.messaging_messages(kind,sender_user_id,body,body_hash,recipient_key,request_id,request_fingerprint,first_contact)
  values('direct',a,body,digest,encode(sha256(convert_to(recipient::text,'UTF8')),'hex'),gen_random_uuid(),digest,false)
  returning id,created_at into message_id,sent_time;
  insert into public.messaging_recipients(message_id,recipient_user_id,received_at) values(message_id,recipient,sent_time);
end $$;

create function private.accounting_change_notice(k text,o uuid,a uuid,body text) returns void
language sql set search_path='' as $$
  select private.accounting_message(a,x.user_id,body) from (
    select private.tournament_president(o) user_id where k='club'
    union select m.user_id from private.accounting_delegates d join public.club_memberships m on m.id=d.membership_id where k='club' and m.club_id=o
    union select m.user_id from public.lesson_university_managers m where k='university' and m.department_id=o
    union select s.user_id from private.course_stewards s where k='course' and s.course_id=o and s.active
    union select m.user_id from private.tournament_hosts h join public.club_memberships m on m.club_id=h.host_club_id where k='tournament' and h.event_id=o
    union select s.user_id from private.tournament_hosts h join private.course_stewards s on s.course_id=h.host_course_id where k='tournament' and h.event_id=o
    union select e.created_by from public.events e where k='tournament' and e.id=o
  ) x where x.user_id<>a and private.accounting_access(k,o,x.user_id)>0
$$;

create function private.accounting_start(k text,o uuid,f date,m bigint) returns void
language plpgsql set search_path='' as $$
begin
  insert into private.accounting_books(kind,owner_id,opening_date,opening_amount,columns)
  values(k,o,f,m,case when k='course' then array['counterparty','event','receipt','facility','work_date']
    else array['counterparty','event','receipt','member'] end);
  insert into private.accounting_categories(kind,owner_id,direction,label,group_name)
  select k,o,'income',v[1],coalesce(v[2],'general') from (
    select string_to_array(x,':') v from unnest(case k
      when 'club' then array['입회비:dues','월회비:dues','연회비:dues','찬조금:donation','월례회 참가비:fee','대회 참가비:fee','대리 수납 반환금:agency_return']
      when 'tournament' then array['개인 참가비:fee','단체 참가비:fee','후원금:donation']
      when 'university' then array['MT:fee','오리엔테이션:fee','수업자료:fee','실습:fee','견학비:fee']
      else array['이용료','단체 대관료'] end) x
  ) income;
  insert into private.accounting_categories(kind,owner_id,direction,label,group_name)
  select k,o,'expense',v[1],coalesce(v[2],'general') from (
    select string_to_array(x,':') v from unnest((case k
      when 'club' then array['구장비','식비','시상품','용품비','대회 지원금:support','대리 수납 송금:fee']
      when 'tournament' then array['대관비','심판비','시상품','진행비']
      when 'university' then array['차량','숙박','식비','교재비']
      else array['시설보수','코스 관리','장비','소모품','용역비'] end)||array['환불:refund']) x
  ) expense;
end $$;

create function private.accounting_save_entry(k text,o uuid,a uuid,actor_name text,p jsonb,operation text,new_id uuid)
returns jsonb language plpgsql set search_path='' as $$
declare old private.accounting_entries; e private.accounting_entries; origin private.accounting_entries;
  c private.accounting_categories; r private.accounting_requests; transfer private.accounting_entries; item jsonb;
  allocations jsonb:=coalesce(p->'allocations','[]'); item_amount bigint; target uuid;
  remaining bigint; agency uuid; reason text:=nullif(btrim(p->>'reason'),''); requested_status text;
begin
  if operation<>'entry' then
    select * into old from private.accounting_entries where id=(p->>'id')::uuid and kind=k and owner_id=o for update;
    if not found then raise exception '거래를 찾을 수 없습니다.' using errcode='P0002'; end if;
    if old.version is distinct from (p->>'version')::integer then
      return jsonb_build_object('conflict',private.accounting_entry_json(old));
    end if;
    if old.cancelled or reason is null then raise exception '변경할 거래와 사유를 확인해 주세요.' using errcode='22023'; end if;
    e:=old;
  else
    e.id:=new_id;
    e.kind:=k;
    e.owner_id:=o;
    e.created_by:=a;
    e.created_name:=actor_name;
    e.created_at:=clock_timestamp();
    e.version:=0;
    e.cancelled:=false;
    e.receipt_status:='later';
  end if;
  if operation in ('entry','edit') then
    select * into c from private.accounting_categories where id=(p->>'category')::uuid and kind=k and owner_id=o;
    if c.id is null then raise exception '장부 항목을 확인해 주세요.' using errcode='22023'; end if;
    e.category_id:=c.id;
    e.entry_date:=(p->>'date')::date;
    e.amount:=(p->>'amount')::bigint;
    e.description:=btrim(p->>'description');
    e.counterparty:=nullif(btrim(p->>'counterparty'),'');
    e.member_id:=nullif(p->>'member','')::uuid;
    e.event_id:=nullif(p->>'event','')::uuid;
    e.agency_event:=case when coalesce((p->>'agency')::boolean,false) then e.event_id end;
    e.daily_total:=coalesce((p->>'daily_total')::boolean,false);
    e.facility:=nullif(btrim(p->>'facility'),'');
    e.work_date:=nullif(p->>'work_date','')::date;
    requested_status:=p->>'receipt_status';
    if requested_status not in ('later','missing','na') and requested_status is distinct from e.receipt_status then
      raise exception '증빙 상태를 확인해 주세요.' using errcode='22023';
    end if;
    if e.receipt_id is null then e.receipt_status:=coalesce(requested_status,e.receipt_status); end if;
    e.receipt_reason:=nullif(btrim(p->>'receipt_reason'),'');
    e.refund_of:=nullif(p->>'refund_of','')::uuid;
    e.return_of:=case when operation='edit' then old.return_of else nullif(p->>'return_of','')::uuid end;
    if (c.group_name='agency_return')<>(e.return_of is not null) then
      raise exception '대리 수납 송금을 연결해 주세요.' using errcode='22023';
    end if;
    if e.return_of is not null then
      select x.* into origin from private.accounting_entries x join private.accounting_categories y on y.id=x.category_id
        where x.id=e.return_of and x.kind='club' and x.owner_id=o and y.label='대리 수납 송금' and not x.cancelled;
      if k<>'club' or origin.id is null or e.agency_event is null or e.agency_event is distinct from origin.agency_event
        or e.entry_date<origin.entry_date or e.amount>origin.amount-coalesce((
          select sum(x.amount) from private.accounting_entries x where x.return_of=origin.id and x.id<>e.id and not x.cancelled),0)
        or jsonb_array_length(allocations)>0 then
        raise exception '원래 송금과 반환된 금액을 확인해 주세요.' using errcode='22023';
      end if;
    end if;
    e.transfer_id:=case when operation='edit' then old.transfer_id else nullif(p->>'transfer','')::uuid end;
    if e.transfer_id is not null then
      select x.* into transfer from private.accounting_entries x join private.accounting_categories y on y.id=x.category_id
      where x.id=e.transfer_id and x.kind='club' and x.agency_event=o and y.label='대리 수납 송금' and not x.cancelled for share of x;
      if k<>'tournament' or transfer.id is null or c.direction<>'income' or c.label<>'단체 참가비'
        or e.event_id is distinct from o or e.entry_date<transfer.entry_date or e.amount<>transfer.amount
        or (operation='entry' and jsonb_array_length(allocations)=0) then
        raise exception '송금 내역과 같은 금액을 대회 참가자에게 배정해 주세요.' using errcode='22023';
      end if;
    end if;
    if e.entry_date<(select opening_date from private.accounting_books where kind=k and owner_id=o)
      or (e.event_id is not null and e.event_id is distinct from old.event_id and not exists(select 1 from private.accounting_events(k,o) x where x.id=e.event_id))
      or (e.member_id is not null and e.member_id is distinct from old.member_id and not exists(select 1 from private.accounting_people(k,o) x where x.user_id=e.member_id))
      or (e.daily_total and (k<>'course' or c.direction<>'income' or c.label<>'이용료'))
      or ((e.facility is not null or e.work_date is not null) and (k<>'course' or c.direction<>'expense'))
      or (e.agency_event is not null and (k<>'club' or not exists(select 1 from private.accounting_events(k,o) x where x.id=e.event_id and x.external)
        or c.group_name not in ('fee','refund','agency_return')))
      or (c.label='대리 수납 송금' and e.agency_event is null)
      or (k='club' and e.agency_event is null and c.group_name='fee'
        and exists(select 1 from private.accounting_events(k,o) x where x.id=e.event_id and x.external))
      or (e.agency_event is not null and c.direction='income' and c.group_name<>'agency_return' and jsonb_array_length(allocations)=0 and operation='entry')
      or ((c.group_name='refund')<>(e.refund_of is not null)) then
      raise exception '거래일, 행사, 대상 또는 거래 종류를 확인해 주세요.' using errcode='22023';
    end if;
    if operation='edit' and exists(select 1 from private.accounting_entries where (transfer_id=old.id or return_of=old.id) and not cancelled)
      and (e.amount,e.agency_event,e.category_id,e.entry_date) is distinct from (old.amount,old.agency_event,old.category_id,old.entry_date) then
      raise exception '주최자가 확인한 송금은 주최자와 정정한 뒤 변경해 주세요.' using errcode='22023';
    end if;
    if e.refund_of is not null then
      select x.* into origin from private.accounting_entries x join private.accounting_categories y on y.id=x.category_id
      where x.id=e.refund_of and x.kind=k and x.owner_id=o and y.direction='income' and y.group_name<>'agency_return' and not x.cancelled;
      if origin.id is null or e.agency_event is distinct from origin.agency_event or e.event_id is distinct from origin.event_id or e.entry_date<origin.entry_date
        or e.amount>origin.amount-coalesce((select sum(x.amount) from private.accounting_entries x where x.refund_of=origin.id and not x.cancelled and x.id<>e.id),0)
        or (operation='entry' and jsonb_array_length(allocations)=0 and exists(select 1 from private.accounting_allocations where transaction_id=origin.id)) then
        raise exception '원래 입금과 환불 금액을 확인해 주세요.' using errcode='22023';
      end if;
    end if;
    if operation='edit' and (
      (exists(select 1 from private.accounting_allocations where transaction_id=old.id)
        or exists(select 1 from private.accounting_entries where refund_of=old.id and not cancelled)
        or old.refund_of is not null or old.return_of is not null)
      and (old.category_id,old.amount,old.event_id,old.agency_event,old.refund_of,old.entry_date)
        is distinct from (e.category_id,e.amount,e.event_id,e.agency_event,e.refund_of,e.entry_date)
    ) then
      raise exception '납부·환불에 연결된 금액은 취소 또는 환불로 정정해 주세요.' using errcode='22023';
    end if;
  elsif operation='cancel' then
    if exists(select 1 from private.accounting_entries where (transfer_id=old.id or return_of=old.id) and not cancelled) then
      raise exception '주최자가 확인한 송금은 주최자와 정정한 뒤 취소해 주세요.' using errcode='22023';
    end if;
    if exists(select 1 from private.accounting_entries where refund_of=old.id and not cancelled) then
      raise exception '연결된 환불을 먼저 정정해 주세요.' using errcode='22023';
    end if;
    e.cancelled:=true;
  elsif operation='receipt' then
    e.receipt_status:='attached';
    e.receipt_id:=(p->>'receipt_id')::uuid;
    e.receipt_mime:=p->>'mime';
    e.receipt_hash:=p->>'hash';
    e.receipt_reason:=null;
  end if;
  e.updated_at:=clock_timestamp();
  e.updated_by:=a;
  e.updated_name:=actor_name;
  e.version:=e.version+1;
  if operation='entry' then
    insert into private.accounting_entries select (e).*;
    if jsonb_array_length(allocations)>0 then
      if (c.direction<>'income' and e.refund_of is null) or (
        select sum((x->>'amount')::bigint) from jsonb_array_elements(allocations) x
      ) is distinct from e.amount then
        raise exception '배정 합계와 거래 금액을 확인해 주세요.' using errcode='22023';
      end if;
      for item in select value from jsonb_array_elements(allocations) loop
        select * into r from private.accounting_requests where id=(item->>'request')::uuid and kind=k and owner_id=o and sent_at is not null;
        target:=(item->>'user')::uuid;
        item_amount:=(item->>'amount')::bigint;
        if r.id is null or r.route in ('direct','official') or r.event_id is distinct from e.event_id
          or (r.route='agency')<>(e.agency_event is not null)
          or not exists(select 1 from private.accounting_targets t where t.request_id=r.id and t.user_id=target and (e.refund_of is not null or t.resolution is null))
          or (e.refund_of is null and (r.category_id<>e.category_id or not private.accounting_eligible(k,o,r.event_id,r.route,target)))
          or (e.transfer_id is not null and not exists(select 1 from private.tournament_roster z where z.event_id=o and z.user_id=target
            and z.active and z.status='confirmed' and (z.club_id=transfer.owner_id or exists(select 1 from private.tournament_club_responses x
              where x.event_id=o and x.club_id=transfer.owner_id and x.user_id=target and x.submitted_division is not null)))) then
          raise exception '이 거래에 배정할 수 없는 납부입니다.' using errcode='22023';
        end if;
        if operation='edit' and exists(select 1 from private.accounting_entries where (transfer_id=old.id or return_of=old.id) and not cancelled)
      and (e.amount,e.agency_event,e.category_id,e.entry_date) is distinct from (old.amount,old.agency_event,old.category_id,old.entry_date) then
      raise exception '주최자가 확인한 송금은 주최자와 정정한 뒤 변경해 주세요.' using errcode='22023';
    end if;
    if e.refund_of is not null then
          select coalesce(sum(x.amount) filter(where z.id=e.refund_of),0)-coalesce(sum(x.amount) filter(where z.refund_of=e.refund_of),0)
          into remaining from private.accounting_allocations x join private.accounting_entries z on z.id=x.transaction_id
          where x.request_id=r.id and x.user_id=target and not z.cancelled;
        else
          select case when c.group_name='donation' then 1000000000000 else r.amount end-
            ((s->>'paid')::bigint-(s->>'refunded')::bigint) into remaining
          from private.accounting_target_status(r.id,target) s;
        end if;
        if item_amount is null or item_amount<1 or item_amount>remaining then
          raise exception '납부의 남은 확인·환불 가능 금액을 확인해 주세요.' using errcode='22023';
        end if;
        insert into private.accounting_allocations values(e.id,r.id,target,item_amount);
        update private.accounting_targets set acknowledged_at=null where request_id=r.id and user_id=target;
      end loop;
    end if;
  else
    update private.accounting_entries x set
      (entry_date,category_id,amount,description,counterparty,member_id,event_id,agency_event,daily_total,facility,work_date,
       receipt_status,receipt_reason,receipt_id,receipt_mime,receipt_hash,refund_of,cancelled,version,updated_by,updated_name,updated_at)
      =(e.entry_date,e.category_id,e.amount,e.description,e.counterparty,e.member_id,e.event_id,e.agency_event,e.daily_total,e.facility,e.work_date,
        e.receipt_status,e.receipt_reason,e.receipt_id,e.receipt_mime,e.receipt_hash,e.refund_of,e.cancelled,e.version,e.updated_by,e.updated_name,e.updated_at)
    where x.id=e.id;
    insert into private.accounting_audit values(e.id,e.version,private.accounting_entry_json(old),private.accounting_entry_json(e),reason);
  end if;
  for agency in select distinct v from unnest(array[old.agency_event,e.agency_event]) v where v is not null loop
    if (select coalesce(sum(case when y.direction='income' then x.amount else -x.amount end),0)
      from private.accounting_entries x join private.accounting_categories y on y.id=x.category_id
      where x.kind=k and x.owner_id=o and x.agency_event=agency and not x.cancelled)<0 then
      raise exception '대리 수납 잔액을 초과할 수 없습니다.' using errcode='22023';
    end if;
  end loop;
  return jsonb_build_object('id',e.id,'version',e.version);
end $$;

create function private.accounting_mutate(k text,o uuid,op text,request_id uuid,p jsonb,a uuid) returns jsonb
language plpgsql set search_path='' as $$
declare scope private.accounting_owners; permission integer; result jsonb;
  saved private.accounting_operations; c private.accounting_categories; r private.accounting_requests;
  member public.club_memberships; actor_name text; audience uuid[]; recipient uuid; path text;
  title text; body text; mode text; event uuid; related uuid; snapshot jsonb;
  selected_columns text[]; entry jsonb; scan jsonb; result_entry jsonb; ids uuid[]; route text; link text;
begin
  if a is null or request_id is null or jsonb_typeof(p) is distinct from 'object' then
    raise exception '요청을 확인해 주세요.' using errcode='22023';
  end if;
  if k='club' then
    perform id from public.clubs where id=o for share;
  elsif k='course' then
    perform private.course_next_lock();
  elsif k='university' then
    perform m.user_id from public.lesson_university_managers m where m.department_id=o and m.user_id=a for share;
  elsif k='tournament' then
    perform club.id from private.tournament_hosts h join public.clubs club on club.id=h.host_club_id where h.event_id=o for share of club;
    if exists(select 1 from private.tournament_hosts h where h.event_id=o and h.host_course_id is not null) then
      perform private.course_next_lock();
    end if;
    perform e.id from public.events e where e.id=o for share;
  end if;
  if k is null or o is null then raise exception '장부를 확인해 주세요.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('accounting:'||k||':'||o,0));
  perform pg_advisory_xact_lock(hashtextextended('accounting request:'||a||':'||request_id,0));
  select * into scope from private.accounting_owners where kind=k and id=o;
  perform id from public.user_accounts where id=a for share;
  permission:=private.accounting_access(k,o,a);
  if scope.id is null or permission=0 or (op='delegate' and permission<>3) or (op='publish' and permission<2) then
    raise exception '회계 권한이 필요합니다.' using errcode='42501';
  end if;
  select * into saved from private.accounting_operations x where x.actor=a and x.request_id=accounting_mutate.request_id;
  if found then
    if saved.fingerprint is distinct from jsonb_build_array(k,o,op,p) then
      raise exception '같은 요청의 입력값이 변경되었습니다.' using errcode='22023';
    end if;
    return saved.result;
  end if;
  actor_name:=coalesce(case when k='club' then private.club_registered_name(o,a) end,private.messaging_display_name(a),'담당자');
  path:='/accounting/'||k||'/'||o;
  result:=jsonb_build_object('id',request_id);
  if op='delegate' then
    select m.* into member from public.club_memberships m where m.club_id=o and m.user_id=(p->>'user')::uuid and m.membership_status='active' for share;
    if member.id is null or not private.messaging_account_available(member.user_id) or member.user_id=a then
      raise exception '현재 동호회 회원을 선택해 주세요.' using errcode='22023';
    end if;
    if (p->>'enabled')::boolean then
      insert into private.accounting_delegates values(member.id,coalesce((p->>'share')::boolean,false))
        on conflict(membership_id) do update set can_share=excluded.can_share;
    else
      delete from private.accounting_delegates where membership_id=member.id;
    end if;
  elsif op='start' then
    perform private.accounting_start(k,o,(p->>'date')::date,(p->>'amount')::bigint);
  else
    if not exists(select 1 from private.accounting_books where kind=k and owner_id=o) then
      raise exception '장부를 먼저 시작해 주세요.' using errcode='22023';
    end if;
    case op
    when 'category' then
      if coalesce(p->>'group','general') not in ('general','dues','donation','fee')
        or (p->>'direction'='expense' and coalesce(p->>'group','general')<>'general') then
        raise exception '항목 분류를 확인해 주세요.' using errcode='22023';
      end if;
      insert into private.accounting_categories(kind,owner_id,direction,label,group_name)
      values(k,o,p->>'direction',btrim(p->>'label'),coalesce(p->>'group','general'));
    when 'columns' then
      select array(select distinct value from jsonb_array_elements_text(p->'columns')) into selected_columns;
      if not selected_columns <@ array['counterparty','event','receipt','member','facility','work_date'] then
        raise exception '표시할 항목을 확인해 주세요.' using errcode='22023';
      end if;
      update private.accounting_books set columns=selected_columns where kind=k and owner_id=o;
    when 'entry','edit','cancel','receipt' then
      result:=private.accounting_save_entry(k,o,a,actor_name,p,op,request_id);
      if result ? 'conflict' then return result; end if;
      if op<>'entry' then
        perform private.accounting_change_notice(k,o,a,left(scope.name,150)||' 회계장부 · '||left(actor_name,100)||
          case op when 'cancel' then '님이 거래 입력을 취소했습니다.' when 'receipt' then '님이 거래 증빙을 첨부했습니다.' else '님이 거래를 수정했습니다.' end
          ||E'\n\n'||path||'/entry/'||(result->>'id'));
      end if;
    when 'cancel_batch' then
      if jsonb_typeof(p->'entries') is distinct from 'array' or jsonb_array_length(p->'entries') not between 1 and 50 then
        raise exception '취소할 거래를 선택해 주세요.' using errcode='22023';
      end if;
      for entry in select value from jsonb_array_elements(p->'entries') loop
        select private.accounting_entry_json(e) into scan from private.accounting_entries e where kind=k and owner_id=o and id=(entry->>'id')::uuid;
        if scan is null then raise exception '거래를 찾을 수 없습니다.' using errcode='P0002'; end if;
        if scan->>'version' is distinct from entry->>'version' then return jsonb_build_object('conflict',scan); end if;
      end loop;
      for entry in select value from jsonb_array_elements(p->'entries') loop
        result_entry:=private.accounting_save_entry(k,o,a,actor_name,entry||jsonb_build_object('reason',p->>'reason'),'cancel',request_id);
        if result_entry ? 'conflict' then raise exception '중복 거래를 확인해 주세요.' using errcode='22023'; end if;
      end loop;
      perform private.accounting_change_notice(k,o,a,left(scope.name,150)||' 회계장부 · '||left(actor_name,100)
        ||'님이 거래 '||jsonb_array_length(p->'entries')||'건을 취소했습니다.'||E'\n\n'||path);
    when 'request' then
      select * into c from private.accounting_categories x where x.id=(p->>'category')::uuid and x.kind=k and x.owner_id=o and direction='income' and group_name<>'agency_return';
      event:=nullif(p->>'event','')::uuid;
      route:=coalesce(p->>'route','standard');
      link:=nullif(btrim(p->>'link'),'');
      if route='official' and k='university' then
        select coalesce(d.guide_url,d.official_url) into link from public.lesson_university_departments d where d.id=o;
      end if;
      if c.id is null or (event is not null and not exists(select 1 from private.accounting_events(k,o) x where x.id=event))
        or (c.group_name='fee' and event is null and (k in ('club','tournament') or
          (k='university' and c.label in ('MT','오리엔테이션','견학비') and route<>'official')))
        or (route in ('direct','agency') and (k<>'club' or not exists(select 1 from private.accounting_events(k,o) x where x.id=event and x.external)))
        or (k='club' and event is not null and route='standard' and exists(select 1 from private.accounting_events(k,o) x where x.id=event and x.external))
        or (route='official' and k<>'university') or (route in ('direct','official') and link is null)
        or (c.label in ('월회비','연회비') and nullif(p->>'period_start','') is null) then
        raise exception '납부 항목, 행사, 기간과 안내를 확인해 주세요.' using errcode='22023';
      end if;
      insert into private.accounting_requests(id,kind,owner_id,category_id,title,amount,starts,due,period_start,period_end,event_id,route,guidance,link)
      values(request_id,k,o,c.id,btrim(p->>'title'),(p->>'amount')::bigint,(p->>'starts')::date,(p->>'due')::date,
        nullif(p->>'period_start','')::date,nullif(p->>'period_end','')::date,event,route,btrim(p->>'guidance'),link);
      select array_agg(distinct value::uuid) into ids from jsonb_array_elements_text(p->'users');
      if coalesce(cardinality(ids),0) not between 1 and 1000 or (c.label='입회비' and cardinality(ids)<>1) then
        raise exception '납부 대상을 확인해 주세요.' using errcode='22023';
      end if;
      foreach recipient in array ids loop
        if not private.accounting_eligible(k,o,event,route,recipient)
          or (c.label='입회비' and exists(select 1 from private.accounting_targets t join private.accounting_requests x on x.id=t.request_id
            where t.user_id=recipient and x.category_id=c.id and x.id<>accounting_mutate.request_id and x.discarded_at is null and t.resolution is distinct from 'cancelled'))
          or (c.label in ('월회비','연회비') and exists(select 1 from private.accounting_targets t join private.accounting_requests x on x.id=t.request_id
            where t.user_id=recipient and x.category_id=c.id and x.id<>accounting_mutate.request_id and x.discarded_at is null and t.resolution is distinct from 'cancelled'
            and daterange(x.period_start,x.period_end,'[]') && daterange((p->>'period_start')::date,(p->>'period_end')::date,'[]'))) then
          raise exception '확정된 참가자, 활성 회원 또는 기존 납부 요청을 확인해 주세요.' using errcode='22023';
        end if;
        insert into private.accounting_targets(request_id,user_id,name)
          select accounting_mutate.request_id,recipient,x.name from private.accounting_people(k,o) x where x.user_id=recipient;
      end loop;
    when 'discard' then
      update private.accounting_requests set discarded_at=clock_timestamp()
      where id=(p->>'id')::uuid and kind=k and owner_id=o and sent_at is null and discarded_at is null;
      if not found then raise exception '발송 전 요청을 확인해 주세요.' using errcode='22023'; end if;
    when 'send','remind','resolve' then
      select * into r from private.accounting_requests where id=(p->>'id')::uuid and kind=k and owner_id=o and discarded_at is null for update;
      if r.id is null or (op='send')<>(r.sent_at is null) then
        raise exception '납부 요청 상태를 확인해 주세요.' using errcode='22023';
      end if;
      if op='resolve' then
        update private.accounting_targets t set resolution=nullif(p->>'resolution',''),acknowledged_at=null
        where t.request_id=r.id and t.user_id=(p->>'user')::uuid
          and ((private.accounting_target_status(r.id,t.user_id)->>'paid')::bigint=(private.accounting_target_status(r.id,t.user_id)->>'refunded')::bigint);
        if not found then raise exception '확인된 입금이 남아 있습니다. 환불 또는 입력 취소를 먼저 처리해 주세요.' using errcode='22023'; end if;
      else
        if op='remind' and not exists(select 1 from private.accounting_targets t where t.request_id=r.id
          and t.user_id=(p->>'user')::uuid and private.accounting_target_status(r.id,t.user_id)->>'status' in ('unpaid','partial','pending')
          and private.accounting_eligible(k,o,r.event_id,r.route,t.user_id)) then
          raise exception '재안내할 미납 대상을 확인해 주세요.' using errcode='22023';
        end if;
        if op='send' then
          if exists(select 1 from private.accounting_targets t where t.request_id=r.id and not private.accounting_eligible(k,o,r.event_id,r.route,t.user_id)) then
            raise exception '대상자 자격이 변경되었습니다. 새 요청을 작성해 주세요.' using errcode='22023';
          end if;
          update private.accounting_requests set sent_at=clock_timestamp() where id=r.id;
        end if;
        body:=left(scope.name,150)||' · '||r.title||case when op='remind' then ' 납부 재안내' else ' 납부 안내' end
          ||E'\n\n/accounting/payment/'||r.id;
        for recipient in select t.user_id from private.accounting_targets t where t.request_id=r.id
          and (op='send' or (t.user_id=(p->>'user')::uuid and private.accounting_target_status(r.id,t.user_id)->>'status' in ('unpaid','partial','pending')))
          and private.accounting_eligible(k,o,r.event_id,r.route,t.user_id)
        loop
          perform private.accounting_message(a,recipient,body);
        end loop;
      end if;
    when 'publish' then
      related:=nullif(p->>'previous','')::uuid;
      mode:=p->>'channel';
      if related is not null and not exists(select 1 from private.accounting_publications x where x.id=related and x.kind=k and x.owner_id=o
        and x.snapshot->>'from'=p->>'from' and x.snapshot->>'to'=p->>'to') then
        raise exception '정정할 기존 정산표와 기간을 확인해 주세요.' using errcode='22023';
      end if;
      snapshot:=private.accounting_report(k,o,(p->>'from')::date,(p->>'to')::date);
      if snapshot is null or p->'snapshot' is distinct from snapshot then
        raise exception '합계가 변경되었습니다. 미리보기를 다시 열어 주세요.' using errcode='22023';
      end if;
      select array_agg(distinct value::uuid) into ids from jsonb_array_elements_text(p->'users');
      if k in ('tournament','course') and coalesce(cardinality(ids),0)=0 then
        raise exception '공유 대상을 선택해 주세요.' using errcode='22023';
      end if;
      select array_agg(x.user_id order by x.user_id) into audience from private.accounting_people(k,o) x
        where ids is null or x.user_id=any(ids);
      if coalesce(cardinality(audience),0)=0 or (ids is not null and cardinality(ids)<>cardinality(audience)) then
        raise exception '현재 공유 대상을 확인해 주세요.' using errcode='22023';
      end if;
      insert into private.accounting_publications(id,kind,owner_id,owner_name,previous_id,snapshot,audience,channel)
      values(request_id,k,o,scope.name,related,snapshot,audience,mode);
      title:=case when related is null then '회원용 정산표' else '회원용 정정 정산표' end;
      body:=left(scope.name,150)||' · '||title||' · '||(snapshot->>'from')||' ~ '||(snapshot->>'to')
        ||E'\n\n/accounting/shared/'||request_id;
      if mode in ('notice','both') then
        if k='club' then
          insert into public.club_notices(id,club_id,author_user_id,author_role_code,notice_type,title,content_summary)
          values(request_id,o,a,case when permission=3 then 'club_admin' else 'club_member' end,'general',title,body);
        elsif k='university' and ids is null then
          insert into public.lesson_university_space_entries(id,department_id,author_id,kind,title,body)
          values(request_id,o,a,'notice',title,body);
        end if;
      end if;
      if mode in ('message','both') then
        foreach recipient in array audience loop perform private.accounting_message(a,recipient,body); end loop;
      end if;
    else
      raise exception '요청을 확인해 주세요.' using errcode='22023';
    end case;
  end if;
  insert into private.accounting_operations values(a,request_id,jsonb_build_array(k,o,op,p),result);
  return result;
end $$;

create function public.mutate_accounting(k text,o uuid,op text,request_id uuid,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if op='receipt' then raise exception '증빙은 파일 업로드에서 저장해 주세요.' using errcode='42501'; end if;
  return private.accounting_mutate(k,o,op,request_id,p,auth.uid());
end $$;
create function public.attach_accounting_receipt(k text,o uuid,request_id uuid,p jsonb,a uuid) returns jsonb
language sql security definer set search_path='' as $$
  select private.accounting_mutate(k,o,'receipt',request_id,p,a)
$$;
create function public.list_accounting_publications() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.owner_name,'previous_id',p.previous_id,
    'from',p.snapshot->>'from','to',p.snapshot->>'to') order by p.created_at desc),'[]')
  from private.accounting_publications p where auth.uid()=any(p.audience)
    and exists(select 1 from private.accounting_people(p.kind,p.owner_id) m where m.user_id=auth.uid())
$$;

do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace s on s.oid=p.pronamespace
    where s.nspname='private' and p.proname like 'accounting_%'
  loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f);
  end loop;
end $$;
revoke all on function public.list_accounting_scopes(),public.get_accounting_workspace(text,uuid,date,date),
  public.get_accounting_entry(text,uuid,uuid),public.get_accounting_publication(uuid),public.get_accounting_payment(uuid,boolean,bigint),
  public.mutate_accounting(text,uuid,text,uuid,jsonb),public.list_accounting_publications(),public.attach_accounting_receipt(text,uuid,uuid,jsonb,uuid)
from public,anon,authenticated,service_role;
grant execute on function public.list_accounting_scopes(),public.get_accounting_workspace(text,uuid,date,date),
  public.get_accounting_entry(text,uuid,uuid),public.get_accounting_publication(uuid),public.get_accounting_payment(uuid,boolean,bigint),
  public.mutate_accounting(text,uuid,text,uuid,jsonb),public.list_accounting_publications() to authenticated;
grant execute on function public.attach_accounting_receipt(text,uuid,uuid,jsonb,uuid) to service_role;
notify pgrst,'reload schema';

create function public.list_accounting_notices(k text,scope_key text) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc),'[]') from (
    select p.id,p.snapshot->>'from' "from",p.snapshot->>'to' "to",p.previous_id is not null correction,p.created_at
    from private.accounting_publications p join private.accounting_owners s on s.kind=p.kind and s.id=p.owner_id
    where s.kind=k and s.key=scope_key and p.channel in ('notice','both')
      and (k<>'university' or not exists(select 1 from public.lesson_university_space_entries e where e.id=p.id))
      and auth.uid()=any(p.audience)
      and exists(select 1 from private.accounting_people(p.kind,p.owner_id) m where m.user_id=auth.uid())
    order by p.created_at desc limit 10
  ) a
$$;
revoke all on function public.list_accounting_notices(text,text) from public,anon,authenticated,service_role;
grant execute on function public.list_accounting_notices(text,text) to authenticated;

