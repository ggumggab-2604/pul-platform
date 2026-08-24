import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { after, before, test } from "node:test";

function docker(args, input) {
  return spawnSync("docker", args, { encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 });
}

function sql(text, user = "supabase_admin") {
  return docker(["exec", "-i", container, "psql", "-U", user, "-d", database, "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"], text);
}

function authenticated(actor, text) {
  return sql(`set request.jwt.claim.sub = '${actor}'; set role authenticated; ${text}`);
}

function json(result) {
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return JSON.parse(result.stdout.trim());
}

function payload(overrides = {}) {
  return JSON.stringify({
    title: "TEST 동호회 이야기",
    content_summary: "활동 회원의 게시판 글쓰기 실데이터 연결 테스트입니다.",
    post_type: "general",
    starts_at: null,
    ends_at: null,
    linked_course_legacy_key: null,
    location: null,
    capacity: null,
    participant_target: null,
    recruitment_status: null,
    visibility: "public",
    ...overrides,
  }).replaceAll("'", "''");
}

function createPost(actor, requestId, clubId, postPayload = payload()) {
  return authenticated(
    actor,
    `select public.mutate_club_core_content('post','create','${requestId}','${clubId}',null,null,'${postPayload}'::jsonb);`,
  );
}

const ids = {
  member: randomUUID(),
  nonMember: randomUUID(),
  inactiveMember: randomUUID(),
  suspendedAccount: randomUUID(),
  club: randomUUID(),
  inactiveClub: randomUUID(),
  memberMembership: randomUUID(),
  inactiveMembership: randomUUID(),
  suspendedAccountMembership: randomUUID(),
};

let container;
let database;
let requestId;
let createdPost;
let initialNoticeCount;
let initialEventCount;

before(() => {
  const found = docker(["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"]).stdout
    .split(/\r?\n/)
    .filter(Boolean);
  assert.equal(found.length, 1);
  container = found[0];
  database = `pul_club_board_posting_${process.pid}_${Date.now()}`;
  assert.match(database, /^[a-z0-9_]+$/);

  const clone = docker([
    "exec",
    container,
    "sh",
    "-lc",
    [
      `createdb -U supabase_admin -O postgres ${database}`,
      `pg_dump -U supabase_admin -d postgres --schema-only | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
      `pg_dump -U supabase_admin -d postgres --data-only --disable-triggers | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
    ].join(" && "),
  ]);
  assert.equal(clone.status, 0, clone.stdout + clone.stderr);

  const baseline = sql("select count(*) || ':' || max(version) from supabase_migrations.schema_migrations;");
  assert.equal(baseline.status, 0, baseline.stdout + baseline.stderr);
  assert.equal(baseline.stdout.trim(), "64:20260910000100");

  const authRows = [ids.member, ids.nonMember, ids.inactiveMember, ids.suspendedAccount]
    .map((id) => `('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','club-board-${id}@example.invalid','',now(),now(),now())`)
    .join(",");
  const fixture = sql(`
    set session_replication_role = replica;
    insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
    values ${authRows};
    insert into public.user_accounts(id,platform_role,account_status) values
      ('${ids.member}','member','active'),
      ('${ids.nonMember}','member','active'),
      ('${ids.inactiveMember}','member','active'),
      ('${ids.suspendedAccount}','member','suspended');
    insert into public.user_profiles(user_id,display_name,profile_visibility) values
      ('${ids.member}','TEST 게시판 회원','private');
    insert into public.clubs(id,legacy_key,name,club_status) values
      ('${ids.club}','833${Date.now().toString().slice(-9)}','TEST 게시판 동호회','active'),
      ('${ids.inactiveClub}','834${Date.now().toString().slice(-9)}','TEST 비활성 동호회','suspended');
    insert into public.club_memberships(id,club_id,user_id,membership_status,suspended_at) values
      ('${ids.memberMembership}','${ids.club}','${ids.member}','active',null),
      ('${ids.inactiveMembership}','${ids.club}','${ids.inactiveMember}','suspended',now()),
      ('${ids.suspendedAccountMembership}','${ids.club}','${ids.suspendedAccount}','active',null);
    insert into public.club_role_assignments(membership_id,role_code,assigned_by) values
      ('${ids.memberMembership}','club_member','${ids.member}'),
      ('${ids.inactiveMembership}','club_member','${ids.inactiveMember}'),
      ('${ids.suspendedAccountMembership}','club_member','${ids.suspendedAccount}');
    set session_replication_role = origin;
  `, "postgres");
  assert.equal(fixture.status, 0, fixture.stdout + fixture.stderr);

  const initialCounts = sql(`select
    (select count(*) from public.club_notices where club_id='${ids.club}') || ':' ||
    (select count(*) from public.club_official_events where club_id='${ids.club}');`);
  assert.equal(initialCounts.status, 0, initialCounts.stdout + initialCounts.stderr);
  [initialNoticeCount, initialEventCount] = initialCounts.stdout.trim().split(":").map(Number);
});

after(() => {
  if (!container || !database) return;
  const dropped = docker(["exec", container, "dropdb", "--if-exists", "--force", "-U", "supabase_admin", database]);
  assert.equal(dropped.status, 0, dropped.stdout + dropped.stderr);
});

test("active member creates one public general post in the intended club", () => {
  requestId = randomUUID();
  createdPost = json(createPost(ids.member, requestId, ids.club));
  assert.equal(createdPost.content_type, "post");
  assert.equal(createdPost.operation, "create");
  assert.equal(createdPost.request_id, requestId);
  assert.equal(createdPost.version, 1);
  assert.equal(createdPost.replayed, false);

  const stored = sql(`select club_id || ':' || post_type || ':' || coalesce(recruitment_status,'NULL') || ':' || post_status
    from public.club_posts where id='${createdPost.id}';`);
  assert.equal(stored.status, 0, stored.stdout + stored.stderr);
  assert.equal(stored.stdout.trim(), `${ids.club}:general:NULL:published`);
});

test("same request replays without duplicate post, audit, or ledger", () => {
  const replay = json(createPost(ids.member, requestId, ids.club));
  assert.equal(replay.replayed, true);
  assert.equal(replay.id, createdPost.id);
  const counts = sql(`select
    (select count(*) from public.club_posts where id='${createdPost.id}') || ':' ||
    (select count(*) from public.audit_logs where request_id='${requestId}') || ':' ||
    (select count(*) from private.club_mutation_requests where actor_id='${ids.member}' and request_id='${requestId}');`);
  assert.equal(counts.status, 0, counts.stdout + counts.stderr);
  assert.equal(counts.stdout.trim(), "1:1:1");
});

test("anon, non-member, inactive membership, and suspended account writes fail closed", () => {
  const anon = sql(`set role anon; select public.mutate_club_core_content('post','create','${randomUUID()}','${ids.club}',null,null,'${payload()}'::jsonb);`);
  assert.notEqual(anon.status, 0);
  assert.match(anon.stderr, /permission denied/i);

  for (const [actor, expected] of [
    [ids.nonMember, /활동 중인 동호회 회원/],
    [ids.inactiveMember, /활동 중인 동호회 회원/],
    [ids.suspendedAccount, /정상 활동 계정/],
  ]) {
    const denied = createPost(actor, randomUUID(), ids.club);
    assert.notEqual(denied.status, 0);
    assert.match(denied.stderr, expected);
  }
});

test("inactive clubs and invalid title or body boundaries fail closed", () => {
  const inactiveClub = createPost(ids.member, randomUUID(), ids.inactiveClub);
  assert.notEqual(inactiveClub.status, 0);
  assert.match(inactiveClub.stderr, /활동 중인 동호회|찾을 수 없습니다/);

  for (const invalid of [
    payload({ title: "한" }),
    payload({ title: "가".repeat(121) }),
    payload({ content_summary: "   " }),
    payload({ content_summary: "가".repeat(5001) }),
  ]) {
    const denied = createPost(ids.member, randomUUID(), ids.club, invalid);
    assert.notEqual(denied.status, 0);
    assert.match(denied.stderr, /게시글 입력값/);
  }
});

test("read DTO is privacy-minimized and direct table insertion remains denied", () => {
  const memberView = json(authenticated(ids.member, `select public.get_club_core_content('${ids.club}');`));
  const post = memberView.posts.find((item) => item.id === createdPost.id);
  assert.ok(post);
  for (const forbidden of ["author_user_id", "membership_id", "club_id", "email"]) {
    assert.equal(Object.hasOwn(post, forbidden), false);
  }

  const direct = authenticated(ids.member, `insert into public.club_posts(
    club_id,author_user_id,author_role_code,post_type,title,content_summary,visibility
  ) values ('${ids.club}','${ids.member}','club_member','general','TEST 직접 작성','차단되어야 합니다.','public');`);
  assert.notEqual(direct.status, 0);
  assert.match(direct.stderr, /permission denied|row-level security/i);
});

test("posting does not mutate notices or official events", () => {
  const counts = sql(`select
    (select count(*) from public.club_notices where club_id='${ids.club}') || ':' ||
    (select count(*) from public.club_official_events where club_id='${ids.club}');`);
  assert.equal(counts.status, 0, counts.stdout + counts.stderr);
  assert.equal(counts.stdout.trim(), `${initialNoticeCount}:${initialEventCount}`);
});
