"use server";

import { revalidatePath } from "next/cache";

import {
  mutatePromotion,
  mutatePromotionPlacement,
  PromotionManagementError,
} from "@/lib/promotions/promotionManagement";
import {
  normalizePromotionEditorDraft,
  normalizePublicationPeriod,
  promotionDraftToPayload,
  PromotionUiValidationError,
} from "@/lib/promotions/promotionManagementUi";
import {
  createPromotionMediaUploadIntent,
  failPromotionMediaUpload,
  finalizePromotionMediaUpload,
  PromotionMediaStorageError,
  removePromotionMedia,
} from "@/lib/promotions/promotionMediaStorage";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export type PromotionManagementActionResult =
  | {
      ok: true;
      message: string;
      promotionKey?: string;
      upload?: {
        requestId: string;
        mediaKey: string;
        bucket: string;
        path: string;
        token: string;
        mimeType: string;
      };
    }
  | { ok: false; message: string; shouldRefresh: boolean };

const requestPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const keyPattern = /^[0-9a-f]{32}$/;
const slotPattern = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+){2}$/;
const mediaVariants = new Set(["desktop_banner", "mobile_banner"]);
const mimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function validation(message = "입력한 배너·홍보 내용을 확인해 주세요.") {
  return new PromotionUiValidationError(message);
}

function exactObject(value: unknown, expectedKeys: readonly string[]) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw validation();
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw validation();
  }
  return record;
}

function requestId(value: unknown) {
  if (typeof value !== "string" || !requestPattern.test(value)) throw validation();
  return value;
}

function key(value: unknown, label: string) {
  if (typeof value !== "string" || !keyPattern.test(value)) throw validation(`${label}을 확인해 주세요.`);
  return value;
}

function version(value: unknown) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw validation();
  return value;
}

function safeFailure(error: unknown): PromotionManagementActionResult {
  if (error instanceof PromotionManagementError) {
    return { ok: false, message: error.userMessage, shouldRefresh: error.shouldRefresh };
  }
  if (error instanceof PromotionUiValidationError) {
    return { ok: false, message: error.userMessage, shouldRefresh: false };
  }
  if (error instanceof PromotionMediaStorageError) {
    const messages: Record<string, string> = {
      PROMOTION_MEDIA_AUTHENTICATION_REQUIRED: "로그인이 필요합니다.",
      PROMOTION_MEDIA_PERMISSION_DENIED: "배너·홍보를 관리할 권한이 없습니다.",
      PROMOTION_MEDIA_INPUT_INVALID: "이미지와 대체텍스트를 확인해 주세요.",
      PROMOTION_MEDIA_NOT_FOUND: "처리할 이미지를 찾을 수 없습니다.",
      PROMOTION_MEDIA_CONFLICT: "다른 곳에서 이미지가 변경되었습니다. 최신 내용을 다시 확인해 주세요.",
      PROMOTION_MEDIA_SIGNED_UPLOAD_FAILED: "이미지 업로드를 준비하지 못했습니다.",
      PROMOTION_MEDIA_OBJECT_VALIDATION_FAILED: "업로드한 이미지 파일을 확인하지 못했습니다.",
      PROMOTION_MEDIA_FINALIZE_FAILED: "이미지 등록을 완료하지 못했습니다.",
      PROMOTION_MEDIA_REMOVE_FAILED: "이미지를 삭제하지 못했습니다.",
      PROMOTION_MEDIA_SERVER_UNAVAILABLE: "이미지 처리 서비스를 사용할 수 없습니다.",
    };
    return {
      ok: false,
      message: messages[error.code] ?? "이미지 작업을 완료하지 못했습니다.",
      shouldRefresh:
        error.code === "PROMOTION_MEDIA_CONFLICT" ||
        error.code === "PROMOTION_MEDIA_AUTHENTICATION_REQUIRED",
    };
  }
  return { ok: false, message: "배너·홍보 관리 작업을 완료하지 못했습니다.", shouldRefresh: false };
}

function refreshManagement(promotionKey?: string) {
  revalidatePath("/manage");
  revalidatePath("/manage/banners");
  revalidatePath("/manage/banners/new");
  if (promotionKey) revalidatePath(`/manage/banners/${promotionKey}`);
}

export async function savePromotionAction(input: unknown): Promise<PromotionManagementActionResult> {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) return { ok: false, message: "로그인이 필요합니다.", shouldRefresh: true };
  try {
    const row = exactObject(input, ["requestId", "promotionKey", "expectedVersion", "draft"]);
    const normalizedDraft = normalizePromotionEditorDraft(row.draft);
    const normalizedRequestId = requestId(row.requestId);
    const isCreate = row.promotionKey === null;
    if (isCreate) {
      if (row.expectedVersion !== null || normalizedDraft.contentStatus !== "draft") throw validation();
      const result = await mutatePromotion(context.supabase, {
        requestId: normalizedRequestId,
        operation: "create",
        payload: promotionDraftToPayload(normalizedDraft, false),
      });
      refreshManagement(result.promotion.promotionKey);
      return {
        ok: true,
        message: result.replayed ? "저장된 홍보 초안을 다시 확인했습니다." : "홍보 초안을 저장했습니다.",
        promotionKey: result.promotion.promotionKey,
      };
    }
    const promotionKey = key(row.promotionKey, "홍보 콘텐츠");
    const result = await mutatePromotion(context.supabase, {
      requestId: normalizedRequestId,
      operation: "update",
      promotionKey,
      expectedVersion: version(row.expectedVersion),
      payload: promotionDraftToPayload(normalizedDraft, true),
    });
    refreshManagement(promotionKey);
    return {
      ok: true,
      message: result.replayed ? "저장된 변경 내용을 다시 확인했습니다." : "홍보 내용을 저장했습니다.",
      promotionKey,
    };
  } catch (error) {
    return safeFailure(error);
  }
}

export async function archivePromotionAction(input: unknown): Promise<PromotionManagementActionResult> {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) return { ok: false, message: "로그인이 필요합니다.", shouldRefresh: true };
  try {
    const row = exactObject(input, ["requestId", "promotionKey", "expectedVersion"]);
    const promotionKey = key(row.promotionKey, "홍보 콘텐츠");
    const result = await mutatePromotion(context.supabase, {
      requestId: requestId(row.requestId),
      operation: "archive",
      promotionKey,
      expectedVersion: version(row.expectedVersion),
    });
    refreshManagement(promotionKey);
    return {
      ok: true,
      message: result.replayed ? "보관된 상태를 다시 확인했습니다." : "홍보 콘텐츠를 보관했습니다.",
      promotionKey,
    };
  } catch (error) {
    return safeFailure(error);
  }
}

export async function mutatePromotionPlacementAction(input: unknown): Promise<PromotionManagementActionResult> {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) return { ok: false, message: "로그인이 필요합니다.", shouldRefresh: true };
  try {
    const row = exactObject(input, [
      "requestId", "operation", "promotionKey", "placementKey", "expectedVersion",
      "slotCode", "startsAt", "endsAt",
    ]);
    if (typeof row.operation !== "string" || !["create", "update", "publish", "hide"].includes(row.operation)) {
      throw validation();
    }
    const operation = row.operation as "create" | "update" | "publish" | "hide";
    const promotionKey = key(row.promotionKey, "홍보 콘텐츠");
    let payload: Record<string, unknown> = {};
    let placementKey: string | undefined;
    let expectedVersion: number | undefined;
    if (operation === "create") {
      if (
        row.placementKey !== null || row.expectedVersion !== null ||
        typeof row.slotCode !== "string" || !slotPattern.test(row.slotCode)
      ) throw validation();
      const period = normalizePublicationPeriod(String(row.startsAt ?? ""), String(row.endsAt ?? ""));
      payload = {
        slot_code: row.slotCode,
        promotion_key: promotionKey,
        starts_at: period.startsAt,
        ends_at: period.endsAt,
      };
    } else {
      placementKey = key(row.placementKey, "게시 배정");
      expectedVersion = version(row.expectedVersion);
      if (operation === "update") {
        if (row.slotCode !== null) throw validation();
        const period = normalizePublicationPeriod(String(row.startsAt ?? ""), String(row.endsAt ?? ""));
        payload = { starts_at: period.startsAt, ends_at: period.endsAt };
      } else if (row.slotCode !== null || row.startsAt !== null || row.endsAt !== null) {
        throw validation();
      }
    }
    const result = await mutatePromotionPlacement(context.supabase, {
      requestId: requestId(row.requestId),
      operation,
      placementKey,
      expectedVersion,
      payload,
    });
    refreshManagement(promotionKey);
    const messages = {
      create: "게시 위치와 기간을 초안으로 저장했습니다.",
      update: "게시 기간을 수정했습니다.",
      publish: result.placement.displayStatus === "scheduled" ? "예약 게시했습니다." : "배너를 게시했습니다.",
      hide: "배너를 숨겼습니다.",
    };
    return { ok: true, message: messages[operation], promotionKey };
  } catch (error) {
    return safeFailure(error);
  }
}

export async function createPromotionMediaUploadIntentAction(
  input: unknown,
): Promise<PromotionManagementActionResult> {
  try {
    const row = exactObject(input, [
      "requestId", "promotionKey", "variant", "altText", "mimeType", "byteSize", "filename",
    ]);
    if (
      typeof row.variant !== "string" || !mediaVariants.has(row.variant) ||
      typeof row.altText !== "string" || typeof row.mimeType !== "string" || !mimeTypes.has(row.mimeType) ||
      typeof row.byteSize !== "number" || typeof row.filename !== "string"
    ) throw validation("이미지와 대체텍스트를 확인해 주세요.");
    const upload = await createPromotionMediaUploadIntent({
      requestId: requestId(row.requestId),
      promotionKey: key(row.promotionKey, "홍보 콘텐츠"),
      variant: row.variant as "desktop_banner" | "mobile_banner",
      sortOrder: 0,
      altText: row.altText,
      declaredMimeType: row.mimeType as "image/jpeg" | "image/png" | "image/webp",
      declaredByteSize: row.byteSize,
      originalFilename: row.filename,
    });
    return { ok: true, message: "이미지 업로드를 준비했습니다.", upload };
  } catch (error) {
    return safeFailure(error);
  }
}

export async function failPromotionMediaUploadAction(input: unknown): Promise<PromotionManagementActionResult> {
  try {
    const row = exactObject(input, ["mediaKey"]);
    await failPromotionMediaUpload(key(row.mediaKey, "이미지"));
    return { ok: true, message: "실패한 이미지 업로드를 정리했습니다." };
  } catch (error) {
    return safeFailure(error);
  }
}

export async function finalizePromotionMediaUploadAction(
  input: unknown,
): Promise<PromotionManagementActionResult> {
  try {
    const row = exactObject(input, ["promotionKey", "mediaKey", "requestId"]);
    const promotionKey = key(row.promotionKey, "홍보 콘텐츠");
    await finalizePromotionMediaUpload(
      key(row.mediaKey, "이미지"),
      requestId(row.requestId),
    );
    refreshManagement(promotionKey);
    return { ok: true, message: "이미지를 등록했습니다.", promotionKey };
  } catch (error) {
    return safeFailure(error);
  }
}

export async function removePromotionMediaAction(input: unknown): Promise<PromotionManagementActionResult> {
  try {
    const row = exactObject(input, ["promotionKey", "mediaKey", "expectedVersion", "requestId"]);
    const promotionKey = key(row.promotionKey, "홍보 콘텐츠");
    const result = await removePromotionMedia(
      key(row.mediaKey, "이미지"),
      version(row.expectedVersion),
      requestId(row.requestId),
    );
    refreshManagement(promotionKey);
    return {
      ok: true,
      message: result.storageRemoved
        ? "이미지를 삭제했습니다."
        : "이미지 등록은 해제했지만 Storage 정리는 다시 확인해 주세요.",
      promotionKey,
    };
  } catch (error) {
    return safeFailure(error);
  }
}
