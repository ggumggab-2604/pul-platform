create function private.valid_news_external_url(p_url text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    p_url is not null
    and p_url = pg_catalog.btrim(p_url)
    and pg_catalog.char_length(p_url) between 12 and 500
    and p_url ~ '^https://[A-Za-z0-9][^[:space:]]*$'
    and p_url !~ '[[:cntrl:]]';
$$;

revoke all on function private.valid_news_external_url(text)
  from public, anon, authenticated, service_role;

create table public.news_articles (
  id uuid primary key default gen_random_uuid(),
  news_key text not null,
  category text not null,
  title text not null,
  summary text not null,
  body text not null,
  region text not null,
  source_type text not null,
  source_name text,
  source_url text,
  published_at timestamptz not null,
  is_featured boolean not null default false,
  publication_status text not null default 'hidden',
  version integer not null default 1,
  created_by uuid not null references public.user_accounts (id),
  updated_by uuid not null references public.user_accounts (id),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint news_articles_news_key_uidx unique (news_key),
  constraint news_articles_news_key_check check (
    news_key = pg_catalog.btrim(news_key)
    and news_key ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'
  ),
  constraint news_articles_category_check check (
    category in (
      'parkGolfNews', 'screenParkGolf', 'equipmentBrand', 'noticeOperation'
    )
  ),
  constraint news_articles_title_check check (
    title = pg_catalog.btrim(title)
    and pg_catalog.char_length(title) between 2 and 180
  ),
  constraint news_articles_summary_check check (
    summary = pg_catalog.btrim(summary)
    and pg_catalog.char_length(summary) between 10 and 500
  ),
  constraint news_articles_body_check check (
    body = pg_catalog.btrim(body)
    and pg_catalog.char_length(body) between 20 and 20000
  ),
  constraint news_articles_region_check check (
    region = pg_catalog.btrim(region)
    and pg_catalog.char_length(region) between 1 and 80
  ),
  constraint news_articles_source_type_check check (
    source_type in (
      'adminVerified', 'officialNotice', 'memberReport',
      'organizationNotice', 'brandPromotion'
    )
  ),
  constraint news_articles_source_name_check check (
    source_name is null
    or (
      source_name = pg_catalog.btrim(source_name)
      and pg_catalog.char_length(source_name) between 2 and 160
    )
  ),
  constraint news_articles_source_url_check check (
    source_url is null
    or private.valid_news_external_url(source_url)
  ),
  constraint news_articles_publication_status_check check (
    publication_status in ('published', 'hidden', 'removed')
  ),
  constraint news_articles_version_check check (version >= 1)
);

comment on table public.news_articles is
  'Operator-authored public news directory for verified park-golf news, notices, screen venues, and brands.';

create index news_articles_public_latest_idx
  on public.news_articles (published_at desc, news_key)
  where publication_status = 'published';

create index news_articles_public_category_idx
  on public.news_articles (
    category, is_featured desc, published_at desc, news_key
  )
  where publication_status = 'published';

create trigger news_articles_set_updated_at
before update on public.news_articles
for each row execute function public.set_user_foundation_updated_at();

alter table public.news_articles enable row level security;
alter table public.news_articles force row level security;

create policy news_articles_public_published_select
on public.news_articles
for select
to anon, authenticated
using (
  publication_status = 'published'
  and published_at <= pg_catalog.now()
);

revoke all on table public.news_articles
  from public, anon, authenticated, service_role;

insert into public.platform_permission_definitions (code, description, is_active)
values (
  'news.manage',
  '공식 뉴스·정보를 등록·수정·공개·숨김·제거합니다.',
  true
);

insert into public.platform_role_permissions (platform_role, permission_code)
values ('platform_admin', 'news.manage');

create function private.public_news_article_json(
  p_article public.news_articles
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'news_key', p_article.news_key,
    'category', p_article.category,
    'title', p_article.title,
    'summary', p_article.summary,
    'body', p_article.body,
    'region', p_article.region,
    'source_type', p_article.source_type,
    'source_name', p_article.source_name,
    'source_url', p_article.source_url,
    'published_at', p_article.published_at,
    'is_featured', p_article.is_featured
  );
$$;

revoke all on function private.public_news_article_json(public.news_articles)
  from public, anon, authenticated, service_role;

create function private.management_news_article_json(
  p_article public.news_articles
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.public_news_article_json(p_article)
    || pg_catalog.jsonb_build_object(
      'publication_status', p_article.publication_status,
      'version', p_article.version
    );
$$;

revoke all on function private.management_news_article_json(public.news_articles)
  from public, anon, authenticated, service_role;

create function public.list_public_news_articles(
  p_category text default null,
  p_keyword text default null,
  p_featured_only boolean default false,
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
  v_featured_only boolean := coalesce(p_featured_only, false);
  v_total integer;
  v_items jsonb;
begin
  if p_category is not null and p_category not in (
    'parkGolfNews', 'screenParkGolf', 'equipmentBrand', 'noticeOperation'
  ) then
    raise exception '뉴스 카테고리를 확인해 주세요.';
  end if;
  if v_keyword is not null and pg_catalog.char_length(v_keyword) > 100 then
    raise exception '검색어는 100자 이하로 입력해 주세요.';
  end if;
  if p_limit not between 1 and 50 or p_offset < 0 then
    raise exception '페이지 범위를 확인해 주세요.';
  end if;

  select pg_catalog.count(*)::integer
  into v_total
  from public.news_articles as article
  where article.publication_status = 'published'
    and article.published_at <= pg_catalog.now()
    and (p_category is null or article.category = p_category)
    and (not v_featured_only or article.is_featured)
    and (
      v_keyword is null
      or pg_catalog.strpos(
        pg_catalog.lower(pg_catalog.concat_ws(
          ' ', article.title, article.summary, article.body, article.region,
          article.source_name
        )),
        pg_catalog.lower(v_keyword)
      ) > 0
    );

  with page as (
    select article.id
    from public.news_articles as article
    where article.publication_status = 'published'
      and article.published_at <= pg_catalog.now()
      and (p_category is null or article.category = p_category)
      and (not v_featured_only or article.is_featured)
      and (
        v_keyword is null
        or pg_catalog.strpos(
          pg_catalog.lower(pg_catalog.concat_ws(
            ' ', article.title, article.summary, article.body, article.region,
            article.source_name
          )),
          pg_catalog.lower(v_keyword)
        ) > 0
      )
    order by article.published_at desc, article.news_key
    limit p_limit
    offset p_offset
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      private.public_news_article_json(article)
      order by article.published_at desc, article.news_key
    ),
    '[]'::jsonb
  )
  into v_items
  from page
  join public.news_articles as article on article.id = page.id;

  return pg_catalog.jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', p_offset + pg_catalog.jsonb_array_length(v_items) < v_total
  );
end;
$$;

comment on function public.list_public_news_articles(text, text, boolean, integer, integer) is
  'Lists only currently published news using category, keyword, featured, and pagination filters.';

revoke all on function public.list_public_news_articles(
  text, text, boolean, integer, integer
)
  from public, anon, authenticated, service_role;
grant execute on function public.list_public_news_articles(
  text, text, boolean, integer, integer
)
  to anon, authenticated;

create function public.get_public_news_article(p_news_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_article public.news_articles%rowtype;
  v_key text := nullif(pg_catalog.btrim(p_news_key), '');
begin
  if v_key is null or v_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' then
    raise exception '뉴스를 찾을 수 없습니다.';
  end if;

  select article.*
  into v_article
  from public.news_articles as article
  where article.news_key = v_key
    and article.publication_status = 'published'
    and article.published_at <= pg_catalog.now();

  if not found then
    raise exception '뉴스를 찾을 수 없습니다.';
  end if;

  return private.public_news_article_json(v_article);
end;
$$;

comment on function public.get_public_news_article(text) is
  'Returns a single currently published public news article by stable public key.';

revoke all on function public.get_public_news_article(text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_news_article(text)
  to anon, authenticated;

create function private.require_news_directory_manager()
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
    and mapping.permission_code = 'news.manage'
  for share of account;

  if not found then
    raise exception '뉴스·정보 운영 권한이 없습니다.';
  end if;

  return v_actor_id;
end;
$$;

revoke all on function private.require_news_directory_manager()
  from public, anon, authenticated, service_role;

create function public.list_news_articles_for_management(
  p_category text default null,
  p_keyword text default null,
  p_publication_status text default null,
  p_limit integer default 30,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_keyword text := nullif(pg_catalog.btrim(p_keyword), '');
  v_total integer;
  v_items jsonb;
begin
  v_actor_id := private.require_news_directory_manager();
  if v_actor_id is null then
    raise exception '뉴스·정보 운영 권한이 없습니다.';
  end if;
  if p_category is not null and p_category not in (
    'parkGolfNews', 'screenParkGolf', 'equipmentBrand', 'noticeOperation'
  ) then
    raise exception '뉴스 카테고리를 확인해 주세요.';
  end if;
  if p_publication_status is not null
     and p_publication_status not in ('published', 'hidden', 'removed') then
    raise exception '뉴스 공개 상태를 확인해 주세요.';
  end if;
  if v_keyword is not null and pg_catalog.char_length(v_keyword) > 100 then
    raise exception '검색어는 100자 이하로 입력해 주세요.';
  end if;
  if p_limit not between 1 and 50 or p_offset < 0 then
    raise exception '페이지 범위를 확인해 주세요.';
  end if;

  select pg_catalog.count(*)::integer
  into v_total
  from public.news_articles as article
  where (p_category is null or article.category = p_category)
    and (
      p_publication_status is null
      or article.publication_status = p_publication_status
    )
    and (
      v_keyword is null
      or pg_catalog.strpos(
        pg_catalog.lower(pg_catalog.concat_ws(
          ' ', article.title, article.summary, article.body, article.region,
          article.source_name
        )),
        pg_catalog.lower(v_keyword)
      ) > 0
    );

  with page as (
    select article.id
    from public.news_articles as article
    where (p_category is null or article.category = p_category)
      and (
        p_publication_status is null
        or article.publication_status = p_publication_status
      )
      and (
        v_keyword is null
        or pg_catalog.strpos(
          pg_catalog.lower(pg_catalog.concat_ws(
            ' ', article.title, article.summary, article.body, article.region,
            article.source_name
          )),
          pg_catalog.lower(v_keyword)
        ) > 0
      )
    order by article.updated_at desc, article.news_key
    limit p_limit
    offset p_offset
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      private.management_news_article_json(article)
      order by article.updated_at desc, article.news_key
    ),
    '[]'::jsonb
  )
  into v_items
  from page
  join public.news_articles as article on article.id = page.id;

  return pg_catalog.jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', p_offset + pg_catalog.jsonb_array_length(v_items) < v_total
  );
end;
$$;

comment on function public.list_news_articles_for_management(text, text, text, integer, integer) is
  'Active news.manage platform operators can list published, hidden, and removed news without actor identity fields.';

revoke all on function public.list_news_articles_for_management(
  text, text, text, integer, integer
)
  from public, anon, authenticated, service_role;
grant execute on function public.list_news_articles_for_management(
  text, text, text, integer, integer
)
  to authenticated;

create function public.mutate_news_article(
  p_operation text,
  p_news_key text,
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
  v_article public.news_articles%rowtype;
  v_key text := nullif(pg_catalog.btrim(p_news_key), '');
  v_payload_key_count integer;
  v_published_at timestamptz;
begin
  v_actor_id := private.require_news_directory_manager();
  if p_operation not in ('create', 'update', 'publish', 'hide', 'remove') then
    raise exception '뉴스 작업을 확인해 주세요.';
  end if;
  if v_key is null or v_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' then
    raise exception '공개 news key를 확인해 주세요.';
  end if;
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception '뉴스 입력값을 확인해 주세요.';
  end if;

  if p_operation = 'create' then
    if p_expected_version is not null then
      raise exception '신규 등록에는 기존 version을 사용할 수 없습니다.';
    end if;
    if exists (
      select 1
      from public.news_articles as article
      where article.news_key = v_key
    ) then
      raise exception '이미 사용 중인 news key입니다.';
    end if;
  else
    if p_expected_version is null or p_expected_version < 1 then
      raise exception '현재 version을 확인해 주세요.';
    end if;
    select article.*
    into v_article
    from public.news_articles as article
    where article.news_key = v_key
    for update;
    if not found then
      raise exception '뉴스를 찾을 수 없습니다.';
    end if;
    if v_article.version <> p_expected_version then
      raise exception '뉴스가 변경되었습니다. 최신 내용을 다시 확인해 주세요.';
    end if;
    if v_article.publication_status = 'removed' then
      raise exception '제거된 뉴스는 다시 변경할 수 없습니다.';
    end if;
  end if;

  if p_operation in ('create', 'update') then
    if exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_payload) as supplied(key)
      where supplied.key not in (
        'category', 'title', 'summary', 'body', 'region', 'source_type',
        'source_name', 'source_url', 'published_at', 'is_featured'
      )
    ) then
      raise exception '지원하지 않는 뉴스 입력값이 포함되어 있습니다.';
    end if;
    select pg_catalog.count(*)::integer
    into v_payload_key_count
    from pg_catalog.jsonb_object_keys(p_payload);
    if v_payload_key_count <> 10 then
      raise exception '필수 뉴스 입력값을 모두 확인해 주세요.';
    end if;
    if pg_catalog.jsonb_typeof(p_payload -> 'is_featured') is distinct from 'boolean' then
      raise exception '추천 뉴스 여부를 확인해 주세요.';
    end if;
    if p_payload ->> 'published_at' is null then
      raise exception '게시 일시를 확인해 주세요.';
    end if;
    v_published_at := (p_payload ->> 'published_at')::timestamptz;

    if p_operation = 'create' then
      insert into public.news_articles (
        news_key, category, title, summary, body, region, source_type,
        source_name, source_url, published_at, is_featured,
        publication_status, created_by, updated_by
      ) values (
        v_key,
        p_payload ->> 'category',
        pg_catalog.btrim(p_payload ->> 'title'),
        pg_catalog.btrim(p_payload ->> 'summary'),
        pg_catalog.btrim(p_payload ->> 'body'),
        pg_catalog.btrim(p_payload ->> 'region'),
        p_payload ->> 'source_type',
        nullif(pg_catalog.btrim(p_payload ->> 'source_name'), ''),
        nullif(pg_catalog.btrim(p_payload ->> 'source_url'), ''),
        v_published_at,
        (p_payload ->> 'is_featured')::boolean,
        'hidden',
        v_actor_id,
        v_actor_id
      )
      returning * into v_article;
    else
      update public.news_articles as article
      set category = p_payload ->> 'category',
          title = pg_catalog.btrim(p_payload ->> 'title'),
          summary = pg_catalog.btrim(p_payload ->> 'summary'),
          body = pg_catalog.btrim(p_payload ->> 'body'),
          region = pg_catalog.btrim(p_payload ->> 'region'),
          source_type = p_payload ->> 'source_type',
          source_name = nullif(pg_catalog.btrim(p_payload ->> 'source_name'), ''),
          source_url = nullif(pg_catalog.btrim(p_payload ->> 'source_url'), ''),
          published_at = v_published_at,
          is_featured = (p_payload ->> 'is_featured')::boolean,
          updated_by = v_actor_id,
          version = article.version + 1
      where article.id = v_article.id
      returning * into v_article;
    end if;
  elsif p_payload <> '{}'::jsonb then
    raise exception '이 작업에는 추가 입력값을 사용할 수 없습니다.';
  elsif p_operation = 'publish' then
    if v_article.published_at > pg_catalog.now() then
      raise exception '게시 일시는 현재 이하여야 합니다.';
    end if;
    update public.news_articles as article
    set publication_status = 'published',
        updated_by = v_actor_id,
        version = article.version + 1
    where article.id = v_article.id
    returning * into v_article;
  elsif p_operation = 'hide' then
    update public.news_articles as article
    set publication_status = 'hidden',
        updated_by = v_actor_id,
        version = article.version + 1
    where article.id = v_article.id
    returning * into v_article;
  elsif p_operation = 'remove' then
    update public.news_articles as article
    set publication_status = 'removed',
        is_featured = false,
        updated_by = v_actor_id,
        version = article.version + 1
    where article.id = v_article.id
    returning * into v_article;
  end if;

  return pg_catalog.jsonb_build_object(
    'news_key', v_article.news_key,
    'publication_status', v_article.publication_status,
    'version', v_article.version
  );
end;
$$;

comment on function public.mutate_news_article(text, text, integer, jsonb) is
  'Active news.manage platform operator-only create, update, publish, hide, and remove mutation.';

revoke all on function public.mutate_news_article(text, text, integer, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.mutate_news_article(text, text, integer, jsonb)
  to authenticated;
