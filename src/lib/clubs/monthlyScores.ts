export type ScorePerson = { id: string; userId: string | null; kind: 'member' | 'manual'; name: string; score: number | null };
export type ScoreSheet = { comparison_basis?: import('./personalBests').ComparisonBasis; id: string | null; date: string; title: string; course: string; eventId: string | null; note: string; version: number; rows: ScorePerson[] };
export type MonthlyWorkspace = {
 clubKey: string; clubName: string; year: number; canEdit: boolean; sheets: ScoreSheet[];
 members?: { id: string | null; userId: string; name: string }[];
 manualPeople?: Omit<ScorePerson, 'score'>[];
 events?: { id: string; date: string; title: string; course: string }[];
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
export function annualScores(sheets: ScoreSheet[]) {
 const people = new Map<string, ScorePerson>();
 const months = new Map<number, ReturnType<typeof rankScores>>();
 for(const s of [...sheets].sort((a,b)=>a.date.localeCompare(b.date))) {
  months.set(Number(s.date.slice(5,7)),rankScores(s.rows));
  for(const p of s.rows) if(!people.has(p.id))people.set(p.id,p);
 }
 return [...people.values()].sort(scoreNameOrder).map(p=>({...p,cells:Array.from({length:12},(_,i)=>months.get(i+1)?.find(r=>r.id===p.id)??null)}));
}
export function scorePeriod(year: string | null | undefined, month: string | null | undefined) {
 const today = new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
 const y = year == null ? Number(today.slice(0,4)) : Number(year), m = month == null ? Number(today.slice(5,7)) : Number(month);
 if(!Number.isInteger(y)||y<1||y>9999||!Number.isInteger(m)||m<1||m>12)throw Error('연도와 월을 확인해 주세요.');
 return {year:y,month:m};
}
