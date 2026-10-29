-- Hidden activity photos must stay out of both legacy public projections.
-- Keep the existing DTO, access checks and management gallery unchanged.
CREATE OR REPLACE FUNCTION public.get_club_media_content(p_club_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_can_read_notices boolean := false;
  v_can_read_events boolean := false;
  v_can_read_posts boolean := false;
  v_can_manage_media boolean := false;
  v_representative jsonb;
  v_activity_photos jsonb := '[]'::jsonb;
  v_recent_activities jsonb := '[]'::jsonb;
begin
  if not exists (
    select 1
    from public.clubs as club
    where club.id = p_club_id
      and club.club_status = 'active'
      and (club.directory_is_public or exists (
        select 1 from public.club_memberships as membership
        join public.user_accounts as account on account.id = membership.user_id
        where membership.club_id = club.id
          and membership.user_id = (select auth.uid())
          and membership.membership_status = 'active'
          and account.account_status = 'active'
      ))
  ) then
    raise exception '동호회를 찾을 수 없습니다.';
  end if;

  if v_actor_id is not null then
    v_can_read_notices := private.club_user_has_permission(v_actor_id, p_club_id, 'club.notices.read');
    v_can_read_events := private.club_user_has_permission(v_actor_id, p_club_id, 'club.events.read');
    v_can_read_posts := private.club_user_has_permission(v_actor_id, p_club_id, 'club.posts.read');
    v_can_manage_media := private.club_user_has_permission(v_actor_id, p_club_id, 'club.media.review');
  end if;

  select pg_catalog.jsonb_build_object(
    'id', media.id,
    'media_kind', media.media_kind,
    'storage_bucket', media.storage_bucket,
    'storage_path', media.storage_path,
    'caption', media.caption,
    'activity_type', media.activity_type,
    'taken_on', media.taken_on,
    'created_at', media.created_at,
    'version', media.version,
    'can_manage', v_can_manage_media
  )
  into v_representative
  from public.club_media as media
  where media.club_id = p_club_id
    and not media.gallery_hidden
    and media.media_kind = 'representative'
    and media.media_status = 'available'
  limit 1;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', media.id,
        'media_kind', media.media_kind,
        'storage_bucket', media.storage_bucket,
        'storage_path', media.storage_path,
        'caption', media.caption,
        'activity_type', media.activity_type,
        'taken_on', media.taken_on,
        'created_at', media.created_at,
        'version', media.version,
        'can_manage', v_can_manage_media
      )
      order by coalesce(media.taken_on, media.created_at::date) desc, media.created_at desc, media.id
    ),
    '[]'::jsonb
  )
  into v_activity_photos
  from public.club_media as media
  where media.club_id = p_club_id
    and media.media_kind = 'activity'
    and not media.gallery_hidden
    and media.media_status = 'available';

  with recent_source as (
    select
      'notice:' || notice.id::text as id,
      'notice'::text as source_type,
      case when notice.importance in ('important', 'urgent') then '중요 공지가 등록되었습니다' else '새 공지가 등록되었습니다' end as title,
      notice.title as summary,
      notice.created_at as occurred_at,
      case when notice.notice_type = 'event' then 'community_event' else 'other' end as activity_type,
      notice.visibility
    from public.club_notices as notice
    where notice.club_id = p_club_id
      and notice.notice_status = 'published'
      and (notice.visibility = 'public' or (notice.visibility = 'club_members' and v_can_read_notices))

    union all

    select
      'event:' || event.id::text,
      'event'::text,
      case event.event_type
        when 'monthly_meeting' then '월례회 일정이 등록되었습니다'
        when 'friendly_match' then '친선 경기 일정이 등록되었습니다'
        else '새 공식 일정이 등록되었습니다'
      end,
      event.title,
      event.created_at,
      case event.event_type
        when 'monthly_meeting' then 'monthly_meeting'
        when 'club_tournament' then 'tournament'
        when 'screen_tournament' then 'screen_event'
        when 'friendly_match' then 'friendly_match'
        when 'outing' then 'outing'
        when 'training' then 'training'
        else 'other'
      end,
      event.visibility
    from public.club_official_events as event
    where event.club_id = p_club_id
      and event.event_status <> 'cancelled'
      and event.moderation_status = 'visible'
      and (event.visibility = 'public' or (event.visibility = 'club_members' and v_can_read_events))

    union all

    select
      'post:' || post.id::text,
      'post'::text,
      case post.post_type
        when 'flash_meeting' then '새 번개 모임이 등록되었습니다'
        when 'companion' then '새 같이 가요 글이 등록되었습니다'
        when 'round_review' then '라운드 후기가 올라왔습니다'
        else '새 게시글이 등록되었습니다'
      end,
      post.title,
      post.created_at,
      'other'::text,
      post.visibility
    from public.club_posts as post
    where post.club_id = p_club_id
      and post.post_status in ('published', 'edited')
      and post.moderation_status = 'visible'
      and (post.visibility = 'public' or (post.visibility = 'club_members' and v_can_read_posts))

    union all

    select
      'photo:' || media.id::text,
      'photo'::text,
      '새 활동사진이 등록되었습니다',
      coalesce(media.caption, '동호회 활동사진'),
      media.created_at,
      media.activity_type,
      'public'::text
    from public.club_media as media
    where media.club_id = p_club_id
      and media.media_kind = 'activity'
      and not media.gallery_hidden
      and media.media_status = 'available'
  ), limited_recent as (
    select *
    from recent_source
    order by occurred_at desc, id
    limit 5
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', recent.id,
        'source_type', recent.source_type,
        'title', recent.title,
        'summary', recent.summary,
        'occurred_at', recent.occurred_at,
        'activity_type', recent.activity_type,
        'visibility', recent.visibility
      )
      order by recent.occurred_at desc, recent.id
    ),
    '[]'::jsonb
  )
  into v_recent_activities
  from limited_recent as recent;

  return pg_catalog.jsonb_build_object(
    'representative_photo', v_representative,
    'activity_photos', v_activity_photos,
    'recent_activities', v_recent_activities,
    'capabilities', pg_catalog.jsonb_build_object(
      'can_manage_media', v_can_manage_media
    )
  );
end;
$function$;
