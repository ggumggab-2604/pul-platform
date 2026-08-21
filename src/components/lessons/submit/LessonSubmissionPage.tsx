"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";

import { submitLessonSubmissionAction } from "@/app/lessons/submit/actions";
import type {
  LessonSubmissionPage as SubmissionPage,
  LessonSubmissionRequest,
  LessonSubmissionRequestType,
} from "@/lib/lessons/lessonSubmission";
import { cn } from "@/lib/utils";

type Draft = {
  title: string;
  providerName: string;
  region: string;
  category: string;
  summary: string;
  sourceUrl: string;
  secondaryUrl: string;
};

const regions = ["서울", "경기", "인천", "충청", "강원", "전라", "경상", "제주"] as const;
const categories = [
  ["beginner_intro", "입문"], ["basic_stance", "기본자세"], ["swing", "스윙"],
  ["tee_shot", "티샷"], ["putting", "퍼팅"], ["approach", "어프로치"],
  ["distance_control", "거리 조절"], ["direction", "방향성"], ["rules_manner", "규칙·매너"],
  ["practical_strategy", "실전 전략"], ["equipment", "장비"], ["club_reservation", "구장·예약"],
  ["tournament_prep", "대회 준비"], ["cert_referee", "자격·심판"], ["other", "기타"],
] as const;
const statusLabels = { pending: "접수", completed: "등록 완료", rejected: "반려" } as const;
const typeLabels = { lesson: "레슨·교육", video: "무료 영상" } as const;
const INPUT_CLASS = "min-h-11 w-full rounded-lg border border-pul-border bg-white px-3 py-2 text-base text-foreground";

function blankDraft(type: LessonSubmissionRequestType): Draft {
  return {
    title: "",
    providerName: "",
    region: type === "lesson" ? "서울" : "",
    category: type === "video" ? "beginner_intro" : "",
    summary: "",
    sourceUrl: "",
    secondaryUrl: "",
  };
}

export function LessonSubmissionPage({
  requestType,
  requesterDisplayName,
  initialRequests,
  loadError,
}: {
  requestType: LessonSubmissionRequestType;
  requesterDisplayName: string;
  initialRequests: SubmissionPage<LessonSubmissionRequest>;
  loadError: string | null;
}) {
  const router = useRouter();
  const requestIdRef = useRef<string | null>(null);
  const [draft, setDraft] = useState(() => blankDraft(requestType));
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const change = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    requestIdRef.current = null;
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(null);
    const requestId = requestIdRef.current ?? crypto.randomUUID();
    requestIdRef.current = requestId;
    startTransition(async () => {
      const result = await submitLessonSubmissionAction({
        requestId,
        requestType,
        payload: {
          title: draft.title,
          providerName: draft.providerName,
          region: requestType === "lesson" ? draft.region : null,
          category: requestType === "video" ? draft.category : null,
          summary: draft.summary,
          sourceUrl: draft.sourceUrl,
          secondaryUrl: requestType === "lesson" ? draft.secondaryUrl || null : null,
        },
      });
      setNotice({ type: result.ok ? "success" : "error", message: result.message });
      if (result.ok) {
        requestIdRef.current = null;
        setDraft(blankDraft(requestType));
        router.refresh();
      } else if (result.shouldRefresh) {
        router.refresh();
      }
    });
  };

  return (
    <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]" aria-busy={isPending}>
      <section className="rounded-2xl border border-pul-border bg-white p-4 sm:p-6">
        <div className="grid grid-cols-2 gap-2" aria-label="등록 요청 종류">
          {(["lesson", "video"] as const).map((type) => (
            <Link
              key={type}
              href={`/lessons/submit?type=${type}`}
              aria-current={requestType === type ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center justify-center rounded-lg border px-3 text-center font-bold",
                requestType === type ? "border-pul-point bg-pul-light text-pul-deep" : "border-pul-border bg-white text-pul-muted",
              )}
            >
              {typeLabels[type]} 요청
            </Link>
          ))}
        </div>
        <h2 className="mt-5 text-xl font-bold text-foreground">{typeLabels[requestType]} 정보</h2>
        <p className="mt-1 text-sm text-pul-muted">요청자: {requesterDisplayName} · 연락처·실명·증빙 파일은 받지 않습니다.</p>

        {notice ? (
          <p role={notice.type === "error" ? "alert" : "status"} className={cn("mt-4 rounded-lg border p-3 text-sm", notice.type === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800")}>{notice.message}</p>
        ) : null}

        <form onSubmit={submit} className="mt-5 space-y-4">
          <Field label={requestType === "lesson" ? "레슨·교육명" : "영상 제목"} htmlFor="submission-title">
            <input id="submission-title" value={draft.title} required minLength={2} maxLength={160} onChange={(event) => change("title", event.target.value)} className={INPUT_CLASS} />
          </Field>
          <Field label={requestType === "lesson" ? "강사·기관명" : "강사·채널명"} htmlFor="submission-provider">
            <input id="submission-provider" value={draft.providerName} required maxLength={160} onChange={(event) => change("providerName", event.target.value)} className={INPUT_CLASS} />
          </Field>
          {requestType === "lesson" ? (
            <Field label="지역" htmlFor="submission-region">
              <select id="submission-region" value={draft.region} onChange={(event) => change("region", event.target.value)} className={INPUT_CLASS}>
                {regions.map((region) => <option key={region} value={region}>{region}</option>)}
              </select>
            </Field>
          ) : (
            <Field label="카테고리" htmlFor="submission-category">
              <select id="submission-category" value={draft.category} onChange={(event) => change("category", event.target.value)} className={INPUT_CLASS}>
                {categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
          )}
          <Field label="간단한 소개" htmlFor="submission-summary" description="10~2000자의 plain text로 작성해 주세요.">
            <textarea id="submission-summary" value={draft.summary} required minLength={10} maxLength={2000} rows={5} onChange={(event) => change("summary", event.target.value)} className={`${INPUT_CLASS} resize-y`} />
          </Field>
          <Field label={requestType === "lesson" ? "공식 안내 URL" : "YouTube URL"} htmlFor="submission-source-url" description={requestType === "lesson" ? "https:// 주소만 허용됩니다." : "youtube.com 또는 youtu.be의 https:// 주소만 허용됩니다."}>
            <input id="submission-source-url" type="url" inputMode="url" value={draft.sourceUrl} required maxLength={500} pattern="https://.*" onChange={(event) => change("sourceUrl", event.target.value)} className={INPUT_CLASS} />
          </Field>
          {requestType === "lesson" ? (
            <Field label="문의·신청 URL (선택)" htmlFor="submission-secondary-url" description="https:// 주소만 허용됩니다.">
              <input id="submission-secondary-url" type="url" inputMode="url" value={draft.secondaryUrl} maxLength={500} pattern="https://.*" onChange={(event) => change("secondaryUrl", event.target.value)} className={INPUT_CLASS} />
            </Field>
          ) : null}
          <button type="submit" disabled={isPending} className="min-h-12 w-full rounded-lg bg-pul-deep px-5 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
            {isPending ? "접수 중…" : "등록 요청 보내기"}
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-pul-border bg-white p-4 sm:p-5">
        <h2 className="text-xl font-bold text-foreground">내 등록 요청</h2>
        <p className="mt-1 text-sm text-pul-muted">최근 {initialRequests.items.length}건 · 전체 {initialRequests.total}건</p>
        {loadError ? (
          <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{loadError}</p>
        ) : initialRequests.items.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-pul-border p-6 text-center text-sm text-pul-muted">아직 등록 요청이 없습니다.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {initialRequests.items.map((request) => (
              <li key={request.requestKey} className="rounded-xl border border-pul-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words font-bold text-foreground">{request.title}</p>
                    <p className="mt-1 text-xs text-pul-muted">{typeLabels[request.requestType]} · {new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(new Date(request.createdAt))}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-pul-light px-2.5 py-1 text-xs font-bold text-pul-deep">{statusLabels[request.requestStatus]}</span>
                </div>
                {request.resolutionNote ? <p className="mt-2 break-words text-sm text-pul-muted">운영자 안내: {request.resolutionNote}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
      <span className="sr-only" aria-live="polite">{isPending ? "등록 요청을 처리하는 중입니다." : ""}</span>
    </div>
  );
}

function Field({ label, htmlFor, description, children }: { label: string; htmlFor: string; description?: string; children: React.ReactNode }) {
  const descriptionId = description ? `${htmlFor}-description` : undefined;
  return (
    <div>
      <label htmlFor={htmlFor} className="block font-bold text-foreground">{label} *</label>
      {description ? <p id={descriptionId} className="mt-1 text-sm text-pul-muted">{description}</p> : null}
      <div className="mt-2" aria-describedby={descriptionId}>{children}</div>
    </div>
  );
}
