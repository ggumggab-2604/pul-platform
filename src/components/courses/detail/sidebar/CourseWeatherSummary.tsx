import type { CourseWeather } from "@/data/courseMapData";
import type { CourseDetailPageData } from "@/data/courseDetailPageData";
import Link from "next/link";

type CourseWeatherSummaryProps = {
  weather: CourseWeather;
  detail: CourseDetailPageData;
};

/**
 * @deprecated 골프장 상세에서는 사용하지 마세요.
 * 날씨는 CompactCourseWeather 한 곳만 렌더합니다.
 */
export function CourseWeatherSummary({ weather, detail }: CourseWeatherSummaryProps) {
  const tomorrowHigh = weather.tomorrow.high.replace(/℃/g, "");
  const tomorrowLow = weather.tomorrow.low.replace(/℃/g, "");

  return (
    <div className="rounded-lg border border-sky-200/50 bg-sky-50/50 px-3 py-3">
      <p className="text-sm font-bold text-pul-point lg:text-base">날씨 요약</p>
      <p className="mt-1 text-base font-bold text-foreground lg:text-lg">
        {weather.today.temperature} · 강수 {weather.today.rainChance}
      </p>
      <p className="text-sm text-pul-muted lg:text-base">
        내일 {tomorrowLow}~{tomorrowHigh}℃ · {detail.tomorrowRainSummary}
      </p>
      <Link
        href="#course-weather"
        className="mt-2 inline-flex min-h-11 items-center text-sm font-bold text-pul-point hover:text-pul-deep lg:text-base"
      >
        자세한 예보 보기 ↓
      </Link>
    </div>
  );
}
