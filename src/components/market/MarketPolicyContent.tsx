import { MARKET_POLICY_VERSION } from "@/lib/market/market";
import { marketPolicyEffectiveNotice, marketPolicySections } from "@/lib/market/marketPolicy";

export function MarketPolicyContent() {
  return <div data-market-policy-version={MARKET_POLICY_VERSION} className="space-y-6 text-base leading-7">
    <p className="rounded-lg bg-pul-page p-3 text-sm text-pul-muted">{marketPolicyEffectiveNotice}</p>
    {marketPolicySections.map((section) => <section key={section.title}>
      <h2 className="text-lg font-bold">{section.title}</h2>
      <p className="mt-2 text-pul-muted">{section.description}</p>
      <ul className="mt-3 list-disc space-y-2 pl-5">{section.items.map((item) => <li key={item}>{item}</li>)}</ul>
    </section>)}
    <p className="border-t border-pul-border pt-4 text-sm">운영 주체: PUL 운영자<br />문의·결과 확인·이의신청: <a href="mailto:pulpark.help@gmail.com" className="break-all text-pul-point underline underline-offset-4">pulpark.help@gmail.com</a></p>
  </div>;
}
