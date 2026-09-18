import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { startMarketTestEnvironment, redact } from "../market/marketTestEnvironment.mjs";

// Reuse the isolated 87-migration bootstrap + official market migration (88).
// Never clone a running project's data or accept an external DB URL.
const migration = readFileSync(new URL("../../../supabase/migrations/20261004000100_pul_sec01_public_create_limits.sql", import.meta.url), "utf8");
const literal = (s) => "'" + String(s).replaceAll("'", "''") + "'";
const payload = (body) => literal(JSON.stringify({ category: "free", title: "SEC01 fixture", body }));
let env;
let parent;
let secondParent;
let hiddenParent;
let removedParent;
let course;
let secondCourse;
const scopes = [
  { name: "community_post", table: "community_posts", max: 5, cooldown: 20,
    call: (body) => `select public.mutate_community_post('create',null,null,${payload(body)});` },
  { name: "community_comment", table: "community_comments", max: 30, cooldown: 3,
    call: (body, target = parent) => `select public.mutate_community_comment('create','${target}',null,null,${literal(body)});` },
  { name: "course_discussion", table: "course_discussion_posts", max: 5, cooldown: 20,
    call: (body, target = "sec01-course") => `select public.submit_course_discussion_post(${literal(target)},${literal(body)});` },
  { name: "certification_study", table: "certification_study_posts", max: 5, cooldown: 20,
    call: (body) => `select public.submit_certification_study_post(${literal(body)});` },
];
const ok = (result) => { assert.equal(result.status, 0, redact(result.stderr + result.stdout)); return result.stdout.trim(); };
const json = (result) => JSON.parse(ok(result));
const sql = (text) => env.sql(text);
const actorSql = (id, text) => `set request.jwt.claim.sub = '${id}'; set role authenticated; ${text}`;
const actor = (id, text) => sql(actorSql(id, text));
const rejected = (result, pattern) => { assert.notEqual(result.status, 0); assert.match(result.stderr, pattern); };
function member(status = "active", role = "member") {
  const id = randomUUID();
  ok(sql(`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
    values ('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','${id}@example.invalid','',now(),now(),now());
    update public.user_accounts set account_status='${status}',platform_role='${role}' where id='${id}';`));
  return id;
}
function age(scope, id, seconds = 30) {
  ok(sql(`update public.${scope.table} set created_at=clock_timestamp()-interval '${seconds} seconds' where author_user_id='${id}';`));
}
function count(scope, id) { return Number(ok(sql(`select count(*) from public.${scope.table} where author_user_id='${id}';`))); }
function seed(scope, id, n) {
  const columns = scope.name === "community_post" ? "category_code,title," : scope.name === "community_comment" ? "post_id," : scope.name === "course_discussion" ? "course_id," : "";
  const values = scope.name === "community_post" ? "'free','SEC01 fixture'," : scope.name === "community_comment" ? `'${parent}',` : scope.name === "course_discussion" ? `'${course}',` : "";
  ok(sql(`insert into public.${scope.table}(author_user_id,${columns}body,created_at)
    select '${id}',${values}'SEC01 seeded content '||n,clock_timestamp()-interval '40 seconds' from generate_series(1,${n}) n;`));
}
function asyncSql(text) {
  assert.match(env.container, /^supabase_db_pul-market-test-\d+-[0-9a-f]{8}$/);
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["exec", "-i", env.container, "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", (b) => { stdout += b; });
    child.stderr.on("data", (b) => { stderr += b; });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(text);
  });
}
async function waitForHolder(name) {
  for (let i = 0; i < 50; i++) {
    if (ok(sql(`select exists(select 1 from pg_stat_activity where application_name='${name}' and wait_event='PgSleep');`)) === "t") return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail("concurrent transaction did not reach its held-lock barrier");
}
const catalog = () => json(sql(`select jsonb_build_object(
  'functions',(select jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('definition',pg_get_functiondef(p.oid),'acl',p.proacl::text))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind='f'),
  'relations',(select jsonb_agg(jsonb_build_object('name',n.nspname||'.'||c.relname,'kind',c.relkind,'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'acl',c.relacl::text) order by n.nspname,c.relname)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','storage')),
  'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p)
);`));

before(async () => {
  env = await startMarketTestEnvironment({ port: 55441 });
  const baseline = catalog();
  // First exercise transaction rollback, then apply exactly this candidate.
  ok(sql(`begin; ${migration} rollback;`));
  assert.deepEqual(catalog(), baseline);
  ok(sql(`begin; ${migration} commit;`));
  const candidate = catalog();
  assert.deepEqual(candidate.relations, baseline.relations);
  assert.deepEqual(candidate.policies, baseline.policies);
  for (const [signature, previous] of Object.entries(baseline.functions)) {
    if (scopes.some((s) => signature.startsWith(s.call("x").match(/public\.(\w+)/)[1] + "("))) {
      assert.equal(candidate.functions[signature].acl, previous.acl);
    } else assert.deepEqual(candidate.functions[signature], previous, `unrelated function changed: ${signature}`);
  }
  assert.deepEqual(Object.keys(candidate.functions).filter((key) => !Object.hasOwn(baseline.functions,key)), ["private.check_public_create_limit(text,text)"]);
  console.log("Official 88 effective schema + SEC01 candidate: rollback and unrelated catalog preservation PASS");
  const parentAuthor = member();
  [parent, secondParent, hiddenParent, removedParent] = [randomUUID(),randomUUID(),randomUUID(),randomUUID()];
  ok(sql(`insert into public.community_posts(id,author_user_id,category_code,title,body,post_status,removed_at,created_at) values
    ('${parent}','${parentAuthor}','free','SEC01 parent','SEC01 parent fixture body','published',null,now()-interval '1 day'),
    ('${secondParent}','${parentAuthor}','free','SEC01 parent 2','SEC01 parent fixture body 2','published',null,now()-interval '1 day'),
    ('${hiddenParent}','${parentAuthor}','free','SEC01 hidden','SEC01 hidden fixture body','hidden',null,now()-interval '1 day'),
    ('${removedParent}','${parentAuthor}','free','SEC01 removed','SEC01 removed fixture body','removed',now(),now()-interval '1 day');`));
  [course,secondCourse] = [randomUUID(),randomUUID()];
  ok(sql(`insert into public.courses(id,course_key,name,course_type,region,city,address,holes,operation_code,description,course_status) values
    ('${course}','sec01-course','SEC01 course','field','서울','서울','SEC01 fixture address',9,'walkIn','SEC01 course fixture description','active'),
    ('${secondCourse}','sec01-course-2','SEC01 course 2','field','서울','서울','SEC01 fixture address 2',9,'walkIn','SEC01 course fixture description 2','active');`));
});
after(async () => { if (env) await env.stop(); });

for (const scope of scopes) {
  test(`${scope.name}: first create, rapid repeat, separate member, normalized duplicate and expiry`, () => {
    const a=member(), b=member();
    ok(actor(a,scope.call("SEC01 first public content")));
    rejected(actor(a,scope.call("SEC01 another public content")),/PUL_CREATE_COOLDOWN/);
    assert.equal(count(scope,a),1);
    ok(actor(b,scope.call("SEC01 first public content")));
    age(scope,a);
    const otherTarget = scope.name === "community_comment" ? secondParent : scope.name === "course_discussion" ? "sec01-course-2" : undefined;
    rejected(actor(a,scope.call("SEC01\t first  public\ncontent",otherTarget)),/PUL_CREATE_DUPLICATE/);
    age(scope,a,601);
    ok(actor(a,scope.call("SEC01 first public content")));
    assert.equal(count(scope,a),2);
  });
  test(`${scope.name}: window admits last slot, rejects overflow, counts removed rows`, () => {
    const a=member();
    seed(scope,a,scope.max-1);
    ok(actor(a,scope.call("SEC01 last permitted slot")));
    age(scope,a);
    const state = scope.name === "community_comment" ? "removed_at=now()" : "post_status='removed',removed_at=now()";
    ok(sql(`update public.${scope.table} set ${state} where author_user_id='${a}';`));
    rejected(actor(a,scope.call("SEC01 must exceed quota")),/PUL_CREATE_QUOTA/);
    assert.equal(count(scope,a),scope.max);
    age(scope,a,601);
    ok(actor(a,scope.call("SEC01 after rolling window")));
  });
  test(`${scope.name}: concurrent last-slot calls serialize and see committed history`, async () => {
    const a=member(), b=member();
    seed(scope,a,scope.max-1);
    const label = "sec01_" + randomUUID().replaceAll("-","");
    const holder=asyncSql(`set application_name='${label}'; begin; ${actorSql(a,scope.call("SEC01 concurrency winner"))} select pg_sleep(2); commit;`);
    await waitForHolder(label);
    const contenders = [1,2,3].map((n) => asyncSql(actorSql(a,scope.call("SEC01 concurrent contender "+n))));
    // This must complete while A holds its lock: unrelated actors are independent.
    ok(actor(b,`set statement_timeout='1s'; ${scope.call("SEC01 independent actor")}`));
    ok(await holder);
    for (const result of await Promise.all(contenders)) rejected(result,/PUL_CREATE_COOLDOWN|PUL_CREATE_QUOTA/);
    assert.equal(count(scope,a),scope.max);
  });
  test(`${scope.name}: anon, missing actor, suspended/withdrawn and admin have expected boundaries`, () => {
    rejected(sql(`set role anon; ${scope.call("SEC01 anonymous denial")}`),/permission denied/);
    rejected(sql(`set role authenticated; ${scope.call("SEC01 missing identity")}`),/로그인/);
    for (const status of ["suspended","withdrawn"]) rejected(actor(member(status),scope.call("SEC01 inactive denial")),/정상 활동/);
    const admin=member("active","platform_admin");
    ok(actor(admin,scope.call("SEC01 admin normal create")));
    rejected(actor(admin,scope.call("SEC01 admin repeat create")),/PUL_CREATE_COOLDOWN/);
  });
}

test("action scopes are independent even while another scope lock is held", async () => {
  const a=member();
  const label="sec01_"+randomUUID().replaceAll("-","");
  const holder=asyncSql(`set application_name='${label}'; begin; ${actorSql(a,scopes[0].call("SEC01 scope independence"))} select pg_sleep(2); commit;`);
  await waitForHolder(label);
  for (const scope of scopes.slice(1)) ok(actor(a,`set statement_timeout='1s'; ${scope.call("SEC01 scope independence")}`));
  ok(await holder);
});

test("existing update/remove, owner/version and parent/publication contracts remain", () => {
  const a=member(), b=member();
  const post=json(actor(a,scopes[0].call("SEC01 editable initial post"))).post_id;
  rejected(actor(b,`select public.mutate_community_post('update','${post}',1,${payload("SEC01 stolen post update")});`),/본인의/);
  rejected(actor(a,`select public.mutate_community_post('update','${post}',99,${payload("SEC01 stale post update")});`),/새로고침/);
  assert.equal(json(actor(a,`select public.mutate_community_post('update','${post}',1,${payload("SEC01 legitimate post update")});`)).version,2);
  const comment=json(actor(a,scopes[1].call("SEC01 editable comment"))).comment_id;
  rejected(actor(b,`select public.mutate_community_comment('remove','${parent}','${comment}',1,null);`),/본인의/);
  rejected(actor(a,`select public.mutate_community_comment('update','${parent}','${comment}',99,'SEC01 stale comment');`),/새로고침/);
  assert.equal(json(actor(a,`select public.mutate_community_comment('update','${parent}','${comment}',1,'SEC01 updated comment');`)).version,2);
  assert.equal(json(actor(a,`select public.mutate_community_comment('remove','${parent}','${comment}',2,null);`)).removed,true);
  for (const target of [hiddenParent,removedParent,randomUUID()]) rejected(actor(a,scopes[1].call("SEC01 blocked parent",target)),/찾을 수 없습니다/);
  assert.equal(json(actor(a,`select public.mutate_community_post('remove','${post}',2,'{}');`)).status,"removed");
  rejected(actor(a,scopes[1].call("SEC01 removed parent",post)),/찾을 수 없습니다/);
  ok(sql(`update public.courses set course_status='inactive' where id='${secondCourse}';`));
  rejected(actor(a,scopes[2].call("SEC01 inactive course","sec01-course-2")),/찾을 수 없습니다/);
  const report=json(actor(b,`select public.submit_community_report('post','${parent}','spam','SEC01 fixture report');`));
  assert.equal(report.duplicate,false);
  assert.equal(json(actor(b,`select public.submit_community_report('post','${parent}','spam','SEC01 fixture report');`)).duplicate,true);
});

test("helper ACL, fixed actor/scope, RLS and snapshot isolation fail closed", () => {
  const a=member();
  for (const role of ["anon","authenticated","service_role"]) {
    assert.equal(ok(sql(`select has_function_privilege('${role}','private.check_public_create_limit(text,text)','execute');`)),"f");
  }
  rejected(actor(a,"select private.check_public_create_limit('community_post','SEC01 spoof attempt');"),/permission denied/);
  rejected(actor(a,`insert into public.community_posts(author_user_id,category_code,title,body) values ('${a}','free','SEC01 bypass','SEC01 bypass attempt');`),/permission denied|row-level security/);
  rejected(sql(`begin isolation level repeatable read; ${actorSql(a,scopes[0].call("SEC01 stale snapshot attempt"))} commit;`),/다시 시도/);
  assert.equal(count(scopes[0],a),0);
  const config=json(sql(`select jsonb_build_object('volatile',provolatile,'definer',prosecdef,'config',proconfig) from pg_proc where oid='private.check_public_create_limit(text,text)'::regprocedure;`));
  assert.equal(config.volatile,"v"); assert.equal(config.definer,true); assert.deepEqual(config.config,['search_path=""']);
});

test("create timestamp uses post-lock wall clock and rollback consumes no allowance", async () => {
  const a=member();
  ok(actor(a,`begin; ${scopes[0].call("SEC01 rolled back create")} rollback;`));
  assert.equal(count(scopes[0],a),0);
  const result=await asyncSql(`begin; select pg_sleep(1); ${actorSql(a,scopes[0].call("SEC01 wall clock create"))} reset role;
    select (extract(epoch from (created_at-transaction_timestamp()))>=0.9)::text from public.community_posts where author_user_id='${a}'; commit;`);
  assert.match(ok(result),/true$/);
});
