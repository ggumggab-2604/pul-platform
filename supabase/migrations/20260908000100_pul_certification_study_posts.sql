-- PUL 8-29: lightweight certification study discussion posts.

create table public.certification_study_posts (
  id uuid primary key default gen_random_uuid(),
  post_key text not null unique default pg_catalog.encode(extensions.gen_random_bytes(16), 'hex'),
  author_user_id uuid not null references public.user_accounts (id),
  body text not null,
  post_status text not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz,
  constraint certification_study_posts_key_check
    check (post_key ~ '^[0-9a-f]{32}$'),
  constraint certification_study_posts_body_check
    check (
      body = pg_catalog.btrim(body)
      and pg_catalog.char_length(body) between 10 and 1000
    ),
  constraint certification_study_posts_status_check
    check (post_status in ('published', 'removed')),
  constraint certification_study_posts_removed_check
    check ((post_status = 'removed') = (removed_at is not null))
);

create index certification_study_posts_public_page_idx
  on public.certification_study_posts (created_at desc, id desc)
  where post_status = 'published';

create index certification_study_posts_author_idx
  on public.certification_study_posts (author_user_id, created_at desc, id desc);

create trigger certification_study_posts_set_updated_at
before update on public.certification_study_posts
for each row execute function public.set_user_foundation_updated_at();

alter table public.certification_study_posts enable row level security;
alter table public.certification_study_posts force row level security;

revoke all on table public.certification_study_posts
  from public, anon, authenticated, service_role;

create function public.list_public_certification_study_posts(
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
  v_total integer;
  v_items jsonb;
begin
  if p_limit is null or p_limit not between 1 and 24
     or p_offset is null or p_offset < 0 then
    raise exception '시험 준비 게시판 페이지 범위를 확인해 주세요.';
  end if;

  select pg_catalog.count(*)::integer
  into v_total
  from public.certification_study_posts as post
  where post.post_status = 'published';

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
    from public.certification_study_posts as post
    where post.post_status = 'published'
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

revoke all on function public.list_public_certification_study_posts(integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_public_certification_study_posts(integer, integer)
  to anon, authenticated;

create function public.submit_certification_study_post(p_body text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := private.community_assert_active_actor();
  v_body text := nullif(pg_catalog.btrim(p_body), '');
  v_post public.certification_study_posts%rowtype;
begin
  if v_body is null or pg_catalog.char_length(v_body) not between 10 and 1000 then
    raise exception '시험 준비 이야기 내용은 10~1000자로 입력해 주세요.';
  end if;

  insert into public.certification_study_posts (
    author_user_id,
    body
  ) values (
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

revoke all on function public.submit_certification_study_post(text)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_certification_study_post(text)
  to authenticated;

comment on table public.certification_study_posts is
  'Active members lightweight public certification exam preparation discussion posts.';
comment on function public.list_public_certification_study_posts(integer, integer) is
  'Lists published certification study posts without internal UUIDs or private profile data.';
comment on function public.submit_certification_study_post(text) is
  'Publishes a trimmed 10-1000 character certification study post for an active authenticated member.';
