-- PUL 8-35: public course-to-club links and permission-bound self-service RPCs.
-- A link is a club's self-declared major activity course, not an official partnership.

create table public.course_club_links (
  course_id uuid not null
    references public.courses (id) on delete cascade,
  club_id uuid not null
    references public.clubs (id) on delete cascade,
  created_by uuid not null
    references public.user_accounts (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  constraint course_club_links_pkey primary key (course_id, club_id)
);

comment on table public.course_club_links is
  'Club-declared major activity course links. A row does not imply course-operator or PUL endorsement.';
comment on column public.course_club_links.created_by is
  'Authenticated active club administrator or vice administrator who created the link through the guarded RPC.';

create index course_club_links_club_id_idx
  on public.course_club_links (club_id, course_id);
create index course_club_links_created_by_idx
  on public.course_club_links (created_by);

alter table public.course_club_links enable row level security;
alter table public.course_club_links force row level security;

revoke all on table public.course_club_links
  from public, anon, authenticated, service_role;

create function public.list_public_course_clubs(p_course_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_course_key text := nullif(pg_catalog.btrim(p_course_key), '');
  v_course_id uuid;
  v_result jsonb;
begin
  if v_course_key is null
     or v_course_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'
     or v_course_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception '골프장을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  select course.id
  into v_course_id
  from public.courses as course
  where course.course_key = v_course_key
    and course.course_status = 'active';

  if not found then
    raise exception '골프장을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'public_key', club.legacy_key,
        'name', club.name,
        'region', club.region,
        'district', club.district,
        'region_label', coalesce(
          nullif(pg_catalog.concat_ws(' ', club.region, club.district), ''),
          '지역 정보 미등록'
        ),
        'summary', club.summary,
        'recruitment_status', club.membership_recruitment_status,
        'created_at', club.created_at
      )
      order by club.name, club.legacy_key
    ),
    '[]'::jsonb
  )
  into v_result
  from public.course_club_links as link
  join public.clubs as club
    on club.id = link.club_id
   and club.club_status = 'active'
   and club.legacy_key is not null
  where link.course_id = v_course_id;

  return v_result;
end;
$$;

comment on function public.list_public_course_clubs(text) is
  'Public active clubs that self-declare one active course as a major activity course; returns public club DTOs only.';
revoke all on function public.list_public_course_clubs(text)
  from public, anon, authenticated, service_role;
grant execute on function public.list_public_course_clubs(text)
  to anon, authenticated;

create function public.list_manageable_course_link_clubs(p_course_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_course_key text := nullif(pg_catalog.btrim(p_course_key), '');
  v_course_id uuid;
  v_actor_status text;
  v_result jsonb;
begin
  if auth.role() is distinct from 'authenticated' or v_actor_id is null then
    raise exception '로그인 후 동호회 활동 골프장을 관리해 주세요.'
      using errcode = '42501';
  end if;
  if v_course_key is null
     or v_course_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'
     or v_course_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception '골프장을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  select account.account_status
  into v_actor_status
  from public.user_accounts as account
  where account.id = v_actor_id;

  if not found or v_actor_status <> 'active' then
    raise exception '정상 활동 중인 계정만 동호회 활동 골프장을 관리할 수 있습니다.'
      using errcode = '42501';
  end if;

  select course.id
  into v_course_id
  from public.courses as course
  where course.course_key = v_course_key
    and course.course_status = 'active';

  if not found then
    raise exception '골프장을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'public_key', club.legacy_key,
        'name', club.name,
        'region', club.region,
        'district', club.district,
        'region_label', coalesce(
          nullif(pg_catalog.concat_ws(' ', club.region, club.district), ''),
          '지역 정보 미등록'
        ),
        'summary', club.summary,
        'recruitment_status', club.membership_recruitment_status,
        'created_at', club.created_at,
        'linked', exists (
          select 1
          from public.course_club_links as existing_link
          where existing_link.course_id = v_course_id
            and existing_link.club_id = club.id
        )
      )
      order by club.name, club.legacy_key
    ),
    '[]'::jsonb
  )
  into v_result
  from public.clubs as club
  where club.club_status = 'active'
    and club.legacy_key is not null
    and private.club_user_has_permission(
      v_actor_id,
      club.id,
      'club.settings.manage'
    );

  return v_result;
end;
$$;

comment on function public.list_manageable_course_link_clubs(text) is
  'Authenticated active clubs for which auth.uid() currently has club.settings.manage, with link state and no internal identifiers.';
revoke all on function public.list_manageable_course_link_clubs(text)
  from public, anon, authenticated, service_role;
grant execute on function public.list_manageable_course_link_clubs(text)
  to authenticated;

create function public.link_club_to_course(
  p_club_key text,
  p_course_key text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_club_key text := nullif(pg_catalog.btrim(p_club_key), '');
  v_course_key text := nullif(pg_catalog.btrim(p_course_key), '');
  v_actor_status text;
  v_course_id uuid;
  v_club_id uuid;
  v_membership_id uuid;
  v_changed_count integer;
begin
  if auth.role() is distinct from 'authenticated' or v_actor_id is null then
    raise exception '로그인 후 동호회 활동 골프장을 관리해 주세요.'
      using errcode = '42501';
  end if;
  if v_club_key is null
     or v_club_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'
     or v_club_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception '동호회를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  if v_course_key is null
     or v_course_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'
     or v_course_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception '골프장을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  select account.account_status
  into v_actor_status
  from public.user_accounts as account
  where account.id = v_actor_id
  for share;

  if not found or v_actor_status <> 'active' then
    raise exception '정상 활동 중인 계정만 동호회 활동 골프장을 관리할 수 있습니다.'
      using errcode = '42501';
  end if;

  select course.id
  into v_course_id
  from public.courses as course
  where course.course_key = v_course_key
    and course.course_status = 'active'
  for share;

  if not found then
    raise exception '골프장을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  select club.id
  into v_club_id
  from public.clubs as club
  where club.legacy_key = v_club_key
    and club.club_status = 'active'
  for share;

  if not found then
    raise exception '동호회를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_course_id::text || ':' || v_club_id::text, 0)
  );

  select membership.id
  into v_membership_id
  from public.club_memberships as membership
  where membership.club_id = v_club_id
    and membership.user_id = v_actor_id
    and membership.membership_status = 'active'
  for share;

  if not found then
    raise exception '활동 중인 동호회 회원만 활동 골프장을 관리할 수 있습니다.'
      using errcode = '42501';
  end if;

  perform 1
  from public.club_role_assignments as assignment
  where assignment.membership_id = v_membership_id
    and assignment.revoked_at is null
  order by assignment.id
  for share;

  if not private.club_user_has_permission(
    v_actor_id,
    v_club_id,
    'club.settings.manage'
  ) then
    raise exception '동호회 활동 골프장을 관리할 권한이 없습니다.'
      using errcode = '42501';
  end if;

  insert into public.course_club_links (
    course_id,
    club_id,
    created_by
  ) values (
    v_course_id,
    v_club_id,
    v_actor_id
  )
  on conflict (course_id, club_id) do nothing;

  get diagnostics v_changed_count = row_count;

  return pg_catalog.jsonb_build_object(
    'course_key', v_course_key,
    'public_key', v_club_key,
    'linked', true,
    'changed', v_changed_count = 1
  );
end;
$$;

comment on function public.link_club_to_course(text, text) is
  'Idempotently creates one club-declared course link after active identity, membership, and club.settings.manage checks.';
revoke all on function public.link_club_to_course(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.link_club_to_course(text, text)
  to authenticated;

create function public.unlink_club_from_course(
  p_club_key text,
  p_course_key text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_club_key text := nullif(pg_catalog.btrim(p_club_key), '');
  v_course_key text := nullif(pg_catalog.btrim(p_course_key), '');
  v_actor_status text;
  v_course_id uuid;
  v_club_id uuid;
  v_membership_id uuid;
  v_changed_count integer;
begin
  if auth.role() is distinct from 'authenticated' or v_actor_id is null then
    raise exception '로그인 후 동호회 활동 골프장을 관리해 주세요.'
      using errcode = '42501';
  end if;
  if v_club_key is null
     or v_club_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'
     or v_club_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception '동호회를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  if v_course_key is null
     or v_course_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'
     or v_course_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception '골프장을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  select account.account_status
  into v_actor_status
  from public.user_accounts as account
  where account.id = v_actor_id
  for share;

  if not found or v_actor_status <> 'active' then
    raise exception '정상 활동 중인 계정만 동호회 활동 골프장을 관리할 수 있습니다.'
      using errcode = '42501';
  end if;

  select course.id
  into v_course_id
  from public.courses as course
  where course.course_key = v_course_key
    and course.course_status = 'active'
  for share;

  if not found then
    raise exception '골프장을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  select club.id
  into v_club_id
  from public.clubs as club
  where club.legacy_key = v_club_key
    and club.club_status = 'active'
  for share;

  if not found then
    raise exception '동호회를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_course_id::text || ':' || v_club_id::text, 0)
  );

  select membership.id
  into v_membership_id
  from public.club_memberships as membership
  where membership.club_id = v_club_id
    and membership.user_id = v_actor_id
    and membership.membership_status = 'active'
  for share;

  if not found then
    raise exception '활동 중인 동호회 회원만 활동 골프장을 관리할 수 있습니다.'
      using errcode = '42501';
  end if;

  perform 1
  from public.club_role_assignments as assignment
  where assignment.membership_id = v_membership_id
    and assignment.revoked_at is null
  order by assignment.id
  for share;

  if not private.club_user_has_permission(
    v_actor_id,
    v_club_id,
    'club.settings.manage'
  ) then
    raise exception '동호회 활동 골프장을 관리할 권한이 없습니다.'
      using errcode = '42501';
  end if;

  delete from public.course_club_links as link
  where link.course_id = v_course_id
    and link.club_id = v_club_id;

  get diagnostics v_changed_count = row_count;

  return pg_catalog.jsonb_build_object(
    'course_key', v_course_key,
    'public_key', v_club_key,
    'linked', false,
    'changed', v_changed_count = 1
  );
end;
$$;

comment on function public.unlink_club_from_course(text, text) is
  'Idempotently removes one club-declared course link after active identity, membership, and club.settings.manage checks.';
revoke all on function public.unlink_club_from_course(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.unlink_club_from_course(text, text)
  to authenticated;
