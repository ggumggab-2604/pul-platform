-- PUL 8-5E-1: expose guarded membership end/reactivation by membership ID.
-- The approved user-ID mutation engine remains the only state, role, audit, and ledger writer.

create function private.resolve_completed_club_membership_end_reactivation_replay(
  p_request_id uuid,
  p_action_code text,
  p_membership_id uuid
)
returns table (
  club_id uuid,
  target_user_id uuid
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_account_status text;
  v_ledger_action_code text;
  v_ledger_club_id uuid;
  v_ledger_target_user_id uuid;
  v_result_data jsonb;
  v_completed_at timestamptz;
begin
  if v_actor_id is null then
    raise exception '로그인이 필요합니다.'
      using errcode = '42501';
  end if;

  if p_request_id is null then
    raise exception '요청 식별자가 필요합니다.'
      using errcode = '22023';
  end if;

  if p_action_code is null
     or p_action_code not in ('membership.end', 'membership.activate') then
    raise exception '지원하지 않는 회원 관계 작업입니다.';
  end if;

  if p_membership_id is null then
    raise exception '회원 관계 식별자가 필요합니다.'
      using errcode = '22023';
  end if;

  select actor_account.account_status
  into v_actor_account_status
  from public.user_accounts as actor_account
  where actor_account.id = v_actor_id
  for share;

  if not found or v_actor_account_status <> 'active' then
    raise exception '활성 계정만 회원 관계 작업을 수행할 수 있습니다.'
      using errcode = '42501';
  end if;

  select
    ledger.action_code,
    ledger.club_id,
    ledger.target_user_id,
    ledger.result_data,
    ledger.completed_at
  into
    v_ledger_action_code,
    v_ledger_club_id,
    v_ledger_target_user_id,
    v_result_data,
    v_completed_at
  from private.club_mutation_requests as ledger
  where ledger.actor_id = v_actor_id
    and ledger.request_id = p_request_id
  for update;

  if not found or v_completed_at is null then
    return;
  end if;

  if v_ledger_action_code is distinct from p_action_code then
    raise exception '같은 요청 식별자를 다른 입력에 재사용할 수 없습니다.';
  end if;

  if v_ledger_club_id is null
     or v_ledger_target_user_id is null
     or v_result_data is null
     or pg_catalog.jsonb_typeof(v_result_data) <> 'object'
     or v_result_data ->> 'action_code' is distinct from v_ledger_action_code
     or v_result_data ->> 'club_id' is distinct from v_ledger_club_id::text
     or v_result_data ->> 'target_user_id' is distinct from v_ledger_target_user_id::text
     or v_result_data ->> 'membership_id' is null then
    raise exception '요청 처리 기록 결과를 확인할 수 없습니다.'
      using errcode = 'P0001';
  end if;

  if v_result_data ->> 'membership_id' is distinct from p_membership_id::text then
    raise exception '같은 요청 식별자를 다른 입력에 재사용할 수 없습니다.';
  end if;

  return query
  select v_ledger_club_id, v_ledger_target_user_id;
end;
$$;

comment on function private.resolve_completed_club_membership_end_reactivation_replay(
  uuid,
  text,
  uuid
) is
  'Returns the trusted club and target of a completed membership end or reactivation after binding actor, request, action, and membership inputs; canonical reason validation remains in the approved mutation engine.';

revoke all on function private.resolve_completed_club_membership_end_reactivation_replay(
  uuid,
  text,
  uuid
) from public, anon, authenticated, service_role;

create function public.end_club_membership_by_membership_id(
  p_membership_id uuid,
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
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_club_id uuid;
  v_target_user_id uuid;
  v_replay_club_id uuid;
  v_replay_target_user_id uuid;
  v_result record;
begin
  if v_actor_id is null then
    raise exception '로그인이 필요합니다.'
      using errcode = '42501';
  end if;

  if p_membership_id is null then
    raise exception '회원 관계 식별자가 필요합니다.'
      using errcode = '22023';
  end if;

  if p_request_id is null then
    raise exception '요청 식별자가 필요합니다.'
      using errcode = '22023';
  end if;

  select replay_target.club_id, replay_target.target_user_id
  into v_replay_club_id, v_replay_target_user_id
  from private.resolve_completed_club_membership_end_reactivation_replay(
    p_request_id,
    'membership.end',
    p_membership_id
  ) as replay_target;

  if found then
    select *
    into v_result
    from public.end_club_membership(
      v_replay_club_id,
      v_replay_target_user_id,
      p_request_id,
      p_reason
    );

    if not found
       or v_result.request_id is distinct from p_request_id
       or v_result.action_code is distinct from 'membership.end'
       or v_result.club_id is distinct from v_replay_club_id
       or v_result.target_user_id is distinct from v_replay_target_user_id
       or v_result.membership_id is distinct from p_membership_id
       or v_result.replayed is distinct from true then
      raise exception '회원 관계 변경 결과를 확인할 수 없습니다.'
        using errcode = 'P0001';
    end if;

    return query
    select
      v_result.request_id::uuid,
      v_result.action_code::text,
      v_result.club_id::uuid,
      v_result.target_user_id::uuid,
      v_result.membership_id::uuid,
      v_result.previous_status::text,
      v_result.current_status::text,
      v_result.changed::boolean,
      v_result.replayed::boolean,
      v_result.outcome::text;
    return;
  end if;

  select membership.club_id, membership.user_id
  into v_club_id, v_target_user_id
  from public.club_memberships as membership
  where membership.id = p_membership_id
    and private.club_user_has_permission(
      v_actor_id,
      membership.club_id,
      'club.members.manage'
    )
    and private.club_user_is_active_admin_or_vice_admin(
      v_actor_id,
      membership.club_id
    );

  if not found then
    raise exception '대상 동호회 회원 관계를 찾을 수 없거나 관리 권한이 없습니다.'
      using errcode = '42501';
  end if;

  select *
  into v_result
  from public.end_club_membership(
    v_club_id,
    v_target_user_id,
    p_request_id,
    p_reason
  );

  if not found
     or v_result.request_id is distinct from p_request_id
     or v_result.action_code is distinct from 'membership.end'
     or v_result.club_id is distinct from v_club_id
     or v_result.target_user_id is distinct from v_target_user_id
     or v_result.membership_id is distinct from p_membership_id then
    raise exception '회원 관계 변경 결과를 확인할 수 없습니다.'
      using errcode = 'P0001';
  end if;

  return query
  select
    v_result.request_id::uuid,
    v_result.action_code::text,
    v_result.club_id::uuid,
    v_result.target_user_id::uuid,
    v_result.membership_id::uuid,
    v_result.previous_status::text,
    v_result.current_status::text,
    v_result.changed::boolean,
    v_result.replayed::boolean,
    v_result.outcome::text;
end;
$$;

create function public.activate_club_membership_by_membership_id(
  p_membership_id uuid,
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
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_club_id uuid;
  v_target_user_id uuid;
  v_replay_club_id uuid;
  v_replay_target_user_id uuid;
  v_result record;
begin
  if v_actor_id is null then
    raise exception '로그인이 필요합니다.'
      using errcode = '42501';
  end if;

  if p_membership_id is null then
    raise exception '회원 관계 식별자가 필요합니다.'
      using errcode = '22023';
  end if;

  if p_request_id is null then
    raise exception '요청 식별자가 필요합니다.'
      using errcode = '22023';
  end if;

  select replay_target.club_id, replay_target.target_user_id
  into v_replay_club_id, v_replay_target_user_id
  from private.resolve_completed_club_membership_end_reactivation_replay(
    p_request_id,
    'membership.activate',
    p_membership_id
  ) as replay_target;

  if found then
    select *
    into v_result
    from public.activate_club_membership(
      v_replay_club_id,
      v_replay_target_user_id,
      p_request_id,
      p_reason
    );

    if not found
       or v_result.request_id is distinct from p_request_id
       or v_result.action_code is distinct from 'membership.activate'
       or v_result.club_id is distinct from v_replay_club_id
       or v_result.target_user_id is distinct from v_replay_target_user_id
       or v_result.membership_id is distinct from p_membership_id
       or v_result.replayed is distinct from true then
      raise exception '회원 관계 변경 결과를 확인할 수 없습니다.'
        using errcode = 'P0001';
    end if;

    return query
    select
      v_result.request_id::uuid,
      v_result.action_code::text,
      v_result.club_id::uuid,
      v_result.target_user_id::uuid,
      v_result.membership_id::uuid,
      v_result.previous_status::text,
      v_result.current_status::text,
      v_result.changed::boolean,
      v_result.replayed::boolean,
      v_result.outcome::text;
    return;
  end if;

  select membership.club_id, membership.user_id
  into v_club_id, v_target_user_id
  from public.club_memberships as membership
  where membership.id = p_membership_id
    and private.club_user_has_permission(
      v_actor_id,
      membership.club_id,
      'club.members.manage'
    )
    and private.club_user_is_active_admin_or_vice_admin(
      v_actor_id,
      membership.club_id
    );

  if not found then
    raise exception '대상 동호회 회원 관계를 찾을 수 없거나 관리 권한이 없습니다.'
      using errcode = '42501';
  end if;

  select *
  into v_result
  from public.activate_club_membership(
    v_club_id,
    v_target_user_id,
    p_request_id,
    p_reason
  );

  if not found
     or v_result.request_id is distinct from p_request_id
     or v_result.action_code is distinct from 'membership.activate'
     or v_result.club_id is distinct from v_club_id
     or v_result.target_user_id is distinct from v_target_user_id
     or v_result.membership_id is distinct from p_membership_id then
    raise exception '회원 관계 변경 결과를 확인할 수 없습니다.'
      using errcode = 'P0001';
  end if;

  return query
  select
    v_result.request_id::uuid,
    v_result.action_code::text,
    v_result.club_id::uuid,
    v_result.target_user_id::uuid,
    v_result.membership_id::uuid,
    v_result.previous_status::text,
    v_result.current_status::text,
    v_result.changed::boolean,
    v_result.replayed::boolean,
    v_result.outcome::text;
end;
$$;

comment on function public.end_club_membership_by_membership_id(
  uuid,
  uuid,
  text
) is
  'Replays a completed forced membership end before current club authorization, or resolves an authorized membership identifier and delegates a new mutation to the approved engine.';

comment on function public.activate_club_membership_by_membership_id(
  uuid,
  uuid,
  text
) is
  'Replays a completed membership reactivation before current club authorization, or resolves an authorized membership identifier and delegates a new mutation to the approved engine.';

revoke all on function public.end_club_membership_by_membership_id(
  uuid,
  uuid,
  text
) from public, anon, authenticated, service_role;

revoke all on function public.activate_club_membership_by_membership_id(
  uuid,
  uuid,
  text
) from public, anon, authenticated, service_role;

grant execute on function public.end_club_membership_by_membership_id(
  uuid,
  uuid,
  text
) to authenticated;

grant execute on function public.activate_club_membership_by_membership_id(
  uuid,
  uuid,
  text
) to authenticated;
