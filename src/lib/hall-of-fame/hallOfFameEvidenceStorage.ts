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

type CleanupCandidate = {
  evidence_id: string;
  actor_user_id: string;
  storage_bucket: string;
  storage_path: string;
  status: string;
  evidence_version: number;
  batch_version: number;
};

async function markStorageDeleted(
  candidate: CleanupCandidate,
  deleted: boolean,
) {
  await getServiceClient().rpc(
    "mark_hall_of_fame_evidence_storage_deleted_server",
    {
      p_evidence_id: candidate.evidence_id,
      p_deleted: deleted,
      p_error_code: deleted ? null : "HOF_STORAGE_DELETE_FAILED",
      p_request_id: randomUUID(),
    },
  );
}

export async function cleanupHallOfFameEvidenceObjects(
  limit = 100,
  onlyEvidenceId?: string,
) {
  const rpcName = onlyEvidenceId
    ? "get_hall_of_fame_evidence_cleanup_context_server"
    : "list_hall_of_fame_evidence_cleanup_candidates_server";
  const args = onlyEvidenceId
    ? { p_evidence_id: onlyEvidenceId }
    : { p_limit: limit };
  const { data, error } = await getServiceClient().rpc(rpcName, args);
  if (error || !Array.isArray(data)) {
    throwRpcError(error, "HOF_EVIDENCE_CLEANUP_LIST_FAILED");
  }
  const candidates = data as CleanupCandidate[];
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
