-- PUL 8-5C-1: privacy-minimized read-only club member detail contract.
-- Status history is derived only from structured, successful membership-changing audit events.

create index audit_logs_membership_application_approval_history_idx
  on public.audit_logs (
    (metadata ->> 'membership_id'),
    created_at desc,
    id desc
  )
  where target_type = 'club_membership_application_approval'
    and action = 'membership_application.approve'
    and outcome = 'success';

create index audit_logs_initial_admin_membership_history_idx
  on public.audit_logs (
    (before_summary ->> 'new_admin_membership_id'),
    created_at desc,
    id desc
  )
  where target_type = 'club_admin_assignment'
    and action = 'role.appoint_initial_admin'
    and outcome = 'success'
    and metadata ->> 'membership_relationship_created' = 'true';

create function public.get_club_member_detail_for_management(
  p_club_id uuid,
  p_membership_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_display_name text;
  v_joined_at timestamptz;
  v_membership_status text;
  v_updated_at timestamptz;
  v_suspended_at timestamptz;
  v_left_at timestamptz;
  v_status_changed_at timestamptz;
  v_current_roles jsonb := '[]'::jsonb;
  v_has_limited_history boolean := false;
  v_history_scope text := 'current_only';
  v_status_history jsonb := '[]'::jsonb;
  v_role_history jsonb := '[]'::jsonb;
  v_status_history_truncated boolean := false;
  v_role_history_truncated boolean := false;
begin
  if v_actor_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  if p_club_id is null then
    raise exception 'CLUB_REQUIRED';
  end if;

  if p_membership_id is null then
    raise exception 'MEMBERSHIP_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.user_accounts as actor_account
    where actor_account.id = v_actor_id
      and actor_account.account_status = 'active'
  ) then
    raise exception 'ACCOUNT_NOT_ACTIVE' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.clubs as club
    where club.id = p_club_id
      and club.club_status = 'active'
  ) or not private.club_user_has_permission(
    v_actor_id,
    p_club_id,
    'club.members.read'
  ) then
    raise exception 'CLUB_MEMBER_READ_PERMISSION_REQUIRED' using errcode = '42501';
  end if;

  select
    profile.display_name,
    membership.joined_at,
    membership.membership_status,
    membership.updated_at,
    membership.suspended_at,
    membership.left_at
  into
    v_display_name,
    v_joined_at,
    v_membership_status,
    v_updated_at,
    v_suspended_at,
    v_left_at
  from public.club_memberships as membership
  left join public.user_profiles as profile
    on profile.user_id = membership.user_id
  where membership.id = p_membership_id
    and membership.club_id = p_club_id;

  if not found then
    raise exception 'CLUB_MEMBER_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  v_status_changed_at := case v_membership_status
    when 'active' then v_updated_at
    when 'suspended' then v_suspended_at
    when 'left' then v_left_at
    else null
  end;

  if v_membership_status not in ('active', 'suspended', 'left')
     or v_status_changed_at is null
     or v_status_changed_at < v_joined_at
     or (
       v_membership_status = 'active'
       and (v_suspended_at is not null or v_left_at is not null)
     )
     or (
       v_membership_status = 'suspended'
       and (v_suspended_at is null or v_left_at is not null)
     )
     or (
       v_membership_status = 'left'
       and (v_suspended_at is not null or v_left_at is null)
     ) then
    raise exception 'CLUB_MEMBER_DATA_CONTRACT_INVALID';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'role_key', current_role_row.role_code,
        'role_name', current_role_row.display_name,
        'assigned_at', current_role_row.assigned_at
      )
      order by
        current_role_row.role_code,
        current_role_row.assigned_at,
        current_role_row.assignment_id
    ),
    '[]'::jsonb
  )
  into v_current_roles
  from (
    select
      assignment.id as assignment_id,
      assignment.role_code,
      role_definition.display_name,
      assignment.assigned_at
    from public.club_role_assignments as assignment
    join public.club_role_definitions as role_definition
      on role_definition.role_code = assignment.role_code
     and role_definition.is_active
    where assignment.membership_id = p_membership_id
      and assignment.revoked_at is null
  ) as current_role_row;

  v_has_limited_history := private.club_user_has_permission(
    v_actor_id,
    p_club_id,
    'club.members.manage'
  ) and exists (
    select 1
    from public.club_memberships as actor_membership
    join public.club_role_assignments as actor_assignment
      on actor_assignment.membership_id = actor_membership.id
     and actor_assignment.revoked_at is null
     and actor_assignment.role_code in ('club_admin', 'club_vice_admin')
    join public.club_role_definitions as actor_role_definition
      on actor_role_definition.role_code = actor_assignment.role_code
     and actor_role_definition.is_active
    where actor_membership.club_id = p_club_id
      and actor_membership.user_id = v_actor_id
      and actor_membership.membership_status = 'active'
  );

  if v_has_limited_history then
    v_history_scope := 'limited_history';

    with reliable_status_events as materialized (
      select
        audit.before_summary ->> 'membership_status' as from_status,
        audit.after_summary ->> 'membership_status' as to_status,
        audit.created_at as occurred_at,
        audit.id as tie_break_id
      from public.audit_logs as audit
      where audit.target_type = 'club_membership'
        and audit.target_id = p_membership_id::text
        and audit.club_id = p_club_id::text
        and audit.request_id is not null
        and audit.outcome = 'success'
        and audit.metadata -> 'changed' = 'true'::jsonb
        and audit.action in (
          'membership.activate',
          'membership.suspend',
          'membership.resume',
          'membership.end',
          'membership.leave_self'
        )
        and audit.after_summary ->> 'membership_status'
          in ('active', 'suspended', 'left')
        and (
          audit.before_summary ->> 'membership_status' is null
          or audit.before_summary ->> 'membership_status'
            in ('active', 'suspended', 'left')
        )
        and audit.before_summary ->> 'membership_status'
          is distinct from audit.after_summary ->> 'membership_status'
        and (
          (
            audit.action = 'membership.activate'
            and audit.before_summary ->> 'membership_status' is null
            and audit.after_summary ->> 'membership_status' = 'active'
          )
          or (
            audit.action = 'membership.activate'
            and audit.before_summary ->> 'membership_status' = 'left'
            and audit.after_summary ->> 'membership_status' = 'active'
          )
          or (
            audit.action = 'membership.suspend'
            and audit.before_summary ->> 'membership_status' = 'active'
            and audit.after_summary ->> 'membership_status' = 'suspended'
          )
          or (
            audit.action = 'membership.resume'
            and audit.before_summary ->> 'membership_status' = 'suspended'
            and audit.after_summary ->> 'membership_status' = 'active'
          )
          or (
            audit.action in ('membership.end', 'membership.leave_self')
            and audit.before_summary ->> 'membership_status'
              in ('active', 'suspended')
            and audit.after_summary ->> 'membership_status' = 'left'
          )
        )

      union all

      select
        audit.before_summary ->> 'membership_status' as from_status,
        'active'::text as to_status,
        audit.created_at as occurred_at,
        audit.id as tie_break_id
      from public.audit_logs as audit
      where audit.target_type = 'club_membership_application_approval'
        and audit.action = 'membership_application.approve'
        and audit.club_id = p_club_id::text
        and audit.request_id is not null
        and audit.outcome = 'success'
        and audit.metadata ->> 'membership_id' = p_membership_id::text
        and audit.after_summary ->> 'membership_status' = 'active'
        and (
          (
            audit.metadata ->> 'membership_transition' = 'created'
            and audit.before_summary ->> 'membership_status' is null
          )
          or (
            audit.metadata ->> 'membership_transition' = 'reactivated'
            and audit.before_summary ->> 'membership_status' = 'left'
          )
        )

      union all

      select
        null::text as from_status,
        'active'::text as to_status,
        audit.created_at as occurred_at,
        audit.id as tie_break_id
      from public.audit_logs as audit
      where audit.target_type = 'club_admin_assignment'
        and audit.action = 'role.appoint_initial_admin'
        and audit.club_id = p_club_id::text
        and audit.request_id is not null
        and audit.outcome = 'success'
        and audit.metadata ->> 'membership_relationship_created' = 'true'
        and audit.before_summary ->> 'new_admin_membership_id'
          = p_membership_id::text
        and audit.after_summary ->> 'new_admin_membership_id'
          = p_membership_id::text
    ),
    limited_status_events as materialized (
      select status_event.*
      from reliable_status_events as status_event
      order by status_event.occurred_at desc, status_event.tie_break_id desc
      limit 51
    ),
    numbered_status_events as (
      select
        status_event.*,
        pg_catalog.row_number() over (
          order by status_event.occurred_at desc, status_event.tie_break_id desc
        ) as event_number
      from limited_status_events as status_event
    )
    select
      coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'from_status', status_event.from_status,
            'to_status', status_event.to_status,
            'occurred_at', status_event.occurred_at
          )
          order by
            status_event.occurred_at desc,
            status_event.tie_break_id desc
        ) filter (where status_event.event_number <= 50),
        '[]'::jsonb
      ),
      pg_catalog.count(*) > 50
    into v_status_history, v_status_history_truncated
    from numbered_status_events as status_event;

    with role_events as materialized (
      select
        assignment.role_code as role_key,
        role_definition.display_name as role_name,
        'granted'::text as event,
        assignment.assigned_at as occurred_at,
        assignment.id as tie_break_id,
        1 as event_order
      from public.club_role_assignments as assignment
      join public.club_role_definitions as role_definition
        on role_definition.role_code = assignment.role_code
      where assignment.membership_id = p_membership_id

      union all

      select
        assignment.role_code as role_key,
        role_definition.display_name as role_name,
        'revoked'::text as event,
        assignment.revoked_at as occurred_at,
        assignment.id as tie_break_id,
        2 as event_order
      from public.club_role_assignments as assignment
      join public.club_role_definitions as role_definition
        on role_definition.role_code = assignment.role_code
      where assignment.membership_id = p_membership_id
        and assignment.revoked_at is not null
    ),
    limited_role_events as materialized (
      select role_event.*
      from role_events as role_event
      order by
        role_event.occurred_at desc,
        role_event.tie_break_id desc,
        role_event.event_order desc
      limit 51
    ),
    numbered_role_events as (
      select
        role_event.*,
        pg_catalog.row_number() over (
          order by
            role_event.occurred_at desc,
            role_event.tie_break_id desc,
            role_event.event_order desc
        ) as event_number
      from limited_role_events as role_event
    )
    select
      coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'role_key', role_event.role_key,
            'role_name', role_event.role_name,
            'event', role_event.event,
            'occurred_at', role_event.occurred_at
          )
          order by
            role_event.occurred_at desc,
            role_event.tie_break_id desc,
            role_event.event_order desc
        ) filter (where role_event.event_number <= 50),
        '[]'::jsonb
      ),
      pg_catalog.count(*) > 50
    into v_role_history, v_role_history_truncated
    from numbered_role_events as role_event;
  end if;

  return pg_catalog.jsonb_build_object(
    'member', pg_catalog.jsonb_build_object(
      'membership_id', p_membership_id,
      'display_name', v_display_name,
      'joined_at', v_joined_at,
      'membership_status', v_membership_status,
      'status_changed_at', v_status_changed_at,
      'current_roles', v_current_roles
    ),
    'history_scope', v_history_scope,
    'status_history', v_status_history,
    'role_history', v_role_history,
    'history_meta', pg_catalog.jsonb_build_object(
      'status_history_truncated', v_status_history_truncated,
      'role_history_truncated', v_role_history_truncated
    )
  );
end;
$$;

comment on function public.get_club_member_detail_for_management(uuid, uuid) is
  'Returns privacy-minimized current member detail to active club operators and limited structured status and role history only to active club administrators or vice administrators. It exposes no contacts, applications, reasons, actors, request IDs, audit IDs, or raw metadata.';

revoke all on function public.get_club_member_detail_for_management(uuid, uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.get_club_member_detail_for_management(uuid, uuid)
  to authenticated;
