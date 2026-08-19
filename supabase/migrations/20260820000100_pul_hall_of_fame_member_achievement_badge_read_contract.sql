-- PUL 8-6-C-4: consent-aware HOF achievement summaries for club member identity surfaces.
-- The response is keyed only by the already-authorized membership IDs supplied by the caller.

create function public.list_hall_of_fame_public_achievements_for_club_members(
  p_club_id uuid,
  p_membership_ids uuid[]
)
returns table (
  membership_id uuid,
  achievements jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_requested_count integer;
  v_matched_count integer;
begin
  if v_actor_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  if p_club_id is null then
    raise exception 'CLUB_REQUIRED' using errcode = '22023';
  end if;

  if p_membership_ids is null
     or pg_catalog.cardinality(p_membership_ids) < 1
     or pg_catalog.cardinality(p_membership_ids) > 100
     or exists (
       select 1
       from pg_catalog.unnest(p_membership_ids) as requested_id(membership_id)
       where requested_id.membership_id is null
     ) then
    raise exception 'INVALID_MEMBERSHIP_IDS' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.user_accounts as actor_account
    where actor_account.id = v_actor_id
      and actor_account.account_status = 'active'
  ) then
    raise exception 'ACCOUNT_NOT_ACTIVE' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.clubs as club
    where club.id = p_club_id
      and club.club_status = 'active'
  ) or not private.club_user_has_permission(
    v_actor_id,
    p_club_id,
    'club.members.read'
  ) then
    raise exception 'CLUB_MEMBER_READ_PERMISSION_REQUIRED' using errcode = '42501';
  end if;

  select pg_catalog.count(*)::integer
    into v_requested_count
  from (
    select distinct requested_id.membership_id
    from pg_catalog.unnest(p_membership_ids) as requested_id(membership_id)
  ) as distinct_request;

  select pg_catalog.count(*)::integer
    into v_matched_count
  from public.club_memberships as membership
  join (
    select distinct requested_id.membership_id
    from pg_catalog.unnest(p_membership_ids) as requested_id(membership_id)
  ) as distinct_request
    on distinct_request.membership_id = membership.id
  where membership.club_id = p_club_id;

  if v_matched_count <> v_requested_count then
    raise exception 'CLUB_MEMBER_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  return query
  with requested_memberships as materialized (
    select
      requested_id.membership_id,
      pg_catalog.min(requested_id.ordinality) as first_ordinality
    from pg_catalog.unnest(p_membership_ids) with ordinality
      as requested_id(membership_id, ordinality)
    group by requested_id.membership_id
  )
  select
    requested.membership_id,
    coalesce(public_achievements.achievements, '[]'::jsonb)
  from requested_memberships as requested
  join public.club_memberships as membership
    on membership.id = requested.membership_id
   and membership.club_id = p_club_id
  left join lateral (
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'code', badge_count.badge_code,
        'name', badge_count.display_name,
        'source_count', badge_count.source_count
      )
      order by badge_count.display_priority, badge_count.badge_code
    ) as achievements
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
      join public.hall_of_fame_records as canonical
        on canonical.id = source.record_id
       and canonical.target_user_id = membership.user_id
       and canonical.validity_status = 'active'
       and canonical.publication_status = 'published'
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
       and consent.badge_consent
       and consent.consented_at is not null
       and consent.withdrawn_at is null
      where source.target_user_id = membership.user_id
        and source.status = 'active'
      group by
        source.badge_code,
        definition.display_name,
        definition.display_priority
    ) as badge_count
  ) as public_achievements on true
  order by requested.first_ordinality;
end;
$$;

comment on function public.list_hall_of_fame_public_achievements_for_club_members(uuid, uuid[]) is
  'Returns consent-aware public HOF achievement summaries for up to 100 authorized club membership IDs without exposing user IDs or private HOF data.';

revoke all on function public.list_hall_of_fame_public_achievements_for_club_members(uuid, uuid[])
  from public, anon, authenticated, service_role;

grant execute on function public.list_hall_of_fame_public_achievements_for_club_members(uuid, uuid[])
  to authenticated;
