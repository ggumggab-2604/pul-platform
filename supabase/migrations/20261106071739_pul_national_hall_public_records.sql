-- The public event is the competition identity. Organizer metadata stays out of the event directory response.
create table private.tournament_hosts (
  event_id uuid primary key references public.events(id),
  host_club_id uuid references public.clubs(id),
  host_course_id uuid references public.courses(id),
  played_course_name text not null check (char_length(played_course_name) between 1 and 200),
  finalized_at timestamptz,
  finalized_by uuid references public.user_accounts(id) on delete set null,
  check (num_nonnulls(host_club_id, host_course_id) <= 1)
);
alter table private.tournament_hosts enable row level security;
revoke all on private.tournament_hosts from public, anon, authenticated, service_role;

-- Read models for the national hall and home. Keep club scores and awards at their original IDs.
alter table private.club_monthly_scores add column score_entered_at timestamptz;
alter table private.club_tournament_entries add column score_entered_at timestamptz, add column result_confirmed_at timestamptz;
update private.club_monthly_scores set score_entered_at = registered_at where strokes is not null;
update private.club_tournament_entries
set score_entered_at = case when score is not null then registered_at end,
    result_confirmed_at = case when confirmed then registered_at end
where score is not null or confirmed;

create function private.track_monthly_score_input() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.score_entered_at := coalesce(old.score_entered_at, case when new.strokes is not null then clock_timestamp() end);
  return new;
end
$$;
create function private.track_tournament_score_input() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.score_entered_at := coalesce(old.score_entered_at, case when new.score is not null then clock_timestamp() end);
  new.result_confirmed_at := case when new.confirmed then coalesce(old.result_confirmed_at, clock_timestamp()) end;
  return new;
end
$$;
revoke all on function private.track_monthly_score_input(), private.track_tournament_score_input() from public, anon, authenticated, service_role;
create trigger track_monthly_score_input before insert or update of strokes on private.club_monthly_scores
for each row execute function private.track_monthly_score_input();
create trigger track_tournament_score_input before insert or update of score, confirmed on private.club_tournament_entries
for each row execute function private.track_tournament_score_input();

create function private.hall_viewer_name(p_user uuid, p_name text) returns text
language sql stable set search_path = '' as $$
  select case
    when p_name is null or btrim(p_name) = '' or p_name = '이름 미등록' then 'PUL 회원'
    when p_user = (select auth.uid()) and private.messaging_account_available(p_user) then btrim(p_name)
    when char_length(btrim(p_name)) = 1 then 'O'
    when char_length(btrim(p_name)) = 2 then left(btrim(p_name), 1) || 'O'
    else left(btrim(p_name), 1) || repeat('O', char_length(btrim(p_name)) - 2) || right(btrim(p_name), 1)
  end
$$;
revoke all on function private.hall_viewer_name(uuid, text) from public, anon, authenticated, service_role;

-- A legacy result may be linked to an existing public event. Only explicit IDs identify the
-- same competition. If separately maintained sheets disagree, keep them out of the new public
-- projection until the organizer can reconcile them. No source row is changed.
create view private.hall_confirmed_tournament_results as
with candidates as (
  select e.id, t.id as tournament_id, coalesce(t.event_id, t.id) as competition_id,
         ev.event_key, coalesce(ev.title, t.title) as title, coalesce(ev.start_date, t.played_on) as played_on,
         coalesce(ev.match_type, co.course_type, case when t.comparison_basis = 'outdoor_18_single' then 'field' end) as game_type,
         case when ev.match_type = 'screen' then coalesce(h.played_course_name, t.course_name)
              when h.played_course_name is not null then t.course_name || ' · ' || h.played_course_name
              else t.course_name end as course_name, t.club_id, c.name as club_name, p.user_id, e.division, e.place, e.tied, e.score,
         e.score_entered_at, coalesce(h.finalized_at, e.result_confirmed_at) as result_confirmed_at,
         coalesce(nullif(btrim(pr.display_name), ''), e.display_name) as display_name,
         n.id as news_id
  from private.club_tournament_entries e
  join private.club_tournaments t on t.id = e.tournament_id
  join private.club_score_people p on p.id = e.person_id and p.club_id = t.club_id and not p.anonymized
  join public.user_accounts a on a.id = p.user_id and a.account_status = 'active'
  join public.clubs c on c.id = t.club_id and c.club_status = 'active' and c.directory_is_public
  left join public.user_profiles pr on pr.user_id = p.user_id
  left join public.events ev on ev.id = t.event_id
  left join private.tournament_hosts h on h.event_id = t.event_id
  left join public.courses co on co.id = t.course_id
  left join private.tournament_award_news n on n.entry_id = e.id and n.confirmed and not n.hidden
  where not e.excluded and e.confirmed and e.attendance = 'attended'
    and e.place is not null and e.score is not null
    and (t.event_id is null or ev.publication_status = 'published')
    and (num_nonnulls(h.host_club_id, h.host_course_id) = 0 or h.finalized_at is not null)
    and (t.schedule_id is null or exists (
      select 1 from public.club_official_events se
      where se.id = t.schedule_id and se.event_status not in ('draft','cancelled') and se.moderation_status = 'visible'
    ))
), deduplicated as (
  select s.*, row_number() over (
    partition by competition_id, division, user_id
    order by result_confirmed_at, id
  ) as copy_order
  from candidates s
  where not exists (
    select 1 from candidates other
    where (other.competition_id, other.division, other.user_id) = (s.competition_id, s.division, s.user_id)
      and (other.place, other.tied, other.score, other.game_type) is distinct from (s.place, s.tied, s.score, s.game_type)
  )
)
select * from deduplicated where copy_order = 1;
revoke all on private.hall_confirmed_tournament_results from public, anon, authenticated, service_role;

-- Apply the host publication gate to existing public best-score consumers too.
create or replace view private.public_personal_score_sources as
select s.*
from private.personal_score_sources s join public.clubs c on c.id = s.club_id
left join private.tournament_hosts h on s.kind = 'tournament' and h.event_id = s.linked_event_id
where c.club_status = 'active' and c.directory_is_public and s.exclusion_reason is null and s.user_id is not null
  and (num_nonnulls(h.host_club_id, h.host_course_id) = 0 or h.finalized_at is not null);
revoke all on private.public_personal_score_sources from public, anon, authenticated, service_role;

create view private.hall_national_score_sources as
select s.*, c.name as club_name, r.score_entered_at as entered_at
from private.public_personal_score_sources s
join public.clubs c on c.id = s.club_id
join private.club_monthly_sheets m on s.kind = 'monthly' and m.id = s.source_id
join private.club_monthly_scores r on r.sheet_id = m.id and r.person_id = s.person_id
where m.game_type is distinct from 'screen'
  and (m.event_id is null or exists (
    select 1 from public.club_official_events se
    where se.id = m.event_id and se.event_status not in ('draft','cancelled') and se.moderation_status = 'visible'
  ))
union all
select s.*, t.club_name, t.score_entered_at
from private.public_personal_score_sources s
join private.hall_confirmed_tournament_results t on s.kind = 'tournament' and t.id = s.source_id
where t.game_type = 'field';
revoke all on private.hall_national_score_sources from public, anon, authenticated, service_role;

create function public.get_hall_national_scores(p_period text, p_limit integer default 20, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  today date := (statement_timestamp() at time zone 'Asia/Seoul')::date;
  month_start date := date_trunc('month', today)::date;
  year_start date := (today - interval '1 year')::date;
begin
  if p_period is null or p_period not in ('month', 'year', 'all', 'today')
     or p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset < 0 then
    raise exception '전국 순위 조회 범위를 확인해 주세요.' using errcode = '22023';
  end if;
  return (
    with candidates as (
      select s.*,
        row_number() over (
          partition by user_id
          order by case when p_period <> 'year' then score end,
                   case when p_period = 'year' then played_on end desc,
                   case when p_period = 'year' then entered_at end desc,
                   entered_at, source_key
        ) as choice,
        avg(score) over (partition by user_id) as mean_score
      from private.hall_national_score_sources s
      where s.played_on <= today and
        case p_period
          when 'today' then s.entered_at >= (today::timestamp at time zone 'Asia/Seoul')
                        and s.entered_at < ((today + 1)::timestamp at time zone 'Asia/Seoul')
          when 'month' then s.played_on >= month_start
          when 'year' then s.played_on >= year_start
          else true
        end
    ), chosen as (
      select *, case when p_period = 'year' then round(mean_score, 2) else score end as metric
      from candidates where choice = 1
    ), ranked as (
      select *, rank() over (order by metric) as position, count(*) over (partition by metric) > 1 as tied
      from chosen
    ), page as (
      select * from ranked order by position, played_on desc, entered_at, source_key limit p_limit offset p_offset
    )
    select jsonb_build_object('date', today, 'total', (select count(*) from chosen), 'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'rank', s.position, 'tied', s.tied, 'score', s.metric, 'date', s.played_on,
        'club', s.club_name, 'course', s.course_name, 'name', private.hall_viewer_name(s.user_id, s.display_name),
        'direction', case when s.score < baseline.average then 'up' when s.score > baseline.average then 'down' end
      ) order by s.position, s.played_on desc, s.entered_at, s.source_key)
      from page s
      left join lateral (
        select round(avg(b.score)) as average
        from private.hall_national_score_sources b
        where p_period <> 'year' and b.user_id = s.user_id and b.entered_at < s.entered_at
          and b.played_on between ((s.entered_at at time zone 'Asia/Seoul')::date - interval '1 year')::date
                              and (s.entered_at at time zone 'Asia/Seoul')::date
      ) baseline on true
    ), '[]'::jsonb))
  );
end
$$;
revoke all on function public.get_hall_national_scores(text, integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.get_hall_national_scores(text, integer, integer) to anon, authenticated;

create view private.hall_national_special_records as
select r.id, r.target_user_id, r.record_type_code, r.played_on, r.published_at, r.source_application_record_id,
       r.course_name_snapshot as course_name, r.course_segment_snapshot as segment, r.hole_number,
       cl.name as club_name, p.display_name
from private.hall_special_visible_records() r
join public.hall_of_fame_publication_consents consent
  on consent.application_record_id = r.source_application_record_id and consent.target_user_id = r.target_user_id
left join public.clubs cl on cl.id = r.nominating_club_id and consent.club_name_consent
left join public.user_profiles p on p.user_id = r.target_user_id
where r.course_environment = 'outdoor' and r.strokes = 1
  and (r.hole_par, r.record_type_code) in ((3, 'hole_in_one'), (4, 'albatross'), (5, 'condor'))
  and (r.nominating_club_id is null or exists (
    select 1 from public.clubs c where c.id = r.nominating_club_id
      and c.club_status = 'active' and c.directory_is_public
  ));
revoke all on private.hall_national_special_records from public, anon, authenticated, service_role;

create function public.get_hall_national_special(
  p_type text default null, p_period text default 'all', p_limit integer default 20, p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare today date := (statement_timestamp() at time zone 'Asia/Seoul')::date;
begin
  if p_type is not null and p_type not in ('condor', 'albatross', 'hole_in_one')
     or p_period is null or p_period not in ('all', 'year', 'month', 'week')
     or p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset < 0 then
    raise exception '특별 기록 조회 범위를 확인해 주세요.' using errcode = '22023';
  end if;
  return (
    with eligible as (
      select * from private.hall_national_special_records where played_on <= today
    ), scoped as (
      select * from eligible
      where (p_type is null or record_type_code = p_type)
        and (p_period = 'all' or played_on >= date_trunc(p_period, today)::date)
    ), condors as (
      select * from eligible where record_type_code = 'condor' and played_on >= date_trunc('year', today)::date
    ), leaders as (
      select target_user_id, count(*) as total, rank() over (order by count(*) desc) as position
      from scoped group by target_user_id
      order by total desc, target_user_id limit 20
    )
    select jsonb_build_object(
      'counts', jsonb_build_object(
        'condor', (select count(*) from eligible where record_type_code = 'condor'),
        'albatross', (select count(*) from eligible where record_type_code = 'albatross'),
        'hole_in_one', (select count(*) from eligible where record_type_code = 'hole_in_one')
      ),
      'yearCount', (select count(*) from condors),
      'yearCondor', (select jsonb_build_object(
        'date', played_on, 'name', private.hall_viewer_name(target_user_id, display_name),
        'club', club_name, 'course', course_name
      ) from condors order by played_on desc, published_at desc, id limit 1),
      'total', (select count(*) from scoped),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', s.id, 'type', s.record_type_code, 'date', s.played_on,
          'name', private.hall_viewer_name(s.target_user_id, s.display_name),
          'club', s.club_name, 'course', s.course_name, 'segment', s.segment, 'hole', s.hole_number,
          'photos', coalesce((select jsonb_agg(f.id order by f.created_at, f.id)
            from public.hall_of_fame_evidence_files f
            join private.hall_special_photo_purposes ph on ph.evidence_id = f.id and ph.purpose = 'public_photo'
            where f.application_record_id = s.source_application_record_id and f.status = 'available'), '[]'::jsonb)
        ) order by s.played_on desc, s.published_at desc, s.id)
        from (select * from scoped order by played_on desc, published_at desc, id limit p_limit offset p_offset) s
      ), '[]'::jsonb),
      'leaders', coalesce((
        select jsonb_agg(jsonb_build_object(
          'rank', l.position, 'count', l.total, 'name', private.hall_viewer_name(l.target_user_id, p.display_name)
        ) order by l.total desc, l.target_user_id)
        from leaders l left join public.user_profiles p on p.user_id = l.target_user_id
      ), '[]'::jsonb)
    )
  );
end
$$;
revoke all on function public.get_hall_national_special(text, text, integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.get_hall_national_special(text, text, integer, integer) to anon, authenticated;

create function public.get_hall_tournament_awards(p_year integer, p_month integer default null, p_event_key text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare period_start date; period_end date;
begin
  if p_year is null or p_year not between 1900 and 9998 or p_month not between 1 and 12 then
    raise exception '대회 결과 조회 기간을 확인해 주세요.' using errcode = '22023';
  end if;
  period_start := make_date(p_year, coalesce(p_month, 1), 1);
  period_end := (period_start + case when p_month is null then interval '1 year' else interval '1 month' end)::date;
  return (
    with winners as (
      select * from private.hall_confirmed_tournament_results
      where game_type in ('field', 'screen') and place between 1 and 3
        and (p_event_key is null or event_key = p_event_key)
        and played_on <= (statement_timestamp() at time zone 'Asia/Seoul')::date
    ), latest as (
      select distinct on (game_type) competition_id
      from winners order by game_type, played_on desc, competition_id
    ), grouped as (
      select competition_id, event_key, title, played_on, game_type,
        jsonb_agg(jsonb_build_object(
          'name', private.hall_viewer_name(user_id, display_name), 'club', club_name, 'course', course_name,
          'division', division, 'place', place, 'tied', tied, 'score', score, 'newsId', news_id
        ) order by division, place, id) as winners
      from winners
      where (played_on >= period_start and played_on < period_end)
        or competition_id in (select competition_id from latest)
      group by competition_id, event_key, title, played_on, game_type
    ), projected as (
      select competition_id, played_on, jsonb_build_object(
        'id', competition_id, 'eventKey', event_key, 'title', title, 'date', played_on,
        'gameType', game_type, 'winners', winners
      ) as card from grouped
    )
    select jsonb_build_object(
      'latest', coalesce((select jsonb_agg(card order by played_on desc, competition_id) from projected
        where competition_id in (select competition_id from latest)), '[]'::jsonb),
      'items', coalesce((select jsonb_agg(card order by played_on desc, competition_id) from projected
        where p_event_key is not null or (played_on >= period_start and played_on < period_end)), '[]'::jsonb)
    )
  );
end
$$;
revoke all on function public.get_hall_tournament_awards(integer, integer, text) from public, anon, authenticated, service_role;
grant execute on function public.get_hall_tournament_awards(integer, integer, text) to anon, authenticated;

create function public.get_hall_latest_records()
returns jsonb language sql stable security definer set search_path = '' as $$
  with recent as (
    (select 'score' as kind, s.entered_at as published_at, s.played_on, s.display_name, s.user_id,
            s.club_name, s.course_name, s.score, s.title as label, null::uuid as news_id
     from private.hall_national_score_sources s
     where s.played_on <= (statement_timestamp() at time zone 'Asia/Seoul')::date
     order by entered_at desc, source_key limit 8)
    union all
    (select 'award', t.result_confirmed_at, t.played_on, t.display_name, t.user_id,
            t.club_name, t.course_name, t.score, t.title || ' · ' || t.place || '위', t.news_id
     from private.hall_confirmed_tournament_results t where t.place between 1 and 3
       and t.game_type in ('field', 'screen') and t.played_on <= (statement_timestamp() at time zone 'Asia/Seoul')::date
     order by t.result_confirmed_at desc, t.id limit 8)
    union all
    (select 'special', r.published_at, r.played_on, r.display_name, r.target_user_id,
            r.club_name, r.course_name, null, r.record_type_code, null
     from private.hall_national_special_records r where r.played_on <= (statement_timestamp() at time zone 'Asia/Seoul')::date
     order by r.published_at desc, r.id limit 8)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'kind', kind, 'date', played_on, 'name', private.hall_viewer_name(user_id, display_name),
    'club', club_name, 'course', course_name, 'score', score, 'label', label, 'newsId', news_id
  ) order by published_at desc, kind, played_on desc, label), '[]'::jsonb)
  from (select * from recent order by published_at desc, kind, played_on desc, label limit 8) selected
$$;
revoke all on function public.get_hall_latest_records() from public, anon, authenticated, service_role;
grant execute on function public.get_hall_latest_records() to anon, authenticated;

-- Keep bookmarked public listings and photo news on the same viewer-name policy.
create or replace function public.list_hall_of_fame_public_records_by_type(
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
    private.hall_viewer_name(canonical.target_user_id, profile.display_name),
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

create or replace function public.list_hall_of_fame_public_rankings(
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
        private.hall_viewer_name(eligible.target_user_id, pg_catalog.min(eligible.full_display_name)) as display_name,
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

create or replace function public.list_hall_of_fame_public_records(
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
    private.hall_viewer_name(canonical.target_user_id, profile.display_name),
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

create or replace function public.get_hall_special_member_summaries(p_keys uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if coalesce(cardinality(p_keys),0)>100 then raise exception 'SPECIAL_SUMMARY_LIMIT'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('key',k.public_key,'name',private.hall_viewer_name(k.user_id, p.display_name),'primary_club',case when p.profile_visibility='public' then pc.name end,
 'hole_in_one',coalesce(n.h,0),'albatross',coalesce(n.a,0),'condor',coalesce(n.c,0)))
 from private.hall_special_member_keys k join public.user_accounts ua on ua.id=k.user_id and ua.account_status='active'
 join public.user_profiles p on p.user_id=k.user_id
 left join private.club_primary_memberships pm on pm.user_id=k.user_id
 left join public.club_memberships cm on cm.id=pm.membership_id and cm.membership_status='active'
 left join public.clubs pc on pc.id=cm.club_id and pc.club_status='active' and pc.directory_is_public
 left join (select target_user_id,count(*) filter(where record_type_code='hole_in_one') h,count(*) filter(where record_type_code='albatross') a,count(*) filter(where record_type_code='condor') c from private.hall_special_visible_records() group by target_user_id) n on n.target_user_id=k.user_id
 where k.public_key=any(p_keys) and (p.profile_visibility='public' or exists(select 1 from private.hall_special_visible_records() r join public.hall_of_fame_publication_consents c on c.application_record_id=r.source_application_record_id where r.target_user_id=k.user_id and c.full_display_name_consent))), '[]'::jsonb);
end$$;

create or replace function public.list_hall_special_records(p_club_key text default null,p_member_key uuid default null,p_type text default null,p_offset integer default 0,p_limit integer default 20) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare items jsonb; total integer;
begin
 if p_limit not between 1 and 100 or p_offset<0 or p_limit is null or p_offset is null or (p_type is not null and p_type not in ('condor','albatross','hole_in_one')) then raise exception 'SPECIAL_INVALID_PAGE'; end if;
 select count(*) into total from private.hall_special_visible_records() r join public.hall_of_fame_publication_consents c on c.application_record_id=r.source_application_record_id left join public.clubs cl on cl.id=r.nominating_club_id left join private.hall_special_member_keys k on k.user_id=r.target_user_id
 where (p_club_key is null or (cl.legacy_key=p_club_key and c.club_name_consent)) and (p_member_key is null or (k.public_key=p_member_key and c.full_display_name_consent)) and (p_type is null or r.record_type_code=p_type);
 select coalesce(jsonb_agg(rowdata order by played_on desc,id desc),'[]') into items from (
 select r.played_on,r.id,jsonb_build_object('id',r.id,'record_type_code',r.record_type_code,'played_on',r.played_on,'course_name',r.course_name_snapshot,'course_region',r.course_region_snapshot,'course_environment',r.course_environment,'course_segment',r.course_segment_snapshot,'hole_number',r.hole_number,'hole_par',r.hole_par,'strokes',r.strokes,
 'name',private.hall_viewer_name(r.target_user_id, p.display_name),'member_key',case when c.full_display_name_consent then k.public_key end,'club_name',case when c.club_name_consent then cl.name end,
 'photos',coalesce((select jsonb_agg(e.id order by e.created_at,e.id) from public.hall_of_fame_evidence_files e join private.hall_special_photo_purposes ph on ph.evidence_id=e.id and ph.purpose='public_photo' where e.application_record_id=r.source_application_record_id and e.status='available'),'[]')) rowdata
 from private.hall_special_visible_records() r join public.hall_of_fame_publication_consents c on c.application_record_id=r.source_application_record_id left join public.user_profiles p on p.user_id=r.target_user_id left join public.clubs cl on cl.id=r.nominating_club_id left join private.hall_special_member_keys k on k.user_id=r.target_user_id
 where (p_club_key is null or (cl.legacy_key=p_club_key and c.club_name_consent)) and (p_member_key is null or (k.public_key=p_member_key and c.full_display_name_consent)) and (p_type is null or r.record_type_code=p_type)
 order by r.played_on desc,r.id desc limit p_limit offset p_offset) q;
 return jsonb_build_object('items',items,'total',total);
end$$;

create or replace function public.get_tournament_award_news(p_club_key text default null,p_course_key text default null,p_news_id uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'entry_id',e.id,'version',n.version,'tournament_version',t.version,'tournament_id',t.id,
 'title',t.title,'date',t.played_on,'course',t.course_name,'course_key',co.course_key,'club',c.name,'club_key',c.legacy_key,'name',private.hall_viewer_name(p.user_id, e.display_name),'division',e.division,
 'place',n.place,'tied',n.tied,'score',n.score,'award_name',n.award_name,'sentiment',n.sentiment,'photo_id',n.photo_id,'confirmed',n.confirmed and not exists (
    select 1 from private.tournament_hosts h where h.event_id=t.event_id
      and num_nonnulls(h.host_club_id,h.host_course_id)>0 and h.finalized_at is null
  ),'format_note',t.format_note,
 'can_edit',private.messaging_account_available(auth.uid()) and exists(select 1 from public.club_memberships m where m.club_id=c.id and m.user_id=auth.uid() and m.membership_status='active') and (p.user_id=auth.uid() or private.club_user_is_active_admin_or_vice_admin(auth.uid(),c.id)),
 'can_confirm',private.messaging_account_available(auth.uid()) and private.club_user_is_active_admin_or_vice_admin(auth.uid(),c.id),
 'can_pin_course',private.messaging_account_available(auth.uid()) and private.course_actor_has_permission(auth.uid(),'courses.manage'),
 'can_pin_national',private.messaging_account_available(auth.uid()) and public.current_user_has_platform_permission('hall_of_fame.records.correct'),
 'pins',coalesce((select jsonb_agg(scope) from private.tournament_award_pins where news_id=n.id),'[]'::jsonb),
 'comments',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',private.hall_viewer_name(author_id, display_name),'body',body,'date',created_at) order by created_at) from private.tournament_award_comments where news_id=n.id),'[]'::jsonb)) order by n.published_at desc,n.id),'[]'::jsonb)
 from private.tournament_award_news n join private.club_tournament_entries e on e.id=n.entry_id join private.club_score_people p on p.id=e.person_id
 join private.club_tournaments t on t.id=e.tournament_id join public.clubs c on c.id=t.club_id left join public.courses co on co.id=t.course_id
 where not n.hidden and not e.excluded and not p.anonymized and c.club_status='active' and (c.directory_is_public or ((p_club_key=c.legacy_key or p_news_id=n.id) and private.club_user_has_permission(auth.uid(), c.id, 'club.posts.read'))) and (p_club_key is null or c.legacy_key=p_club_key) and (p_course_key is null or co.course_key=p_course_key) and (p_news_id is null or n.id=p_news_id);
$$;

create or replace function public.get_tournament_award_photo(p_photo_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p private.tournament_award_photos; begin
 select * into p from private.tournament_award_photos where id=p_photo_id and ready;
 if p.id is null or not (
  exists(select 1 from private.tournament_award_news n join private.club_tournament_entries e on e.id=n.entry_id join private.club_score_people sp on sp.id=e.person_id join private.club_tournaments t on t.id=e.tournament_id join public.clubs c on c.id=t.club_id where n.photo_id=p.id and not n.hidden and not e.excluded and not sp.anonymized and c.club_status='active' and (c.directory_is_public or private.club_user_has_permission(auth.uid(), c.id, 'club.posts.read')))
  or (p.owner_id=auth.uid() and private.messaging_account_available(auth.uid()) and exists(select 1 from private.club_tournament_entries e join private.club_tournaments t on t.id=e.tournament_id join public.club_memberships m on m.club_id=t.club_id where e.id=p.entry_id and not e.excluded and m.user_id=auth.uid() and m.membership_status='active'))
 ) then raise exception '사진을 조회할 수 없습니다.' using errcode='42501';end if;
 return jsonb_build_object('path',p.object_path,'mime',p.mime);
end $$;

create or replace function public.get_club_monthly_scores(p_club_key text,p_year integer,p_editor boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c uuid; result jsonb; begin
 c:=private.monthly_club(p_club_key,p_editor);
 if p_year is null or p_year not between 1 and 9999 then raise exception '연도를 확인해 주세요.' using errcode='22023'; end if;
 select jsonb_build_object('clubKey',p_club_key,'clubName',(select name from public.clubs where id=c),
 'year',p_year,'canEdit',private.club_user_is_active_admin_or_vice_admin(auth.uid(),c),
 'sheets',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'date',s.played_on,'title',s.title,'course',s.course_name,
 'courseKey',(select course_key from public.courses where id=s.course_id),'linkedCourse',(select name from public.courses where id=s.course_id),'eventId',s.event_id,'gameType',s.game_type,
 'medalEligible',s.event_id is null or (e.event_type='monthly_meeting' and e.event_status not in ('draft','cancelled') and e.moderation_status='visible'),
 'comparison_basis',s.comparison_basis,'note',s.note,'version',s.version,'rows',coalesce((select jsonb_agg(jsonb_build_object(
 'id',p.id,'userId',p.user_id,'kind',p.kind,'name',r.display_name,'score',r.strokes) || case when p_editor then jsonb_build_object('gender',r.saved_gender,'anonymized',p.anonymized) else '{}'::jsonb end order by r.display_name,p.id)
 from private.club_monthly_scores r join private.club_score_people p on p.id=r.person_id where r.sheet_id=s.id and not r.excluded),'[]'::jsonb)) order by s.played_on,s.id)
 from private.club_monthly_sheets s left join public.club_official_events e on e.id=s.event_id
 where s.club_id=c and extract(year from s.played_on)=p_year),'[]'::jsonb),
 'pendingMedalEvents',coalesce((select jsonb_agg(jsonb_build_object(
 'date',(e.starts_at at time zone 'Asia/Seoul')::date,'gameType',co.course_type) order by e.starts_at,e.id)
 from public.club_official_events e left join public.courses co on co.course_key=e.linked_course_legacy_key and co.course_status<>'removed'
 where e.club_id=c and e.event_type='monthly_meeting' and e.event_status not in ('draft','cancelled') and e.moderation_status='visible'
 and extract(year from e.starts_at at time zone 'Asia/Seoul')=p_year
 and (e.event_status='completed' or (e.starts_at at time zone 'Asia/Seoul')::date <= (now() at time zone 'Asia/Seoul')::date)
 and not exists(select 1 from private.club_monthly_sheets s where s.event_id=e.id)),'[]'::jsonb)) into result;
 if p_editor then
 result:=result||jsonb_build_object(
 'members',coalesce((select jsonb_agg(jsonb_build_object('userId',m.user_id,'name',coalesce(nullif(btrim(p.display_name),''),'이름 미등록'),
 'id',sp.id,'gender',coalesce(b.gender,sp.monthly_gender),'canSupplement',b.gender is null) order by p.display_name,m.user_id) from public.club_memberships m join public.user_accounts a on a.id=m.user_id
 join public.user_profiles p on p.user_id=a.id left join private.club_score_people sp on sp.club_id=c and sp.user_id=m.user_id
 left join private.member_basics b on b.user_id=m.user_id
 where m.club_id=c and not coalesce(sp.anonymized,false) and m.membership_status='active' and a.account_status='active'),'[]'::jsonb),
 'manualPeople',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',n.display_name,'kind','manual','userId',null,'gender',p.monthly_gender,'canSupplement',true))
 from private.club_score_people p join lateral(select r.display_name from private.club_monthly_scores r join private.club_monthly_sheets s on s.id=r.sheet_id
 where r.person_id=p.id order by s.played_on desc limit 1)n on true where p.club_id=c and p.kind='manual' and not p.anonymized),'[]'::jsonb),
 'homeCourses', coalesce((
   select jsonb_agg(jsonb_build_object('key', co.course_key, 'name', co.name, 'type', co.course_type) order by co.course_type)
   from public.course_club_links l
   join public.courses co on co.id = l.course_id and co.course_status = 'active'
   where l.club_id = c and not l.legacy_conflict
 ), '[]'::jsonb),
 'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'date',(e.starts_at at time zone 'Asia/Seoul')::date,
 'courseKey',e.linked_course_legacy_key,'gameType',case when co.course_status<>'removed' then co.course_type end,'version',e.version,'course',coalesce(co.name,e.location)) order by e.starts_at) from public.club_official_events e left join public.courses co on co.course_key=e.linked_course_legacy_key
 where e.club_id=c and e.event_type='monthly_meeting' and e.event_status not in ('draft','cancelled') and e.moderation_status='visible'
 and extract(year from e.starts_at at time zone 'Asia/Seoul')=p_year),'[]'::jsonb));
 end if;
 return result;
end $$;

notify pgrst, 'reload schema';
