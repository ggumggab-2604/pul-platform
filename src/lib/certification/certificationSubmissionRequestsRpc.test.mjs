import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const certificationFoundation = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/20260828000100_pul_certification_directory_foundation.sql", import.meta.url)),
  "utf8",
);
const migration = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/20260905000100_pul_certification_submission_requests.sql", import.meta.url)),
  "utf8",
);

function docker(args, input) {
  return spawnSync("docker", args, { encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 });
}

function sql(text, user = "supabase_admin") {
  return docker([
    "exec", "-i", container, "psql", "-U", user, "-d", database,
    "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1",
  ], text);
}

function authenticated(actor, text) {
  return sql(`set request.jwt.claim.sub = '${actor}'; set role authenticated; ${text}`);
}

function json(result) {
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return JSON.parse(result.stdout.trim());
}

const ids = {
  admin: randomUUID(),
  member: randomUUID(),
  inactive: randomUUID(),
};
let container;
let database;
let resolvedKey;
let dismissedKey;

before(() => {
  const found = docker(["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"])
    .stdout.split(/\r?\n/).filter(Boolean);
  assert.equal(found.length, 1, "one local Supabase database container is required");
  container = found[0];
  database = `pul_certification_requests_${process.pid}_${Date.now()}`;
  const clone = docker(["exec", container, "sh", "-lc", [
    `createdb -U supabase_admin -O postgres ${database}`,
    `pg_dump -U supabase_admin -d postgres --schema-only | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
    `pg_dump -U supabase_admin -d postgres --data-only --disable-triggers | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
  ].join(" && ")]);
  assert.equal(clone.status, 0, clone.stdout + clone.stderr);

  const foundationExists = sql("select pg_catalog.to_regclass('public.certification_courses') is not null;", "postgres");
  assert.equal(foundationExists.status, 0, foundationExists.stdout + foundationExists.stderr);
  if (foundationExists.stdout.trim() !== "t") {
    const appliedFoundation = sql(`begin; ${certificationFoundation} commit;`, "postgres");
    assert.equal(appliedFoundation.status, 0, appliedFoundation.stdout + appliedFoundation.stderr);
  }

  const exists = sql("select pg_catalog.to_regclass('public.certification_submission_requests') is not null;", "postgres");
  assert.equal(exists.status, 0, exists.stdout + exists.stderr);
  if (exists.stdout.trim() !== "t") {
    const applied = sql(`begin; ${migration} commit;`, "postgres");
    assert.equal(applied.status, 0, applied.stdout + applied.stderr);
  }

  const authRows = Object.entries(ids).map(([alias, id]) =>
    `('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','certification-request-${alias}@example.invalid','',now(),now(),now())`,
  ).join(",");
  const fixture = sql(`set session_replication_role=replica;
    insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values ${authRows};
    insert into public.user_accounts(id,account_status,platform_role) values
      ('${ids.admin}','active','platform_admin'),
      ('${ids.member}','active','member'),
      ('${ids.inactive}','suspended','member');
    set session_replication_role=origin;`, "postgres");
  assert.equal(fixture.status, 0, fixture.stdout + fixture.stderr);
});

after(() => {
  if (container && database) {
    assert.equal(
      docker(["exec", container, "dropdb", "--if-exists", "--force", "-U", "supabase_admin", database]).status,
      0,
    );
  }
});

test("anon and inactive actors are denied while an active member can submit course and job requests", () => {
  const anon = sql("set role anon; select public.submit_certification_submission_request('course_registration','심판 교육과정','파크골프 교육원','서울','심판 교육과정 등록 문의 내용입니다.',null);");
  assert.notEqual(anon.status, 0);
  assert.match(anon.stderr, /permission denied/i);

  const inactive = authenticated(ids.inactive, "select public.submit_certification_submission_request('course_registration','심판 교육과정','파크골프 교육원','서울','심판 교육과정 등록 문의 내용입니다.',null);");
  assert.notEqual(inactive.status, 0);
  assert.match(inactive.stderr, /정상 활동 계정/);

  const course = json(authenticated(ids.member, "select public.submit_certification_submission_request('course_registration','심판 교육과정','파크골프 교육원','서울','공식 심판 교육 일정과 교육 대상을 등록 문의합니다.','https://example.com/course');"));
  assert.match(course.request_key, /^[0-9a-f]{32}$/);
  assert.equal(course.request_status, "pending");
  resolvedKey = course.request_key;

  const job = json(authenticated(ids.member, "select public.submit_certification_submission_request('job_registration','심판 모집 공고','지역 체육회',null,'공식 심판 모집 일정과 활동 조건을 등록 문의합니다.',null);"));
  assert.match(job.request_key, /^[0-9a-f]{32}$/);
  assert.equal(job.request_status, "pending");
  dismissedKey = job.request_key;
});

test("type, field boundaries, and HTTPS URL validation fail closed", () => {
  const statements = [
    "select public.submit_certification_submission_request('exam_registration','시험 일정','체육회','서울','충분히 자세한 등록 문의 내용입니다.',null);",
    "select public.submit_certification_submission_request(null,'심판 교육','체육회','서울','충분히 자세한 등록 문의 내용입니다.',null);",
    "select public.submit_certification_submission_request('course_registration','한','체육회','서울','충분히 자세한 등록 문의 내용입니다.',null);",
    "select public.submit_certification_submission_request('course_registration','심판 교육','체육회','서울','짧음',null);",
    "select public.submit_certification_submission_request('job_registration','심판 모집','체육회','서울',repeat('가',3001),null);",
    "select public.submit_certification_submission_request('job_registration','심판 모집','체육회','서울','충분히 자세한 등록 문의 내용입니다.','http://example.com');",
  ];
  for (const statement of statements) {
    const result = authenticated(ids.member, statement);
    assert.notEqual(result.status, 0, statement);
  }
});

test("member management is denied while platform admin sees a privacy-minimized page", () => {
  const member = authenticated(ids.member, "select public.list_certification_submission_requests_for_management('pending',30,0);");
  assert.notEqual(member.status, 0);
  assert.match(member.stderr, /운영 권한/);

  const page = json(authenticated(ids.admin, "select public.list_certification_submission_requests_for_management('pending',30,0);"));
  assert.ok(page.total >= 2);
  const row = page.items.find((item) => item.request_key === resolvedKey);
  assert.equal(row.request_type, "course_registration");
  for (const key of ["id", "requester_user_id", "resolved_by"]) {
    assert.equal(key in row, false);
  }
});

test("resolved and dismissed are terminal and never create course or job rows", () => {
  const beforeCounts = sql("select (select count(*) from public.certification_courses) || ':' || (select count(*) from public.certification_jobs);").stdout.trim();
  const resolved = json(authenticated(ids.admin, `select public.resolve_certification_submission_request('${resolvedKey}','resolved');`));
  assert.equal(resolved.request_key, resolvedKey);
  assert.equal(resolved.request_status, "resolved");
  const repeated = authenticated(ids.admin, `select public.resolve_certification_submission_request('${resolvedKey}','dismissed');`);
  assert.notEqual(repeated.status, 0);
  assert.match(repeated.stderr, /이미 처리/);

  const dismissed = json(authenticated(ids.admin, `select public.resolve_certification_submission_request('${dismissedKey}','dismissed');`));
  assert.equal(dismissed.request_status, "dismissed");
  assert.equal(
    sql("select (select count(*) from public.certification_courses) || ':' || (select count(*) from public.certification_jobs);").stdout.trim(),
    beforeCounts,
  );
});

test("authenticated direct request table DML remains blocked", () => {
  const directRead = authenticated(ids.member, "select count(*) from public.certification_submission_requests;");
  assert.notEqual(directRead.status, 0);
  assert.match(directRead.stderr, /permission denied|row-level security/i);
  const directInsert = authenticated(ids.member, `insert into public.certification_submission_requests(requester_user_id,request_type,title,organization_name,summary) values ('${ids.member}','course_registration','심판 교육','체육회','직접 입력은 허용되지 않아야 합니다.');`);
  assert.notEqual(directInsert.status, 0);
  assert.match(directInsert.stderr, /permission denied|row-level security/i);
  const directUpdate = authenticated(ids.admin, "update public.certification_submission_requests set request_status='dismissed';");
  assert.notEqual(directUpdate.status, 0);
  assert.match(directUpdate.stderr, /permission denied|row-level security/i);
});
