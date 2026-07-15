-- PUL 8-3B-1: club membership relationships and multi-role assignments.
-- Functional permissions, privileged mutations, and audit RPCs are deferred to 8-3B-2.

create table public.club_memberships (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete restrict,
  user_id uuid not null references public.user_accounts (id) on delete cascade,
  membership_status text not null default 'active',
  joined_at timestamptz not null default now(),
  suspended_at timestamptz,
  left_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_memberships_club_user_unique unique (club_id, user_id),
  constraint club_memberships_status_check
    check (membership_status in ('active', 'suspended', 'left')),
  constraint club_memberships_status_timestamps_check
    check (
      (
        membership_status = 'active'
        and suspended_at is null
        and left_at is null
      )
      or (
        membership_status = 'suspended'
        and suspended_at is not null
        and left_at is null
      )
      or (
        membership_status = 'left'
        and suspended_at is null
        and left_at is not null
      )
    )
);

comment on table public.club_memberships is
  'One current membership relationship per user and club; application workflow is stored separately.';

comment on column public.club_memberships.membership_status is
  'Relationship state only. Assigned roles do not grant permissions unless this value is active.';

create table public.club_role_definitions (
  role_code text primary key,
  display_name text not null,
  description text,
  role_rank integer not null,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint club_role_definitions_code_check
    check (
      role_code = btrim(role_code)
      and role_code ~ '^[a-z][a-z0-9_]*$'
    ),
  constraint club_role_definitions_display_name_check
    check (display_name = btrim(display_name) and display_name <> ''),
  constraint club_role_definitions_rank_check
    check (role_rank >= 0)
);

comment on table public.club_role_definitions is
  'Extensible club-scoped role labels. Role rank is not a functional permission grant.';

create table public.club_role_assignments (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null
    references public.club_memberships (id) on delete cascade,
  role_code text not null
    references public.club_role_definitions (role_code) on delete restrict,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.user_accounts (id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references public.user_accounts (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint club_role_assignments_role_code_check
    check (role_code = btrim(role_code) and role_code <> ''),
  constraint club_role_assignments_revoker_check
    check (revoked_by is null or revoked_at is not null),
  constraint club_role_assignments_revoked_at_check
    check (revoked_at is null or revoked_at >= assigned_at)
);

comment on table public.club_role_assignments is
  'Current and historical role assignments. Multiple different active roles may belong to one membership.';

create index club_memberships_user_id_idx
  on public.club_memberships (user_id);

create index club_memberships_club_status_idx
  on public.club_memberships (club_id, membership_status);

create index club_role_assignments_membership_id_idx
  on public.club_role_assignments (membership_id);

create unique index club_role_assignments_active_unique_idx
  on public.club_role_assignments (membership_id, role_code)
  where revoked_at is null;

create trigger club_memberships_set_updated_at
before update on public.club_memberships
for each row execute function public.set_user_foundation_updated_at();

-- System role definitions only. No membership or assignment rows are seeded.
insert into public.club_role_definitions (
  role_code,
  display_name,
  description,
  role_rank,
  is_system,
  is_active
)
values
  (
    'club_member',
    '일반회원',
    '동호회에 가입된 기본 회원 역할',
    10,
    true,
    true
  ),
  (
    'club_manager',
    '운영진',
    '동호회 운영 업무를 맡을 수 있는 역할',
    20,
    true,
    true
  ),
  (
    'club_admin',
    '대표운영자',
    '동호회 대표 운영 책임 역할',
    30,
    true,
    true
  )
on conflict (role_code) do nothing;

alter table public.club_memberships enable row level security;
alter table public.club_role_definitions enable row level security;
alter table public.club_role_assignments enable row level security;

revoke all on table public.club_memberships from public, anon, authenticated;
revoke all on table public.club_role_definitions from public, anon, authenticated;
revoke all on table public.club_role_assignments from public, anon, authenticated;

grant select on table public.club_memberships to authenticated;
grant select on table public.club_role_definitions to authenticated;
grant select on table public.club_role_assignments to authenticated;

create policy "Users can read their own club memberships"
on public.club_memberships
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Authenticated users can read active club role definitions"
on public.club_role_definitions
for select
to authenticated
using (is_active);

create policy "Users can read their own club role assignments"
on public.club_role_assignments
for select
to authenticated
using (
  exists (
    select 1
    from public.club_memberships as membership
    where membership.id = membership_id
      and membership.user_id = (select auth.uid())
  )
);
