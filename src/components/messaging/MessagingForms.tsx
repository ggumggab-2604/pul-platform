"use client";
import { PhotoUploadStatus, usePhotoUploadProgress } from "@/components/ui/PhotoUploadStatus";

import { validatePhotoInput } from "@/lib/images/photoPolicy";
import { photoUploadForm, PhotoPreparationError } from "@/lib/images/preparePhoto";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { MessageBlock, MessagePage, MessageDetail, MessageReportDetail, MessagingReportReason, ClubEventMessageContext, ClubMessageContext, CourseMessageContext } from "@/lib/messaging/messaging";
import { sendMessageAction, replyMessageAction, markMessageReadAction, hideMessageAction, setMessageBlockAction, unblockMessageUserAction, submitMessageReportAction, openMessageReportAction, resolveMessageReportAction } from "@/app/messages/actions";
import { cursorHref, messageButton, messageInput, messageDate, messageLength, trimMessage, recipientCodeValid, reportReasonLabels, messagingUpdatedEvent } from "@/lib/messaging/messagingUi";
import { useMessagingViewActive } from "./MessagingSessionBoundary";
import type { MarketMessageListing, MarketMessageContext as MarketContext } from "@/lib/messaging/messaging";
import { sendStoreMessageAction,sendVendorMessageAction,sendMarketListingMessageAction,sendBuyRequestMessageAction } from "@/app/messages/actions";
import { MarketMessageContext } from "./MarketMessageContext";
import { MessagePhotoPreview, MessagePhotos } from "./MessagePhotos";
import { messagePhotoLimit, } from "@/lib/messaging/messagePhotoRules";
import { sendPhotoMessageAction } from "@/app/messages/actions";

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
  const router = useRouter(), live = useLiveView();
  const progress=usePhotoUploadProgress();
  const [recipient, setRecipient] = useState(""), [body, setBody] = useState(""), [subject, setSubject] = useState("");
  const [error, setError] = useState(""), [uncertain, setUncertain] = useState(false);
  const [photos, setPhotos] = useState<{ id: string; file: File; state: "selected" | "ready" | "failed" | "uncertain" }[]>([]);
  const [draftId] = useState(() => crypto.randomUUID());
  const [sentId, setSentId] = useState("");
  const [pending, startTransition] = useTransition(), busy = useRef(false), acknowledged = useRef("");
  const request = useRef<{ id: string; body: string; recipient: string; photoIds: string[] } | null>(null);
  const photoUncertain = photos.some(p => p.state === "uncertain");
  const locked = pending || uncertain || photoUncertain;
  function selectPhotos(files: FileList | null) {
    if (locked || busy.current || !files) return;
    const selected = Array.from(files);
    if (photos.length + selected.length > messagePhotoLimit) { setError("사진은 최대 3장까지 선택할 수 있습니다."); return; }
    try { selected.forEach(file => validatePhotoInput(file, ["image/jpeg","image/png"])); }
    catch (e) { setError(e instanceof Error ? e.message : "사진을 확인해 주세요."); return; }
    setPhotos(previous => [...previous, ...selected.map(file => ({ id: crypto.randomUUID(), file, state: "selected" as const }))]); setError("");
  }
  async function uploadPhoto(photo: typeof photos[number], photoProgress: ReturnType<typeof progress.begin>, index:number, total:number) {
    try {
      const data = await photoUploadForm(photo.file, {photoId:photo.id,draftId}, {allowedTypes:["image/jpeg","image/png"],onProcessing:()=>photoProgress.processing(index,total)});if(!photoProgress.isCurrent())return false;photoProgress.uploading();
      const response = await fetch("/messages/attachments", { method: "POST", body: data });
      const result = await response.json();if(!photoProgress.isCurrent())return false;
      if (!response.ok || result.id !== photo.id) {
        // A new attempt's explicit preparation refusal is definite. A prior uncertain
        // upload cannot be disproved by a later preparation refusal.
        const definite = photo.state !== "uncertain" && result.stage === "prepare" &&
          ["preparation_rejected", "preparation_unavailable"].includes(result.code);
        setPhotos(previous => previous.map(p => p.id === photo.id ? { ...p, state: definite ? "failed" : "uncertain" } : p));
        setError(typeof result.message === "string" ? result.message : "사진 업로드 결과를 확인하지 못했습니다.");
        return false;
      }
      setPhotos(previous => previous.map(p => p.id === photo.id ? { ...p, state: "ready" } : p));
      return true;
    } catch (error) {
      if (error instanceof PhotoPreparationError) { setError(error.message); return false; }
      setPhotos(previous => previous.map(p => p.id === photo.id ? { ...p, state: "uncertain" } : p));
      setError("사진 업로드 결과를 확인하지 못했습니다. 같은 사진으로 다시 확인해 주세요.");
      return false;
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy.current || acknowledged.current) return;
    if (market?.vendor && !subject.trim()) { setError("문의 제목을 입력해 주세요."); return; }
    const text = trimMessage(market?.vendor ? `[업체 문의: ${market.title}] ${subject.trim()}\n\n${body}` : body);
    const code = recipient.trim().toLowerCase(), photoIds = photos.map(p => p.id);
    if ((!reply && !market && !recipientCodeValid(code)) || !messageLength(trimMessage(body)) || messageLength(text) > 2000 || text.includes("\0")) {
      setError(reply || market ? "1~2,000자의 쪽지 내용을 확인해 주세요." : "수신 코드와 1~2,000자의 쪽지 내용을 확인해 주세요."); return;
    }
    if (!request.current || (!uncertain && !photoUncertain && (request.current.body !== text || request.current.recipient !== code || request.current.photoIds.join() !== photoIds.join())))
      request.current = { id: crypto.randomUUID(), body: text, recipient: code, photoIds };
    const attempt = request.current;const photoProgress=progress.begin();const selected=photos.filter(p=>p.state!=="ready");
    busy.current = true; setError("");
    startTransition(async () => {
      try {
        for (const [index,photo] of selected.entries()) {
          if (!await uploadPhoto(photo,photoProgress,index+1,selected.length)) return;
          if (!live.current) return;
        }
        photoProgress.clear();const result = attempt.photoIds.length ? await sendPhotoMessageAction({
          kind: reply ? "reply" : market ? market.store ? "store" : market.vendor ? "vendor" : market.requestType ? "buy_request" : "listing" : "direct",
          targetId: reply?.id ?? market?.listingId ?? attempt.recipient,
          body: attempt.body, requestId: attempt.id, draftId, photoIds: attempt.photoIds,
        }) : reply ? await replyMessageAction({ messageId: reply.id, body: attempt.body, requestId: attempt.id }) : market ? market.store ? await sendStoreMessageAction({storeId:market.listingId,body:attempt.body,requestId:attempt.id}) : market.vendor ? await sendVendorMessageAction({vendorId:market.listingId,body:attempt.body,requestId:attempt.id}) : market.requestType ? await sendBuyRequestMessageAction({buyRequestId:market.listingId,body:attempt.body,requestId:attempt.id}) : await sendMarketListingMessageAction({ listingId: market.listingId, body: attempt.body, requestId: attempt.id }) : await sendMessageAction({ recipientId: attempt.recipient, body: attempt.body, requestId: attempt.id });
        if (!live.current) return;
        if (!result.ok) { setError(result.error); setUncertain(uncertain || result.code === "unknown" || result.code === "retry"); return; }
        acknowledged.current = result.data.id; setSentId(result.data.id); setUncertain(false);
        // Delivery was confirmed, even if navigation or the following detail read fails.
        try { changed(); router.replace(`/messages/${result.data.id}`); router.refresh(); }
        catch { setError("전송은 완료되었습니다. 아래에서 쪽지 상세를 다시 열어 주세요."); }
      } catch { if (live.current) { setUncertain(true); setError("전송 결과를 확인하지 못했습니다. 같은 내용으로 다시 확인해 주세요."); } }
      finally { photoProgress.clear();busy.current = false; }
    });
  }
  if (sentId) return <div role="status" className="space-y-3 rounded-xl border border-pul-border bg-white p-4"><p>쪽지를 전송했습니다.</p>{error ? <p>{error}</p> : null}<Link href={`/messages/${sentId}`} prefetch={false} className={messageButton}>전송한 쪽지 보기</Link><button type="button" className={messageButton} onClick={() => router.refresh()}>상세 다시 불러오기</button></div>;
  return <form onSubmit={submit} className="space-y-4 rounded-xl border border-pul-border bg-white p-4 sm:p-6" aria-label={reply ? "답장 작성" : "새 쪽지 작성"}>
    <h2 className="text-xl font-bold">{reply ? `${reply.display}님에게 답장` : "새 쪽지 작성"}</h2>
    {reply ? <p className="text-sm text-pul-muted">이 쪽지의 상대에게 답장을 보냅니다.</p> : market ? <><MarketMessageContext context={market} /><p className="text-sm text-pul-muted">{market.vendor ? "선택한 업체 담당자에게 비공개 쪽지를 보냅니다." : "이 장터 글 작성자에게 보냅니다. 전화번호 확인 없이 쪽지로 문의할 수 있습니다."}</p></> : <>
      <label className="block font-bold">수신 코드<input required autoComplete="off" spellCheck={false} className={`${messageInput} mt-2`} value={recipient} onChange={event => setRecipient(event.target.value)} disabled={locked} placeholder="전달받은 회원 수신 코드" /></label>
      <p className="text-sm text-pul-muted">받는 사람: 수신 코드를 전달한 회원. 코드를 다시 확인한 뒤 보내 주세요.</p>
      {ownCode ? <details className="rounded-lg bg-pul-light p-3"><summary className="min-h-11 cursor-pointer py-2 font-bold">내 수신 코드 확인</summary><p className="text-sm">쪽지를 받을 때 상대에게 이 코드를 전달하세요.</p><code className="mt-2 block select-all break-all text-sm">{ownCode}</code></details> : null}
    </>}
    {market?.vendor ? <label className="block font-bold">문의 제목<input required maxLength={100} className={`${messageInput} mt-2`} value={subject} onChange={e => setSubject(e.target.value)} disabled={locked} /></label> : null}
    <label className="block font-bold">쪽지 내용<textarea required rows={8} className={`${messageInput} mt-2 resize-y`} value={body} onChange={event => setBody(event.target.value)} disabled={locked} /></label>
    <p className={`text-right text-sm ${messageLength(body) > 2000 ? "text-red-700" : "text-pul-muted"}`}>{messageLength(body).toLocaleString("ko-KR")} / 2,000자</p>
    <fieldset className="space-y-3" disabled={locked}>
      <legend className="font-bold">사진 첨부 (선택)</legend>
      <p className="text-sm text-pul-muted">JPG/PNG 최대 3장, 각 32MB 원본 · 자동 조정 이내 · 본문을 함께 작성해 주세요. 전송한 사진은 쪽지 참가자만 볼 수 있습니다.</p>
      <label className="block text-sm">사진 선택<input type="file" accept="image/jpeg,image/png" multiple className="mt-2 block w-full min-w-0 text-sm" onChange={event => { selectPhotos(event.target.files); event.target.value = ""; }} /></label>
      <ul className="flex flex-wrap gap-3">{photos.map((photo, i) => <li key={photo.id} className="w-28 space-y-1">
        <MessagePhotoPreview file={photo.file} /><p className="break-all text-xs">{photo.file.name}</p>
        <p className="text-xs">{photo.state === "ready" ? "업로드 완료 · 전송 대기" : photo.state === "uncertain" ? "업로드 결과 확인 필요" : photo.state === "failed" ? "업로드 안 됨" : "선택됨"}</p>
        <button type="button" className={messageButton} aria-label={`사진 ${i + 1} 제외`} onClick={() => setPhotos(previous => previous.filter(p => p.id !== photo.id))}>제외</button>
      </li>)}</ul>
    </fieldset>
    <PhotoUploadStatus message={progress.message}/>{uncertain || photoUncertain ? <p role="status" className="text-sm">중복 발송을 막기 위해 입력과 사진을 유지했습니다. 같은 요청으로 결과를 다시 확인할 수 있습니다. 새로고침하면 작성 내용은 저장되지 않습니다.</p> : null}
    {error ? <p role="alert" className="text-red-700">{error}</p> : null}
    <div className="flex flex-wrap gap-2"><button disabled={pending} className={`${messageButton} !bg-pul-point !text-white`} type="submit">{pending ? "사진 확인·전송 중…" : uncertain || photoUncertain ? "같은 요청 다시 확인" : reply ? "답장 보내기" : "쪽지 보내기"}</button><button type="button" className={messageButton} disabled={locked} onClick={() => router.back()}>취소</button></div>
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

export function MessageDetailView({ inquiryContext=null, message, marketContext = null, clubContext = null, eventContext = null, courseContext = null }: { inquiryContext?:{course_key:string|null;course_name:string}|null; message: MessageDetail; marketContext?: MarketContext; clubContext?: ClubMessageContext; eventContext?: ClubEventMessageContext; courseContext?: CourseMessageContext }) {
  const broadcast = message.kind !== "direct";
  const reportable = message.kind !== "platform_broadcast" && message.isRecipient;
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
    {inquiryContext ? <aside className="rounded-xl border border-pul-border bg-white p-4"><p className="font-bold">구장 비공개 문의 · {inquiryContext.course_name}</p>{inquiryContext.course_key ? <Link prefetch={false} className="mt-2 inline-flex min-h-11 items-center text-pul-point" href={"/courses/"+inquiryContext.course_key}>구장 상세 보기</Link> : null}</aside> : null}
    {courseContext ? <aside className="rounded-xl border border-pul-border bg-white p-4"><p className="font-bold">장소 운영공지</p>{courseContext.available ? <><p className="mt-2 [overflow-wrap:anywhere]">{courseContext.courseType === "field" ? "필드" : "스크린"} · {courseContext.name}</p><Link prefetch={false} href={`/courses/${encodeURIComponent(courseContext.courseKey)}`} className="inline-flex min-h-11 items-center text-pul-point">장소 상세 보기</Link></> : <p className="mt-2 text-sm text-pul-muted">현재 장소 정보를 확인할 수 없습니다.</p>}<p className="mt-2 text-sm text-pul-muted">운영알림 신청에 따른 이용 안내입니다. 할인·광고 수신동의가 아닙니다.</p></aside> : null}
    {message.recipientCount !== undefined ? <p role="status">발송 완료 · {message.recipientCount.toLocaleString("ko-KR")}명에게 발송했습니다.</p> : null}
    {eventContext ? <aside className="rounded-xl border border-pul-border bg-white p-4"><p className="font-bold">행사 안내</p>{eventContext.available ? <><p className="mt-2 [overflow-wrap:anywhere]">{eventContext.clubName} · {eventContext.title}</p><p className="text-sm">{messageDate(eventContext.startsAt)}</p><Link prefetch={false} href={`/clubs/${encodeURIComponent(eventContext.clubKey)}#club-official-events`} className="inline-flex min-h-11 items-center text-pul-point">공식 행사 보기</Link></> : <p className="mt-2 text-sm text-pul-muted">현재 행사 정보를 확인할 수 없습니다.</p>}</aside> : null}
    {clubContext ? <aside className="rounded-xl border border-pul-border bg-white p-4"><p className="font-bold">동호회 공지</p>{clubContext.available ? <Link prefetch={false} href={`/clubs/${encodeURIComponent(clubContext.publicKey)}`} className="mt-2 inline-flex min-h-11 items-center text-pul-point [overflow-wrap:anywhere]">{clubContext.name} · 동호회 보기</Link> : <p className="mt-2 text-sm text-pul-muted">현재 동호회 정보를 확인할 수 없습니다.</p>}</aside> : null}
    {message.isRecipient && !message.readAt ? <MarkMessageReadOnView key={message.id} messageId={message.id} /> : null}
    <article className="rounded-xl border border-pul-border bg-white p-4 sm:p-6"><p className="text-sm text-pul-muted">{message.isRecipient ? "받은 쪽지" : "보낸 쪽지"}</p><h2 className="mt-2 break-words text-xl font-bold">{message.counterpartDisplay}</h2><time dateTime={message.createdAt} className="mt-2 block text-sm text-pul-muted">{messageDate(message.createdAt)}</time><p className="mt-6 whitespace-pre-wrap break-words leading-8 [overflow-wrap:anywhere]">{message.body}</p></article>
    {!broadcast ? <MessagePhotos key={message.id} messageId={message.id} /> : null}
    <div className="flex flex-wrap gap-2">
      {!broadcast && message.counterpartUserId ? <><button className={messageButton} disabled={pending} onClick={() => setReply(value => !value)}>답장</button><button className={messageButton} disabled={pending} onClick={() => mutate("block")}>이 회원 차단</button><button className={messageButton} disabled={pending} onClick={() => mutate("unblock")}>내 차단 해제</button></> : null}
      <button className={messageButton} disabled={pending} onClick={() => mutate("hide")}>내 쪽지함에서 삭제</button>
      {reportable ? <button className={messageButton} disabled={pending} onClick={() => setReport(value => !value)}>신고</button> : null}
    </div>
    <p className="text-sm leading-6 text-pul-muted">{broadcast ? "공지는 답장할 수 없습니다. 삭제하면 내 쪽지함에서만 숨겨집니다." : "내 쪽지함에서 삭제해도 상대방의 쪽지함에서는 삭제되지 않습니다. 차단하면 서로 새 쪽지와 답장을 보낼 수 없으며 기존 쪽지는 유지됩니다. 차단 해제는 내가 설정한 차단만 해제합니다."}</p>
    {pending ? <p role="status">처리 중…</p> : null}{notice ? <p role="status" className="text-pul-deep">{notice}</p> : null}{error ? <p role="alert" className="text-red-700">{error}</p> : null}
    {!broadcast && reply ? <MessageComposer reply={{ id: message.id, display: message.counterpartDisplay }} /> : null}
    {reportable && report ? <MessageReportForm messageId={message.id} /> : null}
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
