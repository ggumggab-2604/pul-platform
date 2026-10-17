import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test,beforeEach,after} from 'node:test';
import ts from 'typescript';
const require=createRequire(import.meta.url),runtime=process.env.PUL_MARKET_TEST_RUNTIME;
const {JSDOM}=runtime?createRequire(path.join(runtime,'package.json'))('jsdom'):require('jsdom');
const dom=new JSDOM('<!doctype html><head></head><body></body>',{url:'https://local.example'});
for(const name of ['window','document'])Object.defineProperty(globalThis,name,{value:dom.window[name],configurable:true});
const repo=process.env.PUL_COURSE_SDK_SOURCE??fileURLToPath(new URL('../../../',import.meta.url)),cache=new Map();
const previousKey=process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY;
const course={name:'LOCAL 주소',address:'서울 마포구 하늘공원로 100',latitude:null,longitude:null};
function load(file){const absolute=path.resolve(repo,file);if(cache.has(absolute))return cache.get(absolute);const exports={};cache.set(absolute,exports);const code=ts.transpileModule(readFileSync(absolute,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;new Function('require','exports',code)(name=>{
 if(name==='next/script')return{__esModule:true,default:()=>null};
 if(name.startsWith('@/')||name.startsWith('.')){const base=name.startsWith('@/')?path.join(repo,'src',name.slice(2)):path.resolve(path.dirname(absolute),name);const target=[base+'.ts',base+'.tsx'].find(existsSync);return load(target);}return require(name);
},exports);return exports;}
function ready(){window.kakao={maps:{load:fn=>fn(),services:{Status:{OK:'OK'},Geocoder:class{addressSearch(q,cb){cb([{address_name:q,address_type:'ROAD_ADDR',x:'126.87928',y:'37.569621'}],'OK');}}}}};}
beforeEach(()=>{cache.clear();delete window.kakao;document.head.replaceChildren();process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY='a'.repeat(32);});
after(()=>{dom.window.close();if(previousKey===undefined)delete process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY;else process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY=previousKey;});
test('pending next/script is reused; transit/address lookup does not remove or insert a second SDK script',async()=>{
 const original=document.createElement('script');original.id='pul-kakao-map-sdk';document.head.append(original);
 const pending=load('src/components/courses/CourseKakao.tsx').resolveCourseAddressDestination(course);pending.catch(()=>{});
 try{assert.equal(original.isConnected,true);assert.equal(document.head.querySelectorAll('script').length,1);assert.equal(document.getElementById('pul-kakao-map-sdk-retry'),null);}
 finally{ready();for(const script of [...document.head.querySelectorAll('script'),original])script.dispatchEvent(new window.Event('load'));await pending;}
});
test('failed borrowed script allows an explicit retry with one new script',async()=>{
 const original=document.createElement('script');original.id='pul-kakao-map-sdk';document.head.append(original);const ui=load('src/components/courses/CourseKakao.tsx');
 const first=ui.resolveCourseAddressDestination(course);const failure=assert.rejects(first,/일시적으로/);for(const script of document.head.querySelectorAll('script'))script.dispatchEvent(new window.Event('error'));await failure;
 const second=ui.resolveCourseAddressDestination(course);assert.equal(document.head.querySelectorAll('script').length,1);assert.ok(document.getElementById('pul-kakao-map-sdk-retry'));ready();document.getElementById('pul-kakao-map-sdk-retry').dispatchEvent(new window.Event('load'));assert.equal((await second).latitude,37.569621);
});
test('no script: concurrent SDK preparations share one owned script',async()=>{
 const ui=load('src/components/courses/CourseKakao.tsx'),first=ui.resolveCourseAddressDestination(course),second=ui.resolveCourseAddressDestination(course);assert.equal(document.head.querySelectorAll('script').length,1);ready();document.head.querySelector('script').dispatchEvent(new window.Event('load'));const values=await Promise.all([first,second]);assert.equal(values[0].latitude,values[1].latitude);
});
