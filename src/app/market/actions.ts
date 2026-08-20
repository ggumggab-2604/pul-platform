"use server";

import { revalidatePath } from "next/cache";

import {
  listMarketBuyRequests,
  listMarketListings,
  listMarketStartupPosts,
  getMarketStartupPost,
  getMyMarketStartupPostMutationContext,
  mutateMarketBuyRequest,
  mutateMarketListing,
  mutateMarketStartupPost,
  type MarketBuyRequestInput,
  type MarketBuyRequestOperation,
  type MarketListingFilters,
  type MarketListingInput,
  type MarketListingOperation,
  type MarketStartupPostFilters,
  type MarketStartupPostInput,
  type MarketStartupPostOperation,
} from "@/lib/market/market";
import {
  createMarketMediaUploadIntent,
  failMarketMediaUpload,
  finalizeMarketMediaUpload,
  removeMarketStoragePaths,
} from "@/lib/market/marketStorage";
import { createClient } from "@/lib/supabase/server";

export async function listMarketListingsAction(filters: MarketListingFilters, limit = 24, offset = 0) {
  return listMarketListings(await createClient(), filters, limit, offset);
}

export async function listMarketBuyRequestsAction(limit = 24, offset = 0) {
  return listMarketBuyRequests(await createClient(), limit, offset);
}

export async function listMarketStartupPostsAction(filters: MarketStartupPostFilters, limit = 24, offset = 0) {
  return listMarketStartupPosts(await createClient(), filters, limit, offset);
}

export async function getMarketStartupPostAction(postKey: string) {
  return getMarketStartupPost(await createClient(), postKey);
}

export async function getMyMarketStartupPostMutationContextAction(postKey: string) {
  return getMyMarketStartupPostMutationContext(await createClient(), postKey);
}

export async function mutateMarketListingAction(input: {
  operation: MarketListingOperation;
  listingId: string | null;
  expectedVersion: number | null;
  payload: MarketListingInput | null;
  requestId: string;
}) {
  const result = await mutateMarketListing(await createClient(), input.operation, input.listingId, input.expectedVersion, input.payload, input.requestId);
  if (input.operation === "delete" && result.removedStoragePaths.length > 0) await removeMarketStoragePaths(result.removedStoragePaths);
  revalidatePath("/market");
  return result;
}

export async function mutateMarketBuyRequestAction(input: {
  operation: MarketBuyRequestOperation;
  buyRequestId: string | null;
  expectedVersion: number | null;
  payload: MarketBuyRequestInput | null;
  requestId: string;
}) {
  const result = await mutateMarketBuyRequest(await createClient(), input.operation, input.buyRequestId, input.expectedVersion, input.payload, input.requestId);
  revalidatePath("/market");
  return result;
}

export async function mutateMarketStartupPostAction(input: {
  operation: MarketStartupPostOperation;
  postKey: string | null;
  expectedVersion: number | null;
  payload: MarketStartupPostInput | null;
}) {
  const result = await mutateMarketStartupPost(
    await createClient(),
    input.operation,
    input.postKey,
    input.expectedVersion,
    input.payload,
  );
  revalidatePath("/market");
  return result;
}

export async function createMarketMediaUploadIntentAction(input: Parameters<typeof createMarketMediaUploadIntent>[0]) {
  return createMarketMediaUploadIntent(input);
}
export async function finalizeMarketMediaUploadAction(mediaId: string) {
  return finalizeMarketMediaUpload(mediaId);
}
export async function failMarketMediaUploadAction(mediaId: string) {
  return failMarketMediaUpload(mediaId);
}
