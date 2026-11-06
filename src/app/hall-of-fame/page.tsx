import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  hallButton, hallPanel, HallSpecialSummary, HallTitle, NationalScoreTable, NationalSpecialList, TournamentAwardList,
} from "@/components/hall-of-fame/NationalHall";
import { Container } from "@/components/ui/Container";
import { specialTypes, type SpecialType } from "@/lib/hall-of-fame/hallSpecialRecords";
import {
  hallHref, loadNationalScores, loadNationalSpecial, loadTournamentAwards, scorePeriods, specialPeriods,
  type ScorePeriod, type SpecialPeriod,
} from "@/lib/hall-of-fame/nationalHall";
import { getKstHomeReferenceDate } from "@/lib/home/homeAggregation";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "명예의 전당", description: "전국 파크골프 순위와 공식 대회 수상, 특별 기록을 확인하세요." };

type HallQuery = { tab?: string; period?: string; type?: string; year?: string; month?: string; event?: string; page?: string };
const tabs = { ranking: "전국 순위", awards: "대회 수상", special: "특별 기록" } as const;
const pageSize = 20;

function selected(value: string | undefined, choices: Record<string, string>) {
  return typeof value === "string" && Object.hasOwn(choices, value);
}

function filterClass(active: boolean) {
  return `${hallButton} ${active ? "border-pul-point bg-pul-light" : ""}`;
}

function PageLinks({ query, page, total }: { query: HallQuery; page: number; total: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages === 1 && page === 1) return null;
  return (
    <nav className="mt-4 flex flex-wrap items-center gap-2" aria-label="목록 페이지">
      {page > 1 && <Link className={hallButton} href={hallHref({ ...query, page: page - 1 })}>이전</Link>}
      <span className="text-sm text-pul-muted">{page} / {pages}페이지</span>
      {page < pages && <Link className={hallButton} href={hallHref({ ...query, page: page + 1 })}>다음</Link>}
    </nav>
  );
}

export default async function HallOfFamePage({ searchParams }: { searchParams: Promise<HallQuery> }) {
  const query = await searchParams;
  if (query.tab === "applications") redirect("/hall-of-fame/mine?tab=applications#my-hall-of-fame");
  const tab = selected(query.tab, tabs) ? query.tab as keyof typeof tabs : "ranking";
  const scorePeriod = selected(query.period, scorePeriods) ? query.period as ScorePeriod : "month";
  const specialPeriod = selected(query.period, specialPeriods) ? query.period as SpecialPeriod : "all";
  const type = selected(query.type, specialTypes) ? query.type as SpecialType : null;
  const requestedPage = Number(query.page);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 && (requestedPage - 1) * pageSize <= 2147483647 ? requestedPage : 1;
  const offset = (page - 1) * pageSize;
  const [currentYear, currentMonth] = getKstHomeReferenceDate().split("-").map(Number);
  const requestedYear = Number(query.year);
  const year = Number.isInteger(requestedYear) && requestedYear >= 1900 && requestedYear <= currentYear ? requestedYear : currentYear;
  const requestedMonth = Number(query.month);
  const month = query.month === "all" ? null : Number.isInteger(requestedMonth) && requestedMonth >= 1 && requestedMonth <= 12 ? requestedMonth : currentMonth;
  const event = typeof query.event === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(query.event) ? query.event : undefined;
  const client = await createClient();
  const [special, ranking, awards] = await Promise.all([
    loadNationalSpecial(client, type, specialPeriod, tab === "special" ? pageSize : 1, tab === "special" ? offset : 0).catch(() => undefined),
    tab === "ranking" ? loadNationalScores(client, scorePeriod, pageSize, offset).catch(() => undefined) : undefined,
    tab === "awards" ? loadTournamentAwards(client, year, month, event).catch(() => undefined) : undefined,
  ]);

  return (
    <main><Container className="space-y-4 py-5 sm:py-6">
      <HallTitle />
      <HallSpecialSummary data={special} />
      <nav aria-label="명예의 전당 메뉴" className="flex flex-wrap gap-2">
        {Object.entries(tabs).map(([value, label]) => (
          <Link key={value} className={filterClass(tab === value)} aria-current={tab === value ? "page" : undefined}
            href={value === "ranking" ? hallHref() : hallHref({ tab: value })}>{label}</Link>
        ))}
      </nav>
      {tab === "ranking" && (
        <section className={hallPanel}>
          <h2 className="text-xl font-bold text-pul-deep">전국 순위</h2>
          <nav aria-label="전국 순위 기간" className="my-3 flex flex-wrap gap-2">
            {Object.entries(scorePeriods).map(([value, label]) => (
              <Link key={value} className={filterClass(scorePeriod === value)} aria-current={scorePeriod === value ? "page" : undefined} href={hallHref({ period: value })}>{label}</Link>
            ))}
          </nav>
          <p className="mb-3 text-sm text-pul-muted">필드 18홀 유효 성적{scorePeriod === "year" ? " · 기록 구장은 최근 유효 경기 기준" : " · 화살표는 이전 평균 대비 타수 변화"}</p>
          {ranking ? <>
            <NationalScoreTable rows={ranking.items} average={scorePeriod === "year"} />
            <PageLinks query={{ period: scorePeriod }} page={page} total={ranking.total} />
          </> : <p role="alert" className="text-sm text-rose-700">전국 순위를 불러오지 못했습니다.</p>}
        </section>
      )}
      {tab === "awards" && (event ? (
        <section className={hallPanel}>
          <h2 className="text-xl font-bold text-pul-deep">이 대회 공식 수상 결과</h2>
          {awards ? <TournamentAwardList items={awards.items} /> : <p role="alert">대회 수상 결과를 불러오지 못했습니다.</p>}
          <Link className={`${hallButton} mt-3`} href={hallHref({ tab: "awards" })}>전체 대회 수상</Link>
        </section>
      ) : (
        <section className={hallPanel}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-bold text-pul-deep">최근 필드·스크린 대회 수상</h2>
            <Link className={hallButton} href="/hall-of-fame/awards">사진 수상 소식</Link>
          </div>
          {awards ? <TournamentAwardList items={awards.latest} /> : <p role="alert" className="mt-3 text-sm text-rose-700">대회 수상 결과를 불러오지 못했습니다.</p>}
          <h2 className="mt-6 text-xl font-bold text-pul-deep">기간별 대회 수상</h2>
          <form action="/hall-of-fame" className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="tab" value="awards" />
            <label className="text-sm">연도<input type="number" name="year" defaultValue={year} min={1900} max={currentYear} required className={`${hallButton} ml-2 w-28`} /></label>
            <label className="text-sm">월<select name="month" defaultValue={month ?? "all"} className={`${hallButton} ml-2`}>
              <option value="all">연도 전체</option>
              {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}월</option>)}
            </select></label>
            <button className={hallButton}>조회</button>
          </form>
          {awards && <TournamentAwardList items={awards.items} />}
        </section>
      ))}
      {tab === "special" && (
        <section className={hallPanel}>
          <h2 className="text-xl font-bold text-pul-deep">특별 기록</h2>
          <nav className="my-3 flex flex-wrap gap-2" aria-label="특별 기록 종류">
            <Link className={filterClass(type === null)} aria-current={type === null ? "page" : undefined} href={hallHref({ tab, period: specialPeriod })}>전체</Link>
            {Object.entries(specialTypes).map(([value, label]) => <Link key={value} className={filterClass(type === value)} aria-current={type === value ? "page" : undefined} href={hallHref({ tab, type: value, period: specialPeriod })}>{label}</Link>)}
          </nav>
          <nav className="mb-3 flex flex-wrap gap-2" aria-label="특별 기록 기간">
            {Object.entries(specialPeriods).map(([value, label]) => <Link key={value} className={filterClass(specialPeriod === value)} aria-current={specialPeriod === value ? "page" : undefined} href={hallHref({ tab, type, period: value })}>{label}</Link>)}
          </nav>
          {special && <>
            <NationalSpecialList data={special} />
            <PageLinks query={{ tab, type: type ?? undefined, period: specialPeriod }} page={page} total={special.total} />
          </>}
          <Link className="mt-4 inline-flex min-h-11 items-center text-sm text-pul-point underline" href="/hall-of-fame/special/directory">지역·동호회·구장별 인증 기록 보기</Link>
        </section>
      )}
    </Container></main>
  );
}
