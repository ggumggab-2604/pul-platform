-- PUL 8-6-C-2R: reviewer-only canonical resolution context for dispute UI.

create function public.get_hall_of_fame_dispute_resolution_context(
  p_dispute_id uuid
)
returns table (
  dispute_id uuid,
  dispute_type text,
  dispute_version integer,
  canonical_record_id uuid,
  canonical_record_version integer,
  record_type_code text,
  played_on date,
  course_name_snapshot text,
  course_region_snapshot text,
  course_environment text,
  course_layout_snapshot text,
  course_segment_snapshot text,
  hole_number integer,
  hole_par integer,
  strokes integer,
  nominating_club_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_dispute public.hall_of_fame_disputes%rowtype;
  v_canonical public.hall_of_fame_records%rowtype;
begin
  perform private.require_hall_of_fame_platform_permission(
    v_actor,
    'hall_of_fame.disputes.resolve'
  );

  if p_dispute_id is null then
    raise exception 'HOF_INVALID_DISPUTE_RESOLUTION_CONTEXT_REQUEST'
      using errcode = '22023';
  end if;

  select dispute.*
    into v_dispute
  from public.hall_of_fame_disputes as dispute
  where dispute.id = p_dispute_id;

  if not found then
    raise exception 'HOF_DISPUTE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_actor in (
    v_dispute.submitted_by_user_id,
    v_dispute.subject_user_id
  ) then
    raise exception 'HOF_DISPUTE_REVIEW_CONFLICT_OF_INTEREST'
      using errcode = '42501';
  end if;
  if v_dispute.status <> 'under_review'
     or v_dispute.canonical_record_id is null
     or v_dispute.dispute_type not in (
       'correction_request',
       'subject_objection',
       'fraud_report'
     ) then
    raise exception 'HOF_DISPUTE_RESOLUTION_CONTEXT_UNAVAILABLE'
      using errcode = 'PT409';
  end if;

  select canonical.*
    into v_canonical
  from public.hall_of_fame_records as canonical
  where canonical.id = v_dispute.canonical_record_id;

  if not found
     or v_canonical.target_user_id <> v_dispute.subject_user_id
     or v_canonical.validity_status <> 'active' then
    raise exception 'HOF_DISPUTE_RESOLUTION_CONTEXT_UNAVAILABLE'
      using errcode = 'PT409';
  end if;

  return query select
    v_dispute.id,
    v_dispute.dispute_type,
    v_dispute.version,
    v_canonical.id,
    v_canonical.version,
    v_canonical.record_type_code,
    v_canonical.played_on,
    v_canonical.course_name_snapshot,
    v_canonical.course_region_snapshot,
    v_canonical.course_environment,
    v_canonical.course_layout_snapshot,
    v_canonical.course_segment_snapshot,
    v_canonical.hole_number,
    v_canonical.hole_par,
    v_canonical.strokes,
    v_canonical.nominating_club_id;
end;
$$;

comment on function public.get_hall_of_fame_dispute_resolution_context(uuid) is
  'Returns the active canonical values and exact optimistic versions required for an authorized HOF dispute correction or revocation.';

revoke all on function public.get_hall_of_fame_dispute_resolution_context(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_hall_of_fame_dispute_resolution_context(uuid)
  to authenticated;
