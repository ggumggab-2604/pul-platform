import type { MarketView } from "./marketNavigation";

// Existing listing placements retain their audience. New landing placements
// require an explicit assignment in the existing banner manager.
export function marketPromotionSlots(view: MarketView, search: string): readonly string[] {
  if (view === "home") return ["market.home_bottom.01"];
  if (view === "business") {
    const params = new URLSearchParams(search);
    const detailOrWrite = params.get("business_tab") === "stores"
      ? Boolean(params.get("store")) || params.get("store_write") === "1"
      : Boolean(params.get("question")) || params.get("qa_write") === "1";
    return detailOrWrite ? [] : ["market.business_bottom.01"];
  }
  return ["sale", "buy", "startup"].includes(view)
    ? ["market.list_top.01", "market.after_list.01"]
    : [];
}

