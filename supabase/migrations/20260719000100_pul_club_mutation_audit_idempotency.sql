-- PUL 8-3B-2B-1: mutation audit correlation and private idempotency ledger.
-- Membership and role mutation RPCs are intentionally deferred.

alter table public.audit_logs
  add column request_id uuid,
  add column outcome text,
  add constraint audit_logs_outcome_check
    check (outcome in ('success', 'noop'));

comment on column public.audit_logs.request_id is
  'Optional external mutation request identifier used to correlate one representative audit entry.';

comment on column public.audit_logs.outcome is
  'Completed mutation result: success when data changed, noop when the requested state already existed.';

create unique index audit_logs_actor_request_unique_idx
  on public.audit_logs (actor_id, request_id)
  where actor_id is not null and request_id is not null;

create table private.club_mutation_requests (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null
    references public.user_accounts (id) on delete cascade,
  request_id uuid not null,
  action_code text not null,
  club_id uuid not null
    references public.clubs (id) on delete cascade,
  target_user_id uuid
    references public.user_accounts (id) on delete set null,
  role_code text
    references public.club_role_definitions (role_code) on delete restrict,
  input_fingerprint text not null,
  outcome text,
  result_data jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint club_mutation_requests_actor_request_unique
    unique (actor_id, request_id),
  constraint club_mutation_requests_action_code_check
    check (
      action_code = btrim(action_code)
      and action_code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'
    ),
  constraint club_mutation_requests_fingerprint_check
    check (
      input_fingerprint = btrim(input_fingerprint)
      and input_fingerprint <> ''
    ),
  constraint club_mutation_requests_outcome_check
    check (outcome in ('success', 'noop')),
  constraint club_mutation_requests_result_data_check
    check (result_data is null or jsonb_typeof(result_data) = 'object'),
  constraint club_mutation_requests_completion_check
    check (
      (
        outcome is null
        and result_data is null
        and completed_at is null
      )
      or (
        outcome is not null
        and result_data is not null
        and completed_at is not null
      )
    ),
  constraint club_mutation_requests_completed_at_check
    check (completed_at is null or completed_at >= created_at)
);

comment on table private.club_mutation_requests is
  'Private operational ledger for mutation idempotency claims and completed result replay.';

comment on column private.club_mutation_requests.input_fingerprint is
  'Stable normalized-input fingerprint; generation is deferred to each mutation RPC.';

comment on column private.club_mutation_requests.result_data is
  'Structured completed result returned for an identical actor and request retry.';

create index club_mutation_requests_created_at_idx
  on private.club_mutation_requests (created_at);

alter table private.club_mutation_requests enable row level security;

revoke all on table private.club_mutation_requests
  from public, anon, authenticated, service_role;
