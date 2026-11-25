import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const Link = () => null;
const Boundary = () => null;
const View = () => null;
const Dashboard = () => null;
const source = readFileSync(new URL("../../app/my/page.tsx", import.meta.url), "utf8");
let fixture;
let queries;
const mocks = {
  "next/link": { __esModule: true, default: Link },
  "next/navigation": { redirect: (url) => { throw Object.assign(new Error("redirect"), { url }); } },
  "@/components/account/MyActivityHub": { MyActivityHub: View },
  "@/components/account/MyDashboard": { MyCard: View, MyDashboard: Dashboard, profileLinkClass: "" },
  "@/components/account/MemberBasicsForm": { MemberBasicsForm: View },
  "@/components/account/ProfileForm": { ProfileForm: View },
  "@/components/auth/LogoutButton": { LogoutButton: View },
  "@/components/ui/Container": { Container: View },
  "@/components/interests/InterestList": { InterestList: View },
  "@/components/messaging/MessagingSessionBoundary": { MessagingSessionBoundary: Boundary },
  "@/lib/interests/interests": { listInterests: async () => null },
  "@/lib/my/myActivity": { fetchMyActivityOverview: async () => null },
  "@/lib/supabase/auth": {
    getAuthenticatedSupabaseContext: async () => fixture.signedOut ? null : ({
      userId: "synthetic-viewer",
      supabase: {
      async rpc(name) {
        queries.push({ name });
        if (name === "get_my_posting_name") {
          return { data: { nickname: "잔디친구482", real_name: null, use_real_name: false, profile_visibility: "private" }, error: fixture.profileError ?? null };
        }
        if (name === "get_my_dashboard" && fixture.dashboardError) {
          return { data: null, error: { message: "synthetic failure" } };
        }
        return { data: null, error: null };
      },
      from(table) {
        const query = { table };
        queries.push(query);
        return {
          select(fields) { query.fields = fields; return this; },
          eq(field, value) { query.filter = [field, value]; return this; },
          async maybeSingle() {
            return { data: fixture.missingAccount ? null : fixture.account, error: fixture.accountError ?? null };
          },
        };
      } },
    }),
  },
};
const output = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
} }).outputText;
const loaded = { exports: {} };
new Function("require", "module", "exports", output)((id) => mocks[id] ?? require(id), loaded, loaded.exports);
const page = loaded.exports.default;
const render = (search = {}) => page({ searchParams: Promise.resolve(search) });
function elements(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  return [node, ...elements(node.props?.children)];
}

test("management entry uses the existing owned account read and fails closed", async (t) => {
  for (const [name, role, status, extras, visible] of [
    ["active site admin", "platform_admin", "active", {}, true],
    ["member", "member", "active", {}, false],
    ["club chair without site role", "member", "active", { clubRole: "chair" }, false],
    ["course steward without site role", "member", "active", { courseRole: "steward" }, false],
    ["moderator", "platform_moderator", "active", {}, false],
    ["suspended admin", "platform_admin", "suspended", {}, false],
    ["withdrawn admin", "platform_admin", "withdrawn", {}, false],
    ["account error with stale data", "platform_admin", "active", { accountError: { message: "synthetic failure" } }, false],
    ["profile error does not hide site administration", "platform_admin", "active", { profileError: { message: "synthetic failure" } }, true],
    ["missing account", "platform_admin", "active", { missingAccount: true }, false],
  ]) await t.test(name, async () => {
    fixture = { account: { platform_role: role, account_status: status }, ...extras };
    queries = [];
    const tree = await render();
    const all = elements(tree);
    const dashboard = all.find((node) => node.type === Dashboard);
    assert.equal(dashboard?.props.platformAdmin === true, visible);
    assert.deepEqual(queries[0], { table: "user_accounts", fields: "account_status, platform_role", filter: ["id", "synthetic-viewer"] });
    assert.equal(queries[1].name, "get_my_posting_name");
    if (visible) {
      const boundary = all.find((node) => node.type === Boundary);
      assert.equal(boundary.props.viewerId, "synthetic-viewer");
      assert.ok(elements(boundary).includes(dashboard));
    }
  });
  await t.test("anonymous keeps the existing login redirect", async () => {
    fixture = { signedOut: true }; queries = [];
    await assert.rejects(render(), (error) => error.url === "/login?next=/my");
    await assert.rejects(render({ view: "settings", club: "test-club" }), (error) =>
      new URL(error.url, "https://local.test").searchParams.get("next") === "/my?club=test-club&view=settings");
    assert.equal(queries.length, 0);
  });
  await t.test("dashboard load failure is passed through instead of inventing counts", async () => {
    fixture = { account: { platform_role: "member", account_status: "active" }, dashboardError: true };
    queries = [];
    const dashboard = elements(await render()).find((node) => node.type === Dashboard);
    assert.equal(dashboard.props.dashboard, null);
  });
});
