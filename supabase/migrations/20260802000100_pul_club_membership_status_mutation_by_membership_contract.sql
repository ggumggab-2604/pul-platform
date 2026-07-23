create or replace function public.suspend_club_membership_by_membership_id(
  p_club_id uuid,
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
  v_target_user_id uuid;
  v_result record;
begin
  if v_actor_id is null then
    raise exception '로그인이 필요합니다.'
      using errcode = '42501';
  end if;

  if p_club_id is null then
    raise exception '동호회 식별자가 필요합니다.'
      using errcode = '22023';
  end if;

  if p_membership_id is null then
    raise exception '회원 관계 식별자가 필요합니다.'
      using errcode = '22023';
  end if;

  if p_request_id is null then
    raise exception '요청 식별자가 필요합니다.'
      using errcode = '22023';
  end if;

  if not private.club_user_has_permission(
    v_actor_id,
    p_club_id,
    'club.members.manage'
  ) or not private.club_user_is_active_admin_or_vice_admin(
    v_actor_id,
    p_club_id
  ) then
    raise exception '동호회 회원 관리 권한이 없습니다.'
      using errcode = '42501';
  end if;

  select membership.user_id
  into v_target_user_id
  from public.club_memberships as membership
  where membership.id = p_membership_id
    and membership.club_id = p_club_id;

  if not found then
    raise exception '대상 동호회 회원 관계를 찾을 수 없습니다.'
      using errcode = 'P0002';
  end if;

  select *
  into v_result
  from public.suspend_club_membership(
    p_club_id,
    v_target_user_id,
    p_request_id,
    p_reason
  );

  if not found then
    raise exception '회원 상태 변경 결과를 확인할 수 없습니다.'
      using errcode = 'P0001';
  end if;

  if v_result.membership_id is distinct from p_membership_id
    or v_result.club_id is distinct from p_club_id
    or v_result.target_user_id is distinct from v_target_user_id
  then
    raise exception '회원 상태 변경 결과를 확인할 수 없습니다.'
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

create or replace function public.resume_club_membership_by_membership_id(
  p_club_id uuid,
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
  v_target_user_id uuid;
  v_result record;
begin
  if v_actor_id is null then
    raise exception '로그인이 필요합니다.'
      using errcode = '42501';
  end if;

  if p_club_id is null then
    raise exception '동호회 식별자가 필요합니다.'
      using errcode = '22023';
  end if;

  if p_membership_id is null then
    raise exception '회원 관계 식별자가 필요합니다.'
      using errcode = '22023';
  end if;

  if p_request_id is null then
    raise exception '요청 식별자가 필요합니다.'
      using errcode = '22023';
  end if;

  if not private.club_user_has_permission(
    v_actor_id,
    p_club_id,
    'club.members.manage'
  ) or not private.club_user_is_active_admin_or_vice_admin(
    v_actor_id,
    p_club_id
  ) then
    raise exception '동호회 회원 관리 권한이 없습니다.'
      using errcode = '42501';
  end if;

  select membership.user_id
  into v_target_user_id
  from public.club_memberships as membership
  where membership.id = p_membership_id
    and membership.club_id = p_club_id;

  if not found then
    raise exception '대상 동호회 회원 관계를 찾을 수 없습니다.'
      using errcode = 'P0002';
  end if;

  select *
  into v_result
  from public.resume_club_membership(
    p_club_id,
    v_target_user_id,
    p_request_id,
    p_reason
  );

  if not found then
    raise exception '회원 상태 변경 결과를 확인할 수 없습니다.'
      using errcode = 'P0001';
  end if;

  if v_result.membership_id is distinct from p_membership_id
    or v_result.club_id is distinct from p_club_id
    or v_result.target_user_id is distinct from v_target_user_id
  then
    raise exception '회원 상태 변경 결과를 확인할 수 없습니다.'
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

comment on function public.suspend_club_membership_by_membership_id(
  uuid,
  uuid,
  uuid,
  text
) is
  'Resolves a club-scoped membership identifier and delegates suspension to the approved membership mutation engine.';

comment on function public.resume_club_membership_by_membership_id(
  uuid,
  uuid,
  uuid,
  text
) is
  'Resolves a club-scoped membership identifier and delegates resumption to the approved membership mutation engine.';

revoke all on function public.suspend_club_membership_by_membership_id(
  uuid,
  uuid,
  uuid,
  text
) from public, anon, authenticated, service_role;

revoke all on function public.resume_club_membership_by_membership_id(
  uuid,
  uuid,
  uuid,
  text
) from public, anon, authenticated, service_role;

grant execute on function public.suspend_club_membership_by_membership_id(
  uuid,
  uuid,
  uuid,
  text
) to authenticated;

grant execute on function public.resume_club_membership_by_membership_id(
  uuid,
  uuid,
  uuid,
  text
) to authenticated;
