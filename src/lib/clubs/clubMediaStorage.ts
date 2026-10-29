import "server-only";
import { validatePhotoBytes } from "@/lib/images/validatePhotoBytes";

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

export type ClubMediaKind = "representative" | "activity" | "gallery";
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
  if (/변경되었습니다|연결 야외구장|공개 범위|전체 공개/.test(message)) throw new Error(message);
  if (/찾을 수 없습니다/.test(message)) throw new ClubMediaStorageError("CLUB_MEDIA_NOT_FOUND");
  if (/JPG|PNG|WebP|8MB|입력|180자/.test(message)) throw new ClubMediaStorageError("CLUB_MEDIA_INPUT_INVALID");
  throw new ClubMediaStorageError(fallback);
}

export type CreateClubMediaUploadInput = {
  expectedViewerId?:string;
  requestId?: string;
  visibility?: "public" | "club_members";
  publicConfirmed?: boolean;
  shareCourseKey?: string | null;
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
  if(input.expectedViewerId&&context.userId!==input.expectedViewerId)throw new ClubMediaStorageError("CLUB_MEDIA_AUTHENTICATION_REQUIRED");
  const mimeType = validateClubMediaDeclaration(input.declaredMimeType, input.declaredByteSize);
  validateClubMediaFilename(input.originalFilename, mimeType);
  const caption = input.caption?.trim() || null;
  if (caption && Array.from(caption).length > 180) {
    throw new ClubMediaStorageError("CLUB_MEDIA_INPUT_INVALID");
  }
  const { data, error } = input.mediaKind === "gallery" ? await context.supabase.rpc("create_club_photo_upload", {
    p_club_id: input.clubId,
    p_request_id: input.requestId ?? crypto.randomUUID(),
    p_input: { caption,visibility:input.visibility??"club_members",public_confirmed:input.publicConfirmed===true,share_course_key:input.shareCourseKey||null,mime_type:mimeType,byte_size:input.declaredByteSize },
  }) : await context.supabase.rpc("create_club_media_upload_intent", {
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
    !["club-media","club-media-private"].includes(bucket) ||
    stringField(upload, "media_id") !== mediaId ||
    stringField(upload, "declared_mime_type") !== mimeType ||
    integerField(upload, "declared_size_bytes") !== input.declaredByteSize
  ) {
    throw new ClubMediaStorageError("CLUB_MEDIA_RESPONSE_INVALID");
  }
  if (integerField(upload,"media_version") > 1) return {mediaId,bucket,path,token:"",mimeType,alreadyAvailable:true};
  const signed = await getServiceClient().storage.from(bucket).createSignedUploadUrl(path, { upsert: false });
  if (signed.error || !signed.data?.token) {
    throw new ClubMediaStorageError("CLUB_MEDIA_SIGNED_UPLOAD_FAILED");
  }
  return { mediaId, bucket, path, token: signed.data.token, mimeType, alreadyAvailable:false };
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
    version: integerField(row,"media_version"),
  };
}

async function cleanFailedClubMediaUpload(mediaId: string, actorUserId: string, upload: {bucket:string;path:string}) {
  const {data,error} = await getServiceClient().rpc("claim_club_media_upload_cleanup_server", {
    p_actor_user_id: actorUserId, p_media_id: mediaId,
  });
  // Transport/unknown results grant no deletion authority, even after a possible commit.
  if (error) return false;
  const row = firstRow(data, "CLUB_MEDIA_CLEANUP_UNCONFIRMED");
  if (row.media_id !== mediaId || row.cleanup_allowed !== true || row.media_status !== "failed" || row.storage_bucket !== upload.bucket || row.storage_path !== upload.path) return false;
  await getServiceClient().storage.from(upload.bucket).remove([upload.path]).catch(() => undefined);
  return true;
}

export async function failClubMediaUpload(mediaId: string) {
  const context = await requireUser();
  const upload = await getUploadContext(context.userId, mediaId);
  await cleanFailedClubMediaUpload(mediaId, context.userId, upload);
}

export async function finalizeClubMediaUpload(mediaId: string, expectedViewerId?:string) {
  const context = await requireUser();
  if(expectedViewerId&&context.userId!==expectedViewerId)throw new ClubMediaStorageError("CLUB_MEDIA_AUTHENTICATION_REQUIRED");
  const upload = await getUploadContext(context.userId, mediaId);
  let bytes: Uint8Array;
  try {
    const downloaded = await getServiceClient().storage.from(upload.bucket).download(upload.path);
    if (downloaded.error || !downloaded.data) throw new Error("CLUB_MEDIA_OBJECT_MISSING");
    bytes = new Uint8Array(await downloaded.data.arrayBuffer());
    validateClubMediaBytes(bytes, upload.mimeType, upload.byteSize, downloaded.data.type);
    await validatePhotoBytes(bytes, upload.mimeType, "photo");
  } catch {
    await cleanFailedClubMediaUpload(mediaId, context.userId, upload).catch(() => false);
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
    if (error.code === "PCL01") {
      const cleaned = await cleanFailedClubMediaUpload(mediaId, context.userId, upload).catch(() => false);
      if (cleaned) return {mediaId,status:"restart_required" as const};
      throw new Error("공유 대상이 변경되었지만 업로드 정리 결과를 확인하지 못했습니다. 입력을 유지한 채 다시 저장해 주세요.");
    }
    // An RPC transport error may follow a successful commit. Preserve bytes for safe replay.
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
