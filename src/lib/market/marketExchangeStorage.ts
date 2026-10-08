import { validatePhotoBytes } from "@/lib/images/validatePhotoBytes";
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

export class ExchangeMediaStorageError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ExchangeMediaStorageError";
  }
}

function service(): SupabaseClient {
  if (serviceClient) return serviceClient;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key)
    throw new ExchangeMediaStorageError("MARKET_MEDIA_SERVER_UNAVAILABLE");
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
    throw new ExchangeMediaStorageError("MARKET_MEDIA_AUTHENTICATION_REQUIRED");
  return context;
}

function row(value: unknown): JsonObject {
  const current = Array.isArray(value) ? value[0] : value;
  if (typeof current !== "object" || current === null || Array.isArray(current))
    throw new ExchangeMediaStorageError("MARKET_MEDIA_RESPONSE_INVALID");
  return current as JsonObject;
}

function stringField(value: JsonObject, key: string) {
  if (typeof value[key] !== "string" || value[key].length === 0)
    throw new ExchangeMediaStorageError("MARKET_MEDIA_RESPONSE_INVALID");
  return value[key] as string;
}

function numberField(value: JsonObject, key: string) {
  if (typeof value[key] !== "number" || !Number.isSafeInteger(value[key]))
    throw new ExchangeMediaStorageError("MARKET_MEDIA_RESPONSE_INVALID");
  return value[key] as number;
}

function rpcFailure(
  error: { message?: string } | null,
  fallback: string,
): never {
  const message = error?.message ?? "";
  if (/로그인/.test(message))
    throw new ExchangeMediaStorageError("MARKET_MEDIA_AUTHENTICATION_REQUIRED");
  if (/본인의|권한/.test(message))
    throw new ExchangeMediaStorageError("MARKET_MEDIA_PERMISSION_DENIED");
  if (/찾을 수 없습니다/.test(message))
    throw new ExchangeMediaStorageError("MARKET_MEDIA_NOT_FOUND");
  if (/JPG|PNG|WebP|8MB|최대/.test(message))
    throw new ExchangeMediaStorageError("MARKET_MEDIA_INPUT_INVALID");
  throw new ExchangeMediaStorageError(fallback);
}

export async function createExchangeMediaUploadIntent(input: {
  buyRequestId: string;
  requestId: string;
  declaredMimeType: ClubMediaMimeType;
  declaredByteSize: number;
  originalFilename: string;
}) {
  const context = await user();
  service(); // Fail before allocating a reservation if the server signer is unavailable.
  const mimeType = validateClubMediaDeclaration(
    input.declaredMimeType,
    input.declaredByteSize,
  );
  validateClubMediaFilename(input.originalFilename, mimeType);
  const intentResult = await context.supabase.rpc(
    "create_market_exchange_media_upload_intent",
    {
      p_buy_request_id: input.buyRequestId,
      p_request_id: input.requestId,
      p_declared_mime_type: mimeType,
      p_declared_size_bytes: input.declaredByteSize,
    },
  );
  if (intentResult.error)
    rpcFailure(intentResult.error, "MARKET_MEDIA_UPLOAD_INTENT_FAILED");
  const intent = row(intentResult.data);
  const mediaId = stringField(intent, "media_id");
  if (intent.media_status === "failed" || intent.media_status === "removed") {
    if(await cleanupExchangeMediaUpload(mediaId)) throw new ExchangeMediaStorageError("EXCHANGE_MEDIA_TERMINAL_CLEANED");
    throw new ExchangeMediaStorageError("MARKET_MEDIA_STATE_UNAVAILABLE");
  }
  if(!["pending_upload","available"].includes(String(intent.media_status)) || numberField(intent,"version")<1) throw new ExchangeMediaStorageError("MARKET_MEDIA_RESPONSE_INVALID");
  const contextResult = await service().rpc(
    "get_market_exchange_media_upload_context_server",
    { p_actor_user_id: context.userId, p_media_id: mediaId },
  );
  if (contextResult.error)
    rpcFailure(contextResult.error, "MARKET_MEDIA_SIGNED_UPLOAD_FAILED");
  const upload = row(contextResult.data);
  const bucket = stringField(upload, "storage_bucket");
  const path = stringField(upload, "storage_path");
  if (
    bucket !== "market-exchange-media" ||
    stringField(upload, "media_id") !== mediaId ||
    stringField(upload, "declared_mime_type") !== mimeType ||
    numberField(upload, "declared_size_bytes") !== input.declaredByteSize
  )
    throw new ExchangeMediaStorageError("MARKET_MEDIA_RESPONSE_INVALID");
  if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/original$/.test(path))
    throw new ExchangeMediaStorageError("MARKET_MEDIA_RESPONSE_INVALID");
  if(intent.media_status === "available") return {mediaId,bucket,path,token:"",mimeType};
  const signed = await service()
    .storage.from(bucket)
    .createSignedUploadUrl(path, { upsert: false });
  if (signed.error || !signed.data?.token) {
    throw new ExchangeMediaStorageError("MARKET_MEDIA_SIGNED_UPLOAD_FAILED");
  }
  return { mediaId, bucket, path, token: signed.data.token, mimeType };
}

export async function finalizeExchangeMediaUpload(mediaId: string) {
  const context = await user();
  const contextResult = await service().rpc(
    "get_market_exchange_media_upload_context_server",
    { p_actor_user_id: context.userId, p_media_id: mediaId },
  );
  if (
    contextResult.error ||
    !Array.isArray(contextResult.data) ||
    contextResult.data.length === 0
  ) {
    // A late upload may have succeeded after the post was removed. Only an
    // owner-scoped terminal path may be cleaned; never delete available media.
    await cleanupExchangeMediaUpload(mediaId).catch(() => false);
    rpcFailure(contextResult.error, "MARKET_MEDIA_UPLOAD_NOT_AUTHORIZED");
  }
  const upload = row(contextResult.data);
  const bucket = stringField(upload, "storage_bucket");
  const path = stringField(upload, "storage_path");
  const mimeType = stringField(upload, "declared_mime_type");
  const byteSize = numberField(upload, "declared_size_bytes");
  if (
    bucket !== "market-exchange-media" ||
    !isClubMediaMimeType(mimeType) ||
    stringField(upload, "media_id") !== mediaId ||
    !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/original$/i.test(path)
  )
    throw new ExchangeMediaStorageError("MARKET_MEDIA_RESPONSE_INVALID");
  // Available objects have already passed byte validation. Do not download or
  // delete them again when recovering a lost finalize response.
  const state = await getExchangeMediaState(mediaId);
  if (state !== "pending_upload" && state !== "available")
    throw new ExchangeMediaStorageError("MARKET_MEDIA_UPLOAD_NOT_AUTHORIZED");
  let bytes: Uint8Array | undefined;
  if (state === "pending_upload") {
    const downloaded = await service().storage.from(bucket).download(path);
    if (downloaded.error || !downloaded.data) {
      // Only a definite missing object is terminal. Timeouts/5xx preserve intent.
      if (
        downloaded.error &&
        (downloaded.error.status === 404 ||
          ["404", "NoSuchKey"].includes(String(downloaded.error.statusCode)))
      ) {
        await failExchangeMediaUpload(mediaId);
      }
      throw new ExchangeMediaStorageError("MARKET_MEDIA_DOWNLOAD_UNAVAILABLE");
    }
    bytes = new Uint8Array(await downloaded.data.arrayBuffer());
    try {
      validateClubMediaBytes(bytes, mimeType, byteSize, downloaded.data.type);
    await validatePhotoBytes(bytes, mimeType, "photo");
    } catch {
      bytes.fill(0);
      // A concurrent successful finalize must never lose its object.
      try {
        await service().rpc("mark_market_exchange_media_upload_failed_server", {
          p_actor_user_id: context.userId,
          p_media_id: mediaId,
        });
        if ((await getExchangeMediaState(mediaId)) === "failed")
          await service().storage.from(bucket).remove([path]);
      } catch {
        /* Keep uncertain state available for reconciliation. */
      }
      throw new ExchangeMediaStorageError(
        "MARKET_MEDIA_OBJECT_VALIDATION_FAILED",
      );
    }
  }
  const result = await service().rpc(
    "finalize_market_exchange_media_upload_server",
    {
      p_actor_user_id: context.userId,
      p_media_id: mediaId,
      p_verified_mime_type: mimeType,
      p_verified_size_bytes: bytes?.byteLength ?? byteSize,
    },
  );
  bytes?.fill(0);
  if (result.error) {
    // The response may be lost after commit; the caller checks state and retries.
    await cleanupExchangeMediaUpload(mediaId).catch(() => false);
    rpcFailure(result.error, "MARKET_MEDIA_FINALIZE_FAILED");
  }
  const finalized = row(result.data);
  if (
    stringField(finalized, "media_id") !== mediaId ||
    finalized.media_status !== "available"
  )
    throw new ExchangeMediaStorageError("MARKET_MEDIA_RESPONSE_INVALID");
  return {
    mediaId,
    status: "available" as const,
    version: numberField(finalized, "version"),
  };
}

export async function failExchangeMediaUpload(mediaId: string) {
  const context = await user();
  const result = await service().rpc(
    "mark_market_exchange_media_upload_failed_server",
    {
      p_actor_user_id: context.userId,
      p_media_id: mediaId,
    },
  );
  if (result.error)
    throw new ExchangeMediaStorageError("MARKET_MEDIA_STATE_UNAVAILABLE");
  return cleanupExchangeMediaUpload(mediaId);
}

export async function cleanupExchangeMediaUpload(mediaId: string) {
  const context = await user();
  const result = await service().rpc(
    "get_market_exchange_media_cleanup_path_server",
    {
      p_actor_user_id: context.userId,
      p_media_id: mediaId,
    },
  );
  if (result.error || typeof result.data !== "string") return false;
  return removeExchangeStoragePaths([result.data]);
}

export async function removeExchangeStoragePaths(paths: string[]) {
  if (paths.length === 0) return true;
  const safe = paths.filter((path) =>
    /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/original$/i.test(path),
  );
  if (safe.length !== paths.length)
    throw new ExchangeMediaStorageError("MARKET_MEDIA_RESPONSE_INVALID");
  try {
    const result = await service()
      .storage.from("market-exchange-media")
      .remove(safe);
    return !result.error;
  } catch {
    return false;
  }
}

export async function getExchangeMediaState(mediaId: string) {
  const context = await user();
  const result = await service().rpc("get_market_exchange_media_state_server", {
    p_actor_user_id: context.userId,
    p_media_id: mediaId,
  });
  if (result.error)
    throw new ExchangeMediaStorageError("MARKET_MEDIA_STATE_UNAVAILABLE");
  if (
    !["pending_upload", "available", "failed", "removed"].includes(result.data)
  )
    throw new ExchangeMediaStorageError("MARKET_MEDIA_NOT_FOUND");
  return result.data as "pending_upload" | "available" | "failed" | "removed";
}

// One minute covers image retrieval without a long-lived bearer URL. The route
// streams the response with no-store instead of exposing/caching Storage URLs.
export const EXCHANGE_MEDIA_READ_TTL_SECONDS = 60;
export async function createExchangeMediaReadUrl(
  buyRequestId: string,
  mediaId: string,
) {
  const args = { p_buy_request_id: buyRequestId, p_media_id: mediaId };
  const context = await service().rpc(
    "get_market_exchange_media_read_context_server",
    args,
  );
  if (context.error)
    throw new ExchangeMediaStorageError("MARKET_MEDIA_READ_UNAVAILABLE");
  if (typeof context.data !== "string") return null;
  if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/original$/.test(context.data))
    throw new ExchangeMediaStorageError("MARKET_MEDIA_RESPONSE_INVALID");
  const signed = await service()
    .storage.from("market-exchange-media")
    .createSignedUrl(context.data, EXCHANGE_MEDIA_READ_TTL_SECONDS);
  if (signed.error || !signed.data?.signedUrl)
    throw new ExchangeMediaStorageError("MARKET_MEDIA_READ_UNAVAILABLE");
  // Close the signing round-trip race as far as possible. A hide after this
  // check still has the documented in-flight response / TTL limitation.
  const current = await service().rpc(
    "get_market_exchange_media_read_context_server",
    args,
  );
  if (current.error)
    throw new ExchangeMediaStorageError("MARKET_MEDIA_READ_UNAVAILABLE");
  return current.data === context.data ? signed.data.signedUrl : null;
}

/** Retry only this authenticated owner's deleted post. Terminal metadata stays
 * available for retries, including a late write by an outstanding upload token. */
export async function reconcileExchangeMedia(postId: string) {
  const context = await user();
  if (typeof postId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(postId))
    throw new ExchangeMediaStorageError("MARKET_MEDIA_PERMISSION_DENIED");
  const result = await service().rpc("reconcile_market_exchange_media_server", {
    p_actor_user_id: context.userId,
    p_post_id: postId,
  });
  if (result.error || !Array.isArray(result.data))
    return { checked: 0, cleanupPending: true };
  // Validate the entire response before deleting any object; never trust paths alone.
  const paths = result.data.map((value: unknown) => {
    const media = row(value);
    const mediaId = stringField(media, "media_id");
    const path = stringField(media, "storage_path");
    if (stringField(media, "post_id") !== postId ||
        stringField(media, "uploaded_by_user_id") !== context.userId ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(mediaId) ||
        path !== postId + "/" + mediaId + "/original")
      throw new ExchangeMediaStorageError("MARKET_MEDIA_RESPONSE_INVALID");
    return path;
  });
  let cleanupPending = false;
  // A post can accumulate terminal attempts. Process every returned path in
  // bounded Storage batches, without silently acknowledging an unprocessed tail.
  for (let offset = 0; offset < paths.length; offset += 100) {
    if (!(await removeExchangeStoragePaths(paths.slice(offset, offset + 100))))
      cleanupPending = true;
  }
  return { checked: paths.length, cleanupPending };
}

export async function removeExchangeMedia(mediaId:string){const c=await user();const r=await c.supabase.rpc("remove_market_exchange_media",{p_media_id:mediaId});if(r.error)rpcFailure(r.error,"MARKET_MEDIA_PERMISSION_DENIED");return cleanupExchangeMediaUpload(mediaId);}
