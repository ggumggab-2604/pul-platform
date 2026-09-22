import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { before, after, test } from "node:test";
import { startMarketTestEnvironment, redact } from "../market/marketTestEnvironment.mjs";

// Exact disposable local stack; no external DB URL, linked project or real users.
const readMigration = name => readFileSync(new URL(`../../../supabase/migrations/${name}`, import.meta.url), "utf8");
const candidate = readMigration("20261006000100_pul_common_messaging_foundation.sql");
const lit = x => "'" + String(x).replaceAll("'", "''") + "'";
let env;
const ok = r => { assert.equal(r.status, 0, redact(r.stderr + r.stdout)); return r.stdout.trim(); };
const sql = q => env.sql(q);
const json = r => JSON.parse(ok(r));
const identity = (a,q) => `set request.jwt.claim.sub=${lit(a)}; set role authenticated; ${q}`;
const actor = (a,q) => sql(identity(a,q));
const denied = (r, pattern=/messaging_|permission denied/) => { assert.notEqual(r.status,0); assert.match(r.stderr,pattern); };
const sendSql = (b,body="한글 문의",request=randomUUID()) => `select public.send_messaging_message('${b}',${lit(body)},'${request}');`;
const send = (a,b,body,request) => json(actor(a,sendSql(b,body,request)));
const replySql = (m,body="답장입니다",request=randomUUID()) => `select public.reply_messaging_message('${m}',${lit(body)},'${request}');`;
const detail = (a,m,mark=false) => json(actor(a,`select public.get_messaging_message('${m}',${mark});`));
const box = (a,kind="inbox",args="") => json(actor(a,`select public.list_messaging_${kind}(${args});`));
const unread = a => Number(ok(actor(a,"select public.get_messaging_unread_count();")));
const count = a => Number(ok(sql(`select count(*) from public.messaging_messages where sender_user_id='${a}';`)));
const age = (a,seconds=4) => ok(sql(`update public.messaging_messages set created_at=clock_timestamp()-interval '${seconds} seconds' where sender_user_id='${a}';`));
const block = (a,b,value=true) => actor(a,`select public.set_messaging_block('${b}',${value});`);
function members(n=3, {status="active",role="member",complete=true}={}) {
  const ids = Array.from({length:n},()=>randomUUID());
  ok(sql(`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
    values ${ids.map(id=>`('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','${id}@example.invalid','',now(),now(),now())`).join(",")};
    update public.user_accounts set account_status='${status}',platform_role='${role}' where id in (${ids.map(lit).join(",")});
    ${complete ? `insert into public.consent_records(user_id,consent_type,consent_version,decision)
      select u::uuid,t,v,'granted' from unnest(array[${ids.map(lit).join(",")}]) u
      cross join (values('terms_required','terms-dev-v1'),('privacy_required','privacy-dev-v1')) c(t,v);` : ""}`));
  return ids;
}
// Trusted fixture seeding only, never a production bypass. Every row has a receipt.
function seed(a,recipients,n,{seconds=30,first=false,body="fixture",sameTime=true}={}) {
  ok(sql(`begin;
    with input as (select gen_random_uuid() id, n,
      (array[${recipients.map(lit).join(",")}]::uuid[])[1+((n-1)%${recipients.length})] recipient,
      clock_timestamp()-interval '${seconds} seconds' ${sameTime?"":"-n*interval '1 second'"} as sent_at from generate_series(1,${n}) n),
    inserted as (insert into public.messaging_messages(id,sender_user_id,body,body_hash,recipient_key,request_id,request_fingerprint,first_contact,created_at)
      select id,'${a}',${lit(body)}||n,encode(sha256(convert_to(${lit(body)}||n,'UTF8')),'hex'),encode(sha256(convert_to(recipient::text,'UTF8')),'hex'),gen_random_uuid(),'fixture',${first},sent_at from input returning id)
    insert into public.messaging_recipients(message_id,recipient_user_id,received_at)
      select i.id,i.recipient,i.sent_at from input i join inserted x on x.id=i.id;
    commit;`));
}
function asyncSql(q) {
  assert.match(env.container,/^supabase_db_pul-market-test-\d+-[0-9a-f]{8}$/);
  return new Promise((resolve,reject)=>{
    const p=spawn("docker",["exec","-i",env.container,"psql","-U","postgres","-d","postgres","-X","-q","-t","-A","-v","ON_ERROR_STOP=1"],{windowsHide:true,stdio:["pipe","pipe","pipe"]});
    let stdout="",stderr="";
    p.stdout.on("data",b=>stdout+=b); p.stderr.on("data",b=>stderr+=b);
    p.on("error",reject);p.on("close",status=>resolve({status,stdout,stderr}));p.stdin.end(q);
  });
}
async function barrier(label) {
  for(let i=0;i<80;i++) {
    if(ok(sql(`select exists(select 1 from pg_stat_activity where application_name='${label}' and wait_event='PgSleep');`))==="t")return;
    await new Promise(r=>setTimeout(r,50));
  }
  assert.fail("transaction did not reach lock barrier");
}
const catalog = () => json(sql(`select jsonb_build_object(
  'functions',(select jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('definition',pg_get_functiondef(p.oid),'acl',p.proacl::text,'owner',pg_get_userbyid(p.proowner))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind='f'),
  'relations',(select jsonb_object_agg(n.nspname||'.'||c.relname,jsonb_build_object('kind',c.relkind,'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'acl',c.relacl::text)) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','storage')),
  'policies',(select coalesce(jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname),'[]') from pg_policies p));`));

before(async()=>{
  env=await startMarketTestEnvironment({port:55461});
  for(const file of ["20261004000100_pul_sec01_public_create_limits.sql","20261005000100_pul_sec02_content_moderation.sql"]) ok(sql(`begin; ${readMigration(file)} commit;`));
  const baseline=catalog();
  ok(sql(`begin; ${candidate} rollback;`)); assert.deepEqual(catalog(),baseline);
  ok(sql(`begin; ${candidate} commit;`));
  const next=catalog();
  for(const [signature,value] of Object.entries(baseline.functions)) assert.deepEqual(next.functions[signature],value,signature);
  for(const [name,value] of Object.entries(baseline.relations)) assert.deepEqual(next.relations[name],value,name);
  assert.deepEqual(next.policies,baseline.policies);
  console.log("Official 90 effective migrations + candidate: transaction rollback and all existing function/ACL/policy preservation PASS");
  const blockList = readMigration("20261007000100_pul_messaging_block_list_read.sql");
  ok(sql(`begin; ${blockList} rollback;`)); assert.deepEqual(catalog(), next);
  ok(sql(`begin; ${blockList} commit;`));
  const extended = catalog();
  for (const [signature,value] of Object.entries(next.functions)) assert.deepEqual(extended.functions[signature],value,signature);
  for (const [name,value] of Object.entries(next.relations)) assert.deepEqual(extended.relations[name],value,name);
  assert.deepEqual(extended.policies,next.policies);
  assert.equal(Object.keys(extended.functions).length,Object.keys(next.functions).length+1);
  assert.deepEqual(Object.keys(extended.relations).filter(name=>!Object.hasOwn(next.relations,name)),["public.messaging_blocks_recent_idx"]);
  console.log("1B-1 rollback + existing 91 function definitions/owners/ACLs/RLS/policies preserved; exactly one function and one index added PASS");
  if (process.env.PUL_MESSAGING_MARKET_CANDIDATE === "1" || process.env.PUL_MESSAGING_BROADCAST_CANDIDATE === "1") {
    ok(sql(`begin; ${readMigration("20261008000100_pul_market_messaging_context.sql")} commit;`));
    console.log("1D candidate applied: running the complete existing 1B/1B-1 regression suite on candidate DB");
  }
  if (process.env.PUL_MESSAGING_BROADCAST_CANDIDATE === "1") {
    ok(sql(`begin; ${readMigration("20261009000100_pul_platform_broadcast_messaging.sql")} commit;`));
    console.log("1E candidate applied: complete existing 1B/1B-1 regression on broadcast DB");
  }
});
after(async()=>{if(env)await env.stop();});

test("send atomicity, Unicode/plain text, own inbox/sent, IDOR and unread",()=>{
  const [a,b,c]=members(); const m=send(a,b,"  한글 😀 <script>alert(1)</script> https://example.invalid\n문의  ");
  assert.equal(count(a),1);assert.equal(ok(sql(`select count(*) from public.messaging_recipients where message_id='${m.id}';`)),"1");
  assert.equal(box(b).items[0].id,m.id);assert.equal(box(a,"sent").items[0].id,m.id);
  assert.equal(box(c).items.length,0);assert.equal(unread(b),1);assert.equal(unread(a),0);
  assert.equal(detail(b,m.id).body,"한글 😀 <script>alert(1)</script> https://example.invalid\n문의");
  assert.equal(detail(b,m.id).counterpart_user_id,a);
  assert.equal(detail(a,m.id,true).read_at,null); assert.equal(unread(b),1);
  denied(actor(c,`select public.get_messaging_message('${m.id}',true);`),/messaging_not_found/);
  denied(actor(c,`select public.hide_messaging_message('${m.id}');`),/messaging_not_found/);
  for(const who of [a,c])denied(actor(who,`select public.mark_messaging_message_read('${m.id}');`),/messaging_not_found/);
  const first=detail(b,m.id,true).read_at;assert.ok(first);assert.equal(unread(b),0);
  assert.equal(detail(b,m.id,true).read_at,first);
  assert.equal(json(actor(b,`select public.mark_messaging_message_read('${m.id}');`)).read_at,first);
  assert.equal(detail(a,m.id,true).read_at,null);
});
test("anonymous, inactive/incomplete actors and recipients, self and invalid body denied",()=>{
  const [a,b]=members(2);
  denied(sql(`set role anon; ${sendSql(b)}`),/permission denied/);
  denied(sql(`set role authenticated; ${sendSql(b)}`),/messaging_login/);
  denied(actor(a,sendSql(a)),/messaging_recipient_unavailable/);
  for(const status of ["suspended","withdrawn"]){const [x]=members(1,{status});denied(actor(a,sendSql(x)),/messaging_recipient_unavailable/);denied(actor(x,sendSql(b)),/messaging_account_unavailable/);denied(actor(x,"select public.get_messaging_unread_count();"),/messaging_account_unavailable/);}
  const [x]=members(1,{complete:false});denied(actor(a,sendSql(x)),/messaging_recipient_unavailable/);denied(actor(x,sendSql(b)),/messaging_account_unavailable/);
  for(const body of ["", " \t\n", "\u00a0\u3000\u0085", "가".repeat(2001)])denied(actor(a,sendSql(b,body)),/messaging_invalid/);
  send(a,b,"😀".repeat(2000));assert.equal(count(a),1);
  denied(actor(a,`select public.send_messaging_message('${b}',null,'${randomUUID()}');`),/messaging_invalid/);
});
test("profile/consent relation required and current state rechecked",()=>{
  const [a,b]=members(2);ok(sql(`delete from public.user_profiles where user_id='${b}';`));
  denied(actor(a,sendSql(b)),/messaging_recipient_unavailable/);
  const [c]=members(1);ok(sql(`delete from public.consent_records where user_id='${c}' and consent_type='privacy_required';`));
  denied(actor(a,sendSql(c)),/messaging_recipient_unavailable/);
});
test("one-sided hide is independent, idempotent and removes own detail/unread",()=>{
  const [a,b]=members(2);const m=send(a,b);
  ok(actor(a,`select public.hide_messaging_message('${m.id}');`));ok(actor(a,`select public.hide_messaging_message('${m.id}');`));
  assert.equal(box(a,"sent").items.length,0);assert.equal(box(b).items.length,1);assert.equal(unread(b),1);
  denied(actor(a,`select public.get_messaging_message('${m.id}');`),/messaging_not_found/);
  denied(actor(a,replySql(m.id)),/messaging_not_found/);
  const response=json(actor(b,replySql(m.id)));assert.equal(box(a).items[0].id,response.id);
  const [c,d]=members(2);const other=send(c,d);ok(actor(d,`select public.hide_messaging_message('${other.id}');`));
  assert.equal(unread(d),0);assert.equal(box(d).items.length,0);assert.equal(box(c,"sent").items.length,1);
  denied(actor(d,replySql(other.id)),/messaging_not_found/);denied(actor(d,`select public.get_messaging_message('${other.id}',true);`),/messaging_not_found/);
});
test("reply is participant-only and derives recipient, including sender follow-up",()=>{
  const [a,b,c]=members();const m=send(a,b);const r=json(actor(b,replySql(m.id)));
  assert.equal(detail(a,r.id).reply_to_message_id,m.id);
  assert.equal(ok(sql(`select recipient_user_id from public.messaging_recipients where message_id='${r.id}';`)),a);
  denied(actor(c,replySql(m.id)),/messaging_not_found/);
  denied(actor(b,`select public.reply_messaging_message('${m.id}','${c}','forged','${randomUUID()}');`),/does not exist/);
  age(a);json(actor(a,replySql(m.id,"발신자 추가 문의")));
  ok(sql(`update public.user_accounts set account_status='withdrawn' where id='${a}';`));
  denied(actor(b,replySql(m.id,"종료 계정")),/messaging_recipient_unavailable/);
  assert.equal(detail(b,m.id).counterpart_display,"탈퇴한 회원");
});
test("symmetric block/unblock, no actor spoof, historical read retained",()=>{
  const [a,b,c]=members();const m=send(a,b);ok(block(a,b));age(a);
  denied(actor(a,sendSql(b)),/messaging_recipient_unavailable/);denied(actor(b,sendSql(a)),/messaging_recipient_unavailable/);
  denied(actor(b,replySql(m.id)),/messaging_recipient_unavailable/);assert.equal(detail(b,m.id).id,m.id);
  denied(block(a,a),/messaging_invalid/);ok(block(c,b));
  assert.equal(ok(sql(`select count(*) from public.messaging_blocks where blocker_user_id='${c}' and blocked_user_id='${b}';`)),"1");
  ok(block(a,b,false));send(a,b,"해제 후 전송");
  denied(actor(c,`select public.set_messaging_block('${a}','${b}',true);`),/does not exist/);
});
test("replay identical receipt, normalization, changed payload rejection, hidden/block replay acknowledgement",()=>{
  const [a,b,c]=members();const req=randomUUID(),m=send(a,b," 첫  문의\n내용 ",req);
  assert.deepEqual(send(a,b,"첫 문의 내용",req),m);assert.equal(count(a),1);
  denied(actor(a,sendSql(b,"다른 내용",req)),/messaging_replay_conflict/);
  denied(actor(a,sendSql(c,"첫 문의 내용",req)),/messaging_replay_conflict/);
  ok(actor(a,`select public.hide_messaging_message('${m.id}');`));ok(block(b,a));
  assert.deepEqual(send(a,b,"첫 문의 내용",req),m);assert.equal(count(a),1);
  const [d,e]=members(2);const original=send(d,e),key=randomUUID();const reply=json(actor(e,replySql(original.id,"같은 답장",key)));
  ok(actor(e,`select public.hide_messaging_message('${original.id}');`));
  assert.deepEqual(json(actor(e,replySql(original.id,"같은 답장",key))),reply);
});
test("failed insert rolls back origin and quota; delivery invariant rejects zero/two recipients",()=>{
  const [a,b]=members(2);
  ok(sql(`create function private.messaging_test_fail() returns trigger language plpgsql as $$ begin raise exception 'fixture_failure'; end $$;
    create trigger messaging_test_fail before insert on public.messaging_recipients for each row execute function private.messaging_test_fail();`));
  try{denied(actor(a,sendSql(b)),/fixture_failure/);assert.equal(count(a),0);}finally{ok(sql("drop trigger messaging_test_fail on public.messaging_recipients; drop function private.messaging_test_fail();"));}
  send(a,b);assert.equal(count(a),1);
  denied(sql(`insert into public.messaging_messages(sender_user_id,body,body_hash,recipient_key,request_id,request_fingerprint,first_contact) values('${a}','orphan','x','x',gen_random_uuid(),'x',false);`),/messaging_delivery_invariant/);
  const [c]=members(1);const m=box(b).items[0];
  denied(sql(`insert into public.messaging_recipients select '${m.id}','${c}',created_at,null,null from public.messaging_messages where id='${m.id}';`),/messaging_delivery_invariant/);
});

test("cooldown boundary, normalized duplicate window, case preserved, failed/replay quota",()=>{
  const [a,b]=members(2);const key=randomUUID();const m=send(a,b,"한글\t test",key);
  denied(actor(a,sendSql(b,"다른 내용")),/messaging_cooldown/);assert.equal(count(a),1);
  assert.deepEqual(send(a,b,"한글 test",key),m);age(a,3.1);
  denied(actor(a,sendSql(b,"한글  test")),/messaging_duplicate/);send(a,b,"한글 TEST");
  age(a,601);send(a,b,"한글 test");assert.equal(count(a),3);
});
test("sender 10-minute last slot/overflow/expiry and hidden quota",()=>{
  const [a,...targets]=members(5);seed(a,targets,19);
  send(a,targets[0],"last slot");age(a);ok(sql(`update public.messaging_messages set sender_hidden_at=now() where sender_user_id='${a}'; update public.messaging_recipients set hidden_at=now() where message_id in(select id from public.messaging_messages where sender_user_id='${a}');`));
  denied(actor(a,sendSql(targets[1],"overflow")),/messaging_quota/);assert.equal(count(a),20);
  age(a,601);send(a,targets[1],"expiry");
});
test("sender 24-hour last slot/overflow/expiry",()=>{
  const [a,b]=members(2);seed(a,[b],99,{seconds:700});send(a,b,"day last");age(a,700);
  denied(actor(a,sendSql(b,"day overflow")),/messaging_quota/);age(a,86401);send(a,b,"day expiry");
});
test("same recipient last slot/overflow/expiry",()=>{
  const [a,b]=members(2);seed(a,[b],9);send(a,b,"recipient last");age(a);
  denied(actor(a,sendSql(b,"recipient overflow")),/messaging_recipient_quota/);age(a,601);send(a,b,"recipient expiry");
});
test("first lifetime contact 10-minute and daily budgets; established contacts/replies count normally",()=>{
  const [a,...bs]=members(8);seed(a,bs.slice(0,4),4,{first:true});send(a,bs[4],"new fifth");age(a);
  denied(actor(a,sendSql(bs[5],"new sixth")),/messaging_new_recipient_quota/);send(a,bs[0],"old partner");
  age(a,601);send(a,bs[5],"new after window");
  const [c,...ds]=members(22);seed(c,ds.slice(0,19),19,{seconds:700,first:true});send(c,ds[19],"new day twentieth");age(c,700);
  denied(actor(c,sendSql(ds[20],"new day overflow")),/messaging_new_recipient_quota/);send(c,ds[0],"established day");
  age(c,86401);send(c,ds[20],"new day expiry");
  assert.equal(ok(sql(`select first_contact from public.messaging_messages where sender_user_id='${c}' and body='established day';`)),"f");
});
test("same normalized body across recipients max three, expiry",()=>{
  const [a,...bs]=members(5);for(let i=0;i<3;i++){send(a,bs[i],"동일 본문");age(a);}
  denied(actor(a,sendSql(bs[3],"동일\t본문")),/messaging_duplicate/);age(a,601);send(a,bs[3],"동일 본문");
});

test("block wins actual connection race: send sees committed block",async()=>{
  const [a,b]=members(2),label="msg_block_"+randomUUID().replaceAll("-","");
  const holder=asyncSql(`set application_name='${label}'; begin; ${identity(a,`select public.set_messaging_block('${b}',true);`)} select pg_sleep(2); commit;`);
  await barrier(label);const contender=asyncSql(identity(b,sendSql(a)));
  ok(await holder);denied(await contender,/messaging_recipient_unavailable/);assert.equal(count(b),0);
});
test("send wins actual connection race: one message remains, future sends denied",async()=>{
  const [a,b]=members(2),label="msg_send_"+randomUUID().replaceAll("-","");
  const holder=asyncSql(`set application_name='${label}'; begin; ${identity(a,sendSql(b))} select pg_sleep(2); commit;`);
  await barrier(label);const contender=asyncSql(identity(b,`select public.set_messaging_block('${a}',true);`));
  ok(await holder);ok(await contender);assert.equal(count(a),1);denied(actor(a,sendSql(b,"later")),/messaging_recipient_unavailable/);
});
test("same request concurrent retry produces exactly one receipt",async()=>{
  const [a,b]=members(2),req=randomUUID(),label="msg_replay_"+randomUUID().replaceAll("-","");
  const holder=asyncSql(`set application_name='${label}'; begin; ${identity(a,sendSql(b,"concurrent",req))} select pg_sleep(2); commit;`);
  await barrier(label);const contenders=[1,2].map(()=>asyncSql(identity(a,sendSql(b,"concurrent",req))));
  ok(await holder);const results=await Promise.all(contenders);assert.deepEqual(json(results[0]),json(results[1]));assert.equal(count(a),1);
});
test("last sender slot shared across different recipients, other sender independent",async()=>{
  const [a,b,c,d,e]=members(5);seed(a,[b,c,d],19);const label="msg_quota_"+randomUUID().replaceAll("-","");
  const holder=asyncSql(`set application_name='${label}'; begin; ${identity(a,sendSql(b,"winner"))} select pg_sleep(2); commit;`);
  await barrier(label);const contender=asyncSql(identity(a,sendSql(c,"loser")));
  ok(actor(e,`set statement_timeout='1s'; ${sendSql(d,"independent")}`));ok(await holder);denied(await contender,/messaging_cooldown|messaging_quota/);assert.equal(count(a),20);
});
test("repeated-read/serializable cannot bypass post-lock committed-history checks",()=>{
  const [a,b]=members(2);for(const level of ["repeatable read","serializable"])
    denied(actor(a,`begin isolation level ${level}; ${sendSql(b)} commit;`),/messaging_retry_transaction/);
});
test("queued send rechecks actor after waiting and opposite-direction sends do not deadlock",async()=>{
  const [a,b]=members(2),label="msg_status_"+randomUUID().replaceAll("-","");
  const holder=asyncSql(`set application_name='${label}'; begin; select pg_advisory_xact_lock(1297303345,hashtext('${a}')); select pg_sleep(3); commit;`);
  await barrier(label);const queued=asyncSql(identity(a,sendSql(b)));
  ok(sql(`update public.user_accounts set account_status='suspended' where id='${a}';`));
  ok(await holder);denied(await queued,/messaging_account_unavailable/);assert.equal(count(a),0);
  const [c,d]=members(2);const result=await Promise.all([
    asyncSql(identity(c,`set statement_timeout='5s'; ${sendSql(d,"opposite C")}`)),
    asyncSql(identity(d,`set statement_timeout='5s'; ${sendSql(c,"opposite D")}`)),
  ]);for(const r of result)ok(r);assert.equal(count(c),1);assert.equal(count(d),1);
});

test("report recipient-only, duplicate open report, hide-independent evidence, no automatic deletion",()=>{
  const [a,b,c]=members();const m=send(a,b,"신고 증거");const q=`select public.submit_messaging_report('${m.id}','spam','추가 설명');`;
  denied(actor(a,q),/messaging_not_found/);denied(actor(c,q),/messaging_not_found/);
  const report=json(actor(b,q));assert.equal(report.duplicate,false);assert.deepEqual(json(actor(b,q)),{...report,duplicate:true});
  ok(actor(b,`select public.hide_messaging_message('${m.id}');`));assert.equal(json(actor(b,q)).duplicate,true);assert.equal(count(a),1);
  denied(actor(b,`select public.submit_messaging_report('${m.id}','wrong','');`),/messaging_invalid/);
  denied(actor(b,`select public.submit_messaging_report('${m.id}','other',${lit("가".repeat(1001))});`),/messaging_invalid/);
});
test("report operator permission, narrow DTO, audited read/resolve, no arbitrary message access",()=>{
  const [a,b,c]=members();const [admin]=members(1,{role:"platform_admin"});const [moderator]=members(1,{role:"platform_moderator"});
  const m=send(a,b,"private evidence do not audit"),r=json(actor(b,`select public.submit_messaging_report('${m.id}','harassment','private detail');`));
  for(const who of [a,c,moderator])denied(actor(who,`select public.get_messaging_report('${r.id}');`),/messaging_permission/);
  denied(actor(admin,`select public.get_messaging_message('${m.id}');`),/messaging_not_found/);
  denied(actor(admin,`select public.get_messaging_report('${randomUUID()}');`),/messaging_not_found/);
  denied(actor(admin,`select public.get_messaging_report('${r.id}','${randomUUID()}');`),/does not exist/);
  const listed=json(actor(admin,"select public.list_messaging_reports();"));assert.ok(listed.items.some(x=>x.id===r.id));assert.ok(!JSON.stringify(listed).includes("private evidence"));
  const dto=json(actor(admin,`select public.get_messaging_report('${r.id}');`));assert.equal(dto.body,"private evidence do not audit");
  assert.deepEqual(Object.keys(dto).sort(),["id","message_id","body","sender_display","reporter_display","reason","detail","status","created_at","message_created_at","resolved_at"].sort());
  const before=Number(ok(sql(`select count(*) from public.audit_logs where target_id='${r.id}';`)));assert.equal(before,1);
  ok(actor(admin,`select public.resolve_messaging_report('${r.id}');`));ok(actor(admin,`select public.resolve_messaging_report('${r.id}');`));
  const logs=ok(sql(`select coalesce(jsonb_agg(to_jsonb(a)),'[]') from public.audit_logs a where target_id='${r.id}';`));assert.ok(!logs.includes("private evidence"));assert.ok(!logs.includes("private detail"));assert.equal(JSON.parse(logs).length,2);
  ok(sql(`update public.user_accounts set account_status='suspended' where id='${admin}';`));denied(actor(admin,`select public.get_messaging_report('${r.id}');`),/messaging_account_unavailable/);
  ok(sql(`update public.user_accounts set account_status='active' where id='${admin}'; delete from public.platform_role_permissions where permission_code='messaging.reports.manage' and platform_role='platform_admin';`));
  try{denied(actor(admin,`select public.get_messaging_report('${r.id}');`),/messaging_permission/);}finally{ok(sql("insert into public.platform_role_permissions(platform_role,permission_code) values('platform_admin','messaging.reports.manage');"));}
});
test("report daily quota and expiry, duplicates do not consume extra slots",()=>{
  const [a,b]=members(2);seed(a,[b],21,{seconds:700});const ids=box(b,"inbox","50").items.map(x=>x.id);
  for(const id of ids.slice(0,20))json(actor(b,`select public.submit_messaging_report('${id}','spam','');`));
  assert.equal(json(actor(b,`select public.submit_messaging_report('${ids[0]}','spam','');`)).duplicate,true);
  denied(actor(b,`select public.submit_messaging_report('${ids[20]}','spam','');`),/messaging_report_quota/);
  ok(sql(`update public.messaging_reports set created_at=clock_timestamp()-interval '25 hours' where reporter_user_id='${b}';`));
  json(actor(b,`select public.submit_messaging_report('${ids[20]}','spam','');`));
});
test("profile privacy, withdrawal and supported synthetic hard-delete FK behavior",()=>{
  const [a,b]=members(2);ok(sql(`update public.user_profiles set nickname='비공개 닉네임',profile_visibility='private' where user_id='${a}';`));
  const m=send(a,b);assert.equal(detail(b,m.id).counterpart_display,"PUL 회원");
  ok(sql(`update public.user_profiles set profile_visibility='members' where user_id='${a}';`));assert.equal(detail(b,m.id).counterpart_display,"PUL 회원");
  ok(sql(`update public.user_profiles set profile_visibility='public' where user_id='${a}';`));assert.equal(detail(b,m.id).counterpart_display,"비공개 닉네임");
  const report=json(actor(b,`select public.submit_messaging_report('${m.id}','spam','');`));
  const replyRequest=randomUUID(),reply=json(actor(b,replySql(m.id,"reply before deletion",replyRequest)));
  ok(sql(`delete from auth.users where id='${a}';`));assert.equal(detail(b,m.id).counterpart_display,"탈퇴한 회원");
  assert.deepEqual(json(actor(b,replySql(m.id,"reply before deletion",replyRequest))),reply);
  denied(actor(b,replySql(m.id)),/messaging_recipient_unavailable/);assert.equal(ok(sql(`select count(*) from public.messaging_messages where id='${m.id}';`)),"1");
  ok(sql(`delete from auth.users where id='${b}';`));assert.equal(ok(sql(`select reporter_user_id is null from public.messaging_reports where id='${report.id}';`)),"t");
  assert.equal(ok(sql(`select count(*) from public.messaging_messages where id='${m.id}';`)),"1");
  const [c,d]=members(2);const other=send(c,d);ok(sql(`delete from auth.users where id='${d}';`));assert.equal(detail(c,other.id).counterpart_display,"탈퇴한 회원");
});
test("cursor pagination default/max, same timestamp, inserted rows and unread isolation",()=>{
  const [a,b,c]=members();seed(a,[b],55,{seconds:700});
  ok(sql(`update public.messaging_messages set created_at='2026-01-01 00:00:00.123456+00' where sender_user_id='${a}'; update public.messaging_recipients set received_at='2026-01-01 00:00:00.123456+00' where recipient_user_id='${b}';`));
  assert.equal(box(b).items.length,20);assert.equal(box(a,"sent","50").items.length,50);assert.equal(unread(b),55);assert.equal(unread(c),0);
  for(const [who,kind] of [[b,"inbox"],[a,"sent"]]){
    let page=box(who,kind),ids=page.items.map(x=>x.id);const firstCursor=page.next_cursor;
    assert.ok(firstCursor.at.includes("123456"));
    if(kind==="inbox")send(c,b,"new arrival while paging"); else send(a,b,"new sent while paging");
    while(page.has_more){page=box(who,kind,`20,${lit(page.next_cursor.at)},'${page.next_cursor.id}'`);ids.push(...page.items.map(x=>x.id));}
    assert.equal(ids.length,55);assert.equal(new Set(ids).size,55);
  }
  for(const args of ["0","51","null",`20,now(),null`,`20,'infinity','${randomUUID()}'`])denied(actor(b,`select public.list_messaging_inbox(${args});`),/messaging_invalid/);
});
test("all private tables deny direct CRUD, helpers denied, entries restricted and safe definer configuration",()=>{
  for(const role of ["anon","authenticated"]){
    for(const table of ["messaging_messages","messaging_recipients","messaging_blocks","messaging_reports"]){
      for(const command of [`select * from public.${table}`,`insert into public.${table} default values`,`update public.${table} set ${table==="messaging_messages"?"body=body":table==="messaging_recipients"?"read_at=read_at":table==="messaging_blocks"?"created_at=created_at":"detail=detail"}`,`delete from public.${table}`])denied(sql(`set role ${role}; ${command};`),/permission denied/);
    }
  }
  const tables=json(sql("select jsonb_agg(jsonb_build_object('rls',relrowsecurity,'force',relforcerowsecurity)) from pg_class where relnamespace='public'::regnamespace and relname in ('messaging_messages','messaging_recipients','messaging_blocks','messaging_reports');"));assert.equal(tables.length,4);for(const t of tables)assert.deepEqual(t,{rls:true,force:true});
  const functions=json(sql(`select jsonb_agg(jsonb_build_object('name',p.oid::regprocedure::text,'schema',n.nspname,'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'config',p.proconfig,'anon',has_function_privilege('anon',p.oid,'execute'),'auth',has_function_privilege('authenticated',p.oid,'execute'),'service',has_function_privilege('service_role',p.oid,'execute'),'args',p.proargnames)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private') and (p.proname like 'messaging_%' or p.proname like '%_messaging_%');`));
  for(const f of functions){assert.equal(f.owner,"postgres");assert.deepEqual(f.config,['search_path=""']);assert.equal(f.anon,false);assert.equal(f.service,false);assert.equal(f.auth,f.schema==="public");if(f.schema==="public"){assert.equal(f.definer,true);assert.ok(!(f.args??[]).some(a=>/actor|sender|reporter|blocker/.test(a)));}}
  denied(sql("set role authenticated; select private.messaging_assert_actor();"),/permission denied/);
});
test("important query plans have usable indexes on scoped production predicates",()=>{
  const [a,b]=members(2);seed(a,[b],250,{seconds:700});ok(sql("analyze public.messaging_messages; analyze public.messaging_recipients; analyze public.messaging_reports;"));
  // Force seqscan off to test index applicability, not to claim measured latency.
  const queries=[
    `select message_id from public.messaging_recipients where recipient_user_id='${b}' and hidden_at is null order by received_at desc,message_id desc limit 20`,
    `select id from public.messaging_messages where sender_user_id='${a}' and sender_hidden_at is null order by created_at desc,id desc limit 20`,
    `select count(*) from public.messaging_recipients where recipient_user_id='${b}' and hidden_at is null and read_at is null`,
    `select count(*) from public.messaging_messages where sender_user_id='${a}' and created_at>now()-interval '24 hours'`,
    "select id from public.messaging_reports where status='open' order by created_at desc,id desc limit 20",
  ];
  for(const q of queries){const plan=ok(sql(`set enable_seqscan=off; explain ${q};`));assert.match(plan,/Index/);assert.doesNotMatch(plan,/Seq Scan/);}
});

const blockList = (who,args="") => json(actor(who,`select public.list_messaging_blocks(${args});`));

test("1B-1 own block list is a narrow read, isolates incoming/other owners and has no actor selector",()=>{
  const [a,b,c,d]=members(4);ok(block(a,b));ok(block(c,a));ok(block(b,d));
  const page=blockList(a);assert.equal(page.items.length,1);assert.equal(page.items[0].blocked_user_id,b);
  assert.deepEqual(Object.keys(page.items[0]).sort(),["blocked_at","blocked_user_id","counterpart_display"]);
  assert.ok(Number.isFinite(Date.parse(page.items[0].blocked_at)));assert.equal(page.has_more,false);assert.equal(page.next_cursor,null);
  assert.deepEqual(blockList(b).items.map(x=>x.blocked_user_id),[d]);assert.deepEqual(blockList(c).items.map(x=>x.blocked_user_id),[a]);
  assert.equal(blockList(d).items.length,0);
  const args=json(sql("select to_jsonb(proargnames) from pg_proc where oid='public.list_messaging_blocks(integer,timestamptz,uuid)'::regprocedure;"));
  assert.deepEqual(args,["p_limit","p_cursor_at","p_cursor_id"]);
  denied(actor(a,`select public.list_messaging_blocks(p_blocker_user_id=>'${c}'::uuid);`),/does not exist/);
  assert.equal(blockList(a,`20,'2999-01-01','${c}'`).items[0].blocked_user_id,b);
  // A fresh read-only transaction also succeeds: the entry performs no audit/write.
  const readOnly=json(sql(`begin read only; ${identity(a,"select public.list_messaging_blocks();")} rollback;`));
  assert.deepEqual(readOnly,page);
});

test("1B-1 entry ACL and the existing active/private-read account guard remain enforced",()=>{
  const [a]=members(1);assert.deepEqual(blockList(a),{items:[],has_more:false,next_cursor:null});
  denied(sql("set role anon; select public.list_messaging_blocks();"),/permission denied/);
  denied(sql("set role service_role; select public.list_messaging_blocks();"),/permission denied/);
  denied(sql("set role authenticated; select public.list_messaging_blocks();"),/messaging_login/);
  for(const status of ["suspended","withdrawn"]){const [x]=members(1,{status});denied(actor(x,"select public.list_messaging_blocks();"),/messaging_account_unavailable/);}
  const [incomplete]=members(1,{complete:false});denied(actor(incomplete,"select public.list_messaging_blocks();"),/messaging_account_unavailable/);
  ok(sql(`update public.user_accounts set account_status='suspended' where id='${a}';`));
  denied(actor(a,"select public.list_messaging_blocks();"),/messaging_account_unavailable/);
  for(const role of ["anon","authenticated"])denied(sql(`set role ${role}; select * from public.messaging_blocks;`),/permission denied/);
});

test("1B-1 R02: block, hide last message, fresh list, existing unblock, then bidirectional send",()=>{
  const [a,b,c]=members();const message=send(a,b,"before block");ok(block(a,b));
  ok(actor(a,`select public.hide_messaging_message('${message.id}');`));
  assert.equal(box(a,"sent").items.length,0);denied(actor(a,`select public.get_messaging_message('${message.id}',false);`),/messaging_not_found/);
  // Every actor() call opens a separate psql connection. No prior client target/body state is used.
  const fresh=blockList(a);assert.equal(fresh.items[0].blocked_user_id,b);assert.equal(Object.hasOwn(fresh.items[0],"body"),false);
  ok(block(b,c));ok(block(a,c,false)); // Non-owned target is a no-op and cannot remove B's row.
  assert.deepEqual(blockList(b).items.map(x=>x.blocked_user_id),[c]);
  ok(block(a,fresh.items[0].blocked_user_id,false));assert.equal(blockList(a).items.length,0);
  age(a);assert.ok(send(a,b,"after unblock A to B").id);assert.ok(send(b,a,"after unblock B to A").id);
  denied(actor(a,`select public.get_messaging_message('${message.id}',false);`),/messaging_not_found/);
});

test("1B-1 display reuses public/fallback/withdrawn semantics and hard-delete cascades the block",()=>{
  const [a,b]=members(2);ok(block(a,b));
  ok(sql(`update public.user_profiles set nickname='차단 목록 표시',profile_visibility='private' where user_id='${b}';`));
  assert.equal(blockList(a).items[0].counterpart_display,"PUL 회원");
  ok(sql(`update public.user_profiles set profile_visibility='members' where user_id='${b}';`));assert.equal(blockList(a).items[0].counterpart_display,"PUL 회원");
  ok(sql(`update public.user_profiles set profile_visibility='public' where user_id='${b}';`));assert.equal(blockList(a).items[0].counterpart_display,"차단 목록 표시");
  ok(sql(`update public.user_accounts set account_status='withdrawn' where id='${b}';`));assert.equal(blockList(a).items[0].counterpart_display,"탈퇴한 회원");
  ok(sql(`delete from auth.users where id='${b}';`));assert.equal(blockList(a).items.length,0);
});

test("1B-1 bounded latest-first pagination preserves microseconds and tied-target ordering",()=>{
  const [a,...targets]=members(57);const original=targets.slice(0,55);
  ok(sql(`insert into public.messaging_blocks(blocker_user_id,blocked_user_id,created_at) values ${original.map(b=>`('${a}','${b}','2026-01-01 00:00:00.123456+00')`).join(",")};`));
  assert.equal(blockList(a).items.length,20);assert.equal(blockList(a,"50").items.length,50);
  let page=blockList(a);const cursor=page.next_cursor,ids=page.items.map(x=>x.blocked_user_id);
  assert.ok(cursor.at.includes("123456"));ok(block(a,targets[55])); // Newer insert must not disturb remaining older pages.
  for(let i=0;page.has_more && i<4;i++){
    page=blockList(a,`20,${lit(page.next_cursor.at)},'${page.next_cursor.id}'`);ids.push(...page.items.map(x=>x.blocked_user_id));
  }
  assert.equal(page.has_more,false);assert.equal(page.next_cursor,null);
  assert.deepEqual(ids,[...original].sort().reverse());assert.equal(new Set(ids).size,55);
  assert.equal(blockList(a).items[0].blocked_user_id,targets[55]);
  for(const args of ["0","51","null",`20,now(),null`,`20,null,'${a}'`,`20,'infinity','${a}'`])denied(actor(a,`select public.list_messaging_blocks(${args});`),/messaging_invalid/);
  // Check the ordered index path, not the cost-based winner on this tiny fixture.
  // Bitmap scans may legitimately add a Sort; disable that alternative for this capability check.
  for(const predicate of ["",`and (created_at,blocked_user_id)<(${lit(cursor.at)},'${cursor.id}')`]){
    const plan=ok(sql(`set enable_seqscan=off; set enable_bitmapscan=off; explain select blocked_user_id,created_at from public.messaging_blocks where blocker_user_id='${a}' ${predicate} order by created_at desc,blocked_user_id desc limit 21;`));
    assert.match(plan,/messaging_blocks_recent_idx/);assert.doesNotMatch(plan,/Seq Scan|Sort/);
  }
});
