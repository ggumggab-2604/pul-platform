import { ClubDirectoryCorrectionInbox } from "@/components/clubs/manage/ClubDirectoryCorrectionInbox";
import { Container } from "@/components/ui/Container";
import {
  ClubDirectoryCorrectionError,
  getClubDirectoryCorrectionRequestForManagement,
  listClubDirectoryCorrectionRequestsForManagement,
  type ClubDirectoryCorrectionStatus,
} from "@/lib/clubs/clubDirectoryCorrectionRequests";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: "동호회 정보 수정 제보",
  description: "PUL 동호회 정보 수정 제보 운영 Inbox",
};

function parseStatus(value: string | string[] | undefined) {
  return value === "pending" || value === "completed" || value === "closed"
    ? (value as ClubDirectoryCorrectionStatus)
    : undefined;
}

export default async function ClubDirectoryCorrectionsManagementPage({
  searchParams,
}: PageProps) {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) redirect("/login?next=/manage/club-directory-corrections");
  const query = await searchParams;
  const status = parseStatus(query.status);
  const selected = typeof query.request === "string" ? query.request : undefined;

  const result = await (async () => {
    try {
      const page = await listClubDirectoryCorrectionRequestsForManagement(
        context.supabase,
        { status },
      );
      const detail = selected
        ? await getClubDirectoryCorrectionRequestForManagement(
            context.supabase,
            selected,
          )
        : undefined;
      return { detail, page } as const;
    } catch (error) {
      return { error } as const;
    }
  })();

  if ("error" in result) {
    const permissionDenied = result.error instanceof ClubDirectoryCorrectionError &&
      result.error.code === "permission";
    return (
      <main className="min-h-screen bg-pul-page">
        <Container className="max-w-3xl px-3 py-12">
          <section className="rounded-2xl border border-pul-border bg-white p-6 text-center">
            <h1 className="text-2xl font-black text-foreground">{permissionDenied ? "동호회 정보 수정 제보 관리 권한이 없습니다." : "동호회 정보 수정 제보를 불러오지 못했습니다."}</h1>
            <p className="mt-3 leading-7 text-pul-muted">{permissionDenied ? "플랫폼 관리자 권한이 있는 계정으로 이용해 주세요." : "잠시 후 운영 관리센터에서 다시 시도해 주세요."}</p>
            <Link href="/manage" className="mt-5 inline-flex min-h-12 items-center rounded-lg bg-pul-deep px-5 font-bold text-white">운영 관리센터로 돌아가기</Link>
          </section>
        </Container>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-pul-page">
      <Container className="max-w-[1440px] px-3 py-5 pb-20 lg:py-8">
        <header className="mb-5 rounded-2xl border border-pul-border bg-white p-5 sm:p-6">
          <nav aria-label="경로" className="flex items-center gap-1.5 text-sm text-pul-muted"><Link href="/manage" className="font-semibold hover:text-pul-point">운영 관리센터</Link><span aria-hidden="true">›</span><span className="font-bold text-foreground">동호회 정보 수정 제보</span></nav>
          <h1 className="mt-3 text-2xl font-black text-foreground sm:text-3xl">동호회 정보 수정 제보 Inbox</h1>
          <p className="mt-2 text-base leading-7 text-pul-muted">전체 동호회의 회원 제보를 확인하고 처리 상태를 기록합니다. 동호회 정보는 자동 변경되지 않습니다.</p>
        </header>
        <ClubDirectoryCorrectionInbox
          basePath="/manage/club-directory-corrections"
          page={result.page}
          detail={result.detail}
          status={status}
        />
      </Container>
    </main>
  );
}
