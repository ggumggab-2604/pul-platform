import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const newsFoundation = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/20260829000100_pul_news_directory_foundation.sql", import.meta.url)),
  "utf8",
);
const migration = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/20260904000100_pul_news_inquiries.sql", import.meta.url)),
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
  database = `pul_news_inquiries_${process.pid}_${Date.now()}`;
  const clone = docker(["exec", container, "sh", "-lc", [
    `createdb -U supabase_admin -O postgres ${database}`,
    `pg_dump -U supabase_admin -d postgres --schema-only | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
    `pg_dump -U supabase_admin -d postgres --data-only --disable-triggers | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
  ].join(" && ")]);
  assert.equal(clone.status, 0, clone.stdout + clone.stderr);

  const newsExists = sql("select pg_catalog.to_regclass('public.news_articles') is not null;", "postgres");
  assert.equal(newsExists.status, 0, newsExists.stdout + newsExists.stderr);
  if (newsExists.stdout.trim() !== "t") {
    const appliedFoundation = sql(`begin; ${newsFoundation} commit;`, "postgres");
    assert.equal(appliedFoundation.status, 0, appliedFoundation.stdout + appliedFoundation.stderr);
  }

  const exists = sql("select pg_catalog.to_regclass('public.news_inquiries') is not null;", "postgres");
  assert.equal(exists.status, 0, exists.stdout + exists.stderr);
  if (exists.stdout.trim() !== "t") {
    const applied = sql(`begin; ${migration} commit;`, "postgres");
    assert.equal(applied.status, 0, applied.stdout + applied.stderr);
  }

  const authRows = Object.entries(ids).map(([alias, id]) =>
    `('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','news-inquiry-${alias}@example.invalid','',now(),now(),now())`,
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

test("anon and inactive actors are denied while an active member can submit both inquiry types", () => {
  const anon = sql("set role anon; select public.submit_news_inquiry('news_report','지역 행사 공식 소식을 제보합니다.');");
  assert.notEqual(anon.status, 0);
  assert.match(anon.stderr, /permission denied/i);

  const inactive = authenticated(ids.inactive, "select public.submit_news_inquiry('news_report','지역 행사 공식 소식을 제보합니다.');");
  assert.notEqual(inactive.status, 0);
  assert.match(inactive.stderr, /정상 활동 계정/);

  const submitted = json(authenticated(ids.member, "select public.submit_news_inquiry('news_report','지역 행사 일정과 공식 공지 출처를 제보합니다.');"));
  assert.match(submitted.inquiry_key, /^[0-9a-f]{32}$/);
  assert.equal(submitted.inquiry_status, "pending");
  resolvedKey = submitted.inquiry_key;

  const promoted = json(authenticated(ids.member, "select public.submit_news_inquiry('promotion_inquiry','신규 업체 행사와 공식 확인 경로를 문의합니다.');"));
  assert.match(promoted.inquiry_key, /^[0-9a-f]{32}$/);
  assert.equal(promoted.inquiry_status, "pending");
  dismissedKey = promoted.inquiry_key;
});

test("inquiry type and body boundaries fail closed", () => {
  const statements = [
    "select public.submit_news_inquiry('invalid','충분히 자세한 뉴스 제보 내용입니다.');",
    "select public.submit_news_inquiry(null,'충분히 자세한 뉴스 제보 내용입니다.');",
    "select public.submit_news_inquiry('news_report','짧음');",
    "select public.submit_news_inquiry('promotion_inquiry',repeat('가',3001));",
  ];
  for (const statement of statements) {
    const result = authenticated(ids.member, statement);
    assert.notEqual(result.status, 0, statement);
  }
});

test("member management is denied while platform admin sees a privacy-minimized page", () => {
  const member = authenticated(ids.member, "select public.list_news_inquiries_for_management('pending',30,0);");
  assert.notEqual(member.status, 0);
  assert.match(member.stderr, /운영 권한/);

  const page = json(authenticated(ids.admin, "select public.list_news_inquiries_for_management('pending',30,0);"));
  assert.ok(page.total >= 2);
  const row = page.items.find((item) => item.inquiry_key === resolvedKey);
  assert.equal(row.inquiry_type, "news_report");
  for (const key of ["id", "requester_user_id", "resolved_by"]) {
    assert.equal(key in row, false);
  }
});

test("resolved and dismissed are terminal and never create news articles", () => {
  const beforeCount = sql("select count(*) from public.news_articles;").stdout.trim();
  const resolved = json(authenticated(ids.admin, `select public.resolve_news_inquiry('${resolvedKey}','resolved');`));
  assert.equal(resolved.inquiry_key, resolvedKey);
  assert.equal(resolved.inquiry_status, "resolved");
  const repeated = authenticated(ids.admin, `select public.resolve_news_inquiry('${resolvedKey}','dismissed');`);
  assert.notEqual(repeated.status, 0);
  assert.match(repeated.stderr, /이미 처리/);

  const dismissed = json(authenticated(ids.admin, `select public.resolve_news_inquiry('${dismissedKey}','dismissed');`));
  assert.equal(dismissed.inquiry_status, "dismissed");
  assert.equal(sql("select count(*) from public.news_articles;").stdout.trim(), beforeCount);
  assert.equal(sql("select count(*) from public.news_inquiries where inquiry_status in ('resolved','dismissed');").stdout.trim(), "2");
});

test("authenticated direct inquiry table DML remains blocked", () => {
  const directRead = authenticated(ids.member, "select count(*) from public.news_inquiries;");
  assert.notEqual(directRead.status, 0);
  assert.match(directRead.stderr, /permission denied|row-level security/i);
  const directInsert = authenticated(ids.member, `insert into public.news_inquiries(requester_user_id,inquiry_type,inquiry_body) values ('${ids.member}','news_report','직접 입력은 허용되지 않아야 합니다.');`);
  assert.notEqual(directInsert.status, 0);
  assert.match(directInsert.stderr, /permission denied|row-level security/i);
  const directUpdate = authenticated(ids.admin, "update public.news_inquiries set inquiry_status='dismissed';");
  assert.notEqual(directUpdate.status, 0);
  assert.match(directUpdate.stderr, /permission denied|row-level security/i);
});
