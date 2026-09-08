"use client";

import {
  getMarketListingReportDetailAction,
  removeMarketListingForModerationAction,
  resolveMarketListingReportAction,
} from "@/app/market/manage/listing-reports/actions";
import type {
  ManagedMarketListingReportDetail,
  MarketListingReportFilter,
  MarketListingReportPage,
  MarketListingReportResolution,
} from "@/lib/market/marketListingReports";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

const statusLabels = { received: "확인 대기", handled: "처리 완료", dismissed: "종료", all: "전체" } as const;
const reasonLabels = {
  fraud_or_false: "사기 또는 허위 정보",
  prohibited_or_inappropriate: "금지 또는 부적절한 상품",
  spam_or_duplicate: "도배 또는 중복 게시",
  privacy_exposure: "개인정보 노출",
  other: "기타",
} as const;

export function MarketListingReportManagementPage({ initialPage, status }: { initialPage: MarketListingReportPage; status: MarketListingReportFilter }) {
  const router = useRouter();
  const [detail, setDetail] = useState<ManagedMarketListingReportDetail | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const [moderationReason, setModerationReason] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const resolutionRequestRef = useRef("");
  const moderationRequestRef = useRef("");
  const detailGenerationRef = useRef(0);
  const detailKeyRef = useRef<string | null>(null);
  const listTitleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => () => {
    detailGenerationRef.current += 1;
    detailKeyRef.current = null;
  }, []);

  const isCurrentDetail = (generation: number, reportKey: string) =>
    generation === detailGenerationRef.current && reportKey === detailKeyRef.current;

  const closeDetail = () => {
    detailGenerationRef.current += 1;
    detailKeyRef.current = null;
    setDetail(null);
    listTitleRef.current?.focus({ preventScroll: true });
  };

  const loadDetail = (reportKey: string) => {
    const generation = ++detailGenerationRef.current;
    detailKeyRef.current = reportKey;
    setNotice("");
    setError("");
    startTransition(async () => {
      try {
        const result = await getMarketListingReportDetailAction(reportKey);
        if (generation !== detailGenerationRef.current) return;
        if (result.ok) {
          setDetail(result.detail);
          setResolutionNote("");
          setModerationReason("");
          resolutionRequestRef.current = "";
          moderationRequestRef.current = "";
        } else setError(result.message);
      } catch {
        if (generation === detailGenerationRef.current) {
          setError("신고 상세를 불러오지 못했습니다. 다시 시도해 주세요.");
        }
      }
    });
  };

  const resolve = (resolution: MarketListingReportResolution) => {
    if (!detail || isPending) return;
    const generation = detailGenerationRef.current;
    const reportKey = detail.reportKey;
    if (!resolutionRequestRef.current) resolutionRequestRef.current = crypto.randomUUID();
    setNotice("");
    setError("");
    startTransition(async () => {
      try {
        const result = await resolveMarketListingReportAction({ reportKey: detail.reportKey, expectedVersion: detail.version, resolution, note: resolutionNote, requestId: resolutionRequestRef.current });
        if (result.ok) {
          if (isCurrentDetail(generation, reportKey)) {
            setNotice(result.message);
            closeDetail();
          }
          router.refresh();
        } else {
          if (isCurrentDetail(generation, reportKey)) setError(result.message);
          if (result.shouldRefresh) router.refresh();
        }
      } catch {
        if (isCurrentDetail(generation, reportKey)) {
          setError("신고 처리 결과를 저장하지 못했습니다. 같은 내용으로 다시 시도해 주세요.");
        }
      }
    });
  };

  const moderate = () => {
    if (!detail || isPending) return;
    const generation = detailGenerationRef.current;
    const reportKey = detail.reportKey;
    if (!moderationRequestRef.current) moderationRequestRef.current = crypto.randomUUID();
    setNotice("");
    setError("");
    startTransition(async () => {
      try {
        const result = await removeMarketListingForModerationAction({ listingId: detail.listing.id, expectedVersion: detail.listing.version, reason: moderationReason, requestId: moderationRequestRef.current });
        if (result.ok) {
          if (isCurrentDetail(generation, reportKey)) {
            setNotice(result.message);
            setDetail((current) => isCurrentDetail(generation, reportKey) && current?.reportKey === reportKey
              ? { ...current, listingStatus: "removed", listing: { ...current.listing, saleStatus: "removed", version: result.result.version } }
              : current);
          }
          router.refresh();
        } else {
          if (isCurrentDetail(generation, reportKey)) setError(result.message);
          if (result.shouldRefresh) router.refresh();
        }
      } catch {
        if (isCurrentDetail(generation, reportKey)) {
          setError("판매글 비공개 처리를 완료하지 못했습니다. 같은 내용으로 다시 시도해 주세요.");
        }
      }
    });
  };

  return (
    <section aria-busy={isPending} aria-labelledby="market-report-list-title">
      <div className="flex flex-wrap gap-2" aria-label="신고 상태 필터">{(["received", "handled", "dismissed", "all"] as const).map((value) => <Link key={value} href={`/market/manage/listing-reports?status=${value}`} aria-current={status === value ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-bold ${status === value ? "border-pul-point bg-pul-light text-pul-deep" : "border-pul-border bg-white text-pul-muted"}`}>{statusLabels[value]}</Link>)}</div>
      <div className="mb-4 mt-5 flex items-end justify-between gap-3"><div><h2 ref={listTitleRef} tabIndex={-1} id="market-report-list-title" className="text-xl font-black">신고 목록</h2><p className="mt-1 text-sm text-pul-muted">총 {initialPage.total}건</p></div><p className="text-sm text-pul-muted">최근 접수 순 최대 {initialPage.limit}건</p></div>
      {notice ? <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 font-semibold text-emerald-900" role="status">{notice}</p> : null}
      {error ? <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 font-semibold text-rose-800" role="alert">{error}</p> : null}
      {initialPage.items.length === 0 ? <div className="rounded-2xl border border-dashed border-pul-border bg-white px-5 py-14 text-center"><p className="text-lg font-bold">조건에 맞는 판매글 신고가 없습니다.</p></div> : <div className="space-y-3">{initialPage.items.map((report) => <article key={report.reportKey} className="rounded-2xl border border-pul-border bg-white p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold text-pul-point">{reasonLabels[report.reasonCode]} · {statusLabels[report.reportStatus]}</p><h3 className="mt-1 text-lg font-black">{report.listingTitle}</h3><p className="mt-1 text-sm text-pul-muted">판매글 상태: {report.listingStatus}</p></div><button type="button" disabled={isPending} onClick={() => loadDetail(report.reportKey)} className="min-h-11 rounded-lg border border-pul-border px-4 font-bold text-pul-deep disabled:opacity-50">상세보기</button></div></article>)}</div>}

      {detail ? <aside className="mt-5 rounded-2xl border border-pul-point bg-white p-4 sm:p-6" aria-labelledby="market-report-detail-title"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold text-pul-point">{reasonLabels[detail.reasonCode]} · {statusLabels[detail.reportStatus]}</p><h2 id="market-report-detail-title" className="mt-1 text-xl font-black">{detail.listing.name}</h2><p className="mt-1 text-sm text-pul-muted">판매자 {detail.listing.sellerDisplayName} · 판매글 상태 {detail.listing.saleStatus}</p></div><button type="button" onClick={closeDetail} className="min-h-11 min-w-11 rounded-full bg-pul-page text-xl font-bold" aria-label="신고 상세 닫기">×</button></div><div className="mt-4 rounded-xl bg-pul-page p-4"><p className="text-xs font-bold text-pul-muted">신고 내용</p><p className="mt-2 whitespace-pre-wrap text-sm leading-7">{detail.note}</p></div>
        {detail.reportStatus === "received" ? <div className="mt-5 border-t border-pul-border pt-5"><h3 className="font-black">신고 처리</h3><label className="mt-2 block"><span className="text-sm font-bold">처리 메모</span><textarea rows={4} minLength={2} maxLength={500} value={resolutionNote} onChange={(event) => { setResolutionNote(event.target.value); resolutionRequestRef.current = ""; }} className="mt-1 w-full rounded-lg border border-pul-border p-3" /></label><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" disabled={isPending} onClick={() => resolve("dismissed")} className="min-h-11 rounded-lg border border-pul-border font-bold disabled:opacity-50">신고 종료</button><button type="button" disabled={isPending} onClick={() => resolve("handled")} className="min-h-11 rounded-lg bg-pul-point font-bold text-white disabled:opacity-50">처리 완료</button></div></div> : detail.resolutionNote ? <div className="mt-4 rounded-xl border border-pul-border p-4"><p className="text-xs font-bold text-pul-muted">처리 메모</p><p className="mt-2 whitespace-pre-wrap text-sm">{detail.resolutionNote}</p></div> : null}
        {detail.listing.saleStatus !== "removed" ? <div className="mt-5 border-t border-rose-100 pt-5"><h3 className="font-black text-rose-800">판매글 비공개 처리</h3><p className="mt-1 text-sm leading-6 text-pul-muted">신고 처리와 별도 작업입니다. 비공개 처리해도 신고 상태는 자동 변경되지 않습니다.</p><label className="mt-2 block"><span className="text-sm font-bold">비공개 처리 사유</span><textarea rows={3} minLength={2} maxLength={500} value={moderationReason} onChange={(event) => { setModerationReason(event.target.value); moderationRequestRef.current = ""; }} className="mt-1 w-full rounded-lg border border-rose-200 p-3" /></label><button type="button" disabled={isPending} onClick={moderate} className="mt-3 min-h-11 w-full rounded-lg bg-rose-700 font-bold text-white disabled:opacity-50">판매글 비공개 처리</button></div> : null}
      </aside> : null}
    </section>
  );
}
