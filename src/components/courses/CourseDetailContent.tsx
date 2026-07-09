import { CourseDetailTwoColumnRow } from "@/components/courses/CourseDetailTwoColumnRow";
import {
  dashboardBodyClass,
  dashboardCardClass,
  dashboardFooterClass,
  dashboardListClass,
} from "@/components/courses/courseDetailDashboardLayout";
import { CourseHallOfFameSection } from "@/components/courses/CourseHallOfFameSection";
import { CourseHomeClubsSection } from "@/components/courses/CourseHomeClubsSection";
import { CourseStoryBoardSection } from "@/components/courses/CourseStoryBoardSection";
import { CourseVideoBoardSection } from "@/components/courses/CourseVideoBoardSection";
import { CourseWeatherPanel } from "@/components/courses/CourseWeatherPanel";
import { Card } from "@/components/ui/Card";
import {
  courseTypeLabels,
  operationLabels,
  type CourseMapItem,
  type CourseNearbyPlace,
  type NearbyPlaceCategory,
} from "@/data/courseMapData";
import { getRecentBoardPosts } from "@/data/courseBoardPosts";
import { cn } from "@/lib/utils";
import { MapPin, Phone, Users } from "lucide-react";
import Link from "next/link";

type CourseDetailContentProps = {
  course: CourseMapItem;
};

const PARTNER_INQUIRY_EMAIL = "mailto:partner@pul-platform.kr?subject=PUL%20지역%20제휴%20입점%20문의";
const NEARBY_PLACE_LIMIT = 3;
const NEARBY_PLACE_MOBILE_LIMIT = 3;
const LOCAL_BANNER_LIMIT = 3;
const LOCAL_BANNER_MOBILE_LIMIT = 1;
const BOARD_POST_LIMIT = 5;

const nearbyCategoryStyles: Record<NearbyPlaceCategory, string> = {
  식당: "bg-orange-50 text-orange-800 ring-orange-200/70",
  카페: "bg-amber-50 text-amber-800 ring-amber-200/70",
  장비점: "bg-emerald-50 text-emerald-800 ring-emerald-200/70",
  "병원/약국": "bg-sky-50 text-sky-800 ring-sky-200/70",
  기타: "bg-gray-100 text-gray-700 ring-gray-200/80",
};

function availabilityLabel(available?: boolean, positive = "가능") {
  if (available === true) return positive;
  if (available === false) return "없음";
  return "확인 필요";
}

function InfoTile({
  label,
  value,
  compactOnMobile,
}: {
  label: string;
  value: string;
  compactOnMobile?: boolean;
}) {
  return (
    <div className="rounded-lg bg-pul-light px-3 py-2.5 max-lg:px-2.5 max-lg:py-2">
      <dt className="text-xs font-semibold text-pul-muted">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 text-sm font-bold leading-snug text-pul-deep",
          compactOnMobile && "max-lg:line-clamp-2 max-lg:text-xs lg:line-clamp-none lg:text-sm",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function BasicUsageSection({ course }: { course: CourseMapItem }) {
  const parkingText = `${availabilityLabel(course.amenities.parking.available)} · ${course.amenities.parking.description}`;
  const restroomText = `${availabilityLabel(course.amenities.restroom.available)} · ${course.amenities.restroom.description}`;

  return (
    <Card title="기본·이용 정보" dense bodyClassName="max-lg:p-3">
      <div className="space-y-3 max-lg:space-y-2.5">
        <div>
          <p className="text-sm font-semibold text-pul-point max-lg:text-xs">
            {courseTypeLabels[course.type]} · {course.region} {course.city}
          </p>
          <h1 className="mt-1 text-xl font-bold text-foreground max-lg:text-lg lg:text-2xl">
            {course.name}
          </h1>
          <p className="mt-1 line-clamp-2 text-sm text-pul-muted max-lg:text-xs">
            {course.address}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-2 max-lg:gap-1.5 lg:grid-cols-4">
          <InfoTile label="홀 수" value={`${course.holes}홀`} />
          <InfoTile label="운영 시간" value={course.hours} compactOnMobile />
          <InfoTile label="예약 방식" value={operationLabels[course.operation]} compactOnMobile />
          <InfoTile label="문의 번호" value={course.phone} />
          <InfoTile label="주차" value={parkingText} compactOnMobile />
          <InfoTile label="화장실" value={restroomText} compactOnMobile />
        </dl>
        <div className="rounded-lg bg-pul-light px-3 py-2.5 max-lg:px-2.5 max-lg:py-2">
          <p className="text-xs font-semibold text-pul-deep">초보자 참고사항</p>
          <p className="mt-0.5 line-clamp-3 text-sm leading-relaxed text-pul-muted max-lg:text-xs lg:line-clamp-none">
            {course.tips}
          </p>
        </div>
      </div>
    </Card>
  );
}

function NearbyPlaceCard({
  place,
  courseName,
  className,
}: {
  place: CourseNearbyPlace;
  courseName: string;
  className?: string;
}) {
  const searchUrl = `https://map.kakao.com/link/search/${encodeURIComponent(`${courseName} ${place.name}`)}`;

  return (
    <li
      className={cn(
        "flex items-start justify-between gap-3 rounded-lg border border-pul-border/80 px-3 py-2.5 max-lg:gap-1.5 max-lg:px-2.5 max-lg:py-1.5",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold text-foreground max-lg:text-xs">{place.name}</h3>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-bold ring-1",
              nearbyCategoryStyles[place.category],
            )}
          >
            {place.category}
          </span>
        </div>
        <p className="mt-0.5 text-xs font-semibold text-pul-point max-lg:text-[11px]">
          {place.distance} · {place.purpose}
        </p>
      </div>
      <a
        href={searchUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 rounded-md border border-pul-border px-2.5 py-2 text-xs font-bold text-pul-deep hover:bg-pul-light max-lg:min-h-10 max-lg:min-w-[4rem] max-lg:px-2.5 max-lg:py-1.5"
      >
        {place.ctaText}
      </a>
    </li>
  );
}

function CourseNearbyPlacesSection({
  course,
  className,
}: {
  course: CourseMapItem;
  className?: string;
}) {
  if (course.nearbyPlaces.length === 0) return null;

  return (
    <Card
      title="주변 추천 장소"
      dense
      className={cn(dashboardCardClass, className)}
      bodyClassName={dashboardBodyClass}
    >
      <ul className={cn("space-y-2 max-lg:space-y-1.5", dashboardListClass)}>
        {course.nearbyPlaces.slice(0, NEARBY_PLACE_LIMIT).map((place, index) => (
          <NearbyPlaceCard
            key={place.id}
            place={place}
            courseName={course.name}
            className={cn(index >= NEARBY_PLACE_MOBILE_LIMIT && "hidden lg:flex")}
          />
        ))}
      </ul>
    </Card>
  );
}

function CourseLocalBannersSection({
  course,
  className,
}: {
  course: CourseMapItem;
  className?: string;
}) {
  const banners = course.localBanners.slice(0, LOCAL_BANNER_LIMIT);

  return (
    <Card
      title="이 지역 혜택"
      dense
      className={cn(dashboardCardClass, className)}
      bodyClassName={dashboardBodyClass}
    >
      {banners.length > 0 && (
        <ul className={cn("space-y-2 max-lg:space-y-1.5", dashboardListClass)}>
          {banners.map((banner, index) => (
            <li
              key={banner.id}
              className={cn(
                "rounded-lg border border-pul-border/70 px-3 py-2 max-lg:px-2.5 max-lg:py-1.5",
                index >= LOCAL_BANNER_MOBILE_LIMIT && "hidden lg:list-item",
              )}
            >
              <p className="text-sm font-bold text-foreground max-lg:text-xs">{banner.title}</p>
              <p className="mt-0.5 line-clamp-1 text-xs text-pul-muted max-lg:text-[11px]">{banner.description}</p>
            </li>
          ))}
        </ul>
      )}
      <div
        className={cn(
          "rounded-lg border border-dashed border-pul-border bg-pul-light/50 px-3 py-2.5 max-lg:p-2.5 max-lg:py-2",
          banners.length > 0 ? cn("mt-3 shrink-0 max-lg:mt-2", dashboardFooterClass) : "flex-1",
        )}
      >
        <p className="text-xs font-bold text-pul-deep max-lg:text-[11px]">PUL 지역 제휴 광고</p>
        <a
          href={PARTNER_INQUIRY_EMAIL}
          className="mt-2 inline-flex min-h-10 w-full items-center justify-center rounded-md bg-pul-point px-3 py-2 text-xs font-bold text-white hover:bg-pul-deep max-lg:min-h-11 max-lg:mt-1.5"
        >
          입점 문의
        </a>
      </div>
    </Card>
  );
}

export function CourseDetailContent({ course }: CourseDetailContentProps) {
  const mapsUrl = `https://map.kakao.com/link/map/${encodeURIComponent(course.name)},${course.lat},${course.lng}`;
  const phoneHref = `tel:${course.phone.replace(/-/g, "")}`;
  const recentPosts = getRecentBoardPosts(course.courseBoardPosts, BOARD_POST_LIMIT);

  return (
    <div className="space-y-4 pb-2 max-lg:space-y-3 max-lg:pb-4 lg:space-y-6 lg:pb-0">
      <BasicUsageSection course={course} />

      <section aria-labelledby="course-weather-heading">
        <h2 id="course-weather-heading" className="sr-only">
          골프장 날씨
        </h2>
        <CourseWeatherPanel weather={course.weather} variant="detail" />
      </section>

      <CourseDetailTwoColumnRow>
        <CourseHomeClubsSection clubs={course.homeClubs} />
        <CourseHallOfFameSection entries={course.hallOfFame} />
      </CourseDetailTwoColumnRow>

      <CourseDetailTwoColumnRow>
        <CourseStoryBoardSection posts={recentPosts} compact />
        <CourseVideoBoardSection course={course} compact />
      </CourseDetailTwoColumnRow>

      <CourseDetailTwoColumnRow>
        <CourseNearbyPlacesSection course={course} />
        <CourseLocalBannersSection course={course} />
      </CourseDetailTwoColumnRow>

      <div className="pb-4 max-lg:grid max-lg:grid-cols-2 max-lg:gap-2 max-lg:pb-8 lg:flex lg:flex-row lg:flex-nowrap lg:items-center lg:justify-start lg:gap-3 lg:pt-2 lg:pb-4">
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-pul-point px-4 py-3 text-base font-bold text-white hover:bg-pul-deep max-lg:min-h-11 max-lg:px-3 max-lg:py-2.5 max-lg:text-sm lg:min-h-0 lg:w-auto lg:shrink-0 lg:px-5"
        >
          <MapPin className="h-5 w-5 max-lg:h-4 max-lg:w-4" aria-hidden="true" />
          길찾기
        </a>
        <a
          href={phoneHref}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-pul-border bg-white px-4 py-3 text-base font-bold text-pul-deep hover:bg-pul-light max-lg:min-h-11 max-lg:px-3 max-lg:py-2.5 max-lg:text-sm lg:min-h-0 lg:w-auto lg:shrink-0 lg:px-5"
        >
          <Phone className="h-5 w-5 max-lg:h-4 max-lg:w-4" aria-hidden="true" />
          전화 문의
        </a>
        <Link
          href="/clubs"
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-pul-border bg-white px-4 py-3 text-base font-bold text-pul-deep hover:bg-pul-light max-lg:min-h-11 max-lg:px-3 max-lg:py-2.5 max-lg:text-sm lg:min-h-0 lg:w-auto lg:shrink-0 lg:px-5"
        >
          <Users className="h-5 w-5 max-lg:h-4 max-lg:w-4" aria-hidden="true" />
          동호회 보기
        </Link>
        <Link
          href="/courses"
          className="inline-flex min-h-12 w-full items-center justify-center rounded-lg border border-pul-border bg-white px-4 py-3 text-base font-bold text-pul-muted hover:bg-pul-light hover:text-pul-deep max-lg:col-span-2 max-lg:min-h-11 max-lg:px-3 max-lg:py-2.5 max-lg:text-sm lg:min-h-0 lg:w-auto lg:shrink-0 lg:px-5"
        >
          목록으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
