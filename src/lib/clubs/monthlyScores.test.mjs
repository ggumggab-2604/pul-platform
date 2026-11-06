import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
const code=ts.transpileModule(readFileSync(new URL('./monthlyScores.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const testModule={exports:{}};new Function('module','exports',code)(testModule,testModule.exports);
const {rankScores,annualScores,annualScoreColumns,selectScoreSheet,monthlyMedals,rankLabel,scorePeriod}=testModule.exports;
const row=(id,name,score,kind='member')=>({id,name,score,kind,userId:kind==='manual'?null:id});
test('competition ranks, Korean tie order, manual peers and missing scores',()=>{
 const result=rankScores([row('1','다',54),row('2','나',56),row('3','가',56,'manual'),row('4','라',60),row('5','마',null)]);
 assert.deepEqual(result.map(p=>[p.name,p.rank]),[['다',1],['가',2],['나',2],['라',4],['마',null]]);
 assert.equal(rankLabel(result[1]),'공동 2위');assert.equal(rankLabel(result[4]),'—');
});
test('annual identity survives name changes, same names stay separate, absent differs from unentered',()=>{
 const a={date:'2026-01-10',rows:[row('1','이전 이름',50),row('2','동명',null,'manual')]},b={date:'2026-02-10',rows:[row('1','새 이름',49),row('3','동명',60,'manual')]};
 const result=annualScores([b,a]);assert.equal(result.length,3);const p=result.find(p=>p.id==='1');assert.equal(p.name,'이전 이름');assert.equal(p.cells[1].score,49);
 assert.equal(result.find(p=>p.id==='2').cells[0].score,null);assert.equal(result.find(p=>p.id==='2').cells[1],null);assert.equal(p.cells.length,12);
});
test('period validation rejects invalid query inputs',()=>{assert.deepEqual(scorePeriod('2026','10'),{year:2026,month:10});for(const p of [['0','1'],['2026','13'],['x','1'],['2026','1.5']])assert.throws(()=>scorePeriod(...p));});
test('November sheets retain separate original links and annual score columns',()=>{
 const sheets=[['a',10,'field',55],['b',24,'field',50],['c',28,'screen',48]].map(([id,day,gameType,score])=>({id,date:`2026-11-${day}`,gameType,rows:[row('1','회원',score)]}));
 assert.equal(selectScoreSheet(sheets,11,'a').id,'a');
 assert.equal(selectScoreSheet(sheets,10,'a'),undefined);
 assert.equal(selectScoreSheet(sheets,11,undefined,'field').id,'b');
 assert.deepEqual(annualScoreColumns(sheets).slice(10,13).map(c=>c.sheet.id),['a','b','c']);
 assert.deepEqual(annualScores(sheets)[0].cells.slice(10,13).map(c=>c.score),[55,50,48]);
});
test('monthly medals use only the latest sheet per kind and distinguish waiting states',()=>{
 const first={id:'a',date:'2026-11-10',gameType:'field',rows:[row('earlier','앞 경기',41)]};
 const latest={id:'b',date:'2026-11-24',gameType:'field',rows:[
  ...[50,50,50,50,51,51,52,52,52].map((n,i)=>row(String(i),String(i),n)),row('manual','수동',53,'manual'),
 ]};
 const screen={id:'c',date:'2026-11-28',gameType:'screen',rows:[row('s','스크린',48)]};
 const data={sheets:[first,latest,screen]};
 const field=monthlyMedals(data,11,'field');
 assert.equal(field.sheet.id,'b');
 assert.deepEqual(field.groups.map(g=>[g.score,g.winners.length]),[[50,4],[51,2],[52,3]]);
 assert.deepEqual([...new Set(rankScores(latest.rows).map(rankLabel))],['공동 1위','공동 5위','공동 7위','10위']);
 assert.equal(monthlyMedals(data,11,'screen').sheet.id,'c');
 assert.equal(monthlyMedals(data,10,'screen').status,'empty');
 assert.equal(monthlyMedals({...data,pendingMedalEvents:[{date:'2026-11-27',gameType:'field'}]},11,'field').status,'unregistered');
 assert.equal(monthlyMedals({...data,pendingMedalEvents:[{date:'2026-11-27',gameType:'field'}]},11,'screen').status,'ready');
 assert.equal(monthlyMedals({sheets:[...data.sheets,{...latest,id:'same-day'}]},11,'field').status,'ambiguous');
 assert.equal(monthlyMedals({sheets:[...data.sheets,{...latest,date:'2026-11-30',gameType:null}]},11,'field').status,'unclassified');
 for(const rows of [[row('u','미입력',null)], [...latest.rows,row('u','미입력',null)]]) {
  assert.equal(monthlyMedals({sheets:[first,{...latest,rows}]},11,'field').status,'incomplete');
 }
});
test('print JPG keeps pixels and sets 300dpi for existing or absent JFIF metadata',()=>{
 const source=ts.transpileModule(readFileSync(new URL('./monthlyScoresJpeg.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 const exports={};new Function('exports',source)(exports);const original=new Uint8Array([255,216,255,224,0,16,74,70,73,70,0,1,1,0,0,1,0,1,0,0,255,217]);const converted=exports.printJpeg(original);
 assert.deepEqual([...converted.slice(13,18)],[1,1,44,1,44]);assert.equal(original[13],0);assert.equal(converted.length,original.length);
 const bare=new Uint8Array([255,216,255,217]);const inserted=exports.printJpeg(bare);assert.deepEqual([...inserted.slice(-2)],[255,217]);assert.equal(inserted.length,22);assert.throws(()=>exports.printJpeg(new Uint8Array([0,0])));
});
