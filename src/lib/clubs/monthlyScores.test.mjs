import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
const code=ts.transpileModule(readFileSync(new URL('./monthlyScores.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const testModule={exports:{}};new Function('module','exports',code)(testModule,testModule.exports);
const {rankScores,annualScores,rankLabel,scorePeriod}=testModule.exports;
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
test('print JPG keeps pixels and sets 300dpi for existing or absent JFIF metadata',()=>{
 const source=ts.transpileModule(readFileSync(new URL('./monthlyScoresJpeg.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 const exports={};new Function('exports',source)(exports);const original=new Uint8Array([255,216,255,224,0,16,74,70,73,70,0,1,1,0,0,1,0,1,0,0,255,217]);const converted=exports.printJpeg(original);
 assert.deepEqual([...converted.slice(13,18)],[1,1,44,1,44]);assert.equal(original[13],0);assert.equal(converted.length,original.length);
 const bare=new Uint8Array([255,216,255,217]);const inserted=exports.printJpeg(bare);assert.deepEqual([...inserted.slice(-2)],[255,217]);assert.equal(inserted.length,22);assert.throws(()=>exports.printJpeg(new Uint8Array([0,0])));
});
