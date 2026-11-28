import Link from "next/link";
import { notFound } from "next/navigation";
import { LostItemFacts } from "@/components/market/LostItemFacts";
import { Container } from "@/components/ui/Container";
import { contentRpc } from "@/lib/courses/courseContent";
import { CourseDirectoryError, getPublicCourse } from "@/lib/courses/courseDirectory";
import { lostItemButton, type LostItemReport } from "@/lib/market/lostItems";
import { createClient } from "@/lib/supabase/server";

export default async function ScreenLostItemsPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { id } = await params;
  const { page } = await searchParams;
  const number = typeof page === "string" && /^[0-9]{1,4}$/.test(page) ? Math.max(1, Math.min(1001, Number(page))) : 1;
  const client = await createClient();
  const course = await getPublicCourse(client, id).catch(error => {
    if (error instanceof CourseDirectoryError && error.code === "notFound") notFound();
    throw error;
  });
  if (course.courseType !== "screen") notFound();

  const path = `/courses/${id}/lost-items`;
  const reports = await contentRpc<LostItemReport[]>(client, "market_lost_read", {
    p_id: null, p_filters: { screen: id }, p_offset: (number - 1) * 20,
  });
  return <Container className="max-w-4xl space-y-5 py-6">
    <Link href={`/courses/${id}`} prefetch={false} className={lostItemButton}>← {course.name}</Link>
    <h1 className="text-2xl font-bold text-pul-deep">장터 연동 분실 신고</h1>
    {reports.length === 0 ? <p className="rounded-xl border border-pul-border bg-white p-5">연결된 분실 신고가 없습니다.</p>
      : <ul className="space-y-3">{reports.slice(0, 20).map(report => <li key={report.id} className="rounded-xl border border-pul-border bg-white p-4 sm:p-5">
        <Link href={`${path}/${report.id}`} prefetch={false} className="inline-flex min-h-11 items-center break-words text-lg font-bold text-pul-deep hover:underline">{report.item}</Link>
        <LostItemFacts report={report} compact />
      </li>)}</ul>}
    {(number > 1 || reports.length > 20) && <nav className="flex gap-2" aria-label="분실 신고 목록 페이지">
      {number > 1 && <Link className={lostItemButton} href={`${path}?page=${number - 1}`}>이전</Link>}
      {reports.length > 20 && number < 1001 && <Link className={lostItemButton} href={`${path}?page=${number + 1}`}>다음</Link>}
    </nav>}
  </Container>;
}
