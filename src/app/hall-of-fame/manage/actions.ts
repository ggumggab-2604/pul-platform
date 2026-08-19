"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import {
  HallOfFameOperatorError,
  addHallOfFameDisputeInternalNote,
  getHallOfFameDisputeResolutionContext,
  resolveHallOfFameDispute,
  resolveHallOfFameDisputeWithCorrection,
  resolveHallOfFameDisputeWithRevoke,
  startHallOfFameDisputeReview,
  toHallOfFameOperatorError,
  type HallOfFameCorrectionInput,
  type HallOfFameNoActionInput,
  type HallOfFameRevokeInput,
} from "@/lib/hall-of-fame/hallOfFameOperatorUi";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export type HallOfFameOperatorServerActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string; shouldRefresh: boolean };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactInput(value: unknown, keys: readonly string[]) {
  if (!isPlainRecord(value)) throw validationError();
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw validationError();
  }
  return value;
}

function validationError() {
  return new HallOfFameOperatorError(
    "validation",
    "입력 내용과 최신 요청 상태를 다시 확인해 주세요.",
  );
}

function uuid(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw validationError();
  return value;
}

function version(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw validationError();
  return value as number;
}

function text(value: unknown, minimum = 2, maximum = 2000): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  const length = [...normalized].length;
  if (length < minimum || length > maximum) throw validationError();
  return normalized;
}

function optionalText(value: unknown, maximum = 2000): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return text(value, 1, maximum);
}

function integer(value: unknown, minimum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) throw validationError();
  return value as number;
}

function optionalInteger(value: unknown, minimum: number): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return integer(value, minimum);
}

function authenticationFailure(): HallOfFameOperatorServerActionResult {
  return {
    ok: false,
    message: "로그인 상태를 다시 확인해 주세요.",
    shouldRefresh: true,
  };
}

function actionFailure(error: unknown): HallOfFameOperatorServerActionResult {
  const safeError = toHallOfFameOperatorError(error);
  return {
    ok: false,
    message: safeError.userMessage,
    shouldRefresh: safeError.shouldRefresh,
  };
}

function normalizeIdentityInput(value: unknown) {
  const row = exactInput(value, ["disputeId", "expectedVersion"]);
  return {
    disputeId: uuid(row.disputeId),
    expectedVersion: version(row.expectedVersion),
  };
}

function normalizeNoteInput(value: unknown) {
  const row = exactInput(value, ["disputeId", "expectedVersion", "note"]);
  return {
    disputeId: uuid(row.disputeId),
    expectedVersion: version(row.expectedVersion),
    note: text(row.note),
  };
}

const noActionOutcomes = new Set([
  "correction_denied",
  "appeal_denied",
  "re_review_recommended",
  "objection_not_upheld",
  "fraud_not_substantiated",
  "already_remediated",
]);

function normalizeNoActionInput(value: unknown): HallOfFameNoActionInput {
  const row = exactInput(value, [
    "disputeId",
    "expectedVersion",
    "resolutionOutcome",
    "resolutionMessage",
    "internalNote",
  ]);
  if (typeof row.resolutionOutcome !== "string" || !noActionOutcomes.has(row.resolutionOutcome)) {
    throw validationError();
  }
  return {
    disputeId: uuid(row.disputeId),
    expectedVersion: version(row.expectedVersion),
    resolutionOutcome: row.resolutionOutcome as HallOfFameNoActionInput["resolutionOutcome"],
    resolutionMessage: text(row.resolutionMessage),
    internalNote: text(row.internalNote),
  };
}

const correctionReasonCodes = new Set([
  "factual_error",
  "wrong_record_type",
  "administrative_error",
  "evidence_clarification",
]);
const recordTypes = new Set(["hole_in_one", "albatross", "condor"]);
const courseEnvironments = new Set(["outdoor", "screen"]);

function normalizeCorrectionInput(value: unknown): HallOfFameCorrectionInput {
  const row = exactInput(value, [
    "disputeId",
    "expectedDisputeVersion",
    "canonicalRecordId",
    "expectedRecordVersion",
    "recordTypeCode",
    "playedOn",
    "courseName",
    "courseRegion",
    "courseEnvironment",
    "courseLayout",
    "courseSegment",
    "holeNumber",
    "holePar",
    "strokes",
    "nominatingClubId",
    "correctionReasonCode",
    "correctionReason",
    "resolutionMessage",
    "internalNote",
  ]);
  if (
    typeof row.recordTypeCode !== "string" ||
    !recordTypes.has(row.recordTypeCode) ||
    typeof row.courseEnvironment !== "string" ||
    !courseEnvironments.has(row.courseEnvironment) ||
    typeof row.correctionReasonCode !== "string" ||
    !correctionReasonCodes.has(row.correctionReasonCode) ||
    typeof row.playedOn !== "string" ||
    !DATE_PATTERN.test(row.playedOn)
  ) {
    throw validationError();
  }
  return {
    disputeId: uuid(row.disputeId),
    expectedDisputeVersion: version(row.expectedDisputeVersion),
    canonicalRecordId: uuid(row.canonicalRecordId),
    expectedRecordVersion: version(row.expectedRecordVersion),
    recordTypeCode: row.recordTypeCode as HallOfFameCorrectionInput["recordTypeCode"],
    playedOn: row.playedOn,
    courseName: text(row.courseName, 1, 200),
    courseRegion: text(row.courseRegion, 1, 100),
    courseEnvironment: row.courseEnvironment as HallOfFameCorrectionInput["courseEnvironment"],
    courseLayout: optionalText(row.courseLayout, 200),
    courseSegment: text(row.courseSegment, 1, 100),
    holeNumber: integer(row.holeNumber, 1),
    holePar: optionalInteger(row.holePar, 1),
    strokes: optionalInteger(row.strokes, 1),
    nominatingClubId:
      row.nominatingClubId === undefined || row.nominatingClubId === null || row.nominatingClubId === ""
        ? undefined
        : uuid(row.nominatingClubId),
    correctionReasonCode:
      row.correctionReasonCode as HallOfFameCorrectionInput["correctionReasonCode"],
    correctionReason: text(row.correctionReason, 2, 1000),
    resolutionMessage: text(row.resolutionMessage),
    internalNote: text(row.internalNote),
  };
}

const revocationReasonCodes = new Set([
  "factual_error",
  "insufficient_or_invalid_evidence",
  "duplicate_record",
  "wrong_subject",
  "wrong_record_type",
  "administrative_error",
  "fraud_confirmed",
]);

function normalizeRevokeInput(value: unknown): HallOfFameRevokeInput {
  const row = exactInput(value, [
    "disputeId",
    "expectedDisputeVersion",
    "canonicalRecordId",
    "expectedRecordVersion",
    "revocationReasonCode",
    "revocationReason",
    "resolutionMessage",
    "internalNote",
  ]);
  if (
    typeof row.revocationReasonCode !== "string" ||
    !revocationReasonCodes.has(row.revocationReasonCode)
  ) {
    throw validationError();
  }
  return {
    disputeId: uuid(row.disputeId),
    expectedDisputeVersion: version(row.expectedDisputeVersion),
    canonicalRecordId: uuid(row.canonicalRecordId),
    expectedRecordVersion: version(row.expectedRecordVersion),
    revocationReasonCode:
      row.revocationReasonCode as HallOfFameRevokeInput["revocationReasonCode"],
    revocationReason: text(row.revocationReason, 2, 1000),
    resolutionMessage: text(row.resolutionMessage),
    internalNote: text(row.internalNote),
  };
}

async function withContext(
  operation: (
    context: NonNullable<Awaited<ReturnType<typeof getAuthenticatedSupabaseContext>>>,
  ) => Promise<HallOfFameOperatorServerActionResult>,
) {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) return authenticationFailure();
  try {
    return await operation(context);
  } catch (error) {
    const failure = actionFailure(error);
    if (!failure.ok && failure.shouldRefresh) revalidatePath("/hall-of-fame/manage");
    return failure;
  }
}

export async function startHallOfFameDisputeReviewAction(
  input: unknown,
): Promise<HallOfFameOperatorServerActionResult> {
  return withContext(async ({ supabase }) => {
    const normalized = normalizeIdentityInput(input);
    const result = await startHallOfFameDisputeReview(
      supabase,
      normalized.disputeId,
      normalized.expectedVersion,
      randomUUID(),
    );
    if (result.status !== "under_review") throw validationError();
    revalidatePath("/hall-of-fame/manage");
    return { ok: true, message: result.changed ? "검토를 시작했습니다." : "이미 검토 중입니다." };
  });
}

export async function addHallOfFameDisputeInternalNoteAction(
  input: unknown,
): Promise<HallOfFameOperatorServerActionResult> {
  return withContext(async ({ supabase }) => {
    const normalized = normalizeNoteInput(input);
    const result = await addHallOfFameDisputeInternalNote(
      supabase,
      normalized.disputeId,
      normalized.expectedVersion,
      normalized.note,
      randomUUID(),
    );
    if (result.status !== "under_review") throw validationError();
    revalidatePath("/hall-of-fame/manage");
    return { ok: true, message: "운영자 내부 메모를 저장했습니다." };
  });
}

export async function resolveHallOfFameDisputeAction(
  input: unknown,
): Promise<HallOfFameOperatorServerActionResult> {
  return withContext(async ({ supabase }) => {
    const normalized = normalizeNoActionInput(input);
    const result = await resolveHallOfFameDispute(supabase, normalized, randomUUID());
    if (result.status !== "resolved") throw validationError();
    revalidatePath("/hall-of-fame/manage");
    revalidatePath("/hall-of-fame");
    return { ok: true, message: "요청 처리를 완료했습니다." };
  });
}

function assertFreshContext(
  actual: Awaited<ReturnType<typeof getHallOfFameDisputeResolutionContext>>,
  expected: { disputeId: string; disputeVersion: number; canonicalRecordId: string; recordVersion: number },
) {
  if (
    actual.disputeId !== expected.disputeId ||
    actual.disputeVersion !== expected.disputeVersion ||
    actual.canonicalRecordId !== expected.canonicalRecordId ||
    actual.canonicalRecordVersion !== expected.recordVersion
  ) {
    throw new HallOfFameOperatorError(
      "conflict",
      "요청 또는 기록이 변경되었습니다. 최신 내용을 확인한 뒤 다시 시도해 주세요.",
      true,
    );
  }
}

export async function resolveHallOfFameDisputeWithCorrectionAction(
  input: unknown,
): Promise<HallOfFameOperatorServerActionResult> {
  return withContext(async ({ supabase }) => {
    const normalized = normalizeCorrectionInput(input);
    const context = await getHallOfFameDisputeResolutionContext(supabase, normalized.disputeId);
    assertFreshContext(context, {
      disputeId: normalized.disputeId,
      disputeVersion: normalized.expectedDisputeVersion,
      canonicalRecordId: normalized.canonicalRecordId,
      recordVersion: normalized.expectedRecordVersion,
    });
    const result = await resolveHallOfFameDisputeWithCorrection(
      supabase,
      normalized,
      randomUUID(),
    );
    if (result.status !== "resolved") throw validationError();
    revalidatePath("/hall-of-fame/manage");
    revalidatePath("/hall-of-fame");
    return { ok: true, message: "기록 정정과 요청 처리를 완료했습니다." };
  });
}

export async function resolveHallOfFameDisputeWithRevokeAction(
  input: unknown,
): Promise<HallOfFameOperatorServerActionResult> {
  return withContext(async ({ supabase }) => {
    const normalized = normalizeRevokeInput(input);
    const context = await getHallOfFameDisputeResolutionContext(supabase, normalized.disputeId);
    assertFreshContext(context, {
      disputeId: normalized.disputeId,
      disputeVersion: normalized.expectedDisputeVersion,
      canonicalRecordId: normalized.canonicalRecordId,
      recordVersion: normalized.expectedRecordVersion,
    });
    const result = await resolveHallOfFameDisputeWithRevoke(supabase, normalized, randomUUID());
    if (result.status !== "resolved") throw validationError();
    revalidatePath("/hall-of-fame/manage");
    revalidatePath("/hall-of-fame");
    return { ok: true, message: "기록 무효화와 요청 처리를 완료했습니다." };
  });
}
