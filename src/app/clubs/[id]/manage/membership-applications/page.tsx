import { ClubMembershipApplicationDetail } from "@/components/clubs/manage/ClubMembershipApplicationDetail";
import { ClubMembershipApplicationList } from "@/components/clubs/manage/ClubMembershipApplicationList";
import { ClubMembershipApplicationManagementProvider } from "@/components/clubs/manage/ClubMembershipApplicationManagementProvider";
import { Container } from "@/components/ui/Container";
import { getPublicClub } from "@/lib/clubs/clubDirectory";
import { resolveClubMembershipApplicationManagement } from "@/lib/clubs/resolveClubMembershipApplicationManagement";
import { createClient } from "@/lib/supabase/server";
import { ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

type ManagementPageProps = { params: Promise<{ id: string }> };

export const metadata: Metadata = {
  title: "가입 신청 관리",
  description: "동호회 운영진 가입 신청 처리 화면",
};

export default async function ClubMembershipApplicationsManagementPage({ params }: ManagementPageProps) {
  const { id } = await params;
  const club = await getPublicClub(await createClient(), id).catch(() => notFound());

  const management = await resolveClubMembershipApplicationManagement(id);
  const pathname = `/clubs/${encodeURIComponent(id)}/manage/membership-applications`;
  if (management.authenticationStatus === "signedOut") redirect(`/login?next=${encodeURIComponent(pathname)}`);
  if (management.availability === "clubNotFound") notFound();

  if (management.availability !== "available" || !management.clubUuid || !management.authenticatedUserId) {
    return (
      <div className="bg-pul-page">
        <Container className="max-w-4xl px-3 py-10 lg:py-16">
          <div className="rounded-xl border border-pul-border bg-white p-6 text-center shadow-[0_2px_10px_rgba(6,78,59,0.06)]">
            <ShieldAlert className="mx-auto h-11 w-11 text-pul-muted" aria-hidden="true" />
            <h1 className="mt-4 text-2xl font-bold text-foreground">관리 화면을 불러올 수 없습니다.</h1>
            <p className="mt-2 text-base text-pul-muted">잠시 후 동호회 상세에서 다시 시도해 주세요.</p>
            <Link href={`/clubs/${encodeURIComponent(id)}`} className="mt-5 inline-flex min-h-12 items-center justify-center rounded-lg bg-pul-deep px-5 font-bold text-white">동호회 상세로 돌아가기</Link>
          </div>
        </Container>
      </div>
    );
  }

  if (!management.permissions.canRead) {
    return (
      <div className="bg-pul-page">
        <Container className="max-w-4xl px-3 py-10 lg:py-16">
          <div className="rounded-xl border border-pul-border bg-white p-6 text-center shadow-[0_2px_10px_rgba(6,78,59,0.06)]">
            <ShieldAlert className="mx-auto h-11 w-11 text-pul-muted" aria-hidden="true" />
            <h1 className="mt-4 text-2xl font-bold text-foreground">가입 신청 관리 권한이 없습니다.</h1>
            <p className="mt-2 text-base leading-7 text-pul-muted">이 화면은 권한이 확인된 동호회 운영진만 이용할 수 있습니다.</p>
            <Link href={`/clubs/${encodeURIComponent(id)}`} className="mt-5 inline-flex min-h-12 items-center justify-center rounded-lg bg-pul-deep px-5 font-bold text-white">동호회 상세로 돌아가기</Link>
          </div>
        </Container>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pul-page">
      <Container className="max-w-[1440px] px-3 py-4 pb-20 lg:py-8">
        <header className="mb-5 rounded-xl border border-pul-border bg-white p-5 shadow-[0_2px_10px_rgba(6,78,59,0.06)]">
          <nav aria-label="경로" className="flex flex-wrap items-center gap-1.5 text-sm text-pul-muted">
            <Link href="/clubs" className="font-semibold hover:text-pul-point">동호회</Link><span aria-hidden="true">›</span>
            <Link href={`/clubs/${encodeURIComponent(id)}`} className="font-semibold hover:text-pul-point">{club.name}</Link><span aria-hidden="true">›</span>
            <span className="font-bold text-foreground">가입 신청 관리</span>
          </nav>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[15px] font-bold text-pul-point">{club.name}</p>
              <h1 className="mt-1 text-2xl font-bold text-foreground lg:text-3xl">가입 신청 관리</h1>
              <p className="mt-2 text-[15px] leading-7 text-pul-muted">신청 내용을 확인하고 현재 권한에 맞는 처리를 진행하세요.</p>
            </div>
            <Link href={`/clubs/${encodeURIComponent(id)}`} className="inline-flex min-h-12 items-center justify-center rounded-lg border border-pul-border bg-white px-4 font-bold text-pul-deep hover:bg-pul-light">동호회 상세로 돌아가기</Link>
          </div>
        </header>

        <ClubMembershipApplicationManagementProvider
          authenticatedUserId={management.authenticatedUserId}
          clubUuid={management.clubUuid}
          permissions={management.permissions}
        >
          <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(320px,0.82fr)_minmax(0,1.45fr)]">
            <ClubMembershipApplicationList />
            <ClubMembershipApplicationDetail />
          </div>
        </ClubMembershipApplicationManagementProvider>
      </Container>
    </div>
  );
}
