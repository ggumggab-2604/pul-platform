-- PUL 8-4A: protected club join inquiry foundation.
-- Raw contact details are intentionally excluded. All reads and mutations use typed RPCs.

create function private.club_join_inquiry_interests_are_valid(p_interest_codes text[])
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select
    p_interest_codes is not null
    and pg_catalog.array_ndims(p_interest_codes) = 1
    and pg_catalog.cardinality(p_interest_codes) between 1 and 5
    and not exists (
      select 1
      from pg_catalog.unnest(p_interest_codes) as interest(code)
      where interest.code is null
         or interest.code not in (
           'regularRound',
           'friendlyMatch',
           'screenPractice',
           'beginnerEducation',
           'clubEvent'
         )
    )
    and (
      select pg_catalog.count(*)
      from pg_catalog.unnest(p_interest_codes) as interest(code)
    ) = (
      select pg_catalog.count(distinct interest.code)
      from pg_catalog.unnest(p_interest_codes) as interest(code)
    );
$$;

revoke all on function private.club_join_inquiry_interests_are_valid(text[])
  from public, anon, authenticated, service_role;

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
    'club.join_inquiries.read',
    '가입 문의 조회',
    '동호회 가입 문의 목록과 상세 내용을 조회합니다.',
    'join_inquiries',
    true,
    true
  ),
  (
    'club.join_inquiries.manage',
    '가입 문의 관리',
    '동호회 가입 문의의 상태, 담당자, 답변과 내부 메모를 관리합니다.',
    'join_inquiries',
    true,
    true
  )
on conflict (permission_code) do nothing;

do $$
begin
  if exists (
    select 1
    from public.club_permission_definitions as permission
    where permission.permission_code in (
      'club.join_inquiries.read',
      'club.join_inquiries.manage'
    )
      and (
        permission.permission_group <> 'join_inquiries'
        or not permission.is_system
        or not permission.is_active
      )
  ) or (
    select pg_catalog.count(*)
    from public.club_permission_definitions as permission
    where permission.permission_code in (
      'club.join_inquiries.read',
      'club.join_inquiries.manage'
    )
  ) <> 2 then
    raise exception '가입 문의 권한 정의가 승인된 상태와 일치하지 않습니다.';
  end if;
end;
$$;

insert into public.club_role_permissions (role_code, permission_code)
select role.role_code, permission.permission_code
from (
  values ('club_manager'), ('club_vice_admin'), ('club_admin')
) as role(role_code)
cross join (
  values ('club.join_inquiries.read'), ('club.join_inquiries.manage')
) as permission(permission_code)
on conflict (role_code, permission_code) do nothing;

do $$
begin
  if (
    select pg_catalog.count(*)
    from public.club_role_permissions as mapping
    where mapping.role_code in ('club_manager', 'club_vice_admin', 'club_admin')
      and mapping.permission_code in (
        'club.join_inquiries.read',
        'club.join_inquiries.manage'
      )
  ) <> 6 then
    raise exception '가입 문의 역할-권한 연결이 승인된 상태와 일치하지 않습니다.';
  end if;

  if exists (
    select 1
    from public.club_role_permissions as mapping
    where mapping.role_code = 'club_member'
      and mapping.permission_code in (
        'club.join_inquiries.read',
        'club.join_inquiries.manage'
      )
  ) then
    raise exception '일반 회원에게 가입 문의 운영 권한을 부여할 수 없습니다.';
  end if;
end;
$$;

create table public.club_join_inquiries (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete restrict,
  applicant_id uuid not null references public.user_accounts (id) on delete restrict,
  experience_code text not null,
  available_day_code text not null,
  interest_codes text[] not null,
  message text,
  inquiry_status text not null default 'received',
  assigned_operator_id uuid references public.user_accounts (id) on delete restrict,
  public_reply text,
  internal_note text,
  last_processed_by uuid references public.user_accounts (id) on delete restrict,
  submitted_at timestamptz not null default pg_catalog.now(),
  review_started_at timestamptz,
  replied_at timestamptz,
  closed_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint club_join_inquiries_experience_check
    check (
      experience_code in (
        'beginner',
        'underOneYear',
        'oneToThreeYears',
        'overThreeYears'
      )
    ),
  constraint club_join_inquiries_available_day_check
    check (available_day_code in ('weekday', 'weekend', 'both', 'flexible')),
  constraint club_join_inquiries_interests_check
    check (private.club_join_inquiry_interests_are_valid(interest_codes)),
  constraint club_join_inquiries_message_check
    check (
      message is null
      or (
        message = pg_catalog.btrim(message)
        and message <> ''
        and pg_catalog.char_length(message) <= 500
      )
    ),
  constraint club_join_inquiries_status_check
    check (inquiry_status in ('received', 'reviewing', 'replied', 'closed', 'withdrawn')),
  constraint club_join_inquiries_public_reply_check
    check (
      public_reply is null
      or (
        public_reply = pg_catalog.btrim(public_reply)
        and public_reply <> ''
        and pg_catalog.char_length(public_reply) <= 1000
      )
    ),
  constraint club_join_inquiries_internal_note_check
    check (
      internal_note is null
      or (
        internal_note = pg_catalog.btrim(internal_note)
        and internal_note <> ''
        and pg_catalog.char_length(internal_note) <= 1000
      )
    ),
  constraint club_join_inquiries_status_timestamps_check
    check (
      (
        inquiry_status = 'received'
        and review_started_at is null
        and replied_at is null
        and closed_at is null
        and withdrawn_at is null
        and public_reply is null
      )
      or (
        inquiry_status = 'reviewing'
        and review_started_at is not null
        and replied_at is null
        and closed_at is null
        and withdrawn_at is null
        and public_reply is null
      )
      or (
        inquiry_status = 'replied'
        and replied_at is not null
        and closed_at is null
        and withdrawn_at is null
        and public_reply is not null
      )
      or (
        inquiry_status = 'closed'
        and closed_at is not null
        and withdrawn_at is null
        and internal_note is not null
        and (
          (public_reply is null and replied_at is null)
          or (public_reply is not null and replied_at is not null)
        )
      )
      or (
        inquiry_status = 'withdrawn'
        and withdrawn_at is not null
        and replied_at is null
        and closed_at is null
        and public_reply is null
      )
    ),
  constraint club_join_inquiries_timeline_check
    check (
      submitted_at >= created_at
      and (review_started_at is null or review_started_at >= submitted_at)
      and (replied_at is null or replied_at >= submitted_at)
      and (closed_at is null or closed_at >= submitted_at)
      and (withdrawn_at is null or withdrawn_at >= submitted_at)
      and (
        review_started_at is null
        or replied_at is null
        or review_started_at <= replied_at
      )
      and (
        review_started_at is null
        or closed_at is null
        or review_started_at <= closed_at
      )
      and (
        review_started_at is null
        or withdrawn_at is null
        or review_started_at <= withdrawn_at
      )
      and (replied_at is null or closed_at is null or replied_at <= closed_at)
      and updated_at >= created_at
      and (review_started_at is null or updated_at >= review_started_at)
      and (replied_at is null or updated_at >= replied_at)
      and (closed_at is null or updated_at >= closed_at)
      and (withdrawn_at is null or updated_at >= withdrawn_at)
    )
);

comment on table public.club_join_inquiries is
  'Protected club join inquiries. Raw email addresses, phone numbers, and regional identifiers are not stored.';

comment on column public.club_join_inquiries.public_reply is
  'Applicant-visible operator reply. Never use this column for internal notes.';

comment on column public.club_join_inquiries.internal_note is
  'Operator-only note exposed solely through permission-checked management RPCs.';

create unique index club_join_inquiries_one_active_per_applicant_idx
  on public.club_join_inquiries (club_id, applicant_id)
  where inquiry_status in ('received', 'reviewing');

create index club_join_inquiries_club_status_submitted_idx
  on public.club_join_inquiries (club_id, inquiry_status, submitted_at desc, id desc);

create index club_join_inquiries_applicant_submitted_idx
  on public.club_join_inquiries (applicant_id, submitted_at desc, id desc);

create index club_join_inquiries_assignee_status_idx
  on public.club_join_inquiries (club_id, assigned_operator_id, inquiry_status)
  where assigned_operator_id is not null;

create table public.club_join_inquiry_status_history (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  inquiry_id uuid not null
    references public.club_join_inquiries (id) on delete restrict,
  club_id uuid not null references public.clubs (id) on delete restrict,
  actor_id uuid not null references public.user_accounts (id) on delete restrict,
  request_id uuid not null,
  event_code text not null,
  previous_status text,
  new_status text not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint club_join_inquiry_history_actor_request_unique
    unique (actor_id, request_id),
  constraint club_join_inquiry_history_ledger_fkey
    foreign key (actor_id, request_id)
    references private.club_mutation_requests (actor_id, request_id)
    on delete restrict,
  constraint club_join_inquiry_history_event_check
    check (
      event_code in (
        'inquiry.submitted',
        'inquiry.review_started',
        'inquiry.replied',
        'inquiry.closed',
        'inquiry.withdrawn',
        'inquiry.assignee_changed',
        'inquiry.internal_note_changed'
      )
    ),
  constraint club_join_inquiry_history_previous_status_check
    check (
      previous_status is null
      or previous_status in ('received', 'reviewing', 'replied', 'closed', 'withdrawn')
    ),
  constraint club_join_inquiry_history_new_status_check
    check (new_status in ('received', 'reviewing', 'replied', 'closed', 'withdrawn')),
  constraint club_join_inquiry_history_initial_event_check
    check (
      (event_code = 'inquiry.submitted' and previous_status is null and new_status = 'received')
      or (event_code <> 'inquiry.submitted' and previous_status is not null)
    )
);

comment on table public.club_join_inquiry_status_history is
  'Append-only inquiry event history. Raw applicant messages, public replies, and internal notes are excluded.';

create index club_join_inquiry_history_inquiry_created_idx
  on public.club_join_inquiry_status_history (inquiry_id, created_at, id);

create index club_join_inquiry_history_club_created_idx
  on public.club_join_inquiry_status_history (club_id, created_at desc, id desc);

alter table public.club_join_inquiries enable row level security;
alter table public.club_join_inquiries force row level security;
alter table public.club_join_inquiry_status_history enable row level security;
alter table public.club_join_inquiry_status_history force row level security;

revoke all on table public.club_join_inquiries
  from public, anon, authenticated, service_role;
revoke all on table public.club_join_inquiry_status_history
  from public, anon, authenticated, service_role;

create trigger club_join_inquiries_set_updated_at
before update on public.club_join_inquiries
for each row execute function public.set_user_foundation_updated_at();

create function private.set_club_join_inquiry_mutation_context(
  p_request_id text,
  p_action_code text,
  p_actor_id text,
  p_club_id text,
  p_inquiry_id text,
  p_applicant_id text,
  p_target_status text,
  p_assignee_id text
)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  perform pg_catalog.set_config('pul.club_join_inquiry_request_id', coalesce(p_request_id, ''), true);
  perform pg_catalog.set_config('pul.club_join_inquiry_action_code', coalesce(p_action_code, ''), true);
  perform pg_catalog.set_config('pul.club_join_inquiry_actor_id', coalesce(p_actor_id, ''), true);
  perform pg_catalog.set_config('pul.club_join_inquiry_club_id', coalesce(p_club_id, ''), true);
  perform pg_catalog.set_config('pul.club_join_inquiry_id', coalesce(p_inquiry_id, ''), true);
  perform pg_catalog.set_config('pul.club_join_inquiry_applicant_id', coalesce(p_applicant_id, ''), true);
  perform pg_catalog.set_config('pul.club_join_inquiry_target_status', coalesce(p_target_status, ''), true);
  perform pg_catalog.set_config('pul.club_join_inquiry_assignee_id', coalesce(p_assignee_id, ''), true);
end;
$$;

revoke all on function private.set_club_join_inquiry_mutation_context(
  text, text, text, text, text, text, text, text
) from public, anon, authenticated, service_role;

create function private.enforce_guarded_club_join_inquiry_mutation()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_request_id uuid;
  v_action_code text;
  v_actor_id uuid;
  v_club_id uuid;
  v_inquiry_id uuid;
  v_applicant_id uuid;
  v_target_status text;
  v_assignee_id uuid;
  v_authorized boolean := false;
begin
  if tg_op = 'DELETE' then
    raise exception '가입 문의 행은 직접 삭제할 수 없습니다.' using errcode = '42501';
  end if;

  begin
    v_request_id := nullif(
      pg_catalog.current_setting('pul.club_join_inquiry_request_id', true),
      ''
    )::uuid;
    v_actor_id := nullif(
      pg_catalog.current_setting('pul.club_join_inquiry_actor_id', true),
      ''
    )::uuid;
    v_club_id := nullif(
      pg_catalog.current_setting('pul.club_join_inquiry_club_id', true),
      ''
    )::uuid;
    v_inquiry_id := nullif(
      pg_catalog.current_setting('pul.club_join_inquiry_id', true),
      ''
    )::uuid;
    v_applicant_id := nullif(
      pg_catalog.current_setting('pul.club_join_inquiry_applicant_id', true),
      ''
    )::uuid;
    v_assignee_id := nullif(
      pg_catalog.current_setting('pul.club_join_inquiry_assignee_id', true),
      ''
    )::uuid;
  exception
    when invalid_text_representation then
      raise exception '가입 문의 mutation 문맥이 올바르지 않습니다.' using errcode = '42501';
  end;

  v_action_code := nullif(
    pg_catalog.current_setting('pul.club_join_inquiry_action_code', true),
    ''
  );
  v_target_status := nullif(
    pg_catalog.current_setting('pul.club_join_inquiry_target_status', true),
    ''
  );

  if v_request_id is null
     or v_action_code is null
     or v_actor_id is null
     or v_club_id is null
     or v_inquiry_id is null
     or v_applicant_id is null
     or v_target_status is null then
    raise exception '가입 문의는 승인된 RPC를 통해서만 변경할 수 있습니다.' using errcode = '42501';
  end if;

  select exists (
    select 1
    from private.club_mutation_requests as ledger
    where ledger.actor_id = v_actor_id
      and ledger.request_id = v_request_id
      and ledger.action_code = v_action_code
      and ledger.club_id = v_club_id
      and ledger.target_user_id = v_applicant_id
      and ledger.role_code is null
      and ledger.outcome is null
      and ledger.result_data is null
      and ledger.completed_at is null
  ) into v_authorized;

  if not v_authorized then
    raise exception '승인된 미완료 가입 문의 요청을 확인할 수 없습니다.' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if v_action_code <> 'inquiry.submit'
       or new.id <> v_inquiry_id
       or new.club_id <> v_club_id
       or new.applicant_id <> v_applicant_id
       or new.inquiry_status <> 'received'
       or v_target_status <> 'received'
       or new.assigned_operator_id is not null
       or new.public_reply is not null
       or new.internal_note is not null
       or new.last_processed_by is not null
       or v_assignee_id is not null then
      raise exception '가입 문의 생성 문맥이 요청 내용과 일치하지 않습니다.' using errcode = '42501';
    end if;

    return new;
  end if;

  if old.id <> v_inquiry_id
     or new.id <> old.id
     or old.club_id <> v_club_id
     or new.club_id <> old.club_id
     or old.applicant_id <> v_applicant_id
     or new.applicant_id <> old.applicant_id
     or new.experience_code is distinct from old.experience_code
     or new.available_day_code is distinct from old.available_day_code
     or new.interest_codes is distinct from old.interest_codes
     or new.message is distinct from old.message
     or new.submitted_at is distinct from old.submitted_at
     or new.created_at is distinct from old.created_at
     or new.last_processed_by is distinct from v_actor_id
     or new.inquiry_status <> v_target_status
     or v_action_code not in (
       'inquiry.withdraw',
       'inquiry.review',
       'inquiry.reply',
       'inquiry.close',
       'inquiry.assign',
       'inquiry.unassign',
       'inquiry.note'
     ) then
    raise exception '가입 문의 변경 문맥이 요청 내용과 일치하지 않습니다.' using errcode = '42501';
  end if;

  if v_action_code = 'inquiry.withdraw' then
    if old.inquiry_status not in ('received', 'reviewing')
       or new.inquiry_status <> 'withdrawn'
       or new.assigned_operator_id is distinct from old.assigned_operator_id
       or new.public_reply is distinct from old.public_reply
       or new.internal_note is distinct from old.internal_note
       or new.review_started_at is distinct from old.review_started_at
       or new.replied_at is distinct from old.replied_at
       or new.closed_at is distinct from old.closed_at
       or new.withdrawn_at is null then
      raise exception '가입 문의 철회 변경 범위가 올바르지 않습니다.' using errcode = '42501';
    end if;
  elsif v_action_code = 'inquiry.review' then
    if old.inquiry_status <> 'received'
       or new.inquiry_status <> 'reviewing'
       or new.assigned_operator_id is distinct from old.assigned_operator_id
       or new.public_reply is distinct from old.public_reply
       or new.internal_note is distinct from old.internal_note
       or new.review_started_at is null
       or new.replied_at is distinct from old.replied_at
       or new.closed_at is distinct from old.closed_at
       or new.withdrawn_at is distinct from old.withdrawn_at then
      raise exception '가입 문의 검토 시작 변경 범위가 올바르지 않습니다.' using errcode = '42501';
    end if;
  elsif v_action_code = 'inquiry.reply' then
    if old.inquiry_status not in ('received', 'reviewing')
       or new.inquiry_status <> 'replied'
       or new.assigned_operator_id is distinct from old.assigned_operator_id
       or new.public_reply is null
       or new.internal_note is distinct from old.internal_note
       or new.review_started_at is distinct from old.review_started_at
       or new.replied_at is null
       or new.closed_at is distinct from old.closed_at
       or new.withdrawn_at is distinct from old.withdrawn_at then
      raise exception '가입 문의 답변 변경 범위가 올바르지 않습니다.' using errcode = '42501';
    end if;
  elsif v_action_code = 'inquiry.close' then
    if old.inquiry_status not in ('received', 'reviewing')
       or new.inquiry_status <> 'closed'
       or new.assigned_operator_id is distinct from old.assigned_operator_id
       or new.internal_note is null
       or new.review_started_at is distinct from old.review_started_at
       or ((new.public_reply is null) <> (new.replied_at is null))
       or new.closed_at is null
       or new.withdrawn_at is distinct from old.withdrawn_at then
      raise exception '가입 문의 종료 변경 범위가 올바르지 않습니다.' using errcode = '42501';
    end if;
  elsif v_action_code in ('inquiry.assign', 'inquiry.unassign') then
    if old.inquiry_status not in ('received', 'reviewing')
       or new.inquiry_status <> old.inquiry_status
       or (
         v_action_code = 'inquiry.assign'
         and (
           v_assignee_id is null
           or new.assigned_operator_id is distinct from v_assignee_id
         )
       )
       or (
         v_action_code = 'inquiry.unassign'
         and (
           v_assignee_id is not null
           or new.assigned_operator_id is not null
         )
       )
       or new.public_reply is distinct from old.public_reply
       or new.internal_note is distinct from old.internal_note
       or new.review_started_at is distinct from old.review_started_at
       or new.replied_at is distinct from old.replied_at
       or new.closed_at is distinct from old.closed_at
       or new.withdrawn_at is distinct from old.withdrawn_at then
      raise exception '가입 문의 담당자 변경 범위가 올바르지 않습니다.' using errcode = '42501';
    end if;
  elsif v_action_code = 'inquiry.note' then
    if new.inquiry_status <> old.inquiry_status
       or new.assigned_operator_id is distinct from old.assigned_operator_id
       or new.public_reply is distinct from old.public_reply
       or new.review_started_at is distinct from old.review_started_at
       or new.replied_at is distinct from old.replied_at
       or new.closed_at is distinct from old.closed_at
       or new.withdrawn_at is distinct from old.withdrawn_at then
      raise exception '가입 문의 내부 메모 변경 범위가 올바르지 않습니다.' using errcode = '42501';
    end if;
  end if;

  if v_action_code <> 'inquiry.assign' and v_assignee_id is not null then
    raise exception '가입 문의 담당자 문맥이 action과 일치하지 않습니다.' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_guarded_club_join_inquiry_mutation()
  from public, anon, authenticated, service_role;

create function private.enforce_guarded_club_join_inquiry_history_mutation()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_request_id uuid;
  v_action_code text;
  v_actor_id uuid;
  v_club_id uuid;
  v_inquiry_id uuid;
  v_applicant_id uuid;
  v_target_status text;
  v_authorized boolean := false;
  v_current_status text;
  v_current_applicant_id uuid;
begin
  if tg_op <> 'INSERT' then
    raise exception '가입 문의 이력은 직접 변경하거나 삭제할 수 없습니다.' using errcode = '42501';
  end if;

  begin
    v_request_id := nullif(pg_catalog.current_setting('pul.club_join_inquiry_request_id', true), '')::uuid;
    v_actor_id := nullif(pg_catalog.current_setting('pul.club_join_inquiry_actor_id', true), '')::uuid;
    v_club_id := nullif(pg_catalog.current_setting('pul.club_join_inquiry_club_id', true), '')::uuid;
    v_inquiry_id := nullif(pg_catalog.current_setting('pul.club_join_inquiry_id', true), '')::uuid;
    v_applicant_id := nullif(pg_catalog.current_setting('pul.club_join_inquiry_applicant_id', true), '')::uuid;
  exception
    when invalid_text_representation then
      raise exception '가입 문의 이력 mutation 문맥이 올바르지 않습니다.' using errcode = '42501';
  end;

  v_action_code := nullif(pg_catalog.current_setting('pul.club_join_inquiry_action_code', true), '');
  v_target_status := nullif(pg_catalog.current_setting('pul.club_join_inquiry_target_status', true), '');

  if v_request_id is null
     or v_action_code is null
     or v_actor_id is null
     or v_club_id is null
     or v_inquiry_id is null
     or v_applicant_id is null
     or v_target_status is null then
    raise exception '가입 문의 이력은 승인된 RPC를 통해서만 생성할 수 있습니다.' using errcode = '42501';
  end if;

  select exists (
    select 1
    from private.club_mutation_requests as ledger
    where ledger.actor_id = v_actor_id
      and ledger.request_id = v_request_id
      and ledger.action_code = v_action_code
      and ledger.club_id = v_club_id
      and ledger.target_user_id = v_applicant_id
      and ledger.role_code is null
      and ledger.outcome is null
      and ledger.result_data is null
      and ledger.completed_at is null
  ) into v_authorized;

  if not v_authorized then
    raise exception '승인된 미완료 가입 문의 이력 요청을 확인할 수 없습니다.' using errcode = '42501';
  end if;

  select inquiry.inquiry_status, inquiry.applicant_id
    into v_current_status, v_current_applicant_id
  from public.club_join_inquiries as inquiry
  where inquiry.id = v_inquiry_id
    and inquiry.club_id = v_club_id;

  if not found
     or v_current_status <> v_target_status
     or v_current_applicant_id <> v_applicant_id
     or new.inquiry_id <> v_inquiry_id
     or new.club_id <> v_club_id
     or new.actor_id <> v_actor_id
     or new.request_id <> v_request_id
     or new.new_status <> v_target_status then
    raise exception '가입 문의 이력 행이 요청 문맥과 일치하지 않습니다.' using errcode = '42501';
  end if;

  if not (
    (v_action_code = 'inquiry.submit'
      and new.event_code = 'inquiry.submitted'
      and new.previous_status is null
      and new.new_status = 'received')
    or (v_action_code = 'inquiry.withdraw'
      and new.event_code = 'inquiry.withdrawn')
    or (v_action_code = 'inquiry.review'
      and new.event_code = 'inquiry.review_started')
    or (v_action_code = 'inquiry.reply'
      and new.event_code = 'inquiry.replied')
    or (v_action_code = 'inquiry.close'
      and new.event_code = 'inquiry.closed')
    or (v_action_code in ('inquiry.assign', 'inquiry.unassign')
      and new.event_code = 'inquiry.assignee_changed'
      and new.previous_status = new.new_status)
    or (v_action_code = 'inquiry.note'
      and new.event_code = 'inquiry.internal_note_changed'
      and new.previous_status = new.new_status)
  ) then
    raise exception '가입 문의 이력 event가 요청 action과 일치하지 않습니다.' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_guarded_club_join_inquiry_history_mutation()
  from public, anon, authenticated, service_role;

create trigger club_join_inquiries_guard_before_insert
before insert on public.club_join_inquiries
for each row execute function private.enforce_guarded_club_join_inquiry_mutation();

create trigger club_join_inquiries_guard_before_update
before update on public.club_join_inquiries
for each row execute function private.enforce_guarded_club_join_inquiry_mutation();

create trigger club_join_inquiries_guard_before_delete
before delete on public.club_join_inquiries
for each row execute function private.enforce_guarded_club_join_inquiry_mutation();

create trigger club_join_inquiry_history_guard_before_insert
before insert on public.club_join_inquiry_status_history
for each row execute function private.enforce_guarded_club_join_inquiry_history_mutation();

create trigger club_join_inquiry_history_guard_before_update
before update on public.club_join_inquiry_status_history
for each row execute function private.enforce_guarded_club_join_inquiry_history_mutation();

create trigger club_join_inquiry_history_guard_before_delete
before delete on public.club_join_inquiry_status_history
for each row execute function private.enforce_guarded_club_join_inquiry_history_mutation();

create function private.execute_club_join_inquiry_submit(
  p_club_id uuid,
  p_experience_code text,
  p_available_day_code text,
  p_interest_codes text[],
  p_message text,
  p_request_id uuid
)
returns table (
  request_id uuid,
  action_code text,
  inquiry_id uuid,
  club_id uuid,
  applicant_id uuid,
  inquiry_status text,
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
  v_interest_codes text[];
  v_message text;
  v_fingerprint text;
  v_inquiry_id uuid := pg_catalog.gen_random_uuid();
  v_existing_inquiry_id uuid;
  v_ledger_action text;
  v_ledger_club_id uuid;
  v_ledger_target_user_id uuid;
  v_ledger_fingerprint text;
  v_ledger_outcome text;
  v_ledger_result jsonb;
  v_ledger_completed_at timestamptz;
  v_ledger_found boolean := false;
  v_result jsonb;
  v_completed_count integer := 0;
  v_previous_request_id text := pg_catalog.current_setting('pul.club_join_inquiry_request_id', true);
  v_previous_action text := pg_catalog.current_setting('pul.club_join_inquiry_action_code', true);
  v_previous_actor_id text := pg_catalog.current_setting('pul.club_join_inquiry_actor_id', true);
  v_previous_club_id text := pg_catalog.current_setting('pul.club_join_inquiry_club_id', true);
  v_previous_inquiry_id text := pg_catalog.current_setting('pul.club_join_inquiry_id', true);
  v_previous_applicant_id text := pg_catalog.current_setting('pul.club_join_inquiry_applicant_id', true);
  v_previous_target_status text := pg_catalog.current_setting('pul.club_join_inquiry_target_status', true);
  v_previous_assignee_context text := pg_catalog.current_setting('pul.club_join_inquiry_assignee_id', true);
begin
  if v_actor_id is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;

  if p_club_id is null then
    raise exception '동호회 식별자가 필요합니다.';
  end if;

  if p_request_id is null then
    raise exception '요청 식별자가 필요합니다.';
  end if;

  if p_experience_code is null
     or p_experience_code not in (
       'beginner',
       'underOneYear',
       'oneToThreeYears',
       'overThreeYears'
     ) then
    raise exception '파크골프 경력 선택값이 올바르지 않습니다.';
  end if;

  if p_available_day_code is null
     or p_available_day_code not in ('weekday', 'weekend', 'both', 'flexible') then
    raise exception '활동 가능 요일 선택값이 올바르지 않습니다.';
  end if;

  if not private.club_join_inquiry_interests_are_valid(p_interest_codes) then
    raise exception '희망 활동은 허용된 값을 중복 없이 하나 이상 선택해야 합니다.';
  end if;

  select pg_catalog.array_agg(interest.code order by interest.code)
    into v_interest_codes
  from pg_catalog.unnest(p_interest_codes) as interest(code);

  v_message := nullif(pg_catalog.btrim(p_message), '');

  if v_message is not null and pg_catalog.char_length(v_message) > 500 then
    raise exception '운영자에게 전할 내용은 500자 이하여야 합니다.';
  end if;

  v_fingerprint := pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'action_code', 'inquiry.submit',
      'club_id', p_club_id,
      'applicant_id', v_actor_id,
      'experience_code', p_experience_code,
      'available_day_code', p_available_day_code,
      'interest_codes', pg_catalog.to_jsonb(v_interest_codes),
      'message', v_message
    )::text
  );

  select club.club_status
    into v_club_status
  from public.clubs as club
  where club.id = p_club_id
  for update;

  if not found then
    raise exception '동호회를 찾을 수 없습니다.';
  end if;

  select account.account_status
    into v_actor_status
  from public.user_accounts as account
  where account.id = v_actor_id
  for share;

  if not found or v_actor_status <> 'active' then
    raise exception '활성 계정만 가입 문의를 작성할 수 있습니다.' using errcode = '42501';
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
    v_ledger_target_user_id,
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
    if v_ledger_action is distinct from 'inquiry.submit'
       or v_ledger_club_id is distinct from p_club_id
       or v_ledger_target_user_id is distinct from v_actor_id
       or v_ledger_fingerprint is distinct from v_fingerprint then
      raise exception '같은 요청 식별자를 다른 입력에 재사용할 수 없습니다.';
    end if;

    if v_ledger_completed_at is not null then
      return query
      select
        p_request_id,
        v_ledger_action,
        (v_ledger_result ->> 'inquiry_id')::uuid,
        v_ledger_club_id,
        v_ledger_target_user_id,
        v_ledger_result ->> 'inquiry_status',
        (v_ledger_result ->> 'changed')::boolean,
        true,
        v_ledger_outcome;
      return;
    end if;
  end if;

  if v_club_status <> 'active' then
    raise exception '활성 동호회에만 가입 문의를 작성할 수 있습니다.';
  end if;

  select inquiry.id
    into v_existing_inquiry_id
  from public.club_join_inquiries as inquiry
  where inquiry.club_id = p_club_id
    and inquiry.applicant_id = v_actor_id
    and inquiry.inquiry_status in ('received', 'reviewing')
  for update;

  if found then
    raise exception '이미 처리 중인 가입 문의가 있습니다.';
  end if;

  if not v_ledger_found then
    insert into private.club_mutation_requests (
      actor_id,
      request_id,
      action_code,
      club_id,
      target_user_id,
      input_fingerprint
    )
    values (
      v_actor_id,
      p_request_id,
      'inquiry.submit',
      p_club_id,
      v_actor_id,
      v_fingerprint
    )
    on conflict on constraint club_mutation_requests_actor_request_unique
    do nothing;

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
      v_ledger_target_user_id,
      v_ledger_fingerprint,
      v_ledger_outcome,
      v_ledger_result,
      v_ledger_completed_at
    from private.club_mutation_requests as ledger
    where ledger.actor_id = v_actor_id
      and ledger.request_id = p_request_id
    for update;

    if not found then
      raise exception '가입 문의 요청 처리 기록을 확보할 수 없습니다.';
    end if;

    if v_ledger_action is distinct from 'inquiry.submit'
       or v_ledger_club_id is distinct from p_club_id
       or v_ledger_target_user_id is distinct from v_actor_id
       or v_ledger_fingerprint is distinct from v_fingerprint then
      raise exception '같은 요청 식별자를 다른 입력에 재사용할 수 없습니다.';
    end if;

    if v_ledger_completed_at is not null then
      return query
      select
        p_request_id,
        v_ledger_action,
        (v_ledger_result ->> 'inquiry_id')::uuid,
        v_ledger_club_id,
        v_ledger_target_user_id,
        v_ledger_result ->> 'inquiry_status',
        (v_ledger_result ->> 'changed')::boolean,
        true,
        v_ledger_outcome;
      return;
    end if;
  end if;

  perform private.set_club_join_inquiry_mutation_context(
    p_request_id::text,
    'inquiry.submit',
    v_actor_id::text,
    p_club_id::text,
    v_inquiry_id::text,
    v_actor_id::text,
    'received',
    null
  );

  begin
    insert into public.club_join_inquiries (
      id,
      club_id,
      applicant_id,
      experience_code,
      available_day_code,
      interest_codes,
      message
    )
    values (
      v_inquiry_id,
      p_club_id,
      v_actor_id,
      p_experience_code,
      p_available_day_code,
      v_interest_codes,
      v_message
    );
  exception
    when unique_violation then
      if exists (
        select 1
        from public.club_join_inquiries as inquiry
        where inquiry.club_id = p_club_id
          and inquiry.applicant_id = v_actor_id
          and inquiry.inquiry_status in ('received', 'reviewing')
      ) then
        raise exception '이미 처리 중인 가입 문의가 있습니다.';
      end if;
      raise;
  end;

  insert into public.club_join_inquiry_status_history (
    inquiry_id,
    club_id,
    actor_id,
    request_id,
    event_code,
    previous_status,
    new_status
  )
  values (
    v_inquiry_id,
    p_club_id,
    v_actor_id,
    p_request_id,
    'inquiry.submitted',
    null,
    'received'
  );

  insert into public.audit_logs (
    actor_id,
    actor_type,
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
  )
  values (
    v_actor_id,
    'user',
    'inquiry.submit',
    'club_join_inquiry',
    v_inquiry_id::text,
    p_club_id::text,
    null,
    pg_catalog.jsonb_build_object('inquiry_status', 'received'),
    null,
    pg_catalog.jsonb_build_object(
      'event_code', 'inquiry.submitted',
      'interest_count', pg_catalog.cardinality(v_interest_codes),
      'message_present', v_message is not null
    ),
    p_request_id,
    'success'
  );

  v_result := pg_catalog.jsonb_build_object(
    'action_code', 'inquiry.submit',
    'inquiry_id', v_inquiry_id,
    'club_id', p_club_id,
    'applicant_id', v_actor_id,
    'inquiry_status', 'received',
    'changed', true,
    'outcome', 'success'
  );

  update private.club_mutation_requests as ledger
  set
    outcome = 'success',
    result_data = v_result,
    completed_at = pg_catalog.now()
  where ledger.actor_id = v_actor_id
    and ledger.request_id = p_request_id
    and ledger.action_code = 'inquiry.submit'
    and ledger.input_fingerprint = v_fingerprint
    and ledger.completed_at is null;

  get diagnostics v_completed_count = row_count;

  if v_completed_count <> 1 then
    raise exception '가입 문의 요청 완료 상태를 저장할 수 없습니다.';
  end if;

  perform private.set_club_join_inquiry_mutation_context(
    v_previous_request_id,
    v_previous_action,
    v_previous_actor_id,
    v_previous_club_id,
    v_previous_inquiry_id,
    v_previous_applicant_id,
    v_previous_target_status,
    v_previous_assignee_context
  );

  return query
  select
    p_request_id,
    'inquiry.submit'::text,
    v_inquiry_id,
    p_club_id,
    v_actor_id,
    'received'::text,
    true,
    false,
    'success'::text;
exception
  when others then
    perform private.set_club_join_inquiry_mutation_context(
      v_previous_request_id,
      v_previous_action,
      v_previous_actor_id,
      v_previous_club_id,
      v_previous_inquiry_id,
      v_previous_applicant_id,
      v_previous_target_status,
      v_previous_assignee_context
    );
    raise;
end;
$$;

revoke all on function private.execute_club_join_inquiry_submit(
  uuid, text, text, text[], text, uuid
) from public, anon, authenticated, service_role;

create function private.execute_club_join_inquiry_withdraw(
  p_inquiry_id uuid,
  p_request_id uuid
)
returns table (
  request_id uuid,
  action_code text,
  inquiry_id uuid,
  club_id uuid,
  applicant_id uuid,
  previous_status text,
  current_status text,
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
  v_fingerprint text;
  v_ledger_action text;
  v_ledger_club_id uuid;
  v_ledger_target_user_id uuid;
  v_ledger_fingerprint text;
  v_ledger_outcome text;
  v_ledger_result jsonb;
  v_ledger_completed_at timestamptz;
  v_ledger_found boolean := false;
  v_result jsonb;
  v_completed_count integer := 0;
  v_previous_request_id text := pg_catalog.current_setting('pul.club_join_inquiry_request_id', true);
  v_previous_action text := pg_catalog.current_setting('pul.club_join_inquiry_action_code', true);
  v_previous_actor_id text := pg_catalog.current_setting('pul.club_join_inquiry_actor_id', true);
  v_previous_club_id text := pg_catalog.current_setting('pul.club_join_inquiry_club_id', true);
  v_previous_inquiry_id text := pg_catalog.current_setting('pul.club_join_inquiry_id', true);
  v_previous_applicant_id text := pg_catalog.current_setting('pul.club_join_inquiry_applicant_id', true);
  v_previous_target_status text := pg_catalog.current_setting('pul.club_join_inquiry_target_status', true);
  v_previous_assignee_context text := pg_catalog.current_setting('pul.club_join_inquiry_assignee_id', true);
begin
  if v_actor_id is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;

  if p_inquiry_id is null then
    raise exception '가입 문의 식별자가 필요합니다.';
  end if;

  if p_request_id is null then
    raise exception '요청 식별자가 필요합니다.';
  end if;

  select inquiry.club_id
    into v_club_id
  from public.club_join_inquiries as inquiry
  where inquiry.id = p_inquiry_id;

  if not found then
    raise exception '가입 문의가 없거나 접근 권한이 없습니다.' using errcode = '42501';
  end if;

  perform 1
  from public.clubs as club
  where club.id = v_club_id
  for update;

  if not found then
    raise exception '가입 문의가 없거나 접근 권한이 없습니다.' using errcode = '42501';
  end if;

  select account.account_status
    into v_actor_status
  from public.user_accounts as account
  where account.id = v_actor_id
  for share;

  if not found or v_actor_status <> 'active' then
    raise exception '활성 계정만 가입 문의를 철회할 수 있습니다.' using errcode = '42501';
  end if;

  select inquiry.applicant_id, inquiry.inquiry_status
    into v_applicant_id, v_previous_status
  from public.club_join_inquiries as inquiry
  where inquiry.id = p_inquiry_id
    and inquiry.club_id = v_club_id
  for update;

  if not found or v_applicant_id <> v_actor_id then
    raise exception '가입 문의가 없거나 접근 권한이 없습니다.' using errcode = '42501';
  end if;

  v_fingerprint := pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'action_code', 'inquiry.withdraw',
      'inquiry_id', p_inquiry_id,
      'club_id', v_club_id,
      'applicant_id', v_actor_id
    )::text
  );

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
    v_ledger_target_user_id,
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
    if v_ledger_action is distinct from 'inquiry.withdraw'
       or v_ledger_club_id is distinct from v_club_id
       or v_ledger_target_user_id is distinct from v_actor_id
       or v_ledger_fingerprint is distinct from v_fingerprint then
      raise exception '같은 요청 식별자를 다른 입력에 재사용할 수 없습니다.';
    end if;

    if v_ledger_completed_at is not null then
      return query
      select
        p_request_id,
        v_ledger_action,
        (v_ledger_result ->> 'inquiry_id')::uuid,
        v_ledger_club_id,
        v_ledger_target_user_id,
        v_ledger_result ->> 'previous_status',
        v_ledger_result ->> 'current_status',
        (v_ledger_result ->> 'changed')::boolean,
        true,
        v_ledger_outcome;
      return;
    end if;
  end if;

  if v_previous_status not in ('received', 'reviewing') then
    raise exception '처리 중인 가입 문의만 철회할 수 있습니다.';
  end if;

  if not v_ledger_found then
    insert into private.club_mutation_requests (
      actor_id,
      request_id,
      action_code,
      club_id,
      target_user_id,
      input_fingerprint
    )
    values (
      v_actor_id,
      p_request_id,
      'inquiry.withdraw',
      v_club_id,
      v_actor_id,
      v_fingerprint
    )
    on conflict on constraint club_mutation_requests_actor_request_unique
    do nothing;

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
      v_ledger_target_user_id,
      v_ledger_fingerprint,
      v_ledger_outcome,
      v_ledger_result,
      v_ledger_completed_at
    from private.club_mutation_requests as ledger
    where ledger.actor_id = v_actor_id
      and ledger.request_id = p_request_id
    for update;

    if not found then
      raise exception '가입 문의 철회 요청 기록을 확보할 수 없습니다.';
    end if;

    if v_ledger_action is distinct from 'inquiry.withdraw'
       or v_ledger_club_id is distinct from v_club_id
       or v_ledger_target_user_id is distinct from v_actor_id
       or v_ledger_fingerprint is distinct from v_fingerprint then
      raise exception '같은 요청 식별자를 다른 입력에 재사용할 수 없습니다.';
    end if;

    if v_ledger_completed_at is not null then
      return query
      select
        p_request_id,
        v_ledger_action,
        (v_ledger_result ->> 'inquiry_id')::uuid,
        v_ledger_club_id,
        v_ledger_target_user_id,
        v_ledger_result ->> 'previous_status',
        v_ledger_result ->> 'current_status',
        (v_ledger_result ->> 'changed')::boolean,
        true,
        v_ledger_outcome;
      return;
    end if;
  end if;

  perform private.set_club_join_inquiry_mutation_context(
    p_request_id::text,
    'inquiry.withdraw',
    v_actor_id::text,
    v_club_id::text,
    p_inquiry_id::text,
    v_actor_id::text,
    'withdrawn',
    null
  );

  update public.club_join_inquiries as inquiry
  set
    inquiry_status = 'withdrawn',
    withdrawn_at = pg_catalog.now(),
    last_processed_by = v_actor_id
  where inquiry.id = p_inquiry_id
    and inquiry.club_id = v_club_id
    and inquiry.applicant_id = v_actor_id
    and inquiry.inquiry_status = v_previous_status;

  if not found then
    raise exception '가입 문의 철회 상태가 동시에 변경되었습니다.';
  end if;

  insert into public.club_join_inquiry_status_history (
    inquiry_id,
    club_id,
    actor_id,
    request_id,
    event_code,
    previous_status,
    new_status
  )
  values (
    p_inquiry_id,
    v_club_id,
    v_actor_id,
    p_request_id,
    'inquiry.withdrawn',
    v_previous_status,
    'withdrawn'
  );

  insert into public.audit_logs (
    actor_id,
    actor_type,
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
  )
  values (
    v_actor_id,
    'user',
    'inquiry.withdraw',
    'club_join_inquiry',
    p_inquiry_id::text,
    v_club_id::text,
    pg_catalog.jsonb_build_object('inquiry_status', v_previous_status),
    pg_catalog.jsonb_build_object('inquiry_status', 'withdrawn'),
    null,
    pg_catalog.jsonb_build_object('event_code', 'inquiry.withdrawn'),
    p_request_id,
    'success'
  );

  v_result := pg_catalog.jsonb_build_object(
    'action_code', 'inquiry.withdraw',
    'inquiry_id', p_inquiry_id,
    'club_id', v_club_id,
    'applicant_id', v_actor_id,
    'previous_status', v_previous_status,
    'current_status', 'withdrawn',
    'changed', true,
    'outcome', 'success'
  );

  update private.club_mutation_requests as ledger
  set
    outcome = 'success',
    result_data = v_result,
    completed_at = pg_catalog.now()
  where ledger.actor_id = v_actor_id
    and ledger.request_id = p_request_id
    and ledger.action_code = 'inquiry.withdraw'
    and ledger.input_fingerprint = v_fingerprint
    and ledger.completed_at is null;

  get diagnostics v_completed_count = row_count;

  if v_completed_count <> 1 then
    raise exception '가입 문의 철회 요청 완료 상태를 저장할 수 없습니다.';
  end if;

  perform private.set_club_join_inquiry_mutation_context(
    v_previous_request_id,
    v_previous_action,
    v_previous_actor_id,
    v_previous_club_id,
    v_previous_inquiry_id,
    v_previous_applicant_id,
    v_previous_target_status,
    v_previous_assignee_context
  );

  return query
  select
    p_request_id,
    'inquiry.withdraw'::text,
    p_inquiry_id,
    v_club_id,
    v_actor_id,
    v_previous_status,
    'withdrawn'::text,
    true,
    false,
    'success'::text;
exception
  when others then
    perform private.set_club_join_inquiry_mutation_context(
      v_previous_request_id,
      v_previous_action,
      v_previous_actor_id,
      v_previous_club_id,
      v_previous_inquiry_id,
      v_previous_applicant_id,
      v_previous_target_status,
      v_previous_assignee_context
    );
    raise;
end;
$$;

revoke all on function private.execute_club_join_inquiry_withdraw(uuid, uuid)
  from public, anon, authenticated, service_role;

create function private.execute_club_join_inquiry_management(
  p_inquiry_id uuid,
  p_operation text,
  p_request_id uuid,
  p_assigned_operator_id uuid,
  p_public_reply text,
  p_internal_note text
)
returns table (
  request_id uuid,
  action_code text,
  inquiry_id uuid,
  club_id uuid,
  applicant_id uuid,
  previous_status text,
  current_status text,
  assigned_operator_id uuid,
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
  v_club_status text;
  v_applicant_id uuid;
  v_operation text := nullif(pg_catalog.btrim(p_operation), '');
  v_action_code text;
  v_event_code text;
  v_previous_status text;
  v_current_status text;
  v_previous_assignee_id uuid;
  v_current_assignee_id uuid;
  v_previous_public_reply text;
  v_previous_internal_note text;
  v_public_reply text := nullif(pg_catalog.btrim(p_public_reply), '');
  v_internal_note text := nullif(pg_catalog.btrim(p_internal_note), '');
  v_assignee_status text;
  v_assignee_membership_status text;
  v_fingerprint text;
  v_changed boolean := false;
  v_outcome text;
  v_ledger_action text;
  v_ledger_club_id uuid;
  v_ledger_target_user_id uuid;
  v_ledger_fingerprint text;
  v_ledger_outcome text;
  v_ledger_result jsonb;
  v_ledger_completed_at timestamptz;
  v_ledger_found boolean := false;
  v_result jsonb;
  v_completed_count integer := 0;
  v_previous_request_id text := pg_catalog.current_setting('pul.club_join_inquiry_request_id', true);
  v_previous_action text := pg_catalog.current_setting('pul.club_join_inquiry_action_code', true);
  v_previous_actor_id text := pg_catalog.current_setting('pul.club_join_inquiry_actor_id', true);
  v_previous_club_id text := pg_catalog.current_setting('pul.club_join_inquiry_club_id', true);
  v_previous_inquiry_id text := pg_catalog.current_setting('pul.club_join_inquiry_id', true);
  v_previous_applicant_id text := pg_catalog.current_setting('pul.club_join_inquiry_applicant_id', true);
  v_previous_target_status text := pg_catalog.current_setting('pul.club_join_inquiry_target_status', true);
  v_previous_assignee_context text := pg_catalog.current_setting('pul.club_join_inquiry_assignee_id', true);
begin
  if v_actor_id is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;

  if p_inquiry_id is null then
    raise exception '가입 문의 식별자가 필요합니다.';
  end if;

  if p_request_id is null then
    raise exception '요청 식별자가 필요합니다.';
  end if;

  if v_operation is null
     or v_operation not in (
       'start_review',
       'reply',
       'close',
       'assign',
       'unassign',
       'update_internal_note'
     ) then
    raise exception '지원하지 않는 가입 문의 관리 작업입니다.';
  end if;

  if v_public_reply is not null and pg_catalog.char_length(v_public_reply) > 1000 then
    raise exception '가입 문의 답변은 1000자 이하여야 합니다.';
  end if;

  if v_internal_note is not null and pg_catalog.char_length(v_internal_note) > 1000 then
    raise exception '가입 문의 내부 메모는 1000자 이하여야 합니다.';
  end if;

  if v_operation = 'start_review' then
    v_action_code := 'inquiry.review';
    v_event_code := 'inquiry.review_started';
    if p_assigned_operator_id is not null
       or v_public_reply is not null
       or v_internal_note is not null then
      raise exception '검토 시작 작업에 다른 변경값을 함께 전달할 수 없습니다.';
    end if;
  elsif v_operation = 'reply' then
    v_action_code := 'inquiry.reply';
    v_event_code := 'inquiry.replied';
    if p_assigned_operator_id is not null
       or v_public_reply is null
       or v_internal_note is not null then
      raise exception '답변 작업에는 공개 답변만 전달해야 합니다.';
    end if;
  elsif v_operation = 'close' then
    v_action_code := 'inquiry.close';
    v_event_code := 'inquiry.closed';
    if p_assigned_operator_id is not null
       or v_internal_note is null then
      raise exception '문의 종료에는 운영 내부 메모가 필요합니다.';
    end if;
  elsif v_operation = 'assign' then
    v_action_code := 'inquiry.assign';
    v_event_code := 'inquiry.assignee_changed';
    if p_assigned_operator_id is null
       or v_public_reply is not null
       or v_internal_note is not null then
      raise exception '담당자 지정 작업에는 담당 운영자만 전달해야 합니다.';
    end if;
  elsif v_operation = 'unassign' then
    v_action_code := 'inquiry.unassign';
    v_event_code := 'inquiry.assignee_changed';
    if p_assigned_operator_id is not null
       or v_public_reply is not null
       or v_internal_note is not null then
      raise exception '담당자 해제 작업에 다른 변경값을 전달할 수 없습니다.';
    end if;
  else
    v_action_code := 'inquiry.note';
    v_event_code := 'inquiry.internal_note_changed';
    if p_assigned_operator_id is not null or v_public_reply is not null then
      raise exception '내부 메모 작업에는 내부 메모만 전달해야 합니다.';
    end if;
  end if;

  select inquiry.club_id
    into v_club_id
  from public.club_join_inquiries as inquiry
  where inquiry.id = p_inquiry_id;

  if not found then
    raise exception '가입 문의가 없거나 접근 권한이 없습니다.' using errcode = '42501';
  end if;

  select club.club_status
    into v_club_status
  from public.clubs as club
  where club.id = v_club_id
  for update;

  if not found then
    raise exception '가입 문의가 없거나 접근 권한이 없습니다.' using errcode = '42501';
  end if;

  select account.account_status
    into v_actor_status
  from public.user_accounts as account
  where account.id = v_actor_id
  for share;

  if not found or v_actor_status <> 'active' then
    raise exception '활성 계정만 가입 문의를 관리할 수 있습니다.' using errcode = '42501';
  end if;

  select
    inquiry.applicant_id,
    inquiry.inquiry_status,
    inquiry.assigned_operator_id,
    inquiry.public_reply,
    inquiry.internal_note
  into
    v_applicant_id,
    v_previous_status,
    v_previous_assignee_id,
    v_previous_public_reply,
    v_previous_internal_note
  from public.club_join_inquiries as inquiry
  where inquiry.id = p_inquiry_id
    and inquiry.club_id = v_club_id
  for update;

  if not found then
    raise exception '가입 문의가 없거나 접근 권한이 없습니다.' using errcode = '42501';
  end if;

  v_fingerprint := pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'action_code', v_action_code,
      'operation', v_operation,
      'inquiry_id', p_inquiry_id,
      'club_id', v_club_id,
      'applicant_id', v_applicant_id,
      'assigned_operator_id', p_assigned_operator_id,
      'public_reply', v_public_reply,
      'internal_note', v_internal_note
    )::text
  );

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
    v_ledger_target_user_id,
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
       or v_ledger_target_user_id is distinct from v_applicant_id
       or v_ledger_fingerprint is distinct from v_fingerprint then
      raise exception '같은 요청 식별자를 다른 입력에 재사용할 수 없습니다.';
    end if;

    if v_ledger_completed_at is not null then
      return query
      select
        p_request_id,
        v_ledger_action,
        (v_ledger_result ->> 'inquiry_id')::uuid,
        v_ledger_club_id,
        v_ledger_target_user_id,
        v_ledger_result ->> 'previous_status',
        v_ledger_result ->> 'current_status',
        (v_ledger_result ->> 'assigned_operator_id')::uuid,
        (v_ledger_result ->> 'changed')::boolean,
        true,
        v_ledger_outcome;
      return;
    end if;
  end if;

  if v_club_status <> 'active' then
    raise exception '활성 동호회의 가입 문의만 관리할 수 있습니다.';
  end if;

  if not private.club_user_has_permission(
    v_actor_id,
    v_club_id,
    'club.join_inquiries.manage'
  ) then
    raise exception '가입 문의가 없거나 관리 권한이 없습니다.' using errcode = '42501';
  end if;

  if v_operation = 'start_review' then
    if v_previous_status <> 'received' then
      raise exception '접수 상태의 가입 문의만 검토 중으로 변경할 수 있습니다.';
    end if;
    v_current_status := 'reviewing';
  elsif v_operation in ('reply', 'close') then
    if v_previous_status not in ('received', 'reviewing') then
      raise exception '처리 중인 가입 문의만 답변하거나 종료할 수 있습니다.';
    end if;
    v_current_status := case when v_operation = 'reply' then 'replied' else 'closed' end;
  elsif v_operation in ('assign', 'unassign') then
    if v_previous_status not in ('received', 'reviewing') then
      raise exception '처리 중인 가입 문의의 담당자만 변경할 수 있습니다.';
    end if;
    v_current_status := v_previous_status;
  else
    if v_previous_status = 'closed' and v_internal_note is null then
      raise exception '종료된 가입 문의의 운영 내부 메모는 비울 수 없습니다.';
    end if;
    v_current_status := v_previous_status;
  end if;

  if v_operation = 'assign' then
    select account.account_status
      into v_assignee_status
    from public.user_accounts as account
    where account.id = p_assigned_operator_id
    for share;

    if not found or v_assignee_status <> 'active' then
      raise exception '활성 운영자 계정만 담당자로 지정할 수 있습니다.';
    end if;

    select membership.membership_status
      into v_assignee_membership_status
    from public.club_memberships as membership
    where membership.club_id = v_club_id
      and membership.user_id = p_assigned_operator_id
    for share;

    if not found or v_assignee_membership_status <> 'active' then
      raise exception '해당 동호회의 활성 회원만 담당자로 지정할 수 있습니다.';
    end if;

    if not private.club_user_has_permission(
      p_assigned_operator_id,
      v_club_id,
      'club.join_inquiries.manage'
    ) then
      raise exception '가입 문의 관리 권한이 있는 운영자만 담당자로 지정할 수 있습니다.';
    end if;
  end if;

  if v_operation = 'update_internal_note'
     and v_previous_internal_note is not distinct from v_internal_note then
    raise exception '기존 내용과 다른 내부 메모를 전달해야 합니다.';
  end if;

  if not v_ledger_found then
    insert into private.club_mutation_requests (
      actor_id,
      request_id,
      action_code,
      club_id,
      target_user_id,
      input_fingerprint
    )
    values (
      v_actor_id,
      p_request_id,
      v_action_code,
      v_club_id,
      v_applicant_id,
      v_fingerprint
    )
    on conflict on constraint club_mutation_requests_actor_request_unique
    do nothing;

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
      v_ledger_target_user_id,
      v_ledger_fingerprint,
      v_ledger_outcome,
      v_ledger_result,
      v_ledger_completed_at
    from private.club_mutation_requests as ledger
    where ledger.actor_id = v_actor_id
      and ledger.request_id = p_request_id
    for update;

    if not found then
      raise exception '가입 문의 관리 요청 기록을 확보할 수 없습니다.';
    end if;

    if v_ledger_action is distinct from v_action_code
       or v_ledger_club_id is distinct from v_club_id
       or v_ledger_target_user_id is distinct from v_applicant_id
       or v_ledger_fingerprint is distinct from v_fingerprint then
      raise exception '같은 요청 식별자를 다른 입력에 재사용할 수 없습니다.';
    end if;

    if v_ledger_completed_at is not null then
      return query
      select
        p_request_id,
        v_ledger_action,
        (v_ledger_result ->> 'inquiry_id')::uuid,
        v_ledger_club_id,
        v_ledger_target_user_id,
        v_ledger_result ->> 'previous_status',
        v_ledger_result ->> 'current_status',
        (v_ledger_result ->> 'assigned_operator_id')::uuid,
        (v_ledger_result ->> 'changed')::boolean,
        true,
        v_ledger_outcome;
      return;
    end if;
  end if;

  v_current_assignee_id := v_previous_assignee_id;

  if v_operation = 'assign' then
    v_current_assignee_id := p_assigned_operator_id;
    v_changed := v_previous_assignee_id is distinct from p_assigned_operator_id;
  elsif v_operation = 'unassign' then
    v_current_assignee_id := null;
    v_changed := v_previous_assignee_id is not null;
  elsif v_operation = 'update_internal_note' then
    v_changed := v_previous_internal_note is distinct from v_internal_note;
  else
    v_changed := true;
  end if;

  if v_changed then
    perform private.set_club_join_inquiry_mutation_context(
      p_request_id::text,
      v_action_code,
      v_actor_id::text,
      v_club_id::text,
      p_inquiry_id::text,
      v_applicant_id::text,
      v_current_status,
      case when v_operation = 'assign' then p_assigned_operator_id::text else null end
    );

    if v_operation = 'start_review' then
      update public.club_join_inquiries as inquiry
      set
        inquiry_status = 'reviewing',
        review_started_at = pg_catalog.now(),
        last_processed_by = v_actor_id
      where inquiry.id = p_inquiry_id
        and inquiry.inquiry_status = 'received';
    elsif v_operation = 'reply' then
      update public.club_join_inquiries as inquiry
      set
        inquiry_status = 'replied',
        public_reply = v_public_reply,
        replied_at = pg_catalog.now(),
        last_processed_by = v_actor_id
      where inquiry.id = p_inquiry_id
        and inquiry.inquiry_status = v_previous_status;
    elsif v_operation = 'close' then
      update public.club_join_inquiries as inquiry
      set
        inquiry_status = 'closed',
        public_reply = v_public_reply,
        internal_note = v_internal_note,
        replied_at = case when v_public_reply is null then null else pg_catalog.now() end,
        closed_at = pg_catalog.now(),
        last_processed_by = v_actor_id
      where inquiry.id = p_inquiry_id
        and inquiry.inquiry_status = v_previous_status;
    elsif v_operation = 'assign' then
      update public.club_join_inquiries as inquiry
      set
        assigned_operator_id = p_assigned_operator_id,
        last_processed_by = v_actor_id
      where inquiry.id = p_inquiry_id
        and inquiry.inquiry_status = v_previous_status;
    elsif v_operation = 'unassign' then
      update public.club_join_inquiries as inquiry
      set
        assigned_operator_id = null,
        last_processed_by = v_actor_id
      where inquiry.id = p_inquiry_id
        and inquiry.inquiry_status = v_previous_status;
    else
      update public.club_join_inquiries as inquiry
      set
        internal_note = v_internal_note,
        last_processed_by = v_actor_id
      where inquiry.id = p_inquiry_id
        and inquiry.inquiry_status = v_previous_status;
    end if;

    if not found then
      raise exception '가입 문의 상태가 동시에 변경되었습니다.';
    end if;

    insert into public.club_join_inquiry_status_history (
      inquiry_id,
      club_id,
      actor_id,
      request_id,
      event_code,
      previous_status,
      new_status
    )
    values (
      p_inquiry_id,
      v_club_id,
      v_actor_id,
      p_request_id,
      v_event_code,
      v_previous_status,
      v_current_status
    );
  end if;

  v_outcome := case when v_changed then 'success' else 'noop' end;

  insert into public.audit_logs (
    actor_id,
    actor_type,
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
  )
  values (
    v_actor_id,
    'operator',
    v_action_code,
    'club_join_inquiry',
    p_inquiry_id::text,
    v_club_id::text,
    pg_catalog.jsonb_build_object(
      'inquiry_status', v_previous_status,
      'assigned_operator_id', v_previous_assignee_id
    ),
    pg_catalog.jsonb_build_object(
      'inquiry_status', v_current_status,
      'assigned_operator_id', v_current_assignee_id
    ),
    null,
    pg_catalog.jsonb_build_object(
      'event_code', v_event_code,
      'changed', v_changed,
      'public_reply_changed', v_operation in ('reply', 'close')
        and v_public_reply is not null
        and v_changed,
      'internal_note_changed', v_operation in ('close', 'update_internal_note') and v_changed
    ),
    p_request_id,
    v_outcome
  );

  v_result := pg_catalog.jsonb_build_object(
    'action_code', v_action_code,
    'operation', v_operation,
    'inquiry_id', p_inquiry_id,
    'club_id', v_club_id,
    'applicant_id', v_applicant_id,
    'previous_status', v_previous_status,
    'current_status', v_current_status,
    'assigned_operator_id', v_current_assignee_id,
    'changed', v_changed,
    'outcome', v_outcome
  );

  update private.club_mutation_requests as ledger
  set
    outcome = v_outcome,
    result_data = v_result,
    completed_at = pg_catalog.now()
  where ledger.actor_id = v_actor_id
    and ledger.request_id = p_request_id
    and ledger.action_code = v_action_code
    and ledger.input_fingerprint = v_fingerprint
    and ledger.completed_at is null;

  get diagnostics v_completed_count = row_count;

  if v_completed_count <> 1 then
    raise exception '가입 문의 관리 요청 완료 상태를 저장할 수 없습니다.';
  end if;

  perform private.set_club_join_inquiry_mutation_context(
    v_previous_request_id,
    v_previous_action,
    v_previous_actor_id,
    v_previous_club_id,
    v_previous_inquiry_id,
    v_previous_applicant_id,
    v_previous_target_status,
    v_previous_assignee_context
  );

  return query
  select
    p_request_id,
    v_action_code,
    p_inquiry_id,
    v_club_id,
    v_applicant_id,
    v_previous_status,
    v_current_status,
    v_current_assignee_id,
    v_changed,
    false,
    v_outcome;
exception
  when others then
    perform private.set_club_join_inquiry_mutation_context(
      v_previous_request_id,
      v_previous_action,
      v_previous_actor_id,
      v_previous_club_id,
      v_previous_inquiry_id,
      v_previous_applicant_id,
      v_previous_target_status,
      v_previous_assignee_context
    );
    raise;
end;
$$;

revoke all on function private.execute_club_join_inquiry_management(
  uuid, text, uuid, uuid, text, text
) from public, anon, authenticated, service_role;

create function public.submit_club_join_inquiry(
  p_club_id uuid,
  p_experience_code text,
  p_available_day_code text,
  p_interest_codes text[],
  p_message text,
  p_request_id uuid
)
returns table (
  request_id uuid,
  action_code text,
  inquiry_id uuid,
  club_id uuid,
  applicant_id uuid,
  inquiry_status text,
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
  from private.execute_club_join_inquiry_submit(
    p_club_id,
    p_experience_code,
    p_available_day_code,
    p_interest_codes,
    p_message,
    p_request_id
  );
$$;

revoke all on function public.submit_club_join_inquiry(
  uuid, text, text, text[], text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.submit_club_join_inquiry(
  uuid, text, text, text[], text, uuid
) to authenticated;

create function public.withdraw_club_join_inquiry(
  p_inquiry_id uuid,
  p_request_id uuid
)
returns table (
  request_id uuid,
  action_code text,
  inquiry_id uuid,
  club_id uuid,
  applicant_id uuid,
  previous_status text,
  current_status text,
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
  from private.execute_club_join_inquiry_withdraw(p_inquiry_id, p_request_id);
$$;

revoke all on function public.withdraw_club_join_inquiry(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.withdraw_club_join_inquiry(uuid, uuid)
  to authenticated;

create function public.manage_club_join_inquiry(
  p_inquiry_id uuid,
  p_operation text,
  p_request_id uuid,
  p_assigned_operator_id uuid default null,
  p_public_reply text default null,
  p_internal_note text default null
)
returns table (
  request_id uuid,
  action_code text,
  inquiry_id uuid,
  club_id uuid,
  applicant_id uuid,
  previous_status text,
  current_status text,
  assigned_operator_id uuid,
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
  from private.execute_club_join_inquiry_management(
    p_inquiry_id,
    p_operation,
    p_request_id,
    p_assigned_operator_id,
    p_public_reply,
    p_internal_note
  );
$$;

revoke all on function public.manage_club_join_inquiry(
  uuid, text, uuid, uuid, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.manage_club_join_inquiry(
  uuid, text, uuid, uuid, text, text
) to authenticated;

create function public.get_my_active_club_join_inquiry(p_club_id uuid)
returns table (
  inquiry_id uuid,
  club_id uuid,
  applicant_id uuid,
  experience_code text,
  available_day_code text,
  interest_codes text[],
  message text,
  inquiry_status text,
  is_assigned boolean,
  public_reply text,
  submitted_at timestamptz,
  review_started_at timestamptz,
  replied_at timestamptz,
  closed_at timestamptz,
  withdrawn_at timestamptz,
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
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;

  if p_club_id is null then
    raise exception '동호회 식별자가 필요합니다.';
  end if;

  if not exists (
    select 1
    from public.user_accounts as account
    where account.id = v_actor_id
      and account.account_status = 'active'
  ) then
    raise exception '활성 계정만 가입 문의를 조회할 수 있습니다.' using errcode = '42501';
  end if;

  return query
  select
    inquiry.id,
    inquiry.club_id,
    inquiry.applicant_id,
    inquiry.experience_code,
    inquiry.available_day_code,
    inquiry.interest_codes,
    inquiry.message,
    inquiry.inquiry_status,
    inquiry.assigned_operator_id is not null,
    inquiry.public_reply,
    inquiry.submitted_at,
    inquiry.review_started_at,
    inquiry.replied_at,
    inquiry.closed_at,
    inquiry.withdrawn_at,
    inquiry.updated_at
  from public.club_join_inquiries as inquiry
  where inquiry.club_id = p_club_id
    and inquiry.applicant_id = v_actor_id
    and inquiry.inquiry_status in ('received', 'reviewing')
  order by inquiry.submitted_at desc, inquiry.id desc
  limit 1;
end;
$$;

revoke all on function public.get_my_active_club_join_inquiry(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_active_club_join_inquiry(uuid)
  to authenticated;

create function public.list_my_club_join_inquiries(
  p_club_id uuid default null,
  p_limit integer default 20,
  p_before_submitted_at timestamptz default null,
  p_before_inquiry_id uuid default null
)
returns table (
  inquiry_id uuid,
  club_id uuid,
  experience_code text,
  available_day_code text,
  interest_codes text[],
  inquiry_status text,
  is_assigned boolean,
  has_public_reply boolean,
  submitted_at timestamptz,
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
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception '조회 개수는 1 이상 50 이하여야 합니다.';
  end if;

  if (p_before_submitted_at is null) <> (p_before_inquiry_id is null) then
    raise exception '페이지 커서는 제출 시각과 문의 식별자를 함께 전달해야 합니다.';
  end if;

  if not exists (
    select 1
    from public.user_accounts as account
    where account.id = v_actor_id
      and account.account_status = 'active'
  ) then
    raise exception '활성 계정만 가입 문의를 조회할 수 있습니다.' using errcode = '42501';
  end if;

  return query
  select
    inquiry.id,
    inquiry.club_id,
    inquiry.experience_code,
    inquiry.available_day_code,
    inquiry.interest_codes,
    inquiry.inquiry_status,
    inquiry.assigned_operator_id is not null,
    inquiry.public_reply is not null,
    inquiry.submitted_at,
    inquiry.updated_at
  from public.club_join_inquiries as inquiry
  where inquiry.applicant_id = v_actor_id
    and (p_club_id is null or inquiry.club_id = p_club_id)
    and (
      p_before_submitted_at is null
      or (inquiry.submitted_at, inquiry.id) < (p_before_submitted_at, p_before_inquiry_id)
    )
  order by inquiry.submitted_at desc, inquiry.id desc
  limit p_limit;
end;
$$;

revoke all on function public.list_my_club_join_inquiries(
  uuid, integer, timestamptz, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.list_my_club_join_inquiries(
  uuid, integer, timestamptz, uuid
) to authenticated;

create function public.get_my_club_join_inquiry(p_inquiry_id uuid)
returns table (
  inquiry_id uuid,
  club_id uuid,
  applicant_id uuid,
  experience_code text,
  available_day_code text,
  interest_codes text[],
  message text,
  inquiry_status text,
  is_assigned boolean,
  public_reply text,
  submitted_at timestamptz,
  review_started_at timestamptz,
  replied_at timestamptz,
  closed_at timestamptz,
  withdrawn_at timestamptz,
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
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;

  if p_inquiry_id is null then
    raise exception '가입 문의 식별자가 필요합니다.';
  end if;

  if not exists (
    select 1
    from public.user_accounts as account
    where account.id = v_actor_id
      and account.account_status = 'active'
  ) then
    raise exception '활성 계정만 가입 문의를 조회할 수 있습니다.' using errcode = '42501';
  end if;

  return query
  select
    inquiry.id,
    inquiry.club_id,
    inquiry.applicant_id,
    inquiry.experience_code,
    inquiry.available_day_code,
    inquiry.interest_codes,
    inquiry.message,
    inquiry.inquiry_status,
    inquiry.assigned_operator_id is not null,
    inquiry.public_reply,
    inquiry.submitted_at,
    inquiry.review_started_at,
    inquiry.replied_at,
    inquiry.closed_at,
    inquiry.withdrawn_at,
    inquiry.updated_at
  from public.club_join_inquiries as inquiry
  where inquiry.id = p_inquiry_id
    and inquiry.applicant_id = v_actor_id;
end;
$$;

revoke all on function public.get_my_club_join_inquiry(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_club_join_inquiry(uuid)
  to authenticated;

create function public.list_my_club_join_inquiry_history(p_inquiry_id uuid)
returns table (
  history_id uuid,
  inquiry_id uuid,
  event_code text,
  previous_status text,
  new_status text,
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
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;

  if p_inquiry_id is null then
    raise exception '가입 문의 식별자가 필요합니다.';
  end if;

  if not exists (
    select 1
    from public.user_accounts as account
    where account.id = v_actor_id
      and account.account_status = 'active'
  ) then
    raise exception '활성 계정만 가입 문의 이력을 조회할 수 있습니다.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.club_join_inquiries as inquiry
    where inquiry.id = p_inquiry_id
      and inquiry.applicant_id = v_actor_id
  ) then
    raise exception '가입 문의가 없거나 접근 권한이 없습니다.' using errcode = '42501';
  end if;

  return query
  select
    history.id,
    history.inquiry_id,
    history.event_code,
    history.previous_status,
    history.new_status,
    history.actor_id = v_actor_id,
    history.created_at
  from public.club_join_inquiry_status_history as history
  where history.inquiry_id = p_inquiry_id
    and history.event_code in (
      'inquiry.submitted',
      'inquiry.review_started',
      'inquiry.replied',
      'inquiry.closed',
      'inquiry.withdrawn'
    )
  order by history.created_at, history.id;
end;
$$;

revoke all on function public.list_my_club_join_inquiry_history(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.list_my_club_join_inquiry_history(uuid)
  to authenticated;

create function public.list_club_join_inquiries(
  p_club_id uuid,
  p_status text default null,
  p_assigned boolean default null,
  p_limit integer default 50,
  p_before_submitted_at timestamptz default null,
  p_before_inquiry_id uuid default null
)
returns table (
  inquiry_id uuid,
  club_id uuid,
  applicant_id uuid,
  experience_code text,
  available_day_code text,
  interest_codes text[],
  inquiry_status text,
  message_present boolean,
  assigned_operator_id uuid,
  submitted_at timestamptz,
  updated_at timestamptz
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
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;

  if p_club_id is null then
    raise exception '동호회 식별자가 필요합니다.';
  end if;

  if v_status is not null
     and v_status not in ('received', 'reviewing', 'replied', 'closed', 'withdrawn') then
    raise exception '가입 문의 상태 필터가 올바르지 않습니다.';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception '조회 개수는 1 이상 100 이하여야 합니다.';
  end if;

  if (p_before_submitted_at is null) <> (p_before_inquiry_id is null) then
    raise exception '페이지 커서는 제출 시각과 문의 식별자를 함께 전달해야 합니다.';
  end if;

  if not exists (
    select 1
    from public.user_accounts as account
    where account.id = v_actor_id
      and account.account_status = 'active'
  ) then
    raise exception '활성 계정만 가입 문의를 조회할 수 있습니다.' using errcode = '42501';
  end if;

  if not private.club_user_has_permission(
    v_actor_id,
    p_club_id,
    'club.join_inquiries.read'
  ) then
    raise exception '가입 문의 조회 권한이 없습니다.' using errcode = '42501';
  end if;

  return query
  select
    inquiry.id,
    inquiry.club_id,
    inquiry.applicant_id,
    inquiry.experience_code,
    inquiry.available_day_code,
    inquiry.interest_codes,
    inquiry.inquiry_status,
    inquiry.message is not null,
    inquiry.assigned_operator_id,
    inquiry.submitted_at,
    inquiry.updated_at
  from public.club_join_inquiries as inquiry
  where inquiry.club_id = p_club_id
    and (v_status is null or inquiry.inquiry_status = v_status)
    and (
      p_assigned is null
      or (inquiry.assigned_operator_id is not null) = p_assigned
    )
    and (
      p_before_submitted_at is null
      or (inquiry.submitted_at, inquiry.id) < (p_before_submitted_at, p_before_inquiry_id)
    )
  order by inquiry.submitted_at desc, inquiry.id desc
  limit p_limit;
end;
$$;

revoke all on function public.list_club_join_inquiries(
  uuid, text, boolean, integer, timestamptz, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.list_club_join_inquiries(
  uuid, text, boolean, integer, timestamptz, uuid
) to authenticated;

create function public.get_club_join_inquiry_for_management(p_inquiry_id uuid)
returns table (
  inquiry_id uuid,
  club_id uuid,
  applicant_id uuid,
  experience_code text,
  available_day_code text,
  interest_codes text[],
  message text,
  inquiry_status text,
  assigned_operator_id uuid,
  public_reply text,
  internal_note text,
  last_processed_by uuid,
  submitted_at timestamptz,
  review_started_at timestamptz,
  replied_at timestamptz,
  closed_at timestamptz,
  withdrawn_at timestamptz,
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
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;

  if p_inquiry_id is null then
    raise exception '가입 문의 식별자가 필요합니다.';
  end if;

  if not exists (
    select 1
    from public.user_accounts as account
    where account.id = v_actor_id
      and account.account_status = 'active'
  ) then
    raise exception '활성 계정만 가입 문의를 조회할 수 있습니다.' using errcode = '42501';
  end if;

  select inquiry.club_id
    into v_club_id
  from public.club_join_inquiries as inquiry
  where inquiry.id = p_inquiry_id;

  if not found
     or not private.club_user_has_permission(
       v_actor_id,
       v_club_id,
       'club.join_inquiries.read'
     ) then
    raise exception '가입 문의가 없거나 조회 권한이 없습니다.' using errcode = '42501';
  end if;

  return query
  select
    inquiry.id,
    inquiry.club_id,
    inquiry.applicant_id,
    inquiry.experience_code,
    inquiry.available_day_code,
    inquiry.interest_codes,
    inquiry.message,
    inquiry.inquiry_status,
    inquiry.assigned_operator_id,
    inquiry.public_reply,
    inquiry.internal_note,
    inquiry.last_processed_by,
    inquiry.submitted_at,
    inquiry.review_started_at,
    inquiry.replied_at,
    inquiry.closed_at,
    inquiry.withdrawn_at,
    inquiry.updated_at
  from public.club_join_inquiries as inquiry
  where inquiry.id = p_inquiry_id
    and inquiry.club_id = v_club_id;
end;
$$;

revoke all on function public.get_club_join_inquiry_for_management(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_club_join_inquiry_for_management(uuid)
  to authenticated;

create function public.list_club_join_inquiry_history_for_management(p_inquiry_id uuid)
returns table (
  history_id uuid,
  inquiry_id uuid,
  club_id uuid,
  actor_id uuid,
  request_id uuid,
  event_code text,
  previous_status text,
  new_status text,
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
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;

  if p_inquiry_id is null then
    raise exception '가입 문의 식별자가 필요합니다.';
  end if;

  if not exists (
    select 1
    from public.user_accounts as account
    where account.id = v_actor_id
      and account.account_status = 'active'
  ) then
    raise exception '활성 계정만 가입 문의 이력을 조회할 수 있습니다.' using errcode = '42501';
  end if;

  select inquiry.club_id
    into v_club_id
  from public.club_join_inquiries as inquiry
  where inquiry.id = p_inquiry_id;

  if not found
     or not private.club_user_has_permission(
       v_actor_id,
       v_club_id,
       'club.join_inquiries.read'
     ) then
    raise exception '가입 문의가 없거나 조회 권한이 없습니다.' using errcode = '42501';
  end if;

  return query
  select
    history.id,
    history.inquiry_id,
    history.club_id,
    history.actor_id,
    history.request_id,
    history.event_code,
    history.previous_status,
    history.new_status,
    history.created_at
  from public.club_join_inquiry_status_history as history
  where history.inquiry_id = p_inquiry_id
    and history.club_id = v_club_id
  order by history.created_at, history.id;
end;
$$;

revoke all on function public.list_club_join_inquiry_history_for_management(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.list_club_join_inquiry_history_for_management(uuid)
  to authenticated;

comment on function public.submit_club_join_inquiry(
  uuid, text, text, text[], text, uuid
) is 'Creates one protected active inquiry per applicant and club with idempotent replay.';

comment on function public.manage_club_join_inquiry(
  uuid, text, uuid, uuid, text, text
) is 'Permission-checked inquiry state, assignee, public reply, and internal note mutation RPC.';

comment on function public.list_club_join_inquiries(
  uuid, text, boolean, integer, timestamptz, uuid
) is 'Permission-checked stable keyset list that omits raw message and internal note content.';
