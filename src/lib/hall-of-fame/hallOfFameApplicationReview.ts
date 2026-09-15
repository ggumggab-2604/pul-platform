import type { SupabaseClient } from "@supabase/supabase-js";

export type ApplicationPermissions = { canRead: boolean; canReview: boolean; canDecide: boolean };
export const APPLICATION_PERMISSIONS = {
  read: "hall_of_fame.applications.read",
  review: "hall_of_fame.applications.review",
  decide: "hall_of_fame.applications.decide",
} as const;
const activeStatuses = ["submitted", "under_review", "additional_info_required"] as const;
const recordStatuses = [...activeStatuses, "draft", "approved", "rejected", "withdrawn", "cancelled"] as const;
const consentStatuses = ["pending", "granted", "declined", "withdrawn"] as const;
const applicationTypes = ["club_nomination", "direct_application", "club_admin_vacancy_direct_application"] as const;

export class ApplicationReviewError extends Error {
  constructor(message = "신청 정보를 확인할 수 없습니다. 최신 목록을 다시 불러와 주세요.", public readonly shouldRefresh = true) { super(message); }
}
function invalid(): never { throw new ApplicationReviewError(); }
function row(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function list(value: unknown): unknown[] { return Array.isArray(value) ? value : invalid(); }
function text(value: unknown): string { return typeof value === "string" && value.length > 0 ? value : invalid(); }
function optionalText(value: unknown): string | null { return value === null ? null : text(value); }
function bool(value: unknown): boolean { return typeof value === "boolean" ? value : invalid(); }
export function reviewUuid(value: unknown): string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value.toLowerCase() : invalid();
}
function integer(value: unknown, minimum = 0, maximum = 2147483647): number {
  return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum ? value as number : invalid();
}
function version(value: unknown) { return integer(value, 1); }
function nullableUuid(value: unknown) { return value === null ? null : reviewUuid(value); }
function timestamp(value: unknown): string { const result = text(value); return Number.isFinite(Date.parse(result)) ? result : invalid(); }
function oneOf<const T extends readonly string[]>(value: unknown, values: T): T[number] {
  return typeof value === "string" && values.includes(value) ? value as T[number] : invalid();
}
function unique<T>(items: T[], key: (item: T) => string): T[] {
  return new Set(items.map(key)).size === items.length ? items : invalid();
}
function batch(value: unknown) {
  const r = row(value);
  return {
    id: reviewUuid(r.application_batch_id), type: oneOf(r.application_type, applicationTypes),
    status: oneOf(r.review_status, activeStatuses), version: version(r.batch_version), submittedAt: timestamp(r.submitted_at),
  };
}
export function parseApplicationQueue(value: unknown) {
  const items = list(value);
  if (items.length > 10) return invalid();
  return unique(items.map(value => { const r = row(value); return { ...batch(r), count: integer(r.active_record_count) }; }), r => r.id);
}
export type ApplicationQueueItem = ReturnType<typeof parseApplicationQueue>[number];

export function parseApplicationDetail(value: unknown, batchId: string) {
  const rows = list(value);
  if (rows.length !== 1) return invalid();
  const r = row(rows[0]), application = batch(r.application_batch);
  if (application.id !== reviewUuid(batchId)) return invalid();
  const round = row(r.round_snapshot);
  const date = text(round.played_on);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date).toISOString().slice(0, 10) !== date) return invalid();
  const records = unique(list(r.application_records).map(value => {
    const record = row(value), id = reviewUuid(record.application_record_id);
    const summary = row(record.confirmation_status_summary);
    const publication = record.publication_consent === null ? null : row(record.publication_consent);
    const publicationFlags = ["display_name_consent", "masked_display_name_consent", "full_display_name_consent", "avatar_consent", "club_name_consent", "record_date_consent", "course_detail_consent", "badge_consent"] as const;
    return {
      id, targetUserId: reviewUuid(record.target_user_id), version: version(record.record_version),
      status: oneOf(record.review_status, recordStatuses),
      type: oneOf(record.record_type_code, ["hole_in_one", "albatross", "condor"] as const),
      segment: text(record.course_segment), hole: integer(record.hole_number, 1, 36),
      par: record.hole_par === null ? null : integer(record.hole_par, 1, 9),
      strokes: record.strokes === null ? null : integer(record.strokes, 1, 99),
      clubStatus: oneOf(record.club_verification_status, ["not_applicable", "pending", "conflict_review_required", "independent_confirmation_pending", "verified", "rejected"] as const),
      memberConsent: oneOf(record.member_consent_status, consentStatuses), conflict: bool(record.conflict_of_interest),
      consents: unique(list(record.application_consents).map(value => {
        const c = row(value); return { purpose: text(c.consent_purpose), status: oneOf(c.status, consentStatuses), policy: text(c.policy_version), version: version(c.version) };
      }), c => c.purpose),
      publication: publication === null ? null : {
        status: oneOf(publication.status, consentStatuses), policy: text(publication.policy_version), version: version(publication.version),
        flags: publicationFlags.map(key => ({ key, granted: bool(publication[key]) })),
      },
      companions: integer(record.valid_companion_count),
      confirmations: ["pending", "confirmed", "declined", "withdrawn", "expired"].map(key => ({ status: key, count: integer(summary[key]) })),
      evidence: unique(list(record.evidence).map(value => {
        const e = row(value);
        if (reviewUuid(e.application_record_id) !== id) return invalid();
        return { id: reviewUuid(e.evidence_id), type: oneOf(e.evidence_type, ["scorecard", "round_photo", "supporting_document"] as const),
          status: oneOf(e.status, ["pending_upload", "uploaded_unverified", "available", "replaced", "deleted", "failed", "expired"] as const),
          mime: optionalText(e.verified_mime_type), bytes: e.verified_size_bytes === null ? null : integer(e.verified_size_bytes),
        };
      }), e => e.id),
    };
  }), r => r.id);
  if (records.length === 0) return invalid();
  return {
    batch: application,
    round: { date, course: text(round.course_name), region: text(round.course_region),
      environment: oneOf(round.course_environment, ["outdoor", "screen"] as const), layout: optionalText(round.course_layout),
      type: oneOf(round.round_type, ["casual", "club_event", "tournament", "practice"] as const), event: optionalText(round.event_name), notes: optionalText(round.notes),
    }, records,
    events: list(r.review_events).map(value => { const e = row(value); return { id: reviewUuid(e.review_event_id), action: text(e.review_action), createdAt: timestamp(e.created_at) }; }),
  };
}
export type ApplicationDetail = ReturnType<typeof parseApplicationDetail>;
export async function loadApplicationDetail(client: Pick<SupabaseClient, "rpc">, batchId: string) {
  const { data, error } = await client.rpc("get_hall_of_fame_review_detail", { p_application_batch_id: reviewUuid(batchId) });
  if (error) throw error;
  return parseApplicationDetail(data, batchId);
}

export type RecordDecision = { application_record_id: string; expected_record_version: number; decision: "approve" | "reject"; rejection_reason: string | null };
export type ReviewCommand = { operation: "start"; batchId: string; expectedVersion: number; requestId: string }
  | { operation: "decide"; batchId: string; expectedVersion: number; requestId: string; decisions: RecordDecision[] };
export function parseReviewCommand(input: unknown): ReviewCommand {
  const r = row(input), operation = oneOf(r.operation, ["start", "decide"] as const);
  const keys = ["operation", "batchId", "expectedVersion", "requestId", ...(operation === "decide" ? ["decisions"] : [])];
  if (Object.keys(r).length !== keys.length || keys.some(k => !(k in r))) return invalid();
  const identity = { batchId: reviewUuid(r.batchId), expectedVersion: version(r.expectedVersion), requestId: reviewUuid(r.requestId) };
  if (operation === "start") return { operation, ...identity };
  const decisions = unique(list(r.decisions).map(value => {
    const d = row(value);
    if (Object.keys(d).length !== 4 || !["application_record_id", "expected_record_version", "decision", "rejection_reason"].every(k => k in d)) return invalid();
    const decision = oneOf(d.decision, ["approve", "reject"] as const);
    const reason = d.rejection_reason === null ? null : text(d.rejection_reason).replace(/^ +| +$/g, "");
    if ((decision === "approve" && reason !== null) || (decision === "reject" && (reason === null || reason.length === 0 || [...reason].length > 2000))) {
      throw new ApplicationReviewError("반려 사유를 1~2,000자로 입력해 주세요. 승인에는 반려 사유를 넣을 수 없습니다.", false);
    }
    return { application_record_id: reviewUuid(d.application_record_id), expected_record_version: version(d.expected_record_version), decision, rejection_reason: reason };
  }), d => d.application_record_id);
  if (decisions.length === 0) return invalid();
  return { operation, ...identity, decisions };
}
export function decisionsForDetail(detail: ApplicationDetail, choices: Record<string, { decision: string; reason: string }>): RecordDecision[] {
  if (detail.batch.status !== "under_review" || detail.records.some(r => r.status !== "under_review" && r.status !== "withdrawn")) return invalid();
  const active = detail.records.filter(r => r.status === "under_review");
  if (!active.length || active.some(r => !["approve", "reject"].includes(choices[r.id]?.decision))) {
    throw new ApplicationReviewError("심사 대상 기록 모두에 승인 또는 반려를 선택해 주세요.", false);
  }
  return active.map(r => ({ application_record_id: r.id, expected_record_version: r.version,
    decision: choices[r.id].decision as "approve" | "reject", rejection_reason: choices[r.id].decision === "reject" ? choices[r.id].reason : null }));
}
export function parseReviewResult(value: unknown, command: ReviewCommand) {
  const rows = list(value); if (rows.length !== 1) return invalid();
  const r = row(rows[0]);
  const operation = command.operation === "start" ? "hall_of_fame.application.review.start" : "hall_of_fame.application.final_decision";
  if (r.operation !== operation || reviewUuid(r.request_id) !== command.requestId || reviewUuid(r.application_batch_id) !== command.batchId || version(r.batch_version) !== command.expectedVersion + 1) return invalid();
  bool(r.replayed);
  if (command.operation === "start") {
    if (r.status !== "under_review") return invalid();
    integer(r.transitioned_record_count, 1); timestamp(r.review_started_at);
    return { operation: "start" as const, batchId: command.batchId, status: "under_review" as const, batchVersion: version(r.batch_version) };
  }
  timestamp(r.finalized_at);
  const decisions = unique(list(r.decisions).map(value => {
    const d = row(value), id = reviewUuid(d.application_record_id), expected = command.decisions.find(x => x.application_record_id === id);
    if (!expected || d.status !== (expected.decision === "approve" ? "approved" : "rejected") || version(d.record_version) !== expected.expected_record_version + 1) return invalid();
    const canonicalId = nullableUuid(d.canonical_record_id);
    if ((d.status === "approved") !== (canonicalId !== null)) return invalid();
    return { id, status: d.status as "approved" | "rejected", canonicalId };
  }), d => d.id);
  const approved = integer(r.approved_count), rejected = integer(r.rejected_count);
  if (decisions.length !== command.decisions.length || approved !== decisions.filter(d => d.status === "approved").length || approved + rejected !== decisions.length) return invalid();
  const status = approved === decisions.length ? "approved" : rejected === decisions.length ? "rejected" : "partially_approved";
  if (r.status !== status) return invalid();
  // record_version in the RPC response belongs to the application record, never the canonical record.
  return { operation: "decide" as const, batchId: command.batchId, status, batchVersion: version(r.batch_version), approved, rejected, decisions };
}
export type ReviewResult = ReturnType<typeof parseReviewResult>;

export type ProjectionCommand = { batchId: string; applicationRecordId: string; recordId: string };
export function parseProjectionCommand(input: unknown): ProjectionCommand {
  const r = row(input), keys = ["batchId", "applicationRecordId", "recordId"];
  // Neither an expected version nor a role/request ID is accepted from the client.
  if (Object.keys(r).length !== keys.length || keys.some(k => !(k in r))) return invalid();
  return { batchId: reviewUuid(r.batchId), applicationRecordId: reviewUuid(r.applicationRecordId), recordId: reviewUuid(r.recordId) };
}
const publicationStatuses = ["hidden", "published", "suppressed"] as const;
export function parseProjectionContext(value: unknown, command: ProjectionCommand) {
  const rows = list(value); if (rows.length !== 1) return invalid();
  const r = row(rows[0]);
  if (reviewUuid(r.record_id) !== command.recordId || reviewUuid(r.source_application_record_id) !== command.applicationRecordId
    || reviewUuid(r.source_application_batch_id) !== command.batchId) return invalid();
  return { ...command, recordVersion: version(r.record_version), validityStatus: oneOf(r.validity_status, ["active", "revoked"] as const),
    publicationStatus: oneOf(r.publication_status, publicationStatuses) };
}
export function parseProjectionResult(value: unknown, context: ReturnType<typeof parseProjectionContext>, requestId: string) {
  const rows = list(value); if (rows.length !== 1) return invalid();
  const r = row(rows[0]);
  if (r.operation !== "hall_of_fame.record.projection.sync" || reviewUuid(r.request_id) !== reviewUuid(requestId) || reviewUuid(r.record_id) !== context.recordId) return invalid();
  const recordVersion = version(r.record_version), publicationStatus = oneOf(r.publication_status, publicationStatuses);
  const changed = bool(r.changed), replayed = bool(r.replayed), badgesCreated = integer(r.badges_created, 0, 2);
  if (integer(r.badge_source_count) !== 2) return invalid();
  const publicationChanged = publicationStatus !== context.publicationStatus;
  const validTransition = context.publicationStatus === "hidden" && publicationStatus === "published"
    || context.publicationStatus === "published" && publicationStatus === "suppressed";
  if (context.validityStatus !== "active" || (publicationChanged && !validTransition)
    || recordVersion !== context.recordVersion + (publicationChanged ? 1 : 0)
    || changed !== (publicationChanged || badgesCreated > 0)) return invalid();
  // Badge creation alone may report changed=true without advancing the canonical version.
  return { batchId: context.batchId, applicationRecordId: context.applicationRecordId, recordId: context.recordId,
    recordVersion, publicationStatus, changed, replayed };
}
export type ProjectionResult = ReturnType<typeof parseProjectionResult>;
export function projectionFailure(error: unknown) {
  const r = error && typeof error === "object" ? error as { code?: string; message?: string } : {};
  const message = r.code === "PT409" || /STALE/.test(r.message ?? "")
    ? "다른 처리로 기록이 변경되었습니다. 다시 시도하면 최신 공개 상태를 조회한 뒤 동기화합니다."
    : r.code === "42501" ? "로그인 상태와 플랫폼 관리자 권한을 확인해 주세요."
    : "공개 상태 동기화 결과를 확인할 수 없습니다. 다시 시도하면 최신 상태를 조회합니다.";
  return { ok: false as const, message };
}

export function reviewFailure(error: unknown) {
  if (error instanceof ApplicationReviewError) return { ok: false as const, message: error.message, shouldRefresh: error.shouldRefresh };
  const r = error && typeof error === "object" ? error as { code?: string; message?: string } : {};
  if (r.code === "42501" || /NOT_AUTHORIZED|AUTHENTICATION_REQUIRED|ACTOR_NOT_ACTIVE/.test(r.message ?? "")) return { ok: false as const, message: "로그인 상태와 신청 운영 권한을 확인해 주세요.", shouldRefresh: true };
  if (r.code === "PT409" || /STALE|STATE|NOT_SUBMITTED|NOT_FOUND/.test(r.message ?? "")) return { ok: false as const, message: "다른 처리로 신청 상태가 변경되었습니다. 최신 목록과 상세를 다시 확인해 주세요.", shouldRefresh: true };
  if (r.code === "22023") return { ok: false as const, message: "모든 기록의 결정과 반려 사유를 다시 확인해 주세요.", shouldRefresh: false };
  return { ok: false as const, message: "처리 결과를 확인할 수 없습니다. 최신 상태를 확인한 뒤 다시 시도해 주세요.", shouldRefresh: true };
}
