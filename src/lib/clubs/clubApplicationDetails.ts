export type ClubApplicationDetails={fullName:string;phone:string;level:string;lessonNeeded:string;otherClubs:string;previousActivity:string;averageScore:number|null;holes:number|null;days:string[]};
export type ClubApplicationConfirmations={rules:boolean;courtesy:boolean;schedule:boolean;rulesText:string};
export type ClubApplicationSnapshot=Partial<ClubApplicationDetails>&{confirmations?:ClubApplicationConfirmations;answers?:{experienceCode:string;availableDayCode:string;interestCodes:string[];applicationReason:string;message:string|null}};
export function applicationAvailableDay(days:readonly string[]):"notProvided"|"weekday"|"weekend"|"both" {
 if(!days.length)return "notProvided";
 const weekend=days.some(day=>day==="토"||day==="일"),weekday=days.some(day=>!["토","일"].includes(day));
 return weekend&&weekday?"both":weekend?"weekend":"weekday";
}
export const emptyClubApplicationDetails:ClubApplicationDetails={fullName:"",phone:"",level:"",lessonNeeded:"",otherClubs:"",previousActivity:"",averageScore:null,holes:null,days:[]};
export function validateClubApplicationDetails(value:unknown):ClubApplicationDetails {
 if(typeof value!=="object"||value===null||Array.isArray(value))throw Error("가입 신청 이름과 전화번호를 입력해 주세요.");
 const d=value as ClubApplicationDetails;
 if(typeof d.fullName!=="string"||!d.fullName.trim()||d.fullName.length>60)throw Error("이름은 1~60자로 입력해 주세요.");
 if(typeof d.phone!=="string"||(!/^[0-9+() -]{7,30}$/.test(d.phone)||d.phone.replace(/[^0-9]/g,"").length<7))throw Error("전화번호를 확인해 주세요.");
 for(const k of ["level","lessonNeeded","otherClubs","previousActivity"]as const)if(typeof d[k]!=="string"||d[k].length>500)throw Error("선택 정보를 500자 이하로 입력해 주세요.");
 if(d.averageScore!==null&&(!Number.isSafeInteger(d.averageScore)||d.averageScore<1||d.averageScore>9999||![18,36].includes(d.holes!)))throw Error("평균 타수를 입력하면 타수와 18홀 또는 36홀 기준을 확인해 주세요.");
 if(d.holes!==null&&![18,36].includes(d.holes))throw Error("홀 수 기준을 확인해 주세요.");
 if(!Array.isArray(d.days)||d.days.some(x=>!["월","화","수","목","금","토","일"].includes(x)))throw Error("참여 요일을 확인해 주세요.");
 return{...d,fullName:d.fullName.trim(),phone:d.phone.trim()};
}
export const inquiryCategories={availability:"가입 가능",lessons:"초보·레슨",conditions:"가입 조건",meeting:"모임·구장",fees:"회비·비용",other:"기타",existingMember:"기존 오프라인 회원 확인"} as const;
export type ClubInquiryCategory=keyof typeof inquiryCategories;
export const inquiryExamples:Record<ClubInquiryCategory,string>={availability:"현재 신규 회원을 받고 있나요?",lessons:"처음 시작하는 회원도 함께 연습하거나 강습을 받을 수 있나요?",conditions:"가입 가능한 지역·연령 등 조건을 알고 싶습니다.",meeting:"정기 모임 시간과 주로 이용하는 구장을 알고 싶습니다.",fees:"가입비와 회비, 행사 비용을 알고 싶습니다.",other:"궁금한 내용을 직접 입력해 주세요.",existingMember:"기존 오프라인 회원입니다. 회원 여부 확인 절차를 알려 주세요."};

