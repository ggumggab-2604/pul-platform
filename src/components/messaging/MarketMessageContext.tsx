import Link from "next/link";
import type { MarketMessageContext as Context } from "@/lib/messaging/messaging";
import { messageButton } from "@/lib/messaging/messagingUi";

export function MarketMessageContext({ context }: { context: Context }) {
  if (!context) return null;
  return <aside aria-label="관련 장터 글" className="min-w-0 space-y-2 rounded-xl border border-pul-border bg-pul-light/30 p-4">
    <h3 className="text-sm font-bold">관련 장터 글</h3>
    {context.available ? <>
      <p className="font-bold [overflow-wrap:anywhere]">{context.title}</p>
      <p className="text-sm text-pul-muted">{{ selling: "판매중", reserved: "예약중", sold: "거래완료" }[context.status]}</p>
      <Link prefetch={false} className={messageButton} href={`/market?view=sale&listing=${encodeURIComponent(context.listingId)}`}>장터 글 보기</Link>
    </> : <p className="text-sm">거래 종료 또는 볼 수 없는 장터 글</p>}
  </aside>;
}
