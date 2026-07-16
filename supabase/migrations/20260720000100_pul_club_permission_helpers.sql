-- PUL 8-3B-2B-2: effective club permission and active administrator helpers.
-- No membership or role mutation is exposed by this migration.

create function private.club_user_has_permission(
  p_user_id uuid,
  p_club_id uuid,
  p_permission_code text
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p_user_id is not null
    and p_club_id is not null
    and p_permission_code is not null
    and exists (
      select 1
      from public.user_accounts as account
      join public.club_memberships as membership
        on membership.user_id = account.id
       and membership.club_id = p_club_id
       and membership.membership_status = 'active'
      join public.clubs as club
        on club.id = membership.club_id
       and club.club_status = 'active'
      join public.club_role_assignments as assignment
        on assignment.membership_id = membership.id
       and assignment.revoked_at is null
      join public.club_role_definitions as role_definition
        on role_definition.role_code = assignment.role_code
       and role_definition.is_active
      join public.club_role_permissions as role_permission
        on role_permission.role_code = role_definition.role_code
      join public.club_permission_definitions as permission_definition
        on permission_definition.permission_code = role_permission.permission_code
       and permission_definition.is_active
      where account.id = p_user_id
        and account.account_status = 'active'
        and role_permission.permission_code = p_permission_code
        and permission_definition.permission_code = p_permission_code
    );
$$;

comment on function private.club_user_has_permission(uuid, uuid, text) is
  'Internal effective-permission check across active account, club, membership, roles, and mappings.';

revoke all on function private.club_user_has_permission(uuid, uuid, text)
  from public, anon, authenticated, service_role;

create function private.club_user_is_active_admin(
  p_user_id uuid,
  p_club_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p_user_id is not null
    and p_club_id is not null
    and exists (
      select 1
      from public.user_accounts as account
      join public.club_memberships as membership
        on membership.user_id = account.id
       and membership.club_id = p_club_id
       and membership.membership_status = 'active'
      join public.clubs as club
        on club.id = membership.club_id
       and club.club_status = 'active'
      join public.club_role_assignments as assignment
        on assignment.membership_id = membership.id
       and assignment.revoked_at is null
       and assignment.role_code = 'club_admin'
      join public.club_role_definitions as role_definition
        on role_definition.role_code = assignment.role_code
       and role_definition.is_active
      where account.id = p_user_id
        and account.account_status = 'active'
    );
$$;

comment on function private.club_user_is_active_admin(uuid, uuid) is
  'Internal check for an active club_admin assignment in one active club membership.';

revoke all on function private.club_user_is_active_admin(uuid, uuid)
  from public, anon, authenticated, service_role;

create function private.count_active_club_admins(p_club_id uuid)
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$
  select count(distinct membership.id)
  from public.clubs as club
  join public.club_memberships as membership
    on membership.club_id = club.id
   and membership.membership_status = 'active'
  join public.user_accounts as account
    on account.id = membership.user_id
   and account.account_status = 'active'
  join public.club_role_assignments as assignment
    on assignment.membership_id = membership.id
   and assignment.revoked_at is null
   and assignment.role_code = 'club_admin'
  join public.club_role_definitions as role_definition
    on role_definition.role_code = assignment.role_code
   and role_definition.is_active
  where p_club_id is not null
    and club.id = p_club_id
    and club.club_status = 'active';
$$;

comment on function private.count_active_club_admins(uuid) is
  'Internal distinct active administrator count; callers must acquire the club row lock before protection checks.';

revoke all on function private.count_active_club_admins(uuid)
  from public, anon, authenticated, service_role;

create function public.current_user_has_club_permission(
  p_club_id uuid,
  p_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    private.club_user_has_permission(
      auth.uid(),
      p_club_id,
      p_permission_code
    ),
    false
  );
$$;

comment on function public.current_user_has_club_permission(uuid, text) is
  'Authenticated boolean-only permission check bound to auth.uid(); it exposes no role or membership rows.';

revoke all on function public.current_user_has_club_permission(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.current_user_has_club_permission(uuid, text)
  to authenticated;
