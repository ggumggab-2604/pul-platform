"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { MessageBlock, MessagePage, MessageDetail, MessageReportDetail, MessagingReportReason } from "@/lib/messaging/messaging";
import { sendMessageAction, replyMessageAction, markMessageReadAction, hideMessageAction, setMessageBlockAction, unblockMessageUserAction, submitMessageReportAction, openMessageReportAction, resolveMessageReportAction } from "@/app/messages/actions";
import { cursorHref, messageButton, messageInput, messageDate, messageLength, trimMessage, recipientCodeValid, reportReasonLabels, messagingUpdatedEvent } from "@/lib/messaging/messagingUi";
import { useMessagingViewActive } from "./MessagingSessionBoundary";
import type { MarketMessageListing, MarketMessageContext as MarketContext } from "@/lib/messaging/messaging";
import { sendMarketListingMessageAction } from "@/app/messages/actions";
import { MarketMessageContext } from "./MarketMessageContext";

const changed = () => window.dispatchEvent(new Event(messagingUpdatedEvent));
const unknownError = "요청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.";
function useLiveView() {
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  return live;
}

export function BlockedListView({ page, isLaterPage = false }: { page: MessagePage<MessageBlock>; isLaterPage?: boolean }) {
  const router = useRouter(), live = useLiveView();
  const viewActive = useMessagingViewActive();
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const [notice, setNotice] = useState(""), [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);
  const rowKey = (row: MessageBlock) => `${row.blockedUserId}:${row.blockedAt}`;
  const rows = page.items.filter(row => !removed.has(rowKey(row)));
  function unblock(row: MessageBlock) {
    if (!viewActive || busy.current || !window.confirm("내가 설정한 차단을 해제할까요?")) return;
    busy.current = true; setNotice(""); setError("");
    startTransition(async () => {
      try {
        const result = await unblockMessageUserAction(row.blockedUserId);
        if (!live.current) return;
        if (!result.ok) { setError(result.error); return; }
        setRemoved(previous => new Set(previous).add(rowKey(row)));
        setNotice("내 차단을 해제했습니다."); router.refresh();
      } catch { if (live.current) setError(unknownError); }
      finally { busy.current = false; }
    });
  }
  return <section aria-label="차단한 회원" className="space-y-4">
    <h2 className="text-xl font-bold">차단 관리</h2>
    <p className="text-sm leading-6 text-pul-muted">내가 차단한 회원만 표시됩니다. 차단을 해제해도 숨긴 쪽지는 다시 표시되지 않습니다.</p>
    {!rows.length ? <p className="rounded-xl border border-pul-border bg-white p-6">{isLaterPage || page.nextCursor ? "이 페이지에 표시할 차단 회원이 없습니다." : "차단한 회원이 없습니다."}</p> : <ul className="divide-y divide-pul-border overflow-hidden rounded-xl border border-pul-border bg-white">{rows.map(row => <li key={rowKey(row)} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="min-w-0"><p className="font-bold [overflow-wrap:anywhere]">{row.counterpartDisplay}</p><p className="mt-1 text-sm text-pul-muted">차단한 날짜 <time dateTime={row.blockedAt}>{messageDate(row.blockedAt)}</time></p></div>
      <button type="button" aria-label={`${row.counterpartDisplay} 차단 해제`} className={`${messageButton} shrink-0 self-start`} disabled={pending || !viewActive} onClick={() => unblock(row)}>차단 해제</button>
    </li>)}</ul>}
    {pending ? <p role="status">차단 해제 중…</p> : null}{notice ? <p role="status">{notice}</p> : null}{error ? <p role="alert" className="text-red-700">{error}</p> : null}
    {page.nextCursor ? <Link href={cursorHref("/messages/blocked", page.nextCursor)} prefetch={false} className={messageButton}>다음 차단 회원 20명 보기</Link> : null}
    <Link href="/messages/blocked" prefetch={false} className="ml-3 inline-flex min-h-11 items-center text-sm text-pul-point">처음 목록으로</Link>
  </section>;
}

export function MessageComposer({ ownCode, reply, market }: { ownCode?: string; reply?: { id: string; display: string }; market?: MarketMessageListing }) {
  const router = useRouter();
  const live = useLiveView();
  const [recipient, setRecipient] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);
  const request = useRef<{ id: string; body: string; recipient: string } | null>(null);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    const text = trimMessage(body), code = recipient.trim().toLowerCase();
    if ((!reply && !market && !recipientCodeValid(code)) || !messageLength(text) || messageLength(text) > 2000 || text.includes("\0")) {
      setError(reply || market ? "1~2,000자의 쪽지 내용을 확인해 주세요." : "수신 코드와 1~2,000자의 쪽지 내용을 확인해 주세요."); return;
    }
    if (!request.current || (!uncertain && (request.current.body !== text || request.current.recipient !== code))) request.current = { id: crypto.randomUUID(), body: text, recipient: code };
    const attempt = request.current;
    busy.current = true; setError("");
    startTransition(async () => {
      try {
        const result = reply ? await replyMessageAction({ messageId: reply.id, body: attempt.body, requestId: attempt.id }) : market ? await sendMarketListingMessageAction({ listingId: market.listingId, body: attempt.body, requestId: attempt.id }) : await sendMessageAction({ recipientId: attempt.recipient, body: attempt.body, requestId: attempt.id });
        if (!live.current) return;
        if (!result.ok) { setError(result.error); setUncertain(result.code === "unknown" || result.code === "retry"); return; }
        setBody(""); setUncertain(false); request.current = null; changed();
        router.replace(`/messages/${result.data.id}`); router.refresh();
      } catch { if (live.current) { setUncertain(true); setError("전송 결과를 확인하지 못했습니다. 같은 내용으로 다시 확인해 주세요."); } }
      finally { busy.current = false; }
    });
  }
  return <form onSubmit={submit} className="space-y-4 rounded-xl border border-pul-border bg-white p-4 sm:p-6" aria-label={reply ? "답장 작성" : "새 쪽지 작성"}>
    <h2 className="text-xl font-bold">{reply ? `${reply.display}님에게 답장` : "새 쪽지 작성"}</h2>
    {reply ? <p className="text-sm text-pul-muted">이 쪽지의 상대에게 답장을 보냅니다.</p> : market ? <><MarketMessageContext context={market} /><p className="text-sm text-pul-muted">이 장터 글 작성자에게 보냅니다. 전화번호 확인 없이 쪽지로 문의할 수 있습니다.</p></> : <>
      <label className="block font-bold">수신 코드<input required autoComplete="off" spellCheck={false} className={`${messageInput} mt-2`} value={recipient} onChange={event => setRecipient(event.target.value)} disabled={pending || uncertain} placeholder="전달받은 회원 수신 코드" /></label>
      <p className="text-sm text-pul-muted">받는 사람: 수신 코드를 전달한 회원. 코드를 다시 확인한 뒤 보내 주세요.</p>
      {ownCode ? <details className="rounded-lg bg-pul-light p-3"><summary className="min-h-11 cursor-pointer py-2 font-bold">내 수신 코드 확인</summary><p className="text-sm">쪽지를 받을 때 상대에게 이 코드를 전달하세요.</p><code className="mt-2 block select-all break-all text-sm">{ownCode}</code></details> : null}
    </>}
    <label className="block font-bold">쪽지 내용<textarea required rows={8} className={`${messageInput} mt-2 resize-y`} value={body} onChange={event => setBody(event.target.value)} disabled={pending || uncertain} /></label>
    <p className={`text-right text-sm ${messageLength(body) > 2000 ? "text-red-700" : "text-pul-muted"}`}>{messageLength(body).toLocaleString("ko-KR")} / 2,000자</p>
    {uncertain ? <p role="status" className="text-sm">중복 발송을 막기 위해 입력을 유지했습니다. 같은 요청으로 전송 결과를 다시 확인할 수 있습니다. 새로고침하면 작성 내용은 저장되지 않습니다.</p> : null}
    {error ? <p role="alert" className="text-red-700">{error}</p> : null}
    <button disabled={pending} className={`${messageButton} !bg-pul-point !text-white`} type="submit">{pending ? "전송 중…" : uncertain ? "같은 요청 다시 확인" : reply ? "답장 보내기" : "쪽지 보내기"}</button>
  </form>;
}

export function MarkMessageReadOnView({ messageId }: { messageId: string }) {
  const router = useRouter();
  const viewActive = useMessagingViewActive();
  const request = useRef<ReturnType<typeof markMessageReadAction> | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [, startTransition] = useTransition();
  useEffect(() => {
    let active = true;
    const open = () => {
      if (!viewActive || document.visibilityState === "hidden") return;
      startTransition(async () => {
        request.current ??= markMessageReadAction(messageId);
        try {
          const result = await request.current;
          if (!active) return;
          if (result.ok) { changed(); router.refresh(); }
          else setError(result.error);
        } catch { if (active) setError(unknownError); }
      });
    };
    open(); document.addEventListener("visibilitychange", open);
    return () => { active = false; document.removeEventListener("visibilitychange", open); };
  }, [messageId, retry, router, viewActive]);
  return error ? <div role="alert" className="space-y-2"><p>{error}</p><button className={messageButton} onClick={() => { request.current = null; setError(""); setRetry(value => value + 1); }}>읽음 처리 다시 시도</button></div> : null;
}

export function MessageDetailView({ message, marketContext = null }: { message: MessageDetail; marketContext?: MarketContext }) {
  const broadcast = message.kind === "platform_broadcast";
  const router = useRouter();
  const live = useLiveView();
  const [reply, setReply] = useState(false);
  const [report, setReport] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);
  function mutate(kind: "hide" | "block" | "unblock") {
    const prompts = { hide: "내 쪽지함에서 삭제할까요? 상대방의 쪽지함에서는 삭제되지 않습니다.", block: "차단하면 서로 새 쪽지와 답장을 보낼 수 없습니다. 기존 쪽지는 삭제되지 않습니다. 차단할까요?", unblock: "내가 설정한 차단을 해제할까요?" };
    if (busy.current || !window.confirm(prompts[kind])) return;
    busy.current = true; setError(""); setNotice("");
    startTransition(async () => {
      try {
        if (kind === "hide") {
          const result = await hideMessageAction(message.id);
          if (!live.current) return;
          if (!result.ok) { setError(result.error); return; }
          changed(); router.replace(result.data.href); router.refresh();
        } else {
          const result = await setMessageBlockAction(message.id, kind === "block");
          if (!live.current) return;
          if (!result.ok) { setError(result.error); return; }
          setNotice(kind === "block" ? "이 회원을 차단했습니다. 기존 쪽지는 유지됩니다." : "내 차단을 해제했습니다.");
        }
      } catch { if (live.current) setError(unknownError); }
      finally { busy.current = false; }
    });
  }
  return <section className="space-y-4">
    <MarketMessageContext context={marketContext} />
    {message.isRecipient && !message.readAt ? <MarkMessageReadOnView key={message.id} messageId={message.id} /> : null}
    <article className="rounded-xl border border-pul-border bg-white p-4 sm:p-6"><p className="text-sm text-pul-muted">{message.isRecipient ? "받은 쪽지" : "보낸 쪽지"}</p><h2 className="mt-2 break-words text-xl font-bold">{message.counterpartDisplay}</h2><time dateTime={message.createdAt} className="mt-2 block text-sm text-pul-muted">{messageDate(message.createdAt)}</time><p className="mt-6 whitespace-pre-wrap break-words leading-8 [overflow-wrap:anywhere]">{message.body}</p></article>
    <div className="flex flex-wrap gap-2">
      {!broadcast && message.counterpartUserId ? <><button className={messageButton} disabled={pending} onClick={() => setReply(value => !value)}>답장</button><button className={messageButton} disabled={pending} onClick={() => mutate("block")}>이 회원 차단</button><button className={messageButton} disabled={pending} onClick={() => mutate("unblock")}>내 차단 해제</button></> : null}
      <button className={messageButton} disabled={pending} onClick={() => mutate("hide")}>내 쪽지함에서 삭제</button>
      {!broadcast && message.isRecipient ? <button className={messageButton} disabled={pending} onClick={() => setReport(value => !value)}>신고</button> : null}
    </div>
    <p className="text-sm leading-6 text-pul-muted">{broadcast ? "PUL 공식공지는 답장할 수 없습니다. 삭제하면 내 쪽지함에서만 숨겨집니다." : "내 쪽지함에서 삭제해도 상대방의 쪽지함에서는 삭제되지 않습니다. 차단하면 서로 새 쪽지와 답장을 보낼 수 없으며 기존 쪽지는 유지됩니다. 차단 해제는 내가 설정한 차단만 해제합니다."}</p>
    {pending ? <p role="status">처리 중…</p> : null}{notice ? <p role="status" className="text-pul-deep">{notice}</p> : null}{error ? <p role="alert" className="text-red-700">{error}</p> : null}
    {!broadcast && reply ? <MessageComposer reply={{ id: message.id, display: message.counterpartDisplay }} /> : null}
    {!broadcast && report && message.isRecipient ? <MessageReportForm messageId={message.id} /> : null}
  </section>;
}

export function MessageReportForm({ messageId }: { messageId: string }) {
  const [reason, setReason] = useState<MessagingReportReason>("spam"), [detail, setDetail] = useState("");
  const [notice, setNotice] = useState(""), [error, setError] = useState("");
  const [pending, startTransition] = useTransition(); const busy = useRef(false);
  function submit(event: FormEvent) {
    event.preventDefault(); if (busy.current) return;
    if (messageLength(detail) > 1000 || detail.includes("\0")) { setError("신고 내용은 1,000자 이내로 입력해 주세요."); return; }
    busy.current = true; setError(""); setNotice("");
    startTransition(async () => {
      try {
        const result = await submitMessageReportAction({ messageId, reason, detail });
        if (!result.ok) setError(result.error);
        else setNotice(result.data.duplicate ? "이미 접수된 신고입니다." : "신고를 접수했습니다. 운영자가 확인합니다.");
      } catch { setError(unknownError); } finally { busy.current = false; }
    });
  }
  return <form onSubmit={submit} aria-label="쪽지 신고" className="space-y-3 rounded-xl border border-pul-border bg-white p-4">
    <h2 className="text-lg font-bold">쪽지 신고</h2><label className="block">신고 사유<select className={`${messageInput} mt-2`} value={reason} disabled={pending} onChange={event => setReason(event.target.value as MessagingReportReason)}>{Object.entries(reportReasonLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label className="block">신고 내용 (선택)<textarea rows={4} className={`${messageInput} mt-2`} disabled={pending} value={detail} onChange={event => setDetail(event.target.value)} /></label><p className="text-sm text-pul-muted">{messageLength(detail)} / 1,000자 · 신고 내용은 운영자가 확인합니다. 쪽지가 자동 삭제되지는 않습니다.</p>
    {notice ? <p role="status">{notice}</p> : null}{error ? <p role="alert" className="text-red-700">{error}</p> : null}
    <button className={messageButton} disabled={pending} type="submit">{pending ? "접수 중…" : "신고 접수"}</button>
  </form>;
}

export function MessageReportDetailView({ reportId }: { reportId: string }) {
  const viewActive = useMessagingViewActive();
  const request = useRef<ReturnType<typeof openMessageReportAction> | null>(null);
  const [report, setReport] = useState<MessageReportDetail | null>(null), [error, setError] = useState("");
  const [retry, setRetry] = useState(0), [resolved, setResolved] = useState(false);
  const [pending, startTransition] = useTransition(); const busy = useRef(false);
  useEffect(() => {
    let active = true;
    const open = () => {
      if (!viewActive || document.visibilityState === "hidden") return;
      startTransition(async () => {
        request.current ??= openMessageReportAction(reportId);
        try {
          const result = await request.current;
          if (active) { if (result.ok) setReport(result.data); else setError(result.error); }
        } catch { if (active) setError(unknownError); }
      });
    };
    open(); document.addEventListener("visibilitychange", open);
    return () => { active = false; document.removeEventListener("visibilitychange", open); };
  }, [reportId, retry, viewActive]);
  function resolve() {
    if (busy.current || !window.confirm("이 신고를 처리 완료로 표시할까요?")) return;
    busy.current = true; setError("");
    startTransition(async () => {
      try { const result = await resolveMessageReportAction(reportId); if (result.ok) setResolved(true); else setError(result.error); }
      catch { setError(unknownError); } finally { busy.current = false; }
    });
  }
  return <section className="space-y-4 rounded-xl border border-pul-border bg-white p-4 sm:p-6"><h1 className="text-2xl font-black">쪽지 신고 상세</h1>
    {error ? <div role="alert"><p>{error}</p>{!report ? <button className={messageButton} onClick={() => { request.current = null; setError(""); setRetry(value => value + 1); }}>다시 시도</button> : null}</div> : null}
    {!report && !error ? <p role="status">신고를 확인하고 있습니다.</p> : null}
    {report ? <><p className="font-bold">{resolved || report.status === "resolved" ? "처리 완료" : "미처리"} · {reportReasonLabels[report.reason]}</p><p className="text-sm">접수 {messageDate(report.createdAt)} · 쪽지 {messageDate(report.messageCreatedAt)}</p><p>보낸 사람: {report.senderDisplay} · 신고자: {report.reporterDisplay}</p>
      <h2 className="font-bold">신고된 쪽지</h2><p className="whitespace-pre-wrap break-words leading-8 [overflow-wrap:anywhere]">{report.body}</p><h2 className="font-bold">신고 내용</h2><p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{report.detail || "추가 내용 없음"}</p>
      {report.status === "open" && !resolved ? <button className={messageButton} disabled={pending} onClick={resolve}>{pending ? "처리 중…" : "처리 완료로 표시"}</button> : null}{resolved ? <p role="status">신고를 처리 완료로 표시했습니다.</p> : null}
    </> : null}
  </section>;
}
