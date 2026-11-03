export const comparisonBases = {unconfirmed:'경기 기준 미확인',outdoor_18_single:'야외 18홀 · 단일 라운드 확인',other:'스크린·다른 홀 수·복수 라운드 등'} as const;
export type ComparisonBasis = keyof typeof comparisonBases;
export type BestCard = {name:string;score:number;date:string;course:string;kind:'monthly'|'tournament';rank:number;tied:boolean};
export type PersonalBest = BestCard & {personId:string;eventId:string;sourceId:string;isMine:boolean};
export type PersonalScore = Pick<PersonalBest,'personId'|'eventId'|'sourceId'|'kind'|'date'|'course'> & {score:number|null;title:string;reason:string|null};
export type PersonalBestWorkspace = {clubKey:string;clubName:string;items:PersonalBest[];missing:{name:string;isMine:boolean}[];excluded:{reason:string;count:number}[];personName:string|null;history:PersonalScore[]};
export const bestRank = (r:Pick<BestCard,'rank'|'tied'>) => `${r.tied?'공동 ':''}${r.rank}위`;
export const scoreKind = (kind:BestCard['kind']) => kind==='monthly'?'월례회':'대회';
export function scoreSourceHref(clubKey:string,r:Pick<PersonalScore,'kind'|'date'|'eventId'|'sourceId'|'personId'>) {
 const base=`/clubs/${encodeURIComponent(clubKey)}`;
 return r.kind==='monthly'?`${base}/scores?year=${Number(r.date.slice(0,4))}&month=${Number(r.date.slice(5,7))}&sheet=${encodeURIComponent(r.eventId)}#score-${encodeURIComponent(r.personId)}`:`${base}/tournaments?tournament=${encodeURIComponent(r.eventId)}&entry=${encodeURIComponent(r.sourceId)}#entry-${encodeURIComponent(r.sourceId)}`;
}
