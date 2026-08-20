create function private.valid_event_text_array(
  p_values text[],
  p_min_items integer,
  p_max_items integer,
  p_max_length integer
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    p_values is not null
    and pg_catalog.cardinality(p_values) between p_min_items and p_max_items
    and not exists (
      select 1
      from pg_catalog.unnest(p_values) as item(value)
      where item.value is null
        or item.value <> pg_catalog.btrim(item.value)
        or item.value = ''
        or pg_catalog.char_length(item.value) > p_max_length
    );
$$;

revoke all on function private.valid_event_text_array(text[], integer, integer, integer)
  from public, anon, authenticated, service_role;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null,
  title text not null,
  match_type text not null,
  event_scale text not null,
  region text not null,
  venue_name text not null,
  venue_type text not null,
  start_date date,
  end_date date,
  schedule_note text,
  registration_status text not null,
  target_audience text[] not null default '{}'::text[],
  organizer text not null,
  summary text not null,
  benefits text[] not null default '{}'::text[],
  recruitment_status text not null default 'none',
  related_course_id uuid references public.courses (id) on delete set null,
  official_url text,
  registration_url text,
  registration_note text,
  is_featured boolean not null default false,
  publication_status text not null default 'hidden',
  version integer not null default 1,
  created_by uuid not null references public.user_accounts (id),
  updated_by uuid not null references public.user_accounts (id),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint events_event_key_uidx unique (event_key),
  constraint events_event_key_check check (
    event_key = pg_catalog.btrim(event_key)
    and event_key ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'
  ),
  constraint events_title_check check (
    title = pg_catalog.btrim(title)
    and pg_catalog.char_length(title) between 2 and 160
  ),
  constraint events_match_type_check check (match_type in ('field', 'screen')),
  constraint events_scale_check check (
    event_scale in ('national', 'province', 'city', 'citizen', 'senior', 'store', 'league', 'friendly')
  ),
  constraint events_region_check check (
    region in ('서울', '경기', '인천', '강원', '충청', '전라', '경상', '제주', '장소 미정')
  ),
  constraint events_venue_name_check check (
    venue_name = pg_catalog.btrim(venue_name)
    and pg_catalog.char_length(venue_name) between 2 and 200
  ),
  constraint events_venue_type_check check (
    venue_type in ('field', 'screen', 'indoor', 'publicCourse', 'privateVenue', 'undecided')
  ),
  constraint events_schedule_check check (
    (start_date is not null or schedule_note is not null)
    and (end_date is null or start_date is not null)
    and (end_date is null or end_date >= start_date)
    and (
      schedule_note is null
      or (
        schedule_note = pg_catalog.btrim(schedule_note)
        and pg_catalog.char_length(schedule_note) between 2 and 300
      )
    )
  ),
  constraint events_registration_status_check check (
    registration_status in ('open', 'scheduled', 'closed', 'needCheck', 'ended')
  ),
  constraint events_target_audience_check check (
    private.valid_event_text_array(target_audience, 1, 12, 100)
  ),
  constraint events_organizer_check check (
    organizer = pg_catalog.btrim(organizer)
    and pg_catalog.char_length(organizer) between 2 and 200
  ),
  constraint events_summary_check check (
    summary = pg_catalog.btrim(summary)
    and pg_catalog.char_length(summary) between 10 and 3000
  ),
  constraint events_benefits_check check (
    private.valid_event_text_array(benefits, 0, 12, 120)
  ),
  constraint events_recruitment_status_check check (
    recruitment_status in ('refereeOpen', 'staffOpen', 'volunteerScheduled', 'none')
  ),
  constraint events_official_url_check check (
    official_url is null
    or (
      official_url = pg_catalog.btrim(official_url)
      and pg_catalog.char_length(official_url) between 12 and 500
      and official_url ~ '^https://'
    )
  ),
  constraint events_registration_url_check check (
    registration_url is null
    or (
      registration_url = pg_catalog.btrim(registration_url)
      and pg_catalog.char_length(registration_url) between 12 and 500
      and registration_url ~ '^https://'
    )
  ),
  constraint events_registration_note_check check (
    registration_note is null
    or (
      registration_note = pg_catalog.btrim(registration_note)
      and pg_catalog.char_length(registration_note) between 2 and 1000
    )
  ),
  constraint events_publication_status_check check (
    publication_status in ('published', 'hidden', 'removed')
  ),
  constraint events_version_check check (version >= 1)
);

comment on table public.events is
  'Operator-authored public park-golf event directory; PUL does not accept entry fees or registrations.';

create index events_public_schedule_idx
  on public.events (start_date, created_at desc, event_key)
  where publication_status = 'published';

create index events_public_filters_idx
  on public.events (match_type, region, registration_status, start_date, event_key)
  where publication_status = 'published';

create index events_related_course_idx
  on public.events (related_course_id)
  where related_course_id is not null;

create trigger events_set_updated_at
before update on public.events
for each row execute function public.set_user_foundation_updated_at();

alter table public.events enable row level security;
alter table public.events force row level security;

create policy events_public_published_select
on public.events
for select
to anon, authenticated
using (publication_status = 'published');

revoke all on table public.events
  from public, anon, authenticated, service_role;

insert into public.platform_permission_definitions (code, description, is_active)
values ('events.manage', '공식 대회·이벤트 정보를 등록·수정·공개·숨김·종료합니다.', true);

insert into public.platform_role_permissions (platform_role, permission_code)
values ('platform_admin', 'events.manage');

create function private.public_event_json(p_event public.events)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'event_key', p_event.event_key,
    'title', p_event.title,
    'match_type', p_event.match_type,
    'event_scale', p_event.event_scale,
    'region', p_event.region,
    'venue_name', p_event.venue_name,
    'venue_type', p_event.venue_type,
    'start_date', p_event.start_date,
    'end_date', p_event.end_date,
    'schedule_note', p_event.schedule_note,
    'registration_status', p_event.registration_status,
    'target_audience', p_event.target_audience,
    'organizer', p_event.organizer,
    'summary', p_event.summary,
    'benefits', p_event.benefits,
    'recruitment_status', p_event.recruitment_status,
    'related_course', (
      select pg_catalog.jsonb_build_object(
        'course_key', course.course_key,
        'name', course.name
      )
      from public.courses as course
      where course.id = p_event.related_course_id
        and course.course_status = 'active'
    ),
    'official_url', p_event.official_url,
    'registration_url', p_event.registration_url,
    'registration_note', p_event.registration_note,
    'is_featured', p_event.is_featured
  );
$$;

comment on function private.public_event_json(public.events) is
  'Privacy-minimized public event projection with an active-course stable-key relation only.';

revoke all on function private.public_event_json(public.events)
  from public, anon, authenticated, service_role;

create function public.list_public_events(
  p_match_type text default null,
  p_region text default null,
  p_registration_status text default null,
  p_limit integer default 24,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_total integer;
  v_items jsonb;
begin
  if p_match_type is not null and p_match_type not in ('field', 'screen') then
    raise exception '시합 유형을 확인해 주세요.';
  end if;
  if p_region is not null and p_region not in ('서울', '경기', '인천', '강원', '충청', '전라', '경상', '제주', '장소 미정') then
    raise exception '지역을 확인해 주세요.';
  end if;
  if p_registration_status is not null and p_registration_status not in ('open', 'scheduled', 'closed', 'needCheck', 'ended') then
    raise exception '접수 상태를 확인해 주세요.';
  end if;
  if p_limit not between 1 and 50 or p_offset < 0 then
    raise exception '페이지 범위를 확인해 주세요.';
  end if;

  select pg_catalog.count(*)::integer
  into v_total
  from public.events as event
  where event.publication_status = 'published'
    and (p_match_type is null or event.match_type = p_match_type)
    and (p_region is null or event.region = p_region)
    and (p_registration_status is null or event.registration_status = p_registration_status);

  with page as (
    select event.id
    from public.events as event
    where event.publication_status = 'published'
      and (p_match_type is null or event.match_type = p_match_type)
      and (p_region is null or event.region = p_region)
      and (p_registration_status is null or event.registration_status = p_registration_status)
    order by
      (event.start_date is null),
      (event.start_date < current_date),
      case when event.start_date >= current_date then event.start_date end,
      case when event.start_date < current_date then event.start_date end desc,
      event.created_at desc,
      event.event_key
    limit p_limit
    offset p_offset
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      private.public_event_json(event)
      order by
        (event.start_date is null),
        (event.start_date < current_date),
        case when event.start_date >= current_date then event.start_date end,
        case when event.start_date < current_date then event.start_date end desc,
        event.created_at desc,
        event.event_key
    ),
    '[]'::jsonb
  )
  into v_items
  from page
  join public.events as event on event.id = page.id;

  return pg_catalog.jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', p_offset + pg_catalog.jsonb_array_length(v_items) < v_total
  );
end;
$$;

comment on function public.list_public_events(text, text, text, integer, integer) is
  'Published event directory with server-side match type, region, registration status, and pagination.';

revoke all on function public.list_public_events(text, text, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_public_events(text, text, text, integer, integer)
  to anon, authenticated;

create function public.get_public_event(p_event_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_event public.events%rowtype;
  v_key text := nullif(pg_catalog.btrim(p_event_key), '');
begin
  if v_key is null or v_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' then
    raise exception '대회·이벤트를 찾을 수 없습니다.';
  end if;

  select event.*
  into v_event
  from public.events as event
  where event.event_key = v_key
    and event.publication_status = 'published';

  if not found then
    raise exception '대회·이벤트를 찾을 수 없습니다.';
  end if;

  return private.public_event_json(v_event);
end;
$$;

comment on function public.get_public_event(text) is
  'Published event detail resolved by its stable public event key.';

revoke all on function public.get_public_event(text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_event(text)
  to anon, authenticated;

create function public.get_public_event_region_summaries(
  p_registration_status text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_registration_status is not null and p_registration_status not in ('open', 'scheduled', 'closed', 'needCheck', 'ended') then
    raise exception '접수 상태를 확인해 주세요.';
  end if;

  with summary as (
    select
      event.region,
      pg_catalog.count(*) filter (
        where event.registration_status <> 'ended'
          and coalesce(event.end_date, event.start_date, current_date) >= current_date
      )::integer as upcoming_count,
      pg_catalog.count(*) filter (where event.registration_status = 'open')::integer as open_count,
      pg_catalog.count(*) filter (where event.registration_status = 'needCheck')::integer as need_check_count
    from public.events as event
    where event.publication_status = 'published'
      and event.match_type = 'field'
      and (p_registration_status is null or event.registration_status = p_registration_status)
    group by event.region
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'region', summary.region,
        'upcoming_count', summary.upcoming_count,
        'open_count', summary.open_count,
        'need_check_count', summary.need_check_count,
        'representative_title', (
          select candidate.title
          from public.events as candidate
          where candidate.publication_status = 'published'
            and candidate.match_type = 'field'
            and candidate.region = summary.region
            and (p_registration_status is null or candidate.registration_status = p_registration_status)
          order by
            (candidate.start_date is null),
            (candidate.start_date < current_date),
            candidate.start_date,
            candidate.created_at desc,
            candidate.event_key
          limit 1
        )
      )
      order by pg_catalog.array_position(
        array['서울', '경기', '인천', '강원', '충청', '전라', '경상', '제주', '장소 미정']::text[],
        summary.region
      )
    ),
    '[]'::jsonb
  )
  into v_result
  from summary;

  return v_result;
end;
$$;

comment on function public.get_public_event_region_summaries(text) is
  'Region summaries derived only from the same published field-event source.';

revoke all on function public.get_public_event_region_summaries(text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_event_region_summaries(text)
  to anon, authenticated;

create function public.list_public_event_reviews(p_limit integer default 2)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_limit not between 1 and 6 then
    raise exception '후기 조회 범위를 확인해 주세요.';
  end if;

  with page as (
    select post.*
    from public.community_posts as post
    where post.post_status = 'published'
      and post.category_code = 'review'
      and post.review_type = 'event'
      and post.rating is not null
    order by post.created_at desc, post.id desc
    limit p_limit
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', page.id,
        'title', page.title,
        'summary', pg_catalog.left(page.body, 180),
        'author_display_name', private.community_actor_display_name(page.author_user_id, auth.uid()),
        'created_at', page.created_at,
        'rating', page.rating
      )
      order by page.created_at desc, page.id desc
    ),
    '[]'::jsonb
  )
  into v_result
  from page;

  return v_result;
end;
$$;

comment on function public.list_public_event_reviews(integer) is
  'Privacy-minimized published community reviews whose existing review_type is event.';

revoke all on function public.list_public_event_reviews(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_public_event_reviews(integer)
  to anon, authenticated;

create function public.mutate_event(
  p_operation text,
  p_event_key text,
  p_expected_version integer default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_event public.events%rowtype;
  v_key text := nullif(pg_catalog.btrim(p_event_key), '');
  v_start_date date;
  v_end_date date;
  v_target_audience text[];
  v_benefits text[];
  v_related_course_id uuid;
  v_related_course_key text;
  v_official_url text;
  v_registration_url text;
begin
  if v_actor_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  perform 1
  from public.user_accounts as account
  join public.platform_role_permissions as mapping
    on mapping.platform_role = account.platform_role
  join public.platform_permission_definitions as permission
    on permission.code = mapping.permission_code
   and permission.is_active
  where account.id = v_actor_id
    and account.account_status = 'active'
    and mapping.permission_code = 'events.manage'
  for share of account;

  if not found then
    raise exception '대회·이벤트 운영 권한이 없습니다.';
  end if;

  if p_operation not in ('create', 'update', 'hide', 'publish', 'end') then
    raise exception '대회·이벤트 작업을 확인해 주세요.';
  end if;
  if v_key is null or v_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' then
    raise exception '공개 event key를 확인해 주세요.';
  end if;
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception '대회·이벤트 입력값을 확인해 주세요.';
  end if;

  if p_operation = 'create' then
    if p_expected_version is not null then
      raise exception '신규 등록에는 기존 version을 사용할 수 없습니다.';
    end if;
    if exists (select 1 from public.events as event where event.event_key = v_key) then
      raise exception '이미 사용 중인 event key입니다.';
    end if;
  else
    if p_expected_version is null or p_expected_version < 1 then
      raise exception '현재 version을 확인해 주세요.';
    end if;
    select event.*
    into v_event
    from public.events as event
    where event.event_key = v_key
    for update;
    if not found then
      raise exception '대회·이벤트를 찾을 수 없습니다.';
    end if;
    if v_event.version <> p_expected_version then
      raise exception '대회·이벤트 정보가 변경되었습니다. 최신 정보를 다시 확인해 주세요.';
    end if;
  end if;

  if p_operation in ('create', 'update') then
    if exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_payload) as supplied(key)
      where supplied.key not in (
        'title', 'match_type', 'event_scale', 'region', 'venue_name', 'venue_type',
        'start_date', 'end_date', 'schedule_note', 'registration_status', 'target_audience',
        'organizer', 'summary', 'benefits', 'recruitment_status', 'related_course_key',
        'official_url', 'registration_url', 'registration_note', 'is_featured'
      )
    ) then
      raise exception '지원하지 않는 대회·이벤트 입력값이 포함되어 있습니다.';
    end if;

    if p_payload ->> 'start_date' is not null then
      if p_payload ->> 'start_date' !~ '^\d{4}-\d{2}-\d{2}$' then
        raise exception '시작일을 확인해 주세요.';
      end if;
      v_start_date := (p_payload ->> 'start_date')::date;
    end if;
    if p_payload ->> 'end_date' is not null then
      if p_payload ->> 'end_date' !~ '^\d{4}-\d{2}-\d{2}$' then
        raise exception '종료일을 확인해 주세요.';
      end if;
      v_end_date := (p_payload ->> 'end_date')::date;
    end if;
    if pg_catalog.jsonb_typeof(p_payload -> 'target_audience') <> 'array'
       or pg_catalog.jsonb_typeof(p_payload -> 'benefits') <> 'array'
       or pg_catalog.jsonb_typeof(p_payload -> 'is_featured') <> 'boolean' then
      raise exception '참가 대상·혜택·추천 여부를 확인해 주세요.';
    end if;

    select coalesce(pg_catalog.array_agg(pg_catalog.btrim(item.value)), '{}'::text[])
    into v_target_audience
    from pg_catalog.jsonb_array_elements_text(p_payload -> 'target_audience') as item(value);
    select coalesce(pg_catalog.array_agg(pg_catalog.btrim(item.value)), '{}'::text[])
    into v_benefits
    from pg_catalog.jsonb_array_elements_text(p_payload -> 'benefits') as item(value);

    v_related_course_key := nullif(pg_catalog.btrim(p_payload ->> 'related_course_key'), '');
    if v_related_course_key is not null then
      select course.id
      into v_related_course_id
      from public.courses as course
      where course.course_key = v_related_course_key
        and course.course_status = 'active'
      for share;
      if not found then
        raise exception '연결할 공개 골프장을 찾을 수 없습니다.';
      end if;
    end if;

    v_official_url := nullif(pg_catalog.btrim(p_payload ->> 'official_url'), '');
    v_registration_url := nullif(pg_catalog.btrim(p_payload ->> 'registration_url'), '');

    if p_operation = 'create' then
      insert into public.events (
        event_key, title, match_type, event_scale, region, venue_name, venue_type,
        start_date, end_date, schedule_note, registration_status, target_audience,
        organizer, summary, benefits, recruitment_status, related_course_id,
        official_url, registration_url, registration_note, is_featured,
        publication_status, created_by, updated_by
      ) values (
        v_key, pg_catalog.btrim(p_payload ->> 'title'), p_payload ->> 'match_type',
        p_payload ->> 'event_scale', p_payload ->> 'region', pg_catalog.btrim(p_payload ->> 'venue_name'),
        p_payload ->> 'venue_type', v_start_date, v_end_date,
        nullif(pg_catalog.btrim(p_payload ->> 'schedule_note'), ''), p_payload ->> 'registration_status',
        v_target_audience, pg_catalog.btrim(p_payload ->> 'organizer'), pg_catalog.btrim(p_payload ->> 'summary'),
        v_benefits, p_payload ->> 'recruitment_status', v_related_course_id,
        v_official_url, v_registration_url, nullif(pg_catalog.btrim(p_payload ->> 'registration_note'), ''),
        (p_payload ->> 'is_featured')::boolean, 'hidden', v_actor_id, v_actor_id
      )
      returning * into v_event;
    else
      update public.events as event
      set title = pg_catalog.btrim(p_payload ->> 'title'),
          match_type = p_payload ->> 'match_type',
          event_scale = p_payload ->> 'event_scale',
          region = p_payload ->> 'region',
          venue_name = pg_catalog.btrim(p_payload ->> 'venue_name'),
          venue_type = p_payload ->> 'venue_type',
          start_date = v_start_date,
          end_date = v_end_date,
          schedule_note = nullif(pg_catalog.btrim(p_payload ->> 'schedule_note'), ''),
          registration_status = p_payload ->> 'registration_status',
          target_audience = v_target_audience,
          organizer = pg_catalog.btrim(p_payload ->> 'organizer'),
          summary = pg_catalog.btrim(p_payload ->> 'summary'),
          benefits = v_benefits,
          recruitment_status = p_payload ->> 'recruitment_status',
          related_course_id = v_related_course_id,
          official_url = v_official_url,
          registration_url = v_registration_url,
          registration_note = nullif(pg_catalog.btrim(p_payload ->> 'registration_note'), ''),
          is_featured = (p_payload ->> 'is_featured')::boolean,
          updated_by = v_actor_id,
          version = event.version + 1
      where event.id = v_event.id
      returning * into v_event;
    end if;
  elsif p_payload <> '{}'::jsonb then
    raise exception '이 작업에는 추가 입력값을 사용할 수 없습니다.';
  elsif p_operation = 'hide' then
    update public.events as event
    set publication_status = 'hidden', updated_by = v_actor_id, version = event.version + 1
    where event.id = v_event.id
    returning * into v_event;
  elsif p_operation = 'publish' then
    update public.events as event
    set publication_status = 'published', updated_by = v_actor_id, version = event.version + 1
    where event.id = v_event.id
    returning * into v_event;
  elsif p_operation = 'end' then
    update public.events as event
    set registration_status = 'ended', updated_by = v_actor_id, version = event.version + 1
    where event.id = v_event.id
    returning * into v_event;
  end if;

  return pg_catalog.jsonb_build_object(
    'event_key', v_event.event_key,
    'publication_status', v_event.publication_status,
    'registration_status', v_event.registration_status,
    'version', v_event.version
  );
end;
$$;

comment on function public.mutate_event(text, text, integer, jsonb) is
  'Active events.manage platform operator-only create, full update, publish, hide, and registration-end mutation.';

revoke all on function public.mutate_event(text, text, integer, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.mutate_event(text, text, integer, jsonb)
  to authenticated;
