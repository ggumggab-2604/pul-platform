"use client";

import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { weatherData } from "@/data/homeData";
import { cn } from "@/lib/utils";
import Link from "next/link";

type WeatherCardProps = {
  compact?: boolean;
  /** PC 포털용 압축 레이아웃 (모바일 compact와 분리) */
  portal?: boolean;
  /** 모바일 메인 — 얇은 가로 스트립 (PC 미사용) */
  bar?: boolean;
};

export function WeatherCard({
  compact = false,
  portal = false,
  bar = false,
}: WeatherCardProps) {
  if (portal) {
    return <PortalWeatherCard />;
  }

  if (bar) {
    return <BarWeatherCard />;
  }

  if (compact) {
    return <CompactWeatherCard />;
  }

  return (
    <Card dense={false} title="날씨">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-pul-muted lg:text-base">
            {weatherData.location}
          </p>
          <div className="mt-1.5 flex items-end gap-1.5">
            <span className="text-4xl font-bold leading-none text-pul-deep lg:text-[2.75rem]">
              {weatherData.temperature}
            </span>
            <span className="mb-0.5 text-xl font-light text-pul-deep">℃</span>
            <span className="mb-1 text-sm text-pul-muted lg:text-base">
              {weatherData.condition}
            </span>
          </div>
          <p className="mt-1.5 inline-block rounded-full bg-pul-light px-2.5 py-0.5 text-xs font-medium text-pul-point sm:text-sm">
            {weatherData.fineDust}
          </p>
        </div>
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-amber-50">
          <Icon name="sun" className="h-10 w-10 text-amber-400" />
        </div>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2.5 border-t border-pul-border/80 pt-4">
        {weatherData.forecast.map((day) => (
          <div
            key={day.label}
            className="rounded-lg bg-pul-light/80 py-2 text-center"
          >
            <p className="text-xs text-pul-muted sm:text-sm">{day.label}</p>
            <p className="text-lg font-bold text-pul-deep">{day.temp}°</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** 모바일 메인 — 전체 폭 얇은 가로 바 (~48–56px) */
function BarWeatherCard() {
  const detailHref = weatherData.detailHref ?? "/courses";
  const rainLabel = weatherData.rainChance
    ? weatherData.rainChance.replace("강수확률", "강수").trim()
    : null;

  return (
    <section
      className={cn(
        "rounded-xl border border-pul-border bg-white",
        "shadow-[0_2px_10px_rgba(6,78,59,0.06)]",
        "flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2",
        "min-h-12 sm:min-h-14",
      )}
      aria-label="날씨"
    >
      <Link
        href="/courses"
        className="inline-flex min-w-0 shrink-0 items-center gap-1 text-sm font-bold text-pul-deep hover:text-pul-point"
        title="지역 변경"
      >
        <span className="truncate">{weatherData.location}</span>
      </Link>

      <div className="flex min-w-0 items-center gap-1.5">
        <span className="text-base font-bold tabular-nums text-pul-deep">
          {weatherData.temperature}℃
        </span>
        <span className="text-sm font-semibold text-pul-deep">
          {weatherData.condition}
        </span>
        <Icon name="sun" className="h-5 w-5 shrink-0 text-amber-400" aria-hidden="true" />
      </div>

      {rainLabel ? (
        <span className="shrink-0 text-sm font-medium text-pul-muted">
          {rainLabel}
        </span>
      ) : null}

      <Link
        href={detailHref}
        className="ml-auto inline-flex shrink-0 items-center gap-0.5 text-sm font-bold text-pul-point hover:underline"
      >
        자세히 보기
        <span aria-hidden="true">›</span>
      </Link>
    </section>
  );
}

/** 모바일 — PC 포털과 동일 요약 필드만 (3일 예보 제외) */
function CompactWeatherCard() {
  const detailHref = weatherData.detailHref ?? "/courses";

  return (
    <Card
      dense
      className="h-auto shrink-0"
      title={weatherData.location}
      bodyClassName="space-y-1.5 p-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-end gap-2">
          <span className="text-3xl font-bold leading-none text-pul-deep">
            {weatherData.temperature}
            <span className="text-lg font-light">℃</span>
          </span>
          <span className="mb-0.5 text-base font-semibold text-pul-deep">
            {weatherData.condition}
          </span>
        </div>
        <Icon name="sun" className="h-7 w-7 shrink-0 text-amber-400" aria-hidden="true" />
      </div>

      {weatherData.rainChance ? (
        <p className="text-sm font-medium text-pul-muted">{weatherData.rainChance}</p>
      ) : null}

      <Link
        href={detailHref}
        className={cn(
          "inline-flex min-h-8 w-full items-center justify-center",
          "text-sm font-bold text-pul-point hover:underline",
        )}
      >
        자세히 보기 →
      </Link>
    </Card>
  );
}

/** PC 포털 — 라운드 판단용 최소 정보만 */
function PortalWeatherCard() {
  const detailHref = weatherData.detailHref ?? "/courses";

  return (
    <Card
      dense
      className="h-auto shrink-0"
      title={weatherData.location}
      action={
        <Link
          href="/courses"
          className="text-sm font-semibold text-pul-point hover:underline"
        >
          지역 변경
        </Link>
      }
      bodyClassName="space-y-1.5 p-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-end gap-2">
          <span className="text-3xl font-bold leading-none text-pul-deep">
            {weatherData.temperature}
            <span className="text-lg font-light">℃</span>
          </span>
          <span className="mb-0.5 text-base font-semibold text-pul-deep">
            {weatherData.condition}
          </span>
        </div>
        <Icon name="sun" className="h-7 w-7 shrink-0 text-amber-400" aria-hidden="true" />
      </div>

      {weatherData.rainChance ? (
        <p className="text-sm font-medium text-pul-muted">{weatherData.rainChance}</p>
      ) : null}

      <Link
        href={detailHref}
        className={cn(
          "inline-flex min-h-8 w-full items-center justify-center",
          "text-sm font-bold text-pul-point hover:underline",
        )}
      >
        자세히 보기 →
      </Link>
    </Card>
  );
}
