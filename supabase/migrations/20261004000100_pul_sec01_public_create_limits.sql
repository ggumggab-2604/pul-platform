-- SEC-01: four public create paths only. Existing actor/created_at indexes
-- cover the rolling-window reads, including hidden/removed content.
-- Body comparison uses current stored text, with whitespace collapsed; title,
-- category, course and parent changes do not reset a scope's allowance.
-- No new content copies, counters, tables, indexes or account penalties.

create function private.check_public_create_limit(p_scope text, p_body text)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz;
  v_since timestamptz;
  v_body text := pg_catalog.btrim(pg_catalog.regexp_replace(p_body, '[[:space:]]+', ' ', 'g'));
  v_count bigint;
  v_latest timestamptz;
  v_duplicate boolean;
  v_cooldown interval;
  v_max_count integer;
begin
  if v_actor is null or not exists (
    select 1 from public.user_accounts where id = v_actor and account_status = 'active'
  ) then
    raise exception '정상 활동 계정만 작성할 수 있습니다.' using errcode = '42501';
  end if;
  if p_scope is null or p_scope not in (
    'community_post', 'community_comment', 'course_discussion', 'certification_study'
  ) or v_body is null or v_body = '' then
    raise exception '작성 요청을 확인해 주세요.' using errcode = '22023';
  end if;
  -- The post-lock query needs a fresh snapshot. PostgREST uses READ COMMITTED;
  -- fail closed for callers that choose a snapshot fixed before the lock.
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception '작성 요청을 다시 시도해 주세요.' using errcode = '40001';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pul.sec01:' || p_scope || ':' || v_actor::text, 0)
  );
  -- Take wall-clock time AFTER waiting; callers also use this for created_at.
  v_now := pg_catalog.clock_timestamp();
  v_since := v_now - interval '10 minutes';
  v_cooldown := case when p_scope = 'community_comment' then interval '3 seconds' else interval '20 seconds' end;
  v_max_count := case when p_scope = 'community_comment' then 30 else 5 end;

  case p_scope
    when 'community_post' then
      select count(*), max(created_at), bool_or(
        pg_catalog.btrim(pg_catalog.regexp_replace(body, '[[:space:]]+', ' ', 'g')) = v_body
      ) into v_count, v_latest, v_duplicate
      from public.community_posts where author_user_id = v_actor and created_at > v_since;
    when 'community_comment' then
      select count(*), max(created_at), bool_or(
        pg_catalog.btrim(pg_catalog.regexp_replace(body, '[[:space:]]+', ' ', 'g')) = v_body
      ) into v_count, v_latest, v_duplicate
      from public.community_comments where author_user_id = v_actor and created_at > v_since;
    when 'course_discussion' then
      select count(*), max(created_at), bool_or(
        pg_catalog.btrim(pg_catalog.regexp_replace(body, '[[:space:]]+', ' ', 'g')) = v_body
      ) into v_count, v_latest, v_duplicate
      from public.course_discussion_posts where author_user_id = v_actor and created_at > v_since;
    when 'certification_study' then
      select count(*), max(created_at), bool_or(
        pg_catalog.btrim(pg_catalog.regexp_replace(body, '[[:space:]]+', ' ', 'g')) = v_body
      ) into v_count, v_latest, v_duplicate
      from public.certification_study_posts where author_user_id = v_actor and created_at > v_since;
  end case;

  -- Stable machine messages, no account/content/window details in responses.
  if v_duplicate then
    raise exception 'PUL_CREATE_DUPLICATE' using errcode = 'P0001';
  end if;
  if v_latest > v_now - v_cooldown then
    raise exception 'PUL_CREATE_COOLDOWN' using errcode = 'P0001';
  end if;
  if v_count >= v_max_count then
    raise exception 'PUL_CREATE_QUOTA' using errcode = 'P0001';
  end if;
  return v_now;
end;
$$;

revoke all on function private.check_public_create_limit(text, text)
  from public, anon, authenticated, service_role;

create or replace function public.mutate_community_post(
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
  v_created_at timestamptz;
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

    v_created_at := private.check_public_create_limit('community_post', v_body);

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
      lost_found_status,
      created_at,
      updated_at
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
      v_lost_found_status,
      v_created_at,
      v_created_at
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

create or replace function public.mutate_community_comment(
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
  v_created_at timestamptz;
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

    v_created_at := private.check_public_create_limit('community_comment', v_body);

    insert into public.community_comments (post_id, author_user_id, body, created_at, updated_at)
    values (p_post_id, v_actor_id, v_body, v_created_at, v_created_at)
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

create or replace function public.submit_course_discussion_post(
  p_course_key text,
  p_body text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_created_at timestamptz;
  v_actor_id uuid := private.community_assert_active_actor();
  v_course_id uuid;
  v_body text := nullif(pg_catalog.btrim(p_body), '');
  v_post public.course_discussion_posts%rowtype;
begin
  if p_course_key is null
     or p_course_key <> pg_catalog.btrim(p_course_key)
     or p_course_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' then
    raise exception '골프장 정보를 찾을 수 없습니다.';
  end if;
  if v_body is null or pg_catalog.char_length(v_body) not between 10 and 1000 then
    raise exception '이야기 내용은 10~1000자로 입력해 주세요.';
  end if;

  select course.id
  into v_course_id
  from public.courses as course
  where course.course_key = p_course_key
    and course.course_status = 'active'
  for share;

  if not found then
    raise exception '골프장 정보를 찾을 수 없습니다.';
  end if;

  v_created_at := private.check_public_create_limit('course_discussion', v_body);

  insert into public.course_discussion_posts (
    course_id,
    author_user_id,
    body,
    created_at,
    updated_at
  ) values (
    v_course_id,
    v_actor_id,
    v_body,
    v_created_at,
    v_created_at
  )
  returning * into v_post;

  return pg_catalog.jsonb_build_object(
    'post_key', v_post.post_key,
    'post_status', v_post.post_status
  );
end;
$$;

create or replace function public.submit_certification_study_post(p_body text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_created_at timestamptz;
  v_actor_id uuid := private.community_assert_active_actor();
  v_body text := nullif(pg_catalog.btrim(p_body), '');
  v_post public.certification_study_posts%rowtype;
begin
  if v_body is null or pg_catalog.char_length(v_body) not between 10 and 1000 then
    raise exception '시험 준비 이야기 내용은 10~1000자로 입력해 주세요.';
  end if;

  v_created_at := private.check_public_create_limit('certification_study', v_body);

  insert into public.certification_study_posts (
    author_user_id,
    body,
    created_at,
    updated_at
  ) values (
    v_actor_id,
    v_body,
    v_created_at,
    v_created_at
  )
  returning * into v_post;

  return pg_catalog.jsonb_build_object(
    'post_key', v_post.post_key,
    'post_status', v_post.post_status
  );
end;
$$;

-- CREATE OR REPLACE preserves the existing authenticated-only EXECUTE ACLs.
