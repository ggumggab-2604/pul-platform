"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { acceptBannerRequestAction } from "@/app/manage/banners/community/actions";
import type { BannerRequest } from "@/lib/community/communityPromotions";
import { noticeLocation } from "@/lib/community/communityPromotionsPreview";
import { isoToKstLocalDateTime, slotLabels } from "@/lib/promotions/promotionManagementUi";
import { primary, secondary } from "@/components/community/CommunityPromotionForms";

export function BannerRequestReview({ requests, total, page, pages }: { requests: BannerRequest[]; total: number; page: number; pages: number }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  if (!requests.length) return <p className="rounded-xl border border-pul-border bg-white p-4">접수된 배너 신청이 없습니다.</p>;
  return <>
    <p className="my-3 text-sm text-pul-muted">전체 {total}건 · 먼저 접수된 순서</p>
    {message ? <p className="my-3 text-sm" role="status">{message}</p> : null}
    {error ? <p className="my-3 text-sm text-red-800" role="alert">{error}</p> : null}
    <ul className="space-y-3">{requests.map((item) => <li key={item.id} className="space-y-2 rounded-xl border border-pul-border bg-white p-4">
      <h2 className="font-bold text-pul-deep [overflow-wrap:anywhere]">{item.title}</h2>
      <p className="text-sm">{slotLabels[item.slot_code] ?? item.slot_code} · {noticeLocation(item)}</p>
      <p className="text-xs text-pul-muted">{isoToKstLocalDateTime(item.starts_at)} ~ {isoToKstLocalDateTime(item.ends_at)}</p>
      {item.promotion_key ? <Link className={secondary} href={`/manage/banners/${item.promotion_key}`}>공통 배너 관리 열기</Link>
        : item.available ? <button type="button" className={primary} disabled={pending} onClick={() => {
          setError(""); setMessage("");
          start(async () => {
            try {
              const result = await acceptBannerRequestAction(item.id);
              if (result.ok) {
                setMessage("광고 초안을 만들었습니다. 공통 배너 관리 열기에서 확인해 주세요.");
                router.refresh();
              }
              else setError(result.error);
            } catch { setError("광고 초안을 만들지 못했습니다."); }
          });
        }}>요청한 자리와 일정으로 광고 초안 만들기</button> : <p className="text-sm">{item.period_conflict ? "선택한 자리와 기간에 이미 게시·예약된 배너가 있습니다. 다른 자리나 기간으로 신청해 주세요." : "게시 기간 또는 연결 글을 확인해 주세요."}</p>}
    </li>)}</ul>
    <nav aria-label="배너 신청 페이지" className="mt-4 flex flex-wrap items-center justify-between gap-3">
      {page > 1 ? <Link className={secondary} href={`/manage/banners/community?page=${page - 1}`}>이전 페이지</Link> : <span className="text-sm text-pul-muted">첫 페이지</span>}
      <span className="text-sm" aria-current="page">{page} / {pages}</span>
      {page < pages ? <Link className={secondary} href={`/manage/banners/community?page=${page + 1}`}>다음 페이지</Link> : <span className="text-sm text-pul-muted">마지막 페이지</span>}
    </nav>
  </>;
}
