"use client";

import { CertificationDisclaimer } from "@/components/certification/CertificationDisclaimer";
import { CertificationExamScheduleSection } from "@/components/certification/CertificationExamScheduleSection";
import { certificationSources as sources, refereeGrades } from "@/data/certificationSources";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import {
  qualificationChecklist,
  qualificationGuides,
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

const officialGuides = [
  { id: "type-national", title: "국가 체육지도자", description: "국민체육진흥공단 체육지도자 자격검정·연수", links: [
    [sources.national, "2급 생활스포츠지도사"], [sources.schedule, "연간 일정"], [sources.notices, "회차별 시행 공고"],
  ] },
  { id: "type-association", title: "대한파크골프협회심판", description: "등록민간자격 2019-000364 · 사단법인 대한파크골프협회", links: [
    [sources.refereeRegistry, "민간자격 등록정보"], [sources.association, "협회 자격 안내"], [sources.refereeNotice, "2026년 3급 검정 공고"],
  ] },
  { id: "type-private", title: "기타 민간기관 자격", description: "자격명과 발급기관을 함께 확인하세요.", links: [
    [sources.privateRegistry, "민간자격정보서비스 검색"],
  ] },
];

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
      <section>
        <h2 className="text-base font-bold text-foreground lg:text-xl">
          자격 종류 한눈에 보기
        </h2>
        <p className="mt-1 text-xs text-pul-muted lg:text-sm">
          기관별 자격 안내와 검정 공고를 확인하세요.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
          {officialGuides.map((guide) => (
            <article key={guide.id} id={guide.id} className="rounded-xl border border-pul-border bg-white p-4">
              <h3 className="font-bold text-foreground">{guide.title}</h3>
              <p className="mt-1 text-sm text-pul-muted">{guide.description}</p>
              <ul className="mt-2 flex flex-wrap gap-x-3">
                {guide.links.map(([href, label]) => (
                  <li key={href}><a className="inline-flex min-h-11 items-center font-semibold text-pul-point underline" href={href}>{label}</a></li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="referee-grades" className="space-y-3 rounded-xl border border-pul-border bg-white p-4">
        <h2 id="referee-grades" className="text-lg font-bold text-pul-deep">대한파크골프협회심판 등급 비교</h2>
        <p className="text-sm text-pul-muted">협회 규정의 공통 조건은 해당 연도 회원 자격과 1년 이상의 회원등록 이력입니다. 3급의 2026년 회차 공고를 확인했습니다.</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {refereeGrades.map(({ grade, eligibility, assessment, duties, notice }) => (
            <article key={grade} className="rounded-lg border border-pul-border p-3">
              <h3 className="font-bold text-pul-deep">{grade}</h3>
              <dl className="mt-2 space-y-2 text-sm leading-6">
                <div><dt className="font-bold">응시</dt><dd>{eligibility}</dd></div>
                <div><dt className="font-bold">검정</dt><dd>{assessment}</dd></div>
                <div><dt className="font-bold">활동 범위</dt><dd>{duties}</dd></div>
              </dl>
              {notice && <a className="inline-flex min-h-11 items-center text-sm font-semibold text-pul-point underline" href={notice}>2026년 3급 검정 공고</a>}
            </article>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 text-sm font-semibold text-pul-point underline">
          <a className="inline-flex min-h-11 items-center" href={sources.refereeRegulations}>협회 규정 제3·6조</a>
          <a className="inline-flex min-h-11 items-center" href={sources.refereeRegistry}>등급별 직무 등록정보</a>
        </div>
      </section>

      <CertificationExamScheduleSection
        examPage={examPage}
        filters={filters}
        error={error}
        onFilterChange={onFilterChange}
        onPageChange={onPageChange}
      />

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
