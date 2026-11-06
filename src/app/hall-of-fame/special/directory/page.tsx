import Link from "next/link";

import { HallOfFamePublicExplorer } from "@/components/hall-of-fame/HallOfFamePublicExplorer";
import { Container } from "@/components/ui/Container";
import { listHallOfFamePublicRankings, listHallOfFamePublicRecordsByType } from "@/lib/hall-of-fame/hallOfFameMemberUi";
import { getKstHomeReferenceDate } from "@/lib/home/homeAggregation";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "인증 기록 조회 · 명예의 전당" };

export default async function DirectoryPage() {
  const supabase = await createClient();
  const referenceDate = getKstHomeReferenceDate();
  const [records, rankings] = await Promise.allSettled([
    listHallOfFamePublicRecordsByType(supabase, "all", 24, 0),
    listHallOfFamePublicRankings(supabase, "monthly", referenceDate, 20),
  ]);
  return <main><Container className="py-6">
    <Link href="/hall-of-fame?tab=special" className="text-pul-point underline">특별 기록</Link>
    <h1 className="mt-2 text-2xl font-bold text-pul-deep">인증 기록 조회</h1>
    <HallOfFamePublicExplorer
      initialRecords={records.status === "fulfilled" ? records.value : []}
      initialRecordsFailed={records.status === "rejected"}
      initialRankings={rankings.status === "fulfilled" ? rankings.value : []}
      initialRankingsFailed={rankings.status === "rejected"}
      referenceDate={referenceDate}
    />
  </Container></main>;
}
