-- Public directory eligibility is independent of lifecycle and membership authorization.
-- No key/name/date heuristics: only a completed official registration with matching audit
-- is evidence for the initial backfill. Existing identities and dependencies stay intact.
alter table public.clubs add column directory_is_public boolean not null default false;
comment on column public.clubs.directory_is_public is
  'Public directory eligibility; not lifecycle, membership authority, or institutional verification.';

update public.clubs as club
set directory_is_public = true
where exists (
  select 1 from private.club_mutation_requests as request
  join public.audit_logs as audit
    on audit.actor_id = request.actor_id
   and audit.request_id = request.request_id
   and audit.action = 'club.register'
   and audit.target_type = 'club'
   and audit.target_id = club.id::text
   and audit.outcome = 'success'
  where request.club_id = club.id
    and request.action_code = 'club.register'
    and request.outcome = 'success'
    and request.completed_at is not null
    and request.result_data ->> 'public_key' = club.legacy_key
);

-- Official self-service registration is already atomic and immediately public.
-- Publish only on its first successful completion; replays do not republish hidden rows.
create function private.publish_completed_club_registration()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if old.completed_at is null and new.completed_at is not null
     and new.action_code = 'club.register' and new.outcome = 'success' then
    if new.actor_id is distinct from (select auth.uid()) or not exists (
      select 1 from public.audit_logs as audit
      where audit.actor_id = new.actor_id and audit.request_id = new.request_id
        and audit.action = 'club.register' and audit.target_type = 'club'
        and audit.target_id = new.club_id::text and audit.outcome = 'success'
    ) then
      raise exception '동호회 등록 완료 근거를 확인할 수 없습니다.';
    end if;
    update public.clubs as club set directory_is_public = true
    where club.id = new.club_id
      and club.legacy_key = new.result_data ->> 'public_key';
    if not found then raise exception '동호회 등록 대상을 확인할 수 없습니다.'; end if;
  end if;
  return new;
end;
$$;
revoke all on function private.publish_completed_club_registration() from public, anon, authenticated, service_role;
create trigger publish_completed_club_registration
after update on private.club_mutation_requests
for each row execute function private.publish_completed_club_registration();

-- Public rows and legitimate internal membership reads are separate policies.
alter policy "Anyone can read active clubs" on public.clubs
using (club_status = 'active' and directory_is_public);
create policy "Active members can read their internal clubs"
on public.clubs for select to authenticated
using (
  club_status = 'active' and exists (
    select 1 from public.club_memberships as membership
    join public.user_accounts as account on account.id = membership.user_id
    where membership.club_id = clubs.id
      and membership.user_id = (select auth.uid())
      and membership.membership_status = 'active'
      and account.account_status = 'active'
  )
);

-- New public intake is denied even if an undiscoverable UUID is already known.
-- Existing applications/inquiries and their replay/read/management contracts are untouched.
create function private.enforce_public_club_intake()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform 1 from public.clubs as club
  where club.id = new.club_id and club.club_status = 'active' and club.directory_is_public
  for share;
  if not found then
    raise exception '공개된 동호회에서만 새로운 가입 신청·문의를 접수할 수 있습니다.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_public_club_intake() from public, anon, authenticated, service_role;
create trigger enforce_public_club_application_intake
before insert on public.club_membership_applications
for each row execute function private.enforce_public_club_intake();
create trigger enforce_public_club_inquiry_intake
before insert on public.club_join_inquiries
for each row execute function private.enforce_public_club_intake();

CREATE OR REPLACE FUNCTION public.get_club_core_content(p_club_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_can_read_notices boolean := false;
  v_can_read_posts boolean := false;
  v_can_read_events boolean := false;
  v_can_create_notices boolean := false;
  v_can_manage_notices boolean := false;
  v_can_create_posts boolean := false;
  v_can_moderate_posts boolean := false;
  v_can_create_events boolean := false;
  v_can_manage_events boolean := false;
begin
  if p_club_id is null or not exists (
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
    v_can_read_posts := private.club_user_has_permission(v_actor_id, p_club_id, 'club.posts.read');
    v_can_read_events := private.club_user_has_permission(v_actor_id, p_club_id, 'club.events.read');
    v_can_create_notices := private.club_user_has_permission(v_actor_id, p_club_id, 'club.notices.create');
    v_can_manage_notices := private.club_user_has_permission(v_actor_id, p_club_id, 'club.notices.manage');
    v_can_create_posts := private.club_user_has_permission(v_actor_id, p_club_id, 'club.posts.create');
    v_can_moderate_posts := private.club_user_has_permission(v_actor_id, p_club_id, 'club.posts.moderate');
    v_can_create_events := private.club_user_has_permission(v_actor_id, p_club_id, 'club.events.create');
    v_can_manage_events := private.club_user_has_permission(v_actor_id, p_club_id, 'club.events.manage');
  end if;

  return pg_catalog.jsonb_build_object(
    'notices', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(visible_notice) - 'importance_rank'
        order by visible_notice.importance_rank, visible_notice.published_at desc, visible_notice.id
      )
      from (
        select
          notice.id,
          notice.title,
          notice.content_summary,
          notice.notice_type,
          notice.importance,
          notice.visibility,
          notice.notice_status,
          notice.published_at,
          notice.created_at,
          notice.updated_at,
          notice.version,
          case notice.author_role_code
            when 'club_admin' then 'clubAdmin'
            when 'club_vice_admin' then 'clubAdmin'
            else 'clubManager'
          end as author_role,
          v_can_manage_notices as can_manage,
          case notice.importance when 'urgent' then 0 when 'important' then 1 else 2 end as importance_rank
        from public.club_notices as notice
        where notice.club_id = p_club_id
          and notice.notice_status = 'published'
          and (
            notice.visibility = 'public'
            or (notice.visibility = 'club_members' and v_can_read_notices)
          )
        order by importance_rank, notice.published_at desc, notice.id
        limit 50
      ) as visible_notice
    ), '[]'::jsonb),
    'posts', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(visible_post) order by visible_post.published_at desc, visible_post.id)
      from (
        select
          post.id,
          post.title,
          post.content_summary,
          post.post_type,
          post.starts_at,
          post.ends_at,
          post.linked_course_legacy_key,
          post.location,
          post.capacity,
          post.participant_target,
          post.recruitment_status,
          post.visibility,
          post.moderation_status,
          post.post_status,
          post.published_at,
          post.created_at,
          post.updated_at,
          post.version,
          case post.author_role_code
            when 'club_admin' then 'clubAdmin'
            when 'club_vice_admin' then 'clubAdmin'
            when 'club_manager' then 'clubManager'
            else 'member'
          end as author_role,
          case
            when profile.display_name is null then null
            when post.author_user_id = v_actor_id then profile.display_name
            when profile.profile_visibility = 'public' then profile.display_name
            when post.visibility = 'club_members'
             and v_can_read_posts
             and profile.profile_visibility = 'members' then profile.display_name
            else null
          end as author_display_name,
          (post.author_user_id = v_actor_id and v_can_create_posts) as can_edit,
          ((post.author_user_id = v_actor_id and v_can_create_posts) or v_can_moderate_posts) as can_delete
        from public.club_posts as post
        left join public.user_profiles as profile
          on profile.user_id = post.author_user_id
        where post.club_id = p_club_id
          and post.moderation_status = 'visible'
          and post.post_status in ('published', 'edited')
          and (
            post.visibility = 'public'
            or (post.visibility = 'club_members' and v_can_read_posts)
          )
        order by post.published_at desc, post.id
        limit 50
      ) as visible_post
    ), '[]'::jsonb),
    'official_events', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(visible_event) order by visible_event.starts_at, visible_event.id)
      from (
        select
          event.id,
          event.event_type,
          event.event_status,
          event.title,
          event.starts_at,
          event.ends_at,
          event.linked_course_legacy_key,
          event.location,
          event.participant_target,
          event.capacity,
          event.reservation_method,
          event.member_reservation_guidance,
          event.organizer_guidance,
          event.visibility,
          event.moderation_status,
          event.version,
          event.created_at,
          event.updated_at,
          case event.creator_role_code
            when 'club_admin' then 'clubAdmin'
            when 'club_vice_admin' then 'clubAdmin'
            else 'clubManager'
          end as creator_role,
          v_can_manage_events as can_manage
        from public.club_official_events as event
        where event.club_id = p_club_id
          and event.moderation_status = 'visible'
          and event.event_status <> 'draft'
          and (
            event.visibility = 'public'
            or (event.visibility = 'club_members' and v_can_read_events)
          )
        order by event.starts_at, event.id
        limit 50
      ) as visible_event
    ), '[]'::jsonb),
    'capabilities', pg_catalog.jsonb_build_object(
      'can_create_notice', v_can_create_notices,
      'can_manage_notice', v_can_manage_notices,
      'can_create_post', v_can_create_posts,
      'can_moderate_post', v_can_moderate_posts,
      'can_create_event', v_can_create_events,
      'can_manage_event', v_can_manage_events
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_club_event_participation(p_club_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_can_read_events boolean := false;
  v_can_join boolean := false;
  v_membership_id uuid;
begin
  if p_club_id is null or not exists (
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
    v_can_read_events := private.club_user_has_permission(
      v_actor_id,
      p_club_id,
      'club.events.read'
    );
    v_can_join := private.club_user_has_permission(
      v_actor_id,
      p_club_id,
      'club.events.join'
    );

    if v_can_join then
      select membership.id
      into v_membership_id
      from public.club_memberships as membership
      where membership.club_id = p_club_id
        and membership.user_id = v_actor_id
        and membership.membership_status = 'active';
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'authentication_status', case when v_actor_id is null then 'anonymous' else 'authenticated' end,
    'can_join', v_can_join,
    'events', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'event_id', visible_event.id,
          'participant_count', visible_event.participant_count,
          'is_participating', visible_event.is_participating,
          'joined_at', visible_event.joined_at
        )
        order by visible_event.starts_at, visible_event.id
      )
      from (
        select
          event.id,
          event.starts_at,
          (
            select pg_catalog.count(*)::integer
            from public.club_official_event_participations as participation
            join public.club_memberships as membership
              on membership.id = participation.membership_id
             and membership.club_id = event.club_id
             and membership.membership_status = 'active'
            join public.user_accounts as account
              on account.id = membership.user_id
             and account.account_status = 'active'
            where participation.event_id = event.id
          ) as participant_count,
          exists (
            select 1
            from public.club_official_event_participations as participation
            where participation.event_id = event.id
              and participation.membership_id = v_membership_id
          ) as is_participating,
          (
            select participation.joined_at
            from public.club_official_event_participations as participation
            where participation.event_id = event.id
              and participation.membership_id = v_membership_id
          ) as joined_at
        from public.club_official_events as event
        where event.club_id = p_club_id
          and event.moderation_status = 'visible'
          and event.event_status <> 'draft'
          and (
            event.visibility = 'public'
            or (event.visibility = 'club_members' and v_can_read_events)
          )
        order by event.starts_at, event.id
        limit 50
      ) as visible_event
    ), '[]'::jsonb)
  );
end;
$function$;

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

CREATE OR REPLACE FUNCTION public.get_public_club(p_public_key text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select pg_catalog.jsonb_build_object(
    'public_key', club.legacy_key,
    'name', club.name,
    'region', club.region,
    'district', club.district,
    'region_label', coalesce(
      nullif(pg_catalog.concat_ws(' ', club.region, club.district), ''),
      '지역 정보 미등록'
    ),
    'summary', club.summary,
    'recruitment_status', club.membership_recruitment_status,
    'created_at', club.created_at
  )
  from public.clubs as club
  where club.legacy_key = nullif(pg_catalog.btrim(p_public_key), '')
    and club.club_status = 'active'
      and club.directory_is_public;
$function$;

CREATE OR REPLACE FUNCTION public.list_public_clubs(p_keyword text DEFAULT NULL::text, p_region text DEFAULT NULL::text, p_district text DEFAULT NULL::text, p_recruitment_status text DEFAULT NULL::text, p_limit integer DEFAULT 24, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_keyword text := nullif(pg_catalog.btrim(p_keyword), '');
  v_region text := nullif(pg_catalog.btrim(p_region), '');
  v_district text := nullif(pg_catalog.btrim(p_district), '');
  v_limit integer := least(greatest(coalesce(p_limit, 24), 1), 30);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total integer;
  v_items jsonb;
begin
  if v_keyword is not null and pg_catalog.char_length(v_keyword) > 100 then
    raise exception '검색어는 100자 이하여야 합니다.';
  end if;
  if v_region is not null and v_region not in (
    '서울', '경기', '인천', '충북', '충남', '강원', '전북', '전남',
    '경북', '경남', '부산', '대구', '광주', '대전', '울산', '제주'
  ) then
    raise exception '지역을 확인해 주세요.';
  end if;
  if v_district is not null and pg_catalog.char_length(v_district) > 80 then
    raise exception '활동 지역은 80자 이하여야 합니다.';
  end if;
  if p_recruitment_status is not null
     and p_recruitment_status not in ('recruiting', 'waiting', 'closed') then
    raise exception '회원 모집 상태를 확인해 주세요.';
  end if;

  select pg_catalog.count(*)::integer
  into v_total
  from public.clubs as club
  where club.club_status = 'active'
      and club.directory_is_public
    and club.legacy_key is not null
    and (v_region is null or club.region = v_region)
    and (v_district is null or club.district ilike '%' || v_district || '%')
    and (
      p_recruitment_status is null
      or club.membership_recruitment_status = p_recruitment_status
    )
    and (
      v_keyword is null
      or club.name ilike '%' || v_keyword || '%'
      or club.region ilike '%' || v_keyword || '%'
      or club.district ilike '%' || v_keyword || '%'
      or club.summary ilike '%' || v_keyword || '%'
    );

  select coalesce(
    pg_catalog.jsonb_agg(page.item order by page.created_at desc, page.id desc),
    '[]'::jsonb
  )
  into v_items
  from (
    select club.id, club.created_at,
      pg_catalog.jsonb_build_object(
        'public_key', club.legacy_key,
        'name', club.name,
        'region', club.region,
        'district', club.district,
        'region_label', coalesce(
          nullif(pg_catalog.concat_ws(' ', club.region, club.district), ''),
          '지역 정보 미등록'
        ),
        'summary', club.summary,
        'recruitment_status', club.membership_recruitment_status,
        'created_at', club.created_at
      ) as item
    from public.clubs as club
    where club.club_status = 'active'
      and club.directory_is_public
      and club.legacy_key is not null
      and (v_region is null or club.region = v_region)
      and (v_district is null or club.district ilike '%' || v_district || '%')
      and (
        p_recruitment_status is null
        or club.membership_recruitment_status = p_recruitment_status
      )
      and (
        v_keyword is null
        or club.name ilike '%' || v_keyword || '%'
        or club.region ilike '%' || v_keyword || '%'
        or club.district ilike '%' || v_keyword || '%'
        or club.summary ilike '%' || v_keyword || '%'
      )
    order by club.created_at desc, club.id desc
    limit v_limit offset v_offset
  ) as page;

  return pg_catalog.jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'has_more', v_offset + pg_catalog.jsonb_array_length(v_items) < v_total
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_public_course_clubs(p_course_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_course_key text := nullif(pg_catalog.btrim(p_course_key), '');
  v_course_id uuid;
  v_result jsonb;
begin
  if v_course_key is null
     or v_course_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'
     or v_course_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception '골프장을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  select course.id
  into v_course_id
  from public.courses as course
  where course.course_key = v_course_key
    and course.course_status = 'active';

  if not found then
    raise exception '골프장을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'public_key', club.legacy_key,
        'name', club.name,
        'region', club.region,
        'district', club.district,
        'region_label', coalesce(
          nullif(pg_catalog.concat_ws(' ', club.region, club.district), ''),
          '지역 정보 미등록'
        ),
        'summary', club.summary,
        'recruitment_status', club.membership_recruitment_status,
        'created_at', club.created_at
      )
      order by club.name, club.legacy_key
    ),
    '[]'::jsonb
  )
  into v_result
  from public.course_club_links as link
  join public.clubs as club
    on club.id = link.club_id
   and club.club_status = 'active'
      and club.directory_is_public
   and club.legacy_key is not null
  where link.course_id = v_course_id;

  return v_result;
end;
$function$;
-- A correction Inbox can be empty. Its display context must not depend on a
-- correction row, public visibility, or membership-only table SELECT access.
-- Reuse the exact existing correction-management authorization predicate.
create function public.get_club_directory_correction_management_context(p_club_public_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $context$
declare
  v_actor_id uuid := auth.uid();
  v_key text := pg_catalog.btrim(p_club_public_key);
  v_club_id uuid;
  v_name text;
begin
  if v_actor_id is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  if v_key is null or v_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' then
    raise exception '관리할 동호회를 확인해 주세요.' using errcode = '22023';
  end if;
  select club.id, club.name into v_club_id, v_name
  from public.clubs as club
  where club.legacy_key = v_key and club.club_status = 'active';
  if not found then
    raise exception '관리할 동호회를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  if not private.club_directory_correction_actor_can_manage(v_actor_id, v_club_id) then
    raise exception '동호회 정보 수정 제보 관리 권한이 없습니다.' using errcode = '42501';
  end if;
  return pg_catalog.jsonb_build_object('name', v_name);
end;
$context$;
revoke all on function public.get_club_directory_correction_management_context(text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_club_directory_correction_management_context(text) to authenticated;
