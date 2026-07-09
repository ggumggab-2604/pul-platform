import { safetyTips } from "@/data/marketData";
import { Icon } from "@/components/ui/Icon";

type MarketSafetyGuideProps = {
  id?: string;
};

export function MarketSafetyGuide({ id = "market-safety" }: MarketSafetyGuideProps) {
  return (
    <section
      id={id}
      className="rounded-xl border border-pul-border bg-white p-4 shadow-[0_2px_10px_rgba(6,78,59,0.06)] lg:p-5"
    >
      <div className="mb-3 flex items-center gap-2 lg:mb-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-pul-light text-pul-deep lg:h-9 lg:w-9">
          <Icon name="badge" className="h-4 w-4 lg:h-5 lg:w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-foreground lg:text-lg">안전거래 안내</h2>
          <p className="text-xs text-pul-muted lg:text-sm">
            안전한 중고거래를 위한 기본 수칙입니다.
          </p>
        </div>
      </div>
      <ul className="space-y-2 lg:space-y-2.5">
        {safetyTips.map((tip) => (
          <li
            key={tip}
            className="flex items-start gap-2 rounded-lg bg-pul-light/60 px-3 py-2 text-sm leading-relaxed text-pul-deep lg:py-2.5"
          >
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-pul-point" />
            {tip}
          </li>
        ))}
      </ul>
    </section>
  );
}
