import Link from 'next/link';
import {monthlyGameLabels,monthlyMedals,type MonthlyGameType,type MonthlyWorkspace} from '@/lib/clubs/monthlyScores';
import {ScoreBreadcrumb} from './MonthlyScoresView';
import s from './MonthlyScores.module.css';

const messages={
 empty:'이달에 해당 종류의 월례회 기록이 없습니다.',
 unclassified:'집계 대기 · 최신 경기 종류를 확인해 주세요.',
 ambiguous:'집계 대기 · 같은 날 여러 경기가 있어 기준 경기 확인이 필요합니다.',
 unregistered:'집계 대기 · 최신 경기 성적표가 등록되지 않았습니다.',
 incomplete:'집계 대기 · 연결 회원의 미입력 타수가 있습니다.',
 'no-eligible':'메달 대상이 되는 유효 성적이 없습니다.',
};
const medals=['금메달','은메달','동메달'];

export function MonthlyMedalsView({data,month,game}:{data:MonthlyWorkspace;month:number;game:MonthlyGameType}) {
 const base=`/clubs/${encodeURIComponent(data.clubKey)}/scores`;
 const period=`year=${data.year}&month=${month}`;
 const result=monthlyMedals(data,month,game);
 return <main className={s.wrap}>
  <ScoreBreadcrumb clubKey={data.clubKey} clubName={data.clubName}/>
  <div className={s.head}><div><h1>월간 메달</h1><p className={s.hint}>{data.clubName} · 남녀 통합 · 18홀</p></div><Link className={s.button} href={`${base}?${period}&game=${game}`}>월례회 성적 보기</Link></div>
  <form className={s.filters} action={base}>
   <input type="hidden" name="view" value="medals"/>
   <label>연도<input name="year" type="number" min="1" max="9999" defaultValue={data.year} required/></label>
   <label>월<select name="month" defaultValue={month}>{Array.from({length:12},(_,i)=><option key={i} value={i+1}>{i+1}월</option>)}</select></label>
   <label>경기 종류<select name="game" defaultValue={game}>{Object.entries(monthlyGameLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
   <button className={s.button}>조회</button>
  </form>
  <section className={s.panel} aria-label="월간 메달 결과">
   <h2>{data.year}년 {month}월 {monthlyGameLabels[game]} 월간 메달</h2>
   {result.date&&<p className={s.facts}>기준 경기일 {result.date}{result.sheet&&` · ${result.sheet.title}`}</p>}
   {result.sheet?.id&&<Link className={s.button} href={`${base}?${period}&sheet=${encodeURIComponent(result.sheet.id)}&from=medals`}>기준 성적표 보기</Link>}
   {result.status==='ready'?<div className={s.podium}>{medals.map((medal,i)=>{
    const group=result.groups[i];
    return <article key={medal} className={s.panel}><h3>{medal}</h3>{group?<><p><strong>{group.score}타</strong> · {group.winners.length>1?'공동 수상':'수상'} {group.winners.length}명</p><ul>{group.winners.map(w=><li key={w.id}>{w.name}</li>)}</ul></>:<p className={s.hint}>수상자 없음</p>}</article>;
   })}</div>:<p className={s.note}>{messages[result.status]}</p>}
  </section>
 </main>;
}
