import type { SupabaseClient } from "@supabase/supabase-js";

import { listPublicEvents, type PublicEvent } from "@/lib/events/eventDirectory";
import { listMarketListings } from "@/lib/market/market";
import { listPublicNewsArticles, type PublicNewsArticle } from "@/lib/news/newsDirectory";
import type { MarketListing } from "@/types";

export type HomeClub = {
  legacyKey: string;
  name: string;
  regionLabel: string;
  recruitmentStatus: "recruiting" | "waiting" | "closed";
};

export type HomeSection<T> = {
  items: T[];
  loadFailed: boolean;
};

export type HomeContent = {
  news: HomeSection<PublicNewsArticle>;
  events: HomeSection<PublicEvent>;
  clubs: HomeSection<HomeClub>;
  market: HomeSection<MarketListing>;
};

type ClubRow = {
  legacy_key: unknown;
  name: unknown;
  membership_recruitment_status: unknown;
};

const recruitmentStatuses = new Set<HomeClub["recruitmentStatus"]>([
  "recruiting",
  "waiting",
  "closed",
]);

function parseClubRow(value: ClubRow): HomeClub {
  if (
    typeof value.legacy_key !== "string" ||
    value.legacy_key.length === 0 ||
    typeof value.name !== "string" ||
    value.name.length === 0 ||
    typeof value.membership_recruitment_status !== "string" ||
    !recruitmentStatuses.has(
      value.membership_recruitment_status as HomeClub["recruitmentStatus"],
    )
  ) {
    throw new Error("동호회 공개 응답 형식이 올바르지 않습니다.");
  }

  return {
    legacyKey: value.legacy_key,
    name: value.name,
    regionLabel: "지역 정보 미등록",
    recruitmentStatus:
      value.membership_recruitment_status as HomeClub["recruitmentStatus"],
  };
}

export async function listPublicHomeClubs(client: SupabaseClient, limit = 7) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10) {
    throw new Error("홈 동호회 조회 범위를 확인해 주세요.");
  }

  const { data, error } = await client
    .from("clubs")
    .select("legacy_key,name,membership_recruitment_status")
    .eq("club_status", "active")
    .not("legacy_key", "is", null)
    .order("created_at", { ascending: false })
    .order("legacy_key", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error("동호회 정보를 불러오지 못했습니다.");
  }
  if (!Array.isArray(data)) {
    throw new Error("동호회 공개 응답 형식이 올바르지 않습니다.");
  }

  return data.map((row) => parseClubRow(row as ClubRow));
}

export function selectUpcomingHomeEvents(
  events: PublicEvent[],
  today: string,
  limit = 4,
) {
  return events
    .filter(
      (event) =>
        event.registrationStatus !== "ended" &&
        (event.startDate === null || event.startDate >= today),
    )
    .slice(0, limit);
}

function fulfilledItems<T>(
  result: PromiseSettledResult<{ items: T[] } | T[]>,
): HomeSection<T> {
  if (result.status === "rejected") {
    return { items: [], loadFailed: true };
  }

  return {
    items: Array.isArray(result.value) ? result.value : result.value.items,
    loadFailed: false,
  };
}

export async function loadHomeContent(client: SupabaseClient): Promise<HomeContent> {
  const [newsResult, eventResult, clubResult, marketResult] = await Promise.allSettled([
    listPublicNewsArticles(client, {}, 10, 0),
    listPublicEvents(client, {}, 12, 0),
    listPublicHomeClubs(client, 7),
    listMarketListings(
      client,
      { keyword: "", category: "all", region: "전체", saleStatus: "selling" },
      6,
      0,
    ),
  ]);

  const news = fulfilledItems(newsResult);
  const eventPage = fulfilledItems(eventResult);
  const clubs = fulfilledItems(clubResult);
  const market = fulfilledItems(marketResult);
  const today = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(new Date());

  return {
    news,
    events: {
      items: selectUpcomingHomeEvents(eventPage.items, today),
      loadFailed: eventPage.loadFailed,
    },
    clubs,
    market,
  };
}
