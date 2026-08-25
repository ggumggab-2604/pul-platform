-- PUL 9-2B-1: unified promotion/banner slots, media, scheduling, and guarded RPC foundation.
-- UI integration and page rendering are intentionally deferred to 9-2B-2/9-2B-3.

create extension if not exists btree_gist with schema extensions;

insert into public.platform_permission_definitions (
  code,
  description,
  is_active
)
values (
  'promotions.manage',
  '통합 배너와 홍보 콘텐츠, 미디어, 게시 일정을 관리합니다.',
  true
);

insert into public.platform_role_permissions (
  platform_role,
  permission_code
)
values (
  'platform_admin',
  'promotions.manage'
);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'promotion-media',
  'promotion-media',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
);

create function private.promotion_content_kind_array_is_valid(
  p_values text[]
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    p_values is not null
    and pg_catalog.cardinality(p_values) between 1 and 6
    and not exists (
      select 1
      from pg_catalog.unnest(p_values) as value(item)
      where value.item is null
        or value.item not in (
          'pul_notice',
          'pul_event',
          'partnership',
          'advertisement',
          'member_guide',
          'content_recommendation'
        )
    )
    and pg_catalog.cardinality(p_values) = (
      select pg_catalog.count(distinct value.item)::integer
      from pg_catalog.unnest(p_values) as value(item)
    );
$$;

comment on function private.promotion_content_kind_array_is_valid(text[]) is
  'Validates the migration-owned slot allow-list without exposing a callable API.';

revoke all on function private.promotion_content_kind_array_is_valid(text[])
  from public, anon, authenticated, service_role;

create table public.promotion_slots (
  slot_code text primary key,
  display_name text not null,
  page_path text not null,
  placement_code text not null,
  format_code text not null,
  desktop_width integer not null,
  desktop_height integer not null,
  mobile_width integer,
  mobile_height integer,
  allowed_content_kinds text[] not null,
  is_enabled boolean not null default true,
  sort_order integer not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint promotion_slots_code_check
    check (
      slot_code = pg_catalog.btrim(slot_code)
      and pg_catalog.char_length(slot_code) between 5 and 80
      and slot_code ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+){2}$'
    ),
  constraint promotion_slots_display_name_check
    check (
      display_name = pg_catalog.btrim(display_name)
      and pg_catalog.char_length(display_name) between 2 and 100
    ),
  constraint promotion_slots_page_path_check
    check (
      page_path = pg_catalog.btrim(page_path)
      and page_path ~ '^/[A-Za-z0-9_./-]*$'
      and pg_catalog.char_length(page_path) <= 200
    ),
  constraint promotion_slots_placement_code_check
    check (
      placement_code = pg_catalog.btrim(placement_code)
      and placement_code ~ '^[a-z][a-z0-9_]*$'
      and pg_catalog.char_length(placement_code) <= 40
    ),
  constraint promotion_slots_format_code_check
    check (format_code in ('home_hero', 'vertical_rail', 'mobile_feed', 'horizontal')),
  constraint promotion_slots_desktop_size_check
    check (desktop_width between 1 and 4096 and desktop_height between 1 and 4096),
  constraint promotion_slots_mobile_size_check
    check (
      (mobile_width is null and mobile_height is null)
      or (
        mobile_width between 1 and 4096
        and mobile_height between 1 and 4096
      )
    ),
  constraint promotion_slots_content_kinds_check
    check (private.promotion_content_kind_array_is_valid(allowed_content_kinds)),
  constraint promotion_slots_sort_order_check
    check (sort_order between 1 and 1000)
);

comment on table public.promotion_slots is
  'Migration-owned catalog of fixed promotion placements. Application users cannot create or delete slots.';

insert into public.promotion_slots (
  slot_code,
  display_name,
  page_path,
  placement_code,
  format_code,
  desktop_width,
  desktop_height,
  mobile_width,
  mobile_height,
  allowed_content_kinds,
  is_enabled,
  sort_order
)
values
  (
    'home.hero.01', '메인 히어로', '/', 'hero', 'home_hero',
    1600, 840, 1080, 720,
    array['pul_notice', 'pul_event', 'partnership', 'content_recommendation']::text[],
    true, 10
  ),
  (
    'home.rail_left.01', '메인 왼쪽 레일', '/', 'rail_left', 'vertical_rail',
    600, 1050, null, null,
    array['pul_notice', 'pul_event', 'partnership', 'advertisement', 'member_guide', 'content_recommendation']::text[],
    true, 20
  ),
  (
    'home.rail_right.01', '메인 오른쪽 레일', '/', 'rail_right', 'vertical_rail',
    600, 1050, null, null,
    array['pul_notice', 'pul_event', 'partnership', 'advertisement', 'member_guide', 'content_recommendation']::text[],
    true, 30
  ),
  (
    'home.feed.01', '메인 모바일 피드', '/', 'feed', 'mobile_feed',
    1600, 320, 1080, 480,
    array['pul_notice', 'pul_event', 'partnership', 'advertisement', 'member_guide', 'content_recommendation']::text[],
    true, 40
  ),
  (
    'courses.top.01', '골프장 상단', '/courses', 'top', 'horizontal',
    1600, 320, 1080, 480,
    array['pul_notice', 'pul_event', 'partnership', 'advertisement', 'member_guide', 'content_recommendation']::text[],
    true, 100
  ),
  (
    'clubs.top.01', '동호회 상단', '/clubs', 'top', 'horizontal',
    1600, 320, 1080, 480,
    array['pul_notice', 'pul_event', 'partnership', 'advertisement', 'member_guide', 'content_recommendation']::text[],
    true, 110
  ),
  (
    'market.list_top.01', '중고장터 목록 상단', '/market', 'list_top', 'horizontal',
    1600, 320, 1080, 480,
    array['pul_notice', 'pul_event', 'partnership', 'advertisement', 'member_guide', 'content_recommendation']::text[],
    true, 120
  ),
  (
    'community.top.01', '커뮤니티 상단', '/community', 'top', 'horizontal',
    1600, 320, 1080, 480,
    array['pul_notice', 'pul_event', 'partnership', 'advertisement', 'member_guide', 'content_recommendation']::text[],
    true, 130
  ),
  (
    'events.top.01', '대회·이벤트 상단', '/events', 'top', 'horizontal',
    1600, 320, 1080, 480,
    array['pul_notice', 'pul_event', 'partnership', 'advertisement', 'member_guide', 'content_recommendation']::text[],
    true, 140
  ),
  (
    'lessons.top.01', '레슨·교육 상단', '/lessons', 'top', 'horizontal',
    1600, 320, 1080, 480,
    array['pul_notice', 'pul_event', 'partnership', 'advertisement', 'member_guide', 'content_recommendation']::text[],
    true, 150
  ),
  (
    'certification.top.01', '자격증·심판 상단', '/certification', 'top', 'horizontal',
    1600, 320, 1080, 480,
    array['pul_notice', 'pul_event', 'partnership', 'advertisement', 'member_guide', 'content_recommendation']::text[],
    true, 160
  ),
  (
    'news.top.01', '뉴스·정보 상단', '/news', 'top', 'horizontal',
    1600, 320, 1080, 480,
    array['pul_notice', 'pul_event', 'partnership', 'advertisement', 'member_guide', 'content_recommendation']::text[],
    true, 170
  ),
  (
    'hall_of_fame.top.01', '명예의 전당 상단', '/hall-of-fame', 'top', 'horizontal',
    1600, 320, 1080, 480,
    array['pul_notice', 'pul_event', 'member_guide', 'content_recommendation']::text[],
    false, 180
  );

create table public.promotions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  promotion_key text not null default pg_catalog.encode(extensions.gen_random_bytes(16), 'hex'),
  slug text,
  content_kind text not null,
  title text not null,
  summary text not null,
  body text,
  link_type text not null,
  external_url text,
  detail_cta_label text,
  detail_cta_url text,
  content_status text not null default 'draft',
  version integer not null default 1,
  created_by uuid not null references public.user_accounts (id),
  updated_by uuid not null references public.user_accounts (id),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint promotions_key_uidx unique (promotion_key),
  constraint promotions_key_check check (promotion_key ~ '^[0-9a-f]{32}$'),
  constraint promotions_slug_uidx unique (slug),
  constraint promotions_slug_check
    check (
      slug is null
      or (
        slug = pg_catalog.btrim(slug)
        and slug ~ '^[a-z0-9][a-z0-9-]{0,79}$'
      )
    ),
  constraint promotions_content_kind_check
    check (
      content_kind in (
        'pul_notice',
        'pul_event',
        'partnership',
        'advertisement',
        'member_guide',
        'content_recommendation'
      )
    ),
  constraint promotions_title_check
    check (
      title = pg_catalog.btrim(title)
      and pg_catalog.char_length(title) between 2 and 180
    ),
  constraint promotions_summary_check
    check (
      summary = pg_catalog.btrim(summary)
      and pg_catalog.char_length(summary) between 10 and 500
    ),
  constraint promotions_body_check
    check (
      body is null
      or (
        body = pg_catalog.btrim(body)
        and pg_catalog.char_length(body) between 20 and 20000
      )
    ),
  constraint promotions_link_type_check
    check (link_type in ('external', 'internal_detail', 'none')),
  constraint promotions_external_url_check
    check (
      external_url is null
      or (
        external_url = pg_catalog.btrim(external_url)
        and pg_catalog.char_length(external_url) <= 2048
        and external_url ~ '^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?([:/?#][^[:space:]]*)?$'
      )
    ),
  constraint promotions_detail_cta_check
    check (
      (detail_cta_label is null and detail_cta_url is null)
      or (
        detail_cta_label = pg_catalog.btrim(detail_cta_label)
        and pg_catalog.char_length(detail_cta_label) between 1 and 40
        and detail_cta_url = pg_catalog.btrim(detail_cta_url)
        and pg_catalog.char_length(detail_cta_url) <= 2048
        and (
          detail_cta_url ~ '^/[^[:space:]]*$'
          or detail_cta_url ~ '^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?([:/?#][^[:space:]]*)?$'
        )
      )
    ),
  constraint promotions_link_fields_check
    check (
      (
        link_type = 'external'
        and external_url is not null
        and slug is null
        and body is null
        and detail_cta_label is null
        and detail_cta_url is null
      )
      or (
        link_type = 'internal_detail'
        and external_url is null
        and slug is not null
        and body is not null
      )
      or (
        link_type = 'none'
        and external_url is null
        and slug is null
        and body is null
        and detail_cta_label is null
        and detail_cta_url is null
      )
    ),
  constraint promotions_content_status_check
    check (content_status in ('draft', 'ready', 'archived')),
  constraint promotions_version_check check (version >= 1)
);

comment on table public.promotions is
  'Operator-managed promotion content. Stable public keys are exposed; internal UUIDs and actor identifiers are not.';

create index promotions_created_by_idx on public.promotions (created_by);
create index promotions_updated_by_idx on public.promotions (updated_by);

create table public.promotion_media (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  media_key text not null default pg_catalog.encode(extensions.gen_random_bytes(16), 'hex'),
  promotion_id uuid not null references public.promotions (id) on delete cascade,
  variant text not null,
  sort_order smallint not null default 0,
  storage_bucket text not null default 'promotion-media',
  storage_path text not null,
  alt_text text not null,
  media_status text not null default 'pending_upload',
  declared_mime_type text not null,
  declared_size_bytes bigint not null,
  verified_mime_type text,
  verified_size_bytes bigint,
  available_at timestamptz,
  removed_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint promotion_media_key_uidx unique (media_key),
  constraint promotion_media_key_check check (media_key ~ '^[0-9a-f]{32}$'),
  constraint promotion_media_variant_check
    check (variant in ('desktop_banner', 'mobile_banner', 'detail')),
  constraint promotion_media_sort_order_check
    check (
      (variant in ('desktop_banner', 'mobile_banner') and sort_order = 0)
      or (variant = 'detail' and sort_order between 0 and 9)
    ),
  constraint promotion_media_bucket_check check (storage_bucket = 'promotion-media'),
  constraint promotion_media_path_uidx unique (storage_path),
  constraint promotion_media_path_check
    check (
      storage_path ~ '^[0-9a-f]{32}/(desktop|mobile|detail)/[0-9a-f]{32}/original$'
      and storage_path like '%/' || media_key || '/original'
    ),
  constraint promotion_media_alt_check
    check (
      alt_text = pg_catalog.btrim(alt_text)
      and pg_catalog.char_length(alt_text) between 2 and 240
    ),
  constraint promotion_media_status_check
    check (media_status in ('pending_upload', 'available', 'failed', 'removed')),
  constraint promotion_media_declared_mime_check
    check (declared_mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  constraint promotion_media_declared_size_check
    check (declared_size_bytes between 1 and 5242880),
  constraint promotion_media_verified_mime_check
    check (
      verified_mime_type is null
      or verified_mime_type in ('image/jpeg', 'image/png', 'image/webp')
    ),
  constraint promotion_media_verified_size_check
    check (verified_size_bytes is null or verified_size_bytes between 1 and 5242880),
  constraint promotion_media_lifecycle_check
    check (
      (
        media_status in ('pending_upload', 'failed')
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
        and removed_at is not null
      )
    ),
  constraint promotion_media_version_check check (version >= 1)
);

comment on table public.promotion_media is
  'Signed-upload metadata. Public runtime RPCs expose available descriptors only.';

create unique index promotion_media_pending_variant_order_uidx
  on public.promotion_media (promotion_id, variant, sort_order)
  where media_status = 'pending_upload';

create unique index promotion_media_available_variant_order_uidx
  on public.promotion_media (promotion_id, variant, sort_order)
  where media_status = 'available';

create index promotion_media_available_promotion_idx
  on public.promotion_media (promotion_id, variant, sort_order)
  where media_status = 'available';

create index promotion_media_promotion_id_idx
  on public.promotion_media (promotion_id, id);

create table public.promotion_placements (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  placement_key text not null default pg_catalog.encode(extensions.gen_random_bytes(16), 'hex'),
  slot_code text not null references public.promotion_slots (slot_code),
  promotion_id uuid not null references public.promotions (id) on delete restrict,
  publication_status text not null default 'draft',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  version integer not null default 1,
  created_by uuid not null references public.user_accounts (id),
  updated_by uuid not null references public.user_accounts (id),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint promotion_placements_key_uidx unique (placement_key),
  constraint promotion_placements_key_check check (placement_key ~ '^[0-9a-f]{32}$'),
  constraint promotion_placements_status_check
    check (publication_status in ('draft', 'published', 'hidden')),
  constraint promotion_placements_period_check check (ends_at > starts_at),
  constraint promotion_placements_version_check check (version >= 1),
  constraint promotion_placements_published_period_excl
    exclude using gist (
      slot_code with =,
      tstzrange(starts_at, ends_at, '[)') with &&
    )
    where (publication_status = 'published')
);

comment on table public.promotion_placements is
  'Finite, half-open [start,end) publication windows; adjacent windows are allowed and overlapping published windows are rejected.';

create index promotion_placements_public_lookup_idx
  on public.promotion_placements (slot_code, starts_at, ends_at)
  where publication_status = 'published';

create index promotion_placements_management_idx
  on public.promotion_placements (promotion_id, created_at desc, id);

create index promotion_placements_slot_code_idx
  on public.promotion_placements (slot_code, id);

create index promotion_placements_created_by_idx
  on public.promotion_placements (created_by);

create index promotion_placements_updated_by_idx
  on public.promotion_placements (updated_by);

create table private.promotion_mutation_requests (
  actor_id uuid not null references public.user_accounts (id) on delete cascade,
  request_id uuid not null,
  action_code text not null,
  request_fingerprint text not null,
  result_data jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  completed_at timestamptz,
  constraint promotion_mutation_requests_pkey primary key (actor_id, request_id),
  constraint promotion_mutation_requests_action_check
    check (
      action_code = pg_catalog.btrim(action_code)
      and action_code ~ '^promotion\.[a-z_]+(\.[a-z_]+)*$'
      and pg_catalog.char_length(action_code) <= 100
    ),
  constraint promotion_mutation_requests_fingerprint_check
    check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint promotion_mutation_requests_completion_check
    check (
      (completed_at is null and result_data is null)
      or (completed_at is not null and result_data is not null)
    )
);

comment on table private.promotion_mutation_requests is
  'Private actor/request ledger for promotion management replay and payload-reuse protection.';

create trigger promotion_slots_set_updated_at
before update on public.promotion_slots
for each row execute function public.set_user_foundation_updated_at();

create trigger promotions_set_updated_at
before update on public.promotions
for each row execute function public.set_user_foundation_updated_at();

create trigger promotion_media_set_updated_at
before update on public.promotion_media
for each row execute function public.set_user_foundation_updated_at();

create trigger promotion_placements_set_updated_at
before update on public.promotion_placements
for each row execute function public.set_user_foundation_updated_at();

alter table public.promotion_slots enable row level security;
alter table public.promotion_slots force row level security;
alter table public.promotions enable row level security;
alter table public.promotions force row level security;
alter table public.promotion_media enable row level security;
alter table public.promotion_media force row level security;
alter table public.promotion_placements enable row level security;
alter table public.promotion_placements force row level security;
alter table private.promotion_mutation_requests enable row level security;
alter table private.promotion_mutation_requests force row level security;

revoke all on table public.promotion_slots from public, anon, authenticated, service_role;
revoke all on table public.promotions from public, anon, authenticated, service_role;
revoke all on table public.promotion_media from public, anon, authenticated, service_role;
revoke all on table public.promotion_placements from public, anon, authenticated, service_role;
revoke all on table private.promotion_mutation_requests from public, anon, authenticated, service_role;

create function private.promotion_assert_manager_actor(
  p_actor_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_platform_role text;
begin
  if p_actor_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select account.platform_role
  into v_platform_role
  from public.user_accounts as account
  join public.platform_role_permissions as mapping
    on mapping.platform_role = account.platform_role
  join public.platform_permission_definitions as permission
    on permission.code = mapping.permission_code
   and permission.is_active
  where account.id = p_actor_id
    and account.account_status = 'active'
    and mapping.permission_code = 'promotions.manage'
  for share of account;

  if v_platform_role is null then
    raise exception '배너·홍보 관리 권한이 없습니다.';
  end if;

  return v_platform_role;
end;
$$;

comment on function private.promotion_assert_manager_actor(uuid) is
  'Requires an active account with the explicit promotions.manage permission and returns its platform role.';

revoke all on function private.promotion_assert_manager_actor(uuid)
  from public, anon, authenticated, service_role;

create function private.promotion_assert_manager()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  perform private.promotion_assert_manager_actor(v_actor_id);
  return v_actor_id;
end;
$$;

revoke all on function private.promotion_assert_manager()
  from public, anon, authenticated, service_role;

create function private.promotion_claim_request(
  p_actor_id uuid,
  p_request_id uuid,
  p_action_code text,
  p_request_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fingerprint text;
  v_existing private.promotion_mutation_requests%rowtype;
begin
  if p_actor_id is null or p_request_id is null then
    raise exception '요청 식별자를 확인해 주세요.';
  end if;
  if p_action_code is null or p_request_payload is null then
    raise exception '요청 내용을 확인해 주세요.';
  end if;

  v_fingerprint := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(p_request_payload::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  insert into private.promotion_mutation_requests (
    actor_id,
    request_id,
    action_code,
    request_fingerprint
  )
  values (
    p_actor_id,
    p_request_id,
    p_action_code,
    v_fingerprint
  )
  on conflict (actor_id, request_id) do nothing;

  select request.*
  into v_existing
  from private.promotion_mutation_requests as request
  where request.actor_id = p_actor_id
    and request.request_id = p_request_id
  for update;

  if v_existing.action_code <> p_action_code
     or v_existing.request_fingerprint <> v_fingerprint then
    raise exception '동일한 요청 식별자를 다른 작업에 재사용할 수 없습니다.';
  end if;

  if v_existing.result_data is null
     and exists (
       select 1
       from public.audit_logs as audit
       where audit.actor_id = p_actor_id
         and audit.request_id = p_request_id
     ) then
    raise exception '동일한 요청 식별자는 이미 다른 완료 작업에서 사용되었습니다.';
  end if;

  return v_existing.result_data;
end;
$$;

revoke all on function private.promotion_claim_request(uuid, uuid, text, jsonb)
  from public, anon, authenticated, service_role;

create function private.promotion_complete_request(
  p_actor_id uuid,
  p_request_id uuid,
  p_result_data jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_result_data is null or pg_catalog.jsonb_typeof(p_result_data) <> 'object' then
    raise exception '완료 결과 형식이 올바르지 않습니다.';
  end if;

  update private.promotion_mutation_requests as request
  set result_data = p_result_data,
      completed_at = pg_catalog.now()
  where request.actor_id = p_actor_id
    and request.request_id = p_request_id
    and request.completed_at is null;

  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception '요청 완료 기록을 저장하지 못했습니다.';
  end if;
end;
$$;

revoke all on function private.promotion_complete_request(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;

create function private.promotion_write_audit(
  p_actor_id uuid,
  p_actor_role text,
  p_action text,
  p_target_type text,
  p_target_id text,
  p_before_summary jsonb,
  p_after_summary jsonb,
  p_metadata jsonb,
  p_request_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    insert into public.audit_logs (
      actor_id,
      actor_type,
      actor_role,
      action,
      target_type,
      target_id,
      before_summary,
      after_summary,
      metadata,
      request_id,
      outcome
    )
    values (
      p_actor_id,
      'admin',
      p_actor_role,
      p_action,
      p_target_type,
      p_target_id,
      p_before_summary,
      p_after_summary,
      coalesce(p_metadata, '{}'::jsonb),
      p_request_id,
      'success'
    );
  exception when unique_violation then
    raise exception '동일한 요청 식별자는 이미 다른 완료 작업에서 사용되었습니다.';
  end;
end;
$$;

comment on function private.promotion_write_audit(uuid, text, text, text, text, jsonb, jsonb, jsonb, uuid) is
  'Writes one representative audit row and maps cross-domain request ID collisions to a controlled error.';

revoke all on function private.promotion_write_audit(uuid, text, text, text, text, jsonb, jsonb, jsonb, uuid)
  from public, anon, authenticated, service_role;

create function private.promotion_assert_payload_keys(
  p_payload jsonb,
  p_allowed_keys text[]
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception '요청 내용은 객체여야 합니다.';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_object_keys(p_payload) as supplied(key)
    where not (supplied.key = any (p_allowed_keys))
  ) then
    raise exception '지원하지 않는 요청 필드가 포함되어 있습니다.';
  end if;
end;
$$;

revoke all on function private.promotion_assert_payload_keys(jsonb, text[])
  from public, anon, authenticated, service_role;

create function private.promotion_management_item(
  p_promotion_id uuid
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'promotion_key', promotion.promotion_key,
    'slug', promotion.slug,
    'content_kind', promotion.content_kind,
    'title', promotion.title,
    'summary', promotion.summary,
    'link_type', promotion.link_type,
    'content_status', promotion.content_status,
    'version', promotion.version,
    'available_media_count', (
      select pg_catalog.count(*)::integer
      from public.promotion_media as media
      where media.promotion_id = promotion.id
        and media.media_status = 'available'
    ),
    'published_placement_count', (
      select pg_catalog.count(*)::integer
      from public.promotion_placements as placement
      where placement.promotion_id = promotion.id
        and placement.publication_status = 'published'
    ),
    'created_at', promotion.created_at,
    'updated_at', promotion.updated_at
  )
  from public.promotions as promotion
  where promotion.id = p_promotion_id;
$$;

revoke all on function private.promotion_management_item(uuid)
  from public, anon, authenticated, service_role;

create function private.promotion_placement_item(
  p_placement_id uuid
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'placement_key', placement.placement_key,
    'slot_code', placement.slot_code,
    'promotion_key', promotion.promotion_key,
    'publication_status', placement.publication_status,
    'display_status', case
      when placement.publication_status = 'draft' then 'draft'
      when placement.publication_status = 'hidden' then 'hidden'
      when placement.starts_at > pg_catalog.now() then 'scheduled'
      when placement.ends_at <= pg_catalog.now() then 'ended'
      else 'live'
    end,
    'starts_at', placement.starts_at,
    'ends_at', placement.ends_at,
    'version', placement.version,
    'created_at', placement.created_at,
    'updated_at', placement.updated_at
  )
  from public.promotion_placements as placement
  join public.promotions as promotion on promotion.id = placement.promotion_id
  where placement.id = p_placement_id;
$$;

revoke all on function private.promotion_placement_item(uuid)
  from public, anon, authenticated, service_role;

create function private.promotion_assert_publishable(
  p_promotion_id uuid,
  p_slot_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_promotion public.promotions%rowtype;
  v_slot public.promotion_slots%rowtype;
begin
  select promotion.* into v_promotion
  from public.promotions as promotion
  where promotion.id = p_promotion_id;

  select slot.* into v_slot
  from public.promotion_slots as slot
  where slot.slot_code = p_slot_code;

  if v_slot.slot_code is null or not v_slot.is_enabled then
    raise exception '현재 사용할 수 없는 배너 슬롯입니다.';
  end if;
  if v_promotion.id is null or v_promotion.content_status <> 'ready' then
    raise exception '게시 준비가 완료된 홍보 콘텐츠만 게시할 수 있습니다.';
  end if;
  if not (v_promotion.content_kind = any (v_slot.allowed_content_kinds)) then
    raise exception '이 슬롯에서 허용하지 않는 홍보 유형입니다.';
  end if;
  if not exists (
    select 1
    from public.promotion_media as media
    where media.promotion_id = p_promotion_id
      and media.variant = 'desktop_banner'
      and media.media_status = 'available'
  ) then
    raise exception '게시할 데스크톱 배너 이미지가 필요합니다.';
  end if;
  if v_slot.format_code in ('home_hero', 'mobile_feed')
     and not exists (
       select 1
       from public.promotion_media as media
       where media.promotion_id = p_promotion_id
         and media.variant = 'mobile_banner'
         and media.media_status = 'available'
     ) then
    raise exception '이 슬롯에는 모바일 배너 이미지가 필요합니다.';
  end if;
end;
$$;

revoke all on function private.promotion_assert_publishable(uuid, text)
  from public, anon, authenticated, service_role;

create function public.get_active_promotions_for_slots(
  p_slot_codes text[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_result jsonb := '[]'::jsonb;
begin
  if p_slot_codes is null
     or pg_catalog.cardinality(p_slot_codes) not between 1 and 20 then
    raise exception '배너 슬롯은 한 번에 1개 이상 20개 이하로 조회해 주세요.';
  end if;
  if exists (
    select 1
    from pg_catalog.unnest(p_slot_codes) as requested(slot_code)
    where requested.slot_code is null
      or requested.slot_code <> pg_catalog.btrim(requested.slot_code)
      or pg_catalog.char_length(requested.slot_code) > 80
      or requested.slot_code !~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+){2}$'
  ) then
    raise exception '배너 슬롯 코드를 확인해 주세요.';
  end if;
  if pg_catalog.cardinality(p_slot_codes) <> (
    select pg_catalog.count(distinct requested.slot_code)::integer
    from pg_catalog.unnest(p_slot_codes) as requested(slot_code)
  ) then
    raise exception '배너 슬롯 코드를 중복해서 요청할 수 없습니다.';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'slot_code', listed.slot_code,
        'promotion_key', listed.promotion_key,
        'title', listed.title,
        'summary', listed.summary,
        'content_kind', listed.content_kind,
        'link_type', listed.link_type,
        'external_url', listed.external_url,
        'detail_slug', listed.slug,
        'desktop_media', pg_catalog.jsonb_build_object(
          'bucket', listed.desktop_bucket,
          'path', listed.desktop_path,
          'width', listed.desktop_width,
          'height', listed.desktop_height,
          'alt', listed.desktop_alt
        ),
        'mobile_media', case
          when listed.mobile_path is null then null
          else pg_catalog.jsonb_build_object(
            'bucket', listed.mobile_bucket,
            'path', listed.mobile_path,
            'width', listed.mobile_width,
            'height', listed.mobile_height,
            'alt', listed.mobile_alt
          )
        end,
        'starts_at', listed.starts_at,
        'ends_at', listed.ends_at
      )
      order by listed.sort_order, listed.slot_code
    ),
    '[]'::jsonb
  )
  into v_result
  from (
    select
      slot.slot_code,
      slot.sort_order,
      slot.desktop_width,
      slot.desktop_height,
      slot.mobile_width,
      slot.mobile_height,
      promotion.promotion_key,
      promotion.title,
      promotion.summary,
      promotion.content_kind,
      promotion.link_type,
      promotion.external_url,
      promotion.slug,
      placement.starts_at,
      placement.ends_at,
      desktop_media.storage_bucket as desktop_bucket,
      desktop_media.storage_path as desktop_path,
      desktop_media.alt_text as desktop_alt,
      mobile_media.storage_bucket as mobile_bucket,
      mobile_media.storage_path as mobile_path,
      mobile_media.alt_text as mobile_alt
    from public.promotion_slots as slot
    join public.promotion_placements as placement
      on placement.slot_code = slot.slot_code
     and placement.publication_status = 'published'
     and placement.starts_at <= v_now
     and placement.ends_at > v_now
    join public.promotions as promotion
      on promotion.id = placement.promotion_id
     and promotion.content_status = 'ready'
    join public.promotion_media as desktop_media
      on desktop_media.promotion_id = promotion.id
     and desktop_media.variant = 'desktop_banner'
     and desktop_media.media_status = 'available'
    left join public.promotion_media as mobile_media
      on mobile_media.promotion_id = promotion.id
     and mobile_media.variant = 'mobile_banner'
     and mobile_media.media_status = 'available'
    where slot.slot_code = any (p_slot_codes)
      and slot.is_enabled
      and (
        slot.format_code not in ('home_hero', 'mobile_feed')
        or mobile_media.id is not null
      )
  ) as listed;

  return v_result;
end;
$$;

comment on function public.get_active_promotions_for_slots(text[]) is
  'Returns at most one live, ready promotion per enabled requested slot without internal identifiers. Unknown valid slot codes are ignored.';

revoke all on function public.get_active_promotions_for_slots(text[])
  from public, anon, authenticated, service_role;
grant execute on function public.get_active_promotions_for_slots(text[])
  to anon, authenticated;

create function public.get_public_promotion_detail(
  p_slug text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_slug text := pg_catalog.btrim(p_slug);
  v_now timestamptz := pg_catalog.now();
  v_result jsonb;
begin
  if v_slug is null or v_slug !~ '^[a-z0-9][a-z0-9-]{0,79}$' then
    raise exception '홍보 상세 정보를 찾을 수 없습니다.';
  end if;

  select pg_catalog.jsonb_build_object(
    'promotion_key', promotion.promotion_key,
    'slug', promotion.slug,
    'title', promotion.title,
    'summary', promotion.summary,
    'body', promotion.body,
    'content_kind', promotion.content_kind,
    'detail_cta_label', promotion.detail_cta_label,
    'detail_cta_url', promotion.detail_cta_url,
    'detail_media', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'bucket', media.storage_bucket,
          'path', media.storage_path,
          'alt', media.alt_text,
          'sort_order', media.sort_order
        )
        order by media.sort_order, media.available_at, media.media_key
      )
      from public.promotion_media as media
      where media.promotion_id = promotion.id
        and media.variant = 'detail'
        and media.media_status = 'available'
    ), '[]'::jsonb)
  )
  into v_result
  from public.promotions as promotion
  where promotion.slug = v_slug
    and promotion.link_type = 'internal_detail'
    and promotion.content_status = 'ready'
    and exists (
      select 1
      from public.promotion_placements as placement
      join public.promotion_slots as slot on slot.slot_code = placement.slot_code
      join public.promotion_media as desktop_media
        on desktop_media.promotion_id = promotion.id
       and desktop_media.variant = 'desktop_banner'
       and desktop_media.media_status = 'available'
      left join public.promotion_media as mobile_media
        on mobile_media.promotion_id = promotion.id
       and mobile_media.variant = 'mobile_banner'
       and mobile_media.media_status = 'available'
      where placement.promotion_id = promotion.id
        and placement.publication_status = 'published'
        and placement.starts_at <= v_now
        and placement.ends_at > v_now
        and slot.is_enabled
        and (
          slot.format_code not in ('home_hero', 'mobile_feed')
          or mobile_media.id is not null
        )
    );

  if v_result is null then
    raise exception '홍보 상세 정보를 찾을 수 없습니다.';
  end if;
  return v_result;
end;
$$;

comment on function public.get_public_promotion_detail(text) is
  'Returns a ready internal promotion detail only while at least one enabled placement is live.';

revoke all on function public.get_public_promotion_detail(text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_promotion_detail(text)
  to anon, authenticated;

create function public.list_promotions_for_management(
  p_content_status text default null,
  p_slot_code text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_total integer;
  v_items jsonb := '[]'::jsonb;
begin
  v_actor_id := private.promotion_assert_manager();

  if p_content_status is not null
     and p_content_status not in ('draft', 'ready', 'archived') then
    raise exception '홍보 콘텐츠 상태 필터를 확인해 주세요.';
  end if;
  if p_slot_code is not null
     and (
       p_slot_code <> pg_catalog.btrim(p_slot_code)
       or pg_catalog.char_length(p_slot_code) > 80
       or p_slot_code !~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+){2}$'
     ) then
    raise exception '배너 슬롯 필터를 확인해 주세요.';
  end if;
  if p_limit is null or p_limit not between 1 and 100
     or p_offset is null or p_offset < 0 then
    raise exception '관리 목록 범위를 확인해 주세요.';
  end if;

  select pg_catalog.count(*)::integer
  into v_total
  from public.promotions as promotion
  where (p_content_status is null or promotion.content_status = p_content_status)
    and (
      p_slot_code is null
      or exists (
        select 1
        from public.promotion_placements as placement
        where placement.promotion_id = promotion.id
          and placement.slot_code = p_slot_code
      )
    );

  select coalesce(
    pg_catalog.jsonb_agg(listed.item order by listed.updated_at desc, listed.id),
    '[]'::jsonb
  )
  into v_items
  from (
    select
      promotion.id,
      promotion.updated_at,
      private.promotion_management_item(promotion.id) as item
    from public.promotions as promotion
    where (p_content_status is null or promotion.content_status = p_content_status)
      and (
        p_slot_code is null
        or exists (
          select 1
          from public.promotion_placements as placement
          where placement.promotion_id = promotion.id
            and placement.slot_code = p_slot_code
        )
      )
    order by promotion.updated_at desc, promotion.id
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

revoke all on function public.list_promotions_for_management(text, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_promotions_for_management(text, text, integer, integer)
  to authenticated;

create function public.get_promotion_for_management(
  p_promotion_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_promotion_id uuid;
  v_result jsonb;
begin
  v_actor_id := private.promotion_assert_manager();
  if p_promotion_key is null or p_promotion_key !~ '^[0-9a-f]{32}$' then
    raise exception '홍보 콘텐츠를 찾을 수 없습니다.';
  end if;

  select promotion.id into v_promotion_id
  from public.promotions as promotion
  where promotion.promotion_key = p_promotion_key;

  if v_promotion_id is null then
    raise exception '홍보 콘텐츠를 찾을 수 없습니다.';
  end if;

  select private.promotion_management_item(promotion.id) || pg_catalog.jsonb_build_object(
    'body', promotion.body,
    'external_url', promotion.external_url,
    'detail_cta_label', promotion.detail_cta_label,
    'detail_cta_url', promotion.detail_cta_url,
    'media', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'media_key', media.media_key,
          'variant', media.variant,
          'sort_order', media.sort_order,
          'storage_bucket', media.storage_bucket,
          'storage_path', media.storage_path,
          'alt_text', media.alt_text,
          'media_status', media.media_status,
          'declared_mime_type', media.declared_mime_type,
          'declared_size_bytes', media.declared_size_bytes,
          'version', media.version,
          'created_at', media.created_at,
          'updated_at', media.updated_at
        )
        order by media.variant, media.sort_order, media.created_at, media.id
      )
      from public.promotion_media as media
      where media.promotion_id = promotion.id
    ), '[]'::jsonb),
    'placements', coalesce((
      select pg_catalog.jsonb_agg(
        private.promotion_placement_item(placement.id)
        order by placement.starts_at desc, placement.id
      )
      from public.promotion_placements as placement
      where placement.promotion_id = promotion.id
    ), '[]'::jsonb)
  )
  into v_result
  from public.promotions as promotion
  where promotion.id = v_promotion_id;

  return v_result;
end;
$$;

revoke all on function public.get_promotion_for_management(text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_promotion_for_management(text)
  to authenticated;

create function public.mutate_promotion(
  p_request_id uuid,
  p_operation text,
  p_promotion_key text default null,
  p_expected_version integer default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_actor_role text;
  v_action_code text;
  v_request_payload jsonb;
  v_replay jsonb;
  v_promotion public.promotions%rowtype;
  v_before jsonb;
  v_result jsonb;
begin
  v_actor_id := private.promotion_assert_manager();
  v_actor_role := private.promotion_assert_manager_actor(v_actor_id);

  if p_operation is null or p_operation not in ('create', 'update', 'archive') then
    raise exception '지원하지 않는 홍보 콘텐츠 작업입니다.';
  end if;
  v_action_code := 'promotion.' || p_operation;
  v_request_payload := pg_catalog.jsonb_build_object(
    'operation', p_operation,
    'promotion_key', p_promotion_key,
    'expected_version', p_expected_version,
    'payload', p_payload
  );
  v_replay := private.promotion_claim_request(
    v_actor_id,
    p_request_id,
    v_action_code,
    v_request_payload
  );
  if v_replay is not null then
    return v_replay || pg_catalog.jsonb_build_object('replayed', true);
  end if;

  if p_operation = 'create' then
    if p_promotion_key is not null or p_expected_version is not null then
      raise exception '신규 홍보 콘텐츠 요청 식별자를 확인해 주세요.';
    end if;
    perform private.promotion_assert_payload_keys(
      p_payload,
      array[
        'content_kind', 'title', 'summary', 'link_type', 'slug', 'body',
        'external_url', 'detail_cta_label', 'detail_cta_url'
      ]::text[]
    );
    if p_payload ->> 'content_kind' is null
       or p_payload ->> 'title' is null
       or p_payload ->> 'summary' is null
       or p_payload ->> 'link_type' is null then
      raise exception '홍보 유형, 제목, 요약, 연결 방식을 모두 입력해 주세요.';
    end if;

    begin
      insert into public.promotions (
      content_kind,
      title,
      summary,
      body,
      link_type,
      external_url,
      slug,
      detail_cta_label,
      detail_cta_url,
      created_by,
      updated_by
    )
    values (
      pg_catalog.btrim(p_payload ->> 'content_kind'),
      pg_catalog.btrim(p_payload ->> 'title'),
      pg_catalog.btrim(p_payload ->> 'summary'),
      nullif(pg_catalog.btrim(p_payload ->> 'body'), ''),
      pg_catalog.btrim(p_payload ->> 'link_type'),
      nullif(pg_catalog.btrim(p_payload ->> 'external_url'), ''),
      nullif(pg_catalog.btrim(p_payload ->> 'slug'), ''),
      nullif(pg_catalog.btrim(p_payload ->> 'detail_cta_label'), ''),
      nullif(pg_catalog.btrim(p_payload ->> 'detail_cta_url'), ''),
      v_actor_id,
      v_actor_id
    )
      returning * into v_promotion;
    exception when unique_violation then
      raise exception '이미 사용 중인 홍보 상세 주소입니다.';
    end;
  else
    if p_promotion_key is null or p_promotion_key !~ '^[0-9a-f]{32}$'
       or p_expected_version is null or p_expected_version < 1 then
      raise exception '홍보 콘텐츠와 버전을 확인해 주세요.';
    end if;

    select promotion.* into v_promotion
    from public.promotions as promotion
    where promotion.promotion_key = p_promotion_key
    for update;

    if v_promotion.id is null then
      raise exception '홍보 콘텐츠를 찾을 수 없습니다.';
    end if;
    if v_promotion.version <> p_expected_version then
      raise exception '홍보 콘텐츠가 변경되었습니다. 최신 정보를 다시 확인해 주세요.';
    end if;

    v_before := pg_catalog.jsonb_build_object(
      'promotion_key', v_promotion.promotion_key,
      'content_kind', v_promotion.content_kind,
      'content_status', v_promotion.content_status,
      'version', v_promotion.version
    );

    if p_operation = 'update' then
      if v_promotion.content_status = 'archived' then
        raise exception '보관된 홍보 콘텐츠는 수정할 수 없습니다.';
      end if;
      perform private.promotion_assert_payload_keys(
        p_payload,
        array[
          'content_kind', 'title', 'summary', 'link_type', 'slug', 'body',
          'external_url', 'detail_cta_label', 'detail_cta_url', 'content_status'
        ]::text[]
      );
      if p_payload = '{}'::jsonb then
        raise exception '변경할 홍보 콘텐츠 내용을 입력해 주세요.';
      end if;

      begin
        update public.promotions as promotion
        set content_kind = case when p_payload ? 'content_kind'
            then pg_catalog.btrim(p_payload ->> 'content_kind') else promotion.content_kind end,
          title = case when p_payload ? 'title'
            then pg_catalog.btrim(p_payload ->> 'title') else promotion.title end,
          summary = case when p_payload ? 'summary'
            then pg_catalog.btrim(p_payload ->> 'summary') else promotion.summary end,
          link_type = case when p_payload ? 'link_type'
            then pg_catalog.btrim(p_payload ->> 'link_type') else promotion.link_type end,
          slug = case when p_payload ? 'slug'
            then nullif(pg_catalog.btrim(p_payload ->> 'slug'), '') else promotion.slug end,
          body = case when p_payload ? 'body'
            then nullif(pg_catalog.btrim(p_payload ->> 'body'), '') else promotion.body end,
          external_url = case when p_payload ? 'external_url'
            then nullif(pg_catalog.btrim(p_payload ->> 'external_url'), '') else promotion.external_url end,
          detail_cta_label = case when p_payload ? 'detail_cta_label'
            then nullif(pg_catalog.btrim(p_payload ->> 'detail_cta_label'), '') else promotion.detail_cta_label end,
          detail_cta_url = case when p_payload ? 'detail_cta_url'
            then nullif(pg_catalog.btrim(p_payload ->> 'detail_cta_url'), '') else promotion.detail_cta_url end,
          content_status = case when p_payload ? 'content_status'
            then pg_catalog.btrim(p_payload ->> 'content_status') else promotion.content_status end,
          updated_by = v_actor_id,
          version = promotion.version + 1
      where promotion.id = v_promotion.id
        returning * into v_promotion;
      exception when unique_violation then
        raise exception '이미 사용 중인 홍보 상세 주소입니다.';
      end;

      if v_promotion.content_status = 'archived' then
        raise exception '보관은 별도 보관 작업으로 진행해 주세요.';
      end if;
      if v_promotion.content_status = 'ready'
         and not exists (
           select 1
           from public.promotion_media as media
           where media.promotion_id = v_promotion.id
             and media.variant = 'desktop_banner'
             and media.media_status = 'available'
         ) then
        raise exception '게시 준비 전 데스크톱 배너 이미지를 등록해 주세요.';
      end if;
      if v_promotion.content_status <> 'ready'
         and exists (
           select 1
           from public.promotion_placements as placement
           where placement.promotion_id = v_promotion.id
             and placement.publication_status = 'published'
         ) then
        raise exception '게시 중인 배정을 먼저 숨겨 주세요.';
      end if;
    else
      perform private.promotion_assert_payload_keys(p_payload, array[]::text[]);
      if v_promotion.content_status = 'archived' then
        raise exception '이미 보관된 홍보 콘텐츠입니다.';
      end if;
      if exists (
        select 1
        from public.promotion_placements as placement
        where placement.promotion_id = v_promotion.id
          and placement.publication_status = 'published'
      ) then
        raise exception '게시 중인 배정을 먼저 숨겨 주세요.';
      end if;

      update public.promotions as promotion
      set content_status = 'archived',
          updated_by = v_actor_id,
          version = promotion.version + 1
      where promotion.id = v_promotion.id
      returning * into v_promotion;
    end if;
  end if;

  v_result := pg_catalog.jsonb_build_object(
    'request_id', p_request_id,
    'replayed', false,
    'promotion', private.promotion_management_item(v_promotion.id)
  );

  perform private.promotion_write_audit(
    v_actor_id,
    v_actor_role,
    v_action_code,
    'promotion',
    v_promotion.promotion_key,
    v_before,
    pg_catalog.jsonb_build_object(
      'promotion_key', v_promotion.promotion_key,
      'content_kind', v_promotion.content_kind,
      'content_status', v_promotion.content_status,
      'version', v_promotion.version
    ),
    '{}'::jsonb,
    p_request_id
  );

  perform private.promotion_complete_request(v_actor_id, p_request_id, v_result);
  return v_result;
end;
$$;

comment on function public.mutate_promotion(uuid, text, text, integer, jsonb) is
  'Idempotent promotions.manage create, update, and archive mutations with optimistic version checks and representative audit.';

revoke all on function public.mutate_promotion(uuid, text, text, integer, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.mutate_promotion(uuid, text, text, integer, jsonb)
  to authenticated;

create function public.mutate_promotion_placement(
  p_request_id uuid,
  p_operation text,
  p_placement_key text default null,
  p_expected_version integer default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_actor_role text;
  v_action_code text;
  v_request_payload jsonb;
  v_replay jsonb;
  v_placement public.promotion_placements%rowtype;
  v_promotion_id uuid;
  v_slot_code text;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_before jsonb;
  v_result jsonb;
begin
  v_actor_id := private.promotion_assert_manager();
  v_actor_role := private.promotion_assert_manager_actor(v_actor_id);

  if p_operation is null or p_operation not in ('create', 'update', 'publish', 'hide') then
    raise exception '지원하지 않는 게시 배정 작업입니다.';
  end if;
  v_action_code := 'promotion.placement.' || p_operation;
  v_request_payload := pg_catalog.jsonb_build_object(
    'operation', p_operation,
    'placement_key', p_placement_key,
    'expected_version', p_expected_version,
    'payload', p_payload
  );
  v_replay := private.promotion_claim_request(
    v_actor_id,
    p_request_id,
    v_action_code,
    v_request_payload
  );
  if v_replay is not null then
    return v_replay || pg_catalog.jsonb_build_object('replayed', true);
  end if;

  if p_operation = 'create' then
    if p_placement_key is not null or p_expected_version is not null then
      raise exception '신규 게시 배정 요청 식별자를 확인해 주세요.';
    end if;
    perform private.promotion_assert_payload_keys(
      p_payload,
      array['slot_code', 'promotion_key', 'starts_at', 'ends_at']::text[]
    );
    v_slot_code := pg_catalog.btrim(p_payload ->> 'slot_code');
    begin
      v_starts_at := (p_payload ->> 'starts_at')::timestamptz;
      v_ends_at := (p_payload ->> 'ends_at')::timestamptz;
    exception when others then
      raise exception '게시 시작·종료 시각을 확인해 주세요.';
    end;
    if v_starts_at is null or v_ends_at is null or v_ends_at <= v_starts_at then
      raise exception '게시 종료 시각은 시작 시각보다 늦어야 합니다.';
    end if;

    perform 1
    from public.promotion_slots as slot
    where slot.slot_code = v_slot_code
    for update;
    if not found then
      raise exception '배너 슬롯을 찾을 수 없습니다.';
    end if;

    select promotion.id into v_promotion_id
    from public.promotions as promotion
    where promotion.promotion_key = pg_catalog.btrim(p_payload ->> 'promotion_key')
    for update;
    if v_promotion_id is null then
      raise exception '홍보 콘텐츠를 찾을 수 없습니다.';
    end if;

    insert into public.promotion_placements (
      slot_code,
      promotion_id,
      starts_at,
      ends_at,
      created_by,
      updated_by
    )
    values (
      v_slot_code,
      v_promotion_id,
      v_starts_at,
      v_ends_at,
      v_actor_id,
      v_actor_id
    )
    returning * into v_placement;
  else
    if p_placement_key is null or p_placement_key !~ '^[0-9a-f]{32}$'
       or p_expected_version is null or p_expected_version < 1 then
      raise exception '게시 배정과 버전을 확인해 주세요.';
    end if;

    select placement.slot_code into v_slot_code
    from public.promotion_placements as placement
    where placement.placement_key = p_placement_key;
    if v_slot_code is null then
      raise exception '게시 배정을 찾을 수 없습니다.';
    end if;

    perform 1
    from public.promotion_slots as slot
    where slot.slot_code = v_slot_code
    for update;

    select placement.* into v_placement
    from public.promotion_placements as placement
    where placement.placement_key = p_placement_key
    for update;

    if v_placement.version <> p_expected_version then
      raise exception '게시 배정이 변경되었습니다. 최신 정보를 다시 확인해 주세요.';
    end if;

    perform 1
    from public.promotions as promotion
    where promotion.id = v_placement.promotion_id
    for update;

    v_before := pg_catalog.jsonb_build_object(
      'placement_key', v_placement.placement_key,
      'slot_code', v_placement.slot_code,
      'publication_status', v_placement.publication_status,
      'starts_at', v_placement.starts_at,
      'ends_at', v_placement.ends_at,
      'version', v_placement.version
    );

    if p_operation = 'update' then
      perform private.promotion_assert_payload_keys(
        p_payload,
        array['starts_at', 'ends_at']::text[]
      );
      if p_payload = '{}'::jsonb then
        raise exception '변경할 게시 기간을 입력해 주세요.';
      end if;
      begin
        v_starts_at := case when p_payload ? 'starts_at'
          then (p_payload ->> 'starts_at')::timestamptz else v_placement.starts_at end;
        v_ends_at := case when p_payload ? 'ends_at'
          then (p_payload ->> 'ends_at')::timestamptz else v_placement.ends_at end;
      exception when others then
        raise exception '게시 시작·종료 시각을 확인해 주세요.';
      end;
      if v_starts_at is null or v_ends_at is null or v_ends_at <= v_starts_at then
        raise exception '게시 종료 시각은 시작 시각보다 늦어야 합니다.';
      end if;
      if v_placement.publication_status = 'published' then
        perform private.promotion_assert_publishable(
          v_placement.promotion_id,
          v_placement.slot_code
        );
        if exists (
          select 1
          from public.promotion_placements as conflict
          where conflict.slot_code = v_placement.slot_code
            and conflict.publication_status = 'published'
            and conflict.id <> v_placement.id
            and tstzrange(conflict.starts_at, conflict.ends_at, '[)')
              && tstzrange(v_starts_at, v_ends_at, '[)')
        ) then
          raise exception '선택한 기간에 이미 게시된 홍보 콘텐츠가 있습니다.';
        end if;
      end if;

      begin
        update public.promotion_placements as placement
        set starts_at = v_starts_at,
            ends_at = v_ends_at,
            updated_by = v_actor_id,
            version = placement.version + 1
        where placement.id = v_placement.id
        returning * into v_placement;
      exception when exclusion_violation then
        raise exception '선택한 기간에 이미 게시된 홍보 콘텐츠가 있습니다.';
      end;
    elsif p_operation = 'publish' then
      perform private.promotion_assert_payload_keys(p_payload, array[]::text[]);
      if v_placement.publication_status = 'published' then
        raise exception '이미 게시된 배정입니다.';
      end if;
      perform private.promotion_assert_publishable(
        v_placement.promotion_id,
        v_placement.slot_code
      );
      if exists (
        select 1
        from public.promotion_placements as conflict
        where conflict.slot_code = v_placement.slot_code
          and conflict.publication_status = 'published'
          and conflict.id <> v_placement.id
          and tstzrange(conflict.starts_at, conflict.ends_at, '[)')
            && tstzrange(v_placement.starts_at, v_placement.ends_at, '[)')
      ) then
        raise exception '선택한 기간에 이미 게시된 홍보 콘텐츠가 있습니다.';
      end if;
      begin
        update public.promotion_placements as placement
        set publication_status = 'published',
            updated_by = v_actor_id,
            version = placement.version + 1
        where placement.id = v_placement.id
        returning * into v_placement;
      exception when exclusion_violation then
        raise exception '선택한 기간에 이미 게시된 홍보 콘텐츠가 있습니다.';
      end;
    else
      perform private.promotion_assert_payload_keys(p_payload, array[]::text[]);
      if v_placement.publication_status = 'hidden' then
        raise exception '이미 숨김 처리된 배정입니다.';
      end if;
      update public.promotion_placements as placement
      set publication_status = 'hidden',
          updated_by = v_actor_id,
          version = placement.version + 1
      where placement.id = v_placement.id
      returning * into v_placement;
    end if;
  end if;

  v_result := pg_catalog.jsonb_build_object(
    'request_id', p_request_id,
    'replayed', false,
    'placement', private.promotion_placement_item(v_placement.id)
  );

  perform private.promotion_write_audit(
    v_actor_id,
    v_actor_role,
    v_action_code,
    'promotion_placement',
    v_placement.placement_key,
    v_before,
    private.promotion_placement_item(v_placement.id),
    '{}'::jsonb,
    p_request_id
  );

  perform private.promotion_complete_request(v_actor_id, p_request_id, v_result);
  return v_result;
end;
$$;

comment on function public.mutate_promotion_placement(uuid, text, text, integer, jsonb) is
  'Idempotent placement create, schedule update, publish, and hide mutation. Slot locking and an exclusion constraint serialize overlapping publication attempts.';

revoke all on function public.mutate_promotion_placement(uuid, text, text, integer, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.mutate_promotion_placement(uuid, text, text, integer, jsonb)
  to authenticated;

create function public.create_promotion_media_upload_intent(
  p_request_id uuid,
  p_promotion_key text,
  p_variant text,
  p_sort_order integer,
  p_alt_text text,
  p_declared_mime_type text,
  p_declared_size_bytes bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_actor_role text;
  v_request_payload jsonb;
  v_replay jsonb;
  v_promotion public.promotions%rowtype;
  v_media public.promotion_media%rowtype;
  v_media_id uuid := pg_catalog.gen_random_uuid();
  v_media_key text := pg_catalog.encode(extensions.gen_random_bytes(16), 'hex');
  v_variant_path text;
  v_result jsonb;
begin
  v_actor_id := private.promotion_assert_manager();
  v_actor_role := private.promotion_assert_manager_actor(v_actor_id);
  v_request_payload := pg_catalog.jsonb_build_object(
    'promotion_key', p_promotion_key,
    'variant', p_variant,
    'sort_order', p_sort_order,
    'alt_text', p_alt_text,
    'declared_mime_type', p_declared_mime_type,
    'declared_size_bytes', p_declared_size_bytes
  );
  v_replay := private.promotion_claim_request(
    v_actor_id,
    p_request_id,
    'promotion.media.upload_intent',
    v_request_payload
  );
  if v_replay is not null then
    return v_replay || pg_catalog.jsonb_build_object('replayed', true);
  end if;

  if p_promotion_key is null or p_promotion_key !~ '^[0-9a-f]{32}$' then
    raise exception '홍보 콘텐츠를 찾을 수 없습니다.';
  end if;
  if p_variant is null or p_variant not in ('desktop_banner', 'mobile_banner', 'detail') then
    raise exception '홍보 이미지 종류를 확인해 주세요.';
  end if;
  if p_sort_order is null
     or (
       p_variant in ('desktop_banner', 'mobile_banner')
       and p_sort_order <> 0
     )
     or (p_variant = 'detail' and p_sort_order not between 0 and 9) then
    raise exception '홍보 이미지 순서를 확인해 주세요.';
  end if;
  if p_alt_text is null
     or p_alt_text <> pg_catalog.btrim(p_alt_text)
     or pg_catalog.char_length(p_alt_text) not between 2 and 240 then
    raise exception '이미지 대체 텍스트를 2자 이상 240자 이하로 입력해 주세요.';
  end if;
  if p_declared_mime_type is null
     or p_declared_mime_type not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'JPEG, PNG, WebP 이미지만 등록할 수 있습니다.';
  end if;
  if p_declared_size_bytes is null
     or p_declared_size_bytes not between 1 and 5242880 then
    raise exception '이미지 크기는 5MB 이하여야 합니다.';
  end if;

  select promotion.* into v_promotion
  from public.promotions as promotion
  where promotion.promotion_key = p_promotion_key
  for update;

  if v_promotion.id is null then
    raise exception '홍보 콘텐츠를 찾을 수 없습니다.';
  end if;
  if v_promotion.content_status = 'archived' then
    raise exception '보관된 홍보 콘텐츠에는 이미지를 등록할 수 없습니다.';
  end if;
  if exists (
    select 1
    from public.promotion_media as media
    where media.promotion_id = v_promotion.id
      and media.variant = p_variant
      and media.sort_order = p_sort_order
      and media.media_status = 'pending_upload'
  ) then
    raise exception '같은 위치의 이미지 업로드가 이미 진행 중입니다.';
  end if;

  v_variant_path := case p_variant
    when 'desktop_banner' then 'desktop'
    when 'mobile_banner' then 'mobile'
    else 'detail'
  end;

  insert into public.promotion_media (
    id,
    media_key,
    promotion_id,
    variant,
    sort_order,
    storage_path,
    alt_text,
    declared_mime_type,
    declared_size_bytes
  )
  values (
    v_media_id,
    v_media_key,
    v_promotion.id,
    p_variant,
    p_sort_order,
    v_promotion.promotion_key || '/' || v_variant_path || '/' || v_media_key || '/original',
    p_alt_text,
    p_declared_mime_type,
    p_declared_size_bytes
  )
  returning * into v_media;

  v_result := pg_catalog.jsonb_build_object(
    'request_id', p_request_id,
    'replayed', false,
    'media_key', v_media.media_key,
    'media_status', v_media.media_status,
    'version', v_media.version
  );

  perform private.promotion_write_audit(
    v_actor_id, v_actor_role, 'promotion.media.upload_intent',
    'promotion_media', v_media.media_key, null,
    pg_catalog.jsonb_build_object(
      'promotion_key', v_promotion.promotion_key,
      'media_key', v_media.media_key,
      'variant', v_media.variant,
      'sort_order', v_media.sort_order,
      'media_status', v_media.media_status
    ),
    '{}'::jsonb, p_request_id
  );

  perform private.promotion_complete_request(v_actor_id, p_request_id, v_result);
  return v_result;
end;
$$;

comment on function public.create_promotion_media_upload_intent(uuid, text, text, integer, text, text, bigint) is
  'Creates idempotent metadata for a server-issued signed upload. It never returns a Storage path or service credential to direct table access.';

revoke all on function public.create_promotion_media_upload_intent(uuid, text, text, integer, text, text, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.create_promotion_media_upload_intent(uuid, text, text, integer, text, text, bigint)
  to authenticated;

create function public.get_promotion_media_upload_context_for_service(
  p_actor_id uuid,
  p_media_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception '서버 전용 작업입니다.';
  end if;
  perform private.promotion_assert_manager_actor(p_actor_id);
  if p_media_key is null or p_media_key !~ '^[0-9a-f]{32}$' then
    raise exception '홍보 이미지를 찾을 수 없습니다.';
  end if;

  select pg_catalog.jsonb_build_object(
    'media_key', media.media_key,
    'storage_bucket', media.storage_bucket,
    'storage_path', media.storage_path,
    'declared_mime_type', media.declared_mime_type,
    'declared_size_bytes', media.declared_size_bytes,
    'media_status', media.media_status,
    'version', media.version
  )
  into v_result
  from public.promotion_media as media
  where media.media_key = p_media_key;

  if v_result is null then
    raise exception '홍보 이미지를 찾을 수 없습니다.';
  end if;
  return v_result;
end;
$$;

revoke all on function public.get_promotion_media_upload_context_for_service(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_promotion_media_upload_context_for_service(uuid, text)
  to service_role;

create function public.finalize_promotion_media_for_service(
  p_actor_id uuid,
  p_request_id uuid,
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
  v_actor_role text;
  v_request_payload jsonb;
  v_replay jsonb;
  v_media public.promotion_media%rowtype;
  v_replaced_path text;
  v_result jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception '서버 전용 작업입니다.';
  end if;
  v_actor_role := private.promotion_assert_manager_actor(p_actor_id);
  v_request_payload := pg_catalog.jsonb_build_object(
    'media_key', p_media_key,
    'verified_mime_type', p_verified_mime_type,
    'verified_size_bytes', p_verified_size_bytes
  );
  v_replay := private.promotion_claim_request(
    p_actor_id,
    p_request_id,
    'promotion.media.finalize',
    v_request_payload
  );
  if v_replay is not null then
    return v_replay || pg_catalog.jsonb_build_object('replayed', true);
  end if;

  if p_media_key is null or p_media_key !~ '^[0-9a-f]{32}$' then
    raise exception '홍보 이미지를 찾을 수 없습니다.';
  end if;

  select media.* into v_media
  from public.promotion_media as media
  where media.media_key = p_media_key
  for update;

  if v_media.id is null then
    raise exception '홍보 이미지를 찾을 수 없습니다.';
  end if;
  if v_media.media_status <> 'pending_upload' then
    raise exception '완료할 수 없는 이미지 상태입니다.';
  end if;
  if p_verified_mime_type is distinct from v_media.declared_mime_type
     or p_verified_size_bytes is distinct from v_media.declared_size_bytes then
    raise exception '업로드된 이미지가 선언한 파일 정보와 일치하지 않습니다.';
  end if;
  if p_verified_mime_type not in ('image/jpeg', 'image/png', 'image/webp')
     or p_verified_size_bytes not between 1 and 5242880 then
    raise exception '업로드된 이미지 형식을 확인해 주세요.';
  end if;

  perform 1
  from public.promotions as promotion
  where promotion.id = v_media.promotion_id
    and promotion.content_status <> 'archived'
  for update;
  if not found then
    raise exception '보관된 홍보 콘텐츠의 업로드를 완료할 수 없습니다.';
  end if;

  select existing.storage_path
  into v_replaced_path
  from public.promotion_media as existing
  where existing.promotion_id = v_media.promotion_id
    and existing.variant = v_media.variant
    and existing.sort_order = v_media.sort_order
    and existing.media_status = 'available'
  for update;

  update public.promotion_media as existing
  set media_status = 'removed',
      removed_at = pg_catalog.now(),
      version = existing.version + 1
  where existing.promotion_id = v_media.promotion_id
    and existing.variant = v_media.variant
    and existing.sort_order = v_media.sort_order
    and existing.media_status = 'available';

  update public.promotion_media as media
  set media_status = 'available',
      verified_mime_type = p_verified_mime_type,
      verified_size_bytes = p_verified_size_bytes,
      available_at = pg_catalog.now(),
      version = media.version + 1
  where media.id = v_media.id
  returning * into v_media;

  v_result := pg_catalog.jsonb_build_object(
    'request_id', p_request_id,
    'replayed', false,
    'media_key', v_media.media_key,
    'media_status', v_media.media_status,
    'version', v_media.version,
    'storage_bucket', v_media.storage_bucket,
    'storage_path', v_media.storage_path,
    'replaced_storage_path', v_replaced_path
  );

  perform private.promotion_write_audit(
    p_actor_id, v_actor_role, 'promotion.media.finalize',
    'promotion_media', v_media.media_key,
    pg_catalog.jsonb_build_object('media_status', 'pending_upload'),
    pg_catalog.jsonb_build_object(
      'media_key', v_media.media_key,
      'variant', v_media.variant,
      'sort_order', v_media.sort_order,
      'media_status', v_media.media_status,
      'version', v_media.version
    ),
    pg_catalog.jsonb_build_object('replaced_existing_media', v_replaced_path is not null),
    p_request_id
  );

  perform private.promotion_complete_request(p_actor_id, p_request_id, v_result);
  return v_result;
end;
$$;

revoke all on function public.finalize_promotion_media_for_service(uuid, uuid, text, text, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.finalize_promotion_media_for_service(uuid, uuid, text, text, bigint)
  to service_role;

create function public.mark_promotion_media_upload_failed_for_service(
  p_actor_id uuid,
  p_media_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception '서버 전용 작업입니다.';
  end if;
  perform private.promotion_assert_manager_actor(p_actor_id);

  update public.promotion_media as media
  set media_status = 'failed',
      version = media.version + 1
  where media.media_key = p_media_key
    and media.media_status = 'pending_upload';
end;
$$;

revoke all on function public.mark_promotion_media_upload_failed_for_service(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.mark_promotion_media_upload_failed_for_service(uuid, text)
  to service_role;

create function public.remove_promotion_media_for_service(
  p_actor_id uuid,
  p_request_id uuid,
  p_media_key text,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text;
  v_request_payload jsonb;
  v_replay jsonb;
  v_media public.promotion_media%rowtype;
  v_result jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception '서버 전용 작업입니다.';
  end if;
  v_actor_role := private.promotion_assert_manager_actor(p_actor_id);
  v_request_payload := pg_catalog.jsonb_build_object(
    'media_key', p_media_key,
    'expected_version', p_expected_version
  );
  v_replay := private.promotion_claim_request(
    p_actor_id,
    p_request_id,
    'promotion.media.remove',
    v_request_payload
  );
  if v_replay is not null then
    return v_replay || pg_catalog.jsonb_build_object('replayed', true);
  end if;

  if p_media_key is null or p_media_key !~ '^[0-9a-f]{32}$'
     or p_expected_version is null or p_expected_version < 1 then
    raise exception '홍보 이미지와 버전을 확인해 주세요.';
  end if;

  select media.* into v_media
  from public.promotion_media as media
  where media.media_key = p_media_key
  for update;

  if v_media.id is null then
    raise exception '홍보 이미지를 찾을 수 없습니다.';
  end if;
  if v_media.version <> p_expected_version then
    raise exception '홍보 이미지가 변경되었습니다. 최신 정보를 다시 확인해 주세요.';
  end if;
  if v_media.media_status not in ('pending_upload', 'available') then
    raise exception '삭제할 수 없는 이미지 상태입니다.';
  end if;
  if v_media.media_status = 'available'
     and exists (
       select 1
       from public.promotion_placements as placement
       where placement.promotion_id = v_media.promotion_id
         and placement.publication_status = 'published'
     ) then
    raise exception '게시 중인 배정을 먼저 숨겨 주세요.';
  end if;

  update public.promotion_media as media
  set media_status = 'removed',
      removed_at = pg_catalog.now(),
      version = media.version + 1
  where media.id = v_media.id
  returning * into v_media;

  v_result := pg_catalog.jsonb_build_object(
    'request_id', p_request_id,
    'replayed', false,
    'media_key', v_media.media_key,
    'media_status', v_media.media_status,
    'version', v_media.version,
    'storage_bucket', v_media.storage_bucket,
    'storage_path', v_media.storage_path
  );

  perform private.promotion_write_audit(
    p_actor_id, v_actor_role, 'promotion.media.remove',
    'promotion_media', v_media.media_key,
    pg_catalog.jsonb_build_object(
      'media_status', case when v_media.available_at is null then 'pending_upload' else 'available' end,
      'version', v_media.version - 1
    ),
    pg_catalog.jsonb_build_object(
      'media_status', v_media.media_status,
      'version', v_media.version
    ),
    '{}'::jsonb, p_request_id
  );

  perform private.promotion_complete_request(p_actor_id, p_request_id, v_result);
  return v_result;
end;
$$;

revoke all on function public.remove_promotion_media_for_service(uuid, uuid, text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.remove_promotion_media_for_service(uuid, uuid, text, integer)
  to service_role;

comment on function public.finalize_promotion_media_for_service(uuid, uuid, text, text, bigint) is
  'Service-role-only idempotent finalize after object MIME and size verification; an existing image at the same variant/order is atomically retired.';
comment on function public.mark_promotion_media_upload_failed_for_service(uuid, text) is
  'Service-role-only compensation marker for a pending signed upload that failed or was deleted.';
comment on function public.remove_promotion_media_for_service(uuid, uuid, text, integer) is
  'Service-role-only idempotent metadata removal. Server code removes the returned public object as compensation.';

do $$
begin
  if (
    select pg_catalog.count(*)
    from public.promotion_slots
  ) <> 13 then
    raise exception '승인된 홍보 슬롯 catalog 개수가 일치하지 않습니다.';
  end if;
  if (
    select pg_catalog.count(*)
    from public.promotion_slots
    where is_enabled
  ) <> 12 then
    raise exception '활성 홍보 슬롯 catalog 개수가 일치하지 않습니다.';
  end if;
  if not exists (
    select 1
    from public.promotion_slots
    where slot_code = 'hall_of_fame.top.01'
      and not is_enabled
      and not ('advertisement' = any (allowed_content_kinds))
  ) then
    raise exception '명예의 전당 홍보 슬롯 보호 정책이 일치하지 않습니다.';
  end if;
  if exists (
    select 1
    from public.promotion_slots
    where page_path = '/my'
      or placement_code like '%detail%'
  ) then
    raise exception 'MY 또는 상세페이지 홍보 슬롯을 seed할 수 없습니다.';
  end if;
  if not exists (
    select 1
    from public.platform_role_permissions
    where platform_role = 'platform_admin'
      and permission_code = 'promotions.manage'
  ) or exists (
    select 1
    from public.platform_role_permissions
    where platform_role = 'platform_moderator'
      and permission_code = 'promotions.manage'
  ) then
    raise exception '홍보 관리 권한 연결이 승인된 정책과 일치하지 않습니다.';
  end if;
end;
$$;
