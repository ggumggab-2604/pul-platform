"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { BroadcastPreview } from "@/lib/messaging/messaging";
import { previewPlatformBroadcastAction, sendPlatformBroadcastAction } from "@/app/messages/actions";
import { messageButton, messageInput, messageLength, trimMessage } from "@/lib/messaging/messagingUi";
import { useMessagingViewActive } from "./MessagingSessionBoundary";

export function BroadcastComposer({ initialPreview }: { initialPreview: BroadcastPreview }) {
  const router = useRouter(), viewActive = useMessagingViewActive();
  const [body, setBody] = useState(""), [confirmed, setConfirmed] = useState(false);
  const [preview, setPreview] = useState(initialPreview), [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false), [pending, startTransition] = useTransition();
  const busy = useRef(false), live = useRef(true);
  const request = useRef<{ body: string; requestId: string } | null>(null);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  function refreshPreview() {
    if (!viewActive || busy.current || uncertain) return;
    busy.current = true; setError(""); setConfirmed(false);
    startTransition(async () => {
      try { const result = await previewPlatformBroadcastAction(); if (live.current) { if (result.ok) setPreview(result.data); else setError(result.error); } }
      catch { if (live.current) setError("수신 대상 수를 확인하지 못했습니다."); }
      finally { busy.current = false; }
    });
  }
  function submit(event: FormEvent) {
    event.preventDefault(); if (!viewActive || busy.current) return;
    const text = trimMessage(body);
    if (!confirmed || !preview.canSend || !messageLength(text) || messageLength(text) > 2000 || text.includes("\0")) {
      setError("공지 내용과 수신 대상 수를 확인하고 발송 확인에 체크해 주세요."); return;
    }
    if (!request.current || (!uncertain && request.current.body !== text)) request.current = { body: text, requestId: crypto.randomUUID() };
    const attempt = request.current;
    busy.current = true; setError("");
    startTransition(async () => {
      try {
        const result = await sendPlatformBroadcastAction(attempt);
        if (!live.current) return;
        if (!result.ok) { setError(result.error); setUncertain(result.code === "unknown" || result.code === "retry"); return; }
        setBody(""); request.current = null; setUncertain(false);
        router.replace(`/manage/messages/broadcasts/${result.data.id}`); router.refresh();
      } catch { if (live.current) { setUncertain(true); setError("발송 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요."); } }
      finally { busy.current = false; }
    });
  }
  return <form onSubmit={submit} aria-label="전체공지 작성" className="space-y-4 rounded-xl border border-pul-border bg-white p-4 sm:p-6">
    <h1 className="text-2xl font-black">전체공지 작성</h1>
    <p className="text-sm leading-6 text-pul-muted">정상 가입 회원에게 PUL 공식공지를 보냅니다. 개인 차단 여부와 관계없이 전달되며 답장은 받지 않습니다.</p>
    <div className="space-y-2 rounded-lg bg-pul-light p-3">
      <p role="status" className="font-bold">{preview.recipientCount > preview.maximum ? "수신 대상이 10,000명을 초과합니다." : `현재 예상 수신자 ${preview.recipientCount.toLocaleString("ko-KR")}명`}</p>
      <p className="text-sm leading-6">발송자 본인은 제외됩니다. 실제 수신자는 발송 시점에 다시 정하므로 예상 수와 다를 수 있습니다.</p>
      <button type="button" className={messageButton} disabled={pending || uncertain || !viewActive} onClick={refreshPreview}>수신 대상 수 다시 확인</button>
    </div>
    <label className="block font-bold">공지 내용<textarea required rows={8} className={`${messageInput} mt-2 resize-y`} value={body} disabled={pending || uncertain} onChange={event => { setBody(event.target.value); setConfirmed(false); }} /></label>
    <p className="text-right text-sm text-pul-muted">{messageLength(body).toLocaleString("ko-KR")} / 2,000자</p>
    <label className="flex min-h-11 items-start gap-3 rounded-lg border border-pul-border p-3 text-sm leading-6"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={confirmed} disabled={pending || uncertain} onChange={event => setConfirmed(event.target.checked)} />현재 수신 대상 전체에게 이 공지를 발송하는 것을 확인했습니다.</label>
    <p className="text-sm leading-6 text-pul-muted">전체 운영자 합산 10분에 1회, 24시간에 5회까지 발송합니다. 같은 내용은 24시간 내 다시 보낼 수 없습니다.</p>
    {uncertain ? <p role="status">중복 발송을 막기 위해 본문과 요청을 유지했습니다. 같은 요청으로 기존 발송 결과를 확인합니다. 새로고침하면 작성 내용은 저장되지 않습니다.</p> : null}
    {error ? <p role="alert" className="text-red-700">{error}</p> : null}
    <button type="submit" className={`${messageButton} !bg-pul-point !text-white`} disabled={pending || !viewActive || !confirmed || !preview.canSend}>{pending ? "발송 중…" : uncertain ? "같은 요청 다시 확인" : "전체공지 발송"}</button>
  </form>;
}
