import { ClubDetailContent } from "@/components/clubs/detail/ClubDetailContent";
import { Container } from "@/components/ui/Container";
import { getClubDetailData, parkGolfClubs } from "@/data/clubData";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

type ClubDetailPageProps = {
  params: Promise<{ id: string }>;
};

export function generateStaticParams() {
  return parkGolfClubs.map((club) => ({ id: club.id }));
}

export async function generateMetadata({ params }: ClubDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const detail = getClubDetailData(id);
  if (!detail) return { title: "동호회 정보" };
  return {
    title: detail.club.name,
    description: `${detail.club.regionLabel} ${detail.club.name} 활동 및 가입 정보`,
  };
}

export default async function ClubDetailPage({ params }: ClubDetailPageProps) {
  const { id } = await params;
  const detail = getClubDetailData(id);
  if (!detail) notFound();

  return (
    <div className="bg-pul-page overflow-visible">
      <Container className="max-w-6xl px-3 py-4 pb-10 lg:py-8 lg:pb-16">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <nav aria-label="경로" className="flex flex-wrap items-center gap-1.5 text-sm text-pul-muted lg:text-base">
            <Link href="/" className="font-medium hover:text-pul-point">홈</Link>
            <span aria-hidden="true">›</span>
            <Link href="/clubs" className="font-medium hover:text-pul-point">동호회</Link>
            <span aria-hidden="true">›</span>
            <span className="font-semibold text-foreground">{detail.club.name}</span>
          </nav>
          <Link href="/clubs" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-pul-border bg-white px-4 text-sm font-bold text-pul-deep hover:bg-pul-light lg:text-base">동호회 목록으로</Link>
        </div>
        <ClubDetailContent detail={detail} />
      </Container>
    </div>
  );
}
