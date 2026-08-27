-- PUL 9-2C-2: add one bounded secondary horizontal promotion slot to each public directory page.

do $$
declare
  v_target_slot_codes constant text[] := array[
    'courses.after_map.01',
    'clubs.after_list.01',
    'market.after_list.01',
    'community.after_posts.01',
    'events.after_schedule.01',
    'lessons.after_content.01',
    'certification.after_content.01',
    'news.after_list.01'
  ]::text[];
  v_inserted_count integer;
begin
  lock table public.promotion_slots in share row exclusive mode;

  if (select pg_catalog.count(*) from public.promotion_slots) <> 13
    or (select pg_catalog.count(*) from public.promotion_slots where is_enabled) <> 12 then
    raise exception 'PUL 9-2C-2 promotion slot catalog baseline does not match.';
  end if;

  if exists (
    select 1
    from public.promotion_slots as slot
    where slot.slot_code = any (v_target_slot_codes)
  ) then
    raise exception 'PUL 9-2C-2 secondary promotion slots already exist.';
  end if;

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
    (
      'courses.after_map.01', '골프장 지도·검색 아래', '/courses', 'after_map', 'horizontal',
      1600, 200, 1080, 300,
      array['pul_notice', 'pul_event', 'partnership', 'advertisement', 'member_guide', 'content_recommendation']::text[],
      true, 101
    ),
    (
      'clubs.after_list.01', '동호회 목록 아래', '/clubs', 'after_list', 'horizontal',
      1600, 200, 1080, 300,
      array['pul_notice', 'pul_event', 'partnership', 'advertisement', 'member_guide', 'content_recommendation']::text[],
      true, 111
    ),
    (
      'market.after_list.01', '장터 상품목록 아래', '/market', 'after_list', 'horizontal',
      1600, 200, 1080, 300,
      array['pul_notice', 'pul_event', 'partnership', 'advertisement', 'member_guide', 'content_recommendation']::text[],
      true, 121
    ),
    (
      'community.after_posts.01', '커뮤니티 게시글 목록 아래', '/community', 'after_posts', 'horizontal',
      1600, 200, 1080, 300,
      array['pul_notice', 'pul_event', 'partnership', 'advertisement', 'member_guide', 'content_recommendation']::text[],
      true, 131
    ),
    (
      'events.after_schedule.01', '대회·이벤트 주요 일정 아래', '/events', 'after_schedule', 'horizontal',
      1600, 200, 1080, 300,
      array['pul_notice', 'pul_event', 'partnership', 'advertisement', 'member_guide', 'content_recommendation']::text[],
      true, 141
    ),
    (
      'lessons.after_content.01', '레슨·교육 주요 콘텐츠 아래', '/lessons', 'after_content', 'horizontal',
      1600, 200, 1080, 300,
      array['pul_notice', 'pul_event', 'partnership', 'advertisement', 'member_guide', 'content_recommendation']::text[],
      true, 151
    ),
    (
      'certification.after_content.01', '자격증·심판 탭 콘텐츠 아래', '/certification', 'after_content', 'horizontal',
      1600, 200, 1080, 300,
      array['pul_notice', 'pul_event', 'partnership', 'advertisement', 'member_guide', 'content_recommendation']::text[],
      true, 161
    ),
    (
      'news.after_list.01', '뉴스·정보 기사목록 아래', '/news', 'after_list', 'horizontal',
      1600, 200, 1080, 300,
      array['pul_notice', 'pul_event', 'partnership', 'advertisement', 'member_guide', 'content_recommendation']::text[],
      true, 171
    );

  get diagnostics v_inserted_count = row_count;
  if v_inserted_count <> pg_catalog.cardinality(v_target_slot_codes) then
    raise exception 'PUL 9-2C-2 did not insert exactly eight secondary promotion slots.';
  end if;

  if (select pg_catalog.count(*) from public.promotion_slots) <> 21
    or (select pg_catalog.count(*) from public.promotion_slots where is_enabled) <> 20
    or exists (
      select 1
      from public.promotion_slots as slot
      where slot.slot_code = any (v_target_slot_codes)
        and (
          slot.format_code <> 'horizontal'
          or slot.desktop_width <> 1600
          or slot.desktop_height <> 200
          or slot.mobile_width <> 1080
          or slot.mobile_height <> 300
          or not slot.is_enabled
        )
    )
    or exists (
      select page_path
      from public.promotion_slots
      where page_path in ('/courses', '/clubs', '/market', '/community', '/events', '/lessons', '/certification', '/news')
        and is_enabled
      group by page_path
      having pg_catalog.count(*) <> 2
    )
    or (select is_enabled from public.promotion_slots where slot_code = 'hall_of_fame.top.01') then
    raise exception 'PUL 9-2C-2 effective promotion slot catalog is invalid.';
  end if;
end;
$$;
