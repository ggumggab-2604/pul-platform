-- PUL 8-4C: atomic membership application approval, membership activation,
-- and a fresh club_member role assignment.

alter table public.club_membership_application_status_history
  drop constraint club_membership_application_history_event_check;

alter table public.club_membership_application_status_history
  add constraint club_membership_application_history_event_check
  check (
    event_code in (
      'application.submitted',
      'application.review_started',
      'application.additional_info_requested',
      'application.interview_requested',
      'application.waitlisted',
      'application.review_resumed',
      'application.supplement_submitted',
      'application.withdrawn',
      'application.rejected',
      'application.approved'
    )
  );

create or replace function private.enforce_guarded_club_membership_application_mutation()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_application_id uuid;
  v_club_id uuid;
  v_applicant_id uuid;
  v_expected_version bigint;
  v_action_code text;
  v_target_status text;
begin
  if tg_op = 'DELETE' then
    raise exception 'MEMBERSHIP_APPLICATION_DIRECT_DELETE_FORBIDDEN' using errcode = '42501';
  end if;

  begin
    v_application_id := nullif(pg_catalog.current_setting('pul.club_membership_application_id', true), '')::uuid;
    v_club_id := nullif(pg_catalog.current_setting('pul.club_membership_application_club_id', true), '')::uuid;
    v_applicant_id := nullif(pg_catalog.current_setting('pul.club_membership_application_applicant_id', true), '')::uuid;
    v_expected_version := nullif(pg_catalog.current_setting('pul.club_membership_application_expected_version', true), '')::bigint;
  exception
    when invalid_text_representation then
      raise exception 'MEMBERSHIP_APPLICATION_INVALID_MUTATION_CONTEXT' using errcode = '42501';
  end;

  v_action_code := nullif(pg_catalog.current_setting('pul.club_membership_application_action_code', true), '');
  v_target_status := nullif(pg_catalog.current_setting('pul.club_membership_application_target_status', true), '');

  if v_application_id is null
     or v_club_id is null
     or v_applicant_id is null
     or v_action_code is null
     or v_target_status is null
     or not private.club_membership_application_context_is_valid() then
    raise exception 'MEMBERSHIP_APPLICATION_RPC_REQUIRED' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if v_action_code <> 'membership_application.submit'
       or v_expected_version is not null
       or new.id <> v_application_id
       or new.club_id <> v_club_id
       or new.applicant_id <> v_applicant_id
       or new.status <> v_target_status
       or new.status not in ('submitted', 'waitlisted')
       or new.version <> 1
       or new.finalized_at is not null then
      raise exception 'MEMBERSHIP_APPLICATION_INSERT_CONTEXT_MISMATCH' using errcode = '42501';
    end if;
    return new;
  end if;

  if old.id <> v_application_id
     or new.id <> old.id
     or old.club_id <> v_club_id
     or new.club_id <> old.club_id
     or old.applicant_id <> v_applicant_id
     or new.applicant_id <> old.applicant_id
     or v_expected_version is null
     or old.version <> v_expected_version
     or new.version <> old.version + 1
     or new.status <> v_target_status
     or (new.status = 'approved' and v_action_code <> 'membership_application.approve')
     or new.recruitment_status_at_submission is distinct from old.recruitment_status_at_submission
     or new.experience_code is distinct from old.experience_code
     or new.available_day_code is distinct from old.available_day_code
     or new.interest_codes is distinct from old.interest_codes
     or new.application_reason is distinct from old.application_reason
     or new.message is distinct from old.message
     or new.guidelines_confirmed_at is distinct from old.guidelines_confirmed_at
     or new.guidelines_version is distinct from old.guidelines_version
     or new.submitted_at is distinct from old.submitted_at
     or new.created_at is distinct from old.created_at
     or new.updated_at is distinct from old.updated_at
     or new.status_changed_at < old.status_changed_at then
    raise exception 'MEMBERSHIP_APPLICATION_UPDATE_CONTEXT_MISMATCH' using errcode = '42501';
  end if;

  if old.status in ('approved', 'rejected', 'withdrawn') then
    raise exception 'MEMBERSHIP_APPLICATION_FINAL' using errcode = '42501';
  end if;

  if not (
    (v_action_code = 'membership_application.withdraw'
      and new.status = 'withdrawn' and new.finalized_at is not null)
    or (v_action_code = 'membership_application.supplement_response'
      and old.status = 'additional_info_required' and new.status = 'reviewing'
      and new.finalized_at is null)
    or (v_action_code = 'membership_application.review'
      and old.status = 'submitted' and new.status = 'reviewing'
      and new.finalized_at is null)
    or (v_action_code = 'membership_application.request_additional_info'
      and old.status = 'reviewing' and new.status = 'additional_info_required'
      and new.finalized_at is null)
    or (v_action_code = 'membership_application.request_interview'
      and old.status = 'reviewing' and new.status = 'interview_requested'
      and new.finalized_at is null)
    or (v_action_code = 'membership_application.waitlist'
      and old.status = 'reviewing' and new.status = 'waitlisted'
      and new.finalized_at is null)
    or (v_action_code = 'membership_application.resume_review'
      and old.status in ('additional_info_required', 'interview_requested', 'waitlisted')
      and new.status = 'reviewing' and new.finalized_at is null)
    or (v_action_code = 'membership_application.reject'
      and new.status = 'rejected' and new.finalized_at is not null)
    or (v_action_code = 'membership_application.approve'
      and old.status in ('reviewing', 'interview_requested', 'waitlisted')
      and new.status = 'approved'
      and new.finalized_at is not null
      and new.status_changed_at = new.finalized_at)
  ) then
    raise exception 'MEMBERSHIP_APPLICATION_TRANSITION_FORBIDDEN' using errcode = '42501';
  end if;

  if v_action_code = 'membership_application.approve'
     and not exists (
       select 1
       from public.club_memberships as membership
       join public.club_role_assignments as assignment
         on assignment.membership_id = membership.id
        and assignment.role_code = 'club_member'
        and assignment.revoked_at is null
       join public.club_role_definitions as role_definition
         on role_definition.role_code = assignment.role_code
        and role_definition.is_active
       where membership.club_id = v_club_id
         and membership.user_id = v_applicant_id
         and membership.membership_status = 'active'
     ) then
    raise exception 'MEMBERSHIP_APPLICATION_APPROVAL_RELATIONSHIP_REQUIRED' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_guarded_club_membership_application_mutation()
  from public, anon, authenticated, service_role;

create or replace function private.enforce_guarded_club_membership_application_history_mutation()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_request_id uuid;
  v_actor_id uuid;
  v_club_id uuid;
  v_application_id uuid;
  v_expected_version bigint;
  v_action_code text;
  v_target_status text;
  v_current_status text;
  v_current_version bigint;
begin
  if tg_op <> 'INSERT' then
    raise exception 'MEMBERSHIP_APPLICATION_HISTORY_APPEND_ONLY' using errcode = '42501';
  end if;

  begin
    v_request_id := nullif(pg_catalog.current_setting('pul.club_membership_application_request_id', true), '')::uuid;
    v_actor_id := nullif(pg_catalog.current_setting('pul.club_membership_application_actor_id', true), '')::uuid;
    v_club_id := nullif(pg_catalog.current_setting('pul.club_membership_application_club_id', true), '')::uuid;
    v_application_id := nullif(pg_catalog.current_setting('pul.club_membership_application_id', true), '')::uuid;
    v_expected_version := nullif(pg_catalog.current_setting('pul.club_membership_application_expected_version', true), '')::bigint;
  exception
    when invalid_text_representation then
      raise exception 'MEMBERSHIP_APPLICATION_INVALID_HISTORY_CONTEXT' using errcode = '42501';
  end;

  v_action_code := nullif(pg_catalog.current_setting('pul.club_membership_application_action_code', true), '');
  v_target_status := nullif(pg_catalog.current_setting('pul.club_membership_application_target_status', true), '');

  select application.status, application.version
    into v_current_status, v_current_version
  from public.club_membership_applications as application
  where application.id = v_application_id
    and application.club_id = v_club_id;

  if not private.club_membership_application_context_is_valid()
     or not found
     or new.application_id <> v_application_id
     or new.club_id <> v_club_id
     or new.actor_user_id <> v_actor_id
     or new.request_id <> v_request_id
     or new.to_status <> v_target_status
     or new.to_status <> v_current_status
     or new.application_version <> v_current_version
     or not (
       (v_action_code = 'membership_application.submit'
         and new.event_code = 'application.submitted'
         and new.from_status is null and new.application_version = 1)
       or (v_action_code = 'membership_application.withdraw'
         and new.event_code = 'application.withdrawn')
       or (v_action_code = 'membership_application.supplement_response'
         and new.event_code = 'application.supplement_submitted')
       or (v_action_code = 'membership_application.review'
         and new.event_code = 'application.review_started')
       or (v_action_code = 'membership_application.request_additional_info'
         and new.event_code = 'application.additional_info_requested')
       or (v_action_code = 'membership_application.request_interview'
         and new.event_code = 'application.interview_requested')
       or (v_action_code = 'membership_application.waitlist'
         and new.event_code = 'application.waitlisted')
       or (v_action_code = 'membership_application.resume_review'
         and new.event_code = 'application.review_resumed')
       or (v_action_code = 'membership_application.reject'
         and new.event_code = 'application.rejected')
       or (v_action_code = 'membership_application.approve'
         and new.event_code = 'application.approved'
         and new.from_status in ('reviewing', 'interview_requested', 'waitlisted')
         and new.to_status = 'approved')
     ) then
    raise exception 'MEMBERSHIP_APPLICATION_HISTORY_CONTEXT_MISMATCH' using errcode = '42501';
  end if;

  if v_action_code <> 'membership_application.submit'
     and v_expected_version is distinct from new.application_version - 1 then
    raise exception 'MEMBERSHIP_APPLICATION_HISTORY_VERSION_MISMATCH' using errcode = '42501';
  end if;

  if v_action_code <> 'membership_application.submit'
     and not exists (
       select 1
       from public.club_membership_application_status_history as previous_history
       where previous_history.application_id = new.application_id
         and previous_history.application_version = new.application_version - 1
         and previous_history.to_status = new.from_status
     ) then
    raise exception 'MEMBERSHIP_APPLICATION_HISTORY_CHAIN_MISMATCH' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_guarded_club_membership_application_history_mutation()
  from public, anon, authenticated, service_role;

create function private.execute_club_membership_application_approval(
  p_application_id uuid,
  p_expected_version bigint,
  p_request_id uuid
)
returns table (
  request_id uuid,
  action_code text,
  application_id uuid,
  club_id uuid,
  applicant_id uuid,
  application_status text,
  application_version bigint,
  membership_id uuid,
  membership_status text,
  role_assignment_id uuid,
  role_code text,
  membership_transition text,
  replayed boolean,
  approved_at timestamptz
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_action_code constant text := 'membership_application.approve';
  v_actor_id uuid := auth.uid();
  v_actor_status text;
  v_club_id uuid;
  v_club_status text;
  v_applicant_id uuid;
  v_applicant_status text;
  v_previous_application_status text;
  v_application_version bigint;
  v_fingerprint text;
  v_ledger_action text;
  v_ledger_club_id uuid;
  v_ledger_target_id uuid;
  v_ledger_role_code text;
  v_ledger_fingerprint text;
  v_ledger_result jsonb;
  v_ledger_completed_at timestamptz;
  v_ledger_found boolean := false;
  v_membership_id uuid;
  v_previous_membership_status text;
  v_membership_transition text;
  v_role_assignment_id uuid;
  v_role_definition_active boolean;
  v_active_assignment_count integer := 0;
  v_completed_count integer;
  v_approved_at timestamptz := pg_catalog.now();
  v_result jsonb;
  v_previous_request_context text := pg_catalog.current_setting('pul.club_membership_application_request_id', true);
  v_previous_action_context text := pg_catalog.current_setting('pul.club_membership_application_action_code', true);
  v_previous_actor_context text := pg_catalog.current_setting('pul.club_membership_application_actor_id', true);
  v_previous_club_context text := pg_catalog.current_setting('pul.club_membership_application_club_id', true);
  v_previous_application_context text := pg_catalog.current_setting('pul.club_membership_application_id', true);
  v_previous_applicant_context text := pg_catalog.current_setting('pul.club_membership_application_applicant_id', true);
  v_previous_target_context text := pg_catalog.current_setting('pul.club_membership_application_target_status', true);
  v_previous_version_context text := pg_catalog.current_setting('pul.club_membership_application_expected_version', true);
  v_previous_fingerprint_context text := pg_catalog.current_setting('pul.club_membership_application_input_fingerprint', true);
  v_previous_entry_context text := pg_catalog.current_setting('pul.club_membership_application_entry_id', true);
  v_previous_entry_type_context text := pg_catalog.current_setting('pul.club_membership_application_entry_type', true);
begin
  if v_actor_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if p_application_id is null or p_request_id is null then
    raise exception 'APPLICATION_AND_REQUEST_REQUIRED';
  end if;
  if p_expected_version is null or p_expected_version < 1 then
    raise exception 'EXPECTED_VERSION_REQUIRED';
  end if;

  select account.account_status
    into v_actor_status
  from public.user_accounts as account
  where account.id = v_actor_id
  for share;

  if not found or v_actor_status <> 'active' then
    raise exception 'APPROVER_ACCOUNT_NOT_ACTIVE' using errcode = '42501';
  end if;

  select
    application.club_id,
    application.applicant_id,
    application.status,
    application.version
  into
    v_club_id,
    v_applicant_id,
    v_previous_application_status,
    v_application_version
  from public.club_membership_applications as application
  where application.id = p_application_id
  for update;

  if not found then
    raise exception 'APPLICATION_NOT_FOUND';
  end if;

  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'action', v_action_code,
    'application_id', p_application_id,
    'expected_version', p_expected_version
  )::text);

  select
    ledger.action_code,
    ledger.club_id,
    ledger.target_user_id,
    ledger.role_code,
    ledger.input_fingerprint,
    ledger.result_data,
    ledger.completed_at
  into
    v_ledger_action,
    v_ledger_club_id,
    v_ledger_target_id,
    v_ledger_role_code,
    v_ledger_fingerprint,
    v_ledger_result,
    v_ledger_completed_at
  from private.club_mutation_requests as ledger
  where ledger.actor_id = v_actor_id
    and ledger.request_id = p_request_id
  for update;

  v_ledger_found := found;

  if v_ledger_found then
    if v_ledger_action is distinct from v_action_code
       or v_ledger_club_id is distinct from v_club_id
       or v_ledger_target_id is distinct from v_applicant_id
       or v_ledger_role_code is not null
       or v_ledger_fingerprint is distinct from v_fingerprint then
      raise exception 'IDEMPOTENCY_KEY_REUSED';
    end if;

    if v_ledger_completed_at is not null then
      return query select
        p_request_id,
        v_ledger_action,
        (v_ledger_result ->> 'application_id')::uuid,
        v_ledger_club_id,
        v_ledger_target_id,
        v_ledger_result ->> 'application_status',
        (v_ledger_result ->> 'application_version')::bigint,
        (v_ledger_result ->> 'membership_id')::uuid,
        v_ledger_result ->> 'membership_status',
        (v_ledger_result ->> 'role_assignment_id')::uuid,
        v_ledger_result ->> 'role_code',
        v_ledger_result ->> 'membership_transition',
        true,
        (v_ledger_result ->> 'approved_at')::timestamptz;
      return;
    end if;
  end if;

  select club.club_status
    into v_club_status
  from public.clubs as club
  where club.id = v_club_id
  for update;

  if not found then
    raise exception 'CLUB_NOT_FOUND';
  end if;
  if v_club_status <> 'active' then
    raise exception 'CLUB_NOT_ACTIVE';
  end if;

  if not private.club_user_has_permission(
    v_actor_id,
    v_club_id,
    'club.membership_applications.decide'
  ) then
    raise exception 'APPLICATION_DECIDE_PERMISSION_REQUIRED' using errcode = '42501';
  end if;

  if not private.club_user_is_active_admin_or_vice_admin(
    v_actor_id,
    v_club_id
  ) then
    raise exception 'APPLICATION_ADMIN_OR_VICE_ADMIN_REQUIRED' using errcode = '42501';
  end if;

  select account.account_status
    into v_applicant_status
  from public.user_accounts as account
  where account.id = v_applicant_id
  for share;

  if not found or v_applicant_status <> 'active' then
    raise exception 'APPLICANT_ACCOUNT_NOT_ACTIVE';
  end if;

  if v_application_version <> p_expected_version then
    raise exception 'APPLICATION_VERSION_CONFLICT' using errcode = '40001';
  end if;
  if v_previous_application_status not in (
    'reviewing', 'interview_requested', 'waitlisted'
  ) then
    raise exception 'APPLICATION_APPROVAL_STATE_INVALID';
  end if;

  if not v_ledger_found then
    insert into private.club_mutation_requests (
      actor_id,
      request_id,
      action_code,
      club_id,
      target_user_id,
      input_fingerprint
    ) values (
      v_actor_id,
      p_request_id,
      v_action_code,
      v_club_id,
      v_applicant_id,
      v_fingerprint
    )
    on conflict on constraint club_mutation_requests_actor_request_unique do nothing;

    select
      ledger.action_code,
      ledger.club_id,
      ledger.target_user_id,
      ledger.role_code,
      ledger.input_fingerprint,
      ledger.result_data,
      ledger.completed_at
    into
      v_ledger_action,
      v_ledger_club_id,
      v_ledger_target_id,
      v_ledger_role_code,
      v_ledger_fingerprint,
      v_ledger_result,
      v_ledger_completed_at
    from private.club_mutation_requests as ledger
    where ledger.actor_id = v_actor_id
      and ledger.request_id = p_request_id
    for update;

    if not found then
      raise exception 'IDEMPOTENCY_LEDGER_UNAVAILABLE';
    end if;
    if v_ledger_action is distinct from v_action_code
       or v_ledger_club_id is distinct from v_club_id
       or v_ledger_target_id is distinct from v_applicant_id
       or v_ledger_role_code is not null
       or v_ledger_fingerprint is distinct from v_fingerprint then
      raise exception 'IDEMPOTENCY_KEY_REUSED';
    end if;
    if v_ledger_completed_at is not null then
      return query select
        p_request_id,
        v_ledger_action,
        (v_ledger_result ->> 'application_id')::uuid,
        v_ledger_club_id,
        v_ledger_target_id,
        v_ledger_result ->> 'application_status',
        (v_ledger_result ->> 'application_version')::bigint,
        (v_ledger_result ->> 'membership_id')::uuid,
        v_ledger_result ->> 'membership_status',
        (v_ledger_result ->> 'role_assignment_id')::uuid,
        v_ledger_result ->> 'role_code',
        v_ledger_result ->> 'membership_transition',
        true,
        (v_ledger_result ->> 'approved_at')::timestamptz;
      return;
    end if;
  end if;

  select
    membership.id,
    membership.membership_status
  into
    v_membership_id,
    v_previous_membership_status
  from public.club_memberships as membership
  where membership.club_id = v_club_id
    and membership.user_id = v_applicant_id
  for update;

  if found then
    if v_previous_membership_status = 'active' then
      raise exception 'MEMBERSHIP_APPLICATION_MEMBERSHIP_ALREADY_ACTIVE';
    elsif v_previous_membership_status = 'suspended' then
      raise exception 'MEMBERSHIP_APPLICATION_MEMBERSHIP_SUSPENDED';
    elsif v_previous_membership_status <> 'left' then
      raise exception 'MEMBERSHIP_APPLICATION_MEMBERSHIP_STATE_INVALID';
    end if;
  end if;

  select role_definition.is_active
    into v_role_definition_active
  from public.club_role_definitions as role_definition
  where role_definition.role_code = 'club_member'
  for share;

  if not found or not v_role_definition_active then
    raise exception 'CLUB_MEMBER_ROLE_NOT_ACTIVE';
  end if;

  if v_membership_id is not null then
    select pg_catalog.count(*)::integer
      into v_active_assignment_count
    from (
      select assignment.id
      from public.club_role_assignments as assignment
      where assignment.membership_id = v_membership_id
        and assignment.revoked_at is null
      order by assignment.role_code, assignment.assigned_at, assignment.id
      for update
    ) as active_assignments;

    if v_active_assignment_count <> 0 then
      raise exception 'MEMBERSHIP_APPLICATION_ROLE_STATE_CONFLICT';
    end if;
  end if;

  if v_membership_id is null then
    insert into public.club_memberships (
      club_id,
      user_id,
      membership_status,
      joined_at,
      suspended_at,
      left_at,
      created_at,
      updated_at
    ) values (
      v_club_id,
      v_applicant_id,
      'active',
      v_approved_at,
      null,
      null,
      v_approved_at,
      v_approved_at
    )
    returning id into v_membership_id;

    v_membership_transition := 'created';
  else
    update public.club_memberships as membership
    set
      membership_status = 'active',
      suspended_at = null,
      left_at = null,
      updated_at = v_approved_at
    where membership.id = v_membership_id
      and membership.membership_status = 'left';

    if not found then
      raise exception 'MEMBERSHIP_APPLICATION_MEMBERSHIP_STATE_CHANGED';
    end if;

    v_membership_transition := 'reactivated';
  end if;

  insert into public.club_role_assignments (
    membership_id,
    role_code,
    assigned_at,
    assigned_by,
    revoked_at,
    revoked_by,
    created_at
  ) values (
    v_membership_id,
    'club_member',
    v_approved_at,
    v_actor_id,
    null,
    null,
    v_approved_at
  )
  returning id into v_role_assignment_id;

  perform private.set_club_membership_application_mutation_context(
    p_request_id::text,
    v_action_code,
    v_actor_id::text,
    v_club_id::text,
    p_application_id::text,
    v_applicant_id::text,
    'approved',
    p_expected_version::text,
    v_fingerprint,
    null,
    null
  );

  update public.club_membership_applications as application
  set
    status = 'approved',
    version = application.version + 1,
    status_changed_at = v_approved_at,
    finalized_at = v_approved_at
  where application.id = p_application_id
    and application.version = p_expected_version;

  if not found then
    raise exception 'APPLICATION_VERSION_CONFLICT' using errcode = '40001';
  end if;

  insert into public.club_membership_application_status_history (
    application_id,
    club_id,
    actor_user_id,
    request_id,
    event_code,
    from_status,
    to_status,
    application_version,
    created_at
  ) values (
    p_application_id,
    v_club_id,
    v_actor_id,
    p_request_id,
    'application.approved',
    v_previous_application_status,
    'approved',
    p_expected_version + 1,
    v_approved_at
  );

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
    outcome,
    created_at
  ) values (
    v_actor_id,
    'operator',
    v_action_code,
    'club_membership_application_approval',
    p_application_id::text,
    v_club_id::text,
    pg_catalog.jsonb_build_object(
      'application_status', v_previous_application_status,
      'application_version', p_expected_version,
      'membership_status', v_previous_membership_status
    ),
    pg_catalog.jsonb_build_object(
      'application_status', 'approved',
      'application_version', p_expected_version + 1,
      'membership_status', 'active',
      'role_code', 'club_member'
    ),
    null,
    pg_catalog.jsonb_build_object(
      'application_id', p_application_id,
      'applicant_id', v_applicant_id,
      'membership_id', v_membership_id,
      'membership_transition', v_membership_transition,
      'role_assignment_id', v_role_assignment_id,
      'approved_at', v_approved_at
    ),
    p_request_id,
    'success',
    v_approved_at
  );

  v_result := pg_catalog.jsonb_build_object(
    'action_code', v_action_code,
    'application_id', p_application_id,
    'club_id', v_club_id,
    'applicant_id', v_applicant_id,
    'application_status', 'approved',
    'application_version', p_expected_version + 1,
    'membership_id', v_membership_id,
    'membership_status', 'active',
    'role_assignment_id', v_role_assignment_id,
    'role_code', 'club_member',
    'membership_transition', v_membership_transition,
    'approved_at', v_approved_at
  );

  update private.club_mutation_requests as ledger
  set
    outcome = 'success',
    result_data = v_result,
    completed_at = v_approved_at
  where ledger.actor_id = v_actor_id
    and ledger.request_id = p_request_id
    and ledger.action_code = v_action_code
    and ledger.club_id = v_club_id
    and ledger.target_user_id = v_applicant_id
    and ledger.role_code is null
    and ledger.input_fingerprint = v_fingerprint
    and ledger.completed_at is null;

  get diagnostics v_completed_count = row_count;
  if v_completed_count <> 1 then
    raise exception 'IDEMPOTENCY_COMPLETION_FAILED';
  end if;

  perform private.set_club_membership_application_mutation_context(
    v_previous_request_context,
    v_previous_action_context,
    v_previous_actor_context,
    v_previous_club_context,
    v_previous_application_context,
    v_previous_applicant_context,
    v_previous_target_context,
    v_previous_version_context,
    v_previous_fingerprint_context,
    v_previous_entry_context,
    v_previous_entry_type_context
  );

  return query select
    p_request_id,
    v_action_code,
    p_application_id,
    v_club_id,
    v_applicant_id,
    'approved'::text,
    p_expected_version + 1,
    v_membership_id,
    'active'::text,
    v_role_assignment_id,
    'club_member'::text,
    v_membership_transition,
    false,
    v_approved_at;
exception
  when others then
    perform private.set_club_membership_application_mutation_context(
      v_previous_request_context,
      v_previous_action_context,
      v_previous_actor_context,
      v_previous_club_context,
      v_previous_application_context,
      v_previous_applicant_context,
      v_previous_target_context,
      v_previous_version_context,
      v_previous_fingerprint_context,
      v_previous_entry_context,
      v_previous_entry_type_context
    );
    raise;
end;
$$;

comment on function private.execute_club_membership_application_approval(
  uuid, bigint, uuid
) is
  'Atomically approves an eligible application, activates its membership, creates a fresh club_member assignment, writes one audit event, and completes one idempotency ledger.';

revoke all on function private.execute_club_membership_application_approval(
  uuid, bigint, uuid
) from public, anon, authenticated, service_role;

create function public.approve_club_membership_application(
  p_application_id uuid,
  p_expected_version bigint,
  p_request_id uuid
)
returns table (
  request_id uuid,
  action_code text,
  application_id uuid,
  club_id uuid,
  applicant_id uuid,
  application_status text,
  application_version bigint,
  membership_id uuid,
  membership_status text,
  role_assignment_id uuid,
  role_code text,
  membership_transition text,
  replayed boolean,
  approved_at timestamptz
)
language sql
volatile
security definer
set search_path = ''
as $$
  select *
  from private.execute_club_membership_application_approval(
    p_application_id,
    p_expected_version,
    p_request_id
  );
$$;

comment on function public.approve_club_membership_application(
  uuid, bigint, uuid
) is
  'Approves one eligible membership application for an authenticated active club administrator or vice administrator.';

revoke all on function public.approve_club_membership_application(
  uuid, bigint, uuid
) from public, anon, authenticated, service_role;

grant execute on function public.approve_club_membership_application(
  uuid, bigint, uuid
) to authenticated;
