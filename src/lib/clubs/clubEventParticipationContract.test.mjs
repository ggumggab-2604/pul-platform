import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const migration = read("../../../supabase/migrations/20260907000100_pul_club_event_participation.sql");
const client = read("./clubEventParticipation.ts");
const resolver = read("./resolveClubEventParticipation.ts");
const provider = read("../../components/clubs/detail/ClubCoreContentProvider.tsx");
const panel = read("../../components/clubs/detail/ClubEventParticipationPanel.tsx");
const page = read("../../app/clubs/[id]/page.tsx");
const normalized = migration.replace(/\s+/g, " ").trim();

test("creates only the minimal event participation table with duplicate defense and closed raw ACL", () => {
  assert.match(normalized, /create table public\.club_official_event_participations \(/);
  assert.match(normalized, /primary key \(event_id, membership_id\)/);
  assert.match(normalized, /alter table public\.club_official_event_participations force row level security/);
  assert.match(normalized, /revoke all on table public\.club_official_event_participations from public, anon, authenticated, service_role/);
  assert.doesNotMatch(migration, /club_mutation_requests|audit_logs|application_status|reviewed_at/i);
});

test("exposes privacy-minimized read plus authenticated join and leave RPCs", () => {
  assert.match(normalized, /create function public\.get_club_event_participation\(p_club_id uuid\) returns jsonb language plpgsql stable security definer set search_path = ''/);
  assert.match(normalized, /grant execute on function public\.get_club_event_participation\(uuid\) to anon, authenticated/);
  for (const name of ["join_club_event", "leave_club_event"]) {
    assert.match(normalized, new RegExp(`create function public\\.${name}\\(p_event_id uuid\\) returns jsonb language sql security definer set search_path = ''`));
    assert.match(normalized, new RegExp(`grant execute on function public\\.${name}\\(uuid\\) to authenticated`));
    assert.doesNotMatch(normalized, new RegExp(`grant execute on function public\\.${name}[^;]+to anon`));
  }
  const readBlock = migration.slice(migration.indexOf("create function public.get_club_event_participation"), migration.indexOf("comment on function public.get_club_event_participation"));
  assert.doesNotMatch(readBlock, /membership_id'|user_id'|email|display_name/);
});

test("join uses active membership permission, event locking, capacity, and natural replay safety", () => {
  assert.match(normalized, /'club\.events\.join'/);
  assert.match(normalized, /membership\.membership_status = 'active' for share/);
  assert.match(normalized, /where event\.id = p_event_id and event\.club_id = v_club_id for update/);
  assert.match(normalized, /if v_capacity is not null and v_participant_count >= v_capacity then/);
  assert.match(normalized, /if exists \( select 1 from public\.club_official_event_participations/);
  assert.match(normalized, /delete from public\.club_official_event_participations as participation where participation\.event_id = p_event_id and participation\.membership_id = v_membership_id/);
});

test("membership suspension and leave atomically remove stale participation", () => {
  assert.match(normalized, /after update of membership_status on public\.club_memberships/);
  assert.match(normalized, /old\.membership_status = 'active' and new\.membership_status <> 'active'/);
  assert.match(normalized, /delete from public\.club_official_event_participations as participation where participation\.membership_id = new\.id/);
});

test("client strictly parses read and mutation responses and uses RPC only", () => {
  assert.match(client, /hasExactKeys\(raw, \["authentication_status", "can_join", "events"\]\)/);
  assert.match(client, /hasExactKeys\(item, \["event_id", "participant_count", "is_participating", "joined_at"\]\)/);
  assert.match(client, /data\.event_id !== input\.eventId/);
  assert.match(client, /data\.participating !== \(input\.operation === "join"\)/);
  assert.match(client, /supabase\.rpc\("get_club_event_participation"/);
  assert.match(client, /"join_club_event" : "leave_club_event"/);
  assert.doesNotMatch(client, /supabase\.from\(/);
});

test("server resolver seeds the client snapshot without a duplicate mount fetch", () => {
  assert.match(resolver, /import "server-only"/);
  assert.match(page, /resolveClubEventParticipation\(applicationIdentity\.clubUuid\)/);
  assert.match(page, /eventParticipation=\{eventParticipation\}/);
  assert.match(provider, /initialParticipation: ClubEventParticipationSnapshot/);
  assert.match(provider, /const \[participation, setParticipation\] = useState\(initialParticipation\)/);
  assert.match(provider, /previousIdentity === identity/);
});

test("UI replaces the preparing placeholder with member-aware real actions", () => {
  assert.match(panel, /"참가 신청"/);
  assert.match(panel, /"참가 신청 취소"/);
  assert.match(panel, /로그인 후 참가 신청/);
  assert.match(panel, /동호회 회원 전용/);
  assert.match(panel, /entry\?\.participantCount/);
  assert.doesNotMatch(panel, /참가 신청 준비 중|신청 취소 준비 중/);
  assert.doesNotMatch(provider, /supabase\.(?:from|insert|update|delete)\(/);
});
