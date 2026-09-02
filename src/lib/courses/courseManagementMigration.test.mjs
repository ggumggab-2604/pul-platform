import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(fileURLToPath(new URL("../../../supabase/migrations/20260921000100_pul_course_operations_management.sql", import.meta.url)), "utf8");
function docker(args, input) { return spawnSync("docker", args, { encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 }); }
function sql(text, user = "supabase_admin") { return docker(["exec", "-i", container, "psql", "-U", user, "-d", database, "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"], text); }

let container;
let database;

before(() => {
  const found = docker(["ps", "--filter", "name=^supabase_db_pul-platform$", "--format", "{{.Names}}"]).stdout.split(/\r?\n/).filter(Boolean);
  assert.deepEqual(found, ["supabase_db_pul-platform"]);
  container = found[0];
  database = `pul_course_migration_${process.pid}_${Date.now()}`;
  const clone = docker(["exec", container, "sh", "-lc", [
    `createdb -U supabase_admin -O postgres ${database}`,
    `pg_dump -U supabase_admin -d postgres --schema-only | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
    `pg_dump -U supabase_admin -d postgres --data-only --disable-triggers | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
  ].join(" && ")]);
  assert.equal(clone.status, 0, clone.stdout + clone.stderr);

  const removed = sql(`
    drop function public.submit_course_information_report(uuid,text,text,text,text,text,text,text,text);
    drop function public.resolve_course_information_report_for_management(uuid,text,timestamptz,text,uuid);
    drop function public.get_course_information_report_for_management(uuid);
    drop function public.list_course_information_reports_for_management(text,integer,integer);
    drop function private.management_course_report_summary_json(public.course_information_reports);
    drop function public.mutate_managed_course(text,text,timestamptz,uuid,jsonb);
    drop function public.find_course_duplicate_candidates(text,text,text,text);
    drop function public.get_course_for_management(text);
    drop function public.list_courses_for_management(text,text,text,integer,integer);
    drop function private.management_course_json(public.courses);
    drop function private.course_write_audit(uuid,text,text,text,text,jsonb,jsonb,uuid);
    drop function private.course_complete_request(uuid,uuid,jsonb);
    drop function private.course_claim_request(uuid,uuid,text,jsonb);
    drop function private.require_course_manager();
    drop function private.course_actor_has_permission(uuid,text);
    drop table private.course_operation_requests;
    drop index public.course_information_reports_target_created_idx;
    alter table public.course_information_reports
      drop constraint course_information_reports_resolution_note_check,
      drop constraint course_information_reports_resolution_state_check,
      drop column resolved_at,
      drop column resolved_by,
      drop column resolution_note;
    delete from public.platform_role_permissions where permission_code='courses.manage';
    delete from public.platform_permission_definitions where code='courses.manage';
  `, "postgres");
  assert.equal(removed.status, 0, removed.stdout + removed.stderr);
});

after(() => {
  if (container && database) assert.equal(docker(["exec", container, "dropdb", "--if-exists", "--force", "-U", "supabase_admin", database]).status, 0);
});

test("the complete forward migration applies once to the exact 74-migration-equivalent catalog", () => {
  const applied = sql(`begin; ${migration}\ncommit;`, "postgres");
  assert.equal(applied.status, 0, applied.stdout + applied.stderr);
  const catalog = sql(`select concat_ws(',',
    (select count(*) from public.platform_permission_definitions where code='courses.manage' and is_active),
    (select count(*) from public.platform_role_permissions where permission_code='courses.manage' and platform_role='platform_admin'),
    (select count(*) from information_schema.columns where table_schema='public' and table_name='course_information_reports' and column_name in ('resolved_at','resolved_by','resolution_note')),
    (select count(*) from pg_proc where oid in (
      'public.list_courses_for_management(text,text,text,integer,integer)'::regprocedure,
      'public.mutate_managed_course(text,text,timestamptz,uuid,jsonb)'::regprocedure,
      'public.list_course_information_reports_for_management(text,integer,integer)'::regprocedure,
      'public.resolve_course_information_report_for_management(uuid,text,timestamptz,text,uuid)'::regprocedure
    )),
    (select count(*) from pg_class where oid='private.course_operation_requests'::regclass and relrowsecurity and relforcerowsecurity)
  );`, "postgres");
  assert.equal(catalog.status, 0, catalog.stdout + catalog.stderr);
  assert.equal(catalog.stdout.trim(), "1,1,3,4,1");
});

test("the effective ACL exposes public RPCs only to authenticated and keeps tables closed", () => {
  const acl = sql(`select concat_ws(',',
    has_function_privilege('authenticated','public.mutate_managed_course(text,text,timestamptz,uuid,jsonb)','execute'),
    has_function_privilege('anon','public.mutate_managed_course(text,text,timestamptz,uuid,jsonb)','execute'),
    has_function_privilege('authenticator','public.mutate_managed_course(text,text,timestamptz,uuid,jsonb)','execute'),
    has_table_privilege('authenticated','public.courses','update'),
    has_table_privilege('authenticated','private.course_operation_requests','select')
  );`, "postgres");
  assert.equal(acl.status, 0, acl.stdout + acl.stderr);
  assert.equal(acl.stdout.trim(), "t,f,f,f,f");
});

test("the migration's current mutation result echoes the exact request ID", () => {
  const actor = randomUUID();
  const request = randomUUID();
  const fixture = sql(`set session_replication_role=replica;
    insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
    values ('${actor}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','migration-${actor}@example.invalid','',now(),now(),now());
    insert into public.user_accounts(id,account_status,platform_role) values ('${actor}','active','platform_admin');
    set session_replication_role=origin;`, "postgres");
  assert.equal(fixture.status, 0, fixture.stdout + fixture.stderr);
  const result = sql(`set request.jwt.claim.sub='${actor}'; set role authenticated;
    select public.mutate_managed_course('create',null,null,'${request}',jsonb_build_object(
      'name','TEST migration 골프장','course_type','field','region','서울','city','마포구',
      'address','서울 TEST migration 주소','holes',18,'operating_hours',null,'operation_code','walkIn',
      'phone',null,'parking_available',null,'feature_codes','[]'::jsonb,
      'description','TEST migration 골프장 설명입니다.','reservation_url',null,
      'reservation_guide',null,'fee_guide',null,'latitude',null,'longitude',null
    ));`);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(JSON.parse(result.stdout.trim()).request_id, request);
});
