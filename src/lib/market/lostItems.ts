import type { MarketCategory } from "@/types";

export const lostItemsPath = "/market/lost-items";
export const lostItemRegions = ["서울", "경기", "인천", "충청", "강원", "전라", "경상", "제주"];
export const lostItemButton = "inline-flex min-h-11 items-center justify-center rounded-lg border border-pul-border bg-white px-3 text-sm font-bold text-pul-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pul-point";
export const lostItemInput = "mt-1 block min-h-11 w-full rounded-lg border border-pul-border bg-white px-3 py-2 text-sm font-normal";

export function listingLostItemsHref(category: MarketCategory, listing: string, search: string) {
  const market = new URLSearchParams(search);
  market.set("listing", listing);
  return lostItemsPath + "?" + new URLSearchParams({ category, back: "/market?" + market });
}

export function lostItemBack(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/market?") || value.length > 3000) return "/market";
  // Rebuild the URL from query parameters so the return target stays on this route.
  return "/market?" + new URLSearchParams(value.slice(8));
}

export type LostItemCourse = { course_key: string; name: string; region: string; city: string };
export type LostItemReport = {
  id: string;
  category: MarketCategory;
  item: string;
  brand: string;
  model: string;
  color: string;
  region: string;
  place: string;
  lost_on: string;
  created_at: string;
  features: string;
  course_key: string | null;
  course_name: string | null;
  course_type: "field" | "screen" | null;
  post_key: string | null;
  resolved: boolean;
  handled_at: string | null;
  mine: boolean;
  can_message: boolean;
  photos: string[];
};
