import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('./marketListingReports.ts',import.meta.url),'utf8');const api={};new Function('exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(api);
const key='a'.repeat(32),id='00000000-0000-4000-8000-000000000021',requestId='00000000-0000-4000-8000-000000000023';const common={report_key:key,reason_code:'other',report_status:'received',version:1,created_at:'2026-10-02T00:00:00Z',resolved_at:null};
const client=(expected,data)=>({rpc:async(name)=>{assert.equal(name,expected);return {data,error:null};}});
test('buy/exchange operator list keeps canonical type and refuses unknown types',async()=>{const row={...common,listing_title:'LOCAL exchange',listing_status:'open',request_type:'exchange'};const page={items:[row],total:1,limit:30,offset:0,has_more:false};assert.equal((await api.listMarketListingReportsForManagement(client('list_market_buy_request_reports_for_management',page),'received',30,0,'buy_request')).items[0].requestType,'exchange');await assert.rejects(api.listMarketListingReportsForManagement(client('list_market_buy_request_reports_for_management',{...page,items:[{...row,request_type:'other'}]}),'received',30,0,'buy_request'));await assert.rejects(api.listMarketListingReportsForManagement({rpc:()=>{throw Error('must not call');}},'received',30,0,'arbitrary_table'));});
test('existing sale operator read stays on its old RPC and DTO',async()=>{const page={items:[{...common,listing_title:'LOCAL sale',listing_status:'selling'}],total:1,limit:30,offset:0,has_more:false};assert.equal((await api.listMarketListingReportsForManagement(client('list_market_listing_reports_for_management',page))).items[0].listingStatus,'selling');});
test('buy report detail and resolution use distinct RPCs and stable IDs',async()=>{const data={...common,note:'LOCAL reason',resolution_note:null,listing:{id,name:'LOCAL exchange',seller_display_name:'LOCAL seller',sale_status:'closed',request_type:'exchange',version:2}};const detail=await api.getMarketListingReportForManagement(client('get_market_buy_request_report_for_management',data),key,'buy_request');assert.equal(detail.listing.id,id);assert.equal(detail.requestType,'exchange');const result={report_key:key,report_status:'handled',version:2,resolved_at:'2026-10-02T00:01:00Z',request_id:requestId,replayed:false};assert.equal((await api.resolveMarketListingReport(client('resolve_market_buy_request_report',result),{reportKey:key,expectedVersion:1,resolution:'handled',note:'LOCAL handled',requestId},'buy_request')).reportStatus,'handled');});

function moduleWith(relative, imports) {
  const exports = {};
  new Function('require', 'exports', 'module', ts.transpileModule(
    readFileSync(new URL(relative, import.meta.url), 'utf8'),
    {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}},
  ).outputText)(name => {
    assert.ok(Object.hasOwn(imports, name), 'unexpected import: ' + name);
    return imports[name];
  }, exports, {exports});
  return exports;
}
const actorId='00000000-0000-4000-8000-000000000031';
function storageFixture(response, remove=async()=>({error:null}), authenticated=true) {
  const calls=[];
  const fakeService={rpc:async(name,args)=>{calls.push({name,args});return response;},storage:{from:bucket=>({remove:async paths=>{calls.push({bucket,paths});return remove(paths);}})}};
  const previous=process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-unit-fixture';
  const storage=moduleWith('./marketExchangeStorage.ts',{
    'server-only':{},'@supabase/supabase-js':{createClient:()=>fakeService},
    '@/lib/clubs/clubMediaValidation':{},
    '@/lib/supabase/auth':{getAuthenticatedSupabaseContext:async()=>authenticated?{userId:actorId}:null},
    '@/lib/supabase/env':{getSupabasePublicEnv:()=>({url:'http://127.0.0.1:1'})},
  });
  return {storage,calls,restore(){if(previous===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=previous;}};
}
const mediaRow=(mediaId=id,postId=requestId,owner=actorId)=>({media_id:mediaId,post_id:postId,uploaded_by_user_id:owner,storage_path:postId+'/'+mediaId+'/original'});
test('cleanup sends authenticated actor and exact deleted post; missing scope or login never calls service',async()=>{
 const f=storageFixture({data:[mediaRow()],error:null});try{
  assert.deepEqual(await f.storage.reconcileExchangeMedia(requestId),{checked:1,cleanupPending:false});
  assert.deepEqual(f.calls[0],{name:'reconcile_market_exchange_media_server',args:{p_actor_user_id:actorId,p_post_id:requestId}});
  assert.deepEqual(f.calls[1].paths,[mediaRow().storage_path]);
  const n=f.calls.length;await assert.rejects(f.storage.reconcileExchangeMedia());assert.equal(f.calls.length,n);
 }finally{f.restore();}
 const g=storageFixture({data:[],error:null},undefined,false);try{await assert.rejects(g.storage.reconcileExchangeMedia(requestId));assert.equal(g.calls.length,0);}finally{g.restore();}
});
test('cross-post/uploader/path responses refuse all Storage deletion; empty buy never removes',async()=>{
 for(const invalid of [mediaRow(id,id),mediaRow(id,requestId,id),{...mediaRow(),storage_path:id+'/'+id+'/original'}]){
  const f=storageFixture({data:[mediaRow(),invalid],error:null});try{await assert.rejects(f.storage.reconcileExchangeMedia(requestId));assert.equal(f.calls.length,1);}finally{f.restore();}
 }
 const f=storageFixture({data:[],error:null});try{assert.deepEqual(await f.storage.reconcileExchangeMedia(requestId),{checked:0,cleanupPending:false});assert.equal(f.calls.length,1);}finally{f.restore();}
});
test('uncertain RPC and partial Storage failures remain pending; same-target retry succeeds',async()=>{
 const rows=[mediaRow(),mediaRow(actorId)];const objects=new Set(rows.map(r=>r.storage_path));let fail=true;
 const f=storageFixture({data:rows,error:null},async paths=>{objects.delete(paths[0]);if(fail){fail=false;return {error:{message:'synthetic partial failure'}};}paths.forEach(p=>objects.delete(p));return {error:null};});
 try{assert.equal((await f.storage.reconcileExchangeMedia(requestId)).cleanupPending,true);assert.equal(objects.size,1);assert.equal((await f.storage.reconcileExchangeMedia(requestId)).cleanupPending,false);assert.equal(objects.size,0);assert.equal((await f.storage.reconcileExchangeMedia(requestId)).cleanupPending,false);}finally{f.restore();}
 const g=storageFixture({data:null,error:{message:'synthetic unavailable'}});try{assert.equal((await g.storage.reconcileExchangeMedia(requestId)).cleanupPending,true);assert.equal(g.calls.length,1);}finally{g.restore();}
});
test('delete action uses canonical result ID and preserves deletion success with cleanupPending',async()=>{
 const calls=[];let fail=true;
 const result={id:requestId,status:'removed',version:2,replayed:false};
 const actions=moduleWith('../../app/market/phaseOneActions.ts',{
  '@/lib/market/marketExchangeStorage':{reconcileExchangeMedia:async post=>{calls.push(post);if(fail)throw Error('synthetic unavailable');return {cleanupPending:false};}},
  'next/cache':{revalidatePath:()=>{}},'@/lib/supabase/server':{createClient:async()=>({})},
  '@/lib/market/marketPhaseOne':{mutateBuyRequestV2:async()=>result},
  '@/lib/market/marketStartupStorage':{},'@/lib/market/marketStorage':{},
 });
 const input={operation:'delete',id,version:1,payload:null,requestId:actorId,actorId:id};
 assert.deepEqual(await actions.mutateBuyRequestV2Action(input),{...result,cleanupPending:true});assert.deepEqual(calls,[requestId]);
 fail=false;assert.equal((await actions.mutateBuyRequestV2Action(input)).cleanupPending,false);assert.deepEqual(calls,[requestId,requestId]);
 await actions.mutateBuyRequestV2Action({...input,operation:'close'});assert.equal(calls.length,2);
});
