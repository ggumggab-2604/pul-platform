import Link from "next/link";
import { notFound } from "next/navigation";
import { LostItemReportContent } from "@/components/market/LostItemReportContent";
import { contentRpc, uuid } from "@/lib/courses/courseContent";
import { lostItemButton, lostItemsPath, type LostItemReport } from "@/lib/market/lostItems";
import { createClient } from "@/lib/supabase/server";

export default async function LostItemPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!uuid.test(id)) notFound();
  const search = await searchParams;
  const query = new URLSearchParams();
  for (const key of ["q", "category", "brand", "model", "color", "region", "course", "from", "to", "scope", "page", "back"]) {
    const value = search[key];
    if (typeof value === "string") query.set(key, value);
  }
  const list = lostItemsPath + (query.size ? "?" + query : "");
  const reports = await contentRpc<LostItemReport[]>(await createClient(), "market_lost_read", {
    p_id: id, p_filters: {}, p_offset: 0,
  }).catch(() => null);
  if (!reports) return <p role="alert" className="rounded-xl border border-rose-200 bg-white p-5">
    분실 신고를 불러오지 못했습니다. <a href={lostItemsPath + "/" + id} className="font-bold text-pul-point underline">다시 불러오기</a>
  </p>;
  const [report] = reports;
  if (!report) notFound();

  return <>
    <Link href={list} prefetch={false} className={lostItemButton}>← 분실 신고 목록</Link>
    <LostItemReportContent report={report} />
  </>;
}
