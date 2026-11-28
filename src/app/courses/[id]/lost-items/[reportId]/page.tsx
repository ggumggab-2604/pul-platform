import Link from "next/link";
import { notFound } from "next/navigation";
import { LostItemReportContent } from "@/components/market/LostItemReportContent";
import { Container } from "@/components/ui/Container";
import { contentRpc, uuid } from "@/lib/courses/courseContent";
import { lostItemButton, type LostItemReport } from "@/lib/market/lostItems";
import { createClient } from "@/lib/supabase/server";

export default async function ScreenLostItemPage({ params }: { params: Promise<{ id: string; reportId: string }> }) {
  const { id, reportId } = await params;
  if (!id || !uuid.test(reportId)) notFound();
  const [report] = await contentRpc<LostItemReport[]>(await createClient(), "market_lost_read", {
    p_id: reportId, p_filters: { screen: id }, p_offset: 0,
  });
  if (!report) notFound();
  return <Container className="max-w-4xl space-y-5 py-6">
    <Link href={`/courses/${id}/lost-items`} prefetch={false} className={lostItemButton}>← 장터 연동 분실 신고</Link>
    <LostItemReportContent report={report} screen />
  </Container>;
}
