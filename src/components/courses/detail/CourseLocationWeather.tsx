import type { PublicCourse } from "@/lib/courses/courseDirectory";
import { courseAddressRegion } from "@/lib/courses/courseRegions";
import { courseWeatherLocation, loadLocationWeather } from "@/lib/weather/weather";
import { WeatherCard } from "@/components/home/WeatherCard";
import styles from "./CourseFieldDetail.module.css";

export function CourseWeatherLoading({ course }: { course: PublicCourse }) {
  const area = courseAddressRegion(course.address);
  const locationLabel = [area.province, area.district].filter(Boolean).join(" ") || course.name;
  return <WeatherCard weather={null} loadFailed={false} course={{ locationLabel, status: "loading" }} className={styles.weatherStrip}/>;
}
export async function CourseLocationWeather({ course }: { course: PublicCourse }) {
  const area = courseAddressRegion(course.address);
  const locationLabel = [area.province, area.district].filter(Boolean).join(" ") || course.name;
  const location = courseWeatherLocation(course, locationLabel);
  if (!location) return <WeatherCard weather={null} loadFailed={false} course={{ locationLabel, status: "missing", detailHref: `/weather?course=${encodeURIComponent(course.courseKey)}` }} className={styles.weatherStrip}/>;
  const result = await loadLocationWeather(location);
  return <WeatherCard {...result} course={{ locationLabel, detailHref: `/weather?course=${encodeURIComponent(course.courseKey)}` }} className={styles.weatherStrip}/>;
}
