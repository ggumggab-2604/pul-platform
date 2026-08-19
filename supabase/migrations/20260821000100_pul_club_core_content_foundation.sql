-- PUL 8-7: minimal real-data foundation for club notices, posts, and official events.
-- Existing club roles and functional permissions remain the sole authorization source.

create table public.club_notices (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete restrict,
  author_user_id uuid not null references public.user_accounts (id) on delete restrict,
  author_role_code text not null
    references public.club_role_definitions (role_code) on delete restrict,
  notice_type text not null,
  importance text not null default 'normal',
  title text not null,
  content_summary text not null,
  visibility text not null default 'club_members',
  notice_status text not null default 'published',
  version integer not null default 1,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_notices_type_check
    check (notice_type in ('general', 'schedule', 'rule', 'urgent', 'event', 'closure')),
  constraint club_notices_importance_check
    check (importance in ('normal', 'important', 'urgent')),
  constraint club_notices_title_check
    check (title = btrim(title) and char_length(title) between 2 and 120),
  constraint club_notices_summary_check
    check (
      content_summary = btrim(content_summary)
      and char_length(content_summary) between 1 and 2000
    ),
  constraint club_notices_visibility_check
    check (visibility in ('public', 'club_members')),
  constraint club_notices_status_check
    check (notice_status in ('draft', 'published', 'hidden', 'archived')),
  constraint club_notices_version_check check (version >= 1)
);

comment on table public.club_notices is
  'Club-scoped notices. Browser reads and writes are exposed only through guarded RPCs.';

create table public.club_posts (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete restrict,
  author_user_id uuid not null references public.user_accounts (id) on delete restrict,
  author_role_code text not null
    references public.club_role_definitions (role_code) on delete restrict,
  post_type text not null,
  title text not null,
  content_summary text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  linked_course_legacy_key text,
  location text,
  capacity integer,
  participant_target text,
  recruitment_status text,
  visibility text not null default 'club_members',
  moderation_status text not null default 'visible',
  post_status text not null default 'published',
  version integer not null default 1,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_posts_type_check
    check (
      post_type in (
        'general',
        'flash_meeting',
        'companion',
        'question',
        'round_review',
        'event_review',
        'information'
      )
    ),
  constraint club_posts_title_check
    check (title = btrim(title) and char_length(title) between 2 and 120),
  constraint club_posts_summary_check
    check (
      content_summary = btrim(content_summary)
      and char_length(content_summary) between 1 and 5000
    ),
  constraint club_posts_period_check
    check (ends_at is null or (starts_at is not null and ends_at > starts_at)),
  constraint club_posts_course_check
    check (
      linked_course_legacy_key is null
      or (
        linked_course_legacy_key = btrim(linked_course_legacy_key)
        and linked_course_legacy_key <> ''
        and char_length(linked_course_legacy_key) <= 100
      )
    ),
  constraint club_posts_location_check
    check (
      location is null
      or (location = btrim(location) and char_length(location) between 1 and 200)
    ),
  constraint club_posts_capacity_check
    check (capacity is null or capacity between 2 and 1000),
  constraint club_posts_participant_target_check
    check (
      participant_target is null
      or (
        participant_target = btrim(participant_target)
        and char_length(participant_target) between 1 and 200
      )
    ),
  constraint club_posts_recruitment_status_check
    check (
      recruitment_status is null
      or recruitment_status in ('recruiting', 'full', 'closed', 'completed', 'cancelled')
    ),
  constraint club_posts_recruitment_fields_check
    check (
      post_type not in ('flash_meeting', 'companion')
      or (
        starts_at is not null
        and location is not null
        and capacity is not null
        and recruitment_status is not null
      )
    ),
  constraint club_posts_visibility_check
    check (visibility in ('public', 'club_members')),
  constraint club_posts_moderation_check
    check (moderation_status in ('visible', 'hidden')),
  constraint club_posts_status_check
    check (post_status in ('published', 'edited', 'deleted', 'archived')),
  constraint club_posts_version_check check (version >= 1)
);

comment on table public.club_posts is
  'Member-authored club board posts, including lightweight flash-meeting and companion recruitment posts.';

create table public.club_official_events (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete restrict,
  creator_user_id uuid not null references public.user_accounts (id) on delete restrict,
  creator_role_code text not null
    references public.club_role_definitions (role_code) on delete restrict,
  event_type text not null,
  event_status text not null default 'scheduled',
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  linked_course_legacy_key text,
  location text not null,
  participant_target text not null,
  capacity integer,
  reservation_method text not null default 'checking',
  member_reservation_guidance text,
  organizer_guidance text,
  visibility text not null default 'club_members',
  moderation_status text not null default 'visible',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_official_events_type_check
    check (
      event_type in (
        'monthly_meeting',
        'club_tournament',
        'screen_tournament',
        'friendly_match',
        'outing',
        'year_end_party',
        'new_year_event',
        'general_meeting',
        'training',
        'other'
      )
    ),
  constraint club_official_events_status_check
    check (
      event_status in (
        'draft',
        'scheduled',
        'registration_open',
        'registration_closed',
        'completed',
        'cancelled'
      )
    ),
  constraint club_official_events_title_check
    check (title = btrim(title) and char_length(title) between 2 and 120),
  constraint club_official_events_period_check
    check (ends_at is null or ends_at > starts_at),
  constraint club_official_events_course_check
    check (
      linked_course_legacy_key is null
      or (
        linked_course_legacy_key = btrim(linked_course_legacy_key)
        and linked_course_legacy_key <> ''
        and char_length(linked_course_legacy_key) <= 100
      )
    ),
  constraint club_official_events_location_check
    check (location = btrim(location) and char_length(location) between 1 and 200),
  constraint club_official_events_participant_target_check
    check (
      participant_target = btrim(participant_target)
      and char_length(participant_target) between 1 and 200
    ),
  constraint club_official_events_capacity_check
    check (capacity is null or capacity between 2 and 1000),
  constraint club_official_events_reservation_method_check
    check (
      reservation_method in (
        'individual_synchronized',
        'club_group_booking',
        'walk_in',
        'no_reservation',
        'checking'
      )
    ),
  constraint club_official_events_member_guidance_check
    check (
      member_reservation_guidance is null
      or (
        member_reservation_guidance = btrim(member_reservation_guidance)
        and char_length(member_reservation_guidance) between 1 and 1000
      )
    ),
  constraint club_official_events_organizer_guidance_check
    check (
      organizer_guidance is null
      or (
        organizer_guidance = btrim(organizer_guidance)
        and char_length(organizer_guidance) between 1 and 1000
      )
    ),
  constraint club_official_events_visibility_check
    check (visibility in ('public', 'club_members')),
  constraint club_official_events_moderation_check
    check (moderation_status in ('visible', 'hidden')),
  constraint club_official_events_version_check check (version >= 1)
);

comment on table public.club_official_events is
  'Operator-authored club schedules, monthly meetings, and lightweight official events; no RSVP subsystem is introduced.';

create index club_notices_club_publication_idx
  on public.club_notices (club_id, notice_status, visibility, published_at desc);
create index club_posts_club_publication_idx
  on public.club_posts (club_id, post_status, moderation_status, visibility, published_at desc);
create index club_posts_author_idx
  on public.club_posts (author_user_id, club_id, post_status);
create index club_official_events_club_schedule_idx
  on public.club_official_events (club_id, event_status, moderation_status, visibility, starts_at);

create trigger club_notices_set_updated_at
before update on public.club_notices
for each row execute function public.set_user_foundation_updated_at();

create trigger club_posts_set_updated_at
before update on public.club_posts
for each row execute function public.set_user_foundation_updated_at();

create trigger club_official_events_set_updated_at
before update on public.club_official_events
for each row execute function public.set_user_foundation_updated_at();

alter table public.club_notices enable row level security;
alter table public.club_notices force row level security;
alter table public.club_posts enable row level security;
alter table public.club_posts force row level security;
alter table public.club_official_events enable row level security;
alter table public.club_official_events force row level security;

revoke all on table public.club_notices from public, anon, authenticated, service_role;
revoke all on table public.club_posts from public, anon, authenticated, service_role;
revoke all on table public.club_official_events from public, anon, authenticated, service_role;

create function public.get_club_core_content(p_club_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
$$;

comment on function public.get_club_core_content(uuid) is
  'Returns only visible club notices, posts, official events, and boolean capabilities for the current caller.';

revoke all on function public.get_club_core_content(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_club_core_content(uuid)
  to anon, authenticated;

create function public.mutate_club_core_content(
  p_content_type text,
  p_operation text,
  p_request_id uuid,
  p_club_id uuid,
  p_content_id uuid default null,
  p_expected_version integer default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_account_status text;
  v_club_status text;
  v_actor_role_code text;
  v_content_id uuid;
  v_version integer;
  v_owner_id uuid;
  v_title text;
  v_summary text;
  v_visibility text;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_location text;
  v_capacity integer;
  v_participant_target text;
  v_linked_course text;
  v_optional_text text;
  v_action_code text;
  v_input_fingerprint text;
  v_ledger_action_code text;
  v_ledger_club_id uuid;
  v_ledger_fingerprint text;
  v_ledger_result jsonb;
  v_ledger_completed_at timestamptz;
  v_ledger_found boolean := false;
  v_completed_ledger_count integer;
  v_result jsonb;
begin
  if v_actor_id is null then
    raise exception '로그인이 필요합니다.';
  end if;
  if p_content_type not in ('notice', 'post', 'event') then
    raise exception '올바르지 않은 콘텐츠 종류입니다.';
  end if;
  if p_operation not in ('create', 'update', 'delete', 'cancel') then
    raise exception '올바르지 않은 작업입니다.';
  end if;
  if p_request_id is null then
    raise exception '요청 식별자가 필요합니다.';
  end if;
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception '입력 형식이 올바르지 않습니다.';
  end if;
  if p_operation = 'create' and (p_content_id is not null or p_expected_version is not null) then
    raise exception '새 콘텐츠 식별자가 올바르지 않습니다.';
  end if;
  if p_operation <> 'create' and (
    p_content_id is null or p_expected_version is null or p_expected_version < 1
  ) then
    raise exception '콘텐츠 식별자와 version이 필요합니다.';
  end if;
  if p_operation = 'cancel' and p_content_type <> 'event' then
    raise exception '일정만 취소할 수 있습니다.';
  end if;
  if p_operation = 'delete' and p_content_type = 'event' then
    raise exception '공식 일정은 삭제 대신 취소합니다.';
  end if;
  if (p_content_type in ('notice', 'post') and p_operation = 'cancel')
     or (p_content_type = 'event' and p_operation = 'delete') then
    raise exception '콘텐츠 종류와 작업이 일치하지 않습니다.';
  end if;

  v_action_code := 'club_content.' || p_content_type || '.' || p_operation;
  v_input_fingerprint := pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'action_code', v_action_code,
      'club_id', p_club_id,
      'content_id', p_content_id,
      'expected_version', p_expected_version,
      'payload', p_payload
    )::text
  );

  select account.account_status
  into v_account_status
  from public.user_accounts as account
  where account.id = v_actor_id
  for share;
  if not found or v_account_status <> 'active' then
    raise exception '정상 활동 계정만 이용할 수 있습니다.';
  end if;

  select
    ledger.action_code,
    ledger.club_id,
    ledger.input_fingerprint,
    ledger.result_data,
    ledger.completed_at
  into
    v_ledger_action_code,
    v_ledger_club_id,
    v_ledger_fingerprint,
    v_ledger_result,
    v_ledger_completed_at
  from private.club_mutation_requests as ledger
  where ledger.actor_id = v_actor_id
    and ledger.request_id = p_request_id
  for update;

  v_ledger_found := found;

  if v_ledger_found then
    if v_ledger_action_code is distinct from v_action_code
       or v_ledger_club_id is distinct from p_club_id
       or v_ledger_fingerprint is distinct from v_input_fingerprint then
      raise exception '같은 요청 식별자를 다른 입력에 재사용할 수 없습니다.';
    end if;

    if v_ledger_completed_at is not null then
      return v_ledger_result || pg_catalog.jsonb_build_object('replayed', true);
    end if;
  end if;

  select club.club_status
  into v_club_status
  from public.clubs as club
  where club.id = p_club_id
  for update;
  if not found or v_club_status <> 'active' then
    raise exception '활동 중인 동호회를 찾을 수 없습니다.';
  end if;

  select assignment.role_code
  into v_actor_role_code
  from public.club_memberships as membership
  join public.club_role_assignments as assignment
    on assignment.membership_id = membership.id
   and assignment.revoked_at is null
  join public.club_role_definitions as definition
    on definition.role_code = assignment.role_code
   and definition.is_active
  where membership.club_id = p_club_id
    and membership.user_id = v_actor_id
    and membership.membership_status = 'active'
  order by case assignment.role_code
    when 'club_admin' then 1
    when 'club_vice_admin' then 2
    when 'club_manager' then 3
    when 'club_member' then 4
    else 5
  end
  limit 1;

  if v_actor_role_code is null then
    raise exception '활동 중인 동호회 회원만 이용할 수 있습니다.';
  end if;

  if not v_ledger_found then
    insert into private.club_mutation_requests (
      actor_id,
      request_id,
      action_code,
      club_id,
      target_user_id,
      role_code,
      input_fingerprint
    ) values (
      v_actor_id,
      p_request_id,
      v_action_code,
      p_club_id,
      null,
      null,
      v_input_fingerprint
    )
    on conflict on constraint club_mutation_requests_actor_request_unique
    do nothing;

    select
      ledger.action_code,
      ledger.club_id,
      ledger.input_fingerprint,
      ledger.result_data,
      ledger.completed_at
    into
      v_ledger_action_code,
      v_ledger_club_id,
      v_ledger_fingerprint,
      v_ledger_result,
      v_ledger_completed_at
    from private.club_mutation_requests as ledger
    where ledger.actor_id = v_actor_id
      and ledger.request_id = p_request_id
    for update;

    if not found then
      raise exception '요청 처리 기록을 확보할 수 없습니다.';
    end if;
    if v_ledger_action_code is distinct from v_action_code
       or v_ledger_club_id is distinct from p_club_id
       or v_ledger_fingerprint is distinct from v_input_fingerprint then
      raise exception '같은 요청 식별자를 다른 입력에 재사용할 수 없습니다.';
    end if;
    if v_ledger_completed_at is not null then
      return v_ledger_result || pg_catalog.jsonb_build_object('replayed', true);
    end if;
  end if;

  if p_content_type = 'notice' then
    if p_operation = 'create' then
      if not private.club_user_has_permission(v_actor_id, p_club_id, 'club.notices.create') then
        raise exception '공지사항 작성 권한이 없습니다.';
      end if;
    elsif not private.club_user_has_permission(v_actor_id, p_club_id, 'club.notices.manage') then
      raise exception '공지사항 관리 권한이 없습니다.';
    end if;

    if p_operation in ('create', 'update') then
      if p_payload - array['title', 'content_summary', 'notice_type', 'importance', 'visibility'] <> '{}'::jsonb then
        raise exception '공지사항 입력 항목이 올바르지 않습니다.';
      end if;
      if not (
        p_payload ? 'title'
        and p_payload ? 'content_summary'
        and p_payload ? 'notice_type'
        and p_payload ? 'importance'
        and p_payload ? 'visibility'
      ) then
        raise exception '공지사항 필수 입력이 누락되었습니다.';
      end if;
      v_title := btrim(p_payload->>'title');
      v_summary := btrim(p_payload->>'content_summary');
      v_visibility := p_payload->>'visibility';
      if v_title is null
         or char_length(v_title) not between 2 and 120
         or v_summary is null
         or char_length(v_summary) not between 1 and 2000
         or p_payload->>'notice_type' not in ('general', 'schedule', 'rule', 'urgent', 'event', 'closure')
         or p_payload->>'importance' not in ('normal', 'important', 'urgent')
         or v_visibility not in ('public', 'club_members') then
        raise exception '공지사항 입력값을 확인해 주세요.';
      end if;
    elsif p_payload <> '{}'::jsonb then
      raise exception '공지사항 삭제 입력이 올바르지 않습니다.';
    end if;

    if p_operation = 'create' then
      insert into public.club_notices (
        club_id, author_user_id, author_role_code, notice_type, importance,
        title, content_summary, visibility, notice_status
      ) values (
        p_club_id, v_actor_id, v_actor_role_code, p_payload->>'notice_type',
        p_payload->>'importance', v_title, v_summary, v_visibility, 'published'
      )
      returning id, version into v_content_id, v_version;
    else
      select notice.version
      into v_version
      from public.club_notices as notice
      where notice.id = p_content_id
        and notice.club_id = p_club_id
        and notice.notice_status = 'published'
      for update;
      if not found then
        raise exception '관리할 공지사항을 찾을 수 없습니다.';
      end if;
      if v_version <> p_expected_version then
        raise exception '공지사항이 변경되었습니다. 새로고침 후 다시 시도해 주세요.';
      end if;

      if p_operation = 'update' then
        update public.club_notices
        set title = v_title,
            content_summary = v_summary,
            notice_type = p_payload->>'notice_type',
            importance = p_payload->>'importance',
            visibility = v_visibility,
            version = version + 1
        where id = p_content_id
        returning id, version into v_content_id, v_version;
      else
        update public.club_notices
        set notice_status = 'archived', version = version + 1
        where id = p_content_id
        returning id, version into v_content_id, v_version;
      end if;
    end if;

  elsif p_content_type = 'post' then
    if p_operation = 'create' then
      if not private.club_user_has_permission(v_actor_id, p_club_id, 'club.posts.create') then
        raise exception '게시글 작성 권한이 없습니다.';
      end if;
    elsif not (
      private.club_user_has_permission(v_actor_id, p_club_id, 'club.posts.create')
      or private.club_user_has_permission(v_actor_id, p_club_id, 'club.posts.moderate')
    ) then
      raise exception '게시글 관리 권한이 없습니다.';
    end if;

    if p_operation in ('create', 'update') then
      if p_payload - array[
        'title', 'content_summary', 'post_type', 'starts_at', 'ends_at',
        'linked_course_legacy_key', 'location', 'capacity', 'participant_target',
        'recruitment_status', 'visibility'
      ] <> '{}'::jsonb then
        raise exception '게시글 입력 항목이 올바르지 않습니다.';
      end if;
      if not (
        p_payload ? 'title'
        and p_payload ? 'content_summary'
        and p_payload ? 'post_type'
        and p_payload ? 'visibility'
      ) then
        raise exception '게시글 필수 입력이 누락되었습니다.';
      end if;
      v_title := btrim(p_payload->>'title');
      v_summary := btrim(p_payload->>'content_summary');
      v_visibility := p_payload->>'visibility';
      v_starts_at := nullif(btrim(p_payload->>'starts_at'), '')::timestamptz;
      v_ends_at := nullif(btrim(p_payload->>'ends_at'), '')::timestamptz;
      v_linked_course := nullif(btrim(p_payload->>'linked_course_legacy_key'), '');
      v_location := nullif(btrim(p_payload->>'location'), '');
      v_participant_target := nullif(btrim(p_payload->>'participant_target'), '');
      if p_payload->'capacity' is not null and p_payload->'capacity' <> 'null'::jsonb then
        if pg_catalog.jsonb_typeof(p_payload->'capacity') <> 'number' then
          raise exception '모집 인원은 숫자여야 합니다.';
        end if;
        if p_payload->>'capacity' !~ '^[0-9]+$' then
          raise exception '모집 인원은 정수여야 합니다.';
        end if;
        if p_payload->>'capacity' !~ '^[0-9]+$' then
          raise exception '정원은 정수여야 합니다.';
        end if;
        v_capacity := (p_payload->>'capacity')::integer;
      end if;
      if v_title is null
         or char_length(v_title) not between 2 and 120
         or v_summary is null
         or char_length(v_summary) not between 1 and 5000
         or p_payload->>'post_type' not in (
           'general', 'flash_meeting', 'companion', 'question',
           'round_review', 'event_review', 'information'
         )
         or v_visibility not in ('public', 'club_members')
         or (v_ends_at is not null and (v_starts_at is null or v_ends_at <= v_starts_at))
         or (v_linked_course is not null and char_length(v_linked_course) > 100)
         or (v_location is not null and char_length(v_location) > 200)
         or (v_capacity is not null and v_capacity not between 2 and 1000)
         or (v_participant_target is not null and char_length(v_participant_target) > 200)
         or (
           p_payload->>'recruitment_status' is not null
           and p_payload->>'recruitment_status' not in ('recruiting', 'full', 'closed', 'completed', 'cancelled')
         ) then
        raise exception '게시글 입력값을 확인해 주세요.';
      end if;
      if p_payload->>'post_type' in ('flash_meeting', 'companion') and (
        v_starts_at is null
        or v_location is null
        or v_capacity is null
        or p_payload->>'recruitment_status' is null
      ) then
        raise exception '번개·같이 가요의 일정, 장소, 모집 인원과 상태가 필요합니다.';
      end if;
    elsif p_payload <> '{}'::jsonb then
      raise exception '게시글 삭제 입력이 올바르지 않습니다.';
    end if;

    if p_operation = 'create' then
      insert into public.club_posts (
        club_id, author_user_id, author_role_code, post_type, title,
        content_summary, starts_at, ends_at, linked_course_legacy_key,
        location, capacity, participant_target, recruitment_status,
        visibility, moderation_status, post_status
      ) values (
        p_club_id, v_actor_id, v_actor_role_code, p_payload->>'post_type',
        v_title, v_summary, v_starts_at, v_ends_at, v_linked_course,
        v_location, v_capacity, v_participant_target,
        nullif(p_payload->>'recruitment_status', ''), v_visibility,
        'visible', 'published'
      )
      returning id, version into v_content_id, v_version;
    else
      select post.author_user_id, post.version
      into v_owner_id, v_version
      from public.club_posts as post
      where post.id = p_content_id
        and post.club_id = p_club_id
        and post.post_status in ('published', 'edited')
        and post.moderation_status = 'visible'
      for update;
      if not found then
        raise exception '관리할 게시글을 찾을 수 없습니다.';
      end if;
      if v_version <> p_expected_version then
        raise exception '게시글이 변경되었습니다. 새로고침 후 다시 시도해 주세요.';
      end if;
      if p_operation = 'update' and v_owner_id <> v_actor_id then
        raise exception '작성자만 게시글을 수정할 수 있습니다.';
      end if;
      if p_operation = 'delete'
         and v_owner_id <> v_actor_id
         and not private.club_user_has_permission(v_actor_id, p_club_id, 'club.posts.moderate') then
        raise exception '게시글 삭제 권한이 없습니다.';
      end if;

      if p_operation = 'update' then
        update public.club_posts
        set post_type = p_payload->>'post_type',
            title = v_title,
            content_summary = v_summary,
            starts_at = v_starts_at,
            ends_at = v_ends_at,
            linked_course_legacy_key = v_linked_course,
            location = v_location,
            capacity = v_capacity,
            participant_target = v_participant_target,
            recruitment_status = nullif(p_payload->>'recruitment_status', ''),
            visibility = v_visibility,
            post_status = 'edited',
            version = version + 1
        where id = p_content_id
        returning id, version into v_content_id, v_version;
      else
        update public.club_posts
        set post_status = 'deleted', version = version + 1
        where id = p_content_id
        returning id, version into v_content_id, v_version;
      end if;
    end if;

  else
    if p_operation = 'create' then
      if not private.club_user_has_permission(v_actor_id, p_club_id, 'club.events.create') then
        raise exception '공식 일정 작성 권한이 없습니다.';
      end if;
    elsif not private.club_user_has_permission(v_actor_id, p_club_id, 'club.events.manage') then
      raise exception '공식 일정 관리 권한이 없습니다.';
    end if;

    if p_operation in ('create', 'update') then
      if p_payload - array[
        'title', 'event_type', 'event_status', 'starts_at', 'ends_at',
        'linked_course_legacy_key', 'location', 'participant_target',
        'capacity', 'reservation_method', 'member_reservation_guidance',
        'organizer_guidance', 'visibility'
      ] <> '{}'::jsonb then
        raise exception '공식 일정 입력 항목이 올바르지 않습니다.';
      end if;
      if not (
        p_payload ? 'title'
        and p_payload ? 'event_type'
        and p_payload ? 'event_status'
        and p_payload ? 'starts_at'
        and p_payload ? 'location'
        and p_payload ? 'participant_target'
        and p_payload ? 'reservation_method'
        and p_payload ? 'visibility'
      ) then
        raise exception '공식 일정 필수 입력이 누락되었습니다.';
      end if;
      v_title := btrim(p_payload->>'title');
      v_starts_at := nullif(btrim(p_payload->>'starts_at'), '')::timestamptz;
      v_ends_at := nullif(btrim(p_payload->>'ends_at'), '')::timestamptz;
      v_linked_course := nullif(btrim(p_payload->>'linked_course_legacy_key'), '');
      v_location := btrim(p_payload->>'location');
      v_participant_target := btrim(p_payload->>'participant_target');
      v_visibility := p_payload->>'visibility';
      if p_payload->'capacity' is not null and p_payload->'capacity' <> 'null'::jsonb then
        if pg_catalog.jsonb_typeof(p_payload->'capacity') <> 'number' then
          raise exception '정원은 숫자여야 합니다.';
        end if;
        v_capacity := (p_payload->>'capacity')::integer;
      end if;
      if v_title is null
         or char_length(v_title) not between 2 and 120
         or v_starts_at is null
         or (v_ends_at is not null and v_ends_at <= v_starts_at)
         or p_payload->>'event_type' not in (
           'monthly_meeting', 'club_tournament', 'screen_tournament',
           'friendly_match', 'outing', 'year_end_party', 'new_year_event',
           'general_meeting', 'training', 'other'
         )
         or p_payload->>'event_status' not in (
           'scheduled', 'registration_open', 'registration_closed', 'completed'
         )
         or v_location is null
         or char_length(v_location) not between 1 and 200
         or v_participant_target is null
         or char_length(v_participant_target) not between 1 and 200
         or (v_linked_course is not null and char_length(v_linked_course) > 100)
         or (v_capacity is not null and v_capacity not between 2 and 1000)
         or p_payload->>'reservation_method' not in (
           'individual_synchronized', 'club_group_booking', 'walk_in',
           'no_reservation', 'checking'
         )
         or v_visibility not in ('public', 'club_members') then
        raise exception '공식 일정 입력값을 확인해 주세요.';
      end if;
      v_optional_text := nullif(btrim(p_payload->>'member_reservation_guidance'), '');
      if v_optional_text is not null and char_length(v_optional_text) > 1000 then
        raise exception '회원 예약 안내는 1000자 이하여야 합니다.';
      end if;
      if nullif(btrim(p_payload->>'organizer_guidance'), '') is not null
         and char_length(nullif(btrim(p_payload->>'organizer_guidance'), '')) > 1000 then
        raise exception '운영진 안내는 1000자 이하여야 합니다.';
      end if;
    elsif p_payload <> '{}'::jsonb then
      raise exception '일정 종료 입력이 올바르지 않습니다.';
    end if;

    if p_operation = 'create' then
      insert into public.club_official_events (
        club_id, creator_user_id, creator_role_code, event_type,
        event_status, title, starts_at, ends_at, linked_course_legacy_key,
        location, participant_target, capacity, reservation_method,
        member_reservation_guidance, organizer_guidance, visibility,
        moderation_status
      ) values (
        p_club_id, v_actor_id, v_actor_role_code, p_payload->>'event_type',
        p_payload->>'event_status', v_title, v_starts_at, v_ends_at,
        v_linked_course, v_location, v_participant_target, v_capacity,
        p_payload->>'reservation_method', v_optional_text,
        nullif(btrim(p_payload->>'organizer_guidance'), ''), v_visibility,
        'visible'
      )
      returning id, version into v_content_id, v_version;
    else
      select event.version
      into v_version
      from public.club_official_events as event
      where event.id = p_content_id
        and event.club_id = p_club_id
        and event.event_status <> 'cancelled'
        and event.moderation_status = 'visible'
      for update;
      if not found then
        raise exception '관리할 공식 일정을 찾을 수 없습니다.';
      end if;
      if v_version <> p_expected_version then
        raise exception '공식 일정이 변경되었습니다. 새로고침 후 다시 시도해 주세요.';
      end if;

      if p_operation = 'update' then
        update public.club_official_events
        set event_type = p_payload->>'event_type',
            event_status = p_payload->>'event_status',
            title = v_title,
            starts_at = v_starts_at,
            ends_at = v_ends_at,
            linked_course_legacy_key = v_linked_course,
            location = v_location,
            participant_target = v_participant_target,
            capacity = v_capacity,
            reservation_method = p_payload->>'reservation_method',
            member_reservation_guidance = v_optional_text,
            organizer_guidance = nullif(btrim(p_payload->>'organizer_guidance'), ''),
            visibility = v_visibility,
            version = version + 1
        where id = p_content_id
        returning id, version into v_content_id, v_version;
      else
        update public.club_official_events
        set event_status = 'cancelled', version = version + 1
        where id = p_content_id
        returning id, version into v_content_id, v_version;
      end if;
    end if;
  end if;

  if v_content_id is null or v_version is null then
    raise exception '콘텐츠 변경 결과를 확인할 수 없습니다.';
  end if;

  v_result := pg_catalog.jsonb_build_object(
    'request_id', p_request_id,
    'content_type', p_content_type,
    'operation', p_operation,
    'id', v_content_id,
    'version', v_version,
    'replayed', false
  );

  insert into public.audit_logs (
    actor_id,
    actor_type,
    actor_role,
    action,
    target_type,
    target_id,
    club_id,
    before_summary,
    after_summary,
    metadata,
    request_id,
    outcome
  ) values (
    v_actor_id,
    case when v_actor_role_code = 'club_member' then 'user' else 'operator' end,
    v_actor_role_code,
    v_action_code,
    'club_' || p_content_type,
    v_content_id::text,
    p_club_id::text,
    case
      when p_operation = 'create' then null
      else pg_catalog.jsonb_build_object('version', p_expected_version)
    end,
    pg_catalog.jsonb_build_object('version', v_version, 'operation', p_operation),
    pg_catalog.jsonb_build_object('content_type', p_content_type),
    p_request_id,
    'success'
  );

  update private.club_mutation_requests as ledger
  set outcome = 'success',
      result_data = v_result,
      completed_at = pg_catalog.now()
  where ledger.actor_id = v_actor_id
    and ledger.request_id = p_request_id
    and ledger.completed_at is null;

  get diagnostics v_completed_ledger_count = row_count;
  if v_completed_ledger_count <> 1 then
    raise exception '요청 처리 기록 완료 상태를 저장할 수 없습니다.';
  end if;

  return v_result;
end;
$$;

comment on function public.mutate_club_core_content(text, text, uuid, uuid, uuid, integer, jsonb) is
  'Guarded create/update/archive/cancel operations for minimal club notices, board posts, and official events.';

revoke all on function public.mutate_club_core_content(text, text, uuid, uuid, uuid, integer, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.mutate_club_core_content(text, text, uuid, uuid, uuid, integer, jsonb)
  to authenticated;
