import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";

import { TournamentRegistrationForm } from "@/components/events/TournamentRegistrationForm";
import { Container } from "@/components/ui/Container";
import { getPublicCourse } from "@/lib/courses/courseDirectory";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export const metadata = { title: "대회 개최 등록 · PUL" };

export default async function TournamentRegistrationPage({ searchParams }: { searchParams: Promise<{ club?: string; course?: string }> }) {
  const query = await searchParams;
  const club = typeof query.club === "string" ? query.club : "";
  const course = typeof query.course === "string" && !club ? query.course : "";
  const context = await getAuthenticatedSupabaseContext();
  if (!context) {
    const params = new URLSearchParams(club ? { club } : course ? { course } : {});
    redirect(`/login?next=${encodeURIComponent(params.size ? `/events/register?${params}` : "/events/register")}`);
  }
  const scope = club ? "club" : course ? "course" : "external";
  const courseName = course ? (await getPublicCourse(context.supabase, course).catch(() => null))?.name : undefined;
  return <main><Container className="max-w-3xl py-6">
    <Link className="inline-flex min-h-11 items-center text-pul-point underline" href="/events">대회·이벤트</Link>
    <h1 className="my-3 text-2xl font-bold text-pul-deep">{scope === "external" ? "대회 개최 신청" : "대회 개최 등록"}</h1>
    <TournamentRegistrationForm scope={scope} hostKey={club || course} courseName={courseName} viewerId={context.userId} requestId={randomUUID()} />
  </Container></main>;
}
