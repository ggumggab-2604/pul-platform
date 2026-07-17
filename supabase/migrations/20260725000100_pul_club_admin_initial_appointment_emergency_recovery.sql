-- PUL 8-3B-2B-4D: service-only initial club administrator appointment and
-- emergency recovery when no valid administrator remains.
-- Existing membership, role, RLS, audit, and idempotency structures are reused.

create unique index club_mutation_requests_admin_recovery_request_unique_idx
  on private.club_mutation_requests (request_id)
  where action_code in (
    'role.appoint_initial_admin',
    'role.recover_missing_admin'
  );

comment on index private.club_mutation_requests_admin_recovery_request_unique_idx is
  'Makes request IDs globally unique across the two service-only club administrator recovery operations.';

create function private.enforce_guarded_club_admin_assignment_mutation()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_club_id uuid;
  v_target_user_id uuid;
  v_existing_admin_user_id uuid;
  v_context_request_id uuid;
  v_context_action_code text;
  v_context_actor_id uuid;
  v_context_club_id uuid;
  v_context_target_user_id uuid;
begin
  v_context_request_id := nullif(
    pg_catalog.current_setting('pul.club_admin_mutation_request_id', true),
    ''
  )::uuid;
  v_context_action_code := nullif(
    pg_catalog.current_setting('pul.club_admin_mutation_action_code', true),
    ''
  );
  v_context_actor_id := nullif(
    pg_catalog.current_setting('pul.club_admin_mutation_actor_id', true),
    ''
  )::uuid;
  v_context_club_id := nullif(
    pg_catalog.current_setting('pul.club_admin_mutation_club_id', true),
    ''
  )::uuid;
  v_context_target_user_id := nullif(
    pg_catalog.current_setting('pul.club_admin_mutation_target_user_id', true),
    ''
  )::uuid;

  if v_context_request_id is null
     or v_context_action_code is null
     or v_context_actor_id is null
     or v_context_club_id is null
     or v_context_target_user_id is null
     or v_context_action_code not in (
       'role.transfer_admin',
       'role.appoint_initial_admin',
       'role.recover_missing_admin'
     ) then
    raise exception '승인된 회장 역할 변경 context가 필요합니다.'
      using errcode = '42501';
  end if;

  perform ledger.id
  from private.club_mutation_requests as ledger
  where ledger.actor_id = v_context_actor_id
    and ledger.request_id = v_context_request_id
    and ledger.action_code = v_context_action_code
    and ledger.club_id = v_context_club_id
    and ledger.target_user_id = v_context_target_user_id
    and ledger.role_code = 'club_admin'
    and ledger.input_fingerprint is not null
    and ledger.outcome is null
    and ledger.result_data is null
    and ledger.completed_at is null
  for share;

  if not found then
    raise exception '현재 회장 역할 변경 context와 일치하는 미완료 요청을 찾을 수 없습니다.'
      using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if new.role_code is distinct from 'club_admin' then
      return new;
    end if;

    if new.revoked_at is not null then
      raise exception '해제된 회장 역할 이력을 직접 생성할 수 없습니다.';
    end if;

    select
      membership.club_id,
      membership.user_id
    into
      v_club_id,
      v_target_user_id
    from public.club_memberships as membership
    where membership.id = new.membership_id;

    if not found then
      raise exception '회장 역할을 연결할 동호회 회원 관계를 찾을 수 없습니다.';
    end if;

    if v_club_id is distinct from v_context_club_id
       or v_target_user_id is distinct from v_context_target_user_id
       or new.assigned_by is distinct from v_context_actor_id then
      raise exception '회장 역할 생성 대상이 승인된 요청 context와 일치하지 않습니다.'
        using errcode = '42501';
    end if;

    return new;
  end if;

  if old.role_code is distinct from 'club_admin'
     and new.role_code is distinct from 'club_admin' then
    return new;
  end if;

  if new.membership_id is distinct from old.membership_id
     or new.role_code is distinct from old.role_code then
    raise exception '회장 역할의 회원 관계 또는 역할 코드를 직접 변경할 수 없습니다.'
      using errcode = '42501';
  end if;

  if old.role_code = 'club_admin'
     and old.revoked_at is null
     and new.revoked_at is not null then
    select
      membership.club_id,
      membership.user_id
    into
      v_club_id,
      v_existing_admin_user_id
    from public.club_memberships as membership
    where membership.id = old.membership_id;

    if not found then
      raise exception '회장 역할의 동호회 회원 관계를 찾을 수 없습니다.';
    end if;

    if v_context_action_code not in (
         'role.transfer_admin',
         'role.recover_missing_admin'
       )
       or v_club_id is distinct from v_context_club_id
       or new.revoked_by is distinct from v_context_actor_id
       or (
         v_context_action_code = 'role.transfer_admin'
         and v_existing_admin_user_id is distinct from v_context_actor_id
       ) then
      raise exception '회장 역할 해제 대상이 승인된 요청 context와 일치하지 않습니다.'
        using errcode = '42501';
    end if;

    return new;
  end if;

  raise exception '회장 역할을 직접 재활성화하거나 이력을 변경할 수 없습니다.'
    using errcode = '42501';
end;
$$;

comment on function private.enforce_guarded_club_admin_assignment_mutation() is
  'Allows club_admin assignment creation or revocation only while an approved private mutation ledger claim is incomplete.';

revoke all on function private.enforce_guarded_club_admin_assignment_mutation()
  from public, anon, authenticated, service_role;

create trigger club_role_assignments_admin_guard_before_insert
before insert on public.club_role_assignments
for each row
when (new.role_code = 'club_admin')
execute function private.enforce_guarded_club_admin_assignment_mutation();

create trigger club_role_assignments_admin_guard_before_update
before update of membership_id, role_code, revoked_at
on public.club_role_assignments
for each row
when (
  old.role_code = 'club_admin'
  or new.role_code = 'club_admin'
)
execute function private.enforce_guarded_club_admin_assignment_mutation();

create function private.execute_club_admin_absence_mutation(
  p_action_code text,
  p_club_id uuid,
  p_target_user_id uuid,
  p_operator_user_id uuid,
  p_request_id uuid,
  p_reason text
)
returns table (
  request_id uuid,
  action_code text,
  club_id uuid,
  operator_user_id uuid,
  new_admin_user_id uuid,
  new_admin_membership_id uuid,
  new_admin_assignment_id uuid,
  audit_log_id uuid,
  previous_admins jsonb,
  revoked_previous_admins jsonb,
  revoked_conflicting_roles jsonb,
  member_created boolean,
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
  v_role_code constant text := 'club_admin';
  v_reason text;
  v_input_fingerprint text;
  v_operator_account_status text;
  v_target_account_status text;
  v_club_status text;
  v_target_membership_id uuid;
  v_target_membership_status text;
  v_role_definition record;
  v_member_definition_found boolean := false;
  v_member_definition_active boolean := false;
  v_admin_definition_found boolean := false;
  v_admin_definition_active boolean := false;
  v_admin_assignment record;
  v_admin_account_status text;
  v_historical_admin_count integer := 0;
  v_valid_admin_count integer := 0;
  v_unrevoked_invalid_admin_count integer := 0;
  v_invalid_admin_assignment_ids uuid[] := array[]::uuid[];
  v_previous_admins jsonb := '[]'::jsonb;
  v_revoked_previous_admins jsonb := '[]'::jsonb;
  v_revoked_conflicting_roles jsonb := '[]'::jsonb;
  v_revoked_admin_count integer := 0;
  v_manager_revoked_count integer := 0;
  v_vice_admin_revoked_count integer := 0;
  v_member_assignment_id uuid;
  v_member_created boolean := false;
  v_new_admin_assignment_id uuid;
  v_audit_log_id uuid;
  v_final_unrevoked_admin_count integer := 0;
  v_final_valid_admin_count integer := 0;
  v_final_admin_user_id uuid;
  v_ledger_actor_id uuid;
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
  v_previous_context_request_id text;
  v_previous_context_action_code text;
  v_previous_context_actor_id text;
  v_previous_context_club_id text;
  v_previous_context_target_user_id text;
  v_context_set boolean := false;
begin
  if p_action_code is null
     or p_action_code not in (
       'role.appoint_initial_admin',
       'role.recover_missing_admin'
     ) then
    raise exception '지원하지 않는 회장 부재 처리 작업입니다.';
  end if;

  if p_club_id is null then
    raise exception '동호회 식별자가 필요합니다.';
  end if;

  if p_target_user_id is null then
    raise exception '새 회장 회원 식별자가 필요합니다.';
  end if;

  if p_operator_user_id is null then
    raise exception '실제 실행 관리자 사용자 식별자가 필요합니다.';
  end if;

  if p_request_id is null then
    raise exception '요청 식별자가 필요합니다.';
  end if;

  v_reason := pg_catalog.btrim(p_reason);

  if v_reason is null
     or pg_catalog.char_length(v_reason) < 2
     or pg_catalog.char_length(v_reason) > 500 then
    raise exception '회장 임명 또는 복구 사유는 2자 이상 500자 이하여야 합니다.';
  end if;

  select account.account_status
    into v_operator_account_status
  from public.user_accounts as account
  where account.id = p_operator_user_id
  for share;

  if not found or v_operator_account_status <> 'active' then
    raise exception '활성 PUL 사용자만 실제 실행 관리자로 기록할 수 있습니다.'
      using errcode = '42501';
  end if;

  v_input_fingerprint := pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'action_code', p_action_code,
      'club_id', p_club_id,
      'target_user_id', p_target_user_id,
      'operator_user_id', p_operator_user_id,
      'role_code', v_role_code,
      'reason', v_reason
    )::text
  );

  select
    ledger.actor_id,
    ledger.action_code,
    ledger.club_id,
    ledger.target_user_id,
    ledger.role_code,
    ledger.input_fingerprint,
    ledger.outcome,
    ledger.result_data,
    ledger.completed_at
  into
    v_ledger_actor_id,
    v_ledger_action_code,
    v_ledger_club_id,
    v_ledger_target_user_id,
    v_ledger_role_code,
    v_ledger_fingerprint,
    v_ledger_outcome,
    v_result_data,
    v_completed_at
  from private.club_mutation_requests as ledger
  where ledger.request_id = p_request_id
  order by ledger.created_at, ledger.id
  limit 1
  for update;

  v_ledger_found := found;

  if v_ledger_found then
    if v_ledger_actor_id is distinct from p_operator_user_id
       or v_ledger_action_code is distinct from p_action_code
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
        v_ledger_actor_id,
        (v_result_data ->> 'new_admin_user_id')::uuid,
        (v_result_data ->> 'new_admin_membership_id')::uuid,
        (v_result_data ->> 'new_admin_assignment_id')::uuid,
        (v_result_data ->> 'audit_log_id')::uuid,
        coalesce(v_result_data -> 'previous_admins', '[]'::jsonb),
        coalesce(v_result_data -> 'revoked_previous_admins', '[]'::jsonb),
        coalesce(v_result_data -> 'revoked_conflicting_roles', '[]'::jsonb),
        coalesce((v_result_data ->> 'member_created')::boolean, false),
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
      p_operator_user_id,
      p_request_id,
      p_action_code,
      p_club_id,
      p_target_user_id,
      v_role_code,
      v_input_fingerprint
    )
    on conflict do nothing;

    select
      ledger.actor_id,
      ledger.action_code,
      ledger.club_id,
      ledger.target_user_id,
      ledger.role_code,
      ledger.input_fingerprint,
      ledger.outcome,
      ledger.result_data,
      ledger.completed_at
    into
      v_ledger_actor_id,
      v_ledger_action_code,
      v_ledger_club_id,
      v_ledger_target_user_id,
      v_ledger_role_code,
      v_ledger_fingerprint,
      v_ledger_outcome,
      v_result_data,
      v_completed_at
    from private.club_mutation_requests as ledger
    where ledger.request_id = p_request_id
    order by ledger.created_at, ledger.id
    limit 1
    for update;

    if not found then
      raise exception '요청 처리 기록을 확보할 수 없습니다.';
    end if;

    if v_ledger_actor_id is distinct from p_operator_user_id
       or v_ledger_action_code is distinct from p_action_code
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
        v_ledger_actor_id,
        (v_result_data ->> 'new_admin_user_id')::uuid,
        (v_result_data ->> 'new_admin_membership_id')::uuid,
        (v_result_data ->> 'new_admin_assignment_id')::uuid,
        (v_result_data ->> 'audit_log_id')::uuid,
        coalesce(v_result_data -> 'previous_admins', '[]'::jsonb),
        coalesce(v_result_data -> 'revoked_previous_admins', '[]'::jsonb),
        coalesce(v_result_data -> 'revoked_conflicting_roles', '[]'::jsonb),
        coalesce((v_result_data ->> 'member_created')::boolean, false),
        (v_result_data ->> 'changed')::boolean,
        true,
        v_ledger_outcome;
      return;
    end if;
  end if;

  if v_club_status <> 'active' then
    raise exception '활성 동호회에서만 최초 회장 임명 또는 긴급 복구를 수행할 수 있습니다.';
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
      assignment.revoked_at,
      membership.id as membership_id,
      membership.user_id,
      membership.membership_status
    from public.club_role_assignments as assignment
    join public.club_memberships as membership
      on membership.id = assignment.membership_id
    where membership.club_id = p_club_id
      and assignment.role_code = 'club_admin'
    order by assignment.id
    for update of assignment, membership
  loop
    v_historical_admin_count := v_historical_admin_count + 1;

    select account.account_status
      into v_admin_account_status
    from public.user_accounts as account
    where account.id = v_admin_assignment.user_id
    for share;

    v_previous_admins := v_previous_admins
      || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'user_id', v_admin_assignment.user_id,
          'membership_id', v_admin_assignment.membership_id,
          'assignment_id', v_admin_assignment.assignment_id,
          'assignment_active', v_admin_assignment.revoked_at is null,
          'membership_status', v_admin_assignment.membership_status,
          'account_status', v_admin_account_status
        )
      );

    if v_admin_assignment.revoked_at is null
       and v_admin_assignment.membership_status = 'active'
       and v_admin_account_status = 'active' then
      v_valid_admin_count := v_valid_admin_count + 1;
    elsif v_admin_assignment.revoked_at is null then
      v_unrevoked_invalid_admin_count := v_unrevoked_invalid_admin_count + 1;
      v_invalid_admin_assignment_ids := pg_catalog.array_append(
        v_invalid_admin_assignment_ids,
        v_admin_assignment.assignment_id
      );
      v_revoked_previous_admins := v_revoked_previous_admins
        || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'user_id', v_admin_assignment.user_id,
            'membership_id', v_admin_assignment.membership_id,
            'assignment_id', v_admin_assignment.assignment_id,
            'membership_status', v_admin_assignment.membership_status,
            'account_status', v_admin_account_status
          )
        );
    end if;
  end loop;

  if v_valid_admin_count > 0 then
    raise exception '현재 유효한 회장이 존재하여 최초 임명 또는 긴급 복구를 수행할 수 없습니다.';
  end if;

  if p_action_code = 'role.appoint_initial_admin'
     and v_historical_admin_count <> 0 then
    raise exception '과거 회장 역할 이력이 있어 최초 회장 임명을 사용할 수 없습니다.';
  end if;

  if p_action_code = 'role.recover_missing_admin'
     and v_historical_admin_count = 0 then
    raise exception '과거 회장 역할 이력이 없어 긴급 복구를 사용할 수 없습니다.';
  end if;

  select account.account_status
    into v_target_account_status
  from public.user_accounts as account
  where account.id = p_target_user_id
  for share;

  if not found then
    raise exception '새 회장 계정을 찾을 수 없습니다.';
  end if;

  if v_target_account_status <> 'active' then
    raise exception '활성 계정인 회원만 새 회장이 될 수 있습니다.';
  end if;

  select
    membership.id,
    membership.membership_status
  into
    v_target_membership_id,
    v_target_membership_status
  from public.club_memberships as membership
  where membership.club_id = p_club_id
    and membership.user_id = p_target_user_id
  for update;

  if not found then
    raise exception '새 회장의 동호회 회원 관계를 찾을 수 없습니다.';
  end if;

  if v_target_membership_status <> 'active' then
    raise exception '정상 활동 중인 회원만 새 회장이 될 수 있습니다.';
  end if;

  perform assignment.id
  from public.club_role_assignments as assignment
  where assignment.membership_id = v_target_membership_id
  order by assignment.role_code, assignment.assigned_at, assignment.id
  for update;

  if exists (
    select 1
    from public.club_role_assignments as assignment
    where assignment.membership_id = v_target_membership_id
      and assignment.role_code = 'club_admin'
      and assignment.revoked_at is null
  ) then
    raise exception '새 회장 후보에게 해제되지 않은 회장 역할이 남아 있습니다.';
  end if;

  select assignment.id
    into v_member_assignment_id
  from public.club_role_assignments as assignment
  where assignment.membership_id = v_target_membership_id
    and assignment.role_code = 'club_member'
    and assignment.revoked_at is null;

  if v_member_assignment_id is null then
    insert into public.club_role_assignments (
      membership_id,
      role_code,
      assigned_by
    )
    values (
      v_target_membership_id,
      'club_member',
      p_operator_user_id
    )
    returning id into v_member_assignment_id;

    v_member_created := true;
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'assignment_id', assignment.id,
        'role_code', assignment.role_code
      )
      order by assignment.role_code, assignment.id
    ),
    '[]'::jsonb
  )
  into v_revoked_conflicting_roles
  from public.club_role_assignments as assignment
  where assignment.membership_id = v_target_membership_id
    and assignment.role_code in ('club_manager', 'club_vice_admin')
    and assignment.revoked_at is null;

  v_previous_context_request_id := pg_catalog.current_setting(
    'pul.club_admin_mutation_request_id',
    true
  );
  v_previous_context_action_code := pg_catalog.current_setting(
    'pul.club_admin_mutation_action_code',
    true
  );
  v_previous_context_actor_id := pg_catalog.current_setting(
    'pul.club_admin_mutation_actor_id',
    true
  );
  v_previous_context_club_id := pg_catalog.current_setting(
    'pul.club_admin_mutation_club_id',
    true
  );
  v_previous_context_target_user_id := pg_catalog.current_setting(
    'pul.club_admin_mutation_target_user_id',
    true
  );

  perform pg_catalog.set_config(
    'pul.club_admin_mutation_request_id',
    p_request_id::text,
    true
  );
  perform pg_catalog.set_config(
    'pul.club_admin_mutation_action_code',
    p_action_code,
    true
  );
  perform pg_catalog.set_config(
    'pul.club_admin_mutation_actor_id',
    p_operator_user_id::text,
    true
  );
  perform pg_catalog.set_config(
    'pul.club_admin_mutation_club_id',
    p_club_id::text,
    true
  );
  perform pg_catalog.set_config(
    'pul.club_admin_mutation_target_user_id',
    p_target_user_id::text,
    true
  );
  v_context_set := true;

  if p_action_code = 'role.recover_missing_admin'
     and coalesce(
       pg_catalog.array_length(v_invalid_admin_assignment_ids, 1),
       0
     ) > 0 then
    update public.club_role_assignments as assignment
    set
      revoked_at = pg_catalog.now(),
      revoked_by = p_operator_user_id
    where assignment.id = any(v_invalid_admin_assignment_ids)
      and assignment.role_code = 'club_admin'
      and assignment.revoked_at is null;

    get diagnostics v_revoked_admin_count = row_count;

    if v_revoked_admin_count <> v_unrevoked_invalid_admin_count then
      raise exception '유효하지 않은 이전 회장 역할을 모두 해제할 수 없습니다.';
    end if;
  end if;

  update public.club_role_assignments as assignment
  set
    revoked_at = pg_catalog.now(),
    revoked_by = p_operator_user_id
  where assignment.membership_id = v_target_membership_id
    and assignment.role_code = 'club_manager'
    and assignment.revoked_at is null;

  get diagnostics v_manager_revoked_count = row_count;

  update public.club_role_assignments as assignment
  set
    revoked_at = pg_catalog.now(),
    revoked_by = p_operator_user_id
  where assignment.membership_id = v_target_membership_id
    and assignment.role_code = 'club_vice_admin'
    and assignment.revoked_at is null;

  get diagnostics v_vice_admin_revoked_count = row_count;

  insert into public.club_role_assignments (
    membership_id,
    role_code,
    assigned_by
  )
  values (
    v_target_membership_id,
    'club_admin',
    p_operator_user_id
  )
  returning id into v_new_admin_assignment_id;

  select
    count(*),
    (pg_catalog.array_agg(membership.user_id order by assignment.id))[1]
  into
    v_final_unrevoked_admin_count,
    v_final_admin_user_id
  from public.club_role_assignments as assignment
  join public.club_memberships as membership
    on membership.id = assignment.membership_id
  where membership.club_id = p_club_id
    and assignment.role_code = 'club_admin'
    and assignment.revoked_at is null;

  select count(*)
    into v_final_valid_admin_count
  from public.club_role_assignments as assignment
  join public.club_memberships as membership
    on membership.id = assignment.membership_id
   and membership.membership_status = 'active'
  join public.user_accounts as account
    on account.id = membership.user_id
   and account.account_status = 'active'
  where membership.club_id = p_club_id
    and assignment.role_code = 'club_admin'
    and assignment.revoked_at is null;

  if v_final_unrevoked_admin_count <> 1
     or v_final_valid_admin_count <> 1
     or v_final_admin_user_id is distinct from p_target_user_id
     or not exists (
       select 1
       from public.club_role_assignments as assignment
       where assignment.id = v_new_admin_assignment_id
         and assignment.membership_id = v_target_membership_id
         and assignment.role_code = 'club_admin'
         and assignment.revoked_at is null
     ) then
    raise exception '최종 회장 임명 상태를 확인할 수 없습니다.';
  end if;

  if exists (
    select 1
    from public.club_role_assignments as assignment
    where assignment.membership_id = v_target_membership_id
      and assignment.role_code in ('club_manager', 'club_vice_admin')
      and assignment.revoked_at is null
  ) then
    raise exception '새 회장의 충돌 역할 해제 결과를 확인할 수 없습니다.';
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
    p_operator_user_id,
    'operator',
    p_action_code,
    'club_admin_assignment',
    v_new_admin_assignment_id::text,
    p_club_id::text,
    pg_catalog.jsonb_build_object(
      'historical_admin_assignment_count', v_historical_admin_count,
      'valid_admin_count', v_valid_admin_count,
      'unrevoked_invalid_admin_count', v_unrevoked_invalid_admin_count,
      'new_admin_user_id', p_target_user_id,
      'new_admin_membership_id', v_target_membership_id
    ),
    pg_catalog.jsonb_build_object(
      'current_unrevoked_admin_count', v_final_unrevoked_admin_count,
      'current_valid_admin_count', v_final_valid_admin_count,
      'new_admin_user_id', p_target_user_id,
      'new_admin_membership_id', v_target_membership_id,
      'new_admin_assignment_id', v_new_admin_assignment_id
    ),
    v_reason,
    pg_catalog.jsonb_build_object(
      'operator_user_id', p_operator_user_id,
      'previous_admins', v_previous_admins,
      'revoked_previous_admins', v_revoked_previous_admins,
      'revoked_conflicting_roles', v_revoked_conflicting_roles,
      'revoked_previous_admin_count', v_revoked_admin_count,
      'manager_revoked_count', v_manager_revoked_count,
      'vice_admin_revoked_count', v_vice_admin_revoked_count,
      'member_created', v_member_created,
      'new_admin_assignment_created', true
    ),
    p_request_id,
    'success'
  )
  returning id into v_audit_log_id;

  v_result_data := pg_catalog.jsonb_build_object(
    'action_code', p_action_code,
    'club_id', p_club_id,
    'operator_user_id', p_operator_user_id,
    'new_admin_user_id', p_target_user_id,
    'new_admin_membership_id', v_target_membership_id,
    'new_admin_assignment_id', v_new_admin_assignment_id,
    'audit_log_id', v_audit_log_id,
    'previous_admins', v_previous_admins,
    'revoked_previous_admins', v_revoked_previous_admins,
    'revoked_conflicting_roles', v_revoked_conflicting_roles,
    'member_created', v_member_created,
    'changed', true,
    'outcome', 'success'
  );

  update private.club_mutation_requests as ledger
  set
    outcome = 'success',
    result_data = v_result_data,
    completed_at = pg_catalog.now()
  where ledger.actor_id = p_operator_user_id
    and ledger.request_id = p_request_id
    and ledger.action_code = p_action_code;

  get diagnostics v_completed_ledger_count = row_count;

  if v_completed_ledger_count <> 1 then
    raise exception '요청 처리 기록 완료 상태를 저장할 수 없습니다.';
  end if;

  perform pg_catalog.set_config(
    'pul.club_admin_mutation_request_id',
    coalesce(v_previous_context_request_id, ''),
    true
  );
  perform pg_catalog.set_config(
    'pul.club_admin_mutation_action_code',
    coalesce(v_previous_context_action_code, ''),
    true
  );
  perform pg_catalog.set_config(
    'pul.club_admin_mutation_actor_id',
    coalesce(v_previous_context_actor_id, ''),
    true
  );
  perform pg_catalog.set_config(
    'pul.club_admin_mutation_club_id',
    coalesce(v_previous_context_club_id, ''),
    true
  );
  perform pg_catalog.set_config(
    'pul.club_admin_mutation_target_user_id',
    coalesce(v_previous_context_target_user_id, ''),
    true
  );
  v_context_set := false;

  return query
  select
    p_request_id,
    p_action_code,
    p_club_id,
    p_operator_user_id,
    p_target_user_id,
    v_target_membership_id,
    v_new_admin_assignment_id,
    v_audit_log_id,
    v_previous_admins,
    v_revoked_previous_admins,
    v_revoked_conflicting_roles,
    v_member_created,
    true,
    false,
    'success'::text;
exception
  when others then
    if v_context_set then
      perform pg_catalog.set_config(
        'pul.club_admin_mutation_request_id',
        coalesce(v_previous_context_request_id, ''),
        true
      );
      perform pg_catalog.set_config(
        'pul.club_admin_mutation_action_code',
        coalesce(v_previous_context_action_code, ''),
        true
      );
      perform pg_catalog.set_config(
        'pul.club_admin_mutation_actor_id',
        coalesce(v_previous_context_actor_id, ''),
        true
      );
      perform pg_catalog.set_config(
        'pul.club_admin_mutation_club_id',
        coalesce(v_previous_context_club_id, ''),
        true
      );
      perform pg_catalog.set_config(
        'pul.club_admin_mutation_target_user_id',
        coalesce(v_previous_context_target_user_id, ''),
        true
      );
    end if;
    raise;
end;
$$;

comment on function private.execute_club_admin_absence_mutation(text, uuid, uuid, uuid, uuid, text) is
  'Internal service-only engine for initial club administrator appointment and emergency recovery with global request replay, club serialization, role normalization, and audit.';

revoke all on function private.execute_club_admin_absence_mutation(text, uuid, uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;

create or replace function public.transfer_club_admin(
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
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_previous_context_request_id text;
  v_previous_context_action_code text;
  v_previous_context_actor_id text;
  v_previous_context_club_id text;
  v_previous_context_target_user_id text;
  v_context_set boolean := false;
begin
  v_previous_context_request_id := pg_catalog.current_setting(
    'pul.club_admin_mutation_request_id',
    true
  );
  v_previous_context_action_code := pg_catalog.current_setting(
    'pul.club_admin_mutation_action_code',
    true
  );
  v_previous_context_actor_id := pg_catalog.current_setting(
    'pul.club_admin_mutation_actor_id',
    true
  );
  v_previous_context_club_id := pg_catalog.current_setting(
    'pul.club_admin_mutation_club_id',
    true
  );
  v_previous_context_target_user_id := pg_catalog.current_setting(
    'pul.club_admin_mutation_target_user_id',
    true
  );

  perform pg_catalog.set_config(
    'pul.club_admin_mutation_request_id',
    coalesce(p_request_id::text, ''),
    true
  );
  perform pg_catalog.set_config(
    'pul.club_admin_mutation_action_code',
    'role.transfer_admin',
    true
  );
  perform pg_catalog.set_config(
    'pul.club_admin_mutation_actor_id',
    coalesce(v_actor_id::text, ''),
    true
  );
  perform pg_catalog.set_config(
    'pul.club_admin_mutation_club_id',
    coalesce(p_club_id::text, ''),
    true
  );
  perform pg_catalog.set_config(
    'pul.club_admin_mutation_target_user_id',
    coalesce(p_target_user_id::text, ''),
    true
  );
  v_context_set := true;

  return query
  select *
  from private.execute_club_admin_transfer(
    p_club_id,
    p_target_user_id,
    p_request_id,
    p_reason
  );

  perform pg_catalog.set_config(
    'pul.club_admin_mutation_request_id',
    coalesce(v_previous_context_request_id, ''),
    true
  );
  perform pg_catalog.set_config(
    'pul.club_admin_mutation_action_code',
    coalesce(v_previous_context_action_code, ''),
    true
  );
  perform pg_catalog.set_config(
    'pul.club_admin_mutation_actor_id',
    coalesce(v_previous_context_actor_id, ''),
    true
  );
  perform pg_catalog.set_config(
    'pul.club_admin_mutation_club_id',
    coalesce(v_previous_context_club_id, ''),
    true
  );
  perform pg_catalog.set_config(
    'pul.club_admin_mutation_target_user_id',
    coalesce(v_previous_context_target_user_id, ''),
    true
  );
  v_context_set := false;
exception
  when others then
    if v_context_set then
      perform pg_catalog.set_config(
        'pul.club_admin_mutation_request_id',
        coalesce(v_previous_context_request_id, ''),
        true
      );
      perform pg_catalog.set_config(
        'pul.club_admin_mutation_action_code',
        coalesce(v_previous_context_action_code, ''),
        true
      );
      perform pg_catalog.set_config(
        'pul.club_admin_mutation_actor_id',
        coalesce(v_previous_context_actor_id, ''),
        true
      );
      perform pg_catalog.set_config(
        'pul.club_admin_mutation_club_id',
        coalesce(v_previous_context_club_id, ''),
        true
      );
      perform pg_catalog.set_config(
        'pul.club_admin_mutation_target_user_id',
        coalesce(v_previous_context_target_user_id, ''),
        true
      );
    end if;
    raise;
end;
$$;

comment on function public.transfer_club_admin(uuid, uuid, uuid, text) is
  'Current active club administrator transfer wrapper with transaction-local guarded mutation context.';

revoke all on function public.transfer_club_admin(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.transfer_club_admin(uuid, uuid, uuid, text)
  to authenticated;

create function public.appoint_initial_club_admin(
  p_club_id uuid,
  p_target_user_id uuid,
  p_operator_user_id uuid,
  p_request_id uuid,
  p_reason text
)
returns table (
  request_id uuid,
  action_code text,
  club_id uuid,
  operator_user_id uuid,
  new_admin_user_id uuid,
  new_admin_membership_id uuid,
  new_admin_assignment_id uuid,
  audit_log_id uuid,
  previous_admins jsonb,
  revoked_previous_admins jsonb,
  revoked_conflicting_roles jsonb,
  member_created boolean,
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
  from private.execute_club_admin_absence_mutation(
    'role.appoint_initial_admin',
    p_club_id,
    p_target_user_id,
    p_operator_user_id,
    p_request_id,
    p_reason
  );
$$;

comment on function public.appoint_initial_club_admin(uuid, uuid, uuid, uuid, text) is
  'Service-role-only initial club administrator appointment for an active club with no historical club_admin assignment.';

revoke all on function public.appoint_initial_club_admin(uuid, uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.appoint_initial_club_admin(uuid, uuid, uuid, uuid, text)
  to service_role;

create function public.recover_missing_club_admin(
  p_club_id uuid,
  p_target_user_id uuid,
  p_operator_user_id uuid,
  p_request_id uuid,
  p_reason text
)
returns table (
  request_id uuid,
  action_code text,
  club_id uuid,
  operator_user_id uuid,
  new_admin_user_id uuid,
  new_admin_membership_id uuid,
  new_admin_assignment_id uuid,
  audit_log_id uuid,
  previous_admins jsonb,
  revoked_previous_admins jsonb,
  revoked_conflicting_roles jsonb,
  member_created boolean,
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
  from private.execute_club_admin_absence_mutation(
    'role.recover_missing_admin',
    p_club_id,
    p_target_user_id,
    p_operator_user_id,
    p_request_id,
    p_reason
  );
$$;

comment on function public.recover_missing_club_admin(uuid, uuid, uuid, uuid, text) is
  'Service-role-only emergency club administrator recovery for an active club with history but no valid current administrator.';

revoke all on function public.recover_missing_club_admin(uuid, uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.recover_missing_club_admin(uuid, uuid, uuid, uuid, text)
  to service_role;
