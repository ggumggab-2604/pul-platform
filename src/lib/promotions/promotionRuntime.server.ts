import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";

import {
  getActivePromotionsForSlots,
  getPublicPromotionDetail,
  type ActiveSlotPromotion,
  type PublicPromotionDetail,
} from "@/lib/promotions/promotionDirectory";
import { createClient } from "@/lib/supabase/server";

export async function loadActivePromotionsForSlots(
  client: SupabaseClient,
  slotCodes: readonly string[],
): Promise<ActiveSlotPromotion[]> {
  try {
    return await getActivePromotionsForSlots(client, slotCodes);
  } catch {
    return [];
  }
}

export const loadPublicPromotionDetail = cache(
  async (slug: string): Promise<PublicPromotionDetail | null> => {
    try {
      return await getPublicPromotionDetail(await createClient(), slug);
    } catch {
      return null;
    }
  },
);
