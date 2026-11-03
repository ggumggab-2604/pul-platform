import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function load(file,mocks={}){const code=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;const m={exports:{}};new Function('require','module','exports',code)(id=>mocks[id]??require(id),m,m.exports);return m.exports;}
const A=load('./scoreAverages.ts');
const P=load('../practice/records.ts',{'@/lib/clubs/scoreAverages':A});
const row=(id,date,score,more={})=>({sourceKey:'monthly:'+id,personId:'person-a',kind:'monthly',eventId:'event-'+id,sourceId:id,date,score,title:'가상 경기',course:'가상 구장',division:null,...more});
test('연간 전체와 이전 경기 평균 분리·공인 최근5 제한 없음',()=>{
 const rows=[62,61,60,59,58,57,56,55].map((n,i)=>row(String(i),`2026-${String(i+1).padStart(2,'0')}-15`,n));
 assert.equal(A.average(rows).count,8);assert.equal(A.officialComparison(rows,rows[6]).count,6);assert.equal(A.officialComparison(rows,rows[0]).average,null);
 const past=A.officialComparison(rows,rows[2]);assert.equal(past.average,62);assert.equal(past.count,2);
});
test('반올림은 표시 정수와 비교·0/1/2건·개선 악화 동일',()=>{
 assert.deepEqual(A.compare([],56),{count:0,average:null,direction:null,boundary:false});
 assert.equal(A.compare([{score:60}],59).direction,'up');
 assert.deepEqual(A.compare([{score:59},{score:60}],60),{count:2,average:60,direction:null,boundary:false});
 assert.equal(A.compare([60,59,60,59,59].map(score=>({score})),59).direction,null);
 assert.equal(A.compare([60,59,60,59,59].map(score=>({score})),56).average,59);
 assert.equal(A.compare([{score:59}],60).direction,'down');
});
test('월례회·대회·부문·계정 분리, 같은 이름으로 합치지 않음',()=>{
 const rows=[row('m','2026-01-01',60),row('t','2026-01-02',80,{kind:'tournament',division:'일반부'}),row('s','2026-01-03',40,{kind:'tournament',division:'시니어부'}),row('b','2026-01-01',20,{personId:'person-b'})];
 assert.equal(A.officialScope(rows,'person-a','monthly',2026).length,1);
 assert.equal(A.average(A.officialScope(rows,'person-a','tournament',2026,'일반부')).average,80);
});
test('공인 새 연도 초기화·같은 날짜/미래 제외',()=>{
 const rows=[row('old','2026-12-31',60),row('a','2027-01-01',56),row('b','2027-01-01',80),row('future','2027-02-01',40)];
 assert.equal(A.officialComparison(rows,rows[1]).count,0);assert.equal(A.officialComparison(rows,rows[3]).count,2);
});
test('월례회 이전3달과 빈 달 유지·연도 경계',()=>{
 const r=row('jan','2027-01-15',58),rows=[row('oct','2026-10-01',60),row('dec','2026-12-01',59),r];
 const result=A.recentMonthly(rows,r);assert.deepEqual(result.map(r=>r.month),['2026-12','2026-11','2026-10']);assert.deepEqual(result.map(r=>r.records.length),[1,0,1]);
});
test('같은 날 경계 그룹을 자르거나 더 오래된 날짜로 채우지 않음',()=>{
 const rows=[{date:'2026-01-03',score:50},{date:'2026-01-02',score:60},{date:'2026-01-02',score:70},{date:'2026-01-01',score:40}];
 const result=A.beforeLimit(rows,'2026-02-01',2);assert.equal(result.items.length,1);assert.equal(result.boundary,true);
 const exact=A.beforeLimit(rows,'2026-02-01',3);assert.equal(exact.items.length,3);assert.equal(exact.boundary,false);
});
test('동일 원본 중복 제거, 충돌이나 같은 대회 중복을 임의 최저/마지막으로 선택하지 않음',()=>{
 const r=row('a','2026-01-01',60);assert.equal(A.uniqueOriginals([r,{...r}]).length,1);
 assert.throws(()=>A.uniqueOriginals([r,{...r,score:20}]));assert.throws(()=>A.uniqueOriginals([r,{...r,sourceKey:'another'}]));
});
test('대회 최근3개는 같은 부문·현재 제외·다른 부문 행 미집계',()=>{
 const rows=[0,1,2,3].map(i=>row(String(i),`2026-0${i+1}-01`,60+i,{kind:'tournament',division:'일반부'}));
 const extra={...rows[2],sourceKey:'other',sourceId:'other',division:'시니어부'};
 assert.deepEqual(A.recentTournaments([...rows,extra],rows[3]).items.map(r=>r.eventId),['event-2','event-1','event-0']);
});
test('연간 원본1001건에서도 전체 평균, 표시 페이지의50건과 분리',()=>{
 const rows=Array.from({length:1001},(_,i)=>row(String(i),'2026-01-01',i<50?40:60));
 assert.equal(A.average(rows).count,1001);assert.equal(A.average(rows).average,59);assert.equal(A.average(rows.slice(0,50)).average,40);
});
test('연습은 연도연속 이전최대5·6번째부터 오래된 성적 제외·9/36홀 별도',()=>{
 const rows=[['2026-12-01',60],['2026-12-05',59],['2026-12-10',60],['2026-12-15',59],['2026-12-20',59],['2027-01-01',56],['2027-01-02',64]].map(([date,score],i)=>({id:String(i),date,score,condition:'outdoor_18_single'}));
 assert.equal(P.practiceComparison(rows,rows[5]).average,59);assert.equal(P.practiceComparison(rows,rows[6]).count,5);assert.equal(P.practiceComparison(rows,rows[6]).direction,'down');
 assert.equal(P.practiceComparison([...rows,{id:'9',date:'2026-12-22',score:10,condition:'outdoor_9_single'}],rows[5]).average,59);
 assert.equal(P.practiceComparison(rows,{...rows[6],condition:'outdoor_36'}).average,null);
});
test('연습 수정·삭제·동일 날짜 재계산, 다른 원본과 혼합0',()=>{
 const rows=[{id:'a',date:'2026-12-01',score:59,condition:'outdoor_18_single'},{id:'b',date:'2026-12-02',score:61,condition:'outdoor_18_single'},{id:'c',date:'2026-12-03',score:56,condition:'outdoor_18_single'}];
 assert.equal(P.practiceComparison(rows,rows[2]).average,60);rows[0].score=69;assert.equal(P.practiceComparison(rows,rows[2]).average,65);assert.equal(P.practiceComparison(rows.slice(1),rows[2]).average,61);
 assert.equal(P.practiceComparison([...rows,{...rows[0],id:'same',date:rows[2].date}],rows[2]).count,2);
});
test('원본/개인 왕복은 회원/경기/참가행/날짜/부문을 구분',()=>{
 const r=row('participant-b','2026-07-08',60,{kind:'tournament',personId:'other-member',eventId:'actual-event',division:'시니어부'});
 const href=A.memberScoreHref('club',r),q=new URL(href,'http://localhost').searchParams;
 assert(href.startsWith('/clubs/club/ranking/other-member?'));assert.equal(q.get('event'),'actual-event');assert.equal(q.get('source'),'participant-b');assert.equal(q.get('division'),'시니어부');assert.equal(q.get('year'),'2026');
 const source=A.officialSourceHref('club',r);assert(source.includes('tournament=actual-event'));assert(source.endsWith('#entry-participant-b'));
 const m=A.officialSourceHref('club',{...r,kind:'monthly',eventId:'sheet-id',sourceId:'sheet-id',division:null});assert(m.includes('sheet=sheet-id'));assert(m.endsWith('#score-other-member'));
});
test('입력 검증은 잘못된 날짜·소수·빈칸을 거절',()=>{
 const good={date:'2026-11-03',course:'구장',condition:'outdoor_18_single',score:59,memo:''};assert.equal(P.practiceErrors(good).length,0);
 for(const patch of [{date:'2026-02-30'},{score:0},{score:59.5},{course:''},{condition:'unknown'}])assert(P.practiceErrors({...good,...patch}).length);
});
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const display=load('../../components/clubs/scores/ScoreComparison.tsx',{'./ScoreComparison.module.css':{__esModule:true,default:{up:'red',down:'blue',mean:'small'}}});
test('화면은 현재 타수/작은 실제 비교평균/접근 가능한 방향을 표시',()=>{
 const html=renderToStaticMarkup(React.createElement(display.ScoreComparison,{score:56,comparison:{count:2,average:60,direction:'up',boundary:false}}));
 assert.match(html,/56/);assert.match(html,/이전 2경기 평균 60타/);assert.match(html,/aria-label="비교 평균보다 낮은 타수, 개선"/);assert.match(html,/▲/);
});
test('개인 서버 조회는 계정 전환 시 RPC0회, 조회 오류를 빈 목록으로 바꾸지 않음',async()=>{
 let calls=0;const ctx={userId:'account-a',supabase:{rpc:async()=>{calls++;return {data:null,error:{code:'42501'}};}}};
 const server=load('../practice/server.ts',{'server-only':{},'@/lib/supabase/auth':{getAuthenticatedSupabaseContext:async()=>ctx}});
 await assert.rejects(server.loadPracticeRecords(undefined,'account-b'));assert.equal(calls,0);
 await assert.rejects(server.loadPracticeRecords(undefined,'account-a'));assert.equal(calls,1);
});
test('서버 쓰기는 다른 로그인 주체/유효하지 않은 입력을 RPC 전에 차단',async()=>{
 let calls=0;const ctx={userId:'account-a',supabase:{rpc:async()=>{calls++;throw Error('unexpected write');}}};
 const action=load('../../app/my/practice/actions.ts',{'@/lib/supabase/auth':{getAuthenticatedSupabaseContext:async()=>ctx},'@/lib/practice/server':{},'@/lib/practice/records':P});
 const body={id:null,version:0,date:'2026-11-03',course:'구장',courseKey:null,condition:'outdoor_18_single',score:59,memo:''},id='00000000-0000-4000-8000-000000000001';
 assert((await action.mutatePractice('account-b',id,'create',body)).error);assert.equal(calls,0);
 assert((await action.mutatePractice('account-a',id,'create',{...body,score:59.5})).error);assert.equal(calls,0);
});
test('PT409는 영구 버전 충돌로 안내하고 제출 객체를 변경하지 않음',async()=>{
 const ctx={userId:'account-a',supabase:{rpc:async()=>({data:null,error:{code:'PT409'}})}};
 const action=load('../../app/my/practice/actions.ts',{'@/lib/supabase/auth':{getAuthenticatedSupabaseContext:async()=>ctx},'@/lib/practice/server':{},'@/lib/practice/records':P});
 const body={id:'record-a',version:1,date:'2026-11-03',course:'구장',courseKey:null,condition:'outdoor_18_single',score:55,memo:'입력 유지'},before=JSON.stringify(body);
 const result=await action.mutatePractice('account-a','00000000-0000-4000-8000-000000000001','update',body);
 assert.equal(result.conflict,true);assert.match(result.error,/입력을 유지/);assert.equal(result.data,undefined);assert.equal(JSON.stringify(body),before);
});
