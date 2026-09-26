-- Messaging 1F-A candidate. Apply the entire file in one transaction.
-- No operational grants, messages or changes to platform broadcast entry points.
insert into public.club_permission_definitions(permission_code,display_name,description,permission_group)
values ('club.messages.broadcast','동호회 회원공지','현재 동호회 회원에게 공지 발송 및 운영진 발송 기록 조회','messaging');
insert into public.club_role_permissions(role_code,permission_code)
select r.role_code,'club.messages.broadcast' from public.club_role_definitions r
where r.role_code in ('club_admin','club_vice_admin','club_manager');

alter table public.messaging_messages drop constraint messaging_messages_kind_check;
alter table public.messaging_messages add constraint messaging_messages_kind_check
  check (kind in ('direct','platform_broadcast','club_broadcast'));
alter table public.messaging_messages drop constraint messaging_broadcast_shape_check;
alter table public.messaging_messages add constraint messaging_broadcast_shape_check check (
  (kind='direct' and broadcast_recipient_count is null) or
  (kind in ('platform_broadcast','club_broadcast') and broadcast_recipient_count between 1 and 10000
   and broadcast_recipient_count is not null and reply_to_message_id is null and not first_contact)
);
create table public.messaging_club_broadcast_contexts (
  message_id uuid primary key references public.messaging_messages(id) on delete cascade,
  club_id uuid references public.clubs(id) on delete set null
);
create index messaging_club_broadcast_club_idx on public.messaging_club_broadcast_contexts(club_id,message_id)
  where club_id is not null;
alter table public.messaging_club_broadcast_contexts owner to postgres;
alter table public.messaging_club_broadcast_contexts enable row level security;
alter table public.messaging_club_broadcast_contexts force row level security;
revoke all on public.messaging_club_broadcast_contexts from public,anon,authenticated,service_role;

create function private.messaging_assert_club_broadcaster(p_club_id uuid,p_lock boolean default false)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_actor uuid := private.messaging_assert_actor();
begin
  if p_lock then
    -- Canonical role/membership mutations take the club lock before actor rows.
    -- SHARE also conflicts with raw status updates; no audience rows are locked.
    perform c.id from public.clubs c where c.id=p_club_id for share;
    perform a.id from public.user_accounts a where a.id=v_actor for share;
    perform m.id from public.club_memberships m where m.club_id=p_club_id and m.user_id=v_actor for share;
    perform a.id from public.club_role_assignments a join public.club_memberships m on m.id=a.membership_id
      where m.club_id=p_club_id and m.user_id=v_actor and a.revoked_at is null order by a.id for share of a;
    perform d.role_code from public.club_role_definitions d where exists (
      select 1 from public.club_role_assignments a join public.club_memberships m on m.id=a.membership_id
      where m.club_id=p_club_id and m.user_id=v_actor and a.revoked_at is null and a.role_code=d.role_code)
      order by d.role_code for share;
    perform p.permission_code from public.club_permission_definitions p
      where p.permission_code='club.messages.broadcast' for share;
    perform r.role_code from public.club_role_permissions r where r.permission_code='club.messages.broadcast'
      and exists(select 1 from public.club_role_assignments a join public.club_memberships m on m.id=a.membership_id
        where m.club_id=p_club_id and m.user_id=v_actor and a.revoked_at is null and a.role_code=r.role_code)
      order by r.role_code for share;
  end if;
  -- A separate READ COMMITTED statement after every lock sees winning revocations.
  perform private.messaging_assert_actor();
  if not private.club_user_has_permission(v_actor,p_club_id,'club.messages.broadcast') then
    raise exception 'messaging_permission' using errcode='42501';
  end if;
  return v_actor;
end;
$$;

create function public.preview_club_broadcast(p_club_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid := private.messaging_assert_club_broadcaster(p_club_id); v_count integer;
begin
  select count(*) into v_count from (select m.user_id from public.club_memberships m
    where m.club_id=p_club_id and m.membership_status='active' and m.user_id<>v_actor
      and private.messaging_account_available(m.user_id) limit 10001) eligible;
  return jsonb_build_object('recipient_count',v_count,'maximum',10000,'can_send',v_count between 1 and 10000);
end;
$$;

create function public.send_club_broadcast(p_club_id uuid,p_body text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid := private.messaging_assert_club_broadcaster(p_club_id);
  v_previous public.messaging_messages%rowtype;
  v_body text := private.messaging_trim(p_body); v_normal text := private.messaging_normalize(p_body);
  v_fingerprint text; v_hash text; v_ids uuid[]; v_count integer; v_id uuid; v_now timestamptz;
begin
  perform private.messaging_assert_read_committed();
  if p_request_id is null or v_body is null or char_length(v_body) not between 1 and 2000 then
    raise exception 'messaging_invalid' using errcode='22023';
  end if;
  -- Club quota lock is independent of the platform/global broadcast namespace.
  -- Existing sender lock serializes cross-kind request collisions.
  perform pg_advisory_xact_lock(1297303349,hashtext(p_club_id::text));
  perform pg_advisory_xact_lock(1297303345,hashtext(v_actor::text));
  perform private.messaging_assert_club_broadcaster(p_club_id,true);
  v_fingerprint := encode(sha256(convert_to(jsonb_build_array('club_broadcast',p_club_id,v_normal)::text,'UTF8')),'hex');
  select * into v_previous from public.messaging_messages where sender_user_id=v_actor and request_id=p_request_id;
  if found then
    if v_previous.kind<>'club_broadcast' or v_previous.request_fingerprint<>v_fingerprint then
      raise exception 'messaging_replay_conflict' using errcode='22023';
    end if;
    return jsonb_build_object('id',v_previous.id,'created_at',v_previous.created_at,'recipient_count',v_previous.broadcast_recipient_count);
  end if;
  v_now := clock_timestamp(); v_hash := encode(sha256(convert_to(v_normal,'UTF8')),'hex');
  if exists(select 1 from public.messaging_club_broadcast_contexts c join public.messaging_messages m on m.id=c.message_id
    where c.club_id=p_club_id and m.created_at>v_now-interval '3 minutes') then
    raise exception 'messaging_cooldown' using errcode='P0001';
  end if;
  if (select count(*) from public.messaging_club_broadcast_contexts c join public.messaging_messages m on m.id=c.message_id
    where c.club_id=p_club_id and m.created_at>v_now-interval '24 hours')>=20 then
    raise exception 'messaging_quota' using errcode='P0001';
  end if;
  if exists(select 1 from public.messaging_club_broadcast_contexts c join public.messaging_messages m on m.id=c.message_id
    where c.club_id=p_club_id and m.created_at>v_now-interval '24 hours' and m.body_hash=v_hash) then
    raise exception 'messaging_duplicate' using errcode='P0001';
  end if;
  -- Exactly one statement snapshot. Membership, account/profile/consent availability
  -- are evaluated together; replay never executes this query or backfills receipts.
  select array(select m.user_id from public.club_memberships m where m.club_id=p_club_id
    and m.membership_status='active' and m.user_id<>v_actor and private.messaging_account_available(m.user_id)
    order by m.user_id limit 10001) into v_ids;
  v_count := cardinality(v_ids);
  if v_count not between 1 and 10000 then raise exception 'messaging_broadcast_audience' using errcode='P0001'; end if;
  insert into public.messaging_messages(kind,sender_user_id,body,body_hash,recipient_key,request_id,request_fingerprint,first_contact,created_at,broadcast_recipient_count)
    values('club_broadcast',v_actor,v_body,v_hash,'club:'||p_club_id::text,p_request_id,v_fingerprint,false,v_now,v_count) returning id into v_id;
  insert into public.messaging_club_broadcast_contexts(message_id,club_id) values(v_id,p_club_id);
  insert into public.messaging_recipients(message_id,recipient_user_id,received_at) select v_id,recipient,v_now from unnest(v_ids) recipient;
  insert into public.audit_logs(actor_id,actor_type,action,target_type,target_id,after_summary)
    values(v_actor,'operator','messaging.club_broadcast.send','messaging_message',v_id::text,
      jsonb_build_object('audience','club','club_id',p_club_id,'recipient_count',v_count,'created_at',v_now,'result','sent'));
  return jsonb_build_object('id',v_id,'created_at',v_now,'recipient_count',v_count);
end;
$$;

create function public.list_club_broadcasts(p_club_id uuid,p_limit integer default 20,p_cursor_at timestamptz default null,p_cursor_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid := private.messaging_assert_club_broadcaster(p_club_id); v_rows jsonb; v_more boolean;
begin
  perform private.messaging_validate_page(p_limit,p_cursor_at,p_cursor_id);
  with page as (select m.* from public.messaging_messages m join public.messaging_club_broadcast_contexts c on c.message_id=m.id
    where c.club_id=p_club_id and m.kind='club_broadcast'
      and (p_cursor_at is null or (m.created_at,m.id)<(p_cursor_at,p_cursor_id)) order by m.created_at desc,m.id desc limit p_limit+1),
  numbered as (select *,row_number() over(order by created_at desc,id desc) n from page)
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'at',created_at,'preview',left(body,100),
    'sender_display',private.messaging_display_name(sender_user_id),'recipient_count',broadcast_recipient_count)
    order by created_at desc,id desc) filter(where n<=p_limit),'[]'::jsonb),count(*)>p_limit into v_rows,v_more from numbered;
  return jsonb_build_object('items',v_rows,'has_more',v_more,'next_cursor',case when v_more then
    jsonb_build_object('at',v_rows->(p_limit-1)->>'at','id',v_rows->(p_limit-1)->>'id') else null end);
end;
$$;
create function public.get_club_broadcast(p_club_id uuid,p_message_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid := private.messaging_assert_club_broadcaster(p_club_id); v_m public.messaging_messages%rowtype;
begin
  select m.* into v_m from public.messaging_messages m join public.messaging_club_broadcast_contexts c on c.message_id=m.id
    where c.club_id=p_club_id and m.id=p_message_id and m.kind='club_broadcast';
  if not found then raise exception 'messaging_not_found' using errcode='P0002'; end if;
  return jsonb_build_object('id',v_m.id,'body',v_m.body,'created_at',v_m.created_at,
    'sender_display',private.messaging_display_name(v_m.sender_user_id),'recipient_count',v_m.broadcast_recipient_count);
end;
$$;

create function public.get_message_club_context(p_message_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid := private.messaging_assert_actor(); v_club uuid; v_result jsonb;
begin
  perform public.get_messaging_message(p_message_id,false);
  select club_id into v_club from public.messaging_club_broadcast_contexts where message_id=p_message_id;
  if not found then return null; end if;
  if private.club_user_has_permission(v_actor,v_club,'club.profile.read') then
    select jsonb_build_object('available',true,'name',left(c.name,100),'public_key',c.legacy_key)
      into v_result from public.clubs c where c.id=v_club and c.club_status='active'
        and c.directory_is_public and c.legacy_key ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$';
  end if;
  return coalesce(v_result,jsonb_build_object('available',false));
end;
$$;

-- Context tombstones survive club deletion; originals/receipts are independent.
-- The deferred check permits message/context insertion order, rejects missing,
-- wrongly typed, mixed market+club contexts and deletion of a live context.
create function private.messaging_check_club_context()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_kind text; v_has boolean;
begin
  if tg_table_name='messaging_messages' then v_id:=new.id;
  elsif tg_op='DELETE' then v_id:=old.message_id; else v_id:=new.message_id; end if;
  select kind into v_kind from public.messaging_messages where id=v_id;
  if not found then return null; end if;
  select exists(select 1 from public.messaging_club_broadcast_contexts where message_id=v_id) into v_has;
  if (v_kind='club_broadcast')<>v_has or (v_kind='club_broadcast' and exists(
    select 1 from public.messaging_market_contexts where message_id=v_id)) then
    raise exception 'messaging_context_invariant' using errcode='23514';
  end if;
  if tg_op='UPDATE' and tg_table_name<>'messaging_messages' then
    if old.message_id<>new.message_id then
      raise exception 'messaging_context_invariant' using errcode='23514';
    end if;
  end if;
  return null;
end;
$$;
create constraint trigger messaging_club_message_context_check after insert or update on public.messaging_messages
  deferrable initially deferred for each row execute function private.messaging_check_club_context();
create constraint trigger messaging_club_context_check after insert or update or delete on public.messaging_club_broadcast_contexts
  deferrable initially deferred for each row execute function private.messaging_check_club_context();
create constraint trigger messaging_market_club_context_check after insert or update on public.messaging_market_contexts
  deferrable initially deferred for each row execute function private.messaging_check_club_context();

alter function private.messaging_assert_club_broadcaster(uuid,boolean) owner to postgres;
alter function private.messaging_check_club_context() owner to postgres;
alter function public.preview_club_broadcast(uuid) owner to postgres;
alter function public.send_club_broadcast(uuid,text,uuid) owner to postgres;
alter function public.list_club_broadcasts(uuid,integer,timestamptz,uuid) owner to postgres;
alter function public.get_club_broadcast(uuid,uuid) owner to postgres;
alter function public.get_message_club_context(uuid) owner to postgres;
revoke all on function private.messaging_assert_club_broadcaster(uuid,boolean),private.messaging_check_club_context(),
  public.preview_club_broadcast(uuid),public.send_club_broadcast(uuid,text,uuid),
  public.list_club_broadcasts(uuid,integer,timestamptz,uuid),public.get_club_broadcast(uuid,uuid),public.get_message_club_context(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.preview_club_broadcast(uuid),public.send_club_broadcast(uuid,text,uuid),
  public.list_club_broadcasts(uuid,integer,timestamptz,uuid),public.get_club_broadcast(uuid,uuid),public.get_message_club_context(uuid)
  to authenticated;

-- Existing mailbox/delivery/report contracts: five narrow kind extensions only.
create or replace function private.messaging_check_broadcast_batch()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from (select distinct message_id from new_receipts) n
    join public.messaging_messages m on m.id=n.message_id where m.kind in ('platform_broadcast','club_broadcast')
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
  if v_kind in ('platform_broadcast','club_broadcast') then
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
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'counterpart_display',case when kind='platform_broadcast' then 'PUL 공지' when kind='club_broadcast' then '동호회 공지' else private.messaging_display_name(counterpart) end,
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
  if v_m.kind in ('platform_broadcast','club_broadcast') then
    select r.* into v_r from public.messaging_recipients r
      where r.message_id=p_message_id and r.recipient_user_id=v_actor and r.hidden_at is null;
    if not found then raise exception 'messaging_not_found' using errcode='P0002'; end if;
    if p_mark_read then
      update public.messaging_recipients set read_at=coalesce(read_at,clock_timestamp())
        where message_id=p_message_id and recipient_user_id=v_actor and hidden_at is null returning * into v_r;
      if not found then raise exception 'messaging_not_found' using errcode='P0002'; end if;
    end if;
    return jsonb_build_object('id',v_m.id,'kind',v_m.kind,'body',v_m.body,'counterpart_user_id',null,
      'counterpart_display',case when v_m.kind='club_broadcast' then '동호회 공지' else 'PUL 공지' end,'created_at',v_m.created_at,'reply_to_message_id',null,
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
  if not exists(select 1 from public.messaging_messages where id=p_message_id and kind in ('direct','club_broadcast')) then
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
