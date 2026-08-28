import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = new URL("../../../", import.meta.url);
const read = (path) => readFileSync(fileURLToPath(new URL(path, root)), "utf8");
const migration = read("supabase/migrations/20260920000100_pul_operations_dashboard_read_model.sql");
const library = read("src/lib/operations/operationsDashboard.ts");
const component = read("src/components/manage/OperationsDashboard.tsx");
const page = read("src/app/manage/page.tsx");
const functionBody = migration.split("create function public.get_operations_dashboard")[1];

test("dashboard is a stable lock-free SECURITY DEFINER read function with exact ACL", () => {
  assert.match(migration, /create function public\.get_operations_dashboard\(\s*p_reference_at timestamptz default pg_catalog\.now\(\),\s*p_recent_limit integer default 8\s*\)/);
  assert.match(functionBody, /returns jsonb\s+language plpgsql\s+stable\s+security definer\s+set search_path = ''/);
  assert.match(migration, /revoke all on function public\.get_operations_dashboard\(timestamptz, integer\)\s+from public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute on function public\.get_operations_dashboard\(timestamptz, integer\)\s+to authenticated/);
  assert.doesNotMatch(functionBody, /for\s+(share|update)/i);
  assert.doesNotMatch(functionBody, /\b(insert\s+into|update\s+public\.|delete\s+from|merge\s+into)\b/i);
});

test("permission boundaries omit unauthorized domains instead of emitting zero placeholders", () => {
  assert.match(functionBody, /if v_has_news then[\s\S]*?'news_inquiries'/);
  assert.match(functionBody, /if v_has_hof_applications then[\s\S]*?'hall_of_fame_application_reviews'/);
  assert.match(functionBody, /PUL_OPERATIONS_DASHBOARD_NOT_AUTHORIZED/);
  assert.doesNotMatch(functionBody, /platform_role\s*=\s*'platform_admin'/);
});

test("response is compact and privacy-minimized", () => {
  for (const key of ["schema_version", "generated_at", "attention", "upcoming", "automation_signals", "recent_activity"]) {
    assert.match(functionBody, new RegExp(`'${key}'`));
  }
  const returned = functionBody.split("return pg_catalog.jsonb_build_object")[1];
  for (const forbidden of [
    "actor_id", "target_id", "request_id", "email", "phone", "statement",
    "report_body", "inquiry_body", "storage_path", "metadata", "before_summary", "after_summary",
  ]) {
    assert.doesNotMatch(returned, new RegExp(forbidden, "i"));
  }
});

test("attention predicates match the actual queue contracts", () => {
  const expected = [
    /course_information_reports[\s\S]*?report_status = 'received'/,
    /lesson_submission_requests[\s\S]*?request_status = 'pending'/,
    /lesson_information_reports[\s\S]*?report_status = 'pending'/,
    /certification_submission_requests[\s\S]*?request_status = 'pending'/,
    /news_inquiries[\s\S]*?inquiry_status = 'pending'/,
    /market_repair_shop_inquiries[\s\S]*?inquiry_status = 'pending'/,
    /market_partnership_inquiries[\s\S]*?inquiry_status = 'pending'/,
    /hall_of_fame_application_batches[\s\S]*?submitted[\s\S]*?under_review[\s\S]*?additional_info_required/,
    /hall_of_fame_disputes[\s\S]*?open[\s\S]*?under_review/,
  ];
  for (const pattern of expected) assert.match(functionBody, pattern);
});

test("upcoming and check signals use typed dates and current unresolved states only", () => {
  assert.match(functionBody, /promotion_placements[\s\S]*?ends_at <= p_reference_at \+ interval '7 days'/);
  assert.match(functionBody, /events[\s\S]*?start_date between p_reference_at::date/);
  assert.doesNotMatch(functionBody, /schedule_text|application_period|exam_date_text/);
  assert.match(functionBody, /media_status = 'failed'[\s\S]*?not exists[\s\S]*?media_status = 'available'/);
  assert.match(functionBody, /evidence\.storage_deleted_at is null/);
});

test("client parser and page preserve strict parsing, fallback, links and responsive cards", () => {
  assert.match(library, /parseOperationsDashboard/);
  assert.match(library, /exactObject\(value, TOP_LEVEL_KEYS\)/);
  assert.match(page, /getOperationsDashboard\(context\.supabase\)/);
  assert.match(page, /dashboardLoadFailed = true/);
  assert.match(component, /운영 현황을 불러오지 못했습니다/);
  assert.match(component, /현재 확인이 필요한 운영 요청이 없습니다/);
  assert.match(component, /관리 화면 미구축/);
  assert.match(component, /lg:grid-cols-2/);
  assert.match(component, /min-w-0/);
  for (const route of [
    "/lessons/manage/reports",
    "/market/manage/repair-shop-inquiries",
    "/market/manage/partnership-inquiries",
  ]) assert.match(page, new RegExp(route));
  for (const original of ["/manage/banners", "/hall-of-fame/manage", "/news/manage", "/lessons/manage/requests", "/certification/manage/requests"]) {
    assert.match(page, new RegExp(original));
  }
});
