import type { ManagedCourse } from "./courseManagement";
export type ApplicationDraft = {
  name: string; course_type: "field" | "screen"; region: string; city: string; address: string;
  holes: number | null; bay_count: number | null; operating_hours: string | null;
  operation_code: "reservation" | "phone" | "walkIn" | null; phone: string | null;
  parking_available: boolean | null; description: string; reservation_url: string | null;
  reservation_guide: string | null; fee_guide: string | null;
};
export type CourseApplication = {
  id: string; kind: "new" | "claim" | "edit"; draft: ApplicationDraft; relation: string;
  verificationContact: string; publicContactConfirmed: boolean; status: "pending" | "supplement" | "approved" | "rejected";
  version: number; reviewNote: string | null; courseKey: string | null; baseUpdatedAt: string | null;
  permissionGranted: boolean; createdAt: string; currentCourse: ManagedCourse | null;
};
export type ApplicationWorkspace = {items: CourseApplication[]; managed: ManagedCourse[]; canManage: boolean; hasMore: boolean};
export type ApplicationCommand = {id:string; action:"submit"|"resubmit"|"approve"|"supplement"|"reject"|"revoke"; version:number; requestId:string; input:Record<string,unknown>};
export const applicationStatusLabels = {pending:"검토 중",supplement:"보완 요청",approved:"승인",rejected:"반려"};
export function emptyApplicationDraft(): ApplicationDraft {
  return {name:"",course_type:"field",region:"",city:"",address:"",holes:null,bay_count:null,operating_hours:null,operation_code:null,phone:null,parking_available:null,description:"",reservation_url:null,reservation_guide:null,fee_guide:null};
}
export function courseApplicationDraft(c: ManagedCourse): ApplicationDraft {
  return {name:c.name,course_type:c.courseType,region:c.region,city:c.city,address:c.address,holes:c.courseType==="field"?c.holes:null,bay_count:c.bayCount,operating_hours:c.operatingHours,operation_code:c.operation,phone:c.phone,parking_available:c.parkingAvailable,description:c.description,reservation_url:c.reservationUrl,reservation_guide:c.reservationGuide,fee_guide:c.feeGuide};
}
