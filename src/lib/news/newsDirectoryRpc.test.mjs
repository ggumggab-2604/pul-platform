import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const foundation = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/20260829000100_pul_news_directory_foundation.sql", import.meta.url)),
  "utf8",
);
const correction = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/20260829000200_pul_news_publication_time_invariant_correction.sql", import.meta.url)),
  "utf8",
);

function docker(args, input) {
  return spawnSync("docker", args, { encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 });
}

function sql(text, user = "supabase_admin") {
  return docker([
    "exec", "-i", container, "psql", "-U", user, "-d", database,
    "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1",
  ], text);
}

function authenticated(actor, text) {
  return sql(`set request.jwt.claim.sub = '${actor}'; set role authenticated; ${text}`);
}

function json(result) {
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return JSON.parse(result.stdout.trim());
}

function payload(overrides = {}) {
  return JSON.stringify({
    category: "parkGolfNews",
    title: "TEST 파크골프 공식 소식",
    summary: "TEST 파크골프 공식 소식의 확인된 요약 내용입니다.",
    body: "TEST 파크골프 공식 소식의 확인된 본문 내용입니다. 공개 출처를 함께 확인합니다.",
    region: "전국",
    source_type: "officialNotice",
    source_name: "TEST 공식기관",
    source_url: "https://example.invalid/news",
    published_at: "2026-08-20T00:00:00Z",
    is_featured: false,
    ...overrides,
  });
}

const ids = { admin: randomUUID(), member: randomUUID(), suspendedAdmin: randomUUID() };
let container;
let database;

before(() => {
  const found = docker(["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"]).stdout
    .split(/\r?\n/).filter(Boolean);
  assert.equal(found.length, 1, "one local Supabase database container is required");
  container = found[0];
  database = `pul_news_${process.pid}_${Date.now()}`;
  const clone = docker([
    "exec", container, "sh", "-lc",
    [
      `createdb -U supabase_admin -O postgres ${database}`,
      `pg_dump -U supabase_admin -d postgres --schema-only | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
      `pg_dump -U supabase_admin -d postgres --data-only --disable-triggers | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
    ].join(" && "),
  ]);
  assert.equal(clone.status, 0, clone.stdout + clone.stderr);
  const exists = sql("select pg_catalog.to_regclass('public.news_articles') is not null;").stdout.trim();
  if (exists !== "t") {
    const applied = sql(`begin; ${foundation} ${correction} commit;`, "postgres");
    assert.equal(applied.status, 0, applied.stdout + applied.stderr);
  } else {
    const triggerExists = sql("select exists(select 1 from pg_catalog.pg_trigger where tgname='news_articles_enforce_publication_time' and not tgisinternal);").stdout.trim();
    if (triggerExists !== "t") {
      const applied = sql(`begin; ${correction} commit;`, "postgres");
      assert.equal(applied.status, 0, applied.stdout + applied.stderr);
    }
  }

  const authRows = Object.entries(ids).map(([alias, id]) =>
    `('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','news-${alias}@example.invalid','',now(),now(),now())`,
  ).join(",");
  const fixture = sql(
    `set session_replication_role=replica;
    insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values ${authRows};
    insert into public.user_accounts(id,account_status,platform_role) values
      ('${ids.admin}','active','platform_admin'),
      ('${ids.member}','active','member'),
      ('${ids.suspendedAdmin}','suspended','platform_admin');
    set session_replication_role=origin;
    insert into public.news_articles(
      news_key,category,title,summary,body,region,source_type,source_name,source_url,
      published_at,is_featured,publication_status,created_by,updated_by
    ) values
      ('news-new','parkGolfNews','TEST 최신 공식 소식','TEST 최신 공식 소식의 확인된 요약입니다.','TEST 최신 공식 소식의 확인된 본문 내용으로 충분한 길이를 제공합니다.','서울','officialNotice','TEST 서울시','https://example.invalid/new',now() - interval '1 day',true,'published','${ids.admin}','${ids.admin}'),
      ('news-old','noticeOperation','TEST 이전 운영 공지','TEST 이전 운영 공지의 확인된 요약입니다.','TEST 이전 운영 공지의 확인된 본문 내용으로 충분한 길이를 제공합니다.','전국','adminVerified',null,null,now() - interval '3 days',false,'published','${ids.admin}','${ids.admin}'),
      ('news-screen','screenParkGolf','TEST 스크린 오픈 소식','TEST 스크린 오픈 소식의 확인된 요약입니다.','TEST 스크린 오픈 소식의 확인된 본문 내용으로 충분한 길이를 제공합니다.','부산','brandPromotion','TEST 스크린 업체','https://example.invalid/screen',now() - interval '2 days',false,'published','${ids.admin}','${ids.admin}'),
      ('news-equipment','equipmentBrand','TEST 장비 출시 소식','TEST 장비 출시 소식의 확인된 요약입니다.','TEST 장비 출시 소식의 확인된 본문 내용으로 충분한 길이를 제공합니다.','전국','brandPromotion','TEST 장비 브랜드','https://example.invalid/equipment',now() - interval '2 hours',false,'published','${ids.admin}','${ids.admin}'),
      ('news-hidden','parkGolfNews','TEST 숨김 소식','TEST 숨김 소식의 비공개 요약 내용입니다.','TEST 숨김 소식의 비공개 본문 내용으로 충분한 길이를 제공합니다.','서울','adminVerified',null,null,now() - interval '1 hour',false,'hidden','${ids.admin}','${ids.admin}'),
      ('news-removed','parkGolfNews','TEST 제거 소식','TEST 제거 소식의 비공개 요약 내용입니다.','TEST 제거 소식의 비공개 본문 내용으로 충분한 길이를 제공합니다.','서울','adminVerified',null,null,now() - interval '1 hour',false,'removed','${ids.admin}','${ids.admin}'),
      ('news-future','parkGolfNews','TEST 미래 숨김 소식','TEST 미래 숨김 소식의 비공개 요약입니다.','TEST 미래 숨김 소식의 비공개 본문 내용으로 충분한 길이를 제공합니다.','서울','adminVerified',null,null,now() + interval '1 day',false,'hidden','${ids.admin}','${ids.admin}');`,
    "postgres",
  );
  assert.equal(fixture.status, 0, fixture.stdout + fixture.stderr);
});

after(() => {
  if (container && database) {
    assert.equal(docker(["exec", container, "dropdb", "--if-exists", "--force", "-U", "supabase_admin", database]).status, 0);
  }
});

test("public list is published-only, latest ordered, filtered, paginated, and privacy-safe", () => {
  const page = json(sql("set role anon; select public.list_public_news_articles(null,null,false,24,0);"));
  assert.equal(page.total, 4);
  assert.deepEqual(page.items.map((item) => item.news_key), ["news-equipment", "news-new", "news-screen", "news-old"]);
  assert.equal(json(sql("set role anon; select public.list_public_news_articles('screenParkGolf',null,false,24,0);")).items[0].news_key, "news-screen");
  assert.equal(json(sql("set role anon; select public.list_public_news_articles(null,'장비 출시',false,24,0);")).items[0].news_key, "news-equipment");
  const first = json(sql("set role anon; select public.list_public_news_articles(null,null,false,1,0);"));
  assert.equal(first.items.length, 1);
  assert.equal(first.has_more, true);
  for (const item of page.items) {
    for (const key of ["id", "created_by", "updated_by", "version", "publication_status", "email", "phone"]) {
      assert.equal(key in item, false);
    }
  }
});

test("featured, screen, equipment, and notice filters never mix categories", () => {
  const featured = json(sql("set role anon; select public.list_public_news_articles(null,null,true,24,0);"));
  assert.deepEqual(featured.items.map((item) => item.news_key), ["news-new"]);
  for (const [category, key] of [["screenParkGolf", "news-screen"], ["equipmentBrand", "news-equipment"], ["noticeOperation", "news-old"]]) {
    const page = json(sql(`set role anon; select public.list_public_news_articles('${category}',null,false,24,0);`));
    assert.equal(page.total, 1);
    assert.equal(page.items[0].news_key, key);
    assert.equal(page.items[0].category, category);
  }
});

test("stable detail exposes source but hides missing, hidden, removed, and future rows", () => {
  const article = json(sql("set role anon; select public.get_public_news_article('news-new');"));
  assert.equal(article.source_name, "TEST 서울시");
  assert.equal(article.source_url, "https://example.invalid/new");
  for (const key of ["missing", "news-hidden", "news-removed", "news-future"]) {
    const result = sql(`set role anon; select public.get_public_news_article('${key}');`);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /찾을 수 없습니다/);
  }
});

test("active platform admin can create, update, publish, hide, and remove with version checks", () => {
  assert.equal(json(authenticated(ids.admin, `select public.mutate_news_article('create','managed-news',null,$payload$${payload()}$payload$::jsonb);`)).publication_status, "hidden");
  assert.equal(json(authenticated(ids.admin, `select public.mutate_news_article('update','managed-news',1,$payload$${payload({ title: "TEST 수정된 공식 소식" })}$payload$::jsonb);`)).version, 2);
  assert.equal(json(authenticated(ids.admin, "select public.mutate_news_article('publish','managed-news',2,'{}'::jsonb);")).publication_status, "published");
  assert.equal(json(authenticated(ids.admin, "select public.mutate_news_article('hide','managed-news',3,'{}'::jsonb);")).publication_status, "hidden");
  assert.equal(json(authenticated(ids.admin, "select public.mutate_news_article('remove','managed-news',4,'{}'::jsonb);")).publication_status, "removed");
  const stale = authenticated(ids.admin, "select public.mutate_news_article('hide','news-new',999,'{}'::jsonb);");
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /변경되었습니다/);
  const future = authenticated(ids.admin, "select public.mutate_news_article('publish','news-future',1,'{}'::jsonb);");
  assert.notEqual(future.status, 0);
  assert.match(future.stderr, /현재 이하여야/);
  const scheduledUpdate = authenticated(
    ids.admin,
    `select public.mutate_news_article('update','news-new',1,$payload$${payload({ published_at: "2099-01-01T00:00:00Z" })}$payload$::jsonb);`,
  );
  assert.notEqual(scheduledUpdate.status, 0);
  assert.match(scheduledUpdate.stderr, /현재 이하여야/);
});

test("member, inactive admin, anon mutation, unsafe URL, and direct DML fail closed", () => {
  for (const actor of [ids.member, ids.suspendedAdmin]) {
    const denied = authenticated(actor, `select public.mutate_news_article('create','denied-${actor.slice(0, 8)}',null,$payload$${payload()}$payload$::jsonb);`);
    assert.notEqual(denied.status, 0);
    assert.match(denied.stderr, /권한/);
  }
  const anon = sql("set role anon; select public.mutate_news_article('hide','news-new',1,'{}'::jsonb);");
  assert.notEqual(anon.status, 0);
  assert.match(anon.stderr, /permission denied/i);
  const unsafe = authenticated(ids.admin, `select public.mutate_news_article('create','unsafe-news',null,$payload$${payload({ source_url: "javascript:alert(1)" })}$payload$::jsonb);`);
  assert.notEqual(unsafe.status, 0);
  assert.match(unsafe.stderr, /source_url_check|check constraint/i);
  const direct = authenticated(ids.admin, "update public.news_articles set title='직접 변경' where news_key='news-new';");
  assert.notEqual(direct.status, 0);
  assert.match(direct.stderr, /permission denied|row-level security/i);
});

test("management list is limited to active platform admins and excludes actor identity", () => {
  const page = json(authenticated(ids.admin, "select public.list_news_articles_for_management(null,null,null,30,0);"));
  assert.equal(page.total >= 7, true);
  assert.equal(page.items.some((item) => item.news_key === "news-hidden"), true);
  for (const item of page.items) {
    assert.equal("created_by" in item, false);
    assert.equal("updated_by" in item, false);
  }
  const denied = authenticated(ids.member, "select public.list_news_articles_for_management(null,null,null,30,0);");
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /권한/);
});
