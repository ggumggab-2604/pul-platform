import type { SupabaseClient } from "@supabase/supabase-js";

export const communityReportReasons = {
  spam: "스팸·광고",
  harassment: "욕설·괴롭힘",
  inappropriate: "부적절한 내용",
  fraud: "사기·허위 정보 의심",
  other: "기타",
} as const;
export type CommunityReportReason = keyof typeof communityReportReasons;
export type CommunityReportTarget = "post" | "comment";
export type CommunityReportFilter = "open" | "resolved" | "all";
export type CommunityReportInput = { targetType: CommunityReportTarget; targetId: string; reason: CommunityReportReason; detail: string };
export type CommunityReport = {
  id: string; targetType: CommunityReportTarget; postId: string; commentId: string | null;
  title: string; body: string; targetState: "published" | "hidden" | "removed";
  reason: CommunityReportReason; detail: string; status: "open" | "resolved";
  createdAt: string; resolvedAt: string | null;
};
export type CommunityReportPage = { items: CommunityReport[]; total: number; hasMore: boolean };

const messages = {
  invalid: "신고 대상과 이유를 확인해 주세요. 추가 설명은 1,000자까지 입력할 수 있습니다.",
  login: "로그인 후 신고할 수 있습니다.",
  permission: "이 요청을 처리할 권한이 없습니다. 정상 활동 계정과 운영 권한을 확인해 주세요.",
  self: "본인의 콘텐츠는 신고할 수 없습니다. 수정·삭제 기능을 이용해 주세요.",
  unavailable: "신고 대상을 찾을 수 없습니다. 삭제되거나 비공개로 변경되었을 수 있습니다.",
  missing: "신고 내역을 찾을 수 없습니다. 목록을 새로고침해 주세요.",
  unknown: "신고 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
} as const;
export class CommunityReportError extends Error {
  constructor(public readonly code: keyof typeof messages) { super(messages[code]); }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value: unknown): value is string => typeof value === "string" && uuid.test(value);
const isReason = (value: unknown): value is CommunityReportReason => typeof value === "string" && Object.hasOwn(communityReportReasons, value);

export function validateCommunityReportInput(input: CommunityReportInput): CommunityReportInput {
  if (!input || !["post", "comment"].includes(input.targetType) || !isUuid(input.targetId)
    || !isReason(input.reason) || typeof input.detail !== "string" || [...input.detail.trim()].length > 1000) {
    throw new CommunityReportError("invalid");
  }
  return { targetType: input.targetType, targetId: input.targetId, reason: input.reason, detail: input.detail.trim() };
}
function fail(error: { message?: string; code?: string }): never {
  const codes: Record<string, keyof typeof messages> = {
    community_report_invalid: "invalid", community_report_self: "self",
    community_report_target_unavailable: "unavailable", community_report_missing: "missing",
    community_report_permission: "permission", "로그인이 필요합니다.": "login",
    "정상 활동 계정만 커뮤니티에 글을 작성할 수 있습니다.": "permission",
  };
  throw new CommunityReportError(codes[error.message ?? ""] ?? (error.code === "42501" ? "permission" : "unknown"));
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CommunityReportError("unknown");
  return value as Record<string, unknown>;
}

export async function submitCommunityReport(client: SupabaseClient, input: CommunityReportInput) {
  const valid = validateCommunityReportInput(input);
  const { data, error } = await client.rpc("submit_community_report", {
    p_target_type: valid.targetType, p_target_id: valid.targetId, p_reason: valid.reason, p_detail: valid.detail,
  });
  if (error) fail(error);
  const result = object(data);
  if (typeof result.duplicate !== "boolean") throw new CommunityReportError("unknown");
  return { duplicate: result.duplicate };
}

export async function listCommunityReports(client: SupabaseClient, status: CommunityReportFilter = "open", limit = 20, offset = 0): Promise<CommunityReportPage> {
  if (!["open", "resolved", "all"].includes(status) || !Number.isInteger(limit) || limit < 1 || limit > 50
    || !Number.isSafeInteger(offset) || offset < 0 || offset > 2147483647) throw new CommunityReportError("invalid");
  const { data, error } = await client.rpc("list_community_reports", { p_status: status, p_limit: limit, p_offset: offset });
  if (error) fail(error);
  const result = object(data);
  if (!Array.isArray(result.items) || !Number.isSafeInteger(result.total) || (result.total as number) < 0
    || typeof result.has_more !== "boolean") throw new CommunityReportError("unknown");
  const items = result.items.map((value): CommunityReport => {
    const row = object(value);
    if (!isUuid(row.id) || !isUuid(row.post_id) || !["post", "comment"].includes(String(row.target_type))
      || (row.target_type === "post" ? row.comment_id !== null : !isUuid(row.comment_id))
      || typeof row.title !== "string" || typeof row.body !== "string" || typeof row.detail !== "string"
      || !isReason(row.reason) || !["open", "resolved"].includes(String(row.status))
      || !["published", "hidden", "removed"].includes(String(row.target_state))
      || typeof row.created_at !== "string" || !Number.isFinite(Date.parse(row.created_at))
      || (row.status === "open" ? row.resolved_at !== null : typeof row.resolved_at !== "string" || !Number.isFinite(Date.parse(row.resolved_at)))) {
      throw new CommunityReportError("unknown");
    }
    return {
      id: row.id, targetType: row.target_type as CommunityReportTarget, postId: row.post_id,
      commentId: row.comment_id as string | null, title: row.title, body: row.body,
      targetState: row.target_state as CommunityReport["targetState"], reason: row.reason,
      detail: row.detail, status: row.status as CommunityReport["status"], createdAt: row.created_at,
      resolvedAt: row.resolved_at as string | null,
    };
  });
  return { items, total: result.total as number, hasMore: result.has_more };
}

export async function resolveCommunityReport(client: SupabaseClient, reportId: string) {
  if (!isUuid(reportId)) throw new CommunityReportError("invalid");
  const { data, error } = await client.rpc("resolve_community_report", { p_report_id: reportId });
  if (error) fail(error);
  const result = object(data);
  if (result.id !== reportId || result.status !== "resolved") throw new CommunityReportError("unknown");
}
