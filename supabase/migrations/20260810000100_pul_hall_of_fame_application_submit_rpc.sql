-- PUL 8-6-B-2B-3: atomic Hall of Fame application submission.
-- Review, resubmission, post-submit withdrawal, canonical records, badges,
-- notifications, and UI remain deferred.

create function private.enforce_guarded_hall_of_fame_submission_mutation()
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
     or v_operation <> 'hall_of_fame.application.submit'
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
    if tg_op <> 'UPDATE'
       or old.id <> v_batch
       or new.id <> old.id
       or new.application_type <> old.application_type
       or new.created_by_user_id <> old.created_by_user_id
       or new.created_by_membership_id is distinct from old.created_by_membership_id
       or new.nominating_club_id is distinct from old.nominating_club_id
       or new.vacancy_context_club_id is distinct from old.vacancy_context_club_id
       or new.created_at <> old.created_at
       or old.status <> 'draft'
       or new.status <> 'submitted'
       or new.version <> old.version + 1
       or old.submitted_at is not null
       or new.submitted_at is null
       or new.finalized_at is not null then
      raise exception 'HOF_APPLICATION_BATCH_CONTEXT_MISMATCH'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_table_schema = 'public'
     and tg_table_name = 'hall_of_fame_application_records' then
    if tg_op <> 'UPDATE'
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
       or old.review_status <> 'draft'
       or new.review_status <> 'submitted'
       or new.version <> old.version + 1 then
      raise exception 'HOF_APPLICATION_RECORD_CONTEXT_MISMATCH'
        using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'HOF_MUTATION_RPC_REQUIRED' using errcode = '42501';
end;
$$;

comment on function private.enforce_guarded_hall_of_fame_submission_mutation()
  is 'Admits only ledger-bound draft-to-submitted batch and record mutations for one authenticated submit RPC.';

revoke all on function private.enforce_guarded_hall_of_fame_submission_mutation()
  from public, anon, authenticated, service_role;

create function private.enforce_hall_of_fame_submission_history_append()
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
  v_expected_membership uuid;
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

  if v_actor is null
     or v_request is null
     or v_batch is null
     or v_record is not null
     or v_operation <> 'hall_of_fame.application.submit'
     or auth.uid() is distinct from v_actor
     or not private.hall_of_fame_mutation_context_is_valid()
     or new.actor_user_id <> v_actor
     or new.request_id <> v_request
     or new.application_batch_id <> v_batch
     or new.action <> v_operation
     or new.actor_platform_role is not null
     or new.reason is not null
     or new.from_status <> 'draft'
     or new.to_status <> 'submitted' then
    raise exception 'HOF_APPLICATION_HISTORY_CONTEXT_MISMATCH'
      using errcode = '42501';
  end if;

  select batch.created_by_membership_id
    into v_expected_membership
  from public.hall_of_fame_application_batches as batch
  where batch.id = v_batch
    and batch.created_by_user_id = v_actor;

  if not found
     or new.actor_membership_id is distinct from v_expected_membership then
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
     or v_current_status <> 'submitted'
     or new.version <> v_current_version
     or not exists (
       select 1
       from public.hall_of_fame_application_history as previous_history
       where previous_history.scope = new.scope
         and previous_history.application_batch_id = new.application_batch_id
         and previous_history.application_record_id
               is not distinct from new.application_record_id
         and previous_history.version = new.version - 1
         and previous_history.to_status = 'draft'
     ) then
    raise exception 'HOF_APPLICATION_HISTORY_CHAIN_MISMATCH'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function private.enforce_hall_of_fame_submission_history_append()
  is 'Admits only chain-valid batch and record submission history bound to the exact authenticated request ledger.';

revoke all on function private.enforce_hall_of_fame_submission_history_append()
  from public, anon, authenticated, service_role;

-- Route submit writes to narrow submit guards without changing the approved
-- B-2A/B-2B-1 guards or the B-2B-2 evidence guards.
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
) execute function private.reject_hall_of_fame_mutation();
create trigger hall_of_fame_application_batches_submit_guard_before_mutation
before insert or update or delete on public.hall_of_fame_application_batches
for each row when (
  coalesce(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true),
    ''
  ) = 'hall_of_fame.application.submit'
) execute function private.enforce_guarded_hall_of_fame_submission_mutation();

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
) execute function private.reject_hall_of_fame_mutation();
create trigger hall_of_fame_application_records_submit_guard_before_mutation
before insert or update or delete on public.hall_of_fame_application_records
for each row when (
  coalesce(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true),
    ''
  ) = 'hall_of_fame.application.submit'
) execute function private.enforce_guarded_hall_of_fame_submission_mutation();

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
) execute function private.reject_hall_of_fame_mutation();
create trigger hall_of_fame_mutation_requests_submit_guard_before_mutation
before insert or update or delete on private.hall_of_fame_mutation_requests
for each row when (
  coalesce(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true),
    ''
  ) = 'hall_of_fame.application.submit'
) execute function private.enforce_guarded_hall_of_fame_submission_mutation();

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
) execute function private.reject_hall_of_fame_append_only_mutation();
create trigger hall_of_fame_application_history_submit_guard_before_mutation
before insert or update or delete on public.hall_of_fame_application_history
for each row when (
  coalesce(
    pg_catalog.current_setting('pul.hall_of_fame.operation', true),
    ''
  ) = 'hall_of_fame.application.submit'
) execute function private.enforce_hall_of_fame_submission_history_append();

create function private.validate_hall_of_fame_application_submission(
  p_actor_user_id uuid,
  p_application_batch_id uuid
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_batch public.hall_of_fame_application_batches%rowtype;
  v_active_membership_count bigint := 0;
  v_suspended_membership_count bigint := 0;
  v_valid_admin_club_count bigint := 0;
  v_record_count integer := 0;
begin
  select batch.*
    into v_batch
  from public.hall_of_fame_application_batches as batch
  where batch.id = p_application_batch_id;

  if not found then
    raise exception 'HOF_APPLICATION_NOT_FOUND';
  end if;
  if v_batch.status <> 'draft' then
    raise exception 'HOF_APPLICATION_NOT_DRAFT' using errcode = 'PT409';
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
  into v_active_membership_count, v_suspended_membership_count
  from public.club_memberships as membership
  join public.clubs as club on club.id = membership.club_id
  where membership.user_id = p_actor_user_id;

  select pg_catalog.count(*)
    into v_valid_admin_club_count
  from public.club_memberships as membership
  join public.clubs as club
    on club.id = membership.club_id
   and club.club_status = 'active'
  where membership.user_id = p_actor_user_id
    and membership.membership_status = 'active'
    and private.count_active_club_admins(club.id) > 0;

  if v_batch.application_type = 'direct_application' then
    if v_batch.created_by_user_id <> p_actor_user_id
       or v_active_membership_count <> 0
       or v_suspended_membership_count <> 0 then
      raise exception 'HOF_ELIGIBILITY_CHANGED' using errcode = '42501';
    end if;
  elsif v_batch.application_type =
        'club_admin_vacancy_direct_application' then
    if v_batch.created_by_user_id <> p_actor_user_id
       or v_active_membership_count = 0
       or v_valid_admin_club_count <> 0
       or private.count_active_club_admins(v_batch.vacancy_context_club_id) <> 0
       or not exists (
         select 1
         from public.club_memberships as membership
         join public.clubs as club
           on club.id = membership.club_id
          and club.club_status = 'active'
         where membership.id = v_batch.created_by_membership_id
           and membership.user_id = p_actor_user_id
           and membership.club_id = v_batch.vacancy_context_club_id
           and membership.membership_status = 'active'
       ) then
      raise exception 'HOF_ELIGIBILITY_CHANGED' using errcode = '42501';
    end if;
  elsif v_batch.application_type = 'club_nomination' then
    if v_batch.created_by_user_id <> p_actor_user_id
       or not private.club_user_is_active_admin(
         p_actor_user_id,
         v_batch.nominating_club_id
       )
       or not private.club_user_has_permission(
         p_actor_user_id,
         v_batch.nominating_club_id,
         'club.achievement_applications.manage'
       ) then
      raise exception 'HOF_ELIGIBILITY_CHANGED' using errcode = '42501';
    end if;
  else
    raise exception 'HOF_INVALID_APPLICATION_CONTEXT' using errcode = '22023';
  end if;

  perform snapshot.id
  from public.hall_of_fame_round_snapshots as snapshot
  where snapshot.application_batch_id = p_application_batch_id
  for share;
  if not found then
    raise exception 'HOF_ROUND_SNAPSHOT_REQUIRED' using errcode = '22023';
  end if;

  perform record.id
  from public.hall_of_fame_application_records as record
  where record.application_batch_id = p_application_batch_id
  order by record.id
  for update;

  if exists (
    select 1
    from public.hall_of_fame_application_records as record
    where record.application_batch_id = p_application_batch_id
      and record.review_status not in ('draft', 'withdrawn')
  ) then
    raise exception 'HOF_APPLICATION_RECORD_NOT_EDITABLE' using errcode = 'PT409';
  end if;

  select pg_catalog.count(*)::integer
    into v_record_count
  from public.hall_of_fame_application_records as record
  where record.application_batch_id = p_application_batch_id
    and record.review_status = 'draft';

  if v_record_count = 0 then
    raise exception 'HOF_ACTIVE_APPLICATION_RECORD_REQUIRED'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.hall_of_fame_application_records as record
    left join public.hall_of_fame_record_type_definitions as definition
      on definition.code = record.record_type_code
    where record.application_batch_id = p_application_batch_id
      and record.review_status = 'draft'
      and (
        definition.code is null
        or not definition.is_active
        or record.duplicate_fingerprint is null
        or pg_catalog.octet_length(record.duplicate_fingerprint) <> 32
        or not (
          (
            definition.qualification_kind = 'single_hole_score'
            and record.strokes = definition.qualification_value
          )
          or (
            definition.qualification_kind = 'relative_to_par'
            and record.hole_par is not null
            and record.strokes is not null
            and record.hole_par - record.strokes
                  >= definition.qualification_value
          )
        )
      )
  ) then
    raise exception 'HOF_RECORD_SUBMISSION_REQUIREMENTS_NOT_MET'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.hall_of_fame_application_records as record
    left join public.user_accounts as account
      on account.id = record.target_user_id
     and account.account_status = 'active'
    where record.application_batch_id = p_application_batch_id
      and record.review_status = 'draft'
      and account.id is null
  ) then
    raise exception 'HOF_TARGET_NOT_ACTIVE_MEMBER' using errcode = '42501';
  end if;

  if v_batch.application_type = 'direct_application' and exists (
    select 1
    from public.hall_of_fame_application_records as record
    where record.application_batch_id = p_application_batch_id
      and record.review_status = 'draft'
      and (
        record.target_user_id <> p_actor_user_id
        or record.target_membership_id is not null
      )
  ) then
    raise exception 'HOF_ELIGIBILITY_CHANGED' using errcode = '42501';
  end if;

  if v_batch.application_type =
       'club_admin_vacancy_direct_application' and exists (
    select 1
    from public.hall_of_fame_application_records as record
    left join public.club_memberships as membership
      on membership.id = record.target_membership_id
     and membership.user_id = record.target_user_id
     and membership.club_id = v_batch.vacancy_context_club_id
     and membership.membership_status = 'active'
    where record.application_batch_id = p_application_batch_id
      and record.review_status = 'draft'
      and (
        record.target_user_id <> p_actor_user_id
        or record.target_membership_id
              is distinct from v_batch.created_by_membership_id
        or membership.id is null
      )
  ) then
    raise exception 'HOF_ELIGIBILITY_CHANGED' using errcode = '42501';
  end if;

  if v_batch.application_type = 'club_nomination' and exists (
    select 1
    from public.hall_of_fame_application_records as record
    where record.application_batch_id = p_application_batch_id
      and record.review_status = 'draft'
      and record.target_user_id = p_actor_user_id
  ) then
    raise exception 'HOF_NOMINATION_SELF_TARGET_NOT_ALLOWED'
      using errcode = '22023';
  end if;

  if v_batch.application_type = 'club_nomination' and exists (
    select 1
    from public.hall_of_fame_application_records as record
    left join public.club_memberships as membership
      on membership.id = record.target_membership_id
     and membership.user_id = record.target_user_id
     and membership.club_id = v_batch.nominating_club_id
     and membership.membership_status = 'active'
    where record.application_batch_id = p_application_batch_id
      and record.review_status = 'draft'
      and membership.id is null
  ) then
    raise exception 'HOF_ELIGIBILITY_CHANGED' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.hall_of_fame_application_records as record
    join public.hall_of_fame_application_records as existing
      on existing.id <> record.id
     and existing.duplicate_fingerprint = record.duplicate_fingerprint
     and existing.fingerprint_version = record.fingerprint_version
     and existing.review_status in (
       'submitted',
       'under_review',
       'additional_info_required',
       'approved'
     )
    where record.application_batch_id = p_application_batch_id
      and record.review_status = 'draft'
  ) then
    raise exception 'HOF_DUPLICATE_RECORD' using errcode = 'PT409';
  end if;

  perform consent.id
  from public.hall_of_fame_application_consents as consent
  join public.hall_of_fame_application_records as record
    on record.id = consent.application_record_id
   and record.application_batch_id = consent.application_batch_id
  where record.application_batch_id = p_application_batch_id
    and record.review_status = 'draft'
  order by consent.application_record_id, consent.consent_purpose
  for share of consent;

  if exists (
    select 1
    from public.hall_of_fame_application_records as record
    cross join lateral (
      select purpose.consent_purpose
      from (
        values
          ('application_processing'::text),
          ('evidence_review'::text),
          ('nomination_acceptance'::text)
      ) as purpose(consent_purpose)
      where purpose.consent_purpose <> 'nomination_acceptance'
         or v_batch.application_type = 'club_nomination'
    ) as required
    where record.application_batch_id = p_application_batch_id
      and record.review_status = 'draft'
      and not exists (
        select 1
        from public.hall_of_fame_application_consents as consent
        where consent.application_record_id = record.id
          and consent.application_batch_id = p_application_batch_id
          and consent.subject_user_id = record.target_user_id
          and consent.consent_purpose = required.consent_purpose
          and consent.status = 'granted'
          and consent.policy_version = pg_catalog.btrim(consent.policy_version)
          and consent.policy_version <> ''
          and (
            consent.consent_purpose <> 'nomination_acceptance'
            or consent.expires_at > pg_catalog.now()
          )
      )
  ) then
    raise exception 'HOF_REQUIRED_APPLICATION_CONSENT_MISSING'
      using errcode = '22023';
  end if;

  perform publication.application_record_id
  from public.hall_of_fame_publication_consents as publication
  join public.hall_of_fame_application_records as record
    on record.id = publication.application_record_id
  where record.application_batch_id = p_application_batch_id
    and record.review_status = 'draft'
  order by publication.application_record_id
  for share of publication;

  if exists (
    select 1
    from public.hall_of_fame_application_records as record
    where record.application_batch_id = p_application_batch_id
      and record.review_status = 'draft'
      and not exists (
        select 1
        from public.hall_of_fame_publication_consents as publication
        where publication.application_record_id = record.id
          and publication.target_user_id = record.target_user_id
          and publication.status = 'granted'
          and publication.policy_version is not null
          and publication.policy_version =
                pg_catalog.btrim(publication.policy_version)
          and publication.masked_display_name_consent
          and publication.record_date_consent
          and publication.course_detail_consent
      )
  ) then
    raise exception 'HOF_PUBLICATION_CONSENT_REQUIRED'
      using errcode = '22023';
  end if;

  perform confirmation.id
  from public.hall_of_fame_record_confirmations as confirmation
  join public.hall_of_fame_application_records as record
    on record.id = confirmation.application_record_id
  where record.application_batch_id = p_application_batch_id
    and record.review_status = 'draft'
  order by confirmation.application_record_id, confirmation.id
  for share of confirmation;

  if exists (
    select 1
    from public.hall_of_fame_application_records as record
    where record.application_batch_id = p_application_batch_id
      and record.review_status = 'draft'
      and not exists (
        select 1
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
      )
  ) then
    raise exception 'HOF_MEMBER_COMPANION_CONFIRMATION_REQUIRED'
      using errcode = '22023';
  end if;

  perform evidence.id
  from public.hall_of_fame_evidence_files as evidence
  where evidence.application_batch_id = p_application_batch_id
  order by evidence.application_record_id nulls first, evidence.id
  for share;

  if exists (
    select 1
    from public.hall_of_fame_evidence_files as evidence
    where evidence.application_batch_id = p_application_batch_id
      and evidence.status in ('pending_upload', 'uploaded_unverified')
  ) then
    raise exception 'HOF_UNRESOLVED_EVIDENCE' using errcode = 'PT409';
  end if;

  if exists (
    select 1
    from public.hall_of_fame_application_records as record
    where record.application_batch_id = p_application_batch_id
      and record.review_status = 'draft'
      and not exists (
        select 1
        from public.hall_of_fame_evidence_files as evidence
        where evidence.application_batch_id = p_application_batch_id
          and evidence.application_record_id = record.id
          and evidence.evidence_type = 'scorecard'
          and evidence.status = 'available'
          and evidence.finalized_at is not null
          and evidence.byte_size between 1 and 10485760
          and evidence.declared_byte_size = evidence.byte_size
          and evidence.mime_type in (
            'image/jpeg',
            'image/png',
            'image/webp',
            'application/pdf'
          )
          and evidence.declared_mime_type = evidence.mime_type
          and pg_catalog.octet_length(evidence.sha256) = 32
          and evidence.deleted_at is null
          and evidence.storage_deleted_at is null
          and evidence.replaced_by_evidence_id is null
      )
  ) then
    raise exception 'HOF_SCORECARD_EVIDENCE_REQUIRED'
      using errcode = '22023';
  end if;

  return v_record_count;
end;
$$;

comment on function private.validate_hall_of_fame_application_submission(
  uuid,
  uuid
) is
  'Validates current eligibility, round, records, consents, member confirmation, and finalized scorecard evidence without Storage network access.';

revoke all on function private.validate_hall_of_fame_application_submission(
  uuid,
  uuid
) from public, anon, authenticated, service_role;

create function public.submit_hall_of_fame_application(
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
  submitted_at timestamptz,
  submitted_record_count integer,
  replayed boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_operation text := 'hall_of_fame.application.submit';
  v_payload_fingerprint bytea;
  v_claim record;
  v_batch public.hall_of_fame_application_batches%rowtype;
  v_actor_membership_id uuid;
  v_submitted_at timestamptz := pg_catalog.now();
  v_record_count integer;
  v_updated_record_count integer;
  v_new_batch_version integer;
  v_club_id uuid;
  v_result jsonb;
begin
  perform private.lock_active_hall_of_fame_actor(v_actor_user_id);

  if p_application_batch_id is null
     or p_expected_batch_version is null
     or p_expected_batch_version < 1
     or p_request_id is null then
    raise exception 'HOF_INVALID_SUBMISSION_REQUEST' using errcode = '22023';
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
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_application_batch_id::text, 8610)
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
      (v_claim.result_payload ->> 'submitted_at')::timestamptz,
      (v_claim.result_payload ->> 'submitted_record_count')::integer,
      true;
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
    raise exception 'HOF_APPLICATION_NOT_DRAFT' using errcode = 'PT409';
  end if;
  if v_batch.version <> p_expected_batch_version then
    raise exception 'HOF_STALE_VERSION' using errcode = 'PT409';
  end if;

  v_actor_membership_id :=
    private.lock_and_authorize_hall_of_fame_batch_edit(
      v_actor_user_id,
      p_application_batch_id
    );

  v_record_count := private.validate_hall_of_fame_application_submission(
    v_actor_user_id,
    p_application_batch_id
  );

  update public.hall_of_fame_application_batches as batch
  set
    status = 'submitted',
    version = batch.version + 1,
    submitted_at = v_submitted_at,
    updated_at = v_submitted_at
  where batch.id = p_application_batch_id
    and batch.status = 'draft'
    and batch.version = p_expected_batch_version
  returning batch.version into v_new_batch_version;

  if not found then
    raise exception 'HOF_STALE_VERSION' using errcode = 'PT409';
  end if;

  begin
    update public.hall_of_fame_application_records as record
    set
      review_status = 'submitted',
      version = record.version + 1,
      updated_at = v_submitted_at
    where record.application_batch_id = p_application_batch_id
      and record.review_status = 'draft';
  exception
    when unique_violation then
      raise exception 'HOF_DUPLICATE_RECORD' using errcode = 'PT409';
  end;

  get diagnostics v_updated_record_count = row_count;
  if v_updated_record_count <> v_record_count then
    raise exception 'HOF_SUBMISSION_RECORD_COUNT_MISMATCH'
      using errcode = 'PT409';
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
  ) values (
    'batch',
    p_application_batch_id,
    null,
    'draft',
    'submitted',
    v_new_batch_version,
    v_actor_user_id,
    v_actor_membership_id,
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
    action,
    request_id
  )
  select
    'record',
    record.application_batch_id,
    record.id,
    'draft',
    'submitted',
    record.version,
    v_actor_user_id,
    v_actor_membership_id,
    v_operation,
    p_request_id
  from public.hall_of_fame_application_records as record
  where record.application_batch_id = p_application_batch_id
    and record.review_status = 'submitted'
  order by record.id;

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
    metadata,
    request_id,
    outcome
  ) values (
    v_actor_user_id,
    'user',
    v_operation,
    'hall_of_fame_application_batch',
    p_application_batch_id::text,
    case when v_club_id is null then null else v_club_id::text end,
    pg_catalog.jsonb_build_object(
      'status', 'draft',
      'version', p_expected_batch_version
    ),
    pg_catalog.jsonb_build_object(
      'status', 'submitted',
      'version', v_new_batch_version,
      'submitted_record_count', v_record_count
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
    'status', 'submitted',
    'batch_version', v_new_batch_version,
    'submitted_at', v_submitted_at,
    'submitted_record_count', v_record_count
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
    'submitted'::text,
    v_new_batch_version,
    v_submitted_at,
    v_record_count,
    false;
end;
$$;

comment on function public.submit_hall_of_fame_application(
  uuid,
  integer,
  uuid
) is
  'Atomically revalidates and submits one complete HOF draft without starting review or calling Storage.';

revoke all on function public.submit_hall_of_fame_application(
  uuid,
  integer,
  uuid
) from public, anon, authenticated, service_role;
grant execute on function public.submit_hall_of_fame_application(
  uuid,
  integer,
  uuid
) to authenticated;
