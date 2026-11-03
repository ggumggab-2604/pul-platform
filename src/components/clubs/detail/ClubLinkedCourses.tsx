"use client";
import Link from "next/link";
import {createContext,useContext,useState,type ReactNode} from "react";
import {CourseOperatingState} from "@/components/courses/CourseStewardUI";
import {courseOperationLabels} from "@/lib/courses/courseDirectory";
import type {PublicCourse} from "@/lib/courses/courseDirectory";
import type {CourseOverview,CourseEvent} from "@/lib/courses/courseContent";
import {safeReservationUrl} from "@/lib/courses/courseDirections";
import {CourseDirections} from "@/components/courses/CourseDirections";
import {CourseResourcePanel} from "@/components/courses/CourseMaterials";
import styles from "./ClubDetail.module.css";

type Selection={courses:PublicCourse[];course:PublicCourse|null;choose:(key:string)=>void;overviews:Record<string,CourseOverview>;failed:boolean;overviewFailed:string[]};
const Context=createContext<Selection|null>(null);
function useSelection(){const value=useContext(Context);if(!value)throw Error("ClubLinkedCourseProvider required");return value;}
export function initialClubCourseKey(courses:PublicCourse[]){
 const fields=courses.filter(c=>c.courseType==="field"),screens=courses.filter(c=>c.courseType==="screen");
 return fields.length>1||screens.length>1?null:(fields[0]??screens[0])?.courseKey??null;
}
export function ClubLinkedCourseProvider({courses,overviews,failed,overviewFailed,children}:{courses:PublicCourse[];overviews:Record<string,CourseOverview>;failed:boolean;overviewFailed:string[];children:ReactNode}){
 const [key,choose]=useState(()=>initialClubCourseKey(courses));
 return <Context.Provider value={{courses,course:courses.find(c=>c.courseKey===key)??null,choose,overviews,failed,overviewFailed}}>{children}</Context.Provider>;
}
const button="inline-flex min-h-11 items-center justify-center rounded-lg border border-pul-border px-4 py-2 text-sm font-semibold text-pul-deep hover:bg-pul-light";
function courseTelephoneHref(phone:string|null|undefined){
 // Only an explicit extension may be dropped; multiple or unexplained numbers stay disabled.
 const body=(phone??'').trim()
  .replace(/\s*\([^()\d]*[가-힣A-Za-z][^()\d]*\)\s*$/u,'')
  .replace(/\s*(?:\(\s*(?:내선|ext\.?|x)\s*[:：.]?\s*\d+\s*\)|(?:내선|ext\.?|x)\s*[:：.]?\s*\d+)\s*$/i,'')
  .trim().replace(/^\((0\d{1,3})\)\s*/,'$1-').replace(/^(0\d{1,3})\)/,'$1-');
 if(!/^(?:\+[1-9]\d{0,2}[\s.-]*)?(?:\(\d{1,4}\)[\s.-]*)?\d+(?:[\s.-]+\d+)*$/.test(body))return null;
 const number=body.replace(/[()\s.-]/g,'');
 const valid=number.startsWith('+')?/^\+[1-9]\d{6,14}$/.test(number)&&!/[\s.-]\d$/.test(body):/^(?:0\d{8,11}|0\d{1,3}[\s.-]+\d{7,8}|0\d{1,3}[\s.-]+\d{3,4}[\s.-]+\d{4}|1[568]\d{2}[\s.-]*\d{4})$/.test(body);
 return valid?'tel:'+number:null;
}
export function ClubLinkedCourses(){
 const {courses,course,choose,failed}=useSelection();
 const [mapOpen,setMapOpen]=useState(false);
 const conflict=courses.filter(c=>c.courseType==="field").length>1||courses.filter(c=>c.courseType==="screen").length>1;
 return <section id="club-courses" className={styles.panel} aria-label="선택 활동 구장">
 <div className="flex flex-wrap items-center gap-3"><h2>활동 구장</h2>{courses.length?<div className="flex flex-wrap gap-2" role="group" aria-label="활동 구장 선택">{courses.map(c=><button key={c.courseKey} type="button" aria-pressed={course?.courseKey===c.courseKey} className="inline-flex min-h-9 items-center justify-center rounded-lg border border-pul-border px-3 py-1 text-sm font-semibold aria-pressed:border-pul-point aria-pressed:bg-pul-light" onClick={()=>choose(c.courseKey)}>{conflict?c.name:c.courseType==="field"?"야외구장":"스크린구장"}</button>)}</div>:null}</div>
 {failed?<p role="status" className="mt-3 text-amber-800">일부 연결 구장을 불러오지 못했습니다. 새로고침해 주세요.</p>:null}
 {courses.length>1?<p className="mt-3 text-sm text-pul-muted">활동 구장을 선택하면 구장 안내와 코스 자료를 볼 수 있습니다. 날씨는 구장 상세에서 확인해 주세요.</p>:null}
 {course?<SelectedCourse key={course.courseKey} course={course} mapOpen={mapOpen} toggleMap={()=>setMapOpen(open=>!open)}/>:<p className="mt-3 text-pul-muted">{courses.length?"확인할 활동 구장을 선택해 주세요.":failed?"연결 구장을 다시 확인해 주세요.":"등록된 활동 구장이 없습니다."}</p>}
 </section>;
}
function SelectedCourse({course:c,mapOpen,toggleMap}:{course:PublicCourse;mapOpen:boolean;toggleMap:()=>void}){
 const [directions,setDirections]=useState({expanded:false,hasOpened:false});
 const reservation=safeReservationUrl(c.reservationUrl);
 const telephone=courseTelephoneHref(c.phone);
 return <div data-selected-course={c.courseKey} data-course-type={c.courseType}>
 <div className="mt-4"><p className="text-sm font-semibold text-pul-point">{c.courseType==="field"?"야외 파크골프장":"스크린 파크골프장"}</p><h3 className="mt-1 text-xl font-bold text-pul-deep"><Link href={"/courses/"+encodeURIComponent(c.courseKey)}>{c.name}</Link></h3><p className="mt-2 break-words">{c.address}</p></div><div className={styles.courseActions} aria-label={c.name+' 이용 바로가기'}>
 {reservation?<a className={button} href={reservation} target="_blank" rel="noopener noreferrer">예약하기</a>:<button type="button" disabled className={button} title={c.reservationUrl?"예약 링크 확인 필요":"예약 링크 미등록"}>예약하기</button>}
 {telephone?<a className={button} href={telephone}>전화하기</a>:<button type="button" disabled className={button} title={c.phone?.trim()?"전화번호 확인 필요":"등록된 전화번호가 없습니다."}>전화하기</button>}
 <button type="button" className={button} aria-expanded={mapOpen} aria-controls="club-course-directions" onClick={toggleMap}>내비게이션</button>
 <Link className={button} href={'/courses/'+encodeURIComponent(c.courseKey)}>구장 페이지</Link>
 </div>
 <p className="mt-3 whitespace-pre-wrap text-pul-muted">{c.reservationGuide||"이용·예약 방법은 구장 안내를 확인해 주세요."}</p>
 <p className="mt-2 text-sm text-pul-muted">이용 방식 · {c.operation?courseOperationLabels[c.operation]:"확인 중"}{c.operatingHours?" · "+c.operatingHours:""}</p><CourseOperatingState state={c.operatingState} lookupStatus={c.operatingState?"ready":"error"} canManage={false}/>{!c.operatingState?<p role="status" className="mt-2 text-sm text-pul-muted">운영 상태를 불러오지 못했습니다. 구장 상세에서 다시 확인해 주세요.</p>:null}
 <div id="club-course-directions" hidden={!mapOpen}>{mapOpen?<CourseDirections key={c.courseKey} course={{name:c.name,address:c.address,latitude:c.latitude,longitude:c.longitude,destinationKind:c.destinationKind}} integrated={{...directions,onExpanded:expanded=>setDirections(current=>({expanded,hasOpened:current.hasOpened||expanded}))}}/>:null}</div>
 </div>;
}
export function ClubLinkedCourseResources(){
 const {course,overviews,overviewFailed}=useSelection();
 if(!course)return <section id="club-course-materials" className={styles.panel}><h2>활동 구장 코스 자료</h2><p className="mt-2 text-pul-muted">활동 구장을 선택하면 공개 코스 자료를 확인할 수 있습니다.</p></section>;
 const page=overviews[course.courseKey]?.resources??{items:[],total:0,limit:12,offset:0};
 if(!page.items.length&&!overviewFailed.includes(course.courseKey))return <section id="club-course-materials" className={styles.panel} data-material-course={course.courseKey}><h2>{course.name} · 코스 자료</h2><p className="mt-2 text-sm text-pul-muted">아직 공개된 코스 자료가 없습니다.</p><div className="mt-3 flex flex-wrap gap-2"><Link className={button} href={"/courses/"+encodeURIComponent(course.courseKey)+"/resources"}>자료 보기</Link><Link className={button} href={"/courses/"+encodeURIComponent(course.courseKey)+"/resources/new"}>자료 올리기</Link></div></section>;
 return <div id="club-course-materials" className={styles.materials} data-material-course={course.courseKey}><p className="mb-2 text-sm font-semibold text-pul-deep">{course.name} · 기존 공개 자료</p><CourseResourcePanel key={course.courseKey} courseKey={course.courseKey} screen={course.courseType==="screen"} page={page} failed={overviewFailed.includes(course.courseKey)} compact/></div>;
}
export function ClubLinkedCourseEvents({events,failed}:{events:CourseEvent[];failed:boolean}){
 if(!failed&&!events.length)return <section className={styles.panel} aria-label="연결 구장 공개 행사"><h2>연결 구장 공개 행사</h2><p className="mt-2 text-sm text-pul-muted">등록된 공개 행사가 없습니다. <Link className="inline-flex min-h-11 items-center font-semibold text-pul-point" href="/events">행사 보기</Link></p></section>;
 return <section className={styles.panel} aria-label="연결 구장 공개 행사"><h2>연결 구장에서 열리는 공개 행사</h2><p className="mt-2 text-sm text-pul-muted">구장의 행사 안내입니다. 동호회의 참가 확정 일정과 다릅니다.</p>{failed?<p role="status" className="mt-3">구장 행사를 불러오지 못했습니다.</p>:events.length?<ul className="mt-3 divide-y divide-pul-border">{events.map(e=><li key={e.key} className="py-3"><Link className="font-semibold text-pul-deep" href={"/events/"+encodeURIComponent(e.key)}>{e.title}</Link><p className="mt-1 text-sm text-pul-muted">{e.start||"날짜 미정"} · {{upcoming:"예정",ongoing:"진행 중",past:"종료",cancelled:"개최 취소",unknown:"확인 중"}[e.phase]}</p></li>)}</ul>:<p className="mt-3 text-pul-muted">등록된 공개 행사가 없습니다.</p>}</section>;
}

