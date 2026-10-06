import {storeHref} from "@/lib/market/marketStores";
import {buyExchangeHref} from "@/lib/market/marketBuyExchange";
import Link from "next/link";
import type { MarketMessageContext as Context } from "@/lib/messaging/messaging";
import { messageButton } from "@/lib/messaging/messagingUi";

export function MarketMessageContext({ context }: { context: Context }) {
  if (!context) return null;
  return <aside aria-label="관련 장터 글" className="min-w-0 space-y-2 rounded-xl border border-pul-border bg-pul-light/30 p-4">
    <h3 className="text-sm font-bold">{context.available&&context.store?"문의 대상 매장":context.available&&context.vendor?"문의 대상 업체":"관련 장터 글"}</h3>
    {context.available ? <>
      <p className="font-bold [overflow-wrap:anywhere]">{context.title}</p>
      <p className="text-sm text-pul-muted">{context.store?{selling:"매매 중",reserved:"협의 중",sold:"거래 완료"}[context.status]:context.vendor?"PUL 비공개 쪽지 문의":context.requestType ? `${context.requestType==="exchange"?"교환":"구매"} ${context.status==="sold"?"완료":"중"}` : { selling: "판매중", reserved: "예약중", sold: "거래완료" }[context.status]}</p>
      <Link prefetch={false} className={messageButton} href={context.store?storeHref("",{store:context.listingId}):context.vendor?`/market?view=care&provider=${encodeURIComponent(context.listingId)}`:context.requestType?buyExchangeHref(context.listingId):`/market?view=sale&listing=${encodeURIComponent(context.listingId)}`}>{context.store?"매장 정보 보기":context.vendor?"업체 소개 보기":"장터 글 보기"}</Link>
    </> : <p className="text-sm">거래 종료 또는 볼 수 없는 장터 글</p>}
  </aside>;
}
