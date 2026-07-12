import { Container } from "@/components/ui/Container";
import { Icon } from "@/components/ui/Icon";

export function MarketPageHero() {
  return (
    <section className="relative overflow-hidden rounded-xl border border-emerald-200/60 bg-gradient-to-br from-pul-light via-white to-emerald-50 shadow-[0_4px_20px_rgba(6,78,59,0.08)]">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage: "url('/images/banner-equipment.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/95 via-white/88 to-emerald-50/75"
        aria-hidden="true"
      />
      <Container className="relative px-4 py-5 sm:py-8 lg:py-10">
        <div className="flex max-w-2xl items-start gap-3 sm:gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-pul-deep to-pul-point text-white shadow-sm sm:h-14 sm:w-14">
            <Icon name="cart" className="h-6 w-6 sm:h-7 sm:w-7" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-pul-point sm:text-sm">PUL Market</p>
            <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-pul-deep sm:mt-1 sm:text-3xl lg:text-4xl">
              중고장터
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-pul-muted sm:mt-2 sm:text-lg">
              파크골프 장비 거래, 시세, 구매 가이드, 안전거래까지 확인하세요.
            </p>
            <p className="mt-1 text-xs text-pul-muted sm:text-sm">
              초기에는 운영 준비 샘플 매물과 안내 콘텐츠가 함께 표시됩니다.
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}
