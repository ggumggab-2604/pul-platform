import {
  courseCategoryFilters,
  courseCategoryLabels,
  methodFilters,
  providerTypeFilters,
  statusFilters,
} from "@/data/certificationData";
import type { CertificationCourseSummary, PublicQualificationCourse } from "./certificationDirectory";

const courseListPath = "/certification?tab=courses";
const maximumCoursePage = 100000;

export const certificationCourseFilterKeys = [
  "courseKeyword", "courseCategory", "courseRegion",
  "courseStatus", "courseProviderType", "courseMethod",
] as const;

const acceptedOptions = {
  courseCategory: courseCategoryFilters,
  courseProviderType: providerTypeFilters,
  courseMethod: methodFilters,
  courseStatus: statusFilters,
};

export function certificationCoursePage(value: string | null | undefined) {
  const page = /^\d{1,6}$/.test(value ?? "") ? Number(value) : 1;
  return Math.min(maximumCoursePage, Math.max(1, page));
}

export function certificationCourseListHref(get: (key: string) => string | null | undefined, page = certificationCoursePage(get("coursePage"))) {
  const query = new URLSearchParams({ tab: "courses" });
  for (const key of certificationCourseFilterKeys) {
    const raw = get(key) ?? (key === "courseProviderType" ? get("courseProvider") : null);
    if (!raw || /[\u0000-\u001f\u007f]/.test(raw)) continue;
    const value = raw.trim();
    if (!value) continue;
    if (key === "courseKeyword" || key === "courseRegion") {
      if (value.length <= (key === "courseKeyword" ? 100 : 80)) query.set(key, value);
    } else if (value !== "all" && acceptedOptions[key].some(({ value: option }) => option === value)) {
      query.set(key, value);
    }
  }
  if (page > 1) query.set("coursePage", String(page));
  return "/certification?" + query;
}

export function safeCertificationCourseReturn(value: string | string[] | undefined) {
  if (typeof value !== "string" || !value.startsWith("/certification?") || value.length > 2600 || value.includes("#")) {
    return courseListPath;
  }
  const query = new URLSearchParams(value.slice("/certification?".length));
  if (query.get("tab") !== "courses" || new Set(query.keys()).size !== Array.from(query.keys()).length) {
    return courseListPath;
  }
  return certificationCourseListHref((key) => query.get(key));
}

export function certificationCourseDetailHref(courseKey: string, returnTo?: string) {
  const path = "/certification/courses/" + encodeURIComponent(courseKey);
  return returnTo ? path + "?" + new URLSearchParams({ returnTo }) : path;
}

export function certificationCourseQualification(course: PublicQualificationCourse, summary: CertificationCourseSummary) {
  return [summary.qualification || courseCategoryLabels[course.category], summary.grade].filter(Boolean).join(" · ");
}

export const formatCertificationCourseFee = (value: number) => value.toLocaleString("ko-KR") + "원";

export function certificationCourseTotal(summary: CertificationCourseSummary) {
  const { tuition, examFee, issueFee } = summary;
  return tuition === null || examFee === null || issueFee === null
    ? "총비용은 기관 확인"
    : formatCertificationCourseFee(tuition + examFee + issueFee);
}
