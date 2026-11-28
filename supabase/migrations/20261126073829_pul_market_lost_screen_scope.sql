begin;

create or replace function private.market_lost_read(p_id uuid,p_filters jsonb,p_offset integer)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',(b.report).id,'category',(b.report).category,'item',(b.report).item,
    'brand',(b.report).brand,'model',(b.report).model,'color',(b.report).color,
    'region',(b.report).region,'place',(b.report).place,'lost_on',(b.report).lost_on,
    'features',(b.report).features,'created_at',(b.report).created_at,
    'course_key',b.course_key,'course_name',b.course_name,'course_type',b.course_type,'post_key',b.post_key,
    'resolved',b.resolved,'handled_at',b.handled_at,'mine',(b.report).author_id is not distinct from auth.uid(),
    'can_message', (b.report).author_id is distinct from auth.uid() and not exists (
      select 1 from public.messaging_blocks where (blocker_user_id,blocked_user_id) in
        ((auth.uid(),(b.report).author_id),((b.report).author_id,auth.uid()))),
    'photos',case when p_id is not null then coalesce((
      select jsonb_agg(image.id order by array_position((b.report).photo_ids,image.id))
      from private.course_story_images image where image.id=any((b.report).photo_ids)
        and private.market_lost_photo_allowed(b.report,image)),'[]'::jsonb) else '[]'::jsonb end
  ) order by (b.report).lost_on desc,(b.report).id desc),'[]'::jsonb)
  from (
    select v.*, c.course_type from private.market_lost_public() v
    left join public.courses c on c.id=(v.report).course_id
    where (p_filters->>'screen' is null or (c.course_type='screen' and v.course_key=p_filters->>'screen'))
      and case when p_id is not null then (v.report).id=p_id else (
      (not v.resolved or p_filters->>'scope'='mine' or p_filters->>'screen' is not null) and
      (coalesce(p_filters->>'scope','')<>'mine' or (v.report).author_id=auth.uid()) and
      (coalesce(p_filters->>'category','')='' or (v.report).category=p_filters->>'category') and
      (coalesce(p_filters->>'region','')='' or (v.report).region=p_filters->>'region') and
      (coalesce(p_filters->>'course','')='' or strpos(lower(coalesce(v.course_name,'')),lower(left(p_filters->>'course',100)))>0) and
      (coalesce(p_filters->>'from','')='' or (v.report).lost_on>=nullif(p_filters->>'from','')::date) and
      (coalesce(p_filters->>'to','')='' or (v.report).lost_on<=nullif(p_filters->>'to','')::date) and
      not exists (
        select 1 from regexp_split_to_table(trim(left(coalesce(p_filters->>'q',''),100)), '\s+') token
        where strpos(lower(concat_ws(' ',(v.report).item,(v.report).brand,(v.report).model,(v.report).color,(v.report).features)),lower(token))=0
      ) and not exists (
        select 1 from unnest(array['brand','model','color']) key
        where coalesce(p_filters->>key,'')<>'' and strpos(lower(concat_ws(' ',
          case key when 'brand' then (v.report).brand when 'model' then (v.report).model else (v.report).color end,
          (v.report).features,(v.report).item)),lower(left(p_filters->>key,80)))=0
      )
    ) end
    order by (v.report).lost_on desc,(v.report).id desc
    limit 21 offset greatest(0,least(coalesce(p_offset,0),20000))
  ) b;
$$;

commit;
