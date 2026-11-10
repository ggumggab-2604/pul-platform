import { federationHref, getMyClubAffiliations } from "@/lib/clubs/clubAffiliations";
import { redirect } from "next/navigation";
import {getClubRoleSummary} from '@/lib/clubs/clubRoleSummary';
import { getClubProfile } from "@/lib/clubs/clubProfile";
import { getClubGallery } from "@/lib/clubs/clubGallery";
import { getPublicCourse } from "@/lib/courses/courseDirectory";
import { getOperatingState } from "@/lib/courses/courseSteward";
import { getCourseOverview } from "@/lib/courses/courseContent";
import { ClubSavedProfile } from "@/components/clubs/detail/ClubSavedProfile";
import { CourseLocationWeather } from "@/components/courses/detail/CourseLocationWeather";
import { ClubDetailContent } from "@/components/clubs/detail/ClubDetailContent";
import { ClubHonorTournaments } from "@/components/clubs/detail/ClubHonorTournaments";
import { Container } from "@/components/ui/Container";
import {
  ClubDirectoryError,
  createPublicClubDetailData,
  getPublicClub,
} from "@/lib/clubs/clubDirectory";
import { resolveClubCoreContent } from "@/lib/clubs/resolveClubCoreContent";
import { resolveClubEventParticipation } from "@/lib/clubs/resolveClubEventParticipation";
import {listClubActivities} from "@/lib/clubs/clubActivities";
import clubStyles from "@/components/clubs/detail/ClubDetail.module.css";
import { resolveClubMemberManagement } from "@/lib/clubs/resolveClubMemberManagement";
import { resolveClubMembershipApplicationIdentity } from "@/lib/clubs/resolveClubMembershipApplication";
import { resolveClubMembershipApplicationManagement } from "@/lib/clubs/resolveClubMembershipApplicationManagement";
import { resolveClubDirectoryCorrectionManagement } from "@/lib/clubs/resolveClubDirectoryCorrectionManagement";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";

type ClubDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{join?:string}>;
};

const getClubByPublicKey = cache(async (publicKey: string) =>
  getPublicClub(await createClient(), publicKey),
);

export async function generateMetadata({ params }: ClubDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  let club;
  try {
    club = await getClubByPublicKey(id);
  } catch {
    return { title: "동호회 정보" };
  }
  return {
    title: club.name,
    description: club.summary ?? `${club.regionLabel} ${club.name} 활동 및 가입 정보`,
  };
}

export default async function ClubDetailPage({ params, searchParams }: ClubDetailPageProps) {
  const { id } = await params;
  if (id.startsWith("federation-")) {
    const {data: region} = await (await createClient()).rpc("get_club_federation_region", {p_club_key:id});
    if (typeof region === "string") redirect(federationHref(region));
  }
  let publicClub;
  try {
    publicClub = await getClubByPublicKey(id);
  } catch (error) {
    if (error instanceof ClubDirectoryError && error.code === "notFound") notFound();
    throw error;
  }
  const initialExistingMember=(await searchParams).join === "existing";
  const detail = createPublicClubDetailData(publicClub);
  const client=await createClient();
  const {data:{user}}=await client.auth.getUser();
  const affiliations=user?await getMyClubAffiliations(client,user.id).catch(()=>null):null;
  const ownAffiliation=affiliations?.memberships.find(c=>c.club_key===id);
  const profile=await getClubProfile(client,id).catch(()=>null);
  if(!profile)return <Container className="py-10"><h1 className="text-2xl font-bold">{publicClub.name}</h1><p className="my-4" role="alert">동호회 상세 정보를 불러오지 못했습니다.</p><Link href={"/clubs/"+encodeURIComponent(id)} className="inline-flex min-h-11 items-center rounded border px-4">다시 불러오기</Link></Container>;
  const roleSummaryEligible=!!user&&(profile.viewer_membership==='active'||profile.can_manage||profile.can_manage_inquiries);
  const roleSummary=roleSummaryEligible?await getClubRoleSummary(client,id).catch(()=>null):null;
  const gallery=await getClubGallery(client,id).catch(()=>null);
  const courseResults=await Promise.allSettled(profile.courses.filter(c=>c.course_status==='active').map(c=>getPublicCourse(client,c.course_key)));
  const baseCourses=courseResults.flatMap(r=>r.status==='fulfilled'?[r.value]:[]);
  const operatingResults=await Promise.allSettled(baseCourses.map(c=>getOperatingState(client,c.courseKey)));
  const courses=baseCourses.map((c,i)=>({...c,operatingState:operatingResults[i].status==="fulfilled"?operatingResults[i].value:undefined}));
  const courseFailed=courseResults.some(r=>r.status==='rejected');
  const eventResults=await Promise.allSettled(courses.map(c=>getCourseOverview(client,c.courseKey)));
  const courseEvents=[...new Map(eventResults.flatMap(r=>r.status==='fulfilled'?r.value.events:[]).map(e=>[e.key,e])).values()];
  const overviews=Object.fromEntries(eventResults.flatMap((r,i)=>r.status==="fulfilled"?[[courses[i].courseKey,r.value]]:[]));
  const overviewFailed=eventResults.flatMap((r,i)=>r.status==="rejected"?[courses[i].courseKey]:[]);
  const fields=courses.filter(c=>c.courseType==='field');
  const weatherCourse=fields.length===1?fields[0]:null;
  const weatherPanel=weatherCourse?<div className={clubStyles.weather}><p className="mb-2 text-sm font-semibold text-pul-deep">야외 활동 구장 · {weatherCourse.name}</p><CourseLocationWeather course={weatherCourse} plainLink/></div>:<section className="rounded-xl border border-pul-border bg-white p-5" aria-label="활동 구장 날씨"><h2 className="font-bold">활동 구장 날씨</h2><p className="mt-2 text-sm text-pul-muted">{fields.length>1?'활동 구장을 선택한 뒤 구장 상세에서 날씨를 확인해 주세요.':'야외 활동 구장을 연결하면 날씨를 확인할 수 있습니다.'}</p></section>;


  const [applicationIdentity, managementIdentity, memberManagementIdentity] = await Promise.all([
    resolveClubMembershipApplicationIdentity(id),
    resolveClubMembershipApplicationManagement(id),
    resolveClubMemberManagement(id),
  ]);
  const [
    coreContent,
    eventParticipation,
    activities,
    correctionManagementIdentity,
  ] = await Promise.all([
    resolveClubCoreContent(id, applicationIdentity.clubUuid),
    resolveClubEventParticipation(applicationIdentity.clubUuid),
    listClubActivities(client,id,2).catch(()=>null),
    applicationIdentity.clubUuid
      ? resolveClubDirectoryCorrectionManagement(applicationIdentity.clubUuid)
      : Promise.resolve(undefined),
  ]);
  const runtimeDetail = {
    ...detail,
    club: {
      ...detail.club,
      viewerAuthenticated: profile.viewer_authenticated,
      viewerMembership: profile.viewer_membership,
      viewerApplicationStatus: profile.viewer_application_status,
      homeCourse: profile.courses.map(c=>c.name).join(' · ')||detail.club.homeCourse,
      memberCount: profile.pul_member_count,
      scheduleLabel: profile.profile.meetingRule||'정기 모임 미등록',
      time: profile.profile.meetingTime||'시간 미등록',
      directoryDataAvailability:{homeCourse:profile.courses.length>0,schedule:!!profile.profile.meetingRule,memberCount:true},
      recruitStatus:
        applicationIdentity.featureAvailability === "available" && applicationIdentity.recruitmentStatus
          ? applicationIdentity.recruitmentStatus
          : detail.club.recruitStatus,
    },
    notices: [],
    posts: [],
    officialEvents: [],
    photos: [],
    recentActivities: [],
  };

  return (
    <div className="bg-pul-page overflow-visible">
      <Container className="py-4 pb-10 lg:py-8 lg:pb-16">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <nav aria-label="경로" className="flex flex-wrap items-center gap-1.5 text-sm text-pul-muted lg:text-base">
            <Link href="/" className="font-medium hover:text-pul-point">홈</Link>
            <span aria-hidden="true">›</span>
            <Link href="/clubs" className="font-medium hover:text-pul-point">동호회</Link>
            <span aria-hidden="true">›</span>
            <span className="font-semibold text-foreground">{publicClub.name}</span>
          </nav>
          <Link href="/clubs" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-pul-border bg-white px-4 text-sm font-bold text-pul-deep hover:bg-pul-light lg:text-base">동호회 목록으로</Link>
        </div>
        <ClubDetailContent
          roleSummaryEligible={roleSummaryEligible}
          roleSummary={roleSummary}
          viewerId={user?.id}
          courses={courses}
          overviews={overviews}
          courseFailed={courseFailed}
          overviewFailed={overviewFailed}
          courseEvents={courseEvents}
          honorTournaments={<Suspense fallback={<p role="status">대회 일정과 성적을 불러오는 중입니다.</p>}>
            <ClubHonorTournaments clubKey={id} courses={courses} overviews={overviews}
              scheduleFailed={courseFailed || overviewFailed.length > 0}
              isMember={profile.viewer_membership === "active"} signedIn={!!user} />
          </Suspense>}
          initialExistingMember={initialExistingMember}
          detail={runtimeDetail}
          profileSnapshot={profile}
          gallery={gallery}
          federationLink={publicClub.region?<Link className="inline-flex min-h-11 items-center text-sm font-semibold text-pul-point" href={federationHref(publicClub.region)}>이 동호회의 지역 연합 · {publicClub.region}</Link>:null}
          affiliationEntry={user?<div className="mb-3 text-sm"><p>{ownAffiliation?.is_primary?'내 주 소속 동호회':ownAffiliation?'내 다른 소속 동호회':'주 소속은 가입 승인 후 지정할 수 있습니다.'}</p><Link className="inline-flex min-h-11 items-center font-semibold text-pul-point" href={'/my/clubs?choose='+encodeURIComponent(id)}>{ownAffiliation?.eligible&&!ownAffiliation.is_primary?'이 동호회를 주 소속으로 지정':'내 주 소속·연합 확인'}</Link>{affiliations?.federations.filter(f=>f.automatic||f.independent).map(f=><Link key={f.region} className="ml-3 inline-flex min-h-11 items-center font-semibold text-pul-point" href={federationHref(f.region)}>내 지역 연합 · {f.region}</Link>)}</div>:null}
          savedProfile={<ClubSavedProfile snapshot={profile} viewerId={user?.id}/>}
          weather={weatherPanel}
          applicationIdentity={applicationIdentity}
          clubUuid={applicationIdentity.clubUuid}
          coreContent={coreContent}
          eventParticipation={eventParticipation}
          activities={activities}
          membershipApplicationsManagementHref={
            managementIdentity.availability === "available" && managementIdentity.permissions.canRead
              ? `/clubs/${encodeURIComponent(id)}/manage/membership-applications`
              : undefined
          }
          memberManagementHref={
            memberManagementIdentity.availability === "available" && memberManagementIdentity.canRead
              ? `/clubs/${encodeURIComponent(id)}/manage/members`
              : undefined
          }
          correctionManagementHref={
            correctionManagementIdentity?.availability === "available" &&
            correctionManagementIdentity.canManage
              ? `/clubs/${encodeURIComponent(id)}/manage/corrections`
              : undefined
          }
        />
      </Container>
    </div>
  );
}
