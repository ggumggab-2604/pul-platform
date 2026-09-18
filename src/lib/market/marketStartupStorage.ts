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

export class StartupMediaStorageError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "StartupMediaStorageError";
  }
}

function service(): SupabaseClient {
  if (serviceClient) return serviceClient;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key)
    throw new StartupMediaStorageError("MARKET_MEDIA_SERVER_UNAVAILABLE");
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
    throw new StartupMediaStorageError("MARKET_MEDIA_AUTHENTICATION_REQUIRED");
  return context;
}

function row(value: unknown): JsonObject {
  const current = Array.isArray(value) ? value[0] : value;
  if (typeof current !== "object" || current === null || Array.isArray(current))
    throw new StartupMediaStorageError("MARKET_MEDIA_RESPONSE_INVALID");
  return current as JsonObject;
}

function stringField(value: JsonObject, key: string) {
  if (typeof value[key] !== "string" || value[key].length === 0)
    throw new StartupMediaStorageError("MARKET_MEDIA_RESPONSE_INVALID");
  return value[key] as string;
}

function numberField(value: JsonObject, key: string) {
  if (typeof value[key] !== "number" || !Number.isSafeInteger(value[key]))
    throw new StartupMediaStorageError("MARKET_MEDIA_RESPONSE_INVALID");
  return value[key] as number;
}

function rpcFailure(
  error: { message?: string } | null,
  fallback: string,
): never {
  const message = error?.message ?? "";
  if (/로그인/.test(message))
    throw new StartupMediaStorageError("MARKET_MEDIA_AUTHENTICATION_REQUIRED");
  if (/본인의|권한/.test(message))
    throw new StartupMediaStorageError("MARKET_MEDIA_PERMISSION_DENIED");
  if (/찾을 수 없습니다/.test(message))
    throw new StartupMediaStorageError("MARKET_MEDIA_NOT_FOUND");
  if (/JPG|PNG|WebP|8MB|최대/.test(message))
    throw new StartupMediaStorageError("MARKET_MEDIA_INPUT_INVALID");
  throw new StartupMediaStorageError(fallback);
}

export async function createStartupMediaUploadIntent(input: {
  postKey: string;
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
    "create_market_startup_media_upload_intent",
    {
      p_post_key: input.postKey,
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
    throw new StartupMediaStorageError("MARKET_MEDIA_RESPONSE_INVALID");

  const contextResult = await service().rpc(
    "get_market_startup_media_upload_context_server",
    { p_actor_user_id: context.userId, p_media_id: mediaId },
  );
  if (contextResult.error)
    rpcFailure(contextResult.error, "MARKET_MEDIA_SIGNED_UPLOAD_FAILED");
  const upload = row(contextResult.data);
  const bucket = stringField(upload, "storage_bucket");
  const path = stringField(upload, "storage_path");
  if (
    bucket !== "market-startup-media" ||
    stringField(upload, "media_id") !== mediaId ||
    stringField(upload, "declared_mime_type") !== mimeType ||
    numberField(upload, "declared_size_bytes") !== input.declaredByteSize
  )
    throw new StartupMediaStorageError("MARKET_MEDIA_RESPONSE_INVALID");
  if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/original$/.test(path))
    throw new StartupMediaStorageError("MARKET_MEDIA_RESPONSE_INVALID");
  const signed = await service()
    .storage.from(bucket)
    .createSignedUploadUrl(path, { upsert: false });
  if (signed.error || !signed.data?.token) {
    try {
      await service().rpc("mark_market_startup_media_upload_failed_server", {
        p_actor_user_id: context.userId,
        p_media_id: mediaId,
      });
    } catch {
      // Best-effort compensation; the signed upload was never issued.
    }
    throw new StartupMediaStorageError("MARKET_MEDIA_SIGNED_UPLOAD_FAILED");
  }
  return { mediaId, bucket, path, token: signed.data.token, mimeType };
}

export async function finalizeStartupMediaUpload(mediaId: string) {
  const context = await user();
  const contextResult = await service().rpc(
    "get_market_startup_media_upload_context_server",
    { p_actor_user_id: context.userId, p_media_id: mediaId },
  );
  if (
    contextResult.error ||
    !Array.isArray(contextResult.data) ||
    contextResult.data.length === 0
  ) {
    // A late upload may have succeeded after the post was removed. Only an
    // owner-scoped terminal path may be cleaned; never delete available media.
    await cleanupStartupMediaUpload(mediaId).catch(() => false);
    rpcFailure(contextResult.error, "MARKET_MEDIA_UPLOAD_NOT_AUTHORIZED");
  }
  const upload = row(contextResult.data);
  const bucket = stringField(upload, "storage_bucket");
  const path = stringField(upload, "storage_path");
  const mimeType = stringField(upload, "declared_mime_type");
  const byteSize = numberField(upload, "declared_size_bytes");
  if (
    bucket !== "market-startup-media" ||
    !isClubMediaMimeType(mimeType) ||
    stringField(upload, "media_id") !== mediaId ||
    !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/original$/i.test(path)
  )
    throw new StartupMediaStorageError("MARKET_MEDIA_RESPONSE_INVALID");
  // Available objects have already passed byte validation. Do not download or
  // delete them again when recovering a lost finalize response.
  const state = await getStartupMediaState(mediaId);
  if (state !== "pending_upload" && state !== "available")
    throw new StartupMediaStorageError("MARKET_MEDIA_UPLOAD_NOT_AUTHORIZED");
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
        await failStartupMediaUpload(mediaId);
      }
      throw new StartupMediaStorageError("MARKET_MEDIA_DOWNLOAD_UNAVAILABLE");
    }
    bytes = new Uint8Array(await downloaded.data.arrayBuffer());
    try {
      validateClubMediaBytes(bytes, mimeType, byteSize, downloaded.data.type);
    } catch {
      bytes.fill(0);
      // A concurrent successful finalize must never lose its object.
      try {
        await service().rpc("mark_market_startup_media_upload_failed_server", {
          p_actor_user_id: context.userId,
          p_media_id: mediaId,
        });
        if ((await getStartupMediaState(mediaId)) === "failed")
          await service().storage.from(bucket).remove([path]);
      } catch {
        /* Keep uncertain state available for reconciliation. */
      }
      throw new StartupMediaStorageError(
        "MARKET_MEDIA_OBJECT_VALIDATION_FAILED",
      );
    }
  }
  const result = await service().rpc(
    "finalize_market_startup_media_upload_server",
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
    await cleanupStartupMediaUpload(mediaId).catch(() => false);
    rpcFailure(result.error, "MARKET_MEDIA_FINALIZE_FAILED");
  }
  const finalized = row(result.data);
  if (
    stringField(finalized, "media_id") !== mediaId ||
    finalized.media_status !== "available"
  )
    throw new StartupMediaStorageError("MARKET_MEDIA_RESPONSE_INVALID");
  return {
    mediaId,
    status: "available" as const,
    version: numberField(finalized, "version"),
  };
}

export async function failStartupMediaUpload(mediaId: string) {
  const context = await user();
  const result = await service().rpc(
    "mark_market_startup_media_upload_failed_server",
    {
      p_actor_user_id: context.userId,
      p_media_id: mediaId,
    },
  );
  if (result.error)
    throw new StartupMediaStorageError("MARKET_MEDIA_STATE_UNAVAILABLE");
  return cleanupStartupMediaUpload(mediaId);
}

export async function cleanupStartupMediaUpload(mediaId: string) {
  const context = await user();
  const result = await service().rpc(
    "get_market_startup_media_cleanup_path_server",
    {
      p_actor_user_id: context.userId,
      p_media_id: mediaId,
    },
  );
  if (result.error || typeof result.data !== "string") return false;
  return removeStartupStoragePaths([result.data]);
}

export async function removeStartupStoragePaths(paths: string[]) {
  if (paths.length === 0) return true;
  const safe = paths.filter((path) =>
    /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/original$/i.test(path),
  );
  if (safe.length !== paths.length)
    throw new StartupMediaStorageError("MARKET_MEDIA_RESPONSE_INVALID");
  try {
    const result = await service()
      .storage.from("market-startup-media")
      .remove(safe);
    return !result.error;
  } catch {
    return false;
  }
}

export async function getStartupMediaState(mediaId: string) {
  const context = await user();
  const result = await service().rpc("get_market_startup_media_state_server", {
    p_actor_user_id: context.userId,
    p_media_id: mediaId,
  });
  if (result.error)
    throw new StartupMediaStorageError("MARKET_MEDIA_STATE_UNAVAILABLE");
  if (
    !["pending_upload", "available", "failed", "removed"].includes(result.data)
  )
    throw new StartupMediaStorageError("MARKET_MEDIA_NOT_FOUND");
  return result.data as "pending_upload" | "available" | "failed" | "removed";
}

// One minute covers image retrieval without a long-lived bearer URL. The route
// streams the response with no-store instead of exposing/caching Storage URLs.
export const STARTUP_MEDIA_READ_TTL_SECONDS = 60;
export async function createStartupMediaReadUrl(
  postKey: string,
  mediaId: string,
) {
  const args = { p_post_key: postKey, p_media_id: mediaId };
  const context = await service().rpc(
    "get_market_startup_media_read_context_server",
    args,
  );
  if (context.error)
    throw new StartupMediaStorageError("MARKET_MEDIA_READ_UNAVAILABLE");
  if (typeof context.data !== "string") return null;
  if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/original$/.test(context.data))
    throw new StartupMediaStorageError("MARKET_MEDIA_RESPONSE_INVALID");
  const signed = await service()
    .storage.from("market-startup-media")
    .createSignedUrl(context.data, STARTUP_MEDIA_READ_TTL_SECONDS);
  if (signed.error || !signed.data?.signedUrl)
    throw new StartupMediaStorageError("MARKET_MEDIA_READ_UNAVAILABLE");
  // Close the signing round-trip race as far as possible. A hide after this
  // check still has the documented in-flight response / TTL limitation.
  const current = await service().rpc(
    "get_market_startup_media_read_context_server",
    args,
  );
  if (current.error)
    throw new StartupMediaStorageError("MARKET_MEDIA_READ_UNAVAILABLE");
  return current.data === context.data ? signed.data.signedUrl : null;
}

/** Server/operator-only bounded reconciliation; no user-supplied paths. Call
 * again after failures and after outstanding upload tokens expire. */
export async function reconcileStartupMedia(limit = 20) {
  const result = await service().rpc("reconcile_market_startup_media_server", {
    p_limit: limit,
  });
  if (result.error || !Array.isArray(result.data))
    return { checked: 0, cleanupPending: true };
  const paths = result.data.map((value: unknown) =>
    stringField(row(value), "storage_path"),
  );
  return {
    checked: paths.length,
    cleanupPending: !(await removeStartupStoragePaths(paths)),
  };
}
