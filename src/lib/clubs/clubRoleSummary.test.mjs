import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {test} from 'node:test';
import ts from 'typescript';
const require=createRequire(import.meta.url),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
function load(file,mocks={}){const out=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;const m={exports:{}};new Function('require','module','exports',out)(id=>mocks[id]??require(id),m,m.exports);return m.exports;}
const lib=load('./clubRoleSummary.ts');
const base={member:true,role:'club_member',best:null,applications:null,inquiries:null};
test('role summary projects only owned safe fields and preserves no-record null',async()=>{
 const data={...base,privateName:'PRIVATE_CANARY'};
 const result=await lib.getClubRoleSummary({rpc:async(name,args)=>{assert.equal(name,'get_club_detail_role_summary');assert.deepEqual(args,{p_club_key:'test-club'});return {data,error:null};}},'test-club');
 assert.deepEqual(result,base);
});
test('read errors and invalid counts reject rather than become zero',async()=>{
 for(const response of [{data:null,error:{code:'42501'}},{data:base,error:{code:'XX000'}},{data:{...base,applications:-1},error:null},{data:{...base,best:{score:0}},error:null}])await assert.rejects(lib.getClubRoleSummary({rpc:async()=>response},'test-club'));
});
const ui=load('../../components/clubs/detail/ClubRoleSummary.tsx',{'./ClubLatestScores':{ClubLatestScores:()=>null},'next/link':{__esModule:true,default:({children,href})=>React.createElement('a',{href},children)},'@/lib/supabase/client':{createClient:()=>{throw Error('No client query during server render');}},'@/lib/clubs/clubRoleSummary':lib,'@/lib/clubs/personalBests':{bestRank:r=>(r.tied?'공동 ':'')+r.rank+'위',scoreKind:k=>k==='monthly'?'월례회':'대회'},'./ClubDetail.module.css':{__esModule:true,default:{}}});
test('no-record and read-failure HTML have no fabricated score/rank/count',()=>{
 const render=initial=>renderToStaticMarkup(React.createElement(ui.ClubRoleSummary,{clubKey:'test-club',initial}));
 const empty=render(base);assert.match(empty,/아직 유효한 개인 최저타 기록이 없습니다/);assert.doesNotMatch(empty,/0타|0위|운영자가 확인할 일/);
 const error=render(null);assert.match(error,/role="alert"/);assert.doesNotMatch(error,/0건|미처리|미답변/);
});
test('operator count links use matching pending filters and actual counts',()=>{
 const html=renderToStaticMarkup(React.createElement(ui.ClubRoleSummary,{clubKey:'test-club',initial:{...base,role:'club_vice_admin',applications:3,inquiries:2}}));
 assert.match(html,/내 활동 · 부회장/);assert.match(html,/membership-applications\?pending=1/);assert.match(html,/inquiries\?pending=1/);assert.match(html,/3건/);assert.match(html,/2건/);
});
const linked=load('../../components/clubs/detail/ClubLinkedCourses.tsx',{'next/link':{__esModule:true,default:({children,href,...props})=>React.createElement('a',{href,...props},children)},'@/components/courses/CourseStewardUI':{CourseOperatingState:()=>null},'@/lib/courses/courseDirectory':{courseOperationLabels:{}},'@/lib/courses/courseDirections':load('../courses/courseDirections.ts'),'@/components/courses/CourseDirections':{CourseDirections:()=>null},'@/components/courses/CourseMaterials':{CourseResourcePanel:()=>null},'./ClubDetail.module.css':{__esModule:true,default:{}}});
function renderCourse(c){return renderToStaticMarkup(React.createElement(linked.ClubLinkedCourseProvider,{courses:[{courseKey:'actual-course',courseType:'field',name:'시험 구장',address:'주소',...c}],overviews:{},failed:false,overviewFailed:[]},React.createElement(linked.ClubLinkedCourses)));}
test('course card keeps four actions and disables missing or unsafe contact targets',()=>{
 const c={courseKey:'actual-course',courseType:'field',name:'시험 구장',address:'주소',phone:null,reservationUrl:'javascript:alert(1)'};
 const html=renderToStaticMarkup(React.createElement(linked.ClubLinkedCourseProvider,{courses:[c],overviews:{},failed:false,overviewFailed:[]},React.createElement(linked.ClubLinkedCourses)));
 assert.match(html,/disabled=""[^>]*title="예약 링크 확인 필요"[^>]*>예약하기/);assert.match(html,/disabled=""[^>]*title="등록된 전화번호가 없습니다\."[^>]*>전화하기/);
 assert.match(html,/aria-controls="club-course-directions"[^>]*>내비게이션/);assert.match(html,/href="\/courses\/actual-course"[^>]*>구장 페이지/);assert.doesNotMatch(html,/javascript:|tel:|이용 정보 더 보기/);
});
test('course telephone retains a single domestic, service or international main number without extension digits',()=>{
 const cases=[['02-123-4567','021234567'],['031-123-4567','0311234567'],['010 1234 5678','01012345678'],['0507-1234-5678','050712345678'],['1588-1234','15881234'],['1661-1234','16611234'],['1800-1234','18001234'],['(031) 123-4567','0311234567'],['02)1234-5678','0212345678'],['+82-31-123-4567','+82311234567'],['+1 (212) 555-0123','+12125550123'],['+44 20 1234 5678','+442012345678'],['031-123-4567 (내선 2)','0311234567'],['031-123-4567 내선: 22','0311234567'],['+1 (212) 555-0123 ext. 204','+12125550123'],['031-123-4567 x204','0311234567'],['031-123-4567 (예약 문의)','0311234567']];
 for(const [phone,number] of cases){const before=phone,html=renderCourse({phone});assert.match(html,new RegExp('href="tel:'+number.replaceAll('+','\\+')+'"[^>]*>전화하기'),phone);assert.equal(phone,before);}
});
test('course telephone disables multiple, unlabelled extension and ambiguous values instead of joining numbers',()=>{
 for(const phone of ['031-123-4567 / 031-765-4321','031-123-4567, 1588-1234','031-123-4567 또는 02-123-4567','1588-1234 1661-1234','031-123-4567 (2)','031-123-4567 2','031-123-4567 (운영시간 9~18)','+82-31-123-4567 +1-212-555-0123','1234567','미등록','031-123-4567;ext=2']){const html=renderCourse({phone});assert.doesNotMatch(html,/href="tel:/,phone);assert.match(html,/disabled=""[^>]*title="전화번호 확인 필요"[^>]*>전화하기/,phone);}
});
