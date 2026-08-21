import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const lessonFoundation = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/20260827000100_pul_lesson_directory_foundation.sql", import.meta.url)),
  "utf8",
);
const migration = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/20260903000100_pul_lesson_information_reports.sql", import.meta.url)),
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
  const found = docker(["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"]).stdout
    .split(/\r?\n/)
    .filter(Boolean);
  assert.equal(found.length, 1, "one local Supabase database container is required");
  container = found[0];
  database = `pul_lesson_reports_${process.pid}_${Date.now()}`;
  const clone = docker(["exec", container, "sh", "-lc", [
    `createdb -U supabase_admin -O postgres ${database}`,
    `pg_dump -U supabase_admin -d postgres --schema-only | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
    `pg_dump -U supabase_admin -d postgres --data-only --disable-triggers | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
  ].join(" && ")]);
  assert.equal(clone.status, 0, clone.stdout + clone.stderr);

  const lessonExists = sql("select pg_catalog.to_regclass('public.lessons') is not null;", "postgres");
  assert.equal(lessonExists.status, 0, lessonExists.stdout + lessonExists.stderr);
  if (lessonExists.stdout.trim() !== "t") {
    const appliedFoundation = sql(`begin; ${lessonFoundation} commit;`, "postgres");
    assert.equal(
      appliedFoundation.status,
      0,
      appliedFoundation.stdout + appliedFoundation.stderr,
    );
  }

  const exists = sql("select pg_catalog.to_regclass('public.lesson_information_reports') is not null;", "postgres");
  assert.equal(exists.status, 0, exists.stdout + exists.stderr);
  if (exists.stdout.trim() !== "t") {
    const applied = sql(`begin; ${migration} commit;`, "postgres");
    assert.equal(applied.status, 0, applied.stdout + applied.stderr);
  }

  const authRows = Object.entries(ids).map(([alias, id]) =>
    `('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','lesson-report-${alias}@example.invalid','',now(),now(),now())`,
  ).join(",");
  const fixture = sql(`set session_replication_role=replica;
    insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values ${authRows};
    insert into public.user_accounts(id,account_status,platform_role) values
      ('${ids.admin}','active','platform_admin'),
      ('${ids.member}','active','member'),
      ('${ids.inactive}','suspended','member');
    set session_replication_role=origin;
    insert into public.lessons(
      lesson_key,title,lesson_type,province,district,location,instructor_name,organizer_name,
      targets,schedule_text,schedule_tags,time_text,price_text,lesson_format,recruit_status,
      description,curriculum,supplies,notices,publication_status,created_by,updated_by
    ) values
      ('report-published','TEST 공개 입문 레슨','beginner','서울','송파구','잠실 교육장','TEST 강사','TEST 교육기관',array['absolute_beginner'],'매주 토요일',array['always'],'10:00','무료','offline','recruiting','TEST 공개 입문 레슨 상세 설명입니다.','기초 자세 교육','채와 공','{}','published','${ids.admin}','${ids.admin}'),
      ('report-hidden','TEST 숨김 입문 레슨','beginner','서울','송파구','잠실 교육장','TEST 강사','TEST 교육기관',array['absolute_beginner'],'매주 토요일','{}','10:00','무료','offline','recruiting','TEST 숨김 입문 레슨 상세 설명입니다.','기초 자세 교육','채와 공','{}','hidden','${ids.admin}','${ids.admin}'),
      ('report-removed','TEST 제거 입문 레슨','beginner','서울','송파구','잠실 교육장','TEST 강사','TEST 교육기관',array['absolute_beginner'],'매주 토요일','{}','10:00','무료','offline','recruiting','TEST 제거 입문 레슨 상세 설명입니다.','기초 자세 교육','채와 공','{}','removed','${ids.admin}','${ids.admin}'),
      ('report-certification','TEST 공개 자격 과정','certification','서울','송파구','잠실 교육장','TEST 강사','TEST 교육기관',array['cert_prep'],'매주 토요일','{}','10:00','무료','offline','recruiting','TEST 공개 자격 과정 상세 설명입니다.','자격 과정 교육','필기도구','{}','published','${ids.admin}','${ids.admin}');`, "postgres");
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

test("anon and inactive actors are denied while an active member can submit", () => {
  const anon = sql("set role anon; select public.submit_lesson_information_report('report-published','other','공개 레슨 정보 제보 내용입니다.');");
  assert.notEqual(anon.status, 0);
  assert.match(anon.stderr, /permission denied/i);

  const inactive = authenticated(ids.inactive, "select public.submit_lesson_information_report('report-published','other','공개 레슨 정보 제보 내용입니다.');");
  assert.notEqual(inactive.status, 0);
  assert.match(inactive.stderr, /정상 활동 계정/);

  const submitted = json(authenticated(ids.member, "select public.submit_lesson_information_report('report-published','incorrect_information','공개된 운영 시간이 실제 안내와 다릅니다.');"));
  assert.match(submitted.report_key, /^[0-9a-f]{32}$/);
  assert.equal(submitted.report_status, "pending");
  resolvedKey = submitted.report_key;
});

test("report type, body, and published general lesson boundaries fail closed", () => {
  const statements = [
    "select public.submit_lesson_information_report('report-published','invalid','충분히 자세한 제보 내용입니다.');",
    "select public.submit_lesson_information_report('report-published',null,'충분히 자세한 제보 내용입니다.');",
    "select public.submit_lesson_information_report('report-published','other','짧음');",
    `select public.submit_lesson_information_report('report-published','other',repeat('가',3001));`,
    "select public.submit_lesson_information_report('missing-lesson','other','충분히 자세한 제보 내용입니다.');",
    "select public.submit_lesson_information_report('report-hidden','other','충분히 자세한 제보 내용입니다.');",
    "select public.submit_lesson_information_report('report-removed','other','충분히 자세한 제보 내용입니다.');",
    "select public.submit_lesson_information_report('report-certification','other','충분히 자세한 제보 내용입니다.');",
  ];
  for (const statement of statements) {
    const result = authenticated(ids.member, statement);
    assert.notEqual(result.status, 0, statement);
  }
});

test("member management is denied while platform admin sees a privacy-minimized page", () => {
  const member = authenticated(ids.member, "select public.list_lesson_information_reports_for_management('pending',30,0);");
  assert.notEqual(member.status, 0);
  assert.match(member.stderr, /운영 권한/);

  const page = json(authenticated(ids.admin, "select public.list_lesson_information_reports_for_management('pending',30,0);"));
  assert.ok(page.total >= 1);
  const row = page.items.find((item) => item.report_key === resolvedKey);
  assert.equal(row.lesson_key, "report-published");
  for (const key of ["id", "lesson_id", "reporter_user_id", "resolved_by"]) {
    assert.equal(key in row, false);
  }
});

test("resolved and dismissed are terminal and leave lesson publication unchanged", () => {
  const resolved = json(authenticated(ids.admin, `select public.resolve_lesson_information_report('${resolvedKey}','resolved');`));
  assert.equal(resolved.report_key, resolvedKey);
  assert.equal(resolved.report_status, "resolved");
  const repeated = authenticated(ids.admin, `select public.resolve_lesson_information_report('${resolvedKey}','dismissed');`);
  assert.notEqual(repeated.status, 0);
  assert.match(repeated.stderr, /이미 처리/);

  const submitted = json(authenticated(ids.member, "select public.submit_lesson_information_report('report-published','operation_changed','운영 일정 변경 여부를 확인해 주세요.');"));
  dismissedKey = submitted.report_key;
  const dismissed = json(authenticated(ids.admin, `select public.resolve_lesson_information_report('${dismissedKey}','dismissed');`));
  assert.equal(dismissed.report_status, "dismissed");
  assert.equal(sql("select publication_status from public.lessons where lesson_key='report-published';").stdout.trim(), "published");
  assert.equal(sql("select count(*) from public.lesson_information_reports where report_status in ('resolved','dismissed');").stdout.trim(), "2");
});

test("authenticated direct report table DML remains blocked", () => {
  const directRead = authenticated(ids.member, "select count(*) from public.lesson_information_reports;");
  assert.notEqual(directRead.status, 0);
  assert.match(directRead.stderr, /permission denied|row-level security/i);
  const directInsert = authenticated(ids.member, `insert into public.lesson_information_reports(lesson_id,reporter_user_id,report_type,report_body) select id,'${ids.member}','other','직접 입력은 허용되지 않아야 합니다.' from public.lessons where lesson_key='report-published';`);
  assert.notEqual(directInsert.status, 0);
  assert.match(directInsert.stderr, /permission denied|row-level security/i);
  const directUpdate = authenticated(ids.admin, "update public.lesson_information_reports set report_status='dismissed';");
  assert.notEqual(directUpdate.status, 0);
  assert.match(directUpdate.stderr, /permission denied|row-level security/i);
});
