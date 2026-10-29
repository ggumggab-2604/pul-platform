import type { SupabaseClient } from "@supabase/supabase-js";
import { clubRegions } from "./clubDirectory";
export const clubPurposes=["친목","건강","정기 라운딩","대회","초보 연습","강습"] as const;
export type ClubContact={name:string;role:string;phone:string;visibility:"private"|"members"|"public";consent:boolean};
export type ClubProfile={
 description:string;activityType:"field"|"screen"|"both";purposes:string[];
 meetingRule:string;weekdays:string[];meetingTime:string;beginnerGuide:string;
 lesson:"none"|"available"|"inquiry";lessonFee:"free"|"paid"|"inquiry";
 offlineSize:number|null;capacity:number|null;ageGroup:string;
 conditionKind:"none"|"region"|"age"|"gender"|"other";conditionDetail:string;
 recruitmentWindow:"always"|"monthly"|"dates";windowDetail:string;windowStart:string;windowEnd:string;
 joiningFee:string;monthlyFee:string;annualFee:string;eventFee:string;rules:string;preparations:string;participationGuide:string;
};
export type ClubProfileInput={name:string;region:string;district:string;summary:string;recruitment_status:"recruiting"|"waiting"|"closed";profile:ClubProfile;contacts:ClubContact[];field_course_key:string|null;screen_course_key:string|null;confirm_link_conflict:boolean};
export type ClubProfileCourse={course_key:string;name:string;course_type:"field"|"screen";region:string;city:string;course_status:string};
export type ClubProfileSnapshot={viewer_authenticated:boolean;viewer_membership:string|null;viewer_application_status:string|null;can_manage_inquiries:boolean;public_key:string;profile:Partial<ClubProfile>;contacts:ClubContact[];courses:ClubProfileCourse[];pul_member_count:number;can_manage:boolean;version:number|null;link_conflict:boolean};
export const emptyClubProfile:ClubProfile={description:"",activityType:"field",purposes:[],meetingRule:"",weekdays:[],meetingTime:"",beginnerGuide:"",lesson:"inquiry",lessonFee:"inquiry",offlineSize:null,capacity:null,ageGroup:"",conditionKind:"none",conditionDetail:"",recruitmentWindow:"always",windowDetail:"",windowStart:"",windowEnd:"",joiningFee:"",monthlyFee:"",annualFee:"",eventFee:"",rules:"",preparations:"",participationGuide:""};
export const emptyClubProfileInput:ClubProfileInput={name:"",region:"서울",district:"",summary:"",recruitment_status:"recruiting",profile:emptyClubProfile,contacts:[],field_course_key:null,screen_course_key:null,confirm_link_conflict:false};
const object=(v:unknown):v is Record<string,unknown>=>typeof v==="object"&&v!==null&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
export class ClubProfileError extends Error {}
export function validateClubProfileInput(value:unknown):ClubProfileInput {
 if(!object(value)||Object.keys(value).some(k=>!Object.keys(emptyClubProfileInput).includes(k)))throw new ClubProfileError("지원하지 않는 동호회 입력입니다.");
 const v=value as unknown as ClubProfileInput,p=v.profile;
 if(typeof v.name!=="string"||v.name.trim().length<2||v.name.trim().length>80)throw new ClubProfileError("동호회명은 2~80자로 입력해 주세요.");
 if(typeof v.summary!=="string"||v.summary.trim().length<10||v.summary.trim().length>500)throw new ClubProfileError("짧은 소개는 10~500자로 입력해 주세요.");
 if(!clubRegions.includes(v.region as never)||typeof v.district!=="string"||v.district.length>80||!["recruiting","waiting","closed"].includes(v.recruitment_status))throw new ClubProfileError("지역과 모집 상태를 확인해 주세요.");
 if(!object(p)||Object.keys(p).some(k=>!(k in emptyClubProfile)))throw new ClubProfileError("동호회 상세 입력을 확인해 주세요.");
 for(const [k,def]of Object.entries(emptyClubProfile)){const x=p[k as keyof ClubProfile];if(typeof def==="string"&&(typeof x!=="string"||x.length>(k==="description"||k==="rules"?4000:1000)))throw new ClubProfileError("입력 길이와 형식을 확인해 주세요.");}
 if(!["field","screen","both"].includes(p.activityType)||!["none","available","inquiry"].includes(p.lesson)||!["free","paid","inquiry"].includes(p.lessonFee)||!["none","region","age","gender","other"].includes(p.conditionKind)||!["always","monthly","dates"].includes(p.recruitmentWindow))throw new ClubProfileError("선택 항목을 확인해 주세요.");
 if(!Array.isArray(p.purposes)||p.purposes.some(x=>!clubPurposes.includes(x as never))||new Set(p.purposes).size!==p.purposes.length||!Array.isArray(p.weekdays)||p.weekdays.some(x=>!["월","화","수","목","금","토","일"].includes(x))||new Set(p.weekdays).size!==p.weekdays.length)throw new ClubProfileError("활동 목적과 요일을 확인해 주세요.");
 for(const n of [p.offlineSize,p.capacity])if(n!==null&&(!Number.isSafeInteger(n)||n<1||n>100000))throw new ClubProfileError("회원 규모와 정원은 양의 정수로 입력해 주세요.");
 if(p.conditionKind!=="none"&&!p.conditionDetail.trim())throw new ClubProfileError("가입 조건의 세부 안내를 입력해 주세요.");
 if(p.recruitmentWindow==="monthly"&&!p.windowDetail.trim())throw new ClubProfileError("매월 모집 기간을 입력해 주세요.");
 if(p.recruitmentWindow==="dates"&&(!/^\d{4}-\d{2}-\d{2}$/.test(p.windowStart)||!/^\d{4}-\d{2}-\d{2}$/.test(p.windowEnd)||p.windowEnd<p.windowStart))throw new ClubProfileError("모집 시작일과 종료일을 확인해 주세요.");
 if(!Array.isArray(v.contacts)||v.contacts.length>2)throw new ClubProfileError("연락 담당자는 최대 2명입니다.");
 for(const c of v.contacts){if(!object(c)||Object.keys(c).some(k=>!["name","role","phone","visibility","consent"].includes(k))||typeof c.name!=="string"||!c.name.trim()||c.name.length>60||typeof c.role!=="string"||!c.role.trim()||c.role.length>30||typeof c.phone!=="string"||(c.phone!==""&&!/^[0-9+() -]{7,30}$/.test(c.phone))||!["private","members","public"].includes(c.visibility)||typeof c.consent!=="boolean"||(c.visibility!=="private"&&!c.consent))throw new ClubProfileError("담당자 정보와 공개 동의를 확인해 주세요.");}
 for(const key of [v.field_course_key,v.screen_course_key])if(key!==null&&(typeof key!=="string"||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(key)))throw new ClubProfileError("활동 구장을 다시 선택해 주세요.");
 if(typeof v.confirm_link_conflict!=="boolean")throw new ClubProfileError("기존 연결 확인이 필요합니다.");
 if(p.activityType==="field"&&v.screen_course_key||p.activityType==="screen"&&v.field_course_key)throw new ClubProfileError("활동 형태에 맞는 구장을 선택해 주세요.");
 return {...v,name:v.name.trim(),summary:v.summary.trim(),district:v.district.trim(),profile:{...p},contacts:v.contacts.map(c=>({...c,name:c.name.trim(),role:c.role.trim(),phone:c.phone.trim()}))};
}
export async function getClubProfile(client:SupabaseClient,key:string):Promise<ClubProfileSnapshot>{
 const {data,error}=await client.rpc("get_club_profile",{p_club_key:key});
 if(error)throw new ClubProfileError("동호회 상세 정보를 불러오지 못했습니다. 다시 시도해 주세요.");
 if(!object(data)||data.public_key!==key||!object(data.profile)||!Array.isArray(data.contacts)||!Array.isArray(data.courses)||typeof data.pul_member_count!=="number"||typeof data.can_manage!=="boolean"||typeof data.link_conflict!=="boolean")throw new ClubProfileError("동호회 상세 응답을 확인할 수 없습니다.");
 return data as unknown as ClubProfileSnapshot;
}
export async function getClubSettings(client:SupabaseClient,key:string):Promise<{payload:ClubProfileInput;version:number}>{
 const {data,error}=await client.rpc("get_club_settings",{p_club_key:key});
 if(error)throw new ClubProfileError("동호회 정보를 수정할 권한이 없거나 정보를 불러오지 못했습니다.");
 if(!object(data)||typeof data.version!=="number"||!object(data.payload))throw new ClubProfileError("동호회 설정 응답을 확인할 수 없습니다.");
 return {payload:{...emptyClubProfileInput,...data.payload,profile:{...emptyClubProfile,...(data.payload.profile as object)}} as ClubProfileInput,version:data.version};
}

