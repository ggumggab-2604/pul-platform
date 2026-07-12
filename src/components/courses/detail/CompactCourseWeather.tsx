"use client";

import type { CourseDetailPageData } from "@/data/courseDetailPageData";
import type { CourseWeather } from "@/data/courseMapData";
import { CourseWeatherIcon } from "@/components/courses/CourseWeatherIcon";
import { getUpcomingTwoHourForecast } from "@/components/courses/detail/courseWeatherForecast";
import { Card } from "@/components/ui/Card";
import { useMemo } from "react";

type CompactCourseWeatherProps = {
  weather: CourseWeather;
  detail: CourseDetailPageData;
};

/**
 * 골프장 상세의 유일한 날씨 UI.
 * 사이드바·히어로·스티키에 날씨 카드를 추가하지 마세요.
 */
export function CompactCourseWeather({ weather, detail }: CompactCourseWeatherProps) {
  const { today, tomorrow } = weather;
  const tomorrowHigh = tomorrow.high.replace(/℃/g, "");
  const tomorrowLow = tomorrow.low.replace(/℃/g, "");
  const slots = useMemo(
    () => getUpcomingTwoHourForecast(detail.remainingTodayForecast, new Date(), 4).slice(0, 4),
    [detail.remainingTodayForecast],
  );

  return (
    <Card id="course-weather" title="날씨 · 라운드 판단" dense>
      <div className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-sky-200/60 bg-sky-50/50 px-3 py-2.5">
            <p className="text-[13px] font-bold text-pul-point lg:text-sm">현재 날씨</p>
            <p className="mt-0.5 text-base font-bold text-foreground lg:text-lg">
              {today.temperature} · {today.condition}
            </p>
            <p className="mt-0.5 text-[15px] text-pul-muted lg:text-base">
              강수 {today.rainChance} · 바람 {today.wind}
            </p>
          </div>
          <div className="rounded-lg border border-pul-border/80 bg-pul-light/40 px-3 py-2.5">
            <p className="text-[13px] font-bold text-pul-point lg:text-sm">내일</p>
            <p className="mt-0.5 text-base font-bold text-foreground lg:text-lg">
              {tomorrowLow}~{tomorrowHigh}℃ · {tomorrow.condition}
            </p>
            <p className="mt-0.5 text-[15px] text-pul-muted lg:text-base">
              강수 {tomorrow.rainChance} · 바람 {tomorrow.wind}
            </p>
            <p className="mt-0.5 text-[13px] text-pul-muted lg:text-sm">{detail.tomorrowRainSummary}</p>
          </div>
        </div>

        {slots.length > 0 ? (
          <div>
            <p className="text-[15px] font-bold text-pul-deep lg:text-base">오늘 시간대별 예보</p>
            <ul className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
              {slots.map((slot) => (
                <li
                  key={slot.time}
                  className="flex min-w-0 flex-col rounded-lg border border-pul-border/60 bg-white px-2.5 py-3"
                >
                  <div className="flex items-center gap-2">
                    <CourseWeatherIcon iconKey={slot.icon} size="sm" />
                    <span className="text-[15px] font-bold text-pul-deep lg:text-base">{slot.time}</span>
                  </div>
                  <p className="mt-2 text-[15px] font-semibold leading-snug text-foreground lg:text-base">
                    {slot.condition} · {slot.temperature}
                  </p>
                  <p className="mt-1 text-[13px] text-pul-muted lg:text-sm">
                    강수 {slot.rainChance}
                    {slot.wind ? ` · 바람 ${slot.wind}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="rounded-lg border border-amber-200/50 bg-amber-50/50 px-3 py-2.5 text-[15px] leading-relaxed text-amber-950 lg:text-base">
          <span className="font-bold text-amber-900">라운드 참고 · </span>
          {detail.weatherBriefNote}
        </p>

        <div className="flex flex-col gap-1 border-t border-pul-border/60 pt-2 text-[13px] text-pul-muted lg:flex-row lg:items-center lg:justify-between lg:text-sm">
          <p>
            출처 지역 · <span className="font-semibold text-pul-deep">{detail.weatherSourceRegion}</span>
          </p>
          <p>
            업데이트 · <span className="font-semibold text-pul-deep">{detail.weatherUpdatedAt}</span>
          </p>
        </div>
        <p className="text-[13px] text-pul-muted lg:text-sm">{detail.weatherDisclaimer}</p>
      </div>
    </Card>
  );
}
