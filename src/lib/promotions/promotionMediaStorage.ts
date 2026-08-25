import "server-only";

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  isClubMediaMimeType,
  validateClubMediaBytes,
  validateClubMediaFilename,
  type ClubMediaMimeType,
} from "@/lib/clubs/clubMediaValidation";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

type JsonObject = Record<string, unknown>;
type PromotionMediaVariant = "desktop_banner" | "mobile_banner" | "detail";

const maxBytes = 5 * 1024 * 1024;
const keyPattern = /^[0-9a-f]{32}$/;
const requestPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const pathPattern = /^[0-9a-f]{32}\/(desktop|mobile|detail)\/[0-9a-f]{32}\/original$/;

let serviceClient: SupabaseClient | undefined;

export class PromotionMediaStorageError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "PromotionMediaStorageError";
  }
}

function service(): SupabaseClient {
  if (serviceClient) return serviceClient;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) throw new PromotionMediaStorageError("PROMOTION_MEDIA_SERVER_UNAVAILABLE");
  serviceClient = createSupabaseClient(getSupabasePublicEnv().url, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  return serviceClient;
}

async function requireUser() {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) throw new PromotionMediaStorageError("PROMOTION_MEDIA_AUTHENTICATION_REQUIRED");
  return context;
}

function object(value: unknown, fallback: string): JsonObject {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    throw new PromotionMediaStorageError(fallback);
  }
  return candidate as JsonObject;
}

function string(value: JsonObject, field: string) {
  const result = value[field];
  if (typeof result !== "string" || result.length === 0) {
    throw new PromotionMediaStorageError("PROMOTION_MEDIA_RESPONSE_INVALID");
  }
  return result;
}

function integer(value: JsonObject, field: string) {
  const result = value[field];
  if (typeof result !== "number" || !Number.isSafeInteger(result)) {
    throw new PromotionMediaStorageError("PROMOTION_MEDIA_RESPONSE_INVALID");
  }
  return result;
}

function rpcFailure(error: { message?: string } | null, fallback: string): never {
  const message = error?.message ?? "";
  if (/로그인/.test(message)) throw new PromotionMediaStorageError("PROMOTION_MEDIA_AUTHENTICATION_REQUIRED");
  if (/권한/.test(message)) throw new PromotionMediaStorageError("PROMOTION_MEDIA_PERMISSION_DENIED");
  if (/찾을 수 없습니다/.test(message)) throw new PromotionMediaStorageError("PROMOTION_MEDIA_NOT_FOUND");
  if (/변경되었습니다|재사용|진행 중/.test(message)) {
    throw new PromotionMediaStorageError("PROMOTION_MEDIA_CONFLICT");
  }
  if (/JPEG|PNG|WebP|5MB|대체 텍스트|순서|종류|확인해 주세요/.test(message)) {
    throw new PromotionMediaStorageError("PROMOTION_MEDIA_INPUT_INVALID");
  }
  throw new PromotionMediaStorageError(fallback);
}

function validKey(value: string) {
  if (!keyPattern.test(value)) throw new PromotionMediaStorageError("PROMOTION_MEDIA_INPUT_INVALID");
  return value;
}

function validRequest(value: string) {
  if (!requestPattern.test(value)) throw new PromotionMediaStorageError("PROMOTION_MEDIA_INPUT_INVALID");
  return value;
}

function validateDeclaration(mimeType: string, byteSize: number, filename: string) {
  if (!isClubMediaMimeType(mimeType) || !Number.isSafeInteger(byteSize) || byteSize < 1 || byteSize > maxBytes) {
    throw new PromotionMediaStorageError("PROMOTION_MEDIA_INPUT_INVALID");
  }
  validateClubMediaFilename(filename, mimeType);
  return mimeType;
}

export type CreatePromotionMediaUploadInput = {
  requestId: string;
  promotionKey: string;
  variant: PromotionMediaVariant;
  sortOrder: number;
  altText: string;
  declaredMimeType: ClubMediaMimeType;
  declaredByteSize: number;
  originalFilename: string;
};

export async function createPromotionMediaUploadIntent(
  input: CreatePromotionMediaUploadInput,
) {
  const context = await requireUser();
  const mimeType = validateDeclaration(
    input.declaredMimeType,
    input.declaredByteSize,
    input.originalFilename,
  );
  const requestId = validRequest(input.requestId);
  validKey(input.promotionKey);
  if (
    !(["desktop_banner", "mobile_banner", "detail"] as const).includes(input.variant) ||
    !Number.isSafeInteger(input.sortOrder) ||
    (input.variant !== "detail" && input.sortOrder !== 0) ||
    (input.variant === "detail" && (input.sortOrder < 0 || input.sortOrder > 9)) ||
    input.altText !== input.altText.trim() || input.altText.length < 2 || input.altText.length > 240
  ) throw new PromotionMediaStorageError("PROMOTION_MEDIA_INPUT_INVALID");

  const intentResult = await context.supabase.rpc("create_promotion_media_upload_intent", {
    p_request_id: requestId,
    p_promotion_key: input.promotionKey,
    p_variant: input.variant,
    p_sort_order: input.sortOrder,
    p_alt_text: input.altText,
    p_declared_mime_type: mimeType,
    p_declared_size_bytes: input.declaredByteSize,
  });
  if (intentResult.error) rpcFailure(intentResult.error, "PROMOTION_MEDIA_UPLOAD_INTENT_FAILED");
  const intent = object(intentResult.data, "PROMOTION_MEDIA_UPLOAD_INTENT_FAILED");
  const mediaKey = validKey(string(intent, "media_key"));
  if (intent.request_id !== requestId || intent.media_status !== "pending_upload" || integer(intent, "version") !== 1) {
    throw new PromotionMediaStorageError("PROMOTION_MEDIA_RESPONSE_INVALID");
  }

  const contextResult = await service().rpc("get_promotion_media_upload_context_for_service", {
    p_actor_id: context.userId,
    p_media_key: mediaKey,
  });
  if (contextResult.error) rpcFailure(contextResult.error, "PROMOTION_MEDIA_SIGNED_UPLOAD_FAILED");
  const upload = object(contextResult.data, "PROMOTION_MEDIA_SIGNED_UPLOAD_FAILED");
  const bucket = string(upload, "storage_bucket");
  const path = string(upload, "storage_path");
  if (
    bucket !== "promotion-media" || !pathPattern.test(path) ||
    string(upload, "media_key") !== mediaKey || string(upload, "declared_mime_type") !== mimeType ||
    integer(upload, "declared_size_bytes") !== input.declaredByteSize ||
    upload.media_status !== "pending_upload"
  ) throw new PromotionMediaStorageError("PROMOTION_MEDIA_RESPONSE_INVALID");

  const signed = await service().storage.from(bucket).createSignedUploadUrl(path, { upsert: false });
  if (signed.error || !signed.data?.token) {
    await markPromotionMediaUploadFailed(context.userId, mediaKey).catch(() => undefined);
    throw new PromotionMediaStorageError("PROMOTION_MEDIA_SIGNED_UPLOAD_FAILED");
  }
  return { requestId, mediaKey, bucket, path, token: signed.data.token, mimeType };
}

async function getUploadContext(actorId: string, mediaKey: string) {
  const { data, error } = await service().rpc("get_promotion_media_upload_context_for_service", {
    p_actor_id: actorId,
    p_media_key: validKey(mediaKey),
  });
  if (error) rpcFailure(error, "PROMOTION_MEDIA_UPLOAD_NOT_AUTHORIZED");
  const upload = object(data, "PROMOTION_MEDIA_UPLOAD_NOT_AUTHORIZED");
  const mimeType = string(upload, "declared_mime_type");
  const path = string(upload, "storage_path");
  if (
    string(upload, "media_key") !== mediaKey || string(upload, "storage_bucket") !== "promotion-media" ||
    !pathPattern.test(path) || !isClubMediaMimeType(mimeType) || upload.media_status !== "pending_upload"
  ) throw new PromotionMediaStorageError("PROMOTION_MEDIA_RESPONSE_INVALID");
  return {
    mediaKey,
    bucket: "promotion-media",
    path,
    mimeType,
    byteSize: integer(upload, "declared_size_bytes"),
  };
}

async function markPromotionMediaUploadFailed(actorId: string, mediaKey: string) {
  await service().rpc("mark_promotion_media_upload_failed_for_service", {
    p_actor_id: actorId,
    p_media_key: validKey(mediaKey),
  });
}

export async function failPromotionMediaUpload(mediaKey: string) {
  const context = await requireUser();
  await markPromotionMediaUploadFailed(context.userId, mediaKey);
}

export async function finalizePromotionMediaUpload(mediaKey: string, requestId: string) {
  const context = await requireUser();
  const upload = await getUploadContext(context.userId, validKey(mediaKey));
  const finalizedRequestId = validRequest(requestId);
  let bytes: Uint8Array | undefined;
  try {
    const downloaded = await service().storage.from(upload.bucket).download(upload.path);
    if (downloaded.error || !downloaded.data) throw new Error("PROMOTION_MEDIA_OBJECT_MISSING");
    bytes = new Uint8Array(await downloaded.data.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw new Error("PROMOTION_MEDIA_TOO_LARGE");
    validateClubMediaBytes(bytes, upload.mimeType, upload.byteSize, downloaded.data.type);
  } catch {
    bytes?.fill(0);
    await markPromotionMediaUploadFailed(context.userId, mediaKey).catch(() => undefined);
    await service().storage.from(upload.bucket).remove([upload.path]).catch(() => undefined);
    throw new PromotionMediaStorageError("PROMOTION_MEDIA_OBJECT_VALIDATION_FAILED");
  }

  const { data, error } = await service().rpc("finalize_promotion_media_for_service", {
    p_actor_id: context.userId,
    p_request_id: finalizedRequestId,
    p_media_key: mediaKey,
    p_verified_mime_type: upload.mimeType,
    p_verified_size_bytes: bytes.byteLength,
  });
  bytes.fill(0);
  if (error) {
    await service().storage.from(upload.bucket).remove([upload.path]).catch(() => undefined);
    rpcFailure(error, "PROMOTION_MEDIA_FINALIZE_FAILED");
  }
  const finalized = object(data, "PROMOTION_MEDIA_FINALIZE_FAILED");
  if (
    finalized.request_id !== finalizedRequestId || string(finalized, "media_key") !== mediaKey ||
    finalized.media_status !== "available"
  ) throw new PromotionMediaStorageError("PROMOTION_MEDIA_RESPONSE_INVALID");

  const replacedPath = finalized.replaced_storage_path;
  let replacedStorageRemoved: boolean | null = null;
  if (typeof replacedPath === "string" && pathPattern.test(replacedPath)) {
    const removal = await service().storage.from(upload.bucket).remove([replacedPath]);
    replacedStorageRemoved = !removal.error;
  } else if (replacedPath !== null) {
    throw new PromotionMediaStorageError("PROMOTION_MEDIA_RESPONSE_INVALID");
  }
  return {
    requestId: finalizedRequestId,
    mediaKey,
    status: "available" as const,
    version: integer(finalized, "version"),
    replacedStorageRemoved,
  };
}

export async function removePromotionMedia(mediaKey: string, expectedVersion: number, requestId: string) {
  const context = await requireUser();
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    throw new PromotionMediaStorageError("PROMOTION_MEDIA_INPUT_INVALID");
  }
  const { data, error } = await service().rpc("remove_promotion_media_for_service", {
    p_actor_id: context.userId,
    p_request_id: validRequest(requestId),
    p_media_key: validKey(mediaKey),
    p_expected_version: expectedVersion,
  });
  if (error) rpcFailure(error, "PROMOTION_MEDIA_REMOVE_FAILED");
  const removed = object(data, "PROMOTION_MEDIA_REMOVE_FAILED");
  if (removed.request_id !== requestId || string(removed, "media_key") !== mediaKey || removed.media_status !== "removed") {
    throw new PromotionMediaStorageError("PROMOTION_MEDIA_RESPONSE_INVALID");
  }
  const bucket = string(removed, "storage_bucket");
  const path = string(removed, "storage_path");
  if (bucket !== "promotion-media" || !pathPattern.test(path)) {
    throw new PromotionMediaStorageError("PROMOTION_MEDIA_RESPONSE_INVALID");
  }
  const storageResult = await service().storage.from(bucket).remove([path]);
  return {
    requestId,
    mediaKey,
    status: "removed" as const,
    version: integer(removed, "version"),
    storageRemoved: !storageResult.error,
  };
}
