import {
  coursePlayStatusStyles,
  type CourseWeather,
} from "@/data/courseMapData";
import type { CourseDetailPageData } from "@/data/courseDetailPageData";
import { CourseWeatherIcon, PlayStatusIcon } from "@/components/courses/CourseWeatherIcon";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { AlertTriangle, CloudRain, Users } from "lucide-react";

type CourseWeatherDetailPanelProps = {
  weather: CourseWeather;
  detail: CourseDetailPageData;
  compact?: boolean;
};

const warningStyles = {
  rain: "bg-sky-50 text-sky-900 ring-sky-200/70",
  wind: "bg-indigo-50 text-indigo-900 ring-indigo-200/70",
  heat: "bg-orange-50 text-orange-900 ring-orange-200/70",
  cold: "bg-blue-50 text-blue-900 ring-blue-200/70",
};

export function CourseWeatherDetailPanel({
  weather,
  detail,
  compact = false,
}: CourseWeatherDetailPanelProps) {
  const { today, tomorrow } = weather;

  return (
    <Card title="날씨 · 라운딩 판단" dense>
      <div className={cn("space-y-4", compact && "space-y-3")}>
        <div className="rounded-lg border border-sky-200/60 bg-gradient-to-r from-sky-50/80 to-emerald-50/50 p-3 lg:p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-pul-point lg:text-sm">현재 날씨</p>
              <div className="mt-1 flex items-center gap-2">
                <CourseWeatherIcon iconKey={today.icon} size="md" />
                <p className="text-xl font-bold text-foreground lg:text-2xl">
                  {today.temperature}{" "}
                  <span className="text-base font-semibold lg:text-lg">{today.condition}</span>
                </p>
              </div>
              <p className="mt-1 text-sm font-semibold text-pul-deep lg:text-base">
                강수 확률 {today.rainChance} · 바람 {today.wind}
              </p>
            </div>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ring-1 lg:text-sm",
                coursePlayStatusStyles[today.playStatus],
              )}
            >
              <PlayStatusIcon status={today.playStatus} />
              오늘 {today.playStatus}
            </span>
          </div>
        </div>

        {detail.weatherWarnings.length > 0 ? (
          <ul className="space-y-2">
            {detail.weatherWarnings.map((warning) => (
              <li
                key={warning.id}
                className={cn(
                  "flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm font-medium ring-1 lg:text-base",
                  warningStyles[warning.type],
                )}
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {warning.message}
              </li>
            ))}
          </ul>
        ) : null}

        {!compact ? (
          <>
            <div>
              <h3 className="text-sm font-bold text-pul-deep lg:text-base">오늘 시간대별 예보</h3>
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {detail.hourlyForecast.map((slot) => (
                  <div
                    key={slot.time}
                    className="flex min-w-[4.5rem] shrink-0 flex-col items-center rounded-lg border border-sky-200/50 bg-white px-2 py-2 text-center"
                  >
                    <span className="text-xs font-bold text-pul-muted">{slot.time}</span>
                    <CourseWeatherIcon iconKey={slot.icon} size="sm" className="my-1" />
                    <span className="text-sm font-bold text-foreground">{slot.temperature}</span>
                    <span className="text-[11px] font-semibold text-sky-700">비 {slot.rainChance}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold text-pul-deep lg:text-base">오늘 남은 시간</h3>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {detail.remainingTodayForecast.map((slot) => (
                  <div
                    key={`remain-${slot.time}`}
                    className="rounded-lg border border-pul-border/80 bg-pul-light/40 px-2.5 py-2 text-center"
                  >
                    <p className="text-xs font-bold text-pul-muted">{slot.time}</p>
                    <p className="text-sm font-bold text-foreground">{slot.condition}</p>
                    <p className="text-xs font-semibold text-sky-700">강수 {slot.rainChance}</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-sky-200/50 bg-white p-3">
            <p className="text-xs font-bold text-pul-point lg:text-sm">내일 예보</p>
            <div className="mt-1 flex items-center gap-2">
              <CourseWeatherIcon iconKey={tomorrow.icon} size="sm" />
              <p className="text-base font-bold text-foreground lg:text-lg">
                {tomorrow.low} / {tomorrow.high} {tomorrow.condition}
              </p>
            </div>
            <p className="mt-1 text-sm text-pul-muted">
              강수 {tomorrow.rainChance} · 바람 {tomorrow.wind}
            </p>
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
          <div className="rounded-lg border border-emerald-200/60 bg-emerald-50/50 p-3">
            <p className="flex items-center gap-1 text-xs font-bold text-pul-deep lg:text-sm">
              <Users className="h-4 w-4 text-pul-point" aria-hidden="true" />
              동호회 운영진 참고
            </p>
            <p className="mt-1 text-sm leading-relaxed text-pul-muted lg:text-base">
              {detail.clubLeaderWeatherTip}
            </p>
          </div>
        </div>

        <p className="flex items-start gap-2 rounded-lg border border-sky-200/60 bg-sky-50/60 px-3 py-2.5 text-sm text-sky-900 lg:text-base">
          <CloudRain className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {detail.rainOperationNote}
        </p>
      </div>
    </Card>
  );
}
