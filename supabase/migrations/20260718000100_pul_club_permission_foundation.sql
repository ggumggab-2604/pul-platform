-- PUL 8-3B-2A: club-scoped functional permission definitions and role mappings.
-- Runtime authorization helpers, privileged mutations, and per-member overrides are deferred.

create table public.club_permission_definitions (
  permission_code text primary key,
  display_name text not null,
  description text,
  permission_group text not null,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint club_permission_definitions_code_check
    check (
      permission_code = btrim(permission_code)
      and permission_code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'
    ),
  constraint club_permission_definitions_display_name_check
    check (display_name = btrim(display_name) and display_name <> ''),
  constraint club_permission_definitions_description_check
    check (
      description is null
      or (description = btrim(description) and description <> '')
    ),
  constraint club_permission_definitions_group_check
    check (
      permission_group = btrim(permission_group)
      and permission_group ~ '^[a-z][a-z0-9_]*$'
    )
);

comment on table public.club_permission_definitions is
  'Extensible club-scoped functional permissions, independent of role labels and ranking.';

comment on column public.club_permission_definitions.permission_code is
  'Lowercase dot-notation identifier. New club features extend this catalog with new rows.';

create table public.club_role_permissions (
  role_code text not null
    references public.club_role_definitions (role_code) on delete cascade,
  permission_code text not null
    references public.club_permission_definitions (permission_code) on delete cascade,
  granted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint club_role_permissions_pkey
    primary key (role_code, permission_code)
);

comment on table public.club_role_permissions is
  'Explicit allow-only mappings from club roles to functional permissions; no runtime rank inheritance.';

insert into public.club_permission_definitions (
  permission_code,
  display_name,
  description,
  permission_group,
  is_system,
  is_active
)
values
  (
    'club.profile.read',
    '동호회 기본 정보 조회',
    '동호회의 공개·회원용 기본 정보를 조회합니다.',
    'profile',
    true,
    true
  ),
  (
    'club.notices.read',
    '공지사항 조회',
    '공개 범위가 허용된 동호회 공지사항을 조회합니다.',
    'notices',
    true,
    true
  ),
  (
    'club.events.read',
    '공식 일정 조회',
    '공개 범위가 허용된 동호회 공식 일정을 조회합니다.',
    'events',
    true,
    true
  ),
  (
    'club.posts.read',
    '게시글 조회',
    '공개 범위가 허용된 동호회 게시글을 조회합니다.',
    'posts',
    true,
    true
  ),
  (
    'club.media.read',
    '활동사진 조회',
    '공개 범위가 허용된 동호회 활동사진을 조회합니다.',
    'media',
    true,
    true
  ),
  (
    'club.posts.create',
    '게시글 작성',
    '동호회 게시판에 게시글을 작성합니다.',
    'posts',
    true,
    true
  ),
  (
    'club.comments.create',
    '댓글 작성',
    '동호회 게시글에 댓글을 작성합니다.',
    'posts',
    true,
    true
  ),
  (
    'club.events.join',
    '일정 참가',
    '참가 접수 중인 동호회 일정에 참가를 신청합니다.',
    'events',
    true,
    true
  ),
  (
    'club.members.read',
    '회원 최소 목록 조회',
    '동호회 운영에 필요한 최소 회원 목록을 조회합니다.',
    'members',
    true,
    true
  ),
  (
    'club.notices.create',
    '공지사항 작성',
    '동호회 공지사항을 작성합니다.',
    'notices',
    true,
    true
  ),
  (
    'club.notices.manage',
    '공지사항 관리',
    '동호회 공지사항의 게시 상태와 내용을 관리합니다.',
    'notices',
    true,
    true
  ),
  (
    'club.events.create',
    '공식 일정 작성',
    '동호회 공식 일정을 작성합니다.',
    'events',
    true,
    true
  ),
  (
    'club.events.manage',
    '공식 일정 관리',
    '동호회 공식 일정과 참가 접수 상태를 관리합니다.',
    'events',
    true,
    true
  ),
  (
    'club.posts.moderate',
    '게시글 운영',
    '동호회 게시글의 운영 상태를 검토합니다.',
    'posts',
    true,
    true
  ),
  (
    'club.media.review',
    '활동사진 검토',
    '동호회 활동사진의 확인·노출 상태를 검토합니다.',
    'media',
    true,
    true
  ),
  (
    'club.members.manage',
    '회원 상태 관리',
    '동호회 회원 관계의 상태를 관리합니다.',
    'members',
    true,
    true
  ),
  (
    'club.roles.manage',
    '역할 관리',
    '동호회 회원의 역할 배정과 해제를 관리합니다.',
    'roles',
    true,
    true
  ),
  (
    'club.settings.manage',
    '동호회 설정 관리',
    '동호회 기본 설정과 운영 정보를 관리합니다.',
    'settings',
    true,
    true
  )
on conflict (permission_code) do nothing;

-- Each role receives an explicit permission set. Runtime inheritance and ranking are not used.
insert into public.club_role_permissions (role_code, permission_code)
values
  ('club_member', 'club.profile.read'),
  ('club_member', 'club.notices.read'),
  ('club_member', 'club.events.read'),
  ('club_member', 'club.posts.read'),
  ('club_member', 'club.media.read'),
  ('club_member', 'club.posts.create'),
  ('club_member', 'club.comments.create'),
  ('club_member', 'club.events.join'),

  ('club_manager', 'club.profile.read'),
  ('club_manager', 'club.notices.read'),
  ('club_manager', 'club.events.read'),
  ('club_manager', 'club.posts.read'),
  ('club_manager', 'club.media.read'),
  ('club_manager', 'club.posts.create'),
  ('club_manager', 'club.comments.create'),
  ('club_manager', 'club.events.join'),
  ('club_manager', 'club.members.read'),
  ('club_manager', 'club.notices.create'),
  ('club_manager', 'club.notices.manage'),
  ('club_manager', 'club.events.create'),
  ('club_manager', 'club.events.manage'),
  ('club_manager', 'club.posts.moderate'),
  ('club_manager', 'club.media.review'),

  ('club_admin', 'club.profile.read'),
  ('club_admin', 'club.notices.read'),
  ('club_admin', 'club.events.read'),
  ('club_admin', 'club.posts.read'),
  ('club_admin', 'club.media.read'),
  ('club_admin', 'club.posts.create'),
  ('club_admin', 'club.comments.create'),
  ('club_admin', 'club.events.join'),
  ('club_admin', 'club.members.read'),
  ('club_admin', 'club.notices.create'),
  ('club_admin', 'club.notices.manage'),
  ('club_admin', 'club.events.create'),
  ('club_admin', 'club.events.manage'),
  ('club_admin', 'club.posts.moderate'),
  ('club_admin', 'club.media.review'),
  ('club_admin', 'club.members.manage'),
  ('club_admin', 'club.roles.manage'),
  ('club_admin', 'club.settings.manage')
on conflict (role_code, permission_code) do nothing;

alter table public.club_permission_definitions enable row level security;
alter table public.club_role_permissions enable row level security;

revoke all on table public.club_permission_definitions
  from public, anon, authenticated;
revoke all on table public.club_role_permissions
  from public, anon, authenticated;

grant select on table public.club_permission_definitions to authenticated;
grant select on table public.club_role_permissions to authenticated;

create policy "Authenticated users can read active club permission definitions"
on public.club_permission_definitions
for select
to authenticated
using (is_active);

create policy "Authenticated users can read active club role permissions"
on public.club_role_permissions
for select
to authenticated
using (
  exists (
    select 1
    from public.club_role_definitions as role_definition
    where role_definition.role_code = club_role_permissions.role_code
      and role_definition.is_active
  )
  and exists (
    select 1
    from public.club_permission_definitions as permission_definition
    where permission_definition.permission_code = club_role_permissions.permission_code
      and permission_definition.is_active
  )
);
