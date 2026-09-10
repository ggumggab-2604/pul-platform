-- Community-only beta intake. Existing content uses soft deletion; retain its FK links.
create table public.community_reports (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  reporter_user_id uuid not null references public.user_accounts(id),
  post_id uuid not null references public.community_posts(id),
  comment_id uuid references public.community_comments(id),
  reason text not null check (reason in ('spam', 'harassment', 'inappropriate', 'fraud', 'other')),
  detail text not null default '' check (detail = pg_catalog.btrim(detail) and pg_catalog.char_length(detail) <= 1000),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default pg_catalog.now(),
  resolved_at timestamptz,
  resolved_by uuid references public.user_accounts(id),
  constraint community_reports_resolution_check check (
    (status = 'open' and resolved_at is null and resolved_by is null)
    or (status = 'resolved' and resolved_at is not null and resolved_by is not null)
  )
);

create unique index community_reports_open_post_uidx
  on public.community_reports (reporter_user_id, post_id)
  where status = 'open' and comment_id is null;
create unique index community_reports_open_comment_uidx
  on public.community_reports (reporter_user_id, comment_id)
  where status = 'open' and comment_id is not null;
create index community_reports_status_created_idx
  on public.community_reports (status, created_at desc, id desc);

alter table public.community_reports enable row level security;
alter table public.community_reports force row level security;
-- No direct client access, including own-report listing. RPCs expose only necessary fields.
revoke all on table public.community_reports from public, anon, authenticated, service_role;

insert into public.platform_permission_definitions (code, description)
values ('community.reports.manage', '커뮤니티 게시글·댓글 신고를 확인하고 처리합니다.');
insert into public.platform_role_permissions (platform_role, permission_code)
values ('platform_admin', 'community.reports.manage');

create function private.community_assert_report_manager()
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := private.community_assert_active_actor();
begin
  if not public.current_user_has_platform_permission('community.reports.manage') then
    raise exception 'community_report_permission' using errcode = '42501';
  end if;
  return v_actor;
end;
$$;

create function public.submit_community_report(
  p_target_type text, p_target_id uuid, p_reason text, p_detail text default ''
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := private.community_assert_active_actor();
  v_post_id uuid;
  v_author uuid;
  v_report_id uuid;
begin
  if p_target_type is null or p_target_type not in ('post', 'comment')
    or p_target_id is null or p_reason is null
    or p_reason not in ('spam', 'harassment', 'inappropriate', 'fraud', 'other')
    or pg_catalog.char_length(pg_catalog.btrim(coalesce(p_detail, ''))) > 1000 then
    raise exception 'community_report_invalid' using errcode = '22023';
  end if;

  if p_target_type = 'post' then
    v_post_id := p_target_id;
  else
    select c.post_id into v_post_id from public.community_comments c where c.id = p_target_id;
  end if;
  -- Lock parent before comment, matching the existing content mutation order.
  select p.author_user_id into v_author from public.community_posts p
  where p.id = v_post_id and p.post_status = 'published' for share;
  if not found then
    raise exception 'community_report_target_unavailable' using errcode = 'P0002';
  end if;
  if p_target_type = 'comment' then
    select c.author_user_id into v_author from public.community_comments c
    where c.id = p_target_id and c.post_id = v_post_id and c.removed_at is null for share;
    if not found then
      raise exception 'community_report_target_unavailable' using errcode = 'P0002';
    end if;
  end if;
  if v_author = v_actor then
    raise exception 'community_report_self' using errcode = '22023';
  end if;

  insert into public.community_reports (reporter_user_id, post_id, comment_id, reason, detail)
  values (v_actor, v_post_id, case when p_target_type = 'comment' then p_target_id end,
    p_reason, pg_catalog.btrim(coalesce(p_detail, '')))
  on conflict do nothing returning id into v_report_id;
  return pg_catalog.jsonb_build_object('duplicate', v_report_id is null);
end;
$$;

create function public.list_community_reports(
  p_status text default 'open', p_limit integer default 20, p_offset integer default 0
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_items jsonb;
  v_total bigint;
begin
  perform private.community_assert_report_manager();
  if p_status is null or p_status not in ('open', 'resolved', 'all')
    or p_limit is null or p_limit < 1 or p_limit > 50
    or p_offset is null or p_offset < 0 then
    raise exception 'community_report_invalid' using errcode = '22023';
  end if;
  -- One snapshot for count and rows. Content is visible to authorized operators after soft deletion.
  with filtered as (
    select r.* from public.community_reports r where p_status = 'all' or r.status = p_status
  ), page as (
    select r.* from filtered r order by r.created_at desc, r.id desc limit p_limit offset p_offset
  )
  select (select pg_catalog.count(*) from filtered), coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id', r.id, 'target_type', case when r.comment_id is null then 'post' else 'comment' end,
      'post_id', r.post_id, 'comment_id', r.comment_id,
      'title', p.title, 'body', case when r.comment_id is null then p.body else c.body end,
      'target_state', case when p.post_status <> 'published' then p.post_status
        when r.comment_id is not null and c.removed_at is not null then 'removed' else 'published' end,
      'reason', r.reason, 'detail', r.detail, 'status', r.status,
      'created_at', r.created_at, 'resolved_at', r.resolved_at
    ) order by r.created_at desc, r.id desc
  ), '[]'::jsonb) into v_total, v_items
  from page r join public.community_posts p on p.id = r.post_id
  left join public.community_comments c on c.id = r.comment_id;
  return pg_catalog.jsonb_build_object('items', v_items, 'total', v_total,
    'has_more', p_offset + pg_catalog.jsonb_array_length(v_items) < v_total);
end;
$$;

create function public.resolve_community_report(p_report_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := private.community_assert_report_manager();
  v_report public.community_reports%rowtype;
begin
  select r.* into v_report from public.community_reports r where r.id = p_report_id for update;
  if not found then
    raise exception 'community_report_missing' using errcode = 'P0002';
  end if;
  if v_report.status = 'open' then
    update public.community_reports set status = 'resolved', resolved_at = pg_catalog.now(), resolved_by = v_actor
    where id = p_report_id;
  end if;
  return pg_catalog.jsonb_build_object('id', p_report_id, 'status', 'resolved');
end;
$$;

revoke all on function private.community_assert_report_manager() from public, anon, authenticated, service_role;
revoke all on function public.submit_community_report(text, uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.list_community_reports(text, integer, integer) from public, anon, authenticated, service_role;
revoke all on function public.resolve_community_report(uuid) from public, anon, authenticated, service_role;
grant execute on function public.submit_community_report(text, uuid, text, text) to authenticated;
grant execute on function public.list_community_reports(text, integer, integer) to authenticated;
grant execute on function public.resolve_community_report(uuid) to authenticated;
