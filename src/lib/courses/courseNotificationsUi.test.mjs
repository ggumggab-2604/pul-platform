import assert from 'node:assert/strict';
import {readFileSync,existsSync,writeFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {beforeEach,afterEach,after,test} from 'node:test';
import ts from 'typescript';
const require=createRequire(import.meta.url), runtime=process.env.PUL_MESSAGING_TEST_RUNTIME??path.join(tmpdir(),'pul-messaging-ui-runtime');
const {JSDOM}=createRequire(path.join(runtime,'package.json'))('jsdom');
const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'http://localhost:3300/courses/local-field',pretendToBeVisual:true});
for(const n of ['window','document','HTMLElement','Event','MouseEvent','Node'])Object.defineProperty(globalThis,n,{value:dom.window[n],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const React=require('react'),{act}=React,{createRoot}=require('react-dom/client'),h=React.createElement;
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
let identity=A,serverActor=A,rows=new Map(),calls=[],override=null,authOverride=null,root;
const consoleErrors=[],originalError=console.error;console.error=(...args)=>consoleErrors.push(args.join(' '));
const listeners=new Set(),cache=new Map(),repo=fileURLToPath(new URL('../../../',import.meta.url));
const raw=(key,subscribed=false,available=true)=>({course_key:key,subscribed,available});
const good=data=>({data,error:null}),bad=message=>({data:null,error:{message}});
async function rpc(name,args){
 const who=serverActor;calls.push({who,name,args});if(override)return override(name,args,who);
 const id=who+':'+args.p_course_key;
 if(name==='get_course_notification_subscription')return good(rows.get(id)??raw(args.p_course_key));
 if(name==='set_course_notification_subscription'){const next=raw(args.p_course_key,args.p_enabled,rows.get(id)?.available??true);rows.set(id,next);return good(next);}
 if(name==='list_my_course_notification_subscriptions')return good({items:[...rows].filter(([id,v])=>id.startsWith(who+':')&&v.subscribed).map(([,v])=>({...v,name:v.available?'테스트 장소':null,course_type:v.available?'field':null})),next_cursor:null});
 throw Error('unexpected RPC');
}
const auth={getUser:()=>authOverride?authOverride():Promise.resolve({data:{user:identity?{id:identity}:null},error:null}),onAuthStateChange:fn=>{listeners.add(fn);return {data:{subscription:{unsubscribe:()=>listeners.delete(fn)}}};}};
function load(file){
 const absolute=path.resolve(repo,file);if(cache.has(absolute))return cache.get(absolute);const exports={};cache.set(absolute,exports);
 const output=ts.transpileModule(readFileSync(absolute,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 new Function('require','exports','module',output)(name=>{
  if(name==='server-only')return {};
  if(name==='@/lib/supabase/client')return {createClient:()=>({auth})};
  if(name==='@/lib/supabase/auth')return {getAuthenticatedSupabaseContext:async()=>serverActor?{userId:serverActor,supabase:{rpc}}:null};
  if(name==='next/navigation')return {useRouter:()=>({push(){}})};
  if(name==='next/link')return {__esModule:true,default:({prefetch,children,...props})=>h('a',{...props,'data-prefetch':String(prefetch)},children)};
  if(name==='@/hooks/useAuthSessionStatus')return {useAuthSessionStatus:()=>identity?'signedIn':'signedOut'};
  const omitted={'@/components/courses/CourseInformationReportDialog':'CourseInformationReportDialog','@/components/courses/detail/CourseActivityPhotoSection':'CourseActivityPhotoSection','@/components/courses/detail/CourseClubsSection':'CourseClubsSection'};
  if(omitted[name])return {[omitted[name]]:()=>null};
  if(name.startsWith('@/')||name.startsWith('.')){const base=name.startsWith('@/')?path.join(repo,'src',name.slice(2)):path.resolve(path.dirname(absolute),name);const target=[base+'.ts',base+'.tsx'].find(existsSync);assert.ok(target,name);return load(target);}
  return require(name);
 },exports,{exports});return exports;
}
const ui=load('src/components/courses/CourseNotificationSubscription.tsx'),actions=load('src/app/courses/notificationActions.ts'),domain=load('src/lib/courses/courseNotifications.ts');
const detail=load('src/components/courses/detail/CourseDirectoryDetailContent.tsx');
const host=document.getElementById('root');
async function unmount(){if(root){await act(async()=>root.unmount());root=null;}}
async function mount(node){await unmount();root=createRoot(host);await act(async()=>root.render(node));}
const button=text=>[...host.querySelectorAll('button')].find(x=>x.textContent===text);
const click=el=>{assert.ok(el);return act(async()=>el.dispatchEvent(new MouseEvent('click',{bubbles:true})));};
const emit=async(id,event='SIGNED_IN')=>{identity=serverActor=id;await act(async()=>{for(const fn of listeners)fn(event,id?{user:{id}}:null);});};
const course=type=>({courseKey:'local-'+type,name:'테스트 '+(type==='field'?'필드':'스크린')+' 파크골프장',courseType:type,region:'서울',city:'TEST 시',address:'서울 TEST 주소',holes:18,operatingHours:'09:00–18:00',operation:'reservation',phone:'02-000-0000',parkingAvailable:true,featureCodes:[],description:'TEST 장소 소개',reservationUrl:'https://example.invalid/reserve',reservationGuide:'공식 예약 안내문',feeGuide:'현장 문의',latitude:null,longitude:null});
const full=type=>h(detail.CourseDirectoryDetailContent,{course:course(type),expectedType:type,initialMedia:{items:[]},initialCourseClubs:[]});
beforeEach(async()=>{await unmount();identity=serverActor=A;rows=new Map();calls=[];override=authOverride=null;Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});});
afterEach(()=>assert.deepEqual(consoleErrors.splice(0),[],'No React errors or duplicate-key warnings'));
after(async()=>{await unmount();dom.window.close();console.error=originalError;});

for(const type of ['field','screen']){
 test(`${type}: real detail integration, signed-out internal login return and unchanged reservation/map controls`,async()=>{
  identity=serverActor=null;await mount(full(type));const login=host.querySelector('a[href^="/login?"]');assert.equal(login.getAttribute('href'),'/login?next='+encodeURIComponent('/courses/local-'+type));assert.equal(calls.length,0);
  assert.match(host.textContent,/할인·광고 수신동의가 아닙니다/);assert.ok(host.querySelector('a[href="https://example.invalid/reserve"]'));assert.match(host.textContent,/공식 예약 안내문/);assert.ok(host.querySelector('a[href^="https://map.kakao.com/"]'));
 });
 test(`${type}: explicit subscribe/unsubscribe; repeated render never auto-subscribes`,async()=>{
  await mount(full(type));assert.ok(button('운영알림 받기'));assert.equal(calls.filter(x=>x.name.startsWith('set_')).length,0);
  await click(button('운영알림 받기'));assert.match(host.textContent,/운영알림 받는 중/);assert.ok(button('알림 해제'));await click(button('알림 해제'));assert.match(host.textContent,/알림 안 받는 중/);
  for(const call of calls.filter(x=>x.name.startsWith('set_')))assert.deepEqual(Object.keys(call.args).sort(),['p_course_key','p_enabled']);
 });
 test(`${type}: pending disables double submit; same-account token refresh preserves request/state`,async()=>{
  await mount(full(type));let release;override=(name,args)=>new Promise(resolve=>{release=()=>resolve(good(raw(args.p_course_key,true)));});const btn=button('운영알림 받기');await click(btn);assert.equal(btn.disabled,true);await click(btn);await emit(A,'TOKEN_REFRESHED');assert.equal(calls.filter(x=>x.name.startsWith('set_')).length,1);await act(async()=>release());assert.ok(button('알림 해제'));
 });
 test(`${type}: safe error, retry and no internal database details`,async()=>{
  override=()=>bad('SECRET email database failure');await mount(full(type));assert.ok(host.querySelector('[role="alert"]'));assert.doesNotMatch(host.textContent,/SECRET|email/);override=null;await click(button('다시 확인'));assert.ok(button('운영알림 받기'));override=()=>bad('SECRET');await click(button('운영알림 받기'));assert.ok(button('운영알림 받기'));assert.ok(host.querySelector('[role="alert"]'));
 });
}
test('logout/account switch destroys private state and ignores stale mutation completion',async()=>{
 await mount(h(ui.CourseNotificationSubscription,{courseKey:'local-field'}));let release;override=(name,args)=>name.startsWith('set_')?new Promise(resolve=>{release=()=>resolve(good(raw(args.p_course_key,true)));}):Promise.resolve(good(raw(args.p_course_key)));
 await click(button('운영알림 받기'));await emit(B);assert.ok(button('운영알림 받기'));await act(async()=>release());assert.ok(button('운영알림 받기'));assert.equal(button('알림 해제'),undefined);
 await emit(null,'SIGNED_OUT');assert.ok(host.querySelector('a[href^="/login?"]'));assert.equal(host.querySelector('button'),null);
});
test('stale initial read cannot overwrite new account; server action rejects identity switch before mutation',async()=>{
 let release;override=(name,args,who)=>who===A?new Promise(resolve=>{release=()=>resolve(good(raw(args.p_course_key,true)));}):Promise.resolve(good(raw(args.p_course_key)));
 await mount(h(ui.CourseNotificationSubscription,{courseKey:'local-field'}));await emit(B);await act(async()=>release());assert.ok(button('운영알림 받기'));const before=calls.length;const rejected=await actions.setCourseNotificationAction(A,'local-field',true);assert.equal(rejected.ok,false);assert.equal(calls.length,before);
});
test('auth verification error conceals state; same-account recovery preserves it; server signout clears it',async()=>{
 rows.set(A+':local-field',raw('local-field',true));await mount(h(ui.CourseNotificationSubscription,{courseKey:'local-field'}));authOverride=()=>Promise.reject(Error('offline'));await act(async()=>window.dispatchEvent(new Event('focus')));assert.ok(host.querySelector('[hidden][inert]'));assert.ok(host.querySelector('[role="alert"]'));authOverride=null;await click(button('다시 확인'));assert.equal(host.querySelector('[hidden]'),null);assert.ok(button('알림 해제'));
 await act(async()=>window.dispatchEvent(new Event('pul-auth-signed-out')));assert.equal(button('알림 해제'),undefined);
});
test('own list withdraws unavailable source without exposing metadata; empty and error states',async()=>{
 rows.set(A+':local-field',raw('local-field',true,false));rows.set(B+':local-other',raw('local-other',true));await mount(h(ui.MyCourseNotifications));assert.match(host.textContent,/현재 공개되지 않은 장소/);assert.equal(host.querySelector('a[href^="/courses/"]'),null);await click(button('알림 해제'));assert.match(host.textContent,/신청한 운영알림이 없습니다/);
 override=()=>bad('SECRET');await mount(h(ui.MyCourseNotifications));assert.ok(button('다시 확인'));override=null;await click(button('다시 확인'));assert.match(host.textContent,/신청한 운영알림이 없습니다/);
});
test('domain input validation and privacy projection discard unexpected response data',async()=>{
 const client={rpc};await assert.rejects(domain.setCourseNotificationSubscription(client,'//evil',true));await assert.rejects(domain.setCourseNotificationSubscription(client,'local-field','yes'));
 override=()=>good({...raw('local-field',true),email:'SECRET',user_id:B});assert.deepEqual(await domain.getCourseNotificationSubscription(client,'local-field'),{courseKey:'local-field',subscribed:true,available:true});
 override=()=>good(raw('wrong-course',true));await assert.rejects(domain.getCourseNotificationSubscription(client,'local-field'));
 override=()=>good({items:[{...raw('local-field',true,false),name:'SECRET',course_type:'field'}],next_cursor:null});await assert.rejects(domain.listMyCourseNotificationSubscriptions(client));
});
test('own list pagination is bounded and deduplicated; account switch discards a delayed previous page',async()=>{
 let release;
 const item=k=>({...raw(k,true),name:k,course_type:'field'});
 override=(name,args,who)=>{
  if(who===B)return good({items:[],next_cursor:null});
  if(args.p_after_course_key)return new Promise(resolve=>{release=()=>resolve(good({items:[item('local-b')],next_cursor:null}));});
  return good({items:[item('local-a')],next_cursor:'local-a'});
 };
 await mount(h(ui.MyCourseNotifications));await click(button('더 보기'));assert.equal(button('더 보기').disabled,true);await emit(B);await act(async()=>release());assert.match(host.textContent,/신청한 운영알림이 없습니다/);assert.doesNotMatch(host.textContent,/local-a|local-b/);
});
test('StrictMode obsolete initial list response cannot restore an unsubscribed row',async()=>{
 const releases=[];override=()=>new Promise(resolve=>releases.push(resolve));
 await mount(h(React.StrictMode,null,h(ui.MyCourseNotifications)));
 assert.equal(releases.length,2);
 await act(async()=>releases[1](good({items:[],next_cursor:null})));
 await act(async()=>releases[0](good({items:[{...raw('obsolete',true),name:'obsolete',course_type:'field'}],next_cursor:null})));
 assert.match(host.textContent,/신청한 운영알림이 없습니다/);assert.doesNotMatch(host.textContent,/obsolete/);
});
test('export actual mounted Field/Screen detail states for responsive verification',async()=>{
 const out=process.env.PUL_COURSE_NOTIFICATION_ARTIFACTS??path.join(tmpdir(),'pul-course-notifications-ui');mkdirSync(out,{recursive:true});
 for(const type of ['field','screen'])for(const state of ['signed-out','unsubscribed','subscribed','error','pending']){
  identity=serverActor=state==='signed-out'?null:A;rows=new Map();override=null;
  if(state==='subscribed')rows.set(A+':local-'+type,raw('local-'+type,true));
  if(state==='error')override=()=>bad('test failure');
  if(state==='pending')override=()=>new Promise(()=>{});
  await mount(full(type));writeFileSync(path.join(out,`${type}-${state}.html`),host.innerHTML);
 }
 console.log('Actual mounted detail exports: '+out);
});
