import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const runtime=process.env.PUL_MARKET_TEST_RUNTIME;
const {JSDOM}=runtime?createRequire(path.join(runtime,'package.json'))('jsdom'):require('jsdom');
const dom=new JSDOM('<!doctype html><html><body><button id="trigger">목록 글 열기</button><div id="root"></div></body></html>',{url:'http://localhost:3300/market'});
for(const name of ['window','document','HTMLElement','HTMLInputElement','HTMLSelectElement','Event','KeyboardEvent','MouseEvent','File'])Object.defineProperty(globalThis,name,{value:dom.window[name],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;window.scrollTo=()=>{};
const React=require('react'),{createRoot}=require('react-dom/client'),{act}=React;
const repo=path.resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const actions={marketInterestStateAction:async()=>false,setInterestAction:async(k,id,s)=>s,listInterestsAction:async()=>({items:[],hasMore:false})};
const cache=new Map();
function load(file){
 const absolute=path.resolve(repo,file);if(cache.has(absolute))return cache.get(absolute);
 const exports={};cache.set(absolute,exports);
 const text=readFileSync(absolute,'utf8');const output=ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('require','exports','module',output)(name=>{
   if(name==='@/app/my/interestActions')return actions;
   if(name==='next/link')return {__esModule:true,default:({children,prefetch,...props})=>React.createElement('a',props,children)};
   if(name.startsWith('@/'))return load('src/'+name.slice(2)+'.'+(name.startsWith('@/components/')?'tsx':'ts'));
   if(name.startsWith('.')){const target=path.resolve(path.dirname(absolute),name);return load(path.relative(repo,target+(name.endsWith('.ts')||name.endsWith('.tsx')?'':absolute.includes('/components/')||absolute.includes('\\components\\')?'.tsx':'.ts')));}
   return require(name);
 },exports,{exports});return exports;
}
const {MarketPhotoGallery,MarketPhotoPicker}=load('src/components/market/MarketPhotos.tsx');
const {MarketDialog}=load('src/components/market/MarketDialog.tsx');
const {MarketEntryDialog}=load('src/components/market/MarketEntryDialog.tsx');
const {MarketContactPanel}=load('src/components/market/MarketContact.tsx');
const {MarketListSearch}=load('src/components/market/MarketListSearch.tsx');
const {observeMarketIdentity}=load('src/lib/market/marketAuthLifecycle.ts');
let root;const host=document.getElementById('root');
async function mount(element){await unmount();root=createRoot(host);await act(async()=>root.render(element));}
async function unmount(){if(root){await act(async()=>root.unmount());root=null;}}
const click=async element=>act(async()=>element.dispatchEvent(new MouseEvent('click',{bubbles:true})));
const button=text=>[...host.querySelectorAll('button')].find(item=>item.textContent===text);
const key=async value=>act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true})));
after(async()=>{await unmount();dom.window.close();});

const change=async(element,value)=>{
 const prototype=element.tagName==='SELECT'?HTMLSelectElement.prototype:element.tagName==='TEXTAREA'?dom.window.HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
 Object.getOwnPropertyDescriptor(prototype,'value').set.call(element,value);
 await act(async()=>element.dispatchEvent(new Event(element.tagName==='SELECT'?'change':'input',{bubbles:true})));
};
const submit=async()=>act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
const listingItem={id:'00000000-0000-4000-8000-000000000001',name:'LOCAL 기존 판매글',category:'club',condition:'lightUse',price:150000,tradeType:'direct',region:'경기',description:'LOCAL 충분한 길이의 상품 설명입니다.',images:[],publicContactMethod:'phone',publicContactValue:'01012345678',publicContactConsentValid:true,tradeNoticeConfirmed:true,tradeNoticeVersion:"market-policy-v1"};


const {MarketDetailModal}=load('src/components/market/MarketDetailModal.tsx');
const {InterestButton}=load('src/components/interests/InterestButton.tsx');
const {InterestList}=load('src/components/interests/InterestList.tsx');
const item={...listingItem,canEdit:false,saleStatus:'selling',sellerNickname:'PUL 회원',createdAt:'2026년 10월 1일',publicContactMethod:null,publicContactValue:null};
test('detail owner/buyer menus, compact contact and unchanged callbacks',async()=>{
 let edit,status,deleted,report;
 const props={item,authenticated:true,onClose:()=>{},onEdit:v=>edit=v,onStatus:(v,op)=>status=op,onDelete:v=>deleted=v,onReport:v=>report=v};
 await mount(React.createElement(MarketDetailModal,props));
 assert.ok(button('관심상품'));assert.match(host.textContent,/상품 설명/);
 assert.equal(host.querySelector('[aria-label="연락하기"]'),null);
 assert.equal(button('내용 수정'),undefined);
 await click(button('판매글 신고'));assert.equal(report,item);
 await mount(React.createElement(MarketDetailModal,{...props,item:{...item,canEdit:true}}));
 assert.equal(button('관심상품'),undefined);assert.equal(host.querySelector('[aria-label="내 연락 방법"]'),null);
 await click(button('내용 수정'));assert.equal(edit.id,item.id);
 await click(button('판매 상태 변경'));await click(button('예약중으로 변경'));assert.equal(status,'reserve');
 await click(button('판매글 삭제'));assert.equal(deleted.id,item.id);
 await mount(React.createElement(MarketDetailModal,{...props,item:{...item,publicContactMethod:'phone',publicContactValue:'01000000000'}}));
 assert.ok(host.querySelector('a[href="tel:01000000000"]'));
 await mount(React.createElement(MarketDetailModal,{...props,item:{...item,saleStatus:'sold'}}));
 assert.equal(host.querySelector('a[href^="tel:"]'),null);assert.equal([...host.querySelectorAll('a')].find(a=>a.textContent==='쪽지 보내기'),undefined);
});
test('listing gallery preserves order; arrows, thumbnails and nested Escape restore focus',async()=>{
 await mount(React.createElement(MarketDialog,{title:'상품',onClose:()=>{}},React.createElement(MarketPhotoGallery,{listing:true,images:['/1.png','/2.png','/3.png','/4.png'],title:'합성 가방'})));
 await click(host.querySelector('[aria-label="3번 사진 보기"]'));assert.equal(host.querySelector('img').getAttribute('src'),'/3.png');
 const expand=host.querySelector('[aria-label="3번 사진 확대"]');expand.focus();await click(expand);
 assert.equal(host.querySelectorAll('[role="dialog"]').length,2);
 await key('Escape');assert.equal(host.querySelectorAll('[role="dialog"]').length,1);assert.equal(document.activeElement,expand);
 await act(async()=>expand.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true})));
 assert.equal(host.querySelector('img').getAttribute('src'),'/4.png');assert.ok(host.querySelector('[aria-label="다음 사진"]').disabled);
 await mount(React.createElement(MarketPhotoGallery,{listing:true,images:[],title:'없음'}));assert.match(host.textContent,/등록된 사진이 없습니다/);
 await mount(React.createElement(MarketPhotoGallery,{listing:true,images:['/one.png'],title:'한 장'}));assert.equal(host.querySelectorAll('[aria-label="사진 미리보기"]').length,0);
});
test('interest exact desired state, double-click guard and ambiguous failure retry',async()=>{
 let calls=[],resolve;actions.setInterestAction=(k,id,s)=>{calls.push(s);return new Promise(done=>resolve=done);};
 await mount(React.createElement(InterestButton,{kind:'market',id:item.id,initialSaved:false}));
 await click(button('관심상품'));await click(host.querySelector('button'));assert.deepEqual(calls,[true]);assert.equal(host.querySelector('button').getAttribute('aria-pressed'),'false');
 await act(async()=>resolve(true));assert.equal(host.querySelector('button').getAttribute('aria-pressed'),'true');
 actions.setInterestAction=async(k,id,s)=>{calls.push(s);throw Error('failure');};
 await click(button('관심상품 해제'));assert.equal(host.querySelector('button').getAttribute('aria-pressed'),'true');
 actions.setInterestAction=async(k,id,s)=>{calls.push(s);return s;};
 await click(button('다시 시도'));assert.deepEqual(calls,[true,false,false]);assert.equal(host.querySelector('button').getAttribute('aria-pressed'),'false');
});
test('unified list existing video link, hidden item, filtering and removal',async()=>{
 let requested,removed;
 const page={items:[{kind:'market',id:item.id,available:false,title:null,href:null,image:null},{kind:'lesson_video',id:'local-video',available:true,title:'합성 영상',href:'https://www.youtube.com/watch?v=local',summary:'합성 · 5분'}],hasMore:false};
 actions.listInterestsAction=async(kind,offset)=>{requested={kind,offset};return page;};
 actions.setInterestAction=async(kind,id,saved)=>{removed={kind,id,saved};return saved;};
 await mount(React.createElement(InterestList,{initialPage:page}));
 assert.match(host.textContent,/현재 볼 수 없는 항목/);assert.ok(host.querySelector('a[href^="https://www.youtube.com"]'));
 await click(button('레슨·영상'));assert.equal(requested.kind,'lesson_video');
 await click([...host.querySelectorAll('button')].find(b=>b.textContent==='관심 해제'));assert.equal(removed.saved,false);
});
test('anonymous interest returns to exact canonical listing after normal login',async()=>{
 await mount(React.createElement(MarketDetailModal,{item,authenticated:false,onClose:()=>{},onEdit:()=>{},onStatus:()=>{},onDelete:()=>{},onReport:()=>{}}));
 const link=[...host.querySelectorAll('a')].find(a=>a.textContent==='관심상품');
 assert.equal(new URL(link.href).pathname,'/login');
 assert.equal(new URL(link.href).searchParams.get('next'),'/market?view=sale&listing='+item.id);
});

test('interest adapters reject unsupported kinds, redact hidden fields and keep RPC failures visible',async()=>{
 const {listInterests,setInterest,marketInterestState}=load('src/lib/interests/interests.ts');
 let calls=0;
 const fake={rpc:async()=>{calls++;return {data:{items:[{kind:'market',id:item.id,saved_at:'2026-10-01',available:false,title:'must not show',price:900,image_path:'private-path',region:'hidden',status:'selling'}],has_more:false},error:null};}};
 await assert.rejects(()=>setInterest(fake,'club',item.id,true));assert.equal(calls,0);
 const page=await listInterests(fake);assert.equal(page.items[0].title,null);assert.equal(page.items[0].image,null);assert.equal(page.items[0].href,null);assert.equal(page.items[0].price,null);
 fake.rpc=async()=>({data:null,error:{code:'XX000'}});
 await assert.rejects(()=>listInterests(fake),/처리하지 못했습니다/);
 await assert.rejects(()=>marketInterestState(fake,item.id),/처리하지 못했습니다/);
 fake.rpc=async()=>({data:{id:item.id,saved:false},error:null});
 await assert.rejects(()=>setInterest(fake,'market',item.id,true),/처리하지 못했습니다/);
});
