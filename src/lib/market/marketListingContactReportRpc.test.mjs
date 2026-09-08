import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { getMarketListing, getMarketStartupPost, listMarketBuyRequests, listMarketListings, listMarketStartupPosts } from "./market.ts";

const migration = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/20260928000100_pul_market_listing_contact_report_foundation.sql", import.meta.url)),
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

function asyncAuthenticated(actor, text) {
  return new Promise((resolve) => {
    const child = spawn("docker", [
      "exec", "-i", container, "psql", "-U", "supabase_admin", "-d", database,
      "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1",
    ], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(`set request.jwt.claim.sub = '${actor}'; set role authenticated; ${text}`);
  });
}

function json(result) {
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return JSON.parse(result.stdout.trim());
}

const ids = {
  seller: randomUUID(), reporter: randomUUID(), reporterDelete: randomUUID(),
  member: randomUUID(), suspended: randomUUID(), withdrawn: randomUUID(),
  admin: randomUUID(), resolverDelete: randomUUID(),
};
let container;
let database;
let phoneListing;
let smsListing;
let urlListing;
let handledReportKey;

function contactPayload(method, value, title = "TEST 파크골프채") {
  return `'${JSON.stringify({
    title, category: "club", price: 120000, region: "서울", condition: "lightUse",
    trade_type: "direct", description: "TEST 정상 상품 설명입니다.",
    public_contact_method: method, public_contact_value: value, public_contact_consent: true,
  }).replaceAll("'", "''")}'::jsonb`;
}

function createListing(method, value, title) {
  return json(authenticated(ids.seller,
    `select public.mutate_market_listing('create',null,null,${contactPayload(method, value, title)},'${randomUUID()}');`,
  ));
}

function dtoClient(data) {
  return {
    rpc: async () => ({ data, error: null }),
    storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "https://example.invalid/test" } }) }) },
  };
}

const publicFilters = { keyword: "", category: "all", region: "전체", saleStatus: "all" };

before(() => {
  const found = docker(["ps", "--filter", "name=^supabase_db_pul-platform$", "--format", "{{.Names}}"])
    .stdout.split(/\r?\n/).filter(Boolean);
  assert.deepEqual(found, ["supabase_db_pul-platform"], "the pul-platform local Supabase database container is required");
  container = found[0];
  database = `pul_market_contact_report_${process.pid}_${Date.now()}`;
  const clone = docker(["exec", container, "sh", "-lc", [
    `createdb -U supabase_admin -O postgres ${database}`,
    `pg_dump -U supabase_admin -d postgres --schema-only | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
    `pg_dump -U supabase_admin -d postgres --data-only --disable-triggers | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
  ].join(" && ")]);
  assert.equal(clone.status, 0, clone.stdout + clone.stderr);

  const exists = sql("select pg_catalog.to_regclass('public.market_listing_reports') is not null;", "postgres");
  assert.equal(exists.status, 0, exists.stdout + exists.stderr);
  if (exists.stdout.trim() !== "t") {
    const applied = sql(`begin; ${migration} commit;`, "postgres");
    assert.equal(applied.status, 0, applied.stdout + applied.stderr);
  }

  const authRows = Object.entries(ids).map(([alias, id]) =>
    `('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','market-contact-${alias}@example.invalid','',now(),now(),now())`,
  ).join(",");
  const accounts = [
    [ids.seller, "active", "member"], [ids.reporter, "active", "member"],
    [ids.reporterDelete, "active", "member"], [ids.member, "active", "member"],
    [ids.suspended, "suspended", "member"], [ids.withdrawn, "withdrawn", "member"],
    [ids.admin, "active", "platform_admin"], [ids.resolverDelete, "active", "platform_admin"],
  ].map(([id, status, role]) => `('${id}','${status}','${role}')`).join(",");
  const fixture = sql(`set session_replication_role=replica;
    insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values ${authRows};
    insert into public.user_accounts(id,account_status,platform_role) values ${accounts};
    insert into public.user_profiles(user_id,nickname,profile_visibility) values
      ('${ids.seller}','TEST 판매자','public'),('${ids.reporter}','TEST 신고자','private');
    set session_replication_role=origin;`, "postgres");
  assert.equal(fixture.status, 0, fixture.stdout + fixture.stderr);
});

after(() => {
  if (container && database) {
    assert.equal(docker(["exec", container, "dropdb", "--if-exists", "--force", "-U", "supabase_admin", database]).status, 0);
  }
});

test("contact create/edit validates canonical phone, SMS, HTTPS, consent, and partial fields", () => {
  phoneListing = createListing("phone", "010-1234-5678", "TEST 전화 판매글");
  smsListing = createListing("sms", "+82 10 2222 3333", "TEST 문자 판매글");
  urlListing = createListing("external_url", "https://example.com/contact", "TEST 링크 판매글");
  const values = sql(`select pg_catalog.string_agg(public_contact_method||':'||public_contact_value,',' order by title)
    from public.market_listings where id in ('${phoneListing.listing_id}','${smsListing.listing_id}','${urlListing.listing_id}');`, "postgres");
  assert.equal(values.status, 0, values.stdout + values.stderr);
  assert.match(values.stdout, /phone:01012345678/);
  assert.match(values.stdout, /sms:821022223333/);
  assert.match(values.stdout, /external_url:https:\/\/example\.com\/contact/);

  for (const payload of [
    `'${JSON.stringify({ title: "TEST 실패", category: "club", price: 1, region: "서울", condition: "lightUse", trade_type: "direct", description: "TEST 정상 상품 설명입니다.", public_contact_method: "phone", public_contact_value: "123", public_contact_consent: true })}'::jsonb`,
    `'${JSON.stringify({ title: "TEST 실패", category: "club", price: 1, region: "서울", condition: "lightUse", trade_type: "direct", description: "TEST 정상 상품 설명입니다.", public_contact_method: "external_url", public_contact_value: "http://example.com", public_contact_consent: true })}'::jsonb`,
    `'${JSON.stringify({ title: "TEST 실패", category: "club", price: 1, region: "서울", condition: "lightUse", trade_type: "direct", description: "TEST 정상 상품 설명입니다.", public_contact_method: "phone", public_contact_value: "01012345678", public_contact_consent: false })}'::jsonb`,
  ]) {
    const denied = authenticated(ids.seller, `select public.mutate_market_listing('create',null,null,${payload},'${randomUUID()}');`);
    assert.notEqual(denied.status, 0);
  }
  const partial = sql(`insert into public.market_listings(seller_user_id,title,category_code,price_amount,region_code,condition_code,trade_type_code,description,public_contact_method)
    values ('${ids.seller}','TEST 부분 연락처','club',1,'서울','lightUse','direct','TEST 정상 상품 설명입니다.','phone');`, "postgres");
  assert.notEqual(partial.status, 0);

  const edited = json(authenticated(ids.seller,
    `select public.mutate_market_listing('update','${phoneListing.listing_id}',1,${contactPayload("sms", "010-9999-8888", "TEST 전화 판매글 수정")},'${randomUUID()}');`,
  ));
  assert.equal(edited.version, 2);
  assert.equal(sql(`select public_contact_method||':'||public_contact_value from public.market_listings where id='${phoneListing.listing_id}';`, "postgres").stdout.trim(), "sms:01099998888");
});

test("public list never returns contact and detail hides it for sold or removed listings", () => {
  const page = json(sql("set role anon; select public.list_market_listings(null,null,null,null,24,0);"));
  const row = page.items.find((item) => item.id === smsListing.listing_id);
  assert.ok(row);
  assert.equal("public_contact_method" in row, false);
  assert.equal("public_contact_value" in row, false);
  const detail = json(sql(`set role anon; select public.get_market_listing('${smsListing.listing_id}');`));
  assert.equal(detail.public_contact_method, "sms");
  assert.equal(detail.public_contact_value, "821022223333");

  const reserved = json(authenticated(ids.seller, `select public.mutate_market_listing('reserve','${smsListing.listing_id}',1,'{}','${randomUUID()}');`));
  const sold = json(authenticated(ids.seller, `select public.mutate_market_listing('sell','${smsListing.listing_id}',${reserved.version},'{}','${randomUUID()}');`));
  assert.equal(sold.sale_status, "sold");
  const soldDetail = json(sql(`set role anon; select public.get_market_listing('${smsListing.listing_id}');`));
  assert.equal(soldDetail.public_contact_method, null);
  assert.equal(soldDetail.public_contact_value, null);
});

test("audit and request ledger never store raw contact values", () => {
  const leaked = sql(`select
      count(*) filter (where coalesce(before_data::text,'') like '%01012345678%' or after_data::text like '%01012345678%'),
      (select count(*) from private.market_mutation_requests where coalesce(result_data::text,'') like '%01012345678%' or request_fingerprint like '%01012345678%')
    from private.market_audit_log;`, "postgres");
  assert.equal(leaked.status, 0, leaked.stdout + leaked.stderr);
  assert.equal(leaked.stdout.trim(), "0|0");
});

test("report submission enforces actor, self, validation, replay, conflict, and one pending report", () => {
  const anon = sql(`set role anon; select public.submit_market_listing_report('${urlListing.listing_id}','other','충분히 자세한 신고 내용입니다.','${randomUUID()}');`);
  assert.notEqual(anon.status, 0);
  for (const actor of [ids.suspended, ids.withdrawn]) {
    const denied = authenticated(actor, `select public.submit_market_listing_report('${urlListing.listing_id}','other','충분히 자세한 신고 내용입니다.','${randomUUID()}');`);
    assert.notEqual(denied.status, 0);
    assert.match(denied.stderr, /정상 활동 계정/);
  }
  const self = authenticated(ids.seller, `select public.submit_market_listing_report('${urlListing.listing_id}','other','충분히 자세한 신고 내용입니다.','${randomUUID()}');`);
  assert.notEqual(self.status, 0);
  assert.match(self.stderr, /본인의 판매글/);

  const invalidReason = authenticated(ids.reporter, `select public.submit_market_listing_report('${urlListing.listing_id}','unknown','충분히 자세한 신고 내용입니다.','${randomUUID()}');`);
  assert.notEqual(invalidReason.status, 0);
  const shortNote = authenticated(ids.reporter, `select public.submit_market_listing_report('${urlListing.listing_id}','other','짧음','${randomUUID()}');`);
  assert.notEqual(shortNote.status, 0);

  const submitRequest = randomUUID();
  const submitted = json(authenticated(ids.reporter, `select public.submit_market_listing_report('${urlListing.listing_id}','other','충분히 자세한 신고 내용입니다.','${submitRequest}');`));
  handledReportKey = submitted.report_key;
  const replay = json(authenticated(ids.reporter, `select public.submit_market_listing_report('${urlListing.listing_id}','other','충분히 자세한 신고 내용입니다.','${submitRequest}');`));
  assert.equal(replay.replayed, true);
  assert.equal(replay.report_key, handledReportKey);
  const replayConflict = authenticated(ids.reporter, `select public.submit_market_listing_report('${urlListing.listing_id}','fraud_or_false','다른 의미의 충분히 자세한 신고 내용입니다.','${submitRequest}');`);
  assert.notEqual(replayConflict.status, 0);
  assert.match(replayConflict.stderr, /request ID/);
  const duplicate = authenticated(ids.reporter, `select public.submit_market_listing_report('${urlListing.listing_id}','fraud_or_false','다른 요청으로 다시 제출한 신고 내용입니다.','${randomUUID()}');`);
  assert.notEqual(duplicate.status, 0);
  assert.match(duplicate.stderr, /이미 확인 대기/);
  assert.equal(sql(`select count(*) from public.market_listing_reports where reporter_user_id='${ids.reporter}' and listing_id='${urlListing.listing_id}' and report_status='received';`, "postgres").stdout.trim(), "1");
});

test("concurrent duplicate reports have exactly one winner and no failed audit or ledger", async () => {
  const listing = createListing("phone", "010-5555-6666", "TEST 동시 신고 판매글");
  const firstId = randomUUID();
  const secondId = randomUUID();
  const statement = (id) => `select public.submit_market_listing_report('${listing.listing_id}','spam_or_duplicate','동시 제출을 검증하는 충분히 자세한 신고입니다.','${id}');`;
  const results = await Promise.all([
    asyncAuthenticated(ids.member, statement(firstId)),
    asyncAuthenticated(ids.member, statement(secondId)),
  ]);
  assert.equal(results.filter((result) => result.status === 0).length, 1);
  assert.equal(results.filter((result) => result.status !== 0).length, 1);
  assert.equal(sql(`select count(*) from public.market_listing_reports where reporter_user_id='${ids.member}' and listing_id='${listing.listing_id}';`, "postgres").stdout.trim(), "1");
  assert.equal(sql(`select count(*) from private.market_audit_log where request_id in ('${firstId}','${secondId}');`, "postgres").stdout.trim(), "1");
  assert.equal(sql(`select count(*) from private.market_mutation_requests where request_id in ('${firstId}','${secondId}');`, "postgres").stdout.trim(), "1");
});

test("management is platform-admin only and detail contains no reporter identity", () => {
  const denied = authenticated(ids.member, "select public.list_market_listing_reports_for_management('received',30,0);");
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /운영 권한/);
  const page = json(authenticated(ids.admin, "select public.list_market_listing_reports_for_management('received',30,0);"));
  assert.ok(page.total >= 1);
  const summary = page.items.find((item) => item.report_key === handledReportKey);
  assert.ok(summary);
  assert.equal("reporter_user_id" in summary, false);
  const detail = json(authenticated(ids.admin, `select public.get_market_listing_report_for_management('${handledReportKey}');`));
  assert.equal(detail.report_key, handledReportKey);
  assert.equal("reporter_user_id" in detail, false);
});

test("resolve is idempotent, stale-safe, audit-redacted, and never mutates listing", () => {
  const listingBefore = sql(`select listing_status||':'||version from public.market_listings where id='${urlListing.listing_id}';`, "postgres").stdout.trim();
  const resolutionId = randomUUID();
  const resolved = json(authenticated(ids.admin, `select public.resolve_market_listing_report('${handledReportKey}',1,'handled','운영 검토를 완료했습니다.','${resolutionId}');`));
  assert.equal(resolved.report_status, "handled");
  assert.equal(resolved.version, 2);
  const replay = json(authenticated(ids.admin, `select public.resolve_market_listing_report('${handledReportKey}',1,'handled','운영 검토를 완료했습니다.','${resolutionId}');`));
  assert.equal(replay.replayed, true);
  const conflict = authenticated(ids.admin, `select public.resolve_market_listing_report('${handledReportKey}',1,'dismissed','다른 처리 결과입니다.','${resolutionId}');`);
  assert.notEqual(conflict.status, 0);
  const stale = authenticated(ids.admin, `select public.resolve_market_listing_report('${handledReportKey}',1,'handled','다시 처리합니다.','${randomUUID()}');`);
  assert.notEqual(stale.status, 0);
  assert.equal(sql(`select listing_status||':'||version from public.market_listings where id='${urlListing.listing_id}';`, "postgres").stdout.trim(), listingBefore);
  assert.equal(sql(`select count(*) from private.market_audit_log where request_id='${resolutionId}' and (coalesce(before_data::text,'') like '%운영 검토%' or after_data::text like '%운영 검토%');`, "postgres").stdout.trim(), "0");
  assert.equal(sql(`select count(*) from private.market_audit_log where request_id='${resolutionId}';`, "postgres").stdout.trim(), "1");
});

test("reporter and resolver deletion preserve report lifecycle rows", () => {
  const reporterListing = createListing("phone", "010-7777-8888", "TEST 신고자 삭제 판매글");
  const reporterReport = json(authenticated(ids.reporterDelete, `select public.submit_market_listing_report('${reporterListing.listing_id}','other','신고자 삭제 후 보존을 검증합니다.','${randomUUID()}');`));
  const resolverListing = createListing("phone", "010-8888-9999", "TEST 처리자 삭제 판매글");
  const resolverReport = json(authenticated(ids.member, `select public.submit_market_listing_report('${resolverListing.listing_id}','other','처리자 삭제 후 보존을 검증합니다.','${randomUUID()}');`));
  json(authenticated(ids.resolverDelete, `select public.resolve_market_listing_report('${resolverReport.report_key}',1,'dismissed','처리자 삭제 보존 확인','${randomUUID()}');`));
  const removedUsers = sql(`delete from auth.users where id in ('${ids.reporterDelete}','${ids.resolverDelete}');`, "postgres");
  assert.equal(removedUsers.status, 0, removedUsers.stdout + removedUsers.stderr);
  assert.equal(sql(`select (reporter_user_id is null)::text from public.market_listing_reports where report_key='${reporterReport.report_key}';`, "postgres").stdout.trim(), "true");
  assert.equal(sql(`select report_status||':'||(resolved_by is null)::text||':'||(resolved_at is not null)::text from public.market_listing_reports where report_key='${resolverReport.report_key}';`, "postgres").stdout.trim(), "dismissed:true:true");
});

test("moderation removes listing/media exactly once and never resolves its report", () => {
  const listing = createListing("phone", "010-4444-3333", "TEST 비공개 판매글");
  const report = json(authenticated(ids.member, `select public.submit_market_listing_report('${listing.listing_id}','fraud_or_false','운영자 비공개 분리를 검증합니다.','${randomUUID()}');`));
  const mediaId = randomUUID();
  const path = `${listing.listing_id}/${mediaId}/original`;
  const media = sql(`insert into public.market_listing_media(id,listing_id,uploaded_by_user_id,storage_path,sort_order,media_status,declared_mime_type,declared_size_bytes,verified_mime_type,verified_size_bytes,available_at)
    values ('${mediaId}','${listing.listing_id}','${ids.seller}','${path}',0,'available','image/jpeg',4,'image/jpeg',4,now());`, "postgres");
  assert.equal(media.status, 0, media.stdout + media.stderr);
  const moderationId = randomUUID();
  const removed = json(authenticated(ids.admin, `select public.remove_market_listing_for_moderation('${listing.listing_id}',1,'운영 정책 위반 확인','${moderationId}');`));
  assert.equal(removed.sale_status, "removed");
  assert.deepEqual(removed.removed_storage_paths, [path]);
  const replay = json(authenticated(ids.admin, `select public.remove_market_listing_for_moderation('${listing.listing_id}',1,'운영 정책 위반 확인','${moderationId}');`));
  assert.equal(replay.replayed, true);
  const conflict = authenticated(ids.admin, `select public.remove_market_listing_for_moderation('${listing.listing_id}',1,'다른 조치 사유','${moderationId}');`);
  assert.notEqual(conflict.status, 0);
  const repeated = authenticated(ids.admin, `select public.remove_market_listing_for_moderation('${listing.listing_id}',2,'이미 처리된 글','${randomUUID()}');`);
  assert.notEqual(repeated.status, 0);
  assert.equal(sql(`select listing_status||':'||version from public.market_listings where id='${listing.listing_id}';`, "postgres").stdout.trim(), "removed:2");
  assert.equal(sql(`select media_status||':'||version from public.market_listing_media where id='${mediaId}';`, "postgres").stdout.trim(), "removed:2");
  assert.equal(sql(`select report_status from public.market_listing_reports where report_key='${report.report_key}';`, "postgres").stdout.trim(), "received");
  assert.equal(sql(`select (select count(*) from public.market_status_history where listing_id='${listing.listing_id}' and to_status='removed')||':'||(select count(*) from private.market_audit_log where request_id='${moderationId}')||':'||(select count(*) from private.market_mutation_requests where request_id='${moderationId}');`, "postgres").stdout.trim(), "1:1:1");
});

test("report table direct DML and moderation by ordinary members remain denied", () => {
  for (const statement of [
    "select count(*) from public.market_listing_reports;",
    `insert into public.market_listing_reports(listing_id,reporter_user_id,submit_request_id,reason_code,note) values ('${urlListing.listing_id}','${ids.member}','${randomUUID()}','other','충분히 자세한 직접 신고입니다.');`,
    "update public.market_listing_reports set report_status='dismissed';",
    "delete from public.market_listing_reports;",
  ]) {
    const result = authenticated(ids.member, statement);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /permission denied|row-level security/i);
  }
  const denied = authenticated(ids.member, `select public.remove_market_listing_for_moderation('${urlListing.listing_id}',1,'권한 없는 조치','${randomUUID()}');`);
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /운영 권한/);
});

for (const [context, actor, expected] of [
  ["anonymous", null, false], ["owner", ids.seller, true], ["non-owner", ids.member, false],
]) {
  test(`${context} listing list/detail return strict ownership booleans accepted by the real parser`, async () => {
    const created = createListing("phone", "01012345678", `TEST boolean listing ${context}`);
    const read = (statement) => json(actor ? authenticated(actor, statement) : sql(`set role anon; ${statement}`));
    const page = read("select public.list_market_listings(null,null,null,null,30,0);");
    const raw = page.items.find((item) => item.id === created.listing_id);
    assert.equal(typeof raw.can_edit, "boolean"); assert.equal(raw.can_edit, expected);
    assert.equal((await listMarketListings(dtoClient(page), publicFilters)).items.find((item) => item.id === created.listing_id).canEdit, expected);
    const detail = read(`select public.get_market_listing('${created.listing_id}');`);
    assert.equal(typeof detail.can_edit, "boolean"); assert.equal(detail.can_edit, expected);
    assert.equal((await getMarketListing(dtoClient(detail), created.listing_id)).canEdit, expected);
    await assert.rejects(getMarketListing(dtoClient({ ...detail, can_edit: null }), created.listing_id));
    await assert.rejects(listMarketListings(dtoClient({ ...page, items: [{ ...raw, can_edit: null }] }), publicFilters));
  });

  test(`${context} buy-request list/detail return strict ownership booleans`, async () => {
    const payload = JSON.stringify({ title: `TEST boolean wanted ${context}`, category: "ball", budget: 50000, region: "경기", summary: "TEST 정상 구매 희망 내용입니다." });
    const created = json(authenticated(ids.seller, `select public.mutate_market_buy_request('create',null,null,'${payload}'::jsonb,'${randomUUID()}');`));
    const read = (statement) => json(actor ? authenticated(actor, statement) : sql(`set role anon; ${statement}`));
    const page = read("select public.list_market_buy_requests(30,0);");
    const raw = page.items.find((item) => item.id === created.buy_request_id);
    assert.equal(typeof raw.can_edit, "boolean"); assert.equal(raw.can_edit, expected);
    assert.equal((await listMarketBuyRequests(dtoClient(page))).items.find((item) => item.id === created.buy_request_id).canEdit, expected);
    const detail = read(`select public.get_market_buy_request('${created.buy_request_id}');`);
    assert.equal(typeof detail.can_edit, "boolean"); assert.equal(detail.can_edit, expected);
    await assert.rejects(listMarketBuyRequests(dtoClient({ ...page, items: [{ ...raw, can_edit: null }] })));
  });

  test(`${context} startup list/detail keep the existing non-null ownership contract`, async () => {
    const payload = JSON.stringify({ title: `TEST boolean startup ${context}`, body: "TEST 스크린 파크골프 창업 공간과 비용을 문의합니다.", category: "screenStartup", region: "서울", desired_scale: "약 30평", consultation_type: "startupInquiry" });
    const created = json(authenticated(ids.seller, `select public.mutate_market_startup_post('create',null,null,'${payload}'::jsonb);`));
    const read = (statement) => json(actor ? authenticated(actor, statement) : sql(`set role anon; ${statement}`));
    const page = read("select public.list_market_startup_posts(null,null,null,30,0);");
    const raw = page.items.find((item) => item.post_key === created.post_key);
    assert.equal(typeof raw.can_edit, "boolean"); assert.equal(raw.can_edit, expected);
    const filters = { keyword: "", category: "all", region: "전체" };
    assert.equal((await listMarketStartupPosts(dtoClient(page), filters)).items.find((item) => item.postKey === created.post_key).canEdit, expected);
    const detail = read(`select public.get_market_startup_post('${created.post_key}');`);
    assert.equal(typeof detail.can_edit, "boolean"); assert.equal(detail.can_edit, expected);
    assert.equal((await getMarketStartupPost(dtoClient(detail), created.post_key)).canEdit, expected);
    await assert.rejects(getMarketStartupPost(dtoClient({ ...detail, can_edit: null }), created.post_key));
  });
}

test("ownership replacements retain STABLE SECURITY DEFINER and the existing public read ACL", () => {
  const metadata = json(sql(`select jsonb_agg(jsonb_build_object(
    'stable', p.provolatile='s', 'definer', p.prosecdef,
    'empty_path', p.proconfig=array['search_path=""']::text[],
    'anon', has_function_privilege('anon',p.oid,'EXECUTE'),
    'authenticated', has_function_privilege('authenticated',p.oid,'EXECUTE')))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in
    ('list_market_listings','get_market_listing','list_market_buy_requests','get_market_buy_request');`, "postgres"));
  assert.equal(metadata.length, 4);
  for (const item of metadata) assert.deepEqual(item, { stable: true, definer: true, empty_path: true, anon: true, authenticated: true });
});

test("effective catalog keeps forced RLS, minimal ACLs, indexes, and platform-admin mappings", () => {
  const state = sql(`select
      c.relrowsecurity::text||':'||c.relforcerowsecurity::text||':'||
      pg_catalog.has_table_privilege('authenticated','public.market_listing_reports','SELECT,INSERT,UPDATE,DELETE')::text||':'||
      (select count(*) from public.platform_role_permissions where permission_code in ('market.listing_reports.manage','market.listings.moderate') and platform_role='platform_admin')||':'||
      (select count(*) from public.platform_role_permissions where permission_code in ('market.listing_reports.manage','market.listings.moderate') and platform_role<>'platform_admin')
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='market_listing_reports';`, "postgres");
  assert.equal(state.status, 0, state.stdout + state.stderr);
  assert.equal(state.stdout.trim(), "true:true:false:2:0");
  const execute = sql(`select
    pg_catalog.has_function_privilege('anon','public.submit_market_listing_report(uuid,text,text,uuid)','EXECUTE')::text||':'||
    pg_catalog.has_function_privilege('authenticated','public.submit_market_listing_report(uuid,text,text,uuid)','EXECUTE')::text||':'||
    pg_catalog.has_function_privilege('authenticated','public.remove_market_listing_for_moderation(uuid,integer,text,uuid)','EXECUTE')::text;`, "postgres");
  assert.equal(execute.stdout.trim(), "false:true:true");
});

test("effective contact CHECK accepts only both complete states and rejects all six partial NULL tuples", () => {
  for (let mask = 0; mask < 8; mask += 1) {
    const values = [mask & 1 ? "'phone'" : "null", mask & 2 ? "'01012345678'" : "null", mask & 4 ? "now()" : "null"];
    const result = sql(`begin;
      insert into public.market_listings(seller_user_id,title,category_code,price_amount,region_code,condition_code,trade_type_code,description,
        public_contact_method,public_contact_value,public_contact_consent_at)
      values ('${ids.seller}','TEST tuple boundary','club',1000,'서울','lightUse','direct','TEST effective CHECK 검증입니다.',${values.join(",")});
      rollback;`, "postgres");
    if (mask === 0 || mask === 7) assert.equal(result.status, 0, result.stderr);
    else { assert.notEqual(result.status, 0, `partial tuple ${mask}`); assert.match(result.stderr, /market_listings_public_contact_check/); }
  }
});

test("effective HTTPS helper and authenticated RPC reject malformed authorities without audit or ledger", () => {
  const invalid = ["http://example.com", "javascript:alert(1)", "data:text/plain,test", "https://", "https:///path", "https://.",
    "https://example.com:bad", "https://example.com:0", "https://example.com:65536", "https://example.com:-1", "https://example.com:",
    "https://exa mple.com", "https://exa\tmple.com", "https://exa\nmple.com", "https://example.com\\path",
    "https://user:pass@example.com", "https://example..com", "https://999.1.1.1", "https://example.com/\u00a0test"];
  const requests = [];
  for (const value of invalid) {
    const request = randomUUID(); requests.push(request);
    const literal = `'${value.replaceAll("'", "''")}'`;
    assert.equal(sql(`select private.market_valid_contact_https_url(${literal});`, "postgres").stdout.trim(), "f", value);
    const result = authenticated(ids.seller, `select public.mutate_market_listing('create',null,null,${contactPayload("external_url", value)},'${request}');`);
    assert.notEqual(result.status, 0, value);
    assert.match(result.stderr, /https|연락처/i);
  }
  const keys = requests.map((id) => `'${id}'`).join(",");
  assert.equal(sql(`select (select count(*) from private.market_audit_log where request_id in (${keys}))||':'||
    (select count(*) from private.market_mutation_requests where request_id in (${keys}));`, "postgres").stdout.trim(), "0:0");
  for (const value of ["https://example.com", "https://example.com/path", "https://example.com:443/path", "https://example.com/path?q=1#contact", "https://[::1]:8443/path"]) {
    assert.equal(createListing("external_url", value, "TEST valid HTTPS boundary").sale_status, "selling");
  }
});

test("submit, resolve and moderation reject all blank whitespace and normalize valid text before replay", () => {
  const listing = createListing("phone", "01098761234", "TEST whitespace boundary");
  const literal = (value) => `'${value.replaceAll("'", "''")}'`;
  const blanks = [" ".repeat(12), "\t".repeat(12), "\n".repeat(12), "\r\n".repeat(8), " \t\r\n\f\v".repeat(3), "\u00a0\u3000\ufeff".repeat(5)];
  const failedRequests = [];
  for (const blank of blanks) {
    const request = randomUUID(); failedRequests.push(request);
    const result = authenticated(ids.reporter, `select public.submit_market_listing_report('${listing.listing_id}','other',${literal(blank)},'${request}');`);
    assert.notEqual(result.status, 0); assert.match(result.stderr, /신고 내용은/);
  }
  const note = "TEST_PRIVATE_REPORT_MARKER 정상 신고 내용입니다.";
  const submitRequest = randomUUID();
  const report = json(authenticated(ids.reporter, `select public.submit_market_listing_report('${listing.listing_id}','other',${literal(`\t\n ${note} \r\n`)},'${submitRequest}');`));
  assert.equal(sql(`select note from public.market_listing_reports where report_key='${report.report_key}';`, "postgres").stdout.trim(), note);
  assert.equal(json(authenticated(ids.reporter, `select public.submit_market_listing_report('${listing.listing_id}','other',${literal(note)},'${submitRequest}');`)).replayed, true);
  for (const blank of blanks) {
    const resolveId = randomUUID(); const removeId = randomUUID(); failedRequests.push(resolveId, removeId);
    const resolved = authenticated(ids.admin, `select public.resolve_market_listing_report('${report.report_key}',1,'handled',${literal(blank)},'${resolveId}');`);
    assert.notEqual(resolved.status, 0); assert.match(resolved.stderr, /처리 메모는/);
    const removed = authenticated(ids.admin, `select public.remove_market_listing_for_moderation('${listing.listing_id}',1,${literal(blank)},'${removeId}');`);
    assert.notEqual(removed.status, 0); assert.match(removed.stderr, /비공개 처리 사유는/);
  }
  const keys = failedRequests.map((id) => `'${id}'`).join(",");
  assert.equal(sql(`select (select count(*) from private.market_audit_log where request_id in (${keys}))||':'||
    (select count(*) from private.market_mutation_requests where request_id in (${keys}));`, "postgres").stdout.trim(), "0:0");
  const resolveId = randomUUID();
  const resolution = "TEST_PRIVATE_RESOLUTION_MARKER 운영 검토";
  json(authenticated(ids.admin, `select public.resolve_market_listing_report('${report.report_key}',1,'handled',${literal(`\t ${resolution} \r\n`)},'${resolveId}');`));
  assert.equal(sql(`select resolution_note from public.market_listing_reports where report_key='${report.report_key}';`, "postgres").stdout.trim(), resolution);
  assert.equal(sql(`select listing_status from public.market_listings where id='${listing.listing_id}';`, "postgres").stdout.trim(), "selling");
  assert.equal(json(authenticated(ids.admin, `select public.resolve_market_listing_report('${report.report_key}',1,'handled',${literal(resolution)},'${resolveId}');`)).replayed, true);
  const removeId = randomUUID(); const reason = "TEST_PRIVATE_MODERATION_MARKER 운영 사유";
  assert.equal(json(authenticated(ids.admin, `select public.remove_market_listing_for_moderation('${listing.listing_id}',1,${literal(`\t ${reason} \n`)},'${removeId}');`)).sale_status, "removed");
  assert.equal(json(authenticated(ids.admin, `select public.remove_market_listing_for_moderation('${listing.listing_id}',1,${literal(reason)},'${removeId}');`)).replayed, true);
  assert.equal(sql(`select report_status from public.market_listing_reports where report_key='${report.report_key}';`, "postgres").stdout.trim(), "handled");
  const successKeys = [submitRequest, resolveId, removeId].map((id) => `'${id}'`).join(",");
  assert.equal(sql(`select (select count(*) from private.market_audit_log where request_id in (${successKeys}))||':'||
    (select count(*) from private.market_mutation_requests where request_id in (${successKeys}));`, "postgres").stdout.trim(), "3:3");
  const leaks = sql(`select
    (select count(*) from private.market_audit_log a where to_jsonb(a)::text ~ 'TEST_PRIVATE_|01098761234')+
    (select count(*) from private.market_mutation_requests r where to_jsonb(r)::text ~ 'TEST_PRIVATE_|01098761234')+
    (select count(*) from public.market_status_history h where to_jsonb(h)::text ~ 'TEST_PRIVATE_|01098761234');`, "postgres");
  assert.equal(leaks.status, 0, leaks.stderr); assert.equal(leaks.stdout.trim(), "0");
});
