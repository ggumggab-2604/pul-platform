import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function load(file, mocks = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const compiled = { exports: {} };
  vm.runInNewContext(code, { module: compiled, exports: compiled.exports, require: id => {
    if (id in mocks) return mocks[id];
    throw new Error('Unmocked import ' + id);
  }, Promise, Map, Set, Object, Error });
  return compiled.exports;
}
const defer = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
const { createCourseInterestBatch } = load('lib/courses/courseInterestBatch.ts');
test('one pending request; later save wins over stale initial result', async () => {
  const d=defer(); let calls=0, snapshot;
  const batch=createCourseInterestBatch(() => {calls++; return d.promise;}, x => {snapshot=x;});
  const first=batch.load(); assert.equal(batch.load(),first);
  await Promise.resolve(); assert.equal(calls,1);
  batch.saved('course-a',true); d.resolve({'course-a':false,'course-b':false}); await first;
  assert.equal(snapshot.values['course-a'],true); assert.equal(snapshot.values['course-b'],false);
  assert.equal(snapshot.status,'ready');
});
test('failure is not false; shared retries coalesce and recover', async () => {
  let calls=0,snapshot; const d=defer();
  const batch=createCourseInterestBatch(() => {calls++; return calls===1 ? Promise.reject(Error('offline')) : d.promise;}, x => {snapshot=x;});
  await batch.load(); assert.equal(snapshot.status,'failed'); assert.equal(Object.hasOwn(snapshot.values,'course-a'),false);
  const retry=batch.load(); assert.equal(batch.load(),retry); await Promise.resolve(); assert.equal(calls,2);
  d.resolve({'course-a':true}); await retry; assert.equal(snapshot.status,'ready'); assert.equal(snapshot.values['course-a'],true);
});
test('disposed account/page and Strict Mode setup cannot publish or start a new read', async () => {
  const d=defer(); let oldPublishes=0,newValue;
  const old=createCourseInterestBatch(() => d.promise, () => oldPublishes++);
  const pending=old.load(); await Promise.resolve(); old.dispose(); const before=oldPublishes;
  const next=createCourseInterestBatch(async () => ({'course-a':false}), x => {newValue=x;}); await next.load();
  d.resolve({'course-a':true}); await pending; old.saved('course-a',true);
  assert.equal(oldPublishes,before); assert.equal(newValue.values['course-a'],false);
  let calls=0;const disposed=createCourseInterestBatch(async () => {calls++;return {};},()=>{});disposed.dispose();await disposed.load();assert.equal(calls,0);
});
const interests=load('lib/interests/interests.ts',{
 '@/lib/market/marketStores':{storeHref:()=>''},'@/lib/market/marketStartupQa':{qaHref:()=>''},'@/lib/market/marketBuyExchange':{buyExchangeHref:()=>''},'@/lib/lessons/lessonVideoBookmarks':{setLessonVideoBookmark:async()=>{}},
});
test('server validates bound, format and duplicates; one RPC and no false for missing keys', async () => {
 let calls=0;const client={rpc:async(name,args)=>{calls++;assert.equal(name,'course_interest_states');assert.equal(args.p_course_keys.length,2);return {data:{'course-a':true},error:null};}};
 for(const keys of [null,[],Array.from({length:25},(_,i)=>'course-'+i),['course-a','course-a'],['bad/key'],[{}]])await assert.rejects(interests.courseInterestStates(client,keys));
 assert.equal(calls,0);const result=await interests.courseInterestStates(client,['course-a','course-b']);assert.equal(calls,1);assert.equal(result['course-a'],true);assert.equal(Object.hasOwn(result,'course-b'),false);
 await assert.rejects(interests.courseInterestStates({rpc:async()=>({data:{'other-key':true},error:null})},['course-a']));
 await assert.rejects(interests.courseInterestStates({rpc:async()=>({data:{'course-a':'false'},error:null})},['course-a']));
 await assert.rejects(interests.courseInterestStates({rpc:async()=>({data:null,error:{code:'PGRST202'}})},['course-a']));
});
test('existing representative market read and save RPC branches preserved', async () => {
 const id='00000000-0000-4000-8000-000000000001'; const calls=[];
 const client={rpc:async(name,args)=>{calls.push(name); return {data:name==='market_interest_state'?true:{id,saved:args.p_saved},error:null};}};
 assert.equal(await interests.marketInterestState(client,id),true);assert.equal(await interests.setInterest(client,'market',id,false),false);assert.deepEqual(calls,['market_interest_state','set_market_interest']);
});
for(const failure of ['none','list','regions'])test('parallel page and independent outcomes: '+failure, async()=>{
 const list=defer(),regions=defer(),events=[]; class CourseDirectoryError extends Error {userMessage='list unavailable';}
 const pageValue={items:[],total:7,limit:24,offset:0,hasMore:false};
 const pageModule=load('app/courses/page.tsx',{
  'next/navigation':{redirect:()=>{throw Error('unexpected redirect');}},
  '@/lib/courses/courseNavigation':{courseSearchHref:()=>'/courses'},
  'react/jsx-runtime':{jsx:(_type,props,key)=>({props,key})},
  '@/components/courses/CoursesPageClient':{CoursesPageClient:()=>null},
  '@/lib/courses/courseDirectory':{CourseDirectoryError,listPublicCourses:()=>{events.push('list');return list.promise;},listPublicCourseRegions:()=>{events.push('regions');return regions.promise;}},
  '@/lib/promotions/promotionRuntime':{findPromotionForSlot:()=>null},
  '@/lib/promotions/promotionRuntime.server':{loadActivePromotionsForSlots:async()=>{events.push('promotions');return [];}},
  '@/lib/supabase/server':{createClient:async()=>({})},
 });
 const result=pageModule.default({searchParams:Promise.resolve({})});await new Promise(setImmediate);
 assert.deepEqual(events,['promotions','list','regions']);
 if(failure==='list')list.reject(new CourseDirectoryError());else list.resolve(pageValue);
 if(failure==='regions')regions.reject(Error('regions unavailable'));else regions.resolve([{province:'서울',districts:[]}]);
 const rendered=await result;
 assert.equal(rendered.props.page.total,failure==='list'?0:7);assert.equal(rendered.props.regionError,failure==='regions');assert.equal(rendered.props.regionOptions.length,failure==='regions'?0:1);assert.equal(Boolean(rendered.props.error),failure==='list');assert.equal(rendered.props.promotion,null);
});
test('promotion loader retains its actual error fallback', async()=>{
 const runtime=load('lib/promotions/promotionRuntime.server.ts',{'server-only':{},'react':{cache:f=>f},'@/lib/promotions/promotionDirectory':{getActivePromotionsForSlots:async()=>{throw Error('offline');}},'@/lib/supabase/server':{createClient:async()=>({})}});
 assert.equal((await runtime.loadActivePromotionsForSlots({},['courses.top.01'])).length,0);
});
