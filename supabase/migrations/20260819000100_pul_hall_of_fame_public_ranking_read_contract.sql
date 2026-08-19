create function public.list_hall_of_fame_public_records_by_type(
  p_record_type_code text default null,
  p_limit integer default 24,
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

  if p_record_type_code is not null
     and not exists (
       select 1
       from public.hall_of_fame_record_type_definitions as definition
       where definition.code = p_record_type_code
         and definition.is_active
     ) then
    raise exception 'HOF_INVALID_PUBLIC_RECORD_TYPE' using errcode = '22023';
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
    and (p_record_type_code is null or canonical.record_type_code = p_record_type_code)
  order by canonical.played_on desc, canonical.approved_at desc, canonical.id desc
  limit p_limit
  offset p_offset;
end;
$$;

comment on function public.list_hall_of_fame_public_records_by_type(text, integer, integer) is
  'Anonymous-safe, consent-aware public HOF record listing with server-side record-type filtering and no raw identifiers.';

revoke all on function public.list_hall_of_fame_public_records_by_type(text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_hall_of_fame_public_records_by_type(text, integer, integer)
  to anon, authenticated;

create function public.list_hall_of_fame_public_rankings(
  p_ranking_kind text,
  p_reference_date date default null,
  p_limit integer default 20
)
returns table (
  rank_position bigint,
  ranking_label text,
  ranking_sublabel text,
  record_count bigint,
  record_type_counts jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_reference_date date := coalesce(
    p_reference_date,
    (pg_catalog.now() at time zone 'Asia/Seoul')::date
  );
  v_period_start date;
  v_period_end date;
begin
  if p_ranking_kind is null
     or p_ranking_kind not in ('monthly', 'yearly', 'region', 'club', 'course')
     or p_limit is null
     or p_limit < 1
     or p_limit > 50 then
    raise exception 'HOF_INVALID_PUBLIC_RANKING_REQUEST' using errcode = '22023';
  end if;

  if p_ranking_kind in ('monthly', 'yearly') then
    if p_ranking_kind = 'monthly' then
      v_period_start := pg_catalog.date_trunc('month', v_reference_date::timestamp)::date;
      v_period_end := (v_period_start + interval '1 month')::date;
    else
      v_period_start := pg_catalog.date_trunc('year', v_reference_date::timestamp)::date;
      v_period_end := (v_period_start + interval '1 year')::date;
    end if;

    return query
    with eligible as (
      select
        canonical.target_user_id,
        canonical.record_type_code,
        record_type.display_name as record_type_name,
        record_type.display_order,
        consent.full_display_name_consent,
        nullif(pg_catalog.btrim(profile.display_name), '') as full_display_name
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
      where canonical.validity_status = 'active'
        and canonical.publication_status = 'published'
        and canonical.played_on >= v_period_start
        and canonical.played_on < v_period_end
    ),
    type_counts as (
      select
        eligible.target_user_id,
        eligible.record_type_code,
        eligible.record_type_name,
        eligible.display_order,
        pg_catalog.count(*)::bigint as type_count
      from eligible
      group by
        eligible.target_user_id,
        eligible.record_type_code,
        eligible.record_type_name,
        eligible.display_order
    ),
    member_counts as (
      select
        eligible.target_user_id,
        case
          when pg_catalog.bool_and(eligible.full_display_name_consent)
           and pg_catalog.count(eligible.full_display_name) = pg_catalog.count(*)
           and pg_catalog.count(distinct eligible.full_display_name) = 1
            then pg_catalog.min(eligible.full_display_name)
          else 'PUL member'::text
        end as display_name,
        pg_catalog.count(*)::bigint as total_count
      from eligible
      group by eligible.target_user_id
    ),
    ranked as (
      select
        member_counts.target_user_id,
        member_counts.display_name,
        member_counts.total_count,
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'code', type_counts.record_type_code,
            'name', type_counts.record_type_name,
            'count', type_counts.type_count
          )
          order by type_counts.display_order, type_counts.record_type_code
        ) as type_summary
      from member_counts
      join type_counts
        on type_counts.target_user_id = member_counts.target_user_id
      group by
        member_counts.target_user_id,
        member_counts.display_name,
        member_counts.total_count
    )
    select
      pg_catalog.dense_rank() over (order by ranked.total_count desc),
      ranked.display_name,
      null::text,
      ranked.total_count,
      ranked.type_summary
    from ranked
    order by ranked.total_count desc, ranked.display_name, ranked.target_user_id
    limit p_limit;

    return;
  end if;

  if p_ranking_kind = 'region' then
    return query
    with eligible as (
      select
        canonical.course_region_snapshot as group_label,
        canonical.record_type_code,
        record_type.display_name as record_type_name,
        record_type.display_order
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
      where canonical.validity_status = 'active'
        and canonical.publication_status = 'published'
    ),
    type_counts as (
      select
        eligible.group_label,
        eligible.record_type_code,
        eligible.record_type_name,
        eligible.display_order,
        pg_catalog.count(*)::bigint as type_count
      from eligible
      group by
        eligible.group_label,
        eligible.record_type_code,
        eligible.record_type_name,
        eligible.display_order
    ),
    ranked as (
      select
        type_counts.group_label,
        pg_catalog.sum(type_counts.type_count)::bigint as total_count,
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'code', type_counts.record_type_code,
            'name', type_counts.record_type_name,
            'count', type_counts.type_count
          )
          order by type_counts.display_order, type_counts.record_type_code
        ) as type_summary
      from type_counts
      group by type_counts.group_label
    )
    select
      pg_catalog.dense_rank() over (order by ranked.total_count desc),
      ranked.group_label,
      null::text,
      ranked.total_count,
      ranked.type_summary
    from ranked
    order by ranked.total_count desc, ranked.group_label
    limit p_limit;

    return;
  end if;

  if p_ranking_kind = 'club' then
    return query
    with eligible as (
      select
        canonical.nominating_club_id as group_id,
        club.name as group_label,
        canonical.record_type_code,
        record_type.display_name as record_type_name,
        record_type.display_order
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
       and consent.club_name_consent
       and consent.consented_at is not null
       and consent.withdrawn_at is null
      join public.clubs as club
        on club.id = canonical.nominating_club_id
      where canonical.validity_status = 'active'
        and canonical.publication_status = 'published'
    ),
    type_counts as (
      select
        eligible.group_id,
        eligible.group_label,
        eligible.record_type_code,
        eligible.record_type_name,
        eligible.display_order,
        pg_catalog.count(*)::bigint as type_count
      from eligible
      group by
        eligible.group_id,
        eligible.group_label,
        eligible.record_type_code,
        eligible.record_type_name,
        eligible.display_order
    ),
    ranked as (
      select
        type_counts.group_id,
        type_counts.group_label,
        pg_catalog.sum(type_counts.type_count)::bigint as total_count,
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'code', type_counts.record_type_code,
            'name', type_counts.record_type_name,
            'count', type_counts.type_count
          )
          order by type_counts.display_order, type_counts.record_type_code
        ) as type_summary
      from type_counts
      group by type_counts.group_id, type_counts.group_label
    )
    select
      pg_catalog.dense_rank() over (order by ranked.total_count desc),
      ranked.group_label,
      null::text,
      ranked.total_count,
      ranked.type_summary
    from ranked
    order by ranked.total_count desc, ranked.group_label, ranked.group_id
    limit p_limit;

    return;
  end if;

  return query
  with eligible as (
    select
      canonical.course_name_snapshot as group_label,
      canonical.course_region_snapshot as group_sublabel,
      canonical.record_type_code,
      record_type.display_name as record_type_name,
      record_type.display_order
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
    where canonical.validity_status = 'active'
      and canonical.publication_status = 'published'
  ),
  type_counts as (
    select
      eligible.group_label,
      eligible.group_sublabel,
      eligible.record_type_code,
      eligible.record_type_name,
      eligible.display_order,
      pg_catalog.count(*)::bigint as type_count
    from eligible
    group by
      eligible.group_label,
      eligible.group_sublabel,
      eligible.record_type_code,
      eligible.record_type_name,
      eligible.display_order
  ),
  ranked as (
    select
      type_counts.group_label,
      type_counts.group_sublabel,
      pg_catalog.sum(type_counts.type_count)::bigint as total_count,
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'code', type_counts.record_type_code,
          'name', type_counts.record_type_name,
          'count', type_counts.type_count
        )
        order by type_counts.display_order, type_counts.record_type_code
      ) as type_summary
    from type_counts
    group by type_counts.group_label, type_counts.group_sublabel
  )
  select
    pg_catalog.dense_rank() over (order by ranked.total_count desc),
    ranked.group_label,
    ranked.group_sublabel,
    ranked.total_count,
    ranked.type_summary
  from ranked
  order by
    ranked.total_count desc,
    ranked.group_label,
    ranked.group_sublabel
  limit p_limit;
end;
$$;

comment on function public.list_hall_of_fame_public_rankings(text, date, integer) is
  'Anonymous-safe HOF rankings over active published consented records, aggregated by private identity without returning raw identifiers.';

revoke all on function public.list_hall_of_fame_public_rankings(text, date, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_hall_of_fame_public_rankings(text, date, integer)
  to anon, authenticated;
