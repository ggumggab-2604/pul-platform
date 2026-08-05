-- PUL 8-6-B-2A-6B: prevent PostgREST transaction retries for intentional HOF stale conflicts.
-- Historical migration 20260807000100 remains immutable; this forward correction
-- replaces the claim helper and the five effective authenticated HOF mutation RPC definitions.

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
  'Claims and row-locks a HOF request, replays a completed identical request, and rejects request ID reuse.';

revoke all on function private.hall_of_fame_claim_request(
  uuid, uuid, text, uuid, uuid, uuid, bytea
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
    raise exception
      using
        errcode = 'PT409',
        message = 'HOF_STALE_VERSION';
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
    raise exception
      using
        errcode = 'PT409',
        message = 'HOF_STALE_VERSION';
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
    raise exception
      using
        errcode = 'PT409',
        message = 'HOF_STALE_VERSION';
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
    raise exception
      using
        errcode = 'PT409',
        message = 'HOF_STALE_VERSION';
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
    raise exception
      using
        errcode = 'PT409',
        message = 'HOF_STALE_VERSION';
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
    raise exception
      using
        errcode = 'PT409',
        message = 'HOF_STALE_VERSION';
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
    raise exception
      using
        errcode = 'PT409',
        message = 'HOF_STALE_VERSION';
  end if;

  update public.hall_of_fame_application_batches as batch
  set version = batch.version + 1
  where batch.id = v_application_batch_id
    and batch.version = p_expected_batch_version
  returning batch.version into v_new_batch_version;
  if not found then
    raise exception
      using
        errcode = 'PT409',
        message = 'HOF_STALE_VERSION';
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
    raise exception
      using
        errcode = 'PT409',
        message = 'HOF_STALE_VERSION';
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
    raise exception
      using
        errcode = 'PT409',
        message = 'HOF_STALE_VERSION';
  end if;

  update public.hall_of_fame_application_records as record
  set
    review_status = 'withdrawn',
    version = record.version + 1
  where record.id = p_application_record_id
    and record.version = p_expected_record_version
  returning record.version into v_new_record_version;
  if not found then
    raise exception
      using
        errcode = 'PT409',
        message = 'HOF_STALE_VERSION';
  end if;

  update public.hall_of_fame_application_batches as batch
  set version = batch.version + 1
  where batch.id = v_application_batch_id
    and batch.version = p_expected_batch_version
  returning batch.version into v_new_batch_version;
  if not found then
    raise exception
      using
        errcode = 'PT409',
        message = 'HOF_STALE_VERSION';
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
    raise exception
      using
        errcode = 'PT409',
        message = 'HOF_STALE_VERSION';
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
    raise exception
      using
        errcode = 'PT409',
        message = 'HOF_STALE_VERSION';
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
