import { CertificationStudyBoardSection } from "@/components/certification/CertificationStudyBoardSection";
import { Container } from "@/components/ui/Container";
import {
  CertificationStudyPostError,
  listPublicCertificationStudyPosts,
  type CertificationStudyPage,
} from "@/lib/certification/certificationStudyPosts";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "시험 준비 이야기방",
  description: "파크골프 자격증·심판 시험 준비 경험과 궁금한 점을 나누는 회원 게시판입니다.",
};

type Props = {
  searchParams: Promise<{ page?: string | string[] }>;
};

const PAGE_SIZE = 20;

function pageNumber(value: string | string[] | undefined) {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) return 1;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : 1;
}

function emptyPage(offset: number): CertificationStudyPage {
  return {
    items: [],
    total: 0,
    limit: PAGE_SIZE,
    offset,
    hasMore: false,
  };
}

export default async function CertificationStudyPageRoute({ searchParams }: Props) {
  const query = await searchParams;
  const currentPage = pageNumber(query.page);
  const offset = (currentPage - 1) * PAGE_SIZE;
  let page = emptyPage(offset);
  let error: string | null = null;

  try {
    page = await listPublicCertificationStudyPosts(await createClient(), PAGE_SIZE, offset);
  } catch (reason) {
    error = reason instanceof CertificationStudyPostError
      ? reason.userMessage
      : "시험 준비 게시글을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }

  if (!error && currentPage > 1 && page.items.length === 0) notFound();

  const returnPath = currentPage > 1
    ? `/certification/study?page=${currentPage}`
    : "/certification/study";

  return (
    <div className="bg-pul-page">
      <Container className="max-w-4xl px-3 py-5 sm:py-8">
        <nav aria-label="경로" className="mb-4 flex flex-wrap items-center gap-1.5 text-sm text-pul-muted">
          <Link href="/certification" className="font-medium hover:text-pul-point">
            자격증·심판
          </Link>
          <span aria-hidden="true">›</span>
          <span className="font-semibold text-foreground">시험 준비 이야기방</span>
        </nav>

        <CertificationStudyBoardSection
          page={page}
          returnPath={returnPath}
          error={error}
          full
        />

        {!error && (currentPage > 1 || page.hasMore) ? (
          <nav aria-label="시험 준비 이야기방 페이지" className="mt-5 flex items-center justify-between gap-3">
            {currentPage > 1 ? (
              <Link
                href={currentPage === 2 ? "/certification/study" : `/certification/study?page=${currentPage - 1}`}
                className="inline-flex min-h-11 items-center rounded-lg border border-pul-border bg-white px-4 font-bold text-pul-deep"
              >
                이전
              </Link>
            ) : <span />}
            <span className="text-sm font-bold text-pul-muted">{currentPage}페이지</span>
            {page.hasMore ? (
              <Link
                href={`/certification/study?page=${currentPage + 1}`}
                className="inline-flex min-h-11 items-center rounded-lg border border-pul-border bg-white px-4 font-bold text-pul-deep"
              >
                다음
              </Link>
            ) : <span />}
          </nav>
        ) : null}
      </Container>
    </div>
  );
}
