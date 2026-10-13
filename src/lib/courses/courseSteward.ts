import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublicCourse } from "./courseDirectory";
import type { CourseResource } from "./courseContent";
import { contentRpc } from "./courseContent";

export type OperatingState={operating_status:"open"|"closed"|null;closed_from:string|null;closed_to:string|null;closed_reason:string|null;planned_closed_from:string|null;planned_closed_to:string|null;planned_closed_reason:string|null;can_manage:boolean};
export type StewardWorkspace=OperatingState&{course:Record<string,unknown>;updated_at:string;resources:CourseResource[];photos:{media_key:string;caption:string|null;version:number}[];reports:{id:string;body:string;status:"received"|"handled"|"dismissed";updated_at:string}[]};
export type InquiryRecipient={user_id:string|null;version:number;name:string|null};
export type StoryCategory="free"|"question"|"lost";
export const storyCategoryLabels={free:"자유·후기",question:"질문·건의",lost:"분실·습득"} as const;
export const storyStatusLabels={received:"접수",processing:"처리 중",done:"처리 완료",unresolved:"미해결",resolved:"해결 완료"} as const;
export type StoryComment={id:string;parent_id:string|null;body:string;author:string;created_at:string;steward:boolean;can_delete:boolean};
export type CourseStory={post_key:string;title:string|null;body:string;author_display_name:string;created_at:string;category:StoryCategory;processing_status:keyof typeof storyStatusLabels|null;version:number;pinned:boolean;pinned_by:string|null;pinned_at:string|null;can_edit:boolean;can_manage:boolean;hidden:boolean;images:{id:string;position:number}[];comment_count:number;comments?:StoryComment[]};
export type StoryPage={items:CourseStory[];total:number;notice:CourseStory[];can_manage:boolean;reports:{id:string;post_key:string;comment_id:string|null;reason:string;resolved:boolean}[]};
export const storyTitle=(p:Pick<CourseStory,"title"|"body">)=>p.title||p.body.split(/\r?\n/).find(line=>line.trim())?.trim()||"내용 없는 글";
export const dateOnly=(value:string|null)=>value?.replaceAll("-",".")??"";
export function isDateOnly(value:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const [y,m,d]=value.split("-").map(Number),leap=y%4===0&&(y%100!==0||y%400===0);return y>=1&&m>=1&&m<=12&&d>=1&&d<=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][m-1];}
export function validateOperatingState(state:Omit<OperatingState,"can_manage">,today:string){
 for(const k of ["closed_from","closed_to","planned_closed_from","planned_closed_to"] as const)if(state[k]&&!isDateOnly(state[k]!))throw new Error("휴장 날짜를 확인해 주세요.");
 if(Boolean(state.closed_from)!==Boolean(state.closed_to)||Boolean(state.planned_closed_from)!==Boolean(state.planned_closed_to)||state.closed_from&&state.closed_to&&state.closed_from>state.closed_to||state.planned_closed_from&&state.planned_closed_to&&state.planned_closed_from>state.planned_closed_to)throw new Error("휴장 시작·종료 날짜를 함께 입력하고 기간을 확인해 주세요.");
 if(state.closed_from&&(state.operating_status!=="closed"||state.closed_from>today||state.closed_to!<today))throw new Error("현재 휴장 기간은 오늘을 포함해야 합니다. 미래 휴장은 예정 안내에 입력해 주세요.");
 if(state.planned_closed_from&&(state.planned_closed_from<=today||!state.planned_closed_reason||state.planned_closed_reason.trim().length<2))throw new Error("휴장 예정은 미래 기간과 사유를 입력해 주세요.");
}
export const getOperatingState=(c:SupabaseClient,key:string)=>contentRpc<OperatingState>(c,"course_management_read",{p_course_key:key,p_manage:false});
export const getStewardWorkspace=(c:SupabaseClient,key:string)=>contentRpc<StewardWorkspace>(c,"course_management_read",{p_course_key:key,p_manage:true});
export const getInquiryRecipient=(c:SupabaseClient,key:string)=>contentRpc<InquiryRecipient>(c,"course_inquiry_current",{p_course_key:key});
export const readStories=(c:SupabaseClient,key:string,options:{postKey?:string;category?:StoryCategory;offset?:number;preview?:boolean;manage?:boolean}={})=>contentRpc<StoryPage&CourseStory>(c,"course_story_read",{p_course_key:key,p_post_key:options.postKey??null,p_category:options.category??null,p_offset:options.offset??0,p_preview:!!options.preview,p_manage:!!options.manage});
export type StewardCourse=PublicCourse&{operatingState?:OperatingState};
