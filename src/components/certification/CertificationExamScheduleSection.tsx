"use client";

import {
  EXAM_SCHEDULE_CAUTION,
  EXAM_SCHEDULE_GUIDE_INTRO,
  examScheduleStatusLabels,
  examScheduleStatusStyles,
  examTypeFilters,
  type ExamScheduleStatus,
} from "@/data/certificationData";
import {
  getCertificationDateDisplay,
  getCertificationDateRangeDisplay,
  type CertificationDateDisplay,
} from "@/lib/certification/certificationDateDisplay";
import type {
  CertificationExamFilters,
  CertificationPage,
  PublicExamSchedule,
} from "@/lib/certification/certificationDirectory";
import { cn } from "@/lib/utils";

const examStatusFilters: { value: ExamScheduleStatus | "all"; label: string }[] = [
  { value: "all", label: "전체" },
  ...Object.entries(examScheduleStatusLabels).map(([value, label]) => ({
    value: value as ExamScheduleStatus,
    label,
  })),
];

type CertificationExamScheduleSectionProps = {
  examPage: CertificationPage<PublicExamSchedule>;
  filters: CertificationExamFilters;
  error: string | null;
  onFilterChange: (key: "examType" | "examStatus", value?: string) => void;
  onPageChange: (page: number) => void;
};

function ScheduleStatusBadge({ status }: { status: ExamScheduleStatus }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-bold", examScheduleStatusStyles[status])}>
      {examScheduleStatusLabels[status]}
    </span>
  );
}

function ExamConfirmedDates({ schedule }: { schedule: PublicExamSchedule }) {
  const dates: CertificationDateDisplay[] = [
    getCertificationDateRangeDisplay(
      schedule.applicationStartsOn,
      schedule.applicationEndsOn,
      { range: "접수 기간", start: "접수 시작", end: "접수 종료" },
    ),
    getCertificationDateDisplay(schedule.examOn, "시험일"),
    getCertificationDateDisplay(schedule.resultOn, "결과 발표"),
  ].filter((item): item is CertificationDateDisplay => item !== null);

  if (dates.length === 0) return null;

  return (
    <dl className="mt-1 space-y-0.5 text-[11px] leading-relaxed text-pul-deep">
      {dates.map((date) => (
        <div key={date.label} className="flex flex-wrap gap-x-1.5">
          <dt className="font-semibold">{date.label}</dt>
          <dd>{date.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function CertificationExamScheduleSection({
  examPage,
  filters,
  error,
  onFilterChange,
  onPageChange,
}: CertificationExamScheduleSectionProps) {
  const currentPage = Math.floor(examPage.offset / examPage.limit) + 1;

  return (
    <section className="rounded-xl border border-pul-border bg-white p-3 lg:p-4" aria-labelledby="certification-exam-heading">
      <h2 id="certification-exam-heading" className="text-lg font-bold text-foreground lg:text-xl">주요 시험 접수·일정 안내</h2>
      <p className="mt-1 text-sm leading-relaxed text-pul-muted">{EXAM_SCHEDULE_GUIDE_INTRO}</p>
      <p className="mt-1 text-xs text-amber-800">{EXAM_SCHEDULE_CAUTION}</p>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-pul-muted">
          시험 유형
          <select value={filters.examType ?? "all"} onChange={(event) => onFilterChange("examType", event.target.value === "all" ? undefined : event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-pul-border px-3 text-sm text-foreground">
            {examTypeFilters.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-pul-muted">
          일정 상태
          <select value={filters.status ?? "all"} onChange={(event) => onFilterChange("examStatus", event.target.value === "all" ? undefined : event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-pul-border px-3 text-sm text-foreground">
            {examStatusFilters.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
      </div>

      {error ? <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}

      {examPage.items.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-pul-border px-5 py-10 text-center text-sm text-pul-muted">현재 등록된 공식 시험 일정이 없습니다.</p>
      ) : (
        <>
          <div className="mt-3 hidden overflow-x-auto rounded-lg border border-pul-border lg:block">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="bg-[#fafbfa] text-xs text-pul-muted">
                <tr>
                  <th className="px-3 py-2 font-semibold">시험명</th><th className="px-3 py-2 font-semibold">접수 기관</th><th className="px-3 py-2 font-semibold">접수 기간</th><th className="px-3 py-2 font-semibold">시험일</th><th className="px-3 py-2 font-semibold">시험장 발표</th><th className="px-3 py-2 font-semibold">준비물</th><th className="px-3 py-2 font-semibold">상태</th><th className="px-3 py-2 font-semibold">공식 링크</th>
                </tr>
              </thead>
              <tbody>
                {examPage.items.map((schedule) => (
                  <tr key={schedule.scheduleKey} className="border-t border-pul-border/80">
                    <td className="px-3 py-2 font-medium text-foreground">{schedule.examName}</td><td className="px-3 py-2 text-pul-muted">{schedule.organization}</td><td className="px-3 py-2 text-pul-muted">{schedule.applicationPeriod}</td><td className="px-3 py-2 text-pul-muted"><span>{schedule.examDate}</span><ExamConfirmedDates schedule={schedule} /></td><td className="px-3 py-2 text-pul-muted">{schedule.venueAnnouncement}</td><td className="px-3 py-2 text-pul-muted">{schedule.requiredItems}</td><td className="px-3 py-2"><ScheduleStatusBadge status={schedule.status} /></td>
                    <td className="px-3 py-2"><a href={schedule.officialUrl} target="_blank" rel="noopener noreferrer" aria-label={`${schedule.examName} 공식 링크 새 창 열기`} className="inline-flex min-h-8 items-center rounded-lg border border-pul-point/30 bg-pul-light/50 px-2.5 text-xs font-bold text-pul-deep hover:bg-pul-light">공식 링크</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 divide-y divide-pul-border/70 rounded-lg border border-pul-border lg:hidden">
            {examPage.items.map((schedule) => (
              <article key={schedule.scheduleKey} className="px-3 py-3">
                <div className="flex items-start justify-between gap-2"><h3 className="text-sm font-bold leading-snug text-foreground">{schedule.examName}</h3><ScheduleStatusBadge status={schedule.status} /></div>
                <p className="mt-1 text-xs text-pul-muted">{schedule.organization}</p>
                <p className="mt-1 text-xs text-pul-muted">접수 {schedule.applicationPeriod} · 시험 {schedule.examDate}</p>
                <p className="text-xs text-pul-muted">시험장 {schedule.venueAnnouncement} · {schedule.requiredItems}</p>
                <ExamConfirmedDates schedule={schedule} />
                <a href={schedule.officialUrl} target="_blank" rel="noopener noreferrer" aria-label={`${schedule.examName} 공식 링크 새 창 열기`} className="mt-2 inline-flex min-h-10 items-center text-xs font-bold text-pul-point hover:text-pul-deep">공식 링크 (새 창)</a>
              </article>
            ))}
          </div>
        </>
      )}

      {examPage.total > examPage.limit ? (
        <nav aria-label="시험 일정 페이지" className="mt-4 flex items-center justify-center gap-3">
          <button type="button" disabled={currentPage === 1} onClick={() => onPageChange(currentPage - 1)} className="min-h-10 rounded-lg border border-pul-border px-4 text-sm font-bold text-pul-deep disabled:opacity-40">이전</button>
          <span className="text-sm text-pul-muted">{currentPage}페이지</span>
          <button type="button" disabled={!examPage.hasMore} onClick={() => onPageChange(currentPage + 1)} className="min-h-10 rounded-lg border border-pul-border px-4 text-sm font-bold text-pul-deep disabled:opacity-40">다음</button>
        </nav>
      ) : null}
    </section>
  );
}
