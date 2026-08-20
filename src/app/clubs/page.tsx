import { ClubsPageShell } from "@/components/clubs/ClubsPageShell";
import {
  ClubDirectoryError,
  clubRegions,
  listPublicClubs,
  type PublicClubFilters,
  type PublicClubPage,
} from "@/lib/clubs/clubDirectory";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "동호회 찾기",
  description:
    "가까운 파크골프 동호회를 찾고, 가입 정보와 월례회·친선전·정기 라운드 일정을 확인하세요.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const emptyPage: PublicClubPage = { items: [], total: 0, limit: 24, offset: 0, hasMore: false };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ClubsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const requestedPage = Number.parseInt(first(params.page) ?? "1", 10);
  const pageNumber = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const requestedRegion = first(params.region);
  const requestedRecruitment = first(params.recruitment);
  const filters: PublicClubFilters = {
    keyword: first(params.keyword)?.trim() || undefined,
    region: clubRegions.includes(requestedRegion as (typeof clubRegions)[number]) ? requestedRegion as PublicClubFilters["region"] : undefined,
    district: first(params.district)?.trim() || undefined,
    recruitmentStatus: ["recruiting", "waiting", "closed"].includes(requestedRecruitment ?? "") ? requestedRecruitment as PublicClubFilters["recruitmentStatus"] : undefined,
  };
  let page = { ...emptyPage, offset: (pageNumber - 1) * 24 };
  let error: string | undefined;
  try {
    page = await listPublicClubs(await createClient(), filters, 24, page.offset);
  } catch (caught) {
    error = caught instanceof ClubDirectoryError ? caught.userMessage : "동호회 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
  return <ClubsPageShell page={page} filters={filters} pageNumber={pageNumber} error={error} />;
}
