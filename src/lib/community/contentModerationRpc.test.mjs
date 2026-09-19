import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { startMarketTestEnvironment, redact } from "../market/marketTestEnvironment.mjs";

const read = name => readFileSync(new URL(`../../../supabase/migrations/${name}`, import.meta.url), "utf8");
const migration = read("20261005000100_pul_sec02_content_moderation.sql");
const sec01 = read("20261004000100_pul_sec01_public_create_limits.sql");
const literal = s => "'" + String(s).replaceAll("'", "''") + "'";
let env, admin, owner, member, moderator, parent, course;
const types = { post: "community_posts", comment: "community_comments", course: "course_discussion_posts", certification: "certification_study_posts" };
const ok = r => { assert.equal(r.status, 0, redact(r.stderr + r.stdout)); return r.stdout.trim(); };
const sql = text => env.sql(text);
const json = text => JSON.parse(ok(sql(text)));
const as = (id, text) => `set request.jwt.claim.sub='${id}'; set role authenticated; ${text}`;
const actor = (id, text) => sql(as(id, text));
const deny = (r, pattern = /permission|정상 활동|로그인/) => { assert.notEqual(r.status, 0); assert.match(r.stderr, pattern); };
function user(role = "member", status = "active") {
  const id = randomUUID();
  ok(sql(`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
    values('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','${id}@example.invalid','',now(),now(),now());
    update public.user_accounts set platform_role='${role}',account_status='${status}' where id='${id}';`));
  return id;
}
function content(type, author = owner) {
  const id = randomUUID();
  const columns = type === "post" ? "category_code,title," : type === "comment" ? "post_id," : type === "course" ? "course_id," : "";
  const values = type === "post" ? "'free','SEC02 fixture'," : type === "comment" ? `'${parent}',` : type === "course" ? `'${course}',` : "";
  ok(sql(`insert into public.${types[type]}(id,author_user_id,${columns}body) values('${id}','${author}',${values}'SEC02 original private test body');`));
  return id;
}
const version = type => ["post", "comment"].includes(type) ? 1 : 0;
const mutate = (type, id, action = "restrict", revision = 0, report = null, v = version(type)) => `select public.moderate_public_content('${type}','${id}','${action}','spam',${v},${revision},${report ? `'${report}'` : "null"});`;
const item = (type, id) => JSON.parse(ok(actor(admin, `select public.list_content_for_moderation('${type}','all','${id}');`))).items[0];
const report = (type, id, reporter = member) => {
  ok(actor(reporter, `select public.submit_community_report('${type}','${id}','spam','SEC02 report');`));
  return ok(sql(`select id from public.community_reports where reporter_user_id='${reporter}' and ${type === "post" ? "comment_id is null and post_id" : "comment_id"}='${id}' and status='open';`));
};
const contentState = (type, id) => json(`select jsonb_build_object('row',to_jsonb(t),
  'audit',(select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]'::jsonb) from public.audit_logs a where a.target_type='content.${type}' and a.target_id='${id}'))
  from public.${types[type]} t where t.id='${id}';`);
function restrictedChild(type) {
  const id=content(type), parentId=type==="comment"?content("post"):randomUUID();
  const key="sec02-"+parentId;
  if(type==="comment") ok(sql(`update public.community_comments set post_id='${parentId}' where id='${id}';`));
  else ok(sql(`insert into public.courses(id,course_key,name,course_type,region,city,address,holes,operation_code,description,course_status)
    values('${parentId}','${key}','SEC02 parent','field','서울','서울','test address',9,'walkIn','SEC02 parent fixture','active');
    update public.course_discussion_posts set course_id='${parentId}' where id='${id}';`));
  ok(actor(admin,mutate(type,id)));
  return {id,parentId,key};
}
const courseAction = (fixture, action) => `select public.mutate_managed_course('${action}','${fixture.key}',
  '${ok(sql(`select updated_at from public.courses where id='${fixture.parentId}';`))}','${randomUUID()}','{}');`;
function assertRestoreDenied(type,id,pattern=/moderation_parent_unavailable/) {
  const before=contentState(type,id);
  deny(actor(admin,mutate(type,id,"restore",1)),pattern);
  assert.deepEqual(contentState(type,id),before,"denial must preserve row, marker, both versions and audit");
}
const createCall = (type, body) => type === "post" ? `select public.mutate_community_post('create',null,null,${literal(JSON.stringify({category:"free",title:"SEC02 create",body}))});`
  : type === "comment" ? `select public.mutate_community_comment('create','${parent}',null,null,${literal(body)});`
    : type === "course" ? `select public.submit_course_discussion_post('sec02-course',${literal(body)});`
      : `select public.submit_certification_study_post(${literal(body)});`;
const snapshot = () => json(`select jsonb_build_object(
  'functions',(select jsonb_object_agg(p.oid::regprocedure::text,pg_get_functiondef(p.oid)||coalesce(p.proacl::text,'')) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind='f'),
  'columns',(select jsonb_agg(row(table_name,column_name,data_type,is_nullable,column_default)::text order by table_name,ordinal_position) from information_schema.columns where table_schema='public'),
  'constraints',(select jsonb_agg(pg_get_constraintdef(c.oid) order by c.oid) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public'),
  'policies',(select jsonb_agg(p::text order by schemaname,tablename,policyname) from pg_policies p)
);`);
function asyncSql(text) {
  assert.match(env.container, /^supabase_db_pul-market-test-\d+-[0-9a-f]{8}$/);
  return new Promise((resolve,reject) => {
    const child=spawn("docker",["exec","-i",env.container,"psql","-U","postgres","-d","postgres","-X","-q","-t","-A","-v","ON_ERROR_STOP=1"],{windowsHide:true,stdio:["pipe","pipe","pipe"]});
    let stdout="",stderr="";
    child.stdout.on("data",b=>stdout+=b); child.stderr.on("data",b=>stderr+=b);
    child.on("error",reject); child.on("close",status=>resolve({status,stdout,stderr})); child.stdin.end(text);
  });
}
async function barrier(label, event="PgSleep") {
  for(let n=0;n<50;n++) { if(ok(sql(`select exists(select 1 from pg_stat_activity where application_name='${label}' and ${event==="Lock"?"wait_event_type='Lock'":"wait_event='PgSleep'"});`))==="t") return; await new Promise(r=>setTimeout(r,50)); }
  assert.fail("held transaction barrier missing");
}

before(async () => {
  env=await startMarketTestEnvironment({port:55461});
  ok(sql(`begin; ${sec01} commit;`));
  const baseline=snapshot();
  ok(sql(`begin; ${migration} rollback;`));
  assert.deepEqual(snapshot(),baseline,"forward migration rollback restores catalog");
  ok(sql(`begin; ${migration} commit;`));
  const revised=snapshot();
  const changed=["list_community_posts(","get_community_post(","list_community_comments(","submit_community_report(","list_community_reports("];
  for(const [key,value] of Object.entries(baseline.functions)) if(!changed.some(prefix=>key.startsWith(prefix))) assert.equal(revised.functions[key],value,`unrelated/SEC01 function changed: ${key}`);
  assert.deepEqual(revised.policies,baseline.policies);
  console.log("Official 89 effective schema + SEC02 apply/rollback; SEC01 definitions unchanged PASS");
  admin=user("platform_admin"); owner=user(); member=user(); moderator=user("platform_moderator");
  parent=content("post",member); course=randomUUID();
  ok(sql(`insert into public.courses(id,course_key,name,course_type,region,city,address,holes,operation_code,description,course_status)
    values('${course}','sec02-course','SEC02 course','field','서울','서울','test address',9,'walkIn','SEC02 course description','active');`));
});
after(async () => { if(env) await env.stop(); });

for(const type of Object.keys(types)) {
  test(`${type}: permission, actor spoofing, target type and direct table bypass`, () => {
    const id=content(type);
    deny(sql(`set role anon; ${mutate(type,id)}`));
    deny(sql(`set role authenticated; ${mutate(type,id)}`));
    for(const who of [member,owner,moderator,user("platform_admin","suspended"),user("platform_admin","withdrawn")]) {
      deny(actor(who,mutate(type,id))); deny(actor(who,`select public.list_content_for_moderation('${type}');`));
    }
    for(const role of ["anon","authenticated"]) {
      const acl=json(`select jsonb_build_object('insert',has_table_privilege('${role}','public.${types[type]}','INSERT') or has_any_column_privilege('${role}','public.${types[type]}','INSERT'),'update',has_table_privilege('${role}','public.${types[type]}','UPDATE') or has_any_column_privilege('${role}','public.${types[type]}','UPDATE'),'delete',has_table_privilege('${role}','public.${types[type]}','DELETE'));`);
      assert.deepEqual(acl,{insert:false,update:false,delete:false});
    }
    deny(actor(owner,`update public.${types[type]} set moderation_hidden_at=null where id='${id}';`));
    deny(actor(admin,mutate(type,randomUUID())),/moderation_missing/);
    const foreign=content(type==="post"?"course":"post");
    deny(actor(admin,mutate(type,foreign)),/moderation_missing/);
    assert.equal(item(type,id).restricted,false);
    ok(actor(admin,mutate(type,id)));
    assert.equal(item(type,id).restricted,true);
  });
  test(`${type}: restrict/restore public filtering, audit, stale revision and preserved deletion`, () => {
    const id=content(type);
    const listed=()=>JSON.parse(ok(actor(admin,`select public.list_content_for_moderation('${type}','published','${id}');`))).total;
    assert.equal(listed(),1);
    ok(actor(admin,mutate(type,id)));
    assert.equal(listed(),0);
    let publicResult;
    if(type==="post") {
      deny(sql(`set role anon; select public.get_community_post('${id}');`),/찾을 수 없습니다/);
      publicResult=ok(sql("set role anon; select public.list_community_posts();"));
      deny(actor(owner,`select public.mutate_community_post('update','${id}',1,'{"category":"free","title":"SEC02 changed","body":"SEC02 updated body content"}');`),/찾을 수 없습니다/);
    } else if(type==="comment") {
      publicResult=ok(sql(`set role anon; select public.list_community_comments('${parent}');`));
      ok(actor(owner,`select public.mutate_community_comment('update','${parent}','${id}',1,'SEC02 owner edited while hidden');`));
      assert.equal(item(type,id).restricted,true);
    } else publicResult=ok(sql(`set role anon; select public.${type==="course"?"list_public_course_discussion_posts('sec02-course')":"list_public_certification_study_posts()"};`));
    const postKey=type==="course"||type==="certification" ? ok(sql(`select post_key from public.${types[type]} where id='${id}';`)) : id;
    assert.equal(publicResult.includes(postKey),false);
    deny(actor(admin,mutate(type,id,"restore",0)),/moderation_conflict/);
    ok(actor(admin,mutate(type,id,"restore",1,null,type==="comment"?2:version(type))));
    assert.equal(listed(),1);
    const audit=json(`select jsonb_agg(jsonb_build_object('actor',actor_id,'action',action,'reason',reason,'before',before_summary,'after',after_summary,'metadata',metadata) order by created_at) from public.audit_logs where target_type='content.${type}' and target_id='${id}';`);
    assert.equal(audit.length,2); assert.deepEqual(audit.map(a=>a.action),["content.restrict","content.restore"]);
    assert.ok(audit.every(a=>a.actor===admin&&a.reason==="spam"));
    assert.doesNotMatch(JSON.stringify(audit),/body|SEC02|email|reporter/);
    assert.deepEqual(Object.keys(audit[0].before).sort(),["moderation_version","restricted"]);
    ok(sql(`update public.${types[type]} set ${type==="comment"?"":"post_status='removed',"}removed_at=now() where id='${id}';`));
    deny(actor(admin,mutate(type,id,"restrict",2,null,type==="comment"?2:version(type))),/moderation_state/);
    deny(actor(admin,mutate(type,id,"restore",2,null,type==="comment"?2:version(type))),/moderation_state/);
  });
  test(`${type}: concurrent moderation serializes; stale action cannot reverse new decision`,async()=>{
    const id=content(type),label="sec02_"+randomUUID().replaceAll("-","");
    const first=asyncSql(`set application_name='${label}'; begin; ${as(admin,mutate(type,id))} select pg_sleep(2); commit;`);
    await barrier(label);
    const stale=asyncSql(as(admin,mutate(type,id,"restore",0)));
    ok(await first); deny(await stale,/moderation_conflict/);
    assert.equal(item(type,id).moderation_version,1);
    assert.equal(Number(ok(sql(`select count(*) from public.audit_logs where target_id='${id}';`))),1);
  });
  test(`${type}: SEC01 cooldown, duplicate and hidden/removed quota remain`,()=>{
    const who=user();
    ok(actor(who,createCall(type,"SEC02 regression first body")));
    deny(actor(who,createCall(type,"SEC02 regression second body")),/PUL_CREATE_COOLDOWN/);
    const id=ok(sql(`select id from public.${types[type]} where author_user_id='${who}';`));
    ok(actor(admin,mutate(type,id)));
    deny(actor(who,createCall(type,"SEC02 regression first body")),/PUL_CREATE_DUPLICATE/);
    const max=type==="comment"?30:5;
    for(let i=1;i<max;i++) content(type,who);
    ok(sql(`update public.${types[type]} set created_at=clock_timestamp()-interval '40 seconds' where author_user_id='${who}';`));
    deny(actor(who,createCall(type,"SEC02 overflow new body")),/PUL_CREATE_QUOTA/);
    ok(sql(`update public.${types[type]} set created_at=clock_timestamp()-interval '601 seconds' where author_user_id='${who}';`));
    ok(actor(who,createCall(type,"SEC02 regression first body")));
  });
}

test("report-only closure differs from atomic restrict+resolve; no automatic restriction",()=>{
  const id=content("post");
  const first=report("post",id);
  report("post",id,user()); report("post",id,user());
  assert.equal(item("post",id).restricted,false);
  ok(actor(admin,`select public.resolve_community_report('${first}');`));
  assert.equal(item("post",id).restricted,false);
  const second=report("post",id);
  const other=content("post");
  deny(actor(admin,mutate("post",other,"restrict",0,second)),/moderation_target_mismatch/);
  assert.equal(item("post",other).restricted,false);
  assert.equal(ok(sql(`select status from public.community_reports where id='${second}';`)),"open");
  ok(actor(admin,mutate("post",id,"restrict",0,second)));
  const state=json(`select jsonb_build_object('status',status,'actor',resolved_by,'timestamp',resolved_at is not null) from public.community_reports where id='${second}';`);
  assert.deepEqual(state,{status:"resolved",actor:admin,timestamp:true});
  deny(actor(admin,mutate("post",id,"restrict",1,second)),/moderation_conflict/);
});

test("comment report relationship, public counts, removed-during-restriction and parent visibility",()=>{
  const id=content("comment"), rid=report("comment",id);
  const before=json(`select public.get_community_post('${parent}');`).comment_count;
  ok(actor(admin,mutate("comment",id,"restrict",0,rid)));
  assert.equal(json(`select public.get_community_post('${parent}');`).comment_count,before-1);
  const summary=json(`select public.list_community_posts();`).items.find(x=>x.id===parent);
  assert.equal(summary.comment_count,before-1);
  deny(actor(member,`select public.submit_community_report('comment','${id}','spam','');`),/target_unavailable/);
  const reportItem=JSON.parse(ok(actor(admin,"select public.list_community_reports('all',50,0);"))).items.find(x=>x.id===rid);
  assert.equal(reportItem.target_state,"hidden");
  ok(actor(owner,`select public.mutate_community_comment('remove','${parent}','${id}',1,null);`));
  deny(actor(admin,mutate("comment",id,"restore",1,null,2)),/moderation_state/);
  const comment=content("comment"), wrongReport=report("comment",comment);
  const anotherParent=content("post");
  ok(sql(`update public.community_reports set post_id='${anotherParent}' where id='${wrongReport}';`));
  deny(actor(admin,mutate("comment",comment,"restrict",0,wrongReport)),/moderation_target_mismatch/);
  ok(actor(admin,mutate("comment",comment)));
  ok(sql(`update public.community_posts set post_status='hidden' where id='${parent}';`));
  assertRestoreDenied("comment",comment);
  deny(sql(`set role anon; select public.list_community_comments('${parent}');`),/찾을 수 없습니다/);
  ok(sql(`update public.community_posts set post_status='published' where id='${parent}';`));
  assert.equal(item("comment",comment).restricted,true);
  assert.equal(ok(sql(`set role anon; select public.list_community_comments('${parent}');`)).includes(comment),false);
});

test("R01 A/B: hidden parent denies restore; parent restoration never restores the child",()=>{
  const {id,parentId}=restrictedChild("comment");
  ok(actor(admin,mutate("post",parentId)));
  assert.equal(item("comment",id).parent_visible,false);
  assertRestoreDenied("comment",id);
  ok(actor(admin,mutate("post",parentId,"restore",1)));
  assert.equal(item("comment",id).restricted,true);
  const hidden=json(`select public.list_community_comments('${parentId}');`);
  assert.equal(hidden.total,0);assert.deepEqual(hidden.items,[]);
  assert.equal(json(`select public.get_community_post('${parentId}');`).comment_count,0);
  ok(actor(admin,mutate("comment",id,"restore",1)));
  assert.equal(json(`select public.list_community_comments('${parentId}');`).total,1);
});

test("R01 C: owner-removed parent denies child restore without state or audit changes",()=>{
  const {id,parentId}=restrictedChild("comment");
  ok(actor(owner,`select public.mutate_community_post('remove','${parentId}',1,null);`));
  assertRestoreDenied("comment",id);
  assert.equal(item("comment",id).parent_visible,false);
});

test("R01 D/E: inactive/removed course denies restore; reactivation still requires explicit child restore",()=>{
  const fixture=restrictedChild("course"),{id,parentId,key}=fixture;
  ok(actor(admin,courseAction(fixture,"deactivate")));
  assert.equal(item("course",id).parent_visible,false);
  assertRestoreDenied("course",id);
  ok(actor(admin,courseAction(fixture,"activate")));
  assert.equal(item("course",id).restricted,true);
  assert.equal(json(`select public.list_public_course_discussion_posts('${key}');`).total,0);
  ok(actor(admin,mutate("course",id,"restore",1)));
  assert.equal(json(`select public.list_public_course_discussion_posts('${key}');`).total,1);
  ok(actor(admin,mutate("course",id,"restrict",2)));
  ok(sql(`update public.courses set course_status='removed' where id='${parentId}';`));
  const before=contentState("course",id);
  deny(actor(admin,mutate("course",id,"restore",3)),/moderation_parent_unavailable/);
  assert.deepEqual(contentState("course",id),before);
});

test("R01: parent moderation marker blocks restore even if legacy status says published",()=>{
  const {id,parentId}=restrictedChild("comment");
  ok(sql(`update public.community_posts set moderation_hidden_at=clock_timestamp() where id='${parentId}';`));
  assert.equal(item("comment",id).parent_visible,false);
  assertRestoreDenied("comment",id);
});

for(const change of ["post_restrict","post_remove","course_deactivate"]) {
  test(`R01 F: ${change} wins parent lock; concurrent and subsequent restores preserve restriction`,async()=>{
    const type=change==="course_deactivate"?"course":"comment";
    const fixture=restrictedChild(type),{id,parentId}=fixture;
    const request=change==="course_deactivate"?courseAction(fixture,"deactivate")
      :change==="post_remove"?`select public.mutate_community_post('remove','${parentId}',1,null);`:mutate("post",parentId);
    const label="sec02_"+randomUUID().replaceAll("-","");
    const before=contentState(type,id);
    const changeParent=asyncSql(`set application_name='${label}'; begin; ${as(change==="post_remove"?owner:admin,request)} select pg_sleep(3); commit;`);
    await barrier(label);
    const restore=asyncSql(as(admin,`set statement_timeout='2s'; ${mutate(type,id,"restore",1)}`));
    deny(await restore,/moderation_conflict/);ok(await changeParent);
    assert.deepEqual(contentState(type,id),before);
    assertRestoreDenied(type,id);
    assert.equal(item(type,id).parent_visible,false);
  });
}

for(const type of ["comment","course"]) {
  test(`R01 F: ${type} restore holds parent eligibility through commit; later parent changes remain independent`,async()=>{
    const fixture=restrictedChild(type),{id,parentId,key}=fixture;
    const restoreLabel="sec02_"+randomUUID().replaceAll("-","");
    const parentLabel="sec02_"+randomUUID().replaceAll("-","");
    const parentChange=type==="comment"?mutate("post",parentId):courseAction(fixture,"deactivate");
    const restore=asyncSql(`set application_name='${restoreLabel}'; begin; ${as(admin,mutate(type,id,"restore",1))} select pg_sleep(4); commit;`);
    await barrier(restoreLabel);
    const change=asyncSql(`set application_name='${parentLabel}'; ${as(admin,`set statement_timeout='8s'; ${parentChange}`)}`);
    await barrier(parentLabel,"Lock");
    // Parent change cannot complete during restore. After restore commits, it is a
    // separate, later state transition; public reads still enforce parent visibility.
    ok(await restore);ok(await change);
    assert.equal(item(type,id).restricted,false);
    assert.equal(item(type,id).parent_visible,false);
    deny(sql(type==="comment"?`select public.list_community_comments('${parentId}');`
      :`select public.list_public_course_discussion_posts('${key}');`),/찾을 수 없습니다/);
  });
}

test("audit insertion failure rolls content and report back atomically",()=>{
  const id=content("post"),rid=report("post",id),before=contentState("post",id);
  ok(sql("alter table public.audit_logs add constraint sec02_test_audit_failure check (action <> 'content.restrict') not valid;"));
  try {
    deny(actor(admin,mutate("post",id,"restrict",0,rid)),/sec02_test_audit_failure/);
    assert.deepEqual(contentState("post",id),before);
    assert.equal(ok(sql(`select status from public.community_reports where id='${rid}';`)),"open");
  } finally {ok(sql("alter table public.audit_logs drop constraint sec02_test_audit_failure;"));}
});

test("pre-existing hidden state is never restored; transaction rollback preserves content/report/audit",()=>{
  for(const type of ["post","course","certification"]) {
    const id=content(type);
    ok(sql(`update public.${types[type]} set post_status='hidden' where id='${id}';`));
    deny(actor(admin,mutate(type,id,"restore")),/moderation_state/);
    deny(actor(admin,mutate(type,id)),/moderation_state/);
  }
  const id=content("post"),rid=report("post",id);
  ok(actor(admin,`begin; ${mutate("post",id,"restrict",0,rid)} rollback;`));
  assert.equal(item("post",id).restricted,false);
  assert.equal(ok(sql(`select status from public.community_reports where id='${rid}';`)),"open");
  assert.equal(ok(sql(`select count(*) from public.audit_logs where target_id='${id}';`)),"0");
});

test("report resolve race rejects stale combined action without partial restriction",async()=>{
  const id=content("post"),rid=report("post",id),label="sec02_"+randomUUID().replaceAll("-","");
  const first=asyncSql(`set application_name='${label}'; begin; ${as(admin,`select public.resolve_community_report('${rid}');`)} select pg_sleep(2); commit;`);
  await barrier(label);
  const contender=asyncSql(as(admin,mutate("post",id,"restrict",0,rid)));
  ok(await first); deny(await contender,/moderation_conflict/);
  assert.equal(item("post",id).restricted,false);
});

test("concurrent report submission and moderation follow content-before-report lock order",async()=>{
  const id=content("post"),rid=report("post",id),label="sec02_"+randomUUID().replaceAll("-","");
  const submit=asyncSql(`set application_name='${label}'; begin; select id from public.community_posts where id='${id}' for share;
    select pg_sleep(2); ${as(member,`select public.submit_community_report('post','${id}','spam','same report');`)} commit;`);
  await barrier(label);
  const moderation=asyncSql(as(admin,`set statement_timeout='8s'; ${mutate("post",id,"restrict",0,rid)}`));
  ok(await submit); ok(await moderation);
  assert.equal(item("post",id).restricted,true);
  assert.equal(ok(sql(`select status from public.community_reports where id='${rid}';`)),"resolved");
});

test("new RPC ACL/search_path/RLS and event/my-activity projections",()=>{
  const funcs=json(`select jsonb_agg(jsonb_build_object('anon',has_function_privilege('anon',p.oid,'execute'),'auth',has_function_privilege('authenticated',p.oid,'execute'),'service',has_function_privilege('service_role',p.oid,'execute'),'definer',prosecdef,'config',proconfig)) from pg_proc p where p.proname in ('list_content_for_moderation','moderate_public_content');`);
  assert.equal(funcs.length,2);
  for(const f of funcs) assert.deepEqual(f,{anon:false,auth:true,service:false,definer:true,config:['search_path=""']});
  assert.equal(ok(sql(`select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where oid in (${Object.values(types).map(t=>`'public.${t}'::regclass`).join(',')});`)),"t");
  const who=user(),id=content("post",who);
  ok(sql(`update public.community_posts set category_code='review',review_type='event',rating=5 where id='${id}';`));
  assert.ok(ok(sql("select public.list_public_event_reviews(6);")).includes(id));
  ok(actor(admin,mutate("post",id)));
  assert.equal(ok(sql("select public.list_public_event_reviews(6);")).includes(id),false);
  assert.equal(ok(actor(who,"select public.get_my_activity_overview();")).includes(id),false);
});
