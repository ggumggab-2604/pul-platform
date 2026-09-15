import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(import.meta.url);
const { NextRequest, NextResponse } = require("next/server");
const { unstable_doesMiddlewareMatch } = require("next/experimental/testing/server");
const { applyServerStorage } = require(path.join(path.dirname(require.resolve("@supabase/ssr")), "cookies.js"));
const cookieName = "sb-session-test-auth-token";
const cacheHeaders = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
  Expires: "0",
  Pragma: "no-cache",
};

// Load the real PUL helpers with isolated NODE_ENV and no Auth/network client.
function load(relative, mode = "production", imports = {}) {
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  const sandboxModule = { exports: {} };
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, {
    module: sandboxModule, exports: sandboxModule.exports, Headers,
    process: { env: { NODE_ENV: mode } },
    require(name) {
      if (name in imports) return imports[name];
      if (name === "next/server") return { NextRequest, NextResponse };
      if (name === "@/lib/supabase/cookieOptions") return load("src/lib/supabase/cookieOptions.ts", mode);
      if (name === "@/lib/supabase/env") {
        return { getSupabasePublicEnv: () => ({ url: "https://session.invalid", publishableKey: "public-test-only" }) };
      }
      throw new Error("Unexpected session dependency: " + name);
    },
  }, { filename: relative });
  return sandboxModule.exports;
}

async function writeSession(options, { name = cookieName, value = "synthetic-session", remove = false } = {}) {
  // Actual installed SSR serializer/defaults/cache headers, with synthetic data only.
  await applyServerStorage({
    getAll: options.cookies.getAll,
    setAll: options.cookies.setAll,
    setItems: remove ? {} : { [name]: value },
    removedItems: remove ? { [name]: true } : {},
  }, { cookieEncoding: "base64url", cookieOptions: options.cookieOptions });
}

async function runProxy({ mode = "production", route = "/my", refresh = true, onClaims, request } = {}) {
  let options;
  const input = request ?? new NextRequest((mode === "production" ? "https://session.invalid" : "http://localhost") + route);
  const { updateSession } = load("src/lib/supabase/proxy.ts", mode, {
    "@supabase/ssr": {
      createServerClient(_url, _key, config) {
        options = config;
        return { auth: { async getClaims() {
          if (onClaims) await onClaims(config);
          else if (refresh) await writeSession(config);
          return { data: { claims: null }, error: null };
        } } };
      },
    },
  });
  const response = await updateSession(input);
  return { request: input, response, options };
}

function assertNormal(response) {
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-middleware-next"), "1");
  assert.equal(response.headers.has("location"), false);
  assert.equal(response.headers.has("x-middleware-rewrite"), false);
}

function assertCache(response) {
  for (const [name, value] of Object.entries(cacheHeaders)) assert.equal(response.headers.get(name), value);
}

for (const route of ["/my", "/privacy", "/terms"]) {
  test("refresh preserves cookie and SSR cache headers on " + route, async () => {
    const { request, response } = await runProxy({ route });
    assertNormal(response);
    assert.ok(request.cookies.has(cookieName), "request receives the refreshed cookie");
    assert.ok(response.cookies.has(cookieName), "response receives the refreshed cookie");
    assert.ok(response.headers.has("set-cookie"), "Set-Cookie is emitted");
    assert.ok(response.headers.get("x-middleware-request-cookie")?.includes(cookieName), "rebuilt request override includes the refreshed cookie");
    const cookie = response.cookies.get(cookieName);
    assert.equal(cookie.path, "/");
    assert.equal(cookie.sameSite, "lax");
    assert.equal(cookie.httpOnly, false);
    assertCache(response);
  });
}

for (const mode of ["production", "development", "test"]) {
  test("browser/server/proxy share the " + mode + " Secure policy", async () => {
    let browserOptions, serverOptions;
    load("src/lib/supabase/client.ts", mode, {
      "@supabase/ssr": { createBrowserClient(_url, _key, options) { browserOptions = options; return {}; } },
    }).createClient();
    await load("src/lib/supabase/server.ts", mode, {
      "@supabase/ssr": { createServerClient(_url, _key, options) { serverOptions = options; return {}; } },
      "next/headers": { cookies: async () => ({ getAll: () => [], set() {} }) },
    }).createClient();
    const proxy = await runProxy({ mode });
    for (const options of [browserOptions, serverOptions, proxy.options]) {
      assert.equal(Boolean(options?.cookieOptions?.secure), mode === "production");
      assert.deepEqual(Object.keys(options?.cookieOptions ?? {}).filter(k => k !== "secure"), []);
      assert.equal(options?.cookieEncoding, undefined);
    }
    assert.equal(proxy.response.cookies.get(cookieName).secure === true, mode === "production");
    assertCache(proxy.response);
  });
}

test("no refresh keeps the existing public response without cache overrides", async () => {
  const request = new NextRequest("http://localhost/privacy", { headers: { "x-request-marker": "present" } });
  const { response } = await runProxy({ mode: "development", refresh: false, request });
  assertNormal(response);
  for (const name of Object.keys(cacheHeaders)) assert.equal(response.headers.has(name), false);
  assert.equal(response.headers.has("set-cookie"), false);
  assert.equal(response.headers.get("x-middleware-request-x-request-marker"), "present");
});

test("multiple setAll calls preserve earlier cookies and cache headers through each rebuild", async () => {
  const { request, response } = await runProxy({ onClaims: async options => {
    await writeSession(options);
    await options.cookies.setAll([{ name: "extra-session-chunk", value: "synthetic-only", options: { path: "/", sameSite: "lax", ...options.cookieOptions } }], {});
  } });
  for (const name of [cookieName, "extra-session-chunk"]) {
    assert.ok(request.cookies.has(name), "request retains each callback cookie");
    assert.ok(response.cookies.has(name), "response retains each callback cookie");
  }
  assertNormal(response);
  assertCache(response);
});

test("later supplied headers override earlier values without dropping other SSR headers", async () => {
  const { response } = await runProxy({ onClaims: async options => {
    await writeSession(options);
    await options.cookies.setAll([], { "cache-control": "private, no-store", Expires: "1" });
  } });
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.headers.get("Expires"), "1");
  assert.equal(response.headers.get("Pragma"), "no-cache");
  assert.ok(response.cookies.has(cookieName));
});

test("successive refreshes forward the latest cookie instead of stale request overrides", async () => {
  let expected;
  const { request, response } = await runProxy({ onClaims: async options => {
    await writeSession(options, { value: "synthetic-first" });
    const first = options.cookies.getAll().find(c => c.name === cookieName).value;
    await writeSession(options, { value: "synthetic-second" });
    expected = options.cookies.getAll().find(c => c.name === cookieName).value;
    assert.ok(expected !== first, "second refresh replaces the stored value");
  } });
  assert.ok(request.cookies.get(cookieName).value === expected, "request retains the latest value");
  assert.ok(response.cookies.get(cookieName).value === expected, "response retains the latest value");
  assert.ok(response.headers.get("x-middleware-request-cookie")?.includes(expected), "upstream request receives the latest value");
  assertCache(response);
});

test("cache headers and cookies remain isolated between requests", async () => {
  assertCache((await runProxy()).response);
  const { response } = await runProxy({ refresh: false });
  assert.equal(response.headers.has("Cache-Control"), false);
  assert.equal(response.headers.has("set-cookie"), false);
});

test("claim failures keep normal guest response semantics", async () => {
  const { response } = await runProxy({ onClaims: async () => { throw new Error("synthetic auth failure"); } });
  assertNormal(response);
  assert.equal(response.headers.has("set-cookie"), false);
  assert.equal(response.headers.has("Cache-Control"), false);
});

test("claim failure after refresh retains the supplied cookies and headers", async () => {
  const { response } = await runProxy({ onClaims: async options => {
    await writeSession(options);
    throw new Error("synthetic post-refresh failure");
  } });
  assertNormal(response);
  assert.ok(response.cookies.has(cookieName));
  assertCache(response);
});

test("server cookie adapter preserves reads, writes, defaults and logout deletion", async () => {
  const jar = new Map();
  let options;
  await load("src/lib/supabase/server.ts", "production", {
    "@supabase/ssr": { createServerClient(_url, _key, config) { options = config; return {}; } },
    "next/headers": { cookies: async () => ({
      getAll: () => [...jar.values()],
      set(name, value, attributes) { jar.set(name, { name, value, ...attributes }); },
    }) },
  }).createClient();
  await writeSession(options);
  assert.ok(options.cookies.getAll().some(c => c.name === cookieName));
  assert.equal(jar.get(cookieName).secure, true);
  assert.equal(jar.get(cookieName).path, "/");
  assert.equal(jar.get(cookieName).sameSite, "lax");
  assert.equal(jar.get(cookieName).httpOnly, false);
  await writeSession(options, { remove: true });
  assert.equal(jar.get(cookieName).maxAge, 0);
  assert.equal(jar.get(cookieName).secure, true);
});

test("read-only Server Component cookie stores remain supported", async () => {
  let options;
  await load("src/lib/supabase/server.ts", "development", {
    "@supabase/ssr": { createServerClient(_url, _key, config) { options = config; return {}; } },
    "next/headers": { cookies: async () => ({ getAll: () => [], set() { throw new Error("read-only cookie store"); } }) },
  }).createClient();
  await assert.doesNotReject(() => writeSession(options));
});

for (const kind of ["normal", "redirect", "rewrite"]) {
  test("Proxy entry preserves " + kind + " response delegation", async () => {
    const request = new NextRequest("https://session.invalid/my");
    const expected = kind === "normal" ? NextResponse.next() :
      kind === "redirect" ? NextResponse.redirect(new URL("/login", request.url)) :
      NextResponse.rewrite(new URL("/privacy", request.url));
    const entry = load("src/proxy.ts", "production", { "@/lib/supabase/proxy": { updateSession(input) {
      assert.equal(input, request);
      return expected;
    } } });
    assert.equal(await entry.proxy(request), expected);
  });
}

test("Proxy matcher retains public, auth and static asset behavior", () => {
  const { config } = load("src/proxy.ts", "production", { "@/lib/supabase/proxy": {} });
  for (const url of ["/privacy", "/terms", "/login", "/signup", "/my"]) {
    assert.equal(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url }), true);
  }
  for (const url of ["/_next/static/a.js", "/_next/image", "/favicon.ico", "/photo.webp"]) {
    assert.equal(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url }), false);
  }
});

test("shared browser cookie policy has no server-only or secret imports", () => {
  for (const relative of ["src/lib/supabase/client.ts", "src/lib/supabase/cookieOptions.ts"]) {
    const source = fs.readFileSync(path.join(root, relative), "utf8");
    assert.doesNotMatch(source, /server-only|next\/headers|SUPABASE_SERVICE_ROLE_KEY|node:/);
  }
});
