"use client";

import { ClubBoardSection, ClubNoticesSection, ClubOfficialEventsSection } from "@/components/clubs/detail/ClubDetailSections";
import { useBodyScrollLock } from "@/components/ui/InfoModal";
import {
  ClubCoreContentError,
  fetchClubCoreContent,
  mutateClubCoreContent,
  type ClubCoreContentOperation,
  type ClubCoreContentSnapshot,
  type ClubCoreContentType,
  type ClubNoticeInput,
  type ClubOfficialEventInput,
  type ClubPostInput,
} from "@/lib/clubs/clubCoreContent";
import { createClient } from "@/lib/supabase/client";
import type { ClubDetailData, ClubDetailNotice, ClubDetailPost, ClubOfficialEvent } from "@/types";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";

type EditableRecord = ClubDetailNotice | ClubDetailPost | ClubOfficialEvent;
type DialogState = {
  contentType: ClubCoreContentType;
  operation: ClubCoreContentOperation;
  record?: EditableRecord;
};

type FormState = {
  title: string;
  summary: string;
  kind: string;
  importance: string;
  visibility: "public" | "clubMembers";
  startsAt: string;
  endsAt: string;
  location: string;
  capacity: string;
  participantTarget: string;
  recruitmentStatus: string;
  eventStatus: string;
  reservationMethod: string;
  memberGuidance: string;
  organizerGuidance: string;
};

const emptyForm: FormState = {
  title: "",
  summary: "",
  kind: "general",
  importance: "normal",
  visibility: "clubMembers",
  startsAt: "",
  endsAt: "",
  location: "",
  capacity: "",
  participantTarget: "",
  recruitmentStatus: "recruiting",
  eventStatus: "scheduled",
  reservationMethod: "checking",
  memberGuidance: "",
  organizerGuidance: "",
};

function dateTimeLocal(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function initialForm(dialog: DialogState): FormState {
  const record = dialog.record;
  if (!record) {
    return dialog.contentType === "event" ? { ...emptyForm, kind: "monthlyMeeting" } : { ...emptyForm };
  }
  if (dialog.contentType === "notice") {
    const notice = record as ClubDetailNotice;
    return { ...emptyForm, title: notice.title, summary: notice.contentSummary ?? "", kind: notice.noticeType, importance: notice.importance, visibility: notice.visibility };
  }
  if (dialog.contentType === "post") {
    const post = record as ClubDetailPost;
    return { ...emptyForm, title: post.title, summary: post.contentSummary ?? "", kind: post.postType, visibility: post.visibility, startsAt: dateTimeLocal(post.startsAt), endsAt: dateTimeLocal(post.endsAt), location: post.location ?? "", capacity: post.capacity?.toString() ?? "", participantTarget: post.participantTarget ?? "", recruitmentStatus: post.recruitmentStatus ?? "" };
  }
  const event = record as ClubOfficialEvent;
  return { ...emptyForm, title: event.title, kind: event.officialEventType, visibility: event.visibility, startsAt: dateTimeLocal(event.startsAt), endsAt: dateTimeLocal(event.endsAt), location: event.location ?? "", capacity: event.capacity?.toString() ?? "", participantTarget: event.participantTarget ?? "", eventStatus: event.officialEventStatus, reservationMethod: event.reservationMethod, memberGuidance: event.memberReservationGuidance ?? "", organizerGuidance: event.organizerGuidance ?? "" };
}

function ControlButton({ children, onClick }: { children: string; onClick: (trigger: HTMLButtonElement) => void }) {
  return <button type="button" onClick={(event) => onClick(event.currentTarget)} className="min-h-11 rounded-lg bg-pul-point px-3 text-sm font-bold text-white hover:bg-pul-deep">{children}</button>;
}

function ContentDialog({
  dialog,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  dialog: DialogState;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (form: FormState) => Promise<void>;
}) {
  const [form, setForm] = useState(() => initialForm(dialog));
  const titleId = useId();
  const firstInputRef = useRef<HTMLInputElement>(null);
  const destructiveCancelRef = useRef<HTMLButtonElement>(null);
  const destructive = dialog.operation === "delete" || dialog.operation === "cancel";
  useBodyScrollLock(true);

  useEffect(() => {
    (destructive ? destructiveCancelRef.current : firstInputRef.current)?.focus({ preventScroll: true });
  }, [destructive]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
      if (event.key !== "Tab") return;
      const container = document.querySelector<HTMLElement>(`[data-content-dialog="${titleId}"]`);
      const focusable = container ? Array.from(container.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])")) : [];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [busy, onClose, titleId]);

  const set = (key: keyof FormState, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const label = `${dialog.contentType === "notice" ? "공지" : dialog.contentType === "post" ? "게시글" : "공식 일정"} ${dialog.operation === "create" ? "등록" : dialog.operation === "update" ? "수정" : dialog.operation === "cancel" ? "취소" : "삭제"}`;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onSubmit(form);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <form data-content-dialog={titleId} onSubmit={submit} className="flex max-h-[calc(100dvh-24px)] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-xl">
        <header className="flex items-center justify-between border-b border-pul-border px-5 py-4">
          <h2 id={titleId} className="text-xl font-bold">{label}</h2>
          <button type="button" disabled={busy} onClick={onClose} className="min-h-11 min-w-11 rounded-full text-2xl" aria-label="닫기">×</button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {destructive ? (
            <p className="rounded-lg bg-rose-50 p-4 leading-relaxed text-rose-800">{dialog.record?.title}을(를) {dialog.operation === "cancel" ? "취소" : "목록에서 내림"} 처리합니다. 이 작업은 현재 version을 기준으로 안전하게 처리됩니다.</p>
          ) : (
            <>
              <label className="block font-semibold">제목<input ref={firstInputRef} value={form.title} onChange={(event) => set("title", event.target.value)} minLength={2} maxLength={120} required className="mt-1 min-h-11 w-full rounded-lg border border-pul-border px-3 font-normal" /></label>
              {dialog.contentType !== "event" ? <label className="block font-semibold">내용<textarea value={form.summary} onChange={(event) => set("summary", event.target.value)} maxLength={dialog.contentType === "notice" ? 2000 : 5000} required rows={5} className="mt-1 w-full rounded-lg border border-pul-border p-3 font-normal" /></label> : null}
              <label className="block font-semibold">종류<select value={form.kind} onChange={(event) => set("kind", event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-pul-border px-3 font-normal">{dialog.contentType === "notice" ? <><option value="general">일반</option><option value="schedule">일정</option><option value="rule">규칙</option><option value="urgent">긴급</option><option value="event">행사</option><option value="closure">휴장</option></> : dialog.contentType === "post" ? <><option value="general">일반</option><option value="flashMeeting">번개 모임</option><option value="companion">같이 가요</option><option value="question">질문</option><option value="information">정보</option></> : <><option value="monthlyMeeting">월례회</option><option value="clubTournament">동호회 대회</option><option value="friendlyMatch">친선전</option><option value="outing">원정</option><option value="training">교육</option><option value="other">기타</option></>}</select></label>
              {dialog.contentType === "notice" ? <label className="block font-semibold">중요도<select value={form.importance} onChange={(event) => set("importance", event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-pul-border px-3 font-normal"><option value="normal">일반</option><option value="important">중요</option><option value="urgent">긴급</option></select></label> : null}
              {dialog.contentType === "post" || dialog.contentType === "event" ? <div className="grid gap-3 sm:grid-cols-2"><label className="block font-semibold">시작<input type="datetime-local" value={form.startsAt} onChange={(event) => set("startsAt", event.target.value)} required={dialog.contentType === "event" || form.kind === "flashMeeting" || form.kind === "companion"} className="mt-1 min-h-11 w-full rounded-lg border border-pul-border px-3 font-normal" /></label><label className="block font-semibold">종료<input type="datetime-local" value={form.endsAt} onChange={(event) => set("endsAt", event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-pul-border px-3 font-normal" /></label><label className="block font-semibold">장소<input value={form.location} onChange={(event) => set("location", event.target.value)} required={dialog.contentType === "event" || form.kind === "flashMeeting" || form.kind === "companion"} maxLength={200} className="mt-1 min-h-11 w-full rounded-lg border border-pul-border px-3 font-normal" /></label><label className="block font-semibold">정원<input type="number" min={2} max={1000} value={form.capacity} onChange={(event) => set("capacity", event.target.value)} required={form.kind === "flashMeeting" || form.kind === "companion"} className="mt-1 min-h-11 w-full rounded-lg border border-pul-border px-3 font-normal" /></label><label className="block font-semibold sm:col-span-2">참가 대상<input value={form.participantTarget} onChange={(event) => set("participantTarget", event.target.value)} required={dialog.contentType === "event"} maxLength={200} className="mt-1 min-h-11 w-full rounded-lg border border-pul-border px-3 font-normal" /></label></div> : null}
              {dialog.contentType === "event" ? <><label className="block font-semibold">진행 상태<select value={form.eventStatus} onChange={(event) => set("eventStatus", event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-pul-border px-3 font-normal"><option value="scheduled">예정</option><option value="registrationOpen">신청 중</option><option value="registrationClosed">신청 마감</option><option value="completed">완료</option></select></label><label className="block font-semibold">예약 방식<select value={form.reservationMethod} onChange={(event) => set("reservationMethod", event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-pul-border px-3 font-normal"><option value="checking">확인 중</option><option value="individualSynchronized">개별 동시 예약</option><option value="clubGroupBooking">단체 예약</option><option value="walkIn">현장 접수</option><option value="noReservation">예약 불필요</option></select></label><label className="block font-semibold">회원 안내<textarea value={form.memberGuidance} onChange={(event) => set("memberGuidance", event.target.value)} maxLength={1000} rows={3} className="mt-1 w-full rounded-lg border border-pul-border p-3 font-normal" /></label><label className="block font-semibold">운영진 안내<textarea value={form.organizerGuidance} onChange={(event) => set("organizerGuidance", event.target.value)} maxLength={1000} rows={3} className="mt-1 w-full rounded-lg border border-pul-border p-3 font-normal" /></label></> : null}
              <label className="block font-semibold">공개 범위<select value={form.visibility} onChange={(event) => set("visibility", event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-pul-border px-3 font-normal"><option value="clubMembers">회원 공개</option><option value="public">전체 공개</option></select></label>
            </>
          )}
          {error ? <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</p> : null}
        </div>
        <footer className="flex gap-2 border-t border-pul-border px-5 py-3"><button ref={destructive ? destructiveCancelRef : undefined} type="button" disabled={busy} onClick={onClose} className="min-h-11 flex-1 rounded-lg border border-pul-border font-bold">취소</button><button type="submit" disabled={busy} className="min-h-11 flex-1 rounded-lg bg-pul-point font-bold text-white disabled:opacity-60">{busy ? "처리 중…" : destructive ? "확인" : "저장"}</button></footer>
      </form>
    </div>
  );
}

export function ClubCoreContentProvider({ detail, clubUuid, initialSnapshot }: { detail: ClubDetailData; clubUuid?: string; initialSnapshot: ClubCoreContentSnapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [dialog, setDialog] = useState<DialogState>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const generationRef = useRef(0);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const identityRef = useRef<string | undefined>(undefined);
  const sectionRef = useRef<HTMLDivElement>(null);

  const runtimeDetail = useMemo(() => ({ ...detail, notices: snapshot.notices, posts: snapshot.posts, officialEvents: snapshot.officialEvents }), [detail, snapshot]);

  const refresh = useCallback(async () => {
    if (!clubUuid) return false;
    const generation = ++generationRef.current;
    try {
      const next = await fetchClubCoreContent(createClient(), clubUuid, detail.club.id);
      if (generation === generationRef.current) setSnapshot(next);
      return generation === generationRef.current;
    } catch {
      if (generation === generationRef.current) setError("최신 콘텐츠를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      return false;
    }
  }, [clubUuid, detail.club.id]);

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    const synchronize = async (userId?: string) => {
      if (!active) return;
      const identity = userId ?? "signedOut";
      const previousIdentity = identityRef.current;
      if (previousIdentity === undefined) {
        identityRef.current = identity;
        return;
      }
      if (previousIdentity === identity) return;
      identityRef.current = identity;
      generationRef.current += 1;
      setDialog(undefined);
      setMessage(undefined);
      setError(undefined);
      setSnapshot((current) => ({ ...current, notices: [], posts: [], officialEvents: [], capabilities: { canCreateNotice: false, canManageNotice: false, canCreatePost: false, canModeratePost: false, canCreateEvent: false, canManageEvent: false } }));
      await refresh();
    };
    void supabase.auth.getSession().then(({ data }) => synchronize(data.session?.user.id));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { void synchronize(session?.user.id); });
    return () => { active = false; generationRef.current += 1; subscription.unsubscribe(); };
  }, [refresh]);

  const open = (next: DialogState, trigger: HTMLButtonElement) => { triggerRef.current = trigger; setError(undefined); setDialog(next); };
  const close = useCallback(() => {
    if (busy) return;
    setDialog(undefined);
    setError(undefined);
    requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
  }, [busy]);

  const submit = async (form: FormState) => {
    if (!dialog || !clubUuid) return;
    setBusy(true);
    setError(undefined);
    try {
      let payload: ClubNoticeInput | ClubPostInput | ClubOfficialEventInput | undefined;
      if (dialog.operation === "create" || dialog.operation === "update") {
        if (dialog.contentType === "notice") payload = { title: form.title.trim(), contentSummary: form.summary.trim(), noticeType: form.kind as ClubNoticeInput["noticeType"], importance: form.importance as ClubNoticeInput["importance"], visibility: form.visibility };
        else if (dialog.contentType === "post") payload = { title: form.title.trim(), contentSummary: form.summary.trim(), postType: form.kind as ClubPostInput["postType"], startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : undefined, endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : undefined, location: form.location.trim() || undefined, capacity: form.capacity ? Number(form.capacity) : undefined, participantTarget: form.participantTarget.trim() || undefined, recruitmentStatus: form.recruitmentStatus ? form.recruitmentStatus as ClubPostInput["recruitmentStatus"] : undefined, visibility: form.visibility };
        else payload = { title: form.title.trim(), eventType: form.kind as ClubOfficialEventInput["eventType"], eventStatus: form.eventStatus as ClubOfficialEventInput["eventStatus"], startsAt: new Date(form.startsAt).toISOString(), endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : undefined, location: form.location.trim(), participantTarget: form.participantTarget.trim(), capacity: form.capacity ? Number(form.capacity) : undefined, reservationMethod: form.reservationMethod as ClubOfficialEventInput["reservationMethod"], memberReservationGuidance: form.memberGuidance.trim() || undefined, organizerGuidance: form.organizerGuidance.trim() || undefined, visibility: form.visibility };
      }
      await mutateClubCoreContent(createClient(), { clubUuid, requestId: crypto.randomUUID(), contentType: dialog.contentType, operation: dialog.operation, contentId: dialog.record?.id, expectedVersion: dialog.record?.version, payload });
      const refreshed = await refresh();
      window.dispatchEvent(new Event("pul:club-core-content-changed"));
      setDialog(undefined);
      setMessage(refreshed ? "동호회 콘텐츠가 저장되었습니다." : "저장은 완료되었지만 화면을 갱신하지 못했습니다. 다시 불러오기를 눌러 주세요.");
      requestAnimationFrame(() => sectionRef.current?.focus({ preventScroll: true }));
    } catch (cause) {
      const next = cause instanceof ClubCoreContentError ? cause.userMessage : "콘텐츠를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";
      setError(next);
      if (cause instanceof ClubCoreContentError && cause.shouldRefresh) await refresh();
    } finally {
      setBusy(false);
    }
  };

  const noticeAction = snapshot.capabilities.canCreateNotice ? <ControlButton onClick={(trigger) => open({ contentType: "notice", operation: "create" }, trigger)}>공지 등록</ControlButton> : undefined;
  const postAction = snapshot.capabilities.canCreatePost ? <ControlButton onClick={(trigger) => open({ contentType: "post", operation: "create" }, trigger)}>글쓰기</ControlButton> : undefined;
  const eventAction = snapshot.capabilities.canCreateEvent ? <ControlButton onClick={(trigger) => open({ contentType: "event", operation: "create" }, trigger)}>일정 등록</ControlButton> : undefined;

  return <div ref={sectionRef} tabIndex={-1} className="contents">
    <div className="sr-only" aria-live="polite">{message ?? error}</div>
    {snapshot.availability === "loadFailed" ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">동호회 콘텐츠를 불러오지 못했습니다. <button type="button" onClick={() => void refresh()} className="ml-1 min-h-11 font-bold underline">다시 불러오기</button></div> : null}
    <ClubOfficialEventsSection detail={runtimeDetail} action={eventAction} onEdit={(record, trigger) => open({ contentType: "event", operation: "update", record }, trigger)} onCancel={(record, trigger) => open({ contentType: "event", operation: "cancel", record }, trigger)} />
    <ClubNoticesSection detail={runtimeDetail} action={noticeAction} onEdit={(record, trigger) => open({ contentType: "notice", operation: "update", record }, trigger)} onDelete={(record, trigger) => open({ contentType: "notice", operation: "delete", record }, trigger)} />
    <ClubBoardSection detail={runtimeDetail} action={postAction} onEdit={(record, trigger) => open({ contentType: "post", operation: "update", record }, trigger)} onDelete={(record, trigger) => open({ contentType: "post", operation: "delete", record }, trigger)} />
    {dialog ? <ContentDialog dialog={dialog} busy={busy} error={error} onClose={close} onSubmit={submit} /> : null}
  </div>;
}
