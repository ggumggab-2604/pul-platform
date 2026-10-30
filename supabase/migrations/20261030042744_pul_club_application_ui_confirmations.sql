-- Follow-up UI contract only. Existing applications/details are never rewritten.
-- Legacy callers retain the v1 three-confirmation contract and replay fingerprint.
-- New callers carry actual booleans plus the viewed rule snapshot in private details.
alter table public.club_membership_applications drop constraint club_membership_applications_guidelines_check;
alter table public.club_membership_applications add constraint club_membership_applications_guidelines_check
 check (guidelines_version in ('club-membership-application-guidelines-v1','club-membership-application-guidelines-v2'));

create or replace function private.validate_club_application_details(d jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare k text;v jsonb;c jsonb;
begin
 if jsonb_typeof(d) is distinct from 'object' or exists(select 1 from jsonb_object_keys(d) x where x not in('fullName','phone','level','lessonNeeded','otherClubs','previousActivity','averageScore','holes','days','confirmations')) then raise exception '가입 신청 정보를 확인해 주세요.';end if;
 if jsonb_typeof(d->'fullName') is distinct from 'string' or char_length(btrim(d->>'fullName')) not between 1 and 60 then raise exception '가입 신청 이름을 입력해 주세요.';end if;
 if jsonb_typeof(d->'phone') is distinct from 'string' or ((d->>'phone')!~'^[0-9+() -]{7,30}$' or char_length(regexp_replace(d->>'phone','[^0-9]','','g'))<7) then raise exception '가입 신청 전화번호를 확인해 주세요.';end if;
 for k,v in select key,value from jsonb_each(d) loop
  if k in('fullName','phone','level','lessonNeeded','otherClubs','previousActivity') then if jsonb_typeof(v)<>'string' or char_length(v#>>'{}')>500 then raise exception '선택 입력 길이와 형식을 확인해 주세요.';end if;
  elsif k in('averageScore','holes') then if v<>'null'::jsonb and (jsonb_typeof(v)<>'number' or v::text!~'^[1-9][0-9]{0,3}$') then raise exception '평균 타수와 홀 수를 확인해 주세요.';end if;
  elsif k='days' then if jsonb_typeof(v)<>'array' or jsonb_array_length(v)>7 or exists(select 1 from jsonb_array_elements_text(v) x where x not in('월','화','수','목','금','토','일')) then raise exception '참여 가능 요일을 확인해 주세요.';end if;
  end if;
 end loop;
 if d->>'holes' is not null and d->>'holes' not in('18','36') then raise exception '홀 수 기준은 18홀 또는 36홀을 선택해 주세요.';end if;
 if d->>'averageScore' is not null and coalesce(d->>'holes','') not in('18','36') then raise exception '평균 타수를 입력하면 18홀 또는 36홀 기준을 선택해 주세요.';end if;
 if d ? 'confirmations' then
  c:=d->'confirmations';
  if jsonb_typeof(c) is distinct from 'object' or exists(select 1 from jsonb_object_keys(c) x where x not in('rules','courtesy','schedule','rulesText')) then raise exception '확인 내용을 확인해 주세요.';end if;
  foreach k in array array['rules','courtesy','schedule'] loop
   if jsonb_typeof(c->k) is distinct from 'boolean' then raise exception '확인 여부를 확인해 주세요.';end if;
  end loop;
  if jsonb_typeof(c->'rulesText') is distinct from 'string' or char_length(c->>'rulesText')>4000 then raise exception '회칙 내용을 확인해 주세요.';end if;
 end if;
end $$;

create or replace function private.execute_club_membership_application_submit(
  p_club_id uuid,
  p_experience_code text,
  p_available_day_code text,
  p_interest_codes text[],
  p_application_reason text,
  p_message text,
  p_rules_confirmed boolean,
  p_courtesy_confirmed boolean,
  p_schedule_confirmed boolean,
  p_request_id uuid
)
returns table (
  request_id uuid,
  action_code text,
  application_id uuid,
  club_id uuid,
  applicant_id uuid,
  previous_status text,
  current_status text,
  application_version bigint,
  related_entry_id uuid,
  changed boolean,
  replayed boolean,
  outcome text
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_details jsonb := nullif(pg_catalog.current_setting('pul.club_application_details',true),'')::jsonb;
  v_confirmations jsonb := v_details->'confirmations';
  v_compact boolean := v_confirmations is not null;
  v_guidelines_version text := case when v_compact then 'club-membership-application-guidelines-v2' else 'club-membership-application-guidelines-v1' end;
  v_registered_rules text;
  v_actor_id uuid := auth.uid();
  v_actor_status text;
  v_club_status text;
  v_recruitment_status text;
  v_membership_status text;
  v_initial_status text;
  v_interests text[];
  v_reason text := coalesce(pg_catalog.btrim(p_application_reason),'');
  v_message text := nullif(pg_catalog.btrim(p_message), '');
  v_application_id uuid := pg_catalog.gen_random_uuid();
  v_fingerprint text;
  v_ledger_action text;
  v_ledger_club_id uuid;
  v_ledger_target uuid;
  v_ledger_fingerprint text;
  v_ledger_outcome text;
  v_ledger_result jsonb;
  v_ledger_completed_at timestamptz;
  v_ledger_found boolean := false;
  v_result jsonb;
  v_completed_count integer;
  v_previous_request text := pg_catalog.current_setting('pul.club_membership_application_request_id', true);
  v_previous_action text := pg_catalog.current_setting('pul.club_membership_application_action_code', true);
  v_previous_actor text := pg_catalog.current_setting('pul.club_membership_application_actor_id', true);
  v_previous_club text := pg_catalog.current_setting('pul.club_membership_application_club_id', true);
  v_previous_application text := pg_catalog.current_setting('pul.club_membership_application_id', true);
  v_previous_applicant text := pg_catalog.current_setting('pul.club_membership_application_applicant_id', true);
  v_previous_target text := pg_catalog.current_setting('pul.club_membership_application_target_status', true);
  v_previous_version text := pg_catalog.current_setting('pul.club_membership_application_expected_version', true);
  v_previous_fingerprint text := pg_catalog.current_setting('pul.club_membership_application_input_fingerprint', true);
  v_previous_entry text := pg_catalog.current_setting('pul.club_membership_application_entry_id', true);
  v_previous_entry_type text := pg_catalog.current_setting('pul.club_membership_application_entry_type', true);
begin
  if v_actor_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if p_club_id is null or p_request_id is null then
    raise exception 'CLUB_AND_REQUEST_REQUIRED';
  end if;
  if v_compact then
    if p_courtesy_confirmed is distinct from true
       or p_rules_confirmed is distinct from (v_confirmations->>'rules')::boolean
       or p_courtesy_confirmed is distinct from (v_confirmations->>'courtesy')::boolean
       or p_schedule_confirmed is distinct from (v_confirmations->>'schedule')::boolean then
      raise exception 'GUIDELINES_CONFIRMATION_REQUIRED';
    end if;
  elsif p_rules_confirmed is distinct from true
     or p_courtesy_confirmed is distinct from true
     or p_schedule_confirmed is distinct from true then
    raise exception 'GUIDELINES_CONFIRMATION_REQUIRED';
  end if;
  if p_experience_code is null or p_experience_code not in (
    'beginner', 'underOneYear', 'oneToThreeYears', 'overThreeYears', 'notProvided'
  ) then
    raise exception 'INVALID_EXPERIENCE_CODE';
  end if;
  if p_available_day_code is null
     or p_available_day_code not in ('notProvided', 'weekday', 'weekend', 'both', 'flexible') then
    raise exception 'INVALID_AVAILABLE_DAY_CODE';
  end if;
  if not private.club_membership_application_interests_are_valid(p_interest_codes) then
    raise exception 'INVALID_INTEREST_CODES';
  end if;
  if pg_catalog.char_length(v_reason) > 500 then
    raise exception 'INVALID_APPLICATION_REASON';
  end if;
  if v_message is not null and pg_catalog.char_length(v_message) > 500 then
    raise exception 'INVALID_APPLICATION_MESSAGE';
  end if;

  select coalesce(pg_catalog.array_agg(item.code order by item.code),'{}'::text[])
    into v_interests
  from pg_catalog.unnest(p_interest_codes) as item(code);

  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'action', 'membership_application.submit',
    'club_id', p_club_id,
    'applicant_id', v_actor_id,
    'experience_code', p_experience_code,
    'available_day_code', p_available_day_code,
    'interest_codes', pg_catalog.to_jsonb(v_interests),
    'reason_hash', pg_catalog.md5(v_reason),
    'reason_length', pg_catalog.char_length(v_reason),
    'message_hash', case when v_message is null then null else pg_catalog.md5(v_message) end,
    'message_length', coalesce(pg_catalog.char_length(v_message), 0),
    'guidelines_version', v_guidelines_version
  )::text);

  select account.account_status
    into v_actor_status
  from public.user_accounts as account
  where account.id = v_actor_id
  for share;

  if not found or v_actor_status <> 'active' then
    raise exception 'ACCOUNT_NOT_ACTIVE' using errcode = '42501';
  end if;

  select club.club_status, club.membership_recruitment_status
    into v_club_status, v_recruitment_status
  from public.clubs as club
  where club.id = p_club_id
  for update;

  if not found then
    raise exception 'CLUB_NOT_FOUND';
  end if;

  select
    ledger.action_code,
    ledger.club_id,
    ledger.target_user_id,
    ledger.input_fingerprint,
    ledger.outcome,
    ledger.result_data,
    ledger.completed_at
  into
    v_ledger_action,
    v_ledger_club_id,
    v_ledger_target,
    v_ledger_fingerprint,
    v_ledger_outcome,
    v_ledger_result,
    v_ledger_completed_at
  from private.club_mutation_requests as ledger
  where ledger.actor_id = v_actor_id
    and ledger.request_id = p_request_id
  for update;

  v_ledger_found := found;

  if v_ledger_found then
    if v_ledger_action is distinct from 'membership_application.submit'
       or v_ledger_club_id is distinct from p_club_id
       or v_ledger_target is distinct from v_actor_id
       or v_ledger_fingerprint is distinct from v_fingerprint then
      raise exception 'IDEMPOTENCY_KEY_REUSED';
    end if;
    if v_ledger_completed_at is not null then
      return query select
        p_request_id,
        v_ledger_action,
        (v_ledger_result ->> 'application_id')::uuid,
        v_ledger_club_id,
        v_ledger_target,
        null::text,
        v_ledger_result ->> 'current_status',
        (v_ledger_result ->> 'application_version')::bigint,
        null::uuid,
        (v_ledger_result ->> 'changed')::boolean,
        true,
        v_ledger_outcome;
      return;
    end if;
  end if;

  -- Completed identical requests replay before checking a subsequently edited rule.
  if v_compact then
    select profile.profile->>'rules' into v_registered_rules
      from private.club_profiles as profile where profile.club_id=p_club_id for share;
    v_registered_rules:=coalesce(v_registered_rules,'');
    if v_confirmations->>'rulesText' is distinct from v_registered_rules then
      raise exception 'CLUB_RULES_CHANGED';
    end if;
    if p_rules_confirmed is distinct from (v_registered_rules ~ '[^[:space:]]') then
      raise exception 'RULES_CONFIRMATION_REQUIRED';
    end if;
  end if;

  if v_club_status <> 'active' then
    raise exception 'CLUB_NOT_ACTIVE';
  end if;
  if v_recruitment_status = 'closed' then
    raise exception 'MEMBERSHIP_RECRUITMENT_CLOSED';
  end if;
  if v_recruitment_status not in ('recruiting', 'waiting') then
    raise exception 'INVALID_RECRUITMENT_STATUS';
  end if;

  select membership.membership_status
    into v_membership_status
  from public.club_memberships as membership
  where membership.club_id = p_club_id
    and membership.user_id = v_actor_id
  for update;

  if found and v_membership_status = 'active' then
    raise exception 'ALREADY_ACTIVE_MEMBER';
  end if;
  if found and v_membership_status = 'suspended' then
    raise exception 'SUSPENDED_MEMBER';
  end if;
  if found and v_membership_status <> 'left' then
    raise exception 'MEMBERSHIP_STATE_NOT_ELIGIBLE';
  end if;

  if exists (
    select 1
    from public.club_membership_applications as application
    where application.club_id = p_club_id
      and application.applicant_id = v_actor_id
      and application.status in (
        'submitted', 'reviewing', 'additional_info_required',
        'interview_requested', 'waitlisted'
      )
  ) then
    raise exception 'ACTIVE_APPLICATION_EXISTS';
  end if;

  v_initial_status := case
    when v_recruitment_status = 'recruiting' then 'submitted'
    else 'waitlisted'
  end;

  if not v_ledger_found then
    insert into private.club_mutation_requests (
      actor_id, request_id, action_code, club_id, target_user_id, input_fingerprint
    ) values (
      v_actor_id, p_request_id, 'membership_application.submit',
      p_club_id, v_actor_id, v_fingerprint
    )
    on conflict on constraint club_mutation_requests_actor_request_unique do nothing;

    select
      ledger.action_code,
      ledger.club_id,
      ledger.target_user_id,
      ledger.input_fingerprint,
      ledger.outcome,
      ledger.result_data,
      ledger.completed_at
    into
      v_ledger_action,
      v_ledger_club_id,
      v_ledger_target,
      v_ledger_fingerprint,
      v_ledger_outcome,
      v_ledger_result,
      v_ledger_completed_at
    from private.club_mutation_requests as ledger
    where ledger.actor_id = v_actor_id
      and ledger.request_id = p_request_id
    for update;

    if not found then
      raise exception 'IDEMPOTENCY_LEDGER_UNAVAILABLE';
    end if;
    if v_ledger_action is distinct from 'membership_application.submit'
       or v_ledger_club_id is distinct from p_club_id
       or v_ledger_target is distinct from v_actor_id
       or v_ledger_fingerprint is distinct from v_fingerprint then
      raise exception 'IDEMPOTENCY_KEY_REUSED';
    end if;
    if v_ledger_completed_at is not null then
      return query select
        p_request_id,
        v_ledger_action,
        (v_ledger_result ->> 'application_id')::uuid,
        v_ledger_club_id,
        v_ledger_target,
        null::text,
        v_ledger_result ->> 'current_status',
        (v_ledger_result ->> 'application_version')::bigint,
        null::uuid,
        (v_ledger_result ->> 'changed')::boolean,
        true,
        v_ledger_outcome;
      return;
    end if;
  end if;

  perform private.set_club_membership_application_mutation_context(
    p_request_id::text,
    'membership_application.submit',
    v_actor_id::text,
    p_club_id::text,
    v_application_id::text,
    v_actor_id::text,
    v_initial_status,
    null,
    v_fingerprint,
    null,
    null
  );

  begin
    insert into public.club_membership_applications (
      id, club_id, applicant_id, status, recruitment_status_at_submission,
      experience_code, available_day_code, interest_codes, application_reason,
      message, guidelines_confirmed_at, guidelines_version
    ) values (
      v_application_id, p_club_id, v_actor_id, v_initial_status, v_recruitment_status,
      p_experience_code, p_available_day_code, v_interests, v_reason,
      v_message, pg_catalog.now(), v_guidelines_version
    );
  exception
    when unique_violation then
      raise exception 'ACTIVE_APPLICATION_EXISTS';
  end;

  insert into public.club_membership_application_status_history (
    application_id, club_id, actor_user_id, request_id,
    event_code, from_status, to_status, application_version
  ) values (
    v_application_id, p_club_id, v_actor_id, p_request_id,
    'application.submitted', null, v_initial_status, 1
  );

  insert into public.audit_logs (
    actor_id, actor_type, action, target_type, target_id, club_id,
    before_summary, after_summary, reason, metadata, request_id, outcome
  ) values (
    v_actor_id, 'user', 'membership_application.submit',
    'club_membership_application', v_application_id::text, p_club_id::text,
    null,
    pg_catalog.jsonb_build_object(
      'status', v_initial_status,
      'version', 1,
      'recruitment_status_at_submission', v_recruitment_status
    ),
    null,
    pg_catalog.jsonb_build_object(
      'interest_count', pg_catalog.cardinality(v_interests),
      'reason_length', pg_catalog.char_length(v_reason),
      'message_present', v_message is not null,
      'message_length', coalesce(pg_catalog.char_length(v_message), 0),
      'guidelines_version', v_guidelines_version
    ),
    p_request_id,
    'success'
  );

  v_result := pg_catalog.jsonb_build_object(
    'action_code', 'membership_application.submit',
    'application_id', v_application_id,
    'club_id', p_club_id,
    'applicant_id', v_actor_id,
    'current_status', v_initial_status,
    'application_version', 1,
    'changed', true,
    'outcome', 'success'
  );

  update private.club_mutation_requests as ledger
  set outcome = 'success', result_data = v_result, completed_at = pg_catalog.now()
  where ledger.actor_id = v_actor_id
    and ledger.request_id = p_request_id
    and ledger.action_code = 'membership_application.submit'
    and ledger.input_fingerprint = v_fingerprint
    and ledger.completed_at is null;

  get diagnostics v_completed_count = row_count;
  if v_completed_count <> 1 then
    raise exception 'IDEMPOTENCY_COMPLETION_FAILED';
  end if;

  perform private.set_club_membership_application_mutation_context(
    v_previous_request, v_previous_action, v_previous_actor, v_previous_club,
    v_previous_application, v_previous_applicant, v_previous_target,
    v_previous_version, v_previous_fingerprint, v_previous_entry,
    v_previous_entry_type
  );

  return query select
    p_request_id,
    'membership_application.submit'::text,
    v_application_id,
    p_club_id,
    v_actor_id,
    null::text,
    v_initial_status,
    1::bigint,
    null::uuid,
    true,
    false,
    'success'::text;
exception
  when others then
    perform private.set_club_membership_application_mutation_context(
      v_previous_request, v_previous_action, v_previous_actor, v_previous_club,
      v_previous_application, v_previous_applicant, v_previous_target,
      v_previous_version, v_previous_fingerprint, v_previous_entry,
      v_previous_entry_type
    );
    raise;
end;
$$;

create or replace function public.get_club_application_details(p_application_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a public.club_membership_applications;
begin
 select * into a from public.club_membership_applications where id=p_application_id;
 if not found or auth.uid() is null or not exists(select 1 from public.user_accounts where id=auth.uid() and account_status='active') or (a.applicant_id is distinct from auth.uid() and private.club_user_has_permission(auth.uid(),a.club_id,'club.membership_applications.read') is not true) then raise exception '신청 정보가 없거나 조회 권한이 없습니다.' using errcode='42501';end if;
 return coalesce((select details from private.club_application_details where application_id=a.id),'{}'::jsonb)
  ||jsonb_build_object('answers',jsonb_build_object('experienceCode',a.experience_code,'availableDayCode',a.available_day_code,'interestCodes',a.interest_codes,'applicationReason',a.application_reason,'message',a.message));
end $$;
