import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const migration = read("../../../supabase/migrations/20260821000100_pul_club_core_content_foundation.sql");
const client = read("./clubCoreContent.ts");
const provider = read("../../components/clubs/detail/ClubCoreContentProvider.tsx");
const page = read("../../app/clubs/[id]/page.tsx");
const normalized = migration.replace(/\s+/g, " ").trim();

test("creates the three minimal club content tables without adding roles or permissions", () => {
  for (const table of ["club_notices", "club_posts", "club_official_events"]) {
    assert.match(normalized, new RegExp(`create table public\\.${table} \\(`));
    assert.match(normalized, new RegExp(`alter table public\\.${table} force row level security`));
    assert.match(normalized, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated, service_role`));
  }
  assert.doesNotMatch(migration, /insert into public\.club_(?:role_definitions|permission_catalog|role_permissions)/);
});

test("exposes only the guarded read and mutation RPC contracts", () => {
  assert.match(normalized, /create function public\.get_club_core_content\(p_club_id uuid\) returns jsonb language plpgsql stable security definer set search_path = ''/);
  assert.match(normalized, /grant execute on function public\.get_club_core_content\(uuid\) to anon, authenticated/);
  assert.match(normalized, /create function public\.mutate_club_core_content\( p_content_type text, p_operation text, p_request_id uuid, p_club_id uuid, p_content_id uuid default null, p_expected_version integer default null, p_payload jsonb default '\{\}'::jsonb \) returns jsonb language plpgsql security definer set search_path = ''/);
  assert.match(normalized, /grant execute on function public\.mutate_club_core_content\(text, text, uuid, uuid, uuid, integer, jsonb\) to authenticated/);
  assert.doesNotMatch(normalized, /grant execute on function public\.mutate_club_core_content[^;]+to anon/);
});

test("read RPC filters visibility and never returns raw actor identifiers", () => {
  assert.match(normalized, /notice\.visibility = 'public' or \(notice\.visibility = 'club_members' and v_can_read_notices\)/);
  assert.match(normalized, /post\.visibility = 'public' or \(post\.visibility = 'club_members' and v_can_read_posts\)/);
  assert.match(normalized, /event\.visibility = 'public' or \(event\.visibility = 'club_members' and v_can_read_events\)/);
  const readBlock = migration.slice(migration.indexOf("create function public.get_club_core_content"), migration.indexOf("comment on function public.get_club_core_content"));
  assert.doesNotMatch(readBlock, /author_user_id,|creator_user_id,|user_id as/);
  assert.match(readBlock, /pg_catalog\.to_jsonb\(visible_notice\) - 'importance_rank'/);
});

test("mutation authorization reuses existing functional permissions", () => {
  for (const permission of ["club.notices.create", "club.notices.manage", "club.posts.create", "club.posts.moderate", "club.events.create", "club.events.manage"]) {
    assert.match(migration, new RegExp(permission.replaceAll(".", "\\.")));
  }
  assert.match(normalized, /where account\.id = v_actor_id for share/);
  assert.match(normalized, /where club\.id = p_club_id for update/);
});

test("mutation uses request replay, representative audit, and atomic ledger completion", () => {
  assert.match(normalized, /where ledger\.actor_id = v_actor_id and ledger\.request_id = p_request_id for update/);
  assert.match(normalized, /on conflict on constraint club_mutation_requests_actor_request_unique do nothing/);
  assert.match(normalized, /return v_ledger_result \|\| pg_catalog\.jsonb_build_object\('replayed', true\)/);
  assert.match(normalized, /insert into public\.audit_logs/);
  assert.match(normalized, /get diagnostics v_completed_ledger_count = row_count/);
  assert.match(normalized, /if v_completed_ledger_count <> 1 then/);
});

test("mutation uses optimistic version locks and soft removal", () => {
  assert.equal((migration.match(/for update;/g) ?? []).length >= 5, true);
  assert.match(normalized, /if v_version <> p_expected_version then/);
  assert.match(normalized, /set notice_status = 'archived', version = version \+ 1/);
  assert.match(normalized, /set post_status = 'deleted', version = version \+ 1/);
  assert.match(normalized, /set event_status = 'cancelled', version = version \+ 1/);
  assert.doesNotMatch(migration, /delete from public\.club_(?:notices|posts|official_events)/);
});

test("client keeps strict response parsing and uses only RPCs", () => {
  assert.match(client, /hasExactKeys\(raw, \["notices", "posts", "official_events", "capabilities"\]\)/);
  assert.match(client, /data\.request_id !== input\.requestId/);
  assert.match(client, /supabase\.rpc\("get_club_core_content"/);
  assert.match(client, /supabase\.rpc\("mutate_club_core_content"/);
  assert.doesNotMatch(client, /supabase\.from\(/);
});

test("Provider refreshes on auth identity changes and never performs direct DML", () => {
  assert.match(provider, /previousIdentity === identity/);
  assert.match(provider, /setSnapshot\(\(current\) => \(\{ \.\.\.current, notices: \[\], posts: \[\], officialEvents: \[\]/);
  assert.match(provider, /crypto\.randomUUID\(\)/);
  assert.match(provider, /expectedVersion: dialog\.record\?\.version/);
  assert.doesNotMatch(provider, /supabase\.(?:from|insert|update|delete)\(/);
});

test("page removes mock core content before rendering RPC-backed sections", () => {
  assert.match(page, /resolveClubCoreContent\(id, applicationIdentity\.clubUuid\)/);
  assert.match(page, /notices: \[\],[\s\S]*posts: \[\],[\s\S]*officialEvents: \[\]/);
  assert.match(page, /coreContent=\{coreContent\}/);
});
