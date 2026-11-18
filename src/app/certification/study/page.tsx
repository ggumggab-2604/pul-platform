import { CertificationStudyBoardSection } from "@/components/certification/CertificationStudyBoardSection";
import { Container } from "@/components/ui/Container";
import {
  CertificationStudyPostError,
  listPublicCertificationStudyPosts,
  listCertificationStudyTopic,
  type CertificationStudyPost,
  type CertificationStudyPage,
} from "@/lib/certification/certificationStudyPosts";
import { certificationStudyTopicTitle, safeCertificationStudyReturn } from "@/lib/certification/certificationPhaseOne";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "시험 준비 이야기방",
  description: "파크골프 자격증·심판 시험 준비 경험과 궁금한 점을 나누는 회원 게시판입니다.",
};

type Props = {
  searchParams: Promise<{ page?: string | string[]; topic?: string | string[]; reply?: string | string[]; returnTo?: string | string[] }>;
};

const PAGE_SIZE = 20;

function pageNumber(value: string | string[] | undefined) {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) return 1;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= 100000 ? parsed : 1;
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
  const topic = typeof query.topic === "string" ? query.topic : undefined;
  const title = topic ? certificationStudyTopicTitle(topic) : null;
  const parent = typeof query.reply === "string" && /^[a-f0-9]{32}$/.test(query.reply) ? query.reply : undefined;
  if ((query.topic !== undefined && !title) || (query.reply !== undefined && (!parent || !topic))) notFound();
  const back = safeCertificationStudyReturn(query.returnTo) ?? "/certification?tab=exam-prep";
  let root: CertificationStudyPost | null = null;
  let page = emptyPage(offset);
  let missing = false;
  let error: string | null = null;

  try {
    const client = await createClient();
    if (topic) {
      const thread = await listCertificationStudyTopic(client, topic, parent ?? null, PAGE_SIZE, offset);
      missing = !thread;
      if (thread) ({ page, root } = thread);
    } else {
      page = await listPublicCertificationStudyPosts(client, PAGE_SIZE, offset);
    }
  } catch (reason) {
    error = reason instanceof CertificationStudyPostError
      ? reason.userMessage
      : "시험 준비 게시글을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }

  if (missing || (!error && currentPage > 1 && page.items.length === 0)) notFound();

  function href(number: number, reply = parent ?? "") {
    const filters = new URLSearchParams();
    if (topic) filters.set("topic", topic);
    if (topic || query.returnTo) filters.set("returnTo", back);
    if (reply) filters.set("reply", reply);
    if (number > 1) filters.set("page", String(number));
    return "/certification/study" + (filters.size ? `?${filters}` : "");
  }
  const returnPath = href(currentPage);

  return (
    <div className="bg-pul-page">
      <Container className="max-w-4xl px-3 py-5 sm:py-8">
        <nav aria-label="경로" className="mb-4 flex flex-wrap items-center gap-1.5 text-sm text-pul-muted">
          <Link href={topic || query.returnTo ? back : "/certification"} className="font-medium hover:text-pul-point">
            자격증·심판
          </Link>
          <span aria-hidden="true">›</span>
          <span className="font-semibold text-foreground">{title ?? "시험 준비 이야기방"}</span>
        </nav>

        {parent && <Link href={href(1, "")} className="mb-3 inline-flex min-h-11 items-center font-semibold text-pul-point no-underline">이 주제 글 목록</Link>}
        <CertificationStudyBoardSection
          page={page}
          scope={topic && title ? { topic, parent, title } : undefined}
          root={root}
          returnPath={returnPath}
          error={error}
          full
        />

        {!error && (currentPage > 1 || page.hasMore) ? (
          <nav aria-label="시험 준비 이야기방 페이지" className="mt-5 flex items-center justify-between gap-3">
            {currentPage > 1 ? (
              <Link
                href={href(currentPage - 1)}
                className="inline-flex min-h-11 items-center rounded-lg border border-pul-border bg-white px-4 font-bold text-pul-deep"
              >
                이전
              </Link>
            ) : <span />}
            <span className="text-sm font-bold text-pul-muted">{currentPage}페이지</span>
            {page.hasMore ? (
              <Link
                href={href(currentPage + 1)}
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
