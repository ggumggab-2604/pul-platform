-- PUL 8-31: public course activity photos uploaded by active members.
-- Browsers can read the public bucket, but writes require a server-issued signed upload token.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'course-media',
  'course-media',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
);

create table public.course_media (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  media_key text not null default pg_catalog.encode(extensions.gen_random_bytes(16), 'hex'),
  course_id uuid not null references public.courses (id) on delete cascade,
  uploader_user_id uuid not null references public.user_accounts (id),
  storage_bucket text not null default 'course-media',
  storage_path text not null,
  caption text,
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
  constraint course_media_media_key_uidx unique (media_key),
  constraint course_media_media_key_check
    check (media_key ~ '^[0-9a-f]{32}$'),
  constraint course_media_bucket_check
    check (storage_bucket = 'course-media'),
  constraint course_media_path_uidx unique (storage_path),
  constraint course_media_path_check
    check (
      storage_path ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}/[0-9a-f]{32}/original$'
      and storage_path like '%/' || media_key || '/original'
    ),
  constraint course_media_caption_check
    check (
      caption is null
      or (
        caption = pg_catalog.btrim(caption)
        and pg_catalog.char_length(caption) between 1 and 180
      )
    ),
  constraint course_media_status_check
    check (media_status in ('pending_upload', 'available', 'failed', 'removed')),
  constraint course_media_declared_mime_check
    check (declared_mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  constraint course_media_declared_size_check
    check (declared_size_bytes between 1 and 8388608),
  constraint course_media_verified_mime_check
    check (
      verified_mime_type is null
      or verified_mime_type in ('image/jpeg', 'image/png', 'image/webp')
    ),
  constraint course_media_verified_size_check
    check (verified_size_bytes is null or verified_size_bytes between 1 and 8388608),
  constraint course_media_lifecycle_check
    check (
      (
        media_status = 'pending_upload'
        and verified_mime_type is null
        and verified_size_bytes is null
        and available_at is null
        and removed_at is null
      )
      or (
        media_status = 'failed'
        and verified_mime_type is null
        and verified_size_bytes is null
        and available_at is null
        and removed_at is null
      )
      or (
        media_status = 'available'
        and verified_mime_type = declared_mime_type
        and verified_size_bytes = declared_size_bytes
        and available_at is not null
        and removed_at is null
      )
      or (
        media_status = 'removed'
        and verified_mime_type = declared_mime_type
        and verified_size_bytes = declared_size_bytes
        and available_at is not null
        and removed_at is not null
      )
    ),
  constraint course_media_version_check
    check (version >= 1)
);

comment on table public.course_media is
  'Privacy-minimized course activity photo metadata. Public DTOs expose only an opaque media key and public Storage descriptor.';

create index course_media_course_available_idx
  on public.course_media (course_id, available_at desc, id)
  where media_status = 'available';

create index course_media_uploader_current_idx
  on public.course_media (course_id, uploader_user_id, created_at desc)
  where media_status in ('pending_upload', 'available');

create index course_media_pending_upload_idx
  on public.course_media (uploader_user_id, created_at, id)
  where media_status = 'pending_upload';

create trigger course_media_set_updated_at
before update on public.course_media
for each row execute function public.set_user_foundation_updated_at();

alter table public.course_media enable row level security;
alter table public.course_media force row level security;

revoke all on table public.course_media
  from public, anon, authenticated, service_role;

create function public.list_public_course_media(
  p_course_key text,
  p_limit integer default 12,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_active boolean := false;
  v_course_id uuid;
  v_course_key text := pg_catalog.btrim(p_course_key);
  v_total integer;
  v_items jsonb := '[]'::jsonb;
begin
  if v_course_key is null
     or v_course_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' then
    raise exception '골프장을 찾을 수 없습니다.';
  end if;
  if p_limit is null or p_limit not between 1 and 24
     or p_offset is null or p_offset < 0 then
    raise exception '사진 목록 범위를 확인해 주세요.';
  end if;

  select course.id
  into v_course_id
  from public.courses as course
  where course.course_key = v_course_key
    and course.course_status = 'active';

  if v_course_id is null then
    raise exception '골프장을 찾을 수 없습니다.';
  end if;

  if v_actor_id is not null then
    select account.account_status = 'active'
    into v_actor_active
    from public.user_accounts as account
    where account.id = v_actor_id;
    v_actor_active := coalesce(v_actor_active, false);
  end if;

  select count(*)::integer
  into v_total
  from public.course_media as media
  where media.course_id = v_course_id
    and media.media_status = 'available';

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'media_key', listed.media_key,
        'storage_bucket', listed.storage_bucket,
        'storage_path', listed.storage_path,
        'caption', listed.caption,
        'created_at', listed.created_at,
        'can_delete', v_actor_active and listed.uploader_user_id = v_actor_id
      )
      order by listed.available_at desc, listed.id
    ),
    '[]'::jsonb
  )
  into v_items
  from (
    select media.id, media.media_key, media.storage_bucket, media.storage_path,
      media.caption, media.created_at, media.available_at, media.uploader_user_id
    from public.course_media as media
    where media.course_id = v_course_id
      and media.media_status = 'available'
    order by media.available_at desc, media.id
    limit p_limit
    offset p_offset
  ) as listed;

  return pg_catalog.jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', p_offset + p_limit < v_total
  );
end;
$$;

comment on function public.list_public_course_media(text, integer, integer) is
  'Lists available course activity photos without internal course, media, or uploader identifiers.';

revoke all on function public.list_public_course_media(text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_public_course_media(text, integer, integer)
  to anon, authenticated;

create function public.create_course_media_upload_intent(
  p_course_key text,
  p_caption text,
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
  v_course_id uuid;
  v_course_key text := pg_catalog.btrim(p_course_key);
  v_caption text := nullif(pg_catalog.btrim(p_caption), '');
  v_media_id uuid := pg_catalog.gen_random_uuid();
  v_media_key text := pg_catalog.encode(extensions.gen_random_bytes(16), 'hex');
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
    raise exception '정상 활동 회원만 골프장 사진을 등록할 수 있습니다.';
  end if;
  if v_course_key is null
     or v_course_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' then
    raise exception '골프장을 찾을 수 없습니다.';
  end if;

  select course.id, course.course_key
  into v_course_id, v_course_key
  from public.courses as course
  where course.course_key = v_course_key
    and course.course_status = 'active'
  for update;

  if v_course_id is null then
    raise exception '활동 중인 골프장을 찾을 수 없습니다.';
  end if;
  if v_caption is not null and pg_catalog.char_length(v_caption) > 180 then
    raise exception '사진 설명은 180자 이하여야 합니다.';
  end if;
  if p_declared_mime_type not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'JPG, PNG, WebP 이미지만 등록할 수 있습니다.';
  end if;
  if p_declared_size_bytes is null
     or p_declared_size_bytes < 1
     or p_declared_size_bytes > 8388608 then
    raise exception '사진 파일은 8MB 이하여야 합니다.';
  end if;
  if (
    select count(*)
    from public.course_media as media
    where media.course_id = v_course_id
      and media.uploader_user_id = v_actor_id
      and (
        media.media_status = 'available'
        or (
          media.media_status = 'pending_upload'
          and media.created_at >= now() - interval '2 hours'
        )
      )
  ) >= 8 then
    raise exception '한 골프장에는 회원별로 최대 8장의 활동사진을 등록할 수 있습니다.';
  end if;

  insert into public.course_media (
    id,
    media_key,
    course_id,
    uploader_user_id,
    storage_path,
    caption,
    declared_mime_type,
    declared_size_bytes
  )
  values (
    v_media_id,
    v_media_key,
    v_course_id,
    v_actor_id,
    v_course_key || '/' || v_media_key || '/original',
    v_caption,
    p_declared_mime_type,
    p_declared_size_bytes
  );

  return pg_catalog.jsonb_build_object(
    'media_key', v_media_key,
    'media_status', 'pending_upload',
    'version', 1
  );
end;
$$;

comment on function public.create_course_media_upload_intent(text, text, text, bigint) is
  'Creates one active-member course photo upload intent with a privacy-minimized object path and per-member limit.';

revoke all on function public.create_course_media_upload_intent(text, text, text, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.create_course_media_upload_intent(text, text, text, bigint)
  to authenticated;

create function public.get_course_media_upload_context_server(
  p_actor_user_id uuid,
  p_media_key text
)
returns table (
  media_key text,
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
begin
  if p_media_key is null or p_media_key !~ '^[0-9a-f]{32}$' then
    raise exception '사진 업로드 정보를 찾을 수 없습니다.';
  end if;

  select account.account_status
  into v_account_status
  from public.user_accounts as account
  where account.id = p_actor_user_id
  for share;

  if v_account_status is distinct from 'active' then
    raise exception '정상 활동 회원만 사진 업로드를 계속할 수 있습니다.';
  end if;

  return query
  select media.media_key, media.storage_bucket, media.storage_path,
    media.declared_mime_type, media.declared_size_bytes, media.version
  from public.course_media as media
  join public.courses as course on course.id = media.course_id
  where media.media_key = p_media_key
    and media.uploader_user_id = p_actor_user_id
    and media.media_status = 'pending_upload'
    and course.course_status = 'active';

  if not found then
    raise exception '사진 업로드 정보를 찾을 수 없습니다.';
  end if;
end;
$$;

comment on function public.get_course_media_upload_context_server(uuid, text) is
  'Service-only upload context for one actor-owned pending course photo.';

revoke all on function public.get_course_media_upload_context_server(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_course_media_upload_context_server(uuid, text)
  to service_role;

create function public.finalize_course_media_upload_server(
  p_actor_user_id uuid,
  p_media_key text,
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
  v_media public.course_media%rowtype;
  v_course_status text;
begin
  select account.account_status
  into v_account_status
  from public.user_accounts as account
  where account.id = p_actor_user_id
  for share;

  if v_account_status is distinct from 'active' then
    raise exception '정상 활동 회원만 사진 등록을 완료할 수 있습니다.';
  end if;

  select media.*
  into v_media
  from public.course_media as media
  where media.media_key = p_media_key
  for update;

  if v_media.id is null or v_media.uploader_user_id <> p_actor_user_id then
    raise exception '사진 업로드 정보를 찾을 수 없습니다.';
  end if;

  select course.course_status
  into v_course_status
  from public.courses as course
  where course.id = v_media.course_id
  for share;

  if v_course_status <> 'active' then
    raise exception '활동 중인 골프장 사진만 등록을 완료할 수 있습니다.';
  end if;

  if v_media.media_status = 'available' then
    if v_media.verified_mime_type = p_verified_mime_type
       and v_media.verified_size_bytes = p_verified_size_bytes then
      return pg_catalog.jsonb_build_object(
        'media_key', v_media.media_key,
        'media_status', 'available',
        'version', v_media.version,
        'replayed', true
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

  update public.course_media
  set media_status = 'available',
      verified_mime_type = p_verified_mime_type,
      verified_size_bytes = p_verified_size_bytes,
      available_at = now(),
      version = version + 1
  where id = v_media.id;

  return pg_catalog.jsonb_build_object(
    'media_key', v_media.media_key,
    'media_status', 'available',
    'version', v_media.version + 1,
    'replayed', false
  );
end;
$$;

comment on function public.finalize_course_media_upload_server(uuid, text, text, bigint) is
  'Service-only byte-verified finalize for one actor-owned course activity photo.';

revoke all on function public.finalize_course_media_upload_server(uuid, text, text, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.finalize_course_media_upload_server(uuid, text, text, bigint)
  to service_role;

create function public.mark_course_media_upload_failed_server(
  p_actor_user_id uuid,
  p_media_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.course_media
  set media_status = 'failed',
      version = version + 1
  where media_key = p_media_key
    and uploader_user_id = p_actor_user_id
    and media_status = 'pending_upload';
end;
$$;

comment on function public.mark_course_media_upload_failed_server(uuid, text) is
  'Service-only compensation marker for a failed course photo upload.';

revoke all on function public.mark_course_media_upload_failed_server(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.mark_course_media_upload_failed_server(uuid, text)
  to service_role;

create function public.remove_course_media_server(
  p_actor_user_id uuid,
  p_media_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_status text;
  v_media public.course_media%rowtype;
begin
  select account.account_status
  into v_account_status
  from public.user_accounts as account
  where account.id = p_actor_user_id
  for share;

  if v_account_status is distinct from 'active' then
    raise exception '정상 활동 회원만 본인 사진을 삭제할 수 있습니다.';
  end if;

  select media.*
  into v_media
  from public.course_media as media
  where media.media_key = p_media_key
  for update;

  if v_media.id is null then
    raise exception '사진을 찾을 수 없습니다.';
  end if;
  if v_media.uploader_user_id <> p_actor_user_id then
    raise exception '본인이 등록한 사진만 삭제할 수 있습니다.';
  end if;

  if v_media.media_status = 'removed' then
    return pg_catalog.jsonb_build_object(
      'media_key', v_media.media_key,
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

  update public.course_media
  set media_status = 'removed',
      removed_at = now(),
      version = version + 1
  where id = v_media.id;

  return pg_catalog.jsonb_build_object(
    'media_key', v_media.media_key,
    'media_status', 'removed',
    'version', v_media.version + 1,
    'storage_bucket', v_media.storage_bucket,
    'storage_path', v_media.storage_path,
    'replayed', false
  );
end;
$$;

comment on function public.remove_course_media_server(uuid, text) is
  'Service-only actor-owned soft removal; Storage cleanup is performed by the server boundary.';

revoke all on function public.remove_course_media_server(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.remove_course_media_server(uuid, text)
  to service_role;
