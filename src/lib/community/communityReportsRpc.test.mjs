import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";

// Exact local container and a disposable schema-only database; never contacts the remote project.
const container = process.env.PUL_TEST_DB_CONTAINER ?? "supabase_db_pul-platform";
const database = `pul_community_reports_${process.pid}_${Date.now()}`;
const migration = readFileSync(new URL("../../../supabase/migrations/20260930000100_pul_community_reports.sql", import.meta.url), "utf8");
const ids = Object.fromEntries(["owner", "reporter", "admin", "moderator", "inactive", "post", "comment", "racePost"].map(key => [key, randomUUID()]));
const docker = (args, input) => spawnSync("docker", args, { input, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 120000 });
const sqlArgs = ["exec", "-i", container, "psql", "-U", "postgres", "-d", database, "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"];
const sql = text => docker(sqlArgs, `set statement_timeout='15s'; ${text}`);
const authSql = (actor, text) => `set request.jwt.claim.sub='${actor}'; set role authenticated; ${text}`;
const auth = (actor, text) => sql(authSql(actor, text));
const ok = result => { assert.equal(result.status, 0, result.stdout + result.stderr); return result.stdout.trim(); };
const json = result => JSON.parse(ok(result));
const denied = (result, pattern = /permission|community_report|로그인|정상 활동/) => { assert.notEqual(result.status, 0); assert.match(result.stderr, pattern); };
const submit = (type, id, reason = "spam", detail = "") => `select public.submit_community_report('${type}','${id}','${reason}','${detail}');`;
let created = false;
let postReport;
let commentReport;

before(() => {
  ok(docker(["exec", container, "createdb", "-U", "supabase_admin", "-O", "postgres", database]));
  created = true;
  const schema = docker(["exec", container, "pg_dump", "-U", "supabase_admin", "-d", "postgres", "--schema-only"]);
  ok(schema); ok(docker(sqlArgs.map(arg => arg === "postgres" ? "supabase_admin" : arg), schema.stdout));
  ok(sql(`begin; ${migration} commit;`));
  const users = [ids.owner, ids.reporter, ids.admin, ids.moderator, ids.inactive];
  ok(sql(`set session_replication_role=replica;
    insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
      ${users.map(id => `('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','report-${id}@example.invalid','',now(),now(),now())`).join(",")};
    insert into public.user_accounts(id,account_status) values ${users.map(id => `('${id}','active')`).join(",")};
    update public.user_accounts set platform_role='platform_admin' where id='${ids.admin}';
    update public.user_accounts set platform_role='platform_moderator' where id='${ids.moderator}';
    update public.user_accounts set account_status='suspended' where id='${ids.inactive}';
    insert into public.user_profiles(user_id,nickname,profile_visibility) values ${users.map((id, i) => `('${id}','TEST 회원 ${i}','private')`).join(",")};
    set session_replication_role=origin;
    insert into public.community_posts(id,author_user_id,category_code,title,body) values
      ('${ids.post}','${ids.owner}','free','TEST 신고 게시글','TEST 신고 대상 게시글 본문입니다.'),
      ('${ids.racePost}','${ids.owner}','free','TEST 동시 신고','TEST 동시 신고 대상 본문입니다.');
    insert into public.community_comments(id,post_id,author_user_id,body) values ('${ids.comment}','${ids.post}','${ids.owner}','TEST 신고 대상 댓글');`));
});
after(() => { if (created) ok(docker(["exec", container, "dropdb", "--if-exists", "--force", "-U", "supabase_admin", database])); });

test("report table is forced RLS and all client direct access is revoked", () => {
  assert.deepEqual(json(sql(`select jsonb_build_object('rls',relrowsecurity,'force',relforcerowsecurity) from pg_class where oid='public.community_reports'::regclass;`)), { rls: true, force: true });
  for (const role of ["anon", "authenticated", "service_role"]) {
    for (const statement of ["select * from public.community_reports", "delete from public.community_reports", "update public.community_reports set status='resolved'", "insert into public.community_reports default values"]) {
      denied(sql(`set role ${role}; ${statement};`), /permission denied/);
    }
  }
  assert.deepEqual(json(sql(`select coalesce(jsonb_agg(proname),'[]'::jsonb) from pg_proc where proname in ('submit_community_report','list_community_reports','resolve_community_report','community_assert_report_manager') and (not prosecdef or proconfig is distinct from array['search_path=""']);`)), []);
});

test("anonymous, forged absent identity, inactive accounts and self reports fail", () => {
  denied(sql(`set role anon; ${submit("post", ids.post)}`), /permission denied/);
  denied(sql(`set role authenticated; ${submit("post", ids.post)}`), /로그인/);
  for (const actor of [ids.inactive, randomUUID()]) denied(auth(actor, submit("post", ids.post)), /정상 활동/);
  for (const [type, id] of [["post", ids.post], ["comment", ids.comment]]) denied(auth(ids.owner, submit(type, id)), /community_report_self/);
});

test("only actual available targets and bounded valid reasons/details are accepted", () => {
  for (const type of ["post", "comment"]) denied(auth(ids.reporter, submit(type, randomUUID())), /target_unavailable/);
  denied(auth(ids.reporter, submit("comment", ids.post)), /target_unavailable/);
  denied(auth(ids.reporter, submit("bogus", ids.post)), /invalid/);
  denied(auth(ids.reporter, submit("post", ids.post, "bogus")), /invalid/);
  denied(auth(ids.reporter, submit("post", ids.post, "spam", "x".repeat(1001))), /invalid/);
  denied(auth(ids.reporter, `select public.submit_community_report(null,null,null,null);`), /invalid/);
  assert.deepEqual(json(auth(ids.reporter, submit("post", ids.post, "harassment", "  TEST 추가 설명  "))), { duplicate: false });
  assert.deepEqual(json(auth(ids.reporter, submit("comment", ids.comment, "other"))), { duplicate: false });
  const rows = json(sql("select jsonb_agg(jsonb_build_object('id',id,'reporter',reporter_user_id,'comment',comment_id,'detail',detail) order by comment_id nulls first) from public.community_reports;"));
  assert.equal(rows.length, 2); assert.ok(rows.every(row => row.reporter === ids.reporter));
  assert.equal(rows[0].detail, "TEST 추가 설명"); postReport = rows[0].id; commentReport = rows[1].id;
});

test("duplicate post/comment submissions retain original report and do not overwrite reason", () => {
  for (const [type, id] of [["post", ids.post], ["comment", ids.comment]]) assert.deepEqual(json(auth(ids.reporter, submit(type, id, "fraud", "changed"))), { duplicate: true });
  assert.equal(json(sql("select to_jsonb(count(*)) from public.community_reports;")), 2);
  assert.equal(json(sql(`select to_jsonb(reason) from public.community_reports where id='${postReport}';`)), "harassment");
});

test("concurrent duplicate requests create exactly one open report", async () => {
  const run = () => new Promise((resolve, reject) => {
    const child = spawn("docker", sqlArgs, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; }); child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject); child.on("close", status => resolve({ status, stdout, stderr }));
    child.stdin.end(`set statement_timeout='15s'; ${authSql(ids.reporter, submit("post", ids.racePost))}`);
  });
  const results = (await Promise.all([run(), run(), run()])).map(json);
  assert.equal(results.filter(result => !result.duplicate).length, 1);
  assert.equal(json(sql(`select to_jsonb(count(*)) from public.community_reports where post_id='${ids.racePost}';`)), 1);
});

test("ordinary members, unrelated moderators, anonymous and inactive admins cannot list or resolve", () => {
  for (const actor of [ids.reporter, ids.owner, ids.moderator, ids.inactive]) {
    denied(auth(actor, "select public.list_community_reports();"));
    denied(auth(actor, `select public.resolve_community_report('${postReport}');`));
  }
  denied(sql("set role anon; select public.list_community_reports();"), /permission denied/);
  denied(sql(`set role anon; select public.resolve_community_report('${postReport}');`), /permission denied/);
  ok(sql(`update public.user_accounts set account_status='suspended' where id='${ids.admin}';`));
  denied(auth(ids.admin, "select public.list_community_reports();"), /정상 활동/);
  denied(auth(ids.admin, `select public.resolve_community_report('${postReport}');`), /정상 활동/);
  ok(sql(`update public.user_accounts set account_status='active' where id='${ids.admin}';`));
});

test("platform admin lists exact target/body/reason/status without reporter PII and pages correctly", () => {
  const page = json(auth(ids.admin, "select public.list_community_reports('open',2,0);"));
  assert.equal(page.total, 3); assert.equal(page.items.length, 2); assert.equal(page.has_more, true);
  const last = json(auth(ids.admin, "select public.list_community_reports('open',2,2);"));
  assert.equal(last.items.length, 1); assert.equal(last.has_more, false);
  const rows = [...page.items, ...last.items];
  assert.equal(new Set(rows.map(row => row.id)).size, 3);
  const comment = rows.find(row => row.id === commentReport);
  assert.equal(comment.body, "TEST 신고 대상 댓글"); assert.equal(comment.target_type, "comment"); assert.equal(comment.post_id, ids.post);
  assert.doesNotMatch(JSON.stringify(rows), /reporter|email|phone|resolved_by|author_user_id/);
  for (const args of ["'bogus',20,0", "'all',51,0", "'all',20,-1", "null,20,0"]) denied(auth(ids.admin, `select public.list_community_reports(${args});`), /invalid/);
});

test("admin resolves idempotently and resolution permits a later new report", () => {
  const resolve = () => json(auth(ids.admin, `select public.resolve_community_report('${postReport}');`));
  assert.deepEqual(resolve(), { id: postReport, status: "resolved" });
  const metadata = () => json(sql(`select jsonb_build_object('at',resolved_at,'by',resolved_by) from public.community_reports where id='${postReport}';`));
  const first = metadata(); assert.equal(first.by, ids.admin); assert.ok(first.at);
  resolve(); assert.deepEqual(metadata(), first);
  assert.equal(json(auth(ids.admin, "select public.list_community_reports('resolved');")).total, 1);
  assert.deepEqual(json(auth(ids.reporter, submit("post", ids.post, "inappropriate"))), { duplicate: false });
  denied(auth(ids.admin, `select public.resolve_community_report('${randomUUID()}');`), /missing/);
});

test("removed comment and hidden/removed parent retain reports and operator content, reject fresh intake", () => {
  assert.equal(json(auth(ids.owner, `select public.mutate_community_comment('remove','${ids.post}','${ids.comment}',1,null);`)).removed, true);
  denied(auth(ids.reporter, submit("comment", ids.comment)), /target_unavailable/);
  let page = json(auth(ids.admin, "select public.list_community_reports('all');"));
  assert.equal(page.items.find(row => row.id === commentReport).target_state, "removed");
  ok(sql(`update public.community_posts set post_status='hidden' where id='${ids.post}';`));
  for (const [type, id] of [["post", ids.post], ["comment", ids.comment]]) denied(auth(ids.admin, submit(type, id)), /target_unavailable/);
  page = json(auth(ids.admin, "select public.list_community_reports('all');"));
  assert.equal(page.items.find(row => row.id === postReport).target_state, "hidden");
  ok(sql(`update public.community_posts set post_status='published' where id='${ids.post}';`));
  assert.equal(json(auth(ids.owner, `select public.mutate_community_post('remove','${ids.post}',1,'{}');`)).status, "removed");
  page = json(auth(ids.admin, "select public.list_community_reports('all');"));
  assert.equal(page.items.find(row => row.id === postReport).target_state, "removed");
  assert.equal(page.items.find(row => row.id === commentReport).body, "TEST 신고 대상 댓글");
  assert.equal(page.total, 4);
  assert.equal(json(auth(ids.admin, `select public.resolve_community_report('${commentReport}');`)).status, "resolved");
  denied(sql(`set role anon; select public.get_community_post('${ids.post}');`), /찾을 수 없습니다/);
  denied(sql(`delete from public.community_posts where id='${ids.post}';`), /foreign key constraint/);
});

test("disabled community permission fails closed", () => {
  ok(sql("update public.platform_permission_definitions set is_active=false where code='community.reports.manage';"));
  denied(auth(ids.admin, "select public.list_community_reports();"), /permission/);
  denied(auth(ids.admin, `select public.resolve_community_report('${postReport}');`), /permission/);
});
