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

const mediaKeyPattern = /^[0-9a-f]{32}$/;
const storagePathPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}\/[0-9a-f]{32}\/original$/;

export class CourseMediaStorageError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "CourseMediaStorageError";
  }
}

function service(): SupabaseClient {
  if (serviceClient) return serviceClient;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) throw new CourseMediaStorageError("COURSE_MEDIA_SERVER_UNAVAILABLE");
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
  if (!context) throw new CourseMediaStorageError("COURSE_MEDIA_AUTHENTICATION_REQUIRED");
  return context;
}

function firstRow(value: unknown, fallback: string): JsonObject {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    throw new CourseMediaStorageError(fallback);
  }
  return candidate as JsonObject;
}

function stringField(value: JsonObject, key: string): string {
  const field = value[key];
  if (typeof field !== "string" || field.length === 0) {
    throw new CourseMediaStorageError("COURSE_MEDIA_RESPONSE_INVALID");
  }
  return field;
}

function integerField(value: JsonObject, key: string): number {
  const field = value[key];
  if (typeof field !== "number" || !Number.isSafeInteger(field)) {
    throw new CourseMediaStorageError("COURSE_MEDIA_RESPONSE_INVALID");
  }
  return field;
}

function rpcFailure(error: { message?: string } | null, fallback: string): never {
  const message = error?.message ?? "";
  if (/로그인/.test(message)) {
    throw new CourseMediaStorageError("COURSE_MEDIA_AUTHENTICATION_REQUIRED");
  }
  if (/정상 활동|본인이 등록한|권한/.test(message)) {
    throw new CourseMediaStorageError("COURSE_MEDIA_PERMISSION_DENIED");
  }
  if (/찾을 수 없습니다/.test(message)) {
    throw new CourseMediaStorageError("COURSE_MEDIA_NOT_FOUND");
  }
  if (/JPG|PNG|WebP|8MB|180자|최대 8장|입력/.test(message)) {
    throw new CourseMediaStorageError("COURSE_MEDIA_INPUT_INVALID");
  }
  throw new CourseMediaStorageError(fallback);
}

function validateMediaKey(value: string): string {
  if (!mediaKeyPattern.test(value)) {
    throw new CourseMediaStorageError("COURSE_MEDIA_INPUT_INVALID");
  }
  return value;
}

export type CreateCourseMediaUploadInput = {
  courseKey: string;
  caption?: string;
  declaredMimeType: ClubMediaMimeType;
  declaredByteSize: number;
  originalFilename: string;
};

export async function createCourseMediaUploadIntent(
  input: CreateCourseMediaUploadInput,
) {
  const context = await requireUser();
  const mimeType = validateClubMediaDeclaration(
    input.declaredMimeType,
    input.declaredByteSize,
  );
  validateClubMediaFilename(input.originalFilename, mimeType);
  const caption = input.caption?.trim() || null;
  if (caption && Array.from(caption).length > 180) {
    throw new CourseMediaStorageError("COURSE_MEDIA_INPUT_INVALID");
  }

  const intentResult = await context.supabase.rpc("create_course_media_upload_intent", {
    p_course_key: input.courseKey,
    p_caption: caption,
    p_declared_mime_type: mimeType,
    p_declared_size_bytes: input.declaredByteSize,
  });
  if (intentResult.error) {
    rpcFailure(intentResult.error, "COURSE_MEDIA_UPLOAD_INTENT_FAILED");
  }
  const intent = firstRow(intentResult.data, "COURSE_MEDIA_UPLOAD_INTENT_FAILED");
  const mediaKey = validateMediaKey(stringField(intent, "media_key"));
  if (intent.media_status !== "pending_upload" || integerField(intent, "version") !== 1) {
    throw new CourseMediaStorageError("COURSE_MEDIA_RESPONSE_INVALID");
  }

  const contextResult = await service().rpc("get_course_media_upload_context_server", {
    p_actor_user_id: context.userId,
    p_media_key: mediaKey,
  });
  if (contextResult.error) {
    rpcFailure(contextResult.error, "COURSE_MEDIA_SIGNED_UPLOAD_FAILED");
  }
  const upload = firstRow(contextResult.data, "COURSE_MEDIA_SIGNED_UPLOAD_FAILED");
  const bucket = stringField(upload, "storage_bucket");
  const path = stringField(upload, "storage_path");
  if (
    bucket !== "course-media" ||
    !storagePathPattern.test(path) ||
    stringField(upload, "media_key") !== mediaKey ||
    stringField(upload, "declared_mime_type") !== mimeType ||
    integerField(upload, "declared_size_bytes") !== input.declaredByteSize
  ) {
    throw new CourseMediaStorageError("COURSE_MEDIA_RESPONSE_INVALID");
  }

  const signed = await service().storage
    .from(bucket)
    .createSignedUploadUrl(path, { upsert: false });
  if (signed.error || !signed.data?.token) {
    await markUploadFailed(context.userId, mediaKey).catch(() => undefined);
    throw new CourseMediaStorageError("COURSE_MEDIA_SIGNED_UPLOAD_FAILED");
  }
  return { mediaKey, bucket, path, token: signed.data.token, mimeType };
}

async function getUploadContext(actorUserId: string, mediaKey: string) {
  const { data, error } = await service().rpc("get_course_media_upload_context_server", {
    p_actor_user_id: actorUserId,
    p_media_key: validateMediaKey(mediaKey),
  });
  if (error) rpcFailure(error, "COURSE_MEDIA_UPLOAD_NOT_AUTHORIZED");
  const upload = firstRow(data, "COURSE_MEDIA_UPLOAD_NOT_AUTHORIZED");
  const mimeType = stringField(upload, "declared_mime_type");
  const path = stringField(upload, "storage_path");
  if (
    stringField(upload, "media_key") !== mediaKey ||
    stringField(upload, "storage_bucket") !== "course-media" ||
    !storagePathPattern.test(path) ||
    !isClubMediaMimeType(mimeType)
  ) {
    throw new CourseMediaStorageError("COURSE_MEDIA_RESPONSE_INVALID");
  }
  return {
    mediaKey,
    bucket: "course-media",
    path,
    mimeType,
    byteSize: integerField(upload, "declared_size_bytes"),
  };
}

async function markUploadFailed(actorUserId: string, mediaKey: string) {
  await service().rpc("mark_course_media_upload_failed_server", {
    p_actor_user_id: actorUserId,
    p_media_key: validateMediaKey(mediaKey),
  });
}

export async function failCourseMediaUpload(mediaKey: string) {
  const context = await requireUser();
  await markUploadFailed(context.userId, mediaKey);
}

export async function finalizeCourseMediaUpload(mediaKey: string) {
  const context = await requireUser();
  const upload = await getUploadContext(context.userId, mediaKey);
  let bytes: Uint8Array | undefined;
  try {
    const downloaded = await service().storage.from(upload.bucket).download(upload.path);
    if (downloaded.error || !downloaded.data) {
      throw new Error("COURSE_MEDIA_OBJECT_MISSING");
    }
    bytes = new Uint8Array(await downloaded.data.arrayBuffer());
    validateClubMediaBytes(bytes, upload.mimeType, upload.byteSize, downloaded.data.type);
  } catch {
    bytes?.fill(0);
    await markUploadFailed(context.userId, mediaKey).catch(() => undefined);
    await service().storage.from(upload.bucket).remove([upload.path]).catch(() => undefined);
    throw new CourseMediaStorageError("COURSE_MEDIA_OBJECT_VALIDATION_FAILED");
  }

  const { data, error } = await service().rpc("finalize_course_media_upload_server", {
    p_actor_user_id: context.userId,
    p_media_key: mediaKey,
    p_verified_mime_type: upload.mimeType,
    p_verified_size_bytes: bytes.byteLength,
  });
  bytes.fill(0);
  if (error) {
    await service().storage.from(upload.bucket).remove([upload.path]).catch(() => undefined);
    rpcFailure(error, "COURSE_MEDIA_FINALIZE_FAILED");
  }
  const finalized = firstRow(data, "COURSE_MEDIA_FINALIZE_FAILED");
  if (
    stringField(finalized, "media_key") !== mediaKey ||
    finalized.media_status !== "available"
  ) {
    throw new CourseMediaStorageError("COURSE_MEDIA_RESPONSE_INVALID");
  }
  return {
    mediaKey,
    status: "available" as const,
    version: integerField(finalized, "version"),
  };
}

export async function removeCourseMedia(mediaKey: string) {
  const context = await requireUser();
  const { data, error } = await service().rpc("remove_course_media_server", {
    p_actor_user_id: context.userId,
    p_media_key: validateMediaKey(mediaKey),
  });
  if (error) rpcFailure(error, "COURSE_MEDIA_REMOVE_FAILED");
  const removed = firstRow(data, "COURSE_MEDIA_REMOVE_FAILED");
  if (
    stringField(removed, "media_key") !== mediaKey ||
    removed.media_status !== "removed"
  ) {
    throw new CourseMediaStorageError("COURSE_MEDIA_RESPONSE_INVALID");
  }
  const bucket = stringField(removed, "storage_bucket");
  const path = stringField(removed, "storage_path");
  if (bucket !== "course-media" || !storagePathPattern.test(path)) {
    throw new CourseMediaStorageError("COURSE_MEDIA_RESPONSE_INVALID");
  }
  const storageResult = await service().storage.from(bucket).remove([path]);
  return {
    mediaKey,
    status: "removed" as const,
    version: integerField(removed, "version"),
    storageRemoved: !storageResult.error,
  };
}
