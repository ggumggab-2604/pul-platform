import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
const code=ts.transpileModule(readFileSync(new URL('./coursePhotoLayout.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const result={exports:{}};new Function('exports','module',code)(result.exports,result);
const {memberPhotoColumns,memberPhotoCellSize,fittingPhotoCount}=result.exports;
test('retains lower breakpoints and uses the full lower width for upper cell size',()=>{
  for(const [width,columns] of [[1341.33,10],[843,8],[710,6],[310.22,4]]){
    assert.equal(memberPhotoColumns(width),columns);
    const cell=memberPhotoCellSize(width);
    assert.ok(Math.abs(cell*columns+6*(columns-1)-width)<1e-8);
    assert.equal(fittingPhotoCount(width,cell,6),columns);
  }
});
test('only complete cells fit; capacity changes without changing source image ordering',()=>{
  const cell=memberPhotoCellSize(1341.33);
  for(const available of [300,500,660,800]){
    const count=fittingPhotoCount(available,cell,7);
    assert.ok(count*cell+Math.max(0,count-1)*7<=available);
    assert.ok((count+1)*cell+count*7>available);
  }
  assert.equal(fittingPhotoCount(0,cell,7),0);
  assert.equal(fittingPhotoCount(400,0,7),0);
});
