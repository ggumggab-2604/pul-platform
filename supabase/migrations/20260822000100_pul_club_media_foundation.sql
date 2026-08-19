-- PUL 8-8: public club representative/activity media and derived recent activity.
-- The public bucket is read-only to browsers; upload/delete credentials are issued server-side.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'club-media',
  'club-media',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
);

create table public.club_media (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  media_kind text not null,
  storage_bucket text not null default 'club-media',
  storage_path text not null unique,
  caption text,
  activity_type text,
  taken_on date,
  uploaded_by_user_id uuid not null references public.user_accounts (id),
  media_status text not null default 'pending_upload',
  declared_mime_type text not null,
  declared_size_bytes bigint not null,
  verified_mime_type text,
  verified_size_bytes bigint,
  available_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  constraint club_media_kind_check
    check (media_kind in ('representative', 'activity')),
  constraint club_media_bucket_check
    check (storage_bucket = 'club-media'),
  constraint club_media_path_check
    check (storage_path = club_id::text || '/' || id::text || '/original'),
  constraint club_media_caption_check
    check (
      caption is null
      or (
        caption = pg_catalog.btrim(caption)
        and pg_catalog.char_length(caption) between 1 and 180
      )
    ),
  constraint club_media_activity_type_check
    check (
      (media_kind = 'representative' and activity_type is null)
      or (
        media_kind = 'activity'
        and activity_type in (
          'monthly_meeting', 'tournament', 'friendly_match', 'screen_event',
          'outing', 'training', 'community_event', 'other'
        )
      )
    ),
  constraint club_media_status_check
    check (media_status in ('pending_upload', 'available', 'failed', 'removed')),
  constraint club_media_declared_mime_check
    check (declared_mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  constraint club_media_declared_size_check
    check (declared_size_bytes between 1 and 8388608),
  constraint club_media_verified_check
    check (
      (media_status = 'pending_upload' and verified_mime_type is null and verified_size_bytes is null and available_at is null and removed_at is null)
      or (media_status = 'failed' and available_at is null and removed_at is null)
      or (media_status = 'available' and verified_mime_type = declared_mime_type and verified_size_bytes = declared_size_bytes and available_at is not null and removed_at is null)
      or (media_status = 'removed' and removed_at is not null)
    ),
  constraint club_media_verified_mime_check
    check (verified_mime_type is null or verified_mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  constraint club_media_verified_size_check
    check (verified_size_bytes is null or verified_size_bytes between 1 and 8388608),
  constraint club_media_version_check
    check (version >= 1)
);

comment on table public.club_media is
  'Minimal public club representative and activity photo metadata. Storage objects are written only through server-issued upload credentials.';

create unique index club_media_current_representative_uidx
  on public.club_media (club_id)
  where media_kind = 'representative' and media_status = 'available';

create index club_media_activity_available_idx
  on public.club_media (club_id, taken_on desc, created_at desc)
  where media_kind = 'activity' and media_status = 'available';

create index club_media_pending_upload_idx
  on public.club_media (uploaded_by_user_id, created_at)
  where media_status = 'pending_upload';

create trigger club_media_set_updated_at
before update on public.club_media
for each row execute function public.set_user_foundation_updated_at();

alter table public.club_media enable row level security;
alter table public.club_media force row level security;

revoke all on table public.club_media
  from public, anon, authenticated, service_role;

create function public.get_club_media_content(p_club_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
$$;

comment on function public.get_club_media_content(uuid) is
  'Returns public club photos and a privacy-filtered recent activity projection without raw actor identifiers.';

revoke all on function public.get_club_media_content(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_club_media_content(uuid)
  to anon, authenticated;

create function public.create_club_media_upload_intent(
  p_club_id uuid,
  p_media_kind text,
  p_caption text,
  p_activity_type text,
  p_taken_on date,
  p_declared_mime_type text,
  p_declared_size_bytes bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_status text;
  v_club_status text;
  v_media_id uuid := gen_random_uuid();
  v_caption text := nullif(pg_catalog.btrim(p_caption), '');
begin
  if v_actor_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select account.account_status
  into v_actor_status
  from public.user_accounts as account
  where account.id = v_actor_id
  for share;

  if v_actor_status is distinct from 'active' then
    raise exception '정상 활동 계정만 사진을 등록할 수 있습니다.';
  end if;

  select club.club_status
  into v_club_status
  from public.clubs as club
  where club.id = p_club_id
  for update;

  if v_club_status is null then
    raise exception '동호회를 찾을 수 없습니다.';
  end if;
  if v_club_status <> 'active' then
    raise exception '활동 중인 동호회에만 사진을 등록할 수 있습니다.';
  end if;
  if not private.club_user_has_permission(v_actor_id, p_club_id, 'club.media.review') then
    raise exception '동호회 사진 관리 권한이 없습니다.';
  end if;

  if p_media_kind not in ('representative', 'activity') then
    raise exception '사진 종류 입력을 확인해 주세요.';
  end if;
  if v_caption is not null and pg_catalog.char_length(v_caption) > 180 then
    raise exception '사진 설명은 180자 이하여야 합니다.';
  end if;
  if p_media_kind = 'representative' and p_activity_type is not null then
    raise exception '대표사진에는 활동 종류를 지정할 수 없습니다.';
  end if;
  if p_media_kind = 'activity' and p_activity_type not in (
    'monthly_meeting', 'tournament', 'friendly_match', 'screen_event',
    'outing', 'training', 'community_event', 'other'
  ) then
    raise exception '활동사진 종류 입력을 확인해 주세요.';
  end if;
  if p_declared_mime_type not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'JPG, PNG, WebP 이미지만 등록할 수 있습니다.';
  end if;
  if p_declared_size_bytes is null or p_declared_size_bytes < 1 or p_declared_size_bytes > 8388608 then
    raise exception '사진 파일은 8MB 이하여야 합니다.';
  end if;

  insert into public.club_media (
    id, club_id, media_kind, storage_path, caption, activity_type, taken_on,
    uploaded_by_user_id, declared_mime_type, declared_size_bytes
  )
  values (
    v_media_id, p_club_id, p_media_kind,
    p_club_id::text || '/' || v_media_id::text || '/original',
    v_caption, p_activity_type, p_taken_on, v_actor_id,
    p_declared_mime_type, p_declared_size_bytes
  );

  return pg_catalog.jsonb_build_object(
    'media_id', v_media_id,
    'media_status', 'pending_upload',
    'version', 1
  );
end;
$$;

comment on function public.create_club_media_upload_intent(uuid, text, text, text, date, text, bigint) is
  'Creates permission-checked metadata for one server-signed public club image upload.';

revoke all on function public.create_club_media_upload_intent(uuid, text, text, text, date, text, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.create_club_media_upload_intent(uuid, text, text, text, date, text, bigint)
  to authenticated;

create function public.get_club_media_upload_context_server(
  p_actor_user_id uuid,
  p_media_id uuid
)
returns table (
  media_id uuid,
  storage_bucket text,
  storage_path text,
  declared_mime_type text,
  declared_size_bytes bigint,
  media_version integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_status text;
  v_club_id uuid;
begin
  select account.account_status
  into v_account_status
  from public.user_accounts as account
  where account.id = p_actor_user_id
  for share;

  if v_account_status is distinct from 'active' then
    raise exception '정상 활동 계정만 사진을 등록할 수 있습니다.';
  end if;

  select media.club_id
  into v_club_id
  from public.club_media as media
  where media.id = p_media_id
    and media.uploaded_by_user_id = p_actor_user_id
    and media.media_status = 'pending_upload';

  if v_club_id is null
     or not private.club_user_has_permission(p_actor_user_id, v_club_id, 'club.media.review') then
    raise exception '사진 업로드를 계속할 권한이 없습니다.';
  end if;

  return query
  select media.id, media.storage_bucket, media.storage_path,
    media.declared_mime_type, media.declared_size_bytes, media.version
  from public.club_media as media
  where media.id = p_media_id
    and media.uploaded_by_user_id = p_actor_user_id
    and media.media_status = 'pending_upload';
end;
$$;

comment on function public.get_club_media_upload_context_server(uuid, uuid) is
  'Service-only upload context derived from canonical club media metadata.';

revoke all on function public.get_club_media_upload_context_server(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_club_media_upload_context_server(uuid, uuid)
  to service_role;

create function public.finalize_club_media_upload_server(
  p_actor_user_id uuid,
  p_media_id uuid,
  p_verified_mime_type text,
  p_verified_size_bytes bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_status text;
  v_media public.club_media%rowtype;
  v_club_status text;
  v_replaced_paths jsonb := '[]'::jsonb;
begin
  select account.account_status
  into v_account_status
  from public.user_accounts as account
  where account.id = p_actor_user_id
  for share;

  if v_account_status is distinct from 'active' then
    raise exception '정상 활동 계정만 사진 등록을 완료할 수 있습니다.';
  end if;

  select media.*
  into v_media
  from public.club_media as media
  where media.id = p_media_id
  for update;

  if v_media.id is null or v_media.uploaded_by_user_id <> p_actor_user_id then
    raise exception '사진 업로드 정보를 찾을 수 없습니다.';
  end if;

  select club.club_status
  into v_club_status
  from public.clubs as club
  where club.id = v_media.club_id
  for update;

  if v_club_status <> 'active'
     or not private.club_user_has_permission(p_actor_user_id, v_media.club_id, 'club.media.review') then
    raise exception '사진 등록을 완료할 권한이 없습니다.';
  end if;

  if v_media.media_status = 'available' then
    if v_media.verified_mime_type = p_verified_mime_type
       and v_media.verified_size_bytes = p_verified_size_bytes then
      return pg_catalog.jsonb_build_object(
        'media_id', v_media.id,
        'media_status', v_media.media_status,
        'version', v_media.version,
        'replayed', true,
        'replaced_storage_paths', '[]'::jsonb
      );
    end if;
    raise exception '이미 완료된 사진 정보와 검증 값이 다릅니다.';
  end if;

  if v_media.media_status <> 'pending_upload' then
    raise exception '완료할 수 없는 사진 업로드 상태입니다.';
  end if;
  if p_verified_mime_type <> v_media.declared_mime_type
     or p_verified_size_bytes <> v_media.declared_size_bytes then
    raise exception '업로드한 사진 파일이 등록 정보와 일치하지 않습니다.';
  end if;

  if v_media.media_kind = 'representative' then
    select coalesce(pg_catalog.jsonb_agg(existing.storage_path), '[]'::jsonb)
    into v_replaced_paths
    from public.club_media as existing
    where existing.club_id = v_media.club_id
      and existing.media_kind = 'representative'
      and existing.media_status = 'available'
      and existing.id <> v_media.id;

    update public.club_media as existing
    set media_status = 'removed', removed_at = now(), version = existing.version + 1
    where existing.club_id = v_media.club_id
      and existing.media_kind = 'representative'
      and existing.media_status = 'available'
      and existing.id <> v_media.id;
  end if;

  update public.club_media
  set media_status = 'available',
      verified_mime_type = p_verified_mime_type,
      verified_size_bytes = p_verified_size_bytes,
      available_at = now(),
      version = version + 1
  where id = v_media.id;

  return pg_catalog.jsonb_build_object(
    'media_id', v_media.id,
    'media_status', 'available',
    'version', v_media.version + 1,
    'replayed', false,
    'replaced_storage_paths', v_replaced_paths
  );
end;
$$;

comment on function public.finalize_club_media_upload_server(uuid, uuid, text, bigint) is
  'Service-only byte-verified finalize that atomically replaces the current representative photo.';

revoke all on function public.finalize_club_media_upload_server(uuid, uuid, text, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.finalize_club_media_upload_server(uuid, uuid, text, bigint)
  to service_role;

create function public.mark_club_media_upload_failed_server(
  p_actor_user_id uuid,
  p_media_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.club_media
  set media_status = 'failed', version = version + 1
  where id = p_media_id
    and uploaded_by_user_id = p_actor_user_id
    and media_status = 'pending_upload';
end;
$$;

comment on function public.mark_club_media_upload_failed_server(uuid, uuid) is
  'Service-only compensation marker for a failed club media upload.';

revoke all on function public.mark_club_media_upload_failed_server(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.mark_club_media_upload_failed_server(uuid, uuid)
  to service_role;

create function public.remove_club_media_server(
  p_actor_user_id uuid,
  p_media_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_status text;
  v_media public.club_media%rowtype;
begin
  select account.account_status
  into v_account_status
  from public.user_accounts as account
  where account.id = p_actor_user_id
  for share;

  if v_account_status is distinct from 'active' then
    raise exception '정상 활동 계정만 사진을 삭제할 수 있습니다.';
  end if;

  select media.*
  into v_media
  from public.club_media as media
  where media.id = p_media_id
  for update;

  if v_media.id is null then
    raise exception '사진을 찾을 수 없습니다.';
  end if;
  if not private.club_user_has_permission(p_actor_user_id, v_media.club_id, 'club.media.review') then
    raise exception '동호회 사진 관리 권한이 없습니다.';
  end if;

  if v_media.media_status = 'removed' then
    return pg_catalog.jsonb_build_object(
      'media_id', v_media.id,
      'media_status', 'removed',
      'version', v_media.version,
      'storage_bucket', v_media.storage_bucket,
      'storage_path', v_media.storage_path,
      'replayed', true
    );
  end if;
  if v_media.media_status <> 'available' then
    raise exception '삭제할 수 없는 사진 상태입니다.';
  end if;

  update public.club_media
  set media_status = 'removed', removed_at = now(), version = version + 1
  where id = v_media.id;

  return pg_catalog.jsonb_build_object(
    'media_id', v_media.id,
    'media_status', 'removed',
    'version', v_media.version + 1,
    'storage_bucket', v_media.storage_bucket,
    'storage_path', v_media.storage_path,
    'replayed', false
  );
end;
$$;

comment on function public.remove_club_media_server(uuid, uuid) is
  'Service-only permission-checked soft removal; Storage cleanup is performed by the server boundary.';

revoke all on function public.remove_club_media_server(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.remove_club_media_server(uuid, uuid)
  to service_role;
