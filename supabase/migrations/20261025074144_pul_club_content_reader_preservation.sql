-- Preserve established recruitment metadata on editing and the native screen reader.
create or replace function private.club_post_safe_json(p public.club_posts) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'club_key',c.legacy_key,'club_name',c.name,'title',p.title,'body',p.content_summary,'post_type',p.post_type,'location',p.location,'capacity',p.capacity,'participant_target',p.participant_target,'recruitment_status',p.recruitment_status,'linked_course_legacy_key',p.linked_course_legacy_key,'activity_category',p.activity_category,'is_notice',p.activity_notice,'starts_at',p.starts_at,'ends_at',p.ends_at,'event_id',p.activity_event_id,'visibility',p.visibility,'created_at',p.created_at,'version',p.version,'hidden',p.moderation_status<>'visible' or p.post_status not in('published','edited'),
 'can_edit',coalesce(p.author_user_id=auth.uid() and private.club_photo_writer(auth.uid(),p.club_id),false),'can_moderate',coalesce(private.club_user_has_permission(auth.uid(),p.club_id,'club.posts.moderate'),false),'can_notice',coalesce(private.club_user_has_permission(auth.uid(),p.club_id,'club.notices.manage'),false),
 'images',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'caption',m.caption,'visibility',m.visibility) order by a.position) from private.club_post_photos a join public.club_media m on m.id=a.media_id where a.post_id=p.id and private.club_photo_readable(m)),'[]'::jsonb),
 'shared_course',case when p.author_user_id=auth.uid() or private.club_user_has_permission(auth.uid(),p.club_id,'club.posts.moderate') then (select jsonb_build_object('key',x.course_key,'name',x.name,'course_hidden',s.course_hidden) from private.club_course_shares s join public.courses x on x.id=s.course_id where s.post_id=p.id and not s.withdrawn limit 1) else null end)
 from public.clubs c where c.id=p.club_id
$$;

create or replace function public.read_course_stories_with_clubs(p_course_key text,p_category text default null,p_offset integer default 0,p_preview boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.courses;base jsonb;items jsonb;shared_count integer;begin
 base:=public.course_story_read(p_course_key,null,p_category,p_offset,p_preview,false);
 select * into c from public.courses where course_key=p_course_key and course_status='active' and course_type='field';
 if c.id is null then return base;end if;
 select count(*) into shared_count from private.club_visible_course_shares(c.id,'post') s join public.club_posts p on p.id=s.post_id where p_category is null or p_category=case when p.post_type='question' then 'question' else 'free' end;
 with combined as (
  select p.pinned,p.created_at,p.id,private.course_story_json(p) as data from public.course_discussion_posts p where p.course_id=c.id and p.post_status='published' and p.moderation_hidden_at is null and (p_category is null or p.category=p_category) and (not p_preview or not p.pinned)
  union all
  select false,p.created_at,p.id,jsonb_build_object('post_key',p.id::text,'title',p.title,'body',p.content_summary,'author_display_name',club.name||' 동호회','created_at',p.created_at,'category',case when p.post_type='question' then 'question' else 'free' end,'processing_status',null,'version',p.version,'pinned',false,'pinned_by',null,'pinned_at',null,'can_edit',false,'can_message',false,'can_manage',false,'hidden',false,'images','[]'::jsonb,'comment_count',0,'source_club_key',club.legacy_key,'source_club_name',club.name,'source_id',p.id,'share_id',s.id,'share_version',s.version,'can_hide',private.course_can_manage(c.id))
  from private.club_visible_course_shares(c.id,'post') s join public.club_posts p on p.id=s.post_id join public.clubs club on club.id=s.club_id where p_category is null or p_category=case when p.post_type='question' then 'question' else 'free' end
 ),limited as(select * from combined order by pinned desc,created_at desc,id limit case when p_preview then 4 else 20 end offset p_offset)
 select coalesce(jsonb_agg(data order by pinned desc,created_at desc,id),'[]'::jsonb) into items from limited;
 return base||jsonb_build_object('items',items,'total',(base->>'total')::integer+shared_count);
end $$;
