import { MarketPageHero } from "@/components/market/MarketPageHero";
import { Container } from "@/components/ui/Container";

export default function MarketLoading() {
  return <div className="bg-pul-page">
    <Container className="pt-3"><MarketPageHero /></Container>
    <Container className="py-4"><p role="status" className="rounded-xl border border-pul-border bg-white p-6 text-sm text-pul-muted">장터 목록을 불러오는 중…</p></Container>
  </div>;
}
