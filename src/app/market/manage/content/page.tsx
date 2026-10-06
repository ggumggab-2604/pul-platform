import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { MarketContentManagement } from "@/components/market/manage/MarketContentManagement";
import { loadMarketContentManagementAction } from "./actions";
export const metadata = { title: "장터 안내·정책" };
export default async function MarketContentManagementRoute() {
  const result = await loadMarketContentManagementAction();
  return <main className="min-h-screen bg-pul-page"><Container className="max-w-5xl px-3 py-6 pb-28">
    <Link href="/manage" className="inline-flex min-h-11 items-center font-bold text-pul-point">← 운영 관리센터</Link>
    <h1 className="mb-3 text-2xl font-black">장터 안내·정책</h1>
    {result.ok ? <MarketContentManagement initial={result.data} /> : <div role="alert" className="rounded-xl border border-pul-border bg-white p-5"><p>{result.message}</p><Link href="/market/manage/content" className="inline-flex min-h-11 items-center underline">다시 확인</Link></div>}
  </Container></main>;
}
