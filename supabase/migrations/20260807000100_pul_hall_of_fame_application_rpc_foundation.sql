-- PUL 8-6-B-2A: Hall of Fame eligibility and protected draft editing RPCs.
-- Submission, evidence, confirmation, review, canonical records, and badges remain deferred.

create unique index hall_of_fame_application_batches_open_draft_uidx
  on public.hall_of_fame_application_batches (
    created_by_user_id,
    application_type,
    coalesce(
      nominating_club_id,
      vacancy_context_club_id,
      '00000000-0000-0000-0000-000000000000'::uuid
    )
  )
  where status = 'draft';

create function private.set_hall_of_fame_mutation_context(
  p_actor_user_id text,
  p_request_id text,
  p_operation text,
  p_application_batch_id text,
  p_application_record_id text,
  p_payload_fingerprint text
)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  perform pg_catalog.set_config(
    'pul.hall_of_fame.actor_user_id',
    coalesce(p_actor_user_id, ''),
    true
  );
  perform pg_catalog.set_config(
    'pul.hall_of_fame.request_id',
    coalesce(p_request_id, ''),
    true
  );
  perform pg_catalog.set_config(
    'pul.hall_of_fame.operation',
    coalesce(p_operation, ''),
    true
  );
  perform pg_catalog.set_config(
    'pul.hall_of_fame.application_batch_id',
    coalesce(p_application_batch_id, ''),
    true
  );
  perform pg_catalog.set_config(
    'pul.hall_of_fame.application_record_id',
    coalesce(p_application_record_id, ''),
    true
  );
  perform pg_catalog.set_config(
    'pul.hall_of_fame.payload_fingerprint',
    coalesce(p_payload_fingerprint, ''),
    true
  );
end;
$$;

comment on function private.set_hall_of_fame_mutation_context(
  text, text, text, text, text, text
) is
  'Sets transaction-local, HOF-specific mutation context used by ledger-bound guards.';

revoke all on function private.set_hall_of_fame_mutation_context(
  text, text, text, text, text, text
) from public, anon, authenticated, service_role;

create function private.hall_of_fame_mutation_context_is_valid()
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
        pg_catalog.current_setting(
          'pul.hall_of_fame.actor_user_id',
          true
        ),
        ''
      )::uuid
      and ledger.request_id = nullif(
        pg_catalog.current_setting(
          'pul.hall_of_fame.request_id',
          true
        ),
        ''
      )::uuid
      and ledger.operation = nullif(
        pg_catalog.current_setting(
          'pul.hall_of_fame.operation',
          true
        ),
        ''
      )
      and pg_catalog.encode(ledger.payload_fingerprint, 'hex') = nullif(
        pg_catalog.current_setting(
          'pul.hall_of_fame.payload_fingerprint',
          true
        ),
        ''
      )
      and ledger.status = 'in_progress'
      and ledger.result_payload is null
      and ledger.completed_at is null
      and auth.uid() = ledger.actor_user_id
      and (
        ledger.application_batch_id = nullif(
          pg_catalog.current_setting(
            'pul.hall_of_fame.application_batch_id',
            true
          ),
          ''
        )::uuid
        or (
          ledger.application_batch_id is null
          and ledger.operation = 'hall_of_fame.application_draft.create'
        )
      )
      and (
        ledger.application_record_id = nullif(
          pg_catalog.current_setting(
            'pul.hall_of_fame.application_record_id',
            true
          ),
          ''
        )::uuid
        or (
          ledger.application_record_id is null
          and nullif(
            pg_catalog.current_setting(
              'pul.hall_of_fame.application_record_id',
              true
            ),
            ''
          ) is null
        )
        or (
          ledger.application_record_id is null
          and ledger.operation in (
            'hall_of_fame.application_draft.create',
            'hall_of_fame.application_record.add',
            'hall_of_fame.application_draft.withdraw'
          )
        )
      )
  );
$$;

comment on function private.hall_of_fame_mutation_context_is_valid() is
  'Validates the current auth actor and transaction-local context against one in-progress HOF ledger claim.';

revoke all on function private.hall_of_fame_mutation_context_is_valid()
  from public, anon, authenticated, service_role;

create or replace function private.reject_hall_of_fame_mutation()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid;
  v_request_id uuid;
  v_application_batch_id uuid;
  v_application_record_id uuid;
  v_operation text;
  v_payload_fingerprint_hex text;
begin
  if tg_op = 'DELETE' then
    raise exception 'HOF_DIRECT_DELETE_FORBIDDEN' using errcode = '42501';
  end if;

  begin
    v_actor_user_id := nullif(
      pg_catalog.current_setting('pul.hall_of_fame.actor_user_id', true),
      ''
    )::uuid;
    v_request_id := nullif(
      pg_catalog.current_setting('pul.hall_of_fame.request_id', true),
      ''
    )::uuid;
    v_application_batch_id := nullif(
      pg_catalog.current_setting(
        'pul.hall_of_fame.application_batch_id',
        true
      ),
      ''
    )::uuid;
    v_application_record_id := nullif(
      pg_catalog.current_setting(
        'pul.hall_of_fame.application_record_id',
        true
      ),
      ''
    )::uuid;
  exception
    when invalid_text_representation then
      raise exception 'HOF_INVALID_MUTATION_CONTEXT' using errcode = '42501';
  end;

  v_operation := nullif(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true),
    ''
  );
  v_payload_fingerprint_hex := nullif(
    pg_catalog.current_setting(
      'pul.hall_of_fame.payload_fingerprint',
      true
    ),
    ''
  );

  if v_actor_user_id is null
     or v_request_id is null
     or v_operation is null
     or v_payload_fingerprint_hex is null
     or auth.uid() is distinct from v_actor_user_id then
    raise exception 'HOF_MUTATION_RPC_REQUIRED' using errcode = '42501';
  end if;

  if tg_table_schema = 'private'
     and tg_table_name = 'hall_of_fame_mutation_requests' then
    if tg_op = 'INSERT' then
      if new.actor_user_id <> v_actor_user_id
         or new.request_id <> v_request_id
         or new.operation <> v_operation
         or pg_catalog.encode(new.payload_fingerprint, 'hex')
              <> v_payload_fingerprint_hex
         or new.status <> 'in_progress'
         or new.result_payload is not null
         or new.error_code is not null
         or new.completed_at is not null
         or (
           v_operation = 'hall_of_fame.application_draft.create'
           and new.application_batch_id is not null
         )
         or (
           v_operation <> 'hall_of_fame.application_draft.create'
           and new.application_batch_id is distinct from v_application_batch_id
         )
         or (
           v_operation = 'hall_of_fame.application_record.add'
           and new.application_record_id is not null
         )
         or (
           v_operation not in (
             'hall_of_fame.application_draft.create',
             'hall_of_fame.application_record.add',
             'hall_of_fame.application_draft.withdraw',
             'hall_of_fame.round_snapshot.set'
           )
           and new.application_record_id
                 is distinct from v_application_record_id
         )
         or (
           v_operation in (
             'hall_of_fame.application_draft.create',
             'hall_of_fame.application_record.add',
             'hall_of_fame.application_draft.withdraw',
             'hall_of_fame.round_snapshot.set'
           )
           and new.application_record_id is not null
         ) then
        raise exception 'HOF_LEDGER_CONTEXT_MISMATCH' using errcode = '42501';
      end if;
      return new;
    end if;

    if old.actor_user_id <> v_actor_user_id
       or old.request_id <> v_request_id
       or old.operation <> v_operation
       or pg_catalog.encode(old.payload_fingerprint, 'hex')
            <> v_payload_fingerprint_hex
       or new.actor_user_id <> old.actor_user_id
       or new.request_id <> old.request_id
       or new.operation <> old.operation
       or new.target_user_id is distinct from old.target_user_id
       or new.payload_fingerprint <> old.payload_fingerprint
       or new.created_at <> old.created_at
       or new.application_batch_id is distinct from v_application_batch_id
       or (
         new.application_record_id is distinct from old.application_record_id
         and new.application_record_id is distinct from v_application_record_id
       )
       or old.status <> 'in_progress'
       or (
         new.status = 'in_progress'
         and (
           new.result_payload is not null
           or new.error_code is not null
           or new.completed_at is not null
         )
       )
       or (
         new.status = 'completed'
         and (
           new.result_payload is null
           or new.error_code is not null
           or new.completed_at is null
         )
       )
       or new.status not in ('in_progress', 'completed') then
      raise exception 'HOF_LEDGER_CONTEXT_MISMATCH' using errcode = '42501';
    end if;
    return new;
  end if;

  if not private.hall_of_fame_mutation_context_is_valid() then
    raise exception 'HOF_MUTATION_RPC_REQUIRED' using errcode = '42501';
  end if;

  if tg_table_schema = 'public'
     and tg_table_name = 'hall_of_fame_application_batches' then
    if tg_op = 'INSERT' then
      if v_operation <> 'hall_of_fame.application_draft.create'
         or new.id <> v_application_batch_id
         or new.created_by_user_id <> v_actor_user_id
         or new.status <> 'draft'
         or new.version <> 1
         or new.submitted_at is not null
         or new.finalized_at is not null then
        raise exception 'HOF_APPLICATION_BATCH_CONTEXT_MISMATCH'
          using errcode = '42501';
      end if;
      return new;
    end if;

    if old.id <> v_application_batch_id
       or new.id <> old.id
       or new.application_type <> old.application_type
       or new.created_by_user_id <> old.created_by_user_id
       or new.created_by_membership_id is distinct from old.created_by_membership_id
       or new.nominating_club_id is distinct from old.nominating_club_id
       or new.vacancy_context_club_id is distinct from old.vacancy_context_club_id
       or new.created_at <> old.created_at
       or old.status <> 'draft'
       or new.version <> old.version + 1 then
      raise exception 'HOF_APPLICATION_BATCH_CONTEXT_MISMATCH'
        using errcode = '42501';
    end if;

    if v_operation = 'hall_of_fame.application_draft.withdraw' then
      if new.status <> 'withdrawn'
         or new.submitted_at is null
         or new.finalized_at is null then
        raise exception 'HOF_APPLICATION_BATCH_CONTEXT_MISMATCH'
          using errcode = '42501';
      end if;
    elsif v_operation in (
      'hall_of_fame.round_snapshot.set',
      'hall_of_fame.application_record.add',
      'hall_of_fame.application_record.update',
      'hall_of_fame.application_record.withdraw'
    ) then
      if new.status <> 'draft'
         or new.submitted_at is not null
         or new.finalized_at is not null then
        raise exception 'HOF_APPLICATION_BATCH_CONTEXT_MISMATCH'
          using errcode = '42501';
      end if;
    else
      raise exception 'HOF_APPLICATION_BATCH_CONTEXT_MISMATCH'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_table_schema = 'public'
     and tg_table_name = 'hall_of_fame_round_snapshots' then
    if v_operation <> 'hall_of_fame.round_snapshot.set'
       or new.application_batch_id <> v_application_batch_id
       or (
         tg_op = 'UPDATE'
         and (
           old.id <> new.id
           or old.application_batch_id <> new.application_batch_id
           or old.created_at <> new.created_at
         )
       ) then
      raise exception 'HOF_ROUND_SNAPSHOT_CONTEXT_MISMATCH'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_table_schema = 'public'
     and tg_table_name = 'hall_of_fame_application_records' then
    if new.application_batch_id <> v_application_batch_id
       or (
         v_operation <> 'hall_of_fame.application_draft.withdraw'
         and new.id <> v_application_record_id
       ) then
      raise exception 'HOF_APPLICATION_RECORD_CONTEXT_MISMATCH'
        using errcode = '42501';
    end if;

    if tg_op = 'INSERT' then
      if v_operation <> 'hall_of_fame.application_record.add'
         or new.review_status <> 'draft'
         or new.version <> 1 then
        raise exception 'HOF_APPLICATION_RECORD_CONTEXT_MISMATCH'
          using errcode = '42501';
      end if;
      return new;
    end if;

    if new.id <> old.id
       or new.application_batch_id <> old.application_batch_id
       or new.round_snapshot_id <> old.round_snapshot_id
       or new.target_user_id <> old.target_user_id
       or new.target_membership_id is distinct from old.target_membership_id
       or new.conflict_of_interest <> old.conflict_of_interest
       or new.club_verification_status <> old.club_verification_status
       or new.member_consent_status <> old.member_consent_status
       or new.fingerprint_version <> old.fingerprint_version
       or new.created_at <> old.created_at
       or old.review_status <> 'draft'
       or new.version <> old.version + 1 then
      raise exception 'HOF_APPLICATION_RECORD_CONTEXT_MISMATCH'
        using errcode = '42501';
    end if;

    if v_operation = 'hall_of_fame.application_record.update' then
      if new.review_status <> 'draft' then
        raise exception 'HOF_APPLICATION_RECORD_CONTEXT_MISMATCH'
          using errcode = '42501';
      end if;
    elsif v_operation in (
      'hall_of_fame.application_record.withdraw',
      'hall_of_fame.application_draft.withdraw'
    ) then
      if new.review_status <> 'withdrawn'
         or new.record_type_code <> old.record_type_code
         or new.course_segment_snapshot <> old.course_segment_snapshot
         or new.hole_number <> old.hole_number
         or new.hole_par is distinct from old.hole_par
         or new.strokes is distinct from old.strokes
         or new.duplicate_fingerprint is distinct from old.duplicate_fingerprint then
        raise exception 'HOF_APPLICATION_RECORD_CONTEXT_MISMATCH'
          using errcode = '42501';
      end if;
    else
      raise exception 'HOF_APPLICATION_RECORD_CONTEXT_MISMATCH'
        using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'HOF_MUTATION_RPC_REQUIRED' using errcode = '42501';
end;
$$;

comment on function private.reject_hall_of_fame_mutation() is
  'Ledger-bound B-2A guard for draft batches, round snapshots, application records, and the private request ledger.';

create or replace function private.reject_hall_of_fame_append_only_mutation()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid;
  v_request_id uuid;
  v_application_batch_id uuid;
  v_application_record_id uuid;
  v_operation text;
  v_current_status text;
  v_current_version integer;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    raise exception 'HOF_APPEND_ONLY_MUTATION_FORBIDDEN' using errcode = '42501';
  end if;

  if tg_table_schema <> 'public'
     or tg_table_name <> 'hall_of_fame_application_history' then
    raise exception 'HOF_MUTATION_RPC_REQUIRED' using errcode = '42501';
  end if;

  begin
    v_actor_user_id := nullif(
      pg_catalog.current_setting('pul.hall_of_fame.actor_user_id', true),
      ''
    )::uuid;
    v_request_id := nullif(
      pg_catalog.current_setting('pul.hall_of_fame.request_id', true),
      ''
    )::uuid;
    v_application_batch_id := nullif(
      pg_catalog.current_setting(
        'pul.hall_of_fame.application_batch_id',
        true
      ),
      ''
    )::uuid;
    v_application_record_id := nullif(
      pg_catalog.current_setting(
        'pul.hall_of_fame.application_record_id',
        true
      ),
      ''
    )::uuid;
  exception
    when invalid_text_representation then
      raise exception 'HOF_INVALID_HISTORY_CONTEXT' using errcode = '42501';
  end;

  v_operation := nullif(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true),
    ''
  );

  if not private.hall_of_fame_mutation_context_is_valid()
     or new.actor_user_id <> v_actor_user_id
     or new.request_id <> v_request_id
     or new.application_batch_id <> v_application_batch_id then
    raise exception 'HOF_APPLICATION_HISTORY_CONTEXT_MISMATCH'
      using errcode = '42501';
  end if;

  if new.scope = 'batch' then
    if new.application_record_id is not null then
      raise exception 'HOF_APPLICATION_HISTORY_CONTEXT_MISMATCH'
        using errcode = '42501';
    end if;
    select batch.status, batch.version
      into v_current_status, v_current_version
    from public.hall_of_fame_application_batches as batch
    where batch.id = v_application_batch_id;
  elsif new.scope = 'record' then
    if new.application_record_id is null
       or (
         v_operation <> 'hall_of_fame.application_draft.withdraw'
         and new.application_record_id <> v_application_record_id
       ) then
      raise exception 'HOF_APPLICATION_HISTORY_CONTEXT_MISMATCH'
        using errcode = '42501';
    end if;
    select record.review_status, record.version
      into v_current_status, v_current_version
    from public.hall_of_fame_application_records as record
    where record.id = new.application_record_id
      and record.application_batch_id = v_application_batch_id;
  else
    raise exception 'HOF_APPLICATION_HISTORY_CONTEXT_MISMATCH'
      using errcode = '42501';
  end if;

  if not found
     or new.to_status <> v_current_status
     or new.version <> v_current_version then
    raise exception 'HOF_APPLICATION_HISTORY_CONTEXT_MISMATCH'
      using errcode = '42501';
  end if;

  if new.version = 1 then
    if new.from_status is not null then
      raise exception 'HOF_APPLICATION_HISTORY_CHAIN_MISMATCH'
        using errcode = '42501';
    end if;
  elsif not exists (
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

  if not (
    (
      v_operation = 'hall_of_fame.application_draft.create'
      and new.scope = 'batch'
      and new.action = 'hall_of_fame.application_draft_created'
      and new.from_status is null
      and new.to_status = 'draft'
      and new.version = 1
    )
    or (
      v_operation = 'hall_of_fame.round_snapshot.set'
      and new.scope = 'batch'
      and new.action in (
        'hall_of_fame.round_snapshot_created',
        'hall_of_fame.round_snapshot_updated'
      )
      and new.from_status = 'draft'
      and new.to_status = 'draft'
    )
    or (
      v_operation = 'hall_of_fame.application_record.add'
      and (
        (
          new.scope = 'record'
          and new.action = 'hall_of_fame.application_record_added'
          and new.from_status is null
          and new.to_status = 'draft'
          and new.version = 1
        )
        or (
          new.scope = 'batch'
          and new.action = 'hall_of_fame.application_record_added'
          and new.from_status = 'draft'
          and new.to_status = 'draft'
        )
      )
    )
    or (
      v_operation = 'hall_of_fame.application_record.update'
      and new.action = 'hall_of_fame.application_record_updated'
      and new.from_status = 'draft'
      and new.to_status = 'draft'
    )
    or (
      v_operation = 'hall_of_fame.application_record.withdraw'
      and (
        (
          new.scope = 'record'
          and new.action = 'hall_of_fame.application_record_withdrawn'
          and new.from_status = 'draft'
          and new.to_status = 'withdrawn'
        )
        or (
          new.scope = 'batch'
          and new.action = 'hall_of_fame.application_record_withdrawn'
          and new.from_status = 'draft'
          and new.to_status = 'draft'
        )
      )
    )
    or (
      v_operation = 'hall_of_fame.application_draft.withdraw'
      and (
        (
          new.scope = 'batch'
          and new.action = 'hall_of_fame.application_draft_withdrawn'
          and new.from_status = 'draft'
          and new.to_status = 'withdrawn'
        )
        or (
          new.scope = 'record'
          and new.action =
            'hall_of_fame.application_record_withdrawn_with_draft'
          and new.from_status = 'draft'
          and new.to_status = 'withdrawn'
        )
      )
    )
  ) then
    raise exception 'HOF_APPLICATION_HISTORY_CONTEXT_MISMATCH'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function private.reject_hall_of_fame_append_only_mutation() is
  'Keeps HOF append-only tables immutable while admitting only ledger-bound B-2A application history inserts.';

create function private.hall_of_fame_claim_request(
  p_actor_user_id uuid,
  p_request_id uuid,
  p_operation text,
  p_application_batch_id uuid,
  p_application_record_id uuid,
  p_target_user_id uuid,
  p_payload_fingerprint bytea
)
returns table (
  replayed boolean,
  result_payload jsonb
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_existing private.hall_of_fame_mutation_requests%rowtype;
begin
  if p_actor_user_id is null
     or p_request_id is null
     or p_operation is null
     or p_payload_fingerprint is null
     or pg_catalog.octet_length(p_payload_fingerprint) <> 32 then
    raise exception 'HOF_INVALID_REQUEST';
  end if;

  perform private.set_hall_of_fame_mutation_context(
    p_actor_user_id::text,
    p_request_id::text,
    p_operation,
    case
      when p_application_batch_id is null then null
      else p_application_batch_id::text
    end,
    case
      when p_application_record_id is null then null
      else p_application_record_id::text
    end,
    pg_catalog.encode(p_payload_fingerprint, 'hex')
  );

  select ledger.*
    into v_existing
  from private.hall_of_fame_mutation_requests as ledger
  where ledger.actor_user_id = p_actor_user_id
    and ledger.request_id = p_request_id
  for update;

  if found then
    if v_existing.operation is distinct from p_operation
       or v_existing.payload_fingerprint is distinct from p_payload_fingerprint
       or (
         p_operation <> 'hall_of_fame.application_draft.create'
         and p_application_batch_id is not null
         and v_existing.application_batch_id
               is distinct from p_application_batch_id
       )
       or (
         p_operation <> 'hall_of_fame.application_record.add'
         and p_application_record_id is not null
         and v_existing.application_record_id
               is distinct from p_application_record_id
       )
       or v_existing.target_user_id is distinct from p_target_user_id then
      raise exception 'HOF_REQUEST_ID_PAYLOAD_MISMATCH'
        using errcode = '22023';
    end if;
    if v_existing.status = 'completed' then
      return query select true, v_existing.result_payload;
      return;
    end if;
    raise exception 'HOF_REQUEST_IN_PROGRESS' using errcode = '40001';
  end if;

  insert into private.hall_of_fame_mutation_requests (
    actor_user_id,
    request_id,
    operation,
    application_batch_id,
    application_record_id,
    target_user_id,
    payload_fingerprint
  ) values (
    p_actor_user_id,
    p_request_id,
    p_operation,
    case
      when p_operation = 'hall_of_fame.application_draft.create' then null
      else p_application_batch_id
    end,
    case
      when p_operation in (
        'hall_of_fame.application_draft.create',
        'hall_of_fame.application_record.add',
        'hall_of_fame.application_draft.withdraw',
        'hall_of_fame.round_snapshot.set'
      ) then null
      else p_application_record_id
    end,
    p_target_user_id,
    p_payload_fingerprint
  )
  on conflict on constraint hall_of_fame_mutation_requests_actor_request_unique
  do nothing;

  select ledger.*
    into v_existing
  from private.hall_of_fame_mutation_requests as ledger
  where ledger.actor_user_id = p_actor_user_id
    and ledger.request_id = p_request_id
  for update;

  if not found then
    raise exception 'HOF_REQUEST_LEDGER_UNAVAILABLE';
  end if;
  if v_existing.operation is distinct from p_operation
     or v_existing.payload_fingerprint is distinct from p_payload_fingerprint
     or (
       p_operation <> 'hall_of_fame.application_draft.create'
       and p_application_batch_id is not null
       and v_existing.application_batch_id is not null
       and v_existing.application_batch_id
             is distinct from p_application_batch_id
     )
     or v_existing.target_user_id is distinct from p_target_user_id then
    raise exception 'HOF_REQUEST_ID_PAYLOAD_MISMATCH'
      using errcode = '22023';
  end if;
  if v_existing.status = 'completed' then
    return query select true, v_existing.result_payload;
    return;
  end if;

  return query select false, null::jsonb;
end;
$$;

comment on function private.hall_of_fame_claim_request(
  uuid, uuid, text, uuid, uuid, uuid, bytea
) is
  'Claims and row-locks a HOF request, replays a completed identical request, and rejects request ID reuse.';

revoke all on function private.hall_of_fame_claim_request(
  uuid, uuid, text, uuid, uuid, uuid, bytea
) from public, anon, authenticated, service_role;

create function private.complete_hall_of_fame_request(
  p_actor_user_id uuid,
  p_request_id uuid,
  p_operation text,
  p_application_batch_id uuid,
  p_application_record_id uuid,
  p_payload_fingerprint bytea,
  p_result_payload jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_updated_count integer;
begin
  update private.hall_of_fame_mutation_requests as ledger
  set
    application_batch_id = p_application_batch_id,
    application_record_id = p_application_record_id,
    status = 'completed',
    result_payload = p_result_payload,
    completed_at = pg_catalog.now()
  where ledger.actor_user_id = p_actor_user_id
    and ledger.request_id = p_request_id
    and ledger.operation = p_operation
    and ledger.payload_fingerprint = p_payload_fingerprint
    and ledger.status = 'in_progress'
    and ledger.completed_at is null;

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 1 then
    raise exception 'HOF_REQUEST_COMPLETION_FAILED';
  end if;
end;
$$;

comment on function private.complete_hall_of_fame_request(
  uuid, uuid, text, uuid, uuid, bytea, jsonb
) is
  'Completes exactly one matching HOF request ledger row or rolls back the mutation.';

revoke all on function private.complete_hall_of_fame_request(
  uuid, uuid, text, uuid, uuid, bytea, jsonb
) from public, anon, authenticated, service_role;

-- Cross-domain authorization order for every HOF mutation is actor account,
-- per-batch advisory lock where applicable, clubs, memberships, role assignments,
-- batch, actor authorization rows, target rows, and finally the application record.
create function private.lock_hall_of_fame_authorization_boundary()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  lock table public.clubs in share mode;
  lock table public.club_memberships in share mode;
  lock table public.club_role_assignments in share mode;
end;
$$;

comment on function private.lock_hall_of_fame_authorization_boundary() is
  'Serializes HOF authorization checks against club, membership, and role-assignment writes for the remainder of the transaction.';

revoke all on function private.lock_hall_of_fame_authorization_boundary()
  from public, anon, authenticated, service_role;

create function private.lock_and_authorize_hall_of_fame_batch_edit(
  p_actor_user_id uuid,
  p_application_batch_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_batch public.hall_of_fame_application_batches%rowtype;
  v_actor_membership_id uuid;
begin
  select batch.*
    into v_batch
  from public.hall_of_fame_application_batches as batch
  where batch.id = p_application_batch_id;

  if not found then
    raise exception 'HOF_APPLICATION_NOT_FOUND';
  end if;

  if v_batch.application_type = 'direct_application' then
    if v_batch.created_by_user_id is distinct from p_actor_user_id then
      raise exception 'HOF_PERMISSION_DENIED' using errcode = '42501';
    end if;
    return null;
  end if;

  if v_batch.application_type =
       'club_admin_vacancy_direct_application' then
    if v_batch.created_by_user_id is distinct from p_actor_user_id then
      raise exception 'HOF_PERMISSION_DENIED' using errcode = '42501';
    end if;

    select membership.id
      into v_actor_membership_id
    from public.club_memberships as membership
    join public.clubs as club
      on club.id = membership.club_id
     and club.club_status = 'active'
    where membership.id = v_batch.created_by_membership_id
      and membership.user_id = p_actor_user_id
      and membership.club_id = v_batch.vacancy_context_club_id
      and membership.membership_status = 'active'
    for share of membership, club;

    if not found then
      raise exception 'HOF_PERMISSION_DENIED' using errcode = '42501';
    end if;
    return v_actor_membership_id;
  end if;

  if v_batch.application_type = 'club_nomination' then
    select membership.id
      into v_actor_membership_id
    from public.club_memberships as membership
    join public.clubs as club
      on club.id = membership.club_id
     and club.club_status = 'active'
    where membership.user_id = p_actor_user_id
      and membership.club_id = v_batch.nominating_club_id
      and membership.membership_status = 'active'
    for share of membership, club;

    if not found then
      raise exception 'HOF_PERMISSION_DENIED' using errcode = '42501';
    end if;

    perform assignment.id
    from public.club_role_assignments as assignment
    join public.club_role_definitions as role_definition
      on role_definition.role_code = assignment.role_code
     and role_definition.is_active
    where assignment.membership_id = v_actor_membership_id
      and assignment.role_code = 'club_admin'
      and assignment.revoked_at is null
    for share of assignment, role_definition;

    if not found
       or not private.club_user_has_permission(
         p_actor_user_id,
         v_batch.nominating_club_id,
         'club.achievement_applications.manage'
       ) then
      raise exception 'HOF_PERMISSION_DENIED' using errcode = '42501';
    end if;
    return v_actor_membership_id;
  end if;

  raise exception 'HOF_PERMISSION_DENIED' using errcode = '42501';
end;
$$;

comment on function private.lock_and_authorize_hall_of_fame_batch_edit(
  uuid, uuid
) is
  'Locks and rechecks the current applicant membership, club, and active club-admin assignment required to edit one draft batch.';

revoke all on function private.lock_and_authorize_hall_of_fame_batch_edit(
  uuid, uuid
) from public, anon, authenticated, service_role;

create function private.normalize_hall_of_fame_course_segment(
  p_course_segment text
)
returns text
language sql
immutable
strict
security invoker
set search_path = ''
as $$
  select nullif(
    pg_catalog.regexp_replace(
      pg_catalog.lower(pg_catalog.btrim(p_course_segment)),
      '[[:space:]]+',
      ' ',
      'g'
    ),
    ''
  );
$$;

comment on function private.normalize_hall_of_fame_course_segment(text) is
  'Canonicalizes HOF course-segment identity for storage, duplicate prechecks, no-op checks, and fingerprints.';

revoke all on function private.normalize_hall_of_fame_course_segment(
  text
) from public, anon, authenticated, service_role;

create function public.get_current_user_hall_of_fame_application_eligibility()
returns table (
  eligibility_code text,
  account_status text,
  active_membership_count bigint,
  suspended_membership_count bigint,
  eligible_nomination_clubs jsonb,
  vacant_context_clubs jsonb,
  can_create_direct_application boolean,
  can_create_club_nomination boolean,
  reason_code text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_account_status text;
  v_active_membership_count bigint := 0;
  v_suspended_membership_count bigint := 0;
  v_valid_admin_club_count bigint := 0;
  v_eligible_nomination_clubs jsonb := '[]'::jsonb;
  v_vacant_context_clubs jsonb := '[]'::jsonb;
  v_code text;
begin
  if v_actor_user_id is not null then
    select account.account_status
      into v_account_status
    from public.user_accounts as account
    where account.id = v_actor_user_id;
  end if;

  if v_actor_user_id is null
     or v_account_status is distinct from 'active' then
    return query select
      'blocked_due_to_account_status'::text,
      v_account_status,
      0::bigint,
      0::bigint,
      '[]'::jsonb,
      '[]'::jsonb,
      false,
      false,
      'HOF_ACCOUNT_NOT_ACTIVE'::text;
    return;
  end if;

  select
    count(*) filter (
      where membership.membership_status = 'active'
        and club.club_status = 'active'
    ),
    count(*) filter (
      where membership.membership_status = 'suspended'
        and club.club_status = 'active'
    )
  into
    v_active_membership_count,
    v_suspended_membership_count
  from public.club_memberships as membership
  join public.clubs as club
    on club.id = membership.club_id
  where membership.user_id = v_actor_user_id;

  select count(*)
    into v_valid_admin_club_count
  from public.club_memberships as membership
  join public.clubs as club
    on club.id = membership.club_id
   and club.club_status = 'active'
  where membership.user_id = v_actor_user_id
    and membership.membership_status = 'active'
    and private.count_active_club_admins(club.id) > 0;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'club_id', club.id,
        'membership_id', membership.id,
        'club_name', club.name,
        'is_current_user_club_admin', true,
        'has_active_club_admin', true
      )
      order by club.name, club.id
    ),
    '[]'::jsonb
  )
  into v_eligible_nomination_clubs
  from public.club_memberships as membership
  join public.clubs as club
    on club.id = membership.club_id
   and club.club_status = 'active'
  where membership.user_id = v_actor_user_id
    and membership.membership_status = 'active'
    and private.club_user_is_active_admin(v_actor_user_id, club.id)
    and private.club_user_has_permission(
      v_actor_user_id,
      club.id,
      'club.achievement_applications.nominate'
    );

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'club_id', club.id,
        'membership_id', membership.id,
        'club_name', club.name,
        'is_current_user_club_admin', false,
        'has_active_club_admin', false
      )
      order by club.name, club.id
    ),
    '[]'::jsonb
  )
  into v_vacant_context_clubs
  from public.club_memberships as membership
  join public.clubs as club
    on club.id = membership.club_id
   and club.club_status = 'active'
  where membership.user_id = v_actor_user_id
    and membership.membership_status = 'active'
    and private.count_active_club_admins(club.id) = 0;

  if v_active_membership_count = 0
     and v_suspended_membership_count > 0 then
    v_code := 'blocked_due_to_suspension';
  elsif v_active_membership_count = 0 then
    v_code := 'direct_application_allowed';
  elsif v_valid_admin_club_count > 0 then
    v_code := 'club_nomination_required';
  else
    v_code := 'direct_application_allowed_due_to_admin_vacancy';
  end if;

  return query select
    v_code,
    v_account_status,
    v_active_membership_count,
    v_suspended_membership_count,
    v_eligible_nomination_clubs,
    v_vacant_context_clubs,
    v_code in (
      'direct_application_allowed',
      'direct_application_allowed_due_to_admin_vacancy'
    ),
    pg_catalog.jsonb_array_length(v_eligible_nomination_clubs) > 0,
    case v_code
      when 'blocked_due_to_suspension'
        then 'HOF_MEMBERSHIP_SUSPENDED'
      when 'club_nomination_required'
        then 'HOF_CLUB_NOMINATION_REQUIRED'
      when 'direct_application_allowed_due_to_admin_vacancy'
        then 'HOF_CLUB_ADMIN_VACANCY_CONFIRMED'
      else 'HOF_ELIGIBLE'
    end;
end;
$$;

comment on function public.get_current_user_hall_of_fame_application_eligibility()
  is 'Returns the authenticated user current HOF application path without exposing other member identities.';

revoke all on function public.get_current_user_hall_of_fame_application_eligibility()
  from public, anon, authenticated, service_role;
grant execute on function public.get_current_user_hall_of_fame_application_eligibility()
  to authenticated;

-- Public draft and draft-editing RPCs follow.

create function public.create_hall_of_fame_application_draft(
  p_application_type text,
  p_context_club_id uuid,
  p_request_id uuid
)
returns table (
  request_id uuid,
  operation text,
  application_batch_id uuid,
  application_record_id uuid,
  batch_version integer,
  record_version integer,
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
  v_actor_user_id uuid := auth.uid();
  v_actor_status text;
  v_application_type text := nullif(pg_catalog.btrim(p_application_type), '');
  v_application_batch_id uuid := pg_catalog.gen_random_uuid();
  v_actor_membership_id uuid;
  v_active_membership_count bigint := 0;
  v_suspended_membership_count bigint := 0;
  v_valid_admin_club_count bigint := 0;
  v_payload_fingerprint bytea;
  v_claim record;
  v_result jsonb;
  v_club_id uuid;
begin
  if v_actor_user_id is null then
    raise exception 'HOF_AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if p_request_id is null
     or v_application_type not in (
       'club_nomination',
       'direct_application',
       'club_admin_vacancy_direct_application'
     ) then
    raise exception 'HOF_INVALID_REQUEST';
  end if;
  if (
    v_application_type = 'direct_application'
    and p_context_club_id is not null
  ) or (
    v_application_type <> 'direct_application'
    and p_context_club_id is null
  ) then
    raise exception 'HOF_INVALID_APPLICATION_CONTEXT';
  end if;

  select account.account_status
    into v_actor_status
  from public.user_accounts as account
  where account.id = v_actor_user_id
  for share;

  if not found or v_actor_status <> 'active' then
    raise exception 'HOF_ACCOUNT_NOT_ACTIVE' using errcode = '42501';
  end if;

  v_payload_fingerprint := extensions.digest(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'operation', 'hall_of_fame.application_draft.create',
        'application_type', v_application_type,
        'context_club_id', p_context_club_id
      )::text,
      'UTF8'
    ),
    'sha256'
  );

  select *
    into v_claim
  from private.hall_of_fame_claim_request(
    v_actor_user_id,
    p_request_id,
    'hall_of_fame.application_draft.create',
    v_application_batch_id,
    null,
    v_actor_user_id,
    v_payload_fingerprint
  );

  if v_claim.replayed then
    return query select
      p_request_id,
      (v_claim.result_payload ->> 'operation')::text,
      (v_claim.result_payload ->> 'application_batch_id')::uuid,
      null::uuid,
      (v_claim.result_payload ->> 'batch_version')::integer,
      null::integer,
      (v_claim.result_payload ->> 'changed')::boolean,
      true,
      (v_claim.result_payload ->> 'outcome')::text;
    return;
  end if;

  perform private.lock_hall_of_fame_authorization_boundary();

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_actor_user_id::text
        || ':'
        || v_application_type
        || ':'
        || coalesce(p_context_club_id::text, 'none'),
      8607
    )
  );

  if exists (
    select 1
    from public.hall_of_fame_application_batches as batch
    where batch.created_by_user_id = v_actor_user_id
      and batch.application_type = v_application_type
      and coalesce(
        batch.nominating_club_id,
        batch.vacancy_context_club_id,
        '00000000-0000-0000-0000-000000000000'::uuid
      ) = coalesce(
        p_context_club_id,
        '00000000-0000-0000-0000-000000000000'::uuid
      )
      and batch.status = 'draft'
  ) then
    raise exception 'HOF_OPEN_DRAFT_ALREADY_EXISTS' using errcode = '23505';
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
  into
    v_active_membership_count,
    v_suspended_membership_count
  from public.club_memberships as membership
  join public.clubs as club
    on club.id = membership.club_id
  where membership.user_id = v_actor_user_id;

  select pg_catalog.count(*)
    into v_valid_admin_club_count
  from public.club_memberships as membership
  join public.clubs as club
    on club.id = membership.club_id
   and club.club_status = 'active'
  where membership.user_id = v_actor_user_id
    and membership.membership_status = 'active'
    and private.count_active_club_admins(club.id) > 0;

  if v_application_type = 'direct_application' then
    if v_active_membership_count > 0 then
      if v_valid_admin_club_count > 0 then
        raise exception 'HOF_CLUB_NOMINATION_REQUIRED'
          using errcode = '42501';
      end if;
      raise exception 'HOF_DIRECT_APPLICATION_NOT_ALLOWED'
        using errcode = '42501';
    end if;
    if v_suspended_membership_count > 0 then
      raise exception 'HOF_DIRECT_APPLICATION_NOT_ALLOWED'
        using errcode = '42501';
    end if;
  elsif v_application_type = 'club_admin_vacancy_direct_application' then
    if v_active_membership_count = 0
       or v_valid_admin_club_count <> 0 then
      raise exception 'HOF_CLUB_ADMIN_VACANCY_REQUIRED'
        using errcode = '42501';
    end if;

    select membership.id
      into v_actor_membership_id
    from public.club_memberships as membership
    join public.clubs as club
      on club.id = membership.club_id
     and club.club_status = 'active'
    where membership.user_id = v_actor_user_id
      and membership.club_id = p_context_club_id
      and membership.membership_status = 'active'
    for share of membership, club;

    if not found
       or private.count_active_club_admins(p_context_club_id) <> 0 then
      raise exception 'HOF_CLUB_ADMIN_VACANCY_REQUIRED'
        using errcode = '42501';
    end if;
    v_club_id := p_context_club_id;
  else
    select membership.id
      into v_actor_membership_id
    from public.club_memberships as membership
    join public.clubs as club
      on club.id = membership.club_id
     and club.club_status = 'active'
    where membership.user_id = v_actor_user_id
      and membership.club_id = p_context_club_id
      and membership.membership_status = 'active'
    for share of membership, club;

    if not found
       or not private.club_user_is_active_admin(
         v_actor_user_id,
         p_context_club_id
       )
       or not private.club_user_has_permission(
         v_actor_user_id,
         p_context_club_id,
         'club.achievement_applications.nominate'
       ) then
      raise exception 'HOF_PERMISSION_DENIED' using errcode = '42501';
    end if;
    v_club_id := p_context_club_id;
  end if;

  insert into public.hall_of_fame_application_batches (
    id,
    application_type,
    created_by_user_id,
    created_by_membership_id,
    nominating_club_id,
    vacancy_context_club_id,
    status,
    version
  ) values (
    v_application_batch_id,
    v_application_type,
    v_actor_user_id,
    v_actor_membership_id,
    case
      when v_application_type = 'club_nomination'
        then p_context_club_id
      else null
    end,
    case
      when v_application_type =
        'club_admin_vacancy_direct_application'
        then p_context_club_id
      else null
    end,
    'draft',
    1
  );

  insert into public.hall_of_fame_application_history (
    scope,
    application_batch_id,
    application_record_id,
    from_status,
    to_status,
    version,
    actor_user_id,
    actor_membership_id,
    action,
    request_id
  ) values (
    'batch',
    v_application_batch_id,
    null,
    null,
    'draft',
    1,
    v_actor_user_id,
    v_actor_membership_id,
    'hall_of_fame.application_draft_created',
    p_request_id
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
    outcome
  ) values (
    v_actor_user_id,
    'user',
    'hall_of_fame.application_draft.create',
    'hall_of_fame_application_batch',
    v_application_batch_id::text,
    case when v_club_id is null then null else v_club_id::text end,
    null,
    pg_catalog.jsonb_build_object(
      'status', 'draft',
      'version', 1,
      'application_type', v_application_type
    ),
    null,
    pg_catalog.jsonb_build_object(
      'actor_membership_id', v_actor_membership_id
    ),
    p_request_id,
    'success'
  );

  v_result := pg_catalog.jsonb_build_object(
    'operation', 'hall_of_fame.application_draft.create',
    'application_batch_id', v_application_batch_id,
    'batch_version', 1,
    'changed', true,
    'outcome', 'success'
  );

  perform private.complete_hall_of_fame_request(
    v_actor_user_id,
    p_request_id,
    'hall_of_fame.application_draft.create',
    v_application_batch_id,
    null,
    v_payload_fingerprint,
    v_result
  );

  return query select
    p_request_id,
    'hall_of_fame.application_draft.create'::text,
    v_application_batch_id,
    null::uuid,
    1,
    null::integer,
    true,
    false,
    'success'::text;
end;
$$;

comment on function public.create_hall_of_fame_application_draft(
  text, uuid, uuid
) is
  'Creates one eligibility-checked direct, vacancy-direct, or club-admin nomination draft with ledger, history, and audit.';

revoke all on function public.create_hall_of_fame_application_draft(
  text, uuid, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.create_hall_of_fame_application_draft(
  text, uuid, uuid
) to authenticated;

create function public.set_hall_of_fame_round_snapshot(
  p_application_batch_id uuid,
  p_expected_batch_version integer,
  p_played_on date,
  p_started_at timestamptz,
  p_course_name text,
  p_course_region text,
  p_course_environment text,
  p_course_layout text,
  p_round_type text,
  p_event_name text,
  p_notes text,
  p_request_id uuid
)
returns table (
  request_id uuid,
  operation text,
  application_batch_id uuid,
  application_record_id uuid,
  batch_version integer,
  record_version integer,
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
  v_actor_user_id uuid := auth.uid();
  v_actor_status text;
  v_course_name text := nullif(pg_catalog.btrim(p_course_name), '');
  v_course_region text := nullif(pg_catalog.btrim(p_course_region), '');
  v_course_environment text :=
    nullif(pg_catalog.btrim(p_course_environment), '');
  v_course_layout text := nullif(pg_catalog.btrim(p_course_layout), '');
  v_round_type text := nullif(pg_catalog.btrim(p_round_type), '');
  v_event_name text := nullif(pg_catalog.btrim(p_event_name), '');
  v_notes text := nullif(pg_catalog.btrim(p_notes), '');
  v_payload_fingerprint bytea;
  v_claim record;
  v_batch public.hall_of_fame_application_batches%rowtype;
  v_round public.hall_of_fame_round_snapshots%rowtype;
  v_round_exists boolean := false;
  v_actor_membership_id uuid;
  v_action text;
  v_result jsonb;
  v_new_batch_version integer;
  v_club_id uuid;
begin
  if v_actor_user_id is null then
    raise exception 'HOF_AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if p_application_batch_id is null
     or p_request_id is null
     or p_expected_batch_version is null
     or p_expected_batch_version < 1
     or p_played_on is null
     or v_course_name is null
     or v_course_region is null
     or v_course_environment not in ('outdoor', 'screen')
     or v_round_type not in (
       'casual',
       'club_event',
       'tournament',
       'practice'
     )
     or pg_catalog.char_length(v_course_name) > 200
     or pg_catalog.char_length(v_course_region) > 100
     or pg_catalog.char_length(v_course_layout) > 200
     or pg_catalog.char_length(v_event_name) > 200
     or pg_catalog.char_length(v_notes) > 1000 then
    raise exception 'HOF_INVALID_ROUND_SNAPSHOT';
  end if;

  select account.account_status
    into v_actor_status
  from public.user_accounts as account
  where account.id = v_actor_user_id
  for share;
  if not found or v_actor_status <> 'active' then
    raise exception 'HOF_ACCOUNT_NOT_ACTIVE' using errcode = '42501';
  end if;

  v_payload_fingerprint := extensions.digest(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'operation', 'hall_of_fame.round_snapshot.set',
        'application_batch_id', p_application_batch_id,
        'expected_batch_version', p_expected_batch_version,
        'played_on', p_played_on,
        'started_at', p_started_at,
        'course_name', v_course_name,
        'course_region', v_course_region,
        'course_environment', v_course_environment,
        'course_layout', v_course_layout,
        'round_type', v_round_type,
        'event_name', v_event_name,
        'notes', v_notes
      )::text,
      'UTF8'
    ),
    'sha256'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_application_batch_id::text, 8608)
  );

  select *
    into v_claim
  from private.hall_of_fame_claim_request(
    v_actor_user_id,
    p_request_id,
    'hall_of_fame.round_snapshot.set',
    p_application_batch_id,
    null,
    null,
    v_payload_fingerprint
  );
  if v_claim.replayed then
    return query select
      p_request_id,
      (v_claim.result_payload ->> 'operation')::text,
      p_application_batch_id,
      null::uuid,
      (v_claim.result_payload ->> 'batch_version')::integer,
      null::integer,
      (v_claim.result_payload ->> 'changed')::boolean,
      true,
      (v_claim.result_payload ->> 'outcome')::text;
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
  if v_batch.status <> 'draft' then
    raise exception 'HOF_APPLICATION_NOT_DRAFT';
  end if;
  v_actor_membership_id :=
    private.lock_and_authorize_hall_of_fame_batch_edit(
      v_actor_user_id,
      p_application_batch_id
    );
  if v_batch.version <> p_expected_batch_version then
    raise exception 'HOF_STALE_VERSION' using errcode = '40001';
  end if;

  select snapshot.*
    into v_round
  from public.hall_of_fame_round_snapshots as snapshot
  where snapshot.application_batch_id = p_application_batch_id
  for update;
  v_round_exists := found;

  if v_round_exists
     and v_round.played_on = p_played_on
     and v_round.started_at is not distinct from p_started_at
     and v_round.course_name_snapshot = v_course_name
     and v_round.course_region_snapshot = v_course_region
     and v_round.course_environment = v_course_environment
     and v_round.course_layout_snapshot is not distinct from v_course_layout
     and v_round.round_type = v_round_type
     and v_round.event_name_snapshot is not distinct from v_event_name
     and v_round.notes is not distinct from v_notes then
    v_result := pg_catalog.jsonb_build_object(
      'operation', 'hall_of_fame.round_snapshot.set',
      'application_batch_id', p_application_batch_id,
      'batch_version', v_batch.version,
      'changed', false,
      'outcome', 'noop'
    );
    perform private.complete_hall_of_fame_request(
      v_actor_user_id,
      p_request_id,
      'hall_of_fame.round_snapshot.set',
      p_application_batch_id,
      null,
      v_payload_fingerprint,
      v_result
    );
    return query select
      p_request_id,
      'hall_of_fame.round_snapshot.set'::text,
      p_application_batch_id,
      null::uuid,
      v_batch.version,
      null::integer,
      false,
      false,
      'noop'::text;
    return;
  end if;

  if v_round_exists then
    update public.hall_of_fame_round_snapshots as snapshot
    set
      played_on = p_played_on,
      started_at = p_started_at,
      course_name_snapshot = v_course_name,
      course_region_snapshot = v_course_region,
      course_environment = v_course_environment,
      course_layout_snapshot = v_course_layout,
      round_type = v_round_type,
      event_name_snapshot = v_event_name,
      notes = v_notes
    where snapshot.id = v_round.id;
    v_action := 'hall_of_fame.round_snapshot_updated';
  else
    insert into public.hall_of_fame_round_snapshots (
      application_batch_id,
      played_on,
      started_at,
      course_name_snapshot,
      course_region_snapshot,
      course_environment,
      course_layout_snapshot,
      round_type,
      event_name_snapshot,
      notes
    ) values (
      p_application_batch_id,
      p_played_on,
      p_started_at,
      v_course_name,
      v_course_region,
      v_course_environment,
      v_course_layout,
      v_round_type,
      v_event_name,
      v_notes
    );
    v_action := 'hall_of_fame.round_snapshot_created';
  end if;

  update public.hall_of_fame_application_batches as batch
  set version = batch.version + 1
  where batch.id = p_application_batch_id
    and batch.version = p_expected_batch_version
  returning batch.version into v_new_batch_version;
  if not found then
    raise exception 'HOF_STALE_VERSION' using errcode = '40001';
  end if;

  v_club_id := coalesce(
    v_batch.nominating_club_id,
    v_batch.vacancy_context_club_id
  );

  insert into public.hall_of_fame_application_history (
    scope,
    application_batch_id,
    from_status,
    to_status,
    version,
    actor_user_id,
    actor_membership_id,
    action,
    request_id
  ) values (
    'batch',
    p_application_batch_id,
    'draft',
    'draft',
    v_new_batch_version,
    v_actor_user_id,
    v_actor_membership_id,
    v_action,
    p_request_id
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
    metadata,
    request_id,
    outcome
  ) values (
    v_actor_user_id,
    'user',
    'hall_of_fame.round_snapshot.set',
    'hall_of_fame_application_batch',
    p_application_batch_id::text,
    case when v_club_id is null then null else v_club_id::text end,
    pg_catalog.jsonb_build_object(
      'status', 'draft',
      'version', p_expected_batch_version,
      'round_snapshot_exists', v_round_exists
    ),
    pg_catalog.jsonb_build_object(
      'status', 'draft',
      'version', v_new_batch_version,
      'round_snapshot_exists', true
    ),
    pg_catalog.jsonb_build_object(
      'actor_membership_id', v_actor_membership_id,
      'history_action', v_action
    ),
    p_request_id,
    'success'
  );

  v_result := pg_catalog.jsonb_build_object(
    'operation', 'hall_of_fame.round_snapshot.set',
    'application_batch_id', p_application_batch_id,
    'batch_version', v_new_batch_version,
    'changed', true,
    'outcome', 'success'
  );
  perform private.complete_hall_of_fame_request(
    v_actor_user_id,
    p_request_id,
    'hall_of_fame.round_snapshot.set',
    p_application_batch_id,
    null,
    v_payload_fingerprint,
    v_result
  );

  return query select
    p_request_id,
    'hall_of_fame.round_snapshot.set'::text,
    p_application_batch_id,
    null::uuid,
    v_new_batch_version,
    null::integer,
    true,
    false,
    'success'::text;
end;
$$;

comment on function public.set_hall_of_fame_round_snapshot(
  uuid, integer, date, timestamptz, text, text, text, text, text, text,
  text, uuid
) is
  'Creates or updates the single normalized round snapshot for an editable draft with batch-version concurrency.';

revoke all on function public.set_hall_of_fame_round_snapshot(
  uuid, integer, date, timestamptz, text, text, text, text, text, text,
  text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.set_hall_of_fame_round_snapshot(
  uuid, integer, date, timestamptz, text, text, text, text, text, text,
  text, uuid
) to authenticated;

create function public.add_hall_of_fame_application_record(
  p_application_batch_id uuid,
  p_expected_batch_version integer,
  p_target_user_id uuid,
  p_target_membership_id uuid,
  p_record_type_code text,
  p_course_segment text,
  p_hole_number integer,
  p_hole_par integer,
  p_strokes integer,
  p_request_id uuid
)
returns table (
  request_id uuid,
  operation text,
  application_batch_id uuid,
  application_record_id uuid,
  batch_version integer,
  record_version integer,
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
  v_actor_user_id uuid := auth.uid();
  v_actor_status text;
  v_record_type_code text := nullif(pg_catalog.btrim(p_record_type_code), '');
  v_course_segment text :=
    private.normalize_hall_of_fame_course_segment(p_course_segment);
  v_application_record_id uuid := pg_catalog.gen_random_uuid();
  v_payload_fingerprint bytea;
  v_claim record;
  v_batch public.hall_of_fame_application_batches%rowtype;
  v_round public.hall_of_fame_round_snapshots%rowtype;
  v_target_account_status text;
  v_actor_membership_id uuid;
  v_target_distinct_count bigint;
  v_conflict_of_interest boolean := false;
  v_club_verification_status text;
  v_duplicate_fingerprint bytea;
  v_new_batch_version integer;
  v_club_id uuid;
  v_result jsonb;
begin
  if v_actor_user_id is null then
    raise exception 'HOF_AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if p_application_batch_id is null
     or p_target_user_id is null
     or p_request_id is null
     or p_expected_batch_version is null
     or p_expected_batch_version < 1
     or v_record_type_code is null
     or v_course_segment is null
     or pg_catalog.char_length(v_course_segment) > 100
     or p_hole_number not between 1 and 36
     or (p_hole_par is not null and p_hole_par not between 1 and 9)
     or (p_strokes is not null and p_strokes not between 1 and 99) then
    raise exception 'HOF_INVALID_RECORD';
  end if;

  select account.account_status
    into v_actor_status
  from public.user_accounts as account
  where account.id = v_actor_user_id
  for share;
  if not found or v_actor_status <> 'active' then
    raise exception 'HOF_ACCOUNT_NOT_ACTIVE' using errcode = '42501';
  end if;

  v_payload_fingerprint := extensions.digest(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'operation', 'hall_of_fame.application_record.add',
        'application_batch_id', p_application_batch_id,
        'expected_batch_version', p_expected_batch_version,
        'target_user_id', p_target_user_id,
        'target_membership_id', p_target_membership_id,
        'record_type_code', v_record_type_code,
        'course_segment', v_course_segment,
        'hole_number', p_hole_number,
        'hole_par', p_hole_par,
        'strokes', p_strokes
      )::text,
      'UTF8'
    ),
    'sha256'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_application_batch_id::text, 8608)
  );

  select *
    into v_claim
  from private.hall_of_fame_claim_request(
    v_actor_user_id,
    p_request_id,
    'hall_of_fame.application_record.add',
    p_application_batch_id,
    v_application_record_id,
    p_target_user_id,
    v_payload_fingerprint
  );
  if v_claim.replayed then
    return query select
      p_request_id,
      (v_claim.result_payload ->> 'operation')::text,
      p_application_batch_id,
      (v_claim.result_payload ->> 'application_record_id')::uuid,
      (v_claim.result_payload ->> 'batch_version')::integer,
      (v_claim.result_payload ->> 'record_version')::integer,
      (v_claim.result_payload ->> 'changed')::boolean,
      true,
      (v_claim.result_payload ->> 'outcome')::text;
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
  if v_batch.status <> 'draft' then
    raise exception 'HOF_APPLICATION_NOT_DRAFT';
  end if;
  v_actor_membership_id :=
    private.lock_and_authorize_hall_of_fame_batch_edit(
      v_actor_user_id,
      p_application_batch_id
    );
  if v_batch.version <> p_expected_batch_version then
    raise exception 'HOF_STALE_VERSION' using errcode = '40001';
  end if;

  select snapshot.*
    into v_round
  from public.hall_of_fame_round_snapshots as snapshot
  where snapshot.application_batch_id = p_application_batch_id
  for share;
  if not found then
    raise exception 'HOF_ROUND_SNAPSHOT_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.hall_of_fame_record_type_definitions as definition
    where definition.code = v_record_type_code
      and definition.is_active
  ) then
    raise exception 'HOF_RECORD_TYPE_NOT_ACTIVE';
  end if;

  select account.account_status
    into v_target_account_status
  from public.user_accounts as account
  where account.id = p_target_user_id
  for share;
  if not found or v_target_account_status <> 'active' then
    raise exception 'HOF_TARGET_NOT_ACTIVE_MEMBER' using errcode = '42501';
  end if;

  if v_batch.application_type = 'club_nomination' then
    if p_target_membership_id is null then
      raise exception 'HOF_TARGET_NOT_ACTIVE_MEMBER' using errcode = '42501';
    end if;

    perform 1
    from public.club_memberships as membership
    where membership.id = p_target_membership_id
      and membership.user_id = p_target_user_id
      and membership.club_id = v_batch.nominating_club_id
      and membership.membership_status = 'active'
    for share;

    if not found then
      if exists (
        select 1
        from public.club_memberships as membership
        where membership.id = p_target_membership_id
          and membership.user_id = p_target_user_id
          and membership.membership_status = 'active'
      ) then
        raise exception 'HOF_TARGET_CLUB_MISMATCH' using errcode = '42501';
      end if;
      raise exception 'HOF_TARGET_NOT_ACTIVE_MEMBER' using errcode = '42501';
    end if;
    v_conflict_of_interest := p_target_user_id = v_actor_user_id;
    v_club_verification_status := case
      when v_conflict_of_interest then 'conflict_review_required'
      else 'pending'
    end;
  else
    if p_target_user_id <> v_actor_user_id then
      raise exception 'HOF_DIRECT_APPLICATION_TARGET_MUST_BE_SELF'
        using errcode = '42501';
    end if;
    if v_batch.application_type = 'direct_application'
       and p_target_membership_id is not null then
      raise exception 'HOF_TARGET_MEMBERSHIP_NOT_ALLOWED';
    end if;
    if v_batch.application_type =
         'club_admin_vacancy_direct_application' then
      if p_target_membership_id
           is distinct from v_batch.created_by_membership_id then
        raise exception 'HOF_TARGET_CLUB_MISMATCH' using errcode = '42501';
      end if;
      perform 1
      from public.club_memberships as membership
      where membership.id = p_target_membership_id
        and membership.user_id = v_actor_user_id
        and membership.club_id = v_batch.vacancy_context_club_id
        and membership.membership_status = 'active'
      for share;
      if not found then
        raise exception 'HOF_TARGET_NOT_ACTIVE_MEMBER'
          using errcode = '42501';
      end if;
    end if;
    v_club_verification_status := 'not_applicable';
  end if;

  select count(distinct record.target_user_id)
    into v_target_distinct_count
  from public.hall_of_fame_application_records as record
  where record.application_batch_id = p_application_batch_id;

  if not exists (
    select 1
    from public.hall_of_fame_application_records as record
    where record.application_batch_id = p_application_batch_id
      and record.target_user_id = p_target_user_id
  ) and v_target_distinct_count >= 20 then
    raise exception 'HOF_RECORD_LIMIT_EXCEEDED' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.hall_of_fame_application_records as record
    where record.application_batch_id = p_application_batch_id
      and record.target_user_id = p_target_user_id
      and record.course_segment_snapshot = v_course_segment
      and record.hole_number = p_hole_number
  ) then
    raise exception 'HOF_DUPLICATE_RECORD' using errcode = '23505';
  end if;

  v_duplicate_fingerprint := extensions.digest(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'target_user_id', p_target_user_id,
        'record_type_code', v_record_type_code,
        'played_on', v_round.played_on,
        'course_name', pg_catalog.lower(v_round.course_name_snapshot),
        'course_region', pg_catalog.lower(v_round.course_region_snapshot),
        'course_environment', v_round.course_environment,
        'course_segment', v_course_segment,
        'hole_number', p_hole_number
      )::text,
      'UTF8'
    ),
    'sha256'
  );

  insert into public.hall_of_fame_application_records (
    id,
    application_batch_id,
    round_snapshot_id,
    target_user_id,
    target_membership_id,
    record_type_code,
    course_segment_snapshot,
    hole_number,
    hole_par,
    strokes,
    club_verification_status,
    member_consent_status,
    review_status,
    conflict_of_interest,
    fingerprint_version,
    duplicate_fingerprint,
    version
  ) values (
    v_application_record_id,
    p_application_batch_id,
    v_round.id,
    p_target_user_id,
    p_target_membership_id,
    v_record_type_code,
    v_course_segment,
    p_hole_number,
    p_hole_par,
    p_strokes,
    v_club_verification_status,
    'pending',
    'draft',
    v_conflict_of_interest,
    1,
    v_duplicate_fingerprint,
    1
  );

  update public.hall_of_fame_application_batches as batch
  set version = batch.version + 1
  where batch.id = p_application_batch_id
    and batch.version = p_expected_batch_version
  returning batch.version into v_new_batch_version;
  if not found then
    raise exception 'HOF_STALE_VERSION' using errcode = '40001';
  end if;

  v_club_id := coalesce(
    v_batch.nominating_club_id,
    v_batch.vacancy_context_club_id
  );

  insert into public.hall_of_fame_application_history (
    scope,
    application_batch_id,
    application_record_id,
    from_status,
    to_status,
    version,
    actor_user_id,
    actor_membership_id,
    action,
    request_id
  ) values
    (
      'record',
      p_application_batch_id,
      v_application_record_id,
      null,
      'draft',
      1,
      v_actor_user_id,
      v_actor_membership_id,
      'hall_of_fame.application_record_added',
      p_request_id
    ),
    (
      'batch',
      p_application_batch_id,
      null,
      'draft',
      'draft',
      v_new_batch_version,
      v_actor_user_id,
      v_actor_membership_id,
      'hall_of_fame.application_record_added',
      p_request_id
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
    metadata,
    request_id,
    outcome
  ) values (
    v_actor_user_id,
    'user',
    'hall_of_fame.application_record.add',
    'hall_of_fame_application_record',
    v_application_record_id::text,
    case when v_club_id is null then null else v_club_id::text end,
    null,
    pg_catalog.jsonb_build_object(
      'review_status', 'draft',
      'record_version', 1,
      'batch_version', v_new_batch_version
    ),
    pg_catalog.jsonb_build_object(
      'application_batch_id', p_application_batch_id,
      'actor_membership_id', v_actor_membership_id,
      'target_membership_id', p_target_membership_id,
      'conflict_of_interest', v_conflict_of_interest
    ),
    p_request_id,
    'success'
  );

  v_result := pg_catalog.jsonb_build_object(
    'operation', 'hall_of_fame.application_record.add',
    'application_batch_id', p_application_batch_id,
    'application_record_id', v_application_record_id,
    'batch_version', v_new_batch_version,
    'record_version', 1,
    'changed', true,
    'outcome', 'success'
  );
  perform private.complete_hall_of_fame_request(
    v_actor_user_id,
    p_request_id,
    'hall_of_fame.application_record.add',
    p_application_batch_id,
    v_application_record_id,
    v_payload_fingerprint,
    v_result
  );

  return query select
    p_request_id,
    'hall_of_fame.application_record.add'::text,
    p_application_batch_id,
    v_application_record_id,
    v_new_batch_version,
    1,
    true,
    false,
    'success'::text;
end;
$$;

comment on function public.add_hall_of_fame_application_record(
  uuid, integer, uuid, uuid, text, text, integer, integer, integer, uuid
) is
  'Adds one server-fingerprinted self or same-club target record to an editable draft and advances batch history.';

revoke all on function public.add_hall_of_fame_application_record(
  uuid, integer, uuid, uuid, text, text, integer, integer, integer, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.add_hall_of_fame_application_record(
  uuid, integer, uuid, uuid, text, text, integer, integer, integer, uuid
) to authenticated;

create function public.update_hall_of_fame_application_record(
  p_application_record_id uuid,
  p_expected_record_version integer,
  p_expected_batch_version integer,
  p_record_type_code text,
  p_course_segment text,
  p_hole_number integer,
  p_hole_par integer,
  p_strokes integer,
  p_request_id uuid
)
returns table (
  request_id uuid,
  operation text,
  application_batch_id uuid,
  application_record_id uuid,
  batch_version integer,
  record_version integer,
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
  v_actor_user_id uuid := auth.uid();
  v_actor_status text;
  v_record_type_code text := nullif(pg_catalog.btrim(p_record_type_code), '');
  v_course_segment text :=
    private.normalize_hall_of_fame_course_segment(p_course_segment);
  v_application_batch_id uuid;
  v_payload_fingerprint bytea;
  v_claim record;
  v_batch public.hall_of_fame_application_batches%rowtype;
  v_record public.hall_of_fame_application_records%rowtype;
  v_round public.hall_of_fame_round_snapshots%rowtype;
  v_duplicate_fingerprint bytea;
  v_actor_membership_id uuid;
  v_new_batch_version integer;
  v_new_record_version integer;
  v_club_id uuid;
  v_result jsonb;
begin
  if v_actor_user_id is null then
    raise exception 'HOF_AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if p_application_record_id is null
     or p_request_id is null
     or p_expected_record_version is null
     or p_expected_record_version < 1
     or p_expected_batch_version is null
     or p_expected_batch_version < 1
     or v_record_type_code is null
     or v_course_segment is null
     or pg_catalog.char_length(v_course_segment) > 100
     or p_hole_number not between 1 and 36
     or (p_hole_par is not null and p_hole_par not between 1 and 9)
     or (p_strokes is not null and p_strokes not between 1 and 99) then
    raise exception 'HOF_INVALID_RECORD';
  end if;

  select account.account_status
    into v_actor_status
  from public.user_accounts as account
  where account.id = v_actor_user_id
  for share;
  if not found or v_actor_status <> 'active' then
    raise exception 'HOF_ACCOUNT_NOT_ACTIVE' using errcode = '42501';
  end if;

  select record.application_batch_id
    into v_application_batch_id
  from public.hall_of_fame_application_records as record
  where record.id = p_application_record_id;
  if not found then
    raise exception 'HOF_APPLICATION_RECORD_NOT_FOUND';
  end if;

  v_payload_fingerprint := extensions.digest(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'operation', 'hall_of_fame.application_record.update',
        'application_record_id', p_application_record_id,
        'application_batch_id', v_application_batch_id,
        'expected_record_version', p_expected_record_version,
        'expected_batch_version', p_expected_batch_version,
        'record_type_code', v_record_type_code,
        'course_segment', v_course_segment,
        'hole_number', p_hole_number,
        'hole_par', p_hole_par,
        'strokes', p_strokes
      )::text,
      'UTF8'
    ),
    'sha256'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_application_batch_id::text, 8608)
  );

  select *
    into v_claim
  from private.hall_of_fame_claim_request(
    v_actor_user_id,
    p_request_id,
    'hall_of_fame.application_record.update',
    v_application_batch_id,
    p_application_record_id,
    null,
    v_payload_fingerprint
  );
  if v_claim.replayed then
    return query select
      p_request_id,
      (v_claim.result_payload ->> 'operation')::text,
      v_application_batch_id,
      p_application_record_id,
      (v_claim.result_payload ->> 'batch_version')::integer,
      (v_claim.result_payload ->> 'record_version')::integer,
      (v_claim.result_payload ->> 'changed')::boolean,
      true,
      (v_claim.result_payload ->> 'outcome')::text;
    return;
  end if;

  perform private.lock_hall_of_fame_authorization_boundary();

  select batch.*
    into v_batch
  from public.hall_of_fame_application_batches as batch
  where batch.id = v_application_batch_id
  for update;
  if not found then
    raise exception 'HOF_APPLICATION_NOT_FOUND';
  end if;
  if v_batch.status <> 'draft' then
    raise exception 'HOF_APPLICATION_NOT_DRAFT';
  end if;
  v_actor_membership_id :=
    private.lock_and_authorize_hall_of_fame_batch_edit(
      v_actor_user_id,
      v_application_batch_id
    );
  if v_batch.version <> p_expected_batch_version then
    raise exception 'HOF_STALE_VERSION' using errcode = '40001';
  end if;

  select record.*
    into v_record
  from public.hall_of_fame_application_records as record
  where record.id = p_application_record_id
    and record.application_batch_id = v_application_batch_id
  for update;
  if not found then
    raise exception 'HOF_APPLICATION_RECORD_NOT_FOUND';
  end if;
  if v_record.review_status <> 'draft' then
    raise exception 'HOF_APPLICATION_RECORD_NOT_DRAFT';
  end if;
  if v_record.version <> p_expected_record_version then
    raise exception 'HOF_STALE_VERSION' using errcode = '40001';
  end if;

  if not exists (
    select 1
    from public.hall_of_fame_record_type_definitions as definition
    where definition.code = v_record_type_code
      and definition.is_active
  ) then
    raise exception 'HOF_RECORD_TYPE_NOT_ACTIVE';
  end if;

  if v_record.record_type_code = v_record_type_code
     and v_record.course_segment_snapshot = v_course_segment
     and v_record.hole_number = p_hole_number
     and v_record.hole_par is not distinct from p_hole_par
     and v_record.strokes is not distinct from p_strokes then
    v_result := pg_catalog.jsonb_build_object(
      'operation', 'hall_of_fame.application_record.update',
      'application_batch_id', v_application_batch_id,
      'application_record_id', p_application_record_id,
      'batch_version', v_batch.version,
      'record_version', v_record.version,
      'changed', false,
      'outcome', 'noop'
    );
    perform private.complete_hall_of_fame_request(
      v_actor_user_id,
      p_request_id,
      'hall_of_fame.application_record.update',
      v_application_batch_id,
      p_application_record_id,
      v_payload_fingerprint,
      v_result
    );
    return query select
      p_request_id,
      'hall_of_fame.application_record.update'::text,
      v_application_batch_id,
      p_application_record_id,
      v_batch.version,
      v_record.version,
      false,
      false,
      'noop'::text;
    return;
  end if;

  if exists (
    select 1
    from public.hall_of_fame_application_records as duplicate_record
    where duplicate_record.application_batch_id = v_application_batch_id
      and duplicate_record.target_user_id = v_record.target_user_id
      and duplicate_record.course_segment_snapshot = v_course_segment
      and duplicate_record.hole_number = p_hole_number
      and duplicate_record.id <> p_application_record_id
  ) then
    raise exception 'HOF_DUPLICATE_RECORD' using errcode = '23505';
  end if;

  select snapshot.*
    into v_round
  from public.hall_of_fame_round_snapshots as snapshot
  where snapshot.id = v_record.round_snapshot_id
    and snapshot.application_batch_id = v_application_batch_id
  for share;
  if not found then
    raise exception 'HOF_ROUND_SNAPSHOT_REQUIRED';
  end if;

  v_duplicate_fingerprint := extensions.digest(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'target_user_id', v_record.target_user_id,
        'record_type_code', v_record_type_code,
        'played_on', v_round.played_on,
        'course_name', pg_catalog.lower(v_round.course_name_snapshot),
        'course_region', pg_catalog.lower(v_round.course_region_snapshot),
        'course_environment', v_round.course_environment,
        'course_segment', v_course_segment,
        'hole_number', p_hole_number
      )::text,
      'UTF8'
    ),
    'sha256'
  );

  update public.hall_of_fame_application_records as record
  set
    record_type_code = v_record_type_code,
    course_segment_snapshot = v_course_segment,
    hole_number = p_hole_number,
    hole_par = p_hole_par,
    strokes = p_strokes,
    duplicate_fingerprint = v_duplicate_fingerprint,
    version = record.version + 1
  where record.id = p_application_record_id
    and record.version = p_expected_record_version
  returning record.version into v_new_record_version;
  if not found then
    raise exception 'HOF_STALE_VERSION' using errcode = '40001';
  end if;

  update public.hall_of_fame_application_batches as batch
  set version = batch.version + 1
  where batch.id = v_application_batch_id
    and batch.version = p_expected_batch_version
  returning batch.version into v_new_batch_version;
  if not found then
    raise exception 'HOF_STALE_VERSION' using errcode = '40001';
  end if;

  v_club_id := coalesce(
    v_batch.nominating_club_id,
    v_batch.vacancy_context_club_id
  );

  insert into public.hall_of_fame_application_history (
    scope,
    application_batch_id,
    application_record_id,
    from_status,
    to_status,
    version,
    actor_user_id,
    actor_membership_id,
    action,
    request_id
  ) values
    (
      'record',
      v_application_batch_id,
      p_application_record_id,
      'draft',
      'draft',
      v_new_record_version,
      v_actor_user_id,
      v_actor_membership_id,
      'hall_of_fame.application_record_updated',
      p_request_id
    ),
    (
      'batch',
      v_application_batch_id,
      null,
      'draft',
      'draft',
      v_new_batch_version,
      v_actor_user_id,
      v_actor_membership_id,
      'hall_of_fame.application_record_updated',
      p_request_id
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
    metadata,
    request_id,
    outcome
  ) values (
    v_actor_user_id,
    'user',
    'hall_of_fame.application_record.update',
    'hall_of_fame_application_record',
    p_application_record_id::text,
    case when v_club_id is null then null else v_club_id::text end,
    pg_catalog.jsonb_build_object(
      'review_status', v_record.review_status,
      'record_version', v_record.version,
      'batch_version', v_batch.version
    ),
    pg_catalog.jsonb_build_object(
      'review_status', 'draft',
      'record_version', v_new_record_version,
      'batch_version', v_new_batch_version
    ),
    pg_catalog.jsonb_build_object(
      'application_batch_id', v_application_batch_id,
      'actor_membership_id', v_actor_membership_id
    ),
    p_request_id,
    'success'
  );

  v_result := pg_catalog.jsonb_build_object(
    'operation', 'hall_of_fame.application_record.update',
    'application_batch_id', v_application_batch_id,
    'application_record_id', p_application_record_id,
    'batch_version', v_new_batch_version,
    'record_version', v_new_record_version,
    'changed', true,
    'outcome', 'success'
  );
  perform private.complete_hall_of_fame_request(
    v_actor_user_id,
    p_request_id,
    'hall_of_fame.application_record.update',
    v_application_batch_id,
    p_application_record_id,
    v_payload_fingerprint,
    v_result
  );

  return query select
    p_request_id,
    'hall_of_fame.application_record.update'::text,
    v_application_batch_id,
    p_application_record_id,
    v_new_batch_version,
    v_new_record_version,
    true,
    false,
    'success'::text;
end;
$$;

comment on function public.update_hall_of_fame_application_record(
  uuid, integer, integer, text, text, integer, integer, integer, uuid
) is
  'Updates only editable score fields of one draft record with record and batch expected-version checks.';

revoke all on function public.update_hall_of_fame_application_record(
  uuid, integer, integer, text, text, integer, integer, integer, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.update_hall_of_fame_application_record(
  uuid, integer, integer, text, text, integer, integer, integer, uuid
) to authenticated;

create function public.withdraw_hall_of_fame_application_record(
  p_application_record_id uuid,
  p_expected_record_version integer,
  p_expected_batch_version integer,
  p_reason text,
  p_request_id uuid
)
returns table (
  request_id uuid,
  operation text,
  application_batch_id uuid,
  application_record_id uuid,
  batch_version integer,
  record_version integer,
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
  v_actor_user_id uuid := auth.uid();
  v_actor_status text;
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_application_batch_id uuid;
  v_payload_fingerprint bytea;
  v_claim record;
  v_batch public.hall_of_fame_application_batches%rowtype;
  v_record public.hall_of_fame_application_records%rowtype;
  v_actor_membership_id uuid;
  v_new_batch_version integer;
  v_new_record_version integer;
  v_club_id uuid;
  v_result jsonb;
begin
  if v_actor_user_id is null then
    raise exception 'HOF_AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if p_application_record_id is null
     or p_request_id is null
     or p_expected_record_version is null
     or p_expected_record_version < 1
     or p_expected_batch_version is null
     or p_expected_batch_version < 1
     or pg_catalog.char_length(v_reason) > 1000 then
    raise exception 'HOF_INVALID_REQUEST';
  end if;

  select account.account_status
    into v_actor_status
  from public.user_accounts as account
  where account.id = v_actor_user_id
  for share;
  if not found or v_actor_status <> 'active' then
    raise exception 'HOF_ACCOUNT_NOT_ACTIVE' using errcode = '42501';
  end if;

  select record.application_batch_id
    into v_application_batch_id
  from public.hall_of_fame_application_records as record
  where record.id = p_application_record_id;
  if not found then
    raise exception 'HOF_APPLICATION_RECORD_NOT_FOUND';
  end if;

  v_payload_fingerprint := extensions.digest(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'operation', 'hall_of_fame.application_record.withdraw',
        'application_record_id', p_application_record_id,
        'application_batch_id', v_application_batch_id,
        'expected_record_version', p_expected_record_version,
        'expected_batch_version', p_expected_batch_version,
        'reason', v_reason
      )::text,
      'UTF8'
    ),
    'sha256'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_application_batch_id::text, 8608)
  );

  select *
    into v_claim
  from private.hall_of_fame_claim_request(
    v_actor_user_id,
    p_request_id,
    'hall_of_fame.application_record.withdraw',
    v_application_batch_id,
    p_application_record_id,
    null,
    v_payload_fingerprint
  );
  if v_claim.replayed then
    return query select
      p_request_id,
      (v_claim.result_payload ->> 'operation')::text,
      v_application_batch_id,
      p_application_record_id,
      (v_claim.result_payload ->> 'batch_version')::integer,
      (v_claim.result_payload ->> 'record_version')::integer,
      (v_claim.result_payload ->> 'changed')::boolean,
      true,
      (v_claim.result_payload ->> 'outcome')::text;
    return;
  end if;

  perform private.lock_hall_of_fame_authorization_boundary();

  select batch.*
    into v_batch
  from public.hall_of_fame_application_batches as batch
  where batch.id = v_application_batch_id
  for update;
  if not found then
    raise exception 'HOF_APPLICATION_NOT_FOUND';
  end if;
  if v_batch.status <> 'draft' then
    raise exception 'HOF_APPLICATION_NOT_DRAFT';
  end if;
  v_actor_membership_id :=
    private.lock_and_authorize_hall_of_fame_batch_edit(
      v_actor_user_id,
      v_application_batch_id
    );
  if v_batch.version <> p_expected_batch_version then
    raise exception 'HOF_STALE_VERSION' using errcode = '40001';
  end if;

  select record.*
    into v_record
  from public.hall_of_fame_application_records as record
  where record.id = p_application_record_id
    and record.application_batch_id = v_application_batch_id
  for update;
  if not found then
    raise exception 'HOF_APPLICATION_RECORD_NOT_FOUND';
  end if;
  if v_record.review_status <> 'draft' then
    raise exception 'HOF_APPLICATION_RECORD_NOT_DRAFT';
  end if;
  if v_record.version <> p_expected_record_version then
    raise exception 'HOF_STALE_VERSION' using errcode = '40001';
  end if;

  update public.hall_of_fame_application_records as record
  set
    review_status = 'withdrawn',
    version = record.version + 1
  where record.id = p_application_record_id
    and record.version = p_expected_record_version
  returning record.version into v_new_record_version;
  if not found then
    raise exception 'HOF_STALE_VERSION' using errcode = '40001';
  end if;

  update public.hall_of_fame_application_batches as batch
  set version = batch.version + 1
  where batch.id = v_application_batch_id
    and batch.version = p_expected_batch_version
  returning batch.version into v_new_batch_version;
  if not found then
    raise exception 'HOF_STALE_VERSION' using errcode = '40001';
  end if;

  v_club_id := coalesce(
    v_batch.nominating_club_id,
    v_batch.vacancy_context_club_id
  );

  insert into public.hall_of_fame_application_history (
    scope,
    application_batch_id,
    application_record_id,
    from_status,
    to_status,
    version,
    actor_user_id,
    actor_membership_id,
    action,
    reason,
    request_id
  ) values
    (
      'record',
      v_application_batch_id,
      p_application_record_id,
      'draft',
      'withdrawn',
      v_new_record_version,
      v_actor_user_id,
      v_actor_membership_id,
      'hall_of_fame.application_record_withdrawn',
      v_reason,
      p_request_id
    ),
    (
      'batch',
      v_application_batch_id,
      null,
      'draft',
      'draft',
      v_new_batch_version,
      v_actor_user_id,
      v_actor_membership_id,
      'hall_of_fame.application_record_withdrawn',
      v_reason,
      p_request_id
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
    outcome
  ) values (
    v_actor_user_id,
    'user',
    'hall_of_fame.application_record.withdraw',
    'hall_of_fame_application_record',
    p_application_record_id::text,
    case when v_club_id is null then null else v_club_id::text end,
    pg_catalog.jsonb_build_object(
      'review_status', 'draft',
      'record_version', v_record.version,
      'batch_version', v_batch.version
    ),
    pg_catalog.jsonb_build_object(
      'review_status', 'withdrawn',
      'record_version', v_new_record_version,
      'batch_version', v_new_batch_version
    ),
    v_reason,
    pg_catalog.jsonb_build_object(
      'application_batch_id', v_application_batch_id,
      'actor_membership_id', v_actor_membership_id
    ),
    p_request_id,
    'success'
  );

  v_result := pg_catalog.jsonb_build_object(
    'operation', 'hall_of_fame.application_record.withdraw',
    'application_batch_id', v_application_batch_id,
    'application_record_id', p_application_record_id,
    'batch_version', v_new_batch_version,
    'record_version', v_new_record_version,
    'changed', true,
    'outcome', 'success'
  );
  perform private.complete_hall_of_fame_request(
    v_actor_user_id,
    p_request_id,
    'hall_of_fame.application_record.withdraw',
    v_application_batch_id,
    p_application_record_id,
    v_payload_fingerprint,
    v_result
  );

  return query select
    p_request_id,
    'hall_of_fame.application_record.withdraw'::text,
    v_application_batch_id,
    p_application_record_id,
    v_new_batch_version,
    v_new_record_version,
    true,
    false,
    'success'::text;
end;
$$;

comment on function public.withdraw_hall_of_fame_application_record(
  uuid, integer, integer, text, uuid
) is
  'Soft-withdraws one draft record without deleting its fingerprint, history, or batch relationship.';

revoke all on function public.withdraw_hall_of_fame_application_record(
  uuid, integer, integer, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.withdraw_hall_of_fame_application_record(
  uuid, integer, integer, text, uuid
) to authenticated;

create function public.withdraw_hall_of_fame_application_draft(
  p_application_batch_id uuid,
  p_expected_batch_version integer,
  p_reason text,
  p_request_id uuid
)
returns table (
  request_id uuid,
  operation text,
  application_batch_id uuid,
  application_record_id uuid,
  batch_version integer,
  record_version integer,
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
  v_actor_user_id uuid := auth.uid();
  v_actor_status text;
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_payload_fingerprint bytea;
  v_claim record;
  v_batch public.hall_of_fame_application_batches%rowtype;
  v_actor_membership_id uuid;
  v_new_batch_version integer;
  v_withdrawn_record_count integer := 0;
  v_club_id uuid;
  v_result jsonb;
  v_now timestamptz := pg_catalog.now();
begin
  if v_actor_user_id is null then
    raise exception 'HOF_AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if p_application_batch_id is null
     or p_request_id is null
     or p_expected_batch_version is null
     or p_expected_batch_version < 1
     or pg_catalog.char_length(v_reason) > 1000 then
    raise exception 'HOF_INVALID_REQUEST';
  end if;

  select account.account_status
    into v_actor_status
  from public.user_accounts as account
  where account.id = v_actor_user_id
  for share;
  if not found or v_actor_status <> 'active' then
    raise exception 'HOF_ACCOUNT_NOT_ACTIVE' using errcode = '42501';
  end if;

  v_payload_fingerprint := extensions.digest(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'operation', 'hall_of_fame.application_draft.withdraw',
        'application_batch_id', p_application_batch_id,
        'expected_batch_version', p_expected_batch_version,
        'reason', v_reason
      )::text,
      'UTF8'
    ),
    'sha256'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_application_batch_id::text, 8608)
  );

  select *
    into v_claim
  from private.hall_of_fame_claim_request(
    v_actor_user_id,
    p_request_id,
    'hall_of_fame.application_draft.withdraw',
    p_application_batch_id,
    null,
    null,
    v_payload_fingerprint
  );
  if v_claim.replayed then
    return query select
      p_request_id,
      (v_claim.result_payload ->> 'operation')::text,
      p_application_batch_id,
      null::uuid,
      (v_claim.result_payload ->> 'batch_version')::integer,
      null::integer,
      (v_claim.result_payload ->> 'changed')::boolean,
      true,
      (v_claim.result_payload ->> 'outcome')::text;
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
  if v_batch.status <> 'draft' then
    raise exception 'HOF_APPLICATION_NOT_DRAFT';
  end if;
  v_actor_membership_id :=
    private.lock_and_authorize_hall_of_fame_batch_edit(
      v_actor_user_id,
      p_application_batch_id
    );
  if v_batch.version <> p_expected_batch_version then
    raise exception 'HOF_STALE_VERSION' using errcode = '40001';
  end if;


  with withdrawn_records as (
    update public.hall_of_fame_application_records as record
    set
      review_status = 'withdrawn',
      version = record.version + 1
    where record.application_batch_id = p_application_batch_id
      and record.review_status = 'draft'
    returning record.id, record.version
  ), inserted_history as (
    insert into public.hall_of_fame_application_history (
      scope,
      application_batch_id,
      application_record_id,
      from_status,
      to_status,
      version,
      actor_user_id,
      actor_membership_id,
      action,
      reason,
      request_id
    )
    select
      'record',
      p_application_batch_id,
      withdrawn.id,
      'draft',
      'withdrawn',
      withdrawn.version,
      v_actor_user_id,
      v_actor_membership_id,
      'hall_of_fame.application_record_withdrawn_with_draft',
      v_reason,
      p_request_id
    from withdrawn_records as withdrawn
    returning 1
  )
  select count(*)::integer
    into v_withdrawn_record_count
  from inserted_history;

  update public.hall_of_fame_application_batches as batch
  set
    status = 'withdrawn',
    version = batch.version + 1,
    submitted_at = coalesce(batch.submitted_at, v_now),
    finalized_at = v_now
  where batch.id = p_application_batch_id
    and batch.version = p_expected_batch_version
  returning batch.version into v_new_batch_version;
  if not found then
    raise exception 'HOF_STALE_VERSION' using errcode = '40001';
  end if;

  insert into public.hall_of_fame_application_history (
    scope,
    application_batch_id,
    from_status,
    to_status,
    version,
    actor_user_id,
    actor_membership_id,
    action,
    reason,
    request_id
  ) values (
    'batch',
    p_application_batch_id,
    'draft',
    'withdrawn',
    v_new_batch_version,
    v_actor_user_id,
    v_actor_membership_id,
    'hall_of_fame.application_draft_withdrawn',
    v_reason,
    p_request_id
  );

  v_club_id := coalesce(
    v_batch.nominating_club_id,
    v_batch.vacancy_context_club_id
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
    outcome
  ) values (
    v_actor_user_id,
    'user',
    'hall_of_fame.application_draft.withdraw',
    'hall_of_fame_application_batch',
    p_application_batch_id::text,
    case when v_club_id is null then null else v_club_id::text end,
    pg_catalog.jsonb_build_object(
      'status', 'draft',
      'version', v_batch.version
    ),
    pg_catalog.jsonb_build_object(
      'status', 'withdrawn',
      'version', v_new_batch_version
    ),
    v_reason,
    pg_catalog.jsonb_build_object(
      'actor_membership_id', v_actor_membership_id,
      'withdrawn_record_count', v_withdrawn_record_count,
      'round_snapshot_retained', true
    ),
    p_request_id,
    'success'
  );

  v_result := pg_catalog.jsonb_build_object(
    'operation', 'hall_of_fame.application_draft.withdraw',
    'application_batch_id', p_application_batch_id,
    'batch_version', v_new_batch_version,
    'withdrawn_record_count', v_withdrawn_record_count,
    'changed', true,
    'outcome', 'success'
  );
  perform private.complete_hall_of_fame_request(
    v_actor_user_id,
    p_request_id,
    'hall_of_fame.application_draft.withdraw',
    p_application_batch_id,
    null,
    v_payload_fingerprint,
    v_result
  );

  return query select
    p_request_id,
    'hall_of_fame.application_draft.withdraw'::text,
    p_application_batch_id,
    null::uuid,
    v_new_batch_version,
    null::integer,
    true,
    false,
    'success'::text;
end;
$$;

comment on function public.withdraw_hall_of_fame_application_draft(
  uuid, integer, text, uuid
) is
  'Atomically withdraws one draft and every remaining draft record while retaining round and history rows.';

revoke all on function public.withdraw_hall_of_fame_application_draft(
  uuid, integer, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.withdraw_hall_of_fame_application_draft(
  uuid, integer, text, uuid
) to authenticated;

-- The B-2A migration does not grant direct table DML and does not add Storage policies.
