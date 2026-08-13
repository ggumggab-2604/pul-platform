-- PUL 8-6-B-3-4: deterministic badge sources and consent-aware public projection.
-- Correction, revocation, appeals, background jobs, and UI remain deferred.

create function private.require_hall_of_fame_projection_admin(
  p_actor_user_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_platform_role text;
begin
  select account.platform_role
    into v_platform_role
  from public.user_accounts as account
  where account.id = p_actor_user_id
    and account.account_status = 'active';

  if not found or v_platform_role <> 'platform_admin' then
    raise exception 'HOF_PROJECTION_ADMIN_REQUIRED' using errcode = '42501';
  end if;
end;
$$;

comment on function private.require_hall_of_fame_projection_admin(uuid) is
  'Requires the exact active platform_admin role for explicit canonical projection synchronization.';

revoke all on function private.require_hall_of_fame_projection_admin(uuid)
  from public, anon, authenticated, service_role;

create function private.hall_of_fame_publication_consent_is_effective(
  p_application_record_id uuid,
  p_target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.hall_of_fame_publication_consents as consent
    where consent.application_record_id = p_application_record_id
      and consent.target_user_id = p_target_user_id
      and consent.status = 'granted'
      and consent.policy_version is not null
      and consent.policy_version = pg_catalog.btrim(consent.policy_version)
      and consent.policy_version <> ''
      and consent.masked_display_name_consent
      and consent.record_date_consent
      and consent.course_detail_consent
      and consent.consented_at is not null
      and consent.withdrawn_at is null
  );
$$;

comment on function private.hall_of_fame_publication_consent_is_effective(uuid, uuid) is
  'Checks only the current target-bound publication consent row and its mandatory privacy scope.';

revoke all on function private.hall_of_fame_publication_consent_is_effective(uuid, uuid)
  from public, anon, authenticated, service_role;

create function private.enforce_guarded_hall_of_fame_projection_mutation()
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
  where canonical.source_application_record_id = v_application_record;

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
  'Binds projection ledger, canonical publication, badge source, and post-approval consent writes to their exact authenticated RPC context.';

revoke all on function private.enforce_guarded_hall_of_fame_projection_mutation()
  from public, anon, authenticated, service_role;

create function private.enforce_hall_of_fame_projection_history_append()
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
  where canonical.source_application_record_id = v_application_record;

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
  'Validates append-only canonical publication and post-approval consent history against transaction-current state and prior version links.';

revoke all on function private.enforce_hall_of_fame_projection_history_append()
  from public, anon, authenticated, service_role;

-- Extend the existing deny-by-default routing only for the two new operations.
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
    'hall_of_fame.publication_consent.withdraw_after_approval'
  )
) execute function private.reject_hall_of_fame_mutation();
create trigger hall_of_fame_mutation_requests_projection_guard
before insert or update or delete on private.hall_of_fame_mutation_requests
for each row when (
  coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '') in (
    'hall_of_fame.record.projection.sync',
    'hall_of_fame.publication_consent.withdraw_after_approval'
  )
) execute function private.enforce_guarded_hall_of_fame_projection_mutation();

drop trigger hall_of_fame_records_guard_before_mutation
  on public.hall_of_fame_records;
create trigger hall_of_fame_records_guard_before_mutation
before insert or update or delete on public.hall_of_fame_records
for each row when (
  coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '') not in (
    'hall_of_fame.application.final_decision',
    'hall_of_fame.record.projection.sync',
    'hall_of_fame.publication_consent.withdraw_after_approval'
  )
) execute function private.reject_hall_of_fame_mutation();
create trigger hall_of_fame_records_projection_guard
before insert or update or delete on public.hall_of_fame_records
for each row when (
  coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '') in (
    'hall_of_fame.record.projection.sync',
    'hall_of_fame.publication_consent.withdraw_after_approval'
  )
) execute function private.enforce_guarded_hall_of_fame_projection_mutation();

drop trigger hall_of_fame_badge_sources_guard_before_mutation
  on public.hall_of_fame_badge_sources;
create trigger hall_of_fame_badge_sources_guard_before_mutation
before insert or update or delete on public.hall_of_fame_badge_sources
for each row when (
  coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '')
    <> 'hall_of_fame.record.projection.sync'
) execute function private.reject_hall_of_fame_mutation();
create trigger hall_of_fame_badge_sources_projection_guard
before insert or update or delete on public.hall_of_fame_badge_sources
for each row when (
  coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '')
    = 'hall_of_fame.record.projection.sync'
) execute function private.enforce_guarded_hall_of_fame_projection_mutation();

drop trigger hall_of_fame_publication_consents_guard_before_mutation
  on public.hall_of_fame_publication_consents;
create trigger hall_of_fame_publication_consents_guard_before_mutation
before insert or update or delete on public.hall_of_fame_publication_consents
for each row when (
  coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '')
    <> 'hall_of_fame.publication_consent.withdraw_after_approval'
) execute function private.guard_hall_of_fame_consent_confirmation_current();
create trigger hall_of_fame_publication_consents_post_approval_guard
before insert or update or delete on public.hall_of_fame_publication_consents
for each row when (
  coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '')
    = 'hall_of_fame.publication_consent.withdraw_after_approval'
) execute function private.enforce_guarded_hall_of_fame_projection_mutation();

drop trigger hall_of_fame_record_history_guard_before_mutation
  on public.hall_of_fame_record_history;
create trigger hall_of_fame_record_history_guard_before_mutation
before insert or update or delete on public.hall_of_fame_record_history
for each row when (
  coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '') not in (
    'hall_of_fame.application.final_decision',
    'hall_of_fame.record.projection.sync',
    'hall_of_fame.publication_consent.withdraw_after_approval'
  )
) execute function private.reject_hall_of_fame_append_only_mutation();
create trigger hall_of_fame_record_history_projection_guard
before insert or update or delete on public.hall_of_fame_record_history
for each row when (
  coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '') in (
    'hall_of_fame.record.projection.sync',
    'hall_of_fame.publication_consent.withdraw_after_approval'
  )
) execute function private.enforce_hall_of_fame_projection_history_append();

drop trigger hall_of_fame_publication_consent_history_guard_before_mutation
  on public.hall_of_fame_publication_consent_history;
create trigger hall_of_fame_publication_consent_history_guard_before_mutation
before insert or update or delete on public.hall_of_fame_publication_consent_history
for each row when (
  coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '')
    <> 'hall_of_fame.publication_consent.withdraw_after_approval'
) execute function private.reject_hall_of_fame_append_only_mutation();
create trigger hall_of_fame_publication_consent_history_post_approval_guard
before insert or update or delete on public.hall_of_fame_publication_consent_history
for each row when (
  coalesce(pg_catalog.current_setting('pul.hall_of_fame.operation', true), '')
    = 'hall_of_fame.publication_consent.withdraw_after_approval'
) execute function private.enforce_hall_of_fame_projection_history_append();

create function public.sync_hall_of_fame_record_projection(
  p_record_id uuid,
  p_expected_record_version integer,
  p_request_id uuid
)
returns table (
  request_id uuid,
  operation text,
  record_id uuid,
  publication_status text,
  record_version integer,
  badge_source_count integer,
  badges_created integer,
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
  v_operation text := 'hall_of_fame.record.projection.sync';
  v_pre_record public.hall_of_fame_records%rowtype;
  v_record public.hall_of_fame_records%rowtype;
  v_batch_id uuid;
  v_source_status text;
  v_effective_consent boolean;
  v_fingerprint bytea;
  v_claim record;
  v_badges_created integer := 0;
  v_badge_source_count integer;
  v_before_publication text;
  v_changed boolean := false;
  v_result jsonb;
begin
  perform private.lock_active_hall_of_fame_actor(v_actor);
  if p_record_id is null
     or p_expected_record_version is null
     or p_expected_record_version < 1
     or p_request_id is null then
    raise exception 'HOF_INVALID_PROJECTION_REQUEST' using errcode = '22023';
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
        'expected_record_version', p_expected_record_version
      )::text,
      'UTF8'
    ),
    'sha256'
  );

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
      v_claim.result_payload ->> 'publication_status',
      (v_claim.result_payload ->> 'record_version')::integer,
      (v_claim.result_payload ->> 'badge_source_count')::integer,
      (v_claim.result_payload ->> 'badges_created')::integer,
      (v_claim.result_payload ->> 'changed')::boolean,
      true;
    return;
  end if;

  perform private.require_hall_of_fame_projection_admin(v_actor);

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
  if v_record.source_application_record_id <> v_pre_record.source_application_record_id
     or v_record.target_user_id <> v_pre_record.target_user_id
     or not found
     or v_record.validity_status <> 'active'
     or v_source_status <> 'approved' then
    raise exception 'HOF_CANONICAL_SOURCE_INTEGRITY_INVALID' using errcode = '23514';
  end if;
  if v_record.version <> p_expected_record_version then
    raise exception 'HOF_STALE_RECORD_VERSION' using errcode = 'PT409';
  end if;
  if v_record.record_type_code not in ('hole_in_one', 'albatross', 'condor') then
    raise exception 'HOF_BADGE_MAPPING_NOT_SUPPORTED' using errcode = '22023';
  end if;

  perform consent.application_record_id
  from public.hall_of_fame_publication_consents as consent
  where consent.application_record_id = v_record.source_application_record_id
  for update;

  if (
    select pg_catalog.count(*)
    from public.hall_of_fame_badge_definitions as definition
    where definition.code in (v_record.record_type_code, 'hall_of_fame_inductee')
      and definition.is_active
      and (
        definition.code = 'hall_of_fame_inductee'
        or definition.source_record_type_code = v_record.record_type_code
      )
  ) <> 2 then
    raise exception 'HOF_REQUIRED_BADGE_DEFINITION_MISSING' using errcode = '23514';
  end if;

  perform definition.code
  from public.hall_of_fame_badge_definitions as definition
  where definition.code in (v_record.record_type_code, 'hall_of_fame_inductee')
  order by definition.code
  for share;

  perform source.id
  from public.hall_of_fame_badge_sources as source
  where source.record_id = v_record.id
  order by source.badge_code, source.id
  for update;

  insert into public.hall_of_fame_badge_sources (
    target_user_id,
    badge_code,
    record_id,
    status,
    activated_at,
    created_at
  )
  select
    v_record.target_user_id,
    required.badge_code,
    v_record.id,
    'active',
    pg_catalog.now(),
    pg_catalog.now()
  from (
    values (v_record.record_type_code), ('hall_of_fame_inductee'::text)
  ) as required(badge_code)
  where not exists (
    select 1
    from public.hall_of_fame_badge_sources as existing
    where existing.record_id = v_record.id
      and existing.badge_code = required.badge_code
      and existing.status = 'active'
  )
  order by required.badge_code;
  get diagnostics v_badges_created = row_count;

  select pg_catalog.count(*)::integer
    into v_badge_source_count
  from public.hall_of_fame_badge_sources as source
  where source.record_id = v_record.id
    and source.status = 'active';
  if v_badge_source_count <> 2 then
    raise exception 'HOF_BADGE_SOURCE_RECONCILIATION_FAILED' using errcode = '23514';
  end if;

  v_effective_consent := private.hall_of_fame_publication_consent_is_effective(
    v_record.source_application_record_id,
    v_record.target_user_id
  );
  v_before_publication := v_record.publication_status;

  if v_effective_consent and v_record.publication_status = 'hidden' then
    update public.hall_of_fame_records as canonical
    set
      publication_status = 'published',
      published_at = pg_catalog.now(),
      suppression_reason = null,
      version = canonical.version + 1,
      updated_at = pg_catalog.now()
    where canonical.id = v_record.id
      and canonical.version = p_expected_record_version
    returning canonical.* into v_record;
    if not found then
      raise exception 'HOF_STALE_RECORD_VERSION' using errcode = 'PT409';
    end if;
    v_changed := true;
  elsif not v_effective_consent and v_record.publication_status = 'published' then
    update public.hall_of_fame_records as canonical
    set
      publication_status = 'suppressed',
      suppression_reason = 'Publication consent is not currently effective.',
      version = canonical.version + 1,
      updated_at = pg_catalog.now()
    where canonical.id = v_record.id
      and canonical.version = p_expected_record_version
    returning canonical.* into v_record;
    if not found then
      raise exception 'HOF_STALE_RECORD_VERSION' using errcode = 'PT409';
    end if;
    v_changed := true;
  end if;

  if v_changed then
    insert into public.hall_of_fame_record_history (
      record_id,
      version,
      from_validity_status,
      to_validity_status,
      from_publication_status,
      to_publication_status,
      action,
      reason,
      actor_user_id,
      request_id
    ) values (
      v_record.id,
      v_record.version,
      'active',
      'active',
      v_before_publication,
      v_record.publication_status,
      case
        when v_record.publication_status = 'published'
          then 'hall_of_fame.record.published'
        else 'hall_of_fame.record.suppressed'
      end,
      case
        when v_record.publication_status = 'published' then null
        else 'Publication consent is not currently effective.'
      end,
      v_actor,
      p_request_id
    );
  end if;

  if v_changed or v_badges_created > 0 then
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
        'publication_status', v_before_publication
      ),
      pg_catalog.jsonb_build_object(
        'publication_status', v_record.publication_status,
        'record_version', v_record.version,
        'badge_source_count', v_badge_source_count
      ),
      pg_catalog.jsonb_build_object(
        'badges_created', v_badges_created,
        'publication_changed', v_changed
      ),
      p_request_id,
      'success'
    );
  end if;

  v_result := pg_catalog.jsonb_build_object(
    'operation', v_operation,
    'record_id', v_record.id,
    'publication_status', v_record.publication_status,
    'record_version', v_record.version,
    'badge_source_count', v_badge_source_count,
    'badges_created', v_badges_created,
    'changed', v_changed or v_badges_created > 0
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
    v_record.publication_status,
    v_record.version,
    v_badge_source_count,
    v_badges_created,
    v_changed or v_badges_created > 0,
    false;
end;
$$;

comment on function public.sync_hall_of_fame_record_projection(uuid, integer, uuid) is
  'Active platform_admin-only deterministic badge reconciliation and consent-aware initial canonical publication.';

revoke all on function public.sync_hall_of_fame_record_projection(uuid, integer, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.sync_hall_of_fame_record_projection(uuid, integer, uuid)
  to authenticated;

create function public.withdraw_hall_of_fame_publication_consent_after_approval(
  p_record_id uuid,
  p_expected_consent_version integer,
  p_request_id uuid
)
returns table (
  request_id uuid,
  operation text,
  record_id uuid,
  consent_status text,
  consent_version integer,
  publication_status text,
  record_version integer,
  replayed boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_operation text := 'hall_of_fame.publication_consent.withdraw_after_approval';
  v_pre_record public.hall_of_fame_records%rowtype;
  v_record public.hall_of_fame_records%rowtype;
  v_consent public.hall_of_fame_publication_consents%rowtype;
  v_batch_id uuid;
  v_source_status text;
  v_fingerprint bytea;
  v_claim record;
  v_before_publication text;
  v_result jsonb;
begin
  perform private.lock_active_hall_of_fame_actor(v_actor);
  if p_record_id is null
     or p_expected_consent_version is null
     or p_expected_consent_version < 1
     or p_request_id is null then
    raise exception 'HOF_INVALID_PUBLICATION_WITHDRAWAL_REQUEST' using errcode = '22023';
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
        'expected_consent_version', p_expected_consent_version
      )::text,
      'UTF8'
    ),
    'sha256'
  );

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
      v_claim.result_payload ->> 'consent_status',
      (v_claim.result_payload ->> 'consent_version')::integer,
      v_claim.result_payload ->> 'publication_status',
      (v_claim.result_payload ->> 'record_version')::integer,
      true;
    return;
  end if;

  select canonical.*
    into v_record
  from public.hall_of_fame_records as canonical
  where canonical.id = p_record_id
  for update;
  if not found
     or v_record.source_application_record_id <> v_pre_record.source_application_record_id
     or v_record.target_user_id <> v_actor
     or v_record.validity_status <> 'active'
     or v_source_status <> 'approved' then
    raise exception 'HOF_PUBLICATION_WITHDRAWAL_NOT_ALLOWED' using errcode = 'PT409';
  end if;
  select source.application_batch_id, source.review_status
    into v_batch_id, v_source_status
  from public.hall_of_fame_application_records as source
  where source.id = v_record.source_application_record_id
    and source.target_user_id = v_record.target_user_id
  for share;
  if not found or v_source_status <> 'approved' then
    raise exception 'HOF_PUBLICATION_WITHDRAWAL_NOT_ALLOWED' using errcode = 'PT409';
  end if;

  select consent.*
    into v_consent
  from public.hall_of_fame_publication_consents as consent
  where consent.application_record_id = v_record.source_application_record_id
    and consent.target_user_id = v_actor
  for update;
  if not found then
    raise exception 'HOF_PUBLICATION_WITHDRAWAL_NOT_ALLOWED' using errcode = 'PT409';
  end if;
  if v_consent.version <> p_expected_consent_version then
    raise exception 'HOF_STALE_CONSENT_VERSION' using errcode = 'PT409';
  end if;
  if v_consent.status = 'withdrawn' then
    if v_record.publication_status <> 'suppressed' then
      raise exception 'HOF_PUBLICATION_WITHDRAWAL_NOT_ALLOWED' using errcode = 'PT409';
    end if;

    v_result := pg_catalog.jsonb_build_object(
      'operation', v_operation,
      'record_id', v_record.id,
      'consent_status', v_consent.status,
      'consent_version', v_consent.version,
      'publication_status', v_record.publication_status,
      'record_version', v_record.version
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
      v_consent.status,
      v_consent.version,
      v_record.publication_status,
      v_record.version,
      false;
    return;
  elsif v_consent.status <> 'granted' then
    raise exception 'HOF_PUBLICATION_WITHDRAWAL_NOT_ALLOWED' using errcode = 'PT409';
  end if;

  update public.hall_of_fame_publication_consents as consent
  set
    status = 'withdrawn',
    display_name_consent = false,
    masked_display_name_consent = false,
    full_display_name_consent = false,
    avatar_consent = false,
    club_name_consent = false,
    record_date_consent = false,
    course_detail_consent = false,
    badge_consent = false,
    withdrawn_at = pg_catalog.now(),
    last_actor_user_id = v_actor,
    last_request_id = p_request_id,
    version = consent.version + 1,
    updated_at = pg_catalog.now()
  where consent.application_record_id = v_record.source_application_record_id
    and consent.target_user_id = v_actor
    and consent.status = 'granted'
    and consent.version = p_expected_consent_version
  returning consent.* into v_consent;
  if not found then
    raise exception 'HOF_STALE_CONSENT_VERSION' using errcode = 'PT409';
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
    v_record.source_application_record_id,
    v_actor,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    v_consent.policy_version,
    'granted',
    'withdrawn',
    v_consent.version,
    v_actor,
    p_request_id
  );

  v_before_publication := v_record.publication_status;
  if v_record.publication_status in ('hidden', 'published') then
    update public.hall_of_fame_records as canonical
    set
      publication_status = 'suppressed',
      suppression_reason = 'Publication consent withdrawn by subject.',
      version = canonical.version + 1,
      updated_at = pg_catalog.now()
    where canonical.id = v_record.id
      and canonical.version = v_record.version
    returning canonical.* into v_record;
    if not found then
      raise exception 'HOF_STALE_RECORD_VERSION' using errcode = 'PT409';
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
      actor_user_id,
      request_id
    ) values (
      v_record.id,
      v_record.version,
      'active',
      'active',
      v_before_publication,
      'suppressed',
      'hall_of_fame.record.suppressed',
      'Publication consent withdrawn by subject.',
      v_actor,
      p_request_id
    );
  end if;

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
      'consent_status', 'granted',
      'consent_version', p_expected_consent_version,
      'publication_status', v_before_publication
    ),
    pg_catalog.jsonb_build_object(
      'consent_status', v_consent.status,
      'consent_version', v_consent.version,
      'publication_status', v_record.publication_status,
      'record_version', v_record.version
    ),
    pg_catalog.jsonb_build_object('privacy_withdrawal', true),
    p_request_id,
    'success'
  );

  v_result := pg_catalog.jsonb_build_object(
    'operation', v_operation,
    'record_id', v_record.id,
    'consent_status', v_consent.status,
    'consent_version', v_consent.version,
    'publication_status', v_record.publication_status,
    'record_version', v_record.version
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
    v_consent.status,
    v_consent.version,
    v_record.publication_status,
    v_record.version,
    false;
end;
$$;

comment on function public.withdraw_hall_of_fame_publication_consent_after_approval(uuid, integer, uuid) is
  'Target-only post-approval privacy withdrawal that atomically suppresses a published canonical while preserving official badge provenance.';

revoke all on function public.withdraw_hall_of_fame_publication_consent_after_approval(uuid, integer, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.withdraw_hall_of_fame_publication_consent_after_approval(uuid, integer, uuid)
  to authenticated;

create function public.list_hall_of_fame_public_records(
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  record_type_code text,
  record_type_name text,
  played_on date,
  course_name text,
  course_region text,
  course_environment text,
  course_layout text,
  course_segment text,
  hole_number integer,
  hole_par integer,
  strokes integer,
  display_name text,
  avatar_url text,
  club_name text,
  badges jsonb,
  approved_at timestamptz,
  published_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_limit is null
     or p_limit < 1
     or p_limit > 100
     or p_offset is null
     or p_offset < 0 then
    raise exception 'HOF_INVALID_PUBLIC_LIST_REQUEST' using errcode = '22023';
  end if;

  return query
  select
    canonical.record_type_code,
    record_type.display_name,
    case when consent.record_date_consent then canonical.played_on else null end,
    case when consent.course_detail_consent then canonical.course_name_snapshot else null end,
    case when consent.course_detail_consent then canonical.course_region_snapshot else null end,
    case when consent.course_detail_consent then canonical.course_environment else null end,
    case when consent.course_detail_consent then canonical.course_layout_snapshot else null end,
    case when consent.course_detail_consent then canonical.course_segment_snapshot else null end,
    case when consent.course_detail_consent then canonical.hole_number else null end,
    case when consent.course_detail_consent then canonical.hole_par else null end,
    case when consent.course_detail_consent then canonical.strokes else null end,
    case
      when consent.full_display_name_consent
        then nullif(pg_catalog.btrim(profile.display_name), '')
      when consent.masked_display_name_consent
        then 'PUL member'::text
      else null
    end,
    null::text,
    case when consent.club_name_consent then club.name else null end,
    case
      when consent.badge_consent then coalesce(public_badges.badges, '[]'::jsonb)
      else '[]'::jsonb
    end,
    canonical.approved_at,
    canonical.published_at
  from public.hall_of_fame_records as canonical
  join public.hall_of_fame_record_type_definitions as record_type
    on record_type.code = canonical.record_type_code
  join public.hall_of_fame_publication_consents as consent
    on consent.application_record_id = canonical.source_application_record_id
   and consent.target_user_id = canonical.target_user_id
   and consent.status = 'granted'
   and consent.policy_version is not null
   and consent.policy_version = pg_catalog.btrim(consent.policy_version)
   and consent.policy_version <> ''
   and consent.masked_display_name_consent
   and consent.record_date_consent
   and consent.course_detail_consent
   and consent.consented_at is not null
   and consent.withdrawn_at is null
  left join public.user_profiles as profile
    on profile.user_id = canonical.target_user_id
  left join public.clubs as club
    on club.id = canonical.nominating_club_id
  left join lateral (
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'code', badge_count.badge_code,
        'name', badge_count.display_name,
        'source_count', badge_count.source_count
      )
      order by badge_count.display_priority, badge_count.badge_code
    ) as badges
    from (
      select
        source.badge_code,
        definition.display_name,
        definition.display_priority,
        pg_catalog.count(*)::integer as source_count
      from public.hall_of_fame_badge_sources as source
      join public.hall_of_fame_badge_definitions as definition
        on definition.code = source.badge_code
       and definition.is_active
      join public.hall_of_fame_records as source_record
        on source_record.id = source.record_id
       and source_record.target_user_id = canonical.target_user_id
       and source_record.validity_status = 'active'
       and source_record.publication_status = 'published'
      join public.hall_of_fame_publication_consents as source_consent
        on source_consent.application_record_id = source_record.source_application_record_id
       and source_consent.target_user_id = source_record.target_user_id
       and source_consent.status = 'granted'
       and source_consent.policy_version is not null
       and source_consent.masked_display_name_consent
       and source_consent.record_date_consent
       and source_consent.course_detail_consent
       and source_consent.badge_consent
       and source_consent.consented_at is not null
       and source_consent.withdrawn_at is null
      where source.target_user_id = canonical.target_user_id
        and source.status = 'active'
      group by
        source.badge_code,
        definition.display_name,
        definition.display_priority
    ) as badge_count
  ) as public_badges on true
  where canonical.validity_status = 'active'
    and canonical.publication_status = 'published'
  order by canonical.played_on desc, canonical.approved_at desc, canonical.id desc
  limit p_limit
  offset p_offset;
end;
$$;

comment on function public.list_hall_of_fame_public_records(integer, integer) is
  'Anonymous-safe, consent-aware public HOF projection with no raw identifiers, evidence, internal review, audit, or ledger data.';

revoke all on function public.list_hall_of_fame_public_records(integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_hall_of_fame_public_records(integer, integer)
  to anon, authenticated;
