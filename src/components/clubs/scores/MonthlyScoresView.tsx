import Link from 'next/link';
import {memberScoreHref,type TableComparisons} from '@/lib/clubs/scoreAverages';
import {ScoreComparison} from './ScoreComparison';
import {annualScoreColumns,annualScores,monthlyGameLabels,scoreMonth,rankScores,rankLabel,personKind,type MonthlyWorkspace,type MonthlyGameType,type ScoreSheet,type ScorePerson} from '@/lib/clubs/monthlyScores';
import {ScoreDownload} from './ScoreDownload';
import s from './MonthlyScores.module.css';
export function ScoreName({person}:{person:Pick<ScorePerson,'name'|'id'|'kind'>}) {return <><span className={s.name}>{person.name}</span>{person.kind==='manual'&&<small>수동 명단 {person.id.slice(0,8)}</small>}</>;}
export function ScoreTable({rows,comparisons,clubKey,sheetId,sheetDate}:{rows:ScorePerson[];comparisons?:TableComparisons;clubKey?:string;sheetId?:string;sheetDate?:string}) {return <table className={s.table}><thead><tr><th scope="col">순위</th><th scope="col">이름</th><th scope="col" className={s.kind}>회원 구분</th><th scope="col">총타수</th></tr></thead><tbody>{rankScores(rows).map(p=><tr key={p.id} id={`score-${p.id}`}><td>{rankLabel(p)}</td><td><ScoreName person={p}/><small className={s.mobileKind}>{personKind(p)}</small></td><td className={s.kind}>{personKind(p)}</td><td>{comparisons?.[`${sheetId}:${p.id}`]?<><ScoreComparison score={p.score} comparison={comparisons[`${sheetId}:${p.id}`].comparison}/></>:p.score===null?'미입력':`${p.score}타`}{clubKey&&sheetId&&p.userId&&p.kind==='member'&&<div><Link prefetch={false} href={memberScoreHref(clubKey,{personId:p.id,kind:'monthly',eventId:sheetId,sourceId:sheetId,date:comparisons?.[`${sheetId}:${p.id}`]?.record.date??sheetDate??'',division:null})}>회원 상세</Link></div>}</td></tr>)}</tbody></table>;}
export function ScoreBreadcrumb({clubKey,clubName}:{clubKey:string;clubName:string}){return <nav className={s.crumb} aria-label="경로"><Link href={`/clubs/${encodeURIComponent(clubKey)}`}>{clubName}</Link><span>›</span><Link href={`/clubs/${encodeURIComponent(clubKey)}#club-honor`}>명예의 전당</Link><span>›</span><Link href={`/clubs/${encodeURIComponent(clubKey)}/ranking`}>동호회 순위</Link><span>›</span><span>회원 성적</span><span>›</span><span>월례회</span></nav>;}
export function MonthlyScoresView({data,month,sheet,game,annual,fromMedals,comparisons,averageError}:{
 data:MonthlyWorkspace;month:number;sheet?:ScoreSheet;game?:MonthlyGameType;annual:boolean;fromMedals:boolean;comparisons?:TableComparisons;averageError?:string;
}) {
 const base=`/clubs/${encodeURIComponent(data.clubKey)}/scores`,period=`year=${data.year}&month=${month}`;
 const sheets=data.sheets.filter(x=>!game||x.gameType===game);
 const monthSheets=sheets.filter(x=>scoreMonth(x.date)===month);
 const columns=annualScoreColumns(sheets);
 const gameQuery=game?`&game=${game}`:'';
 const sourceHref=(source:ScoreSheet)=>`${base}?year=${data.year}&month=${scoreMonth(source.date)}&sheet=${encodeURIComponent(source.id!)}`;
 return <main className={s.wrap}>
  <ScoreBreadcrumb clubKey={data.clubKey} clubName={data.clubName}/>
  <div className={s.head}><div><h1>월례회 {annual?'연간 성적':'성적'}</h1><p className={s.hint}>{data.clubName} · 남녀 통합 · 18홀 총타수</p></div>
   <div className={s.actions}>
    <Link className={s.button} href={`${base}?${period}&view=medals${fromMedals&&sheet?.gameType?`&game=${sheet.gameType}`:gameQuery}`}>{fromMedals?'월간 메달로 돌아가기':'월간 메달'}</Link>
    <Link className={s.button} href={`${base}?${period}${gameQuery}${annual?'':'&view=annual'}`}>{annual?'월별 보기':'연간 보기'}</Link>
   </div>
  </div>
  <form className={s.filters} action={base}>
   <label>연도<input name="year" type="number" min="1" max="9999" defaultValue={data.year} required/></label>
   {annual?<input type="hidden" name="view" value="annual"/>:<label>월<select name="month" defaultValue={month}>{Array.from({length:12},(_,i)=><option key={i} value={i+1}>{i+1}월</option>)}</select></label>}
   <label>경기 종류<select name="game" defaultValue={game??''}><option value="">전체</option>{Object.entries(monthlyGameLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
   <button className={s.button}>조회</button>
   {data.canEdit&&<Link className={s.button} href={base+"/annual?year="+data.year}>연간 활동·시상</Link>}
   {!annual&&data.canEdit&&<Link className={`${s.button} ${s.primary}`} href={`${base}/edit?${period}&mode=new`}>새 경기 성적 입력</Link>}
  </form>
  {!annual&&monthSheets.length>1&&<nav className={s.actions} aria-label="경기 선택">
   {monthSheets.map(x=><Link key={x.id} className={s.button} aria-current={x.id===sheet?.id?'page':undefined} href={sourceHref(x)+gameQuery}>{x.date} · {x.gameType?monthlyGameLabels[x.gameType]:'종류 미확인'} · {x.title}</Link>)}
  </nav>}
  {averageError&&<p role="alert" className={s.note}>{averageError}</p>}
  {(annual?sheets.length>0:!!sheet)&&<ScoreDownload clubKey={data.clubKey} year={data.year} month={month} annual={annual} sheetId={annual?undefined:sheet?.id??undefined} game={annual?game:undefined}/>}
  {annual?<section className={s.panel}><h2>{data.year}년 회원별 성적</h2>
   <p className={s.hint}>같은 달에 열린 경기는 각각 표시합니다. 동일 순위는 공동 순위입니다. — 기록 없음 · 미입력은 참가자 선택 후 타수를 입력하지 않은 상태입니다.</p>
   {sheets.length?<><div className={s.annual} tabIndex={0} aria-label="연간 성적표, 좌우로 스크롤"><table className={`${s.table} ${comparisons?s.annualCompared:''}`} style={{minWidth:columns.length*130+150}}>
    <thead><tr><th rowSpan={2}>이름 · 회원 구분</th>{columns.map(({month,sheet,label})=><th colSpan={2} key={sheet?.id??month}><Link href={sheet?sourceHref(sheet):`${base}?year=${data.year}&month=${month}${gameQuery}`} title={sheet?.title}>{label}{sheet?.gameType? ` · ${monthlyGameLabels[sheet.gameType]}`:''}</Link></th>)}</tr>
    <tr>{columns.map(({month,sheet})=><GroupHead key={sheet?.id??month}/>)}</tr></thead>
    <tbody>{annualScores(sheets).map(p=><tr key={p.id} id={`score-${p.id}`}><td><ScoreName person={p}/><small>{personKind(p)}</small></td>{p.cells.map((cell,i)=>{
     const source=columns[i].sheet;
     return <MonthCells key={source?.id??columns[i].month} cell={cell} href={source?sourceHref(source):`${base}?year=${data.year}&month=${columns[i].month}${gameQuery}`} clubKey={data.clubKey} info={comparisons?.[`${source?.id}:${p.id}`]}/>;
    })}</tr>)}</tbody>
   </table></div><div className={s.note}>{sheets.map(x=><p key={x.id}><Link href={sourceHref(x)}>{x.date} · {x.gameType?monthlyGameLabels[x.gameType]:'종류 미확인'} · {x.title}</Link> · {x.course}<br/>{x.note||'경기 비고 없음'}</p>)}</div></>:<p className={s.hint}>저장된 성적표가 없습니다.</p>}
  </section>:sheet?<section className={s.panel}><div className={s.head}><h2>{sheet.title}</h2>{data.canEdit&&<Link className={s.button} href={`${base}/edit?${period}&sheet=${encodeURIComponent(sheet.id!)}`}>이 경기 성적 수정</Link>}</div>
   <div className={s.facts}><span>{sheet.date}</span><span>{sheet.gameType?monthlyGameLabels[sheet.gameType]:'종류 미확인'}</span><span>{sheet.course}</span><span>18홀</span><span>참가 {sheet.rows.length}명</span></div>
   {sheet.rows.some(r=>r.score===null)&&<p className={s.note}>미입력 {sheet.rows.filter(r=>r.score===null).length}명 · 입력된 성적 기준 순위입니다. 입력 완료자의 순위만 표시합니다.</p>}
   <ScoreTable rows={sheet.rows} clubKey={data.clubKey} sheetId={sheet.id??undefined} sheetDate={sheet.date} comparisons={comparisons}/>
   <div className={s.note}><strong>경기 비고</strong><p>{sheet.note||'등록된 비고가 없습니다.'}</p></div>
  </section>:<section className={s.panel}><p>선택한 월에 저장된 성적표가 없습니다.</p><p className={s.hint}>회장·부회장이 실제 참가자와 18홀 총타수를 입력할 수 있습니다.</p></section>}
 </main>;
}
function GroupHead(){return <><th>타수</th><th>순위</th></>;}
function MonthCells({cell,href,clubKey,info}:{cell:ReturnType<typeof rankScores>[number]|null;href:string;clubKey:string;info?:TableComparisons[string]}){return <><td><Link href={href}>{info?<ScoreComparison compact score={cell?.score??null} comparison={info.comparison}/>:cell?(cell.score??'미입력'):'—'}</Link>{info&&<Link prefetch={false} href={memberScoreHref(clubKey,info.record)}>회원 상세</Link>}</td><td><Link href={href}>{cell?.rank??'—'}</Link></td></>;}
