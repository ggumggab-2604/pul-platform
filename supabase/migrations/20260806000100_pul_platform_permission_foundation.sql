-- PUL 8-6-B-1: explicit platform permissions for Hall of Fame review work.
-- Hall of Fame business mutations are intentionally deferred to 8-6-B-2.

create table public.platform_permission_definitions (
  code text primary key,
  description text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint platform_permission_definitions_code_check
    check (
      code = pg_catalog.btrim(code)
      and code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'
    ),
  constraint platform_permission_definitions_description_check
    check (
      description = pg_catalog.btrim(description)
      and description <> ''
      and pg_catalog.char_length(description) <= 500
    )
);

comment on table public.platform_permission_definitions is
  'Explicit platform-scoped functional permission catalog; role names do not imply permissions.';

create table public.platform_role_permissions (
  platform_role text not null,
  permission_code text not null
    references public.platform_permission_definitions (code) on delete cascade,
  created_at timestamptz not null default pg_catalog.now(),
  constraint platform_role_permissions_pkey
    primary key (platform_role, permission_code),
  constraint platform_role_permissions_role_check
    check (platform_role in ('platform_moderator', 'platform_admin'))
);

comment on table public.platform_role_permissions is
  'Explicit allow-only mappings from platform roles to active platform permissions.';

insert into public.platform_permission_definitions (
  code,
  description,
  is_active
)
values
  (
    'hall_of_fame.applications.read',
    '명예의 전당 신청 목록과 상세를 조회합니다.',
    true
  ),
  (
    'hall_of_fame.applications.review',
    '명예의 전당 신청과 증빙을 검토합니다.',
    true
  ),
  (
    'hall_of_fame.applications.request_additional_info',
    '명예의 전당 신청자 또는 추천자에게 추가 자료를 요청합니다.',
    true
  ),
  (
    'hall_of_fame.applications.decide',
    '명예의 전당 신청의 최종 승인 또는 반려를 결정합니다.',
    true
  ),
  (
    'hall_of_fame.evidence.read',
    '권한이 확인된 명예의 전당 private 증빙을 열람합니다.',
    true
  ),
  (
    'hall_of_fame.records.correct',
    '승인된 명예의 전당 공식 기록을 정정합니다.',
    true
  ),
  (
    'hall_of_fame.records.revoke',
    '승인된 명예의 전당 공식 기록을 취소합니다.',
    true
  );

insert into public.platform_role_permissions (
  platform_role,
  permission_code
)
values
  (
    'platform_moderator',
    'hall_of_fame.applications.read'
  ),
  (
    'platform_moderator',
    'hall_of_fame.applications.review'
  ),
  (
    'platform_moderator',
    'hall_of_fame.applications.request_additional_info'
  ),
  (
    'platform_moderator',
    'hall_of_fame.evidence.read'
  ),
  (
    'platform_admin',
    'hall_of_fame.applications.read'
  ),
  (
    'platform_admin',
    'hall_of_fame.applications.review'
  ),
  (
    'platform_admin',
    'hall_of_fame.applications.request_additional_info'
  ),
  (
    'platform_admin',
    'hall_of_fame.applications.decide'
  ),
  (
    'platform_admin',
    'hall_of_fame.evidence.read'
  ),
  (
    'platform_admin',
    'hall_of_fame.records.correct'
  ),
  (
    'platform_admin',
    'hall_of_fame.records.revoke'
  );

do $$
begin
  if (
    select pg_catalog.count(*)
    from public.platform_permission_definitions as permission
    where permission.code like 'hall_of_fame.%'
      and permission.is_active
  ) <> 7 then
    raise exception '명예의 전당 플랫폼 권한 정의가 승인된 상태와 일치하지 않습니다.';
  end if;

  if (
    select pg_catalog.count(*)
    from public.platform_role_permissions as mapping
    where mapping.platform_role = 'platform_moderator'
  ) <> 4 then
    raise exception '플랫폼 운영 지원 권한 연결이 승인된 상태와 일치하지 않습니다.';
  end if;

  if (
    select pg_catalog.count(*)
    from public.platform_role_permissions as mapping
    where mapping.platform_role = 'platform_admin'
  ) <> 7 then
    raise exception '플랫폼 관리자 권한 연결이 승인된 상태와 일치하지 않습니다.';
  end if;

  if exists (
    select 1
    from public.platform_role_permissions as mapping
    where mapping.platform_role = 'platform_moderator'
      and mapping.permission_code in (
        'hall_of_fame.applications.decide',
        'hall_of_fame.records.correct',
        'hall_of_fame.records.revoke'
      )
  ) then
    raise exception '플랫폼 운영 지원 역할에 최종 결정 권한이 연결되어 있습니다.';
  end if;
end;
$$;

create trigger platform_permission_definitions_set_updated_at
before update on public.platform_permission_definitions
for each row execute function public.set_user_foundation_updated_at();

alter table public.platform_permission_definitions enable row level security;
alter table public.platform_permission_definitions force row level security;
alter table public.platform_role_permissions enable row level security;
alter table public.platform_role_permissions force row level security;

revoke all on table public.platform_permission_definitions
  from public, anon, authenticated, service_role;
revoke all on table public.platform_role_permissions
  from public, anon, authenticated, service_role;

create function public.current_user_has_platform_permission(
  p_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_permission_code is not null
    and exists (
      select 1
      from public.user_accounts as account
      join public.platform_role_permissions as mapping
        on mapping.platform_role = account.platform_role
      join public.platform_permission_definitions as permission
        on permission.code = mapping.permission_code
       and permission.is_active
      where account.id = auth.uid()
        and account.account_status = 'active'
        and mapping.permission_code = p_permission_code
    ),
    false
  );
$$;

comment on function public.current_user_has_platform_permission(text) is
  'Authenticated boolean-only platform permission check bound to auth.uid() and an active account.';

revoke all on function public.current_user_has_platform_permission(text)
  from public, anon, authenticated, service_role;
grant execute on function public.current_user_has_platform_permission(text)
  to authenticated;
