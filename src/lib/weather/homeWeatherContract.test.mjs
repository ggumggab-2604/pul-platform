import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("desktop and mobile share one server weather result through props", async () => {
  const [page, card] = await Promise.all([
    source("app/page.tsx"),
    source("components/home/WeatherCard.tsx"),
  ]);
  assert.match(page, /loadHomeWeather\(\)/);
  assert.match(page, /Promise\.all/);
  assert.equal((page.match(/weather=\{homeWeather\.weather\}/g) ?? []).length, 2);
  assert.equal((page.match(/loadFailed=\{homeWeather\.loadFailed\}/g) ?? []).length, 2);
  assert.match(card, /weather: HomeWeather \| null/);
  assert.doesNotMatch(card, /@\/data\/homeData|weatherData/);
});

test("provider access is fixed, identified, cached, bounded, and failure-safe", async () => {
  const weather = await source("lib/weather/weather.ts");
  assert.match(weather, /https:\/\/api\.met\.no\/weatherapi\/locationforecast\/2\.0\/compact/);
  assert.match(weather, /lat: "37\.5665"/);
  assert.match(weather, /lon: "126\.9780"/);
  assert.match(weather, /"User-Agent": MET_USER_AGENT/);
  assert.match(weather, /WEATHER_REVALIDATE_SECONDS = 30 \* 60/);
  assert.match(weather, /WEATHER_TIMEOUT_MS = 6_000/);
  assert.match(weather, /AbortSignal\.timeout/);
  assert.match(weather, /catch \{/);
  assert.match(weather, /weather: null, loadFailed: true/);
  assert.doesNotMatch(weather, /process\.env|NEXT_PUBLIC_|apikey|user.*url/i);
});

test("runtime mock weather and unsupported air-quality copy are removed", async () => {
  const [data, card, types] = await Promise.all([
    source("data/homeData.ts"),
    source("components/home/WeatherCard.tsx"),
    source("types/index.ts"),
  ]);
  const runtime = data + card + types;
  assert.doesNotMatch(runtime, /weatherData|WeatherData/);
  assert.doesNotMatch(runtime, /서울 마포구|관심 지역 · 예시|미세먼지 좋음|강수확률 10%/);
  assert.doesNotMatch(card, /24(?:℃|°)|맑음.*fallback|fineDust/);
  assert.match(card, /날씨 정보를 불러오지 못했습니다/);
  assert.match(card, /날씨 확인 불가/);
});

test("the default region, sourced wind, and attribution are rendered honestly", async () => {
  const [weather, card] = await Promise.all([
    source("lib/weather/weather.ts"),
    source("components/home/WeatherCard.tsx"),
  ]);
  assert.match(weather, /기본 지역 · 서울/);
  assert.match(weather, /precipitationProbability: null/);
  assert.match(card, /precipitationProbability !== null/);
  assert.match(card, /windSpeedKmh !== null/);
  assert.match(card, /sourceUrl/);
  assert.match(card, /sourceLabel/);
  assert.match(card, /rel="noreferrer"/);
  assert.doesNotMatch(card, /지역 변경|자세히 보기/);
});
