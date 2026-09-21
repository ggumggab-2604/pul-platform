-- PUL Common Messaging 1B. RPC-only, direct messages, no UI/market/broadcast.
-- Apply this whole file in one transaction. Existing domain functions are untouched.

create table public.messaging_messages (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'direct' check (kind = 'direct'),
  sender_user_id uuid references public.user_accounts(id) on delete set null,
  body text not null check (char_length(body) between 1 and 2000),
  body_hash text not null,
  -- Internal hash of the original direct recipient ID, never in DTOs. Keeps
  -- replay/quota history valid after that account's receipt is cascade-deleted.
  recipient_key text not null,
  reply_to_message_id uuid references public.messaging_messages(id) on delete set null,
  sender_hidden_at timestamptz,
  request_id uuid not null,
  request_fingerprint text not null,
  first_contact boolean not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (sender_user_id, request_id)
);
create table public.messaging_recipients (
  message_id uuid not null references public.messaging_messages(id) on delete cascade,
  recipient_user_id uuid not null references public.user_accounts(id) on delete cascade,
  received_at timestamptz not null,
  read_at timestamptz,
  hidden_at timestamptz,
  primary key (message_id, recipient_user_id)
);
create table public.messaging_blocks (
  blocker_user_id uuid not null references public.user_accounts(id) on delete cascade,
  blocked_user_id uuid not null references public.user_accounts(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  primary key (blocker_user_id, blocked_user_id),
  check (blocker_user_id <> blocked_user_id)
);
create table public.messaging_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messaging_messages(id) on delete restrict,
  reporter_user_id uuid references public.user_accounts(id) on delete set null,
  reason text not null check (reason in ('spam','harassment','inappropriate','fraud','other')),
  detail text not null default '' check (char_length(detail) <= 1000),
  status text not null default 'open' check (status in ('open','resolved')),
  resolved_by uuid references public.user_accounts(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  check ((status = 'open' and resolved_at is null and resolved_by is null)
    or (status = 'resolved' and resolved_at is not null))
);
create index messaging_sender_recent_idx on public.messaging_messages(sender_user_id, created_at desc, id desc);
create index messaging_sender_recipient_idx on public.messaging_messages(sender_user_id, recipient_key, created_at desc);
create index messaging_reply_idx on public.messaging_messages(reply_to_message_id) where reply_to_message_id is not null;
-- Includes hidden rows: lifetime contact lookup and account FK checks need them too.
create index messaging_recipient_history_idx on public.messaging_recipients(recipient_user_id, received_at desc, message_id desc);
create index messaging_unread_idx on public.messaging_recipients(recipient_user_id) where read_at is null and hidden_at is null;
create index messaging_blocked_idx on public.messaging_blocks(blocked_user_id);
create unique index messaging_report_open_uidx on public.messaging_reports(reporter_user_id, message_id) where status = 'open';
create index messaging_report_status_idx on public.messaging_reports(status, created_at desc, id desc);
create index messaging_report_recent_idx on public.messaging_reports(reporter_user_id, created_at desc);
create index messaging_report_message_idx on public.messaging_reports(message_id);
create index messaging_report_resolver_idx on public.messaging_reports(resolved_by) where resolved_by is not null;

alter table public.messaging_messages enable row level security;
alter table public.messaging_messages force row level security;
alter table public.messaging_recipients enable row level security;
alter table public.messaging_recipients force row level security;
alter table public.messaging_blocks enable row level security;
alter table public.messaging_blocks force row level security;
alter table public.messaging_reports enable row level security;
alter table public.messaging_reports force row level security;
revoke all on public.messaging_messages, public.messaging_recipients,
  public.messaging_blocks, public.messaging_reports from public, anon, authenticated, service_role;

insert into public.platform_permission_definitions(code, description)
values ('messaging.reports.manage', 'Review and resolve only explicitly reported private messages.');
insert into public.platform_role_permissions(platform_role, permission_code)
values ('platform_admin', 'messaging.reports.manage');

-- Matches finalizeAuth and the existing consent_records type/version constraint.
-- No profile directory or user-supplied identity is exposed by this helper.
create function private.messaging_account_available(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_accounts a join public.user_profiles p on p.user_id = a.id
    where a.id = p_user_id and a.account_status = 'active'
      and exists (select 1 from public.consent_records c where c.user_id = a.id
        and c.consent_type = 'terms_required' and c.consent_version = 'terms-dev-v1' and c.decision = 'granted')
      and exists (select 1 from public.consent_records c where c.user_id = a.id
        and c.consent_type = 'privacy_required' and c.consent_version = 'privacy-dev-v1' and c.decision = 'granted')
  );
$$;
create function private.messaging_assert_actor()
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'messaging_login' using errcode = '42501'; end if;
  if not private.messaging_account_available(v_actor) then
    raise exception 'messaging_account_unavailable' using errcode = '42501';
  end if;
  return v_actor;
end;
$$;
create function private.messaging_assert_read_committed()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'messaging_retry_transaction' using errcode = '40001';
  end if;
end;
$$;
create function private.messaging_trim(p_text text)
returns text language sql immutable set search_path = '' as $$
  select pg_catalog.btrim(p_text, E' \t\n\r\f\v' || U&'\0085\00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff');
$$;
create function private.messaging_normalize(p_text text)
returns text language sql immutable set search_path = '' as $$
  select pg_catalog.regexp_replace(private.messaging_trim(p_text),
    U&'[[:space:]\0085\00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff]+', ' ', 'g');
$$;
create function private.messaging_display_name(p_user_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case when a.id is null or a.account_status = 'withdrawn' then '탈퇴한 회원'
    else private.community_actor_display_name(a.id, auth.uid()) end
  from (select 1) s left join public.user_accounts a on a.id = p_user_id;
$$;
-- Two-int advisory namespaces do not overlap existing bigint SEC-01 locks.
-- Send/reply: sender (1297303345), then pair (1297303346). Block only takes pair.
-- Report submission has its own reporter namespace (1297303347).
create function private.messaging_lock_pair(p_a uuid, p_b uuid)
returns void language sql volatile security definer set search_path = '' as $$
  select pg_catalog.pg_advisory_xact_lock(1297303346,
    pg_catalog.hashtext(least(p_a,p_b)::text || ':' || greatest(p_a,p_b)::text));
$$;

-- Enforce one recipient at creation, after both atomic inserts. Later account deletion
-- may remove that account's receipt; it must not remove the other person's message.
create function private.messaging_check_delivery()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_sender uuid; v_time timestamptz;
begin
  if tg_table_name = 'messaging_messages' then v_id := new.id; else v_id := new.message_id; end if;
  select m.sender_user_id, m.created_at into v_sender, v_time from public.messaging_messages m where m.id = v_id;
  if (select count(*) from public.messaging_recipients r where r.message_id = v_id) <> 1
    or exists (select 1 from public.messaging_recipients r where r.message_id = v_id
      and (r.recipient_user_id = v_sender or r.received_at <> v_time)) then
    raise exception 'messaging_delivery_invariant' using errcode = '23514';
  end if;
  return null;
end;
$$;
create constraint trigger messaging_message_delivery_check after insert on public.messaging_messages
  deferrable initially deferred for each row execute function private.messaging_check_delivery();
create constraint trigger messaging_recipient_delivery_check after insert on public.messaging_recipients
  deferrable initially deferred for each row execute function private.messaging_check_delivery();

create function private.messaging_create(p_recipient_id uuid, p_reply_id uuid, p_body text, p_request_id uuid)
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
  if exists (select 1 from public.messaging_messages m where m.sender_user_id=v_actor and m.created_at > v_now-interval '3 seconds') then
    raise exception 'messaging_cooldown' using errcode='P0001';
  end if;
  select count(*) filter(where m.created_at > v_now-interval '10 minutes'), count(*),
    count(*) filter(where m.first_contact and m.created_at > v_now-interval '10 minutes'), count(*) filter(where m.first_contact)
    into v_recent,v_day,v_new_recent,v_new_day
    from public.messaging_messages m where m.sender_user_id=v_actor and m.created_at > v_now-interval '24 hours';
  if v_recent >= 20 or v_day >= 100 then raise exception 'messaging_quota' using errcode='P0001'; end if;
  select not exists (select 1 from public.messaging_messages m
    where m.sender_user_id=v_actor and m.recipient_key=v_recipient_key) into v_first;
  if v_first and (v_new_recent >= 5 or v_new_day >= 20) then raise exception 'messaging_new_recipient_quota' using errcode='P0001'; end if;
  if (select count(*) from public.messaging_messages m
      where m.sender_user_id=v_actor and m.recipient_key=v_recipient_key and m.created_at > v_now-interval '10 minutes') >= 10 then
    raise exception 'messaging_recipient_quota' using errcode='P0001';
  end if;
  if exists (select 1 from public.messaging_messages m
      where m.sender_user_id=v_actor and m.recipient_key=v_recipient_key and m.created_at > v_now-interval '10 minutes' and m.body_hash=v_hash) then
    raise exception 'messaging_duplicate' using errcode='P0001';
  end if;
  if (select count(distinct m.recipient_key) from public.messaging_messages m
      where m.sender_user_id=v_actor and m.created_at > v_now-interval '10 minutes' and m.body_hash=v_hash) >= 3 then
    raise exception 'messaging_duplicate' using errcode='P0001';
  end if;
  insert into public.messaging_messages(sender_user_id,body,body_hash,recipient_key,reply_to_message_id,request_id,request_fingerprint,first_contact,created_at)
    values(v_actor,v_body,v_hash,v_recipient_key,p_reply_id,p_request_id,v_fingerprint,v_first,v_now) returning id into v_id;
  insert into public.messaging_recipients(message_id,recipient_user_id,received_at) values(v_id,v_recipient,v_now);
  return pg_catalog.jsonb_build_object('id',v_id,'created_at',v_now);
end;
$$;
create function public.send_messaging_message(p_recipient_id uuid,p_body text,p_request_id uuid)
returns jsonb language sql volatile security definer set search_path = '' as $$
  select private.messaging_create(p_recipient_id,null,p_body,p_request_id);
$$;
create function public.reply_messaging_message(p_message_id uuid,p_body text,p_request_id uuid)
returns jsonb language sql volatile security definer set search_path = '' as $$
  select private.messaging_create(null,p_message_id,p_body,p_request_id);
$$;

create function private.messaging_validate_page(p_limit integer,p_cursor_at timestamptz,p_cursor_id uuid)
returns void language plpgsql set search_path = '' as $$
begin
  if p_limit is null or p_limit not between 1 and 50 or (p_cursor_at is null) <> (p_cursor_id is null)
    or (p_cursor_at is not null and not pg_catalog.isfinite(p_cursor_at)) then
    raise exception 'messaging_invalid' using errcode='22023';
  end if;
end;
$$;
create function private.messaging_list(p_box text,p_limit integer,p_cursor_at timestamptz,p_cursor_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.messaging_assert_actor(); v_rows jsonb; v_more boolean;
begin
  perform private.messaging_validate_page(p_limit,p_cursor_at,p_cursor_id);
  with eligible as (
    select m.id, m.body, m.reply_to_message_id, m.sender_user_id as counterpart,
      r.received_at as sort_at, r.read_at
    from public.messaging_recipients r join public.messaging_messages m on m.id=r.message_id
    where p_box='inbox' and r.recipient_user_id=v_actor and r.hidden_at is null
      and (p_cursor_at is null or (r.received_at,r.message_id)<(p_cursor_at,p_cursor_id))
    union all
    select m.id, m.body, m.reply_to_message_id, r.recipient_user_id, m.created_at, null::timestamptz
    from public.messaging_messages m left join public.messaging_recipients r on r.message_id=m.id
    where p_box='sent' and m.sender_user_id=v_actor and m.sender_hidden_at is null
      and (p_cursor_at is null or (m.created_at,m.id)<(p_cursor_at,p_cursor_id))
  ), page as (select * from eligible order by sort_at desc,id desc limit p_limit+1),
  numbered as (select *,row_number() over(order by sort_at desc,id desc) as n from page)
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'counterpart_display',private.messaging_display_name(counterpart),
    'preview',left(body,100),'at',sort_at,'read_at',read_at,'is_reply',reply_to_message_id is not null)
    order by sort_at desc,id desc) filter(where n<=p_limit),'[]'::jsonb), count(*)>p_limit
    into v_rows,v_more from numbered;
  return jsonb_build_object('items',v_rows,'has_more',v_more,'next_cursor',case when v_more then
    jsonb_build_object('at',v_rows->(p_limit-1)->>'at','id',v_rows->(p_limit-1)->>'id') else null end);
end;
$$;
create function public.list_messaging_inbox(p_limit integer default 20,p_cursor_at timestamptz default null,p_cursor_id uuid default null)
returns jsonb language sql volatile security definer set search_path = '' as $$
  select private.messaging_list('inbox',p_limit,p_cursor_at,p_cursor_id);
$$;
create function public.list_messaging_sent(p_limit integer default 20,p_cursor_at timestamptz default null,p_cursor_id uuid default null)
returns jsonb language sql volatile security definer set search_path = '' as $$
  select private.messaging_list('sent',p_limit,p_cursor_at,p_cursor_id);
$$;

-- Detail is read-only by default, including prefetch. UI's explicit open sends
-- p_mark_read=true; sender detail never marks the recipient's receipt.
create function public.get_messaging_message(p_message_id uuid,p_mark_read boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.messaging_assert_actor(); v_m public.messaging_messages%rowtype;
  v_r public.messaging_recipients%rowtype; v_is_recipient boolean; v_counterpart uuid;
begin
  if p_mark_read is null then raise exception 'messaging_invalid' using errcode='22023'; end if;
  select m.* into v_m from public.messaging_messages m where m.id=p_message_id;
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
  return jsonb_build_object('id',v_m.id,'body',v_m.body,'counterpart_user_id',v_counterpart,'counterpart_display',private.messaging_display_name(v_counterpart),
    'created_at',v_m.created_at,'reply_to_message_id',v_m.reply_to_message_id,'is_recipient',v_is_recipient,
    'read_at',case when v_is_recipient then v_r.read_at else null end);
end;
$$;
create function public.mark_messaging_message_read(p_message_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.messaging_assert_actor(); v_time timestamptz;
begin
  update public.messaging_recipients set read_at=coalesce(read_at,clock_timestamp())
    where message_id=p_message_id and recipient_user_id=v_actor and hidden_at is null returning read_at into v_time;
  if not found then raise exception 'messaging_not_found' using errcode='P0002'; end if;
  return jsonb_build_object('id',p_message_id,'read_at',v_time);
end;
$$;
create function public.hide_messaging_message(p_message_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.messaging_assert_actor();
begin
  update public.messaging_messages set sender_hidden_at=coalesce(sender_hidden_at,clock_timestamp())
    where id=p_message_id and sender_user_id=v_actor;
  if not found then
    update public.messaging_recipients set hidden_at=coalesce(hidden_at,clock_timestamp())
      where message_id=p_message_id and recipient_user_id=v_actor;
    if not found then raise exception 'messaging_not_found' using errcode='P0002'; end if;
  end if;
  return jsonb_build_object('id',p_message_id,'hidden',true);
end;
$$;
create function public.get_messaging_unread_count()
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.messaging_assert_actor();
begin
  return (select count(*) from public.messaging_recipients where recipient_user_id=v_actor and hidden_at is null and read_at is null);
end;
$$;
create function public.set_messaging_block(p_user_id uuid,p_blocked boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.messaging_assert_actor();
begin
  perform private.messaging_assert_read_committed();
  if p_user_id is null or p_user_id=v_actor or p_blocked is null then raise exception 'messaging_invalid' using errcode='22023'; end if;
  perform private.messaging_lock_pair(v_actor,p_user_id);
  perform private.messaging_assert_actor();
  if not exists(select 1 from public.user_accounts where id=p_user_id) then
    raise exception 'messaging_recipient_unavailable' using errcode='P0002';
  end if;
  if p_blocked then
    insert into public.messaging_blocks(blocker_user_id,blocked_user_id) values(v_actor,p_user_id) on conflict do nothing;
  else delete from public.messaging_blocks where blocker_user_id=v_actor and blocked_user_id=p_user_id; end if;
  return jsonb_build_object('blocked',p_blocked);
end;
$$;

create function public.submit_messaging_report(p_message_id uuid,p_reason text,p_detail text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.messaging_assert_actor(); v_id uuid; v_detail text := private.messaging_trim(coalesce(p_detail,''));
begin
  perform private.messaging_assert_read_committed();
  if p_reason is null or p_reason not in ('spam','harassment','inappropriate','fraud','other') or char_length(v_detail)>1000 then
    raise exception 'messaging_invalid' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(1297303347,pg_catalog.hashtext(v_actor::text));
  perform private.messaging_assert_actor();
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
create function private.messaging_assert_report_manager()
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.messaging_assert_actor();
begin
  if not public.current_user_has_platform_permission('messaging.reports.manage') then
    raise exception 'messaging_permission' using errcode='42501';
  end if;
  return v_actor;
end;
$$;
-- The list intentionally has no message body/detail. Sensitive evidence is opened
-- through the single-report detail entry and that access is audited.
create function public.list_messaging_reports(p_status text default 'open',p_limit integer default 20,
  p_cursor_at timestamptz default null,p_cursor_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.messaging_assert_report_manager(); v_rows jsonb; v_more boolean;
begin
  perform private.messaging_validate_page(p_limit,p_cursor_at,p_cursor_id);
  if p_status is null or p_status not in ('open','resolved') then raise exception 'messaging_invalid' using errcode='22023'; end if;
  with page as (select r.* from public.messaging_reports r where r.status=p_status
    and (p_cursor_at is null or (r.created_at,r.id)<(p_cursor_at,p_cursor_id)) order by r.created_at desc,r.id desc limit p_limit+1),
  numbered as (select *,row_number() over(order by created_at desc,id desc) as n from page)
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'reason',reason,'status',status,'at',created_at)
    order by created_at desc,id desc) filter(where n<=p_limit),'[]'::jsonb),count(*)>p_limit into v_rows,v_more from numbered;
  return jsonb_build_object('items',v_rows,'has_more',v_more,'next_cursor',case when v_more then
    jsonb_build_object('at',v_rows->(p_limit-1)->>'at','id',v_rows->(p_limit-1)->>'id') else null end);
end;
$$;
create function public.get_messaging_report(p_report_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.messaging_assert_report_manager(); v_r public.messaging_reports%rowtype; v_m public.messaging_messages%rowtype;
begin
  select * into v_r from public.messaging_reports where id=p_report_id;
  if not found then raise exception 'messaging_not_found' using errcode='P0002'; end if;
  select * into v_m from public.messaging_messages where id=v_r.message_id;
  insert into public.audit_logs(actor_id,actor_type,action,target_type,target_id)
    values(v_actor,'operator','messaging.report.view','messaging_report',p_report_id::text);
  return jsonb_build_object('id',v_r.id,'message_id',v_m.id,'body',v_m.body,
    'sender_display',private.messaging_display_name(v_m.sender_user_id),'reporter_display',private.messaging_display_name(v_r.reporter_user_id),
    'reason',v_r.reason,'detail',v_r.detail,'status',v_r.status,'created_at',v_r.created_at,'message_created_at',v_m.created_at,'resolved_at',v_r.resolved_at);
end;
$$;
create function public.resolve_messaging_report(p_report_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.messaging_assert_report_manager(); v_r public.messaging_reports%rowtype;
begin
  select * into v_r from public.messaging_reports where id=p_report_id for update;
  if not found then raise exception 'messaging_not_found' using errcode='P0002'; end if;
  perform private.messaging_assert_report_manager();
  if v_r.status='open' then
    update public.messaging_reports set status='resolved',resolved_at=clock_timestamp(),resolved_by=v_actor where id=p_report_id;
    insert into public.audit_logs(actor_id,actor_type,action,target_type,target_id,before_summary,after_summary)
      values(v_actor,'operator','messaging.report.resolve','messaging_report',p_report_id::text,'{"status":"open"}','{"status":"resolved"}');
  end if;
  return jsonb_build_object('id',p_report_id,'status','resolved');
end;
$$;

-- Explicit ACLs for every new function, including invoker-only helpers/trigger.
revoke all on function private.messaging_account_available(uuid), private.messaging_assert_actor(),
  private.messaging_assert_read_committed(), private.messaging_trim(text), private.messaging_normalize(text),
  private.messaging_display_name(uuid), private.messaging_lock_pair(uuid,uuid), private.messaging_check_delivery(),
  private.messaging_create(uuid,uuid,text,uuid), private.messaging_validate_page(integer,timestamptz,uuid),
  private.messaging_list(text,integer,timestamptz,uuid), private.messaging_assert_report_manager()
  from public, anon, authenticated, service_role;
revoke all on function public.send_messaging_message(uuid,text,uuid), public.reply_messaging_message(uuid,text,uuid),
  public.list_messaging_inbox(integer,timestamptz,uuid), public.list_messaging_sent(integer,timestamptz,uuid),
  public.get_messaging_message(uuid,boolean), public.mark_messaging_message_read(uuid), public.hide_messaging_message(uuid),
  public.get_messaging_unread_count(), public.set_messaging_block(uuid,boolean), public.submit_messaging_report(uuid,text,text),
  public.list_messaging_reports(text,integer,timestamptz,uuid), public.get_messaging_report(uuid), public.resolve_messaging_report(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.send_messaging_message(uuid,text,uuid), public.reply_messaging_message(uuid,text,uuid),
  public.list_messaging_inbox(integer,timestamptz,uuid), public.list_messaging_sent(integer,timestamptz,uuid),
  public.get_messaging_message(uuid,boolean), public.mark_messaging_message_read(uuid), public.hide_messaging_message(uuid),
  public.get_messaging_unread_count(), public.set_messaging_block(uuid,boolean), public.submit_messaging_report(uuid,text,text),
  public.list_messaging_reports(text,integer,timestamptz,uuid), public.get_messaging_report(uuid), public.resolve_messaging_report(uuid)
  to authenticated;
