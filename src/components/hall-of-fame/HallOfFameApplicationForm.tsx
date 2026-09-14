"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { performApplicantAction, type ApplicantActionInput, type ApplicantActionResult } from "@/app/hall-of-fame/apply/actions";
import { APPLICANT_RECORD_TYPES, HOF_APPLICANT_STATUS, applicantError, validateApplicantInput, type ApplicantBatch, type ApplicantEligibility, type ApplicantWorkspace } from "@/lib/hall-of-fame/hallOfFameApplicant";
import { HALL_OF_FAME_EVIDENCE_MAX_BYTES, isHallOfFameEvidenceMimeType } from "@/lib/hall-of-fame/hallOfFameEvidenceValidation";

const button = "inline-flex min-h-12 items-center justify-center rounded-xl bg-pul-deep px-5 py-2 text-base font-bold text-white hover:bg-pul-point disabled:opacity-50";
const secondary = "inline-flex min-h-12 items-center justify-center rounded-xl border border-pul-border px-4 py-2 font-bold text-pul-deep disabled:opacity-50";
const field = "mt-1 min-h-12 w-full min-w-0 rounded-lg border border-pul-border bg-white px-3 text-base";
const section = "rounded-2xl border border-pul-border bg-white p-4 sm:p-6 space-y-4";
type Command = Omit<ApplicantActionInput, "sessionUserId" | "requestId">;

function RecordFields({ batch, types, save, busy }: { batch: ApplicantBatch; types: ApplicantWorkspace["record_types"]; save: (fields: unknown) => void; busy: boolean }) {
  const [type, setType] = useState<string>(types[0]?.code ?? "hole_in_one");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    save({ ...Object.fromEntries(form), hole_number: Number(form.get("hole_number")), hole_par: form.get("hole_par") ? Number(form.get("hole_par")) : null, strokes: Number(form.get("strokes")) });
  };
  return <form onSubmit={submit} className="space-y-4">
    <fieldset disabled={busy} className="grid min-w-0 gap-4 sm:grid-cols-2">
      <legend className="mb-4 text-xl font-bold">기록 정보</legend>
      <label>기록 종류<select name="record_type_code" value={type} onChange={e => setType(e.target.value)} className={field}>{types.map(t => <option key={t.code} value={t.code}>{t.name}</option>)}</select></label>
      <label>기록 일자<input name="played_on" type="date" required defaultValue={batch.round?.played_on} className={field} /></label>
      <label>골프장명<input name="course_name" required maxLength={200} defaultValue={batch.round?.course_name} className={field} /></label>
      <label>골프장 지역<input name="course_region" required maxLength={100} defaultValue={batch.round?.course_region} placeholder="예: 서울특별시 마포구" className={field} /></label>
      <label>경기 환경<select name="course_environment" defaultValue={batch.round?.course_environment ?? "outdoor"} className={field}><option value="outdoor">야외</option><option value="screen">스크린</option></select></label>
      <label>경기 유형<select name="round_type" defaultValue={batch.round?.round_type ?? "casual"} className={field}><option value="casual">일반 라운드</option><option value="club_event">동호회 행사</option><option value="tournament">대회</option><option value="practice">연습</option></select></label>
      <label>코스 구간<input name="course_segment" required maxLength={100} placeholder="예: A코스" className={field} /></label>
      <label>홀 번호<input name="hole_number" type="number" required min={1} max={36} className={field} /></label>
      <label>기준 타수 (파){type === "hole_in_one" ? " · 선택" : ""}<input name="hole_par" type="number" required={type !== "hole_in_one"} min={1} max={9} className={field} /></label>
      <label>실제 타수<input name="strokes" type="number" required min={1} max={99} defaultValue={1} className={field} /></label>
    </fieldset>
    <p className="text-sm leading-6 text-pul-muted">홀인원은 1타, 알바트로스는 파보다 3타 이상, 콘도르는 파보다 4타 이상 적은 기록입니다. 저장 후 동의·스코어카드·동반 확인을 완료하면 신청할 수 있습니다.</p>
    <button disabled={busy || types.length === 0} className={button}>기록 저장</button>
  </form>;
}

type ApplicationFormProps = {
  userId: string; workspace: ApplicantWorkspace; eligibility: ApplicantEligibility; selectedBatchId: string | null; offset: number;
};

export function HallOfFameApplicationForm(props: ApplicationFormProps) {
  const recordId = props.workspace.applications.find(b => b.id === props.selectedBatchId)?.records[0]?.id;
  return <ApplicationFormSession key={`${props.userId}:${props.selectedBatchId ?? "list"}:${recordId ?? "empty"}`} {...props} />;
}

function ApplicationFormSession({ userId, workspace, eligibility, selectedBatchId, offset }: ApplicationFormProps) {
  const router = useRouter();
  const client = useMemo(() => createClient(), []);
  const [sessionMatches, setSessionMatches] = useState(false);
  const identity = useRef(false);
  const identityEpoch = useRef(0);
  const observedUser = useRef<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [notice, setNotice] = useState<ApplicantActionResult | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const createRequest = useRef<string | null>(null);
  const [clubId, setClubId] = useState(eligibility.vacant_context_clubs[0]?.club_id ?? "");
  const [file, setFile] = useState<File | null>(null);
  useEffect(() => {
    let disposed = false;
    let revision = 0;
    const update = (id: string | undefined) => {
      if (disposed) return;
      if (observedUser.current !== id) { identityEpoch.current++; observedUser.current = id; }
      identity.current = id === userId;
      setSessionMatches(identity.current);
      if (!identity.current) { setNotice(null); setFile(null); router.refresh(); }
    };
    const { data } = client.auth.onAuthStateChange((_event, session) => { revision++; update(session?.user.id); });
    const initialRevision = revision;
    void client.auth.getSession().then(({ data }) => { if (revision === initialRevision) update(data.session?.user.id); }).catch(() => update(undefined));
    const signOut = () => { revision++; update(undefined); };
    window.addEventListener("pul-auth-signed-out", signOut);
    return () => {
      // A different application/record gets a new form; invalidate this form's pending work.
      disposed = true; identity.current = false;
      data.subscription.unsubscribe(); window.removeEventListener("pul-auth-signed-out", signOut);
    };
  }, [client, router, userId]);
  useEffect(() => { if (notice) noticeRef.current?.focus(); }, [notice]);

  const run = (command: Command, uploadFile?: File) => {
    if (busyRef.current || !identity.current) return;
    busyRef.current = true;
    setBusy(true);
    setNotice(null);
    const epoch = identityEpoch.current;
    const sameSession = () => identity.current && epoch === identityEpoch.current;
    startTransition(async () => {
      try {
        const requestId = command.operation === "create" ? (createRequest.current ??= crypto.randomUUID()) : crypto.randomUUID();
        let result = await performApplicantAction({ ...command, sessionUserId: userId, requestId });
        if (!sameSession()) return;
        if (result.ok && result.upload && uploadFile) {
          const upload = result.upload;
          const response = await fetch(upload.signedUrl, { method: "PUT", headers: { "Content-Type": upload.mimeType, "x-upsert": "false" }, body: uploadFile });
          if (!response.ok) throw new Error("HOF_EVIDENCE_UPLOAD_FAILED");
          if (!sameSession()) return;
          result = await performApplicantAction({ operation: "finalize", sessionUserId: userId, requestId: crypto.randomUUID(), batchId: command.batchId, expectedVersion: upload.batchVersion, evidenceId: upload.evidenceId });
        }
        if (!sameSession()) return;
        setNotice(result);
        if (result.ok && command.operation === "create" && result.batchId) {
          createRequest.current = null;
          router.push(`/hall-of-fame/apply?batch=${result.batchId}`);
        }
        router.refresh();
      } catch (error) {
        if (sameSession()) { setNotice({ ok: false, message: applicantError(error) }); router.refresh(); }
      } finally { busyRef.current = false; setBusy(false); }
    });
  };
  if (!sessionMatches) return <p role="status">로그인 상태를 확인하고 있습니다.<Link className="ml-2 underline" href="/login?next=/hall-of-fame/apply">로그인</Link></p>;
  const batch = workspace.applications.find(b => b.id === selectedBatchId);
  const record = batch?.records[0];
  const command = (operation: Command["operation"], rest: Partial<Command> = {}) => run({ operation, batchId: batch?.id, expectedVersion: batch?.version, ...rest });
  const consentReady = record?.processing_consent && record.review_consent && record.publication_consent;
  const scorecardReady = record?.evidence.some(e => e.evidence_type === "scorecard" && e.status === "available");
  const confirmationReady = record?.confirmations.some(c => c.status === "confirmed" && c.active);
  const unresolved = record?.evidence.some(e => ["pending_upload", "uploaded_unverified"].includes(e.status));
  return <div className="space-y-6" aria-busy={busy}>
    {notice && <div ref={noticeRef} tabIndex={-1} role={notice.ok ? "status" : "alert"} className={`${section} focus:outline-2 ${notice.ok ? "border-emerald-300" : "border-red-300"}`}>
      <p>{notice.message}</p>{notice.submitted && <Link className={button} href="/hall-of-fame?tab=applications#my-hall-of-fame">내 신청 상태 확인</Link>}
    </div>}
    <div className="flex flex-wrap gap-2"><Link className={secondary} href="/hall-of-fame?tab=applications#my-hall-of-fame">내 신청 상태</Link><button disabled={busy} className={secondary} onClick={() => router.refresh()}>최신 상태 확인</button></div>
    {selectedBatchId && !batch && <p role="alert">신청을 찾을 수 없습니다. 본인의 신청 목록에서 다시 선택해 주세요.</p>}
    {batch ? <section className={section}>
      <h2 className="text-xl font-bold">내 신청 · {HOF_APPLICANT_STATUS[batch.status] ?? "상태 확인 필요"}</h2>
      {batch.round && record && <p className="break-words leading-7">{APPLICANT_RECORD_TYPES[record.record_type_code]} · {batch.round.played_on}<br />{batch.round.course_name} · {record.course_segment} {record.hole_number}번 홀 · {record.strokes}타</p>}
      {batch.status === "draft" && batch.records.length <= 1 && <>
        {!record ? <RecordFields key={batch.id} batch={batch} types={workspace.record_types} busy={busy} save={fields => {
          try { command("save", { fields: validateApplicantInput(fields) }); } catch (error) { setNotice({ ok: false, message: applicantError(error) }); }
        }} /> : <>
          <form onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); command("consent", { consents: ["processing", "review", "publication"].map(key => form.get(key) === "on") }); }} className="space-y-3 border-t border-pul-border pt-4">
            <h3 className="text-lg font-bold">필수 동의 {consentReady && "· 저장됨"}</h3>
            <label className="flex gap-3"><input type="checkbox" name="processing" required defaultChecked={record.processing_consent} disabled={busy} className="h-5 w-5 shrink-0" /><span>기록 신청 처리에 필요한 입력 정보 이용에 동의합니다.</span></label>
            <label className="flex gap-3"><input type="checkbox" name="review" required defaultChecked={record.review_consent} disabled={busy} className="h-5 w-5 shrink-0" /><span>권한 있는 운영자의 스코어카드 검토에 동의합니다. 다른 사람의 불필요한 연락처 등은 가리고 첨부합니다.</span></label>
            <label className="flex gap-3"><input type="checkbox" name="publication" required defaultChecked={record.publication_consent} disabled={busy} className="h-5 w-5 shrink-0" /><span>승인 후 마스킹한 이름, 기록 일자, 골프장·코스 정보의 공개에 동의합니다.</span></label>
            <button disabled={busy} className={secondary}>동의 저장</button>
          </form>
          <div className="space-y-3 border-t border-pul-border pt-4">
            <h3 className="text-lg font-bold">스코어카드 {scorecardReady && "· 준비됨"}</h3>
            <label className="block">파일 선택 (JPG·PNG·WebP·PDF, 최대 10MB)<input className="mt-2 block min-h-12 w-full min-w-0 text-sm" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={busy} onChange={e => setFile(e.target.files?.[0] ?? null)} /></label>
            <button className={secondary} disabled={busy || !file} onClick={() => {
              if (!file || !isHallOfFameEvidenceMimeType(file.type) || file.size < 1 || file.size > HALL_OF_FAME_EVIDENCE_MAX_BYTES) { setNotice({ ok: false, message: "10MB 이하의 JPG·PNG·WebP·PDF 파일을 선택해 주세요." }); return; }
              run({ operation: "upload", batchId: batch.id, expectedVersion: batch.version, mimeType: file.type, byteSize: file.size }, file);
            }}>스코어카드 첨부</button>
            {record.evidence.map((e, index) => <div key={e.id} className="flex flex-wrap items-center gap-2"><span>첨부 {index + 1} · {HOF_APPLICANT_STATUS[e.status] ?? "상태 확인 필요"}</span>{["pending_upload", "uploaded_unverified"].includes(e.status) && <button disabled={busy} className={secondary} onClick={() => command("finalize", { evidenceId: e.id })}>업로드한 파일 검증</button>}<button disabled={busy} className={secondary} onClick={() => command("withdrawEvidence", { evidenceId: e.id })}>첨부 취소</button></div>)}
          </div>
          <form className="space-y-3 border-t border-pul-border pt-4" onSubmit={e => { e.preventDefault(); command("requestConfirmation", { confirmerCode: String(new FormData(e.currentTarget).get("code")) }); }}>
            <h3 className="text-lg font-bold">동반 회원 확인 {confirmationReady && "· 완료"}</h3>
            <p className="text-sm leading-6">함께 경기한 PUL 회원에게 이 신청 화면의 ‘내 동반 확인 코드’를 받아 입력하세요. 요청받은 회원이 아래 ‘받은 동반 확인 요청’에서 직접 확인해야 합니다. 요청 유효기간은 14일입니다.</p>
            <label className="block">동반 회원의 확인 코드<input name="code" required maxLength={36} className={field} disabled={busy} autoComplete="off" /></label>
            <button className={secondary} disabled={busy}>동반 확인 요청</button>
            {record.confirmations.length > 0 && <p className="text-sm leading-6">동반 회원에게 아래 확인 요청 번호를 함께 전달하세요. 받은 요청의 번호와 경기 정보가 모두 일치하는지 대조해 주세요.</p>}
            {record.confirmations.map((c, index) => <div key={c.id} className="min-w-0 space-y-1"><p>요청 {index + 1} · {HOF_APPLICANT_STATUS[c.status] ?? "상태 확인 필요"}{!c.active && " · 현재 확인자 활동 상태를 확인해 주세요."}</p><p className="text-sm">확인 요청 번호 <span className="block break-all font-mono select-all">{c.id}</span></p></div>)}
          </form>
          <div className="space-y-3 border-t border-pul-border pt-4"><p className="leading-7">{consentReady && scorecardReady && confirmationReady && !unresolved ? "필수 준비가 완료되었습니다. 최종 신청 시 현재 자격과 기록을 다시 확인합니다." : "필수 동의, 검증된 스코어카드와 동반 회원 확인이 모두 필요합니다. 미완료 첨부는 검증하거나 취소해 주세요."}</p><button disabled={busy || !consentReady || !scorecardReady || !confirmationReady || unresolved} className={`${button} w-full`} onClick={() => command("submit")}>신청하기</button></div>
        </>}
        <button disabled={busy} className={secondary} onClick={() => command("discard")}>작성 중인 신청 취소</button>
      </>}
      {batch.records.length > 1 && <p>여러 기록이 포함된 기존 신청은 이 단일 기록 작성 화면에서 편집할 수 없습니다.</p>}
      <Link className={secondary} href="/hall-of-fame/apply">신청 목록으로</Link>
    </section> : <section className={section}>
      <h2 className="text-xl font-bold">본인 기록 신청 시작</h2>
      {eligibility.can_create_direct_application ? <>
        {eligibility.eligibility_code === "direct_application_allowed_due_to_admin_vacancy" && <label className="block">운영자 공석 동호회<select value={clubId} onChange={e => { setClubId(e.target.value); createRequest.current = null; }} className={field} disabled={busy}>{eligibility.vacant_context_clubs.map(c => <option key={c.club_id} value={c.club_id}>{c.club_name}</option>)}</select></label>}
        <p>기록을 저장하고 스코어카드와 동반 확인을 준비하세요. 작성 중인 신청은 아래 목록에서 이어갈 수 있습니다.</p>
        <button disabled={busy || workspace.record_types.length === 0} className={button} onClick={() => run({ operation: "create", clubId })}>새 신청 작성</button>
      </> : <p>{eligibility.eligibility_code === "club_nomination_required" ? "운영자가 있는 동호회 소속 회원은 동호회 추천 경로 대상입니다. 동호회 운영자에게 기록 추천을 문의해 주세요." : "현재 계정 또는 동호회 활동 상태로는 본인 기록을 직접 신청할 수 없습니다."}</p>}
      <h3 className="pt-2 font-bold">작성·접수한 본인 신청</h3>
      {workspace.applications.length === 0 && <p>신청 내역이 없습니다.</p>}
      {workspace.applications.map(b => <Link className={`${secondary} flex w-full justify-between gap-3 text-left`} key={b.id} href={`/hall-of-fame/apply?batch=${b.id}`}><span className="min-w-0 break-words">{b.round ? `${b.round.played_on} · ${b.round.course_name}` : "기록 입력 전"}</span><span className="shrink-0">{HOF_APPLICANT_STATUS[b.status] ?? "상태 확인"}</span></Link>)}
    </section>}
    <section className={section}>
      <h2 className="text-xl font-bold">받은 동반 확인 요청</h2>
      <label className="block">내 동반 확인 코드<input readOnly value={userId} className={`${field} font-mono text-sm`} onFocus={e => e.currentTarget.select()} /></label>
      <p className="text-sm leading-6">함께 경기한 신청자에게만 이 코드를 전달하세요. 코드를 전달해도 확인이 자동으로 완료되지는 않습니다. 신청자가 전달한 확인 요청 번호와 아래 번호, 경기 정보가 모두 일치하는지 대조한 뒤 응답해 주세요.</p>
      {workspace.incoming_confirmations.length === 0 && <p>응답할 동반 확인 요청이 없습니다.</p>}
      {workspace.incoming_confirmations.map(c => <div className="min-w-0 space-y-3 rounded-xl border border-pul-border p-4" key={c.id}><p className="text-sm">확인 요청 번호 <span className="block break-all font-mono select-all">{c.id}</span></p><p className="break-words leading-7">{c.played_on} · {c.course_name}<br />{APPLICANT_RECORD_TYPES[c.record_type_code]} · {c.course_segment} {c.hole_number}번 홀 · {c.strokes}타</p><p className="text-sm">응답 기한: {new Date(c.expires_at).toLocaleDateString("ko-KR")}</p><div className="flex flex-wrap gap-2"><button disabled={busy} className={button} onClick={() => run({ operation: "respond", expectedVersion: c.batch_version, confirmationId: c.id, response: "confirm" })}>함께 경기한 기록 확인</button><button disabled={busy} className={secondary} onClick={() => run({ operation: "respond", expectedVersion: c.batch_version, confirmationId: c.id, response: "decline" })}>확인 거절</button></div></div>)}
    </section>
    <nav aria-label="신청과 동반 확인 목록 페이지" className="flex flex-wrap gap-3">{offset > 0 && <Link className={secondary} href={`/hall-of-fame/apply?offset=${Math.max(0, offset - 10)}`}>이전 목록</Link>}{!selectedBatchId && (workspace.applications.length === 10 || workspace.incoming_confirmations.length === 10) && offset < 10000 && <Link className={secondary} href={`/hall-of-fame/apply?offset=${offset + 10}`}>다음 목록</Link>}</nav>
  </div>;
}
