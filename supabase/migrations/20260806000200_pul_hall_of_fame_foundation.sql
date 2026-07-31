-- PUL 8-6-B-1: Hall of Fame schema, RLS, guarded data, and private evidence storage.
-- Eligibility, workflow, evidence signing, review, and canonical record mutations are deferred.

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
    'club.achievement_applications.read',
    '명예의 전당 추천 조회',
    '동호회가 등록한 명예의 전당 추천 신청을 조회합니다.',
    'achievement_applications',
    true,
    true
  ),
  (
    'club.achievement_applications.nominate',
    '명예의 전당 기록 추천',
    '같은 동호회 active 회원의 기록을 명예의 전당에 추천합니다.',
    'achievement_applications',
    true,
    true
  ),
  (
    'club.achievement_applications.confirm',
    '명예의 전당 기록 독립 확인',
    '이해충돌이 있는 명예의 전당 추천 기록을 독립적으로 확인합니다.',
    'achievement_applications',
    true,
    true
  ),
  (
    'club.achievement_applications.manage',
    '명예의 전당 추천 관리',
    '동호회 명예의 전당 추천 신청의 비최종 상태를 관리합니다.',
    'achievement_applications',
    true,
    true
  );

insert into public.club_role_permissions (
  role_code,
  permission_code
)
values
  ('club_admin', 'club.achievement_applications.read'),
  ('club_admin', 'club.achievement_applications.nominate'),
  ('club_admin', 'club.achievement_applications.confirm'),
  ('club_admin', 'club.achievement_applications.manage'),
  ('club_vice_admin', 'club.achievement_applications.confirm');

do $$
begin
  if (
    select pg_catalog.count(*)
    from public.club_permission_definitions as permission
    where permission.permission_code like 'club.achievement_applications.%'
      and permission.permission_group = 'achievement_applications'
      and permission.is_system
      and permission.is_active
  ) <> 4 then
    raise exception '명예의 전당 동호회 권한 정의가 승인된 상태와 일치하지 않습니다.';
  end if;

  if exists (
    select 1
    from public.club_role_permissions as mapping
    where mapping.permission_code like 'club.achievement_applications.%'
      and mapping.role_code in ('club_member', 'club_manager')
  ) then
    raise exception '일반 회원 또는 일반 운영진에게 명예의 전당 운영 권한이 연결되어 있습니다.';
  end if;
end;
$$;

create table public.hall_of_fame_record_type_definitions (
  code text primary key,
  display_name text not null,
  description text,
  qualification_kind text not null,
  qualification_value integer not null,
  is_active boolean not null default true,
  display_order integer not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint hall_of_fame_record_type_code_check
    check (
      code = pg_catalog.btrim(code)
      and code ~ '^[a-z][a-z0-9_]*$'
    ),
  constraint hall_of_fame_record_type_display_name_check
    check (
      display_name = pg_catalog.btrim(display_name)
      and display_name <> ''
      and pg_catalog.char_length(display_name) <= 100
    ),
  constraint hall_of_fame_record_type_description_check
    check (
      description is null
      or (
        description = pg_catalog.btrim(description)
        and description <> ''
        and pg_catalog.char_length(description) <= 500
      )
    ),
  constraint hall_of_fame_record_type_qualification_check
    check (
      (
        qualification_kind = 'single_hole_score'
        and qualification_value = 1
      )
      or (
        qualification_kind = 'relative_to_par'
        and qualification_value between 1 and 9
      )
    ),
  constraint hall_of_fame_record_type_display_order_check
    check (display_order >= 0)
);

comment on table public.hall_of_fame_record_type_definitions is
  'Extensible Hall of Fame achievement types and their minimum single-hole qualification rule.';

insert into public.hall_of_fame_record_type_definitions (
  code,
  display_name,
  description,
  qualification_kind,
  qualification_value,
  is_active,
  display_order
)
values
  (
    'hole_in_one',
    '홀인원',
    '한 홀을 한 타에 완료한 공식 기록',
    'single_hole_score',
    1,
    true,
    10
  ),
  (
    'albatross',
    '알바트로스',
    '한 홀에서 기준 타수보다 세 타 적게 완료한 공식 기록',
    'relative_to_par',
    3,
    true,
    20
  ),
  (
    'condor',
    '콘도르',
    '한 홀에서 기준 타수보다 네 타 적게 완료한 공식 기록',
    'relative_to_par',
    4,
    true,
    30
  );

create table public.hall_of_fame_application_batches (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  application_type text not null,
  created_by_user_id uuid not null
    references public.user_accounts (id) on delete restrict,
  created_by_membership_id uuid
    references public.club_memberships (id) on delete restrict,
  nominating_club_id uuid
    references public.clubs (id) on delete restrict,
  vacancy_context_club_id uuid
    references public.clubs (id) on delete restrict,
  status text not null default 'draft',
  version integer not null default 1,
  submitted_at timestamptz,
  finalized_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint hall_of_fame_application_batches_type_check
    check (
      application_type in (
        'club_nomination',
        'direct_application',
        'club_admin_vacancy_direct_application'
      )
    ),
  constraint hall_of_fame_application_batches_identity_check
    check (
      (
        application_type = 'club_nomination'
        and created_by_membership_id is not null
        and nominating_club_id is not null
        and vacancy_context_club_id is null
      )
      or (
        application_type = 'direct_application'
        and created_by_membership_id is null
        and nominating_club_id is null
        and vacancy_context_club_id is null
      )
      or (
        application_type = 'club_admin_vacancy_direct_application'
        and created_by_membership_id is not null
        and nominating_club_id is null
        and vacancy_context_club_id is not null
      )
    ),
  constraint hall_of_fame_application_batches_status_check
    check (
      status in (
        'draft',
        'submitted',
        'under_review',
        'additional_info_required',
        'approved',
        'partially_approved',
        'rejected',
        'withdrawn',
        'cancelled'
      )
    ),
  constraint hall_of_fame_application_batches_version_check
    check (version >= 1),
  constraint hall_of_fame_application_batches_submission_check
    check (
      (status = 'draft' and submitted_at is null)
      or (status <> 'draft' and submitted_at is not null)
    ),
  constraint hall_of_fame_application_batches_finalization_check
    check (
      (
        status in (
          'draft',
          'submitted',
          'under_review',
          'additional_info_required'
        )
        and finalized_at is null
      )
      or (
        status in (
          'approved',
          'partially_approved',
          'rejected',
          'withdrawn',
          'cancelled'
        )
        and finalized_at is not null
      )
    ),
  constraint hall_of_fame_application_batches_timeline_check
    check (
      (submitted_at is null or submitted_at >= created_at)
      and (finalized_at is null or finalized_at >= submitted_at)
      and updated_at >= created_at
    )
);

comment on table public.hall_of_fame_application_batches is
  'One protected Hall of Fame application or multi-member club nomination batch.';

create index hall_of_fame_application_batches_creator_idx
  on public.hall_of_fame_application_batches (
    created_by_user_id,
    created_at desc,
    id desc
  );

create index hall_of_fame_application_batches_club_status_idx
  on public.hall_of_fame_application_batches (
    nominating_club_id,
    status,
    created_at desc
  )
  where nominating_club_id is not null;

create table public.hall_of_fame_round_snapshots (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  application_batch_id uuid not null unique
    references public.hall_of_fame_application_batches (id) on delete restrict,
  played_on date not null,
  started_at timestamptz,
  course_name_snapshot text not null,
  course_region_snapshot text not null,
  course_environment text not null,
  course_layout_snapshot text,
  round_type text not null,
  event_name_snapshot text,
  notes text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint hall_of_fame_round_snapshots_id_batch_unique
    unique (id, application_batch_id),
  constraint hall_of_fame_round_snapshots_played_on_check
    check (played_on >= date '2000-01-01'),
  constraint hall_of_fame_round_snapshots_course_name_check
    check (
      course_name_snapshot = pg_catalog.btrim(course_name_snapshot)
      and course_name_snapshot <> ''
      and pg_catalog.char_length(course_name_snapshot) <= 200
    ),
  constraint hall_of_fame_round_snapshots_course_region_check
    check (
      course_region_snapshot = pg_catalog.btrim(course_region_snapshot)
      and course_region_snapshot <> ''
      and pg_catalog.char_length(course_region_snapshot) <= 100
    ),
  constraint hall_of_fame_round_snapshots_environment_check
    check (course_environment in ('outdoor', 'screen')),
  constraint hall_of_fame_round_snapshots_layout_check
    check (
      course_layout_snapshot is null
      or (
        course_layout_snapshot = pg_catalog.btrim(course_layout_snapshot)
        and course_layout_snapshot <> ''
        and pg_catalog.char_length(course_layout_snapshot) <= 200
      )
    ),
  constraint hall_of_fame_round_snapshots_round_type_check
    check (round_type in ('casual', 'club_event', 'tournament', 'practice')),
  constraint hall_of_fame_round_snapshots_event_name_check
    check (
      event_name_snapshot is null
      or (
        event_name_snapshot = pg_catalog.btrim(event_name_snapshot)
        and event_name_snapshot <> ''
        and pg_catalog.char_length(event_name_snapshot) <= 200
      )
    ),
  constraint hall_of_fame_round_snapshots_notes_check
    check (
      notes is null
      or (
        notes = pg_catalog.btrim(notes)
        and notes <> ''
        and pg_catalog.char_length(notes) <= 1000
      )
    ),
  constraint hall_of_fame_round_snapshots_timeline_check
    check (updated_at >= created_at)
);

comment on table public.hall_of_fame_round_snapshots is
  'Submission-frozen round and course snapshot; no unconstrained course catalog UUID is stored.';

create table public.hall_of_fame_application_records (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  application_batch_id uuid not null
    references public.hall_of_fame_application_batches (id) on delete restrict,
  round_snapshot_id uuid not null,
  target_user_id uuid not null
    references public.user_accounts (id) on delete restrict,
  target_membership_id uuid
    references public.club_memberships (id) on delete restrict,
  record_type_code text not null
    references public.hall_of_fame_record_type_definitions (code) on delete restrict,
  course_segment_snapshot text not null,
  hole_number integer not null,
  hole_par integer,
  strokes integer,
  club_verification_status text not null default 'pending',
  member_consent_status text not null default 'pending',
  review_status text not null default 'draft',
  conflict_of_interest boolean not null default false,
  fingerprint_version smallint not null default 1,
  duplicate_fingerprint bytea,
  version integer not null default 1,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint hall_of_fame_application_records_id_batch_unique
    unique (id, application_batch_id),
  constraint hall_of_fame_application_records_id_target_unique
    unique (id, target_user_id),
  constraint hall_of_fame_application_records_round_batch_fkey
    foreign key (round_snapshot_id, application_batch_id)
    references public.hall_of_fame_round_snapshots (id, application_batch_id)
    on delete restrict,
  constraint hall_of_fame_application_records_segment_check
    check (
      course_segment_snapshot = pg_catalog.btrim(course_segment_snapshot)
      and course_segment_snapshot <> ''
      and pg_catalog.char_length(course_segment_snapshot) <= 100
    ),
  constraint hall_of_fame_application_records_hole_check
    check (hole_number between 1 and 36),
  constraint hall_of_fame_application_records_par_check
    check (hole_par is null or hole_par between 1 and 9),
  constraint hall_of_fame_application_records_strokes_check
    check (strokes is null or strokes between 1 and 99),
  constraint hall_of_fame_application_records_verification_check
    check (
      club_verification_status in (
        'not_applicable',
        'pending',
        'conflict_review_required',
        'independent_confirmation_pending',
        'verified',
        'rejected'
      )
    ),
  constraint hall_of_fame_application_records_consent_check
    check (
      member_consent_status in (
        'pending',
        'granted',
        'declined',
        'withdrawn'
      )
    ),
  constraint hall_of_fame_application_records_review_check
    check (
      review_status in (
        'draft',
        'submitted',
        'under_review',
        'additional_info_required',
        'approved',
        'rejected',
        'withdrawn',
        'cancelled'
      )
    ),
  constraint hall_of_fame_application_records_fingerprint_version_check
    check (fingerprint_version = 1),
  constraint hall_of_fame_application_records_fingerprint_check
    check (
      duplicate_fingerprint is null
      or pg_catalog.octet_length(duplicate_fingerprint) = 32
    ),
  constraint hall_of_fame_application_records_submitted_fingerprint_check
    check (
      review_status in ('draft', 'rejected', 'withdrawn', 'cancelled')
      or duplicate_fingerprint is not null
    ),
  constraint hall_of_fame_application_records_version_check
    check (version >= 1),
  constraint hall_of_fame_application_records_timeline_check
    check (updated_at >= created_at),
  constraint hall_of_fame_application_records_round_target_hole_unique
    unique (
      application_batch_id,
      target_user_id,
      course_segment_snapshot,
      hole_number
    )
);

comment on table public.hall_of_fame_application_records is
  'Individual target records inside one round batch, including independent workflow axes and duplicate claims.';

create unique index hall_of_fame_application_records_active_fingerprint_uidx
  on public.hall_of_fame_application_records (
    fingerprint_version,
    duplicate_fingerprint
  )
  where duplicate_fingerprint is not null
    and review_status in (
      'submitted',
      'under_review',
      'additional_info_required',
      'approved'
    );

create index hall_of_fame_application_records_batch_status_idx
  on public.hall_of_fame_application_records (
    application_batch_id,
    review_status,
    created_at,
    id
  );

create table private.hall_of_fame_mutation_requests (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  actor_user_id uuid not null
    references public.user_accounts (id) on delete restrict,
  request_id uuid not null,
  operation text not null,
  application_batch_id uuid
    references public.hall_of_fame_application_batches (id) on delete restrict,
  application_record_id uuid,
  target_user_id uuid
    references public.user_accounts (id) on delete restrict,
  payload_fingerprint bytea not null,
  status text not null default 'in_progress',
  result_payload jsonb,
  error_code text,
  created_at timestamptz not null default pg_catalog.now(),
  completed_at timestamptz,
  constraint hall_of_fame_mutation_requests_actor_request_unique
    unique (actor_user_id, request_id),
  constraint hall_of_fame_mutation_requests_record_batch_fkey
    foreign key (application_record_id, application_batch_id)
    references public.hall_of_fame_application_records (
      id,
      application_batch_id
    )
    on delete restrict,
  constraint hall_of_fame_mutation_requests_record_batch_presence_check
    check (
      application_record_id is null
      or application_batch_id is not null
    ),
  constraint hall_of_fame_mutation_requests_operation_check
    check (
      operation = pg_catalog.btrim(operation)
      and operation ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'
    ),
  constraint hall_of_fame_mutation_requests_fingerprint_check
    check (pg_catalog.octet_length(payload_fingerprint) = 32),
  constraint hall_of_fame_mutation_requests_status_check
    check (status in ('in_progress', 'completed', 'failed')),
  constraint hall_of_fame_mutation_requests_result_check
    check (
      result_payload is null
      or pg_catalog.jsonb_typeof(result_payload) = 'object'
    ),
  constraint hall_of_fame_mutation_requests_error_code_check
    check (
      error_code is null
      or (
        error_code = pg_catalog.btrim(error_code)
        and error_code ~ '^HOF_[A-Z0-9_]+$'
      )
    ),
  constraint hall_of_fame_mutation_requests_completion_check
    check (
      (
        status = 'in_progress'
        and result_payload is null
        and error_code is null
        and completed_at is null
      )
      or (
        status = 'completed'
        and result_payload is not null
        and error_code is null
        and completed_at is not null
      )
      or (
        status = 'failed'
        and result_payload is null
        and error_code is not null
        and completed_at is not null
      )
    ),
  constraint hall_of_fame_mutation_requests_timeline_check
    check (completed_at is null or completed_at >= created_at)
);

comment on table private.hall_of_fame_mutation_requests is
  'Private Hall of Fame idempotency ledger; replay engines are deferred to 8-6-B-2.';

create index hall_of_fame_mutation_requests_created_at_idx
  on private.hall_of_fame_mutation_requests (created_at);

create table public.hall_of_fame_record_confirmations (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  application_record_id uuid not null
    references public.hall_of_fame_application_records (id) on delete restrict,
  confirmer_user_id uuid
    references public.user_accounts (id) on delete restrict,
  confirmer_membership_id uuid
    references public.club_memberships (id) on delete restrict,
  external_contact_hmac bytea,
  external_contact_masked text,
  confirmation_role text not null,
  status text not null default 'pending',
  statement text,
  confirmed_at timestamptz,
  declined_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint hall_of_fame_record_confirmations_identity_check
    check (
      (
        confirmer_user_id is not null
        and external_contact_hmac is null
        and external_contact_masked is null
      )
      or (
        confirmer_user_id is null
        and confirmer_membership_id is null
        and external_contact_hmac is not null
        and external_contact_masked is not null
      )
    ),
  constraint hall_of_fame_record_confirmations_membership_check
    check (
      confirmer_membership_id is null
      or confirmer_user_id is not null
    ),
  constraint hall_of_fame_record_confirmations_hmac_check
    check (
      external_contact_hmac is null
      or pg_catalog.octet_length(external_contact_hmac) = 32
    ),
  constraint hall_of_fame_record_confirmations_masked_check
    check (
      external_contact_masked is null
      or (
        external_contact_masked = pg_catalog.btrim(external_contact_masked)
        and external_contact_masked <> ''
        and pg_catalog.char_length(external_contact_masked) <= 100
      )
    ),
  constraint hall_of_fame_record_confirmations_role_check
    check (
      confirmation_role in (
        'round_companion',
        'club_admin',
        'club_vice_admin',
        'external_companion'
      )
    ),
  constraint hall_of_fame_record_confirmations_role_identity_check
    check (
      (
        confirmation_role = 'external_companion'
        and confirmer_user_id is null
      )
      or (
        confirmation_role <> 'external_companion'
        and confirmer_user_id is not null
      )
    ),
  constraint hall_of_fame_record_confirmations_status_check
    check (
      status in ('pending', 'confirmed', 'declined', 'withdrawn', 'expired')
    ),
  constraint hall_of_fame_record_confirmations_status_timestamps_check
    check (
      (
        status in ('pending', 'expired')
        and confirmed_at is null
        and declined_at is null
      )
      or (
        status = 'confirmed'
        and confirmed_at is not null
        and declined_at is null
      )
      or (
        status = 'declined'
        and confirmed_at is null
        and declined_at is not null
      )
      or (
        status = 'withdrawn'
        and confirmed_at is not null
        and declined_at is null
      )
    ),
  constraint hall_of_fame_record_confirmations_statement_check
    check (
      statement is null
      or (
        statement = pg_catalog.btrim(statement)
        and statement <> ''
        and pg_catalog.char_length(statement) <= 1000
      )
    ),
  constraint hall_of_fame_record_confirmations_version_check
    check (version >= 1),
  constraint hall_of_fame_record_confirmations_timeline_check
    check (updated_at >= created_at)
);

comment on table public.hall_of_fame_record_confirmations is
  'Member or privacy-minimized external companion confirmations; raw external contact values are never stored.';

create unique index hall_of_fame_record_confirmations_member_uidx
  on public.hall_of_fame_record_confirmations (
    application_record_id,
    confirmer_user_id
  )
  where confirmer_user_id is not null;

create unique index hall_of_fame_record_confirmations_external_uidx
  on public.hall_of_fame_record_confirmations (
    application_record_id,
    external_contact_hmac
  )
  where external_contact_hmac is not null;

create table public.hall_of_fame_publication_consents (
  application_record_id uuid primary key,
  target_user_id uuid not null,
  status text not null default 'pending',
  display_name_consent boolean not null default false,
  avatar_consent boolean not null default false,
  club_name_consent boolean not null default false,
  record_date_consent boolean not null default false,
  course_detail_consent boolean not null default false,
  version integer not null default 1,
  consented_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint hall_of_fame_publication_consents_record_target_fkey
    foreign key (application_record_id, target_user_id)
    references public.hall_of_fame_application_records (id, target_user_id)
    on delete restrict,
  constraint hall_of_fame_publication_consents_status_check
    check (status in ('pending', 'granted', 'declined', 'withdrawn')),
  constraint hall_of_fame_publication_consents_scope_check
    check (
      status <> 'granted'
      or (
        display_name_consent
        and record_date_consent
        and course_detail_consent
      )
    ),
  constraint hall_of_fame_publication_consents_timestamps_check
    check (
      (
        status = 'pending'
        and consented_at is null
        and withdrawn_at is null
      )
      or (
        status = 'granted'
        and consented_at is not null
        and withdrawn_at is null
      )
      or (
        status = 'declined'
        and consented_at is null
        and withdrawn_at is null
      )
      or (
        status = 'withdrawn'
        and consented_at is not null
        and withdrawn_at is not null
        and withdrawn_at >= consented_at
      )
    ),
  constraint hall_of_fame_publication_consents_version_check
    check (version >= 1),
  constraint hall_of_fame_publication_consents_timeline_check
    check (updated_at >= created_at)
);

comment on table public.hall_of_fame_publication_consents is
  'Current per-record public display consent; every application record receives an independent decision.';

create table public.hall_of_fame_publication_consent_history (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  application_record_id uuid not null,
  target_user_id uuid not null,
  display_name_consent boolean not null,
  avatar_consent boolean not null,
  club_name_consent boolean not null,
  record_date_consent boolean not null,
  course_detail_consent boolean not null,
  from_status text,
  to_status text not null,
  version integer not null,
  actor_user_id uuid not null
    references public.user_accounts (id) on delete restrict,
  request_id uuid not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint hall_of_fame_publication_consent_history_record_target_fkey
    foreign key (application_record_id, target_user_id)
    references public.hall_of_fame_application_records (id, target_user_id)
    on delete restrict,
  constraint hall_of_fame_publication_consent_history_ledger_fkey
    foreign key (actor_user_id, request_id)
    references private.hall_of_fame_mutation_requests (
      actor_user_id,
      request_id
    )
    on delete restrict,
  constraint hall_of_fame_publication_consent_history_status_check
    check (
      (from_status is null or from_status in ('pending', 'granted', 'declined', 'withdrawn'))
      and to_status in ('pending', 'granted', 'declined', 'withdrawn')
    ),
  constraint hall_of_fame_publication_consent_history_scope_check
    check (
      to_status <> 'granted'
      or (
        display_name_consent
        and record_date_consent
        and course_detail_consent
      )
    ),
  constraint hall_of_fame_publication_consent_history_version_check
    check (version >= 1),
  constraint hall_of_fame_publication_consent_history_record_version_unique
    unique (application_record_id, version)
);

comment on table public.hall_of_fame_publication_consent_history is
  'Append-only per-record publication consent history linked to one HOF mutation request.';

create table public.hall_of_fame_evidence_files (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  application_batch_id uuid not null
    references public.hall_of_fame_application_batches (id) on delete restrict,
  application_record_id uuid,
  evidence_type text not null,
  storage_bucket text not null default 'hall-of-fame-evidence',
  storage_path text not null unique,
  mime_type text not null,
  byte_size bigint,
  sha256 bytea,
  original_filename text,
  uploaded_by_user_id uuid not null
    references public.user_accounts (id) on delete restrict,
  uploaded_by_membership_id uuid
    references public.club_memberships (id) on delete restrict,
  status text not null default 'pending_upload',
  replaced_by_evidence_id uuid,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  finalized_at timestamptz,
  deleted_at timestamptz,
  constraint hall_of_fame_evidence_files_id_batch_unique
    unique (id, application_batch_id),
  constraint hall_of_fame_evidence_files_record_batch_fkey
    foreign key (application_record_id, application_batch_id)
    references public.hall_of_fame_application_records (
      id,
      application_batch_id
    )
    on delete restrict,
  constraint hall_of_fame_evidence_files_replacement_batch_fkey
    foreign key (replaced_by_evidence_id, application_batch_id)
    references public.hall_of_fame_evidence_files (
      id,
      application_batch_id
    )
    on delete restrict,
  constraint hall_of_fame_evidence_files_type_check
    check (
      evidence_type in ('scorecard', 'round_photo', 'supporting_document')
    ),
  constraint hall_of_fame_evidence_files_bucket_check
    check (storage_bucket = 'hall-of-fame-evidence'),
  constraint hall_of_fame_evidence_files_path_check
    check (
      storage_path =
        'applications/'
        || application_batch_id::text
        || '/'
        || id::text
        || '/original'
    ),
  constraint hall_of_fame_evidence_files_mime_check
    check (
      mime_type in (
        'image/jpeg',
        'image/png',
        'image/webp',
        'application/pdf'
      )
    ),
  constraint hall_of_fame_evidence_files_pdf_check
    check (mime_type <> 'application/pdf' or evidence_type = 'scorecard'),
  constraint hall_of_fame_evidence_files_size_check
    check (
      byte_size is null
      or byte_size between 1 and 10485760
    ),
  constraint hall_of_fame_evidence_files_sha_check
    check (sha256 is null or pg_catalog.octet_length(sha256) = 32),
  constraint hall_of_fame_evidence_files_filename_check
    check (
      original_filename is null
      or (
        original_filename = pg_catalog.btrim(original_filename)
        and original_filename <> ''
        and pg_catalog.char_length(original_filename) <= 255
        and original_filename !~ '[[:cntrl:]]'
      )
    ),
  constraint hall_of_fame_evidence_files_status_check
    check (
      status in (
        'pending_upload',
        'uploaded_unverified',
        'available',
        'replaced',
        'deleted',
        'failed',
        'expired'
      )
    ),
  constraint hall_of_fame_evidence_files_available_check
    check (
      status <> 'available'
      or (
        byte_size is not null
        and sha256 is not null
        and finalized_at is not null
        and deleted_at is null
        and replaced_by_evidence_id is null
      )
    ),
  constraint hall_of_fame_evidence_files_replaced_check
    check (
      (
        status = 'replaced'
        and replaced_by_evidence_id is not null
        and replaced_by_evidence_id <> id
        and deleted_at is not null
      )
      or (
        status <> 'replaced'
        and replaced_by_evidence_id is null
      )
    ),
  constraint hall_of_fame_evidence_files_deleted_check
    check (status <> 'deleted' or deleted_at is not null),
  constraint hall_of_fame_evidence_files_timeline_check
    check (
      updated_at >= created_at
      and (finalized_at is null or finalized_at >= created_at)
      and (deleted_at is null or deleted_at >= created_at)
    )
);

comment on table public.hall_of_fame_evidence_files is
  'Private evidence object metadata; object bytes, raw companion contacts, and public URLs are not stored.';

create unique index hall_of_fame_evidence_files_available_sha_uidx
  on public.hall_of_fame_evidence_files (
    application_batch_id,
    sha256
  )
  where status = 'available' and sha256 is not null;

create index hall_of_fame_evidence_files_batch_status_idx
  on public.hall_of_fame_evidence_files (
    application_batch_id,
    status,
    created_at,
    id
  );

create table public.hall_of_fame_application_messages (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  application_batch_id uuid not null
    references public.hall_of_fame_application_batches (id) on delete restrict,
  application_record_id uuid,
  message_type text not null,
  body text not null,
  created_by_user_id uuid not null
    references public.user_accounts (id) on delete restrict,
  created_by_platform_role text,
  request_id uuid not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint hall_of_fame_application_messages_record_batch_fkey
    foreign key (application_record_id, application_batch_id)
    references public.hall_of_fame_application_records (
      id,
      application_batch_id
    )
    on delete restrict,
  constraint hall_of_fame_application_messages_ledger_fkey
    foreign key (created_by_user_id, request_id)
    references private.hall_of_fame_mutation_requests (
      actor_user_id,
      request_id
    )
    on delete restrict,
  constraint hall_of_fame_application_messages_type_check
    check (
      message_type in (
        'additional_info_request',
        'applicant_response',
        'system_notice'
      )
    ),
  constraint hall_of_fame_application_messages_body_check
    check (
      body = pg_catalog.btrim(body)
      and body <> ''
      and pg_catalog.char_length(body) <= 2000
    ),
  constraint hall_of_fame_application_messages_platform_role_check
    check (
      created_by_platform_role is null
      or created_by_platform_role in ('platform_moderator', 'platform_admin')
    )
);

comment on table public.hall_of_fame_application_messages is
  'Append-only applicant-visible additional-information requests, responses, and system notices.';

create index hall_of_fame_application_messages_batch_created_idx
  on public.hall_of_fame_application_messages (
    application_batch_id,
    created_at,
    id
  );

create table public.hall_of_fame_application_reviews (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  application_batch_id uuid not null
    references public.hall_of_fame_application_batches (id) on delete restrict,
  application_record_id uuid,
  review_action text not null,
  reviewer_user_id uuid not null
    references public.user_accounts (id) on delete restrict,
  reviewer_platform_role text not null,
  recommendation text,
  internal_note text,
  duplicate_suspected boolean not null default false,
  conflict_declared boolean not null default false,
  request_id uuid not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint hall_of_fame_application_reviews_record_batch_fkey
    foreign key (application_record_id, application_batch_id)
    references public.hall_of_fame_application_records (
      id,
      application_batch_id
    )
    on delete restrict,
  constraint hall_of_fame_application_reviews_ledger_fkey
    foreign key (reviewer_user_id, request_id)
    references private.hall_of_fame_mutation_requests (
      actor_user_id,
      request_id
    )
    on delete restrict,
  constraint hall_of_fame_application_reviews_action_check
    check (
      review_action in (
        'review_started',
        'additional_info_requested',
        'approval_recommended',
        'rejection_recommended',
        'final_approved',
        'final_rejected',
        'cancelled'
      )
    ),
  constraint hall_of_fame_application_reviews_platform_role_check
    check (reviewer_platform_role in ('platform_moderator', 'platform_admin')),
  constraint hall_of_fame_application_reviews_recommendation_check
    check (
      recommendation is null
      or recommendation in (
        'approve',
        'reject',
        'additional_info_required'
      )
    ),
  constraint hall_of_fame_application_reviews_note_check
    check (
      internal_note is null
      or (
        internal_note = pg_catalog.btrim(internal_note)
        and internal_note <> ''
        and pg_catalog.char_length(internal_note) <= 2000
      )
    )
);

comment on table public.hall_of_fame_application_reviews is
  'Append-only platform-internal Hall of Fame review records, never returned by applicant or public projections.';

create index hall_of_fame_application_reviews_batch_created_idx
  on public.hall_of_fame_application_reviews (
    application_batch_id,
    created_at,
    id
  );

create table public.hall_of_fame_application_history (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  scope text not null,
  application_batch_id uuid not null
    references public.hall_of_fame_application_batches (id) on delete restrict,
  application_record_id uuid,
  from_status text,
  to_status text not null,
  version integer not null,
  actor_user_id uuid not null
    references public.user_accounts (id) on delete restrict,
  actor_membership_id uuid
    references public.club_memberships (id) on delete restrict,
  actor_platform_role text,
  action text not null,
  reason text,
  request_id uuid not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint hall_of_fame_application_history_record_batch_fkey
    foreign key (application_record_id, application_batch_id)
    references public.hall_of_fame_application_records (
      id,
      application_batch_id
    )
    on delete restrict,
  constraint hall_of_fame_application_history_ledger_fkey
    foreign key (actor_user_id, request_id)
    references private.hall_of_fame_mutation_requests (
      actor_user_id,
      request_id
    )
    on delete restrict,
  constraint hall_of_fame_application_history_scope_check
    check (
      (scope = 'batch' and application_record_id is null)
      or (scope = 'record' and application_record_id is not null)
    ),
  constraint hall_of_fame_application_history_batch_status_check
    check (
      scope <> 'batch'
      or (
        (
          from_status is null
          or from_status in (
            'draft',
            'submitted',
            'under_review',
            'additional_info_required',
            'approved',
            'partially_approved',
            'rejected',
            'withdrawn',
            'cancelled'
          )
        )
        and to_status in (
          'draft',
          'submitted',
          'under_review',
          'additional_info_required',
          'approved',
          'partially_approved',
          'rejected',
          'withdrawn',
          'cancelled'
        )
      )
    ),
  constraint hall_of_fame_application_history_record_status_check
    check (
      scope <> 'record'
      or (
        (
          from_status is null
          or from_status in (
            'draft',
            'submitted',
            'under_review',
            'additional_info_required',
            'approved',
            'rejected',
            'withdrawn',
            'cancelled'
          )
        )
        and to_status in (
          'draft',
          'submitted',
          'under_review',
          'additional_info_required',
          'approved',
          'rejected',
          'withdrawn',
          'cancelled'
        )
      )
    ),
  constraint hall_of_fame_application_history_version_check
    check (version >= 1),
  constraint hall_of_fame_application_history_actor_platform_role_check
    check (
      actor_platform_role is null
      or actor_platform_role in ('platform_moderator', 'platform_admin')
    ),
  constraint hall_of_fame_application_history_action_check
    check (
      action = pg_catalog.btrim(action)
      and action ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'
    ),
  constraint hall_of_fame_application_history_reason_check
    check (
      reason is null
      or (
        reason = pg_catalog.btrim(reason)
        and reason <> ''
        and pg_catalog.char_length(reason) <= 1000
      )
    )
);

comment on table public.hall_of_fame_application_history is
  'Append-only batch and record state history with an explicit scope and monotonic entity version.';

create unique index hall_of_fame_application_history_batch_version_uidx
  on public.hall_of_fame_application_history (
    application_batch_id,
    version
  )
  where scope = 'batch';

create unique index hall_of_fame_application_history_record_version_uidx
  on public.hall_of_fame_application_history (
    application_record_id,
    version
  )
  where scope = 'record';

create table public.hall_of_fame_records (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  source_application_record_id uuid not null unique,
  target_user_id uuid not null,
  record_type_code text not null
    references public.hall_of_fame_record_type_definitions (code) on delete restrict,
  played_on date not null,
  course_name_snapshot text not null,
  course_region_snapshot text not null,
  course_environment text not null,
  course_layout_snapshot text,
  course_segment_snapshot text not null,
  hole_number integer not null,
  hole_par integer,
  strokes integer,
  nominating_club_id uuid
    references public.clubs (id) on delete restrict,
  fingerprint_version smallint not null default 1,
  record_fingerprint bytea not null,
  validity_status text not null,
  publication_status text not null default 'hidden',
  suppression_reason text,
  approved_by_user_id uuid not null
    references public.user_accounts (id) on delete restrict,
  approved_at timestamptz not null,
  published_at timestamptz,
  corrected_from_record_id uuid
    references public.hall_of_fame_records (id) on delete restrict,
  revoked_at timestamptz,
  revoked_by_user_id uuid
    references public.user_accounts (id) on delete restrict,
  revocation_reason text,
  version integer not null default 1,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint hall_of_fame_records_source_target_fkey
    foreign key (source_application_record_id, target_user_id)
    references public.hall_of_fame_application_records (id, target_user_id)
    on delete restrict,
  constraint hall_of_fame_records_id_target_unique
    unique (id, target_user_id),
  constraint hall_of_fame_records_course_name_check
    check (
      course_name_snapshot = pg_catalog.btrim(course_name_snapshot)
      and course_name_snapshot <> ''
      and pg_catalog.char_length(course_name_snapshot) <= 200
    ),
  constraint hall_of_fame_records_course_region_check
    check (
      course_region_snapshot = pg_catalog.btrim(course_region_snapshot)
      and course_region_snapshot <> ''
      and pg_catalog.char_length(course_region_snapshot) <= 100
    ),
  constraint hall_of_fame_records_environment_check
    check (course_environment in ('outdoor', 'screen')),
  constraint hall_of_fame_records_layout_check
    check (
      course_layout_snapshot is null
      or (
        course_layout_snapshot = pg_catalog.btrim(course_layout_snapshot)
        and course_layout_snapshot <> ''
        and pg_catalog.char_length(course_layout_snapshot) <= 200
      )
    ),
  constraint hall_of_fame_records_segment_check
    check (
      course_segment_snapshot = pg_catalog.btrim(course_segment_snapshot)
      and course_segment_snapshot <> ''
      and pg_catalog.char_length(course_segment_snapshot) <= 100
    ),
  constraint hall_of_fame_records_hole_check
    check (hole_number between 1 and 36),
  constraint hall_of_fame_records_par_check
    check (hole_par is null or hole_par between 1 and 9),
  constraint hall_of_fame_records_strokes_check
    check (strokes is null or strokes between 1 and 99),
  constraint hall_of_fame_records_fingerprint_version_check
    check (fingerprint_version = 1),
  constraint hall_of_fame_records_fingerprint_check
    check (pg_catalog.octet_length(record_fingerprint) = 32),
  constraint hall_of_fame_records_validity_check
    check (validity_status in ('active', 'provisional', 'corrected', 'revoked')),
  constraint hall_of_fame_records_publication_check
    check (publication_status in ('hidden', 'published', 'suppressed')),
  constraint hall_of_fame_records_publication_state_check
    check (
      (
        publication_status = 'hidden'
        and published_at is null
        and suppression_reason is null
      )
      or (
        publication_status = 'published'
        and validity_status = 'active'
        and published_at is not null
        and suppression_reason is null
      )
      or (
        publication_status = 'suppressed'
        and suppression_reason is not null
      )
    ),
  constraint hall_of_fame_records_correction_self_check
    check (corrected_from_record_id is null or corrected_from_record_id <> id),
  constraint hall_of_fame_records_revocation_check
    check (
      (
        validity_status in ('active', 'provisional', 'corrected')
        and revoked_at is null
        and revoked_by_user_id is null
        and revocation_reason is null
      )
      or (
        validity_status = 'revoked'
        and publication_status = 'suppressed'
        and revoked_at is not null
        and revoked_by_user_id is not null
        and revocation_reason is not null
      )
    ),
  constraint hall_of_fame_records_corrected_publication_check
    check (validity_status <> 'corrected' or publication_status = 'suppressed'),
  constraint hall_of_fame_records_reason_check
    check (
      suppression_reason is null
      or (
        suppression_reason = pg_catalog.btrim(suppression_reason)
        and suppression_reason <> ''
        and pg_catalog.char_length(suppression_reason) <= 500
      )
    ),
  constraint hall_of_fame_records_revocation_reason_check
    check (
      revocation_reason is null
      or (
        revocation_reason = pg_catalog.btrim(revocation_reason)
        and revocation_reason <> ''
        and pg_catalog.char_length(revocation_reason) <= 1000
      )
    ),
  constraint hall_of_fame_records_version_check
    check (version >= 1),
  constraint hall_of_fame_records_timeline_check
    check (
      approved_at >= created_at
      and updated_at >= created_at
      and (published_at is null or published_at >= approved_at)
      and (revoked_at is null or revoked_at >= approved_at)
    )
);

comment on table public.hall_of_fame_records is
  'Canonical approved Hall of Fame records; application workflow and public projection remain separate.';

create unique index hall_of_fame_records_active_fingerprint_uidx
  on public.hall_of_fame_records (
    fingerprint_version,
    record_fingerprint
  )
  where validity_status = 'active';

create unique index hall_of_fame_records_correction_successor_uidx
  on public.hall_of_fame_records (corrected_from_record_id)
  where corrected_from_record_id is not null;

create index hall_of_fame_records_public_listing_idx
  on public.hall_of_fame_records (
    record_type_code,
    played_on desc,
    id desc
  )
  where validity_status = 'active' and publication_status = 'published';

create table public.hall_of_fame_record_history (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  record_id uuid not null
    references public.hall_of_fame_records (id) on delete restrict,
  version integer not null,
  from_validity_status text,
  to_validity_status text not null,
  from_publication_status text,
  to_publication_status text not null,
  action text not null,
  reason text,
  actor_user_id uuid not null
    references public.user_accounts (id) on delete restrict,
  request_id uuid not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint hall_of_fame_record_history_ledger_fkey
    foreign key (actor_user_id, request_id)
    references private.hall_of_fame_mutation_requests (
      actor_user_id,
      request_id
    )
    on delete restrict,
  constraint hall_of_fame_record_history_version_unique
    unique (record_id, version),
  constraint hall_of_fame_record_history_version_check
    check (version >= 1),
  constraint hall_of_fame_record_history_validity_check
    check (
      (
        from_validity_status is null
        or from_validity_status in ('active', 'provisional', 'corrected', 'revoked')
      )
      and to_validity_status in ('active', 'provisional', 'corrected', 'revoked')
    ),
  constraint hall_of_fame_record_history_publication_check
    check (
      (
        from_publication_status is null
        or from_publication_status in ('hidden', 'published', 'suppressed')
      )
      and to_publication_status in ('hidden', 'published', 'suppressed')
    ),
  constraint hall_of_fame_record_history_action_check
    check (
      action = pg_catalog.btrim(action)
      and action ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'
    ),
  constraint hall_of_fame_record_history_reason_check
    check (
      reason is null
      or (
        reason = pg_catalog.btrim(reason)
        and reason <> ''
        and pg_catalog.char_length(reason) <= 1000
      )
    )
);

comment on table public.hall_of_fame_record_history is
  'Append-only canonical record validity and publication history.';

create table public.hall_of_fame_badge_definitions (
  code text primary key,
  display_name text not null,
  description text,
  source_record_type_code text
    references public.hall_of_fame_record_type_definitions (code) on delete restrict,
  display_priority integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint hall_of_fame_badge_definitions_code_check
    check (
      code = pg_catalog.btrim(code)
      and code ~ '^[a-z][a-z0-9_]*$'
    ),
  constraint hall_of_fame_badge_definitions_display_name_check
    check (
      display_name = pg_catalog.btrim(display_name)
      and display_name <> ''
      and pg_catalog.char_length(display_name) <= 100
    ),
  constraint hall_of_fame_badge_definitions_description_check
    check (
      description is null
      or (
        description = pg_catalog.btrim(description)
        and description <> ''
        and pg_catalog.char_length(description) <= 500
      )
    ),
  constraint hall_of_fame_badge_definitions_priority_check
    check (display_priority >= 0)
);

comment on table public.hall_of_fame_badge_definitions is
  'Canonical badge meaning; visual icons and emoji remain UI metadata.';

insert into public.hall_of_fame_badge_definitions (
  code,
  display_name,
  description,
  source_record_type_code,
  display_priority,
  is_active
)
values
  (
    'hole_in_one',
    '홀인원',
    'active 홀인원 공식 기록에서 파생되는 성취 배지',
    'hole_in_one',
    10,
    true
  ),
  (
    'albatross',
    '알바트로스',
    'active 알바트로스 공식 기록에서 파생되는 성취 배지',
    'albatross',
    20,
    true
  ),
  (
    'condor',
    '콘도르',
    'active 콘도르 공식 기록에서 파생되는 성취 배지',
    'condor',
    30,
    true
  ),
  (
    'hall_of_fame_inductee',
    '명예의 전당 등재',
    '하나 이상의 active 공식 기록에서 파생되는 공통 성취 배지',
    null,
    40,
    true
  );

create table public.hall_of_fame_badge_sources (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  target_user_id uuid not null,
  badge_code text not null
    references public.hall_of_fame_badge_definitions (code) on delete restrict,
  record_id uuid not null,
  status text not null default 'active',
  activated_at timestamptz not null default pg_catalog.now(),
  deactivated_at timestamptz,
  deactivation_reason text,
  created_at timestamptz not null default pg_catalog.now(),
  constraint hall_of_fame_badge_sources_record_target_fkey
    foreign key (record_id, target_user_id)
    references public.hall_of_fame_records (id, target_user_id)
    on delete restrict,
  constraint hall_of_fame_badge_sources_status_check
    check (status in ('active', 'inactive')),
  constraint hall_of_fame_badge_sources_activation_timeline_check
    check (activated_at >= created_at),
  constraint hall_of_fame_badge_sources_status_timestamps_check
    check (
      (
        status = 'active'
        and deactivated_at is null
        and deactivation_reason is null
      )
      or (
        status = 'inactive'
        and deactivated_at is not null
        and deactivation_reason is not null
        and deactivated_at >= activated_at
      )
    ),
  constraint hall_of_fame_badge_sources_reason_check
    check (
      deactivation_reason is null
      or (
        deactivation_reason = pg_catalog.btrim(deactivation_reason)
        and deactivation_reason <> ''
        and pg_catalog.char_length(deactivation_reason) <= 500
      )
    )
);

comment on table public.hall_of_fame_badge_sources is
  'Historical badge sources derived only from active canonical records; rows are deactivated, never deleted.';

create unique index hall_of_fame_badge_sources_active_record_badge_uidx
  on public.hall_of_fame_badge_sources (record_id, badge_code)
  where status = 'active';

create index hall_of_fame_badge_sources_user_active_idx
  on public.hall_of_fame_badge_sources (
    target_user_id,
    badge_code,
    activated_at desc
  )
  where status = 'active';

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'hall-of-fame-evidence',
  'hall-of-fame-evidence',
  false,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf'
  ]::text[]
);

create trigger hall_of_fame_record_type_definitions_set_updated_at
before update on public.hall_of_fame_record_type_definitions
for each row execute function public.set_user_foundation_updated_at();

create trigger hall_of_fame_application_batches_set_updated_at
before update on public.hall_of_fame_application_batches
for each row execute function public.set_user_foundation_updated_at();

create trigger hall_of_fame_round_snapshots_set_updated_at
before update on public.hall_of_fame_round_snapshots
for each row execute function public.set_user_foundation_updated_at();

create trigger hall_of_fame_application_records_set_updated_at
before update on public.hall_of_fame_application_records
for each row execute function public.set_user_foundation_updated_at();

create trigger hall_of_fame_record_confirmations_set_updated_at
before update on public.hall_of_fame_record_confirmations
for each row execute function public.set_user_foundation_updated_at();

create trigger hall_of_fame_publication_consents_set_updated_at
before update on public.hall_of_fame_publication_consents
for each row execute function public.set_user_foundation_updated_at();

create trigger hall_of_fame_evidence_files_set_updated_at
before update on public.hall_of_fame_evidence_files
for each row execute function public.set_user_foundation_updated_at();

create trigger hall_of_fame_records_set_updated_at
before update on public.hall_of_fame_records
for each row execute function public.set_user_foundation_updated_at();

create trigger hall_of_fame_badge_definitions_set_updated_at
before update on public.hall_of_fame_badge_definitions
for each row execute function public.set_user_foundation_updated_at();

alter table public.hall_of_fame_record_type_definitions enable row level security;
alter table public.hall_of_fame_record_type_definitions force row level security;
alter table public.hall_of_fame_application_batches enable row level security;
alter table public.hall_of_fame_application_batches force row level security;
alter table public.hall_of_fame_round_snapshots enable row level security;
alter table public.hall_of_fame_round_snapshots force row level security;
alter table public.hall_of_fame_application_records enable row level security;
alter table public.hall_of_fame_application_records force row level security;
alter table public.hall_of_fame_record_confirmations enable row level security;
alter table public.hall_of_fame_record_confirmations force row level security;
alter table public.hall_of_fame_publication_consents enable row level security;
alter table public.hall_of_fame_publication_consents force row level security;
alter table public.hall_of_fame_publication_consent_history enable row level security;
alter table public.hall_of_fame_publication_consent_history force row level security;
alter table public.hall_of_fame_evidence_files enable row level security;
alter table public.hall_of_fame_evidence_files force row level security;
alter table public.hall_of_fame_application_messages enable row level security;
alter table public.hall_of_fame_application_messages force row level security;
alter table public.hall_of_fame_application_reviews enable row level security;
alter table public.hall_of_fame_application_reviews force row level security;
alter table public.hall_of_fame_application_history enable row level security;
alter table public.hall_of_fame_application_history force row level security;
alter table public.hall_of_fame_records enable row level security;
alter table public.hall_of_fame_records force row level security;
alter table public.hall_of_fame_record_history enable row level security;
alter table public.hall_of_fame_record_history force row level security;
alter table public.hall_of_fame_badge_definitions enable row level security;
alter table public.hall_of_fame_badge_definitions force row level security;
alter table public.hall_of_fame_badge_sources enable row level security;
alter table public.hall_of_fame_badge_sources force row level security;
alter table private.hall_of_fame_mutation_requests enable row level security;
alter table private.hall_of_fame_mutation_requests force row level security;

revoke all on table public.hall_of_fame_record_type_definitions
  from public, anon, authenticated, service_role;
revoke all on table public.hall_of_fame_application_batches
  from public, anon, authenticated, service_role;
revoke all on table public.hall_of_fame_round_snapshots
  from public, anon, authenticated, service_role;
revoke all on table public.hall_of_fame_application_records
  from public, anon, authenticated, service_role;
revoke all on table public.hall_of_fame_record_confirmations
  from public, anon, authenticated, service_role;
revoke all on table public.hall_of_fame_publication_consents
  from public, anon, authenticated, service_role;
revoke all on table public.hall_of_fame_publication_consent_history
  from public, anon, authenticated, service_role;
revoke all on table public.hall_of_fame_evidence_files
  from public, anon, authenticated, service_role;
revoke all on table public.hall_of_fame_application_messages
  from public, anon, authenticated, service_role;
revoke all on table public.hall_of_fame_application_reviews
  from public, anon, authenticated, service_role;
revoke all on table public.hall_of_fame_application_history
  from public, anon, authenticated, service_role;
revoke all on table public.hall_of_fame_records
  from public, anon, authenticated, service_role;
revoke all on table public.hall_of_fame_record_history
  from public, anon, authenticated, service_role;
revoke all on table public.hall_of_fame_badge_definitions
  from public, anon, authenticated, service_role;
revoke all on table public.hall_of_fame_badge_sources
  from public, anon, authenticated, service_role;
revoke all on table private.hall_of_fame_mutation_requests
  from public, anon, authenticated, service_role;

create function private.enforce_hall_of_fame_evidence_replacement_invariants()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  replacement_batch_id uuid;
  replacement_status text;
  replacement_created_at timestamptz;
  replacement_cycle_exists boolean;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.application_batch_id::text, 8602)
  );

  if new.replaced_by_evidence_id is null then
    return new;
  end if;

  if new.replaced_by_evidence_id = new.id then
    raise exception 'HOF_EVIDENCE_REPLACEMENT_SELF_REFERENCE'
      using errcode = '23514';
  end if;

  select
    evidence.application_batch_id,
    evidence.status,
    evidence.created_at
  into
    replacement_batch_id,
    replacement_status,
    replacement_created_at
  from public.hall_of_fame_evidence_files as evidence
  where evidence.id = new.replaced_by_evidence_id;

  if not found then
    raise exception 'HOF_EVIDENCE_REPLACEMENT_TARGET_INVALID'
      using errcode = '23503';
  end if;

  if replacement_batch_id <> new.application_batch_id then
    raise exception 'HOF_EVIDENCE_REPLACEMENT_BATCH_MISMATCH'
      using errcode = '23514';
  end if;

  if replacement_status in ('deleted', 'failed', 'expired') then
    raise exception 'HOF_EVIDENCE_REPLACEMENT_TARGET_INVALID'
      using errcode = '23514';
  end if;

  with recursive replacement_chain as (
    select
      evidence.id,
      evidence.replaced_by_evidence_id,
      array[evidence.id]::uuid[] as visited_ids
    from public.hall_of_fame_evidence_files as evidence
    where evidence.id = new.replaced_by_evidence_id

    union all

    select
      next_evidence.id,
      next_evidence.replaced_by_evidence_id,
      replacement_chain.visited_ids || next_evidence.id
    from replacement_chain
    join public.hall_of_fame_evidence_files as next_evidence
      on next_evidence.id = replacement_chain.replaced_by_evidence_id
    where replacement_chain.replaced_by_evidence_id is not null
      and not replacement_chain.replaced_by_evidence_id = any (
        replacement_chain.visited_ids
      )
      and pg_catalog.cardinality(replacement_chain.visited_ids) < 1000
  )
  select coalesce(
    pg_catalog.bool_or(
      replacement_chain.replaced_by_evidence_id = new.id
      or replacement_chain.replaced_by_evidence_id = any (
        replacement_chain.visited_ids
      )
      or (
        pg_catalog.cardinality(replacement_chain.visited_ids) >= 1000
        and replacement_chain.replaced_by_evidence_id is not null
      )
    ),
    false
  )
  into replacement_cycle_exists
  from replacement_chain;

  if replacement_cycle_exists then
    raise exception 'HOF_EVIDENCE_REPLACEMENT_CYCLE'
      using errcode = '23514';
  end if;

  if replacement_created_at < new.created_at then
    raise exception 'HOF_EVIDENCE_REPLACEMENT_TARGET_INVALID'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function private.enforce_hall_of_fame_evidence_replacement_invariants() is
  'Enforces same-batch, forward-only, valid-target, acyclic evidence replacement lineage.';

revoke all on function private.enforce_hall_of_fame_evidence_replacement_invariants()
  from public, anon, authenticated, service_role;

create function private.enforce_hall_of_fame_badge_source_invariants()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  source_target_user_id uuid;
  source_record_type_code text;
  source_validity_status text;
  badge_source_record_type_code text;
  badge_is_active boolean;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.record_id::text, 8603)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.badge_code, 8604)
  );

  select
    record.target_user_id,
    record.record_type_code,
    record.validity_status
  into
    source_target_user_id,
    source_record_type_code,
    source_validity_status
  from public.hall_of_fame_records as record
  where record.id = new.record_id;

  if not found then
    raise exception 'HOF_BADGE_SOURCE_RECORD_NOT_FOUND'
      using errcode = '23503';
  end if;

  select
    definition.source_record_type_code,
    definition.is_active
  into
    badge_source_record_type_code,
    badge_is_active
  from public.hall_of_fame_badge_definitions as definition
  where definition.code = new.badge_code;

  if not found then
    raise exception 'HOF_BADGE_DEFINITION_NOT_FOUND'
      using errcode = '23503';
  end if;

  if source_target_user_id <> new.target_user_id then
    raise exception 'HOF_BADGE_SOURCE_TARGET_MISMATCH'
      using errcode = '23514';
  end if;

  if badge_source_record_type_code is not null
     and badge_source_record_type_code <> source_record_type_code then
    raise exception 'HOF_BADGE_SOURCE_TYPE_MISMATCH'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE'
     and old.status = 'inactive'
     and new.status = 'active' then
    raise exception 'HOF_BADGE_SOURCE_REACTIVATION_FORBIDDEN'
      using errcode = '23514';
  end if;

  if new.status = 'active' then
    if source_validity_status <> 'active' then
      raise exception 'HOF_BADGE_SOURCE_RECORD_NOT_ACTIVE'
        using errcode = '23514';
    end if;

    if not badge_is_active then
      raise exception 'HOF_BADGE_DEFINITION_NOT_ACTIVE'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

comment on function private.enforce_hall_of_fame_badge_source_invariants() is
  'Keeps badge sources target-bound and type-compatible; active sources require active records and definitions and inactive rows cannot be reactivated.';

revoke all on function private.enforce_hall_of_fame_badge_source_invariants()
  from public, anon, authenticated, service_role;

create function private.enforce_hall_of_fame_record_badge_source_invariants()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.id::text, 8603)
  );

  if new.validity_status <> 'active'
     and exists (
       select 1
       from public.hall_of_fame_badge_sources as source
       where source.record_id = new.id
         and source.status = 'active'
     ) then
    raise exception 'HOF_BADGE_SOURCE_RECORD_NOT_ACTIVE'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.hall_of_fame_badge_sources as source
    where source.record_id = new.id
      and source.status = 'active'
      and source.target_user_id <> new.target_user_id
  ) then
    raise exception 'HOF_BADGE_SOURCE_TARGET_MISMATCH'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.hall_of_fame_badge_sources as source
    join public.hall_of_fame_badge_definitions as definition
      on definition.code = source.badge_code
    where source.record_id = new.id
      and source.status = 'active'
      and definition.source_record_type_code is not null
      and definition.source_record_type_code <> new.record_type_code
  ) then
    raise exception 'HOF_BADGE_SOURCE_TYPE_MISMATCH'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function private.enforce_hall_of_fame_record_badge_source_invariants() is
  'Prevents canonical record changes from invalidating an existing active badge source.';

revoke all on function private.enforce_hall_of_fame_record_badge_source_invariants()
  from public, anon, authenticated, service_role;

create function private.enforce_hall_of_fame_badge_definition_source_invariants()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.code, 8604)
  );

  if not new.is_active
     and exists (
       select 1
       from public.hall_of_fame_badge_sources as source
       where source.badge_code = new.code
         and source.status = 'active'
     ) then
    raise exception 'HOF_BADGE_DEFINITION_NOT_ACTIVE'
      using errcode = '23514';
  end if;

  if new.source_record_type_code is not null
     and exists (
       select 1
       from public.hall_of_fame_badge_sources as source
       join public.hall_of_fame_records as record
         on record.id = source.record_id
       where source.badge_code = new.code
         and source.status = 'active'
         and record.record_type_code <> new.source_record_type_code
     ) then
    raise exception 'HOF_BADGE_SOURCE_TYPE_MISMATCH'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function private.enforce_hall_of_fame_badge_definition_source_invariants() is
  'Prevents badge definition changes from invalidating an existing active badge source.';

revoke all on function private.enforce_hall_of_fame_badge_definition_source_invariants()
  from public, anon, authenticated, service_role;
create function private.reject_hall_of_fame_mutation()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  raise exception 'HOF_MUTATION_RPC_REQUIRED' using errcode = '42501';
end;
$$;

comment on function private.reject_hall_of_fame_mutation() is
  'Deny-by-default B-1 guard; B-2 must replace it with ledger-bound mutation context validation.';

revoke all on function private.reject_hall_of_fame_mutation()
  from public, anon, authenticated, service_role;

create function private.reject_hall_of_fame_append_only_mutation()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    raise exception 'HOF_APPEND_ONLY_MUTATION_FORBIDDEN' using errcode = '42501';
  end if;

  raise exception 'HOF_MUTATION_RPC_REQUIRED' using errcode = '42501';
end;
$$;

comment on function private.reject_hall_of_fame_append_only_mutation() is
  'Deny-by-default append-only guard; UPDATE and DELETE remain permanently forbidden.';

revoke all on function private.reject_hall_of_fame_append_only_mutation()
  from public, anon, authenticated, service_role;

create trigger hall_of_fame_evidence_files_invariants_before_mutation
before insert or update on public.hall_of_fame_evidence_files
for each row execute function private.enforce_hall_of_fame_evidence_replacement_invariants();

create trigger hall_of_fame_badge_sources_invariants_before_mutation
before insert or update on public.hall_of_fame_badge_sources
for each row execute function private.enforce_hall_of_fame_badge_source_invariants();

create trigger hall_of_fame_records_badge_source_invariants_before_update
before update of target_user_id, record_type_code, validity_status
on public.hall_of_fame_records
for each row execute function private.enforce_hall_of_fame_record_badge_source_invariants();

create trigger hall_of_fame_badge_definitions_source_invariants_before_update
before update of source_record_type_code, is_active
on public.hall_of_fame_badge_definitions
for each row execute function private.enforce_hall_of_fame_badge_definition_source_invariants();
create trigger hall_of_fame_application_batches_guard_before_mutation
before insert or update or delete on public.hall_of_fame_application_batches
for each row execute function private.reject_hall_of_fame_mutation();

create trigger hall_of_fame_round_snapshots_guard_before_mutation
before insert or update or delete on public.hall_of_fame_round_snapshots
for each row execute function private.reject_hall_of_fame_mutation();

create trigger hall_of_fame_application_records_guard_before_mutation
before insert or update or delete on public.hall_of_fame_application_records
for each row execute function private.reject_hall_of_fame_mutation();

create trigger hall_of_fame_record_confirmations_guard_before_mutation
before insert or update or delete on public.hall_of_fame_record_confirmations
for each row execute function private.reject_hall_of_fame_mutation();

create trigger hall_of_fame_publication_consents_guard_before_mutation
before insert or update or delete on public.hall_of_fame_publication_consents
for each row execute function private.reject_hall_of_fame_mutation();

create trigger hall_of_fame_evidence_files_guard_before_mutation
before insert or update or delete on public.hall_of_fame_evidence_files
for each row execute function private.reject_hall_of_fame_mutation();

create trigger hall_of_fame_records_guard_before_mutation
before insert or update or delete on public.hall_of_fame_records
for each row execute function private.reject_hall_of_fame_mutation();

create trigger hall_of_fame_badge_sources_guard_before_mutation
before insert or update or delete on public.hall_of_fame_badge_sources
for each row execute function private.reject_hall_of_fame_mutation();

create trigger hall_of_fame_mutation_requests_guard_before_mutation
before insert or update or delete on private.hall_of_fame_mutation_requests
for each row execute function private.reject_hall_of_fame_mutation();

create trigger hall_of_fame_publication_consent_history_guard_before_mutation
before insert or update or delete on public.hall_of_fame_publication_consent_history
for each row execute function private.reject_hall_of_fame_append_only_mutation();

create trigger hall_of_fame_application_messages_guard_before_mutation
before insert or update or delete on public.hall_of_fame_application_messages
for each row execute function private.reject_hall_of_fame_append_only_mutation();

create trigger hall_of_fame_application_reviews_guard_before_mutation
before insert or update or delete on public.hall_of_fame_application_reviews
for each row execute function private.reject_hall_of_fame_append_only_mutation();

create trigger hall_of_fame_application_history_guard_before_mutation
before insert or update or delete on public.hall_of_fame_application_history
for each row execute function private.reject_hall_of_fame_append_only_mutation();

create trigger hall_of_fame_record_history_guard_before_mutation
before insert or update or delete on public.hall_of_fame_record_history
for each row execute function private.reject_hall_of_fame_append_only_mutation();
