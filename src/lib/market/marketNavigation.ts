export const marketViews = [
  "home",
  "sale",
  "buy",
  "startup",
  "care",
  "business",
  "price",
  "guide",
  "safety",
] as const;
export type MarketView = (typeof marketViews)[number];
export type MarketQuery = {
  view: MarketView;
  keyword: string;
  category: string;
  region: string;
  status: string;
  requestType?: "all" | "buy" | "exchange";
};
const categories = [
  "club",
  "ball",
  "bag",
  "apparel",
  "shoes",
  "practice",
  "other",
];
const startupCategories = [
  "screenStartup",
  "screenResale",
  "fieldCourseDevelopment",
  "idleLandUse",
  "constructionFacility",
];
const regions = [
  "서울",
  "경기",
  "인천",
  "충청",
  "강원",
  "전라",
  "경상",
  "제주",
];
export const anchorViews: Record<string, MarketView> = {
  "#market-all-listings": "sale",
  "#market-price-guide": "price",
  "#market-buy-guide": "guide",
  "#market-safety": "safety",
  "#equipment-care": "care",
};
export function parseMarketQuery(
  params: URLSearchParams,
  hash = "",
): MarketQuery {
  const requested = params.get("view");
  const view =
    anchorViews[hash] ??
    (marketViews.includes(requested as MarketView)
      ? (requested as MarketView)
      : "home");
  const prefix = `${view}_`;
  const allowedCategories = view === "startup" ? startupCategories : categories;
  const allowedStatuses =
    view === "sale"
      ? ["selling", "reserved", "sold"]
      : view === "buy"
        ? ["open", "closed"]
        : [];
  return {
    view,
    keyword: (params.get(`${prefix}q`) ?? "").trim().slice(0, 100),
    category: allowedCategories.includes(params.get(`${prefix}category`) ?? "")
      ? params.get(`${prefix}category`)!
      : "all",
    region: (view === "sale" || view === "buy" ? [...regions, "전국"] : regions).includes(params.get(`${prefix}region`) ?? "")
      ? params.get(`${prefix}region`)!
      : "전체",
    requestType: view === "buy" && ["buy","exchange"].includes(params.get("buy_type")??"") ? params.get("buy_type") as "buy"|"exchange" : "all",
    status: allowedStatuses.includes(params.get(`${prefix}status`) ?? "")
      ? params.get(`${prefix}status`)!
      : "all",
  };
}
export function marketHref(
  current: string,
  view: MarketView,
  filters?: Omit<MarketQuery, "view">,
) {
  const source = new URLSearchParams(current);
  const clean = new URLSearchParams();
  for (const key of ["care_q","care_region","care_field","care_offset","qa_q","qa_category","qa_offset","store_q","store_region","store_status","store_offset"]) { const value=source.get(key); if(value)clean.set(key,value); }
  for (const board of ["sale", "buy", "startup"] as const) {
    const selected = new URLSearchParams(source);
    selected.set("view", board);
    const value =
      filters && board === view ? filters : parseMarketQuery(selected);
    if(board === "buy" && value.requestType && value.requestType !== "all") clean.set("buy_type",value.requestType);
    if (value.keyword.trim())
      clean.set(`${board}_q`, value.keyword.trim().slice(0, 100));
    if (value.category !== "all")
      clean.set(`${board}_category`, value.category);
    if (value.region !== "전체") clean.set(`${board}_region`, value.region);
    if (value.status !== "all") clean.set(`${board}_status`, value.status);
  }
  if (view !== "home") clean.set("view", view);
  return `/market${clean.size ? `?${clean}` : ""}`;
}
/** Filters and auth changes invalidate the initial request and any in-flight pagination. */
export class MarketRequestEpoch {
  private generation = 0;
  next() {
    return ++this.generation;
  }
  current(ticket: number) {
    return ticket === this.generation;
  }
}
