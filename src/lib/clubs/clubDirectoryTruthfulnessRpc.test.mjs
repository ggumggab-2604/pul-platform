import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const container = "supabase_db_pul-platform";
const database = `pul_club_truth_${process.pid}_${Date.now()}`;
const directory = fileURLToPath(new URL("../../../supabase/migrations/", import.meta.url));
const files = readdirSync(directory).filter(n => /^\d{14}_.+\.sql$/.test(n)).sort();
const actor = randomUUID(), applicant = randomUUID(), outsider = randomUUID();
const platform = randomUUID(), inactivePlatform = randomUUID();
const oldRequest = randomUUID(), newRequest = randomUUID(), applicationRequest = randomUUID();
let oldClub, hiddenClub, newClub, pending, snapshot;
function docker(args, input) {
  return spawnSync("docker", args, { input, encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
}
function sql(text) {
  return docker(["exec", "-i", container, "psql", "-U", "supabase_admin", "-d", database, "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"], text);
}
function ok(result) { assert.equal(result.status, 0, result.stderr.slice(-5000)); return result.stdout.trim(); }
function json(text) { return JSON.parse(ok(sql(text))); }
function auth(id, text) { return sql(`set request.jwt.claim.sub='${id}'; set request.jwt.claim.role='authenticated'; set role authenticated; ${text}`); }
function registration(request) {
  return `select public.register_club('${request}', '{"name":"TEST 정식 등록 동호회","region":"서울","district":"강동구","summary":"TEST 공식 등록 공개 경계 검증입니다.","recruitment_status":"recruiting"}');`;
}
function apply(name) {
  return `\n${readFileSync(directory + name, "utf8")}\ninsert into supabase_migrations.schema_migrations(version,name) values ('${name.slice(0,14)}','${name.slice(15,-4)}');\n`;
}
function preserved() {
  return json(`select jsonb_build_object(
    'club',(select to_jsonb(c)-'directory_is_public' from public.clubs c where id='${hiddenClub}'),
    'memberships',(select jsonb_agg(to_jsonb(m) order by id) from public.club_memberships m where club_id='${hiddenClub}'),
    'roles',(select jsonb_agg(to_jsonb(r) order by r.id) from public.club_role_assignments r join public.club_memberships m on m.id=r.membership_id where m.club_id='${hiddenClub}'),
    'applications',(select jsonb_agg(to_jsonb(a) order by id) from public.club_membership_applications a where club_id='${hiddenClub}'),
    'history',(select jsonb_agg(to_jsonb(h) order by id) from public.club_membership_application_status_history h where club_id='${hiddenClub}')); `);
}
before(() => {
  assert.equal(ok(docker(["ps","--filter","name=^supabase_db_pul-platform$","--format","{{.Names}}"])), container);
  ok(docker(["exec",container,"createdb","-U","supabase_admin","-O","postgres",database]));
  ok(docker(["exec",container,"sh","-lc",`pg_dump -U supabase_admin -d postgres --schema-only | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`]));
  // Isolated database only: retain Supabase platform schemas, rebuild every PUL migration.
  ok(sql("drop schema if exists private cascade; drop schema public cascade; create schema public authorization postgres; grant usage on schema public to anon, authenticated, service_role; delete from supabase_migrations.schema_migrations;"));
  ok(sql("begin;\n"+files.slice(0,-1).map(apply).join("\n")+"\ncommit;"));
  ok(sql(`set session_replication_role=replica;
    insert into auth.users(id,instance_id,aud,role,email,created_at,updated_at) values
    ('${actor}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','club-truth-actor@example.invalid',now(),now()),
    ('${applicant}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','club-truth-applicant@example.invalid',now(),now()),
    ('${outsider}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','club-truth-outsider@example.invalid',now(),now());
    insert into public.user_accounts(id,account_status,platform_role) values ('${actor}','active','member'),('${applicant}','active','member'),('${outsider}','active','member');
    set session_replication_role=origin;`));
  ok(sql(`set session_replication_role=replica;
    insert into public.user_accounts(id,account_status,platform_role) values
      ('${platform}','active','platform_admin'),('${inactivePlatform}','suspended','platform_admin');
    set session_replication_role=origin;`));
  oldClub=JSON.parse(ok(auth(actor,registration(oldRequest)))).public_key;
  hiddenClub=json("select to_jsonb(id) from public.clubs where legacy_key='1';");
  ok(sql(`set session_replication_role=replica;
    insert into public.club_memberships(club_id,user_id,membership_status) values ('${hiddenClub}','${actor}','active');
    insert into public.club_role_assignments(membership_id,role_code,assigned_by)
      select id,'club_admin','${actor}' from public.club_memberships where club_id='${hiddenClub}' and user_id='${actor}';
    set session_replication_role=origin;`));
  pending=JSON.parse(ok(auth(applicant,`select to_jsonb(r) from public.submit_club_membership_application('${hiddenClub}','beginner','weekend',array['regularRound'],'TEST 보존 신청',null,true,true,true,'${applicationRequest}') r;`)));
  snapshot=preserved();
  ok(sql("begin;\n"+apply(files.at(-1))+"\ncommit;"));
});
after(() => {
  ok(docker(["exec",container,"dropdb","--if-exists","--force","-U","supabase_admin",database]));
});
test("clean PUL chain applies all 84 versions in the isolated local database",()=>{
  assert.equal(files.length,84);
  assert.deepEqual(json("select jsonb_build_object('count',count(*),'latest',max(version)) from supabase_migrations.schema_migrations;"),{count:84,latest:"20260929000100"});
});
test("backfill preserves completed registration but excludes all unverified identities",()=>{
  assert.equal(json("select count(*) from public.clubs where directory_is_public;"),1);
  assert.equal(json(`select to_jsonb(directory_is_public) from public.clubs where legacy_key='${oldClub}';`),true);
  assert.equal(json(`select to_jsonb(directory_is_public) from public.clubs where id='${hiddenClub}';`),false);
  assert.deepEqual(preserved(),snapshot);
});
test("anon list, count, pagination and name search use the same public subset",()=>{
  const page=JSON.parse(ok(sql("set role anon; select public.list_public_clubs(null,null,null,null,1,0);")));
  assert.equal(page.total,1); assert.equal(page.items.length,1); assert.equal(page.items[0].public_key,oldClub);
  assert.equal(JSON.parse(ok(sql("set role anon; select public.list_public_clubs('한강',null,null,null,24,0);"))).total,0);
  assert.equal(JSON.parse(ok(sql("set role anon; select public.list_public_clubs(null,null,null,null,1,1);"))).items.length,0);
});
test("public detail and direct table reads do not expose the hidden club",()=>{
  assert.equal(ok(sql("set role anon; select public.get_public_club('1');")),"");
  assert.equal(ok(sql("set role anon; select count(*) from public.clubs where legacy_key='1';")),"0");
  assert.equal(JSON.parse(ok(sql(`set role anon; select public.get_public_club('${oldClub}');`))).public_key,oldClub);
  assert.equal(ok(auth(outsider,"select count(*) from public.clubs where legacy_key='1';")),"0");
});
test("hidden club core/media/events cannot be fetched through direct public RPCs",()=>{
  for(const name of ["get_club_core_content","get_club_media_content","get_club_event_participation"]) {
    assert.notEqual(sql(`set role anon; select public.${name}('${hiddenClub}');`).status,0);
    assert.notEqual(auth(outsider,`select public.${name}('${hiddenClub}');`).status,0);
    ok(auth(actor,`select public.${name}('${hiddenClub}');`));
  }
});
test("own-club manager identity, permissions, membership list and old applications remain usable",()=>{
  assert.equal(ok(auth(actor,"select count(*) from public.clubs where legacy_key='1';")),"1");
  ok(auth(actor,`select public.list_club_members_for_management('${hiddenClub}',20,null,null,null,null,null);`));
  ok(auth(actor,`select public.list_club_membership_applications('${hiddenClub}',null,20,null,null);`));
  ok(auth(actor,"select public.list_club_directory_correction_requests_for_management('1',null,20,0);"));
  assert.deepEqual(preserved(),snapshot);
});
test("new hidden-club application and inquiry fail without changing prior data",()=>{
  const app=auth(outsider,`select * from public.submit_club_membership_application('${hiddenClub}','beginner','weekend',array['regularRound'],'TEST 차단 신청',null,true,true,true,'${randomUUID()}');`);
  assert.notEqual(app.status,0); assert.match(app.stderr,/공개된 동호회/);
  const inquiry=auth(outsider,`select * from public.submit_club_join_inquiry('${hiddenClub}','beginner','weekend',array['regularRound'],'TEST 차단 문의','${randomUUID()}');`);
  assert.notEqual(inquiry.status,0); assert.match(inquiry.stderr,/공개된 동호회/);
  assert.deepEqual(preserved(),snapshot);
});
test("completed old application replay and applicant own-read survive public exclusion",()=>{
  const replay=JSON.parse(ok(auth(applicant,`select to_jsonb(r) from public.submit_club_membership_application('${hiddenClub}','beginner','weekend',array['regularRound'],'TEST 보존 신청',null,true,true,true,'${applicationRequest}') r;`)));
  assert.equal(replay.replayed,true); assert.equal(replay.application_id,pending.application_id);
  ok(auth(applicant,`select public.get_my_club_membership_application('${pending.application_id}');`));
  assert.deepEqual(preserved(),snapshot);
});
test("new official registration publishes atomically and replay does not republish or duplicate",()=>{
  newClub=JSON.parse(ok(auth(actor,registration(newRequest)))).public_key;
  assert.equal(json(`select to_jsonb(directory_is_public) from public.clubs where legacy_key='${newClub}';`),true);
  assert.equal(JSON.parse(ok(sql(`set role anon; select public.get_public_club('${newClub}');`))).public_key,newClub);
  ok(sql(`update public.clubs set directory_is_public=false where legacy_key='${newClub}';`));
  assert.equal(JSON.parse(ok(auth(actor,registration(newRequest)))).replayed,true);
  assert.equal(json(`select to_jsonb(directory_is_public) from public.clubs where legacy_key='${newClub}';`),false);
  assert.deepEqual(json(`select jsonb_build_object('audit',(select count(*) from public.audit_logs where request_id='${newRequest}'),'ledger',(select count(*) from private.club_mutation_requests where request_id='${newRequest}'));`),{audit:1,ledger:1});
});
test("public club still accepts new applications; authenticated cannot self-publish",()=>{
  const club=json(`select to_jsonb(id) from public.clubs where legacy_key='${oldClub}';`);
  ok(auth(outsider,`select * from public.submit_club_membership_application('${club}','beginner','weekend',array['regularRound'],'TEST 공개 신청',null,true,true,true,'${randomUUID()}');`));
  assert.notEqual(auth(actor,`update public.clubs set directory_is_public=true where id='${hiddenClub}';`).status,0);
  assert.equal(json("select to_jsonb(has_function_privilege('authenticated','private.publish_completed_club_registration()','execute'));"),false);
});

test("platform manager without membership reads hidden context and empty scoped Inbox while direct RLS still hides the club",()=>{
  assert.equal(json(`select count(*) from public.club_memberships where user_id='${platform}';`),0);
  assert.equal(ok(auth(platform,"select count(*) from public.clubs where legacy_key='1';")),"0");
  const context=JSON.parse(ok(auth(platform,"select public.get_club_directory_correction_management_context('1');")));
  assert.deepEqual(Object.keys(context),["name"]);
  assert.equal(context.name,snapshot.club.name);
  const page=JSON.parse(ok(auth(platform,"select public.list_club_directory_correction_requests_for_management('1',null,30,0);")));
  assert.equal(page.total,0); assert.deepEqual(page.items,[]);
});

test("own manager and platform manager share hidden/public correction context permissions",()=>{
  for(const key of ["1",oldClub]) for(const id of [actor,platform]) {
    const result=JSON.parse(ok(auth(id,`select public.get_club_directory_correction_management_context('${key}');`)));
    assert.deepEqual(Object.keys(result),["name"]); assert.ok(result.name.length>0);
    ok(auth(id,`select public.list_club_directory_correction_requests_for_management('${key}',null,30,0);`));
  }
});

test("unrelated and suspended platform actors cannot read hidden/public correction metadata or Inbox",()=>{
  for(const id of [outsider,inactivePlatform]) for(const key of ["1",oldClub]) {
    for(const expression of [`get_club_directory_correction_management_context('${key}')`,`list_club_directory_correction_requests_for_management('${key}',null,30,0)`]) {
      const result=auth(id,`select public.${expression};`);
      assert.notEqual(result.status,0); assert.match(result.stderr,/권한이 없습니다/);
      assert.ok(!result.stdout.includes(snapshot.club.name));
    }
  }
});

test("context RPC has exact read-only ACL/catalog and fails closed for anonymous/malformed/missing clubs",()=>{
  const catalog=json(`select jsonb_build_object('stable',provolatile='s','definer',prosecdef,'path',proconfig=array['search_path=""'],'anon',has_function_privilege('anon',oid,'execute'),'authenticated',has_function_privilege('authenticated',oid,'execute'),'service',has_function_privilege('service_role',oid,'execute')) from pg_proc where oid='public.get_club_directory_correction_management_context(text)'::regprocedure;`);
  assert.deepEqual(catalog,{stable:true,definer:true,path:true,anon:false,authenticated:true,service:false});
  assert.notEqual(sql("set role anon; select public.get_club_directory_correction_management_context('1');").status,0);
  assert.notEqual(sql("set role authenticated; select public.get_club_directory_correction_management_context('1');").status,0);
  for(const key of ["NULL","''","'!invalid'","'missing-test-club'"]) assert.notEqual(auth(platform,`select public.get_club_directory_correction_management_context(${key});`).status,0);
});

test("platform global Inbox/detail retains access to a hidden-club correction without public leakage",()=>{
  const created=JSON.parse(ok(auth(applicant,`select public.submit_club_directory_correction_request('${randomUUID()}','${oldClub}','{"target":"schedule","proposed_value":"TEST 수정 일정","reason":"TEST 공식 관리 검증"}');`)));
  ok(sql(`update public.clubs set directory_is_public=false where legacy_key='${oldClub}';`));
  try {
    const page=JSON.parse(ok(auth(platform,"select public.list_club_directory_correction_requests_for_management(null,null,30,0);")));
    assert.ok(page.items.some(item=>item.request_key===created.request_key && item.club_name));
    const detail=JSON.parse(ok(auth(platform,`select public.get_club_directory_correction_request_for_management('${created.request_key}');`)));
    assert.equal(detail.club_public_key,oldClub);
    assert.notEqual(auth(outsider,`select public.get_club_directory_correction_request_for_management('${created.request_key}');`).status,0);
    assert.equal(ok(sql(`set role anon; select public.get_public_club('${oldClub}');`)),"");
  } finally { ok(sql(`update public.clubs set directory_is_public=true where legacy_key='${oldClub}';`)); }
});
