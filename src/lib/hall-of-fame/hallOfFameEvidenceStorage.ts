import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import {
  isHallOfFameEvidenceMimeType,
  validateHallOfFameEvidenceBytes,
  type HallOfFameEvidenceMimeType,
} from "@/lib/hall-of-fame/hallOfFameEvidenceValidation";

const SERVICE_ROLE_ENV_NAME = "SUPABASE_SERVICE_ROLE_KEY";
const SIGNED_READ_SECONDS = 60;
const EVIDENCE_CLEANUP_PERMISSION = "hall_of_fame.records.revoke";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let serviceClient: SupabaseClient | undefined;

type JsonRow = Record<string, unknown>;

export class HallOfFameEvidenceError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "HallOfFameEvidenceError";
  }
}

function getServiceClient() {
  if (serviceClient) {
    return serviceClient;
  }
  const { url } = getSupabasePublicEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRoleKey) {
    throw new Error(`${SERVICE_ROLE_ENV_NAME} is not configured.`);
  }
  serviceClient = createSupabaseClient(url, serviceRoleKey, {
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
  if (!context) {
    throw new HallOfFameEvidenceError("HOF_AUTHENTICATION_REQUIRED");
  }
  return context;
}

function firstRow(data: unknown, code: string): JsonRow {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new HallOfFameEvidenceError(code);
  }
  return row as JsonRow;
}

function stringField(row: JsonRow, key: string) {
  const value = row[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new HallOfFameEvidenceError("HOF_EVIDENCE_RESPONSE_INVALID");
  }
  return value;
}

function numberField(row: JsonRow, key: string) {
  const value = row[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new HallOfFameEvidenceError("HOF_EVIDENCE_RESPONSE_INVALID");
  }
  return value;
}

function optionalStringField(row: JsonRow, key: string) {
  const value = row[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function throwRpcError(error: { message?: string } | null, fallback: string): never {
  const match = error?.message?.match(/HOF_[A-Z0-9_]+/);
  throw new HallOfFameEvidenceError(match?.[0] ?? fallback);
}

async function getUploadContext(actorUserId: string, evidenceId: string) {
  const { data, error } = await getServiceClient().rpc(
    "get_hall_of_fame_evidence_upload_context_server",
    { p_actor_user_id: actorUserId, p_evidence_id: evidenceId },
  );
  if (error) {
    throwRpcError(error, "HOF_EVIDENCE_UPLOAD_NOT_AUTHORIZED");
  }
  const row = firstRow(data, "HOF_EVIDENCE_UPLOAD_NOT_AUTHORIZED");
  const mimeType = stringField(row, "declared_mime_type");
  if (!isHallOfFameEvidenceMimeType(mimeType)) {
    throw new HallOfFameEvidenceError("HOF_EVIDENCE_RESPONSE_INVALID");
  }
  return {
    evidenceId: stringField(row, "evidence_id"),
    bucket: stringField(row, "storage_bucket"),
    path: stringField(row, "storage_path"),
    mimeType,
    byteSize: numberField(row, "declared_byte_size"),
    expiresAt: stringField(row, "upload_expires_at"),
    evidenceVersion: numberField(row, "evidence_version"),
    batchVersion: numberField(row, "batch_version"),
  };
}

async function signUpload(actorUserId: string, evidenceId: string) {
  const upload = await getUploadContext(actorUserId, evidenceId);
  const { data, error } = await getServiceClient()
    .storage.from(upload.bucket)
    .createSignedUploadUrl(upload.path, { upsert: false });
  if (error || !data?.signedUrl || !data.token) {
    throw new HallOfFameEvidenceError("HOF_EVIDENCE_SIGNED_UPLOAD_FAILED");
  }
  return {
    evidenceId: upload.evidenceId,
    signedUrl: data.signedUrl,
    token: data.token,
    mimeType: upload.mimeType,
    byteSize: upload.byteSize,
    expiresAt: upload.expiresAt,
    evidenceVersion: upload.evidenceVersion,
    batchVersion: upload.batchVersion,
  };
}

export type CreateEvidenceUploadIntentInput = {
  applicationRecordId: string;
  evidenceType: "scorecard" | "round_photo" | "supporting_document";
  declaredMimeType: HallOfFameEvidenceMimeType;
  declaredByteSize: number;
  expectedBatchVersion: number;
  requestId: string;
};

export async function createHallOfFameEvidenceUploadIntent(
  input: CreateEvidenceUploadIntentInput,
) {
  const context = await requireUser();
  const { data, error } = await context.supabase.rpc(
    "create_hall_of_fame_evidence_upload_intent",
    {
      p_application_record_id: input.applicationRecordId,
      p_evidence_type: input.evidenceType,
      p_declared_mime_type: input.declaredMimeType,
      p_declared_size_bytes: input.declaredByteSize,
      p_expected_batch_version: input.expectedBatchVersion,
      p_request_id: input.requestId,
    },
  );
  if (error) {
    throwRpcError(error, "HOF_EVIDENCE_UPLOAD_INTENT_FAILED");
  }
  const row = firstRow(data, "HOF_EVIDENCE_UPLOAD_INTENT_FAILED");
  return {
    ...(await signUpload(context.userId, stringField(row, "evidence_id"))),
    recordVersion: numberField(row, "record_version"),
    replayed: row.replayed === true,
  };
}

export type CreateEvidenceReplacementIntentInput = {
  evidenceId: string;
  declaredMimeType: HallOfFameEvidenceMimeType;
  declaredByteSize: number;
  expectedBatchVersion: number;
  requestId: string;
};

export async function createHallOfFameEvidenceReplacementIntent(
  input: CreateEvidenceReplacementIntentInput,
) {
  const context = await requireUser();
  const { data, error } = await context.supabase.rpc(
    "create_hall_of_fame_evidence_replacement_intent",
    {
      p_evidence_id: input.evidenceId,
      p_declared_mime_type: input.declaredMimeType,
      p_declared_size_bytes: input.declaredByteSize,
      p_expected_batch_version: input.expectedBatchVersion,
      p_request_id: input.requestId,
    },
  );
  if (error) {
    throwRpcError(error, "HOF_EVIDENCE_REPLACEMENT_INTENT_FAILED");
  }
  const row = firstRow(data, "HOF_EVIDENCE_REPLACEMENT_INTENT_FAILED");
  return {
    ...(await signUpload(context.userId, stringField(row, "evidence_id"))),
    replacesEvidenceId: stringField(row, "replaces_evidence_id"),
    recordVersion: numberField(row, "record_version"),
    replayed: row.replayed === true,
  };
}

async function markFailed(
  evidenceId: string,
  evidenceVersion: number,
  batchVersion: number,
) {
  await getServiceClient().rpc("mark_hall_of_fame_evidence_failed_server", {
    p_evidence_id: evidenceId,
    p_expected_evidence_version: evidenceVersion,
    p_expected_batch_version: batchVersion,
    p_request_id: randomUUID(),
  });
}

export type FinalizeEvidenceInput = {
  evidenceId: string;
  expectedEvidenceVersion: number;
  expectedBatchVersion: number;
  requestId: string;
};

export async function finalizeHallOfFameEvidence(input: FinalizeEvidenceInput) {
  const context = await requireUser();
  const upload = await getUploadContext(context.userId, input.evidenceId);
  let bytes: Uint8Array;
  try {
    const { data, error } = await getServiceClient()
      .storage.from(upload.bucket)
      .download(upload.path);
    if (error || !data) {
      throw new Error("HOF_EVIDENCE_OBJECT_MISSING");
    }
    bytes = new Uint8Array(await data.arrayBuffer());
    validateHallOfFameEvidenceBytes(
      bytes,
      upload.mimeType,
      upload.byteSize,
      data.type,
    );
  } catch (error) {
    await markFailed(
      input.evidenceId,
      input.expectedEvidenceVersion,
      input.expectedBatchVersion,
    ).catch(() => undefined);
    throw new HallOfFameEvidenceError(
      error instanceof Error && /^HOF_[A-Z0-9_]+$/.test(error.message)
        ? error.message
        : "HOF_EVIDENCE_OBJECT_VALIDATION_FAILED",
    );
  }
  const sha256Hex = createHash("sha256").update(bytes).digest("hex");
  const { data, error } = await getServiceClient().rpc(
    "finalize_hall_of_fame_evidence_server",
    {
      p_actor_user_id: context.userId,
      p_evidence_id: input.evidenceId,
      p_verified_mime_type: upload.mimeType,
      p_verified_size_bytes: bytes.byteLength,
      p_verified_sha256_hex: sha256Hex,
      p_expected_evidence_version: input.expectedEvidenceVersion,
      p_expected_batch_version: input.expectedBatchVersion,
      p_request_id: input.requestId,
    },
  );
  if (error) {
    throwRpcError(error, "HOF_EVIDENCE_FINALIZE_FAILED");
  }
  const row = firstRow(data, "HOF_EVIDENCE_FINALIZE_FAILED");
  const replacedEvidenceId = optionalStringField(row, "replaced_evidence_id");
  if (replacedEvidenceId) {
    await cleanupHallOfFameEvidenceObjects(500, replacedEvidenceId).catch(
      () => undefined,
    );
  }
  return {
    evidenceId: stringField(row, "evidence_id"),
    status: stringField(row, "status"),
    evidenceVersion: numberField(row, "evidence_version"),
    batchVersion: numberField(row, "batch_version"),
    recordVersion: numberField(row, "record_version"),
    replacedEvidenceId,
    replayed: row.replayed === true,
  };
}

export async function createHallOfFameEvidenceSignedRead(evidenceId: string) {
  const context = await requireUser();
  const { data, error } = await getServiceClient().rpc(
    "get_hall_of_fame_evidence_read_context_server",
    { p_actor_user_id: context.userId, p_evidence_id: evidenceId },
  );
  if (error) {
    throwRpcError(error, "HOF_EVIDENCE_READ_NOT_AUTHORIZED");
  }
  const row = firstRow(data, "HOF_EVIDENCE_READ_NOT_AUTHORIZED");
  const bucket = stringField(row, "storage_bucket");
  const path = stringField(row, "storage_path");
  const signed = await getServiceClient()
    .storage.from(bucket)
    .createSignedUrl(path, SIGNED_READ_SECONDS);
  if (signed.error || !signed.data?.signedUrl) {
    throw new HallOfFameEvidenceError("HOF_EVIDENCE_SIGNED_READ_FAILED");
  }
  return {
    evidenceId: stringField(row, "evidence_id"),
    signedUrl: signed.data.signedUrl,
    expiresInSeconds: SIGNED_READ_SECONDS,
    mimeType: stringField(row, "mime_type"),
    byteSize: numberField(row, "byte_size"),
    sha256: stringField(row, "sha256_hex"),
  };
}

const cleanupStatuses = new Set([
  "pending_upload",
  "failed",
  "expired",
  "replaced",
  "deleted",
] as const);

export type HallOfFameEvidenceCleanupStatus =
  | "pending_upload"
  | "failed"
  | "expired"
  | "replaced"
  | "deleted";

type CleanupCandidate = {
  evidence_id: string;
  actor_user_id: string;
  application_batch_id: string;
  application_record_id: string | null;
  storage_bucket: string;
  storage_path: string;
  status: HallOfFameEvidenceCleanupStatus;
  evidence_version: number;
  batch_version: number;
};

export type HallOfFameEvidenceCleanupCandidate = {
  evidenceId: string;
  status: HallOfFameEvidenceCleanupStatus;
  evidenceVersion: number;
  batchVersion: number;
};

export type HallOfFameEvidenceCleanupManagement = {
  authenticationStatus: "signedIn" | "signedOut";
  availability: "available" | "loadFailed";
  canManage: boolean;
  candidates: HallOfFameEvidenceCleanupCandidate[];
};

function uuidField(row: JsonRow, key: string) {
  const value = stringField(row, key);
  if (!UUID_PATTERN.test(value)) {
    throw new HallOfFameEvidenceError("HOF_EVIDENCE_RESPONSE_INVALID");
  }
  return value;
}

function cleanupStatusField(row: JsonRow) {
  const value = stringField(row, "status");
  if (!cleanupStatuses.has(value as HallOfFameEvidenceCleanupStatus)) {
    throw new HallOfFameEvidenceError("HOF_EVIDENCE_RESPONSE_INVALID");
  }
  return value as HallOfFameEvidenceCleanupStatus;
}

function nullableUuidField(row: JsonRow, key: string) {
  if (row[key] === null) return null;
  return uuidField(row, key);
}

function parseCleanupCandidates(data: unknown): CleanupCandidate[] {
  if (!Array.isArray(data)) {
    throw new HallOfFameEvidenceError("HOF_EVIDENCE_CLEANUP_LIST_FAILED");
  }
  return data.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new HallOfFameEvidenceError("HOF_EVIDENCE_RESPONSE_INVALID");
    }
    const row = value as JsonRow;
    const storageBucket = stringField(row, "storage_bucket");
    if (storageBucket !== "hall-of-fame-evidence") {
      throw new HallOfFameEvidenceError("HOF_EVIDENCE_RESPONSE_INVALID");
    }
    const evidenceId = uuidField(row, "evidence_id");
    const applicationBatchId = uuidField(row, "application_batch_id");
    const storagePath = stringField(row, "storage_path");
    if (
      storagePath !==
      `applications/${applicationBatchId}/${evidenceId}/original`
    ) {
      throw new HallOfFameEvidenceError("HOF_EVIDENCE_RESPONSE_INVALID");
    }
    const evidenceVersion = numberField(row, "evidence_version");
    const batchVersion = numberField(row, "batch_version");
    if (evidenceVersion < 1 || batchVersion < 1) {
      throw new HallOfFameEvidenceError("HOF_EVIDENCE_RESPONSE_INVALID");
    }
    return {
      evidence_id: evidenceId,
      actor_user_id: uuidField(row, "actor_user_id"),
      application_batch_id: applicationBatchId,
      application_record_id: nullableUuidField(row, "application_record_id"),
      storage_bucket: storageBucket,
      storage_path: storagePath,
      status: cleanupStatusField(row),
      evidence_version: evidenceVersion,
      batch_version: batchVersion,
    };
  });
}

async function hasEvidenceCleanupPermission(
  context: Awaited<ReturnType<typeof requireUser>>,
) {
  const { data, error } = await context.supabase.rpc(
    "current_user_has_platform_permission",
    { p_permission_code: EVIDENCE_CLEANUP_PERMISSION },
  );
  if (error || typeof data !== "boolean") {
    throw new HallOfFameEvidenceError("HOF_EVIDENCE_PERMISSION_CHECK_FAILED");
  }
  return data;
}

async function requireEvidenceCleanupPermission() {
  const context = await requireUser();
  if (!(await hasEvidenceCleanupPermission(context))) {
    throw new HallOfFameEvidenceError("HOF_EVIDENCE_CLEANUP_NOT_AUTHORIZED");
  }
  return context;
}

async function listCleanupCandidates(limit = 100, onlyEvidenceId?: string) {
  const rpcName = onlyEvidenceId
    ? "get_hall_of_fame_evidence_cleanup_context_server"
    : "list_hall_of_fame_evidence_cleanup_candidates_server";
  const args = onlyEvidenceId
    ? { p_evidence_id: onlyEvidenceId }
    : { p_limit: limit };
  const { data, error } = await getServiceClient().rpc(rpcName, args);
  if (error) {
    throwRpcError(error, "HOF_EVIDENCE_CLEANUP_LIST_FAILED");
  }
  return parseCleanupCandidates(data);
}

async function markStorageDeleted(
  candidate: CleanupCandidate,
  deleted: boolean,
  requestId: string = randomUUID(),
) {
  const { data, error } = await getServiceClient().rpc(
    "mark_hall_of_fame_evidence_storage_deleted_server",
    {
      p_evidence_id: candidate.evidence_id,
      p_deleted: deleted,
      p_error_code: deleted ? null : "HOF_STORAGE_DELETE_FAILED",
      p_request_id: requestId,
    },
  );
  if (error) {
    throwRpcError(error, "HOF_EVIDENCE_CLEANUP_MARK_FAILED");
  }
  const row = firstRow(data, "HOF_EVIDENCE_CLEANUP_MARK_FAILED");
  if (
    uuidField(row, "evidence_id") !== candidate.evidence_id ||
    cleanupStatusField(row) === "pending_upload" ||
    typeof row.replayed !== "boolean" ||
    (deleted && typeof row.storage_deleted_at !== "string") ||
    (!deleted && row.storage_deleted_at !== null) ||
    (!deleted && row.storage_delete_error_code !== "HOF_STORAGE_DELETE_FAILED")
  ) {
    throw new HallOfFameEvidenceError("HOF_EVIDENCE_RESPONSE_INVALID");
  }
  return row;
}

export async function cleanupHallOfFameEvidenceObjects(
  limit = 100,
  onlyEvidenceId?: string,
) {
  const candidates = await listCleanupCandidates(limit, onlyEvidenceId);
  const results = [];
  for (const candidate of candidates) {
    if (candidate.status === "pending_upload") {
      const expired = await getServiceClient().rpc(
        "expire_hall_of_fame_evidence_server",
        {
          p_evidence_id: candidate.evidence_id,
          p_expected_evidence_version: candidate.evidence_version,
          p_expected_batch_version: candidate.batch_version,
          p_request_id: randomUUID(),
        },
      );
      if (expired.error) {
        results.push({ evidenceId: candidate.evidence_id, deleted: false });
        continue;
      }
    }
    const removed = await getServiceClient()
      .storage.from(candidate.storage_bucket)
      .remove([candidate.storage_path]);
    const deleted = !removed.error;
    await markStorageDeleted(candidate, deleted).catch(() => undefined);
    results.push({ evidenceId: candidate.evidence_id, deleted });
  }
  return results;
}

export async function resolveHallOfFameEvidenceCleanupManagement(): Promise<HallOfFameEvidenceCleanupManagement> {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) {
    return {
      authenticationStatus: "signedOut",
      availability: "available",
      canManage: false,
      candidates: [],
    };
  }

  try {
    const canManage = await hasEvidenceCleanupPermission(context);
    if (!canManage) {
      return {
        authenticationStatus: "signedIn",
        availability: "available",
        canManage: false,
        candidates: [],
      };
    }
    const candidates = await listCleanupCandidates(500);
    return {
      authenticationStatus: "signedIn",
      availability: "available",
      canManage: true,
      candidates: candidates.map((candidate) => ({
        evidenceId: candidate.evidence_id,
        status: candidate.status,
        evidenceVersion: candidate.evidence_version,
        batchVersion: candidate.batch_version,
      })),
    };
  } catch {
    return {
      authenticationStatus: "signedIn",
      availability: "loadFailed",
      canManage: false,
      candidates: [],
    };
  }
}

export type CleanupEvidenceForOperatorInput = {
  evidenceId: string;
  expectedEvidenceVersion: number;
  expectedBatchVersion: number;
  expireRequestId: string;
  storageRequestId: string;
};

export async function cleanupHallOfFameEvidenceForOperator(
  input: CleanupEvidenceForOperatorInput,
) {
  await requireEvidenceCleanupPermission();
  const [candidate, ...duplicates] = await listCleanupCandidates(
    1,
    input.evidenceId,
  );
  if (!candidate || duplicates.length > 0) {
    throw new HallOfFameEvidenceError("HOF_EVIDENCE_NOT_CLEANABLE");
  }
  if (
    candidate.evidence_version !== input.expectedEvidenceVersion ||
    candidate.batch_version !== input.expectedBatchVersion
  ) {
    throw new HallOfFameEvidenceError("HOF_EVIDENCE_CLEANUP_STALE");
  }

  if (candidate.status === "pending_upload") {
    const expired = await getServiceClient().rpc(
      "expire_hall_of_fame_evidence_server",
      {
        p_evidence_id: candidate.evidence_id,
        p_expected_evidence_version: input.expectedEvidenceVersion,
        p_expected_batch_version: input.expectedBatchVersion,
        p_request_id: input.expireRequestId,
      },
    );
    if (expired.error) {
      throwRpcError(expired.error, "HOF_EVIDENCE_EXPIRE_FAILED");
    }
    const expiredRow = firstRow(expired.data, "HOF_EVIDENCE_EXPIRE_FAILED");
    if (
      uuidField(expiredRow, "evidence_id") !== candidate.evidence_id ||
      stringField(expiredRow, "status") !== "expired" ||
      typeof expiredRow.replayed !== "boolean"
    ) {
      throw new HallOfFameEvidenceError("HOF_EVIDENCE_RESPONSE_INVALID");
    }
  }

  const removed = await getServiceClient()
    .storage.from(candidate.storage_bucket)
    .remove([candidate.storage_path]);
  const deleted = !removed.error;
  await markStorageDeleted(candidate, deleted, input.storageRequestId);
  return {
    evidenceId: candidate.evidence_id,
    deleted,
    retryable: !deleted,
  };
}

export type WithdrawEvidenceInput = {
  evidenceId: string;
  expectedEvidenceVersion: number;
  expectedBatchVersion: number;
  requestId: string;
};

export async function withdrawHallOfFameEvidence(input: WithdrawEvidenceInput) {
  const context = await requireUser();
  const { data, error } = await context.supabase.rpc(
    "withdraw_hall_of_fame_evidence",
    {
      p_evidence_id: input.evidenceId,
      p_expected_evidence_version: input.expectedEvidenceVersion,
      p_expected_batch_version: input.expectedBatchVersion,
      p_request_id: input.requestId,
    },
  );
  if (error) {
    throwRpcError(error, "HOF_EVIDENCE_WITHDRAW_FAILED");
  }
  const row = firstRow(data, "HOF_EVIDENCE_WITHDRAW_FAILED");
  await cleanupHallOfFameEvidenceObjects(500, input.evidenceId).catch(
    () => undefined,
  );
  return {
    evidenceId: stringField(row, "evidence_id"),
    status: stringField(row, "status"),
    evidenceVersion: numberField(row, "evidence_version"),
    batchVersion: numberField(row, "batch_version"),
    recordVersion: numberField(row, "record_version"),
    replayed: row.replayed === true,
  };
}
