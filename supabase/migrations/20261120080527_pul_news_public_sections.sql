alter table public.news_articles
  add column public_section text,
  add column related_detail text,
  add constraint news_articles_public_section_check check (
    public_section in ('courseNews', 'tournamentEvent', 'notices', 'screenEquipment', 'other')
  ),
  add constraint news_articles_related_detail_check check (
    related_detail ~ '^(course|event|certification|university):[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'
  );

-- Preserve shared legacy category URLs and classify only the reviewed article.
update public.news_articles
set public_section = coalesce(public_section, 'courseNews'),
    related_detail = coalesce(related_detail, 'course:course-e4f6e9d8e337442f874bc1385abd6cc4'),
    version = version + 1
where news_key = 'worldcup-park-second-opening-2026'
  and title = '월드컵공원 제2파크골프장 9월 1일 개장'
  and category = 'parkGolfNews'
  and publication_status = 'published'
  and public_section is null
  and related_detail is null;

-- The original RPC signatures keep their JSON shape for older clients.
create function private.news_article_with_section_json(p_article public.news_articles)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select private.public_news_article_json(p_article) || pg_catalog.jsonb_strip_nulls(
    pg_catalog.jsonb_build_object('public_section', p_article.public_section)
  );
$$;

revoke all on function private.news_article_with_section_json(public.news_articles)
  from public, anon, authenticated, service_role;

create function public.list_public_news_articles(
  p_category text,
  p_keyword text,
  p_featured_only boolean,
  p_limit integer,
  p_offset integer,
  p_include_public_fields boolean
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_keyword text := nullif(pg_catalog.btrim(p_keyword), '');
  v_section text;
  v_total integer;
  v_items jsonb;
begin
  if not coalesce(p_include_public_fields, false) then
    return public.list_public_news_articles(p_category, p_keyword, p_featured_only, p_limit, p_offset);
  end if;
  if p_category in ('section:courseNews', 'section:tournamentEvent', 'section:notices', 'section:screenEquipment') then
    v_section := pg_catalog.split_part(p_category, ':', 2);
  elsif p_category is not null and p_category not in ('parkGolfNews', 'screenParkGolf', 'equipmentBrand', 'noticeOperation') then
    raise exception '뉴스 카테고리를 확인해 주세요.';
  end if;
  if pg_catalog.char_length(v_keyword) > 100 then
    raise exception '검색어는 100자 이하로 입력해 주세요.';
  end if;
  if p_limit is null or p_limit not between 1 and 50 or p_offset is null or p_offset < 0 then
    raise exception '페이지 범위를 확인해 주세요.';
  end if;

  with matching as materialized (
    select article.id, article.published_at, article.news_key
    from public.news_articles as article
    where article.publication_status = 'published'
      and article.published_at <= pg_catalog.now()
      and case
        when v_section is not null then v_section = coalesce(article.public_section, case article.category
          when 'noticeOperation' then 'notices'
          when 'screenParkGolf' then 'screenEquipment'
          when 'equipmentBrand' then 'screenEquipment'
          else 'other'
        end)
        else p_category is null or article.category = p_category
      end
      and (not coalesce(p_featured_only, false) or article.is_featured)
      and (
        v_keyword is null
        or pg_catalog.strpos(
          pg_catalog.lower(pg_catalog.concat_ws(
            ' ', article.title, article.summary, article.body, article.region, article.source_name
          )),
          pg_catalog.lower(v_keyword)
        ) > 0
      )
  ), page as (
    select id, published_at, news_key from matching
    order by published_at desc, news_key
    limit p_limit offset p_offset
  )
  select
    (select count(*)::integer from matching),
    coalesce(jsonb_agg(private.news_article_with_section_json(article) order by page.published_at desc, page.news_key), '[]'::jsonb)
  into v_total, v_items
  from page join public.news_articles as article on article.id = page.id;

  return jsonb_build_object(
    'items', v_items, 'total', v_total, 'limit', p_limit, 'offset', p_offset,
    'has_more', p_offset::bigint + jsonb_array_length(v_items) < v_total
  );
end;
$$;

revoke all on function public.list_public_news_articles(text, text, boolean, integer, integer, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.list_public_news_articles(text, text, boolean, integer, integer, boolean)
  to anon, authenticated;

create or replace function private.public_news_related_detail(p_target text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_key text := pg_catalog.split_part(p_target, ':', 2);
  v_public boolean;
begin
  case pg_catalog.split_part(p_target, ':', 1)
    when 'course' then v_public := public.get_public_course(v_key) is not null;
    when 'event' then v_public := public.get_public_event(v_key) is not null;
    when 'certification' then
      v_public := public.get_public_certification_course(v_key) is not null
        and public.certification_details('course', v_key, false) is not null;
    when 'university' then v_public := public.get_university_department_detail(v_key) is not null;
    else return null;
  end case;
  if v_public then
    return p_target;
  end if;
  return null;
exception when raise_exception or no_data_found or insufficient_privilege or invalid_parameter_value then
  return null;
end;
$$;

revoke all on function private.public_news_related_detail(text) from public, anon, authenticated, service_role;

create function public.get_public_news_article(p_news_key text, p_include_public_fields boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_detail jsonb := public.get_public_news_article(p_news_key);
  v_article public.news_articles%rowtype;
begin
  if not coalesce(p_include_public_fields, false) then
    return v_detail;
  end if;
  select article.* into v_article
  from public.news_articles as article where article.news_key = v_detail ->> 'news_key';

  return v_detail || pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'public_section', v_article.public_section,
    'related_detail', private.public_news_related_detail(v_article.related_detail)
  ));
end;
$$;

revoke all on function public.get_public_news_article(text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.get_public_news_article(text, boolean) to anon, authenticated;

create function public.list_news_articles_for_management(
  p_category text,
  p_keyword text,
  p_publication_status text,
  p_limit integer,
  p_offset integer,
  p_include_public_fields boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_page jsonb := public.list_news_articles_for_management(p_category, p_keyword, p_publication_status, p_limit, p_offset);
  v_items jsonb;
begin
  if not coalesce(p_include_public_fields, false) then
    return v_page;
  end if;
  select coalesce(pg_catalog.jsonb_agg(
    item.value || pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'public_section', article.public_section,
      'related_detail', article.related_detail
    )) order by item.ordinality
  ), '[]'::jsonb)
  into v_items
  from pg_catalog.jsonb_array_elements(v_page -> 'items') with ordinality as item
  join public.news_articles as article on article.news_key = item.value ->> 'news_key';

  return pg_catalog.jsonb_set(v_page, '{items}', v_items);
end;
$$;

revoke all on function public.list_news_articles_for_management(text, text, text, integer, integer, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.list_news_articles_for_management(text, text, text, integer, integer, boolean)
  to authenticated;

create or replace function public.mutate_news_article(
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
        'source_name', 'source_url', 'published_at', 'is_featured', 'public_section', 'related_detail'
      )
    ) then
      raise exception '지원하지 않는 뉴스 입력값이 포함되어 있습니다.';
    end if;
    select pg_catalog.count(*)::integer
    into v_payload_key_count
    from pg_catalog.jsonb_object_keys(p_payload - array['public_section', 'related_detail']);
    if v_payload_key_count <> 10 then
      raise exception '필수 뉴스 입력값을 모두 확인해 주세요.';
    end if;
    if pg_catalog.jsonb_typeof(p_payload -> 'is_featured') is distinct from 'boolean' then
      raise exception '추천 뉴스 여부를 확인해 주세요.';
    end if;
    if p_payload ->> 'published_at' is null then
      raise exception '게시 일시를 확인해 주세요.';
    end if;
    if (p_payload ? 'public_section' and pg_catalog.jsonb_typeof(p_payload -> 'public_section') not in ('string', 'null'))
      or (p_payload ? 'related_detail' and pg_catalog.jsonb_typeof(p_payload -> 'related_detail') not in ('string', 'null')) then
      raise exception '뉴스 공개 분류와 관련 상세를 확인해 주세요.';
    end if;
    v_published_at := (p_payload ->> 'published_at')::timestamptz;

    if p_operation = 'create' then
      insert into public.news_articles (
        news_key, category, title, summary, body, region, source_type,
        source_name, source_url, published_at, is_featured, public_section, related_detail,
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
        p_payload ->> 'public_section',
        p_payload ->> 'related_detail',
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
          public_section = case when p_payload ? 'public_section' then p_payload ->> 'public_section' else article.public_section end,
          related_detail = case when p_payload ? 'related_detail' then p_payload ->> 'related_detail' else article.related_detail end,
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
