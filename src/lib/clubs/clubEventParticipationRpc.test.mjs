import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const coreMigration = readFileSync(fileURLToPath(new URL("../../../supabase/migrations/20260821000100_pul_club_core_content_foundation.sql", import.meta.url)), "utf8");
const migration = readFileSync(fileURLToPath(new URL("../../../supabase/migrations/20260907000100_pul_club_event_participation.sql", import.meta.url)), "utf8");

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

function sqlAsync(text) {
  return dockerAsync(["exec", "-i", container, "psql", "-U", "supabase_admin", "-d", database, "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"], text);
}

function authenticated(actor, text) {
  return sql(`set request.jwt.claim.sub = '${actor}'; set role authenticated; ${text}`);
}

function authenticatedText(actor, text) {
  return `set request.jwt.claim.sub = '${actor}'; set role authenticated; ${text}`;
}

function json(result) {
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return JSON.parse(result.stdout.trim());
}

const ids = {
  admin: randomUUID(),
  member: randomUUID(),
  memberTwo: randomUUID(),
  other: randomUUID(),
  club: randomUUID(),
  otherClub: randomUUID(),
  adminMembership: randomUUID(),
  memberMembership: randomUUID(),
  memberTwoMembership: randomUUID(),
  otherMembership: randomUUID(),
  event: randomUUID(),
  memberEvent: randomUUID(),
  capacityEvent: randomUUID(),
};

let container;
let database;

before(() => {
  const found = docker(["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"]).stdout.split(/\r?\n/).filter(Boolean);
  assert.equal(found.length, 1);
  container = found[0];
  database = `pul_club_event_participation_${process.pid}_${Date.now()}`;
  assert.match(database, /^[a-z0-9_]+$/);
  const clone = docker(["exec", container, "sh", "-lc", [`createdb -U supabase_admin -O postgres ${database}`, `pg_dump -U supabase_admin -d postgres --schema-only | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`, `pg_dump -U supabase_admin -d postgres --data-only --disable-triggers | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`].join(" && ")]);
  assert.equal(clone.status, 0, clone.stdout + clone.stderr);

  if (sql("select pg_catalog.to_regclass('public.club_official_events');").stdout.trim() === "") {
    const coreApplied = sql(`begin; ${coreMigration} commit;`, "postgres");
    assert.equal(coreApplied.status, 0, coreApplied.stdout + coreApplied.stderr);
  }
  if (sql("select pg_catalog.to_regclass('public.club_official_event_participations');").stdout.trim() === "") {
    const applied = sql(`begin; ${migration} commit;`, "postgres");
    assert.equal(applied.status, 0, applied.stdout + applied.stderr);
  }

  const authRows = [ids.admin, ids.member, ids.memberTwo, ids.other]
    .map((id) => `('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','club-event-${id}@example.invalid','',now(),now(),now())`)
    .join(",");
  const fixture = sql(`
    set session_replication_role = replica;
    insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values ${authRows};
    insert into public.user_accounts(id,platform_role,account_status) values
      ('${ids.admin}','member','active'),
      ('${ids.member}','member','active'),
      ('${ids.memberTwo}','member','active'),
      ('${ids.other}','member','active');
    insert into public.user_profiles(user_id,display_name,profile_visibility) values
      ('${ids.admin}','TEST 회장','private'),
      ('${ids.member}','TEST 참가 회원','private'),
      ('${ids.memberTwo}','TEST 두 번째 회원','private'),
      ('${ids.other}','TEST 타동호회 회원','private');
    insert into public.clubs(id,legacy_key,name,club_status) values
      ('${ids.club}','980001','TEST 일정 참가 동호회','active'),
      ('${ids.otherClub}','980002','TEST 다른 동호회','active');
    insert into public.club_memberships(id,club_id,user_id,membership_status) values
      ('${ids.adminMembership}','${ids.club}','${ids.admin}','active'),
      ('${ids.memberMembership}','${ids.club}','${ids.member}','active'),
      ('${ids.memberTwoMembership}','${ids.club}','${ids.memberTwo}','active'),
      ('${ids.otherMembership}','${ids.otherClub}','${ids.other}','active');
    insert into public.club_role_assignments(membership_id,role_code,assigned_by) values
      ('${ids.adminMembership}','club_admin','${ids.admin}'),
      ('${ids.memberMembership}','club_member','${ids.admin}'),
      ('${ids.memberTwoMembership}','club_member','${ids.admin}'),
      ('${ids.otherMembership}','club_member','${ids.other}');
    insert into public.club_official_events(id,club_id,creator_user_id,creator_role_code,event_type,event_status,title,starts_at,location,participant_target,capacity,reservation_method,visibility,moderation_status) values
      ('${ids.event}','${ids.club}','${ids.admin}','club_admin','monthly_meeting','registration_open','TEST 공개 월례회','2026-10-01T00:00:00Z','TEST 장소','활동 회원',10,'club_group_booking','public','visible'),
      ('${ids.memberEvent}','${ids.club}','${ids.admin}','club_admin','training','registration_open','TEST 회원 일정','2026-10-02T00:00:00Z','TEST 장소','활동 회원',10,'club_group_booking','club_members','visible'),
      ('${ids.capacityEvent}','${ids.club}','${ids.admin}','club_admin','friendly_match','registration_open','TEST 정원 일정','2026-10-03T00:00:00Z','TEST 장소','활동 회원',2,'club_group_booking','public','visible');
    set session_replication_role = origin;
  `, "postgres");
  assert.equal(fixture.status, 0, fixture.stdout + fixture.stderr);
});

after(() => {
  if (!container || !database) return;
  const dropped = docker(["exec", container, "dropdb", "--if-exists", "--force", "-U", "supabase_admin", database]);
  assert.equal(dropped.status, 0, dropped.stdout + dropped.stderr);
});

test("catalog exposes read to anon/authenticated and mutations only to authenticated", () => {
  const functions = sql(`
    select p.proname,p.provolatile,p.prosecdef,
      pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE'),
      pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE'),
      pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in ('get_club_event_participation','join_club_event','leave_club_event')
    order by p.proname;
  `);
  assert.equal(functions.status, 0, functions.stdout + functions.stderr);
  assert.equal(functions.stdout.trim(), "get_club_event_participation|s|t|t|t|f\njoin_club_event|v|t|f|t|f\nleave_club_event|v|t|f|t|f");
  const tableAcl = sql("select has_table_privilege('authenticated','public.club_official_event_participations','SELECT') || ':' || has_table_privilege('authenticated','public.club_official_event_participations','INSERT') || ':' || has_table_privilege('authenticated','public.club_official_event_participations','UPDATE') || ':' || has_table_privilege('authenticated','public.club_official_event_participations','DELETE');");
  assert.equal(tableAcl.status, 0, tableAcl.stdout + tableAcl.stderr);
  assert.equal(tableAcl.stdout.trim(), "false:false:false:false");
});

test("read contract returns public counts and only the caller own state", () => {
  const anonymous = json(sql(`set role anon; select public.get_club_event_participation('${ids.club}');`));
  assert.equal(anonymous.authentication_status, "anonymous");
  assert.equal(anonymous.can_join, false);
  assert.deepEqual(anonymous.events.map((event) => event.event_id), [ids.event, ids.capacityEvent]);
  assert.equal(anonymous.events.every((event) => event.participant_count === 0 && event.is_participating === false && event.joined_at === null), true);

  const member = json(authenticated(ids.member, `select public.get_club_event_participation('${ids.club}');`));
  assert.equal(member.authentication_status, "authenticated");
  assert.equal(member.can_join, true);
  assert.equal(member.events.length, 3);
  assert.equal(Object.keys(member.events[0]).some((key) => /membership|user|email|name/.test(key)), false);

  const nonMember = json(authenticated(ids.other, `select public.get_club_event_participation('${ids.club}');`));
  assert.equal(nonMember.can_join, false);
  assert.deepEqual(nonMember.events.map((event) => event.event_id), [ids.event, ids.capacityEvent]);
});

test("join and leave are duplicate-safe and keep participant count exact", () => {
  const joined = json(authenticated(ids.member, `select public.join_club_event('${ids.event}');`));
  assert.deepEqual(joined, { event_id: ids.event, participating: true, participant_count: 1 });
  const replayedJoin = json(authenticated(ids.member, `select public.join_club_event('${ids.event}');`));
  assert.deepEqual(replayedJoin, joined);
  const joinedRows = sql(`select count(*) from public.club_official_event_participations where event_id='${ids.event}' and membership_id='${ids.memberMembership}';`);
  assert.equal(joinedRows.stdout.trim(), "1");

  const left = json(authenticated(ids.member, `select public.leave_club_event('${ids.event}');`));
  assert.deepEqual(left, { event_id: ids.event, participating: false, participant_count: 0 });
  const replayedLeave = json(authenticated(ids.member, `select public.leave_club_event('${ids.event}');`));
  assert.deepEqual(replayedLeave, left);
});

test("non-members, inactive memberships, closed events, and direct DML fail closed", () => {
  const anonymous = sql(`set role anon; select public.join_club_event('${ids.event}');`);
  assert.notEqual(anonymous.status, 0);
  assert.match(anonymous.stderr, /permission denied/i);

  const nonMember = authenticated(ids.other, `select public.join_club_event('${ids.event}');`);
  assert.notEqual(nonMember.status, 0);
  assert.match(nonMember.stderr, /활동 중인 동호회 회원/);

  const suspend = sql(`update public.club_memberships set membership_status='suspended', suspended_at=now(), left_at=null where id='${ids.memberMembership}';`, "postgres");
  assert.equal(suspend.status, 0, suspend.stdout + suspend.stderr);
  const inactive = authenticated(ids.member, `select public.join_club_event('${ids.event}');`);
  assert.notEqual(inactive.status, 0);
  assert.match(inactive.stderr, /활동 중인 동호회 회원/);
  const resume = sql(`update public.club_memberships set membership_status='active', suspended_at=null, left_at=null where id='${ids.memberMembership}';`, "postgres");
  assert.equal(resume.status, 0, resume.stdout + resume.stderr);

  const close = sql(`update public.club_official_events set event_status='registration_closed' where id='${ids.memberEvent}';`, "postgres");
  assert.equal(close.status, 0, close.stdout + close.stderr);
  const closed = authenticated(ids.member, `select public.join_club_event('${ids.memberEvent}');`);
  assert.notEqual(closed.status, 0);
  assert.match(closed.stderr, /현재 참가 신청/);

  const hide = sql(`update public.club_official_events set event_status='registration_open', moderation_status='hidden' where id='${ids.memberEvent}';`, "postgres");
  assert.equal(hide.status, 0, hide.stdout + hide.stderr);
  const hidden = authenticated(ids.member, `select public.join_club_event('${ids.memberEvent}');`);
  assert.notEqual(hidden.status, 0);
  assert.match(hidden.stderr, /현재 참가 신청/);

  const cancel = sql(`update public.club_official_events set event_status='cancelled', moderation_status='visible' where id='${ids.memberEvent}';`, "postgres");
  assert.equal(cancel.status, 0, cancel.stdout + cancel.stderr);
  const cancelled = authenticated(ids.member, `select public.join_club_event('${ids.memberEvent}');`);
  assert.notEqual(cancelled.status, 0);
  assert.match(cancelled.stderr, /현재 참가 신청/);

  const missing = authenticated(ids.member, `select public.join_club_event('${randomUUID()}');`);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /공식 일정을 찾을 수 없습니다/);
  const invalid = authenticated(ids.member, "select public.join_club_event(null);");
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /요청 값이 올바르지 않습니다/);

  const direct = authenticated(ids.member, `insert into public.club_official_event_participations(event_id,membership_id) values ('${ids.event}','${ids.memberMembership}');`);
  assert.notEqual(direct.status, 0);
  assert.match(direct.stderr, /permission denied|row-level security/i);
});

test("membership suspension removes an existing participation in the same transaction", () => {
  json(authenticated(ids.member, `select public.join_club_event('${ids.event}');`));
  const suspend = sql(`begin; update public.club_memberships set membership_status='suspended', suspended_at=now(), left_at=null where id='${ids.memberMembership}'; select count(*) from public.club_official_event_participations where membership_id='${ids.memberMembership}'; commit;`, "postgres");
  assert.equal(suspend.status, 0, suspend.stdout + suspend.stderr);
  assert.equal(suspend.stdout.trim(), "0");
  const resume = sql(`update public.club_memberships set membership_status='active', suspended_at=null, left_at=null where id='${ids.memberMembership}';`, "postgres");
  assert.equal(resume.status, 0, resume.stdout + resume.stderr);
});

test("event row lock serializes concurrent joins at the minimum capacity", async () => {
  const [first, second, third] = await Promise.all([
    sqlAsync(authenticatedText(ids.admin, `select public.join_club_event('${ids.capacityEvent}');`)),
    sqlAsync(authenticatedText(ids.member, `select public.join_club_event('${ids.capacityEvent}');`)),
    sqlAsync(authenticatedText(ids.memberTwo, `select public.join_club_event('${ids.capacityEvent}');`)),
  ]);
  const results = [first, second, third];
  const successes = results.filter((result) => result.status === 0);
  const failures = results.filter((result) => result.status !== 0);
  assert.equal(successes.length, 2, results.map((result) => result.stdout + result.stderr).join(""));
  assert.equal(failures.length, 1, results.map((result) => result.stdout + result.stderr).join(""));
  assert.match(failures[0].stderr, /참가 정원이 모두 찼습니다/);
  const count = sql(`select count(*) from public.club_official_event_participations where event_id='${ids.capacityEvent}';`);
  assert.equal(count.stdout.trim(), "2");
});
