"use client";
import { useRef, useState } from "react";
import { contentKeys, validateContent, type ContentCommand, type ContentKey, type ContentManagement, type ContentRevision } from "@/lib/market/marketContent";
import { loadMarketContentManagementAction, saveMarketContentAction } from "@/app/market/manage/content/actions";
import { MarketDialog } from "../MarketDialog";
import { MarketContentBody } from "../MarketManagedContent";

const labels = { checklist: "중고 구매 체크리스트", beginner: "초보 이용 안내", safety: "안전거래·신고 안내", help: "이용 도움말", policy: "거래 정책" };
const field = "mt-1 w-full min-w-0 rounded-lg border border-pul-border bg-white p-3 text-base";
const button = "min-h-11 rounded-lg border border-pul-border px-3 py-2 text-sm font-bold disabled:opacity-50";
export function MarketContentManagement({ initial }: { initial: ContentManagement }) {
  const [data, setData] = useState(initial), [draft, setDraft] = useState<ContentRevision | null>(null);
  const [sectionsText, setSectionsText] = useState(""), [preview, setPreview] = useState<ContentRevision | null>(null), [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [dirty, setDirty] = useState(false);
  const pending = useRef<ContentCommand | null>(null);
  const uploadRequest = useRef<{ id: string; key: string } | null>(null);
  const [uncertain, setUncertain] = useState(false);
  function edit(key: ContentKey) {
    if (dirty || uncertain) { setMessage("작성 중인 초안을 저장하거나 아래 ‘편집 닫기’로 닫은 뒤 다른 항목을 선택하세요."); return; }
    const old = data.drafts.find(r => r.key === key), current = data.current[key];
    if (!current) { setMessage("초기 안내 자료를 확인할 수 없습니다."); return; }
    const next: ContentRevision = old ?? { ...current, id: crypto.randomUUID(), revision: 0, state: "draft", consentVersion: null, publishedAt: null, baseId: current.id, reason: "" };
    setDraft(next); setSectionsText(JSON.stringify(next.content.sections, null, 2)); setMessage(""); setDirty(!old); pending.current = null;
  }
  function changed(next: ContentRevision) { setDraft(next); setDirty(true); pending.current = null; }
  const sections = JSON.parse(sectionsText || "[]") as ContentRevision["content"]["sections"];
  function setSections(next: typeof sections) { setSectionsText(JSON.stringify(next, null, 2)); setDirty(true); pending.current = null; }
  function parsedDraft() {
    if (!draft) throw new Error("초안을 선택해 주세요.");
    const next = { ...draft, content: { ...draft.content, sections: JSON.parse(sectionsText) } };
    validateContent(next.content); return next;
  }
  async function reload() {
    setBusy(true);
    try {
      const result = await loadMarketContentManagementAction();
      if (!result.ok) { setMessage(result.message); return; }
      setData(result.data);
      const request = pending.current;
      if (request) {
        const actual = [...result.data.drafts, ...result.data.history, ...Object.values(result.data.current)].find(r => r?.id === request.draftId && r.revision > request.expectedRevision);
        if (actual) {
          // A reload alone cannot prove request identity. Keep the same token for DB replay confirmation.
          setMessage("변경된 결과가 있습니다. 같은 요청 재확인으로 이번 요청의 처리 결과를 확인해 주세요.");
        } else setMessage("아직 처리 결과를 확인할 수 없습니다. 같은 요청 재확인을 사용하세요.");
      } else setMessage("게시본과 이력을 다시 조회했습니다. 편집 중 입력은 유지됩니다.");
    } catch { setMessage("조회에 실패했습니다. 기존 화면과 입력을 유지합니다."); } finally { setBusy(false); }
  }
  async function save(operation: "save" | "publish") {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const next = parsedDraft();
      if (!next.reason.trim()) throw new Error("변경 사유를 입력해 주세요.");
      const input = pending.current ?? { operation, key: next.key, draftId: next.id, expectedRevision: next.revision, baseId: next.baseId, requestId: crypto.randomUUID(), content: next.content, reason: next.reason };
      pending.current = input;
      const result = await saveMarketContentAction(input);
      if (!result.ok) {
        setUncertain(result.code === "uncertain");
        if (result.code !== "uncertain") pending.current = null;
        setMessage(result.message); return;
      }
      pending.current = null; setUncertain(false); setDirty(false); setConfirm(false);
      setDraft(result.revision.state === "draft" ? result.revision : null);
      if (result.revision.state === "draft") setSectionsText(JSON.stringify(result.revision.content.sections, null, 2));
      const read = await loadMarketContentManagementAction();
      if (read.ok) { setData(read.data); setMessage(input.operation === "publish" ? "게시 결과를 다시 조회해 확인했습니다." : "초안을 저장하고 다시 조회했습니다. 공개 화면은 변경되지 않았습니다."); }
      else setMessage("저장은 확인됐지만 다시 조회하지 못했습니다. 결과 다시 확인을 눌러 주세요.");
    } catch (error) { if (pending.current) { setUncertain(true); setMessage("응답을 확인하지 못했습니다. 결과를 다시 조회하고 같은 요청 재확인을 사용하세요."); } else setMessage(error instanceof Error ? error.message : "입력을 확인해 주세요."); } finally { setBusy(false); }
  }
  async function upload(file: File | undefined) {
    if (!file || !draft || busy) return;
    setBusy(true);
    try {
      const body = new FormData(); body.set("file", file); body.set("draftId", draft.id);
      const fileKey = [file.name, file.size, file.type, file.lastModified].join(":");
      if (uploadRequest.current?.key !== fileKey) uploadRequest.current = { id: crypto.randomUUID(), key: fileKey };
      body.set("requestId", uploadRequest.current.id);
      const response = await fetch("/market/manage/content/attachments", { method: "POST", body });
      const result = await response.json();
      if (!response.ok || typeof result.id !== "string") throw new Error(result.message ?? "첨부 응답을 확인하지 못했습니다. 같은 파일로 다시 확인해 주세요.");
      changed({ ...draft, content: { ...draft.content, attachments: [...new Set([...draft.content.attachments, result.id])] } });
      uploadRequest.current = null; setMessage("첨부를 확인했습니다. 초안을 저장해 연결을 확정하세요.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "첨부를 확인하지 못했습니다."); } finally { setBusy(false); }
  }
  return <div className="min-w-0 space-y-5">
    <p className="text-pul-muted">초안은 공개되지 않습니다. 게시된 정책 원문·첨부·동의 기록은 보존됩니다.</p>
    <button className={button} disabled={busy} onClick={reload}>결과 다시 확인</button>
    {message ? <p role="status" className="break-words rounded-lg bg-amber-50 p-3">{message}</p> : null}
    {uncertain ? <div role="alert" className="space-y-2"><p>처리 결과가 불확실합니다. 입력 변경 없이 결과를 확인하세요.</p><button className={button} disabled={busy} onClick={() => save(pending.current?.operation ?? "save")}>같은 요청 재확인</button></div> : null}
    <section aria-label="안내·정책 목록" className="grid gap-3 sm:grid-cols-2">{contentKeys.map(key => <article key={key} className="min-w-0 rounded-xl border border-pul-border bg-white p-4">
      <h2 className="text-lg font-bold">{labels[key]}</h2><p className="my-2 break-all text-sm text-pul-muted">{key === "policy" ? `현재 유효 정책 · ${data.current[key]?.consentVersion ?? "확인 필요"}` : "정해진 장터 안내 위치"}{data.drafts.some(r => r.key === key) ? " · 작업 중 초안 있음" : ""}</p>
      <div className="flex flex-wrap gap-2"><button className={button} disabled={busy || uncertain} onClick={() => edit(key)}>초안 편집</button><button className={button} disabled={!data.current[key]} onClick={() => setPreview(data.current[key]!)}>현재 게시본 보기</button></div>
    </article>)}</section>
    {draft ? <section aria-label="초안 편집" className="min-w-0 space-y-4 rounded-xl border border-pul-border bg-white p-4">
      <h2 className="text-xl font-bold">{labels[draft.key]} 초안</h2>
      <button className={button} disabled={busy || uncertain} onClick={() => {
        const latest = data.drafts.find(r => r.id === draft.id);
        changed({ ...draft, revision: latest?.revision ?? draft.revision, baseId: data.current[draft.key]?.id ?? draft.baseId });
        setMessage("다시 조회한 최신 기준으로 연결했습니다. 편집 내용을 검토한 뒤 초안을 저장하세요.");
      }}>조회한 최신 기준으로 다시 연결</button>
      <fieldset disabled={busy || uncertain} className="min-w-0 space-y-4">
        <label className="block">제목<input className={field} maxLength={160} value={draft.content.title} onChange={e => changed({ ...draft, content: { ...draft.content, title: e.target.value } })} /></label>
        <label className="block">소개<textarea className={field} rows={3} maxLength={2000} value={draft.content.intro} onChange={e => changed({ ...draft, content: { ...draft.content, intro: e.target.value } })} /></label>
        <label className="block">본문<textarea className={field} rows={6} maxLength={20000} value={draft.content.body} onChange={e => changed({ ...draft, content: { ...draft.content, body: e.target.value } })} /></label>
        <section className="min-w-0 space-y-3"><h3 className="font-bold">문단·체크 항목</h3>{sections.map((section, i) => <div key={i} className="space-y-2 rounded-lg border border-pul-border p-3">
          <label className="block">{i + 1}번째 소제목<input className={field} value={section.title} maxLength={160} onChange={e => setSections(sections.map((s, n) => n === i ? { ...s, title: e.target.value } : s))} /></label>
          <label className="block">{i + 1}번째 설명<textarea className={field} rows={3} value={section.description} maxLength={4000} onChange={e => setSections(sections.map((s, n) => n === i ? { ...s, description: e.target.value } : s))} /></label>
          <label className="block">{i + 1}번째 체크 항목 (한 줄에 한 항목)<textarea className={field} rows={4} value={section.items.join("\n")} onChange={e => setSections(sections.map((s, n) => n === i ? { ...s, items: e.target.value.split("\n") } : s))} /></label>
          <div className="flex flex-wrap gap-2"><button className={button} disabled={i === 0} onClick={() => { const next = [...sections]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; setSections(next); }}>위로</button><button className={button} disabled={i === sections.length - 1} onClick={() => { const next = [...sections]; [next[i + 1], next[i]] = [next[i], next[i + 1]]; setSections(next); }}>아래로</button><button className={button} onClick={() => setSections(sections.filter((_, n) => i !== n))}>초안 문단 제거</button></div>
        </div>)}<button className={button} disabled={sections.length >= 30} onClick={() => setSections([...sections, { title: "", description: "", items: [] }])}>문단 추가</button></section>
        {draft.key !== "policy" ? <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={draft.content.visible} onChange={e => changed({ ...draft, content: { ...draft.content, visible: e.target.checked } })} />공개 위치에 표시</label> : <p className="rounded-lg bg-pul-page p-3 text-sm">정책은 숨기거나 삭제할 수 없습니다. 수동 게시 성공 시 즉시 시행하며 새 동의 버전을 서버에서 발급합니다.</p>}
        <label className="block">변경 사유<textarea className={field} maxLength={2000} rows={2} value={draft.reason} onChange={e => changed({ ...draft, reason: e.target.value })} /></label>
        <label className="block">이미지·PDF 첨부 (각 5MB 이하)<input type="file" accept="image/jpeg,image/png,application/pdf" className="mt-2 block w-full min-w-0 text-sm" disabled={draft.revision === 0} onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; void upload(file); }} /></label>
        {draft.revision === 0 ? <p className="text-sm">초안을 먼저 저장하면 첨부할 수 있습니다.</p> : null}
        {draft.content.attachments.map((id, i) => <div className="flex flex-wrap items-center gap-3" key={id}><a className="underline" href={`/market/content-media/${id}`} target="_blank" rel="noreferrer">첨부 {i + 1}</a><button className={button} onClick={() => changed({ ...draft, content: { ...draft.content, attachments: draft.content.attachments.filter(x => x !== id) } })}>초안에서 연결 해제</button></div>)}
        <div className="flex flex-wrap gap-2"><button className={button} onClick={() => save("save")}>초안 저장</button><button className={button} onClick={() => { try { setPreview(parsedDraft()); } catch { setMessage("문단·체크 항목 형식을 확인해 주세요."); } }}>미리보기</button><button className={button + " bg-pul-deep text-white"} disabled={dirty || draft.revision === 0} onClick={() => setConfirm(true)}>게시 확인</button><button className={button} onClick={() => { if (!dirty || window.confirm("저장하지 않은 편집을 닫을까요?")) { setDraft(null); setDirty(false); } }}>편집 닫기</button></div>
      </fieldset>
    </section> : null}
    <section className="rounded-xl border border-pul-border bg-white p-4"><h2 className="text-xl font-bold">이전 게시 이력</h2><p className="my-2 text-sm text-pul-muted">초기 정책의 알려지지 않은 과거 게시 시각과 동의 원문은 추정하지 않습니다.</p><ul className="divide-y divide-pul-border">{data.history.map(r => <li key={r.id} className="py-3"><p className="font-bold">{r.content.title}</p><p className="break-all text-sm">{r.consentVersion} · {r.publishedAt ? new Date(r.publishedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) + " KST" : "기존 기준본 · 과거 게시 시각 미상"}</p><button className={button} onClick={() => setPreview(r)}>이전 원문·첨부 보기</button></li>)}</ul></section>
    {preview ? <MarketDialog title={preview.state === "draft" ? "게시 전 미리보기" : "게시 원문·첨부"} onClose={() => setPreview(null)}><MarketContentBody revision={preview} /></MarketDialog> : null}
    {confirm && draft ? <MarketDialog title="게시할 내용을 확인하세요" busy={busy} onClose={() => setConfirm(false)}><p className="mb-4 rounded-lg bg-amber-50 p-3">{draft.key === "policy" ? `현재 ${data.current.policy?.consentVersion}. 제목·본문·첨부가 변경되면 새 동의 버전을 발급합니다. 게시 성공 시점부터 판매·구매·교환 작성에 즉시 적용됩니다.` : "이 초안을 게시하면 해당 안내 위치에 반영됩니다."}</p><MarketContentBody revision={draft} /><p className="my-4">변경 사유: {draft.reason}</p><button className={button + " bg-pul-deep text-white"} disabled={busy} onClick={() => save("publish")}>확인한 내용 게시</button></MarketDialog> : null}
  </div>;
}
