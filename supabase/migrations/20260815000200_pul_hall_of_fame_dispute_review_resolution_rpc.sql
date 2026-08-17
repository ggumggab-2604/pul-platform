-- PUL 8-6-B-3-6B: private dispute review, resolution, and canonical orchestration.
-- Dispute messages, Evidence, Storage, notifications, UI, approval reversal,
-- and canonical reinstatement remain deferred.

insert into public.platform_permission_definitions (
  code,
  description,
  is_active
)
values
  (
    'hall_of_fame.disputes.read',
    '명예의 전당 이의 신청 검토 목록과 상세를 조회합니다.',
    true
  ),
  (
    'hall_of_fame.disputes.review',
    '명예의 전당 이의 신청 검토를 시작하고 내부 기록을 추가합니다.',
    true
  ),
  (
    'hall_of_fame.disputes.resolve',
    '명예의 전당 이의 신청의 최종 처리 결과를 결정합니다.',
    true
  );

insert into public.platform_role_permissions (
  platform_role,
  permission_code
)
values
  ('platform_moderator', 'hall_of_fame.disputes.read'),
  ('platform_moderator', 'hall_of_fame.disputes.review'),
  ('platform_admin', 'hall_of_fame.disputes.read'),
  ('platform_admin', 'hall_of_fame.disputes.review'),
  ('platform_admin', 'hall_of_fame.disputes.resolve');

alter table public.hall_of_fame_disputes
  add column review_started_at timestamptz,
  add column review_started_by_user_id uuid
    references public.user_accounts (id) on delete restrict,
  add column resolved_at timestamptz,
  add column resolved_by_user_id uuid
    references public.user_accounts (id) on delete restrict,
  add column resolution_outcome text,
  add column resolution_message text,
  add column resolution_canonical_record_id uuid;

alter table public.hall_of_fame_disputes
  add constraint hall_of_fame_disputes_resolution_canonical_subject_fkey
    foreign key (resolution_canonical_record_id, subject_user_id)
    references public.hall_of_fame_records (id, target_user_id)
    on delete restrict,
  add constraint hall_of_fame_disputes_resolution_message_check
    check (
      resolution_message is null
      or (
        resolution_message = pg_catalog.regexp_replace(
          resolution_message,
          '^[[:space:]]+|[[:space:]]+$',
          '',
          'g'
        )
        and resolution_message ~ '[^[:space:]]'
        and pg_catalog.char_length(resolution_message) between 2 and 2000
      )
    ),
  add constraint hall_of_fame_disputes_resolution_outcome_check
    check (
      resolution_outcome is null
      or (
        dispute_type = 'correction_request'
        and resolution_outcome in (
          'correction_applied',
          'correction_denied',
          'already_remediated'
        )
      )
      or (
        dispute_type = 'decision_appeal'
        and resolution_outcome in (
          'appeal_denied',
          're_review_recommended',
          'already_remediated'
        )
      )
      or (
        dispute_type = 'subject_objection'
        and resolution_outcome in (
          'objection_upheld_correction_applied',
          'objection_upheld_revoke_applied',
          'objection_not_upheld',
          'already_remediated'
        )
      )
      or (
        dispute_type = 'fraud_report'
        and resolution_outcome in (
          'fraud_substantiated_correction_applied',
          'fraud_substantiated_revoke_applied',
          'fraud_not_substantiated',
          'already_remediated'
        )
      )
    ),
  add constraint hall_of_fame_disputes_resolution_target_check
    check (
      (
        resolution_outcome in (
          'correction_applied',
          'objection_upheld_correction_applied',
          'objection_upheld_revoke_applied',
          'fraud_substantiated_correction_applied',
          'fraud_substantiated_revoke_applied'
        )
        and resolution_canonical_record_id is not null
      )
      or (
        resolution_outcome is null
        and resolution_canonical_record_id is null
      )
      or (
        resolution_outcome in (
          'correction_denied',
          'appeal_denied',
          're_review_recommended',
          'objection_not_upheld',
          'fraud_not_substantiated',
          'already_remediated'
        )
        and resolution_canonical_record_id is null
      )
    ),
  add constraint hall_of_fame_disputes_review_resolution_state_check
    check (
      (
        status = 'open'
        and review_started_at is null
        and review_started_by_user_id is null
        and resolved_at is null
        and resolved_by_user_id is null
        and resolution_outcome is null
        and resolution_message is null
        and resolution_canonical_record_id is null
      )
      or (
        status = 'under_review'
        and review_started_at is not null
        and review_started_by_user_id is not null
        and resolved_at is null
        and resolved_by_user_id is null
        and resolution_outcome is null
        and resolution_message is null
        and resolution_canonical_record_id is null
      )
      or (
        status = 'resolved'
        and review_started_at is not null
        and review_started_by_user_id is not null
        and resolved_at is not null
        and resolved_by_user_id is not null
        and resolution_outcome is not null
        and resolution_message is not null
      )
      or (
        status = 'withdrawn'
        and (
          (
            review_started_at is null
            and review_started_by_user_id is null
          )
          or (
            review_started_at is not null
            and review_started_by_user_id is not null
          )
        )
        and resolved_at is null
        and resolved_by_user_id is null
        and resolution_outcome is null
        and resolution_message is null
        and resolution_canonical_record_id is null
      )
    ),
  add constraint hall_of_fame_disputes_review_resolution_timeline_check
    check (
      (review_started_at is null or review_started_at >= created_at)
      and (resolved_at is null or resolved_at >= review_started_at)
    );

alter table public.hall_of_fame_dispute_history
  add column resolution_outcome text,
  add constraint hall_of_fame_dispute_history_resolution_outcome_check
    check (
      (
        action = 'hall_of_fame.dispute.resolved'
        and to_status = 'resolved'
        and resolution_outcome is not null
      )
      or (
        action <> 'hall_of_fame.dispute.resolved'
        and resolution_outcome is null
      )
    );

create table public.hall_of_fame_dispute_reviews (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  dispute_id uuid not null
    references public.hall_of_fame_disputes (id) on delete restrict,
  review_kind text not null,
  note text not null,
  actor_user_id uuid not null
    references public.user_accounts (id) on delete restrict,
  request_id uuid not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint hall_of_fame_dispute_reviews_ledger_fkey
    foreign key (actor_user_id, request_id)
    references private.hall_of_fame_mutation_requests (
      actor_user_id,
      request_id
    )
    on delete restrict,
  constraint hall_of_fame_dispute_reviews_actor_request_unique
    unique (actor_user_id, request_id),
  constraint hall_of_fame_dispute_reviews_kind_check
    check (review_kind in ('internal_note', 'resolution_note')),
  constraint hall_of_fame_dispute_reviews_note_check
    check (
      note = pg_catalog.regexp_replace(
        note,
        '^[[:space:]]+|[[:space:]]+$',
        '',
        'g'
      )
      and note ~ '[^[:space:]]'
      and pg_catalog.char_length(note) between 2 and 2000
    )
);

comment on table public.hall_of_fame_dispute_reviews is
  'Append-only reviewer-private notes for HOF dispute review and final resolution.';

create index hall_of_fame_dispute_reviews_dispute_created_idx
  on public.hall_of_fame_dispute_reviews (
    dispute_id,
    created_at,
    id
  );

alter table public.hall_of_fame_dispute_reviews enable row level security;
alter table public.hall_of_fame_dispute_reviews force row level security;

revoke all on table public.hall_of_fame_dispute_reviews
  from public, anon, authenticated, service_role;

create or replace function private.hall_of_fame_dispute_context_is_valid()
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
        'hall_of_fame.dispute.withdraw',
        'hall_of_fame.dispute.review.start',
        'hall_of_fame.dispute.review.note',
        'hall_of_fame.dispute.resolve',
        'hall_of_fame.dispute.resolve.correction',
        'hall_of_fame.dispute.resolve.revoke'
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
  'Validates an authenticated in-progress dispute request, including reviewer and resolver operations.';

revoke all on function private.hall_of_fame_dispute_context_is_valid()
  from public, anon, authenticated, service_role;

create function private.restore_hall_of_fame_dispute_context(
  p_actor_user_id uuid,
  p_request_id uuid,
  p_operation text,
  p_payload_fingerprint bytea,
  p_dispute_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.set_hall_of_fame_mutation_context(
    p_actor_user_id::text,
    p_request_id::text,
    p_operation,
    null,
    null,
    pg_catalog.encode(p_payload_fingerprint, 'hex')
  );
  perform private.set_hall_of_fame_dispute_context(
    p_dispute_id,
    'dispute',
    p_dispute_id
  );

  if auth.uid() is distinct from p_actor_user_id
     or not private.hall_of_fame_dispute_context_is_valid() then
    raise exception 'HOF_DISPUTE_CONTEXT_RESTORE_FAILED'
      using errcode = '42501';
  end if;
end;
$$;

comment on function private.restore_hall_of_fame_dispute_context(
  uuid, uuid, text, bytea, uuid
) is
  'Restores and revalidates the exact outer dispute ledger context after a nested canonical mutation.';

revoke all on function private.restore_hall_of_fame_dispute_context(
  uuid, uuid, text, bytea, uuid
) from public, anon, authenticated, service_role;

create or replace function private.enforce_guarded_hall_of_fame_dispute_ledger_mutation()
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
       'hall_of_fame.dispute.withdraw',
       'hall_of_fame.dispute.review.start',
       'hall_of_fame.dispute.review.note',
       'hall_of_fame.dispute.resolve',
       'hall_of_fame.dispute.resolve.correction',
       'hall_of_fame.dispute.resolve.revoke'
     )
     or (
       v_operation = 'hall_of_fame.dispute.submit'
       and v_target_kind = 'dispute'
     )
     or (
       v_operation <> 'hall_of_fame.dispute.submit'
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
  is 'Allows only exact authenticated dispute intake, review, note, and resolution request claims and completions.';

revoke all on function private.enforce_guarded_hall_of_fame_dispute_ledger_mutation()
  from public, anon, authenticated, service_role;

create or replace function private.enforce_guarded_hall_of_fame_dispute_mutation()
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
  elsif v_operation = 'hall_of_fame.dispute.review.start' then
    if tg_op <> 'UPDATE'
       or v_target_kind <> 'dispute'
       or v_target_id <> v_dispute
       or old.id <> v_dispute
       or new.id <> old.id
       or (
         pg_catalog.to_jsonb(new)
           - 'status' - 'version'
           - 'review_started_at' - 'review_started_by_user_id'
           - 'last_actor_user_id' - 'last_request_id' - 'updated_at'
       ) is distinct from (
         pg_catalog.to_jsonb(old)
           - 'status' - 'version'
           - 'review_started_at' - 'review_started_by_user_id'
           - 'last_actor_user_id' - 'last_request_id' - 'updated_at'
       )
       or old.status <> 'open'
       or new.status <> 'under_review'
       or new.version <> old.version + 1
       or new.review_started_at <> pg_catalog.now()
       or new.review_started_by_user_id <> v_actor
       or new.last_actor_user_id <> v_actor
       or new.last_request_id <> v_request
       or new.updated_at <> pg_catalog.now() then
      raise exception 'HOF_DISPUTE_REVIEW_CONTEXT_MISMATCH'
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
  elsif v_operation in (
    'hall_of_fame.dispute.resolve',
    'hall_of_fame.dispute.resolve.correction',
    'hall_of_fame.dispute.resolve.revoke'
  ) then
    if tg_op <> 'UPDATE'
       or v_target_kind <> 'dispute'
       or v_target_id <> v_dispute
       or old.id <> v_dispute
       or new.id <> old.id
       or (
         pg_catalog.to_jsonb(new)
           - 'status' - 'version' - 'resolved_at' - 'resolved_by_user_id'
           - 'resolution_outcome' - 'resolution_message'
           - 'resolution_canonical_record_id'
           - 'last_actor_user_id' - 'last_request_id' - 'updated_at'
       ) is distinct from (
         pg_catalog.to_jsonb(old)
           - 'status' - 'version' - 'resolved_at' - 'resolved_by_user_id'
           - 'resolution_outcome' - 'resolution_message'
           - 'resolution_canonical_record_id'
           - 'last_actor_user_id' - 'last_request_id' - 'updated_at'
       )
       or old.status <> 'under_review'
       or new.status <> 'resolved'
       or new.version <> old.version + 1
       or new.resolved_at <> pg_catalog.now()
       or new.resolved_by_user_id <> v_actor
       or new.last_actor_user_id <> v_actor
       or new.last_request_id <> v_request
       or new.updated_at <> pg_catalog.now()
       or (
         v_operation = 'hall_of_fame.dispute.resolve'
         and new.resolution_canonical_record_id is not null
       )
       or (
         v_operation = 'hall_of_fame.dispute.resolve.correction'
         and (
           new.resolution_outcome not in (
             'correction_applied',
             'objection_upheld_correction_applied',
             'fraud_substantiated_correction_applied'
           )
           or new.resolution_canonical_record_id is null
         )
       )
       or (
         v_operation = 'hall_of_fame.dispute.resolve.revoke'
         and (
           new.resolution_outcome not in (
             'objection_upheld_revoke_applied',
             'fraud_substantiated_revoke_applied'
           )
           or new.resolution_canonical_record_id is null
         )
       ) then
      raise exception 'HOF_DISPUTE_RESOLUTION_CONTEXT_MISMATCH'
        using errcode = '42501';
    end if;

    v_expected_fingerprint := v_fingerprint;
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
  is 'Restricts dispute writes to exact ledger-bound submit, withdrawal, review-start, and resolution transitions.';

revoke all on function private.enforce_guarded_hall_of_fame_dispute_mutation()
  from public, anon, authenticated, service_role;

create or replace function private.enforce_hall_of_fame_dispute_history_append()
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
       or new.resolution_outcome is not null
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
       or new.resolution_outcome is not null
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

  if v_operation = 'hall_of_fame.dispute.review.start' then
    if new.version < 2
       or new.action <> 'hall_of_fame.dispute.review_started'
       or new.from_status <> 'open'
       or new.to_status <> 'under_review'
       or new.resolution_outcome is not null
       or not exists (
         select 1
         from public.hall_of_fame_disputes as dispute
         where dispute.id = new.dispute_id
           and dispute.status = new.to_status
           and dispute.version = new.version
           and dispute.review_started_by_user_id = v_actor
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

  if v_operation in (
    'hall_of_fame.dispute.resolve',
    'hall_of_fame.dispute.resolve.correction',
    'hall_of_fame.dispute.resolve.revoke'
  ) then
    if new.version < 3
       or new.action <> 'hall_of_fame.dispute.resolved'
       or new.from_status <> 'under_review'
       or new.to_status <> 'resolved'
       or new.resolution_outcome is null
       or not exists (
         select 1
         from public.hall_of_fame_disputes as dispute
         where dispute.id = new.dispute_id
           and dispute.status = new.to_status
           and dispute.version = new.version
           and dispute.resolution_outcome = new.resolution_outcome
           and dispute.resolved_by_user_id = v_actor
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
  is 'Keeps dispute history append-only and connected across submit, review, withdrawal, and resolution versions.';

revoke all on function private.enforce_hall_of_fame_dispute_history_append()
  from public, anon, authenticated, service_role;

create function private.enforce_hall_of_fame_dispute_review_append()
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
     or not private.hall_of_fame_dispute_context_is_valid()
     or (
       v_operation = 'hall_of_fame.dispute.review.note'
       and new.review_kind <> 'internal_note'
     )
     or (
       v_operation in (
         'hall_of_fame.dispute.resolve',
         'hall_of_fame.dispute.resolve.correction',
         'hall_of_fame.dispute.resolve.revoke'
       )
       and new.review_kind <> 'resolution_note'
     )
     or v_operation not in (
       'hall_of_fame.dispute.review.note',
       'hall_of_fame.dispute.resolve',
       'hall_of_fame.dispute.resolve.correction',
       'hall_of_fame.dispute.resolve.revoke'
     ) then
    raise exception 'HOF_DISPUTE_REVIEW_CONTEXT_MISMATCH'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function private.enforce_hall_of_fame_dispute_review_append()
  is 'Keeps reviewer-private dispute notes append-only and bound to the exact outer request ledger.';

revoke all on function private.enforce_hall_of_fame_dispute_review_append()
  from public, anon, authenticated, service_role;

create trigger hall_of_fame_dispute_reviews_guard_before_mutation
before insert or update or delete on public.hall_of_fame_dispute_reviews
for each row execute function private.enforce_hall_of_fame_dispute_review_append();

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
    'hall_of_fame.dispute.withdraw',
    'hall_of_fame.dispute.review.start',
    'hall_of_fame.dispute.review.note',
    'hall_of_fame.dispute.resolve',
    'hall_of_fame.dispute.resolve.correction',
    'hall_of_fame.dispute.resolve.revoke'
  )
) execute function private.reject_hall_of_fame_mutation();

drop trigger hall_of_fame_mutation_requests_dispute_guard
  on private.hall_of_fame_mutation_requests;
create trigger hall_of_fame_mutation_requests_dispute_guard
before insert or update or delete on private.hall_of_fame_mutation_requests
for each row when (
  coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '') in (
    'hall_of_fame.dispute.submit',
    'hall_of_fame.dispute.withdraw',
    'hall_of_fame.dispute.review.start',
    'hall_of_fame.dispute.review.note',
    'hall_of_fame.dispute.resolve',
    'hall_of_fame.dispute.resolve.correction',
    'hall_of_fame.dispute.resolve.revoke'
  )
) execute function private.enforce_guarded_hall_of_fame_dispute_ledger_mutation();

create function public.list_hall_of_fame_dispute_review_queue(
  p_status text default null,
  p_dispute_type text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  dispute_id uuid,
  dispute_type text,
  category text,
  status text,
  version integer,
  statement text,
  target_kind text,
  application_record_id uuid,
  canonical_record_id uuid,
  submitted_by_user_id uuid,
  subject_user_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  review_started_at timestamptz,
  resolution_outcome text,
  resolved_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_status text := case
    when p_status is null then null
    else pg_catalog.lower(pg_catalog.btrim(p_status))
  end;
  v_dispute_type text := case
    when p_dispute_type is null then null
    else pg_catalog.lower(pg_catalog.btrim(p_dispute_type))
  end;
begin
  perform private.require_hall_of_fame_platform_permission(
    v_actor,
    'hall_of_fame.disputes.read'
  );

  if p_limit is null
     or p_limit not between 1 and 100
     or p_offset is null
     or p_offset < 0
     or p_offset > 10000
     or (
       v_status is not null
       and v_status not in ('open', 'under_review', 'resolved', 'withdrawn')
     )
     or (
       v_dispute_type is not null
       and v_dispute_type not in (
         'correction_request',
         'decision_appeal',
         'subject_objection',
         'fraud_report'
       )
     ) then
    raise exception 'HOF_INVALID_DISPUTE_REVIEW_FILTER'
      using errcode = '22023';
  end if;

  return query
  select
    dispute.id,
    dispute.dispute_type,
    dispute.category,
    dispute.status,
    dispute.version,
    dispute.statement,
    case
      when dispute.application_record_id is not null
        then 'application_record'::text
      else 'canonical_record'::text
    end,
    dispute.application_record_id,
    dispute.canonical_record_id,
    dispute.submitted_by_user_id,
    dispute.subject_user_id,
    dispute.created_at,
    dispute.updated_at,
    dispute.review_started_at,
    dispute.resolution_outcome,
    dispute.resolved_at
  from public.hall_of_fame_disputes as dispute
  where (v_status is null or dispute.status = v_status)
    and (
      v_dispute_type is null
      or dispute.dispute_type = v_dispute_type
    )
  order by dispute.created_at, dispute.id
  limit p_limit
  offset p_offset;
end;
$$;

comment on function public.list_hall_of_fame_dispute_review_queue(
  text, text, integer, integer
) is
  'Returns the deterministic private HOF dispute queue to active platform reviewers with exact read permission.';

revoke all on function public.list_hall_of_fame_dispute_review_queue(
  text, text, integer, integer
) from public, anon, authenticated, service_role;
grant execute on function public.list_hall_of_fame_dispute_review_queue(
  text, text, integer, integer
) to authenticated;

create function public.get_hall_of_fame_dispute_for_review(
  p_dispute_id uuid
)
returns table (
  dispute_id uuid,
  dispute_type text,
  category text,
  status text,
  version integer,
  statement text,
  target_kind text,
  application_record_id uuid,
  canonical_record_id uuid,
  submitted_by_user_id uuid,
  subject_user_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  review_started_at timestamptz,
  review_started_by_user_id uuid,
  resolution_outcome text,
  resolution_message text,
  resolution_canonical_record_id uuid,
  resolved_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  perform private.require_hall_of_fame_platform_permission(
    v_actor,
    'hall_of_fame.disputes.read'
  );

  if p_dispute_id is null then
    raise exception 'HOF_INVALID_DISPUTE_REVIEW_REQUEST'
      using errcode = '22023';
  end if;

  return query
  select
    dispute.id,
    dispute.dispute_type,
    dispute.category,
    dispute.status,
    dispute.version,
    dispute.statement,
    case
      when dispute.application_record_id is not null
        then 'application_record'::text
      else 'canonical_record'::text
    end,
    dispute.application_record_id,
    dispute.canonical_record_id,
    dispute.submitted_by_user_id,
    dispute.subject_user_id,
    dispute.created_at,
    dispute.updated_at,
    dispute.review_started_at,
    dispute.review_started_by_user_id,
    dispute.resolution_outcome,
    dispute.resolution_message,
    dispute.resolution_canonical_record_id,
    dispute.resolved_at
  from public.hall_of_fame_disputes as dispute
  where dispute.id = p_dispute_id;
end;
$$;

comment on function public.get_hall_of_fame_dispute_for_review(uuid) is
  'Returns one private HOF dispute review DTO without credentials, Storage, Evidence, or ledger data.';

revoke all on function public.get_hall_of_fame_dispute_for_review(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_hall_of_fame_dispute_for_review(uuid)
  to authenticated;

create function public.list_hall_of_fame_dispute_internal_notes(
  p_dispute_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  review_id uuid,
  review_kind text,
  note text,
  actor_user_id uuid,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  perform private.require_hall_of_fame_platform_permission(
    v_actor,
    'hall_of_fame.disputes.read'
  );

  if p_dispute_id is null
     or p_limit is null
     or p_limit not between 1 and 100
     or p_offset is null
     or p_offset < 0
     or p_offset > 10000 then
    raise exception 'HOF_INVALID_DISPUTE_REVIEW_REQUEST'
      using errcode = '22023';
  end if;

  return query
  select
    review.id,
    review.review_kind,
    review.note,
    review.actor_user_id,
    review.created_at
  from public.hall_of_fame_dispute_reviews as review
  where review.dispute_id = p_dispute_id
  order by review.created_at, review.id
  limit p_limit
  offset p_offset;
end;
$$;

comment on function public.list_hall_of_fame_dispute_internal_notes(
  uuid, integer, integer
) is
  'Returns append-only reviewer-private HOF dispute notes to active platform reviewers.';

revoke all on function public.list_hall_of_fame_dispute_internal_notes(
  uuid, integer, integer
) from public, anon, authenticated, service_role;
grant execute on function public.list_hall_of_fame_dispute_internal_notes(
  uuid, integer, integer
) to authenticated;

create function public.start_hall_of_fame_dispute_review(
  p_dispute_id uuid,
  p_expected_version integer,
  p_request_id uuid
)
returns table (
  request_id uuid,
  operation text,
  dispute_id uuid,
  status text,
  version integer,
  review_started_at timestamptz,
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
  v_operation text := 'hall_of_fame.dispute.review.start';
  v_fingerprint bytea;
  v_claim record;
  v_dispute public.hall_of_fame_disputes%rowtype;
  v_started_at timestamptz := pg_catalog.now();
  v_result jsonb;
begin
  perform private.lock_active_hall_of_fame_actor(v_actor);

  if p_dispute_id is null
     or p_expected_version is null
     or p_expected_version < 1
     or p_request_id is null then
    raise exception 'HOF_INVALID_DISPUTE_REVIEW_REQUEST'
      using errcode = '22023';
  end if;

  v_fingerprint := extensions.digest(
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
    v_fingerprint
  );

  if v_claim.replayed then
    return query select
      p_request_id,
      v_claim.result_payload ->> 'operation',
      (v_claim.result_payload ->> 'dispute_id')::uuid,
      v_claim.result_payload ->> 'status',
      (v_claim.result_payload ->> 'version')::integer,
      (v_claim.result_payload ->> 'review_started_at')::timestamptz,
      (v_claim.result_payload ->> 'changed')::boolean,
      true;
    return;
  end if;

  perform private.require_hall_of_fame_platform_permission(
    v_actor,
    'hall_of_fame.disputes.review'
  );

  select dispute.*
    into v_dispute
  from public.hall_of_fame_disputes as dispute
  where dispute.id = p_dispute_id
  for update;

  if not found then
    raise exception 'HOF_DISPUTE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_dispute.version <> p_expected_version then
    raise exception 'HOF_STALE_DISPUTE_VERSION' using errcode = 'PT409';
  end if;
  if v_actor in (v_dispute.submitted_by_user_id, v_dispute.subject_user_id) then
    raise exception 'HOF_DISPUTE_REVIEW_CONFLICT_OF_INTEREST'
      using errcode = '42501';
  end if;

  if v_dispute.status = 'under_review' then
    if v_dispute.review_started_by_user_id <> v_actor then
      raise exception 'HOF_DISPUTE_REVIEW_ALREADY_STARTED'
        using errcode = 'PT409';
    end if;

    v_result := pg_catalog.jsonb_build_object(
      'operation', v_operation,
      'dispute_id', v_dispute.id,
      'status', v_dispute.status,
      'version', v_dispute.version,
      'review_started_at', v_dispute.review_started_at,
      'changed', false
    );
    perform private.complete_hall_of_fame_request(
      v_actor,
      p_request_id,
      v_operation,
      null,
      null,
      v_fingerprint,
      v_result
    );
    return query select
      p_request_id,
      v_operation,
      v_dispute.id,
      v_dispute.status,
      v_dispute.version,
      v_dispute.review_started_at,
      false,
      false;
    return;
  end if;

  if v_dispute.status in ('resolved', 'withdrawn') then
    raise exception 'HOF_DISPUTE_TERMINAL_STATE' using errcode = 'PT409';
  end if;
  if v_dispute.status <> 'open' then
    raise exception 'HOF_DISPUTE_REVIEW_STATE_INVALID' using errcode = 'PT409';
  end if;

  update public.hall_of_fame_disputes as dispute
  set
    status = 'under_review',
    version = dispute.version + 1,
    review_started_at = v_started_at,
    review_started_by_user_id = v_actor,
    last_actor_user_id = v_actor,
    last_request_id = p_request_id,
    updated_at = v_started_at
  where dispute.id = v_dispute.id
    and dispute.version = p_expected_version
    and dispute.status = 'open'
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
    request_id,
    resolution_outcome
  ) values (
    v_dispute.id,
    v_dispute.version,
    'hall_of_fame.dispute.review_started',
    'open',
    'under_review',
    v_actor,
    p_request_id,
    null
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
      'status', 'open',
      'version', p_expected_version
    ),
    pg_catalog.jsonb_build_object(
      'status', v_dispute.status,
      'version', v_dispute.version
    ),
    pg_catalog.jsonb_build_object(
      'dispute_type', v_dispute.dispute_type
    ),
    p_request_id,
    'success'
  );

  v_result := pg_catalog.jsonb_build_object(
    'operation', v_operation,
    'dispute_id', v_dispute.id,
    'status', v_dispute.status,
    'version', v_dispute.version,
    'review_started_at', v_dispute.review_started_at,
    'changed', true
  );
  perform private.complete_hall_of_fame_request(
    v_actor,
    p_request_id,
    v_operation,
    null,
    null,
    v_fingerprint,
    v_result
  );

  return query select
    p_request_id,
    v_operation,
    v_dispute.id,
    v_dispute.status,
    v_dispute.version,
    v_dispute.review_started_at,
    true,
    false;
end;
$$;

comment on function public.start_hall_of_fame_dispute_review(
  uuid, integer, uuid
) is
  'Starts one conflict-free HOF dispute review with optimistic versioning, history, audit, and exact replay.';

revoke all on function public.start_hall_of_fame_dispute_review(
  uuid, integer, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.start_hall_of_fame_dispute_review(
  uuid, integer, uuid
) to authenticated;

create function public.add_hall_of_fame_dispute_internal_note(
  p_dispute_id uuid,
  p_expected_version integer,
  p_note text,
  p_request_id uuid
)
returns table (
  request_id uuid,
  operation text,
  dispute_id uuid,
  status text,
  version integer,
  review_id uuid,
  created_at timestamptz,
  replayed boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_operation text := 'hall_of_fame.dispute.review.note';
  v_note text := pg_catalog.regexp_replace(
    p_note,
    '^[[:space:]]+|[[:space:]]+$',
    '',
    'g'
  );
  v_fingerprint bytea;
  v_claim record;
  v_dispute public.hall_of_fame_disputes%rowtype;
  v_review_id uuid;
  v_created_at timestamptz := pg_catalog.now();
  v_result jsonb;
begin
  perform private.lock_active_hall_of_fame_actor(v_actor);

  if p_dispute_id is null
     or p_expected_version is null
     or p_expected_version < 1
     or p_request_id is null
     or v_note is null
     or v_note !~ '[^[:space:]]'
     or pg_catalog.char_length(v_note) not between 2 and 2000 then
    raise exception 'HOF_INVALID_DISPUTE_REVIEW_NOTE'
      using errcode = '22023';
  end if;

  v_fingerprint := extensions.digest(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'operation', v_operation,
        'dispute_id', p_dispute_id,
        'expected_version', p_expected_version,
        'note', v_note
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
    v_fingerprint
  );

  if v_claim.replayed then
    return query select
      p_request_id,
      v_claim.result_payload ->> 'operation',
      (v_claim.result_payload ->> 'dispute_id')::uuid,
      v_claim.result_payload ->> 'status',
      (v_claim.result_payload ->> 'version')::integer,
      (v_claim.result_payload ->> 'review_id')::uuid,
      (v_claim.result_payload ->> 'created_at')::timestamptz,
      true;
    return;
  end if;

  perform private.require_hall_of_fame_platform_permission(
    v_actor,
    'hall_of_fame.disputes.review'
  );

  select dispute.*
    into v_dispute
  from public.hall_of_fame_disputes as dispute
  where dispute.id = p_dispute_id
  for update;

  if not found then
    raise exception 'HOF_DISPUTE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_dispute.version <> p_expected_version then
    raise exception 'HOF_STALE_DISPUTE_VERSION' using errcode = 'PT409';
  end if;
  if v_actor in (v_dispute.submitted_by_user_id, v_dispute.subject_user_id) then
    raise exception 'HOF_DISPUTE_REVIEW_CONFLICT_OF_INTEREST'
      using errcode = '42501';
  end if;
  if v_dispute.status in ('resolved', 'withdrawn') then
    raise exception 'HOF_DISPUTE_TERMINAL_STATE' using errcode = 'PT409';
  end if;
  if v_dispute.status <> 'under_review' then
    raise exception 'HOF_DISPUTE_REVIEW_STATE_INVALID' using errcode = 'PT409';
  end if;

  insert into public.hall_of_fame_dispute_reviews (
    dispute_id,
    review_kind,
    note,
    actor_user_id,
    request_id,
    created_at
  ) values (
    v_dispute.id,
    'internal_note',
    v_note,
    v_actor,
    p_request_id,
    v_created_at
  )
  returning id into v_review_id;

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
      'status', v_dispute.status,
      'version', v_dispute.version
    ),
    pg_catalog.jsonb_build_object(
      'status', v_dispute.status,
      'version', v_dispute.version,
      'internal_note_added', true
    ),
    pg_catalog.jsonb_build_object(
      'dispute_type', v_dispute.dispute_type,
      'review_id', v_review_id
    ),
    p_request_id,
    'success'
  );

  v_result := pg_catalog.jsonb_build_object(
    'operation', v_operation,
    'dispute_id', v_dispute.id,
    'status', v_dispute.status,
    'version', v_dispute.version,
    'review_id', v_review_id,
    'created_at', v_created_at
  );
  perform private.complete_hall_of_fame_request(
    v_actor,
    p_request_id,
    v_operation,
    null,
    null,
    v_fingerprint,
    v_result
  );

  return query select
    p_request_id,
    v_operation,
    v_dispute.id,
    v_dispute.status,
    v_dispute.version,
    v_review_id,
    v_created_at,
    false;
end;
$$;

comment on function public.add_hall_of_fame_dispute_internal_note(
  uuid, integer, text, uuid
) is
  'Appends one normalized reviewer-private note without changing dispute status, version, or current-state history.';

revoke all on function public.add_hall_of_fame_dispute_internal_note(
  uuid, integer, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.add_hall_of_fame_dispute_internal_note(
  uuid, integer, text, uuid
) to authenticated;

create function private.finish_hall_of_fame_dispute_resolution(
  p_actor_user_id uuid,
  p_request_id uuid,
  p_operation text,
  p_payload_fingerprint bytea,
  p_dispute_id uuid,
  p_expected_version integer,
  p_resolution_outcome text,
  p_resolution_message text,
  p_internal_note text,
  p_resolution_canonical_record_id uuid,
  p_child_request_id uuid,
  p_canonical_operation text
)
returns table (
  dispute_version integer,
  review_id uuid,
  resolved_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_dispute public.hall_of_fame_disputes%rowtype;
  v_review_id uuid;
  v_resolved_at timestamptz := pg_catalog.now();
  v_result jsonb;
begin
  if auth.uid() is distinct from p_actor_user_id
     or p_operation not in (
       'hall_of_fame.dispute.resolve',
       'hall_of_fame.dispute.resolve.correction',
       'hall_of_fame.dispute.resolve.revoke'
     )
     or p_dispute_id is null
     or p_expected_version is null
     or p_resolution_outcome is null
     or p_resolution_message is null
     or p_internal_note is null
     or not private.hall_of_fame_dispute_context_is_valid()
     or (
       p_operation = 'hall_of_fame.dispute.resolve'
       and (
         p_resolution_canonical_record_id is not null
         or p_child_request_id is not null
         or p_canonical_operation is not null
       )
     )
     or (
       p_operation = 'hall_of_fame.dispute.resolve.correction'
       and (
         p_resolution_canonical_record_id is null
         or p_child_request_id is null
         or p_canonical_operation <> 'hall_of_fame.record.correct'
       )
     )
     or (
       p_operation = 'hall_of_fame.dispute.resolve.revoke'
       and (
         p_resolution_canonical_record_id is null
         or p_child_request_id is null
         or p_canonical_operation <> 'hall_of_fame.record.revoke'
       )
     ) then
    raise exception 'HOF_DISPUTE_RESOLUTION_CONTEXT_MISMATCH'
      using errcode = '42501';
  end if;

  perform private.require_hall_of_fame_platform_permission(
    p_actor_user_id,
    'hall_of_fame.disputes.resolve'
  );

  select dispute.*
    into v_dispute
  from public.hall_of_fame_disputes as dispute
  where dispute.id = p_dispute_id
  for update;

  if not found then
    raise exception 'HOF_DISPUTE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_dispute.version <> p_expected_version then
    raise exception 'HOF_STALE_DISPUTE_VERSION' using errcode = 'PT409';
  end if;
  if p_actor_user_id in (
    v_dispute.submitted_by_user_id,
    v_dispute.subject_user_id
  ) then
    raise exception 'HOF_DISPUTE_REVIEW_CONFLICT_OF_INTEREST'
      using errcode = '42501';
  end if;
  if v_dispute.status in ('resolved', 'withdrawn') then
    raise exception 'HOF_DISPUTE_TERMINAL_STATE' using errcode = 'PT409';
  end if;
  if v_dispute.status <> 'under_review' then
    raise exception 'HOF_DISPUTE_RESOLUTION_STATE_INVALID'
      using errcode = 'PT409';
  end if;

  if not (
    (
      v_dispute.dispute_type = 'correction_request'
      and p_resolution_outcome in (
        'correction_applied',
        'correction_denied',
        'already_remediated'
      )
    )
    or (
      v_dispute.dispute_type = 'decision_appeal'
      and p_resolution_outcome in (
        'appeal_denied',
        're_review_recommended',
        'already_remediated'
      )
    )
    or (
      v_dispute.dispute_type = 'subject_objection'
      and p_resolution_outcome in (
        'objection_upheld_correction_applied',
        'objection_upheld_revoke_applied',
        'objection_not_upheld',
        'already_remediated'
      )
    )
    or (
      v_dispute.dispute_type = 'fraud_report'
      and p_resolution_outcome in (
        'fraud_substantiated_correction_applied',
        'fraud_substantiated_revoke_applied',
        'fraud_not_substantiated',
        'already_remediated'
      )
    )
  ) then
    raise exception 'HOF_DISPUTE_RESOLUTION_OUTCOME_INVALID'
      using errcode = '22023';
  end if;

  if p_operation = 'hall_of_fame.dispute.resolve'
     and p_resolution_outcome in (
       'correction_applied',
       'objection_upheld_correction_applied',
       'objection_upheld_revoke_applied',
       'fraud_substantiated_correction_applied',
       'fraud_substantiated_revoke_applied'
     ) then
    raise exception 'HOF_DISPUTE_CANONICAL_ACTION_REQUIRED'
      using errcode = '22023';
  end if;

  insert into public.hall_of_fame_dispute_reviews (
    dispute_id,
    review_kind,
    note,
    actor_user_id,
    request_id,
    created_at
  ) values (
    v_dispute.id,
    'resolution_note',
    p_internal_note,
    p_actor_user_id,
    p_request_id,
    v_resolved_at
  )
  returning id into v_review_id;

  update public.hall_of_fame_disputes as dispute
  set
    status = 'resolved',
    version = dispute.version + 1,
    resolved_at = v_resolved_at,
    resolved_by_user_id = p_actor_user_id,
    resolution_outcome = p_resolution_outcome,
    resolution_message = p_resolution_message,
    resolution_canonical_record_id = p_resolution_canonical_record_id,
    last_actor_user_id = p_actor_user_id,
    last_request_id = p_request_id,
    updated_at = v_resolved_at
  where dispute.id = v_dispute.id
    and dispute.version = p_expected_version
    and dispute.status = 'under_review'
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
    request_id,
    resolution_outcome
  ) values (
    v_dispute.id,
    v_dispute.version,
    'hall_of_fame.dispute.resolved',
    'under_review',
    'resolved',
    p_actor_user_id,
    p_request_id,
    p_resolution_outcome
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
    p_actor_user_id,
    'user',
    p_operation,
    'hall_of_fame_dispute',
    v_dispute.id::text,
    pg_catalog.jsonb_build_object(
      'status', 'under_review',
      'version', p_expected_version
    ),
    pg_catalog.jsonb_build_object(
      'status', v_dispute.status,
      'version', v_dispute.version,
      'resolution_outcome', p_resolution_outcome
    ),
    pg_catalog.jsonb_strip_nulls(
      pg_catalog.jsonb_build_object(
        'dispute_type', v_dispute.dispute_type,
        'review_id', v_review_id,
        'canonical_operation', p_canonical_operation,
        'child_request_id', p_child_request_id,
        'resolution_canonical_record_id',
          p_resolution_canonical_record_id
      )
    ),
    p_request_id,
    'success'
  );

  v_result := pg_catalog.jsonb_strip_nulls(
    pg_catalog.jsonb_build_object(
      'operation', p_operation,
      'dispute_id', v_dispute.id,
      'status', v_dispute.status,
      'version', v_dispute.version,
      'resolution_outcome', p_resolution_outcome,
      'resolution_canonical_record_id',
        p_resolution_canonical_record_id,
      'review_id', v_review_id,
      'resolved_at', v_resolved_at,
      'canonical_operation', p_canonical_operation,
      'child_request_id', p_child_request_id,
      'changed', true
    )
  );
  perform private.complete_hall_of_fame_request(
    p_actor_user_id,
    p_request_id,
    p_operation,
    null,
    null,
    p_payload_fingerprint,
    v_result
  );

  return query select
    v_dispute.version,
    v_review_id,
    v_resolved_at;
end;
$$;

comment on function private.finish_hall_of_fame_dispute_resolution(
  uuid, uuid, text, bytea, uuid, integer, text, text, text,
  uuid, uuid, text
) is
  'Finishes one outer dispute resolution with a private note, current/history/audit writes, optional child correlation, and exact ledger completion.';

revoke all on function private.finish_hall_of_fame_dispute_resolution(
  uuid, uuid, text, bytea, uuid, integer, text, text, text,
  uuid, uuid, text
) from public, anon, authenticated, service_role;

create function public.resolve_hall_of_fame_dispute(
  p_dispute_id uuid,
  p_expected_version integer,
  p_resolution_outcome text,
  p_resolution_message text,
  p_internal_note text,
  p_request_id uuid
)
returns table (
  request_id uuid,
  operation text,
  dispute_id uuid,
  status text,
  version integer,
  resolution_outcome text,
  resolved_at timestamptz,
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
  v_operation text := 'hall_of_fame.dispute.resolve';
  v_outcome text := pg_catalog.lower(pg_catalog.btrim(p_resolution_outcome));
  v_message text := pg_catalog.regexp_replace(
    p_resolution_message,
    '^[[:space:]]+|[[:space:]]+$',
    '',
    'g'
  );
  v_note text := pg_catalog.regexp_replace(
    p_internal_note,
    '^[[:space:]]+|[[:space:]]+$',
    '',
    'g'
  );
  v_fingerprint bytea;
  v_claim record;
  v_finished record;
begin
  perform private.lock_active_hall_of_fame_actor(v_actor);

  if p_dispute_id is null
     or p_expected_version is null
     or p_expected_version < 1
     or p_request_id is null
     or v_outcome is null
     or v_outcome not in (
       'correction_denied',
       'appeal_denied',
       're_review_recommended',
       'objection_not_upheld',
       'fraud_not_substantiated',
       'already_remediated'
     )
     or v_message is null
     or v_message !~ '[^[:space:]]'
     or pg_catalog.char_length(v_message) not between 2 and 2000
     or v_note is null
     or v_note !~ '[^[:space:]]'
     or pg_catalog.char_length(v_note) not between 2 and 2000 then
    raise exception 'HOF_INVALID_DISPUTE_RESOLUTION_REQUEST'
      using errcode = '22023';
  end if;

  v_fingerprint := extensions.digest(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'operation', v_operation,
        'dispute_id', p_dispute_id,
        'expected_version', p_expected_version,
        'resolution_outcome', v_outcome,
        'resolution_message', v_message,
        'internal_note', v_note
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
    v_fingerprint
  );

  if v_claim.replayed then
    return query select
      p_request_id,
      v_claim.result_payload ->> 'operation',
      (v_claim.result_payload ->> 'dispute_id')::uuid,
      v_claim.result_payload ->> 'status',
      (v_claim.result_payload ->> 'version')::integer,
      v_claim.result_payload ->> 'resolution_outcome',
      (v_claim.result_payload ->> 'resolved_at')::timestamptz,
      (v_claim.result_payload ->> 'changed')::boolean,
      true;
    return;
  end if;

  select *
    into v_finished
  from private.finish_hall_of_fame_dispute_resolution(
    v_actor,
    p_request_id,
    v_operation,
    v_fingerprint,
    p_dispute_id,
    p_expected_version,
    v_outcome,
    v_message,
    v_note,
    null,
    null,
    null
  );

  return query select
    p_request_id,
    v_operation,
    p_dispute_id,
    'resolved'::text,
    v_finished.dispute_version,
    v_outcome,
    v_finished.resolved_at,
    true,
    false;
end;
$$;

comment on function public.resolve_hall_of_fame_dispute(
  uuid, integer, text, text, text, uuid
) is
  'Resolves one under-review dispute with a no-canonical-action outcome, sanitized submitter message, private note, and exact replay.';

revoke all on function public.resolve_hall_of_fame_dispute(
  uuid, integer, text, text, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.resolve_hall_of_fame_dispute(
  uuid, integer, text, text, text, uuid
) to authenticated;

create function public.resolve_hall_of_fame_dispute_with_correction(
  p_dispute_id uuid,
  p_expected_dispute_version integer,
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
  p_resolution_message text,
  p_internal_note text,
  p_request_id uuid
)
returns table (
  request_id uuid,
  operation text,
  dispute_id uuid,
  status text,
  version integer,
  resolution_outcome text,
  canonical_record_id uuid,
  resolved_at timestamptz,
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
  v_operation text := 'hall_of_fame.dispute.resolve.correction';
  v_record_type text := pg_catalog.lower(pg_catalog.btrim(p_record_type_code));
  v_course_name text := pg_catalog.btrim(p_course_name_snapshot);
  v_course_region text := pg_catalog.btrim(p_course_region_snapshot);
  v_environment text := pg_catalog.lower(pg_catalog.btrim(p_course_environment));
  v_layout text := nullif(pg_catalog.btrim(p_course_layout_snapshot), '');
  v_segment text := pg_catalog.btrim(p_course_segment_snapshot);
  v_reason_code text := pg_catalog.lower(pg_catalog.btrim(p_correction_reason_code));
  v_reason text := pg_catalog.btrim(p_correction_reason);
  v_message text := pg_catalog.regexp_replace(
    p_resolution_message,
    '^[[:space:]]+|[[:space:]]+$',
    '',
    'g'
  );
  v_note text := pg_catalog.regexp_replace(
    p_internal_note,
    '^[[:space:]]+|[[:space:]]+$',
    '',
    'g'
  );
  v_fingerprint bytea;
  v_claim record;
  v_dispute public.hall_of_fame_disputes%rowtype;
  v_canonical public.hall_of_fame_records%rowtype;
  v_child_request_id uuid;
  v_inner record;
  v_finished record;
  v_outcome text;
begin
  perform private.lock_active_hall_of_fame_actor(v_actor);

  if p_dispute_id is null
     or p_expected_dispute_version is null
     or p_expected_dispute_version < 1
     or p_record_id is null
     or p_expected_record_version is null
     or p_expected_record_version < 1
     or p_request_id is null
     or v_message is null
     or v_message !~ '[^[:space:]]'
     or pg_catalog.char_length(v_message) not between 2 and 2000
     or v_note is null
     or v_note !~ '[^[:space:]]'
     or pg_catalog.char_length(v_note) not between 2 and 2000 then
    raise exception 'HOF_INVALID_DISPUTE_CORRECTION_REQUEST'
      using errcode = '22023';
  end if;

  v_fingerprint := extensions.digest(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'operation', v_operation,
        'dispute_id', p_dispute_id,
        'expected_dispute_version', p_expected_dispute_version,
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
        'correction_reason', v_reason,
        'resolution_message', v_message,
        'internal_note', v_note
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
    v_fingerprint
  );

  if v_claim.replayed then
    return query select
      p_request_id,
      v_claim.result_payload ->> 'operation',
      (v_claim.result_payload ->> 'dispute_id')::uuid,
      v_claim.result_payload ->> 'status',
      (v_claim.result_payload ->> 'version')::integer,
      v_claim.result_payload ->> 'resolution_outcome',
      (v_claim.result_payload ->> 'resolution_canonical_record_id')::uuid,
      (v_claim.result_payload ->> 'resolved_at')::timestamptz,
      (v_claim.result_payload ->> 'changed')::boolean,
      true;
    return;
  end if;

  perform private.require_hall_of_fame_platform_permission(
    v_actor,
    'hall_of_fame.disputes.resolve'
  );
  perform private.require_hall_of_fame_platform_permission(
    v_actor,
    'hall_of_fame.records.correct'
  );

  select dispute.*
    into v_dispute
  from public.hall_of_fame_disputes as dispute
  where dispute.id = p_dispute_id
  for update;

  if not found then
    raise exception 'HOF_DISPUTE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_dispute.version <> p_expected_dispute_version then
    raise exception 'HOF_STALE_DISPUTE_VERSION' using errcode = 'PT409';
  end if;
  if v_actor in (v_dispute.submitted_by_user_id, v_dispute.subject_user_id) then
    raise exception 'HOF_DISPUTE_REVIEW_CONFLICT_OF_INTEREST'
      using errcode = '42501';
  end if;
  if v_dispute.status in ('resolved', 'withdrawn') then
    raise exception 'HOF_DISPUTE_TERMINAL_STATE' using errcode = 'PT409';
  end if;
  if v_dispute.status <> 'under_review' then
    raise exception 'HOF_DISPUTE_RESOLUTION_STATE_INVALID'
      using errcode = 'PT409';
  end if;
  if v_dispute.canonical_record_id is null
     or v_dispute.canonical_record_id <> p_record_id
     or v_dispute.dispute_type = 'decision_appeal'
     or v_dispute.dispute_type not in (
       'correction_request',
       'subject_objection',
       'fraud_report'
     ) then
    raise exception 'HOF_DISPUTE_CANONICAL_TARGET_INVALID'
      using errcode = '22023';
  end if;

  select canonical.*
    into v_canonical
  from public.hall_of_fame_records as canonical
  where canonical.id = p_record_id;
  if not found
     or v_canonical.target_user_id <> v_dispute.subject_user_id then
    raise exception 'HOF_DISPUTE_CANONICAL_TARGET_INVALID'
      using errcode = '22023';
  end if;
  if v_canonical.version <> p_expected_record_version then
    raise exception 'HOF_STALE_RECORD_VERSION' using errcode = 'PT409';
  end if;
  if v_canonical.validity_status <> 'active' then
    raise exception 'HOF_CANONICAL_TERMINAL_STATE' using errcode = 'PT409';
  end if;

  v_outcome := case v_dispute.dispute_type
    when 'correction_request' then 'correction_applied'
    when 'subject_objection' then 'objection_upheld_correction_applied'
    when 'fraud_report' then 'fraud_substantiated_correction_applied'
  end;

  loop
    v_child_request_id := pg_catalog.gen_random_uuid();
    exit when v_child_request_id <> p_request_id
      and not exists (
        select 1
        from private.hall_of_fame_mutation_requests as ledger
        where ledger.actor_user_id = v_actor
          and ledger.request_id = v_child_request_id
      );
  end loop;

  select result.*
    into v_inner
  from public.correct_hall_of_fame_canonical_record(
    p_record_id,
    p_expected_record_version,
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
    v_reason_code,
    v_reason,
    v_child_request_id
  ) as result;

  if v_inner.predecessor_record_id <> p_record_id
     or v_inner.successor_record_id is null
     or v_inner.successor_validity_status <> 'active'
     or not v_inner.changed then
    raise exception 'HOF_CANONICAL_CORRECTION_RESULT_INVALID'
      using errcode = '23514';
  end if;

  perform private.restore_hall_of_fame_dispute_context(
    v_actor,
    p_request_id,
    v_operation,
    v_fingerprint,
    p_dispute_id
  );

  select *
    into v_finished
  from private.finish_hall_of_fame_dispute_resolution(
    v_actor,
    p_request_id,
    v_operation,
    v_fingerprint,
    p_dispute_id,
    p_expected_dispute_version,
    v_outcome,
    v_message,
    v_note,
    v_inner.successor_record_id,
    v_child_request_id,
    'hall_of_fame.record.correct'
  );

  return query select
    p_request_id,
    v_operation,
    p_dispute_id,
    'resolved'::text,
    v_finished.dispute_version,
    v_outcome,
    v_inner.successor_record_id,
    v_finished.resolved_at,
    true,
    false;
end;
$$;

comment on function public.resolve_hall_of_fame_dispute_with_correction(
  uuid, integer, uuid, integer, text, date, text, text, text, text,
  text, integer, integer, integer, uuid, text, text, text, text, uuid
) is
  'Resolves an eligible canonical-target dispute by invoking the approved correction RPC with a private child request in the same transaction.';

revoke all on function public.resolve_hall_of_fame_dispute_with_correction(
  uuid, integer, uuid, integer, text, date, text, text, text, text,
  text, integer, integer, integer, uuid, text, text, text, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.resolve_hall_of_fame_dispute_with_correction(
  uuid, integer, uuid, integer, text, date, text, text, text, text,
  text, integer, integer, integer, uuid, text, text, text, text, uuid
) to authenticated;

create function public.resolve_hall_of_fame_dispute_with_revoke(
  p_dispute_id uuid,
  p_expected_dispute_version integer,
  p_record_id uuid,
  p_expected_record_version integer,
  p_revocation_reason_code text,
  p_revocation_reason text,
  p_resolution_message text,
  p_internal_note text,
  p_request_id uuid
)
returns table (
  request_id uuid,
  operation text,
  dispute_id uuid,
  status text,
  version integer,
  resolution_outcome text,
  canonical_record_id uuid,
  resolved_at timestamptz,
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
  v_operation text := 'hall_of_fame.dispute.resolve.revoke';
  v_reason_code text := pg_catalog.lower(pg_catalog.btrim(p_revocation_reason_code));
  v_reason text := pg_catalog.btrim(p_revocation_reason);
  v_message text := pg_catalog.regexp_replace(
    p_resolution_message,
    '^[[:space:]]+|[[:space:]]+$',
    '',
    'g'
  );
  v_note text := pg_catalog.regexp_replace(
    p_internal_note,
    '^[[:space:]]+|[[:space:]]+$',
    '',
    'g'
  );
  v_fingerprint bytea;
  v_claim record;
  v_dispute public.hall_of_fame_disputes%rowtype;
  v_canonical public.hall_of_fame_records%rowtype;
  v_child_request_id uuid;
  v_inner record;
  v_finished record;
  v_outcome text;
begin
  perform private.lock_active_hall_of_fame_actor(v_actor);

  if p_dispute_id is null
     or p_expected_dispute_version is null
     or p_expected_dispute_version < 1
     or p_record_id is null
     or p_expected_record_version is null
     or p_expected_record_version < 1
     or p_request_id is null
     or v_message is null
     or v_message !~ '[^[:space:]]'
     or pg_catalog.char_length(v_message) not between 2 and 2000
     or v_note is null
     or v_note !~ '[^[:space:]]'
     or pg_catalog.char_length(v_note) not between 2 and 2000 then
    raise exception 'HOF_INVALID_DISPUTE_REVOCATION_REQUEST'
      using errcode = '22023';
  end if;

  v_fingerprint := extensions.digest(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'operation', v_operation,
        'dispute_id', p_dispute_id,
        'expected_dispute_version', p_expected_dispute_version,
        'record_id', p_record_id,
        'expected_record_version', p_expected_record_version,
        'revocation_reason_code', v_reason_code,
        'revocation_reason', v_reason,
        'resolution_message', v_message,
        'internal_note', v_note
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
    v_fingerprint
  );

  if v_claim.replayed then
    return query select
      p_request_id,
      v_claim.result_payload ->> 'operation',
      (v_claim.result_payload ->> 'dispute_id')::uuid,
      v_claim.result_payload ->> 'status',
      (v_claim.result_payload ->> 'version')::integer,
      v_claim.result_payload ->> 'resolution_outcome',
      (v_claim.result_payload ->> 'resolution_canonical_record_id')::uuid,
      (v_claim.result_payload ->> 'resolved_at')::timestamptz,
      (v_claim.result_payload ->> 'changed')::boolean,
      true;
    return;
  end if;

  perform private.require_hall_of_fame_platform_permission(
    v_actor,
    'hall_of_fame.disputes.resolve'
  );
  perform private.require_hall_of_fame_platform_permission(
    v_actor,
    'hall_of_fame.records.revoke'
  );

  select dispute.*
    into v_dispute
  from public.hall_of_fame_disputes as dispute
  where dispute.id = p_dispute_id
  for update;

  if not found then
    raise exception 'HOF_DISPUTE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_dispute.version <> p_expected_dispute_version then
    raise exception 'HOF_STALE_DISPUTE_VERSION' using errcode = 'PT409';
  end if;
  if v_actor in (v_dispute.submitted_by_user_id, v_dispute.subject_user_id) then
    raise exception 'HOF_DISPUTE_REVIEW_CONFLICT_OF_INTEREST'
      using errcode = '42501';
  end if;
  if v_dispute.status in ('resolved', 'withdrawn') then
    raise exception 'HOF_DISPUTE_TERMINAL_STATE' using errcode = 'PT409';
  end if;
  if v_dispute.status <> 'under_review' then
    raise exception 'HOF_DISPUTE_RESOLUTION_STATE_INVALID'
      using errcode = 'PT409';
  end if;
  if v_dispute.canonical_record_id is null
     or v_dispute.canonical_record_id <> p_record_id
     or v_dispute.dispute_type not in (
       'subject_objection',
       'fraud_report'
     ) then
    raise exception 'HOF_DISPUTE_CANONICAL_TARGET_INVALID'
      using errcode = '22023';
  end if;

  select canonical.*
    into v_canonical
  from public.hall_of_fame_records as canonical
  where canonical.id = p_record_id;
  if not found
     or v_canonical.target_user_id <> v_dispute.subject_user_id then
    raise exception 'HOF_DISPUTE_CANONICAL_TARGET_INVALID'
      using errcode = '22023';
  end if;
  if v_canonical.version <> p_expected_record_version then
    raise exception 'HOF_STALE_RECORD_VERSION' using errcode = 'PT409';
  end if;
  if v_canonical.validity_status <> 'active' then
    raise exception 'HOF_CANONICAL_TERMINAL_STATE' using errcode = 'PT409';
  end if;

  v_outcome := case v_dispute.dispute_type
    when 'subject_objection' then 'objection_upheld_revoke_applied'
    when 'fraud_report' then 'fraud_substantiated_revoke_applied'
  end;

  loop
    v_child_request_id := pg_catalog.gen_random_uuid();
    exit when v_child_request_id <> p_request_id
      and not exists (
        select 1
        from private.hall_of_fame_mutation_requests as ledger
        where ledger.actor_user_id = v_actor
          and ledger.request_id = v_child_request_id
      );
  end loop;

  select result.*
    into v_inner
  from public.revoke_hall_of_fame_canonical_record(
    p_record_id,
    p_expected_record_version,
    v_reason_code,
    v_reason,
    v_child_request_id
  ) as result;

  if v_inner.record_id <> p_record_id
     or v_inner.validity_status <> 'revoked'
     or v_inner.publication_status <> 'suppressed'
     or v_inner.active_badge_count <> 0
     or not v_inner.changed then
    raise exception 'HOF_CANONICAL_REVOCATION_RESULT_INVALID'
      using errcode = '23514';
  end if;

  perform private.restore_hall_of_fame_dispute_context(
    v_actor,
    p_request_id,
    v_operation,
    v_fingerprint,
    p_dispute_id
  );

  select *
    into v_finished
  from private.finish_hall_of_fame_dispute_resolution(
    v_actor,
    p_request_id,
    v_operation,
    v_fingerprint,
    p_dispute_id,
    p_expected_dispute_version,
    v_outcome,
    v_message,
    v_note,
    p_record_id,
    v_child_request_id,
    'hall_of_fame.record.revoke'
  );

  return query select
    p_request_id,
    v_operation,
    p_dispute_id,
    'resolved'::text,
    v_finished.dispute_version,
    v_outcome,
    p_record_id,
    v_finished.resolved_at,
    true,
    false;
end;
$$;

comment on function public.resolve_hall_of_fame_dispute_with_revoke(
  uuid, integer, uuid, integer, text, text, text, text, uuid
) is
  'Resolves an eligible canonical-target dispute by invoking the approved revoke RPC with a private child request in the same transaction.';

revoke all on function public.resolve_hall_of_fame_dispute_with_revoke(
  uuid, integer, uuid, integer, text, text, text, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.resolve_hall_of_fame_dispute_with_revoke(
  uuid, integer, uuid, integer, text, text, text, text, uuid
) to authenticated;

drop function public.list_my_hall_of_fame_disputes(integer, integer);

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
  withdrawn_at timestamptz,
  resolution_outcome text,
  resolution_message text,
  resolved_at timestamptz
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
    dispute.withdrawn_at,
    dispute.resolution_outcome,
    dispute.resolution_message,
    dispute.resolved_at
  from public.hall_of_fame_disputes as dispute
  where dispute.submitted_by_user_id = v_actor
  order by dispute.created_at desc, dispute.id desc
  limit p_limit
  offset p_offset;
end;
$$;

comment on function public.list_my_hall_of_fame_disputes(integer, integer)
  is 'Returns submitter-owned private dispute DTOs with sanitized resolution outcome, message, and timestamp only.';

revoke all on function public.list_my_hall_of_fame_disputes(integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_my_hall_of_fame_disputes(integer, integer)
  to authenticated;

drop function public.get_my_hall_of_fame_dispute(uuid);

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
  withdrawn_at timestamptz,
  resolution_outcome text,
  resolution_message text,
  resolved_at timestamptz
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
    dispute.withdrawn_at,
    dispute.resolution_outcome,
    dispute.resolution_message,
    dispute.resolved_at
  from public.hall_of_fame_disputes as dispute
  where dispute.id = p_dispute_id
    and dispute.submitted_by_user_id = v_actor;
end;
$$;

comment on function public.get_my_hall_of_fame_dispute(uuid) is
  'Returns one submitter-owned private dispute DTO without reviewer identity, internal notes, canonical reason, or child request data.';

revoke all on function public.get_my_hall_of_fame_dispute(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_hall_of_fame_dispute(uuid)
  to authenticated;

do $$
begin
  if (
    select pg_catalog.count(*)
    from public.platform_permission_definitions as permission
    where permission.code in (
      'hall_of_fame.disputes.read',
      'hall_of_fame.disputes.review',
      'hall_of_fame.disputes.resolve'
    )
      and permission.is_active
  ) <> 3 then
    raise exception 'HOF_DISPUTE_PERMISSION_PROVISIONING_FAILED';
  end if;

  if not exists (
    select 1
    from public.platform_role_permissions as mapping
    where mapping.platform_role = 'platform_moderator'
      and mapping.permission_code = 'hall_of_fame.disputes.read'
  )
     or not exists (
       select 1
       from public.platform_role_permissions as mapping
       where mapping.platform_role = 'platform_moderator'
         and mapping.permission_code = 'hall_of_fame.disputes.review'
     )
     or exists (
       select 1
       from public.platform_role_permissions as mapping
       where mapping.platform_role = 'platform_moderator'
         and mapping.permission_code in (
           'hall_of_fame.disputes.resolve',
           'hall_of_fame.records.correct',
           'hall_of_fame.records.revoke'
         )
     ) then
    raise exception 'HOF_DISPUTE_MODERATOR_PERMISSION_MATRIX_INVALID';
  end if;

  if (
    select pg_catalog.count(*)
    from public.platform_role_permissions as mapping
    where mapping.platform_role = 'platform_admin'
      and mapping.permission_code in (
        'hall_of_fame.disputes.read',
        'hall_of_fame.disputes.review',
        'hall_of_fame.disputes.resolve'
      )
  ) <> 3 then
    raise exception 'HOF_DISPUTE_ADMIN_PERMISSION_MATRIX_INVALID';
  end if;
end;
$$;
