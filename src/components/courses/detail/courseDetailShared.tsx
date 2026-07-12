import type { CourseInfoSource, CourseOperationStatus } from "@/data/courseDetailPageData";
import {
  infoSourceLabels,
  operationStatusLabels,
  operationStatusStyles,
} from "@/data/courseDetailPageData";
import { courseTypeLabels, operationLabels, type CourseMapItem } from "@/data/courseMapData";
import { cn } from "@/lib/utils";
import Link from "next/link";

export function CourseBreadcrumb({ course }: { course: CourseMapItem }) {
  return (
    <nav aria-label="경로" className="flex flex-wrap items-center gap-1.5 text-sm text-pul-muted lg:text-base">
      <Link href="/" className="font-medium hover:text-pul-point">
        홈
      </Link>
      <span aria-hidden="true">›</span>
      <Link href="/courses" className="font-medium hover:text-pul-point">
        골프장
      </Link>
      <span aria-hidden="true">›</span>
      <span className="font-medium text-pul-deep">{course.region}</span>
      <span aria-hidden="true">›</span>
      <span className="font-semibold text-foreground">{course.name}</span>
    </nav>
  );
}

export function CourseTypeBadge({ type }: { type: CourseMapItem["type"] }) {
  return (
    <span className="rounded-full bg-pul-light px-2.5 py-1 text-xs font-bold text-pul-deep ring-1 ring-emerald-200/70 lg:text-sm">
      {courseTypeLabels[type]}
    </span>
  );
}

export function OperationStatusBadge({ status }: { status: CourseOperationStatus }) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-bold ring-1 lg:text-sm",
        operationStatusStyles[status],
      )}
    >
      {operationStatusLabels[status]}
    </span>
  );
}

export function ReservationTypeBadge({ course }: { course: CourseMapItem }) {
  return (
    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-pul-muted ring-1 ring-pul-border lg:text-sm">
      {operationLabels[course.operation]}
    </span>
  );
}

export function InfoSourceBadge({ source }: { source: CourseInfoSource }) {
  return (
    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-pul-muted ring-1 ring-pul-border lg:text-sm">
      {infoSourceLabels[source]}
    </span>
  );
}

export function FeatureBadge({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-pul-light px-2.5 py-1 text-xs font-bold text-pul-deep ring-1 ring-emerald-200/60 lg:text-sm">
      {label}
    </span>
  );
}

export function MockDataBadge() {
  return (
    <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-800 ring-1 ring-amber-200">
      개발용 샘플
    </span>
  );
}

export const COURSE_DISCLAIMER =
  "운영시간, 이용요금, 예약방법 및 휴장 정보는 현장 사정에 따라 변경될 수 있습니다. 방문 전 운영기관 또는 골프장에 다시 확인해 주세요.";

export const COURSE_REPORT_MESSAGE =
  "골프장 신규 오픈, 운영 방식 변경, 연락처·요금 수정 정보는 PUL 운영팀이 확인 후 반영할 예정입니다. MVP 단계에서는 안내 UI만 제공합니다.";

export const COURSE_REVIEW_MESSAGE =
  "후기 작성 기능은 추후 로그인 기반으로 제공될 예정입니다. 이 골프장의 경험을 공유해 주세요.";

export const COURSE_FAVORITE_MESSAGE =
  "관심 골프장 저장 기능은 추후 로그인 기반으로 제공될 예정입니다.";

export const COURSE_SHARE_MESSAGE =
  "공유 기능은 추후 제공될 예정입니다. 지금은 브라우저 주소창의 링크를 복사해 주세요.";

export const COURSE_PHOTO_UPLOAD_MESSAGE =
  "현장 사진 업로드 기능은 추후 로그인 기반으로 제공될 예정입니다. 동호회 공개 동의 후 업로드됩니다.";

export const COURSE_RECORD_VERIFY_MESSAGE =
  "기록 인증 신청 기능은 준비 중입니다. 홀인원·알바트로스·콘도르 기록은 운영자 확인 후 반영됩니다.";

export const COURSE_CLUB_REGISTER_MESSAGE =
  "이 구장을 이용하는 동호회 등록 기능은 준비 중입니다. 동호회 메뉴에서 등록 문의를 이용해 주세요.";

export const COURSE_MONTHLY_REGISTER_MESSAGE =
  "월례회 결과 등록 기능은 준비 중입니다. 동호회 운영진 확인 후 반영됩니다.";

/** 예약 가능 → 「예약·이용 안내」, 현장·비예약 → 「이용 안내」 */
export function getUsageGuideLabel(course: CourseMapItem): string {
  const bookable = course.reservation || course.operation === "reservation";
  return bookable ? "예약·이용 안내" : "이용 안내";
}

export function scrollToUsageGuide() {
  document.getElementById("course-core-info")?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}
