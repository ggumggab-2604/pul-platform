import { Container } from "@/components/ui/Container";

export default function HallOfFameLoading() {
  return (
    <div className="min-h-screen bg-pul-page" aria-busy="true" aria-live="polite">
      <Container className="max-w-6xl px-3 py-6 sm:py-9 lg:py-12">
        <span className="sr-only">명예의 전당을 불러오는 중입니다.</span>
        <div className="h-44 animate-pulse rounded-2xl bg-pul-deep/15" />
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="h-56 animate-pulse rounded-xl border border-pul-border bg-white"
            />
          ))}
        </div>
      </Container>
    </div>
  );
}
