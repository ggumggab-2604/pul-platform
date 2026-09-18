"use client";

import { beginnerEquipmentGuide } from "@/data/marketData";
import { EquipmentCareLinkBox } from "@/components/market/EquipmentCareLinkBox";

type MarketInfoPanelsProps = {
  onEquipmentCareInquiry: (trigger: HTMLButtonElement) => void;
};

export function MarketPriceGuidePanel() {
  return (
    <section
      id="market-price-guide"
      className="rounded-xl border border-pul-border bg-white p-4 shadow-[0_2px_10px_rgba(6,78,59,0.05)]"
    >
      <h2 className="text-lg font-bold text-foreground">가격 확인 가이드</h2>
      <p className="mt-1 text-sm text-pul-muted">
        실시간 시세나 인기 순위를 제공하지 않습니다. 동일 모델의
        상태·구성품·사용 이력을 비교해 거래 가격을 직접 확인해 주세요.
      </p>
      <ul className="mt-3 space-y-2">
        {[
          {
            id: "club",
            name: "파크골프채",
            note: "모델·연식, 헤드 균열, 그립과 샤프트 상태를 비교하세요.",
          },
          {
            id: "ball",
            name: "공",
            note: "제품 규격과 마모, 수량·포장 포함 여부를 확인하세요.",
          },
          {
            id: "bag",
            name: "가방·신발",
            note: "크기와 사용감, 지퍼·밑창·내피 상태를 확인하세요.",
          },
        ].map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-pul-border/70 bg-pul-page/40 px-3 py-2.5"
          >
            <div>
              <p className="text-sm font-bold text-foreground">{item.name}</p>
              <p className="mt-0.5 text-xs text-pul-muted">{item.note}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MarketBuyGuidePanel() {
  return (
    <section
      id="market-buy-guide"
      className="rounded-xl border border-pul-border bg-white p-4 shadow-[0_2px_10px_rgba(6,78,59,0.05)]"
    >
      <h2 className="text-lg font-bold text-foreground">
        초보자 장비 선택 가이드
      </h2>
      <ul className="mt-3 space-y-2">
        {beginnerEquipmentGuide.map((item) => (
          <li
            key={item.id}
            className="rounded-lg border border-pul-border/80 bg-pul-page/30 px-3 py-2.5"
          >
            <p className="text-sm font-bold text-pul-deep">{item.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-pul-muted">
              {item.summary}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MarketCareAndRepairPanel({
  onEquipmentCareInquiry,
}: MarketInfoPanelsProps) {
  return <EquipmentCareLinkBox onRegisterInquiry={onEquipmentCareInquiry} />;
}
