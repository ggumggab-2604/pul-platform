import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(fileURLToPath(new URL("../../../supabase/migrations/20260831000100_pul_club_public_directory_registration.sql", import.meta.url)), "utf8");
function docker(args, input) { return spawnSync("docker", args, { encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 }); }
function sql(text, user = "supabase_admin") { return docker(["exec", "-i", container, "psql", "-U", user, "-d", database, "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"], text); }
function authenticated(actor, text) { return sql(`set request.jwt.claim.sub = '${actor}'; set request.jwt.claim.role = 'authenticated'; set role authenticated; ${text}`); }
function json(result) { assert.equal(result.status, 0, result.stdout + result.stderr); return JSON.parse(result.stdout.trim()); }

const ids = { active: randomUUID(), inactive: randomUUID(), request: randomUUID() };
let container; let database;

before(() => {
  const found = docker(["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"] ).stdout.split(/\r?\n/).filter(Boolean);
  assert.equal(found.length, 1, "one local Supabase database container is required");
  container = found[0];
  database = `pul_club_directory_${process.pid}_${Date.now()}`;
  const clone = docker(["exec", container, "sh", "-lc", [
    `createdb -U supabase_admin -O postgres ${database}`,
    `pg_dump -U supabase_admin -d postgres --schema-only | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
    `pg_dump -U supabase_admin -d postgres --data-only --disable-triggers | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
  ].join(" && ")]);
  assert.equal(clone.status, 0, clone.stdout + clone.stderr);
  const applied = sql(`begin; ${migration} commit;`, "postgres");
  assert.equal(applied.status, 0, applied.stdout + applied.stderr);

  const fixture = sql(`set session_replication_role=replica;
    insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
      ('${ids.active}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','club-active@example.invalid','',now(),now(),now()),
      ('${ids.inactive}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','club-inactive@example.invalid','',now(),now(),now());
    insert into public.user_accounts(id,account_status,platform_role) values
      ('${ids.active}','active','member'),('${ids.inactive}','suspended','member');
    insert into public.clubs(legacy_key,name,club_status,membership_recruitment_status,region,district,summary) values
      ('directory-public','TEST 서울 공개 동호회','active','recruiting','서울','송파구','TEST 서울 공개 동호회 소개입니다.'),
      ('directory-waiting','TEST 경기 대기 동호회','active','waiting','경기','수원시','TEST 경기 대기 동호회 소개입니다.'),
      ('directory-hidden','TEST 숨김 동호회','suspended','closed','서울','마포구','TEST 숨김 동호회 소개입니다.');
    set session_replication_role=origin;`, "postgres");
  assert.equal(fixture.status, 0, fixture.stdout + fixture.stderr);
});

after(() => {
  if (container && database) assert.equal(docker(["exec", container, "dropdb", "--if-exists", "--force", "-U", "supabase_admin", database]).status, 0);
});

test("anon directory exposes active clubs only with filters and bounded pagination", () => {
  const all = json(sql("set role anon; select public.list_public_clubs(null,null,null,null,24,0);"));
  assert.equal(all.total >= 2, true);
  assert.equal(all.items.some((item) => item.public_key === "directory-public"), true);
  assert.equal(all.items.some((item) => item.public_key === "directory-waiting"), true);
  assert.equal(all.items.some((item) => item.public_key === "directory-hidden"), false);
  for (const item of all.items) for (const key of ["id", "actor_id", "membership_id", "version", "email"]) assert.equal(key in item, false);
  assert.equal(json(sql("set role anon; select public.list_public_clubs('서울','서울',null,'recruiting',24,0);" )).total, 1);
  assert.equal(json(sql("set role anon; select public.list_public_clubs(null,null,'수원시',null,24,0);" )).items[0].public_key, "directory-waiting");
  const first = json(sql("set role anon; select public.list_public_clubs(null,null,null,null,1,0);"));
  assert.equal(first.items.length, 1); assert.equal(first.total, all.total); assert.equal(first.has_more, true);
});

test("public detail uses stable key and returns null for missing or inactive clubs", () => {
  const detail = json(sql("set role anon; select public.get_public_club('directory-public');"));
  assert.equal(detail.name, "TEST 서울 공개 동호회");
  assert.equal("id" in detail, false);
  assert.equal(sql("set role anon; select public.get_public_club('directory-hidden');").stdout.trim(), "");
  assert.equal(sql("set role anon; select public.get_public_club('missing');").stdout.trim(), "");
});

test("anon and inactive actors cannot register", () => {
  const payload = `'${JSON.stringify({ name: "TEST 차단 동호회", region: "서울", district: "강동구", summary: "TEST 차단 동호회 소개 열 자 이상입니다.", recruitment_status: "closed" })}'::jsonb`;
  const anon = sql(`set role anon; select public.register_club('${randomUUID()}',${payload});`);
  assert.notEqual(anon.status, 0); assert.match(anon.stderr, /permission denied/i);
  const inactive = authenticated(ids.inactive, `select public.register_club('${randomUUID()}',${payload});`);
  assert.notEqual(inactive.status, 0); assert.match(inactive.stderr, /활성 계정/);
});

test("active actor registration creates one club, membership, two roles, audit, and ledger", () => {
  const payload = JSON.stringify({ name: "TEST 신규 원자적 동호회", region: "서울", district: "강동구", summary: "TEST 신규 원자적 동호회 공개 소개입니다.", recruitment_status: "recruiting" });
  const created = json(authenticated(ids.active, `select public.register_club('${ids.request}',$payload$${payload}$payload$::jsonb);`));
  assert.equal(created.request_id, ids.request); assert.equal(created.replayed, false); assert.match(created.public_key, /^[0-9a-f]{32}$/);
  const counts = json(sql(`select jsonb_build_object(
    'clubs',(select count(*) from public.clubs where legacy_key='${created.public_key}' and club_status='active'),
    'memberships',(select count(*) from public.club_memberships m join public.clubs c on c.id=m.club_id where c.legacy_key='${created.public_key}' and m.user_id='${ids.active}' and m.membership_status='active'),
    'roles',(select count(*) from public.club_role_assignments a join public.club_memberships m on m.id=a.membership_id join public.clubs c on c.id=m.club_id where c.legacy_key='${created.public_key}' and a.revoked_at is null),
    'audits',(select count(*) from public.audit_logs where actor_id='${ids.active}' and request_id='${ids.request}' and action='club.register'),
    'ledgers',(select count(*) from private.club_mutation_requests where actor_id='${ids.active}' and request_id='${ids.request}' and completed_at is not null));`));
  assert.deepEqual(counts, { clubs: 1, memberships: 1, roles: 2, audits: 1, ledgers: 1 });
  const roles = json(sql(`select jsonb_agg(role_code order by role_code) from public.club_role_assignments a join public.club_memberships m on m.id=a.membership_id join public.clubs c on c.id=m.club_id where c.legacy_key='${created.public_key}' and a.revoked_at is null;`));
  assert.deepEqual(roles, ["club_admin", "club_member"]);
  assert.equal(json(sql(`set role anon; select public.get_public_club('${created.public_key}');`)).public_key, created.public_key);

  const replay = json(authenticated(ids.active, `select public.register_club('${ids.request}',$payload$${payload}$payload$::jsonb);`));
  assert.equal(replay.public_key, created.public_key); assert.equal(replay.replayed, true);
  assert.deepEqual(json(sql(`select jsonb_build_object('clubs',(select count(*) from public.clubs where legacy_key='${created.public_key}'),'audits',(select count(*) from public.audit_logs where request_id='${ids.request}'),'ledgers',(select count(*) from private.club_mutation_requests where request_id='${ids.request}'));`)), { clubs: 1, audits: 1, ledgers: 1 });

  const conflictPayload = JSON.stringify({ name: "TEST 다른 동호회", region: "서울", district: "강동구", summary: "TEST 다른 동호회 공개 소개입니다.", recruitment_status: "recruiting" });
  const conflict = authenticated(ids.active, `select public.register_club('${ids.request}',$payload$${conflictPayload}$payload$::jsonb);`);
  assert.notEqual(conflict.status, 0); assert.match(conflict.stderr, /다른 동호회 등록 요청/);
});

test("authenticated raw club and role DML remain blocked", () => {
  const club = authenticated(ids.active, "insert into public.clubs(legacy_key,name,club_status) values ('direct-club','직접 동호회','active');");
  assert.notEqual(club.status, 0); assert.match(club.stderr, /permission denied|row-level security/i);
  const role = authenticated(ids.active, "insert into public.club_role_assignments(membership_id,role_code) values ('00000000-0000-0000-0000-000000000000','club_admin');");
  assert.notEqual(role.status, 0); assert.match(role.stderr, /permission denied|row-level security/i);
});
