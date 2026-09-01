-- PUL club directory correction request hardening.
-- Keeps the existing public contract while tightening payload typing,
-- canonicalizing submit fingerprints, and preserving terminal history when
-- a resolver account is removed.

alter table public.club_directory_correction_requests
  drop constraint club_directory_correction_requests_resolution_check;

alter table public.club_directory_correction_requests
  add constraint club_directory_correction_requests_resolution_check check (
    (
      request_status = 'pending'
      and resolved_at is null
      and resolved_by is null
      and resolution_note is null
    )
    or (
      request_status in ('completed', 'closed')
      and resolved_at is not null
      and resolution_note is not null
    )
  );

comment on constraint club_directory_correction_requests_resolution_check
  on public.club_directory_correction_requests is
  'Pending rows have no resolution metadata. Terminal rows retain timestamp and note while resolver attribution may become null after account deletion.';

create or replace function public.submit_club_directory_correction_request(
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

  if not p_payload ? 'target'
     or pg_catalog.jsonb_typeof(p_payload -> 'target') <> 'string' then
    raise exception '수정 대상은 문자열로 입력해 주세요.' using errcode = '22023';
  end if;
  if p_payload ? 'displayed_value'
     and pg_catalog.jsonb_typeof(p_payload -> 'displayed_value') not in ('string', 'null') then
    raise exception '현재 표시된 내용은 문자열로 입력해 주세요.' using errcode = '22023';
  end if;
  if not p_payload ? 'proposed_value'
     or pg_catalog.jsonb_typeof(p_payload -> 'proposed_value') <> 'string' then
    raise exception '변경이 필요한 내용은 문자열로 입력해 주세요.' using errcode = '22023';
  end if;
  if not p_payload ? 'reason'
     or pg_catalog.jsonb_typeof(p_payload -> 'reason') <> 'string' then
    raise exception '변경 사유 또는 확인 근거는 문자열로 입력해 주세요.' using errcode = '22023';
  end if;
  if p_payload ? 'note'
     and pg_catalog.jsonb_typeof(p_payload -> 'note') not in ('string', 'null') then
    raise exception '참고사항은 문자열로 입력해 주세요.' using errcode = '22023';
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
        pg_catalog.jsonb_build_object(
          'action', 'club.directory_correction.submit',
          'club_public_key', v_club_public_key,
          'target', v_target,
          'displayed_value', v_displayed_value,
          'proposed_value', v_proposed_value,
          'reason', v_reason,
          'note', v_note
        )::text,
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
  'Active authenticated correction submission with strict JSON string typing, canonical payload fingerprints, replay safety, one pending target guard, and no club mutation.';

revoke all on function public.submit_club_directory_correction_request(uuid, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_club_directory_correction_request(uuid, text, jsonb)
  to authenticated;
