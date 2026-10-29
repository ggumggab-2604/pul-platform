import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClubSharedCourse, ClubPhotoVisibility } from "./clubGallery";
import { contentRpc } from "@/lib/courses/courseContent";
export const clubActivityLabels={monthly_meeting:"월례회",tournament_participation:"대회 참가",tournament_hosting:"대회 개최",rounding:"함께 라운딩",social:"친목모임",family_event:"경조사",other:"기타"} as const;
export type ClubActivityCategory=keyof typeof clubActivityLabels;
export type ClubPostingCourse={courseKey:string;name:string};
export type ClubPost={id:string;club_key:string;club_name:string;title:string;body:string;post_type:string;activity_category:ClubActivityCategory|null;is_notice:boolean;starts_at:string|null;ends_at:string|null;event_id:string|null;location:string|null;capacity:number|null;participant_target:string|null;recruitment_status:string|null;linked_course_legacy_key:string|null;visibility:ClubPhotoVisibility;created_at:string;version:number;hidden:boolean;can_edit:boolean;can_moderate:boolean;can_notice:boolean;images:{id:string;caption:string|null;visibility:ClubPhotoVisibility}[];shared_course:ClubSharedCourse|null};
export type ClubActivityPage={items:ClubPost[];total:number;can_create:boolean;can_read_members:boolean;viewer_id:string|null};
export type ClubPostDraft={title:string;body:string;postType:string;activityCategory:ClubActivityCategory|null;isNotice:boolean;startsAt:string;endsAt:string;eventId:string;location:string;capacity:string;participantTarget:string;recruitmentStatus:string;linkedCourseKey:string;visibility:ClubPhotoVisibility;publicConfirmed:boolean;shareCourseKey:string;images:string[]};
export const listClubActivities=(c:SupabaseClient,key:string,limit=3,offset=0,manage=false)=>contentRpc<ClubActivityPage>(c,"list_club_activities",{p_club_key:key,p_limit:limit,p_offset:offset,p_manage:manage});
export const getClubPost=(c:SupabaseClient,id:string)=>contentRpc<ClubPost>(c,"get_club_post",{p_id:id});
export async function saveClubPost(c:SupabaseClient,input:{clubId:string;operation:"create"|"update"|"hide"|"restore"|"delete";id?:string;version?:number;requestId:string;draft?:ClubPostDraft}){
 const d=input.draft;const payload=d?{title:d.title.trim(),content_summary:d.body.trim(),post_type:d.postType,visibility:d.visibility,starts_at:d.startsAt?new Date(d.startsAt).toISOString():null,ends_at:d.endsAt?new Date(d.endsAt).toISOString():null,linked_course_legacy_key:d.linkedCourseKey||null,location:d.location.trim()||null,capacity:d.capacity?Number(d.capacity):null,participant_target:d.participantTarget.trim()||null,recruitment_status:d.recruitmentStatus||null,activity_category:d.activityCategory,is_notice:d.isNotice,event_id:d.eventId||null,images:d.images,share_course_key:d.shareCourseKey||null,public_confirmed:d.publicConfirmed}:{};
 return contentRpc<{id:string;version:number}>(c,"save_club_post",{p_club_id:input.clubId,p_operation:input.operation,p_content_id:input.id??null,p_expected_version:input.version??null,p_request_id:input.requestId,p_input:payload});
}
export type ClubContentReport={id:string;post_id:string|null;media_id:string|null;reason:string;created_at:string;resolved:boolean};
export const listClubContentReports=(c:SupabaseClient,key:string)=>contentRpc<ClubContentReport[]>(c,"list_club_content_reports",{p_club_key:key});
