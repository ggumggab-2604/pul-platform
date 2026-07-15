-- PUL 8-3A: stable club identity foundation.
-- Existing numeric mock IDs remain compatibility keys and are not UUIDs.

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  legacy_key text,
  slug text,
  name text not null,
  club_status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clubs_legacy_key_unique unique (legacy_key),
  constraint clubs_slug_unique unique (slug),
  constraint clubs_legacy_key_check
    check (
      legacy_key is null
      or (legacy_key = btrim(legacy_key) and legacy_key <> '')
    ),
  constraint clubs_slug_check
    check (
      slug is null
      or (
        slug = lower(slug)
        and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      )
    ),
  constraint clubs_name_check
    check (name = btrim(name) and name <> ''),
  constraint clubs_status_check
    check (club_status in ('active', 'suspended', 'archived'))
);

comment on table public.clubs is
  'Stable club identities for future club-scoped relationships and permissions.';

comment on column public.clubs.id is
  'Internal UUID used by future club foreign keys.';

comment on column public.clubs.legacy_key is
  'Temporary compatibility key for existing numeric mock routes; not a primary key.';

comment on column public.clubs.slug is
  'Reserved nullable public URL identifier; no translated slugs are assigned in 8-3A.';

create index clubs_status_idx on public.clubs (club_status);

create trigger clubs_set_updated_at
before update on public.clubs
for each row execute function public.set_user_foundation_updated_at();

-- Seed only stable identity fields from the approved mock club list.
-- Existing rows are never overwritten by this compatibility seed.
insert into public.clubs (legacy_key, name, club_status)
values
  ('1', '한강 시민 파크골프 동호회', 'active'),
  ('2', '수원 화성 파크골프회', 'active'),
  ('3', '송도 파크골프 클럽', 'active'),
  ('4', '대전 엑스포 파크골프 동호회', 'active'),
  ('5', '춘천 소양강 파크골프회', 'active'),
  ('6', '부산 해운대 파크골프 동호회', 'active'),
  ('7', '전주 한옥마을 파크골프회', 'active'),
  ('8', '제주 올레 파크골프 동호회', 'active'),
  ('9', '분당 시니어 파크골프회', 'active'),
  ('10', '청주 무심천 파크골프 동호회', 'active')
on conflict (legacy_key) do nothing;

alter table public.clubs enable row level security;

revoke all on table public.clubs from public, anon, authenticated;

grant select on table public.clubs to anon, authenticated;

create policy "Anyone can read active clubs"
on public.clubs
for select
to anon, authenticated
using (club_status = 'active');
