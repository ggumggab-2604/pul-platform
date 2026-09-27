import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {before,after,beforeEach,test} from 'node:test';
import {startMarketTestEnvironment,redact} from '../market/marketTestEnvironment.mjs';
let env;
const migration=n=>readFileSync(new URL('../../../supabase/migrations/'+n,import.meta.url),'utf8');
const candidate=migration('20261011000100_pul_club_event_broadcast_messaging.sql');
const lit=x=>"'"+String(x).replaceAll("'","''")+"'";
const sql=q=>env.sql(q);
const ok=r=>{assert.equal(r.status,0,redact(r.stderr+r.stdout));return r.stdout.trim();};
const json=r=>JSON.parse(ok(r)||'null');
const deny=(r,re=/messaging_|permission denied/)=>{assert.notEqual(r.status,0);assert.match(r.stderr,re);};
const identity=(a,q)=>`set request.jwt.claim.sub='${a}';set role authenticated;${q}`;
const actor=(a,q)=>sql(identity(a,q));
const sendSql=(c,body='notice',request=randomUUID())=>`select public.send_club_event_broadcast('${c}',${lit(body)},'${request}');`;
const send=(a,c,body,request)=>json(actor(a,sendSql(c,body,request)));
const detail=(a,m)=>json(actor(a,`select public.get_messaging_message('${m}',false);`));
const count=()=>Number(ok(sql("select count(*) from public.messaging_messages where kind='club_event_broadcast';")));
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
function event(c,a,status='registration_open') { return ok(sql(`insert into public.club_official_events(club_id,creator_user_id,creator_role_code,event_type,event_status,title,starts_at,location,participant_target) values('${c}','${a}','club_manager','monthly_meeting','${status}','LOCAL event',now()+interval '1 day','LOCAL location','members') returning id;`)); }
function participate(e,c,u) {const m=ok(sql(`select id from public.club_memberships where club_id='${c}' and user_id='${u}';`));ok(sql(`insert into public.club_official_event_participations(event_id,membership_id) values('${e}','${m}') on conflict do nothing;`));}
function fixture(role='club_manager') {const c=club(),[a,b]=members(2);const membership=join(c,a,role);join(c,b);const e=event(c,a);participate(e,c,b);return {a,b,c,e,membership};}
const age=(c,interval='4 minutes')=>ok(sql(`update public.messaging_messages set created_at=clock_timestamp()-interval '${interval}' where id in(select message_id from public.messaging_club_broadcast_contexts where club_id='${c}' union all select message_id from public.messaging_club_event_broadcast_contexts where club_id='${c}');`));
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
 env=await startMarketTestEnvironment({port:55581});
 for(const f of ['20261004000100_pul_sec01_public_create_limits.sql','20261005000100_pul_sec02_content_moderation.sql','20261006000100_pul_common_messaging_foundation.sql','20261007000100_pul_messaging_block_list_read.sql','20261008000100_pul_market_messaging_context.sql','20261009000100_pul_platform_broadcast_messaging.sql','20261010000100_pul_club_broadcast_messaging.sql'])ok(sql(`begin;${migration(f)}commit;`));
 const baseline=catalog();ok(sql(`begin;${candidate}rollback;`));assert.deepEqual(catalog(),baseline);
 ok(sql(`begin;${candidate}commit;`));const next=catalog();
 const changed=new Set(['private.messaging_check_broadcast_batch()','private.messaging_check_delivery()','private.messaging_list(text,integer,timestamp with time zone,uuid)','get_messaging_message(uuid,boolean)','submit_messaging_report(uuid,text,text)','send_club_broadcast(uuid,text,uuid)']);
 for(const [k,v]of Object.entries(baseline.functions)){if(changed.has(k)){assert.equal(next.functions[k].acl,v.acl);assert.equal(next.functions[k].owner,v.owner);}else assert.deepEqual(next.functions[k],v,k);}
 for(const [k,v]of Object.entries(baseline.relations))assert.deepEqual(next.relations[k],v,k);
 for(const k of ['policies','club_permissions','club_mappings'])assert.deepEqual(next[k],baseline[k]);
 console.log('1F-B1 rollback / unrelated definitions, ACL, RLS, permission mappings preserved PASS');
});
after(async()=>{if(env)await env.stop();});
beforeEach(()=>{ok(sql(`delete from public.messaging_reports;delete from public.messaging_messages;update public.user_accounts set account_status='suspended';
 update public.club_role_definitions set is_active=true;
 update public.club_permission_definitions set is_active=true where permission_code in ('club.messages.broadcast','club.events.manage');
 insert into public.club_role_permissions(role_code,permission_code) select r,p from unnest(array['club_admin','club_vice_admin','club_manager']) r cross join unnest(array['club.messages.broadcast','club.events.manage']) p on conflict do nothing;
 delete from public.audit_logs where action='messaging.club_event_broadcast.send';`));});

test('both current permissions, all operator roles, no platform bypass, narrow event-only API',()=>{
 for(const role of ['club_admin','club_vice_admin','club_manager']) {
  const {a,b,e}=fixture(role), outsider=members(1,'platform_admin')[0],other=fixture();
  for(const u of [b,outsider,other.a]) for(const q of [`select public.preview_club_event_broadcast('${e}');`,sendSql(e),`select public.list_club_event_broadcasts('${e}');`,`select public.get_club_event_broadcast('${e}',gen_random_uuid());`,`select public.get_club_event_broadcast_source('${e}');`])deny(actor(u,q));
  for(const permission of ['club.events.manage','club.messages.broadcast']) {
   ok(sql(`delete from public.club_role_permissions where role_code='${role}' and permission_code='${permission}';`));deny(actor(a,sendSql(e)),/permission/);
   ok(sql(`insert into public.club_role_permissions(role_code,permission_code) values('${role}','${permission}');`));
  }
  assert.equal(send(a,e).recipient_count,1);
  deny(actor(a,`select public.send_club_event_broadcast('${e}','spoof',gen_random_uuid(),array['${b}'::uuid]);`),/does not exist/);
 }
});

test('exact participant eligibility; sender, nonparticipants, cancelled, inactive, incomplete excluded',()=>{
 const {a,b,c,e}=fixture(),ids=members(9);participate(e,c,a);
 for(const u of ids){join(c,u);participate(e,c,u);}
 ok(actor(ids[0],`select public.leave_club_event('${e}');`));
 ok(sql(`update public.club_memberships set membership_status='left',left_at=now() where club_id='${c}' and user_id='${ids[1]}';
 update public.club_memberships set membership_status='suspended',suspended_at=now() where club_id='${c}' and user_id='${ids[2]}';
 update public.user_accounts set account_status='suspended' where id='${ids[3]}';
 update public.user_accounts set account_status='withdrawn' where id='${ids[4]}';
 delete from public.consent_records where user_id='${ids[5]}';delete from public.user_profiles where user_id='${ids[6]}';`));
 join(c,members()[0]);assert.equal(json(actor(a,`select public.preview_club_event_broadcast('${e}');`)).recipient_count,3);
 // Malformed cross-club fixture must not become an audience via membership ID.
 const other=fixture();ok(sql(`insert into public.club_official_event_participations(event_id,membership_id) values('${e}','${other.membership}');`));
 const req=randomUUID(),m=send(a,e,'snapshot',req);
 assert.deepEqual(json(sql(`select jsonb_agg(recipient_user_id order by recipient_user_id) from public.messaging_recipients where message_id='${m.id}';`)),[b,ids[7],ids[8]].sort());
 ok(actor(ids[0],`select public.join_club_event('${e}');`));assert.deepEqual(send(a,e,' snapshot ',req),m);
 assert.equal(m.recipient_count,3);assert.equal(count(),1);
});

test('all event states explicit; cancelled notice allowed; completed replay retrieves only existing result',()=>{
 for(const state of ['draft','scheduled','registration_open','registration_closed','completed','cancelled']) {
  const {a,e}=fixture();ok(sql(`update public.club_official_events set event_status='${state}' where id='${e}';`));
  if(['draft','completed'].includes(state)){deny(actor(a,sendSql(e)),/event_state/);deny(actor(a,`select public.preview_club_event_broadcast('${e}');`),/event_state/);}
  else assert.equal(send(a,e,state).recipient_count,1);
 }
 const {a,e}=fixture(),req=randomUUID(),m=send(a,e,'before completion',req);
 ok(sql(`update public.club_official_events set event_status='completed' where id='${e}';`));assert.deepEqual(send(a,e,'before completion',req),m);deny(actor(a,sendSql(e)),/event_state/);
 const hidden=fixture();ok(sql(`update public.club_official_events set moderation_status='hidden' where id='${hidden.e}';`));deny(actor(hidden.a,sendSql(hidden.e)),/event_state/);
});

test('private context, former participant/member fallback, immutable past receipt, IDOR, read/hide/report/reply/block',()=>{
 const {a,b,c,e}=fixture(), outsider=members()[0];join(c,outsider);ok(sql(`update public.clubs set directory_is_public=true where id='${c}';`));
 ok(actor(b,`select public.set_messaging_block('${a}',true);`));const m=send(a,e);
 const ctx=()=>json(actor(b,`select public.get_message_club_event_context('${m.id}');`));assert.equal(ctx().available,true);assert.equal(ctx().event_id,e);
 assert.equal(detail(b,m.id).counterpart_display,'행사 안내');assert.equal(detail(b,m.id).counterpart_user_id,null);
 for(const q of [`select public.get_messaging_message('${m.id}',false);`,`select public.get_message_club_event_context('${m.id}');`,`select public.submit_messaging_report('${m.id}','spam','');`])deny(actor(outsider,q));
 deny(actor(a,`select public.get_messaging_message('${m.id}',false);`));
 deny(actor(b,`select public.reply_messaging_message('${m.id}','reply',gen_random_uuid());`));deny(actor(a,`select public.send_messaging_message('${b}','blocked direct',gen_random_uuid());`));
 assert.equal(json(actor(b,'select public.list_messaging_inbox();')).items[0].kind,'club_event_broadcast');assert.equal(json(actor(a,'select public.list_messaging_sent();')).items.length,0);
 ok(actor(b,`select public.mark_messaging_message_read('${m.id}');`));assert.ok(detail(b,m.id).read_at);
 ok(actor(b,`select public.leave_club_event('${e}');`));assert.deepEqual(ctx(),{available:false});assert.equal(detail(b,m.id).id,m.id);
 ok(actor(b,`select public.join_club_event('${e}');`));assert.equal(ctx().available,true);
 ok(sql(`update public.club_memberships set membership_status='left',left_at=now() where club_id='${c}' and user_id='${b}';`));assert.deepEqual(ctx(),{available:false});assert.equal(detail(b,m.id).id,m.id);
 ok(actor(b,`select public.hide_messaging_message('${m.id}');`));ok(actor(b,`select public.submit_messaging_report('${m.id}','spam','evidence');`));deny(actor(b,`select public.get_message_club_event_context('${m.id}');`));
});

test('history scoped by event, current operator, safe projection and precise cursor',()=>{
 const {a,b,c,e,membership}=fixture(),e2=event(c,a),other=fixture();const m=send(a,e);age(c);const n=send(a,e,'second');
 const list=json(actor(a,`select public.list_club_event_broadcasts('${e}',1);`));assert.equal(list.items[0].id,n.id);assert.equal(list.has_more,true);
 const cursor=list.next_cursor,next=json(actor(a,`select public.list_club_event_broadcasts('${e}',1,'${cursor.at}','${cursor.id}');`));assert.equal(next.items[0].id,m.id);
 const record=json(actor(a,`select public.get_club_event_broadcast('${e}','${m.id}');`));assert.deepEqual(Object.keys(record).sort(),['body','created_at','id','recipient_count','sender_display']);
 assert.equal(json(actor(a,`select public.list_club_event_broadcasts('${e2}');`)).items.length,0);
 for(const [u,id]of[[a,e2],[other.a,e],[b,e]])deny(actor(u,`select public.get_club_event_broadcast('${id}','${m.id}');`));
 ok(sql(`update public.club_role_assignments set revoked_at=now() where membership_id='${membership}';`));deny(actor(a,`select public.list_club_event_broadcasts('${e}');`));
});

test('same event replay, different event and cross-kind collisions in both directions',()=>{
 const {a,b,c,e}=fixture(),e2=event(c,a);participate(e2,c,b);const req=randomUUID(),m=send(a,e,'same',req);
 assert.deepEqual(send(a,e,' same ',req),m);deny(actor(a,sendSql(e,'changed',req)),/replay_conflict/);deny(actor(a,sendSql(e2,'same',req)),/replay_conflict/);
 const listing=ok(sql(`insert into public.market_listings(seller_user_id,title,category_code,price_amount,region_code,condition_code,trade_type_code,description) values('${b}','LOCAL listing','club',1,'서울','normal','direct','LOCAL description') returning id;`));
 ok(sql(`update public.user_accounts set platform_role='platform_admin' where id='${a}';select private.set_messaging_broadcast_grant('${a}','${a}',true);`));
 const calls=[r=>`select public.send_messaging_message('${b}','direct','${r}');`,r=>`select public.send_market_listing_message('${listing}','market','${r}');`,r=>`select public.send_platform_broadcast('platform','${r}');`,r=>`select public.send_club_broadcast('${c}','club','${r}');`];
 for(const call of calls){deny(actor(a,call(req)),/replay_conflict/);age(c);ok(sql("update public.messaging_messages set created_at=clock_timestamp()-interval '4 seconds' where kind='direct';"));const r=randomUUID();ok(actor(a,call(r)));deny(actor(a,sendSql(e,'other',r)),/replay_conflict/);}
 assert.equal(count(),1);
});

test('context, recipient and audit injected failures leave zero rows and reusable request',()=>{
 const {a,c,e}=fixture(),x=members()[0];join(c,x);participate(e,c,x);const req=randomUUID();
 for(const [table,condition]of[['messaging_club_event_broadcast_contexts','true'],['messaging_recipients','(select count(*) from public.messaging_recipients where message_id=new.message_id)>0'],['audit_logs',"new.action='messaging.club_event_broadcast.send'"]]){
  ok(sql(`create function private.local_event_failure() returns trigger language plpgsql as $$begin if ${condition} then raise exception 'injected failure';end if;return new;end;$$;create trigger local_fail before insert on public.${table} for each row execute function private.local_event_failure();`));
  deny(actor(a,sendSql(e,'atomic',req)),/injected failure/);
  for(const t of ['messaging_messages','messaging_club_event_broadcast_contexts','messaging_recipients'])assert.equal(ok(sql(`select count(*) from public.${t};`)),'0');
  assert.equal(ok(sql("select count(*) from public.audit_logs where action='messaging.club_event_broadcast.send';")),'0');
  ok(sql(`drop trigger local_fail on public.${table};drop function private.local_event_failure();`));
 }
 assert.equal(send(a,e,'atomic',req).recipient_count,2);
});

test('two connections: same request produces one original/context/audit and one snapshot',async()=>{
 const {a,c,e}=fixture(),req=randomUUID();const results=await Promise.all([asyncSql(identity(a,sendSql(e,'race',req))),asyncSql(identity(a,sendSql(e,'race',req)))]);assert.deepEqual(json(results[0]),json(results[1]));assert.equal(count(),1);
 const audit=json(sql("select jsonb_build_object('actor',actor_id,'target',target_id,'summary',after_summary) from public.audit_logs where action='messaging.club_event_broadcast.send';"));assert.equal(audit.actor,a);assert.equal(audit.target,json(results[0]).id);assert.equal(audit.summary.club_id,c);assert.equal(audit.summary.event_id,e);
 assert.deepEqual(Object.keys(audit.summary).sort(),['audience','club_id','created_at','event_id','recipient_count','result']);
 for(const t of ['messaging_club_event_broadcast_contexts','messaging_recipients'])assert.equal(ok(sql(`select count(*) from public.${t};`)),'1');
});

test('parent club cooldown and daily budget shared in both directions; event duplicate remains scoped',async()=>{
 const {a,b,c,e}=fixture(),e2=event(c,a);participate(e2,c,b);
 const outcomes=await Promise.all([asyncSql(identity(a,sendSql(e,'event'))),asyncSql(identity(a,`select public.send_club_broadcast('${c}','club',gen_random_uuid());`))]);assert.equal(outcomes.filter(r=>r.status===0).length,1);deny(outcomes.find(r=>r.status!==0),/cooldown/);
 age(c);send(a,e,'duplicate');age(c);deny(actor(a,sendSql(e,' duplicate ')),/duplicate/);send(a,e2,'duplicate');
 for(let i=0;i<17;i++){age(c);ok(actor(a,i%2?sendSql(e,'budget'+i):`select public.send_club_broadcast('${c}','budget${i}',gen_random_uuid());`));}
 age(c);deny(actor(a,sendSql(e2,'over budget')),/quota/);deny(actor(a,`select public.send_club_broadcast('${c}','over budget',gen_random_uuid());`),/quota/);
});

test('different clubs and platform budget independent while parent lock is held',async()=>{
 const {c}=fixture(),other=fixture(),label='event_'+randomUUID().replaceAll('-','');
 const holder=asyncSql(`set application_name='${label}';begin;select pg_advisory_xact_lock(1297303349,hashtext('${c}'));select pg_sleep(2);commit;`);await barrier(label);
 ok(actor(other.a,`set lock_timeout='400ms';${sendSql(other.e)}`));
 ok(sql(`update public.user_accounts set platform_role='platform_admin' where id='${other.a}';select private.set_messaging_broadcast_grant('${other.a}','${other.a}',true);`));ok(actor(other.a,`set lock_timeout='400ms';select public.send_platform_broadcast('independent',gen_random_uuid());`));ok(await holder);
});

const mutations=f=>[
 ['role',`update public.club_role_assignments set revoked_at=clock_timestamp() where membership_id='${f.membership}';`],
 ['leave',`update public.club_memberships set membership_status='left',left_at=now() where id='${f.membership}';`],
 ['suspend_member',`update public.club_memberships set membership_status='suspended',suspended_at=now() where id='${f.membership}';`],
 ['club_suspend',`update public.clubs set club_status='suspended' where id='${f.c}';`],
 ['club_archive',`update public.clubs set club_status='archived' where id='${f.c}';`],
 ['complete',`update public.club_official_events set event_status='completed' where id='${f.e}';`],
 ['cancel',`update public.club_official_events set event_status='cancelled' where id='${f.e}';`],
 ['events_permission',"delete from public.club_role_permissions where role_code='club_manager' and permission_code='club.events.manage';"],
 ['broadcast_permission',"delete from public.club_role_permissions where role_code='club_manager' and permission_code='club.messages.broadcast';"]
];
for(const winner of ['mutation','send'])test(`two connections: ${winner} wins role/membership/club/event/both permission races`,async()=>{
 for(let i=0;i<9;i++){
  ok(sql("insert into public.club_role_permissions(role_code,permission_code) values('club_manager','club.events.manage'),('club_manager','club.messages.broadcast') on conflict do nothing;"));
  const f=fixture(),[name,change]=mutations(f)[i],req=randomUUID(),label='event_'+randomUUID().replaceAll('-','');
  if(winner==='mutation'){
   const holder=asyncSql(`set application_name='${label}';begin;${change}select pg_sleep(1);commit;`);await barrier(label);
   const sending=asyncSql(identity(f.a,sendSql(f.e,'race',req)));ok(await holder);const result=await sending;
   if(name==='cancel')assert.equal(json(result).recipient_count,1);else deny(result,/permission|event_state/);
  }else{
   const holder=asyncSql(`set application_name='${label}';begin;${identity(f.a,sendSql(f.e,'race',req))}select pg_sleep(1);commit;`);await barrier(label);
   const changing=asyncSql(change);ok(await holder);ok(await changing);
   assert.equal(ok(sql(`select count(*) from public.messaging_messages where request_id='${req}';`)),'1');
   if(!['cancel','complete'].includes(name))deny(actor(f.a,sendSql(f.e,'race',req)),/permission/);
   if(name==='complete')deny(actor(f.a,sendSql(f.e)),/event_state/);
  }
 }
});

test('audience participation/account changes do not wait for sender transaction; past receipt stays',async()=>{
 const {a,b,c,e}=fixture(),label='event_'+randomUUID().replaceAll('-','');
 const holder=asyncSql(`set application_name='${label}';begin;${identity(a,sendSql(e))}select pg_sleep(2);commit;`);await barrier(label);
 ok(sql(`set lock_timeout='400ms';delete from public.club_official_event_participations where event_id='${e}';update public.user_accounts set account_status='suspended' where id='${b}';`));ok(await holder);
 assert.equal(ok(sql('select count(*) from public.messaging_recipients;')),'1');age(c);deny(actor(a,sendSql(e,'no participants')),/broadcast_audience/);
});

test('context invariants, tombstones, unicode limits, postgres owner and closed RLS/ACL',()=>{
 const {a,b,c,e}=fixture(),e2=event(c,a),m=send(a,e,'🙂'.repeat(2000));
 assert.equal([...detail(b,m.id).body].length,2000);deny(actor(a,sendSql(e,'🙂'.repeat(2001))),/invalid/);deny(actor(a,sendSql(e,' ')),/invalid/);
 for(const q of [`delete from public.messaging_club_event_broadcast_contexts where message_id='${m.id}';`,`insert into public.messaging_market_contexts(message_id) values('${m.id}');`,`insert into public.messaging_club_broadcast_contexts(message_id,club_id) values('${m.id}','${c}');`,`update public.messaging_club_event_broadcast_contexts set club_event_id='${e2}' where message_id='${m.id}';`,`update public.messaging_club_event_broadcast_contexts set club_event_id=null where message_id='${m.id}';`,`update public.messaging_messages set kind='platform_broadcast' where id='${m.id}';`])deny(sql(q),/context_invariant/);
 ok(sql(`delete from public.club_official_events where id='${e}';`));assert.equal(detail(b,m.id).id,m.id);assert.deepEqual(json(actor(b,`select public.get_message_club_event_context('${m.id}');`)),{available:false});
 assert.equal(ok(sql(`select club_id from public.messaging_club_event_broadcast_contexts where message_id='${m.id}';`)),c);
 const names=['get_club_event_broadcast_source','preview_club_event_broadcast','send_club_event_broadcast','list_club_event_broadcasts','get_club_event_broadcast','get_message_club_event_context'];
 const rows=json(sql(`select jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(p.proowner),'config',p.proconfig,'definer',p.prosecdef,'anon',has_function_privilege('anon',p.oid,'execute'),'service',has_function_privilege('service_role',p.oid,'execute'),'auth',has_function_privilege('authenticated',p.oid,'execute'))) from pg_proc p where p.proname in (${names.map(lit)});`));assert.equal(rows.length,6);
 for(const r of rows){assert.equal(r.owner,'postgres');assert.deepEqual(r.config,['search_path=""']);assert.equal(r.definer,true);assert.equal(r.anon,false);assert.equal(r.service,false);assert.equal(r.auth,true);}
 assert.equal(ok(sql("select relrowsecurity and relforcerowsecurity from pg_class where oid='public.messaging_club_event_broadcast_contexts'::regclass;")),'t');
 for(const role of ['anon','authenticated','service_role'])deny(sql(`set role ${role};select * from public.messaging_club_event_broadcast_contexts;`),/permission denied/);
 deny(actor(a,`select private.messaging_assert_event_operator('${e2}');`),/permission denied/);
});

test('10000 unique participants commit; 10001 deny with no partial delivery',()=>{
 const {a,c,e}=fixture();ok(sql(`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
 select gen_random_uuid(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated','bulk-'||gen_random_uuid()||'@example.invalid','',now(),now(),now() from generate_series(1,9999);
 insert into public.consent_records(user_id,consent_type,consent_version,decision)
 select a.id,t,v,'granted' from public.user_accounts a cross join(values('terms_required','terms-dev-v1'),('privacy_required','privacy-dev-v1')) c(t,v)
 where a.account_status='active' and not exists(select 1 from public.consent_records r where r.user_id=a.id and r.consent_type=t);
 insert into public.club_memberships(club_id,user_id) select '${c}',a.id from public.user_accounts a where a.account_status='active' and not exists(select 1 from public.club_memberships m where m.club_id='${c}' and m.user_id=a.id);
 insert into public.club_official_event_participations(event_id,membership_id) select '${e}',id from public.club_memberships where club_id='${c}' on conflict do nothing;`));
 const started=performance.now(),m=send(a,e,'bulk');console.log(`1F-B1 10000 recipients including commit: ${Math.round(performance.now()-started)} ms`);assert.equal(m.recipient_count,10000);assert.equal(ok(sql(`select count(*) from public.messaging_recipients where message_id='${m.id}';`)),'10000');
 const u=members()[0];join(c,u);participate(e,c,u);age(c);deny(actor(a,sendSql(e,'overflow')),/broadcast_audience/);assert.equal(count(),1);
});

test('canonical cancellation RPC and send serialize in both orders, retaining participants',async()=>{
 for(const winner of ['cancel','send']){
  const {a,b,c,e}=fixture(),label='event_'+randomUUID().replaceAll('-',''),req=randomUUID();
  const cancel=`select public.mutate_club_core_content('event','cancel',gen_random_uuid(),'${c}','${e}',1,'{}');`;
  const first=winner==='cancel'?cancel:sendSql(e,'weather cancellation',req),second=winner==='cancel'?sendSql(e,'weather cancellation',req):cancel;
  const holder=asyncSql(`set application_name='${label}';begin;${identity(a,first)}select pg_sleep(1);commit;`);await barrier(label);
  const queued=asyncSql(identity(a,second));ok(await holder);ok(await queued);
  assert.equal(ok(sql(`select event_status from public.club_official_events where id='${e}';`)),'cancelled');
  assert.equal(ok(sql(`select count(*) from public.club_official_event_participations where event_id='${e}';`)),'1');
  const m=json(sql(`select jsonb_build_object('id',id,'recipient_count',broadcast_recipient_count) from public.messaging_messages where request_id='${req}';`));assert.equal(m.recipient_count,1);assert.equal(detail(b,m.id).id,m.id);
 }
});

test('operator account, signup, role/permission definitions and reparented event history fail closed',()=>{
 const {a,b,e}=fixture(),other=fixture(),req=randomUUID(),m=send(a,e,'original',req);
 for(const change of [`update public.user_accounts set account_status='suspended' where id='${a}';`,`update public.user_accounts set account_status='withdrawn' where id='${a}';`,`delete from public.user_profiles where user_id='${a}';`,`delete from public.consent_records where user_id='${a}';`,`update public.club_role_definitions set is_active=false where role_code='club_manager';`,`update public.club_permission_definitions set is_active=false where permission_code='club.events.manage';`,`update public.club_permission_definitions set is_active=false where permission_code='club.messages.broadcast';`]){
  deny(sql(`begin;${change}${identity(a,sendSql(e,'original',req))}commit;`),/permission|account_unavailable/);
 }
 // A privileged raw source move must not grant the new club access to old history.
 ok(sql(`update public.club_official_events set club_id='${other.c}' where id='${e}';`));
 assert.equal(json(actor(other.a,`select public.list_club_event_broadcasts('${e}');`)).items.length,0);
 deny(actor(other.a,`select public.get_club_event_broadcast('${e}','${m.id}');`));
 assert.deepEqual(json(actor(b,`select public.get_message_club_event_context('${m.id}');`)),{available:false});
 assert.equal(detail(b,m.id).id,m.id);
});
