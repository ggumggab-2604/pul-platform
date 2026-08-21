create table public.lesson_information_reports (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  report_key text not null default pg_catalog.encode(extensions.gen_random_bytes(16), 'hex'),
  lesson_id uuid not null references public.lessons (id),
  reporter_user_id uuid not null references public.user_accounts (id),
  report_type text not null,
  report_body text not null,
  report_status text not null default 'pending',
  created_at timestamptz not null default pg_catalog.now(),
  resolved_at timestamptz,
  resolved_by uuid references public.user_accounts (id),
  constraint lesson_information_reports_report_key_uidx unique (report_key),
  constraint lesson_information_reports_report_key_check check (
    report_key ~ '^[0-9a-f]{32}$'
  ),
  constraint lesson_information_reports_type_check check (
    report_type in (
      'incorrect_information',
      'operation_changed',
      'inappropriate_content',
      'other'
    )
  ),
  constraint lesson_information_reports_body_check check (
    report_body = pg_catalog.btrim(report_body)
    and pg_catalog.char_length(report_body) between 10 and 3000
  ),
  constraint lesson_information_reports_status_check check (
    report_status in ('pending', 'resolved', 'dismissed')
  ),
  constraint lesson_information_reports_resolution_check check (
    (
      report_status = 'pending'
      and resolved_at is null
      and resolved_by is null
    )
    or (
      report_status in ('resolved', 'dismissed')
      and resolved_at is not null
      and resolved_by is not null
    )
  )
);

comment on table public.lesson_information_reports is
  'Private active-member information reports for published general lessons, with simple operator resolution.';

create index lesson_information_reports_status_created_idx
  on public.lesson_information_reports (report_status, created_at desc, report_key);

alter table public.lesson_information_reports enable row level security;
alter table public.lesson_information_reports force row level security;

revoke all on table public.lesson_information_reports
  from public, anon, authenticated, service_role;

create function public.submit_lesson_information_report(
  p_lesson_key text,
  p_report_type text,
  p_report_body text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_account_status text;
  v_lesson_id uuid;
  v_lesson_key text := nullif(pg_catalog.btrim(p_lesson_key), '');
  v_body text := nullif(pg_catalog.btrim(p_report_body), '');
  v_report public.lesson_information_reports%rowtype;
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
    raise exception '정상 활동 계정만 레슨 정보를 제보할 수 있습니다.';
  end if;

  if v_lesson_key is null
     or v_lesson_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' then
    raise exception '제보할 레슨 정보를 확인해 주세요.';
  end if;
  if p_report_type is null or p_report_type not in (
    'incorrect_information',
    'operation_changed',
    'inappropriate_content',
    'other'
  ) then
    raise exception '신고 유형을 확인해 주세요.';
  end if;
  if v_body is null or pg_catalog.char_length(v_body) not between 10 and 3000 then
    raise exception '제보 내용은 10~3000자로 입력해 주세요.';
  end if;

  select lesson.id
  into v_lesson_id
  from public.lessons as lesson
  where lesson.lesson_key = v_lesson_key
    and lesson.publication_status = 'published'
    and lesson.lesson_type in ('beginner', 'improvement', 'group', 'online')
  for share;

  if not found then
    raise exception '현재 제보할 수 있는 공개 레슨을 찾을 수 없습니다.';
  end if;

  insert into public.lesson_information_reports (
    lesson_id,
    reporter_user_id,
    report_type,
    report_body
  ) values (
    v_lesson_id,
    v_actor_id,
    p_report_type,
    v_body
  )
  returning * into v_report;

  return pg_catalog.jsonb_build_object(
    'report_key', v_report.report_key,
    'report_status', v_report.report_status
  );
end;
$$;

comment on function public.submit_lesson_information_report(text, text, text) is
  'Active authenticated member submission for a published general lesson, using public lesson_key and returning no internal UUID.';

revoke all on function public.submit_lesson_information_report(text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_lesson_information_report(text, text, text)
  to authenticated;

create function public.list_lesson_information_reports_for_management(
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
  perform private.require_lesson_directory_manager();

  if p_status is not null and p_status not in ('pending', 'resolved', 'dismissed') then
    raise exception '제보 상태를 확인해 주세요.';
  end if;
  if p_limit not between 1 and 50 or p_offset < 0 then
    raise exception '페이지 범위를 확인해 주세요.';
  end if;

  select pg_catalog.count(*)::integer
  into v_total
  from public.lesson_information_reports as report
  where p_status is null or report.report_status = p_status;

  with page as (
    select report.*
    from public.lesson_information_reports as report
    where p_status is null or report.report_status = p_status
    order by report.created_at desc, report.report_key
    limit p_limit
    offset p_offset
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'report_key', page.report_key,
        'report_type', page.report_type,
        'report_body', page.report_body,
        'report_status', page.report_status,
        'lesson_key', lesson.lesson_key,
        'lesson_title', lesson.title,
        'province', lesson.province,
        'district', lesson.district,
        'location', lesson.location,
        'organizer_name', lesson.organizer_name,
        'created_at', page.created_at,
        'resolved_at', page.resolved_at
      ) order by page.created_at desc, page.report_key
    ),
    '[]'::jsonb
  )
  into v_items
  from page
  join public.lessons as lesson on lesson.id = page.lesson_id;

  return pg_catalog.jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', p_offset + pg_catalog.jsonb_array_length(v_items) < v_total
  );
end;
$$;

comment on function public.list_lesson_information_reports_for_management(text, integer, integer) is
  'Active lessons.manage operator-only bounded report list without reporter or internal UUID fields.';

revoke all on function public.list_lesson_information_reports_for_management(text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_lesson_information_reports_for_management(text, integer, integer)
  to authenticated;

create function public.resolve_lesson_information_report(
  p_report_key text,
  p_resolution text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_report_key text := nullif(pg_catalog.btrim(p_report_key), '');
  v_report public.lesson_information_reports%rowtype;
begin
  v_actor_id := private.require_lesson_directory_manager();

  if v_report_key is null or v_report_key !~ '^[0-9a-f]{32}$' then
    raise exception '처리할 제보를 확인해 주세요.';
  end if;
  if p_resolution is null or p_resolution not in ('resolved', 'dismissed') then
    raise exception '처리 결과를 확인해 주세요.';
  end if;

  select report.*
  into v_report
  from public.lesson_information_reports as report
  where report.report_key = v_report_key
  for update;

  if not found then
    raise exception '처리할 제보를 찾을 수 없습니다.';
  end if;
  if v_report.report_status <> 'pending' then
    raise exception '이미 처리된 레슨 정보 제보입니다.';
  end if;

  update public.lesson_information_reports as report
  set report_status = p_resolution,
      resolved_at = pg_catalog.now(),
      resolved_by = v_actor_id
  where report.id = v_report.id
    and report.report_status = 'pending'
  returning * into v_report;

  if not found then
    raise exception '레슨 정보 제보 처리 상태가 변경되었습니다.';
  end if;

  return pg_catalog.jsonb_build_object(
    'report_key', v_report.report_key,
    'report_status', v_report.report_status,
    'resolved_at', v_report.resolved_at
  );
end;
$$;

comment on function public.resolve_lesson_information_report(text, text) is
  'Active lessons.manage operator-only terminal report acknowledgement without automatic lesson mutation.';

revoke all on function public.resolve_lesson_information_report(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_lesson_information_report(text, text)
  to authenticated;
