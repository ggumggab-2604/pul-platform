import { DetailTestLayout } from "@/components/layout/DetailTestLayout";
import { DetailTestQuickActions } from "@/components/courses/layout-test/DetailTestQuickActions";
import { Container } from "@/components/ui/Container";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "상세 레이아웃 테스트",
  description: "Bounded sticky 사이드바 레이아웃 검증용 페이지",
  robots: { index: false, follow: false },
};

const DUMMY_CARDS = Array.from({ length: 15 }, (_, i) => ({
  id: i + 1,
  title: `더미 본문 카드 ${i + 1}`,
  body: `스크롤·sticky 검증용 더미 콘텐츠입니다. 카드 ${i + 1}/15. 왼쪽 본문이 충분히 길어 우측 사이드바가 본문 끝에서 멈추는지 확인할 수 있습니다.`,
}));

export default function CourseLayoutTestPage() {
  return (
    <div className="detail-test-page-root bg-pul-page">
      <Container className="max-w-6xl py-4 max-lg:px-3 lg:py-8">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-base text-pul-muted">
            Bounded sticky 레이아웃 테스트 ·{" "}
            <code className="rounded bg-pul-light px-1.5 py-0.5 text-sm text-pul-deep">
              /courses/1-layout-test
            </code>
          </p>
          <Link
            href="/courses/1"
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-pul-border bg-white px-4 text-sm font-bold text-pul-deep hover:bg-pul-light lg:text-base"
          >
            실제 상세로
          </Link>
        </div>

        <DetailTestLayout
          title={
            <section
              data-testid="detail-test-title"
              className="mb-5 rounded-xl border border-pul-border bg-white p-5 shadow-[0_2px_10px_rgba(6,78,59,0.06)] lg:mb-6"
            >
              <h1 className="text-xl font-bold text-foreground lg:text-2xl">
                레이아웃 테스트 골프장
              </h1>
              <p className="mt-2 text-base leading-relaxed text-pul-muted lg:text-lg">
                제목은 전체 폭. 아래 2열에서 본문과 우측 메뉴가 같은 높이로 시작합니다.
              </p>
            </section>
          }
          sidebar={<DetailTestQuickActions />}
        >
          <div className="space-y-4">
            {DUMMY_CARDS.map((card) => (
              <section
                key={card.id}
                data-testid={`detail-test-card-${card.id}`}
                className="rounded-xl border border-pul-border bg-white p-5 shadow-[0_2px_10px_rgba(6,78,59,0.06)]"
              >
                <h2 className="text-lg font-bold text-pul-deep lg:text-xl">{card.title}</h2>
                <p className="mt-2 text-base leading-relaxed text-pul-muted">{card.body}</p>
              </section>
            ))}
          </div>
        </DetailTestLayout>
      </Container>
    </div>
  );
}
