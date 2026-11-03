export type ScoreKind='monthly'|'tournament';
export type OfficialScore={sourceKey:string;personId:string;kind:ScoreKind;eventId:string;sourceId:string;date:string;title:string;course:string;score:number;division:string|null};
export type AverageSources={viewerId:string;clubKey:string;personId:string|null;personName:string|null;isMine:boolean;records:OfficialScore[]};
export type Comparison={count:number;average:number|null;direction:'up'|'down'|null;boundary:boolean};
export type DatedScore={date:string;score:number};
export const emptyComparison:Comparison={count:0,average:null,direction:null,boundary:false};
export function average(rows:readonly DatedScore[]){
 const sum=rows.reduce((n,r)=>n+r.score,0),count=rows.length;
 return {count,average:count?Math.floor((2*sum+count)/(2*count)):null};
}
export function compare(rows:readonly DatedScore[],score:number,boundary=false):Comparison{
 const a=average(rows);return {...a,boundary,direction:a.average===null||score===a.average?null:score<a.average?'up':'down'};
}
export function beforeLimit<T extends DatedScore>(rows:readonly T[],date:string,limit?:number){
 const prior=rows.filter(r=>r.date<date),days=[...new Set(prior.map(r=>r.date))].sort().reverse(),items:T[]=[];let boundary=false;
 for(const day of days){const group=prior.filter(r=>r.date===day);if(limit!==undefined&&items.length+group.length>limit){boundary=true;break;}items.push(...group);if(items.length===limit)break;}
 return {items,boundary};
}
// Repeated source keys are references to the same original, never alternate score candidates.
export function uniqueOriginals(rows:OfficialScore[]):OfficialScore[]{
 const map=new Map<string,OfficialScore>();
 for(const r of rows){const old=map.get(r.sourceKey);if(old&&JSON.stringify(old)!==JSON.stringify(r))throw Error('같은 원본의 성적이 일치하지 않습니다. 원본을 확인해 주세요.');if(!old)map.set(r.sourceKey,r);}
 const events=new Set<string>();for(const r of map.values()){const key=JSON.stringify([r.personId,r.kind,r.eventId,r.division]);if(events.has(key))throw Error('같은 경기·부문의 원본을 확인해 주세요.');events.add(key);}
 return [...map.values()];
}
export function officialScope(rows:OfficialScore[],personId:string,kind:ScoreKind,year?:number,division?:string){return rows.filter(r=>r.personId===personId&&r.kind===kind&&(!year||Number(r.date.slice(0,4))===year)&&(kind!=='tournament'||division===undefined||r.division===division));}
export function officialComparison(rows:OfficialScore[],r:OfficialScore):Comparison{
 const prior=officialScope(rows,r.personId,r.kind,Number(r.date.slice(0,4)),r.division??undefined).filter(x=>x.date<r.date&&x.eventId!==r.eventId);
 return compare(prior,r.score);
}
export function latestDay<T extends DatedScore>(rows:T[]){const date=rows.reduce((d,r)=>r.date>d?r.date:d,'');return rows.filter(r=>r.date===date);}
export function recentMonthly(rows:OfficialScore[],r:OfficialScore){
 const [y,m]=r.date.split('-').map(Number);
 return [1,2,3].map(n=>{const year=y+Math.floor((m-1-n)/12),month=((m-1-n)%12+12)%12+1,key=`${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}`;return {month:key,records:officialScope(rows,r.personId,'monthly').filter(x=>x.date.startsWith(key)&&x.date<r.date)};});
}
export function recentTournaments(rows:OfficialScore[],r:OfficialScore){return beforeLimit(officialScope(rows,r.personId,'tournament',undefined,r.division??undefined).filter(x=>x.eventId!==r.eventId),r.date,3);}
export function memberScoreHref(clubKey:string,r:Pick<OfficialScore,'personId'|'kind'|'date'|'sourceId'|'eventId'|'division'>){
 const q=new URLSearchParams({kind:r.kind,year:r.date.slice(0,4),event:r.eventId,source:r.sourceId});if(r.division!==null)q.set('division',r.division);
 return `/clubs/${encodeURIComponent(clubKey)}/ranking/${encodeURIComponent(r.personId)}?${q}`;
}
export function officialSourceHref(clubKey:string,r:OfficialScore){
 const base=`/clubs/${encodeURIComponent(clubKey)}`;
 if(r.kind==='monthly')return `${base}/scores?${new URLSearchParams({year:r.date.slice(0,4),month:String(Number(r.date.slice(5,7))),sheet:r.eventId})}#score-${encodeURIComponent(r.personId)}`;
 return `${base}/tournaments?${new URLSearchParams({tournament:r.eventId,division:r.division??''})}#entry-${encodeURIComponent(r.sourceId)}`;
}
export function tableComparisonMap(rows:OfficialScore[],kind:ScoreKind){return Object.fromEntries(rows.filter(r=>r.kind===kind).map(r=>[`${r.sourceId}:${r.personId}`,{record:r,comparison:officialComparison(rows,r)}]));}
export type TableComparisons=ReturnType<typeof tableComparisonMap>;
