-- PUL 8-2C: minimal authenticated user foundation.
-- This migration stores neither raw phone numbers nor duplicated email addresses.

create schema private;

revoke all on schema private from public, anon, authenticated;

create table public.user_accounts (
  id uuid primary key references auth.users (id) on delete cascade,
  platform_role text not null default 'member',
  account_status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_accounts_platform_role_check
    check (platform_role in ('member', 'platform_moderator', 'platform_admin')),
  constraint user_accounts_account_status_check
    check (account_status in ('active', 'suspended', 'withdrawn'))
);

create table public.user_profiles (
  user_id uuid primary key references public.user_accounts (id) on delete cascade,
  display_name text,
  nickname text,
  profile_visibility text not null default 'private',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_profiles_display_name_check
    check (
      display_name is null
      or (btrim(display_name) <> '' and char_length(btrim(display_name)) <= 100)
    ),
  constraint user_profiles_nickname_check
    check (
      nickname is null
      or (btrim(nickname) <> '' and char_length(btrim(nickname)) <= 50)
    ),
  constraint user_profiles_visibility_check
    check (profile_visibility in ('public', 'members', 'private'))
);

comment on column public.user_profiles.profile_visibility is
  'Reserved for future expansion; 8-2 allows only the owner to read the profile.';

create table public.user_private_contacts (
  user_id uuid primary key references public.user_accounts (id) on delete cascade,
  phone_last4 text,
  phone_verified_at timestamptz,
  contact_status text not null default 'unverified',
  contact_source text not null default 'supabase_auth',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_private_contacts_phone_last4_check
    check (phone_last4 is null or phone_last4 ~ '^[0-9]{4}$'),
  constraint user_private_contacts_status_check
    check (contact_status in ('unverified', 'verified', 'revoked'))
);

create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references public.user_accounts (id) on delete cascade,
  consent_type text not null,
  consent_version text not null,
  decision text not null,
  recorded_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint consent_records_type_version_check
    check (
      (consent_type = 'terms_required' and consent_version = 'terms-dev-v1')
      or (
        consent_type = 'privacy_required'
        and consent_version = 'privacy-dev-v1'
      )
    ),
  constraint consent_records_decision_check
    check (decision in ('granted', 'withdrawn')),
  constraint consent_records_metadata_object_check
    check (jsonb_typeof(metadata) = 'object')
);

comment on column public.consent_records.metadata is
  'Do not store raw personal information, authentication secrets, or OTP values.';

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
  actor_type text not null,
  actor_role text,
  action text not null,
  target_type text not null,
  target_id text,
  club_id text,
  before_summary jsonb,
  after_summary jsonb,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_logs_actor_type_check
    check (actor_type in ('user', 'operator', 'moderator', 'admin', 'system')),
  constraint audit_logs_action_check check (btrim(action) <> ''),
  constraint audit_logs_target_type_check check (btrim(target_type) <> ''),
  constraint audit_logs_before_summary_object_check
    check (before_summary is null or jsonb_typeof(before_summary) = 'object'),
  constraint audit_logs_after_summary_object_check
    check (after_summary is null or jsonb_typeof(after_summary) = 'object'),
  constraint audit_logs_metadata_object_check
    check (jsonb_typeof(metadata) = 'object')
);

comment on table public.audit_logs is
  'Audit summaries must not contain full raw personal information or authentication secrets.';

create index user_profiles_visibility_idx
  on public.user_profiles (profile_visibility);
create index consent_records_user_recorded_at_idx
  on public.consent_records (user_id, recorded_at desc);
create index audit_logs_actor_id_idx
  on public.audit_logs (actor_id)
  where actor_id is not null;
create index audit_logs_target_idx
  on public.audit_logs (target_type, target_id)
  where target_id is not null;
create index audit_logs_created_at_idx
  on public.audit_logs (created_at desc);

create function public.set_user_foundation_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

comment on function public.set_user_foundation_updated_at() is
  'Security-invoker trigger function that maintains updated_at.';

revoke all on function public.set_user_foundation_updated_at()
  from public, anon, authenticated;

create trigger user_accounts_set_updated_at
before update on public.user_accounts
for each row execute function public.set_user_foundation_updated_at();

create trigger user_profiles_set_updated_at
before update on public.user_profiles
for each row execute function public.set_user_foundation_updated_at();

create trigger user_private_contacts_set_updated_at
before update on public.user_private_contacts
for each row execute function public.set_user_foundation_updated_at();

-- This trigger function is SECURITY DEFINER so Auth can create protected
-- foundation rows without granting table INSERT privileges to app users.
create function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_accounts (id)
  values (new.id)
  on conflict (id) do nothing;

  insert into public.user_profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.user_private_contacts (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

comment on function private.handle_new_auth_user() is
  'Creates only default PUL foundation rows from auth.users NEW.id.';

revoke all on function private.handle_new_auth_user()
  from public, anon, authenticated;

create trigger on_auth_user_created_create_pul_foundation
after insert on auth.users
for each row execute function private.handle_new_auth_user();

-- Backfill only auth.users IDs. Existing foundation values are never replaced.
insert into public.user_accounts (id)
select auth_user.id
from auth.users as auth_user
on conflict (id) do nothing;

insert into public.user_profiles (user_id)
select auth_user.id
from auth.users as auth_user
on conflict (user_id) do nothing;

insert into public.user_private_contacts (user_id)
select auth_user.id
from auth.users as auth_user
on conflict (user_id) do nothing;

alter table public.user_accounts enable row level security;
alter table public.user_profiles enable row level security;
alter table public.user_private_contacts enable row level security;
alter table public.consent_records enable row level security;
alter table public.audit_logs enable row level security;

revoke all on table public.user_accounts from public, anon, authenticated;
revoke all on table public.user_profiles from public, anon, authenticated;
revoke all on table public.user_private_contacts from public, anon, authenticated;
revoke all on table public.consent_records from public, anon, authenticated;
revoke all on table public.audit_logs from public, anon, authenticated;

grant select on table public.user_accounts to authenticated;
grant select on table public.user_profiles to authenticated;
grant update (display_name, nickname, profile_visibility)
  on table public.user_profiles to authenticated;
grant select on table public.user_private_contacts to authenticated;
grant select on table public.consent_records to authenticated;
grant insert (consent_type, consent_version, decision)
  on table public.consent_records to authenticated;

create policy "Users can read their own account"
on public.user_accounts
for select
to authenticated
using ((select auth.uid()) = id);

create policy "Users can read their own profile"
on public.user_profiles
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can update their own profile"
on public.user_profiles
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can read their own private contact"
on public.user_private_contacts
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read their own consent records"
on public.consent_records
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can append their own consent records"
on public.consent_records
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and user_id = (select auth.uid())
);
