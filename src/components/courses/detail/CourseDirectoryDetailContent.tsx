"use client";

import { CourseInformationReportDialog } from "@/components/courses/CourseInformationReportDialog";
import { CourseActivityPhotoSection } from "@/components/courses/detail/CourseActivityPhotoSection";
import { DetailPageWithSidebar } from "@/components/layout/DetailPageWithSidebar";
import { Card } from "@/components/ui/Card";
import { useAuthSessionStatus } from "@/hooks/useAuthSessionStatus";
import {
  courseFeatureLabels,
  courseOperationLabels,
  courseTypeLabels,
  type PublicCourse,
} from "@/lib/courses/courseDirectory";
import type { CourseMediaSnapshot } from "@/lib/courses/courseMedia";
import { Clock3, ExternalLink, Flag, MapPin, Phone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  course: PublicCourse;
  expectedType: "field" | "screen";
  initialMedia: CourseMediaSnapshot;
};

function phoneHref(phone: string) {
  return `tel:${phone.replace(/[^0-9+]/g, "")}`;
}

function getMapHref(course: PublicCourse) {
  if (course.latitude !== null && course.longitude !== null) {
    return `https://map.kakao.com/link/map/${encodeURIComponent(course.name)},${course.latitude},${course.longitude}`;
  }
  return `https://map.kakao.com/link/search/${encodeURIComponent(course.address)}`;
}

export function CourseDirectoryDetailContent({ course, expectedType, initialMedia }: Props) {
  const router = useRouter();
  const authStatus = useAuthSessionStatus();
  const [reportOpen, setReportOpen] = useState(false);
  const [reportTrigger, setReportTrigger] = useState<HTMLElement | null>(null);
  const featureLabels = course.featureCodes.map((code) => courseFeatureLabels[code]);
  if (course.parkingAvailable === true) featureLabels.push(courseFeatureLabels.parking);

  const openReport = (trigger: HTMLElement) => {
    if (authStatus === "signedOut") {
      router.push(`/login?next=/courses/${course.courseKey}`);
      return;
    }
    if (authStatus !== "signedIn") return;
    setReportTrigger(trigger);
    setReportOpen(true);
  };

  const quickActions = <div className="grid gap-2">
    <a href={getMapHref(course)} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-pul-point px-4 font-bold text-white hover:bg-pul-deep"><MapPin className="h-4 w-4" aria-hidden="true" />지도에서 위치 보기</a>
    {course.phone ? <a href={phoneHref(course.phone)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-pul-border bg-white px-4 font-bold text-pul-deep"><Phone className="h-4 w-4" aria-hidden="true" />전화 문의</a> : null}
    {course.reservationUrl ? <a href={course.reservationUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-pul-border bg-white px-4 font-bold text-pul-deep"><ExternalLink className="h-4 w-4" aria-hidden="true" />공식 예약 안내</a> : null}
    <button type="button" onClick={(event) => openReport(event.currentTarget)} className="min-h-11 rounded-lg border border-pul-border bg-pul-light px-4 font-bold text-pul-deep">정보 수정 제보</button>
  </div>;

  if (course.courseType !== expectedType) return null;

  return <>
    <div className="space-y-5 lg:space-y-6">
      <header className="rounded-xl border border-pul-border bg-white px-4 py-5 shadow-[0_2px_10px_rgba(6,78,59,0.06)] lg:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-pul-light px-3 py-1 text-sm font-bold text-pul-deep">{courseTypeLabels[course.courseType]}</span>
          <span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-pul-muted ring-1 ring-pul-border">{courseOperationLabels[course.operation]}</span>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-800 ring-1 ring-emerald-200">공개 운영 정보</span>
        </div>
        <h1 className="mt-3 break-words text-2xl font-bold leading-snug text-foreground sm:text-3xl">{course.name}</h1>
        <div className="mt-3 grid gap-2 text-base text-pul-muted sm:grid-cols-2">
          <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-5 w-5 shrink-0 text-pul-point" aria-hidden="true" />{course.address}</p>
          <p className="flex items-center gap-2"><Flag className="h-5 w-5 shrink-0 text-pul-point" aria-hidden="true" />{course.region} {course.city} · {course.holes}홀</p>
          <p className="flex items-center gap-2"><Clock3 className="h-5 w-5 shrink-0 text-pul-point" aria-hidden="true" />{course.operatingHours ?? "운영 시간 확인 중"}</p>
          <p className="flex items-center gap-2"><Phone className="h-5 w-5 shrink-0 text-pul-point" aria-hidden="true" />{course.phone ?? "공식 연락처 확인 중"}</p>
        </div>
      </header>

      <DetailPageWithSidebar mainTestId={`${expectedType}-course-main`} sidebar={<div className="sticky top-4"><Card title="빠른 이용">{quickActions}</Card></div>}>
        <div className="space-y-4 lg:space-y-5">
          <Card title={expectedType === "field" ? "골프장 소개" : "스크린 골프장 소개"}>
            <p className="whitespace-pre-line text-base leading-8 text-foreground">{course.description}</p>
            {featureLabels.length > 0 ? <ul className="mt-4 flex flex-wrap gap-2" aria-label="골프장 특징">{featureLabels.map((label) => <li key={label} className="rounded-full bg-pul-light px-3 py-1.5 text-sm font-bold text-pul-deep">{label}</li>)}</ul> : <p className="mt-4 text-sm text-pul-muted">등록된 부가 정보가 없습니다.</p>}
          </Card>

          <Card title="예약·이용 안내">
            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-[#fafbfa] p-3"><dt className="text-sm font-bold text-pul-muted">운영 방식</dt><dd className="mt-1 text-base font-bold">{courseOperationLabels[course.operation]}</dd></div>
              <div className="rounded-lg bg-[#fafbfa] p-3"><dt className="text-sm font-bold text-pul-muted">주차</dt><dd className="mt-1 text-base font-bold">{course.parkingAvailable === true ? "가능" : course.parkingAvailable === false ? "불가" : "확인 중"}</dd></div>
              <div className="rounded-lg bg-[#fafbfa] p-3 sm:col-span-2"><dt className="text-sm font-bold text-pul-muted">예약 안내</dt><dd className="mt-1 whitespace-pre-line text-base leading-relaxed">{course.reservationGuide ?? "방문 전 골프장 공식 연락처로 이용 가능 여부를 확인해 주세요."}</dd></div>
              <div className="rounded-lg bg-[#fafbfa] p-3 sm:col-span-2"><dt className="text-sm font-bold text-pul-muted">이용료</dt><dd className="mt-1 whitespace-pre-line text-base leading-relaxed">{course.feeGuide ?? "이용료 정보 확인 중"}</dd></div>
            </dl>
          </Card>

          <Card title="위치·연락처">
            <p className="text-base leading-relaxed text-foreground">{course.address}</p>
            <div className="mt-4 lg:hidden">{quickActions}</div>
          </Card>
          <CourseActivityPhotoSection
            courseKey={course.courseKey}
            courseName={course.name}
            initialSnapshot={initialMedia}
          />
          <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">운영시간, 요금, 예약방법과 휴장 정보는 현장 사정에 따라 변경될 수 있습니다. 방문 전 운영기관에 확인해 주세요.</p>
        </div>
      </DetailPageWithSidebar>
    </div>

    {reportOpen ? <CourseInformationReportDialog course={course} trigger={reportTrigger} onClose={() => setReportOpen(false)} /> : null}
  </>;
}
