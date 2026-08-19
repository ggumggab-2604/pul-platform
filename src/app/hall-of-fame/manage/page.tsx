import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";

import { HallOfFameOperatorDetail } from "@/components/hall-of-fame/manage/HallOfFameOperatorDetail";
import { HallOfFameOperatorProvider } from "@/components/hall-of-fame/manage/HallOfFameOperatorProvider";
import { HallOfFameOperatorQueue } from "@/components/hall-of-fame/manage/HallOfFameOperatorQueue";
import { Container } from "@/components/ui/Container";
import { resolveHallOfFameOperatorManagement } from "@/lib/hall-of-fame/resolveHallOfFameOperatorManagement";

export const metadata: Metadata = {
  title: "명예의 전당 운영",
  description: "명예의 전당 정정·이의·신고 요청 운영 화면",
};

function AccessMessage({ loadFailed }: { loadFailed: boolean }) {
  return (
    <div className="min-h-screen bg-pul-page">
      <Container className="max-w-3xl px-3 py-12">
        <div className="rounded-2xl border border-pul-border bg-white p-7 text-center shadow-[0_3px_18px_rgba(6,78,59,0.07)]">
          <ShieldAlert className="mx-auto h-11 w-11 text-pul-muted" aria-hidden="true" />
          <h1 className="mt-4 text-2xl font-bold text-foreground">
            {loadFailed ? "운영 권한을 확인할 수 없습니다." : "명예의 전당 운영 권한이 없습니다."}
          </h1>
          <p className="mt-2 text-base leading-7 text-pul-muted">
            {loadFailed
              ? "잠시 후 명예의 전당에서 다시 시도해 주세요."
              : "이 화면은 승인된 플랫폼 운영자만 이용할 수 있습니다."}
          </p>
          <Link href="/hall-of-fame" className="mt-5 inline-flex min-h-12 items-center justify-center rounded-xl bg-pul-deep px-5 font-bold text-white hover:bg-pul-point">
            명예의 전당으로 돌아가기
          </Link>
        </div>
      </Container>
    </div>
  );
}

export default async function HallOfFameOperatorManagementPage() {
  const management = await resolveHallOfFameOperatorManagement();
  if (management.authenticationStatus === "signedOut") {
    redirect("/login?next=/hall-of-fame/manage");
  }
  if (
    management.availability !== "available" ||
    !management.authenticatedUserId
  ) {
    return <AccessMessage loadFailed />;
  }
  if (!management.permissions.canRead) return <AccessMessage loadFailed={false} />;

  return (
    <div className="min-h-screen bg-pul-page">
      <Container className="max-w-[1440px] px-3 py-5 pb-20 lg:py-9">
        <header className="mb-5 rounded-2xl border border-pul-border bg-white p-5 shadow-[0_3px_18px_rgba(6,78,59,0.07)] sm:p-6">
          <nav aria-label="경로" className="flex flex-wrap items-center gap-1.5 text-sm text-pul-muted">
            <Link href="/hall-of-fame" className="font-bold hover:text-pul-point">명예의 전당</Link>
            <span aria-hidden="true">›</span>
            <span className="font-bold text-foreground">운영 요청 관리</span>
          </nav>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-bold text-pul-point">플랫폼 운영자 전용</p>
              <h1 className="mt-1 text-2xl font-black text-foreground sm:text-3xl">명예의 전당 요청 관리</h1>
              <p className="mt-2 max-w-3xl text-base leading-7 text-pul-muted">
                회원의 정정·이의·신고 요청을 검토하고 현재 권한에 맞는 처리를 진행하세요.
              </p>
            </div>
            <Link href="/hall-of-fame" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-pul-border bg-white px-4 font-bold text-pul-deep hover:bg-pul-light">
              명예의 전당으로 돌아가기
            </Link>
          </div>
        </header>

        <HallOfFameOperatorProvider
          authenticatedUserId={management.authenticatedUserId}
          permissions={management.permissions}
        >
          <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(320px,0.82fr)_minmax(0,1.45fr)]">
            <HallOfFameOperatorQueue />
            <HallOfFameOperatorDetail />
          </div>
        </HallOfFameOperatorProvider>
      </Container>
    </div>
  );
}
