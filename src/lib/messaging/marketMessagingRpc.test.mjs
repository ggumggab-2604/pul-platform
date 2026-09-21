import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { before, after, test } from "node:test";
import { startMarketTestEnvironment, redact } from "../market/marketTestEnvironment.mjs";

// Only a newly-created disposable local PostgreSQL project. No linked/remote DB.
let env;
const lit = value => "'" + String(value).replaceAll("'", "''") + "'";
const ok = r => { assert.equal(r.status, 0, redact(r.stderr + r.stdout)); return r.stdout.trim(); };
const sql = q => env.sql(q);
const json = r => JSON.parse(ok(r));
const identity = (id,q) => `set request.jwt.claim.sub=${lit(id)}; set role authenticated; ${q}`;
const actor = (id,q) => sql(identity(id,q));
const deny = (r,pattern=/messaging_|permission denied/) => { assert.notEqual(r.status,0); assert.match(r.stderr,pattern); };
const migration = name => readFileSync(new URL(`../../../supabase/migrations/${name}`,import.meta.url),"utf8");
const candidate = migration("20261008000100_pul_market_messaging_context.sql");
function members(n=3) {
  const ids=Array.from({length:n},()=>randomUUID());
  ok(sql(`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
    values ${ids.map(id=>`('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','${id}@example.invalid','',now(),now(),now())`).join(",")};
    insert into public.consent_records(user_id,consent_type,consent_version,decision)
    select u::uuid,t,v,'granted' from unnest(array[${ids.map(lit).join(",")}]) u
    cross join (values('terms_required','terms-dev-v1'),('privacy_required','privacy-dev-v1')) c(t,v);`));
  return ids;
}
function listing(owner,status="selling",title="LOCAL 장터 상품") {
  return ok(sql(`insert into public.market_listings(seller_user_id,title,category_code,price_amount,region_code,condition_code,trade_type_code,description,listing_status,removed_at)
    values('${owner}',${lit(title)},'club',10000,'서울','normal','direct','LOCAL fixture description','${status}',${status==="removed"?"now()":"null"}) returning id;`));
}
const sendSql = (id,body="장터 문의",request=randomUUID()) => `select public.send_market_listing_message('${id}',${lit(body)},'${request}');`;
const send = (a,id,body,request) => json(actor(a,sendSql(id,body,request)));
const context = (a,id) => JSON.parse(ok(actor(a,`select public.get_message_market_context('${id}');`)) || "null");
const age = a => ok(sql(`update public.messaging_messages set created_at=clock_timestamp()-interval '4 seconds' where sender_user_id='${a}';`));
const count = a => Number(ok(sql(`select count(*) from public.messaging_messages where sender_user_id='${a}';`)));
function asyncSql(q) {
  assert.match(env.container,/^supabase_db_pul-market-test-\d+-[0-9a-f]{8}$/);
  return new Promise((resolve,reject)=>{
    const p=spawn("docker",["exec","-i",env.container,"psql","-U","postgres","-d","postgres","-X","-q","-t","-A","-v","ON_ERROR_STOP=1"],{windowsHide:true,stdio:["pipe","pipe","pipe"]});
    let stdout="",stderr="";p.stdout.on("data",b=>stdout+=b);p.stderr.on("data",b=>stderr+=b);
    p.on("error",reject);p.on("close",status=>resolve({status,stdout,stderr}));p.stdin.end(q);
  });
}
async function barrier(label) {
  for(let i=0;i<80;i++) {
    if(ok(sql(`select exists(select 1 from pg_stat_activity where application_name='${label}' and wait_event='PgSleep');`))==="t")return;
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  assert.fail("transaction never reached barrier");
}
const catalog = () => json(sql(`select jsonb_build_object(
 'functions',(select jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('definition',pg_get_functiondef(p.oid),'acl',p.proacl::text,'owner',pg_get_userbyid(p.proowner))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind='f'),
 'relations',(select jsonb_object_agg(n.nspname||'.'||c.relname,jsonb_build_object('kind',c.relkind,'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'acl',c.relacl::text)) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','storage')),
 'policies',(select coalesce(jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname),'[]') from pg_policies p));`));
before(async()=>{
  env=await startMarketTestEnvironment({port:55521});
  for(const file of ["20261004000100_pul_sec01_public_create_limits.sql","20261005000100_pul_sec02_content_moderation.sql","20261006000100_pul_common_messaging_foundation.sql","20261007000100_pul_messaging_block_list_read.sql"]) ok(sql(`begin; ${migration(file)} commit;`));
  const baseline=catalog();
  ok(sql(`begin; ${candidate} rollback;`));assert.deepEqual(catalog(),baseline);
  ok(sql(`begin; ${candidate} commit;`));const next=catalog();
  for(const [name,value] of Object.entries(baseline.functions)) assert.deepEqual(next.functions[name],value,name);
  for(const [name,value] of Object.entries(baseline.relations)) assert.deepEqual(next.relations[name],value,name);
  assert.deepEqual(next.policies,baseline.policies);
  console.log("1D transaction rollback + all official92 function definitions/ACL/owner/RLS/policies preserved PASS");
});
after(async()=>{if(env)await env.stop();});

test("canonical seller, no contact consent/reveal, atomic narrow context, read-only compose/detail",()=>{
  const [a,b,c]=members(),l=listing(b),m=send(a,l);
  assert.equal(ok(sql(`select recipient_user_id from public.messaging_recipients where message_id='${m.id}';`)),b);
  const expected={available:true,listing_id:l,title:"LOCAL 장터 상품",status:"selling"};
  assert.deepEqual(json(actor(a,`select public.get_market_message_compose_context('${l}');`)),expected);
  assert.deepEqual(context(a,m.id),expected);assert.deepEqual(context(b,m.id),expected);
  assert.equal(ok(sql(`select read_at is null from public.messaging_recipients where message_id='${m.id}';`)),"t");
  deny(actor(c,`select public.get_message_market_context('${m.id}');`));
  deny(actor(a,`select public.send_market_listing_message(p_listing_id=>'${l}',p_body=>'spoof',p_request_id=>'${randomUUID()}',p_seller_user_id=>'${c}');`),/does not exist/);
  assert.equal(ok(sql(`select count(*) from public.messaging_market_contexts where message_id='${m.id}' and market_listing_id='${l}';`)),"1");
});
test("new inquiry permits selling/reserved only, denies self, invalid/noncanonical IDs, sold/removed",()=>{
  const [a,b]=members();for(const status of ["selling","reserved"]) {const l=listing(b,status);send(a,l,status);age(a);}
  for(const status of ["sold","removed"]) deny(actor(a,sendSql(listing(b,status))));
  deny(actor(b,sendSql(listing(b))));deny(actor(a,sendSql(randomUUID())));
  deny(actor(a,"select public.send_market_listing_message(null,'body',gen_random_uuid());"));
  deny(actor(a,`select public.get_market_message_compose_context('${listing(b,"sold")}');`));
});
test("inactive/incomplete actors and sellers and both block directions deny safe generic error",()=>{
  const [a,b]=members(),l=listing(b);
  for(const id of [a,b]) for(const state of ["suspended","withdrawn"]) {
    ok(sql(`update public.user_accounts set account_status='${state}' where id='${id}';`));deny(actor(a,sendSql(l)));
    ok(sql(`update public.user_accounts set account_status='active' where id='${id}';`));
  }
  for(const [x,y] of [[a,b],[b,a]]) {ok(actor(x,`select public.set_messaging_block('${y}',true);`));deny(actor(a,sendSql(l)),/messaging_recipient_unavailable/);ok(actor(x,`select public.set_messaging_block('${y}',false);`));}
  ok(sql(`delete from public.consent_records where user_id='${b}';`));deny(actor(a,sendSql(l)));
  assert.equal(count(a),0);
});
test("market replay binds listing and normalized body; both generic/market collision directions reject",()=>{
  const [a,b]=members(),l=listing(b),other=listing(b),request=randomUUID(),m=send(a,l,"same   body",request);
  assert.deepEqual(send(a,l,"same body",request),m);
  deny(actor(a,sendSql(other,"same body",request)),/messaging_replay_conflict/);
  deny(actor(a,sendSql(l,"changed",request)),/messaging_replay_conflict/);
  deny(actor(a,`select public.send_messaging_message('${b}','same body','${request}');`),/messaging_replay_conflict/);
  deny(actor(a,`select public.reply_messaging_message('${m.id}','same body','${request}');`),/messaging_replay_conflict/);
  age(a);const genericRequest=randomUUID();const g=json(actor(a,`select public.send_messaging_message('${b}','generic','${genericRequest}');`));
  deny(actor(a,sendSql(l,"generic",genericRequest)),/messaging_replay_conflict/);
  assert.equal(context(a,g.id),null);assert.equal(context(a,m.id).listing_id,l);assert.equal(count(a),2);
});
test("replay acknowledgement survives hide, block, sold/removed and listing hard-delete",()=>{
  const [a,b]=members(),l=listing(b),request=randomUUID(),m=send(a,l,"persist",request);
  ok(actor(a,`select public.hide_messaging_message('${m.id}'); select public.set_messaging_block('${b}',true);`));
  for(const status of ["sold","removed"]) {
    ok(sql(`update public.market_listings set listing_status='${status}',removed_at=${status==="removed"?"now()":"null"} where id='${l}';`));assert.deepEqual(send(a,l,"persist",request),m);
  }
  ok(sql(`delete from public.market_listings where id='${l}';`));assert.deepEqual(send(a,l,"persist",request),m);
  assert.equal(count(a),1);deny(actor(a,`select public.get_message_market_context('${m.id}');`));assert.deepEqual(context(b,m.id),{available:false});
});
test("replies retain context across generations and sold/removed; hard-delete preserves bodies and fallback",()=>{
  const [a,b]=members(),l=listing(b),m=send(a,l);
  ok(sql(`update public.market_listings set listing_status='sold' where id='${l}';`));
  const r=json(actor(b,`select public.reply_messaging_message('${m.id}','거래 후 문의','${randomUUID()}');`));
  assert.equal(context(a,r.id).status,"sold");
  ok(sql(`update public.market_listings set listing_status='removed',removed_at=now() where id='${l}';`));age(a);
  const r2=json(actor(a,`select public.reply_messaging_message('${r.id}','거래 후 답장','${randomUUID()}');`));
  assert.deepEqual(context(b,r2.id),{available:false});deny(actor(b,sendSql(l,"new")));
  ok(sql(`delete from public.market_listings where id='${l}';`));
  assert.deepEqual(context(a,m.id),{available:false});assert.deepEqual(context(a,r.id),{available:false});
  assert.equal(json(actor(b,`select public.get_messaging_message('${r2.id}',false);`)).body,"거래 후 답장");
});
test("context insert failure rolls back message, receipt and request reservation",()=>{
  const [a,b]=members(),l=listing(b),request=randomUUID();
  ok(sql(`create function private.local_fail_context() returns trigger language plpgsql as $$ begin raise exception 'local_context_failure'; end; $$;
    create trigger local_fail_context before insert on public.messaging_market_contexts for each row execute function private.local_fail_context();`));
  try {deny(actor(a,sendSql(l,"retry",request)),/local_context_failure/);assert.equal(count(a),0);}
  finally {ok(sql("drop trigger local_fail_context on public.messaging_market_contexts; drop function private.local_fail_context();"));}
  send(a,l,"retry",request);assert.equal(count(a),1);
});
test("generic and market share cooldown, normalized duplicate, per-recipient and global budgets",()=>{
  const [a,b,c,d]=members(4),l=listing(b),other=listing(c);
  send(a,l,"first");deny(actor(a,`select public.send_messaging_message('${c}','next','${randomUUID()}');`),/messaging_cooldown/);
  age(a);deny(actor(a,sendSql(l,"first")),/messaging_duplicate/);
  // Trust-only seed many valid receipts, each row remains in the ordinary foundation budget.
  ok(sql(`with inserted as (insert into public.messaging_messages(sender_user_id,body,body_hash,recipient_key,request_id,request_fingerprint,first_contact,created_at)
    select '${a}','fixture'||n,'fixture',encode(sha256(convert_to('${b}','UTF8')),'hex'),gen_random_uuid(),'fixture',false,now()-interval '30 seconds' from generate_series(1,9) n returning id,created_at)
    insert into public.messaging_recipients(message_id,recipient_user_id,received_at) select id,'${b}',created_at from inserted;`));
  deny(actor(a,sendSql(l,"recipient full")),/messaging_recipient_quota/);
  ok(sql(`with inserted as (insert into public.messaging_messages(sender_user_id,body,body_hash,recipient_key,request_id,request_fingerprint,first_contact,created_at)
    select '${a}','global'||n,'fixture',encode(sha256(convert_to('${d}','UTF8')),'hex'),gen_random_uuid(),'fixture',false,now()-interval '30 seconds' from generate_series(1,10) n returning id,created_at)
    insert into public.messaging_recipients(message_id,recipient_user_id,received_at) select id,'${d}',created_at from inserted;`));
  deny(actor(a,sendSql(other,"global full")),/messaging_quota/);assert.equal(count(a),20);
});
test("ACL/RLS force default deny and narrow postgres-owned empty-path authenticated entries",()=>{
  const [a,b]=members(),l=listing(b),m=send(a,l);
  for(const role of ["anon","authenticated","service_role"]) for(const query of [
    "select * from public.messaging_market_contexts;",
    `insert into public.messaging_market_contexts values('${randomUUID()}','${l}');`,
    `update public.messaging_market_contexts set market_listing_id=null where message_id='${m.id}';`,
    `delete from public.messaging_market_contexts where message_id='${m.id}';`
  ]) deny(sql(`set role ${role}; ${query}`));
  deny(sql(`set role anon; ${sendSql(l)}`));deny(sql(`set role authenticated; ${sendSql(l)}`),/messaging_login/);
  assert.equal(ok(sql("select relrowsecurity and relforcerowsecurity from pg_class where oid='public.messaging_market_contexts'::regclass;")),"t");
  for(const signature of ["get_market_message_compose_context(uuid)","send_market_listing_message(uuid,text,uuid)","get_message_market_context(uuid)"]) {
    const row=json(sql(`select jsonb_build_object('owner',pg_get_userbyid(proowner),'definer',prosecdef,'config',proconfig,'anon',has_function_privilege('anon',oid,'execute'),'auth',has_function_privilege('authenticated',oid,'execute'),'service',has_function_privilege('service_role',oid,'execute')) from pg_proc where oid='public.${signature}'::regprocedure;`));
    assert.deepEqual(row,{owner:"postgres",definer:true,config:['search_path=""'],anon:false,auth:true,service:false});
  }
  deny(actor(a,"select private.messaging_inherit_market_context();"));
});
test("state update wins actual connection race: queued inquiry denies after lock",async()=>{
  for(const state of ["sold","removed"]) {
    const [a,b]=members(),l=listing(b),label="market_state_"+randomUUID().replaceAll("-","");
    const holder=asyncSql(`set application_name='${label}'; begin; update public.market_listings set listing_status='${state}',removed_at=${state==="removed"?"now()":"null"} where id='${l}'; select pg_sleep(2); commit;`);
    await barrier(label);const queued=asyncSql(identity(a,sendSql(l)));ok(await holder);deny(await queued,/messaging_recipient_unavailable/);assert.equal(count(a),0);
  }
});
test("send wins actual connection race: one inquiry before close, future new inquiry denied",async()=>{
  const [a,b]=members(),l=listing(b),label="market_send_"+randomUUID().replaceAll("-","");
  const holder=asyncSql(`set application_name='${label}'; begin; ${identity(a,sendSql(l))} select pg_sleep(2); commit;`);
  await barrier(label);const update=asyncSql(`update public.market_listings set listing_status='sold' where id='${l}';`);
  ok(await holder);ok(await update);assert.equal(count(a),1);deny(actor(a,sendSql(l,"future")));
});
test("same request concurrency creates exactly one context and generic conflict cannot convert it",async()=>{
  const [a,b]=members(),l=listing(b),request=randomUUID();
  const results=await Promise.all([asyncSql(identity(a,sendSql(l,"concurrent",request))),asyncSql(identity(a,sendSql(l,"concurrent",request)))]);
  assert.deepEqual(json(results[0]),json(results[1]));assert.equal(count(a),1);
  assert.equal(ok(sql(`select count(*) from public.messaging_market_contexts where market_listing_id='${l}';`)),"1");
  for(const level of ["repeatable read","serializable"]) deny(actor(a,`begin isolation level ${level}; ${sendSql(l)} commit;`),/messaging_retry_transaction/);
});
