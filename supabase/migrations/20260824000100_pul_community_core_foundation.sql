create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_user_id uuid not null references public.user_accounts (id),
  category_code text not null,
  title text not null,
  body text not null,
  post_status text not null default 'published',
  question_type text,
  question_resolved_at timestamptz,
  review_type text,
  rating smallint,
  lost_found_kind text,
  lost_found_item_name text,
  lost_found_place text,
  lost_found_date date,
  lost_found_status text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz,
  constraint community_posts_category_check check (
    category_code in ('free', 'question', 'review', 'equipment', 'course', 'club', 'lostFound', 'marketReview')
  ),
  constraint community_posts_title_check check (
    title = pg_catalog.btrim(title)
    and pg_catalog.char_length(title) between 2 and 120
  ),
  constraint community_posts_body_check check (
    body = pg_catalog.btrim(body)
    and pg_catalog.char_length(body) between 10 and 5000
  ),
  constraint community_posts_status_check check (
    post_status in ('published', 'hidden', 'removed')
  ),
  constraint community_posts_version_check check (version >= 1),
  constraint community_posts_removed_check check (
    (post_status = 'removed' and removed_at is not null)
    or (post_status <> 'removed' and removed_at is null)
  ),
  constraint community_posts_question_metadata_check check (
    (
      category_code = 'question'
      and question_type in ('beginner', 'rule', 'equipment', 'courseUse', 'reservation', 'club', 'license', 'etc')
    )
    or (
      category_code <> 'question'
      and question_type is null
      and question_resolved_at is null
    )
  ),
  constraint community_posts_review_metadata_check check (
    (
      category_code in ('review', 'marketReview')
      and review_type in ('course', 'lesson', 'equipment', 'club', 'event', 'market')
      and rating between 1 and 5
      and (category_code <> 'marketReview' or review_type = 'market')
    )
    or (
      category_code not in ('review', 'marketReview')
      and review_type is null
      and rating is null
    )
  ),
  constraint community_posts_lost_found_metadata_check check (
    (
      category_code = 'lostFound'
      and lost_found_kind in ('lost', 'found')
      and pg_catalog.char_length(pg_catalog.btrim(lost_found_item_name)) between 2 and 100
      and pg_catalog.char_length(pg_catalog.btrim(lost_found_place)) between 2 and 200
      and lost_found_date is not null
      and (
        (lost_found_kind = 'lost' and lost_found_status in ('searching', 'resolved'))
        or (lost_found_kind = 'found' and lost_found_status in ('holding', 'resolved'))
      )
    )
    or (
      category_code <> 'lostFound'
      and lost_found_kind is null
      and lost_found_item_name is null
      and lost_found_place is null
      and lost_found_date is null
      and lost_found_status is null
    )
  )
);

create table public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts (id),
  author_user_id uuid not null references public.user_accounts (id),
  body text not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz,
  constraint community_comments_body_check check (
    body = pg_catalog.btrim(body)
    and pg_catalog.char_length(body) between 1 and 2000
  ),
  constraint community_comments_version_check check (version >= 1)
);

create index community_posts_public_created_idx
  on public.community_posts (created_at desc, id desc)
  where post_status = 'published';

create index community_posts_category_created_idx
  on public.community_posts (category_code, created_at desc, id desc)
  where post_status = 'published';

create index community_posts_author_idx
  on public.community_posts (author_user_id, created_at desc);

create index community_comments_post_created_idx
  on public.community_comments (post_id, created_at, id)
  where removed_at is null;

create index community_comments_author_idx
  on public.community_comments (author_user_id, created_at desc);

alter table public.community_posts enable row level security;
alter table public.community_posts force row level security;
alter table public.community_comments enable row level security;
alter table public.community_comments force row level security;

revoke all on table public.community_posts from public, anon, authenticated, service_role;
revoke all on table public.community_comments from public, anon, authenticated, service_role;

create function private.community_actor_display_name(p_user_id uuid, p_viewer_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when profile.user_id is null then 'PUL 회원'
    when profile.profile_visibility = 'public' or profile.user_id = p_viewer_id
      then coalesce(
        nullif(pg_catalog.btrim(profile.nickname), ''),
        nullif(pg_catalog.btrim(profile.display_name), ''),
        'PUL 회원'
      )
    else 'PUL 회원'
  end
  from (select 1) as singleton
  left join public.user_profiles as profile on profile.user_id = p_user_id;
$$;

revoke all on function private.community_actor_display_name(uuid, uuid)
  from public, anon, authenticated, service_role;

create function private.community_assert_active_actor()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_account_status text;
begin
  if v_actor_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select account.account_status
  into v_account_status
  from public.user_accounts as account
  where account.id = v_actor_id
  for share;

  if v_account_status is distinct from 'active' then
    raise exception '정상 활동 계정만 커뮤니티에 글을 작성할 수 있습니다.';
  end if;

  return v_actor_id;
end;
$$;

revoke all on function private.community_assert_active_actor()
  from public, anon, authenticated, service_role;

create function private.community_validate_post_payload(p_payload jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_category text := nullif(pg_catalog.btrim(p_payload ->> 'category'), '');
  v_title text := nullif(pg_catalog.btrim(p_payload ->> 'title'), '');
  v_body text := nullif(pg_catalog.btrim(p_payload ->> 'body'), '');
  v_question_type text := nullif(pg_catalog.btrim(p_payload ->> 'question_type'), '');
  v_review_type text := nullif(pg_catalog.btrim(p_payload ->> 'review_type'), '');
  v_rating integer;
  v_lost_found_kind text := nullif(pg_catalog.btrim(p_payload ->> 'lost_found_kind'), '');
  v_lost_found_item_name text := nullif(pg_catalog.btrim(p_payload ->> 'lost_found_item_name'), '');
  v_lost_found_place text := nullif(pg_catalog.btrim(p_payload ->> 'lost_found_place'), '');
  v_lost_found_date date;
  v_lost_found_status text := nullif(pg_catalog.btrim(p_payload ->> 'lost_found_status'), '');
begin
  if v_category is null or v_category not in ('free', 'question', 'review', 'equipment', 'course', 'club', 'lostFound', 'marketReview') then
    raise exception '게시글 카테고리를 확인해 주세요.';
  end if;
  if v_title is null or pg_catalog.char_length(v_title) not between 2 and 120 then
    raise exception '제목은 2~120자로 입력해 주세요.';
  end if;
  if v_body is null or pg_catalog.char_length(v_body) not between 10 and 5000 then
    raise exception '본문은 10~5000자로 입력해 주세요.';
  end if;

  if v_category = 'question' then
    if v_question_type is null or v_question_type not in ('beginner', 'rule', 'equipment', 'courseUse', 'reservation', 'club', 'license', 'etc') then
      raise exception '질문 종류를 확인해 주세요.';
    end if;
  elsif v_question_type is not null then
    raise exception '질문 게시글에만 질문 종류를 입력할 수 있습니다.';
  end if;

  if v_category in ('review', 'marketReview') then
    begin
      v_rating := (p_payload ->> 'rating')::integer;
    exception when invalid_text_representation then
      raise exception '별점은 1~5 정수로 입력해 주세요.';
    end;
    if v_review_type is null or v_review_type not in ('course', 'lesson', 'equipment', 'club', 'event', 'market') or v_rating not between 1 and 5 then
      raise exception '후기 종류와 별점 1~5를 확인해 주세요.';
    end if;
    if v_category = 'marketReview' and v_review_type <> 'market' then
      raise exception '중고거래 후기는 중고거래 후기 종류로 작성해 주세요.';
    end if;
  elsif v_review_type is not null or p_payload ? 'rating' then
    raise exception '후기 게시글에만 후기 종류와 별점을 입력할 수 있습니다.';
  end if;

  if v_category = 'lostFound' then
    begin
      v_lost_found_date := (p_payload ->> 'lost_found_date')::date;
    exception when invalid_datetime_format then
      raise exception '분실·습득 날짜를 확인해 주세요.';
    end;
    if v_lost_found_kind not in ('lost', 'found')
       or v_lost_found_item_name is null
       or pg_catalog.char_length(v_lost_found_item_name) not between 2 and 100
       or v_lost_found_place is null
       or pg_catalog.char_length(v_lost_found_place) not between 2 and 200
       or v_lost_found_date is null then
      raise exception '분실·습득 물건, 장소, 날짜를 확인해 주세요.';
    end if;
    if (v_lost_found_kind = 'lost' and v_lost_found_status not in ('searching', 'resolved'))
       or (v_lost_found_kind = 'found' and v_lost_found_status not in ('holding', 'resolved')) then
      raise exception '분실·습득 상태를 확인해 주세요.';
    end if;
  elsif v_lost_found_kind is not null
     or v_lost_found_item_name is not null
     or v_lost_found_place is not null
     or p_payload ? 'lost_found_date'
     or v_lost_found_status is not null then
    raise exception '분실·습득 게시글에만 분실·습득 정보를 입력할 수 있습니다.';
  end if;
end;
$$;

revoke all on function private.community_validate_post_payload(jsonb)
  from public, anon, authenticated, service_role;

create function public.list_community_posts(
  p_category_code text default null,
  p_keyword text default null,
  p_sort_order text default 'latest',
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
  v_total integer;
  v_items jsonb;
begin
  if p_category_code is not null
     and p_category_code not in ('free', 'question', 'review', 'equipment', 'course', 'club', 'lostFound', 'marketReview') then
    raise exception '게시글 카테고리를 확인해 주세요.';
  end if;
  if p_sort_order not in ('latest', 'comments') then
    raise exception '게시글 정렬 방식을 확인해 주세요.';
  end if;
  if p_limit not between 1 and 30 or p_offset < 0 then
    raise exception '페이지 범위를 확인해 주세요.';
  end if;

  select count(*)::integer
  into v_total
  from public.community_posts as post
  where post.post_status = 'published'
    and (p_category_code is null or post.category_code = p_category_code)
    and (
      v_keyword is null
      or post.title ilike '%' || v_keyword || '%'
      or post.body ilike '%' || v_keyword || '%'
    );

  with eligible as (
    select
      post.*,
      (
        select count(*)::integer
        from public.community_comments as comment
        where comment.post_id = post.id
          and comment.removed_at is null
      ) as comment_count
    from public.community_posts as post
    where post.post_status = 'published'
      and (p_category_code is null or post.category_code = p_category_code)
      and (
        v_keyword is null
        or post.title ilike '%' || v_keyword || '%'
        or post.body ilike '%' || v_keyword || '%'
      )
  ), page as (
    select eligible.*
    from eligible
    order by
      case when p_sort_order = 'comments' then eligible.comment_count end desc,
      eligible.created_at desc,
      eligible.id desc
    limit p_limit
    offset p_offset
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', page.id,
        'title', page.title,
        'summary', pg_catalog.left(page.body, 180),
        'category', page.category_code,
        'author_display_name', private.community_actor_display_name(page.author_user_id, v_viewer_id),
        'created_at', page.created_at,
        'updated_at', page.updated_at,
        'version', page.version,
        'can_edit', coalesce(page.author_user_id = v_viewer_id, false),
        'comment_count', page.comment_count,
        'question_type', page.question_type,
        'question_status', case
          when page.category_code <> 'question' then null
          when page.question_resolved_at is not null then 'resolved'
          when page.comment_count > 0 then 'answered'
          else 'waiting'
        end,
        'review_type', page.review_type,
        'rating', page.rating,
        'lost_found_kind', page.lost_found_kind,
        'lost_found_item_name', page.lost_found_item_name,
        'lost_found_place', page.lost_found_place,
        'lost_found_date', page.lost_found_date,
        'lost_found_status', page.lost_found_status
      )
      order by
        case when p_sort_order = 'comments' then page.comment_count end desc,
        page.created_at desc,
        page.id desc
    ),
    '[]'::jsonb
  )
  into v_items
  from page;

  return jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', p_offset + jsonb_array_length(v_items) < v_total
  );
end;
$$;

revoke all on function public.list_community_posts(text, text, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_community_posts(text, text, text, integer, integer)
  to anon, authenticated;

create function public.get_community_post(p_post_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_post public.community_posts%rowtype;
  v_comment_count integer;
begin
  select post.*
  into v_post
  from public.community_posts as post
  where post.id = p_post_id
    and post.post_status = 'published';

  if not found then
    raise exception '게시글을 찾을 수 없습니다.';
  end if;

  select count(*)::integer
  into v_comment_count
  from public.community_comments as comment
  where comment.post_id = v_post.id
    and comment.removed_at is null;

  return jsonb_build_object(
    'id', v_post.id,
    'title', v_post.title,
    'body', v_post.body,
    'category', v_post.category_code,
    'status', v_post.post_status,
    'author_display_name', private.community_actor_display_name(v_post.author_user_id, v_viewer_id),
    'created_at', v_post.created_at,
    'updated_at', v_post.updated_at,
    'version', v_post.version,
    'can_edit', coalesce(v_post.author_user_id = v_viewer_id, false),
    'comment_count', v_comment_count,
    'question_type', v_post.question_type,
    'question_status', case
      when v_post.category_code <> 'question' then null
      when v_post.question_resolved_at is not null then 'resolved'
      when v_comment_count > 0 then 'answered'
      else 'waiting'
    end,
    'review_type', v_post.review_type,
    'rating', v_post.rating,
    'lost_found_kind', v_post.lost_found_kind,
    'lost_found_item_name', v_post.lost_found_item_name,
    'lost_found_place', v_post.lost_found_place,
    'lost_found_date', v_post.lost_found_date,
    'lost_found_status', v_post.lost_found_status
  );
end;
$$;

revoke all on function public.get_community_post(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_community_post(uuid)
  to anon, authenticated;

create function public.list_community_comments(
  p_post_id uuid,
  p_limit integer default 50,
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
  v_total integer;
  v_items jsonb;
begin
  if p_limit not between 1 and 100 or p_offset < 0 then
    raise exception '댓글 페이지 범위를 확인해 주세요.';
  end if;

  perform 1
  from public.community_posts as post
  where post.id = p_post_id
    and post.post_status = 'published';
  if not found then
    raise exception '게시글을 찾을 수 없습니다.';
  end if;

  select count(*)::integer
  into v_total
  from public.community_comments as comment
  where comment.post_id = p_post_id
    and comment.removed_at is null;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', page.id,
        'body', page.body,
        'author_display_name', private.community_actor_display_name(page.author_user_id, v_viewer_id),
        'created_at', page.created_at,
        'updated_at', page.updated_at,
        'version', page.version,
        'can_edit', coalesce(page.author_user_id = v_viewer_id, false)
      )
      order by page.created_at, page.id
    ),
    '[]'::jsonb
  )
  into v_items
  from (
    select comment.*
    from public.community_comments as comment
    where comment.post_id = p_post_id
      and comment.removed_at is null
    order by comment.created_at, comment.id
    limit p_limit
    offset p_offset
  ) as page;

  return jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', p_offset + jsonb_array_length(v_items) < v_total
  );
end;
$$;

revoke all on function public.list_community_comments(uuid, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_community_comments(uuid, integer, integer)
  to anon, authenticated;

create function public.mutate_community_post(
  p_operation text,
  p_post_id uuid default null,
  p_expected_version integer default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := private.community_assert_active_actor();
  v_post public.community_posts%rowtype;
  v_category text;
  v_title text;
  v_body text;
  v_question_type text;
  v_review_type text;
  v_rating smallint;
  v_lost_found_kind text;
  v_lost_found_item_name text;
  v_lost_found_place text;
  v_lost_found_date date;
  v_lost_found_status text;
begin
  if p_operation not in ('create', 'update', 'remove', 'resolve_question', 'update_lost_found') then
    raise exception '지원하지 않는 게시글 작업입니다.';
  end if;

  if p_operation in ('create', 'update') then
    perform private.community_validate_post_payload(p_payload);
    v_category := pg_catalog.btrim(p_payload ->> 'category');
    v_title := pg_catalog.btrim(p_payload ->> 'title');
    v_body := pg_catalog.btrim(p_payload ->> 'body');
    v_question_type := nullif(pg_catalog.btrim(p_payload ->> 'question_type'), '');
    v_review_type := nullif(pg_catalog.btrim(p_payload ->> 'review_type'), '');
    v_rating := case when p_payload ? 'rating' then (p_payload ->> 'rating')::smallint else null end;
    v_lost_found_kind := nullif(pg_catalog.btrim(p_payload ->> 'lost_found_kind'), '');
    v_lost_found_item_name := nullif(pg_catalog.btrim(p_payload ->> 'lost_found_item_name'), '');
    v_lost_found_place := nullif(pg_catalog.btrim(p_payload ->> 'lost_found_place'), '');
    v_lost_found_date := case when p_payload ? 'lost_found_date' then (p_payload ->> 'lost_found_date')::date else null end;
    v_lost_found_status := nullif(pg_catalog.btrim(p_payload ->> 'lost_found_status'), '');
  end if;

  if p_operation = 'create' then
    if p_post_id is not null or p_expected_version is not null then
      raise exception '새 게시글에는 기존 식별자나 version을 사용할 수 없습니다.';
    end if;

    insert into public.community_posts (
      author_user_id,
      category_code,
      title,
      body,
      question_type,
      review_type,
      rating,
      lost_found_kind,
      lost_found_item_name,
      lost_found_place,
      lost_found_date,
      lost_found_status
    ) values (
      v_actor_id,
      v_category,
      v_title,
      v_body,
      v_question_type,
      v_review_type,
      v_rating,
      v_lost_found_kind,
      v_lost_found_item_name,
      v_lost_found_place,
      v_lost_found_date,
      v_lost_found_status
    )
    returning * into v_post;
  else
    if p_post_id is null or p_expected_version is null or p_expected_version < 1 then
      raise exception '게시글 식별자와 현재 version이 필요합니다.';
    end if;

    select post.*
    into v_post
    from public.community_posts as post
    where post.id = p_post_id
    for update;

    if not found or v_post.post_status <> 'published' then
      raise exception '게시글을 찾을 수 없습니다.';
    end if;
    if v_post.author_user_id <> v_actor_id then
      raise exception '본인의 게시글만 변경할 수 있습니다.';
    end if;
    if v_post.version <> p_expected_version then
      raise exception '다른 변경이 있었습니다. 새로고침 후 다시 확인해 주세요.';
    end if;

    if p_operation = 'update' then
      update public.community_posts as post
      set
        category_code = v_category,
        title = v_title,
        body = v_body,
        question_type = v_question_type,
        question_resolved_at = case
          when v_category = 'question' and v_post.category_code = 'question' then v_post.question_resolved_at
          else null
        end,
        review_type = v_review_type,
        rating = v_rating,
        lost_found_kind = v_lost_found_kind,
        lost_found_item_name = v_lost_found_item_name,
        lost_found_place = v_lost_found_place,
        lost_found_date = v_lost_found_date,
        lost_found_status = v_lost_found_status,
        version = post.version + 1,
        updated_at = now()
      where post.id = v_post.id
      returning * into v_post;
    elsif p_operation = 'remove' then
      update public.community_posts as post
      set
        post_status = 'removed',
        removed_at = now(),
        version = post.version + 1,
        updated_at = now()
      where post.id = v_post.id
      returning * into v_post;
    elsif p_operation = 'resolve_question' then
      if v_post.category_code <> 'question' then
        raise exception '질문 게시글만 해결 처리할 수 있습니다.';
      end if;
      if v_post.question_resolved_at is not null then
        raise exception '이미 해결된 질문입니다.';
      end if;
      update public.community_posts as post
      set
        question_resolved_at = now(),
        version = post.version + 1,
        updated_at = now()
      where post.id = v_post.id
      returning * into v_post;
    else
      v_lost_found_status := nullif(pg_catalog.btrim(p_payload ->> 'lost_found_status'), '');
      if v_post.category_code <> 'lostFound' then
        raise exception '분실·습득 게시글만 상태를 변경할 수 있습니다.';
      end if;
      if (v_post.lost_found_kind = 'lost' and v_lost_found_status not in ('searching', 'resolved'))
         or (v_post.lost_found_kind = 'found' and v_lost_found_status not in ('holding', 'resolved')) then
        raise exception '분실·습득 상태를 확인해 주세요.';
      end if;
      update public.community_posts as post
      set
        lost_found_status = v_lost_found_status,
        version = post.version + 1,
        updated_at = now()
      where post.id = v_post.id
      returning * into v_post;
    end if;
  end if;

  return jsonb_build_object(
    'post_id', v_post.id,
    'status', v_post.post_status,
    'version', v_post.version
  );
end;
$$;

revoke all on function public.mutate_community_post(text, uuid, integer, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.mutate_community_post(text, uuid, integer, jsonb)
  to authenticated;

create function public.mutate_community_comment(
  p_operation text,
  p_post_id uuid default null,
  p_comment_id uuid default null,
  p_expected_version integer default null,
  p_body text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := private.community_assert_active_actor();
  v_comment public.community_comments%rowtype;
  v_body text := nullif(pg_catalog.btrim(p_body), '');
begin
  if p_operation not in ('create', 'update', 'remove') then
    raise exception '지원하지 않는 댓글 작업입니다.';
  end if;

  if p_operation in ('create', 'update')
     and (v_body is null or pg_catalog.char_length(v_body) not between 1 and 2000) then
    raise exception '댓글은 1~2000자로 입력해 주세요.';
  end if;

  if p_operation = 'create' then
    if p_post_id is null or p_comment_id is not null or p_expected_version is not null then
      raise exception '댓글을 작성할 게시글을 확인해 주세요.';
    end if;

    perform 1
    from public.community_posts as post
    where post.id = p_post_id
      and post.post_status = 'published'
    for share;
    if not found then
      raise exception '게시글을 찾을 수 없습니다.';
    end if;

    insert into public.community_comments (post_id, author_user_id, body)
    values (p_post_id, v_actor_id, v_body)
    returning * into v_comment;
  else
    if p_comment_id is null or p_expected_version is null or p_expected_version < 1 then
      raise exception '댓글 식별자와 현재 version이 필요합니다.';
    end if;

    select comment.*
    into v_comment
    from public.community_comments as comment
    where comment.id = p_comment_id
      and comment.removed_at is null
    for update;

    if not found then
      raise exception '댓글을 찾을 수 없습니다.';
    end if;
    if v_comment.author_user_id <> v_actor_id then
      raise exception '본인의 댓글만 변경할 수 있습니다.';
    end if;
    if v_comment.version <> p_expected_version then
      raise exception '다른 변경이 있었습니다. 새로고침 후 다시 확인해 주세요.';
    end if;

    perform 1
    from public.community_posts as post
    where post.id = v_comment.post_id
      and post.post_status = 'published'
    for share;
    if not found then
      raise exception '게시글을 찾을 수 없습니다.';
    end if;

    if p_operation = 'update' then
      update public.community_comments as comment
      set
        body = v_body,
        version = comment.version + 1,
        updated_at = now()
      where comment.id = v_comment.id
      returning * into v_comment;
    else
      update public.community_comments as comment
      set
        removed_at = now(),
        version = comment.version + 1,
        updated_at = now()
      where comment.id = v_comment.id
      returning * into v_comment;
    end if;
  end if;

  return jsonb_build_object(
    'comment_id', v_comment.id,
    'post_id', v_comment.post_id,
    'version', v_comment.version,
    'removed', v_comment.removed_at is not null
  );
end;
$$;

revoke all on function public.mutate_community_comment(text, uuid, uuid, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.mutate_community_comment(text, uuid, uuid, integer, text)
  to authenticated;

comment on table public.community_posts is
  'PUL 커뮤니티 공개 게시글과 질문·후기·분실습득 최소 metadata.';
comment on table public.community_comments is
  'PUL 커뮤니티 게시글의 단일 단계 댓글과 질문 답변.';
comment on function public.list_community_posts(text, text, text, integer, integer) is
  '공개 게시글을 서버 필터·정렬·pagination으로 조회한다.';
comment on function public.get_community_post(uuid) is
  '공개 게시글 상세를 개인정보 최소화 형태로 조회한다.';
comment on function public.list_community_comments(uuid, integer, integer) is
  '공개 게시글의 삭제되지 않은 댓글을 조회한다.';
comment on function public.mutate_community_post(text, uuid, integer, jsonb) is
  'active 회원의 게시글 작성과 작성자 전용 수정·삭제·상태 변경을 처리한다.';
comment on function public.mutate_community_comment(text, uuid, uuid, integer, text) is
  'active 회원의 댓글 작성과 작성자 전용 수정·삭제를 처리한다.';
