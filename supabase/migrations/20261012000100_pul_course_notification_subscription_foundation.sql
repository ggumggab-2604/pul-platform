-- 1F-B2 local candidate. Operational notices only, NOT marketing consent.
-- No seeds, message kinds, audience resolver, send function, or existing RPC changes.
create table public.course_notification_subscriptions (
  course_id uuid not null references public.courses(id) on delete cascade,
  user_id uuid not null references public.user_accounts(id) on delete cascade,
  first_subscribed_at timestamptz not null default clock_timestamp(),
  subscribed_at timestamptz not null default clock_timestamp(),
  unsubscribed_at timestamptz,
  primary key(course_id,user_id),
  check (subscribed_at >= first_subscribed_at),
  check (unsubscribed_at is null or unsubscribed_at >= subscribed_at)
);
create index course_notification_subscriptions_user_idx
  on public.course_notification_subscriptions(user_id,course_id);
create table public.course_messaging_operator_grants (
  course_id uuid not null references public.courses(id) on delete cascade,
  user_id uuid not null references public.user_accounts(id) on delete cascade,
  granted_at timestamptz not null default clock_timestamp(),
  granted_by uuid references public.user_accounts(id) on delete set null,
  revoked_at timestamptz,
  primary key(course_id,user_id),
  check (revoked_at is null or revoked_at >= granted_at)
);
create index course_messaging_operator_grants_user_idx on public.course_messaging_operator_grants(user_id);
create index course_messaging_operator_grants_processor_idx on public.course_messaging_operator_grants(granted_by)
  where granted_by is not null;
alter table public.course_notification_subscriptions owner to postgres;
alter table public.course_notification_subscriptions enable row level security;
alter table public.course_notification_subscriptions force row level security;
alter table public.course_messaging_operator_grants owner to postgres;
alter table public.course_messaging_operator_grants enable row level security;
alter table public.course_messaging_operator_grants force row level security;
revoke all on public.course_notification_subscriptions,public.course_messaging_operator_grants
  from public,anon,authenticated,service_role;

-- A known authenticated account may inspect/withdraw its own preference even
-- after suspension or consent withdrawal. Enabling additionally requires signup completion.
create function private.course_notification_actor()
returns uuid language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();
begin
  if v_actor is null or not exists(select 1 from public.user_accounts where id=v_actor) then
    raise exception 'course_notification_authentication' using errcode='42501';
  end if;
  return v_actor;
end;
$$;

create function public.get_course_notification_subscription(p_course_key text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=private.course_notification_actor(); v_course public.courses%rowtype; v_subscribed boolean;
begin
  select * into v_course from public.courses where course_key=p_course_key;
  if not found then raise exception 'course_notification_unavailable' using errcode='P0002'; end if;
  select unsubscribed_at is null into v_subscribed from public.course_notification_subscriptions
    where course_id=v_course.id and user_id=v_actor;
  if not found and (v_course.course_status<>'active' or v_course.course_type not in ('field','screen')) then
    raise exception 'course_notification_unavailable' using errcode='P0002';
  end if;
  return jsonb_build_object('course_key',v_course.course_key,'subscribed',coalesce(v_subscribed,false),
    'available',v_course.course_status='active' and v_course.course_type in ('field','screen'));
end;
$$;

create function public.set_course_notification_subscription(p_course_key text,p_enabled boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=private.course_notification_actor(); v_course public.courses%rowtype; v_now timestamptz;
begin
  perform private.messaging_assert_read_committed();
  if p_enabled is null then raise exception 'course_notification_invalid' using errcode='22023'; end if;
  -- Course/share and account/share prevent eligibility changes until commit.
  perform id from public.user_accounts where id=v_actor for share;
  select * into v_course from public.courses where course_key=p_course_key for share;
  if not found then raise exception 'course_notification_unavailable' using errcode='P0002'; end if;
  -- Serializes an absent row too. Hash collisions only serialize unrelated pairs.
  perform pg_catalog.pg_advisory_xact_lock(1297303350,pg_catalog.hashtext(v_course.id::text||':'||v_actor::text));
  if p_enabled then
    perform user_id from public.user_profiles where user_id=v_actor for share;
    perform id from public.consent_records where user_id=v_actor for share;
    if not private.messaging_account_available(v_actor) then
      raise exception 'course_notification_account_unavailable' using errcode='42501';
    end if;
    if v_course.course_status<>'active' or v_course.course_type not in ('field','screen') then
      raise exception 'course_notification_unavailable' using errcode='P0002';
    end if;
    v_now:=clock_timestamp();
    insert into public.course_notification_subscriptions(course_id,user_id,first_subscribed_at,subscribed_at)
      values(v_course.id,v_actor,v_now,v_now)
      on conflict(course_id,user_id) do update set subscribed_at=excluded.subscribed_at,unsubscribed_at=null
      where course_notification_subscriptions.unsubscribed_at is not null;
  else
    -- Withdraw remains possible when a source is inactive/removed. No tombstone on a no-op.
    update public.course_notification_subscriptions set unsubscribed_at=clock_timestamp()
      where course_id=v_course.id and user_id=v_actor and unsubscribed_at is null;
  end if;
  return jsonb_build_object('course_key',v_course.course_key,'subscribed',p_enabled,
    'available',v_course.course_status='active' and v_course.course_type in ('field','screen'));
end;
$$;

-- Bounded own-only list; unavailable names and metadata are not disclosed.
-- This keeps withdrawal reachable even when the public detail becomes a 404.
create function public.list_my_course_notification_subscriptions(p_limit integer default 20,p_after_course_key text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=private.course_notification_actor(); v_items jsonb; v_more boolean;
begin
  if p_limit is null or p_limit not between 1 and 100 or (p_after_course_key is not null and p_after_course_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$') then
    raise exception 'course_notification_invalid' using errcode='22023';
  end if;
  with page as (
    select c.course_key,c.name,c.course_type,c.course_status,
      c.course_status='active' and c.course_type in ('field','screen') as available
    from public.course_notification_subscriptions s join public.courses c on c.id=s.course_id
    where s.user_id=v_actor and s.unsubscribed_at is null
      and (p_after_course_key is null or c.course_key>p_after_course_key)
    order by c.course_key limit p_limit+1
  ), numbered as (select *,row_number() over(order by course_key) n from page)
  select coalesce(jsonb_agg(jsonb_build_object('course_key',course_key,'subscribed',true,'available',available,
    'name',case when available then name else null end,'course_type',case when available then course_type else null end)
    order by course_key) filter(where n<=p_limit),'[]'::jsonb),count(*)>p_limit into v_items,v_more from numbered;
  return jsonb_build_object('items',v_items,'next_cursor',case when v_more then v_items->(p_limit-1)->>'course_key' else null end);
end;
$$;

-- Approved human processor is explicit audit provenance, NOT browser-supplied authority.
-- Only the postgres maintenance role can execute this helper.
create function private.set_course_messaging_operator_grant(p_course_id uuid,p_user_id uuid,p_operator uuid,p_enabled boolean)
returns void language plpgsql security definer set search_path='' as $$
declare v_course public.courses%rowtype; v_changed integer;
begin
  perform private.messaging_assert_read_committed();
  if p_enabled is null or p_operator is null or p_user_id is null then
    raise exception 'course_notification_invalid' using errcode='22023';
  end if;
  perform id from public.user_accounts where id in (p_operator,p_user_id) order by id for share;
  perform user_id from public.user_profiles where user_id in (p_operator,p_user_id) order by user_id for share;
  perform id from public.consent_records where user_id in (p_operator,p_user_id) order by id for share;
  if not private.messaging_account_available(p_operator) or not exists(select 1 from public.user_accounts
    where id=p_operator and platform_role='platform_admin') then
    raise exception 'course_notification_permission' using errcode='42501';
  end if;
  select * into v_course from public.courses where id=p_course_id for share;
  if not found then raise exception 'course_notification_unavailable' using errcode='P0002'; end if;
  perform pg_catalog.pg_advisory_xact_lock(1297303351,pg_catalog.hashtext(p_course_id::text||':'||p_user_id::text));
  if p_enabled then
    if not private.messaging_account_available(p_user_id) then
      raise exception 'course_notification_account_unavailable' using errcode='42501';
    end if;
    if v_course.course_status<>'active' or v_course.course_type not in ('field','screen') then
      raise exception 'course_notification_unavailable' using errcode='P0002';
    end if;
    insert into public.course_messaging_operator_grants(course_id,user_id,granted_by)
      values(p_course_id,p_user_id,p_operator)
      on conflict(course_id,user_id) do update set granted_by=excluded.granted_by,granted_at=clock_timestamp(),revoked_at=null
      where course_messaging_operator_grants.revoked_at is not null;
  else
    update public.course_messaging_operator_grants set revoked_at=clock_timestamp()
      where course_id=p_course_id and user_id=p_user_id and revoked_at is null;
  end if;
  get diagnostics v_changed=row_count;
  if v_changed=0 then return; end if;
  insert into public.audit_logs(actor_id,actor_type,action,target_type,target_id,after_summary)
    values(p_operator,'operator','messaging.course.operator_grant','course',p_course_id::text,
      jsonb_build_object('target_user_id',p_user_id,'course_id',p_course_id,'active',p_enabled));
end;
$$;

-- Read-only authorization building block. A future send must recheck/lock at write time.
create function private.messaging_assert_course_broadcaster(p_course_id uuid)
returns uuid language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=private.messaging_assert_actor();
begin
  if not exists(select 1 from public.courses c join public.course_messaging_operator_grants g on g.course_id=c.id
    where c.id=p_course_id and c.course_status='active' and c.course_type in ('field','screen')
      and g.user_id=v_actor and g.revoked_at is null) then
    raise exception 'course_notification_permission' using errcode='42501';
  end if;
  return v_actor;
end;
$$;

alter function private.course_notification_actor() owner to postgres;
alter function public.get_course_notification_subscription(text) owner to postgres;
alter function public.set_course_notification_subscription(text,boolean) owner to postgres;
alter function public.list_my_course_notification_subscriptions(integer,text) owner to postgres;
alter function private.set_course_messaging_operator_grant(uuid,uuid,uuid,boolean) owner to postgres;
alter function private.messaging_assert_course_broadcaster(uuid) owner to postgres;
revoke all on function private.course_notification_actor(),public.get_course_notification_subscription(text),
  public.set_course_notification_subscription(text,boolean),public.list_my_course_notification_subscriptions(integer,text),
  private.set_course_messaging_operator_grant(uuid,uuid,uuid,boolean),private.messaging_assert_course_broadcaster(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_course_notification_subscription(text),public.set_course_notification_subscription(text,boolean),
  public.list_my_course_notification_subscriptions(integer,text) to authenticated;
comment on table public.course_notification_subscriptions is 'Explicit operational notice preference, not marketing consent, favorites, reservations or club membership. No broadcast in 1F-B2.';
comment on table public.course_messaging_operator_grants is 'PUL-approved per-place messaging authority; does not assert legal ownership. No initial grants.';
