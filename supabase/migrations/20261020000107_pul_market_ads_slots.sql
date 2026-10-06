-- LOCAL ONLY candidate: extend the existing slot catalog after promotion foundation,
-- horizontal ratio correction and second directory slots. No content/placement reassignment.
begin;
insert into public.promotion_slots (
 slot_code,display_name,page_path,placement_code,format_code,
 desktop_width,desktop_height,mobile_width,mobile_height,
 allowed_content_kinds,is_enabled,sort_order
) values
 ('market.home_bottom.01','장터 홈 · 거래 요약 아래','/market','home_bottom','horizontal',
  1600,200,1080,300,
  array['pul_notice','pul_event','partnership','advertisement','member_guide','content_recommendation']::text[],true,122),
 ('market.business_bottom.01','창업 질문·매장매매 · 목록 아래','/market','business_bottom','horizontal',
  1600,200,1080,300,
  array['pul_notice','pul_event','partnership','advertisement','member_guide','content_recommendation']::text[],true,123);
-- The existing manager enumerates this catalog and applies promotions.manage.
-- No promotion, schedule, media, grant, policy, or function is changed.
commit;

