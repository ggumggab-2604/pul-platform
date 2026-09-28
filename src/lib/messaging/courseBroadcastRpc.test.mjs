import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {before,after,beforeEach,test} from 'node:test';
import {startMarketTestEnvironment,redact} from '../market/marketTestEnvironment.mjs';
let env;
const migration=n=>readFileSync(new URL('../../../supabase/migrations/'+n,import.meta.url),'utf8');
const candidate=migration('20261013000100_pul_course_operational_broadcast.sql');
const lit=x=>"'"+String(x).replaceAll("'","''")+"'";
const sql=q=>env.sql(q);
const ok=r=>{assert.equal(r.status,0,redact(r.stderr+r.stdout));return r.stdout.trim();};
const json=r=>JSON.parse(ok(r)||'null');
const deny=(r,re=/messaging_|course_notification_|permission denied/)=>{assert.notEqual(r.status,0);assert.match(r.stderr,re);};
const identity=(u,q)=>`set request.jwt.claim.sub='${u}';set role authenticated;${q}`;
const actor=(u,q)=>sql(identity(u,q));
const sendSql=(c,body='notice',req=randomUUID())=>`select public.send_course_broadcast('${c.id}',${lit(body)},'${req}');`;
const send=(a,c,body,req)=>json(actor(a,sendSql(c,body,req)));
const preview=(a,c)=>json(actor(a,`select public.preview_course_broadcast('${c.id}');`));
const subscribe=(u,c,on=true)=>ok(actor(u,`select public.set_course_notification_subscription('${c.key}',${on});`));
const grant=(c,u,admin,on=true)=>`select private.set_course_messaging_operator_grant('${c.id}','${u}','${admin}',${on});`;
const count=()=>Number(ok(sql("select count(*) from public.messaging_messages;")));
function members(n=1,role='member') {
 const ids=Array.from({length:n},()=>randomUUID());
 ok(sql(`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
 values ${ids.map(id=>`('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','${id}@example.invalid','',now(),now(),now())`).join(',')};
 update public.user_accounts set platform_role='${role}' where id in (${ids.map(lit).join(',')});
 insert into public.consent_records(user_id,consent_type,consent_version,decision)
 select u::uuid,t,v,'granted' from unnest(array[${ids.map(lit).join(',')}]) u
 cross join(values('terms_required','terms-dev-v1'),('privacy_required','privacy-dev-v1')) c(t,v);`));return ids;
}
function course(type='field',status='active') {
 const key='local-'+randomUUID();const id=ok(sql(`insert into public.courses(course_key,name,course_type,region,city,address,holes,operation_code,description,course_status)
 values('${key}','LOCAL ${type}','${type}','서울','LOCAL 시','LOCAL 주소',18,'reservation','LOCAL description','${status}') returning id;`));return {id,key};
}
function fixture(type='field') {const [a,b]=members(2),admin=members(1,'platform_admin')[0],c=course(type);ok(sql(grant(c,a,admin)));subscribe(b,c);return {a,b,admin,c};}
const age=c=>ok(sql(`update public.messaging_messages set created_at=clock_timestamp()-interval '4 minutes' where id in(select message_id from public.messaging_course_broadcast_contexts where course_id='${c.id}');`));
function asyncSql(q){assert.match(env.container,/^supabase_db_pul-market-test-\d+-[0-9a-f]{8}$/);return new Promise((resolve,reject)=>{
 const p=spawn('docker',['exec','-i',env.container,'psql','-U','postgres','-d','postgres','-X','-q','-t','-A','-v','ON_ERROR_STOP=1'],{windowsHide:true,stdio:['pipe','pipe','pipe']});let stdout='',stderr='';p.stdout.on('data',b=>stdout+=b);p.stderr.on('data',b=>stderr+=b);p.on('error',reject);p.on('close',status=>resolve({status,stdout,stderr}));p.stdin.end(q);
});}
async function barrier(label){for(let i=0;i<100;i++){if(ok(sql(`select exists(select 1 from pg_stat_activity where application_name='${label}' and wait_event='PgSleep');`))==='t')return;await new Promise(r=>setTimeout(r,50));}assert.fail('two-session barrier');}
const catalog=()=>json(sql(`select jsonb_build_object('functions',(select jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('def',pg_get_functiondef(p.oid),'acl',p.proacl::text,'owner',p.proowner)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private') and p.prokind='f'),'relations',(select jsonb_object_agg(n.nspname||'.'||c.relname,jsonb_build_object('rls',c.relrowsecurity,'force',c.relforcerowsecurity,'acl',c.relacl::text,'owner',c.relowner)) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','private','storage')),'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p));`));
before(async()=>{
 env=await startMarketTestEnvironment({port:45221});
 for(const f of ['20261004000100_pul_sec01_public_create_limits.sql','20261005000100_pul_sec02_content_moderation.sql','20261006000100_pul_common_messaging_foundation.sql','20261007000100_pul_messaging_block_list_read.sql','20261008000100_pul_market_messaging_context.sql','20261009000100_pul_platform_broadcast_messaging.sql','20261010000100_pul_club_broadcast_messaging.sql','20261011000100_pul_club_event_broadcast_messaging.sql','20261012000100_pul_course_notification_subscription_foundation.sql'])ok(sql(`begin;${migration(f)}commit;`));
 const old=catalog();ok(sql(`begin;${candidate}rollback;`));assert.deepEqual(catalog(),old);
 ok(sql(`begin;${candidate}commit;`));const next=catalog();
 const changed=new Set(['private.messaging_check_broadcast_batch()','private.messaging_check_delivery()','private.messaging_list(text,integer,timestamp with time zone,uuid)','get_messaging_message(uuid,boolean)','submit_messaging_report(uuid,text,text)','hide_messaging_message(uuid)']);
 for(const [name,value]of Object.entries(old.functions)){
  assert.equal(next.functions[name].acl,value.acl,name);assert.equal(next.functions[name].owner,value.owner,name);
  if(!changed.has(name))assert.deepEqual(next.functions[name],value,name);
 }
 for(const [name,value]of Object.entries(old.relations))assert.deepEqual(next.relations[name],value,name);
 assert.deepEqual(next.policies,old.policies);
 assert.equal(count(),0);assert.equal(ok(sql('select count(*) from public.course_messaging_operator_grants;')),'0');assert.equal(ok(sql('select count(*) from public.course_notification_subscriptions;')),'0');
 console.log('Candidate rollback, zero seeds, unchanged Foundation and old functions except six explicit extensions, ACL/RLS preservation PASS');
});
after(async()=>{if(env)await env.stop();});
beforeEach(()=>ok(sql("delete from public.messaging_reports;delete from public.messaging_messages;delete from public.course_notification_subscriptions;delete from public.course_messaging_operator_grants;delete from public.audit_logs where action='messaging.course_broadcast.send';")));

for(const type of ['field','screen'])test(`${type}: exact-course operator creates original + recipients + operational audit, own Sent/Inbox`,()=>{
 const {a,b,c}=fixture(type),[x]=members();subscribe(x,c);subscribe(a,c);
 const source=json(actor(a,`select public.get_course_broadcast_source('${c.key}');`));assert.equal(source.course_id,c.id);assert.equal(source.course_type,type);
 assert.deepEqual(preview(a,c),{recipient_count:2,maximum:10000,can_send:true});
 const m=send(a,c),ids=json(sql(`select jsonb_agg(recipient_user_id order by recipient_user_id) from public.messaging_recipients where message_id='${m.id}';`));assert.deepEqual(ids,[b,x].sort());assert.equal(m.recipient_count,2);assert.equal(count(),1);
 const audit=json(sql("select after_summary from public.audit_logs where action='messaging.course_broadcast.send';"));assert.equal(audit.purpose,'operational');assert.equal(audit.course_id,c.id);assert.equal(audit.recipient_count,2);
 assert.equal(json(actor(a,'select public.list_messaging_sent();')).items.length,1);
 assert.equal(json(actor(b,'select public.list_messaging_inbox();')).items[0].kind,'course_broadcast');
 const sent=json(actor(a,`select public.get_messaging_message('${m.id}',false);`));assert.equal(sent.is_recipient,false);assert.equal(sent.recipient_count,2);
 const received=json(actor(b,`select public.get_messaging_message('${m.id}',false);`));assert.equal(received.counterpart_user_id,null);assert.equal('recipient_count' in received,false);
 assert.equal(json(actor(b,`select public.get_message_course_context('${m.id}');`)).course_key,c.key);
});

test('no grant: anonymous/member/admin/courses.manage/Platform personal grant/other course grant cannot inspect or send',()=>{
 const {a,b,c,admin}=fixture(),other=course();ok(sql(grant(other,b,admin)));
 ok(sql(`select private.set_messaging_broadcast_grant('${admin}','${admin}',true);`));
 assert.equal(ok(actor(admin,"select public.current_user_has_platform_permission('courses.manage');")),'t');
 for(const u of [b,admin])for(const q of [sendSql(c),`select public.preview_course_broadcast('${c.id}');`,`select public.get_course_broadcast_source('${c.key}');`])deny(actor(u,q));
 for(const role of ['anon','service_role'])deny(sql(`set role ${role};${sendSql(c)}`),/permission denied/);
 deny(sql(`set role authenticated;${sendSql(c)}`));
 ok(sql(grant(c,a,admin,false)));deny(actor(a,sendSql(c)));deny(actor(a,`select public.preview_course_broadcast('${c.id}');`));
});

test('unavailable senders, missing/inactive/removed/unsupported courses reject; Foundation has revoked_at and no expiry',()=>{
 for(const state of ['suspended','withdrawn','no_profile','no_consent']){
  const {a,c}=fixture();ok(sql(state==='no_profile'?`delete from public.user_profiles where user_id='${a}';`:state==='no_consent'?`delete from public.consent_records where user_id='${a}';`:`update public.user_accounts set account_status='${state}' where id='${a}';`));deny(actor(a,sendSql(c)));
 }
 const {a,c}=fixture();deny(actor(a,sendSql({id:randomUUID()})));
 for(const state of ['inactive','removed']){ok(sql(`update public.courses set course_status='${state}' where id='${c.id}';`));deny(actor(a,sendSql(c)));}
 ok(sql(`alter table public.courses drop constraint courses_type_check;update public.courses set course_status='active',course_type='future' where id='${c.id}';`));deny(actor(a,sendSql(c)));
 ok(sql(`update public.courses set course_type='field' where id='${c.id}';alter table public.courses add constraint courses_type_check check(course_type in ('field','screen'));`));
 assert.equal(ok(sql("select count(*) from information_schema.columns where table_name='course_messaging_operator_grants' and column_name like '%expires%';")),'0');assert.equal(count(),0);
});

test('recipient snapshot intersects active preference/eligibility, excludes sender/other course/deleted accounts; DM blocks do not filter',()=>{
 const {a,b,c}=fixture(),ids=members(8),other=course();subscribe(a,c);for(const u of ids)subscribe(u,c);
 subscribe(ids[0],c,false);subscribe(ids[1],c,false);subscribe(ids[1],c,true);
 ok(sql(`update public.user_accounts set account_status='suspended' where id='${ids[2]}';update public.user_accounts set account_status='withdrawn' where id='${ids[3]}';delete from public.user_profiles where user_id='${ids[4]}';delete from public.consent_records where user_id='${ids[5]}';delete from auth.users where id='${ids[6]}';`));
 subscribe(ids[7],c,false);subscribe(ids[7],other);
 ok(actor(b,`select public.set_messaging_block('${a}',true);`));ok(actor(a,`select public.set_messaging_block('${ids[1]}',true);`));
 assert.equal(preview(a,c).recipient_count,2);const req=randomUUID(),m=send(a,c,'snapshot',req);
 assert.deepEqual(json(sql(`select jsonb_agg(recipient_user_id order by recipient_user_id) from public.messaging_recipients where message_id='${m.id}';`)),[b,ids[1]].sort());
 subscribe(b,c,false);subscribe(ids[0],c);assert.deepEqual(send(a,c,' snapshot ',req),m);
 assert.equal(ok(sql(`select count(*) from public.messaging_recipients where message_id='${m.id}';`)),'2');
 assert.equal(json(actor(b,`select public.get_messaging_message('${m.id}',false);`)).id,m.id);
 deny(actor(a,`select public.send_messaging_message('${b}','direct',gen_random_uuid());`));
});

test('zero audience does not consume request, quota or audit; preview is not a send snapshot',()=>{
 const {a,b,c}=fixture(),req=randomUUID();assert.equal(preview(a,c).recipient_count,1);subscribe(b,c,false);
 deny(actor(a,sendSql(c,'empty',req)),/broadcast_audience/);assert.equal(count(),0);assert.equal(ok(sql("select count(*) from public.audit_logs where action='messaging.course_broadcast.send';")),'0');
 subscribe(b,c);assert.equal(send(a,c,'empty',req).recipient_count,1);
});

test('request replay/course/body/cross-kind conflicts and sender isolation, grant revoked replay denied',()=>{
 const {a,b,c,admin}=fixture(),other=course(),req=randomUUID();ok(sql(grant(other,a,admin)));subscribe(b,other);
 const m=send(a,c,'same',req);assert.deepEqual(send(a,c,' same ',req),m);
 for(const q of [sendSql(c,'changed',req),sendSql(other,'same',req),`select public.send_messaging_message('${b}','same','${req}');`])deny(actor(a,q),/replay_conflict/);
 const r=randomUUID();ok(actor(a,`select public.send_messaging_message('${b}','DM','${r}');`));deny(actor(a,sendSql(c,'same',r)),/replay_conflict/);
 const [x]=members();ok(sql(grant(other,x,admin)));const own=send(x,other,'same',req);assert.notEqual(own.id,m.id);
 ok(sql(grant(c,a,admin,false)));deny(actor(a,sendSql(c,'same',req)));assert.equal(json(actor(a,`select public.get_messaging_message('${m.id}',false);`)).id,m.id);
});

test('IDOR, report/read/hide, safe unavailable context and immutable source',()=>{
 const {a,b,c}=fixture(),[x]=members(),m=send(a,c),other=course();
 for(const q of [`select public.get_messaging_message('${m.id}',false);`,`select public.get_message_course_context('${m.id}');`,`select public.submit_messaging_report('${m.id}','spam','');`,`select public.hide_messaging_message('${m.id}');`])deny(actor(x,q));
 deny(actor(b,`select public.reply_messaging_message('${m.id}','reply',gen_random_uuid());`));
 ok(actor(b,`select public.mark_messaging_message_read('${m.id}');select public.submit_messaging_report('${m.id}','spam','');`));
 deny(sql(`update public.messaging_course_broadcast_contexts set course_id='${other.id}' where message_id='${m.id}';`),/context_invariant/);
 deny(sql(`delete from public.messaging_course_broadcast_contexts where message_id='${m.id}';`),/context_invariant/);
 ok(sql(`update public.courses set course_status='inactive' where id='${c.id}';`));assert.deepEqual(json(actor(b,`select public.get_message_course_context('${m.id}');`)),{available:false});
 ok(sql(`delete from public.courses where id='${c.id}';`));assert.deepEqual(json(actor(b,`select public.get_message_course_context('${m.id}');`)),{available:false});assert.equal(json(actor(b,`select public.get_messaging_message('${m.id}',false);`)).id,m.id);
 ok(actor(a,`select public.hide_messaging_message('${m.id}');`));assert.equal(json(actor(a,'select public.list_messaging_sent();')).items.length,0);deny(actor(a,`select public.get_message_course_context('${m.id}');`));
 assert.equal(json(actor(b,'select public.list_messaging_inbox();')).items.length,1);ok(actor(b,`select public.hide_messaging_message('${m.id}');`));deny(actor(b,`select public.get_messaging_message('${m.id}',false);`));
});

test('RLS/ACL and narrow signature prevent direct writes, service-role and source/recipient/actor spoofing',()=>{
 const {a,b,c}=fixture();
 for(const role of ['anon','authenticated','service_role'])for(const table of ['messaging_messages','messaging_recipients','messaging_course_broadcast_contexts']){
  for(const q of [`select * from public.${table}`,`delete from public.${table}`,`insert into public.${table} default values`])deny(sql(`set role ${role};${q};`),/permission denied/);
 }
 for(const helper of [`private.messaging_lock_course_broadcaster('${c.id}')`,'private.messaging_check_course_context()'])deny(actor(a,`select ${helper};`),/permission denied/);
 deny(actor(a,`select public.send_course_broadcast('${c.id}','x',gen_random_uuid(),array['${b}'::uuid]);`),/does not exist/);
 deny(actor(a,`select public.send_course_broadcast(p_course_id=>'${c.id}',p_body=>'x',p_request_id=>gen_random_uuid(),p_sender_id=>'${b}');`),/does not exist/);
 const security=json(sql(`select jsonb_build_object('rls',relrowsecurity,'force',relforcerowsecurity,'owner',pg_get_userbyid(relowner)) from pg_class where oid='public.messaging_course_broadcast_contexts'::regclass;`));assert.deepEqual(security,{rls:true,force:true,owner:'postgres'});
 const funcs=json(sql(`select jsonb_agg(jsonb_build_object('name',n.nspname||'.'||p.proname,'definer',p.prosecdef,'owner',pg_get_userbyid(p.proowner),'config',p.proconfig,'anon',has_function_privilege('anon',p.oid,'execute'),'auth',has_function_privilege('authenticated',p.oid,'execute'),'service',has_function_privilege('service_role',p.oid,'execute'))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname in('messaging_lock_course_broadcaster','messaging_check_course_context','get_course_broadcast_source','preview_course_broadcast','send_course_broadcast','get_message_course_context');`));assert.equal(funcs.length,6);
 for(const f of funcs){assert.equal(f.definer,true);assert.equal(f.owner,'postgres');assert.ok(f.config.includes('search_path=""'));assert.equal(f.anon,false);assert.equal(f.service,false);assert.equal(f.auth,f.name.startsWith('public.'));}
});

test('body/unicode/request/isolation validation, persisted body is unformatted plain text',()=>{
 const {a,c}=fixture();for(const body of ['', ' \t\n\u0085 ', '가'.repeat(2001)])deny(actor(a,sendSql(c,body)),/invalid/);
 deny(actor(a,`select public.send_course_broadcast('${c.id}','x',null);`),/invalid/);
 deny(actor(a,`begin isolation level repeatable read;${sendSql(c)}commit;`),/retry_transaction/);
 const m=send(a,c,'😀'.repeat(2000));assert.equal([...json(actor(a,`select public.get_messaging_message('${m.id}',false);`)).body].length,2000);
});

test('context/recipient/audit failures roll back original, snapshot, quota and request',()=>{
 const {a,c}=fixture(),[x]=members();subscribe(x,c);const req=randomUUID();
 for(const [table,condition]of [['messaging_course_broadcast_contexts','true'],['messaging_recipients','(select count(*) from public.messaging_recipients where message_id=new.message_id)>0'],['audit_logs',"new.action='messaging.course_broadcast.send'"]]){
  ok(sql(`create function private.local_course_failure() returns trigger language plpgsql as $$begin if ${condition} then raise exception 'injected failure';end if;return new;end;$$;create trigger local_fail before insert on public.${table} for each row execute function private.local_course_failure();`));
  deny(actor(a,sendSql(c,'atomic',req)),/injected failure/);for(const t of ['messaging_messages','messaging_recipients','messaging_course_broadcast_contexts'])assert.equal(ok(sql(`select count(*) from public.${t};`)),'0');
  assert.equal(ok(sql("select count(*) from public.audit_logs where action='messaging.course_broadcast.send';")),'0');ok(sql(`drop trigger local_fail on public.${table};drop function private.local_course_failure();`));
 }
 assert.equal(send(a,c,'atomic',req).recipient_count,2);
});

test('two sessions same request creates exactly one original, snapshot and audit',async()=>{
 const {a,c}=fixture(),req=randomUUID(),q=identity(a,sendSql(c,'race',req));const results=await Promise.all([asyncSql(q),asyncSql(q)]);assert.deepEqual(json(results[0]),json(results[1]));assert.equal(count(),1);assert.equal(ok(sql("select count(*) from public.audit_logs where action='messaging.course_broadcast.send';")),'1');
});

for(const winner of ['mutation','send'])test(`two sessions ${winner} wins grant revocation / sender suspension / course deactivation`,async()=>{
 for(const kind of ['grant','account','course']){
  const {a,c,admin}=fixture(),req=randomUUID(),label='course_'+randomUUID().replaceAll('-','');
  const change=kind==='grant'?grant(c,a,admin,false):kind==='account'?`update public.user_accounts set account_status='suspended' where id='${a}';`:`update public.courses set course_status='inactive' where id='${c.id}';`;
  if(winner==='mutation'){
   const holder=asyncSql(`set application_name='${label}';begin;${change}select pg_sleep(1.5);commit;`);await barrier(label);const waiting=asyncSql(identity(a,sendSql(c,'race',req)));ok(await holder);deny(await waiting);
   assert.equal(ok(sql(`select count(*) from public.messaging_messages where request_id='${req}';`)),'0');
  }else{
   const holder=asyncSql(`set application_name='${label}';begin;${identity(a,sendSql(c,'race',req))}select pg_sleep(1.5);commit;`);await barrier(label);const changing=asyncSql(change);ok(await holder);ok(await changing);
   assert.equal(ok(sql(`select count(*) from public.messaging_messages where request_id='${req}';`)),'1');deny(actor(a,sendSql(c,'race',req)));
  }
 }
});

test('unsubscribe committed before snapshot excludes; after snapshot does not wait or erase delivered receipt',async()=>{
 const {a,b,c}=fixture(),label='course_'+randomUUID().replaceAll('-','');
 const lock=asyncSql(`set application_name='${label}';begin;select pg_advisory_xact_lock(1297303352,hashtext('${c.id}'));select pg_sleep(2);commit;`);await barrier(label);
 const waiting=asyncSql(identity(a,sendSql(c)));subscribe(b,c,false);ok(await lock);deny(await waiting,/broadcast_audience/);assert.equal(count(),0);
 subscribe(b,c);const req=randomUUID();const holder=asyncSql(`set application_name='${label}';begin;${identity(a,sendSql(c,'delivered',req))}select pg_sleep(2);commit;`);await barrier(label);
 ok(actor(b,`set lock_timeout='500ms';select public.set_course_notification_subscription('${c.key}',false);`));ok(await holder);
 assert.equal(ok(sql('select count(*) from public.messaging_recipients;')),'1');assert.deepEqual(send(a,c,'delivered',req).recipient_count,1);
});

test('recipient ineligibility committed before snapshot excludes; after snapshot keeps receipt',async()=>{
 const {a,b,c}=fixture(),label='course_'+randomUUID().replaceAll('-','');
 const lock=asyncSql(`set application_name='${label}';begin;select pg_advisory_xact_lock(1297303352,hashtext('${c.id}'));select pg_sleep(2);commit;`);await barrier(label);
 const waiting=asyncSql(identity(a,sendSql(c)));ok(sql(`update public.user_accounts set account_status='suspended' where id='${b}';`));ok(await lock);deny(await waiting,/broadcast_audience/);
 ok(sql(`update public.user_accounts set account_status='active' where id='${b}';`));const holder=asyncSql(`set application_name='${label}';begin;${identity(a,sendSql(c))}select pg_sleep(2);commit;`);await barrier(label);
 ok(sql(`set lock_timeout='500ms';update public.user_accounts set account_status='suspended' where id='${b}';`));ok(await holder);assert.equal(ok(sql('select count(*) from public.messaging_recipients;')),'1');
});

test('venue cooldown, duplicate/day quota and two-operator quota race; other course budget independent',async()=>{
 const {a,b,c,admin}=fixture(),[x]=members();ok(sql(grant(c,x,admin)));const other=course();ok(sql(grant(other,a,admin)));subscribe(b,other);
 send(a,c,'first');deny(actor(x,sendSql(c,'second')),/cooldown/);send(a,other,'first');age(c);deny(actor(a,sendSql(c,' first ')),/duplicate/);
 for(let i=1;i<19;i++){age(c);send(i%2?a:x,c,'quota'+i);}age(c);
 const results=await Promise.all([asyncSql(identity(a,sendSql(c,'quota-final-a'))),asyncSql(identity(x,sendSql(c,'quota-final-x')))]);assert.equal(results.filter(r=>r.status===0).length,1);deny(results.find(r=>r.status!==0),/cooldown|quota/);age(c);deny(actor(a,sendSql(c,'over')),/quota/);
 assert.equal(ok(sql(`select count(*) from public.messaging_course_broadcast_contexts where course_id='${c.id}';`)),'20');
});

test('audience cap 10,000 sends all, 10,001 rejects without truncation',()=>{
 const {a,b,c}=fixture();subscribe(b,c,false);const ids=members(10001);
 ok(sql(`insert into public.course_notification_subscriptions(course_id,user_id) select '${c.id}',u::uuid from unnest(array[${ids.map(lit).join(',')}]) u;`));
 assert.deepEqual(preview(a,c),{recipient_count:10001,maximum:10000,can_send:false});deny(actor(a,sendSql(c)),/broadcast_audience/);assert.equal(count(),0);
 subscribe(ids[0],c,false);assert.equal(send(a,c).recipient_count,10000);assert.equal(ok(sql('select count(*) from public.messaging_recipients;')),'10000');
});
