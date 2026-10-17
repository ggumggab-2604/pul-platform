-- LOCAL CANDIDATE. Existing 123 migrations are immutable.
begin;
-- A small community's role changes and shared-inquiry writes share one lock.
-- Acquire it before request receipts, course rows and role/thread rows.
create function private.course_next_lock() returns void language sql volatile set search_path='' as $$
 select pg_catalog.pg_advisory_xact_lock(1297303360,1)
$$;
create function private.course_current_operator(c uuid,a uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.messaging_account_available(a) and exists(select 1 from private.course_stewards where course_id=c and user_id=a and active)
$$;

create function private.course_next_claim(a uuid,r uuid,op text,p jsonb) returns jsonb language sql security definer set search_path='' as $$
select private.course_claim_request(a,r,op,jsonb_build_object('input',p))
$$;

-- No consent or bookmark backfill.
create table private.course_interest_choices(
 user_id uuid not null references public.user_accounts(id),course_id uuid not null references public.courses(id),
 enabled boolean not null,policy_version text not null check(policy_version='course-interest-v1'),
 chosen_at timestamptz not null default clock_timestamp(),request_id uuid not null,primary key(user_id,course_id)
);
create function private.course_interest_read(p_course_key text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a uuid:=private.course_notification_actor(); c public.courses%rowtype;b boolean;s boolean;
begin
 select * into c from public.courses where course_key=p_course_key;
 if not found then raise exception '구장을 찾을 수 없습니다.' using errcode='P0002';end if;
 b:=exists(select 1 from public.course_bookmarks where user_id=a and course_id=c.id);
 s:=exists(select 1 from public.course_notification_subscriptions where user_id=a and course_id=c.id and unsubscribed_at is null);
 if c.course_status<>'active' and not b and not s then
  -- Only a previous explicit choice permits a retry/read after clearing a private source.
  if not exists(select 1 from private.course_interest_choices where user_id=a and course_id=c.id) then raise exception '구장을 찾을 수 없습니다.' using errcode='P0002';end if;
 end if;
 return jsonb_build_object('course_key',p_course_key,'saved',b,'subscribed',s,'available',c.course_status='active');
end $$;
create function private.course_interest_choose(p_course_key text,p_enabled boolean,p_policy text,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=private.course_notification_actor();c public.courses%rowtype;r jsonb;t timestamptz;
begin
 if p_enabled is null or p_policy is distinct from 'course-interest-v1' or p_request_id is null then raise exception '관심·운영알림 안내를 확인해 주세요.' using errcode='22023';end if;
 perform private.course_next_lock();
 r:=private.course_next_claim(a,p_request_id,'course.interest_choice',jsonb_build_array(p_course_key,p_enabled,p_policy));if r is not null then return r;end if;
 select * into c from public.courses where course_key=p_course_key for share;
 if not found then raise exception '구장을 찾을 수 없습니다.' using errcode='P0002';end if;
 if p_enabled and (c.course_status<>'active' or not private.messaging_account_available(a)) then raise exception '현재 관심을 설정할 수 없습니다.' using errcode='42501';end if;
 if not p_enabled and c.course_status<>'active' and not exists(select 1 from public.course_bookmarks where course_id=c.id and user_id=a) and not exists(select 1 from public.course_notification_subscriptions where course_id=c.id and user_id=a) then raise exception '구장을 찾을 수 없습니다.' using errcode='P0002';end if;
 t:=clock_timestamp();
 if p_enabled then
  insert into public.course_bookmarks(user_id,course_id) values(a,c.id) on conflict do nothing;
  insert into public.course_notification_subscriptions(course_id,user_id,first_subscribed_at,subscribed_at) values(c.id,a,t,t)
  on conflict(course_id,user_id) do update set subscribed_at=excluded.subscribed_at,unsubscribed_at=null;
 else
  delete from public.course_bookmarks where course_id=c.id and user_id=a;
  update public.course_notification_subscriptions set unsubscribed_at=t where course_id=c.id and user_id=a and unsubscribed_at is null;
 end if;
 insert into private.course_interest_choices(user_id,course_id,enabled,policy_version,request_id) values(a,c.id,p_enabled,p_policy,p_request_id)
 on conflict(user_id,course_id) do update set enabled=excluded.enabled,policy_version=excluded.policy_version,request_id=excluded.request_id,chosen_at=clock_timestamp();
 r:=private.course_interest_read(p_course_key);perform private.course_complete_request(a,p_request_id,r);return r;
end $$;
-- Old applications must never silently create consent or split unified settings.
create or replace function private.set_course_interest(p_course_key text,p_saved boolean) returns jsonb language plpgsql security definer set search_path='' as $$
begin raise exception '관심·운영알림 설정 화면을 새로 열어 주세요.' using errcode='PT409';end $$;
create or replace function public.set_course_notification_subscription(p_course_key text,p_enabled boolean) returns jsonb language plpgsql security definer set search_path='' as $$
begin raise exception '관심·운영알림 설정 화면을 새로 열어 주세요.' using errcode='PT409';end $$;

-- Preflight fails without choosing/removing existing operators.
do $$begin
 if exists(select 1 from private.course_stewards where active group by course_id having count(*)>2) then raise exception '기존 운영자가 2명을 넘는 구장이 있습니다. 승인된 정리 계획이 필요합니다.';end if;
end $$;
alter table private.course_stewards add column slot_no smallint check(slot_no in (1,2));
with seats as(select course_id,user_id,row_number()over(partition by course_id order by user_id) n from private.course_stewards where active)
update private.course_stewards s set slot_no=seats.n from seats where s.course_id=seats.course_id and s.user_id=seats.user_id;
alter table private.course_stewards add constraint course_active_seat check(not active or slot_no is not null);
create unique index course_active_seat_unique on private.course_stewards(course_id,slot_no) where active;
create table private.course_operator_invitations(
 id uuid primary key default gen_random_uuid(),course_id uuid not null references public.courses(id),
 inviter_id uuid not null references public.user_accounts(id),target_id uuid not null references public.user_accounts(id),
 kind text not null check(kind in ('add','transfer')),slot_no smallint not null check(slot_no in (1,2)),
 status text not null default 'pending' check(status in ('pending','accepted','declined','cancelled','expired')),
 created_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null default (clock_timestamp()+interval '7 days'),
 resolved_at timestamptz,check(inviter_id<>target_id)
);
create unique index course_invitation_slot on private.course_operator_invitations(course_id,slot_no) where status='pending';
create unique index course_invitation_target on private.course_operator_invitations(course_id,target_id) where status='pending';
create index course_invitation_inbox on private.course_operator_invitations(target_id,status,created_at);
create table private.course_operator_audit(id bigint generated always as identity primary key,course_id uuid not null,actor_id uuid,target_id uuid,action text not null,request_id uuid,created_at timestamptz not null default clock_timestamp());
alter table private.course_applications add column operator_policy text,add column operator_policy_at timestamptz;

create function private.course_expire_invitations() returns void language plpgsql security definer set search_path='' as $$
begin
 update private.course_operator_invitations i set status=case when expires_at<=clock_timestamp() then 'expired' else 'cancelled' end,resolved_at=clock_timestamp()
 where status='pending' and (expires_at<=clock_timestamp() or not private.messaging_account_available(target_id) or not private.messaging_account_available(inviter_id)
 or not private.course_can_manage(course_id,inviter_id)
 or (kind='transfer' and not exists(select 1 from private.course_stewards s where s.course_id=i.course_id and s.user_id=i.inviter_id and s.active and s.slot_no=i.slot_no)));
end $$;
create function private.course_guard_seat() returns trigger language plpgsql security definer set search_path='' as $$
declare seat smallint;
begin
 perform private.course_next_lock();perform private.course_expire_invitations();
 if new.active then
  if not private.messaging_account_available(new.user_id) then raise exception '운영자로 지정할 수 없는 회원입니다.' using errcode='42501';end if;
  if tg_op='UPDATE' and old.active then new.slot_no:=old.slot_no;return new;end if;
  select n into seat from generate_series(1,2) n where not exists(select 1 from private.course_stewards s where s.course_id=new.course_id and s.active and s.slot_no=n)
   and not exists(select 1 from private.course_operator_invitations i where i.course_id=new.course_id and i.slot_no=n and i.status='pending') order by n limit 1;
  if seat is null then raise exception '운영자 두 자리가 모두 지정 또는 예약되었습니다.' using errcode='PT409';end if;
  new.slot_no:=seat;
 else new.slot_no:=null;
 end if;
 return new;
end $$;
create trigger course_steward_seat_guard before insert or update of active on private.course_stewards for each row execute function private.course_guard_seat();
-- A role removal cancels any pending appointment authored by that operator.
create function private.course_cancel_revoked_invitations() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.active and not new.active then
  update private.course_operator_invitations set status='cancelled',resolved_at=clock_timestamp() where course_id=new.course_id and inviter_id=new.user_id and status='pending';
 end if;return new;
end $$;
create trigger course_steward_cancel_invites after update of active on private.course_stewards for each row execute function private.course_cancel_revoked_invitations();

create function private.course_operator_read(p_course_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=private.messaging_assert_actor();c public.courses%rowtype;members jsonb;invites jsonb;
begin
 perform private.course_next_lock();perform private.course_expire_invitations();
 select * into c from public.courses where course_key=p_course_key and course_status='active';
 if not found or not private.course_can_manage(c.id,a) then raise exception '구장 관리 권한이 없습니다.' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object('user_id',s.user_id,'name',private.messaging_display_name(s.user_id),'self',s.user_id=a,'slot',s.slot_no) order by s.slot_no),'[]') into members from private.course_stewards s where s.course_id=c.id and s.active;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'target_name',private.messaging_display_name(target_id),'expires_at',expires_at,'can_cancel',inviter_id=a)),'[]') into invites from private.course_operator_invitations where course_id=c.id and status='pending';
 return jsonb_build_object('members',members,'invitations',invites);
end $$;
create function private.course_operator_lookup(p_course_key text,p_code uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=private.messaging_assert_actor();c uuid;
begin
 select id into c from public.courses where course_key=p_course_key and course_status='active';
 if c is null or not private.course_can_manage(c,a) then raise exception '구장 관리 권한이 없습니다.' using errcode='42501';end if;
 if p_code=a or not private.messaging_account_available(p_code) or private.course_current_operator(c,p_code) then raise exception '지정할 회원의 수신 코드를 확인해 주세요.' using errcode='P0002';end if;
 return jsonb_build_object('code',p_code,'name',private.messaging_display_name(p_code));
end $$;
create function private.course_operator_invite(p_course_key text,p_code uuid,p_kind text,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=private.messaging_assert_actor();c uuid;seat smallint;r jsonb;i uuid;
begin
 perform private.course_next_lock();perform private.course_expire_invitations();
 if p_kind is null or p_kind not in ('add','transfer') or p_request_id is null then raise exception '지정 요청을 확인해 주세요.' using errcode='22023';end if;
 select id into c from public.courses where course_key=p_course_key and course_status='active' for update;
 r:=private.course_next_claim(a,p_request_id,'course.operator_invite',jsonb_build_array(c,p_code,p_kind));if r is not null then return r;end if;
 perform private.course_operator_lookup(p_course_key,p_code);
 if p_kind='transfer' then
  select slot_no into seat from private.course_stewards where course_id=c and user_id=a and active;
  if seat is null then raise exception '내 운영권만 넘길 수 있습니다.' using errcode='42501';end if;
 else
  select n into seat from generate_series(1,2) n where not exists(select 1 from private.course_stewards where course_id=c and active and slot_no=n)
   and not exists(select 1 from private.course_operator_invitations where course_id=c and slot_no=n and status='pending') order by n limit 1;
 end if;
 if seat is null or exists(select 1 from private.course_operator_invitations where course_id=c and status='pending' and (slot_no=seat or target_id=p_code)) then raise exception '운영자 자리가 이미 지정 또는 예약되었습니다.' using errcode='PT409';end if;
 insert into private.course_operator_invitations(course_id,inviter_id,target_id,kind,slot_no)values(c,a,p_code,p_kind,seat) returning id into i;
 insert into private.course_operator_audit(course_id,actor_id,target_id,action,request_id)values(c,a,p_code,'invite_'||p_kind,p_request_id);
 r:=jsonb_build_object('id',i,'status','pending');perform private.course_complete_request(a,p_request_id,r);return r;
end $$;
create function private.course_my_invitations() returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=private.messaging_assert_actor();r jsonb;
begin
 perform private.course_next_lock();perform private.course_expire_invitations();
 select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'course_key',c.course_key,'course_name',c.name,'kind',i.kind,'inviter',private.messaging_display_name(i.inviter_id),'expires_at',i.expires_at) order by i.created_at desc),'[]') into r
 from private.course_operator_invitations i join public.courses c on c.id=i.course_id where i.target_id=a and i.status='pending';
 return r;
end $$;
create function private.course_invitation_resolve(p_id uuid,p_action text,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=private.messaging_assert_actor();i private.course_operator_invitations%rowtype;r jsonb;
begin
 perform private.course_next_lock();perform private.course_expire_invitations();
 if p_action is null or p_action not in ('accept','decline','cancel') or p_request_id is null then raise exception '수락 요청을 확인해 주세요.' using errcode='22023';end if;
 select * into i from private.course_operator_invitations where id=p_id for update;
 if not found or (p_action='cancel' and i.inviter_id<>a) or (p_action<>'cancel' and i.target_id<>a) then raise exception '본인 요청만 처리할 수 있습니다.' using errcode='42501';end if;
 r:=private.course_next_claim(a,p_request_id,'course.invitation_resolve',jsonb_build_array(p_id,p_action));if r is not null then return r;end if;
 if i.status<>'pending' then raise exception '요청이 만료되었거나 이미 처리되었습니다.' using errcode='PT409';end if;
 if p_action='accept' then
  if not private.course_can_manage(i.course_id,i.inviter_id) or not exists(select 1 from public.courses where id=i.course_id and course_status='active') then raise exception '운영자 지정 조건이 변경되었습니다.' using errcode='PT409';end if;
  update private.course_operator_invitations set status='accepted',resolved_at=clock_timestamp() where id=i.id;
  if i.kind='transfer' then
   update private.course_stewards set active=false,updated_at=clock_timestamp() where course_id=i.course_id and user_id=i.inviter_id and slot_no=i.slot_no and active;
   if not found then raise exception '넘겨줄 운영권이 변경되었습니다.' using errcode='PT409';end if;
  end if;
  if exists(select 1 from private.course_stewards where course_id=i.course_id and user_id=a and active) then raise exception '이미 이 구장 운영자입니다.' using errcode='PT409';end if;
  insert into private.course_stewards(course_id,user_id,granted_by) values(i.course_id,a,i.inviter_id) on conflict(course_id,user_id) do update set active=true,granted_by=excluded.granted_by,updated_at=clock_timestamp();
 else update private.course_operator_invitations set status=case when p_action='cancel' then 'cancelled' else 'declined' end,resolved_at=clock_timestamp() where id=i.id;
 end if;
 insert into private.course_operator_audit(course_id,actor_id,target_id,action,request_id)values(i.course_id,a,i.target_id,p_action,p_request_id);
 r:=jsonb_build_object('id',p_id,'status',case p_action when 'accept' then 'accepted' when 'decline' then 'declined' else 'cancelled' end);
 perform private.course_complete_request(a,p_request_id,r);return r;
end $$;
-- Trusted withdrawal-adapter hook only. This is NOT account deletion.
create function private.course_withdraw_roles(p_user uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.course_next_lock();
 update private.course_operator_invitations set status='cancelled',resolved_at=clock_timestamp() where status='pending' and (inviter_id=p_user or target_id=p_user);
 insert into private.course_operator_audit(course_id,actor_id,target_id,action)select course_id,p_user,p_user,'withdraw_role' from private.course_stewards where user_id=p_user and active;
 update private.course_stewards set active=false,updated_at=clock_timestamp() where user_id=p_user and active;
 update public.course_messaging_operator_grants set revoked_at=clock_timestamp() where user_id=p_user and revoked_at is null;
end $$;

create function private.course_interest_list(p_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a uuid:=private.course_notification_actor();r jsonb;
begin
 if p_offset is null or p_offset<0 or p_offset>10000 then raise exception '목록 범위를 확인해 주세요.' using errcode='22023';end if;
 select coalesce(jsonb_agg(private.course_interest_read(c.course_key)||jsonb_build_object('name',case when c.course_status='active' then c.name else '비공개 구장' end) order by c.course_key),'[]') into r
 from (select v.* from public.courses v where exists(select 1 from public.course_bookmarks b where b.course_id=v.id and b.user_id=a) or exists(select 1 from public.course_notification_subscriptions n where n.course_id=v.id and n.user_id=a and n.unsubscribed_at is null) order by v.course_key limit 20 offset p_offset)c;
 return r;
end $$;

alter table public.messaging_messages drop constraint messaging_broadcast_shape_check;
alter table public.messaging_messages add constraint messaging_broadcast_shape_check check(
 (kind in ('direct','course_inquiry') and broadcast_recipient_count is null) or
 (kind in ('platform_broadcast','club_broadcast','club_event_broadcast','course_broadcast') and broadcast_recipient_count between 1 and 10000 and broadcast_recipient_count is not null and reply_to_message_id is null and not first_contact));
-- One common message body per event; no direct recipient copies.
alter table public.messaging_messages drop constraint messaging_messages_kind_check;
alter table public.messaging_messages add constraint messaging_messages_kind_check check(kind in ('direct','platform_broadcast','club_broadcast','club_event_broadcast','course_broadcast','course_inquiry'));
create table private.course_shared_threads(
 id uuid primary key default gen_random_uuid(),course_id uuid not null references public.courses(id),
 requester_id uuid not null references public.user_accounts(id),policy_version text not null check(policy_version='course-shared-v1'),
 policy_at timestamptz not null default clock_timestamp(),version integer not null default 0,
 status text not null default 'pending' check(status in ('pending','answered','reopened')),
 answered_by uuid references public.user_accounts(id),answered_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp()
);
create index course_shared_course on private.course_shared_threads(course_id,updated_at desc,id);
create index course_shared_requester on private.course_shared_threads(requester_id,updated_at desc,id);
create table private.course_shared_messages(
 message_id uuid primary key references public.messaging_messages(id),thread_id uuid not null references private.course_shared_threads(id),
 seq integer not null,operator_reply boolean not null,unique(thread_id,seq)
);
create table private.course_shared_reads(
 thread_id uuid not null references private.course_shared_threads(id),user_id uuid not null references public.user_accounts(id),
 last_seq integer not null default 0,read_at timestamptz not null default clock_timestamp(),primary key(thread_id,user_id)
);
create function private.course_shared_access(t private.course_shared_threads,a uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.messaging_account_available(a) and (t.requester_id=a or private.course_current_operator(t.course_id,a))
$$;
create function private.course_shared_read(p_thread uuid,p_mark boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=private.messaging_assert_actor();t private.course_shared_threads%rowtype;c public.courses%rowtype;messages jsonb;
begin
 select * into t from private.course_shared_threads where id=p_thread;
 if not found or not private.course_shared_access(t,a) then raise exception '문의 열람 권한이 없습니다.' using errcode='42501';end if;
 select * into c from public.courses where id=t.course_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'body',m.body,'name',private.messaging_display_name(m.sender_user_id),'at',m.created_at,'operator',x.operator_reply,'seq',x.seq) order by x.seq),'[]') into messages from private.course_shared_messages x join public.messaging_messages m on m.id=x.message_id where x.thread_id=t.id;
 if p_mark then insert into private.course_shared_reads(thread_id,user_id,last_seq)values(t.id,a,t.version) on conflict(thread_id,user_id)do update set last_seq=greatest(course_shared_reads.last_seq,excluded.last_seq),read_at=clock_timestamp();end if;
 return jsonb_build_object('id',t.id,'course_key',c.course_key,'course_name',case when c.course_status='active' then c.name else '비공개 구장' end,'version',t.version,'status',t.status,
 'answered_by',case when t.answered_by is not null then private.messaging_display_name(t.answered_by) end,'answered_at',t.answered_at,
 'member',t.requester_id=a,'can_send',c.course_status='active' and exists(select 1 from private.course_stewards s where s.course_id=c.id and private.course_current_operator(c.id,s.user_id)),
 'messages',messages);
end $$;
create function private.course_shared_list(p_course_key text default null,p_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a uuid:=private.messaging_assert_actor();c uuid;r jsonb;
begin
 if p_offset is null or p_offset<0 or p_offset>10000 then raise exception '목록 범위를 확인해 주세요.' using errcode='22023';end if;
 if p_course_key is not null then
  select id into c from public.courses where course_key=p_course_key;
  if c is null or not private.course_current_operator(c,a) then raise exception '현재 구장 운영자만 확인할 수 있습니다.' using errcode='42501';end if;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'course_key',v.course_key,'course_name',case when v.course_status='active' then v.name else '비공개 구장' end,
 'status',t.status,'version',t.version,'updated_at',t.updated_at,'answered_by',case when t.answered_by is not null then private.messaging_display_name(t.answered_by)end,'answered_at',t.answered_at,
 'unread',t.version>coalesce(r.last_seq,0),'preview',(select left(m.body,80) from private.course_shared_messages x join public.messaging_messages m on m.id=x.message_id where x.thread_id=t.id order by x.seq limit 1)) order by t.updated_at desc,t.id),'[]') into r
 from (select * from private.course_shared_threads where (c is null and requester_id=a or course_id=c) order by updated_at desc,id limit 20 offset p_offset)t join public.courses v on v.id=t.course_id left join private.course_shared_reads r on r.thread_id=t.id and r.user_id=a;
 return r;
end $$;
create function private.course_shared_send(p_course_key text,p_thread uuid,p_body text,p_version integer,p_policy text,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=private.messaging_assert_actor();c public.courses%rowtype;t private.course_shared_threads%rowtype;r jsonb;body text:=private.messaging_trim(p_body);operator boolean;other uuid;mid uuid;stamp timestamptz;
begin
 perform private.course_next_lock();
 perform pg_advisory_xact_lock(1297303345,hashtext(a::text));
 if p_request_id is null or body is null or char_length(body) not between 1 and 2000 or p_policy is distinct from 'course-shared-v1' then raise exception '문의 안내와 1~2,000자 내용을 확인해 주세요.' using errcode='22023';end if;
 select * into c from public.courses where course_key=p_course_key;
 if not found then raise exception '구장을 찾을 수 없습니다.' using errcode='P0002';end if;
 if p_thread is not null then
  select * into t from private.course_shared_threads where id=p_thread and course_id=c.id for update;
  if not found or not private.course_shared_access(t,a) then raise exception '문의 권한이 변경되었습니다.' using errcode='42501';end if;
 end if;
 -- A replay only acknowledges the original event; never sends again.
 r:=private.course_next_claim(a,p_request_id,'course.shared_send',jsonb_build_array(c.id,p_thread,body,p_version,p_policy));
 if r is not null then return r;end if;
 if c.course_status<>'active' or not exists(select 1 from private.course_stewards s where s.course_id=c.id and private.course_current_operator(c.id,s.user_id)) then raise exception '현재 구장 운영자가 없어 문의를 보낼 수 없습니다. 내용을 보관하고 나중에 직접 다시 보내 주세요.' using errcode='PT409';end if;
 operator:=p_thread is not null and t.requester_id<>a;
 if p_thread is null then
  if p_version is distinct from 0 then raise exception '문의 작성 상태를 확인해 주세요.' using errcode='PT409';end if;
  insert into private.course_shared_threads(course_id,requester_id,policy_version)values(c.id,a,p_policy)returning * into t;
 elsif t.version is distinct from p_version then raise exception '다른 답변이 먼저 등록되었습니다. 최신 대화를 확인한 뒤 직접 다시 보내 주세요.' using errcode='PT409';end if;
 -- Preserve personal blocking. A new send is refused if any current participant pair is blocked.
 for other in select s.user_id from private.course_stewards s where s.course_id=c.id and private.course_current_operator(c.id,s.user_id) order by s.user_id loop
  if other<>t.requester_id then
   perform private.messaging_lock_pair(other,t.requester_id);
   if exists(select 1 from public.messaging_blocks where (blocker_user_id=other and blocked_user_id=t.requester_id)or(blocker_user_id=t.requester_id and blocked_user_id=other)) then raise exception '현재 이 문의를 보낼 수 없습니다.' using errcode='42501';end if;
  end if;
 end loop;
 if not private.messaging_account_available(t.requester_id) then raise exception '현재 이 문의를 보낼 수 없습니다.' using errcode='42501';end if;
 stamp:=clock_timestamp();
 if exists(select 1 from public.messaging_messages where sender_user_id=a and created_at>stamp-interval '3 seconds') then raise exception '잠시 뒤 직접 다시 보내 주세요.' using errcode='P0001';end if;
 if (select count(*) from public.messaging_messages where sender_user_id=a and created_at>stamp-interval '24 hours')>=100 then raise exception '오늘 보낼 수 있는 쪽지 수를 넘었습니다.' using errcode='P0001';end if;
 insert into public.messaging_messages(kind,sender_user_id,body,body_hash,recipient_key,request_id,request_fingerprint,first_contact,created_at)
 values('course_inquiry',a,body,encode(sha256(convert_to(private.messaging_normalize(body),'UTF8')),'hex'),'course:'||t.id,p_request_id,encode(sha256(convert_to(jsonb_build_array(t.id,body,p_version)::text,'UTF8')),'hex'),p_thread is null,stamp) returning id into mid;
 insert into private.course_shared_messages(message_id,thread_id,seq,operator_reply)values(mid,t.id,t.version+1,operator);
 update private.course_shared_threads set version=t.version+1,status=case when operator then 'answered' when t.version=0 then 'pending' else 'reopened' end,
 answered_by=case when operator then a else answered_by end,answered_at=case when operator then stamp else answered_at end,updated_at=stamp where id=t.id;
 insert into private.course_shared_reads(thread_id,user_id,last_seq)values(t.id,a,t.version+1)on conflict(thread_id,user_id)do update set last_seq=excluded.last_seq,read_at=clock_timestamp();
 r:=jsonb_build_object('id',t.id,'message_id',mid,'version',t.version+1);perform private.course_complete_request(a,p_request_id,r);return r;
end $$;

-- Story author resolution is private and refreshed at send, never a public UUID field.
create function private.course_story_message_context(p_course_key text,p_post_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=private.messaging_assert_actor();p public.course_discussion_posts%rowtype;
begin
 select x.* into p from public.course_discussion_posts x join public.courses c on c.id=x.course_id where c.course_key=p_course_key and c.course_status='active' and x.post_key=p_post_key and x.post_status='published' and x.moderation_hidden_at is null;
 if not found or p.author_user_id=a or not private.messaging_account_available(p.author_user_id) or exists(select 1 from public.messaging_blocks where (blocker_user_id=a and blocked_user_id=p.author_user_id)or(blocker_user_id=p.author_user_id and blocked_user_id=a)) then raise exception '현재 이 글쓴이에게 쪽지를 보낼 수 없습니다.' using errcode='P0002';end if;
 return jsonb_build_object('id',p.id,'name',private.messaging_display_name(p.author_user_id));
end $$;
create function private.course_story_message_send(p_course_key text,p_post_key text,p_body text,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=private.messaging_assert_actor();p public.course_discussion_posts%rowtype;r jsonb;
begin
 perform private.course_next_lock();
 -- Receipt fingerprint includes immutable story context. Replay does not disclose a new author.
 r:=private.course_next_claim(a,p_request_id,'course.story_direct',jsonb_build_array(p_course_key,p_post_key,p_body));if r is not null then return r;end if;
 perform private.course_story_message_context(p_course_key,p_post_key);
 select x.* into p from public.course_discussion_posts x join public.courses c on c.id=x.course_id where c.course_key=p_course_key and c.course_status='active' and x.post_key=p_post_key and x.post_status='published' and x.moderation_hidden_at is null for share of x,c;
 if not found then raise exception '현재 이 글쓴이에게 쪽지를 보낼 수 없습니다.' using errcode='P0002';end if;
 r:=private.messaging_create(p.author_user_id,null,p_body,p_request_id);
 perform private.course_complete_request(a,p_request_id,r);return r;
end $$;

create or replace function private.mutate_course_application(p_id uuid, p_action text, p_version integer, p_request_id uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a uuid; r private.course_applications%rowtype; c public.courses%rowtype; d jsonb; replay jsonb; result jsonb; kind text; target uuid; base timestamptz; grant_role boolean; verified boolean;
begin
  perform private.course_next_lock();
    a:=private.require_course_applicant();
  if p_id is null or p_request_id is null or p_action is null or p_action not in ('submit','resubmit','supplement','approve','reject','revoke') or p_input is null or jsonb_typeof(p_input)<>'object' then raise exception '요청을 확인해 주세요.' using errcode='22023'; end if;
  if p_action in ('supplement','approve','reject','revoke') then perform private.require_course_manager(); end if;
  replay:=private.course_claim_request(a,p_request_id,'course.application_'||p_action,jsonb_build_object('id',p_id,'version',p_version,'input',p_input));
  if replay is not null then return replay; end if;
  if p_action<>'submit' then
    select * into r from private.course_applications where id=p_id for update;
    if not found then raise exception '신청을 찾을 수 없습니다.' using errcode='P0002'; end if;
    if p_action='resubmit' and r.applicant_id<>a then raise exception '본인 신청만 보완할 수 있습니다.' using errcode='42501'; end if;
    if r.version is distinct from p_version then raise exception '신청이 변경되었습니다. 최신 내용을 다시 확인해 주세요.' using errcode='PT409'; end if;
    if p_action='resubmit' and r.status<>'supplement' or p_action in ('supplement','approve','reject') and r.status<>'pending' or p_action='revoke' and (r.status<>'approved' or not r.permission_granted) then raise exception '이미 처리되었거나 처리할 수 없는 신청입니다.' using errcode='22023'; end if;
  end if;
  if p_action in ('submit','resubmit') then
    kind:=case when p_action='submit' then p_input->>'kind' else r.kind end;
    if kind in ('new','claim') and p_input->>'operatorPolicy' is distinct from 'course-operator-v1' then raise exception '운영 범위와 공동 문의 인계 안내에 동의해 주세요.' using errcode='22023';end if;
    if kind is null or kind not in ('new','claim','edit') then raise exception '신청 종류를 확인해 주세요.' using errcode='22023'; end if;
    if kind<>'new' then
      select * into c from public.courses where (p_action='submit' and course_key=p_input->>'courseKey' or p_action='resubmit' and id=r.target_course_id) and course_status<>'removed' for update;
      if not found then raise exception '구장을 찾을 수 없습니다.' using errcode='P0002'; end if;
      if kind='claim' and c.course_status<>'active' then raise exception '공개 구장만 관리 권한을 신청할 수 있습니다.' using errcode='42501'; end if;
      if kind='edit' then
        perform 1 from private.course_stewards where course_id=c.id and user_id=a and active for share;
        if not found then raise exception '승인된 담당 구장만 수정 신청할 수 있습니다.' using errcode='42501'; end if;
        if (p_input->>'baseUpdatedAt')::timestamptz is distinct from c.updated_at then raise exception '공개 정보가 변경되었습니다. 최신 내용을 다시 확인해 주세요.' using errcode='PT409'; end if;
      end if;
      target:=c.id; base:=c.updated_at;
    end if;
    if coalesce(char_length(btrim(p_input->>'relation')),0) not between 2 and 200 or coalesce(char_length(btrim(p_input->>'verificationContact')),0) not between 5 and 200 then raise exception '담당 관계와 확인 연락 수단을 입력해 주세요.' using errcode='22023'; end if;
    d:=case when kind='claim' then private.public_course_json(c) else private.course_application_draft(p_input->'draft') end;
    if kind='edit' and d->>'course_type'<>c.course_type then raise exception '구장 유형 변경은 PUL 운영자에게 요청해 주세요.' using errcode='22023'; end if;
    if kind<>'claim' and d->>'phone' is not null and (p_input->>'publicContactConfirmed')::boolean is distinct from true then raise exception '공개할 구장 연락처임을 확인해 주세요.' using errcode='22023'; end if;
    if p_action='submit' then
      insert into private.course_applications(id,applicant_id,kind,target_course_id,draft,relation,verification_contact,public_contact_confirmed,base_updated_at)
      values(p_id,a,kind,target,d,btrim(p_input->>'relation'),btrim(p_input->>'verificationContact'),coalesce((p_input->>'publicContactConfirmed')::boolean,false),base) returning * into r;
    else
      update private.course_applications set draft=d,relation=btrim(p_input->>'relation'),verification_contact=btrim(p_input->>'verificationContact'),public_contact_confirmed=coalesce((p_input->>'publicContactConfirmed')::boolean,false),base_updated_at=base,status='pending',version=version+1,updated_at=clock_timestamp() where id=r.id returning * into r;
    end if;
  elsif p_action in ('supplement','reject') then
    if coalesce(char_length(btrim(p_input->>'note')),0) not between 2 and 500 then raise exception '처리 사유를 2~500자로 입력해 주세요.' using errcode='22023'; end if;
    update private.course_applications set status=case when p_action='supplement' then 'supplement' else 'rejected' end,review_note=btrim(p_input->>'note'),reviewed_by=a,version=version+1,updated_at=clock_timestamp() where id=r.id returning * into r;
  elsif p_action='revoke' then
    update private.course_stewards set active=false,updated_at=clock_timestamp() where course_id=r.target_course_id and user_id=r.applicant_id;
    update private.course_applications set permission_granted=false,version=version+1,updated_at=clock_timestamp(),reviewed_by=a where id=r.id returning * into r;
  else
    if (p_input->>'duplicatesChecked')::boolean is distinct from true then raise exception '중복 정보를 확인해 주세요.' using errcode='22023'; end if;
    grant_role:=coalesce((p_input->>'grantPermission')::boolean,false);
    verified:=coalesce((p_input->>'relationVerified')::boolean,false);
    if (r.kind='claim' or grant_role) and not verified then raise exception '담당 관계를 확인해야 권한을 승인할 수 있습니다.' using errcode='22023'; end if;
    if r.kind='claim' and not grant_role then raise exception '관리 권한 신청의 담당 관계를 확인해 주세요.' using errcode='22023'; end if;
    perform 1 from public.user_accounts where id=r.applicant_id and account_status='active' for share;
    if not found then raise exception '비활성 회원의 신청은 승인할 수 없습니다.' using errcode='42501'; end if;
    if r.kind<>'new' then
      select * into c from public.courses where id=r.target_course_id for update;
      if not found or c.course_status='removed' then raise exception '구장을 찾을 수 없습니다.' using errcode='P0002'; end if;
      if c.updated_at is distinct from r.base_updated_at then raise exception '공개 정보가 변경되었습니다. 보완 요청 후 최신 내용으로 다시 검토해 주세요.' using errcode='PT409'; end if;
      if r.kind='edit' then
        perform 1 from private.course_stewards where course_id=c.id and user_id=r.applicant_id and active for share;
        if not found then raise exception '담당 권한이 철회되었습니다.' using errcode='42501'; end if;
      end if;
    end if;
    if r.kind='new' then
      perform pg_advisory_xact_lock(hashtextextended(lower(r.draft->>'name')||'|'||lower(r.draft->>'address'),0));
      if exists(select 1 from public.courses where lower(name)=lower(r.draft->>'name') and lower(address)=lower(r.draft->>'address') and course_status<>'removed') then raise exception '같은 이름·주소의 구장이 있습니다. 기존 구장 관리 권한을 신청해 주세요.' using errcode='23505'; end if;
      d:=r.draft||jsonb_build_object('feature_codes','[]'::jsonb,'latitude',null,'longitude',null);
      result:=public.mutate_managed_course('create',null,null,gen_random_uuid(),d);
      result:=public.mutate_managed_course('activate',result->>'course_key',(result->>'updated_at')::timestamptz,gen_random_uuid(),'{}');
      select * into c from public.courses where course_key=result->>'course_key';
    elsif r.kind='edit' then
      d:=r.draft||jsonb_build_object('feature_codes',to_jsonb(c.feature_codes),'latitude',c.latitude,'longitude',c.longitude);
      perform public.mutate_managed_course('update',c.course_key,c.updated_at,gen_random_uuid(),d);
    end if;
    if grant_role and r.operator_policy is distinct from 'course-operator-v1' and not private.course_current_operator(c.id,r.applicant_id) then raise exception '신청자의 운영 범위 동의를 보완받아 주세요.' using errcode='22023';end if;
    if grant_role then
      insert into private.course_stewards(course_id,user_id,granted_by) values(c.id,r.applicant_id,a)
      on conflict(course_id,user_id) do update set active=true,granted_by=a,updated_at=clock_timestamp();
    end if;
    update private.course_applications set target_course_id=c.id,status='approved',review_note=null,reviewed_by=a,permission_granted=grant_role,version=version+1,updated_at=clock_timestamp() where id=r.id returning * into r;
  end if;
  if p_action in ('submit','resubmit') and kind in ('new','claim') then
 update private.course_applications set operator_policy='course-operator-v1',operator_policy_at=clock_timestamp() where id=r.id;
 end if;
 result:=jsonb_build_object('id',r.id,'status',r.status,'version',r.version);
  perform private.course_complete_request(a,p_request_id,result);
  return result;
end; $function$
;
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
  if v_kind in ('platform_broadcast','club_broadcast','club_event_broadcast','course_broadcast') then
    if tg_table_name='messaging_recipients' then
      if new.recipient_user_id=v_sender or new.received_at<>v_time then
        raise exception 'messaging_delivery_invariant' using errcode='23514';
      end if;
    elsif (select count(*) from public.messaging_recipients where message_id=v_id)<>v_count then
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
create or replace function public.get_messaging_message(p_message_id uuid,p_mark_read boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.messaging_assert_actor(); v_m public.messaging_messages%rowtype;
  v_r public.messaging_recipients%rowtype; v_is_recipient boolean; v_counterpart uuid;
begin
  if p_mark_read is null then raise exception 'messaging_invalid' using errcode='22023'; end if;
  select m.* into v_m from public.messaging_messages m where m.id=p_message_id;
  if v_m.kind='course_inquiry' then raise exception '구장 문의함에서 확인해 주세요.' using errcode='P0002';end if;
  if v_m.kind='course_broadcast' and v_m.sender_user_id=v_actor and v_m.sender_hidden_at is null then
    return jsonb_build_object('id',v_m.id,'kind',v_m.kind,'body',v_m.body,'counterpart_user_id',null,
      'counterpart_display','장소 운영공지','created_at',v_m.created_at,'reply_to_message_id',null,
      'is_recipient',false,'read_at',null,'recipient_count',v_m.broadcast_recipient_count);
  end if;
  if v_m.kind in ('platform_broadcast','club_broadcast','club_event_broadcast','course_broadcast') then
    select r.* into v_r from public.messaging_recipients r
      where r.message_id=p_message_id and r.recipient_user_id=v_actor and r.hidden_at is null;
    if not found then raise exception 'messaging_not_found' using errcode='P0002'; end if;
    if p_mark_read then
      update public.messaging_recipients set read_at=coalesce(read_at,clock_timestamp())
        where message_id=p_message_id and recipient_user_id=v_actor and hidden_at is null returning * into v_r;
      if not found then raise exception 'messaging_not_found' using errcode='P0002'; end if;
    end if;
    return jsonb_build_object('id',v_m.id,'kind',v_m.kind,'body',v_m.body,'counterpart_user_id',null,
      'counterpart_display',case when v_m.kind='club_broadcast' then '동호회 공지' when v_m.kind='club_event_broadcast' then '행사 안내' when v_m.kind='course_broadcast' then '장소 운영공지' else 'PUL 공지' end,'created_at',v_m.created_at,'reply_to_message_id',null,
      'is_recipient',true,'read_at',v_r.read_at);
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
create or replace function public.get_messaging_unread_count()
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.messaging_assert_actor();
begin
  return (select count(*) from public.messaging_recipients where recipient_user_id=v_actor and hidden_at is null and read_at is null)
  + (select count(*) from private.course_shared_threads t left join private.course_shared_reads r on r.thread_id=t.id and r.user_id=v_actor
     where private.course_shared_access(t,v_actor) and t.version>coalesce(r.last_seq,0));
end;
$$;
create or replace function private.course_inquiry_send(p_course_key text,p_body text,p_request_id uuid,p_recipient uuid,p_version integer) returns jsonb language plpgsql security definer set search_path='' as $$ begin raise exception '새 구장 문의 화면을 열어 주세요. 입력은 보관해 주세요.' using errcode='PT409';end $$;
create or replace function private.course_management_read(p_course_key text,p_manage boolean) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c public.courses%rowtype; result jsonb;
begin
 select * into c from public.courses where course_key=p_course_key and course_status='active';
 if not found then raise exception '구장을 찾을 수 없습니다.' using errcode='P0002';end if;
 result:=private.course_state_json(c)||jsonb_build_object('can_manage',private.course_can_manage(c.id),'operator_count',(select count(*) from private.course_stewards s where s.course_id=c.id and private.course_current_operator(c.id,s.user_id)));
 if not p_manage then return result;end if;
 if not private.course_can_manage(c.id) then raise exception '담당 구장 관리 권한이 없습니다.' using errcode='42501';end if;
 return result||jsonb_build_object('course',private.public_course_json(c),'updated_at',c.updated_at,
 'resources',coalesce((select jsonb_agg(private.course_content_resource_json(r)||jsonb_build_object('status',r.status) order by r.created_at desc) from private.course_resources r where r.course_id=c.id and r.status='published'),'[]'),
 'photos',coalesce((select jsonb_agg(jsonb_build_object('media_key',media_key,'caption',caption,'version',version) order by created_at desc) from public.course_media where course_id=c.id and media_status='available'),'[]'),
 'reports',coalesce((select jsonb_agg(jsonb_build_object('id',id,'body',report_body,'status',report_status,'updated_at',updated_at) order by created_at desc) from public.course_information_reports where target_course_id=c.id),'[]'));
end $$;
create or replace function private.course_story_json(p public.course_discussion_posts) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('post_key',p.post_key,'title',p.title,'body',p.body,'author_display_name',private.community_actor_display_name(p.author_user_id,auth.uid()),'created_at',p.created_at,
 'category',p.category,'processing_status',p.processing_status,'version',p.version,'pinned',p.pinned,'pinned_by',case when p.pinned then private.messaging_display_name(p.pinned_by) end,'pinned_at',p.pinned_at,
 'can_message',p.author_user_id is distinct from auth.uid() and private.messaging_account_available(p.author_user_id) and not exists(select 1 from public.messaging_blocks b where (b.blocker_user_id=auth.uid() and b.blocked_user_id=p.author_user_id)or(b.blocker_user_id=p.author_user_id and b.blocked_user_id=auth.uid())),
 'can_edit',p.author_user_id=auth.uid(),'can_manage',private.course_can_manage(p.course_id),'hidden',p.post_status<>'published' or p.moderation_hidden_at is not null,
 'images',coalesce((select jsonb_agg(jsonb_build_object('id',id,'position',position) order by position) from private.course_story_images where post_id=p.id and ready),'[]'),
 'comment_count',(select count(*) from private.course_story_comments c where c.post_id=p.id and not c.hidden and (c.parent_id is null or exists(select 1 from private.course_story_comments parent where parent.id=c.parent_id and not parent.hidden))))
$$;
create or replace function private.send_message_with_photos(p_kind text,p_target_id uuid,p_body text,p_request_id uuid,p_draft_id uuid,p_photo_ids uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.messaging_assert_actor(); payload jsonb; prior private.messaging_photo_requests%rowtype;
 story_key text; course_key text; result jsonb; sent_id uuid; asset_id uuid; a public.messaging_photo_assets%rowtype;
begin
 perform private.messaging_assert_read_committed();
 if p_kind='story' then perform private.course_next_lock();end if;
 if p_kind is null or p_kind not in ('direct','reply','listing','buy_request','vendor','store','story')
 or p_target_id is null or p_request_id is null or p_draft_id is null or p_body is null
 or char_length(private.messaging_trim(p_body)) not between 1 and 2000
 or p_photo_ids is null or cardinality(p_photo_ids) not between 1 and 3
 or array_position(p_photo_ids,null) is not null
 or (select count(distinct x) from unnest(p_photo_ids) x)<>cardinality(p_photo_ids)
 then raise exception 'photo_invalid' using errcode='22023'; end if;
 payload:=jsonb_build_array(p_kind,p_target_id,private.messaging_trim(p_body),p_draft_id,to_jsonb(p_photo_ids));
 -- Same sender lock and actual foundation functions preserve block/quota/reply guards.
 perform pg_advisory_xact_lock(1297303345,hashtext(actor::text));
 select * into prior from private.messaging_photo_requests where actor_id=actor and request_id=p_request_id;
 if found then
  if prior.input<>payload then raise exception 'photo_conflict' using errcode='22023'; end if;
  return prior.result;
 end if;
 -- Never retrofit photos onto a text-only or other successful request.
 if exists(select 1 from public.messaging_messages m where m.sender_user_id=actor and m.request_id=p_request_id)
 then raise exception 'photo_conflict' using errcode='22023'; end if;
 for asset_id in select x from unnest(p_photo_ids) x order by x loop
  select * into a from public.messaging_photo_assets where id=asset_id for update;
  if not found or a.owner_id is distinct from actor or a.draft_id<>p_draft_id or not a.ready or a.sent
  then raise exception 'photo_permission' using errcode='42501'; end if;
 end loop;
 if p_kind='story' then
 select p.post_key,c.course_key into story_key,course_key from public.course_discussion_posts p join public.courses c on c.id=p.course_id where p.id=p_target_id;
 if story_key is null then raise exception 'messaging_not_found' using errcode='P0002';end if;
 end if;
 case p_kind
 when 'story' then result:=private.course_story_message_send(course_key,story_key,p_body,p_request_id);
 when 'direct' then result:=public.send_messaging_message(p_target_id,p_body,p_request_id);
 when 'reply' then result:=public.reply_messaging_message(p_target_id,p_body,p_request_id);
 when 'listing' then result:=public.send_market_listing_message(p_target_id,p_body,p_request_id);
 when 'buy_request' then result:=public.send_market_buy_request_message(p_target_id,p_body,p_request_id);
 when 'vendor' then result:=public.send_market_vendor_message(p_target_id,p_body,p_request_id);
 when 'store' then result:=public.send_market_store_message(p_target_id,p_body,p_request_id);
 end case;
 sent_id:=(result->>'id')::uuid;
 if sent_id is null then raise exception 'photo_result'; end if;
 update public.messaging_photo_assets asset set sent=true,message_id=(result->>'id')::uuid,position=p.ordinality-1
 from unnest(p_photo_ids) with ordinality as p(id,ordinality) where asset.id=p.id;
 -- Prevent a text-only facade from acknowledging this photo operation as its own.
 update public.messaging_messages set request_fingerprint=encode(sha256(convert_to(jsonb_build_array('photos',payload)::text,'UTF8')),'hex')
 where id=sent_id;
 result:=result||jsonb_build_object('photo_ids',to_jsonb(p_photo_ids));
 insert into private.messaging_photo_requests values(actor,p_request_id,payload,result);
 return result;
end $$;
alter table private.course_interest_choices enable row level security;alter table private.course_interest_choices force row level security;revoke all on private.course_interest_choices from public,anon,authenticated,service_role;
alter table private.course_operator_invitations enable row level security;alter table private.course_operator_invitations force row level security;revoke all on private.course_operator_invitations from public,anon,authenticated,service_role;
alter table private.course_operator_audit enable row level security;alter table private.course_operator_audit force row level security;revoke all on private.course_operator_audit from public,anon,authenticated,service_role;
alter table private.course_shared_threads enable row level security;alter table private.course_shared_threads force row level security;revoke all on private.course_shared_threads from public,anon,authenticated,service_role;
alter table private.course_shared_messages enable row level security;alter table private.course_shared_messages force row level security;revoke all on private.course_shared_messages from public,anon,authenticated,service_role;
alter table private.course_shared_reads enable row level security;alter table private.course_shared_reads force row level security;revoke all on private.course_shared_reads from public,anon,authenticated,service_role;
create function public.course_interest_list(p_offset integer default 0) returns jsonb language sql security definer set search_path='' as $$select private.course_interest_list(p_offset)$$;
revoke all on function public.course_interest_list(integer) from public,anon,authenticated,service_role;grant execute on function public.course_interest_list(integer) to authenticated;
create function public.course_interest_read(p_course_key text) returns jsonb language sql security definer set search_path='' as $$select private.course_interest_read(p_course_key)$$;
revoke all on function public.course_interest_read(text) from public,anon,authenticated,service_role;grant execute on function public.course_interest_read(text) to authenticated;
create function public.course_interest_choose(p_course_key text,p_enabled boolean,p_policy text,p_request_id uuid) returns jsonb language sql security definer set search_path='' as $$select private.course_interest_choose(p_course_key,p_enabled,p_policy,p_request_id)$$;
revoke all on function public.course_interest_choose(text,boolean,text,uuid) from public,anon,authenticated,service_role;grant execute on function public.course_interest_choose(text,boolean,text,uuid) to authenticated;
create function public.course_operator_read(p_course_key text) returns jsonb language sql security definer set search_path='' as $$select private.course_operator_read(p_course_key)$$;
revoke all on function public.course_operator_read(text) from public,anon,authenticated,service_role;grant execute on function public.course_operator_read(text) to authenticated;
create function public.course_operator_lookup(p_course_key text,p_code uuid) returns jsonb language sql security definer set search_path='' as $$select private.course_operator_lookup(p_course_key,p_code)$$;
revoke all on function public.course_operator_lookup(text,uuid) from public,anon,authenticated,service_role;grant execute on function public.course_operator_lookup(text,uuid) to authenticated;
create function public.course_operator_invite(p_course_key text,p_code uuid,p_kind text,p_request_id uuid) returns jsonb language sql security definer set search_path='' as $$select private.course_operator_invite(p_course_key,p_code,p_kind,p_request_id)$$;
revoke all on function public.course_operator_invite(text,uuid,text,uuid) from public,anon,authenticated,service_role;grant execute on function public.course_operator_invite(text,uuid,text,uuid) to authenticated;
create function public.course_my_invitations() returns jsonb language sql security definer set search_path='' as $$select private.course_my_invitations()$$;
revoke all on function public.course_my_invitations() from public,anon,authenticated,service_role;grant execute on function public.course_my_invitations() to authenticated;
create function public.course_invitation_resolve(p_id uuid,p_action text,p_request_id uuid) returns jsonb language sql security definer set search_path='' as $$select private.course_invitation_resolve(p_id,p_action,p_request_id)$$;
revoke all on function public.course_invitation_resolve(uuid,text,uuid) from public,anon,authenticated,service_role;grant execute on function public.course_invitation_resolve(uuid,text,uuid) to authenticated;
create function public.course_shared_read(p_thread uuid,p_mark boolean default false) returns jsonb language sql security definer set search_path='' as $$select private.course_shared_read(p_thread,p_mark)$$;
revoke all on function public.course_shared_read(uuid,boolean) from public,anon,authenticated,service_role;grant execute on function public.course_shared_read(uuid,boolean) to authenticated;
create function public.course_shared_list(p_course_key text default null,p_offset integer default 0) returns jsonb language sql security definer set search_path='' as $$select private.course_shared_list(p_course_key,p_offset)$$;
revoke all on function public.course_shared_list(text,integer) from public,anon,authenticated,service_role;grant execute on function public.course_shared_list(text,integer) to authenticated;
create function public.course_shared_send(p_course_key text,p_thread uuid,p_body text,p_version integer,p_policy text,p_request_id uuid) returns jsonb language sql security definer set search_path='' as $$select private.course_shared_send(p_course_key,p_thread,p_body,p_version,p_policy,p_request_id)$$;
revoke all on function public.course_shared_send(text,uuid,text,integer,text,uuid) from public,anon,authenticated,service_role;grant execute on function public.course_shared_send(text,uuid,text,integer,text,uuid) to authenticated;
create function public.course_story_message_context(p_course_key text,p_post_key text) returns jsonb language sql security definer set search_path='' as $$select private.course_story_message_context(p_course_key,p_post_key)$$;
revoke all on function public.course_story_message_context(text,text) from public,anon,authenticated,service_role;grant execute on function public.course_story_message_context(text,text) to authenticated;
create function public.course_story_message_send(p_course_key text,p_post_key text,p_body text,p_request_id uuid) returns jsonb language sql security definer set search_path='' as $$select private.course_story_message_send(p_course_key,p_post_key,p_body,p_request_id)$$;
revoke all on function public.course_story_message_send(text,text,text,uuid) from public,anon,authenticated,service_role;grant execute on function public.course_story_message_send(text,text,text,uuid) to authenticated;
revoke all on function private.course_next_lock() from public,anon,authenticated,service_role;
revoke all on function private.course_current_operator(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.course_next_claim(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function private.course_interest_read(text) from public,anon,authenticated,service_role;
revoke all on function private.course_interest_choose(text,boolean,text,uuid) from public,anon,authenticated,service_role;
revoke all on function private.course_expire_invitations() from public,anon,authenticated,service_role;
revoke all on function private.course_guard_seat() from public,anon,authenticated,service_role;
revoke all on function private.course_cancel_revoked_invitations() from public,anon,authenticated,service_role;
revoke all on function private.course_operator_read(text) from public,anon,authenticated,service_role;
revoke all on function private.course_operator_lookup(text,uuid) from public,anon,authenticated,service_role;
revoke all on function private.course_operator_invite(text,uuid,text,uuid) from public,anon,authenticated,service_role;
revoke all on function private.course_my_invitations() from public,anon,authenticated,service_role;
revoke all on function private.course_invitation_resolve(uuid,text,uuid) from public,anon,authenticated,service_role;
revoke all on function private.course_withdraw_roles(uuid) from public,anon,authenticated,service_role;
revoke all on function private.course_interest_list(integer) from public,anon,authenticated,service_role;
revoke all on function private.course_shared_access(private.course_shared_threads,uuid) from public,anon,authenticated,service_role;
revoke all on function private.course_shared_read(uuid,boolean) from public,anon,authenticated,service_role;
revoke all on function private.course_shared_list(text,integer) from public,anon,authenticated,service_role;
revoke all on function private.course_shared_send(text,uuid,text,integer,text,uuid) from public,anon,authenticated,service_role;
revoke all on function private.course_story_message_context(text,text) from public,anon,authenticated,service_role;
revoke all on function private.course_story_message_send(text,text,text,uuid) from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
