-- PUL 8-6-B-3-3A: batch-atomic final decisions and canonical HOF records.
-- Public projection, badges, correction, revocation, appeals, and UI remain deferred.

alter table public.hall_of_fame_application_messages
  drop constraint hall_of_fame_application_messages_type_check,
  drop constraint hall_of_fame_application_messages_workflow_shape_check;

alter table public.hall_of_fame_application_messages
  add constraint hall_of_fame_application_messages_type_check
    check (
      message_type in (
        'additional_info_request',
        'applicant_response',
        'system_notice',
        'final_decision_notice'
      )
    ),
  add constraint hall_of_fame_application_messages_workflow_shape_check
    check (
      (
        message_type = 'additional_info_request'
        and recipient_user_id is not null
        and reply_to_message_id is null
        and request_kind is not null
        and (
          (
            request_kind = 'text_response'
            and requested_evidence_type is null
          )
          or (
            request_kind in ('supplemental_evidence', 'text_and_evidence')
            and application_record_id is not null
            and requested_evidence_type is not null
          )
        )
      )
      or (
        message_type = 'applicant_response'
        and recipient_user_id is null
        and reply_to_message_id is not null
        and request_kind is null
        and requested_evidence_type is null
      )
      or (
        message_type = 'system_notice'
        and recipient_user_id is null
        and reply_to_message_id is null
        and request_kind is null
        and requested_evidence_type is null
      )
      or (
        message_type = 'final_decision_notice'
        and application_record_id is not null
        and recipient_user_id is not null
        and reply_to_message_id is null
        and request_kind is null
        and requested_evidence_type is null
      )
    );

create function private.enforce_guarded_hall_of_fame_final_decision_mutation()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_request uuid;
  v_batch uuid;
  v_operation text;
  v_fingerprint text;
  v_platform_role text;
begin
  if tg_op = 'DELETE' then
    raise exception 'HOF_DIRECT_DELETE_FORBIDDEN' using errcode = '42501';
  end if;

  begin
    v_actor := nullif(pg_catalog.current_setting('pul.hall_of_fame.actor_user_id', true), '')::uuid;
    v_request := nullif(pg_catalog.current_setting('pul.hall_of_fame.request_id', true), '')::uuid;
    v_batch := nullif(pg_catalog.current_setting('pul.hall_of_fame.application_batch_id', true), '')::uuid;
  exception
    when invalid_text_representation then
      raise exception 'HOF_INVALID_MUTATION_CONTEXT' using errcode = '42501';
  end;
  v_operation := nullif(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '');
  v_fingerprint := nullif(pg_catalog.current_setting('pul.hall_of_fame.payload_fingerprint', true), '');

  if v_actor is null
     or v_request is null
     or v_batch is null
     or v_operation <> 'hall_of_fame.application.final_decision'
     or v_fingerprint is null
     or auth.uid() is distinct from v_actor then
    raise exception 'HOF_FINAL_DECISION_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  if tg_table_schema = 'private'
     and tg_table_name = 'hall_of_fame_mutation_requests' then
    if tg_op = 'INSERT' then
      if new.actor_user_id <> v_actor
         or new.request_id <> v_request
         or new.operation <> v_operation
         or new.application_batch_id <> v_batch
         or new.application_record_id is not null
         or new.target_user_id is not null
         or pg_catalog.encode(new.payload_fingerprint, 'hex') <> v_fingerprint
         or new.status <> 'in_progress'
         or new.result_payload is not null
         or new.error_code is not null
         or new.completed_at is not null then
        raise exception 'HOF_LEDGER_CONTEXT_MISMATCH' using errcode = '42501';
      end if;
      return new;
    end if;
    if old.actor_user_id <> v_actor
       or old.request_id <> v_request
       or old.operation <> v_operation
       or old.application_batch_id <> v_batch
       or old.application_record_id is not null
       or old.target_user_id is not null
       or pg_catalog.encode(old.payload_fingerprint, 'hex') <> v_fingerprint
       or new.id <> old.id
       or new.actor_user_id <> old.actor_user_id
       or new.request_id <> old.request_id
       or new.operation <> old.operation
       or new.application_batch_id <> old.application_batch_id
       or new.application_record_id is distinct from old.application_record_id
       or new.target_user_id is distinct from old.target_user_id
       or new.payload_fingerprint <> old.payload_fingerprint
       or new.created_at <> old.created_at
       or old.status <> 'in_progress'
       or new.status <> 'completed'
       or new.result_payload is null
       or new.error_code is not null
       or new.completed_at is null then
      raise exception 'HOF_LEDGER_CONTEXT_MISMATCH' using errcode = '42501';
    end if;
    return new;
  end if;

  select account.platform_role
    into v_platform_role
  from public.user_accounts as account
  where account.id = v_actor
    and account.account_status = 'active';

  if not private.hall_of_fame_mutation_context_is_valid()
     or v_platform_role is null
     or not exists (
       select 1
       from public.platform_role_permissions as mapping
       join public.platform_permission_definitions as permission
         on permission.code = mapping.permission_code
        and permission.is_active
       where mapping.platform_role = v_platform_role
         and mapping.permission_code = 'hall_of_fame.applications.decide'
     ) then
    raise exception 'HOF_FINAL_DECISION_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  if tg_table_schema = 'public'
     and tg_table_name = 'hall_of_fame_application_records' then
    if tg_op <> 'UPDATE'
       or old.application_batch_id <> v_batch
       or new.id <> old.id
       or new.application_batch_id <> old.application_batch_id
       or new.round_snapshot_id <> old.round_snapshot_id
       or new.target_user_id <> old.target_user_id
       or new.target_membership_id is distinct from old.target_membership_id
       or new.record_type_code <> old.record_type_code
       or new.course_segment_snapshot <> old.course_segment_snapshot
       or new.hole_number <> old.hole_number
       or new.hole_par is distinct from old.hole_par
       or new.strokes is distinct from old.strokes
       or new.club_verification_status <> old.club_verification_status
       or new.member_consent_status <> old.member_consent_status
       or new.conflict_of_interest <> old.conflict_of_interest
       or new.fingerprint_version <> old.fingerprint_version
       or new.duplicate_fingerprint is distinct from old.duplicate_fingerprint
       or new.created_at <> old.created_at
       or old.review_status <> 'under_review'
       or new.review_status not in ('approved', 'rejected')
       or new.version <> old.version + 1
       or new.updated_at <> pg_catalog.now() then
      raise exception 'HOF_APPLICATION_RECORD_CONTEXT_MISMATCH' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_table_schema = 'public'
     and tg_table_name = 'hall_of_fame_application_batches' then
    if tg_op <> 'UPDATE'
       or old.id <> v_batch
       or new.id <> old.id
       or new.application_type <> old.application_type
       or new.created_by_user_id <> old.created_by_user_id
       or new.created_by_membership_id is distinct from old.created_by_membership_id
       or new.nominating_club_id is distinct from old.nominating_club_id
       or new.vacancy_context_club_id is distinct from old.vacancy_context_club_id
       or new.submitted_at is distinct from old.submitted_at
       or new.created_at <> old.created_at
       or old.status <> 'under_review'
       or new.status not in ('approved', 'partially_approved', 'rejected')
       or new.finalized_at <> pg_catalog.now()
       or new.updated_at <> pg_catalog.now()
       or new.version <> old.version + 1 then
      raise exception 'HOF_APPLICATION_BATCH_CONTEXT_MISMATCH' using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'HOF_MUTATION_RPC_REQUIRED' using errcode = '42501';
end;
$$;

revoke all on function private.enforce_guarded_hall_of_fame_final_decision_mutation()
  from public, anon, authenticated, service_role;

comment on function private.enforce_guarded_hall_of_fame_final_decision_mutation() is
  'Binds final-decision ledger, record, and batch writes to the authenticated decision RPC context.';

create function private.enforce_hall_of_fame_final_application_history_append()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_request uuid;
  v_batch uuid;
  v_status text;
  v_version integer;
  v_previous text;
  v_platform_role text;
begin
  if tg_op <> 'INSERT' then
    raise exception 'HOF_APPEND_ONLY_MUTATION_FORBIDDEN' using errcode = '42501';
  end if;
  begin
    v_actor := nullif(pg_catalog.current_setting('pul.hall_of_fame.actor_user_id', true), '')::uuid;
    v_request := nullif(pg_catalog.current_setting('pul.hall_of_fame.request_id', true), '')::uuid;
    v_batch := nullif(pg_catalog.current_setting('pul.hall_of_fame.application_batch_id', true), '')::uuid;
  exception when invalid_text_representation then
    raise exception 'HOF_INVALID_HISTORY_CONTEXT' using errcode = '42501';
  end;
  select account.platform_role into v_platform_role
  from public.user_accounts account
  where account.id = v_actor and account.account_status = 'active';

  if nullif(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '')
       <> 'hall_of_fame.application.final_decision'
     or v_actor is null or v_request is null or v_batch is null
     or auth.uid() is distinct from v_actor
     or not private.hall_of_fame_mutation_context_is_valid()
     or new.actor_user_id <> v_actor
     or new.request_id <> v_request
     or new.application_batch_id <> v_batch
     or new.actor_membership_id is not null
     or new.actor_platform_role <> v_platform_role
     or new.action <> 'hall_of_fame.application.final_decision'
     or new.reason is not null
     or new.from_status <> 'under_review' then
    raise exception 'HOF_APPLICATION_HISTORY_CONTEXT_MISMATCH' using errcode = '42501';
  end if;

  if new.scope = 'batch' and new.application_record_id is null then
    select batch.status, batch.version into v_status, v_version
    from public.hall_of_fame_application_batches batch where batch.id = v_batch;
    if new.to_status not in ('approved', 'partially_approved', 'rejected') then
      raise exception 'HOF_APPLICATION_HISTORY_CONTEXT_MISMATCH' using errcode = '42501';
    end if;
  elsif new.scope = 'record' and new.application_record_id is not null then
    select record.review_status, record.version into v_status, v_version
    from public.hall_of_fame_application_records record
    where record.id = new.application_record_id and record.application_batch_id = v_batch;
    if new.to_status not in ('approved', 'rejected') then
      raise exception 'HOF_APPLICATION_HISTORY_CONTEXT_MISMATCH' using errcode = '42501';
    end if;
  else
    raise exception 'HOF_APPLICATION_HISTORY_CONTEXT_MISMATCH' using errcode = '42501';
  end if;
  if not found or v_status <> new.to_status or v_version <> new.version then
    raise exception 'HOF_APPLICATION_HISTORY_CONTEXT_MISMATCH' using errcode = '42501';
  end if;
  select previous.to_status into v_previous
  from public.hall_of_fame_application_history previous
  where previous.scope = new.scope
    and previous.application_batch_id = new.application_batch_id
    and previous.application_record_id is not distinct from new.application_record_id
    and previous.version < new.version
  order by previous.version desc limit 1;
  if not found or v_previous <> 'under_review' then
    raise exception 'HOF_APPLICATION_HISTORY_CHAIN_MISMATCH' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_hall_of_fame_final_application_history_append()
  from public, anon, authenticated, service_role;

comment on function private.enforce_hall_of_fame_final_application_history_append() is
  'Validates append-only record and batch final-decision history against current persisted state.';

create function private.enforce_hall_of_fame_final_review_append()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_request uuid;
  v_batch uuid;
  v_role text;
begin
  if tg_op <> 'INSERT' then
    raise exception 'HOF_APPEND_ONLY_MUTATION_FORBIDDEN' using errcode = '42501';
  end if;
  begin
    v_actor := nullif(pg_catalog.current_setting('pul.hall_of_fame.actor_user_id', true), '')::uuid;
    v_request := nullif(pg_catalog.current_setting('pul.hall_of_fame.request_id', true), '')::uuid;
    v_batch := nullif(pg_catalog.current_setting('pul.hall_of_fame.application_batch_id', true), '')::uuid;
  exception when invalid_text_representation then
    raise exception 'HOF_INVALID_REVIEW_CONTEXT' using errcode = '42501';
  end;
  select account.platform_role into v_role from public.user_accounts account
  where account.id = v_actor and account.account_status = 'active';
  if nullif(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '')
       <> 'hall_of_fame.application.final_decision'
     or v_actor is null or v_request is null or v_batch is null
     or auth.uid() is distinct from v_actor
     or not private.hall_of_fame_mutation_context_is_valid()
     or new.application_batch_id <> v_batch
     or new.application_record_id is null
     or new.reviewer_user_id <> v_actor
     or new.reviewer_platform_role <> v_role
     or new.review_action not in ('final_approved', 'final_rejected')
     or new.recommendation <> (
       case
         when new.review_action = 'final_approved' then 'approve'
         else 'reject'
       end
     )
     or new.internal_note is not null or new.duplicate_suspected or new.conflict_declared
     or new.request_id <> v_request
     or not exists (
       select 1 from public.hall_of_fame_application_records record
       where record.id = new.application_record_id
         and record.application_batch_id = v_batch
         and record.review_status = (
           case
             when new.review_action = 'final_approved' then 'approved'
             else 'rejected'
           end
         )
     ) then
    raise exception 'HOF_REVIEW_CONTEXT_MISMATCH' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_hall_of_fame_final_review_append()
  from public, anon, authenticated, service_role;

comment on function private.enforce_hall_of_fame_final_review_append() is
  'Admits only ledger-bound per-record final approval or rejection review events.';

create function private.enforce_hall_of_fame_final_message_append()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_request uuid;
  v_batch uuid;
  v_role text;
begin
  if tg_op <> 'INSERT' then
    raise exception 'HOF_APPEND_ONLY_MUTATION_FORBIDDEN' using errcode = '42501';
  end if;
  begin
    v_actor := nullif(pg_catalog.current_setting('pul.hall_of_fame.actor_user_id', true), '')::uuid;
    v_request := nullif(pg_catalog.current_setting('pul.hall_of_fame.request_id', true), '')::uuid;
    v_batch := nullif(pg_catalog.current_setting('pul.hall_of_fame.application_batch_id', true), '')::uuid;
  exception when invalid_text_representation then
    raise exception 'HOF_INVALID_MESSAGE_CONTEXT' using errcode = '42501';
  end;
  select account.platform_role into v_role from public.user_accounts account
  where account.id = v_actor and account.account_status = 'active';
  if nullif(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '')
       <> 'hall_of_fame.application.final_decision'
     or v_actor is null or v_request is null or v_batch is null
     or auth.uid() is distinct from v_actor
     or not private.hall_of_fame_mutation_context_is_valid()
     or new.application_batch_id <> v_batch
     or new.application_record_id is null
     or new.message_type <> 'final_decision_notice'
     or new.created_by_user_id <> v_actor
     or new.created_by_platform_role <> v_role
     or new.recipient_user_id is null
     or new.reply_to_message_id is not null
     or new.request_kind is not null
     or new.requested_evidence_type is not null
     or new.request_id <> v_request
     or not exists (
       select 1 from public.hall_of_fame_application_batches batch
       join public.hall_of_fame_application_records record
         on record.application_batch_id = batch.id
       where batch.id = v_batch
         and record.id = new.application_record_id
         and batch.created_by_user_id = new.recipient_user_id
         and record.review_status in ('approved', 'rejected')
     ) then
    raise exception 'HOF_APPLICATION_MESSAGE_CONTEXT_MISMATCH' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_hall_of_fame_final_message_append()
  from public, anon, authenticated, service_role;

comment on function private.enforce_hall_of_fame_final_message_append() is
  'Admits only record-scoped applicant final-decision notices created by the authenticated decider.';

create function private.enforce_hall_of_fame_canonical_insert()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_request uuid;
  v_batch uuid;
  v_source public.hall_of_fame_application_records%rowtype;
  v_round public.hall_of_fame_round_snapshots%rowtype;
  v_application public.hall_of_fame_application_batches%rowtype;
begin
  if tg_op <> 'INSERT' then
    raise exception 'HOF_CANONICAL_IMMUTABLE' using errcode = '42501';
  end if;
  begin
    v_actor := nullif(pg_catalog.current_setting('pul.hall_of_fame.actor_user_id', true), '')::uuid;
    v_request := nullif(pg_catalog.current_setting('pul.hall_of_fame.request_id', true), '')::uuid;
    v_batch := nullif(pg_catalog.current_setting('pul.hall_of_fame.application_batch_id', true), '')::uuid;
  exception when invalid_text_representation then
    raise exception 'HOF_INVALID_CANONICAL_CONTEXT' using errcode = '42501';
  end;
  select record.* into v_source from public.hall_of_fame_application_records record
  where record.id = new.source_application_record_id and record.application_batch_id = v_batch;
  select snapshot.* into v_round from public.hall_of_fame_round_snapshots snapshot
  where snapshot.id = v_source.round_snapshot_id and snapshot.application_batch_id = v_batch;
  select batch.* into v_application
  from public.hall_of_fame_application_batches as batch
  where batch.id = v_batch;
  if nullif(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '')
       <> 'hall_of_fame.application.final_decision'
     or v_actor is null or v_request is null or v_batch is null
     or auth.uid() is distinct from v_actor
     or not private.hall_of_fame_mutation_context_is_valid()
     or v_source.id is null or v_source.review_status <> 'approved'
     or v_round.id is null
     or v_application.id is null
     or new.target_user_id <> v_source.target_user_id
     or new.record_type_code <> v_source.record_type_code
     or new.played_on <> v_round.played_on
     or new.course_name_snapshot <> v_round.course_name_snapshot
     or new.course_region_snapshot <> v_round.course_region_snapshot
     or new.course_environment <> v_round.course_environment
     or new.course_layout_snapshot is distinct from v_round.course_layout_snapshot
     or new.course_segment_snapshot <> v_source.course_segment_snapshot
     or new.hole_number <> v_source.hole_number
     or new.hole_par is distinct from v_source.hole_par
     or new.strokes is distinct from v_source.strokes
     or new.nominating_club_id is distinct from v_application.nominating_club_id
     or new.fingerprint_version <> v_source.fingerprint_version
     or new.record_fingerprint <> v_source.duplicate_fingerprint
     or new.validity_status <> 'active'
     or new.publication_status <> 'hidden'
     or new.suppression_reason is not null
     or new.approved_by_user_id <> v_actor
     or new.approved_at <> pg_catalog.now()
     or new.published_at is not null
     or new.corrected_from_record_id is not null
     or new.revoked_at is not null
     or new.revoked_by_user_id is not null
     or new.revocation_reason is not null
     or new.version <> 1
     or new.created_at <> pg_catalog.now()
     or new.updated_at <> pg_catalog.now() then
    raise exception 'HOF_CANONICAL_CONTEXT_MISMATCH' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_hall_of_fame_canonical_insert()
  from public, anon, authenticated, service_role;

comment on function private.enforce_hall_of_fame_canonical_insert() is
  'Admits immutable active-hidden canonical records copied exactly from approved application snapshots.';

create function private.enforce_hall_of_fame_canonical_history_append()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_request uuid;
begin
  if tg_op <> 'INSERT' then
    raise exception 'HOF_APPEND_ONLY_MUTATION_FORBIDDEN' using errcode = '42501';
  end if;
  begin
    v_actor := nullif(pg_catalog.current_setting('pul.hall_of_fame.actor_user_id', true), '')::uuid;
    v_request := nullif(pg_catalog.current_setting('pul.hall_of_fame.request_id', true), '')::uuid;
  exception when invalid_text_representation then
    raise exception 'HOF_INVALID_CANONICAL_HISTORY_CONTEXT' using errcode = '42501';
  end;
  if nullif(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '')
       <> 'hall_of_fame.application.final_decision'
     or v_actor is null or v_request is null
     or auth.uid() is distinct from v_actor
     or not private.hall_of_fame_mutation_context_is_valid()
     or new.version <> 1
     or new.from_validity_status is not null
     or new.to_validity_status <> 'active'
     or new.from_publication_status is not null
     or new.to_publication_status <> 'hidden'
     or new.action <> 'hall_of_fame.record.approved'
     or new.reason is not null
     or new.actor_user_id <> v_actor
     or new.request_id <> v_request
     or not exists (
       select 1 from public.hall_of_fame_records record
       where record.id = new.record_id
         and record.version = 1
         and record.validity_status = 'active'
         and record.publication_status = 'hidden'
         and record.approved_by_user_id = v_actor
     ) then
    raise exception 'HOF_CANONICAL_HISTORY_CONTEXT_MISMATCH' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_hall_of_fame_canonical_history_append()
  from public, anon, authenticated, service_role;

comment on function private.enforce_hall_of_fame_canonical_history_append() is
  'Admits the version-one active-hidden history event for a newly approved canonical record.';

-- Route only the final-decision operation to its ledger-bound guards.
drop trigger hall_of_fame_application_batches_guard_before_mutation on public.hall_of_fame_application_batches;
create trigger hall_of_fame_application_batches_guard_before_mutation
before insert or update or delete on public.hall_of_fame_application_batches
for each row when (
  coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '') not like 'hall_of_fame.evidence.%'
  and coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '') <> 'hall_of_fame.application.submit'
  and coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '') not in (
    'hall_of_fame.application.review.start', 'hall_of_fame.application.review.note',
    'hall_of_fame.application.additional_info.request', 'hall_of_fame.application.additional_info.respond',
    'hall_of_fame.application.resubmit', 'hall_of_fame.application.withdraw',
    'hall_of_fame.nomination.participation.withdraw', 'hall_of_fame.application.final_decision'
  )
) execute function private.reject_hall_of_fame_mutation();
create trigger hall_of_fame_application_batches_final_decision_guard
before insert or update or delete on public.hall_of_fame_application_batches
for each row when (coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '') = 'hall_of_fame.application.final_decision')
execute function private.enforce_guarded_hall_of_fame_final_decision_mutation();

drop trigger hall_of_fame_application_records_guard_before_mutation on public.hall_of_fame_application_records;
create trigger hall_of_fame_application_records_guard_before_mutation
before insert or update or delete on public.hall_of_fame_application_records
for each row when (
  coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '') not like 'hall_of_fame.evidence.%'
  and coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '') <> 'hall_of_fame.application.submit'
  and coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '') not in (
    'hall_of_fame.application.review.start', 'hall_of_fame.application.review.note',
    'hall_of_fame.application.additional_info.request', 'hall_of_fame.application.additional_info.respond',
    'hall_of_fame.application.resubmit', 'hall_of_fame.application.withdraw',
    'hall_of_fame.nomination.participation.withdraw', 'hall_of_fame.application.final_decision'
  )
) execute function private.reject_hall_of_fame_mutation();
create trigger hall_of_fame_application_records_final_decision_guard
before insert or update or delete on public.hall_of_fame_application_records
for each row when (coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '') = 'hall_of_fame.application.final_decision')
execute function private.enforce_guarded_hall_of_fame_final_decision_mutation();

drop trigger hall_of_fame_mutation_requests_guard_before_mutation on private.hall_of_fame_mutation_requests;
create trigger hall_of_fame_mutation_requests_guard_before_mutation
before insert or update or delete on private.hall_of_fame_mutation_requests
for each row when (
  coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '') not like 'hall_of_fame.evidence.%'
  and coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '') <> 'hall_of_fame.application.submit'
  and coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '') not in (
    'hall_of_fame.application.review.start', 'hall_of_fame.application.review.note',
    'hall_of_fame.application.additional_info.request', 'hall_of_fame.application.additional_info.respond',
    'hall_of_fame.application.resubmit', 'hall_of_fame.application.withdraw',
    'hall_of_fame.nomination.participation.withdraw', 'hall_of_fame.application.final_decision'
  )
) execute function private.reject_hall_of_fame_mutation();
create trigger hall_of_fame_mutation_requests_final_decision_guard
before insert or update or delete on private.hall_of_fame_mutation_requests
for each row when (coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '') = 'hall_of_fame.application.final_decision')
execute function private.enforce_guarded_hall_of_fame_final_decision_mutation();

drop trigger hall_of_fame_application_history_guard_before_mutation on public.hall_of_fame_application_history;
drop trigger hall_of_fame_application_history_post_submit_guard on public.hall_of_fame_application_history;
create trigger hall_of_fame_application_history_guard_before_mutation
before insert or update or delete on public.hall_of_fame_application_history
for each row when (
  coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '') not like 'hall_of_fame.evidence.%'
  and coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '') <> 'hall_of_fame.application.submit'
  and coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '') not in (
    'hall_of_fame.application.review.start', 'hall_of_fame.application.review.note',
    'hall_of_fame.application.additional_info.request', 'hall_of_fame.application.additional_info.respond',
    'hall_of_fame.application.resubmit', 'hall_of_fame.application.withdraw',
    'hall_of_fame.nomination.participation.withdraw', 'hall_of_fame.application.final_decision'
  )
) execute function private.reject_hall_of_fame_append_only_mutation();
create trigger hall_of_fame_application_history_post_submit_guard
before insert or update or delete on public.hall_of_fame_application_history
for each row when (coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '') in (
  'hall_of_fame.application.review.start', 'hall_of_fame.application.additional_info.request',
  'hall_of_fame.application.resubmit', 'hall_of_fame.application.withdraw',
  'hall_of_fame.nomination.participation.withdraw'
)) execute function private.enforce_hall_of_fame_post_submit_history_append();
create trigger hall_of_fame_application_history_final_decision_guard
before insert or update or delete on public.hall_of_fame_application_history
for each row when (coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '') = 'hall_of_fame.application.final_decision')
execute function private.enforce_hall_of_fame_final_application_history_append();

drop trigger hall_of_fame_application_reviews_guard_before_mutation on public.hall_of_fame_application_reviews;
create trigger hall_of_fame_application_reviews_guard_before_mutation
before insert or update or delete on public.hall_of_fame_application_reviews
for each row when (coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '') not in (
  'hall_of_fame.application.review.start', 'hall_of_fame.application.review.note',
  'hall_of_fame.application.additional_info.request', 'hall_of_fame.application.final_decision'
)) execute function private.reject_hall_of_fame_append_only_mutation();
create trigger hall_of_fame_application_reviews_final_decision_guard
before insert or update or delete on public.hall_of_fame_application_reviews
for each row when (coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '') = 'hall_of_fame.application.final_decision')
execute function private.enforce_hall_of_fame_final_review_append();

drop trigger hall_of_fame_application_messages_guard_before_mutation on public.hall_of_fame_application_messages;
create trigger hall_of_fame_application_messages_guard_before_mutation
before insert or update or delete on public.hall_of_fame_application_messages
for each row when (coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '') not in (
  'hall_of_fame.application.additional_info.request', 'hall_of_fame.application.additional_info.respond',
  'hall_of_fame.application.final_decision'
)) execute function private.reject_hall_of_fame_append_only_mutation();
create trigger hall_of_fame_application_messages_final_decision_guard
before insert or update or delete on public.hall_of_fame_application_messages
for each row when (coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '') = 'hall_of_fame.application.final_decision')
execute function private.enforce_hall_of_fame_final_message_append();

drop trigger hall_of_fame_records_guard_before_mutation on public.hall_of_fame_records;
create trigger hall_of_fame_records_guard_before_mutation
before insert or update or delete on public.hall_of_fame_records
for each row when (coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '') <> 'hall_of_fame.application.final_decision')
execute function private.reject_hall_of_fame_mutation();
create trigger hall_of_fame_records_final_decision_guard
before insert or update or delete on public.hall_of_fame_records
for each row when (coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '') = 'hall_of_fame.application.final_decision')
execute function private.enforce_hall_of_fame_canonical_insert();

drop trigger hall_of_fame_record_history_guard_before_mutation on public.hall_of_fame_record_history;
create trigger hall_of_fame_record_history_guard_before_mutation
before insert or update or delete on public.hall_of_fame_record_history
for each row when (coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '') <> 'hall_of_fame.application.final_decision')
execute function private.reject_hall_of_fame_append_only_mutation();
create trigger hall_of_fame_record_history_final_decision_guard
before insert or update or delete on public.hall_of_fame_record_history
for each row when (coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '') = 'hall_of_fame.application.final_decision')
execute function private.enforce_hall_of_fame_canonical_history_append();

create function private.validate_hall_of_fame_final_approval(
  p_application_batch_id uuid,
  p_application_record_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_batch public.hall_of_fame_application_batches%rowtype;
  v_record public.hall_of_fame_application_records%rowtype;
begin
  select batch.* into v_batch from public.hall_of_fame_application_batches batch
  where batch.id = p_application_batch_id;
  select record.* into v_record from public.hall_of_fame_application_records record
  where record.id = p_application_record_id and record.application_batch_id = p_application_batch_id;
  if v_batch.id is null or v_record.id is null or v_batch.status <> 'under_review'
     or v_record.review_status <> 'under_review' then
    raise exception 'HOF_FINAL_DECISION_STATE_INVALID' using errcode = 'PT409';
  end if;
  if v_record.duplicate_fingerprint is null
     or pg_catalog.octet_length(v_record.duplicate_fingerprint) <> 32
     or not exists (
       select 1 from public.hall_of_fame_round_snapshots snapshot
       where snapshot.id = v_record.round_snapshot_id and snapshot.application_batch_id = v_batch.id
     )
     or not exists (
       select 1 from public.hall_of_fame_record_type_definitions definition
       where definition.code = v_record.record_type_code and definition.is_active
         and ((definition.qualification_kind = 'single_hole_score' and v_record.strokes = definition.qualification_value)
           or (definition.qualification_kind = 'relative_to_par' and v_record.hole_par is not null
             and v_record.strokes is not null and v_record.hole_par - v_record.strokes >= definition.qualification_value))
     ) then
    raise exception 'HOF_RECORD_APPROVAL_REQUIREMENTS_NOT_MET' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.hall_of_fame_records canonical
    where canonical.fingerprint_version = v_record.fingerprint_version
      and canonical.record_fingerprint = v_record.duplicate_fingerprint
      and canonical.validity_status = 'active'
  ) then
    raise exception 'HOF_DUPLICATE_RECORD' using errcode = 'PT409';
  end if;
  if exists (
    select 1 from public.hall_of_fame_application_records other
    where other.id <> v_record.id
      and other.fingerprint_version = v_record.fingerprint_version
      and other.duplicate_fingerprint = v_record.duplicate_fingerprint
      and other.review_status = 'approved'
  ) then
    raise exception 'HOF_DUPLICATE_RECORD' using errcode = 'PT409';
  end if;
  if exists (
    select 1 from public.hall_of_fame_evidence_files evidence
    where evidence.application_batch_id = v_batch.id
      and evidence.status in ('pending_upload', 'uploaded_unverified')
      and (evidence.application_record_id is null or evidence.application_record_id = v_record.id)
  ) then
    raise exception 'HOF_UNRESOLVED_EVIDENCE' using errcode = 'PT409';
  end if;
  if not exists (
    select 1 from public.hall_of_fame_evidence_files evidence
    where evidence.application_batch_id = v_batch.id
      and evidence.application_record_id = v_record.id
      and evidence.evidence_type = 'scorecard'
      and evidence.status = 'available' and evidence.finalized_at is not null
      and evidence.byte_size between 1 and 10485760
      and evidence.declared_byte_size = evidence.byte_size
      and evidence.declared_mime_type = evidence.mime_type
      and pg_catalog.octet_length(evidence.sha256) = 32
      and evidence.deleted_at is null and evidence.storage_deleted_at is null
      and evidence.replaced_by_evidence_id is null
  ) then
    raise exception 'HOF_SCORECARD_EVIDENCE_REQUIRED' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.hall_of_fame_application_messages request_message
    where request_message.application_batch_id = v_batch.id
      and request_message.message_type = 'additional_info_request'
      and (request_message.application_record_id is null or request_message.application_record_id = v_record.id)
      and ((request_message.request_kind in ('text_response', 'text_and_evidence') and not exists (
        select 1 from public.hall_of_fame_application_messages response
        where response.reply_to_message_id = request_message.id and response.message_type = 'applicant_response'
      )) or (request_message.request_kind in ('supplemental_evidence', 'text_and_evidence') and not exists (
        select 1 from public.hall_of_fame_evidence_files evidence
        where evidence.additional_info_request_message_id = request_message.id
          and evidence.status = 'available' and evidence.finalized_at is not null
          and evidence.deleted_at is null and evidence.storage_deleted_at is null
          and evidence.replaced_by_evidence_id is null
      )))
  ) then
    raise exception 'HOF_ADDITIONAL_INFO_INCOMPLETE' using errcode = 'PT409';
  end if;
  if exists (
    select 1 from (values ('application_processing'::text), ('evidence_review'::text), ('nomination_acceptance'::text)) required(purpose)
    where (required.purpose <> 'nomination_acceptance' or v_batch.application_type = 'club_nomination')
      and not exists (
        select 1 from public.hall_of_fame_application_consents consent
        where consent.application_record_id = v_record.id and consent.application_batch_id = v_batch.id
          and consent.subject_user_id = v_record.target_user_id
          and consent.consent_purpose = required.purpose and consent.status = 'granted'
          and consent.policy_version = pg_catalog.btrim(consent.policy_version) and consent.policy_version <> ''
          and (required.purpose <> 'nomination_acceptance' or consent.expires_at > pg_catalog.now())
      )
  ) then
    raise exception 'HOF_REQUIRED_APPLICATION_CONSENT_MISSING' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.hall_of_fame_record_confirmations confirmation
    where confirmation.application_record_id = v_record.id
      and confirmation.confirmation_role = 'round_companion'
      and confirmation.status = 'confirmed'
      and confirmation.confirmer_user_id is not null
      and confirmation.confirmer_user_id <> v_record.target_user_id
      and (v_batch.application_type <> 'club_nomination' or confirmation.confirmer_user_id <> v_batch.created_by_user_id)
  ) then
    raise exception 'HOF_MEMBER_COMPANION_CONFIRMATION_REQUIRED' using errcode = '22023';
  end if;
end;
$$;

revoke all on function private.validate_hall_of_fame_final_approval(uuid, uuid)
  from public, anon, authenticated, service_role;

comment on function private.validate_hall_of_fame_final_approval(uuid, uuid) is
  'Checks transaction-current factual readiness for one approval without re-evaluating historical application eligibility.';

create function public.decide_hall_of_fame_application(
  p_application_batch_id uuid,
  p_expected_batch_version integer,
  p_decisions jsonb,
  p_request_id uuid
)
returns table (
  request_id uuid,
  operation text,
  application_batch_id uuid,
  status text,
  batch_version integer,
  approved_count integer,
  rejected_count integer,
  decisions jsonb,
  finalized_at timestamptz,
  replayed boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_operation text := 'hall_of_fame.application.final_decision';
  v_role text;
  v_batch public.hall_of_fame_application_batches%rowtype;
  v_claim record;
  v_item jsonb;
  v_record_id uuid;
  v_record_fingerprint bytea;
  v_expected_version integer;
  v_decision text;
  v_reason text;
  v_normalized jsonb := '[]'::jsonb;
  v_fingerprint bytea;
  v_active_count integer;
  v_row_count integer;
  v_approved integer := 0;
  v_rejected integer := 0;
  v_final_status text;
  v_new_batch_version integer;
  v_finalized_at timestamptz := pg_catalog.now();
  v_decisions_result jsonb;
  v_result jsonb;
  v_club_id uuid;
  v_constraint_name text;
begin
  perform private.lock_active_hall_of_fame_actor(v_actor);
  if p_application_batch_id is null or p_expected_batch_version is null
     or p_expected_batch_version < 1 or p_request_id is null
     or p_decisions is null or pg_catalog.jsonb_typeof(p_decisions) <> 'array'
     or pg_catalog.jsonb_array_length(p_decisions) = 0 then
    raise exception 'HOF_INVALID_FINAL_DECISION_REQUEST' using errcode = '22023';
  end if;

  for v_item in select value from pg_catalog.jsonb_array_elements(p_decisions) loop
    if pg_catalog.jsonb_typeof(v_item) <> 'object'
       or (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(v_item)) <> 4
       or not v_item ?& array['application_record_id','expected_record_version','decision','rejection_reason']
       or pg_catalog.jsonb_typeof(v_item -> 'application_record_id') <> 'string'
       or pg_catalog.jsonb_typeof(v_item -> 'expected_record_version') <> 'number'
       or pg_catalog.jsonb_typeof(v_item -> 'decision') <> 'string'
       or pg_catalog.jsonb_typeof(v_item -> 'rejection_reason') not in ('string', 'null') then
      raise exception 'HOF_INVALID_FINAL_DECISION_PAYLOAD' using errcode = '22023';
    end if;
    begin
      v_record_id := (v_item ->> 'application_record_id')::uuid;
      if (v_item ->> 'expected_record_version') !~ '^[1-9][0-9]*$' then
        raise exception 'HOF_INVALID_FINAL_DECISION_PAYLOAD'
          using errcode = '22023';
      end if;
      v_expected_version := (v_item ->> 'expected_record_version')::integer;
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        raise exception 'HOF_INVALID_FINAL_DECISION_PAYLOAD'
          using errcode = '22023';
    end;
    v_decision := v_item ->> 'decision';
    v_reason := case
      when v_item -> 'rejection_reason' = 'null'::jsonb then null
      else pg_catalog.btrim(v_item ->> 'rejection_reason')
    end;
    if v_record_id is null or v_expected_version < 1 or v_decision not in ('approve','reject')
       or (v_decision = 'approve' and v_reason is not null)
       or (
         v_decision = 'reject'
         and (
           v_reason is null
           or v_reason = ''
            or pg_catalog.char_length(v_reason) > 2000
         )
       ) then
      raise exception 'HOF_INVALID_FINAL_DECISION_PAYLOAD' using errcode = '22023';
    end if;
    if exists (
      select 1
      from pg_catalog.jsonb_array_elements(v_normalized) as normalized
      where (normalized ->> 'application_record_id')::uuid = v_record_id
    ) then
      raise exception 'HOF_DUPLICATE_DECISION_RECORD' using errcode = '22023';
    end if;
    v_normalized := v_normalized || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'application_record_id', v_record_id, 'expected_record_version', v_expected_version,
      'decision', v_decision, 'rejection_reason', v_reason
    ));
  end loop;
  select coalesce(
      pg_catalog.jsonb_agg(value order by value ->> 'application_record_id'),
      '[]'::jsonb
    )
    into v_normalized
  from pg_catalog.jsonb_array_elements(v_normalized);
  v_fingerprint := extensions.digest(pg_catalog.convert_to(pg_catalog.jsonb_build_object(
    'application_batch_id', p_application_batch_id,
    'expected_batch_version', p_expected_batch_version,
    'decisions', v_normalized
  )::text,'UTF8'),'sha256');

  perform private.lock_hall_of_fame_mutation_request(v_actor, p_request_id);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_application_batch_id::text, 8608));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_application_batch_id::text, 8610));
  select *
    into v_claim
  from private.hall_of_fame_claim_request(
    v_actor, p_request_id, v_operation, p_application_batch_id, null, null, v_fingerprint
  );
  if v_claim.replayed then
    return query select p_request_id, v_claim.result_payload ->> 'operation',
      (v_claim.result_payload ->> 'application_batch_id')::uuid,
      v_claim.result_payload ->> 'status', (v_claim.result_payload ->> 'batch_version')::integer,
      (v_claim.result_payload ->> 'approved_count')::integer,
      (v_claim.result_payload ->> 'rejected_count')::integer,
      v_claim.result_payload -> 'decisions',
      (v_claim.result_payload ->> 'finalized_at')::timestamptz, true;
    return;
  end if;

  perform private.lock_hall_of_fame_authorization_boundary();
  v_role := private.require_hall_of_fame_platform_permission(v_actor, 'hall_of_fame.applications.decide');
  select batch.*
    into v_batch
  from public.hall_of_fame_application_batches as batch
  where batch.id = p_application_batch_id
  for update;
  if not found then
    raise exception 'HOF_APPLICATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_batch.status <> 'under_review' then
    raise exception 'HOF_FINAL_DECISION_STATE_INVALID' using errcode = 'PT409';
  end if;
  if v_batch.version <> p_expected_batch_version then
    raise exception 'HOF_STALE_VERSION' using errcode = 'PT409';
  end if;

  perform record.id from public.hall_of_fame_application_records record
  where record.application_batch_id = p_application_batch_id order by record.id for update;
  if exists (
    select 1
    from public.hall_of_fame_application_records as record
    where record.application_batch_id = p_application_batch_id
      and record.review_status not in ('under_review','withdrawn')
  ) then
    raise exception 'HOF_APPLICATION_RECORD_STATE_MISMATCH' using errcode = 'PT409';
  end if;
  select pg_catalog.count(*)::integer into v_active_count
  from public.hall_of_fame_application_records record
  where record.application_batch_id = p_application_batch_id and record.review_status = 'under_review';
  if v_active_count < 1 or pg_catalog.jsonb_array_length(v_normalized) <> v_active_count then
    raise exception 'HOF_FINAL_DECISION_COVERAGE_MISMATCH' using errcode = '22023';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(v_normalized) as item
    left join public.hall_of_fame_application_records as record
      on record.id = (item ->> 'application_record_id')::uuid
     and record.application_batch_id = p_application_batch_id
     and record.review_status = 'under_review'
    where record.id is null or record.version <> (item ->> 'expected_record_version')::integer
  ) then
    raise exception 'HOF_STALE_RECORD_VERSION' using errcode = 'PT409';
  end if;
  if exists (
    select 1 from public.hall_of_fame_application_records record
    where record.application_batch_id = p_application_batch_id and record.review_status = 'under_review'
      and not exists (select 1 from pg_catalog.jsonb_array_elements(v_normalized) item
        where (item ->> 'application_record_id')::uuid = record.id)
  ) then
    raise exception 'HOF_FINAL_DECISION_COVERAGE_MISMATCH' using errcode = '22023';
  end if;

  for v_record_id, v_record_fingerprint in
    select record.id, record.duplicate_fingerprint
    from pg_catalog.jsonb_array_elements(v_normalized) as item
    join public.hall_of_fame_application_records as record
      on record.id = (item ->> 'application_record_id')::uuid
     and record.application_batch_id = p_application_batch_id
    where item ->> 'decision' = 'approve'
    order by pg_catalog.encode(record.duplicate_fingerprint, 'hex'), record.id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        pg_catalog.encode(v_record_fingerprint, 'hex'),
        8611
      )
    );
    perform private.validate_hall_of_fame_final_approval(
      p_application_batch_id,
      v_record_id
    );
  end loop;

  update public.hall_of_fame_application_records as record
  set review_status = case
        when item.value ->> 'decision' = 'approve' then 'approved'
        else 'rejected'
      end,
      version = record.version + 1,
      updated_at = v_finalized_at
  from pg_catalog.jsonb_array_elements(v_normalized) as item(value)
  where record.id = (item.value ->> 'application_record_id')::uuid
    and record.application_batch_id = p_application_batch_id
    and record.review_status = 'under_review'
    and record.version = (item.value ->> 'expected_record_version')::integer;
  get diagnostics v_row_count = row_count;
  if v_row_count <> v_active_count then
    raise exception 'HOF_FINAL_DECISION_RECORD_UPDATE_FAILED' using errcode = 'PT409';
  end if;

  insert into public.hall_of_fame_records(
    source_application_record_id,target_user_id,record_type_code,played_on,
    course_name_snapshot,course_region_snapshot,course_environment,course_layout_snapshot,
    course_segment_snapshot,hole_number,hole_par,strokes,nominating_club_id,
    fingerprint_version,record_fingerprint,validity_status,publication_status,
    approved_by_user_id,approved_at,version
  )
  select record.id,record.target_user_id,record.record_type_code,snapshot.played_on,
    snapshot.course_name_snapshot,snapshot.course_region_snapshot,snapshot.course_environment,snapshot.course_layout_snapshot,
    record.course_segment_snapshot,record.hole_number,record.hole_par,record.strokes,v_batch.nominating_club_id,
    record.fingerprint_version,record.duplicate_fingerprint,'active','hidden',v_actor,v_finalized_at,1
  from pg_catalog.jsonb_array_elements(v_normalized) as item
  join public.hall_of_fame_application_records as record
    on record.id = (item ->> 'application_record_id')::uuid
   and record.application_batch_id = p_application_batch_id
  join public.hall_of_fame_round_snapshots as snapshot
    on snapshot.id = record.round_snapshot_id
   and snapshot.application_batch_id = p_application_batch_id
  where item ->> 'decision' = 'approve'
  order by record.id;
  get diagnostics v_row_count = row_count;
  select pg_catalog.count(*)::integer
    into v_approved
  from pg_catalog.jsonb_array_elements(v_normalized) as item
  where item ->> 'decision' = 'approve';
  if v_row_count <> v_approved then
    raise exception 'HOF_CANONICAL_RECORD_INSERT_FAILED' using errcode = 'PT409';
  end if;

  insert into public.hall_of_fame_record_history(
    record_id,version,from_validity_status,to_validity_status,
    from_publication_status,to_publication_status,action,reason,actor_user_id,request_id
  ) select canonical.id,1,null,'active',null,'hidden','hall_of_fame.record.approved',null,v_actor,p_request_id
  from pg_catalog.jsonb_array_elements(v_normalized) as item
  join public.hall_of_fame_records as canonical
    on canonical.source_application_record_id = (item ->> 'application_record_id')::uuid
  where item ->> 'decision' = 'approve'
  order by canonical.id;
  get diagnostics v_row_count = row_count;
  if v_row_count <> v_approved then
    raise exception 'HOF_CANONICAL_HISTORY_INSERT_FAILED' using errcode = 'PT409';
  end if;

  select pg_catalog.count(*) filter(where value ->> 'decision'='reject')::integer
    into v_rejected
  from pg_catalog.jsonb_array_elements(v_normalized);
  v_final_status := case when v_approved = v_active_count then 'approved'
    when v_rejected = v_active_count then 'rejected' else 'partially_approved' end;
  update public.hall_of_fame_application_batches batch set
    status=v_final_status,version=batch.version+1,finalized_at=v_finalized_at,updated_at=v_finalized_at
  where batch.id=p_application_batch_id and batch.status='under_review' and batch.version=p_expected_batch_version
  returning batch.version into v_new_batch_version;
  if not found then
    raise exception 'HOF_STALE_VERSION' using errcode='PT409';
  end if;

  insert into public.hall_of_fame_application_history(
    scope,application_batch_id,application_record_id,from_status,to_status,version,
    actor_user_id,actor_membership_id,actor_platform_role,action,reason,request_id
  )
  select 'record',p_application_batch_id,record.id,'under_review',record.review_status,record.version,
    v_actor,null,v_role,v_operation,null,p_request_id
  from pg_catalog.jsonb_array_elements(v_normalized) as item
  join public.hall_of_fame_application_records as record
    on record.id = (item ->> 'application_record_id')::uuid
   and record.application_batch_id = p_application_batch_id
  order by record.id;
  get diagnostics v_row_count = row_count;
  if v_row_count <> v_active_count then
    raise exception 'HOF_APPLICATION_HISTORY_INSERT_FAILED' using errcode = 'PT409';
  end if;
  insert into public.hall_of_fame_application_history(
    scope,application_batch_id,application_record_id,from_status,to_status,version,
    actor_user_id,actor_membership_id,actor_platform_role,action,reason,request_id
  ) values('batch',p_application_batch_id,null,'under_review',v_final_status,v_new_batch_version,
    v_actor,null,v_role,v_operation,null,p_request_id);

  insert into public.hall_of_fame_application_reviews(
    application_batch_id,application_record_id,review_action,reviewer_user_id,
    reviewer_platform_role,recommendation,internal_note,duplicate_suspected,conflict_declared,request_id
  ) select p_application_batch_id,record.id,
    case when record.review_status='approved' then 'final_approved' else 'final_rejected' end,
    v_actor,v_role,case when record.review_status='approved' then 'approve' else 'reject' end,
    null,false,false,p_request_id
  from pg_catalog.jsonb_array_elements(v_normalized) as item
  join public.hall_of_fame_application_records as record
    on record.id = (item ->> 'application_record_id')::uuid
   and record.application_batch_id = p_application_batch_id
  order by record.id;
  get diagnostics v_row_count = row_count;
  if v_row_count <> v_active_count then
    raise exception 'HOF_REVIEW_EVENT_INSERT_FAILED' using errcode = 'PT409';
  end if;

  insert into public.hall_of_fame_application_messages(
    application_batch_id,application_record_id,message_type,body,created_by_user_id,
    created_by_platform_role,request_id,recipient_user_id,reply_to_message_id,request_kind,requested_evidence_type
  ) select p_application_batch_id,record.id,'final_decision_notice',
    case
      when record.review_status='approved' then 'Hall of Fame record review was approved.'
      else item.value ->> 'rejection_reason'
    end,
    v_actor,v_role,p_request_id,v_batch.created_by_user_id,null,null,null
  from pg_catalog.jsonb_array_elements(v_normalized) as item(value)
  join public.hall_of_fame_application_records as record
    on (item.value ->> 'application_record_id')::uuid=record.id
   and record.application_batch_id=p_application_batch_id
  order by record.id;
  get diagnostics v_row_count = row_count;
  if v_row_count <> v_active_count then
    raise exception 'HOF_FINAL_NOTICE_INSERT_FAILED' using errcode = 'PT409';
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'application_record_id',record.id,'status',record.review_status,'record_version',record.version,
    'canonical_record_id',canonical.id
  ) order by record.id),'[]'::jsonb) into v_decisions_result
  from pg_catalog.jsonb_array_elements(v_normalized) as item
  join public.hall_of_fame_application_records as record
    on record.id = (item ->> 'application_record_id')::uuid
   and record.application_batch_id=p_application_batch_id
  left join public.hall_of_fame_records as canonical
    on canonical.source_application_record_id=record.id;

  v_club_id := coalesce(v_batch.nominating_club_id,v_batch.vacancy_context_club_id);
  insert into public.audit_logs(actor_id,actor_type,action,target_type,target_id,club_id,
    before_summary,after_summary,metadata,request_id,outcome)
  values(v_actor,'user',v_operation,'hall_of_fame_application_batch',p_application_batch_id::text,
    case when v_club_id is null then null else v_club_id::text end,
    pg_catalog.jsonb_build_object('status','under_review','version',p_expected_batch_version),
    pg_catalog.jsonb_build_object('status',v_final_status,'version',v_new_batch_version,
      'approved_count',v_approved,'rejected_count',v_rejected),
    pg_catalog.jsonb_build_object('application_batch_id',p_application_batch_id,
      'decision_count',v_active_count,'rejection_reason_count',v_rejected),p_request_id,'success');

  v_result := pg_catalog.jsonb_build_object('operation',v_operation,
    'application_batch_id',p_application_batch_id,'status',v_final_status,
    'batch_version',v_new_batch_version,'approved_count',v_approved,
    'rejected_count',v_rejected,'decisions',v_decisions_result,'finalized_at',v_finalized_at);
  perform private.complete_hall_of_fame_request(v_actor,p_request_id,v_operation,
    p_application_batch_id,null,v_fingerprint,v_result);
  return query select p_request_id,v_operation,p_application_batch_id,v_final_status,
    v_new_batch_version,v_approved,v_rejected,v_decisions_result,v_finalized_at,false;
exception
  when unique_violation then
    get stacked diagnostics v_constraint_name = constraint_name;
    if v_constraint_name in (
      'hall_of_fame_records_source_application_record_id_key',
      'hall_of_fame_records_active_fingerprint_uidx'
    ) then
      raise exception 'HOF_DUPLICATE_RECORD' using errcode = 'PT409';
    else
      raise;
    end if;
end;
$$;

comment on function public.decide_hall_of_fame_application(uuid, integer, jsonb, uuid) is
  'Atomically decides every active record in an under-review HOF batch and creates hidden canonical records only for approved decisions.';

revoke all on function public.decide_hall_of_fame_application(uuid, integer, jsonb, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.decide_hall_of_fame_application(uuid, integer, jsonb, uuid)
  to authenticated;
