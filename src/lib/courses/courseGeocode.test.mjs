import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import ts from 'typescript';
function load(name){const exports={};const code=ts.transpileModule(readFileSync(new URL(name+'.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','exports',code)(load,exports);return exports;}
const {geocodeCourseDestination}=load('./courseGeocode');
const course={name:'LOCAL 합성 구장',address:'서울 마포구 하늘공원로 100 (시설명)',latitude:null,longitude:null,destinationKind:null};
const result={address_name:'서울특별시 마포구 하늘공원로 100',address_type:'ROAD_ADDR',x:'126.87928',y:'37.569621'};
function service(results=[result],status='OK'){return{addressSearch(query,cb,options){assert.equal(query,'서울 마포구 하늘공원로 100');assert.equal(options.analyze_type,'exact');cb(results,status);}};}
test('normal address aliases convert automatically, name/original address preserved, never labelled entrance',async()=>{const point=await geocodeCourseDestination(course,service(),'OK');assert.equal(point.name,course.name);assert.equal(point.address,course.address);assert.equal(point.latitude,37.569621);assert.equal(point.longitude,126.87928);assert.equal(point.destinationKind,'facility');assert.equal(course.latitude,null);});
test('road/jibun alternate returned address is matched, identical points deduplicated',async()=>{const r={...result,address_name:'다른 표기',road_address:{address_name:result.address_name}};assert.equal((await geocodeCourseDestination(course,service([r,r]),'OK')).latitude,37.569621);});
for(const [label,results,status]of [
 ['region centroid',[{...result,address_type:'REGION'}],'OK'],['road centroid',[{...result,address_type:'ROAD'}],'OK'],
 ['ambiguous',[result,{...result,x:'127.1'}],'OK'],['empty',[],'ZERO_RESULT'],['provider error',[],'ERROR'],
 ['blank coordinate',[{...result,x:''}],'OK'],['invalid coordinate',[{...result,y:'NaN'}],'OK'],['outside earth',[{...result,y:'95'}],'OK'],
])test(label+' does not invent/select a destination',async()=>{await assert.rejects(geocodeCourseDestination(course,service(results,status),'OK'),/주소/);});
test('missing address does not search the course name',async()=>{await assert.rejects(geocodeCourseDestination({...course,address:''},{addressSearch(){assert.fail('no request');}},'OK'),/주소 정보/);});
test('deadline is temporary failure; late callback cannot replace failed result',async t=>{t.mock.timers.enable({apis:['setTimeout']});let callback;const pending=geocodeCourseDestination(course,{addressSearch(q,cb){callback=cb;}},'OK');const rejected=assert.rejects(pending,/일시적으로/);t.mock.timers.tick(10001);await rejected;callback([result],'OK');});
test('synchronous provider exception is temporary failure',async()=>{await assert.rejects(geocodeCourseDestination(course,{addressSearch(){throw Error('SDK');}},'OK'),/일시적으로/);});

for(const address of ['서울 마포구 하늘공원로 100번지','마포구 하늘공원로 100','서울 마포구 하늘공원로 100 LOCAL 합성 구장','서울 마포구 하늘공원로 100, 2층'])test('single detailed provider-normalized address is accepted: '+address,async()=>{
 const point=await geocodeCourseDestination({...course,address},{addressSearch(q,cb,options){assert.equal(options.analyze_type,'exact');cb([result],'OK');}},'OK');assert.equal(point.latitude,37.569621);assert.equal(point.address,address);
});
test('single detailed coordinate accepts administrative/legal-dong normalization without string veto',async()=>{const point=await geocodeCourseDestination({...course,address:'전북 삼성동 100'},{addressSearch(q,cb){cb([{...result,address_name:'전북 익산시 부송동 100'}],'OK');}},'OK');assert.equal(point.longitude,126.87928);});
test('different coordinates use text only as tie-breaker; duplicates at selected coordinate remain one',async()=>{
 const point=await geocodeCourseDestination(course,service([result,result,{...result,address_name:'서울 마포구 다른길 10',x:'127.1'}]),'OK');assert.equal(point.longitude,126.87928);
});
test('multiple coordinates with no matching address remain ambiguous',async()=>{await assert.rejects(geocodeCourseDestination(course,service([{...result,address_name:'다른 주소 A'},{...result,address_name:'다른 주소 B',x:'127.1'}]),'OK'),/목적지가 여러 곳/);});
test('ERROR and ZERO_RESULT have distinct guidance; temporary error never blames address',async()=>{
 await assert.rejects(geocodeCourseDestination(course,service([],'ERROR'),'OK'),error=>/일시적으로/.test(error.message)&&!/주소를 확인/.test(error.message));
 await assert.rejects(geocodeCourseDestination(course,service([],'ZERO_RESULT'),'OK'),/위치를 찾지 못했습니다/);
});
