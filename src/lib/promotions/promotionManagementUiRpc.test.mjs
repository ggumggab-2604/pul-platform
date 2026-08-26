import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const foundation = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/20260915000100_pul_promotion_banner_management_foundation.sql", import.meta.url)),
  "utf8",
);
const correction = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/20260916000100_pul_promotion_management_ui_read_model.sql", import.meta.url)),
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

const ids = {
  admin: randomUUID(),
  moderator: randomUUID(),
  member: randomUUID(),
};

let container;
let database;
let promotionKey;

before(() => {
  const found = docker(["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"])
    .stdout.split(/\r?\n/).filter(Boolean);
  assert.equal(found.length, 1, "one local Supabase database container is required");
  container = found[0];
  database = `pul_promotion_ui_${process.pid}_${Date.now()}`;
  const clone = docker([
    "exec", container, "sh", "-lc",
    [
      `createdb -U supabase_admin -O postgres ${database}`,
      `pg_dump -U supabase_admin -d postgres --schema-only | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
      `pg_dump -U supabase_admin -d postgres --data-only --disable-triggers | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
    ].join(" && "),
  ]);
  assert.equal(clone.status, 0, clone.stdout + clone.stderr);

  if (sql("select to_regclass('public.promotion_slots') is not null;").stdout.trim() !== "t") {
    const appliedFoundation = sql(`begin; ${foundation} commit;`, "postgres");
    assert.equal(appliedFoundation.status, 0, appliedFoundation.stdout + appliedFoundation.stderr);
  }
  if (sql("select to_regprocedure('public.list_promotion_slots_for_management()') is not null;").stdout.trim() !== "t") {
    const appliedCorrection = sql(`begin; ${correction} commit;`, "postgres");
    assert.equal(appliedCorrection.status, 0, appliedCorrection.stdout + appliedCorrection.stderr);
  }

  const authRows = Object.values(ids).map((id) =>
    `('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','promotion-ui-${id}@example.invalid','',now(),now(),now())`,
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

test("effective catalog has two authenticated manager read functions only", () => {
  const catalog = json(sql(`select jsonb_build_object(
    'slots_function', to_regprocedure('public.list_promotion_slots_for_management()') is not null,
    'overview_function', to_regprocedure('public.list_promotion_overviews_for_management(text,text[],text,text,integer,integer)') is not null,
    'slot_auth_execute', has_function_privilege('authenticated','public.list_promotion_slots_for_management()','EXECUTE'),
    'slot_anon_execute', has_function_privilege('anon','public.list_promotion_slots_for_management()','EXECUTE'),
    'overview_auth_execute', has_function_privilege('authenticated','public.list_promotion_overviews_for_management(text,text[],text,text,integer,integer)','EXECUTE'),
    'overview_anon_execute', has_function_privilege('anon','public.list_promotion_overviews_for_management(text,text[],text,text,integer,integer)','EXECUTE')
  );`, "postgres"));
  assert.deepEqual(catalog, {
    slots_function: true,
    overview_function: true,
    slot_auth_execute: true,
    slot_anon_execute: false,
    overview_auth_execute: true,
    overview_anon_execute: false,
  });
});

test("admin receives all 13 slots while anon member and moderator are denied", () => {
  const slots = json(authenticated(ids.admin, "select public.list_promotion_slots_for_management();"));
  assert.equal(slots.length, 13);
  assert.equal(slots.find((slot) => slot.slot_code === "hall_of_fame.top.01")?.is_enabled, false);

  assert.notEqual(anonymous("select public.list_promotion_slots_for_management();").status, 0);
  for (const actor of [ids.member, ids.moderator]) {
    const denied = authenticated(actor, "select public.list_promotion_slots_for_management();");
    assert.notEqual(denied.status, 0);
    assert.match(denied.stderr, /관리 권한이 없습니다/);
  }
});

test("bounded overview returns one card without N+1 detail reads and applies filters", () => {
  const created = json(authenticated(ids.admin, `select public.mutate_promotion(
    '${randomUUID()}','create',null,null,${jsonSql({
      content_kind: "pul_notice",
      title: "TEST 관리목록 배너",
      summary: "TEST 관리목록 read model 필터와 계산 상태 검증입니다.",
      link_type: "none",
    })}
  );`));
  promotionKey = created.promotion.promotion_key;
  const startsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const endsAt = new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString();
  json(authenticated(ids.admin, `select public.mutate_promotion_placement(
    '${randomUUID()}','create',null,null,${jsonSql({
      slot_code: "home.hero.01",
      promotion_key: promotionKey,
      starts_at: startsAt,
      ends_at: endsAt,
    })}
  );`));

  const page = json(authenticated(ids.admin, "select public.list_promotion_overviews_for_management('관리목록',array['home.hero.01'],'draft','pul_notice',30,0);"));
  assert.equal(page.total, 1);
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].promotion_key, promotionKey);
  assert.equal(page.items[0].display_status, "draft");
  assert.equal(page.items[0].primary_placement.slot_code, "home.hero.01");
  assert.equal("actor_id" in page.items[0], false);

  const otherArea = json(authenticated(ids.admin, "select public.list_promotion_overviews_for_management(null,array['clubs.top.01'],null,null,30,0);"));
  assert.equal(otherArea.total, 0);
});

test("invalid filters and direct table reads remain blocked", () => {
  const tooLarge = authenticated(ids.admin, "select public.list_promotion_overviews_for_management(null,null,null,null,101,0);");
  assert.notEqual(tooLarge.status, 0);
  assert.match(tooLarge.stderr, /범위를 확인/);
  const invalidSlot = authenticated(ids.admin, "select public.list_promotion_overviews_for_management(null,array['missing.top.01'],null,null,30,0);");
  assert.notEqual(invalidSlot.status, 0);
  assert.match(invalidSlot.stderr, /위치 필터/);
  const direct = authenticated(ids.admin, "select count(*) from public.promotion_slots;");
  assert.notEqual(direct.status, 0);
  assert.match(direct.stderr, /permission denied/i);
});
