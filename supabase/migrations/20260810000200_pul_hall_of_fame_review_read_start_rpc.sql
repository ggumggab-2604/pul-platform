-- PUL 8-6-B-3-1: protected Hall of Fame review reads, review start,
-- internal notes, and moderator evidence-read authorization.
-- Additional information, resubmission, withdrawal, final decisions,
-- canonical records, badges, public projections, notifications, and UI remain deferred.

alter table public.hall_of_fame_application_reviews
  drop constraint hall_of_fame_application_reviews_action_check;

alter table public.hall_of_fame_application_reviews
  add constraint hall_of_fame_application_reviews_action_check
  check (
    review_action in (
      'review_started',
      'review_note_added',
      'additional_info_requested',
      'approval_recommended',
      'rejection_recommended',
      'final_approved',
      'final_rejected',
      'cancelled'
    )
  );

create function private.require_hall_of_fame_platform_permission(
  p_actor_user_id uuid,
  p_permission_code text
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_platform_role text;
begin
  if p_actor_user_id is null
     or p_permission_code is null
     or auth.uid() is distinct from p_actor_user_id then
    raise exception 'HOF_REVIEW_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  select account.platform_role
    into v_platform_role
  from public.user_accounts as account
  where account.id = p_actor_user_id
    and account.account_status = 'active'
    and account.platform_role in ('platform_moderator', 'platform_admin')
    and exists (
      select 1
      from public.platform_role_permissions as mapping
      join public.platform_permission_definitions as permission
        on permission.code = mapping.permission_code
       and permission.is_active
      where mapping.platform_role = account.platform_role
        and mapping.permission_code = p_permission_code
    );

  if not found then
    raise exception 'HOF_REVIEW_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  return v_platform_role;
end;
$$;

comment on function private.require_hall_of_fame_platform_permission(uuid, text)
  is 'Returns the current active moderator/admin role only after an exact platform permission check bound to auth.uid().';

revoke all on function private.require_hall_of_fame_platform_permission(uuid, text)
  from public, anon, authenticated, service_role;

create function private.enforce_guarded_hall_of_fame_review_mutation()
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
      pg_catalog.current_setting('pul.hall_of_fame.actor_user_id', true),
      ''
    )::uuid;
    v_request := nullif(
      pg_catalog.current_setting('pul.hall_of_fame.request_id', true),
      ''
    )::uuid;
    v_batch := nullif(
      pg_catalog.current_setting(
        'pul.hall_of_fame.application_batch_id',
        true
      ),
      ''
    )::uuid;
    v_record := nullif(
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
  v_fingerprint := nullif(
    pg_catalog.current_setting(
      'pul.hall_of_fame.payload_fingerprint',
      true
    ),
    ''
  );

  if v_actor is null
     or v_request is null
     or v_batch is null
     or v_record is not null
     or v_operation not in (
       'hall_of_fame.application.review.start',
       'hall_of_fame.application.review.note'
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
       or old.application_batch_id <> v_batch
       or old.application_record_id is not null
       or old.target_user_id is not null
       or pg_catalog.encode(old.payload_fingerprint, 'hex') <> v_fingerprint
       or new.id <> old.id
       or new.actor_user_id <> old.actor_user_id
       or new.request_id <> old.request_id
       or new.operation <> old.operation
       or new.application_batch_id <> old.application_batch_id
       or new.application_record_id is not null
       or new.target_user_id is not null
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
    if v_operation <> 'hall_of_fame.application.review.start'
       or tg_op <> 'UPDATE'
       or old.id <> v_batch
       or new.id <> old.id
       or new.application_type <> old.application_type
       or new.created_by_user_id <> old.created_by_user_id
       or new.created_by_membership_id is distinct from old.created_by_membership_id
       or new.nominating_club_id is distinct from old.nominating_club_id
       or new.vacancy_context_club_id is distinct from old.vacancy_context_club_id
       or new.submitted_at is distinct from old.submitted_at
       or new.finalized_at is not null
       or new.created_at <> old.created_at
       or old.status <> 'submitted'
       or new.status <> 'under_review'
       or new.version <> old.version + 1 then
      raise exception 'HOF_APPLICATION_BATCH_CONTEXT_MISMATCH'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_table_schema = 'public'
     and tg_table_name = 'hall_of_fame_application_records' then
    if v_operation <> 'hall_of_fame.application.review.start'
       or tg_op <> 'UPDATE'
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
       or old.review_status <> 'submitted'
       or new.review_status <> 'under_review'
       or new.version <> old.version + 1 then
      raise exception 'HOF_APPLICATION_RECORD_CONTEXT_MISMATCH'
        using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'HOF_MUTATION_RPC_REQUIRED' using errcode = '42501';
end;
$$;

comment on function private.enforce_guarded_hall_of_fame_review_mutation()
  is 'Admits only ledger-bound review-start batch/record changes and review request ledger completion.';

revoke all on function private.enforce_guarded_hall_of_fame_review_mutation()
  from public, anon, authenticated, service_role;

create function private.enforce_hall_of_fame_review_history_append()
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
  v_current_status text;
  v_current_version integer;
  v_platform_role text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    raise exception 'HOF_APPEND_ONLY_MUTATION_FORBIDDEN' using errcode = '42501';
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
    v_batch := nullif(
      pg_catalog.current_setting(
        'pul.hall_of_fame.application_batch_id',
        true
      ),
      ''
    )::uuid;
    v_record := nullif(
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

  select account.platform_role
    into v_platform_role
  from public.user_accounts as account
  where account.id = v_actor
    and account.account_status = 'active'
    and account.platform_role in ('platform_moderator', 'platform_admin');

  if v_actor is null
     or v_request is null
     or v_batch is null
     or v_record is not null
     or v_operation <> 'hall_of_fame.application.review.start'
     or auth.uid() is distinct from v_actor
     or not private.hall_of_fame_mutation_context_is_valid()
     or v_platform_role is null
     or new.actor_user_id <> v_actor
     or new.request_id <> v_request
     or new.application_batch_id <> v_batch
     or new.action <> v_operation
     or new.actor_membership_id is not null
     or new.actor_platform_role <> v_platform_role
     or new.reason is not null
     or new.from_status <> 'submitted'
     or new.to_status <> 'under_review' then
    raise exception 'HOF_APPLICATION_HISTORY_CONTEXT_MISMATCH'
      using errcode = '42501';
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
     or v_current_status <> 'under_review'
     or new.version <> v_current_version
     or not exists (
       select 1
       from public.hall_of_fame_application_history as previous_history
       where previous_history.scope = new.scope
         and previous_history.application_batch_id = new.application_batch_id
         and previous_history.application_record_id
               is not distinct from new.application_record_id
         and previous_history.version = new.version - 1
         and previous_history.to_status = 'submitted'
     ) then
    raise exception 'HOF_APPLICATION_HISTORY_CHAIN_MISMATCH'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function private.enforce_hall_of_fame_review_history_append()
  is 'Admits only chain-valid submitted-to-under-review batch and record history for the exact review-start request.';

revoke all on function private.enforce_hall_of_fame_review_history_append()
  from public, anon, authenticated, service_role;

create function private.enforce_hall_of_fame_review_append()
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
      pg_catalog.current_setting('pul.hall_of_fame.actor_user_id', true),
      ''
    )::uuid;
    v_request := nullif(
      pg_catalog.current_setting('pul.hall_of_fame.request_id', true),
      ''
    )::uuid;
    v_batch := nullif(
      pg_catalog.current_setting(
        'pul.hall_of_fame.application_batch_id',
        true
      ),
      ''
    )::uuid;
    v_record := nullif(
      pg_catalog.current_setting(
        'pul.hall_of_fame.application_record_id',
        true
      ),
      ''
    )::uuid;
  exception
    when invalid_text_representation then
      raise exception 'HOF_INVALID_REVIEW_CONTEXT' using errcode = '42501';
  end;

  v_operation := nullif(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true),
    ''
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
     or v_record is not null
     or v_operation not in (
       'hall_of_fame.application.review.start',
       'hall_of_fame.application.review.note'
     )
     or auth.uid() is distinct from v_actor
     or not private.hall_of_fame_mutation_context_is_valid()
     or v_platform_role is null
     or new.application_batch_id <> v_batch
     or new.application_record_id is not null
     or new.reviewer_user_id <> v_actor
     or new.reviewer_platform_role <> v_platform_role
     or new.request_id <> v_request
     or new.recommendation is not null
     or new.duplicate_suspected
     or new.conflict_declared then
    raise exception 'HOF_REVIEW_CONTEXT_MISMATCH' using errcode = '42501';
  end if;

  if v_operation = 'hall_of_fame.application.review.start' then
    if new.review_action <> 'review_started'
       or new.internal_note is not null then
      raise exception 'HOF_REVIEW_CONTEXT_MISMATCH' using errcode = '42501';
    end if;
  elsif new.review_action <> 'review_note_added'
        or new.internal_note is null
        or new.internal_note <> pg_catalog.btrim(new.internal_note)
        or new.internal_note = ''
        or pg_catalog.char_length(new.internal_note) > 2000 then
    raise exception 'HOF_REVIEW_CONTEXT_MISMATCH' using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function private.enforce_hall_of_fame_review_append()
  is 'Admits only exact ledger-bound review-start and moderator-only internal-note events while preserving append-only review rows.';

revoke all on function private.enforce_hall_of_fame_review_append()
  from public, anon, authenticated, service_role;

-- Extend the effective trigger routing without replacing any approved evidence
-- or submit guard. Unknown operations remain deny-by-default.
drop trigger hall_of_fame_application_batches_guard_before_mutation
  on public.hall_of_fame_application_batches;
create trigger hall_of_fame_application_batches_guard_before_mutation
before insert or update or delete on public.hall_of_fame_application_batches
for each row when (
  coalesce(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true),
    ''
  ) not like 'hall_of_fame.evidence.%'
  and coalesce(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true),
    ''
  ) <> 'hall_of_fame.application.submit'
  and coalesce(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true),
    ''
  ) not in (
    'hall_of_fame.application.review.start',
    'hall_of_fame.application.review.note'
  )
) execute function private.reject_hall_of_fame_mutation();
create trigger hall_of_fame_application_batches_review_guard_before_mutation
before insert or update or delete on public.hall_of_fame_application_batches
for each row when (
  coalesce(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true),
    ''
  ) in (
    'hall_of_fame.application.review.start',
    'hall_of_fame.application.review.note'
  )
) execute function private.enforce_guarded_hall_of_fame_review_mutation();

drop trigger hall_of_fame_application_records_guard_before_mutation
  on public.hall_of_fame_application_records;
create trigger hall_of_fame_application_records_guard_before_mutation
before insert or update or delete on public.hall_of_fame_application_records
for each row when (
  coalesce(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true),
    ''
  ) not like 'hall_of_fame.evidence.%'
  and coalesce(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true),
    ''
  ) <> 'hall_of_fame.application.submit'
  and coalesce(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true),
    ''
  ) not in (
    'hall_of_fame.application.review.start',
    'hall_of_fame.application.review.note'
  )
) execute function private.reject_hall_of_fame_mutation();
create trigger hall_of_fame_application_records_review_guard_before_mutation
before insert or update or delete on public.hall_of_fame_application_records
for each row when (
  coalesce(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true),
    ''
  ) in (
    'hall_of_fame.application.review.start',
    'hall_of_fame.application.review.note'
  )
) execute function private.enforce_guarded_hall_of_fame_review_mutation();

drop trigger hall_of_fame_mutation_requests_guard_before_mutation
  on private.hall_of_fame_mutation_requests;
create trigger hall_of_fame_mutation_requests_guard_before_mutation
before insert or update or delete on private.hall_of_fame_mutation_requests
for each row when (
  coalesce(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true),
    ''
  ) not like 'hall_of_fame.evidence.%'
  and coalesce(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true),
    ''
  ) <> 'hall_of_fame.application.submit'
  and coalesce(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true),
    ''
  ) not in (
    'hall_of_fame.application.review.start',
    'hall_of_fame.application.review.note'
  )
) execute function private.reject_hall_of_fame_mutation();
create trigger hall_of_fame_mutation_requests_review_guard_before_mutation
before insert or update or delete on private.hall_of_fame_mutation_requests
for each row when (
  coalesce(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true),
    ''
  ) in (
    'hall_of_fame.application.review.start',
    'hall_of_fame.application.review.note'
  )
) execute function private.enforce_guarded_hall_of_fame_review_mutation();

drop trigger hall_of_fame_application_history_guard_before_mutation
  on public.hall_of_fame_application_history;
create trigger hall_of_fame_application_history_guard_before_mutation
before insert or update or delete on public.hall_of_fame_application_history
for each row when (
  coalesce(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true),
    ''
  ) not like 'hall_of_fame.evidence.%'
  and coalesce(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true),
    ''
  ) <> 'hall_of_fame.application.submit'
  and coalesce(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true),
    ''
  ) not in (
    'hall_of_fame.application.review.start',
    'hall_of_fame.application.review.note'
  )
) execute function private.reject_hall_of_fame_append_only_mutation();
create trigger hall_of_fame_application_history_review_guard_before_mutation
before insert or update or delete on public.hall_of_fame_application_history
for each row when (
  coalesce(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true),
    ''
  ) in (
    'hall_of_fame.application.review.start',
    'hall_of_fame.application.review.note'
  )
) execute function private.enforce_hall_of_fame_review_history_append();

drop trigger hall_of_fame_application_reviews_guard_before_mutation
  on public.hall_of_fame_application_reviews;
create trigger hall_of_fame_application_reviews_guard_before_mutation
before insert or update or delete on public.hall_of_fame_application_reviews
for each row when (
  coalesce(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true),
    ''
  ) not in (
    'hall_of_fame.application.review.start',
    'hall_of_fame.application.review.note'
  )
) execute function private.reject_hall_of_fame_append_only_mutation();
create trigger hall_of_fame_application_reviews_review_guard_before_mutation
before insert or update or delete on public.hall_of_fame_application_reviews
for each row when (
  coalesce(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true),
    ''
  ) in (
    'hall_of_fame.application.review.start',
    'hall_of_fame.application.review.note'
  )
) execute function private.enforce_hall_of_fame_review_append();

create function public.list_hall_of_fame_review_queue(
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  application_batch_id uuid,
  application_type text,
  review_status text,
  batch_version integer,
  submitted_at timestamptz,
  active_record_count bigint,
  nominating_club_id uuid,
  vacancy_context_club_id uuid,
  review_started_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
begin
  perform private.require_hall_of_fame_platform_permission(
    v_actor_user_id,
    'hall_of_fame.applications.read'
  );

  if p_limit is null
     or p_limit < 1
     or p_limit > 100
     or p_offset is null
     or p_offset < 0
     or p_offset > 10000 then
    raise exception 'HOF_INVALID_REVIEW_QUEUE_PAGE' using errcode = '22023';
  end if;

  return query
  select
    batch.id,
    batch.application_type,
    batch.status,
    batch.version,
    batch.submitted_at,
    (
      select pg_catalog.count(*)
      from public.hall_of_fame_application_records as record
      where record.application_batch_id = batch.id
        and record.review_status in (
          'submitted',
          'under_review',
          'additional_info_required'
        )
    ),
    batch.nominating_club_id,
    batch.vacancy_context_club_id,
    (
      select pg_catalog.max(review.created_at)
      from public.hall_of_fame_application_reviews as review
      where review.application_batch_id = batch.id
        and review.review_action = 'review_started'
    )
  from public.hall_of_fame_application_batches as batch
  where batch.status in (
    'submitted',
    'under_review',
    'additional_info_required'
  )
  order by batch.submitted_at, batch.id
  limit p_limit
  offset p_offset;
end;
$$;

comment on function public.list_hall_of_fame_review_queue(integer, integer)
  is 'Returns a bounded privacy-minimized Hall of Fame review queue to authorized platform reviewers.';

create function public.get_hall_of_fame_review_detail(
  p_application_batch_id uuid
)
returns table (
  application_batch jsonb,
  round_snapshot jsonb,
  application_records jsonb,
  review_events jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_batch public.hall_of_fame_application_batches%rowtype;
  v_batch_json jsonb;
  v_round_json jsonb;
  v_records_json jsonb;
  v_reviews_json jsonb;
begin
  perform private.require_hall_of_fame_platform_permission(
    v_actor_user_id,
    'hall_of_fame.applications.read'
  );

  if p_application_batch_id is null then
    raise exception 'HOF_INVALID_REVIEW_DETAIL_REQUEST' using errcode = '22023';
  end if;

  select batch.*
    into v_batch
  from public.hall_of_fame_application_batches as batch
  where batch.id = p_application_batch_id
    and batch.status in (
      'submitted',
      'under_review',
      'additional_info_required'
    );

  if not found then
    raise exception 'HOF_REVIEW_APPLICATION_NOT_FOUND';
  end if;

  v_batch_json := pg_catalog.jsonb_build_object(
    'application_batch_id', v_batch.id,
    'application_type', v_batch.application_type,
    'review_status', v_batch.status,
    'batch_version', v_batch.version,
    'submitted_at', v_batch.submitted_at,
    'nominating_club_id', v_batch.nominating_club_id,
    'vacancy_context_club_id', v_batch.vacancy_context_club_id
  );

  select pg_catalog.jsonb_build_object(
    'round_snapshot_id', round.id,
    'played_on', round.played_on,
    'started_at', round.started_at,
    'course_name', round.course_name_snapshot,
    'course_region', round.course_region_snapshot,
    'course_environment', round.course_environment,
    'course_layout', round.course_layout_snapshot,
    'round_type', round.round_type,
    'event_name', round.event_name_snapshot,
    'notes', round.notes
  )
    into v_round_json
  from public.hall_of_fame_round_snapshots as round
  where round.application_batch_id = p_application_batch_id;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'application_record_id', record.id,
        'target_user_id', record.target_user_id,
        'record_type_code', record.record_type_code,
        'course_segment', record.course_segment_snapshot,
        'hole_number', record.hole_number,
        'hole_par', record.hole_par,
        'strokes', record.strokes,
        'club_verification_status', record.club_verification_status,
        'member_consent_status', record.member_consent_status,
        'review_status', record.review_status,
        'conflict_of_interest', record.conflict_of_interest,
        'record_version', record.version,
        'application_consents', (
          select coalesce(
            pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'consent_purpose', consent.consent_purpose,
                'status', consent.status,
                'policy_version', consent.policy_version,
                'version', consent.version
              )
              order by consent.consent_purpose
            ),
            '[]'::jsonb
          )
          from public.hall_of_fame_application_consents as consent
          where consent.application_record_id = record.id
        ),
        'publication_consent', (
          select pg_catalog.jsonb_build_object(
            'status', publication.status,
            'display_name_consent', publication.display_name_consent,
            'masked_display_name_consent', publication.masked_display_name_consent,
            'full_display_name_consent', publication.full_display_name_consent,
            'avatar_consent', publication.avatar_consent,
            'club_name_consent', publication.club_name_consent,
            'record_date_consent', publication.record_date_consent,
            'course_detail_consent', publication.course_detail_consent,
            'badge_consent', publication.badge_consent,
            'policy_version', publication.policy_version,
            'version', publication.version
          )
          from public.hall_of_fame_publication_consents as publication
          where publication.application_record_id = record.id
        ),
        'valid_companion_count', (
          select pg_catalog.count(*)
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
        ),
        'confirmation_status_summary', (
          select pg_catalog.jsonb_build_object(
            'pending', pg_catalog.count(*) filter (where confirmation.status = 'pending'),
            'confirmed', pg_catalog.count(*) filter (where confirmation.status = 'confirmed'),
            'declined', pg_catalog.count(*) filter (where confirmation.status = 'declined'),
            'withdrawn', pg_catalog.count(*) filter (where confirmation.status = 'withdrawn'),
            'expired', pg_catalog.count(*) filter (where confirmation.status = 'expired')
          )
          from public.hall_of_fame_record_confirmations as confirmation
          where confirmation.application_record_id = record.id
        ),
        'evidence', (
          select coalesce(
            pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'evidence_id', evidence.id,
                'application_record_id', evidence.application_record_id,
                'evidence_type', evidence.evidence_type,
                'status', evidence.status,
                'verified_mime_type', evidence.mime_type,
                'verified_size_bytes', evidence.byte_size,
                'created_at', evidence.created_at,
                'finalized_at', evidence.finalized_at
              )
              order by evidence.created_at, evidence.id
            ),
            '[]'::jsonb
          )
          from public.hall_of_fame_evidence_files as evidence
          where evidence.application_batch_id = p_application_batch_id
            and evidence.application_record_id = record.id
        )
      )
      order by record.created_at, record.id
    ),
    '[]'::jsonb
  )
    into v_records_json
  from public.hall_of_fame_application_records as record
  where record.application_batch_id = p_application_batch_id;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'review_event_id', review.id,
        'application_record_id', review.application_record_id,
        'review_action', review.review_action,
        'reviewer_user_id', review.reviewer_user_id,
        'reviewer_platform_role', review.reviewer_platform_role,
        'recommendation', review.recommendation,
        'internal_note', review.internal_note,
        'duplicate_suspected', review.duplicate_suspected,
        'conflict_declared', review.conflict_declared,
        'created_at', review.created_at
      )
      order by review.created_at, review.id
    ),
    '[]'::jsonb
  )
    into v_reviews_json
  from public.hall_of_fame_application_reviews as review
  where review.application_batch_id = p_application_batch_id;

  return query select
    v_batch_json,
    v_round_json,
    v_records_json,
    v_reviews_json;
end;
$$;

comment on function public.get_hall_of_fame_review_detail(uuid)
  is 'Returns a minimal internal review DTO without Storage paths, hashes, signed URLs, contacts, or credentials.';

create function public.start_hall_of_fame_application_review(
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
  transitioned_record_count integer,
  review_started_at timestamptz,
  replayed boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_operation text := 'hall_of_fame.application.review.start';
  v_payload_fingerprint bytea;
  v_claim record;
  v_batch public.hall_of_fame_application_batches%rowtype;
  v_platform_role text;
  v_active_record_count integer;
  v_submitted_record_count integer;
  v_updated_record_count integer;
  v_new_batch_version integer;
  v_review_started_at timestamptz := pg_catalog.now();
  v_club_id uuid;
  v_result jsonb;
begin
  perform private.lock_active_hall_of_fame_actor(v_actor_user_id);

  if p_application_batch_id is null
     or p_expected_batch_version is null
     or p_expected_batch_version < 1
     or p_request_id is null then
    raise exception 'HOF_INVALID_REVIEW_START_REQUEST' using errcode = '22023';
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
      (v_claim.result_payload ->> 'transitioned_record_count')::integer,
      (v_claim.result_payload ->> 'review_started_at')::timestamptz,
      true;
    return;
  end if;

  v_platform_role := private.require_hall_of_fame_platform_permission(
    v_actor_user_id,
    'hall_of_fame.applications.review'
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
  if v_batch.status <> 'submitted' then
    raise exception 'HOF_APPLICATION_NOT_SUBMITTED' using errcode = 'PT409';
  end if;

  perform record.id
  from public.hall_of_fame_application_records as record
  where record.application_batch_id = p_application_batch_id
    and record.review_status <> 'withdrawn'
  order by record.id
  for update;

  select
    pg_catalog.count(*) filter (
      where record.review_status <> 'withdrawn'
    ),
    pg_catalog.count(*) filter (
      where record.review_status = 'submitted'
    )
    into v_active_record_count, v_submitted_record_count
  from public.hall_of_fame_application_records as record
  where record.application_batch_id = p_application_batch_id;

  if v_active_record_count < 1
     or v_submitted_record_count <> v_active_record_count then
    raise exception 'HOF_REVIEW_RECORD_STATE_MISMATCH' using errcode = 'PT409';
  end if;

  update public.hall_of_fame_application_batches as batch
  set
    status = 'under_review',
    version = batch.version + 1,
    updated_at = v_review_started_at
  where batch.id = p_application_batch_id
    and batch.status = 'submitted'
    and batch.version = p_expected_batch_version
  returning batch.version into v_new_batch_version;

  if not found then
    raise exception 'HOF_STALE_VERSION' using errcode = 'PT409';
  end if;

  update public.hall_of_fame_application_records as record
  set
    review_status = 'under_review',
    version = record.version + 1,
    updated_at = v_review_started_at
  where record.application_batch_id = p_application_batch_id
    and record.review_status = 'submitted';

  get diagnostics v_updated_record_count = row_count;
  if v_updated_record_count <> v_active_record_count then
    raise exception 'HOF_REVIEW_RECORD_COUNT_MISMATCH' using errcode = 'PT409';
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
    actor_platform_role,
    action,
    request_id
  ) values (
    'batch',
    p_application_batch_id,
    null,
    'submitted',
    'under_review',
    v_new_batch_version,
    v_actor_user_id,
    null,
    v_platform_role,
    v_operation,
    p_request_id
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
    actor_platform_role,
    action,
    request_id
  )
  select
    'record',
    record.application_batch_id,
    record.id,
    'submitted',
    'under_review',
    record.version,
    v_actor_user_id,
    null,
    v_platform_role,
    v_operation,
    p_request_id
  from public.hall_of_fame_application_records as record
  where record.application_batch_id = p_application_batch_id
    and record.review_status = 'under_review'
  order by record.id;

  insert into public.hall_of_fame_application_reviews (
    application_batch_id,
    application_record_id,
    review_action,
    reviewer_user_id,
    reviewer_platform_role,
    recommendation,
    internal_note,
    duplicate_suspected,
    conflict_declared,
    request_id,
    created_at
  ) values (
    p_application_batch_id,
    null,
    'review_started',
    v_actor_user_id,
    v_platform_role,
    null,
    null,
    false,
    false,
    p_request_id,
    v_review_started_at
  );

  v_club_id := coalesce(
    v_batch.nominating_club_id,
    v_batch.vacancy_context_club_id
  );

  insert into public.audit_logs (
    actor_id,
    actor_type,
    actor_role,
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
    case
      when v_platform_role = 'platform_admin' then 'admin'
      else 'moderator'
    end,
    v_platform_role,
    v_operation,
    'hall_of_fame_application_batch',
    p_application_batch_id::text,
    case when v_club_id is null then null else v_club_id::text end,
    pg_catalog.jsonb_build_object(
      'status', 'submitted',
      'version', p_expected_batch_version
    ),
    pg_catalog.jsonb_build_object(
      'status', 'under_review',
      'version', v_new_batch_version,
      'transitioned_record_count', v_updated_record_count
    ),
    pg_catalog.jsonb_build_object(
      'application_batch_id', p_application_batch_id
    ),
    p_request_id,
    'success'
  );

  v_result := pg_catalog.jsonb_build_object(
    'operation', v_operation,
    'application_batch_id', p_application_batch_id,
    'status', 'under_review',
    'batch_version', v_new_batch_version,
    'transitioned_record_count', v_updated_record_count,
    'review_started_at', v_review_started_at
  );

  perform private.complete_hall_of_fame_request(
    v_actor_user_id,
    p_request_id,
    v_operation,
    p_application_batch_id,
    null,
    v_payload_fingerprint,
    v_result
  );

  return query select
    p_request_id,
    v_operation,
    p_application_batch_id,
    'under_review'::text,
    v_new_batch_version,
    v_updated_record_count,
    v_review_started_at,
    false;
end;
$$;

comment on function public.start_hall_of_fame_application_review(uuid, integer, uuid)
  is 'Atomically starts non-exclusive review for one submitted HOF batch and all non-withdrawn submitted records.';

create function public.add_hall_of_fame_internal_review_note(
  p_application_batch_id uuid,
  p_expected_batch_version integer,
  p_note text,
  p_request_id uuid
)
returns table (
  request_id uuid,
  operation text,
  application_batch_id uuid,
  status text,
  batch_version integer,
  review_event_id uuid,
  review_created_at timestamptz,
  replayed boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_operation text := 'hall_of_fame.application.review.note';
  v_note text := case when p_note is null then null else pg_catalog.btrim(p_note) end;
  v_payload_fingerprint bytea;
  v_claim record;
  v_batch public.hall_of_fame_application_batches%rowtype;
  v_platform_role text;
  v_review_event_id uuid;
  v_review_created_at timestamptz := pg_catalog.now();
  v_club_id uuid;
  v_result jsonb;
begin
  perform private.lock_active_hall_of_fame_actor(v_actor_user_id);

  if p_application_batch_id is null
     or p_expected_batch_version is null
     or p_expected_batch_version < 1
     or p_request_id is null
     or v_note is null
     or v_note = ''
     or pg_catalog.char_length(v_note) > 2000 then
    raise exception 'HOF_INVALID_INTERNAL_REVIEW_NOTE' using errcode = '22023';
  end if;

  if v_note ~* '(signed[ _-]?url|access[ _-]?token|password|otp)' then
    raise exception 'HOF_INTERNAL_REVIEW_NOTE_SECRET_FORBIDDEN'
      using errcode = '22023';
  end if;

  v_payload_fingerprint := extensions.digest(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'application_batch_id', p_application_batch_id,
        'expected_batch_version', p_expected_batch_version,
        'note', v_note
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
      (v_claim.result_payload ->> 'review_event_id')::uuid,
      (v_claim.result_payload ->> 'review_created_at')::timestamptz,
      true;
    return;
  end if;

  v_platform_role := private.require_hall_of_fame_platform_permission(
    v_actor_user_id,
    'hall_of_fame.applications.review'
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
    raise exception 'HOF_INTERNAL_REVIEW_NOTE_STATE_INVALID'
      using errcode = 'PT409';
  end if;

  insert into public.hall_of_fame_application_reviews (
    application_batch_id,
    application_record_id,
    review_action,
    reviewer_user_id,
    reviewer_platform_role,
    recommendation,
    internal_note,
    duplicate_suspected,
    conflict_declared,
    request_id,
    created_at
  ) values (
    p_application_batch_id,
    null,
    'review_note_added',
    v_actor_user_id,
    v_platform_role,
    null,
    v_note,
    false,
    false,
    p_request_id,
    v_review_created_at
  )
  returning id into v_review_event_id;

  v_club_id := coalesce(
    v_batch.nominating_club_id,
    v_batch.vacancy_context_club_id
  );

  insert into public.audit_logs (
    actor_id,
    actor_type,
    actor_role,
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
    case
      when v_platform_role = 'platform_admin' then 'admin'
      else 'moderator'
    end,
    v_platform_role,
    v_operation,
    'hall_of_fame_application_batch',
    p_application_batch_id::text,
    case when v_club_id is null then null else v_club_id::text end,
    pg_catalog.jsonb_build_object(
      'status', v_batch.status,
      'version', v_batch.version
    ),
    pg_catalog.jsonb_build_object(
      'status', v_batch.status,
      'version', v_batch.version,
      'review_event_added', true
    ),
    pg_catalog.jsonb_build_object(
      'application_batch_id', p_application_batch_id,
      'review_event_id', v_review_event_id
    ),
    p_request_id,
    'success'
  );

  v_result := pg_catalog.jsonb_build_object(
    'operation', v_operation,
    'application_batch_id', p_application_batch_id,
    'status', v_batch.status,
    'batch_version', v_batch.version,
    'review_event_id', v_review_event_id,
    'review_created_at', v_review_created_at
  );

  perform private.complete_hall_of_fame_request(
    v_actor_user_id,
    p_request_id,
    v_operation,
    p_application_batch_id,
    null,
    v_payload_fingerprint,
    v_result
  );

  return query select
    p_request_id,
    v_operation,
    p_application_batch_id,
    v_batch.status,
    v_batch.version,
    v_review_event_id,
    v_review_created_at,
    false;
end;
$$;

comment on function public.add_hall_of_fame_internal_review_note(uuid, integer, text, uuid)
  is 'Appends one moderator/admin-only internal review note without changing application status or version.';

create or replace function public.get_hall_of_fame_evidence_read_context_server(
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
language plpgsql
volatile
security definer
set search_path = ''
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

  select evidence.*
    into v_evidence
  from public.hall_of_fame_evidence_files as evidence
  join public.hall_of_fame_application_batches as batch
    on batch.id = evidence.application_batch_id
  join public.hall_of_fame_application_records as record
    on record.id = evidence.application_record_id
   and record.application_batch_id = evidence.application_batch_id
  where evidence.id = p_evidence_id
  for share of evidence, batch, record;

  if found then
    select batch.*
      into v_batch
    from public.hall_of_fame_application_batches as batch
    where batch.id = v_evidence.application_batch_id;

    select record.*
      into v_record
    from public.hall_of_fame_application_records as record
    where record.id = v_evidence.application_record_id;
  end if;

  if not found or v_evidence.status <> 'available' then
    raise exception 'HOF_EVIDENCE_READ_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  if v_batch.application_type in (
       'direct_application',
       'club_admin_vacancy_direct_application'
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

  if not v_allowed
     and v_batch.status in (
       'submitted',
       'under_review',
       'additional_info_required'
     ) then
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
        and account.platform_role in ('platform_moderator', 'platform_admin')
        and mapping.permission_code = 'hall_of_fame.evidence.read'
    ) into v_allowed;
  end if;

  if not v_allowed then
    raise exception 'HOF_EVIDENCE_READ_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  return query select
    v_evidence.id,
    v_evidence.storage_bucket,
    v_evidence.storage_path,
    v_evidence.mime_type,
    v_evidence.byte_size,
    pg_catalog.encode(v_evidence.sha256, 'hex');
end;
$$;

comment on function public.get_hall_of_fame_evidence_read_context_server(uuid, uuid)
  is 'Service-only private signed-read context preserving owner paths and adding available-only review-state moderator authorization.';

revoke all on function public.list_hall_of_fame_review_queue(integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_hall_of_fame_review_queue(integer, integer)
  to authenticated;

revoke all on function public.get_hall_of_fame_review_detail(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_hall_of_fame_review_detail(uuid)
  to authenticated;

revoke all on function public.start_hall_of_fame_application_review(uuid, integer, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.start_hall_of_fame_application_review(uuid, integer, uuid)
  to authenticated;

revoke all on function public.add_hall_of_fame_internal_review_note(uuid, integer, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.add_hall_of_fame_internal_review_note(uuid, integer, text, uuid)
  to authenticated;

revoke all on function public.get_hall_of_fame_evidence_read_context_server(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_hall_of_fame_evidence_read_context_server(uuid, uuid)
  to service_role;
