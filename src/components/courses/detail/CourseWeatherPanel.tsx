import {
  coursePlayStatusStyles,
  type CourseWeather,
} from "@/data/courseMapData";
import type { CourseDetailPageData } from "@/data/courseDetailPageData";
import { CourseWeatherIcon, PlayStatusIcon } from "@/components/courses/CourseWeatherIcon";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

type CourseWeatherPanelProps = {
  weather: CourseWeather;
  detail: CourseDetailPageData;
};

export function CourseWeatherPanel({ weather, detail }: CourseWeatherPanelProps) {
  const { today, tomorrow } = weather;
  const tomorrowHigh = tomorrow.high.replace(/℃/g, "");
  const tomorrowLow = tomorrow.low.replace(/℃/g, "");

  return (
    <Card title="날씨 · 라운드 판단" dense>
      <div className="space-y-4">
        <div className="rounded-lg border border-sky-200/60 bg-sky-50/50 p-3 lg:p-4">
          <p className="text-xs font-bold text-pul-point lg:text-sm">현재</p>
          <p className="mt-1 text-xl font-bold text-foreground lg:text-2xl">
            {today.temperature} · {today.condition} · 강수 {today.rainChance}
          </p>
          <p className="mt-0.5 text-sm text-pul-muted">바람 {today.wind}</p>
        </div>

        <div>
          <p className="text-sm font-bold text-pul-deep lg:text-base">오늘 시간대별</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {detail.remainingTodayForecast.map((slot) => (
              <span
                key={slot.time}
                className="rounded-lg border border-pul-border/80 bg-white px-2.5 py-2 text-sm font-semibold text-pul-deep"
              >
                {slot.time} {slot.temperature}{" "}
                <span className="text-sky-700">비 {slot.rainChance}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-pul-border/80 bg-pul-light/40 p-3">
          <p className="text-sm font-bold text-pul-deep lg:text-base">내일</p>
          <p className="mt-1 text-lg font-bold text-foreground">
            {tomorrowLow}~{tomorrowHigh}℃ · {tomorrow.condition}
          </p>
          <p className="text-sm text-pul-muted">오후 강수 {tomorrow.rainChance}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {detail.tomorrowHourlyForecast.map((slot) => (
              <span key={`tm-${slot.time}`} className="text-xs font-semibold text-pul-muted lg:text-sm">
                {slot.time} 비 {slot.rainChance}
              </span>
            ))}
          </div>
          <span
            className={cn(
              "mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ring-1",
              coursePlayStatusStyles[tomorrow.playStatus],
            )}
          >
            <PlayStatusIcon status={tomorrow.playStatus} />
            내일 {tomorrow.playStatus}
          </span>
        </div>

        <div>
          <p className="text-sm font-bold text-pul-deep lg:text-base">이용 판단 참고</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {detail.roundJudgmentTips.map((tip) => (
              <li
                key={tip}
                className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200/70"
              >
                {tip}
              </li>
            ))}
          </ul>
          {detail.weatherWarnings.map((w) => (
            <p
              key={w.id}
              className="mt-2 flex items-start gap-2 text-sm font-medium text-amber-900 lg:text-base"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {w.message}
            </p>
          ))}
        </div>

        <p className="rounded-lg border border-pul-border/80 bg-pul-light/50 px-3 py-2.5 text-sm text-pul-muted lg:text-base">
          {detail.weatherDisclaimer}
        </p>
      </div>
    </Card>
  );
}
