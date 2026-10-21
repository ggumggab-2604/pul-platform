import assert from 'node:assert/strict';
import {test,beforeEach,afterEach,after} from 'node:test';
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const repo=fileURLToPath(new URL('../../../',import.meta.url));
const require=createRequire(path.join(repo,'package.json'));
const {JSDOM}=createRequire(path.join(process.env.PUL_MARKET_TEST_RUNTIME,'package.json'))('jsdom');
const dom=new JSDOM('<div id="root"></div>',{url:'http://127.0.0.1/notices'});
for(const k of ['window','document','HTMLElement','Event','MouseEvent','Node'])Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const React=require('react'),{act}=React,{createRoot}=require('react-dom/client'),ts=require('typescript');
let reduced=false,visible=true,root,timers=new Map(),seq=0;const motion=new Set(),cache=new Map();
Object.defineProperty(document,'visibilityState',{get:()=>visible?'visible':'hidden',configurable:true});
window.matchMedia=()=>({matches:reduced,addEventListener:(e,cb)=>motion.add(cb),removeEventListener:(e,cb)=>motion.delete(cb)});
window.setTimeout=(fn,delay)=>{const id=++seq;timers.set(id,{fn,delay});return id;};window.clearTimeout=id=>timers.delete(id);
function load(file){
 const absolute=path.resolve(repo,file);if(cache.has(absolute))return cache.get(absolute);const exports={};cache.set(absolute,exports);
 const code=ts.transpileModule(readFileSync(absolute,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 new Function('require','exports','module',code)(name=>{
  if(name.endsWith('.module.css'))return{__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})};
  if(name==='next/link')return{__esModule:true,default:({prefetch,...props})=>{assert.equal(prefetch,false,'No automatic link prefetch');return React.createElement('a',props);}};
  if(name.startsWith('@/')||name.startsWith('.')){const base=name.startsWith('@/')?path.join(repo,'src',name.slice(2)):path.resolve(path.dirname(absolute),name);return load([base+'.ts',base+'.tsx'].find(existsSync));}
  return require(name);
 },exports,{exports});return exports;
}
const host=document.querySelector('#root');
const items=[1,2,3].map(n=>({post_key:'notice-'+n,title:'공지 '+n,body:'본문',pinned:true,author_display_name:'작성자 '+n,category:n===2?'lost':'free',created_at:'2026-10-'+(20-n),comment_count:n}));
function view(notices,kind='strip'){
 if(kind==='strip'){const {CourseNoticeStrip}=load('src/components/courses/detail/CourseNoticeStrip.tsx');return React.createElement(CourseNoticeStrip,{courseKey:'local',notices});}
 const {CourseStoryNotices}=load('src/components/courses/detail/CourseStoryNotices.tsx');
 return React.createElement(CourseStoryNotices,{notices,renderNotice:p=>React.createElement('li',null,React.createElement('a',{href:'/courses/local/stories/'+p.post_key},p.title),React.createElement('p',null,p.author_display_name+' · '+p.category+' · '+p.created_at+' · 댓글 '+p.comment_count))});
}
async function render(notices,kind='strip'){root=createRoot(host);await act(async()=>root.render(view(notices,kind)));}
const active=()=>host.querySelector('[data-state="current"] a');
const pointer=(type,pointerType='mouse')=>{const event=new MouseEvent(type,{bubbles:true});Object.defineProperty(event,'pointerType',{value:pointerType});return event;};
function assertInactiveInert(){for(const e of host.querySelectorAll('[data-state]:not([data-state="current"])')){assert.equal(e.getAttribute('aria-hidden'),'true');assert.ok(e.hasAttribute('inert'));}}

async function advance(){assert.equal(timers.size,1);const [id,timer]=[...timers][0];timers.delete(id);await act(async()=>timer.fn());}
async function click(name){const b=host.querySelector('button[aria-label="'+name+'"]');assert.ok(b,name);await act(async()=>b.click());}
const errors=[],original=console.error;console.error=(...v)=>errors.push(v.join(' '));
beforeEach(()=>{reduced=false;visible=true;timers.clear();cache.clear();});
afterEach(async()=>{if(root){await act(async()=>root.unmount());root=null;}assert.equal(timers.size,0);assert.deepEqual(errors.splice(0),[]);});
after(()=>{console.error=original;dom.window.close();});
test('zero and one notice render no carousel controls or timers',async()=>{
 await render([]);assert.equal(host.textContent,'');assert.equal(timers.size,0);await act(async()=>root.unmount());root=null;
 await render(items.slice(0,1));assert.equal(host.querySelectorAll('a').length,1);assert.equal(host.querySelectorAll('button').length,0);assert.equal(timers.size,0);
});
test('multiple notices advance at readable intervals and expose exactly one link',async()=>{
 await render(items);assert.equal([...timers.values()][0].delay,6000);assert.equal(active().getAttribute('href'),'/courses/local/stories/notice-1');
 await advance();assert.equal(host.querySelectorAll('[data-state="current"] a').length,1);assert.equal(active().textContent,'공지 2');assertInactiveInert();
});
test('hover, focus and document inactivity pause automatic changes',async()=>{
 await render(items);const strip=host.firstElementChild;
 await act(async()=>strip.dispatchEvent(pointer('pointerover')));assert.equal(timers.size,0);
 await act(async()=>strip.dispatchEvent(pointer('pointerout')));assert.equal(timers.size,1);
 await act(async()=>active().focus());assert.equal(timers.size,0);
 await act(async()=>active().blur());assert.equal(timers.size,1);
 await act(async()=>{visible=false;document.dispatchEvent(new Event('visibilitychange'));});assert.equal(timers.size,0);
 await act(async()=>{visible=true;document.dispatchEvent(new Event('visibilitychange'));});assert.equal(timers.size,1);
});
test('explicit pause persists; next remains available; play resumes',async()=>{
 await render(items);await click('공지 자동 전환 일시정지');assert.equal(timers.size,0);await click('다음 공지');assert.equal(active().textContent,'공지 2');assert.equal(timers.size,0);
 await click('공지 자동 전환 재생');assert.equal(timers.size,1);
});
test('reduced motion defaults to manual browsing without automatic movement',async()=>{
 reduced=true;await render(items);assert.equal(timers.size,0);assert.ok(host.querySelector('button[aria-label="공지 자동 전환 재생"]'));
 await click('다음 공지');assert.equal(active().textContent,'공지 2');assert.equal(timers.size,0);
});
test('long titles remain complete and receive more than six seconds',async()=>{
 const title='긴 제목을 읽을 수 있게 자연스럽게 줄바꿈합니다. '.repeat(20);await render([{...items[0],title},items[1]]);
 assert.equal(active().textContent,title);assert.ok([...timers.values()][0].delay>6000);
});

test('story notice rotates the whole title, metadata and destination together, wraps, and keeps hidden slides inert',async()=>{
 await render(items,'story');
 for(const index of [0,1,2,0]){
  const p=items[index],slide=host.querySelector('[data-state="current"]');
  assert.equal(active().textContent,p.title);assert.equal(active().getAttribute('href'),'/courses/local/stories/'+p.post_key);
  assert.equal(slide.querySelector('p').textContent,p.author_display_name+' · '+p.category+' · '+p.created_at+' · 댓글 '+p.comment_count);
  assertInactiveInert();await advance();
 }
});
test('story zero/one boundaries create no empty carousel or playback controls',async()=>{
 await render([],'story');assert.equal(host.textContent,'');assert.equal(timers.size,0);await act(async()=>root.unmount());root=null;
 await render(items.slice(0,1),'story');assert.equal(host.querySelectorAll('a').length,1);assert.equal(host.querySelectorAll('button').length,0);assert.equal(timers.size,0);
});
test('pointer-down blocks even a previously queued tick until release, in both presentations',async()=>{
 for(const kind of ['strip','story']){
  await render(items,kind);const first=active().getAttribute('href'),queued=[...timers.values()][0].fn;
  await act(async()=>active().dispatchEvent(pointer('pointerdown','touch')));assert.equal(timers.size,0);
  await act(async()=>queued());assert.equal(active().getAttribute('href'),first,'touch destination remains the pressed notice');
  await act(async()=>document.dispatchEvent(pointer('pointercancel','touch')));assert.equal(timers.size,1);
  await advance();assert.notEqual(active().getAttribute('href'),first);
  await act(async()=>root.unmount());root=null;assert.equal(timers.size,0);
 }
});
test('top and story playback stay independent and explicit pause survives focus/visibility changes',async()=>{
 root=createRoot(host);await act(async()=>root.render(React.createElement(React.Fragment,null,view(items),view(items,'story'))));assert.equal(timers.size,2);
 await click('다음 공지');assert.equal(host.querySelectorAll('[data-state="current"] a')[0].textContent,'공지 2');assert.equal(host.querySelectorAll('[data-state="current"] a')[1].textContent,'공지 1');
 await click('공지 자동 전환 일시정지');assert.equal(timers.size,1);
 await act(async()=>{visible=false;document.dispatchEvent(new Event('visibilitychange'));});assert.equal(timers.size,0);
 await act(async()=>{visible=true;document.dispatchEvent(new Event('visibilitychange'));});assert.equal(timers.size,1);assert.ok(host.querySelector('button[aria-label="공지 자동 전환 재생"]'));
});
