import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test,beforeEach,afterEach,after} from 'node:test';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const runtime=process.env.PUL_MARKET_TEST_RUNTIME;
const {JSDOM}=runtime?createRequire(path.join(runtime,'package.json'))('jsdom'):require('jsdom');
const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://localhost:3300/courses'});
for(const n of ['window','document','HTMLElement','Event','MouseEvent','Node'])Object.defineProperty(globalThis,n,{value:dom.window[n],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const React=require('react'),{act}=React,{createRoot}=require('react-dom/client'),h=React.createElement;
const repo=process.env.PUL_COURSE_LOADING_SOURCE??fileURLToPath(new URL('../../../',import.meta.url)),cache=new Map(),listeners=new Set();
let identity='A',realAuth=null,getSessionOverride=null,bulkOverride=null,choiceOverride=null,calls=[],root;
const auth={getSession:()=>realAuth?realAuth.getSession():getSessionOverride?getSessionOverride():Promise.resolve({data:{session:identity?{user:{id:identity}}:null},error:null}),onAuthStateChange:fn=>{if(realAuth)return realAuth.onAuthStateChange(fn);listeners.add(fn);const initial=getSessionOverride?getSessionOverride():Promise.resolve({data:{session:identity?{user:{id:identity}}:null},error:null});void initial.then(result=>{if(listeners.has(fn))fn('INITIAL_SESSION',result.error?null:result.data.session);},()=>{if(listeners.has(fn))fn('INITIAL_SESSION',null);});return{data:{subscription:{unsubscribe:()=>listeners.delete(fn)}}};}};
function load(file){
 const absolute=path.resolve(repo,file);if(cache.has(absolute))return cache.get(absolute);
 const exports={};cache.set(absolute,exports);
 const code=ts.transpileModule(readFileSync(absolute,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 new Function('require','exports','module',code)(name=>{
  if(name==='@/lib/supabase/client')return{createClient:()=>({auth})};
  if(name==='@/app/my/interestActions')return{
   courseInterestStatesAction:async keys=>{calls.push({op:'batch',actor:identity,keys});return bulkOverride?bulkOverride(keys):Object.fromEntries(keys.map(k=>[k,false]));},
   setInterestAction:async()=>{throw Error('Unexpected legacy mutation');},
  };
  if(name==='@/app/courses/nextActions')return{courseNextAction:async input=>{
   calls.push({op:input.op,actor:identity,key:input.course});
   assert.equal(input.op,'choiceRead','No writes in this test');
   return choiceOverride?choiceOverride(input):{ok:true,data:{course_key:input.course,saved:false,subscribed:false,available:true}};
  }};
  if(name==='next/link')return{__esModule:true,default:({prefetch,children,...p})=>h('a',{...p,'data-prefetch':String(prefetch)},children)};
  if(name.startsWith('@/')||name.startsWith('.')){
   const base=name.startsWith('@/')?path.join(repo,'src',name.slice(2)):path.resolve(path.dirname(absolute),name);
   const target=[base+'.ts',base+'.tsx'].find(existsSync);assert.ok(target,name);return load(target);
  }
  return require(name);
 },exports,{exports});return exports;
}
const ui=load('src/components/courses/CourseInterestBatch.tsx');
const {createCourseInterestBatch}=load('src/lib/courses/courseInterestBatch.ts');
const host=document.getElementById('root');
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
async function unmount(){if(root){await act(async()=>root.unmount());root=null;}}
async function mount(keys=['course-a','course-b']){
 await unmount();root=createRoot(host);
 await act(async()=>root.render(h(React.StrictMode,null,h(ui.CourseInterestBatchProvider,{courseKeys:keys},...keys.map(k=>h(ui.CourseInterestBatchButton,{key:k,courseKey:k,returnTo:'/courses'}))))));
}
async function emit(id,event='SIGNED_IN'){identity=id;await act(async()=>{for(const fn of listeners)fn(event,id?{user:{id}}:null);});}
const click=label=>act(async()=>{const b=[...host.querySelectorAll('button')].find(x=>x.textContent===label);assert.ok(b,label);b.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
const errors=[],originalError=console.error;console.error=(...x)=>errors.push(x.join(' '));
beforeEach(async()=>{await unmount();identity='A';realAuth=null;getSessionOverride=bulkOverride=choiceOverride=null;calls=[];});
afterEach(()=>assert.deepEqual(errors.splice(0),[],'No React lifecycle errors'));
after(async()=>{await unmount();console.error=originalError;dom.window.close();});

test('signed-in first entry settles; detail-to-list remount settles; no automatic writes',async()=>{
 await mount();assert.doesNotMatch(host.textContent,/관심 확인 중/);assert.equal(host.querySelectorAll('p').length,2);
 assert.equal(calls.filter(x=>x.op==='batch').length,1);assert.equal(calls.filter(x=>x.op==='choiceRead').length,4); // Strict Mode effect setup is replayed.
 await mount();assert.doesNotMatch(host.textContent,/관심 확인 중/);assert.equal(calls.filter(x=>x.op==='batch').length,2);
});
test('signed-out → sign-in → account change → sign-out clears account state',async()=>{
 identity=null;await mount();assert.equal(host.querySelectorAll('a[href^="/login?"]').length,2);assert.equal(calls.length,0);
 await emit('A');assert.doesNotMatch(host.textContent,/관심 확인 중/);
 await emit('B');assert.equal(calls.filter(x=>x.op==='batch').at(-1).actor,'B');
 await emit(null,'SIGNED_OUT');assert.equal(host.querySelectorAll('a[href^="/login?"]').length,2);assert.doesNotMatch(host.textContent,/운영알림 안 받음/);
});
test('batch rejection is explicit failure; only manual retry reads again',async()=>{
 bulkOverride=()=>Promise.reject(Error('offline'));await mount();assert.match(host.textContent,/관심 상태 확인 실패/);assert.doesNotMatch(host.textContent,/관심 없음/);
 assert.equal(calls.filter(x=>x.op==='batch').length,1);bulkOverride=null;await click('다시 확인');assert.doesNotMatch(host.textContent,/관심 확인 중|관심 상태 확인 실패/);
});
test('pending batch has a deadline; a late old result cannot replace the manual retry',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const d=defer();let current,reads=0;
 const batch=createCourseInterestBatch(()=>++reads===1?d.promise:Promise.resolve({'course-a':true}),x=>{current=x;});
 const first=batch.load();await Promise.resolve();
 t.mock.timers.tick(12001);for(let i=0;i<8;i++)await Promise.resolve();assert.equal(current.status,'failed');await first;assert.equal(reads,1);
 await batch.load();assert.equal(current.status,'ready');assert.equal(current.values['course-a'],true);
 d.resolve({'course-a':false});await Promise.resolve();await Promise.resolve();assert.equal(current.values['course-a'],true);batch.dispose();
});
test('session read error is not signed-out or unsaved; manual retry resolves',async()=>{
 getSessionOverride=()=>Promise.resolve({data:{session:null},error:{message:'offline'}});await mount();
 assert.match(host.textContent,/로그인 상태 확인 실패/);assert.equal(host.querySelectorAll('a[href^="/login?"]').length,0);assert.equal(calls.length,0);
 getSessionOverride=null;await click('다시 확인');assert.match(host.textContent,/관심 없음/);
});
test('pending session ends visibly; manual retry ignores the old session result',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const d=defer();getSessionOverride=()=>d.promise;await mount();assert.match(host.textContent,/관심 확인 중/);
 await act(async()=>t.mock.timers.tick(12001));assert.match(host.textContent,/로그인 상태 확인 실패/);assert.doesNotMatch(host.textContent,/관심 확인 중|관심 없음/);
 getSessionOverride=null;await click('다시 확인');assert.match(host.textContent,/관심 없음/);await act(async()=>d.resolve({data:{session:null},error:null}));
 assert.equal(host.querySelectorAll('a[href^="/login?"]').length,0);
});
test('pending batch ends in failure in the mounted UI; no automatic re-read',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const d=defer();bulkOverride=()=>d.promise;await mount();assert.match(host.textContent,/관심 확인 중/);
 await act(async()=>t.mock.timers.tick(12001));assert.match(host.textContent,/관심 상태 확인 실패/);assert.doesNotMatch(host.textContent,/관심 확인 중|관심 없음/);assert.equal(calls.length,1);
 bulkOverride=null;await click('다시 확인');assert.match(host.textContent,/관심 없음/);await act(async()=>d.resolve({'course-a':true}));assert.doesNotMatch(host.textContent,/관심 저장 ·/);
});
test('account change discards delayed batch, repeated same-account auth event does not restart it',async()=>{
 const d=defer();bulkOverride=()=>identity==='A'?d.promise:{'course-a':false,'course-b':false};await mount();await emit('B');
 assert.match(host.textContent,/관심 없음/);const count=calls.length;await emit('B','TOKEN_REFRESHED');assert.equal(calls.length,count);
 await act(async()=>d.resolve({'course-a':true,'course-b':true}));assert.match(host.textContent,/관심 없음/);
});

test('actual auth-js INITIAL_SESSION null arrives before getSession retryable error; mounted UI remains failure, never signed-out',async()=>{
 const {GoTrueClient}=require('@supabase/auth-js');
 const now=Math.floor(Date.now()/1000),b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url'),key='LOCAL-only-auth-order';
 const memory={[key]:JSON.stringify({access_token:b64({alg:'HS256'})+'.'+b64({sub:'11111111-1111-4111-8111-111111111111',exp:now-60})+'.synthetic',refresh_token:'synthetic',expires_at:now-60,expires_in:3600,token_type:'bearer',user:{id:'11111111-1111-4111-8111-111111111111'}})};
 let requests=0;const events=[],settled=defer();
 const c=new GoTrueClient({url:'http://127.0.0.1:9/auth/v1',storageKey:key,storage:{getItem:k=>memory[k]??null,setItem:(k,v)=>{memory[k]=v;},removeItem:k=>{delete memory[k];}},autoRefreshToken:false,persistSession:true,detectSessionInUrl:false,
 fetch:async()=>{requests++;return new Response(JSON.stringify({msg:'LOCAL injected failure'}),{status:500,headers:{'content-type':'application/json'}});}});
 realAuth={onAuthStateChange:fn=>c.onAuthStateChange((ev,s)=>{events.push(ev);fn(ev,s);}),getSession:()=>c.getSession().then(r=>{events.push('getSession:'+r.error?.name);settled.resolve();return r;})};
 const previousError=console.error,previousWarn=console.warn;console.error=console.warn=()=>{};
 try{
  await mount();await act(async()=>{await settled.promise;});assert.ok(requests>0);assert.ok(events.indexOf('INITIAL_SESSION')>=0);assert.ok(events.indexOf('INITIAL_SESSION')<events.indexOf('getSession:AuthRetryableFetchError'));
  assert.match(host.textContent,/로그인 상태 확인 실패/);assert.equal(host.querySelectorAll('a[href^="/login?"]').length,0);assert.equal(calls.length,0);
 }finally{await unmount();realAuth=null;await c.stopAutoRefresh();c.broadcastChannel?.close();c._removeVisibilityChangedCallback();console.error=previousError;console.warn=previousWarn;}
});
