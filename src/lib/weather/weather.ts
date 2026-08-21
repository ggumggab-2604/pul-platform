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

export type HomeWeather = {
  locationLabel: string;
  temperatureC: number;
  condition: string;
  icon: HomeWeatherIcon;
  precipitationProbability: number | null;
  windSpeedKmh: number | null;
  observedAt: string;
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

function weatherCondition(symbol: string): WeatherCondition {
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

export function normalizeMetNorwayWeather(value: unknown): HomeWeather {
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

  const current = timeseries[0];
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
    locationLabel: HOME_WEATHER_LOCATION_LABEL,
    temperatureC,
    condition: condition.label,
    icon: condition.icon,
    precipitationProbability: null,
    windSpeedKmh:
      windSpeed !== null && meta.units.wind_speed === "m/s"
        ? windSpeed * 3.6
        : null,
    observedAt,
    sourceLabel: "MET Norway 제공 · PUL 표시 가공",
    sourceUrl: "https://api.met.no/",
  };
}

export async function loadHomeWeather(
  fetcher: WeatherFetcher = fetch,
): Promise<HomeWeatherResult> {
  try {
    const response = await fetcher(MET_FORECAST_URL.toString(), {
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
    const weather = normalizeMetNorwayWeather(await response.json());
    return { weather, loadFailed: false };
  } catch {
    return { weather: null, loadFailed: true };
  }
}
