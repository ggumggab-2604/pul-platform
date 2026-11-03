import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const code=ts.transpileModule(readFileSync(new URL('./personalBests.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const m={exports:{}};new Function('module','exports',code)(m,m.exports);
const {scoreSourceHref,bestRank,comparisonBases}=m.exports;
test('source navigation points at the selected game and participant without inferring a course',()=>{
 const r={date:'2026-10-15',personId:'person-a',sourceId:'entry-a',eventId:'game-a'};
 assert.equal(scoreSourceHref('club a',{...r,kind:'monthly'}),'/clubs/club%20a/scores?year=2026&month=10&sheet=game-a#score-person-a');
 assert.equal(scoreSourceHref('club a',{...r,kind:'tournament'}),'/clubs/club%20a/tournaments?tournament=game-a&entry=entry-a#entry-entry-a');
});
test('same competition rank is preserved; unknown is an explicit comparison option',()=>{
 assert.equal(bestRank({rank:2,tied:true}),'공동 2위');assert.equal(bestRank({rank:4,tied:false}),'4위');
 assert.deepEqual(Object.keys(comparisonBases),['unconfirmed','outdoor_18_single','other']);
});
