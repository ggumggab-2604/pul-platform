import { getMarketContentSnapshot } from "@/lib/market/marketContentServer";
import Link from "next/link";
import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { MarketPolicyContent } from "@/components/market/MarketPolicyContent";
import { marketPolicyTitle } from "@/lib/market/marketPolicy";

export const metadata: Metadata = { title: marketPolicyTitle };

export default async function MarketPolicyPage() {
  let snapshot;
  try { snapshot = await getMarketContentSnapshot(); }
  catch { return <Container className="py-8"><p role="alert">정책을 확인하지 못했습니다. 잠시 후 다시 확인해 주세요.</p><a href="/market/policy" className="inline-flex min-h-11 items-center underline">다시 확인</a></Container>; }
  return <Container className="py-8">
    <article className="mx-auto max-w-3xl rounded-xl border border-pul-border bg-white p-4 sm:p-8">
      <h1 className="mb-6 text-2xl font-bold">{snapshot.current.policy?.content.title ?? marketPolicyTitle}</h1>
      <MarketPolicyContent revision={snapshot.current.policy} />
      <Link href="/market" className="mt-6 inline-flex min-h-11 items-center font-semibold text-pul-point underline underline-offset-4">장터로 돌아가기</Link>
    </article>
  </Container>;
}
