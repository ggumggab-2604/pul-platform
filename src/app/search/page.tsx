import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PublicSearchForm } from "@/components/layout/PublicSearchForm";
import { Container } from "@/components/ui/Container";
import { searchPublicDirectories, type PublicSearchSection } from "@/lib/search/publicSearch";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "PUL 통합 검색",
  description: "공개된 골프장·동호회·뉴스를 검색하세요.",
  robots: { index: false, follow: true },
};

export default async function SearchPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = (Array.isArray(params.q) ? params.q[0] : params.q) ?? "";
  const query = raw.trim();
  if (raw !== query) redirect(query ? `/search?q=${encodeURIComponent(query)}` : "/search");

  let sections: PublicSearchSection[] = [];
  let error: string | undefined;
  if (query.length > 100) {
    error = "검색어는 100자 이하로 입력해 주세요.";
  } else if (query) {
    try {
      sections = await searchPublicDirectories(await createClient(), query);
    } catch {
      error = "검색 결과를 불러오지 못했습니다. 잠시 후 다시 검색해 주세요.";
    }
  }
  const noResults = sections.length > 0 && sections.every((section) => !section.failed && section.total === 0);

  return (
    <main className="bg-pul-page">
      <Container className="py-6 sm:py-8">
        <h1 className="text-2xl font-bold text-pul-deep">PUL 통합 검색</h1>
        <p className="mb-4 mt-2 text-sm text-pul-muted">골프장·공개 동호회·뉴스를 검색합니다. 영역별로 최대 5개를 표시합니다.</p>
        <PublicSearchForm key={query} query={query} />
        {!query ? <p className="mt-6 rounded-xl border border-pul-border bg-white p-6">검색어를 입력해 주세요.</p> : null}
        {query && !error ? <p className="mt-6 break-words font-semibold">‘{query}’ 검색 결과</p> : null}
        {error ? <p role="alert" className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900">{error}</p> : null}
        {noResults ? <p className="mt-4 rounded-xl border border-pul-border bg-white p-6">검색 결과가 없습니다. 다른 검색어로 다시 검색해 보세요.</p> : null}
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {sections.map((section) => (
            <section key={section.label} aria-label={`${section.label} 검색 결과`} className="min-w-0 rounded-xl border border-pul-border bg-white p-5">
              <h2 className="text-lg font-bold">{section.label}{!section.failed ? ` ${section.total}건` : ""}</h2>
              {section.failed ? (
                <p role="alert" className="mt-3 text-sm text-amber-800">이 영역의 검색 결과를 불러오지 못했습니다. 잠시 후 다시 검색해 주세요.</p>
              ) : section.items.length === 0 ? (
                <p className="mt-3 text-sm text-pul-muted">검색 결과가 없습니다.</p>
              ) : (
                <ul className="mt-2 divide-y divide-pul-border">
                  {section.items.map((item) => (
                    <li key={item.href} className="py-3">
                      <Link href={item.href} className="block break-words font-semibold text-pul-deep underline-offset-4 hover:underline">{item.title}</Link>
                      {item.region ? <p className="mt-1 text-sm text-pul-muted">{item.region}</p> : null}
                    </li>
                  ))}
                </ul>
              )}
              <Link href={section.href} className="mt-4 inline-flex min-h-11 items-center text-sm font-bold text-pul-point underline underline-offset-4">{section.label} 검색 목록 보기</Link>
            </section>
          ))}
        </div>
      </Container>
    </main>
  );
}
