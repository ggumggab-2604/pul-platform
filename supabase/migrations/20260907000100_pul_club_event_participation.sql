-- PUL 8-28: minimal official club-event participation contract.
-- Scope is intentionally limited to join, own state, leave, and participant count.

create table public.club_official_event_participations (
  event_id uuid not null
    references public.club_official_events (id) on delete cascade,
  membership_id uuid not null
    references public.club_memberships (id) on delete cascade,
  joined_at timestamptz not null default pg_catalog.now(),
  primary key (event_id, membership_id)
);

comment on table public.club_official_event_participations is
  'Minimal active-member participation rows for official club events; no approval, waitlist, or reviewer workflow.';

comment on column public.club_official_event_participations.membership_id is
  'Internal membership reference. Public RPCs never expose this identifier.';

create index club_official_event_participations_membership_idx
  on public.club_official_event_participations (membership_id, event_id);

alter table public.club_official_event_participations enable row level security;
alter table public.club_official_event_participations force row level security;

revoke all on table public.club_official_event_participations
  from public, anon, authenticated, service_role;

create function private.remove_inactive_club_event_participations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.club_official_event_participations as participation
  where participation.membership_id = new.id;

  return new;
end;
$$;

comment on function private.remove_inactive_club_event_participations() is
  'Removes event participation atomically when a membership leaves the active state.';

revoke all on function private.remove_inactive_club_event_participations()
  from public, anon, authenticated, service_role;

create trigger club_memberships_remove_event_participations_when_inactive
after update of membership_status on public.club_memberships
for each row
when (old.membership_status = 'active' and new.membership_status <> 'active')
execute function private.remove_inactive_club_event_participations();

create function public.get_club_event_participation(p_club_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_can_read_events boolean := false;
  v_can_join boolean := false;
  v_membership_id uuid;
begin
  if p_club_id is null or not exists (
    select 1
    from public.clubs as club
    where club.id = p_club_id
      and club.club_status = 'active'
  ) then
    raise exception '동호회를 찾을 수 없습니다.';
  end if;

  if v_actor_id is not null then
    v_can_read_events := private.club_user_has_permission(
      v_actor_id,
      p_club_id,
      'club.events.read'
    );
    v_can_join := private.club_user_has_permission(
      v_actor_id,
      p_club_id,
      'club.events.join'
    );

    if v_can_join then
      select membership.id
      into v_membership_id
      from public.club_memberships as membership
      where membership.club_id = p_club_id
        and membership.user_id = v_actor_id
        and membership.membership_status = 'active';
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'authentication_status', case when v_actor_id is null then 'anonymous' else 'authenticated' end,
    'can_join', v_can_join,
    'events', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'event_id', visible_event.id,
          'participant_count', visible_event.participant_count,
          'is_participating', visible_event.is_participating,
          'joined_at', visible_event.joined_at
        )
        order by visible_event.starts_at, visible_event.id
      )
      from (
        select
          event.id,
          event.starts_at,
          (
            select pg_catalog.count(*)::integer
            from public.club_official_event_participations as participation
            join public.club_memberships as membership
              on membership.id = participation.membership_id
             and membership.club_id = event.club_id
             and membership.membership_status = 'active'
            join public.user_accounts as account
              on account.id = membership.user_id
             and account.account_status = 'active'
            where participation.event_id = event.id
          ) as participant_count,
          exists (
            select 1
            from public.club_official_event_participations as participation
            where participation.event_id = event.id
              and participation.membership_id = v_membership_id
          ) as is_participating,
          (
            select participation.joined_at
            from public.club_official_event_participations as participation
            where participation.event_id = event.id
              and participation.membership_id = v_membership_id
          ) as joined_at
        from public.club_official_events as event
        where event.club_id = p_club_id
          and event.moderation_status = 'visible'
          and event.event_status <> 'draft'
          and (
            event.visibility = 'public'
            or (event.visibility = 'club_members' and v_can_read_events)
          )
        order by event.starts_at, event.id
        limit 50
      ) as visible_event
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.get_club_event_participation(uuid) is
  'Returns visible event counts plus only the current caller own participation state; no member identifiers are exposed.';

revoke all on function public.get_club_event_participation(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_club_event_participation(uuid)
  to anon, authenticated;

create function private.mutate_club_event_participation(
  p_event_id uuid,
  p_join boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_account_status text;
  v_club_id uuid;
  v_club_status text;
  v_membership_id uuid;
  v_event_status text;
  v_moderation_status text;
  v_capacity integer;
  v_participant_count integer;
  v_is_participating boolean;
begin
  if v_actor_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if p_event_id is null or p_join is null then
    raise exception '공식 일정 참가 요청 값이 올바르지 않습니다.';
  end if;

  select account.account_status
  into v_account_status
  from public.user_accounts as account
  where account.id = v_actor_id
  for share;

  if not found or v_account_status <> 'active' then
    raise exception '정상 활동 계정만 공식 일정에 참가할 수 있습니다.';
  end if;

  select event.club_id
  into v_club_id
  from public.club_official_events as event
  where event.id = p_event_id;

  if not found then
    raise exception '공식 일정을 찾을 수 없습니다.';
  end if;

  select club.club_status
  into v_club_status
  from public.clubs as club
  where club.id = v_club_id
  for share;

  if not found or v_club_status <> 'active' then
    raise exception '활동 중인 동호회의 일정만 참가할 수 있습니다.';
  end if;

  select membership.id
  into v_membership_id
  from public.club_memberships as membership
  where membership.club_id = v_club_id
    and membership.user_id = v_actor_id
    and membership.membership_status = 'active'
  for share;

  if not found or not private.club_user_has_permission(
    v_actor_id,
    v_club_id,
    'club.events.join'
  ) then
    raise exception '활동 중인 동호회 회원만 공식 일정에 참가할 수 있습니다.';
  end if;

  select
    event.event_status,
    event.moderation_status,
    event.capacity
  into
    v_event_status,
    v_moderation_status,
    v_capacity
  from public.club_official_events as event
  where event.id = p_event_id
    and event.club_id = v_club_id
  for update;

  if not found then
    raise exception '공식 일정을 찾을 수 없습니다.';
  end if;

  if v_moderation_status <> 'visible' or v_event_status <> 'registration_open' then
    raise exception '현재 참가 신청을 받는 공식 일정이 아닙니다.';
  end if;

  if p_join then
    if exists (
      select 1
      from public.club_official_event_participations as participation
      where participation.event_id = p_event_id
        and participation.membership_id = v_membership_id
    ) then
      v_is_participating := true;
    else
      select pg_catalog.count(*)::integer
      into v_participant_count
      from public.club_official_event_participations as participation
      join public.club_memberships as membership
        on membership.id = participation.membership_id
       and membership.club_id = v_club_id
       and membership.membership_status = 'active'
      join public.user_accounts as account
        on account.id = membership.user_id
       and account.account_status = 'active'
      where participation.event_id = p_event_id;

      if v_capacity is not null and v_participant_count >= v_capacity then
        raise exception '참가 정원이 모두 찼습니다.';
      end if;

      insert into public.club_official_event_participations (
        event_id,
        membership_id
      )
      values (
        p_event_id,
        v_membership_id
      );

      v_is_participating := true;
    end if;
  else
    delete from public.club_official_event_participations as participation
    where participation.event_id = p_event_id
      and participation.membership_id = v_membership_id;

    v_is_participating := false;
  end if;

  select pg_catalog.count(*)::integer
  into v_participant_count
  from public.club_official_event_participations as participation
  join public.club_memberships as membership
    on membership.id = participation.membership_id
   and membership.club_id = v_club_id
   and membership.membership_status = 'active'
  join public.user_accounts as account
    on account.id = membership.user_id
   and account.account_status = 'active'
  where participation.event_id = p_event_id;

  return pg_catalog.jsonb_build_object(
    'event_id', p_event_id,
    'participating', v_is_participating,
    'participant_count', v_participant_count
  );
end;
$$;

comment on function private.mutate_club_event_participation(uuid, boolean) is
  'Internal active-member join/leave implementation serialized by the official-event row lock.';

revoke all on function private.mutate_club_event_participation(uuid, boolean)
  from public, anon, authenticated, service_role;

create function public.join_club_event(p_event_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.mutate_club_event_participation(p_event_id, true);
$$;

comment on function public.join_club_event(uuid) is
  'Authenticated active club-member join for one registration-open official event; repeated calls are duplicate-safe.';

revoke all on function public.join_club_event(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.join_club_event(uuid)
  to authenticated;

create function public.leave_club_event(p_event_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.mutate_club_event_participation(p_event_id, false);
$$;

comment on function public.leave_club_event(uuid) is
  'Authenticated active club-member cancellation for one registration-open official event; repeated calls are duplicate-safe.';

revoke all on function public.leave_club_event(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.leave_club_event(uuid)
  to authenticated;
