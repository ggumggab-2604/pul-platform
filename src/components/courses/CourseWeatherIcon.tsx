import {
  AlertTriangle,
  CheckCircle,
  Cloud,
  CloudRain,
  CloudSun,
  Flame,
  Snowflake,
  Sun,
  Wind,
  XCircle,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CoursePlayStatus, WeatherIconKey } from "@/data/courseMapData";

const weatherIconConfig: Record<
  WeatherIconKey,
  { Icon: LucideIcon; className: string }
> = {
  sunny: { Icon: Sun, className: "text-amber-500" },
  "partly-cloudy": { Icon: CloudSun, className: "text-amber-400" },
  cloudy: { Icon: Cloud, className: "text-slate-400" },
  rain: { Icon: CloudRain, className: "text-sky-500" },
  storm: { Icon: Zap, className: "text-violet-500" },
  wind: { Icon: Wind, className: "text-cyan-500" },
  heat: { Icon: Flame, className: "text-orange-500" },
  cold: { Icon: Snowflake, className: "text-blue-400" },
};

const playStatusIconConfig: Record<
  CoursePlayStatus,
  { Icon: LucideIcon; className: string }
> = {
  좋음: { Icon: CheckCircle, className: "text-emerald-600" },
  주의: { Icon: AlertTriangle, className: "text-amber-600" },
  비추천: { Icon: XCircle, className: "text-gray-500" },
};

type CourseWeatherIconProps = {
  iconKey: WeatherIconKey;
  size?: "sm" | "md";
  className?: string;
};

export function CourseWeatherIcon({
  iconKey,
  size = "sm",
  className,
}: CourseWeatherIconProps) {
  const { Icon, className: colorClass } = weatherIconConfig[iconKey];
  const sizeClass = size === "sm" ? "h-4 w-4" : "h-5 w-5";

  return (
    <Icon
      className={cn(sizeClass, "shrink-0", colorClass, className)}
      aria-hidden="true"
    />
  );
}

type PlayStatusIconProps = {
  status: CoursePlayStatus;
  className?: string;
};

export function PlayStatusIcon({ status, className }: PlayStatusIconProps) {
  const { Icon, className: colorClass } = playStatusIconConfig[status];

  return (
    <Icon
      className={cn("h-3.5 w-3.5 shrink-0", colorClass, className)}
      aria-hidden="true"
    />
  );
}
