import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
function load(file,mocks={}){const code=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;const m={exports:{}};new Function('require','module','exports',code)(id=>Object.hasOwn(mocks,id)?mocks[id]:require(id),m,m.exports);return m.exports;}
const A=load('./scoreAverages.ts'),M=load('./monthlyScores.ts'),T=load('./tournaments.ts'),P=load('../practice/records.ts',{'@/lib/clubs/scoreAverages':A});
const styles={__esModule:true,default:{}},Link=({href,children})=>React.createElement('a',{href},children),router={replace(){}};
const display=load('../../components/clubs/scores/ScoreComparison.tsx',{'./ScoreComparison.module.css':styles});
const views={
 monthly:load('../../components/clubs/scores/MonthlyScoresView.tsx',{'next/link':{__esModule:true,default:Link},'@/lib/clubs/scoreAverages':A,'./ScoreComparison':display,'@/lib/clubs/monthlyScores':M,'./ScoreDownload':{ScoreDownload:()=>null},'./MonthlyScores.module.css':styles}).MonthlyScoresView,
 tournament:load('../../components/clubs/tournaments/TournamentView.tsx',{'next/link':{__esModule:true,default:Link},'next/navigation':{useRouter:()=>router},'@/app/clubs/[id]/tournaments/actions':{},'@/lib/clubs/tournaments':T,'@/lib/clubs/scoreAverages':A,'@/components/clubs/scores/ScoreComparison':display,'@/components/clubs/scores/ScoreDownload':{ScoreDownload:()=>null},'./Tournaments.module.css':styles}).TournamentView,
};
const monthly={clubKey:'club',clubName:'클럽',year:2026,canEdit:false,sheets:[{id:'sheet',date:'2026-06-15',title:'원본 월례회',course:'원본 구장',rows:[{id:'person',userId:'viewer',kind:'member',name:'회원',score:56}]}]};
const tournament={club_key:'club',club_name:'클럽',user_id:'viewer',can_edit:false,tournaments:[{id:'event',played_on:'2026-06-15',title:'원본 대회',course_name:'원본 구장',divisions:['일반부'],entries:[{id:'entry',person_id:'person',user_id:'viewer',kind:'member',display_name:'회원',division:'일반부',attendance:'attended',confirmed:true,place:8,score:56}]}]};
const auth=async()=>({userId:'viewer'});
function server(rpc,context=auth){return load('./scoreAveragesServer.ts',{'server-only':{},'@/lib/supabase/auth':{getAuthenticatedSupabaseContext:async()=>{const ctx=await context();return ctx?{...ctx,supabase:{rpc}}:null;}},'./scoreAverages':A});}
function page(kind,average,original){return load(kind==='monthly'?'../../app/clubs/[id]/scores/page.tsx':'../../app/clubs/[id]/tournaments/page.tsx',{'next/link':{__esModule:true,default:Link},'@/lib/clubs/scoreAveragesServer':average,'@/lib/supabase/auth':{getAuthenticatedSupabaseContext:auth},'@/components/messaging/MessagingSessionBoundary':{MessagingSessionBoundary:({children})=>children},'@/lib/clubs/monthlyScoresServer':{loadMonthlyScores:original},'@/lib/clubs/tournamentsServer':{loadTournaments:original},'@/lib/clubs/monthlyScores':M,'@/components/clubs/scores/MonthlyScoresView':{MonthlyScoresView:views.monthly},'@/components/clubs/tournaments/TournamentView':{TournamentView:views.tournament}}).default;}
for(const kind of ['monthly','tournament']){
 test(`${kind}: 평균 장애/충돌은 실제 원본 HTML 유지, 평균·화살표 없음`,async()=>{
  const conflict={sourceKey:'x',personId:'person',kind:'monthly',eventId:'a',sourceId:'a',date:'2026-01-01',score:60,division:null};
  for(const response of [{data:null,error:{code:'XX000'},status:500},{data:{clubKey:'club',viewerId:'viewer',records:[conflict,{...conflict,score:40}]},error:null}]){
   const Page=page(kind,server(async()=>response),async()=>kind==='monthly'?monthly:tournament);
   const html=renderToStaticMarkup(await Page({params:Promise.resolve({id:'club'}),searchParams:Promise.resolve({year:'2026',month:'6'})}));
   assert.match(html,/<table/);assert.match(html,/原本|원본 (월례회|대회)/);assert.match(html,/56타|56/);assert.match(html,/비교 평균을 불러오지 못했습니다/);assert.doesNotMatch(html,/이전 \d+경기 평균|▲|▼|평균 0|평균 —/);
  }
 });
 test(`${kind}: 원본 거절/실패는 표가 아니며 보조 평균 호출0`,async()=>{
  for(const message of ['현재 회원만 조회','원본 조회 실패']){
   let calls=0;const Page=page(kind,{loadTableComparisons:async()=>{calls++;return {}; }},async()=>{throw Error(message);});
   const html=renderToStaticMarkup(await Page({params:Promise.resolve({id:'club'}),searchParams:Promise.resolve({})}));assert.match(html,new RegExp(message));assert.doesNotMatch(html,/<table/);assert.equal(calls,0);
  }
 });
 test(`${kind}: 보조 조회의 인증/권한 거절은 정상표로 바꾸지 않음`,async()=>{
  for(const response of [{error:{code:'42501'},status:403},{error:{code:'PGRST301'},status:401},{error:{code:'28000'}},{error:{code:'other'},status:401}]){
   const Page=page(kind,server(async()=>response),async()=>kind==='monthly'?monthly:tournament);
   const html=renderToStaticMarkup(await Page({params:Promise.resolve({id:'club'}),searchParams:Promise.resolve({})}));assert.doesNotMatch(html,/<table/);assert.match(html,/회원만 공인 성적/);
  }
 });
}
test('인증 주체 없음·응답 주체 불일치·throw된 인증 오류는 fallback 금지',async()=>{
 const missing=server(async()=>assert.fail('RPC should not run'),async()=>null);await assert.rejects(missing.loadTableComparisons('club','monthly','viewer'));
 const mismatch=server(async()=>({data:{clubKey:'club',viewerId:'other',records:[]}}));await assert.rejects(mismatch.loadTableComparisons('club','monthly','viewer'));
 const thrown=server(async()=>{throw {code:'42501'};});await assert.rejects(thrown.loadTableComparisons('club','monthly','viewer'));
});
test('경기·참가행 문맥 불일치는 보조 평균 없이 기존 오류로 차단',async()=>{
 for(const [kind,query] of [['monthly',{year:'2026',month:'6',sheet:'wrong-sheet'}],['tournament',{tournament:'event',entry:'wrong-entry'}]]){
  let calls=0;const Page=page(kind,{loadTableComparisons:async()=>{calls++;return {};}},async()=>kind==='monthly'?monthly:tournament);
  const html=renderToStaticMarkup(await Page({params:Promise.resolve({id:'club'}),searchParams:Promise.resolve(query)}));assert.doesNotMatch(html,/<table/);assert.match(html,/선택한/);assert.equal(calls,0);
 }
});

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const record=(score=56)=>({id:'record',date:'2026-06-15',course:'소유 구장',courseKey:null,score,condition:'outdoor_18_single',memo:'입력 유지',version:1});
const workspace=(score=56)=>({viewerId:'viewer',records:[record(score)]});
function descendants(tree){if(Array.isArray(tree))return tree.flatMap(descendants);if(!tree||typeof tree!=='object')return [];return [tree,...descendants(tree.props?.children)];}
const text=tree=>Array.isArray(tree)?tree.map(text).join(''):typeof tree==='object'&&tree?text(tree.props?.children):String(tree??'');
// Drive the real component handlers with controlled asynchronous server replies; this is not an Auth/browser test.
function harness(){
 let index=0,slots=[],effects=[],queued=[],tree,props={initial:workspace()},updates=0;const loads=[],writes=[],listeners=new Map();
 globalThis.window={addEventListener:(k,f)=>listeners.set(k,f),removeEventListener:(k,f)=>{if(listeners.get(k)===f)listeners.delete(k);},setTimeout:()=>0,confirm:()=>true};
 globalThis.document={visibilityState:'visible',addEventListener(){},removeEventListener(){}};
 const hooks={...React,useState(value){const i=index++;if(!(i in slots))slots[i]=value;return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;updates++;}];},useRef(value){const i=index++;if(!(i in slots))slots[i]={current:value};return slots[i];},useEffect(fn,deps){const i=index++;const old=effects[i];if(!old||deps.some((d,j)=>d!==old.deps[j]))queued.push(()=>{old?.cleanup?.();effects[i]={deps,cleanup:fn()};});}};
 const component=load('../../components/account/PracticeRecords.tsx',{'react':hooks,'next/link':{__esModule:true,default:Link},'next/navigation':{useRouter:()=>router},'@/app/my/practice/actions':{refreshPractice:()=>{const d=deferred();loads.push(d);return d.promise;},mutatePractice:()=>{const d=deferred();writes.push(d);return d.promise;}},'@/lib/clubs/scoreAverages':A,'@/lib/practice/records':P,'@/lib/supabase/client':{},'@/lib/courses/courseDirectory':{},'@/components/clubs/scores/ScoreComparison':display,'@/components/clubs/scores/MonthlyScores.module.css':styles,'@/components/clubs/scores/ScoreAverages.module.css':styles}).PracticeRecords;
 const render=()=>{index=0;tree=component(props);const q=queued;queued=[];q.forEach(fn=>fn());return tree;};
 const button=name=>{const el=descendants(tree).find(e=>e.type==='button'&&text(e)===name);assert(el,'missing button '+name);return el;};
 render();return {loads,writes,render,button,focus:()=>listeners.get('focus')?.(),click:name=>button(name).props.onClick(),submit:()=>descendants(tree).find(e=>e.type==='form').props.onSubmit({preventDefault(){}}),get data(){return slots[0];},get error(){return slots[5];},get updates(){return updates;},unmount:()=>effects.forEach(e=>e?.cleanup?.()),switchViewer(){props={initial:{viewerId:'other',records:[]}};render();}};
}
async function conflicted(){const h=harness();h.click('수정');h.render();h.submit();h.writes[0].resolve({conflict:true,error:'충돌 — 입력 유지'});await flush();h.render();return h;}
test('수동 새로고침 2개 응답 역전·오래된 실패는 최신 성공 유지',async()=>{
 for(const failure of [false,true]){const h=await conflicted();h.click('최신 기록 확인');h.click('최신 기록 확인');h.loads[1].resolve({data:workspace(61)});await flush();if(failure)h.loads[0].reject(Error('오래된 실패'));else h.loads[0].resolve({data:workspace(40)});await flush();assert.equal(h.data.records[0].score,61);assert.equal(h.error,'');h.unmount();}
});
test('focus 조회와 수동 새로고침도 같은 sequence 사용',async()=>{
 const h=await conflicted();h.click('최신 기록 확인');h.focus();h.loads[1].resolve({data:workspace(62)});await flush();h.loads[0].resolve({error:'오래된 실패'});await flush();assert.equal(h.data.records[0].score,62);h.unmount();
});
test('조회 도중 수정/삭제 결과가 도착하면 이전 성공·실패 조회 폐기',async()=>{
 for(const op of ['update','delete'])for(const failure of [false,true]){
  const h=await conflicted();h.click('최신 기록 확인');if(op==='update')h.submit();else h.click('삭제');
  const final=op==='delete'?{viewerId:'viewer',records:[]}:workspace(55);h.writes[1].resolve({data:final,id:'record'});await flush();
  if(failure)h.loads[0].resolve({error:'오래된 조회 실패'});else h.loads[0].resolve({data:workspace(80)});await flush();assert.deepEqual(h.data,final);assert.equal(h.error,'');h.unmount();
 }
});
test('logout/unmount 또는 계정 교체 후 이전 새로고침 응답 반영0',async()=>{
 for(const mode of ['unmount','switchViewer'])for(const failure of [false,true]){
  const h=await conflicted();h.click('최신 기록 확인');h[mode]();const before=h.updates;if(failure)h.loads[0].reject(Error('늦은 실패'));else h.loads[0].resolve({data:workspace(80)});await flush();assert.equal(h.updates,before);h.unmount();
 }
});
test('unmount 후 저장 성공·실패도 이전 화면에 반영0',async()=>{
 for(const failure of [false,true]){const h=harness();h.click('수정');h.render();h.submit();h.unmount();const before=h.updates;if(failure)h.writes[0].reject(Error('늦은 실패'));else h.writes[0].resolve({data:workspace(55)});await flush();assert.equal(h.updates,before);}
});
