"use client";

import { Card } from "@/components/ui/Card";
import type { CourseDetailPageData } from "@/data/courseDetailPageData";

type CourseNoticeListProps = {
  detail: CourseDetailPageData;
  onShowAll: () => void;
};

export function CourseNoticeList({ detail, onShowAll }: CourseNoticeListProps) {
  const notices = detail.notices.slice(0, 3);

  return (
    <Card title="공지 및 이용 유의사항" dense>
      <ul className="space-y-3">
        {notices.map((notice) => (
          <li
            key={notice.id}
            className="rounded-lg border border-pul-border/80 px-3 py-3 lg:px-4 lg:py-3.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-bold text-foreground">{notice.title}</h3>
              <time className="text-xs font-medium text-pul-muted">{notice.date}</time>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-pul-muted lg:text-base">
              {notice.summary}
            </p>
          </li>
        ))}
      </ul>

      {detail.usageRules.length > 0 ? (
        <div className="mt-4 rounded-lg bg-pul-light/60 px-3 py-3">
          <h3 className="text-sm font-bold text-pul-deep lg:text-base">이용 규정·안전수칙</h3>
          <ul className="mt-2 space-y-1">
            {detail.usageRules.map((rule) => (
              <li key={rule} className="text-sm text-pul-muted lg:text-base">
                {rule}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <button
        type="button"
        onClick={onShowAll}
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-pul-border bg-white text-sm font-bold text-pul-deep hover:bg-pul-light lg:text-base"
      >
        전체 공지 보기
      </button>
    </Card>
  );
}
