"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { resolveCommunityReportAction } from "@/app/community/report-actions";
import { communityReportReasons, type CommunityReportFilter, type CommunityReportPage } from "@/lib/community/communityReports";

const statusLabels = { open: "미처리", resolved: "검토 완료", all: "전체" } as const;
const targetLabels = { published: "공개 중", hidden: "숨김", removed: "삭제됨" } as const;
const formatDate = (value: string) => new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

export function CommunityReportManagement({ page, status, pageNumber }: { page: CommunityReportPage; status: CommunityReportFilter; pageNumber: number }) {
  const router = useRouter();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const submitting = useRef(false);
  const resolve = (id: string) => {
    if (submitting.current) return;
    submitting.current = true;
    setNotice(""); setError("");
    startTransition(async () => {
      try {
        const result = await resolveCommunityReportAction(id);
        if (!result.ok) { setError(result.error); return; }
        setNotice("신고를 검토 완료로 표시했습니다.");
        router.refresh();
      } catch { setError("처리하지 못했습니다. 잠시 후 다시 시도해 주세요."); }
      finally { submitting.current = false; }
    });
  };
  return (
    <section className="space-y-4" aria-label="커뮤니티 신고 목록">
      <nav aria-label="신고 상태" className="flex flex-wrap gap-2">
        {Object.entries(statusLabels).map(([value, label]) => <Link key={value} href={`/community/manage/reports?status=${value}`} aria-current={status === value ? "page" : undefined} className={`min-h-11 rounded-lg border px-4 py-3 font-bold ${status === value ? "bg-pul-deep text-white" : "border-pul-border bg-white"}`}>{label}</Link>)}
      </nav>
      <p className="text-sm text-pul-muted">{statusLabels[status]} {page.total}건 · {pageNumber}페이지</p>
      {notice ? <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-900">{notice}</p> : null}
      {error ? <p role="alert" className="rounded-lg bg-rose-50 p-3 text-rose-800">{error}</p> : null}
      {page.items.length === 0 ? <p className="rounded-xl border border-pul-border bg-white p-6">이 페이지에 표시할 신고가 없습니다.</p> : <ul className="space-y-4">
        {page.items.map(report => <li key={report.id} className="space-y-3 rounded-xl border border-pul-border bg-white p-5">
          <p className="text-sm font-bold text-pul-muted">{report.targetType === "post" ? "게시글" : "댓글"} · {targetLabels[report.targetState]} · {statusLabels[report.status]}</p>
          <h2 className="break-words text-lg font-bold">{report.title}</h2>
          <p className="text-sm text-pul-muted">접수 {formatDate(report.createdAt)}{report.resolvedAt ? ` · 검토 완료 ${formatDate(report.resolvedAt)}` : ""}</p>
          <p className="font-bold">신고 이유: {communityReportReasons[report.reason]}</p>
          {report.detail ? <p className="whitespace-pre-wrap break-words leading-7">{report.detail}</p> : null}
          <details className="rounded-lg bg-slate-50 p-3">
            <summary className="cursor-pointer font-bold">신고 대상 내용 확인</summary>
            <p className="mt-3 whitespace-pre-wrap break-words leading-7">{report.body}</p>
          </details>
          <div className="flex flex-wrap items-center gap-3">
            {report.targetState === "published" ? <Link href={`/community/${report.postId}${report.commentId ? `#comment-${report.commentId}` : ""}`} className="inline-flex min-h-11 items-center font-bold text-pul-point underline">게시글에서 확인</Link> : <span className="text-sm text-pul-muted">공개 화면에서는 확인할 수 없습니다.</span>}
            {report.status === "open" ? <button type="button" disabled={pending} onClick={() => resolve(report.id)} className="min-h-11 rounded-lg bg-pul-point px-4 font-bold text-white disabled:opacity-50">검토 완료로 표시</button> : null}
          </div>
        </li>)}
      </ul>}
      <nav aria-label="신고 목록 페이지" className="flex gap-4 font-bold text-pul-point">
        {pageNumber > 1 ? <Link className="min-h-11 py-3" href={`/community/manage/reports?status=${status}&page=${pageNumber - 1}`}>이전 페이지</Link> : null}
        {page.hasMore ? <Link className="min-h-11 py-3" href={`/community/manage/reports?status=${status}&page=${pageNumber + 1}`}>다음 페이지</Link> : null}
      </nav>
    </section>
  );
}
