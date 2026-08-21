"use client";

import { CertificationJobCard } from "@/components/certification/CertificationJobCard";
import {
  ACTIVITY_TAB_DISCLAIMER,
  refereeRoleTypeLabels,
  regionFilters,
  statusFilters,
  type RefereeJobRoleType,
} from "@/data/certificationData";
import type {
  CertificationJobFilters,
  CertificationPage,
  PublicCertificationJob,
} from "@/lib/certification/certificationDirectory";

const roleFilters: { value: RefereeJobRoleType | "all"; label: string }[] = [
  { value: "all", label: "전체" },
  ...Object.entries(refereeRoleTypeLabels).map(([value, label]) => ({
    value: value as RefereeJobRoleType,
    label,
  })),
];

const jobStatusFilters = [
  ...statusFilters,
  { value: "planned" as const, label: "모집 예정" },
];

type CertificationActivityTabProps = {
  jobPage: CertificationPage<PublicCertificationJob>;
  filters: CertificationJobFilters;
  error: string | null;
  onFilterChange: (key: "jobRoleType" | "jobRegion" | "jobStatus", value?: string) => void;
  onPageChange: (page: number) => void;
  onJobInquiry: (job: PublicCertificationJob) => void;
  onJobRegister: (trigger: HTMLButtonElement) => void;
};

export function CertificationActivityTab({
  jobPage,
  filters,
  error,
  onFilterChange,
  onPageChange,
  onJobInquiry,
  onJobRegister,
}: CertificationActivityTabProps) {
  const currentPage = Math.floor(jobPage.offset / jobPage.limit) + 1;

  return (
    <div className="space-y-3 lg:space-y-4">
      <section className="rounded-xl border border-pul-border bg-white p-3 lg:p-4">
        <h2 className="text-lg font-bold text-foreground lg:text-xl">심판·강사 구인정보</h2>
        <p className="mt-1 text-sm leading-relaxed text-pul-muted">
          운영자가 출처와 공식 링크를 확인해 공개한 모집 정보입니다. 지원·계약·대금 지급은 PUL 밖의 모집 주체와 직접 확인하세요.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="text-xs font-semibold text-pul-muted">
            모집 역할
            <select value={filters.roleType ?? "all"} onChange={(event) => onFilterChange("jobRoleType", event.target.value === "all" ? undefined : event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-pul-border px-3 text-sm text-foreground">
              {roleFilters.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-pul-muted">
            지역
            <select value={filters.region ?? "전체"} onChange={(event) => onFilterChange("jobRegion", event.target.value === "전체" ? undefined : event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-pul-border px-3 text-sm text-foreground">
              {regionFilters.map((region) => <option key={region} value={region}>{region}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-pul-muted">
            모집 상태
            <select value={filters.status ?? "all"} onChange={(event) => onFilterChange("jobStatus", event.target.value === "all" ? undefined : event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-pul-border px-3 text-sm text-foreground">
              {jobStatusFilters.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
        </div>
      </section>

      {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}

      <section aria-labelledby="certification-job-list">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 id="certification-job-list" className="text-lg font-bold text-foreground">구인 공고</h3>
            <p className="mt-1 text-sm text-pul-muted">공개 중인 공고 {jobPage.total}건</p>
          </div>
          <button type="button" onClick={(event) => onJobRegister(event.currentTarget)} className="inline-flex min-h-10 items-center rounded-lg bg-pul-point px-3 text-xs font-bold text-white hover:bg-pul-deep">구인 공고 등록 문의</button>
        </div>

        {jobPage.items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-pul-border px-6 py-12 text-center text-sm text-pul-muted">현재 등록된 심판·강사 모집 공고가 없습니다.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {jobPage.items.map((job) => <CertificationJobCard key={job.jobKey} job={job} onInquiry={onJobInquiry} />)}
          </div>
        )}

        {jobPage.total > jobPage.limit ? (
          <nav aria-label="구인 공고 페이지" className="mt-4 flex items-center justify-center gap-3">
            <button type="button" disabled={currentPage === 1} onClick={() => onPageChange(currentPage - 1)} className="min-h-10 rounded-lg border border-pul-border px-4 text-sm font-bold text-pul-deep disabled:opacity-40">이전</button>
            <span className="text-sm text-pul-muted">{currentPage}페이지</span>
            <button type="button" disabled={!jobPage.hasMore} onClick={() => onPageChange(currentPage + 1)} className="min-h-10 rounded-lg border border-pul-border px-4 text-sm font-bold text-pul-deep disabled:opacity-40">다음</button>
          </nav>
        ) : null}
      </section>

      <section className="rounded-xl border border-dashed border-pul-border bg-[#fafbfa] p-4">
        <h3 className="text-base font-bold text-foreground">구직 프로필 기능은 준비 중입니다</h3>
        <p className="mt-1 text-sm leading-relaxed text-pul-muted">
          PUL은 현재 회원의 자격을 인증하거나 활동점수를 운영하지 않습니다. 구직 프로필·추천·유료 노출 기능도 제공하지 않습니다.
        </p>
      </section>

      <aside className="rounded-lg border border-pul-border bg-[#fafbfa] px-3 py-2.5">
        <p className="text-xs leading-relaxed text-pul-muted">{ACTIVITY_TAB_DISCLAIMER}</p>
      </aside>
    </div>
  );
}
