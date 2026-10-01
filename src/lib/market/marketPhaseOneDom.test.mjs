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
const cache=new Map();
function load(file){
 const absolute=path.resolve(repo,file);if(cache.has(absolute))return cache.get(absolute);
 const exports={};cache.set(absolute,exports);
 const text=readFileSync(absolute,'utf8');const output=ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('require','exports','module',output)(name=>{
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

test('listing starts with required choices empty, message-only submits numeric price, failures retain draft and photos',async()=>{
 const calls=[];await mount(React.createElement(MarketEntryDialog,{kind:'listing',busy:false,onClose:()=>{},onSubmit:(...value)=>calls.push(value)}));
 assert.equal(host.querySelector('select').value,'');assert.equal(host.querySelector('input[type="checkbox"]').checked,false);assert.equal(host.querySelector('input[type="tel"]'),null);
 assert.equal(host.querySelector('option[value="external_url"]'),null);assert.equal(host.querySelector('textarea').value,'');
 await submit();assert.equal(calls.length,0);assert.ok(host.querySelectorAll('[role="alert"]').length>=5);
 const selects=host.querySelectorAll('select');await change(selects[0],'club');await change(selects[1],'lightUse');await change(selects[3],'경기');
 await change(host.querySelector('input[maxlength="100"]'),'LOCAL 새 판매글');await change(host.querySelector('input[inputmode="numeric"]'),'150000');
 assert.equal(host.querySelector('input[inputmode="numeric"]').value,'150,000');await change(host.querySelector('textarea'),'LOCAL 충분한 길이의 상품 설명입니다.');
 const create=URL.createObjectURL,revoke=URL.revokeObjectURL;URL.createObjectURL=()=> 'blob:local';URL.revokeObjectURL=()=>{};
 const file=new File(['local'],'local.png',{type:'image/png',lastModified:1}),picker=host.querySelector('input[type="file"]');Object.defineProperty(picker,'files',{value:[file],configurable:true});await act(async()=>picker.dispatchEvent(new Event('change',{bubbles:true})));
 await submit();assert.equal(calls.length,0);assert.match(host.textContent,/장터 이용안내 및 운영정책을 확인하고 동의해 주세요/);
 await click([...host.querySelectorAll('input[type=checkbox]')].at(-1));
 await submit();assert.equal(calls.length,1);assert.equal(calls[0][0].tradeNoticeConfirmed,true);assert.equal(calls[0][0].price,150000);assert.equal(calls[0][0].publicContactMethod,null);assert.equal(calls[0][0].publicContactValue,'');assert.equal(calls[0][0].publicContactConsent,false);assert.equal(calls[0][1][0],file);
 await act(async()=>root.render(React.createElement(MarketEntryDialog,{kind:'listing',busy:false,error:'LOCAL 등록 실패',onClose:()=>{},onSubmit:(...value)=>calls.push(value)})));
 assert.equal(host.querySelector('input[maxlength="100"]').value,'LOCAL 새 판매글');assert.match(host.textContent,/현재 1\/5장/);assert.equal(host.querySelectorAll('img').length,1);assert.equal([...host.querySelectorAll('input[type=checkbox]')].at(-1).checked,true);
 await unmount();URL.createObjectURL=create;URL.revokeObjectURL=revoke;
});

test('listing edit preserves existing contact without prechecked consent, requires consent on change, and clears opt-out payload',async()=>{
 const calls=[];await mount(React.createElement(MarketEntryDialog,{kind:'listing',item:listingItem,busy:false,onClose:()=>{},onSubmit:value=>calls.push(value)}));
 assert.match(host.textContent,/기존 연락처의 공개 동의가 유지/);assert.equal(host.querySelectorAll('input[type="checkbox"]').length,2);
 await submit();assert.equal(calls[0].publicContactValue,listingItem.publicContactValue);assert.equal(calls[0].publicContactConsent,false);
 await change(host.querySelector('input[type="tel"]'),'01087654321');await submit();assert.equal(calls.length,1);assert.match(host.textContent,/동의해 주세요/);
 const consent=host.querySelectorAll('input[type="checkbox"]')[1];assert.equal(consent.checked,false);await click(consent);await submit();assert.equal(calls.at(-1).publicContactConsent,true);
 await click(host.querySelector('input[type="checkbox"]'));await submit();assert.equal(calls.at(-1).publicContactMethod,null);assert.equal(calls.at(-1).publicContactValue,'');assert.equal(calls.at(-1).publicContactConsent,false);
 await mount(React.createElement(MarketEntryDialog,{kind:'listing',item:{...listingItem,publicContactMethod:'external_url',publicContactValue:'https://example.invalid/legacy'},busy:false,onClose:()=>{},onSubmit:value=>calls.push(value)}));
 await change(host.querySelector('input[maxlength="100"]'),'LOCAL 제목만 수정');await submit();assert.equal(calls.at(-1).publicContactValue,'https://example.invalid/legacy');assert.equal(calls.at(-1).publicContactMethod,'external_url');
});

test('listing cancellation confirms only changed drafts, X/Escape reuse confirmation, busy blocks submission',async()=>{
 let closed=0,calls=0;const props={kind:'listing',busy:false,onClose:()=>closed++,onSubmit:()=>calls++};await mount(React.createElement(MarketEntryDialog,props));
 await click(button('취소'));assert.equal(closed,1);
 await change(host.querySelector('input[maxlength="100"]'),'LOCAL 작성 중');await click(host.querySelector('[aria-label="닫기"]'));assert.equal(closed,1);assert.match(host.textContent,/작성을 취소할까요/);
 await key('Escape');assert.equal(host.querySelectorAll('[role="dialog"]').length,1);assert.equal(closed,1);await key('Escape');await click(button('작성 취소'));assert.equal(closed,2);
 await mount(React.createElement(MarketEntryDialog,{...props,item:listingItem}));await click(button('취소'));assert.equal(closed,3);
 await act(async()=>root.render(React.createElement(MarketEntryDialog,{...props,item:listingItem,busy:true})));await submit();assert.equal(calls,0);assert.equal(button('저장·사진 처리 중…').disabled,true);
});

test('identity observer clears hidden details, checks tab focus, and ignores late auth replies after logout',async()=>{
 let callback,resolve,cleared=0,unsubscribed=0;const identities=[];
 const auth={onAuthStateChange:fn=>{callback=fn;return{data:{subscription:{unsubscribe:()=>{unsubscribed++;}}}};},getUser:()=>new Promise(done=>{resolve=done;})};
 const stop=observeMarketIdentity(auth,id=>identities.push(id),()=>{cleared++;});
 Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});document.dispatchEvent(new Event('visibilitychange'));assert.equal(cleared,1);
 window.dispatchEvent(new Event('focus'));resolve({data:{user:null},error:null});await Promise.resolve();assert.deepEqual(identities,[null]);
 window.dispatchEvent(new Event('focus'));callback('SIGNED_OUT',null);resolve({data:{user:{id:'old-user'}},error:null});await Promise.resolve();assert.deepEqual(identities,[null,null]);
 window.dispatchEvent(new Event('focus'));resolve({data:{user:null},error:new Error('offline')});await Promise.resolve();assert.equal(cleared,2);
 window.dispatchEvent(new Event('focus'));resolve({data:{user:null},error:{name:'AuthSessionMissingError'}});await Promise.resolve();assert.deepEqual(identities,[null,null,null]);
 stop();assert.equal(unsubscribed,1);delete document.visibilityState;
});
test('nested photo viewer: cover/additional image, next/count, topmost Escape and focus return',async()=>{
 let detailClosed=0;const trigger=document.getElementById('trigger');trigger.focus();
 await mount(React.createElement(MarketDialog,{title:'TEST 상세',onClose:()=>{detailClosed++;}},React.createElement(MarketPhotoGallery,{images:['/a.png','/b.png'],title:'TEST 장비'})));
 const cover=host.querySelector('[aria-label="1번 사진 확대"]');await click(cover);assert.equal(host.querySelectorAll('[role="dialog"]').length,2);
 await click(button('다음 사진'));assert.match(host.textContent,/사진 확대 · 2\/2/);
 await key('Escape');assert.equal(detailClosed,0);assert.equal(host.querySelectorAll('[role="dialog"]').length,1);assert.ok(document.activeElement===cover,'focus should return to the cover button');
 await click(host.querySelector('[aria-label="2번 사진 확대"]'));assert.match(host.textContent,/사진 확대 · 2\/2/);await key('Escape');await key('Escape');assert.equal(detailClosed,1);
 await unmount();assert.ok(document.activeElement===trigger,'focus should return to the list trigger');
});
test('photo picker accumulates DOM selections, resets input, removes files and revokes object URLs',async()=>{
 let created=0,revoked=0;const create=URL.createObjectURL,revoke=URL.revokeObjectURL;
 URL.createObjectURL=()=>`blob:unit-${++created}`;URL.revokeObjectURL=()=>{revoked++;};
 function Harness(){const [files,setFiles]=React.useState([]);return React.createElement(MarketPhotoPicker,{files,onChange:setFiles,storedCount:3});}
 await mount(React.createElement(Harness));const input=host.querySelector('input[type="file"]');
 const choose=async files=>{Object.defineProperty(input,'files',{value:files,configurable:true});await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));};
 const a=new File(['image'],'a.png',{type:'image/png',lastModified:1}),b=new File(['image'],'b.png',{type:'image/png',lastModified:2});
 await choose([a]);await choose([b]);assert.match(host.textContent,/현재 5\/5장/);assert.equal(host.querySelectorAll('img').length,2);assert.equal(input.value,'');
 await choose([a]);assert.match(host.textContent,/이미 선택/);await click(button('1번 선택 취소'));assert.equal(revoked,1);await choose([a]);assert.equal(host.querySelectorAll('img').length,2);
 await unmount();assert.equal(created,revoked);URL.createObjectURL=create;URL.revokeObjectURL=revoke;
});
test('saved entry locks input and retry submits once without losing chosen values',async()=>{
 let submitted=0;await mount(React.createElement(MarketEntryDialog,{kind:'listing',busy:false,saved:true,onClose:()=>{},onSubmit:()=>{submitted++;}}));
 assert.equal(host.querySelector('fieldset').disabled,true);assert.equal(button('남은 사진 재시도').disabled,false);
 await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));assert.equal(submitted,1);await unmount();
});
test('contact panel separates owner/anonymous/ended states without displaying raw contact by default',async()=>{
 const contact={publicContactMethod:'external_url',publicContactValue:'https://example.invalid/local-contact'};
 await mount(React.createElement(MarketContactPanel,{contact,owner:true,ended:false,authenticated:true,onEdit:()=>{}}));assert.match(host.textContent,/내 연락 방법/);assert.equal(host.querySelector('a'),null);assert.equal(host.textContent.includes(contact.publicContactValue),false);await unmount();
 await mount(React.createElement(MarketContactPanel,{contact:{publicContactMethod:null,publicContactValue:null},owner:false,ended:false,authenticated:false}));assert.match(host.textContent,/로그인한 정상 활동 회원/);assert.equal(host.querySelector('a'),null);await unmount();
 await mount(React.createElement(MarketContactPanel,{contact,owner:false,ended:true,authenticated:true}));assert.match(host.textContent,/종료된 글/);assert.equal(host.querySelector('a'),null);await unmount();
});
test('search form prevents IME Enter, submits trimmed keyword, and exposes reset and per-board statuses',async()=>{
 const calls=[];const query={view:'buy',keyword:'  골프  ',category:'all',region:'전체',status:'all'};
 await mount(React.createElement(MarketListSearch,{query,onApply:value=>calls.push(value)}));const input=host.querySelector('input[type="search"]');
 const composing=new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true});await act(async()=>input.dispatchEvent(composing));assert.equal(composing.defaultPrevented,true);assert.equal(calls.length,0);
 await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));assert.equal(calls[0].keyword,'골프');
 await click(button('상세조건 펼치기'));assert.match(host.textContent,/요청 종료/);assert.equal(host.textContent.includes('예약중'),false);
 await click(button('조건 초기화'));assert.equal(calls.at(-1).keyword,'');assert.equal(calls.at(-1).status,'all');await unmount();
});


test('listing notice and contact evidence are separate; no evidence is never auto-approved',async()=>{
 const calls=[];const item={...listingItem,publicContactConsentValid:false,tradeNoticeConfirmed:false};
 await mount(React.createElement(MarketEntryDialog,{kind:'listing',item,busy:false,onClose:()=>{},onSubmit:v=>calls.push(v)}));
 const checks=()=>[...host.querySelectorAll('input[type=checkbox]')];
 assert.equal(checks()[1].checked,false);assert.equal(checks()[2].checked,false);
 await submit();assert.equal(calls.length,0);assert.match(host.textContent,/공개 연락처 안내/);assert.match(host.textContent,/장터 이용안내 및 운영정책을 확인하고 동의해 주세요/);
 await click(checks()[0]);assert.equal(host.querySelector('input[type=tel]'),null);assert.doesNotMatch(host.textContent,/공개 연락처 안내를 확인하고 동의해 주세요/);
 await click(checks().at(-1));await submit();assert.equal(calls.length,1);assert.equal(calls[0].publicContactMethod,null);assert.equal(calls[0].tradeNoticeConfirmed,true);
 await click(checks()[0]);await submit();assert.equal(calls.length,1);assert.match(host.textContent,/공개 연락처 안내/);
 await click(checks()[1]);await submit();assert.equal(calls.length,2);
});

test('listing nationwide persists in edit; notice confirmation survives partial failure and retry',async()=>{
 const item={...listingItem,region:'전국',publicContactMethod:null,publicContactValue:null,publicContactConsentValid:false,tradeNoticeConfirmed:false};const calls=[];
 const props={kind:'listing',item,busy:false,onClose:()=>{},onSubmit:v=>calls.push(v)};
 await mount(React.createElement(MarketEntryDialog,props));
 assert.equal(host.querySelectorAll('select')[3].value,'전국');
 await submit();assert.equal(calls.length,0);await click([...host.querySelectorAll('input[type=checkbox]')].at(-1));await submit();
 assert.equal(calls[0].region,'전국');assert.equal(calls[0].publicContactConsent,false);
 await act(async()=>root.render(React.createElement(MarketEntryDialog,{...props,saved:true,error:'LOCAL 사진 부분 실패'})));
 assert.equal([...host.querySelectorAll('input[type=checkbox]')].at(-1).checked,true);await click(button('남은 사진 재시도'));assert.equal(calls.length,2);
});


test('policy popup preserves the same form and ordered File objects; Escape closes only policy and returns focus',async()=>{
 let closed=0;const calls=[];
 await mount(React.createElement(MarketEntryDialog,{kind:'listing',item:{...listingItem,tradeNoticeVersion:'market-trade-v1'},busy:false,onClose:()=>closed++,onSubmit:(...args)=>calls.push(args)}));
 const checkbox=()=>[...host.querySelectorAll('input[type=checkbox]')].at(-1);
 assert.equal(checkbox().checked,false);
 const form=host.querySelector('form');await change(host.querySelector('input[maxlength="100"]'),'LOCAL 보존할 제목');
 const create=URL.createObjectURL,revoke=URL.revokeObjectURL;URL.createObjectURL=f=>'blob:'+f.name;URL.revokeObjectURL=()=>{};
 try {
  const files=[new File(['a'],'first.png',{type:'image/png'}),new File(['b'],'second.png',{type:'image/png'})];
  const picker=host.querySelector('input[type=file]');Object.defineProperty(picker,'files',{value:files,configurable:true});await act(async()=>picker.dispatchEvent(new Event('change',{bubbles:true})));
  const trigger=button('내용 보기');trigger.focus();await click(trigger);
  assert.equal(host.querySelectorAll('[role=dialog]').length,2);assert.equal(checkbox().checked,false);
  assert.equal(host.querySelector('[data-market-policy-version]').dataset.marketPolicyVersion,'market-policy-v1');
  await key('Escape');assert.equal(host.querySelectorAll('[role=dialog]').length,1);assert.equal(document.activeElement,trigger);assert.equal(host.querySelector('form'),form);assert.equal(closed,0);
  await click(checkbox());await submit();assert.equal(calls.length,1);assert.equal(calls[0][0].title,'LOCAL 보존할 제목');assert.deepEqual(calls[0][1],files);
  await click(trigger);await click([...host.querySelectorAll('[role=dialog]')].at(-1).querySelector('button[aria-label="닫기"]'));
  assert.equal(checkbox().checked,true);assert.equal(host.querySelector('form'),form);assert.equal(closed,0);
 } finally {await unmount();URL.createObjectURL=create;URL.revokeObjectURL=revoke;}
});
