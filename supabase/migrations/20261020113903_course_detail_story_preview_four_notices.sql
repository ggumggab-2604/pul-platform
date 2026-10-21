-- LOCAL CANDIDATE ONLY. Not applied to any database.
-- Only preview read bounds change: 4 unpinned stories, latest 20 public pinned notices.
-- Same signature, public wrapper, authorization, visibility, withdrawal guards, totals and writes.
BEGIN;
create or replace function private.course_story_read(p_course_key text,p_post_key text,p_category text,p_offset integer,p_preview boolean,p_manage boolean) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c public.courses%rowtype;p public.course_discussion_posts%rowtype;items jsonb;total integer;comments jsonb;notices jsonb;
begin
 select * into c from public.courses where course_key=p_course_key and course_status='active' and course_type='field';if not found then raise exception '야외 구장을 찾을 수 없습니다.' using errcode='P0002';end if;
 if p_manage and not private.course_can_manage(c.id) then raise exception '담당 구장 관리 권한이 없습니다.' using errcode='42501';end if;
 if p_offset is null or p_offset<0 or p_category is not null and p_category not in ('free','question','lost') then raise exception '목록 범위를 확인해 주세요.' using errcode='22023';end if;
 if p_post_key is not null then
  select * into p from public.course_discussion_posts where post_key=p_post_key and course_id=c.id and post_status='published' and moderation_hidden_at is null;
  if not found then raise exception '공개 글을 찾을 수 없습니다.' using errcode='P0002';end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'parent_id',x.parent_id,'body',x.body,'author',private.community_actor_display_name(x.author_id,auth.uid()),'created_at',x.created_at,'steward',exists(select 1 from private.course_stewards where course_id=c.id and user_id=x.author_id and active),'can_delete',coalesce(x.author_id=auth.uid(),false)) order by x.created_at,x.id),'[]') into comments from private.course_story_comments x where x.post_id=p.id and not x.hidden and (x.parent_id is null or exists(select 1 from private.course_story_comments parent where parent.id=x.parent_id and not parent.hidden));
  return private.course_story_json(p)||jsonb_build_object('comments',comments);
 end if;
 select count(*) into total from public.course_discussion_posts where course_id=c.id and (p_manage and post_status<>'removed' or post_status='published' and moderation_hidden_at is null) and (p_category is null or category=p_category);
 select coalesce(jsonb_agg(private.course_story_json(x) order by x.pinned desc,x.created_at desc,x.id),'[]') into items from (select * from public.course_discussion_posts where course_id=c.id and (p_manage and post_status<>'removed' or post_status='published' and moderation_hidden_at is null) and (p_category is null or category=p_category) and (not p_preview or not pinned) order by pinned desc,created_at desc,id limit case when p_preview then 4 else 20 end offset p_offset)x;
 select coalesce(jsonb_agg(private.course_story_json(x) order by x.pinned_at desc,x.id),'[]') into notices from (select * from public.course_discussion_posts where course_id=c.id and pinned and post_status='published' and moderation_hidden_at is null order by pinned_at desc,id limit case when p_preview then 20 else 1 end)x;
 return jsonb_build_object('items',items,'total',total,'notice',notices,'can_manage',private.course_can_manage(c.id),'reports',case when p_manage then coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'post_key',reported.post_key,'comment_id',r.comment_id,'reason',r.reason,'resolved',r.resolved) order by r.created_at desc) from private.course_story_reports r join public.course_discussion_posts reported on reported.id=r.post_id where reported.course_id=c.id),'[]') else '[]'::jsonb end);
end $$;
COMMIT;
