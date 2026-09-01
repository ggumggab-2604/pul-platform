-- PUL club directory correction request foundation.
-- Reports never update club directory rows automatically.

insert into public.platform_permission_definitions (
  code,
  description,
  is_active
)
values (
  'clubs.directory_corrections.manage',
  '동호회 정보 수정 제보를 플랫폼 범위에서 조회하고 처리합니다.',
  true
);

insert into public.platform_role_permissions (
  platform_role,
  permission_code
)
values (
  'platform_admin',
  'clubs.directory_corrections.manage'
);

create table public.club_directory_correction_requests (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  request_key text not null default pg_catalog.encode(extensions.gen_random_bytes(16), 'hex'),
  club_id uuid not null references public.clubs (id) on delete restrict,
  requester_user_id uuid not null references public.user_accounts (id) on delete restrict,
  submit_request_id uuid not null,
  correction_target text not null,
  displayed_value text,
  proposed_value text not null,
  reason text not null,
  note text,
  request_status text not null default 'pending',
  version integer not null default 1,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  resolved_at timestamptz,
  resolved_by uuid references public.user_accounts (id) on delete set null,
  resolution_note text,
  constraint club_directory_correction_requests_request_key_key unique (request_key),
  constraint club_directory_correction_requests_submit_request_key
    unique (requester_user_id, submit_request_id),
  constraint club_directory_correction_requests_request_key_check check (
    request_key ~ '^[0-9a-f]{32}$'
  ),
  constraint club_directory_correction_requests_target_check check (
    correction_target in (
      'club_name',
      'region',
      'home_course',
      'schedule',
      'recruit_status',
      'join_conditions',
      'contact',
      'introduction',
      'other'
    )
  ),
  constraint club_directory_correction_requests_displayed_value_check check (
    displayed_value is null
    or (
      displayed_value = pg_catalog.btrim(displayed_value)
      and displayed_value <> ''
      and pg_catalog.char_length(displayed_value) <= 500
    )
  ),
  constraint club_directory_correction_requests_proposed_value_check check (
    proposed_value = pg_catalog.btrim(proposed_value)
    and pg_catalog.char_length(proposed_value) between 2 and 500
  ),
  constraint club_directory_correction_requests_reason_check check (
    reason = pg_catalog.btrim(reason)
    and pg_catalog.char_length(reason) between 2 and 500
  ),
  constraint club_directory_correction_requests_note_check check (
    note is null
    or (
      note = pg_catalog.btrim(note)
      and note <> ''
      and pg_catalog.char_length(note) <= 500
    )
  ),
  constraint club_directory_correction_requests_status_check check (
    request_status in ('pending', 'completed', 'closed')
  ),
  constraint club_directory_correction_requests_version_check check (version >= 1),
  constraint club_directory_correction_requests_resolution_note_check check (
    resolution_note is null
    or (
      resolution_note = pg_catalog.btrim(resolution_note)
      and pg_catalog.char_length(resolution_note) between 2 and 500
    )
  ),
  constraint club_directory_correction_requests_resolution_check check (
    (
      request_status = 'pending'
      and resolved_at is null
      and resolved_by is null
      and resolution_note is null
    )
    or (
      request_status in ('completed', 'closed')
      and resolved_at is not null
      and resolved_by is not null
      and resolution_note is not null
    )
  )
);

comment on table public.club_directory_correction_requests is
  'Private active-account club directory correction reports. Resolution records operator acknowledgement only and never mutates clubs.';
comment on column public.club_directory_correction_requests.request_key is
  'Privacy-minimized public management identifier; internal UUIDs are not exposed by RPCs.';
comment on column public.club_directory_correction_requests.submit_request_id is
  'Client mutation request identifier correlated with the private idempotency ledger and audit log.';

create unique index club_directory_correction_requests_one_pending_target_idx
  on public.club_directory_correction_requests (
    club_id,
    requester_user_id,
    correction_target
  )
  where request_status = 'pending';

create index club_directory_correction_requests_status_created_idx
  on public.club_directory_correction_requests (
    request_status,
    created_at desc,
    request_key
  );

create index club_directory_correction_requests_club_status_created_idx
  on public.club_directory_correction_requests (
    club_id,
    request_status,
    created_at desc,
    request_key
  );

create trigger club_directory_correction_requests_set_updated_at
before update on public.club_directory_correction_requests
for each row execute function public.set_user_foundation_updated_at();

alter table public.club_directory_correction_requests enable row level security;
alter table public.club_directory_correction_requests force row level security;

revoke all on table public.club_directory_correction_requests
  from public, anon, authenticated, service_role;

create function private.club_directory_correction_actor_can_manage(
  p_actor_id uuid,
  p_club_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    private.club_user_has_permission(
      p_actor_id,
      p_club_id,
      'club.settings.manage'
    )
    or exists (
      select 1
      from public.user_accounts as account
      join public.platform_role_permissions as mapping
        on mapping.platform_role = account.platform_role
      join public.platform_permission_definitions as permission
        on permission.code = mapping.permission_code
       and permission.is_active
      where account.id = p_actor_id
        and account.account_status = 'active'
        and mapping.permission_code = 'clubs.directory_corrections.manage'
    ),
    false
  );
$$;

comment on function private.club_directory_correction_actor_can_manage(uuid, uuid) is
  'Checks an active actor for exact-club settings management or the platform-wide correction permission.';
revoke all on function private.club_directory_correction_actor_can_manage(uuid, uuid)
  from public, anon, authenticated, service_role;

create function public.submit_club_directory_correction_request(
  p_request_id uuid,
  p_club_public_key text,
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
  v_actor_role text;
  v_account_status text;
  v_club_public_key text := nullif(pg_catalog.btrim(p_club_public_key), '');
  v_club_id uuid;
  v_target text;
  v_displayed_value text;
  v_proposed_value text;
  v_reason text;
  v_note text;
  v_fingerprint text;
  v_request public.club_directory_correction_requests%rowtype;
  v_result jsonb;
  v_ledger_action text;
  v_ledger_target_user_id uuid;
  v_ledger_role_code text;
  v_ledger_fingerprint text;
  v_ledger_result jsonb;
  v_ledger_completed_at timestamptz;
  v_completed_count integer;
begin
  if v_actor_id is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception '제보 request ID가 필요합니다.' using errcode = '22023';
  end if;
  if v_club_public_key is null
     or pg_catalog.char_length(v_club_public_key) > 64
     or v_club_public_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' then
    raise exception '제보할 동호회를 확인해 주세요.' using errcode = '22023';
  end if;
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception '제보 내용을 확인해 주세요.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_object_keys(p_payload) as key(value)
    where key.value not in (
      'target',
      'displayed_value',
      'proposed_value',
      'reason',
      'note'
    )
  ) then
    raise exception '지원하지 않는 제보 항목입니다.' using errcode = '22023';
  end if;

  v_target := nullif(pg_catalog.btrim(p_payload ->> 'target'), '');
  v_displayed_value := nullif(pg_catalog.btrim(p_payload ->> 'displayed_value'), '');
  v_proposed_value := nullif(pg_catalog.btrim(p_payload ->> 'proposed_value'), '');
  v_reason := nullif(pg_catalog.btrim(p_payload ->> 'reason'), '');
  v_note := nullif(pg_catalog.btrim(p_payload ->> 'note'), '');

  if v_target is null or v_target not in (
    'club_name',
    'region',
    'home_course',
    'schedule',
    'recruit_status',
    'join_conditions',
    'contact',
    'introduction',
    'other'
  ) then
    raise exception '수정 대상을 확인해 주세요.' using errcode = '22023';
  end if;
  if v_displayed_value is not null
     and pg_catalog.char_length(v_displayed_value) > 500 then
    raise exception '현재 표시된 내용은 500자 이하로 입력해 주세요.' using errcode = '22023';
  end if;
  if v_target = 'other' and v_displayed_value is null then
    raise exception '기타 수정 대상의 현재 표시 내용을 입력해 주세요.' using errcode = '22023';
  end if;
  if v_proposed_value is null
     or pg_catalog.char_length(v_proposed_value) not between 2 and 500 then
    raise exception '변경이 필요한 내용은 2~500자로 입력해 주세요.' using errcode = '22023';
  end if;
  if v_reason is null or pg_catalog.char_length(v_reason) not between 2 and 500 then
    raise exception '변경 사유 또는 확인 근거는 2~500자로 입력해 주세요.' using errcode = '22023';
  end if;
  if v_note is not null and pg_catalog.char_length(v_note) > 500 then
    raise exception '참고사항은 500자 이하로 입력해 주세요.' using errcode = '22023';
  end if;

  v_fingerprint := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.concat_ws(
          E'\x1f',
          'club.directory_correction.submit',
          v_club_public_key,
          v_target,
          coalesce(v_displayed_value, ''),
          v_proposed_value,
          v_reason,
          coalesce(v_note, '')
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
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
    if v_ledger_action is distinct from 'club.directory_correction.submit'
       or v_ledger_target_user_id is distinct from v_actor_id
       or v_ledger_role_code is not null
       or v_ledger_fingerprint is distinct from v_fingerprint then
      raise exception '동일한 request ID를 다른 제보에 재사용할 수 없습니다.'
        using errcode = '40901';
    end if;
    if v_ledger_completed_at is null or v_ledger_result is null then
      raise exception '동일한 제보 요청이 처리 중입니다.' using errcode = '40901';
    end if;
    return v_ledger_result || pg_catalog.jsonb_build_object('replayed', true);
  end if;

  select account.account_status, account.platform_role
  into v_account_status, v_actor_role
  from public.user_accounts as account
  where account.id = v_actor_id
  for share;

  if not found or v_account_status <> 'active' then
    raise exception '정상 활동 계정만 동호회 정보를 제보할 수 있습니다.'
      using errcode = '42501';
  end if;

  select club.id
  into v_club_id
  from public.clubs as club
  where club.legacy_key = v_club_public_key
    and club.club_status = 'active'
  for share;

  if not found then
    raise exception '현재 제보할 수 있는 동호회를 찾을 수 없습니다.'
      using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.club_directory_correction_requests as existing
    where existing.club_id = v_club_id
      and existing.requester_user_id = v_actor_id
      and existing.correction_target = v_target
      and existing.request_status = 'pending'
  ) then
    raise exception '같은 수정 대상에 처리 대기 중인 제보가 있습니다.'
      using errcode = '40901';
  end if;

  insert into public.club_directory_correction_requests (
    club_id,
    requester_user_id,
    submit_request_id,
    correction_target,
    displayed_value,
    proposed_value,
    reason,
    note
  ) values (
    v_club_id,
    v_actor_id,
    p_request_id,
    v_target,
    v_displayed_value,
    v_proposed_value,
    v_reason,
    v_note
  )
  returning * into v_request;

  insert into private.club_mutation_requests (
    actor_id,
    request_id,
    action_code,
    club_id,
    target_user_id,
    input_fingerprint
  ) values (
    v_actor_id,
    p_request_id,
    'club.directory_correction.submit',
    v_club_id,
    v_actor_id,
    v_fingerprint
  );

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
    v_actor_role,
    'club.directory_correction.submit',
    'club_directory_correction_request',
    v_request.request_key,
    v_club_id::text,
    null,
    pg_catalog.jsonb_build_object(
      'status', v_request.request_status,
      'target', v_request.correction_target,
      'version', v_request.version
    ),
    '동호회 정보 수정 제보 접수',
    pg_catalog.jsonb_build_object('club_public_key', v_club_public_key),
    p_request_id,
    'success'
  );

  v_result := pg_catalog.jsonb_build_object(
    'request_id', p_request_id,
    'request_key', v_request.request_key,
    'club_public_key', v_club_public_key,
    'request_status', v_request.request_status,
    'version', v_request.version,
    'created_at', v_request.created_at,
    'replayed', false
  );

  update private.club_mutation_requests as ledger
  set outcome = 'success',
      result_data = v_result,
      completed_at = pg_catalog.now()
  where ledger.actor_id = v_actor_id
    and ledger.request_id = p_request_id
    and ledger.action_code = 'club.directory_correction.submit'
    and ledger.club_id = v_club_id
    and ledger.target_user_id = v_actor_id
    and ledger.role_code is null
    and ledger.input_fingerprint = v_fingerprint
    and ledger.outcome is null
    and ledger.result_data is null
    and ledger.completed_at is null;

  get diagnostics v_completed_count = row_count;
  if v_completed_count <> 1 then
    raise exception '제보 요청 완료 상태를 기록할 수 없습니다.';
  end if;

  return v_result;
exception
  when unique_violation then
    raise exception '같은 수정 대상에 처리 대기 중인 제보가 있습니다.'
      using errcode = '40901';
end;
$$;

comment on function public.submit_club_directory_correction_request(uuid, text, jsonb) is
  'Active authenticated correction submission with normalized payload fingerprinting, replay safety, one pending target guard, and no club mutation.';
revoke all on function public.submit_club_directory_correction_request(uuid, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_club_directory_correction_request(uuid, text, jsonb)
  to authenticated;

create function public.list_club_directory_correction_requests_for_management(
  p_club_public_key text default null,
  p_status text default 'pending',
  p_limit integer default 30,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_club_public_key text := nullif(pg_catalog.btrim(p_club_public_key), '');
  v_club_id uuid;
  v_is_platform_manager boolean := false;
  v_total integer;
  v_items jsonb;
begin
  if v_actor_id is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('pending', 'completed', 'closed') then
    raise exception '제보 상태를 확인해 주세요.' using errcode = '22023';
  end if;
  if p_limit is null or p_limit not between 1 and 50
     or p_offset is null or p_offset < 0 then
    raise exception '페이지 범위를 확인해 주세요.' using errcode = '22023';
  end if;

  select exists (
    select 1
    from public.user_accounts as account
    join public.platform_role_permissions as mapping
      on mapping.platform_role = account.platform_role
    join public.platform_permission_definitions as permission
      on permission.code = mapping.permission_code
     and permission.is_active
    where account.id = v_actor_id
      and account.account_status = 'active'
      and mapping.permission_code = 'clubs.directory_corrections.manage'
  ) into v_is_platform_manager;

  if v_club_public_key is not null then
    if pg_catalog.char_length(v_club_public_key) > 64
       or v_club_public_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' then
      raise exception '관리할 동호회를 확인해 주세요.' using errcode = '22023';
    end if;
    select club.id
    into v_club_id
    from public.clubs as club
    where club.legacy_key = v_club_public_key
      and club.club_status = 'active';
    if not found then
      raise exception '관리할 동호회를 찾을 수 없습니다.' using errcode = 'P0002';
    end if;
    if not private.club_directory_correction_actor_can_manage(v_actor_id, v_club_id) then
      raise exception '동호회 정보 수정 제보 관리 권한이 없습니다.' using errcode = '42501';
    end if;
  elsif not v_is_platform_manager then
    raise exception '플랫폼 동호회 정보 수정 제보 관리 권한이 없습니다.'
      using errcode = '42501';
  end if;

  select pg_catalog.count(*)::integer
  into v_total
  from public.club_directory_correction_requests as request
  where (v_club_id is null or request.club_id = v_club_id)
    and (p_status is null or request.request_status = p_status);

  with page as (
    select request.*
    from public.club_directory_correction_requests as request
    where (v_club_id is null or request.club_id = v_club_id)
      and (p_status is null or request.request_status = p_status)
    order by request.created_at desc, request.request_key
    limit p_limit
    offset p_offset
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'request_key', page.request_key,
        'club_public_key', club.legacy_key,
        'club_name', club.name,
        'requester_label', '로그인 회원',
        'correction_target', page.correction_target,
        'proposed_value_preview', pg_catalog.left(page.proposed_value, 160),
        'request_status', page.request_status,
        'version', page.version,
        'created_at', page.created_at,
        'updated_at', page.updated_at,
        'resolved_at', page.resolved_at
      ) order by page.created_at desc, page.request_key
    ),
    '[]'::jsonb
  )
  into v_items
  from page
  join public.clubs as club on club.id = page.club_id;

  return pg_catalog.jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', p_offset + pg_catalog.jsonb_array_length(v_items) < v_total
  );
end;
$$;

comment on function public.list_club_directory_correction_requests_for_management(text, text, integer, integer) is
  'Bounded privacy-minimized correction Inbox for exact-club settings managers or platform correction managers.';
revoke all on function public.list_club_directory_correction_requests_for_management(text, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_club_directory_correction_requests_for_management(text, text, integer, integer)
  to authenticated;

create function public.get_club_directory_correction_request_for_management(
  p_request_key text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_request_key text := nullif(pg_catalog.btrim(p_request_key), '');
  v_request public.club_directory_correction_requests%rowtype;
  v_club_public_key text;
  v_club_name text;
begin
  if v_actor_id is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  if v_request_key is null or v_request_key !~ '^[0-9a-f]{32}$' then
    raise exception '확인할 제보를 선택해 주세요.' using errcode = '22023';
  end if;

  select request.*
  into v_request
  from public.club_directory_correction_requests as request
  where request.request_key = v_request_key;

  if not found
     or not private.club_directory_correction_actor_can_manage(
       v_actor_id,
       v_request.club_id
     ) then
    raise exception '제보를 찾을 수 없거나 조회 권한이 없습니다.'
      using errcode = '42501';
  end if;

  select club.legacy_key, club.name
  into v_club_public_key, v_club_name
  from public.clubs as club
  where club.id = v_request.club_id;

  return pg_catalog.jsonb_build_object(
    'request_key', v_request.request_key,
    'club_public_key', v_club_public_key,
    'club_name', v_club_name,
    'requester_label', '로그인 회원',
    'correction_target', v_request.correction_target,
    'displayed_value', v_request.displayed_value,
    'proposed_value', v_request.proposed_value,
    'reason', v_request.reason,
    'note', v_request.note,
    'request_status', v_request.request_status,
    'version', v_request.version,
    'created_at', v_request.created_at,
    'updated_at', v_request.updated_at,
    'resolved_at', v_request.resolved_at,
    'resolver_label', case
      when v_request.resolved_by is null then null
      when exists (
        select 1
        from public.user_accounts as resolver
        where resolver.id = v_request.resolved_by
          and resolver.platform_role = 'platform_admin'
      ) then 'PUL 관리자'
      else '동호회 운영진'
    end,
    'resolution_note', v_request.resolution_note
  );
end;
$$;

comment on function public.get_club_directory_correction_request_for_management(text) is
  'Privacy-minimized correction detail authorized by the request club, without requester or resolver identifiers.';
revoke all on function public.get_club_directory_correction_request_for_management(text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_club_directory_correction_request_for_management(text)
  to authenticated;

create function public.resolve_club_directory_correction_request(
  p_request_key text,
  p_expected_version integer,
  p_resolution text,
  p_resolution_note text,
  p_request_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_request_key text := nullif(pg_catalog.btrim(p_request_key), '');
  v_resolution_note text := nullif(pg_catalog.btrim(p_resolution_note), '');
  v_action text;
  v_fingerprint text;
  v_request public.club_directory_correction_requests%rowtype;
  v_club_public_key text;
  v_result jsonb;
  v_ledger_action text;
  v_ledger_target_user_id uuid;
  v_ledger_role_code text;
  v_ledger_fingerprint text;
  v_ledger_result jsonb;
  v_ledger_completed_at timestamptz;
  v_completed_count integer;
begin
  if v_actor_id is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception '처리 request ID가 필요합니다.' using errcode = '22023';
  end if;
  if v_request_key is null or v_request_key !~ '^[0-9a-f]{32}$' then
    raise exception '처리할 제보를 확인해 주세요.' using errcode = '22023';
  end if;
  if p_expected_version is null or p_expected_version < 1 then
    raise exception '제보 version을 확인해 주세요.' using errcode = '22023';
  end if;
  if p_resolution is null or p_resolution not in ('completed', 'closed') then
    raise exception '처리 결과를 확인해 주세요.' using errcode = '22023';
  end if;
  if v_resolution_note is null
     or pg_catalog.char_length(v_resolution_note) not between 2 and 500 then
    raise exception '처리 메모는 2~500자로 입력해 주세요.' using errcode = '22023';
  end if;

  v_action := case p_resolution
    when 'completed' then 'club.directory_correction.complete'
    else 'club.directory_correction.close'
  end;
  v_fingerprint := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.concat_ws(
          E'\x1f',
          v_action,
          v_request_key,
          p_expected_version::text,
          v_resolution_note
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
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
    if v_ledger_action is distinct from v_action
       or v_ledger_role_code is not null
       or v_ledger_fingerprint is distinct from v_fingerprint then
      raise exception '동일한 request ID를 다른 제보 처리에 재사용할 수 없습니다.'
        using errcode = '40901';
    end if;
    if v_ledger_completed_at is null or v_ledger_result is null then
      raise exception '동일한 제보 처리가 진행 중입니다.' using errcode = '40901';
    end if;
    return v_ledger_result || pg_catalog.jsonb_build_object('replayed', true);
  end if;

  select request.*
  into v_request
  from public.club_directory_correction_requests as request
  where request.request_key = v_request_key
  for update of request;

  if not found
     or not private.club_directory_correction_actor_can_manage(
       v_actor_id,
       v_request.club_id
     ) then
    raise exception '제보를 찾을 수 없거나 처리 권한이 없습니다.'
      using errcode = '42501';
  end if;
  select club.legacy_key
  into v_club_public_key
  from public.clubs as club
  where club.id = v_request.club_id;
  if v_request.request_status <> 'pending' then
    raise exception '이미 처리된 동호회 정보 수정 제보입니다.'
      using errcode = '40901';
  end if;
  if v_request.version <> p_expected_version then
    raise exception '제보 상태가 변경되었습니다. 최신 내용을 다시 확인해 주세요.'
      using errcode = '40001';
  end if;

  select account.platform_role
  into v_actor_role
  from public.user_accounts as account
  where account.id = v_actor_id
    and account.account_status = 'active';
  if not found then
    raise exception '현재 계정 상태에서는 제보를 처리할 수 없습니다.'
      using errcode = '42501';
  end if;

  insert into private.club_mutation_requests (
    actor_id,
    request_id,
    action_code,
    club_id,
    target_user_id,
    input_fingerprint
  ) values (
    v_actor_id,
    p_request_id,
    v_action,
    v_request.club_id,
    v_request.requester_user_id,
    v_fingerprint
  );

  update public.club_directory_correction_requests as request
  set request_status = p_resolution,
      version = request.version + 1,
      resolved_at = pg_catalog.now(),
      resolved_by = v_actor_id,
      resolution_note = v_resolution_note
  where request.id = v_request.id
    and request.request_status = 'pending'
    and request.version = p_expected_version
  returning * into v_request;

  if not found then
    raise exception '제보 상태가 변경되었습니다. 최신 내용을 다시 확인해 주세요.'
      using errcode = '40001';
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
    'operator',
    v_actor_role,
    v_action,
    'club_directory_correction_request',
    v_request.request_key,
    v_request.club_id::text,
    pg_catalog.jsonb_build_object(
      'status', 'pending',
      'version', p_expected_version
    ),
    pg_catalog.jsonb_build_object(
      'status', v_request.request_status,
      'version', v_request.version
    ),
    '동호회 정보 수정 제보 운영 처리',
    pg_catalog.jsonb_build_object(
      'club_public_key', v_club_public_key,
      'resolution', p_resolution
    ),
    p_request_id,
    'success'
  );

  v_result := pg_catalog.jsonb_build_object(
    'request_id', p_request_id,
    'request_key', v_request.request_key,
    'club_public_key', v_club_public_key,
    'request_status', v_request.request_status,
    'version', v_request.version,
    'resolved_at', v_request.resolved_at,
    'replayed', false
  );

  update private.club_mutation_requests as ledger
  set outcome = 'success',
      result_data = v_result,
      completed_at = pg_catalog.now()
  where ledger.actor_id = v_actor_id
    and ledger.request_id = p_request_id
    and ledger.action_code = v_action
    and ledger.club_id = v_request.club_id
    and ledger.target_user_id = v_request.requester_user_id
    and ledger.role_code is null
    and ledger.input_fingerprint = v_fingerprint
    and ledger.outcome is null
    and ledger.result_data is null
    and ledger.completed_at is null;

  get diagnostics v_completed_count = row_count;
  if v_completed_count <> 1 then
    raise exception '제보 처리 완료 상태를 기록할 수 없습니다.';
  end if;

  return v_result;
end;
$$;

comment on function public.resolve_club_directory_correction_request(text, integer, text, text, uuid) is
  'Exact-club or platform correction manager terminal resolution with optimistic versioning, replay safety, audit, and no club mutation.';
revoke all on function public.resolve_club_directory_correction_request(text, integer, text, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_club_directory_correction_request(text, integer, text, text, uuid)
  to authenticated;
