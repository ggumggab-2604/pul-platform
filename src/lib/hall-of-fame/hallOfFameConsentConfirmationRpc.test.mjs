import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

function findLocalDatabaseContainer() {
  const result = spawnSync(
    "docker",
    ["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const containers = result.stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  assert.equal(containers.length, 1, "exactly one local Supabase DB container must be running");
  return containers[0];
}

function runSql(container, sql, database = "postgres", user = "postgres") {
  return spawnSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", user, "-d", database, "-X", "-q", "-v", "ON_ERROR_STOP=1"],
    { encoding: "utf8", input: sql, maxBuffer: 12 * 1024 * 1024 },
  );
}

function runSqlAsync(container, sql, database = "postgres", user = "postgres") {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      ["exec", "-i", container, "psql", "-U", user, "-d", database, "-X", "-q", "-v", "ON_ERROR_STOP=1"],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(sql);
  });
}
function runContainerCommand(container, args) {
  return spawnSync("docker", ["exec", container, ...args], {
    encoding: "utf8",
    maxBuffer: 24 * 1024 * 1024,
  });
}

function countDisposableDatabases(container) {
  const result = runSql(
    container,
    "\\pset tuples_only on\n\\pset format unaligned\nselect count(*) from pg_catalog.pg_database where datname like 'pul_hof_2b1a3_%';",
  );
  assert.equal(result.status, 0, result.stdout + "\n" + result.stderr);
  return Number(result.stdout.trim());
}

function createDisposableDatabase(container) {
  const database = "pul_hof_2b1a3_" + process.pid + "_" + Date.now();
  assert.match(database, /^[a-z0-9_]+$/);
  assert.equal(countDisposableDatabases(container), 0, "stale disposable HOF database exists");

  try {
    const clone = runContainerCommand(container, [
      "sh",
      "-lc",
      [
        "createdb -U supabase_admin -O postgres " + database,
        "pg_dump -U supabase_admin -d postgres --schema-only | psql -U supabase_admin -d " + database + " -v ON_ERROR_STOP=1 -q",
        "pg_dump -U supabase_admin -d postgres --data-only --disable-triggers | psql -U supabase_admin -d " + database + " -v ON_ERROR_STOP=1 -q",
      ].join(" && "),
    ]);
    assert.equal(clone.status, 0, clone.stdout + "\n" + clone.stderr);

    const baseline = runSql(
    container,
    "\\pset tuples_only on\n\\pset format unaligned\nselect count(*) || ':' || max(version) from supabase_migrations.schema_migrations;",
    database,
  );
  assert.equal(baseline.status, 0, baseline.stdout + "\n" + baseline.stderr);
  assert.equal(baseline.stdout.trim(), "27:20260807000200");

  const compatibilityFixture = runSql(
    container,
    officialBaselineCompatibilityFixtureSql,
    database,
  );
  assert.equal(
    compatibilityFixture.status,
    0,
    compatibilityFixture.stdout + "\n" + compatibilityFixture.stderr,
  );

  const applied = runSql(
    container,
    [
      "begin;",
      migration,
      "insert into supabase_migrations.schema_migrations(version,name) values ('20260808000100','pul_hall_of_fame_consent_confirmation_rpc');",
      "commit;",
    ].join("\n"),
    database,
  );
  assert.equal(applied.status, 0, applied.stdout + "\n" + applied.stderr);
  return database;
  } catch (error) {
    const dropped = dropDisposableDatabase(container, database);
    if (dropped.status !== 0) {
      throw new AggregateError(
        [error, new Error(dropped.stdout + "\n" + dropped.stderr)],
        "disposable HOF database setup and cleanup both failed",
      );
    }
    throw error;
  }
}

function dropDisposableDatabase(container, database) {
  assert.match(database, /^pul_hof_2b1a3_[a-z0-9_]+$/);
  return runContainerCommand(container, [
    "dropdb",
    "--if-exists",
    "--force",
    "-U",
    "supabase_admin",
    database,
  ]);
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const migration = readFileSync(fileURLToPath(new URL(
  "../../../supabase/migrations/20260808000100_pul_hall_of_fame_consent_confirmation_rpc.sql",
  import.meta.url,
)), "utf8");

const officialBaselineCompatibilityFixtureSql = String.raw`
\set ON_ERROR_STOP on
begin;
set local session_replication_role = replica;
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
) values
  ('d0000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hof-compat-1@example.invalid','',now(),now(),now()),
  ('d0000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hof-compat-2@example.invalid','',now(),now(),now()),
  ('d0000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hof-compat-3@example.invalid','',now(),now(),now()),
  ('d0000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hof-compat-4@example.invalid','',now(),now(),now()),
  ('d0000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hof-compat-5@example.invalid','',now(),now(),now());
insert into public.user_accounts(id, account_status) values
  ('d0000000-0000-0000-0000-000000000001','active'),
  ('d0000000-0000-0000-0000-000000000002','active'),
  ('d0000000-0000-0000-0000-000000000003','active'),
  ('d0000000-0000-0000-0000-000000000004','active'),
  ('d0000000-0000-0000-0000-000000000005','active');
insert into private.hall_of_fame_mutation_requests(
  actor_user_id, request_id, operation, payload_fingerprint,
  status, result_payload, completed_at
) values
  ('d0000000-0000-0000-0000-000000000001','d9000000-0000-0000-0000-000000000001','hall_of_fame.fixture.create',decode(repeat('d1',32),'hex'),'completed','{}',now()),
  ('d0000000-0000-0000-0000-000000000002','d9000000-0000-0000-0000-000000000002','hall_of_fame.fixture.create',decode(repeat('d2',32),'hex'),'completed','{}',now()),
  ('d0000000-0000-0000-0000-000000000003','d9000000-0000-0000-0000-000000000003','hall_of_fame.fixture.create',decode(repeat('d3',32),'hex'),'completed','{}',now()),
  ('d0000000-0000-0000-0000-000000000004','d9000000-0000-0000-0000-000000000004','hall_of_fame.fixture.create',decode(repeat('d4',32),'hex'),'completed','{}',now()),
  ('d0000000-0000-0000-0000-000000000005','d9000000-0000-0000-0000-000000000005','hall_of_fame.fixture.create',decode(repeat('d5',32),'hex'),'completed','{}',now());
insert into public.hall_of_fame_application_batches(
  id, application_type, created_by_user_id, status, version
) values
  ('d1000000-0000-0000-0000-000000000001','direct_application','d0000000-0000-0000-0000-000000000001','draft',1),
  ('d1000000-0000-0000-0000-000000000002','direct_application','d0000000-0000-0000-0000-000000000002','draft',1),
  ('d1000000-0000-0000-0000-000000000003','direct_application','d0000000-0000-0000-0000-000000000003','draft',1),
  ('d1000000-0000-0000-0000-000000000004','direct_application','d0000000-0000-0000-0000-000000000004','draft',1),
  ('d1000000-0000-0000-0000-000000000005','direct_application','d0000000-0000-0000-0000-000000000005','draft',1);
insert into public.hall_of_fame_round_snapshots(
  id, application_batch_id, played_on, course_name_snapshot,
  course_region_snapshot, course_environment, round_type
) values
  ('d2000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001',date '2026-08-01','Compatibility Course','Seoul','outdoor','practice'),
  ('d2000000-0000-0000-0000-000000000002','d1000000-0000-0000-0000-000000000002',date '2026-08-01','Compatibility Course','Seoul','outdoor','practice'),
  ('d2000000-0000-0000-0000-000000000003','d1000000-0000-0000-0000-000000000003',date '2026-08-01','Compatibility Course','Seoul','outdoor','practice'),
  ('d2000000-0000-0000-0000-000000000004','d1000000-0000-0000-0000-000000000004',date '2026-08-01','Compatibility Course','Seoul','outdoor','practice'),
  ('d2000000-0000-0000-0000-000000000005','d1000000-0000-0000-0000-000000000005',date '2026-08-01','Compatibility Course','Seoul','outdoor','practice');
insert into public.hall_of_fame_application_records(
  id, application_batch_id, round_snapshot_id, target_user_id,
  record_type_code, course_segment_snapshot, hole_number, hole_par,
  strokes, version
) values
  ('d3000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','hole_in_one','a',1,3,1,1),
  ('d3000000-0000-0000-0000-000000000002','d1000000-0000-0000-0000-000000000002','d2000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000002','hole_in_one','a',2,3,1,1),
  ('d3000000-0000-0000-0000-000000000003','d1000000-0000-0000-0000-000000000003','d2000000-0000-0000-0000-000000000003','d0000000-0000-0000-0000-000000000003','hole_in_one','a',3,3,1,1),
  ('d3000000-0000-0000-0000-000000000004','d1000000-0000-0000-0000-000000000004','d2000000-0000-0000-0000-000000000004','d0000000-0000-0000-0000-000000000004','hole_in_one','a',4,3,1,1),
  ('d3000000-0000-0000-0000-000000000005','d1000000-0000-0000-0000-000000000005','d2000000-0000-0000-0000-000000000005','d0000000-0000-0000-0000-000000000005','hole_in_one','a',5,3,1,1);
insert into public.hall_of_fame_application_history(
  scope, application_batch_id, application_record_id, from_status, to_status,
  version, actor_user_id, action, request_id
) values
  ('batch','d1000000-0000-0000-0000-000000000001',null,null,'draft',1,'d0000000-0000-0000-0000-000000000001','hall_of_fame.fixture_created','d9000000-0000-0000-0000-000000000001'),
  ('record','d1000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000001',null,'draft',1,'d0000000-0000-0000-0000-000000000001','hall_of_fame.fixture_created','d9000000-0000-0000-0000-000000000001'),
  ('batch','d1000000-0000-0000-0000-000000000002',null,null,'draft',1,'d0000000-0000-0000-0000-000000000002','hall_of_fame.fixture_created','d9000000-0000-0000-0000-000000000002'),
  ('record','d1000000-0000-0000-0000-000000000002','d3000000-0000-0000-0000-000000000002',null,'draft',1,'d0000000-0000-0000-0000-000000000002','hall_of_fame.fixture_created','d9000000-0000-0000-0000-000000000002'),
  ('batch','d1000000-0000-0000-0000-000000000003',null,null,'draft',1,'d0000000-0000-0000-0000-000000000003','hall_of_fame.fixture_created','d9000000-0000-0000-0000-000000000003'),
  ('record','d1000000-0000-0000-0000-000000000003','d3000000-0000-0000-0000-000000000003',null,'draft',1,'d0000000-0000-0000-0000-000000000003','hall_of_fame.fixture_created','d9000000-0000-0000-0000-000000000003'),
  ('batch','d1000000-0000-0000-0000-000000000004',null,null,'draft',1,'d0000000-0000-0000-0000-000000000004','hall_of_fame.fixture_created','d9000000-0000-0000-0000-000000000004'),
  ('record','d1000000-0000-0000-0000-000000000004','d3000000-0000-0000-0000-000000000004',null,'draft',1,'d0000000-0000-0000-0000-000000000004','hall_of_fame.fixture_created','d9000000-0000-0000-0000-000000000004'),
  ('batch','d1000000-0000-0000-0000-000000000005',null,null,'draft',1,'d0000000-0000-0000-0000-000000000005','hall_of_fame.fixture_created','d9000000-0000-0000-0000-000000000005'),
  ('record','d1000000-0000-0000-0000-000000000005','d3000000-0000-0000-0000-000000000005',null,'draft',1,'d0000000-0000-0000-0000-000000000005','hall_of_fame.fixture_created','d9000000-0000-0000-0000-000000000005');
insert into public.hall_of_fame_publication_consents(
  application_record_id, target_user_id, status, display_name_consent,
  avatar_consent, club_name_consent, record_date_consent,
  course_detail_consent, version, consented_at, withdrawn_at
) values
  ('d3000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','granted',true,true,false,true,true,1,now(),null),
  ('d3000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000002','granted',true,false,true,true,true,1,now(),null),
  ('d3000000-0000-0000-0000-000000000003','d0000000-0000-0000-0000-000000000003','pending',false,false,false,false,false,1,null,null),
  ('d3000000-0000-0000-0000-000000000004','d0000000-0000-0000-0000-000000000004','declined',false,false,false,false,false,1,null,null),
  ('d3000000-0000-0000-0000-000000000005','d0000000-0000-0000-0000-000000000005','withdrawn',true,false,false,true,true,1,now() - interval '1 day',now());
insert into public.hall_of_fame_publication_consent_history(
  application_record_id, target_user_id, display_name_consent,
  avatar_consent, club_name_consent, record_date_consent,
  course_detail_consent, from_status, to_status, version,
  actor_user_id, request_id
) values
  ('d3000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001',true,true,false,true,true,null,'granted',1,'d0000000-0000-0000-0000-000000000001','d9000000-0000-0000-0000-000000000001'),
  ('d3000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000002',true,false,true,true,true,null,'granted',1,'d0000000-0000-0000-0000-000000000002','d9000000-0000-0000-0000-000000000002'),
  ('d3000000-0000-0000-0000-000000000003','d0000000-0000-0000-0000-000000000003',false,false,false,false,false,null,'pending',1,'d0000000-0000-0000-0000-000000000003','d9000000-0000-0000-0000-000000000003'),
  ('d3000000-0000-0000-0000-000000000004','d0000000-0000-0000-0000-000000000004',false,false,false,false,false,null,'declined',1,'d0000000-0000-0000-0000-000000000004','d9000000-0000-0000-0000-000000000004'),
  ('d3000000-0000-0000-0000-000000000005','d0000000-0000-0000-0000-000000000005',true,false,false,true,true,null,'withdrawn',1,'d0000000-0000-0000-0000-000000000005','d9000000-0000-0000-0000-000000000005');
set local session_replication_role = origin;
commit;
`;

const catalogSql = String.raw`
\set ON_ERROR_STOP on
do $$
declare
  v_name text;
begin
  foreach v_name in array array[
    'hall_of_fame_application_consents',
    'hall_of_fame_application_consent_history',
    'hall_of_fame_record_confirmation_history'
  ] loop
    if not exists (
      select 1 from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = v_name
        and c.relrowsecurity and c.relforcerowsecurity
    ) then raise exception 'RLS/FORCE RLS missing: %', v_name; end if;
    if exists (
      select 1 from pg_catalog.pg_policies
      where schemaname = 'public' and tablename = v_name
    ) then raise exception 'unexpected table policy: %', v_name; end if;
  end loop;

  foreach v_name in array array[
    'set_hall_of_fame_application_consent(uuid,text,text,text,integer,uuid)',
    'reissue_hall_of_fame_nomination_consent_request(uuid,integer,uuid)',
    'set_hall_of_fame_publication_consent(uuid,text,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,integer,uuid)',
    'request_hall_of_fame_record_confirmation(uuid,uuid,integer,uuid)',
    'respond_hall_of_fame_record_confirmation(uuid,text,integer,uuid)',
    'withdraw_hall_of_fame_record_confirmation(uuid,text,integer,uuid)'
  ] loop
    if not pg_catalog.has_function_privilege('authenticated', 'public.' || v_name, 'EXECUTE') then
      raise exception 'authenticated execute missing: %', v_name;
    end if;
    if pg_catalog.has_function_privilege('anon', 'public.' || v_name, 'EXECUTE')
       or pg_catalog.has_function_privilege('service_role', 'public.' || v_name, 'EXECUTE') then
      raise exception 'unexpected external execute: %', v_name;
    end if;
  end loop;
end;
$$;
select 'HOF_B2B1_CATALOG_PASS';
`;

const publicationCompatibilitySql = String.raw`
\set ON_ERROR_STOP on
do $$
begin
  if (select count(*) from public.hall_of_fame_publication_consents where application_record_id::text like 'd3000000-0000-0000-0000-00000000000%') <> 5 then
    raise exception 'legacy publication current-row count changed';
  end if;
  if (select count(*) from public.hall_of_fame_publication_consent_history where application_record_id::text like 'd3000000-0000-0000-0000-00000000000%') <> 5 then
    raise exception 'legacy publication history-row count changed';
  end if;
  if exists (
    select 1 from public.hall_of_fame_publication_consents
    where application_record_id::text like 'd3000000-0000-0000-0000-00000000000%'
      and (policy_version <> 'hof-publication-legacy-v1'
        or masked_display_name_consent <> display_name_consent
        or full_display_name_consent or badge_consent)
  ) then raise exception 'legacy publication current-row disclosure widened'; end if;
  if exists (
    select 1 from public.hall_of_fame_publication_consent_history
    where application_record_id::text like 'd3000000-0000-0000-0000-00000000000%'
      and (policy_version <> 'hof-publication-legacy-v1'
        or masked_display_name_consent <> display_name_consent
        or full_display_name_consent or badge_consent)
  ) then raise exception 'legacy publication history-row disclosure widened'; end if;
  if (select count(*) from public.hall_of_fame_publication_consents where application_record_id::text like 'd3000000-0000-0000-0000-00000000000%' and status='granted') <> 2
     or (select count(*) from public.hall_of_fame_publication_consents where application_record_id::text like 'd3000000-0000-0000-0000-00000000000%' and status='pending') <> 1
     or (select count(*) from public.hall_of_fame_publication_consents where application_record_id::text like 'd3000000-0000-0000-0000-00000000000%' and status='declined') <> 1
     or (select count(*) from public.hall_of_fame_publication_consents where application_record_id::text like 'd3000000-0000-0000-0000-00000000000%' and status='withdrawn') <> 1 then
    raise exception 'legacy publication statuses changed';
  end if;
  if (select count(*) from pg_catalog.pg_constraint constraint_row
      where constraint_row.conrelid in ('public.hall_of_fame_publication_consents'::regclass,'public.hall_of_fame_publication_consent_history'::regclass)
        and constraint_row.conname in (
          'hall_of_fame_publication_consents_name_scope_check',
          'hall_of_fame_publication_consents_scope_check',
          'hall_of_fame_publication_consent_history_name_scope_check',
          'hall_of_fame_publication_consent_history_scope_check'
        ) and constraint_row.convalidated) <> 4 then
    raise exception 'publication compatibility constraints missing or not validated';
  end if;
end;
$$;
select 'HOF_PUBLICATION_COMPATIBILITY_PASS';
`;
const mutationSql = String.raw`
\set ON_ERROR_STOP on
begin;
select id as club_one_id from public.clubs where legacy_key = '1' \gset
select id as club_two_id from public.clubs where legacy_key = '2' \gset
set local session_replication_role = replica;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
) values
  ('e0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hof-b2b-direct@example.invalid', '', now(), now(), now()),
  ('e0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hof-b2b-vacancy@example.invalid', '', now(), now(), now()),
  ('e0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hof-b2b-admin@example.invalid', '', now(), now(), now()),
  ('e0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hof-b2b-nominee@example.invalid', '', now(), now(), now()),
  ('e0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hof-b2b-confirmer@example.invalid', '', now(), now(), now()),
  ('e0000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hof-b2b-other@example.invalid', '', now(), now(), now()),
  ('e0000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hof-b2b-inactive@example.invalid', '', now(), now(), now());

insert into public.user_accounts (id, account_status) values
  ('e0000000-0000-0000-0000-000000000001', 'active'),
  ('e0000000-0000-0000-0000-000000000002', 'active'),
  ('e0000000-0000-0000-0000-000000000003', 'active'),
  ('e0000000-0000-0000-0000-000000000004', 'active'),
  ('e0000000-0000-0000-0000-000000000005', 'active'),
  ('e0000000-0000-0000-0000-000000000006', 'active'),
  ('e0000000-0000-0000-0000-000000000007', 'suspended');

insert into public.club_memberships (
  id, club_id, user_id, membership_status, joined_at
) values
  ('e4000000-0000-0000-0000-000000000002', :'club_two_id', 'e0000000-0000-0000-0000-000000000002', 'active', now()),
  ('e4000000-0000-0000-0000-000000000003', :'club_one_id', 'e0000000-0000-0000-0000-000000000003', 'active', now()),
  ('e4000000-0000-0000-0000-000000000004', :'club_one_id', 'e0000000-0000-0000-0000-000000000004', 'active', now());

insert into public.club_role_assignments (membership_id, role_code, assigned_by) values
  ('e4000000-0000-0000-0000-000000000003', 'club_member', 'e0000000-0000-0000-0000-000000000003'),
  ('e4000000-0000-0000-0000-000000000003', 'club_admin', 'e0000000-0000-0000-0000-000000000003'),
  ('e4000000-0000-0000-0000-000000000004', 'club_member', 'e0000000-0000-0000-0000-000000000003');

insert into private.hall_of_fame_mutation_requests (
  actor_user_id, request_id, operation, payload_fingerprint,
  status, result_payload, completed_at
) values
  ('e0000000-0000-0000-0000-000000000001', 'e9000000-0000-0000-0000-000000000001', 'hall_of_fame.fixture.create', decode(repeat('01', 32), 'hex'), 'completed', '{}', now()),
  ('e0000000-0000-0000-0000-000000000002', 'e9000000-0000-0000-0000-000000000002', 'hall_of_fame.fixture.create', decode(repeat('02', 32), 'hex'), 'completed', '{}', now()),
  ('e0000000-0000-0000-0000-000000000003', 'e9000000-0000-0000-0000-000000000003', 'hall_of_fame.fixture.create', decode(repeat('03', 32), 'hex'), 'completed', '{}', now());

insert into public.hall_of_fame_application_batches (
  id, application_type, created_by_user_id, created_by_membership_id,
  nominating_club_id, vacancy_context_club_id, status, version
) values
  ('e1000000-0000-0000-0000-000000000001', 'direct_application', 'e0000000-0000-0000-0000-000000000001', null, null, null, 'draft', 1),
  ('e1000000-0000-0000-0000-000000000002', 'club_admin_vacancy_direct_application', 'e0000000-0000-0000-0000-000000000002', 'e4000000-0000-0000-0000-000000000002', null, :'club_two_id', 'draft', 1),
  ('e1000000-0000-0000-0000-000000000003', 'club_nomination', 'e0000000-0000-0000-0000-000000000003', 'e4000000-0000-0000-0000-000000000003', :'club_one_id', null, 'draft', 1);

insert into public.hall_of_fame_round_snapshots (
  id, application_batch_id, played_on, course_name_snapshot,
  course_region_snapshot, course_environment, round_type
) values
  ('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', date '2026-08-01', 'B2B Course', 'Seoul', 'outdoor', 'practice'),
  ('e2000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000002', date '2026-08-01', 'B2B Course', 'Seoul', 'outdoor', 'practice'),
  ('e2000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000003', date '2026-08-01', 'B2B Course', 'Seoul', 'outdoor', 'practice');

insert into public.hall_of_fame_application_records (
  id, application_batch_id, round_snapshot_id, target_user_id,
  target_membership_id, record_type_code, course_segment_snapshot,
  hole_number, hole_par, strokes, version, created_at
) values
  ('e3000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', null, 'hole_in_one', 'a', 1, 3, 1, 1, now()),
  ('e3000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000002', 'e2000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002', 'e4000000-0000-0000-0000-000000000002', 'hole_in_one', 'a', 2, 3, 1, 1, now()),
  ('e3000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000003', 'e2000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000004', 'e4000000-0000-0000-0000-000000000004', 'hole_in_one', 'a', 3, 3, 1, 1, now());

insert into public.hall_of_fame_application_history (
  scope, application_batch_id, application_record_id, from_status,
  to_status, version, actor_user_id, action, request_id
) values
  ('batch', 'e1000000-0000-0000-0000-000000000001', null, null, 'draft', 1, 'e0000000-0000-0000-0000-000000000001', 'hall_of_fame.fixture_created', 'e9000000-0000-0000-0000-000000000001'),
  ('record', 'e1000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001', null, 'draft', 1, 'e0000000-0000-0000-0000-000000000001', 'hall_of_fame.fixture_created', 'e9000000-0000-0000-0000-000000000001'),
  ('batch', 'e1000000-0000-0000-0000-000000000002', null, null, 'draft', 1, 'e0000000-0000-0000-0000-000000000002', 'hall_of_fame.fixture_created', 'e9000000-0000-0000-0000-000000000002'),
  ('record', 'e1000000-0000-0000-0000-000000000002', 'e3000000-0000-0000-0000-000000000002', null, 'draft', 1, 'e0000000-0000-0000-0000-000000000002', 'hall_of_fame.fixture_created', 'e9000000-0000-0000-0000-000000000002'),
  ('batch', 'e1000000-0000-0000-0000-000000000003', null, null, 'draft', 1, 'e0000000-0000-0000-0000-000000000003', 'hall_of_fame.fixture_created', 'e9000000-0000-0000-0000-000000000003'),
  ('record', 'e1000000-0000-0000-0000-000000000003', 'e3000000-0000-0000-0000-000000000003', null, 'draft', 1, 'e0000000-0000-0000-0000-000000000003', 'hall_of_fame.fixture_created', 'e9000000-0000-0000-0000-000000000003');

set local session_replication_role = origin;
set local role authenticated;

-- Direct target grants two processing consents, replay is stable, and a new equal request is a no-op.
select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000001', true);
select * from public.set_hall_of_fame_application_consent(
  'e3000000-0000-0000-0000-000000000001', 'application_processing', 'grant', 'hof-policy-v1', 1,
  'e9000000-0000-0000-0000-000000000101'
) \gset direct_processing_
select * from public.set_hall_of_fame_application_consent(
  'e3000000-0000-0000-0000-000000000001', 'application_processing', 'grant', 'hof-policy-v1', 1,
  'e9000000-0000-0000-0000-000000000101'
) \gset direct_replay_
\if :direct_replay_replayed
\else
  \quit 11
\endif
select * from public.set_hall_of_fame_application_consent(
  'e3000000-0000-0000-0000-000000000001', 'evidence_review', 'grant', 'hof-policy-v1', 2,
  'e9000000-0000-0000-0000-000000000102'
) \gset direct_evidence_
select * from public.set_hall_of_fame_application_consent(
  'e3000000-0000-0000-0000-000000000001', 'evidence_review', 'grant', 'hof-policy-v1', 3,
  'e9000000-0000-0000-0000-000000000103'
) \gset direct_noop_
\if :direct_noop_changed
  \quit 12
\endif

reset role;
do $$
begin
  if (select member_consent_status from public.hall_of_fame_application_records where id = 'e3000000-0000-0000-0000-000000000001') <> 'granted' then
    raise exception 'direct summary was not granted';
  end if;
  if (select version from public.hall_of_fame_application_batches where id = 'e1000000-0000-0000-0000-000000000001') <> 3 then
    raise exception 'no-op or replay changed batch version';
  end if;
  if (select count(*) from public.hall_of_fame_application_consent_history where application_record_id = 'e3000000-0000-0000-0000-000000000001') <> 2 then
    raise exception 'direct consent history mismatch';
  end if;
end;
$$;
set local role authenticated;
do $$
begin
  begin
    perform public.set_hall_of_fame_application_consent(
      'e3000000-0000-0000-0000-000000000001', 'nomination_acceptance', 'grant', 'hof-policy-v1', 3,
      'e9000000-0000-0000-0000-000000000104'
    );
    raise exception 'direct nomination acceptance unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'HOF_CONSENT_PURPOSE_NOT_ALLOWED' then raise; end if;
  end;
  begin
    perform public.set_hall_of_fame_application_consent(
      'e3000000-0000-0000-0000-000000000001', 'application_processing', 'grant', ' bad policy ', 3,
      'e9000000-0000-0000-0000-000000000105'
    );
    raise exception 'invalid policy unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'HOF_INVALID_CONSENT_REQUEST' then raise; end if;
  end;
end;
$$;

-- Vacancy target uses the same target-only processing contract.
select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000002', true);
select * from public.set_hall_of_fame_application_consent(
  'e3000000-0000-0000-0000-000000000002', 'application_processing', 'grant', 'hof-policy-v1', 1,
  'e9000000-0000-0000-0000-000000000201'
);
select * from public.set_hall_of_fame_application_consent(
  'e3000000-0000-0000-0000-000000000002', 'evidence_review', 'grant', 'hof-policy-v1', 2,
  'e9000000-0000-0000-0000-000000000202'
);

-- Nomination creator cannot consent for the target; the target grants all three purposes.
select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000003', true);
do $$ begin
  begin
    perform public.set_hall_of_fame_application_consent(
      'e3000000-0000-0000-0000-000000000003', 'nomination_acceptance', 'grant', 'hof-policy-v1', 1,
      'e9000000-0000-0000-0000-000000000301'
    );
    raise exception 'creator consent unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'HOF_PERMISSION_DENIED' then raise; end if;
  end;
end $$;
select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000004', true);
select * from public.set_hall_of_fame_application_consent('e3000000-0000-0000-0000-000000000003', 'application_processing', 'grant', 'hof-policy-v1', 1, 'e9000000-0000-0000-0000-000000000302');
select * from public.set_hall_of_fame_application_consent('e3000000-0000-0000-0000-000000000003', 'evidence_review', 'grant', 'hof-policy-v1', 2, 'e9000000-0000-0000-0000-000000000303');
select * from public.set_hall_of_fame_application_consent('e3000000-0000-0000-0000-000000000003', 'nomination_acceptance', 'decline', 'hof-policy-v1', 3, 'e9000000-0000-0000-0000-000000000304');
select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000003', true);
select * from public.reissue_hall_of_fame_nomination_consent_request(
  'e3000000-0000-0000-0000-000000000003', 4,
  'e9000000-0000-0000-0000-000000000330'
) \gset nomination_reissue_
select * from public.reissue_hall_of_fame_nomination_consent_request(
  'e3000000-0000-0000-0000-000000000003', 4,
  'e9000000-0000-0000-0000-000000000330'
) \gset nomination_reissue_replay_
\if :nomination_reissue_replay_replayed
\else
  \quit 15
\endif
do $$ begin
  begin
    perform public.reissue_hall_of_fame_nomination_consent_request(
      'e3000000-0000-0000-0000-000000000003', 5,
      'e9000000-0000-0000-0000-000000000330'
    );
    raise exception 'reissue payload mismatch unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'HOF_REQUEST_ID_PAYLOAD_MISMATCH' then raise; end if;
  end;
  begin
    perform public.reissue_hall_of_fame_nomination_consent_request(
      'e3000000-0000-0000-0000-000000000003', 5,
      'e9000000-0000-0000-0000-000000000331'
    );
    raise exception 'active reissue unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'HOF_CONSENT_REQUEST_ALREADY_ACTIVE' then raise; end if;
  end;
end $$;
select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000004', true);
select * from public.set_hall_of_fame_application_consent(
  'e3000000-0000-0000-0000-000000000003', 'nomination_acceptance', 'grant', 'hof-policy-v1', 5,
  'e9000000-0000-0000-0000-000000000332'
);

reset role;
do $$ begin
  if (select member_consent_status from public.hall_of_fame_application_records where id = 'e3000000-0000-0000-0000-000000000003') <> 'granted' then
    raise exception 'nomination summary mismatch';
  end if;
  if (select expires_at - requested_at from public.hall_of_fame_application_consents where application_record_id = 'e3000000-0000-0000-0000-000000000003' and consent_purpose = 'nomination_acceptance') <> interval '14 days' then
    raise exception 'nomination expiry mismatch';
  end if;
end $$;
set local role authenticated;

-- Explicit transitions, target-owned withdrawal, and nomination reissue remain policy-bound.
do $$ begin
  begin
    perform public.set_hall_of_fame_application_consent(
      'e3000000-0000-0000-0000-000000000003', 'nomination_acceptance', 'decline', 'hof-policy-v1', 6,
      'e9000000-0000-0000-0000-000000000333'
    );
    raise exception 'granted to declined unexpectedly succeeded';
  exception when sqlstate 'PT409' then
    if sqlerrm <> 'HOF_INVALID_CONSENT_TRANSITION' then raise; end if;
  end;
end $$;
select * from public.set_hall_of_fame_application_consent(
  'e3000000-0000-0000-0000-000000000003', 'nomination_acceptance', 'withdraw', 'hof-policy-v1', 6,
  'e9000000-0000-0000-0000-000000000334'
);
select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000003', true);
select * from public.reissue_hall_of_fame_nomination_consent_request(
  'e3000000-0000-0000-0000-000000000003', 7,
  'e9000000-0000-0000-0000-000000000335'
);
reset role;
set local session_replication_role = replica;
update public.club_memberships
set membership_status = 'suspended', suspended_at = pg_catalog.now()
where id = 'e4000000-0000-0000-0000-000000000004';
set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000004', true);
do $$ begin
  begin
    perform public.set_hall_of_fame_application_consent(
      'e3000000-0000-0000-0000-000000000003', 'nomination_acceptance', 'grant', 'hof-policy-v1', 8,
      'e9000000-0000-0000-0000-000000000336'
    );
    raise exception 'inactive nomination target grant unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'HOF_NOMINATION_TARGET_NOT_ELIGIBLE' then raise; end if;
  end;
end $$;
select * from public.set_hall_of_fame_application_consent(
  'e3000000-0000-0000-0000-000000000003', 'application_processing', 'withdraw', 'hof-policy-v1', 8,
  'e9000000-0000-0000-0000-000000000337'
);
reset role;
set local session_replication_role = replica;
update public.club_memberships
set membership_status = 'active', suspended_at = null
where id = 'e4000000-0000-0000-0000-000000000004';
set local session_replication_role = origin;
set local session_replication_role = replica;
update public.hall_of_fame_application_consents
set requested_at = pg_catalog.now() - interval '15 days',
    expires_at = pg_catalog.now() - interval '1 day'
where application_record_id = 'e3000000-0000-0000-0000-000000000003'
  and consent_purpose = 'nomination_acceptance';
set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000003', true);
select * from public.reissue_hall_of_fame_nomination_consent_request(
  'e3000000-0000-0000-0000-000000000003', 9,
  'e9000000-0000-0000-0000-000000000343'
);
select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000004', true);
select * from public.set_hall_of_fame_application_consent(
  'e3000000-0000-0000-0000-000000000003', 'nomination_acceptance', 'grant', 'hof-policy-v1', 10,
  'e9000000-0000-0000-0000-000000000338'
);
reset role;
set local session_replication_role = replica;
update public.club_role_assignments
set revoked_at = pg_catalog.now(), revoked_by = 'e0000000-0000-0000-0000-000000000003'
where membership_id = 'e4000000-0000-0000-0000-000000000003'
  and role_code = 'club_admin'
  and revoked_at is null;
set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000004', true);
select * from public.set_hall_of_fame_application_consent(
  'e3000000-0000-0000-0000-000000000003', 'evidence_review', 'withdraw', 'hof-policy-v1', 11,
  'e9000000-0000-0000-0000-000000000339'
);
reset role;
set local session_replication_role = replica;
update public.club_role_assignments
set revoked_at = null, revoked_by = null
where membership_id = 'e4000000-0000-0000-0000-000000000003'
  and role_code = 'club_admin';
set local session_replication_role = origin;
set local role authenticated;

-- Publication scope is target-only, mandatory fields are enforced, and withdrawal is versioned.
-- A nomination creator cannot nominate themselves as the companion confirmer.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000003', true);
do $$ begin
  begin
    perform public.request_hall_of_fame_record_confirmation(
      'e3000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000003', 12,
      'e9000000-0000-0000-0000-000000000305'
    );
    raise exception 'nominator confirmation unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'HOF_NOMINATOR_CONFIRMATION_FORBIDDEN' then raise; end if;
  end;
end $$;

do $$ begin
  begin
    perform public.set_hall_of_fame_publication_consent(
      'e3000000-0000-0000-0000-000000000003', 'set', 'hof-policy-v1', true, false, true, true, false, false, true, 12,
      'e9000000-0000-0000-0000-000000000340'
    );
    raise exception 'nomination creator publication consent unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'HOF_PERMISSION_DENIED' then raise; end if;
  end;
end $$;
select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000004', true);
select * from public.set_hall_of_fame_publication_consent(
  'e3000000-0000-0000-0000-000000000003', 'set', 'hof-policy-v1', true, false, true, true, false, false, true, 12,
  'e9000000-0000-0000-0000-000000000341'
);
reset role;
set local session_replication_role = replica;
update public.club_memberships
set membership_status = 'suspended', suspended_at = pg_catalog.now()
where id = 'e4000000-0000-0000-0000-000000000004';
set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000004', true);
select * from public.set_hall_of_fame_publication_consent(
  'e3000000-0000-0000-0000-000000000003', 'withdraw', 'hof-policy-v1', false, false, false, false, false, false, false, 13,
  'e9000000-0000-0000-0000-000000000342'
);
reset role;
set local session_replication_role = replica;
update public.club_memberships
set membership_status = 'active', suspended_at = null
where id = 'e4000000-0000-0000-0000-000000000004';
set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000001', true);
do $$ begin
  begin
    perform public.set_hall_of_fame_publication_consent(
      'e3000000-0000-0000-0000-000000000001', 'set', 'hof-policy-v1', false, false, true, true, false, false, true, 3,
      'e9000000-0000-0000-0000-000000000106'
    );
    raise exception 'invalid publication scope unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'HOF_REQUIRED_PUBLICATION_SCOPE_MISSING' then raise; end if;
  end;
end $$;
select * from public.set_hall_of_fame_publication_consent(
  'e3000000-0000-0000-0000-000000000001', 'set', 'hof-policy-v1', true, false, true, true, true, true, true, 3,
  'e9000000-0000-0000-0000-000000000107'
);
select * from public.set_hall_of_fame_publication_consent(
  'e3000000-0000-0000-0000-000000000001', 'withdraw', 'hof-policy-v1', false, false, false, false, false, false, false, 4,
  'e9000000-0000-0000-0000-000000000108'
);

-- Confirmation lifecycle: request, replay, wrong actor, confirm, withdraw, re-request, cancel, re-request, decline.
select * from public.request_hall_of_fame_record_confirmation(
  'e3000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000005', 5,
  'e9000000-0000-0000-0000-000000000109'
) \gset confirm_request_
select * from public.request_hall_of_fame_record_confirmation(
  'e3000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000005', 5,
  'e9000000-0000-0000-0000-000000000109'
) \gset confirm_request_replay_
\if :confirm_request_replay_replayed
\else
  \quit 13
\endif

select set_config('pul.test.confirmation_id', :'confirm_request_confirmation_id', true);
do $$ begin
  begin
    perform public.request_hall_of_fame_record_confirmation(
      'e3000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 6,
      'e9000000-0000-0000-0000-000000000110'
    );
    raise exception 'self confirmation unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'HOF_SELF_CONFIRMATION_FORBIDDEN' then raise; end if;
  end;
  begin
    perform public.request_hall_of_fame_record_confirmation(
      'e3000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000007', 6,
      'e9000000-0000-0000-0000-000000000111'
    );
    raise exception 'inactive confirmer unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'HOF_ACTIVE_CONFIRMER_REQUIRED' then raise; end if;
  end;
end $$;

select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000006', true);
do $$ begin
  begin
    perform public.respond_hall_of_fame_record_confirmation(
      current_setting('pul.test.confirmation_id')::uuid, 'confirm', 6,
      'e9000000-0000-0000-0000-000000000112'
    );
    raise exception 'wrong confirmer unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'HOF_PERMISSION_DENIED' then raise; end if;
  end;
end $$;

select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000005', true);
select * from public.respond_hall_of_fame_record_confirmation(
  :'confirm_request_confirmation_id', 'confirm', 6,
  'e9000000-0000-0000-0000-000000000113'
);
select * from public.withdraw_hall_of_fame_record_confirmation(
  :'confirm_request_confirmation_id', 'withdraw', 7,
  'e9000000-0000-0000-0000-000000000114'
);

select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000001', true);
select * from public.request_hall_of_fame_record_confirmation(
  'e3000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000005', 8,
  'e9000000-0000-0000-0000-000000000115'
);
select * from public.withdraw_hall_of_fame_record_confirmation(
  :'confirm_request_confirmation_id', 'cancel', 9,
  'e9000000-0000-0000-0000-000000000116'
);
select * from public.request_hall_of_fame_record_confirmation(
  'e3000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000005', 10,
  'e9000000-0000-0000-0000-000000000117'
);
select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000005', true);
select * from public.respond_hall_of_fame_record_confirmation(
  :'confirm_request_confirmation_id', 'decline', 11,
  'e9000000-0000-0000-0000-000000000118'
);

-- A granted application-processing consent can be withdrawn without deleting history.
select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000001', true);
select * from public.set_hall_of_fame_application_consent(
  'e3000000-0000-0000-0000-000000000001', 'application_processing', 'withdraw', 'hof-policy-v1', 12,
  'e9000000-0000-0000-0000-000000000120'
);

-- Stale and request-ID payload mismatch are contract errors with no partial domain mutation.
select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000001', true);
do $$ begin
  begin
    perform public.set_hall_of_fame_application_consent(
      'e3000000-0000-0000-0000-000000000001', 'application_processing', 'withdraw', 'hof-policy-v1', 1,
      'e9000000-0000-0000-0000-000000000119'
    );
    raise exception 'stale consent unexpectedly succeeded';
  exception when sqlstate 'PT409' then null; end;
  begin
    perform public.set_hall_of_fame_application_consent(
      'e3000000-0000-0000-0000-000000000001', 'application_processing', 'grant', 'hof-policy-v2', 1,
      'e9000000-0000-0000-0000-000000000101'
    );
    raise exception 'request mismatch unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'HOF_REQUEST_ID_PAYLOAD_MISMATCH' then raise; end if;
  end;
end $$;

reset role;
do $$ begin
  if (select count(*) from public.hall_of_fame_publication_consent_history where application_record_id = 'e3000000-0000-0000-0000-000000000001') <> 2 then
    raise exception 'publication history mismatch';
  end if;
  if (select count(*) from public.hall_of_fame_application_consent_history where application_record_id = 'e3000000-0000-0000-0000-000000000001') <> 3 then
    raise exception 'application consent withdrawal history mismatch';
  end if;
  if (select member_consent_status from public.hall_of_fame_application_records where id = 'e3000000-0000-0000-0000-000000000001') <> 'withdrawn' then
    raise exception 'application consent withdrawal summary mismatch';
  end if;
  if (select count(*) from public.hall_of_fame_record_confirmation_history where application_record_id = 'e3000000-0000-0000-0000-000000000001') <> 7 then
    raise exception 'confirmation history mismatch';
  end if;
  if exists (select 1 from public.hall_of_fame_record_confirmations where external_contact_hmac is not null or external_contact_masked is not null) then
    raise exception 'external confirmer data was created';
  end if;
  if exists (
    select 1 from public.audit_logs
    where action like 'hall_of_fame.%'
      and (metadata::text ~* 'email|phone|token|storage_path|evidence')
  ) then raise exception 'sensitive audit metadata found'; end if;
  if (select count(*) from private.hall_of_fame_mutation_requests where operation like 'hall_of_fame.%' and status = 'in_progress') <> 0 then
    raise exception 'in-progress ledger remained';
  end if;
  if (select count(*) from public.hall_of_fame_record_confirmations where application_record_id = 'e3000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'duplicate confirmation row created';
  end if;
end $$;

-- Direct DML and append-only mutation remain unavailable to authenticated.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000006', true);
do $$
declare
  v_table text;
  v_statement text;
begin
  foreach v_table in array array[
    'hall_of_fame_application_consents',
    'hall_of_fame_application_consent_history',
    'hall_of_fame_publication_consents',
    'hall_of_fame_publication_consent_history',
    'hall_of_fame_record_confirmations',
    'hall_of_fame_record_confirmation_history'
  ] loop
    foreach v_statement in array array[
      pg_catalog.format('insert into public.%I default values', v_table),
      pg_catalog.format('update public.%I set version = version', v_table),
      pg_catalog.format('delete from public.%I', v_table)
    ] loop
      begin
        execute v_statement;
        raise exception 'direct DML unexpectedly succeeded: %', v_statement;
      exception when insufficient_privilege then null;
      end;
    end loop;
  end loop;
  begin
    perform private.lock_active_hall_of_fame_actor('e0000000-0000-0000-0000-000000000006');
    raise exception 'private helper unexpectedly executable';
  exception when insufficient_privilege then null;
  end;
end $$;

select 'HOF_B2B1_MUTATION_PASS';
rollback;
`;

let sharedContainer;
let sharedDatabase;

before(() => {
  sharedContainer = findLocalDatabaseContainer();
  sharedDatabase = createDisposableDatabase(sharedContainer);
});

after(() => {
  if (sharedContainer && sharedDatabase) {
    const dropped = dropDisposableDatabase(sharedContainer, sharedDatabase);
    assert.equal(dropped.status, 0, dropped.stdout + "\n" + dropped.stderr);
  }
  if (sharedContainer) {
    assert.equal(countDisposableDatabases(sharedContainer), 0, "disposable HOF database residue remains");
  }
});
test("validates B-2B-1 RLS, ACL, and authenticated-only RPC catalog", () => {
  const result = runSql(sharedContainer, catalogSql, sharedDatabase);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /HOF_B2B1_CATALOG_PASS/);
});

test("backfills legacy publication consent without widening disclosure", () => {
  const result = runSql(sharedContainer, publicationCompatibilitySql, sharedDatabase);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /HOF_PUBLICATION_COMPATIBILITY_PASS/);
});

test(
  "executes target consent, publication, member confirmation, replay, stale, audit, and direct-DML scenarios locally",
  { timeout: 120_000 },
  () => {
    const result = runSql(sharedContainer, mutationSql, sharedDatabase);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /HOF_B2B1_MUTATION_PASS/);
  },
);


test(
  "serializes duplicate confirmation requests and confirm-versus-cancel races",
  { timeout: 60_000 },
  async () => {
    const container = sharedContainer;
    const database = sharedDatabase;
    const seed = String.raw`
\set ON_ERROR_STOP on
begin;
select id as club_one_id from public.clubs where legacy_key = '1' \gset
set local session_replication_role = replica;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
('f0000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hof-race-editor@example.invalid','',now(),now(),now()),
('f0000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hof-race-confirmer@example.invalid','',now(),now(),now());
insert into public.user_accounts(id,account_status) values
('f0000000-0000-0000-0000-000000000001','active'),
('f0000000-0000-0000-0000-000000000002','active');
insert into private.hall_of_fame_mutation_requests(actor_user_id,request_id,operation,payload_fingerprint,status,result_payload,completed_at)
values('f0000000-0000-0000-0000-000000000001','f9000000-0000-0000-0000-000000000001','hall_of_fame.fixture.create',decode(repeat('11',32),'hex'),'completed','{}',now());
insert into public.hall_of_fame_application_batches(id,application_type,created_by_user_id,status,version)
values('f1000000-0000-0000-0000-000000000001','direct_application','f0000000-0000-0000-0000-000000000001','draft',1);
insert into public.hall_of_fame_round_snapshots(id,application_batch_id,played_on,course_name_snapshot,course_region_snapshot,course_environment,round_type)
values('f2000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001',date '2026-08-01','Race Course','Seoul','outdoor','practice');
insert into public.hall_of_fame_application_records(id,application_batch_id,round_snapshot_id,target_user_id,record_type_code,course_segment_snapshot,hole_number,hole_par,strokes,version)
values('f3000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000001','hole_in_one','a',1,3,1,1);
insert into public.hall_of_fame_application_history(scope,application_batch_id,application_record_id,from_status,to_status,version,actor_user_id,action,request_id) values
('batch','f1000000-0000-0000-0000-000000000001',null,null,'draft',1,'f0000000-0000-0000-0000-000000000001','hall_of_fame.fixture_created','f9000000-0000-0000-0000-000000000001'),
('record','f1000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000001',null,'draft',1,'f0000000-0000-0000-0000-000000000001','hall_of_fame.fixture_created','f9000000-0000-0000-0000-000000000001');
commit;`;
    const cleanup = String.raw`
begin;
set local session_replication_role = replica;
delete from public.audit_logs where actor_id in ('f0000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000002');
delete from public.hall_of_fame_record_confirmation_history where application_record_id = 'f3000000-0000-0000-0000-000000000001';
delete from public.hall_of_fame_record_confirmations where application_record_id = 'f3000000-0000-0000-0000-000000000001';
delete from public.hall_of_fame_application_history where application_batch_id = 'f1000000-0000-0000-0000-000000000001';
delete from private.hall_of_fame_mutation_requests where actor_user_id in ('f0000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000002');
delete from public.hall_of_fame_application_records where id = 'f3000000-0000-0000-0000-000000000001';
delete from public.hall_of_fame_round_snapshots where id = 'f2000000-0000-0000-0000-000000000001';
delete from public.hall_of_fame_application_batches where id = 'f1000000-0000-0000-0000-000000000001';
delete from public.user_accounts where id in ('f0000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000002');
delete from auth.users where id in ('f0000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000002');
commit;`;

    const seeded = runSql(container, seed, database);
    assert.equal(seeded.status, 0, `${seeded.stdout}\n${seeded.stderr}`);
    try {
      const request = (requestId) => String.raw`
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','f0000000-0000-0000-0000-000000000001',true);
select * from public.request_hall_of_fame_record_confirmation(
  'f3000000-0000-0000-0000-000000000001',
  'f0000000-0000-0000-0000-000000000002',
  1,
  '${requestId}'
);
commit;`;
      const requestResults = await Promise.all([
        runSqlAsync(container, request("f9000000-0000-0000-0000-000000000101"), database),
        runSqlAsync(container, request("f9000000-0000-0000-0000-000000000102"), database),
      ]);
      assert.equal(requestResults.filter((result) => result.code === 0).length, 1);
      const requestLoser = requestResults.find((result) => result.code !== 0);
      assert.match(`${requestLoser.stderr}\n${requestLoser.stdout}`, /HOF_STALE_APPLICATION_VERSION/);

      const confirmationIdResult = runSql(
        container,
        String.raw`\pset tuples_only on
\pset format unaligned
select id from public.hall_of_fame_record_confirmations where application_record_id='f3000000-0000-0000-0000-000000000001';`,
        database,
      );
      assert.equal(confirmationIdResult.status, 0, confirmationIdResult.stderr);
      const confirmationId = confirmationIdResult.stdout.trim();
      assert.match(confirmationId, /^[0-9a-f-]{36}$/);

      const confirm = String.raw`
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','f0000000-0000-0000-0000-000000000002',true);
select * from public.respond_hall_of_fame_record_confirmation(
  '${confirmationId}', 'confirm', 2,
  'f9000000-0000-0000-0000-000000000103'
);
commit;`;
      const cancel = String.raw`
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','f0000000-0000-0000-0000-000000000001',true);
select * from public.withdraw_hall_of_fame_record_confirmation(
  '${confirmationId}', 'cancel', 2,
  'f9000000-0000-0000-0000-000000000104'
);
commit;`;
      const responseResults = await Promise.all([
        runSqlAsync(container, confirm, database),
        runSqlAsync(container, cancel, database),
      ]);
      assert.equal(responseResults.filter((result) => result.code === 0).length, 1);
      const responseWinnerIndex = responseResults.findIndex((result) => result.code === 0);
      const expectedWinner = responseWinnerIndex === 0
        ? { actor: "f0000000-0000-0000-0000-000000000002", request: "f9000000-0000-0000-0000-000000000103", operation: "hall_of_fame.confirmation.confirm" }
        : { actor: "f0000000-0000-0000-0000-000000000001", request: "f9000000-0000-0000-0000-000000000104", operation: "hall_of_fame.confirmation.cancel" };
      const expectedLoserRequest = responseWinnerIndex === 0
        ? "f9000000-0000-0000-0000-000000000104"
        : "f9000000-0000-0000-0000-000000000103";

      const responseLoser = responseResults.find((result) => result.code !== 0);
      assert.match(`${responseLoser.stderr}\n${responseLoser.stdout}`, /HOF_STALE_APPLICATION_VERSION/);

      const invariant = runSql(
        container,
        String.raw`\pset tuples_only on
\pset format unaligned
select pg_catalog.jsonb_build_object(
  'batch_version',(select version from public.hall_of_fame_application_batches where id='f1000000-0000-0000-0000-000000000001'),
  'confirmation_count',(select count(*) from public.hall_of_fame_record_confirmations where application_record_id='f3000000-0000-0000-0000-000000000001'),
  'history_count',(select count(*) from public.hall_of_fame_record_confirmation_history where application_record_id='f3000000-0000-0000-0000-000000000001'),
  'audit_count',(select count(*) from public.audit_logs where actor_id in ('f0000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000002') and action like 'hall_of_fame.confirmation.%'),
  'ledger_count',(select count(*) from private.hall_of_fame_mutation_requests where actor_user_id in ('f0000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000002') and operation like 'hall_of_fame.confirmation.%'),
  'history_actor',(select actor_user_id from public.hall_of_fame_record_confirmation_history where application_record_id='f3000000-0000-0000-0000-000000000001' order by version desc limit 1),
  'history_request',(select request_id from public.hall_of_fame_record_confirmation_history where application_record_id='f3000000-0000-0000-0000-000000000001' order by version desc limit 1),
  'history_operation',(select action from public.hall_of_fame_record_confirmation_history where application_record_id='f3000000-0000-0000-0000-000000000001' order by version desc limit 1),
  'audit_actor',(select actor_id from public.audit_logs where request_id in ('f9000000-0000-0000-0000-000000000103','f9000000-0000-0000-0000-000000000104') limit 1),
  'audit_request',(select request_id from public.audit_logs where request_id in ('f9000000-0000-0000-0000-000000000103','f9000000-0000-0000-0000-000000000104') limit 1),
  'ledger_actor',(select actor_user_id from private.hall_of_fame_mutation_requests where request_id in ('f9000000-0000-0000-0000-000000000103','f9000000-0000-0000-0000-000000000104') limit 1),
  'ledger_request',(select request_id from private.hall_of_fame_mutation_requests where request_id in ('f9000000-0000-0000-0000-000000000103','f9000000-0000-0000-0000-000000000104') limit 1),
  'ledger_operation',(select operation from private.hall_of_fame_mutation_requests where request_id in ('f9000000-0000-0000-0000-000000000103','f9000000-0000-0000-0000-000000000104') limit 1)
)::text;`,
        database,
      );
      assert.equal(invariant.status, 0, invariant.stderr);
      const state = JSON.parse(invariant.stdout.trim());
      assert.equal(state.batch_version, 3);
      assert.equal(state.confirmation_count, 1);
      assert.equal(state.history_count, 2);
      assert.equal(state.audit_count, 2);
      assert.equal(state.ledger_count, 2);
      assert.equal(state.history_actor, expectedWinner.actor);
      assert.equal(state.history_request, expectedWinner.request);
      assert.equal(state.history_operation, expectedWinner.operation);
      assert.equal(state.audit_actor, expectedWinner.actor);
      assert.equal(state.audit_request, expectedWinner.request);
      assert.equal(state.ledger_actor, expectedWinner.actor);
      assert.equal(state.ledger_request, expectedWinner.request);
      assert.equal(state.ledger_operation, expectedWinner.operation);
      assert.equal(state.ledger_request === expectedLoserRequest, false);
    } finally {
      const cleaned = runSql(container, cleanup, database);
      assert.equal(cleaned.status, 0, `${cleaned.stdout}\n${cleaned.stderr}`);
    }
  },
);
test(
  "enforces early request locks across B-2A, consent, and confirmation mutations",
  { timeout: 60_000 },
  async () => {
    const container = sharedContainer;
    const database = sharedDatabase;
    const execute = (statement) => runSql(container, statement, database, "supabase_admin");
    const executeAsync = (statement) => runSqlAsync(container, statement, database, "supabase_admin");
    const transaction = (actorId, statement, hold = false) => [
      "\\set ON_ERROR_STOP on",
      "\\set VERBOSITY verbose",
      "begin;",
      "set local role authenticated;",
      "select set_config('request.jwt.claim.sub','" + actorId + "',true);",
      statement,
      hold ? "select pg_sleep(2);" : "",
      "commit;",
    ].filter(Boolean).join("\n");
    const assertInProgress = async ({ actorId, label, statement, replay, mismatch }) => {
      const firstPromise = executeAsync(transaction(actorId, statement, true));
      await wait(300);
      const startedAt = Date.now();
      const overlapping = await executeAsync(transaction(actorId, statement));
      const elapsed = Date.now() - startedAt;
      assert.notEqual(overlapping.code, 0, `${label} overlap must be rejected`);
      assert.match(
        overlapping.stderr + "\n" + overlapping.stdout,
        /PT409.*HOF_REQUEST_IN_PROGRESS|HOF_REQUEST_IN_PROGRESS.*PT409/s,
      );
      assert.ok(elapsed < 1_500, `${label} overlap waited ${elapsed}ms instead of failing early`);
      const first = await firstPromise;
      assert.equal(first.code, 0, first.stdout + "\n" + first.stderr);
      const replayed = execute(transaction(actorId, replay));
      assert.equal(replayed.status, 0, replayed.stdout + "\n" + replayed.stderr);
      assert.match(replayed.stdout, /t/);
      const mismatched = execute(transaction(actorId, mismatch));
      assert.notEqual(mismatched.status, 0, `${label} payload mismatch must be rejected`);
      assert.match(
        mismatched.stderr + "\n" + mismatched.stdout,
        /22023.*HOF_REQUEST_ID_PAYLOAD_MISMATCH|HOF_REQUEST_ID_PAYLOAD_MISMATCH.*22023/s,
      );
    };

    await assertInProgress({
      actorId: "d0000000-0000-0000-0000-000000000001",
      label: "B-2A round snapshot",
      statement: "select * from public.set_hall_of_fame_round_snapshot('d1000000-0000-0000-0000-000000000001',1,date '2026-08-01',null,'Compatibility Course','Seoul','outdoor',null,'practice',null,'Request lock round','d9000000-0000-0000-0000-000000000101');",
      replay: "select replayed from public.set_hall_of_fame_round_snapshot('d1000000-0000-0000-0000-000000000001',1,date '2026-08-01',null,'Compatibility Course','Seoul','outdoor',null,'practice',null,'Request lock round','d9000000-0000-0000-0000-000000000101');",
      mismatch: "select * from public.set_hall_of_fame_round_snapshot('d1000000-0000-0000-0000-000000000001',1,date '2026-08-01',null,'Compatibility Course','Seoul','outdoor',null,'practice',null,'Different payload','d9000000-0000-0000-0000-000000000101');",
    });
    await assertInProgress({
      actorId: "d0000000-0000-0000-0000-000000000001",
      label: "application consent",
      statement: "select * from public.set_hall_of_fame_application_consent('d3000000-0000-0000-0000-000000000001','application_processing','grant','hof-lock-v1',2,'d9000000-0000-0000-0000-000000000102');",
      replay: "select replayed from public.set_hall_of_fame_application_consent('d3000000-0000-0000-0000-000000000001','application_processing','grant','hof-lock-v1',2,'d9000000-0000-0000-0000-000000000102');",
      mismatch: "select * from public.set_hall_of_fame_application_consent('d3000000-0000-0000-0000-000000000001','application_processing','grant','hof-lock-v2',2,'d9000000-0000-0000-0000-000000000102');",
    });
    await assertInProgress({
      actorId: "d0000000-0000-0000-0000-000000000001",
      label: "record confirmation",
      statement: "select * from public.request_hall_of_fame_record_confirmation('d3000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000002',3,'d9000000-0000-0000-0000-000000000103');",
      replay: "select replayed from public.request_hall_of_fame_record_confirmation('d3000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000002',3,'d9000000-0000-0000-0000-000000000103');",
      mismatch: "select * from public.request_hall_of_fame_record_confirmation('d3000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000002',2,'d9000000-0000-0000-0000-000000000103');",
    });

    const differentActorSameRequest = "d9000000-0000-0000-0000-000000000201";
    const actorOne = transaction(
      "d0000000-0000-0000-0000-000000000001",
      "select * from public.set_hall_of_fame_round_snapshot('d1000000-0000-0000-0000-000000000001',4,date '2026-08-02',null,'Actor One Course','Seoul','outdoor',null,'practice',null,'Actor separation','" + differentActorSameRequest + "');",
      true,
    );
    const actorTwo = transaction(
      "d0000000-0000-0000-0000-000000000002",
      "select * from public.set_hall_of_fame_round_snapshot('d1000000-0000-0000-0000-000000000002',1,date '2026-08-02',null,'Actor Two Course','Busan','outdoor',null,'practice',null,'Actor separation','" + differentActorSameRequest + "');",
    );
    const actorOnePromise = executeAsync(actorOne);
    await wait(300);
    const actorTwoStartedAt = Date.now();
    const actorTwoResult = await executeAsync(actorTwo);
    assert.equal(actorTwoResult.code, 0, actorTwoResult.stdout + "\n" + actorTwoResult.stderr);
    assert.ok(Date.now() - actorTwoStartedAt < 1_500, "different actors collided on the same request UUID");
    const actorOneResult = await actorOnePromise;
    assert.equal(actorOneResult.code, 0, actorOneResult.stdout + "\n" + actorOneResult.stderr);

    const sameActorOne = transaction(
      "d0000000-0000-0000-0000-000000000001",
      "select * from public.set_hall_of_fame_round_snapshot('d1000000-0000-0000-0000-000000000001',5,date '2026-08-02',null,'Actor One Course','Seoul','outdoor',null,'practice',null,'Actor separation','d9000000-0000-0000-0000-000000000211');",
      true,
    );
    const sameActorTwo = transaction(
      "d0000000-0000-0000-0000-000000000001",
      "select * from public.set_hall_of_fame_round_snapshot('d1000000-0000-0000-0000-000000000001',5,date '2026-08-02',null,'Actor One Course','Seoul','outdoor',null,'practice',null,'Actor separation','d9000000-0000-0000-0000-000000000212');",
    );
    const sameActorOnePromise = executeAsync(sameActorOne);
    await wait(300);
    const sameActorTwoResult = await executeAsync(sameActorTwo);
    assert.equal(sameActorTwoResult.code, 0, sameActorTwoResult.stdout + "\n" + sameActorTwoResult.stderr);
    assert.doesNotMatch(sameActorTwoResult.stderr + "\n" + sameActorTwoResult.stdout, /HOF_REQUEST_IN_PROGRESS/);
    const sameActorOneResult = await sameActorOnePromise;
    assert.equal(sameActorOneResult.code, 0, sameActorOneResult.stdout + "\n" + sameActorOneResult.stderr);

    const invariant = execute(String.raw`\pset tuples_only on
\pset format unaligned
select jsonb_build_object(
  'requestLedgers',(select count(*) from private.hall_of_fame_mutation_requests where actor_user_id='d0000000-0000-0000-0000-000000000001' and request_id in ('d9000000-0000-0000-0000-000000000101','d9000000-0000-0000-0000-000000000102','d9000000-0000-0000-0000-000000000103') and status='completed'),
  'requestAudits',(select count(*) from public.audit_logs where actor_id='d0000000-0000-0000-0000-000000000001' and request_id in ('d9000000-0000-0000-0000-000000000101','d9000000-0000-0000-0000-000000000102','d9000000-0000-0000-0000-000000000103')),
  'applicationConsentHistory',(select count(*) from public.hall_of_fame_application_consent_history where request_id='d9000000-0000-0000-0000-000000000102'),
  'confirmationHistory',(select count(*) from public.hall_of_fame_record_confirmation_history where request_id='d9000000-0000-0000-0000-000000000103'),
  'applicationHistory',(select count(*) from public.hall_of_fame_application_history where request_id in ('d9000000-0000-0000-0000-000000000101','d9000000-0000-0000-0000-000000000102','d9000000-0000-0000-0000-000000000103')),
  'batchVersion',(select version from public.hall_of_fame_application_batches where id='d1000000-0000-0000-0000-000000000001'),
  'recordVersion',(select version from public.hall_of_fame_application_records where id='d3000000-0000-0000-0000-000000000001'),
  'sameRequestActors',(select count(*) from private.hall_of_fame_mutation_requests where request_id='d9000000-0000-0000-0000-000000000201' and status='completed')
)::text;`);
    assert.equal(invariant.status, 0, invariant.stdout + "\n" + invariant.stderr);
    const state = JSON.parse(invariant.stdout.trim());
    assert.equal(state.requestLedgers, 3);
    assert.equal(state.requestAudits, 3);
    assert.equal(state.applicationConsentHistory, 1);
    assert.equal(state.confirmationHistory, 1);
    assert.equal(state.applicationHistory, 5);
    assert.equal(state.batchVersion, 5);
    assert.equal(state.recordVersion, 3);
    assert.equal(state.sameRequestActors, 2);
  },
);
test(
  "verifies consent, request, and authorization races in a disposable database",
  { timeout: 180_000 },
  async () => {
    const container = sharedContainer;
    const database = sharedDatabase;
    const actor = {
      admin: "f1000000-0000-0000-0000-000000000001",
      target: "f1000000-0000-0000-0000-000000000002",
      successor: "f1000000-0000-0000-0000-000000000003",
      confirmer: "f1000000-0000-0000-0000-000000000004",
    };
    const request = {
      appoint: "f9000000-0000-0000-0000-000000000001",
      activateTarget: "f9000000-0000-0000-0000-000000000002",
      activateSuccessor: "f9000000-0000-0000-0000-000000000003",
      draft: "f9000000-0000-0000-0000-000000000004",
      round: "f9000000-0000-0000-0000-000000000005",
      recordOne: "f9000000-0000-0000-0000-000000000006",
      recordTwo: "f9000000-0000-0000-0000-000000000007",
      grantRace: "f9000000-0000-0000-0000-000000000101",
      withdrawRace: "f9000000-0000-0000-0000-000000000102",
      nominationGrant: "f9000000-0000-0000-0000-000000000103",
      nominationWithdraw: "f9000000-0000-0000-0000-000000000104",
      reissue: "f9000000-0000-0000-0000-000000000105",
      publication: "f9000000-0000-0000-0000-000000000106",
      confirmation: "f9000000-0000-0000-0000-000000000107",
      transfer: "f9000000-0000-0000-0000-000000000108",
      blockedConfirmation: "f9000000-0000-0000-0000-000000000109",
      postRevokeConfirmation: "f9000000-0000-0000-0000-000000000110",
    };
    const sql = (...lines) => lines.join("\n");
    const execute = (statement) => runSql(
      container,
      statement,
      database,
      "supabase_admin",
    );
    const executeAsync = (statement) => runSqlAsync(
      container,
      statement,
      database,
      "supabase_admin",
    );
    const queryJson = (statement) => {
      const result = execute(sql(
        "\\pset tuples_only on",
        "\\pset format unaligned",
        statement,
      ));
      assert.equal(result.status, 0, result.stdout + "\n" + result.stderr);
      const lines = result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      return JSON.parse(lines.at(-1));
    };
    let historyGuardRequestSequence = 200;
    const nextHistoryGuardRequest = () => (
      "f9000000-0000-0000-0000-" + String(historyGuardRequestSequence++).padStart(12, "0")
    );
    const ledgerBoundHistoryAttempt = ({
      actorId,
      expectedError,
      label,
      operation,
      recordId,
      requestId = nextHistoryGuardRequest(),
      statements,
      targetId = actor.target,
    }) => {
      const result = execute(sql(
        "\\set ON_ERROR_STOP on",
        "\\set VERBOSITY verbose",
        "begin;",
        "select set_config('request.jwt.claim.sub','" + actorId + "',true);",
        "select * from private.hall_of_fame_claim_request(" +
          "'" + actorId + "','" + requestId + "','" + operation + "','" +
          fixture.batchId + "','" + recordId + "','" + targetId +
          "',decode(repeat('ab',32),'hex'));",
        ...statements(requestId),
        "commit;",
      ));
      assert.notEqual(result.status, 0, label + " must be rejected");
      assert.match(
        result.stderr + "\n" + result.stdout,
        new RegExp("42501.*" + expectedError + "|" + expectedError + ".*42501", "s"),
        label,
      );
    };

    const applicationHistoryInsert = ({
      actorId = actor.target,
      fromStatus,
      purpose = "application_processing",
      recordId = fixture.recordOne,
      requestId,
      toStatus = "consent.status",
      version = "consent.version",
    }) => (
      "insert into public.hall_of_fame_application_consent_history(" +
      "application_consent_id,application_record_id,application_batch_id,subject_user_id," +
      "consent_purpose,policy_version,from_status,to_status,version,actor_user_id,request_id," +
      "requested_at,expires_at) select consent.id,consent.application_record_id," +
      "consent.application_batch_id,consent.subject_user_id,consent.consent_purpose," +
      "consent.policy_version," + fromStatus + "," + toStatus + "," + version + ",'" +
      actorId + "','" + requestId + "',consent.requested_at,consent.expires_at from " +
      "public.hall_of_fame_application_consents consent where consent.application_record_id='" +
      recordId + "' and consent.consent_purpose='" + purpose + "';"
    );
    const publicationHistoryInsert = ({
      actorId = actor.target,
      fromStatus,
      recordId = fixture.recordOne,
      requestId,
      toStatus = "consent.status",
      version = "consent.version",
    }) => (
      "insert into public.hall_of_fame_publication_consent_history(" +
      "application_record_id,target_user_id,display_name_consent,avatar_consent," +
      "club_name_consent,record_date_consent,course_detail_consent,from_status,to_status," +
      "version,actor_user_id,request_id,policy_version,masked_display_name_consent," +
      "full_display_name_consent,badge_consent) select consent.application_record_id," +
      "consent.target_user_id,consent.display_name_consent,consent.avatar_consent," +
      "consent.club_name_consent,consent.record_date_consent,consent.course_detail_consent," +
      fromStatus + "," + toStatus + "," + version + ",'" + actorId + "','" + requestId +
      "',consent.policy_version,consent.masked_display_name_consent," +
      "consent.full_display_name_consent,consent.badge_consent from " +
      "public.hall_of_fame_publication_consents consent where consent.application_record_id='" +
      recordId + "';"
    );
    const confirmationHistoryInsert = ({
      action,
      actorId,
      fromStatus,
      recordId = fixture.recordOne,
      requestId,
      toStatus = "confirmation.status",
      version = "confirmation.version",
    }) => (
      "insert into public.hall_of_fame_record_confirmation_history(" +
      "confirmation_id,application_record_id,requester_user_id,confirmer_user_id," +
      "from_status,to_status,action,version,actor_user_id,request_id,requested_at,expires_at) " +
      "select confirmation.id,confirmation.application_record_id,confirmation.requester_user_id," +
      "confirmation.confirmer_user_id," + fromStatus + "," + toStatus + ",'" + action + "'," +
      version + ",'" + actorId + "','" + requestId + "',confirmation.requested_at," +
      "confirmation.expires_at from public.hall_of_fame_record_confirmations confirmation " +
      "where confirmation.application_record_id='" + recordId + "';"
    );
    let fixture;
      const seeded = execute(sql(
        "\\set ON_ERROR_STOP on",
        "begin;",
        "insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values",
        "('" + actor.admin + "','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hof-disposable-admin@example.invalid','',now(),now(),now()),",
        "('" + actor.target + "','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hof-disposable-target@example.invalid','',now(),now(),now()),",
        "('" + actor.successor + "','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hof-disposable-successor@example.invalid','',now(),now(),now()),",
        "('" + actor.confirmer + "','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hof-disposable-confirmer@example.invalid','',now(),now(),now());",
        "select id as club_id from public.clubs where club_status='active' and not exists (select 1 from public.club_memberships m join public.club_role_assignments r on r.membership_id=m.id where m.club_id=clubs.id and r.role_code='club_admin') order by legacy_key limit 1 \\gset",
        "select set_config('request.jwt.claim.role','service_role',true);",
        "set local role service_role;",
        "select * from public.appoint_initial_club_admin(:'club_id', '" + actor.admin + "', '" + actor.admin + "', '" + request.appoint + "', 'Disposable HOF concurrency fixture');",
        "reset role;",
        "set local role authenticated;",
        "select set_config('request.jwt.claim.role','authenticated',true);",
        "select set_config('request.jwt.claim.sub','" + actor.admin + "',true);",
        "select * from public.activate_club_membership(:'club_id','" + actor.target + "','" + request.activateTarget + "','Disposable target membership') \\gset target_activation_",
        "select * from public.activate_club_membership(:'club_id','" + actor.successor + "','" + request.activateSuccessor + "','Disposable successor membership');",
        "select * from public.create_hall_of_fame_application_draft('club_nomination', :'club_id', '" + request.draft + "') \\gset draft_",
        "select * from public.set_hall_of_fame_round_snapshot(:'draft_application_batch_id', :draft_batch_version, date '2026-08-01', null, 'Disposable Course', 'Seoul', 'outdoor', null, 'practice', null, 'Concurrency fixture', '" + request.round + "') \\gset round_",
        "select * from public.add_hall_of_fame_application_record(:'draft_application_batch_id', :round_batch_version, '" + actor.target + "', :'target_activation_membership_id', 'hole_in_one', 'a', 1, 3, 1, '" + request.recordOne + "') \\gset record_one_",
        "select * from public.add_hall_of_fame_application_record(:'draft_application_batch_id', :record_one_batch_version, '" + actor.target + "', :'target_activation_membership_id', 'hole_in_one', 'b', 2, 3, 1, '" + request.recordTwo + "') \\gset record_two_",
        "commit;",
      ));
      assert.equal(seeded.status, 0, seeded.stdout + "\n" + seeded.stderr);

      fixture = queryJson(
        "select jsonb_build_object(" +
          "'clubId',(select nominating_club_id from public.hall_of_fame_application_batches where created_by_user_id='" + actor.admin + "' and status='draft')," +
          "'batchId',(select id from public.hall_of_fame_application_batches where created_by_user_id='" + actor.admin + "' and status='draft')," +
          "'recordOne',(select id from public.hall_of_fame_application_records where target_user_id='" + actor.target + "' and hole_number=1)," +
          "'recordTwo',(select id from public.hall_of_fame_application_records where target_user_id='" + actor.target + "' and hole_number=2)," +
          "'batchVersion',(select version from public.hall_of_fame_application_batches where created_by_user_id='" + actor.admin + "' and status='draft')" +
        ")::text;",
      );
      assert.equal(fixture.batchVersion, 4);

      const grant = sql(
        "\\set ON_ERROR_STOP on",
        "begin;",
        "set local role authenticated;",
        "select set_config('request.jwt.claim.sub','" + actor.target + "',true);",
        "select * from public.set_hall_of_fame_application_consent('" + fixture.recordOne + "','application_processing','grant','hof-policy-v1',4,'" + request.grantRace + "');",
        "select pg_sleep(2);",
        "commit;",
      );
      const withdraw = sql(
        "\\set ON_ERROR_STOP on",
        "\\set VERBOSITY verbose",
        "begin;",
        "set local role authenticated;",
        "select set_config('request.jwt.claim.sub','" + actor.target + "',true);",
        "select * from public.set_hall_of_fame_application_consent('" + fixture.recordOne + "','application_processing','withdraw','hof-policy-v1',4,'" + request.withdrawRace + "');",
        "commit;",
      );
      const grantPromise = executeAsync(grant);
      await wait(300);
      const withdrawPromise = executeAsync(withdraw);
      const [grantResult, withdrawResult] = await Promise.all([grantPromise, withdrawPromise]);
      assert.equal(grantResult.code, 0, grantResult.stdout + "\n" + grantResult.stderr);
      assert.notEqual(withdrawResult.code, 0);
      assert.match(withdrawResult.stderr + "\n" + withdrawResult.stdout, /PT409.*HOF_STALE_APPLICATION_VERSION|HOF_STALE_APPLICATION_VERSION.*PT409/s);

      const grantState = queryJson(`
        select jsonb_build_object(
          'status', consent.status,
          'batchVersion', batch.version,
          'recordVersion', record.version,
          'currentContract', consent.application_batch_id = '${fixture.batchId}'
            and consent.subject_user_id = '${actor.target}'
            and consent.policy_version = 'hof-policy-v1'
            and consent.version = 1
            and consent.last_actor_user_id = '${actor.target}'
            and consent.last_request_id = '${request.grantRace}',
          'historyContract', exists (
            select 1
            from public.hall_of_fame_application_consent_history as history
            where history.application_consent_id = consent.id
              and history.application_record_id = '${fixture.recordOne}'
              and history.application_batch_id = '${fixture.batchId}'
              and history.subject_user_id = '${actor.target}'
              and history.consent_purpose = 'application_processing'
              and history.policy_version = 'hof-policy-v1'
              and history.from_status is null
              and history.to_status = 'granted'
              and history.version = 1
              and history.actor_user_id = '${actor.target}'
              and history.request_id = '${request.grantRace}'
          ),
          'applicationHistoryCount', (
            select count(*)
            from public.hall_of_fame_application_history as history
            where history.actor_user_id = '${actor.target}'
              and history.request_id = '${request.grantRace}'
              and history.action = 'hall_of_fame.application_consent.grant'
              and history.application_batch_id = '${fixture.batchId}'
              and history.from_status = 'draft'
              and history.to_status = 'draft'
              and (
                (history.scope = 'batch' and history.application_record_id is null and history.version = 5)
                or
                (history.scope = 'record' and history.application_record_id = '${fixture.recordOne}' and history.version = 2)
              )
          ),
          'auditContract', exists (
            select 1
            from public.audit_logs as audit
            where audit.actor_id = '${actor.target}'
              and audit.action = 'hall_of_fame.application_consent.grant'
              and audit.target_type = 'hall_of_fame_application_consent'
              and audit.target_id = consent.id::text
              and audit.request_id = '${request.grantRace}'
              and audit.outcome = 'success'
              and audit.reason is null
              and audit.before_summary is null
              and audit.after_summary = jsonb_build_object(
                'status', 'granted',
                'entity_version', 1,
                'record_version', 2,
                'batch_version', 5
              )
              and audit.metadata = jsonb_build_object(
                'application_batch_id', '${fixture.batchId}'::uuid,
                'application_record_id', '${fixture.recordOne}'::uuid
              )
          ),
          'ledgerContract', exists (
            select 1
            from private.hall_of_fame_mutation_requests as ledger
            where ledger.actor_user_id = '${actor.target}'
              and ledger.request_id = '${request.grantRace}'
              and ledger.operation = 'hall_of_fame.application_consent.grant'
              and ledger.application_batch_id = '${fixture.batchId}'
              and ledger.application_record_id = '${fixture.recordOne}'
              and ledger.target_user_id = '${actor.target}'
              and octet_length(ledger.payload_fingerprint) = 32
              and ledger.status = 'completed'
              and ledger.completed_at is not null
              and ledger.result_payload @> jsonb_build_object(
                'application_batch_id', '${fixture.batchId}'::uuid,
                'application_record_id', '${fixture.recordOne}'::uuid,
                'consent_id', consent.id,
                'consent_purpose', 'application_processing',
                'status', 'granted',
                'consent_version', 1,
                'batch_version', 5,
                'record_version', 2,
                'changed', true
              )
          ),
          'loserLedgerCount', (
            select count(*) from private.hall_of_fame_mutation_requests
            where actor_user_id = '${actor.target}' and request_id = '${request.withdrawRace}'
          ),
          'loserAuditCount', (
            select count(*) from public.audit_logs where request_id = '${request.withdrawRace}'
          ),
          'loserConsentHistoryCount', (
            select count(*) from public.hall_of_fame_application_consent_history
            where request_id = '${request.withdrawRace}'
          ),
          'loserApplicationHistoryCount', (
            select count(*) from public.hall_of_fame_application_history
            where request_id = '${request.withdrawRace}'
          )
        )::text
        from public.hall_of_fame_application_consents as consent
        join public.hall_of_fame_application_batches as batch
          on batch.id = consent.application_batch_id
        join public.hall_of_fame_application_records as record
          on record.id = consent.application_record_id
        where consent.application_record_id = '${fixture.recordOne}'
          and consent.consent_purpose = 'application_processing';
      `);
      assert.deepEqual(grantState, {
        status: "granted",
        batchVersion: 5,
        recordVersion: 2,
        currentContract: true,
        historyContract: true,
        applicationHistoryCount: 2,
        auditContract: true,
        ledgerContract: true,
        loserLedgerCount: 0,
        loserAuditCount: 0,
        loserConsentHistoryCount: 0,
        loserApplicationHistoryCount: 0,
      });

      const prepared = execute(sql(
        "\\set ON_ERROR_STOP on",
        "begin;",
        "set local role authenticated;",
        "select set_config('request.jwt.claim.sub','" + actor.target + "',true);",
        "select * from public.set_hall_of_fame_application_consent('" + fixture.recordOne + "','nomination_acceptance','grant','hof-policy-v1',5,'" + request.nominationGrant + "');",
        "select * from public.set_hall_of_fame_application_consent('" + fixture.recordOne + "','nomination_acceptance','withdraw','hof-policy-v1',6,'" + request.nominationWithdraw + "');",
        "commit;",
      ));
      assert.equal(prepared.status, 0, prepared.stdout + "\n" + prepared.stderr);

      const reissue = sql(
        "\\set ON_ERROR_STOP on",
        "begin;",
        "set local role authenticated;",
        "select set_config('request.jwt.claim.sub','" + actor.admin + "',true);",
        "select * from public.reissue_hall_of_fame_nomination_consent_request('" + fixture.recordOne + "',7,'" + request.reissue + "');",
        "select pg_sleep(2);",
        "commit;",
      );
      const overlappingReissue = sql(
        "\\set ON_ERROR_STOP on",
        "\\set VERBOSITY verbose",
        "begin;",
        "set local role authenticated;",
        "select set_config('request.jwt.claim.sub','" + actor.admin + "',true);",
        "select * from public.reissue_hall_of_fame_nomination_consent_request('" + fixture.recordOne + "',7,'" + request.reissue + "');",
        "commit;",
      );
      const reissuePromise = executeAsync(reissue);
      await wait(300);
      const overlapPromise = executeAsync(overlappingReissue);
      const [reissueResult, overlapResult] = await Promise.all([reissuePromise, overlapPromise]);
      assert.equal(reissueResult.code, 0, reissueResult.stdout + "\n" + reissueResult.stderr);
      assert.notEqual(overlapResult.code, 0);
      assert.match(overlapResult.stderr + "\n" + overlapResult.stdout, /PT409.*HOF_REQUEST_IN_PROGRESS|HOF_REQUEST_IN_PROGRESS.*PT409/s);

      const replay = execute(sql(
        "\\set ON_ERROR_STOP on",
        "\\pset tuples_only on",
        "\\pset format unaligned",
        "begin;",
        "set local role authenticated;",
        "select set_config('request.jwt.claim.sub','" + actor.admin + "',true);",
        "select replayed from public.reissue_hall_of_fame_nomination_consent_request('" + fixture.recordOne + "',7,'" + request.reissue + "');",
        "commit;",
      ));
      assert.equal(replay.status, 0, replay.stdout + "\n" + replay.stderr);
      assert.equal(replay.stdout.trim().split(/\r?\n/).at(-1), "t");

      const mismatch = execute(sql(
        "\\set ON_ERROR_STOP on",
        "\\set VERBOSITY verbose",
        "begin;",
        "set local role authenticated;",
        "select set_config('request.jwt.claim.sub','" + actor.admin + "',true);",
        "select * from public.reissue_hall_of_fame_nomination_consent_request('" + fixture.recordOne + "',8,'" + request.reissue + "');",
        "commit;",
      ));
      assert.notEqual(mismatch.status, 0);
      assert.match(mismatch.stderr + "\n" + mismatch.stdout, /22023.*HOF_REQUEST_ID_PAYLOAD_MISMATCH|HOF_REQUEST_ID_PAYLOAD_MISMATCH.*22023/s);

      const reissueState = queryJson(
        "select jsonb_build_object(" +
          "'status',(select status from public.hall_of_fame_application_consents where application_record_id='" + fixture.recordOne + "' and consent_purpose='nomination_acceptance')," +
          "'consentVersion',(select version from public.hall_of_fame_application_consents where application_record_id='" + fixture.recordOne + "' and consent_purpose='nomination_acceptance')," +
          "'batchVersion',(select version from public.hall_of_fame_application_batches where id='" + fixture.batchId + "')," +
          "'recordVersion',(select version from public.hall_of_fame_application_records where id='" + fixture.recordOne + "')," +
          "'historyCount',(select count(*) from public.hall_of_fame_application_consent_history where application_record_id='" + fixture.recordOne + "' and consent_purpose='nomination_acceptance')," +
          "'auditCount',(select count(*) from public.audit_logs where request_id='" + request.reissue + "')," +
          "'ledgerCount',(select count(*) from private.hall_of_fame_mutation_requests where actor_user_id='" + actor.admin + "' and request_id='" + request.reissue + "' and status='completed')" +
        ")::text;",
      );
      assert.deepEqual(reissueState, {
        status: "pending",
        consentVersion: 3,
        batchVersion: 8,
        recordVersion: 5,
        historyCount: 3,
        auditCount: 1,
        ledgerCount: 1,
      });

      const preparedForRoleRace = execute(sql(
        "\\set ON_ERROR_STOP on",
        "begin;",
        "set local role authenticated;",
        "select set_config('request.jwt.claim.sub','" + actor.target + "',true);",
        "select * from public.set_hall_of_fame_publication_consent('" + fixture.recordOne + "','set','hof-policy-v1',true,false,true,true,false,false,true,8,'" + request.publication + "');",
        "select set_config('request.jwt.claim.sub','" + actor.admin + "',true);",
        "select * from public.request_hall_of_fame_record_confirmation('" + fixture.recordOne + "','" + actor.confirmer + "',9,'" + request.confirmation + "');",
        "commit;",
      ));
      assert.equal(preparedForRoleRace.status, 0, preparedForRoleRace.stdout + "\n" + preparedForRoleRace.stderr);

      const transfer = sql(
        "\\set ON_ERROR_STOP on",
        "begin;",
        "set local role authenticated;",
        "select set_config('request.jwt.claim.sub','" + actor.admin + "',true);",
        "select * from public.transfer_club_admin('" + fixture.clubId + "','" + actor.successor + "','" + request.transfer + "','Disposable role revoke race');",
        "select pg_sleep(2);",
        "commit;",
      );
      const confirmationAfterRevoke = sql(
        "\\set ON_ERROR_STOP on",
        "\\set VERBOSITY verbose",
        "begin;",
        "set local role authenticated;",
        "select set_config('request.jwt.claim.sub','" + actor.admin + "',true);",
        "select * from public.request_hall_of_fame_record_confirmation('" + fixture.recordTwo + "','" + actor.confirmer + "',10,'" + request.blockedConfirmation + "');",
        "commit;",
      );
      const transferPromise = executeAsync(transfer);
      await wait(300);
      const blockedPromise = executeAsync(confirmationAfterRevoke);
      const [transferResult, blockedResult] = await Promise.all([transferPromise, blockedPromise]);
      assert.equal(transferResult.code, 0, transferResult.stdout + "\n" + transferResult.stderr);
      assert.notEqual(blockedResult.code, 0);
      assert.match(blockedResult.stderr + "\n" + blockedResult.stdout, /HOF_PERMISSION_DENIED/);
      assert.doesNotMatch(blockedResult.stderr + "\n" + blockedResult.stdout, /deadlock detected/i);

      const postRevoke = execute(sql(
        "\\set ON_ERROR_STOP on",
        "begin;",
        "set local role authenticated;",
        "select set_config('request.jwt.claim.sub','" + actor.admin + "',true);",
        "select * from public.request_hall_of_fame_record_confirmation('" + fixture.recordTwo + "','" + actor.confirmer + "',10,'" + request.postRevokeConfirmation + "');",
        "commit;",
      ));
      assert.notEqual(postRevoke.status, 0);
      assert.match(postRevoke.stderr + "\n" + postRevoke.stdout, /HOF_PERMISSION_DENIED/);

      const roleState = queryJson(`
        select jsonb_build_object(
          'oldAdminActive', (
            select count(*)
            from public.club_role_assignments as assignment
            join public.club_memberships as membership on membership.id = assignment.membership_id
            where membership.club_id = '${fixture.clubId}'
              and membership.user_id = '${actor.admin}'
              and assignment.role_code = 'club_admin'
              and assignment.revoked_at is null
          ),
          'oldAdminRevokedByActor', (
            select count(*)
            from public.club_role_assignments as assignment
            join public.club_memberships as membership on membership.id = assignment.membership_id
            where membership.club_id = '${fixture.clubId}'
              and membership.user_id = '${actor.admin}'
              and assignment.role_code = 'club_admin'
              and assignment.revoked_at is not null
              and assignment.revoked_by = '${actor.admin}'
          ),
          'newAdminActive', (
            select count(*)
            from public.club_role_assignments as assignment
            join public.club_memberships as membership on membership.id = assignment.membership_id
            where membership.club_id = '${fixture.clubId}'
              and membership.user_id = '${actor.successor}'
              and assignment.role_code = 'club_admin'
              and assignment.revoked_at is null
              and assignment.assigned_by = '${actor.admin}'
          ),
          'confirmationCount', (
            select count(*) from public.hall_of_fame_record_confirmations
            where application_record_id = '${fixture.recordTwo}'
          ),
          'confirmationHistoryCount', (
            select count(*) from public.hall_of_fame_record_confirmation_history
            where application_record_id = '${fixture.recordTwo}'
          ),
          'batchVersion', (
            select version from public.hall_of_fame_application_batches where id = '${fixture.batchId}'
          ),
          'recordVersion', (
            select version from public.hall_of_fame_application_records where id = '${fixture.recordTwo}'
          ),
          'blockedLedgerCount', (
            select count(*) from private.hall_of_fame_mutation_requests
            where request_id in ('${request.blockedConfirmation}', '${request.postRevokeConfirmation}')
          ),
          'blockedAuditCount', (
            select count(*) from public.audit_logs
            where request_id in ('${request.blockedConfirmation}', '${request.postRevokeConfirmation}')
          ),
          'blockedApplicationHistoryCount', (
            select count(*) from public.hall_of_fame_application_history
            where request_id in ('${request.blockedConfirmation}', '${request.postRevokeConfirmation}')
          ),
          'transferLedgerContract', exists (
            select 1
            from private.club_mutation_requests as ledger
            where ledger.actor_id = '${actor.admin}'
              and ledger.request_id = '${request.transfer}'
              and ledger.action_code = 'role.transfer_admin'
              and ledger.club_id = '${fixture.clubId}'
              and ledger.target_user_id = '${actor.successor}'
              and ledger.role_code = 'club_admin'
              and btrim(ledger.input_fingerprint) <> ''
              and ledger.outcome = 'success'
              and ledger.completed_at is not null
              and ledger.result_data @> jsonb_build_object(
                'action_code', 'role.transfer_admin',
                'club_id', '${fixture.clubId}'::uuid,
                'previous_admin_user_id', '${actor.admin}'::uuid,
                'new_admin_user_id', '${actor.successor}'::uuid,
                'changed', true,
                'outcome', 'success'
              )
          ),
          'transferAuditContract', exists (
            select 1
            from public.audit_logs as audit
            where audit.actor_id = '${actor.admin}'
              and audit.actor_type = 'operator'
              and audit.action = 'role.transfer_admin'
              and audit.target_type = 'club_admin_transfer'
              and audit.target_id = '${fixture.clubId}'
              and audit.club_id = '${fixture.clubId}'
              and audit.request_id = '${request.transfer}'
              and audit.outcome = 'success'
              and audit.reason = 'Disposable role revoke race'
              and audit.before_summary @> jsonb_build_object(
                'previous_admin_user_id', '${actor.admin}'::uuid,
                'new_admin_user_id', '${actor.successor}'::uuid
              )
              and audit.after_summary @> jsonb_build_object(
                'previous_admin_user_id', '${actor.admin}'::uuid,
                'new_admin_user_id', '${actor.successor}'::uuid,
                'current_admin_count', 1
              )
              and audit.metadata @> jsonb_build_object(
                'previous_admin_assignment_revoked', true,
                'new_admin_assignment_created', true
              )
              and not (audit.metadata ?| array['email', 'token', 'secret', 'otp'])
          )
        )::text;
      `);
      assert.deepEqual(roleState, {
        oldAdminActive: 0,
        oldAdminRevokedByActor: 1,
        newAdminActive: 1,
        confirmationCount: 0,
        confirmationHistoryCount: 0,
        batchVersion: 10,
        recordVersion: 1,
        blockedLedgerCount: 0,
        blockedAuditCount: 0,
        blockedApplicationHistoryCount: 0,
        transferLedgerContract: true,
        transferAuditContract: true,
      });

      const historyGuardBaseline = queryJson(
        "select jsonb_build_object(" +
          "'applicationCurrent',(select count(*) from public.hall_of_fame_application_consents)," +
          "'applicationHistory',(select count(*) from public.hall_of_fame_application_consent_history)," +
          "'publicationCurrent',(select count(*) from public.hall_of_fame_publication_consents)," +
          "'publicationHistory',(select count(*) from public.hall_of_fame_publication_consent_history)," +
          "'confirmationCurrent',(select count(*) from public.hall_of_fame_record_confirmations)," +
          "'confirmationHistory',(select count(*) from public.hall_of_fame_record_confirmation_history)," +
          "'audit',(select count(*) from public.audit_logs)," +
          "'ledger',(select count(*) from private.hall_of_fame_mutation_requests)" +
        ")::text;",
      );

      ledgerBoundHistoryAttempt({
        actorId: actor.target,
        expectedError: "HOF_APPLICATION_CONSENT_HISTORY_CHAIN_MISMATCH",
        label: "application history version 1 rejects non-null from_status",
        operation: "hall_of_fame.application_consent.grant",
        recordId: fixture.recordTwo,
        statements: (requestId) => [
          "insert into public.hall_of_fame_application_consents(id,application_batch_id," +
            "application_record_id,subject_user_id,consent_purpose,policy_version,status,version," +
            "granted_at,last_actor_user_id,last_request_id) values(" +
            "'fa000000-0000-0000-0000-000000000001','" + fixture.batchId + "','" +
            fixture.recordTwo + "','" + actor.target + "','evidence_review','hof-policy-v1'," +
            "'granted',1,now(),'" + actor.target + "','" + requestId + "');",
          applicationHistoryInsert({
            fromStatus: "'pending'",
            purpose: "evidence_review",
            recordId: fixture.recordTwo,
            requestId,
          }),
        ],
      });
      ledgerBoundHistoryAttempt({
        actorId: actor.target,
        expectedError: "HOF_APPLICATION_CONSENT_HISTORY_CHAIN_MISMATCH",
        label: "application history rejects previous status mismatch",
        operation: "hall_of_fame.application_consent.withdraw",
        recordId: fixture.recordOne,
        statements: (requestId) => [
          "update public.hall_of_fame_application_consents set status='withdrawn',version=2," +
            "withdrawn_at=now(),last_actor_user_id='" + actor.target + "',last_request_id='" +
            requestId + "' where application_record_id='" + fixture.recordOne +
            "' and consent_purpose='application_processing';",
          applicationHistoryInsert({ fromStatus: "'declined'", requestId }),
        ],
      });
      {
        const skippedVersionRequest = nextHistoryGuardRequest();
        ledgerBoundHistoryAttempt({
          actorId: actor.target,
          expectedError: "HOF_APPLICATION_CONSENT_HISTORY_CHAIN_MISMATCH",
          label: "application history rejects a skipped version",
          operation: "hall_of_fame.application_consent.withdraw",
          recordId: fixture.recordOne,
          statements: (requestId) => [
            "update public.hall_of_fame_application_consents set status='withdrawn',version=2," +
              "withdrawn_at=now(),last_actor_user_id='" + actor.target + "',last_request_id='" +
              requestId + "' where application_record_id='" + fixture.recordOne +
              "' and consent_purpose='application_processing';",
            "select * from private.hall_of_fame_claim_request('" + actor.target + "','" +
              skippedVersionRequest + "','hall_of_fame.application_consent.withdraw','" +
              fixture.batchId + "','" + fixture.recordOne + "','" + actor.target +
              "',decode(repeat('ac',32),'hex'));",
            "update public.hall_of_fame_application_consents set version=3,last_request_id='" +
              skippedVersionRequest + "' where application_record_id='" + fixture.recordOne +
              "' and consent_purpose='application_processing';",
            applicationHistoryInsert({
              fromStatus: "'withdrawn'",
              requestId: skippedVersionRequest,
            }),
          ],
        });
      }
      ledgerBoundHistoryAttempt({
        actorId: actor.target,
        expectedError: "HOF_APPLICATION_CONSENT_HISTORY_CONTEXT_MISMATCH",
        label: "application history rejects a current status mismatch",
        operation: "hall_of_fame.application_consent.grant",
        recordId: fixture.recordOne,
        statements: (requestId) => [
          "update public.hall_of_fame_application_consents set status='withdrawn',version=2," +
            "withdrawn_at=now(),last_actor_user_id='" + actor.target + "',last_request_id='" +
            requestId + "' where application_record_id='" + fixture.recordOne +
            "' and consent_purpose='application_processing';",
          applicationHistoryInsert({ fromStatus: "'granted'", requestId, toStatus: "'granted'" }),
        ],
      });
      ledgerBoundHistoryAttempt({
        actorId: actor.target,
        expectedError: "HOF_APPLICATION_CONSENT_HISTORY_CONTEXT_MISMATCH",
        label: "application history rejects a current version mismatch",
        operation: "hall_of_fame.application_consent.withdraw",
        recordId: fixture.recordOne,
        statements: (requestId) => [
          "update public.hall_of_fame_application_consents set status='withdrawn',version=2," +
            "withdrawn_at=now(),last_actor_user_id='" + actor.target + "',last_request_id='" +
            requestId + "' where application_record_id='" + fixture.recordOne +
            "' and consent_purpose='application_processing';",
          applicationHistoryInsert({ fromStatus: "null", requestId, version: "1" }),
        ],
      });
      ledgerBoundHistoryAttempt({
        actorId: actor.target,
        expectedError: "HOF_APPLICATION_CONSENT_HISTORY_CONTEXT_MISMATCH",
        label: "application history rejects a wrong-operation ledger",
        operation: "hall_of_fame.publication_consent.set",
        recordId: fixture.recordOne,
        statements: (requestId) => [applicationHistoryInsert({ fromStatus: "null", requestId })],
      });
      ledgerBoundHistoryAttempt({
        actorId: actor.successor,
        expectedError: "HOF_APPLICATION_CONSENT_HISTORY_CONTEXT_MISMATCH",
        label: "application history rejects a wrong-actor ledger",
        operation: "hall_of_fame.application_consent.grant",
        recordId: fixture.recordOne,
        statements: (requestId) => [applicationHistoryInsert({
          actorId: actor.successor,
          fromStatus: "null",
          requestId,
        })],
      });
      {
        const completedLedger = execute(sql(
          "\\set ON_ERROR_STOP on",
          "\\set VERBOSITY verbose",
          "begin;",
          "select set_config('request.jwt.claim.sub','" + actor.target + "',true);",
          "select private.set_hall_of_fame_mutation_context('" + actor.target + "','" +
            request.grantRace + "','hall_of_fame.application_consent.grant','" +
            fixture.batchId + "','" + fixture.recordOne + "',encode((select payload_fingerprint " +
            "from private.hall_of_fame_mutation_requests where actor_user_id='" + actor.target +
            "' and request_id='" + request.grantRace + "'),'hex'));",
          applicationHistoryInsert({ fromStatus: "null", requestId: request.grantRace }),
          "commit;",
        ));
        assert.notEqual(completedLedger.status, 0);
        assert.match(completedLedger.stderr + "\n" + completedLedger.stdout, /42501.*HOF_MUTATION_RPC_REQUIRED|HOF_MUTATION_RPC_REQUIRED.*42501/s);
      }

      ledgerBoundHistoryAttempt({
        actorId: actor.target,
        expectedError: "HOF_PUBLICATION_CONSENT_HISTORY_CHAIN_MISMATCH",
        label: "publication history version 1 rejects non-null from_status",
        operation: "hall_of_fame.publication_consent.set",
        recordId: fixture.recordTwo,
        statements: (requestId) => [
          "insert into public.hall_of_fame_publication_consents(application_record_id," +
            "target_user_id,status,display_name_consent,masked_display_name_consent," +
            "full_display_name_consent,avatar_consent,club_name_consent,record_date_consent," +
            "course_detail_consent,badge_consent,policy_version,version,consented_at," +
            "last_actor_user_id,last_request_id) values('" + fixture.recordTwo + "','" +
            actor.target + "','granted',true,true,false,false,false,true,true,true," +
            "'hof-policy-v1',1,now(),'" + actor.target + "','" + requestId + "');",
          publicationHistoryInsert({ fromStatus: "'pending'", recordId: fixture.recordTwo, requestId }),
        ],
      });
      ledgerBoundHistoryAttempt({
        actorId: actor.target,
        expectedError: "HOF_PUBLICATION_CONSENT_HISTORY_CHAIN_MISMATCH",
        label: "publication history rejects previous status mismatch",
        operation: "hall_of_fame.publication_consent.withdraw",
        recordId: fixture.recordOne,
        statements: (requestId) => [
          "update public.hall_of_fame_publication_consents set status='withdrawn',version=2," +
            "withdrawn_at=now(),last_actor_user_id='" + actor.target + "',last_request_id='" +
            requestId + "' where application_record_id='" + fixture.recordOne + "';",
          publicationHistoryInsert({ fromStatus: "'declined'", requestId }),
        ],
      });
      {
        const skippedVersionRequest = nextHistoryGuardRequest();
        ledgerBoundHistoryAttempt({
          actorId: actor.target,
          expectedError: "HOF_PUBLICATION_CONSENT_HISTORY_CHAIN_MISMATCH",
          label: "publication history rejects a skipped version",
          operation: "hall_of_fame.publication_consent.withdraw",
          recordId: fixture.recordOne,
          statements: (requestId) => [
            "update public.hall_of_fame_publication_consents set status='withdrawn',version=2," +
              "withdrawn_at=now(),last_actor_user_id='" + actor.target + "',last_request_id='" +
              requestId + "' where application_record_id='" + fixture.recordOne + "';",
            "select * from private.hall_of_fame_claim_request('" + actor.target + "','" +
              skippedVersionRequest + "','hall_of_fame.publication_consent.withdraw','" +
              fixture.batchId + "','" + fixture.recordOne + "','" + actor.target +
              "',decode(repeat('ad',32),'hex'));",
            "update public.hall_of_fame_publication_consents set version=3,last_request_id='" +
              skippedVersionRequest + "' where application_record_id='" + fixture.recordOne + "';",
            publicationHistoryInsert({ fromStatus: "'withdrawn'", requestId: skippedVersionRequest }),
          ],
        });
      }
      ledgerBoundHistoryAttempt({
        actorId: actor.target,
        expectedError: "HOF_PUBLICATION_CONSENT_HISTORY_CONTEXT_MISMATCH",
        label: "publication history rejects a current mismatch",
        operation: "hall_of_fame.publication_consent.set",
        recordId: fixture.recordOne,
        statements: (requestId) => [
          "update public.hall_of_fame_publication_consents set status='withdrawn',version=2," +
            "withdrawn_at=now(),last_actor_user_id='" + actor.target + "',last_request_id='" +
            requestId + "' where application_record_id='" + fixture.recordOne + "';",
          publicationHistoryInsert({ fromStatus: "'granted'", requestId, toStatus: "'granted'" }),
        ],
      });
      ledgerBoundHistoryAttempt({
        actorId: actor.target,
        expectedError: "HOF_PUBLICATION_CONSENT_HISTORY_CONTEXT_MISMATCH",
        label: "publication history rejects a wrong-operation ledger",
        operation: "hall_of_fame.application_consent.grant",
        recordId: fixture.recordOne,
        statements: (requestId) => [publicationHistoryInsert({ fromStatus: "null", requestId })],
      });
      ledgerBoundHistoryAttempt({
        actorId: actor.successor,
        expectedError: "HOF_PUBLICATION_CONSENT_HISTORY_CONTEXT_MISMATCH",
        label: "publication history rejects a wrong-actor ledger",
        operation: "hall_of_fame.publication_consent.set",
        recordId: fixture.recordOne,
        statements: (requestId) => [publicationHistoryInsert({
          actorId: actor.successor,
          fromStatus: "null",
          requestId,
        })],
      });

      ledgerBoundHistoryAttempt({
        actorId: actor.admin,
        expectedError: "HOF_CONFIRMATION_HISTORY_CHAIN_MISMATCH",
        label: "confirmation history version 1 rejects non-null from_status",
        operation: "hall_of_fame.confirmation.request",
        recordId: fixture.recordTwo,
        targetId: actor.confirmer,
        statements: (requestId) => [
          "insert into public.hall_of_fame_record_confirmations(id,application_record_id," +
            "requester_user_id,confirmer_user_id,confirmation_role,status,version,requested_at," +
            "expires_at,last_actor_user_id,last_request_id) values(" +
            "'fc000000-0000-0000-0000-000000000001','" + fixture.recordTwo + "','" +
            actor.admin + "','" + actor.confirmer + "','round_companion','pending',1,now()," +
            "now()+interval '14 days','" + actor.admin + "','" + requestId + "');",
          confirmationHistoryInsert({
            action: "hall_of_fame.confirmation.request",
            actorId: actor.admin,
            fromStatus: "'confirmed'",
            recordId: fixture.recordTwo,
            requestId,
          }),
        ],
      });
      ledgerBoundHistoryAttempt({
        actorId: actor.confirmer,
        expectedError: "HOF_CONFIRMATION_HISTORY_CHAIN_MISMATCH",
        label: "confirmation history rejects previous status mismatch",
        operation: "hall_of_fame.confirmation.confirm",
        recordId: fixture.recordOne,
        targetId: actor.confirmer,
        statements: (requestId) => [
          "update public.hall_of_fame_record_confirmations set status='confirmed',version=2," +
            "confirmed_at=now(),responded_at=now(),last_actor_user_id='" + actor.confirmer +
            "',last_request_id='" + requestId + "' where application_record_id='" +
            fixture.recordOne + "';",
          confirmationHistoryInsert({
            action: "hall_of_fame.confirmation.confirm",
            actorId: actor.confirmer,
            fromStatus: "'declined'",
            requestId,
          }),
        ],
      });
      {
        const skippedVersionRequest = nextHistoryGuardRequest();
        ledgerBoundHistoryAttempt({
          actorId: actor.confirmer,
          expectedError: "HOF_CONFIRMATION_HISTORY_CHAIN_MISMATCH",
          label: "confirmation history rejects a skipped version",
          operation: "hall_of_fame.confirmation.confirm",
          recordId: fixture.recordOne,
          targetId: actor.confirmer,
          statements: (requestId) => [
            "update public.hall_of_fame_record_confirmations set status='confirmed',version=2," +
              "confirmed_at=now(),responded_at=now(),last_actor_user_id='" + actor.confirmer +
              "',last_request_id='" + requestId + "' where application_record_id='" +
              fixture.recordOne + "';",
            "select * from private.hall_of_fame_claim_request('" + actor.confirmer + "','" +
              skippedVersionRequest + "','hall_of_fame.confirmation.withdraw','" +
              fixture.batchId + "','" + fixture.recordOne + "','" + actor.confirmer +
              "',decode(repeat('ae',32),'hex'));",
            "update public.hall_of_fame_record_confirmations set status='withdrawn',version=3," +
              "withdrawn_at=now(),last_request_id='" + skippedVersionRequest +
              "' where application_record_id='" + fixture.recordOne + "';",
            confirmationHistoryInsert({
              action: "hall_of_fame.confirmation.withdraw",
              actorId: actor.confirmer,
              fromStatus: "'confirmed'",
              requestId: skippedVersionRequest,
            }),
          ],
        });
      }
      ledgerBoundHistoryAttempt({
        actorId: actor.confirmer,
        expectedError: "HOF_CONFIRMATION_HISTORY_CONTEXT_MISMATCH",
        label: "confirmation history rejects a current mismatch",
        operation: "hall_of_fame.confirmation.confirm",
        recordId: fixture.recordOne,
        targetId: actor.confirmer,
        statements: (requestId) => [
          "update public.hall_of_fame_record_confirmations set status='declined',version=2," +
            "declined_at=now(),responded_at=now(),last_actor_user_id='" + actor.confirmer +
            "',last_request_id='" + requestId + "' where application_record_id='" +
            fixture.recordOne + "';",
          confirmationHistoryInsert({
            action: "hall_of_fame.confirmation.confirm",
            actorId: actor.confirmer,
            fromStatus: "'pending'",
            requestId,
            toStatus: "'confirmed'",
          }),
        ],
      });
      ledgerBoundHistoryAttempt({
        actorId: actor.confirmer,
        expectedError: "HOF_CONFIRMATION_HISTORY_CONTEXT_MISMATCH",
        label: "confirmation history rejects a wrong-operation ledger",
        operation: "hall_of_fame.application_consent.grant",
        recordId: fixture.recordOne,
        targetId: actor.confirmer,
        statements: (requestId) => [confirmationHistoryInsert({
          action: "hall_of_fame.confirmation.confirm",
          actorId: actor.confirmer,
          fromStatus: "null",
          requestId,
        })],
      });
      ledgerBoundHistoryAttempt({
        actorId: actor.successor,
        expectedError: "HOF_CONFIRMATION_HISTORY_CONTEXT_MISMATCH",
        label: "confirmation history rejects a wrong-actor ledger",
        operation: "hall_of_fame.confirmation.request",
        recordId: fixture.recordOne,
        targetId: actor.confirmer,
        statements: (requestId) => [confirmationHistoryInsert({
          action: "hall_of_fame.confirmation.request",
          actorId: actor.successor,
          fromStatus: "null",
          requestId,
        })],
      });

      const historyGuardAfter = queryJson(
        "select jsonb_build_object(" +
          "'applicationCurrent',(select count(*) from public.hall_of_fame_application_consents)," +
          "'applicationHistory',(select count(*) from public.hall_of_fame_application_consent_history)," +
          "'publicationCurrent',(select count(*) from public.hall_of_fame_publication_consents)," +
          "'publicationHistory',(select count(*) from public.hall_of_fame_publication_consent_history)," +
          "'confirmationCurrent',(select count(*) from public.hall_of_fame_record_confirmations)," +
          "'confirmationHistory',(select count(*) from public.hall_of_fame_record_confirmation_history)," +
          "'audit',(select count(*) from public.audit_logs)," +
          "'ledger',(select count(*) from private.hall_of_fame_mutation_requests)" +
        ")::text;",
      );
      assert.deepEqual(historyGuardAfter, historyGuardBaseline);
  },
);
