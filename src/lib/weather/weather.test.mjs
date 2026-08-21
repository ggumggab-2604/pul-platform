import assert from "node:assert/strict";
import test from "node:test";

const {
  HOME_WEATHER_LOCATION_LABEL,
  loadHomeWeather,
  normalizeMetNorwayWeather,
} = await import("./weather.ts");

function providerFixture() {
  return {
    type: "Feature",
    properties: {
      meta: {
        updated_at: "2026-08-21T03:00:00Z",
        units: {
          air_temperature: "celsius",
          wind_speed: "m/s",
        },
      },
      timeseries: [
        {
          time: "2026-08-21T03:00:00Z",
          data: {
            instant: {
              details: {
                air_temperature: 28.4,
                wind_speed: 3.5,
              },
            },
            next_1_hours: {
              summary: { symbol_code: "clearsky_day" },
              details: { precipitation_amount: 0 },
            },
          },
        },
      ],
    },
  };
}

test("normalizes current Seoul weather without inventing probability data", () => {
  const weather = normalizeMetNorwayWeather(providerFixture());
  assert.equal(weather.locationLabel, HOME_WEATHER_LOCATION_LABEL);
  assert.equal(weather.temperatureC, 28.4);
  assert.equal(weather.condition, "맑음");
  assert.equal(weather.icon, "sun");
  assert.equal(weather.precipitationProbability, null);
  assert.equal(weather.windSpeedKmh, 12.6);
  assert.equal(weather.observedAt, "2026-08-21T03:00:00Z");
  assert.equal(weather.sourceLabel, "MET Norway 제공 · PUL 표시 가공");
  assert.equal(weather.sourceUrl, "https://api.met.no/");
});

test("maps representative MET Norway symbols to readable Korean labels", () => {
  const expected = [
    ["fair_night", "대체로 맑음", "sun"],
    ["fog", "안개", "fog"],
    ["heavysnow", "눈", "snow"],
    ["rainshowers_day", "소나기", "rain"],
    ["heavyrainandthunder", "뇌우", "rain"],
    ["unknown_symbol", "날씨 확인 중", "cloud"],
  ];
  for (const [symbol, label, icon] of expected) {
    const fixture = providerFixture();
    fixture.properties.timeseries[0].data.next_1_hours.summary.symbol_code = symbol;
    const weather = normalizeMetNorwayWeather(fixture);
    assert.equal(weather.condition, label);
    assert.equal(weather.icon, icon);
  }
});

test("keeps optional wind and condition honest when source fields are absent", () => {
  const fixture = providerFixture();
  fixture.properties.meta.units.wind_speed = "knots";
  fixture.properties.timeseries[0].data.instant.details.wind_speed = null;
  delete fixture.properties.timeseries[0].data.next_1_hours;
  const weather = normalizeMetNorwayWeather(fixture);
  assert.equal(weather.windSpeedKmh, null);
  assert.equal(weather.condition, "날씨 확인 중");
  assert.equal(weather.icon, "cloud");
});

test("rejects malformed critical provider responses", () => {
  assert.throws(() => normalizeMetNorwayWeather(null));
  assert.throws(() => normalizeMetNorwayWeather({ properties: {} }));
  const fixture = providerFixture();
  fixture.properties.meta.units.air_temperature = "fahrenheit";
  assert.throws(() => normalizeMetNorwayWeather(fixture));
  fixture.properties.meta.units.air_temperature = "celsius";
  fixture.properties.timeseries[0].data.instant.details.air_temperature = "28";
  assert.throws(() => normalizeMetNorwayWeather(fixture));
});

test("loads the fixed provider endpoint with identification, timeout, and cache", async () => {
  let request;
  const result = await loadHomeWeather(async (input, init) => {
    request = { input, init };
    return new Response(JSON.stringify(providerFixture()), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  assert.equal(result.loadFailed, false);
  assert.equal(result.weather?.temperatureC, 28.4);
  const url = new URL(request.input);
  assert.equal(url.origin, "https://api.met.no");
  assert.equal(url.pathname, "/weatherapi/locationforecast/2.0/compact");
  assert.equal(url.searchParams.get("lat"), "37.5665");
  assert.equal(url.searchParams.get("lon"), "126.9780");
  assert.match(request.init.headers["User-Agent"], /^pul-platform\/1\.0/);
  assert.equal(request.init.next.revalidate, 1800);
  assert.ok(request.init.signal instanceof AbortSignal);
});

test("isolates request and HTTP failures without fake weather", async () => {
  const requestFailure = await loadHomeWeather(async () => {
    throw new Error("network unavailable");
  });
  assert.deepEqual(requestFailure, { weather: null, loadFailed: true });

  const httpFailure = await loadHomeWeather(async () => new Response("unavailable", { status: 503 }));
  assert.deepEqual(httpFailure, { weather: null, loadFailed: true });
});
