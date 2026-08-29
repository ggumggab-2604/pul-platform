"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";

import {
  changeCertificationDirectoryPublicationAction,
  saveCertificationDirectoryItemAction,
} from "@/app/certification/manage/actions";
import { Container } from "@/components/ui/Container";
import {
  courseCategoryLabels,
  courseMethodLabels,
  courseStatusLabels,
  examScheduleStatusLabels,
  examTypeLabels,
  providerTypeLabels,
  refereeRoleTypeLabels,
  type CourseCategory,
  type CourseMethod,
  type CourseStatus,
  type ExamScheduleStatus,
  type ExamType,
  type ProviderType,
  type RefereeJobRoleType,
} from "@/data/certificationData";
import type {
  CertificationPage,
  CertificationPublicationStatus,
  ManagedCertificationJob,
  ManagedExamSchedule,
  ManagedQualificationCourse,
} from "@/lib/certification/certificationDirectory";
import {
  formatCertificationDateOnly,
  formatCertificationDateRange,
  type CertificationManagementEntity,
  type CertificationManagementPublicationOperation,
  type CertificationManagementSaveInput,
} from "@/lib/certification/certificationManagement";

export type CertificationManagementSection = "courses" | "exams" | "jobs";
type EditorMode = "none" | "create" | "edit";

type SharedProps = {
  keyword: string;
  publicationStatus: CertificationPublicationStatus | "";
  editorMode: EditorMode;
  editorError: string;
};

type Props =
  | SharedProps & {
      section: "courses";
      page: CertificationPage<ManagedQualificationCourse>;
      editing: ManagedQualificationCourse | null;
    }
  | SharedProps & {
      section: "exams";
      page: CertificationPage<ManagedExamSchedule>;
      editing: ManagedExamSchedule | null;
    }
  | SharedProps & {
      section: "jobs";
      page: CertificationPage<ManagedCertificationJob>;
      editing: ManagedCertificationJob | null;
    };

type PublicationTarget = {
  entity: CertificationManagementEntity;
  key: string;
  title: string;
  expectedVersion: number;
  operation: CertificationManagementPublicationOperation;
};

const INPUT = "min-h-12 w-full min-w-0 rounded-xl border border-pul-border bg-white px-3 py-2 text-base text-foreground disabled:bg-slate-100 disabled:text-pul-muted";
const publicationLabels: Record<CertificationPublicationStatus, string> = {
  published: "공개",
  hidden: "숨김",
  removed: "제거됨",
};
const sectionMeta = {
  courses: {
    label: "교육과정",
    newLabel: "새 과정 등록",
    empty: "등록된 교육과정이 없습니다.",
    emptyDescription: "새 과정 등록으로 첫 교육과정을 등록해 주세요.",
  },
  exams: {
    label: "시험 일정",
    newLabel: "새 시험 일정 등록",
    empty: "등록된 시험 일정이 없습니다.",
    emptyDescription: "새 시험 일정 등록으로 첫 일정을 등록해 주세요.",
  },
  jobs: {
    label: "심판·관련 구인",
    newLabel: "새 구인 등록",
    empty: "등록된 구인 정보가 없습니다.",
    emptyDescription: "새 구인 등록으로 첫 구인 정보를 등록해 주세요.",
  },
} as const;

function managementUrl(
  section: CertificationManagementSection,
  values: { keyword?: string; status?: string; edit?: string; mode?: "new" } = {},
) {
  const query = new URLSearchParams({ tab: section });
  if (values.keyword) query.set("q", values.keyword);
  if (values.status) query.set("status", values.status);
  if (values.edit) query.set("edit", values.edit);
  if (values.mode) query.set("mode", values.mode);
  return `/certification/manage?${query.toString()}`;
}

function entityFor(section: CertificationManagementSection): CertificationManagementEntity {
  return section === "courses" ? "course" : section === "exams" ? "exam" : "job";
}

function PublicationBadge({ status }: { status: CertificationPublicationStatus }) {
  const tone = status === "published"
    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
    : status === "hidden"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : "border-slate-300 bg-slate-100 text-slate-700";
  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-sm font-black ${tone}`}>
      {publicationLabels[status]}
    </span>
  );
}

export function CertificationDirectoryManagementPage(props: Props) {
  const router = useRouter();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const publicationTriggerRef = useRef<HTMLButtonElement>(null);
  const focusAfterTransitionRef = useRef(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [publicationTarget, setPublicationTarget] = useState<PublicationTarget | null>(null);
  const [isPending, startTransition] = useTransition();
  const meta = sectionMeta[props.section];

  useEffect(() => {
    if (isPending || !focusAfterTransitionRef.current) return;
    focusAfterTransitionRef.current = false;
    headingRef.current?.focus({ preventScroll: true });
  }, [isPending, props]);

  const save = (input: CertificationManagementSaveInput) => {
    if (isPending) return;
    setNotice("");
    setError("");
    startTransition(async () => {
      const result = await saveCertificationDirectoryItemAction(input);
      if (result.ok) {
        setNotice(result.message);
        router.replace(managementUrl(props.section, {
          keyword: props.keyword,
          status: props.publicationStatus,
          edit: result.key,
        }));
        router.refresh();
      } else {
        setError(result.message);
        if (result.shouldRefresh) router.refresh();
      }
      focusAfterTransitionRef.current = true;
    });
  };

  const requestPublication = (target: PublicationTarget, trigger: HTMLButtonElement) => {
    publicationTriggerRef.current = trigger;
    setPublicationTarget(target);
  };

  const cancelPublication = () => {
    setPublicationTarget(null);
    requestAnimationFrame(() => {
      if (publicationTriggerRef.current?.isConnected) {
        publicationTriggerRef.current.focus({ preventScroll: true });
      }
    });
  };

  const confirmPublication = () => {
    if (!publicationTarget || isPending) return;
    const target = publicationTarget;
    setNotice("");
    setError("");
    startTransition(async () => {
      const result = await changeCertificationDirectoryPublicationAction({
        entity: target.entity,
        operation: target.operation,
        key: target.key,
        expectedVersion: target.expectedVersion,
      });
      setPublicationTarget(null);
      if (result.ok) {
        setNotice(result.message);
        router.refresh();
      } else {
        setError(result.message);
        if (result.shouldRefresh) router.refresh();
      }
      focusAfterTransitionRef.current = true;
    });
  };

  return (
    <main className="min-h-screen bg-pul-page" aria-busy={isPending}>
      <Container className="max-w-6xl px-3 py-6 pb-20 sm:py-10">
        <header className="rounded-2xl border border-pul-border bg-white p-5 sm:p-7">
          <nav aria-label="경로" className="flex flex-wrap items-center gap-2 text-sm leading-6 text-slate-700">
            <Link href="/manage" className="font-bold hover:text-pul-point">운영 관리</Link>
            <span aria-hidden="true">›</span>
            <span>자격증·심판</span>
          </nav>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-black text-foreground outline-none sm:text-3xl">
                자격증·심판 운영 관리
              </h1>
              <p className="mt-2 max-w-3xl text-base leading-7 text-slate-700">
                교육과정, 시험 일정, 심판·관련 구인 정보를 등록하고 공개 상태를 관리합니다. 확정 날짜와 사람이 읽는 일정 안내는 서로 대체하지 않고 함께 보존합니다.
              </p>
            </div>
            <Link
              href="/certification/manage/requests"
              prefetch={false}
              className="inline-flex min-h-12 items-center rounded-xl border border-pul-border px-4 font-bold text-pul-deep"
            >
              등록 문의 확인
            </Link>
          </div>
        </header>

        <nav aria-label="자격증·심판 관리 구분" className="mt-5 grid grid-cols-3 gap-2 rounded-2xl border border-pul-border bg-white p-2">
          {(Object.keys(sectionMeta) as CertificationManagementSection[]).map((section) => (
            <Link
              key={section}
              href={managementUrl(section)}
              prefetch={false}
              aria-current={props.section === section ? "page" : undefined}
              className={`flex min-h-12 items-center justify-center rounded-xl px-2 text-center text-sm font-black sm:text-base ${props.section === section ? "bg-pul-deep text-white" : "text-pul-muted hover:bg-pul-light hover:text-pul-deep"}`}
            >
              {sectionMeta[section].label}
            </Link>
          ))}
        </nav>

        <section aria-labelledby="certification-management-list-title" className="mt-5">
          <div className="rounded-2xl border border-pul-border bg-white p-4 sm:p-5">
            <form action="/certification/manage" method="get" className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_auto]">
              <input type="hidden" name="tab" value={props.section} />
              <div>
                <label htmlFor="certification-management-keyword" className="block font-bold text-foreground">검색</label>
                <input
                  id="certification-management-keyword"
                  name="q"
                  type="search"
                  maxLength={100}
                  defaultValue={props.keyword}
                  placeholder="제목·기관·지역·일정"
                  className={`${INPUT} mt-2`}
                />
              </div>
              <div>
                <label htmlFor="certification-management-status" className="block font-bold text-foreground">공개 상태</label>
                <select id="certification-management-status" name="status" defaultValue={props.publicationStatus} className={`${INPUT} mt-2`}>
                  <option value="">전체</option>
                  <option value="published">공개</option>
                  <option value="hidden">숨김</option>
                  <option value="removed">제거됨</option>
                </select>
              </div>
              <button type="submit" className="min-h-12 self-end rounded-xl bg-pul-deep px-5 font-black text-white">검색</button>
            </form>
          </div>

          {notice ? <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 font-bold text-emerald-900">{notice}</p> : null}
          {error ? <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-bold text-red-800">{error}</p> : null}
          {props.editorError ? <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-bold text-red-800">{props.editorError}</p> : null}

          {props.editorMode !== "none" ? (
            <div className="mt-5">
              {props.section === "courses" ? <CourseEditor item={props.editing} onSave={save} busy={isPending} closeHref={managementUrl(props.section, { keyword: props.keyword, status: props.publicationStatus })} /> : null}
              {props.section === "exams" ? <ExamEditor item={props.editing} onSave={save} busy={isPending} closeHref={managementUrl(props.section, { keyword: props.keyword, status: props.publicationStatus })} /> : null}
              {props.section === "jobs" ? <JobEditor item={props.editing} onSave={save} busy={isPending} closeHref={managementUrl(props.section, { keyword: props.keyword, status: props.publicationStatus })} /> : null}
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="certification-management-list-title" className="text-xl font-black text-foreground">{meta.label} 목록</h2>
              <p className="mt-1 text-sm leading-6 text-slate-700">검색 결과 {props.page.total}건 · 최근 수정 순</p>
            </div>
            {props.editorMode === "none" ? (
              <Link
                href={managementUrl(props.section, { keyword: props.keyword, status: props.publicationStatus, mode: "new" })}
                prefetch={false}
                className="inline-flex min-h-12 items-center rounded-xl bg-pul-point px-5 font-black text-white"
              >
                {meta.newLabel}
              </Link>
            ) : null}
          </div>

          {props.page.items.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-pul-border bg-white px-5 py-14 text-center">
              <p className="text-lg font-black text-foreground">{meta.empty}</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">{meta.emptyDescription}</p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {props.section === "courses" ? <CourseList items={props.page.items} keyword={props.keyword} status={props.publicationStatus} onPublication={requestPublication} /> : null}
              {props.section === "exams" ? <ExamList items={props.page.items} keyword={props.keyword} status={props.publicationStatus} onPublication={requestPublication} /> : null}
              {props.section === "jobs" ? <JobList items={props.page.items} keyword={props.keyword} status={props.publicationStatus} onPublication={requestPublication} /> : null}
            </div>
          )}
          {props.page.hasMore ? <p className="mt-4 text-sm font-semibold leading-6 text-slate-700">검색 결과가 많습니다. 검색어 또는 공개 상태를 좁혀 주세요.</p> : null}
        </section>
      </Container>

      <span className="sr-only" aria-live="polite">{isPending ? "자격증·심판 운영 요청을 처리하는 중입니다." : ""}</span>
      {publicationTarget ? (
        <PublicationConfirm target={publicationTarget} busy={isPending} onCancel={cancelPublication} onConfirm={confirmPublication} />
      ) : null}
    </main>
  );
}

type ListShared = {
  keyword: string;
  status: CertificationPublicationStatus | "";
  onPublication: (target: PublicationTarget, trigger: HTMLButtonElement) => void;
};

function RowActions({
  section,
  itemKey,
  title,
  publicationStatus,
  version,
  keyword,
  status,
  onPublication,
}: ListShared & {
  section: CertificationManagementSection;
  itemKey: string;
  title: string;
  publicationStatus: CertificationPublicationStatus;
  version: number;
}) {
  const entity = entityFor(section);
  const operation = publicationStatus === "published" ? "hide" : "publish";
  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
      <Link
        href={managementUrl(section, { keyword, status, edit: itemKey })}
        prefetch={false}
        className="inline-flex min-h-11 items-center justify-center rounded-xl border border-pul-border px-4 font-bold text-pul-deep"
      >
        {publicationStatus === "removed" ? "내용 보기" : "수정"}
      </Link>
      {publicationStatus !== "removed" ? (
        <button
          type="button"
          onClick={(event) => onPublication({ entity, key: itemKey, title, expectedVersion: version, operation }, event.currentTarget)}
          className="min-h-11 rounded-xl bg-pul-deep px-4 font-bold text-white"
        >
          {operation === "publish" ? "공개" : "숨김"}
        </button>
      ) : null}
    </div>
  );
}

function CourseList({ items, ...shared }: ListShared & { items: ManagedQualificationCourse[] }) {
  return items.map((item) => (
    <article key={item.courseKey} className="rounded-2xl border border-pul-border bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2"><PublicationBadge status={item.publicationStatus} /><span className="text-sm font-bold text-pul-point">{courseCategoryLabels[item.category]}</span></div>
          <h3 className="mt-2 text-lg font-black text-foreground">{item.title}</h3>
          <p className="mt-1 text-base text-pul-muted">{item.provider} · {item.region} · {courseMethodLabels[item.method]}</p>
        </div>
        <RowActions section="courses" itemKey={item.courseKey} title={item.title} publicationStatus={item.publicationStatus} version={item.version} {...shared} />
      </div>
      <dl className="mt-4 grid gap-3 rounded-xl bg-pul-page p-4 text-sm sm:grid-cols-2">
        <div><dt className="font-bold text-pul-muted">일정 안내</dt><dd className="mt-1 text-foreground">{item.schedule}</dd></div>
        <div><dt className="font-bold text-pul-muted">확정 날짜</dt><dd className="mt-1 text-foreground">{formatCertificationDateRange(item.startsOn, item.endsOn)}</dd></div>
      </dl>
    </article>
  ));
}

function ExamList({ items, ...shared }: ListShared & { items: ManagedExamSchedule[] }) {
  return items.map((item) => (
    <article key={item.scheduleKey} className="rounded-2xl border border-pul-border bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2"><PublicationBadge status={item.publicationStatus} /><span className="text-sm font-bold text-pul-point">{examTypeLabels[item.examType]}</span></div>
          <h3 className="mt-2 text-lg font-black text-foreground">{item.examName}</h3>
          <p className="mt-1 text-base text-pul-muted">{item.organization} · {examScheduleStatusLabels[item.status]}</p>
        </div>
        <RowActions section="exams" itemKey={item.scheduleKey} title={item.examName} publicationStatus={item.publicationStatus} version={item.version} {...shared} />
      </div>
      <dl className="mt-4 grid gap-3 rounded-xl bg-pul-page p-4 text-sm sm:grid-cols-3">
        <div><dt className="font-bold text-pul-muted">접수</dt><dd className="mt-1 text-foreground">{item.applicationPeriod}<br />{formatCertificationDateRange(item.applicationStartsOn, item.applicationEndsOn)}</dd></div>
        <div><dt className="font-bold text-pul-muted">시험</dt><dd className="mt-1 text-foreground">{item.examDate}<br />{formatCertificationDateOnly(item.examOn)}</dd></div>
        <div><dt className="font-bold text-pul-muted">결과</dt><dd className="mt-1 text-foreground">{item.resultDate}<br />{formatCertificationDateOnly(item.resultOn)}</dd></div>
      </dl>
    </article>
  ));
}

function JobList({ items, ...shared }: ListShared & { items: ManagedCertificationJob[] }) {
  return items.map((item) => (
    <article key={item.jobKey} className="rounded-2xl border border-pul-border bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2"><PublicationBadge status={item.publicationStatus} /><span className="text-sm font-bold text-pul-point">{refereeRoleTypeLabels[item.roleType]}</span></div>
          <h3 className="mt-2 text-lg font-black text-foreground">{item.title}</h3>
          <p className="mt-1 text-base text-pul-muted">{item.organizerName} · {item.region} · {courseStatusLabels[item.status]}</p>
        </div>
        <RowActions section="jobs" itemKey={item.jobKey} title={item.title} publicationStatus={item.publicationStatus} version={item.version} {...shared} />
      </div>
      <dl className="mt-4 grid gap-3 rounded-xl bg-pul-page p-4 text-sm sm:grid-cols-2">
        <div><dt className="font-bold text-pul-muted">일정 안내</dt><dd className="mt-1 text-foreground">{item.schedule}</dd></div>
        <div><dt className="font-bold text-pul-muted">확정 모집 기간</dt><dd className="mt-1 text-foreground">{formatCertificationDateRange(item.applicationStartsOn, item.applicationEndsOn)}</dd></div>
      </dl>
    </article>
  ));
}

function EditorShell({ title, description, readOnly, closeHref, children }: { title: string; description: string; readOnly: boolean; closeHref: string; children: ReactNode }) {
  return (
    <section aria-labelledby="certification-editor-title" className="rounded-2xl border-2 border-pul-point bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="certification-editor-title" className="text-xl font-black text-foreground sm:text-2xl">{title}</h2>
          <p className="mt-2 max-w-3xl text-base leading-7 text-slate-700">{description}</p>
          {readOnly ? <p className="mt-2 font-bold text-amber-800">제거된 항목은 내용을 확인할 수만 있고 다시 변경하거나 공개할 수 없습니다.</p> : null}
        </div>
        <Link href={closeHref} prefetch={false} className="inline-flex min-h-11 items-center rounded-xl border border-pul-border px-4 font-bold text-pul-deep">닫기</Link>
      </div>
      {children}
    </section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <fieldset className="space-y-4 rounded-2xl border border-pul-border p-4 sm:p-5"><legend className="px-2 text-lg font-black text-foreground">{title}</legend>{children}</fieldset>;
}

function Field({ label, htmlFor, description, children }: { label: string; htmlFor: string; description?: string; children: ReactNode }) {
  return <div><label htmlFor={htmlFor} className="block font-bold text-foreground">{label}</label>{description ? <p id={`${htmlFor}-description`} className="mt-1 text-sm leading-6 text-slate-700">{description}</p> : null}<div className="mt-2">{children}</div></div>;
}

function DateFields({ prefix, startLabel, endLabel, start, end, disabled, onStart, onEnd }: { prefix: string; startLabel: string; endLabel: string; start: string; end: string; disabled: boolean; onStart: (value: string) => void; onEnd: (value: string) => void }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={`${startLabel} (선택)`} htmlFor={`${prefix}-start`}><input id={`${prefix}-start`} type="date" value={start} disabled={disabled} onChange={(event) => onStart(event.target.value)} className={INPUT} /></Field>
      <Field label={`${endLabel} (선택)`} htmlFor={`${prefix}-end`}><input id={`${prefix}-end`} type="date" value={end} disabled={disabled} onChange={(event) => onEnd(event.target.value)} className={INPUT} /></Field>
    </div>
  );
}

type EditorShared = { busy: boolean; closeHref: string; onSave: (input: CertificationManagementSaveInput) => void };

type CourseDraft = {
  key: string; title: string; category: CourseCategory; providerType: ProviderType; providerName: string;
  region: string; method: CourseMethod; target: string; schedule: string; startsOn: string; endsOn: string;
  price: string; status: CourseStatus; description: string; officialUrl: string; applicationUrl: string; featured: boolean;
};

function courseDraft(item: ManagedQualificationCourse | null): CourseDraft {
  return item ? {
    key: item.courseKey, title: item.title, category: item.category, providerType: item.providerType,
    providerName: item.provider, region: item.region, method: item.method, target: item.target,
    schedule: item.schedule, startsOn: item.startsOn ?? "", endsOn: item.endsOn ?? "", price: item.price,
    status: item.status, description: item.description, officialUrl: item.officialUrl,
    applicationUrl: item.applicationUrl ?? "", featured: item.featured,
  } : {
    key: "", title: "", category: "instructor", providerType: "association", providerName: "",
    region: "", method: "offline", target: "", schedule: "", startsOn: "", endsOn: "", price: "",
    status: "recruiting", description: "", officialUrl: "", applicationUrl: "", featured: false,
  };
}

function CourseEditor({ item, onSave, busy, closeHref }: EditorShared & { item: ManagedQualificationCourse | null }) {
  const identity = item ? `${item.courseKey}:${item.version}` : "new-course";
  const [state, setState] = useState(() => ({ identity, draft: courseDraft(item) }));
  const draft = state.identity === identity ? state.draft : courseDraft(item);
  const setDraft = (next: CourseDraft) => setState({ identity, draft: next });
  const readOnly = item?.publicationStatus === "removed";
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave({
      entity: "course", operation: item ? "update" : "create", key: draft.key.trim(), expectedVersion: item?.version ?? null,
      payload: {
        title: draft.title, category: draft.category, providerType: draft.providerType, providerName: draft.providerName,
        region: draft.region, method: draft.method, target: draft.target, schedule: draft.schedule,
        startsOn: draft.startsOn || null, endsOn: draft.endsOn || null, price: draft.price, status: draft.status,
        description: draft.description, officialUrl: draft.officialUrl, applicationUrl: draft.applicationUrl || null,
        featured: draft.featured,
      },
    });
  };
  return (
    <EditorShell title={item ? "교육과정 수정" : "새 교육과정 등록"} description={item ? `현재 version ${item.version}을 기준으로 저장합니다. 다른 운영자가 먼저 변경하면 최신 정보를 다시 확인해야 합니다.` : "새 과정은 숨김 상태로 등록됩니다. 날짜가 미정이면 비워 두고 일정 안내에 사람이 읽을 문구를 입력하세요."} readOnly={readOnly} closeHref={closeHref}>
      <form onSubmit={submit} className="mt-5 space-y-5">
        <Section title="기본 정보">
          {!item ? <Field label="과정 식별 키" htmlFor="course-key" description="영문·숫자·밑줄·하이픈, 최대 64자"><input id="course-key" required pattern="[A-Za-z0-9][A-Za-z0-9_-]{0,63}" maxLength={64} value={draft.key} onChange={(event) => setDraft({ ...draft, key: event.target.value })} className={INPUT} /></Field> : null}
          <Field label="과정명" htmlFor="course-title"><input id="course-title" required minLength={2} maxLength={160} disabled={readOnly} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className={INPUT} /></Field>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="과정 구분" htmlFor="course-category"><select id="course-category" disabled={readOnly} value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as CourseCategory })} className={INPUT}>{Object.entries(courseCategoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="교육기관 유형" htmlFor="course-provider-type"><select id="course-provider-type" disabled={readOnly} value={draft.providerType} onChange={(event) => setDraft({ ...draft, providerType: event.target.value as ProviderType })} className={INPUT}>{Object.entries(providerTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field></div>
          <Field label="교육기관명" htmlFor="course-provider"><input id="course-provider" required minLength={2} maxLength={160} disabled={readOnly} value={draft.providerName} onChange={(event) => setDraft({ ...draft, providerName: event.target.value })} className={INPUT} /></Field>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="지역" htmlFor="course-region"><input id="course-region" required maxLength={80} disabled={readOnly} value={draft.region} onChange={(event) => setDraft({ ...draft, region: event.target.value })} className={INPUT} /></Field><Field label="교육 방식" htmlFor="course-method"><select id="course-method" disabled={readOnly} value={draft.method} onChange={(event) => setDraft({ ...draft, method: event.target.value as CourseMethod })} className={INPUT}>{Object.entries(courseMethodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field></div>
          <Field label="교육 대상" htmlFor="course-target"><input id="course-target" required minLength={2} maxLength={300} disabled={readOnly} value={draft.target} onChange={(event) => setDraft({ ...draft, target: event.target.value })} className={INPUT} /></Field>
        </Section>
        <Section title="일정·모집">
          <Field label="일정 안내" htmlFor="course-schedule" description="예: 매월 둘째 주 토요일 / 기관 일정에 따라 변경"><textarea id="course-schedule" required minLength={2} maxLength={500} rows={3} disabled={readOnly} value={draft.schedule} onChange={(event) => setDraft({ ...draft, schedule: event.target.value })} className={`${INPUT} resize-y`} /></Field>
          <DateFields prefix="course-date" startLabel="확정 시작일" endLabel="확정 종료일" start={draft.startsOn} end={draft.endsOn} disabled={readOnly} onStart={(value) => setDraft({ ...draft, startsOn: value })} onEnd={(value) => setDraft({ ...draft, endsOn: value })} />
          <div className="grid gap-4 sm:grid-cols-2"><Field label="비용 안내" htmlFor="course-price"><input id="course-price" required maxLength={100} disabled={readOnly} value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} className={INPUT} /></Field><Field label="모집 상태" htmlFor="course-status"><select id="course-status" disabled={readOnly} value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as CourseStatus })} className={INPUT}>{Object.entries(courseStatusLabels).filter(([value]) => value !== "planned").map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field></div>
        </Section>
        <Section title="설명·연결">
          <Field label="과정 설명" htmlFor="course-description"><textarea id="course-description" required minLength={10} maxLength={3000} rows={7} disabled={readOnly} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className={`${INPUT} resize-y`} /></Field>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="공식 URL" htmlFor="course-official-url"><input id="course-official-url" required type="url" pattern="https://.*" maxLength={500} disabled={readOnly} value={draft.officialUrl} onChange={(event) => setDraft({ ...draft, officialUrl: event.target.value })} className={INPUT} /></Field><Field label="신청 URL (선택)" htmlFor="course-application-url"><input id="course-application-url" type="url" pattern="https://.*" maxLength={500} disabled={readOnly} value={draft.applicationUrl} onChange={(event) => setDraft({ ...draft, applicationUrl: event.target.value })} className={INPUT} /></Field></div>
          <label className="flex min-h-12 items-center gap-3 rounded-xl border border-pul-border px-3 font-bold text-foreground"><input type="checkbox" className="h-5 w-5" disabled={readOnly} checked={draft.featured} onChange={(event) => setDraft({ ...draft, featured: event.target.checked })} />추천 과정으로 표시</label>
        </Section>
        <button type="submit" disabled={busy || readOnly} className="min-h-12 w-full rounded-xl bg-pul-deep px-5 text-lg font-black text-white disabled:cursor-not-allowed disabled:opacity-50">{busy ? "처리 중…" : item ? "변경 내용 저장" : "숨김 상태로 등록"}</button>
      </form>
    </EditorShell>
  );
}

type ExamDraft = {
  key: string; examName: string; examType: ExamType; organizationName: string; applicationPeriod: string;
  applicationStartsOn: string; applicationEndsOn: string; examDate: string; examOn: string;
  venueAnnouncement: string; resultDate: string; resultOn: string; requiredItems: string;
  officialUrl: string; status: ExamScheduleStatus;
};

function examDraft(item: ManagedExamSchedule | null): ExamDraft {
  return item ? {
    key: item.scheduleKey, examName: item.examName, examType: item.examType, organizationName: item.organization,
    applicationPeriod: item.applicationPeriod, applicationStartsOn: item.applicationStartsOn ?? "",
    applicationEndsOn: item.applicationEndsOn ?? "", examDate: item.examDate, examOn: item.examOn ?? "",
    venueAnnouncement: item.venueAnnouncement, resultDate: item.resultDate, resultOn: item.resultOn ?? "",
    requiredItems: item.requiredItems, officialUrl: item.officialUrl, status: item.status,
  } : {
    key: "", examName: "", examType: "life_sports", organizationName: "", applicationPeriod: "",
    applicationStartsOn: "", applicationEndsOn: "", examDate: "", examOn: "", venueAnnouncement: "",
    resultDate: "", resultOn: "", requiredItems: "", officialUrl: "", status: "application_planned",
  };
}

function ExamEditor({ item, onSave, busy, closeHref }: EditorShared & { item: ManagedExamSchedule | null }) {
  const identity = item ? `${item.scheduleKey}:${item.version}` : "new-exam";
  const [state, setState] = useState(() => ({ identity, draft: examDraft(item) }));
  const draft = state.identity === identity ? state.draft : examDraft(item);
  const setDraft = (next: ExamDraft) => setState({ identity, draft: next });
  const readOnly = item?.publicationStatus === "removed";
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave({
      entity: "exam", operation: item ? "update" : "create", key: draft.key.trim(), expectedVersion: item?.version ?? null,
      payload: {
        examName: draft.examName, examType: draft.examType, organizationName: draft.organizationName,
        applicationPeriod: draft.applicationPeriod, applicationStartsOn: draft.applicationStartsOn || null,
        applicationEndsOn: draft.applicationEndsOn || null, examDate: draft.examDate, examOn: draft.examOn || null,
        venueAnnouncement: draft.venueAnnouncement, resultDate: draft.resultDate, resultOn: draft.resultOn || null,
        requiredItems: draft.requiredItems, officialUrl: draft.officialUrl, status: draft.status,
      },
    });
  };
  return (
    <EditorShell title={item ? "시험 일정 수정" : "새 시험 일정 등록"} description={item ? `현재 version ${item.version}을 기준으로 저장합니다. 문자열 일정과 확정 날짜를 함께 확인해 주세요.` : "새 시험 일정은 숨김 상태로 등록됩니다. 아직 확정되지 않은 날짜는 비워 둘 수 있습니다."} readOnly={readOnly} closeHref={closeHref}>
      <form onSubmit={submit} className="mt-5 space-y-5">
        <Section title="시험 기본 정보">
          {!item ? <Field label="시험 일정 식별 키" htmlFor="exam-key" description="영문·숫자·밑줄·하이픈, 최대 64자"><input id="exam-key" required pattern="[A-Za-z0-9][A-Za-z0-9_-]{0,63}" maxLength={64} value={draft.key} onChange={(event) => setDraft({ ...draft, key: event.target.value })} className={INPUT} /></Field> : null}
          <Field label="시험명" htmlFor="exam-name"><input id="exam-name" required minLength={2} maxLength={180} disabled={readOnly} value={draft.examName} onChange={(event) => setDraft({ ...draft, examName: event.target.value })} className={INPUT} /></Field>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="시험 유형" htmlFor="exam-type"><select id="exam-type" disabled={readOnly} value={draft.examType} onChange={(event) => setDraft({ ...draft, examType: event.target.value as ExamType })} className={INPUT}>{Object.entries(examTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="주관기관" htmlFor="exam-organization"><input id="exam-organization" required minLength={2} maxLength={160} disabled={readOnly} value={draft.organizationName} onChange={(event) => setDraft({ ...draft, organizationName: event.target.value })} className={INPUT} /></Field></div>
          <Field label="일정 상태" htmlFor="exam-status"><select id="exam-status" disabled={readOnly} value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as ExamScheduleStatus })} className={INPUT}>{Object.entries(examScheduleStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
        </Section>
        <Section title="접수 일정">
          <Field label="접수 기간 안내" htmlFor="exam-application-period" description="예: 2026년 하반기 접수 예정 / 기관 일정에 따라 변경"><input id="exam-application-period" required minLength={2} maxLength={300} disabled={readOnly} value={draft.applicationPeriod} onChange={(event) => setDraft({ ...draft, applicationPeriod: event.target.value })} className={INPUT} /></Field>
          <DateFields prefix="exam-application" startLabel="확정 접수 시작일" endLabel="확정 접수 종료일" start={draft.applicationStartsOn} end={draft.applicationEndsOn} disabled={readOnly} onStart={(value) => setDraft({ ...draft, applicationStartsOn: value })} onEnd={(value) => setDraft({ ...draft, applicationEndsOn: value })} />
        </Section>
        <Section title="시험·결과 일정">
          <Field label="시험일 안내" htmlFor="exam-date-text"><input id="exam-date-text" required minLength={2} maxLength={300} disabled={readOnly} value={draft.examDate} onChange={(event) => setDraft({ ...draft, examDate: event.target.value })} className={INPUT} /></Field>
          <Field label="확정 시험일 (선택)" htmlFor="exam-on"><input id="exam-on" type="date" disabled={readOnly} value={draft.examOn} onChange={(event) => setDraft({ ...draft, examOn: event.target.value })} className={INPUT} /></Field>
          <Field label="시험 장소 안내" htmlFor="exam-venue"><textarea id="exam-venue" required minLength={2} maxLength={500} rows={3} disabled={readOnly} value={draft.venueAnnouncement} onChange={(event) => setDraft({ ...draft, venueAnnouncement: event.target.value })} className={`${INPUT} resize-y`} /></Field>
          <Field label="결과 발표 안내" htmlFor="exam-result-text"><input id="exam-result-text" required minLength={2} maxLength={300} disabled={readOnly} value={draft.resultDate} onChange={(event) => setDraft({ ...draft, resultDate: event.target.value })} className={INPUT} /></Field>
          <Field label="확정 결과 발표일 (선택)" htmlFor="exam-result-on"><input id="exam-result-on" type="date" disabled={readOnly} value={draft.resultOn} onChange={(event) => setDraft({ ...draft, resultOn: event.target.value })} className={INPUT} /></Field>
        </Section>
        <Section title="준비·공식 연결">
          <Field label="준비물" htmlFor="exam-required-items"><textarea id="exam-required-items" required maxLength={1000} rows={4} disabled={readOnly} value={draft.requiredItems} onChange={(event) => setDraft({ ...draft, requiredItems: event.target.value })} className={`${INPUT} resize-y`} /></Field>
          <Field label="공식 URL" htmlFor="exam-official-url"><input id="exam-official-url" required type="url" pattern="https://.*" maxLength={500} disabled={readOnly} value={draft.officialUrl} onChange={(event) => setDraft({ ...draft, officialUrl: event.target.value })} className={INPUT} /></Field>
        </Section>
        <button type="submit" disabled={busy || readOnly} className="min-h-12 w-full rounded-xl bg-pul-deep px-5 text-lg font-black text-white disabled:cursor-not-allowed disabled:opacity-50">{busy ? "처리 중…" : item ? "변경 내용 저장" : "숨김 상태로 등록"}</button>
      </form>
    </EditorShell>
  );
}

type JobDraft = {
  key: string; title: string; roleType: RefereeJobRoleType; region: string; schedule: string;
  applicationStartsOn: string; applicationEndsOn: string; roleDescription: string; condition: string;
  payInfo: string; organizerName: string; organizerType: string; status: CourseStatus | "planned";
  officialUrl: string; applicationUrl: string;
};

function jobDraft(item: ManagedCertificationJob | null): JobDraft {
  return item ? {
    key: item.jobKey, title: item.title, roleType: item.roleType, region: item.region, schedule: item.schedule,
    applicationStartsOn: item.applicationStartsOn ?? "", applicationEndsOn: item.applicationEndsOn ?? "",
    roleDescription: item.role, condition: item.condition, payInfo: item.payInfo, organizerName: item.organizerName,
    organizerType: item.organizerType, status: item.status, officialUrl: item.officialUrl ?? "",
    applicationUrl: item.applicationUrl ?? "",
  } : {
    key: "", title: "", roleType: "referee", region: "", schedule: "", applicationStartsOn: "",
    applicationEndsOn: "", roleDescription: "", condition: "", payInfo: "", organizerName: "",
    organizerType: "", status: "planned", officialUrl: "", applicationUrl: "",
  };
}

function JobEditor({ item, onSave, busy, closeHref }: EditorShared & { item: ManagedCertificationJob | null }) {
  const identity = item ? `${item.jobKey}:${item.version}` : "new-job";
  const [state, setState] = useState(() => ({ identity, draft: jobDraft(item) }));
  const draft = state.identity === identity ? state.draft : jobDraft(item);
  const setDraft = (next: JobDraft) => setState({ identity, draft: next });
  const readOnly = item?.publicationStatus === "removed";
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave({
      entity: "job", operation: item ? "update" : "create", key: draft.key.trim(), expectedVersion: item?.version ?? null,
      payload: {
        title: draft.title, roleType: draft.roleType, region: draft.region, schedule: draft.schedule,
        applicationStartsOn: draft.applicationStartsOn || null, applicationEndsOn: draft.applicationEndsOn || null,
        roleDescription: draft.roleDescription, condition: draft.condition, payInfo: draft.payInfo,
        organizerName: draft.organizerName, organizerType: draft.organizerType, status: draft.status,
        officialUrl: draft.officialUrl || null, applicationUrl: draft.applicationUrl || null,
      },
    });
  };
  return (
    <EditorShell title={item ? "구인 정보 수정" : "새 구인 등록"} description={item ? `현재 version ${item.version}을 기준으로 저장합니다. 다른 운영자의 변경을 덮어쓰지 않습니다.` : "새 구인 정보는 숨김 상태로 등록됩니다. 공식 URL 또는 지원 URL을 하나 이상 입력해 주세요."} readOnly={readOnly} closeHref={closeHref}>
      <form onSubmit={submit} className="mt-5 space-y-5">
        <Section title="모집 기본 정보">
          {!item ? <Field label="구인 식별 키" htmlFor="job-key" description="영문·숫자·밑줄·하이픈, 최대 64자"><input id="job-key" required pattern="[A-Za-z0-9][A-Za-z0-9_-]{0,63}" maxLength={64} value={draft.key} onChange={(event) => setDraft({ ...draft, key: event.target.value })} className={INPUT} /></Field> : null}
          <Field label="구인 제목" htmlFor="job-title"><input id="job-title" required minLength={2} maxLength={180} disabled={readOnly} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className={INPUT} /></Field>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="모집 역할" htmlFor="job-role-type"><select id="job-role-type" disabled={readOnly} value={draft.roleType} onChange={(event) => setDraft({ ...draft, roleType: event.target.value as RefereeJobRoleType })} className={INPUT}>{Object.entries(refereeRoleTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="지역" htmlFor="job-region"><input id="job-region" required maxLength={80} disabled={readOnly} value={draft.region} onChange={(event) => setDraft({ ...draft, region: event.target.value })} className={INPUT} /></Field></div>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="모집기관명" htmlFor="job-organizer"><input id="job-organizer" required minLength={2} maxLength={160} disabled={readOnly} value={draft.organizerName} onChange={(event) => setDraft({ ...draft, organizerName: event.target.value })} className={INPUT} /></Field><Field label="모집기관 유형" htmlFor="job-organizer-type"><input id="job-organizer-type" required minLength={2} maxLength={100} disabled={readOnly} value={draft.organizerType} onChange={(event) => setDraft({ ...draft, organizerType: event.target.value })} className={INPUT} /></Field></div>
          <Field label="모집 상태" htmlFor="job-status"><select id="job-status" disabled={readOnly} value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as CourseStatus | "planned" })} className={INPUT}>{Object.entries(courseStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
        </Section>
        <Section title="일정·조건">
          <Field label="일정 안내" htmlFor="job-schedule" description="예: 상시 모집 / 대회 일정에 따라 배정"><textarea id="job-schedule" required minLength={2} maxLength={500} rows={3} disabled={readOnly} value={draft.schedule} onChange={(event) => setDraft({ ...draft, schedule: event.target.value })} className={`${INPUT} resize-y`} /></Field>
          <DateFields prefix="job-application" startLabel="확정 모집 시작일" endLabel="확정 모집 종료일" start={draft.applicationStartsOn} end={draft.applicationEndsOn} disabled={readOnly} onStart={(value) => setDraft({ ...draft, applicationStartsOn: value })} onEnd={(value) => setDraft({ ...draft, applicationEndsOn: value })} />
          <Field label="업무 내용" htmlFor="job-description"><textarea id="job-description" required minLength={2} maxLength={1500} rows={5} disabled={readOnly} value={draft.roleDescription} onChange={(event) => setDraft({ ...draft, roleDescription: event.target.value })} className={`${INPUT} resize-y`} /></Field>
          <Field label="지원 조건" htmlFor="job-condition"><textarea id="job-condition" required minLength={2} maxLength={1500} rows={4} disabled={readOnly} value={draft.condition} onChange={(event) => setDraft({ ...draft, condition: event.target.value })} className={`${INPUT} resize-y`} /></Field>
          <Field label="보수 안내" htmlFor="job-pay"><input id="job-pay" required maxLength={300} disabled={readOnly} value={draft.payInfo} onChange={(event) => setDraft({ ...draft, payInfo: event.target.value })} className={INPUT} /></Field>
        </Section>
        <Section title="공식 연결">
          <p className="text-sm leading-6 text-slate-700">공식 URL 또는 지원 URL을 하나 이상 입력해야 합니다.</p>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="공식 URL (선택)" htmlFor="job-official-url"><input id="job-official-url" type="url" pattern="https://.*" maxLength={500} disabled={readOnly} value={draft.officialUrl} onChange={(event) => setDraft({ ...draft, officialUrl: event.target.value })} className={INPUT} /></Field><Field label="지원 URL (선택)" htmlFor="job-application-url"><input id="job-application-url" type="url" pattern="https://.*" maxLength={500} disabled={readOnly} value={draft.applicationUrl} onChange={(event) => setDraft({ ...draft, applicationUrl: event.target.value })} className={INPUT} /></Field></div>
        </Section>
        <button type="submit" disabled={busy || readOnly} className="min-h-12 w-full rounded-xl bg-pul-deep px-5 text-lg font-black text-white disabled:cursor-not-allowed disabled:opacity-50">{busy ? "처리 중…" : item ? "변경 내용 저장" : "숨김 상태로 등록"}</button>
      </form>
    </EditorShell>
  );
}

function PublicationConfirm({ target, busy, onCancel, onConfirm }: { target: PublicationTarget; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const label = target.operation === "publish" ? "공개" : "숨김";
  useEffect(() => {
    cancelRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])");
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [busy, onCancel]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="presentation">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="certification-publication-title" aria-describedby="certification-publication-description" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <h2 id="certification-publication-title" className="text-xl font-black text-foreground">정보 {label}</h2>
        <p id="certification-publication-description" className="mt-3 text-base leading-7 text-pul-muted">“{target.title}” 항목을 {label} 처리하시겠습니까? 내용은 삭제되지 않습니다.</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button ref={cancelRef} type="button" disabled={busy} onClick={onCancel} className="min-h-12 rounded-xl border border-pul-border font-bold text-pul-deep">취소</button>
          <button type="button" disabled={busy} onClick={onConfirm} className="min-h-12 rounded-xl bg-pul-deep font-bold text-white">{label}</button>
        </div>
      </div>
    </div>
  );
}
