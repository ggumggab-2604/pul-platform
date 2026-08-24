import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { after, before, test } from "node:test";

import { createClient } from "@supabase/supabase-js";

function command(file, args) {
  return spawnSync(file, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
}

function sql(text) {
  return spawnSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-X",
      "-q",
      "-t",
      "-A",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { encoding: "utf8", input: text, maxBuffer: 16 * 1024 * 1024 },
  );
}

const fixtureId = randomUUID();
const courseId = randomUUID();
const courseKey = `test-storage-${process.pid}`;
const password = `${randomUUID()}Aa1!`;
const email = `course-storage-${fixtureId}@example.invalid`;
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let container;
let service;
let authenticated;
let publicClient;
let mediaKey;
let storagePath;

before(async () => {
  const found = command("docker", [
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

  const statusResult = command("powershell.exe", [
    "-NoProfile",
    "-Command",
    "npx supabase status -o json",
  ]);
  assert.equal(statusResult.status, 0, "local Supabase status must be available");
  const local = JSON.parse(statusResult.stdout);
  assert.equal(typeof local.API_URL, "string");
  assert.equal(typeof local.ANON_KEY, "string");
  assert.equal(typeof local.SERVICE_ROLE_KEY, "string");
  service = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  publicClient = createClient(local.API_URL, local.ANON_KEY, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  authenticated = createClient(local.API_URL, local.ANON_KEY, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  local.SERVICE_ROLE_KEY = "";
  local.ANON_KEY = "";
  statusResult.stdout = "";

  const catalog = sql(
    "select (to_regclass('public.course_media') is not null)::text || ':' || (select count(*) from storage.buckets where id='course-media');",
  );
  assert.equal(catalog.status, 0, "course media migration must be applied locally");
  assert.equal(catalog.stdout.trim(), "true:1");

  const created = await service.auth.admin.createUser({
    id: fixtureId,
    email,
    password,
    email_confirm: true,
  });
  assert.equal(created.error, null, "local TEST Auth user creation must succeed");
  const fixture = sql(`
    insert into public.courses(
      id,course_key,name,course_type,region,city,address,holes,
      operation_code,description,course_status
    ) values (
      '${courseId}','${courseKey}','TEST Storage 골프장','field','서울','마포구',
      '서울 TEST Storage 주소',18,'walkIn','TEST Storage 활동사진 골프장 설명입니다.','active'
    );
  `);
  assert.equal(fixture.status, 0, "local TEST course creation must succeed");
  const signedIn = await authenticated.auth.signInWithPassword({ email, password });
  assert.equal(signedIn.error, null, "local TEST member authentication must succeed");
});

after(async () => {
  if (service && storagePath) {
    await service.storage.from("course-media").remove([storagePath]);
  }
  if (authenticated) await authenticated.auth.signOut();
  if (container) {
    const cleanup = sql(`
      delete from public.course_media where course_id='${courseId}';
      delete from public.courses where id='${courseId}';
    `);
    assert.equal(cleanup.status, 0, "local TEST course media cleanup must succeed");
  }
  if (service) await service.auth.admin.deleteUser(fixtureId);
  mediaKey = undefined;
  storagePath = undefined;
  service = undefined;
  publicClient = undefined;
  authenticated = undefined;
});

test("local signed upload writes one verified public photo and removes it without an orphan", async () => {
  const direct = await authenticated.storage
    .from("course-media")
    .upload(`${courseKey}/unauthorized/original`, png, { contentType: "image/png" });
  assert.notEqual(direct.error, null, "authenticated direct Storage upload must be denied");

  const intentResult = await authenticated.rpc("create_course_media_upload_intent", {
    p_course_key: courseKey,
    p_caption: "TEST signed upload",
    p_declared_mime_type: "image/png",
    p_declared_size_bytes: png.byteLength,
  });
  assert.equal(intentResult.error, null, "active member upload intent must succeed");
  mediaKey = intentResult.data.media_key;
  assert.match(mediaKey, /^[0-9a-f]{32}$/);

  const contextResult = await service.rpc("get_course_media_upload_context_server", {
    p_actor_user_id: fixtureId,
    p_media_key: mediaKey,
  });
  assert.equal(contextResult.error, null, "service upload context must succeed");
  const context = contextResult.data[0];
  assert.equal(context.storage_bucket, "course-media");
  storagePath = context.storage_path;
  assert.equal(storagePath, `${courseKey}/${mediaKey}/original`);

  const signed = await service.storage
    .from(context.storage_bucket)
    .createSignedUploadUrl(storagePath, { upsert: false });
  assert.equal(signed.error, null, "signed upload token issuance must succeed");
  const uploaded = await authenticated.storage
    .from(context.storage_bucket)
    .uploadToSignedUrl(storagePath, signed.data.token, png, { contentType: "image/png" });
  assert.equal(uploaded.error, null, "signed upload must succeed");

  const downloaded = await service.storage.from(context.storage_bucket).download(storagePath);
  assert.equal(downloaded.error, null, "server verification download must succeed");
  const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
  assert.deepEqual(bytes, png);
  assert.equal(downloaded.data.type, "image/png");

  const finalized = await service.rpc("finalize_course_media_upload_server", {
    p_actor_user_id: fixtureId,
    p_media_key: mediaKey,
    p_verified_mime_type: "image/png",
    p_verified_size_bytes: bytes.byteLength,
  });
  bytes.fill(0);
  assert.equal(finalized.error, null, "verified finalize must succeed");
  assert.equal(finalized.data.media_status, "available");

  const listed = await publicClient.rpc("list_public_course_media", {
    p_course_key: courseKey,
    p_limit: 12,
    p_offset: 0,
  });
  assert.equal(listed.error, null, "public course photo read must succeed");
  assert.equal(listed.data.total, 1);
  assert.equal(listed.data.items[0].media_key, mediaKey);

  const removed = await service.rpc("remove_course_media_server", {
    p_actor_user_id: fixtureId,
    p_media_key: mediaKey,
  });
  assert.equal(removed.error, null, "owner removal must succeed");
  const objectRemoval = await service.storage.from("course-media").remove([storagePath]);
  assert.equal(objectRemoval.error, null, "Storage object removal must succeed");
  storagePath = undefined;

  const afterList = await publicClient.rpc("list_public_course_media", {
    p_course_key: courseKey,
    p_limit: 12,
    p_offset: 0,
  });
  assert.equal(afterList.error, null);
  assert.equal(afterList.data.total, 0);
  const objectAfter = await service.storage
    .from("course-media")
    .download(`${courseKey}/${mediaKey}/original`);
  assert.notEqual(objectAfter.error, null, "removed object must not remain readable");
});
