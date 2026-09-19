"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { moderateContentAction } from "@/app/community/moderation-actions";
import { communityReportReasons, type CommunityReportReason } from "@/lib/community/communityReports";
import { moderationTypes, type ModerationType, type ModerationFilter, type ModerationItem, type ModerationPage } from "@/lib/community/contentModeration";

function ContentCard({ item, type, reportId }: { item: ModerationItem; type: ModerationType; reportId: string | null }) {
  const router = useRouter();
  const id = useId();
  const [reason, setReason] = useState<CommunityReportReason | "">("");
  const [reviewed, setReviewed] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);
  const canRestrict = item.baseState === "published" && !item.restricted;
  const canRestore = item.restricted && item.baseState !== "removed" && item.parentVisible;
  const run = (action: "restrict" | "restore", closeReport = false) => {
    if (!reason || !reviewed || busy.current) return;
    busy.current = true; setNotice(""); setError("");
    startTransition(async () => {
      try {
        const result = await moderateContentAction({ targetType: type, targetId: item.id, action, reason,
          expectedVersion: item.version, expectedModerationVersion: item.moderationVersion, reportId: closeReport ? reportId : null });
        if (!result.ok) { setError(result.error); return; }
        setNotice(closeReport ? "콘텐츠를 제한하고 신고를 종료했습니다." : action === "restrict" ? "콘텐츠의 공개 노출을 제한했습니다." : "운영자 제한을 해제했습니다.");
        setReviewed(false); router.refresh();
      } catch { setError("처리하지 못했습니다. 새로고침 후 다시 확인해 주세요."); }
      finally { busy.current = false; }
    });
  };
  return <article className="space-y-3 rounded-xl border border-pul-border bg-white p-5">
    <p className="text-sm font-bold text-pul-muted">{item.baseState === "removed" ? "작성자 삭제" : item.restricted ? "운영자 제한" : item.baseState === "hidden" ? "기존 비공개" : "공개 상태"}</p>
    <h2 className="break-words text-lg font-bold">{item.title}</h2>
    <p className="text-sm text-pul-muted">{new Date(item.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</p>
    <p className="whitespace-pre-wrap break-words leading-7">{item.body}</p>
    {!item.parentVisible ? <p className="text-sm text-pul-muted">상위 게시글 또는 골프장이 공개 상태가 아니어서 복원할 수 없습니다. 상위 공개 상태를 확인한 후 다시 시도해 주세요.</p> : null}
    {canRestrict || canRestore ? <div className="space-y-3 border-t border-pul-border pt-3">
      <label htmlFor={`${id}-reason`} className="block font-bold">처리 사유</label>
      <select id={`${id}-reason`} value={reason} disabled={pending} onChange={e => setReason(e.target.value as CommunityReportReason | "")} className="min-h-11 w-full rounded-lg border border-pul-border bg-white p-2">
        <option value="">사유 선택</option>{Object.entries(communityReportReasons).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
      </select>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={reviewed} disabled={pending} onChange={e => setReviewed(e.target.checked)} />대상 내용을 확인했으며 이 조치를 실행합니다.</label>
      <div className="flex flex-wrap gap-3">
        {canRestrict ? <button type="button" disabled={pending || !reason || !reviewed} onClick={() => run("restrict")} className="min-h-11 rounded-lg bg-pul-deep px-4 font-bold text-white disabled:opacity-50">콘텐츠만 제한</button> : null}
        {canRestrict && reportId ? <button type="button" disabled={pending || !reason || !reviewed} onClick={() => run("restrict", true)} className="min-h-11 rounded-lg bg-rose-700 px-4 font-bold text-white disabled:opacity-50">콘텐츠 제한 + 신고 종료</button> : null}
        {canRestore ? <button type="button" disabled={pending || !reason || !reviewed} onClick={() => run("restore")} className="min-h-11 rounded-lg bg-pul-point px-4 font-bold text-white disabled:opacity-50">운영자 제한 해제</button> : null}
      </div>
    </div> : item.parentVisible ? <p className="text-sm text-pul-muted">작성자 삭제 또는 기존 비공개 콘텐츠는 여기서 공개로 복원하지 않습니다.</p> : null}
    {notice ? <p role="status">{notice}</p> : null}{error ? <p role="alert" className="text-rose-800">{error}</p> : null}
  </article>;
}

export function ContentModerationManagement({ page, type, filter, pageNumber, targetId, reportId }: {
  page: ModerationPage; type: ModerationType; filter: ModerationFilter; pageNumber: number; targetId: string | null; reportId: string | null;
}) {
  const href = (n: number) => `/community/manage/content?${new URLSearchParams({ type, filter, page: String(n), ...(targetId ? { target: targetId } : {}), ...(reportId ? { report: reportId } : {}) })}`;
  return <section className="space-y-4" aria-label="공개 콘텐츠 관리">
    <nav aria-label="콘텐츠 종류" className="flex flex-wrap gap-3">{Object.entries(moderationTypes).map(([key, label]) => <Link key={key} href={`/community/manage/content?type=${key}`} aria-current={type === key ? "page" : undefined} className="min-h-11 rounded-lg border border-pul-border bg-white px-3 py-3 font-bold">{label}</Link>)}</nav>
    <nav aria-label="콘텐츠 상태" className="flex flex-wrap gap-3">{Object.entries({ all: "전체", published: "공개 중", restricted: "운영자 제한" }).map(([key, label]) => <Link key={key} href={`/community/manage/content?type=${type}&filter=${key}`} aria-current={filter === key ? "page" : undefined} className="min-h-11 py-3 font-bold text-pul-point">{label}</Link>)}</nav>
    <p>{page.total}건 · {pageNumber}페이지</p>
    {reportId ? <p>신고에서 연결된 대상입니다. 콘텐츠만 제한하거나, 제한과 신고 종료를 함께 처리할 수 있습니다.</p> : null}
    {page.items.length ? page.items.map(item => <ContentCard key={`${item.id}-${item.version}-${item.moderationVersion}`} item={item} type={type} reportId={targetId === item.id ? reportId : null} />) : <p>표시할 콘텐츠가 없습니다.</p>}
    <nav aria-label="콘텐츠 목록 페이지" className="flex gap-4 text-pul-point">{pageNumber > 1 ? <Link href={href(pageNumber - 1)} className="min-h-11 py-3">이전 페이지</Link> : null}{page.hasMore ? <Link href={href(pageNumber + 1)} className="min-h-11 py-3">다음 페이지</Link> : null}</nav>
  </section>;
}
