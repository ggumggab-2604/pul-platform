import assert from 'node:assert/strict';
import {readFileSync,existsSync,writeFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {beforeEach,afterEach,after,test} from 'node:test';
import ts from 'typescript';
const require=createRequire(import.meta.url),runtime=process.env.PUL_MESSAGING_TEST_RUNTIME??path.join(tmpdir(),'pul-messaging-ui-runtime');
const {JSDOM}=createRequire(path.join(runtime,'package.json'))('jsdom');
const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'http://localhost:3300/courses/local-field/messages/new',pretendToBeVisual:true});
for(const n of ['window','document','HTMLElement','FormData','Event','MouseEvent','Node'])Object.defineProperty(globalThis,n,{value:dom.window[n],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const React=require('react'),{act}=React,{createRoot}=require('react-dom/client'),{renderToStaticMarkup}=require('react-dom/server'),h=React.createElement;
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',C='33333333-3333-4333-8333-333333333333',M='44444444-4444-4444-8444-444444444444';
const at='2026-09-28T01:02:03.123456+00:00';
let actor=A,identity=A,allowed=true,type='field',count=2,calls=[],override=null,navigation=[],invalidated=[],root;
const listeners=new Set(),cache=new Map(),repo=fileURLToPath(new URL('../../../',import.meta.url));
const good=data=>({data,error:null}),bad=message=>({data:null,error:{message,...(message==='course_notification_permission'?{code:'42501'}:{})}});
const source=()=>({course_id:C,course_key:'local-'+type,name:'LOCAL '+type,course_type:type});
const receipt={id:M,created_at:at,recipient_count:2};
const summary={id:M,kind:'course_broadcast',counterpart_display:'PRIVATE',preview:'운영공지',at,read_at:null,is_reply:false};
const detail=(sender=false)=>({id:M,kind:'course_broadcast',body:'<script>privateLeak=true</script> 운영 안내',counterpart_user_id:null,counterpart_display:'PRIVATE',created_at:at,reply_to_message_id:null,is_recipient:!sender,read_at:sender?null:at,...(sender?{recipient_count:2}:{})});
async function rpc(name,args={}){
 calls.push({actor,name,args});if(override)return override(name,args);
 if(!allowed)return bad('course_notification_permission');
 if(name==='get_course_broadcast_source')return args.p_course_key===source().course_key?good(source()):bad('course_notification_permission');
 if(name==='preview_course_broadcast')return good({recipient_count:count,maximum:10000,can_send:count>0&&count<=10000});
 if(name==='send_course_broadcast')return good(receipt);
 if(name==='get_messaging_message')return good(detail(actor===A));
 if(name==='get_message_course_context')return good({available:true,...source(),secret:'SECRET'});
 if(name==='list_messaging_inbox'||name==='list_messaging_sent')return good({items:[summary],has_more:false,next_cursor:null});
 if(name==='mark_messaging_message_read')return good({id:M,read_at:at});
 throw Error('Unexpected RPC '+name);
}
const auth={getUser:async()=>({data:{user:identity?{id:identity}:null},error:null}),onAuthStateChange:fn=>{listeners.add(fn);return{data:{subscription:{unsubscribe:()=>listeners.delete(fn)}}};}};
const router={replace:p=>navigation.push(p),refresh:()=>navigation.push('refresh')};
function load(file){
 const absolute=path.resolve(repo,file);if(cache.has(absolute))return cache.get(absolute);const exports={};cache.set(absolute,exports);
 const output=ts.transpileModule(readFileSync(absolute,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 new Function('require','exports','module',output)(name=>{
  if(name==='server-only')return {};
  if(name==='@/lib/supabase/auth')return {getAuthenticatedSupabaseContext:async()=>actor?{userId:actor,supabase:{rpc}}:null};
  if(name==='@/lib/supabase/client')return {createClient:()=>({auth})};
  if(name==='next/navigation')return {useRouter:()=>router,redirect:href=>{throw Object.assign(Error('redirect'),{href});}};
  if(name==='next/cache')return {revalidatePath:(...args)=>invalidated.push(args)};
  if(name==='next/link')return {__esModule:true,default:({prefetch,children,...props})=>h('a',{...props,'data-prefetch':String(prefetch)},children)};
  if(name.startsWith('@/')||name.startsWith('.')){const base=name.startsWith('@/')?path.join(repo,'src',name.slice(2)):path.resolve(path.dirname(absolute),name);const target=[base+'.ts',base+'.tsx'].find(existsSync);assert.ok(target,name);return load(target);}
  return require(name);
 },exports,{exports});return exports;
}
const pages=load('src/components/messaging/CourseBroadcastPage.tsx'),composer=load('src/components/messaging/CourseBroadcastComposer.tsx'),actions=load('src/app/courses/broadcastActions.ts'),domain=load('src/lib/messaging/messaging.ts'),mailPages=load('src/components/messaging/MessagingPages.tsx'),views=load('src/components/messaging/MessagingViews.tsx');
const {MessagingSessionBoundary}=load('src/components/messaging/MessagingSessionBoundary.tsx');
const host=document.getElementById('root'),errors=[],originalError=console.error;console.error=(...args)=>errors.push(args.join(' '));
async function unmount(){if(root){await act(async()=>root.unmount());root=null;}}
async function mount(node){await unmount();root=createRoot(host);await act(async()=>root.render(node));}
const button=text=>[...host.querySelectorAll('button')].find(x=>x.textContent===text);
const click=el=>{assert.ok(el);return act(async()=>el.dispatchEvent(new MouseEvent('click',{bubbles:true})));};
const submit=()=>act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
async function value(text){const el=host.querySelector('textarea');await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set.call(el,text);el.dispatchEvent(new Event('input',{bubbles:true}));});}
const emit=async next=>{actor=identity=next;await act(async()=>{for(const fn of listeners)fn(next?'SIGNED_IN':'SIGNED_OUT',next?{user:{id:next}}:null);});};
const newPage=()=>pages.CourseBroadcastNewPage({params:Promise.resolve({id:'local-'+type})});
const sendCalls=()=>calls.filter(c=>c.name==='send_course_broadcast');
beforeEach(async()=>{await unmount();actor=identity=A;allowed=true;type='field';count=2;calls=[];override=null;navigation=[];invalidated=[];Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});});
afterEach(()=>assert.deepEqual(errors.splice(0),[],'No React errors'));
after(async()=>{await unmount();dom.window.close();console.error=originalError;});

for(const venue of ['field','screen'])test(`${venue}: exact-course entry, direct URL checks, canonical source and operational-only copy`,async()=>{
 type=venue;await mount(await pages.CourseBroadcastEntry({courseKey:'local-'+type}));assert.equal(host.querySelector('a').getAttribute('href'),'/courses/local-'+type+'/messages/new');
 await mount(await newPage());assert.match(host.textContent,new RegExp(venue==='field'?'필드':'스크린'));assert.match(host.textContent,/휴장·운영시간 변경·시설 점검/);assert.match(host.textContent,/광고에는 사용할 수 없습니다/);assert.equal(host.querySelector('textarea')!==null,true);
 await mount(await pages.CourseBroadcastNewPage({params:Promise.resolve({id:'wrong-course'})}));assert.equal(host.querySelector('textarea'),null);assert.ok(host.querySelector('[role="alert"]'));
 allowed=false;assert.equal(await pages.CourseBroadcastEntry({courseKey:'local-'+type}),null);await mount(await newPage());assert.equal(host.querySelector('textarea'),null);assert.doesNotMatch(host.textContent,/LOCAL|예상 수신자/);
 actor=null;assert.equal(await pages.CourseBroadcastEntry({courseKey:'local-'+type}),null);await assert.rejects(newPage(),e=>e.href==='/login?next='+encodeURIComponent('/courses/local-'+type+'/messages/new'));
});

test('confirmation, refreshed preview, pending double submit, narrow payload and Sent detail navigation',async()=>{
 await mount(await newPage());await value(' 안내 ');await submit();assert.equal(sendCalls().length,0);await click(host.querySelector('input'));count=3;await click(button('수신 대상 수 다시 확인'));assert.equal(host.querySelector('input').checked,false);assert.match(host.textContent,/예상 수신자 3명/);
 await click(host.querySelector('input'));let release;override=()=>new Promise(resolve=>release=resolve);await submit();await submit();assert.equal(sendCalls().length,1);assert.equal(host.querySelector('textarea').disabled,true);
 await act(async()=>release(good(receipt)));assert.ok(navigation.includes('/messages/'+M));assert.deepEqual(Object.keys(sendCalls()[0].args).sort(),['p_body','p_course_id','p_request_id']);assert.equal(sendCalls()[0].args.p_body,'안내');assert.equal(sendCalls()[0].args.p_course_id,C);assert.deepEqual(invalidated,[['/messages','layout']]);
});

test('lost response preserves request ID/body; definite failure permits changed body as a fresh request',async()=>{
 await mount(await newPage());await value('first');await click(host.querySelector('input'));override=()=>{throw Error('network lost');};await submit();const first=sendCalls()[0].args;assert.equal(host.querySelector('textarea').disabled,true);assert.ok(button('같은 요청 다시 확인'));
 override=()=>good(receipt);await submit();assert.deepEqual(sendCalls()[1].args,first);
 override=null;await mount(await newPage());await value('old');await click(host.querySelector('input'));override=()=>bad('messaging_quota');await submit();const old=sendCalls().at(-1).args;
 await value('changed');await click(host.querySelector('input'));override=()=>good(receipt);await submit();assert.notEqual(sendCalls().at(-1).args.p_request_id,old.p_request_id);assert.equal(sendCalls().at(-1).args.p_body,'changed');
});

test('zero/over-limit preview disables sends; audience/revocation/quota errors remain safe and visible',async()=>{
 for(const n of [0,10001]){count=n;await mount(await newPage());await value('test');await click(host.querySelector('input'));await submit();assert.equal(sendCalls().length,0);assert.equal(button('운영공지 발송').disabled,true);}
 count=2;for(const error of ['messaging_broadcast_audience','course_notification_permission','messaging_quota','messaging_cooldown','SECRET token database']){
  override=null;await mount(await newPage());await value('test');await click(host.querySelector('input'));override=()=>bad(error);await submit();assert.ok(host.querySelector('[role="alert"]'));assert.doesNotMatch(host.textContent,/SECRET token database/);
  if(error==='course_notification_permission'){assert.match(host.querySelector('[role="alert"]').textContent,/권한/);assert.equal(host.querySelector('textarea').disabled,false);}
 }
});

test('server action rejects stale viewer and unauthenticated callers before RPC; allowlists body/course/request',async()=>{
 actor=B;assert.equal((await actions.sendCourseBroadcastAction(A,{courseId:C,body:'test',requestId:M})).code,'permission');assert.equal(calls.length,0);
 actor=null;assert.equal((await actions.previewCourseBroadcastAction(A,C)).code,'login');assert.equal(calls.length,0);
 actor=A;assert.equal((await actions.sendCourseBroadcastAction(A,{courseId:C,body:' test ',requestId:M,senderId:B,recipientIds:[B],purpose:'marketing'})).ok,true);
 assert.deepEqual(calls[0].args,{p_course_id:C,p_body:'test',p_request_id:M});
});

test('account switch/logout removes draft and ignores stale completion; same-account refresh retains retry',async()=>{
 for(const next of [B,null]){
  actor=identity=A;override=null;await mount(await newPage());await value('PRIVATE DRAFT');await click(host.querySelector('input'));let release;override=()=>new Promise(resolve=>release=resolve);await submit();await emit(next);assert.equal(host.querySelector('textarea'),null);navigation=[];await act(async()=>release(good(receipt)));assert.deepEqual(navigation,[]);
 }
 actor=identity=A;override=null;await mount(await newPage());await value('KEEP');await click(host.querySelector('input'));override=()=>bad('unknown');await submit();const req=sendCalls().at(-1).args;await emit(A);assert.equal(host.querySelector('textarea').value,'KEEP');override=()=>good(receipt);await submit();assert.deepEqual(sendCalls().at(-1).args,req);
});

test('new course destroys pending draft and request without stale navigation',async()=>{
 const props=id=>({viewerId:A,source:{courseId:id,courseKey:'local-field',name:'LOCAL',courseType:'field'},initialPreview:{recipientCount:2,maximum:10000,canSend:true}});
 const view=id=>h(MessagingSessionBoundary,{key:id,viewerId:A},h(composer.CourseBroadcastComposer,{...props(id),key:id}));
 await mount(view(C));await value('OLD');await click(host.querySelector('input'));let release;override=()=>new Promise(resolve=>release=resolve);await submit();const req=sendCalls().at(-1).args;
 await act(async()=>root.render(view(M)));assert.equal(host.querySelector('textarea').value,'');await act(async()=>release(good(receipt)));assert.equal(navigation.length,0);
 override=()=>good(receipt);await value('NEW');await click(host.querySelector('input'));await submit();assert.equal(sendCalls().at(-1).args.p_course_id,M);assert.notEqual(sendCalls().at(-1).args.p_request_id,req.p_request_id);
});

test('Inbox/Sent and detail render safe body/source; sender gets actual count, recipient gets no subscriber details',async()=>{
 for(const who of [A,B]){
  actor=identity=who;const element=await mailPages.DetailPage({params:Promise.resolve({messageId:M})});renderToStaticMarkup(element);assert.equal(calls.filter(c=>c.name==='mark_messaging_message_read').length,0);await mount(element);
  assert.match(host.textContent,/장소 운영공지/);assert.match(host.textContent,/할인·광고 수신동의가 아닙니다/);assert.equal(host.querySelector('script'),null);assert.equal(host.querySelector('a[href="/courses/local-field"]')!==null,true);assert.doesNotMatch(host.textContent,/PRIVATE|SECRET/);assert.equal(button('답장'),undefined);assert.equal(button('이 회원 차단'),undefined);
  assert.equal(host.textContent.includes('2명에게 발송'),who===A);assert.equal(!!button('신고'),who===B);
  await mount(await mailPages.MailboxPage({box:who===A?'sent':'inbox',searchParams:Promise.resolve({})}));assert.match(host.textContent,/장소 운영공지/);assert.equal(host.querySelector('a[href="/messages/'+M+'"]')!==null,true);
 }
 override=name=>good(name==='get_messaging_message'?detail(false):{available:false,name:'SECRET',course_key:'SECRET'});await mount(await mailPages.DetailPage({params:Promise.resolve({messageId:M})}));assert.match(host.textContent,/현재 장소 정보를 확인할 수 없습니다/);assert.equal(host.querySelector('a[href^="/courses/"]'),null);assert.doesNotMatch(host.textContent,/SECRET/);
});

test('DTO/input boundaries reject malformed sources/UUIDs/counts and never return private extra fields',async()=>{
 const client=data=>({rpc:async()=>good(data)});
 for(const raw of [{...source(),course_key:'javascript:bad'},{...source(),course_type:'future'},{...source(),course_id:'bad'},{...source(),name:'x'.repeat(121)}])await assert.rejects(domain.getCourseBroadcastSource(client(raw),'local-field'));
 for(const input of [null,{courseId:'bad',body:'x',requestId:M},{courseId:C,body:' ',requestId:M},{courseId:C,body:'가'.repeat(2001),requestId:M},{courseId:C,body:'x',requestId:'bad'}])await assert.rejects(domain.sendCourseBroadcast(client(receipt),input));
 for(const n of [-1,1.1,10002,'1'])await assert.rejects(domain.previewCourseBroadcast(client({recipient_count:n,maximum:10000,can_send:true}),C));
 const ctx=await domain.getMessageCourseContext(client({available:true,...source(),subscriber_ids:[B],phone:'SECRET'}),M);assert.deepEqual(Object.keys(ctx).sort(),['available','courseKey','courseType','name']);
 assert.equal('recipientCount' in await domain.getMessage(client({...detail(false),recipient_count:100}),M),false);
 await assert.rejects(domain.getMessage(client({...detail(true),recipient_count:0}),M));
});

test('export mounted Field/Screen compose and own mailbox states for visual checks',async()=>{
 const out=path.join(tmpdir(),'pul-course-broadcast-ui');mkdirSync(out,{recursive:true});
 for(const venue of ['field','screen']){
  type=venue;await mount(await newPage());await value('시설 점검으로 내일 휴장합니다. '.repeat(5)+'https://example.invalid/'+ 'long'.repeat(30));writeFileSync(path.join(out,venue+'-compose.html'),host.innerHTML);
  count=0;await mount(await newPage());writeFileSync(path.join(out,venue+'-empty.html'),host.innerHTML);count=2;
 }
 actor=identity=A;await mount(await mailPages.DetailPage({params:Promise.resolve({messageId:M})}));writeFileSync(path.join(out,'sender-detail.html'),host.innerHTML);
 actor=identity=B;await mount(await mailPages.DetailPage({params:Promise.resolve({messageId:M})}));writeFileSync(path.join(out,'recipient-detail.html'),host.innerHTML);
 await mount(h(views.MailboxView,{box:'sent',page:{items:[await domain.listMessageSent({rpc}).then(p=>p.items[0])],hasMore:false,nextCursor:null}}));writeFileSync(path.join(out,'sent.html'),host.innerHTML);
 console.log('Local mocked mounted HTML artifacts:',out);
});
