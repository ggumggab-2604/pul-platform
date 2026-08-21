import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import {
  HOME_WEATHER_LOCATION_LABEL,
  type HomeWeather,
} from "@/lib/weather/weather";
import { cn } from "@/lib/utils";

type WeatherCardProps = {
  weather: HomeWeather | null;
  loadFailed: boolean;
  compact?: boolean;
  /** PC 포털용 압축 레이아웃 (모바일 compact와 분리) */
  portal?: boolean;
  /** 모바일 메인 — 얇은 가로 스트립 (PC 미사용) */
  bar?: boolean;
};

function temperature(value: number) {
  return Math.round(value);
}

function WeatherIcon({ weather, className }: { weather: HomeWeather; className: string }) {
  return <Icon name={weather.icon} className={className} />;
}

function WeatherMetrics({ weather, compact = false }: { weather: HomeWeather; compact?: boolean }) {
  return (
    <div className={cn("flex flex-wrap gap-x-3 gap-y-1 text-pul-muted", compact ? "text-xs" : "text-sm")}>
      {weather.precipitationProbability !== null ? (
        <span>강수 {Math.round(weather.precipitationProbability)}%</span>
      ) : null}
      {weather.windSpeedKmh !== null ? (
        <span>바람 {Math.round(weather.windSpeedKmh)}km/h</span>
      ) : null}
    </div>
  );
}

function WeatherAttribution({ weather, compact = false }: { weather: HomeWeather; compact?: boolean }) {
  return (
    <a
      href={weather.sourceUrl}
      target="_blank"
      rel="noreferrer"
      className={cn("font-medium text-pul-muted underline-offset-2 hover:underline", compact ? "text-[11px]" : "text-xs")}
    >
      {weather.sourceLabel}
    </a>
  );
}

function UnavailableWeather({ bar = false }: { bar?: boolean }) {
  if (bar) {
    return (
      <section
        aria-label="날씨"
        aria-live="polite"
        className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-pul-border bg-white px-3 py-2 shadow-[0_2px_10px_rgba(6,78,59,0.06)] sm:min-h-14"
      >
        <span className="text-sm font-bold text-pul-deep">{HOME_WEATHER_LOCATION_LABEL}</span>
        <span className="text-sm text-pul-muted">날씨 확인 불가</span>
      </section>
    );
  }

  return (
    <Card dense title={HOME_WEATHER_LOCATION_LABEL} bodyClassName="p-3">
      <p aria-live="polite" className="text-sm text-pul-muted">날씨 정보를 불러오지 못했습니다.</p>
    </Card>
  );
}

export function WeatherCard({
  weather,
  loadFailed,
  compact = false,
  portal = false,
  bar = false,
}: WeatherCardProps) {
  if (loadFailed || weather === null) {
    return <UnavailableWeather bar={bar} />;
  }
  if (portal) return <PortalWeatherCard weather={weather} />;
  if (bar) return <BarWeatherCard weather={weather} />;
  if (compact) return <CompactWeatherCard weather={weather} />;
  return <DefaultWeatherCard weather={weather} />;
}

function DefaultWeatherCard({ weather }: { weather: HomeWeather }) {
  return (
    <Card dense={false} title="날씨">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-pul-muted lg:text-base">{weather.locationLabel}</p>
          <div className="mt-1.5 flex items-end gap-1.5">
            <span className="text-4xl font-bold leading-none text-pul-deep lg:text-[2.75rem]">{temperature(weather.temperatureC)}</span>
            <span className="mb-0.5 text-xl font-light text-pul-deep">℃</span>
            <span className="mb-1 text-sm text-pul-muted lg:text-base">{weather.condition}</span>
          </div>
          <div className="mt-2"><WeatherMetrics weather={weather} /></div>
          <div className="mt-2"><WeatherAttribution weather={weather} /></div>
        </div>
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-pul-light">
          <WeatherIcon weather={weather} className="h-10 w-10 text-pul-point" />
        </div>
      </div>
    </Card>
  );
}

function BarWeatherCard({ weather }: { weather: HomeWeather }) {
  return (
    <section
      className={cn(
        "rounded-xl border border-pul-border bg-white",
        "shadow-[0_2px_10px_rgba(6,78,59,0.06)]",
        "flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 sm:min-h-14",
      )}
      aria-label="날씨"
    >
      <span className="min-w-0 shrink-0 truncate text-sm font-bold text-pul-deep">{weather.locationLabel}</span>
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="text-base font-bold tabular-nums text-pul-deep">{temperature(weather.temperatureC)}℃</span>
        <span className="text-sm font-semibold text-pul-deep">{weather.condition}</span>
        <WeatherIcon weather={weather} className="h-5 w-5 shrink-0 text-pul-point" />
      </div>
      <WeatherMetrics weather={weather} compact />
      <span className="ml-auto"><WeatherAttribution weather={weather} compact /></span>
    </section>
  );
}

function CompactWeatherCard({ weather }: { weather: HomeWeather }) {
  return (
    <Card dense className="h-auto shrink-0" title={weather.locationLabel} bodyClassName="space-y-1.5 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-end gap-2">
          <span className="text-3xl font-bold leading-none text-pul-deep">{temperature(weather.temperatureC)}<span className="text-lg font-light">℃</span></span>
          <span className="mb-0.5 text-base font-semibold text-pul-deep">{weather.condition}</span>
        </div>
        <WeatherIcon weather={weather} className="h-7 w-7 shrink-0 text-pul-point" />
      </div>
      <WeatherMetrics weather={weather} />
      <WeatherAttribution weather={weather} compact />
    </Card>
  );
}

function PortalWeatherCard({ weather }: { weather: HomeWeather }) {
  return (
    <Card
      dense
      className="h-auto shrink-0"
      title={weather.locationLabel}
      action={<WeatherAttribution weather={weather} compact />}
      bodyClassName="space-y-1.5 p-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-end gap-2">
          <span className="text-3xl font-bold leading-none text-pul-deep">{temperature(weather.temperatureC)}<span className="text-lg font-light">℃</span></span>
          <span className="mb-0.5 text-base font-semibold text-pul-deep">{weather.condition}</span>
        </div>
        <WeatherIcon weather={weather} className="h-7 w-7 shrink-0 text-pul-point" />
      </div>
      <WeatherMetrics weather={weather} />
      <p className="text-[11px] text-pul-muted">30분 간격 갱신</p>
    </Card>
  );
}
