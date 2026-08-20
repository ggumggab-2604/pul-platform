import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(fileURLToPath(new URL("../../../supabase/migrations/20260830000100_pul_market_startup_board_foundation.sql", import.meta.url)), "utf8");
const marketCoreMigration = readFileSync(fileURLToPath(new URL("../../../supabase/migrations/20260823000100_pul_market_core_foundation.sql", import.meta.url)), "utf8");
function docker(args, input) { return spawnSync("docker", args, { encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 }); }
function sql(text, user = "supabase_admin") { return docker(["exec", "-i", container, "psql", "-U", user, "-d", database, "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"], text); }
function authenticated(actor, text) { return sql(`set request.jwt.claim.sub = '${actor}'; set role authenticated; ${text}`); }
function json(result) { assert.equal(result.status, 0, result.stdout + result.stderr); return JSON.parse(result.stdout.trim()); }

const ids = { owner: randomUUID(), other: randomUUID(), inactive: randomUUID() };
let container; let database; let postKey; let secondPostKey;

before(() => {
  const found = docker(["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"]).stdout.split(/\r?\n/).filter(Boolean);
  assert.equal(found.length, 1);
  container = found[0];
  database = `pul_market_startup_${process.pid}_${Date.now()}`;
  const clone = docker(["exec", container, "sh", "-lc", [
    `createdb -U supabase_admin -O postgres ${database}`,
    `pg_dump -U supabase_admin -d postgres --schema-only | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
    `pg_dump -U supabase_admin -d postgres --data-only --disable-triggers | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
  ].join(" && ")]);
  assert.equal(clone.status, 0, clone.stdout + clone.stderr);
  const helperExists = sql("select to_regprocedure('private.market_assert_active_actor()') is not null;");
  assert.equal(helperExists.status, 0, helperExists.stdout + helperExists.stderr);
  if (helperExists.stdout.trim() !== "t") {
    const appliedCore = sql(`begin; ${marketCoreMigration} commit;`, "postgres");
    assert.equal(appliedCore.status, 0, appliedCore.stdout + appliedCore.stderr);
  }
  const exists = sql("select to_regclass('public.market_startup_posts') is not null;");
  assert.equal(exists.status, 0, exists.stdout + exists.stderr);
  if (exists.stdout.trim() !== "t") {
    const applied = sql(`begin; ${migration} commit;`, "postgres");
    assert.equal(applied.status, 0, applied.stdout + applied.stderr);
  }
  const authRows = [ids.owner, ids.other, ids.inactive].map((id) => `('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','market-startup-${id}@example.invalid','',now(),now(),now())`).join(",");
  const fixture = sql(`set session_replication_role=replica; insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values ${authRows}; insert into public.user_accounts(id,account_status) values ('${ids.owner}','active'),('${ids.other}','active'),('${ids.inactive}','suspended'); insert into public.user_profiles(user_id,nickname,profile_visibility) values ('${ids.owner}','TEST 창업회원','public'),('${ids.other}','TEST 다른회원','private'),('${ids.inactive}','TEST 정지회원','public'); set session_replication_role=origin;`, "postgres");
  assert.equal(fixture.status, 0, fixture.stdout + fixture.stderr);
});

after(() => {
  if (container && database) assert.equal(docker(["exec", container, "dropdb", "--if-exists", "--force", "-U", "supabase_admin", database]).status, 0);
});

const payload = `'{"title":"TEST 스크린 창업 문의","body":"TEST 스크린 파크골프 창업 공간과 비용을 문의합니다.","category":"screenStartup","region":"서울","desired_scale":"약 30평","consultation_type":"startupInquiry"}'::jsonb`;

test("active member creates and public list/detail stay privacy minimized", () => {
  const created = json(authenticated(ids.owner, `select public.mutate_market_startup_post('create',null,null,${payload});`));
  postKey = created.post_key;
  assert.match(postKey, /^[0-9a-f]{24}$/);
  assert.equal(created.board_status, "open");
  assert.equal(created.version, 1);

  const page = json(sql("set role anon; select public.list_market_startup_posts(null,null,null,24,0);"));
  assert.equal(page.total, 1);
  assert.equal(page.items[0].post_key, postKey);
  for (const privateKey of ["id", "author_user_id", "version", "email", "phone"]) assert.equal(privateKey in page.items[0], false);
  assert.equal(page.items[0].can_edit, false);
  const nullBounds = json(sql("set role anon; select public.list_market_startup_posts(null,null,null,null,null);"));
  assert.equal(nullBounds.limit, 24);
  assert.equal(nullBounds.offset, 0);

  const detail = json(sql(`set role anon; select public.get_market_startup_post('${postKey}');`));
  assert.equal(detail.post_key, postKey);
  assert.equal(detail.author_display_name, "TEST 창업회원");
  assert.equal("version" in detail, false);
});

test("owner context, update, stale guard, and other-member denial work", () => {
  const context = json(authenticated(ids.owner, `select public.get_my_market_startup_post_mutation_context('${postKey}');`));
  assert.equal(context.version, 1);
  const updatedPayload = `'{"title":"TEST 스크린 창업 문의 수정","body":"TEST 수정된 스크린 파크골프 창업 공간과 비용 문의입니다.","category":"screenStartup","region":"경기","desired_scale":"약 40평","consultation_type":"startupInquiry"}'::jsonb`;
  const updated = json(authenticated(ids.owner, `select public.mutate_market_startup_post('update','${postKey}',1,${updatedPayload});`));
  assert.equal(updated.version, 2);

  const stale = authenticated(ids.owner, `select public.mutate_market_startup_post('update','${postKey}',1,${updatedPayload});`);
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /새로고침/);
  const denied = authenticated(ids.other, `select public.mutate_market_startup_post('remove','${postKey}',2,'{}');`);
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /본인의/);
});

test("inactive actor and direct authenticated DML are denied", () => {
  const inactive = authenticated(ids.inactive, `select public.mutate_market_startup_post('create',null,null,${payload});`);
  assert.notEqual(inactive.status, 0);
  assert.match(inactive.stderr, /정상 활동 계정/);
  const direct = authenticated(ids.owner, `update public.market_startup_posts set title='직접 변경' where post_key='${postKey}';`);
  assert.notEqual(direct.status, 0);
  assert.match(direct.stderr, /permission denied|row-level security/i);
});

test("filters are server-side, hidden rows are public-invisible, and category pairing is enforced", () => {
  const secondPayload = `'{"title":"TEST 필드 구장 조성 문의","body":"TEST 필드 구장 조성 가능 조건을 확인하고 싶습니다.","category":"fieldCourseDevelopment","region":"충청","desired_scale":"약 1000평","consultation_type":"courseDevelopment"}'::jsonb`;
  secondPostKey = json(authenticated(ids.owner, `select public.mutate_market_startup_post('create',null,null,${secondPayload});`)).post_key;
  const filtered = json(sql("set role anon; select public.list_market_startup_posts('조성','fieldCourseDevelopment','충청',24,0);"));
  assert.equal(filtered.total, 1);
  assert.equal(filtered.items[0].post_key, secondPostKey);
  assert.equal(sql(`update public.market_startup_posts set publication_status='hidden' where post_key='${secondPostKey}';`, "postgres").status, 0);
  const hidden = json(sql("set role anon; select public.list_market_startup_posts(null,null,null,24,0);"));
  assert.equal(hidden.items.some((item) => item.post_key === secondPostKey), false);
  const invalid = authenticated(ids.owner, "select public.mutate_market_startup_post('create',null,null,'{\"title\":\"TEST 잘못된 조합\",\"body\":\"TEST 충분히 긴 잘못된 조합 본문입니다.\",\"category\":\"screenStartup\",\"region\":\"서울\",\"desired_scale\":\"약 30평\",\"consultation_type\":\"transfer\"}'::jsonb);");
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /상담 유형/);
});

test("owner closes and soft-removes posts while public reads exclude removed rows", () => {
  const closed = json(authenticated(ids.owner, `select public.mutate_market_startup_post('close','${postKey}',2,'{}');`));
  assert.equal(closed.board_status, "closed");
  assert.equal(closed.version, 3);
  const removed = json(authenticated(ids.owner, `select public.mutate_market_startup_post('remove','${postKey}',3,'{}');`));
  assert.equal(removed.publication_status, "removed");
  assert.equal(removed.version, 4);
  const page = json(sql("set role anon; select public.list_market_startup_posts(null,null,null,24,0);"));
  assert.equal(page.items.some((item) => item.post_key === postKey), false);
  const row = sql(`select board_status||':'||publication_status||':'||(removed_at is not null)::text||':'||version from public.market_startup_posts where post_key='${postKey}';`);
  assert.equal(row.stdout.trim(), "closed:removed:true:4");
});
