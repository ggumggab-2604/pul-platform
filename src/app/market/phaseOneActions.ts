"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  getBuyRequestV2,
  getStartupContextV2,
  getStartupV2,
  listBuyRequestsV2,
  mutateBuyRequestV2,
  mutateStartupV2,
  type BuyRequestInputV2,
  type StartupInputV2,
} from "@/lib/market/marketPhaseOne";
import type {
  MarketBuyRequestOperation,
  MarketStartupPostOperation,
} from "@/lib/market/market";
import type { MarketQuery } from "@/lib/market/marketNavigation";
import {
  createStartupMediaUploadIntent,
  failStartupMediaUpload,
  finalizeStartupMediaUpload,
  removeStartupStoragePaths,
  cleanupStartupMediaUpload,
  reconcileStartupMedia,
} from "@/lib/market/marketStartupStorage";
import { getStartupMediaState } from "@/lib/market/marketStartupStorage";
import {
  cleanupMarketMediaUpload,
  getMarketMediaState,
} from "@/lib/market/marketStorage";
export async function cleanupMarketMediaAction(
  kind: "listing" | "startup",
  id: string,
) {
  return kind === "startup"
    ? cleanupStartupMediaUpload(id)
    : cleanupMarketMediaUpload(id);
}
export async function marketMediaStateAction(
  kind: "listing" | "startup",
  id: string,
) {
  return kind === "startup"
    ? getStartupMediaState(id)
    : getMarketMediaState(id);
}
export async function listBuyRequestsV2Action(
  filters: MarketQuery,
  limit = 24,
  offset = 0,
) {
  return listBuyRequestsV2(await createClient(), filters, limit, offset);
}
export async function getBuyRequestV2Action(id: string) {
  return getBuyRequestV2(await createClient(), id);
}
export async function getStartupV2Action(key: string) {
  await reconcileStartupMedia().catch(() => undefined);
  return getStartupV2(await createClient(), key);
}
export async function getStartupContextV2Action(key: string) {
  return getStartupContextV2(await createClient(), key);
}
export async function mutateBuyRequestV2Action(input: {
  operation: MarketBuyRequestOperation;
  id: string | null;
  version: number | null;
  payload: BuyRequestInputV2 | null;
  requestId: string;
}) {
  const result = await mutateBuyRequestV2(
    await createClient(),
    input.operation,
    input.id,
    input.version,
    input.payload,
    input.requestId,
  );
  revalidatePath("/market");
  return result;
}
export async function mutateStartupV2Action(input: {
  operation: MarketStartupPostOperation;
  postKey: string | null;
  version: number | null;
  payload: StartupInputV2 | null;
  requestId: string;
}) {
  const result = await mutateStartupV2(
    await createClient(),
    input.operation,
    input.postKey,
    input.version,
    input.payload,
    input.requestId,
  );
  const cleanupPending =
    result.removedStoragePaths.length > 0
      ? !(await removeStartupStoragePaths(result.removedStoragePaths))
      : false;
  await reconcileStartupMedia().catch(() => undefined);
  revalidatePath("/market");
  return { ...result, cleanupPending };
}
export async function createStartupMediaUploadIntentAction(
  input: Parameters<typeof createStartupMediaUploadIntent>[0],
) {
  return createStartupMediaUploadIntent(input);
}
export async function finalizeStartupMediaUploadAction(id: string) {
  const result = await finalizeStartupMediaUpload(id);
  revalidatePath("/market");
  return result;
}
export async function failStartupMediaUploadAction(id: string) {
  return failStartupMediaUpload(id);
}
