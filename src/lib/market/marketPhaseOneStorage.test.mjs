import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import test from 'node:test';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const actor='10000000-0000-4000-8000-000000000001',id='20000000-0000-4000-8000-000000000002';
const bytes=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0]);
for(const kind of ['sale','startup']){
 const startup=kind==='startup',name=startup?'Startup':'Market',prefix=startup?'market_startup':'market',bucket=startup?'market-startup-media':'market-media';
 function harness(options={}){
  let state=options.available?'available':'pending_upload';const calls=[];
  const context={media_id:id,storage_bucket:bucket,storage_path:`${actor}/${id}/original`,declared_mime_type:'image/png',declared_size_bytes:bytes.length,media_version:1};
  const rpc=async(method,args)=>{calls.push(method);
   if(method===`create_${prefix}_media_upload_intent`)return{data:{media_id:id,media_status:'pending_upload',version:1}};
   if(method===`get_${prefix}_media_upload_context_server`)return{data:options.deny?[]:[{...context,...options.context}]};
   if(method===`get_${prefix}_media_state_server`)return options.stateError?{error:{message:'temporary state unavailable'}}:{data:startup?state:[{...context,media_status:state,media_version:state==='available'?2:1,listing_status:'selling',...options.context}]};
   if(method===`get_${prefix}_media_cleanup_path_server`)return{data:['failed','removed'].includes(state)?context.storage_path:null};
   if(method===`mark_${prefix}_media_upload_failed_server`){if(state==='pending_upload')state='failed';return{data:null};}
   if(method===`finalize_${prefix}_media_upload_server`){state='available';assert.equal(args.p_verified_size_bytes,bytes.length);if(options.lost){options.lost=false;return{data:null,error:{message:'network response unavailable'}};}return{data:{media_id:id,media_status:'available',version:2}};}
   throw Error('Unexpected RPC');
  };
  const api={rpc,storage:{from:actual=>{assert.equal(actual,bucket);return{
   createSignedUploadUrl:async()=>{calls.push('sign');return options.signFail?{error:{message:'local failure'}}:{data:{token:'local-test-token'}};},
   download:async()=>{calls.push('download');return options.downloadFail?{error:{message:'local offline'}}:{data:new Blob([options.badBytes?new Uint8Array(bytes.length):bytes],{type:'image/png'})};},
   remove:async()=>{calls.push('remove');return{error:options.removeFail?{message:'temporary cleanup unavailable'}:null};},
  };}}};
  const exports={};const file=startup?'marketStartupStorage.ts':'marketStorage.ts';
  const output=ts.transpileModule(readFileSync(new URL('./'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','exports',output)(module=>{
   if(module==='server-only')return{};
   if(module==='@supabase/supabase-js')return{createClient:()=>api};
   if(module==='@/lib/supabase/env')return{getSupabasePublicEnv:()=>({url:'http://localhost:55331'})};
   if(module==='@/lib/supabase/auth')return{getAuthenticatedSupabaseContext:async()=>({userId:actor,supabase:api})};
   if(module==='@/lib/clubs/clubMediaValidation')return require('../clubs/clubMediaValidation.ts');
   throw Error('Unexpected module');
  },exports);
  return{exports,calls,state:()=>state};
 }
 const withKey=async action=>{const old=process.env.SUPABASE_SERVICE_ROLE_KEY;process.env.SUPABASE_SERVICE_ROLE_KEY='local-unit-only';try{await action();}finally{if(old===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=old;}};
 const finalize=h=>h.exports[`finalize${name}MediaUpload`](id);
 const intent=h=>h.exports[`create${name}MediaUploadIntent`]({[startup?'postKey':'listingId']:startup?'a'.repeat(24):actor,declaredMimeType:'image/png',declaredByteSize:bytes.length,originalFilename:'local.png'});
 test(`${kind} server: owned context before sign, unsafe path denied and signed failure frees slot`,()=>withKey(async()=>{
  const good=harness();await intent(good);assert.ok(good.calls.indexOf('sign')>good.calls.indexOf(`get_${prefix}_media_upload_context_server`));
  for(const options of [{deny:true},{context:{storage_path:'../../private'}}]){const denied=harness(options);await assert.rejects(intent(denied));assert.equal(denied.calls.includes('sign'),false);}
  const failed=harness({signFail:true});await assert.rejects(intent(failed));assert.equal(failed.state(),'failed');
 }));
 test(`${kind} server: actual bytes required; invalid bytes fail and clean only rejected object`,()=>withKey(async()=>{
  const good=harness();assert.equal((await finalize(good)).status,'available');assert.ok(good.calls.indexOf('download')<good.calls.indexOf(`finalize_${prefix}_media_upload_server`));
  const bad=harness({badBytes:true});await assert.rejects(finalize(bad));assert.equal(bad.state(),'failed');assert.equal(bad.calls.includes('remove'),true);assert.equal(bad.calls.includes(`finalize_${prefix}_media_upload_server`),false);
 }));
 test(`${kind} server: transient download failure preserves pending object for retry`,()=>withKey(async()=>{
  const h=harness({downloadFail:true});await assert.rejects(finalize(h));assert.equal(h.state(),'pending_upload');assert.equal(h.calls.includes('remove'),false);
 }));
 test(`${kind} server: lost finalize response never deletes success and retry does not download twice`,()=>withKey(async()=>{
  const h=harness({lost:true});await assert.rejects(finalize(h));assert.equal(h.state(),'available');assert.equal(h.calls.includes('remove'),false);assert.equal((await finalize(h)).status,'available');assert.equal(h.calls.filter(v=>v==='download').length,1);
 }));
 test(`${kind} server: terminal cleanup failure remains retryable and never deletes available objects`,()=>withKey(async()=>{
  const settings={removeFail:true},h=harness(settings);assert.equal(await h.exports[`fail${name}MediaUpload`](id),false);assert.equal(h.state(),'failed');
  settings.removeFail=false;assert.equal(await h.exports[`cleanup${name}MediaUpload`](id),true);
  const available=harness({available:true});assert.equal(await available.exports[`cleanup${name}MediaUpload`](id),false);assert.equal(available.calls.includes('remove'),false);
 }));
 if(!startup){
  test('sale server: available replay uses candidate state without legacy context, download or remove',()=>withKey(async()=>{
   const h=harness({available:true,downloadFail:true});
   assert.deepEqual(await finalize(h),{mediaId:id,status:'available',version:2});
   assert.deepEqual(h.calls,['get_market_media_state_server']);
  }));
  test('sale server: ambiguous or invalid state cannot delete a verified object',()=>withKey(async()=>{
   for(const options of [{stateError:true},{context:{media_id:actor}},{context:{storage_path:'../../private'}},{context:{declared_mime_type:'text/html'}},{context:{declared_size_bytes:8388609}},{context:{media_status:'unknown'}}]){
    const h=harness({available:true,...options});await assert.rejects(finalize(h));
    assert.equal(h.calls.includes('download'),false);assert.equal(h.calls.includes('remove'),false);
   }
  }));
 }
}
