"use client";
import { MarketManagedSlot } from "./MarketManagedContent";

import Link from "next/link";
import { marketHref } from "@/lib/market/marketNavigation";
import { marketPolicyTitle } from "@/lib/market/marketPolicy";
import { beginnerEquipmentGuide } from "@/data/marketData";
import { equipmentCareTips } from "@/data/equipmentCareData";

export function MarketPriceGuidePanel({ search = "" }: { search?: string }) {
  return (
    <MarketManagedSlot contentKey="checklist" footer={<div className="mt-3 flex flex-wrap gap-x-4 text-sm"><Link href={marketHref(search, "safety")} className="inline-flex min-h-11 items-center text-pul-point underline">안전거래·신고 안내</Link><Link href="/market/policy" className="inline-flex min-h-11 items-center text-pul-point underline">{marketPolicyTitle}</Link></div>}>
    <section
      id="market-price-guide"
      className="rounded-xl border border-pul-border bg-white p-4 shadow-[0_2px_10px_rgba(6,78,59,0.05)]"
    >
      <h2 className="text-lg font-bold text-foreground">중고 구매 체크리스트</h2>
      <p className="mt-1 text-sm text-pul-muted">
        구입 전 사진과 설명을 비교하고, 확인이 필요한 내용은 작성자에게 문의하세요. 가격과 거래 조건은 당사자가 직접 확인해야 합니다.
      </p>
      <ul className="mt-3 space-y-2">
        {[
          { id: "model", name: "모델·연식", note: "같은 모델과 연식인지 확인하고 새 제품 가격과 비교하세요." },
          { id: "condition", name: "상태·사용 이력", note: "균열·마모·수리 흔적과 사용 기간을 사진과 설명으로 확인하세요." },
          { id: "parts", name: "구성품·규격", note: "공의 수량, 가방·신발의 크기와 포함된 구성품을 확인하세요." },
          { id: "photos", name: "실물 사진", note: "실물 전체와 손상 부위가 보이는지 확인하고 필요하면 추가 설명을 요청하세요." },
          { id: "trade", name: "가격·거래 방법", note: "예산 협의나 교환 조건, 직거래 장소와 배송비를 함께 확인하세요." },
          { id: "safety", name: "연락·안전 확인", note: "쪽지로 조건을 확인하고 선입금 요구와 외부 링크를 주의하세요." },
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
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <Link href={marketHref(search, "safety")} className="inline-flex min-h-11 items-center font-bold text-pul-point underline">안전거래·신고 안내</Link>
        <Link href="/market/policy" className="inline-flex min-h-11 items-center text-pul-point underline">{marketPolicyTitle}</Link>
      </div>
    </section>
    </MarketManagedSlot>
  );
}

export function MarketBuyGuidePanel() {
  return (
    <MarketManagedSlot contentKey="beginner">
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
    </MarketManagedSlot>
  );
}

export function MarketCareAndRepairPanel() {
  return <div className="mt-3 space-y-3 text-sm leading-6 text-pul-muted">
    <ul className="space-y-2">{[
      ["회원가입","PUL 회원가입·로그인 후 업체 등록을 신청할 수 있습니다."],
      ["업체 기본정보","업체명, 사업자 등록 여부, 매장·작업장 유무와 소재 지역을 준비해 주세요. 사업자나 매장이 없어도 신청할 수 있습니다."],
      ["취급 분야","주력 수리·제작 분야와 가능한 작업을 작성해 주세요."],
      ["서비스 방식","방문·택배·출장 가능 여부와 서비스 지역을 작성해 주세요. 매장이 없으면 소재 지역에는 활동 거점을 입력해 주세요."],
      ["소개 자료","업체 소개를 작성하고 사진은 선택으로 첨부할 수 있습니다. 홈페이지·공식 채널 URL도 선택 항목입니다."],
      ["등록 절차","초안 저장 후 검토를 신청하면 운영자가 내용을 확인한 후 업체 소개가 공개됩니다. 공개는 PUL의 품질 인증이나 보증을 뜻하지 않습니다."],
    ].map(([title,text])=><li key={title} className="rounded-lg border border-pul-border/80 bg-pul-page/30 px-3 py-2.5"><strong className="text-pul-deep">{title}</strong><p>{text}</p></li>)}</ul>
    <p className="rounded-lg border border-pul-border bg-white p-3">현재 업체 등록은 무료입니다. 향후 유료 서비스가 도입될 수 있으며, 적용 대상·시기·요금은 사전에 안내합니다. 별도 신청이나 동의 없이 자동으로 과금하지 않습니다.</p>
    <Link prefetch={false} href="/market/providers" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-pul-border bg-white px-4 py-2 font-bold text-pul-deep">업체 등록·관리</Link>
  </div>;
}

export function MarketEquipmentCareTips() {
  return <ul className="mt-3 space-y-2">{equipmentCareTips.map(tip=><li key={tip.id} className="rounded-lg border border-pul-border/80 bg-pul-page/30 px-3 py-2.5 text-sm leading-6 text-pul-muted"><strong className="text-pul-deep">{tip.title}</strong><p>{tip.summary}</p></li>)}</ul>;
}
