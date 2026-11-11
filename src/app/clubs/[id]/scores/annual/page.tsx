import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { annualClubActivity, awardLabels, type AnnualData, type Award } from "@/lib/clubs/annualClubActivity";
import { annualHref } from "@/lib/clubs/clubParticipation";
import { scorePeriod, type MonthlyWorkspace } from "@/lib/clubs/monthlyScores";
import { MessagingSessionBoundary } from "@/components/messaging/MessagingSessionBoundary";
import { AnnualAwardButton, AnnualPrintButton } from "@/components/clubs/scores/AnnualActivityButtons";

export const dynamic = "force-dynamic";
const cell = "border border-pul-border px-2 py-2 align-top";
const button = "inline-flex min-h-11 items-center rounded-lg border border-pul-border bg-white px-3 font-semibold text-pul-point";

export default async function ClubAnnualPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string; filter?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const current = scorePeriod(undefined, undefined).year;
  const requested = Number(query.year ?? current);
  const year = Number.isInteger(requested) && requested >= 1 && requested <= current ? requested : current;
  const filter = query.filter === "all" || !query.filter || !Object.hasOwn(awardLabels, query.filter) ? "all" : query.filter as Award;
  const base = annualHref(id);
  const scoresHref = "/clubs/" + encodeURIComponent(id) + "/scores?year=" + year;
  const context = await getAuthenticatedSupabaseContext();
  const data = context && await context.supabase.rpc("get_club_annual_activity", { p_club_key: id, p_year: year });
  if (data?.error?.code === "42501") notFound();
  const scores = context && data?.data && await context.supabase.rpc("get_club_monthly_scores", { p_club_key: id, p_year: year, p_editor: true });
  if (scores?.error?.code === "42501") notFound();
  if (!context || !data?.data || !scores?.data) return <main className="mx-auto max-w-3xl space-y-4 p-6">
    <h1 className="text-2xl font-bold">연간 활동·시상</h1><p role="alert">로그인 상태와 월례회 관리 권한을 확인해 주세요.</p>
    <Link href={scoresHref} className={button}>월례회 성적</Link>
  </main>;
  const annual = data.data as AnnualData;
  const workspace = scores.data as MonthlyWorkspace;
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
  const { rows, leagues } = annualClubActivity(workspace, annual, today);
  const candidates = rows.flatMap(row => [
    ...(row.attendanceAward ? [{ row, category: row.attendanceAward, condition: "" }] : []),
    ...leagues.flatMap(league => {
      const score = league.scores.get(row.id);
      return [
        ...(score?.rank === 1 ? [{ row, category: "average" as const, condition: league.condition }] : []),
        ...(score?.growthCandidate ? [{ row, category: "growth" as const, condition: league.condition }] : []),
      ];
    }),
  ]);
  const shown = filter === "all" ? rows : rows.filter(row => candidates.some(candidate => candidate.row.id === row.id && candidate.category === filter));
  const awardControls = (member: string) => candidates.filter(candidate => candidate.row.id === member && (filter === "all" || candidate.category === filter));
  return <MessagingSessionBoundary viewerId={context.userId}>
    <main className="mx-auto max-w-7xl space-y-5 p-4 sm:p-8">
      <Link className={button} href={scoresHref}>월례회 관리</Link>
      <form action={base} className="flex flex-wrap items-end gap-3 rounded-xl border border-pul-border bg-white p-4">
        <label>연도<input name="year" type="number" min="1" max={current} defaultValue={year} required className="ml-2 w-24 rounded border border-pul-border p-2" /></label>
        <label>표시·출력 범위<select className="ml-2 rounded border border-pul-border p-2" name="filter" defaultValue={filter}>
          <option value="all">전체 활동표</option>{Object.entries(awardLabels).map(([key, label]) => <option key={key} value={key}>{label} 후보</option>)}
        </select></label>
        <button className={button}>조회</button><AnnualPrintButton />
      </form>
      <section id="club-annual-print" className="space-y-3 rounded-xl border border-pul-border bg-white p-4">
        <h1 className="text-2xl font-bold">연간 활동·시상</h1>
        <p>{workspace.clubName} · {year}년 · {filter === "all" ? "전체 활동표" : awardLabels[filter] + " 후보"}</p>
        <p className="text-sm text-pul-muted">같은 달에 한 번 이상 참석하면 참여 1개월로 계산합니다. 성장세는 같은 경기 조건의 최근 경기일 평균을 이전 경기 평균과 비교합니다.</p>
        <div className="club-annual-table overflow-x-auto" tabIndex={0} aria-label="연간 활동표, 좌우로 스크롤">
          <table className="w-full min-w-[70rem] border-collapse text-left text-sm">
            <thead><tr><th className={cell} scope="col">회원</th>
              {Array.from({ length: 12 }, (_, month) => <th className={cell} scope="col" key={month}>{month + 1}월</th>)}
              <th className={cell} scope="col">참여 월수</th><th className={cell} scope="col">평균·성장·순위</th><th className={cell} scope="col">시상 후보</th>
            </tr></thead>
            <tbody>{shown.map(row => <tr key={row.id}>
              <th className={cell} scope="row">{row.name}</th>
              {row.cells.map((status, month) => <td className={cell} key={month}>{status}</td>)}
              <td className={cell}>{row.participating}개월</td>
              <td className={cell}>{leagues.some(league => league.scores.has(row.id)) ? <ul className="space-y-1">
                {leagues.flatMap(league => {
                  const metric = league.scores.get(row.id);
                  return metric ? [<li key={league.condition}>
                    <strong>{league.condition}</strong><br />평균 {metric.average}타 · {metric.count}경기
                    <br />성장 {metric.improvement === null ? "기록 부족" : metric.improvement === 0 ? "변화 없음" : metric.improvement > 0 ? metric.improvement + "타 개선" : -metric.improvement + "타 증가"}
                    {" · "}{metric.rank ? metric.rank + "위" : "순위 기록 부족"}
                  </li>] : [];
                })}
              </ul> : "기록 부족"}</td>
              <td className={cell}>{awardControls(row.id).map(candidate => <p key={candidate.category + candidate.condition}>
                {awardLabels[candidate.category]}{candidate.condition && " · " + candidate.condition}
              </p>)}</td>
            </tr>)}</tbody>
          </table>
          {!shown.length && <p className="py-3">표시할 회원이 없습니다.</p>}
        </div>
      </section>
      <section className="space-y-2 rounded-xl border border-pul-border bg-white p-4">
        <h2 className="text-lg font-bold">월례회 모집 인원</h2>
        {annual.recruitment.length ? <ul className="space-y-2">{annual.recruitment.map(room => <li key={room.id}>
          {room.date} · {room.title} · 참가 응답 {room.count}명
        </li>)}</ul> : <p>연결된 월례회 참여방이 없습니다.</p>}
      </section>
      <section className="space-y-2 rounded-xl border border-pul-border bg-white p-4">
        <h2 className="text-lg font-bold">수상자 확정</h2>
        {candidates.length ? <ul className="divide-y divide-pul-border">{candidates.map(({ row, category, condition }) => {
          const saved = annual.awards.some(award => award.userId === row.id && award.category === category && award.competition === condition);
          return <li key={row.id + category + condition} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>{row.name} · {awardLabels[category]}{condition && " · " + condition}</span>
            {saved ? <span className="font-bold text-pul-point">확정됨</span> : <AnnualAwardButton viewerId={context.userId} clubKey={id} year={year} member={row.id} name={row.name} category={category} condition={condition} />}
          </li>;
        })}</ul> : <p>확정할 시상 후보가 없습니다.</p>}
      </section>
      <section className="space-y-2 rounded-xl border border-pul-border bg-white p-4">
        <h2 className="text-lg font-bold">확정된 시상 내역 · {year}년</h2>
        {annual.awards.length ? <ul className="space-y-2">{annual.awards.map(award => <li key={award.id}>
          {award.name} · {awardLabels[award.category]}{award.competition && " · " + award.competition}
          {" · "}<time dateTime={award.at}>{new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul" }).format(new Date(award.at))}</time>
        </li>)}</ul> : <p>이 연도에 확정한 시상이 없습니다.</p>}
      </section>
    </main>
  </MessagingSessionBoundary>;
}

