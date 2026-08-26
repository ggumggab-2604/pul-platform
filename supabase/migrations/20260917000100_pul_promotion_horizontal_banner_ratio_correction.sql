-- PUL 9-2C-1: reduce the visual height of the eight public subpage horizontal banner slots.

do $$
declare
  v_target_slot_codes constant text[] := array[
    'courses.top.01',
    'clubs.top.01',
    'market.list_top.01',
    'community.top.01',
    'events.top.01',
    'lessons.top.01',
    'certification.top.01',
    'news.top.01'
  ]::text[];
  v_updated_count integer;
begin
  perform 1
  from public.promotion_slots as slot
  where slot.slot_code = any (v_target_slot_codes)
  order by slot.slot_code
  for update;

  if (
    select pg_catalog.count(*)
    from public.promotion_slots as slot
    where slot.slot_code = any (v_target_slot_codes)
  ) <> pg_catalog.cardinality(v_target_slot_codes) then
    raise exception 'PUL 9-2C-1 expected all eight horizontal promotion slots.';
  end if;

  if exists (
    select 1
    from public.promotion_slots as slot
    where slot.slot_code = any (v_target_slot_codes)
      and (
        slot.format_code <> 'horizontal'
        or slot.desktop_width <> 1600
        or slot.desktop_height <> 320
        or slot.mobile_width <> 1080
        or slot.mobile_height <> 480
      )
  ) then
    raise exception 'PUL 9-2C-1 horizontal promotion slot baseline does not match.';
  end if;

  update public.promotion_slots as slot
  set desktop_height = 200,
      mobile_height = 300
  where slot.slot_code = any (v_target_slot_codes);

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> pg_catalog.cardinality(v_target_slot_codes) then
    raise exception 'PUL 9-2C-1 did not update exactly eight promotion slots.';
  end if;
end;
$$;

