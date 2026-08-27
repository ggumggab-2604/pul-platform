import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/20260915000100_pul_promotion_banner_management_foundation.sql", import.meta.url)),
  "utf8",
);
const secondSlotsMigration = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/20260918000100_pul_promotion_second_directory_slots.sql", import.meta.url)),
  "utf8",
);
const homeRailMigration = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/20260919000100_pul_home_rail_long_short_slots.sql", import.meta.url)),
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
  return sql(`set request.jwt.claim.sub = '${actor}'; set request.jwt.claim.role = 'authenticated'; set role authenticated; ${text}`);
}

function authenticatedAsync(actor, text) {
  return new Promise((resolve) => {
    const child = spawn("docker", [
      "exec", "-i", container, "psql", "-U", "supabase_admin", "-d", database,
      "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1",
    ]);
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(
      `set request.jwt.claim.sub = '${actor}'; set request.jwt.claim.role = 'authenticated'; set role authenticated; ${text}`,
    );
  });
}

function service(text) {
  return sql(`set request.jwt.claim.role = 'service_role'; set role service_role; ${text}`);
}

function anonymous(text) {
  return sql(`set request.jwt.claim.role = 'anon'; set role anon; ${text}`);
}

function json(result) {
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return JSON.parse(result.stdout.trim());
}

function jsonSql(value) {
  return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
}

function rpc(functionCall, actor = ids.admin) {
  return authenticated(actor, `select ${functionCall};`);
}

function iso(offsetHours) {
  return new Date(Date.now() + offsetHours * 60 * 60 * 1000).toISOString();
}

const ids = {
  admin: randomUUID(),
  moderator: randomUUID(),
  member: randomUUID(),
};

let container;
let database;
let promotionKey;
let mediaKey;
let activeMediaKey;
let livePlacementKey;
let adjacentPlacementKey;
let createRequestId;
let liveStartsAt;
let liveEndsAt;

before(() => {
  const found = docker(["ps", "--filter", "name=supabase_db_pul-platform", "--format", "{{.Names}}"])
    .stdout.split(/\r?\n/).filter(Boolean);
  assert.equal(found.length, 1, "one local Supabase database container is required");
  container = found[0];
  database = `pul_promotion_${process.pid}_${Date.now()}`;
  const clone = docker([
    "exec", container, "sh", "-lc",
    [
      `createdb -U supabase_admin -O postgres ${database}`,
      `pg_dump -U supabase_admin -d postgres --schema-only | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
      `pg_dump -U supabase_admin -d postgres --data-only --disable-triggers | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
    ].join(" && "),
  ]);
  assert.equal(clone.status, 0, clone.stdout + clone.stderr);

  const exists = sql("select to_regclass('public.promotion_slots') is not null;");
  assert.equal(exists.status, 0, exists.stdout + exists.stderr);
  if (exists.stdout.trim() !== "t") {
    const applied = sql(`begin; ${migration} commit;`, "postgres");
    assert.equal(applied.status, 0, applied.stdout + applied.stderr);
  }
  if (sql("select exists(select 1 from public.promotion_slots where slot_code='courses.after_map.01');").stdout.trim() !== "t") {
    const applied = sql(`begin; ${secondSlotsMigration} commit;`, "postgres");
    assert.equal(applied.status, 0, applied.stdout + applied.stderr);
  }
  if (sql("select exists(select 1 from public.promotion_slots where slot_code='home.rail_left.short.01');").stdout.trim() !== "t") {
    const applied = sql(`begin; ${homeRailMigration} commit;`, "postgres");
    assert.equal(applied.status, 0, applied.stdout + applied.stderr);
  }

  const authRows = Object.values(ids).map((id) =>
    `('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','promotion-${id}@example.invalid','',now(),now(),now())`,
  ).join(",");
  const fixture = sql(`
    set session_replication_role = replica;
    insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
    values ${authRows};
    insert into public.user_accounts(id,platform_role,account_status) values
      ('${ids.admin}','platform_admin','active'),
      ('${ids.moderator}','platform_moderator','active'),
      ('${ids.member}','member','active');
    set session_replication_role = origin;
  `, "postgres");
  assert.equal(fixture.status, 0, fixture.stdout + fixture.stderr);
});

after(() => {
  if (container && database) docker(["exec", container, "dropdb", "-U", "supabase_admin", "--if-exists", database]);
});

test("slot, permission, bucket, ACL, and RLS catalog are effective", () => {
  const catalog = json(sql(`select jsonb_build_object(
    'slots', (select count(*) from public.promotion_slots),
    'enabled', (select count(*) from public.promotion_slots where is_enabled),
    'hof_disabled', (select not is_enabled from public.promotion_slots where slot_code='hall_of_fame.top.01'),
    'bucket_public', (select public from storage.buckets where id='promotion-media'),
    'bucket_limit', (select file_size_limit from storage.buckets where id='promotion-media'),
    'admin_mapping', exists(select 1 from public.platform_role_permissions where platform_role='platform_admin' and permission_code='promotions.manage'),
    'moderator_mapping', exists(select 1 from public.platform_role_permissions where platform_role='platform_moderator' and permission_code='promotions.manage'),
    'forced_tables', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relname in ('promotion_slots','promotions','promotion_media','promotion_placements','promotion_mutation_requests') and c.relforcerowsecurity)
  );`, "postgres"));
  assert.deepEqual(catalog, {
    slots: 27, enabled: 26, hof_disabled: true, bucket_public: true,
    bucket_limit: 5242880, admin_mapping: true, moderator_mapping: false, forced_tables: 5,
  });
});

test("KST timestamps and exact-second half-open boundaries are unambiguous", () => {
  const time = json(sql(`select jsonb_build_object(
    'same_instant', '2026-09-15T09:00:00+09:00'::timestamptz = '2026-09-15T00:00:00Z'::timestamptz,
    'includes_start', tstzrange('2026-09-15T09:00:00+09:00','2026-09-15T10:00:00+09:00','[)') @> '2026-09-15T09:00:00+09:00'::timestamptz,
    'excludes_end', not (tstzrange('2026-09-15T09:00:00+09:00','2026-09-15T10:00:00+09:00','[)') @> '2026-09-15T10:00:00+09:00'::timestamptz)
  );`, "postgres"));
  assert.deepEqual(time, { same_instant: true, includes_start: true, excludes_end: true });
});

test("anon, member, and moderator cannot use management RPCs", () => {
  const call = "select public.list_promotions_for_management(null,null,10,0);";
  const anon = anonymous(call);
  assert.notEqual(anon.status, 0);
  assert.match(anon.stderr, /permission denied/i);
  for (const actor of [ids.member, ids.moderator]) {
    const denied = authenticated(actor, call);
    assert.notEqual(denied.status, 0);
    assert.match(denied.stderr, /관리 권한이 없습니다/);
  }
  const admin = json(authenticated(ids.admin, call));
  assert.deepEqual(admin.items, []);
  assert.deepEqual(json(anonymous("select public.get_active_promotions_for_slots(array['home.hero.01']);")), []);
});

test("admin creates a promotion and exact replay does not duplicate audit or ledger", () => {
  createRequestId = randomUUID();
  const payload = {
    content_kind: "pul_notice",
    title: "TEST 통합 배너 공지",
    summary: "TEST 통합 배너 foundation 공개 조회를 검증하는 요약입니다.",
    link_type: "internal_detail",
    slug: `test-promotion-${process.pid}`,
    body: "TEST 통합 배너 상세 본문이며 공개 상세 RPC 계약을 검증하기 위한 충분한 길이입니다.",
    detail_cta_label: "자세히 보기",
    detail_cta_url: "/news",
  };
  const call = `public.mutate_promotion('${createRequestId}','create',null,null,${jsonSql(payload)})`;
  const created = json(rpc(call));
  promotionKey = created.promotion.promotion_key;
  assert.match(promotionKey, /^[0-9a-f]{32}$/);
  assert.equal(created.promotion.version, 1);
  assert.equal(created.replayed, false);

  const replayed = json(rpc(call));
  assert.equal(replayed.replayed, true);
  assert.equal(replayed.promotion.promotion_key, promotionKey);
  const counts = json(sql(`select jsonb_build_object(
    'promotions',(select count(*) from public.promotions where promotion_key='${promotionKey}'),
    'audit',(select count(*) from public.audit_logs where actor_id='${ids.admin}' and request_id='${createRequestId}'),
    'ledger',(select count(*) from private.promotion_mutation_requests where actor_id='${ids.admin}' and request_id='${createRequestId}')
  );`, "postgres"));
  assert.deepEqual(counts, { promotions: 1, audit: 1, ledger: 1 });
});

test("same request ID with another payload is rejected", () => {
  const mismatch = rpc(`public.mutate_promotion('${createRequestId}','create',null,null,${jsonSql({
    content_kind: "pul_notice", title: "TEST 다른 제목", summary: "TEST 완전히 다른 요청 본문입니다.",
    link_type: "none",
  })})`);
  assert.notEqual(mismatch.status, 0);
  assert.match(mismatch.stderr, /재사용할 수 없습니다/);
});

test("request IDs already completed by another mutation domain fail with a controlled error", () => {
  const reused = randomUUID();
  const seeded = sql(`insert into public.audit_logs(
    actor_id,actor_type,actor_role,action,target_type,target_id,metadata,request_id,outcome
  ) values (
    '${ids.admin}','admin','platform_admin','test.other_domain','test','test','{}'::jsonb,'${reused}','success'
  );`, "postgres");
  assert.equal(seeded.status, 0, seeded.stdout + seeded.stderr);
  const denied = rpc(`public.mutate_promotion('${reused}','create',null,null,${jsonSql({
    content_kind: "pul_notice",
    title: "TEST 전역 요청 충돌",
    summary: "TEST 기존 mutation request 식별자와 충돌하는 요청입니다.",
    link_type: "none",
  })})`);
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /이미 다른 완료 작업에서 사용되었습니다/);
  assert.equal(sql(`select count(*) from private.promotion_mutation_requests where actor_id='${ids.admin}' and request_id='${reused}';`, "postgres").stdout.trim(), "0");
});

test("malformed and non-HTTPS external URLs are rejected", () => {
  for (const externalUrl of ["http://example.com", "javascript:alert(1)", "https://?"]) {
    const denied = rpc(`public.mutate_promotion('${randomUUID()}','create',null,null,${jsonSql({
      content_kind: "advertisement",
      title: "TEST 외부 링크 홍보",
      summary: "TEST 안전하지 않은 외부 링크를 차단하는 계약 검증입니다.",
      link_type: "external",
      external_url: externalUrl,
    })})`);
    assert.notEqual(denied.status, 0);
  }
});

test("signed-media metadata finalizes and replacement retires the prior image", () => {
  const intent = json(rpc(`public.create_promotion_media_upload_intent(
    '${randomUUID()}','${promotionKey}','desktop_banner',0,'TEST 데스크톱 배너','image/png',1000
  )`));
  mediaKey = intent.media_key;
  const finalized = json(service(`select public.finalize_promotion_media_for_service(
    '${ids.admin}','${randomUUID()}','${mediaKey}','image/png',1000
  );`));
  assert.equal(finalized.media_status, "available");

  const second = json(rpc(`public.create_promotion_media_upload_intent(
    '${randomUUID()}','${promotionKey}','desktop_banner',0,'TEST 교체 데스크톱 배너','image/webp',1200
  )`));
  activeMediaKey = second.media_key;
  const replaced = json(service(`select public.finalize_promotion_media_for_service(
    '${ids.admin}','${randomUUID()}','${activeMediaKey}','image/webp',1200
  );`));
  assert.equal(replaced.media_status, "available");
  assert.equal(typeof replaced.replaced_storage_path, "string");
  const states = json(sql(`select jsonb_build_object(
    'old',(select media_status from public.promotion_media where media_key='${mediaKey}'),
    'new',(select media_status from public.promotion_media where media_key='${activeMediaKey}'),
    'available',(select count(*) from public.promotion_media where promotion_id=(select id from public.promotions where promotion_key='${promotionKey}') and variant='desktop_banner' and media_status='available')
  );`, "postgres"));
  assert.deepEqual(states, { old: "removed", new: "available", available: 1 });
});

test("ready promotion publishes live and public DTOs contain no internal identifiers", () => {
  const ready = json(rpc(`public.mutate_promotion(
    '${randomUUID()}','update','${promotionKey}',1,${jsonSql({ content_status: "ready" })}
  )`));
  assert.equal(ready.promotion.content_status, "ready");
  liveStartsAt = iso(-1);
  liveEndsAt = iso(1);
  const placement = json(rpc(`public.mutate_promotion_placement(
    '${randomUUID()}','create',null,null,${jsonSql({
      slot_code: "courses.top.01", promotion_key: promotionKey,
      starts_at: liveStartsAt, ends_at: liveEndsAt,
    })}
  )`));
  livePlacementKey = placement.placement.placement_key;
  const published = json(rpc(`public.mutate_promotion_placement(
    '${randomUUID()}','publish','${livePlacementKey}',1,'{}'::jsonb
  )`));
  assert.equal(published.placement.publication_status, "published");

  const publicRows = json(anonymous("select public.get_active_promotions_for_slots(array['courses.top.01','unknown.top.01']);"));
  assert.equal(publicRows.length, 1);
  assert.equal(publicRows[0].promotion_key, promotionKey);
  const serialized = JSON.stringify(publicRows);
  assert.doesNotMatch(serialized, /created_by|updated_by|actor_id|promotion_id|placement_id|\"id\"/);

  const detail = json(anonymous(`select public.get_public_promotion_detail('test-promotion-${process.pid}');`));
  assert.equal(detail.promotion_key, promotionKey);
  assert.doesNotMatch(JSON.stringify(detail), /created_by|updated_by|actor_id|promotion_id|\"id\"/);
});

test("isolated MARKET COURSES and COMMUNITY secondary slots publish and resolve in one batch", () => {
  const secondSlots = [
    "market.after_list.01",
    "courses.after_map.01",
    "community.after_posts.01",
  ];
  for (const slotCode of secondSlots) {
    const placement = json(rpc(`public.mutate_promotion_placement(
      '${randomUUID()}','create',null,null,${jsonSql({
        slot_code: slotCode,
        promotion_key: promotionKey,
        starts_at: liveStartsAt,
        ends_at: liveEndsAt,
      })}
    )`));
    const published = json(rpc(`public.mutate_promotion_placement(
      '${randomUUID()}','publish','${placement.placement.placement_key}',1,'{}'::jsonb
    )`));
    assert.equal(published.placement.publication_status, "published");
  }

  const batch = json(anonymous(`select public.get_active_promotions_for_slots(array[
    'market.list_top.01','market.after_list.01',
    'courses.top.01','courses.after_map.01',
    'community.top.01','community.after_posts.01'
  ]);`));
  assert.deepEqual(
    batch.map((row) => row.slot_code).sort(),
    ["community.after_posts.01", "courses.after_map.01", "courses.top.01", "market.after_list.01"],
  );
});

test("overlap is rejected while an adjacent half-open publication is allowed", () => {
  const overlap = json(rpc(`public.mutate_promotion_placement(
    '${randomUUID()}','create',null,null,${jsonSql({
      slot_code: "courses.top.01", promotion_key: promotionKey,
      starts_at: iso(0), ends_at: iso(2),
    })}
  )`));
  const rejected = rpc(`public.mutate_promotion_placement(
    '${randomUUID()}','publish','${overlap.placement.placement_key}',1,'{}'::jsonb
  )`);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /기간에 이미 게시된/);

  const adjacent = json(rpc(`public.mutate_promotion_placement(
    '${randomUUID()}','create',null,null,${jsonSql({
      slot_code: "courses.top.01", promotion_key: promotionKey,
      starts_at: liveEndsAt, ends_at: iso(3),
    })}
  )`));
  adjacentPlacementKey = adjacent.placement.placement_key;
  const published = json(rpc(`public.mutate_promotion_placement(
    '${randomUUID()}','publish','${adjacentPlacementKey}',1,'{}'::jsonb
  )`));
  assert.equal(published.placement.publication_status, "published");
  assert.equal(published.placement.display_status, "scheduled");
});

test("disabled HOF slot cannot publish and oversized batch input is rejected", () => {
  const disabled = json(rpc(`public.mutate_promotion_placement(
    '${randomUUID()}','create',null,null,${jsonSql({
      slot_code: "hall_of_fame.top.01", promotion_key: promotionKey,
      starts_at: iso(4), ends_at: iso(5),
    })}
  )`));
  const denied = rpc(`public.mutate_promotion_placement(
    '${randomUUID()}','publish','${disabled.placement.placement_key}',1,'{}'::jsonb
  )`);
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /사용할 수 없는 배너 슬롯/);
  const tooMany = anonymous(`select public.get_active_promotions_for_slots(array[${
    Array.from({ length: 21 }, (_, index) => `'unknown.top.${String(index).padStart(2, "0")}'`).join(",")
  }]);`);
  assert.notEqual(tooMany.status, 0);
  assert.match(tooMany.stderr, /20개 이하/);
});

test("same-slot concurrent publish race produces exactly one winner", async () => {
  const period = { starts_at: iso(6), ends_at: iso(7) };
  const first = json(rpc(`public.mutate_promotion_placement(
    '${randomUUID()}','create',null,null,${jsonSql({ slot_code: "news.top.01", promotion_key: promotionKey, ...period })}
  )`));
  const second = json(rpc(`public.mutate_promotion_placement(
    '${randomUUID()}','create',null,null,${jsonSql({ slot_code: "news.top.01", promotion_key: promotionKey, ...period })}
  )`));
  const requests = [randomUUID(), randomUUID()];
  const results = await Promise.all([
    authenticatedAsync(ids.admin, `select public.mutate_promotion_placement('${requests[0]}','publish','${first.placement.placement_key}',1,'{}'::jsonb);`),
    authenticatedAsync(ids.admin, `select public.mutate_promotion_placement('${requests[1]}','publish','${second.placement.placement_key}',1,'{}'::jsonb);`),
  ]);
  assert.equal(results.filter((result) => result.status === 0).length, 1);
  assert.equal(results.filter((result) => result.status !== 0).length, 1);
  assert.match(results.find((result) => result.status !== 0).stderr, /기간에 이미 게시된/);
  const integrity = json(sql(`select jsonb_build_object(
    'published',(select count(*) from public.promotion_placements where slot_code='news.top.01' and publication_status='published'),
    'failed_ledgers',(select count(*) from private.promotion_mutation_requests where request_id in ('${requests[0]}','${requests[1]}') and completed_at is null),
    'successful_ledgers',(select count(*) from private.promotion_mutation_requests where request_id in ('${requests[0]}','${requests[1]}') and completed_at is not null),
    'audits',(select count(*) from public.audit_logs where request_id in ('${requests[0]}','${requests[1]}'))
  );`, "postgres"));
  assert.deepEqual(integrity, { published: 1, failed_ledgers: 0, successful_ledgers: 1, audits: 1 });
});

test("HOME rail combinations allow long, short stacks, and opposite-side schedules", () => {
  const createAndPublish = (slotCode, startsAt, endsAt) => {
    const created = json(rpc(`public.mutate_promotion_placement(
      '${randomUUID()}','create',null,null,${jsonSql({
        slot_code: slotCode,
        promotion_key: promotionKey,
        starts_at: startsAt,
        ends_at: endsAt,
      })}
    )`));
    return json(rpc(`public.mutate_promotion_placement(
      '${randomUUID()}','publish','${created.placement.placement_key}',1,'{}'::jsonb
    )`));
  };

  const longPeriod = { startsAt: iso(8), endsAt: iso(9) };
  assert.equal(createAndPublish("home.rail_left.01", longPeriod.startsAt, longPeriod.endsAt).placement.publication_status, "published");
  assert.equal(createAndPublish("home.rail_right.01", longPeriod.startsAt, longPeriod.endsAt).placement.publication_status, "published");

  for (const slotCode of ["home.rail_left.short.01", "home.rail_right.short.01"]) {
    const created = json(rpc(`public.mutate_promotion_placement(
      '${randomUUID()}','create',null,null,${jsonSql({
        slot_code: slotCode,
        promotion_key: promotionKey,
        starts_at: longPeriod.startsAt,
        ends_at: longPeriod.endsAt,
      })}
    )`));
    const denied = rpc(`public.mutate_promotion_placement(
      '${randomUUID()}','publish','${created.placement.placement_key}',1,'{}'::jsonb
    )`);
    assert.notEqual(denied.status, 0);
    assert.match(denied.stderr, /긴 배너 게시 기간/);
  }

  const shortsPeriod = { startsAt: iso(10), endsAt: iso(11) };
  for (const side of ["left", "right"]) {
    for (const index of ["01", "02", "03"]) {
      assert.equal(
        createAndPublish(`home.rail_${side}.short.${index}`, shortsPeriod.startsAt, shortsPeriod.endsAt)
          .placement.publication_status,
        "published",
      );
    }
  }

  const mixedPeriod = { startsAt: iso(12), endsAt: iso(13) };
  assert.equal(createAndPublish("home.rail_left.01", mixedPeriod.startsAt, mixedPeriod.endsAt).placement.publication_status, "published");
  for (const slotCode of ["home.rail_right.short.01", "home.rail_right.short.02"]) {
    assert.equal(createAndPublish(slotCode, mixedPeriod.startsAt, mixedPeriod.endsAt).placement.publication_status, "published");
  }

  assert.equal(createAndPublish("home.rail_left.short.01", iso(14), iso(15)).placement.publication_status, "published");
});

test("concurrent same-side long and short publish produces exactly one winner", async () => {
  const period = { starts_at: iso(16), ends_at: iso(17) };
  const placements = ["home.rail_left.01", "home.rail_left.short.01"].map((slotCode) =>
    json(rpc(`public.mutate_promotion_placement(
      '${randomUUID()}','create',null,null,${jsonSql({ slot_code: slotCode, promotion_key: promotionKey, ...period })}
    )`)),
  );
  const requests = [randomUUID(), randomUUID()];
  const results = await Promise.all(placements.map((placement, index) =>
    authenticatedAsync(ids.admin, `select public.mutate_promotion_placement(
      '${requests[index]}','publish','${placement.placement.placement_key}',1,'{}'::jsonb
    );`),
  ));
  assert.equal(results.filter((result) => result.status === 0).length, 1);
  assert.equal(results.filter((result) => result.status !== 0).length, 1);
  assert.match(results.find((result) => result.status !== 0).stderr, /함께 게시할 수 없습니다/);
  const integrity = json(sql(`select jsonb_build_object(
    'published',(select count(*) from public.promotion_placements where placement_key in ('${placements[0].placement.placement_key}','${placements[1].placement.placement_key}') and publication_status='published'),
    'ledgers',(select count(*) from private.promotion_mutation_requests where request_id in ('${requests[0]}','${requests[1]}') and completed_at is not null),
    'audits',(select count(*) from public.audit_logs where request_id in ('${requests[0]}','${requests[1]}'))
  );`, "postgres"));
  assert.deepEqual(integrity, { published: 1, ledgers: 1, audits: 1 });
});

test("authenticated direct table and Storage metadata DML is denied", () => {
  const directPromotion = authenticated(ids.admin, "insert into public.promotions default values;");
  assert.notEqual(directPromotion.status, 0);
  assert.match(directPromotion.stderr, /permission denied/i);
  const directMedia = authenticated(ids.admin, "delete from storage.objects where bucket_id='promotion-media';");
  assert.notEqual(directMedia.status, 0);
  assert.match(directMedia.stderr, /permission denied|row-level security|Direct deletion from storage tables is not allowed/i);
});

test("hidden placements disappear publicly and finalized media can then be removed", () => {
  const rows = json(sql(`select coalesce(jsonb_agg(jsonb_build_object('key',placement_key,'version',version)), '[]'::jsonb)
    from public.promotion_placements
    where promotion_id=(select id from public.promotions where promotion_key='${promotionKey}')
      and publication_status='published';`, "postgres"));
  for (const row of rows) {
    const hidden = json(rpc(`public.mutate_promotion_placement(
      '${randomUUID()}','hide','${row.key}',${row.version},'{}'::jsonb
    )`));
    assert.equal(hidden.placement.publication_status, "hidden");
  }
  assert.deepEqual(json(anonymous("select public.get_active_promotions_for_slots(array['courses.top.01','news.top.01']);")), []);
  const removed = json(service(`select public.remove_promotion_media_for_service(
    '${ids.admin}','${randomUUID()}','${activeMediaKey}',2
  );`));
  assert.equal(removed.media_status, "removed");
  assert.equal(json(sql(`select count(*) from public.promotion_media where promotion_id=(select id from public.promotions where promotion_key='${promotionKey}') and media_status='available';`, "postgres")), 0);
});
