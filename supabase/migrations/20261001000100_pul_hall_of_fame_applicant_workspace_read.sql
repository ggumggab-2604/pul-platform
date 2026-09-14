-- Applicant preparation reads only. Existing mutation and review contracts remain authoritative.
create function public.get_my_hall_of_fame_application_workspace(
  p_application_batch_id uuid default null,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_applications jsonb;
  v_confirmations jsonb;
  v_types jsonb;
begin
  if v_actor is null or not exists (
    select 1 from public.user_accounts a
    where a.id = v_actor and a.account_status = 'active'
  ) then
    raise exception 'HOF_ACCOUNT_NOT_ACTIVE' using errcode = '42501';
  end if;
  if p_offset is null or p_offset < 0 or p_offset > 10000 then
    raise exception 'HOF_INVALID_PAGINATION' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'code', t.code, 'name', t.display_name,
    'qualification_kind', t.qualification_kind, 'qualification_value', t.qualification_value
  ) order by t.display_order, t.code), '[]'::jsonb) into v_types
  from public.hall_of_fame_record_type_definitions t
  where t.is_active and t.code in ('hole_in_one', 'albatross', 'condor');

  select coalesce(jsonb_agg(item order by created_at desc, id), '[]'::jsonb)
  into v_applications
  from (
    select b.id, b.created_at, jsonb_build_object(
      'id', b.id, 'version', b.version, 'status', b.status,
      'application_type', b.application_type,
      'context_club_id', b.vacancy_context_club_id,
      'round', (select jsonb_build_object(
        'played_on', s.played_on, 'course_name', s.course_name_snapshot,
        'course_region', s.course_region_snapshot, 'course_environment', s.course_environment,
        'round_type', s.round_type
      ) from public.hall_of_fame_round_snapshots s where s.application_batch_id = b.id),
      'records', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'version', r.version, 'status', r.review_status,
        'record_type_code', r.record_type_code, 'course_segment', r.course_segment_snapshot,
        'hole_number', r.hole_number, 'hole_par', r.hole_par, 'strokes', r.strokes,
        'processing_consent', exists (select 1 from public.hall_of_fame_application_consents c
          where c.application_record_id = r.id and c.subject_user_id = v_actor
            and c.consent_purpose = 'application_processing' and c.status = 'granted'),
        'review_consent', exists (select 1 from public.hall_of_fame_application_consents c
          where c.application_record_id = r.id and c.subject_user_id = v_actor
            and c.consent_purpose = 'evidence_review' and c.status = 'granted'),
        'publication_consent', exists (select 1 from public.hall_of_fame_publication_consents c
          where c.application_record_id = r.id and c.target_user_id = v_actor and c.status = 'granted'
            and c.masked_display_name_consent and c.record_date_consent and c.course_detail_consent),
        'evidence', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', e.id, 'version', e.version, 'status', e.status, 'evidence_type', e.evidence_type
        ) order by e.created_at, e.id), '[]'::jsonb)
          from public.hall_of_fame_evidence_files e where e.application_record_id = r.id
            and e.status not in ('deleted', 'replaced')),
        'confirmations', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', c.id, 'status', case when c.status = 'pending' and c.expires_at <= now()
            then 'expired' else c.status end,
          'active', exists (select 1 from public.user_accounts a
            where a.id = c.confirmer_user_id and a.account_status = 'active')
        ) order by c.created_at, c.id), '[]'::jsonb)
          from public.hall_of_fame_record_confirmations c where c.application_record_id = r.id
            and c.confirmation_role = 'round_companion')
      ) order by r.created_at, r.id), '[]'::jsonb)
        from public.hall_of_fame_application_records r where r.application_batch_id = b.id
          and r.target_user_id = v_actor and r.review_status <> 'withdrawn')
    ) as item
    from public.hall_of_fame_application_batches b
    where b.created_by_user_id = v_actor
      and b.application_type in ('direct_application', 'club_admin_vacancy_direct_application')
      and (p_application_batch_id is null or b.id = p_application_batch_id)
    order by b.created_at desc, b.id
    limit 10 offset p_offset
  ) own_batches;

  -- Only the designated confirmer sees enough record context to answer.
  -- No evidence, applicant identity, consent, reviewer note, or arbitrary lookup.
  select coalesce(jsonb_agg(item order by created_at desc, id), '[]'::jsonb)
  into v_confirmations
  from (
    select c.id, c.created_at, jsonb_build_object(
      'id', c.id, 'batch_version', b.version, 'status', c.status,
      'expires_at', c.expires_at, 'played_on', s.played_on,
      'course_name', s.course_name_snapshot, 'course_segment', r.course_segment_snapshot,
      'hole_number', r.hole_number, 'hole_par', r.hole_par, 'strokes', r.strokes,
      'record_type_code', r.record_type_code
    ) as item
    from public.hall_of_fame_record_confirmations c
    join public.hall_of_fame_application_records r on r.id = c.application_record_id
    join public.hall_of_fame_application_batches b on b.id = r.application_batch_id
    join public.hall_of_fame_round_snapshots s on s.id = r.round_snapshot_id
    where c.confirmer_user_id = v_actor and c.confirmation_role = 'round_companion'
      and c.status = 'pending' and c.expires_at > now()
      and b.status = 'draft' and r.review_status = 'draft'
    order by c.created_at desc, c.id
    limit 10 offset p_offset
  ) incoming;

  return jsonb_build_object('record_types', v_types,
    'applications', v_applications, 'incoming_confirmations', v_confirmations);
end;
$$;

revoke all on function public.get_my_hall_of_fame_application_workspace(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_hall_of_fame_application_workspace(uuid, integer)
  to authenticated;
comment on function public.get_my_hall_of_fame_application_workspace(uuid, integer) is
  'Bounded active applicant self-record preparation DTOs and designated confirmer context. No table grants or mutation changes.';
