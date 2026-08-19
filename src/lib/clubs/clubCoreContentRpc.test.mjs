import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(fileURLToPath(new URL("../../../supabase/migrations/20260821000100_pul_club_core_content_foundation.sql", import.meta.url)), "utf8");

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

const ids = {
  admin: randomUUID(),
  manager: randomUUID(),
  member: randomUUID(),
  other: randomUUID(),
  club: randomUUID(),
  otherClub: randomUUID(),
  adminMembership: randomUUID(),
  managerMembership: randomUUID(),
  memberMembership: randomUUID(),
  otherMembership: randomUUID(),
  hiddenNotice: randomUUID(),
  hiddenPost: randomUUID(),
  hiddenEvent: randomUUID(),
  otherClubNotice: randomUUID(),
};
let container;
let database;
let publicNotice;
let memberNotice;
let post;
let officialEvent;
let publicNoticeRequest;

before(() => {
  const found = docker(["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"]).stdout.split(/\r?\n/).filter(Boolean);
  assert.equal(found.length, 1);
  container = found[0];
  database = `pul_club_core_content_${process.pid}_${Date.now()}`;
  assert.match(database, /^[a-z0-9_]+$/);
  const clone = docker(["exec", container, "sh", "-lc", [`createdb -U supabase_admin -O postgres ${database}`, `pg_dump -U supabase_admin -d postgres --schema-only | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`, `pg_dump -U supabase_admin -d postgres --data-only --disable-triggers | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`].join(" && ")]);
  assert.equal(clone.status, 0, clone.stdout + clone.stderr);
  const baseline = sql("select count(*) || ':' || max(version) from supabase_migrations.schema_migrations;");
  assert.equal(baseline.status, 0, baseline.stdout + baseline.stderr);
  assert.match(baseline.stdout, /27:20260807000200/);
  const applied = sql(`begin; ${migration} commit;`, "postgres");
  assert.equal(applied.status, 0, applied.stdout + applied.stderr);

  const authRows = [ids.admin, ids.manager, ids.member, ids.other].map((id) => `('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','club-core-${id}@example.invalid','',now(),now(),now())`).join(",");
  const fixture = sql(`
    set session_replication_role = replica;
    insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values ${authRows};
    insert into public.user_accounts(id,platform_role,account_status) values
      ('${ids.admin}','member','active'),('${ids.manager}','member','active'),('${ids.member}','member','active'),('${ids.other}','member','active');
    insert into public.user_profiles(user_id,display_name,profile_visibility) values
      ('${ids.admin}','TEST 회장','members'),('${ids.manager}','TEST 운영진','members'),('${ids.member}','TEST 회원','private'),('${ids.other}','TEST 타동호회 회원','private');
    insert into public.clubs(id,legacy_key,name,club_status) values
      ('${ids.club}','970001','TEST 콘텐츠 동호회','active'),('${ids.otherClub}','970002','TEST 다른 동호회','active');
    insert into public.club_memberships(id,club_id,user_id,membership_status) values
      ('${ids.adminMembership}','${ids.club}','${ids.admin}','active'),
      ('${ids.managerMembership}','${ids.club}','${ids.manager}','active'),
      ('${ids.memberMembership}','${ids.club}','${ids.member}','active'),
      ('${ids.otherMembership}','${ids.otherClub}','${ids.other}','active');
    insert into public.club_role_assignments(membership_id,role_code,assigned_by) values
      ('${ids.adminMembership}','club_admin','${ids.admin}'),
      ('${ids.managerMembership}','club_manager','${ids.admin}'),
      ('${ids.managerMembership}','club_member','${ids.admin}'),
      ('${ids.memberMembership}','club_member','${ids.admin}'),
      ('${ids.otherMembership}','club_member','${ids.other}');
    insert into public.club_notices(id,club_id,author_user_id,author_role_code,notice_type,importance,title,content_summary,visibility,notice_status) values
      ('${ids.hiddenNotice}','${ids.club}','${ids.manager}','club_manager','general','normal','TEST 숨김 공지','노출되면 안 됩니다.','public','hidden'),
      ('${ids.otherClubNotice}','${ids.otherClub}','${ids.other}','club_member','general','normal','TEST 다른 동호회 공지','혼합되면 안 됩니다.','public','published');
    insert into public.club_posts(id,club_id,author_user_id,author_role_code,post_type,title,content_summary,visibility,moderation_status,post_status) values
      ('${ids.hiddenPost}','${ids.club}','${ids.member}','club_member','general','TEST 숨김 글','노출되면 안 됩니다.','public','hidden','published');
    insert into public.club_official_events(id,club_id,creator_user_id,creator_role_code,event_type,event_status,title,starts_at,location,participant_target,reservation_method,visibility,moderation_status) values
      ('${ids.hiddenEvent}','${ids.club}','${ids.manager}','club_manager','other','scheduled','TEST 숨김 일정','2026-09-03T00:00:00Z','TEST 장소','활동 회원','checking','public','hidden');
    set session_replication_role = origin;
  `, "postgres");
  assert.equal(fixture.status, 0, fixture.stdout + fixture.stderr);
});

after(() => {
  if (!container || !database) return;
  const dropped = docker(["exec", container, "dropdb", "--if-exists", "--force", "-U", "supabase_admin", database]);
  assert.equal(dropped.status, 0, dropped.stdout + dropped.stderr);
});

test("catalog is security-definer RPC only and direct table ACL stays closed", () => {
  const result = sql(`
    select p.proname,p.provolatile,p.prosecdef,
      pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE'),
      pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE'),
      pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('get_club_core_content','mutate_club_core_content') order by p.proname;
  `);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stdout.trim(), "get_club_core_content|s|t|t|t|f\nmutate_club_core_content|v|t|f|t|f");
});

test("manager creates public/member notices and an official event", () => {
  publicNoticeRequest = randomUUID();
  publicNotice = json(authenticated(ids.manager, `select public.mutate_club_core_content('notice','create','${publicNoticeRequest}','${ids.club}',null,null,'{"title":"TEST 전체 공지","content_summary":"전체 공개 공지입니다.","notice_type":"general","importance":"normal","visibility":"public"}'::jsonb);`));
  memberNotice = json(authenticated(ids.manager, `select public.mutate_club_core_content('notice','create','${randomUUID()}','${ids.club}',null,null,'{"title":"TEST 회원 공지","content_summary":"회원 전용 공지입니다.","notice_type":"schedule","importance":"important","visibility":"club_members"}'::jsonb);`));
  officialEvent = json(authenticated(ids.manager, `select public.mutate_club_core_content('event','create','${randomUUID()}','${ids.club}',null,null,'{"title":"TEST 월례회","event_type":"monthly_meeting","event_status":"registration_open","starts_at":"2026-09-01T00:00:00Z","ends_at":"2026-09-01T02:00:00Z","linked_course_legacy_key":null,"location":"TEST 집결지","participant_target":"활동 회원","capacity":20,"reservation_method":"club_group_booking","member_reservation_guidance":"운영진 안내 확인","organizer_guidance":null,"visibility":"club_members"}'::jsonb);`));
  assert.deepEqual([publicNotice.content_type, memberNotice.content_type, officialEvent.content_type], ["notice", "notice", "event"]);
});

test("member creates a flash-meeting post and read visibility is privacy-minimized", () => {
  const request = randomUUID();
  post = json(authenticated(ids.member, `select public.mutate_club_core_content('post','create','${request}','${ids.club}',null,null,'{"title":"TEST 번개 모임","content_summary":"가볍게 함께 운동합니다.","post_type":"flash_meeting","starts_at":"2026-09-02T00:00:00Z","ends_at":null,"linked_course_legacy_key":null,"location":"TEST 구장","capacity":4,"participant_target":"활동 회원","recruitment_status":"recruiting","visibility":"club_members"}'::jsonb);`));
  const anon = json(sql(`set role anon; select public.get_club_core_content('${ids.club}');`));
  assert.equal(anon.notices.length, 1);
  assert.equal(anon.posts.length, 0);
  assert.equal(anon.official_events.length, 0);
  assert.deepEqual(anon.capabilities, { can_create_notice: false, can_manage_notice: false, can_create_post: false, can_moderate_post: false, can_create_event: false, can_manage_event: false });
  const memberView = json(authenticated(ids.member, `select public.get_club_core_content('${ids.club}');`));
  assert.equal(memberView.notices.length, 2);
  assert.equal(memberView.posts.length, 1);
  assert.equal(memberView.official_events.length, 1);
  assert.equal(Object.keys(memberView.posts[0]).some((key) => key.includes("user_id")), false);
  assert.equal(memberView.posts[0].author_display_name, "TEST 회원");
  const nonMemberView = json(authenticated(ids.other, `select public.get_club_core_content('${ids.club}');`));
  assert.equal(nonMemberView.notices.length, 1);
  assert.equal(nonMemberView.posts.length, 0);
  assert.equal(nonMemberView.official_events.length, 0);
  assert.equal(nonMemberView.notices.some((notice) => notice.id === ids.otherClubNotice), false);
  assert.equal(memberView.notices.some((notice) => notice.id === ids.hiddenNotice), false);
});

test("same request replays without duplicate mutation, audit, or ledger", () => {
  const replay = json(authenticated(ids.manager, `select public.mutate_club_core_content('notice','create','${publicNoticeRequest}','${ids.club}',null,null,'{"title":"TEST 전체 공지","content_summary":"전체 공개 공지입니다.","notice_type":"general","importance":"normal","visibility":"public"}'::jsonb);`));
  assert.equal(replay.replayed, true);
  assert.equal(replay.id, publicNotice.id);
  const counts = sql(`select (select count(*) from public.club_notices where id='${publicNotice.id}') || ':' || (select count(*) from public.audit_logs where request_id='${publicNoticeRequest}') || ':' || (select count(*) from private.club_mutation_requests where request_id='${publicNoticeRequest}');`);
  assert.equal(counts.status, 0, counts.stdout + counts.stderr);
  assert.equal(counts.stdout.trim(), "1:1:1");
  const conflict = authenticated(ids.manager, `select public.mutate_club_core_content('notice','create','${publicNoticeRequest}','${ids.club}',null,null,'{"title":"TEST 다른 제목","content_summary":"전체 공개 공지입니다.","notice_type":"general","importance":"normal","visibility":"public"}'::jsonb);`);
  assert.notEqual(conflict.status, 0);
  assert.match(conflict.stderr, /같은 요청 식별자를 다른 입력/);
});

test("member/other-club permission and ownership boundaries fail closed", () => {
  const noticeDenied = authenticated(ids.member, `select public.mutate_club_core_content('notice','create','${randomUUID()}','${ids.club}',null,null,'{"title":"TEST 권한 없음","content_summary":"차단되어야 합니다.","notice_type":"general","importance":"normal","visibility":"public"}'::jsonb);`);
  assert.notEqual(noticeDenied.status, 0);
  assert.match(noticeDenied.stderr, /공지사항 작성 권한/);
  const deleteDenied = authenticated(ids.other, `select public.mutate_club_core_content('post','delete','${randomUUID()}','${ids.club}','${post.id}',1,'{}'::jsonb);`);
  assert.notEqual(deleteDenied.status, 0);
  assert.match(deleteDenied.stderr, /활동 중인 동호회 회원/);
  const otherMemberUpdateDenied = authenticated(ids.admin, `select public.mutate_club_core_content('post','update','${randomUUID()}','${ids.club}','${post.id}',1,'{"title":"TEST 타인 수정","content_summary":"차단되어야 합니다.","post_type":"flash_meeting","starts_at":"2026-09-02T00:00:00Z","ends_at":null,"linked_course_legacy_key":null,"location":"TEST 구장","capacity":4,"participant_target":"활동 회원","recruitment_status":"recruiting","visibility":"club_members"}'::jsonb);`);
  assert.notEqual(otherMemberUpdateDenied.status, 0);
  assert.match(otherMemberUpdateDenied.stderr, /작성자만 게시글을 수정/);
  const eventDenied = authenticated(ids.member, `select public.mutate_club_core_content('event','create','${randomUUID()}','${ids.club}',null,null,'{"title":"TEST 권한 없는 일정","event_type":"other","event_status":"scheduled","starts_at":"2026-09-04T00:00:00Z","ends_at":null,"linked_course_legacy_key":null,"location":"TEST 장소","participant_target":"활동 회원","capacity":null,"reservation_method":"checking","member_reservation_guidance":null,"organizer_guidance":null,"visibility":"club_members"}'::jsonb);`);
  assert.notEqual(eventDenied.status, 0);
  assert.match(eventDenied.stderr, /공식 일정 작성 권한/);
  const noCrossClub = authenticated(ids.manager, `select public.mutate_club_core_content('post','create','${randomUUID()}','${ids.otherClub}',null,null,'{"title":"TEST 타동호회","content_summary":"차단되어야 합니다.","post_type":"general","starts_at":null,"ends_at":null,"linked_course_legacy_key":null,"location":null,"capacity":null,"participant_target":null,"recruitment_status":null,"visibility":"public"}'::jsonb);`);
  assert.notEqual(noCrossClub.status, 0);
  assert.match(noCrossClub.stderr, /활동 중인 동호회 회원/);
});

test("optimistic versions and soft removal preserve atomic history", () => {
  const updated = json(authenticated(ids.manager, `select public.mutate_club_core_content('notice','update','${randomUUID()}','${ids.club}','${publicNotice.id}',1,'{"title":"TEST 전체 공지 수정","content_summary":"수정된 전체 공개 공지입니다.","notice_type":"general","importance":"normal","visibility":"public"}'::jsonb);`));
  assert.equal(updated.version, 2);
  const stale = authenticated(ids.manager, `select public.mutate_club_core_content('notice','update','${randomUUID()}','${ids.club}','${publicNotice.id}',1,'{"title":"TEST 오래된 수정","content_summary":"차단되어야 합니다.","notice_type":"general","importance":"normal","visibility":"public"}'::jsonb);`);
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /변경되었습니다/);
  const cancelled = json(authenticated(ids.manager, `select public.mutate_club_core_content('event','cancel','${randomUUID()}','${ids.club}','${officialEvent.id}',1,'{}'::jsonb);`));
  const deleted = json(authenticated(ids.member, `select public.mutate_club_core_content('post','delete','${randomUUID()}','${ids.club}','${post.id}',1,'{}'::jsonb);`));
  assert.equal(cancelled.version, 2);
  assert.equal(deleted.version, 2);
  const states = sql(`select (select event_status from public.club_official_events where id='${officialEvent.id}') || ':' || (select post_status from public.club_posts where id='${post.id}');`);
  assert.equal(states.status, 0, states.stdout + states.stderr);
  assert.equal(states.stdout.trim(), "cancelled:deleted");
});

test("authenticated direct DML remains denied and failed calls leave no ledger", () => {
  const direct = authenticated(ids.member, `insert into public.club_posts(club_id,author_user_id,author_role_code,post_type,title,content_summary,visibility) values ('${ids.club}','${ids.member}','club_member','general','TEST 직접 작성','차단되어야 합니다.','public');`);
  assert.notEqual(direct.status, 0);
  assert.match(direct.stderr, /permission denied|row-level security/i);
  const totals = sql("select (select count(*) from public.audit_logs where action like 'club_content.%') || ':' || (select count(*) from private.club_mutation_requests where action_code like 'club_content.%' and completed_at is not null) || ':' || (select count(*) from private.club_mutation_requests where action_code like 'club_content.%' and completed_at is null);");
  assert.equal(totals.status, 0, totals.stdout + totals.stderr);
  assert.equal(totals.stdout.trim(), "7:7:0");
});
