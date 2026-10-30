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
export function ClubLinkedCourses(){
 const {courses,course,choose,failed}=useSelection();
 const conflict=courses.filter(c=>c.courseType==="field").length>1||courses.filter(c=>c.courseType==="screen").length>1;
 return <section id="club-courses" className={styles.panel} aria-label="선택 활동 구장">
 <div className="flex flex-wrap items-center gap-3"><h2>활동 구장</h2>{courses.length?<div className="flex flex-wrap gap-2" role="group" aria-label="활동 구장 선택">{courses.map(c=><button key={c.courseKey} type="button" aria-pressed={course?.courseKey===c.courseKey} className="inline-flex min-h-9 items-center justify-center rounded-lg border border-pul-border px-3 py-1 text-sm font-semibold aria-pressed:border-pul-point aria-pressed:bg-pul-light" onClick={()=>choose(c.courseKey)}>{conflict?c.name:c.courseType==="field"?"야외구장":"스크린구장"}</button>)}</div>:null}</div>
 {failed?<p role="status" className="mt-3 text-amber-800">일부 연결 구장을 불러오지 못했습니다. 새로고침해 주세요.</p>:null}
 {courses.length>1?<p className="mt-3 text-sm text-pul-muted">활동 구장을 선택하면 구장 안내와 코스 자료를 볼 수 있습니다. 날씨는 구장 상세에서 확인해 주세요.</p>:null}
 {course?<SelectedCourse key={course.courseKey} course={course}/>:<p className="mt-3 text-pul-muted">{courses.length?"확인할 활동 구장을 선택해 주세요.":failed?"연결 구장을 다시 확인해 주세요.":"등록된 활동 구장이 없습니다."}</p>}
 </section>;
}
function SelectedCourse({course:c}:{course:PublicCourse}){
 const [directions,setDirections]=useState({expanded:false,hasOpened:false});
 const reservation=safeReservationUrl(c.reservationUrl);
 return <div data-selected-course={c.courseKey} data-course-type={c.courseType}>
 <div className="mt-4"><p className="text-sm font-semibold text-pul-point">{c.courseType==="field"?"야외 파크골프장":"스크린 파크골프장"}</p><h3 className="mt-1 text-xl font-bold text-pul-deep"><Link href={"/courses/"+encodeURIComponent(c.courseKey)}>{c.name}</Link></h3><p className="mt-2 break-words">{c.address}</p></div><div className="mt-4 flex flex-wrap items-center gap-3"><h4 className="font-semibold text-pul-deep">예약·이용 안내</h4>{reservation?<a className={button+" bg-pul-point text-white"} href={reservation} target="_blank" rel="noopener noreferrer">구장 예약</a>:<span className="inline-flex min-h-11 items-center text-sm text-pul-muted">{c.reservationUrl?"예약 링크 확인 필요":"예약 링크 미등록"}</span>}</div>
 <p className="mt-3 whitespace-pre-wrap text-pul-muted">{c.reservationGuide||"이용·예약 방법은 구장 안내를 확인해 주세요."}</p>
 <p className="mt-2 text-sm text-pul-muted">이용 방식 · {c.operation?courseOperationLabels[c.operation]:"확인 중"}{c.operatingHours?" · "+c.operatingHours:""}</p><CourseOperatingState state={c.operatingState} lookupStatus={c.operatingState?"ready":"error"} canManage={false}/>{!c.operatingState?<p role="status" className="mt-2 text-sm text-pul-muted">운영 상태를 불러오지 못했습니다. 구장 상세에서 다시 확인해 주세요.</p>:null}
 <CourseDirections key={c.courseKey} course={{name:c.name,address:c.address,latitude:c.latitude,longitude:c.longitude,destinationKind:c.destinationKind}} integrated={{...directions,onExpanded:expanded=>setDirections(current=>({expanded,hasOpened:current.hasOpened||expanded}))}}/>
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

