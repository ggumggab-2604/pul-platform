-- PUL 8-5B-1: minimal read-only club member list contract for authorized operators.
-- The response deliberately excludes user IDs, contacts, applications, audit data, and mutation metadata.

create index club_memberships_club_joined_id_idx
  on public.club_memberships (club_id, joined_at desc, id desc);

create function public.list_club_members_for_management(
  p_club_id uuid,
  p_limit integer default 30,
  p_cursor_joined_at timestamptz default null,
  p_cursor_membership_id uuid default null,
  p_search text default null,
  p_membership_status text default null,
  p_role_key text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_search text := nullif(pg_catalog.btrim(p_search), '');
  v_search_pattern text;
  v_membership_status text := nullif(
    pg_catalog.btrim(p_membership_status),
    ''
  );
  v_role_key text := nullif(pg_catalog.btrim(p_role_key), '');
  v_items jsonb;
  v_has_more boolean;
  v_next_joined_at timestamptz;
  v_next_membership_id uuid;
begin
  if v_actor_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  if p_club_id is null then
    raise exception 'CLUB_REQUIRED';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'INVALID_PAGE_LIMIT';
  end if;

  if (p_cursor_joined_at is null) <> (p_cursor_membership_id is null) then
    raise exception 'INVALID_PAGE_CURSOR';
  end if;

  if v_search is not null and pg_catalog.char_length(v_search) > 100 then
    raise exception 'SEARCH_TOO_LONG';
  end if;

  if v_membership_status is not null
     and v_membership_status not in ('active', 'suspended', 'left') then
    raise exception 'INVALID_MEMBERSHIP_STATUS';
  end if;

  if v_role_key is not null and pg_catalog.char_length(v_role_key) > 100 then
    raise exception 'INVALID_ROLE_KEY';
  end if;

  if not exists (
    select 1
    from public.user_accounts as actor_account
    where actor_account.id = v_actor_id
      and actor_account.account_status = 'active'
  ) then
    raise exception 'ACCOUNT_NOT_ACTIVE' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.clubs as club
    where club.id = p_club_id
      and club.club_status = 'active'
  ) or not private.club_user_has_permission(
    v_actor_id,
    p_club_id,
    'club.members.read'
  ) then
    raise exception 'CLUB_MEMBER_READ_PERMISSION_REQUIRED' using errcode = '42501';
  end if;

  if v_role_key is not null and not exists (
    select 1
    from public.club_role_definitions as role_definition
    where role_definition.role_code = v_role_key
      and role_definition.is_active
  ) then
    raise exception 'INVALID_ROLE_KEY';
  end if;

  if v_search is not null then
    v_search_pattern := pg_catalog.replace(
      pg_catalog.replace(
        pg_catalog.replace(
          v_search,
          pg_catalog.chr(92),
          pg_catalog.chr(92) || pg_catalog.chr(92)
        ),
        '%',
        pg_catalog.chr(92) || '%'
      ),
      '_',
      pg_catalog.chr(92) || '_'
    );
  end if;

  with candidate_members as materialized (
    select
      membership.id as membership_id,
      profile.display_name,
      membership.joined_at,
      membership.membership_status
    from public.club_memberships as membership
    left join public.user_profiles as profile
      on profile.user_id = membership.user_id
    where membership.club_id = p_club_id
      and (
        v_search is null
        or coalesce(profile.display_name, '')
          ilike '%' || v_search_pattern || '%' escape E'\\'
      )
      and (
        v_membership_status is null
        or membership.membership_status = v_membership_status
      )
      and (
        v_role_key is null
        or exists (
          select 1
          from public.club_role_assignments as filtered_assignment
          join public.club_role_definitions as filtered_role_definition
            on filtered_role_definition.role_code = filtered_assignment.role_code
           and filtered_role_definition.is_active
          where filtered_assignment.membership_id = membership.id
            and filtered_assignment.role_code = v_role_key
            and filtered_assignment.revoked_at is null
        )
      )
      and (
        p_cursor_joined_at is null
        or (membership.joined_at, membership.id)
          < (p_cursor_joined_at, p_cursor_membership_id)
      )
    order by membership.joined_at desc, membership.id desc
    limit p_limit + 1
  ),
  page_members as materialized (
    select candidate.*
    from candidate_members as candidate
    order by candidate.joined_at desc, candidate.membership_id desc
    limit p_limit
  )
  select
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'membership_id', page_member.membership_id,
            'display_name', page_member.display_name,
            'joined_at', page_member.joined_at,
            'membership_status', page_member.membership_status,
            'current_roles', coalesce(
              (
                select pg_catalog.jsonb_agg(
                  pg_catalog.jsonb_build_object(
                    'role_key', role_row.role_code,
                    'role_name', role_row.display_name
                  )
                  order by role_row.role_rank desc, role_row.role_code
                )
                from (
                  select distinct
                    role_definition.role_code,
                    role_definition.display_name,
                    role_definition.role_rank
                  from public.club_role_assignments as assignment
                  join public.club_role_definitions as role_definition
                    on role_definition.role_code = assignment.role_code
                   and role_definition.is_active
                  where assignment.membership_id = page_member.membership_id
                    and assignment.revoked_at is null
                ) as role_row
              ),
              '[]'::jsonb
            )
          )
          order by page_member.joined_at desc, page_member.membership_id desc
        )
        from page_members as page_member
      ),
      '[]'::jsonb
    ),
    (
      select pg_catalog.count(*) > p_limit
      from candidate_members
    ),
    (
      select page_member.joined_at
      from page_members as page_member
      order by page_member.joined_at, page_member.membership_id
      limit 1
    ),
    (
      select page_member.membership_id
      from page_members as page_member
      order by page_member.joined_at, page_member.membership_id
      limit 1
    )
  into
    v_items,
    v_has_more,
    v_next_joined_at,
    v_next_membership_id;

  return pg_catalog.jsonb_build_object(
    'items', v_items,
    'page', pg_catalog.jsonb_build_object(
      'limit', p_limit,
      'has_more', v_has_more,
      'next_cursor', case
        when v_has_more then pg_catalog.jsonb_build_object(
          'joined_at', v_next_joined_at,
          'membership_id', v_next_membership_id
        )
        else null
      end
    ),
    'filters', pg_catalog.jsonb_build_object(
      'search', v_search,
      'membership_status', v_membership_status,
      'role_key', v_role_key
    )
  );
end;
$$;

comment on function public.list_club_members_for_management(
  uuid,
  integer,
  timestamptz,
  uuid,
  text,
  text,
  text
) is
  'Returns only membership ID, display name, joined date, membership status, and current active role labels to active club operators with club.members.read. It never reads contacts, applications, audit logs, or mutation ledgers.';

revoke all on function public.list_club_members_for_management(
  uuid,
  integer,
  timestamptz,
  uuid,
  text,
  text,
  text
) from public, anon, authenticated, service_role;

grant execute on function public.list_club_members_for_management(
  uuid,
  integer,
  timestamptz,
  uuid,
  text,
  text,
  text
) to authenticated;
