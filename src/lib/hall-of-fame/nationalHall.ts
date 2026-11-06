import type { SupabaseClient } from "@supabase/supabase-js";

import type { SpecialType } from "./hallSpecialRecords";

export const scorePeriods = {
  month: "이번 달 최저타",
  year: "최근 1년 평균",
  all: "역대 최저타",
} as const;

export const specialPeriods = {
  all: "누적",
  week: "이번 주",
  month: "이번 달",
  year: "올해",
} as const;

export type ScorePeriod = keyof typeof scorePeriods;
export type SpecialPeriod = keyof typeof specialPeriods;
export type HallPerson = { name: string; club: string | null; course: string; date: string };
export type NationalScore = HallPerson & {
  rank: number; score: number; tied: boolean; direction: "up" | "down" | null;
};
export type NationalScores = { date: string; total: number; items: NationalScore[] };
export type NationalSpecial = HallPerson & {
  id: string; type: SpecialType; segment: string; hole: number; photos: string[];
};
export type SpecialResults = {
  counts: Record<SpecialType, number>;
  yearCount: number;
  yearCondor: HallPerson | null;
  total: number;
  items: NationalSpecial[];
  leaders: { rank: number; name: string; count: number }[];
};
export type TournamentAward = {
  id: string;
  eventKey: string | null;
  title: string;
  date: string;
  gameType: "field" | "screen";
  winners: {
    name: string; club: string; course: string; division: string; place: number; tied: boolean; score: number;
    newsId: string | null;
  }[];
};
export type TournamentAwards = { latest: TournamentAward[]; items: TournamentAward[] };
export type LatestHallRecord = HallPerson & {
  kind: "score" | "award" | "special"; label: string; score: number | null; newsId: string | null;
};

async function readHall<T>(client: SupabaseClient, name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(name, args);
  if (error || data == null) throw new Error("명예 기록을 불러오지 못했습니다.");
  return data as T;
}

export function loadNationalScores(client: SupabaseClient, period: ScorePeriod | "today", limit = 20, offset = 0) {
  return readHall<NationalScores>(client, "get_hall_national_scores", { p_period: period, p_limit: limit, p_offset: offset });
}

export function loadNationalSpecial(client: SupabaseClient, type: SpecialType | null, period: SpecialPeriod, limit = 20, offset = 0) {
  return readHall<SpecialResults>(client, "get_hall_national_special", { p_type: type, p_period: period, p_limit: limit, p_offset: offset });
}

export function loadTournamentAwards(client: SupabaseClient, year: number, month: number | null, eventKey?: string) {
  return readHall<TournamentAwards>(client, "get_hall_tournament_awards", { p_year: year, p_month: month, p_event_key: eventKey ?? null });
}

export function loadLatestHallRecords(client: SupabaseClient) {
  return readHall<LatestHallRecord[]>(client, "get_hall_latest_records");
}

export function hallHref(query: Record<string, string | number | null | undefined> = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value != null) params.set(key, String(value));
  }
  return params.size ? `/hall-of-fame?${params}` : "/hall-of-fame";
}
