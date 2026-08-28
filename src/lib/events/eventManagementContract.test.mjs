import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const migration = readFileSync(`${root}supabase/migrations/20260922000100_pul_event_operations_management.sql`, "utf8");
const actions = readFileSync(`${root}src/app/events/manage/actions.ts`, "utf8");
const form = readFileSync(`${root}src/components/events/manage/EventManagementForm.tsx`, "utf8");
const listPage = readFileSync(`${root}src/app/events/manage/page.tsx`, "utf8");
const editPage = readFileSync(`${root}src/app/events/manage/[eventKey]/page.tsx`, "utf8");
const managePage = readFileSync(`${root}src/app/manage/page.tsx`, "utf8");
const registry = readFileSync(`${root}src/lib/operations/operationsDashboard.ts`, "utf8");

test("management read RPCs are stable security-definer functions with empty search path and authenticated-only execute", () => {
  for (const name of ["list_events_for_management", "get_event_for_management"]) {
    assert.match(migration, new RegExp(`create function public\\.${name}\\([\\s\\S]*?stable[\\s\\S]*?security definer[\\s\\S]*?set search_path = ''`, "i"));
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}\\([\\s\\S]*?from public, anon, authenticated, service_role;[\\s\\S]*?grant execute on function public\\.${name}\\([\\s\\S]*?to authenticated;`, "i"));
  }
});

test("read model uses active events.manage capability and contains no lock or mutation statement", () => {
  assert.match(migration, /account\.account_status = 'active'[\s\S]*mapping\.permission_code = 'events\.manage'/);
  const listBody = migration.match(/create function public\.list_events_for_management[\s\S]*?\$\$;/i)?.[0] ?? "";
  const detailBody = migration.match(/create function public\.get_event_for_management[\s\S]*?\$\$;/i)?.[0] ?? "";
  for (const body of [listBody, detailBody]) {
    assert.doesNotMatch(body, /for\s+(update|share)|\binsert\s+into\b|\bupdate\s+public\.|\bdelete\s+from\b/i);
  }
  assert.doesNotMatch(migration, /grant\s+(select|insert|update|delete)\s+on\s+public\.events/i);
});

test("freshness uses explicit KST date, nullable dates stay excluded, and no automatic status mutation is added", () => {
  assert.match(migration, /p_reference_at at time zone 'Asia\/Seoul'/);
  assert.match(migration, /p_event\.end_date is not null[\s\S]*p_event\.end_date </);
  assert.match(migration, /p_event\.start_date is not null[\s\S]*p_event\.start_date between/);
  assert.match(migration, /alter function public\.get_operations_dashboard\(timestamptz, integer\)[\s\S]*set timezone to 'Asia\/Seoul'/);
  assert.doesNotMatch(migration, /create(?: or replace)? function public\.mutate_event/i);
  assert.doesNotMatch(migration, /pg_cron|cron\.|net\.http|edge function|artificial intelligence/i);
});

test("server actions retain stable key, expected version, strict payload and existing mutate_event path", () => {
  assert.match(actions, /exact\(input, \["operation", "eventKey", "expectedVersion", "payload"\]\)/);
  assert.match(actions, /mutateEvent\(context\.supabase, operation, row\.eventKey, row\.expectedVersion/);
  assert.match(form, /expectedVersion: event\?\.version \?\? null/);
  assert.match(form, /router\.refresh\(\)/);
  assert.match(form, /result\.shouldRefresh/);
});

test("dashboard event signals link to the exact management freshness filters", () => {
  assert.match(registry, /events_starting_soon:[\s\S]*href: "\/events\/manage\?freshness=starting-soon"/);
  assert.match(registry, /events_status_mismatch:[\s\S]*href: "\/events\/manage\?freshness=status-mismatch"/);
});

test("management routes enforce server auth, expose the management card, and preserve stale refresh semantics", () => {
  assert.match(listPage, /getAuthenticatedSupabaseContext\(\)/);
  assert.match(listPage, /redirect\("\/login\?next=\/events\/manage"\)/);
  assert.match(managePage, /href: "\/events\/manage"[\s\S]*title: "대회·이벤트 운영"/);
  assert.doesNotMatch(editPage, /key={`\$\{event\.eventKey}:\$\{event\.version}`}/);
  assert.match(form, /draftIdentity = event \? `\$\{event\.eventKey}:\$\{event\.version}` : "new"/);
  assert.match(form, /draftState\.identity === draftIdentity \? draftState\.value : event \? eventDraft\(event\) : blankDraft\(\)/);
  assert.doesNotMatch(form, /useEffect\(\(\) => \{\s*setDraft/);
  assert.match(form, /disabled={isPending \|\| readOnly}/);
  assert.match(form, /role="dialog"[\s\S]*aria-modal="true"/);
  assert.match(form, /initialRef\.current\?\.focus\({ preventScroll: true }\)/);
  assert.match(form, /statusTriggerRef\.current\?\.isConnected[\s\S]*focus\({ preventScroll: true }\)/);
  assert.match(form, /focusAfterTransitionRef\.current = true/);
  assert.match(form, /if \(isPending \|\| !focusAfterTransitionRef\.current\) return/);
  assert.doesNotMatch(form + listPage, /toLocale(?:Date)?String\(/);
});

test("form keeps typed date validation, schedule-note fallback and explicit human-only operations", () => {
  assert.match(form, /draft\.endDate < draft\.startDate/);
  assert.match(form, /!draft\.startDate && !draft\.scheduleNote\.trim\(\)/);
  for (const operation of ["publish", "hide", "end"]) assert.match(form, new RegExp(`requestStatusChange\\(\"${operation}\"`));
  assert.match(listPage, /종료일이 지났지만 접수 상태가 아직 진행 중입니다/);
  assert.doesNotMatch(form + actions, /setInterval|setTimeout|cron|automatic|자동 종료/);
});
