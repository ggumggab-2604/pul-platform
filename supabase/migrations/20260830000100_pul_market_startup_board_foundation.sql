-- PUL 8-18: simple real-data startup and resale community board.

create table public.market_startup_posts (
  id uuid primary key default gen_random_uuid(),
  post_key text not null unique default pg_catalog.substr(
    pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''),
    1,
    24
  ),
  author_user_id uuid not null references public.user_accounts (id),
  title text not null,
  body text not null,
  category_code text not null,
  region_code text not null,
  desired_scale text not null,
  consultation_type text not null,
  board_status text not null default 'open',
  publication_status text not null default 'published',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  removed_at timestamptz,
  constraint market_startup_posts_key_check
    check (post_key ~ '^[0-9a-f]{24}$'),
  constraint market_startup_posts_title_check
    check (title = pg_catalog.btrim(title) and pg_catalog.char_length(title) between 2 and 120),
  constraint market_startup_posts_body_check
    check (body = pg_catalog.btrim(body) and pg_catalog.char_length(body) between 10 and 5000),
  constraint market_startup_posts_category_check
    check (category_code in (
      'screenStartup', 'screenResale', 'fieldCourseDevelopment',
      'idleLandUse', 'constructionFacility'
    )),
  constraint market_startup_posts_region_check
    check (region_code in ('서울', '경기', '인천', '충청', '강원', '전라', '경상', '제주')),
  constraint market_startup_posts_scale_check
    check (desired_scale = pg_catalog.btrim(desired_scale) and pg_catalog.char_length(desired_scale) between 2 and 100),
  constraint market_startup_posts_consultation_check
    check (
      (category_code = 'screenStartup' and consultation_type = 'startupInquiry')
      or (category_code = 'screenResale' and consultation_type in ('resaleInquiry', 'transfer'))
      or (category_code = 'fieldCourseDevelopment' and consultation_type = 'courseDevelopment')
      or (category_code = 'idleLandUse' and consultation_type = 'idleLandUse')
      or (category_code = 'constructionFacility' and consultation_type = 'facilityConsulting')
    ),
  constraint market_startup_posts_board_status_check
    check (board_status in ('open', 'closed')),
  constraint market_startup_posts_publication_status_check
    check (publication_status in ('published', 'hidden', 'removed')),
  constraint market_startup_posts_closed_check
    check ((board_status = 'closed') = (closed_at is not null)),
  constraint market_startup_posts_removed_check
    check ((publication_status = 'removed') = (removed_at is not null)),
  constraint market_startup_posts_version_check check (version >= 1)
);

create index market_startup_posts_public_page_idx
  on public.market_startup_posts (created_at desc, id desc)
  where publication_status = 'published';

create index market_startup_posts_public_filters_idx
  on public.market_startup_posts (category_code, region_code, created_at desc, id desc)
  where publication_status = 'published';

create index market_startup_posts_author_idx
  on public.market_startup_posts (author_user_id, created_at desc);

create trigger market_startup_posts_set_updated_at
before update on public.market_startup_posts
for each row execute function public.set_user_foundation_updated_at();

alter table public.market_startup_posts enable row level security;
alter table public.market_startup_posts force row level security;

revoke all on table public.market_startup_posts
  from public, anon, authenticated, service_role;

create function private.market_startup_validate_payload(p_payload jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_title text := nullif(pg_catalog.btrim(p_payload ->> 'title'), '');
  v_body text := nullif(pg_catalog.btrim(p_payload ->> 'body'), '');
  v_category text := nullif(pg_catalog.btrim(p_payload ->> 'category'), '');
  v_region text := nullif(pg_catalog.btrim(p_payload ->> 'region'), '');
  v_scale text := nullif(pg_catalog.btrim(p_payload ->> 'desired_scale'), '');
  v_consultation text := nullif(pg_catalog.btrim(p_payload ->> 'consultation_type'), '');
begin
  if v_title is null or pg_catalog.char_length(v_title) not between 2 and 120 then
    raise exception '제목은 2~120자로 입력해 주세요.';
  end if;
  if v_body is null or pg_catalog.char_length(v_body) not between 10 and 5000 then
    raise exception '본문은 10~5000자로 입력해 주세요.';
  end if;
  if v_category is null or v_category not in (
    'screenStartup', 'screenResale', 'fieldCourseDevelopment',
    'idleLandUse', 'constructionFacility'
  ) then
    raise exception '창업·매매 카테고리를 확인해 주세요.';
  end if;
  if v_region is null or v_region not in ('서울', '경기', '인천', '충청', '강원', '전라', '경상', '제주') then
    raise exception '지역을 확인해 주세요.';
  end if;
  if v_scale is null or pg_catalog.char_length(v_scale) not between 2 and 100 then
    raise exception '희망 규모는 2~100자로 입력해 주세요.';
  end if;
  if v_consultation is null or not (
    (v_category = 'screenStartup' and v_consultation = 'startupInquiry')
    or (v_category = 'screenResale' and v_consultation in ('resaleInquiry', 'transfer'))
    or (v_category = 'fieldCourseDevelopment' and v_consultation = 'courseDevelopment')
    or (v_category = 'idleLandUse' and v_consultation = 'idleLandUse')
    or (v_category = 'constructionFacility' and v_consultation = 'facilityConsulting')
  ) then
    raise exception '카테고리와 상담 유형을 확인해 주세요.';
  end if;
end;
$$;

revoke all on function private.market_startup_validate_payload(jsonb)
  from public, anon, authenticated, service_role;

create function public.list_market_startup_posts(
  p_keyword text default null,
  p_category_code text default null,
  p_region_code text default null,
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
  v_viewer_id uuid := auth.uid();
  v_keyword text := nullif(pg_catalog.btrim(p_keyword), '');
  v_limit integer := least(greatest(coalesce(p_limit, 24), 1), 30);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total integer;
  v_items jsonb;
begin
  if p_category_code is not null and p_category_code not in (
    'screenStartup', 'screenResale', 'fieldCourseDevelopment',
    'idleLandUse', 'constructionFacility'
  ) then
    raise exception '창업·매매 카테고리를 확인해 주세요.';
  end if;
  if p_region_code is not null and p_region_code not in (
    '서울', '경기', '인천', '충청', '강원', '전라', '경상', '제주'
  ) then
    raise exception '지역을 확인해 주세요.';
  end if;
  select pg_catalog.count(*)::integer
  into v_total
  from public.market_startup_posts as post
  where post.publication_status = 'published'
    and (p_category_code is null or post.category_code = p_category_code)
    and (p_region_code is null or post.region_code = p_region_code)
    and (
      v_keyword is null
      or post.title ilike '%' || v_keyword || '%'
      or post.body ilike '%' || v_keyword || '%'
      or post.desired_scale ilike '%' || v_keyword || '%'
    );

  select coalesce(
    pg_catalog.jsonb_agg(page.item order by page.created_at desc, page.id desc),
    '[]'::jsonb
  )
  into v_items
  from (
    select post.id, post.created_at,
      pg_catalog.jsonb_build_object(
        'post_key', post.post_key,
        'title', post.title,
        'summary', pg_catalog.left(post.body, 220),
        'category', post.category_code,
        'region', post.region_code,
        'desired_scale', post.desired_scale,
        'consultation_type', post.consultation_type,
        'author_display_name', private.market_actor_display_name(post.author_user_id, v_viewer_id),
        'board_status', post.board_status,
        'created_at', post.created_at,
        'updated_at', post.updated_at,
        'can_edit', coalesce(post.author_user_id = v_viewer_id, false)
      ) as item
    from public.market_startup_posts as post
    where post.publication_status = 'published'
      and (p_category_code is null or post.category_code = p_category_code)
      and (p_region_code is null or post.region_code = p_region_code)
      and (
        v_keyword is null
        or post.title ilike '%' || v_keyword || '%'
        or post.body ilike '%' || v_keyword || '%'
        or post.desired_scale ilike '%' || v_keyword || '%'
      )
    order by post.created_at desc, post.id desc
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
$$;

comment on function public.list_market_startup_posts(text, text, text, integer, integer) is
  'Public paginated startup-board list without internal UUIDs, versions, or private contact data.';
revoke all on function public.list_market_startup_posts(text, text, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_market_startup_posts(text, text, text, integer, integer)
  to anon, authenticated;

create function public.get_market_startup_post(p_post_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_post public.market_startup_posts%rowtype;
begin
  if p_post_key is null or p_post_key !~ '^[0-9a-f]{24}$' then
    raise exception '창업·매매 게시글 식별자를 확인해 주세요.';
  end if;

  select post.*
  into v_post
  from public.market_startup_posts as post
  where post.post_key = p_post_key
    and post.publication_status = 'published';

  if not found then
    raise exception '창업·매매 게시글을 찾을 수 없습니다.';
  end if;

  return pg_catalog.jsonb_build_object(
    'post_key', v_post.post_key,
    'title', v_post.title,
    'body', v_post.body,
    'category', v_post.category_code,
    'region', v_post.region_code,
    'desired_scale', v_post.desired_scale,
    'consultation_type', v_post.consultation_type,
    'author_display_name', private.market_actor_display_name(v_post.author_user_id, v_viewer_id),
    'board_status', v_post.board_status,
    'created_at', v_post.created_at,
    'updated_at', v_post.updated_at,
    'can_edit', coalesce(v_post.author_user_id = v_viewer_id, false)
  );
end;
$$;

comment on function public.get_market_startup_post(text) is
  'Public startup-board detail without internal UUIDs, versions, or private contact data.';
revoke all on function public.get_market_startup_post(text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_market_startup_post(text)
  to anon, authenticated;

create function public.get_my_market_startup_post_mutation_context(p_post_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := private.market_assert_active_actor();
  v_post public.market_startup_posts%rowtype;
begin
  if p_post_key is null or p_post_key !~ '^[0-9a-f]{24}$' then
    raise exception '창업·매매 게시글 식별자를 확인해 주세요.';
  end if;

  select post.*
  into v_post
  from public.market_startup_posts as post
  where post.post_key = p_post_key
    and post.publication_status = 'published';

  if not found then
    raise exception '창업·매매 게시글을 찾을 수 없습니다.';
  end if;
  if v_post.author_user_id <> v_actor_id then
    raise exception '본인의 창업·매매 게시글만 변경할 수 있습니다.';
  end if;

  return pg_catalog.jsonb_build_object(
    'post_key', v_post.post_key,
    'title', v_post.title,
    'body', v_post.body,
    'category', v_post.category_code,
    'region', v_post.region_code,
    'desired_scale', v_post.desired_scale,
    'consultation_type', v_post.consultation_type,
    'board_status', v_post.board_status,
    'version', v_post.version
  );
end;
$$;

comment on function public.get_my_market_startup_post_mutation_context(text) is
  'Authenticated owner-only startup-board edit context, including the optimistic version.';
revoke all on function public.get_my_market_startup_post_mutation_context(text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_market_startup_post_mutation_context(text)
  to authenticated;

create function public.mutate_market_startup_post(
  p_operation text,
  p_post_key text default null,
  p_expected_version integer default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := private.market_assert_active_actor();
  v_post public.market_startup_posts%rowtype;
  v_title text;
  v_body text;
  v_category text;
  v_region text;
  v_scale text;
  v_consultation text;
begin
  if p_operation not in ('create', 'update', 'close', 'remove') then
    raise exception '지원하지 않는 창업·매매 게시글 작업입니다.';
  end if;

  if p_operation in ('create', 'update') then
    perform private.market_startup_validate_payload(p_payload);
    v_title := pg_catalog.btrim(p_payload ->> 'title');
    v_body := pg_catalog.btrim(p_payload ->> 'body');
    v_category := pg_catalog.btrim(p_payload ->> 'category');
    v_region := pg_catalog.btrim(p_payload ->> 'region');
    v_scale := pg_catalog.btrim(p_payload ->> 'desired_scale');
    v_consultation := pg_catalog.btrim(p_payload ->> 'consultation_type');
  end if;

  if p_operation = 'create' then
    if p_post_key is not null or p_expected_version is not null then
      raise exception '새 게시글에는 기존 식별자나 version을 사용할 수 없습니다.';
    end if;

    insert into public.market_startup_posts (
      author_user_id, title, body, category_code, region_code,
      desired_scale, consultation_type
    ) values (
      v_actor_id, v_title, v_body, v_category, v_region,
      v_scale, v_consultation
    )
    returning * into v_post;
  else
    if p_post_key is null or p_post_key !~ '^[0-9a-f]{24}$'
       or p_expected_version is null or p_expected_version < 1 then
      raise exception '게시글 식별자와 현재 version이 필요합니다.';
    end if;

    select post.*
    into v_post
    from public.market_startup_posts as post
    where post.post_key = p_post_key
    for update;

    if not found or v_post.publication_status <> 'published' then
      raise exception '창업·매매 게시글을 찾을 수 없습니다.';
    end if;
    if v_post.author_user_id <> v_actor_id then
      raise exception '본인의 창업·매매 게시글만 변경할 수 있습니다.';
    end if;
    if v_post.version <> p_expected_version then
      raise exception '게시글이 다른 곳에서 변경되었습니다. 새로고침 후 다시 시도해 주세요.';
    end if;

    if p_operation = 'update' then
      if v_post.board_status <> 'open' then
        raise exception '종료된 게시글은 수정할 수 없습니다.';
      end if;
      update public.market_startup_posts as post
      set title = v_title,
          body = v_body,
          category_code = v_category,
          region_code = v_region,
          desired_scale = v_scale,
          consultation_type = v_consultation,
          version = post.version + 1
      where post.id = v_post.id
      returning * into v_post;
    elsif p_operation = 'close' then
      if v_post.board_status <> 'open' then
        raise exception '진행 중인 게시글만 종료할 수 있습니다.';
      end if;
      update public.market_startup_posts as post
      set board_status = 'closed',
          closed_at = now(),
          version = post.version + 1
      where post.id = v_post.id
      returning * into v_post;
    else
      update public.market_startup_posts as post
      set publication_status = 'removed',
          removed_at = now(),
          version = post.version + 1
      where post.id = v_post.id
      returning * into v_post;
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'post_key', v_post.post_key,
    'board_status', v_post.board_status,
    'publication_status', v_post.publication_status,
    'version', v_post.version
  );
end;
$$;

comment on function public.mutate_market_startup_post(text, text, integer, jsonb) is
  'Active-member create and owner-only optimistic update, close, or soft remove for startup-board posts.';
revoke all on function public.mutate_market_startup_post(text, text, integer, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.mutate_market_startup_post(text, text, integer, jsonb)
  to authenticated;

comment on table public.market_startup_posts is
  'Simple member-authored startup and resale community posts; no brokerage, comments, views, or contact fields.';
