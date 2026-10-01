import Link from "next/link";
import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { MarketPolicyContent } from "@/components/market/MarketPolicyContent";
import { marketPolicyTitle } from "@/lib/market/marketPolicy";

export const metadata: Metadata = { title: marketPolicyTitle };

export default function MarketPolicyPage() {
  return <Container className="py-8">
    <article className="mx-auto max-w-3xl rounded-xl border border-pul-border bg-white p-4 sm:p-8">
      <h1 className="mb-6 text-2xl font-bold">{marketPolicyTitle}</h1>
      <MarketPolicyContent />
      <Link href="/market" className="mt-6 inline-flex min-h-11 items-center font-semibold text-pul-point underline underline-offset-4">장터로 돌아가기</Link>
    </article>
  </Container>;
}
