-- PUL 8-6-B-3-2A: applicant-facing additional-information requests,
-- recipient responses, request-linked supplemental evidence, and resubmission.
-- Withdrawal, final decisions, later-stage publication features, UI, notifications,
-- and structured record correction remain deferred.

alter table public.hall_of_fame_application_messages
  add column recipient_user_id uuid
    references public.user_accounts (id) on delete restrict,
  add column reply_to_message_id uuid
    references public.hall_of_fame_application_messages (id) on delete restrict,
  add column request_kind text,
  add column requested_evidence_type text,
  add constraint hall_of_fame_application_messages_id_batch_record_unique
    unique (id, application_batch_id, application_record_id),
  add constraint hall_of_fame_application_messages_request_kind_check
    check (
      request_kind is null
      or request_kind in (
        'text_response',
        'supplemental_evidence',
        'text_and_evidence'
      )
    ),
  add constraint hall_of_fame_application_messages_evidence_type_check
    check (
      requested_evidence_type is null
      or requested_evidence_type in (
        'scorecard',
        'round_photo',
        'supporting_document'
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
    );

create unique index hall_of_fame_application_messages_response_uidx
  on public.hall_of_fame_application_messages (reply_to_message_id)
  where message_type = 'applicant_response';

create index hall_of_fame_application_messages_recipient_created_idx
  on public.hall_of_fame_application_messages (
    recipient_user_id,
    created_at,
    id
  )
  where message_type = 'additional_info_request';

alter table public.hall_of_fame_evidence_files
  add column additional_info_request_message_id uuid,
  add constraint hall_of_fame_evidence_files_additional_info_request_fkey
    foreign key (
      additional_info_request_message_id,
      application_batch_id,
      application_record_id
    )
    references public.hall_of_fame_application_messages (
      id,
      application_batch_id,
      application_record_id
    )
    on delete restrict;

create index hall_of_fame_evidence_files_additional_info_request_idx
  on public.hall_of_fame_evidence_files (
    additional_info_request_message_id,
    status,
    created_at,
    id
  )
  where additional_info_request_message_id is not null;

create function private.enforce_hall_of_fame_evidence_request_link()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_operation text;
begin
  if tg_op = 'UPDATE' then
    if new.additional_info_request_message_id
         is distinct from old.additional_info_request_message_id then
      raise exception 'HOF_EVIDENCE_REQUEST_LINK_IMMUTABLE'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.additional_info_request_message_id is null then
    return new;
  end if;

  begin
    v_actor := nullif(
      pg_catalog.current_setting('pul.hall_of_fame.actor_user_id', true),
      ''
    )::uuid;
  exception
    when invalid_text_representation then
      raise exception 'HOF_INVALID_EVIDENCE_REQUEST_LINK'
        using errcode = '42501';
  end;

  v_operation := nullif(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true),
    ''
  );

  if v_actor is null
     or auth.uid() is distinct from v_actor
     or v_operation <> 'hall_of_fame.evidence.upload_intent'
     or new.replaces_evidence_id is not null
     or not exists (
       select 1
       from public.hall_of_fame_application_messages as request_message
       where request_message.id = new.additional_info_request_message_id
         and request_message.application_batch_id = new.application_batch_id
         and request_message.application_record_id = new.application_record_id
         and request_message.message_type = 'additional_info_request'
         and request_message.recipient_user_id = v_actor
         and request_message.request_kind in (
           'supplemental_evidence',
           'text_and_evidence'
         )
         and request_message.requested_evidence_type = new.evidence_type
     ) then
    raise exception 'HOF_INVALID_EVIDENCE_REQUEST_LINK'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function private.enforce_hall_of_fame_evidence_request_link()
  is 'Keeps supplemental evidence permanently bound to one matching record-scoped additional-information request.';

revoke all on function private.enforce_hall_of_fame_evidence_request_link()
  from public, anon, authenticated, service_role;

create trigger hall_of_fame_evidence_files_request_link_before_mutation
before insert or update of additional_info_request_message_id
on public.hall_of_fame_evidence_files
for each row execute function private.enforce_hall_of_fame_evidence_request_link();

create function private.enforce_guarded_hall_of_fame_additional_info_mutation()
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
      pg_catalog.current_setting(
        'pul.hall_of_fame.application_batch_id', true
      ), ''
    )::uuid;
    v_record := nullif(
      pg_catalog.current_setting(
        'pul.hall_of_fame.application_record_id', true
      ), ''
    )::uuid;
  exception
    when invalid_text_representation then
      raise exception 'HOF_INVALID_MUTATION_CONTEXT' using errcode = '42501';
  end;

  v_operation := nullif(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true), ''
  );
  v_fingerprint := nullif(
    pg_catalog.current_setting(
      'pul.hall_of_fame.payload_fingerprint', true
    ), ''
  );

  if v_actor is null
     or v_request is null
     or v_batch is null
     or v_operation not in (
       'hall_of_fame.application.additional_info.request',
       'hall_of_fame.application.additional_info.respond',
       'hall_of_fame.application.resubmit'
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
           v_operation = 'hall_of_fame.application.resubmit'
           and new.target_user_id is not null
         )
         or (
           v_operation <> 'hall_of_fame.application.resubmit'
           and new.target_user_id is null
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
     and tg_table_name = 'hall_of_fame_application_batches' then
    if tg_op <> 'UPDATE'
       or new.id <> old.id
       or old.id <> v_batch
       or new.application_type <> old.application_type
       or new.created_by_user_id <> old.created_by_user_id
       or new.created_by_membership_id is distinct from old.created_by_membership_id
       or new.nominating_club_id is distinct from old.nominating_club_id
       or new.vacancy_context_club_id is distinct from old.vacancy_context_club_id
       or new.submitted_at is distinct from old.submitted_at
       or new.finalized_at is distinct from old.finalized_at
       or new.created_at <> old.created_at
       or not (
         (
           v_operation = 'hall_of_fame.application.additional_info.request'
           and old.status = 'under_review'
           and new.status = 'additional_info_required'
           and new.version = old.version + 1
         )
         or (
           v_operation = 'hall_of_fame.application.resubmit'
           and old.status = 'additional_info_required'
           and new.status = 'submitted'
           and new.version = old.version + 1
         )
       ) then
      raise exception 'HOF_APPLICATION_BATCH_CONTEXT_MISMATCH'
        using errcode = '42501';
    end if;
    return new;
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
       or not (
         (
           v_operation = 'hall_of_fame.application.additional_info.request'
           and old.review_status = 'under_review'
           and new.review_status = 'additional_info_required'
           and new.version = old.version + 1
         )
         or (
           v_operation = 'hall_of_fame.application.resubmit'
           and old.review_status = 'additional_info_required'
           and new.review_status = 'submitted'
           and new.version = old.version + 1
         )
       ) then
      raise exception 'HOF_APPLICATION_RECORD_CONTEXT_MISMATCH'
        using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'HOF_MUTATION_RPC_REQUIRED' using errcode = '42501';
end;
$$;

revoke all on function private.enforce_guarded_hall_of_fame_additional_info_mutation()
  from public, anon, authenticated, service_role;

create function private.enforce_hall_of_fame_additional_info_history_append()
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
  v_current_status text;
  v_current_version integer;
  v_platform_role text;
  v_expected_membership uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    raise exception 'HOF_APPEND_ONLY_MUTATION_FORBIDDEN' using errcode = '42501';
  end if;

  begin
    v_actor := nullif(
      pg_catalog.current_setting('pul.hall_of_fame.actor_user_id', true), ''
    )::uuid;
    v_request := nullif(
      pg_catalog.current_setting('pul.hall_of_fame.request_id', true), ''
    )::uuid;
    v_batch := nullif(
      pg_catalog.current_setting(
        'pul.hall_of_fame.application_batch_id', true
      ), ''
    )::uuid;
  exception
    when invalid_text_representation then
      raise exception 'HOF_INVALID_HISTORY_CONTEXT' using errcode = '42501';
  end;

  v_operation := nullif(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true), ''
  );

  if v_actor is null
     or v_request is null
     or v_batch is null
     or v_operation not in (
       'hall_of_fame.application.additional_info.request',
       'hall_of_fame.application.resubmit'
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

  if v_operation = 'hall_of_fame.application.additional_info.request' then
    select account.platform_role
      into v_platform_role
    from public.user_accounts as account
    where account.id = v_actor
      and account.account_status = 'active'
      and account.platform_role in ('platform_moderator', 'platform_admin');

    if v_platform_role is null
       or new.actor_membership_id is not null
       or new.actor_platform_role <> v_platform_role
       or new.from_status <> 'under_review'
       or new.to_status <> 'additional_info_required' then
      raise exception 'HOF_APPLICATION_HISTORY_CONTEXT_MISMATCH'
        using errcode = '42501';
    end if;
  else
    select batch.created_by_membership_id
      into v_expected_membership
    from public.hall_of_fame_application_batches as batch
    where batch.id = v_batch
      and batch.created_by_user_id = v_actor;

    if not found
       or new.actor_membership_id is distinct from v_expected_membership
       or new.actor_platform_role is not null
       or new.from_status <> 'additional_info_required'
       or new.to_status <> 'submitted' then
      raise exception 'HOF_APPLICATION_HISTORY_CONTEXT_MISMATCH'
        using errcode = '42501';
    end if;
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
     or new.version <> v_current_version
     or not exists (
       select 1
       from public.hall_of_fame_application_history as previous_history
       where previous_history.scope = new.scope
         and previous_history.application_batch_id = new.application_batch_id
         and previous_history.application_record_id
               is not distinct from new.application_record_id
         and previous_history.version = new.version - 1
         and previous_history.to_status = new.from_status
     ) then
    raise exception 'HOF_APPLICATION_HISTORY_CHAIN_MISMATCH'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_hall_of_fame_additional_info_history_append()
  from public, anon, authenticated, service_role;

create function private.enforce_hall_of_fame_additional_info_review_append()
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
  v_platform_role text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    raise exception 'HOF_APPEND_ONLY_MUTATION_FORBIDDEN' using errcode = '42501';
  end if;

  begin
    v_actor := nullif(
      pg_catalog.current_setting('pul.hall_of_fame.actor_user_id', true), ''
    )::uuid;
    v_request := nullif(
      pg_catalog.current_setting('pul.hall_of_fame.request_id', true), ''
    )::uuid;
    v_batch := nullif(
      pg_catalog.current_setting(
        'pul.hall_of_fame.application_batch_id', true
      ), ''
    )::uuid;
    v_record := nullif(
      pg_catalog.current_setting(
        'pul.hall_of_fame.application_record_id', true
      ), ''
    )::uuid;
  exception
    when invalid_text_representation then
      raise exception 'HOF_INVALID_REVIEW_CONTEXT' using errcode = '42501';
  end;

  v_operation := nullif(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true), ''
  );

  select account.platform_role
    into v_platform_role
  from public.user_accounts as account
  where account.id = v_actor
    and account.account_status = 'active'
    and account.platform_role in ('platform_moderator', 'platform_admin');

  if v_actor is null
     or v_request is null
     or v_batch is null
     or v_operation <> 'hall_of_fame.application.additional_info.request'
     or auth.uid() is distinct from v_actor
     or not private.hall_of_fame_mutation_context_is_valid()
     or v_platform_role is null
     or new.application_batch_id <> v_batch
     or new.application_record_id is distinct from v_record
     or new.review_action <> 'additional_info_requested'
     or new.reviewer_user_id <> v_actor
     or new.reviewer_platform_role <> v_platform_role
     or new.recommendation <> 'additional_info_required'
     or new.internal_note is not null
     or new.duplicate_suspected
     or new.conflict_declared
     or new.request_id <> v_request then
    raise exception 'HOF_REVIEW_CONTEXT_MISMATCH' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_hall_of_fame_additional_info_review_append()
  from public, anon, authenticated, service_role;

create function private.enforce_hall_of_fame_additional_info_message_append()
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
  v_platform_role text;
  v_original public.hall_of_fame_application_messages%rowtype;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    raise exception 'HOF_APPEND_ONLY_MUTATION_FORBIDDEN' using errcode = '42501';
  end if;

  begin
    v_actor := nullif(
      pg_catalog.current_setting('pul.hall_of_fame.actor_user_id', true), ''
    )::uuid;
    v_request := nullif(
      pg_catalog.current_setting('pul.hall_of_fame.request_id', true), ''
    )::uuid;
    v_batch := nullif(
      pg_catalog.current_setting(
        'pul.hall_of_fame.application_batch_id', true
      ), ''
    )::uuid;
    v_record := nullif(
      pg_catalog.current_setting(
        'pul.hall_of_fame.application_record_id', true
      ), ''
    )::uuid;
  exception
    when invalid_text_representation then
      raise exception 'HOF_INVALID_MESSAGE_CONTEXT' using errcode = '42501';
  end;

  v_operation := nullif(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true), ''
  );

  if v_actor is null
     or v_request is null
     or v_batch is null
     or auth.uid() is distinct from v_actor
     or not private.hall_of_fame_mutation_context_is_valid()
     or new.application_batch_id <> v_batch
     or new.application_record_id is distinct from v_record
     or new.created_by_user_id <> v_actor
     or new.request_id <> v_request then
    raise exception 'HOF_APPLICATION_MESSAGE_CONTEXT_MISMATCH'
      using errcode = '42501';
  end if;

  if v_operation = 'hall_of_fame.application.additional_info.request' then
    select account.platform_role
      into v_platform_role
    from public.user_accounts as account
    where account.id = v_actor
      and account.account_status = 'active'
      and account.platform_role in ('platform_moderator', 'platform_admin');

    if v_platform_role is null
       or new.message_type <> 'additional_info_request'
       or new.created_by_platform_role <> v_platform_role
       or new.recipient_user_id is null
       or new.reply_to_message_id is not null
       or new.request_kind is null then
      raise exception 'HOF_APPLICATION_MESSAGE_CONTEXT_MISMATCH'
        using errcode = '42501';
    end if;
  elsif v_operation = 'hall_of_fame.application.additional_info.respond' then
    select original.*
      into v_original
    from public.hall_of_fame_application_messages as original
    where original.id = new.reply_to_message_id
      and original.application_batch_id = v_batch
      and original.application_record_id is not distinct from v_record
      and original.message_type = 'additional_info_request'
      and original.recipient_user_id = v_actor;

    if not found
       or new.message_type <> 'applicant_response'
       or new.created_by_platform_role is not null
       or new.recipient_user_id is not null
       or new.request_kind is not null
       or new.requested_evidence_type is not null then
      raise exception 'HOF_APPLICATION_MESSAGE_CONTEXT_MISMATCH'
        using errcode = '42501';
    end if;
  else
    raise exception 'HOF_APPLICATION_MESSAGE_CONTEXT_MISMATCH'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_hall_of_fame_additional_info_message_append()
  from public, anon, authenticated, service_role;

-- Preserve every approved specialized guard and route only the three new
-- application operations away from the deny-by-default triggers.
drop trigger hall_of_fame_application_batches_guard_before_mutation
  on public.hall_of_fame_application_batches;
create trigger hall_of_fame_application_batches_guard_before_mutation
before insert or update or delete on public.hall_of_fame_application_batches
for each row when (
  coalesce(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true), ''
  ) not like 'hall_of_fame.evidence.%'
  and coalesce(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true), ''
  ) <> 'hall_of_fame.application.submit'
  and coalesce(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true), ''
  ) not in (
    'hall_of_fame.application.review.start',
    'hall_of_fame.application.review.note',
    'hall_of_fame.application.additional_info.request',
    'hall_of_fame.application.additional_info.respond',
    'hall_of_fame.application.resubmit'
  )
) execute function private.reject_hall_of_fame_mutation();
create trigger hall_of_fame_application_batches_additional_info_guard
before insert or update or delete on public.hall_of_fame_application_batches
for each row when (
  coalesce(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true), ''
  ) in (
    'hall_of_fame.application.additional_info.request',
    'hall_of_fame.application.additional_info.respond',
    'hall_of_fame.application.resubmit'
  )
) execute function private.enforce_guarded_hall_of_fame_additional_info_mutation();

drop trigger hall_of_fame_application_records_guard_before_mutation
  on public.hall_of_fame_application_records;
create trigger hall_of_fame_application_records_guard_before_mutation
before insert or update or delete on public.hall_of_fame_application_records
for each row when (
  coalesce(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true), ''
  ) not like 'hall_of_fame.evidence.%'
  and coalesce(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true), ''
  ) <> 'hall_of_fame.application.submit'
  and coalesce(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true), ''
  ) not in (
    'hall_of_fame.application.review.start',
    'hall_of_fame.application.review.note',
    'hall_of_fame.application.additional_info.request',
    'hall_of_fame.application.additional_info.respond',
    'hall_of_fame.application.resubmit'
  )
) execute function private.reject_hall_of_fame_mutation();
create trigger hall_of_fame_application_records_additional_info_guard
before insert or update or delete on public.hall_of_fame_application_records
for each row when (
  coalesce(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true), ''
  ) in (
    'hall_of_fame.application.additional_info.request',
    'hall_of_fame.application.additional_info.respond',
    'hall_of_fame.application.resubmit'
  )
) execute function private.enforce_guarded_hall_of_fame_additional_info_mutation();

drop trigger hall_of_fame_mutation_requests_guard_before_mutation
  on private.hall_of_fame_mutation_requests;
create trigger hall_of_fame_mutation_requests_guard_before_mutation
before insert or update or delete on private.hall_of_fame_mutation_requests
for each row when (
  coalesce(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true), ''
  ) not like 'hall_of_fame.evidence.%'
  and coalesce(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true), ''
  ) <> 'hall_of_fame.application.submit'
  and coalesce(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true), ''
  ) not in (
    'hall_of_fame.application.review.start',
    'hall_of_fame.application.review.note',
    'hall_of_fame.application.additional_info.request',
    'hall_of_fame.application.additional_info.respond',
    'hall_of_fame.application.resubmit'
  )
) execute function private.reject_hall_of_fame_mutation();
create trigger hall_of_fame_mutation_requests_additional_info_guard
before insert or update or delete on private.hall_of_fame_mutation_requests
for each row when (
  coalesce(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true), ''
  ) in (
    'hall_of_fame.application.additional_info.request',
    'hall_of_fame.application.additional_info.respond',
    'hall_of_fame.application.resubmit'
  )
) execute function private.enforce_guarded_hall_of_fame_additional_info_mutation();

drop trigger hall_of_fame_application_history_guard_before_mutation
  on public.hall_of_fame_application_history;
create trigger hall_of_fame_application_history_guard_before_mutation
before insert or update or delete on public.hall_of_fame_application_history
for each row when (
  coalesce(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true), ''
  ) not like 'hall_of_fame.evidence.%'
  and coalesce(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true), ''
  ) <> 'hall_of_fame.application.submit'
  and coalesce(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true), ''
  ) not in (
    'hall_of_fame.application.review.start',
    'hall_of_fame.application.review.note',
    'hall_of_fame.application.additional_info.request',
    'hall_of_fame.application.additional_info.respond',
    'hall_of_fame.application.resubmit'
  )
) execute function private.reject_hall_of_fame_append_only_mutation();
create trigger hall_of_fame_application_history_additional_info_guard
before insert or update or delete on public.hall_of_fame_application_history
for each row when (
  coalesce(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true), ''
  ) in (
    'hall_of_fame.application.additional_info.request',
    'hall_of_fame.application.resubmit'
  )
) execute function private.enforce_hall_of_fame_additional_info_history_append();

drop trigger hall_of_fame_application_reviews_guard_before_mutation
  on public.hall_of_fame_application_reviews;
create trigger hall_of_fame_application_reviews_guard_before_mutation
before insert or update or delete on public.hall_of_fame_application_reviews
for each row when (
  coalesce(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true), ''
  ) not in (
    'hall_of_fame.application.review.start',
    'hall_of_fame.application.review.note',
    'hall_of_fame.application.additional_info.request'
  )
) execute function private.reject_hall_of_fame_append_only_mutation();
create trigger hall_of_fame_application_reviews_additional_info_guard
before insert or update or delete on public.hall_of_fame_application_reviews
for each row when (
  coalesce(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true), ''
  ) = 'hall_of_fame.application.additional_info.request'
) execute function private.enforce_hall_of_fame_additional_info_review_append();

drop trigger hall_of_fame_application_messages_guard_before_mutation
  on public.hall_of_fame_application_messages;
create trigger hall_of_fame_application_messages_guard_before_mutation
before insert or update or delete on public.hall_of_fame_application_messages
for each row when (
  coalesce(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true), ''
  ) not in (
    'hall_of_fame.application.additional_info.request',
    'hall_of_fame.application.additional_info.respond'
  )
) execute function private.reject_hall_of_fame_append_only_mutation();
create trigger hall_of_fame_application_messages_additional_info_guard
before insert or update or delete on public.hall_of_fame_application_messages
for each row when (
  coalesce(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true), ''
  ) in (
    'hall_of_fame.application.additional_info.request',
    'hall_of_fame.application.additional_info.respond'
  )
) execute function private.enforce_hall_of_fame_additional_info_message_append();

create function private.lock_hall_of_fame_readiness_accounts(
  p_application_batch_id uuid,
  p_required_status text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform account.id
  from public.user_accounts as account
  where account.id in (
    select record.target_user_id
    from public.hall_of_fame_application_records as record
    where record.application_batch_id = p_application_batch_id
      and record.review_status = p_required_status
    union
    select confirmation.confirmer_user_id
    from public.hall_of_fame_record_confirmations as confirmation
    join public.hall_of_fame_application_records as record
      on record.id = confirmation.application_record_id
    where record.application_batch_id = p_application_batch_id
      and record.review_status = p_required_status
      and confirmation.confirmation_role = 'round_companion'
      and confirmation.status = 'confirmed'
  )
  order by account.id
  for share;
end;
$$;

comment on function private.lock_hall_of_fame_readiness_accounts(
  uuid, text
) is
  'Share-locks every target and confirmed companion account used by Submit or Resubmit readiness in deterministic UUID order.';

revoke all on function private.lock_hall_of_fame_readiness_accounts(
  uuid, text
) from public, anon, authenticated, service_role;

create function private.validate_hall_of_fame_application_readiness(
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

  select batch.*
    into v_batch
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

  select pg_catalog.count(*)
    into v_valid_admin_club_count
  from public.club_memberships as membership
  join public.clubs as club
    on club.id = membership.club_id
   and club.club_status = 'active'
  where membership.user_id = p_actor_user_id
    and membership.membership_status = 'active'
    and private.count_active_club_admins(club.id) > 0;

  if v_batch.application_type = 'direct_application' then
    if v_batch.created_by_user_id <> p_actor_user_id
       or v_active_membership_count <> 0
       or v_suspended_membership_count <> 0 then
      raise exception 'HOF_ELIGIBILITY_CHANGED' using errcode = '42501';
    end if;
  elsif v_batch.application_type =
        'club_admin_vacancy_direct_application' then
    if v_batch.created_by_user_id <> p_actor_user_id
       or v_active_membership_count = 0
       or v_valid_admin_club_count <> 0
       or private.count_active_club_admins(v_batch.vacancy_context_club_id) <> 0
       or not exists (
         select 1
         from public.club_memberships as membership
         join public.clubs as club
           on club.id = membership.club_id
          and club.club_status = 'active'
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
         p_actor_user_id,
         v_batch.nominating_club_id
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

  select pg_catalog.count(*)::integer
    into v_record_count
  from public.hall_of_fame_application_records as record
  where record.application_batch_id = p_application_batch_id
    and record.review_status = p_required_status;

  if v_record_count = 0 then
    raise exception 'HOF_ACTIVE_APPLICATION_RECORD_REQUIRED'
      using errcode = '22023';
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
            and record.hole_par - record.strokes
                  >= definition.qualification_value
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

  if v_batch.application_type =
       'club_admin_vacancy_direct_application' and exists (
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
       'submitted',
       'under_review',
       'additional_info_required',
       'approved'
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
          and publication.policy_version =
                pg_catalog.btrim(publication.policy_version)
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
            'image/jpeg',
            'image/png',
            'image/webp',
            'application/pdf'
          )
          and evidence.declared_mime_type = evidence.mime_type
          and pg_catalog.octet_length(evidence.sha256) = 32
          and evidence.deleted_at is null
          and evidence.storage_deleted_at is null
          and evidence.replaced_by_evidence_id is null
      )
  ) then
    raise exception 'HOF_SCORECARD_EVIDENCE_REQUIRED'
      using errcode = '22023';
  end if;

  return v_record_count;
end;
$$;

comment on function private.validate_hall_of_fame_application_readiness(
  uuid, uuid, text
) is
  'Validates the shared draft-submit or AIR-resubmit eligibility, consent, confirmation, and Evidence contract.';

revoke all on function private.validate_hall_of_fame_application_readiness(
  uuid, uuid, text
) from public, anon, authenticated, service_role;

create or replace function private.validate_hall_of_fame_application_submission(
  p_actor_user_id uuid,
  p_application_batch_id uuid
)
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  select private.validate_hall_of_fame_application_readiness(
    p_actor_user_id,
    p_application_batch_id,
    'draft'
  );
$$;

revoke all on function private.validate_hall_of_fame_application_submission(
  uuid, uuid
) from public, anon, authenticated, service_role;

create function private.assert_hall_of_fame_additional_info_satisfied(
  p_application_batch_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.hall_of_fame_application_messages as request_message
    left join public.hall_of_fame_application_records as scoped_record
      on scoped_record.id = request_message.application_record_id
     and scoped_record.application_batch_id = request_message.application_batch_id
    where request_message.application_batch_id = p_application_batch_id
      and request_message.message_type = 'additional_info_request'
      and (
        request_message.application_record_id is null
        or scoped_record.review_status <> 'withdrawn'
      )
      and (
        (
          request_message.request_kind in ('text_response', 'text_and_evidence')
          and not exists (
            select 1
            from public.hall_of_fame_application_messages as response
            where response.reply_to_message_id = request_message.id
              and response.message_type = 'applicant_response'
          )
        )
        or (
          request_message.request_kind in (
            'supplemental_evidence', 'text_and_evidence'
          )
          and not exists (
            select 1
            from public.hall_of_fame_evidence_files as evidence
            where evidence.additional_info_request_message_id = request_message.id
              and evidence.application_batch_id = p_application_batch_id
              and evidence.application_record_id = request_message.application_record_id
              and evidence.evidence_type = request_message.requested_evidence_type
              and evidence.status = 'available'
              and evidence.finalized_at is not null
              and evidence.deleted_at is null
              and evidence.storage_deleted_at is null
              and evidence.replaced_by_evidence_id is null
          )
        )
      )
  ) then
    raise exception 'HOF_ADDITIONAL_INFO_INCOMPLETE' using errcode = 'PT409';
  end if;
end;
$$;

revoke all on function private.assert_hall_of_fame_additional_info_satisfied(uuid)
  from public, anon, authenticated, service_role;

create function private.lock_and_authorize_hall_of_fame_supplemental_evidence(
  p_actor_user_id uuid,
  p_evidence_id uuid,
  p_expected_batch_version integer default null
)
returns table (
  batch_id uuid,
  record_id uuid,
  request_message_id uuid,
  batch_version integer,
  record_version integer,
  target_user_id uuid
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_evidence public.hall_of_fame_evidence_files%rowtype;
  v_batch public.hall_of_fame_application_batches%rowtype;
  v_record public.hall_of_fame_application_records%rowtype;
  v_request public.hall_of_fame_application_messages%rowtype;
begin
  perform private.lock_hall_of_fame_authorization_boundary();

  select evidence.*
    into v_evidence
  from public.hall_of_fame_evidence_files as evidence
  where evidence.id = p_evidence_id;

  if not found or v_evidence.additional_info_request_message_id is null then
    raise exception 'HOF_SUPPLEMENTAL_EVIDENCE_NOT_AUTHORIZED'
      using errcode = '42501';
  end if;

  select batch.*
    into v_batch
  from public.hall_of_fame_application_batches as batch
  where batch.id = v_evidence.application_batch_id
  for update;

  select record.*
    into v_record
  from public.hall_of_fame_application_records as record
  where record.id = v_evidence.application_record_id
    and record.application_batch_id = v_evidence.application_batch_id
  for update;

  select request_message.*
    into v_request
  from public.hall_of_fame_application_messages as request_message
  where request_message.id = v_evidence.additional_info_request_message_id
    and request_message.application_batch_id = v_evidence.application_batch_id
    and request_message.application_record_id = v_evidence.application_record_id
  for share;

  if v_batch.status <> 'additional_info_required'
     or v_record.review_status <> 'additional_info_required'
     or v_request.message_type <> 'additional_info_request'
     or v_request.request_kind not in (
       'supplemental_evidence', 'text_and_evidence'
     )
     or v_request.recipient_user_id <> p_actor_user_id
     or v_request.requested_evidence_type <> v_evidence.evidence_type
     or (
       p_expected_batch_version is not null
       and v_batch.version <> p_expected_batch_version
     ) then
    raise exception 'HOF_SUPPLEMENTAL_EVIDENCE_NOT_AUTHORIZED'
      using errcode = '42501';
  end if;

  return query select
    v_batch.id,
    v_record.id,
    v_request.id,
    v_batch.version,
    v_record.version,
    v_record.target_user_id;
end;
$$;

revoke all on function private.lock_and_authorize_hall_of_fame_supplemental_evidence(
  uuid, uuid, integer
) from public, anon, authenticated, service_role;

create function private.execute_hall_of_fame_supplemental_evidence_intent(
  p_actor_user_id uuid,
  p_additional_info_request_message_id uuid,
  p_evidence_type text,
  p_declared_mime_type text,
  p_declared_size_bytes bigint,
  p_expected_batch_version integer,
  p_request_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_operation text := 'hall_of_fame.evidence.upload_intent';
  v_type text := case when p_evidence_type is null then null
    else pg_catalog.lower(pg_catalog.btrim(p_evidence_type)) end;
  v_mime text := case when p_declared_mime_type is null then null
    else pg_catalog.lower(pg_catalog.btrim(p_declared_mime_type)) end;
  v_request public.hall_of_fame_application_messages%rowtype;
  v_batch public.hall_of_fame_application_batches%rowtype;
  v_record public.hall_of_fame_application_records%rowtype;
  v_evidence public.hall_of_fame_evidence_files%rowtype;
  v_payload_fingerprint bytea;
  v_claim record;
  v_expiry timestamptz := pg_catalog.now() + interval '15 minutes';
  v_club_id uuid;
  v_result jsonb;
begin
  perform private.lock_active_hall_of_fame_actor(p_actor_user_id);

  if auth.uid() is distinct from p_actor_user_id
     or p_additional_info_request_message_id is null
     or p_expected_batch_version is null
     or p_expected_batch_version < 1
     or p_request_id is null
     or v_type not in ('scorecard', 'round_photo', 'supporting_document')
     or v_mime not in (
       'image/jpeg', 'image/png', 'image/webp', 'application/pdf'
     )
     or p_declared_size_bytes not between 1 and 10485760
     or (v_mime = 'application/pdf' and v_type <> 'scorecard') then
    raise exception 'HOF_INVALID_SUPPLEMENTAL_EVIDENCE_INTENT'
      using errcode = '22023';
  end if;

  perform private.lock_hall_of_fame_mutation_request(
    p_actor_user_id,
    p_request_id
  );

  select request_message.*
    into v_request
  from public.hall_of_fame_application_messages as request_message
  where request_message.id = p_additional_info_request_message_id
    and request_message.message_type = 'additional_info_request'
    and request_message.recipient_user_id = p_actor_user_id
    and request_message.request_kind in (
      'supplemental_evidence', 'text_and_evidence'
    )
    and request_message.application_record_id is not null;

  if not found then
    raise exception 'HOF_SUPPLEMENTAL_EVIDENCE_NOT_AUTHORIZED'
      using errcode = '42501';
  end if;

  v_payload_fingerprint := extensions.digest(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'additional_info_request_message_id',
          p_additional_info_request_message_id,
        'record_id', v_request.application_record_id,
        'evidence_type', v_type,
        'mime', v_mime,
        'size', p_declared_size_bytes,
        'expected_batch_version', p_expected_batch_version
      )::text,
      'UTF8'
    ),
    'sha256'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_request.application_batch_id::text, 8610)
  );

  select record.*
    into v_record
  from public.hall_of_fame_application_records as record
  where record.id = v_request.application_record_id
    and record.application_batch_id = v_request.application_batch_id;

  if not found then
    raise exception 'HOF_SUPPLEMENTAL_EVIDENCE_NOT_AUTHORIZED'
      using errcode = '42501';
  end if;

  select *
    into v_claim
  from private.hall_of_fame_claim_request(
    p_actor_user_id,
    p_request_id,
    v_operation,
    v_request.application_batch_id,
    v_request.application_record_id,
    v_record.target_user_id,
    v_payload_fingerprint
  );

  if v_claim.replayed then
    return v_claim.result_payload || '{"replayed":true}'::jsonb;
  end if;

  perform private.lock_hall_of_fame_authorization_boundary();

  select batch.*
    into v_batch
  from public.hall_of_fame_application_batches as batch
  where batch.id = v_request.application_batch_id
  for update;

  select record.*
    into v_record
  from public.hall_of_fame_application_records as record
  where record.id = v_request.application_record_id
    and record.application_batch_id = v_request.application_batch_id
  for update;

  perform request_message.id
  from public.hall_of_fame_application_messages as request_message
  where request_message.id = v_request.id
    and request_message.application_batch_id = v_batch.id
    and request_message.application_record_id = v_record.id
    and request_message.recipient_user_id = p_actor_user_id
    and request_message.request_kind in (
      'supplemental_evidence', 'text_and_evidence'
    )
    and request_message.requested_evidence_type = v_type
  for share;

  if not found
     or v_batch.status <> 'additional_info_required'
     or v_batch.version <> p_expected_batch_version
     or v_record.review_status <> 'additional_info_required' then
    raise exception 'HOF_SUPPLEMENTAL_EVIDENCE_NOT_AUTHORIZED'
      using errcode = '42501';
  end if;

  v_evidence.id := pg_catalog.gen_random_uuid();
  insert into public.hall_of_fame_evidence_files (
    id,
    application_batch_id,
    application_record_id,
    evidence_type,
    storage_bucket,
    storage_path,
    mime_type,
    byte_size,
    sha256,
    original_filename,
    uploaded_by_user_id,
    uploaded_by_membership_id,
    status,
    declared_mime_type,
    declared_byte_size,
    upload_expires_at,
    version,
    replaces_evidence_id,
    additional_info_request_message_id
  ) values (
    v_evidence.id,
    v_batch.id,
    v_record.id,
    v_type,
    'hall-of-fame-evidence',
    'applications/' || v_batch.id::text || '/' || v_evidence.id::text
      || '/original',
    v_mime,
    null,
    null,
    null,
    p_actor_user_id,
    null,
    'pending_upload',
    v_mime,
    p_declared_size_bytes,
    v_expiry,
    1,
    null,
    v_request.id
  )
  returning * into v_evidence;

  perform private.append_hall_of_fame_evidence_history(
    v_evidence.id,
    v_batch.id,
    v_record.id,
    null,
    'pending_upload',
    1,
    v_operation,
    p_actor_user_id,
    p_request_id,
    null
  );

  v_club_id := coalesce(
    v_batch.nominating_club_id,
    v_batch.vacancy_context_club_id
  );
  insert into public.audit_logs (
    actor_id, actor_type, action, target_type, target_id, club_id,
    before_summary, after_summary, metadata, request_id, outcome
  ) values (
    p_actor_user_id,
    'user',
    v_operation,
    'hall_of_fame_evidence_file',
    v_evidence.id::text,
    case when v_club_id is null then null else v_club_id::text end,
    null,
    pg_catalog.jsonb_build_object(
      'status', 'pending_upload',
      'evidence_version', 1,
      'record_version', v_record.version,
      'batch_version', v_batch.version
    ),
    pg_catalog.jsonb_build_object(
      'application_batch_id', v_batch.id,
      'application_record_id', v_record.id,
      'additional_info_request_message_id', v_request.id,
      'supplemental', true
    ),
    p_request_id,
    'success'
  );

  v_result := pg_catalog.jsonb_build_object(
    'application_batch_id', v_batch.id,
    'application_record_id', v_record.id,
    'additional_info_request_message_id', v_request.id,
    'evidence_id', v_evidence.id,
    'status', v_evidence.status,
    'evidence_version', v_evidence.version,
    'batch_version', v_batch.version,
    'record_version', v_record.version,
    'upload_expires_at', v_evidence.upload_expires_at,
    'replayed', false
  );

  perform private.complete_hall_of_fame_request(
    p_actor_user_id,
    p_request_id,
    v_operation,
    v_batch.id,
    v_record.id,
    v_payload_fingerprint,
    v_result
  );

  return v_result;
end;
$$;

revoke all on function private.execute_hall_of_fame_supplemental_evidence_intent(
  uuid, uuid, text, text, bigint, integer, uuid
) from public, anon, authenticated, service_role;

create function private.execute_hall_of_fame_supplemental_evidence_finalize(
  p_actor_user_id uuid,
  p_evidence_id uuid,
  p_verified_mime_type text,
  p_verified_size_bytes bigint,
  p_verified_sha256_hex text,
  p_expected_evidence_version integer,
  p_expected_batch_version integer,
  p_request_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_operation text := 'hall_of_fame.evidence.finalize';
  v_mime text := case when p_verified_mime_type is null then null
    else pg_catalog.lower(pg_catalog.btrim(p_verified_mime_type)) end;
  v_sha text := case when p_verified_sha256_hex is null then null
    else pg_catalog.lower(pg_catalog.btrim(p_verified_sha256_hex)) end;
  v_evidence public.hall_of_fame_evidence_files%rowtype;
  v_authorization record;
  v_payload_fingerprint bytea;
  v_claim record;
  v_club_id uuid;
  v_result jsonb;
begin
  perform private.require_hall_of_fame_service_role();
  perform private.lock_active_hall_of_fame_actor(p_actor_user_id);

  if p_evidence_id is null
     or p_expected_evidence_version is null
     or p_expected_evidence_version < 1
     or p_expected_batch_version is null
     or p_expected_batch_version < 1
     or p_request_id is null
     or v_mime not in (
       'image/jpeg', 'image/png', 'image/webp', 'application/pdf'
     )
     or p_verified_size_bytes not between 1 and 10485760
     or v_sha !~ '^[0-9a-f]{64}$' then
    raise exception 'HOF_INVALID_EVIDENCE_FINALIZE' using errcode = '22023';
  end if;

  select evidence.*
    into v_evidence
  from public.hall_of_fame_evidence_files as evidence
  where evidence.id = p_evidence_id;

  if not found or v_evidence.additional_info_request_message_id is null then
    raise exception 'HOF_EVIDENCE_CONTEXT_NOT_FOUND';
  end if;

  perform private.lock_hall_of_fame_mutation_request(
    p_actor_user_id,
    p_request_id
  );

  v_payload_fingerprint := extensions.digest(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'record_id', v_evidence.application_record_id,
        'evidence_id', p_evidence_id,
        'evidence_type', null,
        'mime', v_mime,
        'size', p_verified_size_bytes,
        'sha256', v_sha,
        'expected_evidence_version', p_expected_evidence_version,
        'expected_batch_version', p_expected_batch_version
      )::text,
      'UTF8'
    ),
    'sha256'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_evidence.application_batch_id::text, 8610)
  );

  select record.target_user_id
    into v_authorization
  from public.hall_of_fame_application_records as record
  where record.id = v_evidence.application_record_id
    and record.application_batch_id = v_evidence.application_batch_id;

  if not found then
    raise exception 'HOF_EVIDENCE_CONTEXT_NOT_FOUND';
  end if;

  select *
    into v_claim
  from private.hall_of_fame_claim_request(
    p_actor_user_id,
    p_request_id,
    v_operation,
    v_evidence.application_batch_id,
    v_evidence.application_record_id,
    v_authorization.target_user_id,
    v_payload_fingerprint
  );

  if v_claim.replayed then
    return v_claim.result_payload || '{"replayed":true}'::jsonb;
  end if;

  select *
    into v_authorization
  from private.lock_and_authorize_hall_of_fame_supplemental_evidence(
    p_actor_user_id,
    p_evidence_id,
    p_expected_batch_version
  );

  select evidence.*
    into v_evidence
  from public.hall_of_fame_evidence_files as evidence
  where evidence.id = p_evidence_id
    and evidence.application_batch_id = v_authorization.batch_id
    and evidence.application_record_id = v_authorization.record_id
  for update;

  if not found
     or v_evidence.version <> p_expected_evidence_version then
    raise exception 'HOF_EVIDENCE_VERSION_CONFLICT' using errcode = 'PT409';
  end if;

  if v_evidence.status not in ('pending_upload', 'uploaded_unverified')
     or v_evidence.upload_expires_at <= pg_catalog.now()
     or v_mime <> v_evidence.declared_mime_type
     or p_verified_size_bytes <> v_evidence.declared_byte_size
     or (
       v_mime = 'application/pdf'
       and v_evidence.evidence_type <> 'scorecard'
     ) then
    raise exception 'HOF_EVIDENCE_OBJECT_MISMATCH' using errcode = '22023';
  end if;

  update public.hall_of_fame_evidence_files as evidence
  set
    status = 'available',
    mime_type = v_mime,
    byte_size = p_verified_size_bytes,
    sha256 = pg_catalog.decode(v_sha, 'hex'),
    finalized_at = pg_catalog.now(),
    deleted_at = null,
    updated_at = pg_catalog.now(),
    version = evidence.version + 1
  where evidence.id = v_evidence.id
  returning * into v_evidence;

  perform private.append_hall_of_fame_evidence_history(
    v_evidence.id,
    v_authorization.batch_id,
    v_authorization.record_id,
    'pending_upload',
    'available',
    v_evidence.version,
    v_operation,
    p_actor_user_id,
    p_request_id,
    null
  );

  select coalesce(batch.nominating_club_id, batch.vacancy_context_club_id)
    into v_club_id
  from public.hall_of_fame_application_batches as batch
  where batch.id = v_authorization.batch_id;

  insert into public.audit_logs (
    actor_id, actor_type, action, target_type, target_id, club_id,
    before_summary, after_summary, metadata, request_id, outcome
  ) values (
    p_actor_user_id,
    'user',
    v_operation,
    'hall_of_fame_evidence_file',
    v_evidence.id::text,
    case when v_club_id is null then null else v_club_id::text end,
    pg_catalog.jsonb_build_object('status', 'pending_upload'),
    pg_catalog.jsonb_build_object(
      'status', 'available',
      'evidence_version', v_evidence.version,
      'record_version', v_authorization.record_version,
      'batch_version', v_authorization.batch_version
    ),
    pg_catalog.jsonb_build_object(
      'application_batch_id', v_authorization.batch_id,
      'application_record_id', v_authorization.record_id,
      'additional_info_request_message_id',
        v_authorization.request_message_id,
      'supplemental', true,
      'execution_actor_type', 'service_role_system'
    ),
    p_request_id,
    'success'
  );

  v_result := pg_catalog.jsonb_build_object(
    'application_batch_id', v_authorization.batch_id,
    'application_record_id', v_authorization.record_id,
    'additional_info_request_message_id',
      v_authorization.request_message_id,
    'evidence_id', v_evidence.id,
    'status', 'available',
    'evidence_version', v_evidence.version,
    'batch_version', v_authorization.batch_version,
    'record_version', v_authorization.record_version,
    'replaces_evidence_id', null,
    'replayed', false
  );

  perform private.complete_hall_of_fame_request(
    p_actor_user_id,
    p_request_id,
    v_operation,
    v_authorization.batch_id,
    v_authorization.record_id,
    v_payload_fingerprint,
    v_result
  );

  return v_result;
end;
$$;

revoke all on function private.execute_hall_of_fame_supplemental_evidence_finalize(
  uuid, uuid, text, bigint, text, integer, integer, uuid
) from public, anon, authenticated, service_role;

create function public.create_hall_of_fame_supplemental_evidence_upload_intent(
  p_additional_info_request_message_id uuid,
  p_evidence_type text,
  p_declared_mime_type text,
  p_declared_size_bytes bigint,
  p_expected_batch_version integer,
  p_request_id uuid
)
returns table (
  application_batch_id uuid,
  application_record_id uuid,
  additional_info_request_message_id uuid,
  evidence_id uuid,
  status text,
  evidence_version integer,
  batch_version integer,
  record_version integer,
  upload_expires_at timestamptz,
  replayed boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  v_result := private.execute_hall_of_fame_supplemental_evidence_intent(
    auth.uid(),
    p_additional_info_request_message_id,
    p_evidence_type,
    p_declared_mime_type,
    p_declared_size_bytes,
    p_expected_batch_version,
    p_request_id
  );

  return query select
    (v_result ->> 'application_batch_id')::uuid,
    (v_result ->> 'application_record_id')::uuid,
    (v_result ->> 'additional_info_request_message_id')::uuid,
    (v_result ->> 'evidence_id')::uuid,
    v_result ->> 'status',
    (v_result ->> 'evidence_version')::integer,
    (v_result ->> 'batch_version')::integer,
    (v_result ->> 'record_version')::integer,
    (v_result ->> 'upload_expires_at')::timestamptz,
    coalesce((v_result ->> 'replayed')::boolean, false);
end;
$$;

revoke all on function public.create_hall_of_fame_supplemental_evidence_upload_intent(
  uuid, text, text, bigint, integer, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.create_hall_of_fame_supplemental_evidence_upload_intent(
  uuid, text, text, bigint, integer, uuid
) to authenticated;

comment on function public.create_hall_of_fame_supplemental_evidence_upload_intent(
  uuid, text, text, bigint, integer, uuid
) is
  'Creates one request-linked private supplemental Evidence upload intent for the exact authenticated recipient.';

create function public.request_hall_of_fame_additional_info(
  p_application_batch_id uuid,
  p_expected_batch_version integer,
  p_recipient_user_id uuid,
  p_application_record_id uuid,
  p_request_kind text,
  p_requested_evidence_type text,
  p_message text,
  p_request_id uuid
)
returns table (
  request_id uuid,
  operation text,
  application_batch_id uuid,
  application_record_id uuid,
  status text,
  batch_version integer,
  request_message_id uuid,
  review_event_id uuid,
  transitioned_record_count integer,
  requested_at timestamptz,
  replayed boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_operation text := 'hall_of_fame.application.additional_info.request';
  v_kind text := case when p_request_kind is null then null
    else pg_catalog.lower(pg_catalog.btrim(p_request_kind)) end;
  v_evidence_type text := case when p_requested_evidence_type is null then null
    else pg_catalog.lower(pg_catalog.btrim(p_requested_evidence_type)) end;
  v_message text := case when p_message is null then null
    else pg_catalog.btrim(p_message) end;
  v_payload_fingerprint bytea;
  v_claim record;
  v_batch public.hall_of_fame_application_batches%rowtype;
  v_record public.hall_of_fame_application_records%rowtype;
  v_platform_role text;
  v_recipient_account_status text;
  v_transitioned_record_count integer := 0;
  v_active_record_count integer;
  v_new_batch_version integer;
  v_request_message_id uuid;
  v_review_event_id uuid;
  v_requested_at timestamptz := pg_catalog.now();
  v_club_id uuid;
  v_result jsonb;
begin
  perform private.lock_active_hall_of_fame_actor(v_actor_user_id);

  if p_application_batch_id is null
     or p_expected_batch_version is null
     or p_expected_batch_version < 1
     or p_recipient_user_id is null
     or p_request_id is null
     or v_kind not in (
       'text_response', 'supplemental_evidence', 'text_and_evidence'
     )
     or v_message is null
     or v_message = ''
     or pg_catalog.char_length(v_message) > 2000
     or (
       v_kind = 'text_response'
       and v_evidence_type is not null
     )
     or (
       v_kind in ('supplemental_evidence', 'text_and_evidence')
       and (
         p_application_record_id is null
         or v_evidence_type not in (
           'scorecard', 'round_photo', 'supporting_document'
         )
       )
     ) then
    raise exception 'HOF_INVALID_ADDITIONAL_INFO_REQUEST'
      using errcode = '22023';
  end if;

  v_payload_fingerprint := extensions.digest(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'application_batch_id', p_application_batch_id,
        'expected_batch_version', p_expected_batch_version,
        'recipient_user_id', p_recipient_user_id,
        'application_record_id', p_application_record_id,
        'request_kind', v_kind,
        'requested_evidence_type', v_evidence_type,
        'message', v_message
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

  if p_application_record_id is not null
     and not exists (
       select 1
       from public.hall_of_fame_application_records as record
       where record.id = p_application_record_id
         and record.application_batch_id = p_application_batch_id
     ) then
    raise exception 'HOF_ADDITIONAL_INFO_RECORD_INVALID'
      using errcode = 'PT409';
  end if;

  select *
    into v_claim
  from private.hall_of_fame_claim_request(
    v_actor_user_id,
    p_request_id,
    v_operation,
    p_application_batch_id,
    p_application_record_id,
    p_recipient_user_id,
    v_payload_fingerprint
  );

  if v_claim.replayed then
    return query select
      p_request_id,
      v_claim.result_payload ->> 'operation',
      (v_claim.result_payload ->> 'application_batch_id')::uuid,
      nullif(
        v_claim.result_payload ->> 'application_record_id', ''
      )::uuid,
      v_claim.result_payload ->> 'status',
      (v_claim.result_payload ->> 'batch_version')::integer,
      (v_claim.result_payload ->> 'request_message_id')::uuid,
      (v_claim.result_payload ->> 'review_event_id')::uuid,
      (v_claim.result_payload ->> 'transitioned_record_count')::integer,
      (v_claim.result_payload ->> 'requested_at')::timestamptz,
      true;
    return;
  end if;

  v_platform_role := private.require_hall_of_fame_platform_permission(
    v_actor_user_id,
    'hall_of_fame.applications.request_additional_info'
  );

  select batch.*
    into v_batch
  from public.hall_of_fame_application_batches as batch
  where batch.id = p_application_batch_id
  for update;

  if not found then
    raise exception 'HOF_REVIEW_APPLICATION_NOT_FOUND';
  end if;
  if v_batch.version <> p_expected_batch_version then
    raise exception 'HOF_STALE_VERSION' using errcode = 'PT409';
  end if;
  if v_batch.status not in ('under_review', 'additional_info_required') then
    raise exception 'HOF_ADDITIONAL_INFO_STATE_INVALID' using errcode = 'PT409';
  end if;

  perform record.id
  from public.hall_of_fame_application_records as record
  where record.application_batch_id = p_application_batch_id
    and record.review_status <> 'withdrawn'
  order by record.id
  for update;

  select pg_catalog.count(*)::integer
    into v_active_record_count
  from public.hall_of_fame_application_records as record
  where record.application_batch_id = p_application_batch_id
    and record.review_status <> 'withdrawn';

  if v_active_record_count < 1 then
    raise exception 'HOF_ACTIVE_APPLICATION_RECORD_REQUIRED'
      using errcode = 'PT409';
  end if;

  if p_application_record_id is not null then
    select record.*
      into v_record
    from public.hall_of_fame_application_records as record
    where record.id = p_application_record_id
      and record.application_batch_id = p_application_batch_id
      and record.review_status = v_batch.status;

    if not found then
      raise exception 'HOF_ADDITIONAL_INFO_RECORD_INVALID'
        using errcode = 'PT409';
    end if;
  end if;

  select account.account_status
    into v_recipient_account_status
  from public.user_accounts as account
  where account.id = p_recipient_user_id
  for share;

  if not found or v_recipient_account_status <> 'active' then
    raise exception 'HOF_ADDITIONAL_INFO_RECIPIENT_INVALID'
      using errcode = '42501';
  end if;

  if v_batch.application_type in (
       'direct_application',
       'club_admin_vacancy_direct_application'
     ) then
    if p_recipient_user_id <> v_batch.created_by_user_id then
      raise exception 'HOF_ADDITIONAL_INFO_RECIPIENT_INVALID'
        using errcode = '42501';
    end if;
  elsif v_batch.application_type = 'club_nomination' then
    if p_recipient_user_id = v_batch.created_by_user_id then
      null;
    elsif p_application_record_id is not null
          and p_recipient_user_id = v_record.target_user_id then
      null;
    else
      raise exception 'HOF_ADDITIONAL_INFO_RECIPIENT_INVALID'
        using errcode = '42501';
    end if;
  else
    raise exception 'HOF_INVALID_APPLICATION_CONTEXT' using errcode = '22023';
  end if;

  if v_batch.status = 'under_review' then
    if exists (
      select 1
      from public.hall_of_fame_application_records as record
      where record.application_batch_id = p_application_batch_id
        and record.review_status not in ('under_review', 'withdrawn')
    ) then
      raise exception 'HOF_REVIEW_RECORD_STATE_MISMATCH' using errcode = 'PT409';
    end if;

    update public.hall_of_fame_application_batches as batch
    set
      status = 'additional_info_required',
      version = batch.version + 1,
      updated_at = v_requested_at
    where batch.id = p_application_batch_id
      and batch.status = 'under_review'
      and batch.version = p_expected_batch_version
    returning batch.version into v_new_batch_version;

    if not found then
      raise exception 'HOF_STALE_VERSION' using errcode = 'PT409';
    end if;

    update public.hall_of_fame_application_records as record
    set
      review_status = 'additional_info_required',
      version = record.version + 1,
      updated_at = v_requested_at
    where record.application_batch_id = p_application_batch_id
      and record.review_status = 'under_review';

    get diagnostics v_transitioned_record_count = row_count;
    if v_transitioned_record_count <> v_active_record_count then
      raise exception 'HOF_ADDITIONAL_INFO_RECORD_COUNT_MISMATCH'
        using errcode = 'PT409';
    end if;

    insert into public.hall_of_fame_application_history (
      scope, application_batch_id, application_record_id,
      from_status, to_status, version, actor_user_id,
      actor_membership_id, actor_platform_role, action, request_id
    ) values (
      'batch', p_application_batch_id, null,
      'under_review', 'additional_info_required', v_new_batch_version,
      v_actor_user_id, null, v_platform_role, v_operation, p_request_id
    );

    insert into public.hall_of_fame_application_history (
      scope, application_batch_id, application_record_id,
      from_status, to_status, version, actor_user_id,
      actor_membership_id, actor_platform_role, action, request_id
    )
    select
      'record', record.application_batch_id, record.id,
      'under_review', 'additional_info_required', record.version,
      v_actor_user_id, null, v_platform_role, v_operation, p_request_id
    from public.hall_of_fame_application_records as record
    where record.application_batch_id = p_application_batch_id
      and record.review_status = 'additional_info_required'
    order by record.id;
  else
    if exists (
      select 1
      from public.hall_of_fame_application_records as record
      where record.application_batch_id = p_application_batch_id
        and record.review_status not in (
          'additional_info_required', 'withdrawn'
        )
    ) then
      raise exception 'HOF_REVIEW_RECORD_STATE_MISMATCH' using errcode = 'PT409';
    end if;
    v_new_batch_version := v_batch.version;
  end if;

  insert into public.hall_of_fame_application_messages (
    application_batch_id,
    application_record_id,
    message_type,
    body,
    created_by_user_id,
    created_by_platform_role,
    recipient_user_id,
    reply_to_message_id,
    request_kind,
    requested_evidence_type,
    request_id,
    created_at
  ) values (
    p_application_batch_id,
    p_application_record_id,
    'additional_info_request',
    v_message,
    v_actor_user_id,
    v_platform_role,
    p_recipient_user_id,
    null,
    v_kind,
    v_evidence_type,
    p_request_id,
    v_requested_at
  ) returning id into v_request_message_id;

  insert into public.hall_of_fame_application_reviews (
    application_batch_id, application_record_id, review_action,
    reviewer_user_id, reviewer_platform_role, recommendation,
    internal_note, duplicate_suspected, conflict_declared,
    request_id, created_at
  ) values (
    p_application_batch_id,
    p_application_record_id,
    'additional_info_requested',
    v_actor_user_id,
    v_platform_role,
    'additional_info_required',
    null,
    false,
    false,
    p_request_id,
    v_requested_at
  ) returning id into v_review_event_id;

  v_club_id := coalesce(
    v_batch.nominating_club_id,
    v_batch.vacancy_context_club_id
  );
  insert into public.audit_logs (
    actor_id, actor_type, actor_role, action, target_type, target_id,
    club_id, before_summary, after_summary, metadata, request_id, outcome
  ) values (
    v_actor_user_id,
    case when v_platform_role = 'platform_admin' then 'admin' else 'moderator' end,
    v_platform_role,
    v_operation,
    'hall_of_fame_application_batch',
    p_application_batch_id::text,
    case when v_club_id is null then null else v_club_id::text end,
    pg_catalog.jsonb_build_object(
      'status', v_batch.status,
      'version', p_expected_batch_version
    ),
    pg_catalog.jsonb_build_object(
      'status', 'additional_info_required',
      'version', v_new_batch_version,
      'transitioned_record_count', v_transitioned_record_count
    ),
    pg_catalog.jsonb_build_object(
      'application_batch_id', p_application_batch_id,
      'application_record_id', p_application_record_id,
      'recipient_user_id', p_recipient_user_id,
      'request_message_id', v_request_message_id,
      'review_event_id', v_review_event_id,
      'request_kind', v_kind,
      'requested_evidence_type', v_evidence_type
    ),
    p_request_id,
    'success'
  );

  v_result := pg_catalog.jsonb_build_object(
    'operation', v_operation,
    'application_batch_id', p_application_batch_id,
    'application_record_id', p_application_record_id,
    'status', 'additional_info_required',
    'batch_version', v_new_batch_version,
    'request_message_id', v_request_message_id,
    'review_event_id', v_review_event_id,
    'transitioned_record_count', v_transitioned_record_count,
    'requested_at', v_requested_at
  );

  perform private.complete_hall_of_fame_request(
    v_actor_user_id, p_request_id, v_operation,
    p_application_batch_id, p_application_record_id,
    v_payload_fingerprint, v_result
  );

  return query select
    p_request_id, v_operation, p_application_batch_id,
    p_application_record_id, 'additional_info_required'::text,
    v_new_batch_version, v_request_message_id, v_review_event_id,
    v_transitioned_record_count, v_requested_at, false;
end;
$$;

create function public.respond_to_hall_of_fame_additional_info(
  p_additional_info_request_message_id uuid,
  p_expected_batch_version integer,
  p_response text,
  p_request_id uuid
)
returns table (
  request_id uuid,
  operation text,
  application_batch_id uuid,
  application_record_id uuid,
  status text,
  batch_version integer,
  response_message_id uuid,
  responded_at timestamptz,
  replayed boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_operation text := 'hall_of_fame.application.additional_info.respond';
  v_response text := case when p_response is null then null
    else pg_catalog.btrim(p_response) end;
  v_original public.hall_of_fame_application_messages%rowtype;
  v_batch public.hall_of_fame_application_batches%rowtype;
  v_payload_fingerprint bytea;
  v_claim record;
  v_response_message_id uuid;
  v_responded_at timestamptz := pg_catalog.now();
  v_club_id uuid;
  v_result jsonb;
begin
  perform private.lock_active_hall_of_fame_actor(v_actor_user_id);

  if p_additional_info_request_message_id is null
     or p_expected_batch_version is null
     or p_expected_batch_version < 1
     or p_request_id is null
     or v_response is null
     or v_response = ''
     or pg_catalog.char_length(v_response) > 2000 then
    raise exception 'HOF_INVALID_ADDITIONAL_INFO_RESPONSE'
      using errcode = '22023';
  end if;

  perform private.lock_hall_of_fame_mutation_request(
    v_actor_user_id,
    p_request_id
  );

  select request_message.*
    into v_original
  from public.hall_of_fame_application_messages as request_message
  where request_message.id = p_additional_info_request_message_id
    and request_message.message_type = 'additional_info_request'
    and request_message.recipient_user_id = v_actor_user_id;

  if not found then
    raise exception 'HOF_ADDITIONAL_INFO_RESPONSE_NOT_AUTHORIZED'
      using errcode = '42501';
  end if;

  v_payload_fingerprint := extensions.digest(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'additional_info_request_message_id',
          p_additional_info_request_message_id,
        'expected_batch_version', p_expected_batch_version,
        'response', v_response
      )::text,
      'UTF8'
    ),
    'sha256'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_original.application_batch_id::text, 8608)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_original.application_batch_id::text, 8610)
  );

  select *
    into v_claim
  from private.hall_of_fame_claim_request(
    v_actor_user_id,
    p_request_id,
    v_operation,
    v_original.application_batch_id,
    v_original.application_record_id,
    v_actor_user_id,
    v_payload_fingerprint
  );

  if v_claim.replayed then
    return query select
      p_request_id,
      v_claim.result_payload ->> 'operation',
      (v_claim.result_payload ->> 'application_batch_id')::uuid,
      nullif(
        v_claim.result_payload ->> 'application_record_id', ''
      )::uuid,
      v_claim.result_payload ->> 'status',
      (v_claim.result_payload ->> 'batch_version')::integer,
      (v_claim.result_payload ->> 'response_message_id')::uuid,
      (v_claim.result_payload ->> 'responded_at')::timestamptz,
      true;
    return;
  end if;

  select batch.*
    into v_batch
  from public.hall_of_fame_application_batches as batch
  where batch.id = v_original.application_batch_id
  for update;

  if not found
     or v_batch.status <> 'additional_info_required'
     or v_batch.version <> p_expected_batch_version then
    raise exception 'HOF_ADDITIONAL_INFO_RESPONSE_STATE_INVALID'
      using errcode = 'PT409';
  end if;

  if v_original.application_record_id is not null then
    perform record.id
    from public.hall_of_fame_application_records as record
    where record.id = v_original.application_record_id
      and record.application_batch_id = v_batch.id
      and record.review_status = 'additional_info_required'
    for update;

    if not found then
      raise exception 'HOF_ADDITIONAL_INFO_RESPONSE_STATE_INVALID'
        using errcode = 'PT409';
    end if;
  end if;

  perform request_message.id
  from public.hall_of_fame_application_messages as request_message
  where request_message.id = v_original.id
    and request_message.application_batch_id = v_batch.id
    and request_message.recipient_user_id = v_actor_user_id
    and request_message.message_type = 'additional_info_request'
  for update;

  if not found then
    raise exception 'HOF_ADDITIONAL_INFO_RESPONSE_NOT_AUTHORIZED'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.hall_of_fame_application_messages as response
    where response.reply_to_message_id = v_original.id
      and response.message_type = 'applicant_response'
  ) then
    raise exception 'HOF_ADDITIONAL_INFO_ALREADY_RESPONDED'
      using errcode = 'PT409';
  end if;

  insert into public.hall_of_fame_application_messages (
    application_batch_id,
    application_record_id,
    message_type,
    body,
    created_by_user_id,
    created_by_platform_role,
    recipient_user_id,
    reply_to_message_id,
    request_kind,
    requested_evidence_type,
    request_id,
    created_at
  ) values (
    v_batch.id,
    v_original.application_record_id,
    'applicant_response',
    v_response,
    v_actor_user_id,
    null,
    null,
    v_original.id,
    null,
    null,
    p_request_id,
    v_responded_at
  ) returning id into v_response_message_id;

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
    'hall_of_fame_application_message',
    v_response_message_id::text,
    case when v_club_id is null then null else v_club_id::text end,
    null,
    pg_catalog.jsonb_build_object(
      'response_recorded', true,
      'batch_version', v_batch.version
    ),
    pg_catalog.jsonb_build_object(
      'application_batch_id', v_batch.id,
      'application_record_id', v_original.application_record_id,
      'additional_info_request_message_id', v_original.id,
      'response_message_id', v_response_message_id
    ),
    p_request_id,
    'success'
  );

  v_result := pg_catalog.jsonb_build_object(
    'operation', v_operation,
    'application_batch_id', v_batch.id,
    'application_record_id', v_original.application_record_id,
    'status', v_batch.status,
    'batch_version', v_batch.version,
    'response_message_id', v_response_message_id,
    'responded_at', v_responded_at
  );

  perform private.complete_hall_of_fame_request(
    v_actor_user_id, p_request_id, v_operation,
    v_batch.id, v_original.application_record_id,
    v_payload_fingerprint, v_result
  );

  return query select
    p_request_id, v_operation, v_batch.id,
    v_original.application_record_id, v_batch.status, v_batch.version,
    v_response_message_id, v_responded_at, false;
end;
$$;

create function public.resubmit_hall_of_fame_application(
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
  submitted_at timestamptz,
  resubmitted_record_count integer,
  resubmitted_at timestamptz,
  replayed boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_operation text := 'hall_of_fame.application.resubmit';
  v_payload_fingerprint bytea;
  v_claim record;
  v_batch public.hall_of_fame_application_batches%rowtype;
  v_actor_membership_id uuid;
  v_record_count integer;
  v_updated_record_count integer;
  v_new_batch_version integer;
  v_resubmitted_at timestamptz := pg_catalog.now();
  v_club_id uuid;
  v_result jsonb;
begin
  perform private.lock_active_hall_of_fame_actor(v_actor_user_id);

  if p_application_batch_id is null
     or p_expected_batch_version is null
     or p_expected_batch_version < 1
     or p_request_id is null then
    raise exception 'HOF_INVALID_RESUBMISSION_REQUEST' using errcode = '22023';
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
      (v_claim.result_payload ->> 'submitted_at')::timestamptz,
      (v_claim.result_payload ->> 'resubmitted_record_count')::integer,
      (v_claim.result_payload ->> 'resubmitted_at')::timestamptz,
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
    raise exception 'HOF_RESUBMISSION_NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if v_batch.status <> 'additional_info_required' then
    raise exception 'HOF_APPLICATION_NOT_ADDITIONAL_INFO_REQUIRED'
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

  v_record_count := private.validate_hall_of_fame_application_readiness(
    v_actor_user_id,
    p_application_batch_id,
    'additional_info_required'
  );
  perform private.assert_hall_of_fame_additional_info_satisfied(
    p_application_batch_id
  );

  v_actor_membership_id := v_batch.created_by_membership_id;

  update public.hall_of_fame_application_batches as batch
  set
    status = 'submitted',
    version = batch.version + 1,
    updated_at = v_resubmitted_at
  where batch.id = p_application_batch_id
    and batch.status = 'additional_info_required'
    and batch.version = p_expected_batch_version
  returning batch.version into v_new_batch_version;

  if not found then
    raise exception 'HOF_STALE_VERSION' using errcode = 'PT409';
  end if;

  update public.hall_of_fame_application_records as record
  set
    review_status = 'submitted',
    version = record.version + 1,
    updated_at = v_resubmitted_at
  where record.application_batch_id = p_application_batch_id
    and record.review_status = 'additional_info_required';

  get diagnostics v_updated_record_count = row_count;
  if v_updated_record_count <> v_record_count then
    raise exception 'HOF_RESUBMISSION_RECORD_COUNT_MISMATCH'
      using errcode = 'PT409';
  end if;

  insert into public.hall_of_fame_application_history (
    scope, application_batch_id, application_record_id,
    from_status, to_status, version, actor_user_id,
    actor_membership_id, actor_platform_role, action, request_id
  ) values (
    'batch', p_application_batch_id, null,
    'additional_info_required', 'submitted', v_new_batch_version,
    v_actor_user_id, v_actor_membership_id, null, v_operation, p_request_id
  );

  insert into public.hall_of_fame_application_history (
    scope, application_batch_id, application_record_id,
    from_status, to_status, version, actor_user_id,
    actor_membership_id, actor_platform_role, action, request_id
  )
  select
    'record', record.application_batch_id, record.id,
    'additional_info_required', 'submitted', record.version,
    v_actor_user_id, v_actor_membership_id, null, v_operation, p_request_id
  from public.hall_of_fame_application_records as record
  where record.application_batch_id = p_application_batch_id
    and record.review_status = 'submitted'
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
      'status', 'additional_info_required',
      'version', p_expected_batch_version
    ),
    pg_catalog.jsonb_build_object(
      'status', 'submitted',
      'version', v_new_batch_version,
      'resubmitted_record_count', v_record_count
    ),
    pg_catalog.jsonb_build_object(
      'application_batch_id', p_application_batch_id,
      'submitted_at_preserved', true
    ),
    p_request_id,
    'success'
  );

  v_result := pg_catalog.jsonb_build_object(
    'operation', v_operation,
    'application_batch_id', p_application_batch_id,
    'status', 'submitted',
    'batch_version', v_new_batch_version,
    'submitted_at', v_batch.submitted_at,
    'resubmitted_record_count', v_record_count,
    'resubmitted_at', v_resubmitted_at
  );

  perform private.complete_hall_of_fame_request(
    v_actor_user_id, p_request_id, v_operation,
    p_application_batch_id, null, v_payload_fingerprint, v_result
  );

  return query select
    p_request_id, v_operation, p_application_batch_id,
    'submitted'::text, v_new_batch_version, v_batch.submitted_at,
    v_record_count, v_resubmitted_at, false;
end;
$$;

create or replace function public.get_hall_of_fame_evidence_upload_context_server(
  p_actor_user_id uuid,
  p_evidence_id uuid
)
returns table (
  evidence_id uuid,
  storage_bucket text,
  storage_path text,
  declared_mime_type text,
  declared_byte_size bigint,
  upload_expires_at timestamptz,
  evidence_version integer,
  batch_version integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_evidence public.hall_of_fame_evidence_files%rowtype;
  v_auth record;
begin
  perform private.require_hall_of_fame_service_role();
  perform private.lock_active_hall_of_fame_actor(p_actor_user_id);

  select evidence.*
    into v_evidence
  from public.hall_of_fame_evidence_files as evidence
  where evidence.id = p_evidence_id
  for share;

  if not found
     or v_evidence.status <> 'pending_upload'
     or v_evidence.upload_expires_at <= pg_catalog.now()
     or v_evidence.uploaded_by_user_id <> p_actor_user_id then
    raise exception 'HOF_EVIDENCE_UPLOAD_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  if v_evidence.additional_info_request_message_id is null then
    select *
      into v_auth
    from private.lock_and_authorize_hall_of_fame_evidence_edit(
      p_actor_user_id,
      v_evidence.application_record_id,
      null
    );
  else
    select *
      into v_auth
    from private.lock_and_authorize_hall_of_fame_supplemental_evidence(
      p_actor_user_id,
      p_evidence_id,
      null
    );
  end if;

  return query select
    v_evidence.id,
    v_evidence.storage_bucket,
    v_evidence.storage_path,
    v_evidence.declared_mime_type,
    v_evidence.declared_byte_size,
    v_evidence.upload_expires_at,
    v_evidence.version,
    v_auth.batch_version;
end;
$$;

create or replace function public.finalize_hall_of_fame_evidence_server(
  p_actor_user_id uuid,
  p_evidence_id uuid,
  p_verified_mime_type text,
  p_verified_size_bytes bigint,
  p_verified_sha256_hex text,
  p_expected_evidence_version integer,
  p_expected_batch_version integer,
  p_request_id uuid
)
returns table (
  application_batch_id uuid,
  application_record_id uuid,
  evidence_id uuid,
  status text,
  evidence_version integer,
  batch_version integer,
  record_version integer,
  replaced_evidence_id uuid,
  replayed boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_is_supplemental boolean;
begin
  perform private.require_hall_of_fame_service_role();

  select evidence.additional_info_request_message_id is not null
    into v_is_supplemental
  from public.hall_of_fame_evidence_files as evidence
  where evidence.id = p_evidence_id;

  if not found then
    raise exception 'HOF_EVIDENCE_CONTEXT_NOT_FOUND';
  end if;

  if v_is_supplemental then
    v_result := private.execute_hall_of_fame_supplemental_evidence_finalize(
      p_actor_user_id,
      p_evidence_id,
      p_verified_mime_type,
      p_verified_size_bytes,
      p_verified_sha256_hex,
      p_expected_evidence_version,
      p_expected_batch_version,
      p_request_id
    );
  else
    v_result := private.execute_hall_of_fame_evidence_mutation(
      p_actor_user_id,
      'hall_of_fame.evidence.finalize',
      null,
      p_evidence_id,
      null,
      p_verified_mime_type,
      p_verified_size_bytes,
      p_verified_sha256_hex,
      p_expected_evidence_version,
      p_expected_batch_version,
      p_request_id
    );
  end if;

  return query select
    (v_result ->> 'application_batch_id')::uuid,
    (v_result ->> 'application_record_id')::uuid,
    (v_result ->> 'evidence_id')::uuid,
    v_result ->> 'status',
    (v_result ->> 'evidence_version')::integer,
    (v_result ->> 'batch_version')::integer,
    (v_result ->> 'record_version')::integer,
    nullif(v_result ->> 'replaces_evidence_id', '')::uuid,
    coalesce((v_result ->> 'replayed')::boolean, false);
end;
$$;

revoke all on function public.request_hall_of_fame_additional_info(
  uuid, integer, uuid, uuid, text, text, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.request_hall_of_fame_additional_info(
  uuid, integer, uuid, uuid, text, text, text, uuid
) to authenticated;

revoke all on function public.respond_to_hall_of_fame_additional_info(
  uuid, integer, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.respond_to_hall_of_fame_additional_info(
  uuid, integer, text, uuid
) to authenticated;

revoke all on function public.resubmit_hall_of_fame_application(
  uuid, integer, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.resubmit_hall_of_fame_application(
  uuid, integer, uuid
) to authenticated;

revoke all on function public.get_hall_of_fame_evidence_upload_context_server(
  uuid, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.get_hall_of_fame_evidence_upload_context_server(
  uuid, uuid
) to service_role;

revoke all on function public.finalize_hall_of_fame_evidence_server(
  uuid, uuid, text, bigint, text, integer, integer, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.finalize_hall_of_fame_evidence_server(
  uuid, uuid, text, bigint, text, integer, integer, uuid
) to service_role;

comment on function public.request_hall_of_fame_additional_info(
  uuid, integer, uuid, uuid, text, text, text, uuid
) is
  'Creates one explicit-recipient additional-information request and atomically enters AIR on the first request.';

comment on function public.respond_to_hall_of_fame_additional_info(
  uuid, integer, text, uuid
) is
  'Appends one canonical response by the exact additional-information request recipient without changing versions.';

comment on function public.resubmit_hall_of_fame_application(
  uuid, integer, uuid
) is
  'Revalidates current eligibility and every active AIR request before atomically returning the application to submitted.';

comment on function public.get_hall_of_fame_evidence_upload_context_server(
  uuid, uuid
) is
  'Service-only upload context for either an authorized draft intent or an exact request-linked AIR supplemental intent.';

comment on function public.finalize_hall_of_fame_evidence_server(
  uuid, uuid, text, bigint, text, integer, integer, uuid
) is
  'Service-only finalization preserving the draft lifecycle while admitting exact request-linked AIR supplemental Evidence.';
