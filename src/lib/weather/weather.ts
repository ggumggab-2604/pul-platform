export const HOME_WEATHER_LOCATION_LABEL = "기본 지역 · 서울";

const MET_FORECAST_URL = new URL(
  "https://api.met.no/weatherapi/locationforecast/2.0/compact",
);
MET_FORECAST_URL.search = new URLSearchParams({
  lat: "37.5665",
  lon: "126.9780",
}).toString();

const MET_USER_AGENT =
  "pul-platform/1.0 (+https://github.com/ggumggab-2604/pul-platform)";
const WEATHER_REVALIDATE_SECONDS = 30 * 60;
const WEATHER_TIMEOUT_MS = 6_000;

export type HomeWeatherIcon = "sun" | "cloud" | "rain" | "snow" | "fog";

export type ForecastPoint = {
  time: string;
  temperatureC: number | null;
  windSpeedKmh: number | null;
  symbol: string;
  condition: string;
  icon: HomeWeatherIcon;
  periodHours: number | null;
  precipitationMm: number | null;
};

export type HomeWeather = {
  forecast?: ForecastPoint[];
  calculatedAt?: number;
  locationLabel: string;
  temperatureC: number;
  condition: string;
  icon: HomeWeatherIcon;
  precipitationProbability: number | null;
  windSpeedKmh: number | null;
  observedAt: string;
  updatedAt?: string;
  previousForecast?: boolean;
  sourceLabel: string;
  sourceUrl: string;
};

export type HomeWeatherResult = {
  weather: HomeWeather | null;
  loadFailed: boolean;
};

type WeatherFetchInit = RequestInit & {
  next: { revalidate: number };
};

type WeatherFetcher = (
  input: string,
  init: WeatherFetchInit,
) => Promise<Response>;

type WeatherCondition = {
  label: string;
  icon: HomeWeatherIcon;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function weatherCondition(symbol: string): WeatherCondition {
  const code = symbol.replace(/_(day|night|polartwilight)$/, "");
  if (code.includes("thunder")) return { label: "뇌우", icon: "rain" };
  if (code === "clearsky") return { label: "맑음", icon: "sun" };
  if (code === "fair") return { label: "대체로 맑음", icon: "sun" };
  if (code === "partlycloudy") return { label: "구름 조금", icon: "cloud" };
  if (code === "cloudy") return { label: "흐림", icon: "cloud" };
  if (code === "fog") return { label: "안개", icon: "fog" };
  if (code.includes("sleet")) return { label: "진눈깨비", icon: "snow" };
  if (code.includes("snow")) return { label: "눈", icon: "snow" };
  if (code.includes("rain")) {
    return {
      label: code.includes("showers") ? "소나기" : "비",
      icon: "rain",
    };
  }
  return { label: "날씨 확인 중", icon: "cloud" };
}

function forecastSymbol(data: Record<string, unknown>) {
  for (const period of ["next_1_hours", "next_6_hours", "next_12_hours"]) {
    const forecast = data[period];
    if (!isRecord(forecast) || !isRecord(forecast.summary)) continue;
    if (typeof forecast.summary.symbol_code === "string") {
      return forecast.summary.symbol_code;
    }
  }
  return "unknown";
}

function normalizeForecast(timeseries: unknown[], units: Record<string, unknown>): ForecastPoint[] {
  const points = new Map<string, ForecastPoint>();
  for (const item of timeseries) {
    if (!isRecord(item) || typeof item.time !== "string" || !Number.isFinite(Date.parse(item.time)) || !isRecord(item.data)) continue;
    const data = item.data;
    const instant = isRecord(data.instant) && isRecord(data.instant.details) ? data.instant.details : {};
    const hours = [1, 6, 12].find(h => isRecord(data[`next_${h}_hours`])) ?? null;
    const period = hours ? data[`next_${hours}_hours`] : null;
    const details = isRecord(period) && isRecord(period.details) ? period.details : {};
    const symbol = forecastSymbol(data);
    const wind = finiteNumber(instant.wind_speed);
    const rain = finiteNumber(details.precipitation_amount);
    points.set(item.time, { time: item.time, temperatureC: finiteNumber(instant.air_temperature),
      windSpeedKmh: wind !== null && wind >= 0 && units.wind_speed === "m/s" ? wind * 3.6 : null,
      symbol, condition: weatherCondition(symbol).label, icon: weatherCondition(symbol).icon,
      periodHours: hours, precipitationMm: rain !== null && rain >= 0 && units.precipitation_amount === "mm" ? rain : null });
  }
  return [...points.values()].sort((a,b) => Date.parse(a.time) - Date.parse(b.time));
}

export function normalizeMetNorwayWeather(value: unknown, locationLabel = HOME_WEATHER_LOCATION_LABEL, now?: number): HomeWeather {
  if (!isRecord(value) || !isRecord(value.properties)) {
    throw new Error("날씨 응답 형식을 확인할 수 없습니다.");
  }

  const { meta, timeseries } = value.properties;
  if (!isRecord(meta) || !isRecord(meta.units) || !Array.isArray(timeseries)) {
    throw new Error("날씨 응답 단위를 확인할 수 없습니다.");
  }
  if (meta.units.air_temperature !== "celsius") {
    throw new Error("현재 기온 단위를 확인할 수 없습니다.");
  }

  const forecast = normalizeForecast(timeseries, meta.units);
  const selected = now === undefined ? undefined : [...forecast].reverse().find(p => Date.parse(p.time) <= now && p.temperatureC !== null);
  const current = selected ? timeseries.find(p => isRecord(p) && p.time === selected.time) : timeseries[0];
  if (!isRecord(current) || typeof current.time !== "string" || !isRecord(current.data)) {
    throw new Error("현재 날씨 응답 형식을 확인할 수 없습니다.");
  }
  const observedAt = current.time;
  if (!Number.isFinite(Date.parse(observedAt))) {
    throw new Error("현재 날씨 시각을 확인할 수 없습니다.");
  }
  if (!isRecord(current.data.instant) || !isRecord(current.data.instant.details)) {
    throw new Error("현재 날씨 상세 응답을 확인할 수 없습니다.");
  }

  const temperatureC = finiteNumber(current.data.instant.details.air_temperature);
  if (temperatureC === null) {
    throw new Error("현재 기온을 확인할 수 없습니다.");
  }
  const windSpeed = finiteNumber(current.data.instant.details.wind_speed);
  const condition = weatherCondition(forecastSymbol(current.data));

  return {
    locationLabel,
    forecast,
    ...(now !== undefined ? { calculatedAt: now } : {}),
    temperatureC,
    condition: condition.label,
    icon: condition.icon,
    precipitationProbability: null,
    windSpeedKmh:
      windSpeed !== null && meta.units.wind_speed === "m/s"
        ? windSpeed * 3.6
        : null,
    observedAt,
    ...(typeof meta.updated_at === "string" && Number.isFinite(Date.parse(meta.updated_at)) ? { updatedAt: meta.updated_at } : {}),
    sourceLabel: "출처: MET Norway",
    sourceUrl: "https://api.met.no/",
  };
}

async function loadMetWeather(url: string, locationLabel: string, fetcher: WeatherFetcher): Promise<HomeWeatherResult> {
  try {
    const response = await fetcher(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": MET_USER_AGENT,
      },
      next: { revalidate: WEATHER_REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { weather: null, loadFailed: true };
    }
    const weather = normalizeMetNorwayWeather(await response.json(), locationLabel, Date.now());
    return { weather: { ...weather, previousForecast: Date.now() - Date.parse(weather.observedAt) > 60 * 60 * 1000 }, loadFailed: false };
  } catch {
    return { weather: null, loadFailed: true };
  }
}

export type WeatherLocation = { latitude: number; longitude: number; locationLabel: string };
function validWeatherPoint(latitude: unknown, longitude: unknown): boolean {
  return typeof latitude === "number" && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
    typeof longitude === "number" && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}
// The record has one point. Entrance/parking directions do not establish a course reference point.
export function courseWeatherLocation(course: { latitude: number | null; longitude: number | null; destinationKind?: string | null }, locationLabel: string): WeatherLocation | null {
  if (!validWeatherPoint(course.latitude, course.longitude) || ![null, undefined, "facility", "building"].includes(course.destinationKind)) return null;
  return { latitude: course.latitude!, longitude: course.longitude!, locationLabel };
}
export async function loadLocationWeather(location: WeatherLocation, fetcher: WeatherFetcher = fetch): Promise<HomeWeatherResult> {
  if (!validWeatherPoint(location.latitude, location.longitude) || !location.locationLabel.trim()) return { weather: null, loadFailed: true };
  const url = new URL(MET_FORECAST_URL);
  // Stable precision bounds the existing Next fetch-cache keys; never mix positions by label.
  url.searchParams.set("lat", location.latitude.toFixed(4));
  url.searchParams.set("lon", location.longitude.toFixed(4));
  return loadMetWeather(url.toString(), location.locationLabel, fetcher);
}
export async function loadHomeWeather(fetcher: WeatherFetcher = fetch): Promise<HomeWeatherResult> {
  return loadMetWeather(MET_FORECAST_URL.toString(), HOME_WEATHER_LOCATION_LABEL, fetcher);
}

export async function weatherReferenceTime(): Promise<number> { return Date.now(); }
