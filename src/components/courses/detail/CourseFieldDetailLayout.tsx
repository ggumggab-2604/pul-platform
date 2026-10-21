"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CourseOperatingState } from "../CourseStewardUI";
import { CourseAddressCopy, CourseDirections } from "../CourseDirections";
import { CourseInterest } from "../CourseInterest";
import { CourseEvents, CourseResourcePanel } from "../CourseContentUI";
import { Card } from "@/components/ui/Card";
import { courseFeatureLabels, courseOperationLabels, type PublicCourse } from "@/lib/courses/courseDirectory";
import { resourceButton, type CourseOverview } from "@/lib/courses/courseContent";
import { safeReservationUrl } from "@/lib/courses/courseDirections";
import { type CourseStory } from "@/lib/courses/courseSteward";
import type { CourseOperatorSnapshot } from "@/lib/courses/courseOperatorImages";
import type { CourseMediaSnapshot } from "@/lib/courses/courseMedia";
import type { PublicClub } from "@/lib/clubs/clubDirectory";
import { CourseOperatorImages } from "./CourseOperatorImages";
import { CourseActivityPhotoSection } from "./CourseActivityPhotoSection";
import { CourseClubsSection } from "./CourseClubsSection";
import styles from "./CourseFieldDetail.module.css";
import { CourseNoticeStrip } from "./CourseNoticeStrip";

type Props = {
  course: PublicCourse;
  overview: CourseOverview;
  operatorImages: CourseOperatorSnapshot;
  initialMedia: CourseMediaSnapshot;
  initialCourseClubs: PublicClub[];
  discussion?: ReactNode;
  weather?: ReactNode;
  pinnedNotices?: CourseStory[];
  quickActions: ReactNode;
};

function VisitFacts({ course }: { course: PublicCourse }) {
  const wrap = useRef<HTMLDivElement>(null);
  const hoursProbe = useRef<HTMLSpanElement>(null);
  const feeProbe = useRef<HTMLSpanElement>(null);
  const [wide, setWide] = useState({ hours: false, fee: false });
  const hours = course.operatingHours ?? "운영 시간·휴장 정보 확인 중";
  const fee = course.feeGuide ?? "이용료 정보 확인 중";
  useEffect(() => {
    const node = wrap.current, hoursNode = hoursProbe.current, feeNode = feeProbe.current;
    if (!node || !hoursNode || !feeNode) return;
    // Measure the real typography at a stable half-column width. A full-width
    // item never changes the probes, so expanding long text cannot oscillate.
    const observer = new ResizeObserver(() => {
      const long = (probe: HTMLElement) => probe.getBoundingClientRect().height > parseFloat(getComputedStyle(probe).lineHeight) * 4 + 1;
      const next = { hours: long(hoursNode), fee: long(feeNode) };
      setWide(current => current.hours === next.hours && current.fee === next.fee ? current : next);
    });
    [node, hoursNode, feeNode].forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, [hours, fee]);
  return <div ref={wrap} className={styles.factsWrap}>
    <div className={styles.probes} aria-hidden="true"><span ref={hoursProbe}>{hours}</span><span ref={feeProbe}>{fee}</span></div>
    <dl className={styles.facts}>
      <div className={wide.hours ? styles.wide : undefined}><dt>시간·휴장</dt><dd className={course.operatingHours === null ? styles.unknown : undefined}>{hours}</dd></div>
      <div className={wide.fee ? styles.wide : undefined}><dt>요금</dt><dd className={course.feeGuide === null ? styles.unknown : undefined}>{fee}</dd></div>
      <div className={styles.wide}><dt>이용 방식·주차</dt><dd>{course.operation ? courseOperationLabels[course.operation] : "이용 방식 확인 중"} · 주차 {course.parkingAvailable === true ? "가능" : course.parkingAvailable === false ? "불가" : "확인 중"}</dd></div>
    </dl>
  </div>;
}

export function CourseFieldDetailLayout({ course, overview, operatorImages, discussion, weather, pinnedNotices, initialMedia, initialCourseClubs, quickActions }: Props) {
  const [directions, setDirections] = useState({ expanded: false, hasOpened: false });
  const features = course.featureCodes.map(code => courseFeatureLabels[code]);
  const reservationUrl = safeReservationUrl(course.reservationUrl);
  const canEdit = overview.manager || overview.steward;
  const showOperatorPhotos = operatorImages.items.length > 0 || operatorImages.canManage;
  function expandDirections(expanded: boolean) {
    setDirections(current => ({ expanded, hasOpened: current.hasOpened || expanded }));
  }
  function openMap() {
    expandDirections(true);
    requestAnimationFrame(() => {
      const destination = document.getElementById("course-directions");
      destination?.scrollIntoView({ block: "start" });
      destination?.focus({ preventScroll: true });
    });
  }
  return <div className={styles.root} data-testid="field-course-main">
    <header className={styles.overview}>
      <div className={styles.topline}><p className="font-bold text-pul-point">필드 파크골프장 · {course.holes}홀</p><div className={styles.interest}><CourseInterest courseKey={course.courseKey} returnTo={`/courses/${encodeURIComponent(course.courseKey)}`} /></div></div>
      <CourseOperatingState heading={<h1 className={styles.name}>{course.name}</h1>} state={course.operatingState} courseKey={course.courseKey} lookupStatus={course.operatingState ? "ready" : "error"} canManage={canEdit || course.operatingState?.can_manage === true} />
      <div className={styles.address}><p className="select-all">{course.address}</p><div className={styles.addressActions}><CourseAddressCopy address={course.address} buttonClassName={styles.secondaryAction} /><button type="button" className={styles.secondaryAction} onClick={openMap} aria-expanded={directions.expanded} aria-controls="course-directions">지도 보기 ↓</button></div></div>
      <CourseNoticeStrip courseKey={course.courseKey} notices={pinnedNotices ?? []} />
      <div className={`${styles.information} ${showOperatorPhotos ? "" : styles.informationWithoutPhotos}`}>
        <VisitFacts course={course} />
        {showOperatorPhotos ? <div id="operator-images" className={styles.operatorPhotos}><CourseOperatorImages courseKey={course.courseKey} initial={operatorImages} title="구장 사진" /></div> : null}
      </div>
      <div className={styles.reservation}>
        <div className={styles.reservationText}><h2>예약·이용 안내</h2><p>{course.reservationGuide ?? "방문 전 공식 연락처로 이용 가능 여부를 확인해 주세요."}</p></div>
        <div className={styles.reservationLink}>{reservationUrl ? <a href={reservationUrl} target="_blank" rel="noopener noreferrer" className={styles.reservationButton}>예약 사이트 바로가기</a> : <button type="button" disabled className={styles.reservationButton}>{course.reservationUrl ? "예약 링크 확인 필요" : "예약 링크 미등록"}</button>}</div>
      </div>
      <div className={styles.quickActions}>{quickActions}</div>
      <p className={styles.verification}>운영시간·요금·휴장은 변경될 수 있습니다. 방문 전 운영기관에 확인해 주세요.</p>
      <CourseDirections course={course} integrated={{ ...directions, onExpanded: expandDirections }} />
    </header>
    <nav className={styles.activityNav} aria-label="회원 활동 바로가기"><div><h2>이 구장에서 함께해요</h2><p>동호회 가입 없이도 이야기와 사진을 나눌 수 있어요.</p></div><div className={styles.activityLinks}>{[["course-stories", "이야기방"], ["course-activity-photos", "활동사진"], ["course-hall-of-fame", "명예의 전당"], ["course-clubs", "동호회"]].map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}</div></nav>
    <div className={styles.communityGrid}>
      <div className={styles.communityWeather}>{weather}</div>
      <div data-community-role="stories" id="course-stories" tabIndex={-1} className={styles.target}>{discussion}</div>
      <div data-community-role="photos" id="course-activity-photos" tabIndex={-1} className={styles.target}><CourseActivityPhotoSection courseKey={course.courseKey} courseName={course.name} courseType={course.courseType} initialSnapshot={initialMedia} compact /></div>
    </div>
    <section id="course-hall-of-fame" tabIndex={-1} className={`${styles.panel} ${styles.hall} ${styles.target}`} aria-labelledby="course-hall-of-fame-title"><div><h2 id="course-hall-of-fame-title">명예의 전당</h2><p>회원들의 기록과 성과를 확인해 보세요.</p></div><Link prefetch={false} href="/hall-of-fame" className={resourceButton}>전체 명예의 전당 보기</Link></section>
    <div id="course-clubs" tabIndex={-1} className={styles.target}><CourseClubsSection key={course.courseKey} courseKey={course.courseKey} initialClubs={initialCourseClubs} /></div>
    <CourseEvents events={overview.events} />
    <CourseResourcePanel courseKey={course.courseKey} screen={false} page={overview.resources} compact />
    {course.description || features.length ? <Card title="구장 소개"><p className="whitespace-pre-line text-base leading-8">{course.description}</p>{features.length ? <ul className="mt-3 flex flex-wrap gap-2" aria-label="골프장 특징">{features.map(label => <li key={label} className="rounded-full bg-pul-light px-3 py-1 text-sm text-pul-deep">{label}</li>)}</ul> : null}</Card> : null}
  </div>;
}
