import type { HourlyForecastItem } from "@/data/courseDetailPageData";

export function parseForecastHour(time: string): number {
  const match = time.match(/(\d{1,2})/);
  return match ? Number(match[1]) : Number.NaN;
}

function pickTwoHourIntervalSlots(
  slots: HourlyForecastItem[],
  maxCount: number,
): HourlyForecastItem[] {
  const sorted = [...slots].sort(
    (a, b) => parseForecastHour(a.time) - parseForecastHour(b.time),
  );

  const picked: HourlyForecastItem[] = [];
  let lastHour = Number.NEGATIVE_INFINITY;

  for (const slot of sorted) {
    const hour = parseForecastHour(slot.time);
    if (Number.isNaN(hour)) continue;
    if (picked.length === 0 || hour >= lastHour + 2) {
      picked.push(slot);
      lastHour = hour;
      if (picked.length >= maxCount) break;
    }
  }

  return picked;
}

/** 현재 시각 이후 예보 중 2시간 간격으로 최대 maxCount개 (데이터에 있는 시간만 사용) */
export function getUpcomingTwoHourForecast(
  slots: HourlyForecastItem[],
  referenceDate: Date = new Date(),
  maxCount = 4,
): HourlyForecastItem[] {
  const currentHour = referenceDate.getHours();
  const upcoming = slots.filter((slot) => {
    const hour = parseForecastHour(slot.time);
    return !Number.isNaN(hour) && hour > currentHour;
  });

  return pickTwoHourIntervalSlots(upcoming, maxCount).slice(0, maxCount);
}
