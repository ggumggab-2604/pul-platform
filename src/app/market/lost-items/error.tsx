"use client";

import { lostItemButton } from "@/lib/market/lostItems";

export default function LostItemsError({ reset }: { reset: () => void }) {
  return <section role="alert" className="space-y-3 rounded-xl border border-rose-200 bg-white p-5">
    <p>분실물 확인 화면을 불러오지 못했습니다.</p>
    <button type="button" onClick={reset} className={lostItemButton}>다시 불러오기</button>
  </section>;
}
