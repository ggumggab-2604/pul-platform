import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
function load(path, modules = {}) {
  const output = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  new Function("require", "exports", output)(name => modules[name] ?? require(name), exports);
  return exports;
}
const safeRedirect = load("lib/auth/safeRedirect.ts");
const grants = [
  { consent_type: "terms_required", consent_version: "terms-dev-v1", decision: "granted" },
  { consent_type: "privacy_required", consent_version: "privacy-dev-v1", decision: "granted" },
];
const signup = { mode: "signup", termsAccepted: true, privacyAccepted: true, nextPath: "/clubs?keyword=서울" };
const login = { mode: "login", termsAccepted: false, privacyAccepted: false };

function server(options = {}) {
  const calls = [], inserted = [];
  const supabase = {
    auth: { signOut: async arg => { calls.push(["signOut", arg]); return { error: options.signOutError }; } },
    from(table) {
      calls.push(["from", table]);
      return {
        select() { return this; },
        eq(...args) { calls.push(["eq", table, ...args]); return this; },
        in() { return this; },
        async maybeSingle() {
          return table === "user_accounts"
            ? { data: options.account === undefined ? { account_status: "active" } : options.account, error: options.accountError }
            : { data: options.profile === undefined ? { user_id: "session-user" } : options.profile, error: options.profileError };
        },
        then(resolve, reject) { return Promise.resolve({ data: options.consents ?? [], error: options.readError }).then(resolve, reject); },
        async insert(rows) { inserted.push(...rows); return { error: options.insertError }; },
      };
    },
  };
  const actions = load("app/auth/actions.ts", {
    "@/lib/auth/safeRedirect": safeRedirect,
    "@/lib/supabase/auth": { getAuthenticatedSupabaseContext: async () => {
      calls.push(["context"]);
      return options.anonymous ? null : { supabase, userId: "session-user" };
    } },
  });
  return { ...actions, calls, inserted };
}

test("signup rejects missing, partial and truthy non-boolean agreements before accessing Auth or DB", async () => {
  for (const field of ["termsAccepted", "privacyAccepted"]) {
    for (const value of [false, undefined, null, "true", "false", 1, {}, []]) {
      const s = server();
      assert.equal((await s.finalizeAuth({ ...signup, [field]: value })).errorKind, "consentRequired");
      assert.deepEqual(s.calls, []);
      assert.deepEqual(s.inserted, []);
    }
  }
});

test("unknown or missing auth mode cannot silently become login", async () => {
  for (const input of [null, undefined, {}, { ...signup, mode: "admin" }]) {
    const s = server();
    assert.equal((await s.finalizeAuth(input)).ok, false);
    assert.deepEqual(s.calls, []);
  }
});

test("agreed signup appends only existing required records using session identity and keeps redirect", async () => {
  const s = server();
  assert.deepEqual(await s.finalizeAuth({ ...signup, userId: "forged-user", consent_version: "forged" }), {
    ok: true, redirectTo: "/clubs?keyword=%EC%84%9C%EC%9A%B8",
  });
  assert.deepEqual(s.inserted, grants);
  assert.ok(s.calls.some(c => JSON.stringify(c) === JSON.stringify(["eq", "consent_records", "user_id", "session-user"])));
});

test("repeated signup reuses complete records and fills only missing required agreement", async () => {
  const complete = server({ consents: grants });
  assert.equal((await complete.finalizeAuth(signup)).ok, true);
  assert.deepEqual(complete.inserted, []);
  const partial = server({ consents: [grants[0]] });
  assert.equal((await partial.finalizeAuth(signup)).ok, true);
  assert.deepEqual(partial.inserted, [grants[1]]);
});

test("established login does not require signup checkboxes or rewrite consent", async () => {
  const s = server({ consents: grants });
  assert.deepEqual(await s.finalizeAuth(login), { ok: true, redirectTo: "/my" });
  assert.deepEqual(s.inserted, []);
});

test("login mode cannot bypass absent, partial, wrong-version or non-granted agreements", async () => {
  for (const consents of [[], [grants[0]], grants.map(g => ({ ...g, consent_version: "other" })), grants.map(g => ({ ...g, decision: "withdrawn" }))]) {
    const s = server({ consents });
    assert.equal((await s.finalizeAuth({ ...login, termsAccepted: true, privacyAccepted: true })).errorKind, "consentRequired");
    assert.deepEqual(s.inserted, []);
    assert.ok(s.calls.some(c => c[0] === "signOut"));
  }
});

test("missing identity, failed foundation and inactive accounts cannot complete signup", async () => {
  for (const [options, expected] of [
    [{ anonymous: true }, "unauthenticated"], [{ account: null }, "foundationMissing"],
    [{ profile: null }, "foundationMissing"], [{ profileError: {} }, "foundationMissing"],
    [{ account: { account_status: "suspended" } }, "accountUnavailable"],
    [{ account: { account_status: "withdrawn" } }, "accountUnavailable"],
  ]) {
    const s = server(options);
    assert.equal((await s.finalizeAuth(signup)).errorKind, expected);
    assert.deepEqual(s.inserted, []);
    if (!options.anonymous) assert.ok(s.calls.some(c => c[0] === "signOut"));
  }
});

test("consent read/write failures sign out and do not return a successful redirect or raw error", async () => {
  for (const options of [{ readError: { message: "PRIVATE_DATABASE_ERROR" } }, { insertError: { message: "PRIVATE_DATABASE_ERROR" } }]) {
    const s = server(options);
    const result = await s.finalizeAuth(signup);
    assert.equal(result.errorKind, "consentFailed");
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_DATABASE_ERROR|redirectTo/);
    assert.ok(s.calls.some(c => c[0] === "signOut"));
  }
});

test("safe redirect regression rejects external, encoded and auth-loop targets", async () => {
  for (const nextPath of ["https://example.invalid", "//example.invalid", "/%2fexample.invalid", "/\\example.invalid", "/login", "/signup", "%", "\n//bad"]) {
    assert.equal((await server({ consents: grants }).finalizeAuth({ ...login, nextPath })).redirectTo, "/my");
  }
});

test("logout retains anonymous, success and failure behavior", async () => {
  assert.deepEqual(await server({ anonymous: true }).logout(), { ok: true });
  assert.deepEqual(await server().logout(), { ok: true });
  assert.equal((await server({ signOutError: {} }).logout()).ok, false);
});

function walk(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(walk);
  return [node, ...walk(node.props?.children)];
}
const uiModules = {
  "@/components/ui/Container": { Container: ({ children, ...props }) => React.createElement("div", props, children) },
  "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) },
};
function ui(mode = "signup", options = {}) {
  const calls = [];
  const s = server(options);
  let state;
  const component = load("components/auth/EmailOtpAuth.tsx", {
    ...uiModules,
    react: { ...React, useEffect() {}, useMemo: fn => fn(), useReducer(reducer, arg, init) {
      state ??= init(arg);
      return [state, action => { state = reducer(state, action); }];
    } },
    "next/navigation": { useRouter: () => ({ replace: path => calls.push(["replace", path]), refresh: () => calls.push(["refresh"]) }) },
    "@/app/auth/actions": { finalizeAuth: s.finalizeAuth },
    "@/lib/supabase/client": { createClient: () => ({ auth: {
      signInWithOtp: async input => { calls.push(["request", input]); return { error: options.requestError }; },
      verifyOtp: async input => { calls.push(["verify", input]); return { error: options.verifyError }; },
      signOut: async () => { calls.push(["signOut"]); return {}; },
    } }) },
  }).EmailOtpAuth;
  const render = () => component({ mode, nextPath: "/my" });
  const nodes = type => walk(render()).filter(n => n.type === type);
  return {
    calls, s, render, nodes,
    email(value) { nodes("input").find(n => n.props.type === "email").props.onChange({ target: { value } }); },
    agree(index, checked) { nodes("input").filter(n => n.props.type === "checkbox")[index].props.onChange({ target: { checked } }); },
    token(value) { nodes("input").find(n => n.props.autoComplete === "one-time-code").props.onChange({ target: { value } }); },
    async submit() { nodes("form")[0].props.onSubmit({ preventDefault() {} }); await new Promise(setImmediate); },
  };
}

test("actual signup form has two required checkboxes and document links outside labels", () => {
  const u = ui();
  const boxes = u.nodes("input").filter(n => n.props.type === "checkbox");
  assert.equal(boxes.length, 3);
  assert.equal(boxes.filter(n => n.props.required).length, 2);
  assert.ok(boxes.every(n => n.props.checked === false));
  const html = renderToStaticMarkup(u.render());
  assert.match(html, /href="\/terms"/);
  assert.match(html, /href="\/privacy#signup-consent"/);
  assert.equal((html.match(/target="_blank"/g) ?? []).length, 2);
  assert.match(html, /계정 식별·로그인/);
  assert.doesNotMatch(html, /개발용 동의|발송에만|type="password"|마케팅/);
  for (const label of u.nodes("label")) assert.equal(walk(label).filter(n => n.props?.href).length, 0);
});

test("actual submit handler blocks absent/partial consent even when disabled button is bypassed", async () => {
  const u = ui();
  u.email("member@example.invalid");
  for (const agree of [() => {}, () => u.agree(1, true), () => { u.agree(1, false); u.agree(2, true); }]) {
    agree();
    assert.equal(u.nodes("button").find(n => n.props.type === "submit").props.disabled, true);
    await u.submit();
    assert.equal(u.calls.length, 0);
  }
});

test("agreed signup preserves OTP request, verification, consent persistence and final redirect", async () => {
  const u = ui();
  u.email("  member@example.invalid  "); u.agree(0, true);
  assert.equal(u.nodes("button").find(n => n.props.type === "submit").props.disabled, false);
  await u.submit();
  assert.deepEqual(u.calls[0], ["request", { email: "member@example.invalid", options: { shouldCreateUser: true } }]);
  u.token("123456"); await u.submit();
  assert.deepEqual(u.calls[1], ["verify", { email: "member@example.invalid", token: "123456", type: "email" }]);
  assert.deepEqual(u.s.inserted, grants);
  assert.deepEqual(u.calls.at(-1), ["replace", "/my"]);
});

test("login uses existing-user OTP and existing agreements without signup checkboxes", async () => {
  const u = ui("login", { consents: grants });
  assert.equal(u.nodes("input").filter(n => n.props.type === "checkbox").length, 0);
  u.email("member@example.invalid"); await u.submit(); u.token("123456"); await u.submit();
  assert.equal(u.calls[0][1].options.shouldCreateUser, false);
  assert.deepEqual(u.calls.at(-1), ["replace", "/my"]);
  assert.deepEqual(u.s.inserted, []);
});

test("OTP delivery/verification and consent-save failures keep retry UI without completing signup", async () => {
  for (const options of [{ requestError: { status: 429 } }, { verifyError: { code: "otp_expired" } }, { insertError: {} }]) {
    const u = ui("signup", options);
    u.email("member@example.invalid"); u.agree(0, true); await u.submit();
    if (!options.requestError) { u.token("123456"); await u.submit(); }
    assert.equal(u.calls.some(c => c[0] === "replace"), false);
    assert.match(renderToStaticMarkup(u.render()), /role="alert"/);
    if (options.insertError) assert.ok(u.calls.some(c => c[0] === "signOut"));
  }
});

test("signup/login routes preserve the selected mode and a scalar next path", async () => {
  for (const mode of ["signup", "login"]) {
    const marker = () => null;
    const page = load(`app/${mode}/page.tsx`, { "@/components/auth/EmailOtpAuth": { EmailOtpAuth: marker } }).default;
    const element = await page({ searchParams: Promise.resolve({ next: "/courses" }) });
    assert.equal(element.type, marker);
    assert.deepEqual(element.props, { mode, nextPath: "/courses" });
    assert.equal((await page({ searchParams: Promise.resolve({ next: ["/courses", "/my"] }) })).props.nextPath, undefined);
  }
});

test("profile update regression keeps optional names scoped to the active session account", async () => {
  const updates = [], scopes = [], revalidated = [];
  const updateProfile = load("app/my/actions.ts", {
    "next/cache": { revalidatePath: path => revalidated.push(path) },
    "@/lib/supabase/auth": { getAuthenticatedSupabaseContext: async () => ({
      userId: "session-user",
      supabase: { from(table) { return {
        select() { return this; },
        eq(key, value) { scopes.push([table, key, value]); return this; },
        async maybeSingle() { return { data: { account_status: "active" } }; },
        update(value) { updates.push(value); return this; },
        then(resolve, reject) { return Promise.resolve({ error: null }).then(resolve, reject); },
      }; } },
    }) },
  }).updateProfile;
  const form = new FormData();
  form.set("display_name", "  표시 이름  "); form.set("nickname", ""); form.set("profile_visibility", "private");
  form.set("user_id", "forged-user");
  assert.equal((await updateProfile({}, form)).status, "success");
  assert.deepEqual(updates, [{ display_name: "표시 이름", nickname: null, profile_visibility: "private" }]);
  assert.deepEqual(scopes, [["user_accounts", "id", "session-user"], ["user_profiles", "user_id", "session-user"]]);
  assert.deepEqual(revalidated, ["/my"]);
});

test("Auth foundation still creates default profiles without copying signup metadata or email", () => {
  const sql = read("../supabase/migrations/20260714000100_pul_auth_user_foundation.sql");
  const trigger = sql.slice(sql.indexOf("create function private.handle_new_auth_user()"), sql.indexOf("comment on function private.handle_new_auth_user()"));
  for (const table of ["user_accounts", "user_profiles", "user_private_contacts"]) assert.ok(trigger.includes(`insert into public.${table}`));
  assert.match(trigger, /values \(new.id\)/);
  assert.doesNotMatch(trigger, /raw_user_meta_data|new.email|new.phone/);
});

test("both document routes render anonymously and privacy separates signup consent from optional profiles", () => {
  const htmlByPage = {};
  for (const name of ["terms", "privacy"]) {
    const page = load(`app/${name}/page.tsx`, uiModules).default;
    const html = renderToStaticMarkup(React.createElement(page));
    htmlByPage[name] = html;
    assert.match(html, /<h1/);
    assert.match(html, /href="\/signup"/);
    assert.doesNotMatch(html, /dangerouslySetInnerHTML|help@pul|1234-5678/);
    assert.match(html, /운영 주체: PUL 운영자/);
    assert.deepEqual([...html.matchAll(/href="mailto:([^"]+)"/g)].map(match => match[1]), ["pulpark.help@gmail.com"]);
    assert.doesNotMatch(html, /검토 중|미확정|TBD|확인 후 명시|안내가 완료되지|확정되지|주식회사|사업자등록번호|법인명/);
  }
  assert.match(htmlByPage.terms, /href="\/privacy"/);
  assert.match(htmlByPage.privacy, /href="\/terms"/);
  assert.match(htmlByPage.privacy, /id="signup-consent"/);
  for (const term of ["이메일", "일회용 인증번호", "계정 식별", "동의 종류·버전·결정·기록 시각", "보유 및 이용 기간", "동의 거부", "선택적으로", "인증 쿠키"]) assert.ok(htmlByPage.privacy.includes(term));
  const profileSection = htmlByPage.privacy.match(/<section><h2[^>]*>2\.[\s\S]*?<\/section>/)?.[0];
  assert.ok(profileSection, "privacy must explain optional profiles and public activity");
  const profileText = profileSection.replace(/<[^>]+>/g, " ");
  assert.match(profileText, /프로필\s*전체[^.]*공개[^.]*아닙/);
  assert.match(profileText, /전체\s*공개[^.]*설정[^.]*커뮤니티[^.]*중고장터[^.]*공개\s*활동/);
  assert.match(profileText, /닉네임[^.]*표시\s*이름[^.]*비회원[^.]*표시될\s*수/);
  assert.match(profileText, /이메일[^.]*인증번호[^.]*작성자[^.]*포함되지/);
  assert.doesNotMatch(profileText, /공개\s*범위[^.]*향후|프로필[^.]*본인만/);
  assert.match(htmlByPage.privacy, /비밀번호·이름·닉네임·지역·전화번호는 회원가입 때 요구하지 않습니다/);
  for (const text of ["서비스 운영", "계정 이메일과 계정 정보는 회원 이용 기간 동안 보유", "가입 동의 기록은 가입 및 동의 사실 확인", "선택 프로필은 이용 기간 동안 보유", "계정 삭제 또는 탈퇴 처리 후", "보유할 필요성과 법적 보존 의무가 없으면 삭제", "해당 기간 동안 필요한 정보를 별도 보관"]) assert.ok(htmlByPage.privacy.includes(text));
  assert.doesNotMatch(htmlByPage.privacy, /(?:3|5|삼|오)년|영구\s*보[유존]|자동.{0,5}삭제합니다/);
});

test("Footer replaces document placeholders with the two real public routes", () => {
  const data = load("data/homeData.ts");
  const Footer = load("components/layout/Footer.tsx", { ...uiModules, "@/data/homeData": data }).Footer;
  const html = renderToStaticMarkup(React.createElement(Footer));
  assert.match(html, /href="\/terms"/);
  assert.match(html, /href="\/privacy"/);
  assert.doesNotMatch(html, /이용약관 준비 중|개인정보처리방침 준비 중/);
  assert.doesNotMatch(html, /고객지원 준비 중/);
  assert.deepEqual([...html.matchAll(/href="mailto:([^"]+)"/g)].map(match => match[1]), ["pulpark.help@gmail.com"]);
});
