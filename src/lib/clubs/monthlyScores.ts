import type { MonthlyGender } from '@/lib/auth/memberBasics';

export type ScorePerson = {
 id: string; userId: string | null; kind: 'member' | 'manual'; name: string; score: number | null;
 gender?: MonthlyGender | null; anonymized?: boolean;
 participantGender?: MonthlyGender | null;
 genderCorrection?: {gender: MonthlyGender | null; reason: string};
};
export type MonthlyGameType = 'field' | 'screen';
export const monthlyGameLabels = {field:'필드',screen:'스크린'} as const;
export type ScoreSheet = { annualScreenCondition?:string|null; courseKey?:string|null; linkedCourse?:string|null; courseSegments?:string[]|null; course_confirmation?:import("./scoreCourseConnection").CourseConfirmation|null; comparison_basis?: import('./personalBests').ComparisonBasis; id: string | null; date: string; title: string; course: string; eventId: string | null; note: string; version: number; rows: ScorePerson[]; gameType?:MonthlyGameType|null; medalEligible?:boolean };
type MonthlyEvent = {id:string;date:string;title:string;gameType:MonthlyGameType|null};
export type MonthlyWorkspace = {
 clubKey: string; clubName: string; year: number; canEdit: boolean; sheets: ScoreSheet[];
 members?: { id: string | null; userId: string; name: string; gender?: MonthlyGender | null; canSupplement?: boolean }[];
 manualPeople?: (Omit<ScorePerson, 'score'> & {canSupplement?: boolean})[];
 events?: (MonthlyEvent & {courseKey:string|null;version:number;course:string})[];
 homeCourses?: { key: string; name: string; type: MonthlyGameType }[];
 pendingMedalEvents?: Pick<MonthlyEvent,'date'|'gameType'>[];
};
export const scoreNameOrder = (a: {name:string;id:string}, b: {name:string;id:string}) => a.name.localeCompare(b.name, 'ko') || a.id.localeCompare(b.id);
export function rankScores(rows: ScorePerson[]) {
 const sorted = [...rows].sort((a,b) => (a.score ?? Infinity) - (b.score ?? Infinity) || scoreNameOrder(a,b));
 let previous: number | null = null, rank = 0;
 return sorted.map((p,i) => { if(p.score !== null && p.score !== previous) rank=i+1; previous=p.score;
 return {...p, rank: p.score === null ? null : rank, tied: p.score !== null && rows.filter(r=>r.score===p.score).length>1}; });
}
export const rankLabel = (r: {rank:number|null;tied:boolean}) => r.rank === null ? '—' : `${r.tied?'공동 ':''}${r.rank}위`;
export const personKind = (p: Pick<ScorePerson,'kind'>) => p.kind==='manual'?'동호회 미가입회원':'동호회 회원';
export const scoreMonth = (date:string) => Number(date.slice(5,7));
export function selectScoreSheet(sheets:ScoreSheet[],month:number,id?:string|null,gameType?:MonthlyGameType) {
 const matches=sheets.filter(s=>scoreMonth(s.date)===month);
 if(id!=null)return matches.find(s=>s.id===id);
 return matches.findLast(s=>!gameType||s.gameType===gameType);
}
export function annualScoreColumns(sheets:ScoreSheet[]) {
 return Array.from({length:12},(_,i)=>{
  const month=i+1,matches=sheets.filter(s=>scoreMonth(s.date)===month).sort((a,b)=>a.date.localeCompare(b.date));
  if(!matches.length)return [{month,sheet:null,label:`${month}월`}];
  return matches.map((sheet,index)=>({month,sheet,label:matches.length===1?`${month}월`:`${month}/${Number(sheet.date.slice(8,10))} ${index+1}`}));
 }).flat();
}
export function annualScores(sheets: ScoreSheet[]) {
 const people = new Map<string, ScorePerson>();
 const ranks=annualScoreColumns(sheets).map(({sheet})=>new Map(rankScores(sheet?.rows??[]).map(p=>{
  if(!people.has(p.id))people.set(p.id,p);
  return [p.id,p];
 })));
 return [...people.values()].sort(scoreNameOrder).map(p=>({...p,cells:ranks.map(r=>r.get(p.id)??null)}));
}
export function monthlyMedals(data:MonthlyWorkspace,month:number,gameType:MonthlyGameType) {
 const candidates=[
  ...data.sheets.filter(s=>s.medalEligible!==false).map(sheet=>({date:sheet.date,gameType:sheet.gameType,sheet})),
  ...(data.pendingMedalEvents??[]).map(event=>({date:event.date,gameType:event.gameType,sheet:null})),
 ].filter(c=>scoreMonth(c.date)===month&&(!c.gameType||c.gameType===gameType));
 const date=candidates.reduce((latest,c)=>c.date>latest?c.date:latest,'');
 if(!date)return {status:'empty'} as const;
 const latest=candidates.filter(c=>c.date===date);
 if(latest.some(c=>!c.gameType))return {status:'unclassified',date} as const;
 if(latest.length>1)return {status:'ambiguous',date} as const;
 const sheet=latest[0].sheet;
 if(!sheet)return {status:'unregistered',date} as const;
 const members=sheet.rows.filter(r=>r.kind==='member'&&r.userId);
 if(members.some(r=>r.score===null))return {status:'incomplete',date,sheet} as const;
 const eligible=members.filter((r):r is ScorePerson & {score:number}=>Number.isInteger(r.score)&&Number(r.score)>0);
 if(!eligible.length)return {status:'no-eligible',date,sheet} as const;
 const scores=[...new Set(eligible.map(r=>r.score))].sort((a,b)=>a-b).slice(0,3);
 return {status:'ready',date,sheet,groups:scores.map(score=>({score,winners:eligible.filter(r=>r.score===score).sort(scoreNameOrder)}))} as const;
}
export function scorePeriod(year: string | null | undefined, month: string | null | undefined) {
 const today = new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
 const y = year == null ? Number(today.slice(0,4)) : Number(year), m = month == null ? Number(today.slice(5,7)) : Number(month);
 if(!Number.isInteger(y)||y<1||y>9999||!Number.isInteger(m)||m<1||m>12)throw Error('연도와 월을 확인해 주세요.');
 return {year:y,month:m};
}
