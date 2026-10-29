import { ClubAffiliations } from "@/components/clubs/ClubAffiliations";
import { Container } from "@/components/ui/Container";
import { getMyClubAffiliations } from "@/lib/clubs/clubAffiliations";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { redirect } from "next/navigation";
export const metadata = { title: "내 소속 동호회" };
export default async function Page({ searchParams }: { searchParams: Promise<{ choose?: string }> }) {
  const auth = await getAuthenticatedSupabaseContext();
  if (!auth) redirect("/login?next=/my/clubs");
  const data = await getMyClubAffiliations(auth.supabase, auth.userId).catch(() => null);
  return <Container className="py-6"><h1 className="mb-5 text-2xl font-bold text-pul-deep">내 소속 동호회</h1><ClubAffiliations viewerId={auth.userId} initial={data} choose={(await searchParams).choose} /></Container>;
}
