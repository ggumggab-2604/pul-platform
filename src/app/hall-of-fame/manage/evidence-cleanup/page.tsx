import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";

import { HallOfFameEvidenceCleanupPanel } from "@/components/hall-of-fame/manage/HallOfFameEvidenceCleanupPanel";
import { Container } from "@/components/ui/Container";
import { resolveHallOfFameEvidenceCleanupManagement } from "@/lib/hall-of-fame/hallOfFameEvidenceStorage";

export const metadata: Metadata = {
  title: "명예의 전당 증빙 정리",
  description: "정리 대기 중인 명예의 전당 증빙 Storage 객체를 안전하게 처리합니다.",
};

function AccessMessage({ loadFailed }: { loadFailed: boolean }) {
  return (
    <main className="min-h-screen bg-pul-page">
      <Container className="max-w-3xl px-3 py-12">
        <div className="rounded-2xl border border-pul-border bg-white p-7 text-center shadow-[0_3px_18px_rgba(6,78,59,0.07)]">
          <ShieldAlert className="mx-auto h-11 w-11 text-pul-muted" aria-hidden="true" />
          <h1 className="mt-4 text-2xl font-bold text-foreground">
            {loadFailed
              ? "증빙 정리 상태를 확인할 수 없습니다."
              : "증빙 정리 권한이 없습니다."}
          </h1>
          <p className="mt-2 text-base leading-7 text-pul-muted">
            {loadFailed
              ? "잠시 후 운영 관리센터에서 다시 시도해 주세요."
              : "이 화면은 승인된 플랫폼 관리자만 이용할 수 있습니다."}
          </p>
          <Link
            href="/manage"
            className="mt-5 inline-flex min-h-12 items-center justify-center rounded-xl bg-pul-deep px-5 font-bold text-white hover:bg-pul-point"
          >
            운영 관리센터로 돌아가기
          </Link>
        </div>
      </Container>
    </main>
  );
}

export default async function HallOfFameEvidenceCleanupPage() {
  const management = await resolveHallOfFameEvidenceCleanupManagement();
  if (management.authenticationStatus === "signedOut") {
    redirect("/login?next=/hall-of-fame/manage/evidence-cleanup");
  }
  if (management.availability !== "available") {
    return <AccessMessage loadFailed />;
  }
  if (!management.canManage) {
    return <AccessMessage loadFailed={false} />;
  }

  return (
    <main className="min-h-screen bg-pul-page">
      <Container className="max-w-5xl px-3 py-5 pb-20 sm:py-9">
        <header className="mb-5 rounded-2xl border border-pul-border bg-white p-5 shadow-[0_3px_18px_rgba(6,78,59,0.07)] sm:p-6">
          <nav aria-label="경로" className="flex flex-wrap items-center gap-1.5 text-sm text-pul-muted">
            <Link href="/manage" className="font-bold hover:text-pul-point">
              운영 관리센터
            </Link>
            <span aria-hidden="true">›</span>
            <span className="font-bold text-foreground">명예의 전당 증빙 정리</span>
          </nav>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-bold text-pul-point">플랫폼 관리자 전용</p>
              <h1 className="mt-1 text-2xl font-black text-foreground sm:text-3xl">
                명예의 전당 증빙 정리
              </h1>
              <p className="mt-2 max-w-3xl text-base leading-7 text-pul-muted">
                만료·실패·교체·삭제 상태의 private Evidence를 한 건씩 확인하고
                canonical 서버 절차로 정리합니다.
              </p>
            </div>
            <Link
              href="/hall-of-fame/manage"
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-pul-border bg-white px-4 font-bold text-pul-deep hover:bg-pul-light"
            >
              명예의 전당 운영으로 이동
            </Link>
          </div>
        </header>

        <HallOfFameEvidenceCleanupPanel candidates={management.candidates} />
      </Container>
    </main>
  );
}
