"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import {
  HallOfFameMemberUiError,
  normalizeHallOfFameDisputeSubmitInput,
  normalizeHallOfFameDisputeWithdrawInput,
  submitHallOfFameDispute,
  toHallOfFameMemberUiError,
  withdrawHallOfFameDispute,
} from "@/lib/hall-of-fame/hallOfFameMemberUi";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export type HallOfFameMemberActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string; shouldRefresh: boolean };

type HallOfFameMemberActionFailure = Extract<
  HallOfFameMemberActionResult,
  { ok: false }
>;

function authenticationFailure(): HallOfFameMemberActionFailure {
  return {
    ok: false,
    message: "로그인 상태를 다시 확인해 주세요.",
    shouldRefresh: true,
  };
}

function actionFailure(error: unknown): HallOfFameMemberActionFailure {
  const safeError = toHallOfFameMemberUiError(error);
  return {
    ok: false,
    message: safeError.userMessage,
    shouldRefresh: safeError.shouldRefresh,
  };
}

export async function submitHallOfFameDisputeAction(
  input: unknown,
): Promise<HallOfFameMemberActionResult> {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) return authenticationFailure();

  try {
    const normalized = normalizeHallOfFameDisputeSubmitInput(input);
    const result = await submitHallOfFameDispute(
      context.supabase,
      normalized,
      randomUUID(),
    );
    if (result.status !== "open") {
      throw new HallOfFameMemberUiError(
        "malformedResponse",
        "요청 처리 결과를 안전하게 확인할 수 없습니다.",
      );
    }
    revalidatePath("/hall-of-fame");
    return {
      ok: true,
      message: "요청이 접수되었습니다. 운영자가 확인 후 처리합니다.",
    };
  } catch (error) {
    const failure = actionFailure(error);
    if (failure.shouldRefresh) revalidatePath("/hall-of-fame");
    return failure;
  }
}

export async function withdrawHallOfFameDisputeAction(
  input: unknown,
): Promise<HallOfFameMemberActionResult> {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) return authenticationFailure();

  try {
    const normalized = normalizeHallOfFameDisputeWithdrawInput(input);
    const result = await withdrawHallOfFameDispute(
      context.supabase,
      normalized,
      randomUUID(),
    );
    if (result.status !== "withdrawn") {
      throw new HallOfFameMemberUiError(
        "malformedResponse",
        "요청 취소 결과를 안전하게 확인할 수 없습니다.",
      );
    }
    revalidatePath("/hall-of-fame");
    return {
      ok: true,
      message: result.changed
        ? "요청을 취소했습니다."
        : "이미 취소된 요청입니다.",
    };
  } catch (error) {
    const failure = actionFailure(error);
    if (failure.shouldRefresh) revalidatePath("/hall-of-fame");
    return failure;
  }
}
