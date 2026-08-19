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

type JsonRow = Record<string, unknown>;

let serviceClient: SupabaseClient | undefined;

export type ClubMediaKind = "representative" | "activity";
export type ClubMediaActivityType =
  | "monthly_meeting"
  | "tournament"
  | "friendly_match"
  | "screen_event"
  | "outing"
  | "training"
  | "community_event"
  | "other";

export class ClubMediaStorageError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ClubMediaStorageError";
  }
}

function getServiceClient(): SupabaseClient {
  if (serviceClient) return serviceClient;
  const { url } = getSupabasePublicEnv();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) throw new ClubMediaStorageError("CLUB_MEDIA_SERVER_UNAVAILABLE");
  serviceClient = createSupabaseClient(url, key, {
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
  if (!context) throw new ClubMediaStorageError("CLUB_MEDIA_AUTHENTICATION_REQUIRED");
  return context;
}

function isRecord(value: unknown): value is JsonRow {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstRow(value: unknown, code: string): JsonRow {
  const row = Array.isArray(value) ? value[0] : value;
  if (!isRecord(row)) throw new ClubMediaStorageError(code);
  return row;
}

function stringField(row: JsonRow, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new ClubMediaStorageError("CLUB_MEDIA_RESPONSE_INVALID");
  }
  return value;
}

function integerField(row: JsonRow, key: string): number {
  const value = row[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new ClubMediaStorageError("CLUB_MEDIA_RESPONSE_INVALID");
  }
  return value;
}

function rpcError(error: { message?: string } | null, fallback: string): never {
  const message = error?.message ?? "";
  if (/로그인/.test(message)) throw new ClubMediaStorageError("CLUB_MEDIA_AUTHENTICATION_REQUIRED");
  if (/권한|정상 활동 계정|활동 중인 동호회/.test(message)) throw new ClubMediaStorageError("CLUB_MEDIA_PERMISSION_DENIED");
  if (/찾을 수 없습니다/.test(message)) throw new ClubMediaStorageError("CLUB_MEDIA_NOT_FOUND");
  if (/JPG|PNG|WebP|8MB|입력|180자/.test(message)) throw new ClubMediaStorageError("CLUB_MEDIA_INPUT_INVALID");
  throw new ClubMediaStorageError(fallback);
}

export type CreateClubMediaUploadInput = {
  clubId: string;
  mediaKind: ClubMediaKind;
  caption?: string;
  activityType?: ClubMediaActivityType;
  takenOn?: string;
  declaredMimeType: ClubMediaMimeType;
  declaredByteSize: number;
  originalFilename: string;
};

export async function createClubMediaUploadIntent(input: CreateClubMediaUploadInput) {
  const context = await requireUser();
  const mimeType = validateClubMediaDeclaration(input.declaredMimeType, input.declaredByteSize);
  validateClubMediaFilename(input.originalFilename, mimeType);
  const caption = input.caption?.trim() || null;
  if (caption && Array.from(caption).length > 180) {
    throw new ClubMediaStorageError("CLUB_MEDIA_INPUT_INVALID");
  }
  const { data, error } = await context.supabase.rpc("create_club_media_upload_intent", {
    p_club_id: input.clubId,
    p_media_kind: input.mediaKind,
    p_caption: caption,
    p_activity_type: input.mediaKind === "activity" ? input.activityType ?? "other" : null,
    p_taken_on: input.takenOn || null,
    p_declared_mime_type: mimeType,
    p_declared_size_bytes: input.declaredByteSize,
  });
  if (error) rpcError(error, "CLUB_MEDIA_UPLOAD_INTENT_FAILED");
  const intent = firstRow(data, "CLUB_MEDIA_UPLOAD_INTENT_FAILED");
  const mediaId = stringField(intent, "media_id");
  if (intent.media_status !== "pending_upload" || integerField(intent, "version") !== 1) {
    throw new ClubMediaStorageError("CLUB_MEDIA_RESPONSE_INVALID");
  }

  const contextResult = await getServiceClient().rpc("get_club_media_upload_context_server", {
    p_actor_user_id: context.userId,
    p_media_id: mediaId,
  });
  if (contextResult.error) rpcError(contextResult.error, "CLUB_MEDIA_SIGNED_UPLOAD_FAILED");
  const upload = firstRow(contextResult.data, "CLUB_MEDIA_SIGNED_UPLOAD_FAILED");
  const bucket = stringField(upload, "storage_bucket");
  const path = stringField(upload, "storage_path");
  if (
    bucket !== "club-media" ||
    stringField(upload, "media_id") !== mediaId ||
    stringField(upload, "declared_mime_type") !== mimeType ||
    integerField(upload, "declared_size_bytes") !== input.declaredByteSize
  ) {
    throw new ClubMediaStorageError("CLUB_MEDIA_RESPONSE_INVALID");
  }
  const signed = await getServiceClient().storage.from(bucket).createSignedUploadUrl(path, { upsert: false });
  if (signed.error || !signed.data?.token) {
    await markClubMediaUploadFailed(mediaId, context.userId).catch(() => undefined);
    throw new ClubMediaStorageError("CLUB_MEDIA_SIGNED_UPLOAD_FAILED");
  }
  return { mediaId, bucket, path, token: signed.data.token, mimeType };
}

async function getUploadContext(actorUserId: string, mediaId: string) {
  const { data, error } = await getServiceClient().rpc("get_club_media_upload_context_server", {
    p_actor_user_id: actorUserId,
    p_media_id: mediaId,
  });
  if (error) rpcError(error, "CLUB_MEDIA_UPLOAD_NOT_AUTHORIZED");
  const row = firstRow(data, "CLUB_MEDIA_UPLOAD_NOT_AUTHORIZED");
  const mimeType = stringField(row, "declared_mime_type");
  if (!isClubMediaMimeType(mimeType)) {
    throw new ClubMediaStorageError("CLUB_MEDIA_RESPONSE_INVALID");
  }
  return {
    mediaId: stringField(row, "media_id"),
    bucket: stringField(row, "storage_bucket"),
    path: stringField(row, "storage_path"),
    mimeType,
    byteSize: integerField(row, "declared_size_bytes"),
  };
}

async function markClubMediaUploadFailed(mediaId: string, actorUserId: string) {
  await getServiceClient().rpc("mark_club_media_upload_failed_server", {
    p_actor_user_id: actorUserId,
    p_media_id: mediaId,
  });
}

export async function failClubMediaUpload(mediaId: string) {
  const context = await requireUser();
  await markClubMediaUploadFailed(mediaId, context.userId);
}

export async function finalizeClubMediaUpload(mediaId: string) {
  const context = await requireUser();
  const upload = await getUploadContext(context.userId, mediaId);
  let bytes: Uint8Array;
  try {
    const downloaded = await getServiceClient().storage.from(upload.bucket).download(upload.path);
    if (downloaded.error || !downloaded.data) throw new Error("CLUB_MEDIA_OBJECT_MISSING");
    bytes = new Uint8Array(await downloaded.data.arrayBuffer());
    validateClubMediaBytes(bytes, upload.mimeType, upload.byteSize, downloaded.data.type);
  } catch {
    await markClubMediaUploadFailed(mediaId, context.userId).catch(() => undefined);
    await getServiceClient().storage.from(upload.bucket).remove([upload.path]).catch(() => undefined);
    throw new ClubMediaStorageError("CLUB_MEDIA_OBJECT_VALIDATION_FAILED");
  }

  const { data, error } = await getServiceClient().rpc("finalize_club_media_upload_server", {
    p_actor_user_id: context.userId,
    p_media_id: mediaId,
    p_verified_mime_type: upload.mimeType,
    p_verified_size_bytes: bytes.byteLength,
  });
  bytes.fill(0);
  if (error) {
    await getServiceClient().storage.from(upload.bucket).remove([upload.path]).catch(() => undefined);
    rpcError(error, "CLUB_MEDIA_FINALIZE_FAILED");
  }
  const row = firstRow(data, "CLUB_MEDIA_FINALIZE_FAILED");
  if (stringField(row, "media_id") !== mediaId || row.media_status !== "available") {
    throw new ClubMediaStorageError("CLUB_MEDIA_RESPONSE_INVALID");
  }
  const replaced = row.replaced_storage_paths;
  if (!Array.isArray(replaced) || replaced.some((path) => typeof path !== "string")) {
    throw new ClubMediaStorageError("CLUB_MEDIA_RESPONSE_INVALID");
  }
  if (replaced.length > 0) {
    await getServiceClient().storage.from(upload.bucket).remove(replaced as string[]).catch(() => undefined);
  }
  return { mediaId, status: "available" as const, version: integerField(row, "version") };
}

export async function removeClubMedia(mediaId: string) {
  const context = await requireUser();
  const { data, error } = await getServiceClient().rpc("remove_club_media_server", {
    p_actor_user_id: context.userId,
    p_media_id: mediaId,
  });
  if (error) rpcError(error, "CLUB_MEDIA_REMOVE_FAILED");
  const row = firstRow(data, "CLUB_MEDIA_REMOVE_FAILED");
  if (stringField(row, "media_id") !== mediaId || row.media_status !== "removed") {
    throw new ClubMediaStorageError("CLUB_MEDIA_RESPONSE_INVALID");
  }
  const bucket = stringField(row, "storage_bucket");
  const path = stringField(row, "storage_path");
  await getServiceClient().storage.from(bucket).remove([path]).catch(() => undefined);
  return { mediaId, status: "removed" as const, version: integerField(row, "version") };
}
