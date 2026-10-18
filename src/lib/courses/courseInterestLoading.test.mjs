import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {test,beforeEach,afterEach} from 'node:test';
import ts from 'typescript';
const require=createRequire(import.meta.url);
let store,actor,authOverride,override,calls,sessions,listeners,windowBefore;
const good=(key='course-a',saved=false,subscribed=saved)=>({ok:true,data:{course_key:key,saved,subscribed,available:true}});
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
const emit=(id,event='SIGNED_IN')=>{actor=id;for(const fn of listeners)fn(event,id?{user:{id}}:null);};
const code=ts.transpileModule(readFileSync(new URL('./courseChoiceClient.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
beforeEach(async()=>{
 actor='A';calls=[];sessions=0;listeners=[];authOverride=override=null;windowBefore=globalThis.window;globalThis.window=new EventTarget();
 const exports={};new Function('require','exports',code)(id=>{
  if(id==='@/lib/supabase/client')return{createClient:()=>({auth:{getSession:()=>{sessions++;return authOverride?authOverride():Promise.resolve({data:{session:actor?{user:{id:actor}}:null},error:null});},onAuthStateChange:fn=>{listeners.push(fn);return{};}}})};
  if(id==='./courseNextClient')return{safeCourseNextAction:async input=>{calls.push({...input,actor});if(input.op==='choiceReads'){const rows=await Promise.all(input.courses.map(async key=>{try{const r=override?await override({...input,op:'choiceRead',course:key}):good(key);return [key,r.ok?r.data:null];}catch{return [key,null];}}));return{ok:true,data:Object.fromEntries(rows)};}return override?override(input):good(input.course);}};
  throw Error(id);
 },exports);store=exports.createCourseChoiceClient();store.subscribe(()=>{});await flush();
});
afterEach(()=>{globalThis.window=windowBefore;});
test('one auth subscription and one complete read for duplicate consumers',async()=>{
 store.subscribe(()=>{});const a=store.watch('course-a'),b=store.watch('course-a');await flush();assert.equal(sessions,1);assert.equal(listeners.length,1);assert.equal(calls.length,1);assert.equal(calls[0].op,'choiceReads');a();b();
});
test('first entry stays unknown until response; independent saved/subscribed values',async()=>{
 const d=defer();override=()=>d.promise;void store.read('course-a');assert.equal(store.getSnapshot().entries.get('course-a').value,undefined);assert.equal(store.getSnapshot().entries.get('course-a').pending,true);d.resolve(good('course-a',true,false));await flush();assert.equal(store.getSnapshot().entries.get('course-a').value.subscribed,false);
});
test('remount reuses value immediately and revalidates without clearing it',async()=>{
 await store.read('course-a');const d=defer();override=()=>d.promise;const off=store.watch('course-a');assert.equal(store.visible(store.getSnapshot().entries.get('course-a')).saved,false);await flush();off();store.watch('course-a');await flush();assert.equal(calls.length,2);d.resolve(good('course-a',true));await flush();assert.equal(store.getSnapshot().entries.get('course-a').value.saved,true);assert.equal(sessions,1);
});
test('save waits for success; late pre-save read cannot overwrite it',async()=>{
 await store.read('course-a');const read=defer(),write=defer();override=v=>v.op==='choice'?write.promise:read.promise;void store.read('course-a');const saved=store.choose('course-a',true);assert.equal(store.getSnapshot().entries.get('course-a').value.saved,false);await store.choose('course-a',true);assert.equal(calls.filter(x=>x.op==='choice').length,1);write.resolve(good('course-a',true));assert.equal(await saved,true);read.resolve(good());await flush();assert.equal(store.getSnapshot().entries.get('course-a').value.saved,true);
});
test('read failure preserves last confirmed value and retry recovers without polling',async()=>{
 await store.read('course-a');override=()=>Promise.reject(Error('offline'));await store.read('course-a');assert.equal(store.getSnapshot().entries.get('course-a').failed,true);assert.equal(store.getSnapshot().entries.get('course-a').value.saved,false);const count=calls.length;await flush();assert.equal(calls.length,count);override=v=>good(v.course,true);await store.read('course-a');assert.equal(store.getSnapshot().entries.get('course-a').value.saved,true);assert.equal(store.getSnapshot().entries.get('course-a').failed,undefined);
});
test('read has 12s deadline; manual retry ignores timed-out result',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const d=defer();override=()=>d.promise;void store.read('course-a');t.mock.timers.tick(11999);await flush();assert.equal(store.getSnapshot().entries.get('course-a').failed,false);t.mock.timers.tick(2);await flush();assert.equal(store.getSnapshot().entries.get('course-a').failed,true);override=v=>good(v.course,true);await store.read('course-a');d.resolve(good());await flush();assert.equal(store.getSnapshot().entries.get('course-a').value.saved,true);
});
test('account switch, logout, A→B→A discard late reads and successful writes',async()=>{
 await store.read('course-a');const d=defer();override=()=>d.promise;void store.read('course-a');emit('B');assert.equal(store.getSnapshot().entries.size,0);emit('A');override=v=>good(v.course,false,true);await store.read('course-a');d.resolve(good('course-a',true));await flush();assert.equal(store.getSnapshot().entries.get('course-a').value.saved,false);
 const save=defer();override=()=>save.promise;const saving=store.choose('course-a',true);emit('B');override=v=>good(v.course);await store.read('course-a');save.resolve(good('course-a',true));assert.equal(await saving,false);assert.equal(store.getSnapshot().entries.get('course-a').value.saved,false);window.dispatchEvent(new Event('pul-auth-signed-out'));assert.equal(store.getSnapshot().viewer,null);assert.equal(store.getSnapshot().entries.size,0);
});
test('same-account token refresh neither clears data nor restarts requests',async()=>{
 await store.read('course-a');const count=calls.length;emit('A','TOKEN_REFRESHED');assert.equal(calls.length,count);assert.equal(store.getSnapshot().entries.get('course-a').value.saved,false);
});
test('auth failure stays unknown; retry ignores older session result',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const d=defer();authOverride=()=>d.promise;void store.verify();t.mock.timers.tick(12001);await flush();assert.equal(store.getSnapshot().authFailed,true);authOverride=null;await store.verify();d.resolve({data:{session:null},error:null});await flush();assert.equal(store.getSnapshot().viewer,'A');
 authOverride=()=>Promise.resolve({data:{session:null},error:Error('offline')});await store.verify();emit(null,'INITIAL_SESSION');assert.equal(store.getSnapshot().authFailed,true);assert.equal(store.getSnapshot().viewer,'A');
});
test('mutation timeout retries exact request across remount; late completion ignored',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});await store.read('course-a');const d=defer();override=()=>d.promise;void store.choose('course-a',true);t.mock.timers.tick(12001);await flush();assert.equal(store.getSnapshot().entries.get('course-a').uncertain,true);const off=store.watch('course-a');await flush();off();assert.equal(calls.filter(v=>v.op==='choiceReads').length,1);override=v=>good(v.course,true);await store.choose('course-a',false);const writes=calls.filter(v=>v.op==='choice');assert.equal(writes.length,2);assert.equal(writes[0].requestId,writes[1].requestId);assert.equal(writes[1].enabled,true);d.resolve(good());await flush();assert.equal(store.getSnapshot().entries.get('course-a').value.saved,true);
});
test('five-minute fallback expiry and focus refresh only mounted courses',async()=>{
 await store.read('course-a');const originalNow=Date.now;Date.now=()=>originalNow()+300001;try{assert.equal(store.visible(store.getSnapshot().entries.get('course-a')),undefined);}finally{Date.now=originalNow;}
 store.watch('course-b');await flush();const before=calls.length;window.dispatchEvent(new Event('focus'));await flush();assert.deepEqual(calls.slice(before).flatMap(v=>v.courses??[v.course]),['course-b']);
});
test('auth-js real INITIAL_SESSION null precedes retryable refresh failure; not signed-out',async()=>{
 const {GoTrueClient}=require('@supabase/auth-js');const now=Math.floor(Date.now()/1000),b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url'),key='LOCAL-only-choice-auth-order';
 const memory={[key]:JSON.stringify({access_token:b64({alg:'HS256'})+'.'+b64({sub:'11111111-1111-4111-8111-111111111111',exp:now-60})+'.synthetic',refresh_token:'synthetic',expires_at:now-60,expires_in:3600,token_type:'bearer',user:{id:'11111111-1111-4111-8111-111111111111'}})};
 const c=new GoTrueClient({url:'http://127.0.0.1:9/auth/v1',storageKey:key,storage:{getItem:k=>memory[k]??null,setItem:(k,v)=>{memory[k]=v;},removeItem:k=>{delete memory[k];}},autoRefreshToken:false,persistSession:true,detectSessionInUrl:false,fetch:async()=>new Response(JSON.stringify({msg:'LOCAL injected failure'}),{status:500,headers:{'content-type':'application/json'}})});
 const observed=[];c.onAuthStateChange((ev,s)=>{observed.push(ev);emit(s?.user.id??null,ev);});const settled=defer();authOverride=()=>c.getSession().then(r=>{settled.resolve();return r;});const previousError=console.error;console.error=()=>{};
 try{await store.verify();await settled.promise;await flush();assert.ok(observed.includes('INITIAL_SESSION'));assert.equal(store.getSnapshot().authFailed,true);assert.equal(store.getSnapshot().viewer,'A');}finally{console.error=previousError;await c.stopAutoRefresh();c.broadcastChannel?.close();c._removeVisibilityChangedCallback();}
});

test('24 controls share one complete read action, no legacy boolean batch',async()=>{
 const stops=Array.from({length:24},(_,i)=>store.watch('course-'+i));await flush();assert.equal(calls.length,1);assert.equal(calls[0].op,'choiceReads');assert.equal(calls[0].courses.length,24);assert.equal(store.getSnapshot().entries.size,24);stops.forEach(stop=>stop());
});
test('D1 R1 mounted render timestamp keeps confirmed value after five minutes without a phantom read',async()=>{
 const off=store.watch('course-a');await flush();const mountedAt=Date.now(),originalNow=Date.now,count=calls.length;
 Date.now=()=>originalNow()+300001;
 try{
  emit('A','TOKEN_REFRESHED');await flush();const entry=store.getSnapshot().entries.get('course-a');
  assert.equal(store.visible(entry,mountedAt).saved,false);assert.equal(entry.pending,false);assert.ok(!entry.failed&&!entry.busy);assert.equal(calls.length,count);
  // A different control opening now still rejects an expired cache fallback.
  assert.equal(store.visible(entry,Date.now()),undefined);
 }finally{Date.now=originalNow;off();}
});
test('D1 R2 expired uncertain value and exact retry survive remount without optimistic success',async()=>{
 await store.read('course-a');override=()=>({ok:false,code:'unknown',message:'uncertain'});await store.choose('course-a',true);
 const originalNow=Date.now,count=calls.length;Date.now=()=>originalNow()+300001;
 try{
  const off=store.watch('course-a');await flush();window.dispatchEvent(new Event('focus'));await flush();
  const entry=store.getSnapshot().entries.get('course-a');assert.equal(entry.uncertain,true);assert.equal(store.visible(entry,Date.now()).saved,false);assert.equal(calls.length,count);
  override=v=>good(v.course,true);await store.choose('course-a',false);const writes=calls.filter(v=>v.op==='choice');assert.equal(writes.length,2);assert.equal(writes[0].requestId,writes[1].requestId);assert.equal(writes[1].enabled,true);assert.equal(store.visible(store.getSnapshot().entries.get('course-a'),Date.now()).saved,true);off();
 }finally{Date.now=originalNow;}
});
test('D1 expired fresh mount revalidates once; focus preserves pending dedupe and failure recovery',async()=>{
 await store.read('course-a');const originalNow=Date.now;Date.now=()=>originalNow()+300001;const d=defer();override=()=>d.promise;
 try{
  const before=calls.length,off=store.watch('course-a');await flush();const entry=store.getSnapshot().entries.get('course-a');assert.equal(store.visible(entry,Date.now()),undefined);assert.equal(entry.pending,true);assert.equal(calls.length,before+1);
  window.dispatchEvent(new Event('focus'));await flush();assert.equal(calls.length,before+1);d.resolve({ok:false});await flush();assert.equal(store.getSnapshot().entries.get('course-a').failed,true);
  override=v=>good(v.course,true);await store.read('course-a');assert.equal(store.visible(store.getSnapshot().entries.get('course-a'),Date.now()).saved,true);off();
 }finally{Date.now=originalNow;}
});
test('D1 display retention never restores an old account value after switch or logout',async()=>{
 await store.read('course-a');const mountedAt=Date.now(),originalNow=Date.now;Date.now=()=>originalNow()+300001;
 try{emit('B');assert.equal(store.visible(store.getSnapshot().entries.get('course-a'),mountedAt),undefined);assert.equal(store.getSnapshot().entries.size,0);await store.read('course-a');emit(null,'SIGNED_OUT');assert.equal(store.visible(store.getSnapshot().entries.get('course-a'),mountedAt),undefined);assert.equal(store.getSnapshot().entries.size,0);}finally{Date.now=originalNow;}
});
for(const mode of ['uncertain','busy'])for(const outcome of ['success','failure','timeout'])test(`R2b expired ${mode} remount: definitive rejection triggers read ${outcome}, never another write`,async t=>{
 if(outcome==='timeout')t.mock.timers.enable({apis:['setTimeout']});
 await store.read('course-a');
 if(mode==='uncertain'){override=()=>({ok:false,code:'unknown',message:'uncertain'});await store.choose('course-a',true);}
 const write=defer(),read=defer();override=v=>v.op==='choice'?write.promise:read.promise;
 const saving=store.choose('course-a',mode==='uncertain'?false:true);const originalNow=Date.now;Date.now=()=>originalNow()+300001;
 const off=store.watch('course-a');const mountedAt=Date.now();
 try{
  await flush();assert.equal(store.visible(store.getSnapshot().entries.get('course-a'),mountedAt).saved,false);
  const readsBefore=calls.filter(v=>v.op==='choiceReads').length;write.resolve({ok:false,code:'42501',message:'저장 거절 안내'});assert.equal(await saving,false);await flush();
  let entry=store.getSnapshot().entries.get('course-a');assert.equal(entry.pending,true);assert.equal(entry.busy,false);assert.equal(entry.uncertain,false);assert.equal(entry.attempt,undefined);assert.equal(entry.message,'저장 거절 안내');assert.equal(store.visible(entry,mountedAt),undefined);
  assert.equal(calls.filter(v=>v.op==='choiceReads').length,readsBefore+1);
  const writes=calls.filter(v=>v.op==='choice');assert.equal(writes.length,mode==='uncertain'?2:1);if(mode==='uncertain'){assert.equal(writes[0].requestId,writes[1].requestId);assert.equal(writes[1].enabled,true);}
  if(outcome==='success')read.resolve(good('course-a',false,true));else if(outcome==='failure')read.reject(Error('offline'));else t.mock.timers.tick(12001);
  await flush();entry=store.getSnapshot().entries.get('course-a');assert.equal(entry.pending,false);assert.equal(entry.message,'저장 거절 안내');assert.doesNotMatch(entry.message,/설정했습니다/);
  if(outcome==='success'){assert.equal(store.visible(entry,mountedAt).saved,false);assert.equal(entry.value.subscribed,true);assert.ok(!entry.failed);}
  else{
   assert.equal(entry.failed,true);assert.equal(store.visible(entry,mountedAt),undefined);override=v=>good(v.course,true,false);await store.read('course-a');assert.equal(store.visible(store.getSnapshot().entries.get('course-a'),mountedAt).saved,true);
   if(outcome==='timeout'){read.resolve(good('course-a',false,true));await flush();assert.equal(store.getSnapshot().entries.get('course-a').value.saved,true);}
  }
  const count=calls.length;await flush();assert.equal(calls.length,count);assert.equal(calls.filter(v=>v.op==='choice').length,writes.length);
 }finally{Date.now=originalNow;off();}
});
test('R2b other definitive codes PT409/22023/P0002 each start one state read with rejection retained',async()=>{
 for(const code of ['PT409','22023','P0002']){
  override=v=>good(v.course);await store.read('course-a');const before=calls.length;
  override=v=>v.op==='choice'?{ok:false,code,message:code+' rejected'}:good(v.course,false,true);
  assert.equal(await store.choose('course-a',true),false);await flush();assert.deepEqual(calls.slice(before).map(v=>v.op),['choice','choiceReads']);assert.equal(store.getSnapshot().entries.get('course-a').message,code+' rejected');assert.equal(store.getSnapshot().entries.get('course-a').value.saved,false);
 }
});
test('R2b late definitive failure after account switch/logout/A→B→A cannot start a read',async()=>{
 for(const transition of ['B',null,'A-again']){
  emit('A');override=v=>good(v.course);await store.read('course-a');const d=defer();override=()=>d.promise;const saving=store.choose('course-a',true);
  if(transition==='A-again'){emit('B');emit('A');}else emit(transition,transition?'SIGNED_IN':'SIGNED_OUT');
  const before=calls.length;d.resolve({ok:false,code:'42501',message:'old account'});assert.equal(await saving,false);await flush();assert.equal(calls.length,before);assert.equal(store.getSnapshot().entries.size,0);
 }
});
test('R2b account switch from a synchronous rejection subscriber also prevents the post-patch read',async()=>{
 await store.read('course-a');override=v=>v.op==='choice'?{ok:false,code:'42501',message:'rejected'}:good(v.course);
 const off=store.subscribe(()=>{const s=store.getSnapshot();if(s.viewer==='A'&&s.entries.get('course-a')?.message==='rejected')emit('B');});
 const before=calls.length;assert.equal(await store.choose('course-a',true),false);await flush();assert.deepEqual(calls.slice(before).map(v=>v.op),['choice']);assert.equal(store.getSnapshot().viewer,'B');assert.equal(store.getSnapshot().entries.size,0);off();
});