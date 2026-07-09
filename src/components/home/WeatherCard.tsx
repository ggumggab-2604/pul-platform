import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { weatherData } from "@/data/homeData";

type WeatherCardProps = {
  compact?: boolean;
};

export function WeatherCard({ compact = false }: WeatherCardProps) {
  return (
    <Card dense={compact} title="날씨">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-pul-muted lg:text-base">
            {weatherData.location}
          </p>
          <div className="mt-1.5 flex items-end gap-1.5">
            <span
              className={
                compact
                  ? "text-3xl font-bold leading-none text-pul-deep"
                  : "text-4xl font-bold leading-none text-pul-deep lg:text-[2.75rem]"
              }
            >
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
        <div
          className={
            compact
              ? "flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-50"
              : "flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-amber-50"
          }
        >
          <Icon
            name="sun"
            className={compact ? "h-8 w-8 text-amber-400" : "h-10 w-10 text-amber-400"}
          />
        </div>
      </div>
      <div
        className={
          compact
            ? "mt-3 grid grid-cols-3 gap-2 border-t border-pul-border/80 pt-3"
            : "mt-5 grid grid-cols-3 gap-2.5 border-t border-pul-border/80 pt-4"
        }
      >
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
