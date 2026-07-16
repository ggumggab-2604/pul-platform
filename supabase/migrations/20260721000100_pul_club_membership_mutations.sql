-- PUL 8-3B-2B-3: guarded club membership mutations.
-- Club administrator transfer and general role mutation remain deferred.

create function private.club_membership_has_unrevoked_admin_assignment(
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
        and assignment.role_code = 'club_admin'
        and assignment.revoked_at is null
    );
$$;

comment on function private.club_membership_has_unrevoked_admin_assignment(uuid) is
  'Protects every unrevoked club_admin assignment, including assignments on suspended memberships.';

revoke all on function private.club_membership_has_unrevoked_admin_assignment(uuid)
  from public, anon, authenticated, service_role;

create function private.execute_club_membership_mutation(
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

comment on function private.execute_club_membership_mutation(text, uuid, uuid, uuid, text, boolean) is
  'Internal serialized membership mutation engine with ledger replay and representative audit logging.';

revoke all on function private.execute_club_membership_mutation(text, uuid, uuid, uuid, text, boolean)
  from public, anon, authenticated, service_role;

create function public.activate_club_membership(
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
  previous_status text,
  current_status text,
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
  from private.execute_club_membership_mutation(
    'membership.activate',
    p_club_id,
    p_target_user_id,
    p_request_id,
    p_reason,
    false
  );
$$;

revoke all on function public.activate_club_membership(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.activate_club_membership(uuid, uuid, uuid, text)
  to authenticated;

create function public.suspend_club_membership(
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
  previous_status text,
  current_status text,
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
  from private.execute_club_membership_mutation(
    'membership.suspend',
    p_club_id,
    p_target_user_id,
    p_request_id,
    p_reason,
    false
  );
$$;

revoke all on function public.suspend_club_membership(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.suspend_club_membership(uuid, uuid, uuid, text)
  to authenticated;

create function public.resume_club_membership(
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
  previous_status text,
  current_status text,
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
  from private.execute_club_membership_mutation(
    'membership.resume',
    p_club_id,
    p_target_user_id,
    p_request_id,
    p_reason,
    false
  );
$$;

revoke all on function public.resume_club_membership(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.resume_club_membership(uuid, uuid, uuid, text)
  to authenticated;

create function public.end_club_membership(
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
  previous_status text,
  current_status text,
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
  from private.execute_club_membership_mutation(
    'membership.end',
    p_club_id,
    p_target_user_id,
    p_request_id,
    p_reason,
    false
  );
$$;

revoke all on function public.end_club_membership(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.end_club_membership(uuid, uuid, uuid, text)
  to authenticated;

create function public.leave_current_club_membership(
  p_club_id uuid,
  p_request_id uuid,
  p_reason text default null
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
language sql
volatile
security definer
set search_path = ''
as $$
  select *
  from private.execute_club_membership_mutation(
    'membership.leave_self',
    p_club_id,
    auth.uid(),
    p_request_id,
    p_reason,
    true
  );
$$;

revoke all on function public.leave_current_club_membership(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.leave_current_club_membership(uuid, uuid, text)
  to authenticated;
