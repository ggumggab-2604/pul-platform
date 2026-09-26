import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {before,after,beforeEach,test} from 'node:test';
import {startMarketTestEnvironment,redact} from '../market/marketTestEnvironment.mjs';
let env;
const migration=n=>readFileSync(new URL('../../../supabase/migrations/'+n,import.meta.url),'utf8');
const candidate=migration('20261009000100_pul_platform_broadcast_messaging.sql');
const lit=x=>"'"+String(x).replaceAll("'","''")+"'";
const sql=q=>env.sql(q);
const ok=r=>{assert.equal(r.status,0,redact(r.stderr+r.stdout));return r.stdout.trim();};
const json=r=>JSON.parse(ok(r)||'null');
const deny=(r,re=/messaging_|permission denied/)=>{assert.notEqual(r.status,0);assert.match(r.stderr,re);};
const identity=(a,q)=>`set request.jwt.claim.sub='${a}';set role authenticated;${q}`;
const actor=(a,q)=>sql(identity(a,q));
const sendSql=(body='공지',request=randomUUID())=>`select public.send_platform_broadcast(${lit(body)},'${request}');`;
const send=(a,body,request)=>json(actor(a,sendSql(body,request)));
const detail=(a,m)=>json(actor(a,`select public.get_messaging_message('${m}',false);`));
const count=()=>Number(ok(sql("select count(*) from public.messaging_messages where kind='platform_broadcast';")));
function members(n=1,role='member') {
 const ids=Array.from({length:n},()=>randomUUID());
 ok(sql(`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
 values ${ids.map(id=>`('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','${id}@example.invalid','',now(),now(),now())`).join(',')};
 update public.user_accounts set platform_role='${role}' where id in (${ids.map(lit).join(',')});
 insert into public.consent_records(user_id,consent_type,consent_version,decision)
 select u::uuid,t,v,'granted' from unnest(array[${ids.map(lit).join(',')}]) u
 cross join(values('terms_required','terms-dev-v1'),('privacy_required','privacy-dev-v1')) c(t,v);`));return ids;
}
function operator(){const a=members(1,'platform_admin')[0];ok(sql(`select private.set_messaging_broadcast_grant('${a}','${a}',true);`));return a;}
const age=(interval='11 minutes')=>ok(sql(`update public.messaging_messages set created_at=clock_timestamp()-interval '${interval}' where kind='platform_broadcast';`));
function asyncSql(q){assert.match(env.container,/^supabase_db_pul-market-test-\d+-[0-9a-f]{8}$/);return new Promise((resolve,reject)=>{
 const p=spawn('docker',['exec','-i',env.container,'psql','-U','postgres','-d','postgres','-X','-q','-t','-A','-v','ON_ERROR_STOP=1'],{windowsHide:true,stdio:['pipe','pipe','pipe']});let stdout='',stderr='';p.stdout.on('data',b=>stdout+=b);p.stderr.on('data',b=>stderr+=b);p.on('error',reject);p.on('close',status=>resolve({status,stdout,stderr}));p.stdin.end(q);
});}
async function barrier(label){for(let i=0;i<80;i++){if(ok(sql(`select exists(select 1 from pg_stat_activity where application_name='${label}' and wait_event='PgSleep');`))==='t')return;await new Promise(r=>setTimeout(r,50));}assert.fail('lock barrier');}
const catalog=()=>json(sql(`select jsonb_build_object(
 'functions',(select jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('definition',pg_get_functiondef(p.oid),'acl',p.proacl::text,'owner',pg_get_userbyid(p.proowner))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private') and p.prokind='f'),
 'relations',(select jsonb_object_agg(n.nspname||'.'||c.relname,jsonb_build_object('rls',c.relrowsecurity,'force',c.relforcerowsecurity,'acl',c.relacl::text,'owner',pg_get_userbyid(c.relowner))) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','private','storage')),
 'columns',(select jsonb_agg(to_jsonb(c) order by table_name,ordinal_position) from information_schema.columns c where table_schema='public'),
 'constraints',(select jsonb_object_agg(oid::text,pg_get_constraintdef(oid)) from pg_constraint where connamespace='public'::regnamespace),
 'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p));`));
before(async()=>{
 env=await startMarketTestEnvironment({port:55561});
 for(const f of ['20261004000100_pul_sec01_public_create_limits.sql','20261005000100_pul_sec02_content_moderation.sql','20261006000100_pul_common_messaging_foundation.sql','20261007000100_pul_messaging_block_list_read.sql','20261008000100_pul_market_messaging_context.sql'])ok(sql(`begin;${migration(f)}commit;`));
 const baseline=catalog();ok(sql(`begin;${candidate}rollback;`));assert.deepEqual(catalog(),baseline);
 ok(sql(`begin;${candidate}commit;`));const next=catalog();
 const changed=new Set(['private.messaging_check_delivery()','private.messaging_create(uuid,uuid,text,uuid)','private.messaging_list(text,integer,timestamp with time zone,uuid)','get_messaging_message(uuid,boolean)','submit_messaging_report(uuid,text,text)','hide_messaging_message(uuid)']);
 for(const [k,v]of Object.entries(baseline.functions)){if(changed.has(k)){assert.equal(next.functions[k].acl,v.acl);assert.equal(next.functions[k].owner,v.owner);}else assert.deepEqual(next.functions[k],v,k);}
 for(const [k,v]of Object.entries(baseline.relations))assert.deepEqual(next.relations[k],v,k);
 assert.deepEqual(next.policies,baseline.policies);console.log('1E rollback, six explicit extensions, unrelated definitions/ACL/owners/RLS/policies preserved PASS');
 if(process.env.PUL_MESSAGING_CLUB_CANDIDATE==='1')ok(sql(`begin;${migration('20261010000100_pul_club_broadcast_messaging.sql')}commit;`));
});
after(async()=>{if(env)await env.stop();});
beforeEach(()=>{ok(sql(`delete from public.messaging_messages; delete from public.messaging_broadcast_grants;
 update public.user_accounts set account_status='suspended';
 update public.platform_permission_definitions set is_active=true where code='messaging.broadcast.manage';
 insert into public.platform_role_permissions(platform_role,permission_code) values('platform_admin','messaging.broadcast.manage') on conflict do nothing;
 delete from public.audit_logs where action like 'messaging.broadcast.%';`));});

test('authorization requires current active completed actor + permission + personal grant; no spoof parameters',()=>{
 const [member]=members(),[admin]=members(1,'platform_admin');
 deny(actor(member,sendSql()));deny(actor(admin,sendSql()));
 ok(sql(`insert into public.messaging_broadcast_grants(user_id,granted_by) values('${member}','${admin}');`));deny(actor(member,sendSql()));
 ok(sql(`select private.set_messaging_broadcast_grant('${admin}','${admin}',true);`));send(admin);
 for(const state of ['suspended','withdrawn']){ok(sql(`update public.user_accounts set account_status='${state}' where id='${admin}';`));deny(actor(admin,sendSql()));}
 ok(sql(`update public.user_accounts set account_status='active' where id='${admin}';delete from public.consent_records where user_id='${admin}';`));deny(actor(admin,sendSql()));
 deny(actor(member,`select public.send_platform_broadcast(p_body=>'spoof',p_request_id=>gen_random_uuid(),p_sender_user_id=>'${admin}');`),/does not exist/);
});
test('preview revalidation, exact eligible snapshot, sender exclude, later signup and replay frozen',()=>{
 const a=operator(),[b,c,d,e,f]=members(5);ok(sql(`update public.user_accounts set account_status='suspended' where id='${d}';update public.user_accounts set account_status='withdrawn' where id='${e}';delete from public.consent_records where user_id='${f}';`));
 assert.equal(json(actor(a,'select public.preview_platform_broadcast();')).recipient_count,2);
 ok(sql(`update public.user_accounts set account_status='suspended' where id='${c}';`));const req=randomUUID(),m=send(a,' snapshot ',req);assert.equal(m.recipient_count,1);
 assert.deepEqual(json(sql(`select jsonb_agg(recipient_user_id) from public.messaging_recipients where message_id='${m.id}';`)),[b]);
 members();assert.deepEqual(send(a,'snapshot',req),m);assert.equal(count(),1);assert.equal(json(actor(a,`select public.get_platform_broadcast('${m.id}');`)).recipient_count,1);
});
test('block exemption only for broadcast, recipient IDOR, own read/hide, no reply/report/sender mailbox',()=>{
 const a=operator(),[b,c]=members(2);ok(actor(b,`select public.set_messaging_block('${a}',true);`));const m=send(a),outsider=members()[0];
 deny(actor(a,`select public.send_messaging_message('${b}','direct',gen_random_uuid());`));
 assert.equal(detail(b,m.id).kind,'platform_broadcast');assert.equal(detail(c,m.id).counterpart_user_id,null);deny(actor(outsider,`select public.get_messaging_message('${m.id}',false);`));deny(actor(a,`select public.get_messaging_message('${m.id}',false);`));
 ok(actor(b,`select public.mark_messaging_message_read('${m.id}');`));assert.equal(detail(c,m.id).read_at,null);
 deny(actor(b,`select public.reply_messaging_message('${m.id}','reply',gen_random_uuid());`));deny(actor(a,`select public.reply_messaging_message('${m.id}','reply',gen_random_uuid());`));deny(actor(b,`select public.submit_messaging_report('${m.id}','spam','');`));
 assert.equal(json(actor(a,'select public.list_messaging_sent();')).items.length,0);
 assert.equal(json(actor(b,'select public.list_messaging_inbox();')).items[0].counterpart_display,'PUL 공지');
 ok(actor(b,`select public.hide_messaging_message('${m.id}');`));deny(actor(b,`select public.get_messaging_message('${m.id}',false);`));assert.equal(detail(c,m.id).id,m.id);assert.equal(count(),1);
});
test('replay conflict and direct/market collisions both directions never convert an original',()=>{
 const a=operator(),b=members()[0],request=randomUUID();const m=send(a,'broadcast',request);deny(actor(a,sendSql('changed',request)),/replay_conflict/);
 deny(actor(a,`select public.send_messaging_message('${b}','broadcast','${request}');`),/replay_conflict/);
 const listing=ok(sql(`insert into public.market_listings(seller_user_id,title,category_code,price_amount,region_code,condition_code,trade_type_code,description) values('${b}','LOCAL 판매','club',1,'서울','normal','direct','LOCAL fixture description') returning id;`));
 deny(actor(a,`select public.send_market_listing_message('${listing}','broadcast','${request}');`),/replay_conflict/);
 const directReq=randomUUID();ok(actor(a,`select public.send_messaging_message('${b}','private','${directReq}');`));deny(actor(a,sendSql('private',directReq)),/replay_conflict/);
 ok(sql(`update public.messaging_messages set created_at=clock_timestamp()-interval '4 seconds' where kind='direct';`));const marketReq=randomUUID();ok(actor(a,`select public.send_market_listing_message('${listing}','market','${marketReq}');`));deny(actor(a,sendSql('market',marketReq)),/replay_conflict/);assert.equal(count(),1);assert.equal(m.recipient_count,1);
});
test('recipient insert failure rolls back original, all receipts, audit, quota and replay reservation',()=>{
 const a=operator();members(3);const req=randomUUID();
 ok(sql(`create function private.test_broadcast_failure() returns trigger language plpgsql as $$begin if new.kind='platform_broadcast' then raise exception 'injected failure';end if;return new;end;$$;
 create trigger local_fail after insert on public.messaging_messages for each row execute function private.test_broadcast_failure();`));
 deny(actor(a,sendSql('atomic',req)),/injected failure/);assert.equal(count(),0);assert.equal(ok(sql("select count(*) from public.audit_logs where action='messaging.broadcast.send';")),'0');
 ok(sql('drop trigger local_fail on public.messaging_messages;drop function private.test_broadcast_failure();'));
 // Force an error after some recipient inserts, not just before bulk insertion.
 ok(sql(`create function private.test_receipt_failure() returns trigger language plpgsql as $$begin if (select count(*) from public.messaging_recipients where message_id=new.message_id)>=1 then raise exception 'receipt failure';end if;return new;end;$$;create trigger local_fail before insert on public.messaging_recipients for each row execute function private.test_receipt_failure();`));
 deny(actor(a,sendSql('atomic',req)),/receipt failure/);assert.equal(count(),0);assert.equal(ok(sql('select count(*) from public.messaging_recipients;')),'0');
 ok(sql('drop trigger local_fail on public.messaging_recipients;drop function private.test_receipt_failure();'));assert.equal(send(a,'atomic',req).recipient_count,3);
});
test('same request concurrency creates exactly one immutable snapshot',async()=>{
 const a=operator();members(3);const req=randomUUID();const results=await Promise.all([asyncSql(identity(a,sendSql('race',req))),asyncSql(identity(a,sendSql('race',req)))]);assert.deepEqual(json(results[0]),json(results[1]));assert.equal(count(),1);assert.equal(ok(sql('select count(*) from public.messaging_recipients;')),'3');
});
test('different operators share quota lock; duplicate body and 10-minute/24-hour boundaries',async()=>{
 const a=operator(),b=operator();members();const results=await Promise.all([asyncSql(identity(a,sendSql('A'))),asyncSql(identity(b,sendSql('B')))]);assert.equal(results.filter(x=>x.status===0).length,1);deny(results.find(x=>x.status!==0),/cooldown/);
 const body=ok(sql("select body from public.messaging_messages where kind='platform_broadcast';"));age();deny(actor(a,sendSql('  '+body+'  ')),/duplicate/);
 for(let i=1;i<5;i++){send(a,'distinct '+i);age();}deny(actor(b,sendSql('sixth')),/quota/);
 age('24 hours');send(b,'sixth');assert.equal(count(),6);
});
test('grant, permission and sender status revocation winning the global lock causes queued send denial',async()=>{
 for(const kind of ['grant','permission','account']){
  const a=operator();members();const label='broadcast_'+randomUUID().replaceAll('-','');
  const change=kind==='grant'?`update public.messaging_broadcast_grants set revoked_at=clock_timestamp() where user_id='${a}';`:kind==='permission'?"update public.platform_permission_definitions set is_active=false where code='messaging.broadcast.manage';":`update public.user_accounts set account_status='suspended' where id='${a}';`;
  const holder=asyncSql(`set application_name='${label}';begin;select pg_advisory_xact_lock(1297303348,1);select pg_sleep(3);${change}commit;`);await barrier(label);const queued=asyncSql(identity(a,sendSql()));ok(await holder);deny(await queued,/permission|account_unavailable/);assert.equal(count(),0);
  ok(sql("update public.platform_permission_definitions set is_active=true where code='messaging.broadcast.manage';"));
 }
});
test('send winning first precedes grant revoke; replay after revoke is denied',async()=>{
 const a=operator();members();const req=randomUUID(),label='broadcast_'+randomUUID().replaceAll('-','');
 const holder=asyncSql(`set application_name='${label}';begin;${identity(a,sendSql('winner',req))}select pg_sleep(3);commit;`);await barrier(label);
 const revoked=asyncSql(`select private.set_messaging_broadcast_grant('${a}','${a}',false);`);ok(await holder);ok(await revoked);assert.equal(count(),1);deny(actor(a,sendSql('winner',req)),/permission/);
});
test('snapshot account change linearizes at eligibility statement without locking all member rows',async()=>{
 const a=operator(),b=members()[0],label='broadcast_'+randomUUID().replaceAll('-','');
 const holder=asyncSql(`set application_name='${label}';begin;select pg_advisory_xact_lock(1297303348,1);select pg_sleep(3);update public.user_accounts set account_status='suspended' where id='${b}';commit;`);await barrier(label);const queued=asyncSql(identity(a,sendSql()));ok(await holder);deny(await queued,/broadcast_audience/);assert.equal(count(),0);
});
test('unknown kind rejected; direct exactly-one and broadcast 1..N creation enforced',()=>{
 const a=operator(),[b,c]=members(2);const insert=(kind,n)=>`insert into public.messaging_messages(id,kind,sender_user_id,body,body_hash,recipient_key,request_id,request_fingerprint,first_contact,broadcast_recipient_count) values(gen_random_uuid(),'${kind}','${a}','x','x','x',gen_random_uuid(),'x',false,${n}) returning id`;
 deny(sql(insert('unknown','null')),/check constraint/);deny(sql(insert('direct','null')),/delivery_invariant/);deny(sql(insert('platform_broadcast',2)),/delivery_invariant/);deny(sql(insert('platform_broadcast',0)),/check constraint/);
 deny(sql(`begin;with m as (${insert('direct','null').replace('returning id','returning id,created_at')}) insert into public.messaging_recipients select id,x,created_at from m cross join unnest(array['${b}','${c}']::uuid[]) x;commit;`),/delivery_invariant/);
 const m=send(a);assert.equal(m.recipient_count,2);deny(sql(`insert into public.messaging_recipients values('${m.id}','${a}',now(),null,null);`),/delivery_invariant/);
});
test('operator history is own-only, bounded, grant gated; audit has no body or recipient list',()=>{
 const a=operator(),other=operator();members(2);const m=send(a,'PRIVATE BODY');
 assert.equal(json(actor(a,'select public.list_platform_broadcasts();')).items.length,1);assert.equal(json(actor(other,'select public.list_platform_broadcasts();')).items.length,0);deny(actor(other,`select public.get_platform_broadcast('${m.id}');`));
 const info=json(actor(a,`select public.get_platform_broadcast('${m.id}');`));assert.deepEqual(Object.keys(info).sort(),['id','body','created_at','sender_display','recipient_count'].sort());
 const audit=json(sql(`select after_summary from public.audit_logs where action='messaging.broadcast.send' and target_id='${m.id}';`));assert.deepEqual(Object.keys(audit).sort(),['audience','recipient_count','created_at','result'].sort());assert.ok(!JSON.stringify(audit).includes('PRIVATE BODY'));
 ok(sql(`delete from public.platform_role_permissions where permission_code='messaging.broadcast.manage';`));deny(actor(a,'select public.preview_platform_broadcast();'));deny(actor(a,`select public.get_platform_broadcast('${m.id}');`));
});
test('grant DML and private helper ACL deny browser/service roles; new RPC security properties',()=>{
 const a=operator();for(const role of ['anon','authenticated','service_role']){for(const q of ['select * from','delete from'])deny(sql(`set role ${role};${q} public.messaging_broadcast_grants;`));deny(sql(`set role ${role};select private.set_messaging_broadcast_grant('${a}','${a}',true);`));}
 const rows=json(sql("select jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(proowner),'definer',prosecdef,'config',proconfig,'anon',has_function_privilege('anon',oid,'execute'),'service',has_function_privilege('service_role',oid,'execute'),'auth',has_function_privilege('authenticated',oid,'execute'))) from pg_proc where proname in ('preview_platform_broadcast','send_platform_broadcast','list_platform_broadcasts','get_platform_broadcast');"));assert.equal(rows.length,4);for(const r of rows)assert.deepEqual(r,{owner:'postgres',definer:true,config:['search_path=""'],anon:false,service:false,auth:true});
 assert.equal(ok(sql("select relrowsecurity and relforcerowsecurity from pg_class where oid='public.messaging_broadcast_grants'::regclass;")),'t');
});
test('sender withdrawal and physical deletion preserve original and recipients',()=>{
 const a=operator(),b=members()[0],m=send(a);ok(sql(`update public.user_accounts set account_status='withdrawn' where id='${a}';`));assert.equal(detail(b,m.id).counterpart_display,'PUL 공지');
 ok(sql(`delete from public.user_accounts where id='${a}';`));assert.equal(detail(b,m.id).id,m.id);assert.equal(count(),1);
});
test('10,000 recipient load succeeds as one original; 10,001 rejects without partial delivery',()=>{
 const a=operator();
 ok(sql(`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
 select id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',id::text||'@example.invalid','',now(),now(),now() from(select gen_random_uuid() id from generate_series(1,10000)) s;
 insert into public.consent_records(user_id,consent_type,consent_version,decision)
 select a.id,t,v,'granted' from public.user_accounts a cross join(values('terms_required','terms-dev-v1'),('privacy_required','privacy-dev-v1')) c(t,v)
 where a.account_status='active' and a.id<>'${a}';`));
 const started=performance.now();const m=send(a,'bulk');const elapsed=performance.now()-started;assert.equal(m.recipient_count,10000);assert.equal(count(),1);assert.equal(ok(sql(`select count(*) from public.messaging_recipients where message_id='${m.id}';`)),'10000');console.log(`1E LOAD 10000 recipients: ${Math.round(elapsed)} ms including Docker/psql + deferred commit checks`);
 members();age();deny(actor(a,sendSql('overflow')),/broadcast_audience/);assert.equal(count(),1);
});
