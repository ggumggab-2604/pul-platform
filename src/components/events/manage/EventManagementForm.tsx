"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";

import { changeManagedEventStatusAction, saveManagedEventAction } from "@/app/events/manage/actions";
import {
  eventRegionOptions,
  eventScaleLabels,
  matchTypeLabels,
  recruitmentStatusLabels,
  registrationStatusLabels,
  venueTypeLabels,
  type EventMutationOperation,
  type EventMutationPayload,
  type EventRegion,
  type EventScale,
  type MatchType,
  type RecruitmentStatus,
  type RegistrationStatus,
  type VenueType,
} from "@/lib/events/eventDirectory";
import { formatEventManagementTimestamp, type ManagedEvent } from "@/lib/events/eventManagement";
import { cn } from "@/lib/utils";

type Draft = {
  eventKey: string;
  title: string;
  matchType: MatchType;
  eventScale: EventScale;
  region: EventRegion;
  venueName: string;
  venueType: VenueType;
  startDate: string;
  endDate: string;
  scheduleNote: string;
  registrationStatus: RegistrationStatus;
  targetAudience: string;
  organizer: string;
  summary: string;
  benefits: string;
  recruitmentStatus: RecruitmentStatus;
  relatedCourseKey: string;
  officialUrl: string;
  registrationUrl: string;
  registrationNote: string;
  isFeatured: boolean;
};

type StatusOperation = Extract<EventMutationOperation, "publish" | "hide" | "end">;

const INPUT = "min-h-12 w-full min-w-0 rounded-xl border border-pul-border bg-white px-3 py-2 text-base text-foreground";
const publicationLabels = { published: "공개", hidden: "숨김", removed: "제거" } as const;
const freshnessLabels = { "starting-soon": "7일 이내 시작", "status-mismatch": "날짜·접수 상태 확인" } as const;

function blankDraft(): Draft {
  return {
    eventKey: "", title: "", matchType: "field", eventScale: "friendly", region: "서울", venueName: "",
    venueType: "field", startDate: "", endDate: "", scheduleNote: "", registrationStatus: "scheduled",
    targetAudience: "", organizer: "", summary: "", benefits: "", recruitmentStatus: "none",
    relatedCourseKey: "", officialUrl: "", registrationUrl: "", registrationNote: "", isFeatured: false,
  };
}

function eventDraft(event: ManagedEvent): Draft {
  return {
    eventKey: event.eventKey,
    title: event.title,
    matchType: event.matchType,
    eventScale: event.eventScale,
    region: event.region,
    venueName: event.venueName,
    venueType: event.venueType,
    startDate: event.startDate ?? "",
    endDate: event.endDate ?? "",
    scheduleNote: event.scheduleNote ?? "",
    registrationStatus: event.registrationStatus,
    targetAudience: event.targetAudience.join("\n"),
    organizer: event.organizer,
    summary: event.summary,
    benefits: event.benefits.join("\n"),
    recruitmentStatus: event.recruitmentStatus,
    relatedCourseKey: event.relatedCourseKey ?? "",
    officialUrl: event.officialUrl ?? "",
    registrationUrl: event.registrationUrl ?? "",
    registrationNote: event.registrationNote ?? "",
    isFeatured: event.isFeatured,
  };
}

function lines(value: string) {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function payload(draft: Draft): EventMutationPayload {
  return {
    title: draft.title,
    matchType: draft.matchType,
    eventScale: draft.eventScale,
    region: draft.region,
    venueName: draft.venueName,
    venueType: draft.venueType,
    startDate: draft.startDate || null,
    endDate: draft.endDate || null,
    scheduleNote: draft.scheduleNote || null,
    registrationStatus: draft.registrationStatus,
    targetAudience: lines(draft.targetAudience),
    organizer: draft.organizer,
    summary: draft.summary,
    benefits: lines(draft.benefits),
    recruitmentStatus: draft.recruitmentStatus,
    relatedCourseKey: draft.relatedCourseKey || null,
    officialUrl: draft.officialUrl || null,
    registrationUrl: draft.registrationUrl || null,
    registrationNote: draft.registrationNote || null,
    isFeatured: draft.isFeatured,
  };
}

export function EventManagementForm({ event = null }: { event?: ManagedEvent | null }) {
  const router = useRouter();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const statusTriggerRef = useRef<HTMLButtonElement>(null);
  const focusAfterTransitionRef = useRef(false);
  const draftIdentity = event ? `${event.eventKey}:${event.version}` : "new";
  const [draftState, setDraftState] = useState(() => ({ identity: draftIdentity, value: event ? eventDraft(event) : blankDraft() }));
  const draft = draftState.identity === draftIdentity ? draftState.value : event ? eventDraft(event) : blankDraft();
  const setDraft = (value: Draft) => setDraftState({ identity: draftIdentity, value });
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [confirmOperation, setConfirmOperation] = useState<StatusOperation | null>(null);
  const [isPending, startTransition] = useTransition();
  const readOnly = event?.publicationStatus === "removed";

  const focusHeading = () => requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));
  useEffect(() => {
    if (isPending || !focusAfterTransitionRef.current) return;
    focusAfterTransitionRef.current = false;
    focusHeading();
  }, [event?.version, isPending]);

  const submit = (submitEvent: FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();
    setNotice(null);
    if (draft.startDate && draft.endDate && draft.endDate < draft.startDate) {
      setNotice({ type: "error", message: "종료일은 시작일보다 빠를 수 없습니다." });
      focusHeading();
      return;
    }
    if (!draft.startDate && !draft.scheduleNote.trim()) {
      setNotice({ type: "error", message: "시작일 또는 일정 안내를 입력해 주세요." });
      focusHeading();
      return;
    }
    startTransition(async () => {
      const result = await saveManagedEventAction({
        operation: event ? "update" : "create",
        eventKey: event?.eventKey ?? draft.eventKey.trim(),
        expectedVersion: event?.version ?? null,
        payload: payload(draft),
      });
      setNotice({ type: result.ok ? "success" : "error", message: result.message });
      if (result.ok) {
        router.replace(`/events/manage/${encodeURIComponent(result.eventKey)}`);
        router.refresh();
      } else if (result.shouldRefresh) {
        router.refresh();
      }
      focusAfterTransitionRef.current = true;
    });
  };

  const requestStatusChange = (operation: StatusOperation, trigger: HTMLButtonElement) => {
    statusTriggerRef.current = trigger;
    setConfirmOperation(operation);
  };

  const cancelStatusChange = () => {
    setConfirmOperation(null);
    requestAnimationFrame(() => statusTriggerRef.current?.isConnected && statusTriggerRef.current.focus({ preventScroll: true }));
  };

  const changeStatus = () => {
    if (!event || !confirmOperation) return;
    const operation = confirmOperation;
    startTransition(async () => {
      const result = await changeManagedEventStatusAction({ operation, eventKey: event.eventKey, expectedVersion: event.version });
      setConfirmOperation(null);
      setNotice({ type: result.ok ? "success" : "error", message: result.message });
      router.refresh();
      focusAfterTransitionRef.current = true;
    });
  };

  return (
    <div aria-busy={isPending}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 ref={headingRef} tabIndex={-1} className="text-2xl font-black text-foreground outline-none sm:text-3xl">{event ? "대회·이벤트 정보 수정" : "새 대회·이벤트 등록"}</h1><p className="mt-2 text-base leading-7 text-pul-muted">{event ? "현재 version을 기준으로 저장합니다. 다른 운영자가 먼저 변경하면 최신 정보를 다시 불러옵니다." : "새 항목은 숨김 상태로 등록됩니다. 내용을 확인한 뒤 직접 공개하세요."}</p></div>
        <Link href="/events/manage" className="inline-flex min-h-11 items-center rounded-xl border border-pul-border bg-white px-4 font-bold text-pul-deep">목록으로</Link>
      </div>

      {notice ? <p role={notice.type === "error" ? "alert" : "status"} className={cn("mt-5 rounded-xl border p-4 text-sm leading-6", notice.type === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800")}>{notice.message}</p> : null}

      {event ? <section className="mt-5 rounded-2xl border border-pul-border bg-pul-light p-4" aria-label="현재 운영 상태"><div className="flex flex-wrap items-center justify-between gap-3"><div><strong className="text-foreground">현재 상태: {publicationLabels[event.publicationStatus]} · {registrationStatusLabels[event.registrationStatus]}</strong><p className="mt-1 text-sm text-pul-muted">version {event.version} · 최근 수정 {formatEventManagementTimestamp(event.updatedAt)}</p>{event.freshnessStatus ? <p className="mt-2 inline-flex rounded-full bg-amber-100 px-3 py-1 text-sm font-black text-amber-900">{freshnessLabels[event.freshnessStatus]}</p> : null}</div>{!readOnly ? <div className="flex flex-wrap gap-2">{event.publicationStatus === "published" ? <StatusButton onClick={(button) => requestStatusChange("hide", button)}>숨김 전환</StatusButton> : <StatusButton onClick={(button) => requestStatusChange("publish", button)}>공개 전환</StatusButton>}{event.registrationStatus !== "ended" ? <StatusButton onClick={(button) => requestStatusChange("end", button)}>접수 종료</StatusButton> : null}</div> : null}</div></section> : null}

      <form onSubmit={submit} className="mt-5 space-y-5">
        <Section title="기본 정보">
          {!event ? <Field label="공개 event key" htmlFor="event-key" description="영문·숫자·밑줄·하이픈, 최대 64자"><input id="event-key" required pattern="[A-Za-z0-9][A-Za-z0-9_-]{0,63}" maxLength={64} value={draft.eventKey} onChange={(inputEvent) => setDraft({ ...draft, eventKey: inputEvent.target.value })} className={INPUT} /></Field> : null}
          <Field label="제목" htmlFor="event-title"><input id="event-title" required minLength={2} maxLength={160} value={draft.title} onChange={(inputEvent) => setDraft({ ...draft, title: inputEvent.target.value })} className={INPUT} /></Field>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="시합 유형" htmlFor="event-match-type"><select id="event-match-type" value={draft.matchType} onChange={(inputEvent) => setDraft({ ...draft, matchType: inputEvent.target.value as MatchType })} className={INPUT}>{Object.entries(matchTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="규모" htmlFor="event-scale"><select id="event-scale" value={draft.eventScale} onChange={(inputEvent) => setDraft({ ...draft, eventScale: inputEvent.target.value as EventScale })} className={INPUT}>{Object.entries(eventScaleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field></div>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="지역" htmlFor="event-region"><select id="event-region" value={draft.region} onChange={(inputEvent) => setDraft({ ...draft, region: inputEvent.target.value as EventRegion })} className={INPUT}>{eventRegionOptions.map((region) => <option key={region}>{region}</option>)}</select></Field><Field label="장소 유형" htmlFor="event-venue-type"><select id="event-venue-type" value={draft.venueType} onChange={(inputEvent) => setDraft({ ...draft, venueType: inputEvent.target.value as VenueType })} className={INPUT}>{Object.entries(venueTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field></div>
          <Field label="장소명" htmlFor="event-venue"><input id="event-venue" required minLength={2} maxLength={200} value={draft.venueName} onChange={(inputEvent) => setDraft({ ...draft, venueName: inputEvent.target.value })} className={INPUT} /></Field>
        </Section>

        <Section title="일정·접수">
          <div className="grid gap-4 sm:grid-cols-2"><Field label="시작일 (선택)" htmlFor="event-start-date"><input id="event-start-date" type="date" value={draft.startDate} onChange={(inputEvent) => setDraft({ ...draft, startDate: inputEvent.target.value })} className={INPUT} /></Field><Field label="종료일 (선택)" htmlFor="event-end-date"><input id="event-end-date" type="date" min={draft.startDate || undefined} disabled={!draft.startDate} value={draft.endDate} onChange={(inputEvent) => setDraft({ ...draft, endDate: inputEvent.target.value })} className={INPUT} /></Field></div>
          <Field label="일정 안내 (날짜 미정이면 필수)" htmlFor="event-schedule-note"><input id="event-schedule-note" required={!draft.startDate} minLength={draft.startDate ? undefined : 2} maxLength={300} placeholder="예: 2026년 가을 예정" value={draft.scheduleNote} onChange={(inputEvent) => setDraft({ ...draft, scheduleNote: inputEvent.target.value })} className={INPUT} /></Field>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="접수 상태" htmlFor="event-registration-status"><select id="event-registration-status" value={draft.registrationStatus} onChange={(inputEvent) => setDraft({ ...draft, registrationStatus: inputEvent.target.value as RegistrationStatus })} className={INPUT}>{Object.entries(registrationStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="모집 안내" htmlFor="event-recruitment-status"><select id="event-recruitment-status" value={draft.recruitmentStatus} onChange={(inputEvent) => setDraft({ ...draft, recruitmentStatus: inputEvent.target.value as RecruitmentStatus })} className={INPUT}>{Object.entries(recruitmentStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field></div>
          <Field label="참가 대상" htmlFor="event-target-audience" description="한 줄에 하나씩, 최소 1개·최대 12개"><textarea id="event-target-audience" required rows={4} value={draft.targetAudience} onChange={(inputEvent) => setDraft({ ...draft, targetAudience: inputEvent.target.value })} className={`${INPUT} resize-y`} /></Field>
          <Field label="접수 안내 (선택)" htmlFor="event-registration-note"><textarea id="event-registration-note" rows={3} maxLength={1000} value={draft.registrationNote} onChange={(inputEvent) => setDraft({ ...draft, registrationNote: inputEvent.target.value })} className={`${INPUT} resize-y`} /></Field>
        </Section>

        <Section title="소개·연결">
          <Field label="주최·주관" htmlFor="event-organizer"><input id="event-organizer" required minLength={2} maxLength={200} value={draft.organizer} onChange={(inputEvent) => setDraft({ ...draft, organizer: inputEvent.target.value })} className={INPUT} /></Field>
          <Field label="소개" htmlFor="event-summary"><textarea id="event-summary" required minLength={10} maxLength={3000} rows={7} value={draft.summary} onChange={(inputEvent) => setDraft({ ...draft, summary: inputEvent.target.value })} className={`${INPUT} resize-y`} /></Field>
          <Field label="혜택·특징 (선택)" htmlFor="event-benefits" description="한 줄에 하나씩, 최대 12개"><textarea id="event-benefits" rows={4} value={draft.benefits} onChange={(inputEvent) => setDraft({ ...draft, benefits: inputEvent.target.value })} className={`${INPUT} resize-y`} /></Field>
          <Field label="연결 골프장 key (선택)" htmlFor="event-related-course"><input id="event-related-course" pattern="[A-Za-z0-9][A-Za-z0-9_-]{0,63}" maxLength={64} value={draft.relatedCourseKey} onChange={(inputEvent) => setDraft({ ...draft, relatedCourseKey: inputEvent.target.value })} className={INPUT} /></Field>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="공식 URL (선택)" htmlFor="event-official-url"><input id="event-official-url" type="url" pattern="https://.*" maxLength={500} value={draft.officialUrl} onChange={(inputEvent) => setDraft({ ...draft, officialUrl: inputEvent.target.value })} className={INPUT} /></Field><Field label="접수 URL (선택)" htmlFor="event-registration-url"><input id="event-registration-url" type="url" pattern="https://.*" maxLength={500} value={draft.registrationUrl} onChange={(inputEvent) => setDraft({ ...draft, registrationUrl: inputEvent.target.value })} className={INPUT} /></Field></div>
          <label className="flex min-h-12 items-center gap-3 rounded-xl border border-pul-border px-3 font-bold text-foreground"><input type="checkbox" checked={draft.isFeatured} onChange={(inputEvent) => setDraft({ ...draft, isFeatured: inputEvent.target.checked })} className="h-5 w-5" />추천 대회·이벤트로 표시</label>
        </Section>

        <button type="submit" disabled={isPending || readOnly} className="min-h-12 w-full rounded-xl bg-pul-deep px-5 text-lg font-black text-white disabled:cursor-not-allowed disabled:opacity-50">{isPending ? "처리 중…" : event ? "변경 내용 저장" : "숨김 상태로 등록"}</button>
      </form>

      <span className="sr-only" aria-live="polite">{isPending ? "대회·이벤트 운영 요청을 처리하는 중입니다." : ""}</span>
      {confirmOperation && event ? <StatusConfirm operation={confirmOperation} eventTitle={event.title} busy={isPending} onCancel={cancelStatusChange} onConfirm={changeStatus} /> : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-4 rounded-2xl border border-pul-border bg-white p-4 sm:p-6"><h2 className="text-xl font-black text-foreground">{title}</h2>{children}</section>;
}

function Field({ label, htmlFor, description, children }: { label: string; htmlFor: string; description?: string; children: React.ReactNode }) {
  return <div><label htmlFor={htmlFor} className="block font-bold text-foreground">{label}</label>{description ? <p id={`${htmlFor}-description`} className="mt-1 text-sm text-pul-muted">{description}</p> : null}<div className="mt-2">{children}</div></div>;
}

function StatusButton({ onClick, children }: { onClick: (button: HTMLButtonElement) => void; children: React.ReactNode }) {
  return <button type="button" onClick={(event) => onClick(event.currentTarget)} className="min-h-11 rounded-xl border border-pul-border bg-white px-4 font-bold text-pul-deep">{children}</button>;
}

function StatusConfirm({ operation, eventTitle, busy, onCancel, onConfirm }: { operation: StatusOperation; eventTitle: string; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const initialRef = useRef<HTMLButtonElement>(null);
  const label = operation === "publish" ? "공개" : operation === "hide" ? "숨김" : "접수 종료";
  useEffect(() => {
    initialRef.current?.focus({ preventScroll: true });
    const onKeyDown = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === "Escape" && !busy) { keyboardEvent.preventDefault(); onCancel(); return; }
      if (keyboardEvent.key !== "Tab") return;
      const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])");
      if (!buttons?.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (keyboardEvent.shiftKey && document.activeElement === first) { keyboardEvent.preventDefault(); last.focus(); }
      else if (!keyboardEvent.shiftKey && document.activeElement === last) { keyboardEvent.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [busy, onCancel]);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="presentation"><div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="event-status-title" aria-describedby="event-status-description" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><h2 id="event-status-title" className="text-xl font-black text-foreground">대회·이벤트 {label}</h2><p id="event-status-description" className="mt-3 text-base leading-7 text-pul-muted">“{eventTitle}” 항목을 {label} 처리하시겠습니까? 이 작업은 자동으로 실행되지 않습니다.</p><div className="mt-5 grid grid-cols-2 gap-2"><button ref={initialRef} type="button" disabled={busy} onClick={onCancel} className="min-h-12 rounded-xl border border-pul-border font-bold text-pul-deep">취소</button><button type="button" disabled={busy} onClick={onConfirm} className="min-h-12 rounded-xl bg-pul-deep font-bold text-white">{label}</button></div></div></div>;
}
