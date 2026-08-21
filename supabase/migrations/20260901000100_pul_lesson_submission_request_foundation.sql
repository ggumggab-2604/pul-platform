create table public.lesson_submission_requests (
  id uuid primary key default gen_random_uuid(),
  request_key text not null default pg_catalog.replace(gen_random_uuid()::text, '-', ''),
  requester_user_id uuid not null references public.user_accounts (id),
  client_request_id uuid not null,
  request_fingerprint text not null,
  request_type text not null,
  title text not null,
  provider_name text not null,
  region text,
  category text,
  summary text not null,
  source_url text not null,
  secondary_url text,
  request_status text not null default 'pending',
  version integer not null default 1,
  result_public_key text,
  resolution_note text,
  processed_at timestamptz,
  processed_by uuid references public.user_accounts (id),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint lesson_submission_requests_request_key_uidx unique (request_key),
  constraint lesson_submission_requests_actor_request_uidx unique (requester_user_id, client_request_id),
  constraint lesson_submission_requests_request_key_check check (
    request_key = pg_catalog.btrim(request_key)
    and request_key ~ '^[0-9a-f]{32}$'
  ),
  constraint lesson_submission_requests_fingerprint_check check (
    request_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  constraint lesson_submission_requests_type_check check (request_type in ('lesson', 'video')),
  constraint lesson_submission_requests_title_check check (
    title = pg_catalog.btrim(title)
    and pg_catalog.char_length(title) between 2 and 160
  ),
  constraint lesson_submission_requests_provider_check check (
    provider_name = pg_catalog.btrim(provider_name)
    and pg_catalog.char_length(provider_name) between 1 and 160
  ),
  constraint lesson_submission_requests_region_check check (
    region is null
    or region in ('서울', '경기', '인천', '충청', '강원', '전라', '경상', '제주')
  ),
  constraint lesson_submission_requests_category_check check (
    category is null
    or category in (
      'beginner_intro', 'basic_stance', 'swing', 'tee_shot', 'putting', 'approach',
      'distance_control', 'direction', 'rules_manner', 'practical_strategy', 'equipment',
      'club_reservation', 'tournament_prep', 'cert_referee', 'other'
    )
  ),
  constraint lesson_submission_requests_summary_check check (
    summary = pg_catalog.btrim(summary)
    and pg_catalog.char_length(summary) between 10 and 2000
  ),
  constraint lesson_submission_requests_source_url_check check (
    private.valid_lesson_external_url(source_url)
  ),
  constraint lesson_submission_requests_secondary_url_check check (
    private.valid_lesson_external_url(secondary_url)
  ),
  constraint lesson_submission_requests_type_shape_check check (
    (
      request_type = 'lesson'
      and region is not null
      and category is null
    )
    or (
      request_type = 'video'
      and region is null
      and category is not null
      and secondary_url is null
      and private.valid_lesson_youtube_url(source_url)
    )
  ),
  constraint lesson_submission_requests_status_check check (
    request_status in ('pending', 'completed', 'rejected')
  ),
  constraint lesson_submission_requests_version_check check (version >= 1),
  constraint lesson_submission_requests_result_key_check check (
    result_public_key is null
    or (
      result_public_key = pg_catalog.btrim(result_public_key)
      and result_public_key ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'
    )
  ),
  constraint lesson_submission_requests_resolution_note_check check (
    resolution_note is null
    or (
      resolution_note = pg_catalog.btrim(resolution_note)
      and pg_catalog.char_length(resolution_note) between 2 and 500
    )
  ),
  constraint lesson_submission_requests_resolution_shape_check check (
    (
      request_status = 'pending'
      and result_public_key is null
      and resolution_note is null
      and processed_at is null
      and processed_by is null
    )
    or (
      request_status = 'completed'
      and result_public_key is not null
      and processed_at is not null
      and processed_by is not null
    )
    or (
      request_status = 'rejected'
      and result_public_key is null
      and resolution_note is not null
      and processed_at is not null
      and processed_by is not null
    )
  )
);

comment on table public.lesson_submission_requests is
  'Private member requests for operator-reviewed lesson or external YouTube directory registration.';

create index lesson_submission_requests_requester_created_idx
  on public.lesson_submission_requests (requester_user_id, created_at desc, request_key);

create index lesson_submission_requests_status_created_idx
  on public.lesson_submission_requests (request_status, created_at, request_key);

create trigger lesson_submission_requests_set_updated_at
before update on public.lesson_submission_requests
for each row execute function public.set_user_foundation_updated_at();

alter table public.lesson_submission_requests enable row level security;
alter table public.lesson_submission_requests force row level security;

create policy lesson_submission_requests_own_select
on public.lesson_submission_requests
for select
to authenticated
using (requester_user_id = auth.uid());

create policy lesson_submission_requests_manager_select
on public.lesson_submission_requests
for select
to authenticated
using (
  exists (
    select 1
    from public.user_accounts as account
    join public.platform_role_permissions as mapping
      on mapping.platform_role = account.platform_role
    join public.platform_permission_definitions as permission
      on permission.code = mapping.permission_code
     and permission.is_active
    where account.id = auth.uid()
      and account.account_status = 'active'
      and mapping.permission_code = 'lessons.manage'
  )
);

revoke all on table public.lesson_submission_requests
  from public, anon, authenticated, service_role;

create function private.lesson_submission_requester_json(
  p_request public.lesson_submission_requests
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'request_key', p_request.request_key,
    'request_type', p_request.request_type,
    'title', p_request.title,
    'provider_name', p_request.provider_name,
    'region', p_request.region,
    'category', p_request.category,
    'summary', p_request.summary,
    'source_url', p_request.source_url,
    'secondary_url', p_request.secondary_url,
    'request_status', p_request.request_status,
    'result_public_key', p_request.result_public_key,
    'resolution_note', p_request.resolution_note,
    'created_at', p_request.created_at,
    'updated_at', p_request.updated_at
  );
$$;

revoke all on function private.lesson_submission_requester_json(public.lesson_submission_requests)
  from public, anon, authenticated, service_role;

create function private.lesson_submission_manager_json(
  p_request public.lesson_submission_requests,
  p_requester_display_name text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.lesson_submission_requester_json(p_request)
    || pg_catalog.jsonb_build_object(
      'requester_display_name', p_requester_display_name,
      'version', p_request.version,
      'processed_at', p_request.processed_at
    );
$$;

revoke all on function private.lesson_submission_manager_json(public.lesson_submission_requests, text)
  from public, anon, authenticated, service_role;

create function public.submit_lesson_submission_request(
  p_request_id uuid,
  p_request_type text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_request public.lesson_submission_requests%rowtype;
  v_type text := pg_catalog.lower(pg_catalog.btrim(p_request_type));
  v_title text;
  v_provider_name text;
  v_region text;
  v_category text;
  v_summary text;
  v_source_url text;
  v_secondary_url text;
  v_fingerprint text;
begin
  if v_actor_id is null then
    raise exception '로그인이 필요합니다.';
  end if;
  if p_request_id is null then
    raise exception '요청 식별값을 확인해 주세요.';
  end if;
  if v_type not in ('lesson', 'video') then
    raise exception '등록 요청 종류를 확인해 주세요.';
  end if;
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception '등록 요청 입력값을 확인해 주세요.';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_object_keys(p_payload) as supplied(key)
    where supplied.key not in (
      'title', 'provider_name', 'region', 'category', 'summary', 'source_url', 'secondary_url'
    )
  ) or (
    select pg_catalog.count(*)
    from pg_catalog.jsonb_object_keys(p_payload)
  ) <> 7 then
    raise exception '지원하지 않는 등록 요청 입력값이 포함되어 있습니다.';
  end if;

  v_title := pg_catalog.regexp_replace(pg_catalog.btrim(p_payload ->> 'title'), '\s+', ' ', 'g');
  v_provider_name := pg_catalog.regexp_replace(pg_catalog.btrim(p_payload ->> 'provider_name'), '\s+', ' ', 'g');
  v_region := nullif(pg_catalog.btrim(p_payload ->> 'region'), '');
  v_category := nullif(pg_catalog.btrim(p_payload ->> 'category'), '');
  v_summary := pg_catalog.btrim(p_payload ->> 'summary');
  v_source_url := pg_catalog.btrim(p_payload ->> 'source_url');
  v_secondary_url := nullif(pg_catalog.btrim(p_payload ->> 'secondary_url'), '');

  if v_title is null or pg_catalog.char_length(v_title) not between 2 and 160 then
    raise exception '제목은 2~160자로 입력해 주세요.';
  end if;
  if v_provider_name is null or pg_catalog.char_length(v_provider_name) not between 1 and 160 then
    raise exception '강사·기관·채널명은 1~160자로 입력해 주세요.';
  end if;
  if v_summary is null or pg_catalog.char_length(v_summary) not between 10 and 2000 then
    raise exception '간단한 소개는 10~2000자로 입력해 주세요.';
  end if;
  if not private.valid_lesson_external_url(v_source_url) then
    raise exception '공식 안내 URL은 https 주소로 입력해 주세요.';
  end if;
  if v_secondary_url is not null and not private.valid_lesson_external_url(v_secondary_url) then
    raise exception '문의·신청 URL은 https 주소로 입력해 주세요.';
  end if;

  if v_type = 'lesson' then
    if v_region not in ('서울', '경기', '인천', '충청', '강원', '전라', '경상', '제주')
       or v_category is not null then
      raise exception '레슨·교육 지역을 확인해 주세요.';
    end if;
  else
    if v_region is not null or v_secondary_url is not null
       or v_category not in (
         'beginner_intro', 'basic_stance', 'swing', 'tee_shot', 'putting', 'approach',
         'distance_control', 'direction', 'rules_manner', 'practical_strategy', 'equipment',
         'club_reservation', 'tournament_prep', 'cert_referee', 'other'
       ) then
      raise exception '무료 영상 카테고리를 확인해 주세요.';
    end if;
    if not private.valid_lesson_youtube_url(v_source_url) then
      raise exception '올바른 YouTube 주소를 입력해 주세요.';
    end if;
  end if;

  perform 1
  from public.user_accounts as account
  where account.id = v_actor_id
    and account.account_status = 'active'
  for share;
  if not found then
    raise exception '현재 계정으로는 등록 요청을 제출할 수 없습니다.';
  end if;

  v_fingerprint := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'request_type', v_type,
          'title', v_title,
          'provider_name', v_provider_name,
          'region', v_region,
          'category', v_category,
          'summary', v_summary,
          'source_url', v_source_url,
          'secondary_url', v_secondary_url
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  select request.*
  into v_request
  from public.lesson_submission_requests as request
  where request.requester_user_id = v_actor_id
    and request.client_request_id = p_request_id
  for update;
  if found then
    if v_request.request_fingerprint <> v_fingerprint then
      raise exception '같은 요청 식별값을 다른 내용에 재사용할 수 없습니다.';
    end if;
    return pg_catalog.jsonb_build_object(
      'request_key', v_request.request_key,
      'request_status', v_request.request_status,
      'version', v_request.version,
      'replayed', true
    );
  end if;

  insert into public.lesson_submission_requests (
    requester_user_id, client_request_id, request_fingerprint, request_type,
    title, provider_name, region, category, summary, source_url, secondary_url
  ) values (
    v_actor_id, p_request_id, v_fingerprint, v_type,
    v_title, v_provider_name, v_region, v_category, v_summary, v_source_url, v_secondary_url
  )
  on conflict (requester_user_id, client_request_id) do nothing
  returning * into v_request;

  if not found then
    select request.*
    into v_request
    from public.lesson_submission_requests as request
    where request.requester_user_id = v_actor_id
      and request.client_request_id = p_request_id
    for update;
    if not found then
      raise exception '등록 요청을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.';
    end if;
    if v_request.request_fingerprint <> v_fingerprint then
      raise exception '같은 요청 식별값을 다른 내용에 재사용할 수 없습니다.';
    end if;
    return pg_catalog.jsonb_build_object(
      'request_key', v_request.request_key,
      'request_status', v_request.request_status,
      'version', v_request.version,
      'replayed', true
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'request_key', v_request.request_key,
    'request_status', v_request.request_status,
    'version', v_request.version,
    'replayed', false
  );
end;
$$;

revoke all on function public.submit_lesson_submission_request(uuid, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_lesson_submission_request(uuid, text, jsonb)
  to authenticated;

comment on function public.submit_lesson_submission_request(uuid, text, jsonb) is
  'Submits one private lesson or YouTube directory request for the active authenticated actor; client request UUID provides replay safety.';

create function public.list_my_lesson_submission_requests(
  p_limit integer default 20,
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
  v_total integer;
  v_items jsonb;
begin
  if v_actor_id is null then
    raise exception '로그인이 필요합니다.';
  end if;
  if p_limit not between 1 and 50 or p_offset < 0 then
    raise exception '페이지 범위를 확인해 주세요.';
  end if;
  select pg_catalog.count(*)::integer
  into v_total
  from public.lesson_submission_requests as request
  where request.requester_user_id = v_actor_id;

  select coalesce(pg_catalog.jsonb_agg(item.value order by item.created_at desc, item.request_key), '[]'::jsonb)
  into v_items
  from (
    select private.lesson_submission_requester_json(request) as value,
           request.created_at,
           request.request_key
    from public.lesson_submission_requests as request
    where request.requester_user_id = v_actor_id
    order by request.created_at desc, request.request_key
    limit p_limit offset p_offset
  ) as item;

  return pg_catalog.jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', p_offset + pg_catalog.jsonb_array_length(v_items) < v_total
  );
end;
$$;

revoke all on function public.list_my_lesson_submission_requests(integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_my_lesson_submission_requests(integer, integer)
  to authenticated;

create function public.list_lesson_submission_requests_for_management(
  p_status text default null,
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
  v_total integer;
  v_items jsonb;
  v_status text := nullif(pg_catalog.btrim(p_status), '');
begin
  perform private.require_lesson_directory_manager();
  if v_status is not null and v_status not in ('pending', 'completed', 'rejected') then
    raise exception '등록 요청 상태를 확인해 주세요.';
  end if;
  if p_limit not between 1 and 50 or p_offset < 0 then
    raise exception '페이지 범위를 확인해 주세요.';
  end if;

  select pg_catalog.count(*)::integer
  into v_total
  from public.lesson_submission_requests as request
  where v_status is null or request.request_status = v_status;

  select coalesce(pg_catalog.jsonb_agg(item.value order by item.created_at, item.request_key), '[]'::jsonb)
  into v_items
  from (
    select private.lesson_submission_manager_json(
             request,
             coalesce(nullif(profile.nickname, ''), 'PUL 회원')
           ) as value,
           request.created_at,
           request.request_key
    from public.lesson_submission_requests as request
    left join public.user_profiles as profile
      on profile.user_id = request.requester_user_id
    where v_status is null or request.request_status = v_status
    order by request.created_at, request.request_key
    limit p_limit offset p_offset
  ) as item;

  return pg_catalog.jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', p_offset + pg_catalog.jsonb_array_length(v_items) < v_total
  );
end;
$$;

revoke all on function public.list_lesson_submission_requests_for_management(text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_lesson_submission_requests_for_management(text, integer, integer)
  to authenticated;

create function public.resolve_lesson_submission_request(
  p_request_key text,
  p_expected_version integer,
  p_resolution text,
  p_directory_key text default null,
  p_directory_payload jsonb default null,
  p_resolution_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_request public.lesson_submission_requests%rowtype;
  v_key text := nullif(pg_catalog.btrim(p_request_key), '');
  v_directory_key text := nullif(pg_catalog.btrim(p_directory_key), '');
  v_resolution text := pg_catalog.lower(pg_catalog.btrim(p_resolution));
  v_note text := nullif(pg_catalog.btrim(p_resolution_note), '');
  v_directory_result jsonb;
begin
  v_actor_id := private.require_lesson_directory_manager();
  if v_key is null or v_key !~ '^[0-9a-f]{32}$' then
    raise exception '등록 요청을 찾을 수 없습니다.';
  end if;
  if p_expected_version is null or p_expected_version < 1 then
    raise exception '현재 version을 확인해 주세요.';
  end if;
  if v_resolution not in ('completed', 'rejected') then
    raise exception '등록 요청 처리 방식을 확인해 주세요.';
  end if;
  if v_note is not null and pg_catalog.char_length(v_note) not between 2 and 500 then
    raise exception '처리 메모는 2~500자로 입력해 주세요.';
  end if;

  select request.*
  into v_request
  from public.lesson_submission_requests as request
  where request.request_key = v_key
  for update;
  if not found then
    raise exception '등록 요청을 찾을 수 없습니다.';
  end if;
  if v_request.version <> p_expected_version then
    raise exception '등록 요청이 변경되었습니다. 최신 정보를 다시 확인해 주세요.';
  end if;
  if v_request.request_status <> 'pending' then
    raise exception '이미 처리된 등록 요청입니다.';
  end if;

  if v_resolution = 'completed' then
    if v_directory_key is null or v_directory_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'
       or p_directory_payload is null
       or pg_catalog.jsonb_typeof(p_directory_payload) <> 'object'
       or v_note is not null then
      raise exception '디렉터리 등록 입력값을 확인해 주세요.';
    end if;
    if v_request.request_type = 'lesson' then
      v_directory_result := public.mutate_lesson(
        'create', v_directory_key, null, p_directory_payload
      );
    else
      v_directory_result := public.mutate_lesson_video(
        'create', v_directory_key, null, p_directory_payload
      );
    end if;
    if v_directory_result ->> 'publication_status' <> 'hidden' then
      raise exception '디렉터리 초안 상태를 확인하지 못했습니다.';
    end if;
  else
    if v_directory_key is not null or p_directory_payload is not null or v_note is null then
      raise exception '반려 사유를 입력해 주세요.';
    end if;
  end if;

  update public.lesson_submission_requests as request
  set request_status = v_resolution,
      version = request.version + 1,
      result_public_key = case when v_resolution = 'completed' then v_directory_key else null end,
      resolution_note = case when v_resolution = 'rejected' then v_note else null end,
      processed_at = pg_catalog.now(),
      processed_by = v_actor_id
  where request.id = v_request.id
    and request.request_status = 'pending'
    and request.version = p_expected_version
  returning * into v_request;
  if not found then
    raise exception '등록 요청이 변경되었습니다. 최신 정보를 다시 확인해 주세요.';
  end if;

  return pg_catalog.jsonb_build_object(
    'request_key', v_request.request_key,
    'request_status', v_request.request_status,
    'version', v_request.version,
    'result_public_key', v_request.result_public_key
  );
end;
$$;

revoke all on function public.resolve_lesson_submission_request(text, integer, text, text, jsonb, text)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_lesson_submission_request(text, integer, text, text, jsonb, text)
  to authenticated;

comment on function public.resolve_lesson_submission_request(text, integer, text, text, jsonb, text) is
  'Operator-only atomic request resolution: creates a hidden directory draft through existing lesson mutation logic or rejects with a short note.';
