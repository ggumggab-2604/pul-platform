import type { CourseProvince, CourseRegionOption } from "@/lib/courses/courseRegions";
import { CoursesPageClient } from "@/components/courses/CoursesPageClient";
import {
  CourseDirectoryError,
  listPublicCourses,
  listPublicCourseRegions,
  type CourseFeatureCode,
  type CourseFilters,
  type CourseHolesFilter,
  type CourseOperation,
  type CourseRegion,
  type CourseType,
  type PublicCoursePage,
} from "@/lib/courses/courseDirectory";
import { findPromotionForSlot } from "@/lib/promotions/promotionRuntime";
import { loadActivePromotionsForSlots } from "@/lib/promotions/promotionRuntime.server";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "골프장",
  description: "야외 파크골프장과 스크린 파크골프장 정보를 확인하세요.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const emptyPage: PublicCoursePage = {
  items: [],
  total: 0,
  limit: 24,
  offset: 0,
  hasMore: false,
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseFilters(params: Record<string, string | string[] | undefined>): CourseFilters {
  const featureValue = params.feature;
  const features = (Array.isArray(featureValue) ? featureValue : featureValue ? [featureValue] : []) as CourseFeatureCode[];
  return {
    province: first(params.province) as CourseProvince | undefined,
    district: first(params.district),
    keyword: first(params.q),
    courseType: first(params.type) as CourseType | undefined,
    region: first(params.region) as CourseRegion | undefined,
    operation: first(params.operation) as CourseOperation | undefined,
    holes: first(params.holes) as CourseHolesFilter | undefined,
    features,
  };
}

export default async function CoursesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const filters = parseFilters(params);
  const requestedPage = Number.parseInt(first(params.page) ?? "1", 10);
  const pageNumber = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  let page = { ...emptyPage, offset: (pageNumber - 1) * emptyPage.limit };
  let error: string | undefined;
  let regionOptions: CourseRegionOption[] = [];
  let regionError = false;
  const view = first(params.view) === "map" ? "map" : "list";
  const client = await createClient();
  const promotionPromise = loadActivePromotionsForSlots(client, ["courses.top.01", "courses.after_map.01"]);
  try {
    page = await listPublicCourses(client, filters, emptyPage.limit, page.offset);
  } catch (caught) {
    error = caught instanceof CourseDirectoryError
      ? caught.userMessage
      : "골프장 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
  try { regionOptions = await listPublicCourseRegions(client); } catch { regionError = true; }
  const promotions = await promotionPromise;
  const promotion = findPromotionForSlot(promotions, "courses.top.01");
  const secondPromotion = findPromotionForSlot(promotions, "courses.after_map.01");
  const key = JSON.stringify({ filters, pageNumber, view });
  return <CoursesPageClient key={key} page={page} view={view} regionOptions={regionOptions} regionError={regionError} filters={filters} error={error} promotion={promotion} secondPromotion={secondPromotion} />;
}
