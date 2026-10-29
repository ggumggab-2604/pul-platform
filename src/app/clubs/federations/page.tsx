import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { contentRpc } from "@/lib/courses/courseContent";
import { federationHref } from "@/lib/clubs/clubAffiliations";
import { createClient } from "@/lib/supabase/server";
export const metadata = { title: "시도 지역 연합" };
export default async function Page() {
  const regions = await contentRpc<{ region: string; name: string }[]>(await createClient(), "list_club_federations", {}).catch(() => null);
  return <Container className="py-6"><Card title="시도 지역 연합"><p className="mb-4 text-pul-muted">주 소속 동호회의 소속 시도를 기준으로 연결되는 17개 지역 연합입니다.</p>{regions ? <ul className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">{regions.map(r => <li key={r.region}><Link className="flex min-h-11 items-center rounded-lg border border-pul-border px-3 text-pul-deep" href={federationHref(r.region)}>{r.name}</Link></li>)}</ul> : <p role="alert">지역 연합을 불러오지 못했습니다. 다시 불러와 주세요.</p>}<Link className="mt-4 inline-flex min-h-11 items-center font-semibold text-pul-point" href="/my/clubs">내 주 소속·지역 연합 확인</Link></Card></Container>;
}
