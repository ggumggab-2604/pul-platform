"use client";

import { RefereeSourceButton, refereeSecondaryButton } from "@/components/certification/RefereeGuideButton";
import { examScheduleStatusLabels, examScheduleStatusStyles } from "@/data/certificationData";
import { certificationSources as sources } from "@/data/certificationSources";
import { formatCertificationPublicDateOnly } from "@/lib/certification/certificationDateDisplay";
import type { CertificationPage, PublicExamSchedule } from "@/lib/certification/certificationDirectory";
import { refereeScheduleStatus } from "@/lib/certification/refereeGuide";
import { cn } from "@/lib/utils";

export function CertificationExamScheduleSection({ examPage, error, today, onPageChange }: {
  examPage: CertificationPage<PublicExamSchedule>;
  error: string | null;
  today: string;
  onPageChange: (page: number) => void;
}) {
  const currentPage = Math.floor(examPage.offset / examPage.limit) + 1;

  return (
    <section aria-labelledby="certification-exam-heading" className="rounded-xl border border-pul-border bg-white p-4 shadow-sm sm:p-5 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="certification-exam-heading" className="text-xl font-extrabold text-pul-deep sm:text-2xl">검정 일정과 접수</h2>
          {error ? <p role="alert" className="mt-2 text-sm font-semibold text-red-800">{error}</p> : examPage.total === 0 && (
            <p className="mt-2 text-sm text-pul-muted sm:text-base">PUL에 등록된 심판 검정 일정이 없습니다.</p>
          )}
        </div>
        <RefereeSourceButton href={sources.associationNotices}>협회 최신 공고 확인</RefereeSourceButton>
      </div>

      {examPage.items.length > 0 && (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {examPage.items.map((schedule) => {
            const status = refereeScheduleStatus(schedule, today);
            const stage = status === "지난 검정" || status === "접수 상태 공고 확인" ? "application_closed" : status ?? schedule.status;
            const label = status === "지난 검정" || status === "접수 상태 공고 확인" ? status : examScheduleStatusLabels[stage];
            const starts = formatCertificationPublicDateOnly(schedule.applicationStartsOn);
            const ends = formatCertificationPublicDateOnly(schedule.applicationEndsOn);
            const confirmedPeriod = starts && ends ? `${starts} ~ ${ends}` : null;
            const exam = formatCertificationPublicDateOnly(schedule.examOn);
            const result = formatCertificationPublicDateOnly(schedule.resultOn);
            return (
              <article key={schedule.scheduleKey} className="min-w-0 space-y-2 rounded-lg border border-pul-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold text-foreground">{schedule.examName}</h3>
                  <span className={cn("rounded-full border px-2 py-0.5 text-xs font-bold", examScheduleStatusStyles[stage])}>
                    {label}
                  </span>
                </div>
                <p className="text-sm text-pul-muted">{schedule.organization}</p>
                <dl className="space-y-1 text-sm leading-6">
                  <div><dt className="inline-block min-w-16 font-semibold">접수 기간</dt> <dd className="inline">{confirmedPeriod ?? schedule.applicationPeriod}
                    {!confirmedPeriod && starts && <span> (시작 {starts})</span>}
                    {!confirmedPeriod && ends && <span> (마감 {ends})</span>}
                  </dd></div>
                  <div><dt className="inline-block min-w-16 font-semibold">검정일</dt> <dd className="inline">{exam && schedule.examOn !== schedule.examDate && exam !== schedule.examDate ? `${schedule.examDate} · ${exam}` : exam ?? schedule.examDate}</dd></div>
                  <div><dt className="inline-block min-w-16 font-semibold">장소</dt> <dd className="inline">{schedule.venueAnnouncement}</dd></div>
                  {result && <div><dt className="inline-block min-w-16 font-semibold">결과 발표</dt> <dd className="inline">{result}</dd></div>}
                </dl>
                <RefereeSourceButton href={schedule.officialUrl}>회차 공고 보기</RefereeSourceButton>
              </article>
            );
          })}
        </div>
      )}

      {examPage.total > examPage.limit && (
        <nav aria-label="심판 검정 일정 페이지" className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <button type="button" disabled={currentPage === 1} onClick={() => onPageChange(currentPage - 1)}
            className={cn(refereeSecondaryButton, "disabled:opacity-40")}>이전</button>
          <span className="text-sm text-pul-muted">{currentPage}페이지</span>
          <button type="button" disabled={!examPage.hasMore} onClick={() => onPageChange(currentPage + 1)}
            className={cn(refereeSecondaryButton, "disabled:opacity-40")}>다음</button>
        </nav>
      )}
    </section>
  );
}
