import { CertificationStudyBoardSection } from "@/components/certification/CertificationStudyBoardSection";
import { refereeSecondaryButton } from "@/components/certification/RefereeGuideButton";
import { listCertificationStudyTopic, type CertificationStudyPage } from "@/lib/certification/certificationStudyPosts";
import { refereeBoardHref, refereeTopics, type RefereeTopic } from "@/lib/certification/refereeGuide";
import { cn } from "@/lib/utils";
import type { SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";

export async function CertificationRefereeBoard({ client, topic, pageNumber }: {
  client: SupabaseClient;
  topic?: RefereeTopic;
  pageNumber: number;
}) {
  const offset = topic ? (pageNumber - 1) * 12 : 0;
  const limit = topic ? 12 : 3;
  const returnPath = refereeBoardHref(topic, pageNumber);
  let page: CertificationStudyPage = { items: [], total: 0, limit, offset, hasMore: false };
  const postTopics: Record<string, RefereeTopic> = {};
  let error: string | null = null;
  const keys = topic ? [topic] : refereeTopics.map(([key]) => key);

  try {
    const pages = await Promise.all(keys.map(async (key) => {
      const result = await listCertificationStudyTopic(client, key, null, limit, offset);
      if (!result) throw new Error("Unrecognized referee topic");
      for (const post of result.page.items) postTopics[post.postKey] = key;
      return result.page;
    }));
    if (topic) {
      [page] = pages;
    } else {
      page = {
        items: pages.flatMap(({ items }) => items).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
        total: pages.reduce((total, result) => total + result.total, 0),
        limit: limit * keys.length,
        offset: 0,
        hasMore: false,
      };
    }
  } catch {
    error = "심판 질문·후기를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }

  return (
    <CertificationStudyBoardSection
      page={page}
      returnPath={returnPath}
      error={error}
      full
      referee={{ topic, postTopics }}
      toolbar={
        <nav aria-label="심판 질문·후기 분류" className="mt-3 flex flex-wrap gap-2">
          {([[undefined, "전체"], ...refereeTopics] as const).map(([key, label]) => (
            <Link
              key={label}
              href={refereeBoardHref(key)}
              aria-current={topic === key ? "page" : undefined}
              className={cn("inline-flex min-h-11 items-center rounded-lg border px-3 text-sm font-semibold no-underline",
                topic === key ? "border-pul-point/20 bg-pul-light font-bold text-pul-deep" : "border-pul-border bg-white text-foreground hover:bg-pul-page")}
            >
              {label}
            </Link>
          ))}
        </nav>
      }
      pagination={!topic && page.total > page.items.length ? (
        <p className="mt-3 text-sm text-pul-muted">분류를 선택하면 이전 글까지 볼 수 있어요.</p>
      ) : topic && !error && (pageNumber > 1 || page.hasMore) && (
        <nav aria-label="심판 질문·후기 페이지" className="mt-4 flex flex-wrap items-center gap-2">
          {pageNumber > 1 && <Link className={refereeSecondaryButton} href={refereeBoardHref(topic, pageNumber - 1)}>이전</Link>}
          <span className="text-sm text-pul-muted">{pageNumber}페이지</span>
          {page.hasMore && <Link className={refereeSecondaryButton} href={refereeBoardHref(topic, pageNumber + 1)}>다음</Link>}
        </nav>
      )}
    />
  );
}
