import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/20260911000100_pul_market_partnership_inquiries.sql", import.meta.url)),
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
  moderator: randomUUID(),
  member: randomUUID(),
  suspended: randomUUID(),
  withdrawn: randomUUID(),
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
  database = `pul_market_partnership_inquiries_${process.pid}_${Date.now()}`;
  const clone = docker(["exec", container, "sh", "-lc", [
    `createdb -U supabase_admin -O postgres ${database}`,
    `pg_dump -U supabase_admin -d postgres --schema-only | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
    `pg_dump -U supabase_admin -d postgres --data-only --disable-triggers | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
  ].join(" && ")]);
  assert.equal(clone.status, 0, clone.stdout + clone.stderr);

  const prerequisites = sql(`select
    pg_catalog.to_regclass('public.platform_permission_definitions') is not null
    and pg_catalog.to_regprocedure('private.market_assert_active_actor()') is not null
    and pg_catalog.to_regprocedure('private.valid_news_external_url(text)') is not null;`, "postgres");
  assert.equal(prerequisites.status, 0, prerequisites.stdout + prerequisites.stderr);
  assert.equal(prerequisites.stdout.trim(), "t", "approved migration prerequisites are required");

  const exists = sql("select pg_catalog.to_regclass('public.market_partnership_inquiries') is not null;", "postgres");
  assert.equal(exists.status, 0, exists.stdout + exists.stderr);
  if (exists.stdout.trim() !== "t") {
    const applied = sql(`begin; ${migration} commit;`, "postgres");
    assert.equal(applied.status, 0, applied.stdout + applied.stderr);
  }

  const authRows = Object.entries(ids).map(([alias, id]) =>
    `('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','market-partnership-${alias}@example.invalid','',now(),now(),now())`,
  ).join(",");
  const fixture = sql(`set session_replication_role=replica;
    insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values ${authRows};
    insert into public.user_accounts(id,account_status,platform_role) values
      ('${ids.admin}','active','platform_admin'),
      ('${ids.moderator}','active','platform_moderator'),
      ('${ids.member}','active','member'),
      ('${ids.suspended}','suspended','member'),
      ('${ids.withdrawn}','withdrawn','member');
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

test("anon and inactive actors are denied while active members can submit", () => {
  const anon = sql("set role anon; select public.submit_market_partnership_inquiry('shop_entry','PUL 파크골프','장터 입점을 위한 기본 제안 내용을 전달합니다.',null);");
  assert.notEqual(anon.status, 0);
  assert.match(anon.stderr, /permission denied/i);

  for (const actor of [ids.suspended, ids.withdrawn]) {
    const inactive = authenticated(actor, "select public.submit_market_partnership_inquiry('shop_entry','PUL 파크골프','장터 입점을 위한 기본 제안 내용을 전달합니다.',null);");
    assert.notEqual(inactive.status, 0);
    assert.match(inactive.stderr, /정상 활동 계정/);
  }

  const submitted = json(authenticated(ids.member, "select public.submit_market_partnership_inquiry('shop_entry',' PUL 파크골프 ',' 장터 입점을 위한 기본 제안 내용을 전달합니다. ',' https://example.com/market ');"));
  assert.match(submitted.inquiry_key, /^[0-9a-f]{32}$/);
  assert.equal(submitted.inquiry_status, "pending");
  resolvedKey = submitted.inquiry_key;

  const second = json(authenticated(ids.member, "select public.submit_market_partnership_inquiry('partnership','PUL 협력사','파크골프 회원을 위한 제휴 내용을 전달합니다.','');"));
  dismissedKey = second.inquiry_key;
});

test("types, field boundaries, and unsafe URLs fail closed", () => {
  const statements = [
    "select public.submit_market_partnership_inquiry('unknown','PUL','충분히 자세한 문의 내용입니다.',null);",
    "select public.submit_market_partnership_inquiry('shop_entry','가','충분히 자세한 문의 내용입니다.',null);",
    "select public.submit_market_partnership_inquiry('shop_entry','PUL','짧음',null);",
    "select public.submit_market_partnership_inquiry('shop_entry','PUL',repeat('가',3001),null);",
    "select public.submit_market_partnership_inquiry('advertising','PUL','충분히 자세한 문의 내용입니다.','http://example.com');",
    "select public.submit_market_partnership_inquiry('advertising','PUL','충분히 자세한 문의 내용입니다.','javascript:alert(1)');",
  ];
  for (const statement of statements) {
    const result = authenticated(ids.member, statement);
    assert.notEqual(result.status, 0, statement);
  }
});

test("member and moderator management are denied while admin sees a minimal DTO", () => {
  for (const actor of [ids.member, ids.moderator]) {
    const denied = authenticated(actor, "select public.list_market_partnership_inquiries_for_management('pending',30,0);");
    assert.notEqual(denied.status, 0);
    assert.match(denied.stderr, /운영 권한/);
  }

  const page = json(authenticated(ids.admin, "select public.list_market_partnership_inquiries_for_management('pending',30,0);"));
  assert.ok(page.total >= 2);
  const row = page.items.find((item) => item.inquiry_key === resolvedKey);
  assert.equal(row.organization_name, "PUL 파크골프");
  assert.equal(row.inquiry_type, "shop_entry");
  for (const key of ["id", "requester_user_id", "resolved_by"]) {
    assert.equal(key in row, false);
  }
});

test("invalid pagination is rejected", () => {
  for (const statement of [
    "select public.list_market_partnership_inquiries_for_management('pending',null,0);",
    "select public.list_market_partnership_inquiries_for_management('pending',51,0);",
    "select public.list_market_partnership_inquiries_for_management('pending',30,null);",
    "select public.list_market_partnership_inquiries_for_management('pending',30,-1);",
  ]) {
    const result = authenticated(ids.admin, statement);
    assert.notEqual(result.status, 0, statement);
    assert.match(result.stderr, /페이지 범위/);
  }
});

test("terminal resolution never creates listings or commercial records", () => {
  const beforeListings = sql("select count(*) from public.market_listings;", "postgres").stdout.trim();
  const resolved = json(authenticated(ids.admin, `select public.resolve_market_partnership_inquiry('${resolvedKey}','resolved');`));
  assert.equal(resolved.inquiry_key, resolvedKey);
  assert.equal(resolved.inquiry_status, "resolved");

  const repeated = authenticated(ids.admin, `select public.resolve_market_partnership_inquiry('${resolvedKey}','dismissed');`);
  assert.notEqual(repeated.status, 0);
  assert.match(repeated.stderr, /이미 처리/);

  const dismissed = json(authenticated(ids.admin, `select public.resolve_market_partnership_inquiry('${dismissedKey}','dismissed');`));
  assert.equal(dismissed.inquiry_status, "dismissed");
  assert.equal(sql("select count(*) from public.market_listings;", "postgres").stdout.trim(), beforeListings);
  assert.equal(sql("select count(*) from public.market_partnership_inquiries where inquiry_status in ('resolved','dismissed');", "postgres").stdout.trim(), "2");
});

test("authenticated direct inquiry table DML remains blocked", () => {
  const directRead = authenticated(ids.member, "select count(*) from public.market_partnership_inquiries;");
  assert.notEqual(directRead.status, 0);
  assert.match(directRead.stderr, /permission denied|row-level security/i);
  const directInsert = authenticated(ids.member, `insert into public.market_partnership_inquiries(requester_user_id,inquiry_type,organization_name,proposal_summary) values ('${ids.member}','shop_entry','PUL','직접 입력은 허용되지 않아야 합니다.');`);
  assert.notEqual(directInsert.status, 0);
  assert.match(directInsert.stderr, /permission denied|row-level security/i);
  const directUpdate = authenticated(ids.admin, "update public.market_partnership_inquiries set inquiry_status='dismissed';");
  assert.notEqual(directUpdate.status, 0);
  assert.match(directUpdate.stderr, /permission denied|row-level security/i);
  const directDelete = authenticated(ids.admin, "delete from public.market_partnership_inquiries;");
  assert.notEqual(directDelete.status, 0);
  assert.match(directDelete.stderr, /permission denied|row-level security/i);
});
