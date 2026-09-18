import Link from "next/link";
export function MarketPageHero() {
  return (
    <section className="rounded-xl border border-pul-border bg-pul-light/40 px-5 py-5 sm:py-6">
      <p className="text-xs font-bold text-pul-point">PUL Market</p>
      <h1 className="mt-1 text-2xl font-bold text-pul-deep sm:text-3xl">
        중고장터
      </h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-pul-muted">
        PUL은 회원 간 거래 공간을 제공하며 거래 당사자가 아닙니다. 상품
        상태·가격·결제·배송은 판매자와 구매자가 직접 확인해 주세요.
      </p>
      <Link
        href="/market?view=safety#market-safety"
        className="mt-1 inline-flex min-h-11 items-center text-sm font-bold text-pul-point underline"
      >
        안전거래 안내
      </Link>
    </section>
  );
}
