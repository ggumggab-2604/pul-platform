-- PUL 8-6-B-3-2B: pre-decision HOF application and nomination participation withdrawal.
-- Final decisions, canonical records, badges, public projection, and post-approval revocation remain deferred.

create function private.enforce_guarded_hall_of_fame_withdrawal_mutation()
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
  v_record uuid;
  v_operation text;
  v_fingerprint text;
  v_remaining_active integer;
begin
  if tg_op = 'DELETE' then
    raise exception 'HOF_DIRECT_DELETE_FORBIDDEN' using errcode = '42501';
  end if;

  begin
    v_actor := nullif(
      pg_catalog.current_setting('pul.hall_of_fame.actor_user_id', true), ''
    )::uuid;
    v_request := nullif(
      pg_catalog.current_setting('pul.hall_of_fame.request_id', true), ''
    )::uuid;
    v_batch := nullif(
      pg_catalog.current_setting('pul.hall_of_fame.application_batch_id', true), ''
    )::uuid;
    v_record := nullif(
      pg_catalog.current_setting('pul.hall_of_fame.application_record_id', true), ''
    )::uuid;
  exception
    when invalid_text_representation then
      raise exception 'HOF_INVALID_MUTATION_CONTEXT' using errcode = '42501';
  end;

  v_operation := nullif(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true), ''
  );
  v_fingerprint := nullif(
    pg_catalog.current_setting('pul.hall_of_fame.payload_fingerprint', true), ''
  );

  if v_actor is null
     or v_request is null
     or v_batch is null
     or v_operation not in (
       'hall_of_fame.application.withdraw',
       'hall_of_fame.nomination.participation.withdraw'
     )
     or v_fingerprint is null
     or auth.uid() is distinct from v_actor then
    raise exception 'HOF_MUTATION_RPC_REQUIRED' using errcode = '42501';
  end if;

  if tg_table_schema = 'private'
     and tg_table_name = 'hall_of_fame_mutation_requests' then
    if tg_op = 'INSERT' then
      if new.actor_user_id <> v_actor
         or new.request_id <> v_request
         or new.operation <> v_operation
         or new.application_batch_id <> v_batch
         or new.application_record_id is distinct from v_record
         or pg_catalog.encode(new.payload_fingerprint, 'hex') <> v_fingerprint
         or new.status <> 'in_progress'
         or new.result_payload is not null
         or new.error_code is not null
         or new.completed_at is not null
         or (
           v_operation = 'hall_of_fame.application.withdraw'
           and (new.target_user_id is not null or v_record is not null)
         )
         or (
           v_operation = 'hall_of_fame.nomination.participation.withdraw'
           and (new.target_user_id <> v_actor or v_record is null)
         ) then
        raise exception 'HOF_LEDGER_CONTEXT_MISMATCH' using errcode = '42501';
      end if;
      return new;
    end if;

    if old.actor_user_id <> v_actor
       or old.request_id <> v_request
       or old.operation <> v_operation
       or old.application_batch_id <> v_batch
       or old.application_record_id is distinct from v_record
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

  if not private.hall_of_fame_mutation_context_is_valid() then
    raise exception 'HOF_MUTATION_RPC_REQUIRED' using errcode = '42501';
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
       or new.conflict_of_interest <> old.conflict_of_interest
       or new.fingerprint_version <> old.fingerprint_version
       or new.duplicate_fingerprint is distinct from old.duplicate_fingerprint
       or new.created_at <> old.created_at
       or old.review_status not in (
         'submitted', 'under_review', 'additional_info_required'
       )
       or new.review_status <> 'withdrawn'
       or new.version <> old.version + 1
       or (
         v_operation = 'hall_of_fame.application.withdraw'
         and (
           v_record is not null
           or new.member_consent_status <> old.member_consent_status
         )
       )
       or (
         v_operation = 'hall_of_fame.nomination.participation.withdraw'
         and (
           old.id <> v_record
           or old.target_user_id <> v_actor
           or old.member_consent_status <> 'granted'
           or new.member_consent_status <> 'withdrawn'
           or not exists (
             select 1
             from public.hall_of_fame_application_consents as consent
             where consent.application_record_id = old.id
               and consent.application_batch_id = old.application_batch_id
               and consent.subject_user_id = v_actor
               and consent.consent_purpose = 'nomination_acceptance'
               and consent.status = 'withdrawn'
               and consent.last_actor_user_id = v_actor
               and consent.last_request_id = v_request
           )
         )
       ) then
      raise exception 'HOF_APPLICATION_RECORD_CONTEXT_MISMATCH'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_table_schema = 'public'
     and tg_table_name = 'hall_of_fame_application_batches' then
    select pg_catalog.count(*)::integer
      into v_remaining_active
    from public.hall_of_fame_application_records as record
    where record.application_batch_id = old.id
      and record.review_status <> 'withdrawn';

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
       or old.status not in (
         'submitted', 'under_review', 'additional_info_required'
       )
       or new.version <> old.version + 1
       or (
         v_operation = 'hall_of_fame.application.withdraw'
         and (
           v_record is not null
           or new.created_by_user_id <> v_actor
           or v_remaining_active <> 0
           or new.status <> 'withdrawn'
           or new.finalized_at is null
         )
       )
       or (
         v_operation = 'hall_of_fame.nomination.participation.withdraw'
         and (
           v_record is null
           or (
             v_remaining_active = 0
             and (new.status <> 'withdrawn' or new.finalized_at is null)
           )
           or (
             v_remaining_active > 0
             and (
               new.status <> old.status
               or new.finalized_at is distinct from old.finalized_at
             )
           )
         )
       ) then
      raise exception 'HOF_APPLICATION_BATCH_CONTEXT_MISMATCH'
        using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'HOF_MUTATION_RPC_REQUIRED' using errcode = '42501';
end;
$$;

revoke all on function private.enforce_guarded_hall_of_fame_withdrawal_mutation()
  from public, anon, authenticated, service_role;

create function private.enforce_guarded_hall_of_fame_withdrawal_consent_mutation()
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
  v_record uuid;
  v_operation text;
begin
  if tg_op <> 'UPDATE' then
    raise exception 'HOF_DIRECT_CONSENT_MUTATION_FORBIDDEN' using errcode = '42501';
  end if;

  begin
    v_actor := nullif(pg_catalog.current_setting('pul.hall_of_fame.actor_user_id', true), '')::uuid;
    v_request := nullif(pg_catalog.current_setting('pul.hall_of_fame.request_id', true), '')::uuid;
    v_batch := nullif(pg_catalog.current_setting('pul.hall_of_fame.application_batch_id', true), '')::uuid;
    v_record := nullif(pg_catalog.current_setting('pul.hall_of_fame.application_record_id', true), '')::uuid;
  exception
    when invalid_text_representation then
      raise exception 'HOF_INVALID_MUTATION_CONTEXT' using errcode = '42501';
  end;
  v_operation := nullif(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '');

  if v_operation <> 'hall_of_fame.nomination.participation.withdraw'
     or v_actor is null
     or v_request is null
     or v_batch is null
     or v_record is null
     or auth.uid() is distinct from v_actor
     or not private.hall_of_fame_mutation_context_is_valid()
     or old.application_batch_id <> v_batch
     or old.application_record_id <> v_record
     or old.subject_user_id <> v_actor
     or old.consent_purpose <> 'nomination_acceptance'
     or old.status <> 'granted'
     or new.id <> old.id
     or new.application_record_id <> old.application_record_id
     or new.application_batch_id <> old.application_batch_id
     or new.subject_user_id <> old.subject_user_id
     or new.consent_purpose <> old.consent_purpose
     or new.policy_version <> old.policy_version
     or new.requested_at is distinct from old.requested_at
     or new.expires_at is distinct from old.expires_at
     or new.granted_at is distinct from old.granted_at
     or new.declined_at is not null
     or new.withdrawn_at is null
     or new.last_actor_user_id <> v_actor
     or new.last_request_id <> v_request
     or new.version <> old.version + 1
     or new.created_at <> old.created_at
     or new.status <> 'withdrawn' then
    raise exception 'HOF_APPLICATION_CONSENT_CONTEXT_MISMATCH'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_guarded_hall_of_fame_withdrawal_consent_mutation()
  from public, anon, authenticated, service_role;

create function private.enforce_hall_of_fame_withdrawal_consent_history_append()
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
  v_record uuid;
begin
  if tg_op <> 'INSERT' then
    raise exception 'HOF_APPEND_ONLY_MUTATION_FORBIDDEN' using errcode = '42501';
  end if;

  begin
    v_actor := nullif(pg_catalog.current_setting('pul.hall_of_fame.actor_user_id', true), '')::uuid;
    v_request := nullif(pg_catalog.current_setting('pul.hall_of_fame.request_id', true), '')::uuid;
    v_batch := nullif(pg_catalog.current_setting('pul.hall_of_fame.application_batch_id', true), '')::uuid;
    v_record := nullif(pg_catalog.current_setting('pul.hall_of_fame.application_record_id', true), '')::uuid;
  exception
    when invalid_text_representation then
      raise exception 'HOF_INVALID_HISTORY_CONTEXT' using errcode = '42501';
  end;

  if nullif(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '')
       <> 'hall_of_fame.nomination.participation.withdraw'
     or v_actor is null
     or v_request is null
     or v_batch is null
     or v_record is null
     or auth.uid() is distinct from v_actor
     or not private.hall_of_fame_mutation_context_is_valid()
     or new.application_batch_id <> v_batch
     or new.application_record_id <> v_record
     or new.subject_user_id <> v_actor
     or new.consent_purpose <> 'nomination_acceptance'
     or new.from_status <> 'granted'
     or new.to_status <> 'withdrawn'
     or new.actor_user_id <> v_actor
     or new.request_id <> v_request
     or not exists (
       select 1
       from public.hall_of_fame_application_consents as consent
       where consent.id = new.application_consent_id
         and consent.application_batch_id = v_batch
         and consent.application_record_id = v_record
         and consent.subject_user_id = v_actor
         and consent.consent_purpose = 'nomination_acceptance'
         and consent.policy_version = new.policy_version
         and consent.status = 'withdrawn'
         and consent.version = new.version
         and consent.requested_at is not distinct from new.requested_at
         and consent.expires_at is not distinct from new.expires_at
         and consent.last_actor_user_id = v_actor
         and consent.last_request_id = v_request
     )
     or not exists (
       select 1
       from public.hall_of_fame_application_consent_history as previous_history
       where previous_history.application_consent_id = new.application_consent_id
         and previous_history.version = new.version - 1
         and previous_history.to_status = 'granted'
     ) then
    raise exception 'HOF_APPLICATION_CONSENT_HISTORY_CONTEXT_MISMATCH'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_hall_of_fame_withdrawal_consent_history_append()
  from public, anon, authenticated, service_role;

create function private.enforce_hall_of_fame_post_submit_history_append()
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
  v_record uuid;
  v_operation text;
  v_current_status text;
  v_current_version integer;
  v_previous_status text;
  v_platform_role text;
  v_expected_membership uuid;
begin
  if tg_op <> 'INSERT' then
    raise exception 'HOF_APPEND_ONLY_MUTATION_FORBIDDEN' using errcode = '42501';
  end if;

  begin
    v_actor := nullif(pg_catalog.current_setting('pul.hall_of_fame.actor_user_id', true), '')::uuid;
    v_request := nullif(pg_catalog.current_setting('pul.hall_of_fame.request_id', true), '')::uuid;
    v_batch := nullif(pg_catalog.current_setting('pul.hall_of_fame.application_batch_id', true), '')::uuid;
    v_record := nullif(pg_catalog.current_setting('pul.hall_of_fame.application_record_id', true), '')::uuid;
  exception
    when invalid_text_representation then
      raise exception 'HOF_INVALID_HISTORY_CONTEXT' using errcode = '42501';
  end;
  v_operation := nullif(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '');

  if v_actor is null
     or v_request is null
     or v_batch is null
     or v_operation not in (
       'hall_of_fame.application.review.start',
       'hall_of_fame.application.additional_info.request',
       'hall_of_fame.application.resubmit',
       'hall_of_fame.application.withdraw',
       'hall_of_fame.nomination.participation.withdraw'
     )
     or auth.uid() is distinct from v_actor
     or not private.hall_of_fame_mutation_context_is_valid()
     or new.actor_user_id <> v_actor
     or new.request_id <> v_request
     or new.application_batch_id <> v_batch
     or new.action <> v_operation
     or new.reason is not null then
    raise exception 'HOF_APPLICATION_HISTORY_CONTEXT_MISMATCH'
      using errcode = '42501';
  end if;

  if new.scope = 'batch' and new.application_record_id is null then
    select batch.status, batch.version
      into v_current_status, v_current_version
    from public.hall_of_fame_application_batches as batch
    where batch.id = v_batch;
  elsif new.scope = 'record' and new.application_record_id is not null then
    select record.review_status, record.version
      into v_current_status, v_current_version
    from public.hall_of_fame_application_records as record
    where record.id = new.application_record_id
      and record.application_batch_id = v_batch;
  else
    raise exception 'HOF_APPLICATION_HISTORY_CONTEXT_MISMATCH'
      using errcode = '42501';
  end if;

  if not found
     or v_current_status <> new.to_status
     or v_current_version <> new.version then
    raise exception 'HOF_APPLICATION_HISTORY_CONTEXT_MISMATCH'
      using errcode = '42501';
  end if;

  select previous_history.to_status
    into v_previous_status
  from public.hall_of_fame_application_history as previous_history
  where previous_history.scope = new.scope
    and previous_history.application_batch_id = new.application_batch_id
    and previous_history.application_record_id
          is not distinct from new.application_record_id
    and previous_history.version < new.version
  order by previous_history.version desc
  limit 1;

  if not found or v_previous_status <> new.from_status then
    raise exception 'HOF_APPLICATION_HISTORY_CHAIN_MISMATCH'
      using errcode = '42501';
  end if;

  if v_operation in (
    'hall_of_fame.application.review.start',
    'hall_of_fame.application.additional_info.request'
  ) then
    select account.platform_role
      into v_platform_role
    from public.user_accounts as account
    where account.id = v_actor
      and account.account_status = 'active'
      and account.platform_role in ('platform_moderator', 'platform_admin');

    if v_platform_role is null
       or new.actor_membership_id is not null
       or new.actor_platform_role <> v_platform_role
       or (
         v_operation = 'hall_of_fame.application.review.start'
         and (new.from_status <> 'submitted' or new.to_status <> 'under_review')
       )
       or (
         v_operation = 'hall_of_fame.application.additional_info.request'
         and (
           new.from_status <> 'under_review'
           or new.to_status <> 'additional_info_required'
         )
       ) then
      raise exception 'HOF_APPLICATION_HISTORY_CONTEXT_MISMATCH'
        using errcode = '42501';
    end if;
  elsif v_operation in (
    'hall_of_fame.application.resubmit',
    'hall_of_fame.application.withdraw'
  ) then
    select batch.created_by_membership_id
      into v_expected_membership
    from public.hall_of_fame_application_batches as batch
    where batch.id = v_batch
      and batch.created_by_user_id = v_actor;

    if not found
       or new.actor_membership_id is distinct from v_expected_membership
       or new.actor_platform_role is not null
       or (
         v_operation = 'hall_of_fame.application.resubmit'
         and (
           new.from_status <> 'additional_info_required'
           or new.to_status <> 'submitted'
         )
       )
       or (
         v_operation = 'hall_of_fame.application.withdraw'
         and (
           new.from_status not in (
             'submitted', 'under_review', 'additional_info_required'
           )
           or new.to_status <> 'withdrawn'
         )
       ) then
      raise exception 'HOF_APPLICATION_HISTORY_CONTEXT_MISMATCH'
        using errcode = '42501';
    end if;
  else
    select record.target_membership_id
      into v_expected_membership
    from public.hall_of_fame_application_records as record
    where record.id = v_record
      and record.application_batch_id = v_batch
      and record.target_user_id = v_actor
      and record.review_status = 'withdrawn';

    if not found
       or new.actor_membership_id is distinct from v_expected_membership
       or new.actor_platform_role is not null
       or new.from_status not in (
         'submitted', 'under_review', 'additional_info_required'
       )
       or new.to_status <> 'withdrawn'
       or (
         new.scope = 'record'
         and new.application_record_id <> v_record
       )
       or (
         new.scope = 'batch'
         and exists (
           select 1
           from public.hall_of_fame_application_records as active_record
           where active_record.application_batch_id = v_batch
             and active_record.review_status <> 'withdrawn'
         )
       ) then
      raise exception 'HOF_APPLICATION_HISTORY_CONTEXT_MISMATCH'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

comment on function private.enforce_hall_of_fame_post_submit_history_append() is
  'Validates post-submit status history while permitting audit-only batch-version gaps from partial nomination withdrawal.';

revoke all on function private.enforce_hall_of_fame_post_submit_history_append()
  from public, anon, authenticated, service_role;

-- Route the two withdrawal operations to exact ledger-bound guards without
-- widening any direct table grant or bypassing the approved specialized guards.
drop trigger hall_of_fame_application_batches_guard_before_mutation
  on public.hall_of_fame_application_batches;
create trigger hall_of_fame_application_batches_guard_before_mutation
before insert or update or delete on public.hall_of_fame_application_batches
for each row when (
  coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '')
    not like 'hall_of_fame.evidence.%'
  and coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '')
    <> 'hall_of_fame.application.submit'
  and coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '')
    not in (
      'hall_of_fame.application.review.start',
      'hall_of_fame.application.review.note',
      'hall_of_fame.application.additional_info.request',
      'hall_of_fame.application.additional_info.respond',
      'hall_of_fame.application.resubmit',
      'hall_of_fame.application.withdraw',
      'hall_of_fame.nomination.participation.withdraw'
    )
) execute function private.reject_hall_of_fame_mutation();
create trigger hall_of_fame_application_batches_withdrawal_guard
before insert or update or delete on public.hall_of_fame_application_batches
for each row when (
  coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '')
    in (
      'hall_of_fame.application.withdraw',
      'hall_of_fame.nomination.participation.withdraw'
    )
) execute function private.enforce_guarded_hall_of_fame_withdrawal_mutation();

drop trigger hall_of_fame_application_records_guard_before_mutation
  on public.hall_of_fame_application_records;
create trigger hall_of_fame_application_records_guard_before_mutation
before insert or update or delete on public.hall_of_fame_application_records
for each row when (
  coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '')
    not like 'hall_of_fame.evidence.%'
  and coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '')
    <> 'hall_of_fame.application.submit'
  and coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '')
    not in (
      'hall_of_fame.application.review.start',
      'hall_of_fame.application.review.note',
      'hall_of_fame.application.additional_info.request',
      'hall_of_fame.application.additional_info.respond',
      'hall_of_fame.application.resubmit',
      'hall_of_fame.application.withdraw',
      'hall_of_fame.nomination.participation.withdraw'
    )
) execute function private.reject_hall_of_fame_mutation();
create trigger hall_of_fame_application_records_withdrawal_guard
before insert or update or delete on public.hall_of_fame_application_records
for each row when (
  coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '')
    in (
      'hall_of_fame.application.withdraw',
      'hall_of_fame.nomination.participation.withdraw'
    )
) execute function private.enforce_guarded_hall_of_fame_withdrawal_mutation();

drop trigger hall_of_fame_mutation_requests_guard_before_mutation
  on private.hall_of_fame_mutation_requests;
create trigger hall_of_fame_mutation_requests_guard_before_mutation
before insert or update or delete on private.hall_of_fame_mutation_requests
for each row when (
  coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '')
    not like 'hall_of_fame.evidence.%'
  and coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '')
    <> 'hall_of_fame.application.submit'
  and coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '')
    not in (
      'hall_of_fame.application.review.start',
      'hall_of_fame.application.review.note',
      'hall_of_fame.application.additional_info.request',
      'hall_of_fame.application.additional_info.respond',
      'hall_of_fame.application.resubmit',
      'hall_of_fame.application.withdraw',
      'hall_of_fame.nomination.participation.withdraw'
    )
) execute function private.reject_hall_of_fame_mutation();
create trigger hall_of_fame_mutation_requests_withdrawal_guard
before insert or update or delete on private.hall_of_fame_mutation_requests
for each row when (
  coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '')
    in (
      'hall_of_fame.application.withdraw',
      'hall_of_fame.nomination.participation.withdraw'
    )
) execute function private.enforce_guarded_hall_of_fame_withdrawal_mutation();

drop trigger hall_of_fame_application_history_guard_before_mutation
  on public.hall_of_fame_application_history;
drop trigger hall_of_fame_application_history_review_guard_before_mutation
  on public.hall_of_fame_application_history;
drop trigger hall_of_fame_application_history_additional_info_guard
  on public.hall_of_fame_application_history;
create trigger hall_of_fame_application_history_guard_before_mutation
before insert or update or delete on public.hall_of_fame_application_history
for each row when (
  coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '')
    not like 'hall_of_fame.evidence.%'
  and coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '')
    <> 'hall_of_fame.application.submit'
  and coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '')
    not in (
      'hall_of_fame.application.review.start',
      'hall_of_fame.application.review.note',
      'hall_of_fame.application.additional_info.request',
      'hall_of_fame.application.additional_info.respond',
      'hall_of_fame.application.resubmit',
      'hall_of_fame.application.withdraw',
      'hall_of_fame.nomination.participation.withdraw'
    )
) execute function private.reject_hall_of_fame_append_only_mutation();
create trigger hall_of_fame_application_history_post_submit_guard
before insert or update or delete on public.hall_of_fame_application_history
for each row when (
  coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '')
    in (
      'hall_of_fame.application.review.start',
      'hall_of_fame.application.additional_info.request',
      'hall_of_fame.application.resubmit',
      'hall_of_fame.application.withdraw',
      'hall_of_fame.nomination.participation.withdraw'
    )
) execute function private.enforce_hall_of_fame_post_submit_history_append();

drop trigger hall_of_fame_application_consents_guard_before_mutation
  on public.hall_of_fame_application_consents;
create trigger hall_of_fame_application_consents_guard_before_mutation
before insert or update or delete on public.hall_of_fame_application_consents
for each row when (
  coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '')
    <> 'hall_of_fame.nomination.participation.withdraw'
) execute function private.guard_hall_of_fame_consent_confirmation_current();
create trigger hall_of_fame_application_consents_withdrawal_guard
before insert or update or delete on public.hall_of_fame_application_consents
for each row when (
  coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '')
    = 'hall_of_fame.nomination.participation.withdraw'
) execute function private.enforce_guarded_hall_of_fame_withdrawal_consent_mutation();

drop trigger hall_of_fame_application_consent_history_guard_before_mutation
  on public.hall_of_fame_application_consent_history;
create trigger hall_of_fame_application_consent_history_guard_before_mutation
before insert or update or delete on public.hall_of_fame_application_consent_history
for each row when (
  coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '')
    <> 'hall_of_fame.nomination.participation.withdraw'
) execute function private.reject_hall_of_fame_append_only_mutation();
create trigger hall_of_fame_application_consent_history_withdrawal_guard
before insert or update or delete on public.hall_of_fame_application_consent_history
for each row when (
  coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '')
    = 'hall_of_fame.nomination.participation.withdraw'
) execute function private.enforce_hall_of_fame_withdrawal_consent_history_append();

create function public.withdraw_hall_of_fame_application(
  p_application_batch_id uuid,
  p_expected_batch_version integer,
  p_request_id uuid
)
returns table (
  request_id uuid,
  operation text,
  application_batch_id uuid,
  status text,
  batch_version integer,
  withdrawn_record_count integer,
  withdrawn_at timestamptz,
  replayed boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_operation text := 'hall_of_fame.application.withdraw';
  v_payload_fingerprint bytea;
  v_claim record;
  v_batch public.hall_of_fame_application_batches%rowtype;
  v_active_record_count integer;
  v_updated_record_count integer;
  v_new_batch_version integer;
  v_withdrawn_at timestamptz := pg_catalog.now();
  v_club_id uuid;
  v_result jsonb;
begin
  perform private.lock_active_hall_of_fame_actor(v_actor_user_id);

  if p_application_batch_id is null
     or p_expected_batch_version is null
     or p_expected_batch_version < 1
     or p_request_id is null then
    raise exception 'HOF_INVALID_WITHDRAWAL_REQUEST' using errcode = '22023';
  end if;

  v_payload_fingerprint := extensions.digest(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'application_batch_id', p_application_batch_id,
        'expected_batch_version', p_expected_batch_version
      )::text,
      'UTF8'
    ),
    'sha256'
  );

  perform private.lock_hall_of_fame_mutation_request(
    v_actor_user_id,
    p_request_id
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_application_batch_id::text, 8608)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_application_batch_id::text, 8610)
  );

  select *
    into v_claim
  from private.hall_of_fame_claim_request(
    v_actor_user_id,
    p_request_id,
    v_operation,
    p_application_batch_id,
    null,
    null,
    v_payload_fingerprint
  );

  if v_claim.replayed then
    return query select
      p_request_id,
      v_claim.result_payload ->> 'operation',
      (v_claim.result_payload ->> 'application_batch_id')::uuid,
      v_claim.result_payload ->> 'status',
      (v_claim.result_payload ->> 'batch_version')::integer,
      (v_claim.result_payload ->> 'withdrawn_record_count')::integer,
      (v_claim.result_payload ->> 'withdrawn_at')::timestamptz,
      true;
    return;
  end if;

  perform private.lock_hall_of_fame_authorization_boundary();

  select batch.*
    into v_batch
  from public.hall_of_fame_application_batches as batch
  where batch.id = p_application_batch_id
  for update;

  if not found then
    raise exception 'HOF_APPLICATION_NOT_FOUND';
  end if;
  if v_batch.created_by_user_id <> v_actor_user_id then
    raise exception 'HOF_APPLICATION_WITHDRAWAL_NOT_AUTHORIZED'
      using errcode = '42501';
  end if;
  if v_batch.status not in (
    'submitted', 'under_review', 'additional_info_required'
  ) then
    raise exception 'HOF_APPLICATION_WITHDRAWAL_NOT_ALLOWED'
      using errcode = 'PT409';
  end if;
  if v_batch.version <> p_expected_batch_version then
    raise exception 'HOF_STALE_VERSION' using errcode = 'PT409';
  end if;

  perform record.id
  from public.hall_of_fame_application_records as record
  where record.application_batch_id = p_application_batch_id
  order by record.id
  for update;

  if exists (
    select 1
    from public.hall_of_fame_application_records as record
    where record.application_batch_id = p_application_batch_id
      and record.review_status not in (v_batch.status, 'withdrawn')
  ) then
    raise exception 'HOF_APPLICATION_RECORD_STATE_MISMATCH'
      using errcode = 'PT409';
  end if;

  select pg_catalog.count(*)::integer
    into v_active_record_count
  from public.hall_of_fame_application_records as record
  where record.application_batch_id = p_application_batch_id
    and record.review_status <> 'withdrawn';

  if v_active_record_count < 1 then
    raise exception 'HOF_ACTIVE_APPLICATION_RECORD_REQUIRED'
      using errcode = 'PT409';
  end if;

  update public.hall_of_fame_application_records as record
  set
    review_status = 'withdrawn',
    version = record.version + 1,
    updated_at = v_withdrawn_at
  where record.application_batch_id = p_application_batch_id
    and record.review_status = v_batch.status;

  get diagnostics v_updated_record_count = row_count;
  if v_updated_record_count <> v_active_record_count then
    raise exception 'HOF_WITHDRAWAL_RECORD_COUNT_MISMATCH'
      using errcode = 'PT409';
  end if;

  update public.hall_of_fame_application_batches as batch
  set
    status = 'withdrawn',
    version = batch.version + 1,
    finalized_at = v_withdrawn_at,
    updated_at = v_withdrawn_at
  where batch.id = p_application_batch_id
    and batch.status = v_batch.status
    and batch.version = p_expected_batch_version
  returning batch.version into v_new_batch_version;

  if not found then
    raise exception 'HOF_STALE_VERSION' using errcode = 'PT409';
  end if;

  insert into public.hall_of_fame_application_history (
    scope, application_batch_id, application_record_id,
    from_status, to_status, version, actor_user_id,
    actor_membership_id, actor_platform_role, action, request_id
  ) values (
    'batch', p_application_batch_id, null,
    v_batch.status, 'withdrawn', v_new_batch_version,
    v_actor_user_id, v_batch.created_by_membership_id, null,
    v_operation, p_request_id
  );

  insert into public.hall_of_fame_application_history (
    scope, application_batch_id, application_record_id,
    from_status, to_status, version, actor_user_id,
    actor_membership_id, actor_platform_role, action, request_id
  )
  select
    'record', record.application_batch_id, record.id,
    v_batch.status, 'withdrawn', record.version,
    v_actor_user_id, v_batch.created_by_membership_id, null,
    v_operation, p_request_id
  from public.hall_of_fame_application_records as record
  where record.application_batch_id = p_application_batch_id
    and record.review_status = 'withdrawn'
    and record.updated_at = v_withdrawn_at
  order by record.id;

  v_club_id := coalesce(
    v_batch.nominating_club_id,
    v_batch.vacancy_context_club_id
  );
  insert into public.audit_logs (
    actor_id, actor_type, action, target_type, target_id, club_id,
    before_summary, after_summary, metadata, request_id, outcome
  ) values (
    v_actor_user_id,
    'user',
    v_operation,
    'hall_of_fame_application_batch',
    p_application_batch_id::text,
    case when v_club_id is null then null else v_club_id::text end,
    pg_catalog.jsonb_build_object(
      'status', v_batch.status,
      'version', p_expected_batch_version
    ),
    pg_catalog.jsonb_build_object(
      'status', 'withdrawn',
      'version', v_new_batch_version,
      'withdrawn_record_count', v_updated_record_count
    ),
    pg_catalog.jsonb_build_object(
      'application_batch_id', p_application_batch_id,
      'application_type', v_batch.application_type
    ),
    p_request_id,
    'success'
  );

  v_result := pg_catalog.jsonb_build_object(
    'operation', v_operation,
    'application_batch_id', p_application_batch_id,
    'status', 'withdrawn',
    'batch_version', v_new_batch_version,
    'withdrawn_record_count', v_updated_record_count,
    'withdrawn_at', v_withdrawn_at
  );

  perform private.complete_hall_of_fame_request(
    v_actor_user_id,
    p_request_id,
    v_operation,
    p_application_batch_id,
    null,
    v_payload_fingerprint,
    v_result
  );

  return query select
    p_request_id,
    v_operation,
    p_application_batch_id,
    'withdrawn'::text,
    v_new_batch_version,
    v_updated_record_count,
    v_withdrawn_at,
    false;
end;
$$;

comment on function public.withdraw_hall_of_fame_application(uuid, integer, uuid) is
  'Creator-only, pre-final whole HOF application withdrawal with immutable Evidence, messages, reviews, consents, and history.';

revoke all on function public.withdraw_hall_of_fame_application(uuid, integer, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.withdraw_hall_of_fame_application(uuid, integer, uuid)
  to authenticated;

create function public.withdraw_hall_of_fame_nomination_participation(
  p_application_batch_id uuid,
  p_application_record_id uuid,
  p_expected_batch_version integer,
  p_expected_record_version integer,
  p_request_id uuid
)
returns table (
  request_id uuid,
  operation text,
  application_batch_id uuid,
  application_record_id uuid,
  batch_status text,
  batch_version integer,
  record_status text,
  record_version integer,
  consent_status text,
  consent_version integer,
  remaining_active_record_count integer,
  withdrawn_at timestamptz,
  replayed boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_operation text := 'hall_of_fame.nomination.participation.withdraw';
  v_payload_fingerprint bytea;
  v_claim record;
  v_batch public.hall_of_fame_application_batches%rowtype;
  v_record public.hall_of_fame_application_records%rowtype;
  v_consent public.hall_of_fame_application_consents%rowtype;
  v_new_batch_status text;
  v_new_batch_version integer;
  v_new_record_version integer;
  v_remaining_active integer;
  v_withdrawn_at timestamptz := pg_catalog.now();
  v_result jsonb;
begin
  perform private.lock_active_hall_of_fame_actor(v_actor_user_id);

  if p_application_batch_id is null
     or p_application_record_id is null
     or p_expected_batch_version is null
     or p_expected_batch_version < 1
     or p_expected_record_version is null
     or p_expected_record_version < 1
     or p_request_id is null then
    raise exception 'HOF_INVALID_NOMINATION_WITHDRAWAL_REQUEST'
      using errcode = '22023';
  end if;

  v_payload_fingerprint := extensions.digest(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'application_batch_id', p_application_batch_id,
        'application_record_id', p_application_record_id,
        'expected_batch_version', p_expected_batch_version,
        'expected_record_version', p_expected_record_version
      )::text,
      'UTF8'
    ),
    'sha256'
  );

  perform private.lock_hall_of_fame_mutation_request(
    v_actor_user_id,
    p_request_id
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_application_batch_id::text, 8608)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_application_batch_id::text, 8610)
  );

  select *
    into v_claim
  from private.hall_of_fame_claim_request(
    v_actor_user_id,
    p_request_id,
    v_operation,
    p_application_batch_id,
    p_application_record_id,
    v_actor_user_id,
    v_payload_fingerprint
  );

  if v_claim.replayed then
    return query select
      p_request_id,
      v_claim.result_payload ->> 'operation',
      (v_claim.result_payload ->> 'application_batch_id')::uuid,
      (v_claim.result_payload ->> 'application_record_id')::uuid,
      v_claim.result_payload ->> 'batch_status',
      (v_claim.result_payload ->> 'batch_version')::integer,
      v_claim.result_payload ->> 'record_status',
      (v_claim.result_payload ->> 'record_version')::integer,
      v_claim.result_payload ->> 'consent_status',
      (v_claim.result_payload ->> 'consent_version')::integer,
      (v_claim.result_payload ->> 'remaining_active_record_count')::integer,
      (v_claim.result_payload ->> 'withdrawn_at')::timestamptz,
      true;
    return;
  end if;

  perform private.lock_hall_of_fame_authorization_boundary();

  select batch.*
    into v_batch
  from public.hall_of_fame_application_batches as batch
  where batch.id = p_application_batch_id
  for update;

  if not found then
    raise exception 'HOF_APPLICATION_NOT_FOUND';
  end if;
  if v_batch.application_type <> 'club_nomination' then
    raise exception 'HOF_NOMINATION_WITHDRAWAL_NOT_ALLOWED'
      using errcode = 'PT409';
  end if;
  if v_batch.status not in (
    'submitted', 'under_review', 'additional_info_required'
  ) then
    raise exception 'HOF_NOMINATION_WITHDRAWAL_NOT_ALLOWED'
      using errcode = 'PT409';
  end if;
  if v_batch.version <> p_expected_batch_version then
    raise exception 'HOF_STALE_VERSION' using errcode = 'PT409';
  end if;

  select record.*
    into v_record
  from public.hall_of_fame_application_records as record
  where record.id = p_application_record_id
    and record.application_batch_id = p_application_batch_id
  for update;

  if not found then
    raise exception 'HOF_APPLICATION_RECORD_NOT_FOUND';
  end if;
  if v_record.target_user_id <> v_actor_user_id then
    raise exception 'HOF_NOMINATION_WITHDRAWAL_NOT_AUTHORIZED'
      using errcode = '42501';
  end if;
  if v_record.review_status <> v_batch.status
     or v_record.review_status not in (
       'submitted', 'under_review', 'additional_info_required'
     ) then
    raise exception 'HOF_NOMINATION_WITHDRAWAL_NOT_ALLOWED'
      using errcode = 'PT409';
  end if;
  if v_record.version <> p_expected_record_version then
    raise exception 'HOF_STALE_RECORD_VERSION' using errcode = 'PT409';
  end if;
  if v_record.member_consent_status <> 'granted' then
    raise exception 'HOF_NOMINATION_ACCEPTANCE_NOT_ACTIVE'
      using errcode = 'PT409';
  end if;

  select consent.*
    into v_consent
  from public.hall_of_fame_application_consents as consent
  where consent.application_record_id = p_application_record_id
    and consent.application_batch_id = p_application_batch_id
    and consent.subject_user_id = v_actor_user_id
    and consent.consent_purpose = 'nomination_acceptance'
  for update;

  if not found or v_consent.status <> 'granted' then
    raise exception 'HOF_NOMINATION_ACCEPTANCE_NOT_ACTIVE'
      using errcode = 'PT409';
  end if;

  update public.hall_of_fame_application_consents as consent
  set
    status = 'withdrawn',
    granted_at = consent.granted_at,
    declined_at = null,
    withdrawn_at = v_withdrawn_at,
    last_actor_user_id = v_actor_user_id,
    last_request_id = p_request_id,
    version = consent.version + 1
  where consent.id = v_consent.id
    and consent.status = 'granted'
    and consent.version = v_consent.version
  returning consent.* into v_consent;

  if not found then
    raise exception 'HOF_STALE_CONSENT_VERSION' using errcode = 'PT409';
  end if;

  insert into public.hall_of_fame_application_consent_history (
    application_consent_id, application_record_id, application_batch_id,
    subject_user_id, consent_purpose, policy_version,
    from_status, to_status, version, actor_user_id, request_id,
    requested_at, expires_at
  ) values (
    v_consent.id, p_application_record_id, p_application_batch_id,
    v_actor_user_id, 'nomination_acceptance', v_consent.policy_version,
    'granted', 'withdrawn', v_consent.version, v_actor_user_id, p_request_id,
    v_consent.requested_at, v_consent.expires_at
  );

  update public.hall_of_fame_application_records as record
  set
    member_consent_status = 'withdrawn',
    review_status = 'withdrawn',
    version = record.version + 1,
    updated_at = v_withdrawn_at
  where record.id = p_application_record_id
    and record.application_batch_id = p_application_batch_id
    and record.target_user_id = v_actor_user_id
    and record.review_status = v_batch.status
    and record.version = p_expected_record_version
  returning record.version into v_new_record_version;

  if not found then
    raise exception 'HOF_STALE_RECORD_VERSION' using errcode = 'PT409';
  end if;

  select pg_catalog.count(*)::integer
    into v_remaining_active
  from public.hall_of_fame_application_records as record
  where record.application_batch_id = p_application_batch_id
    and record.review_status <> 'withdrawn';

  v_new_batch_status := case
    when v_remaining_active = 0 then 'withdrawn'
    else v_batch.status
  end;

  update public.hall_of_fame_application_batches as batch
  set
    status = v_new_batch_status,
    version = batch.version + 1,
    finalized_at = case
      when v_remaining_active = 0 then v_withdrawn_at
      else batch.finalized_at
    end,
    updated_at = v_withdrawn_at
  where batch.id = p_application_batch_id
    and batch.status = v_batch.status
    and batch.version = p_expected_batch_version
  returning batch.version into v_new_batch_version;

  if not found then
    raise exception 'HOF_STALE_VERSION' using errcode = 'PT409';
  end if;

  insert into public.hall_of_fame_application_history (
    scope, application_batch_id, application_record_id,
    from_status, to_status, version, actor_user_id,
    actor_membership_id, actor_platform_role, action, request_id
  ) values (
    'record', p_application_batch_id, p_application_record_id,
    v_batch.status, 'withdrawn', v_new_record_version,
    v_actor_user_id, v_record.target_membership_id, null,
    v_operation, p_request_id
  );

  if v_remaining_active = 0 then
    insert into public.hall_of_fame_application_history (
      scope, application_batch_id, application_record_id,
      from_status, to_status, version, actor_user_id,
      actor_membership_id, actor_platform_role, action, request_id
    ) values (
      'batch', p_application_batch_id, null,
      v_batch.status, 'withdrawn', v_new_batch_version,
      v_actor_user_id, v_record.target_membership_id, null,
      v_operation, p_request_id
    );
  end if;

  insert into public.audit_logs (
    actor_id, actor_type, action, target_type, target_id, club_id,
    before_summary, after_summary, metadata, request_id, outcome
  ) values (
    v_actor_user_id,
    'user',
    v_operation,
    'hall_of_fame_application_record',
    p_application_record_id::text,
    v_batch.nominating_club_id::text,
    pg_catalog.jsonb_build_object(
      'batch_status', v_batch.status,
      'batch_version', p_expected_batch_version,
      'record_status', v_record.review_status,
      'record_version', p_expected_record_version,
      'nomination_acceptance', 'granted'
    ),
    pg_catalog.jsonb_build_object(
      'batch_status', v_new_batch_status,
      'batch_version', v_new_batch_version,
      'record_status', 'withdrawn',
      'record_version', v_new_record_version,
      'nomination_acceptance', 'withdrawn',
      'remaining_active_record_count', v_remaining_active
    ),
    pg_catalog.jsonb_build_object(
      'application_batch_id', p_application_batch_id,
      'application_record_id', p_application_record_id,
      'application_type', 'club_nomination'
    ),
    p_request_id,
    'success'
  );

  v_result := pg_catalog.jsonb_build_object(
    'operation', v_operation,
    'application_batch_id', p_application_batch_id,
    'application_record_id', p_application_record_id,
    'batch_status', v_new_batch_status,
    'batch_version', v_new_batch_version,
    'record_status', 'withdrawn',
    'record_version', v_new_record_version,
    'consent_status', 'withdrawn',
    'consent_version', v_consent.version,
    'remaining_active_record_count', v_remaining_active,
    'withdrawn_at', v_withdrawn_at
  );

  perform private.complete_hall_of_fame_request(
    v_actor_user_id,
    p_request_id,
    v_operation,
    p_application_batch_id,
    p_application_record_id,
    v_payload_fingerprint,
    v_result
  );

  return query select
    p_request_id,
    v_operation,
    p_application_batch_id,
    p_application_record_id,
    v_new_batch_status,
    v_new_batch_version,
    'withdrawn'::text,
    v_new_record_version,
    'withdrawn'::text,
    v_consent.version,
    v_remaining_active,
    v_withdrawn_at,
    false;
end;
$$;

comment on function public.withdraw_hall_of_fame_nomination_participation(
  uuid, uuid, integer, integer, uuid
) is
  'Exact-target, pre-final nomination participation withdrawal with historical acceptance preservation and partial/all-withdrawn aggregation.';

revoke all on function public.withdraw_hall_of_fame_nomination_participation(
  uuid, uuid, integer, integer, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.withdraw_hall_of_fame_nomination_participation(
  uuid, uuid, integer, integer, uuid
) to authenticated;

-- Preserve the approved B-2A/B-3-2A readiness contract while excluding only
-- unresolved Evidence scoped to an already-withdrawn record. Batch-scoped
-- unresolved Evidence remains a blocker for every active record.
create or replace function private.validate_hall_of_fame_application_readiness(
  p_actor_user_id uuid,
  p_application_batch_id uuid,
  p_required_status text
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_batch public.hall_of_fame_application_batches%rowtype;
  v_active_membership_count bigint := 0;
  v_suspended_membership_count bigint := 0;
  v_valid_admin_club_count bigint := 0;
  v_record_count integer := 0;
begin
  if p_required_status not in ('draft', 'additional_info_required') then
    raise exception 'HOF_INVALID_READINESS_STATE' using errcode = '22023';
  end if;

  select batch.* into v_batch
  from public.hall_of_fame_application_batches as batch
  where batch.id = p_application_batch_id;
  if not found then
    raise exception 'HOF_APPLICATION_NOT_FOUND';
  end if;
  if v_batch.status <> p_required_status then
    raise exception 'HOF_APPLICATION_STATE_INVALID' using errcode = 'PT409';
  end if;

  select
    pg_catalog.count(*) filter (
      where membership.membership_status = 'active'
        and club.club_status = 'active'
    ),
    pg_catalog.count(*) filter (
      where membership.membership_status = 'suspended'
        and club.club_status = 'active'
    )
  into v_active_membership_count, v_suspended_membership_count
  from public.club_memberships as membership
  join public.clubs as club on club.id = membership.club_id
  where membership.user_id = p_actor_user_id;

  select pg_catalog.count(*) into v_valid_admin_club_count
  from public.club_memberships as membership
  join public.clubs as club
    on club.id = membership.club_id and club.club_status = 'active'
  where membership.user_id = p_actor_user_id
    and membership.membership_status = 'active'
    and private.count_active_club_admins(club.id) > 0;

  if v_batch.application_type = 'direct_application' then
    if v_batch.created_by_user_id <> p_actor_user_id
       or v_active_membership_count <> 0
       or v_suspended_membership_count <> 0 then
      raise exception 'HOF_ELIGIBILITY_CHANGED' using errcode = '42501';
    end if;
  elsif v_batch.application_type = 'club_admin_vacancy_direct_application' then
    if v_batch.created_by_user_id <> p_actor_user_id
       or v_active_membership_count = 0
       or v_valid_admin_club_count <> 0
       or private.count_active_club_admins(v_batch.vacancy_context_club_id) <> 0
       or not exists (
         select 1
         from public.club_memberships as membership
         join public.clubs as club
           on club.id = membership.club_id and club.club_status = 'active'
         where membership.id = v_batch.created_by_membership_id
           and membership.user_id = p_actor_user_id
           and membership.club_id = v_batch.vacancy_context_club_id
           and membership.membership_status = 'active'
       ) then
      raise exception 'HOF_ELIGIBILITY_CHANGED' using errcode = '42501';
    end if;
  elsif v_batch.application_type = 'club_nomination' then
    if v_batch.created_by_user_id <> p_actor_user_id
       or not private.club_user_is_active_admin(
         p_actor_user_id, v_batch.nominating_club_id
       )
       or not private.club_user_has_permission(
         p_actor_user_id,
         v_batch.nominating_club_id,
         'club.achievement_applications.manage'
       ) then
      raise exception 'HOF_ELIGIBILITY_CHANGED' using errcode = '42501';
    end if;
  else
    raise exception 'HOF_INVALID_APPLICATION_CONTEXT' using errcode = '22023';
  end if;

  perform snapshot.id
  from public.hall_of_fame_round_snapshots as snapshot
  where snapshot.application_batch_id = p_application_batch_id
  for share;
  if not found then
    raise exception 'HOF_ROUND_SNAPSHOT_REQUIRED' using errcode = '22023';
  end if;

  perform record.id
  from public.hall_of_fame_application_records as record
  where record.application_batch_id = p_application_batch_id
  order by record.id
  for update;

  if exists (
    select 1
    from public.hall_of_fame_application_records as record
    where record.application_batch_id = p_application_batch_id
      and record.review_status not in (p_required_status, 'withdrawn')
  ) then
    raise exception 'HOF_APPLICATION_RECORD_NOT_EDITABLE' using errcode = 'PT409';
  end if;

  select pg_catalog.count(*)::integer into v_record_count
  from public.hall_of_fame_application_records as record
  where record.application_batch_id = p_application_batch_id
    and record.review_status = p_required_status;
  if v_record_count = 0 then
    raise exception 'HOF_ACTIVE_APPLICATION_RECORD_REQUIRED' using errcode = '22023';
  end if;

  perform private.lock_hall_of_fame_readiness_accounts(
    p_application_batch_id,
    p_required_status
  );

  if exists (
    select 1
    from public.hall_of_fame_application_records as record
    left join public.hall_of_fame_record_type_definitions as definition
      on definition.code = record.record_type_code
    where record.application_batch_id = p_application_batch_id
      and record.review_status = p_required_status
      and (
        definition.code is null
        or not definition.is_active
        or record.duplicate_fingerprint is null
        or pg_catalog.octet_length(record.duplicate_fingerprint) <> 32
        or not (
          (
            definition.qualification_kind = 'single_hole_score'
            and record.strokes = definition.qualification_value
          )
          or (
            definition.qualification_kind = 'relative_to_par'
            and record.hole_par is not null
            and record.strokes is not null
            and record.hole_par - record.strokes >= definition.qualification_value
          )
        )
      )
  ) then
    raise exception 'HOF_RECORD_SUBMISSION_REQUIREMENTS_NOT_MET'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.hall_of_fame_application_records as record
    left join public.user_accounts as account
      on account.id = record.target_user_id
     and account.account_status = 'active'
    where record.application_batch_id = p_application_batch_id
      and record.review_status = p_required_status
      and account.id is null
  ) then
    raise exception 'HOF_TARGET_NOT_ACTIVE_MEMBER' using errcode = '42501';
  end if;

  if v_batch.application_type = 'direct_application' and exists (
    select 1
    from public.hall_of_fame_application_records as record
    where record.application_batch_id = p_application_batch_id
      and record.review_status = p_required_status
      and (
        record.target_user_id <> p_actor_user_id
        or record.target_membership_id is not null
      )
  ) then
    raise exception 'HOF_ELIGIBILITY_CHANGED' using errcode = '42501';
  end if;

  if v_batch.application_type = 'club_admin_vacancy_direct_application'
     and exists (
       select 1
       from public.hall_of_fame_application_records as record
       left join public.club_memberships as membership
         on membership.id = record.target_membership_id
        and membership.user_id = record.target_user_id
        and membership.club_id = v_batch.vacancy_context_club_id
        and membership.membership_status = 'active'
       where record.application_batch_id = p_application_batch_id
         and record.review_status = p_required_status
         and (
           record.target_user_id <> p_actor_user_id
           or record.target_membership_id
                is distinct from v_batch.created_by_membership_id
           or membership.id is null
         )
     ) then
    raise exception 'HOF_ELIGIBILITY_CHANGED' using errcode = '42501';
  end if;

  if v_batch.application_type = 'club_nomination' and exists (
    select 1
    from public.hall_of_fame_application_records as record
    where record.application_batch_id = p_application_batch_id
      and record.review_status = p_required_status
      and record.target_user_id = p_actor_user_id
  ) then
    raise exception 'HOF_NOMINATION_SELF_TARGET_NOT_ALLOWED'
      using errcode = '22023';
  end if;

  if v_batch.application_type = 'club_nomination' and exists (
    select 1
    from public.hall_of_fame_application_records as record
    left join public.club_memberships as membership
      on membership.id = record.target_membership_id
     and membership.user_id = record.target_user_id
     and membership.club_id = v_batch.nominating_club_id
     and membership.membership_status = 'active'
    where record.application_batch_id = p_application_batch_id
      and record.review_status = p_required_status
      and membership.id is null
  ) then
    raise exception 'HOF_ELIGIBILITY_CHANGED' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.hall_of_fame_application_records as record
    join public.hall_of_fame_application_records as existing
      on existing.id <> record.id
     and existing.duplicate_fingerprint = record.duplicate_fingerprint
     and existing.fingerprint_version = record.fingerprint_version
     and existing.review_status in (
       'submitted', 'under_review', 'additional_info_required', 'approved'
     )
    where record.application_batch_id = p_application_batch_id
      and record.review_status = p_required_status
  ) then
    raise exception 'HOF_DUPLICATE_RECORD' using errcode = 'PT409';
  end if;

  perform consent.id
  from public.hall_of_fame_application_consents as consent
  join public.hall_of_fame_application_records as record
    on record.id = consent.application_record_id
   and record.application_batch_id = consent.application_batch_id
  where record.application_batch_id = p_application_batch_id
    and record.review_status = p_required_status
  order by consent.application_record_id, consent.consent_purpose
  for share of consent;

  if exists (
    select 1
    from public.hall_of_fame_application_records as record
    cross join lateral (
      select purpose.consent_purpose
      from (
        values
          ('application_processing'::text),
          ('evidence_review'::text),
          ('nomination_acceptance'::text)
      ) as purpose(consent_purpose)
      where purpose.consent_purpose <> 'nomination_acceptance'
         or v_batch.application_type = 'club_nomination'
    ) as required
    where record.application_batch_id = p_application_batch_id
      and record.review_status = p_required_status
      and not exists (
        select 1
        from public.hall_of_fame_application_consents as consent
        where consent.application_record_id = record.id
          and consent.application_batch_id = p_application_batch_id
          and consent.subject_user_id = record.target_user_id
          and consent.consent_purpose = required.consent_purpose
          and consent.status = 'granted'
          and consent.policy_version = pg_catalog.btrim(consent.policy_version)
          and consent.policy_version <> ''
          and (
            consent.consent_purpose <> 'nomination_acceptance'
            or consent.expires_at > pg_catalog.now()
          )
      )
  ) then
    raise exception 'HOF_REQUIRED_APPLICATION_CONSENT_MISSING'
      using errcode = '22023';
  end if;

  perform publication.application_record_id
  from public.hall_of_fame_publication_consents as publication
  join public.hall_of_fame_application_records as record
    on record.id = publication.application_record_id
  where record.application_batch_id = p_application_batch_id
    and record.review_status = p_required_status
  order by publication.application_record_id
  for share of publication;

  if exists (
    select 1
    from public.hall_of_fame_application_records as record
    where record.application_batch_id = p_application_batch_id
      and record.review_status = p_required_status
      and not exists (
        select 1
        from public.hall_of_fame_publication_consents as publication
        where publication.application_record_id = record.id
          and publication.target_user_id = record.target_user_id
          and publication.status = 'granted'
          and publication.policy_version is not null
          and publication.policy_version = pg_catalog.btrim(publication.policy_version)
          and publication.masked_display_name_consent
          and publication.record_date_consent
          and publication.course_detail_consent
      )
  ) then
    raise exception 'HOF_PUBLICATION_CONSENT_REQUIRED'
      using errcode = '22023';
  end if;

  perform confirmation.id
  from public.hall_of_fame_record_confirmations as confirmation
  join public.hall_of_fame_application_records as record
    on record.id = confirmation.application_record_id
  where record.application_batch_id = p_application_batch_id
    and record.review_status = p_required_status
  order by confirmation.application_record_id, confirmation.id
  for share of confirmation;

  if exists (
    select 1
    from public.hall_of_fame_application_records as record
    where record.application_batch_id = p_application_batch_id
      and record.review_status = p_required_status
      and not exists (
        select 1
        from public.hall_of_fame_record_confirmations as confirmation
        join public.user_accounts as confirmer
          on confirmer.id = confirmation.confirmer_user_id
         and confirmer.account_status = 'active'
        where confirmation.application_record_id = record.id
          and confirmation.confirmation_role = 'round_companion'
          and confirmation.status = 'confirmed'
          and confirmation.confirmer_user_id <> record.target_user_id
          and (
            v_batch.application_type <> 'club_nomination'
            or confirmation.confirmer_user_id <> v_batch.created_by_user_id
          )
      )
  ) then
    raise exception 'HOF_MEMBER_COMPANION_CONFIRMATION_REQUIRED'
      using errcode = '22023';
  end if;

  perform evidence.id
  from public.hall_of_fame_evidence_files as evidence
  where evidence.application_batch_id = p_application_batch_id
  order by evidence.application_record_id nulls first, evidence.id
  for share;

  if exists (
    select 1
    from public.hall_of_fame_evidence_files as evidence
    where evidence.application_batch_id = p_application_batch_id
      and evidence.status in ('pending_upload', 'uploaded_unverified')
      and (
        evidence.application_record_id is null
        or exists (
          select 1
          from public.hall_of_fame_application_records as evidence_record
          where evidence_record.id = evidence.application_record_id
            and evidence_record.application_batch_id = evidence.application_batch_id
            and evidence_record.review_status <> 'withdrawn'
        )
      )
  ) then
    raise exception 'HOF_UNRESOLVED_EVIDENCE' using errcode = 'PT409';
  end if;

  if exists (
    select 1
    from public.hall_of_fame_application_records as record
    where record.application_batch_id = p_application_batch_id
      and record.review_status = p_required_status
      and not exists (
        select 1
        from public.hall_of_fame_evidence_files as evidence
        where evidence.application_batch_id = p_application_batch_id
          and evidence.application_record_id = record.id
          and evidence.evidence_type = 'scorecard'
          and evidence.status = 'available'
          and evidence.finalized_at is not null
          and evidence.byte_size between 1 and 10485760
          and evidence.declared_byte_size = evidence.byte_size
          and evidence.mime_type in (
            'image/jpeg', 'image/png', 'image/webp', 'application/pdf'
          )
          and evidence.declared_mime_type = evidence.mime_type
          and pg_catalog.octet_length(evidence.sha256) = 32
          and evidence.deleted_at is null
          and evidence.storage_deleted_at is null
          and evidence.replaced_by_evidence_id is null
      )
  ) then
    raise exception 'HOF_SCORECARD_EVIDENCE_REQUIRED' using errcode = '22023';
  end if;

  return v_record_count;
end;
$$;

comment on function private.validate_hall_of_fame_application_readiness(
  uuid, uuid, text
) is
  'Validates draft-submit or AIR-resubmit readiness while excluding only unresolved Evidence scoped to withdrawn records.';

revoke all on function private.validate_hall_of_fame_application_readiness(
  uuid, uuid, text
) from public, anon, authenticated, service_role;
