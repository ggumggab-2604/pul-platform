create function private.valid_lesson_text_array(
  p_values text[],
  p_min_items integer,
  p_max_items integer,
  p_max_length integer
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    p_values is not null
    and pg_catalog.cardinality(p_values) between p_min_items and p_max_items
    and not exists (
      select 1
      from pg_catalog.unnest(p_values) as item(value)
      where item.value is null
        or item.value <> pg_catalog.btrim(item.value)
        or item.value = ''
        or pg_catalog.char_length(item.value) > p_max_length
    );
$$;

revoke all on function private.valid_lesson_text_array(text[], integer, integer, integer)
  from public, anon, authenticated, service_role;

create function private.valid_lesson_external_url(p_url text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    p_url is null
    or (
      p_url = pg_catalog.btrim(p_url)
      and pg_catalog.char_length(p_url) between 12 and 500
      and p_url ~ '^https://'
    );
$$;

revoke all on function private.valid_lesson_external_url(text)
  from public, anon, authenticated, service_role;

create function private.valid_lesson_youtube_url(p_url text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    p_url is not null
    and private.valid_lesson_external_url(p_url)
    and p_url ~ '^https://((www\.)?youtube\.com/|youtu\.be/)';
$$;

revoke all on function private.valid_lesson_youtube_url(text)
  from public, anon, authenticated, service_role;

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  lesson_key text not null,
  title text not null,
  lesson_type text not null,
  province text not null,
  district text not null,
  location text not null,
  instructor_name text not null,
  organizer_name text not null,
  targets text[] not null default '{}'::text[],
  schedule_text text not null,
  schedule_tags text[] not null default '{}'::text[],
  time_text text not null,
  price_text text not null,
  lesson_format text not null,
  recruit_status text not null,
  description text not null,
  curriculum text not null,
  supplies text not null,
  notices text[] not null default '{}'::text[],
  inquiry_note text,
  inquiry_url text,
  official_url text,
  is_featured boolean not null default false,
  publication_status text not null default 'hidden',
  version integer not null default 1,
  created_by uuid not null references public.user_accounts (id),
  updated_by uuid not null references public.user_accounts (id),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint lessons_lesson_key_uidx unique (lesson_key),
  constraint lessons_lesson_key_check check (
    lesson_key = pg_catalog.btrim(lesson_key)
    and lesson_key ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'
  ),
  constraint lessons_title_check check (
    title = pg_catalog.btrim(title)
    and pg_catalog.char_length(title) between 2 and 160
  ),
  constraint lessons_type_check check (
    lesson_type in ('beginner', 'improvement', 'group', 'certification', 'referee', 'instructor', 'online')
  ),
  constraint lessons_province_check check (
    province in ('서울', '경기', '인천', '충청', '강원', '전라', '경상', '제주')
  ),
  constraint lessons_district_check check (
    district = pg_catalog.btrim(district)
    and pg_catalog.char_length(district) between 1 and 100
  ),
  constraint lessons_location_check check (
    location = pg_catalog.btrim(location)
    and pg_catalog.char_length(location) between 2 and 200
  ),
  constraint lessons_instructor_name_check check (
    instructor_name = pg_catalog.btrim(instructor_name)
    and pg_catalog.char_length(instructor_name) between 1 and 100
  ),
  constraint lessons_organizer_name_check check (
    organizer_name = pg_catalog.btrim(organizer_name)
    and pg_catalog.char_length(organizer_name) between 2 and 160
  ),
  constraint lessons_targets_check check (
    private.valid_lesson_text_array(targets, 1, 5, 40)
    and targets <@ array['absolute_beginner', 'golf_experienced', 'senior', 'club_member', 'cert_prep']::text[]
  ),
  constraint lessons_schedule_text_check check (
    schedule_text = pg_catalog.btrim(schedule_text)
    and pg_catalog.char_length(schedule_text) between 2 and 300
  ),
  constraint lessons_schedule_tags_check check (
    private.valid_lesson_text_array(schedule_tags, 0, 4, 40)
    and schedule_tags <@ array['this_week', 'this_month', 'always', 'closing_soon']::text[]
  ),
  constraint lessons_time_text_check check (
    time_text = pg_catalog.btrim(time_text)
    and pg_catalog.char_length(time_text) between 1 and 100
  ),
  constraint lessons_price_text_check check (
    price_text = pg_catalog.btrim(price_text)
    and pg_catalog.char_length(price_text) between 1 and 100
  ),
  constraint lessons_format_check check (
    lesson_format in ('offline', 'online', 'field', 'group')
  ),
  constraint lessons_recruit_status_check check (
    recruit_status in ('recruiting', 'waiting', 'closed')
  ),
  constraint lessons_description_check check (
    description = pg_catalog.btrim(description)
    and pg_catalog.char_length(description) between 10 and 3000
  ),
  constraint lessons_curriculum_check check (
    curriculum = pg_catalog.btrim(curriculum)
    and pg_catalog.char_length(curriculum) between 2 and 3000
  ),
  constraint lessons_supplies_check check (
    supplies = pg_catalog.btrim(supplies)
    and pg_catalog.char_length(supplies) between 1 and 1000
  ),
  constraint lessons_notices_check check (
    private.valid_lesson_text_array(notices, 0, 12, 300)
  ),
  constraint lessons_inquiry_note_check check (
    inquiry_note is null
    or (
      inquiry_note = pg_catalog.btrim(inquiry_note)
      and pg_catalog.char_length(inquiry_note) between 2 and 1000
    )
  ),
  constraint lessons_inquiry_url_check check (private.valid_lesson_external_url(inquiry_url)),
  constraint lessons_official_url_check check (private.valid_lesson_external_url(official_url)),
  constraint lessons_publication_status_check check (
    publication_status in ('published', 'hidden', 'removed')
  ),
  constraint lessons_version_check check (version >= 1)
);

comment on table public.lessons is
  'Operator-authored public park-golf lesson directory; PUL does not accept lesson payments or bookings.';

create index lessons_public_filter_idx
  on public.lessons (lesson_type, province, lesson_format, recruit_status, created_at desc, lesson_key)
  where publication_status = 'published';

create index lessons_public_featured_idx
  on public.lessons (created_at desc, lesson_key)
  where publication_status = 'published' and is_featured;

create index lessons_targets_gin_idx
  on public.lessons using gin (targets)
  where publication_status = 'published';

create trigger lessons_set_updated_at
before update on public.lessons
for each row execute function public.set_user_foundation_updated_at();

alter table public.lessons enable row level security;
alter table public.lessons force row level security;

create policy lessons_public_published_select
on public.lessons
for select
to anon, authenticated
using (publication_status = 'published');

revoke all on table public.lessons
  from public, anon, authenticated, service_role;

create table public.lesson_videos (
  id uuid primary key default gen_random_uuid(),
  video_key text not null,
  title text not null,
  category text not null,
  channel_name text not null,
  instructor_name text not null,
  level text not null,
  duration_text text not null,
  description text not null,
  youtube_url text not null,
  youtube_channel_url text,
  thumbnail_type text not null default 'green',
  tags text[] not null default '{}'::text[],
  is_featured boolean not null default false,
  publication_status text not null default 'hidden',
  version integer not null default 1,
  created_by uuid not null references public.user_accounts (id),
  updated_by uuid not null references public.user_accounts (id),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint lesson_videos_video_key_uidx unique (video_key),
  constraint lesson_videos_video_key_check check (
    video_key = pg_catalog.btrim(video_key)
    and video_key ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'
  ),
  constraint lesson_videos_title_check check (
    title = pg_catalog.btrim(title)
    and pg_catalog.char_length(title) between 2 and 160
  ),
  constraint lesson_videos_category_check check (
    category in (
      'beginner_intro', 'basic_stance', 'swing', 'tee_shot', 'putting', 'approach',
      'distance_control', 'direction', 'rules_manner', 'practical_strategy', 'equipment',
      'club_reservation', 'tournament_prep', 'cert_referee', 'other'
    )
  ),
  constraint lesson_videos_channel_name_check check (
    channel_name = pg_catalog.btrim(channel_name)
    and pg_catalog.char_length(channel_name) between 1 and 120
  ),
  constraint lesson_videos_instructor_name_check check (
    instructor_name = pg_catalog.btrim(instructor_name)
    and pg_catalog.char_length(instructor_name) between 1 and 100
  ),
  constraint lesson_videos_level_check check (
    level in ('intro', 'beginner', 'intermediate', 'advanced')
  ),
  constraint lesson_videos_duration_text_check check (
    duration_text = pg_catalog.btrim(duration_text)
    and pg_catalog.char_length(duration_text) between 1 and 20
  ),
  constraint lesson_videos_description_check check (
    description = pg_catalog.btrim(description)
    and pg_catalog.char_length(description) between 10 and 2000
  ),
  constraint lesson_videos_youtube_url_check check (
    private.valid_lesson_youtube_url(youtube_url)
  ),
  constraint lesson_videos_youtube_channel_url_check check (
    youtube_channel_url is null
    or private.valid_lesson_youtube_url(youtube_channel_url)
  ),
  constraint lesson_videos_thumbnail_type_check check (
    thumbnail_type in ('green', 'teal', 'emerald', 'forest')
  ),
  constraint lesson_videos_tags_check check (
    private.valid_lesson_text_array(tags, 0, 12, 60)
  ),
  constraint lesson_videos_publication_status_check check (
    publication_status in ('published', 'hidden', 'removed')
  ),
  constraint lesson_videos_version_check check (version >= 1)
);

comment on table public.lesson_videos is
  'Operator-authored directory of external public YouTube park-golf lessons; no video files are hosted by PUL.';

create index lesson_videos_public_category_idx
  on public.lesson_videos (category, is_featured desc, created_at desc, video_key)
  where publication_status = 'published';

create trigger lesson_videos_set_updated_at
before update on public.lesson_videos
for each row execute function public.set_user_foundation_updated_at();

alter table public.lesson_videos enable row level security;
alter table public.lesson_videos force row level security;

create policy lesson_videos_public_published_select
on public.lesson_videos
for select
to anon, authenticated
using (publication_status = 'published');

revoke all on table public.lesson_videos
  from public, anon, authenticated, service_role;

insert into public.platform_permission_definitions (code, description, is_active)
values ('lessons.manage', '공식 레슨·교육과 외부 YouTube 강의 정보를 등록·수정·공개·숨김·제거합니다.', true);

insert into public.platform_role_permissions (platform_role, permission_code)
values ('platform_admin', 'lessons.manage');

create function private.public_lesson_json(p_lesson public.lessons)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'lesson_key', p_lesson.lesson_key,
    'title', p_lesson.title,
    'lesson_type', p_lesson.lesson_type,
    'province', p_lesson.province,
    'district', p_lesson.district,
    'location', p_lesson.location,
    'instructor_name', p_lesson.instructor_name,
    'organizer_name', p_lesson.organizer_name,
    'targets', p_lesson.targets,
    'schedule_text', p_lesson.schedule_text,
    'schedule_tags', p_lesson.schedule_tags,
    'time_text', p_lesson.time_text,
    'price_text', p_lesson.price_text,
    'lesson_format', p_lesson.lesson_format,
    'recruit_status', p_lesson.recruit_status,
    'description', p_lesson.description,
    'curriculum', p_lesson.curriculum,
    'supplies', p_lesson.supplies,
    'notices', p_lesson.notices,
    'inquiry_note', p_lesson.inquiry_note,
    'inquiry_url', p_lesson.inquiry_url,
    'official_url', p_lesson.official_url,
    'is_featured', p_lesson.is_featured
  );
$$;

revoke all on function private.public_lesson_json(public.lessons)
  from public, anon, authenticated, service_role;

create function private.public_lesson_video_json(p_video public.lesson_videos)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'video_key', p_video.video_key,
    'title', p_video.title,
    'category', p_video.category,
    'channel_name', p_video.channel_name,
    'instructor_name', p_video.instructor_name,
    'level', p_video.level,
    'duration_text', p_video.duration_text,
    'description', p_video.description,
    'youtube_url', p_video.youtube_url,
    'youtube_channel_url', p_video.youtube_channel_url,
    'thumbnail_type', p_video.thumbnail_type,
    'tags', p_video.tags,
    'is_featured', p_video.is_featured
  );
$$;

revoke all on function private.public_lesson_video_json(public.lesson_videos)
  from public, anon, authenticated, service_role;

create function public.list_public_lessons(
  p_keyword text default null,
  p_province text default null,
  p_lesson_type text default null,
  p_lesson_format text default null,
  p_target text default null,
  p_schedule_tag text default null,
  p_limit integer default 24,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_keyword text := nullif(pg_catalog.btrim(p_keyword), '');
  v_total integer;
  v_items jsonb;
begin
  if v_keyword is not null and pg_catalog.char_length(v_keyword) > 100 then
    raise exception '검색어는 100자 이하로 입력해 주세요.';
  end if;
  if p_province is not null and p_province not in ('서울', '경기', '인천', '충청', '강원', '전라', '경상', '제주') then
    raise exception '지역을 확인해 주세요.';
  end if;
  if p_lesson_type is not null and p_lesson_type not in ('beginner', 'improvement', 'group', 'online') then
    raise exception '교육 유형을 확인해 주세요.';
  end if;
  if p_lesson_format is not null and p_lesson_format not in ('offline', 'online', 'field', 'group') then
    raise exception '교육 방식을 확인해 주세요.';
  end if;
  if p_target is not null and p_target not in ('absolute_beginner', 'golf_experienced', 'senior', 'club_member') then
    raise exception '교육 대상을 확인해 주세요.';
  end if;
  if p_schedule_tag is not null and p_schedule_tag not in ('this_week', 'this_month', 'always', 'closing_soon') then
    raise exception '일정 조건을 확인해 주세요.';
  end if;
  if p_limit not between 1 and 50 or p_offset < 0 then
    raise exception '페이지 범위를 확인해 주세요.';
  end if;

  select pg_catalog.count(*)::integer
  into v_total
  from public.lessons as lesson
  where lesson.publication_status = 'published'
    and not lesson.is_featured
    and lesson.lesson_type in ('beginner', 'improvement', 'group', 'online')
    and (p_province is null or lesson.province = p_province)
    and (p_lesson_type is null or lesson.lesson_type = p_lesson_type)
    and (p_lesson_format is null or lesson.lesson_format = p_lesson_format)
    and (p_target is null or p_target = any (lesson.targets))
    and (p_schedule_tag is null or p_schedule_tag = any (lesson.schedule_tags))
    and (
      v_keyword is null
      or pg_catalog.strpos(
        pg_catalog.lower(pg_catalog.concat_ws(' ', lesson.title, lesson.province, lesson.district, lesson.location, lesson.instructor_name, lesson.organizer_name)),
        pg_catalog.lower(v_keyword)
      ) > 0
    );

  with page as (
    select lesson.id
    from public.lessons as lesson
    where lesson.publication_status = 'published'
      and not lesson.is_featured
      and lesson.lesson_type in ('beginner', 'improvement', 'group', 'online')
      and (p_province is null or lesson.province = p_province)
      and (p_lesson_type is null or lesson.lesson_type = p_lesson_type)
      and (p_lesson_format is null or lesson.lesson_format = p_lesson_format)
      and (p_target is null or p_target = any (lesson.targets))
      and (p_schedule_tag is null or p_schedule_tag = any (lesson.schedule_tags))
      and (
        v_keyword is null
        or pg_catalog.strpos(
          pg_catalog.lower(pg_catalog.concat_ws(' ', lesson.title, lesson.province, lesson.district, lesson.location, lesson.instructor_name, lesson.organizer_name)),
          pg_catalog.lower(v_keyword)
        ) > 0
      )
    order by lesson.is_featured desc, lesson.created_at desc, lesson.lesson_key
    limit p_limit
    offset p_offset
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      private.public_lesson_json(lesson)
      order by lesson.is_featured desc, lesson.created_at desc, lesson.lesson_key
    ),
    '[]'::jsonb
  )
  into v_items
  from page
  join public.lessons as lesson on lesson.id = page.id;

  return pg_catalog.jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', p_offset + pg_catalog.jsonb_array_length(v_items) < v_total
  );
end;
$$;

comment on function public.list_public_lessons(text, text, text, text, text, text, integer, integer) is
  'Published general lesson directory with server-side keyword, region, type, format, target, schedule, and pagination.';

revoke all on function public.list_public_lessons(text, text, text, text, text, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_public_lessons(text, text, text, text, text, text, integer, integer)
  to anon, authenticated;

create function public.list_featured_public_lessons(p_limit integer default 4)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_limit not between 1 and 12 then
    raise exception '추천 레슨 조회 범위를 확인해 주세요.';
  end if;
  select coalesce(
    pg_catalog.jsonb_agg(private.public_lesson_json(featured) order by featured.created_at desc, featured.lesson_key),
    '[]'::jsonb
  )
  into v_result
  from (
    select lesson.*
    from public.lessons as lesson
    where lesson.publication_status = 'published'
      and lesson.is_featured
      and lesson.lesson_type in ('beginner', 'improvement', 'group', 'online')
    order by lesson.created_at desc, lesson.lesson_key
    limit p_limit
  ) as featured;
  return v_result;
end;
$$;

revoke all on function public.list_featured_public_lessons(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_featured_public_lessons(integer)
  to anon, authenticated;

create function public.get_public_lesson(p_lesson_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lesson public.lessons%rowtype;
  v_key text := nullif(pg_catalog.btrim(p_lesson_key), '');
begin
  if v_key is null or v_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' then
    raise exception '레슨·교육 정보를 찾을 수 없습니다.';
  end if;
  select lesson.*
  into v_lesson
  from public.lessons as lesson
  where lesson.lesson_key = v_key
    and lesson.publication_status = 'published'
    and lesson.lesson_type in ('beginner', 'improvement', 'group', 'online');
  if not found then
    raise exception '레슨·교육 정보를 찾을 수 없습니다.';
  end if;
  return private.public_lesson_json(v_lesson);
end;
$$;

revoke all on function public.get_public_lesson(text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_lesson(text)
  to anon, authenticated;

create function public.list_public_lesson_videos(
  p_category text default null,
  p_limit integer default 24,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_total integer;
  v_items jsonb;
begin
  if p_category is not null and p_category not in (
    'beginner_intro', 'basic_stance', 'swing', 'tee_shot', 'putting', 'approach',
    'distance_control', 'direction', 'rules_manner', 'practical_strategy', 'equipment',
    'club_reservation', 'tournament_prep', 'cert_referee', 'other'
  ) then
    raise exception '영상 카테고리를 확인해 주세요.';
  end if;
  if p_limit not between 1 and 50 or p_offset < 0 then
    raise exception '페이지 범위를 확인해 주세요.';
  end if;

  select pg_catalog.count(*)::integer
  into v_total
  from public.lesson_videos as video
  where video.publication_status = 'published'
    and (p_category is null or video.category = p_category);

  with page as (
    select video.id
    from public.lesson_videos as video
    where video.publication_status = 'published'
      and (p_category is null or video.category = p_category)
    order by video.is_featured desc, video.created_at desc, video.video_key
    limit p_limit
    offset p_offset
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      private.public_lesson_video_json(video)
      order by video.is_featured desc, video.created_at desc, video.video_key
    ),
    '[]'::jsonb
  )
  into v_items
  from page
  join public.lesson_videos as video on video.id = page.id;

  return pg_catalog.jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', p_offset + pg_catalog.jsonb_array_length(v_items) < v_total
  );
end;
$$;

revoke all on function public.list_public_lesson_videos(text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_public_lesson_videos(text, integer, integer)
  to anon, authenticated;

create function private.require_lesson_directory_manager()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception '로그인이 필요합니다.';
  end if;
  perform 1
  from public.user_accounts as account
  join public.platform_role_permissions as mapping
    on mapping.platform_role = account.platform_role
  join public.platform_permission_definitions as permission
    on permission.code = mapping.permission_code
   and permission.is_active
  where account.id = v_actor_id
    and account.account_status = 'active'
    and mapping.permission_code = 'lessons.manage'
  for share of account;
  if not found then
    raise exception '레슨·교육 운영 권한이 없습니다.';
  end if;
  return v_actor_id;
end;
$$;

revoke all on function private.require_lesson_directory_manager()
  from public, anon, authenticated, service_role;

create function public.mutate_lesson(
  p_operation text,
  p_lesson_key text,
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
  v_lesson public.lessons%rowtype;
  v_key text := nullif(pg_catalog.btrim(p_lesson_key), '');
  v_targets text[];
  v_schedule_tags text[];
  v_notices text[];
begin
  v_actor_id := private.require_lesson_directory_manager();
  if p_operation not in ('create', 'update', 'publish', 'hide', 'remove') then
    raise exception '레슨·교육 작업을 확인해 주세요.';
  end if;
  if v_key is null or v_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' then
    raise exception '공개 lesson key를 확인해 주세요.';
  end if;
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception '레슨·교육 입력값을 확인해 주세요.';
  end if;

  if p_operation = 'create' then
    if p_expected_version is not null then
      raise exception '신규 등록에는 기존 version을 사용할 수 없습니다.';
    end if;
    if exists (select 1 from public.lessons as lesson where lesson.lesson_key = v_key) then
      raise exception '이미 사용 중인 lesson key입니다.';
    end if;
  else
    if p_expected_version is null or p_expected_version < 1 then
      raise exception '현재 version을 확인해 주세요.';
    end if;
    select lesson.*
    into v_lesson
    from public.lessons as lesson
    where lesson.lesson_key = v_key
    for update;
    if not found then
      raise exception '레슨·교육 정보를 찾을 수 없습니다.';
    end if;
    if v_lesson.version <> p_expected_version then
      raise exception '레슨·교육 정보가 변경되었습니다. 최신 정보를 다시 확인해 주세요.';
    end if;
    if v_lesson.publication_status = 'removed' and p_operation <> 'remove' then
      raise exception '제거된 레슨·교육은 다시 변경하거나 공개할 수 없습니다.';
    end if;
  end if;

  if p_operation in ('create', 'update') then
    if exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_payload) as supplied(key)
      where supplied.key not in (
        'title', 'lesson_type', 'province', 'district', 'location', 'instructor_name',
        'organizer_name', 'targets', 'schedule_text', 'schedule_tags', 'time_text',
        'price_text', 'lesson_format', 'recruit_status', 'description', 'curriculum',
        'supplies', 'notices', 'inquiry_note', 'inquiry_url', 'official_url', 'is_featured'
      )
    ) then
      raise exception '지원하지 않는 레슨·교육 입력값이 포함되어 있습니다.';
    end if;
    if pg_catalog.jsonb_typeof(p_payload -> 'targets') is distinct from 'array'
       or pg_catalog.jsonb_typeof(p_payload -> 'schedule_tags') is distinct from 'array'
       or pg_catalog.jsonb_typeof(p_payload -> 'notices') is distinct from 'array'
       or pg_catalog.jsonb_typeof(p_payload -> 'is_featured') is distinct from 'boolean' then
      raise exception '대상·일정·유의사항·추천 여부를 확인해 주세요.';
    end if;
    select coalesce(pg_catalog.array_agg(pg_catalog.btrim(item.value)), '{}'::text[])
    into v_targets
    from pg_catalog.jsonb_array_elements_text(p_payload -> 'targets') as item(value);
    select coalesce(pg_catalog.array_agg(pg_catalog.btrim(item.value)), '{}'::text[])
    into v_schedule_tags
    from pg_catalog.jsonb_array_elements_text(p_payload -> 'schedule_tags') as item(value);
    select coalesce(pg_catalog.array_agg(pg_catalog.btrim(item.value)), '{}'::text[])
    into v_notices
    from pg_catalog.jsonb_array_elements_text(p_payload -> 'notices') as item(value);

    if p_operation = 'create' then
      insert into public.lessons (
        lesson_key, title, lesson_type, province, district, location, instructor_name,
        organizer_name, targets, schedule_text, schedule_tags, time_text, price_text,
        lesson_format, recruit_status, description, curriculum, supplies, notices,
        inquiry_note, inquiry_url, official_url, is_featured, publication_status,
        created_by, updated_by
      ) values (
        v_key, pg_catalog.btrim(p_payload ->> 'title'), p_payload ->> 'lesson_type',
        p_payload ->> 'province', pg_catalog.btrim(p_payload ->> 'district'),
        pg_catalog.btrim(p_payload ->> 'location'), pg_catalog.btrim(p_payload ->> 'instructor_name'),
        pg_catalog.btrim(p_payload ->> 'organizer_name'), v_targets,
        pg_catalog.btrim(p_payload ->> 'schedule_text'), v_schedule_tags,
        pg_catalog.btrim(p_payload ->> 'time_text'), pg_catalog.btrim(p_payload ->> 'price_text'),
        p_payload ->> 'lesson_format', p_payload ->> 'recruit_status',
        pg_catalog.btrim(p_payload ->> 'description'), pg_catalog.btrim(p_payload ->> 'curriculum'),
        pg_catalog.btrim(p_payload ->> 'supplies'), v_notices,
        nullif(pg_catalog.btrim(p_payload ->> 'inquiry_note'), ''),
        nullif(pg_catalog.btrim(p_payload ->> 'inquiry_url'), ''),
        nullif(pg_catalog.btrim(p_payload ->> 'official_url'), ''),
        (p_payload ->> 'is_featured')::boolean, 'hidden', v_actor_id, v_actor_id
      )
      returning * into v_lesson;
    else
      update public.lessons as lesson
      set title = pg_catalog.btrim(p_payload ->> 'title'),
          lesson_type = p_payload ->> 'lesson_type',
          province = p_payload ->> 'province',
          district = pg_catalog.btrim(p_payload ->> 'district'),
          location = pg_catalog.btrim(p_payload ->> 'location'),
          instructor_name = pg_catalog.btrim(p_payload ->> 'instructor_name'),
          organizer_name = pg_catalog.btrim(p_payload ->> 'organizer_name'),
          targets = v_targets,
          schedule_text = pg_catalog.btrim(p_payload ->> 'schedule_text'),
          schedule_tags = v_schedule_tags,
          time_text = pg_catalog.btrim(p_payload ->> 'time_text'),
          price_text = pg_catalog.btrim(p_payload ->> 'price_text'),
          lesson_format = p_payload ->> 'lesson_format',
          recruit_status = p_payload ->> 'recruit_status',
          description = pg_catalog.btrim(p_payload ->> 'description'),
          curriculum = pg_catalog.btrim(p_payload ->> 'curriculum'),
          supplies = pg_catalog.btrim(p_payload ->> 'supplies'),
          notices = v_notices,
          inquiry_note = nullif(pg_catalog.btrim(p_payload ->> 'inquiry_note'), ''),
          inquiry_url = nullif(pg_catalog.btrim(p_payload ->> 'inquiry_url'), ''),
          official_url = nullif(pg_catalog.btrim(p_payload ->> 'official_url'), ''),
          is_featured = (p_payload ->> 'is_featured')::boolean,
          updated_by = v_actor_id,
          version = lesson.version + 1
      where lesson.id = v_lesson.id
      returning * into v_lesson;
    end if;
  elsif p_payload <> '{}'::jsonb then
    raise exception '이 작업에는 추가 입력값을 사용할 수 없습니다.';
  elsif p_operation = 'publish' then
    update public.lessons as lesson
    set publication_status = 'published', updated_by = v_actor_id, version = lesson.version + 1
    where lesson.id = v_lesson.id
    returning * into v_lesson;
  elsif p_operation = 'hide' then
    update public.lessons as lesson
    set publication_status = 'hidden', updated_by = v_actor_id, version = lesson.version + 1
    where lesson.id = v_lesson.id
    returning * into v_lesson;
  elsif p_operation = 'remove' then
    update public.lessons as lesson
    set publication_status = 'removed', is_featured = false, updated_by = v_actor_id, version = lesson.version + 1
    where lesson.id = v_lesson.id
    returning * into v_lesson;
  end if;

  return pg_catalog.jsonb_build_object(
    'lesson_key', v_lesson.lesson_key,
    'publication_status', v_lesson.publication_status,
    'version', v_lesson.version
  );
end;
$$;

comment on function public.mutate_lesson(text, text, integer, jsonb) is
  'Active lessons.manage platform operator-only lesson create, full update, publish, hide, and remove mutation.';

revoke all on function public.mutate_lesson(text, text, integer, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.mutate_lesson(text, text, integer, jsonb)
  to authenticated;

create function public.mutate_lesson_video(
  p_operation text,
  p_video_key text,
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
  v_video public.lesson_videos%rowtype;
  v_key text := nullif(pg_catalog.btrim(p_video_key), '');
  v_tags text[];
begin
  v_actor_id := private.require_lesson_directory_manager();
  if p_operation not in ('create', 'update', 'publish', 'hide', 'remove') then
    raise exception '무료 강의 영상 작업을 확인해 주세요.';
  end if;
  if v_key is null or v_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' then
    raise exception '공개 video key를 확인해 주세요.';
  end if;
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception '무료 강의 영상 입력값을 확인해 주세요.';
  end if;

  if p_operation = 'create' then
    if p_expected_version is not null then
      raise exception '신규 등록에는 기존 version을 사용할 수 없습니다.';
    end if;
    if exists (select 1 from public.lesson_videos as video where video.video_key = v_key) then
      raise exception '이미 사용 중인 video key입니다.';
    end if;
  else
    if p_expected_version is null or p_expected_version < 1 then
      raise exception '현재 version을 확인해 주세요.';
    end if;
    select video.*
    into v_video
    from public.lesson_videos as video
    where video.video_key = v_key
    for update;
    if not found then
      raise exception '무료 강의 영상을 찾을 수 없습니다.';
    end if;
    if v_video.version <> p_expected_version then
      raise exception '무료 강의 영상 정보가 변경되었습니다. 최신 정보를 다시 확인해 주세요.';
    end if;
    if v_video.publication_status = 'removed' and p_operation <> 'remove' then
      raise exception '제거된 무료 강의 영상은 다시 변경하거나 공개할 수 없습니다.';
    end if;
  end if;

  if p_operation in ('create', 'update') then
    if exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_payload) as supplied(key)
      where supplied.key not in (
        'title', 'category', 'channel_name', 'instructor_name', 'level', 'duration_text',
        'description', 'youtube_url', 'youtube_channel_url', 'thumbnail_type', 'tags', 'is_featured'
      )
    ) then
      raise exception '지원하지 않는 무료 강의 영상 입력값이 포함되어 있습니다.';
    end if;
    if pg_catalog.jsonb_typeof(p_payload -> 'tags') is distinct from 'array'
       or pg_catalog.jsonb_typeof(p_payload -> 'is_featured') is distinct from 'boolean' then
      raise exception '영상 태그·추천 여부를 확인해 주세요.';
    end if;
    select coalesce(pg_catalog.array_agg(pg_catalog.btrim(item.value)), '{}'::text[])
    into v_tags
    from pg_catalog.jsonb_array_elements_text(p_payload -> 'tags') as item(value);

    if p_operation = 'create' then
      insert into public.lesson_videos (
        video_key, title, category, channel_name, instructor_name, level, duration_text,
        description, youtube_url, youtube_channel_url, thumbnail_type, tags, is_featured,
        publication_status, created_by, updated_by
      ) values (
        v_key, pg_catalog.btrim(p_payload ->> 'title'), p_payload ->> 'category',
        pg_catalog.btrim(p_payload ->> 'channel_name'), pg_catalog.btrim(p_payload ->> 'instructor_name'),
        p_payload ->> 'level', pg_catalog.btrim(p_payload ->> 'duration_text'),
        pg_catalog.btrim(p_payload ->> 'description'), pg_catalog.btrim(p_payload ->> 'youtube_url'),
        nullif(pg_catalog.btrim(p_payload ->> 'youtube_channel_url'), ''),
        p_payload ->> 'thumbnail_type', v_tags, (p_payload ->> 'is_featured')::boolean,
        'hidden', v_actor_id, v_actor_id
      )
      returning * into v_video;
    else
      update public.lesson_videos as video
      set title = pg_catalog.btrim(p_payload ->> 'title'),
          category = p_payload ->> 'category',
          channel_name = pg_catalog.btrim(p_payload ->> 'channel_name'),
          instructor_name = pg_catalog.btrim(p_payload ->> 'instructor_name'),
          level = p_payload ->> 'level',
          duration_text = pg_catalog.btrim(p_payload ->> 'duration_text'),
          description = pg_catalog.btrim(p_payload ->> 'description'),
          youtube_url = pg_catalog.btrim(p_payload ->> 'youtube_url'),
          youtube_channel_url = nullif(pg_catalog.btrim(p_payload ->> 'youtube_channel_url'), ''),
          thumbnail_type = p_payload ->> 'thumbnail_type',
          tags = v_tags,
          is_featured = (p_payload ->> 'is_featured')::boolean,
          updated_by = v_actor_id,
          version = video.version + 1
      where video.id = v_video.id
      returning * into v_video;
    end if;
  elsif p_payload <> '{}'::jsonb then
    raise exception '이 작업에는 추가 입력값을 사용할 수 없습니다.';
  elsif p_operation = 'publish' then
    update public.lesson_videos as video
    set publication_status = 'published', updated_by = v_actor_id, version = video.version + 1
    where video.id = v_video.id
    returning * into v_video;
  elsif p_operation = 'hide' then
    update public.lesson_videos as video
    set publication_status = 'hidden', updated_by = v_actor_id, version = video.version + 1
    where video.id = v_video.id
    returning * into v_video;
  elsif p_operation = 'remove' then
    update public.lesson_videos as video
    set publication_status = 'removed', is_featured = false, updated_by = v_actor_id, version = video.version + 1
    where video.id = v_video.id
    returning * into v_video;
  end if;

  return pg_catalog.jsonb_build_object(
    'video_key', v_video.video_key,
    'publication_status', v_video.publication_status,
    'version', v_video.version
  );
end;
$$;

comment on function public.mutate_lesson_video(text, text, integer, jsonb) is
  'Active lessons.manage platform operator-only external YouTube lesson create, full update, publish, hide, and remove mutation.';

revoke all on function public.mutate_lesson_video(text, text, integer, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.mutate_lesson_video(text, text, integer, jsonb)
  to authenticated;
