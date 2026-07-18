-- PUL 8-4B: protected club membership applications, review workflow, and applicant supplements.
-- Approval, membership activation, and role grants are intentionally deferred to 8-4C.

alter table public.clubs
  add column membership_recruitment_status text not null default 'closed',
  add constraint clubs_membership_recruitment_status_check
    check (membership_recruitment_status in ('recruiting', 'waiting', 'closed'));

comment on column public.clubs.membership_recruitment_status is
  'Canonical membership application availability, independent of the club operational status.';

do $$
declare
  v_seed_count integer;
  v_updated_count integer;
begin
  select pg_catalog.count(*)::integer
    into v_seed_count
  from public.clubs as club
  join (
    values
      ('1', '한강 시민 파크골프 동호회', 'recruiting'),
      ('2', '수원 화성 파크골프회', 'waiting'),
      ('3', '송도 파크골프 클럽', 'recruiting'),
      ('4', '대전 엑스포 파크골프 동호회', 'recruiting'),
      ('5', '춘천 소양강 파크골프회', 'recruiting'),
      ('6', '부산 해운대 파크골프 동호회', 'closed'),
      ('7', '전주 한옥마을 파크골프회', 'waiting'),
      ('8', '제주 올레 파크골프 동호회', 'recruiting'),
      ('9', '분당 시니어 파크골프회', 'recruiting'),
      ('10', '청주 무심천 파크골프 동호회', 'waiting')
  ) as expected(legacy_key, name, recruitment_status)
    on expected.legacy_key = club.legacy_key
   and expected.name = club.name;

  if v_seed_count <> 10 then
    raise exception '가입 모집 상태를 연결할 기존 동호회 10개를 확인할 수 없습니다.';
  end if;

  update public.clubs as club
  set membership_recruitment_status = expected.recruitment_status
  from (
    values
      ('1', '한강 시민 파크골프 동호회', 'recruiting'),
      ('2', '수원 화성 파크골프회', 'waiting'),
      ('3', '송도 파크골프 클럽', 'recruiting'),
      ('4', '대전 엑스포 파크골프 동호회', 'recruiting'),
      ('5', '춘천 소양강 파크골프회', 'recruiting'),
      ('6', '부산 해운대 파크골프 동호회', 'closed'),
      ('7', '전주 한옥마을 파크골프회', 'waiting'),
      ('8', '제주 올레 파크골프 동호회', 'recruiting'),
      ('9', '분당 시니어 파크골프회', 'recruiting'),
      ('10', '청주 무심천 파크골프 동호회', 'waiting')
  ) as expected(legacy_key, name, recruitment_status)
  where club.legacy_key = expected.legacy_key
    and club.name = expected.name;

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 10 then
    raise exception '가입 모집 상태 backfill 대상이 정확히 10개가 아닙니다.';
  end if;
end;
$$;

insert into public.club_permission_definitions (
  permission_code,
  display_name,
  description,
  permission_group,
  is_system,
  is_active
)
values
  (
    'club.membership_applications.read',
    '가입 신청 조회',
    '동호회 가입 신청 목록과 상세, 상태 이력, 공개 보완 기록과 내부 메모를 조회합니다.',
    'membership_applications',
    true,
    true
  ),
  (
    'club.membership_applications.manage',
    '가입 신청 검토 관리',
    '동호회 가입 신청의 비최종 상태, 공개 보완 요청과 내부 메모를 관리합니다.',
    'membership_applications',
    true,
    true
  ),
  (
    'club.membership_applications.decide',
    '가입 신청 최종 결정',
    '동호회 가입 신청의 최종 거절과 향후 원자적 승인을 결정합니다.',
    'membership_applications',
    true,
    true
  )
on conflict (permission_code) do nothing;

do $$
begin
  if (
    select pg_catalog.count(*)
    from public.club_permission_definitions as permission
    where permission.permission_code in (
      'club.membership_applications.read',
      'club.membership_applications.manage',
      'club.membership_applications.decide'
    )
      and permission.permission_group = 'membership_applications'
      and permission.is_system
      and permission.is_active
  ) <> 3 then
    raise exception '가입 신청 권한 정의가 승인된 상태와 일치하지 않습니다.';
  end if;
end;
$$;

insert into public.club_role_permissions (role_code, permission_code)
values
  ('club_manager', 'club.membership_applications.read'),
  ('club_manager', 'club.membership_applications.manage'),
  ('club_vice_admin', 'club.membership_applications.read'),
  ('club_vice_admin', 'club.membership_applications.manage'),
  ('club_vice_admin', 'club.membership_applications.decide'),
  ('club_admin', 'club.membership_applications.read'),
  ('club_admin', 'club.membership_applications.manage'),
  ('club_admin', 'club.membership_applications.decide')
on conflict (role_code, permission_code) do nothing;

do $$
begin
  if (
    select pg_catalog.count(*)
    from public.club_role_permissions as mapping
    where mapping.permission_code in (
      'club.membership_applications.read',
      'club.membership_applications.manage',
      'club.membership_applications.decide'
    )
      and (
        (mapping.role_code = 'club_manager'
          and mapping.permission_code in (
            'club.membership_applications.read',
            'club.membership_applications.manage'
          ))
        or mapping.role_code in ('club_vice_admin', 'club_admin')
      )
  ) <> 8 then
    raise exception '가입 신청 역할-권한 연결이 승인된 상태와 일치하지 않습니다.';
  end if;

  if exists (
    select 1
    from public.club_role_permissions as mapping
    where mapping.permission_code like 'club.membership_applications.%'
      and (
        mapping.role_code = 'club_member'
        or (
          mapping.role_code = 'club_manager'
          and mapping.permission_code = 'club.membership_applications.decide'
        )
      )
  ) then
    raise exception '일반 회원 또는 일반 운영진에게 승인되지 않은 가입 신청 권한이 있습니다.';
  end if;
end;
$$;

create function private.club_membership_application_interests_are_valid(
  p_interest_codes text[]
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select
    p_interest_codes is not null
    and pg_catalog.cardinality(p_interest_codes) between 1 and 5
    and not exists (
      select 1
      from pg_catalog.unnest(p_interest_codes) as interest(code)
      where interest.code is null
        or interest.code <> pg_catalog.btrim(interest.code)
        or interest.code not in (
          'regularRound',
          'friendlyMatch',
          'screenPractice',
          'beginnerEducation',
          'clubEvent'
        )
    )
    and (
      select pg_catalog.count(*) = pg_catalog.count(distinct interest.code)
      from pg_catalog.unnest(p_interest_codes) as interest(code)
    );
$$;

revoke all on function private.club_membership_application_interests_are_valid(text[])
  from public, anon, authenticated, service_role;

create table public.club_membership_applications (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete restrict,
  applicant_id uuid not null references public.user_accounts (id) on delete restrict,
  status text not null,
  recruitment_status_at_submission text not null,
  experience_code text not null,
  available_day_code text not null,
  interest_codes text[] not null,
  application_reason text not null,
  message text,
  guidelines_confirmed_at timestamptz not null,
  guidelines_version text not null,
  version bigint not null default 1,
  submitted_at timestamptz not null default pg_catalog.now(),
  status_changed_at timestamptz not null default pg_catalog.now(),
  finalized_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint club_membership_applications_status_check
    check (
      status in (
        'submitted',
        'reviewing',
        'additional_info_required',
        'interview_requested',
        'waitlisted',
        'approved',
        'rejected',
        'withdrawn'
      )
    ),
  constraint club_membership_applications_recruitment_snapshot_check
    check (recruitment_status_at_submission in ('recruiting', 'waiting')),
  constraint club_membership_applications_experience_check
    check (
      experience_code in (
        'beginner',
        'underOneYear',
        'oneToThreeYears',
        'overThreeYears'
      )
    ),
  constraint club_membership_applications_available_day_check
    check (available_day_code in ('weekday', 'weekend', 'both', 'flexible')),
  constraint club_membership_applications_interests_check
    check (private.club_membership_application_interests_are_valid(interest_codes)),
  constraint club_membership_applications_reason_check
    check (
      application_reason = pg_catalog.btrim(application_reason)
      and application_reason <> ''
      and pg_catalog.char_length(application_reason) <= 500
    ),
  constraint club_membership_applications_message_check
    check (
      message is null
      or (
        message = pg_catalog.btrim(message)
        and message <> ''
        and pg_catalog.char_length(message) <= 500
      )
    ),
  constraint club_membership_applications_guidelines_check
    check (guidelines_version = 'club-membership-application-guidelines-v1'),
  constraint club_membership_applications_version_check
    check (version >= 1),
  constraint club_membership_applications_finalized_check
    check (
      (
        status in (
          'submitted',
          'reviewing',
          'additional_info_required',
          'interview_requested',
          'waitlisted'
        )
        and finalized_at is null
      )
      or (
        status in ('approved', 'rejected', 'withdrawn')
        and finalized_at is not null
      )
    ),
  constraint club_membership_applications_timeline_check
    check (
      submitted_at >= created_at
      and status_changed_at >= submitted_at
      and (finalized_at is null or finalized_at >= submitted_at)
      and updated_at >= created_at
      and updated_at >= status_changed_at
    )
);

comment on table public.club_membership_applications is
  'Protected membership applications. Approval and membership activation are deferred to 8-4C.';

create unique index club_membership_applications_one_active_per_applicant_idx
  on public.club_membership_applications (club_id, applicant_id)
  where status in (
    'submitted',
    'reviewing',
    'additional_info_required',
    'interview_requested',
    'waitlisted'
  );

create index club_membership_applications_club_status_submitted_idx
  on public.club_membership_applications (club_id, status, submitted_at desc, id desc);

create index club_membership_applications_applicant_submitted_idx
  on public.club_membership_applications (applicant_id, submitted_at desc, id desc);

create table public.club_membership_application_status_history (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  application_id uuid not null
    references public.club_membership_applications (id) on delete restrict,
  club_id uuid not null references public.clubs (id) on delete restrict,
  actor_user_id uuid not null references public.user_accounts (id) on delete restrict,
  request_id uuid not null,
  event_code text not null,
  from_status text,
  to_status text not null,
  application_version bigint not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint club_membership_application_history_actor_request_unique
    unique (actor_user_id, request_id),
  constraint club_membership_application_history_ledger_fkey
    foreign key (actor_user_id, request_id)
    references private.club_mutation_requests (actor_id, request_id)
    on delete restrict,
  constraint club_membership_application_history_event_check
    check (
      event_code in (
        'application.submitted',
        'application.review_started',
        'application.additional_info_requested',
        'application.interview_requested',
        'application.waitlisted',
        'application.review_resumed',
        'application.supplement_submitted',
        'application.withdrawn',
        'application.rejected'
      )
    ),
  constraint club_membership_application_history_from_status_check
    check (
      from_status is null
      or from_status in (
        'submitted',
        'reviewing',
        'additional_info_required',
        'interview_requested',
        'waitlisted',
        'approved',
        'rejected',
        'withdrawn'
      )
    ),
  constraint club_membership_application_history_to_status_check
    check (
      to_status in (
        'submitted',
        'reviewing',
        'additional_info_required',
        'interview_requested',
        'waitlisted',
        'approved',
        'rejected',
        'withdrawn'
      )
    ),
  constraint club_membership_application_history_version_check
    check (application_version >= 1),
  constraint club_membership_application_history_initial_check
    check (
      (
        event_code = 'application.submitted'
        and from_status is null
        and application_version = 1
      )
      or (
        event_code <> 'application.submitted'
        and from_status is not null
      )
    )
);

comment on table public.club_membership_application_status_history is
  'Append-only application status history without free-text application or operator content.';

create unique index club_membership_application_history_application_version_uidx
  on public.club_membership_application_status_history (
    application_id,
    application_version
  );

create index club_membership_application_history_club_created_idx
  on public.club_membership_application_status_history (club_id, created_at desc, id desc);

create table public.club_membership_application_supplements (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  application_id uuid not null
    references public.club_membership_applications (id) on delete restrict,
  club_id uuid not null references public.clubs (id) on delete restrict,
  author_user_id uuid not null references public.user_accounts (id) on delete restrict,
  request_id uuid not null,
  entry_type text not null,
  body text not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint club_membership_application_supplements_actor_request_unique
    unique (author_user_id, request_id),
  constraint club_membership_application_supplements_ledger_fkey
    foreign key (author_user_id, request_id)
    references private.club_mutation_requests (actor_id, request_id)
    on delete restrict,
  constraint club_membership_application_supplements_type_check
    check (entry_type in ('additional_info_request', 'applicant_response')),
  constraint club_membership_application_supplements_body_check
    check (
      body = pg_catalog.btrim(body)
      and body <> ''
      and pg_catalog.char_length(body) <= 1000
    )
);

comment on table public.club_membership_application_supplements is
  'Applicant-visible append-only additional-information requests and responses.';

create index club_membership_application_supplements_application_created_idx
  on public.club_membership_application_supplements (application_id, created_at, id);

create table public.club_membership_application_internal_notes (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  application_id uuid not null
    references public.club_membership_applications (id) on delete restrict,
  club_id uuid not null references public.clubs (id) on delete restrict,
  author_user_id uuid not null references public.user_accounts (id) on delete restrict,
  request_id uuid not null,
  body text not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint club_membership_application_notes_actor_request_unique
    unique (author_user_id, request_id),
  constraint club_membership_application_notes_ledger_fkey
    foreign key (author_user_id, request_id)
    references private.club_mutation_requests (actor_id, request_id)
    on delete restrict,
  constraint club_membership_application_notes_body_check
    check (
      body = pg_catalog.btrim(body)
      and body <> ''
      and pg_catalog.char_length(body) <= 1000
    )
);

comment on table public.club_membership_application_internal_notes is
  'Operator-only append-only notes that are never returned by applicant RPCs.';

create index club_membership_application_notes_application_created_idx
  on public.club_membership_application_internal_notes (application_id, created_at, id);

alter table public.club_membership_applications enable row level security;
alter table public.club_membership_applications force row level security;
alter table public.club_membership_application_status_history enable row level security;
alter table public.club_membership_application_status_history force row level security;
alter table public.club_membership_application_supplements enable row level security;
alter table public.club_membership_application_supplements force row level security;
alter table public.club_membership_application_internal_notes enable row level security;
alter table public.club_membership_application_internal_notes force row level security;

revoke all on table public.club_membership_applications
  from public, anon, authenticated, service_role;
revoke all on table public.club_membership_application_status_history
  from public, anon, authenticated, service_role;
revoke all on table public.club_membership_application_supplements
  from public, anon, authenticated, service_role;
revoke all on table public.club_membership_application_internal_notes
  from public, anon, authenticated, service_role;

create trigger club_membership_applications_set_updated_at
before update on public.club_membership_applications
for each row execute function public.set_user_foundation_updated_at();
-- Protected mutation helpers follow; public approval remains intentionally unavailable.
create function private.set_club_membership_application_mutation_context(
  p_request_id text,
  p_action_code text,
  p_actor_id text,
  p_club_id text,
  p_application_id text,
  p_applicant_id text,
  p_target_status text,
  p_expected_version text,
  p_input_fingerprint text,
  p_entry_id text,
  p_entry_type text
)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  perform pg_catalog.set_config('pul.club_membership_application_request_id', coalesce(p_request_id, ''), true);
  perform pg_catalog.set_config('pul.club_membership_application_action_code', coalesce(p_action_code, ''), true);
  perform pg_catalog.set_config('pul.club_membership_application_actor_id', coalesce(p_actor_id, ''), true);
  perform pg_catalog.set_config('pul.club_membership_application_club_id', coalesce(p_club_id, ''), true);
  perform pg_catalog.set_config('pul.club_membership_application_id', coalesce(p_application_id, ''), true);
  perform pg_catalog.set_config('pul.club_membership_application_applicant_id', coalesce(p_applicant_id, ''), true);
  perform pg_catalog.set_config('pul.club_membership_application_target_status', coalesce(p_target_status, ''), true);
  perform pg_catalog.set_config('pul.club_membership_application_expected_version', coalesce(p_expected_version, ''), true);
  perform pg_catalog.set_config('pul.club_membership_application_input_fingerprint', coalesce(p_input_fingerprint, ''), true);
  perform pg_catalog.set_config('pul.club_membership_application_entry_id', coalesce(p_entry_id, ''), true);
  perform pg_catalog.set_config('pul.club_membership_application_entry_type', coalesce(p_entry_type, ''), true);
end;
$$;

revoke all on function private.set_club_membership_application_mutation_context(
  text, text, text, text, text, text, text, text, text, text, text
) from public, anon, authenticated, service_role;

create function private.club_membership_application_context_is_valid()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.club_mutation_requests as ledger
    where ledger.actor_id = nullif(
        pg_catalog.current_setting('pul.club_membership_application_actor_id', true), ''
      )::uuid
      and ledger.request_id = nullif(
        pg_catalog.current_setting('pul.club_membership_application_request_id', true), ''
      )::uuid
      and ledger.action_code = nullif(
        pg_catalog.current_setting('pul.club_membership_application_action_code', true), ''
      )
      and ledger.club_id = nullif(
        pg_catalog.current_setting('pul.club_membership_application_club_id', true), ''
      )::uuid
      and ledger.target_user_id = nullif(
        pg_catalog.current_setting('pul.club_membership_application_applicant_id', true), ''
      )::uuid
      and ledger.role_code is null
      and ledger.input_fingerprint = nullif(
        pg_catalog.current_setting('pul.club_membership_application_input_fingerprint', true), ''
      )
      and ledger.outcome is null
      and ledger.result_data is null
      and ledger.completed_at is null
      and auth.uid() = ledger.actor_id
  );
$$;

revoke all on function private.club_membership_application_context_is_valid()
  from public, anon, authenticated, service_role;

create function private.enforce_guarded_club_membership_application_mutation()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_application_id uuid;
  v_club_id uuid;
  v_applicant_id uuid;
  v_expected_version bigint;
  v_action_code text;
  v_target_status text;
begin
  if tg_op = 'DELETE' then
    raise exception 'MEMBERSHIP_APPLICATION_DIRECT_DELETE_FORBIDDEN' using errcode = '42501';
  end if;

  begin
    v_application_id := nullif(pg_catalog.current_setting('pul.club_membership_application_id', true), '')::uuid;
    v_club_id := nullif(pg_catalog.current_setting('pul.club_membership_application_club_id', true), '')::uuid;
    v_applicant_id := nullif(pg_catalog.current_setting('pul.club_membership_application_applicant_id', true), '')::uuid;
    v_expected_version := nullif(pg_catalog.current_setting('pul.club_membership_application_expected_version', true), '')::bigint;
  exception
    when invalid_text_representation then
      raise exception 'MEMBERSHIP_APPLICATION_INVALID_MUTATION_CONTEXT' using errcode = '42501';
  end;

  v_action_code := nullif(pg_catalog.current_setting('pul.club_membership_application_action_code', true), '');
  v_target_status := nullif(pg_catalog.current_setting('pul.club_membership_application_target_status', true), '');

  if v_application_id is null
     or v_club_id is null
     or v_applicant_id is null
     or v_action_code is null
     or v_target_status is null
     or not private.club_membership_application_context_is_valid() then
    raise exception 'MEMBERSHIP_APPLICATION_RPC_REQUIRED' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if v_action_code <> 'membership_application.submit'
       or v_expected_version is not null
       or new.id <> v_application_id
       or new.club_id <> v_club_id
       or new.applicant_id <> v_applicant_id
       or new.status <> v_target_status
       or new.status not in ('submitted', 'waitlisted')
       or new.version <> 1
       or new.finalized_at is not null then
      raise exception 'MEMBERSHIP_APPLICATION_INSERT_CONTEXT_MISMATCH' using errcode = '42501';
    end if;
    return new;
  end if;

  if old.id <> v_application_id
     or new.id <> old.id
     or old.club_id <> v_club_id
     or new.club_id <> old.club_id
     or old.applicant_id <> v_applicant_id
     or new.applicant_id <> old.applicant_id
     or v_expected_version is null
     or old.version <> v_expected_version
     or new.version <> old.version + 1
     or new.status <> v_target_status
     or new.status = 'approved'
     or new.recruitment_status_at_submission is distinct from old.recruitment_status_at_submission
     or new.experience_code is distinct from old.experience_code
     or new.available_day_code is distinct from old.available_day_code
     or new.interest_codes is distinct from old.interest_codes
     or new.application_reason is distinct from old.application_reason
     or new.message is distinct from old.message
     or new.guidelines_confirmed_at is distinct from old.guidelines_confirmed_at
     or new.guidelines_version is distinct from old.guidelines_version
     or new.submitted_at is distinct from old.submitted_at
     or new.created_at is distinct from old.created_at
     or new.updated_at is distinct from old.updated_at
     or new.status_changed_at < old.status_changed_at then
    raise exception 'MEMBERSHIP_APPLICATION_UPDATE_CONTEXT_MISMATCH' using errcode = '42501';
  end if;

  if old.status in ('approved', 'rejected', 'withdrawn') then
    raise exception 'MEMBERSHIP_APPLICATION_FINAL' using errcode = '42501';
  end if;

  if not (
    (v_action_code = 'membership_application.withdraw'
      and new.status = 'withdrawn' and new.finalized_at is not null)
    or (v_action_code = 'membership_application.supplement_response'
      and old.status = 'additional_info_required' and new.status = 'reviewing'
      and new.finalized_at is null)
    or (v_action_code = 'membership_application.review'
      and old.status = 'submitted' and new.status = 'reviewing'
      and new.finalized_at is null)
    or (v_action_code = 'membership_application.request_additional_info'
      and old.status = 'reviewing' and new.status = 'additional_info_required'
      and new.finalized_at is null)
    or (v_action_code = 'membership_application.request_interview'
      and old.status = 'reviewing' and new.status = 'interview_requested'
      and new.finalized_at is null)
    or (v_action_code = 'membership_application.waitlist'
      and old.status = 'reviewing' and new.status = 'waitlisted'
      and new.finalized_at is null)
    or (v_action_code = 'membership_application.resume_review'
      and old.status in ('additional_info_required', 'interview_requested', 'waitlisted')
      and new.status = 'reviewing' and new.finalized_at is null)
    or (v_action_code = 'membership_application.reject'
      and new.status = 'rejected' and new.finalized_at is not null)
  ) then
    raise exception 'MEMBERSHIP_APPLICATION_TRANSITION_FORBIDDEN' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_guarded_club_membership_application_mutation()
  from public, anon, authenticated, service_role;

create function private.enforce_guarded_club_membership_application_history_mutation()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_request_id uuid;
  v_actor_id uuid;
  v_club_id uuid;
  v_application_id uuid;
  v_expected_version bigint;
  v_action_code text;
  v_target_status text;
  v_current_status text;
  v_current_version bigint;
begin
  if tg_op <> 'INSERT' then
    raise exception 'MEMBERSHIP_APPLICATION_HISTORY_APPEND_ONLY' using errcode = '42501';
  end if;

  begin
    v_request_id := nullif(pg_catalog.current_setting('pul.club_membership_application_request_id', true), '')::uuid;
    v_actor_id := nullif(pg_catalog.current_setting('pul.club_membership_application_actor_id', true), '')::uuid;
    v_club_id := nullif(pg_catalog.current_setting('pul.club_membership_application_club_id', true), '')::uuid;
    v_application_id := nullif(pg_catalog.current_setting('pul.club_membership_application_id', true), '')::uuid;
    v_expected_version := nullif(pg_catalog.current_setting('pul.club_membership_application_expected_version', true), '')::bigint;
  exception
    when invalid_text_representation then
      raise exception 'MEMBERSHIP_APPLICATION_INVALID_HISTORY_CONTEXT' using errcode = '42501';
  end;

  v_action_code := nullif(pg_catalog.current_setting('pul.club_membership_application_action_code', true), '');
  v_target_status := nullif(pg_catalog.current_setting('pul.club_membership_application_target_status', true), '');

  select application.status, application.version
    into v_current_status, v_current_version
  from public.club_membership_applications as application
  where application.id = v_application_id
    and application.club_id = v_club_id;

  if not private.club_membership_application_context_is_valid()
     or not found
     or new.application_id <> v_application_id
     or new.club_id <> v_club_id
     or new.actor_user_id <> v_actor_id
     or new.request_id <> v_request_id
     or new.to_status <> v_target_status
     or new.to_status <> v_current_status
     or new.application_version <> v_current_version
     or not (
       (v_action_code = 'membership_application.submit'
         and new.event_code = 'application.submitted'
         and new.from_status is null and new.application_version = 1)
       or (v_action_code = 'membership_application.withdraw'
         and new.event_code = 'application.withdrawn')
       or (v_action_code = 'membership_application.supplement_response'
         and new.event_code = 'application.supplement_submitted')
       or (v_action_code = 'membership_application.review'
         and new.event_code = 'application.review_started')
       or (v_action_code = 'membership_application.request_additional_info'
         and new.event_code = 'application.additional_info_requested')
       or (v_action_code = 'membership_application.request_interview'
         and new.event_code = 'application.interview_requested')
       or (v_action_code = 'membership_application.waitlist'
         and new.event_code = 'application.waitlisted')
       or (v_action_code = 'membership_application.resume_review'
         and new.event_code = 'application.review_resumed')
       or (v_action_code = 'membership_application.reject'
         and new.event_code = 'application.rejected')
     ) then
    raise exception 'MEMBERSHIP_APPLICATION_HISTORY_CONTEXT_MISMATCH' using errcode = '42501';
  end if;

  if v_action_code <> 'membership_application.submit'
     and v_expected_version is distinct from new.application_version - 1 then
    raise exception 'MEMBERSHIP_APPLICATION_HISTORY_VERSION_MISMATCH' using errcode = '42501';
  end if;

  if v_action_code <> 'membership_application.submit'
     and not exists (
       select 1
       from public.club_membership_application_status_history as previous_history
       where previous_history.application_id = new.application_id
         and previous_history.application_version = new.application_version - 1
         and previous_history.to_status = new.from_status
     ) then
    raise exception 'MEMBERSHIP_APPLICATION_HISTORY_CHAIN_MISMATCH' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_guarded_club_membership_application_history_mutation()
  from public, anon, authenticated, service_role;

create function private.enforce_guarded_club_membership_application_supplement_mutation()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_request_id uuid;
  v_actor_id uuid;
  v_club_id uuid;
  v_application_id uuid;
  v_entry_id uuid;
  v_action_code text;
  v_target_status text;
  v_entry_type text;
begin
  if tg_op <> 'INSERT' then
    raise exception 'MEMBERSHIP_APPLICATION_SUPPLEMENT_APPEND_ONLY' using errcode = '42501';
  end if;

  begin
    v_request_id := nullif(pg_catalog.current_setting('pul.club_membership_application_request_id', true), '')::uuid;
    v_actor_id := nullif(pg_catalog.current_setting('pul.club_membership_application_actor_id', true), '')::uuid;
    v_club_id := nullif(pg_catalog.current_setting('pul.club_membership_application_club_id', true), '')::uuid;
    v_application_id := nullif(pg_catalog.current_setting('pul.club_membership_application_id', true), '')::uuid;
    v_entry_id := nullif(pg_catalog.current_setting('pul.club_membership_application_entry_id', true), '')::uuid;
  exception
    when invalid_text_representation then
      raise exception 'MEMBERSHIP_APPLICATION_INVALID_SUPPLEMENT_CONTEXT' using errcode = '42501';
  end;

  v_action_code := nullif(pg_catalog.current_setting('pul.club_membership_application_action_code', true), '');
  v_target_status := nullif(pg_catalog.current_setting('pul.club_membership_application_target_status', true), '');
  v_entry_type := nullif(pg_catalog.current_setting('pul.club_membership_application_entry_type', true), '');

  if not private.club_membership_application_context_is_valid()
     or v_entry_id is null
     or new.id <> v_entry_id
     or new.application_id <> v_application_id
     or new.club_id <> v_club_id
     or new.author_user_id <> v_actor_id
     or new.request_id <> v_request_id
     or new.entry_type <> v_entry_type
     or not (
       (v_action_code = 'membership_application.request_additional_info'
         and v_entry_type = 'additional_info_request'
         and v_target_status = 'additional_info_required')
       or (v_action_code = 'membership_application.supplement_response'
         and v_entry_type = 'applicant_response'
         and v_target_status = 'reviewing')
     ) then
    raise exception 'MEMBERSHIP_APPLICATION_SUPPLEMENT_CONTEXT_MISMATCH' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_guarded_club_membership_application_supplement_mutation()
  from public, anon, authenticated, service_role;

create function private.enforce_guarded_club_membership_application_note_mutation()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_request_id uuid;
  v_actor_id uuid;
  v_club_id uuid;
  v_application_id uuid;
  v_entry_id uuid;
  v_action_code text;
begin
  if tg_op <> 'INSERT' then
    raise exception 'MEMBERSHIP_APPLICATION_NOTE_APPEND_ONLY' using errcode = '42501';
  end if;

  begin
    v_request_id := nullif(pg_catalog.current_setting('pul.club_membership_application_request_id', true), '')::uuid;
    v_actor_id := nullif(pg_catalog.current_setting('pul.club_membership_application_actor_id', true), '')::uuid;
    v_club_id := nullif(pg_catalog.current_setting('pul.club_membership_application_club_id', true), '')::uuid;
    v_application_id := nullif(pg_catalog.current_setting('pul.club_membership_application_id', true), '')::uuid;
    v_entry_id := nullif(pg_catalog.current_setting('pul.club_membership_application_entry_id', true), '')::uuid;
  exception
    when invalid_text_representation then
      raise exception 'MEMBERSHIP_APPLICATION_INVALID_NOTE_CONTEXT' using errcode = '42501';
  end;

  v_action_code := nullif(pg_catalog.current_setting('pul.club_membership_application_action_code', true), '');

  if not private.club_membership_application_context_is_valid()
     or v_action_code <> 'membership_application.internal_note'
     or v_entry_id is null
     or new.id <> v_entry_id
     or new.application_id <> v_application_id
     or new.club_id <> v_club_id
     or new.author_user_id <> v_actor_id
     or new.request_id <> v_request_id then
    raise exception 'MEMBERSHIP_APPLICATION_NOTE_CONTEXT_MISMATCH' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_guarded_club_membership_application_note_mutation()
  from public, anon, authenticated, service_role;

create trigger club_membership_applications_guard_before_insert
before insert on public.club_membership_applications
for each row execute function private.enforce_guarded_club_membership_application_mutation();

create trigger club_membership_applications_guard_before_update
before update on public.club_membership_applications
for each row execute function private.enforce_guarded_club_membership_application_mutation();

create trigger club_membership_applications_guard_before_delete
before delete on public.club_membership_applications
for each row execute function private.enforce_guarded_club_membership_application_mutation();

create trigger club_membership_application_history_guard_before_insert
before insert on public.club_membership_application_status_history
for each row execute function private.enforce_guarded_club_membership_application_history_mutation();

create trigger club_membership_application_history_guard_before_update
before update on public.club_membership_application_status_history
for each row execute function private.enforce_guarded_club_membership_application_history_mutation();

create trigger club_membership_application_history_guard_before_delete
before delete on public.club_membership_application_status_history
for each row execute function private.enforce_guarded_club_membership_application_history_mutation();

create trigger club_membership_application_supplements_guard_before_insert
before insert on public.club_membership_application_supplements
for each row execute function private.enforce_guarded_club_membership_application_supplement_mutation();

create trigger club_membership_application_supplements_guard_before_update
before update on public.club_membership_application_supplements
for each row execute function private.enforce_guarded_club_membership_application_supplement_mutation();

create trigger club_membership_application_supplements_guard_before_delete
before delete on public.club_membership_application_supplements
for each row execute function private.enforce_guarded_club_membership_application_supplement_mutation();

create trigger club_membership_application_notes_guard_before_insert
before insert on public.club_membership_application_internal_notes
for each row execute function private.enforce_guarded_club_membership_application_note_mutation();

create trigger club_membership_application_notes_guard_before_update
before update on public.club_membership_application_internal_notes
for each row execute function private.enforce_guarded_club_membership_application_note_mutation();

create trigger club_membership_application_notes_guard_before_delete
before delete on public.club_membership_application_internal_notes
for each row execute function private.enforce_guarded_club_membership_application_note_mutation();
create function private.execute_club_membership_application_submit(
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
  v_actor_id uuid := auth.uid();
  v_actor_status text;
  v_club_status text;
  v_recruitment_status text;
  v_membership_status text;
  v_initial_status text;
  v_interests text[];
  v_reason text := pg_catalog.btrim(p_application_reason);
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
  if p_rules_confirmed is distinct from true
     or p_courtesy_confirmed is distinct from true
     or p_schedule_confirmed is distinct from true then
    raise exception 'GUIDELINES_CONFIRMATION_REQUIRED';
  end if;
  if p_experience_code is null or p_experience_code not in (
    'beginner', 'underOneYear', 'oneToThreeYears', 'overThreeYears'
  ) then
    raise exception 'INVALID_EXPERIENCE_CODE';
  end if;
  if p_available_day_code is null
     or p_available_day_code not in ('weekday', 'weekend', 'both', 'flexible') then
    raise exception 'INVALID_AVAILABLE_DAY_CODE';
  end if;
  if not private.club_membership_application_interests_are_valid(p_interest_codes) then
    raise exception 'INVALID_INTEREST_CODES';
  end if;
  if v_reason is null or v_reason = '' or pg_catalog.char_length(v_reason) > 500 then
    raise exception 'INVALID_APPLICATION_REASON';
  end if;
  if v_message is not null and pg_catalog.char_length(v_message) > 500 then
    raise exception 'INVALID_APPLICATION_MESSAGE';
  end if;

  select pg_catalog.array_agg(item.code order by item.code)
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
    'guidelines_version', 'club-membership-application-guidelines-v1'
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
      v_message, pg_catalog.now(), 'club-membership-application-guidelines-v1'
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
      'guidelines_version', 'club-membership-application-guidelines-v1'
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

revoke all on function private.execute_club_membership_application_submit(
  uuid, text, text, text[], text, text, boolean, boolean, boolean, uuid
) from public, anon, authenticated, service_role;
create function private.execute_club_membership_application_mutation(
  p_application_id uuid,
  p_operation text,
  p_expected_version bigint,
  p_body text,
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
  v_actor_id uuid := auth.uid();
  v_actor_status text;
  v_club_id uuid;
  v_applicant_id uuid;
  v_previous_status text;
  v_current_version bigint;
  v_action_code text;
  v_target_status text;
  v_event_code text;
  v_entry_type text;
  v_body text := nullif(pg_catalog.btrim(p_body), '');
  v_entry_id uuid;
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
  v_previous_request_context text := pg_catalog.current_setting('pul.club_membership_application_request_id', true);
  v_previous_action_context text := pg_catalog.current_setting('pul.club_membership_application_action_code', true);
  v_previous_actor_context text := pg_catalog.current_setting('pul.club_membership_application_actor_id', true);
  v_previous_club_context text := pg_catalog.current_setting('pul.club_membership_application_club_id', true);
  v_previous_application_context text := pg_catalog.current_setting('pul.club_membership_application_id', true);
  v_previous_applicant_context text := pg_catalog.current_setting('pul.club_membership_application_applicant_id', true);
  v_previous_target_context text := pg_catalog.current_setting('pul.club_membership_application_target_status', true);
  v_previous_version_context text := pg_catalog.current_setting('pul.club_membership_application_expected_version', true);
  v_previous_fingerprint_context text := pg_catalog.current_setting('pul.club_membership_application_input_fingerprint', true);
  v_previous_entry_context text := pg_catalog.current_setting('pul.club_membership_application_entry_id', true);
  v_previous_entry_type_context text := pg_catalog.current_setting('pul.club_membership_application_entry_type', true);
begin
  if v_actor_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if p_application_id is null or p_request_id is null then
    raise exception 'APPLICATION_AND_REQUEST_REQUIRED';
  end if;

  v_action_code := case p_operation
    when 'withdraw' then 'membership_application.withdraw'
    when 'supplement_response' then 'membership_application.supplement_response'
    when 'review' then 'membership_application.review'
    when 'request_additional_info' then 'membership_application.request_additional_info'
    when 'request_interview' then 'membership_application.request_interview'
    when 'waitlist' then 'membership_application.waitlist'
    when 'resume_review' then 'membership_application.resume_review'
    when 'internal_note' then 'membership_application.internal_note'
    when 'reject' then 'membership_application.reject'
    else null
  end;

  if v_action_code is null then
    raise exception 'INVALID_APPLICATION_OPERATION';
  end if;

  if p_operation in ('request_additional_info', 'supplement_response', 'internal_note') then
    if v_body is null or pg_catalog.char_length(v_body) > 1000 then
      raise exception 'INVALID_APPLICATION_BODY';
    end if;
  elsif v_body is not null then
    raise exception 'BODY_NOT_ALLOWED_FOR_OPERATION';
  end if;

  if p_operation = 'internal_note' then
    if p_expected_version is not null then
      raise exception 'VERSION_NOT_ALLOWED_FOR_INTERNAL_NOTE';
    end if;
  elsif p_expected_version is null or p_expected_version < 1 then
    raise exception 'EXPECTED_VERSION_REQUIRED';
  end if;

  select account.account_status
    into v_actor_status
  from public.user_accounts as account
  where account.id = v_actor_id
  for share;

  if not found or v_actor_status <> 'active' then
    raise exception 'ACCOUNT_NOT_ACTIVE' using errcode = '42501';
  end if;

  select
    application.club_id,
    application.applicant_id,
    application.status,
    application.version
  into
    v_club_id,
    v_applicant_id,
    v_previous_status,
    v_current_version
  from public.club_membership_applications as application
  where application.id = p_application_id
  for update;

  if not found then
    raise exception 'APPLICATION_NOT_FOUND';
  end if;

  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'action', v_action_code,
    'application_id', p_application_id,
    'club_id', v_club_id,
    'applicant_id', v_applicant_id,
    'expected_version', p_expected_version,
    'body_hash', case when v_body is null then null else pg_catalog.md5(v_body) end,
    'body_length', coalesce(pg_catalog.char_length(v_body), 0)
  )::text);

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
    if v_ledger_action is distinct from v_action_code
       or v_ledger_club_id is distinct from v_club_id
       or v_ledger_target is distinct from v_applicant_id
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
        v_ledger_result ->> 'previous_status',
        v_ledger_result ->> 'current_status',
        (v_ledger_result ->> 'application_version')::bigint,
        nullif(v_ledger_result ->> 'related_entry_id', '')::uuid,
        (v_ledger_result ->> 'changed')::boolean,
        true,
        v_ledger_outcome;
      return;
    end if;
  end if;

  if p_operation in ('withdraw', 'supplement_response') then
    if v_actor_id <> v_applicant_id then
      raise exception 'APPLICATION_OWNER_REQUIRED' using errcode = '42501';
    end if;
  elsif p_operation = 'reject' then
    if not private.club_user_has_permission(
         v_actor_id, v_club_id, 'club.membership_applications.decide'
       )
       or not private.club_user_is_active_admin_or_vice_admin(
         v_actor_id, v_club_id
       ) then
      raise exception 'APPLICATION_DECIDE_PERMISSION_REQUIRED' using errcode = '42501';
    end if;
  else
    if not private.club_user_has_permission(
      v_actor_id, v_club_id, 'club.membership_applications.manage'
    ) then
      raise exception 'APPLICATION_MANAGE_PERMISSION_REQUIRED' using errcode = '42501';
    end if;
  end if;

  if p_operation <> 'internal_note' and v_current_version <> p_expected_version then
    raise exception 'APPLICATION_VERSION_CONFLICT' using errcode = '40001';
  end if;

  if p_operation = 'withdraw' then
    if v_previous_status not in (
      'submitted', 'reviewing', 'additional_info_required',
      'interview_requested', 'waitlisted'
    ) then
      raise exception 'APPLICATION_WITHDRAW_FORBIDDEN';
    end if;
    v_target_status := 'withdrawn';
    v_event_code := 'application.withdrawn';
  elsif p_operation = 'supplement_response' then
    if v_previous_status <> 'additional_info_required' then
      raise exception 'SUPPLEMENT_RESPONSE_STATE_INVALID';
    end if;
    v_target_status := 'reviewing';
    v_event_code := 'application.supplement_submitted';
    v_entry_type := 'applicant_response';
  elsif p_operation = 'review' then
    if v_previous_status <> 'submitted' then
      raise exception 'APPLICATION_TRANSITION_FORBIDDEN';
    end if;
    v_target_status := 'reviewing';
    v_event_code := 'application.review_started';
  elsif p_operation = 'request_additional_info' then
    if v_previous_status <> 'reviewing' then
      raise exception 'APPLICATION_TRANSITION_FORBIDDEN';
    end if;
    v_target_status := 'additional_info_required';
    v_event_code := 'application.additional_info_requested';
    v_entry_type := 'additional_info_request';
  elsif p_operation = 'request_interview' then
    if v_previous_status <> 'reviewing' then
      raise exception 'APPLICATION_TRANSITION_FORBIDDEN';
    end if;
    v_target_status := 'interview_requested';
    v_event_code := 'application.interview_requested';
  elsif p_operation = 'waitlist' then
    if v_previous_status <> 'reviewing' then
      raise exception 'APPLICATION_TRANSITION_FORBIDDEN';
    end if;
    v_target_status := 'waitlisted';
    v_event_code := 'application.waitlisted';
  elsif p_operation = 'resume_review' then
    if v_previous_status not in (
      'additional_info_required', 'interview_requested', 'waitlisted'
    ) then
      raise exception 'APPLICATION_TRANSITION_FORBIDDEN';
    end if;
    v_target_status := 'reviewing';
    v_event_code := 'application.review_resumed';
  elsif p_operation = 'reject' then
    if v_previous_status not in (
      'submitted', 'reviewing', 'additional_info_required',
      'interview_requested', 'waitlisted'
    ) then
      raise exception 'APPLICATION_REJECT_FORBIDDEN';
    end if;
    v_target_status := 'rejected';
    v_event_code := 'application.rejected';
  else
    v_target_status := v_previous_status;
  end if;

  if v_target_status = 'approved' then
    raise exception 'APPLICATION_APPROVAL_DEFERRED_TO_8_4C' using errcode = '42501';
  end if;

  if not v_ledger_found then
    insert into private.club_mutation_requests (
      actor_id, request_id, action_code, club_id, target_user_id, input_fingerprint
    ) values (
      v_actor_id, p_request_id, v_action_code,
      v_club_id, v_applicant_id, v_fingerprint
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
    if v_ledger_action is distinct from v_action_code
       or v_ledger_club_id is distinct from v_club_id
       or v_ledger_target is distinct from v_applicant_id
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
        v_ledger_result ->> 'previous_status',
        v_ledger_result ->> 'current_status',
        (v_ledger_result ->> 'application_version')::bigint,
        nullif(v_ledger_result ->> 'related_entry_id', '')::uuid,
        (v_ledger_result ->> 'changed')::boolean,
        true,
        v_ledger_outcome;
      return;
    end if;
  end if;

  if p_operation in ('request_additional_info', 'supplement_response', 'internal_note') then
    v_entry_id := pg_catalog.gen_random_uuid();
  end if;

  perform private.set_club_membership_application_mutation_context(
    p_request_id::text,
    v_action_code,
    v_actor_id::text,
    v_club_id::text,
    p_application_id::text,
    v_applicant_id::text,
    v_target_status,
    case when p_expected_version is null then null else p_expected_version::text end,
    v_fingerprint,
    case when v_entry_id is null then null else v_entry_id::text end,
    v_entry_type
  );

  if p_operation = 'internal_note' then
    insert into public.club_membership_application_internal_notes (
      id, application_id, club_id, author_user_id, request_id, body
    ) values (
      v_entry_id, p_application_id, v_club_id, v_actor_id, p_request_id, v_body
    );
  else
    update public.club_membership_applications as application
    set
      status = v_target_status,
      version = application.version + 1,
      status_changed_at = pg_catalog.now(),
      finalized_at = case
        when v_target_status in ('rejected', 'withdrawn') then pg_catalog.now()
        else null
      end
    where application.id = p_application_id
      and application.version = p_expected_version;

    if not found then
      raise exception 'APPLICATION_VERSION_CONFLICT' using errcode = '40001';
    end if;

    if v_entry_type is not null then
      insert into public.club_membership_application_supplements (
        id, application_id, club_id, author_user_id, request_id, entry_type, body
      ) values (
        v_entry_id, p_application_id, v_club_id, v_actor_id,
        p_request_id, v_entry_type, v_body
      );
    end if;

    insert into public.club_membership_application_status_history (
      application_id, club_id, actor_user_id, request_id,
      event_code, from_status, to_status, application_version
    ) values (
      p_application_id, v_club_id, v_actor_id, p_request_id,
      v_event_code, v_previous_status, v_target_status, p_expected_version + 1
    );

    v_current_version := p_expected_version + 1;
  end if;

  insert into public.audit_logs (
    actor_id, actor_type, action, target_type, target_id, club_id,
    before_summary, after_summary, reason, metadata, request_id, outcome
  ) values (
    v_actor_id,
    'user',
    v_action_code,
    'club_membership_application',
    p_application_id::text,
    v_club_id::text,
    pg_catalog.jsonb_build_object(
      'status', v_previous_status,
      'version', v_current_version - case when p_operation = 'internal_note' then 0 else 1 end
    ),
    pg_catalog.jsonb_build_object(
      'status', v_target_status,
      'version', v_current_version
    ),
    null,
    pg_catalog.jsonb_build_object(
      'entry_type', v_entry_type,
      'body_present', v_body is not null,
      'body_length', coalesce(pg_catalog.char_length(v_body), 0),
      'state_changed', p_operation <> 'internal_note'
    ),
    p_request_id,
    'success'
  );

  v_result := pg_catalog.jsonb_build_object(
    'action_code', v_action_code,
    'application_id', p_application_id,
    'club_id', v_club_id,
    'applicant_id', v_applicant_id,
    'previous_status', v_previous_status,
    'current_status', v_target_status,
    'application_version', v_current_version,
    'related_entry_id', v_entry_id,
    'changed', true,
    'outcome', 'success'
  );

  update private.club_mutation_requests as ledger
  set outcome = 'success', result_data = v_result, completed_at = pg_catalog.now()
  where ledger.actor_id = v_actor_id
    and ledger.request_id = p_request_id
    and ledger.action_code = v_action_code
    and ledger.input_fingerprint = v_fingerprint
    and ledger.completed_at is null;

  get diagnostics v_completed_count = row_count;
  if v_completed_count <> 1 then
    raise exception 'IDEMPOTENCY_COMPLETION_FAILED';
  end if;

  perform private.set_club_membership_application_mutation_context(
    v_previous_request_context, v_previous_action_context, v_previous_actor_context,
    v_previous_club_context, v_previous_application_context,
    v_previous_applicant_context, v_previous_target_context,
    v_previous_version_context, v_previous_fingerprint_context,
    v_previous_entry_context, v_previous_entry_type_context
  );

  return query select
    p_request_id,
    v_action_code,
    p_application_id,
    v_club_id,
    v_applicant_id,
    v_previous_status,
    v_target_status,
    v_current_version,
    v_entry_id,
    true,
    false,
    'success'::text;
exception
  when others then
    perform private.set_club_membership_application_mutation_context(
      v_previous_request_context, v_previous_action_context, v_previous_actor_context,
      v_previous_club_context, v_previous_application_context,
      v_previous_applicant_context, v_previous_target_context,
      v_previous_version_context, v_previous_fingerprint_context,
      v_previous_entry_context, v_previous_entry_type_context
    );
    raise;
end;
$$;

revoke all on function private.execute_club_membership_application_mutation(
  uuid, text, bigint, text, uuid
) from public, anon, authenticated, service_role;
create function public.submit_club_membership_application(
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
language sql
volatile
security definer
set search_path = ''
as $$
  select *
  from private.execute_club_membership_application_submit(
    p_club_id,
    p_experience_code,
    p_available_day_code,
    p_interest_codes,
    p_application_reason,
    p_message,
    p_rules_confirmed,
    p_courtesy_confirmed,
    p_schedule_confirmed,
    p_request_id
  );
$$;

revoke all on function public.submit_club_membership_application(
  uuid, text, text, text[], text, text, boolean, boolean, boolean, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.submit_club_membership_application(
  uuid, text, text, text[], text, text, boolean, boolean, boolean, uuid
) to authenticated;

create function public.withdraw_club_membership_application(
  p_application_id uuid,
  p_expected_version bigint,
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
language sql
volatile
security definer
set search_path = ''
as $$
  select *
  from private.execute_club_membership_application_mutation(
    p_application_id, 'withdraw', p_expected_version, null, p_request_id
  );
$$;

revoke all on function public.withdraw_club_membership_application(
  uuid, bigint, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.withdraw_club_membership_application(
  uuid, bigint, uuid
) to authenticated;

create function public.submit_club_membership_application_supplement(
  p_application_id uuid,
  p_expected_version bigint,
  p_body text,
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
language sql
volatile
security definer
set search_path = ''
as $$
  select *
  from private.execute_club_membership_application_mutation(
    p_application_id, 'supplement_response', p_expected_version, p_body, p_request_id
  );
$$;

revoke all on function public.submit_club_membership_application_supplement(
  uuid, bigint, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.submit_club_membership_application_supplement(
  uuid, bigint, text, uuid
) to authenticated;

create function public.manage_club_membership_application(
  p_application_id uuid,
  p_operation text,
  p_expected_version bigint,
  p_public_request_body text,
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
security definer
set search_path = ''
as $$
begin
  if p_operation not in (
    'review',
    'request_additional_info',
    'request_interview',
    'waitlist',
    'resume_review'
  ) then
    raise exception 'NONFINAL_OPERATION_REQUIRED';
  end if;

  return query
  select *
  from private.execute_club_membership_application_mutation(
    p_application_id,
    p_operation,
    p_expected_version,
    p_public_request_body,
    p_request_id
  );
end;
$$;

revoke all on function public.manage_club_membership_application(
  uuid, text, bigint, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.manage_club_membership_application(
  uuid, text, bigint, text, uuid
) to authenticated;

create function public.add_club_membership_application_internal_note(
  p_application_id uuid,
  p_body text,
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
language sql
volatile
security definer
set search_path = ''
as $$
  select *
  from private.execute_club_membership_application_mutation(
    p_application_id, 'internal_note', null, p_body, p_request_id
  );
$$;

revoke all on function public.add_club_membership_application_internal_note(
  uuid, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.add_club_membership_application_internal_note(
  uuid, text, uuid
) to authenticated;

create function public.reject_club_membership_application(
  p_application_id uuid,
  p_expected_version bigint,
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
language sql
volatile
security definer
set search_path = ''
as $$
  select *
  from private.execute_club_membership_application_mutation(
    p_application_id, 'reject', p_expected_version, null, p_request_id
  );
$$;

revoke all on function public.reject_club_membership_application(
  uuid, bigint, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.reject_club_membership_application(
  uuid, bigint, uuid
) to authenticated;
create function public.get_my_active_club_membership_application(p_club_id uuid)
returns table (
  application_id uuid,
  club_id uuid,
  applicant_id uuid,
  status text,
  recruitment_status_at_submission text,
  experience_code text,
  available_day_code text,
  interest_codes text[],
  application_reason text,
  message text,
  guidelines_confirmed_at timestamptz,
  guidelines_version text,
  application_version bigint,
  submitted_at timestamptz,
  status_changed_at timestamptz,
  finalized_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if p_club_id is null then
    raise exception 'CLUB_REQUIRED';
  end if;
  if not exists (
    select 1 from public.user_accounts as account
    where account.id = v_actor_id and account.account_status = 'active'
  ) then
    raise exception 'ACCOUNT_NOT_ACTIVE' using errcode = '42501';
  end if;

  return query
  select
    application.id,
    application.club_id,
    application.applicant_id,
    application.status,
    application.recruitment_status_at_submission,
    application.experience_code,
    application.available_day_code,
    application.interest_codes,
    application.application_reason,
    application.message,
    application.guidelines_confirmed_at,
    application.guidelines_version,
    application.version,
    application.submitted_at,
    application.status_changed_at,
    application.finalized_at,
    application.updated_at
  from public.club_membership_applications as application
  where application.club_id = p_club_id
    and application.applicant_id = v_actor_id
    and application.status in (
      'submitted', 'reviewing', 'additional_info_required',
      'interview_requested', 'waitlisted'
    )
  order by application.submitted_at desc, application.id desc
  limit 1;
end;
$$;

revoke all on function public.get_my_active_club_membership_application(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_active_club_membership_application(uuid)
  to authenticated;

create function public.list_my_club_membership_applications(
  p_club_id uuid default null,
  p_limit integer default 20,
  p_before_submitted_at timestamptz default null,
  p_before_application_id uuid default null
)
returns table (
  application_id uuid,
  club_id uuid,
  status text,
  recruitment_status_at_submission text,
  experience_code text,
  available_day_code text,
  interest_codes text[],
  application_version bigint,
  submitted_at timestamptz,
  status_changed_at timestamptz,
  finalized_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception 'INVALID_PAGE_LIMIT';
  end if;
  if (p_before_submitted_at is null) <> (p_before_application_id is null) then
    raise exception 'INVALID_PAGE_CURSOR';
  end if;
  if not exists (
    select 1 from public.user_accounts as account
    where account.id = v_actor_id and account.account_status = 'active'
  ) then
    raise exception 'ACCOUNT_NOT_ACTIVE' using errcode = '42501';
  end if;

  return query
  select
    application.id,
    application.club_id,
    application.status,
    application.recruitment_status_at_submission,
    application.experience_code,
    application.available_day_code,
    application.interest_codes,
    application.version,
    application.submitted_at,
    application.status_changed_at,
    application.finalized_at,
    application.updated_at
  from public.club_membership_applications as application
  where application.applicant_id = v_actor_id
    and (p_club_id is null or application.club_id = p_club_id)
    and (
      p_before_submitted_at is null
      or (application.submitted_at, application.id)
        < (p_before_submitted_at, p_before_application_id)
    )
  order by application.submitted_at desc, application.id desc
  limit p_limit;
end;
$$;

revoke all on function public.list_my_club_membership_applications(
  uuid, integer, timestamptz, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.list_my_club_membership_applications(
  uuid, integer, timestamptz, uuid
) to authenticated;

create function public.get_my_club_membership_application(p_application_id uuid)
returns table (
  application_id uuid,
  club_id uuid,
  applicant_id uuid,
  status text,
  recruitment_status_at_submission text,
  experience_code text,
  available_day_code text,
  interest_codes text[],
  application_reason text,
  message text,
  guidelines_confirmed_at timestamptz,
  guidelines_version text,
  application_version bigint,
  submitted_at timestamptz,
  status_changed_at timestamptz,
  finalized_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if p_application_id is null then
    raise exception 'APPLICATION_REQUIRED';
  end if;
  if not exists (
    select 1 from public.user_accounts as account
    where account.id = v_actor_id and account.account_status = 'active'
  ) then
    raise exception 'ACCOUNT_NOT_ACTIVE' using errcode = '42501';
  end if;

  return query
  select
    application.id,
    application.club_id,
    application.applicant_id,
    application.status,
    application.recruitment_status_at_submission,
    application.experience_code,
    application.available_day_code,
    application.interest_codes,
    application.application_reason,
    application.message,
    application.guidelines_confirmed_at,
    application.guidelines_version,
    application.version,
    application.submitted_at,
    application.status_changed_at,
    application.finalized_at,
    application.updated_at
  from public.club_membership_applications as application
  where application.id = p_application_id
    and application.applicant_id = v_actor_id;
end;
$$;

revoke all on function public.get_my_club_membership_application(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_club_membership_application(uuid)
  to authenticated;

create function public.list_my_club_membership_application_history(
  p_application_id uuid
)
returns table (
  history_id uuid,
  application_id uuid,
  event_code text,
  from_status text,
  to_status text,
  application_version bigint,
  is_applicant_action boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if p_application_id is null then
    raise exception 'APPLICATION_REQUIRED';
  end if;
  if not exists (
    select 1
    from public.club_membership_applications as application
    join public.user_accounts as account
      on account.id = v_actor_id and account.account_status = 'active'
    where application.id = p_application_id
      and application.applicant_id = v_actor_id
  ) then
    raise exception 'APPLICATION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  return query
  select
    history.id,
    history.application_id,
    history.event_code,
    history.from_status,
    history.to_status,
    history.application_version,
    history.actor_user_id = v_actor_id,
    history.created_at
  from public.club_membership_application_status_history as history
  where history.application_id = p_application_id
  order by
    history.application_version,
    history.created_at,
    history.id;
end;
$$;

revoke all on function public.list_my_club_membership_application_history(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.list_my_club_membership_application_history(uuid)
  to authenticated;

create function public.list_my_club_membership_application_supplements(
  p_application_id uuid
)
returns table (
  supplement_id uuid,
  application_id uuid,
  entry_type text,
  body text,
  is_applicant_entry boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if p_application_id is null then
    raise exception 'APPLICATION_REQUIRED';
  end if;
  if not exists (
    select 1
    from public.club_membership_applications as application
    join public.user_accounts as account
      on account.id = v_actor_id and account.account_status = 'active'
    where application.id = p_application_id
      and application.applicant_id = v_actor_id
  ) then
    raise exception 'APPLICATION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  return query
  select
    supplement.id,
    supplement.application_id,
    supplement.entry_type,
    supplement.body,
    supplement.author_user_id = v_actor_id,
    supplement.created_at
  from public.club_membership_application_supplements as supplement
  where supplement.application_id = p_application_id
  order by supplement.created_at, supplement.id;
end;
$$;

revoke all on function public.list_my_club_membership_application_supplements(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.list_my_club_membership_application_supplements(uuid)
  to authenticated;
create function public.list_club_membership_applications(
  p_club_id uuid,
  p_status text default null,
  p_limit integer default 50,
  p_before_submitted_at timestamptz default null,
  p_before_application_id uuid default null
)
returns table (
  application_id uuid,
  club_id uuid,
  applicant_id uuid,
  applicant_display_name text,
  status text,
  experience_code text,
  available_day_code text,
  interest_codes text[],
  application_version bigint,
  submitted_at timestamptz,
  status_changed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_status text := nullif(pg_catalog.btrim(p_status), '');
begin
  if v_actor_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if p_club_id is null then
    raise exception 'CLUB_REQUIRED';
  end if;
  if v_status is not null and v_status not in (
    'submitted', 'reviewing', 'additional_info_required',
    'interview_requested', 'waitlisted', 'approved', 'rejected', 'withdrawn'
  ) then
    raise exception 'INVALID_APPLICATION_STATUS';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'INVALID_PAGE_LIMIT';
  end if;
  if (p_before_submitted_at is null) <> (p_before_application_id is null) then
    raise exception 'INVALID_PAGE_CURSOR';
  end if;
  if not exists (
    select 1 from public.user_accounts as account
    where account.id = v_actor_id and account.account_status = 'active'
  ) or not private.club_user_has_permission(
    v_actor_id, p_club_id, 'club.membership_applications.read'
  ) then
    raise exception 'APPLICATION_READ_PERMISSION_REQUIRED' using errcode = '42501';
  end if;

  return query
  select
    application.id,
    application.club_id,
    application.applicant_id,
    coalesce(nullif(pg_catalog.btrim(profile.display_name), ''), 'Name unavailable'),
    application.status,
    application.experience_code,
    application.available_day_code,
    application.interest_codes,
    application.version,
    application.submitted_at,
    application.status_changed_at
  from public.club_membership_applications as application
  left join public.user_profiles as profile on profile.user_id = application.applicant_id
  where application.club_id = p_club_id
    and (v_status is null or application.status = v_status)
    and (
      p_before_submitted_at is null
      or (application.submitted_at, application.id)
        < (p_before_submitted_at, p_before_application_id)
    )
  order by application.submitted_at desc, application.id desc
  limit p_limit;
end;
$$;

revoke all on function public.list_club_membership_applications(
  uuid, text, integer, timestamptz, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.list_club_membership_applications(
  uuid, text, integer, timestamptz, uuid
) to authenticated;

create function public.get_club_membership_application_for_management(
  p_application_id uuid
)
returns table (
  application_id uuid,
  club_id uuid,
  applicant_id uuid,
  applicant_display_name text,
  status text,
  recruitment_status_at_submission text,
  experience_code text,
  available_day_code text,
  interest_codes text[],
  application_reason text,
  message text,
  guidelines_confirmed_at timestamptz,
  guidelines_version text,
  application_version bigint,
  submitted_at timestamptz,
  status_changed_at timestamptz,
  finalized_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_club_id uuid;
begin
  if v_actor_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if p_application_id is null then
    raise exception 'APPLICATION_REQUIRED';
  end if;
  if not exists (
    select 1 from public.user_accounts as account
    where account.id = v_actor_id and account.account_status = 'active'
  ) then
    raise exception 'ACCOUNT_NOT_ACTIVE' using errcode = '42501';
  end if;

  select application.club_id into v_club_id
  from public.club_membership_applications as application
  where application.id = p_application_id;

  if not found or not private.club_user_has_permission(
    v_actor_id, v_club_id, 'club.membership_applications.read'
  ) then
    raise exception 'APPLICATION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  return query
  select
    application.id,
    application.club_id,
    application.applicant_id,
    coalesce(nullif(pg_catalog.btrim(profile.display_name), ''), 'Name unavailable'),
    application.status,
    application.recruitment_status_at_submission,
    application.experience_code,
    application.available_day_code,
    application.interest_codes,
    application.application_reason,
    application.message,
    application.guidelines_confirmed_at,
    application.guidelines_version,
    application.version,
    application.submitted_at,
    application.status_changed_at,
    application.finalized_at,
    application.updated_at
  from public.club_membership_applications as application
  left join public.user_profiles as profile on profile.user_id = application.applicant_id
  where application.id = p_application_id
    and application.club_id = v_club_id;
end;
$$;

revoke all on function public.get_club_membership_application_for_management(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_club_membership_application_for_management(uuid)
  to authenticated;
create function public.list_club_membership_application_history_for_management(
  p_application_id uuid
)
returns table (
  history_id uuid,
  application_id uuid,
  club_id uuid,
  actor_user_id uuid,
  request_id uuid,
  event_code text,
  from_status text,
  to_status text,
  application_version bigint,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_club_id uuid;
begin
  if v_actor_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  select application.club_id into v_club_id
  from public.club_membership_applications as application
  where application.id = p_application_id;

  if not found
     or not exists (
       select 1 from public.user_accounts as account
       where account.id = v_actor_id and account.account_status = 'active'
     )
     or not private.club_user_has_permission(
       v_actor_id, v_club_id, 'club.membership_applications.read'
     ) then
    raise exception 'APPLICATION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  return query
  select
    history.id,
    history.application_id,
    history.club_id,
    history.actor_user_id,
    history.request_id,
    history.event_code,
    history.from_status,
    history.to_status,
    history.application_version,
    history.created_at
  from public.club_membership_application_status_history as history
  where history.application_id = p_application_id
    and history.club_id = v_club_id
  order by
    history.application_version,
    history.created_at,
    history.id;
end;
$$;

revoke all on function public.list_club_membership_application_history_for_management(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.list_club_membership_application_history_for_management(uuid)
  to authenticated;

create function public.list_club_membership_application_supplements_for_management(
  p_application_id uuid
)
returns table (
  supplement_id uuid,
  application_id uuid,
  club_id uuid,
  author_user_id uuid,
  entry_type text,
  body text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_club_id uuid;
begin
  if v_actor_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  select application.club_id into v_club_id
  from public.club_membership_applications as application
  where application.id = p_application_id;

  if not found
     or not exists (
       select 1 from public.user_accounts as account
       where account.id = v_actor_id and account.account_status = 'active'
     )
     or not private.club_user_has_permission(
       v_actor_id, v_club_id, 'club.membership_applications.read'
     ) then
    raise exception 'APPLICATION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  return query
  select
    supplement.id,
    supplement.application_id,
    supplement.club_id,
    supplement.author_user_id,
    supplement.entry_type,
    supplement.body,
    supplement.created_at
  from public.club_membership_application_supplements as supplement
  where supplement.application_id = p_application_id
    and supplement.club_id = v_club_id
  order by supplement.created_at, supplement.id;
end;
$$;

revoke all on function public.list_club_membership_application_supplements_for_management(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.list_club_membership_application_supplements_for_management(uuid)
  to authenticated;

create function public.list_club_membership_application_internal_notes(
  p_application_id uuid
)
returns table (
  note_id uuid,
  application_id uuid,
  club_id uuid,
  author_user_id uuid,
  body text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_club_id uuid;
begin
  if v_actor_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  select application.club_id into v_club_id
  from public.club_membership_applications as application
  where application.id = p_application_id;

  if not found
     or not exists (
       select 1 from public.user_accounts as account
       where account.id = v_actor_id and account.account_status = 'active'
     )
     or not private.club_user_has_permission(
       v_actor_id, v_club_id, 'club.membership_applications.read'
     ) then
    raise exception 'APPLICATION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  return query
  select
    note.id,
    note.application_id,
    note.club_id,
    note.author_user_id,
    note.body,
    note.created_at
  from public.club_membership_application_internal_notes as note
  where note.application_id = p_application_id
    and note.club_id = v_club_id
  order by note.created_at, note.id;
end;
$$;

revoke all on function public.list_club_membership_application_internal_notes(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.list_club_membership_application_internal_notes(uuid)
  to authenticated;

comment on function public.submit_club_membership_application(
  uuid, text, text, text[], text, text, boolean, boolean, boolean, uuid
) is 'Creates one protected membership application with recruitment and membership eligibility checks.';

comment on function public.manage_club_membership_application(
  uuid, text, bigint, text, uuid
) is 'Applies only the approved non-final application transitions with optimistic concurrency.';

comment on function public.reject_club_membership_application(
  uuid, bigint, uuid
) is 'Rejects an in-progress application for an active club administrator or vice administrator only.';
