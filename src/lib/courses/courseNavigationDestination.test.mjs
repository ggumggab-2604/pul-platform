import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test,beforeEach,afterEach,after} from 'node:test';
import ts from 'typescript';
const require=createRequire(import.meta.url),runtime=process.env.PUL_MARKET_TEST_RUNTIME;
const {JSDOM}=runtime?createRequire(path.join(runtime,'package.json'))('jsdom'):require('jsdom');
const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://local.example/courses/local'});
for(const n of ['window','document','HTMLElement','HTMLDialogElement','Event','MouseEvent','Node'])Object.defineProperty(globalThis,n,{value:dom.window[n],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
let width=390;
window.matchMedia=()=>({matches:width<=700,addEventListener(){},removeEventListener(){}});
window.history.back=()=>{window.history.replaceState({},'','/courses/local');window.dispatchEvent(new dom.window.PopStateEvent('popstate'));};
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const React=require('react'),{act}=React,{createRoot}=require('react-dom/client'),h=React.createElement;
const repo=fileURLToPath(new URL('../../../',import.meta.url)),cache=new Map();
let root,sdkCalls=[],initialized=false,ready=true,scripts=[],addressReply=null,addressCalls=[];
const beforeKeys={kakao:process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY,tmap:process.env.NEXT_PUBLIC_TMAP_APP_KEY};
function load(file){
 const absolute=path.resolve(repo,file);if(cache.has(absolute))return cache.get(absolute);const exports={};cache.set(absolute,exports);
 const code=ts.transpileModule(readFileSync(absolute,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 new Function('require','exports','module',code)(name=>{
  if(name==='next/script')return{__esModule:true,default:function Script(props){const initial=React.useRef(props);React.useEffect(()=>{scripts.push(initial.current);if(ready)initial.current.onReady?.();},[]);return null;}};
  if(name==='./CourseKakao')return{CourseKakaoMap:()=>h('div',null,'Map SDK stub'),CourseKakaoNavi:load('src/components/courses/CourseKakao.tsx').CourseKakaoNavi,resolveCourseAddressDestination:load('src/components/courses/CourseKakao.tsx').resolveCourseAddressDestination};
  if(name.startsWith('@/')||name.startsWith('.')){const base=name.startsWith('@/')?path.join(repo,'src',name.slice(2)):path.resolve(path.dirname(absolute),name);const target=[base+'.ts',base+'.tsx'].find(existsSync);assert.ok(target,name);return load(target);}
  return require(name);
 },exports,{exports});return exports;
}
const host=document.getElementById('root'),gumi={name:'구미파크골프장',address:'경상북도 구미시 고아읍 괴평리 1123',latitude:36.142719,longitude:128.373212,destinationKind:'facility'};
const button=name=>[...host.querySelectorAll('button')].find(x=>x.getAttribute('aria-label')===name||x.textContent===name||x.textContent.startsWith(name));
const click=el=>{assert.ok(el);return act(async()=>el.dispatchEvent(new MouseEvent('click',{bubbles:true})));};
async function unmount(){if(root){await act(async()=>root.unmount());root=null;}}
async function mount(course=gumi){await unmount();const {CourseDirections}=load('src/components/courses/CourseDirections.tsx');root=createRoot(host);await act(async()=>root.render(h(React.StrictMode,null,h(CourseDirections,{course}))));await click(button('내비게이션'));}
const dialog=()=>host.querySelector('dialog[open]');
const errors=[],originalError=console.error;console.error=(...x)=>errors.push(x.join(' '));
beforeEach(async()=>{
 await unmount();cache.clear();width=390;sdkCalls=[];scripts=[];initialized=false;ready=true;addressReply=null;addressCalls=[];
 window.kakao={maps:{load:fn=>fn(),services:{Status:{OK:"OK",ZERO_RESULT:"ZERO_RESULT"},Geocoder:class{addressSearch(query,cb,options){addressCalls.push({query,options});if(addressReply)addressReply(query,cb);else cb([],"ZERO_RESULT");}}}}};
 window.history.replaceState({},'','/courses/local');
 Object.defineProperty(navigator,'userAgent',{value:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',configurable:true});
 process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY='a'.repeat(32);process.env.NEXT_PUBLIC_TMAP_APP_KEY='LOCAL-TEST-KEY';
 window.Kakao={isInitialized:()=>initialized,init:()=>{initialized=true;},Navi:{start:input=>sdkCalls.push(input)}};
});
afterEach(()=>assert.deepEqual(errors.splice(0),[],'No React errors'));
after(async()=>{await unmount();console.error=originalError;dom.window.close();for(const [name,value]of [['NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY',beforeKeys.kakao],['NEXT_PUBLIC_TMAP_APP_KEY',beforeKeys.tmap]]){if(value===undefined)delete process.env[name];else process.env[name]=value;}});

for(const kind of ['facility','building','entrance','parking'])test(kind+': same stored coordinates reach all three providers; no search or false entrance name',async()=>{
 const c={...gumi,name:'LOCAL 구장 & A #1',destinationKind:kind};await mount(c);const d=dialog();assert.ok(d);assert.doesNotMatch(d.textContent,/입구 미확인|주소 검색|위치 확인/);
 const links=[...d.querySelectorAll('a')];assert.equal(links.length,3);assert.ok(d.querySelector('.grid-cols-3'));
 const n=new URL(links.find(x=>x.href.startsWith('nmap:')).href),t=new URL(links.find(x=>x.href.includes('/tmap/app/routes')).href);
 const expected=c.name+(kind==='parking'?' 이용 주차장':kind==='entrance'?' 출입구':'');
 assert.equal(n.hostname,'navigation');assert.equal(n.searchParams.get('dname'),expected);assert.equal(n.searchParams.get('dlat'),'36.142719');assert.equal(n.searchParams.get('dlng'),'128.373212');assert.equal(n.searchParams.get('appname'),'https://local.example');
 assert.equal(t.searchParams.get('goalname'),expected);assert.equal(t.searchParams.get('goalx'),'128.373212');assert.equal(t.searchParams.get('goaly'),'36.142719');assert.equal(t.searchParams.has('autostart'),false);
 assert.equal(sdkCalls.length,0);await click(button('카카오내비'));assert.equal(sdkCalls.length,1);assert.equal(sdkCalls[0].name,expected);assert.equal(sdkCalls[0].x,128.373212);assert.equal(sdkCalls[0].y,36.142719);assert.equal(sdkCalls[0].coordType,'wgs84');assert.equal(sdkCalls[0].routeInfo,true);
});
test('Gumi facility sends its real name without relabelling it an entrance',async()=>{await mount();assert.match(dialog().textContent,/구장 위치를 목적지로 전달/);await click(button('카카오내비'));assert.equal(sdkCalls[0].name,'구미파크골프장');});
for(const fields of [{latitude:null,longitude:null,destinationKind:null},{latitude:NaN},{latitude:95},{longitude:181}])test('missing/invalid point with failed address conversion is unavailable, never search-as-navigation '+JSON.stringify(fields),async()=>{
 await mount({...gumi,...fields});assert.match(dialog().textContent,/주소에 해당하는 위치를 찾지 못했습니다/);assert.equal(dialog().querySelectorAll('a').length,0);assert.equal(button('카카오내비').disabled,true);assert.equal(button('네이버지도').disabled,true);assert.equal(button('티맵').disabled,true);assert.equal(sdkCalls.length,0);
});
test('missing keys keeps Naver destination link; TMAP omitted, Kakao visibly unavailable',async()=>{
 delete process.env.NEXT_PUBLIC_TMAP_APP_KEY;delete process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY;await mount();
 assert.equal(button('티맵'),undefined);assert.equal(button('카카오내비').disabled,true);assert.match(button('카카오내비').textContent,/현재 이용 불가/);assert.equal(dialog().querySelectorAll('a[href^="nmap://navigation?"]').length,1);assert.equal(scripts.length,0);assert.ok([...dialog().querySelectorAll('button[disabled]')].every(x=>x.getAttribute('type')==='button'));
});
test('SDK not ready never queues an app launch; later readiness still needs a fresh click',async()=>{
 ready=false;await mount();await click(button('카카오내비'));assert.match(dialog().textContent,/준비 중/);assert.equal(sdkCalls.length,0);
 await act(async()=>scripts.at(-1).onReady());assert.equal(sdkCalls.length,0);await click(button('카카오내비'));assert.equal(sdkCalls.length,1);
});
test('desktop provides destination-prefilled web directions without app dependency',async()=>{
 width=1440;Object.defineProperty(navigator,'userAgent',{value:'Mozilla/5.0 Windows NT 10.0',configurable:true});await mount();assert.equal(dialog().querySelectorAll('a[href*="/link/to/"]').length,1);assert.match(dialog().textContent,/웹 지도에 구장을 목적지로/);assert.doesNotMatch(dialog().innerHTML,/link\/search|p\/search/);assert.equal(scripts.length,0);
});
test('transit parking still avoids a parking point; copy and dialog close remain available',async()=>{
 await mount({...gumi,destinationKind:'parking'});await click(button('앱 선택 닫기'));await click(button('대중교통'));
 assert.match(dialog().textContent,/주소에 해당하는 위치를 찾지 못했습니다/);assert.equal(dialog().querySelectorAll('a[href^="nmap://navigation"]').length,0);assert.ok(button('주소 복사'));await click(button('앱 선택 닫기'));assert.equal(dialog(),null);
});

test('address-only conversion automatically reaches all vehicle providers and map, no approval or app launch until click',async()=>{
 addressReply=(query,cb)=>cb([{address_name:query,address_type:'REGION_ADDR',x:'128.373212',y:'36.142719'}],'OK');
 await mount({...gumi,latitude:null,longitude:null,destinationKind:null});
 assert.equal(addressCalls.length,1);assert.deepEqual(addressCalls[0].options,{analyze_type:'exact'});
 assert.equal(dialog().querySelectorAll('a[href^="nmap://navigation"]').length,1);assert.equal(sdkCalls.length,0);
 await click(button('카카오내비'));assert.equal(sdkCalls[0].name,gumi.name);assert.equal(sdkCalls[0].x,gumi.longitude);
 await click(button('앱 선택 닫기'));await click(button('대중교통'));assert.equal(addressCalls.length,1);
 const n=new URL(dialog().querySelector('a[href^="nmap:"]').href);assert.equal(n.pathname,'/public');assert.equal(n.searchParams.get('dname'),gumi.name);assert.equal(n.searchParams.has('slat'),false);
 const k=new URL(dialog().querySelector('a[href^="kakaomap:"]').href);assert.equal(k.hostname,'route');assert.equal(k.searchParams.get('by'),'publictransit');assert.equal(k.searchParams.get('ep'),'36.142719,128.373212');assert.equal(k.searchParams.has('sp'),false);
});
test('failed address conversion has manual retry and never launches/searches; normal retry requires no approval',async()=>{
 await mount({...gumi,latitude:null,longitude:null,destinationKind:null});assert.equal(dialog().querySelectorAll('a').length,0);
 addressReply=(query,cb)=>cb([{address_name:query,address_type:'REGION_ADDR',x:'128.373212',y:'36.142719'}],'OK');
 await click(button('주소 좌표 다시 확인'));assert.equal(addressCalls.length,2);assert.equal(dialog().querySelectorAll('a[href^="nmap://navigation"]').length,1);assert.equal(sdkCalls.length,0);
});
test('stored point is preferred; no address request for a valid entrance, building, facility or car parking',async()=>{
 for(const destinationKind of ['entrance','parking','facility','building']){await mount({...gumi,destinationKind});assert.equal(addressCalls.length,0);}
});
test('unmounted/changed course ignores late address result',async()=>{
 let done;addressReply=(query,cb)=>{done=()=>cb([{address_name:query,address_type:'REGION_ADDR',x:'127.1',y:'37.1'}],'OK');};
 await mount({...gumi,latitude:null,longitude:null,destinationKind:null});await mount({...gumi,name:'새 구장'});await act(async()=>done());
 assert.equal(new URL(dialog().querySelector('a[href^="nmap:"]').href).searchParams.get('dname'),'새 구장');assert.equal(sdkCalls.length,0);
});
test('SDK configuration missing: address failure is explicit, while PC stored-point web directions remain usable',async()=>{
 delete process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY;await mount({...gumi,latitude:null,longitude:null,destinationKind:null});assert.match(dialog().textContent,/지도 연결 설정/);assert.equal(addressCalls.length,0);
 width=1440;await mount();assert.ok(dialog().querySelector('a[href*="/link/to/"]'));
});
test('desktop transit has destination-prefilled web link without empty app-button grid',async()=>{
 width=1440;await mount();await click(button('앱 선택 닫기'));await click(button('대중교통'));assert.equal(dialog().querySelector('.grid'),null);assert.ok(dialog().querySelector('a[href*="/link/to/"]'));assert.equal(dialog().querySelector('a[href^="nmap:"]'),null);
});
