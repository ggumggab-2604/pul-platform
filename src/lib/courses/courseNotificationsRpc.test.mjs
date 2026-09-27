import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {before,after,beforeEach,test} from 'node:test';
import {startMarketTestEnvironment,redact} from '../market/marketTestEnvironment.mjs';
let env;
const file=n=>readFileSync(new URL('../../../supabase/migrations/'+n,import.meta.url),'utf8');
const candidate=file('20261012000100_pul_course_notification_subscription_foundation.sql');
const sql=q=>env.sql(q);
const ok=r=>{assert.equal(r.status,0,redact(r.stderr+r.stdout));return r.stdout.trim();};
const json=r=>JSON.parse(ok(r)||'null');
const deny=(r,re=/course_notification_|permission denied|messaging_/)=>{assert.notEqual(r.status,0);assert.match(r.stderr,re);};
const identity=(u,q)=>`set request.jwt.claim.sub='${u}';set role authenticated;${q}`;
const actor=(u,q)=>sql(identity(u,q));
const set=(u,k,on)=>json(actor(u,`select public.set_course_notification_subscription('${k}',${on});`));
const get=(u,k)=>json(actor(u,`select public.get_course_notification_subscription('${k}');`));
const list=(u,limit=20,cursor=null)=>json(actor(u,`select public.list_my_course_notification_subscriptions(${limit},${cursor?"'"+cursor+"'":'null'});`));
const user=(role='member',status='active',complete=true)=>{
 const id=randomUUID();ok(sql(`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','${id}@example.invalid','',now(),now(),now());update public.user_accounts set platform_role='${role}',account_status='${status}' where id='${id}';${complete?`insert into public.consent_records(user_id,consent_type,consent_version,decision) values('${id}','terms_required','terms-dev-v1','granted'),('${id}','privacy_required','privacy-dev-v1','granted');`:''}`));return id;
};
function course(type='field',status='active'){
 const key='local-'+randomUUID();const id=ok(sql(`insert into public.courses(course_key,name,course_type,region,city,address,holes,operation_code,description,course_status,reservation_url,reservation_guide) values('${key}','TEST 장소','${type}','서울','TEST 시','TEST 주소',18,'reservation','TEST 장소 설명입니다.','${status}','https://example.invalid/reserve','공식 안내') returning id;`));return {id,key};
}
const grant=(c,u,a,on)=>sql(`select private.set_course_messaging_operator_grant('${c.id}','${u}','${a}',${on});`);
const authorize=(c,u)=>sql(`set request.jwt.claim.sub='${u}';select private.messaging_assert_course_broadcaster('${c.id}');`);
const catalog=()=>json(sql(`select jsonb_build_object('functions',(select jsonb_object_agg(n.nspname||'.'||p.oid::regprocedure::text,jsonb_build_object('def',pg_get_functiondef(p.oid),'owner',p.proowner,'acl',p.proacl::text)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind='f'),'relations',(select jsonb_object_agg(n.nspname||'.'||c.relname,jsonb_build_object('rls',c.relrowsecurity,'force',c.relforcerowsecurity,'acl',c.relacl::text,'owner',c.relowner)) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private')),'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p));`));
function asyncSql(q){assert.match(env.container,/^supabase_db_pul-market-test-\d+-[0-9a-f]{8}$/);return new Promise((resolve,reject)=>{
 const p=spawn('docker',['exec','-i',env.container,'psql','-U','postgres','-d','postgres','-X','-q','-t','-A','-v','ON_ERROR_STOP=1'],{windowsHide:true,stdio:['pipe','pipe','pipe']});let stdout='',stderr='';p.stdout.on('data',b=>stdout+=b);p.stderr.on('data',b=>stderr+=b);p.on('error',reject);p.on('close',status=>resolve({status,stdout,stderr}));p.stdin.end(q);
});}
async function barrier(label){for(let i=0;i<100;i++){if(ok(sql(`select exists(select 1 from pg_stat_activity where application_name='${label}' and wait_event='PgSleep');`))==='t')return;await new Promise(r=>setTimeout(r,50));}assert.fail('two-connection barrier');}
before(async()=>{
 env=await startMarketTestEnvironment({port:55621});
 for(const f of ['20261004000100_pul_sec01_public_create_limits.sql','20261005000100_pul_sec02_content_moderation.sql','20261006000100_pul_common_messaging_foundation.sql','20261007000100_pul_messaging_block_list_read.sql','20261008000100_pul_market_messaging_context.sql','20261009000100_pul_platform_broadcast_messaging.sql','20261010000100_pul_club_broadcast_messaging.sql','20261011000100_pul_club_event_broadcast_messaging.sql'])ok(sql(`begin;${file(f)}commit;`));
 const old=catalog();ok(sql(`begin;${candidate}rollback;`));assert.deepEqual(catalog(),old);
 ok(sql(`begin;${candidate}commit;`));const next=catalog();
 for(const part of ['functions','relations'])for(const [k,v]of Object.entries(old[part]))assert.deepEqual(next[part][k],v,k);
 assert.deepEqual(next.policies,old.policies);
 for(const name of ['course_notification_subscriptions','course_messaging_operator_grants'])assert.equal(ok(sql(`select count(*) from public.${name};`)),'0');
 console.log('All preexisting function definitions/owners/ACL, relation security and policies unchanged; rollback and zero seeds PASS');
});
after(async()=>{if(env)await env.stop();});
beforeEach(()=>ok(sql('delete from public.course_notification_subscriptions;delete from public.course_messaging_operator_grants;')));

test('field/screen subscribe, repeated no-op timestamps, unsubscribe/resubscribe, zero subscription audit',()=>{
 const u=user(),audit=ok(sql('select count(*) from public.audit_logs;'));
 for(const type of ['field','screen']){
  const c=course(type);assert.equal(get(u,c.key).subscribed,false);assert.equal(set(u,c.key,true).subscribed,true);
  const row=()=>json(sql(`select to_jsonb(s) from public.course_notification_subscriptions s where course_id='${c.id}';`));const first=row();
  set(u,c.key,true);assert.deepEqual(row(),first);set(u,c.key,false);const off=row();set(u,c.key,false);assert.deepEqual(row(),off);
  set(u,c.key,true);assert.equal(row().first_subscribed_at,first.first_subscribed_at);assert.equal(row().unsubscribed_at,null);assert.ok(row().subscribed_at>=first.subscribed_at);
 }
 assert.equal(ok(sql('select count(*) from public.course_notification_subscriptions;')),'2');assert.equal(ok(sql('select count(*) from public.audit_logs;')),audit);
});
test('missing/inactive/removed/unsupported source denies new subscriptions; explicit type whitelist',()=>{
 const u=user();for(const status of ['inactive','removed']){const c=course('field',status);deny(actor(u,`select public.set_course_notification_subscription('${c.key}',true);`));assert.equal(set(u,c.key,false).subscribed,false);}
 deny(actor(u,"select public.set_course_notification_subscription('missing',true);"));
 const c=course();ok(sql(`alter table public.courses drop constraint courses_type_check;update public.courses set course_type='future_type' where id='${c.id}';`));
 deny(actor(u,`select public.set_course_notification_subscription('${c.key}',true);`));
 const admin=user('platform_admin');deny(grant(c,u,admin,true));
 ok(sql(`update public.courses set course_type='field' where id='${c.id}';alter table public.courses add constraint courses_type_check check(course_type in ('field','screen'));`));
});
test('suspended/withdrawn/incomplete target cannot subscribe; disabled account can withdraw existing choice',()=>{
 const c=course();for(const u of [user('member','suspended'),user('member','withdrawn'),user('member','active',false)])deny(actor(u,`select public.set_course_notification_subscription('${c.key}',true);`));
 const u=user();set(u,c.key,true);ok(sql(`update public.user_accounts set account_status='suspended' where id='${u}';`));assert.equal(get(u,c.key).subscribed,true);assert.equal(set(u,c.key,false).subscribed,false);
});
test('auth.uid isolation and private lists; no client-selected user or direct table access',()=>{
 const a=user(),b=user(),c=course();set(a,c.key,true);assert.equal(get(b,c.key).subscribed,false);set(b,c.key,false);assert.equal(get(a,c.key).subscribed,true);assert.equal(list(b).items.length,0);
 deny(actor(b,`select public.set_course_notification_subscription('${c.key}',false,'${a}');`),/does not exist/);
 for(const role of ['anon','authenticated','service_role'])for(const table of ['course_notification_subscriptions','course_messaging_operator_grants'])for(const q of [`select * from public.${table}`,`delete from public.${table}`,`update public.${table} set user_id=user_id`,`insert into public.${table}(course_id,user_id) values('${c.id}','${b}')`])deny(sql(`set role ${role};${q};`),/permission denied/);
 for(const q of [`select public.get_course_notification_subscription('${c.key}')`,`select public.set_course_notification_subscription('${c.key}',true)`,'select public.list_my_course_notification_subscriptions()'])deny(sql(`set role anon;${q};`),/permission denied/);
});
test('own list keyset pagination/read-only; unavailable metadata concealed but withdrawal stays reachable',()=>{
 const u=user(),cs=[course(),course('screen'),course()];for(const c of cs)set(u,c.key,true);
 const first=list(u,2),second=list(u,2,first.next_cursor);assert.equal(first.items.length,2);assert.equal(second.items.length,1);assert.equal(second.next_cursor,null);
 assert.equal(new Set([...first.items,...second.items].map(x=>x.course_key)).size,3);
 ok(actor(u,'begin transaction read only;select public.list_my_course_notification_subscriptions();commit;'));
 const c=cs[0];ok(sql(`update public.courses set course_status='removed' where id='${c.id}';`));assert.deepEqual(get(u,c.key),{course_key:c.key,subscribed:true,available:false});
 const hidden=list(u).items.find(x=>x.course_key===c.key);assert.equal(hidden.name,null);assert.equal(hidden.course_type,null);assert.deepEqual(Object.keys(hidden).sort(),['available','course_key','course_type','name','subscribed']);
 deny(actor(u,`select public.set_course_notification_subscription('${c.key}',true);`));set(u,c.key,false);assert.equal(list(u).items.length,2);
});
test('hard-deleted course cascades both relations',()=>{
 const a=user('platform_admin'),u=user(),c=course();set(u,c.key,true);ok(grant(c,u,a,true));ok(sql(`delete from public.courses where id='${c.id}';`));
 for(const table of ['course_notification_subscriptions','course_messaging_operator_grants'])assert.equal(ok(sql(`select count(*) from public.${table} where course_id='${c.id}';`)),'0');
});
test('two connections: duplicate subscribe yields one active row',async()=>{
 const u=user(),c=course();const q=identity(u,`select public.set_course_notification_subscription('${c.key}',true);`);
 const results=await Promise.all([asyncSql(q),asyncSql(q)]);results.forEach(ok);assert.equal(ok(sql(`select count(*) from public.course_notification_subscriptions where course_id='${c.id}' and unsubscribed_at is null;`)),'1');
});
for(const first of [true,false])test(`two connections: ${first?'subscribe then unsubscribe':'unsubscribe then subscribe'} follows pair lock order even on absent row`,async()=>{
 const u=user(),c=course(),label='subscription_'+randomUUID().replaceAll('-','');
 const holder=asyncSql(`set application_name='${label}';${identity(u,`begin;select public.set_course_notification_subscription('${c.key}',${first});select pg_sleep(1.5);commit;`)}`);await barrier(label);
 const waiter=asyncSql(identity(u,`select public.set_course_notification_subscription('${c.key}',${!first});`));ok(await holder);ok(await waiter);assert.equal(get(u,c.key).subscribed,!first);
});
test('two connections: source deactivation winning lock denies waiting subscription',async()=>{
 const u=user(),c=course(),label='lifecycle_'+randomUUID().replaceAll('-','');
 const holder=asyncSql(`set application_name='${label}';begin;update public.courses set course_status='inactive' where id='${c.id}';select pg_sleep(1.5);commit;`);await barrier(label);
 const waiter=asyncSql(identity(u,`select public.set_course_notification_subscription('${c.key}',true);`));ok(await holder);deny(await waiter);assert.equal(ok(sql(`select count(*) from public.course_notification_subscriptions where course_id='${c.id}';`)),'0');
});
test('trusted grants work for both types; grant/revoke/regrant audits exact and no-op audit zero',()=>{
 const a=user('platform_admin'),u=user();for(const type of ['field','screen']){
  const c=course(type);ok(grant(c,u,a,true));const first=json(sql(`select to_jsonb(g) from public.course_messaging_operator_grants g where course_id='${c.id}';`));ok(grant(c,u,a,true));assert.deepEqual(json(sql(`select to_jsonb(g) from public.course_messaging_operator_grants g where course_id='${c.id}';`)),first);
  assert.equal(ok(authorize(c,u)),u);ok(grant(c,u,a,false));deny(authorize(c,u));ok(grant(c,u,a,false));ok(grant(c,u,a,true));assert.equal(ok(authorize(c,u)),u);
  const audits=json(sql(`select jsonb_agg(jsonb_build_object('actor',actor_id,'summary',after_summary,'time',created_at)) from public.audit_logs where action='messaging.course.operator_grant' and target_id='${c.id}';`));assert.equal(audits.length,3);for(const row of audits){assert.equal(row.actor,a);assert.deepEqual(Object.keys(row.summary).sort(),['active','course_id','target_user_id']);assert.equal(row.summary.target_user_id,u);assert.equal(row.summary.course_id,c.id);assert.ok(row.time);}
 }
});
test('grant helper unavailable to member/platform_admin browsers and service_role; no platform/courses.manage bypass',()=>{
 const a=user('platform_admin'),u=user(),c=course(),other=course();
 for(const role of ['anon','authenticated','service_role'])for(const actorId of [u,a])deny(sql(`set request.jwt.claim.sub='${actorId}';set role ${role};select private.set_course_messaging_operator_grant('${c.id}','${actorId}','${a}',true);`),/permission denied/);
 assert.equal(ok(sql(`set request.jwt.claim.sub='${a}';select public.current_user_has_platform_permission('courses.manage');`)),'t');deny(authorize(c,a));deny(authorize(c,u));ok(grant(c,u,a,true));deny(authorize(other,u));
});
test('grant rejects unavailable target/source/processor and revoke remains possible after source withdrawal',()=>{
 const a=user('platform_admin'),u=user(),c=course();for(const target of [user('member','suspended'),user('member','withdrawn'),user('member','active',false)])deny(grant(c,target,a,true));
 for(const processor of [u,user('platform_admin','suspended'),user('platform_admin','active',false)])deny(grant(c,u,processor,true));
 for(const status of ['inactive','removed'])deny(grant(course('field',status),u,a,true));deny(grant({id:randomUUID()},u,a,true));
 ok(grant(c,u,a,true));ok(sql(`update public.courses set course_status='inactive' where id='${c.id}';`));deny(authorize(c,u));ok(grant(c,u,a,false));
});
for(const first of [true,false])test(`two connections: grant/revoke pair serialization first=${first}`,async()=>{
 const a=user('platform_admin'),u=user(),c=course(),label='grant_'+randomUUID().replaceAll('-','');
 const command=on=>`select private.set_course_messaging_operator_grant('${c.id}','${u}','${a}',${on});`;
 const holder=asyncSql(`set application_name='${label}';begin;${command(first)}select pg_sleep(1.5);commit;`);await barrier(label);
 const waiter=asyncSql(command(!first));ok(await holder);ok(await waiter);
 assert.equal(ok(sql(`select count(*) from public.course_messaging_operator_grants where course_id='${c.id}' and revoked_at is null;`)),first?'0':'1');
});
test('RLS FORCE, owners, empty search paths, explicit ACL and no client private helper execution',()=>{
 for(const table of ['course_notification_subscriptions','course_messaging_operator_grants'])assert.deepEqual(json(sql(`select jsonb_build_object('rls',relrowsecurity,'force',relforcerowsecurity,'owner',pg_get_userbyid(relowner)) from pg_class where oid='public.${table}'::regclass;`)),{rls:true,force:true,owner:'postgres'});
 const funcs=json(sql(`select jsonb_agg(jsonb_build_object('name',n.nspname||'.'||p.proname,'signature',p.oid::regprocedure::text,'definer',p.prosecdef,'owner',pg_get_userbyid(p.proowner),'config',p.proconfig,'anon',has_function_privilege('anon',p.oid,'execute'),'auth',has_function_privilege('authenticated',p.oid,'execute'),'service',has_function_privilege('service_role',p.oid,'execute'))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname in ('course_notification_actor','get_course_notification_subscription','set_course_notification_subscription','list_my_course_notification_subscriptions','set_course_messaging_operator_grant','messaging_assert_course_broadcaster');`));
 assert.equal(funcs.length,6);for(const f of funcs){assert.equal(f.definer,true);assert.equal(f.owner,'postgres');assert.ok(f.config.includes('search_path=""'));assert.equal(f.anon,false);assert.equal(f.service,false);assert.equal(f.auth,f.name.startsWith('public.'));}
});
test('course regression: public field/screen detail, management, reservation guide and club links still work',()=>{
 const a=user('platform_admin');for(const type of ['field','screen']){
  const c=course(type);const pub=json(sql(`set role anon;select public.get_public_course('${c.key}');`));assert.equal(pub.course_type,type);assert.equal(pub.reservation_url,'https://example.invalid/reserve');assert.equal(pub.reservation_guide,'공식 안내');assert.equal('id' in pub,false);
  const managed=json(actor(a,`select public.get_course_for_management('${c.key}');`));assert.ok(managed);
  assert.deepEqual(json(sql(`set role anon;select public.list_public_course_clubs('${c.key}');`)),[]);
 }
});
