import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { startMarketTestEnvironment } from './marketTestEnvironment.mjs';
import { registerMarketRemediationTests } from './marketRemediationIntegration.mjs';
import { before, after, test } from 'node:test';
let environment;
const owner=randomUUID(),other=randomUUID(),inactive=randomUUID(),admin=randomUUID(),withdrawn=randomUUID();
const sql=(text,user='postgres')=>environment.sql(text,user);
const safeError=result=>String(result.stderr||'SQL failed').replace(/https:\/\/example\.invalid\/[^\s'";]+/g,'[TEST_CONTACT]').replace(/\b[0-9]{8,15}\b/g,'[NUMBER]');
const ok=result=>{assert.equal(result.status,0,safeError(result));return result.stdout.trim();};
const json=result=>JSON.parse(ok(result)||'null');
const actor=(id,text)=>sql(`set request.jwt.claim.sub='${id}';set role authenticated;${text}`);
const anon=text=>sql(`set role anon;${text}`);
const service=text=>sql(`set role service_role;${text}`);
const literal=value=>`'${JSON.stringify(value).replaceAll("'","''")}'::jsonb`;
const c={public_contact_method:'external_url',public_contact_value:'https://example.invalid/local-contact',public_contact_consent:true};
const buyPayload={title:'TEST 구매요청',summary:'TEST 충분한 길이의 구매 희망 내용',category:'club',region:'서울',budget:10000,...c};
const details={areaSqm:82.5,bayCount:0,deposit:0,monthlyRent:null,maintenance:10000,askingPrice:null,negotiable:true,monthlyRevenue:null,rentTerms:'TEST 별도 협의'};
const startupPayload={title:'TEST 매장 양도',body:'TEST 로컬 검증 전용 매장 설명입니다.',category:'screenResale',region:'경기',desired_scale:'미기재',consultation_type:'transfer',resale_details:details,...c};
let buyId,postKey,mediaId,legacyKeys;
before(async()=>{
  environment=await startMarketTestEnvironment();
  const rows=[owner,other,inactive,admin,withdrawn].map(id=>`('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase1-${id}@example.invalid','',now(),now(),now())`).join(',');
  ok(sql(`set session_replication_role=replica;insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values ${rows};insert into public.user_accounts(id,account_status)values('${owner}','active'),('${other}','active'),('${inactive}','suspended');insert into public.user_profiles(user_id,nickname,profile_visibility)values('${owner}','TEST 작성자','public'),('${other}','TEST 다른회원','public'),('${inactive}','TEST 비활성','public');set session_replication_role=origin;`));
  ok(sql(`insert into public.user_accounts(id,account_status,platform_role)values('${admin}','active','platform_admin'),('${withdrawn}','withdrawn','member');`));
});
after(async()=>{if(environment)await environment.stop();});
test('buy contact save, private detail, minimized lists, legacy exact shape and request replay',()=>{
 const request=randomUUID(),statement=`select public.mutate_market_buy_request_v2('create',null,null,${literal(buyPayload)},'${request}');`;
 const created=json(actor(owner,statement));buyId=created.buy_request_id;
 assert.equal(json(actor(owner,statement)).replayed,true);
 const list=json(anon('select public.list_market_buy_requests_v2(null,null,null,null,24,0);'));
 assert.equal(list.total,1);assert.equal(list.items[0].can_edit,false);assert.equal('public_contact_value' in list.items[0],false);
 const legacy=json(actor(owner,`select public.get_market_buy_request('${buyId}');`));legacyKeys=Object.keys(legacy).sort();assert.equal(legacyKeys.length,12);
 for(const id of [owner,other])assert.equal(json(actor(id,`select public.get_market_buy_request_v2('${buyId}');`)).public_contact_method,'external_url');
 for(const result of [anon(`select public.get_market_buy_request_v2('${buyId}');`),actor(inactive,`select public.get_market_buy_request_v2('${buyId}');`)])assert.equal(json(result).public_contact_value,null);
});
test('buy server search reaches later pages, total/hasMore/category/region/status work',()=>{
 ok(sql(`insert into public.market_buy_requests(author_user_id,title,summary,category_code,region_code,budget_amount,created_at)select '${owner}','TEST 검색 '||n,'TEST 서버 검색 전용 본문입니다.','ball','제주',1000,now()-n*interval '1 minute' from generate_series(1,28)n;`));
 const all=json(anon('select public.list_market_buy_requests_v2(null,null,null,null,24,0);'));assert.equal(all.total,29);assert.equal(all.items.length,24);assert.equal(all.has_more,true);
 const last=json(anon('select public.list_market_buy_requests_v2(null,null,null,null,24,24);'));assert.equal(last.items.length,5);assert.equal(last.has_more,false);
 const found=json(anon("select public.list_market_buy_requests_v2('  검색 28  ','ball','제주','open',24,0);"));assert.equal(found.total,1);assert.equal(found.offset,0);
 assert.equal(json(anon("select public.list_market_buy_requests_v2('검색 28','club',null,null,24,0);")).total,0);
 assert.notEqual(anon("select public.list_market_buy_requests_v2(null,null,null,'sold',24,0);").status,0);
});
test('buy guards: consent, invalid URL, inactive, other owner, stale, closed and deleted contact',()=>{
 for(const payload of [{...buyPayload,public_contact_consent:false},{...buyPayload,public_contact_value:'javascript:alert(1)'}])assert.notEqual(actor(owner,`select public.mutate_market_buy_request_v2('create',null,null,${literal(payload)},'${randomUUID()}');`).status,0);
 assert.notEqual(actor(inactive,`select public.mutate_market_buy_request_v2('create',null,null,${literal(buyPayload)},'${randomUUID()}');`).status,0);
 assert.notEqual(actor(other,`select public.mutate_market_buy_request_v2('update','${buyId}',1,${literal(buyPayload)},'${randomUUID()}');`).status,0);
 const updated=json(actor(owner,`select public.mutate_market_buy_request_v2('update','${buyId}',1,${literal({...buyPayload,title:'TEST 수정된 구매요청'})},'${randomUUID()}');`));assert.equal(updated.version,2);
 assert.notEqual(actor(owner,`select public.mutate_market_buy_request_v2('update','${buyId}',1,${literal(buyPayload)},'${randomUUID()}');`).status,0);
 assert.equal(ok(sql("select count(*) from private.market_audit_log where before_data ? 'public_contact_value';")),'0');
 assert.deepEqual(Object.keys(json(actor(owner,`select public.get_market_buy_request('${buyId}');`))).sort(),legacyKeys);
 ok(actor(owner,`select public.mutate_market_buy_request_v2('close','${buyId}',2,'{}','${randomUUID()}');`));
 assert.equal(json(actor(other,`select public.get_market_buy_request_v2('${buyId}');`)).public_contact_value,null);
 ok(actor(owner,`select public.mutate_market_buy_request_v2('delete','${buyId}',3,'{}','${randomUUID()}');`));assert.equal(json(anon(`select public.get_market_buy_request_v2('${buyId}');`)),null);
});
test('screen resale persists optional typed fields, null/zero/negotiable, and old RPCs stay compatible',()=>{
 const request=randomUUID(),statement=`select public.mutate_market_startup_post_v2('create',null,null,${literal(startupPayload)},'${request}');`;
 const result=json(actor(owner,statement));postKey=result.post_key;assert.equal(json(actor(owner,statement)).replayed,true);
 const detail=json(actor(other,`select public.get_market_startup_post_v2('${postKey}');`));assert.deepEqual(detail.resale_details,details);assert.equal(detail.public_contact_method,'external_url');
 assert.equal(json(anon(`select public.get_market_startup_post_v2('${postKey}');`)).public_contact_value,null);
 assert.equal(json(actor(inactive,`select public.get_market_startup_post_v2('${postKey}');`)).public_contact_value,null);
 const old=json(anon(`select public.get_market_startup_post('${postKey}');`));assert.equal(Object.keys(old).length,12);assert.equal('resale_details' in old,false);
 const list=json(anon('select public.list_market_startup_posts(null,null,null,24,0);'));assert.equal('public_contact_value' in list.items[0],false);
 assert.notEqual(actor(other,`select public.get_my_market_startup_post_context_v2('${postKey}');`).status,0);
 const legacyPayload={...startupPayload};delete legacyPayload.resale_details;delete legacyPayload.public_contact_method;delete legacyPayload.public_contact_value;delete legacyPayload.public_contact_consent;
 ok(actor(owner,`select public.mutate_market_startup_post('update','${postKey}',1,${literal(legacyPayload)});`));
 assert.deepEqual(json(actor(owner,`select public.get_market_startup_post_v2('${postKey}');`)).resale_details,details);
});
test('resale rejects unconsented/unsafe contact, unknown/negative/invalid numeric fields; inquiry fields optional',()=>{
 for(const payload of [{...startupPayload,public_contact_consent:false},{...startupPayload,public_contact_value:'https://user:pass@example.invalid/'},{...startupPayload,resale_details:{...details,bayCount:1.5}},{...startupPayload,resale_details:{...details,monthlyRent:-1}},{...startupPayload,resale_details:{...details,extra:1}}])assert.notEqual(actor(owner,`select public.mutate_market_startup_post_v2('create',null,null,${literal(payload)},'${randomUUID()}');`).status,0);
 const inquiry={...startupPayload,consultation_type:'resaleInquiry',resale_details:null,public_contact_method:null,public_contact_value:null,public_contact_consent:false};ok(actor(owner,`select public.mutate_market_startup_post_v2('create',null,null,${literal(inquiry)},'${randomUUID()}');`));
 assert.notEqual(actor(inactive,`select public.mutate_market_startup_post_v2('create',null,null,${literal(startupPayload)},'${randomUUID()}');`).status,0);
 assert.notEqual(actor(other,`select public.mutate_market_startup_post_v2('remove','${postKey}',2,'{}','${randomUUID()}');`).status,0);
});
test('startup media separates ownership/path, 5 slots, service-only finalize, byte mismatch and failed-slot reuse',()=>{
 assert.notEqual(actor(other,`select public.create_market_startup_media_upload_intent('${postKey}','image/png',64);`).status,0);
 assert.notEqual(actor(inactive,`select public.create_market_startup_media_upload_intent('${postKey}','image/png',64);`).status,0);
 for(let i=0;i<5;i++){const result=json(actor(owner,`select public.create_market_startup_media_upload_intent('${postKey}','image/png',64);`));if(i===0)mediaId=result.media_id;}
 assert.notEqual(actor(owner,`select public.create_market_startup_media_upload_intent('${postKey}','image/png',64);`).status,0);
 const context=ok(service(`select count(*) from public.get_market_startup_media_upload_context_server('${other}','${mediaId}');`));assert.equal(context,'0');
 assert.notEqual(actor(owner,`select public.finalize_market_startup_media_upload_server('${owner}','${mediaId}','image/png',64);`).status,0);
 assert.notEqual(service(`select public.finalize_market_startup_media_upload_server('${owner}','${mediaId}','image/jpeg',64);`).status,0);
 assert.equal(json(service(`select public.finalize_market_startup_media_upload_server('${owner}','${mediaId}','image/png',64);`)).media_status,'available');
 const detail=json(actor(owner,`select public.get_market_startup_post_v2('${postKey}');`));assert.equal(detail.image_paths.length,1);assert.match(detail.image_paths[0],/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/original$/);
 assert.equal(ok(sql('select count(*) from public.market_listings;')),'0');
 const pending=ok(sql(`select id from public.market_startup_media where media_status='pending_upload' limit 1;`));ok(service(`select public.mark_market_startup_media_upload_failed_server('${owner}','${pending}');`));ok(actor(owner,`select public.create_market_startup_media_upload_intent('${postKey}','image/png',64);`));
});
test('closed/hidden/removed startup restrict contact and media; delete returns only owned cleanup paths',()=>{
 ok(actor(owner,`select public.mutate_market_startup_post_v2('close','${postKey}',2,'{}','${randomUUID()}');`));
 assert.equal(json(actor(owner,`select public.get_market_startup_post_v2('${postKey}');`)).public_contact_value,null);
 assert.notEqual(actor(owner,`select public.create_market_startup_media_upload_intent('${postKey}','image/png',64);`).status,0);
 const removed=json(actor(owner,`select public.mutate_market_startup_post_v2('remove','${postKey}',3,'{}','${randomUUID()}');`));assert.ok(removed.removed_storage_paths.length>=5);
 assert.equal(ok(sql("select count(*) from public.market_startup_media where media_status<>'removed';")),'0');
 assert.notEqual(anon(`select public.get_market_startup_post_v2('${postKey}');`).status,0);
 assert.notEqual(actor(owner,"update public.market_startup_posts set title='직접 변경';").status,0);
 assert.notEqual(actor(owner,"insert into public.market_startup_media default values;").status,0);
});
test('sale existing detail keeps exact keys while anonymous/inactive and ended contact are withheld',()=>{
 const payload={title:'TEST 판매글',category:'club',price:12000,region:'서울',condition:'lightUse',trade_type:'direct',description:'TEST 충분히 긴 상품 설명입니다.',...c};
 const created=json(actor(owner,`select public.mutate_market_listing('create',null,null,${literal(payload)},'${randomUUID()}');`));
 const active=json(actor(other,`select public.get_market_listing('${created.listing_id}');`));assert.equal(active.public_contact_method,'external_url');assert.equal(Object.keys(active).length,18);
 for(const result of [anon(`select public.get_market_listing('${created.listing_id}');`),actor(inactive,`select public.get_market_listing('${created.listing_id}');`)])assert.equal(json(result).public_contact_value,null);
 ok(actor(owner,`select public.mutate_market_listing('reserve','${created.listing_id}',1,'{}','${randomUUID()}');`));ok(actor(owner,`select public.mutate_market_listing('sell','${created.listing_id}',2,'{}','${randomUUID()}');`));assert.equal(json(actor(owner,`select public.get_market_listing('${created.listing_id}');`)).public_contact_value,null);
});
registerMarketRemediationTests({environment:()=>environment,sql,ok,json,actor,anon,service,literal,owner,other,inactive,admin,withdrawn,startupPayload,buyPayload});
