-- PUL 8-3B-2B-4C: single vice administrator, role invariants, and guarded mutations.
-- No existing membership or role assignment is changed by this migration.

insert into public.club_role_definitions (
  role_code,
  display_name,
  description,
  role_rank,
  is_system,
  is_active
)
values (
  'club_vice_admin',
  '부회장',
  '회장과 동일한 일반 운영 권한을 가지되 회장 권한 이전은 수행하지 않는 역할',
  25,
  true,
  true
)
on conflict (role_code) do nothing;

do $$
begin
  if not exists (
    select 1
    from public.club_role_definitions as role_definition
    where role_definition.role_code = 'club_vice_admin'
      and role_definition.display_name = '부회장'
      and role_definition.role_rank = 25
      and role_definition.is_system
      and role_definition.is_active
  ) then
    raise exception 'club_vice_admin 역할 정의가 승인된 값과 일치하지 않습니다.';
  end if;
end;
$$;

insert into public.club_role_permissions (
  role_code,
  permission_code
)
select
  'club_vice_admin',
  admin_permission.permission_code
from public.club_role_permissions as admin_permission
where admin_permission.role_code = 'club_admin'
on conflict (role_code, permission_code) do nothing;

do $$
begin
  if not exists (
    select 1
    from public.club_role_permissions as admin_permission
    where admin_permission.role_code = 'club_admin'
  ) then
    raise exception 'club_admin 권한 매핑이 없어 부회장 권한을 구성할 수 없습니다.';
  end if;

  if exists (
    (
      select vice_permission.permission_code
      from public.club_role_permissions as vice_permission
      where vice_permission.role_code = 'club_vice_admin'
      except
      select admin_permission.permission_code
      from public.club_role_permissions as admin_permission
      where admin_permission.role_code = 'club_admin'
    )
    union all
    (
      select admin_permission.permission_code
      from public.club_role_permissions as admin_permission
      where admin_permission.role_code = 'club_admin'
      except
      select vice_permission.permission_code
      from public.club_role_permissions as vice_permission
      where vice_permission.role_code = 'club_vice_admin'
    )
  ) then
    raise exception 'club_vice_admin 권한 집합이 club_admin 권한 집합과 일치하지 않습니다.';
  end if;
end;
$$;

create function private.club_user_is_active_admin_or_vice_admin(
  p_user_id uuid,
  p_club_id uuid
)
returns boolean
language sql
stable
security definer
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
       and assignment.role_code in ('club_admin', 'club_vice_admin')
      join public.club_role_definitions as role_definition
        on role_definition.role_code = assignment.role_code
       and role_definition.is_active
      where account.id = p_user_id
        and account.account_status = 'active'
    );
$$;

comment on function private.club_user_is_active_admin_or_vice_admin(uuid, uuid) is
  'Checks an active account, club, membership, and unrevoked active club_admin or club_vice_admin assignment.';

revoke all on function private.club_user_is_active_admin_or_vice_admin(uuid, uuid)
  from public, anon, authenticated, service_role;

create function private.club_membership_has_unrevoked_vice_admin_assignment(
  p_membership_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p_membership_id is not null
    and exists (
      select 1
      from public.club_role_assignments as assignment
      where assignment.membership_id = p_membership_id
        and assignment.role_code = 'club_vice_admin'
        and assignment.revoked_at is null
    );
$$;

comment on function private.club_membership_has_unrevoked_vice_admin_assignment(uuid) is
  'Protects every unrevoked club_vice_admin assignment without treating revoked history as active.';

revoke all on function private.club_membership_has_unrevoked_vice_admin_assignment(uuid)
  from public, anon, authenticated, service_role;

create function private.enforce_club_vice_admin_assignment_constraints()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_club_id uuid;
  v_locked_club_id uuid;
begin
  if new.revoked_at is not null
     or new.role_code not in (
       'club_admin',
       'club_vice_admin',
       'club_manager'
     ) then
    return new;
  end if;

  select membership.club_id
    into v_club_id
  from public.club_memberships as membership
  where membership.id = new.membership_id;

  if not found then
    raise exception '역할을 연결할 동호회 회원 관계를 찾을 수 없습니다.';
  end if;

  select club.id
    into v_locked_club_id
  from public.clubs as club
  where club.id = v_club_id
  for update;

  if not found then
    raise exception '역할을 연결할 동호회를 찾을 수 없습니다.';
  end if;

  if new.role_code = 'club_vice_admin' then
    if exists (
      select 1
      from public.club_role_assignments as assignment
      join public.club_memberships as membership
        on membership.id = assignment.membership_id
      where membership.club_id = v_club_id
        and assignment.role_code = 'club_vice_admin'
        and assignment.revoked_at is null
        and assignment.id <> new.id
    ) then
      raise exception '동호회에는 해제되지 않은 부회장 역할이 한 명만 존재할 수 있습니다.';
    end if;

    if exists (
      select 1
      from public.club_role_assignments as assignment
      where assignment.membership_id = new.membership_id
        and assignment.role_code in ('club_admin', 'club_manager')
        and assignment.revoked_at is null
        and assignment.id <> new.id
    ) then
      raise exception '부회장은 회장 또는 일반 운영진 역할을 동시에 보유할 수 없습니다.';
    end if;
  elsif new.role_code = 'club_admin' then
    if exists (
      select 1
      from public.club_role_assignments as assignment
      where assignment.membership_id = new.membership_id
        and assignment.role_code = 'club_vice_admin'
        and assignment.revoked_at is null
        and assignment.id <> new.id
    ) then
      raise exception '회장과 부회장 역할은 동시에 보유할 수 없습니다.';
    end if;
  else
    if exists (
      select 1
      from public.club_role_assignments as assignment
      where assignment.membership_id = new.membership_id
        and assignment.role_code = 'club_vice_admin'
        and assignment.revoked_at is null
        and assignment.id <> new.id
    ) then
      raise exception '일반 운영진과 부회장 역할은 동시에 보유할 수 없습니다.';
    end if;
  end if;

  return new;
end;
$$;

comment on function private.enforce_club_vice_admin_assignment_constraints() is
  'Serializes club leadership role writes and enforces one vice administrator plus admin/vice/manager exclusivity.';

revoke all on function private.enforce_club_vice_admin_assignment_constraints()
  from public, anon, authenticated, service_role;

create trigger club_role_assignments_vice_constraints_after_insert
after insert on public.club_role_assignments
for each row
when (
  new.role_code in ('club_admin', 'club_vice_admin', 'club_manager')
  and new.revoked_at is null
)
execute function private.enforce_club_vice_admin_assignment_constraints();

create trigger club_role_assignments_vice_constraints_after_update
after update of membership_id, role_code, revoked_at
on public.club_role_assignments
for each row
when (
  new.role_code in ('club_admin', 'club_vice_admin', 'club_manager')
  and new.revoked_at is null
)
execute function private.enforce_club_vice_admin_assignment_constraints();

create function private.execute_club_vice_admin_mutation(
  p_action_code text,
  p_club_id uuid,
  p_target_user_id uuid,
  p_request_id uuid,
  p_reason text
)
returns table (
  request_id uuid,
  action_code text,
  club_id uuid,
  target_user_id uuid,
  membership_id uuid,
  assignment_id uuid,
  changed boolean,
  replayed boolean,
  outcome text
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_role_code constant text := 'club_vice_admin';
  v_actor_id uuid := auth.uid();
  v_actor_account_status text;
  v_target_account_status text;
  v_reason text;
  v_input_fingerprint text;
  v_club_status text;
  v_membership_id uuid;
  v_membership_status text;
  v_member_definition_found boolean := false;
  v_member_definition_active boolean := false;
  v_vice_definition_found boolean := false;
  v_vice_definition_active boolean := false;
  v_role_definition record;
  v_current_admin_count integer := 0;
  v_current_admin_user_id uuid;
  v_admin_assignment record;
  v_current_vice_count integer := 0;
  v_current_vice_user_id uuid;
  v_current_vice_membership_id uuid;
  v_current_vice_assignment_id uuid;
  v_vice_assignment record;
  v_member_assignment_id uuid;
  v_assignment_id uuid;
  v_previous_active boolean := false;
  v_current_active boolean := false;
  v_changed boolean := false;
  v_member_created boolean := false;
  v_manager_revoked_count integer := 0;
  v_assignment_created boolean := false;
  v_assignment_revoked boolean := false;
  v_outcome text;
  v_ledger_action_code text;
  v_ledger_club_id uuid;
  v_ledger_target_user_id uuid;
  v_ledger_role_code text;
  v_ledger_fingerprint text;
  v_ledger_outcome text;
  v_result_data jsonb;
  v_completed_at timestamptz;
  v_ledger_found boolean := false;
  v_completed_ledger_count integer := 0;
begin
  if p_action_code is null
     or p_action_code not in (
       'role.grant_vice_admin',
       'role.revoke_vice_admin'
     ) then
    raise exception '지원하지 않는 부회장 역할 작업입니다.';
  end if;

  if v_actor_id is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;

  if p_club_id is null then
    raise exception '동호회 식별자가 필요합니다.';
  end if;

  if p_target_user_id is null then
    raise exception '대상 회원 식별자가 필요합니다.';
  end if;

  if p_request_id is null then
    raise exception '요청 식별자가 필요합니다.';
  end if;

  if p_target_user_id = v_actor_id then
    raise exception '현재 회장 본인을 부회장으로 지정하거나 해제할 수 없습니다.';
  end if;

  v_reason := pg_catalog.btrim(p_reason);

  if v_reason is null
     or pg_catalog.char_length(v_reason) < 2
     or pg_catalog.char_length(v_reason) > 500 then
    raise exception '부회장 역할 변경 사유는 2자 이상 500자 이하여야 합니다.';
  end if;

  select actor_account.account_status
    into v_actor_account_status
  from public.user_accounts as actor_account
  where actor_account.id = v_actor_id
  for share;

  if not found or v_actor_account_status <> 'active' then
    raise exception '활성 계정만 부회장 역할 작업을 수행할 수 있습니다.'
      using errcode = '42501';
  end if;

  v_input_fingerprint := pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'action_code', p_action_code,
      'club_id', p_club_id,
      'target_user_id', p_target_user_id,
      'role_code', v_role_code,
      'reason', v_reason
    )::text
  );

  select
    ledger.action_code,
    ledger.club_id,
    ledger.target_user_id,
    ledger.role_code,
    ledger.input_fingerprint,
    ledger.outcome,
    ledger.result_data,
    ledger.completed_at
  into
    v_ledger_action_code,
    v_ledger_club_id,
    v_ledger_target_user_id,
    v_ledger_role_code,
    v_ledger_fingerprint,
    v_ledger_outcome,
    v_result_data,
    v_completed_at
  from private.club_mutation_requests as ledger
  where ledger.actor_id = v_actor_id
    and ledger.request_id = p_request_id
  for update;

  v_ledger_found := found;

  if v_ledger_found then
    if v_ledger_action_code is distinct from p_action_code
       or v_ledger_club_id is distinct from p_club_id
       or v_ledger_target_user_id is distinct from p_target_user_id
       or v_ledger_role_code is distinct from v_role_code
       or v_ledger_fingerprint is distinct from v_input_fingerprint then
      raise exception '같은 요청 식별자를 다른 입력에 재사용할 수 없습니다.';
    end if;

    if v_completed_at is not null then
      return query
      select
        p_request_id,
        v_ledger_action_code,
        v_ledger_club_id,
        v_ledger_target_user_id,
        (v_result_data ->> 'membership_id')::uuid,
        (v_result_data ->> 'assignment_id')::uuid,
        (v_result_data ->> 'changed')::boolean,
        true,
        v_ledger_outcome;
      return;
    end if;
  end if;

  select club.club_status
    into v_club_status
  from public.clubs as club
  where club.id = p_club_id
  for update;

  if not found then
    raise exception '동호회를 찾을 수 없습니다.';
  end if;

  if not v_ledger_found then
    insert into private.club_mutation_requests (
      actor_id,
      request_id,
      action_code,
      club_id,
      target_user_id,
      role_code,
      input_fingerprint
    )
    values (
      v_actor_id,
      p_request_id,
      p_action_code,
      p_club_id,
      p_target_user_id,
      v_role_code,
      v_input_fingerprint
    )
    on conflict on constraint club_mutation_requests_actor_request_unique
    do nothing;

    select
      ledger.action_code,
      ledger.club_id,
      ledger.target_user_id,
      ledger.role_code,
      ledger.input_fingerprint,
      ledger.outcome,
      ledger.result_data,
      ledger.completed_at
    into
      v_ledger_action_code,
      v_ledger_club_id,
      v_ledger_target_user_id,
      v_ledger_role_code,
      v_ledger_fingerprint,
      v_ledger_outcome,
      v_result_data,
      v_completed_at
    from private.club_mutation_requests as ledger
    where ledger.actor_id = v_actor_id
      and ledger.request_id = p_request_id
    for update;

    if not found then
      raise exception '요청 처리 기록을 확보할 수 없습니다.';
    end if;

    if v_ledger_action_code is distinct from p_action_code
       or v_ledger_club_id is distinct from p_club_id
       or v_ledger_target_user_id is distinct from p_target_user_id
       or v_ledger_role_code is distinct from v_role_code
       or v_ledger_fingerprint is distinct from v_input_fingerprint then
      raise exception '같은 요청 식별자를 다른 입력에 재사용할 수 없습니다.';
    end if;

    if v_completed_at is not null then
      return query
      select
        p_request_id,
        v_ledger_action_code,
        v_ledger_club_id,
        v_ledger_target_user_id,
        (v_result_data ->> 'membership_id')::uuid,
        (v_result_data ->> 'assignment_id')::uuid,
        (v_result_data ->> 'changed')::boolean,
        true,
        v_ledger_outcome;
      return;
    end if;
  end if;

  if v_club_status <> 'active' then
    raise exception '활성 동호회에서만 부회장 역할을 변경할 수 있습니다.';
  end if;

  if not private.club_user_has_permission(
    v_actor_id,
    p_club_id,
    'club.roles.manage'
  ) then
    raise exception '동호회 역할 관리 권한이 없습니다.' using errcode = '42501';
  end if;

  if not private.club_user_is_active_admin(
    v_actor_id,
    p_club_id
  ) then
    raise exception '현재 활성 회장만 부회장 역할을 변경할 수 있습니다.'
      using errcode = '42501';
  end if;

  for v_admin_assignment in
    select
      assignment.id,
      membership.user_id,
      membership.membership_status
    from public.club_role_assignments as assignment
    join public.club_memberships as membership
      on membership.id = assignment.membership_id
    where membership.club_id = p_club_id
      and assignment.role_code = 'club_admin'
      and assignment.revoked_at is null
    order by assignment.id
    for update of assignment, membership
  loop
    v_current_admin_count := v_current_admin_count + 1;
    if v_current_admin_count = 1 then
      v_current_admin_user_id := v_admin_assignment.user_id;
      if v_admin_assignment.membership_status <> 'active' then
        v_current_admin_user_id := null;
      end if;
    end if;
  end loop;

  if v_current_admin_count <> 1
     or v_current_admin_user_id is distinct from v_actor_id then
    raise exception '현재 회장 상태를 자동으로 변경할 수 없어 별도 복구가 필요합니다.';
  end if;

  select target_account.account_status
    into v_target_account_status
  from public.user_accounts as target_account
  where target_account.id = p_target_user_id
  for share;

  if not found then
    raise exception '대상 회원 계정을 찾을 수 없습니다.';
  end if;

  if p_action_code = 'role.grant_vice_admin'
     and v_target_account_status <> 'active' then
    raise exception '활성 계정에만 부회장 역할을 지정할 수 있습니다.';
  end if;

  select
    membership.id,
    membership.membership_status
  into
    v_membership_id,
    v_membership_status
  from public.club_memberships as membership
  where membership.club_id = p_club_id
    and membership.user_id = p_target_user_id
  for update;

  if not found then
    raise exception '대상 동호회 회원 관계를 찾을 수 없습니다.';
  end if;

  if v_membership_status <> 'active' then
    raise exception '정상 활동 중인 회원의 부회장 역할만 변경할 수 있습니다.';
  end if;

  for v_role_definition in
    select
      role_definition.role_code,
      role_definition.is_active
    from public.club_role_definitions as role_definition
    where role_definition.role_code in ('club_member', 'club_vice_admin')
    order by role_definition.role_code
    for share
  loop
    if v_role_definition.role_code = 'club_member' then
      v_member_definition_found := true;
      v_member_definition_active := v_role_definition.is_active;
    else
      v_vice_definition_found := true;
      v_vice_definition_active := v_role_definition.is_active;
    end if;
  end loop;

  if not v_member_definition_found or not v_member_definition_active then
    raise exception '활성 일반회원 역할 정의를 찾을 수 없습니다.';
  end if;

  if not v_vice_definition_found or not v_vice_definition_active then
    raise exception '활성 부회장 역할 정의를 찾을 수 없습니다.';
  end if;

  perform assignment.id
  from public.club_role_assignments as assignment
  where assignment.membership_id = v_membership_id
    and assignment.revoked_at is null
  order by assignment.role_code, assignment.assigned_at, assignment.id
  for update;

  if private.club_membership_has_unrevoked_admin_assignment(v_membership_id) then
    raise exception '현재 회장에게 부회장 역할 작업을 수행할 수 없습니다.';
  end if;

  for v_vice_assignment in
    select
      assignment.id as assignment_id,
      membership.id as membership_id,
      membership.user_id
    from public.club_role_assignments as assignment
    join public.club_memberships as membership
      on membership.id = assignment.membership_id
    where membership.club_id = p_club_id
      and assignment.role_code = 'club_vice_admin'
      and assignment.revoked_at is null
    order by assignment.id
    for update of assignment, membership
  loop
    v_current_vice_count := v_current_vice_count + 1;
    if v_current_vice_count = 1 then
      v_current_vice_user_id := v_vice_assignment.user_id;
      v_current_vice_membership_id := v_vice_assignment.membership_id;
      v_current_vice_assignment_id := v_vice_assignment.assignment_id;
    end if;
  end loop;

  if v_current_vice_count > 1 then
    raise exception '부회장 역할 상태를 자동으로 변경할 수 없어 별도 복구가 필요합니다.';
  end if;

  if p_action_code = 'role.grant_vice_admin'
     and v_current_vice_count = 1
     and v_current_vice_membership_id is distinct from v_membership_id then
    raise exception '기존 부회장을 먼저 해제해야 합니다.';
  end if;

  select assignment.id
    into v_member_assignment_id
  from public.club_role_assignments as assignment
  where assignment.membership_id = v_membership_id
    and assignment.role_code = 'club_member'
    and assignment.revoked_at is null;

  if v_member_assignment_id is null then
    insert into public.club_role_assignments (
      membership_id,
      role_code,
      assigned_by
    )
    values (
      v_membership_id,
      'club_member',
      v_actor_id
    )
    returning id into v_member_assignment_id;

    v_member_created := true;
    v_changed := true;
  end if;

  v_previous_active := v_current_vice_membership_id is not distinct from v_membership_id;

  if p_action_code = 'role.grant_vice_admin' then
    update public.club_role_assignments as assignment
    set
      revoked_at = pg_catalog.now(),
      revoked_by = v_actor_id
    where assignment.membership_id = v_membership_id
      and assignment.role_code = 'club_manager'
      and assignment.revoked_at is null;

    get diagnostics v_manager_revoked_count = row_count;

    if v_manager_revoked_count > 0 then
      v_changed := true;
    end if;

    if not v_previous_active then
      insert into public.club_role_assignments (
        membership_id,
        role_code,
        assigned_by
      )
      values (
        v_membership_id,
        v_role_code,
        v_actor_id
      )
      returning id into v_assignment_id;

      v_assignment_created := true;
      v_changed := true;
    else
      v_assignment_id := v_current_vice_assignment_id;
    end if;

    if (
      select count(*)
      from public.club_role_assignments as assignment
      join public.club_memberships as membership
        on membership.id = assignment.membership_id
      where membership.club_id = p_club_id
        and assignment.role_code = 'club_vice_admin'
        and assignment.revoked_at is null
    ) <> 1
    or not exists (
      select 1
      from public.club_role_assignments as assignment
      where assignment.id = v_assignment_id
        and assignment.membership_id = v_membership_id
        and assignment.role_code = 'club_vice_admin'
        and assignment.revoked_at is null
    )
    or exists (
      select 1
      from public.club_role_assignments as assignment
      where assignment.membership_id = v_membership_id
        and assignment.role_code in ('club_admin', 'club_manager')
        and assignment.revoked_at is null
    ) then
      raise exception '부회장 역할 지정 결과를 확인할 수 없습니다.';
    end if;

    v_current_active := true;
  else
    if v_previous_active then
      update public.club_role_assignments as assignment
      set
        revoked_at = pg_catalog.now(),
        revoked_by = v_actor_id
      where assignment.id = v_current_vice_assignment_id
        and assignment.membership_id = v_membership_id
        and assignment.role_code = 'club_vice_admin'
        and assignment.revoked_at is null
      returning assignment.id into v_assignment_id;

      if v_assignment_id is null then
        raise exception '부회장 역할 해제 상태를 저장할 수 없습니다.';
      end if;

      v_assignment_revoked := true;
      v_changed := true;
    end if;

    if exists (
      select 1
      from public.club_role_assignments as assignment
      where assignment.membership_id = v_membership_id
        and assignment.role_code = 'club_vice_admin'
        and assignment.revoked_at is null
    ) then
      raise exception '부회장 역할 해제 결과를 확인할 수 없습니다.';
    end if;

    v_current_active := false;
  end if;

  if (
    select count(*)
    from public.club_role_assignments as assignment
    where assignment.membership_id = v_membership_id
      and assignment.role_code = 'club_member'
      and assignment.revoked_at is null
  ) <> 1 then
    raise exception '부회장 역할 변경 후 일반회원 역할을 확인할 수 없습니다.';
  end if;

  if p_action_code = 'role.revoke_vice_admin'
     and v_previous_active
     and exists (
       select 1
       from public.club_role_assignments as assignment
       where assignment.membership_id = v_membership_id
         and assignment.role_code in ('club_admin', 'club_manager')
         and assignment.revoked_at is null
     ) then
    raise exception '부회장 역할 해제 후 역할 정규화 상태를 확인할 수 없습니다.';
  end if;

  v_outcome := case when v_changed then 'success' else 'noop' end;

  insert into public.audit_logs (
    actor_id,
    actor_type,
    action,
    target_type,
    target_id,
    club_id,
    before_summary,
    after_summary,
    reason,
    metadata,
    request_id,
    outcome
  )
  values (
    v_actor_id,
    'operator',
    p_action_code,
    'club_vice_admin_assignment',
    v_membership_id::text,
    p_club_id::text,
    pg_catalog.jsonb_build_object(
      'target_user_id', p_target_user_id,
      'membership_id', v_membership_id,
      'assignment_id', v_current_vice_assignment_id,
      'active_vice_admin', v_previous_active
    ),
    pg_catalog.jsonb_build_object(
      'target_user_id', p_target_user_id,
      'membership_id', v_membership_id,
      'assignment_id', v_assignment_id,
      'active_vice_admin', v_current_active
    ),
    v_reason,
    pg_catalog.jsonb_build_object(
      'member_created', v_member_created,
      'manager_revoked_count', v_manager_revoked_count,
      'assignment_created', v_assignment_created,
      'assignment_revoked', v_assignment_revoked
    ),
    p_request_id,
    v_outcome
  );

  v_result_data := pg_catalog.jsonb_build_object(
    'action_code', p_action_code,
    'club_id', p_club_id,
    'target_user_id', p_target_user_id,
    'membership_id', v_membership_id,
    'assignment_id', v_assignment_id,
    'changed', v_changed,
    'outcome', v_outcome
  );

  update private.club_mutation_requests as ledger
  set
    outcome = v_outcome,
    result_data = v_result_data,
    completed_at = pg_catalog.now()
  where ledger.actor_id = v_actor_id
    and ledger.request_id = p_request_id;

  get diagnostics v_completed_ledger_count = row_count;

  if v_completed_ledger_count <> 1 then
    raise exception '요청 처리 기록 완료 상태를 저장할 수 없습니다.';
  end if;

  return query
  select
    p_request_id,
    p_action_code,
    p_club_id,
    p_target_user_id,
    v_membership_id,
    v_assignment_id,
    v_changed,
    false,
    v_outcome;
end;
$$;

comment on function private.execute_club_vice_admin_mutation(text, uuid, uuid, uuid, text) is
  'Internal admin-only vice administrator grant and revoke engine with role normalization, replay, and audit.';

revoke all on function private.execute_club_vice_admin_mutation(text, uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;

create function public.grant_club_vice_admin(
  p_club_id uuid,
  p_target_user_id uuid,
  p_request_id uuid,
  p_reason text
)
returns table (
  request_id uuid,
  action_code text,
  club_id uuid,
  target_user_id uuid,
  membership_id uuid,
  assignment_id uuid,
  changed boolean,
  replayed boolean,
  outcome text
)
language sql
volatile
security definer
set search_path = ''
as $$
  select *
  from private.execute_club_vice_admin_mutation(
    'role.grant_vice_admin',
    p_club_id,
    p_target_user_id,
    p_request_id,
    p_reason
  );
$$;

comment on function public.grant_club_vice_admin(uuid, uuid, uuid, text) is
  'Allows the current active and unique club administrator to grant the single vice administrator role.';

revoke all on function public.grant_club_vice_admin(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.grant_club_vice_admin(uuid, uuid, uuid, text)
  to authenticated;

create function public.revoke_club_vice_admin(
  p_club_id uuid,
  p_target_user_id uuid,
  p_request_id uuid,
  p_reason text
)
returns table (
  request_id uuid,
  action_code text,
  club_id uuid,
  target_user_id uuid,
  membership_id uuid,
  assignment_id uuid,
  changed boolean,
  replayed boolean,
  outcome text
)
language sql
volatile
security definer
set search_path = ''
as $$
  select *
  from private.execute_club_vice_admin_mutation(
    'role.revoke_vice_admin',
    p_club_id,
    p_target_user_id,
    p_request_id,
    p_reason
  );
$$;

comment on function public.revoke_club_vice_admin(uuid, uuid, uuid, text) is
  'Allows the current active and unique club administrator to revoke the vice administrator role.';

revoke all on function public.revoke_club_vice_admin(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.revoke_club_vice_admin(uuid, uuid, uuid, text)
  to authenticated;


create or replace function private.execute_club_membership_mutation(
  p_action_code text,
  p_club_id uuid,
  p_target_user_id uuid,
  p_request_id uuid,
  p_reason text,
  p_self_service boolean
)
returns table (
  request_id uuid,
  action_code text,
  club_id uuid,
  target_user_id uuid,
  membership_id uuid,
  previous_status text,
  current_status text,
  changed boolean,
  replayed boolean,
  outcome text
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_account_status text;
  v_target_user_id uuid;
  v_reason text;
  v_input_fingerprint text;
  v_club_status text;
  v_target_account_status text;
  v_membership_id uuid;
  v_membership_status text;
  v_membership_found boolean := false;
  v_previous_status text;
  v_current_status text;
  v_changed boolean := false;
  v_outcome text;
  v_membership_created boolean := false;
  v_member_role_created boolean := false;
  v_revoked_role_count integer := 0;
  v_ledger_action_code text;
  v_ledger_club_id uuid;
  v_ledger_target_user_id uuid;
  v_ledger_fingerprint text;
  v_ledger_outcome text;
  v_result_data jsonb;
  v_completed_at timestamptz;
  v_ledger_found boolean := false;
  v_completed_ledger_count integer := 0;
begin
  if p_action_code is null
     or p_action_code not in (
    'membership.activate',
    'membership.suspend',
    'membership.resume',
    'membership.end',
    'membership.leave_self'
  ) then
    raise exception '지원하지 않는 회원 관계 작업입니다.';
  end if;

  if p_self_service is distinct from (p_action_code = 'membership.leave_self') then
    raise exception '회원 관계 작업 유형이 올바르지 않습니다.';
  end if;

  if v_actor_id is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;

  if p_club_id is null then
    raise exception '동호회 식별자가 필요합니다.';
  end if;

  if p_request_id is null then
    raise exception '요청 식별자가 필요합니다.';
  end if;

  select actor_account.account_status
    into v_actor_account_status
  from public.user_accounts as actor_account
  where actor_account.id = v_actor_id
  for share;

  if not found or v_actor_account_status <> 'active' then
    raise exception '활성 계정만 회원 관계 작업을 수행할 수 있습니다.' using errcode = '42501';
  end if;

  if p_self_service then
    v_target_user_id := v_actor_id;
    v_reason := nullif(pg_catalog.btrim(p_reason), '');

    if v_reason is not null and pg_catalog.char_length(v_reason) > 500 then
      raise exception '탈퇴 사유는 500자 이하여야 합니다.';
    end if;
  else
    if p_target_user_id is null then
      raise exception '대상 회원 식별자가 필요합니다.';
    end if;

    if p_target_user_id = v_actor_id then
      raise exception '관리 작업으로 본인의 회원 관계를 변경할 수 없습니다.';
    end if;

    v_target_user_id := p_target_user_id;
    v_reason := pg_catalog.btrim(p_reason);

    if v_reason is null
       or pg_catalog.char_length(v_reason) < 2
       or pg_catalog.char_length(v_reason) > 500 then
      raise exception '관리 사유는 2자 이상 500자 이하여야 합니다.';
    end if;

  end if;

  v_input_fingerprint := pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'action_code', p_action_code,
      'club_id', p_club_id,
      'target_user_id', v_target_user_id,
      'reason', v_reason
    )::text
  );

  select
    ledger.action_code,
    ledger.club_id,
    ledger.target_user_id,
    ledger.input_fingerprint,
    ledger.outcome,
    ledger.result_data,
    ledger.completed_at
  into
    v_ledger_action_code,
    v_ledger_club_id,
    v_ledger_target_user_id,
    v_ledger_fingerprint,
    v_ledger_outcome,
    v_result_data,
    v_completed_at
  from private.club_mutation_requests as ledger
  where ledger.actor_id = v_actor_id
    and ledger.request_id = p_request_id
  for update;

  v_ledger_found := found;

  if v_ledger_found then
    if v_ledger_action_code is distinct from p_action_code
       or v_ledger_club_id is distinct from p_club_id
       or v_ledger_target_user_id is distinct from v_target_user_id
       or v_ledger_fingerprint is distinct from v_input_fingerprint then
      raise exception '같은 요청 식별자를 다른 입력에 재사용할 수 없습니다.';
    end if;

    if v_completed_at is not null then
      return query
      select
        p_request_id,
        v_ledger_action_code,
        v_ledger_club_id,
        v_ledger_target_user_id,
        (v_result_data ->> 'membership_id')::uuid,
        v_result_data ->> 'previous_status',
        v_result_data ->> 'current_status',
        (v_result_data ->> 'changed')::boolean,
        true,
        v_ledger_outcome;
      return;
    end if;
  end if;

  select club.club_status
    into v_club_status
  from public.clubs as club
  where club.id = p_club_id
  for update;

  if not found then
    raise exception '동호회를 찾을 수 없습니다.';
  end if;

  if not p_self_service then
    if v_club_status <> 'active' then
      raise exception '활성 동호회에서만 회원 관리 작업을 수행할 수 있습니다.';
    end if;

    if not private.club_user_has_permission(
      v_actor_id,
      p_club_id,
      'club.members.manage'
    ) then
      raise exception '동호회 회원 관리 권한이 없습니다.' using errcode = '42501';
    end if;

    if not private.club_user_is_active_admin_or_vice_admin(
      v_actor_id,
      p_club_id
    ) then
      raise exception '현재 활성 회장 또는 부회장만 회원 상태를 관리할 수 있습니다.'
        using errcode = '42501';
    end if;

    select target_account.account_status
      into v_target_account_status
    from public.user_accounts as target_account
    where target_account.id = v_target_user_id
    for share;

    if not found then
      raise exception '대상 회원 계정을 찾을 수 없습니다.';
    end if;

    if p_action_code in ('membership.activate', 'membership.resume')
       and v_target_account_status <> 'active' then
      raise exception '활성 계정만 가입 또는 정지 해제할 수 있습니다.';
    end if;
  end if;

  if not v_ledger_found then
    insert into private.club_mutation_requests (
      actor_id,
      request_id,
      action_code,
      club_id,
      target_user_id,
      input_fingerprint
    )
    values (
      v_actor_id,
      p_request_id,
      p_action_code,
      p_club_id,
      v_target_user_id,
      v_input_fingerprint
    )
    on conflict on constraint club_mutation_requests_actor_request_unique
    do nothing;

    select
      ledger.action_code,
      ledger.club_id,
      ledger.target_user_id,
      ledger.input_fingerprint,
      ledger.outcome,
      ledger.result_data,
      ledger.completed_at
    into
      v_ledger_action_code,
      v_ledger_club_id,
      v_ledger_target_user_id,
      v_ledger_fingerprint,
      v_ledger_outcome,
      v_result_data,
      v_completed_at
    from private.club_mutation_requests as ledger
    where ledger.actor_id = v_actor_id
      and ledger.request_id = p_request_id
    for update;

    if not found then
      raise exception '요청 처리 기록을 확보할 수 없습니다.';
    end if;

    if v_ledger_action_code is distinct from p_action_code
       or v_ledger_club_id is distinct from p_club_id
       or v_ledger_target_user_id is distinct from v_target_user_id
       or v_ledger_fingerprint is distinct from v_input_fingerprint then
      raise exception '같은 요청 식별자를 다른 입력에 재사용할 수 없습니다.';
    end if;

    if v_completed_at is not null then
      return query
      select
        p_request_id,
        v_ledger_action_code,
        v_ledger_club_id,
        v_ledger_target_user_id,
        (v_result_data ->> 'membership_id')::uuid,
        v_result_data ->> 'previous_status',
        v_result_data ->> 'current_status',
        (v_result_data ->> 'changed')::boolean,
        true,
        v_ledger_outcome;
      return;
    end if;
  end if;

  select
    membership.id,
    membership.membership_status
  into
    v_membership_id,
    v_membership_status
  from public.club_memberships as membership
  where membership.club_id = p_club_id
    and membership.user_id = v_target_user_id
  for update;

  v_membership_found := found;

  if v_membership_found then
    perform assignment.id
    from public.club_role_assignments as assignment
    where assignment.membership_id = v_membership_id
      and assignment.revoked_at is null
    order by assignment.assigned_at, assignment.id
    for update;
  end if;

  if not p_self_service and v_membership_found then
    if private.club_membership_has_unrevoked_admin_assignment(v_membership_id) then
      raise exception '회장 권한을 다른 회원에게 먼저 이전해야 합니다.';
    end if;

    if private.club_membership_has_unrevoked_vice_admin_assignment(v_membership_id) then
      raise exception '부회장 역할을 먼저 해제해야 합니다.';
    end if;
  end if;

  v_previous_status := case
    when v_membership_found then v_membership_status
    else null
  end;

  if p_action_code = 'membership.activate' then
    if not v_membership_found then
      if not exists (
        select 1
        from public.club_role_definitions as role_definition
        where role_definition.role_code = 'club_member'
          and role_definition.is_active
      ) then
        raise exception '활성 일반회원 역할 정의를 찾을 수 없습니다.';
      end if;

      insert into public.club_memberships as membership (
        club_id,
        user_id,
        membership_status
      )
      values (
        p_club_id,
        v_target_user_id,
        'active'
      )
      returning membership.id into v_membership_id;

      insert into public.club_role_assignments (
        membership_id,
        role_code,
        assigned_by
      )
      values (
        v_membership_id,
        'club_member',
        v_actor_id
      );

      v_membership_created := true;
      v_member_role_created := true;
      v_changed := true;
      v_current_status := 'active';
    elsif v_membership_status = 'left' then
      if private.club_membership_has_unrevoked_admin_assignment(v_membership_id) then
        raise exception '회장 권한을 다른 회원에게 먼저 이전해야 합니다.';
      end if;

      if not exists (
        select 1
        from public.club_role_definitions as role_definition
        where role_definition.role_code = 'club_member'
          and role_definition.is_active
      ) then
        raise exception '활성 일반회원 역할 정의를 찾을 수 없습니다.';
      end if;

      update public.club_role_assignments as assignment
      set
        revoked_at = pg_catalog.now(),
        revoked_by = v_actor_id
      where assignment.membership_id = v_membership_id
        and assignment.revoked_at is null
        and assignment.role_code <> 'club_admin';

      get diagnostics v_revoked_role_count = row_count;

      update public.club_memberships as membership
      set
        membership_status = 'active',
        suspended_at = null,
        left_at = null
      where membership.id = v_membership_id;

      insert into public.club_role_assignments (
        membership_id,
        role_code,
        assigned_by
      )
      values (
        v_membership_id,
        'club_member',
        v_actor_id
      );

      v_member_role_created := true;
      v_changed := true;
      v_current_status := 'active';
    elsif v_membership_status = 'active' then
      v_current_status := 'active';
    else
      raise exception '정지된 회원은 정지 해제 작업을 사용해야 합니다.';
    end if;
  elsif p_action_code = 'membership.suspend' then
    if not v_membership_found then
      raise exception '대상 동호회 회원 관계를 찾을 수 없습니다.';
    end if;

    if private.club_membership_has_unrevoked_admin_assignment(v_membership_id) then
      raise exception '회장 권한을 다른 회원에게 먼저 이전해야 합니다.';
    end if;

    if v_membership_status = 'active' then
      update public.club_memberships as membership
      set
        membership_status = 'suspended',
        suspended_at = pg_catalog.now(),
        left_at = null
      where membership.id = v_membership_id;

      v_changed := true;
      v_current_status := 'suspended';
    elsif v_membership_status = 'suspended' then
      v_current_status := 'suspended';
    else
      raise exception '탈퇴한 회원은 정지할 수 없습니다.';
    end if;
  elsif p_action_code = 'membership.resume' then
    if not v_membership_found then
      raise exception '대상 동호회 회원 관계를 찾을 수 없습니다.';
    end if;

    if v_membership_status = 'suspended' then
      if private.club_membership_has_unrevoked_admin_assignment(v_membership_id) then
        raise exception '회장 역할이 남은 정지 회원은 전용 복구 절차가 필요합니다.';
      end if;

      update public.club_memberships as membership
      set
        membership_status = 'active',
        suspended_at = null,
        left_at = null
      where membership.id = v_membership_id;

      v_changed := true;
      v_current_status := 'active';
    elsif v_membership_status = 'active' then
      v_current_status := 'active';
    else
      raise exception '탈퇴한 회원은 가입 작업을 사용해야 합니다.';
    end if;
  elsif p_action_code = 'membership.end' then
    if not v_membership_found then
      raise exception '대상 동호회 회원 관계를 찾을 수 없습니다.';
    end if;

    if private.club_membership_has_unrevoked_admin_assignment(v_membership_id) then
      raise exception '회장 권한을 다른 회원에게 먼저 이전해야 합니다.';
    end if;

    if v_membership_status in ('active', 'suspended') then
      update public.club_role_assignments as assignment
      set
        revoked_at = pg_catalog.now(),
        revoked_by = v_actor_id
      where assignment.membership_id = v_membership_id
        and assignment.revoked_at is null
        and assignment.role_code <> 'club_admin';

      get diagnostics v_revoked_role_count = row_count;

      update public.club_memberships as membership
      set
        membership_status = 'left',
        suspended_at = null,
        left_at = pg_catalog.now()
      where membership.id = v_membership_id;

      v_changed := true;
      v_current_status := 'left';
    else
      v_current_status := 'left';
    end if;
  else
    if not v_membership_found then
      raise exception '탈퇴할 동호회 회원 관계를 찾을 수 없습니다.';
    end if;

    if private.club_membership_has_unrevoked_admin_assignment(v_membership_id) then
      raise exception '회장 권한을 다른 회원에게 먼저 이전해야 합니다.';
    end if;

    if v_membership_status in ('active', 'suspended') then
      update public.club_role_assignments as assignment
      set
        revoked_at = pg_catalog.now(),
        revoked_by = v_actor_id
      where assignment.membership_id = v_membership_id
        and assignment.revoked_at is null
        and assignment.role_code <> 'club_admin';

      get diagnostics v_revoked_role_count = row_count;

      update public.club_memberships as membership
      set
        membership_status = 'left',
        suspended_at = null,
        left_at = pg_catalog.now()
      where membership.id = v_membership_id;

      v_changed := true;
      v_current_status := 'left';
    else
      v_current_status := 'left';
    end if;
  end if;

  v_outcome := case when v_changed then 'success' else 'noop' end;

  insert into public.audit_logs (
    actor_id,
    actor_type,
    action,
    target_type,
    target_id,
    club_id,
    before_summary,
    after_summary,
    reason,
    metadata,
    request_id,
    outcome
  )
  values (
    v_actor_id,
    case when p_self_service then 'user' else 'operator' end,
    p_action_code,
    'club_membership',
    v_membership_id::text,
    p_club_id::text,
    pg_catalog.jsonb_build_object('membership_status', v_previous_status),
    pg_catalog.jsonb_build_object('membership_status', v_current_status),
    v_reason,
    pg_catalog.jsonb_build_object(
      'changed', v_changed,
      'membership_created', v_membership_created,
      'club_member_role_created', v_member_role_created,
      'revoked_role_count', v_revoked_role_count
    ),
    p_request_id,
    v_outcome
  );

  v_result_data := pg_catalog.jsonb_build_object(
    'action_code', p_action_code,
    'club_id', p_club_id,
    'target_user_id', v_target_user_id,
    'membership_id', v_membership_id,
    'previous_status', v_previous_status,
    'current_status', v_current_status,
    'changed', v_changed,
    'outcome', v_outcome
  );

  update private.club_mutation_requests as ledger
  set
    outcome = v_outcome,
    result_data = v_result_data,
    completed_at = pg_catalog.now()
  where ledger.actor_id = v_actor_id
    and ledger.request_id = p_request_id;

  get diagnostics v_completed_ledger_count = row_count;

  if v_completed_ledger_count <> 1 then
    raise exception '요청 처리 기록 완료 상태를 저장할 수 없습니다.';
  end if;

  return query
  select
    p_request_id,
    p_action_code,
    p_club_id,
    v_target_user_id,
    v_membership_id,
    v_previous_status,
    v_current_status,
    v_changed,
    false,
    v_outcome;
end;
$$;

create or replace function private.execute_club_manager_role_mutation(
  p_action_code text,
  p_club_id uuid,
  p_target_user_id uuid,
  p_request_id uuid,
  p_reason text
)
returns table (
  request_id uuid,
  action_code text,
  club_id uuid,
  target_user_id uuid,
  membership_id uuid,
  role_code text,
  role_assignment_id uuid,
  previous_active boolean,
  current_active boolean,
  changed boolean,
  replayed boolean,
  outcome text
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_account_status text;
  v_reason text;
  v_input_fingerprint text;
  v_club_status text;
  v_target_account_status text;
  v_membership_id uuid;
  v_membership_status text;
  v_member_definition_found boolean := false;
  v_member_definition_active boolean := false;
  v_manager_definition_found boolean := false;
  v_manager_definition_active boolean := false;
  v_role_definition record;
  v_member_assignment_id uuid;
  v_manager_assignment_id uuid;
  v_role_assignment_id uuid;
  v_previous_member_active boolean := false;
  v_previous_active boolean := false;
  v_current_active boolean := false;
  v_changed boolean := false;
  v_member_role_created boolean := false;
  v_manager_role_created boolean := false;
  v_manager_role_revoked boolean := false;
  v_outcome text;
  v_ledger_action_code text;
  v_ledger_club_id uuid;
  v_ledger_target_user_id uuid;
  v_ledger_role_code text;
  v_ledger_fingerprint text;
  v_ledger_outcome text;
  v_result_data jsonb;
  v_completed_at timestamptz;
  v_ledger_found boolean := false;
  v_completed_ledger_count integer := 0;
begin
  if p_action_code is null
     or p_action_code not in (
       'role.grant_manager',
       'role.revoke_manager'
     ) then
    raise exception '지원하지 않는 동호회 역할 작업입니다.';
  end if;

  if v_actor_id is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;

  if p_club_id is null then
    raise exception '동호회 식별자가 필요합니다.';
  end if;

  if p_target_user_id is null then
    raise exception '대상 회원 식별자가 필요합니다.';
  end if;

  if p_request_id is null then
    raise exception '요청 식별자가 필요합니다.';
  end if;

  if p_target_user_id = v_actor_id then
    raise exception '본인의 운영진 역할을 변경할 수 없습니다.';
  end if;

  v_reason := pg_catalog.btrim(p_reason);

  if v_reason is null
     or pg_catalog.char_length(v_reason) < 2
     or pg_catalog.char_length(v_reason) > 500 then
    raise exception '역할 변경 사유는 2자 이상 500자 이하여야 합니다.';
  end if;

  select actor_account.account_status
    into v_actor_account_status
  from public.user_accounts as actor_account
  where actor_account.id = v_actor_id
  for share;

  if not found or v_actor_account_status <> 'active' then
    raise exception '활성 계정만 동호회 역할 작업을 수행할 수 있습니다.'
      using errcode = '42501';
  end if;

  v_input_fingerprint := pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'action_code', p_action_code,
      'club_id', p_club_id,
      'target_user_id', p_target_user_id,
      'role_code', 'club_manager',
      'reason', v_reason
    )::text
  );

  select
    ledger.action_code,
    ledger.club_id,
    ledger.target_user_id,
    ledger.role_code,
    ledger.input_fingerprint,
    ledger.outcome,
    ledger.result_data,
    ledger.completed_at
  into
    v_ledger_action_code,
    v_ledger_club_id,
    v_ledger_target_user_id,
    v_ledger_role_code,
    v_ledger_fingerprint,
    v_ledger_outcome,
    v_result_data,
    v_completed_at
  from private.club_mutation_requests as ledger
  where ledger.actor_id = v_actor_id
    and ledger.request_id = p_request_id
  for update;

  v_ledger_found := found;

  if v_ledger_found then
    if v_ledger_action_code is distinct from p_action_code
       or v_ledger_club_id is distinct from p_club_id
       or v_ledger_target_user_id is distinct from p_target_user_id
       or v_ledger_role_code is distinct from 'club_manager'
       or v_ledger_fingerprint is distinct from v_input_fingerprint then
      raise exception '같은 요청 식별자를 다른 입력에 재사용할 수 없습니다.';
    end if;

    if v_completed_at is not null then
      return query
      select
        p_request_id,
        v_ledger_action_code,
        v_ledger_club_id,
        v_ledger_target_user_id,
        (v_result_data ->> 'membership_id')::uuid,
        v_result_data ->> 'role_code',
        (v_result_data ->> 'role_assignment_id')::uuid,
        (v_result_data ->> 'previous_active')::boolean,
        (v_result_data ->> 'current_active')::boolean,
        (v_result_data ->> 'changed')::boolean,
        true,
        v_ledger_outcome;
      return;
    end if;
  end if;

  select club.club_status
    into v_club_status
  from public.clubs as club
  where club.id = p_club_id
  for update;

  if not found then
    raise exception '동호회를 찾을 수 없습니다.';
  end if;

  if v_club_status <> 'active' then
    raise exception '활성 동호회에서만 역할을 변경할 수 있습니다.';
  end if;

  if not private.club_user_has_permission(
    v_actor_id,
    p_club_id,
    'club.roles.manage'
  ) then
    raise exception '동호회 역할 관리 권한이 없습니다.' using errcode = '42501';
  end if;

  if not private.club_user_is_active_admin_or_vice_admin(
    v_actor_id,
    p_club_id
  ) then
    raise exception '현재 활성 회장 또는 부회장만 일반 운영진 역할을 변경할 수 있습니다.'
      using errcode = '42501';
  end if;

  select target_account.account_status
    into v_target_account_status
  from public.user_accounts as target_account
  where target_account.id = p_target_user_id
  for share;

  if not found then
    raise exception '대상 회원 계정을 찾을 수 없습니다.';
  end if;

  if v_target_account_status <> 'active' then
    raise exception '활성 계정의 역할만 변경할 수 있습니다.';
  end if;

  if not v_ledger_found then
    insert into private.club_mutation_requests (
      actor_id,
      request_id,
      action_code,
      club_id,
      target_user_id,
      role_code,
      input_fingerprint
    )
    values (
      v_actor_id,
      p_request_id,
      p_action_code,
      p_club_id,
      p_target_user_id,
      'club_manager',
      v_input_fingerprint
    )
    on conflict on constraint club_mutation_requests_actor_request_unique
    do nothing;

    select
      ledger.action_code,
      ledger.club_id,
      ledger.target_user_id,
      ledger.role_code,
      ledger.input_fingerprint,
      ledger.outcome,
      ledger.result_data,
      ledger.completed_at
    into
      v_ledger_action_code,
      v_ledger_club_id,
      v_ledger_target_user_id,
      v_ledger_role_code,
      v_ledger_fingerprint,
      v_ledger_outcome,
      v_result_data,
      v_completed_at
    from private.club_mutation_requests as ledger
    where ledger.actor_id = v_actor_id
      and ledger.request_id = p_request_id
    for update;

    if not found then
      raise exception '요청 처리 기록을 확보할 수 없습니다.';
    end if;

    if v_ledger_action_code is distinct from p_action_code
       or v_ledger_club_id is distinct from p_club_id
       or v_ledger_target_user_id is distinct from p_target_user_id
       or v_ledger_role_code is distinct from 'club_manager'
       or v_ledger_fingerprint is distinct from v_input_fingerprint then
      raise exception '같은 요청 식별자를 다른 입력에 재사용할 수 없습니다.';
    end if;

    if v_completed_at is not null then
      return query
      select
        p_request_id,
        v_ledger_action_code,
        v_ledger_club_id,
        v_ledger_target_user_id,
        (v_result_data ->> 'membership_id')::uuid,
        v_result_data ->> 'role_code',
        (v_result_data ->> 'role_assignment_id')::uuid,
        (v_result_data ->> 'previous_active')::boolean,
        (v_result_data ->> 'current_active')::boolean,
        (v_result_data ->> 'changed')::boolean,
        true,
        v_ledger_outcome;
      return;
    end if;
  end if;

  select
    membership.id,
    membership.membership_status
  into
    v_membership_id,
    v_membership_status
  from public.club_memberships as membership
  where membership.club_id = p_club_id
    and membership.user_id = p_target_user_id
  for update;

  if not found then
    raise exception '대상 동호회 회원 관계를 찾을 수 없습니다.';
  end if;

  if v_membership_status <> 'active' then
    raise exception '정상 활동 중인 동호회 회원의 역할만 변경할 수 있습니다.';
  end if;

  for v_role_definition in
    select
      role_definition.role_code,
      role_definition.is_active
    from public.club_role_definitions as role_definition
    where role_definition.role_code in ('club_manager', 'club_member')
    order by role_definition.role_code
    for share
  loop
    if v_role_definition.role_code = 'club_member' then
      v_member_definition_found := true;
      v_member_definition_active := v_role_definition.is_active;
    elsif v_role_definition.role_code = 'club_manager' then
      v_manager_definition_found := true;
      v_manager_definition_active := v_role_definition.is_active;
    end if;
  end loop;

  if not v_member_definition_found or not v_member_definition_active then
    raise exception '활성 일반회원 역할 정의를 찾을 수 없습니다.';
  end if;

  if not v_manager_definition_found or not v_manager_definition_active then
    raise exception '활성 운영진 역할 정의를 찾을 수 없습니다.';
  end if;

  perform assignment.id
  from public.club_role_assignments as assignment
  where assignment.membership_id = v_membership_id
    and assignment.revoked_at is null
  order by assignment.role_code, assignment.assigned_at, assignment.id
  for update;

  if private.club_membership_has_unrevoked_admin_assignment(v_membership_id) then
    raise exception '회장 역할을 가진 회원은 일반 역할 작업으로 변경할 수 없습니다.';
  end if;

  if private.club_membership_has_unrevoked_vice_admin_assignment(v_membership_id) then
    raise exception '부회장은 일반 운영진 역할 작업으로 변경할 수 없습니다.';
  end if;

  select assignment.id
    into v_member_assignment_id
  from public.club_role_assignments as assignment
  where assignment.membership_id = v_membership_id
    and assignment.role_code = 'club_member'
    and assignment.revoked_at is null;

  select assignment.id
    into v_manager_assignment_id
  from public.club_role_assignments as assignment
  where assignment.membership_id = v_membership_id
    and assignment.role_code = 'club_manager'
    and assignment.revoked_at is null;

  v_previous_member_active := v_member_assignment_id is not null;
  v_previous_active := v_manager_assignment_id is not null;

  if not v_previous_member_active then
    insert into public.club_role_assignments (
      membership_id,
      role_code,
      assigned_by
    )
    values (
      v_membership_id,
      'club_member',
      v_actor_id
    )
    returning id into v_member_assignment_id;

    v_member_role_created := true;
    v_changed := true;
  end if;

  if p_action_code = 'role.grant_manager' then
    if v_manager_assignment_id is null then
      insert into public.club_role_assignments (
        membership_id,
        role_code,
        assigned_by
      )
      values (
        v_membership_id,
        'club_manager',
        v_actor_id
      )
      returning id into v_manager_assignment_id;

      v_manager_role_created := true;
      v_changed := true;
    end if;

    v_role_assignment_id := v_manager_assignment_id;
    v_current_active := true;
  else
    if v_manager_assignment_id is not null then
      update public.club_role_assignments as assignment
      set
        revoked_at = pg_catalog.now(),
        revoked_by = v_actor_id
      where assignment.id = v_manager_assignment_id
        and assignment.role_code = 'club_manager'
        and assignment.revoked_at is null
      returning assignment.id into v_role_assignment_id;

      if v_role_assignment_id is null then
        raise exception '운영진 역할 해제 상태를 저장할 수 없습니다.';
      end if;

      v_manager_role_revoked := true;
      v_changed := true;
    end if;

    v_current_active := false;
  end if;

  v_outcome := case when v_changed then 'success' else 'noop' end;

  insert into public.audit_logs (
    actor_id,
    actor_type,
    action,
    target_type,
    target_id,
    club_id,
    before_summary,
    after_summary,
    reason,
    metadata,
    request_id,
    outcome
  )
  values (
    v_actor_id,
    'operator',
    p_action_code,
    'club_membership_role',
    v_membership_id::text,
    p_club_id::text,
    pg_catalog.jsonb_build_object(
      'role_code', 'club_manager',
      'manager_active', v_previous_active,
      'member_active', v_previous_member_active
    ),
    pg_catalog.jsonb_build_object(
      'role_code', 'club_manager',
      'manager_active', v_current_active,
      'member_active', true
    ),
    v_reason,
    pg_catalog.jsonb_build_object(
      'changed', v_changed,
      'member_role_created', v_member_role_created,
      'manager_role_created', v_manager_role_created,
      'manager_role_revoked', v_manager_role_revoked,
      'manager_assignment_id', v_role_assignment_id
    ),
    p_request_id,
    v_outcome
  );

  v_result_data := pg_catalog.jsonb_build_object(
    'action_code', p_action_code,
    'club_id', p_club_id,
    'target_user_id', p_target_user_id,
    'membership_id', v_membership_id,
    'role_code', 'club_manager',
    'role_assignment_id', v_role_assignment_id,
    'previous_active', v_previous_active,
    'current_active', v_current_active,
    'changed', v_changed,
    'outcome', v_outcome
  );

  update private.club_mutation_requests as ledger
  set
    outcome = v_outcome,
    result_data = v_result_data,
    completed_at = pg_catalog.now()
  where ledger.actor_id = v_actor_id
    and ledger.request_id = p_request_id;

  get diagnostics v_completed_ledger_count = row_count;

  if v_completed_ledger_count <> 1 then
    raise exception '요청 처리 기록 완료 상태를 저장할 수 없습니다.';
  end if;

  return query
  select
    p_request_id,
    p_action_code,
    p_club_id,
    p_target_user_id,
    v_membership_id,
    'club_manager'::text,
    v_role_assignment_id,
    v_previous_active,
    v_current_active,
    v_changed,
    false,
    v_outcome;
end;
$$;

create or replace function private.execute_club_admin_transfer(
  p_club_id uuid,
  p_target_user_id uuid,
  p_request_id uuid,
  p_reason text
)
returns table (
  request_id uuid,
  action_code text,
  club_id uuid,
  previous_admin_user_id uuid,
  new_admin_user_id uuid,
  previous_admin_membership_id uuid,
  new_admin_membership_id uuid,
  previous_admin_assignment_id uuid,
  new_admin_assignment_id uuid,
  changed boolean,
  replayed boolean,
  outcome text
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_action_code constant text := 'role.transfer_admin';
  v_role_code constant text := 'club_admin';
  v_actor_id uuid := auth.uid();
  v_actor_account_status text;
  v_target_account_status text;
  v_reason text;
  v_input_fingerprint text;
  v_club_status text;
  v_membership record;
  v_actor_membership_id uuid;
  v_actor_membership_status text;
  v_actor_membership_found boolean := false;
  v_target_membership_id uuid;
  v_target_membership_status text;
  v_target_membership_found boolean := false;
  v_role_definition record;
  v_member_definition_found boolean := false;
  v_member_definition_active boolean := false;
  v_admin_definition_found boolean := false;
  v_admin_definition_active boolean := false;
  v_admin_assignment record;
  v_current_admin_count integer := 0;
  v_current_admin_user_id uuid;
  v_current_admin_membership_id uuid;
  v_previous_admin_assignment_id uuid;
  v_final_admin_count integer := 0;
  v_final_admin_user_id uuid;
  v_final_admin_membership_id uuid;
  v_final_admin_assignment_id uuid;
  v_actor_member_assignment_id uuid;
  v_target_member_assignment_id uuid;
  v_actor_member_created boolean := false;
  v_target_member_created boolean := false;
  v_actor_manager_revoked_count integer := 0;
  v_target_manager_revoked_count integer := 0;
  v_target_vice_admin_revoked_count integer := 0;
  v_revoked_admin_assignment_id uuid;
  v_new_admin_assignment_id uuid;
  v_ledger_action_code text;
  v_ledger_club_id uuid;
  v_ledger_target_user_id uuid;
  v_ledger_role_code text;
  v_ledger_fingerprint text;
  v_ledger_outcome text;
  v_result_data jsonb;
  v_completed_at timestamptz;
  v_ledger_found boolean := false;
  v_completed_ledger_count integer := 0;
begin
  if v_actor_id is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;

  if p_club_id is null then
    raise exception '동호회 식별자가 필요합니다.';
  end if;

  if p_target_user_id is null then
    raise exception '새 회장 회원 식별자가 필요합니다.';
  end if;

  if p_request_id is null then
    raise exception '요청 식별자가 필요합니다.';
  end if;

  if p_target_user_id = v_actor_id then
    raise exception '현재 회장 본인에게 회장 권한을 이전할 수 없습니다.';
  end if;

  v_reason := pg_catalog.btrim(p_reason);

  if v_reason is null
     or pg_catalog.char_length(v_reason) < 2
     or pg_catalog.char_length(v_reason) > 500 then
    raise exception '회장 이전 사유는 2자 이상 500자 이하여야 합니다.';
  end if;

  select actor_account.account_status
    into v_actor_account_status
  from public.user_accounts as actor_account
  where actor_account.id = v_actor_id
  for share;

  if not found or v_actor_account_status <> 'active' then
    raise exception '활성 계정만 회장 권한을 이전할 수 있습니다.'
      using errcode = '42501';
  end if;

  v_input_fingerprint := pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'action_code', v_action_code,
      'club_id', p_club_id,
      'target_user_id', p_target_user_id,
      'role_code', v_role_code,
      'reason', v_reason
    )::text
  );

  select
    ledger.action_code,
    ledger.club_id,
    ledger.target_user_id,
    ledger.role_code,
    ledger.input_fingerprint,
    ledger.outcome,
    ledger.result_data,
    ledger.completed_at
  into
    v_ledger_action_code,
    v_ledger_club_id,
    v_ledger_target_user_id,
    v_ledger_role_code,
    v_ledger_fingerprint,
    v_ledger_outcome,
    v_result_data,
    v_completed_at
  from private.club_mutation_requests as ledger
  where ledger.actor_id = v_actor_id
    and ledger.request_id = p_request_id
  for update;

  v_ledger_found := found;

  if v_ledger_found then
    if v_ledger_action_code is distinct from v_action_code
       or v_ledger_club_id is distinct from p_club_id
       or v_ledger_target_user_id is distinct from p_target_user_id
       or v_ledger_role_code is distinct from v_role_code
       or v_ledger_fingerprint is distinct from v_input_fingerprint then
      raise exception '같은 요청 식별자를 다른 입력에 재사용할 수 없습니다.';
    end if;

    if v_completed_at is not null then
      return query
      select
        p_request_id,
        v_ledger_action_code,
        v_ledger_club_id,
        (v_result_data ->> 'previous_admin_user_id')::uuid,
        (v_result_data ->> 'new_admin_user_id')::uuid,
        (v_result_data ->> 'previous_admin_membership_id')::uuid,
        (v_result_data ->> 'new_admin_membership_id')::uuid,
        (v_result_data ->> 'previous_admin_assignment_id')::uuid,
        (v_result_data ->> 'new_admin_assignment_id')::uuid,
        (v_result_data ->> 'changed')::boolean,
        true,
        v_ledger_outcome;
      return;
    end if;
  end if;

  select club.club_status
    into v_club_status
  from public.clubs as club
  where club.id = p_club_id
  for update;

  if not found then
    raise exception '동호회를 찾을 수 없습니다.';
  end if;

  if not v_ledger_found then
    insert into private.club_mutation_requests (
      actor_id,
      request_id,
      action_code,
      club_id,
      target_user_id,
      role_code,
      input_fingerprint
    )
    values (
      v_actor_id,
      p_request_id,
      v_action_code,
      p_club_id,
      p_target_user_id,
      v_role_code,
      v_input_fingerprint
    )
    on conflict on constraint club_mutation_requests_actor_request_unique
    do nothing;

    select
      ledger.action_code,
      ledger.club_id,
      ledger.target_user_id,
      ledger.role_code,
      ledger.input_fingerprint,
      ledger.outcome,
      ledger.result_data,
      ledger.completed_at
    into
      v_ledger_action_code,
      v_ledger_club_id,
      v_ledger_target_user_id,
      v_ledger_role_code,
      v_ledger_fingerprint,
      v_ledger_outcome,
      v_result_data,
      v_completed_at
    from private.club_mutation_requests as ledger
    where ledger.actor_id = v_actor_id
      and ledger.request_id = p_request_id
    for update;

    if not found then
      raise exception '요청 처리 기록을 확보할 수 없습니다.';
    end if;

    if v_ledger_action_code is distinct from v_action_code
       or v_ledger_club_id is distinct from p_club_id
       or v_ledger_target_user_id is distinct from p_target_user_id
       or v_ledger_role_code is distinct from v_role_code
       or v_ledger_fingerprint is distinct from v_input_fingerprint then
      raise exception '같은 요청 식별자를 다른 입력에 재사용할 수 없습니다.';
    end if;

    if v_completed_at is not null then
      return query
      select
        p_request_id,
        v_ledger_action_code,
        v_ledger_club_id,
        (v_result_data ->> 'previous_admin_user_id')::uuid,
        (v_result_data ->> 'new_admin_user_id')::uuid,
        (v_result_data ->> 'previous_admin_membership_id')::uuid,
        (v_result_data ->> 'new_admin_membership_id')::uuid,
        (v_result_data ->> 'previous_admin_assignment_id')::uuid,
        (v_result_data ->> 'new_admin_assignment_id')::uuid,
        (v_result_data ->> 'changed')::boolean,
        true,
        v_ledger_outcome;
      return;
    end if;
  end if;

  if v_club_status <> 'active' then
    raise exception '활성 동호회에서만 회장 권한을 이전할 수 있습니다.';
  end if;

  if not private.club_user_has_permission(
    v_actor_id,
    p_club_id,
    'club.roles.manage'
  ) then
    raise exception '동호회 역할 관리 권한이 없습니다.' using errcode = '42501';
  end if;

  if not private.club_user_is_active_admin(
    v_actor_id,
    p_club_id
  ) then
    raise exception '현재 활성 회장만 회장 권한을 이전할 수 있습니다.'
      using errcode = '42501';
  end if;

  select target_account.account_status
    into v_target_account_status
  from public.user_accounts as target_account
  where target_account.id = p_target_user_id
  for share;

  if not found then
    raise exception '새 회장 계정을 찾을 수 없습니다.';
  end if;

  if v_target_account_status <> 'active' then
    raise exception '활성 계정에게만 회장 권한을 이전할 수 있습니다.';
  end if;

  for v_membership in
    select
      membership.id,
      membership.user_id,
      membership.membership_status
    from public.club_memberships as membership
    where membership.club_id = p_club_id
      and membership.user_id in (v_actor_id, p_target_user_id)
    order by membership.id
    for update
  loop
    if v_membership.user_id = v_actor_id then
      v_actor_membership_id := v_membership.id;
      v_actor_membership_status := v_membership.membership_status;
      v_actor_membership_found := true;
    elsif v_membership.user_id = p_target_user_id then
      v_target_membership_id := v_membership.id;
      v_target_membership_status := v_membership.membership_status;
      v_target_membership_found := true;
    end if;
  end loop;

  if not v_actor_membership_found
     or v_actor_membership_status <> 'active' then
    raise exception '현재 회장의 활성 동호회 회원 관계를 확인할 수 없습니다.';
  end if;

  if not v_target_membership_found then
    raise exception '새 회장의 동호회 회원 관계를 찾을 수 없습니다.';
  end if;

  if v_target_membership_status <> 'active' then
    raise exception '정상 활동 중인 회원에게만 회장 권한을 이전할 수 있습니다.';
  end if;

  for v_role_definition in
    select
      role_definition.role_code,
      role_definition.is_active
    from public.club_role_definitions as role_definition
    where role_definition.role_code in ('club_admin', 'club_member')
    order by role_definition.role_code
    for share
  loop
    if v_role_definition.role_code = 'club_member' then
      v_member_definition_found := true;
      v_member_definition_active := v_role_definition.is_active;
    elsif v_role_definition.role_code = 'club_admin' then
      v_admin_definition_found := true;
      v_admin_definition_active := v_role_definition.is_active;
    end if;
  end loop;

  if not v_member_definition_found or not v_member_definition_active then
    raise exception '활성 일반회원 역할 정의를 찾을 수 없습니다.';
  end if;

  if not v_admin_definition_found or not v_admin_definition_active then
    raise exception '활성 회장 역할 정의를 찾을 수 없습니다.';
  end if;

  for v_admin_assignment in
    select
      assignment.id as assignment_id,
      membership.id as membership_id,
      membership.user_id,
      membership.membership_status
    from public.club_role_assignments as assignment
    join public.club_memberships as membership
      on membership.id = assignment.membership_id
    where membership.club_id = p_club_id
      and assignment.role_code = 'club_admin'
      and assignment.revoked_at is null
    order by assignment.id
    for update of assignment
  loop
    v_current_admin_count := v_current_admin_count + 1;

    if v_current_admin_count = 1 then
      v_current_admin_user_id := v_admin_assignment.user_id;
      v_current_admin_membership_id := v_admin_assignment.membership_id;
      v_previous_admin_assignment_id := v_admin_assignment.assignment_id;
      v_actor_membership_status := v_admin_assignment.membership_status;
    end if;
  end loop;

  if v_current_admin_count <> 1
     or v_current_admin_user_id is distinct from v_actor_id
     or v_current_admin_membership_id is distinct from v_actor_membership_id
     or v_actor_membership_status <> 'active' then
    raise exception '현재 회장 상태를 자동으로 이전할 수 없어 별도 복구가 필요합니다.';
  end if;

  perform assignment.id
  from public.club_role_assignments as assignment
  where assignment.membership_id in (
      v_actor_membership_id,
      v_target_membership_id
    )
    and assignment.revoked_at is null
  order by assignment.membership_id, assignment.role_code, assignment.id
  for update;

  if private.club_membership_has_unrevoked_vice_admin_assignment(
    v_actor_membership_id
  ) then
    raise exception '현재 회장이 부회장 역할도 보유하여 별도 복구가 필요합니다.';
  end if;

  if private.club_membership_has_unrevoked_admin_assignment(
    v_target_membership_id
  ) then
    raise exception '이미 해제되지 않은 회장 역할을 가진 회원에게 이전할 수 없습니다.';
  end if;

  select assignment.id
    into v_actor_member_assignment_id
  from public.club_role_assignments as assignment
  where assignment.membership_id = v_actor_membership_id
    and assignment.role_code = 'club_member'
    and assignment.revoked_at is null;

  select assignment.id
    into v_target_member_assignment_id
  from public.club_role_assignments as assignment
  where assignment.membership_id = v_target_membership_id
    and assignment.role_code = 'club_member'
    and assignment.revoked_at is null;

  if v_actor_member_assignment_id is null then
    insert into public.club_role_assignments (
      membership_id,
      role_code,
      assigned_by
    )
    values (
      v_actor_membership_id,
      'club_member',
      v_actor_id
    )
    returning id into v_actor_member_assignment_id;

    v_actor_member_created := true;
  end if;

  if v_target_member_assignment_id is null then
    insert into public.club_role_assignments (
      membership_id,
      role_code,
      assigned_by
    )
    values (
      v_target_membership_id,
      'club_member',
      v_actor_id
    )
    returning id into v_target_member_assignment_id;

    v_target_member_created := true;
  end if;

  update public.club_role_assignments as assignment
  set
    revoked_at = pg_catalog.now(),
    revoked_by = v_actor_id
  where assignment.membership_id = v_actor_membership_id
    and assignment.role_code = 'club_manager'
    and assignment.revoked_at is null;

  get diagnostics v_actor_manager_revoked_count = row_count;

  update public.club_role_assignments as assignment
  set
    revoked_at = pg_catalog.now(),
    revoked_by = v_actor_id
  where assignment.membership_id = v_target_membership_id
    and assignment.role_code = 'club_manager'
    and assignment.revoked_at is null;

  get diagnostics v_target_manager_revoked_count = row_count;

  update public.club_role_assignments as assignment
  set
    revoked_at = pg_catalog.now(),
    revoked_by = v_actor_id
  where assignment.membership_id = v_target_membership_id
    and assignment.role_code = 'club_vice_admin'
    and assignment.revoked_at is null;

  get diagnostics v_target_vice_admin_revoked_count = row_count;

  update public.club_role_assignments as assignment
  set
    revoked_at = pg_catalog.now(),
    revoked_by = v_actor_id
  where assignment.id = v_previous_admin_assignment_id
    and assignment.membership_id = v_actor_membership_id
    and assignment.role_code = 'club_admin'
    and assignment.revoked_at is null
  returning assignment.id into v_revoked_admin_assignment_id;

  if v_revoked_admin_assignment_id is distinct from v_previous_admin_assignment_id then
    raise exception '이전 회장 역할을 해제할 수 없습니다.';
  end if;

  insert into public.club_role_assignments (
    membership_id,
    role_code,
    assigned_by
  )
  values (
    v_target_membership_id,
    'club_admin',
    v_actor_id
  )
  returning id into v_new_admin_assignment_id;

  v_final_admin_count := 0;
  v_final_admin_user_id := null;
  v_final_admin_membership_id := null;
  v_final_admin_assignment_id := null;

  for v_admin_assignment in
    select
      assignment.id as assignment_id,
      membership.id as membership_id,
      membership.user_id,
      membership.membership_status
    from public.club_role_assignments as assignment
    join public.club_memberships as membership
      on membership.id = assignment.membership_id
    where membership.club_id = p_club_id
      and assignment.role_code = 'club_admin'
      and assignment.revoked_at is null
    order by assignment.id
    for update of assignment
  loop
    v_final_admin_count := v_final_admin_count + 1;

    if v_final_admin_count = 1 then
      v_final_admin_user_id := v_admin_assignment.user_id;
      v_final_admin_membership_id := v_admin_assignment.membership_id;
      v_final_admin_assignment_id := v_admin_assignment.assignment_id;
      v_target_membership_status := v_admin_assignment.membership_status;
    end if;
  end loop;

  if v_final_admin_count <> 1
     or v_final_admin_user_id is distinct from p_target_user_id
     or v_final_admin_membership_id is distinct from v_target_membership_id
     or v_final_admin_assignment_id is distinct from v_new_admin_assignment_id
     or v_target_membership_status <> 'active' then
    raise exception '회장 권한 이전 결과를 확인할 수 없습니다.';
  end if;

  if private.club_membership_has_unrevoked_vice_admin_assignment(
    v_target_membership_id
  ) then
    raise exception '신임 회장의 부회장 역할 해제 결과를 확인할 수 없습니다.';
  end if;

  insert into public.audit_logs (
    actor_id,
    actor_type,
    action,
    target_type,
    target_id,
    club_id,
    before_summary,
    after_summary,
    reason,
    metadata,
    request_id,
    outcome
  )
  values (
    v_actor_id,
    'operator',
    v_action_code,
    'club_admin_transfer',
    p_club_id::text,
    p_club_id::text,
    pg_catalog.jsonb_build_object(
      'previous_admin_user_id', v_actor_id,
      'previous_admin_membership_id', v_actor_membership_id,
      'previous_admin_assignment_id', v_previous_admin_assignment_id,
      'new_admin_user_id', p_target_user_id,
      'previous_admin_count', v_current_admin_count
    ),
    pg_catalog.jsonb_build_object(
      'previous_admin_user_id', v_actor_id,
      'new_admin_user_id', p_target_user_id,
      'new_admin_membership_id', v_target_membership_id,
      'new_admin_assignment_id', v_new_admin_assignment_id,
      'current_admin_count', v_final_admin_count
    ),
    v_reason,
    pg_catalog.jsonb_build_object(
      'previous_admin_member_created', v_actor_member_created,
      'new_admin_member_created', v_target_member_created,
      'previous_admin_manager_revoked_count', v_actor_manager_revoked_count,
      'new_admin_manager_revoked_count', v_target_manager_revoked_count,
      'new_admin_vice_admin_revoked_count', v_target_vice_admin_revoked_count,
      'previous_admin_assignment_revoked', true,
      'new_admin_assignment_created', true
    ),
    p_request_id,
    'success'
  );

  v_result_data := pg_catalog.jsonb_build_object(
    'action_code', v_action_code,
    'club_id', p_club_id,
    'previous_admin_user_id', v_actor_id,
    'new_admin_user_id', p_target_user_id,
    'previous_admin_membership_id', v_actor_membership_id,
    'new_admin_membership_id', v_target_membership_id,
    'previous_admin_assignment_id', v_previous_admin_assignment_id,
    'new_admin_assignment_id', v_new_admin_assignment_id,
    'changed', true,
    'outcome', 'success'
  );

  update private.club_mutation_requests as ledger
  set
    outcome = 'success',
    result_data = v_result_data,
    completed_at = pg_catalog.now()
  where ledger.actor_id = v_actor_id
    and ledger.request_id = p_request_id;

  get diagnostics v_completed_ledger_count = row_count;

  if v_completed_ledger_count <> 1 then
    raise exception '요청 처리 기록 완료 상태를 저장할 수 없습니다.';
  end if;

  return query
  select
    p_request_id,
    v_action_code,
    p_club_id,
    v_actor_id,
    p_target_user_id,
    v_actor_membership_id,
    v_target_membership_id,
    v_previous_admin_assignment_id,
    v_new_admin_assignment_id,
    true,
    false,
    'success'::text;
end;
$$;

comment on function private.execute_club_membership_mutation(text, uuid, uuid, uuid, text, boolean) is
  'Membership mutation engine extended to active club administrators and vice administrators while protecting leadership targets.';

revoke all on function private.execute_club_membership_mutation(text, uuid, uuid, uuid, text, boolean)
  from public, anon, authenticated, service_role;

comment on function private.execute_club_manager_role_mutation(text, uuid, uuid, uuid, text) is
  'Manager role mutation engine extended to active club administrators and vice administrators while excluding vice targets.';

revoke all on function private.execute_club_manager_role_mutation(text, uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;

comment on function private.execute_club_admin_transfer(uuid, uuid, uuid, text) is
  'Admin-only transfer engine that revokes a target vice role before creating the new club_admin assignment.';

revoke all on function private.execute_club_admin_transfer(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;

revoke all on function public.activate_club_membership(uuid, uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.activate_club_membership(uuid, uuid, uuid, text) to authenticated;
revoke all on function public.suspend_club_membership(uuid, uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.suspend_club_membership(uuid, uuid, uuid, text) to authenticated;
revoke all on function public.resume_club_membership(uuid, uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.resume_club_membership(uuid, uuid, uuid, text) to authenticated;
revoke all on function public.end_club_membership(uuid, uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.end_club_membership(uuid, uuid, uuid, text) to authenticated;
revoke all on function public.leave_current_club_membership(uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.leave_current_club_membership(uuid, uuid, text) to authenticated;
revoke all on function public.grant_club_manager_role(uuid, uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.grant_club_manager_role(uuid, uuid, uuid, text) to authenticated;
revoke all on function public.revoke_club_manager_role(uuid, uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.revoke_club_manager_role(uuid, uuid, uuid, text) to authenticated;
revoke all on function public.transfer_club_admin(uuid, uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.transfer_club_admin(uuid, uuid, uuid, text) to authenticated;
