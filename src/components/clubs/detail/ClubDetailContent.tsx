import {SpecialRecords} from "@/components/hall-of-fame/SpecialRecords";
import type {ReactNode} from "react";
import Link from "next/link";
import {MessagingSessionBoundary as ClubViewerBoundary} from "@/components/messaging/MessagingSessionBoundary";
import type {ClubProfileSnapshot} from "@/lib/clubs/clubProfile";
import type {ClubGallery} from "@/lib/clubs/clubGallery";
import type {PublicCourse} from "@/lib/courses/courseDirectory";
import type {CourseOverview,CourseEvent} from "@/lib/courses/courseContent";
import type {ClubCoreContentSnapshot} from "@/lib/clubs/clubCoreContent";
import type {ClubEventParticipationSnapshot} from "@/lib/clubs/clubEventParticipation";
import type {ClubActivityPage} from "@/lib/clubs/clubActivities";
import {ClubActivitiesPanel} from "./ClubActivitiesPanel";
import type {ClubDetailData,ClubJoinApplicationRuntimeIdentity} from "@/types";
import {ClubGalleryPanel} from "./ClubGalleryPanel";
import {ClubInvitePanel} from "./ClubInvitePanel";
import {ClubDetailActions} from "./ClubDetailActions";
import {ClubCoreContentProvider} from "./ClubCoreContentProvider";

import {ClubJoinApplicationProvider} from "./ClubJoinApplicationProvider";
import {ClubJoinInquiryProvider} from "./ClubJoinInquiryProvider";
import {ClubParticipationRequestProvider} from "./ClubParticipationRequestProvider";
import {ClubParticipationEntry} from "./ClubParticipationEntry";
import {ClubLinkedCourseProvider,ClubLinkedCourses,ClubLinkedCourseResources,ClubLinkedCourseEvents} from "./ClubLinkedCourses";
import {clubDetailRecruitStatusLabels,recruitStatusStyles} from "@/data/clubData";
import styles from "./ClubDetail.module.css";
type Props={affiliationEntry?:ReactNode;federationLink?:ReactNode;viewerId?:string;profileSnapshot:ClubProfileSnapshot;gallery:ClubGallery|null;courses:PublicCourse[];overviews:Record<string,CourseOverview>;courseFailed:boolean;overviewFailed:string[];courseEvents:CourseEvent[];savedProfile:ReactNode;weather:ReactNode;initialExistingMember:boolean;detail:ClubDetailData;applicationIdentity:ClubJoinApplicationRuntimeIdentity;clubUuid?:string;coreContent:ClubCoreContentSnapshot;eventParticipation:ClubEventParticipationSnapshot;activities:ClubActivityPage|null;membershipApplicationsManagementHref?:string;memberManagementHref?:string;correctionManagementHref?:string};
export function ClubDetailContent({affiliationEntry,federationLink,viewerId,detail,profileSnapshot,gallery,courses,overviews,courseFailed,overviewFailed,courseEvents,savedProfile,weather,initialExistingMember,applicationIdentity,clubUuid,coreContent,eventParticipation,activities,membershipApplicationsManagementHref,memberManagementHref,correctionManagementHref}:Props){
 const {club}=detail;
 const managementLinks=viewerId&&profileSnapshot.viewer_authenticated?[
  memberManagementHref?{href:memberManagementHref,label:"회원 관리"}:null,
  membershipApplicationsManagementHref?{href:membershipApplicationsManagementHref,label:"가입 심사"}:null,
  profileSnapshot.can_manage?{href:"/clubs/"+club.id+"/edit",label:"동호회 정보 수정"}:null,
  profileSnapshot.can_manage?{href:"/clubs/"+club.id+"/edit#club-course-links",label:"구장 연결 관리"}:null,
  profileSnapshot.can_manage_inquiries?{href:"/clubs/"+club.id+"/manage/inquiries",label:"가입 문의 관리"}:null,
  gallery?.can_manage?{href:"#club-photo-management",label:"사진·신고 관리"}:null,
  correctionManagementHref?{href:correctionManagementHref,label:"정보 제보 관리"}:null,
 ].filter((link):link is {href:string;label:string}=>link!==null):[];
 const actions=<>{affiliationEntry}<ClubDetailActions club={club} variant="top" managementLinks={managementLinks} managementNotice={profileSnapshot.can_manage&&profileSnapshot.link_conflict?"기존 복수 구장 연결은 보존됩니다. 변경이 필요하면 구장 연결 관리에서 확인해 주세요.":undefined}/><ClubInvitePanel clubKey={club.id} isMember={club.viewerMembership==='active'}/><ClubParticipationEntry requestType="operatorVerification"/></>;
 return <ClubJoinInquiryProvider initialExistingMember={initialExistingMember} club={club} identity={applicationIdentity}>
 <ClubJoinApplicationProvider viewerId={viewerId} club={club} rules={profileSnapshot.profile.rules??""} applicationIdentity={applicationIdentity}>
 <ClubParticipationRequestProvider club={club} requestContext={detail.participationRequestContext}>

 <ClubLinkedCourseProvider key={courses.map(c=>c.courseKey).join(":")} courses={courses} overviews={overviews} failed={courseFailed} overviewFailed={overviewFailed}>
 <main data-testid="club-detail-main" className={styles.root}>
 <section className={styles.hero} aria-label="동호회 소개와 대표사진">
 <div className="min-w-0"><span className={"inline-block rounded-md px-3 py-1 text-sm font-semibold "+recruitStatusStyles[club.recruitStatus]}>{clubDetailRecruitStatusLabels[club.recruitStatus]}</span>
 <h1 className={styles.name}>{club.name}</h1><p className="mt-3 whitespace-pre-wrap break-words text-pul-muted">{club.detailSummary??club.description}</p>
 <p className="mt-3 text-base font-semibold text-pul-deep">{club.regionLabel}</p>{federationLink}
 <dl className={styles.facts}>{club.directoryDataAvailability?.schedule!==false?<div><dt className="text-sm text-pul-muted">정기 모임</dt><dd>{club.scheduleLabel} · {club.time}</dd></div>:null}<div><dt className="text-sm text-pul-muted">PUL 가입 회원</dt><dd>{club.memberCount}명</dd></div></dl>
 <div className="mt-5">{viewerId?<ClubViewerBoundary viewerId={viewerId}>{actions}</ClubViewerBoundary>:actions}</div>
 </div><div className="min-w-0" aria-label="동호회 사진과 등록 안내"><ClubGalleryPanel viewerId={viewerId} clubKey={club.id} clubId={clubUuid} initial={gallery} courses={courses.filter(c=>c.courseType==='field').map(c=>({courseKey:c.courseKey,name:c.name}))}/></div>
 </section>
 <ClubLinkedCourses/>
 <nav className={styles.nav} aria-label="동호회 바로가기">{[["club-board","게시판"],["club-gallery","사진"],["club-activities","활동기록"],["club-honor","명예의 전당"],["club-official-events","모임·대회 일정"],["club-course-materials","코스 자료"],["club-info","소개·가입 조건"]].map(([id,label])=><a key={id} href={"#"+id}>{label}</a>)}</nav>
 <ClubCoreContentProvider detail={detail} clubUuid={clubUuid} initialSnapshot={coreContent} initialParticipation={eventParticipation} weather={weather} viewerId={viewerId} postingCourses={courses.filter(c=>c.courseType==='field').map(c=>({courseKey:c.courseKey,name:c.name}))} photos={<ClubActivitiesPanel viewerId={viewerId} clubKey={club.id} clubId={clubUuid} initial={activities} courses={courses.filter(c=>c.courseType==='field').map(c=>({courseKey:c.courseKey,name:c.name}))} canNotice={coreContent.capabilities.canManageNotice} events={coreContent.officialEvents.map(e=>({id:e.id,title:e.title,startsAt:e.startsAt,visibility:e.visibility==='public'?'public':'club_members'}))}/> } afterBoard={<section id="club-honor" className={styles.panel}><div className={styles.heading}><h2>명예의 전당</h2><Link className="inline-flex min-h-11 items-center rounded-lg border border-pul-border px-4 text-sm font-semibold" href="/hall-of-fame">전체 명예의 전당</Link></div><div className="mt-4"><SpecialRecords clubKey={club.id} compactEmpty/><div className="mt-5 border-t border-pul-border pt-4"><h3 className="font-bold text-pul-deep">회원 성적</h3><Link className="mt-2 inline-flex min-h-11 items-center rounded-lg border border-pul-border px-4 font-semibold text-pul-point" href={`/clubs/${encodeURIComponent(club.id)}/scores`}>월례회 성적 보기</Link><Link className="ml-2 mt-2 inline-flex min-h-11 items-center rounded-lg border border-pul-border px-4 font-semibold text-pul-point" href={`/clubs/${encodeURIComponent(club.id)}/tournaments`}>대회 성적 보기</Link><Link className="ml-2 mt-2 inline-flex min-h-11 items-center rounded-lg border border-pul-border px-4 font-semibold text-pul-point" href={`/hall-of-fame/awards?club=${encodeURIComponent(club.id)}`}>사진 수상 소식</Link></div></div></section>} courseEvents={<ClubLinkedCourseEvents events={courseEvents} failed={overviewFailed.length>0}/>}/>
 <ClubLinkedCourseResources/>
 {savedProfile}
 </main></ClubLinkedCourseProvider></ClubParticipationRequestProvider></ClubJoinApplicationProvider></ClubJoinInquiryProvider>;
}

