import type { SupabaseClient } from "@supabase/supabase-js";

import { listPublicClubs } from "@/lib/clubs/clubDirectory";
import { listPublicEvents, type PublicEvent } from "@/lib/events/eventDirectory";
import {
  listHallOfFamePublicRankings,
  listHallOfFamePublicRecordsByType,
  type HallOfFamePublicRanking,
  type HallOfFamePublicRecord,
} from "@/lib/hall-of-fame/hallOfFameMemberUi";
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

export type HomeHallOfFameRecord = Pick<
  HallOfFamePublicRecord,
  | "recordTypeCode"
  | "recordTypeName"
  | "playedOn"
  | "courseName"
  | "holeNumber"
  | "displayName"
  | "clubName"
  | "publishedAt"
>;

export type HomeHallOfFameRanking = Pick<
  HallOfFamePublicRanking,
  "rank" | "label" | "sublabel" | "recordCount" | "recordTypeCounts"
>;

export type HomeHallOfFame = {
  records: HomeSection<HomeHallOfFameRecord>;
  rankings: HomeSection<HomeHallOfFameRanking>;
  referenceDate: string;
};

export type HomeContent = {
  news: HomeSection<PublicNewsArticle>;
  events: HomeSection<PublicEvent>;
  clubs: HomeSection<HomeClub>;
  market: HomeSection<MarketListing>;
  hallOfFame: HomeHallOfFame;
};

export async function listPublicHomeClubs(client: SupabaseClient, limit = 7) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10) {
    throw new Error("홈 동호회 조회 범위를 확인해 주세요.");
  }

  const page = await listPublicClubs(client, {}, limit, 0);
  return page.items.map((club) => ({
    legacyKey: club.publicKey,
    name: club.name,
    regionLabel: club.regionLabel,
    recruitmentStatus: club.recruitmentStatus,
  }));
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

export function getKstHomeReferenceDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function toHomeHallOfFameRecord(
  record: HallOfFamePublicRecord,
): HomeHallOfFameRecord {
  return {
    recordTypeCode: record.recordTypeCode,
    recordTypeName: record.recordTypeName,
    playedOn: record.playedOn,
    courseName: record.courseName,
    holeNumber: record.holeNumber,
    displayName: record.displayName,
    clubName: record.clubName,
    publishedAt: record.publishedAt,
  };
}

function toHomeHallOfFameRanking(
  ranking: HallOfFamePublicRanking,
): HomeHallOfFameRanking {
  return {
    rank: ranking.rank,
    label: ranking.label,
    sublabel: ranking.sublabel,
    recordCount: ranking.recordCount,
    recordTypeCounts: ranking.recordTypeCounts,
  };
}

export async function loadHomeContent(client: SupabaseClient): Promise<HomeContent> {
  const referenceDate = getKstHomeReferenceDate();
  const [
    newsResult,
    eventResult,
    clubResult,
    marketResult,
    hallOfFameRecordResult,
    hallOfFameRankingResult,
  ] = await Promise.allSettled([
    listPublicNewsArticles(client, {}, 10, 0),
    listPublicEvents(client, {}, 12, 0),
    listPublicHomeClubs(client, 7),
    listMarketListings(
      client,
      { keyword: "", category: "all", region: "전체", saleStatus: "selling" },
      6,
      0,
    ),
    listHallOfFamePublicRecordsByType(client, "all", 12, 0),
    listHallOfFamePublicRankings(client, "monthly", referenceDate, 10),
  ]);

  const news = fulfilledItems(newsResult);
  const eventPage = fulfilledItems(eventResult);
  const clubs = fulfilledItems(clubResult);
  const market = fulfilledItems(marketResult);
  const hallOfFameRecords = fulfilledItems(hallOfFameRecordResult);
  const hallOfFameRankings = fulfilledItems(hallOfFameRankingResult);
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
    hallOfFame: {
      records: {
        items: hallOfFameRecords.items.map(toHomeHallOfFameRecord),
        loadFailed: hallOfFameRecords.loadFailed,
      },
      rankings: {
        items: hallOfFameRankings.items.map(toHomeHallOfFameRanking),
        loadFailed: hallOfFameRankings.loadFailed,
      },
      referenceDate,
    },
  };
}
