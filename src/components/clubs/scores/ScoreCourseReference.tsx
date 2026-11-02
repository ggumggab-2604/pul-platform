'use client';
import {scoreCourseConfirmation,type CourseConfirmation,type ScoreCourseEvent,type ScoreCourseSchedule} from '@/lib/clubs/scoreCourseConnection';
export function ScoreCourseReference({courseKey,courseName,event,schedule,confirmation,onConfirm}:{courseKey:string|null;courseName:string;event?:ScoreCourseEvent;schedule?:ScoreCourseSchedule;confirmation?:CourseConfirmation|null;onConfirm:(value:CourseConfirmation|null)=>void}) {
  const refs=[event,schedule].filter((r):r is ScoreCourseEvent|ScoreCourseSchedule=>!!r);
  const conflict=!!courseKey&&refs.some(r=>r.course_key!==null&&r.course_key!==courseKey);
  const expected=courseKey?scoreCourseConfirmation(courseKey,event,schedule):null;
  const checked=!!confirmation&&JSON.stringify(confirmation)===JSON.stringify(expected);
  return <div className="mt-3 min-w-0 space-y-3 text-sm">
    {refs.length>0&&<div className="rounded-lg bg-pul-page p-3"><p className="text-pul-muted">일정·행사의 현재 구장 · 확인 참고</p>{refs.map((r,i)=><p className="break-words" key={i}>{r.course_name||'구장 미연결'}</p>)}<p className="mt-1 text-xs text-pul-muted">당시 개최 구장을 자동으로 연결하지 않습니다.</p></div>}
    {!courseKey&&<p className="text-pul-muted">집계 조건을 충족한 성적은 전국 순위에 반영됩니다. 구장 순위는 실제 개최 구장을 연결한 뒤 반영됩니다.</p>}
    {conflict&&<div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950"><p>선택한 구장과 일정·행사의 구장이 다릅니다.</p><p className="mt-1 break-words">선택한 실제 구장: {courseName}</p><label className="mt-3 flex items-start gap-2"><input className="mt-1 h-4 w-4 shrink-0" type="checkbox" checked={checked} onChange={e=>onConfirm(e.target.checked?expected:null)}/><span>실제로 경기를 진행한 곳은 ‘{courseName}’임을 확인했습니다.</span></label></div>}
  </div>;
}
