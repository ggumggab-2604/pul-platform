import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const migration = read("../../../supabase/migrations/20260910000100_pul_course_media.sql");
const client = read("./courseMedia.ts");
const storage = read("./courseMediaStorage.ts");
const actions = read("../../app/courses/media/actions.ts");
const section = read("../../components/courses/detail/CourseActivityPhotoSection.tsx");
const detail = read("../../components/courses/detail/CourseDirectoryDetailContent.tsx");
const page = read("../../app/courses/[id]/page.tsx");
const nextConfig = read("../../../next.config.ts");
const normalized = migration.replace(/\s+/g, " ").trim();

const testableClient = client.replace(
  'import { getSupabasePublicEnv } from "@/lib/supabase/env";',
  'const getSupabasePublicEnv = () => ({ url: "https://test.supabase.invalid" });',
);
const compiledClient = ts.transpileModule(testableClient, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const clientModule = await import(
  `data:text/javascript;base64,${Buffer.from(compiledClient).toString("base64")}`
);

test("creates one domain-scoped public course image bucket and guarded metadata table", () => {
  assert.match(
    normalized,
    /insert into storage\.buckets \( id, name, public, file_size_limit, allowed_mime_types \) values \( 'course-media', 'course-media', true, 8388608/,
  );
  assert.match(normalized, /create table public\.course_media \(/);
  assert.match(normalized, /alter table public\.course_media enable row level security/);
  assert.match(normalized, /alter table public\.course_media force row level security/);
  assert.match(
    normalized,
    /revoke all on table public\.course_media from public, anon, authenticated, service_role/,
  );
  assert.doesNotMatch(migration, /alter table public\.(?:club_media|market_media)/);
  assert.doesNotMatch(migration, /create table public\.(?:media|albums|photo_comments)/);
});

test("uses opaque public keys and paths without user or internal UUID identifiers", () => {
  assert.match(normalized, /constraint course_media_media_key_check check \(media_key ~ '\^\[0-9a-f\]\{32\}\$'\)/);
  assert.match(normalized, /v_course_key \|\| '\/' \|\| v_media_key \|\| '\/original'/);
  const readBlock = migration.slice(
    migration.indexOf("create function public.list_public_course_media"),
    migration.indexOf("comment on function public.list_public_course_media"),
  );
  assert.doesNotMatch(readBlock, /'id'|'course_id'|'uploader_user_id'|'email'/);
  assert.match(readBlock, /'media_key'/);
  assert.match(readBlock, /'can_delete'/);
});

test("limits writes to active members, active courses, one file, and eight current photos", () => {
  const intentBlock = migration.slice(
    migration.indexOf("create function public.create_course_media_upload_intent"),
    migration.indexOf("comment on function public.create_course_media_upload_intent"),
  );
  assert.match(intentBlock, /account\.account_status/);
  assert.match(intentBlock, /v_actor_status is distinct from 'active'/);
  assert.match(intentBlock, /course\.course_status = 'active'/);
  assert.match(intentBlock, /media\.media_status = 'available'/);
  assert.match(intentBlock, /media\.media_status = 'pending_upload'/);
  assert.match(intentBlock, /media\.created_at >= now\(\) - interval '2 hours'/);
  assert.match(intentBlock, />= 8/);
  assert.match(intentBlock, /p_declared_mime_type not in \('image\/jpeg', 'image\/png', 'image\/webp'\)/);
  assert.match(intentBlock, /p_declared_size_bytes > 8388608/);
});

test("public and service-only function ACLs are exact", () => {
  assert.match(
    normalized,
    /grant execute on function public\.list_public_course_media\(text, integer, integer\) to anon, authenticated/,
  );
  assert.match(
    normalized,
    /grant execute on function public\.create_course_media_upload_intent\(text, text, text, bigint\) to authenticated/,
  );
  for (const signature of [
    "get_course_media_upload_context_server\\(uuid, text\\)",
    "finalize_course_media_upload_server\\(uuid, text, text, bigint\\)",
    "mark_course_media_upload_failed_server\\(uuid, text\\)",
    "remove_course_media_server\\(uuid, text\\)",
  ]) {
    assert.match(
      normalized,
      new RegExp(`grant execute on function public\\.${signature} to service_role`),
    );
  }
  assert.doesNotMatch(
    normalized,
    /grant execute on function public\.(?:get_course_media_upload_context_server|finalize_course_media_upload_server|mark_course_media_upload_failed_server|remove_course_media_server)[^;]+to authenticated/,
  );
});

test("strict client parser rejects internal fields and malformed object prototypes", () => {
  const validItem = {
    media_key: "a".repeat(32),
    storage_bucket: "course-media",
    storage_path: `course-1/${"a".repeat(32)}/original`,
    caption: null,
    created_at: "2026-09-10T00:00:00.000Z",
    can_delete: false,
  };
  const pageValue = {
    items: [validItem],
    total: 1,
    limit: 12,
    offset: 0,
    has_more: false,
  };
  const parsed = clientModule.parsePublicCourseMediaPage(pageValue, "course-1");
  assert.equal(parsed.items[0].mediaKey, "a".repeat(32));
  assert.equal(parsed.items[0].imageUrl.includes("/course-media/course-1/"), true);
  assert.throws(
    () => clientModule.parsePublicCourseMediaPage({ ...pageValue, items: [{ ...validItem, uploader_user_id: "hidden" }] }, "course-1"),
    /응답 형식/,
  );
  const inherited = Object.create({ items: [] });
  Object.assign(inherited, pageValue);
  assert.throws(() => clientModule.parsePublicCourseMediaPage(inherited, "course-1"), /응답 형식/);
  assert.throws(
    () => clientModule.parsePublicCourseMediaPage({ ...pageValue, items: [{ ...validItem, storage_path: `other/${"a".repeat(32)}/original` }] }, "course-1"),
    /응답 형식/,
  );
});

test("client list sends exact bounded RPC arguments and validates course keys", async () => {
  const calls = [];
  const rpc = async (name, args) => {
    calls.push({ name, args });
    return {
      data: { items: [], total: 0, limit: 12, offset: 0, has_more: false },
      error: null,
    };
  };
  const result = await clientModule.listPublicCourseMedia({ rpc }, " course-1 ", 12, 0);
  assert.equal(result.total, 0);
  assert.deepEqual(calls, [
    {
      name: "list_public_course_media",
      args: { p_course_key: "course-1", p_limit: 12, p_offset: 0 },
    },
  ]);
  await assert.rejects(
    () => clientModule.listPublicCourseMedia({ rpc }, "not/a/key", 12, 0),
    /찾을 수 없습니다/,
  );
  await assert.rejects(
    () => clientModule.listPublicCourseMedia({ rpc }, "course-1", 25, 0),
    /범위를 확인/,
  );
});

test("server boundary reuses byte validation and signed upload compensation", () => {
  assert.match(storage, /^import "server-only";/);
  assert.match(storage, /validateClubMediaDeclaration/);
  assert.match(storage, /validateClubMediaFilename/);
  assert.match(storage, /validateClubMediaBytes/);
  assert.match(storage, /createSignedUploadUrl\(path, \{ upsert: false \}\)/);
  assert.match(storage, /mark_course_media_upload_failed_server/);
  assert.match(storage, /\.remove\(\[upload\.path\]\)/);
  assert.doesNotMatch(storage, /console\.(?:log|warn|error)/);
  assert.doesNotMatch(section, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("UI keeps the current course detail, one-file preview, progress, privacy, and own delete", () => {
  assert.match(page, /listPublicCourseMedia\(client, id, 12, 0\)/);
  assert.match(detail, /CourseActivityPhotoSection/);
  assert.match(section, /type="file"/);
  assert.match(section, /등록 전 활동사진 미리보기/);
  assert.match(section, /업로드를 준비하고 있습니다/);
  assert.match(section, /operationRef\.current/);
  assert.match(section, /다른 사람의 개인정보나 동의 없이 촬영한 얼굴/);
  assert.match(section, /photo\.canDelete/);
  assert.match(section, /내 사진 삭제/);
  assert.match(section, /role="dialog"/);
  assert.match(section, /aria-modal="true"/);
  assert.match(section, /event\.key === "Escape"/);
  assert.match(section, /triggerRef\.current\?\.isConnected/);
  assert.doesNotMatch(section, /multiple/);
  assert.doesNotMatch(section, /crop|rotate|filter|face|moderation/i);
});

test("course photos stay separate from information reports, discussions, and hero selection", () => {
  assert.doesNotMatch(migration, /course_information_reports|course_discussion_posts/);
  assert.doesNotMatch(section, /CourseInformationReportDialog|CourseStoryBoardSection/);
  assert.doesNotMatch(migration, /hero|featured|representative/);
  assert.doesNotMatch(actions, /CourseInformationReport|Discussion/);
  assert.match(nextConfig, /storage\/v1\/object\/public\/course-media\/\*\*/);
});
