"use client";
import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import type { HomeWeather } from "@/lib/weather/weather";
import { dateOffset, daySummary, koreanDay, periodLabel, staleWeather, weatherClock, weatherStamp } from "@/lib/weather/rounding";
import { useForecastExpiry } from "./useForecastExpiry";
import styles from "./Weather.module.css";
export function WeatherDetail({weather, title, regionLabel, now, returnHref, returnLabel, refreshHref, unavailable}: {weather: HomeWeather | null; title: string; regionLabel?: string; now: number; returnHref: string; returnLabel: string; refreshHref: string; unavailable?: string}) {
 const [day, setDay] = useState(0);
 const expired = useForecastExpiry(now);
 const dates = [0,1,2].map(i=>dateOffset(now,i));
 const selected = (weather?.forecast ?? []).filter(p=>koreanDay(Date.parse(p.time))===dates[day]);
 const old = weather ? staleWeather(weather,now) : false;
 const forecastHeading = expired ? "표시 시각이 지난 예보" : old || weather?.previousForecast ? "이전 시간대 예보" : "현재 시간대 예보";
 return <div className={styles.page} data-weather-detail>
  <Link prefetch={false} className={styles.back} href={returnHref}>← {returnLabel}</Link>
  <header className={styles.intro}>
   <p className={styles.small}>시간별 날씨</p><h1>{title}</h1>
   {regionLabel ? <p className={styles.region}>{regionLabel}</p> : null}
   <p className={styles.subtitle}>오늘부터 모레까지, 라운딩 전 날씨를 살펴보세요.</p>
   {weather ? <section className={styles.currentForecast} aria-label={forecastHeading}>
    <h2>{forecastHeading}</h2>
    <div className={styles.current}><Icon name={weather.icon} className="h-8 w-8 text-pul-point"/><strong>{Math.round(weather.temperatureC)}℃</strong><span>{weather.condition}</span></div>
    <p className={styles.forecastTime}><time dateTime={weather.observedAt}>{weatherStamp(weather.observedAt)} 기준 예보</time></p>
   </section> : <p role="status" className={styles.alert}>{unavailable ?? "날씨 정보를 불러오지 못했습니다."}</p>}
  </header>
  {expired ? <p className={styles.alert} role="status">표시 기준 시각이 지났습니다. 아래 목록은 {weatherStamp(now)}에 확인한 예보입니다. <Link prefetch={false} href={refreshHref} onClick={() => { window.location.assign(refreshHref); }}>다시 확인하기</Link></p> : null}
  {old || weather?.previousForecast ? <p className={styles.alert} role="status">{old ? "자료 발표 시각이 오래되었거나 확인되지 않습니다." : "이전 시각의 예측 자료입니다."} 최신 기상 안내도 확인해 주세요.</p> : null}
  <nav className={styles.tabs} aria-label="예보 날짜">{dates.map((date,i)=><button key={date} type="button" aria-pressed={day===i} aria-controls="weather-day-panel" onClick={()=>setDay(i)}>{expired ? `${Number(date.slice(5,7))}월 ${Number(date.slice(8))}일` : ["오늘","내일","모레"][i]}<small>{date.replaceAll("-",".")}</small></button>)}</nav>
  <section id="weather-day-panel" className={styles.forecast} aria-label={`${dates[day]} 예보`}>
   <div className={styles.forecastHeader}><h2>{dates[day].replaceAll("-",".")} 시간별 예보</h2><p>{daySummary(selected)}</p></div>
   <div className={`${styles.row} ${styles.tableHead}`} aria-hidden="true"><span>시각</span><span>날씨</span><span>기온</span><span>예상 강수량 · 대상 구간</span><span>바람</span></div>
   {selected.length ? <ul>{selected.map(p=><li className={styles.row} key={p.time}><time dateTime={p.time}>{weatherClock(p.time)}</time><div className={styles.rowCondition}><Icon name={p.icon} className="h-5 w-5 shrink-0 text-pul-point"/><span>{p.condition}</span></div><div>{p.temperatureC === null ? "기온 미제공" : `${Math.round(p.temperatureC)}℃`}</div><div>{p.precipitationMm === null ? "강수량 미제공" : `${p.precipitationMm}mm`}<small>{p.periodHours ? `${p.periodHours}시간 예상량 · ${periodLabel(p)}` : "강수 구간 미제공"}</small></div><div>{p.windSpeedKmh === null ? "바람 미제공" : `${Math.round(p.windSpeedKmh)}km/h`}</div></li>)}</ul> : <p className="p-5 text-sm text-pul-muted" role="status">선택한 날짜의 예보 자료가 없습니다.</p>}
  </section>
  <aside className={styles.notes}><p>{weather?.updatedAt ? `자료 발표 ${weatherStamp(weather.updatedAt)} · ` : "자료 발표 시각 미제공 · "}표시 시각은 한국 시간입니다.</p><p>기온·바람은 표시 시각의 예측값이며, 강수량은 함께 적힌 전체 구간의 예상량입니다. 제공 간격을 그대로 표시하며 빈 시간은 채우지 않습니다.</p><details><summary>라운딩 여건 참고 기준</summary><p>PUL이 정한 참고 기준으로 공식 기상 등급이나 안전 보장이 아닙니다. 약 2시간의 자료 전체가 있을 때만 판단합니다.</p><p>주의: 뇌우·눈·진눈깨비·안개, 시간당 강수량 1mm 이상, 바람 28.8km/h 이상, 기온 0℃ 이하 또는 35℃ 이상 중 하나. 보통: 강수 예보, 바람 18km/h 이상, 기온 5℃ 이하 또는 30℃ 이상 중 하나. 그 외는 좋음입니다.</p><p>주의를 우선하며, 자료 누락·12시간 넘은 발표 자료는 판단 정보 부족으로 표시합니다. 예상 변화와 운영기관 안내도 함께 확인해 주세요.</p></details><p className={styles.sourceLine}><a href="https://api.met.no/" target="_blank" rel="noreferrer" className={styles.source}>{weather?.sourceLabel ?? "출처: MET Norway"}</a><span aria-hidden="true">·</span><a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer" className={styles.source}>CC BY 4.0</a></p></aside>
 </div>;
}
