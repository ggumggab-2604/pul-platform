"use client";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import type { HomeWeather } from "@/lib/weather/weather";
import { roundingSummary, weatherClock, weatherStamp } from "@/lib/weather/rounding";
import { useForecastExpiry } from "./useForecastExpiry";
import styles from "./Weather.module.css";
export function RoundingWeatherCard({ weather, loadFailed, course, className }: {weather: HomeWeather | null; loadFailed: boolean; course: {locationLabel: string; status?: "loading" | "missing"; detailHref?: string}; className?: string}) {
 const expired = useForecastExpiry(weather?.calculatedAt ?? 0);
 const state = course.status ?? (loadFailed || !weather ? "failed" : "ready");
 const summary = weather ? roundingSummary(weather, weather.calculatedAt ?? Date.parse(weather.observedAt)) : null;
 return <section className={`${styles.card} ${className ?? ""}`} aria-label={`${course.locationLabel} 날씨`} data-course-weather data-weather-state={state}>
   <div className={styles.heading}><h2>{course.locationLabel} 날씨</h2>{weather && state === "ready" ? <div className={styles.current}><Icon name={weather.icon} className="h-6 w-6 text-pul-point"/><strong>{Math.round(weather.temperatureC)}℃</strong><span>{weather.condition}</span><span className={styles.small}>{weatherClock(weather.observedAt)} 예보</span></div> : null}</div>
   {summary && weather && state === "ready" ? <>
    <div className={styles.window}><strong>{expired ? "표시 기준 시각 경과" : "앞으로 약 2시간"}</strong><span>{weatherClock(summary.start)}~{weatherClock(summary.end)}</span></div>
    {!expired ? <dl className={styles.metrics}><div><dt>비 예보</dt><dd>{summary.rain}</dd></div><div><dt>바람</dt><dd>{summary.wind}{!summary.stale && summary.maxWind !== null ? <small>최대 {Math.round(summary.maxWind)}km/h</small> : null}</dd></div><div><dt>라운딩 여건</dt><dd data-level={summary.condition}>{summary.condition}</dd></div></dl> : null}
    <p className={styles.change} role="status">{expired ? "시간이 지나 요약을 종료했습니다. 자세히 보기에서 최신 기준으로 확인해 주세요." : summary.change}</p>
    <div className={styles.footer}><div><a href={weather.sourceUrl} target="_blank" rel="noreferrer" className={styles.source}>{weather.sourceLabel}</a><span>{weather.updatedAt ? `자료 발표 ${weatherStamp(weather.updatedAt)}` : "자료 발표 시각 미제공"}</span></div>{course.detailHref ? <Link prefetch={false} href={course.detailHref}>자세히 보기 →</Link> : null}</div>
   </> : <p className={styles.change} role="status">{state === "loading" ? "날씨를 불러오는 중입니다." : state === "missing" ? "구장 위치 정보가 없어 날씨를 표시할 수 없습니다." : "날씨 정보를 불러오지 못했습니다."}</p>}
   {state !== "ready" && course.detailHref ? <Link className={styles.link} prefetch={false} href={course.detailHref}>자세히 보기 →</Link> : null}
 </section>;
}
