import {
  coursePlayStatusStyles,
  type CourseTodayWeather,
  type CourseTomorrowWeather,
  type CourseWeather,
} from "@/data/courseMapData";
import { cn } from "@/lib/utils";
import { CourseWeatherIcon, PlayStatusIcon } from "@/components/courses/CourseWeatherIcon";

/**
 * TODO:
 * - 실제 날씨 API 연동
 * - 골프장 위도/경도 기준 오늘 시간대별 예보 조회
 * - 오늘 남은 시간 강수 예보 표시
 * - 내일 예보 표시
 * - 강수량/바람/폭염/한파 경고 표시
 * - 동호회 라운딩 공지용 날씨 알림
 * - 라운딩 적합도 자동 계산
 * - 회원 관심 골프장 기준 날씨 표시
 */

type CourseWeatherPanelProps = {
  weather: CourseWeather;
  variant?: "compact" | "detail";
};

function formatTomorrowRange(low: string, high: string) {
  const lowValue = low.replace(/℃/g, "");
  const highValue = high.replace(/℃/g, "");
  return `${lowValue}~${highValue}℃`;
}

export function CourseMapWeatherSummary({ weather }: { weather: CourseWeather }) {
  const { today, tomorrow } = weather;

  return (
    <div
      className="space-y-1 rounded-md border border-sky-200/50 bg-gradient-to-r from-sky-50/60 to-emerald-50/40 px-2 py-1.5"
      aria-label="골프장 날씨 요약"
    >
      <div className="flex items-center gap-1.5 text-[11px] leading-tight">
        <span className="w-7 shrink-0 font-bold text-pul-point">오늘</span>
        <span className="min-w-0 flex-1 text-foreground">
          {today.temperature} {today.condition} · 강수 {today.rainChance}
        </span>
        <span
          className={cn(
            "shrink-0 rounded-full px-1.5 py-0 text-[10px] font-bold",
            coursePlayStatusStyles[today.playStatus],
          )}
        >
          {today.playStatus}
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-[11px] leading-tight">
        <span className="w-7 shrink-0 font-bold text-pul-point">내일</span>
        <span className="min-w-0 flex-1 text-foreground">
          {formatTomorrowRange(tomorrow.low, tomorrow.high)} {tomorrow.condition} · 강수{" "}
          {tomorrow.rainChance}
        </span>
        <span
          className={cn(
            "shrink-0 rounded-full px-1.5 py-0 text-[10px] font-bold",
            coursePlayStatusStyles[tomorrow.playStatus],
          )}
        >
          {tomorrow.playStatus}
        </span>
      </div>
    </div>
  );
}

function PlayStatusBadge({ status }: { status: CourseTodayWeather["playStatus"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold max-lg:text-xs",
        coursePlayStatusStyles[status],
      )}
    >
      <PlayStatusIcon status={status} />
      {status}
    </span>
  );
}

function TodayWeatherCard({
  today,
  detail,
}: {
  today: CourseTodayWeather;
  detail?: boolean;
}) {
  return (
    <article
      className={cn(
        "rounded-lg border border-sky-200/50 bg-white/80",
        detail ? "p-2.5 lg:p-4" : "p-2.5",
      )}
    >
      <p
        className={cn(
          "font-bold text-pul-point",
          detail ? "text-xs max-lg:text-[11px] lg:text-sm" : "text-[11px]",
        )}
      >
        오늘
      </p>
      <div className="mt-1 flex items-center gap-1.5 max-lg:gap-1">
        <CourseWeatherIcon
          iconKey={today.icon}
          size={detail ? "md" : "sm"}
          className={detail ? "max-lg:h-5 max-lg:w-5" : undefined}
        />
        <p
          className={cn(
            "font-bold leading-snug text-foreground",
            detail ? "text-sm max-lg:text-xs lg:text-base" : "text-sm",
          )}
        >
          {today.temperature}{" "}
          <span className="font-semibold">{today.condition}</span>
        </p>
      </div>
      <dl
        className={cn(
          "mt-2 space-y-0.5 text-pul-muted",
          detail ? "text-xs max-lg:text-[11px] lg:text-sm" : "text-[11px]",
        )}
      >
        <div className="flex justify-between gap-2">
          <dt>강수 확률</dt>
          <dd className="font-semibold text-foreground">{today.rainChance}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>바람</dt>
          <dd className="font-semibold text-foreground">{today.wind}</dd>
        </div>
      </dl>
      <p
        className={cn(
          "mt-2 leading-snug text-pul-deep",
          detail
            ? "line-clamp-1 text-xs max-lg:text-[11px] lg:line-clamp-none lg:text-sm"
            : "text-[11px]",
        )}
      >
        {today.forecastNote}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1 max-lg:gap-1">
        <span
          className={cn(
            "font-medium text-pul-muted",
            detail ? "text-xs max-lg:text-[11px]" : "text-[10px]",
          )}
        >
          라운딩 적합도
        </span>
        <PlayStatusBadge status={today.playStatus} />
      </div>
    </article>
  );
}

function TomorrowWeatherCard({
  tomorrow,
  detail,
}: {
  tomorrow: CourseTomorrowWeather;
  detail?: boolean;
}) {
  return (
    <article
      className={cn(
        "rounded-lg border border-sky-200/50 bg-white/80",
        detail ? "p-2.5 lg:p-4" : "p-2.5",
      )}
    >
      <p
        className={cn(
          "font-bold text-pul-point",
          detail ? "text-xs max-lg:text-[11px] lg:text-sm" : "text-[11px]",
        )}
      >
        내일
      </p>
      <div className="mt-1 flex items-center gap-1.5 max-lg:gap-1">
        <CourseWeatherIcon
          iconKey={tomorrow.icon}
          size={detail ? "md" : "sm"}
          className={detail ? "max-lg:h-5 max-lg:w-5" : undefined}
        />
        <p
          className={cn(
            "font-bold leading-snug text-foreground",
            detail ? "text-sm max-lg:text-xs lg:text-base" : "text-sm",
          )}
        >
          {tomorrow.low} / {tomorrow.high}{" "}
          <span className="font-semibold">{tomorrow.condition}</span>
        </p>
      </div>
      <dl
        className={cn(
          "mt-2 space-y-0.5 text-pul-muted",
          detail ? "text-xs max-lg:text-[11px] lg:text-sm" : "text-[11px]",
        )}
      >
        <div className="flex justify-between gap-2">
          <dt>강수 확률</dt>
          <dd className="font-semibold text-foreground">{tomorrow.rainChance}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>바람</dt>
          <dd className="font-semibold text-foreground">{tomorrow.wind}</dd>
        </div>
      </dl>
      <p
        className={cn(
          "mt-2 leading-snug text-pul-deep",
          detail
            ? "line-clamp-1 text-xs max-lg:text-[11px] lg:line-clamp-none lg:text-sm"
            : "text-[11px]",
        )}
      >
        {tomorrow.forecastNote}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1 max-lg:gap-1">
        <span
          className={cn(
            "font-medium text-pul-muted",
            detail ? "text-xs max-lg:text-[11px]" : "text-[10px]",
          )}
        >
          라운딩 적합도
        </span>
        <PlayStatusBadge status={tomorrow.playStatus} />
      </div>
    </article>
  );
}

export function CourseWeatherPanel({
  weather,
  variant = "compact",
}: CourseWeatherPanelProps) {
  const detail = variant === "detail";

  return (
    <section
      className={cn(
        "rounded-lg border border-sky-200/60 bg-gradient-to-br from-sky-50/80 via-white to-emerald-50/40",
        detail ? "p-3 lg:p-4" : "p-2.5",
      )}
      aria-label="골프장 날씨"
    >
      <div className="mb-2 flex items-baseline justify-between gap-2 max-lg:mb-1.5">
        <h4
          className={cn(
            "font-bold text-pul-deep",
            detail ? "text-sm lg:text-base" : "text-xs",
          )}
        >
          골프장 날씨
        </h4>
        <p
          className={cn(
            "font-medium text-pul-muted",
            detail ? "text-[10px] lg:text-xs" : "text-[10px]",
          )}
        >
          오늘 / 내일
        </p>
      </div>
      <div
        className={cn(
          "grid gap-2",
          detail
            ? "grid-cols-2 max-lg:gap-2"
            : "grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-2",
        )}
      >
        <TodayWeatherCard today={weather.today} detail={detail} />
        <TomorrowWeatherCard tomorrow={weather.tomorrow} detail={detail} />
      </div>
    </section>
  );
}
