"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";

import {
  changeManagedCourseStatusAction,
  findCourseDuplicatesAction,
  saveManagedCourseAction,
} from "@/app/courses/manage/actions";
import {
  type CourseDuplicateCandidate,
  type ManagedCourse,
  type ManagedCourseFeature,
  type ManagedCourseInput,
} from "@/lib/courses/courseManagement";
import {
  courseOperationLabels,
  courseRegionOptions,
  courseTypeLabels,
  type CourseOperation,
  type CourseRegion,
  type CourseType,
} from "@/lib/courses/courseDirectory";
import { cn } from "@/lib/utils";

type Draft = {
  name: string;
  courseType: CourseType;
  region: CourseRegion;
  city: string;
  address: string;
  holes: string;
  operatingHours: string;
  operation: CourseOperation;
  phone: string;
  parkingAvailable: "unknown" | "yes" | "no";
  featureCodes: ManagedCourseFeature[];
  description: string;
  reservationUrl: string;
  reservationGuide: string;
  feeGuide: string;
  latitude: string;
  longitude: string;
};

const INPUT = "min-h-12 w-full min-w-0 rounded-xl border border-pul-border bg-white px-3 py-2 text-base text-foreground";
const featureOptions: [ManagedCourseFeature, string][] = [
  ["club_available", "동호회 있음"],
  ["event_history", "대회 개최 이력"],
  ["lesson_available", "레슨 가능"],
  ["equipment_rental", "장비 대여"],
];

function blankDraft(): Draft {
  return {
    name: "", courseType: "field", region: "서울", city: "", address: "", holes: "9",
    operatingHours: "", operation: "walkIn", phone: "", parkingAvailable: "unknown",
    featureCodes: [], description: "", reservationUrl: "", reservationGuide: "",
    feeGuide: "", latitude: "", longitude: "",
  };
}

function courseDraft(course: ManagedCourse): Draft {
  return {
    name: course.name,
    courseType: course.courseType,
    region: course.region,
    city: course.city,
    address: course.address,
    holes: String(course.holes),
    operatingHours: course.operatingHours ?? "",
    operation: course.operation,
    phone: course.phone ?? "",
    parkingAvailable: course.parkingAvailable === null ? "unknown" : course.parkingAvailable ? "yes" : "no",
    featureCodes: course.featureCodes,
    description: course.description,
    reservationUrl: course.reservationUrl ?? "",
    reservationGuide: course.reservationGuide ?? "",
    feeGuide: course.feeGuide ?? "",
    latitude: course.latitude === null ? "" : String(course.latitude),
    longitude: course.longitude === null ? "" : String(course.longitude),
  };
}

function nullableNumber(value: string) {
  return value.trim() === "" ? null : Number(value);
}

function payload(draft: Draft): ManagedCourseInput {
  return {
    name: draft.name,
    courseType: draft.courseType,
    region: draft.region,
    city: draft.city,
    address: draft.address,
    holes: Number(draft.holes),
    operatingHours: draft.operatingHours || null,
    operation: draft.operation,
    phone: draft.phone || null,
    parkingAvailable: draft.parkingAvailable === "unknown" ? null : draft.parkingAvailable === "yes",
    featureCodes: draft.featureCodes,
    description: draft.description,
    reservationUrl: draft.reservationUrl || null,
    reservationGuide: draft.reservationGuide || null,
    feeGuide: draft.feeGuide || null,
    latitude: nullableNumber(draft.latitude),
    longitude: nullableNumber(draft.longitude),
  };
}

export function CourseManagementForm({ course = null }: { course?: ManagedCourse | null }) {
  const router = useRouter();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState(() => course ? courseDraft(course) : blankDraft());
  const [duplicates, setDuplicates] = useState<CourseDuplicateCandidate[] | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [confirmStatus, setConfirmStatus] = useState<"activate" | "deactivate" | null>(null);
  const [isPending, startTransition] = useTransition();

  const checkDuplicates = () => {
    setNotice(null);
    startTransition(async () => {
      const result = await findCourseDuplicatesAction({ name: draft.name, region: draft.region, city: draft.city, excludeCourseKey: course?.courseKey ?? null });
      if (result.ok) {
        setDuplicates(result.candidates);
        setNotice({ type: "success", message: result.candidates.length ? "비슷한 골프장을 확인해 주세요. 다른 골프장이라면 계속 저장할 수 있습니다." : "같은 이름·지역의 중복 후보가 없습니다." });
      } else {
        setNotice({ type: "error", message: result.message });
      }
    });
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(null);
    startTransition(async () => {
      const result = await saveManagedCourseAction({
        operation: course ? "update" : "create",
        courseKey: course?.courseKey ?? null,
        expectedUpdatedAt: course?.updatedAt ?? null,
        payload: payload(draft),
      });
      setNotice({ type: result.ok ? "success" : "error", message: result.message });
      if (result.ok && result.courseKey) {
        router.replace(`/courses/manage/${encodeURIComponent(result.courseKey)}`);
        router.refresh();
      } else if (!result.ok && result.shouldRefresh) {
        router.refresh();
      }
      requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));
    });
  };

  const changeStatus = () => {
    if (!course || !confirmStatus) return;
    const operation = confirmStatus;
    startTransition(async () => {
      const result = await changeManagedCourseStatusAction({ operation, courseKey: course.courseKey, expectedUpdatedAt: course.updatedAt });
      setConfirmStatus(null);
      setNotice({ type: result.ok ? "success" : "error", message: result.message });
      router.refresh();
      requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));
    });
  };

  return (
    <div aria-busy={isPending}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-black text-foreground outline-none sm:text-3xl">
            {course ? "골프장 정보 수정" : "새 골프장 등록"}
          </h1>
          <p className="mt-2 text-base leading-7 text-pul-muted">
            {course ? "공개 주소 식별자는 유지되며, 최신 수정 시각을 기준으로 안전하게 저장합니다." : "새 골프장은 숨김 상태로 등록됩니다. 내용을 확인한 뒤 공개하세요."}
          </p>
        </div>
        <Link href="/courses/manage" className="inline-flex min-h-11 items-center rounded-xl border border-pul-border bg-white px-4 font-bold text-pul-deep">목록으로</Link>
      </div>

      {notice ? (
        <p role={notice.type === "error" ? "alert" : "status"} className={cn("mt-5 rounded-xl border p-4 text-sm leading-6", notice.type === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800")}>{notice.message}</p>
      ) : null}

      {course ? (
        <section className="mt-5 rounded-2xl border border-pul-border bg-pul-light p-4" aria-label="현재 공개 상태">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><strong className="text-foreground">현재 상태: {course.courseStatus === "active" ? "공개" : course.courseStatus === "inactive" ? "숨김" : "제거"}</strong><p className="mt-1 text-sm text-pul-muted">최근 수정 {new Date(course.updatedAt).toLocaleString("ko-KR")}</p></div>
            {course.courseStatus !== "removed" ? <button type="button" onClick={(event) => { cancelRef.current = event.currentTarget; setConfirmStatus(course.courseStatus === "active" ? "deactivate" : "activate"); }} className="min-h-11 rounded-xl border border-pul-border bg-white px-4 font-bold text-pul-deep">{course.courseStatus === "active" ? "숨김 전환" : "공개 전환"}</button> : null}
          </div>
        </section>
      ) : null}

      <form onSubmit={submit} className="mt-5 space-y-5">
        <Section title="기본정보">
          <Field label="골프장명" htmlFor="course-name"><input id="course-name" required minLength={2} maxLength={120} value={draft.name} onChange={(event) => { setDraft({ ...draft, name: event.target.value }); setDuplicates(null); }} className={INPUT} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="유형" htmlFor="course-type"><select id="course-type" value={draft.courseType} onChange={(event) => setDraft({ ...draft, courseType: event.target.value as CourseType })} className={INPUT}>{Object.entries(courseTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            <Field label="지역" htmlFor="course-region"><select id="course-region" value={draft.region} onChange={(event) => { setDraft({ ...draft, region: event.target.value as CourseRegion }); setDuplicates(null); }} className={INPUT}>{courseRegionOptions.map((region) => <option key={region}>{region}</option>)}</select></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="시·군·구" htmlFor="course-city"><input id="course-city" required maxLength={100} value={draft.city} onChange={(event) => { setDraft({ ...draft, city: event.target.value }); setDuplicates(null); }} className={INPUT} /></Field>
            <Field label="홀 수" htmlFor="course-holes"><input id="course-holes" type="number" required min={1} max={72} step={1} value={draft.holes} onChange={(event) => setDraft({ ...draft, holes: event.target.value })} className={INPUT} /></Field>
          </div>
          <Field label="주소" htmlFor="course-address"><input id="course-address" required minLength={5} maxLength={300} value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} className={INPUT} /></Field>
          <button type="button" disabled={isPending || draft.name.trim().length < 2 || !draft.city.trim()} onClick={checkDuplicates} className="min-h-11 rounded-xl border border-pul-point bg-white px-4 font-bold text-pul-point disabled:opacity-50">비슷한 골프장 확인</button>
          {duplicates ? <DuplicateNotice candidates={duplicates} /> : null}
        </Section>

        <Section title="이용정보">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="운영 방식" htmlFor="course-operation"><select id="course-operation" value={draft.operation} onChange={(event) => setDraft({ ...draft, operation: event.target.value as CourseOperation })} className={INPUT}>{Object.entries(courseOperationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            <Field label="주차 정보" htmlFor="course-parking"><select id="course-parking" value={draft.parkingAvailable} onChange={(event) => setDraft({ ...draft, parkingAvailable: event.target.value as Draft["parkingAvailable"] })} className={INPUT}><option value="unknown">정보 없음</option><option value="yes">주차 가능</option><option value="no">주차 어려움</option></select></Field>
          </div>
          <Field label="운영시간 (선택)" htmlFor="course-hours"><input id="course-hours" maxLength={200} placeholder="예: 09:00~18:00 · 월요일 휴장" value={draft.operatingHours} onChange={(event) => setDraft({ ...draft, operatingHours: event.target.value })} className={INPUT} /></Field>
          <Field label="전화번호 (선택)" htmlFor="course-phone"><input id="course-phone" inputMode="tel" maxLength={30} value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} className={INPUT} /></Field>
          <fieldset><legend className="font-bold text-foreground">제공 기능</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{featureOptions.map(([value, label]) => <label key={value} className="flex min-h-11 items-center gap-3 rounded-xl border border-pul-border px-3"><input type="checkbox" checked={draft.featureCodes.includes(value)} onChange={(event) => setDraft({ ...draft, featureCodes: event.target.checked ? [...draft.featureCodes, value] : draft.featureCodes.filter((item) => item !== value) })} className="h-5 w-5" />{label}</label>)}</div></fieldset>
        </Section>

        <Section title="위치·예약">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="위도 (선택)" htmlFor="course-latitude"><input id="course-latitude" type="number" min={-90} max={90} step="any" value={draft.latitude} onChange={(event) => setDraft({ ...draft, latitude: event.target.value })} className={INPUT} /></Field>
            <Field label="경도 (선택)" htmlFor="course-longitude"><input id="course-longitude" type="number" min={-180} max={180} step="any" value={draft.longitude} onChange={(event) => setDraft({ ...draft, longitude: event.target.value })} className={INPUT} /></Field>
          </div>
          <Field label="예약 URL (선택)" htmlFor="course-url" description="https:// 주소만 입력할 수 있습니다."><input id="course-url" type="url" pattern="https://.*" maxLength={500} value={draft.reservationUrl} onChange={(event) => setDraft({ ...draft, reservationUrl: event.target.value })} className={INPUT} /></Field>
          <Field label="예약 안내 (선택)" htmlFor="course-reservation-guide"><textarea id="course-reservation-guide" rows={3} maxLength={1000} value={draft.reservationGuide} onChange={(event) => setDraft({ ...draft, reservationGuide: event.target.value })} className={`${INPUT} resize-y`} /></Field>
          <Field label="이용 요금 안내 (선택)" htmlFor="course-fee-guide"><textarea id="course-fee-guide" rows={2} maxLength={500} value={draft.feeGuide} onChange={(event) => setDraft({ ...draft, feeGuide: event.target.value })} className={`${INPUT} resize-y`} /></Field>
        </Section>

        <Section title="소개">
          <Field label="골프장 소개" htmlFor="course-description" description="확인된 사실을 10~2000자로 작성하세요."><textarea id="course-description" required minLength={10} maxLength={2000} rows={7} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className={`${INPUT} resize-y`} /></Field>
        </Section>

        <button type="submit" disabled={isPending || course?.courseStatus === "removed"} className="min-h-12 w-full rounded-xl bg-pul-deep px-5 text-lg font-black text-white disabled:cursor-not-allowed disabled:opacity-50">{isPending ? "처리 중…" : course ? "변경 내용 저장" : "숨김 상태로 등록"}</button>
      </form>

      <span className="sr-only" aria-live="polite">{isPending ? "골프장 운영 요청을 처리하는 중입니다." : ""}</span>
      {confirmStatus && course ? <StatusConfirm operation={confirmStatus} courseName={course.name} busy={isPending} onCancel={() => { setConfirmStatus(null); requestAnimationFrame(() => cancelRef.current?.isConnected && cancelRef.current.focus({ preventScroll: true })); }} onConfirm={changeStatus} /> : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-4 rounded-2xl border border-pul-border bg-white p-4 sm:p-6"><h2 className="text-xl font-black text-foreground">{title}</h2>{children}</section>;
}

function Field({ label, htmlFor, description, children }: { label: string; htmlFor: string; description?: string; children: React.ReactNode }) {
  return <div><label htmlFor={htmlFor} className="block font-bold text-foreground">{label}</label>{description ? <p id={`${htmlFor}-description`} className="mt-1 text-sm text-pul-muted">{description}</p> : null}<div className="mt-2" aria-describedby={description ? `${htmlFor}-description` : undefined}>{children}</div></div>;
}

function DuplicateNotice({ candidates }: { candidates: CourseDuplicateCandidate[] }) {
  if (!candidates.length) return <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">중복 후보가 없습니다.</p>;
  return <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><h3 className="font-black text-amber-900">비슷한 골프장 {candidates.length}곳</h3><p className="mt-1 text-sm text-amber-800">같은 장소인지 확인하세요. 다른 골프장이라면 등록을 계속할 수 있습니다.</p><ul className="mt-3 space-y-2">{candidates.map((item) => <li key={item.courseKey} className="text-sm text-amber-950"><strong>{item.name}</strong> · {item.region} {item.city} · {item.address}</li>)}</ul></div>;
}

function StatusConfirm({ operation, courseName, busy, onCancel, onConfirm }: { operation: "activate" | "deactivate"; courseName: string; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const initialRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    initialRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) { event.preventDefault(); onCancel(); return; }
      if (event.key !== "Tab") return;
      const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])");
      if (!buttons?.length) return;
      const first = buttons[0]; const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [busy, onCancel]);
  const label = operation === "activate" ? "공개" : "숨김";
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="presentation"><div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="course-status-title" aria-describedby="course-status-description" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><h2 id="course-status-title" className="text-xl font-black text-foreground">골프장 {label}</h2><p id="course-status-description" className="mt-3 text-base leading-7 text-pul-muted">“{courseName}” 정보를 {label} 상태로 전환하시겠습니까?</p><div className="mt-5 grid grid-cols-2 gap-2"><button ref={initialRef} type="button" disabled={busy} onClick={onCancel} className="min-h-12 rounded-xl border border-pul-border font-bold text-pul-deep">취소</button><button type="button" disabled={busy} onClick={onConfirm} className="min-h-12 rounded-xl bg-pul-deep font-bold text-white">{label}</button></div></div></div>;
}
