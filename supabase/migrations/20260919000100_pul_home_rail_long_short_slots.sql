-- PUL 9-2D-1: expand each HOME desktop rail to one long banner or up to three short banners.

alter table public.promotion_slots
  drop constraint promotion_slots_code_check;

alter table public.promotion_slots
  add constraint promotion_slots_code_check
  check (
    slot_code = pg_catalog.btrim(slot_code)
    and slot_code ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+){2,3}$'
    and pg_catalog.char_length(slot_code) <= 80
  );

create or replace function public.get_active_promotions_for_slots(
  p_slot_codes text[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_result jsonb := '[]'::jsonb;
begin
  if p_slot_codes is null
     or pg_catalog.cardinality(p_slot_codes) not between 1 and 20 then
    raise exception '배너 슬롯은 한 번에 1개 이상 20개 이하로 조회해 주세요.';
  end if;
  if exists (
    select 1
    from pg_catalog.unnest(p_slot_codes) as requested(slot_code)
    where requested.slot_code is null
      or requested.slot_code <> pg_catalog.btrim(requested.slot_code)
      or pg_catalog.char_length(requested.slot_code) > 80
      or requested.slot_code !~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+){2,3}$'
  ) then
    raise exception '배너 슬롯 코드를 확인해 주세요.';
  end if;
  if pg_catalog.cardinality(p_slot_codes) <> (
    select pg_catalog.count(distinct requested.slot_code)::integer
    from pg_catalog.unnest(p_slot_codes) as requested(slot_code)
  ) then
    raise exception '배너 슬롯 코드를 중복해서 요청할 수 없습니다.';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'slot_code', listed.slot_code,
        'promotion_key', listed.promotion_key,
        'title', listed.title,
        'summary', listed.summary,
        'content_kind', listed.content_kind,
        'link_type', listed.link_type,
        'external_url', listed.external_url,
        'detail_slug', listed.slug,
        'desktop_media', pg_catalog.jsonb_build_object(
          'bucket', listed.desktop_bucket,
          'path', listed.desktop_path,
          'width', listed.desktop_width,
          'height', listed.desktop_height,
          'alt', listed.desktop_alt
        ),
        'mobile_media', case
          when listed.mobile_path is null then null
          else pg_catalog.jsonb_build_object(
            'bucket', listed.mobile_bucket,
            'path', listed.mobile_path,
            'width', listed.mobile_width,
            'height', listed.mobile_height,
            'alt', listed.mobile_alt
          )
        end,
        'starts_at', listed.starts_at,
        'ends_at', listed.ends_at
      )
      order by listed.sort_order, listed.slot_code
    ),
    '[]'::jsonb
  )
  into v_result
  from (
    select
      slot.slot_code,
      slot.sort_order,
      slot.desktop_width,
      slot.desktop_height,
      slot.mobile_width,
      slot.mobile_height,
      promotion.promotion_key,
      promotion.title,
      promotion.summary,
      promotion.content_kind,
      promotion.link_type,
      promotion.external_url,
      promotion.slug,
      placement.starts_at,
      placement.ends_at,
      desktop_media.storage_bucket as desktop_bucket,
      desktop_media.storage_path as desktop_path,
      desktop_media.alt_text as desktop_alt,
      mobile_media.storage_bucket as mobile_bucket,
      mobile_media.storage_path as mobile_path,
      mobile_media.alt_text as mobile_alt
    from public.promotion_slots as slot
    join public.promotion_placements as placement
      on placement.slot_code = slot.slot_code
     and placement.publication_status = 'published'
     and placement.starts_at <= v_now
     and placement.ends_at > v_now
    join public.promotions as promotion
      on promotion.id = placement.promotion_id
     and promotion.content_status = 'ready'
    join public.promotion_media as desktop_media
      on desktop_media.promotion_id = promotion.id
     and desktop_media.variant = 'desktop_banner'
     and desktop_media.media_status = 'available'
    left join public.promotion_media as mobile_media
      on mobile_media.promotion_id = promotion.id
     and mobile_media.variant = 'mobile_banner'
     and mobile_media.media_status = 'available'
    where slot.slot_code = any (p_slot_codes)
      and slot.is_enabled
      and (
        slot.format_code not in ('home_hero', 'mobile_feed')
        or mobile_media.id is not null
      )
  ) as listed;

  return v_result;
end;
$$;

comment on function public.get_active_promotions_for_slots(text[]) is
  'Returns at most one live, ready promotion per enabled requested three- or four-segment slot without internal identifiers.';

revoke all on function public.get_active_promotions_for_slots(text[])
  from public, anon, authenticated, service_role;
grant execute on function public.get_active_promotions_for_slots(text[])
  to anon, authenticated;

create or replace function public.list_promotions_for_management(
  p_content_status text default null,
  p_slot_code text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_total integer;
  v_items jsonb := '[]'::jsonb;
begin
  v_actor_id := private.promotion_assert_manager();

  if p_content_status is not null
     and p_content_status not in ('draft', 'ready', 'archived') then
    raise exception '홍보 콘텐츠 상태 필터를 확인해 주세요.';
  end if;
  if p_slot_code is not null
     and (
       p_slot_code <> pg_catalog.btrim(p_slot_code)
       or pg_catalog.char_length(p_slot_code) > 80
       or p_slot_code !~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+){2,3}$'
     ) then
    raise exception '배너 슬롯 필터를 확인해 주세요.';
  end if;
  if p_limit is null or p_limit not between 1 and 100
     or p_offset is null or p_offset < 0 then
    raise exception '관리 목록 범위를 확인해 주세요.';
  end if;

  select pg_catalog.count(*)::integer
  into v_total
  from public.promotions as promotion
  where (p_content_status is null or promotion.content_status = p_content_status)
    and (
      p_slot_code is null
      or exists (
        select 1
        from public.promotion_placements as placement
        where placement.promotion_id = promotion.id
          and placement.slot_code = p_slot_code
      )
    );

  select coalesce(
    pg_catalog.jsonb_agg(listed.item order by listed.updated_at desc, listed.id),
    '[]'::jsonb
  )
  into v_items
  from (
    select
      promotion.id,
      promotion.updated_at,
      private.promotion_management_item(promotion.id) as item
    from public.promotions as promotion
    where (p_content_status is null or promotion.content_status = p_content_status)
      and (
        p_slot_code is null
        or exists (
          select 1
          from public.promotion_placements as placement
          where placement.promotion_id = promotion.id
            and placement.slot_code = p_slot_code
        )
      )
    order by promotion.updated_at desc, promotion.id
    limit p_limit
    offset p_offset
  ) as listed;

  return pg_catalog.jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', p_offset + p_limit < v_total
  );
end;
$$;

revoke all on function public.list_promotions_for_management(text, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_promotions_for_management(text, text, integer, integer)
  to authenticated;

create or replace function public.list_promotion_overviews_for_management(
  p_query text default null,
  p_slot_codes text[] default null,
  p_display_status text default null,
  p_content_kind text default null,
  p_limit integer default 30,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_query text := nullif(pg_catalog.btrim(p_query), '');
  v_total integer;
  v_items jsonb := '[]'::jsonb;
begin
  perform private.promotion_assert_manager();

  if v_query is not null and pg_catalog.char_length(v_query) > 100 then
    raise exception '홍보 제목 검색어를 확인해 주세요.';
  end if;
  if p_slot_codes is not null and (
    pg_catalog.cardinality(p_slot_codes) not between 1 and 27
    or pg_catalog.cardinality(p_slot_codes) <> (
      select pg_catalog.count(distinct supplied.slot_code)::integer
      from pg_catalog.unnest(p_slot_codes) as supplied(slot_code)
    )
    or exists (
      select 1
      from pg_catalog.unnest(p_slot_codes) as supplied(slot_code)
      where supplied.slot_code is null
        or supplied.slot_code <> pg_catalog.btrim(supplied.slot_code)
        or pg_catalog.char_length(supplied.slot_code) > 80
        or supplied.slot_code !~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+){2,3}$'
    )
    or pg_catalog.cardinality(p_slot_codes) <> (
      select pg_catalog.count(*)::integer
      from public.promotion_slots as slot
      where slot.slot_code = any (p_slot_codes)
    )
  ) then
    raise exception '배너 위치 필터를 확인해 주세요.';
  end if;
  if p_display_status is not null
     and p_display_status not in ('draft', 'hidden', 'scheduled', 'live', 'ended', 'archived') then
    raise exception '배너 표시 상태 필터를 확인해 주세요.';
  end if;
  if p_content_kind is not null
     and p_content_kind not in (
       'pul_notice', 'pul_event', 'partnership', 'advertisement',
       'member_guide', 'content_recommendation'
     ) then
    raise exception '홍보 콘텐츠 구분 필터를 확인해 주세요.';
  end if;
  if p_limit is null or p_limit not between 1 and 100
     or p_offset is null or p_offset < 0 then
    raise exception '관리 목록 범위를 확인해 주세요.';
  end if;

  with overview as materialized (
    select
      promotion.id,
      promotion.updated_at,
      case
        when promotion.content_status = 'archived' then 'archived'
        else coalesce(primary_placement.display_status, 'draft')
      end as display_status,
      primary_placement.id as primary_placement_id
    from public.promotions as promotion
    left join lateral (
      select
        placement.id,
        case
          when placement.publication_status = 'draft' then 'draft'
          when placement.publication_status = 'hidden' then 'hidden'
          when placement.starts_at > v_now then 'scheduled'
          when placement.ends_at <= v_now then 'ended'
          else 'live'
        end as display_status
      from public.promotion_placements as placement
      where placement.promotion_id = promotion.id
      order by
        case
          when placement.publication_status = 'published'
               and placement.starts_at <= v_now
               and placement.ends_at > v_now then 1
          when placement.publication_status = 'published'
               and placement.starts_at > v_now then 2
          when placement.publication_status = 'draft' then 3
          when placement.publication_status = 'hidden' then 4
          else 5
        end,
        placement.updated_at desc,
        placement.id
      limit 1
    ) as primary_placement on true
  ), filtered as materialized (
    select overview.*
    from overview
    join public.promotions as promotion on promotion.id = overview.id
    where (v_query is null or pg_catalog.strpos(
      pg_catalog.lower(promotion.title || ' ' || promotion.summary),
      pg_catalog.lower(v_query)
    ) > 0)
      and (p_content_kind is null or promotion.content_kind = p_content_kind)
      and (p_display_status is null or overview.display_status = p_display_status)
      and (
        p_slot_codes is null
        or exists (
          select 1
          from public.promotion_placements as placement
          where placement.promotion_id = promotion.id
            and placement.slot_code = any (p_slot_codes)
        )
      )
  ), listed as (
    select
      filtered.id,
      filtered.updated_at,
      private.promotion_management_item(filtered.id) || pg_catalog.jsonb_build_object(
        'display_status', filtered.display_status,
        'primary_placement', case
          when filtered.primary_placement_id is null then null
          else private.promotion_placement_item(filtered.primary_placement_id)
        end
      ) as item
    from filtered
    order by filtered.updated_at desc, filtered.id
    limit p_limit
    offset p_offset
  )
  select
    (select pg_catalog.count(*)::integer from filtered),
    coalesce(
      (select pg_catalog.jsonb_agg(listed.item order by listed.updated_at desc, listed.id) from listed),
      '[]'::jsonb
    )
  into v_total, v_items;

  return pg_catalog.jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', p_offset + p_limit < v_total
  );
end;
$$;

comment on function public.list_promotion_overviews_for_management(text, text[], text, text, integer, integer) is
  'Returns one bounded promotion card page for up to the complete fixed slot catalog, including four-segment HOME rail slots.';

revoke all on function public.list_promotion_overviews_for_management(text, text[], text, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_promotion_overviews_for_management(text, text[], text, text, integer, integer)
  to authenticated;

create function private.enforce_promotion_home_rail_mode_exclusivity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_side text;
  v_mode text;
  v_conflict_slot_codes text[];
begin
  if new.publication_status <> 'published' then
    return new;
  end if;

  if new.slot_code = 'home.rail_left.01' then
    v_side := 'left';
    v_mode := 'long';
    v_conflict_slot_codes := array[
      'home.rail_left.short.01',
      'home.rail_left.short.02',
      'home.rail_left.short.03'
    ]::text[];
  elsif new.slot_code = any (array[
    'home.rail_left.short.01',
    'home.rail_left.short.02',
    'home.rail_left.short.03'
  ]::text[]) then
    v_side := 'left';
    v_mode := 'short';
    v_conflict_slot_codes := array['home.rail_left.01']::text[];
  elsif new.slot_code = 'home.rail_right.01' then
    v_side := 'right';
    v_mode := 'long';
    v_conflict_slot_codes := array[
      'home.rail_right.short.01',
      'home.rail_right.short.02',
      'home.rail_right.short.03'
    ]::text[];
  elsif new.slot_code = any (array[
    'home.rail_right.short.01',
    'home.rail_right.short.02',
    'home.rail_right.short.03'
  ]::text[]) then
    v_side := 'right';
    v_mode := 'short';
    v_conflict_slot_codes := array['home.rail_right.01']::text[];
  else
    return new;
  end if;

  -- One transaction-scoped lock per side closes the cross-slot publish race.
  perform pg_catalog.pg_advisory_xact_lock(
    920260919,
    case v_side when 'left' then 1 else 2 end
  );

  if exists (
    select 1
    from public.promotion_placements as conflict
    where conflict.slot_code = any (v_conflict_slot_codes)
      and conflict.publication_status = 'published'
      and conflict.id <> new.id
      and pg_catalog.tstzrange(conflict.starts_at, conflict.ends_at, '[)')
        && pg_catalog.tstzrange(new.starts_at, new.ends_at, '[)')
  ) then
    if v_side = 'left' and v_mode = 'long' then
      raise exception '왼쪽 짧은 배너가 게시 중인 기간에는 왼쪽 긴 배너를 함께 게시할 수 없습니다.';
    elsif v_side = 'left' then
      raise exception '왼쪽 긴 배너 게시 기간에는 왼쪽 짧은 배너를 함께 게시할 수 없습니다.';
    elsif v_mode = 'long' then
      raise exception '오른쪽 짧은 배너가 게시 중인 기간에는 오른쪽 긴 배너를 함께 게시할 수 없습니다.';
    else
      raise exception '오른쪽 긴 배너 게시 기간에는 오른쪽 짧은 배너를 함께 게시할 수 없습니다.';
    end if;
  end if;

  return new;
end;
$$;

comment on function private.enforce_promotion_home_rail_mode_exclusivity() is
  'Serializes each HOME rail side and rejects overlapping long-versus-short published placements while allowing short-versus-short and opposite-side schedules.';

revoke all on function private.enforce_promotion_home_rail_mode_exclusivity()
  from public, anon, authenticated, service_role;

create trigger promotion_placements_enforce_home_rail_mode_exclusivity
before insert or update of slot_code, publication_status, starts_at, ends_at
on public.promotion_placements
for each row execute function private.enforce_promotion_home_rail_mode_exclusivity();

do $$
declare
  v_allowed_content_kinds constant text[] := array[
    'pul_notice',
    'pul_event',
    'partnership',
    'advertisement',
    'member_guide',
    'content_recommendation'
  ]::text[];
  v_short_slot_codes constant text[] := array[
    'home.rail_left.short.01',
    'home.rail_left.short.02',
    'home.rail_left.short.03',
    'home.rail_right.short.01',
    'home.rail_right.short.02',
    'home.rail_right.short.03'
  ]::text[];
  v_inserted_count integer;
begin
  lock table public.promotion_slots in share row exclusive mode;

  if (select pg_catalog.count(*) from public.promotion_slots) <> 21
    or (select pg_catalog.count(*) from public.promotion_slots where is_enabled) <> 20 then
    raise exception 'PUL 9-2D-1 promotion slot catalog baseline does not match.';
  end if;

  if exists (
    select 1
    from public.promotion_slots as slot
    where slot.slot_code = any (v_short_slot_codes)
  ) then
    raise exception 'PUL 9-2D-1 short HOME rail slots already exist.';
  end if;

  if (
    select pg_catalog.count(*)
    from public.promotion_slots as slot
    where slot.slot_code in ('home.rail_left.01', 'home.rail_right.01')
      and slot.page_path = '/'
      and slot.format_code = 'vertical_rail'
      and slot.desktop_width = 600
      and slot.desktop_height = 1050
      and slot.mobile_width is null
      and slot.mobile_height is null
      and slot.allowed_content_kinds = v_allowed_content_kinds
      and slot.is_enabled
  ) <> 2 then
    raise exception 'PUL 9-2D-1 existing HOME rail contract does not match.';
  end if;

  update public.promotion_slots as slot
  set display_name = case slot.slot_code
        when 'home.rail_left.01' then '메인 왼쪽 긴 세로배너'
        else '메인 오른쪽 긴 세로배너'
      end,
      desktop_height = 1500
  where slot.slot_code in ('home.rail_left.01', 'home.rail_right.01');

  insert into public.promotion_slots (
    slot_code,
    display_name,
    page_path,
    placement_code,
    format_code,
    desktop_width,
    desktop_height,
    mobile_width,
    mobile_height,
    allowed_content_kinds,
    is_enabled,
    sort_order
  )
  values
    ('home.rail_left.short.01', '메인 왼쪽 짧은 배너 1', '/', 'rail_left_short_01', 'vertical_rail', 600, 480, null, null, v_allowed_content_kinds, true, 21),
    ('home.rail_left.short.02', '메인 왼쪽 짧은 배너 2', '/', 'rail_left_short_02', 'vertical_rail', 600, 480, null, null, v_allowed_content_kinds, true, 22),
    ('home.rail_left.short.03', '메인 왼쪽 짧은 배너 3', '/', 'rail_left_short_03', 'vertical_rail', 600, 480, null, null, v_allowed_content_kinds, true, 23),
    ('home.rail_right.short.01', '메인 오른쪽 짧은 배너 1', '/', 'rail_right_short_01', 'vertical_rail', 600, 480, null, null, v_allowed_content_kinds, true, 31),
    ('home.rail_right.short.02', '메인 오른쪽 짧은 배너 2', '/', 'rail_right_short_02', 'vertical_rail', 600, 480, null, null, v_allowed_content_kinds, true, 32),
    ('home.rail_right.short.03', '메인 오른쪽 짧은 배너 3', '/', 'rail_right_short_03', 'vertical_rail', 600, 480, null, null, v_allowed_content_kinds, true, 33);

  get diagnostics v_inserted_count = row_count;
  if v_inserted_count <> pg_catalog.cardinality(v_short_slot_codes) then
    raise exception 'PUL 9-2D-1 did not insert exactly six short HOME rail slots.';
  end if;

  if (select pg_catalog.count(*) from public.promotion_slots) <> 27
    or (select pg_catalog.count(*) from public.promotion_slots where is_enabled) <> 26
    or (
      select pg_catalog.count(*)
      from public.promotion_slots as slot
      where slot.slot_code in ('home.rail_left.01', 'home.rail_right.01')
        and slot.desktop_width = 600
        and slot.desktop_height = 1500
        and slot.mobile_width is null
        and slot.mobile_height is null
        and slot.is_enabled
    ) <> 2
    or (
      select pg_catalog.count(*)
      from public.promotion_slots as slot
      where slot.slot_code = any (v_short_slot_codes)
        and slot.page_path = '/'
        and slot.format_code = 'vertical_rail'
        and slot.desktop_width = 600
        and slot.desktop_height = 480
        and slot.mobile_width is null
        and slot.mobile_height is null
        and slot.allowed_content_kinds = v_allowed_content_kinds
        and slot.is_enabled
    ) <> 6
    or (select is_enabled from public.promotion_slots where slot_code = 'hall_of_fame.top.01') then
    raise exception 'PUL 9-2D-1 effective HOME rail slot catalog is invalid.';
  end if;
end;
$$;
