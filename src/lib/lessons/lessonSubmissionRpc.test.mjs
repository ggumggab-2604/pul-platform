import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/20260901000100_pul_lesson_submission_request_foundation.sql", import.meta.url)),
  "utf8",
);
const lessonFoundation = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/20260827000100_pul_lesson_directory_foundation.sql", import.meta.url)),
  "utf8",
);
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
function submissionPayload(type, overrides = {}) {
  const value = type === "lesson"
    ? { title: "TEST 입문 레슨 등록", provider_name: "TEST 교육기관", region: "서울", category: null, summary: "TEST 회원이 제안한 입문 레슨 등록 요청입니다.", source_url: "https://example.invalid/lesson", secondary_url: "https://example.invalid/inquiry" }
    : { title: "TEST 무료 스윙 영상", provider_name: "TEST 영상 채널", region: null, category: "swing", summary: "TEST 회원이 제안한 무료 YouTube 영상입니다.", source_url: "https://youtu.be/TestSubmission1", secondary_url: null };
  return JSON.stringify({ ...value, ...overrides });
}
function lessonDirectoryPayload() {
  return JSON.stringify({
    title: "TEST 입문 레슨 등록", lesson_type: "beginner", province: "서울", district: "마포구",
    location: "TEST 교육장", instructor_name: "TEST 강사", organizer_name: "TEST 교육기관",
    targets: ["absolute_beginner"], schedule_text: "매주 토요일", schedule_tags: ["always"],
    time_text: "10:00", price_text: "외부 문의", lesson_format: "offline", recruit_status: "waiting",
    description: "TEST 회원 제안을 바탕으로 운영자가 확인한 레슨 설명입니다.", curriculum: "기본 자세와 스윙",
    supplies: "운동화", notices: ["외부 공식 페이지 확인"], inquiry_note: "외부 문의 페이지 확인",
    inquiry_url: "https://example.invalid/inquiry", official_url: "https://example.invalid/lesson", is_featured: false,
  });
}

const ids = {
  admin: randomUUID(), member: randomUUID(), other: randomUUID(), inactive: randomUUID(),
  lessonRequest: randomUUID(), videoRequest: randomUUID(), rejectedRequest: randomUUID(),
};
let container;
let database;
let lessonKey;
let videoKey;

before(() => {
  const found = docker(["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"])
    .stdout.split(/\r?\n/).filter(Boolean);
  assert.equal(found.length, 1, "one local Supabase database container is required");
  container = found[0];
  database = `pul_lesson_submission_${process.pid}_${Date.now()}`;
  const clone = docker(["exec", container, "sh", "-lc", [
    `createdb -U supabase_admin -O postgres ${database}`,
    `pg_dump -U supabase_admin -d postgres --schema-only | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
    `pg_dump -U supabase_admin -d postgres --data-only --disable-triggers | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
  ].join(" && ")]);
  assert.equal(clone.status, 0, clone.stdout + clone.stderr);
  const hasLessonFoundation = sql("select pg_catalog.to_regprocedure('private.valid_lesson_external_url(text)') is not null;", "postgres");
  assert.equal(hasLessonFoundation.status, 0, hasLessonFoundation.stdout + hasLessonFoundation.stderr);
  if (hasLessonFoundation.stdout.trim() !== "t") {
    const foundationApplied = sql(`begin; ${lessonFoundation} commit;`, "postgres");
    assert.equal(foundationApplied.status, 0, foundationApplied.stdout + foundationApplied.stderr);
  }
  const applied = sql(`begin; ${migration} commit;`, "postgres");
  assert.equal(applied.status, 0, applied.stdout + applied.stderr);

  const authRows = [ids.admin, ids.member, ids.other, ids.inactive].map((id, index) =>
    `('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','lesson-submission-${index}@example.invalid','',now(),now(),now())`,
  ).join(",");
  const fixture = sql(`set session_replication_role=replica;
    insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values ${authRows};
    insert into public.user_accounts(id,account_status,platform_role) values
      ('${ids.admin}','active','platform_admin'),('${ids.member}','active','member'),
      ('${ids.other}','active','member'),('${ids.inactive}','suspended','member');
    insert into public.user_profiles(user_id,nickname,profile_visibility) values
      ('${ids.admin}','TEST 운영자','private'),('${ids.member}','TEST 요청자','private'),
      ('${ids.other}','TEST 다른회원','private'),('${ids.inactive}','TEST 정지회원','private');
    set session_replication_role=origin;`, "postgres");
  assert.equal(fixture.status, 0, fixture.stdout + fixture.stderr);
});

after(() => {
  if (container && database) {
    assert.equal(docker(["exec", container, "dropdb", "--if-exists", "--force", "-U", "supabase_admin", database]).status, 0);
  }
});

test("anon and inactive actors cannot submit while an active member can", () => {
  const anon = sql(`set role anon; select public.submit_lesson_submission_request('${randomUUID()}','lesson',$p$${submissionPayload("lesson")}$p$::jsonb);`);
  assert.notEqual(anon.status, 0);
  assert.match(anon.stderr, /permission denied/i);
  const inactive = authenticated(ids.inactive, `select public.submit_lesson_submission_request('${randomUUID()}','lesson',$p$${submissionPayload("lesson")}$p$::jsonb);`);
  assert.notEqual(inactive.status, 0);
  assert.match(inactive.stderr, /현재 계정/);
  const created = json(authenticated(ids.member, `select public.submit_lesson_submission_request('${ids.lessonRequest}','lesson',$p$${submissionPayload("lesson")}$p$::jsonb);`));
  assert.equal(created.request_status, "pending");
  assert.equal(created.version, 1);
  assert.equal(created.replayed, false);
  lessonKey = created.request_key;
});

test("same request replays, changed payload conflicts, and no duplicate row is created", () => {
  const replay = json(authenticated(ids.member, `select public.submit_lesson_submission_request('${ids.lessonRequest}','lesson',$p$${submissionPayload("lesson")}$p$::jsonb);`));
  assert.equal(replay.request_key, lessonKey);
  assert.equal(replay.replayed, true);
  const conflict = authenticated(ids.member, `select public.submit_lesson_submission_request('${ids.lessonRequest}','lesson',$p$${submissionPayload("lesson", { title: "TEST 다른 제목" })}$p$::jsonb);`);
  assert.notEqual(conflict.status, 0);
  assert.match(conflict.stderr, /재사용/);
  assert.equal(sql(`select count(*) from public.lesson_submission_requests where requester_user_id='${ids.member}' and client_request_id='${ids.lessonRequest}';`).stdout.trim(), "1");
});

test("own read is isolated and hides internal identity, fingerprint, and processing actor", () => {
  const own = json(authenticated(ids.member, "select public.list_my_lesson_submission_requests(20,0);"));
  assert.equal(own.total, 1);
  assert.equal(own.items[0].request_key, lessonKey);
  for (const key of ["id", "requester_user_id", "client_request_id", "request_fingerprint", "processed_by", "version"]) {
    assert.equal(key in own.items[0], false);
  }
  const other = json(authenticated(ids.other, "select public.list_my_lesson_submission_requests(20,0);"));
  assert.equal(other.total, 0);
});

test("non-YouTube video is rejected and a valid YouTube request succeeds", () => {
  const invalid = authenticated(ids.member, `select public.submit_lesson_submission_request('${randomUUID()}','video',$p$${submissionPayload("video", { source_url: "https://example.invalid/video" })}$p$::jsonb);`);
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /YouTube/);
  const created = json(authenticated(ids.member, `select public.submit_lesson_submission_request('${ids.videoRequest}','video',$p$${submissionPayload("video")}$p$::jsonb);`));
  videoKey = created.request_key;
  assert.equal(created.request_status, "pending");
});

test("management read is admin-only and exposes display name without user UUID", () => {
  const denied = authenticated(ids.member, "select public.list_lesson_submission_requests_for_management(null,30,0);");
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /권한/);
  const page = json(authenticated(ids.admin, "select public.list_lesson_submission_requests_for_management('pending',30,0);"));
  assert.equal(page.total, 2);
  assert.equal(page.items.some((item) => item.requester_display_name === "TEST 요청자"), true);
  for (const item of page.items) {
    assert.equal("requester_user_id" in item, false);
    assert.equal("processed_by" in item, false);
  }
});

test("completion creates one hidden lesson atomically and prevents repeated processing", () => {
  const completed = json(authenticated(ids.admin, `select public.resolve_lesson_submission_request('${lessonKey}',1,'completed','request-lesson-draft',$p$${lessonDirectoryPayload()}$p$::jsonb,null);`));
  assert.equal(completed.request_status, "completed");
  assert.equal(completed.version, 2);
  assert.equal(completed.result_public_key, "request-lesson-draft");
  const state = json(sql(`select jsonb_build_object(
    'requests',(select count(*) from public.lesson_submission_requests where request_key='${lessonKey}' and request_status='completed'),
    'lessons',(select count(*) from public.lessons where lesson_key='request-lesson-draft' and publication_status='hidden'),
    'public_matches',((select public.list_public_lessons('TEST 입문 레슨 등록',null,null,null,null,null,24,0))->>'total')::integer
  );`));
  assert.deepEqual(state, { requests: 1, lessons: 1, public_matches: 0 });
  const repeated = authenticated(ids.admin, `select public.resolve_lesson_submission_request('${lessonKey}',2,'completed','request-lesson-draft-2',$p$${lessonDirectoryPayload()}$p$::jsonb,null);`);
  assert.notEqual(repeated.status, 0);
  assert.match(repeated.stderr, /이미 처리/);
});

test("rejection records a short note without creating a directory row", () => {
  const rejected = json(authenticated(ids.admin, `select public.resolve_lesson_submission_request('${videoKey}',1,'rejected',null,null,'파크골프 강의 내용이 확인되지 않았습니다.');`));
  assert.equal(rejected.request_status, "rejected");
  assert.equal(rejected.result_public_key, null);
  assert.equal(sql(`select count(*) from public.lesson_videos where video_key='request-video-draft';`).stdout.trim(), "0");
});

test("direct authenticated request-table DML remains closed", () => {
  const update = authenticated(ids.admin, `update public.lesson_submission_requests set request_status='completed' where request_key='${videoKey}';`);
  assert.notEqual(update.status, 0);
  assert.match(update.stderr, /permission denied|row-level security/i);
  const insert = authenticated(ids.member, `insert into public.lesson_submission_requests(requester_user_id,client_request_id,request_fingerprint,request_type,title,provider_name,region,summary,source_url) values ('${ids.member}','${ids.rejectedRequest}','${"a".repeat(64)}','lesson','직접 요청','직접 기관','서울','직접 입력은 차단되어야 합니다.','https://example.invalid');`);
  assert.notEqual(insert.status, 0);
  assert.match(insert.stderr, /permission denied|row-level security/i);
});
