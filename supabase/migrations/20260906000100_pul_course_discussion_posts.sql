-- PUL 8-26: lightweight per-course member discussion posts.

create table public.course_discussion_posts (
  id uuid primary key default gen_random_uuid(),
  post_key text not null unique default pg_catalog.encode(extensions.gen_random_bytes(16), 'hex'),
  course_id uuid not null references public.courses (id),
  author_user_id uuid not null references public.user_accounts (id),
  body text not null,
  post_status text not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz,
  constraint course_discussion_posts_key_check
    check (post_key ~ '^[0-9a-f]{32}$'),
  constraint course_discussion_posts_body_check
    check (
      body = pg_catalog.btrim(body)
      and pg_catalog.char_length(body) between 10 and 1000
    ),
  constraint course_discussion_posts_status_check
    check (post_status in ('published', 'removed')),
  constraint course_discussion_posts_removed_check
    check ((post_status = 'removed') = (removed_at is not null))
);

create index course_discussion_posts_public_page_idx
  on public.course_discussion_posts (course_id, created_at desc, id desc)
  where post_status = 'published';

create index course_discussion_posts_author_idx
  on public.course_discussion_posts (author_user_id, created_at desc, id desc);

create trigger course_discussion_posts_set_updated_at
before update on public.course_discussion_posts
for each row execute function public.set_user_foundation_updated_at();

alter table public.course_discussion_posts enable row level security;
alter table public.course_discussion_posts force row level security;

revoke all on table public.course_discussion_posts
  from public, anon, authenticated, service_role;

create function public.list_public_course_discussion_posts(
  p_course_key text,
  p_limit integer default 20,
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
  v_course_id uuid;
  v_total integer;
  v_items jsonb;
begin
  if p_course_key is null
     or p_course_key <> pg_catalog.btrim(p_course_key)
     or p_course_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' then
    raise exception '골프장 정보를 찾을 수 없습니다.';
  end if;
  if p_limit is null or p_limit not between 1 and 24
     or p_offset is null or p_offset < 0 then
    raise exception '이야기방 페이지 범위를 확인해 주세요.';
  end if;

  select course.id
  into v_course_id
  from public.courses as course
  where course.course_key = p_course_key
    and course.course_status = 'active';

  if not found then
    raise exception '골프장 정보를 찾을 수 없습니다.';
  end if;

  select pg_catalog.count(*)::integer
  into v_total
  from public.course_discussion_posts as post
  where post.course_id = v_course_id
    and post.post_status = 'published';

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'post_key', page.post_key,
        'body', page.body,
        'author_display_name', private.community_actor_display_name(page.author_user_id, v_viewer_id),
        'created_at', page.created_at
      )
      order by page.created_at desc, page.id desc
    ),
    '[]'::jsonb
  )
  into v_items
  from (
    select post.*
    from public.course_discussion_posts as post
    where post.course_id = v_course_id
      and post.post_status = 'published'
    order by post.created_at desc, post.id desc
    limit p_limit
    offset p_offset
  ) as page;

  return pg_catalog.jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', p_offset + pg_catalog.jsonb_array_length(v_items) < v_total
  );
end;
$$;

revoke all on function public.list_public_course_discussion_posts(text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_public_course_discussion_posts(text, integer, integer)
  to anon, authenticated;

create function public.submit_course_discussion_post(
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

  insert into public.course_discussion_posts (
    course_id,
    author_user_id,
    body
  ) values (
    v_course_id,
    v_actor_id,
    v_body
  )
  returning * into v_post;

  return pg_catalog.jsonb_build_object(
    'post_key', v_post.post_key,
    'post_status', v_post.post_status
  );
end;
$$;

revoke all on function public.submit_course_discussion_post(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_course_discussion_post(text, text)
  to authenticated;

comment on table public.course_discussion_posts is
  'Active members lightweight public discussion posts scoped to one active course.';
comment on function public.list_public_course_discussion_posts(text, integer, integer) is
  'Lists published posts for one active course without internal UUIDs or private profile data.';
comment on function public.submit_course_discussion_post(text, text) is
  'Publishes a trimmed 10-1000 character post for an active course and active authenticated member.';
