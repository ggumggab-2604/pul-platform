import { ClubDirectoryCorrectionInbox } from "@/components/clubs/manage/ClubDirectoryCorrectionInbox";
import { Container } from "@/components/ui/Container";
import { getPublicClub } from "@/lib/clubs/clubDirectory";
import {
  ClubDirectoryCorrectionError,
  getClubDirectoryCorrectionRequestForManagement,
  listClubDirectoryCorrectionRequestsForManagement,
  type ClubDirectoryCorrectionStatus,
} from "@/lib/clubs/clubDirectoryCorrectionRequests";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: "동호회 정보 수정 제보 관리",
  description: "동호회 운영진 정보 수정 제보 Inbox",
};

function parseStatus(value: string | string[] | undefined) {
  return value === "pending" || value === "completed" || value === "closed"
    ? (value as ClubDirectoryCorrectionStatus)
    : undefined;
}

function first(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

export default async function ClubDirectoryCorrectionsPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const pathname = `/clubs/${encodeURIComponent(id)}/manage/corrections`;
  const context = await getAuthenticatedSupabaseContext();
  if (!context) redirect(`/login?next=${encodeURIComponent(pathname)}`);
  const club = await getPublicClub(await createClient(), id).catch(() => notFound());
  const query = await searchParams;
  const status = parseStatus(query.status);
  const selected = first(query.request);

  const result = await (async () => {
    try {
      const page = await listClubDirectoryCorrectionRequestsForManagement(
        context.supabase,
        { clubPublicKey: id, status },
      );
      const detail = selected
        ? await getClubDirectoryCorrectionRequestForManagement(
            context.supabase,
            selected,
          )
        : undefined;
      if (detail && detail.clubPublicKey !== id) {
        throw new ClubDirectoryCorrectionError(
          "notFound",
          "선택한 제보를 이 동호회에서 확인할 수 없습니다.",
        );
      }
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
            <h1 className="text-2xl font-black text-foreground">
              {permissionDenied
                ? "정보 수정 제보 관리 권한이 없습니다."
                : "정보 수정 제보를 불러오지 못했습니다."}
            </h1>
            <p className="mt-3 leading-7 text-pul-muted">
              {permissionDenied
                ? "이 화면은 동호회 설정 관리 권한 또는 플랫폼 관리 권한이 있는 계정만 이용할 수 있습니다."
                : "잠시 후 동호회 상세에서 다시 시도해 주세요."}
            </p>
            <Link href={`/clubs/${encodeURIComponent(id)}`} className="mt-5 inline-flex min-h-12 items-center rounded-lg bg-pul-deep px-5 font-bold text-white">동호회 상세로 돌아가기</Link>
          </section>
        </Container>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-pul-page">
      <Container className="max-w-[1440px] px-3 py-5 pb-20 lg:py-8">
        <header className="mb-5 rounded-2xl border border-pul-border bg-white p-5 sm:p-6">
          <nav aria-label="경로" className="flex flex-wrap items-center gap-1.5 text-sm text-pul-muted">
            <Link href="/clubs" className="font-semibold hover:text-pul-point">동호회</Link><span aria-hidden="true">›</span>
            <Link href={`/clubs/${encodeURIComponent(id)}`} className="font-semibold hover:text-pul-point">{club.name}</Link><span aria-hidden="true">›</span>
            <span className="font-bold text-foreground">정보 수정 제보</span>
          </nav>
          <h1 className="mt-3 text-2xl font-black text-foreground sm:text-3xl">동호회 정보 수정 제보 관리</h1>
          <p className="mt-2 text-base leading-7 text-pul-muted">회원 제보를 확인하고 처리 상태만 기록합니다. 동호회 정보는 자동 변경되지 않습니다.</p>
        </header>
        <ClubDirectoryCorrectionInbox
          basePath={pathname}
          page={result.page}
          detail={result.detail}
          status={status}
        />
      </Container>
    </main>
  );
}
