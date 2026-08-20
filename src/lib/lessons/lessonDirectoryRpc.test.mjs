import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(
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
function lessonPayload(overrides = {}) {
  return JSON.stringify({
    title: "TEST 신규 입문 레슨",
    lesson_type: "beginner",
    province: "서울",
    district: "마포구",
    location: "TEST 교육장",
    instructor_name: "TEST 강사",
    organizer_name: "TEST 교육기관",
    targets: ["absolute_beginner"],
    schedule_text: "매주 토요일",
    schedule_tags: ["always"],
    time_text: "10:00 ~ 12:00",
    price_text: "회당 30,000원",
    lesson_format: "offline",
    recruit_status: "recruiting",
    description: "TEST 신규 입문 레슨의 공개 설명입니다.",
    curriculum: "기본자세와 스윙 실습",
    supplies: "운동화",
    notices: ["외부 공식 문의 필요"],
    inquiry_note: "주관기관 공식 페이지를 확인하세요.",
    inquiry_url: "https://example.invalid/inquiry",
    official_url: "https://example.invalid/lesson",
    is_featured: false,
    ...overrides,
  });
}
function videoPayload(overrides = {}) {
  return JSON.stringify({
    title: "TEST 신규 무료 강의",
    category: "beginner_intro",
    channel_name: "TEST 채널",
    instructor_name: "TEST 강사",
    level: "intro",
    duration_text: "10:20",
    description: "TEST 신규 무료 YouTube 강의 설명입니다.",
    youtube_url: "https://www.youtube.com/watch?v=TestVideo123",
    youtube_channel_url: "https://www.youtube.com/@test-channel",
    thumbnail_type: "green",
    tags: ["입문"],
    is_featured: false,
    ...overrides,
  });
}

const ids = { admin: randomUUID(), member: randomUUID(), suspendedAdmin: randomUUID() };
let container;
let database;

before(() => {
  const found = docker(["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"]).stdout.split(/\r?\n/).filter(Boolean);
  assert.equal(found.length, 1, "one local Supabase database container is required");
  container = found[0];
  database = `pul_lessons_${process.pid}_${Date.now()}`;
  const clone = docker(["exec", container, "sh", "-lc", [
    `createdb -U supabase_admin -O postgres ${database}`,
    `pg_dump -U supabase_admin -d postgres --schema-only | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
    `pg_dump -U supabase_admin -d postgres --data-only --disable-triggers | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
  ].join(" && ")]);
  assert.equal(clone.status, 0, clone.stdout + clone.stderr);
  const applied = sql(`begin; ${migration} commit;`, "postgres");
  assert.equal(applied.status, 0, applied.stdout + applied.stderr);

  const authRows = Object.entries(ids).map(([alias, id]) =>
    `('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','lesson-${alias}@example.invalid','',now(),now(),now())`,
  ).join(",");
  const fixture = sql(`set session_replication_role=replica;
    insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values ${authRows};
    insert into public.user_accounts(id,account_status,platform_role) values
      ('${ids.admin}','active','platform_admin'),('${ids.member}','active','member'),('${ids.suspendedAdmin}','suspended','platform_admin');
    set session_replication_role=origin;
    insert into public.lessons(
      lesson_key,title,lesson_type,province,district,location,instructor_name,organizer_name,targets,
      schedule_text,schedule_tags,time_text,price_text,lesson_format,recruit_status,description,curriculum,
      supplies,notices,inquiry_note,inquiry_url,official_url,is_featured,publication_status,created_by,updated_by
    ) values
      ('featured-1','TEST 추천 서울 입문 레슨','beginner','서울','마포구','TEST 서울 교육장','추천 강사','TEST 추천기관',array['absolute_beginner'],'매주 토요일',array['always'],'10:00 ~ 12:00','회당 30,000원','offline','recruiting','TEST 추천 서울 입문 레슨의 공개 설명입니다.','기본자세와 스윙','운동화',array['외부 신청'],'공식 페이지 확인','https://example.invalid/inquiry','https://example.invalid/official',true,'published','${ids.admin}','${ids.admin}'),
      ('lesson-1','TEST 서울 스윙 레슨','improvement','서울','강서구','TEST 필드','서울 강사','TEST 교육원',array['golf_experienced','senior'],'이번 달 일요일',array['this_month'],'09:00 ~ 11:00','월 4회 120,000원','field','recruiting','TEST 서울 스윙 레슨의 공개 설명입니다.','스윙과 거리 조절','개인 장비','{}',null,null,'https://example.invalid/lesson-1',false,'published','${ids.admin}','${ids.admin}'),
      ('lesson-2','TEST 경기 단체교육','group','경기','수원시','TEST 연습장','경기 강사','TEST 동호회',array['club_member'],'협의 일정',array['always'],'협의','문의','group','waiting','TEST 경기 단체교육의 공개 설명입니다.','단체 기본 교육','운동화',array['단체 문의'],'기관 문의 필요',null,null,false,'published','${ids.admin}','${ids.admin}'),
      ('hidden-1','TEST 숨김 레슨','beginner','서울','중구','TEST 장소','숨김 강사','TEST 기관',array['absolute_beginner'],'상시',array['always'],'문의','문의','offline','closed','TEST 숨김 레슨의 비공개 설명입니다.','기초','없음','{}',null,null,null,false,'hidden','${ids.admin}','${ids.admin}'),
      ('removed-1','TEST 제거 레슨','beginner','서울','중구','TEST 장소','제거 강사','TEST 기관',array['absolute_beginner'],'상시',array['always'],'문의','문의','offline','closed','TEST 제거 레슨의 비공개 설명입니다.','기초','없음','{}',null,null,null,false,'removed','${ids.admin}','${ids.admin}'),
      ('cert-1','TEST 자격 과정','certification','서울','중구','TEST 장소','자격 강사','TEST 기관',array['cert_prep'],'상시',array['always'],'문의','문의','offline','recruiting','TEST 자격 과정은 별도 영역용 설명입니다.','자격 과정','필기도구','{}',null,null,null,false,'published','${ids.admin}','${ids.admin}');
    insert into public.lesson_videos(
      video_key,title,category,channel_name,instructor_name,level,duration_text,description,youtube_url,
      youtube_channel_url,thumbnail_type,tags,is_featured,publication_status,created_by,updated_by
    ) values
      ('video-featured','TEST 추천 스윙 영상','swing','TEST 스윙 채널','영상 강사','beginner','10:10','TEST 추천 스윙 YouTube 강의 설명입니다.','https://www.youtube.com/watch?v=Featured123','https://www.youtube.com/@featured','green',array['스윙'],true,'published','${ids.admin}','${ids.admin}'),
      ('video-intro','TEST 입문 영상','beginner_intro','TEST 입문 채널','입문 강사','intro','08:30','TEST 입문 YouTube 강의 공개 설명입니다.','https://youtu.be/IntroVideo1',null,'teal',array['입문'],false,'published','${ids.admin}','${ids.admin}'),
      ('video-hidden','TEST 숨김 영상','swing','TEST 채널','숨김 강사','intro','05:00','TEST 숨김 YouTube 강의 설명입니다.','https://youtu.be/HiddenVideo1',null,'forest','{}',false,'hidden','${ids.admin}','${ids.admin}'),
      ('video-removed','TEST 제거 영상','swing','TEST 채널','제거 강사','intro','05:00','TEST 제거 YouTube 강의 설명입니다.','https://youtu.be/RemovedVideo1',null,'forest','{}',false,'removed','${ids.admin}','${ids.admin}');`, "postgres");
  assert.equal(fixture.status, 0, fixture.stdout + fixture.stderr);
});

after(() => {
  if (container && database) {
    assert.equal(docker(["exec", container, "dropdb", "--if-exists", "--force", "-U", "supabase_admin", database]).status, 0);
  }
});

test("anon sees only published non-featured general lessons and no internal fields", () => {
  const page = json(sql("set role anon; select public.list_public_lessons(null,null,null,null,null,null,24,0);"));
  assert.equal(page.total, 2);
  assert.deepEqual(page.items.map((item) => item.lesson_key).sort(), ["lesson-1", "lesson-2"]);
  for (const item of page.items) {
    for (const key of ["id", "publication_status", "created_by", "updated_by", "version"]) assert.equal(key in item, false);
  }
});

test("lesson keyword, region, type, target, format, schedule, and pagination run on the server", () => {
  assert.equal(json(sql("set role anon; select public.list_public_lessons('서울 강사',null,null,null,null,null,24,0);" )).items[0].lesson_key, "lesson-1");
  assert.equal(json(sql("set role anon; select public.list_public_lessons(null,'경기',null,null,null,null,24,0);" )).items[0].lesson_key, "lesson-2");
  assert.equal(json(sql("set role anon; select public.list_public_lessons(null,null,'improvement',null,null,null,24,0);" )).total, 1);
  assert.equal(json(sql("set role anon; select public.list_public_lessons(null,null,null,'field','senior','this_month',24,0);" )).items[0].lesson_key, "lesson-1");
  const first = json(sql("set role anon; select public.list_public_lessons(null,null,null,null,null,null,1,0);"));
  assert.equal(first.items.length, 1);
  assert.equal(first.total, 2);
  assert.equal(first.has_more, true);
});

test("featured and stable detail expose only published general content", () => {
  const featured = json(sql("set role anon; select public.list_featured_public_lessons(4);"));
  assert.deepEqual(featured.map((item) => item.lesson_key), ["featured-1"]);
  assert.equal(json(sql("set role anon; select public.get_public_lesson('lesson-1');")).lesson_key, "lesson-1");
  for (const key of ["hidden-1", "removed-1", "cert-1", "missing"]) {
    const result = sql(`set role anon; select public.get_public_lesson('${key}');`);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /찾을 수 없습니다/);
  }
});

test("video list exposes published YouTube records, category filtering, featured ordering, and no internal fields", () => {
  const page = json(sql("set role anon; select public.list_public_lesson_videos(null,24,0);"));
  assert.equal(page.total, 2);
  assert.equal(page.items[0].video_key, "video-featured");
  assert.equal(json(sql("set role anon; select public.list_public_lesson_videos('beginner_intro',24,0);" )).items[0].video_key, "video-intro");
  for (const item of page.items) {
    for (const key of ["id", "publication_status", "created_by", "updated_by", "version"]) assert.equal(key in item, false);
  }
});

test("platform admin manages lesson and video while member, inactive admin, and anon fail closed", () => {
  const denied = authenticated(ids.member, `select public.mutate_lesson('create','denied-lesson',null,$payload$${lessonPayload()}$payload$::jsonb);`);
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /권한/);
  const inactive = authenticated(ids.suspendedAdmin, `select public.mutate_lesson_video('create','inactive-video',null,$payload$${videoPayload()}$payload$::jsonb);`);
  assert.notEqual(inactive.status, 0);
  assert.match(inactive.stderr, /권한/);

  const lesson = json(authenticated(ids.admin, `select public.mutate_lesson('create','new-lesson',null,$payload$${lessonPayload()}$payload$::jsonb);`));
  assert.equal(lesson.publication_status, "hidden");
  assert.equal(json(authenticated(ids.admin, "select public.mutate_lesson('publish','new-lesson',1,'{}'::jsonb);" )).version, 2);
  assert.equal(json(authenticated(ids.admin, "select public.mutate_lesson('remove','new-lesson',2,'{}'::jsonb);" )).publication_status, "removed");

  const video = json(authenticated(ids.admin, `select public.mutate_lesson_video('create','new-video',null,$payload$${videoPayload()}$payload$::jsonb);`));
  assert.equal(video.publication_status, "hidden");
  assert.equal(json(authenticated(ids.admin, "select public.mutate_lesson_video('publish','new-video',1,'{}'::jsonb);" )).version, 2);
  assert.equal(json(authenticated(ids.admin, "select public.mutate_lesson_video('hide','new-video',2,'{}'::jsonb);" )).publication_status, "hidden");

  const anon = sql("set role anon; select public.mutate_lesson('hide','lesson-1',1,'{}'::jsonb);");
  assert.notEqual(anon.status, 0);
  assert.match(anon.stderr, /permission denied/i);
});

test("unsafe URLs, stale versions, and direct authenticated DML are rejected", () => {
  const unsafeLesson = authenticated(ids.admin, `select public.mutate_lesson('create','bad-lesson',null,$payload$${lessonPayload({ inquiry_url: "javascript:alert(1)" })}$payload$::jsonb);`);
  assert.notEqual(unsafeLesson.status, 0);
  assert.match(unsafeLesson.stderr, /lessons_inquiry_url_check|check constraint/i);
  const wrongHost = authenticated(ids.admin, `select public.mutate_lesson_video('create','bad-video',null,$payload$${videoPayload({ youtube_url: "https://example.invalid/video" })}$payload$::jsonb);`);
  assert.notEqual(wrongHost.status, 0);
  assert.match(wrongHost.stderr, /lesson_videos_youtube_url_check|check constraint/i);
  const stale = authenticated(ids.admin, "select public.mutate_lesson('hide','lesson-1',999,'{}'::jsonb);");
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /변경되었습니다/);
  const directLesson = authenticated(ids.admin, "update public.lessons set title='직접 변경' where lesson_key='lesson-1';");
  assert.notEqual(directLesson.status, 0);
  assert.match(directLesson.stderr, /permission denied|row-level security/i);
  const directVideo = authenticated(ids.admin, "delete from public.lesson_videos where video_key='video-intro';");
  assert.notEqual(directVideo.status, 0);
  assert.match(directVideo.stderr, /permission denied|row-level security/i);
});
