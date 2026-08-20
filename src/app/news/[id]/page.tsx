import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Container } from "@/components/ui/Container";
import { categoryLabels, sourceTypeLabels } from "@/data/newsData";
import { NewsDirectoryError } from "@/lib/news/newsDirectory";
import { getServerNewsArticle } from "@/lib/news/newsServer";

type NewsDetailProps = { params: Promise<{ id: string }> };

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}

function relatedLink(category: string) {
  if (category === "parkGolfNews") return { href: "/events", label: "대회·이벤트 일정 보기" };
  if (category === "equipmentBrand") return { href: "/market", label: "중고장터 보기" };
  if (category === "screenParkGolf") return { href: "/courses", label: "골프장 정보 보기" };
  return null;
}

export async function generateMetadata({ params }: NewsDetailProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const article = await getServerNewsArticle(id);
    return { title: article.title, description: article.summary };
  } catch {
    return { title: "뉴스를 찾을 수 없습니다" };
  }
}

export default async function NewsDetailPage({ params }: NewsDetailProps) {
  const { id } = await params;
  let article;
  try {
    article = await getServerNewsArticle(id);
  } catch (error) {
    if (error instanceof NewsDirectoryError && (error.code === "notFound" || error.code === "validation")) {
      notFound();
    }
    return (
      <div className="min-h-screen bg-pul-page">
        <Container className="max-w-3xl px-3 py-12">
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-800">
            뉴스·정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
          </p>
        </Container>
      </div>
    );
  }

  const related = relatedLink(article.category);
  return (
    <div className="min-h-screen bg-pul-page">
      <Container className="max-w-4xl px-3 py-5 pb-16 lg:py-9">
        <nav aria-label="경로" className="flex flex-wrap items-center gap-2 text-sm text-pul-muted">
          <Link href="/news" className="font-bold hover:text-pul-point">뉴스·정보</Link>
          <span aria-hidden="true">›</span>
          <span>{categoryLabels[article.category]}</span>
        </nav>

        <article className="mt-4 overflow-hidden rounded-2xl border border-pul-border bg-white shadow-[0_3px_18px_rgba(6,78,59,0.07)]">
          <header className="border-b border-pul-border px-5 py-6 sm:px-8 sm:py-8">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-pul-point/30 bg-pul-light px-3 py-1 text-sm font-bold text-pul-deep">
                {categoryLabels[article.category]}
              </span>
              <span className="rounded-full border border-pul-border bg-white px-3 py-1 text-sm font-bold text-pul-muted">
                {sourceTypeLabels[article.sourceType]}
              </span>
            </div>
            <h1 className="mt-4 break-words text-2xl font-black leading-tight text-foreground sm:text-3xl lg:text-4xl">
              {article.title}
            </h1>
            <p className="mt-4 text-base leading-7 text-pul-muted sm:text-lg">{article.summary}</p>
            <p className="mt-4 text-sm text-pul-muted">{article.region} · {dateLabel(article.publishedAt)}</p>
          </header>

          <div className="px-5 py-6 sm:px-8 sm:py-9">
            <div className="whitespace-pre-line break-words text-base leading-8 text-foreground sm:text-lg sm:leading-9">
              {article.body}
            </div>

            <section aria-labelledby="news-source-heading" className="mt-9 rounded-xl border border-pul-border bg-[#fafbfa] p-4 sm:p-5">
              <h2 id="news-source-heading" className="text-lg font-bold text-foreground">정보 출처</h2>
              <p className="mt-2 text-base text-pul-muted">
                {article.sourceName ?? sourceTypeLabels[article.sourceType]}
              </p>
              {article.sourceUrl ? (
                <a
                  href={article.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${article.sourceName ?? "공식 출처"} 원문 새 창에서 보기`}
                  className="mt-4 inline-flex min-h-12 items-center justify-center rounded-lg bg-pul-deep px-5 font-bold text-white hover:bg-pul-point"
                >
                  공식 원문 보기
                </a>
              ) : (
                <p className="mt-3 text-sm text-pul-muted">PUL 운영자가 확인해 작성한 정보입니다.</p>
              )}
            </section>

            <div className="mt-7 flex flex-col gap-2 sm:flex-row">
              <Link href="/news" className="inline-flex min-h-12 flex-1 items-center justify-center rounded-lg border border-pul-border bg-white px-5 font-bold text-pul-deep hover:bg-pul-light">
                뉴스 목록으로
              </Link>
              {related ? (
                <Link href={related.href} className="inline-flex min-h-12 flex-1 items-center justify-center rounded-lg bg-pul-point px-5 font-bold text-white hover:bg-pul-deep">
                  {related.label}
                </Link>
              ) : null}
            </div>
          </div>
        </article>
      </Container>
    </div>
  );
}
