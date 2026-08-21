create table public.news_inquiries (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  inquiry_key text not null default pg_catalog.encode(extensions.gen_random_bytes(16), 'hex'),
  requester_user_id uuid not null references public.user_accounts (id),
  inquiry_type text not null,
  inquiry_body text not null,
  inquiry_status text not null default 'pending',
  created_at timestamptz not null default pg_catalog.now(),
  resolved_at timestamptz,
  resolved_by uuid references public.user_accounts (id),
  constraint news_inquiries_inquiry_key_uidx unique (inquiry_key),
  constraint news_inquiries_inquiry_key_check check (
    inquiry_key ~ '^[0-9a-f]{32}$'
  ),
  constraint news_inquiries_type_check check (
    inquiry_type in ('news_report', 'promotion_inquiry')
  ),
  constraint news_inquiries_body_check check (
    inquiry_body = pg_catalog.btrim(inquiry_body)
    and pg_catalog.char_length(inquiry_body) between 10 and 3000
  ),
  constraint news_inquiries_status_check check (
    inquiry_status in ('pending', 'resolved', 'dismissed')
  ),
  constraint news_inquiries_resolution_check check (
    (
      inquiry_status = 'pending'
      and resolved_at is null
      and resolved_by is null
    )
    or (
      inquiry_status in ('resolved', 'dismissed')
      and resolved_at is not null
      and resolved_by is not null
    )
  )
);

comment on table public.news_inquiries is
  'Private active-member news reports and promotion inquiries with simple news operator resolution.';

create index news_inquiries_status_created_idx
  on public.news_inquiries (inquiry_status, created_at desc, inquiry_key);

alter table public.news_inquiries enable row level security;
alter table public.news_inquiries force row level security;

revoke all on table public.news_inquiries
  from public, anon, authenticated, service_role;

create function public.submit_news_inquiry(
  p_inquiry_type text,
  p_inquiry_body text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_account_status text;
  v_body text := nullif(pg_catalog.btrim(p_inquiry_body), '');
  v_inquiry public.news_inquiries%rowtype;
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
    raise exception '정상 활동 계정만 뉴스 제보와 홍보 문의를 접수할 수 있습니다.';
  end if;

  if p_inquiry_type is null
     or p_inquiry_type not in ('news_report', 'promotion_inquiry') then
    raise exception '문의 유형을 확인해 주세요.';
  end if;
  if v_body is null or pg_catalog.char_length(v_body) not between 10 and 3000 then
    raise exception '접수 내용은 10~3000자로 입력해 주세요.';
  end if;

  insert into public.news_inquiries (
    requester_user_id,
    inquiry_type,
    inquiry_body
  ) values (
    v_actor_id,
    p_inquiry_type,
    v_body
  )
  returning * into v_inquiry;

  return pg_catalog.jsonb_build_object(
    'inquiry_key', v_inquiry.inquiry_key,
    'inquiry_status', v_inquiry.inquiry_status
  );
end;
$$;

comment on function public.submit_news_inquiry(text, text) is
  'Active authenticated member submission for a news report or promotion inquiry without exposing internal UUIDs.';

revoke all on function public.submit_news_inquiry(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_news_inquiry(text, text)
  to authenticated;

create function public.list_news_inquiries_for_management(
  p_status text default 'pending',
  p_limit integer default 30,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer;
  v_items jsonb;
begin
  perform private.require_news_directory_manager();

  if p_status is not null and p_status not in ('pending', 'resolved', 'dismissed') then
    raise exception '문의 상태를 확인해 주세요.';
  end if;
  if p_limit not between 1 and 50 or p_offset < 0 then
    raise exception '페이지 범위를 확인해 주세요.';
  end if;

  select pg_catalog.count(*)::integer
  into v_total
  from public.news_inquiries as inquiry
  where p_status is null or inquiry.inquiry_status = p_status;

  with page as (
    select inquiry.*
    from public.news_inquiries as inquiry
    where p_status is null or inquiry.inquiry_status = p_status
    order by inquiry.created_at desc, inquiry.inquiry_key
    limit p_limit
    offset p_offset
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'inquiry_key', page.inquiry_key,
        'inquiry_type', page.inquiry_type,
        'inquiry_body', page.inquiry_body,
        'inquiry_status', page.inquiry_status,
        'created_at', page.created_at,
        'resolved_at', page.resolved_at
      ) order by page.created_at desc, page.inquiry_key
    ),
    '[]'::jsonb
  )
  into v_items
  from page;

  return pg_catalog.jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', p_offset + pg_catalog.jsonb_array_length(v_items) < v_total
  );
end;
$$;

comment on function public.list_news_inquiries_for_management(text, integer, integer) is
  'Active news.manage operator-only bounded inquiry list without requester or internal UUID fields.';

revoke all on function public.list_news_inquiries_for_management(text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_news_inquiries_for_management(text, integer, integer)
  to authenticated;

create function public.resolve_news_inquiry(
  p_inquiry_key text,
  p_resolution text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_inquiry_key text := nullif(pg_catalog.btrim(p_inquiry_key), '');
  v_inquiry public.news_inquiries%rowtype;
begin
  v_actor_id := private.require_news_directory_manager();

  if v_inquiry_key is null or v_inquiry_key !~ '^[0-9a-f]{32}$' then
    raise exception '처리할 문의를 확인해 주세요.';
  end if;
  if p_resolution is null or p_resolution not in ('resolved', 'dismissed') then
    raise exception '처리 결과를 확인해 주세요.';
  end if;

  select inquiry.*
  into v_inquiry
  from public.news_inquiries as inquiry
  where inquiry.inquiry_key = v_inquiry_key
  for update;

  if not found then
    raise exception '처리할 문의를 찾을 수 없습니다.';
  end if;
  if v_inquiry.inquiry_status <> 'pending' then
    raise exception '이미 처리된 뉴스 제보 또는 홍보 문의입니다.';
  end if;

  update public.news_inquiries as inquiry
  set inquiry_status = p_resolution,
      resolved_at = pg_catalog.now(),
      resolved_by = v_actor_id
  where inquiry.id = v_inquiry.id
    and inquiry.inquiry_status = 'pending'
  returning * into v_inquiry;

  if not found then
    raise exception '뉴스 제보 또는 홍보 문의 처리 상태가 변경되었습니다.';
  end if;

  return pg_catalog.jsonb_build_object(
    'inquiry_key', v_inquiry.inquiry_key,
    'inquiry_status', v_inquiry.inquiry_status,
    'resolved_at', v_inquiry.resolved_at
  );
end;
$$;

comment on function public.resolve_news_inquiry(text, text) is
  'Active news.manage operator-only terminal inquiry acknowledgement without automatic news publication.';

revoke all on function public.resolve_news_inquiry(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_news_inquiry(text, text)
  to authenticated;
