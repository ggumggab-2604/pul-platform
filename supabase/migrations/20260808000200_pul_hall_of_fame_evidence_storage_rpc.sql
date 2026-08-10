-- PUL 8-6-B-2B-2: private Hall of Fame evidence lifecycle and Storage boundary.
-- Submission, review, canonical records, badges, UI, malware scanning, and cron remain deferred.

alter table public.hall_of_fame_evidence_files
  add column declared_mime_type text,
  add column declared_byte_size bigint,
  add column upload_expires_at timestamptz,
  add column version integer not null default 1,
  add column replaces_evidence_id uuid,
  add column storage_delete_attempted_at timestamptz,
  add column storage_deleted_at timestamptz,
  add column storage_delete_error_code text;

update public.hall_of_fame_evidence_files
set
  declared_mime_type = mime_type,
  declared_byte_size = byte_size,
  original_filename = null;

alter table public.hall_of_fame_evidence_files
  add constraint hall_of_fame_evidence_files_declared_mime_check
    check (
      declared_mime_type is null
      or declared_mime_type in (
        'image/jpeg', 'image/png', 'image/webp', 'application/pdf'
      )
    ),
  add constraint hall_of_fame_evidence_files_declared_size_check
    check (
      declared_byte_size is null
      or declared_byte_size between 1 and 10485760
    ),
  add constraint hall_of_fame_evidence_files_intent_check
    check (
      status not in ('pending_upload', 'uploaded_unverified')
      or (
        declared_mime_type is not null
        and declared_byte_size is not null
        and upload_expires_at is not null
        and upload_expires_at > created_at
      )
    ) not valid,
  add constraint hall_of_fame_evidence_files_version_check
    check (version >= 1),
  add constraint hall_of_fame_evidence_files_replaces_batch_fkey
    foreign key (replaces_evidence_id, application_batch_id)
    references public.hall_of_fame_evidence_files (id, application_batch_id)
    on delete restrict,
  add constraint hall_of_fame_evidence_files_replaces_self_check
    check (replaces_evidence_id is null or replaces_evidence_id <> id),
  add constraint hall_of_fame_evidence_files_original_filename_private_check
    check (original_filename is null),
  add constraint hall_of_fame_evidence_files_storage_delete_check
    check (
      (storage_deleted_at is null or storage_delete_attempted_at is not null)
      and (
        storage_delete_error_code is null
        or (
          storage_delete_error_code = pg_catalog.btrim(storage_delete_error_code)
          and storage_delete_error_code ~ '^HOF_[A-Z0-9_]+$'
        )
      )
    );

create unique index hall_of_fame_evidence_files_active_replacement_uidx
  on public.hall_of_fame_evidence_files (replaces_evidence_id)
  where replaces_evidence_id is not null
    and status in ('pending_upload', 'uploaded_unverified', 'available');

create index hall_of_fame_evidence_files_cleanup_idx
  on public.hall_of_fame_evidence_files (
    status, storage_deleted_at, upload_expires_at, created_at, id
  )
  where storage_deleted_at is null;

create table public.hall_of_fame_evidence_file_history (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  evidence_id uuid not null
    references public.hall_of_fame_evidence_files (id) on delete restrict,
  application_batch_id uuid not null,
  application_record_id uuid,
  from_status text,
  to_status text not null,
  evidence_version integer not null,
  operation text not null,
  actor_user_id uuid not null
    references public.user_accounts (id) on delete restrict,
  execution_actor_type text not null default 'user',
  request_id uuid not null,
  replacement_evidence_id uuid
    references public.hall_of_fame_evidence_files (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  constraint hall_of_fame_evidence_file_history_evidence_version_unique
    unique (evidence_id, evidence_version),
  constraint hall_of_fame_evidence_file_history_record_batch_fkey
    foreign key (application_record_id, application_batch_id)
    references public.hall_of_fame_application_records (id, application_batch_id)
    on delete restrict,
  constraint hall_of_fame_evidence_file_history_ledger_fkey
    foreign key (actor_user_id, request_id)
    references private.hall_of_fame_mutation_requests (actor_user_id, request_id)
    on delete restrict,
  constraint hall_of_fame_evidence_file_history_status_check
    check (
      (from_status is null or from_status in (
        'pending_upload', 'uploaded_unverified', 'available', 'replaced',
        'deleted', 'failed', 'expired'
      ))
      and to_status in (
        'pending_upload', 'uploaded_unverified', 'available', 'replaced',
        'deleted', 'failed', 'expired'
      )
    ),
  constraint hall_of_fame_evidence_file_history_version_check
    check (evidence_version >= 1),
  constraint hall_of_fame_evidence_file_history_actor_type_check
    check (execution_actor_type in ('user', 'system')),
  constraint hall_of_fame_evidence_file_history_operation_check
    check (
      operation = pg_catalog.btrim(operation)
      and operation ~ '^hall_of_fame\.evidence\.[a-z_]+$'
    )
);

comment on table public.hall_of_fame_evidence_file_history is
  'Append-only, ledger-bound evidence lifecycle history without URLs, tokens, filenames, or object bytes.';

alter table public.hall_of_fame_evidence_file_history enable row level security;
alter table public.hall_of_fame_evidence_file_history force row level security;
revoke all on table public.hall_of_fame_evidence_file_history
  from public, anon, authenticated, service_role;

create function private.hall_of_fame_evidence_operation_is_server_only(
  p_operation text
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select p_operation in (
    'hall_of_fame.evidence.finalize',
    'hall_of_fame.evidence.fail',
    'hall_of_fame.evidence.expire',
    'hall_of_fame.evidence.storage_deleted'
  );
$$;

revoke all on function private.hall_of_fame_evidence_operation_is_server_only(text)
  from public, anon, authenticated, service_role;

create function private.hall_of_fame_evidence_context_is_valid()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.hall_of_fame_mutation_requests as ledger
    where ledger.actor_user_id = nullif(
        pg_catalog.current_setting('pul.hall_of_fame.actor_user_id', true), ''
      )::uuid
      and ledger.request_id = nullif(
        pg_catalog.current_setting('pul.hall_of_fame.request_id', true), ''
      )::uuid
      and ledger.operation = nullif(
        pg_catalog.current_setting('pul.hall_of_fame.operation', true), ''
      )
      and ledger.application_batch_id = nullif(
        pg_catalog.current_setting('pul.hall_of_fame.application_batch_id', true), ''
      )::uuid
      and ledger.application_record_id = nullif(
        pg_catalog.current_setting('pul.hall_of_fame.application_record_id', true), ''
      )::uuid
      and pg_catalog.encode(ledger.payload_fingerprint, 'hex') = nullif(
        pg_catalog.current_setting('pul.hall_of_fame.payload_fingerprint', true), ''
      )
      and ledger.status = 'in_progress'
      and ledger.result_payload is null
      and ledger.completed_at is null
      and (
        auth.uid() = ledger.actor_user_id
        or (
          auth.role() = 'service_role'
          and private.hall_of_fame_evidence_operation_is_server_only(ledger.operation)
        )
      )
  );
$$;

revoke all on function private.hall_of_fame_evidence_context_is_valid()
  from public, anon, authenticated, service_role;

create function private.enforce_guarded_hall_of_fame_evidence_mutation()
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
  v_server_only boolean;
begin
  if tg_op = 'DELETE' then
    raise exception 'HOF_DIRECT_DELETE_FORBIDDEN' using errcode = '42501';
  end if;
  begin
    v_actor := nullif(pg_catalog.current_setting('pul.hall_of_fame.actor_user_id', true), '')::uuid;
    v_request := nullif(pg_catalog.current_setting('pul.hall_of_fame.request_id', true), '')::uuid;
    v_batch := nullif(pg_catalog.current_setting('pul.hall_of_fame.application_batch_id', true), '')::uuid;
    v_record := nullif(pg_catalog.current_setting('pul.hall_of_fame.application_record_id', true), '')::uuid;
  exception when invalid_text_representation then
    raise exception 'HOF_INVALID_MUTATION_CONTEXT' using errcode = '42501';
  end;
  v_operation := nullif(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '');
  v_fingerprint := nullif(pg_catalog.current_setting('pul.hall_of_fame.payload_fingerprint', true), '');
  v_server_only := private.hall_of_fame_evidence_operation_is_server_only(v_operation);

  if v_actor is null or v_request is null or v_batch is null or v_record is null
     or v_operation is null or v_fingerprint is null
     or v_operation not like 'hall_of_fame.evidence.%'
     or (v_server_only and auth.role() <> 'service_role')
     or (not v_server_only and auth.uid() is distinct from v_actor) then
    raise exception 'HOF_MUTATION_RPC_REQUIRED' using errcode = '42501';
  end if;

  if tg_table_schema = 'private' and tg_table_name = 'hall_of_fame_mutation_requests' then
    if tg_op = 'INSERT' then
      if new.actor_user_id <> v_actor or new.request_id <> v_request
         or new.operation <> v_operation
         or new.application_batch_id <> v_batch
         or new.application_record_id <> v_record
         or pg_catalog.encode(new.payload_fingerprint, 'hex') <> v_fingerprint
         or new.status <> 'in_progress' or new.result_payload is not null
         or new.completed_at is not null then
        raise exception 'HOF_LEDGER_CONTEXT_MISMATCH' using errcode = '42501';
      end if;
      return new;
    end if;
    if old.actor_user_id <> v_actor or old.request_id <> v_request
       or old.operation <> v_operation or new.actor_user_id <> old.actor_user_id
       or new.request_id <> old.request_id or new.operation <> old.operation
       or new.application_batch_id <> v_batch or new.application_record_id <> v_record
       or new.payload_fingerprint <> old.payload_fingerprint
       or old.status <> 'in_progress' or new.status <> 'completed'
       or new.result_payload is null or new.completed_at is null then
      raise exception 'HOF_LEDGER_CONTEXT_MISMATCH' using errcode = '42501';
    end if;
    return new;
  end if;

  if not private.hall_of_fame_evidence_context_is_valid() then
    raise exception 'HOF_MUTATION_RPC_REQUIRED' using errcode = '42501';
  end if;

  if tg_table_name = 'hall_of_fame_application_batches' then
    if old.id <> v_batch or new.id <> old.id or old.status <> 'draft'
       or new.status <> 'draft' or new.version <> old.version + 1
       or new.application_type <> old.application_type
       or new.created_by_user_id <> old.created_by_user_id
       or new.created_by_membership_id is distinct from old.created_by_membership_id
       or new.nominating_club_id is distinct from old.nominating_club_id
       or new.vacancy_context_club_id is distinct from old.vacancy_context_club_id
       or new.submitted_at is not null or new.finalized_at is not null
       or new.created_at <> old.created_at then
      raise exception 'HOF_APPLICATION_BATCH_CONTEXT_MISMATCH' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_table_name = 'hall_of_fame_application_records' then
    if old.id <> v_record or new.id <> old.id or old.application_batch_id <> v_batch
       or new.application_batch_id <> old.application_batch_id
       or old.review_status <> 'draft' or new.review_status <> 'draft'
       or new.version <> old.version + 1
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
       or new.duplicate_fingerprint is distinct from old.duplicate_fingerprint
       or new.created_at <> old.created_at then
      raise exception 'HOF_APPLICATION_RECORD_CONTEXT_MISMATCH' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_table_name = 'hall_of_fame_evidence_files' then
    if new.application_batch_id <> v_batch or new.application_record_id <> v_record
       or new.original_filename is not null then
      raise exception 'HOF_EVIDENCE_CONTEXT_MISMATCH' using errcode = '42501';
    end if;
    if tg_op = 'INSERT' then
      if v_operation not in (
           'hall_of_fame.evidence.upload_intent',
           'hall_of_fame.evidence.replacement_intent'
         ) or new.status <> 'pending_upload' or new.version <> 1
         or new.finalized_at is not null or new.deleted_at is not null
         or new.storage_deleted_at is not null then
        raise exception 'HOF_EVIDENCE_CONTEXT_MISMATCH' using errcode = '42501';
      end if;
      return new;
    end if;
    if new.id <> old.id or new.application_batch_id <> old.application_batch_id
       or new.application_record_id is distinct from old.application_record_id
       or new.evidence_type <> old.evidence_type
       or new.storage_bucket <> old.storage_bucket
       or new.storage_path <> old.storage_path
       or new.uploaded_by_user_id <> old.uploaded_by_user_id
       or new.uploaded_by_membership_id is distinct from old.uploaded_by_membership_id
       or new.created_at <> old.created_at
       or new.version not in (old.version, old.version + 1) then
      raise exception 'HOF_EVIDENCE_CONTEXT_MISMATCH' using errcode = '42501';
    end if;
    if v_operation = 'hall_of_fame.evidence.finalize' then
      if not (
        (
          old.status in ('pending_upload', 'uploaded_unverified')
          and new.status = 'available'
          and new.replaced_by_evidence_id is not distinct from old.replaced_by_evidence_id
        )
        or (
          old.status = 'available'
          and new.status = 'replaced'
          and old.replaced_by_evidence_id is null
          and new.replaced_by_evidence_id is not null
          and new.mime_type is not distinct from old.mime_type
          and new.byte_size is not distinct from old.byte_size
          and new.sha256 is not distinct from old.sha256
          and new.finalized_at is not distinct from old.finalized_at
          and new.declared_mime_type is not distinct from old.declared_mime_type
          and new.declared_byte_size is not distinct from old.declared_byte_size
          and new.upload_expires_at is not distinct from old.upload_expires_at
          and new.storage_deleted_at is not distinct from old.storage_deleted_at
          and new.storage_delete_attempted_at is not distinct from old.storage_delete_attempted_at
          and new.storage_delete_error_code is not distinct from old.storage_delete_error_code
          and exists (
            select 1
            from public.hall_of_fame_evidence_files as replacement
            where replacement.id = new.replaced_by_evidence_id
              and replacement.replaces_evidence_id = old.id
              and replacement.application_batch_id = v_batch
              and replacement.application_record_id = v_record
              and replacement.status in ('pending_upload', 'uploaded_unverified')
          )
        )
      ) or new.version <> old.version + 1 then
        raise exception 'HOF_EVIDENCE_CONTEXT_MISMATCH' using errcode = '42501';
      end if;
    elsif v_operation in (
      'hall_of_fame.evidence.withdraw', 'hall_of_fame.evidence.fail',
      'hall_of_fame.evidence.expire'
    ) then
      if new.version <> old.version + 1 then
        raise exception 'HOF_EVIDENCE_CONTEXT_MISMATCH' using errcode = '42501';
      end if;
    elsif v_operation = 'hall_of_fame.evidence.storage_deleted' then
      if new.version <> old.version or new.status <> old.status
         or new.storage_delete_attempted_at is null then
        raise exception 'HOF_EVIDENCE_CONTEXT_MISMATCH' using errcode = '42501';
      end if;
    else
      raise exception 'HOF_EVIDENCE_CONTEXT_MISMATCH' using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'HOF_MUTATION_RPC_REQUIRED' using errcode = '42501';
end;
$$;

revoke all on function private.enforce_guarded_hall_of_fame_evidence_mutation()
  from public, anon, authenticated, service_role;

create function private.enforce_hall_of_fame_evidence_history_append()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := nullif(pg_catalog.current_setting('pul.hall_of_fame.actor_user_id', true), '')::uuid;
  v_request uuid := nullif(pg_catalog.current_setting('pul.hall_of_fame.request_id', true), '')::uuid;
  v_batch uuid := nullif(pg_catalog.current_setting('pul.hall_of_fame.application_batch_id', true), '')::uuid;
  v_record uuid := nullif(pg_catalog.current_setting('pul.hall_of_fame.application_record_id', true), '')::uuid;
  v_operation text := nullif(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '');
  v_status text;
  v_version integer;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    raise exception 'HOF_APPEND_ONLY_MUTATION_FORBIDDEN' using errcode = '42501';
  end if;
  if not private.hall_of_fame_evidence_context_is_valid() then
    raise exception 'HOF_MUTATION_RPC_REQUIRED' using errcode = '42501';
  end if;

  if tg_table_name = 'hall_of_fame_evidence_file_history' then
    if new.actor_user_id <> v_actor or new.request_id <> v_request
       or new.application_batch_id <> v_batch
       or new.application_record_id is distinct from v_record
       or new.operation <> v_operation
       or new.execution_actor_type <> (
         case
           when v_operation in (
             'hall_of_fame.evidence.fail', 'hall_of_fame.evidence.expire'
           ) then 'system'
           else 'user'
         end
       ) then
      raise exception 'HOF_EVIDENCE_HISTORY_CONTEXT_MISMATCH' using errcode = '42501';
    end if;
    select evidence.status, evidence.version into v_status, v_version
    from public.hall_of_fame_evidence_files as evidence
    where evidence.id = new.evidence_id
      and evidence.application_batch_id = v_batch
      and evidence.application_record_id is not distinct from v_record;
    if not found or new.to_status <> v_status or new.evidence_version <> v_version then
      raise exception 'HOF_EVIDENCE_HISTORY_CONTEXT_MISMATCH' using errcode = '42501';
    end if;
    if new.evidence_version = 1 then
      if new.from_status is not null then
        raise exception 'HOF_EVIDENCE_HISTORY_CHAIN_MISMATCH' using errcode = '42501';
      end if;
    elsif not exists (
      select 1 from public.hall_of_fame_evidence_file_history as history
      where history.evidence_id = new.evidence_id
        and history.evidence_version = new.evidence_version - 1
        and history.to_status = new.from_status
    ) then
      raise exception 'HOF_EVIDENCE_HISTORY_CHAIN_MISMATCH' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_table_name = 'hall_of_fame_application_history' then
    if new.actor_user_id <> v_actor or new.request_id <> v_request
       or new.application_batch_id <> v_batch or new.action <> v_operation
       or new.from_status <> 'draft' or new.to_status <> 'draft' then
      raise exception 'HOF_APPLICATION_HISTORY_CONTEXT_MISMATCH' using errcode = '42501';
    end if;
    if new.scope = 'batch' and new.application_record_id is null then
      select batch.status, batch.version into v_status, v_version
      from public.hall_of_fame_application_batches as batch where batch.id = v_batch;
    elsif new.scope = 'record' and new.application_record_id = v_record then
      select record.review_status, record.version into v_status, v_version
      from public.hall_of_fame_application_records as record
      where record.id = v_record and record.application_batch_id = v_batch;
    else
      raise exception 'HOF_APPLICATION_HISTORY_CONTEXT_MISMATCH' using errcode = '42501';
    end if;
    if not found or v_status <> 'draft' or new.version <> v_version then
      raise exception 'HOF_APPLICATION_HISTORY_CONTEXT_MISMATCH' using errcode = '42501';
    end if;
    if not exists (
      select 1 from public.hall_of_fame_application_history as prior
      where prior.scope = new.scope
        and prior.application_batch_id = new.application_batch_id
        and prior.application_record_id is not distinct from new.application_record_id
        and prior.version = new.version - 1
        and prior.to_status = new.from_status
    ) then
      raise exception 'HOF_APPLICATION_HISTORY_CHAIN_MISMATCH' using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'HOF_MUTATION_RPC_REQUIRED' using errcode = '42501';
end;
$$;

revoke all on function private.enforce_hall_of_fame_evidence_history_append()
  from public, anon, authenticated, service_role;

-- Route only evidence operations to the evidence guards. All earlier operations
-- continue through the already-approved B-2A/B-2B-1 guards unchanged.
drop trigger hall_of_fame_application_batches_guard_before_mutation
  on public.hall_of_fame_application_batches;
create trigger hall_of_fame_application_batches_guard_before_mutation
before insert or update or delete on public.hall_of_fame_application_batches
for each row when (
  coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '')
    not like 'hall_of_fame.evidence.%'
) execute function private.reject_hall_of_fame_mutation();
create trigger hall_of_fame_application_batches_evidence_guard_before_mutation
before insert or update or delete on public.hall_of_fame_application_batches
for each row when (
  coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '')
    like 'hall_of_fame.evidence.%'
) execute function private.enforce_guarded_hall_of_fame_evidence_mutation();

drop trigger hall_of_fame_application_records_guard_before_mutation
  on public.hall_of_fame_application_records;
create trigger hall_of_fame_application_records_guard_before_mutation
before insert or update or delete on public.hall_of_fame_application_records
for each row when (
  coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '')
    not like 'hall_of_fame.evidence.%'
) execute function private.reject_hall_of_fame_mutation();
create trigger hall_of_fame_application_records_evidence_guard_before_mutation
before insert or update or delete on public.hall_of_fame_application_records
for each row when (
  coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '')
    like 'hall_of_fame.evidence.%'
) execute function private.enforce_guarded_hall_of_fame_evidence_mutation();

drop trigger hall_of_fame_evidence_files_guard_before_mutation
  on public.hall_of_fame_evidence_files;
create trigger hall_of_fame_evidence_files_guard_before_mutation
before insert or update or delete on public.hall_of_fame_evidence_files
for each row when (
  coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '')
    not like 'hall_of_fame.evidence.%'
) execute function private.reject_hall_of_fame_mutation();
create trigger hall_of_fame_evidence_files_evidence_guard_before_mutation
before insert or update or delete on public.hall_of_fame_evidence_files
for each row when (
  coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '')
    like 'hall_of_fame.evidence.%'
) execute function private.enforce_guarded_hall_of_fame_evidence_mutation();

drop trigger hall_of_fame_mutation_requests_guard_before_mutation
  on private.hall_of_fame_mutation_requests;
create trigger hall_of_fame_mutation_requests_guard_before_mutation
before insert or update or delete on private.hall_of_fame_mutation_requests
for each row when (
  coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '')
    not like 'hall_of_fame.evidence.%'
) execute function private.reject_hall_of_fame_mutation();
create trigger hall_of_fame_mutation_requests_evidence_guard_before_mutation
before insert or update or delete on private.hall_of_fame_mutation_requests
for each row when (
  coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '')
    like 'hall_of_fame.evidence.%'
) execute function private.enforce_guarded_hall_of_fame_evidence_mutation();

drop trigger hall_of_fame_application_history_guard_before_mutation
  on public.hall_of_fame_application_history;
create trigger hall_of_fame_application_history_guard_before_mutation
before insert or update or delete on public.hall_of_fame_application_history
for each row when (
  coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '')
    not like 'hall_of_fame.evidence.%'
) execute function private.reject_hall_of_fame_append_only_mutation();
create trigger hall_of_fame_application_history_evidence_guard_before_mutation
before insert or update or delete on public.hall_of_fame_application_history
for each row when (
  coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '')
    like 'hall_of_fame.evidence.%'
) execute function private.enforce_hall_of_fame_evidence_history_append();

create trigger hall_of_fame_evidence_file_history_guard_before_mutation
before insert or update or delete on public.hall_of_fame_evidence_file_history
for each row execute function private.enforce_hall_of_fame_evidence_history_append();
-- Adopt legacy evidence rows that predate the append-only evidence history.
create or replace function private.enforce_hall_of_fame_evidence_history_append()
returns trigger
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := nullif(pg_catalog.current_setting('pul.hall_of_fame.actor_user_id', true), '')::uuid;
  v_request uuid := nullif(pg_catalog.current_setting('pul.hall_of_fame.request_id', true), '')::uuid;
  v_batch uuid := nullif(pg_catalog.current_setting('pul.hall_of_fame.application_batch_id', true), '')::uuid;
  v_record uuid := nullif(pg_catalog.current_setting('pul.hall_of_fame.application_record_id', true), '')::uuid;
  v_operation text := nullif(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '');
  v_status text;
  v_version integer;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    raise exception 'HOF_APPEND_ONLY_MUTATION_FORBIDDEN' using errcode = '42501';
  end if;
  if not private.hall_of_fame_evidence_context_is_valid() then
    raise exception 'HOF_MUTATION_RPC_REQUIRED' using errcode = '42501';
  end if;

  if tg_table_name = 'hall_of_fame_evidence_file_history' then
    if new.actor_user_id <> v_actor or new.request_id <> v_request
       or new.application_batch_id <> v_batch
       or new.application_record_id is distinct from v_record
       or new.operation <> v_operation
       or new.execution_actor_type <> (
         case
           when v_operation in (
             'hall_of_fame.evidence.fail', 'hall_of_fame.evidence.expire'
           ) then 'system'
           else 'user'
         end
       ) then
      raise exception 'HOF_EVIDENCE_HISTORY_CONTEXT_MISMATCH' using errcode = '42501';
    end if;
    select evidence.status, evidence.version into v_status, v_version
    from public.hall_of_fame_evidence_files as evidence
    where evidence.id = new.evidence_id
      and evidence.application_batch_id = v_batch
      and evidence.application_record_id is not distinct from v_record;
    if not found or new.to_status <> v_status or new.evidence_version <> v_version then
      raise exception 'HOF_EVIDENCE_HISTORY_CONTEXT_MISMATCH' using errcode = '42501';
    end if;
    if not exists (
      select 1 from public.hall_of_fame_evidence_file_history as history
      where history.evidence_id = new.evidence_id
    ) then
      if new.evidence_version = 1 and new.from_status is not null then
        raise exception 'HOF_EVIDENCE_HISTORY_CHAIN_MISMATCH' using errcode = '42501';
      end if;
    elsif not exists (
      select 1 from public.hall_of_fame_evidence_file_history as history
      where history.evidence_id = new.evidence_id
        and history.evidence_version = new.evidence_version - 1
        and history.to_status = new.from_status
    ) then
      raise exception 'HOF_EVIDENCE_HISTORY_CHAIN_MISMATCH' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_table_name = 'hall_of_fame_application_history' then
    if new.actor_user_id <> v_actor or new.request_id <> v_request
       or new.application_batch_id <> v_batch or new.action <> v_operation
       or new.from_status <> 'draft' or new.to_status <> 'draft' then
      raise exception 'HOF_APPLICATION_HISTORY_CONTEXT_MISMATCH' using errcode = '42501';
    end if;
    if new.scope = 'batch' and new.application_record_id is null then
      select batch.status, batch.version into v_status, v_version
      from public.hall_of_fame_application_batches as batch where batch.id = v_batch;
    elsif new.scope = 'record' and new.application_record_id = v_record then
      select record.review_status, record.version into v_status, v_version
      from public.hall_of_fame_application_records as record
      where record.id = v_record and record.application_batch_id = v_batch;
    else
      raise exception 'HOF_APPLICATION_HISTORY_CONTEXT_MISMATCH' using errcode = '42501';
    end if;
    if not found or v_status <> 'draft' or new.version <> v_version
       or not exists (
         select 1 from public.hall_of_fame_application_history as prior
         where prior.scope = new.scope
           and prior.application_batch_id = new.application_batch_id
           and prior.application_record_id is not distinct from new.application_record_id
           and prior.version = new.version - 1
           and prior.to_status = new.from_status
       ) then
      raise exception 'HOF_APPLICATION_HISTORY_CHAIN_MISMATCH' using errcode = '42501';
    end if;
    return new;
  end if;
  raise exception 'HOF_MUTATION_RPC_REQUIRED' using errcode = '42501';
end;
$$;

create function private.require_hall_of_fame_service_role()
returns void language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'HOF_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
end;
$$;

create function private.lock_and_authorize_hall_of_fame_evidence_edit(
  p_actor_user_id uuid,
  p_application_record_id uuid,
  p_expected_batch_version integer default null
)
returns table (
  batch_id uuid,
  membership_id uuid,
  batch_version integer,
  record_version integer,
  target_user_id uuid
)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_batch public.hall_of_fame_application_batches%rowtype;
  v_record public.hall_of_fame_application_records%rowtype;
  v_membership uuid;
begin
  perform private.lock_hall_of_fame_authorization_boundary();
  select batch.* into v_batch
  from public.hall_of_fame_application_batches as batch
  join public.hall_of_fame_application_records as record
    on record.application_batch_id = batch.id
  where record.id = p_application_record_id
  for update of batch;
  if not found then raise exception 'HOF_APPLICATION_RECORD_NOT_FOUND'; end if;

  select record.* into v_record
  from public.hall_of_fame_application_records as record
  where record.id = p_application_record_id
    and record.application_batch_id = v_batch.id
  for update;
  if not found then raise exception 'HOF_APPLICATION_RECORD_NOT_FOUND'; end if;
  if v_batch.status <> 'draft' or v_record.review_status <> 'draft' then
    raise exception 'HOF_APPLICATION_NOT_EDITABLE' using errcode = 'PT409';
  end if;
  if p_expected_batch_version is not null
     and v_batch.version <> p_expected_batch_version then
    raise exception 'HOF_APPLICATION_VERSION_CONFLICT' using errcode = 'PT409';
  end if;
  v_membership := private.lock_and_authorize_hall_of_fame_batch_edit(
    p_actor_user_id, v_batch.id
  );
  if v_batch.application_type in (
       'direct_application', 'club_admin_vacancy_direct_application'
     ) and (
       v_batch.created_by_user_id <> p_actor_user_id
       or v_record.target_user_id <> p_actor_user_id
     ) then
    raise exception 'HOF_PERMISSION_DENIED' using errcode = '42501';
  end if;
  return query select
    v_batch.id, v_membership, v_batch.version, v_record.version,
    v_record.target_user_id;
end;
$$;
create function private.append_hall_of_fame_evidence_history(
  p_evidence_id uuid, p_batch_id uuid, p_record_id uuid,
  p_from_status text, p_to_status text, p_version integer,
  p_operation text, p_actor uuid, p_request uuid,
  p_replacement_id uuid default null
)
returns void language sql volatile security definer set search_path = ''
as $$
  insert into public.hall_of_fame_evidence_file_history (
    evidence_id, application_batch_id, application_record_id,
    from_status, to_status, evidence_version, operation,
    actor_user_id, execution_actor_type, request_id, replacement_evidence_id
  ) values (
    p_evidence_id, p_batch_id, p_record_id, p_from_status, p_to_status,
    p_version, p_operation, p_actor,
    case when p_operation in (
      'hall_of_fame.evidence.fail', 'hall_of_fame.evidence.expire'
    ) then 'system' else 'user' end,
    p_request, p_replacement_id
  );
$$;

create function private.bump_hall_of_fame_evidence_versions(
  p_actor uuid, p_membership uuid, p_request uuid, p_operation text,
  p_batch_id uuid, p_record_id uuid
)
returns table (batch_version integer, record_version integer)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_batch_version integer;
  v_record_version integer;
begin
  update public.hall_of_fame_application_batches as batch
  set version = batch.version + 1
  where batch.id = p_batch_id and batch.status = 'draft'
  returning batch.version into v_batch_version;
  if not found then raise exception 'HOF_APPLICATION_NOT_EDITABLE' using errcode = 'PT409'; end if;

  update public.hall_of_fame_application_records as record
  set version = record.version + 1
  where record.id = p_record_id and record.application_batch_id = p_batch_id
    and record.review_status = 'draft'
  returning record.version into v_record_version;
  if not found then raise exception 'HOF_APPLICATION_RECORD_NOT_EDITABLE' using errcode = 'PT409'; end if;

  insert into public.hall_of_fame_application_history (
    scope, application_batch_id, application_record_id,
    from_status, to_status, version, actor_user_id,
    actor_membership_id, action, request_id
  ) values
    ('batch', p_batch_id, null, 'draft', 'draft', v_batch_version,
     p_actor, p_membership, p_operation, p_request),
    ('record', p_batch_id, p_record_id, 'draft', 'draft', v_record_version,
     p_actor, p_membership, p_operation, p_request);
  return query select v_batch_version, v_record_version;
end;
$$;

create function private.audit_and_complete_hall_of_fame_evidence_request(
  p_actor uuid, p_request uuid, p_operation text,
  p_batch_id uuid, p_record_id uuid, p_evidence_id uuid,
  p_before text, p_after text, p_batch_version integer,
  p_record_version integer, p_evidence_version integer,
  p_fingerprint bytea, p_result jsonb
)
returns void language plpgsql volatile security definer set search_path = ''
as $$
declare v_club uuid;
begin
  select coalesce(batch.nominating_club_id, batch.vacancy_context_club_id)
  into v_club from public.hall_of_fame_application_batches as batch
  where batch.id = p_batch_id;
  insert into public.audit_logs (
    actor_id, actor_type, action, target_type, target_id, club_id,
    before_summary, after_summary, metadata, request_id, outcome
  ) values (
    case when p_operation in (
      'hall_of_fame.evidence.fail', 'hall_of_fame.evidence.expire'
    ) then null else p_actor end,
    case when p_operation in (
      'hall_of_fame.evidence.fail', 'hall_of_fame.evidence.expire'
    ) then 'system' else 'user' end,
    p_operation, 'hall_of_fame_evidence_file',
    p_evidence_id::text,
    case when v_club is null then null else v_club::text end,
    case when p_before is null then null
      else pg_catalog.jsonb_build_object('status', p_before) end,
    pg_catalog.jsonb_build_object(
      'status', p_after, 'evidence_version', p_evidence_version,
      'record_version', p_record_version, 'batch_version', p_batch_version
    ),
    pg_catalog.jsonb_build_object(
      'application_batch_id', p_batch_id,
      'application_record_id', p_record_id,
      'subject_user_id', p_actor,
      'execution_actor_type', case
        when p_operation in (
          'hall_of_fame.evidence.fail', 'hall_of_fame.evidence.expire'
        ) then 'service_role_system'
        else 'authenticated_user'
      end
    ),
    p_request, 'success'
  );
  perform private.complete_hall_of_fame_request(
    p_actor, p_request, p_operation, p_batch_id, p_record_id,
    p_fingerprint, p_result
  );
end;
$$;

create function private.execute_hall_of_fame_evidence_mutation(
  p_actor uuid,
  p_operation text,
  p_record_id uuid,
  p_evidence_id uuid,
  p_evidence_type text,
  p_mime text,
  p_size bigint,
  p_sha_hex text,
  p_expected_evidence_version integer,
  p_expected_batch_version integer,
  p_request uuid
)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_evidence public.hall_of_fame_evidence_files%rowtype;
  v_old public.hall_of_fame_evidence_files%rowtype;
  v_batch_id uuid;
  v_target uuid;
  v_type text := case when p_evidence_type is null then null
    else pg_catalog.lower(pg_catalog.btrim(p_evidence_type)) end;
  v_mime text := case when p_mime is null then null
    else pg_catalog.lower(pg_catalog.btrim(p_mime)) end;
  v_sha text := case when p_sha_hex is null then null
    else pg_catalog.lower(pg_catalog.btrim(p_sha_hex)) end;
  v_fingerprint bytea;
  v_claim record;
  v_auth record;
  v_versions record;
  v_result jsonb;
  v_before text;
  v_expiry timestamptz;
begin
  perform private.lock_active_hall_of_fame_actor(p_actor);
  if p_actor is null or p_request is null or p_expected_batch_version is null
     or p_expected_batch_version < 1
     or p_operation not in (
       'hall_of_fame.evidence.upload_intent',
       'hall_of_fame.evidence.replacement_intent',
       'hall_of_fame.evidence.withdraw',
       'hall_of_fame.evidence.finalize'
     ) then
    raise exception 'HOF_INVALID_EVIDENCE_REQUEST' using errcode = '22023';
  end if;
  if private.hall_of_fame_evidence_operation_is_server_only(p_operation) then
    perform private.require_hall_of_fame_service_role();
  elsif auth.uid() is distinct from p_actor then
    raise exception 'HOF_AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  perform private.lock_hall_of_fame_mutation_request(p_actor, p_request);

  if p_operation = 'hall_of_fame.evidence.upload_intent' then
    if p_record_id is null
       or v_type not in ('scorecard', 'round_photo', 'supporting_document')
       or v_mime not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
       or p_size not between 1 and 10485760
       or (v_mime = 'application/pdf' and v_type <> 'scorecard') then
      raise exception 'HOF_INVALID_EVIDENCE_UPLOAD_INTENT' using errcode = '22023';
    end if;
    select record.application_batch_id, record.target_user_id
      into v_batch_id, v_target
    from public.hall_of_fame_application_records as record
    where record.id = p_record_id;
  else
    if p_evidence_id is null then
      raise exception 'HOF_INVALID_EVIDENCE_REQUEST' using errcode = '22023';
    end if;
    select evidence.* into v_evidence
    from public.hall_of_fame_evidence_files as evidence
    where evidence.id = p_evidence_id;
    if not found then raise exception 'HOF_EVIDENCE_CONTEXT_NOT_FOUND'; end if;
    select record.target_user_id into v_target
    from public.hall_of_fame_application_records as record
    where record.id = v_evidence.application_record_id
      and record.application_batch_id = v_evidence.application_batch_id;
    v_batch_id := v_evidence.application_batch_id;
    p_record_id := v_evidence.application_record_id;
  end if;
  if not found then raise exception 'HOF_EVIDENCE_CONTEXT_NOT_FOUND'; end if;

  if p_operation = 'hall_of_fame.evidence.replacement_intent' then
    if v_mime not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
       or p_size not between 1 and 10485760
       or (v_mime = 'application/pdf' and v_evidence.evidence_type <> 'scorecard') then
      raise exception 'HOF_INVALID_EVIDENCE_REPLACEMENT_INTENT' using errcode = '22023';
    end if;
  elsif p_operation = 'hall_of_fame.evidence.withdraw' then
    if p_expected_evidence_version is null or p_expected_evidence_version < 1 then
      raise exception 'HOF_INVALID_EVIDENCE_WITHDRAWAL' using errcode = '22023';
    end if;
  elsif p_operation = 'hall_of_fame.evidence.finalize' then
    if p_expected_evidence_version is null or p_expected_evidence_version < 1
       or v_mime not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
       or p_size not between 1 and 10485760 or v_sha !~ '^[0-9a-f]{64}$' then
      raise exception 'HOF_INVALID_EVIDENCE_FINALIZE' using errcode = '22023';
    end if;
  end if;

  v_fingerprint := extensions.digest(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'record_id', p_record_id, 'evidence_id', p_evidence_id,
        'evidence_type', v_type, 'mime', v_mime, 'size', p_size,
        'sha256', v_sha, 'expected_evidence_version', p_expected_evidence_version,
        'expected_batch_version', p_expected_batch_version
      )::text, 'UTF8'
    ), 'sha256'
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_batch_id::text, 8610)
  );
  select * into v_claim from private.hall_of_fame_claim_request(
    p_actor, p_request, p_operation, v_batch_id, p_record_id,
    v_target, v_fingerprint
  );
  if v_claim.replayed then
    return v_claim.result_payload || '{"replayed":true}'::jsonb;
  end if;
  select * into v_auth
  from private.lock_and_authorize_hall_of_fame_evidence_edit(
    p_actor, p_record_id, p_expected_batch_version
  );

  if p_operation = 'hall_of_fame.evidence.upload_intent' then
    v_evidence.id := pg_catalog.gen_random_uuid();
    v_expiry := pg_catalog.now() + interval '15 minutes';
    insert into public.hall_of_fame_evidence_files (
      id, application_batch_id, application_record_id, evidence_type,
      storage_bucket, storage_path, mime_type, byte_size, sha256,
      original_filename, uploaded_by_user_id, uploaded_by_membership_id,
      status, declared_mime_type, declared_byte_size, upload_expires_at,
      version, replaces_evidence_id
    ) values (
      v_evidence.id, v_batch_id, p_record_id, v_type,
      'hall-of-fame-evidence',
      'applications/' || v_batch_id::text || '/' || v_evidence.id::text || '/original',
      v_mime, null, null, null, p_actor, v_auth.membership_id,
      'pending_upload', v_mime, p_size, v_expiry, 1, null
    ) returning * into v_evidence;
    v_before := null;
  elsif p_operation = 'hall_of_fame.evidence.replacement_intent' then
    select evidence.* into v_old
    from public.hall_of_fame_evidence_files as evidence
    where evidence.id = p_evidence_id for update;
    if v_old.status <> 'available' or v_old.replaced_by_evidence_id is not null then
      raise exception 'HOF_EVIDENCE_NOT_REPLACEABLE' using errcode = 'PT409';
    end if;
    v_evidence.id := pg_catalog.gen_random_uuid();
    v_expiry := pg_catalog.now() + interval '15 minutes';
    insert into public.hall_of_fame_evidence_files (
      id, application_batch_id, application_record_id, evidence_type,
      storage_bucket, storage_path, mime_type, byte_size, sha256,
      original_filename, uploaded_by_user_id, uploaded_by_membership_id,
      status, declared_mime_type, declared_byte_size, upload_expires_at,
      version, replaces_evidence_id
    ) values (
      v_evidence.id, v_old.application_batch_id, v_old.application_record_id,
      v_old.evidence_type, 'hall-of-fame-evidence',
      'applications/' || v_old.application_batch_id::text || '/' || v_evidence.id::text || '/original',
      v_mime, null, null, null, p_actor, v_auth.membership_id,
      'pending_upload', v_mime, p_size, v_expiry, 1, v_old.id
    ) returning * into v_evidence;
    v_before := null;
  else
    select evidence.* into v_evidence
    from public.hall_of_fame_evidence_files as evidence
    where evidence.id = p_evidence_id for update;
    if v_evidence.version <> p_expected_evidence_version then
      raise exception 'HOF_EVIDENCE_VERSION_CONFLICT' using errcode = 'PT409';
    end if;
    v_before := v_evidence.status;

    if p_operation = 'hall_of_fame.evidence.withdraw' then
      if v_evidence.status not in ('pending_upload', 'available')
         or exists (
           select 1 from public.hall_of_fame_evidence_files as replacement
           where replacement.replaces_evidence_id = v_evidence.id
             and replacement.status in ('pending_upload', 'uploaded_unverified', 'available')
         ) then
        raise exception 'HOF_EVIDENCE_NOT_WITHDRAWABLE' using errcode = 'PT409';
      end if;
      update public.hall_of_fame_evidence_files as evidence
      set status = 'deleted', deleted_at = pg_catalog.now(),
          updated_at = pg_catalog.now(), version = evidence.version + 1
      where evidence.id = v_evidence.id returning * into v_evidence;
    else
      if v_evidence.status not in ('pending_upload', 'uploaded_unverified')
         or v_evidence.upload_expires_at <= pg_catalog.now()
         or v_mime <> v_evidence.declared_mime_type
         or p_size <> v_evidence.declared_byte_size
         or (v_mime = 'application/pdf' and v_evidence.evidence_type <> 'scorecard') then
        raise exception 'HOF_EVIDENCE_OBJECT_MISMATCH' using errcode = '22023';
      end if;
      if v_evidence.replaces_evidence_id is not null then
        select evidence.* into v_old
        from public.hall_of_fame_evidence_files as evidence
        where evidence.id = v_evidence.replaces_evidence_id
          and evidence.application_batch_id = v_batch_id
          and evidence.application_record_id = p_record_id
        for update;
        if not found or v_old.status <> 'available'
           or v_old.replaced_by_evidence_id is not null
           or v_old.evidence_type <> v_evidence.evidence_type then
          raise exception 'HOF_EVIDENCE_REPLACEMENT_CONFLICT' using errcode = 'PT409';
        end if;
        update public.hall_of_fame_evidence_files as evidence
        set status = 'replaced', replaced_by_evidence_id = v_evidence.id,
            deleted_at = pg_catalog.now(), updated_at = pg_catalog.now(),
            version = evidence.version + 1
        where evidence.id = v_old.id returning * into v_old;
        perform private.append_hall_of_fame_evidence_history(
          v_old.id, v_batch_id, p_record_id, 'available', 'replaced',
          v_old.version, p_operation, p_actor, p_request, v_evidence.id
        );
      end if;
      update public.hall_of_fame_evidence_files as evidence
      set status = 'available', mime_type = v_mime, byte_size = p_size,
          sha256 = pg_catalog.decode(v_sha, 'hex'),
          finalized_at = pg_catalog.now(), deleted_at = null,
          updated_at = pg_catalog.now(), version = evidence.version + 1
      where evidence.id = v_evidence.id returning * into v_evidence;
    end if;
  end if;

  perform private.append_hall_of_fame_evidence_history(
    v_evidence.id, v_batch_id, p_record_id, v_before, v_evidence.status,
    v_evidence.version, p_operation, p_actor, p_request,
    case when p_operation = 'hall_of_fame.evidence.replacement_intent'
      then v_old.id else v_evidence.replaces_evidence_id end
  );
  select * into v_versions from private.bump_hall_of_fame_evidence_versions(
    p_actor, v_auth.membership_id, p_request, p_operation,
    v_batch_id, p_record_id
  );

  v_result := pg_catalog.jsonb_build_object(
    'application_batch_id', v_batch_id, 'application_record_id', p_record_id,
    'evidence_id', v_evidence.id, 'status', v_evidence.status,
    'evidence_version', v_evidence.version,
    'batch_version', v_versions.batch_version,
    'record_version', v_versions.record_version,
    'upload_expires_at', v_evidence.upload_expires_at,
    'replaces_evidence_id', v_evidence.replaces_evidence_id,
    'storage_cleanup_required',
      v_evidence.status in ('deleted', 'failed', 'expired'),
    'replayed', false
  );
  perform private.audit_and_complete_hall_of_fame_evidence_request(
    p_actor, p_request, p_operation, v_batch_id, p_record_id,
    v_evidence.id, v_before, v_evidence.status,
    v_versions.batch_version, v_versions.record_version,
    v_evidence.version, v_fingerprint, v_result
  );
  return v_result;
end;
$$;

create function private.execute_hall_of_fame_evidence_system_terminal_transition(
  p_operation text,
  p_evidence_id uuid,
  p_expected_evidence_version integer,
  p_expected_batch_version integer,
  p_request uuid
)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_evidence public.hall_of_fame_evidence_files%rowtype;
  v_batch public.hall_of_fame_application_batches%rowtype;
  v_record public.hall_of_fame_application_records%rowtype;
  v_subject uuid;
  v_target uuid;
  v_before text;
  v_fingerprint bytea;
  v_claim record;
  v_result jsonb;
begin
  perform private.require_hall_of_fame_service_role();
  if p_operation not in (
       'hall_of_fame.evidence.fail',
       'hall_of_fame.evidence.expire'
     ) or p_evidence_id is null or p_request is null
     or p_expected_evidence_version is null
     or p_expected_evidence_version < 1
     or p_expected_batch_version is null
     or p_expected_batch_version < 1 then
    raise exception 'HOF_INVALID_EVIDENCE_TERMINAL_TRANSITION'
      using errcode = '22023';
  end if;

  select evidence.* into v_evidence
  from public.hall_of_fame_evidence_files as evidence
  where evidence.id = p_evidence_id;
  if not found then raise exception 'HOF_EVIDENCE_NOT_FOUND'; end if;
  v_subject := v_evidence.uploaded_by_user_id;
  select record.target_user_id into v_target
  from public.hall_of_fame_application_records as record
  where record.id = v_evidence.application_record_id
    and record.application_batch_id = v_evidence.application_batch_id;
  if not found then raise exception 'HOF_EVIDENCE_CONTEXT_NOT_FOUND'; end if;

  perform private.lock_hall_of_fame_mutation_request(v_subject, p_request);
  v_fingerprint := extensions.digest(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'operation', p_operation,
        'evidence_id', p_evidence_id,
        'expected_evidence_version', p_expected_evidence_version,
        'expected_batch_version', p_expected_batch_version,
        'execution_actor_type', 'service_role_system'
      )::text, 'UTF8'
    ), 'sha256'
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_evidence.application_batch_id::text, 8610)
  );
  select * into v_claim from private.hall_of_fame_claim_request(
    v_subject, p_request, p_operation,
    v_evidence.application_batch_id, v_evidence.application_record_id,
    v_target, v_fingerprint
  );
  if v_claim.replayed then
    return v_claim.result_payload || '{"replayed":true}'::jsonb;
  end if;
  select batch.* into v_batch
  from public.hall_of_fame_application_batches as batch
  where batch.id = v_evidence.application_batch_id
  for update;
  if not found or v_batch.version <> p_expected_batch_version then
    raise exception 'HOF_APPLICATION_VERSION_CONFLICT' using errcode = 'PT409';
  end if;
  select record.* into v_record
  from public.hall_of_fame_application_records as record
  where record.id = v_evidence.application_record_id
    and record.application_batch_id = v_evidence.application_batch_id
  for update;
  if not found then raise exception 'HOF_EVIDENCE_CONTEXT_NOT_FOUND'; end if;
  select evidence.* into v_evidence
  from public.hall_of_fame_evidence_files as evidence
  where evidence.id = p_evidence_id
    and evidence.application_batch_id = v_batch.id
    and evidence.application_record_id = v_record.id
  for update;
  if not found then raise exception 'HOF_EVIDENCE_CONTEXT_NOT_FOUND'; end if;
  if v_evidence.version <> p_expected_evidence_version then
    raise exception 'HOF_EVIDENCE_VERSION_CONFLICT' using errcode = 'PT409';
  end if;
  if v_evidence.status not in ('pending_upload', 'uploaded_unverified')
     or (
       p_operation = 'hall_of_fame.evidence.expire'
       and (
         v_evidence.upload_expires_at is null
         or v_evidence.upload_expires_at > pg_catalog.now()
       )
     ) then
    raise exception 'HOF_EVIDENCE_TERMINAL_TRANSITION_NOT_ALLOWED'
      using errcode = 'PT409';
  end if;

  v_before := v_evidence.status;
  update public.hall_of_fame_evidence_files as evidence
  set status = case
        when p_operation = 'hall_of_fame.evidence.fail' then 'failed'
        else 'expired'
      end,
      deleted_at = pg_catalog.now(),
      updated_at = pg_catalog.now(),
      version = evidence.version + 1
  where evidence.id = v_evidence.id
  returning * into v_evidence;
  perform private.append_hall_of_fame_evidence_history(
    v_evidence.id, v_batch.id, v_record.id,
    v_before, v_evidence.status, v_evidence.version,
    p_operation, v_subject, p_request, null
  );

  v_result := pg_catalog.jsonb_build_object(
    'application_batch_id', v_batch.id,
    'application_record_id', v_record.id,
    'evidence_id', v_evidence.id,
    'status', v_evidence.status,
    'evidence_version', v_evidence.version,
    'batch_version', v_batch.version,
    'record_version', v_record.version,
    'storage_cleanup_required', true,
    'execution_actor_type', 'service_role_system',
    'replayed', false
  );
  perform private.audit_and_complete_hall_of_fame_evidence_request(
    v_subject, p_request, p_operation, v_batch.id, v_record.id,
    v_evidence.id, v_before, v_evidence.status,
    v_batch.version, v_record.version, v_evidence.version,
    v_fingerprint, v_result
  );
  return v_result;
end;
$$;

revoke all on function private.execute_hall_of_fame_evidence_system_terminal_transition(
  text, uuid, integer, integer, uuid
) from public, anon, authenticated, service_role;
revoke all on function private.require_hall_of_fame_service_role()
  from public, anon, authenticated, service_role;
revoke all on function private.lock_and_authorize_hall_of_fame_evidence_edit(uuid, uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function private.append_hall_of_fame_evidence_history(
  uuid, uuid, uuid, text, text, integer, text, uuid, uuid, uuid
) from public, anon, authenticated, service_role;
revoke all on function private.bump_hall_of_fame_evidence_versions(
  uuid, uuid, uuid, text, uuid, uuid
) from public, anon, authenticated, service_role;
revoke all on function private.audit_and_complete_hall_of_fame_evidence_request(
  uuid, uuid, text, uuid, uuid, uuid, text, text,
  integer, integer, integer, bytea, jsonb
) from public, anon, authenticated, service_role;
revoke all on function private.execute_hall_of_fame_evidence_mutation(
  uuid, text, uuid, uuid, text, text, bigint, text,
  integer, integer, uuid
) from public, anon, authenticated, service_role;

create function public.create_hall_of_fame_evidence_upload_intent(
  p_application_record_id uuid, p_evidence_type text,
  p_declared_mime_type text, p_declared_size_bytes bigint,
  p_expected_batch_version integer, p_request_id uuid
)
returns table (
  application_batch_id uuid, application_record_id uuid, evidence_id uuid,
  status text, evidence_version integer, batch_version integer,
  record_version integer, upload_expires_at timestamptz, replayed boolean
)
language plpgsql volatile security definer set search_path = ''
as $$
declare v jsonb;
begin
  v := private.execute_hall_of_fame_evidence_mutation(
    auth.uid(), 'hall_of_fame.evidence.upload_intent',
    p_application_record_id, null, p_evidence_type, p_declared_mime_type,
    p_declared_size_bytes, null, null, p_expected_batch_version, p_request_id
  );
  return query select
    (v->>'application_batch_id')::uuid, (v->>'application_record_id')::uuid,
    (v->>'evidence_id')::uuid, v->>'status',
    (v->>'evidence_version')::integer, (v->>'batch_version')::integer,
    (v->>'record_version')::integer,
    nullif(v->>'upload_expires_at', '')::timestamptz,
    coalesce((v->>'replayed')::boolean, false);
end;
$$;

create function public.create_hall_of_fame_evidence_replacement_intent(
  p_evidence_id uuid, p_declared_mime_type text,
  p_declared_size_bytes bigint, p_expected_batch_version integer,
  p_request_id uuid
)
returns table (
  application_batch_id uuid, application_record_id uuid, evidence_id uuid,
  replaces_evidence_id uuid, status text, evidence_version integer,
  batch_version integer, record_version integer,
  upload_expires_at timestamptz, replayed boolean
)
language plpgsql volatile security definer set search_path = ''
as $$
declare v jsonb;
begin
  v := private.execute_hall_of_fame_evidence_mutation(
    auth.uid(), 'hall_of_fame.evidence.replacement_intent',
    null, p_evidence_id, null, p_declared_mime_type,
    p_declared_size_bytes, null, null, p_expected_batch_version, p_request_id
  );
  return query select
    (v->>'application_batch_id')::uuid, (v->>'application_record_id')::uuid,
    (v->>'evidence_id')::uuid, nullif(v->>'replaces_evidence_id', '')::uuid,
    v->>'status', (v->>'evidence_version')::integer,
    (v->>'batch_version')::integer, (v->>'record_version')::integer,
    nullif(v->>'upload_expires_at', '')::timestamptz,
    coalesce((v->>'replayed')::boolean, false);
end;
$$;

create function public.withdraw_hall_of_fame_evidence(
  p_evidence_id uuid, p_expected_evidence_version integer,
  p_expected_batch_version integer, p_request_id uuid
)
returns table (
  application_batch_id uuid, application_record_id uuid, evidence_id uuid,
  status text, evidence_version integer, batch_version integer,
  record_version integer, storage_cleanup_required boolean, replayed boolean
)
language plpgsql volatile security definer set search_path = ''
as $$
declare v jsonb;
begin
  v := private.execute_hall_of_fame_evidence_mutation(
    auth.uid(), 'hall_of_fame.evidence.withdraw', null, p_evidence_id,
    null, null, null, null, p_expected_evidence_version,
    p_expected_batch_version, p_request_id
  );
  return query select
    (v->>'application_batch_id')::uuid, (v->>'application_record_id')::uuid,
    (v->>'evidence_id')::uuid, v->>'status',
    (v->>'evidence_version')::integer, (v->>'batch_version')::integer,
    (v->>'record_version')::integer,
    coalesce((v->>'storage_cleanup_required')::boolean, false),
    coalesce((v->>'replayed')::boolean, false);
end;
$$;
create function public.finalize_hall_of_fame_evidence_server(
  p_actor_user_id uuid, p_evidence_id uuid, p_verified_mime_type text,
  p_verified_size_bytes bigint, p_verified_sha256_hex text,
  p_expected_evidence_version integer, p_expected_batch_version integer,
  p_request_id uuid
)
returns table (
  application_batch_id uuid, application_record_id uuid, evidence_id uuid,
  status text, evidence_version integer, batch_version integer,
  record_version integer, replaced_evidence_id uuid, replayed boolean
)
language plpgsql volatile security definer set search_path = ''
as $$
declare v jsonb;
begin
  perform private.require_hall_of_fame_service_role();
  v := private.execute_hall_of_fame_evidence_mutation(
    p_actor_user_id, 'hall_of_fame.evidence.finalize', null, p_evidence_id,
    null, p_verified_mime_type, p_verified_size_bytes, p_verified_sha256_hex,
    p_expected_evidence_version, p_expected_batch_version, p_request_id
  );
  return query select
    (v->>'application_batch_id')::uuid, (v->>'application_record_id')::uuid,
    (v->>'evidence_id')::uuid, v->>'status',
    (v->>'evidence_version')::integer, (v->>'batch_version')::integer,
    (v->>'record_version')::integer,
    nullif(v->>'replaces_evidence_id', '')::uuid,
    coalesce((v->>'replayed')::boolean, false);
end;
$$;

create function public.mark_hall_of_fame_evidence_failed_server(
  p_evidence_id uuid,
  p_expected_evidence_version integer, p_expected_batch_version integer,
  p_request_id uuid
)
returns table (
  application_batch_id uuid, application_record_id uuid, evidence_id uuid,
  status text, evidence_version integer, batch_version integer,
  record_version integer, replayed boolean
)
language plpgsql volatile security definer set search_path = ''
as $$
declare v jsonb;
begin
  perform private.require_hall_of_fame_service_role();
  v := private.execute_hall_of_fame_evidence_system_terminal_transition(
    'hall_of_fame.evidence.fail', p_evidence_id,
    p_expected_evidence_version, p_expected_batch_version, p_request_id
  );
  return query select
    (v->>'application_batch_id')::uuid, (v->>'application_record_id')::uuid,
    (v->>'evidence_id')::uuid, v->>'status',
    (v->>'evidence_version')::integer, (v->>'batch_version')::integer,
    (v->>'record_version')::integer,
    coalesce((v->>'replayed')::boolean, false);
end;
$$;
create function public.expire_hall_of_fame_evidence_server(
  p_evidence_id uuid,
  p_expected_evidence_version integer, p_expected_batch_version integer,
  p_request_id uuid
)
returns table (
  application_batch_id uuid, application_record_id uuid, evidence_id uuid,
  status text, evidence_version integer, batch_version integer,
  record_version integer, replayed boolean
)
language plpgsql volatile security definer set search_path = ''
as $$
declare v jsonb;
begin
  perform private.require_hall_of_fame_service_role();
  v := private.execute_hall_of_fame_evidence_system_terminal_transition(
    'hall_of_fame.evidence.expire', p_evidence_id,
    p_expected_evidence_version, p_expected_batch_version, p_request_id
  );
  return query select
    (v->>'application_batch_id')::uuid, (v->>'application_record_id')::uuid,
    (v->>'evidence_id')::uuid, v->>'status',
    (v->>'evidence_version')::integer, (v->>'batch_version')::integer,
    (v->>'record_version')::integer,
    coalesce((v->>'replayed')::boolean, false);
end;
$$;
revoke all on function public.create_hall_of_fame_evidence_upload_intent(
  uuid, text, text, bigint, integer, uuid
) from public, anon, service_role;
grant execute on function public.create_hall_of_fame_evidence_upload_intent(
  uuid, text, text, bigint, integer, uuid
) to authenticated;
revoke all on function public.create_hall_of_fame_evidence_replacement_intent(
  uuid, text, bigint, integer, uuid
) from public, anon, service_role;
grant execute on function public.create_hall_of_fame_evidence_replacement_intent(
  uuid, text, bigint, integer, uuid
) to authenticated;
revoke all on function public.withdraw_hall_of_fame_evidence(
  uuid, integer, integer, uuid
) from public, anon, service_role;
grant execute on function public.withdraw_hall_of_fame_evidence(
  uuid, integer, integer, uuid
) to authenticated;

revoke all on function public.finalize_hall_of_fame_evidence_server(
  uuid, uuid, text, bigint, text, integer, integer, uuid
) from public, anon, authenticated;
grant execute on function public.finalize_hall_of_fame_evidence_server(
  uuid, uuid, text, bigint, text, integer, integer, uuid
) to service_role;
revoke all on function public.mark_hall_of_fame_evidence_failed_server(
  uuid, integer, integer, uuid
) from public, anon, authenticated;
grant execute on function public.mark_hall_of_fame_evidence_failed_server(
  uuid, integer, integer, uuid
) to service_role;
revoke all on function public.expire_hall_of_fame_evidence_server(
  uuid, integer, integer, uuid
) from public, anon, authenticated;
grant execute on function public.expire_hall_of_fame_evidence_server(
  uuid, integer, integer, uuid
) to service_role;
create function public.get_hall_of_fame_evidence_upload_context_server(
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
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_evidence public.hall_of_fame_evidence_files%rowtype;
  v_auth record;
begin
  perform private.require_hall_of_fame_service_role();
  perform private.lock_active_hall_of_fame_actor(p_actor_user_id);
  select evidence.* into v_evidence
  from public.hall_of_fame_evidence_files as evidence
  where evidence.id = p_evidence_id
  for share;
  if not found
     or v_evidence.status <> 'pending_upload'
     or v_evidence.upload_expires_at <= pg_catalog.now()
     or v_evidence.uploaded_by_user_id <> p_actor_user_id then
    raise exception 'HOF_EVIDENCE_UPLOAD_NOT_AUTHORIZED' using errcode = '42501';
  end if;
  select * into v_auth
  from private.lock_and_authorize_hall_of_fame_evidence_edit(
    p_actor_user_id, v_evidence.application_record_id, null
  );
  return query select
    v_evidence.id, v_evidence.storage_bucket, v_evidence.storage_path,
    v_evidence.declared_mime_type, v_evidence.declared_byte_size,
    v_evidence.upload_expires_at, v_evidence.version, v_auth.batch_version;
end;
$$;

create function public.get_hall_of_fame_evidence_read_context_server(
  p_actor_user_id uuid,
  p_evidence_id uuid
)
returns table (
  evidence_id uuid,
  storage_bucket text,
  storage_path text,
  mime_type text,
  byte_size bigint,
  sha256_hex text
)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_evidence public.hall_of_fame_evidence_files%rowtype;
  v_batch public.hall_of_fame_application_batches%rowtype;
  v_record public.hall_of_fame_application_records%rowtype;
  v_allowed boolean := false;
begin
  perform private.require_hall_of_fame_service_role();
  perform private.lock_active_hall_of_fame_actor(p_actor_user_id);
  perform private.lock_hall_of_fame_authorization_boundary();

  select evidence.* into v_evidence
  from public.hall_of_fame_evidence_files as evidence
  join public.hall_of_fame_application_batches as batch
    on batch.id = evidence.application_batch_id
  join public.hall_of_fame_application_records as record
    on record.id = evidence.application_record_id
   and record.application_batch_id = evidence.application_batch_id
  where evidence.id = p_evidence_id
  for share of evidence, batch, record;
  if found then
    select batch.* into v_batch
    from public.hall_of_fame_application_batches as batch
    where batch.id = v_evidence.application_batch_id;
    select record.* into v_record
    from public.hall_of_fame_application_records as record
    where record.id = v_evidence.application_record_id;
  end if;

  if not found or v_evidence.status <> 'available' then
    raise exception 'HOF_EVIDENCE_READ_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  if v_batch.application_type in (
       'direct_application', 'club_admin_vacancy_direct_application'
     ) then
    v_allowed :=
      p_actor_user_id = v_batch.created_by_user_id
      or p_actor_user_id = v_record.target_user_id;
  elsif v_batch.application_type = 'club_nomination' then
    if p_actor_user_id = v_record.target_user_id then
      v_allowed := true;
    elsif p_actor_user_id = v_batch.created_by_user_id then
      select exists (
        select 1
        from public.club_memberships as membership
        join public.clubs as club
          on club.id = membership.club_id
         and club.club_status = 'active'
        join public.club_role_assignments as assignment
          on assignment.membership_id = membership.id
         and assignment.role_code = 'club_admin'
         and assignment.revoked_at is null
        where membership.user_id = p_actor_user_id
          and membership.club_id = v_batch.nominating_club_id
          and membership.membership_status = 'active'
          and private.club_user_has_permission(
            p_actor_user_id,
            v_batch.nominating_club_id,
            'club.achievement_applications.manage'
          )
      ) into v_allowed;
    end if;
  end if;

  if not v_allowed then
    select exists (
      select 1
      from public.user_accounts as account
      join public.platform_role_permissions as mapping
        on mapping.platform_role = account.platform_role
      join public.platform_permission_definitions as permission
        on permission.code = mapping.permission_code
       and permission.is_active
      where account.id = p_actor_user_id
        and account.account_status = 'active'
        and mapping.permission_code = 'hall_of_fame.evidence.read'
    ) into v_allowed;
  end if;

  if not v_allowed then
    raise exception 'HOF_EVIDENCE_READ_NOT_AUTHORIZED' using errcode = '42501';
  end if;
  return query select
    v_evidence.id, v_evidence.storage_bucket, v_evidence.storage_path,
    v_evidence.mime_type, v_evidence.byte_size,
    pg_catalog.encode(v_evidence.sha256, 'hex');
end;
$$;

create function public.list_hall_of_fame_evidence_cleanup_candidates_server(
  p_limit integer default 100
)
returns table (
  evidence_id uuid,
  actor_user_id uuid,
  application_batch_id uuid,
  application_record_id uuid,
  storage_bucket text,
  storage_path text,
  status text,
  evidence_version integer,
  batch_version integer
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.require_hall_of_fame_service_role();
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'HOF_INVALID_CLEANUP_LIMIT' using errcode = '22023';
  end if;
  return query
  select
    evidence.id, evidence.uploaded_by_user_id,
    evidence.application_batch_id, evidence.application_record_id,
    evidence.storage_bucket, evidence.storage_path, evidence.status,
    evidence.version, batch.version
  from public.hall_of_fame_evidence_files as evidence
  join public.hall_of_fame_application_batches as batch
    on batch.id = evidence.application_batch_id
  where evidence.storage_deleted_at is null
    and (
      evidence.status in ('failed', 'expired', 'replaced', 'deleted')
      or (
        evidence.status = 'pending_upload'
        and evidence.upload_expires_at <= pg_catalog.now()
      )
    )
  order by
    coalesce(evidence.storage_delete_attempted_at, evidence.created_at),
    evidence.id
  limit p_limit;
end;
$$;

create function public.mark_hall_of_fame_evidence_storage_deleted_server(
  p_evidence_id uuid,
  p_deleted boolean,
  p_error_code text,
  p_request_id uuid
)
returns table (
  evidence_id uuid,
  status text,
  storage_deleted_at timestamptz,
  storage_delete_error_code text,
  replayed boolean
)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_evidence public.hall_of_fame_evidence_files%rowtype;
  v_subject uuid;
  v_target uuid;
  v_error text := case when p_error_code is null then null
    else pg_catalog.upper(pg_catalog.btrim(p_error_code)) end;
  v_operation text := 'hall_of_fame.evidence.storage_deleted';
  v_fingerprint bytea;
  v_claim record;
  v_result jsonb;
begin
  perform private.require_hall_of_fame_service_role();
  if p_evidence_id is null or p_request_id is null or p_deleted is null
     or (p_deleted and v_error is not null)
     or (not p_deleted and (
       v_error is null or v_error !~ '^HOF_[A-Z0-9_]+$'
     )) then
    raise exception 'HOF_INVALID_STORAGE_DELETE_RESULT' using errcode = '22023';
  end if;

  select evidence.* into v_evidence
  from public.hall_of_fame_evidence_files as evidence
  where evidence.id = p_evidence_id;
  if not found then raise exception 'HOF_EVIDENCE_NOT_FOUND'; end if;
  v_subject := v_evidence.uploaded_by_user_id;
  select record.target_user_id into v_target
  from public.hall_of_fame_application_records as record
  where record.id = v_evidence.application_record_id
    and record.application_batch_id = v_evidence.application_batch_id;
  if not found then raise exception 'HOF_EVIDENCE_CONTEXT_NOT_FOUND'; end if;

  perform private.lock_hall_of_fame_mutation_request(v_subject, p_request_id);
  v_fingerprint := extensions.digest(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'evidence_id', p_evidence_id,
        'deleted', p_deleted,
        'error_code', v_error,
        'execution_actor_type', 'service_role_system'
      )::text, 'UTF8'
    ), 'sha256'
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_evidence.application_batch_id::text, 8610)
  );
  select * into v_claim
  from private.hall_of_fame_claim_request(
    v_subject, p_request_id, v_operation,
    v_evidence.application_batch_id, v_evidence.application_record_id,
    v_target, v_fingerprint
  );
  if v_claim.replayed then
    return query select
      (v_claim.result_payload->>'evidence_id')::uuid,
      v_claim.result_payload->>'status',
      nullif(v_claim.result_payload->>'storage_deleted_at', '')::timestamptz,
      nullif(v_claim.result_payload->>'storage_delete_error_code', ''),
      true;
    return;
  end if;
  select evidence.* into v_evidence
  from public.hall_of_fame_evidence_files as evidence
  where evidence.id = p_evidence_id
    and evidence.status in ('failed', 'expired', 'replaced', 'deleted')
  for update;
  if not found then
    raise exception 'HOF_EVIDENCE_NOT_CLEANABLE' using errcode = 'PT409';
  end if;

  update public.hall_of_fame_evidence_files as evidence
  set storage_delete_attempted_at = pg_catalog.now(),
      storage_deleted_at = case when p_deleted then pg_catalog.now() else null end,
      storage_delete_error_code = case when p_deleted then null else v_error end,
      updated_at = pg_catalog.now()
  where evidence.id = v_evidence.id
  returning * into v_evidence;

  v_result := pg_catalog.jsonb_build_object(
    'evidence_id', v_evidence.id,
    'status', v_evidence.status,
    'storage_deleted_at', v_evidence.storage_deleted_at,
    'storage_delete_error_code', v_evidence.storage_delete_error_code,
    'execution_actor_type', 'service_role_system'
  );
  insert into public.audit_logs (
    actor_id, actor_type, action, target_type, target_id,
    before_summary, after_summary, metadata, request_id, outcome
  ) values (
    null, 'system', v_operation,
    'hall_of_fame_evidence_file', v_evidence.id::text,
    pg_catalog.jsonb_build_object('storage_deleted', false),
    pg_catalog.jsonb_build_object('storage_deleted', p_deleted),
    pg_catalog.jsonb_build_object(
      'application_batch_id', v_evidence.application_batch_id,
      'application_record_id', v_evidence.application_record_id,
      'subject_user_id', v_subject,
      'delete_succeeded', p_deleted,
      'execution_actor_type', 'service_role_system'
    ),
    p_request_id, 'success'
  );
  perform private.complete_hall_of_fame_request(
    v_subject, p_request_id, v_operation,
    v_evidence.application_batch_id, v_evidence.application_record_id,
    v_fingerprint, v_result
  );
  return query select
    v_evidence.id, v_evidence.status, v_evidence.storage_deleted_at,
    v_evidence.storage_delete_error_code, false;
end;
$$;
revoke all on function public.get_hall_of_fame_evidence_upload_context_server(
  uuid, uuid
) from public, anon, authenticated;
grant execute on function public.get_hall_of_fame_evidence_upload_context_server(
  uuid, uuid
) to service_role;
revoke all on function public.get_hall_of_fame_evidence_read_context_server(
  uuid, uuid
) from public, anon, authenticated;
grant execute on function public.get_hall_of_fame_evidence_read_context_server(
  uuid, uuid
) to service_role;
revoke all on function public.list_hall_of_fame_evidence_cleanup_candidates_server(
  integer
) from public, anon, authenticated;
grant execute on function public.list_hall_of_fame_evidence_cleanup_candidates_server(
  integer
) to service_role;
revoke all on function public.mark_hall_of_fame_evidence_storage_deleted_server(
  uuid, boolean, text, uuid
) from public, anon, authenticated;
grant execute on function public.mark_hall_of_fame_evidence_storage_deleted_server(
  uuid, boolean, text, uuid
) to service_role;

comment on function public.create_hall_of_fame_evidence_upload_intent(
  uuid, text, text, bigint, integer, uuid
) is 'Creates a canonical private evidence upload intent without returning a Storage path or credential.';
comment on function public.create_hall_of_fame_evidence_replacement_intent(
  uuid, text, bigint, integer, uuid
) is 'Creates replacement upload metadata while the current evidence stays available.';
comment on function public.withdraw_hall_of_fame_evidence(
  uuid, integer, integer, uuid
) is 'Withdraws draft evidence atomically and leaves object deletion to the server cleanup boundary.';
comment on function public.finalize_hall_of_fame_evidence_server(
  uuid, uuid, text, bigint, text, integer, integer, uuid
) is 'Service-only finalization after actual private Storage bytes have been validated.';
comment on function public.get_hall_of_fame_evidence_read_context_server(
  uuid, uuid
) is 'Service-only authorization context for a short-lived private signed read.';
comment on function public.list_hall_of_fame_evidence_cleanup_candidates_server(
  integer
) is 'Service-only bounded orphan cleanup list; available evidence is never returned.';

create function public.get_hall_of_fame_evidence_cleanup_context_server(
  p_evidence_id uuid
)
returns table (
  evidence_id uuid,
  actor_user_id uuid,
  application_batch_id uuid,
  application_record_id uuid,
  storage_bucket text,
  storage_path text,
  status text,
  evidence_version integer,
  batch_version integer
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.require_hall_of_fame_service_role();
  return query
  select
    evidence.id, evidence.uploaded_by_user_id,
    evidence.application_batch_id, evidence.application_record_id,
    evidence.storage_bucket, evidence.storage_path, evidence.status,
    evidence.version, batch.version
  from public.hall_of_fame_evidence_files as evidence
  join public.hall_of_fame_application_batches as batch
    on batch.id = evidence.application_batch_id
  where evidence.id = p_evidence_id
    and evidence.storage_deleted_at is null
    and (
      evidence.status in ('failed', 'expired', 'replaced', 'deleted')
      or (
        evidence.status = 'pending_upload'
        and evidence.upload_expires_at <= pg_catalog.now()
      )
    );
end;
$$;

revoke all on function public.get_hall_of_fame_evidence_cleanup_context_server(uuid)
  from public, anon, authenticated;
grant execute on function public.get_hall_of_fame_evidence_cleanup_context_server(uuid)
  to service_role;

comment on function public.get_hall_of_fame_evidence_cleanup_context_server(uuid)
  is 'Service-only exact cleanup lookup that avoids bounded-list misses after replacement or withdrawal.';
