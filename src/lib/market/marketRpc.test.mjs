import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(fileURLToPath(new URL("../../../supabase/migrations/20260823000100_pul_market_core_foundation.sql", import.meta.url)), "utf8");
function docker(args, input) { return spawnSync("docker", args, { encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 }); }
function sql(text, user = "supabase_admin") { return docker(["exec", "-i", container, "psql", "-U", user, "-d", database, "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"], text); }
function authenticated(actor, text) { return sql(`set request.jwt.claim.sub = '${actor}'; set role authenticated; ${text}`); }
function json(result) { assert.equal(result.status, 0, result.stdout + result.stderr); return JSON.parse(result.stdout.trim()); }

const ids = { owner: randomUUID(), other: randomUUID(), listingRequest: randomUUID(), updateRequest: randomUUID(), reserveRequest: randomUUID(), sellRequest: randomUUID(), deleteRequest: randomUUID(), buyCreate: randomUUID(), buyClose: randomUUID() };
let container; let database; let listingId; let buyRequestId;

before(() => {
  const found = docker(["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"]).stdout.split(/\r?\n/).filter(Boolean);
  assert.equal(found.length, 1);
  container = found[0]; database = `pul_market_${process.pid}_${Date.now()}`;
  const clone = docker(["exec", container, "sh", "-lc", [`createdb -U supabase_admin -O postgres ${database}`, `pg_dump -U supabase_admin -d postgres --schema-only | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`, `pg_dump -U supabase_admin -d postgres --data-only --disable-triggers | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`].join(" && ")]);
  assert.equal(clone.status, 0, clone.stdout + clone.stderr);
  const applied = sql(`begin; ${migration} commit;`, "postgres"); assert.equal(applied.status, 0, applied.stdout + applied.stderr);
  const authRows = [ids.owner, ids.other].map((id) => `('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','market-${id}@example.invalid','',now(),now(),now())`).join(",");
  const fixture = sql(`set session_replication_role=replica; insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values ${authRows}; insert into public.user_accounts(id,account_status) values ('${ids.owner}','active'),('${ids.other}','active'); insert into public.user_profiles(user_id,nickname,profile_visibility) values ('${ids.owner}','TEST 판매자','public'),('${ids.other}','TEST 다른 회원','private'); set session_replication_role=origin;`, "postgres");
  assert.equal(fixture.status, 0, fixture.stdout + fixture.stderr);
});
after(() => { if (container && database) assert.equal(docker(["exec", container, "dropdb", "--if-exists", "--force", "-U", "supabase_admin", database]).status, 0); });

const listingPayload = `'{"title":"TEST 파크골프채","category":"club","price":120000,"region":"서울","condition":"lightUse","trade_type":"direct","description":"TEST 정상 상품 설명입니다."}'::jsonb`;

test("owner creates, replays, edits, and moves through the exact sale sequence", () => {
  const created = json(authenticated(ids.owner, `select public.mutate_market_listing('create',null,null,${listingPayload},'${ids.listingRequest}');`));
  listingId = created.listing_id; assert.equal(created.sale_status, "selling"); assert.equal(created.version, 1);
  const replay = json(authenticated(ids.owner, `select public.mutate_market_listing('create',null,null,${listingPayload},'${ids.listingRequest}');`)); assert.equal(replay.replayed, true); assert.equal(replay.listing_id, listingId);
  const conflict = authenticated(ids.owner, `select public.mutate_market_listing('create',null,null,'{"title":"다른 요청"}'::jsonb,'${ids.listingRequest}');`); assert.notEqual(conflict.status, 0); assert.match(conflict.stderr, /request_id/);
  const updated = json(authenticated(ids.owner, `select public.mutate_market_listing('update','${listingId}',1,${listingPayload},'${ids.updateRequest}');`)); assert.equal(updated.version, 2);
  const reserve = json(authenticated(ids.owner, `select public.mutate_market_listing('reserve','${listingId}',2,'{}','${ids.reserveRequest}');`)); assert.equal(reserve.sale_status, "reserved");
  const sold = json(authenticated(ids.owner, `select public.mutate_market_listing('sell','${listingId}',3,'{}','${ids.sellRequest}');`)); assert.equal(sold.sale_status, "sold"); assert.equal(sold.version, 4);
  const state = sql(`select listing_status||':'||version||':'||(select count(*) from public.market_status_history where listing_id='${listingId}')||':'||(select count(*) from private.market_audit_log where entity_id='${listingId}') from public.market_listings where id='${listingId}';`); assert.equal(state.stdout.trim(), "sold:4:3:4");
});

test("public list hides private identity and owner/version checks fail closed", () => {
  const page = json(sql("set role anon; select public.list_market_listings(null,null,null,null,24,0);")); assert.equal(page.items.length, 1); assert.equal(page.items[0].seller_display_name, "TEST 판매자"); assert.equal("seller_user_id" in page.items[0], false);
  const denied = authenticated(ids.other, `select public.mutate_market_listing('delete','${listingId}',4,'{}','${randomUUID()}');`); assert.notEqual(denied.status, 0); assert.match(denied.stderr, /본인의/);
  const stale = authenticated(ids.owner, `select public.mutate_market_listing('delete','${listingId}',2,'{}','${randomUUID()}');`); assert.notEqual(stale.status, 0); assert.match(stale.stderr, /새로고침/);
});

test("media intent is owner-only, capped at five, and server helpers are service-only", () => {
  const listing = json(authenticated(ids.owner, `select public.mutate_market_listing('create',null,null,${listingPayload},'${randomUUID()}');`));
  for (let index = 0; index < 5; index += 1) json(authenticated(ids.owner, `select public.create_market_media_upload_intent('${listing.listing_id}','image/jpeg',4);`));
  const sixth = authenticated(ids.owner, `select public.create_market_media_upload_intent('${listing.listing_id}','image/jpeg',4);`); assert.notEqual(sixth.status, 0); assert.match(sixth.stderr, /최대 5장/);
  const denied = authenticated(ids.other, `select public.create_market_media_upload_intent('${listing.listing_id}','image/jpeg',4);`); assert.notEqual(denied.status, 0); assert.match(denied.stderr, /본인의/);
  const acl = sql(`select pg_catalog.has_table_privilege('authenticated','public.market_listing_media','INSERT,UPDATE,DELETE')||':'||pg_catalog.has_function_privilege('authenticated','public.finalize_market_media_upload_server(uuid,uuid,text,bigint)','EXECUTE')||':'||pg_catalog.has_function_privilege('service_role','public.finalize_market_media_upload_server(uuid,uuid,text,bigint)','EXECUTE');`); assert.equal(acl.stdout.trim(), "false:false:true");
});

test("wanted posts support owner CRUD, close, replay, and public pagination", () => {
  const payload = `'{"title":"TEST 파크골프공 구해요","category":"ball","budget":50000,"region":"경기","summary":"TEST 정상 구매 희망 내용입니다."}'::jsonb`;
  const created = json(authenticated(ids.owner, `select public.mutate_market_buy_request('create',null,null,${payload},'${ids.buyCreate}');`)); buyRequestId = created.buy_request_id;
  const replay = json(authenticated(ids.owner, `select public.mutate_market_buy_request('create',null,null,${payload},'${ids.buyCreate}');`)); assert.equal(replay.replayed, true);
  const closed = json(authenticated(ids.owner, `select public.mutate_market_buy_request('close','${buyRequestId}',1,'{}','${ids.buyClose}');`)); assert.equal(closed.request_status, "closed"); assert.equal(closed.version, 2);
  const page = json(sql("set role anon; select public.list_market_buy_requests(24,0);")); assert.equal(page.items.length, 1); assert.equal(page.items[0].request_status, "closed"); assert.equal("author_user_id" in page.items[0], false);
});

test("authenticated direct table DML is denied and soft delete preserves history", () => {
  const direct = authenticated(ids.owner, `update public.market_listings set title='직접 변경' where id='${listingId}';`); assert.notEqual(direct.status, 0); assert.match(direct.stderr, /permission denied|row-level security/i);
  const deleted = json(authenticated(ids.owner, `select public.mutate_market_listing('delete','${listingId}',4,'{}','${ids.deleteRequest}');`)); assert.equal(deleted.sale_status, "removed");
  const visible = json(sql("set role anon; select public.list_market_listings(null,null,null,null,24,0);")); assert.equal(visible.items.some((item) => item.id === listingId), false);
  const row = sql(`select listing_status||':'||(removed_at is not null)::text||':'||version from public.market_listings where id='${listingId}';`); assert.equal(row.stdout.trim(), "removed:true:5");
});
