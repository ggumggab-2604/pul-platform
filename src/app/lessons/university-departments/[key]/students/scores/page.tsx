import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { UniversityActionForm } from "@/components/lessons/UniversityForms";
import { universityButton, universityInput } from "@/components/lessons/universityStyles";
import { monthlyGameLabels, monthlyMedals, scoreMonth, scorePeriod } from "@/lib/clubs/monthlyScores";
import { universityHref, universityKey } from "@/lib/lessons/universityWorkspace";
import type { UniversityScoreWorkspace, UniversityTournamentCandidate } from "@/lib/lessons/universityScores";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { linkUniversityTournament } from "./actions";

export const metadata = { title: "학과 성적·명예의 전당" };

const medalMessages = {
  empty: "이달에 해당 종류의 월례회 기록이 없습니다.",
  unclassified: "집계 대기 · 최신 경기 종류를 확인해 주세요.",
  ambiguous: "집계 대기 · 같은 날 여러 경기가 있어 기준 경기 확인이 필요합니다.",
  unregistered: "집계 대기 · 최신 경기 성적표가 등록되지 않았습니다.",
  incomplete: "집계 대기 · 참가자 중 타수 미입력이 있습니다.",
  "no-eligible": "메달 대상이 되는 유효 성적이 없습니다.",
};
const medals = ["금메달", "은메달", "동메달"];
const tournamentHref = (key: string) => "/events/" + encodeURIComponent(key) + "#tournament-results";

export default async function Page({ params, searchParams }: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ year?: string; month?: string; game?: string; tournament?: string }>;
}) {
  const { key } = await params;
  if (!universityKey(key)) notFound();
  const students = universityHref(key) + "/students";
  const href = students + "/scores";
  const auth = await getAuthenticatedSupabaseContext();
  if (!auth) redirect("/login?next=" + encodeURIComponent(href));
  const query = await searchParams;
  const defaults = scorePeriod(undefined, undefined);
  const year = /^\d{1,4}$/.test(query.year ?? "") && Number(query.year) > 0 ? Number(query.year) : defaults.year;
  const month = /^\d{1,2}$/.test(query.month ?? "") && Number(query.month) >= 1 && Number(query.month) <= 12 ? Number(query.month) : defaults.month;
  const game = query.game === "screen" ? "screen" : "field";
  const result = await auth.supabase.rpc("get_university_score_workspace", { p_key: key, p_year: year });
  if (result.error?.code === "42501") notFound();
  if (result.error || !result.data) return <Container><p role="alert">학과 성적을 불러오지 못했습니다.</p></Container>;
  const workspace = result.data as UniversityScoreWorkspace;
  const medal = monthlyMedals(workspace, month, game);
  const sheets = workspace.sheets.filter(sheet => sheet.gameType === game && scoreMonth(sheet.date) === month);
  const best = workspace.best.filter(row => row.game === game);
  const tournaments = workspace.tournaments.filter(row => row.game === game);
  const tournament = typeof query.tournament === "string" ? query.tournament.trim().replace(/^.*\/events\//, "").split(/[/?#]/)[0] : "";
  const candidates = workspace.manager && tournament && tournament.length <= 160
    ? await auth.supabase.rpc("get_university_tournament_candidates", { p_key: key, p_event_key: tournament })
    : null;

  return <Container className="max-w-4xl space-y-4 px-3 py-6 pb-24">
    <div className="flex flex-wrap gap-2">
      <Link className={universityButton} href={students + "?section=event"}>모임·월례회</Link>
      <Link className={universityButton} href="/hall-of-fame">전국 명예의 전당</Link>
    </div>
    <header>
      <p className="break-words font-bold text-pul-point">{workspace.department}</p>
      <h1 className="text-2xl font-bold text-pul-deep">학과 성적·명예의 전당</h1>
    </header>

    <form method="get" action={href} className="flex flex-wrap items-end gap-2">
      <label className="grid gap-1 font-bold">연도<input type="number" name="year" defaultValue={year} min={1} max={9999} required className={universityInput + " w-24"} /></label>
      <label className="grid gap-1 font-bold">월<select name="month" defaultValue={month} className={universityInput}>
        {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{i + 1}월</option>)}
      </select></label>
      <label className="grid gap-1 font-bold">경기 종류<select name="game" defaultValue={game} className={universityInput}>
        {Object.entries(monthlyGameLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <button className={universityButton}>조회</button>
    </form>

    <Card title={month + "월 " + monthlyGameLabels[game] + " 월례회 성적표"}>
      {sheets.length ? <ul className="space-y-2">{sheets.map(sheet => <li key={sheet.id}>
        <Link className="break-words font-semibold text-pul-point underline" href={href + "/" + sheet.id}>{sheet.date} · {sheet.title}</Link>
      </li>)}</ul> : <p>등록된 성적표가 없습니다.</p>}
    </Card>

    <Card title={month + "월 " + monthlyGameLabels[game] + " 월간 메달"} bodyClassName="space-y-2">
      {medal.date && <p>기준 경기일 {medal.date}{medal.sheet?.id && <> · <Link href={href + "/" + medal.sheet.id} className="font-semibold text-pul-point underline">{medal.sheet.title}</Link></>}</p>}
      {medal.status === "ready" ? <ul className="space-y-2">{medals.map((label, index) => {
        const group = medal.groups[index];
        return <li className="break-words" key={label}><strong>{label}</strong> · {group
          ? (group.winners.length > 1 ? "공동 · " : "") + group.score + "타 · " + group.winners.map(row => row.name).join(", ")
          : "수상자 없음"}</li>;
      })}</ul> : <p>{medalMessages[medal.status]}</p>}
    </Card>

    <Card title={monthlyGameLabels[game] + " 개인 최저타 (전체 기간)"}>
      {best.length ? <ul className="divide-y divide-pul-border">{best.map(row => <li key={row.userId} className="flex flex-wrap gap-x-3 gap-y-1 py-2">
        <strong className="break-all">{row.name}{row.userId === auth.userId && " (나)"}</strong><span>{row.score}타</span>
        <Link className="break-words text-pul-point underline" href={row.meeting ? href + "/" + row.meeting : tournamentHref(row.eventKey!)}>{row.date} · {row.title}</Link>
      </li>)}</ul> : <p>등록된 최저타가 없습니다.</p>}
    </Card>

    <Card title={year + "년 " + monthlyGameLabels[game] + " 공식 대회 성적"}>
      {tournaments.length ? <ul className="divide-y divide-pul-border">{tournaments.map(row => <li key={[row.eventKey, row.userId, row.division].join(":")} className="space-y-1 py-2">
        <Link className="break-words font-semibold text-pul-point underline" href={tournamentHref(row.eventKey)}>{row.date} · {row.title}</Link>
        <p className="break-words">{row.name} · {row.division} · {row.tied ? "공동 " : ""}{row.place}위 · {row.score}타</p>
      </li>)}</ul> : <p>연결된 공식 성적이 없습니다.</p>}
    </Card>

    {workspace.manager && <Card title="공식 대회 성적 연결" bodyClassName="space-y-3" id="tournament-links">
      <p><Link href="/events" className="text-pul-point underline">대회 목록</Link>에서 경기 주소를 확인하세요. 참가 소속 선택과 성적 정정은 대회 원본에서 처리합니다.</p>
      <form method="get" action={href + "#tournament-links"} className="space-y-2">
        <input type="hidden" name="year" value={year} /><input type="hidden" name="month" value={month} /><input type="hidden" name="game" value={game} />
        <label className="grid gap-1 font-bold">대회 주소 또는 대회 코드
          <input name="tournament" className={universityInput} defaultValue={tournament} maxLength={240} required />
        </label>
        <button className={universityButton}>공식 결과 조회</button>
      </form>
      {candidates && (candidates.error ? <p role="alert">공식 결과를 불러오지 못했습니다.</p>
        : (candidates.data as UniversityTournamentCandidate[]).length ? <ul className="space-y-2">{(candidates.data as UniversityTournamentCandidate[]).map(row =>
          <li key={row.userId + ":" + row.division} className="grid gap-1 rounded-lg border border-pul-border p-2">
            <p className="break-words">{row.title} · {row.name} · {row.division} · {row.place}위 · {row.score}타</p>
            <UniversityActionForm action={linkUniversityTournament.bind(null, key, auth.userId, tournament, row.userId, row.division, true)} button="이 성적 연결" once />
          </li>)}</ul> : <p>연결할 수 있는 승인 재학생의 공식 결과가 없습니다.</p>)}
      {workspace.links.length > 0 && <details className="space-y-2">
        <summary className="cursor-pointer font-bold">연결 관리</summary>
        <ul className="space-y-2">{workspace.links.map(row => <li key={[row.eventKey, row.userId, row.division].join(":")} className="space-y-1 p-2">
          <p className="break-words">{row.title} · {row.name} · {row.division}</p>
          <UniversityActionForm action={linkUniversityTournament.bind(null, key, auth.userId, row.eventKey, row.userId, row.division, false)} button="연결 해제" once />
        </li>)}</ul>
      </details>}
    </Card>}
  </Container>;
}

