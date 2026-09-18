import "server-only";

import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

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
  if (!key)
    throw new MarketMediaStorageError("MARKET_MEDIA_SERVER_UNAVAILABLE");
  serviceClient = createSupabaseClient(getSupabasePublicEnv().url, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  return serviceClient;
}

async function user() {
  const context = await getAuthenticatedSupabaseContext();
  if (!context)
    throw new MarketMediaStorageError("MARKET_MEDIA_AUTHENTICATION_REQUIRED");
  return context;
}

function row(value: unknown): JsonObject {
  const current = Array.isArray(value) ? value[0] : value;
  if (typeof current !== "object" || current === null || Array.isArray(current))
    throw new MarketMediaStorageError("MARKET_MEDIA_RESPONSE_INVALID");
  return current as JsonObject;
}

function stringField(value: JsonObject, key: string) {
  if (typeof value[key] !== "string" || value[key].length === 0)
    throw new MarketMediaStorageError("MARKET_MEDIA_RESPONSE_INVALID");
  return value[key] as string;
}

function numberField(value: JsonObject, key: string) {
  if (typeof value[key] !== "number" || !Number.isSafeInteger(value[key]))
    throw new MarketMediaStorageError("MARKET_MEDIA_RESPONSE_INVALID");
  return value[key] as number;
}

function rpcFailure(
  error: { message?: string } | null,
  fallback: string,
): never {
  const message = error?.message ?? "";
  if (/로그인/.test(message))
    throw new MarketMediaStorageError("MARKET_MEDIA_AUTHENTICATION_REQUIRED");
  if (/본인의|권한/.test(message))
    throw new MarketMediaStorageError("MARKET_MEDIA_PERMISSION_DENIED");
  if (/찾을 수 없습니다/.test(message))
    throw new MarketMediaStorageError("MARKET_MEDIA_NOT_FOUND");
  if (/JPG|PNG|WebP|8MB|최대/.test(message))
    throw new MarketMediaStorageError("MARKET_MEDIA_INPUT_INVALID");
  throw new MarketMediaStorageError(fallback);
}

export async function createMarketMediaUploadIntent(input: {
  listingId: string;
  declaredMimeType: ClubMediaMimeType;
  declaredByteSize: number;
  originalFilename: string;
}) {
  const context = await user();
  const mimeType = validateClubMediaDeclaration(
    input.declaredMimeType,
    input.declaredByteSize,
  );
  validateClubMediaFilename(input.originalFilename, mimeType);
  const intentResult = await context.supabase.rpc(
    "create_market_media_upload_intent",
    {
      p_listing_id: input.listingId,
      p_declared_mime_type: mimeType,
      p_declared_size_bytes: input.declaredByteSize,
    },
  );
  if (intentResult.error)
    rpcFailure(intentResult.error, "MARKET_MEDIA_UPLOAD_INTENT_FAILED");
  const intent = row(intentResult.data);
  const mediaId = stringField(intent, "media_id");
  if (
    intent.media_status !== "pending_upload" ||
    numberField(intent, "version") !== 1
  )
    throw new MarketMediaStorageError("MARKET_MEDIA_RESPONSE_INVALID");

  const contextResult = await service().rpc(
    "get_market_media_upload_context_server",
    { p_actor_user_id: context.userId, p_media_id: mediaId },
  );
  if (contextResult.error)
    rpcFailure(contextResult.error, "MARKET_MEDIA_SIGNED_UPLOAD_FAILED");
  const upload = row(contextResult.data);
  const bucket = stringField(upload, "storage_bucket");
  const path = stringField(upload, "storage_path");
  if (
    bucket !== "market-media" ||
    stringField(upload, "media_id") !== mediaId ||
    stringField(upload, "declared_mime_type") !== mimeType ||
    numberField(upload, "declared_size_bytes") !== input.declaredByteSize
  )
    throw new MarketMediaStorageError("MARKET_MEDIA_RESPONSE_INVALID");
  if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/original$/i.test(path))
    throw new MarketMediaStorageError("MARKET_MEDIA_RESPONSE_INVALID");
  const signed = await service()
    .storage.from(bucket)
    .createSignedUploadUrl(path, { upsert: false });
  if (signed.error || !signed.data?.token) {
    try {
      await service().rpc("mark_market_media_upload_failed_server", {
        p_actor_user_id: context.userId,
        p_media_id: mediaId,
      });
    } catch {
      // Best-effort compensation; the signed upload was never issued.
    }
    throw new MarketMediaStorageError("MARKET_MEDIA_SIGNED_UPLOAD_FAILED");
  }
  return { mediaId, bucket, path, token: signed.data.token, mimeType };
}

export async function finalizeMarketMediaUpload(mediaId: string) {
  const context = await user();
  const media = await readMarketMediaState(context.userId, mediaId);
  if (
    !["selling", "reserved"].includes(media.listingStatus) ||
    (media.status !== "pending_upload" && media.status !== "available")
  ) {
    await cleanupMarketMediaUpload(mediaId).catch(() => false);
    throw new MarketMediaStorageError("MARKET_MEDIA_UPLOAD_NOT_AUTHORIZED");
  }
  // This candidate-only RPC includes the version of the verified metadata.
  // Never broaden the old app's pending-only upload context to recover success.
  if (media.status === "available")
    return { mediaId, status: "available" as const, version: media.version };
  const { bucket, path, mimeType, byteSize } = media;
  let bytes: Uint8Array | undefined;
  if (media.status === "pending_upload") {
    const downloaded = await service().storage.from(bucket).download(path);
    if (downloaded.error || !downloaded.data) {
      // Only a definite missing object is terminal. Timeouts/5xx preserve intent.
      if (
        downloaded.error &&
        (downloaded.error.status === 404 ||
          ["404", "NoSuchKey"].includes(String(downloaded.error.statusCode)))
      ) {
        await failMarketMediaUpload(mediaId);
      }
      throw new MarketMediaStorageError("MARKET_MEDIA_DOWNLOAD_UNAVAILABLE");
    }
    bytes = new Uint8Array(await downloaded.data.arrayBuffer());
    try {
      validateClubMediaBytes(bytes, mimeType, byteSize, downloaded.data.type);
    } catch {
      bytes.fill(0);
      // A concurrent successful finalize must never lose its object.
      try {
        await service().rpc("mark_market_media_upload_failed_server", {
          p_actor_user_id: context.userId,
          p_media_id: mediaId,
        });
        if ((await getMarketMediaState(mediaId)) === "failed")
          await service().storage.from(bucket).remove([path]);
      } catch {
        /* Keep uncertain state available for reconciliation. */
      }
      throw new MarketMediaStorageError(
        "MARKET_MEDIA_OBJECT_VALIDATION_FAILED",
      );
    }
  }
  const result = await service().rpc("finalize_market_media_upload_server", {
    p_actor_user_id: context.userId,
    p_media_id: mediaId,
    p_verified_mime_type: mimeType,
    p_verified_size_bytes: bytes?.byteLength ?? byteSize,
  });
  bytes?.fill(0);
  if (result.error) {
    // The response may be lost after commit; the caller checks state and retries.
    await cleanupMarketMediaUpload(mediaId).catch(() => false);
    rpcFailure(result.error, "MARKET_MEDIA_FINALIZE_FAILED");
  }
  const finalized = row(result.data);
  if (
    stringField(finalized, "media_id") !== mediaId ||
    finalized.media_status !== "available"
  )
    throw new MarketMediaStorageError("MARKET_MEDIA_RESPONSE_INVALID");
  return {
    mediaId,
    status: "available" as const,
    version: numberField(finalized, "version"),
  };
}

export async function failMarketMediaUpload(mediaId: string) {
  const context = await user();
  const result = await service().rpc("mark_market_media_upload_failed_server", {
    p_actor_user_id: context.userId,
    p_media_id: mediaId,
  });
  if (result.error)
    throw new MarketMediaStorageError("MARKET_MEDIA_STATE_UNAVAILABLE");
  return cleanupMarketMediaUpload(mediaId);
}

export async function cleanupMarketMediaUpload(mediaId: string) {
  const context = await user();
  const result = await service().rpc("get_market_media_cleanup_path_server", {
    p_actor_user_id: context.userId,
    p_media_id: mediaId,
  });
  if (result.error || typeof result.data !== "string") return false;
  return removeMarketStoragePaths([result.data]);
}

export async function removeMarketStoragePaths(paths: string[]) {
  if (paths.length === 0) return true;
  const safe = paths.filter((path) =>
    /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/original$/i.test(path),
  );
  if (safe.length !== paths.length)
    throw new MarketMediaStorageError("MARKET_MEDIA_RESPONSE_INVALID");
  try {
    const result = await service().storage.from("market-media").remove(safe);
    return !result.error;
  } catch {
    return false;
  }
}

async function readMarketMediaState(actorUserId: string, mediaId: string) {
  const result = await service().rpc("get_market_media_state_server", {
    p_actor_user_id: actorUserId,
    p_media_id: mediaId,
  });
  if (result.error)
    throw new MarketMediaStorageError("MARKET_MEDIA_STATE_UNAVAILABLE");
  if (!Array.isArray(result.data) || result.data.length !== 1)
    throw new MarketMediaStorageError("MARKET_MEDIA_NOT_FOUND");
  const media = row(result.data);
  const bucket = stringField(media, "storage_bucket");
  const path = stringField(media, "storage_path");
  const mimeType = stringField(media, "declared_mime_type");
  const byteSize = numberField(media, "declared_size_bytes");
  const status = stringField(media, "media_status");
  const version = numberField(media, "media_version");
  const listingStatus = stringField(media, "listing_status");
  if (
    stringField(media, "media_id") !== mediaId ||
    bucket !== "market-media" ||
    !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/original$/i.test(path) ||
    path.split("/")[1] !== mediaId ||
    !isClubMediaMimeType(mimeType) ||
    byteSize < 1 || byteSize > 8388608 || version < 1 ||
    !["pending_upload", "available", "failed", "removed"].includes(status) ||
    !["selling", "reserved", "sold", "removed"].includes(listingStatus)
  )
    throw new MarketMediaStorageError("MARKET_MEDIA_RESPONSE_INVALID");
  return {
    bucket, path, mimeType, byteSize, version, listingStatus,
    status: status as "pending_upload" | "available" | "failed" | "removed",
  };
}

export async function getMarketMediaState(mediaId: string) {
  const context = await user();
  return (await readMarketMediaState(context.userId, mediaId)).status;
}
