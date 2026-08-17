-- PUL 8-6-B-3-6A: unified Hall of Fame dispute intake, own read, and withdrawal.
-- Reviewer workflow, resolution, canonical remediation, messages, and Evidence remain deferred.

create table public.hall_of_fame_disputes (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  dispute_type text not null,
  category text not null,
  submitted_by_user_id uuid not null
    references public.user_accounts (id) on delete restrict,
  subject_user_id uuid not null
    references public.user_accounts (id) on delete restrict,
  application_record_id uuid,
  canonical_record_id uuid,
  statement text not null,
  status text not null default 'open',
  version integer not null default 1,
  withdrawn_at timestamptz,
  last_actor_user_id uuid not null
    references public.user_accounts (id) on delete restrict,
  last_request_id uuid not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint hall_of_fame_disputes_application_subject_fkey
    foreign key (application_record_id, subject_user_id)
    references public.hall_of_fame_application_records (id, target_user_id)
    on delete restrict,
  constraint hall_of_fame_disputes_canonical_subject_fkey
    foreign key (canonical_record_id, subject_user_id)
    references public.hall_of_fame_records (id, target_user_id)
    on delete restrict,
  constraint hall_of_fame_disputes_last_request_fkey
    foreign key (last_actor_user_id, last_request_id)
    references private.hall_of_fame_mutation_requests (
      actor_user_id,
      request_id
    )
    on delete restrict,
  constraint hall_of_fame_disputes_type_check
    check (
      dispute_type in (
        'correction_request',
        'decision_appeal',
        'subject_objection',
        'fraud_report'
      )
    ),
  constraint hall_of_fame_disputes_category_check
    check (
      (
        dispute_type = 'correction_request'
        and category in (
          'factual_error',
          'wrong_record_type',
          'administrative_error',
          'evidence_clarification'
        )
      )
      or (
        dispute_type = 'decision_appeal'
        and category in (
          'decision_error',
          'overlooked_evidence',
          'procedural_error',
          'other'
        )
      )
      or (
        dispute_type = 'subject_objection'
        and category in ('wrong_subject', 'factual_error', 'other')
      )
      or (
        dispute_type = 'fraud_report'
        and category in (
          'false_record',
          'invalid_evidence',
          'duplicate',
          'wrong_subject',
          'wrong_record_type',
          'impersonation',
          'other'
        )
      )
    ),
  constraint hall_of_fame_disputes_target_xor_check
    check (
      (application_record_id is not null)::integer
        + (canonical_record_id is not null)::integer = 1
    ),
  constraint hall_of_fame_disputes_type_target_check
    check (
      (
        application_record_id is not null
        and canonical_record_id is null
        and dispute_type = 'decision_appeal'
      )
      or (
        canonical_record_id is not null
        and application_record_id is null
        and dispute_type in (
          'correction_request',
          'decision_appeal',
          'subject_objection',
          'fraud_report'
        )
      )
    ),
  constraint hall_of_fame_disputes_statement_check
    check (
      statement = pg_catalog.regexp_replace(
        statement,
        '^[[:space:]]+|[[:space:]]+$',
        '',
        'g'
      )
      and statement ~ '[^[:space:]]'
      and pg_catalog.char_length(statement) between 2 and 2000
    ),
  constraint hall_of_fame_disputes_status_check
    check (status in ('open', 'under_review', 'resolved', 'withdrawn')),
  constraint hall_of_fame_disputes_version_check
    check (version >= 1),
  constraint hall_of_fame_disputes_withdrawal_check
    check (
      (status = 'withdrawn' and withdrawn_at is not null)
      or (status <> 'withdrawn' and withdrawn_at is null)
    ),
  constraint hall_of_fame_disputes_timeline_check
    check (
      updated_at >= created_at
      and (withdrawn_at is null or withdrawn_at >= created_at)
    )
);

comment on table public.hall_of_fame_disputes is
  'Private unified current state for HOF correction requests, appeals, subject objections, and fraud reports.';

create unique index hall_of_fame_disputes_open_application_target_uidx
  on public.hall_of_fame_disputes (
    submitted_by_user_id,
    dispute_type,
    application_record_id
  )
  where application_record_id is not null
    and status in ('open', 'under_review');

create unique index hall_of_fame_disputes_open_canonical_target_uidx
  on public.hall_of_fame_disputes (
    submitted_by_user_id,
    dispute_type,
    canonical_record_id
  )
  where canonical_record_id is not null
    and status in ('open', 'under_review');

create index hall_of_fame_disputes_submitter_created_idx
  on public.hall_of_fame_disputes (
    submitted_by_user_id,
    created_at desc,
    id desc
  );

create index hall_of_fame_disputes_application_target_idx
  on public.hall_of_fame_disputes (application_record_id, status)
  where application_record_id is not null;

create index hall_of_fame_disputes_canonical_target_idx
  on public.hall_of_fame_disputes (canonical_record_id, status)
  where canonical_record_id is not null;

create table public.hall_of_fame_dispute_history (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  dispute_id uuid not null
    references public.hall_of_fame_disputes (id) on delete restrict,
  version integer not null,
  action text not null,
  from_status text,
  to_status text not null,
  actor_user_id uuid not null
    references public.user_accounts (id) on delete restrict,
  request_id uuid not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint hall_of_fame_dispute_history_ledger_fkey
    foreign key (actor_user_id, request_id)
    references private.hall_of_fame_mutation_requests (
      actor_user_id,
      request_id
    )
    on delete restrict,
  constraint hall_of_fame_dispute_history_dispute_version_unique
    unique (dispute_id, version),
  constraint hall_of_fame_dispute_history_actor_request_unique
    unique (actor_user_id, request_id),
  constraint hall_of_fame_dispute_history_version_check
    check (version >= 1),
  constraint hall_of_fame_dispute_history_status_check
    check (
      (
        from_status is null
        or from_status in ('open', 'under_review', 'resolved', 'withdrawn')
      )
      and to_status in ('open', 'under_review', 'resolved', 'withdrawn')
      and (from_status is null or from_status <> to_status)
    ),
  constraint hall_of_fame_dispute_history_initial_version_check
    check (
      (version = 1 and from_status is null)
      or (version > 1 and from_status is not null)
    ),
  constraint hall_of_fame_dispute_history_action_check
    check (
      action = pg_catalog.btrim(action)
      and action ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'
    )
);

comment on table public.hall_of_fame_dispute_history is
  'Append-only, ledger-bound HOF dispute status history with one row per dispute version.';

create index hall_of_fame_dispute_history_created_idx
  on public.hall_of_fame_dispute_history (
    dispute_id,
    version,
    created_at,
    id
  );

alter table public.hall_of_fame_disputes enable row level security;
alter table public.hall_of_fame_disputes force row level security;
alter table public.hall_of_fame_dispute_history enable row level security;
alter table public.hall_of_fame_dispute_history force row level security;

revoke all on table public.hall_of_fame_disputes
  from public, anon, authenticated, service_role;
revoke all on table public.hall_of_fame_dispute_history
  from public, anon, authenticated, service_role;

create function private.set_hall_of_fame_dispute_context(
  p_dispute_id uuid,
  p_target_kind text,
  p_target_id uuid
)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  perform pg_catalog.set_config(
    'pul.hall_of_fame.dispute_id',
    coalesce(p_dispute_id::text, ''),
    true
  );
  perform pg_catalog.set_config(
    'pul.hall_of_fame.dispute_target_kind',
    coalesce(p_target_kind, ''),
    true
  );
  perform pg_catalog.set_config(
    'pul.hall_of_fame.dispute_target_id',
    coalesce(p_target_id::text, ''),
    true
  );
end;
$$;

comment on function private.set_hall_of_fame_dispute_context(
  uuid, text, uuid
) is
  'Sets transaction-local dispute identity used by ledger-bound dispute guards.';

revoke all on function private.set_hall_of_fame_dispute_context(
  uuid, text, uuid
) from public, anon, authenticated, service_role;

create function private.hall_of_fame_dispute_context_is_valid()
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
        pg_catalog.current_setting('pul.hall_of_fame.actor_user_id', true),
        ''
      )::uuid
      and ledger.request_id = nullif(
        pg_catalog.current_setting('pul.hall_of_fame.request_id', true),
        ''
      )::uuid
      and ledger.operation = nullif(
        pg_catalog.current_setting('pul.hall_of_fame.operation', true),
        ''
      )
      and ledger.operation in (
        'hall_of_fame.dispute.submit',
        'hall_of_fame.dispute.withdraw'
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
      and ledger.application_batch_id is null
      and ledger.application_record_id is null
      and ledger.target_user_id is null
      and auth.uid() = ledger.actor_user_id
  );
$$;

comment on function private.hall_of_fame_dispute_context_is_valid() is
  'Validates an authenticated in-progress dispute request against the existing HOF request ledger.';

revoke all on function private.hall_of_fame_dispute_context_is_valid()
  from public, anon, authenticated, service_role;

create function private.enforce_guarded_hall_of_fame_dispute_ledger_mutation()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_request uuid;
  v_dispute uuid;
  v_target_id uuid;
  v_target_kind text;
  v_operation text;
  v_fingerprint text;
begin
  if tg_op = 'DELETE' then
    raise exception 'HOF_DIRECT_DELETE_FORBIDDEN' using errcode = '42501';
  end if;

  begin
    v_actor := nullif(
      pg_catalog.current_setting('pul.hall_of_fame.actor_user_id', true),
      ''
    )::uuid;
    v_request := nullif(
      pg_catalog.current_setting('pul.hall_of_fame.request_id', true),
      ''
    )::uuid;
    v_dispute := nullif(
      pg_catalog.current_setting('pul.hall_of_fame.dispute_id', true),
      ''
    )::uuid;
    v_target_id := nullif(
      pg_catalog.current_setting(
        'pul.hall_of_fame.dispute_target_id',
        true
      ),
      ''
    )::uuid;
  exception
    when invalid_text_representation then
      raise exception 'HOF_INVALID_DISPUTE_CONTEXT' using errcode = '42501';
  end;

  v_target_kind := nullif(
    pg_catalog.current_setting(
      'pul.hall_of_fame.dispute_target_kind',
      true
    ),
    ''
  );
  v_operation := nullif(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true),
    ''
  );
  v_fingerprint := nullif(
    pg_catalog.current_setting(
      'pul.hall_of_fame.payload_fingerprint',
      true
    ),
    ''
  );

  if v_actor is null
     or v_request is null
     or v_dispute is null
     or v_target_id is null
     or v_target_kind not in ('application_record', 'canonical_record', 'dispute')
     or v_operation not in (
       'hall_of_fame.dispute.submit',
       'hall_of_fame.dispute.withdraw'
     )
     or (
       v_operation = 'hall_of_fame.dispute.submit'
       and v_target_kind = 'dispute'
     )
     or (
       v_operation = 'hall_of_fame.dispute.withdraw'
       and (
         v_target_kind <> 'dispute'
         or v_target_id <> v_dispute
       )
     )
     or v_fingerprint is null
     or auth.uid() is distinct from v_actor then
    raise exception 'HOF_DISPUTE_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if new.actor_user_id <> v_actor
       or new.request_id <> v_request
       or new.operation <> v_operation
       or new.application_batch_id is not null
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
     or old.application_batch_id is not null
     or old.application_record_id is not null
     or old.target_user_id is not null
     or pg_catalog.encode(old.payload_fingerprint, 'hex') <> v_fingerprint
     or new.id <> old.id
     or new.actor_user_id <> old.actor_user_id
     or new.request_id <> old.request_id
     or new.operation <> old.operation
     or new.application_batch_id is not null
     or new.application_record_id is not null
     or new.target_user_id is not null
     or new.payload_fingerprint <> old.payload_fingerprint
     or new.created_at <> old.created_at
     or old.status <> 'in_progress'
     or new.status <> 'completed'
     or new.result_payload is null
     or new.error_code is not null
     or new.completed_at is null
     or new.result_payload ->> 'operation' <> v_operation
     or new.result_payload ->> 'dispute_id' <> v_dispute::text then
    raise exception 'HOF_LEDGER_CONTEXT_MISMATCH' using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function private.enforce_guarded_hall_of_fame_dispute_ledger_mutation()
  is 'Allows only exact authenticated dispute request claims and completions in the shared HOF ledger.';

revoke all on function private.enforce_guarded_hall_of_fame_dispute_ledger_mutation()
  from public, anon, authenticated, service_role;

create function private.enforce_guarded_hall_of_fame_dispute_mutation()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_request uuid;
  v_dispute uuid;
  v_target_id uuid;
  v_target_kind text;
  v_operation text;
  v_fingerprint text;
  v_expected_fingerprint text;
begin
  if tg_op = 'DELETE' then
    raise exception 'HOF_DIRECT_DELETE_FORBIDDEN' using errcode = '42501';
  end if;

  begin
    v_actor := nullif(
      pg_catalog.current_setting('pul.hall_of_fame.actor_user_id', true),
      ''
    )::uuid;
    v_request := nullif(
      pg_catalog.current_setting('pul.hall_of_fame.request_id', true),
      ''
    )::uuid;
    v_dispute := nullif(
      pg_catalog.current_setting('pul.hall_of_fame.dispute_id', true),
      ''
    )::uuid;
    v_target_id := nullif(
      pg_catalog.current_setting(
        'pul.hall_of_fame.dispute_target_id',
        true
      ),
      ''
    )::uuid;
  exception
    when invalid_text_representation then
      raise exception 'HOF_INVALID_DISPUTE_CONTEXT' using errcode = '42501';
  end;

  v_target_kind := nullif(
    pg_catalog.current_setting(
      'pul.hall_of_fame.dispute_target_kind',
      true
    ),
    ''
  );
  v_operation := nullif(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true),
    ''
  );
  v_fingerprint := nullif(
    pg_catalog.current_setting(
      'pul.hall_of_fame.payload_fingerprint',
      true
    ),
    ''
  );

  if v_actor is null
     or v_request is null
     or v_dispute is null
     or v_target_id is null
     or v_fingerprint is null
     or not private.hall_of_fame_dispute_context_is_valid() then
    raise exception 'HOF_DISPUTE_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  if v_operation = 'hall_of_fame.dispute.submit' then
    if tg_op <> 'INSERT'
       or v_target_kind not in ('application_record', 'canonical_record')
       or new.id <> v_dispute
       or new.submitted_by_user_id <> v_actor
       or new.last_actor_user_id <> v_actor
       or new.last_request_id <> v_request
       or new.status <> 'open'
       or new.version <> 1
       or new.withdrawn_at is not null
       or new.created_at <> pg_catalog.now()
       or new.updated_at <> new.created_at
       or (
         v_target_kind = 'application_record'
         and (
           new.application_record_id <> v_target_id
           or new.canonical_record_id is not null
         )
       )
       or (
         v_target_kind = 'canonical_record'
         and (
           new.canonical_record_id <> v_target_id
           or new.application_record_id is not null
         )
       ) then
      raise exception 'HOF_DISPUTE_CONTEXT_MISMATCH' using errcode = '42501';
    end if;

    v_expected_fingerprint := pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(
          pg_catalog.jsonb_build_object(
            'operation', v_operation,
            'dispute_type', new.dispute_type,
            'category', new.category,
            'target_kind', v_target_kind,
            'target_id', v_target_id,
            'statement', new.statement
          )::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );
  elsif v_operation = 'hall_of_fame.dispute.withdraw' then
    if tg_op <> 'UPDATE'
       or v_target_kind <> 'dispute'
       or v_target_id <> v_dispute
       or old.id <> v_dispute
       or old.submitted_by_user_id <> v_actor
       or new.id <> old.id
       or (
         pg_catalog.to_jsonb(new)
           - 'status' - 'version' - 'withdrawn_at'
           - 'last_actor_user_id' - 'last_request_id' - 'updated_at'
       ) is distinct from (
         pg_catalog.to_jsonb(old)
           - 'status' - 'version' - 'withdrawn_at'
           - 'last_actor_user_id' - 'last_request_id' - 'updated_at'
       )
       or old.status not in ('open', 'under_review')
       or new.status <> 'withdrawn'
       or new.version <> old.version + 1
       or new.withdrawn_at <> pg_catalog.now()
       or new.last_actor_user_id <> v_actor
       or new.last_request_id <> v_request
       or new.updated_at <> pg_catalog.now() then
      raise exception 'HOF_DISPUTE_WITHDRAW_CONTEXT_MISMATCH'
        using errcode = '42501';
    end if;

    v_expected_fingerprint := pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(
          pg_catalog.jsonb_build_object(
            'operation', v_operation,
            'dispute_id', v_dispute,
            'expected_version', old.version
          )::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );
  else
    raise exception 'HOF_MUTATION_RPC_REQUIRED' using errcode = '42501';
  end if;

  if v_expected_fingerprint <> v_fingerprint then
    raise exception 'HOF_DISPUTE_FINGERPRINT_MISMATCH' using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function private.enforce_guarded_hall_of_fame_dispute_mutation()
  is 'Restricts dispute current-state writes to exact ledger-bound submit and own-withdraw transitions.';

revoke all on function private.enforce_guarded_hall_of_fame_dispute_mutation()
  from public, anon, authenticated, service_role;

create function private.enforce_hall_of_fame_dispute_history_append()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_request uuid;
  v_dispute uuid;
  v_operation text;
begin
  if tg_op <> 'INSERT' then
    raise exception 'HOF_APPEND_ONLY_MUTATION_FORBIDDEN'
      using errcode = '42501';
  end if;

  begin
    v_actor := nullif(
      pg_catalog.current_setting('pul.hall_of_fame.actor_user_id', true),
      ''
    )::uuid;
    v_request := nullif(
      pg_catalog.current_setting('pul.hall_of_fame.request_id', true),
      ''
    )::uuid;
    v_dispute := nullif(
      pg_catalog.current_setting('pul.hall_of_fame.dispute_id', true),
      ''
    )::uuid;
  exception
    when invalid_text_representation then
      raise exception 'HOF_INVALID_DISPUTE_CONTEXT' using errcode = '42501';
  end;
  v_operation := nullif(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true),
    ''
  );

  if v_actor is null
     or v_request is null
     or v_dispute is null
     or new.dispute_id <> v_dispute
     or new.actor_user_id <> v_actor
     or new.request_id <> v_request
     or new.created_at <> pg_catalog.now()
     or not private.hall_of_fame_dispute_context_is_valid() then
    raise exception 'HOF_DISPUTE_HISTORY_CONTEXT_MISMATCH'
      using errcode = '42501';
  end if;

  if v_operation = 'hall_of_fame.dispute.submit' then
    if new.version <> 1
       or new.action <> 'hall_of_fame.dispute.submitted'
       or new.from_status is not null
       or new.to_status <> 'open'
       or not exists (
         select 1
         from public.hall_of_fame_disputes as dispute
         where dispute.id = new.dispute_id
           and dispute.submitted_by_user_id = v_actor
           and dispute.status = new.to_status
           and dispute.version = new.version
           and dispute.last_actor_user_id = v_actor
           and dispute.last_request_id = v_request
       ) then
      raise exception 'HOF_DISPUTE_HISTORY_CONTEXT_MISMATCH'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if v_operation = 'hall_of_fame.dispute.withdraw' then
    if new.version < 2
       or new.action <> 'hall_of_fame.dispute.withdrawn'
       or new.from_status not in ('open', 'under_review')
       or new.to_status <> 'withdrawn'
       or not exists (
         select 1
         from public.hall_of_fame_disputes as dispute
         where dispute.id = new.dispute_id
           and dispute.submitted_by_user_id = v_actor
           and dispute.status = new.to_status
           and dispute.version = new.version
           and dispute.last_actor_user_id = v_actor
           and dispute.last_request_id = v_request
       )
       or not exists (
         select 1
         from public.hall_of_fame_dispute_history as previous_history
         where previous_history.dispute_id = new.dispute_id
           and previous_history.version = new.version - 1
           and previous_history.to_status = new.from_status
       ) then
      raise exception 'HOF_DISPUTE_HISTORY_CONTEXT_MISMATCH'
        using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'HOF_MUTATION_RPC_REQUIRED' using errcode = '42501';
end;
$$;

comment on function private.enforce_hall_of_fame_dispute_history_append()
  is 'Keeps dispute history append-only and connected to the exact current row version and request ledger.';

revoke all on function private.enforce_hall_of_fame_dispute_history_append()
  from public, anon, authenticated, service_role;

create trigger hall_of_fame_disputes_guard_before_mutation
before insert or update or delete on public.hall_of_fame_disputes
for each row execute function private.enforce_guarded_hall_of_fame_dispute_mutation();

create trigger hall_of_fame_dispute_history_guard_before_mutation
before insert or update or delete on public.hall_of_fame_dispute_history
for each row execute function private.enforce_hall_of_fame_dispute_history_append();

-- Keep the existing HOF ledger deny-by-default while routing only the two new
-- dispute operations to their exact guard.
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
    'hall_of_fame.record.revoke',
    'hall_of_fame.dispute.submit',
    'hall_of_fame.dispute.withdraw'
  )
) execute function private.reject_hall_of_fame_mutation();

create trigger hall_of_fame_mutation_requests_dispute_guard
before insert or update or delete on private.hall_of_fame_mutation_requests
for each row when (
  coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '') in (
    'hall_of_fame.dispute.submit',
    'hall_of_fame.dispute.withdraw'
  )
) execute function private.enforce_guarded_hall_of_fame_dispute_ledger_mutation();

create function public.submit_hall_of_fame_dispute(
  p_dispute_type text,
  p_category text,
  p_application_record_id uuid,
  p_canonical_record_id uuid,
  p_statement text,
  p_request_id uuid
)
returns table (
  request_id uuid,
  operation text,
  dispute_id uuid,
  dispute_type text,
  status text,
  version integer,
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
  v_operation text := 'hall_of_fame.dispute.submit';
  v_dispute_type text := pg_catalog.lower(pg_catalog.btrim(p_dispute_type));
  v_category text := pg_catalog.lower(pg_catalog.btrim(p_category));
  v_statement text := pg_catalog.regexp_replace(
    p_statement,
    '^[[:space:]]+|[[:space:]]+$',
    '',
    'g'
  );
  v_target_kind text;
  v_target_id uuid;
  v_dispute_id uuid := pg_catalog.gen_random_uuid();
  v_subject_user_id uuid;
  v_source_submitter_user_id uuid;
  v_target_status text;
  v_batch_status text;
  v_payload_fingerprint bytea;
  v_claim record;
  v_result jsonb;
begin
  perform private.lock_active_hall_of_fame_actor(v_actor);

  if p_request_id is null
     or v_dispute_type is null
     or v_dispute_type not in (
       'correction_request',
       'decision_appeal',
       'subject_objection',
       'fraud_report'
     )
     or v_category is null
     or v_statement is null
     or v_statement !~ '[^[:space:]]'
     or pg_catalog.char_length(v_statement) not between 2 and 2000
     or (
       (p_application_record_id is not null)::integer
         + (p_canonical_record_id is not null)::integer <> 1
     ) then
    raise exception 'HOF_INVALID_DISPUTE_REQUEST' using errcode = '22023';
  end if;

  if not (
    (
      v_dispute_type = 'correction_request'
      and v_category in (
        'factual_error',
        'wrong_record_type',
        'administrative_error',
        'evidence_clarification'
      )
    )
    or (
      v_dispute_type = 'decision_appeal'
      and v_category in (
        'decision_error',
        'overlooked_evidence',
        'procedural_error',
        'other'
      )
    )
    or (
      v_dispute_type = 'subject_objection'
      and v_category in ('wrong_subject', 'factual_error', 'other')
    )
    or (
      v_dispute_type = 'fraud_report'
      and v_category in (
        'false_record',
        'invalid_evidence',
        'duplicate',
        'wrong_subject',
        'wrong_record_type',
        'impersonation',
        'other'
      )
    )
  ) then
    raise exception 'HOF_DISPUTE_CATEGORY_INVALID' using errcode = '22023';
  end if;

  if p_application_record_id is not null then
    if v_dispute_type <> 'decision_appeal' then
      raise exception 'HOF_DISPUTE_TARGET_INVALID' using errcode = '22023';
    end if;
    v_target_kind := 'application_record';
    v_target_id := p_application_record_id;
  else
    v_target_kind := 'canonical_record';
    v_target_id := p_canonical_record_id;
  end if;

  v_payload_fingerprint := extensions.digest(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'operation', v_operation,
        'dispute_type', v_dispute_type,
        'category', v_category,
        'target_kind', v_target_kind,
        'target_id', v_target_id,
        'statement', v_statement
      )::text,
      'UTF8'
    ),
    'sha256'
  );

  perform private.set_hall_of_fame_dispute_context(
    v_dispute_id,
    v_target_kind,
    v_target_id
  );

  select *
    into v_claim
  from private.hall_of_fame_claim_request(
    v_actor,
    p_request_id,
    v_operation,
    null,
    null,
    null,
    v_payload_fingerprint
  );

  if v_claim.replayed then
    return query select
      p_request_id,
      v_claim.result_payload ->> 'operation',
      (v_claim.result_payload ->> 'dispute_id')::uuid,
      v_claim.result_payload ->> 'dispute_type',
      v_claim.result_payload ->> 'status',
      (v_claim.result_payload ->> 'version')::integer,
      (v_claim.result_payload ->> 'changed')::boolean,
      true;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_actor::text
        || ':' || v_dispute_type
        || ':' || v_target_kind
        || ':' || v_target_id::text,
      8613
    )
  );

  if v_target_kind = 'application_record' then
    select
      application_record.target_user_id,
      batch.created_by_user_id,
      application_record.review_status,
      batch.status
    into
      v_subject_user_id,
      v_source_submitter_user_id,
      v_target_status,
      v_batch_status
    from public.hall_of_fame_application_records as application_record
    join public.hall_of_fame_application_batches as batch
      on batch.id = application_record.application_batch_id
    where application_record.id = v_target_id
    for share of application_record, batch;

    if not found
       or v_target_status <> 'rejected'
       or v_batch_status not in ('rejected', 'partially_approved') then
      raise exception 'HOF_DISPUTE_TARGET_INVALID' using errcode = 'PT409';
    end if;
    if v_actor <> v_source_submitter_user_id
       and v_actor <> v_subject_user_id then
      raise exception 'HOF_DISPUTE_SUBMITTER_NOT_ELIGIBLE'
        using errcode = '42501';
    end if;
  else
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_target_id::text, 8612)
    );

    select
      canonical.target_user_id,
      batch.created_by_user_id,
      canonical.validity_status
    into
      v_subject_user_id,
      v_source_submitter_user_id,
      v_target_status
    from public.hall_of_fame_records as canonical
    join public.hall_of_fame_application_records as application_record
      on application_record.id = canonical.source_application_record_id
     and application_record.target_user_id = canonical.target_user_id
    join public.hall_of_fame_application_batches as batch
      on batch.id = application_record.application_batch_id
    where canonical.id = v_target_id
    for share of canonical, application_record, batch;

    if not found
       or v_target_status not in ('active', 'corrected', 'revoked') then
      raise exception 'HOF_DISPUTE_TARGET_INVALID' using errcode = 'PT409';
    end if;

    if v_dispute_type = 'correction_request' then
      if v_actor <> v_subject_user_id
         and v_actor <> v_source_submitter_user_id then
        raise exception 'HOF_DISPUTE_SUBMITTER_NOT_ELIGIBLE'
          using errcode = '42501';
      end if;
    elsif v_dispute_type = 'decision_appeal' then
      if v_target_status <> 'revoked'
         or v_actor <> v_subject_user_id then
        raise exception 'HOF_DISPUTE_SUBMITTER_NOT_ELIGIBLE'
          using errcode = '42501';
      end if;
    elsif v_dispute_type = 'subject_objection' then
      if v_actor <> v_subject_user_id then
        raise exception 'HOF_DISPUTE_SUBMITTER_NOT_ELIGIBLE'
          using errcode = '42501';
      end if;
    elsif v_dispute_type = 'fraud_report' then
      if v_actor = v_subject_user_id then
        raise exception 'HOF_DISPUTE_SUBMITTER_NOT_ELIGIBLE'
          using errcode = '42501';
      end if;
    end if;
  end if;

  if exists (
    select 1
    from public.hall_of_fame_disputes as dispute
    where dispute.submitted_by_user_id = v_actor
      and dispute.dispute_type = v_dispute_type
      and dispute.status in ('open', 'under_review')
      and (
        (
          v_target_kind = 'application_record'
          and dispute.application_record_id = v_target_id
        )
        or (
          v_target_kind = 'canonical_record'
          and dispute.canonical_record_id = v_target_id
        )
      )
  ) then
    raise exception 'HOF_OPEN_DISPUTE_ALREADY_EXISTS' using errcode = 'PT409';
  end if;

  insert into public.hall_of_fame_disputes (
    id,
    dispute_type,
    category,
    submitted_by_user_id,
    subject_user_id,
    application_record_id,
    canonical_record_id,
    statement,
    status,
    version,
    last_actor_user_id,
    last_request_id
  ) values (
    v_dispute_id,
    v_dispute_type,
    v_category,
    v_actor,
    v_subject_user_id,
    p_application_record_id,
    p_canonical_record_id,
    v_statement,
    'open',
    1,
    v_actor,
    p_request_id
  );

  insert into public.hall_of_fame_dispute_history (
    dispute_id,
    version,
    action,
    from_status,
    to_status,
    actor_user_id,
    request_id
  ) values (
    v_dispute_id,
    1,
    'hall_of_fame.dispute.submitted',
    null,
    'open',
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
    'hall_of_fame_dispute',
    v_dispute_id::text,
    null,
    pg_catalog.jsonb_build_object('status', 'open', 'version', 1),
    pg_catalog.jsonb_build_object(
      'dispute_type', v_dispute_type,
      'category', v_category,
      'target_kind', v_target_kind
    ),
    p_request_id,
    'success'
  );

  v_result := pg_catalog.jsonb_build_object(
    'operation', v_operation,
    'dispute_id', v_dispute_id,
    'dispute_type', v_dispute_type,
    'status', 'open',
    'version', 1,
    'changed', true
  );

  perform private.complete_hall_of_fame_request(
    v_actor,
    p_request_id,
    v_operation,
    null,
    null,
    v_payload_fingerprint,
    v_result
  );

  return query select
    p_request_id,
    v_operation,
    v_dispute_id,
    v_dispute_type,
    'open'::text,
    1,
    true,
    false;
end;
$$;

comment on function public.submit_hall_of_fame_dispute(
  text, text, uuid, uuid, text, uuid
) is
  'Submits one active-account HOF dispute with server-derived subject, semantic duplicate protection, history, audit, and exact replay.';

revoke all on function public.submit_hall_of_fame_dispute(
  text, text, uuid, uuid, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.submit_hall_of_fame_dispute(
  text, text, uuid, uuid, text, uuid
) to authenticated;

create function public.withdraw_hall_of_fame_dispute(
  p_dispute_id uuid,
  p_expected_version integer,
  p_request_id uuid
)
returns table (
  request_id uuid,
  operation text,
  dispute_id uuid,
  dispute_type text,
  status text,
  version integer,
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
  v_operation text := 'hall_of_fame.dispute.withdraw';
  v_payload_fingerprint bytea;
  v_claim record;
  v_dispute public.hall_of_fame_disputes%rowtype;
  v_previous_status text;
  v_result jsonb;
begin
  perform private.lock_active_hall_of_fame_actor(v_actor);

  if p_dispute_id is null
     or p_expected_version is null
     or p_expected_version < 1
     or p_request_id is null then
    raise exception 'HOF_INVALID_DISPUTE_WITHDRAWAL_REQUEST'
      using errcode = '22023';
  end if;

  v_payload_fingerprint := extensions.digest(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'operation', v_operation,
        'dispute_id', p_dispute_id,
        'expected_version', p_expected_version
      )::text,
      'UTF8'
    ),
    'sha256'
  );

  perform private.set_hall_of_fame_dispute_context(
    p_dispute_id,
    'dispute',
    p_dispute_id
  );

  select *
    into v_claim
  from private.hall_of_fame_claim_request(
    v_actor,
    p_request_id,
    v_operation,
    null,
    null,
    null,
    v_payload_fingerprint
  );

  if v_claim.replayed then
    return query select
      p_request_id,
      v_claim.result_payload ->> 'operation',
      (v_claim.result_payload ->> 'dispute_id')::uuid,
      v_claim.result_payload ->> 'dispute_type',
      v_claim.result_payload ->> 'status',
      (v_claim.result_payload ->> 'version')::integer,
      (v_claim.result_payload ->> 'changed')::boolean,
      true;
    return;
  end if;

  select dispute.*
    into v_dispute
  from public.hall_of_fame_disputes as dispute
  where dispute.id = p_dispute_id
    and dispute.submitted_by_user_id = v_actor
  for update;

  if not found then
    raise exception 'HOF_DISPUTE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_dispute.version <> p_expected_version then
    raise exception 'HOF_STALE_DISPUTE_VERSION' using errcode = 'PT409';
  end if;

  if v_dispute.status = 'withdrawn' then
    v_result := pg_catalog.jsonb_build_object(
      'operation', v_operation,
      'dispute_id', v_dispute.id,
      'dispute_type', v_dispute.dispute_type,
      'status', v_dispute.status,
      'version', v_dispute.version,
      'changed', false
    );

    perform private.complete_hall_of_fame_request(
      v_actor,
      p_request_id,
      v_operation,
      null,
      null,
      v_payload_fingerprint,
      v_result
    );

    return query select
      p_request_id,
      v_operation,
      v_dispute.id,
      v_dispute.dispute_type,
      v_dispute.status,
      v_dispute.version,
      false,
      false;
    return;
  end if;

  if v_dispute.status = 'resolved' then
    raise exception 'HOF_DISPUTE_TERMINAL_STATE' using errcode = 'PT409';
  end if;
  if v_dispute.status not in ('open', 'under_review') then
    raise exception 'HOF_DISPUTE_STATE_INVALID' using errcode = 'PT409';
  end if;

  v_previous_status := v_dispute.status;

  update public.hall_of_fame_disputes as dispute
  set
    status = 'withdrawn',
    version = dispute.version + 1,
    withdrawn_at = pg_catalog.now(),
    last_actor_user_id = v_actor,
    last_request_id = p_request_id,
    updated_at = pg_catalog.now()
  where dispute.id = v_dispute.id
    and dispute.version = p_expected_version
    and dispute.status in ('open', 'under_review')
  returning dispute.* into v_dispute;

  if not found then
    raise exception 'HOF_STALE_DISPUTE_VERSION' using errcode = 'PT409';
  end if;

  insert into public.hall_of_fame_dispute_history (
    dispute_id,
    version,
    action,
    from_status,
    to_status,
    actor_user_id,
    request_id
  ) values (
    v_dispute.id,
    v_dispute.version,
    'hall_of_fame.dispute.withdrawn',
    v_previous_status,
    'withdrawn',
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
    'hall_of_fame_dispute',
    v_dispute.id::text,
    pg_catalog.jsonb_build_object(
      'status', v_previous_status,
      'version', p_expected_version
    ),
    pg_catalog.jsonb_build_object(
      'status', v_dispute.status,
      'version', v_dispute.version
    ),
    pg_catalog.jsonb_build_object('dispute_type', v_dispute.dispute_type),
    p_request_id,
    'success'
  );

  v_result := pg_catalog.jsonb_build_object(
    'operation', v_operation,
    'dispute_id', v_dispute.id,
    'dispute_type', v_dispute.dispute_type,
    'status', v_dispute.status,
    'version', v_dispute.version,
    'changed', true
  );

  perform private.complete_hall_of_fame_request(
    v_actor,
    p_request_id,
    v_operation,
    null,
    null,
    v_payload_fingerprint,
    v_result
  );

  return query select
    p_request_id,
    v_operation,
    v_dispute.id,
    v_dispute.dispute_type,
    v_dispute.status,
    v_dispute.version,
    true,
    false;
end;
$$;

comment on function public.withdraw_hall_of_fame_dispute(
  uuid, integer, uuid
) is
  'Withdraws an owned open or future under-review dispute with optimistic versioning, exact replay, and withdrawn-state no-op.';

revoke all on function public.withdraw_hall_of_fame_dispute(
  uuid, integer, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.withdraw_hall_of_fame_dispute(
  uuid, integer, uuid
) to authenticated;

create function public.list_my_hall_of_fame_disputes(
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  dispute_id uuid,
  dispute_type text,
  category text,
  target_kind text,
  statement text,
  status text,
  version integer,
  created_at timestamptz,
  updated_at timestamptz,
  withdrawn_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'HOF_AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if p_limit is null
     or p_limit not between 1 and 100
     or p_offset is null
     or p_offset < 0 then
    raise exception 'HOF_INVALID_PAGINATION' using errcode = '22023';
  end if;

  return query
  select
    dispute.id,
    dispute.dispute_type,
    dispute.category,
    case
      when dispute.application_record_id is not null
        then 'application_record'::text
      else 'canonical_record'::text
    end,
    dispute.statement,
    dispute.status,
    dispute.version,
    dispute.created_at,
    dispute.updated_at,
    dispute.withdrawn_at
  from public.hall_of_fame_disputes as dispute
  where dispute.submitted_by_user_id = v_actor
  order by dispute.created_at desc, dispute.id desc
  limit p_limit
  offset p_offset;
end;
$$;

comment on function public.list_my_hall_of_fame_disputes(integer, integer)
  is 'Returns only the authenticated submitter private dispute DTOs with bounded pagination.';

revoke all on function public.list_my_hall_of_fame_disputes(integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_my_hall_of_fame_disputes(integer, integer)
  to authenticated;

create function public.get_my_hall_of_fame_dispute(p_dispute_id uuid)
returns table (
  dispute_id uuid,
  dispute_type text,
  category text,
  target_kind text,
  statement text,
  status text,
  version integer,
  created_at timestamptz,
  updated_at timestamptz,
  withdrawn_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'HOF_AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if p_dispute_id is null then
    raise exception 'HOF_INVALID_DISPUTE_REQUEST' using errcode = '22023';
  end if;

  return query
  select
    dispute.id,
    dispute.dispute_type,
    dispute.category,
    case
      when dispute.application_record_id is not null
        then 'application_record'::text
      else 'canonical_record'::text
    end,
    dispute.statement,
    dispute.status,
    dispute.version,
    dispute.created_at,
    dispute.updated_at,
    dispute.withdrawn_at
  from public.hall_of_fame_disputes as dispute
  where dispute.id = p_dispute_id
    and dispute.submitted_by_user_id = v_actor;
end;
$$;

comment on function public.get_my_hall_of_fame_dispute(uuid) is
  'Returns one private dispute DTO only when the authenticated caller submitted it.';

revoke all on function public.get_my_hall_of_fame_dispute(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_hall_of_fame_dispute(uuid)
  to authenticated;
