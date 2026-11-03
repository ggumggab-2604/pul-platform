import type {Comparison} from '@/lib/clubs/scoreAverages';
import s from './ScoreComparison.module.css';
export function ScoreComparison({score,comparison,excluded=false,compact=false}:{score:number|null;comparison?:Comparison;excluded?:boolean;compact?:boolean}){
 const direction=comparison?.direction;
 return <div className={`${s.block} ${compact?s.compact:''}`}><div className={s.score}>{score===null?'—':<>{score}<span className={s.unit}>타</span></>}{direction&&<span className={`${s.arrow} ${direction==='up'?s.up:s.down}`} role="img" aria-label={direction==='up'?'비교 평균보다 낮은 타수, 개선':'비교 평균보다 높은 타수, 악화'}>{direction==='up'?'▲':'▼'}</span>}</div>{comparison&&<p className={s.mean}>{excluded?'이번 비교 조건 밖':comparison.count?`이전 ${comparison.count}경기 평균 ${comparison.average}타`:'이전 0경기 평균 —'}</p>}{comparison?.boundary&&<p className={s.mean}>같은 날 순서가 불명확한 경계 기록 제외</p>}</div>;
}
