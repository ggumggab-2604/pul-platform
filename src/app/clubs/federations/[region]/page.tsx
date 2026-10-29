import { Container } from "@/components/ui/Container";
import { ClubFederationBoard } from "@/components/clubs/ClubFederationBoard";
import { getClubFederation, type ClubFederationPage } from "@/lib/clubs/clubAffiliations";
import { createClient } from "@/lib/supabase/server";
export const metadata = { title: "지역 연합" };
export default async function Page({ params }: { params: Promise<{ region: string }> }) {
  const { region } = await params;
  let data: ClubFederationPage | null = null;
  try { data = await getClubFederation(await createClient(), decodeURIComponent(region)); } catch { /* Show the same unavailable state for malformed or unavailable regions. */ }
  return <Container className="py-6">{data ? <ClubFederationBoard initial={data} /> : <><h1 className="text-2xl font-bold">지역 연합을 확인할 수 없습니다.</h1><p className="mt-3" role="alert">지역과 로그인 상태를 확인한 뒤 다시 불러와 주세요.</p></>}</Container>;
}
