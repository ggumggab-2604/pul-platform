"use server";

import { revalidatePath } from "next/cache";

import {
  ClubDirectoryError,
  registerClub,
  type ClubRegistrationInput,
} from "@/lib/clubs/clubDirectory";
import {
  ClubDirectoryCorrectionError,
  clubDirectoryCorrectionTargets,
  resolveClubDirectoryCorrectionRequest,
  submitClubDirectoryCorrectionRequest,
  type ClubDirectoryCorrectionResolveResult,
  type ClubDirectoryCorrectionResolution,
  type ClubDirectoryCorrectionSubmitResult,
  type ClubDirectoryCorrectionTarget,
} from "@/lib/clubs/clubDirectoryCorrectionRequests";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type CorrectionSubmitActionResult =
  | { ok: true; data: ClubDirectoryCorrectionSubmitResult; message: string }
  | { ok: false; error: string; authenticationRequired: boolean };

type CorrectionResolveActionResult =
  | { ok: true; data: ClubDirectoryCorrectionResolveResult; message: string }
  | { ok: false; error: string; shouldRefresh: boolean };

function plainRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  return value as Record<string, unknown>;
}

function exactRecord(value: unknown, keys: readonly string[]) {
  const record = plainRecord(value);
  if (!record) return null;
  const ownKeys = Reflect.ownKeys(record);
  if (
    ownKeys.length !== keys.length ||
    ownKeys.some((key) => typeof key !== "string" || !keys.includes(key)) ||
    keys.some((key) => !Object.prototype.propertyIsEnumerable.call(record, key))
  ) {
    return null;
  }
  return record;
}

function parseCorrectionSubmitActionInput(input: unknown) {
  const root = exactRecord(input, ["clubPublicKey", "requestId", "payload"]);
  const payload = exactRecord(root?.payload, [
    "target",
    "displayedValue",
    "proposedValue",
    "reason",
    "note",
  ]);
  if (
    !root ||
    !payload ||
    typeof root.clubPublicKey !== "string" ||
    typeof root.requestId !== "string" ||
    typeof payload.target !== "string" ||
    !clubDirectoryCorrectionTargets.includes(
      payload.target as ClubDirectoryCorrectionTarget,
    ) ||
    !(payload.displayedValue === undefined || typeof payload.displayedValue === "string") ||
    typeof payload.proposedValue !== "string" ||
    typeof payload.reason !== "string" ||
    !(payload.note === undefined || typeof payload.note === "string")
  ) {
    throw new ClubDirectoryCorrectionError(
      "validation",
      "동호회 정보 수정 제보 내용을 확인해 주세요.",
    );
  }
  return {
    clubPublicKey: root.clubPublicKey,
    requestId: root.requestId,
    payload: {
      target: payload.target as ClubDirectoryCorrectionTarget,
      displayedValue: payload.displayedValue as string | undefined,
      proposedValue: payload.proposedValue,
      reason: payload.reason,
      note: payload.note as string | undefined,
    },
  };
}

function parseCorrectionResolveActionInput(input: unknown) {
  const root = exactRecord(input, [
    "requestKey",
    "expectedVersion",
    "resolution",
    "resolutionNote",
    "requestId",
  ]);
  if (
    !root ||
    typeof root.requestKey !== "string" ||
    typeof root.expectedVersion !== "number" ||
    (root.resolution !== "completed" && root.resolution !== "closed") ||
    typeof root.resolutionNote !== "string" ||
    typeof root.requestId !== "string"
  ) {
    throw new ClubDirectoryCorrectionError(
      "validation",
      "동호회 정보 수정 제보 처리 내용을 확인해 주세요.",
    );
  }
  return {
    requestKey: root.requestKey,
    expectedVersion: root.expectedVersion,
    resolution: root.resolution as ClubDirectoryCorrectionResolution,
    resolutionNote: root.resolutionNote,
    requestId: root.requestId,
  };
}

export async function registerClubAction(input: {
  requestId: string;
  payload: ClubRegistrationInput;
}) {
  try {
    const result = await registerClub(
      await createClient(),
      input.requestId,
      input.payload,
    );
    revalidatePath("/");
    revalidatePath("/clubs");
    revalidatePath(`/clubs/${encodeURIComponent(result.publicKey)}`);
    return { ok: true as const, data: result };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof ClubDirectoryError
          ? error.userMessage
          : "동호회 등록을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      authenticationRequired:
        error instanceof ClubDirectoryError && error.code === "authentication",
    };
  }
}

export async function submitClubDirectoryCorrectionRequestAction(
  input: unknown,
): Promise<CorrectionSubmitActionResult> {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) {
    return {
      ok: false,
      error: "로그인이 필요합니다.",
      authenticationRequired: true,
    };
  }

  try {
    const parsed = parseCorrectionSubmitActionInput(input);
    const result = await submitClubDirectoryCorrectionRequest(
      context.supabase,
      parsed,
    );
    revalidatePath(`/clubs/${encodeURIComponent(result.clubPublicKey)}/manage/corrections`);
    revalidatePath("/manage/club-directory-corrections");
    return {
      ok: true,
      data: result,
      message: "동호회 정보 수정 제보가 접수되었습니다.",
    };
  } catch (error) {
    const safe =
      error instanceof ClubDirectoryCorrectionError
        ? error
        : new ClubDirectoryCorrectionError(
            "unknown",
            "동호회 정보 수정 제보를 접수하지 못했습니다. 잠시 후 다시 시도해 주세요.",
          );
    return {
      ok: false,
      error: safe.userMessage,
      authenticationRequired: safe.code === "authentication",
    };
  }
}

export async function resolveClubDirectoryCorrectionRequestAction(
  input: unknown,
): Promise<CorrectionResolveActionResult> {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) {
    return {
      ok: false,
      error: "로그인이 필요합니다.",
      shouldRefresh: true,
    };
  }

  try {
    const parsed = parseCorrectionResolveActionInput(input);
    const result = await resolveClubDirectoryCorrectionRequest(
      context.supabase,
      parsed,
    );
    revalidatePath(`/clubs/${encodeURIComponent(result.clubPublicKey)}/manage/corrections`);
    revalidatePath("/manage/club-directory-corrections");
    return {
      ok: true,
      data: result,
      message:
        result.requestStatus === "completed"
          ? "제보를 처리 완료했습니다. 동호회 정보는 자동 변경되지 않았습니다."
          : "제보를 종료했습니다. 동호회 정보는 자동 변경되지 않았습니다.",
    };
  } catch (error) {
    const safe =
      error instanceof ClubDirectoryCorrectionError
        ? error
        : new ClubDirectoryCorrectionError(
            "unknown",
            "동호회 정보 수정 제보를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
          );
    return {
      ok: false,
      error: safe.userMessage,
      shouldRefresh:
        safe.code === "authentication" ||
        safe.code === "permission" ||
        safe.code === "conflict" ||
        safe.code === "notFound",
    };
  }
}
