-- 8-4D local integration correction.
-- Corrects APPLICATION_VERSION_CONFLICT API timeout behavior and enforces
-- the applicant_response 500 character contract without changing operator limits.

alter table public.club_membership_application_supplements
  add constraint club_membership_application_supplements_applicant_response_length_check
  check (
    entry_type <> 'applicant_response'
    or pg_catalog.char_length(body) <= 500
  );

comment on constraint club_membership_application_supplements_applicant_response_length_check
  on public.club_membership_application_supplements is
  '8-4D local integration correction: applicant_response 500 character enforcement.';

create or replace function private.execute_club_membership_application_mutation(
  p_application_id uuid,
  p_operation text,
  p_expected_version bigint,
  p_body text,
  p_request_id uuid
)
returns table (
  request_id uuid,
  action_code text,
  application_id uuid,
  club_id uuid,
  applicant_id uuid,
  previous_status text,
  current_status text,
  application_version bigint,
  related_entry_id uuid,
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
  v_actor_status text;
  v_club_id uuid;
  v_applicant_id uuid;
  v_previous_status text;
  v_current_version bigint;
  v_action_code text;
  v_target_status text;
  v_event_code text;
  v_entry_type text;
  v_body text := nullif(pg_catalog.btrim(p_body), '');
  v_entry_id uuid;
  v_fingerprint text;
  v_ledger_action text;
  v_ledger_club_id uuid;
  v_ledger_target uuid;
  v_ledger_fingerprint text;
  v_ledger_outcome text;
  v_ledger_result jsonb;
  v_ledger_completed_at timestamptz;
  v_ledger_found boolean := false;
  v_result jsonb;
  v_completed_count integer;
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

  v_action_code := case p_operation
    when 'withdraw' then 'membership_application.withdraw'
    when 'supplement_response' then 'membership_application.supplement_response'
    when 'review' then 'membership_application.review'
    when 'request_additional_info' then 'membership_application.request_additional_info'
    when 'request_interview' then 'membership_application.request_interview'
    when 'waitlist' then 'membership_application.waitlist'
    when 'resume_review' then 'membership_application.resume_review'
    when 'internal_note' then 'membership_application.internal_note'
    when 'reject' then 'membership_application.reject'
    else null
  end;

  if v_action_code is null then
    raise exception 'INVALID_APPLICATION_OPERATION';
  end if;

  if p_operation in ('request_additional_info', 'supplement_response', 'internal_note') then
    if v_body is null
      or (
        p_operation = 'supplement_response'
        and pg_catalog.char_length(v_body) > 500
      )
      or (
        p_operation in ('request_additional_info', 'internal_note')
        and pg_catalog.char_length(v_body) > 1000
      )
    then
      raise exception 'INVALID_APPLICATION_BODY';
    end if;
  elsif v_body is not null then
    raise exception 'BODY_NOT_ALLOWED_FOR_OPERATION';
  end if;

  if p_operation = 'internal_note' then
    if p_expected_version is not null then
      raise exception 'VERSION_NOT_ALLOWED_FOR_INTERNAL_NOTE';
    end if;
  elsif p_expected_version is null or p_expected_version < 1 then
    raise exception 'EXPECTED_VERSION_REQUIRED';
  end if;

  select account.account_status
    into v_actor_status
  from public.user_accounts as account
  where account.id = v_actor_id
  for share;

  if not found or v_actor_status <> 'active' then
    raise exception 'ACCOUNT_NOT_ACTIVE' using errcode = '42501';
  end if;

  select
    application.club_id,
    application.applicant_id,
    application.status,
    application.version
  into
    v_club_id,
    v_applicant_id,
    v_previous_status,
    v_current_version
  from public.club_membership_applications as application
  where application.id = p_application_id
  for update;

  if not found then
    raise exception 'APPLICATION_NOT_FOUND';
  end if;

  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'action', v_action_code,
    'application_id', p_application_id,
    'club_id', v_club_id,
    'applicant_id', v_applicant_id,
    'expected_version', p_expected_version,
    'body_hash', case when v_body is null then null else pg_catalog.md5(v_body) end,
    'body_length', coalesce(pg_catalog.char_length(v_body), 0)
  )::text);

  select
    ledger.action_code,
    ledger.club_id,
    ledger.target_user_id,
    ledger.input_fingerprint,
    ledger.outcome,
    ledger.result_data,
    ledger.completed_at
  into
    v_ledger_action,
    v_ledger_club_id,
    v_ledger_target,
    v_ledger_fingerprint,
    v_ledger_outcome,
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
       or v_ledger_target is distinct from v_applicant_id
       or v_ledger_fingerprint is distinct from v_fingerprint then
      raise exception 'IDEMPOTENCY_KEY_REUSED';
    end if;
    if v_ledger_completed_at is not null then
      return query select
        p_request_id,
        v_ledger_action,
        (v_ledger_result ->> 'application_id')::uuid,
        v_ledger_club_id,
        v_ledger_target,
        v_ledger_result ->> 'previous_status',
        v_ledger_result ->> 'current_status',
        (v_ledger_result ->> 'application_version')::bigint,
        nullif(v_ledger_result ->> 'related_entry_id', '')::uuid,
        (v_ledger_result ->> 'changed')::boolean,
        true,
        v_ledger_outcome;
      return;
    end if;
  end if;

  if p_operation in ('withdraw', 'supplement_response') then
    if v_actor_id <> v_applicant_id then
      raise exception 'APPLICATION_OWNER_REQUIRED' using errcode = '42501';
    end if;
  elsif p_operation = 'reject' then
    if not private.club_user_has_permission(
         v_actor_id, v_club_id, 'club.membership_applications.decide'
       )
       or not private.club_user_is_active_admin_or_vice_admin(
         v_actor_id, v_club_id
       ) then
      raise exception 'APPLICATION_DECIDE_PERMISSION_REQUIRED' using errcode = '42501';
    end if;
  else
    if not private.club_user_has_permission(
      v_actor_id, v_club_id, 'club.membership_applications.manage'
    ) then
      raise exception 'APPLICATION_MANAGE_PERMISSION_REQUIRED' using errcode = '42501';
    end if;
  end if;

  if p_operation <> 'internal_note' and v_current_version <> p_expected_version then
    raise exception 'APPLICATION_VERSION_CONFLICT' using errcode = 'PT409';
  end if;

  if p_operation = 'withdraw' then
    if v_previous_status not in (
      'submitted', 'reviewing', 'additional_info_required',
      'interview_requested', 'waitlisted'
    ) then
      raise exception 'APPLICATION_WITHDRAW_FORBIDDEN';
    end if;
    v_target_status := 'withdrawn';
    v_event_code := 'application.withdrawn';
  elsif p_operation = 'supplement_response' then
    if v_previous_status <> 'additional_info_required' then
      raise exception 'SUPPLEMENT_RESPONSE_STATE_INVALID';
    end if;
    v_target_status := 'reviewing';
    v_event_code := 'application.supplement_submitted';
    v_entry_type := 'applicant_response';
  elsif p_operation = 'review' then
    if v_previous_status <> 'submitted' then
      raise exception 'APPLICATION_TRANSITION_FORBIDDEN';
    end if;
    v_target_status := 'reviewing';
    v_event_code := 'application.review_started';
  elsif p_operation = 'request_additional_info' then
    if v_previous_status <> 'reviewing' then
      raise exception 'APPLICATION_TRANSITION_FORBIDDEN';
    end if;
    v_target_status := 'additional_info_required';
    v_event_code := 'application.additional_info_requested';
    v_entry_type := 'additional_info_request';
  elsif p_operation = 'request_interview' then
    if v_previous_status <> 'reviewing' then
      raise exception 'APPLICATION_TRANSITION_FORBIDDEN';
    end if;
    v_target_status := 'interview_requested';
    v_event_code := 'application.interview_requested';
  elsif p_operation = 'waitlist' then
    if v_previous_status <> 'reviewing' then
      raise exception 'APPLICATION_TRANSITION_FORBIDDEN';
    end if;
    v_target_status := 'waitlisted';
    v_event_code := 'application.waitlisted';
  elsif p_operation = 'resume_review' then
    if v_previous_status not in (
      'additional_info_required', 'interview_requested', 'waitlisted'
    ) then
      raise exception 'APPLICATION_TRANSITION_FORBIDDEN';
    end if;
    v_target_status := 'reviewing';
    v_event_code := 'application.review_resumed';
  elsif p_operation = 'reject' then
    if v_previous_status not in (
      'submitted', 'reviewing', 'additional_info_required',
      'interview_requested', 'waitlisted'
    ) then
      raise exception 'APPLICATION_REJECT_FORBIDDEN';
    end if;
    v_target_status := 'rejected';
    v_event_code := 'application.rejected';
  else
    v_target_status := v_previous_status;
  end if;

  if v_target_status = 'approved' then
    raise exception 'APPLICATION_APPROVAL_DEFERRED_TO_8_4C' using errcode = '42501';
  end if;

  if not v_ledger_found then
    insert into private.club_mutation_requests (
      actor_id, request_id, action_code, club_id, target_user_id, input_fingerprint
    ) values (
      v_actor_id, p_request_id, v_action_code,
      v_club_id, v_applicant_id, v_fingerprint
    )
    on conflict on constraint club_mutation_requests_actor_request_unique do nothing;

    select
      ledger.action_code,
      ledger.club_id,
      ledger.target_user_id,
      ledger.input_fingerprint,
      ledger.outcome,
      ledger.result_data,
      ledger.completed_at
    into
      v_ledger_action,
      v_ledger_club_id,
      v_ledger_target,
      v_ledger_fingerprint,
      v_ledger_outcome,
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
       or v_ledger_target is distinct from v_applicant_id
       or v_ledger_fingerprint is distinct from v_fingerprint then
      raise exception 'IDEMPOTENCY_KEY_REUSED';
    end if;
    if v_ledger_completed_at is not null then
      return query select
        p_request_id,
        v_ledger_action,
        (v_ledger_result ->> 'application_id')::uuid,
        v_ledger_club_id,
        v_ledger_target,
        v_ledger_result ->> 'previous_status',
        v_ledger_result ->> 'current_status',
        (v_ledger_result ->> 'application_version')::bigint,
        nullif(v_ledger_result ->> 'related_entry_id', '')::uuid,
        (v_ledger_result ->> 'changed')::boolean,
        true,
        v_ledger_outcome;
      return;
    end if;
  end if;

  if p_operation in ('request_additional_info', 'supplement_response', 'internal_note') then
    v_entry_id := pg_catalog.gen_random_uuid();
  end if;

  perform private.set_club_membership_application_mutation_context(
    p_request_id::text,
    v_action_code,
    v_actor_id::text,
    v_club_id::text,
    p_application_id::text,
    v_applicant_id::text,
    v_target_status,
    case when p_expected_version is null then null else p_expected_version::text end,
    v_fingerprint,
    case when v_entry_id is null then null else v_entry_id::text end,
    v_entry_type
  );

  if p_operation = 'internal_note' then
    insert into public.club_membership_application_internal_notes (
      id, application_id, club_id, author_user_id, request_id, body
    ) values (
      v_entry_id, p_application_id, v_club_id, v_actor_id, p_request_id, v_body
    );
  else
    update public.club_membership_applications as application
    set
      status = v_target_status,
      version = application.version + 1,
      status_changed_at = pg_catalog.now(),
      finalized_at = case
        when v_target_status in ('rejected', 'withdrawn') then pg_catalog.now()
        else null
      end
    where application.id = p_application_id
      and application.version = p_expected_version;

    if not found then
      raise exception 'APPLICATION_VERSION_CONFLICT' using errcode = 'PT409';
    end if;

    if v_entry_type is not null then
      insert into public.club_membership_application_supplements (
        id, application_id, club_id, author_user_id, request_id, entry_type, body
      ) values (
        v_entry_id, p_application_id, v_club_id, v_actor_id,
        p_request_id, v_entry_type, v_body
      );
    end if;

    insert into public.club_membership_application_status_history (
      application_id, club_id, actor_user_id, request_id,
      event_code, from_status, to_status, application_version
    ) values (
      p_application_id, v_club_id, v_actor_id, p_request_id,
      v_event_code, v_previous_status, v_target_status, p_expected_version + 1
    );

    v_current_version := p_expected_version + 1;
  end if;

  insert into public.audit_logs (
    actor_id, actor_type, action, target_type, target_id, club_id,
    before_summary, after_summary, reason, metadata, request_id, outcome
  ) values (
    v_actor_id,
    'user',
    v_action_code,
    'club_membership_application',
    p_application_id::text,
    v_club_id::text,
    pg_catalog.jsonb_build_object(
      'status', v_previous_status,
      'version', v_current_version - case when p_operation = 'internal_note' then 0 else 1 end
    ),
    pg_catalog.jsonb_build_object(
      'status', v_target_status,
      'version', v_current_version
    ),
    null,
    pg_catalog.jsonb_build_object(
      'entry_type', v_entry_type,
      'body_present', v_body is not null,
      'body_length', coalesce(pg_catalog.char_length(v_body), 0),
      'state_changed', p_operation <> 'internal_note'
    ),
    p_request_id,
    'success'
  );

  v_result := pg_catalog.jsonb_build_object(
    'action_code', v_action_code,
    'application_id', p_application_id,
    'club_id', v_club_id,
    'applicant_id', v_applicant_id,
    'previous_status', v_previous_status,
    'current_status', v_target_status,
    'application_version', v_current_version,
    'related_entry_id', v_entry_id,
    'changed', true,
    'outcome', 'success'
  );

  update private.club_mutation_requests as ledger
  set outcome = 'success', result_data = v_result, completed_at = pg_catalog.now()
  where ledger.actor_id = v_actor_id
    and ledger.request_id = p_request_id
    and ledger.action_code = v_action_code
    and ledger.input_fingerprint = v_fingerprint
    and ledger.completed_at is null;

  get diagnostics v_completed_count = row_count;
  if v_completed_count <> 1 then
    raise exception 'IDEMPOTENCY_COMPLETION_FAILED';
  end if;

  perform private.set_club_membership_application_mutation_context(
    v_previous_request_context, v_previous_action_context, v_previous_actor_context,
    v_previous_club_context, v_previous_application_context,
    v_previous_applicant_context, v_previous_target_context,
    v_previous_version_context, v_previous_fingerprint_context,
    v_previous_entry_context, v_previous_entry_type_context
  );

  return query select
    p_request_id,
    v_action_code,
    p_application_id,
    v_club_id,
    v_applicant_id,
    v_previous_status,
    v_target_status,
    v_current_version,
    v_entry_id,
    true,
    false,
    'success'::text;
exception
  when others then
    perform private.set_club_membership_application_mutation_context(
      v_previous_request_context, v_previous_action_context, v_previous_actor_context,
      v_previous_club_context, v_previous_application_context,
      v_previous_applicant_context, v_previous_target_context,
      v_previous_version_context, v_previous_fingerprint_context,
      v_previous_entry_context, v_previous_entry_type_context
    );
    raise;
end;
$$;

comment on function private.execute_club_membership_application_mutation(
  uuid, text, bigint, text, uuid
) is
  '8-4D local integration correction: preserves membership application mutation behavior while returning PT409 for intentional APPLICATION_VERSION_CONFLICT errors and enforcing applicant_response bodies at 500 characters.';

revoke all on function private.execute_club_membership_application_mutation(
  uuid, text, bigint, text, uuid
) from public, anon, authenticated, service_role;

create or replace function private.execute_club_membership_application_approval(
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
    raise exception 'APPLICATION_VERSION_CONFLICT' using errcode = 'PT409';
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
    raise exception 'APPLICATION_VERSION_CONFLICT' using errcode = 'PT409';
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
  'Atomically approves an eligible application, activates its membership, creates a fresh club_member assignment, writes one audit event, and completes one idempotency ledger. 8-4D local integration correction: intentional APPLICATION_VERSION_CONFLICT errors return PT409 instead of a retryable transaction SQLSTATE.';

revoke all on function private.execute_club_membership_application_approval(
  uuid, bigint, uuid
) from public, anon, authenticated, service_role;

