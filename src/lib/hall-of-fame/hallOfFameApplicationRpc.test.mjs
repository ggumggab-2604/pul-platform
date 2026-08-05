import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";

const activePsqlChildren = new Set();

function trackPsqlChild(child) {
  activePsqlChildren.add(child);
  child.once("close", () => {
    activePsqlChildren.delete(child);
  });
  return child;
}

function findLocalDatabaseContainer() {
  const result = spawnSync(
    "docker",
    [
      "ps",
      "--filter",
      "name=supabase_db_",
      "--format",
      "{{.Names}}",
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const containers = result.stdout
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
  assert.equal(
    containers.length,
    1,
    "exactly one local Supabase DB container must be running",
  );
  assert.match(containers[0], /^supabase_db_[a-z0-9-]+$/i);
  return containers[0];
}

const sql = String.raw`
\set ON_ERROR_STOP on
begin;

select id as club_one_id from public.clubs where legacy_key = '1' \gset
select id as club_two_id from public.clubs where legacy_key = '2' \gset
select id as club_three_id from public.clubs where legacy_key = '3' \gset
select id as club_four_id from public.clubs where legacy_key = '4' \gset
select pg_catalog.set_config('pul.test.club_one_id', :'club_one_id', true);
select pg_catalog.set_config('pul.test.club_two_id', :'club_two_id', true);
select pg_catalog.set_config('pul.test.club_three_id', :'club_three_id', true);
select pg_catalog.set_config('pul.test.club_four_id', :'club_four_id', true);
set local session_replication_role = replica;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
)
select
  fixture.id,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  fixture.email,
  '',
  pg_catalog.now(),
  pg_catalog.now(),
  pg_catalog.now()
from (
  values
    ('a0000000-0000-0000-0000-000000000001'::uuid, 'hof-direct@example.invalid'),
    ('a0000000-0000-0000-0000-000000000002'::uuid, 'hof-left@example.invalid'),
    ('a0000000-0000-0000-0000-000000000003'::uuid, 'hof-suspended@example.invalid'),
    ('a0000000-0000-0000-0000-000000000004'::uuid, 'hof-vacancy@example.invalid'),
    ('a0000000-0000-0000-0000-000000000005'::uuid, 'hof-admin@example.invalid'),
    ('a0000000-0000-0000-0000-000000000006'::uuid, 'hof-vice@example.invalid'),
    ('a0000000-0000-0000-0000-000000000007'::uuid, 'hof-manager@example.invalid'),
    ('a0000000-0000-0000-0000-000000000008'::uuid, 'hof-inactive@example.invalid'),
    ('a0000000-0000-0000-0000-000000000009'::uuid, 'hof-multi@example.invalid')
) as fixture(id, email);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
)
select
  ('a1000000-0000-0000-0000-' || pg_catalog.lpad(i::text, 12, '0'))::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  'hof-target-' || i::text || '@example.invalid',
  '',
  pg_catalog.now(),
  pg_catalog.now(),
  pg_catalog.now()
from pg_catalog.generate_series(1, 21) as series(i);

insert into public.user_accounts (id, account_status)
select id, case
  when id = 'a0000000-0000-0000-0000-000000000008'::uuid
    then 'suspended'
  else 'active'
end
from auth.users
where email like 'hof-%@example.invalid';

insert into public.club_memberships (
  id, club_id, user_id, membership_status, joined_at, suspended_at, left_at
)
values
  ('c0000000-0000-0000-0000-000000000002', pg_catalog.current_setting('pul.test.club_three_id')::uuid, 'a0000000-0000-0000-0000-000000000002', 'left', pg_catalog.now(), null, pg_catalog.now()),
  ('c0000000-0000-0000-0000-000000000003', pg_catalog.current_setting('pul.test.club_four_id')::uuid, 'a0000000-0000-0000-0000-000000000003', 'suspended', pg_catalog.now(), pg_catalog.now(), null),
  ('c0000000-0000-0000-0000-000000000004', pg_catalog.current_setting('pul.test.club_two_id')::uuid, 'a0000000-0000-0000-0000-000000000004', 'active', pg_catalog.now(), null, null),
  ('c0000000-0000-0000-0000-000000000005', pg_catalog.current_setting('pul.test.club_one_id')::uuid, 'a0000000-0000-0000-0000-000000000005', 'active', pg_catalog.now(), null, null),
  ('c0000000-0000-0000-0000-000000000006', pg_catalog.current_setting('pul.test.club_one_id')::uuid, 'a0000000-0000-0000-0000-000000000006', 'active', pg_catalog.now(), null, null),
  ('c0000000-0000-0000-0000-000000000007', pg_catalog.current_setting('pul.test.club_one_id')::uuid, 'a0000000-0000-0000-0000-000000000007', 'active', pg_catalog.now(), null, null),
  ('c0000000-0000-0000-0000-000000000009', pg_catalog.current_setting('pul.test.club_one_id')::uuid, 'a0000000-0000-0000-0000-000000000009', 'active', pg_catalog.now(), null, null),
  ('c0000000-0000-0000-0000-000000000010', pg_catalog.current_setting('pul.test.club_two_id')::uuid, 'a0000000-0000-0000-0000-000000000009', 'active', pg_catalog.now(), null, null);

insert into public.club_memberships (
  id, club_id, user_id, membership_status, joined_at
)
select
  ('c1000000-0000-0000-0000-' || pg_catalog.lpad(i::text, 12, '0'))::uuid,
  pg_catalog.current_setting('pul.test.club_one_id')::uuid,
  ('a1000000-0000-0000-0000-' || pg_catalog.lpad(i::text, 12, '0'))::uuid,
  'active',
  pg_catalog.now()
from pg_catalog.generate_series(1, 21) as series(i);

insert into public.club_role_assignments (
  membership_id, role_code, assigned_by
)
values
  ('c0000000-0000-0000-0000-000000000005', 'club_member', 'a0000000-0000-0000-0000-000000000005'),
  ('c0000000-0000-0000-0000-000000000005', 'club_admin', 'a0000000-0000-0000-0000-000000000005'),
  ('c0000000-0000-0000-0000-000000000006', 'club_member', 'a0000000-0000-0000-0000-000000000005'),
  ('c0000000-0000-0000-0000-000000000006', 'club_vice_admin', 'a0000000-0000-0000-0000-000000000005'),
  ('c0000000-0000-0000-0000-000000000007', 'club_member', 'a0000000-0000-0000-0000-000000000005'),
  ('c0000000-0000-0000-0000-000000000007', 'club_manager', 'a0000000-0000-0000-0000-000000000005');

insert into public.club_role_assignments (
  membership_id, role_code, assigned_by
)
select
  ('c1000000-0000-0000-0000-' || pg_catalog.lpad(i::text, 12, '0'))::uuid,
  'club_member',
  'a0000000-0000-0000-0000-000000000005'::uuid
from pg_catalog.generate_series(1, 21) as series(i);

set local session_replication_role = origin;
set local role authenticated;

select pg_catalog.set_config(
  'request.jwt.claim.sub',
  'a0000000-0000-0000-0000-000000000001',
  true
);
do $$
declare v_code text;
begin
  select eligibility_code into v_code
  from public.get_current_user_hall_of_fame_application_eligibility();
  if v_code <> 'direct_application_allowed' then
    raise exception 'direct eligibility mismatch: %', v_code;
  end if;
end;
$$;

select pg_catalog.set_config(
  'request.jwt.claim.sub',
  'a0000000-0000-0000-0000-000000000002',
  true
);
do $$
declare v_code text;
begin
  select eligibility_code into v_code
  from public.get_current_user_hall_of_fame_application_eligibility();
  if v_code <> 'direct_application_allowed' then
    raise exception 'left-only eligibility mismatch: %', v_code;
  end if;
end;
$$;

select pg_catalog.set_config(
  'request.jwt.claim.sub',
  'a0000000-0000-0000-0000-000000000003',
  true
);
do $$
declare v_code text;
begin
  select eligibility_code into v_code
  from public.get_current_user_hall_of_fame_application_eligibility();
  if v_code <> 'blocked_due_to_suspension' then
    raise exception 'suspended eligibility mismatch: %', v_code;
  end if;
  begin
    perform public.create_hall_of_fame_application_draft(
      'direct_application', null,
      'b0000000-0000-0000-0000-000000000091'
    );
    raise exception 'suspended draft unexpectedly succeeded';
  exception when others then
    if sqlerrm not in (
      'HOF_DIRECT_APPLICATION_NOT_ALLOWED',
      'HOF_CLUB_NOMINATION_REQUIRED'
    ) then
      raise;
    end if;
  end;
end;
$$;

select pg_catalog.set_config(
  'request.jwt.claim.sub',
  'a0000000-0000-0000-0000-000000000004',
  true
);
do $$
declare v_code text;
begin
  select eligibility_code into v_code
  from public.get_current_user_hall_of_fame_application_eligibility();
  if v_code <> 'direct_application_allowed_due_to_admin_vacancy' then
    raise exception 'vacancy eligibility mismatch: %', v_code;
  end if;
end;
$$;

select pg_catalog.set_config(
  'request.jwt.claim.sub',
  'a0000000-0000-0000-0000-000000000009',
  true
);
do $$
declare v_code text;
begin
  select eligibility_code into v_code
  from public.get_current_user_hall_of_fame_application_eligibility();
  if v_code <> 'club_nomination_required' then
    raise exception 'multi-club eligibility mismatch: %', v_code;
  end if;
end;
$$;

select pg_catalog.set_config(
  'request.jwt.claim.sub',
  'a0000000-0000-0000-0000-000000000008',
  true
);
do $$
declare v_code text;
begin
  select eligibility_code into v_code
  from public.get_current_user_hall_of_fame_application_eligibility();
  if v_code <> 'blocked_due_to_account_status' then
    raise exception 'inactive eligibility mismatch: %', v_code;
  end if;
end;
$$;

select pg_catalog.set_config('request.jwt.claim.sub', '', true);
do $$
declare v_code text;
begin
  select eligibility_code into v_code
  from public.get_current_user_hall_of_fame_application_eligibility();
  if v_code <> 'blocked_due_to_account_status' then
    raise exception 'signed-out eligibility mismatch: %', v_code;
  end if;
end;
$$;

select pg_catalog.set_config(
  'request.jwt.claim.sub',
  'a0000000-0000-0000-0000-000000000001',
  true
);
select * from public.create_hall_of_fame_application_draft(
  'direct_application', null,
  'b0000000-0000-0000-0000-000000000001'
) \gset direct_
select pg_catalog.set_config(
  'pul.test.direct_batch_id',
  :'direct_application_batch_id',
  true
);
select * from public.create_hall_of_fame_application_draft(
  'direct_application', null,
  'b0000000-0000-0000-0000-000000000001'
) \gset direct_replay_

\if :direct_replay_replayed
\else
  \echo 'draft replay did not report replayed'
  \quit 3
\endif

do $$
begin
  begin
    perform public.create_hall_of_fame_application_draft(
      'club_admin_vacancy_direct_application',
      pg_catalog.current_setting('pul.test.club_two_id')::uuid,
      'b0000000-0000-0000-0000-000000000001'
    );
    raise exception 'payload mismatch unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'HOF_REQUEST_ID_PAYLOAD_MISMATCH' then
      raise;
    end if;
  end;

  begin
    perform public.create_hall_of_fame_application_draft(
      'direct_application', null,
      'b0000000-0000-0000-0000-000000000002'
    );
    raise exception 'duplicate open draft unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'HOF_OPEN_DRAFT_ALREADY_EXISTS' then
      raise;
    end if;
  end;
end;
$$;

select * from public.set_hall_of_fame_round_snapshot(
  pg_catalog.current_setting('pul.test.direct_batch_id')::uuid, 1, date '2026-07-31', null,
  'Local Course', 'Seoul', 'outdoor', null, 'practice', null, null,
  'b0000000-0000-0000-0000-000000000003'
) \gset round_create_

select * from public.set_hall_of_fame_round_snapshot(
  pg_catalog.current_setting('pul.test.direct_batch_id')::uuid, 2, date '2026-07-31', null,
  'Local Course', 'Seoul', 'outdoor', null, 'practice', null, null,
  'b0000000-0000-0000-0000-000000000004'
) \gset round_noop_

\if :round_noop_changed
  \echo 'equal round payload was not a noop'
  \quit 4
\endif

select * from public.set_hall_of_fame_round_snapshot(
  pg_catalog.current_setting('pul.test.direct_batch_id')::uuid, 2, date '2026-07-31', null,
  'Local Course', 'Seoul', 'outdoor', 'A-B', 'practice', null, null,
  'b0000000-0000-0000-0000-000000000005'
) \gset round_update_

do $$
begin
  begin
    perform public.set_hall_of_fame_round_snapshot(
      pg_catalog.current_setting('pul.test.direct_batch_id')::uuid, 2, date '2026-07-31', null,
      'Local Course', 'Seoul', 'outdoor', null, 'practice', null, null,
      'b0000000-0000-0000-0000-000000000006'
    );
    raise exception 'stale round unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'HOF_STALE_VERSION' then raise; end if;
  end;
end;
$$;

do $$
begin
  begin
    perform public.set_hall_of_fame_round_snapshot(
      pg_catalog.current_setting('pul.test.direct_batch_id')::uuid,
      3, date '2026-07-31', null,
      'Local Course', 'Seoul', 'invalid', null, 'practice', null, null,
      'b0000000-0000-0000-0000-000000000099'
    );
    raise exception 'invalid environment unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'HOF_INVALID_ROUND_SNAPSHOT' then raise; end if;
  end;
end;
$$;

select * from public.add_hall_of_fame_application_record(
  pg_catalog.current_setting('pul.test.direct_batch_id')::uuid, 3,
  'a0000000-0000-0000-0000-000000000001', null,
  'hole_in_one', '  A   ', 1, 3, 1,
  'b0000000-0000-0000-0000-000000000007'
) \gset record_add_
select pg_catalog.set_config(
  'pul.test.direct_record_id',
  :'record_add_application_record_id',
  true
);
reset role;
do $$
begin
  if not exists (
    select 1
    from public.hall_of_fame_application_records as record
    where record.id = pg_catalog.current_setting(
      'pul.test.direct_record_id'
    )::uuid
      and record.course_segment_snapshot = 'a'
  ) then
    raise exception 'course segment was not stored canonically';
  end if;
end;
$$;
set local role authenticated;
do $$
begin
  begin
    perform public.add_hall_of_fame_application_record(
      pg_catalog.current_setting('pul.test.direct_batch_id')::uuid, 4,
      'a1000000-0000-0000-0000-000000000001', null,
      'hole_in_one', 'A', 2, 3, 1,
      'b0000000-0000-0000-0000-000000000008'
    );
    raise exception 'other direct target unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'HOF_DIRECT_APPLICATION_TARGET_MUST_BE_SELF' then
      raise;
    end if;
  end;
end;
$$;

reset role;
select pg_catalog.set_config(
  'pul.test.noop_record_version',
  (select version::text from public.hall_of_fame_application_records where id = pg_catalog.current_setting('pul.test.direct_record_id')::uuid),
  true
);
select pg_catalog.set_config(
  'pul.test.noop_batch_version',
  (select version::text from public.hall_of_fame_application_batches where id = pg_catalog.current_setting('pul.test.direct_batch_id')::uuid),
  true
);
select pg_catalog.set_config(
  'pul.test.noop_fingerprint',
  (select pg_catalog.encode(duplicate_fingerprint, 'hex') from public.hall_of_fame_application_records where id = pg_catalog.current_setting('pul.test.direct_record_id')::uuid),
  true
);
select pg_catalog.set_config(
  'pul.test.noop_history_count',
  (select count(*)::text from public.hall_of_fame_application_history where application_batch_id = pg_catalog.current_setting('pul.test.direct_batch_id')::uuid),
  true
);
select pg_catalog.set_config(
  'pul.test.noop_audit_count',
  (select count(*)::text from public.audit_logs where actor_id = 'a0000000-0000-0000-0000-000000000001'),
  true
);
set local role authenticated;
select * from public.update_hall_of_fame_application_record(
  pg_catalog.current_setting('pul.test.direct_record_id')::uuid, 1, 4,
  'hole_in_one', ' A ', 1, 3, 1,
  'b0000000-0000-0000-0000-000000000009'
) \gset record_noop_

\if :record_noop_changed
  \echo 'equal record payload was not a noop'
  \quit 5
\endif

reset role;
do $$
declare
  v_record public.hall_of_fame_application_records%rowtype;
  v_batch_version integer;
  v_history_count integer;
  v_audit_count integer;
begin
  select record.* into strict v_record
  from public.hall_of_fame_application_records as record
  where record.id = pg_catalog.current_setting('pul.test.direct_record_id')::uuid;
  select batch.version into strict v_batch_version
  from public.hall_of_fame_application_batches as batch
  where batch.id = pg_catalog.current_setting('pul.test.direct_batch_id')::uuid;
  select count(*) into v_history_count
  from public.hall_of_fame_application_history
  where application_batch_id = pg_catalog.current_setting('pul.test.direct_batch_id')::uuid;
  select count(*) into v_audit_count
  from public.audit_logs
  where actor_id = 'a0000000-0000-0000-0000-000000000001';

  if v_record.version <> pg_catalog.current_setting('pul.test.noop_record_version')::integer then
    raise exception 'canonical noop changed record version';
  end if;
  if v_batch_version <> pg_catalog.current_setting('pul.test.noop_batch_version')::integer then
    raise exception 'canonical noop changed batch version';
  end if;
  if pg_catalog.encode(v_record.duplicate_fingerprint, 'hex') <> pg_catalog.current_setting('pul.test.noop_fingerprint') then
    raise exception 'canonical noop changed fingerprint';
  end if;
  if v_history_count <> pg_catalog.current_setting('pul.test.noop_history_count')::integer then
    raise exception 'canonical noop changed history count';
  end if;
  if v_audit_count <> pg_catalog.current_setting('pul.test.noop_audit_count')::integer then
    raise exception 'canonical noop changed audit count';
  end if;
  if v_record.course_segment_snapshot <> 'a' then
    raise exception 'canonical noop changed stored segment';
  end if;
  if (
    select count(*)
    from private.hall_of_fame_mutation_requests as ledger
    where ledger.request_id = 'b0000000-0000-0000-0000-000000000009'
      and ledger.status = 'completed'
      and ledger.result_payload ->> 'outcome' = 'noop'
      and (ledger.result_payload ->> 'changed')::boolean = false
  ) <> 1 then
    raise exception 'canonical noop ledger contract mismatch';
  end if;
end;
$$;
set local role authenticated;

select * from public.update_hall_of_fame_application_record(
  pg_catalog.current_setting('pul.test.direct_record_id')::uuid, 1, 4,
  'hole_in_one', 'A', 2, 3, 1,
  'b0000000-0000-0000-0000-000000000010'
) \gset record_update_

do $$
begin
  begin
    perform public.update_hall_of_fame_application_record(
      pg_catalog.current_setting('pul.test.direct_record_id')::uuid, 1, 5,
      'hole_in_one', 'A', 3, 3, 1,
      'b0000000-0000-0000-0000-000000000011'
    );
    raise exception 'stale record unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'HOF_STALE_VERSION' then raise; end if;
  end;
end;
$$;

select * from public.withdraw_hall_of_fame_application_record(
  pg_catalog.current_setting('pul.test.direct_record_id')::uuid, 2, 5, 'local record withdrawal',
  'b0000000-0000-0000-0000-000000000012'
) \gset record_withdraw_

select * from public.withdraw_hall_of_fame_application_record(
  pg_catalog.current_setting('pul.test.direct_record_id')::uuid, 2, 5, 'local record withdrawal',
  'b0000000-0000-0000-0000-000000000012'
) \gset record_withdraw_replay_

\if :record_withdraw_replay_replayed
\else
  \echo 'record withdrawal replay did not report replayed'
  \quit 6
\endif

select * from public.add_hall_of_fame_application_record(
  pg_catalog.current_setting('pul.test.direct_batch_id')::uuid, 6,
  'a0000000-0000-0000-0000-000000000001', null,
  'hole_in_one', 'A', 3, 3, 1,
  'b0000000-0000-0000-0000-000000000013'
) \gset record_two_
select pg_catalog.set_config(
  'pul.test.direct_record_two_id',
  :'record_two_application_record_id',
  true
);
select * from public.withdraw_hall_of_fame_application_draft(
  pg_catalog.current_setting('pul.test.direct_batch_id')::uuid, 7, 'local batch withdrawal',
  'b0000000-0000-0000-0000-000000000014'
) \gset direct_withdraw_
select * from public.withdraw_hall_of_fame_application_draft(
  pg_catalog.current_setting('pul.test.direct_batch_id')::uuid,
  7, 'local batch withdrawal',
  'b0000000-0000-0000-0000-000000000014'
) \gset direct_withdraw_replay_
\if :direct_withdraw_replay_replayed
\else
  \echo 'batch withdrawal replay did not report replayed'
  \quit 7
\endif

do $$
begin
  begin
    perform public.set_hall_of_fame_round_snapshot(
      pg_catalog.current_setting('pul.test.direct_batch_id')::uuid,
      8, date '2026-07-31', null,
      'Local Course', 'Seoul', 'outdoor', null, 'practice', null, null,
      'b0000000-0000-0000-0000-000000000015'
    );
    raise exception 'withdrawn batch edit unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'HOF_APPLICATION_NOT_DRAFT' then raise; end if;
  end;
end;
$$;

reset role;
do $$
declare
  v_batch_status text;
  v_batch_version integer;
  v_record_status text;
  v_history_count integer;
  v_audit_count integer;
  v_ledger_count integer;
begin
  select status, version into v_batch_status, v_batch_version
  from public.hall_of_fame_application_batches
  where id = pg_catalog.current_setting('pul.test.direct_batch_id')::uuid;
  if v_batch_status <> 'withdrawn' or v_batch_version <> 8 then
    raise exception 'direct batch final mismatch: %, %', v_batch_status, v_batch_version;
  end if;
  select review_status into v_record_status
  from public.hall_of_fame_application_records
  where id = pg_catalog.current_setting('pul.test.direct_record_two_id')::uuid;
  if v_record_status <> 'withdrawn' then
    raise exception 'batch withdrawal did not withdraw draft record';
  end if;
  select count(*) into v_history_count
  from public.hall_of_fame_application_history
  where application_batch_id = pg_catalog.current_setting('pul.test.direct_batch_id')::uuid;
  if v_history_count <> 13 then
    raise exception 'direct history count mismatch: %', v_history_count;
  end if;
  select count(*) into v_audit_count
  from public.audit_logs
  where target_id in (
    pg_catalog.current_setting('pul.test.direct_batch_id'),
    pg_catalog.current_setting('pul.test.direct_record_id'),
    pg_catalog.current_setting('pul.test.direct_record_two_id')
  ) and action like 'hall_of_fame.%';
  if v_audit_count <> 8 then
    raise exception 'direct audit count mismatch: %', v_audit_count;
  end if;
  select count(*) into v_ledger_count
  from private.hall_of_fame_mutation_requests
  where actor_user_id = 'a0000000-0000-0000-0000-000000000001';
  if v_ledger_count <> 10 then
    raise exception 'direct ledger count mismatch: %', v_ledger_count;
  end if;
end;
$$;

set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claim.sub',
  'a0000000-0000-0000-0000-000000000004',
  true
);
select * from public.create_hall_of_fame_application_draft(
  'club_admin_vacancy_direct_application', pg_catalog.current_setting('pul.test.club_two_id')::uuid,
  'b0000000-0000-0000-0000-000000000020'
) \gset vacancy_
select * from public.set_hall_of_fame_round_snapshot(
  :'vacancy_application_batch_id', 1, date '2026-07-30', null,
  'Vacancy Course', 'Busan', 'screen', null, 'casual', null, null,
  'b0000000-0000-0000-0000-000000000021'
) \gset vacancy_round_
select * from public.add_hall_of_fame_application_record(
  :'vacancy_application_batch_id', 2,
  'a0000000-0000-0000-0000-000000000004',
  'c0000000-0000-0000-0000-000000000004',
  'albatross', 'B', 4, 5, 2,
  'b0000000-0000-0000-0000-000000000022'
) \gset vacancy_record_

select pg_catalog.set_config(
  'request.jwt.claim.sub',
  'a0000000-0000-0000-0000-000000000006',
  true
);
do $$
begin
  begin
    perform public.create_hall_of_fame_application_draft(
      'club_nomination', pg_catalog.current_setting('pul.test.club_one_id')::uuid,
      'b0000000-0000-0000-0000-000000000023'
    );
    raise exception 'vice nomination unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'HOF_PERMISSION_DENIED' then raise; end if;
  end;
end;
$$;

select pg_catalog.set_config(
  'request.jwt.claim.sub',
  'a0000000-0000-0000-0000-000000000007',
  true
);
do $$
begin
  begin
    perform public.create_hall_of_fame_application_draft(
      'club_nomination', pg_catalog.current_setting('pul.test.club_one_id')::uuid,
      'b0000000-0000-0000-0000-000000000024'
    );
    raise exception 'manager nomination unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'HOF_PERMISSION_DENIED' then raise; end if;
  end;
end;
$$;

select pg_catalog.set_config(
  'request.jwt.claim.sub',
  'a0000000-0000-0000-0000-000000000005',
  true
);
select * from public.create_hall_of_fame_application_draft(
  'club_nomination', pg_catalog.current_setting('pul.test.club_one_id')::uuid,
  'b0000000-0000-0000-0000-000000000030'
) \gset nomination_
select pg_catalog.set_config(
  'pul.test.hof_nomination_batch',
  :'nomination_application_batch_id',
  true
);
select * from public.set_hall_of_fame_round_snapshot(
  pg_catalog.current_setting('pul.test.hof_nomination_batch')::uuid, 1, date '2026-07-29', null,
  'Nomination Course', 'Incheon', 'outdoor', null, 'club_event',
  'Local Event', null,
  'b0000000-0000-0000-0000-000000000031'
) \gset nomination_round_

do $$
begin
  begin
    perform public.add_hall_of_fame_application_record(
      pg_catalog.current_setting('pul.test.hof_nomination_batch')::uuid,
      2,
      'a0000000-0000-0000-0000-000000000004',
      'c0000000-0000-0000-0000-000000000004',
      'hole_in_one', 'X', 1, 3, 1,
      'd0000000-0000-0000-0000-000000000001'
    );
    raise exception 'other-club target unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'HOF_TARGET_CLUB_MISMATCH' then raise; end if;
  end;
  begin
    perform public.add_hall_of_fame_application_record(
      pg_catalog.current_setting('pul.test.hof_nomination_batch')::uuid,
      2,
      'a0000000-0000-0000-0000-000000000003',
      'c0000000-0000-0000-0000-000000000003',
      'hole_in_one', 'X', 2, 3, 1,
      'd0000000-0000-0000-0000-000000000002'
    );
    raise exception 'suspended target unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'HOF_TARGET_NOT_ACTIVE_MEMBER' then raise; end if;
  end;
  begin
    perform public.add_hall_of_fame_application_record(
      pg_catalog.current_setting('pul.test.hof_nomination_batch')::uuid,
      2,
      'a0000000-0000-0000-0000-000000000002',
      'c0000000-0000-0000-0000-000000000002',
      'hole_in_one', 'X', 3, 3, 1,
      'd0000000-0000-0000-0000-000000000003'
    );
    raise exception 'left target unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'HOF_TARGET_NOT_ACTIVE_MEMBER' then raise; end if;
  end;
  begin
    perform public.add_hall_of_fame_application_record(
      pg_catalog.current_setting('pul.test.hof_nomination_batch')::uuid,
      2,
      'a0000000-0000-0000-0000-000000000008',
      null,
      'hole_in_one', 'X', 4, 3, 1,
      'd0000000-0000-0000-0000-000000000004'
    );
    raise exception 'inactive target unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'HOF_TARGET_NOT_ACTIVE_MEMBER' then raise; end if;
  end;
  begin
    perform public.add_hall_of_fame_application_record(
      pg_catalog.current_setting('pul.test.hof_nomination_batch')::uuid,
      2,
      'a1000000-0000-0000-0000-000000000001',
      'c1000000-0000-0000-0000-000000000002',
      'hole_in_one', 'X', 5, 3, 1,
      'd0000000-0000-0000-0000-000000000005'
    );
    raise exception 'membership/user mismatch unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'HOF_TARGET_NOT_ACTIVE_MEMBER' then raise; end if;
  end;
end;
$$;

do $$
declare
  v_batch_id uuid := pg_catalog.current_setting(
    'pul.test.hof_nomination_batch'
  )::uuid;
  v_result record;
  v_target_user_id uuid;
  v_target_membership_id uuid;
  v_request_id uuid;
begin
  for i in 1..19 loop
    v_target_user_id := (
      'a1000000-0000-0000-0000-' || pg_catalog.lpad(i::text, 12, '0')
    )::uuid;
    v_target_membership_id := (
      'c1000000-0000-0000-0000-' || pg_catalog.lpad(i::text, 12, '0')
    )::uuid;
    v_request_id := (
      'd1000000-0000-0000-0000-' || pg_catalog.lpad(i::text, 12, '0')
    )::uuid;
    select * into v_result
    from public.add_hall_of_fame_application_record(
      v_batch_id,
      i + 1,
      v_target_user_id,
      v_target_membership_id,
      'hole_in_one',
      'A',
      i,
      3,
      1,
      v_request_id
    );
    if v_result.batch_version <> i + 2 then
      raise exception 'nomination version mismatch at %', i;
    end if;
  end loop;

  begin
    perform public.add_hall_of_fame_application_record(
      v_batch_id,
      21,
      'a1000000-0000-0000-0000-000000000001',
      'c1000000-0000-0000-0000-000000000001',
      'hole_in_one',
      'A',
      1,
      3,
      1,
      'd2000000-0000-0000-0000-000000000001'
    );
    raise exception 'duplicate record unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'HOF_DUPLICATE_RECORD' then raise; end if;
  end;

  select * into v_result
  from public.add_hall_of_fame_application_record(
    v_batch_id,
    21,
    'a0000000-0000-0000-0000-000000000005',
    'c0000000-0000-0000-0000-000000000005',
    'hole_in_one',
    'A',
    20,
    3,
    1,
    'd1000000-0000-0000-0000-000000000020'
  );
  if v_result.batch_version <> 22 then
    raise exception 'self nomination version mismatch';
  end if;

  begin
    perform public.add_hall_of_fame_application_record(
      v_batch_id,
      22,
      'a1000000-0000-0000-0000-000000000021',
      'c1000000-0000-0000-0000-000000000021',
      'hole_in_one',
      'A',
      21,
      3,
      1,
      'd1000000-0000-0000-0000-000000000021'
    );
    raise exception 'twenty-first target unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'HOF_RECORD_LIMIT_EXCEEDED' then raise; end if;
  end;
end;
$$;

reset role;
do $$
declare
  v_count integer;
  v_conflict boolean;
  v_verification text;
begin
  select count(distinct target_user_id) into v_count
  from public.hall_of_fame_application_records
  where application_batch_id = pg_catalog.current_setting('pul.test.hof_nomination_batch')::uuid;
  if v_count <> 20 then
    raise exception 'nomination target count mismatch: %', v_count;
  end if;
  select conflict_of_interest, club_verification_status
    into v_conflict, v_verification
  from public.hall_of_fame_application_records
  where application_batch_id = pg_catalog.current_setting('pul.test.hof_nomination_batch')::uuid
    and target_user_id = 'a0000000-0000-0000-0000-000000000005';
  if not v_conflict or v_verification <> 'conflict_review_required' then
    raise exception 'self nomination conflict contract mismatch';
  end if;
  if exists (
    select 1
    from public.hall_of_fame_application_records
    where application_batch_id = pg_catalog.current_setting('pul.test.hof_nomination_batch')::uuid
      and target_user_id <> 'a0000000-0000-0000-0000-000000000005'
      and (
        conflict_of_interest
        or club_verification_status <> 'pending'
      )
  ) then
    raise exception 'other nomination verification contract mismatch';
  end if;
  if exists (
    select 1
    from public.hall_of_fame_application_records
    where pg_catalog.octet_length(duplicate_fingerprint) <> 32
  ) then
    raise exception 'server fingerprint length mismatch';
  end if;
end;
$$;

set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claim.sub',
  'a0000000-0000-0000-0000-000000000001',
  true
);
do $$
begin
  begin
    insert into public.hall_of_fame_application_batches (
      application_type, created_by_user_id
    ) values (
      'direct_application',
      'a0000000-0000-0000-0000-000000000001'
    );
    raise exception 'direct batch insert unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.hall_of_fame_application_records
    set strokes = 2
    where id = pg_catalog.current_setting('pul.test.direct_record_id')::uuid;
    raise exception 'direct record update unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.hall_of_fame_round_snapshots (
      application_batch_id, played_on, course_name_snapshot,
      course_region_snapshot, course_environment, round_type
    ) values (
      pg_catalog.current_setting('pul.test.direct_batch_id')::uuid,
      date '2026-08-03', 'Forbidden Course', 'Seoul', 'outdoor', 'practice'
    );
    raise exception 'direct round insert unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.audit_logs (
      actor_id, actor_type, action, target_type
    ) values (
      'a0000000-0000-0000-0000-000000000001',
      'user', 'hall_of_fame.invalid', 'hall_of_fame_application_batch'
    );
    raise exception 'direct audit insert unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    select count(*) from private.hall_of_fame_mutation_requests;
    raise exception 'private ledger read unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.hall_of_fame_application_history (
      scope, application_batch_id, from_status, to_status, version,
      actor_user_id, action, request_id
    ) values (
      'batch', pg_catalog.current_setting('pul.test.direct_batch_id')::uuid, 'withdrawn', 'withdrawn', 99,
      'a0000000-0000-0000-0000-000000000001',
      'hall_of_fame.invalid',
      'e0000000-0000-0000-0000-000000000001'
    );
    raise exception 'direct history insert unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
do $$
begin
  begin
    update public.hall_of_fame_application_history
    set reason = 'forbidden'
    where application_batch_id = pg_catalog.current_setting('pul.test.direct_batch_id')::uuid;
    raise exception 'append-only history update unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'HOF_APPEND_ONLY_MUTATION_FORBIDDEN' then raise; end if;
  end;

  if pg_catalog.has_function_privilege(
    'anon',
    'public.create_hall_of_fame_application_draft(text,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'anon execute unexpectedly granted';
  end if;
  if not pg_catalog.has_function_privilege(
    'authenticated',
    'public.create_hall_of_fame_application_draft(text,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'authenticated execute missing';
  end if;
  if pg_catalog.has_function_privilege(
    'service_role',
    'public.create_hall_of_fame_application_draft(text,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'service_role execute unexpectedly granted';
  end if;
end;
$$;

select 'HOF_APPLICATION_RPC_E2E_PASS';
rollback;
`;

test(
  "executes eligibility, draft, round, record, replay, stale, ACL, and rollback scenarios locally",
  { timeout: 120_000 },
  () => {
    const container = findLocalDatabaseContainer();
    const result = spawnSync(
      "docker",
      [
        "exec",
        "-i",
        container,
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-X",
        "-q",
      ],
      {
        encoding: "utf8",
        input: sql,
        maxBuffer: 8 * 1024 * 1024,
      },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /HOF_APPLICATION_RPC_E2E_PASS/);
  },
);

function psqlArgs(container) {
  return [
    "exec",
    "-i",
    container,
    "psql",
    "-X",
    "-qAt",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "postgres",
    "-d",
    "postgres",
  ];
}

function runLocalSql(container, statement) {
  const result = spawnSync("docker", psqlArgs(container), {
    encoding: "utf8",
    input: statement,
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function runLocalSqlAsync(container, statement) {
  return new Promise((resolve, reject) => {
    const child = trackPsqlChild(
      spawn("docker", psqlArgs(container), {
        stdio: ["pipe", "pipe", "pipe"],
      }),
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(statement);
  });
}

class InteractivePsql {
  constructor(container) {
    this.child = trackPsqlChild(
      spawn("docker", psqlArgs(container), {
        stdio: ["pipe", "pipe", "pipe"],
      }),
    );
    this.stdout = "";
    this.stderr = "";
    this.closed = false;
    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => {
      this.stdout += chunk;
    });
    this.child.stderr.on("data", (chunk) => {
      this.stderr += chunk;
    });
    this.child.once("close", () => {
      this.closed = true;
    });
  }

  async command(statement, marker) {
    const start = this.stdout.length;
    this.child.stdin.write(`${statement}\nselect '${marker}';\n`);
    for (let attempt = 0; attempt < 400; attempt += 1) {
      if (this.stdout.slice(start).includes(marker)) return;
      if (this.closed) {
        throw new Error(this.stderr || `psql closed before ${marker}`);
      }
      await delay(25);
    }
    throw new Error(`timed out waiting for ${marker}: ${this.stderr}`);
  }

  async close() {
    if (this.closed) return;
    this.child.stdin.end("\\q\n");
    for (let attempt = 0; attempt < 200 && !this.closed; attempt += 1) {
      await delay(10);
    }
    if (!this.closed) this.child.kill();
  }
}

async function waitForActivePsqlChildrenToClose() {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (activePsqlChildren.size === 0) return;
    await delay(10);
  }
  throw new Error(
    `${activePsqlChildren.size} HOF psql child process(es) remained active`,
  );
}

function assertExactDatabaseError(result, expectedMessage) {
  assert.notEqual(result.code, 0, `${expectedMessage} unexpectedly succeeded`);
  const messages = `${result.stderr}\n${result.stdout}`
    .split(/\r?\n/)
    .filter((line) => /^ERROR:\s+/.test(line))
    .map((line) => line.replace(/^ERROR:\s+/, "").trim());
  assert.deepEqual(messages, [expectedMessage]);
}

function authenticatedStatement(actorId, applicationName, statement) {
  return `
set application_name = '${applicationName}';
set role authenticated;
select pg_catalog.set_config('request.jwt.claim.sub', '${actorId}', false);
${statement}
`;
}

async function waitForLockWait(container, applicationName, expectedCount = 1) {
  const query = `
select pg_catalog.count(*)
from pg_catalog.pg_stat_activity
where application_name like '${applicationName}%'
  and wait_event_type = 'Lock';
`;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (Number(runLocalSql(container, query)) === expectedCount) return;
    await delay(25);
  }
  throw new Error(`${applicationName} did not reach the deterministic lock barrier`);
}

async function runAuthorizationRace({
  container,
  label,
  actorId,
  blockerSql,
  rpcSql,
  expectedError,
}) {
  const blocker = new InteractivePsql(container);
  const blockerName = `hof_${label}_blocker`;
  const rpcName = `hof_${label}_rpc`;
  let rpc = null;
  try {
    await blocker.command(
      `set application_name = '${blockerName}';
begin;
set local session_replication_role = replica;
${blockerSql}`,
      `${label}_BLOCKER_READY`,
    );
    rpc = runLocalSqlAsync(
      container,
      authenticatedStatement(actorId, rpcName, rpcSql),
    );
    await waitForLockWait(container, rpcName);
    await blocker.command("commit;", `${label}_BLOCKER_COMMITTED`);
    const result = await rpc;
    assert.notEqual(result.code, 0, `${label} unexpectedly succeeded`);
    assert.match(
      `${result.stderr}\n${result.stdout}`,
      expectedError,
      `${label} returned the wrong rejection`,
    );
  } finally {
    await blocker.close();
    if (rpc) await Promise.allSettled([rpc]);
  }
}

async function runGatedPair({ container, label, gateSql, firstSql, secondSql }) {
  const gate = new InteractivePsql(container);
  const prefix = `hof_${label}`;
  let first = null;
  let second = null;
  try {
    await gate.command(
      `set application_name = '${prefix}_gate';\nbegin;\n${gateSql}`,
      `${label}_GATE_READY`,
    );
    first = runLocalSqlAsync(container, firstSql(`${prefix}_first`));
    await waitForLockWait(container, prefix, 1);
    second = runLocalSqlAsync(container, secondSql(`${prefix}_second`));
    await waitForLockWait(container, prefix, 2);
    await gate.command("commit;", `${label}_GATE_RELEASED`);
    return await Promise.all([first, second]);
  } finally {
    await gate.close();
    const pending = [first, second].filter(Boolean);
    if (pending.length > 0) await Promise.allSettled(pending);
  }
}

function assertOneSuccess(results, expectedFailure) {
  const successes = results.filter((result) => result.code === 0);
  const failures = results.filter((result) => result.code !== 0);
  assert.equal(successes.length, 1, JSON.stringify(results));
  assert.equal(failures.length, 1, JSON.stringify(results));
  assert.match(`${failures[0].stderr}\n${failures[0].stdout}`, expectedFailure);
}

function countLocalRows(container, query) {
  return Number(runLocalSql(container, query));
}

function assertFailedRequestRolledBack(container, requestId) {
  assert.equal(
    countLocalRows(
      container,
      `select count(*) from public.hall_of_fame_application_history where request_id = '${requestId}';`,
    ),
    0,
    `${requestId} must not leave application history`,
  );
  assert.equal(
    countLocalRows(
      container,
      `select count(*) from public.audit_logs where request_id = '${requestId}';`,
    ),
    0,
    `${requestId} must not leave audit rows`,
  );
  assert.equal(
    countLocalRows(
      container,
      `select count(*) from private.hall_of_fame_mutation_requests where request_id = '${requestId}';`,
    ),
    0,
    `${requestId} must not leave a partial ledger claim`,
  );
}

function assertFailedDraftRaceRolledBack(
  container,
  { actorId, applicationType, contextClubId, requestId },
) {
  const contextPredicate = contextClubId
    ? `and coalesce(batch.nominating_club_id, batch.vacancy_context_club_id) = '${contextClubId}'`
    : "and batch.nominating_club_id is null and batch.vacancy_context_club_id is null";
  assert.equal(
    countLocalRows(
      container,
      `select count(*) from public.hall_of_fame_application_batches as batch
       where batch.created_by_user_id = '${actorId}'
         and batch.application_type = '${applicationType}'
         ${contextPredicate};`,
    ),
    0,
    `${requestId} must not create a partial draft`,
  );
  assertFailedRequestRolledBack(container, requestId);
}

function assertConcurrentFixturesClean(container) {
  const checks = [
    ["HOF batch", "select count(*) from public.hall_of_fame_application_batches"],
    ["round snapshot", "select count(*) from public.hall_of_fame_round_snapshots"],
    ["application record", "select count(*) from public.hall_of_fame_application_records"],
    ["application history", "select count(*) from public.hall_of_fame_application_history"],
    ["audit", "select count(*) from public.audit_logs where actor_id::text like 'aa600000-%'"],
    ["mutation ledger", "select count(*) from private.hall_of_fame_mutation_requests"],
    ["role assignment", "select count(*) from public.club_role_assignments where membership_id::text like 'cc600000-%' or membership_id::text like 'cb600000-%'"],
    ["membership", "select count(*) from public.club_memberships where user_id::text like 'aa600000-%' or user_id::text like 'ab600000-%'"],
    ["account", "select count(*) from public.user_accounts where id::text like 'aa600000-%' or id::text like 'ab600000-%'"],
    ["auth user", "select count(*) from auth.users where id::text like 'aa600000-%' or id::text like 'ab600000-%'"],
    ["club state", "select count(*) from public.clubs where legacy_key = '4' and club_status <> 'active'"],
    ["Storage object", "select count(*) from storage.objects where bucket_id = 'hall-of-fame-evidence'"],
  ];

  for (const [label, query] of checks) {
    assert.equal(
      countLocalRows(container, `${query};`),
      0,
      `${label} concurrency fixture must be fully restored`,
    );
  }
}

function assertNoTrackedPsqlChildren() {
  assert.equal(
    activePsqlChildren.size,
    0,
    "HOF concurrency test must not retain child psql processes",
  );
}

function assertNoConcurrentDatabaseSessions(container) {
  assert.equal(
    countLocalRows(
      container,
      "select count(*) from pg_catalog.pg_stat_activity where application_name like 'hof_%';",
    ),
    0,
    "HOF concurrency test must not retain blocker or RPC database sessions",
  );
}

const concurrentFixtureUsers = String.raw`
  'aa600000-0000-0000-0000-000000000001'::uuid,
  'aa600000-0000-0000-0000-000000000002'::uuid,
  'aa600000-0000-0000-0000-000000000003'::uuid,
  'aa600000-0000-0000-0000-000000000004'::uuid,
  'aa600000-0000-0000-0000-000000000005'::uuid,
  'aa600000-0000-0000-0000-000000000006'::uuid
`;

function labeledError(label, error) {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`${label}: ${message}`, { cause: error });
}

async function captureCleanupStep(errors, label, callback) {
  try {
    await callback();
  } catch (error) {
    errors.push(labeledError(label, error));
  }
}

function throwCollectedErrors(errors, message) {
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, message);
}

function cleanupConcurrentFixtures(container) {
  const fixtureBatches = `(select id from public.hall_of_fame_application_batches where created_by_user_id in (${concurrentFixtureUsers}))`;
  const fixtureMemberships = `(select id from public.club_memberships where user_id in (${concurrentFixtureUsers}) or user_id::text like 'ab600000-%')`;
  const steps = [
    ["application history", `delete from public.hall_of_fame_application_history where actor_user_id in (${concurrentFixtureUsers}) or application_batch_id in ${fixtureBatches};`],
    ["audit", `delete from public.audit_logs where actor_id in (${concurrentFixtureUsers});`],
    ["mutation ledger", `delete from private.hall_of_fame_mutation_requests where actor_user_id in (${concurrentFixtureUsers});`],
    ["application records", `delete from public.hall_of_fame_application_records where application_batch_id in ${fixtureBatches};`],
    ["round snapshots", `delete from public.hall_of_fame_round_snapshots where application_batch_id in ${fixtureBatches};`],
    ["application batches", `delete from public.hall_of_fame_application_batches where created_by_user_id in (${concurrentFixtureUsers});`],
    ["Storage objects", "delete from storage.objects where bucket_id = 'hall-of-fame-evidence';"],
    ["role assignments", `delete from public.club_role_assignments where membership_id in ${fixtureMemberships};`],
    ["memberships", `delete from public.club_memberships where user_id in (${concurrentFixtureUsers}) or user_id::text like 'ab600000-%';`],
    ["accounts", `delete from public.user_accounts where id in (${concurrentFixtureUsers}) or id::text like 'ab600000-%';`],
    ["auth users", `delete from auth.users where id in (${concurrentFixtureUsers}) or id::text like 'ab600000-%';`],
    ["club state", "update public.clubs set club_status = 'active' where legacy_key = '4' and club_status <> 'active';"],
  ];
  const errors = [];

  for (const [label, statement] of steps) {
    try {
      runLocalSql(
        container,
        `set session_replication_role = replica;\n${statement}\nset session_replication_role = origin;`,
      );
    } catch (error) {
      errors.push(labeledError(`cleanup ${label}`, error));
    }
  }

  throwCollectedErrors(errors, "Multiple HOF fixture cleanup steps failed");
}

function lastOutputLine(output) {
  return output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1);
}

function sqlLiteral(value) {
  if (value === null) return "null::text";
  assert.equal(typeof value, "string");
  return `'${value.replaceAll("'", "''")}'`;
}

function roundSnapshotFingerprint(
  container,
  applicationBatchId,
  expectedBatchVersion,
  payload,
) {
  return runLocalSql(
    container,
    `select pg_catalog.encode(extensions.digest(
      pg_catalog.convert_to(pg_catalog.jsonb_build_object(
        'operation', 'hall_of_fame.round_snapshot.set',
        'application_batch_id', '${applicationBatchId}'::uuid,
        'expected_batch_version', ${expectedBatchVersion},
        'played_on', date ${sqlLiteral(payload.playedOn)},
        'started_at', ${payload.startedAt === null ? "null::timestamptz" : `timestamptz ${sqlLiteral(payload.startedAt)}`},
        'course_name', ${sqlLiteral(payload.courseName)},
        'course_region', ${sqlLiteral(payload.courseRegion)},
        'course_environment', ${sqlLiteral(payload.courseEnvironment)},
        'course_layout', ${sqlLiteral(payload.courseLayout)},
        'round_type', ${sqlLiteral(payload.roundType)},
        'event_name', ${sqlLiteral(payload.eventName)},
        'notes', ${sqlLiteral(payload.notes)}
      )::text, 'UTF8'), 'sha256'), 'hex');`,
  );
}

function recordUpdateFingerprint(
  container,
  applicationBatchId,
  applicationRecordId,
  expectedBatchVersion,
  expectedRecordVersion,
  payload,
) {
  return runLocalSql(
    container,
    `select pg_catalog.encode(extensions.digest(
      pg_catalog.convert_to(pg_catalog.jsonb_build_object(
        'operation', 'hall_of_fame.application_record.update',
        'application_record_id', '${applicationRecordId}'::uuid,
        'application_batch_id', '${applicationBatchId}'::uuid,
        'expected_record_version', ${expectedRecordVersion},
        'expected_batch_version', ${expectedBatchVersion},
        'record_type_code', ${sqlLiteral(payload.recordType)},
        'course_segment', ${sqlLiteral(payload.courseSegment)},
        'hole_number', ${payload.holeNumber},
        'hole_par', ${payload.holePar},
        'strokes', ${payload.strokes}
      )::text, 'UTF8'), 'sha256'), 'hex');`,
  );
}

function draftWithdrawFingerprint(
  container,
  applicationBatchId,
  expectedBatchVersion,
  reason,
) {
  return runLocalSql(
    container,
    `select pg_catalog.encode(extensions.digest(
      pg_catalog.convert_to(pg_catalog.jsonb_build_object(
        'operation', 'hall_of_fame.application_draft.withdraw',
        'application_batch_id', '${applicationBatchId}'::uuid,
        'expected_batch_version', ${expectedBatchVersion},
        'reason', ${sqlLiteral(reason.trim())}
      )::text, 'UTF8'), 'sha256'), 'hex');`,
  );
}

function completedLedgerRows(container, requestIds) {
  return JSON.parse(
    runLocalSql(
      container,
      `select coalesce(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'requestId', ledger.request_id,
          'actorUserId', ledger.actor_user_id,
          'operation', ledger.operation,
          'applicationBatchId', ledger.application_batch_id,
          'applicationRecordId', ledger.application_record_id,
          'targetUserId', ledger.target_user_id,
          'payloadFingerprint', pg_catalog.encode(ledger.payload_fingerprint, 'hex'),
          'status', ledger.status,
          'resultPayload', ledger.result_payload
        )
        order by ledger.request_id
      ), '[]'::jsonb)::text
      from private.hall_of_fame_mutation_requests as ledger
      where ledger.request_id in ${requestIds}
        and ledger.status = 'completed';`,
    ),
  );
}

test(
  "serializes HOF authorization and mutation races across independent connections",
  { timeout: 120_000 },
  async () => {
    const container = findLocalDatabaseContainer();
    cleanupConcurrentFixtures(container);
    let testError = null;
    const cleanupErrors = [];
    try {
      runLocalSql(
        container,
        String.raw`
set session_replication_role = replica;
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
)
select id, '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated', 'authenticated', email, '', pg_catalog.now(),
  pg_catalog.now(), pg_catalog.now()
from (values
  ('aa600000-0000-0000-0000-000000000001'::uuid, 'hof-race-direct@example.invalid'),
  ('aa600000-0000-0000-0000-000000000002'::uuid, 'hof-race-vacancy@example.invalid'),
  ('aa600000-0000-0000-0000-000000000003'::uuid, 'hof-race-admin@example.invalid'),
  ('aa600000-0000-0000-0000-000000000004'::uuid, 'hof-race-target@example.invalid'),
  ('aa600000-0000-0000-0000-000000000005'::uuid, 'hof-race-new-admin@example.invalid'),
  ('aa600000-0000-0000-0000-000000000006'::uuid, 'hof-race-open@example.invalid')
) as fixture(id, email);
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
)
select
  ('ab600000-0000-0000-0000-' || pg_catalog.lpad(i::text, 12, '0'))::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated', 'authenticated',
  'hof-race-limit-' || i::text || '@example.invalid', '',
  pg_catalog.now(), pg_catalog.now(), pg_catalog.now()
from pg_catalog.generate_series(1, 21) as series(i);
insert into public.user_accounts (id, account_status)
select id, 'active'
from auth.users
where id in (${concurrentFixtureUsers})
   or id::text like 'ab600000-%';
insert into public.club_memberships (
  id, club_id, user_id, membership_status, joined_at
) values
  ('cc600000-0000-0000-0000-000000000002', (select id from public.clubs where legacy_key = '2'), 'aa600000-0000-0000-0000-000000000002', 'active', pg_catalog.now()),
  ('cc600000-0000-0000-0000-000000000006', (select id from public.clubs where legacy_key = '3'), 'aa600000-0000-0000-0000-000000000002', 'active', pg_catalog.now()),
  ('cc600000-0000-0000-0000-000000000003', (select id from public.clubs where legacy_key = '1'), 'aa600000-0000-0000-0000-000000000003', 'active', pg_catalog.now()),
  ('cc600000-0000-0000-0000-000000000004', (select id from public.clubs where legacy_key = '1'), 'aa600000-0000-0000-0000-000000000004', 'active', pg_catalog.now()),
  ('cc600000-0000-0000-0000-000000000007', (select id from public.clubs where legacy_key = '4'), 'aa600000-0000-0000-0000-000000000003', 'active', pg_catalog.now());
insert into public.club_memberships (
  id, club_id, user_id, membership_status, joined_at
)
select
  ('cb600000-0000-0000-0000-' || pg_catalog.lpad(i::text, 12, '0'))::uuid,
  (select id from public.clubs where legacy_key = '1'),
  ('ab600000-0000-0000-0000-' || pg_catalog.lpad(i::text, 12, '0'))::uuid,
  'active', pg_catalog.now()
from pg_catalog.generate_series(1, 21) as series(i);
insert into public.club_role_assignments (id, membership_id, role_code, assigned_by)
values
  ('dd600000-0000-0000-0000-000000000001', 'cc600000-0000-0000-0000-000000000003', 'club_member', 'aa600000-0000-0000-0000-000000000003'),
  ('dd600000-0000-0000-0000-000000000002', 'cc600000-0000-0000-0000-000000000003', 'club_admin', 'aa600000-0000-0000-0000-000000000003'),
  ('dd600000-0000-0000-0000-000000000003', 'cc600000-0000-0000-0000-000000000004', 'club_member', 'aa600000-0000-0000-0000-000000000003'),
  ('dd600000-0000-0000-0000-000000000004', 'cc600000-0000-0000-0000-000000000007', 'club_member', 'aa600000-0000-0000-0000-000000000003'),
  ('dd600000-0000-0000-0000-000000000005', 'cc600000-0000-0000-0000-000000000007', 'club_admin', 'aa600000-0000-0000-0000-000000000003');
insert into public.club_role_assignments (membership_id, role_code, assigned_by)
select
  ('cb600000-0000-0000-0000-' || pg_catalog.lpad(i::text, 12, '0'))::uuid,
  'club_member', 'aa600000-0000-0000-0000-000000000003'::uuid
from pg_catalog.generate_series(1, 21) as series(i);
set session_replication_role = origin;
`,
      );

      const clubOne = lastOutputLine(
        runLocalSql(container, "select id from public.clubs where legacy_key = '1';"),
      );
      const clubTwo = lastOutputLine(
        runLocalSql(container, "select id from public.clubs where legacy_key = '2';"),
      );
      const clubThree = lastOutputLine(
        runLocalSql(container, "select id from public.clubs where legacy_key = '3';"),
      );
      const clubFour = lastOutputLine(
        runLocalSql(container, "select id from public.clubs where legacy_key = '4';"),
      );

      const nominationBatch = lastOutputLine(
        runLocalSql(
          container,
          authenticatedStatement(
            "aa600000-0000-0000-0000-000000000003",
            "hof_setup_nomination",
            `select application_batch_id from public.create_hall_of_fame_application_draft(
  'club_nomination', '${clubOne}',
  'e1000000-0000-0000-0000-000000000003'
);`,
          ),
        ),
      );
      runLocalSql(
        container,
        authenticatedStatement(
          "aa600000-0000-0000-0000-000000000003",
          "hof_setup_nomination_round",
          `select * from public.set_hall_of_fame_round_snapshot(
  '${nominationBatch}', 1, date '2026-08-01', null,
  'Race Course', 'Seoul', 'outdoor', null, 'club_event', null, null,
  'e1000000-0000-0000-0000-000000000004'
);`,
        ),
      );

      await runAuthorizationRace({
        container,
        label: "membership_suspend",
        actorId: "aa600000-0000-0000-0000-000000000003",
        blockerSql: "update public.club_memberships set membership_status = 'suspended', suspended_at = pg_catalog.now() where id = 'cc600000-0000-0000-0000-000000000003';",
        rpcSql: `select * from public.set_hall_of_fame_round_snapshot(
  '${nominationBatch}', 2, date '2026-08-02', null,
  'Race Course', 'Seoul', 'outdoor', null, 'practice', null, null,
  'e2000000-0000-0000-0000-000000000001'
);`,
        expectedError: /HOF_PERMISSION_DENIED/,
      });
      assertFailedRequestRolledBack(
        container,
        "e2000000-0000-0000-0000-000000000001",
      );
      assert.equal(
        runLocalSql(container, "select membership_status from public.club_memberships where id = 'cc600000-0000-0000-0000-000000000003';"),
        "suspended",
      );
      runLocalSql(container, "set session_replication_role = replica; update public.club_memberships set membership_status = 'active', suspended_at = null where id = 'cc600000-0000-0000-0000-000000000003'; set session_replication_role = origin;");

      await runAuthorizationRace({
        container,
        label: "role_revoke_add",
        actorId: "aa600000-0000-0000-0000-000000000003",
        blockerSql: "update public.club_role_assignments set revoked_at = pg_catalog.now() where id = 'dd600000-0000-0000-0000-000000000002';",
        rpcSql: `select * from public.add_hall_of_fame_application_record(
  '${nominationBatch}', 2,
  'ab600000-0000-0000-0000-000000000001',
  'cb600000-0000-0000-0000-000000000001',
  'hole_in_one', 'a', 1, 3, 1,
  'e2000000-0000-0000-0000-000000000002'
);`,
        expectedError: /HOF_PERMISSION_DENIED/,
      });
      assertFailedRequestRolledBack(
        container,
        "e2000000-0000-0000-0000-000000000002",
      );
      assert.equal(
        countLocalRows(container, "select count(*) from public.club_role_assignments where id = 'dd600000-0000-0000-0000-000000000002' and revoked_at is not null;"),
        1,
      );
      runLocalSql(container, "set session_replication_role = replica; update public.club_role_assignments set revoked_at = null where id = 'dd600000-0000-0000-0000-000000000002'; set session_replication_role = origin;");

      await runAuthorizationRace({
        container,
        label: "role_revoke_withdraw",
        actorId: "aa600000-0000-0000-0000-000000000003",
        blockerSql: "update public.club_role_assignments set revoked_at = pg_catalog.now() where id = 'dd600000-0000-0000-0000-000000000002';",
        rpcSql: `select * from public.withdraw_hall_of_fame_application_draft(
  '${nominationBatch}', 2, 'race rejection check',
  'e2000000-0000-0000-0000-000000000003'
);`,
        expectedError: /HOF_PERMISSION_DENIED/,
      });
      assertFailedRequestRolledBack(
        container,
        "e2000000-0000-0000-0000-000000000003",
      );
      assert.equal(
        countLocalRows(container, "select count(*) from public.club_role_assignments where id = 'dd600000-0000-0000-0000-000000000002' and revoked_at is not null;"),
        1,
      );
      runLocalSql(container, "set session_replication_role = replica; update public.club_role_assignments set revoked_at = null where id = 'dd600000-0000-0000-0000-000000000002'; set session_replication_role = origin;");
      await runAuthorizationRace({
        container,
        label: "direct_activation",
        actorId: "aa600000-0000-0000-0000-000000000001",
        blockerSql: `insert into public.club_memberships (id, club_id, user_id, membership_status, joined_at)
values ('cc600000-0000-0000-0000-000000000001', '${clubOne}', 'aa600000-0000-0000-0000-000000000001', 'active', pg_catalog.now());`,
        rpcSql: `select * from public.create_hall_of_fame_application_draft(
  'direct_application', null,
  'e2000000-0000-0000-0000-000000000004'
);`,
        expectedError: /HOF_CLUB_NOMINATION_REQUIRED/,
      });
      assertFailedDraftRaceRolledBack(container, {
        actorId: "aa600000-0000-0000-0000-000000000001",
        applicationType: "direct_application",
        contextClubId: null,
        requestId: "e2000000-0000-0000-0000-000000000004",
      });
      assert.equal(
        runLocalSql(container, "select membership_status from public.club_memberships where id = 'cc600000-0000-0000-0000-000000000001';"),
        "active",
      );
      runLocalSql(container, "set session_replication_role = replica; delete from public.club_memberships where id = 'cc600000-0000-0000-0000-000000000001'; set session_replication_role = origin;");

      await runAuthorizationRace({
        container,
        label: "direct_suspension",
        actorId: "aa600000-0000-0000-0000-000000000001",
        blockerSql: `insert into public.club_memberships (
  id, club_id, user_id, membership_status, joined_at, suspended_at
) values (
  'cc600000-0000-0000-0000-000000000001', '${clubOne}',
  'aa600000-0000-0000-0000-000000000001', 'suspended',
  pg_catalog.now(), pg_catalog.now()
);`,
        rpcSql: `select * from public.create_hall_of_fame_application_draft(
  'direct_application', null,
  'e2000000-0000-0000-0000-000000000007'
);`,
        expectedError: /HOF_DIRECT_APPLICATION_NOT_ALLOWED/,
      });
      assertFailedDraftRaceRolledBack(container, {
        actorId: "aa600000-0000-0000-0000-000000000001",
        applicationType: "direct_application",
        contextClubId: null,
        requestId: "e2000000-0000-0000-0000-000000000007",
      });
      assert.equal(
        runLocalSql(container, "select membership_status from public.club_memberships where id = 'cc600000-0000-0000-0000-000000000001';"),
        "suspended",
      );
      runLocalSql(container, "set session_replication_role = replica; delete from public.club_memberships where id = 'cc600000-0000-0000-0000-000000000001'; set session_replication_role = origin;");

      await runAuthorizationRace({
        container,
        label: "nomination_draft_membership_suspend",
        actorId: "aa600000-0000-0000-0000-000000000003",
        blockerSql: "update public.club_memberships set membership_status = 'suspended', suspended_at = pg_catalog.now() where id = 'cc600000-0000-0000-0000-000000000007';",
        rpcSql: `select * from public.create_hall_of_fame_application_draft(
  'club_nomination', '${clubFour}',
  'e2000000-0000-0000-0000-000000000008'
);`,
        expectedError: /HOF_PERMISSION_DENIED/,
      });
      assertFailedDraftRaceRolledBack(container, {
        actorId: "aa600000-0000-0000-0000-000000000003",
        applicationType: "club_nomination",
        contextClubId: clubFour,
        requestId: "e2000000-0000-0000-0000-000000000008",
      });
      assert.equal(
        runLocalSql(container, "select membership_status from public.club_memberships where id = 'cc600000-0000-0000-0000-000000000007';"),
        "suspended",
      );
      runLocalSql(container, "set session_replication_role = replica; update public.club_memberships set membership_status = 'active', suspended_at = null where id = 'cc600000-0000-0000-0000-000000000007'; set session_replication_role = origin;");

      await runAuthorizationRace({
        container,
        label: "nomination_draft_role_revoke",
        actorId: "aa600000-0000-0000-0000-000000000003",
        blockerSql: "update public.club_role_assignments set revoked_at = pg_catalog.now() where id = 'dd600000-0000-0000-0000-000000000005';",
        rpcSql: `select * from public.create_hall_of_fame_application_draft(
  'club_nomination', '${clubFour}',
  'e2000000-0000-0000-0000-000000000009'
);`,
        expectedError: /HOF_PERMISSION_DENIED/,
      });
      assertFailedDraftRaceRolledBack(container, {
        actorId: "aa600000-0000-0000-0000-000000000003",
        applicationType: "club_nomination",
        contextClubId: clubFour,
        requestId: "e2000000-0000-0000-0000-000000000009",
      });
      assert.equal(
        countLocalRows(container, "select count(*) from public.club_role_assignments where id = 'dd600000-0000-0000-0000-000000000005' and revoked_at is not null;"),
        1,
      );
      runLocalSql(container, "set session_replication_role = replica; update public.club_role_assignments set revoked_at = null where id = 'dd600000-0000-0000-0000-000000000005'; set session_replication_role = origin;");

      await runAuthorizationRace({
        container,
        label: "nomination_draft_role_delete",
        actorId: "aa600000-0000-0000-0000-000000000003",
        blockerSql: "delete from public.club_role_assignments where id = 'dd600000-0000-0000-0000-000000000005';",
        rpcSql: `select * from public.create_hall_of_fame_application_draft(
  'club_nomination', '${clubFour}',
  'e2000000-0000-0000-0000-000000000010'
);`,
        expectedError: /HOF_PERMISSION_DENIED/,
      });
      assertFailedDraftRaceRolledBack(container, {
        actorId: "aa600000-0000-0000-0000-000000000003",
        applicationType: "club_nomination",
        contextClubId: clubFour,
        requestId: "e2000000-0000-0000-0000-000000000010",
      });
      assert.equal(
        countLocalRows(container, "select count(*) from public.club_role_assignments where id = 'dd600000-0000-0000-0000-000000000005';"),
        0,
      );
      runLocalSql(container, "set session_replication_role = replica; insert into public.club_role_assignments (id, membership_id, role_code, assigned_by) values ('dd600000-0000-0000-0000-000000000005', 'cc600000-0000-0000-0000-000000000007', 'club_admin', 'aa600000-0000-0000-0000-000000000003'); set session_replication_role = origin;");

      await runAuthorizationRace({
        container,
        label: "nomination_draft_club_suspend",
        actorId: "aa600000-0000-0000-0000-000000000003",
        blockerSql: `update public.clubs set club_status = 'suspended' where id = '${clubFour}';`,
        rpcSql: `select * from public.create_hall_of_fame_application_draft(
  'club_nomination', '${clubFour}',
  'e2000000-0000-0000-0000-000000000011'
);`,
        expectedError: /HOF_PERMISSION_DENIED/,
      });
      assertFailedDraftRaceRolledBack(container, {
        actorId: "aa600000-0000-0000-0000-000000000003",
        applicationType: "club_nomination",
        contextClubId: clubFour,
        requestId: "e2000000-0000-0000-0000-000000000011",
      });
      assert.equal(
        runLocalSql(container, `select club_status from public.clubs where id = '${clubFour}';`),
        "suspended",
      );
      runLocalSql(container, `set session_replication_role = replica; update public.clubs set club_status = 'active' where id = '${clubFour}'; set session_replication_role = origin;`);

      for (const [label, adminClub, requestSuffix] of [
        ["vacancy_context_admin", clubTwo, "005"],
        ["vacancy_other_admin", clubThree, "006"],
      ]) {
        const requestId = `e2000000-0000-0000-0000-000000000${requestSuffix}`;
        await runAuthorizationRace({
          container,
          label,
          actorId: "aa600000-0000-0000-0000-000000000002",
          blockerSql: `insert into public.club_memberships (id, club_id, user_id, membership_status, joined_at)
values ('cc600000-0000-0000-0000-000000000005', '${adminClub}', 'aa600000-0000-0000-0000-000000000005', 'active', pg_catalog.now());
insert into public.club_role_assignments (membership_id, role_code, assigned_by)
values
  ('cc600000-0000-0000-0000-000000000005', 'club_member', 'aa600000-0000-0000-0000-000000000005'),
  ('cc600000-0000-0000-0000-000000000005', 'club_admin', 'aa600000-0000-0000-0000-000000000005');`,
          rpcSql: `select * from public.create_hall_of_fame_application_draft(
  'club_admin_vacancy_direct_application', '${clubTwo}',
  '${requestId}'
);`,
          expectedError: /HOF_CLUB_ADMIN_VACANCY_REQUIRED/,
        });
        assertFailedDraftRaceRolledBack(container, {
          actorId: "aa600000-0000-0000-0000-000000000002",
          applicationType: "club_admin_vacancy_direct_application",
          contextClubId: clubTwo,
          requestId,
        });
        runLocalSql(container, "set session_replication_role = replica; delete from public.club_role_assignments where membership_id = 'cc600000-0000-0000-0000-000000000005'; delete from public.club_memberships where id = 'cc600000-0000-0000-0000-000000000005'; set session_replication_role = origin;");
      }

      assert.equal(
        runLocalSql(
          container,
          `select batch.status || '|' || batch.version::text || '|' ||
  (select count(*)::text from public.hall_of_fame_application_records as record where record.application_batch_id = batch.id) || '|' ||
  (select count(*)::text from public.hall_of_fame_application_history as history where history.application_batch_id = batch.id) || '|' ||
  (select count(*)::text from public.audit_logs as audit where audit.target_type = 'hall_of_fame_application_batch' and audit.target_id = batch.id::text)
from public.hall_of_fame_application_batches as batch
where batch.id = '${nominationBatch}';`,
        ),
        "draft|2|0|2|2",
        "failed permission races must not change the HOF batch",
      );
      assert.equal(
        Number(
          runLocalSql(
            container,
            "select count(*) from public.hall_of_fame_application_batches where created_by_user_id in ('aa600000-0000-0000-0000-000000000001', 'aa600000-0000-0000-0000-000000000002');",
          ),
        ),
        0,
        "failed direct and vacancy races must not create drafts",
      );
      assert.equal(
        runLocalSql(
          container,
          "select private.normalize_hall_of_fame_course_segment('  A  ') || '|' || private.normalize_hall_of_fame_course_segment('a');",
        ),
        "a|a",
      );

      const openResults = await runGatedPair({
        container,
        label: "open_draft",
        gateSql: `select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  'aa600000-0000-0000-0000-000000000006:direct_application:none', 8607
));`,
        firstSql: (name) => authenticatedStatement(
          "aa600000-0000-0000-0000-000000000006",
          name,
          "select * from public.create_hall_of_fame_application_draft('direct_application', null, 'e3000000-0000-0000-0000-000000000001');",
        ),
        secondSql: (name) => authenticatedStatement(
          "aa600000-0000-0000-0000-000000000006",
          name,
          "select * from public.create_hall_of_fame_application_draft('direct_application', null, 'e3000000-0000-0000-0000-000000000002');",
        ),
      });
      assertOneSuccess(openResults, /HOF_OPEN_DRAFT_ALREADY_EXISTS/);
      const directBatch = lastOutputLine(runLocalSql(container, "select id from public.hall_of_fame_application_batches where created_by_user_id = 'aa600000-0000-0000-0000-000000000006' and status = 'draft';"));
      const openRequestIds = "('e3000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000002')";
      assert.equal(
        countLocalRows(container, "select count(*) from public.hall_of_fame_application_batches where created_by_user_id = 'aa600000-0000-0000-0000-000000000006' and application_type = 'direct_application' and status = 'draft';"),
        1,
        "open-draft race must create exactly one batch",
      );
      assert.equal(
        countLocalRows(container, `select count(*) from public.hall_of_fame_application_history where application_batch_id = '${directBatch}' and request_id in ${openRequestIds};`),
        1,
        "open-draft race must create exactly one history row",
      );
      assert.equal(
        countLocalRows(container, `select count(*) from public.audit_logs where request_id in ${openRequestIds};`),
        1,
        "open-draft race must create exactly one audit row",
      );
      assert.equal(
        countLocalRows(container, `select count(*) from private.hall_of_fame_mutation_requests where request_id in ${openRequestIds} and status = 'completed';`),
        1,
        "open-draft race must keep only the successful completed ledger",
      );
      assert.equal(
        countLocalRows(container, `select count(*) from private.hall_of_fame_mutation_requests where request_id in ${openRequestIds} and status <> 'completed';`),
        0,
        "open-draft loser must not leave a partial ledger",
      );

      const staleRequests = [
        {
          requestId: "e3000000-0000-0000-0000-000000000003",
          payload: {
            playedOn: "2026-08-02",
            startedAt: null,
            courseName: "Concurrent Course",
            courseRegion: "Seoul",
            courseEnvironment: "outdoor",
            courseLayout: null,
            roundType: "practice",
            eventName: null,
            notes: null,
          },
        },
        {
          requestId: "e3000000-0000-0000-0000-000000000004",
          payload: {
            playedOn: "2026-08-03",
            startedAt: null,
            courseName: "Concurrent Course",
            courseRegion: "Seoul",
            courseEnvironment: "outdoor",
            courseLayout: null,
            roundType: "practice",
            eventName: null,
            notes: null,
          },
        },
      ];
      const staleResults = await runGatedPair({
        container,
        label: "stale_round",
        gateSql: `select id from public.hall_of_fame_application_batches where id = '${directBatch}' for update;`,
        firstSql: (name) => authenticatedStatement(
          "aa600000-0000-0000-0000-000000000006",
          name,
          `select * from public.set_hall_of_fame_round_snapshot('${directBatch}', 1, date '${staleRequests[0].payload.playedOn}', null, '${staleRequests[0].payload.courseName}', '${staleRequests[0].payload.courseRegion}', '${staleRequests[0].payload.courseEnvironment}', null, '${staleRequests[0].payload.roundType}', null, null, '${staleRequests[0].requestId}');`,
        ),
        secondSql: (name) => authenticatedStatement(
          "aa600000-0000-0000-0000-000000000006",
          name,
          `select * from public.set_hall_of_fame_round_snapshot('${directBatch}', 1, date '${staleRequests[1].payload.playedOn}', null, '${staleRequests[1].payload.courseName}', '${staleRequests[1].payload.courseRegion}', '${staleRequests[1].payload.courseEnvironment}', null, '${staleRequests[1].payload.roundType}', null, null, '${staleRequests[1].requestId}');`,
        ),
      });
      const staleOutcomes = staleRequests.map((request, index) => ({
        ...request,
        result: staleResults[index],
      }));
      const staleWinners = staleOutcomes.filter(({ result }) => result.code === 0);
      const staleLosers = staleOutcomes.filter(({ result }) => result.code !== 0);
      assert.equal(staleWinners.length, 1, JSON.stringify(staleResults));
      assert.equal(staleLosers.length, 1, JSON.stringify(staleResults));
      const [staleWinner] = staleWinners;
      const [staleLoser] = staleLosers;
      assertExactDatabaseError(staleLoser.result, "HOF_STALE_VERSION");

      const finalRoundPayload = JSON.parse(
        runLocalSql(container, `select pg_catalog.jsonb_build_object(
          'playedOn', snapshot.played_on::text,
          'startedAt', snapshot.started_at,
          'courseName', snapshot.course_name_snapshot,
          'courseRegion', snapshot.course_region_snapshot,
          'courseEnvironment', snapshot.course_environment,
          'courseLayout', snapshot.course_layout_snapshot,
          'roundType', snapshot.round_type,
          'eventName', snapshot.event_name_snapshot,
          'notes', snapshot.notes,
          'batchVersion', batch.version
        )::text
        from public.hall_of_fame_application_batches as batch
        join public.hall_of_fame_round_snapshots as snapshot
          on snapshot.application_batch_id = batch.id
        where batch.id = '${directBatch}';`),
      );
      const winnerRoundPayload = {
        ...staleWinner.payload,
        batchVersion: 2,
      };
      const loserRoundPayload = {
        ...staleLoser.payload,
        batchVersion: 2,
      };
      assert.deepEqual(finalRoundPayload, winnerRoundPayload);
      assert.notDeepEqual(finalRoundPayload, loserRoundPayload);

      const staleRequestIds = `('${staleRequests[0].requestId}', '${staleRequests[1].requestId}')`;
      assert.equal(
        runLocalSql(container, `select history.request_id::text || '|' || history.scope || '|' || history.version::text || '|' || history.action
          from public.hall_of_fame_application_history as history
          where history.application_batch_id = '${directBatch}'
            and history.request_id in ${staleRequestIds};`),
        `${staleWinner.requestId}|batch|2|hall_of_fame.round_snapshot_created`,
        "stale race history must belong to the winning request and version",
      );
      assert.equal(
        runLocalSql(container, `select audit.request_id::text || '|' || audit.action
          from public.audit_logs as audit
          where audit.request_id in ${staleRequestIds};`),
        `${staleWinner.requestId}|hall_of_fame.round_snapshot.set`,
        "stale race audit must belong to the winning request",
      );
      const staleWinnerFingerprint = roundSnapshotFingerprint(
        container,
        directBatch,
        1,
        staleWinner.payload,
      );
      const staleLoserFingerprint = roundSnapshotFingerprint(
        container,
        directBatch,
        1,
        staleLoser.payload,
      );
      assert.notEqual(staleWinnerFingerprint, staleLoserFingerprint);
      const staleLedgers = completedLedgerRows(container, staleRequestIds);
      assert.equal(staleLedgers.length, 1);
      const [staleLedger] = staleLedgers;
      assert.deepEqual(staleLedger, {
        requestId: staleWinner.requestId,
        actorUserId: "aa600000-0000-0000-0000-000000000006",
        operation: "hall_of_fame.round_snapshot.set",
        applicationBatchId: directBatch,
        applicationRecordId: null,
        targetUserId: null,
        payloadFingerprint: staleWinnerFingerprint,
        status: "completed",
        resultPayload: {
          operation: "hall_of_fame.round_snapshot.set",
          application_batch_id: directBatch,
          batch_version: 2,
          changed: true,
          outcome: "success",
        },
      });
      assert.notEqual(staleLedger.payloadFingerprint, staleLoserFingerprint);
      assert.equal(
        countLocalRows(
          container,
          `select count(*)
          from private.hall_of_fame_mutation_requests as ledger
          where ledger.request_id in ${staleRequestIds}
            and ledger.status = 'completed'
            and ledger.payload_fingerprint = pg_catalog.decode('${staleLoserFingerprint}', 'hex');`,
        ),
        0,
        "stale loser fingerprint must not own a completed ledger",
      );
      assertFailedRequestRolledBack(container, staleLoser.requestId);
      const duplicateResults = await runGatedPair({
        container,
        label: "duplicate_record",
        gateSql: `select id from public.hall_of_fame_application_batches where id = '${nominationBatch}' for update;`,
        firstSql: (name) => authenticatedStatement(
          "aa600000-0000-0000-0000-000000000003",
          name,
          `select * from public.add_hall_of_fame_application_record('${nominationBatch}', 2, 'ab600000-0000-0000-0000-000000000001', 'cb600000-0000-0000-0000-000000000001', 'hole_in_one', 'A  B', 1, 3, 1, 'e3000000-0000-0000-0000-000000000005');`,
        ),
        secondSql: (name) => authenticatedStatement(
          "aa600000-0000-0000-0000-000000000003",
          name,
          `select * from public.add_hall_of_fame_application_record('${nominationBatch}', 3, 'ab600000-0000-0000-0000-000000000001', 'cb600000-0000-0000-0000-000000000001', 'hole_in_one', 'a b', 1, 3, 1, 'e3000000-0000-0000-0000-000000000006');`,
        ),
      });
      assertOneSuccess(duplicateResults, /HOF_DUPLICATE_RECORD/);
      const duplicateRequestIds = "('e3000000-0000-0000-0000-000000000005', 'e3000000-0000-0000-0000-000000000006')";
      assert.equal(Number(runLocalSql(container, `select count(*) from public.hall_of_fame_application_records where application_batch_id = '${nominationBatch}' and course_segment_snapshot = 'a b';`)), 1);
      assert.equal(
        countLocalRows(container, `select count(*)
          from public.hall_of_fame_application_records as record
          join public.hall_of_fame_round_snapshots as snapshot
            on snapshot.id = record.round_snapshot_id
          where record.application_batch_id = '${nominationBatch}'
            and record.course_segment_snapshot = 'a b'
            and record.duplicate_fingerprint = extensions.digest(
              pg_catalog.convert_to(
                pg_catalog.jsonb_build_object(
                  'target_user_id', record.target_user_id,
                  'record_type_code', record.record_type_code,
                  'played_on', snapshot.played_on,
                  'course_name', pg_catalog.lower(snapshot.course_name_snapshot),
                  'course_region', pg_catalog.lower(snapshot.course_region_snapshot),
                  'course_environment', snapshot.course_environment,
                  'course_segment', 'a b',
                  'hole_number', record.hole_number
                )::text,
                'UTF8'
              ),
              'sha256'
            );`),
        1,
        "canonical duplicate race fingerprint must use the collapsed segment",
      );
      assert.equal(
        countLocalRows(container, `select count(*) from public.hall_of_fame_application_history where application_batch_id = '${nominationBatch}' and request_id in ${duplicateRequestIds};`),
        2,
        "canonical duplicate race must add one record and one batch history row",
      );
      assert.equal(
        countLocalRows(container, `select count(*) from public.audit_logs where request_id in ${duplicateRequestIds};`),
        1,
        "canonical duplicate race must add one audit row",
      );
      assert.equal(
        countLocalRows(container, `select count(*) from private.hall_of_fame_mutation_requests where request_id in ${duplicateRequestIds} and status = 'completed';`),
        1,
        "canonical duplicate race must complete one ledger",
      );
      assert.equal(
        countLocalRows(container, `select count(*) from private.hall_of_fame_mutation_requests where request_id in ${duplicateRequestIds} and status <> 'completed';`),
        0,
        "canonical duplicate loser must not leave a partial ledger",
      );
      const nominationRecord = lastOutputLine(runLocalSql(container, `select id from public.hall_of_fame_application_records where application_batch_id = '${nominationBatch}';`));

      const updateRequest = {
        requestId: "e3000000-0000-0000-0000-000000000007",
        payload: {
          recordType: "hole_in_one",
          courseSegment: "b",
          holeNumber: 1,
          holePar: 3,
          strokes: 1,
        },
      };
      const withdrawRequest = {
        requestId: "e3000000-0000-0000-0000-000000000008",
        reason: "concurrent withdrawal",
      };
      const withdrawUpdateResults = await runGatedPair({
        container,
        label: "withdraw_update",
        gateSql: `select id from public.hall_of_fame_application_batches where id = '${nominationBatch}' for update;`,
        firstSql: (name) => authenticatedStatement(
          "aa600000-0000-0000-0000-000000000003",
          name,
          `select * from public.update_hall_of_fame_application_record('${nominationRecord}', 1, 3, '${updateRequest.payload.recordType}', '${updateRequest.payload.courseSegment}', ${updateRequest.payload.holeNumber}, ${updateRequest.payload.holePar}, ${updateRequest.payload.strokes}, '${updateRequest.requestId}');`,
        ),
        secondSql: (name) => authenticatedStatement(
          "aa600000-0000-0000-0000-000000000003",
          name,
          `select * from public.withdraw_hall_of_fame_application_draft('${nominationBatch}', 3, '${withdrawRequest.reason}', '${withdrawRequest.requestId}');`,
        ),
      });
      const updateResult = withdrawUpdateResults[0];
      const withdrawResult = withdrawUpdateResults[1];
      const updateWon = updateResult.code === 0;
      const withdrawWon = withdrawResult.code === 0;
      assert.notEqual(updateWon, withdrawWon, JSON.stringify(withdrawUpdateResults));
      if (updateWon) {
        assertExactDatabaseError(withdrawResult, "HOF_STALE_VERSION");
      } else {
        assertExactDatabaseError(updateResult, "HOF_APPLICATION_NOT_DRAFT");
      }
      const winnerRequestId = updateWon
        ? updateRequest.requestId
        : withdrawRequest.requestId;
      const loserRequestId = updateWon
        ? withdrawRequest.requestId
        : updateRequest.requestId;
      const withdrawUpdateRequestIds = `('${updateRequest.requestId}', '${withdrawRequest.requestId}')`;
      const batchState = runLocalSql(container, `select status || '|' || version::text from public.hall_of_fame_application_batches where id = '${nominationBatch}';`);
      const recordState = runLocalSql(container, `select review_status || '|' || version::text || '|' || course_segment_snapshot || '|' || hole_number::text || '|' || hole_par::text || '|' || strokes::text from public.hall_of_fame_application_records where id = '${nominationRecord}';`);
      assert.equal(batchState, updateWon ? "draft|4" : "withdrawn|4");
      assert.equal(recordState, updateWon ? "draft|2|b|1|3|1" : "withdrawn|2|a b|1|3|1");
      assert.equal(
        countLocalRows(container, `select count(*) from public.hall_of_fame_application_history where application_batch_id = '${nominationBatch}' and request_id = '${winnerRequestId}';`),
        2,
        "withdraw/update winner must own exactly the record and batch history rows",
      );
      assert.equal(
        runLocalSql(container, `select pg_catalog.string_agg(history.scope || ':' || history.action, ',' order by history.scope, history.action)
          from public.hall_of_fame_application_history as history
          where history.application_batch_id = '${nominationBatch}'
            and history.request_id = '${winnerRequestId}';`),
        updateWon
          ? "batch:hall_of_fame.application_record_updated,record:hall_of_fame.application_record_updated"
          : "batch:hall_of_fame.application_draft_withdrawn,record:hall_of_fame.application_record_withdrawn_with_draft",
        "withdraw/update race history must match the winning operation only",
      );
      assert.equal(
        runLocalSql(container, `select audit.request_id::text || '|' || audit.action
          from public.audit_logs as audit
          where audit.request_id in ${withdrawUpdateRequestIds};`),
        updateWon
          ? `${updateRequest.requestId}|hall_of_fame.application_record.update`
          : `${withdrawRequest.requestId}|hall_of_fame.application_draft.withdraw`,
        "withdraw/update audit must belong to the winning request",
      );
      const updateFingerprint = recordUpdateFingerprint(
        container,
        nominationBatch,
        nominationRecord,
        3,
        1,
        updateRequest.payload,
      );
      const withdrawFingerprint = draftWithdrawFingerprint(
        container,
        nominationBatch,
        3,
        withdrawRequest.reason,
      );
      assert.notEqual(updateFingerprint, withdrawFingerprint);
      const winnerFingerprint = updateWon
        ? updateFingerprint
        : withdrawFingerprint;
      const loserFingerprint = updateWon
        ? withdrawFingerprint
        : updateFingerprint;
      const withdrawUpdateLedgers = completedLedgerRows(
        container,
        withdrawUpdateRequestIds,
      );
      assert.equal(withdrawUpdateLedgers.length, 1);
      assert.deepEqual(withdrawUpdateLedgers[0], {
        requestId: winnerRequestId,
        actorUserId: "aa600000-0000-0000-0000-000000000003",
        operation: updateWon
          ? "hall_of_fame.application_record.update"
          : "hall_of_fame.application_draft.withdraw",
        applicationBatchId: nominationBatch,
        applicationRecordId: updateWon ? nominationRecord : null,
        targetUserId: null,
        payloadFingerprint: winnerFingerprint,
        status: "completed",
        resultPayload: updateWon
          ? {
              operation: "hall_of_fame.application_record.update",
              application_batch_id: nominationBatch,
              application_record_id: nominationRecord,
              batch_version: 4,
              record_version: 2,
              changed: true,
              outcome: "success",
            }
          : {
              operation: "hall_of_fame.application_draft.withdraw",
              application_batch_id: nominationBatch,
              batch_version: 4,
              withdrawn_record_count: 1,
              changed: true,
              outcome: "success",
            },
      });
      assert.notEqual(
        withdrawUpdateLedgers[0].payloadFingerprint,
        loserFingerprint,
      );
      assert.equal(
        countLocalRows(
          container,
          `select count(*)
          from private.hall_of_fame_mutation_requests as ledger
          where ledger.request_id in ${withdrawUpdateRequestIds}
            and ledger.status = 'completed'
            and ledger.payload_fingerprint = pg_catalog.decode('${loserFingerprint}', 'hex');`,
        ),
        0,
        "withdraw/update loser fingerprint must not own a completed ledger",
      );
      assertFailedRequestRolledBack(container, loserRequestId);
      if (updateWon) {
        runLocalSql(
          container,
          authenticatedStatement(
            "aa600000-0000-0000-0000-000000000003",
            "hof_cleanup_withdraw",
            `select * from public.withdraw_hall_of_fame_application_draft('${nominationBatch}', 4, 'finish concurrency fixture', 'e3000000-0000-0000-0000-000000000009');`,
          ),
        );
      } else {
        assert.equal(batchState, "withdrawn|4");
      }
      const limitBatch = lastOutputLine(
        runLocalSql(
          container,
          authenticatedStatement(
            "aa600000-0000-0000-0000-000000000003",
            "hof_limit_create",
            `select application_batch_id from public.create_hall_of_fame_application_draft('club_nomination', '${clubOne}', 'e4000000-0000-0000-0000-000000000001');`,
          ),
        ),
      );
      runLocalSql(
        container,
        authenticatedStatement(
          "aa600000-0000-0000-0000-000000000003",
          "hof_limit_seed",
          `select * from public.set_hall_of_fame_round_snapshot('${limitBatch}', 1, date '2026-08-03', null, 'Limit Course', 'Seoul', 'outdoor', null, 'club_event', null, null, 'e4000000-0000-0000-0000-000000000002');
do $$
declare i integer;
begin
  for i in 1..19 loop
    perform public.add_hall_of_fame_application_record(
      '${limitBatch}', i + 1,
      ('ab600000-0000-0000-0000-' || pg_catalog.lpad(i::text, 12, '0'))::uuid,
      ('cb600000-0000-0000-0000-' || pg_catalog.lpad(i::text, 12, '0'))::uuid,
      'hole_in_one', 'limit', i, 3, 1,
      ('e4000000-0000-0000-0000-' || pg_catalog.lpad((i + 2)::text, 12, '0'))::uuid
    );
  end loop;
end;
$$;`,
        ),
      );
      const limitResults = await runGatedPair({
        container,
        label: "target_limit",
        gateSql: `select id from public.hall_of_fame_application_batches where id = '${limitBatch}' for update;`,
        firstSql: (name) => authenticatedStatement(
          "aa600000-0000-0000-0000-000000000003",
          name,
          `select * from public.add_hall_of_fame_application_record('${limitBatch}', 21, 'ab600000-0000-0000-0000-000000000020', 'cb600000-0000-0000-0000-000000000020', 'hole_in_one', 'limit', 20, 3, 1, 'e5000000-0000-0000-0000-000000000001');`,
        ),
        secondSql: (name) => authenticatedStatement(
          "aa600000-0000-0000-0000-000000000003",
          name,
          `select * from public.add_hall_of_fame_application_record('${limitBatch}', 22, 'ab600000-0000-0000-0000-000000000021', 'cb600000-0000-0000-0000-000000000021', 'hole_in_one', 'limit', 21, 3, 1, 'e5000000-0000-0000-0000-000000000002');`,
        ),
      });
      assertOneSuccess(limitResults, /HOF_RECORD_LIMIT_EXCEEDED/);
      assert.equal(Number(runLocalSql(container, `select count(distinct target_user_id) from public.hall_of_fame_application_records where application_batch_id = '${limitBatch}' and review_status <> 'withdrawn';`)), 20);

      assert.equal(
        Number(
          runLocalSql(
            container,
            "select count(*) from private.hall_of_fame_mutation_requests where actor_user_id::text like 'aa600000-%' and request_id::text like 'e2000000-%';",
          ),
        ),
        0,
        "failed authorization races must roll back their ledgers",
      );
    } catch (error) {
      testError = error;
    } finally {
      await captureCleanupStep(
        cleanupErrors,
        "settle HOF psql children",
        () => waitForActivePsqlChildrenToClose(),
      );
      await captureCleanupStep(
        cleanupErrors,
        "cleanup HOF fixtures",
        () => cleanupConcurrentFixtures(container),
      );
      await captureCleanupStep(
        cleanupErrors,
        "assert HOF fixtures clean",
        () => assertConcurrentFixturesClean(container),
      );
      await captureCleanupStep(
        cleanupErrors,
        "assert HOF database sessions clean",
        () => assertNoConcurrentDatabaseSessions(container),
      );
      await captureCleanupStep(
        cleanupErrors,
        "assert HOF child processes clean",
        () => assertNoTrackedPsqlChildren(),
      );
    }

    const failures = testError
      ? [testError, ...cleanupErrors]
      : cleanupErrors;
    throwCollectedErrors(
      failures,
      "HOF concurrency test and cleanup produced multiple failures",
    );
  },
);
function readLocalSupabaseEnvironment() {
  const result = spawnSync(
    "cmd.exe",
    ["/d", "/s", "/c", "npx supabase@latest status -o env"],
    { encoding: "utf8", windowsHide: true },
  );
  assert.equal(result.status, 0, "local Supabase status must be available");
  const values = Object.fromEntries(
    result.stdout.split(/\r?\n/).flatMap((line) => {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match) return [];
      let value = match[2].trim();
      if (value.startsWith('"') && value.endsWith('"')) {
        value = JSON.parse(value);
      }
      return [[match[1], value]];
    }),
  );
  for (const key of ["API_URL", "ANON_KEY", "SERVICE_ROLE_KEY"]) {
    assert.ok(values[key], `local Supabase ${key} must be available`);
  }
  return values;
}

async function postLocalAuthenticatedRpc(apiUrl, anonKey, accessToken, name, payload) {
  const startedAt = performance.now();
  const response = await fetch(`${apiUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json();
  return { response, body, elapsedMs: performance.now() - startedAt };
}

function assertHttpConflict(result, expectedMessage) {
  assert.equal(result.response.status, 409);
  assert.equal(result.body.code, "PT409");
  assert.equal(result.body.message, expectedMessage);
  assert.ok(result.elapsedMs < 5_000, "intentional conflicts must not retry or time out");
}

function cleanupLocalHttpFixture(container, actorUserId) {
  runLocalSql(
    container,
    `begin;
create temporary table cleanup_users(id uuid primary key) on commit drop;
insert into cleanup_users values ('${actorUserId}');
set local session_replication_role = replica;
delete from public.audit_logs where actor_id in (select id from cleanup_users);
delete from private.hall_of_fame_mutation_requests where actor_user_id in (select id from cleanup_users);
delete from public.hall_of_fame_application_history where actor_user_id in (select id from cleanup_users);
delete from public.hall_of_fame_application_records where target_user_id in (select id from cleanup_users);
delete from public.hall_of_fame_round_snapshots where application_batch_id in (
  select id from public.hall_of_fame_application_batches
  where created_by_user_id in (select id from cleanup_users)
);
delete from public.hall_of_fame_application_batches where created_by_user_id in (select id from cleanup_users);
delete from public.consent_records where user_id in (select id from cleanup_users);
delete from public.user_private_contacts where user_id in (select id from cleanup_users);
delete from public.user_profiles where user_id in (select id from cleanup_users);
delete from public.user_accounts where id in (select id from cleanup_users);
delete from auth.users where id in (select id from cleanup_users);
commit;`,
  );
}

test(
  "returns five stale conflicts and in-progress conflicts as immediate HTTP 409 responses",
  { timeout: 60_000 },
  async () => {
    const container = findLocalDatabaseContainer();
    const local = readLocalSupabaseEnvironment();
    const admin = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const actor = createClient(local.API_URL, local.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const email = `hof-http-${randomUUID()}@example.invalid`;
    const password = `A1!${randomUUID()}`;
    let actorUserId = null;

    try {
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      assert.equal(created.error, null, "local auth fixture creation must succeed");
      actorUserId = created.data.user.id;

      const signedIn = await actor.auth.signInWithPassword({ email, password });
      assert.equal(signedIn.error, null, "local auth fixture sign-in must succeed");
      const accessToken = signedIn.data.session.access_token;

      const createResult = await postLocalAuthenticatedRpc(
        local.API_URL,
        local.ANON_KEY,
        accessToken,
        "create_hall_of_fame_application_draft",
        {
          p_application_type: "direct_application",
          p_context_club_id: null,
          p_request_id: randomUUID(),
        },
      );
      assert.equal(createResult.response.status, 200);
      const applicationBatchId = createResult.body[0].application_batch_id;

      const roundPayload = {
        p_application_batch_id: applicationBatchId,
        p_expected_batch_version: 1,
        p_played_on: "2026-08-04",
        p_started_at: null,
        p_course_name: "HTTP Contract Course",
        p_course_region: "Seoul",
        p_course_environment: "outdoor",
        p_course_layout: null,
        p_round_type: "practice",
        p_event_name: null,
        p_notes: null,
        p_request_id: randomUUID(),
      };
      const roundResult = await postLocalAuthenticatedRpc(
        local.API_URL,
        local.ANON_KEY,
        accessToken,
        "set_hall_of_fame_round_snapshot",
        roundPayload,
      );
      assert.equal(roundResult.response.status, 200);
      assert.equal(roundResult.body[0].batch_version, 2);

      const addPayload = {
        p_application_batch_id: applicationBatchId,
        p_expected_batch_version: 2,
        p_target_user_id: actorUserId,
        p_target_membership_id: null,
        p_record_type_code: "hole_in_one",
        p_course_segment: "a",
        p_hole_number: 1,
        p_hole_par: 3,
        p_strokes: 1,
        p_request_id: randomUUID(),
      };
      const addResult = await postLocalAuthenticatedRpc(
        local.API_URL,
        local.ANON_KEY,
        accessToken,
        "add_hall_of_fame_application_record",
        addPayload,
      );
      assert.equal(addResult.response.status, 200);
      assert.equal(addResult.body[0].batch_version, 3);
      const applicationRecordId = addResult.body[0].application_record_id;

      const before = JSON.parse(
        runLocalSql(
          container,
          `select pg_catalog.jsonb_build_object(
  'batchVersion', (select version from public.hall_of_fame_application_batches where id = '${applicationBatchId}'),
  'batchStatus', (select status from public.hall_of_fame_application_batches where id = '${applicationBatchId}'),
  'roundState', (select pg_catalog.to_jsonb(snapshot) from public.hall_of_fame_round_snapshots as snapshot where snapshot.application_batch_id = '${applicationBatchId}'),
  'recordVersion', (select version from public.hall_of_fame_application_records where id = '${applicationRecordId}'),
  'recordStatus', (select review_status from public.hall_of_fame_application_records where id = '${applicationRecordId}'),
  'historyCount', (select count(*) from public.hall_of_fame_application_history where application_batch_id = '${applicationBatchId}'),
  'auditCount', (select count(*) from public.audit_logs where actor_id = '${actorUserId}'),
  'ledgerCount', (select count(*) from private.hall_of_fame_mutation_requests where actor_user_id = '${actorUserId}')
)::text;`,
        ),
      );

      const staleRequests = [
        [
          "set_hall_of_fame_round_snapshot",
          { ...roundPayload, p_expected_batch_version: 2, p_notes: "stale", p_request_id: randomUUID() },
        ],
        [
          "add_hall_of_fame_application_record",
          { ...addPayload, p_expected_batch_version: 2, p_hole_number: 2, p_request_id: randomUUID() },
        ],
        [
          "update_hall_of_fame_application_record",
          {
            p_application_record_id: applicationRecordId,
            p_expected_record_version: 1,
            p_expected_batch_version: 2,
            p_record_type_code: "hole_in_one",
            p_course_segment: "a",
            p_hole_number: 2,
            p_hole_par: 3,
            p_strokes: 1,
            p_request_id: randomUUID(),
          },
        ],
        [
          "withdraw_hall_of_fame_application_record",
          {
            p_application_record_id: applicationRecordId,
            p_expected_record_version: 1,
            p_expected_batch_version: 2,
            p_reason: "HTTP stale record withdrawal",
            p_request_id: randomUUID(),
          },
        ],
        [
          "withdraw_hall_of_fame_application_draft",
          {
            p_application_batch_id: applicationBatchId,
            p_expected_batch_version: 2,
            p_reason: "HTTP stale draft withdrawal",
            p_request_id: randomUUID(),
          },
        ],
      ];

      for (const [name, payload] of staleRequests) {
        const result = await postLocalAuthenticatedRpc(
          local.API_URL,
          local.ANON_KEY,
          accessToken,
          name,
          payload,
        );
        assertHttpConflict(result, "HOF_STALE_VERSION");
      }

      const inProgressRequestId = randomUUID();
      const fingerprint = roundSnapshotFingerprint(
        container,
        applicationBatchId,
        3,
        {
          playedOn: "2026-08-04",
          startedAt: null,
          courseName: "HTTP Contract Course",
          courseRegion: "Seoul",
          courseEnvironment: "outdoor",
          courseLayout: null,
          roundType: "practice",
          eventName: null,
          notes: "in progress",
        },
      );
      runLocalSql(
        container,
        `do $$
begin
  perform pg_catalog.set_config('request.jwt.claim.sub', '${actorUserId}', true);
  perform private.hall_of_fame_claim_request(
    '${actorUserId}',
    '${inProgressRequestId}',
    'hall_of_fame.round_snapshot.set',
    '${applicationBatchId}',
    null,
    null,
    pg_catalog.decode('${fingerprint}', 'hex')
  );
end;
$$;`,
      );
      const inProgressResult = await postLocalAuthenticatedRpc(
        local.API_URL,
        local.ANON_KEY,
        accessToken,
        "set_hall_of_fame_round_snapshot",
        {
          ...roundPayload,
          p_expected_batch_version: 3,
          p_notes: "in progress",
          p_request_id: inProgressRequestId,
        },
      );
      assertHttpConflict(inProgressResult, "HOF_REQUEST_IN_PROGRESS");

      const after = JSON.parse(
        runLocalSql(
          container,
          `select pg_catalog.jsonb_build_object(
  'batchVersion', (select version from public.hall_of_fame_application_batches where id = '${applicationBatchId}'),
  'batchStatus', (select status from public.hall_of_fame_application_batches where id = '${applicationBatchId}'),
  'roundState', (select pg_catalog.to_jsonb(snapshot) from public.hall_of_fame_round_snapshots as snapshot where snapshot.application_batch_id = '${applicationBatchId}'),
  'recordVersion', (select version from public.hall_of_fame_application_records where id = '${applicationRecordId}'),
  'recordStatus', (select review_status from public.hall_of_fame_application_records where id = '${applicationRecordId}'),
  'historyCount', (select count(*) from public.hall_of_fame_application_history where application_batch_id = '${applicationBatchId}'),
  'auditCount', (select count(*) from public.audit_logs where actor_id = '${actorUserId}'),
  'ledgerCount', (select count(*) from private.hall_of_fame_mutation_requests where actor_user_id = '${actorUserId}')
)::text;`,
        ),
      );
      assert.deepEqual(
        { ...after, ledgerCount: before.ledgerCount },
        before,
        "stale and in-progress conflicts must not partially mutate domain, history, or audit state",
      );
      assert.equal(after.ledgerCount, before.ledgerCount + 1);
      assert.equal(
        runLocalSql(
          container,
          `select count(*) from private.hall_of_fame_mutation_requests
where actor_user_id = '${actorUserId}'
  and request_id in (${staleRequests.map(([, payload]) => `'${payload.p_request_id}'`).join(", ")});`,
        ),
        "0",
      );
    } finally {
      await actor.auth.signOut();
      if (actorUserId !== null) cleanupLocalHttpFixture(container, actorUserId);
    }
  },
);
