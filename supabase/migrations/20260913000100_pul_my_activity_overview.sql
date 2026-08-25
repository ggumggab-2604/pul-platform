-- PUL 9-1: member-centered activity overview for the authenticated user's My page.
-- This is a read-only projection. It exposes only the caller's own activity and public/context labels.

create function public.get_my_activity_overview(
  p_item_limit integer default 6
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.user_accounts as account
    where account.id = v_actor_id
  ) then
    raise exception '계정 정보를 확인할 수 없습니다.' using errcode = '42501';
  end if;

  if p_item_limit is null or p_item_limit not between 1 and 12 then
    raise exception '내 활동 조회 범위를 확인해 주세요.';
  end if;

  return pg_catalog.jsonb_build_object(
    'clubs', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'public_key', page.public_key,
          'name', page.name,
          'region_label', page.region_label,
          'membership_status', page.membership_status,
          'joined_at', page.joined_at
        )
        order by page.joined_at desc, page.membership_id desc
      )
      from (
        select
          membership.id as membership_id,
          club.legacy_key as public_key,
          club.name,
          coalesce(
            nullif(pg_catalog.concat_ws(' ', club.region, club.district), ''),
            '지역 정보 미등록'
          ) as region_label,
          membership.membership_status,
          membership.joined_at
        from public.club_memberships as membership
        join public.clubs as club
          on club.id = membership.club_id
         and club.club_status = 'active'
         and club.legacy_key is not null
        where membership.user_id = v_actor_id
          and membership.membership_status in ('active', 'suspended')
        order by membership.joined_at desc, membership.id desc
        limit p_item_limit
      ) as page
    ), '[]'::jsonb),

    'upcoming_events', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'club_public_key', page.club_public_key,
          'club_name', page.club_name,
          'title', page.title,
          'starts_at', page.starts_at,
          'ends_at', page.ends_at,
          'location', page.location,
          'event_status', page.event_status,
          'joined_at', page.joined_at
        )
        order by page.starts_at, page.event_sort_id
      )
      from (
        select
          event.id as event_sort_id,
          club.legacy_key as club_public_key,
          club.name as club_name,
          event.title,
          event.starts_at,
          event.ends_at,
          event.location,
          event.event_status,
          participation.joined_at
        from public.club_official_event_participations as participation
        join public.club_memberships as membership
          on membership.id = participation.membership_id
         and membership.user_id = v_actor_id
         and membership.membership_status = 'active'
        join public.club_official_events as event
          on event.id = participation.event_id
         and event.club_id = membership.club_id
         and event.moderation_status = 'visible'
         and event.event_status not in ('draft', 'cancelled', 'completed')
         and event.starts_at >= pg_catalog.now()
        join public.clubs as club
          on club.id = membership.club_id
         and club.club_status = 'active'
         and club.legacy_key is not null
        where event.visibility = 'public'
           or private.club_user_has_permission(v_actor_id, event.club_id, 'club.events.read')
        order by event.starts_at, event.id
        limit p_item_limit
      ) as page
    ), '[]'::jsonb),

    'posts', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'kind', page.kind,
          'title', page.title,
          'summary', page.summary,
          'context_label', page.context_label,
          'href', page.href,
          'created_at', page.created_at
        )
        order by page.created_at desc, page.sort_id desc
      )
      from (
        select activity.*
        from (
          select
            post.id as sort_id,
            'community'::text as kind,
            post.title,
            pg_catalog.left(post.body, 180) as summary,
            null::text as context_label,
            '/community/' || post.id::text as href,
            post.created_at
          from public.community_posts as post
          where post.author_user_id = v_actor_id
            and post.post_status = 'published'

          union all

          select
            post.id as sort_id,
            'club'::text as kind,
            post.title,
            pg_catalog.left(post.content_summary, 180) as summary,
            club.name as context_label,
            '/clubs/' || club.legacy_key as href,
            post.created_at
          from public.club_posts as post
          join public.clubs as club
            on club.id = post.club_id
           and club.club_status = 'active'
           and club.legacy_key is not null
          where post.author_user_id = v_actor_id
            and post.moderation_status = 'visible'
            and post.post_status in ('published', 'edited')
            and (
              post.visibility = 'public'
              or private.club_user_has_permission(v_actor_id, post.club_id, 'club.posts.read')
            )

          union all

          select
            post.id as sort_id,
            'course'::text as kind,
            '골프장 이야기'::text as title,
            pg_catalog.left(post.body, 180) as summary,
            course.name as context_label,
            '/courses/' || course.course_key || '/stories' as href,
            post.created_at
          from public.course_discussion_posts as post
          join public.courses as course
            on course.id = post.course_id
           and course.course_status = 'active'
          where post.author_user_id = v_actor_id
            and post.post_status = 'published'

          union all

          select
            post.id as sort_id,
            'certification'::text as kind,
            '자격증 시험 준비 이야기'::text as title,
            pg_catalog.left(post.body, 180) as summary,
            '자격증·심판'::text as context_label,
            '/certification/study'::text as href,
            post.created_at
          from public.certification_study_posts as post
          where post.author_user_id = v_actor_id
            and post.post_status = 'published'
        ) as activity
        order by activity.created_at desc, activity.sort_id desc
        limit p_item_limit
      ) as page
    ), '[]'::jsonb),

    'market_items', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'kind', page.kind,
          'title', page.title,
          'amount', page.amount,
          'region', page.region,
          'status', page.status,
          'href', '/market',
          'created_at', page.created_at
        )
        order by page.created_at desc, page.sort_id desc
      )
      from (
        select market_activity.*
        from (
          select
            listing.id as sort_id,
            'listing'::text as kind,
            listing.title,
            listing.price_amount as amount,
            listing.region_code as region,
            listing.listing_status as status,
            listing.created_at
          from public.market_listings as listing
          where listing.seller_user_id = v_actor_id
            and listing.listing_status <> 'removed'

          union all

          select
            request.id as sort_id,
            'buy_request'::text as kind,
            request.title,
            request.budget_amount as amount,
            request.region_code as region,
            request.request_status as status,
            request.created_at
          from public.market_buy_requests as request
          where request.author_user_id = v_actor_id
            and request.request_status <> 'removed'
        ) as market_activity
        order by market_activity.created_at desc, market_activity.sort_id desc
        limit p_item_limit
      ) as page
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.get_my_activity_overview(integer) is
  'Returns bounded My-page activity for only the authenticated caller: memberships, joined upcoming club events, authored posts, and marketplace items.';

revoke all on function public.get_my_activity_overview(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_activity_overview(integer)
  to authenticated;
