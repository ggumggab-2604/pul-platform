import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {before,after,beforeEach,test} from 'node:test';
import {startMarketTestEnvironment,redact} from '../market/marketTestEnvironment.mjs';
let env;
const migration=n=>readFileSync(new URL('../../../supabase/migrations/'+n,import.meta.url),'utf8');
const candidate=migration('20261010000100_pul_club_broadcast_messaging.sql');
const lit=x=>"'"+String(x).replaceAll("'","''")+"'";
const sql=q=>env.sql(q);
const ok=r=>{assert.equal(r.status,0,redact(r.stderr+r.stdout));return r.stdout.trim();};
const json=r=>JSON.parse(ok(r)||'null');
const deny=(r,re=/messaging_|permission denied/)=>{assert.notEqual(r.status,0);assert.match(r.stderr,re);};
const identity=(a,q)=>`set request.jwt.claim.sub='${a}';set role authenticated;${q}`;
const actor=(a,q)=>sql(identity(a,q));
const sendSql=(c,body='notice',request=randomUUID())=>`select public.send_club_broadcast('${c}',${lit(body)},'${request}');`;
const send=(a,c,body,request)=>json(actor(a,sendSql(c,body,request)));
const detail=(a,m)=>json(actor(a,`select public.get_messaging_message('${m}',false);`));
const count=()=>Number(ok(sql("select count(*) from public.messaging_messages where kind='club_broadcast';")));
function members(n=1,role='member') {
 const ids=Array.from({length:n},()=>randomUUID());
 ok(sql(`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
 values ${ids.map(id=>`('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','${id}@example.invalid','',now(),now(),now())`).join(',')};
 update public.user_accounts set platform_role='${role}' where id in (${ids.map(lit).join(',')});
 insert into public.consent_records(user_id,consent_type,consent_version,decision)
 select u::uuid,t,v,'granted' from unnest(array[${ids.map(lit).join(',')}]) u
 cross join(values('terms_required','terms-dev-v1'),('privacy_required','privacy-dev-v1')) c(t,v);`));return ids;
}
function club(){return ok(sql(`insert into public.clubs(name,legacy_key) values('LOCAL club','local-${randomUUID()}') returning id;`));}
function join(c,a,role='club_member'){
 if(role==='club_admin'){
  // Preserve the official guarded appointment triggers in the disposable DB.
  ok(sql(`set request.jwt.claim.role='service_role';select * from public.appoint_initial_club_admin('${c}','${a}','${a}',gen_random_uuid(),'LOCAL test fixture');`));
  return ok(sql(`select id from public.club_memberships where club_id='${c}' and user_id='${a}';`));
 }
 const m=ok(sql(`insert into public.club_memberships(club_id,user_id) values('${c}','${a}') returning id;`));
 ok(sql(`insert into public.club_role_assignments(membership_id,role_code) values('${m}','${role}');`));return m;
}
function fixture(role='club_manager'){const c=club(),[a,b]=members(2);const membership=join(c,a,role);join(c,b);return {a,b,c,membership};}
const age=(c,interval='4 minutes')=>ok(sql(`update public.messaging_messages set created_at=clock_timestamp()-interval '${interval}' where id in(select message_id from public.messaging_club_broadcast_contexts where club_id='${c}');`));
function asyncSql(q){assert.match(env.container,/^supabase_db_pul-market-test-\d+-[0-9a-f]{8}$/);return new Promise((resolve,reject)=>{
 const p=spawn('docker',['exec','-i',env.container,'psql','-U','postgres','-d','postgres','-X','-q','-t','-A','-v','ON_ERROR_STOP=1'],{windowsHide:true,stdio:['pipe','pipe','pipe']});let stdout='',stderr='';p.stdout.on('data',b=>stdout+=b);p.stderr.on('data',b=>stderr+=b);p.on('error',reject);p.on('close',status=>resolve({status,stdout,stderr}));p.stdin.end(q);
});}
async function barrier(label){for(let i=0;i<100;i++){if(ok(sql(`select exists(select 1 from pg_stat_activity where application_name='${label}' and wait_event='PgSleep');`))==='t')return;await new Promise(r=>setTimeout(r,50));}assert.fail('lock barrier');}
const catalog=()=>json(sql(`select jsonb_build_object(
 'functions',(select jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('definition',pg_get_functiondef(p.oid),'acl',p.proacl::text,'owner',pg_get_userbyid(p.proowner))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private') and p.prokind='f'),
 'relations',(select jsonb_object_agg(n.nspname||'.'||c.relname,jsonb_build_object('rls',c.relrowsecurity,'force',c.relforcerowsecurity,'acl',c.relacl::text,'owner',pg_get_userbyid(c.relowner))) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','private','storage')),
 'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p),
 'club_permissions',(select jsonb_agg(to_jsonb(p) order by permission_code) from public.club_permission_definitions p),
 'club_mappings',(select jsonb_agg(to_jsonb(p) order by role_code,permission_code) from public.club_role_permissions p));`));
before(async()=>{
 env=await startMarketTestEnvironment({port:55571});
 for(const f of ['20261004000100_pul_sec01_public_create_limits.sql','20261005000100_pul_sec02_content_moderation.sql','20261006000100_pul_common_messaging_foundation.sql','20261007000100_pul_messaging_block_list_read.sql','20261008000100_pul_market_messaging_context.sql','20261009000100_pul_platform_broadcast_messaging.sql'])ok(sql(`begin;${migration(f)}commit;`));
 const baseline=catalog();ok(sql(`begin;${candidate}rollback;`));assert.deepEqual(catalog(),baseline);
 ok(sql(`begin;${candidate}commit;`));const next=catalog();
 const changed=new Set(['private.messaging_check_broadcast_batch()','private.messaging_check_delivery()','private.messaging_list(text,integer,timestamp with time zone,uuid)','get_messaging_message(uuid,boolean)','submit_messaging_report(uuid,text,text)']);
 for(const [k,v]of Object.entries(baseline.functions)){if(changed.has(k)){assert.equal(next.functions[k].acl,v.acl);assert.equal(next.functions[k].owner,v.owner);}else assert.deepEqual(next.functions[k],v,k);}
 for(const [k,v]of Object.entries(baseline.relations))assert.deepEqual(next.relations[k],v,k);
 assert.deepEqual(next.policies,baseline.policies);console.log('1F-A rollback and all unrelated definitions/ACL/owners/RLS/policies preserved PASS');
});
after(async()=>{if(env)await env.stop();});
beforeEach(()=>{ok(sql(`delete from public.messaging_reports; delete from public.messaging_messages; update public.user_accounts set account_status='suspended';
 update public.club_role_definitions set is_active=true;
 update public.club_permission_definitions set is_active=true where permission_code='club.messages.broadcast';
 insert into public.club_role_permissions(role_code,permission_code) select r,'club.messages.broadcast' from unnest(array['club_admin','club_vice_admin','club_manager']) r on conflict do nothing;
 delete from public.audit_logs where action='messaging.club_broadcast.send';`));});

test('current club operators only; no platform administrator bypass; all RPCs recheck',()=>{
 for(const role of ['club_admin','club_vice_admin','club_manager']){const {a,b,c,membership}=fixture(role);send(a,c);
  const outsider=members(1,'platform_admin')[0];
  for(const u of [b,outsider])for(const q of [`select public.preview_club_broadcast('${c}');`,sendSql(c),`select public.list_club_broadcasts('${c}');`,`select public.get_club_broadcast('${c}',gen_random_uuid());`])deny(actor(u,q));
  if(role==='club_admin')ok(sql(`update public.user_accounts set account_status='suspended' where id='${a}';`));
  else ok(sql(`update public.club_role_assignments set revoked_at=clock_timestamp() where membership_id='${membership}';`));deny(actor(a,sendSql(c)));
 }
 const {a,c}=fixture();deny(actor(a,`select public.send_club_broadcast('${c}','spoof',gen_random_uuid(),array['${a}'::uuid]);`),/does not exist/);
});
test('exact active eligible audience, preview revalidation, no later-member backfill',()=>{
 const {a,b,c}=fixture(),ids=members(7);for(const id of ids.slice(0,6))join(c,id);
 ok(sql(`update public.clubs set membership_recruitment_status='recruiting',directory_is_public=true where id='${c}';`));
 ok(actor(ids[6],`select * from public.submit_club_membership_application('${c}','beginner','flexible',array['regularRound'],'LOCAL pending applicant',null,true,true,true,gen_random_uuid());`));
 assert.equal(ok(sql(`select count(*) from public.club_memberships where club_id='${c}' and user_id='${ids[6]}';`)),'0');
 ok(sql(`update public.club_memberships set membership_status='suspended',suspended_at=now() where club_id='${c}' and user_id='${ids[0]}';
 update public.club_memberships set membership_status='left',left_at=now() where club_id='${c}' and user_id='${ids[1]}';
 update public.user_accounts set account_status='suspended' where id='${ids[2]}';
 update public.user_accounts set account_status='withdrawn' where id='${ids[3]}';
 delete from public.consent_records where user_id='${ids[4]}';`));
 assert.equal(json(actor(a,`select public.preview_club_broadcast('${c}');`)).recipient_count,2);
 ok(sql(`delete from public.user_profiles where user_id='${ids[5]}';`));
 const req=randomUUID(),m=send(a,c,' snapshot ',req);assert.equal(m.recipient_count,1);
 assert.deepEqual(json(sql(`select jsonb_agg(recipient_user_id) from public.messaging_recipients where message_id='${m.id}';`)),[b]);
 join(c,members()[0]);assert.deepEqual(send(a,c,'snapshot',req),m);assert.equal(count(),1);
});
test('recipient lifecycle, safe fallback, own read/hide, report yes, reply no, block exemption only broadcasts',()=>{
 const {a,b,c,membership}=fixture(),other=members()[0];join(c,other);ok(actor(b,`select public.set_messaging_block('${a}',true);`));
 const m=send(a,c);assert.equal(detail(b,m.id).counterpart_display,'동호회 공지');assert.equal(detail(b,m.id).counterpart_user_id,null);
 assert.deepEqual(json(actor(b,`select public.get_message_club_context('${m.id}');`)),{available:false});
 ok(sql(`update public.clubs set directory_is_public=true where id='${c}';`));
 assert.equal(json(actor(b,`select public.get_message_club_context('${m.id}');`)).available,true);
 deny(actor(a,`select public.send_messaging_message('${b}','direct',gen_random_uuid());`));
 deny(actor(b,`select public.reply_messaging_message('${m.id}','reply',gen_random_uuid());`));
 deny(actor(a,`select public.get_messaging_message('${m.id}',false);`));
 const outsider=members()[0];deny(actor(outsider,`select public.submit_messaging_report('${m.id}','spam','');`));
 ok(actor(b,`select public.mark_messaging_message_read('${m.id}');`));assert.equal(detail(other,m.id).read_at,null);
 ok(sql(`update public.club_memberships set membership_status='left',left_at=now() where club_id='${c}' and user_id='${b}';`));
 assert.equal(detail(b,m.id).id,m.id);assert.deepEqual(json(actor(b,`select public.get_message_club_context('${m.id}');`)),{available:false});
 ok(actor(b,`select public.submit_messaging_report('${m.id}','spam','');`));ok(actor(b,`select public.hide_messaging_message('${m.id}');`));
 deny(actor(b,`select public.get_messaging_message('${m.id}',false);`));assert.equal(detail(other,m.id).id,m.id);
 assert.equal(json(actor(a,'select public.list_messaging_sent();')).items.length,0);
 ok(sql(`update public.club_role_assignments set revoked_at=clock_timestamp() where membership_id='${membership}';`));deny(actor(a,sendSql(c)));
 assert.equal(count(),1);
});
test('shared operator history, cross-club IDOR, revoked operator denied, deletion preserves recipient original',()=>{
 const {a,b,c}=fixture(),manager=members()[0];const mm=join(c,manager,'club_manager');const m=send(a,c),d=club();join(d,a,'club_manager');
 const list=json(actor(manager,`select public.list_club_broadcasts('${c}');`));assert.equal(list.items[0].id,m.id);
 const record=json(actor(manager,`select public.get_club_broadcast('${c}','${m.id}');`));assert.equal(record.body,'notice');assert.deepEqual(Object.keys(record).sort(),['body','created_at','id','recipient_count','sender_display']);
 deny(actor(a,`select public.get_club_broadcast('${d}','${m.id}');`));
 ok(sql(`update public.club_role_assignments set revoked_at=clock_timestamp() where membership_id='${mm}';`));deny(actor(manager,`select public.list_club_broadcasts('${c}');`));
 for(const status of ['suspended','archived']){ok(sql(`update public.clubs set club_status='${status}' where id='${c}';`));deny(actor(a,sendSql(c)));assert.equal(detail(b,m.id).id,m.id);}
 ok(sql(`delete from public.club_memberships where club_id='${c}';delete from public.clubs where id='${c}';`));
 assert.equal(detail(b,m.id).id,m.id);assert.deepEqual(json(actor(b,`select public.get_message_club_context('${m.id}');`)),{available:false});
});
test('same request and cross-club/kind fingerprint collisions in both directions',()=>{
 const {a,b,c}=fixture(),d=club();join(d,a,'club_manager');join(d,b);const req=randomUUID(),m=send(a,c,'same',req);
 assert.deepEqual(send(a,c,' same ',req),m);deny(actor(a,sendSql(c,'changed',req)),/replay_conflict/);deny(actor(a,sendSql(d,'same',req)),/replay_conflict/);
 deny(actor(a,`select public.send_messaging_message('${b}','same','${req}');`),/replay_conflict/);
 const listing=ok(sql(`insert into public.market_listings(seller_user_id,title,category_code,price_amount,region_code,condition_code,trade_type_code,description) values('${b}','LOCAL listing','club',1,'서울','normal','direct','LOCAL description') returning id;`));
 deny(actor(a,`select public.send_market_listing_message('${listing}','same','${req}');`),/replay_conflict/);
 ok(sql(`update public.user_accounts set platform_role='platform_admin' where id='${a}';select private.set_messaging_broadcast_grant('${a}','${a}',true);`));
 deny(actor(a,`select public.send_platform_broadcast('same','${req}');`),/replay_conflict/);
 for(const q of [`select public.send_messaging_message('${b}','direct',`, `select public.send_market_listing_message('${listing}','market',`, `select public.send_platform_broadcast('platform',`]){
  const request=randomUUID();ok(actor(a,q+`'${request}');`));deny(actor(a,sendSql(c,'other',request)),/replay_conflict/);
  ok(sql("update public.messaging_messages set created_at=clock_timestamp()-interval '4 seconds' where kind='direct';"));
 }
 assert.equal(count(),1);
});
test('context, recipient and audit injected failures roll back all rows and request/quota reservations',()=>{
 const {a,c}=fixture();join(c,members()[0]);const req=randomUUID();
 for(const [table,condition] of [['messaging_club_broadcast_contexts','true'],['messaging_recipients','(select count(*) from public.messaging_recipients where message_id=new.message_id)>0'],['audit_logs',"new.action='messaging.club_broadcast.send'"]]){
  ok(sql(`create function private.local_club_failure() returns trigger language plpgsql as $$begin if ${condition} then raise exception 'injected failure';end if;return new;end;$$;create trigger local_fail before insert on public.${table} for each row execute function private.local_club_failure();`));
  deny(actor(a,sendSql(c,'atomic',req)),/injected failure/);
  for(const relation of ['messaging_messages','messaging_recipients','messaging_club_broadcast_contexts'])assert.equal(ok(sql(`select count(*) from public.${relation};`)),'0');
  assert.equal(ok(sql("select count(*) from public.audit_logs where action='messaging.club_broadcast.send';")),'0');
  ok(sql(`drop trigger local_fail on public.${table};drop function private.local_club_failure();`));
 }
 assert.equal(send(a,c,'atomic',req).recipient_count,2);
});
test('same request concurrency makes one original and one audit',async()=>{
 const {a,c}=fixture(),req=randomUUID();const results=await Promise.all([asyncSql(identity(a,sendSql(c,'race',req))),asyncSql(identity(a,sendSql(c,'race',req)))]);
 assert.deepEqual(json(results[0]),json(results[1]));assert.equal(count(),1);assert.equal(ok(sql("select count(*) from public.audit_logs where action='messaging.club_broadcast.send';")),'1');
 assert.equal(ok(sql('select count(*) from public.messaging_club_broadcast_contexts;')),'1');
 assert.equal(ok(sql('select count(*) from public.messaging_recipients;')),'1');
 const audit=json(sql("select jsonb_build_object('actor',actor_id,'target',target_id,'summary',after_summary) from public.audit_logs where action='messaging.club_broadcast.send';"));
 assert.equal(audit.actor,a);assert.equal(audit.target,json(results[0]).id);assert.equal(audit.summary.audience,'club');assert.equal(audit.summary.club_id,c);
 assert.deepEqual(Object.keys(audit.summary).sort(),['audience','club_id','created_at','recipient_count','result']);
});
test('club-wide cooldown, 24h duplicate, 20-per-day quota; different clubs and platform independent',async()=>{
 const {a,b,c}=fixture();ok(sql(`insert into public.club_role_assignments(membership_id,role_code) select id,'club_manager' from public.club_memberships where club_id='${c}' and user_id='${b}';`));
 const results=await Promise.all([asyncSql(identity(a,sendSql(c,'A'))),asyncSql(identity(b,sendSql(c,'B')))]);assert.equal(results.filter(r=>r.status===0).length,1);deny(results.find(r=>r.status!==0),/cooldown/);
 const body=ok(sql("select body from public.messaging_messages where kind='club_broadcast';"));age(c);deny(actor(a,sendSql(c,' '+body+' ')),/duplicate/);
 const d=club();join(d,a,'club_manager');join(d,b);send(a,d,body);
 ok(sql(`update public.user_accounts set platform_role='platform_admin' where id='${a}';select private.set_messaging_broadcast_grant('${a}','${a}',true);`));ok(actor(a,"select public.send_platform_broadcast('independent',gen_random_uuid());"));
 for(let i=1;i<20;i++){send(a,c,'distinct '+i);age(c);}deny(actor(b,sendSql(c,'21st')),/quota/);age(c,'24 hours');send(b,c,'21st');
});
test('two connections: revocation winning actor authorization lock denies queued send',async()=>{
 for(const kind of ['assignment','membership','account','club','permission','role','mapping']){
  const {a,c,membership}=fixture(),label='club_'+randomUUID().replaceAll('-','');
  const change={assignment:`update public.club_role_assignments set revoked_at=clock_timestamp() where membership_id='${membership}';`,membership:`update public.club_memberships set membership_status='left',left_at=now() where id='${membership}';`,account:`update public.user_accounts set account_status='suspended' where id='${a}';`,club:`update public.clubs set club_status='suspended' where id='${c}';`,permission:"update public.club_permission_definitions set is_active=false where permission_code='club.messages.broadcast';",role:"update public.club_role_definitions set is_active=false where role_code='club_manager';",mapping:"delete from public.club_role_permissions where role_code='club_manager' and permission_code='club.messages.broadcast';"}[kind];
  const holder=asyncSql(`set application_name='${label}';begin;${change}select pg_sleep(2);commit;`);await barrier(label);
  const queued=asyncSql(identity(a,sendSql(c)));ok(await holder);deny(await queued,/permission|account_unavailable/);assert.equal(count(),0);
  ok(sql("update public.club_permission_definitions set is_active=true where permission_code='club.messages.broadcast';update public.club_role_definitions set is_active=true;insert into public.club_role_permissions(role_code,permission_code) values('club_manager','club.messages.broadcast') on conflict do nothing;"));
 }
});
test('two connections: send winning precedes raw assignment revoke; later send and replay deny',async()=>{
 const {a,c,membership}=fixture(),req=randomUUID(),label='club_'+randomUUID().replaceAll('-','');
 const holder=asyncSql(`set application_name='${label}';begin;${identity(a,sendSql(c,'winner',req))}select pg_sleep(2);commit;`);await barrier(label);
 const revoke=asyncSql(`update public.club_role_assignments set revoked_at=clock_timestamp() where membership_id='${membership}';`);ok(await holder);ok(await revoke);
 assert.equal(count(),1);deny(actor(a,sendSql(c,'winner',req)),/permission/);deny(actor(a,sendSql(c)),/permission/);
});
test('audience updates are not locked and snapshot is immutable after send',async()=>{
 const {a,b,c}=fixture(),label='club_'+randomUUID().replaceAll('-','');
 const holder=asyncSql(`set application_name='${label}';begin;${identity(a,sendSql(c))}select pg_sleep(2);commit;`);await barrier(label);
 ok(sql(`set lock_timeout='400ms';update public.club_memberships set membership_status='left',left_at=now() where club_id='${c}' and user_id='${b}';update public.user_accounts set account_status='suspended' where id='${b}';`));
 ok(await holder);assert.equal(ok(sql('select count(*) from public.messaging_recipients;')),'1');
});
test('RLS FORCE, ACL, postgres owner, empty search_path and authenticated-only RPCs',()=>{
 const names=['preview_club_broadcast','send_club_broadcast','list_club_broadcasts','get_club_broadcast','get_message_club_context'];
 const rows=json(sql(`select jsonb_agg(jsonb_build_object('name',p.proname,'owner',pg_get_userbyid(p.proowner),'config',p.proconfig,'definer',p.prosecdef,'anon',has_function_privilege('anon',p.oid,'execute'),'service',has_function_privilege('service_role',p.oid,'execute'),'auth',has_function_privilege('authenticated',p.oid,'execute'))) from pg_proc p where p.proname in (${names.map(lit)});`));
 assert.equal(rows.length,5);for(const r of rows){assert.equal(r.owner,'postgres');assert.deepEqual(r.config,['search_path=""']);assert.equal(r.definer,true);assert.equal(r.anon,false);assert.equal(r.service,false);assert.equal(r.auth,true);}
 assert.equal(ok(sql("select relrowsecurity and relforcerowsecurity from pg_class where oid='public.messaging_club_broadcast_contexts'::regclass;")),'t');
 const {a,c}=fixture();for(const role of ['anon','authenticated','service_role'])deny(sql(`set role ${role};select * from public.messaging_club_broadcast_contexts;`),/permission denied/);
 deny(actor(a,"select private.messaging_assert_club_broadcaster(gen_random_uuid());"),/permission denied/);deny(sql(`set role anon;select public.preview_club_broadcast('${c}');`),/permission denied/);
});
test('operator account completeness and stale membership are denied on every new send',()=>{
 const {a,c,membership}=fixture();
 for(const state of ['suspended','withdrawn']){ok(sql(`update public.user_accounts set account_status='${state}' where id='${a}';`));deny(actor(a,sendSql(c)),/account_unavailable/);}
 ok(sql(`update public.user_accounts set account_status='active' where id='${a}';`));
 deny(sql(`begin;delete from public.consent_records where user_id='${a}';${identity(a,sendSql(c))}commit;`),/account_unavailable/);
 deny(sql(`begin;delete from public.user_profiles where user_id='${a}';${identity(a,sendSql(c))}commit;`),/account_unavailable/);
 for(const state of ['suspended','left']){
  deny(sql(`begin;update public.club_memberships set membership_status='${state}',${state==='left'?'left_at':'suspended_at'}=now() where id='${membership}';${identity(a,sendSql(c))}commit;`),/permission/);
 }
 send(a,c);
});
test('bounded shared history pagination and report moderator has no club-history privilege',()=>{
 const {a,b,c}=fixture(),m=send(a,c,'reported'),moderator=members(1,'platform_admin')[0];
 const report=json(actor(b,`select public.submit_messaging_report('${m.id}','spam','evidence');`));
 const evidence=json(actor(moderator,`select public.get_messaging_report('${report.id}');`));assert.equal(evidence.message_id,m.id);assert.equal(evidence.body,'reported');
 assert.equal(Object.hasOwn(evidence,'recipients'),false);deny(actor(moderator,`select public.list_club_broadcasts('${c}');`));deny(actor(moderator,`select public.get_club_broadcast('${c}','${m.id}');`));
 age(c);const second=send(a,c,'unreported');deny(actor(moderator,`select public.get_messaging_message('${second.id}',false);`));
 const firstPage=json(actor(a,`select public.list_club_broadcasts('${c}',1);`));assert.equal(firstPage.items[0].id,second.id);assert.equal(firstPage.has_more,true);
 const next=firstPage.next_cursor,nextPage=json(actor(a,`select public.list_club_broadcasts('${c}',1,'${next.at}','${next.id}');`));assert.equal(nextPage.items[0].id,m.id);assert.equal(nextPage.has_more,false);
 for(const q of [`select public.list_club_broadcasts('${c}',0);`,`select public.list_club_broadcasts('${c}',51);`,`select public.list_club_broadcasts('${c}',20,now(),null);`])deny(actor(a,q),/invalid/);
 // Leaving after the first snapshot excludes this recipient from the next send.
 ok(sql(`update public.club_memberships set membership_status='left',left_at=now() where club_id='${c}' and user_id='${b}';`));
 join(c,members()[0]);age(c);const third=send(a,c,'after departure');assert.equal(third.recipient_count,1);
 assert.equal(ok(sql(`select count(*) from public.messaging_recipients where message_id='${third.id}' and recipient_user_id='${b}';`)),'0');
 assert.equal(detail(b,m.id).id,m.id);
});
test('different clubs can send while another club quota lock is held',async()=>{
 const {a,c}=fixture(),other=fixture(),label='club_'+randomUUID().replaceAll('-','');
 const holder=asyncSql(`set application_name='${label}';begin;select pg_advisory_xact_lock(1297303349,hashtext('${c}'));select pg_sleep(2);commit;`);await barrier(label);
 ok(actor(other.a,`set lock_timeout='400ms';${sendSql(other.c)}`));ok(await holder);send(a,c);assert.equal(count(),2);
});
test('context type/count invariants and plain-text Unicode boundaries',()=>{
 const {a,c}=fixture();const m=send(a,c,'🙂'.repeat(2000));assert.equal([...detail(ok(sql(`select recipient_user_id from public.messaging_recipients where message_id='${m.id}';`)),m.id).body].length,2000);
 deny(actor(a,sendSql(c,'🙂'.repeat(2001))),/invalid/);deny(actor(a,sendSql(c,'  ')),/invalid/);
 deny(sql(`delete from public.messaging_club_broadcast_contexts where message_id='${m.id}';`),/context_invariant/);
 deny(sql(`insert into public.messaging_market_contexts(message_id) values('${m.id}');`),/context_invariant/);
 deny(sql(`begin;update public.messaging_messages set kind='platform_broadcast' where id='${m.id}';commit;`),/context_invariant/);
});
test('10000 audience commits within measured time; 10001 fails atomically',()=>{
 const {a,c}=fixture();ok(sql(`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
 select gen_random_uuid(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated','bulk-'||gen_random_uuid()||'@example.invalid','',now(),now(),now() from generate_series(1,9999);
 insert into public.consent_records(user_id,consent_type,consent_version,decision)
 select a.id,t,v,'granted' from public.user_accounts a cross join(values('terms_required','terms-dev-v1'),('privacy_required','privacy-dev-v1')) c(t,v)
 where a.account_status='active' and not exists(select 1 from public.consent_records r where r.user_id=a.id and r.consent_type=t);
 insert into public.club_memberships(club_id,user_id) select '${c}',a.id from public.user_accounts a where a.account_status='active' and not exists(select 1 from public.club_memberships m where m.club_id='${c}' and m.user_id=a.id);`));
 const started=performance.now(),m=send(a,c,'bulk');console.log(`1F-A 10000 recipients including deferred commit: ${Math.round(performance.now()-started)} ms`);
 assert.equal(m.recipient_count,10000);assert.equal(ok(sql(`select count(*) from public.messaging_recipients where message_id='${m.id}';`)),'10000');
 join(c,members()[0]);age(c);deny(actor(a,sendSql(c,'overflow')),/broadcast_audience/);assert.equal(count(),1);
});
