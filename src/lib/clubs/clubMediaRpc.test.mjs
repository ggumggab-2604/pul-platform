import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const coreMigration = readFileSync(fileURLToPath(new URL("../../../supabase/migrations/20260821000100_pul_club_core_content_foundation.sql", import.meta.url)), "utf8");
const mediaMigration = readFileSync(fileURLToPath(new URL("../../../supabase/migrations/20260822000100_pul_club_media_foundation.sql", import.meta.url)), "utf8");

function docker(args, input) {
  return spawnSync("docker", args, { encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 });
}

function sql(text, user = "supabase_admin") {
  return docker(["exec", "-i", container, "psql", "-U", user, "-d", database, "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"], text);
}

function authenticated(actor, text) {
  return sql(`set request.jwt.claim.sub = '${actor}'; set role authenticated; ${text}`);
}

function service(text) {
  return sql(`set role service_role; ${text}`);
}

function json(result) {
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return JSON.parse(result.stdout.trim());
}

const ids = {
  admin: randomUUID(),
  manager: randomUUID(),
  member: randomUUID(),
  outsider: randomUUID(),
  club: randomUUID(),
  otherClub: randomUUID(),
  adminMembership: randomUUID(),
  managerMembership: randomUUID(),
  memberMembership: randomUUID(),
  outsiderMembership: randomUUID(),
  publicNotice: randomUUID(),
  memberNotice: randomUUID(),
  hiddenNotice: randomUUID(),
  cancelledEvent: randomUUID(),
  deletedPost: randomUUID(),
};

let container;
let database;
let representative;
let activity;

before(() => {
  const found = docker(["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"]).stdout.split(/\r?\n/).filter(Boolean);
  assert.equal(found.length, 1);
  container = found[0];
  database = `pul_club_media_${process.pid}_${Date.now()}`;
  assert.match(database, /^[a-z0-9_]+$/);
  const clone = docker(["exec", container, "sh", "-lc", [
    `createdb -U supabase_admin -O postgres ${database}`,
    `pg_dump -U supabase_admin -d postgres --schema-only | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
    `pg_dump -U supabase_admin -d postgres --data-only --disable-triggers | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
  ].join(" && ")]);
  assert.equal(clone.status, 0, clone.stdout + clone.stderr);
  const baseline = sql("select count(*) || ':' || max(version) from supabase_migrations.schema_migrations;");
  assert.equal(baseline.status, 0, baseline.stdout + baseline.stderr);
  assert.match(baseline.stdout, /27:20260807000200/);
  const applied = sql(`begin; ${coreMigration} ${mediaMigration} commit;`, "postgres");
  assert.equal(applied.status, 0, applied.stdout + applied.stderr);

  const authRows = [ids.admin, ids.manager, ids.member, ids.outsider]
    .map((id) => `('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','club-media-${id}@example.invalid','',now(),now(),now())`)
    .join(",");
  const fixture = sql(`
    set session_replication_role = replica;
    insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values ${authRows};
    insert into public.user_accounts(id,platform_role,account_status) values
      ('${ids.admin}','member','active'),('${ids.manager}','member','active'),('${ids.member}','member','active'),('${ids.outsider}','member','active');
    insert into public.user_profiles(user_id,display_name,profile_visibility) values
      ('${ids.admin}','TEST 회장','members'),('${ids.manager}','TEST 운영진','members'),('${ids.member}','TEST 회원','members'),('${ids.outsider}','TEST 외부 회원','members');
    insert into public.clubs(id,legacy_key,name,club_status) values
      ('${ids.club}','980001','TEST 사진 동호회','active'),('${ids.otherClub}','980002','TEST 다른 동호회','active');
    insert into public.club_memberships(id,club_id,user_id,membership_status) values
      ('${ids.adminMembership}','${ids.club}','${ids.admin}','active'),
      ('${ids.managerMembership}','${ids.club}','${ids.manager}','active'),
      ('${ids.memberMembership}','${ids.club}','${ids.member}','active'),
      ('${ids.outsiderMembership}','${ids.otherClub}','${ids.outsider}','active');
    insert into public.club_role_assignments(membership_id,role_code,assigned_by) values
      ('${ids.adminMembership}','club_admin','${ids.admin}'),
      ('${ids.managerMembership}','club_manager','${ids.admin}'),
      ('${ids.managerMembership}','club_member','${ids.admin}'),
      ('${ids.memberMembership}','club_member','${ids.admin}'),
      ('${ids.outsiderMembership}','club_member','${ids.outsider}');
    insert into public.club_notices(id,club_id,author_user_id,author_role_code,notice_type,importance,title,content_summary,visibility,notice_status,created_at) values
      ('${ids.publicNotice}','${ids.club}','${ids.manager}','club_manager','general','normal','TEST 공개 공지','공개 최근 활동','public','published',now() - interval '4 hours'),
      ('${ids.memberNotice}','${ids.club}','${ids.manager}','club_manager','general','normal','TEST 회원 공지','회원 최근 활동','club_members','published',now() - interval '3 hours'),
      ('${ids.hiddenNotice}','${ids.club}','${ids.manager}','club_manager','general','normal','TEST 숨김 공지','노출 금지','public','hidden',now() - interval '2 hours');
    insert into public.club_official_events(id,club_id,creator_user_id,creator_role_code,event_type,event_status,title,starts_at,location,participant_target,reservation_method,visibility,moderation_status,created_at) values
      ('${ids.cancelledEvent}','${ids.club}','${ids.manager}','club_manager','monthly_meeting','cancelled','TEST 취소 일정',now() + interval '1 day','TEST 장소','회원','checking','public','visible',now() - interval '1 hour');
    insert into public.club_posts(id,club_id,author_user_id,author_role_code,post_type,title,content_summary,visibility,moderation_status,post_status,created_at) values
      ('${ids.deletedPost}','${ids.club}','${ids.member}','club_member','general','TEST 삭제 글','노출 금지','public','visible','deleted',now());
    set session_replication_role = origin;
  `, "postgres");
  assert.equal(fixture.status, 0, fixture.stdout + fixture.stderr);
});

after(() => {
  if (!container || !database) return;
  const dropped = docker(["exec", container, "dropdb", "--if-exists", "--force", "-U", "supabase_admin", database]);
  assert.equal(dropped.status, 0, dropped.stdout + dropped.stderr);
});

test("catalog keeps table and Storage writes closed while public reads use the bucket", () => {
  const bucket = sql("select public || ':' || file_size_limit || ':' || array_to_string(allowed_mime_types, ',') from storage.buckets where id='club-media';");
  assert.equal(bucket.status, 0, bucket.stdout + bucket.stderr);
  assert.equal(bucket.stdout.trim(), "true:8388608:image/jpeg,image/png,image/webp");
  const acl = sql(`select pg_catalog.has_table_privilege('authenticated','public.club_media','INSERT,UPDATE,DELETE') || ':' || (select count(*) from pg_catalog.pg_policies where schemaname='storage' and tablename='objects' and (qual like '%club-media%' or with_check like '%club-media%'));`);
  assert.equal(acl.status, 0, acl.stdout + acl.stderr);
  assert.equal(acl.stdout.trim(), "false:0");
  const functions = sql(`select p.proname,pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE'),pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE'),pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE') from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('get_club_media_content','create_club_media_upload_intent','get_club_media_upload_context_server','finalize_club_media_upload_server','remove_club_media_server') order by p.proname;`);
  assert.equal(functions.status, 0, functions.stdout + functions.stderr);
  assert.equal(functions.stdout.trim(), "create_club_media_upload_intent|f|t|f\nfinalize_club_media_upload_server|f|f|t\nget_club_media_content|t|t|f\nget_club_media_upload_context_server|f|f|t\nremove_club_media_server|f|f|t");
});

test("manager creates and atomically replaces the representative photo", () => {
  representative = json(authenticated(ids.manager, `select public.create_club_media_upload_intent('${ids.club}','representative','TEST 대표사진',null,null,'image/jpeg',4);`));
  const context = sql(`set role service_role; select storage_path from public.get_club_media_upload_context_server('${ids.manager}','${representative.media_id}');`);
  assert.equal(context.status, 0, context.stdout + context.stderr);
  assert.equal(context.stdout.trim(), `${ids.club}/${representative.media_id}/original`);
  const first = json(service(`select public.finalize_club_media_upload_server('${ids.manager}','${representative.media_id}','image/jpeg',4);`));
  assert.equal(first.media_status, "available");

  const replacement = json(authenticated(ids.manager, `select public.create_club_media_upload_intent('${ids.club}','representative','TEST 교체 대표사진',null,null,'image/png',8);`));
  const second = json(service(`select public.finalize_club_media_upload_server('${ids.manager}','${replacement.media_id}','image/png',8);`));
  assert.equal(second.replaced_storage_paths.length, 1);
  const state = sql(`select count(*) filter(where media_status='available') || ':' || count(*) filter(where media_status='removed') from public.club_media where club_id='${ids.club}' and media_kind='representative';`);
  assert.equal(state.status, 0, state.stdout + state.stderr);
  assert.equal(state.stdout.trim(), "1:1");
  representative = replacement;
});

test("manager creates one activity photo and read projections stay club-scoped", () => {
  activity = json(authenticated(ids.manager, `select public.create_club_media_upload_intent('${ids.club}','activity','TEST 8월 월례회','monthly_meeting','2026-08-20','image/webp',12);`));
  json(service(`select public.finalize_club_media_upload_server('${ids.manager}','${activity.media_id}','image/webp',12);`));
  const anon = json(sql(`set role anon; select public.get_club_media_content('${ids.club}');`));
  assert.equal(anon.representative_photo.id, representative.media_id);
  assert.equal(anon.activity_photos.length, 1);
  assert.equal(anon.recent_activities.some((item) => item.summary === "TEST 공개 공지"), true);
  assert.equal(anon.recent_activities.some((item) => item.summary === "TEST 회원 공지"), false);
  assert.equal(anon.recent_activities.some((item) => item.summary === "TEST 숨김 공지" || item.summary === "TEST 취소 일정" || item.summary === "TEST 삭제 글"), false);
  const member = json(authenticated(ids.member, `select public.get_club_media_content('${ids.club}');`));
  assert.equal(member.recent_activities.some((item) => item.summary === "TEST 회원 공지"), true);
  const otherClub = json(sql(`set role anon; select public.get_club_media_content('${ids.otherClub}');`));
  assert.equal(otherClub.representative_photo, null);
  assert.equal(otherClub.activity_photos.length, 0);
  assert.equal(otherClub.recent_activities.length, 0);
});

test("members, nonmembers, invalid files, and cross-club operations fail closed", () => {
  const memberDenied = authenticated(ids.member, `select public.create_club_media_upload_intent('${ids.club}','activity',null,'other',null,'image/jpeg',4);`);
  assert.notEqual(memberDenied.status, 0);
  assert.match(memberDenied.stderr, /사진 관리 권한/);
  const outsiderDenied = authenticated(ids.outsider, `select public.create_club_media_upload_intent('${ids.club}','representative',null,null,null,'image/jpeg',4);`);
  assert.notEqual(outsiderDenied.status, 0);
  assert.match(outsiderDenied.stderr, /사진 관리 권한/);
  const mimeDenied = authenticated(ids.manager, `select public.create_club_media_upload_intent('${ids.club}','activity',null,'other',null,'text/plain',4);`);
  assert.notEqual(mimeDenied.status, 0);
  assert.match(mimeDenied.stderr, /JPG, PNG, WebP/);
  const sizeDenied = authenticated(ids.manager, `select public.create_club_media_upload_intent('${ids.club}','activity',null,'other',null,'image/jpeg',8388609);`);
  assert.notEqual(sizeDenied.status, 0);
  assert.match(sizeDenied.stderr, /8MB/);
  const wrongPath = sql(`insert into public.club_media(id,club_id,media_kind,storage_path,activity_type,uploaded_by_user_id,declared_mime_type,declared_size_bytes) values ('${randomUUID()}','${ids.club}','activity','${ids.otherClub}/wrong/original','other','${ids.manager}','image/jpeg',4);`, "postgres");
  assert.notEqual(wrongPath.status, 0);
  assert.match(wrongPath.stderr, /club_media_path_check/);
});

test("soft removal hides photos and preserves metadata history", () => {
  const removed = json(service(`select public.remove_club_media_server('${ids.manager}','${activity.media_id}');`));
  assert.equal(removed.media_status, "removed");
  const replay = json(service(`select public.remove_club_media_server('${ids.manager}','${activity.media_id}');`));
  assert.equal(replay.replayed, true);
  const view = json(sql(`set role anon; select public.get_club_media_content('${ids.club}');`));
  assert.equal(view.activity_photos.length, 0);
  assert.equal(view.recent_activities.some((item) => item.id === `photo:${activity.media_id}`), false);
  const row = sql(`select media_status || ':' || (removed_at is not null)::text || ':' || version from public.club_media where id='${activity.media_id}';`);
  assert.equal(row.status, 0, row.stdout + row.stderr);
  assert.equal(row.stdout.trim(), "removed:true:3");
});

test("authenticated direct media DML is denied", () => {
  const direct = authenticated(ids.manager, `update public.club_media set caption='TEST 직접 변경' where id='${representative.media_id}';`);
  assert.notEqual(direct.status, 0);
  assert.match(direct.stderr, /permission denied|row-level security/i);
});
