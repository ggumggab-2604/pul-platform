"use client";

import { CertificationDisclaimer } from "@/components/certification/CertificationDisclaimer";
import { CertificationExamScheduleSection } from "@/components/certification/CertificationExamScheduleSection";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import {
  qualificationChecklist,
  qualificationGuides,
  qualificationTypeGroupLabels,
  qualificationTypes,
  type QualificationGuide,
} from "@/data/certificationData";
import type {
  CertificationExamFilters,
  CertificationPage,
  PublicExamSchedule,
} from "@/lib/certification/certificationDirectory";

type CertificationGuideTabProps = {
  onGuideSelect: (guide: QualificationGuide) => void;
  examPage: CertificationPage<PublicExamSchedule>;
  filters: CertificationExamFilters;
  error: string | null;
  onFilterChange: (key: "examType" | "examStatus", value?: string) => void;
  onPageChange: (page: number) => void;
};

export function CertificationGuideTab({
  onGuideSelect,
  examPage,
  filters,
  error,
  onFilterChange,
  onPageChange,
}: CertificationGuideTabProps) {
  return (
    <div className="space-y-3 lg:space-y-5">
      <CertificationExamScheduleSection
        examPage={examPage}
        filters={filters}
        error={error}
        onFilterChange={onFilterChange}
        onPageChange={onPageChange}
      />

      <section>
        <h2 className="text-base font-bold text-foreground lg:text-xl">
          자격 종류 한눈에 보기
        </h2>
        <p className="mt-1 text-xs text-pul-muted lg:text-sm">
          국가 체육지도자, 협회·종목단체, 민간·대학·사설 교육 계열로 구분해 확인하세요.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
          {qualificationTypes.map((type) => (
            <article
              key={type.id}
              id={type.id}
              className="flex h-full flex-col rounded-xl border border-pul-border bg-white p-3 shadow-[0_2px_10px_rgba(6,78,59,0.05)] lg:p-4"
            >
              <span className="w-fit rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                {qualificationTypeGroupLabels[type.group]}
              </span>
              <h3 className="mt-2 text-sm font-bold text-foreground lg:text-base">
                {type.title}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-pul-muted">
                {type.description}
              </p>
              <ul className="mt-2 space-y-1">
                {type.examples.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-1.5 text-[11px] text-foreground lg:text-xs"
                  >
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-pul-point" />
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-base font-bold text-foreground lg:text-xl">
          나는 어떤 과정을 알아봐야 할까요?
        </h2>
        <p className="mt-1 text-xs text-pul-muted lg:text-sm">
          목적에 맞는 자격·과정 방향을 선택해 보세요.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {qualificationGuides.map((guide) => (
            <button
              key={guide.id}
              type="button"
              onClick={() => onGuideSelect(guide)}
              className="flex h-full flex-col rounded-xl border border-pul-border bg-white p-3 text-left shadow-[0_2px_10px_rgba(6,78,59,0.05)] transition-colors hover:border-pul-point/40 hover:bg-pul-light/30"
            >
              {/* TODO: 탭 전환 + 섹션 앵커 스크롤 연동 */}
              <p className="text-[10px] font-semibold text-pul-point">{guide.target}</p>
              <h3 className="mt-1 text-sm font-bold leading-snug text-foreground">
                {guide.title}
              </h3>
              <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-pul-muted">
                {guide.description}
              </p>
              <span className="mt-auto pt-2 text-[11px] font-bold text-pul-deep">
                {guide.ctaText} →
              </span>
            </button>
          ))}
        </div>
      </section>

      <div className="lg:hidden">
        <CollapsibleSection
          title="자격증 선택 전 꼭 확인하세요"
          summary="주관기관·인정 범위·비용·갱신 여부를 확인하세요."
        >
          <ul className="space-y-1.5">
            {qualificationChecklist.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2 text-sm leading-relaxed text-foreground"
              >
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-600" />
                {item}
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      </div>
      <section
        id="cert-checklist"
        className="hidden rounded-xl border border-amber-200/50 bg-amber-50/40 p-3 lg:block lg:p-4"
      >
        <h2 className="text-base font-bold text-foreground lg:text-lg">
          자격증 선택 전 꼭 확인하세요
        </h2>
        <ul className="mt-2 space-y-1.5">
          {qualificationChecklist.map((item) => (
            <li
              key={item}
              className="flex items-start gap-2 text-xs leading-relaxed text-foreground lg:text-sm"
            >
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-600" />
              {item}
            </li>
          ))}
        </ul>
      </section>

      <CertificationDisclaimer />
    </div>
  );
}
