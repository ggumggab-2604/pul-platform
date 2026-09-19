import type { SupabaseClient } from "@supabase/supabase-js";
import { communityReportReasons, type CommunityReportReason } from "./communityReports";

export const moderationTypes = { post: "커뮤니티 글", comment: "커뮤니티 댓글", course: "골프장 이야기", certification: "시험 준비 이야기" } as const;
export type ModerationType = keyof typeof moderationTypes;
export type ModerationFilter = "all" | "published" | "restricted";
export type ModerationItem = {
  id: string; title: string; body: string; baseState: "published" | "hidden" | "removed";
  restricted: boolean; version: number; moderationVersion: number; createdAt: string; parentVisible: boolean;
};
export type ModerationPage = { items: ModerationItem[]; total: number; hasMore: boolean };
export type ModerationInput = {
  targetType: ModerationType; targetId: string; action: "restrict" | "restore"; reason: CommunityReportReason;
  expectedVersion: number; expectedModerationVersion: number; reportId?: string | null;
};
const messages = {
  login: "로그인이 필요합니다.", permission: "콘텐츠 운영 권한이 없습니다.",
  invalid: "대상과 처리 사유를 확인해 주세요.", missing: "대상 콘텐츠를 찾을 수 없습니다.",
  conflict: "대상이나 신고가 변경되었습니다. 새로고침 후 내용을 다시 확인해 주세요.",
  state: "현재 상태에서는 처리할 수 없습니다. 이미 삭제되었거나 다른 숨김 상태일 수 있습니다.",
  parent: "상위 게시글 또는 골프장이 공개 상태가 아니어서 복원할 수 없습니다.",
  unknown: "콘텐츠를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
} as const;
export class ContentModerationError extends Error {
  constructor(public readonly code: keyof typeof messages) { super(messages[code]); }
}
export const isModerationType = (value: unknown): value is ModerationType => typeof value === "string" && Object.hasOwn(moderationTypes, value);
const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const isVersion = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 2147483647;
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new ContentModerationError("unknown");
  return v as Record<string, unknown>;
}
function fail(e: { message?: string; code?: string }): never {
  const codes: Record<string, keyof typeof messages> = {
    moderation_invalid: "invalid", moderation_missing: "missing", moderation_conflict: "conflict",
    moderation_state: "state", moderation_parent_unavailable: "parent", moderation_target_mismatch: "invalid", community_report_permission: "permission",
    "로그인이 필요합니다.": "login",
  };
  const message = e.message ?? "";
  throw new ContentModerationError(Object.hasOwn(codes, message) ? codes[message] : e.code === "42501" ? "permission" : "unknown");
}
export async function listContentForModeration(client: SupabaseClient, type: ModerationType, filter: ModerationFilter, targetId: string | null, limit = 20, offset = 0): Promise<ModerationPage> {
  if (!isModerationType(type) || !["all", "published", "restricted"].includes(filter) || (targetId !== null && !isUuid(targetId))
    || !Number.isInteger(limit) || limit < 1 || limit > 30 || !isVersion(offset)) throw new ContentModerationError("invalid");
  const { data, error } = await client.rpc("list_content_for_moderation", { p_target_type: type, p_filter: filter, p_target_id: targetId, p_limit: limit, p_offset: offset });
  if (error) fail(error);
  const page = object(data);
  if (!Array.isArray(page.items) || !Number.isSafeInteger(page.total) || (page.total as number) < 0 || typeof page.has_more !== "boolean") throw new ContentModerationError("unknown");
  const items = page.items.map((value): ModerationItem => {
    const row = object(value);
    if (!isUuid(row.id) || typeof row.title !== "string" || typeof row.body !== "string"
      || !["published", "hidden", "removed"].includes(String(row.base_state)) || typeof row.restricted !== "boolean"
      || !isVersion(row.version) || !isVersion(row.moderation_version) || typeof row.parent_visible !== "boolean"
      || typeof row.created_at !== "string" || !Number.isFinite(Date.parse(row.created_at))) throw new ContentModerationError("unknown");
    return { id: row.id, title: row.title, body: row.body, baseState: row.base_state as ModerationItem["baseState"], restricted: row.restricted,
      version: row.version, moderationVersion: row.moderation_version, createdAt: row.created_at, parentVisible: row.parent_visible };
  });
  return { items, total: page.total as number, hasMore: page.has_more };
}
export async function moderateContent(client: SupabaseClient, input: ModerationInput) {
  if (!input || !isModerationType(input.targetType) || !isUuid(input.targetId) || !["restrict", "restore"].includes(input.action)
    || typeof input.reason !== "string" || !Object.hasOwn(communityReportReasons, input.reason) || !isVersion(input.expectedVersion) || !isVersion(input.expectedModerationVersion)
    || (input.reportId != null && (!isUuid(input.reportId) || input.action !== "restrict" || !["post", "comment"].includes(input.targetType)))) throw new ContentModerationError("invalid");
  const { data, error } = await client.rpc("moderate_public_content", {
    p_target_type: input.targetType, p_target_id: input.targetId, p_action: input.action, p_reason: input.reason,
    p_expected_version: input.expectedVersion, p_expected_moderation_version: input.expectedModerationVersion, p_report_id: input.reportId ?? null,
  });
  if (error) fail(error);
  const result = object(data);
  if (result.id !== input.targetId || result.restricted !== (input.action === "restrict")
    || result.moderation_version !== input.expectedModerationVersion + 1 || result.report_resolved !== (input.reportId != null)) throw new ContentModerationError("unknown");
}
