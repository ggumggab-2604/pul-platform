import { ClubMemberFilters } from "@/components/clubs/manage/ClubMemberFilters";
import { ClubMemberDetailPanel } from "@/components/clubs/manage/ClubMemberDetailPanel";
import { ClubMemberList } from "@/components/clubs/manage/ClubMemberList";
import { ClubMemberManagementProvider } from "@/components/clubs/manage/ClubMemberManagementProvider";
import { Container } from "@/components/ui/Container";
import { getPublicClub } from "@/lib/clubs/clubDirectory";
import { resolveClubMemberManagement } from "@/lib/clubs/resolveClubMemberManagement";
import { createClient } from "@/lib/supabase/server";
import { ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

type ClubMemberManagementPageProps = { params: Promise<{ id: string }> };

export const metadata: Metadata = {
  title: "회원 관리",
  description: "동호회 운영진 회원 목록 확인 화면",
};

function ManagementUnavailable({ id }: { id: string }) {
  return (
    <div className="bg-pul-page">
      <Container className="max-w-4xl px-3 py-10 lg:py-16">
        <div className="rounded-xl border border-pul-border bg-white p-6 text-center shadow-[0_2px_10px_rgba(6,78,59,0.06)]">
          <ShieldAlert className="mx-auto h-11 w-11 text-pul-muted" aria-hidden="true" />
          <h1 className="mt-4 text-2xl font-bold text-foreground">관리 화면을 불러올 수 없습니다.</h1>
          <p className="mt-2 text-base text-pul-muted">잠시 후 동호회 상세에서 다시 시도해 주세요.</p>
          <Link
            href={`/clubs/${encodeURIComponent(id)}`}
            className="mt-5 inline-flex min-h-12 items-center justify-center rounded-lg bg-pul-deep px-5 font-bold text-white"
          >
            동호회 상세로 돌아가기
          </Link>
        </div>
      </Container>
    </div>
  );
}

export default async function ClubMemberManagementPage({ params }: ClubMemberManagementPageProps) {
  const { id } = await params;
  const club = await getPublicClub(await createClient(), id).catch(() => notFound());

  const management = await resolveClubMemberManagement(id);
  const pathname = `/clubs/${encodeURIComponent(id)}/manage/members`;
  if (management.authenticationStatus === "signedOut") {
    redirect(`/login?next=${encodeURIComponent(pathname)}`);
  }
  if (management.availability === "clubNotFound") notFound();
  if (
    management.availability !== "available" ||
    !management.clubUuid ||
    !management.authenticatedUserId
  ) {
    return <ManagementUnavailable id={id} />;
  }

  if (!management.canRead) {
    return (
      <div className="bg-pul-page">
        <Container className="max-w-4xl px-3 py-10 lg:py-16">
          <div className="rounded-xl border border-pul-border bg-white p-6 text-center shadow-[0_2px_10px_rgba(6,78,59,0.06)]">
            <ShieldAlert className="mx-auto h-11 w-11 text-pul-muted" aria-hidden="true" />
            <h1 className="mt-4 text-2xl font-bold text-foreground">회원 관리 권한이 없습니다.</h1>
            <p className="mt-2 text-base leading-7 text-pul-muted">
              이 화면은 권한이 확인된 동호회 운영진만 이용할 수 있습니다.
            </p>
            <Link
              href={`/clubs/${encodeURIComponent(id)}`}
              className="mt-5 inline-flex min-h-12 items-center justify-center rounded-lg bg-pul-deep px-5 font-bold text-white"
            >
              동호회 상세로 돌아가기
            </Link>
          </div>
        </Container>
      </div>
    );
  }

  const actorMembershipId = management.canManageClubRoles
    ? management.actorMembershipId
    : null;

  return (
    <div className="min-h-screen bg-pul-page">
      <Container className="max-w-6xl px-3 py-4 pb-20 lg:py-8">
        <header className="mb-5 rounded-xl border border-pul-border bg-white p-5 shadow-[0_2px_10px_rgba(6,78,59,0.06)]">
          <nav aria-label="경로" className="flex flex-wrap items-center gap-1.5 text-sm text-pul-muted">
            <Link href="/clubs" className="font-semibold hover:text-pul-point">동호회</Link>
            <span aria-hidden="true">›</span>
            <Link href={`/clubs/${encodeURIComponent(id)}`} className="font-semibold hover:text-pul-point">
              {club.name}
            </Link>
            <span aria-hidden="true">›</span>
            <span className="font-bold text-foreground">회원 관리</span>
          </nav>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[15px] font-bold text-pul-point">{club.name}</p>
              <h1 className="mt-1 text-2xl font-bold text-foreground lg:text-3xl">회원 관리</h1>
              <p className="mt-2 text-[15px] leading-7 text-pul-muted">
                회원의 표시명, 가입일, 회원 상태와 현재 역할을 확인할 수 있습니다.
              </p>
            </div>
            <Link
              href={`/clubs/${encodeURIComponent(id)}`}
              className="inline-flex min-h-12 items-center justify-center rounded-lg border border-pul-border bg-white px-4 font-bold text-pul-deep hover:bg-pul-light"
            >
              동호회 상세로 돌아가기
            </Link>
          </div>
        </header>

        <ClubMemberManagementProvider
          key={`${management.authenticatedUserId}:${management.clubUuid}:${actorMembershipId ?? "unavailable"}`}
          actorMembershipId={actorMembershipId}
          authenticatedUserId={management.authenticatedUserId}
          canManageClubRoles={management.canManageClubRoles}
          canManageMembershipStatus={management.canManageMembershipStatus}
          clubUuid={management.clubUuid}
        >
          <div className="space-y-5">
            <ClubMemberFilters />
            <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(20rem,2fr)]">
              <ClubMemberList />
              <ClubMemberDetailPanel />
            </div>
          </div>
        </ClubMemberManagementProvider>
      </Container>
    </div>
  );
}
