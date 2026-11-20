import { certificationActivityDetailHref, certificationJobFacts } from "@/lib/certification/certificationJobActivity";
import { parseCertificationEventJobs } from "@/lib/certification/certificationDirectory";
import { CertificationJobStatusBadge } from "@/components/certification/CertificationJobCard";
import { PublicTournamentResults } from "@/components/events/PublicTournamentResults";
import { TournamentSignupPanel } from "@/components/events/TournamentSignup";
import type { PublicTournamentResult, TournamentSignup } from "@/lib/events/tournamentSignup";
import { TournamentFinalization, type HostResults } from "@/components/events/TournamentFinalization";
import { EventDetailContent } from "@/components/events/EventDetailContent";
import { Container } from "@/components/ui/Container";
import { EventDirectoryError, getPublicEvent } from "@/lib/events/eventDirectory";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

type EventDetailPageProps = { params: Promise<{ id: string }> };

const getEventByKey = cache(async (eventKey: string) => getPublicEvent(await createClient(), eventKey));

export async function generateMetadata({ params }: EventDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const event = await getEventByKey(id);
    return { title: event.title, description: event.summary };
  } catch {
    return { title: "대회·이벤트 정보" };
  }
}

export default async function EventDetailPage({ params }: EventDetailPageProps) {
  const { id } = await params;
  let event;
  try {
    event = await getEventByKey(id);
  } catch (error) {
    if (error instanceof EventDirectoryError && error.code === "notFound") notFound();
    throw error;
  }

  const client = await createClient();
  const [{ data: playedCourse }, context, { data: signupData }, { data: resultData }, linkedJobs] = await Promise.all([
    client.rpc("get_public_tournament_course", { p_event_key: id }),
    getAuthenticatedSupabaseContext(),
    client.rpc("get_tournament_signup", { p_event_key: id }),
    client.rpc("get_public_tournament_results", { p_event_key: id }),
    client.rpc("certification_event_jobs", { p_event_key: id }).then(({ data, error }) =>
      error ? [] : parseCertificationEventJobs(data ?? []),
    ).then(undefined, () => []),
  ]);
  const signup = signupData as TournamentSignup | null;
  const deadlineLabel = signup ? new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium", timeStyle: "short", hourCycle: "h23", timeZone: "Asia/Seoul",
  }).format(new Date(signup.deadline)) : "";
  const publicResults = (resultData ?? []) as PublicTournamentResult[];
  const hostResults = typeof playedCourse === "string" && context
    ? (await context.supabase.rpc("get_pul_tournament_host_results", { p_event_key: id })).data as HostResults | null
    : null;

  return (
    <div className="bg-pul-page">
      <Container className="max-w-6xl px-3 py-4 lg:py-8">
        <nav aria-label="경로" className="mb-4 flex flex-wrap items-center gap-2 text-sm text-pul-muted">
          <Link href="/" className="font-semibold hover:text-pul-point">홈</Link><span aria-hidden="true">›</span>
          <Link href="/events" className="font-semibold hover:text-pul-point">대회·이벤트</Link><span aria-hidden="true">›</span>
          <span className="font-bold text-foreground">{event.title}</span>
        </nav>
        <EventDetailContent event={event} tournamentSignup={!!signup} />
        {typeof playedCourse === "string" && <p className="mt-4 rounded-lg border border-pul-border bg-white p-4 text-sm"><strong>경기 코스</strong> · {playedCourse}</p>}
        {typeof playedCourse === "string" && <Link className="mt-4 inline-flex min-h-11 items-center text-pul-point underline" href={`/hall-of-fame?tab=awards&event=${encodeURIComponent(id)}`}>이 대회 공식 수상 결과</Link>}
        {signup && <TournamentSignupPanel eventKey={id} viewerId={context?.userId ?? ""} signup={signup} matchType={event.matchType} deadlineLabel={deadlineLabel} />}
        {linkedJobs.length > 0 && <section className="mt-4 rounded-xl border border-pul-border bg-white p-4">
          <h2 className="text-lg font-bold text-pul-deep">대회 구인 공고</h2>
          <ul className="mt-2 grid gap-3 sm:grid-cols-2">{linkedJobs.map((job) => <li key={job.key} className="min-w-0 rounded-lg border border-pul-border p-3">
            <div className="flex flex-wrap items-center gap-x-2">
              <Link prefetch={false} href={certificationActivityDetailHref("job", job.key)} className="inline-flex min-h-11 items-center break-words font-bold text-pul-point underline">{job.title}</Link>
              <CertificationJobStatusBadge status={job.status} />
            </div>
            <dl className="space-y-1 text-sm">
              {[...certificationJobFacts(job).map(([label, value]) => [label === "필요 자격" ? label : "공고 " + label, value]),
                ["공고 문의 담당자", job.contactName ?? "공고 확인"],
              ].map(([label, value]) => <div key={label} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
                <dt className="font-semibold text-pul-muted">{label}</dt><dd className="break-words">{value}</dd>
              </div>)}
            </dl>
          </li>)}</ul>
        </section>}
        <PublicTournamentResults results={publicResults} />
        {hostResults && context && (!signup || hostResults.corrections.length > 0) &&
          <TournamentFinalization eventKey={id} viewerId={context.userId} results={hostResults} correctionsOnly={!!signup} />}
        <Link href="/events" className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-pul-border bg-white px-4 text-sm font-bold text-pul-deep hover:bg-pul-light sm:w-auto">대회·이벤트 목록으로</Link>
      </Container>
    </div>
  );
}
