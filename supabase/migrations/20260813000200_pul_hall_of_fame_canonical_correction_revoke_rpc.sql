-- PUL 8-6-B-3-5A: canonical correction successors and terminal revocation.
-- The predecessor remains the immutable factual snapshot; correction creates a
-- same-source, same-target active successor and revocation remains terminal.

alter table public.hall_of_fame_records
  drop constraint hall_of_fame_records_source_application_record_id_key;

-- Preserve the historical constraint/index name so the existing final-decision
-- RPC continues mapping source conflicts to HOF_DUPLICATE_RECORD.
create unique index hall_of_fame_records_source_application_record_id_key
  on public.hall_of_fame_records (source_application_record_id)
  where validity_status = 'active';

alter table public.hall_of_fame_records
  add column revocation_reason_code text,
  drop constraint hall_of_fame_records_revocation_check,
  drop constraint hall_of_fame_records_revocation_reason_check,
  drop constraint hall_of_fame_records_timeline_check;

alter table public.hall_of_fame_records
  add constraint hall_of_fame_records_revocation_check
    check (
      (
        validity_status in ('active', 'provisional', 'corrected')
        and revoked_at is null
        and revoked_by_user_id is null
        and revocation_reason_code is null
        and revocation_reason is null
      )
      or (
        validity_status = 'revoked'
        and publication_status = 'suppressed'
        and revoked_at is not null
        and revoked_by_user_id is not null
        and revocation_reason_code in (
          'factual_error',
          'insufficient_or_invalid_evidence',
          'duplicate_record',
          'wrong_subject',
          'wrong_record_type',
          'administrative_error',
          'fraud_confirmed'
        )
        and revocation_reason is not null
      )
    ),
  add constraint hall_of_fame_records_revocation_reason_check
    check (
      revocation_reason is null
      or (
        revocation_reason = pg_catalog.btrim(revocation_reason)
        and pg_catalog.char_length(revocation_reason) between 2 and 1000
      )
    ),
  add constraint hall_of_fame_records_timeline_check
    check (
      (
        (
          corrected_from_record_id is null
          and approved_at >= created_at
        )
        or (
          corrected_from_record_id is not null
          and approved_at <= created_at
        )
      )
      and updated_at >= created_at
      and (published_at is null or published_at >= approved_at)
      and (revoked_at is null or revoked_at >= approved_at)
    );

alter table public.hall_of_fame_record_history
  add column reason_code text;

alter table public.hall_of_fame_record_history
  add constraint hall_of_fame_record_history_reason_code_check
    check (
      (
        action in (
          'hall_of_fame.record.corrected',
          'hall_of_fame.record.correction_successor_created'
        )
        and reason_code in (
          'factual_error',
          'wrong_record_type',
          'administrative_error',
          'evidence_clarification'
        )
        and reason is not null
        and reason = pg_catalog.btrim(reason)
        and pg_catalog.char_length(reason) between 2 and 1000
      )
      or (
        action = 'hall_of_fame.record.revoked'
        and reason_code in (
          'factual_error',
          'insufficient_or_invalid_evidence',
          'duplicate_record',
          'wrong_subject',
          'wrong_record_type',
          'administrative_error',
          'fraud_confirmed'
        )
        and reason is not null
        and reason = pg_catalog.btrim(reason)
        and pg_catalog.char_length(reason) between 2 and 1000
      )
      or (
        action not in (
          'hall_of_fame.record.corrected',
          'hall_of_fame.record.correction_successor_created',
          'hall_of_fame.record.revoked'
        )
        and reason_code is null
      )
    );

create function private.enforce_hall_of_fame_canonical_lineage()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_predecessor public.hall_of_fame_records%rowtype;
  v_cycle boolean;
begin
  if new.corrected_from_record_id is null then
    return new;
  end if;

  select predecessor.*
    into v_predecessor
  from public.hall_of_fame_records as predecessor
  where predecessor.id = new.corrected_from_record_id;

  if not found then
    raise exception 'HOF_CORRECTION_PREDECESSOR_NOT_FOUND'
      using errcode = '23503';
  end if;

  if v_predecessor.source_application_record_id
       <> new.source_application_record_id
     or v_predecessor.target_user_id <> new.target_user_id then
    raise exception 'HOF_CORRECTION_LINEAGE_MISMATCH'
      using errcode = '23514';
  end if;

  if v_predecessor.validity_status <> 'corrected'
     or v_predecessor.publication_status <> 'suppressed' then
    raise exception 'HOF_CORRECTION_PREDECESSOR_STATE_INVALID'
      using errcode = '23514';
  end if;

  with recursive lineage(id, corrected_from_record_id, visited) as (
    select predecessor.id,
      predecessor.corrected_from_record_id,
      array[predecessor.id]
    from public.hall_of_fame_records as predecessor
    where predecessor.id = new.corrected_from_record_id
    union all
    select ancestor.id,
      ancestor.corrected_from_record_id,
      lineage.visited || ancestor.id
    from lineage
    join public.hall_of_fame_records as ancestor
      on ancestor.id = lineage.corrected_from_record_id
    where not ancestor.id = any(lineage.visited)
      and pg_catalog.cardinality(lineage.visited) < 1000
  )
  select coalesce(
    pg_catalog.bool_or(
      lineage.id = new.id
      or lineage.corrected_from_record_id = new.id
      or (
        pg_catalog.cardinality(lineage.visited) >= 1000
        and lineage.corrected_from_record_id is not null
      )
    ),
    false
  )
    into v_cycle
  from lineage;

  if v_cycle then
    raise exception 'HOF_CORRECTION_LINEAGE_CYCLE'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function private.enforce_hall_of_fame_canonical_lineage() is
  'Enforces same-source, same-target, acyclic correction successor lineage against a corrected predecessor.';

revoke all on function private.enforce_hall_of_fame_canonical_lineage()
  from public, anon, authenticated, service_role;

create trigger hall_of_fame_records_lineage_invariants_before_mutation
before insert or update of corrected_from_record_id,
  source_application_record_id, target_user_id
on public.hall_of_fame_records
for each row execute function private.enforce_hall_of_fame_canonical_lineage();

create function private.enforce_guarded_hall_of_fame_canonical_lifecycle_mutation()
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
  v_application_record uuid;
  v_canonical uuid;
  v_successor uuid;
  v_operation text;
  v_fingerprint text;
  v_reason_code text;
  v_reason text;
  v_target uuid;
  v_record_type text;
  v_approved_by uuid;
  v_approved_at timestamptz;
  v_successor_record_type text;
begin
  if tg_op = 'DELETE' then
    raise exception 'HOF_DIRECT_DELETE_FORBIDDEN' using errcode = '42501';
  end if;

  begin
    v_actor := nullif(pg_catalog.current_setting('pul.hall_of_fame.actor_user_id', true), '')::uuid;
    v_request := nullif(pg_catalog.current_setting('pul.hall_of_fame.request_id', true), '')::uuid;
    v_batch := nullif(pg_catalog.current_setting('pul.hall_of_fame.application_batch_id', true), '')::uuid;
    v_application_record := nullif(pg_catalog.current_setting('pul.hall_of_fame.application_record_id', true), '')::uuid;
    v_canonical := nullif(pg_catalog.current_setting('pul.hall_of_fame.canonical_record_id', true), '')::uuid;
    v_successor := nullif(pg_catalog.current_setting('pul.hall_of_fame.successor_record_id', true), '')::uuid;
  exception
    when invalid_text_representation then
      raise exception 'HOF_INVALID_CANONICAL_LIFECYCLE_CONTEXT' using errcode = '42501';
  end;
  v_operation := nullif(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '');
  v_fingerprint := nullif(pg_catalog.current_setting('pul.hall_of_fame.payload_fingerprint', true), '');
  v_reason_code := nullif(pg_catalog.current_setting('pul.hall_of_fame.reason_code', true), '');
  v_reason := nullif(pg_catalog.current_setting('pul.hall_of_fame.reason', true), '');

  if v_actor is null
     or v_request is null
     or v_batch is null
     or v_application_record is null
     or v_canonical is null
     or v_operation not in (
       'hall_of_fame.record.correct',
       'hall_of_fame.record.revoke'
     )
     or v_fingerprint is null
     or v_reason_code is null
     or v_reason is null
     or auth.uid() is distinct from v_actor then
    raise exception 'HOF_CANONICAL_LIFECYCLE_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  select canonical.target_user_id, canonical.record_type_code,
    canonical.approved_by_user_id, canonical.approved_at
    into v_target, v_record_type, v_approved_by, v_approved_at
  from public.hall_of_fame_records as canonical
  where canonical.id = v_canonical
    and canonical.source_application_record_id = v_application_record;
  if not found then
    raise exception 'HOF_CANONICAL_LIFECYCLE_CONTEXT_MISMATCH' using errcode = '42501';
  end if;

  if tg_table_schema = 'private'
     and tg_table_name = 'hall_of_fame_mutation_requests' then
    if tg_op = 'INSERT' then
      if new.actor_user_id <> v_actor
         or new.request_id <> v_request
         or new.operation <> v_operation
         or new.application_batch_id <> v_batch
         or new.application_record_id <> v_application_record
         or new.target_user_id <> v_target
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
       or old.application_record_id <> v_application_record
       or old.target_user_id <> v_target
       or pg_catalog.encode(old.payload_fingerprint, 'hex') <> v_fingerprint
       or new.id <> old.id
       or new.actor_user_id <> old.actor_user_id
       or new.request_id <> old.request_id
       or new.operation <> old.operation
       or new.application_batch_id <> old.application_batch_id
       or new.application_record_id <> old.application_record_id
       or new.target_user_id <> old.target_user_id
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
    raise exception 'HOF_CANONICAL_LIFECYCLE_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  if tg_table_schema = 'public' and tg_table_name = 'hall_of_fame_records' then
    if v_operation = 'hall_of_fame.record.correct' then
      if tg_op = 'UPDATE' then
        if old.id <> v_canonical
           or new.id <> old.id
           or (
             pg_catalog.to_jsonb(new)
               - 'validity_status' - 'publication_status' - 'suppression_reason'
               - 'version' - 'updated_at'
           ) is distinct from (
             pg_catalog.to_jsonb(old)
               - 'validity_status' - 'publication_status' - 'suppression_reason'
               - 'version' - 'updated_at'
           )
           or old.validity_status <> 'active'
           or new.validity_status <> 'corrected'
           or new.publication_status <> 'suppressed'
           or new.suppression_reason <> 'Canonical record corrected.'
           or new.version <> old.version + 1
           or new.updated_at <> pg_catalog.now() then
          raise exception 'HOF_CANONICAL_CORRECTION_CONTEXT_MISMATCH' using errcode = '42501';
        end if;
        return new;
      end if;

      if tg_op <> 'INSERT'
         or v_successor is null
         or new.id <> v_successor
         or new.corrected_from_record_id <> v_canonical
         or new.source_application_record_id <> v_application_record
         or new.target_user_id <> v_target
         or new.fingerprint_version <> 1
         or new.validity_status <> 'active'
         or new.publication_status not in ('hidden', 'suppressed')
         or (
           new.publication_status = 'hidden'
           and (
             new.published_at is not null
             or new.suppression_reason is not null
           )
         )
         or (
           new.publication_status = 'suppressed'
           and (
             new.published_at is not null
             or new.suppression_reason is null
           )
         )
         or new.revoked_at is not null
         or new.revoked_by_user_id is not null
         or new.revocation_reason_code is not null
         or new.revocation_reason is not null
         or new.approved_by_user_id <> v_approved_by
         or new.approved_at <> v_approved_at
         or new.version <> 1
         or new.created_at <> pg_catalog.now()
         or new.updated_at <> pg_catalog.now() then
        raise exception 'HOF_CANONICAL_CORRECTION_CONTEXT_MISMATCH' using errcode = '42501';
      end if;
      return new;
    end if;

    if tg_op <> 'UPDATE'
       or old.id <> v_canonical
       or new.id <> old.id
       or (
         pg_catalog.to_jsonb(new)
           - 'validity_status' - 'publication_status' - 'suppression_reason'
           - 'revoked_at' - 'revoked_by_user_id' - 'revocation_reason_code'
           - 'revocation_reason' - 'version' - 'updated_at'
       ) is distinct from (
         pg_catalog.to_jsonb(old)
           - 'validity_status' - 'publication_status' - 'suppression_reason'
           - 'revoked_at' - 'revoked_by_user_id' - 'revocation_reason_code'
           - 'revocation_reason' - 'version' - 'updated_at'
       )
       or old.validity_status <> 'active'
       or new.validity_status <> 'revoked'
       or new.publication_status <> 'suppressed'
       or new.suppression_reason <> 'Canonical record revoked.'
       or new.revoked_at <> pg_catalog.now()
       or new.revoked_by_user_id <> v_actor
       or new.revocation_reason_code <> v_reason_code
       or new.revocation_reason <> v_reason
       or new.version <> old.version + 1
       or new.updated_at <> pg_catalog.now() then
      raise exception 'HOF_CANONICAL_REVOKE_CONTEXT_MISMATCH' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_table_schema = 'public'
     and tg_table_name = 'hall_of_fame_badge_sources' then
    if tg_op = 'UPDATE' then
      if old.record_id <> v_canonical
         or new.id <> old.id
         or new.target_user_id <> old.target_user_id
         or new.badge_code <> old.badge_code
         or new.record_id <> old.record_id
         or new.activated_at <> old.activated_at
         or new.created_at <> old.created_at
         or old.status <> 'active'
         or new.status <> 'inactive'
         or new.deactivated_at <> pg_catalog.now()
         or new.deactivation_reason is distinct from (case
           when v_operation = 'hall_of_fame.record.correct'
             then 'Canonical record corrected.'
           else 'Canonical record revoked.'
         end) then
        raise exception 'HOF_BADGE_SOURCE_CONTEXT_MISMATCH' using errcode = '42501';
      end if;
      return new;
    end if;

    select successor.record_type_code
      into v_successor_record_type
    from public.hall_of_fame_records as successor
    where successor.id = v_successor
      and successor.corrected_from_record_id = v_canonical;

    if v_operation <> 'hall_of_fame.record.correct'
       or tg_op <> 'INSERT'
       or v_successor is null
       or v_successor_record_type is null
       or new.record_id <> v_successor
       or new.target_user_id <> v_target
       or new.status <> 'active'
       or new.activated_at <> pg_catalog.now()
       or new.deactivated_at is not null
       or new.deactivation_reason is not null
       or new.created_at <> pg_catalog.now()
       or new.badge_code not in (v_successor_record_type, 'hall_of_fame_inductee') then
      raise exception 'HOF_BADGE_SOURCE_CONTEXT_MISMATCH' using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'HOF_MUTATION_RPC_REQUIRED' using errcode = '42501';
end;
$$;

comment on function private.enforce_guarded_hall_of_fame_canonical_lifecycle_mutation() is
  'Binds correction and revocation ledger, canonical, and badge writes to one exact authenticated RPC context.';

revoke all on function private.enforce_guarded_hall_of_fame_canonical_lifecycle_mutation()
  from public, anon, authenticated, service_role;

create function private.enforce_hall_of_fame_canonical_lifecycle_history_append()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_request uuid;
  v_canonical uuid;
  v_successor uuid;
  v_operation text;
  v_reason_code text;
  v_reason text;
  v_record public.hall_of_fame_records%rowtype;
begin
  if tg_op <> 'INSERT' then
    raise exception 'HOF_APPEND_ONLY_MUTATION_FORBIDDEN' using errcode = '42501';
  end if;

  begin
    v_actor := nullif(pg_catalog.current_setting('pul.hall_of_fame.actor_user_id', true), '')::uuid;
    v_request := nullif(pg_catalog.current_setting('pul.hall_of_fame.request_id', true), '')::uuid;
    v_canonical := nullif(pg_catalog.current_setting('pul.hall_of_fame.canonical_record_id', true), '')::uuid;
    v_successor := nullif(pg_catalog.current_setting('pul.hall_of_fame.successor_record_id', true), '')::uuid;
  exception
    when invalid_text_representation then
      raise exception 'HOF_INVALID_CANONICAL_HISTORY_CONTEXT' using errcode = '42501';
  end;
  v_operation := nullif(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '');
  v_reason_code := nullif(pg_catalog.current_setting('pul.hall_of_fame.reason_code', true), '');
  v_reason := nullif(pg_catalog.current_setting('pul.hall_of_fame.reason', true), '');

  if v_actor is null
     or v_request is null
     or v_canonical is null
     or v_operation not in (
       'hall_of_fame.record.correct',
       'hall_of_fame.record.revoke'
     )
     or v_reason_code is null
     or v_reason is null
     or auth.uid() is distinct from v_actor
     or not private.hall_of_fame_mutation_context_is_valid()
     or new.actor_user_id <> v_actor
     or new.request_id <> v_request
     or new.reason_code <> v_reason_code
     or new.reason <> v_reason then
    raise exception 'HOF_CANONICAL_HISTORY_CONTEXT_MISMATCH' using errcode = '42501';
  end if;

  select canonical.*
    into v_record
  from public.hall_of_fame_records as canonical
  where canonical.id = new.record_id;
  if not found
     or new.version <> v_record.version
     or new.to_validity_status <> v_record.validity_status
     or new.to_publication_status <> v_record.publication_status then
    raise exception 'HOF_CANONICAL_HISTORY_CONTEXT_MISMATCH' using errcode = '42501';
  end if;

  if v_operation = 'hall_of_fame.record.correct'
     and new.record_id = v_canonical then
    if new.from_validity_status <> 'active'
       or new.to_validity_status <> 'corrected'
       or new.from_publication_status not in ('hidden', 'published', 'suppressed')
       or new.to_publication_status <> 'suppressed'
       or new.action <> 'hall_of_fame.record.corrected'
       or not exists (
         select 1
         from public.hall_of_fame_record_history as previous_history
         where previous_history.record_id = new.record_id
           and previous_history.version = new.version - 1
           and previous_history.to_validity_status = new.from_validity_status
           and previous_history.to_publication_status = new.from_publication_status
       ) then
      raise exception 'HOF_CANONICAL_HISTORY_CONTEXT_MISMATCH' using errcode = '42501';
    end if;
    return new;
  end if;

  if v_operation = 'hall_of_fame.record.correct'
     and v_successor is not null
     and new.record_id = v_successor then
    if new.version <> 1
       or new.from_validity_status is not null
       or new.to_validity_status <> 'active'
       or new.from_publication_status is not null
       or new.to_publication_status not in ('hidden', 'suppressed')
       or new.action <> 'hall_of_fame.record.correction_successor_created'
       or v_record.corrected_from_record_id <> v_canonical then
      raise exception 'HOF_CANONICAL_HISTORY_CONTEXT_MISMATCH' using errcode = '42501';
    end if;
    return new;
  end if;

  if v_operation = 'hall_of_fame.record.revoke'
     and new.record_id = v_canonical then
    if new.from_validity_status <> 'active'
       or new.to_validity_status <> 'revoked'
       or new.from_publication_status not in ('hidden', 'published', 'suppressed')
       or new.to_publication_status <> 'suppressed'
       or new.action <> 'hall_of_fame.record.revoked'
       or not exists (
         select 1
         from public.hall_of_fame_record_history as previous_history
         where previous_history.record_id = new.record_id
           and previous_history.version = new.version - 1
           and previous_history.to_validity_status = new.from_validity_status
           and previous_history.to_publication_status = new.from_publication_status
       ) then
      raise exception 'HOF_CANONICAL_HISTORY_CONTEXT_MISMATCH' using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'HOF_CANONICAL_HISTORY_CONTEXT_MISMATCH' using errcode = '42501';
end;
$$;

comment on function private.enforce_hall_of_fame_canonical_lifecycle_history_append() is
  'Validates append-only correction predecessor/successor and revocation history against transaction-current canonical state.';

revoke all on function private.enforce_hall_of_fame_canonical_lifecycle_history_append()
  from public, anon, authenticated, service_role;

-- Successor lineage permits multiple historical canonicals for one source.
-- Projection guards must therefore resolve only the unique current active row.
create or replace function private.enforce_guarded_hall_of_fame_projection_mutation()
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
  v_application_record uuid;
  v_operation text;
  v_fingerprint text;
  v_target uuid;
  v_canonical_id uuid;
  v_record_type text;
begin
  if tg_op = 'DELETE' then
    raise exception 'HOF_DIRECT_DELETE_FORBIDDEN' using errcode = '42501';
  end if;

  begin
    v_actor := nullif(pg_catalog.current_setting('pul.hall_of_fame.actor_user_id', true), '')::uuid;
    v_request := nullif(pg_catalog.current_setting('pul.hall_of_fame.request_id', true), '')::uuid;
    v_batch := nullif(pg_catalog.current_setting('pul.hall_of_fame.application_batch_id', true), '')::uuid;
    v_application_record := nullif(pg_catalog.current_setting('pul.hall_of_fame.application_record_id', true), '')::uuid;
  exception
    when invalid_text_representation then
      raise exception 'HOF_INVALID_PROJECTION_CONTEXT' using errcode = '42501';
  end;
  v_operation := nullif(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '');
  v_fingerprint := nullif(pg_catalog.current_setting('pul.hall_of_fame.payload_fingerprint', true), '');

  if v_actor is null
     or v_request is null
     or v_batch is null
     or v_application_record is null
     or v_operation not in (
       'hall_of_fame.record.projection.sync',
       'hall_of_fame.publication_consent.withdraw_after_approval'
     )
     or v_fingerprint is null
     or auth.uid() is distinct from v_actor then
    raise exception 'HOF_PROJECTION_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  select canonical.id, canonical.target_user_id, canonical.record_type_code
    into v_canonical_id, v_target, v_record_type
  from public.hall_of_fame_records as canonical
  where canonical.source_application_record_id = v_application_record
    and canonical.validity_status = 'active';

  if not found then
    raise exception 'HOF_PROJECTION_CONTEXT_MISMATCH' using errcode = '42501';
  end if;

  if tg_table_schema = 'private'
     and tg_table_name = 'hall_of_fame_mutation_requests' then
    if tg_op = 'INSERT' then
      if new.actor_user_id <> v_actor
         or new.request_id <> v_request
         or new.operation <> v_operation
         or new.application_batch_id <> v_batch
         or new.application_record_id <> v_application_record
         or new.target_user_id <> v_target
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
       or old.application_record_id <> v_application_record
       or old.target_user_id <> v_target
       or pg_catalog.encode(old.payload_fingerprint, 'hex') <> v_fingerprint
       or new.id <> old.id
       or new.actor_user_id <> old.actor_user_id
       or new.request_id <> old.request_id
       or new.operation <> old.operation
       or new.application_batch_id <> old.application_batch_id
       or new.application_record_id <> old.application_record_id
       or new.target_user_id <> old.target_user_id
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
    raise exception 'HOF_PROJECTION_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  if v_operation = 'hall_of_fame.record.projection.sync' then
    perform private.require_hall_of_fame_projection_admin(v_actor);
  elsif v_target <> v_actor then
    raise exception 'HOF_PUBLICATION_CONSENT_SUBJECT_REQUIRED' using errcode = '42501';
  end if;

  if tg_table_schema = 'public' and tg_table_name = 'hall_of_fame_records' then
    if tg_op <> 'UPDATE'
       or new.id <> v_canonical_id
       or new.source_application_record_id <> v_application_record
       or new.target_user_id <> v_target
       or (
         pg_catalog.to_jsonb(new)
           - 'publication_status' - 'published_at' - 'suppression_reason'
           - 'version' - 'updated_at'
       ) is distinct from (
         pg_catalog.to_jsonb(old)
           - 'publication_status' - 'published_at' - 'suppression_reason'
           - 'version' - 'updated_at'
       )
       or old.validity_status <> 'active'
       or new.validity_status <> 'active'
       or new.version <> old.version + 1
       or new.updated_at <> pg_catalog.now() then
      raise exception 'HOF_CANONICAL_PROJECTION_CONTEXT_MISMATCH' using errcode = '42501';
    end if;

    if v_operation = 'hall_of_fame.record.projection.sync' then
      if not (
        (
          old.publication_status = 'hidden'
          and new.publication_status = 'published'
          and old.published_at is null
          and new.published_at = pg_catalog.now()
          and new.suppression_reason is null
        )
        or (
          old.publication_status = 'published'
          and new.publication_status = 'suppressed'
          and new.published_at = old.published_at
          and new.suppression_reason = 'Publication consent is not currently effective.'
        )
      ) then
        raise exception 'HOF_CANONICAL_PROJECTION_CONTEXT_MISMATCH' using errcode = '42501';
      end if;
    elsif old.publication_status not in ('hidden', 'published')
       or new.publication_status <> 'suppressed'
       or new.published_at <> old.published_at
       or new.suppression_reason <> 'Publication consent withdrawn by subject.' then
      raise exception 'HOF_CANONICAL_PROJECTION_CONTEXT_MISMATCH' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_table_schema = 'public' and tg_table_name = 'hall_of_fame_badge_sources' then
    if v_operation <> 'hall_of_fame.record.projection.sync'
       or tg_op <> 'INSERT'
       or new.record_id <> v_canonical_id
       or new.target_user_id <> v_target
       or new.status <> 'active'
       or new.activated_at <> pg_catalog.now()
       or new.deactivated_at is not null
       or new.deactivation_reason is not null
       or new.created_at <> pg_catalog.now()
       or new.badge_code not in (v_record_type, 'hall_of_fame_inductee')
       or v_record_type not in ('hole_in_one', 'albatross', 'condor') then
      raise exception 'HOF_BADGE_SOURCE_CONTEXT_MISMATCH' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_table_schema = 'public'
     and tg_table_name = 'hall_of_fame_publication_consents' then
    if v_operation <> 'hall_of_fame.publication_consent.withdraw_after_approval'
       or tg_op <> 'UPDATE'
       or old.application_record_id <> v_application_record
       or old.target_user_id <> v_actor
       or new.application_record_id <> old.application_record_id
       or new.target_user_id <> old.target_user_id
       or new.created_at <> old.created_at
       or old.status <> 'granted'
       or new.status <> 'withdrawn'
       or new.version <> old.version + 1
       or new.policy_version is distinct from old.policy_version
       or new.display_name_consent
       or new.masked_display_name_consent
       or new.full_display_name_consent
       or new.avatar_consent
       or new.club_name_consent
       or new.record_date_consent
       or new.course_detail_consent
       or new.badge_consent
       or new.consented_at is distinct from old.consented_at
       or new.withdrawn_at <> pg_catalog.now()
       or new.updated_at <> pg_catalog.now()
       or new.last_actor_user_id <> v_actor
       or new.last_request_id <> v_request then
      raise exception 'HOF_PUBLICATION_CONSENT_CONTEXT_MISMATCH' using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'HOF_MUTATION_RPC_REQUIRED' using errcode = '42501';
end;
$$;

comment on function private.enforce_guarded_hall_of_fame_projection_mutation() is
  'Binds projection writes to the unique active canonical for a source after correction successor introduction.';

revoke all on function private.enforce_guarded_hall_of_fame_projection_mutation()
  from public, anon, authenticated, service_role;

create or replace function private.enforce_hall_of_fame_projection_history_append()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_request uuid;
  v_application_record uuid;
  v_operation text;
  v_canonical public.hall_of_fame_records%rowtype;
begin
  if tg_op <> 'INSERT' then
    raise exception 'HOF_APPEND_ONLY_MUTATION_FORBIDDEN' using errcode = '42501';
  end if;
  begin
    v_actor := nullif(pg_catalog.current_setting('pul.hall_of_fame.actor_user_id', true), '')::uuid;
    v_request := nullif(pg_catalog.current_setting('pul.hall_of_fame.request_id', true), '')::uuid;
    v_application_record := nullif(pg_catalog.current_setting('pul.hall_of_fame.application_record_id', true), '')::uuid;
  exception
    when invalid_text_representation then
      raise exception 'HOF_INVALID_PROJECTION_HISTORY_CONTEXT' using errcode = '42501';
  end;
  v_operation := nullif(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '');

  if v_actor is null
     or v_request is null
     or v_application_record is null
     or v_operation not in (
       'hall_of_fame.record.projection.sync',
       'hall_of_fame.publication_consent.withdraw_after_approval'
     )
     or auth.uid() is distinct from v_actor
     or not private.hall_of_fame_mutation_context_is_valid() then
    raise exception 'HOF_PROJECTION_HISTORY_CONTEXT_MISMATCH' using errcode = '42501';
  end if;

  select canonical.*
    into v_canonical
  from public.hall_of_fame_records as canonical
  where canonical.source_application_record_id = v_application_record
    and canonical.validity_status = 'active';

  if tg_table_name = 'hall_of_fame_record_history' then
    if not found
       or new.record_id <> v_canonical.id
       or new.version <> v_canonical.version
       or new.to_validity_status <> v_canonical.validity_status
       or new.to_publication_status <> v_canonical.publication_status
       or new.actor_user_id <> v_actor
       or new.request_id <> v_request
       or new.from_validity_status <> 'active'
       or new.to_validity_status <> 'active'
       or new.from_publication_status not in ('hidden', 'published')
       or new.to_publication_status not in ('published', 'suppressed')
       or new.action <> (case
         when new.to_publication_status = 'published'
           then 'hall_of_fame.record.published'
         else 'hall_of_fame.record.suppressed'
       end)
       or new.reason_code is not null
       or new.reason is distinct from (case
         when new.to_publication_status = 'published' then null
         when v_operation = 'hall_of_fame.publication_consent.withdraw_after_approval'
           then 'Publication consent withdrawn by subject.'
         else 'Publication consent is not currently effective.'
       end)
       or not exists (
         select 1
         from public.hall_of_fame_record_history as previous_history
         where previous_history.record_id = new.record_id
           and previous_history.version = new.version - 1
           and previous_history.to_validity_status = new.from_validity_status
           and previous_history.to_publication_status = new.from_publication_status
       ) then
      raise exception 'HOF_CANONICAL_HISTORY_CONTEXT_MISMATCH' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_table_name = 'hall_of_fame_publication_consent_history' then
    if v_operation <> 'hall_of_fame.publication_consent.withdraw_after_approval'
       or new.application_record_id <> v_application_record
       or new.target_user_id <> v_actor
       or new.actor_user_id <> v_actor
       or new.request_id <> v_request
       or new.from_status <> 'granted'
       or new.to_status <> 'withdrawn'
       or new.display_name_consent
       or new.masked_display_name_consent
       or new.full_display_name_consent
       or new.avatar_consent
       or new.club_name_consent
       or new.record_date_consent
       or new.course_detail_consent
       or new.badge_consent
       or not exists (
         select 1
         from public.hall_of_fame_publication_consents as consent
         where consent.application_record_id = new.application_record_id
           and consent.target_user_id = new.target_user_id
           and consent.status = new.to_status
           and consent.version = new.version
           and consent.policy_version is not distinct from new.policy_version
           and consent.last_actor_user_id = new.actor_user_id
           and consent.last_request_id = new.request_id
       )
       or not exists (
         select 1
         from public.hall_of_fame_publication_consent_history as previous_history
         where previous_history.application_record_id = new.application_record_id
           and previous_history.version = new.version - 1
           and previous_history.to_status = new.from_status
       ) then
      raise exception 'HOF_PUBLICATION_CONSENT_HISTORY_CONTEXT_MISMATCH' using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'HOF_MUTATION_RPC_REQUIRED' using errcode = '42501';
end;
$$;

comment on function private.enforce_hall_of_fame_projection_history_append() is
  'Validates projection history against the unique active canonical for the source after correction.';

revoke all on function private.enforce_hall_of_fame_projection_history_append()
  from public, anon, authenticated, service_role;

-- Extend deny-by-default routing only for the two canonical lifecycle operations.
drop trigger hall_of_fame_mutation_requests_guard_before_mutation
  on private.hall_of_fame_mutation_requests;
create trigger hall_of_fame_mutation_requests_guard_before_mutation
before insert or update or delete on private.hall_of_fame_mutation_requests
for each row when (
  coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '') not like 'hall_of_fame.evidence.%'
  and coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '') <> 'hall_of_fame.application.submit'
  and coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '') not in (
    'hall_of_fame.application.review.start',
    'hall_of_fame.application.review.note',
    'hall_of_fame.application.additional_info.request',
    'hall_of_fame.application.additional_info.respond',
    'hall_of_fame.application.resubmit',
    'hall_of_fame.application.withdraw',
    'hall_of_fame.nomination.participation.withdraw',
    'hall_of_fame.application.final_decision',
    'hall_of_fame.record.projection.sync',
    'hall_of_fame.publication_consent.withdraw_after_approval',
    'hall_of_fame.record.correct',
    'hall_of_fame.record.revoke'
  )
) execute function private.reject_hall_of_fame_mutation();
create trigger hall_of_fame_mutation_requests_canonical_lifecycle_guard
before insert or update or delete on private.hall_of_fame_mutation_requests
for each row when (
  coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '') in (
    'hall_of_fame.record.correct',
    'hall_of_fame.record.revoke'
  )
) execute function private.enforce_guarded_hall_of_fame_canonical_lifecycle_mutation();

drop trigger hall_of_fame_records_guard_before_mutation
  on public.hall_of_fame_records;
create trigger hall_of_fame_records_guard_before_mutation
before insert or update or delete on public.hall_of_fame_records
for each row when (
  coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '') not in (
    'hall_of_fame.application.final_decision',
    'hall_of_fame.record.projection.sync',
    'hall_of_fame.publication_consent.withdraw_after_approval',
    'hall_of_fame.record.correct',
    'hall_of_fame.record.revoke'
  )
) execute function private.reject_hall_of_fame_mutation();
create trigger hall_of_fame_records_canonical_lifecycle_guard
before insert or update or delete on public.hall_of_fame_records
for each row when (
  coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '') in (
    'hall_of_fame.record.correct',
    'hall_of_fame.record.revoke'
  )
) execute function private.enforce_guarded_hall_of_fame_canonical_lifecycle_mutation();

drop trigger hall_of_fame_badge_sources_guard_before_mutation
  on public.hall_of_fame_badge_sources;
create trigger hall_of_fame_badge_sources_guard_before_mutation
before insert or update or delete on public.hall_of_fame_badge_sources
for each row when (
  coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '') not in (
    'hall_of_fame.record.projection.sync',
    'hall_of_fame.record.correct',
    'hall_of_fame.record.revoke'
  )
) execute function private.reject_hall_of_fame_mutation();
create trigger hall_of_fame_badge_sources_canonical_lifecycle_guard
before insert or update or delete on public.hall_of_fame_badge_sources
for each row when (
  coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '') in (
    'hall_of_fame.record.correct',
    'hall_of_fame.record.revoke'
  )
) execute function private.enforce_guarded_hall_of_fame_canonical_lifecycle_mutation();

drop trigger hall_of_fame_record_history_guard_before_mutation
  on public.hall_of_fame_record_history;
create trigger hall_of_fame_record_history_guard_before_mutation
before insert or update or delete on public.hall_of_fame_record_history
for each row when (
  coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '') not in (
    'hall_of_fame.application.final_decision',
    'hall_of_fame.record.projection.sync',
    'hall_of_fame.publication_consent.withdraw_after_approval',
    'hall_of_fame.record.correct',
    'hall_of_fame.record.revoke'
  )
) execute function private.reject_hall_of_fame_append_only_mutation();
create trigger hall_of_fame_record_history_canonical_lifecycle_guard
before insert or update or delete on public.hall_of_fame_record_history
for each row when (
  coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '') in (
    'hall_of_fame.record.correct',
    'hall_of_fame.record.revoke'
  )
) execute function private.enforce_hall_of_fame_canonical_lifecycle_history_append();

create function public.correct_hall_of_fame_canonical_record(
  p_record_id uuid,
  p_expected_record_version integer,
  p_record_type_code text,
  p_played_on date,
  p_course_name_snapshot text,
  p_course_region_snapshot text,
  p_course_environment text,
  p_course_layout_snapshot text,
  p_course_segment_snapshot text,
  p_hole_number integer,
  p_hole_par integer,
  p_strokes integer,
  p_nominating_club_id uuid,
  p_correction_reason_code text,
  p_correction_reason text,
  p_request_id uuid
)
returns table (
  request_id uuid,
  operation text,
  predecessor_record_id uuid,
  predecessor_record_version integer,
  predecessor_validity_status text,
  successor_record_id uuid,
  successor_record_version integer,
  successor_validity_status text,
  successor_publication_status text,
  active_badge_count integer,
  changed boolean,
  replayed boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_operation text := 'hall_of_fame.record.correct';
  v_pre_record public.hall_of_fame_records%rowtype;
  v_record public.hall_of_fame_records%rowtype;
  v_successor public.hall_of_fame_records%rowtype;
  v_batch_id uuid;
  v_source_status text;
  v_record_type text := pg_catalog.lower(pg_catalog.btrim(p_record_type_code));
  v_course_name text := pg_catalog.btrim(p_course_name_snapshot);
  v_course_region text := pg_catalog.btrim(p_course_region_snapshot);
  v_environment text := pg_catalog.lower(pg_catalog.btrim(p_course_environment));
  v_layout text := nullif(pg_catalog.btrim(p_course_layout_snapshot), '');
  v_segment text := pg_catalog.btrim(p_course_segment_snapshot);
  v_reason_code text := pg_catalog.lower(pg_catalog.btrim(p_correction_reason_code));
  v_reason text := pg_catalog.btrim(p_correction_reason);
  v_request_fingerprint bytea;
  v_record_fingerprint bytea;
  v_claim record;
  v_successor_id uuid := pg_catalog.gen_random_uuid();
  v_successor_publication text;
  v_successor_suppression text;
  v_badge_count integer;
  v_row_count integer;
  v_result jsonb;
begin
  perform private.lock_active_hall_of_fame_actor(v_actor);

  if p_record_id is null
     or p_expected_record_version is null
     or p_expected_record_version < 1
     or p_request_id is null
     or p_played_on is null
     or v_record_type not in ('hole_in_one', 'albatross', 'condor')
     or v_course_name is null or v_course_name = ''
     or v_course_region is null or v_course_region = ''
     or v_environment not in ('outdoor', 'screen')
     or v_segment is null or v_segment = ''
     or p_hole_number is null
     or v_reason_code not in (
       'factual_error',
       'wrong_record_type',
       'administrative_error',
       'evidence_clarification'
     )
     or v_reason is null
     or pg_catalog.char_length(v_reason) not between 2 and 1000 then
    raise exception 'HOF_INVALID_CORRECTION_REQUEST' using errcode = '22023';
  end if;

  perform private.lock_hall_of_fame_mutation_request(v_actor, p_request_id);

  select canonical.*
    into v_pre_record
  from public.hall_of_fame_records as canonical
  where canonical.id = p_record_id;
  if not found then
    raise exception 'HOF_CANONICAL_RECORD_NOT_FOUND' using errcode = 'P0002';
  end if;

  select source.application_batch_id, source.review_status
    into v_batch_id, v_source_status
  from public.hall_of_fame_application_records as source
  where source.id = v_pre_record.source_application_record_id
    and source.target_user_id = v_pre_record.target_user_id;
  if not found then
    raise exception 'HOF_CANONICAL_SOURCE_INTEGRITY_INVALID' using errcode = '23514';
  end if;

  v_request_fingerprint := extensions.digest(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'record_id', p_record_id,
        'expected_record_version', p_expected_record_version,
        'record_type_code', v_record_type,
        'played_on', p_played_on,
        'course_name_snapshot', v_course_name,
        'course_region_snapshot', v_course_region,
        'course_environment', v_environment,
        'course_layout_snapshot', v_layout,
        'course_segment_snapshot', v_segment,
        'hole_number', p_hole_number,
        'hole_par', p_hole_par,
        'strokes', p_strokes,
        'nominating_club_id', p_nominating_club_id,
        'correction_reason_code', v_reason_code,
        'correction_reason', v_reason
      )::text,
      'UTF8'
    ),
    'sha256'
  );

  perform pg_catalog.set_config(
    'pul.hall_of_fame.canonical_record_id',
    p_record_id::text,
    true
  );
  perform pg_catalog.set_config(
    'pul.hall_of_fame.successor_record_id',
    v_successor_id::text,
    true
  );
  perform pg_catalog.set_config('pul.hall_of_fame.reason_code', v_reason_code, true);
  perform pg_catalog.set_config('pul.hall_of_fame.reason', v_reason, true);

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_record_id::text, 8612)
  );
  select *
    into v_claim
  from private.hall_of_fame_claim_request(
    v_actor,
    p_request_id,
    v_operation,
    v_batch_id,
    v_pre_record.source_application_record_id,
    v_pre_record.target_user_id,
    v_request_fingerprint
  );
  if v_claim.replayed then
    return query select
      p_request_id,
      v_claim.result_payload ->> 'operation',
      (v_claim.result_payload ->> 'predecessor_record_id')::uuid,
      (v_claim.result_payload ->> 'predecessor_record_version')::integer,
      v_claim.result_payload ->> 'predecessor_validity_status',
      (v_claim.result_payload ->> 'successor_record_id')::uuid,
      (v_claim.result_payload ->> 'successor_record_version')::integer,
      v_claim.result_payload ->> 'successor_validity_status',
      v_claim.result_payload ->> 'successor_publication_status',
      (v_claim.result_payload ->> 'active_badge_count')::integer,
      (v_claim.result_payload ->> 'changed')::boolean,
      true;
    return;
  end if;

  perform private.lock_hall_of_fame_authorization_boundary();
  perform private.require_hall_of_fame_platform_permission(
    v_actor,
    'hall_of_fame.records.correct'
  );

  select canonical.*
    into v_record
  from public.hall_of_fame_records as canonical
  where canonical.id = p_record_id
  for update;
  if not found then
    raise exception 'HOF_CANONICAL_RECORD_NOT_FOUND' using errcode = 'P0002';
  end if;

  select source.application_batch_id, source.review_status
    into v_batch_id, v_source_status
  from public.hall_of_fame_application_records as source
  where source.id = v_record.source_application_record_id
    and source.target_user_id = v_record.target_user_id
  for share;
  if not found
     or v_source_status <> 'approved'
     or v_record.source_application_record_id
          <> v_pre_record.source_application_record_id
     or v_record.target_user_id <> v_pre_record.target_user_id then
    raise exception 'HOF_CANONICAL_SOURCE_INTEGRITY_INVALID' using errcode = '23514';
  end if;

  if v_record.version <> p_expected_record_version then
    raise exception 'HOF_STALE_RECORD_VERSION' using errcode = 'PT409';
  end if;
  if v_record.validity_status in ('corrected', 'revoked') then
    raise exception 'HOF_CANONICAL_TERMINAL_STATE' using errcode = 'PT409';
  end if;
  if v_record.validity_status <> 'active' then
    raise exception 'HOF_CANONICAL_STATE_INVALID' using errcode = 'PT409';
  end if;

  if v_record.record_type_code = v_record_type
     and v_record.played_on = p_played_on
     and v_record.course_name_snapshot = v_course_name
     and v_record.course_region_snapshot = v_course_region
     and v_record.course_environment = v_environment
     and v_record.course_layout_snapshot is not distinct from v_layout
     and v_record.course_segment_snapshot = v_segment
     and v_record.hole_number = p_hole_number
     and v_record.hole_par is not distinct from p_hole_par
     and v_record.strokes is not distinct from p_strokes
     and v_record.nominating_club_id is not distinct from p_nominating_club_id then
    raise exception 'HOF_CORRECTION_NO_FACTUAL_CHANGE' using errcode = '22023';
  end if;

  v_record_fingerprint := extensions.digest(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'target_user_id', v_record.target_user_id,
        'record_type_code', v_record_type,
        'played_on', p_played_on,
        'course_name', pg_catalog.lower(v_course_name),
        'course_region', pg_catalog.lower(v_course_region),
        'course_environment', v_environment,
        'course_segment', v_segment,
        'hole_number', p_hole_number
      )::text,
      'UTF8'
    ),
    'sha256'
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.encode(v_record_fingerprint, 'hex'),
      8611
    )
  );

  if (
    select pg_catalog.count(*)
    from public.hall_of_fame_badge_definitions as definition
    where definition.code in (v_record_type, 'hall_of_fame_inductee')
      and definition.is_active
      and (
        definition.code = 'hall_of_fame_inductee'
        or definition.source_record_type_code = v_record_type
      )
  ) <> 2 then
    raise exception 'HOF_REQUIRED_BADGE_DEFINITION_MISSING' using errcode = '23514';
  end if;

  perform definition.code
  from public.hall_of_fame_badge_definitions as definition
  where definition.code in (
    v_record.record_type_code,
    v_record_type,
    'hall_of_fame_inductee'
  )
  order by definition.code
  for share;

  perform source.id
  from public.hall_of_fame_badge_sources as source
  where source.record_id = v_record.id
  order by source.badge_code, source.id
  for update;

  if (
    select pg_catalog.count(*)
    from public.hall_of_fame_badge_sources as source
    where source.record_id = v_record.id
      and source.status = 'active'
      and source.badge_code in (
        v_record.record_type_code,
        'hall_of_fame_inductee'
      )
  ) <> 2
     or exists (
       select 1
       from public.hall_of_fame_badge_sources as source
       where source.record_id = v_record.id
         and source.status = 'active'
         and source.badge_code not in (
           v_record.record_type_code,
           'hall_of_fame_inductee'
         )
     ) then
    raise exception 'HOF_BADGE_SOURCE_RECONCILIATION_REQUIRED' using errcode = '23514';
  end if;

  update public.hall_of_fame_badge_sources as source
  set
    status = 'inactive',
    deactivated_at = pg_catalog.now(),
    deactivation_reason = 'Canonical record corrected.'
  where source.record_id = v_record.id
    and source.status = 'active';
  get diagnostics v_row_count = row_count;
  if v_row_count <> 2 then
    raise exception 'HOF_BADGE_SOURCE_DEACTIVATION_FAILED' using errcode = '23514';
  end if;

  update public.hall_of_fame_records as canonical
  set
    validity_status = 'corrected',
    publication_status = 'suppressed',
    suppression_reason = 'Canonical record corrected.',
    version = canonical.version + 1,
    updated_at = pg_catalog.now()
  where canonical.id = v_record.id
    and canonical.version = p_expected_record_version
    and canonical.validity_status = 'active'
  returning canonical.* into v_record;
  if not found then
    raise exception 'HOF_STALE_RECORD_VERSION' using errcode = 'PT409';
  end if;

  v_successor_publication := case
    when v_pre_record.publication_status = 'suppressed' then 'suppressed'
    else 'hidden'
  end;
  v_successor_suppression := case
    when v_successor_publication = 'suppressed'
      then v_pre_record.suppression_reason
    else null
  end;

  insert into public.hall_of_fame_records (
    id,
    source_application_record_id,
    target_user_id,
    record_type_code,
    played_on,
    course_name_snapshot,
    course_region_snapshot,
    course_environment,
    course_layout_snapshot,
    course_segment_snapshot,
    hole_number,
    hole_par,
    strokes,
    nominating_club_id,
    fingerprint_version,
    record_fingerprint,
    validity_status,
    publication_status,
    suppression_reason,
    approved_by_user_id,
    approved_at,
    published_at,
    corrected_from_record_id,
    version
  ) values (
    v_successor_id,
    v_record.source_application_record_id,
    v_record.target_user_id,
    v_record_type,
    p_played_on,
    v_course_name,
    v_course_region,
    v_environment,
    v_layout,
    v_segment,
    p_hole_number,
    p_hole_par,
    p_strokes,
    p_nominating_club_id,
    1,
    v_record_fingerprint,
    'active',
    v_successor_publication,
    v_successor_suppression,
    v_record.approved_by_user_id,
    v_record.approved_at,
    null,
    v_record.id,
    1
  )
  returning public.hall_of_fame_records.* into v_successor;

  insert into public.hall_of_fame_badge_sources (
    target_user_id,
    badge_code,
    record_id,
    status,
    activated_at,
    created_at
  )
  values
    (
      v_successor.target_user_id,
      v_successor.record_type_code,
      v_successor.id,
      'active',
      pg_catalog.now(),
      pg_catalog.now()
    ),
    (
      v_successor.target_user_id,
      'hall_of_fame_inductee',
      v_successor.id,
      'active',
      pg_catalog.now(),
      pg_catalog.now()
    );

  select pg_catalog.count(*)::integer
    into v_badge_count
  from public.hall_of_fame_badge_sources as source
  where source.record_id = v_successor.id
    and source.status = 'active';
  if v_badge_count <> 2 then
    raise exception 'HOF_BADGE_SOURCE_RECONCILIATION_FAILED' using errcode = '23514';
  end if;

  insert into public.hall_of_fame_record_history (
    record_id,
    version,
    from_validity_status,
    to_validity_status,
    from_publication_status,
    to_publication_status,
    action,
    reason,
    reason_code,
    actor_user_id,
    request_id
  ) values
    (
      v_record.id,
      v_record.version,
      'active',
      'corrected',
      v_pre_record.publication_status,
      'suppressed',
      'hall_of_fame.record.corrected',
      v_reason,
      v_reason_code,
      v_actor,
      p_request_id
    ),
    (
      v_successor.id,
      1,
      null,
      'active',
      null,
      v_successor.publication_status,
      'hall_of_fame.record.correction_successor_created',
      v_reason,
      v_reason_code,
      v_actor,
      p_request_id
    );

  insert into public.audit_logs (
    actor_id,
    actor_type,
    action,
    target_type,
    target_id,
    before_summary,
    after_summary,
    metadata,
    request_id,
    outcome
  ) values (
    v_actor,
    'user',
    v_operation,
    'hall_of_fame_record',
    v_record.id::text,
    pg_catalog.jsonb_build_object(
      'record_id', v_record.id,
      'validity_status', 'active',
      'publication_status', v_pre_record.publication_status,
      'record_version', p_expected_record_version,
      'record_fingerprint', pg_catalog.encode(v_pre_record.record_fingerprint, 'hex')
    ),
    pg_catalog.jsonb_build_object(
      'predecessor_record_id', v_record.id,
      'predecessor_validity_status', v_record.validity_status,
      'predecessor_record_version', v_record.version,
      'successor_record_id', v_successor.id,
      'successor_validity_status', v_successor.validity_status,
      'successor_publication_status', v_successor.publication_status,
      'successor_record_version', v_successor.version,
      'successor_record_fingerprint', pg_catalog.encode(v_successor.record_fingerprint, 'hex')
    ),
    pg_catalog.jsonb_build_object(
      'reason_code', v_reason_code,
      'active_badge_count', v_badge_count
    ),
    p_request_id,
    'success'
  );

  v_result := pg_catalog.jsonb_build_object(
    'operation', v_operation,
    'predecessor_record_id', v_record.id,
    'predecessor_record_version', v_record.version,
    'predecessor_validity_status', v_record.validity_status,
    'successor_record_id', v_successor.id,
    'successor_record_version', v_successor.version,
    'successor_validity_status', v_successor.validity_status,
    'successor_publication_status', v_successor.publication_status,
    'active_badge_count', v_badge_count,
    'changed', true
  );
  perform private.complete_hall_of_fame_request(
    v_actor,
    p_request_id,
    v_operation,
    v_batch_id,
    v_record.source_application_record_id,
    v_request_fingerprint,
    v_result
  );

  return query select
    p_request_id,
    v_operation,
    v_record.id,
    v_record.version,
    v_record.validity_status,
    v_successor.id,
    v_successor.version,
    v_successor.validity_status,
    v_successor.publication_status,
    v_badge_count,
    true,
    false;
exception
  when unique_violation then
    raise exception 'HOF_CORRECTION_CONFLICT' using errcode = 'PT409';
end;
$$;

comment on function public.correct_hall_of_fame_canonical_record(
  uuid, integer, text, date, text, text, text, text, text,
  integer, integer, integer, uuid, text, text, uuid
) is
  'Creates one same-source, same-target active canonical successor after atomically suppressing the predecessor and rotating badge provenance.';

revoke all on function public.correct_hall_of_fame_canonical_record(
  uuid, integer, text, date, text, text, text, text, text,
  integer, integer, integer, uuid, text, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.correct_hall_of_fame_canonical_record(
  uuid, integer, text, date, text, text, text, text, text,
  integer, integer, integer, uuid, text, text, uuid
) to authenticated;

create function public.revoke_hall_of_fame_canonical_record(
  p_record_id uuid,
  p_expected_record_version integer,
  p_revocation_reason_code text,
  p_revocation_reason text,
  p_request_id uuid
)
returns table (
  request_id uuid,
  operation text,
  record_id uuid,
  record_version integer,
  validity_status text,
  publication_status text,
  active_badge_count integer,
  changed boolean,
  replayed boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_operation text := 'hall_of_fame.record.revoke';
  v_pre_record public.hall_of_fame_records%rowtype;
  v_record public.hall_of_fame_records%rowtype;
  v_batch_id uuid;
  v_source_status text;
  v_reason_code text := pg_catalog.lower(pg_catalog.btrim(p_revocation_reason_code));
  v_reason text := pg_catalog.btrim(p_revocation_reason);
  v_fingerprint bytea;
  v_claim record;
  v_badge_count integer;
  v_row_count integer;
  v_result jsonb;
begin
  perform private.lock_active_hall_of_fame_actor(v_actor);

  if p_record_id is null
     or p_expected_record_version is null
     or p_expected_record_version < 1
     or p_request_id is null
     or v_reason_code not in (
       'factual_error',
       'insufficient_or_invalid_evidence',
       'duplicate_record',
       'wrong_subject',
       'wrong_record_type',
       'administrative_error',
       'fraud_confirmed'
     )
     or v_reason is null
     or pg_catalog.char_length(v_reason) not between 2 and 1000 then
    raise exception 'HOF_INVALID_REVOCATION_REQUEST' using errcode = '22023';
  end if;

  perform private.lock_hall_of_fame_mutation_request(v_actor, p_request_id);

  select canonical.*
    into v_pre_record
  from public.hall_of_fame_records as canonical
  where canonical.id = p_record_id;
  if not found then
    raise exception 'HOF_CANONICAL_RECORD_NOT_FOUND' using errcode = 'P0002';
  end if;

  select source.application_batch_id, source.review_status
    into v_batch_id, v_source_status
  from public.hall_of_fame_application_records as source
  where source.id = v_pre_record.source_application_record_id
    and source.target_user_id = v_pre_record.target_user_id;
  if not found then
    raise exception 'HOF_CANONICAL_SOURCE_INTEGRITY_INVALID' using errcode = '23514';
  end if;

  v_fingerprint := extensions.digest(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'record_id', p_record_id,
        'expected_record_version', p_expected_record_version,
        'revocation_reason_code', v_reason_code,
        'revocation_reason', v_reason
      )::text,
      'UTF8'
    ),
    'sha256'
  );

  perform pg_catalog.set_config(
    'pul.hall_of_fame.canonical_record_id',
    p_record_id::text,
    true
  );
  perform pg_catalog.set_config('pul.hall_of_fame.successor_record_id', '', true);
  perform pg_catalog.set_config('pul.hall_of_fame.reason_code', v_reason_code, true);
  perform pg_catalog.set_config('pul.hall_of_fame.reason', v_reason, true);

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_record_id::text, 8612)
  );
  select *
    into v_claim
  from private.hall_of_fame_claim_request(
    v_actor,
    p_request_id,
    v_operation,
    v_batch_id,
    v_pre_record.source_application_record_id,
    v_pre_record.target_user_id,
    v_fingerprint
  );
  if v_claim.replayed then
    return query select
      p_request_id,
      v_claim.result_payload ->> 'operation',
      (v_claim.result_payload ->> 'record_id')::uuid,
      (v_claim.result_payload ->> 'record_version')::integer,
      v_claim.result_payload ->> 'validity_status',
      v_claim.result_payload ->> 'publication_status',
      (v_claim.result_payload ->> 'active_badge_count')::integer,
      (v_claim.result_payload ->> 'changed')::boolean,
      true;
    return;
  end if;

  perform private.lock_hall_of_fame_authorization_boundary();
  perform private.require_hall_of_fame_platform_permission(
    v_actor,
    'hall_of_fame.records.revoke'
  );

  select canonical.*
    into v_record
  from public.hall_of_fame_records as canonical
  where canonical.id = p_record_id
  for update;
  if not found then
    raise exception 'HOF_CANONICAL_RECORD_NOT_FOUND' using errcode = 'P0002';
  end if;

  select source.application_batch_id, source.review_status
    into v_batch_id, v_source_status
  from public.hall_of_fame_application_records as source
  where source.id = v_record.source_application_record_id
    and source.target_user_id = v_record.target_user_id
  for share;
  if not found
     or v_source_status <> 'approved'
     or v_record.source_application_record_id
          <> v_pre_record.source_application_record_id
     or v_record.target_user_id <> v_pre_record.target_user_id then
    raise exception 'HOF_CANONICAL_SOURCE_INTEGRITY_INVALID' using errcode = '23514';
  end if;

  if v_record.version <> p_expected_record_version then
    raise exception 'HOF_STALE_RECORD_VERSION' using errcode = 'PT409';
  end if;

  if v_record.validity_status = 'revoked' then
    if v_record.revocation_reason_code <> v_reason_code
       or v_record.revocation_reason <> v_reason
       or v_record.publication_status <> 'suppressed'
       or exists (
         select 1
         from public.hall_of_fame_badge_sources as source
         where source.record_id = v_record.id
           and source.status = 'active'
       ) then
      raise exception 'HOF_CANONICAL_TERMINAL_STATE' using errcode = 'PT409';
    end if;

    v_result := pg_catalog.jsonb_build_object(
      'operation', v_operation,
      'record_id', v_record.id,
      'record_version', v_record.version,
      'validity_status', v_record.validity_status,
      'publication_status', v_record.publication_status,
      'active_badge_count', 0,
      'changed', false
    );
    perform private.complete_hall_of_fame_request(
      v_actor,
      p_request_id,
      v_operation,
      v_batch_id,
      v_record.source_application_record_id,
      v_fingerprint,
      v_result
    );
    return query select
      p_request_id,
      v_operation,
      v_record.id,
      v_record.version,
      v_record.validity_status,
      v_record.publication_status,
      0,
      false,
      false;
    return;
  end if;

  if v_record.validity_status = 'corrected' then
    raise exception 'HOF_CANONICAL_TERMINAL_STATE' using errcode = 'PT409';
  end if;
  if v_record.validity_status <> 'active' then
    raise exception 'HOF_CANONICAL_STATE_INVALID' using errcode = 'PT409';
  end if;

  perform source.id
  from public.hall_of_fame_badge_sources as source
  where source.record_id = v_record.id
  order by source.badge_code, source.id
  for update;

  update public.hall_of_fame_badge_sources as source
  set
    status = 'inactive',
    deactivated_at = pg_catalog.now(),
    deactivation_reason = 'Canonical record revoked.'
  where source.record_id = v_record.id
    and source.status = 'active';

  update public.hall_of_fame_records as canonical
  set
    validity_status = 'revoked',
    publication_status = 'suppressed',
    suppression_reason = 'Canonical record revoked.',
    revoked_at = pg_catalog.now(),
    revoked_by_user_id = v_actor,
    revocation_reason_code = v_reason_code,
    revocation_reason = v_reason,
    version = canonical.version + 1,
    updated_at = pg_catalog.now()
  where canonical.id = v_record.id
    and canonical.version = p_expected_record_version
    and canonical.validity_status = 'active'
  returning canonical.* into v_record;
  if not found then
    raise exception 'HOF_STALE_RECORD_VERSION' using errcode = 'PT409';
  end if;

  select pg_catalog.count(*)::integer
    into v_badge_count
  from public.hall_of_fame_badge_sources as source
  where source.record_id = v_record.id
    and source.status = 'active';
  if v_badge_count <> 0 then
    raise exception 'HOF_BADGE_SOURCE_DEACTIVATION_FAILED' using errcode = '23514';
  end if;

  insert into public.hall_of_fame_record_history (
    record_id,
    version,
    from_validity_status,
    to_validity_status,
    from_publication_status,
    to_publication_status,
    action,
    reason,
    reason_code,
    actor_user_id,
    request_id
  ) values (
    v_record.id,
    v_record.version,
    'active',
    'revoked',
    v_pre_record.publication_status,
    'suppressed',
    'hall_of_fame.record.revoked',
    v_reason,
    v_reason_code,
    v_actor,
    p_request_id
  );

  insert into public.audit_logs (
    actor_id,
    actor_type,
    action,
    target_type,
    target_id,
    before_summary,
    after_summary,
    metadata,
    request_id,
    outcome
  ) values (
    v_actor,
    'user',
    v_operation,
    'hall_of_fame_record',
    v_record.id::text,
    pg_catalog.jsonb_build_object(
      'validity_status', 'active',
      'publication_status', v_pre_record.publication_status,
      'record_version', p_expected_record_version
    ),
    pg_catalog.jsonb_build_object(
      'validity_status', v_record.validity_status,
      'publication_status', v_record.publication_status,
      'record_version', v_record.version,
      'active_badge_count', v_badge_count
    ),
    pg_catalog.jsonb_build_object('reason_code', v_reason_code),
    p_request_id,
    'success'
  );

  v_result := pg_catalog.jsonb_build_object(
    'operation', v_operation,
    'record_id', v_record.id,
    'record_version', v_record.version,
    'validity_status', v_record.validity_status,
    'publication_status', v_record.publication_status,
    'active_badge_count', v_badge_count,
    'changed', true
  );
  perform private.complete_hall_of_fame_request(
    v_actor,
    p_request_id,
    v_operation,
    v_batch_id,
    v_record.source_application_record_id,
    v_fingerprint,
    v_result
  );

  return query select
    p_request_id,
    v_operation,
    v_record.id,
    v_record.version,
    v_record.validity_status,
    v_record.publication_status,
    v_badge_count,
    true,
    false;
end;
$$;

comment on function public.revoke_hall_of_fame_canonical_record(
  uuid, integer, text, text, uuid
) is
  'Atomically terminates one active canonical record, suppresses it, deactivates badge provenance, and supports exact completed replay or a same-state new-request no-op.';

revoke all on function public.revoke_hall_of_fame_canonical_record(
  uuid, integer, text, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.revoke_hall_of_fame_canonical_record(
  uuid, integer, text, text, uuid
) to authenticated;
