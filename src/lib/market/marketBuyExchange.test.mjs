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
const actions={marketInterestStateAction:async()=>false,setInterestAction:async(k,id,s)=>s,listInterestsAction:async()=>({items:[],hasMore:false}),submitBuyRequestReportAction:async()=>({ok:true})};
const cache=new Map();
function load(file){
 const absolute=path.resolve(repo,file);if(cache.has(absolute))return cache.get(absolute);
 const exports={};cache.set(absolute,exports);
 const text=readFileSync(absolute,'utf8');const output=ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('require','exports','module',output)(name=>{
   if(name==='server-only')return {};
   if(name==='@/app/my/interestActions'||name==='@/app/market/buyRequestReportActions')return actions;
   if(name==='next/link')return {__esModule:true,default:({children,prefetch,...props})=>{void prefetch;return React.createElement('a',props,children);}};
   if(name.startsWith('@/'))return load('src/'+name.slice(2)+'.'+(name.startsWith('@/components/')?'tsx':'ts'));
   if(name.startsWith('.')){const target=path.resolve(path.dirname(absolute),name);return load(path.relative(repo,target+(name.endsWith('.ts')||name.endsWith('.tsx')?'':absolute.includes('/components/')||absolute.includes('\\components\\')?'.tsx':'.ts')));}
   return require(name);
 },exports,{exports});return exports;
}


const {MarketEntryDialog}=load('src/components/market/MarketEntryDialog.tsx');

const {MarketListSearch}=load('src/components/market/MarketListSearch.tsx');

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


const {BuyRequestDetailModal}=load('src/components/market/BuyRequestDetailModal.tsx');
const {validateBuyExchangeInput,parseBuyExchange,mutateBuyExchange}=load('src/lib/market/marketBuyExchange.ts');
const {parseMarketQuery,marketHref}=load('src/lib/market/marketNavigation.ts');
const buy={id:listingItem.id,title:'LOCAL 구매 희망',category:'bag',region:'전국',budget:'50,000원',budgetAmount:50000,budgetNegotiable:false,summary:'LOCAL 원하는 구매 물품과 조건입니다.',requestType:'buy',exchangeWanted:null,tradeType:'negotiable',publicContactMethod:null,publicContactValue:null,publicContactConsentValid:false,tradeNoticeConfirmed:true,tradeNoticeVersion:'market-policy-v1',images:[],requestStatus:'open',version:1,canEdit:true,authorNickname:'LOCAL 회원',createdAt:'2026년 10월 1일'};
const props={kind:'buy',busy:false,onClose:()=>{},onSubmit:()=>{}};
const label=text=>[...host.querySelectorAll('label')].find(x=>x.firstChild?.textContent.includes(text));
const field=text=>label(text)?.querySelector('input,select,textarea');
const checks=text=>[...host.querySelectorAll('label')].find(x=>x.textContent.includes(text))?.querySelector('input[type=checkbox]');
const choose=async(file)=>{URL.createObjectURL=()=> 'blob:local-ap';URL.revokeObjectURL=()=>{};const picker=host.querySelector('input[type=file]');Object.defineProperty(picker,'files',{value:[file],configurable:true});await act(async()=>picker.dispatchEvent(new Event('change',{bubbles:true})));};

test('new types retain separate drafts/files; submit only selected type; comma and null negotiated budget',async()=>{
 const calls=[];await mount(React.createElement(MarketEntryDialog,{...props,onSubmit:(...x)=>calls.push(x)}));
 assert.equal(field('제목').placeholder,'');assert.equal(host.querySelector('input[type=file]'),null);assert.equal(host.querySelector('input[type=tel]'),null);
 await change(field('카테고리'),'bag');await change(field('제목'),'LOCAL 두 유형 보존');await change(field('거래 지역'),'전국');await change(field('희망 예산'),'123000');assert.equal(field('희망 예산').value,'123,000');await change(field('구매 희망 내용'),'LOCAL 원하는 모델과 규격과 상태입니다.');
 await change(field('글 유형'),'exchange');await change(field('보유 물품 설명'),'LOCAL 보유 가방의 상태와 구성품입니다.');await change(field('원하는 교환 물품'),'LOCAL 공과 가방의 교환을 원합니다.');const file=new File(['png'],'test.png',{type:'image/png',lastModified:1});await choose(file);
 await change(field('글 유형'),'buy');assert.equal(field('희망 예산').value,'123,000');assert.match(field('구매 희망 내용').value,/원하는 모델/);await submit();assert.equal(calls.length,0);await click(checks('장터 이용안내 및 운영정책을 읽고'));await submit();assert.equal(calls[0][0].budget,123000);assert.equal(calls[0][0].exchangeWanted,null);assert.equal(calls[0][1].length,0);
 await click(checks('예산 협의'));await submit();assert.equal(calls.at(-1)[0].budget,null);assert.equal(calls.at(-1)[0].budgetNegotiable,true);
 await change(field('글 유형'),'exchange');assert.match(field('보유 물품 설명').value,/보유 가방/);assert.match(host.textContent,/현재 1\/5장/);await submit();assert.equal(calls.at(-1)[0].budget,null);assert.equal(calls.at(-1)[0].budgetNegotiable,false);assert.equal(calls.at(-1)[1][0],file);
});
test('edit restores immutable type and valid contact; changed method/number require consent; off clears only payload',async()=>{
 const calls=[];await mount(React.createElement(MarketEntryDialog,{...props,item:{...buy,publicContactMethod:'sms',publicContactValue:'01012345678',publicContactConsentValid:true},onSubmit:v=>calls.push(v)}));
 assert.equal(field('글 유형').disabled,true);assert.equal(host.querySelector('input[type=tel]').value,'01012345678');await submit();assert.equal(calls.at(-1).publicContactMethod,'sms');assert.equal(calls.at(-1).publicContactConsent,false);
 await change(host.querySelector('input[type=tel]'),'01087654321');await submit();assert.equal(calls.length,1);assert.match(host.textContent,/동의해 주세요/);
 await click(checks('전화·문자 문의도 받기'));await submit();assert.equal(calls.at(-1).publicContactMethod,null);assert.equal(calls.at(-1).publicContactValue,'');assert.equal(calls.at(-1).publicContactConsent,false);
 await mount(React.createElement(MarketEntryDialog,{...props,item:{...buy,tradeNoticeConfirmed:false,tradeNoticeVersion:null},onSubmit:v=>calls.push(v)}));const count=calls.length;await submit();assert.equal(calls.length,count);await click(checks('장터 이용안내 및 운영정책을 읽고'));await submit();assert.equal(calls.length,count+1);
});
test('policy and cancel dialogs preserve drafts/files/focus; saved retry locks fields; deferred removal cancellable',async()=>{
 const calls=[];const item={...buy,requestType:'exchange',budget:'교환합니다',budgetAmount:null,exchangeWanted:'LOCAL 원하는 교환 조건과 물품입니다.',images:['/market/exchange-media/'+buy.id+'/00000000-0000-4000-8000-000000000011']};
 await mount(React.createElement(MarketEntryDialog,{...props,item,onSubmit:(...x)=>calls.push(x)}));await change(field('제목'),'LOCAL 편집 보존');const file=new File(['png'],'draft.png',{type:'image/png',lastModified:2});await choose(file);await click(checks('1번 기존 사진 삭제'));assert.equal(host.querySelector('[aria-label="1번 사진 확대"]'),null);
 const policyButton=button('내용 보기');policyButton.focus();await click(policyButton);assert.equal(host.querySelectorAll('[role=dialog]').length,2);await key('Escape');assert.equal(document.activeElement,policyButton);assert.equal(field('제목').value,'LOCAL 편집 보존');assert.match(host.textContent,/현재 1\/5장/);
 await click(button('취소'));assert.equal(host.querySelectorAll('[role=dialog]').length,2);await key('Escape');await submit();assert.equal(calls.at(-1)[0].removeMediaIds.length,1);assert.equal(calls.at(-1)[1][0],file);
 await act(async()=>root.render(React.createElement(MarketEntryDialog,{...props,item,saved:true,error:'LOCAL 사진 실패',onSubmit:(...x)=>calls.push(x)})));assert.equal(field('제목').value,'LOCAL 편집 보존');assert.equal(field('제목').closest('fieldset').disabled,true);await click(button('남은 사진 재시도'));assert.equal(calls.at(-1)[1][0],file);
});
test('buy/exchange details have correct owner actions, no empty gallery/contact, 1/4-photo cover and zoom focus',async()=>{
 const detailProps={item:buy,authenticated:true,onClose:()=>{},onEdit:()=>{},onEnd:()=>{},onDelete:()=>{}};await mount(React.createElement(BuyRequestDetailModal,detailProps));assert.ok(button('내용 수정'));assert.equal([...host.querySelectorAll('a')].find(x=>x.textContent==='쪽지 보내기'),undefined);assert.equal(host.querySelector('img'),null);assert.doesNotMatch(host.textContent,/관심글|글 신고/);
 await mount(React.createElement(BuyRequestDetailModal,{...detailProps,item:{...buy,canEdit:false}}));assert.equal(button('내용 수정'),undefined);assert.match(host.querySelector('a[href^="/messages/new"]').href,/request=/);assert.match(host.textContent,/관심글|글 신고/);assert.doesNotMatch(host.textContent,/등록된 연락처|등록된 사진/);
 for(const count of [0,1,4]){await mount(React.createElement(BuyRequestDetailModal,{...detailProps,item:{...buy,requestType:'exchange',exchangeWanted:'LOCAL 교환 조건을 펼쳐서 표시합니다.',images:Array.from({length:count},(_,n)=>'/photo'+n+'.png')}}));assert.ok(host.textContent.includes('원하는 교환 물품·조건'));if(!count){assert.equal(host.querySelector('img'),null);continue;}assert.equal(host.querySelector('img').getAttribute('src'),'/photo0.png');const cover=host.querySelector('[aria-label="1번 사진 확대"]');cover.focus();await click(cover);assert.equal(host.querySelectorAll('[role=dialog]').length,2);await key('Escape');assert.equal(document.activeElement,cover);if(count===4){await click(host.querySelector('[aria-label="4번 사진 보기"]'));assert.equal(host.querySelector('img').getAttribute('src'),'/photo3.png');}}
});
test('type and nationwide filters roundtrip, without changing sale filters',async()=>{
 const q=parseMarketQuery(new URLSearchParams('view=buy&buy_type=exchange&buy_region=전국&sale_q=가방'));assert.equal(q.requestType,'exchange');assert.equal(q.region,'전국');const href=marketHref('sale_q=가방','buy',q);assert.ok(href.includes('buy_type=exchange'));assert.equal(new URL(href,'http://localhost').searchParams.get('sale_q'),'가방');assert.equal(parseMarketQuery(new URLSearchParams('view=buy&buy_region=전체')).region,'전체');await mount(React.createElement(MarketListSearch,{query:q,onApply:()=>{}}));assert.equal(button('교환합니다').getAttribute('aria-pressed'),'true');
});
test('adapter sends nullable budget/policy/type; server errors remain errors; rejects invalid boundary input',async()=>{
 const input={...buy,budget:50000,publicContactValue:'',publicContactConsent:false,removeMediaIds:[]};assert.equal(validateBuyExchangeInput(input).budget,50000);for(const bad of [{budget:0},{budget:null},{requestType:'sale'},{tradeNoticeConfirmed:false},{region:'전체'},{publicContactMethod:'phone',publicContactValue:'01012345678'}])assert.throws(()=>validateBuyExchangeInput({...input,...bad}));
 let args;const fake={rpc:async(name,a)=>{args={name,a};return {data:{request_id:a.p_request_id,buy_request_id:buy.id,request_status:'open',version:1,replayed:false},error:null};}};await mutateBuyExchange(fake,'create',null,null,{...input,budget:null,budgetNegotiable:true},buy.id);assert.equal(args.name,'mutate_market_buy_request_v3');assert.equal(args.a.p_payload.budget,null);assert.equal(args.a.p_payload.trade_notice_version,'market-policy-v1');fake.rpc=async()=>({data:null,error:{code:'XX000'}});await assert.rejects(()=>mutateBuyExchange(fake,'create',null,null,input,buy.id));assert.throws(()=>parseBuyExchange({...buy}));
});
test('interest allowlist/hidden redaction and message context select dedicated server RPCs',async()=>{
 const {listInterests,setInterest}=load('src/lib/interests/interests.ts');let called;const fake={rpc:async(n,a)=>{called={n,a};return {data:{id:buy.id,saved:true},error:null};}};await setInterest(fake,'buy_request',buy.id,true);assert.equal(called.n,'set_buy_request_interest');assert.equal(called.a.p_buy_request_id,buy.id);await assert.rejects(()=>setInterest(fake,'arbitrary_table',buy.id,true));fake.rpc=async()=>({data:{items:[{kind:'buy_request',id:buy.id,saved_at:'2026-10-01',available:false,title:'hidden',request_type:'exchange',image_path:'hidden',price:900}],has_more:false},error:null});const page=await listInterests(fake);assert.equal(page.items[0].title,null);assert.equal(page.items[0].image,null);assert.equal(page.items[0].requestType,undefined);
 const {getBuyRequestMessageComposeContext,sendBuyRequestMessage}=load('src/lib/messaging/messaging.ts');fake.rpc=async(n,a)=>{called={n,a};return {data:{available:true,buy_request_id:buy.id,title:'LOCAL 교환',status:'open',request_type:'exchange'},error:null};};assert.equal((await getBuyRequestMessageComposeContext(fake,buy.id)).requestType,'exchange');assert.equal(called.n,'get_buy_request_message_compose_context');fake.rpc=async(n,a)=>{called={n,a};return {data:{id:buy.id,created_at:'2026-10-01T00:00:00Z'},error:null};};await sendBuyRequestMessage(fake,{buyRequestId:buy.id,body:'LOCAL 문의',requestId:buy.id});assert.equal(called.n,'send_market_buy_request_message');assert.equal(Object.hasOwn(called.a,'recipient_id'),false);
});
