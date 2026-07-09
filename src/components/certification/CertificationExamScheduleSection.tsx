"use client";

import {
  EXAM_SCHEDULE_CAUTION,
  EXAM_SCHEDULE_GUIDE_INTRO,
  examScheduleStatusLabels,
  examScheduleStatusStyles,
  examSchedules,
  type ExamSchedule,
} from "@/data/certificationData";
import { cn } from "@/lib/utils";

function ScheduleStatusBadge({ status }: { status: ExamSchedule["status"] }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-bold",
        examScheduleStatusStyles[status],
      )}
    >
      {examScheduleStatusLabels[status]}
    </span>
  );
}

export function CertificationExamScheduleSection() {
  return (
    <section className="rounded-xl border border-pul-border bg-white p-2.5 lg:p-4">
      <h2 className="text-base font-bold text-foreground lg:text-xl">
        주요 시험 접수·일정 안내
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-pul-muted lg:text-sm">
        {EXAM_SCHEDULE_GUIDE_INTRO}
      </p>
      <p className="mt-1 text-[11px] text-amber-800 lg:text-xs">{EXAM_SCHEDULE_CAUTION}</p>

      <div className="mt-3 hidden overflow-x-auto rounded-lg border border-pul-border lg:block">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="bg-[#fafbfa] text-xs text-pul-muted">
            <tr>
              <th className="px-3 py-2 font-semibold">시험명</th>
              <th className="px-3 py-2 font-semibold">접수 기관</th>
              <th className="px-3 py-2 font-semibold">접수 기간</th>
              <th className="px-3 py-2 font-semibold">시험일</th>
              <th className="px-3 py-2 font-semibold">시험장 발표</th>
              <th className="px-3 py-2 font-semibold">준비물</th>
              <th className="px-3 py-2 font-semibold">상태</th>
              <th className="px-3 py-2 font-semibold">공식 링크</th>
            </tr>
          </thead>
          <tbody>
            {examSchedules.map((schedule) => (
              <tr key={schedule.id} className="border-t border-pul-border/80">
                <td className="px-3 py-2 font-medium text-foreground">{schedule.examName}</td>
                <td className="px-3 py-2 text-pul-muted">{schedule.organization}</td>
                <td className="px-3 py-2 text-pul-muted">{schedule.applicationPeriod}</td>
                <td className="px-3 py-2 text-pul-muted">{schedule.examDate}</td>
                <td className="px-3 py-2 text-pul-muted">{schedule.venueAnnouncement}</td>
                <td className="px-3 py-2 text-pul-muted">{schedule.requiredItems}</td>
                <td className="px-3 py-2">
                  <ScheduleStatusBadge status={schedule.status} />
                </td>
                <td className="px-3 py-2">
                  <a
                    href={schedule.officialUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-8 items-center justify-center rounded-lg border border-pul-point/30 bg-pul-light/50 px-2.5 text-xs font-bold text-pul-deep hover:bg-pul-light"
                  >
                    공식 링크
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 divide-y divide-pul-border/70 rounded-lg border border-pul-border lg:hidden">
        {examSchedules.map((schedule) => (
          <article key={schedule.id} className="px-3 py-2.5">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-bold leading-snug text-foreground">
                {schedule.examName}
              </h3>
              <ScheduleStatusBadge status={schedule.status} />
            </div>
            <p className="mt-1 text-[11px] text-pul-muted">
              접수 {schedule.applicationPeriod} · 시험 {schedule.examDate}
            </p>
            <p className="text-[11px] text-pul-muted">
              시험장 {schedule.venueAnnouncement} · {schedule.requiredItems}
            </p>
            <a
              href={schedule.officialUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex text-xs font-bold text-pul-point hover:text-pul-deep"
            >
              공식 링크
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}
