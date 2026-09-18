import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import ts from 'typescript';
const require=createRequire(import.meta.url),exports={};
const output=ts.transpileModule(readFileSync(new URL('./marketPhaseOne.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
new Function('require','exports',output)(name=>name==='./market'?require('./market.ts'):require(name),exports);
const {validateResaleDetails,emptyResaleDetails,listBuyRequestsV2,mutateBuyRequestV2,getBuyRequestV2,mutateStartupV2,getStartupV2}=exports;
const now='2026-09-17T00:00:00Z',id=randomUUID();
const rawBuy={id,title:'TEST 구매요청',category:'club',region:'서울',budget:1000,summary:'TEST 구매 희망 내용을 입력합니다.',author_display_name:'TEST 작성자',request_status:'open',created_at:now,updated_at:now,version:1,can_edit:false};
const c={publicContactMethod:'external_url',publicContactValue:'https://example.invalid/local-contact',publicContactConsent:true};
const client=handler=>({rpc:handler,storage:{from:()=>({getPublicUrl:path=>({data:{publicUrl:'http://localhost/storage/'+path}})})}});
test('structured resale distinguishes null, zero and negotiable and rejects malformed payloads',()=>{
 const value={...emptyResaleDetails(),areaSqm:0.29,deposit:0,negotiable:true};assert.deepEqual(validateResaleDetails(value),value);
 for(const bad of [{...value,bayCount:1.1},{...value,deposit:-1},{...value,monthlyRent:'0'},{...value,areaSqm:1.001},{...value,monthlyRevenue:Infinity},{...value,extra:true}])assert.throws(()=>validateResaleDetails(bad));
 assert.equal(validateResaleDetails(null),null);
});
test('buy filter adapter sends trimmed server conditions and offset, without contacts in list',async()=>{
 const page=await listBuyRequestsV2(client(async(name,args)=>{assert.equal(name,'list_market_buy_requests_v2');assert.deepEqual(args,{p_keyword:'채',p_category_code:'club',p_region_code:'서울',p_request_status:'open',p_limit:24,p_offset:24});return{data:{items:[rawBuy],total:25,limit:24,offset:24,has_more:false},error:null};}),{keyword:' 채 ',category:'club',region:'서울',status:'open'},24,24);
 assert.equal(page.items.length,1);assert.equal(page.hasMore,false);assert.equal('publicContactValue' in page.items[0],false);
});
test('buy contact exact envelope accepts legacy null and rejects extra private fields',async()=>{
 const row={post:rawBuy,public_contact_method:null,public_contact_value:null};assert.equal((await getBuyRequestV2(client(async()=>({data:row,error:null})),id)).publicContactValue,null);
 await assert.rejects(getBuyRequestV2(client(async()=>({data:{...row,email:'unexpected'},error:null})),id));
 await assert.rejects(getBuyRequestV2(client(async()=>({data:{...row,public_contact_method:'phone'},error:null})),id));
});
test('buy create/edit payload uses explicit consent and exact request ID; invalid consent never calls RPC',async()=>{
 const input={title:'TEST 구매',category:'club',budget:1000,region:'서울',summary:'TEST 거래할 장비를 찾습니다.',...c};let calls=0;const request=randomUUID();
 const api=client(async(name,args)=>{calls++;assert.equal(name,'mutate_market_buy_request_v2');assert.equal(args.p_payload.public_contact_consent,true);assert.equal(args.p_request_id,request);return{data:{request_id:request,buy_request_id:id,request_status:'open',version:1,replayed:false},error:null};});
 await mutateBuyRequestV2(api,'create',null,null,input,request);assert.equal(calls,1);await assert.rejects(mutateBuyRequestV2(api,'create',null,null,{...input,publicContactConsent:false},request));assert.equal(calls,1);
});
test('startup transfer requires contact, purchase inquiry keeps optional fields and old desiredScale',async()=>{
 const input={title:'TEST 매장 문의',body:'TEST 매장 매매 문의 내용을 작성합니다.',category:'screenResale',region:'서울',desiredScale:'',consultationType:'resaleInquiry',resale:null,contact:null};let calls=0;
 const api=client(async(name,args)=>{calls++;assert.equal(args.p_payload.desired_scale,'미기재');assert.equal(args.p_payload.resale_details,null);assert.equal(args.p_payload.public_contact_value,null);return{data:{post_key:'a'.repeat(24),board_status:'open',publication_status:'published',version:1,removed_storage_paths:[],replayed:false},error:null};});
 await mutateStartupV2(api,'create',null,null,input,randomUUID());await assert.rejects(mutateStartupV2(api,'create',null,null,{...input,consultationType:'transfer'},randomUUID()));assert.equal(calls,1);
});
test('startup detail only constructs URLs for owned-path contract in separate media bucket',async()=>{
 const post={post_key:'a'.repeat(24),title:'TEST 매장',body:'TEST 본문입니다 충분한 길이',category:'screenResale',region:'경기',desired_scale:'30평',consultation_type:'transfer',author_display_name:'TEST 작성자',board_status:'open',created_at:now,updated_at:now,can_edit:false};
 const row={post,resale_details:null,public_contact_method:null,public_contact_value:null,image_paths:[`${id}/${randomUUID()}/original`]};
 const api=client(async()=>({data:row,error:null}));const detail=await getStartupV2(api,post.post_key);assert.equal(detail.images.length,1);assert.equal(detail.desiredScale,'30평');
 await assert.rejects(getStartupV2(client(async()=>({data:{...row,image_paths:['../../private']},error:null})),post.post_key));
});
