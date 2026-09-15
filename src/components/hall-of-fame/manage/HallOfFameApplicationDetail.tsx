"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { performApplicationReviewAction, performApplicationProjectionAction } from "@/app/hall-of-fame/manage/applicationActions";
import { createEvidenceSignedReadAction } from "@/app/hall-of-fame/evidence/actions";
import { APPLICANT_RECORD_TYPES, HOF_APPLICANT_STATUS } from "@/lib/hall-of-fame/hallOfFameApplicant";
import { decisionsForDetail, loadApplicationDetail, parseReviewCommand, reviewFailure, projectionFailure, type ApplicationDetail, type ApplicationPermissions, type ReviewResult, type ProjectionCommand, type ProjectionResult } from "@/lib/hall-of-fame/hallOfFameApplicationReview";

const buttonClass = "min-h-12 rounded-xl border border-pul-border px-4 py-2 font-bold disabled:cursor-not-allowed disabled:opacity-50";
const labels: Record<string, string> = {
  granted: "동의", pending: "확인 대기", declined: "거절", withdrawn: "철회", verified: "확인 완료", not_applicable: "해당 없음",
  conflict_review_required: "이해충돌 검토 필요", independent_confirmation_pending: "독립 확인 대기", replaced: "교체됨", deleted: "삭제됨",
  application_processing: "개인정보 처리", evidence_review: "증빙 심사", nomination_acceptance: "추천 수락",
  display_name_consent: "표시 이름", masked_display_name_consent: "가린 이름", full_display_name_consent: "전체 이름", avatar_consent: "프로필 사진",
  club_name_consent: "클럽 이름", record_date_consent: "기록 날짜", course_detail_consent: "구장 상세", badge_consent: "배지",
  review_started: "심사 시작", additional_info_requested: "추가 정보 요청", approval_recommended: "승인 권고", rejection_recommended: "반려 권고", final_approved: "최종 승인", final_rejected: "최종 반려",
};
const statusLabel = (value: string) => labels[value] ?? HOF_APPLICANT_STATUS[value] ?? "확인 필요";
const evidenceLabels = { scorecard: "스코어카드", round_photo: "경기 사진", supporting_document: "보충 자료" };

export function HallOfFameApplicationDecisionReceipt({ receipt, permissions }: {
  receipt: Extract<ReviewResult, { operation: "decide" }>; permissions: ApplicationPermissions;
}) {
  return <section aria-label="신청 최종 결정 결과" className="space-y-3 rounded-xl bg-pul-light p-4">
    <p role="status" className="break-all font-bold">신청 {receipt.batchId} · {HOF_APPLICANT_STATUS[receipt.status]} · 승인 {receipt.approved}건 / 반려 {receipt.rejected}건</p>
    {receipt.approved > 0 && <p>신청 승인이 완료되어 승인 기록이 생성되었습니다. 공개 게시 처리는 별도입니다.</p>}
    {receipt.decisions.filter(d => d.status === "approved" && d.canonicalId).map(d => <div key={`${receipt.batchId}:${d.id}:${d.canonicalId}`} className="space-y-2 border-t border-pul-border pt-3">
      <p className="break-all text-sm">승인 기록 번호: {d.canonicalId}</p>
      {permissions.canRead && permissions.canDecide && <ProjectionControl batchId={receipt.batchId} applicationRecordId={d.id} recordId={d.canonicalId!} />}
    </div>)}
    <p className="text-sm">신청자는 기존 내 신청 상태에서 최신 결과를 확인할 수 있습니다.</p>
  </section>;
}

function ProjectionControl({ batchId, applicationRecordId, recordId }: ProjectionCommand) {
  const [result, setResult] = useState<ProjectionResult | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const busy = useRef(false), generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    return () => { generation.current = current + 1; };
  }, [batchId, applicationRecordId, recordId]);
  const synchronize = () => {
    if (busy.current) return;
    busy.current = true; setError(""); setResult(null);
    const current = generation.current;
    startTransition(async () => {
      try {
        const response = await performApplicationProjectionAction({ batchId, applicationRecordId, recordId });
        if (current !== generation.current) return;
        if (!response.ok) { setError(response.message); return; }
        if (response.result.recordId !== recordId || response.result.applicationRecordId !== applicationRecordId || response.result.batchId !== batchId) throw new Error("projection identity mismatch");
        setResult(response.result);
      } catch { if (current === generation.current) setError(projectionFailure(null).message); }
      finally { busy.current = false; }
    });
  };
  return <div className="space-y-2" aria-busy={pending}>
    {!result && !pending && <p className="text-sm">공개 상태 동기화가 필요합니다. 공개 동의에 따라 공개 여부가 결정됩니다.</p>}
    <button type="button" className={buttonClass} disabled={pending} onClick={synchronize}>{pending ? "동기화 중…" : "공개 상태 동기화"}</button>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {result && <p role="status">동기화 완료 · {{ hidden: "비공개", published: "공개", suppressed: "공개 중단" }[result.publicationStatus]} · {result.changed ? "변경 반영" : "변경 없음"}{result.replayed ? " · 이전 요청 결과 확인" : ""}</p>}
  </div>;
}

export function HallOfFameApplicationDetail({ client, batchId, permissions, onReviewed, onDecided }: {
  client: SupabaseClient; batchId: string; permissions: ApplicationPermissions;
  onReviewed: () => void; onDecided: (result: Extract<ReviewResult, { operation: "decide" }>) => void;
}) {
  const [detail, setDetail] = useState<ApplicationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const [choices, setChoices] = useState<Record<string, { decision: string; reason: string }>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [pending, startTransition] = useTransition();
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const [evidenceError, setEvidenceError] = useState("");
  const [evidenceLink, setEvidenceLink] = useState<{ id: string; url: string; seconds: number } | null>(null);
  const alive = useRef(false);
  const busy = useRef(false);
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const evidenceSequence = useRef(0);
  useEffect(() => {
    evidenceSequence.current++;
    alive.current = true;
    let current = true;
    void loadApplicationDetail(client, batchId).then(result => {
      if (current) { setDetail(result); setLoading(false); }
    }).catch(cause => { if (current) { setDetail(null); setError(reviewFailure(cause).message); setLoading(false); } });
    return () => { current = false; alive.current = false; };
  }, [client, batchId, revision]);
  useEffect(() => {
    if (!evidenceLink) return;
    const timer = setTimeout(() => setEvidenceLink(null), evidenceLink.seconds * 1000);
    return () => clearTimeout(timer);
  }, [evidenceLink]);
  const reload = () => {
    if (busy.current) return;
    setDetail(null); setLoading(true); setError(""); setStale(false); setChoices({}); setConfirmed(false);
    setEvidenceLink(null); setEvidenceError(""); request.current = null; setRevision(v => v + 1);
  };
  const mutate = (operation: "start" | "decide") => {
    if (!detail || busy.current || stale || (operation === "start" ? !permissions.canReview : !permissions.canDecide || !confirmed)) return;
    try {
      const payload = { operation, batchId, expectedVersion: detail.batch.version,
        ...(operation === "decide" ? { decisions: decisionsForDetail(detail, choices) } : {}) };
      const fingerprint = JSON.stringify(payload);
      if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() };
      const command = parseReviewCommand({ ...payload, requestId: request.current.id });
      busy.current = true; setError("");
      startTransition(async () => {
        try {
          const response = await performApplicationReviewAction(command);
          if (!alive.current) return;
          if (!response.ok) { setError(response.message); setStale(response.shouldRefresh); return; }
          request.current = null; setStale(true); setEvidenceLink(null);
          if (response.result.operation === "start") onReviewed(); else onDecided(response.result);
        } catch { if (alive.current) { setError("처리 결과를 확인하지 못했습니다. 최신 상태를 다시 확인해 주세요."); setStale(true); } }
        finally { busy.current = false; }
      });
    } catch (cause) { setError(reviewFailure(cause).message); }
  };
  const readEvidence = (id: string) => {
    if (evidenceBusy || !detail?.records.some(r => r.evidence.some(e => e.id === id && e.status === "available"))) return;
    const sequence = ++evidenceSequence.current;
    setEvidenceBusy(true); setEvidenceLink(null); setEvidenceError("");
    startTransition(async () => {
      try {
        const result = await createEvidenceSignedReadAction(id);
        if (!alive.current || sequence !== evidenceSequence.current) return;
        if (result.evidenceId !== id || new URL(result.signedUrl).protocol !== "https:" || !Number.isInteger(result.expiresInSeconds) || result.expiresInSeconds < 1 || result.expiresInSeconds > 60) throw new Error("invalid evidence response");
        setEvidenceLink({ id, url: result.signedUrl, seconds: result.expiresInSeconds });
      } catch { if (alive.current && sequence === evidenceSequence.current) setEvidenceError("증빙을 열지 못했습니다. 운영 권한과 서버 증빙 설정을 확인해 주세요."); }
      finally { if (alive.current && sequence === evidenceSequence.current) setEvidenceBusy(false); }
    });
  };
  return <section className="min-w-0 space-y-4 rounded-xl border border-pul-border bg-pul-page p-4" aria-label="기록 신청 상세" aria-busy={loading || pending}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-xl font-bold">신청 상세</h3><button type="button" className={buttonClass} disabled={pending || loading} onClick={reload}>상세 새로고침</button></div>
    {loading && <p role="status">신청 상세를 불러오는 중입니다.</p>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {detail && <>
      <p className="break-all text-sm">신청 {detail.batch.id} · {HOF_APPLICANT_STATUS[detail.batch.status]} · 버전 {detail.batch.version}</p>
      <p className="text-sm">접수 {new Date(detail.batch.submittedAt).toLocaleString("ko-KR")} · {detail.round.date} · {detail.round.course} ({detail.round.region}) · {detail.round.environment === "screen" ? "스크린" : "야외"}</p>
      {(detail.round.layout || detail.round.event) && <p>{detail.round.layout} {detail.round.event}</p>}
      {detail.round.notes && <p className="whitespace-pre-wrap break-words">{detail.round.notes}</p>}
      <p className="text-sm text-pul-muted">심사 정보와 증빙은 운영자 확인용이며 공개되지 않습니다. 승인은 공개 게시 완료를 의미하지 않습니다.</p>
      {detail.records.map((record, index) => <article key={record.id} className="min-w-0 space-y-3 rounded-xl border border-pul-border bg-white p-4">
        <h4 className="font-bold">기록 {index + 1} · {APPLICANT_RECORD_TYPES[record.type]} · {HOF_APPLICANT_STATUS[record.status]}</h4>
        <p className="break-all text-sm">기록 {record.id} · 버전 {record.version} · 대상 회원 {record.targetUserId.slice(0, 8)}</p>
        <p>{record.segment} · {record.hole}번 홀 · 파 {record.par ?? "미제공"} · {record.strokes ?? "미제공"}타</p>
        <p className="text-sm">클럽 확인: {statusLabel(record.clubStatus)} · 회원 동의: {statusLabel(record.memberConsent)} · 이해충돌: {record.conflict ? "검토 필요" : "표시 없음"}</p>
        <ul className="text-sm">{record.consents.map(c => <li key={c.purpose}>{labels[c.purpose] ?? "신청 동의"}: {statusLabel(c.status)} · 정책 {c.policy} · 버전 {c.version}</li>)}</ul>
        <p className="text-sm">공개 동의: {record.publication ? `${statusLabel(record.publication.status)} · 정책 ${record.publication.policy} · 버전 ${record.publication.version}` : "없음"}</p>
        {record.publication && <p className="text-sm">{record.publication.flags.map(f => `${labels[f.key]} ${f.granted ? "동의" : "미동의"}`).join(" · ")}</p>}
        <p className="text-sm">유효 동반 확인 {record.companions}명 · {record.confirmations.map(c => `${statusLabel(c.status)} ${c.count}`).join(" · ")}</p>
        <div className="space-y-2"><h5 className="font-bold">증빙</h5>
          {!record.evidence.length && <p className="text-sm">등록된 증빙이 없습니다.</p>}
          {record.evidence.map(e => <div key={e.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span>{evidenceLabels[e.type]} · {statusLabel(e.status)}{e.mime ? ` · ${e.mime}` : ""}{e.bytes !== null ? ` · ${e.bytes.toLocaleString()} bytes` : ""}</span>
            <button type="button" className={buttonClass} disabled={e.status !== "available" || pending || stale} onClick={() => readEvidence(e.id)}>증빙 확인</button>
            {evidenceLink?.id === e.id && <a className="min-h-12 p-3 font-bold underline" href={evidenceLink.url} target="_blank" rel="noopener noreferrer">증빙 열기 ({evidenceLink.seconds}초 이내)</a>}
          </div>)}
        </div>
        {permissions.canDecide && detail.batch.status === "under_review" && record.status === "under_review" && <fieldset className="space-y-2 border-t border-pul-border pt-3" disabled={pending || stale}>
          <legend className="font-bold">기록 {index + 1} 최종 결정</legend>
          <label className="block">결정 선택 <select className="min-h-12 rounded-lg border border-pul-border p-2" aria-label={`기록 ${index + 1} 결정`} value={choices[record.id]?.decision ?? ""} onChange={event => { setChoices(v => ({ ...v, [record.id]: { decision: event.target.value, reason: v[record.id]?.reason ?? "" } })); setConfirmed(false); }}>
            <option value="">선택해 주세요</option><option value="approve">승인</option><option value="reject">반려</option>
          </select></label>
          {choices[record.id]?.decision === "reject" && <label className="block">반려 사유 (신청자에게 전달됩니다)<textarea className="mt-1 min-h-24 w-full rounded-lg border border-pul-border p-3" aria-label={`기록 ${index + 1} 반려 사유`} required value={choices[record.id].reason} onChange={event => { setChoices(v => ({ ...v, [record.id]: { ...v[record.id], reason: event.target.value } })); setConfirmed(false); }} /></label>}
        </fieldset>}
      </article>)}
      {evidenceError && <p role="alert" className="text-red-700">{evidenceError}</p>}
      {detail.events.length > 0 && <details><summary className="min-h-12 cursor-pointer py-3 font-bold">심사 이력 {detail.events.length}건</summary><ul className="text-sm">{detail.events.map(e => <li key={e.id}>{statusLabel(e.action)} · {new Date(e.createdAt).toLocaleString("ko-KR")}</li>)}</ul></details>}
      {detail.batch.status === "submitted" && permissions.canReview && <button type="button" disabled={pending || stale} className={`${buttonClass} bg-pul-deep text-white`} onClick={() => mutate("start")}>심사 시작</button>}
      {detail.batch.status === "under_review" && permissions.canDecide && <div className="space-y-3">
        <label className="flex min-h-12 items-center gap-2"><input type="checkbox" checked={confirmed} disabled={pending || stale} onChange={event => setConfirmed(event.target.checked)} />모든 기록의 결정과 반려 사유를 확인했습니다.</label>
        <button type="button" className={`${buttonClass} bg-pul-deep text-white`} disabled={!confirmed || pending || stale} onClick={() => mutate("decide")}>최종 결정 확정</button>
      </div>}
      {detail.batch.status === "under_review" && !permissions.canDecide && <p className="text-sm text-pul-muted">최종 결정은 승인 권한을 가진 플랫폼 관리자만 진행할 수 있습니다.</p>}
      {detail.batch.status === "additional_info_required" && <p className="text-sm">추가 정보가 필요한 신청입니다. 현재 상태에서는 심사 시작이나 최종 결정을 실행할 수 없습니다.</p>}
    </>}
  </section>;
}
