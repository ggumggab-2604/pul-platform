-- PUL 8-6-C-1A: authenticated member HOF own-read and safe dispute targets.

create function private.hall_of_fame_allowed_dispute_types(
  p_actor_user_id uuid,
  p_target_kind text,
  p_target_id uuid,
  p_subject_user_id uuid,
  p_source_submitter_user_id uuid,
  p_target_status text,
  p_batch_status text default null
)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_candidates text[] := array[]::text[];
  v_actor_is_active boolean := false;
begin
  if p_actor_user_id is null
     or p_target_kind not in ('application_record', 'canonical_record')
     or p_target_id is null
     or p_subject_user_id is null
     or p_source_submitter_user_id is null then
    return array[]::text[];
  end if;

  select exists (
    select 1
    from public.user_accounts as account
    where account.id = p_actor_user_id
      and account.account_status = 'active'
  )
  into v_actor_is_active;

  if not v_actor_is_active then
    return array[]::text[];
  end if;

  if p_target_kind = 'application_record' then
    if p_target_status = 'rejected'
       and p_batch_status in ('rejected', 'partially_approved')
       and p_actor_user_id in (
         p_subject_user_id,
         p_source_submitter_user_id
       ) then
      v_candidates := array['decision_appeal']::text[];
    end if;
  elsif p_target_status in ('active', 'corrected', 'revoked') then
    if p_actor_user_id in (
      p_subject_user_id,
      p_source_submitter_user_id
    ) then
      v_candidates := pg_catalog.array_append(
        v_candidates,
        'correction_request'
      );
    end if;

    if p_target_status = 'revoked'
       and p_actor_user_id = p_subject_user_id then
      v_candidates := pg_catalog.array_append(
        v_candidates,
        'decision_appeal'
      );
    end if;

    if p_actor_user_id = p_subject_user_id then
      v_candidates := pg_catalog.array_append(
        v_candidates,
        'subject_objection'
      );
    else
      v_candidates := pg_catalog.array_append(
        v_candidates,
        'fraud_report'
      );
    end if;
  end if;

  return coalesce(
    (
      select pg_catalog.array_agg(candidate.dispute_type order by candidate.ordinality)
      from pg_catalog.unnest(v_candidates) with ordinality
        as candidate(dispute_type, ordinality)
      where not exists (
        select 1
        from public.hall_of_fame_disputes as dispute
        where dispute.submitted_by_user_id = p_actor_user_id
          and dispute.dispute_type = candidate.dispute_type
          and dispute.status in ('open', 'under_review')
          and (
            (
              p_target_kind = 'application_record'
              and dispute.application_record_id = p_target_id
            )
            or (
              p_target_kind = 'canonical_record'
              and dispute.canonical_record_id = p_target_id
            )
          )
      )
    ),
    array[]::text[]
  );
end;
$$;

comment on function private.hall_of_fame_allowed_dispute_types(
  uuid,
  text,
  uuid,
  uuid,
  uuid,
  text,
  text
) is
  'Projects the existing dispute submit eligibility and open-request duplicate rule for member own-read DTOs.';

revoke all on function private.hall_of_fame_allowed_dispute_types(
  uuid,
  text,
  uuid,
  uuid,
  uuid,
  text,
  text
) from public, anon, authenticated, service_role;

create function public.list_my_hall_of_fame_applications(
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  application_record_id uuid,
  application_type text,
  batch_status text,
  record_status text,
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
  club_name text,
  created_at timestamptz,
  submitted_at timestamptz,
  finalized_at timestamptz,
  is_submitter boolean,
  is_subject boolean,
  allowed_dispute_types text[],
  can_submit_dispute boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
begin
  if v_actor_user_id is null then
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
    application_record.id,
    batch.application_type,
    batch.status,
    application_record.review_status,
    application_record.record_type_code,
    record_type.display_name,
    round_snapshot.played_on,
    round_snapshot.course_name_snapshot,
    round_snapshot.course_region_snapshot,
    round_snapshot.course_environment,
    round_snapshot.course_layout_snapshot,
    application_record.course_segment_snapshot,
    application_record.hole_number,
    application_record.hole_par,
    application_record.strokes,
    club.name,
    application_record.created_at,
    batch.submitted_at,
    batch.finalized_at,
    batch.created_by_user_id = v_actor_user_id,
    application_record.target_user_id = v_actor_user_id,
    action.allowed_dispute_types,
    pg_catalog.cardinality(action.allowed_dispute_types) > 0
  from public.hall_of_fame_application_records as application_record
  join public.hall_of_fame_application_batches as batch
    on batch.id = application_record.application_batch_id
  join public.hall_of_fame_round_snapshots as round_snapshot
    on round_snapshot.id = application_record.round_snapshot_id
   and round_snapshot.application_batch_id = batch.id
  join public.hall_of_fame_record_type_definitions as record_type
    on record_type.code = application_record.record_type_code
  left join public.clubs as club
    on club.id = coalesce(
      batch.nominating_club_id,
      batch.vacancy_context_club_id
    )
  left join lateral (
    select private.hall_of_fame_allowed_dispute_types(
      v_actor_user_id,
      'application_record',
      application_record.id,
      application_record.target_user_id,
      batch.created_by_user_id,
      application_record.review_status,
      batch.status
    ) as allowed_dispute_types
  ) as action on true
  where batch.created_by_user_id = v_actor_user_id
     or application_record.target_user_id = v_actor_user_id
  order by
    coalesce(batch.submitted_at, application_record.created_at) desc,
    application_record.created_at desc,
    application_record.id desc
  limit p_limit
  offset p_offset;
end;
$$;

comment on function public.list_my_hall_of_fame_applications(integer, integer)
  is 'Returns authenticated submitter-or-subject HOF application record DTOs with safe dispute targets and no reviewer, evidence, audit, or ledger data.';

revoke all on function public.list_my_hall_of_fame_applications(integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_my_hall_of_fame_applications(integer, integer)
  to authenticated;

create function public.list_my_hall_of_fame_records(
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  canonical_record_id uuid,
  record_type_code text,
  record_type_name text,
  validity_status text,
  publication_status text,
  played_on date,
  course_name text,
  course_region text,
  course_environment text,
  course_layout text,
  course_segment text,
  hole_number integer,
  hole_par integer,
  strokes integer,
  club_name text,
  approved_at timestamptz,
  published_at timestamptz,
  is_submitter boolean,
  is_subject boolean,
  badges jsonb,
  allowed_dispute_types text[],
  can_submit_dispute boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
begin
  if v_actor_user_id is null then
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
    canonical.id,
    canonical.record_type_code,
    record_type.display_name,
    canonical.validity_status,
    canonical.publication_status,
    canonical.played_on,
    canonical.course_name_snapshot,
    canonical.course_region_snapshot,
    canonical.course_environment,
    canonical.course_layout_snapshot,
    canonical.course_segment_snapshot,
    canonical.hole_number,
    canonical.hole_par,
    canonical.strokes,
    club.name,
    canonical.approved_at,
    canonical.published_at,
    batch.created_by_user_id = v_actor_user_id,
    canonical.target_user_id = v_actor_user_id,
    coalesce(badge.badges, '[]'::jsonb),
    action.allowed_dispute_types,
    pg_catalog.cardinality(action.allowed_dispute_types) > 0
  from public.hall_of_fame_records as canonical
  join public.hall_of_fame_application_records as source_application_record
    on source_application_record.id = canonical.source_application_record_id
   and source_application_record.target_user_id = canonical.target_user_id
  join public.hall_of_fame_application_batches as batch
    on batch.id = source_application_record.application_batch_id
  join public.hall_of_fame_record_type_definitions as record_type
    on record_type.code = canonical.record_type_code
  left join public.clubs as club
    on club.id = canonical.nominating_club_id
  left join lateral (
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'code', badge_source.badge_code,
        'name', badge_definition.display_name,
        'status', badge_source.status
      )
      order by
        badge_definition.display_priority,
        badge_source.badge_code
    ) as badges
    from public.hall_of_fame_badge_sources as badge_source
    join public.hall_of_fame_badge_definitions as badge_definition
      on badge_definition.code = badge_source.badge_code
    where badge_source.record_id = canonical.id
      and badge_source.target_user_id = canonical.target_user_id
  ) as badge on true
  left join lateral (
    select private.hall_of_fame_allowed_dispute_types(
      v_actor_user_id,
      'canonical_record',
      canonical.id,
      canonical.target_user_id,
      batch.created_by_user_id,
      canonical.validity_status,
      batch.status
    ) as allowed_dispute_types
  ) as action on true
  where canonical.target_user_id = v_actor_user_id
     or batch.created_by_user_id = v_actor_user_id
  order by canonical.played_on desc, canonical.approved_at desc, canonical.id desc
  limit p_limit
  offset p_offset;
end;
$$;

comment on function public.list_my_hall_of_fame_records(integer, integer)
  is 'Returns authenticated submitter-or-subject canonical HOF DTOs with status-aware badges and safe dispute targets, excluding private lifecycle reasons and operator data.';

revoke all on function public.list_my_hall_of_fame_records(integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_my_hall_of_fame_records(integer, integer)
  to authenticated;
