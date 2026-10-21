import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test,beforeEach,afterEach,after} from 'node:test';
import ts from 'typescript';
const require=createRequire(import.meta.url),runtime=process.env.PUL_MARKET_TEST_RUNTIME;
const {JSDOM}=runtime?createRequire(path.join(runtime,'package.json'))('jsdom'):require('jsdom');
const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://local.example/courses/map'});
for(const n of ['window','document','HTMLElement','HTMLDialogElement','Event','MouseEvent','Node'])Object.defineProperty(globalThis,n,{value:dom.window[n],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
globalThis.ResizeObserver=class{observe(){}disconnect(){}};
globalThis.requestAnimationFrame=callback=>{callback(0);return 0;};
HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
window.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
window.history.back=()=>{window.history.replaceState({},'','/courses/map');window.dispatchEvent(new dom.window.PopStateEvent('popstate'));};
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const React=require('react'),{act}=React,{createRoot}=require('react-dom/client'),h=React.createElement;
const repo=fileURLToPath(new URL('../../../',import.meta.url)),cache=new Map();
let root,requests=[],maps=[],overlays=[],reply,ready=true,scriptReady=[];
const savedKey=process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY;
const host=document.getElementById('root'),gumi={name:'구미파크골프장',address:'경상북도 구미시 고아읍 괴평리 1123',latitude:36.142719,longitude:128.373212,destinationKind:'facility'};
const address={name:'LOCAL 주소 시험 구장',address:'서울 마포구 하늘공원로 100',latitude:null,longitude:null,destinationKind:null};
const sdkResult=query=>[{address_name:query,address_type:'ROAD_ADDR',x:'126.87928',y:'37.569621'}];
function load(file){
 const absolute=path.resolve(repo,file);if(cache.has(absolute))return cache.get(absolute);const exports={};cache.set(absolute,exports);
 const code=ts.transpileModule(readFileSync(absolute,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 new Function('require','exports','module',code)(name=>{
  if(name.endsWith('.module.css'))return{__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})};
  if(name==='next/script')return{__esModule:true,default:function Script(props){const initial=React.useRef(props);React.useEffect(()=>{const notify=()=>initial.current.onReady?.();if(initial.current.id==='pul-kakao-map-sdk')scriptReady.push(notify);if(ready)notify();},[]);return null;}};
  if(name.startsWith('@/')||name.startsWith('.')){const base=name.startsWith('@/')?path.join(repo,'src',name.slice(2)):path.resolve(path.dirname(absolute),name);const target=[base+'.ts',base+'.tsx'].find(existsSync);assert.ok(target,name);return load(target);}
  return require(name);
 },exports,{exports});return exports;
}
async function unmount(){if(root){await act(async()=>root.unmount());root=null;}}
async function render(course=gumi){if(!root)root=createRoot(host);const {CourseDirections}=load('src/components/courses/CourseDirections.tsx');await act(async()=>root.render(h(React.StrictMode,null,h(CourseDirections,{course}))));}
const button=name=>[...host.querySelectorAll('button')].find(x=>x.textContent===name||x.getAttribute('aria-label')===name);
async function click(name){const element=button(name);assert.ok(element,name);await act(async()=>element.dispatchEvent(new MouseEvent('click',{bubbles:true})));}
const errors=[],originalError=console.error;console.error=(...x)=>errors.push(x.join(' '));
beforeEach(async()=>{
 await unmount();cache.clear();requests=[];maps=[];overlays=[];ready=true;scriptReady=[];reply=(q,cb)=>cb(sdkResult(q),'OK');
 window.history.replaceState({},'','/courses/map');process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY='a'.repeat(32);
 Object.defineProperty(navigator,'userAgent',{value:'iPhone',configurable:true});
 window.kakao={maps:{load:fn=>fn(),LatLng:class{constructor(lat,lng){this.lat=lat;this.lng=lng;}getLat(){return this.lat;}getLng(){return this.lng;}},
 Map:class{constructor(node,options){this.node=node;this.center=options.center;this.level=options.level;maps.push(this);node.dataset.center=JSON.stringify([this.center.getLat(),this.center.getLng()]);}relayout(){}setCenter(p){this.center=p;}getCenter(){return this.center;}panTo(p){this.center=p;}setLevel(n){this.level=n;}getLevel(){return this.level;}setDraggable(v){this.draggable=v;}setZoomable(v){this.zoomable=v;}},
 CustomOverlay:class{constructor(options){this.node=options.content;this.position=options.position;this.node.dataset.localOverlay='true';options.map.node.append(this.node);overlays.push(this);}setMap(map){if(!map)this.node.remove();}},
 event:{addListener(){},removeListener(){}},services:{Status:{OK:'OK',ZERO_RESULT:'ZERO_RESULT'},SortBy:{DISTANCE:'DISTANCE'},Places:class{categorySearch(){assert.fail('No nearby request');}},Geocoder:class{addressSearch(q,cb,options){requests.push({q,options});reply(q,cb);}}}}};
});
afterEach(()=>assert.deepEqual(errors.splice(0),[],'No React lifecycle errors'));
after(async()=>{await unmount();console.error=originalError;dom.window.close();delete globalThis.ResizeObserver;delete globalThis.requestAnimationFrame;if(savedKey===undefined)delete process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY;else process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY=savedKey;});

// jsdom has no layout: model the real 96px preview separately from an actual 0x0 resize.
async function withMapLayout(run){
 const savedObserver=globalThis.ResizeObserver,savedMatchMedia=window.matchMedia;
 const widthDescriptor=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'clientWidth');
 const heightDescriptor=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'clientHeight');
 const BaseMap=window.kakao.maps.Map,savedEvent=window.kakao.maps.event;
 const observers=[],listeners=[];
 const layout={zero:false,width:320};
 const visible=node=>!layout.zero&&!node.closest('[hidden]');
 Object.defineProperty(HTMLElement.prototype,'clientWidth',{configurable:true,get(){return visible(this)?layout.width:0;}});
 Object.defineProperty(HTMLElement.prototype,'clientHeight',{configurable:true,get(){return visible(this)?this.parentElement?.classList.contains('h-24')?96:300:0;}});
 globalThis.ResizeObserver=class{constructor(cb){this.cb=cb;observers.push(this);}observe(node){this.node=node;}disconnect(){this.disconnected=true;}};
 layout.flush=()=>act(async()=>observers.filter(o=>!o.disconnected).forEach(o=>o.cb([{target:o.node}])));
 const emit=map=>listeners.filter(l=>l.map===map&&!l.removed).forEach(l=>l.cb());
 window.kakao.maps.Map=class extends BaseMap{
  constructor(...args){super(...args);this.levelWrites=0;this.centerWrites=0;this.relayouts=0;this.createdSize=[this.node.clientWidth,this.node.clientHeight];}
  setLevel(value){super.setLevel(value);this.levelWrites++;}
  setCenter(point){super.setCenter(point);this.centerWrites++;emit(this);}
  panTo(point){super.panTo(point);emit(this);}
  relayout(){this.relayouts++;}
 };
 window.kakao.maps.event={
  addListener(map,event,cb){assert.equal(event,'center_changed');listeners.push({map,cb});},
  removeListener(map,event,cb){assert.equal(event,'center_changed');const item=listeners.find(l=>l.map===map&&l.cb===cb);assert.ok(item);item.removed=true;},
 };
 layout.assertClean=()=>{
  assert.ok(observers.length>0);assert.ok(listeners.length>0);
  assert.ok(observers.every(o=>o.disconnected),'unmount disconnects every observer');
  assert.ok(listeners.every(l=>l.removed),'unmount removes every center listener');
  assert.ok(overlays.every(o=>!o.node.isConnected),'unmount removes every marker');
 };
 try{await run(layout);}finally{
  await unmount();globalThis.ResizeObserver=savedObserver;window.matchMedia=savedMatchMedia;
  window.kakao.maps.Map=BaseMap;window.kakao.maps.event=savedEvent;
  for(const [key,descriptor]of [['clientWidth',widthDescriptor],['clientHeight',heightDescriptor]]){
   if(descriptor)Object.defineProperty(HTMLElement.prototype,key,descriptor);else delete HTMLElement.prototype[key];
  }
 }
}

test('Gumi stored coordinates show actual map component and course-name marker without geocoding',async()=>{await render();assert.equal(requests.length,0);assert.ok(host.querySelector('[aria-label="구장 지도"]'));assert.match(host.querySelector('[data-local-overlay]').textContent,/구미파크골프장/);assert.deepEqual(JSON.parse(host.querySelector('[data-center]').dataset.center),[36.142719,128.373212]);});
test('valid stored coordinates without kind metadata are used as facility, not invented entrance',async()=>{await render({...gumi,destinationKind:null});assert.equal(requests.length,0);assert.match(host.querySelector('[data-local-overlay]').textContent,/구미파크골프장/);assert.doesNotMatch(host.querySelector('[data-local-overlay]').textContent,/출입구/);});
test('address-only detail auto-resolves before any route click, then map marker and routes reuse the same point',async()=>{
 await render(address);assert.equal(host.querySelector('dialog[open]'),null);assert.equal(requests.length,1);assert.equal(requests[0].options.analyze_type,'exact');assert.match(host.querySelector('[data-local-overlay]').textContent,/LOCAL 주소 시험 구장/);assert.deepEqual(JSON.parse(host.querySelector('[data-center]').dataset.center),[37.569621,126.87928]);
 await click('내비게이션');const link=host.querySelector('dialog[open] a[href^="nmap:"]');const u=new URL(link.href);assert.equal(u.searchParams.get('dlat'),'37.569621');assert.equal(u.searchParams.get('dlng'),'126.87928');assert.equal(requests.length,1);
 await click('앱 선택 닫기');await click('대중교통');assert.equal(requests.length,1);assert.ok(host.querySelector('dialog[open] a[href^="nmap://route/public"]'));
});
test('pending address shows progress, no failure/retry or search link; opening routes does not issue another lookup',async()=>{
 let finish;reply=(q,cb)=>{finish=()=>cb(sdkResult(q),'OK');};await render(address);assert.match(host.textContent,/주소로 구장 위치를 확인/);assert.doesNotMatch(host.textContent,/구장 위치 미확인/);assert.equal(button('주소 좌표 다시 확인'),undefined);assert.equal(host.querySelector('[data-local-overlay]'),null);assert.equal(host.querySelector('a[href*="link/search"]'),null);
 await click('내비게이션');assert.equal(requests.length,1);await act(async()=>finish());assert.equal(requests.length,1);assert.ok(host.querySelector('[data-local-overlay]'));assert.ok(host.querySelector('dialog[open] a[href^="nmap://navigation"]'));
});
test('provider failure response exposes shared retry; retry fixes map and routes without approval',async()=>{
 reply=(q,cb)=>cb([],'ZERO_RESULT');await render(address);assert.match(host.textContent,/주소에 해당하는 위치를 찾지 못했습니다/);assert.ok(button('주소 좌표 다시 확인'));assert.equal(host.querySelector('[data-local-overlay]'),null);assert.equal(host.querySelector('a[href*="link/search"]'),null);
 reply=(q,cb)=>cb(sdkResult(q),'OK');await click('주소 좌표 다시 확인');assert.equal(requests.length,2);assert.ok(host.querySelector('[data-local-overlay]'));assert.equal(button('주소 좌표 다시 확인'),undefined);await click('내비게이션');assert.equal(requests.length,2);
});
test('existing expand/collapse preserves one geocode result and named marker',async()=>{
 await render(address);const before=host.querySelector('[data-local-overlay]');await click('지도 펼치기');assert.equal(button('지도 접기').getAttribute('aria-expanded'),'true');assert.equal(host.querySelector('[aria-label="구장 지도"]').getAttribute('tabindex'),'0');await click('지도 접기');assert.equal(button('지도 펼치기').getAttribute('aria-expanded'),'false');assert.equal(requests.length,1);assert.equal(host.querySelector('[data-local-overlay]'),before);
});

test('integrated detail mounts one low preview, keeps routes visible and reuses the internal toggle before and after SDK readiness',async()=>{
 await withMapLayout(async layout=>{
  for(const delayed of [false,true]){
   await unmount();cache.clear();ready=!delayed;scriptReady=[];
   const beforeMaps=maps.length,beforeMarkers=overlays.length;
   const {CourseDirections}=load('src/components/courses/CourseDirections.tsx');
   function Controller(){const [state,setState]=React.useState({expanded:false,hasOpened:false});return h(CourseDirections,{course:gumi,integrated:{...state,onExpanded:expanded=>setState(old=>({expanded,hasOpened:old.hasOpened||expanded}))}});}
   root=createRoot(host);await act(async()=>root.render(h(Controller)));
   const region=host.querySelector('[aria-label="구장 지도"]');assert.ok(region,'preview container exists even before SDK readiness');
   assert.equal(region.closest('[hidden]'),null);assert.equal(region.clientHeight,96);assert.equal(region.clientWidth,320);
   assert.equal(region.style.touchAction,'pan-y');assert.equal(region.tabIndex,-1);
   assert.equal(host.querySelector('#course-directions-details'),null,'removed hidden wrapper stays absent');
   const assertCollapsed=()=>{
    assert.equal(host.querySelectorAll('button[aria-expanded]').length,1,'one internal toggle');
    assert.equal(button('지도 펼치기').getAttribute('aria-expanded'),'false');
    for(const name of ['대중교통','내비게이션']){const route=button(name);assert.ok(route);assert.equal(route.closest('[hidden]'),null);assert.equal(route.disabled,false);assert.ok(button('지도 펼치기').compareDocumentPosition(route)&Node.DOCUMENT_POSITION_FOLLOWING);}
   };
   assertCollapsed();
   if(delayed){
    assert.equal(maps.length,beforeMaps);assert.equal(overlays.length,beforeMarkers);
    await click('지도 펼치기');await click('지도 접기');assertCollapsed();
    assert.equal(maps.length,beforeMaps);assert.equal(scriptReady.length,1);
    await act(async()=>scriptReady[0]());
   }
   assert.equal(maps.length,beforeMaps+1);assert.equal(overlays.length,beforeMarkers+1);
   const map=maps.at(-1),marker=host.querySelector('[data-local-overlay]');assert.ok(marker);
   assert.deepEqual(map.createdSize,[320,96]);assert.equal(map.draggable,false);assert.equal(map.zoomable,false);
   for(let cycle=0;cycle<5;cycle++){
    await click('지도 펼치기');await layout.flush();assert.equal(region.clientHeight,300);assert.equal(button('지도 접기').getAttribute('aria-expanded'),'true');
    await click('지도 접기');await layout.flush();assert.equal(region.clientHeight,96);assertCollapsed();
    assert.equal(maps.at(-1),map);assert.equal(maps.length,beforeMaps+1);assert.equal(overlays.length,beforeMarkers+1);assert.equal(host.querySelector('[data-local-overlay]'),marker);
   }
   assert.equal(requests.length,0);await unmount();layout.assertClean();
   // A delayed script callback after unmount must not create an orphan map.
   await act(async()=>scriptReady.forEach(notify=>notify()));assert.equal(maps.length,beforeMaps+1);
  }
 });
});

test('changing course discards stale address result, preserves new stored point',async()=>{
 let finish;reply=(q,cb)=>{finish=()=>cb(sdkResult(q),'OK');};await render(address);await render(gumi);await act(async()=>finish());assert.match(host.querySelector('[data-local-overlay]').textContent,/구미파크골프장/);assert.deepEqual(JSON.parse(host.querySelector('[data-center]').dataset.center),[36.142719,128.373212]);
});
test('Samrak current incomplete address cannot turn a dong centroid into a course marker',async()=>{
 const c={...address,name:'삼락생태공원 파크골프장',address:'부산광역시 사상구 삼락동 (삼락생태공원 내)'};
 reply=(q,cb)=>cb([{address_name:q,address_type:'REGION',x:'128.9',y:'35.1'}],'OK');await render(c);assert.equal(requests[0].q,'부산광역시 사상구 삼락동');assert.equal(host.querySelector('[data-local-overlay]'),null);assert.match(host.textContent,/주소가 동·도로 수준이라 구장 위치를 특정할 수 없습니다/);assert.ok(button('주소 좌표 다시 확인'));
});
test('temporary provider error stays temporary throughout map UI and retry',async()=>{
 reply=(q,cb)=>cb([],'ERROR');await render(address);assert.match(host.textContent,/일시적으로/);assert.doesNotMatch(host.textContent,/주소를 확인|구장 위치 미확인/);assert.ok(button('주소 좌표 다시 확인'));reply=(q,cb)=>cb(sdkResult(q),'OK');await click('주소 좌표 다시 확인');assert.ok(host.querySelector('[data-local-overlay]'));
});


test('F1 regression: internal collapse resets mobile interaction, zoom and remembered center across visible preview and zero-size resize without remounting',async()=>{
 await withMapLayout(async layout=>{
  for(const mode of ['mobile','zero-size','screen','pc','failure']){
   await unmount();cache.clear();layout.zero=false;layout.width=320;
   const beforeMaps=maps.length,beforeMarkers=overlays.length;
   window.matchMedia=()=>({matches:mode!=='pc',addEventListener(){},removeEventListener(){}});
   if(mode==='failure')window.kakao.maps.Map=class{constructor(){throw Error('Synthetic SDK initialization failure');}};
   const {CourseDirections}=load('src/components/courses/CourseDirections.tsx');
   function Controller(){
    const [state,setState]=React.useState({expanded:false,hasOpened:false});
    return h(CourseDirections,{course:gumi,...(mode==='screen'?{}:{integrated:{...state,onExpanded:expanded=>setState(old=>({expanded,hasOpened:old.hasOpened||expanded}))}})});
   }
   root=createRoot(host);await act(async()=>root.render(h(Controller)));
   if(mode==='screen')assert.ok(host.querySelector('[aria-label="오시는 길"]'));
   await click('지도 펼치기');await layout.flush();
   if(mode==='failure'){
    assert.ok(button('지도 다시 불러오기'));
    for(let cycle=0;cycle<3;cycle++){await click('지도 접기');await click('지도 펼치기');await layout.flush();}
    assert.equal(maps.length,beforeMaps);assert.equal(overlays.length,beforeMarkers);assert.ok(button('지도 다시 불러오기'));await unmount();continue;
   }
   const map=maps.at(-1),marker=host.querySelector('[data-local-overlay]'),region=host.querySelector('[aria-label="구장 지도"]');
   assert.equal(maps.length,beforeMaps+1);assert.equal(overlays.length,beforeMarkers+1);
   if(mode!=='pc')await click('지도 조작');
   assert.equal(region.style.touchAction,'none');assert.equal(map.draggable,true);assert.equal(map.zoomable,mode!=='pc');
   if(mode!=='pc')assert.equal(button('페이지 스크롤').getAttribute('aria-pressed'),'true');
   await act(async()=>region.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));
   await click('지도 확대');assert.equal(map.getLevel(),3);assert.notEqual(map.getCenter().getLng(),gumi.longitude,'pan survives while expanded');
   const panned=[map.getCenter().getLat(),map.getCenter().getLng()],writes=map.levelWrites;
   await act(async()=>root.render(h(Controller)));await layout.flush();layout.width=360;await layout.flush();await layout.flush();
   assert.equal(map.getLevel(),3,'ordinary rerender/resize preserves expanded zoom');assert.equal(map.levelWrites,writes);
   assert.deepEqual([map.getCenter().getLat(),map.getCenter().getLng()],panned,'ordinary rerender/resize preserves expanded pan');
   const centerWrites=map.centerWrites,relayouts=map.relayouts;
   if(mode==='zero-size')layout.zero=true;
   await click('지도 접기');
   assert.equal(region.style.touchAction,'pan-y');assert.equal(map.draggable,false);assert.equal(map.zoomable,false);assert.equal(button('페이지 스크롤'),undefined);
   if(mode==='zero-size'){
    assert.deepEqual([region.clientWidth,region.clientHeight],[0,0]);await layout.flush();
    assert.equal(map.relayouts,relayouts,'actual zero-size resize skips relayout');assert.equal(map.levelWrites,writes,'reset waits for measurable size');assert.equal(map.centerWrites,centerWrites,'no center write at zero size');
    layout.zero=false;
   }else{
    assert.equal(region.clientHeight,96,'collapsed preview is measurable, not hidden');assert.equal(map.getLevel(),4);
    assert.deepEqual([map.getCenter().getLat(),map.getCenter().getLng()],[gumi.latitude,gumi.longitude],'visible collapse resets immediately');
   }
   // A stale SDK center event during the size transition must not replace the reset destination.
   map.setCenter(new window.kakao.maps.LatLng(...panned));await layout.flush();
   assert.equal(map.getLevel(),4);assert.deepEqual([map.getCenter().getLat(),map.getCenter().getLng()],[gumi.latitude,gumi.longitude]);
   assert.equal(map.levelWrites,writes+1,'one zoom reset per collapse');
   await click('지도 펼치기');await layout.flush();
   if(mode==='pc')assert.equal(button('지도 조작'),undefined);else{assert.equal(button('지도 조작').getAttribute('aria-pressed'),'false');}
   assert.equal(region.style.touchAction,mode==='pc'?'none':'pan-y');assert.equal(map.draggable,mode==='pc');assert.equal(map.zoomable,false);
   assert.equal(map.getLevel(),4);assert.deepEqual([map.getCenter().getLat(),map.getCenter().getLng()],[gumi.latitude,gumi.longitude]);
   const resetWrites=map.levelWrites;await layout.flush();assert.equal(map.levelWrites,resetWrites,'resize does not repeat zoom reset');
   assert.equal(maps.length,beforeMaps+1);assert.equal(overlays.length,beforeMarkers+1);assert.equal(host.querySelector('[data-local-overlay]'),marker);
   await unmount();layout.assertClean();
  }
 });
});
