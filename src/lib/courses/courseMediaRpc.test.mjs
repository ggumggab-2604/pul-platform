import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260910000100_pul_course_media.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

function docker(args, input) {
  return spawnSync("docker", args, {
    encoding: "utf8",
    input,
    maxBuffer: 64 * 1024 * 1024,
  });
}

function sql(text, user = "supabase_admin") {
  return docker(
    [
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      user,
      "-d",
      database,
      "-X",
      "-q",
      "-t",
      "-A",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    text,
  );
}

function authenticated(actor, text) {
  return sql(`set request.jwt.claim.sub = '${actor}'; set role authenticated; ${text}`);
}

function service(text) {
  return sql(`set role service_role; ${text}`);
}

function authenticatedAsync(actor, text) {
  return new Promise((resolve) => {
    const child = spawn("docker", [
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      "supabase_admin",
      "-d",
      database,
      "-X",
      "-q",
      "-t",
      "-A",
      "-v",
      "ON_ERROR_STOP=1",
    ]);
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(
      `set request.jwt.claim.sub = '${actor}'; set role authenticated; ${text}`,
    );
  });
}

function json(result) {
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return JSON.parse(result.stdout.trim());
}

const ids = {
  active: randomUUID(),
  other: randomUUID(),
  suspended: randomUUID(),
  withdrawn: randomUUID(),
  limited: randomUUID(),
  race: randomUUID(),
  course: randomUUID(),
  otherCourse: randomUUID(),
  inactiveCourse: randomUUID(),
};
const courseKey = `test-course-media-${process.pid}`;
const otherCourseKey = `test-course-other-${process.pid}`;
const inactiveCourseKey = `test-course-inactive-${process.pid}`;

let container;
let database;
let available;
let reportCountBefore;
let discussionCountBefore;

before(() => {
  const found = docker([
    "ps",
    "--filter",
    "name=supabase_db_",
    "--format",
    "{{.Names}}",
  ]).stdout
    .split(/\r?\n/)
    .filter(Boolean);
  assert.equal(found.length, 1, "one local Supabase database container is required");
  container = found[0];
  database = `pul_course_media_${process.pid}_${Date.now()}`;
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

  const exists = sql("select to_regclass('public.course_media') is not null;");
  assert.equal(exists.status, 0, exists.stdout + exists.stderr);
  if (exists.stdout.trim() !== "t") {
    const applied = sql(`begin; ${migration} commit;`, "postgres");
    assert.equal(applied.status, 0, applied.stdout + applied.stderr);
  }

  const authRows = [ids.active, ids.other, ids.suspended, ids.withdrawn, ids.limited, ids.race]
    .map(
      (id) =>
        `('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','course-media-${id}@example.invalid','',now(),now(),now())`,
    )
    .join(",");
  const fixture = sql(
    `
      set session_replication_role = replica;
      insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
      values ${authRows};
      insert into public.user_accounts(id,account_status) values
        ('${ids.active}','active'),
        ('${ids.other}','active'),
        ('${ids.suspended}','suspended'),
        ('${ids.withdrawn}','withdrawn'),
        ('${ids.limited}','active'),
        ('${ids.race}','active');
      insert into public.courses(
        id,course_key,name,course_type,region,city,address,holes,
        operation_code,description,course_status
      ) values
        ('${ids.course}','${courseKey}','TEST 활동사진 골프장','field','서울','마포구','서울 TEST 주소',18,'walkIn','TEST 활동사진 공개 골프장 설명입니다.','active'),
        ('${ids.otherCourse}','${otherCourseKey}','TEST 다른 골프장','field','경기','수원시','경기 TEST 주소',9,'phone','TEST 다른 공개 골프장 설명입니다.','active'),
        ('${ids.inactiveCourse}','${inactiveCourseKey}','TEST 비공개 골프장','field','인천','중구','인천 TEST 주소',27,'reservation','TEST 비공개 골프장 설명입니다.','inactive');
      set session_replication_role = origin;
    `,
    "postgres",
  );
  assert.equal(fixture.status, 0, fixture.stdout + fixture.stderr);
  reportCountBefore = sql("select count(*) from public.course_information_reports;", "postgres").stdout.trim();
  discussionCountBefore = sql("select count(*) from public.course_discussion_posts;", "postgres").stdout.trim();
});

after(() => {
  if (!container || !database) return;
  const dropped = docker([
    "exec",
    container,
    "dropdb",
    "--if-exists",
    "--force",
    "-U",
    "supabase_admin",
    database,
  ]);
  assert.equal(dropped.status, 0, dropped.stdout + dropped.stderr);
});

test("catalog exposes only public read, active upload intent, and service helpers", () => {
  const bucket = sql(
    "select public || ':' || file_size_limit || ':' || array_to_string(allowed_mime_types, ',') from storage.buckets where id='course-media';",
  );
  assert.equal(bucket.status, 0, bucket.stdout + bucket.stderr);
  assert.equal(bucket.stdout.trim(), "true:8388608:image/jpeg,image/png,image/webp");
  const tableAcl = sql(
    "select pg_catalog.has_table_privilege('authenticated','public.course_media','INSERT,UPDATE,DELETE');",
  );
  assert.equal(tableAcl.status, 0, tableAcl.stdout + tableAcl.stderr);
  assert.equal(tableAcl.stdout.trim(), "f");
  const storagePolicies = sql(
    "select count(*) from pg_catalog.pg_policies where schemaname='storage' and tablename='objects' and (coalesce(qual,'') like '%course-media%' or coalesce(with_check,'') like '%course-media%');",
  );
  assert.equal(storagePolicies.status, 0, storagePolicies.stdout + storagePolicies.stderr);
  assert.equal(storagePolicies.stdout.trim(), "0");
  const functions = sql(
    `select p.proname,
      pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE'),
      pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE'),
      pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'list_public_course_media','create_course_media_upload_intent',
        'get_course_media_upload_context_server','finalize_course_media_upload_server',
        'mark_course_media_upload_failed_server','remove_course_media_server'
      )
    order by p.proname;`,
  );
  assert.equal(functions.status, 0, functions.stdout + functions.stderr);
  assert.equal(
    functions.stdout.trim(),
    "create_course_media_upload_intent|f|t|f\n" +
      "finalize_course_media_upload_server|f|f|t\n" +
      "get_course_media_upload_context_server|f|f|t\n" +
      "list_public_course_media|t|t|f\n" +
      "mark_course_media_upload_failed_server|f|f|t\n" +
      "remove_course_media_server|f|f|t",
  );
});

test("active member creates one privacy-minimized upload intent and finalize is replay-safe", () => {
  available = json(
    authenticated(
      ids.active,
      `select public.create_course_media_upload_intent('${courseKey}','TEST 현장 사진','image/jpeg',4);`,
    ),
  );
  assert.match(available.media_key, /^[0-9a-f]{32}$/);
  assert.equal(available.media_status, "pending_upload");
  const context = sql(
    `set role service_role; select media_key || ':' || storage_bucket || ':' || storage_path || ':' || declared_mime_type || ':' || declared_size_bytes from public.get_course_media_upload_context_server('${ids.active}','${available.media_key}');`,
  );
  assert.equal(context.status, 0, context.stdout + context.stderr);
  assert.equal(
    context.stdout.trim(),
    `${available.media_key}:course-media:${courseKey}/${available.media_key}/original:image/jpeg:4`,
  );
  assert.equal(context.stdout.includes(ids.active), false);
  assert.equal(context.stdout.includes(ids.course), false);

  const finalized = json(
    service(
      `select public.finalize_course_media_upload_server('${ids.active}','${available.media_key}','image/jpeg',4);`,
    ),
  );
  assert.equal(finalized.media_status, "available");
  assert.equal(finalized.version, 2);
  assert.equal(finalized.replayed, false);
  const replay = json(
    service(
      `select public.finalize_course_media_upload_server('${ids.active}','${available.media_key}','image/jpeg',4);`,
    ),
  );
  assert.equal(replay.replayed, true);
  assert.equal(replay.version, 2);
  const conflict = service(
    `select public.finalize_course_media_upload_server('${ids.active}','${available.media_key}','image/jpeg',5);`,
  );
  assert.notEqual(conflict.status, 0);
  assert.match(conflict.stderr, /검증 값이 다릅니다/);
});

test("public list is course-scoped, privacy-minimized, and ownership-aware", () => {
  const anon = json(sql(`set role anon; select public.list_public_course_media('${courseKey}',12,0);`));
  assert.equal(anon.total, 1);
  assert.equal(anon.items.length, 1);
  assert.deepEqual(Object.keys(anon.items[0]).sort(), [
    "can_delete",
    "caption",
    "created_at",
    "media_key",
    "storage_bucket",
    "storage_path",
  ]);
  assert.equal(anon.items[0].can_delete, false);
  assert.equal("id" in anon.items[0], false);
  assert.equal("course_id" in anon.items[0], false);
  assert.equal("uploader_user_id" in anon.items[0], false);
  const owner = json(
    authenticated(ids.active, `select public.list_public_course_media('${courseKey}',12,0);`),
  );
  assert.equal(owner.items[0].can_delete, true);
  const other = json(
    authenticated(ids.other, `select public.list_public_course_media('${courseKey}',12,0);`),
  );
  assert.equal(other.items[0].can_delete, false);
  const otherCourse = json(
    sql(`set role anon; select public.list_public_course_media('${otherCourseKey}',12,0);`),
  );
  assert.equal(otherCourse.total, 0);
});

test("anonymous, non-active, absent, inactive, invalid MIME, and oversized intents fail closed", () => {
  const anon = sql(
    `set role anon; select public.create_course_media_upload_intent('${courseKey}',null,'image/jpeg',4);`,
  );
  assert.notEqual(anon.status, 0);
  assert.match(anon.stderr, /permission denied/i);
  for (const actor of [ids.suspended, ids.withdrawn]) {
    const denied = authenticated(
      actor,
      `select public.create_course_media_upload_intent('${courseKey}',null,'image/jpeg',4);`,
    );
    assert.notEqual(denied.status, 0);
    assert.match(denied.stderr, /정상 활동/);
  }
  const missing = authenticated(
    ids.active,
    "select public.create_course_media_upload_intent('missing-course',null,'image/jpeg',4);",
  );
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /찾을 수 없습니다/);
  const inactive = authenticated(
    ids.active,
    `select public.create_course_media_upload_intent('${inactiveCourseKey}',null,'image/jpeg',4);`,
  );
  assert.notEqual(inactive.status, 0);
  assert.match(inactive.stderr, /찾을 수 없습니다/);
  const mime = authenticated(
    ids.active,
    `select public.create_course_media_upload_intent('${courseKey}',null,'text/plain',4);`,
  );
  assert.notEqual(mime.status, 0);
  assert.match(mime.stderr, /JPG, PNG, WebP/);
  const size = authenticated(
    ids.active,
    `select public.create_course_media_upload_intent('${courseKey}',null,'image/jpeg',8388609);`,
  );
  assert.notEqual(size.status, 0);
  assert.match(size.stderr, /8MB/);
  const hidden = sql(`set role anon; select public.list_public_course_media('${inactiveCourseKey}',12,0);`);
  assert.notEqual(hidden.status, 0);
  assert.match(hidden.stderr, /찾을 수 없습니다/);
});

test("authenticated raw metadata and Storage object writes are denied", () => {
  const metadata = authenticated(
    ids.active,
    `update public.course_media set caption='TEST 직접 변경' where media_key='${available.media_key}';`,
  );
  assert.notEqual(metadata.status, 0);
  assert.match(metadata.stderr, /permission denied|row-level security/i);
  const storage = authenticated(
    ids.active,
    "insert into storage.objects(bucket_id,name) values ('course-media','unauthorized/original');",
  );
  assert.notEqual(storage.status, 0);
  assert.match(storage.stderr, /permission denied|row-level security/i);
});

test("only the uploader can remove and replay does not duplicate metadata", () => {
  const denied = service(
    `select public.remove_course_media_server('${ids.other}','${available.media_key}');`,
  );
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /본인이 등록한/);
  const removed = json(
    service(
      `select public.remove_course_media_server('${ids.active}','${available.media_key}');`,
    ),
  );
  assert.equal(removed.media_status, "removed");
  assert.equal(removed.replayed, false);
  const replay = json(
    service(
      `select public.remove_course_media_server('${ids.active}','${available.media_key}');`,
    ),
  );
  assert.equal(replay.replayed, true);
  assert.equal(replay.version, removed.version);
  const publicPage = json(
    sql(`set role anon; select public.list_public_course_media('${courseKey}',12,0);`),
  );
  assert.equal(publicPage.total, 0);
  const row = sql(
    `select count(*) || ':' || min(media_status) || ':' || (min(removed_at) is not null)::text from public.course_media where media_key='${available.media_key}';`,
  );
  assert.equal(row.status, 0, row.stdout + row.stderr);
  assert.equal(row.stdout.trim(), "1:removed:true");
});

test("per-member current photo limit is race-serialized by the course lock", () => {
  for (let index = 0; index < 8; index += 1) {
    const created = authenticated(
      ids.limited,
      `select public.create_course_media_upload_intent('${courseKey}','TEST 제한 ${index + 1}','image/png',8);`,
    );
    assert.equal(created.status, 0, created.stdout + created.stderr);
  }
  const ninth = authenticated(
    ids.limited,
    `select public.create_course_media_upload_intent('${courseKey}',null,'image/png',8);`,
  );
  assert.notEqual(ninth.status, 0);
  assert.match(ninth.stderr, /최대 8장/);
  assert.match(
    migration,
    /where course\.course_key = v_course_key[\s\S]*for update;[\s\S]*count\(\*\)[\s\S]*>= 8/,
  );
});

test("concurrent eighth and ninth intents produce one winner and one bounded loser", async () => {
  for (let index = 0; index < 7; index += 1) {
    const created = authenticated(
      ids.race,
      `select public.create_course_media_upload_intent('${courseKey}','TEST race ${index + 1}','image/webp',12);`,
    );
    assert.equal(created.status, 0, created.stdout + created.stderr);
  }
  const statement = `select public.create_course_media_upload_intent('${courseKey}','TEST race concurrent','image/webp',12);`;
  const results = await Promise.all([
    authenticatedAsync(ids.race, statement),
    authenticatedAsync(ids.race, statement),
  ]);
  assert.deepEqual(results.map((result) => result.status === 0).sort(), [false, true]);
  assert.match(results.find((result) => result.status !== 0).stderr, /최대 8장/);
  const count = sql(
    `select count(*) from public.course_media where course_id='${ids.course}' and uploader_user_id='${ids.race}' and media_status in ('pending_upload','available');`,
  );
  assert.equal(count.status, 0, count.stdout + count.stderr);
  assert.equal(count.stdout.trim(), "8");
});

test("course hero, reports, and discussions remain unchanged", () => {
  assert.equal(
    sql("select count(*) from public.course_information_reports;", "postgres").stdout.trim(),
    reportCountBefore,
  );
  assert.equal(
    sql("select count(*) from public.course_discussion_posts;", "postgres").stdout.trim(),
    discussionCountBefore,
  );
  const course = sql(
    `select course_key || ':' || course_status from public.courses where id='${ids.course}';`,
    "postgres",
  );
  assert.equal(course.stdout.trim(), `${courseKey}:active`);
});
