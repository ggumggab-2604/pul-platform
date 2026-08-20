-- PUL 8-19: real public club directory and atomic active-member registration.

alter table public.clubs
  add column region text,
  add column district text,
  add column summary text,
  add constraint clubs_region_check check (
    region is null
    or (
      region = pg_catalog.btrim(region)
      and region in (
        '서울', '경기', '인천', '충북', '충남', '강원', '전북', '전남',
        '경북', '경남', '부산', '대구', '광주', '대전', '울산', '제주'
      )
    )
  ),
  add constraint clubs_district_check check (
    district is null
    or (
      district = pg_catalog.btrim(district)
      and district <> ''
      and pg_catalog.char_length(district) <= 80
    )
  ),
  add constraint clubs_summary_check check (
    summary is null
    or (
      summary = pg_catalog.btrim(summary)
      and summary <> ''
      and pg_catalog.char_length(summary) <= 500
    )
  );

comment on column public.clubs.region is
  'Optional public province-level activity region. Legacy clubs may remain unregistered.';
comment on column public.clubs.district is
  'Optional public city or district activity area without a separate address system.';
comment on column public.clubs.summary is
  'Privacy-minimized public club introduction supplied at registration.';

create index clubs_public_recent_idx
  on public.clubs (club_status, created_at desc, id desc)
  where legacy_key is not null;

create index clubs_public_filter_idx
  on public.clubs (
    club_status,
    region,
    membership_recruitment_status,
    created_at desc,
    id desc
  )
  where legacy_key is not null;

create or replace function private.enforce_guarded_club_admin_assignment_mutation()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_club_id uuid;
  v_target_user_id uuid;
  v_membership_status text;
  v_existing_admin_user_id uuid;
  v_context_request_id uuid;
  v_context_action_code text;
  v_context_actor_id uuid;
  v_context_club_id uuid;
  v_context_target_user_id uuid;
begin
  if tg_op = 'DELETE'
     and old.role_code = 'club_admin' then
    raise exception '동호회 회장 역할은 직접 삭제할 수 없습니다. 공식 회장 이전·복구·해제 절차를 사용하세요.'
      using errcode = '42501';
  end if;

  v_context_request_id := nullif(
    pg_catalog.current_setting('pul.club_admin_mutation_request_id', true),
    ''
  )::uuid;
  v_context_action_code := nullif(
    pg_catalog.current_setting('pul.club_admin_mutation_action_code', true),
    ''
  );
  v_context_actor_id := nullif(
    pg_catalog.current_setting('pul.club_admin_mutation_actor_id', true),
    ''
  )::uuid;
  v_context_club_id := nullif(
    pg_catalog.current_setting('pul.club_admin_mutation_club_id', true),
    ''
  )::uuid;
  v_context_target_user_id := nullif(
    pg_catalog.current_setting('pul.club_admin_mutation_target_user_id', true),
    ''
  )::uuid;

  if v_context_request_id is null
     or v_context_action_code is null
     or v_context_actor_id is null
     or v_context_club_id is null
     or v_context_target_user_id is null
     or v_context_action_code not in (
       'club.register',
       'role.transfer_admin',
       'role.appoint_initial_admin',
       'role.recover_missing_admin'
     ) then
    raise exception '승인된 회장 역할 변경 context가 필요합니다.'
      using errcode = '42501';
  end if;

  perform ledger.id
  from private.club_mutation_requests as ledger
  where ledger.actor_id = v_context_actor_id
    and ledger.request_id = v_context_request_id
    and ledger.action_code = v_context_action_code
    and ledger.club_id = v_context_club_id
    and ledger.target_user_id = v_context_target_user_id
    and ledger.role_code = 'club_admin'
    and ledger.input_fingerprint is not null
    and ledger.outcome is null
    and ledger.result_data is null
    and ledger.completed_at is null
  for share;

  if not found then
    raise exception '현재 회장 역할 변경 context와 일치하는 미완료 요청을 찾을 수 없습니다.'
      using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if new.role_code is distinct from 'club_admin' then
      return new;
    end if;

    if new.revoked_at is not null then
      raise exception '해제된 회장 역할 이력을 직접 생성할 수 없습니다.';
    end if;

    select
      membership.club_id,
      membership.user_id,
      membership.membership_status
    into
      v_club_id,
      v_target_user_id,
      v_membership_status
    from public.club_memberships as membership
    where membership.id = new.membership_id;

    if not found then
      raise exception '회장 역할을 연결할 동호회 회원 관계를 찾을 수 없습니다.';
    end if;

    if v_club_id is distinct from v_context_club_id
       or v_target_user_id is distinct from v_context_target_user_id then
      raise exception '회장 역할 생성 대상이 승인된 요청 context와 일치하지 않습니다.'
        using errcode = '42501';
    end if;

    if v_context_action_code = 'club.register' then
      if auth.role() is distinct from 'authenticated'
         or auth.uid() is distinct from v_context_actor_id
         or v_context_target_user_id is distinct from v_context_actor_id
         or new.assigned_by is distinct from v_context_actor_id
         or v_membership_status <> 'active'
         or not exists (
           select 1
           from public.clubs as club
           where club.id = v_club_id
             and club.club_status = 'active'
         )
         or not exists (
           select 1
           from public.club_role_definitions as role_definition
           where role_definition.role_code = 'club_admin'
             and role_definition.is_active
         )
         or exists (
           select 1
           from public.club_role_assignments as assignment
           join public.club_memberships as membership
             on membership.id = assignment.membership_id
           where membership.club_id = v_club_id
             and assignment.role_code = 'club_admin'
         ) then
        raise exception '동호회 등록 회장 역할 생성 대상이 승인된 회원 context와 일치하지 않습니다.'
          using errcode = '42501';
      end if;
    elsif v_context_action_code = 'role.appoint_initial_admin' then
      if auth.role() is distinct from 'service_role'
         or new.assigned_by is not null
         or v_membership_status <> 'active'
         or not exists (
           select 1
           from public.clubs as club
           where club.id = v_club_id
             and club.club_status = 'active'
         )
         or not exists (
           select 1
           from public.club_role_definitions as role_definition
           where role_definition.role_code = 'club_admin'
             and role_definition.is_active
         )
         or exists (
           select 1
           from public.club_role_assignments as assignment
           join public.club_memberships as membership
             on membership.id = assignment.membership_id
           where membership.club_id = v_club_id
             and assignment.role_code = 'club_admin'
         ) then
        raise exception '최초 회장 역할 생성 대상이 승인된 system context와 일치하지 않습니다.'
          using errcode = '42501';
      end if;
    elsif new.assigned_by is distinct from v_context_actor_id then
      raise exception '회장 역할 생성 대상이 승인된 요청 context와 일치하지 않습니다.'
        using errcode = '42501';
    end if;

    return new;
  end if;

  if old.role_code is distinct from 'club_admin'
     and new.role_code is distinct from 'club_admin' then
    return new;
  end if;

  if new.membership_id is distinct from old.membership_id
     or new.role_code is distinct from old.role_code then
    raise exception '회장 역할의 회원 관계 또는 역할 코드를 직접 변경할 수 없습니다.'
      using errcode = '42501';
  end if;

  if old.role_code = 'club_admin'
     and old.revoked_at is null
     and new.revoked_at is not null then
    select
      membership.club_id,
      membership.user_id
    into
      v_club_id,
      v_existing_admin_user_id
    from public.club_memberships as membership
    where membership.id = old.membership_id;

    if not found then
      raise exception '회장 역할의 동호회 회원 관계를 찾을 수 없습니다.';
    end if;

    if v_context_action_code not in (
         'role.transfer_admin',
         'role.recover_missing_admin'
       )
       or v_club_id is distinct from v_context_club_id
       or new.revoked_by is distinct from v_context_actor_id
       or (
         v_context_action_code = 'role.transfer_admin'
         and v_existing_admin_user_id is distinct from v_context_actor_id
       ) then
      raise exception '회장 역할 해제 대상이 승인된 요청 context와 일치하지 않습니다.'
        using errcode = '42501';
    end if;

    return new;
  end if;

  raise exception '회장 역할을 직접 재활성화하거나 이력을 변경할 수 없습니다.'
    using errcode = '42501';
end;
$$;

comment on function private.enforce_guarded_club_admin_assignment_mutation() is
  'Guards club_admin history and additionally permits only atomic authenticated club registration with a matching unfinished ledger context.';
revoke all on function private.enforce_guarded_club_admin_assignment_mutation()
  from public, anon, authenticated, service_role;

create function public.list_public_clubs(
  p_keyword text default null,
  p_region text default null,
  p_district text default null,
  p_recruitment_status text default null,
  p_limit integer default 24,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_keyword text := nullif(pg_catalog.btrim(p_keyword), '');
  v_region text := nullif(pg_catalog.btrim(p_region), '');
  v_district text := nullif(pg_catalog.btrim(p_district), '');
  v_limit integer := least(greatest(coalesce(p_limit, 24), 1), 30);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total integer;
  v_items jsonb;
begin
  if v_keyword is not null and pg_catalog.char_length(v_keyword) > 100 then
    raise exception '검색어는 100자 이하여야 합니다.';
  end if;
  if v_region is not null and v_region not in (
    '서울', '경기', '인천', '충북', '충남', '강원', '전북', '전남',
    '경북', '경남', '부산', '대구', '광주', '대전', '울산', '제주'
  ) then
    raise exception '지역을 확인해 주세요.';
  end if;
  if v_district is not null and pg_catalog.char_length(v_district) > 80 then
    raise exception '활동 지역은 80자 이하여야 합니다.';
  end if;
  if p_recruitment_status is not null
     and p_recruitment_status not in ('recruiting', 'waiting', 'closed') then
    raise exception '회원 모집 상태를 확인해 주세요.';
  end if;

  select pg_catalog.count(*)::integer
  into v_total
  from public.clubs as club
  where club.club_status = 'active'
    and club.legacy_key is not null
    and (v_region is null or club.region = v_region)
    and (v_district is null or club.district ilike '%' || v_district || '%')
    and (
      p_recruitment_status is null
      or club.membership_recruitment_status = p_recruitment_status
    )
    and (
      v_keyword is null
      or club.name ilike '%' || v_keyword || '%'
      or club.region ilike '%' || v_keyword || '%'
      or club.district ilike '%' || v_keyword || '%'
      or club.summary ilike '%' || v_keyword || '%'
    );

  select coalesce(
    pg_catalog.jsonb_agg(page.item order by page.created_at desc, page.id desc),
    '[]'::jsonb
  )
  into v_items
  from (
    select club.id, club.created_at,
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
      ) as item
    from public.clubs as club
    where club.club_status = 'active'
      and club.legacy_key is not null
      and (v_region is null or club.region = v_region)
      and (v_district is null or club.district ilike '%' || v_district || '%')
      and (
        p_recruitment_status is null
        or club.membership_recruitment_status = p_recruitment_status
      )
      and (
        v_keyword is null
        or club.name ilike '%' || v_keyword || '%'
        or club.region ilike '%' || v_keyword || '%'
        or club.district ilike '%' || v_keyword || '%'
        or club.summary ilike '%' || v_keyword || '%'
      )
    order by club.created_at desc, club.id desc
    limit v_limit offset v_offset
  ) as page;

  return pg_catalog.jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'has_more', v_offset + pg_catalog.jsonb_array_length(v_items) < v_total
  );
end;
$$;

comment on function public.list_public_clubs(text, text, text, text, integer, integer) is
  'Bounded public active-club directory without internal UUIDs, member counts, or private contact data.';
revoke all on function public.list_public_clubs(text, text, text, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_public_clubs(text, text, text, text, integer, integer)
  to anon, authenticated;

create function public.get_public_club(p_public_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
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
  from public.clubs as club
  where club.legacy_key = nullif(pg_catalog.btrim(p_public_key), '')
    and club.club_status = 'active';
$$;

comment on function public.get_public_club(text) is
  'Public active-club identity and registration summary without internal identifiers.';
revoke all on function public.get_public_club(text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_club(text)
  to anon, authenticated;

create function public.register_club(
  p_request_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_account_status text;
  v_name text;
  v_region text;
  v_district text;
  v_summary text;
  v_recruitment_status text;
  v_fingerprint text;
  v_public_key text;
  v_club_id uuid;
  v_membership_id uuid;
  v_admin_assignment_id uuid;
  v_audit_id uuid;
  v_created_at timestamptz;
  v_result jsonb;
  v_ledger_action text;
  v_ledger_target_user_id uuid;
  v_ledger_role_code text;
  v_ledger_fingerprint text;
  v_ledger_result jsonb;
  v_ledger_completed_at timestamptz;
  v_completed_count integer;
  v_previous_context_request_id text := pg_catalog.current_setting('pul.club_admin_mutation_request_id', true);
  v_previous_context_action_code text := pg_catalog.current_setting('pul.club_admin_mutation_action_code', true);
  v_previous_context_actor_id text := pg_catalog.current_setting('pul.club_admin_mutation_actor_id', true);
  v_previous_context_club_id text := pg_catalog.current_setting('pul.club_admin_mutation_club_id', true);
  v_previous_context_target_user_id text := pg_catalog.current_setting('pul.club_admin_mutation_target_user_id', true);
  v_context_set boolean := false;
begin
  if auth.role() is distinct from 'authenticated' or v_actor_id is null then
    raise exception '로그인한 회원만 동호회를 등록할 수 있습니다.'
      using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception '동호회 등록 request ID가 필요합니다.';
  end if;
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception '동호회 등록 내용을 확인해 주세요.';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_object_keys(p_payload) as key(value)
    where key.value not in (
      'name', 'region', 'district', 'summary', 'recruitment_status'
    )
  ) then
    raise exception '지원하지 않는 동호회 등록 항목입니다.';
  end if;

  v_name := nullif(pg_catalog.btrim(p_payload ->> 'name'), '');
  v_region := nullif(pg_catalog.btrim(p_payload ->> 'region'), '');
  v_district := nullif(pg_catalog.btrim(p_payload ->> 'district'), '');
  v_summary := nullif(pg_catalog.btrim(p_payload ->> 'summary'), '');
  v_recruitment_status := nullif(
    pg_catalog.btrim(p_payload ->> 'recruitment_status'),
    ''
  );

  if v_name is null
     or pg_catalog.char_length(v_name) < 2
     or pg_catalog.char_length(v_name) > 80 then
    raise exception '동호회명은 2자 이상 80자 이하로 입력해 주세요.';
  end if;
  if v_region is null or v_region not in (
    '서울', '경기', '인천', '충북', '충남', '강원', '전북', '전남',
    '경북', '경남', '부산', '대구', '광주', '대전', '울산', '제주'
  ) then
    raise exception '활동 지역을 확인해 주세요.';
  end if;
  if v_district is null or pg_catalog.char_length(v_district) > 80 then
    raise exception '시·군·구 또는 활동 지역을 80자 이하로 입력해 주세요.';
  end if;
  if v_summary is null
     or pg_catalog.char_length(v_summary) < 10
     or pg_catalog.char_length(v_summary) > 500 then
    raise exception '동호회 소개는 10자 이상 500자 이하로 입력해 주세요.';
  end if;
  if v_recruitment_status not in ('recruiting', 'waiting', 'closed') then
    raise exception '회원 모집 상태를 확인해 주세요.';
  end if;

  select account.account_status
  into v_account_status
  from public.user_accounts as account
  where account.id = v_actor_id
  for share;

  if not found or v_account_status <> 'active' then
    raise exception '활성 계정인 회원만 동호회를 등록할 수 있습니다.'
      using errcode = '42501';
  end if;

  v_fingerprint := pg_catalog.md5(
    pg_catalog.concat_ws(
      E'\x1f',
      'club.register',
      v_name,
      v_region,
      v_district,
      v_summary,
      v_recruitment_status
    )
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_actor_id::text || ':' || p_request_id::text, 0)
  );

  select
    ledger.action_code,
    ledger.target_user_id,
    ledger.role_code,
    ledger.input_fingerprint,
    ledger.result_data,
    ledger.completed_at
  into
    v_ledger_action,
    v_ledger_target_user_id,
    v_ledger_role_code,
    v_ledger_fingerprint,
    v_ledger_result,
    v_ledger_completed_at
  from private.club_mutation_requests as ledger
  where ledger.actor_id = v_actor_id
    and ledger.request_id = p_request_id
  for update;

  if found then
    if v_ledger_action is distinct from 'club.register'
       or v_ledger_target_user_id is distinct from v_actor_id
       or v_ledger_role_code is distinct from 'club_admin'
       or v_ledger_fingerprint is distinct from v_fingerprint then
      raise exception '동일한 request ID를 다른 동호회 등록 요청에 재사용할 수 없습니다.';
    end if;
    if v_ledger_completed_at is null or v_ledger_result is null then
      raise exception '동일한 동호회 등록 요청이 처리 중입니다.';
    end if;
    return v_ledger_result || pg_catalog.jsonb_build_object('replayed', true);
  end if;

  v_public_key := pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '');

  insert into public.clubs (
    legacy_key,
    name,
    club_status,
    membership_recruitment_status,
    region,
    district,
    summary
  ) values (
    v_public_key,
    v_name,
    'active',
    v_recruitment_status,
    v_region,
    v_district,
    v_summary
  )
  returning id, created_at into v_club_id, v_created_at;

  insert into public.club_memberships (
    club_id,
    user_id,
    membership_status
  ) values (
    v_club_id,
    v_actor_id,
    'active'
  )
  returning id into v_membership_id;

  insert into public.club_role_assignments (
    membership_id,
    role_code,
    assigned_by
  ) values (
    v_membership_id,
    'club_member',
    v_actor_id
  );

  insert into private.club_mutation_requests (
    actor_id,
    request_id,
    action_code,
    club_id,
    target_user_id,
    role_code,
    input_fingerprint
  ) values (
    v_actor_id,
    p_request_id,
    'club.register',
    v_club_id,
    v_actor_id,
    'club_admin',
    v_fingerprint
  );

  perform pg_catalog.set_config('pul.club_admin_mutation_request_id', p_request_id::text, true);
  perform pg_catalog.set_config('pul.club_admin_mutation_action_code', 'club.register', true);
  perform pg_catalog.set_config('pul.club_admin_mutation_actor_id', v_actor_id::text, true);
  perform pg_catalog.set_config('pul.club_admin_mutation_club_id', v_club_id::text, true);
  perform pg_catalog.set_config('pul.club_admin_mutation_target_user_id', v_actor_id::text, true);
  v_context_set := true;

  insert into public.club_role_assignments (
    membership_id,
    role_code,
    assigned_by
  ) values (
    v_membership_id,
    'club_admin',
    v_actor_id
  )
  returning id into v_admin_assignment_id;

  if not exists (
    select 1
    from public.club_memberships as membership
    where membership.id = v_membership_id
      and membership.club_id = v_club_id
      and membership.user_id = v_actor_id
      and membership.membership_status = 'active'
  )
  or (
    select pg_catalog.count(*)
    from public.club_role_assignments as assignment
    join public.club_memberships as membership
      on membership.id = assignment.membership_id
    where membership.club_id = v_club_id
      and assignment.role_code = 'club_admin'
      and assignment.revoked_at is null
  ) <> 1
  or not exists (
    select 1
    from public.club_role_assignments as assignment
    where assignment.id = v_admin_assignment_id
      and assignment.membership_id = v_membership_id
      and assignment.role_code = 'club_admin'
      and assignment.revoked_at is null
  )
  or not exists (
    select 1
    from public.club_role_assignments as assignment
    where assignment.membership_id = v_membership_id
      and assignment.role_code = 'club_member'
      and assignment.revoked_at is null
  ) then
    raise exception '동호회 생성자의 최초 회원·회장 역할 연결을 확인할 수 없습니다.';
  end if;

  insert into public.audit_logs (
    actor_id,
    actor_type,
    actor_role,
    action,
    target_type,
    target_id,
    club_id,
    before_summary,
    after_summary,
    reason,
    metadata,
    request_id,
    outcome
  ) values (
    v_actor_id,
    'user',
    'club_admin',
    'club.register',
    'club',
    v_club_id::text,
    v_club_id::text,
    null,
    pg_catalog.jsonb_build_object(
      'club_status', 'active',
      'membership_status', 'active',
      'roles', pg_catalog.jsonb_build_array('club_member', 'club_admin')
    ),
    '회원 동호회 등록',
    pg_catalog.jsonb_build_object(
      'public_key', v_public_key,
      'region', v_region,
      'district', v_district,
      'recruitment_status', v_recruitment_status
    ),
    p_request_id,
    'success'
  )
  returning id into v_audit_id;

  v_result := pg_catalog.jsonb_build_object(
    'request_id', p_request_id,
    'public_key', v_public_key,
    'name', v_name,
    'region', v_region,
    'district', v_district,
    'region_label', pg_catalog.concat_ws(' ', v_region, v_district),
    'summary', v_summary,
    'recruitment_status', v_recruitment_status,
    'created_at', v_created_at,
    'replayed', false
  );

  update private.club_mutation_requests as ledger
  set outcome = 'success',
      result_data = v_result,
      completed_at = pg_catalog.now()
  where ledger.actor_id = v_actor_id
    and ledger.request_id = p_request_id
    and ledger.action_code = 'club.register'
    and ledger.club_id = v_club_id
    and ledger.target_user_id = v_actor_id
    and ledger.role_code = 'club_admin'
    and ledger.input_fingerprint = v_fingerprint
    and ledger.outcome is null
    and ledger.result_data is null
    and ledger.completed_at is null;

  get diagnostics v_completed_count = row_count;
  if v_completed_count <> 1 then
    raise exception '동호회 등록 요청 완료 상태를 기록할 수 없습니다.';
  end if;

  perform pg_catalog.set_config('pul.club_admin_mutation_request_id', coalesce(v_previous_context_request_id, ''), true);
  perform pg_catalog.set_config('pul.club_admin_mutation_action_code', coalesce(v_previous_context_action_code, ''), true);
  perform pg_catalog.set_config('pul.club_admin_mutation_actor_id', coalesce(v_previous_context_actor_id, ''), true);
  perform pg_catalog.set_config('pul.club_admin_mutation_club_id', coalesce(v_previous_context_club_id, ''), true);
  perform pg_catalog.set_config('pul.club_admin_mutation_target_user_id', coalesce(v_previous_context_target_user_id, ''), true);
  v_context_set := false;

  return v_result;
exception
  when others then
    if v_context_set then
      perform pg_catalog.set_config('pul.club_admin_mutation_request_id', coalesce(v_previous_context_request_id, ''), true);
      perform pg_catalog.set_config('pul.club_admin_mutation_action_code', coalesce(v_previous_context_action_code, ''), true);
      perform pg_catalog.set_config('pul.club_admin_mutation_actor_id', coalesce(v_previous_context_actor_id, ''), true);
      perform pg_catalog.set_config('pul.club_admin_mutation_club_id', coalesce(v_previous_context_club_id, ''), true);
      perform pg_catalog.set_config('pul.club_admin_mutation_target_user_id', coalesce(v_previous_context_target_user_id, ''), true);
    end if;
    raise;
end;
$$;

comment on function public.register_club(uuid, jsonb) is
  'Authenticated active-member registration that atomically creates one active club, creator membership, base role, and initial club_admin role with replay protection.';
revoke all on function public.register_club(uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.register_club(uuid, jsonb)
  to authenticated;
