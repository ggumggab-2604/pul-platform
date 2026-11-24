import { redirect } from "next/navigation";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { BannerRequestReview } from "@/components/promotions/manage/BannerRequestReview";
import { bannerRequestPageSize, type BannerRequestPage } from "@/lib/community/communityPromotions";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export default async function BannerRequestsPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const params = await searchParams;
  const value = typeof params.page === "string" ? Number(params.page) : 1;
  const page = Number.isSafeInteger(value) && value >= 1 && value <= 10000 ? value : 1;
  const context = await getAuthenticatedSupabaseContext();
  if (!context) redirect("/login?next=%2Fmanage%2Fbanners%2Fcommunity");
  const { data, error } = await context.supabase.rpc("list_community_banner_requests", { p_limit: bannerRequestPageSize, p_offset: (page - 1) * bannerRequestPageSize });
  const result = (data ?? { items: [], total: 0 }) as BannerRequestPage;
  const lastPage = Math.max(1, Math.ceil(result.total / bannerRequestPageSize));
  if (!error && page > lastPage) redirect(`/manage/banners/community?page=${lastPage}`);
  return <main className="bg-pul-page">
    <Container className="max-w-4xl! px-3 py-5 sm:py-8">
      <Link href="/manage/banners" className="inline-flex min-h-11 items-center font-bold text-pul-point">← 배너·홍보 관리</Link>
      <h1 className="my-3 text-2xl font-extrabold text-pul-deep">커뮤니티 배너 신청</h1>
      {error ? <p role="alert">배너 신청 목록을 불러올 수 없습니다. 배너 운영 권한을 확인해 주세요.</p>
        : <BannerRequestReview requests={result.items} total={result.total} page={page} pages={lastPage} />}
    </Container>
  </main>;
}
