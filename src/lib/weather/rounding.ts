import type { ForecastPoint, HomeWeather } from "./weather";

export const HOUR = 3_600_000;
// PUL reference thresholds, not an official meteorological or safety grade.
export const ROUNDING_LIMITS = { windModerateKmh: 18, windCautionKmh: 28.8, rainCautionMmPerHour: 1, coldCautionC: 0, coldModerateC: 5, hotModerateC: 30, hotCautionC: 35, maxIssueAgeHours: 12 } as const;
export const koreanDay = (time: number) => new Date(time + 9 * HOUR).toISOString().slice(0,10);
export function dateOffset(time: number, days: number) { return koreanDay(time + days * 24 * HOUR); }
const clock = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false });
const stamp = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
export const weatherClock = (time: number | string) => clock.format(new Date(time));
export const weatherStamp = (time: number | string) => stamp.format(new Date(time));
export function periodLabel(point: ForecastPoint) {
  return point.periodHours ? `${weatherStamp(point.time)}~${weatherStamp(Date.parse(point.time) + point.periodHours * HOUR)}` : "구간 정보 없음";
}
export function staleWeather(weather: HomeWeather, now: number) {
  const updated = Date.parse(weather.updatedAt ?? "");
  return !Number.isFinite(updated) || now - updated > ROUNDING_LIMITS.maxIssueAgeHours * HOUR || updated > now + HOUR;
}
export function roundingSummary(weather: HomeWeather, now: number) {
  const end = now + 2 * HOUR;
  const all = weather.forecast ?? [];
  // An overlap means the complete supplied hourly period, never prorated rainfall.
  const periods = all.filter(p => p.periodHours === 1 && Date.parse(p.time) < end && Date.parse(p.time) + HOUR > now);
  let coveredUntil = now;
  for (const p of periods) { const start = Date.parse(p.time); if (start > coveredUntil || p.precipitationMm === null || p.condition === "날씨 확인 중") break; coveredUntil = Math.max(coveredUntil,start+HOUR); }
  const points = all.filter(p => Date.parse(p.time) <= end && Date.parse(p.time) > now - HOUR);
  const missingInstant = !points.length || Date.parse(points[0].time) > now || end - Date.parse(points.at(-1)!.time) > HOUR || points.some((p,i) => p.temperatureC === null || p.windSpeedKmh === null || (i>0 && Date.parse(p.time)-Date.parse(points[i-1].time)>HOUR));
  const stale = staleWeather(weather,now);
  const complete = coveredUntil >= end && !missingInstant && !stale;
  const wet = periods.filter(p => (p.precipitationMm ?? 0) > 0 || /rain|snow|sleet|thunder/.test(p.symbol));
  const hazards = periods.filter(p => /thunder|snow|sleet|fog/.test(p.symbol));
  const hazard = hazards[0];
  const maxWind = !missingInstant && points.length && points.every(p=>p.windSpeedKmh!==null) ? Math.max(...points.map(p=>p.windSpeedKmh!)) : null;
  const minTemp = points.length ? Math.min(...points.map(p=>p.temperatureC ?? Infinity)) : Infinity;
  const maxTemp = points.length ? Math.max(...points.map(p=>p.temperatureC ?? -Infinity)) : -Infinity;
  const heavy = periods.some(p => (p.precipitationMm ?? 0) >= ROUNDING_LIMITS.rainCautionMmPerHour);
  const caution = !!hazard || heavy || (maxWind !== null && maxWind >= ROUNDING_LIMITS.windCautionKmh) || minTemp <= ROUNDING_LIMITS.coldCautionC || maxTemp >= ROUNDING_LIMITS.hotCautionC;
  const moderate = wet.length > 0 || (maxWind !== null && maxWind >= ROUNDING_LIMITS.windModerateKmh) || minTemp <= ROUNDING_LIMITS.coldModerateC || maxTemp >= ROUNDING_LIMITS.hotModerateC;
  const reason = [hazard ? `${hazard.condition} 예보` : wet.length ? "강수 예보" : "", maxWind !== null && maxWind >= ROUNDING_LIMITS.windModerateKmh ? "바람에 유의" : "", minTemp <= ROUNDING_LIMITS.coldModerateC ? "낮은 기온" : maxTemp >= ROUNDING_LIMITS.hotModerateC ? "높은 기온" : ""].filter(Boolean).join(" · ") || "비 예보 없이 바람이 약한 편입니다.";
  const interval = (point: ForecastPoint) => `${weatherClock(point.time)}~${weatherClock(Date.parse(point.time) + HOUR)}`;
  const rain = wet[0] ? `${interval(wet[0])} ${wet[0].condition} 예보` : complete ? "비 예보 없음" : "정보 부족";
  const wind = maxWind === null ? "정보 부족" : maxWind >= ROUNDING_LIMITS.windCautionKmh ? "강함" : maxWind >= ROUNDING_LIMITS.windModerateKmh ? "보통" : "약함";
  // Keep the first real interval for each known hazard; neither wind nor missing data erases it.
  const visibleHazards = hazards.filter((point, index) => hazards.findIndex(other => other.condition === point.condition) === index);
  const hazardWarning = visibleHazards.length ? `${visibleHazards.map(point => `${interval(point)} ${point.condition} 예보`).join(" · ")}에 유의해 주세요.` : "";
  const unavailable = !complete ? stale ? "자료 발표 시각이 오래되었거나 확인되지 않습니다." : weather.previousForecast ? "이전 예측 자료입니다. 약 2시간 전체를 판단할 자료가 부족합니다." : "약 2시간 전체를 판단할 시간별 자료가 부족합니다." : "";
  const change = !complete ? [hazardWarning, unavailable].filter(Boolean).join(" ") : hazardWarning || (points.length > 1 && points.at(-1)!.windSpeedKmh! - points[0].windSpeedKmh! >= 7.2 ? "후반에 바람이 강해질 전망입니다." : wet[0] && Date.parse(wet[0].time)>now ? `${periodLabel(wet[0])} 강수에 대비해 주세요.` : reason);
  return { complete, stale, rain: stale ? "정보 부족" : rain, wind: stale ? "정보 부족" : wind, maxWind, condition: !complete ? "판단 정보 부족" : caution ? "주의" : moderate ? "보통" : "좋음", reason, change, start: now, end };
}
export function daySummary(points: ForecastPoint[]) {
  if (!points.length) return "선택한 날짜의 예보 자료가 없습니다.";
  const wet = points.filter(p => (p.precipitationMm ?? 0)>0 || /rain|snow|sleet|thunder/.test(p.symbol));
  const hazard = points.find(p => /thunder|snow|sleet/.test(p.symbol));
  const winds = points.flatMap(p => p.windSpeedKmh === null ? [] : [p.windSpeedKmh]);
  return [hazard ? `${hazard.condition} 예보에 유의해 주세요.` : wet.length ? `${periodLabel(wet[0])} 강수 예보가 있습니다.` : points.some(p=>p.precipitationMm===null) ? "일부 시간의 강수 자료가 없습니다." : "제공된 시간대에는 비 예보가 없습니다.", winds.length ? `제공 시간대 바람 최대 ${Math.round(Math.max(...winds))}km/h.` : "바람 정보 부족."].join(" ");
}
