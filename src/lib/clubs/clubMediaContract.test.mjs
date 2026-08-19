import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const migration = read("../../../supabase/migrations/20260822000100_pul_club_media_foundation.sql");
const client = read("./clubMedia.ts");
const storage = read("./clubMediaStorage.ts");
const validation = read("./clubMediaValidation.ts");
const provider = read("../../components/clubs/detail/ClubMediaProvider.tsx");
const actions = read("../../app/clubs/media/actions.ts");
const page = read("../../app/clubs/[id]/page.tsx");
const nextConfig = read("../../../next.config.ts");
const normalized = migration.replace(/\s+/g, " ").trim();

const compiledValidation = ts.transpileModule(validation, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const validationModule = await import(`data:text/javascript;base64,${Buffer.from(compiledValidation).toString("base64")}`);

test("creates one minimal media table and one public image bucket", () => {
  assert.match(normalized, /insert into storage\.buckets \( id, name, public, file_size_limit, allowed_mime_types \) values \( 'club-media', 'club-media', true, 8388608/);
  assert.match(normalized, /create table public\.club_media \(/);
  assert.match(normalized, /alter table public\.club_media force row level security/);
  assert.match(normalized, /revoke all on table public\.club_media from public, anon, authenticated, service_role/);
  assert.doesNotMatch(migration, /create table public\.club_(?:activity|activity_log|albums)/);
  assert.doesNotMatch(migration, /insert into public\.club_(?:role_definitions|permission_definitions|role_permissions)/);
});

test("enforces one current representative and soft removal", () => {
  assert.match(normalized, /create unique index club_media_current_representative_uidx on public\.club_media \(club_id\) where media_kind = 'representative' and media_status = 'available'/);
  assert.match(normalized, /set media_status = 'removed', removed_at = now\(\), version = existing\.version \+ 1/);
  assert.doesNotMatch(migration, /delete from public\.club_media/);
});

test("uses only existing media permission and service-only Storage helpers", () => {
  assert.match(migration, /club\.media\.review/);
  assert.doesNotMatch(migration, /club\.media\.(?:create|manage)/);
  assert.match(normalized, /grant execute on function public\.create_club_media_upload_intent\(uuid, text, text, text, date, text, bigint\) to authenticated/);
  for (const signature of [
    "get_club_media_upload_context_server\\(uuid, uuid\\)",
    "finalize_club_media_upload_server\\(uuid, uuid, text, bigint\\)",
    "mark_club_media_upload_failed_server\\(uuid, uuid\\)",
    "remove_club_media_server\\(uuid, uuid\\)",
  ]) {
    assert.match(normalized, new RegExp(`grant execute on function public\\.${signature} to service_role`));
  }
  assert.doesNotMatch(normalized, /grant execute on function public\.(?:get_club_media_upload_context_server|finalize_club_media_upload_server|remove_club_media_server)[^;]+to authenticated/);
});

test("recent activity is derived and filtered rather than double-written", () => {
  for (const table of ["club_notices", "club_official_events", "club_posts", "club_media"]) {
    assert.match(normalized, new RegExp(`from public\\.${table}`));
  }
  assert.match(normalized, /event\.event_status <> 'cancelled'/);
  assert.match(normalized, /post\.post_status in \('published', 'edited'\)/);
  assert.match(normalized, /media\.media_status = 'available'/);
  assert.match(normalized, /order by occurred_at desc, id limit 5/);
  assert.doesNotMatch(migration, /insert into public\.(?:club_)?activity/);
});

test("read response is privacy-minimized and strict", () => {
  assert.match(normalized, /grant execute on function public\.get_club_media_content\(uuid\) to anon, authenticated/);
  const readBlock = migration.slice(migration.indexOf("create function public.get_club_media_content"), migration.indexOf("comment on function public.get_club_media_content"));
  assert.doesNotMatch(readBlock, /uploaded_by_user_id|email|auth\.users/);
  assert.match(client, /hasExactKeys\(raw, \["representative_photo", "activity_photos", "recent_activities", "capabilities"\]\)/);
  assert.match(client, /if \(representativePhoto && representativePhoto\.mediaKind !== "representative"\) invalidResponse\(\)/);
  assert.doesNotMatch(client, /representativePhoto\?\.mediaKind !== "representative"/);
  assert.match(client, /storage\/v1\/object\/public/);
  assert.doesNotMatch(client, /supabase\.from\(/);
});

test("server-only upload validates bytes and never exposes a service credential", () => {
  assert.match(storage, /^import "server-only";/);
  assert.match(storage, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(storage, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE/);
  assert.doesNotMatch(storage, /console\.(?:log|warn|error)/);
  assert.match(storage, /createSignedUploadUrl\(path, \{ upsert: false \}\)/);
  assert.match(storage, /validateClubMediaBytes\(bytes, upload\.mimeType, upload\.byteSize, downloaded\.data\.type\)/);
  assert.match(provider, /uploadToSignedUrl\(intent\.path, intent\.token, input\.file/);
  assert.doesNotMatch(provider, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("validates JPEG, PNG, WebP signatures and the 8MB limit", () => {
  const { CLUB_MEDIA_MAX_BYTES, validateClubMediaBytes, validateClubMediaFilename } = validationModule;
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]);
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  assert.equal(CLUB_MEDIA_MAX_BYTES, 8 * 1024 * 1024);
  assert.equal(validateClubMediaBytes(jpeg, "image/jpeg", jpeg.length, "image/jpeg"), "image/jpeg");
  assert.equal(validateClubMediaBytes(png, "image/png", png.length, "image/png"), "image/png");
  assert.equal(validateClubMediaBytes(webp, "image/webp", webp.length, "image/webp"), "image/webp");
  assert.throws(() => validateClubMediaBytes(jpeg, "image/png", jpeg.length, "image/png"), /CLUB_MEDIA_MAGIC_MISMATCH/);
  assert.throws(() => validationModule.validateClubMediaDeclaration("text/plain", 20), /CLUB_MEDIA_MIME_INVALID/);
  assert.throws(() => validationModule.validateClubMediaDeclaration("image/jpeg", CLUB_MEDIA_MAX_BYTES + 1), /CLUB_MEDIA_SIZE_INVALID/);
  assert.doesNotThrow(() => validateClubMediaFilename("round.JPG", "image/jpeg"));
  assert.throws(() => validateClubMediaFilename("round.png", "image/jpeg"), /CLUB_MEDIA_EXTENSION_MISMATCH/);
});

test("server actions are thin and UI keeps upload accessibility and consent guidance", () => {
  assert.match(actions, /^"use server";/);
  assert.doesNotMatch(actions, /SUPABASE_SERVICE_ROLE_KEY|\.storage\./);
  assert.match(provider, /type="file"[\s\S]*accept="image\/jpeg,image\/png,image\/webp/);
  assert.match(provider, /다른 회원이 나온 사진은 동의를 확인한 후 올려주세요/);
  assert.match(provider, /role="dialog" aria-modal="true" aria-labelledby/);
  assert.match(provider, /event\.key === "Escape"/);
  assert.match(provider, /triggerRef\.current\?\.isConnected/);
});

test("page blocks photo and recent-activity mocks and config scopes remote images", () => {
  assert.match(page, /resolveClubMedia\(id, applicationIdentity\.clubUuid\)/);
  assert.match(page, /photos: \[\],[\s\S]*recentActivities: \[\]/);
  assert.match(page, /mediaContent=\{mediaContent\}/);
  assert.match(nextConfig, /storage\/v1\/object\/public\/club-media\/\*\*/);
});
