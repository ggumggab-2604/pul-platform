export type CourseConfirmation = {
  course_key: string; event_id: string | null; event_version: number | null; event_course_id: string | null;
  schedule_id: string | null; schedule_version: number | null; schedule_course_key: string | null;
};
export type ScoreCourseEvent = {id:string;version:number;course_id:string|null;course_key:string|null;course_name:string};
export type ScoreCourseSchedule = {id:string;version:number;course_key:string|null;course_name:string};
export function scoreCourseConfirmation(courseKey:string,event?:ScoreCourseEvent,schedule?:ScoreCourseSchedule):CourseConfirmation {
  return {course_key:courseKey,event_id:event?.id??null,event_version:event?.version??null,event_course_id:event?.course_id??null,
    schedule_id:schedule?.id??null,schedule_version:schedule?.version??null,schedule_course_key:schedule?.course_key??null};
}
