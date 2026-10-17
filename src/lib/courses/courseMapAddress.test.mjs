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
HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
window.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
window.history.back=()=>{window.history.replaceState({},'','/courses/map');window.dispatchEvent(new dom.window.PopStateEvent('popstate'));};
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const React=require('react'),{act}=React,{createRoot}=require('react-dom/client'),h=React.createElement;
const repo=fileURLToPath(new URL('../../../',import.meta.url)),cache=new Map();
let root,requests=[],maps=[],overlays=[],reply,ready=true;
const savedKey=process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY;
const host=document.getElementById('root'),gumi={name:'구미파크골프장',address:'경상북도 구미시 고아읍 괴평리 1123',latitude:36.142719,longitude:128.373212,destinationKind:'facility'};
const address={name:'LOCAL 주소 시험 구장',address:'서울 마포구 하늘공원로 100',latitude:null,longitude:null,destinationKind:null};
const sdkResult=query=>[{address_name:query,address_type:'ROAD_ADDR',x:'126.87928',y:'37.569621'}];
function load(file){
 const absolute=path.resolve(repo,file);if(cache.has(absolute))return cache.get(absolute);const exports={};cache.set(absolute,exports);
 const code=ts.transpileModule(readFileSync(absolute,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 new Function('require','exports','module',code)(name=>{
  if(name==='next/script')return{__esModule:true,default:function Script(props){const initial=React.useRef(props);React.useEffect(()=>{if(ready)initial.current.onReady?.();},[]);return null;}};
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
 await unmount();cache.clear();requests=[];maps=[];overlays=[];ready=true;reply=(q,cb)=>cb(sdkResult(q),'OK');
 window.history.replaceState({},'','/courses/map');process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY='a'.repeat(32);
 Object.defineProperty(navigator,'userAgent',{value:'iPhone',configurable:true});
 window.kakao={maps:{load:fn=>fn(),LatLng:class{constructor(lat,lng){this.lat=lat;this.lng=lng;}getLat(){return this.lat;}getLng(){return this.lng;}},
 Map:class{constructor(node,options){this.node=node;this.center=options.center;this.level=options.level;maps.push(this);node.dataset.center=JSON.stringify([this.center.getLat(),this.center.getLng()]);}relayout(){}setCenter(p){this.center=p;}getCenter(){return this.center;}panTo(p){this.center=p;}setLevel(n){this.level=n;}getLevel(){return this.level;}setDraggable(v){this.draggable=v;}setZoomable(v){this.zoomable=v;}},
 CustomOverlay:class{constructor(options){this.node=options.content;this.position=options.position;this.node.dataset.localOverlay='true';options.map.node.append(this.node);overlays.push(this);}setMap(map){if(!map)this.node.remove();}},
 event:{addListener(){},removeListener(){}},services:{Status:{OK:'OK',ZERO_RESULT:'ZERO_RESULT'},SortBy:{DISTANCE:'DISTANCE'},Places:class{categorySearch(){assert.fail('No nearby request');}},Geocoder:class{addressSearch(q,cb,options){requests.push({q,options});reply(q,cb);}}}}};
});
afterEach(()=>assert.deepEqual(errors.splice(0),[],'No React lifecycle errors'));
after(async()=>{await unmount();console.error=originalError;dom.window.close();delete globalThis.ResizeObserver;if(savedKey===undefined)delete process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY;else process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY=savedKey;});
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
