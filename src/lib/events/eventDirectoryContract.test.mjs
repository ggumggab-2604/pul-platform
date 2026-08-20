import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const migration = read("../../../supabase/migrations/20260826000100_pul_event_directory_foundation.sql");
const listPage = read("../../app/events/page.tsx");
const listUi = read("../../components/events/EventsPageContent.tsx");
const detailPage = read("../../app/events/[id]/page.tsx");
const detailUi = read("../../components/events/EventDetailContent.tsx");
const client = read("./eventDirectory.ts");

test("event table keeps stable public keys, constrained directory fields, and active-course relation", () => {
  assert.match(migration, /create table public\.events/);
  assert.match(migration, /constraint events_event_key_uidx unique \(event_key\)/);
  assert.match(migration, /match_type in \('field', 'screen'\)/);
  assert.match(migration, /registration_status in \('open', 'scheduled', 'closed', 'needCheck', 'ended'\)/);
  assert.match(migration, /publication_status in \('published', 'hidden', 'removed'\)/);
  assert.match(migration, /related_course_id uuid references public\.courses \(id\) on delete set null/);
  const ddlBeforeOperatorMutation = migration.split("create function public.mutate_event")[0];
  assert.doesNotMatch(ddlBeforeOperatorMutation, /insert into public\.events/i, "the product migration must not seed unverifiable events");
});

test("public RPCs are security-definer, published-only, paginated, and privacy minimized", () => {
  for (const signature of [
    "list_public_events(text, text, text, integer, integer)",
    "get_public_event(text)",
    "get_public_event_region_summaries(text)",
    "list_public_event_reviews(integer)",
  ]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${signature.replace(/[()]/g, "\\$&")}`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${signature.replace(/[()]/g, "\\$&")}[\\s\\S]*?to anon, authenticated`));
  }
  assert.match(migration, /where event\.publication_status = 'published'/);
  assert.match(migration, /p_limit not between 1 and 50 or p_offset < 0/);
  assert.doesNotMatch(migration.match(/create function private\.public_event_json[\s\S]*?\$\$;/)?.[0] ?? "", /'id'|'created_by'|'updated_by'|'publication_status'|'version'/);
});

test("operator mutation reuses platform permission and denies direct table privileges", () => {
  assert.match(migration, /values \('events\.manage'/);
  assert.match(migration, /values \('platform_admin', 'events\.manage'\)/);
  assert.match(migration, /mapping\.permission_code = 'events\.manage'/);
  assert.match(migration, /for share of account/);
  assert.match(migration, /for update/);
  assert.match(migration, /revoke all on table public\.events[\s\S]*?from public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute on function public\.mutate_event\(text, text, integer, jsonb\)[\s\S]*?to authenticated/);
  assert.match(migration, /official_url ~ '\^https:\/\/'/);
  assert.match(migration, /registration_url ~ '\^https:\/\/'/);
});

test("actual event routes use server contracts and never import mock event arrays", () => {
  assert.match(listPage, /listPublicEvents/);
  assert.match(listPage, /getPublicEventRegionSummaries/);
  assert.match(listPage, /listPublicEventReviews/);
  assert.match(detailPage, /getPublicEvent/);
  assert.match(detailPage, /notFound\(\)/);
  for (const source of [listPage, listUi, detailPage, detailUi]) {
    assert.doesNotMatch(source, /eventItems|screenTournamentCards|regionEventSummaries|eventReviewCards/);
  }
  assert.match(listUi, /router\.push\(buildListHref/);
  assert.match(listUi, /현재 등록된 대회·이벤트가 없습니다/);
});

test("detail exposes safe external links and course stable-key navigation without internal registration", () => {
  assert.match(detailUi, /href=\{`\/courses\/\$\{event\.relatedCourse\.courseKey\}`\}/);
  assert.match(detailUi, /target="_blank" rel="noopener noreferrer"/);
  assert.match(detailUi, /PUL은 참가 신청이나 결제를 직접 받지 않습니다/);
  assert.doesNotMatch(detailUi, /service_role|auth\.users|email|결제하기|참가비 결제/);
  assert.match(client, /client\.rpc\("list_public_event_reviews"/);
  assert.match(migration, /post\.review_type = 'event'/);
});
