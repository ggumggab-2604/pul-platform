"use client";

import Link from "next/link";
import type {CourseOperatorSnapshot} from "@/lib/courses/courseOperatorImages";
import {CourseOperatorImages} from "./CourseOperatorImages";
import type {CourseOverview} from "@/lib/courses/courseContent";
import {CourseResourcePanel,CourseResourceShortcuts,CourseEvents,CourseNotices} from "@/components/courses/CourseContentUI";
import { CourseInformationReportDialog } from "@/components/courses/CourseInformationReportDialog";
import { CourseNotificationSubscription } from "@/components/courses/CourseNotificationSubscription";
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
  const quickActions = <div className="flex flex-wrap gap-3">
    {course.phone ? <a href={phoneHref(course.phone)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-pul-border bg-white px-4 font-bold text-pul-deep"><Phone className="h-4 w-4" aria-hidden="true" />전화 문의</a> : null}
    {reservationUrl ? <a href={reservationUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-pul-border bg-white px-4 font-bold text-pul-deep"><ExternalLink className="h-4 w-4" aria-hidden="true" />공식 예약 안내</a> : null}
    <CourseResourceShortcuts courseKey={course.courseKey} screen={expectedType === "screen"} counts={overview.counts}/>
  </div>;

  if (course.courseType !== expectedType) return null;

  return <>
    <div className="space-y-5 lg:space-y-6" data-testid={`${expectedType}-course-main`}>
      <header className="rounded-xl border border-pul-border bg-white p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="font-bold text-pul-point">{courseTypeLabels[course.courseType]}{expectedType === "field" ? ` · ${course.holes}홀` : course.bayCount === null ? " · 타석 수 확인 중" : ` · ${course.bayCount}타석`}</p><CourseInterest courseKey={course.courseKey} returnTo={`/courses/${encodeURIComponent(course.courseKey)}`} /></div>
        <h1 className="mt-3 break-words text-2xl font-bold leading-snug text-pul-deep sm:text-3xl">{course.name}</h1>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-3"><p className="select-all break-words leading-7">{course.address}</p></div>
        <dl className="mt-5 grid gap-4 border-t border-pul-border pt-5 sm:grid-cols-2">
          <div><dt className="text-sm text-pul-muted">시간·휴장</dt><dd className="mt-1 whitespace-pre-line leading-7">{course.operatingHours ?? "운영 시간·휴장 정보 확인 중"}</dd></div>
          <div><dt className="text-sm text-pul-muted">이용 방식·주차</dt><dd className="mt-1 leading-7">{course.operation ? courseOperationLabels[course.operation] : "이용 방식 확인 중"} · 주차 {course.parkingAvailable === true ? "가능" : course.parkingAvailable === false ? "불가" : "확인 중"}</dd></div>
          <div className={operatorImages.items.length || operatorImages.canManage ? "sm:col-start-1" : "sm:col-span-2"}><dt className="text-sm text-pul-muted">요금</dt><dd className="mt-1 whitespace-pre-line leading-7">{course.feeGuide ?? "이용료 정보 확인 중"}</dd></div>
          <div className="sm:col-span-2"><dt className="text-sm text-pul-muted">예약·이용 안내</dt><dd className="mt-1 whitespace-pre-line leading-7">{course.reservationGuide ?? "방문 전 공식 연락처로 이용 가능 여부를 확인해 주세요."}</dd></div>
          <div className="course-operator-info-slot"><dt className="sr-only">운영자 이미지</dt><dd><CourseOperatorImages courseKey={course.courseKey} initial={operatorImages}/></dd></div>
        </dl>
        <div className="mt-5 border-t border-pul-border pt-5">{quickActions}</div>
      </header>
      {expectedType === "screen" ? <CourseNotices courseKey={course.courseKey} page={overview.notices} manage={overview.manager || overview.steward} canSend={overview.can_broadcast}/> : null}
      <CourseDirections course={course} />
      <CourseEvents events={overview.events}/>
      <CourseResourcePanel courseKey={course.courseKey} screen={expectedType === "screen"} page={overview.resources}/>
      {course.description || featureLabels.length ? <Card title={expectedType === "screen" ? "시설·특이사항" : "구장 소개"}><p className="whitespace-pre-line text-base leading-8">{course.description}</p>{featureLabels.length > 0 ? <ul className="mt-3 flex flex-wrap gap-2" aria-label="골프장 특징">{featureLabels.map(label => <li key={label} className="rounded-full bg-pul-light px-3 py-1 text-sm text-pul-deep">{label}</li>)}</ul> : null}</Card> : null}
      <CourseActivityPhotoSection courseKey={course.courseKey} courseName={course.name} courseType={course.courseType} initialSnapshot={initialMedia} />
      <CourseNotificationSubscription key={`notifications:${course.courseKey}`} courseKey={course.courseKey} />
      {expectedType === "field" ? discussion : <section className="rounded-xl border border-pul-border bg-white p-4 sm:p-6"><h2 className="text-xl font-bold text-pul-deep">비공개 문의·건의</h2><p className="mt-2 text-sm leading-7 text-pul-muted">확인된 구장 문의 담당자와 쪽지로 대화합니다. 보낸 내용과 답장은 내 쪽지함에서 확인할 수 있습니다.</p>{overview.contact_connected ? <Link className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-pul-point px-4 text-sm font-bold text-white" href={`/courses/${course.courseKey}/inquiry`}>문의·건의 보내기</Link> : <p className="mt-3 text-sm text-pul-muted">문의 담당자가 아직 연결되지 않았습니다.</p>}{overview.manager ? <Link className="ml-3 inline-flex min-h-11 items-center text-sm font-bold underline" href={`/courses/${course.courseKey}/content/manage`}>문의 담당자 설정</Link> : null}</section>}
      <CourseClubsSection key={course.courseKey} courseKey={course.courseKey} initialClubs={initialCourseClubs} />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-pul-border bg-white p-4"><p className="text-sm leading-6 text-pul-muted">운영시간·요금·휴장은 변경될 수 있습니다. 방문 전 운영기관에 확인해 주세요.</p><button type="button" onClick={event => openReport(event.currentTarget)} className="min-h-11 rounded-lg border border-pul-border px-4 text-sm font-bold text-pul-deep">정보 수정 제보</button></div>
    </div>
    {reportOpen ? <CourseInformationReportDialog course={course} trigger={reportTrigger} onClose={() => setReportOpen(false)} /> : null}
  </>;
}
