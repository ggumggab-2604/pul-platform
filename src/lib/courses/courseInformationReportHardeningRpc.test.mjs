import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { after, before, test } from "node:test";

function docker(args, input) {
  return spawnSync("docker", args, { encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 });
}

function dockerAsync(args, input) {
  return new Promise((resolve) => {
    const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(input);
  });
}

function sql(text, user = "supabase_admin") {
  return docker(["exec", "-i", container, "psql", "-U", user, "-d", database, "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"], text);
}

function authenticated(actor, text) {
  return sql(`set request.jwt.claim.sub = '${actor}'; set role authenticated; ${text}`);
}

function authenticatedAsync(actor, text) {
  return dockerAsync(
    ["exec", "-i", container, "psql", "-U", "supabase_admin", "-d", database, "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"],
    `set request.jwt.claim.sub = '${actor}'; set role authenticated; ${text}`,
  );
}

function json(result) {
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return JSON.parse(result.stdout.trim());
}

function submit(actor, requestId, target, body, courseKey = key) {
  return authenticated(
    actor,
    `select public.submit_course_information_report('${requestId}','correction','${courseKey}','${target}',null,null,null,null,'${body}');`,
  );
}

const ids = {
  admin: randomUUID(),
  reporter: randomUUID(),
  other: randomUUID(),
  concurrent: randomUUID(),
  inactive: randomUUID(),
};
const key = `hardening-${process.pid}-${Date.now()}`;
let container;
let database;

before(() => {
  const found = docker(["ps", "--filter", "name=^supabase_db_pul-platform$", "--format", "{{.Names}}"]).stdout.split(/\r?\n/).filter(Boolean);
  assert.deepEqual(found, ["supabase_db_pul-platform"], "pul-platform local Supabase database container is required");
  container = found[0];
  database = `pul_course_report_hardening_${process.pid}_${Date.now()}`;
  const clone = docker(["exec", container, "sh", "-lc", [
    `createdb -U supabase_admin -O postgres ${database}`,
    `pg_dump -U supabase_admin -d postgres --schema-only | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
    `pg_dump -U supabase_admin -d postgres --data-only --disable-triggers | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
  ].join(" && ")]);
  assert.equal(clone.status, 0, clone.stdout + clone.stderr);

  const authRows = Object.values(ids).map((id) => `('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hardening-${id}@example.invalid','',now(),now(),now())`).join(",");
  const fixture = sql(`set session_replication_role=replica;
    insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values ${authRows};
    insert into public.user_accounts(id,account_status,platform_role) values
      ('${ids.admin}','active','platform_admin'),
      ('${ids.reporter}','active','member'),
      ('${ids.other}','active','member'),
      ('${ids.concurrent}','active','member'),
      ('${ids.inactive}','suspended','member');
    set session_replication_role=origin;
    insert into public.courses(course_key,name,course_type,region,city,address,holes,operation_code,feature_codes,description,course_status)
    values ('${key}','TEST Hardening 골프장','field','서울','마포구','서울 TEST Hardening 주소',18,'walkIn','{}','TEST Hardening 골프장 설명입니다.','active');`, "postgres");
  assert.equal(fixture.status, 0, fixture.stdout + fixture.stderr);
});

after(() => {
  if (container && database) {
    assert.equal(docker(["exec", container, "dropdb", "--if-exists", "--force", "-U", "supabase_admin", database]).status, 0);
  }
});

test("course report hardening preserves security, replay, duplicate, lifecycle, and no-course-mutation contracts", async () => {
  const catalog = sql(`select concat_ws(',',
    (select count(*) from information_schema.columns where table_schema='public' and table_name='course_information_reports' and column_name in ('correction_target','submit_request_id')),
    (to_regprocedure('public.submit_course_information_report(uuid,text,text,text,text,text,text,text,text)') is not null)::int,
    (to_regprocedure('public.submit_course_information_report(text,text,text,text,text,text,text)') is null)::int,
    (select (prosecdef and provolatile='v' and proconfig @> array['search_path=""'])::int from pg_proc where oid='public.submit_course_information_report(uuid,text,text,text,text,text,text,text,text)'::regprocedure),
    has_function_privilege('authenticated','public.submit_course_information_report(uuid,text,text,text,text,text,text,text,text)','execute')::int,
    has_function_privilege('anon','public.submit_course_information_report(uuid,text,text,text,text,text,text,text,text)','execute')::int,
    (select (relrowsecurity and relforcerowsecurity)::int from pg_class where oid='public.course_information_reports'::regclass)
  );`, "postgres");
  assert.equal(catalog.status, 0, catalog.stdout + catalog.stderr);
  assert.equal(catalog.stdout.trim(), "2,1,1,1,1,0,1");

  const courseBefore = sql(`select row_to_json(course)::text from public.courses as course where course_key='${key}';`, "postgres").stdout.trim();
  const requestId = randomUUID();
  const first = json(submit(ids.reporter, requestId, "phone", "TEST 전화번호 수정 제보 본문입니다."));
  assert.equal(first.status, "received");
  assert.equal(first.request_id, requestId);
  assert.equal(first.replayed, false);
  const replay = json(submit(ids.reporter, requestId, "phone", "TEST 전화번호 수정 제보 본문입니다."));
  assert.equal(replay.report_id, first.report_id);
  assert.equal(replay.request_id, requestId);
  assert.equal(replay.replayed, true);

  const payloadConflict = submit(ids.reporter, requestId, "phone", "TEST 서로 다른 전화번호 수정 제보 본문입니다.");
  assert.notEqual(payloadConflict.status, 0);
  assert.match(payloadConflict.stderr, /재사용할 수 없습니다/);
  const singular = sql(`select concat_ws(',',
    (select count(*) from public.course_information_reports where reporter_user_id='${ids.reporter}' and submit_request_id='${requestId}'),
    (select count(*) from public.audit_logs where actor_id='${ids.reporter}' and request_id='${requestId}'),
    (select count(*) from private.course_operation_requests where actor_id='${ids.reporter}' and request_id='${requestId}')
  );`, "postgres").stdout.trim();
  assert.equal(singular, "1,1,1");
  assert.equal(sql(`select row_to_json(course)::text from public.courses as course where course_key='${key}';`, "postgres").stdout.trim(), courseBefore);

  const duplicateRequest = randomUUID();
  const duplicate = submit(ids.reporter, duplicateRequest, "phone", "TEST 동일 대상의 별도 요청 본문입니다.");
  assert.notEqual(duplicate.status, 0);
  assert.match(duplicate.stderr, /확인 대기 중인 제보/);
  assert.equal(sql(`select count(*) from private.course_operation_requests where actor_id='${ids.reporter}' and request_id='${duplicateRequest}';`, "postgres").stdout.trim(), "0");
  assert.equal(json(submit(ids.reporter, randomUUID(), "fee", "TEST 이용요금 수정 제보 본문입니다.")).status, "received");
  const otherPhone = json(submit(ids.other, randomUUID(), "phone", "TEST 다른 제보자의 전화번호 수정 제보입니다."));
  assert.equal(otherPhone.status, "received");

  const invalidTargetId = randomUUID();
  const invalidTarget = submit(ids.reporter, invalidTargetId, "invalid", "TEST 잘못된 수정 대상 제보 본문입니다.");
  assert.notEqual(invalidTarget.status, 0); assert.match(invalidTarget.stderr, /수정 대상을/);
  const blankId = randomUUID();
  const blank = submit(ids.reporter, blankId, "location", "짧음");
  assert.notEqual(blank.status, 0); assert.match(blank.stderr, /10~3000자/);
  const inactive = submit(ids.inactive, randomUUID(), "phone", "TEST 비활성 사용자의 수정 제보 본문입니다.");
  assert.notEqual(inactive.status, 0); assert.match(inactive.stderr, /정상 활동/);
  const anon = sql(`set role anon; select public.submit_course_information_report('${randomUUID()}','correction','${key}','phone',null,null,null,null,'TEST 비로그인 수정 제보 본문입니다.');`);
  assert.notEqual(anon.status, 0); assert.match(anon.stderr, /permission denied/i);

  const concurrentIds = [randomUUID(), randomUUID()];
  const concurrentCalls = await Promise.all(concurrentIds.map((id, index) => authenticatedAsync(
    ids.concurrent,
    `select public.submit_course_information_report('${id}','correction','${key}','map_location',null,null,null,null,'TEST 동시 지도위치 수정 제보 본문 ${index + 1}입니다.');`,
  )));
  assert.equal(concurrentCalls.filter((result) => result.status === 0).length, 1);
  assert.equal(concurrentCalls.filter((result) => result.status !== 0 && /확인 대기 중인 제보/.test(result.stderr)).length, 1);
  const concurrentCounts = sql(`select concat_ws(',',
    (select count(*) from public.course_information_reports where reporter_user_id='${ids.concurrent}' and correction_target='map_location' and report_status='received'),
    (select count(*) from public.audit_logs where actor_id='${ids.concurrent}' and request_id=any(array['${concurrentIds[0]}'::uuid,'${concurrentIds[1]}'::uuid])),
    (select count(*) from private.course_operation_requests where actor_id='${ids.concurrent}' and request_id=any(array['${concurrentIds[0]}'::uuid,'${concurrentIds[1]}'::uuid]))
  );`, "postgres").stdout.trim();
  assert.equal(concurrentCounts, "1,1,1");

  const adminPage = json(authenticated(ids.admin, "select public.list_course_information_reports_for_management('received',30,0);"));
  assert.equal(adminPage.items.some((item) => item.report_id === first.report_id && item.correction_target === "phone"), true);
  const adminDetail = json(authenticated(ids.admin, `select public.get_course_information_report_for_management('${first.report_id}');`));
  assert.equal(adminDetail.correction_target, "phone");
  for (const statement of [
    "select public.list_course_information_reports_for_management(null,30,0);",
    `select public.get_course_information_report_for_management('${first.report_id}');`,
    `select public.resolve_course_information_report_for_management('${first.report_id}','handled','${adminDetail.updated_at}','TEST 권한 없는 처리','${randomUUID()}');`,
  ]) {
    const denied = authenticated(ids.reporter, statement);
    assert.notEqual(denied.status, 0); assert.match(denied.stderr, /권한이 없습니다/);
  }
  const anonManagement = sql("set role anon; select public.list_course_information_reports_for_management(null,30,0);");
  assert.notEqual(anonManagement.status, 0); assert.match(anonManagement.stderr, /permission denied/i);

  const resolveId = randomUUID();
  const courseBeforeResolve = sql(`select row_to_json(course)::text from public.courses as course where course_key='${key}';`, "postgres").stdout.trim();
  const handled = json(authenticated(ids.admin, `select public.resolve_course_information_report_for_management('${first.report_id}','handled','${adminDetail.updated_at}','TEST 운영자가 별도 관리 화면에서 확인 완료','${resolveId}');`));
  assert.equal(handled.report_status, "handled");
  assert.equal(sql(`select row_to_json(course)::text from public.courses as course where course_key='${key}';`, "postgres").stdout.trim(), courseBeforeResolve);
  assert.equal(json(submit(ids.reporter, randomUUID(), "phone", "TEST 처리 완료 뒤 새 전화번호 수정 제보입니다.")).status, "received");

  for (const statement of [
    `update public.course_information_reports set report_status='dismissed' where id='${first.report_id}';`,
    `delete from public.course_information_reports where id='${first.report_id}';`,
    `insert into public.course_information_reports(reporter_user_id,submit_request_id,report_type,course_name,region,location_description,report_body) values ('${ids.reporter}','${randomUUID()}','new_course','직접 제보','서울','서울 위치','TEST 직접 제보 본문입니다.');`,
  ]) {
    const denied = authenticated(ids.reporter, statement);
    assert.notEqual(denied.status, 0); assert.match(denied.stderr, /permission denied|row-level security/i);
  }

  const reporterDelete = sql(`delete from public.user_accounts where id='${ids.other}'; select concat_ws(',',
    (select count(*) from public.course_information_reports where id='${otherPhone.report_id}'),
    (select count(*) from public.course_information_reports where id='${otherPhone.report_id}' and reporter_user_id is null and report_status='received' and resolved_at is null and resolved_by is null and resolution_note is null)
  );`, "postgres");
  assert.equal(reporterDelete.status, 0, reporterDelete.stdout + reporterDelete.stderr);
  assert.equal(reporterDelete.stdout.trim(), "1,1");

  const resolverDelete = sql(`delete from public.user_accounts where id='${ids.admin}'; select concat_ws(',',
    (select count(*) from public.course_information_reports where id='${first.report_id}'),
    (select count(*) from public.course_information_reports where id='${first.report_id}' and report_status='handled' and resolved_by is null and resolved_at is not null and resolution_note is not null),
    (select count(*) from public.audit_logs where request_id='${resolveId}')
  );`, "postgres");
  assert.equal(resolverDelete.status, 0, resolverDelete.stdout + resolverDelete.stderr);
  assert.equal(resolverDelete.stdout.trim(), "1,1,1");
});
