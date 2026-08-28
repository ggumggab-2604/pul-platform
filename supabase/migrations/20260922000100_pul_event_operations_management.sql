-- PUL 9-3D-2: permission-scoped event operations read model and deterministic KST freshness.
-- Event writes continue to use public.mutate_event; no event row is changed by this migration.

create function private.event_actor_has_management_permission(p_actor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_actor_id is not null
    and exists (
      select 1
      from public.user_accounts as account
      join public.platform_role_permissions as mapping
        on mapping.platform_role = account.platform_role
      join public.platform_permission_definitions as permission
        on permission.code = mapping.permission_code
       and permission.is_active
      where account.id = p_actor_id
        and account.account_status = 'active'
        and mapping.permission_code = 'events.manage'
    ),
    false
  );
$$;

comment on function private.event_actor_has_management_permission(uuid) is
  'Checks active-account events.manage capability for event management read RPCs.';

revoke all on function private.event_actor_has_management_permission(uuid)
  from public, anon, authenticated, service_role;

create function private.event_management_freshness(
  p_event public.events,
  p_reference_at timestamptz
)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_event.publication_status = 'published'
      and p_event.end_date is not null
      and p_event.end_date < (p_reference_at at time zone 'Asia/Seoul')::date
      and p_event.registration_status in ('open', 'scheduled')
      then 'status-mismatch'
    when p_event.publication_status = 'published'
      and p_event.start_date is not null
      and p_event.start_date between
        (p_reference_at at time zone 'Asia/Seoul')::date
        and (p_reference_at at time zone 'Asia/Seoul')::date + 7
      then 'starting-soon'
    else null
  end;
$$;

comment on function private.event_management_freshness(public.events, timestamptz) is
  'Deterministic Asia/Seoul event freshness signal; never mutates publication or registration status.';

revoke all on function private.event_management_freshness(public.events, timestamptz)
  from public, anon, authenticated, service_role;

create function private.management_event_json(
  p_event public.events,
  p_reference_at timestamptz
)
returns jsonb
language sql
stable
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
    'related_course_key', (
      select course.course_key
      from public.courses as course
      where course.id = p_event.related_course_id
    ),
    'official_url', p_event.official_url,
    'registration_url', p_event.registration_url,
    'registration_note', p_event.registration_note,
    'is_featured', p_event.is_featured,
    'publication_status', p_event.publication_status,
    'version', p_event.version,
    'updated_at', p_event.updated_at,
    'freshness_status', private.event_management_freshness(p_event, p_reference_at)
  );
$$;

comment on function private.management_event_json(public.events, timestamptz) is
  'Exact operator event DTO with stable public keys and deterministic read-only freshness.';

revoke all on function private.management_event_json(public.events, timestamptz)
  from public, anon, authenticated, service_role;

create function public.list_events_for_management(
  p_keyword text default null,
  p_publication_status text default null,
  p_registration_status text default null,
  p_freshness text default null,
  p_reference_at timestamptz default pg_catalog.now(),
  p_limit integer default 30,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_keyword text := nullif(pg_catalog.btrim(p_keyword), '');
  v_total integer;
  v_items jsonb;
begin
  if not private.event_actor_has_management_permission(v_actor_id) then
    raise exception '대회·이벤트 운영 권한이 없습니다.' using errcode = '42501';
  end if;
  if p_reference_at is null then
    raise exception '기준 시각을 확인해 주세요.' using errcode = '22023';
  end if;
  if v_keyword is not null and pg_catalog.char_length(v_keyword) > 100 then
    raise exception '검색어는 100자 이내로 입력해 주세요.' using errcode = '22023';
  end if;
  if p_publication_status is not null
     and p_publication_status not in ('published', 'hidden', 'removed') then
    raise exception '공개 상태를 확인해 주세요.' using errcode = '22023';
  end if;
  if p_registration_status is not null
     and p_registration_status not in ('open', 'scheduled', 'closed', 'needCheck', 'ended') then
    raise exception '접수 상태를 확인해 주세요.' using errcode = '22023';
  end if;
  if p_freshness is not null
     and p_freshness not in ('starting-soon', 'status-mismatch') then
    raise exception '최신성 조건을 확인해 주세요.' using errcode = '22023';
  end if;
  if p_limit is null or p_limit not between 1 and 50
     or p_offset is null or p_offset < 0 then
    raise exception '페이지 범위를 확인해 주세요.' using errcode = '22023';
  end if;

  with matching as (
    select event.*
    from public.events as event
    where (p_publication_status is null or event.publication_status = p_publication_status)
      and (p_registration_status is null or event.registration_status = p_registration_status)
      and (
        p_freshness is null
        or private.event_management_freshness(event, p_reference_at) = p_freshness
      )
      and (
        v_keyword is null
        or pg_catalog.strpos(
          pg_catalog.lower(pg_catalog.concat_ws(
            ' ', event.title, event.region, event.venue_name, event.organizer
          )),
          pg_catalog.lower(v_keyword)
        ) > 0
      )
  ), page as (
    select matching.*
    from matching
    order by
      case private.event_management_freshness(matching, p_reference_at)
        when 'status-mismatch' then 0
        when 'starting-soon' then 1
        else 2
      end,
      (matching.start_date is null),
      matching.start_date,
      matching.updated_at desc,
      matching.event_key
    limit p_limit
    offset p_offset
  )
  select
    (select pg_catalog.count(*)::integer from matching),
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          private.management_event_json(page, p_reference_at)
          order by
            case private.event_management_freshness(page, p_reference_at)
              when 'status-mismatch' then 0
              when 'starting-soon' then 1
              else 2
            end,
            (page.start_date is null),
            page.start_date,
            page.updated_at desc,
            page.event_key
        )
        from page
      ),
      '[]'::jsonb
    )
  into v_total, v_items;

  return pg_catalog.jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', p_offset + pg_catalog.jsonb_array_length(v_items) < v_total
  );
end;
$$;

comment on function public.list_events_for_management(text, text, text, text, timestamptz, integer, integer) is
  'Authenticated events.manage list read model with search, filters, pagination, and deterministic KST freshness.';

revoke all on function public.list_events_for_management(text, text, text, text, timestamptz, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_events_for_management(text, text, text, text, timestamptz, integer, integer)
  to authenticated;

create function public.get_event_for_management(
  p_event_key text,
  p_reference_at timestamptz default pg_catalog.now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_key text := nullif(pg_catalog.btrim(p_event_key), '');
  v_event public.events%rowtype;
begin
  if not private.event_actor_has_management_permission(v_actor_id) then
    raise exception '대회·이벤트 운영 권한이 없습니다.' using errcode = '42501';
  end if;
  if p_reference_at is null then
    raise exception '기준 시각을 확인해 주세요.' using errcode = '22023';
  end if;
  if v_key is null or v_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' then
    raise exception '대회·이벤트를 찾을 수 없습니다.' using errcode = '22023';
  end if;

  select event.*
  into v_event
  from public.events as event
  where event.event_key = v_key;

  if not found then
    raise exception '대회·이벤트를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  return private.management_event_json(v_event, p_reference_at);
end;
$$;

comment on function public.get_event_for_management(text, timestamptz) is
  'Authenticated events.manage detail read model; includes hidden and removed rows without row locking.';

revoke all on function public.get_event_for_management(text, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.get_event_for_management(text, timestamptz)
  to authenticated;

-- The existing dashboard casts its supplied timestamptz to date. Pin the function-local
-- timezone so those deterministic event signals use the same Asia/Seoul calendar date.
alter function public.get_operations_dashboard(timestamptz, integer)
  set timezone to 'Asia/Seoul';

