"use client";

import {
  beginnerEquipmentGuide,
  equipmentPriceSnapshots,
  marketOpenEventNote,
} from "@/data/marketData";
import { EquipmentCareLinkBox } from "@/components/market/EquipmentCareLinkBox";

type MarketInfoPanelsProps = {
  onEquipmentCareInquiry: () => void;
};

export function MarketPriceGuidePanel() {
  return (
    <section
      id="market-price-guide"
      className="rounded-xl border border-pul-border bg-white p-4 shadow-[0_2px_10px_rgba(6,78,59,0.05)]"
    >
      <h2 className="text-lg font-bold text-foreground">인기 장비 시세</h2>
      <p className="mt-1 text-sm text-pul-muted">
        참고용 시세 정보입니다. 실제 거래가와 차이가 있을 수 있습니다.
      </p>
      <ul className="mt-3 space-y-2">
        {equipmentPriceSnapshots.map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-pul-border/70 bg-pul-page/40 px-3 py-2.5"
          >
            <div>
              <p className="text-sm font-bold text-foreground">{item.name}</p>
              <p className="mt-0.5 text-xs text-pul-muted">{item.note}</p>
            </div>
            <p className="shrink-0 text-sm font-bold text-pul-deep">{item.priceRange}</p>
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
      <h2 className="text-lg font-bold text-foreground">초보자 장비 선택 가이드</h2>
      <ul className="mt-3 space-y-2">
        {beginnerEquipmentGuide.map((item) => (
          <li
            key={item.id}
            className="rounded-lg border border-pul-border/80 bg-pul-page/30 px-3 py-2.5"
          >
            <p className="text-sm font-bold text-pul-deep">{item.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-pul-muted">{item.summary}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MarketOpenEventPanel() {
  return (
    <aside className="rounded-xl border border-dashed border-pul-point/30 bg-pul-light/20 px-4 py-3">
      <p className="text-sm font-bold text-pul-deep">장터 오픈 등록 이벤트</p>
      <p className="mt-1 text-xs leading-relaxed text-pul-muted lg:text-sm">
        {marketOpenEventNote}
      </p>
    </aside>
  );
}

export function MarketCareAndRepairPanel({
  onEquipmentCareInquiry,
}: MarketInfoPanelsProps) {
  return <EquipmentCareLinkBox onRegisterInquiry={onEquipmentCareInquiry} />;
}
