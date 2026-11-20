"use client";

import Link from "next/link";
import { CertificationJobCard, CertificationJobStatusBadge } from "@/components/certification/CertificationJobCard";
import { ACTIVITY_TAB_DISCLAIMER, refereeRoleTypeLabels, regionFilters, statusFilters } from "@/data/certificationData";
import {
  certificationActivityDetailHref, certificationJobFacts, type CertificationActivityFilters, type CertificationJobActivity,
} from "@/lib/certification/certificationJobActivity";
import type { CertificationPage } from "@/lib/certification/certificationDirectory";

const roleFilters = [["", "전체"], ...Object.entries(refereeRoleTypeLabels)];
const jobStatusFilters = [...statusFilters, { value: "planned", label: "모집 예정" }];
const filterInput = "mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-pul-border bg-white px-2 text-sm text-foreground";

type CertificationActivityTabProps = {
  jobPage: CertificationPage<CertificationJobActivity>;
  hasPublicJobs: boolean;
  filters: CertificationActivityFilters;
  returnTo: string;
  error: string | null;
  onFilterChange: (key: "jobKeyword" | "jobRoleType" | "jobRegion" | "jobStatus", value?: string) => void;
  onResetFilters: () => void;
  onPageChange: (page: number) => void;
  onJobRegister: (trigger: HTMLButtonElement) => void;
  talentList: React.ReactNode;
};

export function CertificationActivityTab({
  jobPage, hasPublicJobs, filters, returnTo, error, onFilterChange, onResetFilters, onPageChange, onJobRegister, talentList,
}: CertificationActivityTabProps) {
  const currentPage = Math.floor(jobPage.offset / jobPage.limit) + 1;
  const activeFilters = [
    { key: "jobKeyword", value: filters.keyword },
    { key: "jobRoleType", value: filters.roleType && refereeRoleTypeLabels[filters.roleType] },
    { key: "jobRegion", value: filters.region },
    { key: "jobStatus", value: jobStatusFilters.find(({ value }) => value === filters.status)?.label },
  ] as const;

  return (
    <div className="space-y-4">
      <section aria-labelledby="certification-job-list" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div>
            <h2 id="certification-job-list" className="text-lg font-bold text-pul-deep lg:text-xl">구인 공고</h2>
            <p className="text-sm text-pul-muted">심판·강사·진행·기록요원 모집 정보</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-3">
            <a href="#certification-talent" className="inline-flex min-h-11 items-center text-xs font-bold text-pul-point underline">공개 구직 프로필</a>
            <button type="button" onClick={(event) => onJobRegister(event.currentTarget)} className="min-h-11 rounded-lg border border-pul-border bg-white px-3 text-xs font-bold text-pul-point">구인 공고 등록 문의</button>
          </div>
        </div>
        <form role="search" aria-label="구인 공고 검색 및 필터" className="grid grid-cols-3 items-end gap-2 rounded-xl border border-pul-border bg-white p-3 lg:grid-cols-[2fr_1fr_1fr_1fr] lg:gap-3" onSubmit={(event) => {
          event.preventDefault();
          const keyword = String(new FormData(event.currentTarget).get("jobKeyword") ?? "").trim();
          onFilterChange("jobKeyword", keyword || undefined);
        }}>
          <div className="col-span-3 min-w-0 lg:col-span-1">
            <label htmlFor="certification-job-keyword" className="text-xs font-semibold text-pul-muted">공고 검색</label>
            <div className="flex gap-2">
              <input key={filters.keyword ?? ""} id="certification-job-keyword" type="search" name="jobKeyword" defaultValue={filters.keyword ?? ""} maxLength={100} placeholder="공고명·구장·필요 자격" className={filterInput} />
              <button className="mt-1 min-h-11 shrink-0 rounded-lg bg-pul-point px-3 text-sm font-bold text-white" type="submit">검색</button>
            </div>
          </div>
          <div className="min-w-0">
            <label htmlFor="certification-job-role" className="text-xs font-semibold text-pul-muted">모집 역할</label>
            <select id="certification-job-role" value={filters.roleType ?? ""} onChange={(event) => onFilterChange("jobRoleType", event.target.value || undefined)} className={filterInput}>
              {roleFilters.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div className="min-w-0">
            <label htmlFor="certification-job-region" className="text-xs font-semibold text-pul-muted">지역</label>
            <select id="certification-job-region" value={filters.region ?? "전체"} onChange={(event) => onFilterChange("jobRegion", event.target.value === "전체" ? undefined : event.target.value)} className={filterInput}>
              {filters.region && !regionFilters.some(region => region === filters.region) && <option>{filters.region}</option>}
              {regionFilters.map((region) => <option key={region}>{region}</option>)}
            </select>
          </div>
          <div className="min-w-0">
            <label htmlFor="certification-job-status" className="text-xs font-semibold text-pul-muted">모집 상태</label>
            <select id="certification-job-status" value={filters.status ?? "all"} onChange={(event) => onFilterChange("jobStatus", event.target.value === "all" ? undefined : event.target.value)} className={filterInput}>
              {jobStatusFilters.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
        </form>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {!error && <p role="status" className="font-bold text-pul-deep">공고 {jobPage.total}건</p>}
          {activeFilters.map(({ key, value }) => value ? <button type="button" key={key} aria-label={value + " 필터 해제"} onClick={() => onFilterChange(key)} className="min-h-9 max-w-full break-words rounded-full border border-pul-border bg-pul-light px-3 text-xs font-semibold text-pul-deep">{value} <span aria-hidden="true">×</span></button> : null)}
        </div>

        {error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>
          : jobPage.items.length === 0 ? <div className="rounded-xl border border-dashed border-pul-border bg-white p-6 text-center text-sm text-pul-muted">
            <p>{hasPublicJobs ? "검색 결과가 없습니다. 검색어나 필터를 바꿔 보세요." : "현재 등록된 심판·강사 모집 공고가 없습니다."}</p>
            {hasPublicJobs && <button type="button" onClick={onResetFilters} className="mt-2 min-h-11 rounded-lg border border-pul-border px-3 font-bold text-pul-deep">검색·필터 초기화</button>}
          </div> : <>
            <ul className="grid gap-2 lg:hidden">
              {jobPage.items.map(job => <li key={job.key}><CertificationJobCard job={job} returnTo={returnTo} /></li>)}
            </ul>
            <div className="hidden overflow-hidden rounded-xl border border-pul-border bg-white lg:block">
              <table className="w-full table-fixed text-left text-sm">
                <caption className="sr-only">구인 공고 비교</caption>
                <thead className="bg-pul-light text-pul-deep"><tr>
                  {["공고명", "모집 역할", "활동일", "구장", "필요 자격", "모집 상태"].map((label, index) => <th key={label} scope="col" className={"px-3 py-3 " + ["w-[25%]", "w-[12%]", "w-[13%]", "w-[20%]", "w-[18%]", "w-[12%]"][index]}>{label}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-pul-border">
                  {jobPage.items.map(job => <tr className="hover:bg-pul-light/40" key={job.key}>
                    <td className="break-words px-3 py-2">
                      <Link prefetch={false} href={certificationActivityDetailHref("job", job.key, returnTo)} className="flex min-h-11 flex-col justify-center font-bold text-pul-deep hover:underline">
                        {job.title}
                        <span className="text-xs font-normal text-pul-muted">{job.organizer}</span>
                      </Link>
                    </td>
                    <td className="break-words px-3 py-2">{refereeRoleTypeLabels[job.role]}</td>
                    {certificationJobFacts(job).map(([label, value]) => <td key={label} className="break-words px-3 py-2">{value}{label === "구장" && <span className="block text-xs text-pul-muted">{job.region}</span>}</td>)}
                    <td className="px-3 py-2"><CertificationJobStatusBadge status={job.status} /></td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          </>}

        {jobPage.total > jobPage.limit && <nav aria-label="구인 공고 페이지" className="mt-4 flex items-center justify-center gap-3">
          <button type="button" disabled={currentPage === 1} onClick={() => onPageChange(currentPage - 1)} className="min-h-11 rounded-lg border border-pul-border px-4 text-sm font-bold text-pul-deep disabled:opacity-40">이전</button>
          <span aria-current="page" className="text-sm text-pul-muted">{currentPage}페이지</span>
          <button type="button" disabled={!jobPage.hasMore} onClick={() => onPageChange(currentPage + 1)} className="min-h-11 rounded-lg border border-pul-border px-4 text-sm font-bold text-pul-deep disabled:opacity-40">다음</button>
        </nav>}
      </section>
      {talentList}
      <aside className="rounded-lg border border-pul-border bg-[#fafbfa] px-3 py-2.5"><p className="text-xs leading-relaxed text-pul-muted">{ACTIVITY_TAB_DISCLAIMER}</p></aside>
    </div>
  );
}
