-- PUL 9-2B-2: bounded management read models for the promotion UI.
-- The 9-2B-1 mutation, media, permission, and publication contracts remain unchanged.

create function public.list_promotion_slots_for_management()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.promotion_assert_manager();

  return coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'slot_code', slot.slot_code,
        'display_name', slot.display_name,
        'page_path', slot.page_path,
        'placement_code', slot.placement_code,
        'format_code', slot.format_code,
        'desktop_width', slot.desktop_width,
        'desktop_height', slot.desktop_height,
        'mobile_width', slot.mobile_width,
        'mobile_height', slot.mobile_height,
        'allowed_content_kinds', slot.allowed_content_kinds,
        'is_enabled', slot.is_enabled,
        'sort_order', slot.sort_order
      )
      order by slot.sort_order, slot.slot_code
    )
    from public.promotion_slots as slot
  ), '[]'::jsonb);
end;
$$;

comment on function public.list_promotion_slots_for_management() is
  'Returns the fixed promotion slot catalog to active promotions.manage actors without exposing table access.';

revoke all on function public.list_promotion_slots_for_management()
  from public, anon, authenticated, service_role;
grant execute on function public.list_promotion_slots_for_management()
  to authenticated;

create function public.list_promotion_overviews_for_management(
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
    pg_catalog.cardinality(p_slot_codes) not between 1 and 13
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
        or supplied.slot_code !~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+){2}$'
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
  'Returns one bounded promotion card page with a deterministic primary placement and runtime display status for the management UI.';

revoke all on function public.list_promotion_overviews_for_management(text, text[], text, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_promotion_overviews_for_management(text, text[], text, text, integer, integer)
  to authenticated;
