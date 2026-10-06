"use client";
import { MarketManagedSlot } from "./MarketManagedContent";
import Link from "next/link";
import { useState } from "react";
import { marketHref } from "@/lib/market/marketNavigation";
import { marketPolicyTitle } from "@/lib/market/marketPolicy";
import { MarketDialog } from "./MarketDialog";

export function MarketHelpMenu({ search = "" }: { search?: string }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}
      className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-2 text-sm font-bold text-pul-point focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pul-point">이용 도움말</button>
    {open ? <MarketDialog title="장터 이용 도움말" onClose={() => setOpen(false)}>
      <MarketManagedSlot contentKey="help">      <p className="text-sm leading-6 text-pul-muted">팝니다에서는 판매 매물을, 삽니다·교환에서는 구매 희망 글과 교환 글을 확인할 수 있습니다. 상세에서 사진·거래 조건을 확인하고 쪽지로 문의하거나 관심글로 저장하세요. 관심목록은 내 정보에서 모아 볼 수 있습니다.</p></MarketManagedSlot>
      <nav aria-label="장터 도움말" className="mt-3 flex flex-col gap-2">
        {[[marketHref(search, "price"), "중고 구매 체크리스트"], [marketHref(search, "guide"), "처음 장비를 고를 때"], [marketHref(search, "safety"), "안전거래·신고 안내"], ["/my#my-interests-title", "내 관심목록"], ["/market/policy", marketPolicyTitle]].map(([href, label]) =>
          <Link key={href} href={href} prefetch={false} onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center rounded-lg border border-pul-border px-3 py-2 text-sm font-semibold text-pul-deep hover:bg-pul-light">{label} →</Link>)}
      </nav>
    </MarketDialog> : null}
  </>;
}
