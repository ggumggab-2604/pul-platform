-- Messaging 1E: whole-file transaction; DB before UI. No initial personal grants.
-- One immutable original + a send-time recipient snapshot, never a campaign queue.
alter table public.messaging_messages drop constraint messaging_messages_kind_check;
alter table public.messaging_messages add constraint messaging_messages_kind_check
  check (kind in ('direct','platform_broadcast'));
alter table public.messaging_messages add column broadcast_recipient_count integer;
alter table public.messaging_messages add constraint messaging_broadcast_shape_check check (
  (kind='direct' and broadcast_recipient_count is null) or
  (kind='platform_broadcast' and broadcast_recipient_count between 1 and 10000
    and broadcast_recipient_count is not null and reply_to_message_id is null and not first_contact)
);
create index messaging_broadcast_recent_idx on public.messaging_messages(created_at desc,id desc)
  where kind='platform_broadcast';

create table public.messaging_broadcast_grants (
  user_id uuid primary key references public.user_accounts(id) on delete cascade,
  granted_by uuid references public.user_accounts(id) on delete set null,
  granted_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz
);
create index messaging_broadcast_grant_actor_idx on public.messaging_broadcast_grants(granted_by)
  where granted_by is not null;
alter table public.messaging_broadcast_grants owner to postgres;
alter table public.messaging_broadcast_grants enable row level security;
alter table public.messaging_broadcast_grants force row level security;
revoke all on public.messaging_broadcast_grants from public,anon,authenticated,service_role;
insert into public.platform_permission_definitions(code,description)
  values('messaging.broadcast.manage','Manage own platform broadcasts; an additional personal grant is mandatory.');
insert into public.platform_role_permissions(platform_role,permission_code)
  values('platform_admin','messaging.broadcast.manage');

-- This operational entry is postgres-only, not a browser/service-role RPC.
-- p_operator is the separately approved human operator for the audit record.
create function private.set_messaging_broadcast_grant(p_user_id uuid,p_operator uuid,p_enabled boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_enabled is null or p_operator is null or not exists(select 1 from public.user_accounts
    where id=p_operator and account_status='active' and platform_role='platform_admin') then
    raise exception 'messaging_permission' using errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(1297303348,1);
  if p_enabled then
    insert into public.messaging_broadcast_grants(user_id,granted_by) values(p_user_id,p_operator)
      on conflict(user_id) do update set granted_by=excluded.granted_by,granted_at=clock_timestamp(),revoked_at=null;
  else
    update public.messaging_broadcast_grants set revoked_at=coalesce(revoked_at,clock_timestamp()) where user_id=p_user_id;
    if not found then return; end if;
  end if;
  insert into public.audit_logs(actor_id,actor_type,action,target_type,target_id,after_summary)
    values(p_operator,'operator','messaging.broadcast.grant','messaging_broadcast_grant',p_user_id::text,
      jsonb_build_object('active',p_enabled));
end;
$$;

create function private.messaging_assert_broadcaster(p_lock boolean default false)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_actor uuid := private.messaging_assert_actor();
begin
  if p_lock then
    -- Only the sender and its authorization rows are locked, not the audience.
    perform a.id from public.user_accounts a where a.id=v_actor for share;
    perform g.user_id from public.messaging_broadcast_grants g where g.user_id=v_actor for share;
    perform d.code from public.platform_permission_definitions d where d.code='messaging.broadcast.manage' for share;
    perform r.permission_code from public.platform_role_permissions r join public.user_accounts a
      on a.platform_role=r.platform_role where a.id=v_actor and r.permission_code='messaging.broadcast.manage' for share of r;
  end if;
  perform private.messaging_assert_actor();
  if not public.current_user_has_platform_permission('messaging.broadcast.manage')
    or not exists(select 1 from public.messaging_broadcast_grants g where g.user_id=v_actor and g.revoked_at is null) then
    raise exception 'messaging_permission' using errcode='42501';
  end if;
  return v_actor;
end;
$$;

create function public.preview_platform_broadcast()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid := private.messaging_assert_broadcaster(); v_count integer;
begin
  select count(*) into v_count from (select a.id from public.user_accounts a
    where a.id<>v_actor and private.messaging_account_available(a.id) limit 10001) eligible;
  return jsonb_build_object('recipient_count',v_count,'maximum',10000,'can_send',v_count between 1 and 10000);
end;
$$;

create function public.send_platform_broadcast(p_body text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid := private.messaging_assert_broadcaster(); v_previous public.messaging_messages%rowtype;
  v_body text := private.messaging_trim(p_body); v_normal text := private.messaging_normalize(p_body);
  v_fingerprint text; v_hash text; v_ids uuid[]; v_count integer; v_id uuid; v_now timestamptz;
begin
  perform private.messaging_assert_read_committed();
  if p_request_id is null or v_body is null or char_length(v_body) not between 1 and 2000 then
    raise exception 'messaging_invalid' using errcode='22023';
  end if;
  -- Global first, then the existing sender namespace. Direct/market never take global.
  perform pg_catalog.pg_advisory_xact_lock(1297303348,1);
  perform pg_catalog.pg_advisory_xact_lock(1297303345,pg_catalog.hashtext(v_actor::text));
  perform private.messaging_assert_broadcaster(true);
  v_fingerprint := encode(sha256(convert_to(jsonb_build_array('platform_broadcast','platform',v_normal)::text,'UTF8')),'hex');
  select * into v_previous from public.messaging_messages where sender_user_id=v_actor and request_id=p_request_id;
  if found then
    if v_previous.kind<>'platform_broadcast' or v_previous.request_fingerprint<>v_fingerprint then
      raise exception 'messaging_replay_conflict' using errcode='22023';
    end if;
    return jsonb_build_object('id',v_previous.id,'created_at',v_previous.created_at,'recipient_count',v_previous.broadcast_recipient_count);
  end if;
  v_now := clock_timestamp(); v_hash := encode(sha256(convert_to(v_normal,'UTF8')),'hex');
  if exists(select 1 from public.messaging_messages where kind='platform_broadcast' and created_at>v_now-interval '10 minutes') then
    raise exception 'messaging_cooldown' using errcode='P0001';
  end if;
  if (select count(*) from public.messaging_messages where kind='platform_broadcast' and created_at>v_now-interval '24 hours')>=5 then
    raise exception 'messaging_quota' using errcode='P0001';
  end if;
  if exists(select 1 from public.messaging_messages where kind='platform_broadcast' and created_at>v_now-interval '24 hours' and body_hash=v_hash) then
    raise exception 'messaging_duplicate' using errcode='P0001';
  end if;
  -- One READ COMMITTED statement snapshot for account/profile/consent eligibility.
  -- No all-member FOR SHARE locks. FK checks still protect account existence.
  select array(select a.id from public.user_accounts a where a.id<>v_actor
    and private.messaging_account_available(a.id) order by a.id limit 10001) into v_ids;
  v_count := cardinality(v_ids);
  if v_count not between 1 and 10000 then raise exception 'messaging_broadcast_audience' using errcode='P0001'; end if;
  insert into public.messaging_messages(kind,sender_user_id,body,body_hash,recipient_key,request_id,request_fingerprint,first_contact,created_at,broadcast_recipient_count)
    values('platform_broadcast',v_actor,v_body,v_hash,'platform',p_request_id,v_fingerprint,false,v_now,v_count) returning id into v_id;
  insert into public.messaging_recipients(message_id,recipient_user_id,received_at)
    select v_id,recipient,v_now from unnest(v_ids) recipient;
  insert into public.audit_logs(actor_id,actor_type,action,target_type,target_id,after_summary)
    values(v_actor,'operator','messaging.broadcast.send','messaging_message',v_id::text,
      jsonb_build_object('audience','platform','recipient_count',v_count,'created_at',v_now,'result','sent'));
  return jsonb_build_object('id',v_id,'created_at',v_now,'recipient_count',v_count);
end;
$$;

create function public.list_platform_broadcasts(p_limit integer default 20,p_cursor_at timestamptz default null,p_cursor_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid := private.messaging_assert_broadcaster(); v_rows jsonb; v_more boolean;
begin
  perform private.messaging_validate_page(p_limit,p_cursor_at,p_cursor_id);
  with page as (select m.* from public.messaging_messages m where m.kind='platform_broadcast' and m.sender_user_id=v_actor
    and (p_cursor_at is null or (m.created_at,m.id)<(p_cursor_at,p_cursor_id)) order by m.created_at desc,m.id desc limit p_limit+1),
  numbered as (select *,row_number() over(order by created_at desc,id desc) n from page)
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'at',created_at,'preview',left(body,100),'recipient_count',broadcast_recipient_count)
    order by created_at desc,id desc) filter(where n<=p_limit),'[]'::jsonb),count(*)>p_limit into v_rows,v_more from numbered;
  return jsonb_build_object('items',v_rows,'has_more',v_more,'next_cursor',case when v_more then
    jsonb_build_object('at',v_rows->(p_limit-1)->>'at','id',v_rows->(p_limit-1)->>'id') else null end);
end;
$$;
create function public.get_platform_broadcast(p_message_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid := private.messaging_assert_broadcaster(); v_m public.messaging_messages%rowtype;
begin
  select * into v_m from public.messaging_messages where id=p_message_id and kind='platform_broadcast' and sender_user_id=v_actor;
  if not found then raise exception 'messaging_not_found' using errcode='P0002'; end if;
  return jsonb_build_object('id',v_m.id,'body',v_m.body,'created_at',v_m.created_at,
    'sender_display','PUL 운영자 (나)','recipient_count',v_m.broadcast_recipient_count);
end;
$$;

-- A bulk statement validates the snapshot count once per broadcast, not N times.
-- The existing deferred row triggers still enforce direct exactly-one at commit.
create function private.messaging_check_broadcast_batch()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from (select distinct message_id from new_receipts) n
    join public.messaging_messages m on m.id=n.message_id where m.kind='platform_broadcast'
      and m.broadcast_recipient_count<>(select count(*) from public.messaging_recipients r where r.message_id=m.id)) then
    raise exception 'messaging_delivery_invariant' using errcode='23514';
  end if;
  return null;
end;
$$;
create trigger messaging_broadcast_batch_check after insert on public.messaging_recipients
  referencing new table as new_receipts for each statement execute function private.messaging_check_broadcast_batch();

alter function private.set_messaging_broadcast_grant(uuid,uuid,boolean) owner to postgres;
alter function private.messaging_assert_broadcaster(boolean) owner to postgres;
alter function private.messaging_check_broadcast_batch() owner to postgres;
alter function public.preview_platform_broadcast() owner to postgres;
alter function public.send_platform_broadcast(text,uuid) owner to postgres;
alter function public.list_platform_broadcasts(integer,timestamptz,uuid) owner to postgres;
alter function public.get_platform_broadcast(uuid) owner to postgres;
revoke all on function private.set_messaging_broadcast_grant(uuid,uuid,boolean),private.messaging_assert_broadcaster(boolean),
  private.messaging_check_broadcast_batch(),public.preview_platform_broadcast(),public.send_platform_broadcast(text,uuid),
  public.list_platform_broadcasts(integer,timestamptz,uuid),public.get_platform_broadcast(uuid) from public,anon,authenticated,service_role;
grant execute on function public.preview_platform_broadcast(),public.send_platform_broadcast(text,uuid),
  public.list_platform_broadcasts(integer,timestamptz,uuid),public.get_platform_broadcast(uuid) to authenticated;

-- Narrow extensions required by a second kind. Public direct send/reply stay unchanged.
create or replace function private.messaging_check_delivery()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_sender uuid; v_time timestamptz; v_kind text; v_count integer;
begin
  if tg_table_name = 'messaging_messages' then v_id := new.id; else v_id := new.message_id; end if;
  select m.sender_user_id, m.created_at, m.kind, m.broadcast_recipient_count into v_sender, v_time, v_kind, v_count from public.messaging_messages m where m.id = v_id;
  if v_kind='platform_broadcast' then
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

create or replace function private.messaging_create(p_recipient_id uuid, p_reply_id uuid, p_body text, p_request_id uuid)
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
  if exists (select 1 from public.messaging_messages m where m.kind='direct' and m.sender_user_id=v_actor and m.created_at > v_now-interval '3 seconds') then
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
  if exists (select 1 from public.messaging_messages m
      where m.kind='direct' and m.sender_user_id=v_actor and m.recipient_key=v_recipient_key and m.created_at > v_now-interval '10 minutes' and m.body_hash=v_hash) then
    raise exception 'messaging_duplicate' using errcode='P0001';
  end if;
  if (select count(distinct m.recipient_key) from public.messaging_messages m
      where m.kind='direct' and m.sender_user_id=v_actor and m.created_at > v_now-interval '10 minutes' and m.body_hash=v_hash) >= 3 then
    raise exception 'messaging_duplicate' using errcode='P0001';
  end if;
  insert into public.messaging_messages(sender_user_id,body,body_hash,recipient_key,reply_to_message_id,request_id,request_fingerprint,first_contact,created_at)
    values(v_actor,v_body,v_hash,v_recipient_key,p_reply_id,p_request_id,v_fingerprint,v_first,v_now) returning id into v_id;
  insert into public.messaging_recipients(message_id,recipient_user_id,received_at) values(v_id,v_recipient,v_now);
  return pg_catalog.jsonb_build_object('id',v_id,'created_at',v_now);
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
  ), page as (select * from eligible order by sort_at desc,id desc limit p_limit+1),
  numbered as (select *,row_number() over(order by sort_at desc,id desc) as n from page)
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'counterpart_display',case when kind='platform_broadcast' then 'PUL 공지' else private.messaging_display_name(counterpart) end,
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
  if v_m.kind='platform_broadcast' then
    select r.* into v_r from public.messaging_recipients r
      where r.message_id=p_message_id and r.recipient_user_id=v_actor and r.hidden_at is null;
    if not found then raise exception 'messaging_not_found' using errcode='P0002'; end if;
    if p_mark_read then
      update public.messaging_recipients set read_at=coalesce(read_at,clock_timestamp())
        where message_id=p_message_id and recipient_user_id=v_actor and hidden_at is null returning * into v_r;
      if not found then raise exception 'messaging_not_found' using errcode='P0002'; end if;
    end if;
    return jsonb_build_object('id',v_m.id,'kind',v_m.kind,'body',v_m.body,'counterpart_user_id',null,
      'counterpart_display','PUL 공지','created_at',v_m.created_at,'reply_to_message_id',null,
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
  if not exists(select 1 from public.messaging_messages where id=p_message_id and kind='direct') then
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
    where id=p_message_id and kind='direct' and sender_user_id=v_actor;
  if not found then
    update public.messaging_recipients set hidden_at=coalesce(hidden_at,clock_timestamp())
      where message_id=p_message_id and recipient_user_id=v_actor;
    if not found then raise exception 'messaging_not_found' using errcode='P0002'; end if;
  end if;
  return jsonb_build_object('id',p_message_id,'hidden',true);
end;
$$;
