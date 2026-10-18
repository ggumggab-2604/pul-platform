import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test,beforeEach} from 'node:test';
import ts from 'typescript';
let actor,authReads,calls,revalidate,override;
const code=ts.transpileModule(readFileSync(new URL('../../app/courses/nextActions.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exports={};new Function('require','exports',code)(id=>{
 if(id==='@/lib/supabase/auth')return{getAuthenticatedSupabaseContext:async()=>{authReads++;return actor?{userId:actor,supabase:{rpc:async(name,args)=>{calls.push({name,args});return override?override(name,args):{data:{course_key:args.p_course_key,saved:true,subscribed:false,available:true},error:null};}}}:null;}};
 if(id==='next/cache')return{revalidatePath:(...args)=>revalidate.push(args)};
 if(id==='@/lib/courses/courseNext')return{interestPolicy:'course-interest-v1',sharedPolicy:'course-shared-v1'};
 throw Error(id);
},exports);
beforeEach(()=>{actor='A';authReads=0;calls=[];revalidate=[];override=null;});
test('24 complete choices in one authenticated action; existing read RPC starts concurrently',async()=>{
 const pending=[];override=(_name,args)=>new Promise(resolve=>pending.push(()=>resolve({data:{course_key:args.p_course_key,saved:true,subscribed:false,available:true},error:null})));
 const keys=Array.from({length:24},(_,i)=>'course-'+i),request=exports.courseNextAction({op:'choiceReads',courses:keys,viewer:'A'});await Promise.resolve();await Promise.resolve();assert.equal(authReads,1);assert.equal(calls.length,24);assert.ok(calls.every(v=>v.name==='course_interest_read'));assert.equal(pending.length,24);pending.forEach(r=>r());const result=await request;assert.equal(result.ok,true);assert.equal(Object.keys(result.data).length,24);assert.equal(result.data['course-0'].subscribed,false);assert.equal(revalidate.length,0);
});
test('signed-out and mismatched viewer reject reads and writes before RPC',async()=>{
 actor=null;assert.equal((await exports.courseNextAction({op:'choiceReads',courses:['course-a'],viewer:'A'})).ok,false);actor='B';assert.equal((await exports.courseNextAction({op:'choiceReads',courses:['course-a'],viewer:'A'})).ok,false);assert.equal((await exports.courseNextAction({op:'choice',course:'course-a',enabled:true,viewer:'A'})).ok,false);assert.equal(calls.length,0);
});
test('bounded, unique valid keys required; no malformed batch reaches RPC',async()=>{
 for(const keys of [null,[],['bad/key'],['course-a','course-a'],[7],Array.from({length:25},(_,i)=>'course-'+i)])assert.equal((await exports.courseNextAction({op:'choiceReads',courses:keys,viewer:'A'})).ok,false);
 assert.equal((await exports.courseNextAction({op:'choiceReads',courses:['course-a']})).ok,false);assert.equal(calls.length,0);
});
test('individual unavailable/rejected course does not fail other choices or expose error',async()=>{
 override=(_name,args)=>args.p_course_key==='course-b'?{data:null,error:{message:'SECRET'}}:args.p_course_key==='course-c'?Promise.reject(Error('SECRET')):{data:{course_key:args.p_course_key,saved:false,subscribed:true,available:true},error:null};const r=await exports.courseNextAction({op:'choiceReads',courses:['course-a','course-b','course-c'],viewer:'A'});assert.equal(r.ok,true);assert.equal(r.data['course-a'].subscribed,true);assert.equal(r.data['course-b'],null);assert.equal(r.data['course-c'],null);assert.doesNotMatch(JSON.stringify(r),/SECRET/);assert.equal(revalidate.length,0);
});
test('existing choice mutation keeps RPC parameters, policy, idempotent request and revalidation',async()=>{
 const r=await exports.courseNextAction({op:'choice',course:'course-a',enabled:true,requestId:'request-a',viewer:'A'});assert.equal(r.ok,true);assert.deepEqual(calls,[{name:'course_interest_choose',args:{p_course_key:'course-a',p_enabled:true,p_policy:'course-interest-v1',p_request_id:'request-a'}}]);assert.equal(revalidate.length,3);
});
