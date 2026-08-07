-- PUL 8-6-B-2B-1: target consent, publication consent, and member confirmation mutations.
-- Evidence, submission, review, canonical-record, badge, and external-confirmer RPCs remain deferred.

create function private.lock_hall_of_fame_mutation_request(
  p_actor_user_id uuid,
  p_request_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_actor_user_id is null or p_request_id is null then
    raise exception 'HOF_INVALID_REQUEST' using errcode = '22023';
  end if;

  if not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_actor_user_id::text || ':' || p_request_id::text,
      8609
    )
  ) then
    raise exception
      using
        errcode = 'PT409',
        message = 'HOF_REQUEST_IN_PROGRESS';
  end if;
end;
$$;

comment on function private.lock_hall_of_fame_mutation_request(uuid, uuid) is
  'Acquires the transaction-scoped actor/request lock before any blocking HOF entity lock.';

revoke all on function private.lock_hall_of_fame_mutation_request(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function private.hall_of_fame_claim_request(
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

  perform private.lock_hall_of_fame_mutation_request(
    p_actor_user_id,
    p_request_id
  );

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
    raise exception
      using
        errcode = 'PT409',
        message = 'HOF_REQUEST_IN_PROGRESS';
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
  'Serializes actor/request claims without waiting, replays a completed identical request, and rejects concurrent or mismatched request reuse.';

revoke all on function private.hall_of_fame_claim_request(
  uuid, uuid, text, uuid, uuid, uuid, bytea
) from public, anon, authenticated, service_role;

create table public.hall_of_fame_application_consents (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  application_record_id uuid not null,
  application_batch_id uuid not null,
  subject_user_id uuid not null
    references public.user_accounts (id) on delete restrict,
  consent_purpose text not null,
  status text not null,
  policy_version text not null,
  version integer not null default 1,
  requested_at timestamptz,
  expires_at timestamptz,
  granted_at timestamptz,
  declined_at timestamptz,
  withdrawn_at timestamptz,
  last_actor_user_id uuid not null
    references public.user_accounts (id) on delete restrict,
  last_request_id uuid not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint hall_of_fame_application_consents_record_batch_fkey
    foreign key (application_record_id, application_batch_id)
    references public.hall_of_fame_application_records (
      id,
      application_batch_id
    )
    on delete restrict,
  constraint hall_of_fame_application_consents_record_subject_fkey
    foreign key (application_record_id, subject_user_id)
    references public.hall_of_fame_application_records (id, target_user_id)
    on delete restrict,
  constraint hall_of_fame_application_consents_ledger_fkey
    foreign key (last_actor_user_id, last_request_id)
    references private.hall_of_fame_mutation_requests (
      actor_user_id,
      request_id
    )
    on delete restrict,
  constraint hall_of_fame_application_consents_record_purpose_unique
    unique (application_record_id, consent_purpose),
  constraint hall_of_fame_application_consents_purpose_check
    check (
      consent_purpose in (
        'application_processing',
        'evidence_review',
        'nomination_acceptance'
      )
    ),
  constraint hall_of_fame_application_consents_status_check
    check (status in ('pending', 'granted', 'declined', 'withdrawn')),
  constraint hall_of_fame_application_consents_policy_version_check
    check (
      policy_version = pg_catalog.btrim(policy_version)
      and policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'
    ),
  constraint hall_of_fame_application_consents_version_check
    check (version >= 1),
  constraint hall_of_fame_application_consents_request_window_check
    check (
      (
        consent_purpose = 'nomination_acceptance'
        and requested_at is not null
        and expires_at = requested_at + interval '14 days'
      )
      or (
        consent_purpose <> 'nomination_acceptance'
        and requested_at is null
        and expires_at is null
      )
    ),
  constraint hall_of_fame_application_consents_status_timestamps_check
    check (
      (
        status = 'pending'
        and granted_at is null
        and declined_at is null
        and withdrawn_at is null
      )
      or (
        status = 'granted'
        and granted_at is not null
        and declined_at is null
        and withdrawn_at is null
      )
      or (
        status = 'declined'
        and granted_at is null
        and declined_at is not null
        and withdrawn_at is null
      )
      or (
        status = 'withdrawn'
        and withdrawn_at is not null
      )
    ),
  constraint hall_of_fame_application_consents_timeline_check
    check (
      updated_at >= created_at
      and (expires_at is null or expires_at > requested_at)
      and (granted_at is null or granted_at >= created_at)
      and (declined_at is null or declined_at >= created_at)
      and (withdrawn_at is null or withdrawn_at >= created_at)
    )
);

comment on table public.hall_of_fame_application_consents is
  'Current target-owned HOF application-processing, evidence-review, and nomination-acceptance decisions.';

create index hall_of_fame_application_consents_subject_status_idx
  on public.hall_of_fame_application_consents (
    subject_user_id,
    status,
    updated_at desc,
    id
  );

create table public.hall_of_fame_application_consent_history (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  application_consent_id uuid not null
    references public.hall_of_fame_application_consents (id) on delete restrict,
  application_record_id uuid not null,
  application_batch_id uuid not null,
  subject_user_id uuid not null,
  consent_purpose text not null,
  policy_version text not null,
  from_status text,
  to_status text not null,
  version integer not null,
  actor_user_id uuid not null
    references public.user_accounts (id) on delete restrict,
  request_id uuid not null,
  requested_at timestamptz,
  expires_at timestamptz,
  occurred_at timestamptz not null default pg_catalog.now(),
  constraint hall_of_fame_application_consent_history_record_batch_fkey
    foreign key (application_record_id, application_batch_id)
    references public.hall_of_fame_application_records (
      id,
      application_batch_id
    )
    on delete restrict,
  constraint hall_of_fame_application_consent_history_record_subject_fkey
    foreign key (application_record_id, subject_user_id)
    references public.hall_of_fame_application_records (id, target_user_id)
    on delete restrict,
  constraint hall_of_fame_application_consent_history_ledger_fkey
    foreign key (actor_user_id, request_id)
    references private.hall_of_fame_mutation_requests (
      actor_user_id,
      request_id
    )
    on delete restrict,
  constraint hall_of_fame_application_consent_history_version_unique
    unique (application_consent_id, version),
  constraint hall_of_fame_application_consent_history_purpose_check
    check (
      consent_purpose in (
        'application_processing',
        'evidence_review',
        'nomination_acceptance'
      )
    ),
  constraint hall_of_fame_application_consent_history_status_check
    check (
      (from_status is null or from_status in ('pending', 'granted', 'declined', 'withdrawn', 'expired'))
      and to_status in ('pending', 'granted', 'declined', 'withdrawn')
    ),
  constraint hall_of_fame_application_consent_history_policy_version_check
    check (
      policy_version = pg_catalog.btrim(policy_version)
      and policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'
    ),
  constraint hall_of_fame_application_consent_history_version_check
    check (version >= 1),
  constraint hall_of_fame_application_consent_history_request_window_check
    check (
      (
        consent_purpose = 'nomination_acceptance'
        and requested_at is not null
        and expires_at = requested_at + interval '14 days'
      )
      or (
        consent_purpose <> 'nomination_acceptance'
        and requested_at is null
        and expires_at is null
      )
    )
);

comment on table public.hall_of_fame_application_consent_history is
  'Append-only target consent history linked to the exact HOF mutation request.';

alter table public.hall_of_fame_publication_consents
  add column policy_version text,
  add column masked_display_name_consent boolean,
  add column full_display_name_consent boolean,
  add column badge_consent boolean,
  add column last_actor_user_id uuid
    references public.user_accounts (id) on delete restrict,
  add column last_request_id uuid;

-- The B-1 deny-by-default trigger is active while this migration backfills
-- newly added publication columns. Permit only that exact, scope-preserving
-- legacy-row transformation; the final ledger-bound guard below replaces this
-- compatibility branch before the transaction can commit.
create or replace function private.reject_hall_of_fame_mutation()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if tg_table_schema = 'public'
     and tg_table_name = 'hall_of_fame_publication_consents'
     and tg_op = 'UPDATE'
     and (pg_catalog.to_jsonb(new) - 'policy_version' - 'masked_display_name_consent'
       - 'full_display_name_consent' - 'badge_consent' - 'last_actor_user_id'
       - 'last_request_id')
       is not distinct from
       (pg_catalog.to_jsonb(old) - 'policy_version' - 'masked_display_name_consent'
       - 'full_display_name_consent' - 'badge_consent' - 'last_actor_user_id'
       - 'last_request_id')
     and old.policy_version is null
     and old.masked_display_name_consent is null
     and old.full_display_name_consent is null
     and old.badge_consent is null
     and old.last_actor_user_id is null
     and old.last_request_id is null
     and new.policy_version = 'hof-publication-legacy-v1'
     and new.masked_display_name_consent = new.display_name_consent
     and not new.full_display_name_consent
     and not new.badge_consent
     and new.last_actor_user_id is null
     and new.last_request_id is null then
    return new;
  end if;

  raise exception 'HOF_MUTATION_RPC_REQUIRED' using errcode = '42501';
end;
$$;

update public.hall_of_fame_publication_consents as consent
set
  policy_version = 'hof-publication-legacy-v1',
  masked_display_name_consent = consent.display_name_consent,
  full_display_name_consent = false,
  badge_consent = false;

alter table public.hall_of_fame_publication_consents
  alter column masked_display_name_consent set default false,
  alter column masked_display_name_consent set not null,
  alter column full_display_name_consent set default false,
  alter column full_display_name_consent set not null,
  alter column badge_consent set default false,
  alter column badge_consent set not null;

alter table public.hall_of_fame_publication_consents
  drop constraint hall_of_fame_publication_consents_scope_check,
  add constraint hall_of_fame_publication_consents_policy_version_check
    check (
      policy_version is null
      or (
        policy_version = pg_catalog.btrim(policy_version)
        and policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'
      )
    ),
  add constraint hall_of_fame_publication_consents_name_scope_check
    check (
      display_name_consent = (
        masked_display_name_consent or full_display_name_consent
      )
      and (not full_display_name_consent or masked_display_name_consent)
    ),
  add constraint hall_of_fame_publication_consents_scope_check
    check (
      status <> 'granted'
      or (
        policy_version is not null
        and masked_display_name_consent
        and record_date_consent
        and course_detail_consent
      )
    ),
  add constraint hall_of_fame_publication_consents_ledger_pair_check
    check (
      (last_actor_user_id is null and last_request_id is null)
      or (last_actor_user_id is not null and last_request_id is not null)
    ),
  add constraint hall_of_fame_publication_consents_ledger_fkey
    foreign key (last_actor_user_id, last_request_id)
    references private.hall_of_fame_mutation_requests (
      actor_user_id,
      request_id
    )
    on delete restrict;

alter table public.hall_of_fame_publication_consent_history
  add column policy_version text,
  add column masked_display_name_consent boolean,
  add column full_display_name_consent boolean,
  add column badge_consent boolean;

-- Keep the append-only guard active and narrowly authorize only the same
-- in-transaction compatibility backfill for pre-existing publication history.
create or replace function private.reject_hall_of_fame_append_only_mutation()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if tg_table_schema = 'public'
     and tg_table_name = 'hall_of_fame_publication_consent_history'
     and tg_op = 'UPDATE'
     and (pg_catalog.to_jsonb(new) - 'policy_version' - 'masked_display_name_consent'
       - 'full_display_name_consent' - 'badge_consent')
       is not distinct from
       (pg_catalog.to_jsonb(old) - 'policy_version' - 'masked_display_name_consent'
       - 'full_display_name_consent' - 'badge_consent')
     and old.policy_version is null
     and old.masked_display_name_consent is null
     and old.full_display_name_consent is null
     and old.badge_consent is null
     and new.policy_version = 'hof-publication-legacy-v1'
     and new.masked_display_name_consent = new.display_name_consent
     and not new.full_display_name_consent
     and not new.badge_consent then
    return new;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    raise exception 'HOF_APPEND_ONLY_MUTATION_FORBIDDEN' using errcode = '42501';
  end if;

  raise exception 'HOF_MUTATION_RPC_REQUIRED' using errcode = '42501';
end;
$$;

update public.hall_of_fame_publication_consent_history as history
set
  policy_version = 'hof-publication-legacy-v1',
  masked_display_name_consent = history.display_name_consent,
  full_display_name_consent = false,
  badge_consent = false;

alter table public.hall_of_fame_publication_consent_history
  alter column masked_display_name_consent set default false,
  alter column masked_display_name_consent set not null,
  alter column full_display_name_consent set default false,
  alter column full_display_name_consent set not null,
  alter column badge_consent set default false,
  alter column badge_consent set not null;

alter table public.hall_of_fame_publication_consent_history
  drop constraint hall_of_fame_publication_consent_history_scope_check,
  add constraint hall_of_fame_publication_consent_history_policy_version_check
    check (
      policy_version is null
      or (
        policy_version = pg_catalog.btrim(policy_version)
        and policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'
      )
    ),
  add constraint hall_of_fame_publication_consent_history_name_scope_check
    check (
      display_name_consent = (
        masked_display_name_consent or full_display_name_consent
      )
      and (not full_display_name_consent or masked_display_name_consent)
    ),
  add constraint hall_of_fame_publication_consent_history_scope_check
    check (
      to_status <> 'granted'
      or (
        policy_version is not null
        and masked_display_name_consent
        and record_date_consent
        and course_detail_consent
      )
    );

alter table public.hall_of_fame_record_confirmations
  add column requester_user_id uuid
    references public.user_accounts (id) on delete restrict,
  add column requested_at timestamptz,
  add column expires_at timestamptz,
  add column responded_at timestamptz,
  add column cancelled_at timestamptz,
  add column withdrawn_at timestamptz,
  add column last_actor_user_id uuid
    references public.user_accounts (id) on delete restrict,
  add column last_request_id uuid;

alter table public.hall_of_fame_record_confirmations
  drop constraint hall_of_fame_record_confirmations_status_timestamps_check,
  add constraint hall_of_fame_record_confirmations_member_request_check
    check (
      confirmer_user_id is null
      or (
        requester_user_id is not null
        and requested_at is not null
        and expires_at = requested_at + interval '14 days'
      )
    ),
  add constraint hall_of_fame_record_confirmations_status_timestamps_check
    check (
      (
        status in ('pending', 'expired')
        and confirmed_at is null
        and declined_at is null
        and responded_at is null
        and cancelled_at is null
        and withdrawn_at is null
      )
      or (
        status = 'confirmed'
        and confirmed_at is not null
        and declined_at is null
        and responded_at is not null
        and cancelled_at is null
        and withdrawn_at is null
      )
      or (
        status = 'declined'
        and confirmed_at is null
        and declined_at is not null
        and responded_at is not null
        and cancelled_at is null
        and withdrawn_at is null
      )
      or (
        status = 'withdrawn'
        and declined_at is null
        and (
          (
            confirmed_at is null
            and responded_at is null
            and cancelled_at is not null
            and withdrawn_at is null
          )
          or (
            confirmed_at is not null
            and responded_at is not null
            and cancelled_at is null
            and withdrawn_at is not null
          )
        )
      )
    ),
  add constraint hall_of_fame_record_confirmations_ledger_pair_check
    check (
      (last_actor_user_id is null and last_request_id is null)
      or (last_actor_user_id is not null and last_request_id is not null)
    ),
  add constraint hall_of_fame_record_confirmations_ledger_fkey
    foreign key (last_actor_user_id, last_request_id)
    references private.hall_of_fame_mutation_requests (
      actor_user_id,
      request_id
    )
    on delete restrict;

create table public.hall_of_fame_record_confirmation_history (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  confirmation_id uuid not null
    references public.hall_of_fame_record_confirmations (id) on delete restrict,
  application_record_id uuid not null
    references public.hall_of_fame_application_records (id) on delete restrict,
  requester_user_id uuid not null
    references public.user_accounts (id) on delete restrict,
  confirmer_user_id uuid not null
    references public.user_accounts (id) on delete restrict,
  from_status text,
  to_status text not null,
  action text not null,
  version integer not null,
  actor_user_id uuid not null
    references public.user_accounts (id) on delete restrict,
  request_id uuid not null,
  requested_at timestamptz not null,
  expires_at timestamptz not null,
  occurred_at timestamptz not null default pg_catalog.now(),
  constraint hall_of_fame_record_confirmation_history_ledger_fkey
    foreign key (actor_user_id, request_id)
    references private.hall_of_fame_mutation_requests (
      actor_user_id,
      request_id
    )
    on delete restrict,
  constraint hall_of_fame_record_confirmation_history_version_unique
    unique (confirmation_id, version),
  constraint hall_of_fame_record_confirmation_history_status_check
    check (
      (from_status is null or from_status in ('pending', 'confirmed', 'declined', 'withdrawn', 'expired'))
      and to_status in ('pending', 'confirmed', 'declined', 'withdrawn')
    ),
  constraint hall_of_fame_record_confirmation_history_action_check
    check (
      action in (
        'hall_of_fame.confirmation.request',
        'hall_of_fame.confirmation.confirm',
        'hall_of_fame.confirmation.decline',
        'hall_of_fame.confirmation.cancel',
        'hall_of_fame.confirmation.withdraw'
      )
    ),
  constraint hall_of_fame_record_confirmation_history_version_check
    check (version >= 1),
  constraint hall_of_fame_record_confirmation_history_expiry_check
    check (expires_at = requested_at + interval '14 days')
);

comment on table public.hall_of_fame_record_confirmation_history is
  'Append-only member companion confirmation lifecycle; external confirmer mutations remain unsupported.';

create index hall_of_fame_record_confirmation_history_record_idx
  on public.hall_of_fame_record_confirmation_history (
    application_record_id,
    occurred_at,
    id
  );

create trigger hall_of_fame_application_consents_set_updated_at
before update on public.hall_of_fame_application_consents
for each row execute function public.set_user_foundation_updated_at();

alter table public.hall_of_fame_application_consents enable row level security;
alter table public.hall_of_fame_application_consents force row level security;
alter table public.hall_of_fame_application_consent_history enable row level security;
alter table public.hall_of_fame_application_consent_history force row level security;
alter table public.hall_of_fame_record_confirmation_history enable row level security;
alter table public.hall_of_fame_record_confirmation_history force row level security;

revoke all on table public.hall_of_fame_application_consents
  from public, anon, authenticated, service_role;
revoke all on table public.hall_of_fame_application_consent_history
  from public, anon, authenticated, service_role;
revoke all on table public.hall_of_fame_record_confirmation_history
  from public, anon, authenticated, service_role;

-- B-2B-1 guard definitions follow.

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
  v_is_consent_confirmation boolean;
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
      pg_catalog.current_setting('pul.hall_of_fame.application_batch_id', true),
      ''
    )::uuid;
    v_application_record_id := nullif(
      pg_catalog.current_setting('pul.hall_of_fame.application_record_id', true),
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
    pg_catalog.current_setting('pul.hall_of_fame.payload_fingerprint', true),
    ''
  );
  v_is_consent_confirmation := v_operation in (
    'hall_of_fame.application_consent.grant',
    'hall_of_fame.application_consent.decline',
    'hall_of_fame.application_consent.withdraw',
    'hall_of_fame.application_consent.reissue',
    'hall_of_fame.publication_consent.set',
    'hall_of_fame.publication_consent.withdraw',
    'hall_of_fame.confirmation.request',
    'hall_of_fame.confirmation.confirm',
    'hall_of_fame.confirmation.decline',
    'hall_of_fame.confirmation.cancel',
    'hall_of_fame.confirmation.withdraw'
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
         or pg_catalog.encode(new.payload_fingerprint, 'hex') <> v_payload_fingerprint_hex
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
           and new.application_record_id is distinct from v_application_record_id
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
       or pg_catalog.encode(old.payload_fingerprint, 'hex') <> v_payload_fingerprint_hex
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
        raise exception 'HOF_APPLICATION_BATCH_CONTEXT_MISMATCH' using errcode = '42501';
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
      raise exception 'HOF_APPLICATION_BATCH_CONTEXT_MISMATCH' using errcode = '42501';
    end if;

    if v_operation = 'hall_of_fame.application_draft.withdraw' then
      if new.status <> 'withdrawn'
         or new.submitted_at is null
         or new.finalized_at is null then
        raise exception 'HOF_APPLICATION_BATCH_CONTEXT_MISMATCH' using errcode = '42501';
      end if;
    elsif v_operation in (
      'hall_of_fame.round_snapshot.set',
      'hall_of_fame.application_record.add',
      'hall_of_fame.application_record.update',
      'hall_of_fame.application_record.withdraw'
    ) or v_is_consent_confirmation then
      if new.status <> 'draft'
         or new.submitted_at is not null
         or new.finalized_at is not null then
        raise exception 'HOF_APPLICATION_BATCH_CONTEXT_MISMATCH' using errcode = '42501';
      end if;
    else
      raise exception 'HOF_APPLICATION_BATCH_CONTEXT_MISMATCH' using errcode = '42501';
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
      raise exception 'HOF_ROUND_SNAPSHOT_CONTEXT_MISMATCH' using errcode = '42501';
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
      raise exception 'HOF_APPLICATION_RECORD_CONTEXT_MISMATCH' using errcode = '42501';
    end if;

    if tg_op = 'INSERT' then
      if v_operation <> 'hall_of_fame.application_record.add'
         or new.review_status <> 'draft'
         or new.version <> 1 then
        raise exception 'HOF_APPLICATION_RECORD_CONTEXT_MISMATCH' using errcode = '42501';
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
       or new.fingerprint_version <> old.fingerprint_version
       or new.created_at <> old.created_at
       or old.review_status <> 'draft'
       or new.version <> old.version + 1 then
      raise exception 'HOF_APPLICATION_RECORD_CONTEXT_MISMATCH' using errcode = '42501';
    end if;

    if v_is_consent_confirmation then
      if new.review_status <> 'draft'
         or new.record_type_code <> old.record_type_code
         or new.course_segment_snapshot <> old.course_segment_snapshot
         or new.hole_number <> old.hole_number
         or new.hole_par is distinct from old.hole_par
         or new.strokes is distinct from old.strokes
         or new.duplicate_fingerprint is distinct from old.duplicate_fingerprint
         or (
           v_operation not like 'hall_of_fame.application_consent.%'
           and new.member_consent_status <> old.member_consent_status
         ) then
        raise exception 'HOF_APPLICATION_RECORD_CONTEXT_MISMATCH' using errcode = '42501';
      end if;
    elsif new.member_consent_status <> old.member_consent_status then
      raise exception 'HOF_APPLICATION_RECORD_CONTEXT_MISMATCH' using errcode = '42501';
    elsif v_operation = 'hall_of_fame.application_record.update' then
      if new.review_status <> 'draft' then
        raise exception 'HOF_APPLICATION_RECORD_CONTEXT_MISMATCH' using errcode = '42501';
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
        raise exception 'HOF_APPLICATION_RECORD_CONTEXT_MISMATCH' using errcode = '42501';
      end if;
    elsif v_operation <> 'hall_of_fame.application_record.update' then
      raise exception 'HOF_APPLICATION_RECORD_CONTEXT_MISMATCH' using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'HOF_MUTATION_RPC_REQUIRED' using errcode = '42501';
end;
$$;

comment on function private.reject_hall_of_fame_mutation() is
  'Ledger-bound HOF guard extended for B-2B-1 batch and record version synchronization while preserving B-2A mutations.';

revoke all on function private.reject_hall_of_fame_mutation()
  from public, anon, authenticated, service_role;

create function private.guard_hall_of_fame_consent_confirmation_current()
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
begin
  if tg_op = 'DELETE' then
    raise exception 'HOF_DIRECT_DELETE_FORBIDDEN' using errcode = '42501';
  end if;

  begin
    v_actor_user_id := nullif(pg_catalog.current_setting('pul.hall_of_fame.actor_user_id', true), '')::uuid;
    v_request_id := nullif(pg_catalog.current_setting('pul.hall_of_fame.request_id', true), '')::uuid;
    v_application_batch_id := nullif(pg_catalog.current_setting('pul.hall_of_fame.application_batch_id', true), '')::uuid;
    v_application_record_id := nullif(pg_catalog.current_setting('pul.hall_of_fame.application_record_id', true), '')::uuid;
  exception when invalid_text_representation then
    raise exception 'HOF_INVALID_MUTATION_CONTEXT' using errcode = '42501';
  end;
  v_operation := nullif(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '');

  if not private.hall_of_fame_mutation_context_is_valid()
     or auth.uid() is distinct from v_actor_user_id then
    raise exception 'HOF_MUTATION_RPC_REQUIRED' using errcode = '42501';
  end if;

  if tg_table_name = 'hall_of_fame_application_consents' then
    if v_operation not like 'hall_of_fame.application_consent.%'
       or new.application_batch_id <> v_application_batch_id
       or new.application_record_id <> v_application_record_id
       or (
         v_operation <> 'hall_of_fame.application_consent.reissue'
         and new.subject_user_id <> v_actor_user_id
       )
       or new.last_actor_user_id <> v_actor_user_id
       or new.last_request_id <> v_request_id
       or (tg_op = 'UPDATE' and (
         new.id <> old.id
         or new.application_batch_id <> old.application_batch_id
         or new.application_record_id <> old.application_record_id
         or new.subject_user_id <> old.subject_user_id
         or new.consent_purpose <> old.consent_purpose
         or new.created_at <> old.created_at
         or new.version <> old.version + 1
       ))
       or (tg_op = 'INSERT' and new.version <> 1) then
      raise exception 'HOF_APPLICATION_CONSENT_CONTEXT_MISMATCH' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_table_name = 'hall_of_fame_publication_consents' then
    if v_operation not like 'hall_of_fame.publication_consent.%'
       or new.application_record_id <> v_application_record_id
       or new.target_user_id <> v_actor_user_id
       or new.last_actor_user_id <> v_actor_user_id
       or new.last_request_id <> v_request_id
       or (tg_op = 'UPDATE' and (
         new.application_record_id <> old.application_record_id
         or new.target_user_id <> old.target_user_id
         or new.created_at <> old.created_at
         or new.version <> old.version + 1
       ))
       or (tg_op = 'INSERT' and new.version <> 1) then
      raise exception 'HOF_PUBLICATION_CONSENT_CONTEXT_MISMATCH' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_table_name = 'hall_of_fame_record_confirmations' then
    if v_operation not like 'hall_of_fame.confirmation.%'
       or new.application_record_id <> v_application_record_id
       or new.confirmer_user_id is null
       or new.external_contact_hmac is not null
       or new.external_contact_masked is not null
       or new.confirmation_role <> 'round_companion'
       or new.last_actor_user_id <> v_actor_user_id
       or new.last_request_id <> v_request_id
       or (tg_op = 'UPDATE' and (
         new.id <> old.id
         or new.application_record_id <> old.application_record_id
         or new.confirmer_user_id <> old.confirmer_user_id
         or new.confirmer_membership_id is distinct from old.confirmer_membership_id
         or new.external_contact_hmac is distinct from old.external_contact_hmac
         or new.external_contact_masked is distinct from old.external_contact_masked
         or new.confirmation_role <> old.confirmation_role
         or new.statement is distinct from old.statement
         or new.created_at <> old.created_at
         or new.version <> old.version + 1
       ))
       or (tg_op = 'INSERT' and (
         new.version <> 1
         or new.requester_user_id <> v_actor_user_id
         or new.status <> 'pending'
       )) then
      raise exception 'HOF_CONFIRMATION_CONTEXT_MISMATCH' using errcode = '42501';
    end if;

    if v_operation = 'hall_of_fame.confirmation.request' then
      if new.status <> 'pending' or new.requester_user_id <> v_actor_user_id then
        raise exception 'HOF_CONFIRMATION_CONTEXT_MISMATCH' using errcode = '42501';
      end if;
    elsif v_operation in (
      'hall_of_fame.confirmation.confirm',
      'hall_of_fame.confirmation.decline',
      'hall_of_fame.confirmation.withdraw'
    ) and new.confirmer_user_id <> v_actor_user_id then
      raise exception 'HOF_CONFIRMATION_CONTEXT_MISMATCH' using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'HOF_MUTATION_RPC_REQUIRED' using errcode = '42501';
end;
$$;

comment on function private.guard_hall_of_fame_consent_confirmation_current() is
  'Ledger-bound current-row guard for B-2B-1 consent and member confirmation mutations.';

revoke all on function private.guard_hall_of_fame_consent_confirmation_current()
  from public, anon, authenticated, service_role;

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

  begin
    v_actor_user_id := nullif(pg_catalog.current_setting('pul.hall_of_fame.actor_user_id', true), '')::uuid;
    v_request_id := nullif(pg_catalog.current_setting('pul.hall_of_fame.request_id', true), '')::uuid;
    v_application_batch_id := nullif(pg_catalog.current_setting('pul.hall_of_fame.application_batch_id', true), '')::uuid;
    v_application_record_id := nullif(pg_catalog.current_setting('pul.hall_of_fame.application_record_id', true), '')::uuid;
  exception when invalid_text_representation then
    raise exception 'HOF_INVALID_HISTORY_CONTEXT' using errcode = '42501';
  end;
  v_operation := nullif(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '');

  if not private.hall_of_fame_mutation_context_is_valid()
     or auth.uid() is distinct from v_actor_user_id then
    raise exception 'HOF_MUTATION_RPC_REQUIRED' using errcode = '42501';
  end if;

  if tg_table_name = 'hall_of_fame_application_history' then
    if new.actor_user_id <> v_actor_user_id
       or new.request_id <> v_request_id
       or new.application_batch_id <> v_application_batch_id then
      raise exception 'HOF_APPLICATION_HISTORY_CONTEXT_MISMATCH' using errcode = '42501';
    end if;

    if new.scope = 'batch' then
      if new.application_record_id is not null then
        raise exception 'HOF_APPLICATION_HISTORY_CONTEXT_MISMATCH' using errcode = '42501';
      end if;
      select batch.status, batch.version into v_current_status, v_current_version
      from public.hall_of_fame_application_batches as batch
      where batch.id = v_application_batch_id;
    elsif new.scope = 'record' then
      if new.application_record_id is null
         or (
           v_operation <> 'hall_of_fame.application_draft.withdraw'
           and new.application_record_id <> v_application_record_id
         ) then
        raise exception 'HOF_APPLICATION_HISTORY_CONTEXT_MISMATCH' using errcode = '42501';
      end if;
      select record.review_status, record.version into v_current_status, v_current_version
      from public.hall_of_fame_application_records as record
      where record.id = new.application_record_id
        and record.application_batch_id = v_application_batch_id;
    else
      raise exception 'HOF_APPLICATION_HISTORY_CONTEXT_MISMATCH' using errcode = '42501';
    end if;

    if not found
       or new.to_status <> v_current_status
       or new.version <> v_current_version then
      raise exception 'HOF_APPLICATION_HISTORY_CONTEXT_MISMATCH' using errcode = '42501';
    end if;

    if new.version = 1 then
      if new.from_status is not null then
        raise exception 'HOF_APPLICATION_HISTORY_CHAIN_MISMATCH' using errcode = '42501';
      end if;
    elsif not exists (
      select 1
      from public.hall_of_fame_application_history as previous_history
      where previous_history.scope = new.scope
        and previous_history.application_batch_id = new.application_batch_id
        and previous_history.application_record_id is not distinct from new.application_record_id
        and previous_history.version = new.version - 1
        and previous_history.to_status = new.from_status
    ) then
      raise exception 'HOF_APPLICATION_HISTORY_CHAIN_MISMATCH' using errcode = '42501';
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
        and new.action in ('hall_of_fame.round_snapshot_created', 'hall_of_fame.round_snapshot_updated')
        and new.from_status = 'draft'
        and new.to_status = 'draft'
      )
      or (
        v_operation = 'hall_of_fame.application_record.add'
        and new.action = 'hall_of_fame.application_record_added'
        and (
          (new.scope = 'record' and new.from_status is null and new.to_status = 'draft' and new.version = 1)
          or (new.scope = 'batch' and new.from_status = 'draft' and new.to_status = 'draft')
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
        and new.action = 'hall_of_fame.application_record_withdrawn'
        and (
          (new.scope = 'record' and new.from_status = 'draft' and new.to_status = 'withdrawn')
          or (new.scope = 'batch' and new.from_status = 'draft' and new.to_status = 'draft')
        )
      )
      or (
        v_operation = 'hall_of_fame.application_draft.withdraw'
        and (
          (new.scope = 'batch' and new.action = 'hall_of_fame.application_draft_withdrawn' and new.from_status = 'draft' and new.to_status = 'withdrawn')
          or (new.scope = 'record' and new.action = 'hall_of_fame.application_record_withdrawn_with_draft' and new.from_status = 'draft' and new.to_status = 'withdrawn')
        )
      )
      or (
        v_operation in (
          'hall_of_fame.application_consent.grant',
          'hall_of_fame.application_consent.decline',
          'hall_of_fame.application_consent.withdraw',
          'hall_of_fame.application_consent.reissue',
          'hall_of_fame.publication_consent.set',
          'hall_of_fame.publication_consent.withdraw',
          'hall_of_fame.confirmation.request',
          'hall_of_fame.confirmation.confirm',
          'hall_of_fame.confirmation.decline',
          'hall_of_fame.confirmation.cancel',
          'hall_of_fame.confirmation.withdraw'
        )
        and new.action = v_operation
        and new.from_status = 'draft'
        and new.to_status = 'draft'
      )
    ) then
      raise exception 'HOF_APPLICATION_HISTORY_CONTEXT_MISMATCH' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_table_name = 'hall_of_fame_application_consent_history' then
    if new.actor_user_id <> v_actor_user_id
       or new.request_id <> v_request_id
       or new.application_batch_id <> v_application_batch_id
       or new.application_record_id <> v_application_record_id
       or (
         v_operation <> 'hall_of_fame.application_consent.reissue'
         and new.subject_user_id <> v_actor_user_id
       )
       or v_operation <> (
         'hall_of_fame.application_consent.' ||
         case new.to_status when 'granted' then 'grant' when 'declined' then 'decline' when 'pending' then 'reissue' else 'withdraw' end
       ) then
      raise exception 'HOF_APPLICATION_CONSENT_HISTORY_CONTEXT_MISMATCH' using errcode = '42501';
    end if;
    perform 1
    from public.hall_of_fame_application_consents as consent
    where consent.id = new.application_consent_id
      and consent.application_record_id = new.application_record_id
      and consent.application_batch_id = new.application_batch_id
      and consent.subject_user_id = new.subject_user_id
      and consent.consent_purpose = new.consent_purpose
      and consent.policy_version = new.policy_version
      and consent.status = new.to_status
      and consent.version = new.version
      and consent.last_actor_user_id = new.actor_user_id
      and consent.last_request_id = new.request_id;
    if not found then
      raise exception 'HOF_APPLICATION_CONSENT_HISTORY_CONTEXT_MISMATCH' using errcode = '42501';
    end if;
    if new.version = 1 then
      if new.from_status is not null
         or exists (
           select 1 from public.hall_of_fame_application_consent_history as previous_history
           where previous_history.application_consent_id = new.application_consent_id
         ) then
        raise exception 'HOF_APPLICATION_CONSENT_HISTORY_CHAIN_MISMATCH' using errcode = '42501';
      end if;
    elsif not exists (
      select 1 from public.hall_of_fame_application_consent_history as previous_history
      where previous_history.application_consent_id = new.application_consent_id
        and previous_history.version = new.version - 1
        and previous_history.to_status = new.from_status
    ) then
      raise exception 'HOF_APPLICATION_CONSENT_HISTORY_CHAIN_MISMATCH' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_table_name = 'hall_of_fame_publication_consent_history' then
    if new.actor_user_id <> v_actor_user_id
       or new.request_id <> v_request_id
       or new.application_record_id <> v_application_record_id
       or new.target_user_id <> v_actor_user_id
       or v_operation not in (
         'hall_of_fame.publication_consent.set',
         'hall_of_fame.publication_consent.withdraw'
       ) then
      raise exception 'HOF_PUBLICATION_CONSENT_HISTORY_CONTEXT_MISMATCH' using errcode = '42501';
    end if;
    perform 1
    from public.hall_of_fame_publication_consents as consent
    where consent.application_record_id = new.application_record_id
      and consent.target_user_id = new.target_user_id
      and consent.status = new.to_status
      and consent.version = new.version
      and consent.policy_version is not distinct from new.policy_version
      and consent.display_name_consent = new.display_name_consent
      and consent.masked_display_name_consent = new.masked_display_name_consent
      and consent.full_display_name_consent = new.full_display_name_consent
      and consent.avatar_consent = new.avatar_consent
      and consent.club_name_consent = new.club_name_consent
      and consent.record_date_consent = new.record_date_consent
      and consent.course_detail_consent = new.course_detail_consent
      and consent.badge_consent = new.badge_consent
      and consent.last_actor_user_id = new.actor_user_id
      and consent.last_request_id = new.request_id;
    if not found then
      raise exception 'HOF_PUBLICATION_CONSENT_HISTORY_CONTEXT_MISMATCH' using errcode = '42501';
    end if;
    if new.version = 1 then
      if new.from_status is not null
         or exists (
           select 1 from public.hall_of_fame_publication_consent_history as previous_history
           where previous_history.application_record_id = new.application_record_id
         ) then
        raise exception 'HOF_PUBLICATION_CONSENT_HISTORY_CHAIN_MISMATCH' using errcode = '42501';
      end if;
    elsif not exists (
      select 1 from public.hall_of_fame_publication_consent_history as previous_history
      where previous_history.application_record_id = new.application_record_id
        and previous_history.version = new.version - 1
        and previous_history.to_status = new.from_status
    ) then
      raise exception 'HOF_PUBLICATION_CONSENT_HISTORY_CHAIN_MISMATCH' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_table_name = 'hall_of_fame_record_confirmation_history' then
    if new.actor_user_id <> v_actor_user_id
       or new.request_id <> v_request_id
       or new.application_record_id <> v_application_record_id
       or new.action <> v_operation then
      raise exception 'HOF_CONFIRMATION_HISTORY_CONTEXT_MISMATCH' using errcode = '42501';
    end if;
    perform 1
    from public.hall_of_fame_record_confirmations as confirmation
    where confirmation.id = new.confirmation_id
      and confirmation.application_record_id = new.application_record_id
      and confirmation.requester_user_id = new.requester_user_id
      and confirmation.confirmer_user_id = new.confirmer_user_id
      and confirmation.status = new.to_status
      and confirmation.version = new.version
      and confirmation.last_actor_user_id = new.actor_user_id
      and confirmation.last_request_id = new.request_id;
    if not found then
      raise exception 'HOF_CONFIRMATION_HISTORY_CONTEXT_MISMATCH' using errcode = '42501';
    end if;
    if new.version = 1 then
      if new.from_status is not null
         or exists (
           select 1 from public.hall_of_fame_record_confirmation_history as previous_history
           where previous_history.confirmation_id = new.confirmation_id
         ) then
        raise exception 'HOF_CONFIRMATION_HISTORY_CHAIN_MISMATCH' using errcode = '42501';
      end if;
    elsif not exists (
      select 1 from public.hall_of_fame_record_confirmation_history as previous_history
      where previous_history.confirmation_id = new.confirmation_id
        and previous_history.version = new.version - 1
        and previous_history.to_status = new.from_status
    ) then
      raise exception 'HOF_CONFIRMATION_HISTORY_CHAIN_MISMATCH' using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'HOF_MUTATION_RPC_REQUIRED' using errcode = '42501';
end;
$$;

comment on function private.reject_hall_of_fame_append_only_mutation() is
  'Append-only, ledger-bound guard extended for B-2B-1 consent, confirmation, and application version history.';

revoke all on function private.reject_hall_of_fame_append_only_mutation()
  from public, anon, authenticated, service_role;

create function private.normalize_hall_of_fame_policy_version(p_value text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_value is null then null
    else nullif(pg_catalog.btrim(p_value), '')
  end;
$$;

comment on function private.normalize_hall_of_fame_policy_version(text) is
  'Normalizes a bounded, non-sensitive policy document version identifier.';

revoke all on function private.normalize_hall_of_fame_policy_version(text)
  from public, anon, authenticated, service_role;

create function private.lock_active_hall_of_fame_actor(p_actor_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if p_actor_user_id is null then
    raise exception 'HOF_AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  select account.account_status into v_status
  from public.user_accounts as account
  where account.id = p_actor_user_id
  for share;

  if not found or v_status <> 'active' then
    raise exception 'HOF_ACTIVE_ACCOUNT_REQUIRED' using errcode = '42501';
  end if;
end;
$$;

comment on function private.lock_active_hall_of_fame_actor(uuid) is
  'Share-locks and validates the current active HOF mutation actor.';

revoke all on function private.lock_active_hall_of_fame_actor(uuid)
  from public, anon, authenticated, service_role;

create function private.bump_hall_of_fame_consent_confirmation_versions(
  p_actor_user_id uuid,
  p_actor_membership_id uuid,
  p_request_id uuid,
  p_operation text,
  p_application_batch_id uuid,
  p_application_record_id uuid,
  p_member_consent_status text default null
)
returns table (
  batch_version integer,
  record_version integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_batch_status text;
  v_record_status text;
  v_batch_version integer;
  v_record_version integer;
begin
  update public.hall_of_fame_application_batches as batch
  set version = batch.version + 1
  where batch.id = p_application_batch_id
    and batch.status = 'draft'
  returning batch.status, batch.version
    into v_batch_status, v_batch_version;
  if not found then
    raise exception 'HOF_APPLICATION_NOT_EDITABLE' using errcode = 'PT409';
  end if;

  update public.hall_of_fame_application_records as record
  set
    member_consent_status = coalesce(
      p_member_consent_status,
      record.member_consent_status
    ),
    version = record.version + 1
  where record.id = p_application_record_id
    and record.application_batch_id = p_application_batch_id
    and record.review_status = 'draft'
  returning record.review_status, record.version
    into v_record_status, v_record_version;
  if not found then
    raise exception 'HOF_APPLICATION_RECORD_NOT_EDITABLE' using errcode = 'PT409';
  end if;

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
      'batch',
      p_application_batch_id,
      null,
      v_batch_status,
      v_batch_status,
      v_batch_version,
      p_actor_user_id,
      p_actor_membership_id,
      p_operation,
      p_request_id
    ),
    (
      'record',
      p_application_batch_id,
      p_application_record_id,
      v_record_status,
      v_record_status,
      v_record_version,
      p_actor_user_id,
      p_actor_membership_id,
      p_operation,
      p_request_id
    );

  return query select v_batch_version, v_record_version;
end;
$$;

comment on function private.bump_hall_of_fame_consent_confirmation_versions(
  uuid, uuid, uuid, text, uuid, uuid, text
) is
  'Atomically advances draft batch and record versions and appends their ledger-bound history for one B-2B-1 change.';

revoke all on function private.bump_hall_of_fame_consent_confirmation_versions(
  uuid, uuid, uuid, text, uuid, uuid, text
) from public, anon, authenticated, service_role;

create function private.audit_and_complete_hall_of_fame_consent_confirmation(
  p_actor_user_id uuid,
  p_request_id uuid,
  p_operation text,
  p_application_batch_id uuid,
  p_application_record_id uuid,
  p_target_type text,
  p_target_id uuid,
  p_before_status text,
  p_after_status text,
  p_batch_version integer,
  p_record_version integer,
  p_entity_version integer,
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
  v_club_id uuid;
begin
  select coalesce(batch.nominating_club_id, batch.vacancy_context_club_id)
    into v_club_id
  from public.hall_of_fame_application_batches as batch
  where batch.id = p_application_batch_id;

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
    p_actor_user_id,
    'user',
    p_operation,
    p_target_type,
    p_target_id::text,
    case when v_club_id is null then null else v_club_id::text end,
    case
      when p_before_status is null then null
      else pg_catalog.jsonb_build_object('status', p_before_status)
    end,
    pg_catalog.jsonb_build_object(
      'status', p_after_status,
      'entity_version', p_entity_version,
      'record_version', p_record_version,
      'batch_version', p_batch_version
    ),
    pg_catalog.jsonb_build_object(
      'application_batch_id', p_application_batch_id,
      'application_record_id', p_application_record_id
    ),
    p_request_id,
    'success'
  );

  perform private.complete_hall_of_fame_request(
    p_actor_user_id,
    p_request_id,
    p_operation,
    p_application_batch_id,
    p_application_record_id,
    p_payload_fingerprint,
    p_result_payload
  );
end;
$$;

comment on function private.audit_and_complete_hall_of_fame_consent_confirmation(
  uuid, uuid, text, uuid, uuid, text, uuid, text, text,
  integer, integer, integer, bytea, jsonb
) is
  'Writes a privacy-minimized audit summary and completes exactly one B-2B-1 request ledger row.';

revoke all on function private.audit_and_complete_hall_of_fame_consent_confirmation(
  uuid, uuid, text, uuid, uuid, text, uuid, text, text,
  integer, integer, integer, bytea, jsonb
) from public, anon, authenticated, service_role;

create function public.set_hall_of_fame_application_consent(
  p_application_record_id uuid,
  p_consent_purpose text,
  p_decision text,
  p_policy_version text,
  p_expected_batch_version integer,
  p_request_id uuid
)
returns table (
  application_batch_id uuid,
  application_record_id uuid,
  consent_id uuid,
  consent_purpose text,
  status text,
  consent_version integer,
  batch_version integer,
  record_version integer,
  expires_at timestamptz,
  changed boolean,
  replayed boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_batch public.hall_of_fame_application_batches%rowtype;
  v_record public.hall_of_fame_application_records%rowtype;
  v_current public.hall_of_fame_application_consents%rowtype;
  v_policy_version text;
  v_operation text;
  v_desired_status text;
  v_payload_fingerprint bytea;
  v_claim record;
  v_versions record;
  v_result jsonb;
  v_new_consent_status text;
  v_required_count integer;
  v_granted_count integer;
  v_declined_count integer;
  v_withdrawn_count integer;
  v_requested_at timestamptz;
  v_expires_at timestamptz;
begin
  perform private.lock_active_hall_of_fame_actor(v_actor_user_id);

  v_policy_version := private.normalize_hall_of_fame_policy_version(p_policy_version);
  if p_application_record_id is null
     or p_request_id is null
     or p_expected_batch_version is null
     or p_expected_batch_version < 1
     or p_consent_purpose not in (
       'application_processing',
       'evidence_review',
       'nomination_acceptance'
     )
     or p_decision not in ('grant', 'decline', 'withdraw')
     or v_policy_version is null
     or v_policy_version !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$' then
    raise exception 'HOF_INVALID_CONSENT_REQUEST' using errcode = '22023';
  end if;

  v_operation := 'hall_of_fame.application_consent.' || p_decision;
  v_desired_status := case p_decision
    when 'grant' then 'granted'
    when 'decline' then 'declined'
    else 'withdrawn'
  end;
  perform private.lock_hall_of_fame_mutation_request(
    v_actor_user_id,
    p_request_id
  );


  select record.application_batch_id
    into v_record.application_batch_id
  from public.hall_of_fame_application_records as record
  where record.id = p_application_record_id;
  if not found then
    raise exception 'HOF_APPLICATION_RECORD_NOT_FOUND';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_record.application_batch_id::text, 8608)
  );

  v_payload_fingerprint := extensions.digest(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'application_record_id', p_application_record_id,
        'consent_purpose', p_consent_purpose,
        'decision', p_decision,
        'policy_version', v_policy_version,
        'expected_batch_version', p_expected_batch_version
      )::text,
      'UTF8'
    ),
    'sha256'
  );

  select * into v_claim
  from private.hall_of_fame_claim_request(
    v_actor_user_id,
    p_request_id,
    v_operation,
    v_record.application_batch_id,
    p_application_record_id,
    v_actor_user_id,
    v_payload_fingerprint
  );

  if v_claim.replayed then
    return query select
      (v_claim.result_payload ->> 'application_batch_id')::uuid,
      (v_claim.result_payload ->> 'application_record_id')::uuid,
      (v_claim.result_payload ->> 'consent_id')::uuid,
      v_claim.result_payload ->> 'consent_purpose',
      v_claim.result_payload ->> 'status',
      (v_claim.result_payload ->> 'consent_version')::integer,
      (v_claim.result_payload ->> 'batch_version')::integer,
      (v_claim.result_payload ->> 'record_version')::integer,
      (v_claim.result_payload ->> 'expires_at')::timestamptz,
      (v_claim.result_payload ->> 'changed')::boolean,
      true;
    return;
  end if;

  perform private.lock_hall_of_fame_authorization_boundary();

  select batch.* into v_batch
  from public.hall_of_fame_application_batches as batch
  where batch.id = v_record.application_batch_id
  for update;
  if not found or v_batch.status <> 'draft' then
    raise exception 'HOF_APPLICATION_NOT_EDITABLE' using errcode = 'PT409';
  end if;
  if v_batch.version <> p_expected_batch_version then
    raise exception 'HOF_STALE_APPLICATION_VERSION' using errcode = 'PT409';
  end if;

  select record.* into v_record
  from public.hall_of_fame_application_records as record
  where record.id = p_application_record_id
    and record.application_batch_id = v_batch.id
  for update;
  if not found or v_record.review_status <> 'draft' then
    raise exception 'HOF_APPLICATION_RECORD_NOT_EDITABLE' using errcode = 'PT409';
  end if;
  if v_record.target_user_id <> v_actor_user_id then
    raise exception 'HOF_PERMISSION_DENIED' using errcode = '42501';
  end if;

  perform 1
  from public.user_accounts as account
  where account.id = v_record.target_user_id
    and account.account_status = 'active'
  for share;
  if not found then
    raise exception 'HOF_ACTIVE_ACCOUNT_REQUIRED' using errcode = '42501';
  end if;

  if v_batch.application_type = 'club_nomination' then
    if p_decision <> 'withdraw' then
      perform 1
      from public.club_memberships as membership
      where membership.id = v_record.target_membership_id
        and membership.user_id = v_actor_user_id
        and membership.club_id = v_batch.nominating_club_id
        and membership.membership_status = 'active'
      for share;
      if not found then
        raise exception 'HOF_NOMINATION_TARGET_NOT_ELIGIBLE' using errcode = '42501';
      end if;
    end if;
  elsif p_consent_purpose = 'nomination_acceptance' then
    raise exception 'HOF_CONSENT_PURPOSE_NOT_ALLOWED' using errcode = '22023';
  end if;

  if p_consent_purpose = 'nomination_acceptance' then
    v_requested_at := v_record.created_at;
    v_expires_at := v_record.created_at + interval '14 days';
    if p_decision <> 'withdraw' and v_expires_at <= pg_catalog.now() then
      raise exception 'HOF_NOMINATION_ACCEPTANCE_EXPIRED' using errcode = 'PT409';
    end if;
  end if;

  select consent.* into v_current
  from public.hall_of_fame_application_consents as consent
  where consent.application_record_id = p_application_record_id
    and consent.consent_purpose = p_consent_purpose
  for update;

  if found then
    if v_current.subject_user_id <> v_actor_user_id
       or v_current.application_batch_id <> v_batch.id then
      raise exception 'HOF_APPLICATION_CONSENT_CONTEXT_MISMATCH' using errcode = '42501';
    end if;
    if v_current.status = v_desired_status
       and v_current.policy_version = v_policy_version
       and p_decision = 'grant' then
      v_result := pg_catalog.jsonb_build_object(
        'application_batch_id', v_batch.id,
        'application_record_id', v_record.id,
        'consent_id', v_current.id,
        'consent_purpose', v_current.consent_purpose,
        'status', v_current.status,
        'consent_version', v_current.version,
        'batch_version', v_batch.version,
        'record_version', v_record.version,
        'expires_at', v_current.expires_at,
        'changed', false
      );
      perform private.complete_hall_of_fame_request(
        v_actor_user_id, p_request_id, v_operation, v_batch.id,
        v_record.id, v_payload_fingerprint, v_result
      );
      return query select
        v_batch.id, v_record.id, v_current.id, v_current.consent_purpose,
        v_current.status, v_current.version, v_batch.version,
        v_record.version, v_current.expires_at, false, false;
      return;
    end if;
    if p_decision = 'grant' and v_current.status <> 'pending' then
      if v_current.status in ('declined', 'withdrawn') then
        raise exception 'HOF_CONSENT_REISSUE_REQUIRED' using errcode = 'PT409';
      end if;
      raise exception 'HOF_INVALID_CONSENT_TRANSITION' using errcode = 'PT409';
    end if;
    if p_decision = 'decline' and v_current.status <> 'pending' then
      raise exception 'HOF_INVALID_CONSENT_TRANSITION' using errcode = 'PT409';
    end if;
    if p_decision = 'withdraw' and v_current.status <> 'granted' then
      raise exception 'HOF_CONSENT_WITHDRAWAL_NOT_ALLOWED' using errcode = 'PT409';
    end if;

    update public.hall_of_fame_application_consents as consent
    set
      status = v_desired_status,
      policy_version = v_policy_version,
      granted_at = case
        when p_decision = 'grant' then pg_catalog.now()
        when p_decision = 'withdraw' then consent.granted_at
        else null
      end,
      declined_at = case when p_decision = 'decline' then pg_catalog.now() else null end,
      withdrawn_at = case when p_decision = 'withdraw' then pg_catalog.now() else null end,
      last_actor_user_id = v_actor_user_id,
      last_request_id = p_request_id,
      version = consent.version + 1
    where consent.id = v_current.id
    returning consent.* into v_current;
  else
    if p_decision = 'withdraw' then
      raise exception 'HOF_CONSENT_WITHDRAWAL_NOT_ALLOWED' using errcode = 'PT409';
    end if;
    insert into public.hall_of_fame_application_consents (
      application_record_id,
      application_batch_id,
      subject_user_id,
      consent_purpose,
      status,
      policy_version,
      requested_at,
      expires_at,
      granted_at,
      declined_at,
      last_actor_user_id,
      last_request_id
    ) values (
      v_record.id,
      v_batch.id,
      v_actor_user_id,
      p_consent_purpose,
      v_desired_status,
      v_policy_version,
      v_requested_at,
      v_expires_at,
      case when p_decision = 'grant' then pg_catalog.now() else null end,
      case when p_decision = 'decline' then pg_catalog.now() else null end,
      v_actor_user_id,
      p_request_id
    )
    returning * into v_current;
  end if;

  insert into public.hall_of_fame_application_consent_history (
    application_consent_id,
    application_record_id,
    application_batch_id,
    subject_user_id,
    consent_purpose,
    policy_version,
    from_status,
    to_status,
    version,
    actor_user_id,
    request_id,
    requested_at,
    expires_at
  ) values (
    v_current.id,
    v_record.id,
    v_batch.id,
    v_actor_user_id,
    p_consent_purpose,
    v_policy_version,
    case when v_current.version = 1 then null else (
      select history.to_status
      from public.hall_of_fame_application_consent_history as history
      where history.application_consent_id = v_current.id
        and history.version = v_current.version - 1
    ) end,
    v_desired_status,
    v_current.version,
    v_actor_user_id,
    p_request_id,
    v_current.requested_at,
    v_current.expires_at
  );

  v_required_count := case when v_batch.application_type = 'club_nomination' then 3 else 2 end;
  select
    count(*) filter (where consent.status = 'granted' and (
      consent.consent_purpose <> 'nomination_acceptance'
      or consent.expires_at > pg_catalog.now()
    )),
    count(*) filter (where consent.status = 'declined'),
    count(*) filter (where consent.status = 'withdrawn')
  into v_granted_count, v_declined_count, v_withdrawn_count
  from public.hall_of_fame_application_consents as consent
  where consent.application_record_id = v_record.id
    and consent.consent_purpose in (
      'application_processing',
      'evidence_review',
      case when v_batch.application_type = 'club_nomination'
        then 'nomination_acceptance'
        else 'application_processing'
      end
    );

  v_new_consent_status := case
    when v_declined_count > 0 then 'declined'
    when v_withdrawn_count > 0 then 'withdrawn'
    when v_granted_count = v_required_count then 'granted'
    else 'pending'
  end;

  select * into v_versions
  from private.bump_hall_of_fame_consent_confirmation_versions(
    v_actor_user_id,
    null,
    p_request_id,
    v_operation,
    v_batch.id,
    v_record.id,
    v_new_consent_status
  );

  v_result := pg_catalog.jsonb_build_object(
    'application_batch_id', v_batch.id,
    'application_record_id', v_record.id,
    'consent_id', v_current.id,
    'consent_purpose', v_current.consent_purpose,
    'status', v_current.status,
    'consent_version', v_current.version,
    'batch_version', v_versions.batch_version,
    'record_version', v_versions.record_version,
    'expires_at', v_current.expires_at,
    'changed', true
  );

  perform private.audit_and_complete_hall_of_fame_consent_confirmation(
    v_actor_user_id, p_request_id, v_operation, v_batch.id, v_record.id,
    'hall_of_fame_application_consent', v_current.id,
    case when v_current.version = 1 then null else (
      select history.from_status
      from public.hall_of_fame_application_consent_history as history
      where history.application_consent_id = v_current.id
        and history.version = v_current.version
    ) end,
    v_current.status,
    v_versions.batch_version,
    v_versions.record_version,
    v_current.version,
    v_payload_fingerprint,
    v_result
  );

  return query select
    v_batch.id, v_record.id, v_current.id, v_current.consent_purpose,
    v_current.status, v_current.version, v_versions.batch_version,
    v_versions.record_version, v_current.expires_at, true, false;
end;
$$;

comment on function public.set_hall_of_fame_application_consent(
  uuid, text, text, text, integer, uuid
) is
  'Target-only application-processing, evidence-review, and nomination-acceptance decision with 14-day nomination expiry.';

revoke all on function public.set_hall_of_fame_application_consent(
  uuid, text, text, text, integer, uuid
) from public, anon, service_role;
grant execute on function public.set_hall_of_fame_application_consent(
  uuid, text, text, text, integer, uuid
) to authenticated;

create function public.reissue_hall_of_fame_nomination_consent_request(
  p_application_record_id uuid,
  p_expected_batch_version integer,
  p_request_id uuid
)
returns table (
  application_batch_id uuid,
  application_record_id uuid,
  consent_id uuid,
  status text,
  consent_version integer,
  batch_version integer,
  record_version integer,
  requested_at timestamptz,
  expires_at timestamptz,
  replayed boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_batch public.hall_of_fame_application_batches%rowtype;
  v_record public.hall_of_fame_application_records%rowtype;
  v_consent public.hall_of_fame_application_consents%rowtype;
  v_actor_membership_id uuid;
  v_operation text := 'hall_of_fame.application_consent.reissue';
  v_payload_fingerprint bytea;
  v_claim record;
  v_versions record;
  v_result jsonb;
  v_from_status text;
  v_effective_status text;
  v_requested_at timestamptz := pg_catalog.now();
begin
  perform private.lock_active_hall_of_fame_actor(v_actor_user_id);
  if p_application_record_id is null
     or p_request_id is null
     or p_expected_batch_version is null
     or p_expected_batch_version < 1 then
    raise exception 'HOF_INVALID_CONSENT_REISSUE_REQUEST' using errcode = '22023';
  end if;

  perform private.lock_hall_of_fame_mutation_request(
    v_actor_user_id,
    p_request_id
  );

  select record.application_batch_id into v_record.application_batch_id
  from public.hall_of_fame_application_records as record
  where record.id = p_application_record_id;
  if not found then
    raise exception 'HOF_APPLICATION_RECORD_NOT_FOUND';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_record.application_batch_id::text, 8608)
  );

  v_payload_fingerprint := extensions.digest(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'application_record_id', p_application_record_id,
        'expected_batch_version', p_expected_batch_version
      )::text,
      'UTF8'
    ),
    'sha256'
  );

  select * into v_claim
  from private.hall_of_fame_claim_request(
    v_actor_user_id,
    p_request_id,
    v_operation,
    v_record.application_batch_id,
    p_application_record_id,
    null,
    v_payload_fingerprint
  );
  if v_claim.replayed then
    return query select
      (v_claim.result_payload ->> 'application_batch_id')::uuid,
      (v_claim.result_payload ->> 'application_record_id')::uuid,
      (v_claim.result_payload ->> 'consent_id')::uuid,
      v_claim.result_payload ->> 'status',
      (v_claim.result_payload ->> 'consent_version')::integer,
      (v_claim.result_payload ->> 'batch_version')::integer,
      (v_claim.result_payload ->> 'record_version')::integer,
      (v_claim.result_payload ->> 'requested_at')::timestamptz,
      (v_claim.result_payload ->> 'expires_at')::timestamptz,
      true;
    return;
  end if;

  perform private.lock_hall_of_fame_authorization_boundary();
  select batch.* into v_batch
  from public.hall_of_fame_application_batches as batch
  where batch.id = v_record.application_batch_id
  for update;
  if not found or v_batch.status <> 'draft' then
    raise exception 'HOF_APPLICATION_NOT_EDITABLE' using errcode = 'PT409';
  end if;
  if v_batch.version <> p_expected_batch_version then
    raise exception 'HOF_STALE_APPLICATION_VERSION' using errcode = 'PT409';
  end if;
  if v_batch.application_type <> 'club_nomination'
     or v_batch.created_by_user_id <> v_actor_user_id then
    raise exception 'HOF_PERMISSION_DENIED' using errcode = '42501';
  end if;

  v_actor_membership_id := private.lock_and_authorize_hall_of_fame_batch_edit(
    v_actor_user_id,
    v_batch.id
  );

  select record.* into v_record
  from public.hall_of_fame_application_records as record
  where record.id = p_application_record_id
    and record.application_batch_id = v_batch.id
  for update;
  if not found or v_record.review_status <> 'draft' then
    raise exception 'HOF_APPLICATION_RECORD_NOT_EDITABLE' using errcode = 'PT409';
  end if;
  if v_record.target_user_id = v_actor_user_id then
    raise exception 'HOF_PERMISSION_DENIED' using errcode = '42501';
  end if;

  perform 1
  from public.user_accounts as account
  where account.id = v_record.target_user_id
    and account.account_status = 'active'
  for share;
  if not found then
    raise exception 'HOF_ACTIVE_ACCOUNT_REQUIRED' using errcode = '42501';
  end if;

  perform 1
  from public.club_memberships as membership
  where membership.id = v_record.target_membership_id
    and membership.user_id = v_record.target_user_id
    and membership.club_id = v_batch.nominating_club_id
    and membership.membership_status = 'active'
  for share;
  if not found then
    raise exception 'HOF_NOMINATION_TARGET_NOT_ELIGIBLE' using errcode = '42501';
  end if;

  select consent.* into v_consent
  from public.hall_of_fame_application_consents as consent
  where consent.application_record_id = v_record.id
    and consent.consent_purpose = 'nomination_acceptance'
  for update;
  if not found then
    raise exception 'HOF_CONSENT_REQUEST_NOT_REISSUABLE' using errcode = 'PT409';
  end if;

  v_from_status := v_consent.status;
  v_effective_status := case
    when v_consent.status = 'pending'
     and v_consent.expires_at <= pg_catalog.now() then 'expired'
    else v_consent.status
  end;
  if v_effective_status = 'pending' then
    raise exception 'HOF_CONSENT_REQUEST_ALREADY_ACTIVE' using errcode = 'PT409';
  end if;
  if v_effective_status not in ('declined', 'withdrawn', 'expired') then
    raise exception 'HOF_CONSENT_REQUEST_NOT_REISSUABLE' using errcode = 'PT409';
  end if;

  update public.hall_of_fame_application_consents as consent
  set
    status = 'pending',
    requested_at = v_requested_at,
    expires_at = v_requested_at + interval '14 days',
    granted_at = null,
    declined_at = null,
    withdrawn_at = null,
    last_actor_user_id = v_actor_user_id,
    last_request_id = p_request_id,
    version = consent.version + 1
  where consent.id = v_consent.id
  returning consent.* into v_consent;

  insert into public.hall_of_fame_application_consent_history (
    application_consent_id,
    application_record_id,
    application_batch_id,
    subject_user_id,
    consent_purpose,
    policy_version,
    from_status,
    to_status,
    version,
    actor_user_id,
    request_id,
    requested_at,
    expires_at
  ) values (
    v_consent.id,
    v_record.id,
    v_batch.id,
    v_record.target_user_id,
    'nomination_acceptance',
    v_consent.policy_version,
    v_from_status,
    'pending',
    v_consent.version,
    v_actor_user_id,
    p_request_id,
    v_consent.requested_at,
    v_consent.expires_at
  );

  select * into v_versions
  from private.bump_hall_of_fame_consent_confirmation_versions(
    v_actor_user_id,
    v_actor_membership_id,
    p_request_id,
    v_operation,
    v_batch.id,
    v_record.id,
    null
  );

  v_result := pg_catalog.jsonb_build_object(
    'application_batch_id', v_batch.id,
    'application_record_id', v_record.id,
    'consent_id', v_consent.id,
    'status', v_consent.status,
    'consent_version', v_consent.version,
    'batch_version', v_versions.batch_version,
    'record_version', v_versions.record_version,
    'requested_at', v_consent.requested_at,
    'expires_at', v_consent.expires_at
  );
  perform private.audit_and_complete_hall_of_fame_consent_confirmation(
    v_actor_user_id,
    p_request_id,
    v_operation,
    v_batch.id,
    v_record.id,
    'hall_of_fame_application_consent',
    v_consent.id,
    v_effective_status,
    v_consent.status,
    v_versions.batch_version,
    v_versions.record_version,
    v_consent.version,
    v_payload_fingerprint,
    v_result
  );

  return query select
    v_batch.id,
    v_record.id,
    v_consent.id,
    v_consent.status,
    v_consent.version,
    v_versions.batch_version,
    v_versions.record_version,
    v_consent.requested_at,
    v_consent.expires_at,
    false;
end;
$$;

comment on function public.reissue_hall_of_fame_nomination_consent_request(
  uuid, integer, uuid
) is
  'The active nominating club creator reissues an expired, declined, or withdrawn target-owned nomination acceptance request.';

revoke all on function public.reissue_hall_of_fame_nomination_consent_request(
  uuid, integer, uuid
) from public, anon, service_role;
grant execute on function public.reissue_hall_of_fame_nomination_consent_request(
  uuid, integer, uuid
) to authenticated;
create function public.set_hall_of_fame_publication_consent(
  p_application_record_id uuid,
  p_decision text,
  p_policy_version text,
  p_publish_masked_display_name boolean,
  p_publish_full_display_name boolean,
  p_publish_record_date boolean,
  p_publish_course_details boolean,
  p_publish_avatar boolean,
  p_publish_club_name boolean,
  p_publish_badge boolean,
  p_expected_batch_version integer,
  p_request_id uuid
)
returns table (
  application_batch_id uuid,
  application_record_id uuid,
  status text,
  consent_version integer,
  batch_version integer,
  record_version integer,
  changed boolean,
  replayed boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_batch public.hall_of_fame_application_batches%rowtype;
  v_record public.hall_of_fame_application_records%rowtype;
  v_current public.hall_of_fame_publication_consents%rowtype;
  v_policy_version text;
  v_operation text;
  v_payload_fingerprint bytea;
  v_claim record;
  v_versions record;
  v_result jsonb;
  v_before_status text;
begin
  perform private.lock_active_hall_of_fame_actor(v_actor_user_id);
  v_policy_version := private.normalize_hall_of_fame_policy_version(p_policy_version);

  if p_application_record_id is null
     or p_request_id is null
     or p_expected_batch_version is null
     or p_expected_batch_version < 1
     or p_decision not in ('set', 'withdraw')
     or v_policy_version is null
     or v_policy_version !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'
     or p_publish_masked_display_name is null
     or p_publish_full_display_name is null
     or p_publish_record_date is null
     or p_publish_course_details is null
     or p_publish_avatar is null
     or p_publish_club_name is null
     or p_publish_badge is null then
    raise exception 'HOF_INVALID_PUBLICATION_CONSENT_REQUEST' using errcode = '22023';
  end if;

  if p_decision = 'set' and (
    not p_publish_masked_display_name
    or not p_publish_record_date
    or not p_publish_course_details
    or (p_publish_full_display_name and not p_publish_masked_display_name)
  ) then
    raise exception 'HOF_REQUIRED_PUBLICATION_SCOPE_MISSING' using errcode = '22023';
  end if;
  if p_decision = 'withdraw' and (
    p_publish_masked_display_name
    or p_publish_full_display_name
    or p_publish_record_date
    or p_publish_course_details
    or p_publish_avatar
    or p_publish_club_name
    or p_publish_badge
  ) then
    raise exception 'HOF_WITHDRAWN_PUBLICATION_SCOPE_MUST_BE_EMPTY' using errcode = '22023';
  end if;
  perform private.lock_hall_of_fame_mutation_request(
    v_actor_user_id,
    p_request_id
  );


  v_operation := 'hall_of_fame.publication_consent.' || p_decision;
  select record.application_batch_id into v_record.application_batch_id
  from public.hall_of_fame_application_records as record
  where record.id = p_application_record_id;
  if not found then
    raise exception 'HOF_APPLICATION_RECORD_NOT_FOUND';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_record.application_batch_id::text, 8608)
  );

  v_payload_fingerprint := extensions.digest(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'application_record_id', p_application_record_id,
        'decision', p_decision,
        'policy_version', v_policy_version,
        'masked_display_name', p_publish_masked_display_name,
        'full_display_name', p_publish_full_display_name,
        'record_date', p_publish_record_date,
        'course_details', p_publish_course_details,
        'avatar', p_publish_avatar,
        'club_name', p_publish_club_name,
        'badge', p_publish_badge,
        'expected_batch_version', p_expected_batch_version
      )::text,
      'UTF8'
    ),
    'sha256'
  );

  select * into v_claim
  from private.hall_of_fame_claim_request(
    v_actor_user_id, p_request_id, v_operation,
    v_record.application_batch_id, p_application_record_id,
    v_actor_user_id, v_payload_fingerprint
  );
  if v_claim.replayed then
    return query select
      (v_claim.result_payload ->> 'application_batch_id')::uuid,
      (v_claim.result_payload ->> 'application_record_id')::uuid,
      v_claim.result_payload ->> 'status',
      (v_claim.result_payload ->> 'consent_version')::integer,
      (v_claim.result_payload ->> 'batch_version')::integer,
      (v_claim.result_payload ->> 'record_version')::integer,
      (v_claim.result_payload ->> 'changed')::boolean,
      true;
    return;
  end if;

  perform private.lock_hall_of_fame_authorization_boundary();
  select batch.* into v_batch
  from public.hall_of_fame_application_batches as batch
  where batch.id = v_record.application_batch_id
  for update;
  if not found or v_batch.status <> 'draft' then
    raise exception 'HOF_APPLICATION_NOT_EDITABLE' using errcode = 'PT409';
  end if;
  if v_batch.version <> p_expected_batch_version then
    raise exception 'HOF_STALE_APPLICATION_VERSION' using errcode = 'PT409';
  end if;

  select record.* into v_record
  from public.hall_of_fame_application_records as record
  where record.id = p_application_record_id
    and record.application_batch_id = v_batch.id
  for update;
  if not found or v_record.review_status <> 'draft' then
    raise exception 'HOF_APPLICATION_RECORD_NOT_EDITABLE' using errcode = 'PT409';
  end if;
  if v_record.target_user_id <> v_actor_user_id then
    raise exception 'HOF_PERMISSION_DENIED' using errcode = '42501';
  end if;

  select consent.* into v_current
  from public.hall_of_fame_publication_consents as consent
  where consent.application_record_id = v_record.id
  for update;
  if found then
    v_before_status := v_current.status;
    if v_current.status = (case when p_decision = 'set' then 'granted' else 'withdrawn' end)
       and v_current.policy_version = v_policy_version
       and v_current.masked_display_name_consent = p_publish_masked_display_name
       and v_current.full_display_name_consent = p_publish_full_display_name
       and v_current.record_date_consent = p_publish_record_date
       and v_current.course_detail_consent = p_publish_course_details
       and v_current.avatar_consent = p_publish_avatar
       and v_current.club_name_consent = p_publish_club_name
       and v_current.badge_consent = p_publish_badge then
      v_result := pg_catalog.jsonb_build_object(
        'application_batch_id', v_batch.id,
        'application_record_id', v_record.id,
        'status', v_current.status,
        'consent_version', v_current.version,
        'batch_version', v_batch.version,
        'record_version', v_record.version,
        'changed', false
      );
      perform private.complete_hall_of_fame_request(
        v_actor_user_id, p_request_id, v_operation, v_batch.id,
        v_record.id, v_payload_fingerprint, v_result
      );
      return query select v_batch.id, v_record.id, v_current.status,
        v_current.version, v_batch.version, v_record.version, false, false;
      return;
    end if;
    if p_decision = 'withdraw' and v_current.status <> 'granted' then
      raise exception 'HOF_PUBLICATION_WITHDRAWAL_NOT_ALLOWED' using errcode = 'PT409';
    end if;

    update public.hall_of_fame_publication_consents as consent
    set
      status = case when p_decision = 'set' then 'granted' else 'withdrawn' end,
      display_name_consent = p_publish_masked_display_name or p_publish_full_display_name,
      masked_display_name_consent = p_publish_masked_display_name,
      full_display_name_consent = p_publish_full_display_name,
      record_date_consent = p_publish_record_date,
      course_detail_consent = p_publish_course_details,
      avatar_consent = p_publish_avatar,
      club_name_consent = p_publish_club_name,
      badge_consent = p_publish_badge,
      policy_version = v_policy_version,
      consented_at = case when p_decision = 'set' then pg_catalog.now() else consent.consented_at end,
      withdrawn_at = case when p_decision = 'withdraw' then pg_catalog.now() else null end,
      last_actor_user_id = v_actor_user_id,
      last_request_id = p_request_id,
      version = consent.version + 1
    where consent.application_record_id = v_record.id
    returning consent.* into v_current;
  else
    if p_decision = 'withdraw' then
      raise exception 'HOF_PUBLICATION_WITHDRAWAL_NOT_ALLOWED' using errcode = 'PT409';
    end if;
    v_before_status := null;
    insert into public.hall_of_fame_publication_consents (
      application_record_id,
      target_user_id,
      status,
      display_name_consent,
      masked_display_name_consent,
      full_display_name_consent,
      avatar_consent,
      club_name_consent,
      record_date_consent,
      course_detail_consent,
      badge_consent,
      policy_version,
      consented_at,
      last_actor_user_id,
      last_request_id
    ) values (
      v_record.id,
      v_actor_user_id,
      'granted',
      p_publish_masked_display_name or p_publish_full_display_name,
      p_publish_masked_display_name,
      p_publish_full_display_name,
      p_publish_avatar,
      p_publish_club_name,
      p_publish_record_date,
      p_publish_course_details,
      p_publish_badge,
      v_policy_version,
      pg_catalog.now(),
      v_actor_user_id,
      p_request_id
    ) returning * into v_current;
  end if;

  insert into public.hall_of_fame_publication_consent_history (
    application_record_id,
    target_user_id,
    display_name_consent,
    masked_display_name_consent,
    full_display_name_consent,
    avatar_consent,
    club_name_consent,
    record_date_consent,
    course_detail_consent,
    badge_consent,
    policy_version,
    from_status,
    to_status,
    version,
    actor_user_id,
    request_id
  ) values (
    v_record.id,
    v_actor_user_id,
    v_current.display_name_consent,
    v_current.masked_display_name_consent,
    v_current.full_display_name_consent,
    v_current.avatar_consent,
    v_current.club_name_consent,
    v_current.record_date_consent,
    v_current.course_detail_consent,
    v_current.badge_consent,
    v_current.policy_version,
    v_before_status,
    v_current.status,
    v_current.version,
    v_actor_user_id,
    p_request_id
  );

  select * into v_versions
  from private.bump_hall_of_fame_consent_confirmation_versions(
    v_actor_user_id, null, p_request_id, v_operation,
    v_batch.id, v_record.id, null
  );

  v_result := pg_catalog.jsonb_build_object(
    'application_batch_id', v_batch.id,
    'application_record_id', v_record.id,
    'status', v_current.status,
    'consent_version', v_current.version,
    'batch_version', v_versions.batch_version,
    'record_version', v_versions.record_version,
    'changed', true
  );
  perform private.audit_and_complete_hall_of_fame_consent_confirmation(
    v_actor_user_id, p_request_id, v_operation, v_batch.id, v_record.id,
    'hall_of_fame_publication_consent', v_record.id,
    v_before_status, v_current.status,
    v_versions.batch_version, v_versions.record_version, v_current.version,
    v_payload_fingerprint, v_result
  );

  return query select v_batch.id, v_record.id, v_current.status,
    v_current.version, v_versions.batch_version, v_versions.record_version,
    true, false;
end;
$$;

comment on function public.set_hall_of_fame_publication_consent(
  uuid, text, text, boolean, boolean, boolean, boolean, boolean,
  boolean, boolean, integer, uuid
) is
  'Target-only publication scope grant or withdrawal with masked-name default, optional full name, avatar, club, and badge.';

revoke all on function public.set_hall_of_fame_publication_consent(
  uuid, text, text, boolean, boolean, boolean, boolean, boolean,
  boolean, boolean, integer, uuid
) from public, anon, service_role;
grant execute on function public.set_hall_of_fame_publication_consent(
  uuid, text, text, boolean, boolean, boolean, boolean, boolean,
  boolean, boolean, integer, uuid
) to authenticated;

create function public.request_hall_of_fame_record_confirmation(
  p_application_record_id uuid,
  p_confirmer_user_id uuid,
  p_expected_batch_version integer,
  p_request_id uuid
)
returns table (
  application_batch_id uuid,
  application_record_id uuid,
  confirmation_id uuid,
  status text,
  confirmation_version integer,
  batch_version integer,
  record_version integer,
  expires_at timestamptz,
  replayed boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_batch public.hall_of_fame_application_batches%rowtype;
  v_record public.hall_of_fame_application_records%rowtype;
  v_confirmation public.hall_of_fame_record_confirmations%rowtype;
  v_actor_membership_id uuid;
  v_operation text := 'hall_of_fame.confirmation.request';
  v_payload_fingerprint bytea;
  v_claim record;
  v_versions record;
  v_result jsonb;
  v_from_status text;
  v_requested_at timestamptz := pg_catalog.now();
begin
  perform private.lock_active_hall_of_fame_actor(v_actor_user_id);
  if p_application_record_id is null
     or p_confirmer_user_id is null
     or p_request_id is null
     or p_expected_batch_version is null
     or p_expected_batch_version < 1 then
    raise exception 'HOF_INVALID_CONFIRMATION_REQUEST' using errcode = '22023';
  end if;
  perform private.lock_hall_of_fame_mutation_request(
    v_actor_user_id,
    p_request_id
  );


  select record.application_batch_id into v_record.application_batch_id
  from public.hall_of_fame_application_records as record
  where record.id = p_application_record_id;
  if not found then
    raise exception 'HOF_APPLICATION_RECORD_NOT_FOUND';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_record.application_batch_id::text, 8608)
  );

  v_payload_fingerprint := extensions.digest(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'application_record_id', p_application_record_id,
        'confirmer_user_id', p_confirmer_user_id,
        'expected_batch_version', p_expected_batch_version
      )::text,
      'UTF8'
    ),
    'sha256'
  );

  select * into v_claim
  from private.hall_of_fame_claim_request(
    v_actor_user_id, p_request_id, v_operation,
    v_record.application_batch_id, p_application_record_id,
    p_confirmer_user_id, v_payload_fingerprint
  );
  if v_claim.replayed then
    return query select
      (v_claim.result_payload ->> 'application_batch_id')::uuid,
      (v_claim.result_payload ->> 'application_record_id')::uuid,
      (v_claim.result_payload ->> 'confirmation_id')::uuid,
      v_claim.result_payload ->> 'status',
      (v_claim.result_payload ->> 'confirmation_version')::integer,
      (v_claim.result_payload ->> 'batch_version')::integer,
      (v_claim.result_payload ->> 'record_version')::integer,
      (v_claim.result_payload ->> 'expires_at')::timestamptz,
      true;
    return;
  end if;

  perform private.lock_hall_of_fame_authorization_boundary();
  select batch.* into v_batch
  from public.hall_of_fame_application_batches as batch
  where batch.id = v_record.application_batch_id
  for update;
  if not found or v_batch.status <> 'draft' then
    raise exception 'HOF_APPLICATION_NOT_EDITABLE' using errcode = 'PT409';
  end if;
  if v_batch.version <> p_expected_batch_version then
    raise exception 'HOF_STALE_APPLICATION_VERSION' using errcode = 'PT409';
  end if;

  v_actor_membership_id := private.lock_and_authorize_hall_of_fame_batch_edit(
    v_actor_user_id,
    v_batch.id
  );

  select record.* into v_record
  from public.hall_of_fame_application_records as record
  where record.id = p_application_record_id
    and record.application_batch_id = v_batch.id
  for update;
  if not found or v_record.review_status <> 'draft' then
    raise exception 'HOF_APPLICATION_RECORD_NOT_EDITABLE' using errcode = 'PT409';
  end if;
  if p_confirmer_user_id = v_record.target_user_id then
    raise exception 'HOF_SELF_CONFIRMATION_FORBIDDEN' using errcode = '22023';
  end if;
  if v_batch.application_type = 'club_nomination'
     and p_confirmer_user_id = v_batch.created_by_user_id then
    raise exception 'HOF_NOMINATOR_CONFIRMATION_FORBIDDEN' using errcode = '22023';
  end if;

  perform 1
  from public.user_accounts as account
  where account.id = p_confirmer_user_id
    and account.account_status = 'active'
  for share;
  if not found then
    raise exception 'HOF_ACTIVE_CONFIRMER_REQUIRED' using errcode = '42501';
  end if;

  select confirmation.* into v_confirmation
  from public.hall_of_fame_record_confirmations as confirmation
  where confirmation.application_record_id = v_record.id
    and confirmation.confirmer_user_id = p_confirmer_user_id
  for update;

  if found then
    v_from_status := case
      when v_confirmation.status = 'pending'
       and v_confirmation.expires_at <= pg_catalog.now() then 'expired'
      else v_confirmation.status
    end;
    if v_from_status = 'pending' then
      raise exception 'HOF_CONFIRMATION_ALREADY_PENDING' using errcode = 'PT409';
    end if;
    if v_from_status = 'confirmed' then
      raise exception 'HOF_CONFIRMATION_ALREADY_CONFIRMED' using errcode = 'PT409';
    end if;

    update public.hall_of_fame_record_confirmations as confirmation
    set
      requester_user_id = v_actor_user_id,
      status = 'pending',
      requested_at = v_requested_at,
      expires_at = v_requested_at + interval '14 days',
      responded_at = null,
      confirmed_at = null,
      declined_at = null,
      cancelled_at = null,
      withdrawn_at = null,
      last_actor_user_id = v_actor_user_id,
      last_request_id = p_request_id,
      version = confirmation.version + 1
    where confirmation.id = v_confirmation.id
    returning confirmation.* into v_confirmation;
  else
    v_from_status := null;
    insert into public.hall_of_fame_record_confirmations (
      application_record_id,
      requester_user_id,
      confirmer_user_id,
      confirmation_role,
      status,
      requested_at,
      expires_at,
      last_actor_user_id,
      last_request_id
    ) values (
      v_record.id,
      v_actor_user_id,
      p_confirmer_user_id,
      'round_companion',
      'pending',
      v_requested_at,
      v_requested_at + interval '14 days',
      v_actor_user_id,
      p_request_id
    ) returning * into v_confirmation;
  end if;

  insert into public.hall_of_fame_record_confirmation_history (
    confirmation_id,
    application_record_id,
    requester_user_id,
    confirmer_user_id,
    from_status,
    to_status,
    action,
    version,
    actor_user_id,
    request_id,
    requested_at,
    expires_at
  ) values (
    v_confirmation.id,
    v_record.id,
    v_actor_user_id,
    p_confirmer_user_id,
    v_from_status,
    'pending',
    v_operation,
    v_confirmation.version,
    v_actor_user_id,
    p_request_id,
    v_confirmation.requested_at,
    v_confirmation.expires_at
  );

  select * into v_versions
  from private.bump_hall_of_fame_consent_confirmation_versions(
    v_actor_user_id, v_actor_membership_id, p_request_id, v_operation,
    v_batch.id, v_record.id, null
  );
  v_result := pg_catalog.jsonb_build_object(
    'application_batch_id', v_batch.id,
    'application_record_id', v_record.id,
    'confirmation_id', v_confirmation.id,
    'status', v_confirmation.status,
    'confirmation_version', v_confirmation.version,
    'batch_version', v_versions.batch_version,
    'record_version', v_versions.record_version,
    'expires_at', v_confirmation.expires_at
  );
  perform private.audit_and_complete_hall_of_fame_consent_confirmation(
    v_actor_user_id, p_request_id, v_operation, v_batch.id, v_record.id,
    'hall_of_fame_record_confirmation', v_confirmation.id,
    v_from_status, v_confirmation.status,
    v_versions.batch_version, v_versions.record_version,
    v_confirmation.version, v_payload_fingerprint, v_result
  );

  return query select
    v_batch.id, v_record.id, v_confirmation.id, v_confirmation.status,
    v_confirmation.version, v_versions.batch_version,
    v_versions.record_version, v_confirmation.expires_at, false;
end;
$$;

comment on function public.request_hall_of_fame_record_confirmation(
  uuid, uuid, integer, uuid
) is
  'Current draft editor requests a 14-day member companion confirmation; self, nominator, inactive, external, and duplicate active requests are rejected.';

revoke all on function public.request_hall_of_fame_record_confirmation(
  uuid, uuid, integer, uuid
) from public, anon, service_role;
grant execute on function public.request_hall_of_fame_record_confirmation(
  uuid, uuid, integer, uuid
) to authenticated;

create function public.respond_hall_of_fame_record_confirmation(
  p_confirmation_id uuid,
  p_response text,
  p_expected_batch_version integer,
  p_request_id uuid
)
returns table (
  application_batch_id uuid,
  application_record_id uuid,
  confirmation_id uuid,
  status text,
  confirmation_version integer,
  batch_version integer,
  record_version integer,
  replayed boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_batch public.hall_of_fame_application_batches%rowtype;
  v_record public.hall_of_fame_application_records%rowtype;
  v_confirmation public.hall_of_fame_record_confirmations%rowtype;
  v_operation text;
  v_payload_fingerprint bytea;
  v_claim record;
  v_versions record;
  v_result jsonb;
begin
  perform private.lock_active_hall_of_fame_actor(v_actor_user_id);
  if p_confirmation_id is null
     or p_request_id is null
     or p_expected_batch_version is null
     or p_expected_batch_version < 1
     or p_response not in ('confirm', 'decline') then
    raise exception 'HOF_INVALID_CONFIRMATION_RESPONSE' using errcode = '22023';
  end if;
  v_operation := 'hall_of_fame.confirmation.' || p_response;
  perform private.lock_hall_of_fame_mutation_request(
    v_actor_user_id,
    p_request_id
  );


  select confirmation.application_record_id, record.application_batch_id
    into v_confirmation.application_record_id, v_record.application_batch_id
  from public.hall_of_fame_record_confirmations as confirmation
  join public.hall_of_fame_application_records as record
    on record.id = confirmation.application_record_id
  where confirmation.id = p_confirmation_id;
  if not found then
    raise exception 'HOF_CONFIRMATION_NOT_FOUND';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_record.application_batch_id::text, 8608)
  );
  v_payload_fingerprint := extensions.digest(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'confirmation_id', p_confirmation_id,
        'response', p_response,
        'expected_batch_version', p_expected_batch_version
      )::text,
      'UTF8'
    ),
    'sha256'
  );
  select * into v_claim
  from private.hall_of_fame_claim_request(
    v_actor_user_id, p_request_id, v_operation,
    v_record.application_batch_id, v_confirmation.application_record_id,
    v_actor_user_id, v_payload_fingerprint
  );
  if v_claim.replayed then
    return query select
      (v_claim.result_payload ->> 'application_batch_id')::uuid,
      (v_claim.result_payload ->> 'application_record_id')::uuid,
      (v_claim.result_payload ->> 'confirmation_id')::uuid,
      v_claim.result_payload ->> 'status',
      (v_claim.result_payload ->> 'confirmation_version')::integer,
      (v_claim.result_payload ->> 'batch_version')::integer,
      (v_claim.result_payload ->> 'record_version')::integer,
      true;
    return;
  end if;

  perform private.lock_hall_of_fame_authorization_boundary();
  select batch.* into v_batch
  from public.hall_of_fame_application_batches as batch
  where batch.id = v_record.application_batch_id
  for update;
  if not found or v_batch.status <> 'draft' then
    raise exception 'HOF_APPLICATION_NOT_EDITABLE' using errcode = 'PT409';
  end if;
  if v_batch.version <> p_expected_batch_version then
    raise exception 'HOF_STALE_APPLICATION_VERSION' using errcode = 'PT409';
  end if;

  select record.* into v_record
  from public.hall_of_fame_application_records as record
  where record.id = v_confirmation.application_record_id
    and record.application_batch_id = v_batch.id
  for update;
  if not found or v_record.review_status <> 'draft' then
    raise exception 'HOF_APPLICATION_RECORD_NOT_EDITABLE' using errcode = 'PT409';
  end if;

  select confirmation.* into v_confirmation
  from public.hall_of_fame_record_confirmations as confirmation
  where confirmation.id = p_confirmation_id
    and confirmation.application_record_id = v_record.id
  for update;
  if not found then
    raise exception 'HOF_CONFIRMATION_NOT_FOUND';
  end if;
  if v_confirmation.confirmer_user_id <> v_actor_user_id then
    raise exception 'HOF_PERMISSION_DENIED' using errcode = '42501';
  end if;
  if v_confirmation.status <> 'pending' then
    raise exception 'HOF_CONFIRMATION_NOT_PENDING' using errcode = 'PT409';
  end if;
  if v_confirmation.expires_at <= pg_catalog.now() then
    raise exception 'HOF_CONFIRMATION_EXPIRED' using errcode = 'PT409';
  end if;
  if v_confirmation.confirmer_user_id = v_record.target_user_id
     or (
       v_batch.application_type = 'club_nomination'
       and v_confirmation.confirmer_user_id = v_batch.created_by_user_id
     ) then
    raise exception 'HOF_CONFIRMATION_IDENTITY_FORBIDDEN' using errcode = '42501';
  end if;

  update public.hall_of_fame_record_confirmations as confirmation
  set
    status = case when p_response = 'confirm' then 'confirmed' else 'declined' end,
    responded_at = pg_catalog.now(),
    confirmed_at = case when p_response = 'confirm' then pg_catalog.now() else null end,
    declined_at = case when p_response = 'decline' then pg_catalog.now() else null end,
    last_actor_user_id = v_actor_user_id,
    last_request_id = p_request_id,
    version = confirmation.version + 1
  where confirmation.id = p_confirmation_id
  returning confirmation.* into v_confirmation;

  insert into public.hall_of_fame_record_confirmation_history (
    confirmation_id,
    application_record_id,
    requester_user_id,
    confirmer_user_id,
    from_status,
    to_status,
    action,
    version,
    actor_user_id,
    request_id,
    requested_at,
    expires_at
  ) values (
    v_confirmation.id,
    v_record.id,
    v_confirmation.requester_user_id,
    v_actor_user_id,
    'pending',
    v_confirmation.status,
    v_operation,
    v_confirmation.version,
    v_actor_user_id,
    p_request_id,
    v_confirmation.requested_at,
    v_confirmation.expires_at
  );

  select * into v_versions
  from private.bump_hall_of_fame_consent_confirmation_versions(
    v_actor_user_id, null, p_request_id, v_operation,
    v_batch.id, v_record.id, null
  );
  v_result := pg_catalog.jsonb_build_object(
    'application_batch_id', v_batch.id,
    'application_record_id', v_record.id,
    'confirmation_id', v_confirmation.id,
    'status', v_confirmation.status,
    'confirmation_version', v_confirmation.version,
    'batch_version', v_versions.batch_version,
    'record_version', v_versions.record_version
  );
  perform private.audit_and_complete_hall_of_fame_consent_confirmation(
    v_actor_user_id, p_request_id, v_operation, v_batch.id, v_record.id,
    'hall_of_fame_record_confirmation', v_confirmation.id,
    'pending', v_confirmation.status,
    v_versions.batch_version, v_versions.record_version,
    v_confirmation.version, v_payload_fingerprint, v_result
  );

  return query select
    v_batch.id, v_record.id, v_confirmation.id, v_confirmation.status,
    v_confirmation.version, v_versions.batch_version,
    v_versions.record_version, false;
end;
$$;

comment on function public.respond_hall_of_fame_record_confirmation(
  uuid, text, integer, uuid
) is
  'The designated active member confirmer confirms or declines an unexpired draft confirmation request.';

revoke all on function public.respond_hall_of_fame_record_confirmation(
  uuid, text, integer, uuid
) from public, anon, service_role;
grant execute on function public.respond_hall_of_fame_record_confirmation(
  uuid, text, integer, uuid
) to authenticated;

create function public.withdraw_hall_of_fame_record_confirmation(
  p_confirmation_id uuid,
  p_operation text,
  p_expected_batch_version integer,
  p_request_id uuid
)
returns table (
  application_batch_id uuid,
  application_record_id uuid,
  confirmation_id uuid,
  status text,
  confirmation_version integer,
  batch_version integer,
  record_version integer,
  replayed boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_batch public.hall_of_fame_application_batches%rowtype;
  v_record public.hall_of_fame_application_records%rowtype;
  v_confirmation public.hall_of_fame_record_confirmations%rowtype;
  v_actor_membership_id uuid;
  v_rpc_operation text;
  v_payload_fingerprint bytea;
  v_claim record;
  v_versions record;
  v_result jsonb;
begin
  perform private.lock_active_hall_of_fame_actor(v_actor_user_id);
  if p_confirmation_id is null
     or p_request_id is null
     or p_expected_batch_version is null
     or p_expected_batch_version < 1
     or p_operation not in ('cancel', 'withdraw') then
    raise exception 'HOF_INVALID_CONFIRMATION_WITHDRAWAL' using errcode = '22023';
  end if;
  v_rpc_operation := 'hall_of_fame.confirmation.' || p_operation;
  perform private.lock_hall_of_fame_mutation_request(
    v_actor_user_id,
    p_request_id
  );


  select confirmation.application_record_id, record.application_batch_id
    into v_confirmation.application_record_id, v_record.application_batch_id
  from public.hall_of_fame_record_confirmations as confirmation
  join public.hall_of_fame_application_records as record
    on record.id = confirmation.application_record_id
  where confirmation.id = p_confirmation_id;
  if not found then
    raise exception 'HOF_CONFIRMATION_NOT_FOUND';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_record.application_batch_id::text, 8608)
  );
  v_payload_fingerprint := extensions.digest(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'confirmation_id', p_confirmation_id,
        'operation', p_operation,
        'expected_batch_version', p_expected_batch_version
      )::text,
      'UTF8'
    ),
    'sha256'
  );
  select * into v_claim
  from private.hall_of_fame_claim_request(
    v_actor_user_id, p_request_id, v_rpc_operation,
    v_record.application_batch_id, v_confirmation.application_record_id,
    v_actor_user_id, v_payload_fingerprint
  );
  if v_claim.replayed then
    return query select
      (v_claim.result_payload ->> 'application_batch_id')::uuid,
      (v_claim.result_payload ->> 'application_record_id')::uuid,
      (v_claim.result_payload ->> 'confirmation_id')::uuid,
      v_claim.result_payload ->> 'status',
      (v_claim.result_payload ->> 'confirmation_version')::integer,
      (v_claim.result_payload ->> 'batch_version')::integer,
      (v_claim.result_payload ->> 'record_version')::integer,
      true;
    return;
  end if;

  perform private.lock_hall_of_fame_authorization_boundary();
  select batch.* into v_batch
  from public.hall_of_fame_application_batches as batch
  where batch.id = v_record.application_batch_id
  for update;
  if not found or v_batch.status <> 'draft' then
    raise exception 'HOF_APPLICATION_NOT_EDITABLE' using errcode = 'PT409';
  end if;
  if v_batch.version <> p_expected_batch_version then
    raise exception 'HOF_STALE_APPLICATION_VERSION' using errcode = 'PT409';
  end if;

  select record.* into v_record
  from public.hall_of_fame_application_records as record
  where record.id = v_confirmation.application_record_id
    and record.application_batch_id = v_batch.id
  for update;
  if not found or v_record.review_status <> 'draft' then
    raise exception 'HOF_APPLICATION_RECORD_NOT_EDITABLE' using errcode = 'PT409';
  end if;

  select confirmation.* into v_confirmation
  from public.hall_of_fame_record_confirmations as confirmation
  where confirmation.id = p_confirmation_id
    and confirmation.application_record_id = v_record.id
  for update;
  if not found then
    raise exception 'HOF_CONFIRMATION_NOT_FOUND';
  end if;

  if p_operation = 'cancel' then
    v_actor_membership_id := private.lock_and_authorize_hall_of_fame_batch_edit(
      v_actor_user_id,
      v_batch.id
    );
    if v_confirmation.status <> 'pending'
       or v_confirmation.expires_at <= pg_catalog.now() then
      raise exception 'HOF_CONFIRMATION_CANCELLATION_NOT_ALLOWED' using errcode = 'PT409';
    end if;
  else
    if v_confirmation.confirmer_user_id <> v_actor_user_id then
      raise exception 'HOF_PERMISSION_DENIED' using errcode = '42501';
    end if;
    if v_confirmation.status <> 'confirmed' then
      raise exception 'HOF_CONFIRMATION_WITHDRAWAL_NOT_ALLOWED' using errcode = 'PT409';
    end if;
  end if;

  update public.hall_of_fame_record_confirmations as confirmation
  set
    status = 'withdrawn',
    cancelled_at = case when p_operation = 'cancel' then pg_catalog.now() else null end,
    withdrawn_at = case when p_operation = 'withdraw' then pg_catalog.now() else null end,
    last_actor_user_id = v_actor_user_id,
    last_request_id = p_request_id,
    version = confirmation.version + 1
  where confirmation.id = p_confirmation_id
  returning confirmation.* into v_confirmation;

  insert into public.hall_of_fame_record_confirmation_history (
    confirmation_id,
    application_record_id,
    requester_user_id,
    confirmer_user_id,
    from_status,
    to_status,
    action,
    version,
    actor_user_id,
    request_id,
    requested_at,
    expires_at
  ) values (
    v_confirmation.id,
    v_record.id,
    v_confirmation.requester_user_id,
    v_confirmation.confirmer_user_id,
    case when p_operation = 'cancel' then 'pending' else 'confirmed' end,
    'withdrawn',
    v_rpc_operation,
    v_confirmation.version,
    v_actor_user_id,
    p_request_id,
    v_confirmation.requested_at,
    v_confirmation.expires_at
  );

  select * into v_versions
  from private.bump_hall_of_fame_consent_confirmation_versions(
    v_actor_user_id, v_actor_membership_id, p_request_id, v_rpc_operation,
    v_batch.id, v_record.id, null
  );
  v_result := pg_catalog.jsonb_build_object(
    'application_batch_id', v_batch.id,
    'application_record_id', v_record.id,
    'confirmation_id', v_confirmation.id,
    'status', v_confirmation.status,
    'confirmation_version', v_confirmation.version,
    'batch_version', v_versions.batch_version,
    'record_version', v_versions.record_version
  );
  perform private.audit_and_complete_hall_of_fame_consent_confirmation(
    v_actor_user_id, p_request_id, v_rpc_operation, v_batch.id, v_record.id,
    'hall_of_fame_record_confirmation', v_confirmation.id,
    case when p_operation = 'cancel' then 'pending' else 'confirmed' end,
    'withdrawn', v_versions.batch_version, v_versions.record_version,
    v_confirmation.version, v_payload_fingerprint, v_result
  );

  return query select
    v_batch.id, v_record.id, v_confirmation.id, v_confirmation.status,
    v_confirmation.version, v_versions.batch_version,
    v_versions.record_version, false;
end;
$$;

comment on function public.withdraw_hall_of_fame_record_confirmation(
  uuid, text, integer, uuid
) is
  'A current draft editor cancels a pending request, or its designated confirmer withdraws a confirmed response, without deleting history.';

revoke all on function public.withdraw_hall_of_fame_record_confirmation(
  uuid, text, integer, uuid
) from public, anon, service_role;
grant execute on function public.withdraw_hall_of_fame_record_confirmation(
  uuid, text, integer, uuid
) to authenticated;

drop trigger hall_of_fame_record_confirmations_guard_before_mutation
  on public.hall_of_fame_record_confirmations;
create trigger hall_of_fame_record_confirmations_guard_before_mutation
before insert or update or delete on public.hall_of_fame_record_confirmations
for each row execute function private.guard_hall_of_fame_consent_confirmation_current();

drop trigger hall_of_fame_publication_consents_guard_before_mutation
  on public.hall_of_fame_publication_consents;
create trigger hall_of_fame_publication_consents_guard_before_mutation
before insert or update or delete on public.hall_of_fame_publication_consents
for each row execute function private.guard_hall_of_fame_consent_confirmation_current();

create trigger hall_of_fame_application_consents_guard_before_mutation
before insert or update or delete on public.hall_of_fame_application_consents
for each row execute function private.guard_hall_of_fame_consent_confirmation_current();

create trigger hall_of_fame_application_consent_history_guard_before_mutation
before insert or update or delete on public.hall_of_fame_application_consent_history
for each row execute function private.reject_hall_of_fame_append_only_mutation();

create trigger hall_of_fame_record_confirmation_history_guard_before_mutation
before insert or update or delete on public.hall_of_fame_record_confirmation_history
for each row execute function private.reject_hall_of_fame_append_only_mutation();

comment on function public.set_hall_of_fame_application_consent(
  uuid, text, text, text, integer, uuid
) is
  'Authenticated target-only B-2B-1 RPC. No administrator, service-role, or nominator consent override is exposed.';
comment on function public.set_hall_of_fame_publication_consent(
  uuid, text, text, boolean, boolean, boolean, boolean, boolean,
  boolean, boolean, integer, uuid
) is
  'Authenticated target-only B-2B-1 publication decision. Evidence and companion identities are never made public.';
comment on function public.request_hall_of_fame_record_confirmation(
  uuid, uuid, integer, uuid
) is
  'Authenticated draft-editor B-2B-1 member confirmation request with server-derived 14-day expiry and no external-contact path.';
comment on function public.respond_hall_of_fame_record_confirmation(
  uuid, text, integer, uuid
) is
  'Authenticated designated-confirmer B-2B-1 response; the confirmer receives no evidence access.';
comment on function public.withdraw_hall_of_fame_record_confirmation(
  uuid, text, integer, uuid
) is
  'Authenticated B-2B-1 pending cancellation or confirmed-response withdrawal with immutable history.';
-- B-2A public RPC compatibility wrappers acquire the actor/request lock before
-- entering the previously approved implementation and any of its batch locks.
alter function public.set_hall_of_fame_round_snapshot(
  uuid, integer, date, timestamptz, text, text, text, text, text, text, text, uuid
) rename to b2a_set_round_snapshot_impl;
alter function public.b2a_set_round_snapshot_impl(
  uuid, integer, date, timestamptz, text, text, text, text, text, text, text, uuid
) set schema private;
revoke all on function private.b2a_set_round_snapshot_impl(
  uuid, integer, date, timestamptz, text, text, text, text, text, text, text, uuid
) from public, anon, authenticated, service_role;

create or replace function public.set_hall_of_fame_round_snapshot(
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
begin
  perform private.lock_active_hall_of_fame_actor(v_actor_user_id);
  perform private.lock_hall_of_fame_mutation_request(v_actor_user_id, p_request_id);
  return query
  select * from private.b2a_set_round_snapshot_impl(
    p_application_batch_id, p_expected_batch_version, p_played_on, p_started_at,
    p_course_name, p_course_region, p_course_environment, p_course_layout,
    p_round_type, p_event_name, p_notes, p_request_id
  );
end;
$$;

comment on function public.set_hall_of_fame_round_snapshot(
  uuid, integer, date, timestamptz, text, text, text, text, text, text, text, uuid
) is 'B-2A round snapshot RPC with an early actor/request transaction lock.';
revoke all on function public.set_hall_of_fame_round_snapshot(
  uuid, integer, date, timestamptz, text, text, text, text, text, text, text, uuid
) from public, anon, service_role;
grant execute on function public.set_hall_of_fame_round_snapshot(
  uuid, integer, date, timestamptz, text, text, text, text, text, text, text, uuid
) to authenticated;

alter function public.add_hall_of_fame_application_record(
  uuid, integer, uuid, uuid, text, text, integer, integer, integer, uuid
) rename to b2a_add_application_record_impl;
alter function public.b2a_add_application_record_impl(
  uuid, integer, uuid, uuid, text, text, integer, integer, integer, uuid
) set schema private;
revoke all on function private.b2a_add_application_record_impl(
  uuid, integer, uuid, uuid, text, text, integer, integer, integer, uuid
) from public, anon, authenticated, service_role;

create or replace function public.add_hall_of_fame_application_record(
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
begin
  perform private.lock_active_hall_of_fame_actor(v_actor_user_id);
  perform private.lock_hall_of_fame_mutation_request(v_actor_user_id, p_request_id);
  return query
  select * from private.b2a_add_application_record_impl(
    p_application_batch_id, p_expected_batch_version, p_target_user_id,
    p_target_membership_id, p_record_type_code, p_course_segment,
    p_hole_number, p_hole_par, p_strokes, p_request_id
  );
end;
$$;

comment on function public.add_hall_of_fame_application_record(
  uuid, integer, uuid, uuid, text, text, integer, integer, integer, uuid
) is 'B-2A record-add RPC with an early actor/request transaction lock.';
revoke all on function public.add_hall_of_fame_application_record(
  uuid, integer, uuid, uuid, text, text, integer, integer, integer, uuid
) from public, anon, service_role;
grant execute on function public.add_hall_of_fame_application_record(
  uuid, integer, uuid, uuid, text, text, integer, integer, integer, uuid
) to authenticated;

alter function public.update_hall_of_fame_application_record(
  uuid, integer, integer, text, text, integer, integer, integer, uuid
) rename to b2a_update_application_record_impl;
alter function public.b2a_update_application_record_impl(
  uuid, integer, integer, text, text, integer, integer, integer, uuid
) set schema private;
revoke all on function private.b2a_update_application_record_impl(
  uuid, integer, integer, text, text, integer, integer, integer, uuid
) from public, anon, authenticated, service_role;

create or replace function public.update_hall_of_fame_application_record(
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
begin
  perform private.lock_active_hall_of_fame_actor(v_actor_user_id);
  perform private.lock_hall_of_fame_mutation_request(v_actor_user_id, p_request_id);
  return query
  select * from private.b2a_update_application_record_impl(
    p_application_record_id, p_expected_record_version, p_expected_batch_version,
    p_record_type_code, p_course_segment, p_hole_number, p_hole_par,
    p_strokes, p_request_id
  );
end;
$$;

comment on function public.update_hall_of_fame_application_record(
  uuid, integer, integer, text, text, integer, integer, integer, uuid
) is 'B-2A record-update RPC with an early actor/request transaction lock.';
revoke all on function public.update_hall_of_fame_application_record(
  uuid, integer, integer, text, text, integer, integer, integer, uuid
) from public, anon, service_role;
grant execute on function public.update_hall_of_fame_application_record(
  uuid, integer, integer, text, text, integer, integer, integer, uuid
) to authenticated;

alter function public.withdraw_hall_of_fame_application_record(
  uuid, integer, integer, text, uuid
) rename to b2a_withdraw_application_record_impl;
alter function public.b2a_withdraw_application_record_impl(
  uuid, integer, integer, text, uuid
) set schema private;
revoke all on function private.b2a_withdraw_application_record_impl(
  uuid, integer, integer, text, uuid
) from public, anon, authenticated, service_role;

create or replace function public.withdraw_hall_of_fame_application_record(
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
begin
  perform private.lock_active_hall_of_fame_actor(v_actor_user_id);
  perform private.lock_hall_of_fame_mutation_request(v_actor_user_id, p_request_id);
  return query
  select * from private.b2a_withdraw_application_record_impl(
    p_application_record_id, p_expected_record_version,
    p_expected_batch_version, p_reason, p_request_id
  );
end;
$$;

comment on function public.withdraw_hall_of_fame_application_record(
  uuid, integer, integer, text, uuid
) is 'B-2A record-withdraw RPC with an early actor/request transaction lock.';
revoke all on function public.withdraw_hall_of_fame_application_record(
  uuid, integer, integer, text, uuid
) from public, anon, service_role;
grant execute on function public.withdraw_hall_of_fame_application_record(
  uuid, integer, integer, text, uuid
) to authenticated;

alter function public.withdraw_hall_of_fame_application_draft(
  uuid, integer, text, uuid
) rename to b2a_withdraw_application_draft_impl;
alter function public.b2a_withdraw_application_draft_impl(
  uuid, integer, text, uuid
) set schema private;
revoke all on function private.b2a_withdraw_application_draft_impl(
  uuid, integer, text, uuid
) from public, anon, authenticated, service_role;

create or replace function public.withdraw_hall_of_fame_application_draft(
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
begin
  perform private.lock_active_hall_of_fame_actor(v_actor_user_id);
  perform private.lock_hall_of_fame_mutation_request(v_actor_user_id, p_request_id);
  return query
  select * from private.b2a_withdraw_application_draft_impl(
    p_application_batch_id, p_expected_batch_version, p_reason, p_request_id
  );
end;
$$;

comment on function public.withdraw_hall_of_fame_application_draft(
  uuid, integer, text, uuid
) is 'B-2A draft-withdraw RPC with an early actor/request transaction lock.';
revoke all on function public.withdraw_hall_of_fame_application_draft(
  uuid, integer, text, uuid
) from public, anon, service_role;
grant execute on function public.withdraw_hall_of_fame_application_draft(
  uuid, integer, text, uuid
) to authenticated;
