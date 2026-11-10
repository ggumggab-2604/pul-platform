import Link from "next/link";

import { PublicTournamentResultLine } from "@/components/events/PublicTournamentResults";
import { MessagingSessionBoundary } from "@/components/messaging/MessagingSessionBoundary";
import { resultLabel } from "@/lib/clubs/tournaments";
import { loadTournaments } from "@/lib/clubs/tournamentsServer";
import { contentRpc, type CourseOverview } from "@/lib/courses/courseContent";
import type { PublicCourse } from "@/lib/courses/courseDirectory";
import { registrationStatusLabels, type RegistrationStatus } from "@/lib/events/eventDirectory";
import type { PublicTournamentResult } from "@/lib/events/tournamentSignup";
import { createClient } from "@/lib/supabase/server";

const link = "inline-flex min-h-11 items-center font-semibold text-pul-point underline-offset-4 hover:underline";
const box = "min-w-0 rounded-xl border border-pul-border p-4";
const muted = "text-sm text-pul-muted";
const previewSize = 3;

export async function ClubHonorTournaments({ clubKey, courses, overviews, scheduleFailed, isMember, signedIn }: {
  clubKey: string;
  courses: PublicCourse[];
  overviews: Record<string, CourseOverview>;
  scheduleFailed: boolean;
  isMember: boolean;
  signedIn: boolean;
}) {
  const client = await createClient();
  const [publicResults, workspace] = await Promise.all([
    Promise.allSettled(courses.map(course => contentRpc<PublicTournamentResult[]>(
      client, "get_public_tournament_results", { p_course_key: course.courseKey },
    ))),
    isMember ? loadTournaments(clubKey).catch(() => null) : null,
  ]);
  const upcoming = [...new Map(courses.flatMap(course =>
    (overviews[course.courseKey]?.events ?? [])
      .filter(event => event.phase === "upcoming" || event.phase === "ongoing")
      .map(event => [event.key, { event, course }] as const),
  )).values()].sort((a, b) => (a.event.start ?? "").localeCompare(b.event.start ?? "") || a.event.key.localeCompare(b.event.key));

  const past = new Map<string, { course: PublicCourse; rows: PublicTournamentResult[] }>();
  publicResults.forEach((result, index) => {
    if (result.status !== "fulfilled") return;
    for (const row of result.value) {
      const existing = past.get(row.eventKey);
      if (existing) existing.rows.push(row);
      else past.set(row.eventKey, { course: courses[index], rows: [row] });
    }
  });
  const recent = [...past.values()].sort((a, b) => b.rows[0].date.localeCompare(a.rows[0].date) ||
    a.rows[0].eventKey.localeCompare(b.rows[0].eventKey));
  const resultsFailed = publicResults.some(result => result.status === "rejected");
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
  const sheet = workspace?.tournaments.find(tournament => tournament.played_on <= today &&
    tournament.entries.some(row => row.attendance === "attended" && row.confirmed));
  const scores = sheet?.entries.filter(row => row.attendance === "attended" && row.confirmed) ?? [];
  const encodedClub = encodeURIComponent(clubKey);
  const scoresHref = `/clubs/${encodedClub}/tournaments`;
  const hostHref = workspace?.can_edit ? `/events/register?club=${encodedClub}` : "/events/register";

  return <section id="club-honor-tournaments" className="mb-5 space-y-3" aria-labelledby="club-honor-tournaments-title">
    <div className="flex flex-wrap items-center justify-between gap-x-4">
      <h3 id="club-honor-tournaments-title" className="text-lg font-bold text-pul-deep">대회 일정·성적</h3>
      <div className="flex flex-wrap gap-x-4">
        <Link className={link} href="/events">대회·이벤트 전체 보기</Link>
        <Link className={link} href={hostHref}>{workspace?.can_edit ? "동호회 대회 개최 등록" : "대회 개최 신청"}</Link>
      </div>
    </div>
    <p className={muted}>연결 구장의 대회 일정과 공개 결과를 확인할 수 있습니다.</p>
    <div className="grid gap-3 md:grid-cols-2">
      <section className={box} aria-labelledby="club-tournament-upcoming">
        <h4 id="club-tournament-upcoming" className="font-bold text-pul-deep">예정 대회</h4>
        {scheduleFailed && <p role="status" className={muted}>일부 구장 일정을 불러오지 못했습니다.</p>}
        {!upcoming.length && !scheduleFailed && <p className={muted}>연결 구장에 예정된 대회가 없습니다.</p>}
        <ul className="divide-y divide-pul-border">
          {upcoming.slice(0, previewSize).map(({ event, course }) => <li key={event.key} className="py-2">
            <Link className={link} href={`/events/${encodeURIComponent(event.key)}`}>{event.title}</Link>
            <p className={muted}>{event.start}{event.end && event.end !== event.start ? ` ~ ${event.end}` : ""} · {event.phase === "ongoing" ? "진행 중" : "예정"} · {registrationStatusLabels[event.registration as RegistrationStatus] ?? "접수 상태 확인 필요"}</p>
            <Link className={`${link} text-sm`} href={`/courses/${encodeURIComponent(course.courseKey)}`}>{course.name} 구장 상세</Link>
          </li>)}
        </ul>
      </section>
      <section className={box} aria-labelledby="club-tournament-past">
        <h4 id="club-tournament-past" className="font-bold text-pul-deep">지난 대회 공개 결과</h4>
        {resultsFailed && <p role="status" className={muted}>일부 구장 결과를 불러오지 못했습니다.</p>}
        {!recent.length && !resultsFailed && <p className={muted}>연결 구장의 공개 대회 결과가 없습니다.</p>}
        <ul className="divide-y divide-pul-border">
          {recent.slice(0, previewSize).map(({ course, rows }) => <li key={rows[0].eventKey} className="py-2 text-sm">
            <Link className={link} href={`/events/${encodeURIComponent(rows[0].eventKey)}#tournament-results`}>{rows[0].title} · {rows[0].date}</Link>
            {rows.slice(0, previewSize).map((row, index) => <PublicTournamentResultLine key={index} row={row} />)}
            <Link className={link} href={`/courses/${encodeURIComponent(course.courseKey)}`}>{course.name} 구장 상세</Link>
          </li>)}
        </ul>
      </section>
    </div>
    <section className={box} aria-labelledby="club-tournament-scores">
      <h4 id="club-tournament-scores" className="font-bold text-pul-deep">우리 동호회 성적표</h4>
      {!isMember && <p className={muted}>이 동호회의 가입 회원이 성적표를 열 수 있습니다.</p>}
      {isMember && !workspace && <p role="status" className={muted}>동호회 성적을 불러오지 못했습니다.</p>}
      {workspace && !sheet && <p className={muted}>아직 확인된 대회 성적이 없습니다.</p>}
      {workspace && sheet && <MessagingSessionBoundary viewerId={workspace.user_id}><div className="mt-2">
        <p className="font-semibold">{sheet.title} · {sheet.played_on}</p>
        {sheet.host_confirmation_pending && <p className={muted}>동호회 확인 성적 · 개최자 공식 확정 대기</p>}
        <table className="mt-2 w-full text-left text-sm">
          <caption className="sr-only">{sheet.title} 최근 성적</caption>
          <thead className="border-b border-pul-border"><tr><th scope="col" className="py-2 pr-2">이름 · 부문</th><th scope="col" className="py-2">결과</th></tr></thead>
          <tbody className="divide-y divide-pul-border">{scores.slice(0, 5).map(row => <tr key={row.id}>
            <td className="py-2 pr-2 break-words">{row.display_name} · {row.division}</td><td className="py-2">{resultLabel(row)}</td>
          </tr>)}</tbody>
        </table>
        {sheet.id && <Link className={link} href={`${scoresHref}?tournament=${encodeURIComponent(sheet.id)}`}>이 대회 성적표 전체 보기</Link>}
      </div></MessagingSessionBoundary>}
      {isMember && <Link className={`${link} mr-4`} href={scoresHref}>동호회 대회 성적 모아보기</Link>}
      {!signedIn && <Link className={link} href={`/login?next=${encodeURIComponent(`/clubs/${encodedClub}#club-honor-tournaments`)}`}>로그인</Link>}
    </section>
  </section>;
}
