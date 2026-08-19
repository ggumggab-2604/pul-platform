import "server-only";

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  isClubMediaMimeType,
  validateClubMediaBytes,
  validateClubMediaDeclaration,
  validateClubMediaFilename,
  type ClubMediaMimeType,
} from "@/lib/clubs/clubMediaValidation";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

type JsonObject = Record<string, unknown>;
let serviceClient: SupabaseClient | undefined;

export class MarketMediaStorageError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "MarketMediaStorageError";
  }
}

function service(): SupabaseClient {
  if (serviceClient) return serviceClient;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) throw new MarketMediaStorageError("MARKET_MEDIA_SERVER_UNAVAILABLE");
  serviceClient = createSupabaseClient(getSupabasePublicEnv().url, key, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  return serviceClient;
}

async function user() {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) throw new MarketMediaStorageError("MARKET_MEDIA_AUTHENTICATION_REQUIRED");
  return context;
}

function row(value: unknown): JsonObject {
  const current = Array.isArray(value) ? value[0] : value;
  if (typeof current !== "object" || current === null || Array.isArray(current)) throw new MarketMediaStorageError("MARKET_MEDIA_RESPONSE_INVALID");
  return current as JsonObject;
}

function stringField(value: JsonObject, key: string) {
  if (typeof value[key] !== "string" || value[key].length === 0) throw new MarketMediaStorageError("MARKET_MEDIA_RESPONSE_INVALID");
  return value[key] as string;
}

function numberField(value: JsonObject, key: string) {
  if (typeof value[key] !== "number" || !Number.isSafeInteger(value[key])) throw new MarketMediaStorageError("MARKET_MEDIA_RESPONSE_INVALID");
  return value[key] as number;
}

function rpcFailure(error: { message?: string } | null, fallback: string): never {
  const message = error?.message ?? "";
  if (/로그인/.test(message)) throw new MarketMediaStorageError("MARKET_MEDIA_AUTHENTICATION_REQUIRED");
  if (/본인의|권한/.test(message)) throw new MarketMediaStorageError("MARKET_MEDIA_PERMISSION_DENIED");
  if (/찾을 수 없습니다/.test(message)) throw new MarketMediaStorageError("MARKET_MEDIA_NOT_FOUND");
  if (/JPG|PNG|WebP|8MB|최대/.test(message)) throw new MarketMediaStorageError("MARKET_MEDIA_INPUT_INVALID");
  throw new MarketMediaStorageError(fallback);
}

export async function createMarketMediaUploadIntent(input: {
  listingId: string;
  declaredMimeType: ClubMediaMimeType;
  declaredByteSize: number;
  originalFilename: string;
}) {
  const context = await user();
  const mimeType = validateClubMediaDeclaration(input.declaredMimeType, input.declaredByteSize);
  validateClubMediaFilename(input.originalFilename, mimeType);
  const intentResult = await context.supabase.rpc("create_market_media_upload_intent", {
    p_listing_id: input.listingId,
    p_declared_mime_type: mimeType,
    p_declared_size_bytes: input.declaredByteSize,
  });
  if (intentResult.error) rpcFailure(intentResult.error, "MARKET_MEDIA_UPLOAD_INTENT_FAILED");
  const intent = row(intentResult.data);
  const mediaId = stringField(intent, "media_id");
  if (intent.media_status !== "pending_upload" || numberField(intent, "version") !== 1) throw new MarketMediaStorageError("MARKET_MEDIA_RESPONSE_INVALID");

  const contextResult = await service().rpc("get_market_media_upload_context_server", { p_actor_user_id: context.userId, p_media_id: mediaId });
  if (contextResult.error) rpcFailure(contextResult.error, "MARKET_MEDIA_SIGNED_UPLOAD_FAILED");
  const upload = row(contextResult.data);
  const bucket = stringField(upload, "storage_bucket");
  const path = stringField(upload, "storage_path");
  if (bucket !== "market-media" || stringField(upload, "media_id") !== mediaId || stringField(upload, "declared_mime_type") !== mimeType || numberField(upload, "declared_size_bytes") !== input.declaredByteSize) throw new MarketMediaStorageError("MARKET_MEDIA_RESPONSE_INVALID");
  const signed = await service().storage.from(bucket).createSignedUploadUrl(path, { upsert: false });
  if (signed.error || !signed.data?.token) {
    try {
      await service().rpc("mark_market_media_upload_failed_server", { p_actor_user_id: context.userId, p_media_id: mediaId });
    } catch {
      // Best-effort compensation; the signed upload was never issued.
    }
    throw new MarketMediaStorageError("MARKET_MEDIA_SIGNED_UPLOAD_FAILED");
  }
  return { mediaId, bucket, path, token: signed.data.token, mimeType };
}

export async function finalizeMarketMediaUpload(mediaId: string) {
  const context = await user();
  const contextResult = await service().rpc("get_market_media_upload_context_server", { p_actor_user_id: context.userId, p_media_id: mediaId });
  if (contextResult.error) rpcFailure(contextResult.error, "MARKET_MEDIA_UPLOAD_NOT_AUTHORIZED");
  const upload = row(contextResult.data);
  const bucket = stringField(upload, "storage_bucket");
  const path = stringField(upload, "storage_path");
  const mimeType = stringField(upload, "declared_mime_type");
  const byteSize = numberField(upload, "declared_size_bytes");
  if (bucket !== "market-media" || !isClubMediaMimeType(mimeType)) throw new MarketMediaStorageError("MARKET_MEDIA_RESPONSE_INVALID");
  let bytes: Uint8Array;
  try {
    const downloaded = await service().storage.from(bucket).download(path);
    if (downloaded.error || !downloaded.data) throw new Error("MARKET_MEDIA_OBJECT_MISSING");
    bytes = new Uint8Array(await downloaded.data.arrayBuffer());
    validateClubMediaBytes(bytes, mimeType, byteSize, downloaded.data.type);
  } catch {
    try {
      await service().rpc("mark_market_media_upload_failed_server", { p_actor_user_id: context.userId, p_media_id: mediaId });
    } catch {
      // Best-effort compensation before deleting a rejected object.
    }
    await service().storage.from(bucket).remove([path]).catch(() => undefined);
    throw new MarketMediaStorageError("MARKET_MEDIA_OBJECT_VALIDATION_FAILED");
  }
  const result = await service().rpc("finalize_market_media_upload_server", {
    p_actor_user_id: context.userId,
    p_media_id: mediaId,
    p_verified_mime_type: mimeType,
    p_verified_size_bytes: bytes.byteLength,
  });
  bytes.fill(0);
  if (result.error) {
    await service().storage.from(bucket).remove([path]).catch(() => undefined);
    rpcFailure(result.error, "MARKET_MEDIA_FINALIZE_FAILED");
  }
  const finalized = row(result.data);
  if (stringField(finalized, "media_id") !== mediaId || finalized.media_status !== "available") throw new MarketMediaStorageError("MARKET_MEDIA_RESPONSE_INVALID");
  return { mediaId, status: "available" as const, version: numberField(finalized, "version") };
}

export async function failMarketMediaUpload(mediaId: string) {
  const context = await user();
  await service().rpc("mark_market_media_upload_failed_server", { p_actor_user_id: context.userId, p_media_id: mediaId });
}

export async function removeMarketStoragePaths(paths: string[]) {
  if (paths.length === 0) return;
  const safe = paths.filter((path) => /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/original$/i.test(path));
  if (safe.length !== paths.length) throw new MarketMediaStorageError("MARKET_MEDIA_RESPONSE_INVALID");
  await service().storage.from("market-media").remove(safe);
}
