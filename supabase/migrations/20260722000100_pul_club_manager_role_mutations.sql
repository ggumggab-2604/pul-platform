-- PUL 8-3B-2B-4A: guarded club_manager role grant and revoke mutations.
-- Only an active club administrator may change another active member's manager role.

create function private.execute_club_manager_role_mutation(
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

  if not private.club_user_is_active_admin(
    v_actor_id,
    p_club_id
  ) then
    raise exception '현재 동호회 회장만 운영진 역할을 변경할 수 있습니다.'
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

comment on function private.execute_club_manager_role_mutation(text, uuid, uuid, uuid, text) is
  'Internal serialized club_manager role mutation engine with ledger replay and audit logging.';

revoke all on function private.execute_club_manager_role_mutation(text, uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;

create function public.grant_club_manager_role(
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
language sql
volatile
security definer
set search_path = ''
as $$
  select *
  from private.execute_club_manager_role_mutation(
    'role.grant_manager',
    p_club_id,
    p_target_user_id,
    p_request_id,
    p_reason
  );
$$;

comment on function public.grant_club_manager_role(uuid, uuid, uuid, text) is
  'Allows the active club administrator to grant club_manager to another active member.';

revoke all on function public.grant_club_manager_role(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.grant_club_manager_role(uuid, uuid, uuid, text)
  to authenticated;

create function public.revoke_club_manager_role(
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
language sql
volatile
security definer
set search_path = ''
as $$
  select *
  from private.execute_club_manager_role_mutation(
    'role.revoke_manager',
    p_club_id,
    p_target_user_id,
    p_request_id,
    p_reason
  );
$$;

comment on function public.revoke_club_manager_role(uuid, uuid, uuid, text) is
  'Allows the active club administrator to revoke club_manager while preserving club_member.';

revoke all on function public.revoke_club_manager_role(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.revoke_club_manager_role(uuid, uuid, uuid, text)
  to authenticated;
