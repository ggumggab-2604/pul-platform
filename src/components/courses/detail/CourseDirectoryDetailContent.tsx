"use client";

import Link from "next/link";
import {CourseOperatingState} from "@/components/courses/CourseStewardUI";
import type {CourseOperatorSnapshot} from "@/lib/courses/courseOperatorImages";
import {CourseOperatorImages} from "./CourseOperatorImages";
import {resourceButton, type CourseOverview} from "@/lib/courses/courseContent";
import {CourseResourcePanel,CourseResourceShortcuts,CourseEvents,CourseNotices} from "@/components/courses/CourseContentUI";
import { CourseInformationReportDialog } from "@/components/courses/CourseInformationReportDialog";

import { CourseActivityPhotoSection } from "@/components/courses/detail/CourseActivityPhotoSection";
import { CourseClubsSection } from "@/components/courses/detail/CourseClubsSection";
import { CourseInterest } from "@/components/courses/CourseInterest";
import { CourseDirections } from "@/components/courses/CourseDirections";
import { safeReservationUrl } from "@/lib/courses/courseDirections";
import { Card } from "@/components/ui/Card";
import { useAuthSessionStatus } from "@/hooks/useAuthSessionStatus";
import {
  courseFeatureLabels,
  courseOperationLabels,
  courseTypeLabels,
  type PublicCourse,
} from "@/lib/courses/courseDirectory";
import type { CourseMediaSnapshot } from "@/lib/courses/courseMedia";
import type { PublicClub } from "@/lib/clubs/clubDirectory";
import { ExternalLink, Phone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

type Props = {
  overview: CourseOverview;
  operatorImages: CourseOperatorSnapshot;
  discussion?: ReactNode;
  course: PublicCourse;
  expectedType: "field" | "screen";
  initialMedia: CourseMediaSnapshot;
  initialCourseClubs: PublicClub[];
};

function phoneHref(phone: string) {
  return `tel:${phone.replace(/[^0-9+]/g, "")}`;
}

export function CourseDirectoryDetailContent({
  overview,
  operatorImages,
  discussion,
  course,
  expectedType,
  initialMedia,
  initialCourseClubs,
}: Props) {
  const router = useRouter();
  const authStatus = useAuthSessionStatus();
  const [reportOpen, setReportOpen] = useState(false);
  const [reportTrigger, setReportTrigger] = useState<HTMLElement | null>(null);
  const featureLabels = course.featureCodes.map((code) => courseFeatureLabels[code]);

  const openReport = (trigger: HTMLElement) => {
    if (authStatus === "signedOut") {
      router.push(`/login?next=/courses/${course.courseKey}`);
      return;
    }
    if (authStatus !== "signedIn") return;
    setReportTrigger(trigger);
    setReportOpen(true);
  };

  const reservationUrl = safeReservationUrl(course.reservationUrl);
  const quickActions = <div className="grid auto-rows-fr grid-cols-2 gap-3 max-sm:[&>*]:min-w-0 max-sm:[&>:not(button)]:px-1 max-sm:[&>*]:text-sm sm:flex sm:flex-wrap">
    {course.phone ? <a href={phoneHref(course.phone)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-pul-border bg-white px-4 font-bold text-pul-deep"><Phone className="h-4 w-4" aria-hidden="true" />전화 문의</a> : null}
    {reservationUrl ? <a href={reservationUrl} target="_blank" rel="noopener noreferrer" className="order-last col-span-2 sm:order-none inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-pul-border bg-white px-4 font-bold text-pul-deep"><ExternalLink className="h-4 w-4" aria-hidden="true" />공식 예약 안내</a> : null}
    <CourseResourceShortcuts courseKey={course.courseKey} screen={expectedType === "screen"} counts={overview.counts}/>
    <button type="button" disabled={authStatus === "loading"} onClick={event => openReport(event.currentTarget)} className={resourceButton+" order-last col-span-2 w-max max-w-full justify-self-end bg-white max-sm:px-3 sm:order-none disabled:opacity-60"}>구장 정보 제보</button>
  </div>;

  if (course.courseType !== expectedType) return null;

  return <>
    <div className="space-y-5 lg:space-y-6" data-testid={`${expectedType}-course-main`}>
      <header className="rounded-xl border border-pul-border bg-white p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="font-bold text-pul-point">{courseTypeLabels[course.courseType]}{expectedType === "field" ? ` · ${course.holes}홀` : course.bayCount === null ? " · 타석 수 확인 중" : ` · ${course.bayCount}타석`}</p><CourseInterest courseKey={course.courseKey} returnTo={`/courses/${encodeURIComponent(course.courseKey)}`} /></div>
        <h1 className="mt-3 break-words text-2xl font-bold leading-snug text-pul-deep sm:text-3xl">{course.name}</h1>
        <CourseOperatingState state={course.operatingState} courseKey={course.courseKey} lookupStatus={course.operatingState ? "ready" : "error"} canManage={overview.manager || overview.steward || course.operatingState?.can_manage === true}/>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-3"><p className="select-all break-words leading-7">{course.address}</p></div>
        <dl className="mt-5 grid gap-4 border-t border-pul-border pt-5 sm:grid-cols-2">
          <div><dt className="text-sm text-pul-muted">시간·휴장</dt><dd className="mt-1 whitespace-pre-line leading-7">{course.operatingHours ?? "운영 시간·휴장 정보 확인 중"}</dd></div>
          <div><dt className="text-sm text-pul-muted">이용 방식·주차</dt><dd className="mt-1 leading-7">{course.operation ? courseOperationLabels[course.operation] : "이용 방식 확인 중"} · 주차 {course.parkingAvailable === true ? "가능" : course.parkingAvailable === false ? "불가" : "확인 중"}</dd></div>
          <div className={"min-w-0 " + (operatorImages.items.length || operatorImages.canManage ? "sm:col-start-1" : "sm:col-span-2")}>
            <dt className="text-sm text-pul-muted">요금</dt><dd className="mt-1 whitespace-pre-line leading-7">{course.feeGuide ?? "이용료 정보 확인 중"}</dd>
            <dt className="mt-4 text-sm text-pul-muted">예약·이용 안내</dt><dd className="mt-1 whitespace-pre-line leading-7">{course.reservationGuide ?? "방문 전 공식 연락처로 이용 가능 여부를 확인해 주세요."}</dd>
          </div>
          <div id="operator-images" className="course-operator-info-slot"><dt className="sr-only">운영자 이미지</dt><dd><CourseOperatorImages courseKey={course.courseKey} initial={operatorImages}/></dd></div>
        </dl>
        <div className="mt-5 border-t border-pul-border pt-5">{quickActions}</div>
        <div className="mt-3 space-y-2">{overview.manager||overview.steward?<Link prefetch={false} href={`/courses/${course.courseKey}/manage`} className="inline-flex min-h-11 items-center text-sm font-bold text-pul-point underline">정보 직접 수정</Link>:null}<p className="text-sm leading-6 text-pul-muted">운영시간·요금·휴장은 변경될 수 있습니다. 방문 전 운영기관에 확인해 주세요.</p></div>
      </header>
      {expectedType === "screen" ? <CourseNotices courseKey={course.courseKey} page={overview.notices} manage={overview.manager || overview.steward} canSend={overview.can_broadcast}/> : null}
      <CourseDirections course={course} />
      <CourseEvents events={overview.events}/>
      <CourseResourcePanel courseKey={course.courseKey} screen={expectedType === "screen"} page={overview.resources}/>
      {course.description || featureLabels.length ? <Card title={expectedType === "screen" ? "시설·특이사항" : "구장 소개"}><p className="whitespace-pre-line text-base leading-8">{course.description}</p>{featureLabels.length > 0 ? <ul className="mt-3 flex flex-wrap gap-2" aria-label="골프장 특징">{featureLabels.map(label => <li key={label} className="rounded-full bg-pul-light px-3 py-1 text-sm text-pul-deep">{label}</li>)}</ul> : null}</Card> : null}
      <CourseActivityPhotoSection courseKey={course.courseKey} courseName={course.name} courseType={course.courseType} initialSnapshot={initialMedia} />
      {expectedType === "field" ? discussion : null}
      <CourseClubsSection key={course.courseKey} courseKey={course.courseKey} initialClubs={initialCourseClubs} />
    </div>
    {reportOpen ? <CourseInformationReportDialog course={course} trigger={reportTrigger} onClose={() => setReportOpen(false)} /> : null}
  </>;
}
