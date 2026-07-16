-- PUL 8-3B-2B-4B: atomic club administrator transfer and single-admin guard.
-- General role mutations remain unable to grant or revoke club_admin.

create function private.enforce_single_unrevoked_club_admin_per_club()
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
  if new.role_code is distinct from 'club_admin'
     or new.revoked_at is not null then
    return new;
  end if;

  select membership.club_id
    into v_club_id
  from public.club_memberships as membership
  where membership.id = new.membership_id;

  if not found then
    raise exception '회장 역할의 동호회 회원 관계를 찾을 수 없습니다.';
  end if;

  select club.id
    into v_locked_club_id
  from public.clubs as club
  where club.id = v_club_id
  for update;

  if not found then
    raise exception '회장 역할의 동호회를 찾을 수 없습니다.';
  end if;

  if exists (
    select 1
    from public.club_role_assignments as assignment
    join public.club_memberships as membership
      on membership.id = assignment.membership_id
    where membership.club_id = v_club_id
      and assignment.role_code = 'club_admin'
      and assignment.revoked_at is null
      and assignment.id <> new.id
  ) then
    raise exception '동호회에는 해제되지 않은 회장 역할이 한 명만 존재할 수 있습니다.';
  end if;

  return new;
end;
$$;

comment on function private.enforce_single_unrevoked_club_admin_per_club() is
  'Rejects a second unrevoked club_admin assignment in the same club after serializing on the club row.';

revoke all on function private.enforce_single_unrevoked_club_admin_per_club()
  from public, anon, authenticated, service_role;

create trigger club_role_assignments_single_admin_after_insert
after insert on public.club_role_assignments
for each row
when (new.role_code = 'club_admin' and new.revoked_at is null)
execute function private.enforce_single_unrevoked_club_admin_per_club();

create trigger club_role_assignments_single_admin_after_update
after update of membership_id, role_code, revoked_at
on public.club_role_assignments
for each row
when (new.role_code = 'club_admin' and new.revoked_at is null)
execute function private.enforce_single_unrevoked_club_admin_per_club();

create function private.execute_club_admin_transfer(
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

comment on function private.execute_club_admin_transfer(uuid, uuid, uuid, text) is
  'Internal atomic club_admin transfer engine with completed-request replay, role normalization, and audit logging.';

revoke all on function private.execute_club_admin_transfer(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;

create function public.transfer_club_admin(
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
language sql
volatile
security definer
set search_path = ''
as $$
  select *
  from private.execute_club_admin_transfer(
    p_club_id,
    p_target_user_id,
    p_request_id,
    p_reason
  );
$$;

comment on function public.transfer_club_admin(uuid, uuid, uuid, text) is
  'Allows the current active club administrator to atomically transfer club_admin to another active member.';

revoke all on function public.transfer_club_admin(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.transfer_club_admin(uuid, uuid, uuid, text)
  to authenticated;
