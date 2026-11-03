import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const Link = () => null;
const Boundary = () => null;
const View = () => null;
const source = readFileSync(new URL("../../app/my/page.tsx", import.meta.url), "utf8");
let fixture;
let queries;
const mocks = {
  "next/link": { __esModule: true, default: Link },
  "next/navigation": { redirect: (url) => { throw Object.assign(new Error("redirect"), { url }); } },
  "@/components/account/MyActivityHub": { MyActivityHub: View },
  "@/components/account/ProfileForm": { ProfileForm: View },
  "@/components/auth/LogoutButton": { LogoutButton: View },
  "@/components/ui/Container": { Container: View },
  "@/components/interests/InterestList": { InterestList: View },
  "@/components/messaging/MessagingSessionBoundary": { MessagingSessionBoundary: Boundary },
  "lucide-react": { CircleUserRound: View, ShieldCheck: View, UserRoundCog: View },
  "@/lib/interests/interests": { listInterests: async () => null },
  "@/lib/my/myActivity": { fetchMyActivityOverview: async () => null },
  "@/lib/supabase/auth": {
    getAuthenticatedSupabaseContext: async () => fixture.signedOut ? null : ({
      userId: "synthetic-viewer",
      supabase: { from(table) {
        const query = { table };
        queries.push(query);
        return {
          select(fields) { query.fields = fields; return this; },
          eq(field, value) { query.filter = [field, value]; return this; },
          async maybeSingle() {
            return table === "user_accounts"
              ? { data: fixture.missingAccount ? null : fixture.account, error: fixture.accountError ?? null }
              : { data: { display_name: "합성 회원", nickname: "합성", profile_visibility: "private" }, error: fixture.profileError ?? null };
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
    ["profile error", "platform_admin", "active", { profileError: { message: "synthetic failure" } }, false],
    ["missing account", "platform_admin", "active", { missingAccount: true }, false],
  ]) await t.test(name, async () => {
    fixture = { account: { platform_role: role, account_status: status }, ...extras };
    queries = [];
    const tree = await page();
    const all = elements(tree);
    const links = all.filter((node) => node.type === Link && node.props.href === "/manage");
    assert.equal(links.length, visible ? 1 : 0);
    assert.equal(queries.length, 2, "no additional permission query");
    assert.deepEqual(queries[0], { table: "user_accounts", fields: "account_status, platform_role", filter: ["id", "synthetic-viewer"] });
    if (visible) {
      assert.equal(links[0].props.children, "운영 관리센터");
      assert.equal(links[0].props.prefetch, false);
      assert.match(links[0].props.className, /focus-visible:/);
      assert.doesNotMatch(links[0].props.className, /underline/);
      const boundary = all.find((node) => node.type === Boundary);
      assert.equal(boundary.props.viewerId, "synthetic-viewer");
      assert.ok(elements(boundary).includes(links[0]));
    }
  });
  await t.test("anonymous keeps the existing login redirect", async () => {
    fixture = { signedOut: true }; queries = [];
    await assert.rejects(page(), (error) => error.url === "/login?next=/my");
    assert.equal(queries.length, 0);
  });
});
