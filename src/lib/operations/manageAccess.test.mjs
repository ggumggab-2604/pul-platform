import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const h = React.createElement;
let fixture, calls, releaseAccount;
const privateMarker = "SYNTHETIC_PRIVATE_OPERATIONS";
const metric = (name) => async () => { calls.push(name); return name === "dashboard" ? { marker: privateMarker } : { items: [], total: 0 }; };
const mocks = {
  "next/link": { __esModule: true, default: ({ children, ...props }) => h("a", props, children) },
  "next/navigation": { redirect: (url) => { calls.push("redirect"); throw Object.assign(new Error("redirect"), { url }); } },
  "@/components/ui/Container": { Container: ({ children }) => h("div", null, children) },
  "@/components/messaging/MessagingSessionBoundary": { MessagingSessionBoundary: ({ children, viewerId }) => h("div", { "data-viewer": viewerId }, children) },
  "@/components/manage/OperationsDashboard": { OperationsDashboard: ({ dashboard }) => h("div", null, dashboard?.marker) },
  "@/lib/operations/operationsDashboard": {
    getOperationsDashboard: metric("dashboard"), createCertificationDirectoryFreshnessMetric: () => null,
    latestCertificationDirectoryUpdatedAt: () => null,
  },
  "@/lib/certification/certificationDirectory": {
    listCertificationCoursesForManagement: metric("courses"),
    listCertificationExamSchedulesForManagement: metric("exams"),
    listCertificationJobsForManagement: metric("jobs"),
  },
  "@/lib/supabase/auth": { getAuthenticatedSupabaseContext: async () => {
    calls.push("auth");
    if (fixture.anonymous) return null;
    return { userId: "synthetic-viewer", supabase: { from(table) {
      assert.equal(table, "user_accounts");
      return {
        select(fields) { assert.equal(fields, "account_status, platform_role"); return this; },
        eq(field, value) { assert.equal(field, "id"); assert.equal(value, "synthetic-viewer"); return this; },
        async maybeSingle() {
          calls.push("account-start");
          if (fixture.deferred) await new Promise((resolve) => { releaseAccount = resolve; });
          if (fixture.throws) throw new Error("synthetic transport failure");
          calls.push("account-done");
          return { data: fixture.missing ? null : { account_status: fixture.status ?? "active", platform_role: fixture.role ?? "member" }, error: fixture.error ? { message: "synthetic failure" } : null };
        },
      };
    } } };
  } },
};
const source = readFileSync(new URL("../../app/manage/page.tsx", import.meta.url), "utf8");
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const loaded = { exports: {} };
new Function("require", "module", "exports", output)((id) => mocks[id] ?? require(id), loaded, loaded.exports);
const page = loaded.exports.default;
const privateCalls = () => calls.filter((name) => ["dashboard", "courses", "exams", "jobs"].includes(name));

test("manage checks the owned active admin account before any management read", async (t) => {
  await t.test("anonymous retains safe next redirect and performs no data reads", async () => {
    fixture = { anonymous: true }; calls = [];
    await assert.rejects(page(), (error) => error.url === "/login?next=/manage");
    assert.deepEqual(calls, ["auth", "redirect"]);
  });
  for (const [name, options, failed] of [
    ["member", {}, false], ["club chair", { clubRole: "chair" }, false],
    ["club vice chair", { clubRole: "vice_chair" }, false], ["course steward", { courseRole: "steward" }, false],
    ["moderator", { role: "platform_moderator" }, false],
    ["suspended admin", { role: "platform_admin", status: "suspended" }, false],
    ["withdrawn admin", { role: "platform_admin", status: "withdrawn" }, false],
    ["missing account", { missing: true }, false],
    ["query error despite stale admin row", { role: "platform_admin", error: true }, true],
    ["query throws", { throws: true }, true],
  ]) await t.test(name, async () => {
    fixture = options; calls = [];
    const html = renderToStaticMarkup(await page());
    assert.equal(privateCalls().length, 0);
    assert.match(html, failed ? /권한을 확인하지 못했습니다/ : /접근 권한이 없습니다/);
    assert.match(html, /내 정보로 돌아가기/);
    for (const secret of [privateMarker, "배너·홍보 관리", "공개 콘텐츠 관리", "management-links-heading", "/manage/banners"]) assert.ok(!html.includes(secret), secret);
  });
  await t.test("active admin receives the original management links after account validation", async () => {
    fixture = { role: "platform_admin" }; calls = [];
    const html = renderToStaticMarkup(await page());
    assert.deepEqual(calls, ["auth", "account-start", "account-done", "dashboard", "courses", "exams", "jobs"]);
    assert.match(html, /배너·홍보 관리/); assert.match(html, /공개 콘텐츠 관리/);
    assert.match(html, new RegExp(privateMarker)); assert.match(html, /data-viewer="synthetic-viewer"/);
  });
  await t.test("a pending account check cannot start management helpers concurrently", async () => {
    fixture = { role: "platform_admin", deferred: true }; calls = [];
    const pending = page(); await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(calls, ["auth", "account-start"]); assert.equal(privateCalls().length, 0);
    releaseAccount(); await pending; assert.equal(privateCalls().length, 4);
  });
});
