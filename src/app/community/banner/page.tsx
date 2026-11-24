import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { CommunityBannerRequestForm } from "@/components/community/CommunityBannerRequestForm";
import type { BannerPost, BannerSlot } from "@/lib/community/communityPromotions";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "배너 신청" };

function bannerDates() {
  const now = Date.now();
  const localTime = (value: number) => new Date(value + 9 * 3600_000).toISOString().slice(0, 16);
  return { starts: localTime(now), ends: localTime(now + 14 * 86_400_000) };
}

export default async function CommunityBannerPage({ searchParams }: { searchParams: Promise<{ post?: string | string[] }> }) {
  const params = await searchParams;
  const context = await getAuthenticatedSupabaseContext();
  if (!context) {
    const next = typeof params.post === "string" ? `/community/banner?post=${encodeURIComponent(params.post)}` : "/community/banner";
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  const [posts, slots] = await Promise.all([
    context.supabase.rpc("list_my_community_banner_posts"),
    context.supabase.rpc("list_community_banner_slots"),
  ]);
  return <main className="bg-pul-page">
    <Container className="max-w-2xl! px-3 py-5 sm:py-8">
      <Link className="inline-flex min-h-11 items-center font-bold text-pul-point" href="/community">← 홍보·광고</Link>
      <section className="space-y-4 rounded-xl border border-pul-border bg-white p-4 sm:p-6">
        <h1 className="text-2xl font-extrabold text-pul-deep">배너 신청</h1>
        <p className="text-sm leading-relaxed text-pul-muted">신청한 배너 자리와 연결 글의 커뮤니티 상단 공지에 같은 게시 기간이 적용됩니다. 운영자가 배너를 검토하고 게시합니다.</p>
        {posts.error || slots.error ? <p role="alert">신청 정보를 불러오지 못했습니다. 정상 활동 중인 회원인지 확인해 주세요.</p>
          : <CommunityBannerRequestForm posts={(posts.data ?? []) as BannerPost[]} slots={(slots.data ?? []) as BannerSlot[]}
            initialPost={typeof params.post === "string" ? params.post : ""} {...bannerDates()} />}
      </section>
    </Container>
  </main>;
}
