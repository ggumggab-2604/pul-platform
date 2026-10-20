import type { Metadata } from "next";
import { WeatherDetail } from "@/components/weather/WeatherDetail";
import { getPublicCourse } from "@/lib/courses/courseDirectory";
import { courseAddressRegion } from "@/lib/courses/courseRegions";
import { createClient } from "@/lib/supabase/server";
import { courseWeatherLocation, HOME_WEATHER_LOCATION_LABEL, loadHomeWeather, loadLocationWeather, weatherReferenceTime } from "@/lib/weather/weather";
export const metadata: Metadata = {title: "시간별 날씨"};
export default async function WeatherPage({searchParams}: {searchParams: Promise<{course?: string | string[]}>}) {
 const query = await searchParams;
 const referenceTime = await weatherReferenceTime();
 if (query.course !== undefined) {
  const key = typeof query.course === "string" && /^[a-zA-Z0-9_-]{1,120}$/.test(query.course) ? query.course : null;
  if (!key) return <WeatherDetail weather={null} now={referenceTime} title="구장 날씨" returnHref="/courses" returnLabel="골프장 목록으로" refreshHref="/weather" unavailable="구장 정보를 확인할 수 없습니다."/>;
  let course;
  try { course = await getPublicCourse(await createClient(),key); }
  catch { return <WeatherDetail weather={null} now={referenceTime} title="구장 날씨" returnHref="/courses" returnLabel="골프장 목록으로" refreshHref={`/weather?course=${encodeURIComponent(key)}`} unavailable="구장 정보를 불러오지 못했습니다."/>; }
  const area = courseAddressRegion(course.address);
  const label = [area.province,area.district].filter(Boolean).join(" ") || course.name;
  const location = courseWeatherLocation(course,label);
  const result = location ? await loadLocationWeather(location) : {weather:null,loadFailed:false};
  return <WeatherDetail key={course.courseKey} weather={result.weather} now={result.weather?.calculatedAt ?? referenceTime} title={course.name} regionLabel={label !== course.name ? label : undefined} returnHref={`/courses/${encodeURIComponent(course.courseKey)}`} returnLabel="구장으로 돌아가기" refreshHref={`/weather?course=${encodeURIComponent(course.courseKey)}`} unavailable={!location ? "구장 위치 정보가 없어 날씨를 표시할 수 없습니다." : undefined}/>;
 }
 const result = await loadHomeWeather();
 return <WeatherDetail weather={result.weather} now={result.weather?.calculatedAt ?? referenceTime} title={HOME_WEATHER_LOCATION_LABEL} returnHref="/" returnLabel="메인으로 돌아가기" refreshHref="/weather"/>;
}
