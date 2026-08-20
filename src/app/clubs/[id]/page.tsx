import { ClubDetailContent } from "@/components/clubs/detail/ClubDetailContent";
import { Container } from "@/components/ui/Container";
import {
  ClubDirectoryError,
  createPublicClubDetailData,
  getPublicClub,
} from "@/lib/clubs/clubDirectory";
import { resolveClubCoreContent } from "@/lib/clubs/resolveClubCoreContent";
import { resolveClubMedia } from "@/lib/clubs/resolveClubMedia";
import { resolveClubMemberManagement } from "@/lib/clubs/resolveClubMemberManagement";
import { resolveClubMembershipApplicationIdentity } from "@/lib/clubs/resolveClubMembershipApplication";
import { resolveClubMembershipApplicationManagement } from "@/lib/clubs/resolveClubMembershipApplicationManagement";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

type ClubDetailPageProps = {
  params: Promise<{ id: string }>;
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

export default async function ClubDetailPage({ params }: ClubDetailPageProps) {
  const { id } = await params;
  let publicClub;
  try {
    publicClub = await getClubByPublicKey(id);
  } catch (error) {
    if (error instanceof ClubDirectoryError && error.code === "notFound") notFound();
    throw error;
  }
  const detail = createPublicClubDetailData(publicClub);

  const [applicationIdentity, managementIdentity, memberManagementIdentity] = await Promise.all([
    resolveClubMembershipApplicationIdentity(id),
    resolveClubMembershipApplicationManagement(id),
    resolveClubMemberManagement(id),
  ]);
  const [coreContent, mediaContent] = await Promise.all([
    resolveClubCoreContent(id, applicationIdentity.clubUuid),
    resolveClubMedia(id, applicationIdentity.clubUuid),
  ]);
  const runtimeDetail = {
    ...detail,
    club: {
      ...detail.club,
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
      <Container className="max-w-6xl px-3 py-4 pb-10 lg:py-8 lg:pb-16">
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
          detail={runtimeDetail}
          applicationIdentity={applicationIdentity}
          clubUuid={applicationIdentity.clubUuid}
          coreContent={coreContent}
          mediaContent={mediaContent}
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
        />
      </Container>
    </div>
  );
}
