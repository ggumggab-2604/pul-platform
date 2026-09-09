import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
function load(path, modules = {}) {
  const output = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  new Function("require", "exports", output)((name) => modules[name] ?? require(name), exports);
  return exports;
}
const directories = {
  "@/lib/courses/courseDirectory": load("lib/courses/courseDirectory.ts"),
  "@/lib/clubs/clubDirectory": load("lib/clubs/clubDirectory.ts"),
  "@/lib/news/newsDirectory": load("lib/news/newsDirectory.ts"),
};
const search = load("lib/search/publicSearch.ts", directories);
const form = load("components/layout/PublicSearchForm.tsx", {
  "@/components/ui/Icon": { Icon: () => createElement("span", { "aria-hidden": true }) },
});
const ui = {
  "@/components/layout/PublicSearchForm": form,
  "@/components/ui/Container": { Container: ({ children, ...props }) => createElement("div", props, children) },
  "next/link": { default: ({ children, ...props }) => createElement("a", props, children) },
};
function page(createClient) {
  return load("app/search/page.tsx", {
    ...ui,
    "@/lib/search/publicSearch": search,
    "@/lib/supabase/server": { createClient },
    "next/navigation": { redirect: (href) => { throw new Error(`REDIRECT:${href}`); } },
  }).default;
}
const course = {
  course_key: "course-test", name: "골프장 검색 단위 테스트", course_type: "field", region: "서울", city: "마포구",
  address: "테스트 주소", holes: 18, operating_hours: null, operation_code: "walkIn", phone: "PRIVATE_PHONE",
  parking_available: null, feature_codes: [], description: "PRIVATE_DESCRIPTION", reservation_url: null,
  reservation_guide: null, fee_guide: null, latitude: null, longitude: null,
};
const club = {
  public_key: "club-test", name: "동호회 검색 단위 테스트", region: "서울", district: "마포구", region_label: "서울 마포구",
  summary: "PRIVATE_SUMMARY", recruitment_status: "recruiting", created_at: "2026-09-01T00:00:00Z",
};
const news = {
  news_key: "news-test", title: "뉴스 검색 단위 테스트", category: "parkGolfNews", summary: "PRIVATE_SUMMARY",
  body: "PRIVATE_BODY", region: "서울", source_type: "officialNotice", source_name: null, source_url: null,
  published_at: "2026-09-01T00:00:00Z", is_featured: false,
};
const rows = { list_public_courses: course, list_public_clubs: club, list_public_news_articles: news };
const response = (items = [], total = items.length) => ({ items, total, limit: 5, offset: 0, has_more: total > 5 });
const emptyClient = { rpc: async () => ({ data: response(), error: null }) };

test("calls only the three existing public keyword RPCs with bounded pages and projects minimal result fields", async () => {
  const calls = [];
  const client = { rpc: async (name, args) => { calls.push([name, args]); return { data: response([rows[name]], 12), error: null }; } };
  const sections = await search.searchPublicDirectories(client, "  서울 & 공원  ");
  assert.deepEqual(calls.map(([name]) => name), Object.keys(rows));
  for (const [, args] of calls) {
    assert.equal(args.p_keyword, "서울 & 공원");
    assert.equal(args.p_limit, 5);
    assert.equal(args.p_offset, 0);
  }
  assert.deepEqual(sections.map((s) => s.items[0].href), ["/courses/course-test", "/clubs/club-test", "/news/news-test"]);
  assert.deepEqual(sections.map((s) => s.href), ["/courses?q=", "/clubs?keyword=", "/news?keyword="].map((p) => p + encodeURIComponent("서울 & 공원")));
  for (const section of sections) {
    assert.equal(section.total, 12);
    assert.deepEqual(Object.keys(section.items[0]).sort(), ["href", "region", "title"]);
  }
  assert.doesNotMatch(JSON.stringify(sections), /PRIVATE_|phone|body|summary|canEdit|user_id/);
});

test("empty, whitespace-only, and overlong searches perform zero RPC calls", async () => {
  const client = { rpc: () => assert.fail("must not search") };
  for (const q of ["", " \t\n　", "가".repeat(101)]) {
    assert.deepEqual(await search.searchPublicDirectories(client, q), []);
  }
});

test("one RPC failure is isolated from successful sections and raw errors are not returned", async () => {
  const sections = await search.searchPublicDirectories({ rpc: async (name) => {
    if (name === "list_public_clubs") throw new Error("PRIVATE_DATABASE_ERROR");
    return { data: response([rows[name]]), error: null };
  } }, "서울");
  assert.deepEqual(sections.map((s) => s.failed), [false, true, false]);
  assert.equal(sections[0].items.length, 1);
  assert.doesNotMatch(JSON.stringify(sections), /PRIVATE_DATABASE_ERROR/);
});

test("an expanded internal DTO fails closed through the reused directory parser", async () => {
  const sections = await search.searchPublicDirectories({ rpc: async (name) => ({
    data: response([{ ...rows[name], internal_email: "PRIVATE_EMAIL" }]), error: null,
  }) }, "서울");
  assert.ok(sections.every((s) => s.failed && s.items.length === 0));
  assert.doesNotMatch(JSON.stringify(sections), /PRIVATE_EMAIL/);
});

test("desktop and mobile forms use native GET, named required input, accessible submit and query default", () => {
  for (const compact of [false, true]) {
    const html = renderToStaticMarkup(createElement(form.PublicSearchForm, { compact, query: "서울 & 공원" }));
    assert.match(html, /action="\/search"/);
    assert.match(html, /method="get"/);
    assert.match(html, /role="search"/);
    assert.match(html, /name="q"/);
    assert.match(html, /required=""/);
    assert.match(html, /maxLength="100"/);
    assert.match(html, /value="서울 &amp; 공원"/);
    assert.match(html, /<button[^>]*type="submit"[^>]*aria-label="검색"/);
  }
});

test("both shared Header variants render working forms and retain logo/auth navigation", () => {
  const header = load("components/layout/Header.tsx", {
    ...ui, "@/components/auth/HeaderAuthActions": { HeaderAuthActions: ({ variant }) => createElement("a", { href: "/login" }, variant) },
  });
  const html = renderToStaticMarkup(createElement(header.Header));
  assert.equal((html.match(/<form /g) ?? []).length, 2);
  assert.equal((html.match(/href="\/"/g) ?? []).length, 2);
  assert.equal((html.match(/href="\/login"/g) ?? []).length, 2);
});

test("route canonicalizes whitespace before creating a client, including whitespace-only input", async () => {
  const render = page(() => assert.fail("client must not be created"));
  for (const [q, target] of [["  서울 & 공원  ", `/search?q=${encodeURIComponent("서울 & 공원")}`], ["　 ", "/search"]]) {
    await assert.rejects(() => render({ searchParams: Promise.resolve({ q }) }), { message: `REDIRECT:${target}` });
  }
});

test("missing/empty/overlong route queries do not create a client", async () => {
  const render = page(() => assert.fail("client must not be created"));
  for (const q of [undefined, "", "가".repeat(101)]) {
    const html = renderToStaticMarkup(await render({ searchParams: Promise.resolve({ q }) }));
    assert.match(html, q?.length ? /100자 이하/ : /검색어를 입력해 주세요/);
  }
});

test("route preserves URL query, renders real adapter results, source links and escapes markup", async () => {
  const render = page(async () => ({ rpc: async (name) => ({ data: response([rows[name]]), error: null }) }));
  const html = renderToStaticMarkup(await render({ searchParams: Promise.resolve({ q: ["<script>서울</script>", "ignored"] }) }));
  assert.match(html, /&lt;script&gt;서울&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>|PRIVATE_|ignored/);
  for (const href of ["/courses/course-test", "/clubs/club-test", "/news/news-test"]) assert.ok(html.includes(`href="${href}"`));
  assert.match(html, /골프장·공개 동호회·뉴스를 검색합니다/);
});

test("zero results and backend failure are distinct, and private error text never renders", async () => {
  const empty = renderToStaticMarkup(await page(async () => emptyClient)({ searchParams: Promise.resolve({ q: "없는검색어" }) }));
  assert.match(empty, /검색 결과가 없습니다. 다른 검색어/);
  const failed = renderToStaticMarkup(await page(async () => ({ rpc: async () => { throw Error("PRIVATE_ERROR"); } }))({ searchParams: Promise.resolve({ q: "서울" }) }));
  assert.equal((failed.match(/role="alert"/g) ?? []).length, 3);
  assert.doesNotMatch(failed, /검색 결과가 없습니다|0건|PRIVATE_ERROR/);
  const unavailable = renderToStaticMarkup(await page(async () => { throw Error("PRIVATE_ENV"); })({ searchParams: Promise.resolve({ q: "서울" }) }));
  assert.match(unavailable, /role="alert"/);
  assert.doesNotMatch(unavailable, /PRIVATE_ENV/);
});
