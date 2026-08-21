"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";

import { resolveLessonSubmissionAction } from "@/app/lessons/manage/requests/actions";
import type {
  LessonSubmissionPage,
  ManagedLessonSubmissionRequest,
} from "@/lib/lessons/lessonSubmission";
import { cn } from "@/lib/utils";

type LessonDraft = {
  directoryKey: string;
  lessonType: string;
  province: string;
  district: string;
  location: string;
  instructor: string;
  organizer: string;
  target: string;
  schedule: string;
  scheduleTag: string;
  time: string;
  price: string;
  format: string;
  recruitStatus: string;
  description: string;
  curriculum: string;
  supplies: string;
  notices: string;
  inquiryNote: string;
  inquiryUrl: string;
  officialUrl: string;
};

type VideoDraft = {
  directoryKey: string;
  category: string;
  channelName: string;
  instructorName: string;
  level: string;
  duration: string;
  description: string;
  youtubeUrl: string;
  youtubeChannelUrl: string;
  thumbnailType: string;
  tags: string;
};

const statusLabels = { pending: "처리 대기", completed: "등록 완료", rejected: "반려" } as const;
const typeLabels = { lesson: "레슨·교육", video: "무료 영상" } as const;
const INPUT_CLASS = "min-h-11 w-full rounded-lg border border-pul-border bg-white px-3 py-2 text-base text-foreground";

function lessonDraft(request: ManagedLessonSubmissionRequest): LessonDraft {
  return {
    directoryKey: "",
    lessonType: "beginner",
    province: request.region ?? "서울",
    district: "운영자 확인",
    location: "운영자 확인 필요",
    instructor: request.providerName,
    organizer: request.providerName,
    target: "absolute_beginner",
    schedule: "운영자 확인 필요",
    scheduleTag: "always",
    time: "운영자 확인",
    price: "운영자 확인",
    format: "offline",
    recruitStatus: "waiting",
    description: request.summary,
    curriculum: "운영자 확인 후 보완",
    supplies: "운영자 확인",
    notices: "공식 안내 페이지에서 세부 내용을 확인하세요.",
    inquiryNote: request.secondaryUrl ? "외부 공식 문의·신청 페이지를 확인하세요." : "",
    inquiryUrl: request.secondaryUrl ?? "",
    officialUrl: request.sourceUrl,
  };
}

function videoDraft(request: ManagedLessonSubmissionRequest): VideoDraft {
  return {
    directoryKey: "",
    category: request.category ?? "other",
    channelName: request.providerName,
    instructorName: request.providerName,
    level: "beginner",
    duration: "운영자 확인",
    description: request.summary,
    youtubeUrl: request.sourceUrl,
    youtubeChannelUrl: "",
    thumbnailType: "green",
    tags: "",
  };
}

export function LessonSubmissionManagementPage({ initialPage }: { initialPage: LessonSubmissionPage<ManagedLessonSubmissionRequest> }) {
  const router = useRouter();
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [lesson, setLesson] = useState<LessonDraft | null>(null);
  const [video, setVideo] = useState<VideoDraft | null>(null);
  const [rejectionNote, setRejectionNote] = useState("");
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const selected = selectedKey
    ? initialPage.items.find((request) => request.requestKey === selectedKey) ?? null
    : null;

  const choose = (request: ManagedLessonSubmissionRequest) => {
    setSelectedKey(request.requestKey);
    setLesson(request.requestType === "lesson" ? lessonDraft(request) : null);
    setVideo(request.requestType === "video" ? videoDraft(request) : null);
    setRejectionNote("");
    setNotice(null);
    requestAnimationFrame(() => detailHeadingRef.current?.focus({ preventScroll: true }));
  };

  const complete = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || selected.requestStatus !== "pending") return;
    setNotice(null);
    startTransition(async () => {
      const directoryKey = selected.requestType === "lesson" ? lesson?.directoryKey : video?.directoryKey;
      const directoryPayload = selected.requestType === "lesson" && lesson
        ? {
            title: selected.title,
            type: lesson.lessonType,
            province: lesson.province,
            district: lesson.district,
            location: lesson.location,
            instructor: lesson.instructor,
            organizer: lesson.organizer,
            targets: [lesson.target],
            schedule: lesson.schedule,
            scheduleTags: lesson.scheduleTag ? [lesson.scheduleTag] : [],
            time: lesson.time,
            price: lesson.price,
            format: lesson.format,
            recruitStatus: lesson.recruitStatus,
            description: lesson.description,
            curriculum: lesson.curriculum,
            supplies: lesson.supplies,
            notices: lesson.notices.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
            inquiryNote: lesson.inquiryNote || null,
            inquiryUrl: lesson.inquiryUrl || null,
            officialUrl: lesson.officialUrl || null,
            featured: false,
          }
        : selected.requestType === "video" && video
          ? {
              title: selected.title,
              category: video.category,
              channelName: video.channelName,
              instructorName: video.instructorName,
              level: video.level,
              duration: video.duration,
              description: video.description,
              youtubeUrl: video.youtubeUrl,
              youtubeChannelUrl: video.youtubeChannelUrl || null,
              thumbnailType: video.thumbnailType,
              tags: video.tags.split(",").map((item) => item.trim()).filter(Boolean),
              featured: false,
            }
          : null;
      const result = await resolveLessonSubmissionAction({
        requestKey: selected.requestKey,
        expectedVersion: selected.version,
        requestType: selected.requestType,
        resolution: "completed",
        directoryKey,
        directoryPayload,
        resolutionNote: null,
      });
      setNotice({ type: result.ok ? "success" : "error", message: result.message });
      if (result.ok || result.shouldRefresh) router.refresh();
    });
  };

  const reject = () => {
    if (!selected || selected.requestStatus !== "pending") return;
    setNotice(null);
    startTransition(async () => {
      const result = await resolveLessonSubmissionAction({
        requestKey: selected.requestKey,
        expectedVersion: selected.version,
        requestType: selected.requestType,
        resolution: "rejected",
        directoryKey: null,
        directoryPayload: null,
        resolutionNote: rejectionNote,
      });
      setNotice({ type: result.ok ? "success" : "error", message: result.message });
      if (result.ok || result.shouldRefresh) router.refresh();
    });
  };

  return (
    <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(280px,0.72fr)_minmax(0,1.4fr)]" aria-busy={isPending}>
      <section className="rounded-2xl border border-pul-border bg-white p-4 sm:p-5">
        <h2 className="text-xl font-bold text-foreground">등록 요청 목록</h2>
        <p className="mt-1 text-sm text-pul-muted">최근 {initialPage.items.length}건 · 전체 {initialPage.total}건</p>
        {initialPage.items.length === 0 ? (
          <p className="mt-5 rounded-xl border border-dashed border-pul-border p-6 text-center text-sm text-pul-muted">처리할 등록 요청이 없습니다.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {initialPage.items.map((request) => (
              <li key={request.requestKey}>
                <button type="button" onClick={() => choose(request)} aria-pressed={selectedKey === request.requestKey} className={cn("min-h-12 w-full rounded-xl border p-3 text-left", selectedKey === request.requestKey ? "border-pul-point bg-pul-light" : "border-pul-border bg-white hover:bg-[#fafbfa]")}>
                  <span className="block break-words font-bold text-foreground">{request.title}</span>
                  <span className="mt-1 block text-xs text-pul-muted">{typeLabels[request.requestType]} · {statusLabels[request.requestStatus]} · {request.requesterDisplayName}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="min-w-0 rounded-2xl border border-pul-border bg-white p-4 sm:p-6">
        <h2 ref={detailHeadingRef} tabIndex={-1} className="text-xl font-bold text-foreground outline-none">요청 상세·처리</h2>
        {!selected ? (
          <p className="mt-4 rounded-xl border border-dashed border-pul-border p-8 text-center text-sm text-pul-muted">왼쪽 목록에서 요청을 선택해 주세요.</p>
        ) : (
          <>
            <div className="mt-4 rounded-xl bg-[#fafbfa] p-4 text-sm leading-7 text-foreground">
              <p><strong>종류:</strong> {typeLabels[selected.requestType]}</p>
              <p><strong>요청자:</strong> {selected.requesterDisplayName}</p>
              <p><strong>강사·기관·채널:</strong> {selected.providerName}</p>
              <p><strong>{selected.requestType === "lesson" ? "지역" : "카테고리"}:</strong> {selected.region ?? selected.category}</p>
              <p className="break-words"><strong>소개:</strong> {selected.summary}</p>
              <p className="break-all"><strong>공식 URL:</strong> <a href={selected.sourceUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-pul-point underline">새 창에서 확인</a></p>
              {selected.secondaryUrl ? <p><strong>문의 URL:</strong> <a href={selected.secondaryUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-pul-point underline">새 창에서 확인</a></p> : null}
              <p><strong>상태:</strong> {statusLabels[selected.requestStatus]} · v{selected.version}</p>
            </div>

            {notice ? <p role={notice.type === "error" ? "alert" : "status"} className={cn("mt-4 rounded-lg border p-3 text-sm", notice.type === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800")}>{notice.message}</p> : null}

            {selected.requestStatus === "pending" ? (
              <>
                <form onSubmit={complete} className="mt-5 space-y-4">
                  <h3 className="text-lg font-bold text-foreground">hidden 디렉터리 초안 만들기</h3>
                  <p className="text-sm leading-6 text-pul-muted">요청값으로 미리 채운 항목을 운영자가 확인·보완해야 합니다. 완료해도 자동 공개되지 않습니다.</p>
                  {selected.requestType === "lesson" && lesson ? <LessonDraftFields draft={lesson} onChange={setLesson} /> : null}
                  {selected.requestType === "video" && video ? <VideoDraftFields draft={video} onChange={setVideo} /> : null}
                  <button type="submit" disabled={isPending} className="min-h-12 w-full rounded-lg bg-pul-deep px-5 font-bold text-white disabled:opacity-50">{isPending ? "처리 중…" : "hidden 초안 생성·요청 완료"}</button>
                </form>
                <div className="mt-6 border-t border-pul-border pt-5">
                  <h3 className="text-lg font-bold text-foreground">요청 반려</h3>
                  <label htmlFor="lesson-submission-rejection" className="mt-3 block font-bold text-foreground">신청자 안내 사유</label>
                  <textarea id="lesson-submission-rejection" value={rejectionNote} required minLength={2} maxLength={500} rows={3} onChange={(event) => setRejectionNote(event.target.value)} className={`${INPUT_CLASS} mt-2 resize-y`} />
                  <button type="button" disabled={isPending || rejectionNote.trim().length < 2} onClick={reject} className="mt-3 min-h-11 w-full rounded-lg border border-red-200 bg-red-50 px-4 font-bold text-red-800 disabled:opacity-50">반려</button>
                </div>
              </>
            ) : (
              <p className="mt-5 rounded-xl border border-pul-border bg-[#fafbfa] p-4 text-sm text-pul-muted">
                이미 처리된 요청입니다.{selected.resultPublicKey ? ` 생성된 공개 key: ${selected.resultPublicKey}` : ""}{selected.resolutionNote ? ` 안내: ${selected.resolutionNote}` : ""}
              </p>
            )}
          </>
        )}
      </section>
      <span className="sr-only" aria-live="polite">{isPending ? "등록 요청을 처리하는 중입니다." : ""}</span>
    </div>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return <div><label htmlFor={htmlFor} className="block font-bold text-foreground">{label}</label><div className="mt-2">{children}</div></div>;
}

function LessonDraftFields({ draft, onChange }: { draft: LessonDraft; onChange: (draft: LessonDraft) => void }) {
  const set = <K extends keyof LessonDraft>(key: K, value: LessonDraft[K]) => onChange({ ...draft, [key]: value });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="공개 lesson key" htmlFor="lesson-draft-key"><input id="lesson-draft-key" required pattern="[A-Za-z0-9][A-Za-z0-9_-]{0,63}" maxLength={64} value={draft.directoryKey} onChange={(event) => set("directoryKey", event.target.value)} className={INPUT_CLASS} /></Field>
      <Field label="교육 유형" htmlFor="lesson-draft-type"><select id="lesson-draft-type" value={draft.lessonType} onChange={(event) => set("lessonType", event.target.value)} className={INPUT_CLASS}><option value="beginner">입문</option><option value="improvement">실력 향상</option><option value="group">단체</option><option value="online">온라인</option><option value="certification">자격 과정</option><option value="referee">심판</option><option value="instructor">지도자</option></select></Field>
      <Field label="광역 지역" htmlFor="lesson-draft-province"><select id="lesson-draft-province" value={draft.province} onChange={(event) => set("province", event.target.value)} className={INPUT_CLASS}>{["서울", "경기", "인천", "충청", "강원", "전라", "경상", "제주"].map((value) => <option key={value} value={value}>{value}</option>)}</select></Field>
      <Field label="세부 지역" htmlFor="lesson-draft-district"><input id="lesson-draft-district" required maxLength={100} value={draft.district} onChange={(event) => set("district", event.target.value)} className={INPUT_CLASS} /></Field>
      <Field label="장소" htmlFor="lesson-draft-location"><input id="lesson-draft-location" required maxLength={200} value={draft.location} onChange={(event) => set("location", event.target.value)} className={INPUT_CLASS} /></Field>
      <Field label="강사명" htmlFor="lesson-draft-instructor"><input id="lesson-draft-instructor" required maxLength={100} value={draft.instructor} onChange={(event) => set("instructor", event.target.value)} className={INPUT_CLASS} /></Field>
      <Field label="주관 기관" htmlFor="lesson-draft-organizer"><input id="lesson-draft-organizer" required maxLength={160} value={draft.organizer} onChange={(event) => set("organizer", event.target.value)} className={INPUT_CLASS} /></Field>
      <Field label="교육 대상" htmlFor="lesson-draft-target"><select id="lesson-draft-target" value={draft.target} onChange={(event) => set("target", event.target.value)} className={INPUT_CLASS}><option value="absolute_beginner">완전 입문</option><option value="golf_experienced">골프 경험자</option><option value="senior">시니어</option><option value="club_member">동호회원</option><option value="cert_prep">자격 준비</option></select></Field>
      <Field label="일정" htmlFor="lesson-draft-schedule"><input id="lesson-draft-schedule" required maxLength={300} value={draft.schedule} onChange={(event) => set("schedule", event.target.value)} className={INPUT_CLASS} /></Field>
      <Field label="일정 태그" htmlFor="lesson-draft-schedule-tag"><select id="lesson-draft-schedule-tag" value={draft.scheduleTag} onChange={(event) => set("scheduleTag", event.target.value)} className={INPUT_CLASS}><option value="always">상시</option><option value="this_week">이번 주</option><option value="this_month">이번 달</option><option value="closing_soon">마감 임박</option></select></Field>
      <Field label="시간" htmlFor="lesson-draft-time"><input id="lesson-draft-time" required maxLength={100} value={draft.time} onChange={(event) => set("time", event.target.value)} className={INPUT_CLASS} /></Field>
      <Field label="비용 안내" htmlFor="lesson-draft-price"><input id="lesson-draft-price" required maxLength={100} value={draft.price} onChange={(event) => set("price", event.target.value)} className={INPUT_CLASS} /></Field>
      <Field label="방식" htmlFor="lesson-draft-format"><select id="lesson-draft-format" value={draft.format} onChange={(event) => set("format", event.target.value)} className={INPUT_CLASS}><option value="offline">오프라인</option><option value="online">온라인</option><option value="field">필드</option><option value="group">단체</option></select></Field>
      <Field label="모집 상태" htmlFor="lesson-draft-recruit"><select id="lesson-draft-recruit" value={draft.recruitStatus} onChange={(event) => set("recruitStatus", event.target.value)} className={INPUT_CLASS}><option value="waiting">확인 중</option><option value="recruiting">모집 중</option><option value="closed">마감</option></select></Field>
      <div className="sm:col-span-2"><Field label="공개 설명" htmlFor="lesson-draft-description"><textarea id="lesson-draft-description" required minLength={10} maxLength={3000} rows={4} value={draft.description} onChange={(event) => set("description", event.target.value)} className={`${INPUT_CLASS} resize-y`} /></Field></div>
      <div className="sm:col-span-2"><Field label="교육 내용" htmlFor="lesson-draft-curriculum"><textarea id="lesson-draft-curriculum" required minLength={2} maxLength={3000} rows={3} value={draft.curriculum} onChange={(event) => set("curriculum", event.target.value)} className={`${INPUT_CLASS} resize-y`} /></Field></div>
      <Field label="준비물" htmlFor="lesson-draft-supplies"><input id="lesson-draft-supplies" required maxLength={1000} value={draft.supplies} onChange={(event) => set("supplies", event.target.value)} className={INPUT_CLASS} /></Field>
      <Field label="유의사항 (줄별 1개)" htmlFor="lesson-draft-notices"><textarea id="lesson-draft-notices" maxLength={3600} rows={3} value={draft.notices} onChange={(event) => set("notices", event.target.value)} className={`${INPUT_CLASS} resize-y`} /></Field>
      <Field label="문의 안내 (선택)" htmlFor="lesson-draft-inquiry-note"><input id="lesson-draft-inquiry-note" maxLength={1000} value={draft.inquiryNote} onChange={(event) => set("inquiryNote", event.target.value)} className={INPUT_CLASS} /></Field>
      <Field label="문의 URL (선택)" htmlFor="lesson-draft-inquiry-url"><input id="lesson-draft-inquiry-url" type="url" pattern="https://.*" maxLength={500} value={draft.inquiryUrl} onChange={(event) => set("inquiryUrl", event.target.value)} className={INPUT_CLASS} /></Field>
      <div className="sm:col-span-2"><Field label="공식 URL (선택)" htmlFor="lesson-draft-official-url"><input id="lesson-draft-official-url" type="url" pattern="https://.*" maxLength={500} value={draft.officialUrl} onChange={(event) => set("officialUrl", event.target.value)} className={INPUT_CLASS} /></Field></div>
    </div>
  );
}

function VideoDraftFields({ draft, onChange }: { draft: VideoDraft; onChange: (draft: VideoDraft) => void }) {
  const set = <K extends keyof VideoDraft>(key: K, value: VideoDraft[K]) => onChange({ ...draft, [key]: value });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="공개 video key" htmlFor="video-draft-key"><input id="video-draft-key" required pattern="[A-Za-z0-9][A-Za-z0-9_-]{0,63}" maxLength={64} value={draft.directoryKey} onChange={(event) => set("directoryKey", event.target.value)} className={INPUT_CLASS} /></Field>
      <Field label="카테고리" htmlFor="video-draft-category"><input id="video-draft-category" required value={draft.category} readOnly className={`${INPUT_CLASS} bg-slate-50`} /></Field>
      <Field label="채널명" htmlFor="video-draft-channel"><input id="video-draft-channel" required maxLength={120} value={draft.channelName} onChange={(event) => set("channelName", event.target.value)} className={INPUT_CLASS} /></Field>
      <Field label="강사명" htmlFor="video-draft-instructor"><input id="video-draft-instructor" required maxLength={100} value={draft.instructorName} onChange={(event) => set("instructorName", event.target.value)} className={INPUT_CLASS} /></Field>
      <Field label="난이도" htmlFor="video-draft-level"><select id="video-draft-level" value={draft.level} onChange={(event) => set("level", event.target.value)} className={INPUT_CLASS}><option value="intro">입문</option><option value="beginner">초급</option><option value="intermediate">중급</option><option value="advanced">고급</option></select></Field>
      <Field label="영상 길이" htmlFor="video-draft-duration"><input id="video-draft-duration" required maxLength={20} value={draft.duration} onChange={(event) => set("duration", event.target.value)} className={INPUT_CLASS} /></Field>
      <div className="sm:col-span-2"><Field label="공개 설명" htmlFor="video-draft-description"><textarea id="video-draft-description" required minLength={10} maxLength={2000} rows={4} value={draft.description} onChange={(event) => set("description", event.target.value)} className={`${INPUT_CLASS} resize-y`} /></Field></div>
      <div className="sm:col-span-2"><Field label="YouTube URL" htmlFor="video-draft-url"><input id="video-draft-url" type="url" required pattern="https://.*" maxLength={500} value={draft.youtubeUrl} onChange={(event) => set("youtubeUrl", event.target.value)} className={INPUT_CLASS} /></Field></div>
      <Field label="채널 URL (선택)" htmlFor="video-draft-channel-url"><input id="video-draft-channel-url" type="url" pattern="https://.*" maxLength={500} value={draft.youtubeChannelUrl} onChange={(event) => set("youtubeChannelUrl", event.target.value)} className={INPUT_CLASS} /></Field>
      <Field label="카드 색상" htmlFor="video-draft-thumbnail"><select id="video-draft-thumbnail" value={draft.thumbnailType} onChange={(event) => set("thumbnailType", event.target.value)} className={INPUT_CLASS}><option value="green">green</option><option value="teal">teal</option><option value="emerald">emerald</option><option value="forest">forest</option></select></Field>
      <div className="sm:col-span-2"><Field label="태그 (쉼표 구분)" htmlFor="video-draft-tags"><input id="video-draft-tags" maxLength={720} value={draft.tags} onChange={(event) => set("tags", event.target.value)} className={INPUT_CLASS} /></Field></div>
    </div>
  );
}
