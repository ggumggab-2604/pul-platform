"use client";

import Link from "next/link";
import { useId, useRef, useState, useTransition } from "react";
import { submitCommunityReportAction } from "@/app/community/report-actions";
import { communityReportReasons, type CommunityReportReason, type CommunityReportTarget } from "@/lib/community/communityReports";

export function CommunityReportForm({ targetType, targetId, postId }: { targetType: CommunityReportTarget; targetId: string; postId: string }) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const [reason, setReason] = useState<CommunityReportReason | "">("");
  const [detail, setDetail] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [pending, startTransition] = useTransition();
  const submitting = useRef(false);
  const next = `/community/${postId}${targetType === "comment" ? `#comment-${targetId}` : ""}`;
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!reason || submitting.current) return;
    submitting.current = true;
    setError(""); setNeedsLogin(false);
    startTransition(async () => {
      try {
        const result = await submitCommunityReportAction({ targetType, targetId, reason, detail });
        if (!result.ok) { setError(result.error); setNeedsLogin(result.needsLogin); return; }
        setNotice(result.data.duplicate ? "이미 접수된 신고가 있습니다. 운영자가 확인하겠습니다." : "신고가 접수되었습니다.");
        setExpanded(false); setDetail("");
      } catch { setError("신고를 제출하지 못했습니다. 잠시 후 다시 시도해 주세요."); }
      finally { submitting.current = false; }
    });
  };
  return (
    <div className="mt-2 text-sm">
      <button type="button" aria-expanded={expanded} aria-controls={`${id}-form`} disabled={pending || !!notice}
        onClick={() => setExpanded(!expanded)} className="min-h-11 px-2 font-semibold text-pul-muted disabled:opacity-50">
        {targetType === "post" ? "게시글 신고" : "댓글 신고"}
      </button>
      {notice ? <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-900">{notice}</p> : null}
      {expanded ? <form id={`${id}-form`} onSubmit={submit} className="max-w-xl space-y-3 rounded-lg border border-pul-border bg-slate-50 p-4">
        <p className="text-pul-muted">정상 활동 중인 로그인 회원만 신고할 수 있습니다.</p>
        <label htmlFor={`${id}-reason`} className="block font-bold">신고 이유</label>
        <select id={`${id}-reason`} required disabled={pending} value={reason} onChange={event => setReason(event.target.value as CommunityReportReason)} className="min-h-11 w-full rounded-lg border border-pul-border bg-white p-2 text-base">
          <option value="">이유를 선택해 주세요</option>
          {Object.entries(communityReportReasons).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <label htmlFor={`${id}-detail`} className="block font-bold">추가 설명 (선택, 1,000자 이내)</label>
        <textarea id={`${id}-detail`} rows={3} maxLength={1000} disabled={pending} value={detail} onChange={event => setDetail(event.target.value)} className="w-full rounded-lg border border-pul-border p-3 text-base" />
        {error ? <p role="alert" className="text-rose-800">{error} {needsLogin ? <Link href={`/login?next=${encodeURIComponent(next)}`} className="underline">로그인하기</Link> : null}</p> : null}
        <div className="flex gap-2">
          <button type="submit" disabled={pending || !reason} className="min-h-11 rounded-lg bg-pul-point px-4 font-bold text-white disabled:opacity-50">{pending ? "접수 중…" : "신고 제출"}</button>
          <button type="button" disabled={pending} onClick={() => setExpanded(false)} className="min-h-11 rounded-lg border border-pul-border px-4">취소</button>
        </div>
      </form> : null}
    </div>
  );
}
