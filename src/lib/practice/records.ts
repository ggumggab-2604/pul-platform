import {beforeLimit,compare,type Comparison} from '@/lib/clubs/scoreAverages';
export const practiceConditions={outdoor_18_single:'야외 18홀 · 단일 라운드',outdoor_9_single:'야외 9홀',outdoor_36:'야외 36홀',screen:'스크린',other:'그 밖의 경기 조건'} as const;
export type PracticeCondition=keyof typeof practiceConditions;
export type PracticeRecord={id:string;date:string;courseKey:string|null;course:string;condition:PracticeCondition;score:number;memo:string;version:number;createdAt:string};
export type PracticeWorkspace={viewerId:string;records:PracticeRecord[]};
export type PracticeDraft=Omit<PracticeRecord,'id'|'createdAt'> & {id:string|null};
export function practiceComparison(rows:PracticeRecord[],r:PracticeRecord):Comparison{
 if(r.condition!=='outdoor_18_single')return {count:0,average:null,direction:null,boundary:false};
 const p=beforeLimit(rows.filter(x=>x.condition==='outdoor_18_single'),r.date,5);return compare(p.items,r.score,p.boundary);
}
export function practiceErrors(r:PracticeDraft){
 const e:string[]=[];
 if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||r.date<'0001-01-01'||r.date>'9999-12-31'||Number.isNaN(Date.parse(r.date))||new Date(r.date).toISOString().slice(0,10)!==r.date)e.push('경기일을 확인해 주세요.');
 if(!r.course.trim()||r.course.trim().length>200)e.push('구장 이름을 입력해 주세요.');
 if(!Object.hasOwn(practiceConditions,r.condition))e.push('경기 조건을 확인해 주세요.');
 if(!Number.isSafeInteger(r.score)||r.score<1||r.score>2147483647)e.push('총타수는 1 이상의 정수로 입력해 주세요.');
 if(r.memo.length>1000)e.push('메모는 1,000자까지 입력할 수 있습니다.');
 return e;
}
