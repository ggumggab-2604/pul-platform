import type { SupabaseClient } from "@supabase/supabase-js";

export const contentKeys = ["checklist", "beginner", "safety", "help", "policy"] as const;
export type ContentKey = typeof contentKeys[number];
export type ContentBody = { title: string; intro: string; body: string; sections: { title: string; description: string; items: string[] }[]; attachments: string[]; visible: boolean };
export type ContentRevision = { id: string; key: ContentKey; content: ContentBody; revision: number; state: "draft" | "published"; consentVersion: string | null; publishedAt: string | null; effectiveNotice: string; reason: string; baseId: string | null };
export type ContentSnapshot = { mode: "legacy" | "managed"; current: Partial<Record<ContentKey, ContentRevision>> };
export type ContentManagement = { current: ContentSnapshot["current"]; drafts: ContentRevision[]; history: ContentRevision[] };
export type ContentCommand = { operation: "save" | "publish"; key: ContentKey; draftId: string; expectedRevision: number; baseId: string | null; requestId: string; content: ContentBody; reason: string };
export const stalePolicyMessage = "정책이 변경되어 최신 정책 확인과 동의가 필요합니다. 작성 내용과 선택한 사진은 유지됩니다.";
export const contentUnavailable = "안내·정책을 확인하지 못했습니다. 저장을 진행할 수 없습니다. 잠시 후 다시 확인해 주세요.";
export class MarketContentError extends Error {
  constructor(public code: "permission" | "conflict" | "unavailable" | "validation" | "uncertain", message: string) { super(message); }
}
export const contentUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateContent(value: ContentBody): ContentBody {
  if (!value || typeof value.title !== "string" || !value.title.trim() || value.title.length > 160 ||
    typeof value.intro !== "string" || value.intro.length > 2000 || typeof value.body !== "string" || value.body.length > 20000 ||
    typeof value.visible !== "boolean" || !Array.isArray(value.sections) || value.sections.length > 30 ||
    value.sections.some(s => !s || typeof s.title !== "string" || s.title.length > 160 || typeof s.description !== "string" || s.description.length > 4000 ||
      !Array.isArray(s.items) || s.items.length > 40 || s.items.some(i => typeof i !== "string" || i.length > 4000)) ||
    !Array.isArray(value.attachments) || value.attachments.length > 8 || value.attachments.some(id => typeof id !== "string" || !contentUuid.test(id)) ||
    new Set(value.attachments).size !== value.attachments.length || JSON.stringify(value).length > 60000) {
    throw new MarketContentError("validation", "제목·본문·체크 항목·첨부 입력 범위를 확인해 주세요.");
  }
  return { title: value.title, intro: value.intro, body: value.body, sections: value.sections, attachments: value.attachments, visible: value.visible };
}
export function parseRevision(value: unknown): ContentRevision {
  if (!value || typeof value !== "object") throw new MarketContentError("unavailable", contentUnavailable);
  const r = value as ContentRevision;
  if (!contentUuid.test(r.id) || !contentKeys.includes(r.key) || !Number.isSafeInteger(r.revision) || r.revision < 1 ||
      !["draft", "published"].includes(r.state) || (r.consentVersion !== null && !/^market-policy-[a-zA-Z0-9-]+$/.test(r.consentVersion)) ||
      typeof r.reason !== "string" || typeof r.effectiveNotice !== "string" ||
      (r.baseId !== null && !contentUuid.test(r.baseId)) || (r.publishedAt !== null && !Number.isFinite(Date.parse(r.publishedAt)))) {
    throw new MarketContentError("unavailable", contentUnavailable);
  }
  validateContent(r.content);
  if (r.state === "published" && r.key === "policy" && (!r.consentVersion || !r.content.visible)) throw new MarketContentError("unavailable", contentUnavailable);
  return r;
}
export function contentFailure(error: { code?: string; message?: string }): never {
  if (error.code === "42501") throw new MarketContentError("permission", "장터 안내·정책 관리 권한이 없습니다.");
  if (error.code === "40001") throw new MarketContentError("conflict", "초안 또는 현재 게시본이 변경되었습니다. 입력을 보관하고 다시 조회해 주세요.");
  if (error.code === "22023") throw new MarketContentError("validation", "입력 내용과 첨부 상태를 확인해 주세요.");
  if (error.code === "PGRST202" || error.code === "42883") throw new MarketContentError("unavailable", "안내·정책 관리 DB 변경이 아직 적용되지 않았습니다.");
  throw new MarketContentError("uncertain", "응답을 확인하지 못했습니다. 결과를 다시 조회한 뒤 같은 요청으로 재시도해 주세요.");
}
export async function readPublishedContent(client: SupabaseClient): Promise<ContentSnapshot> {
  const { data, error } = await client.rpc("get_market_published_content");
  if (error) contentFailure(error);
  if (!Array.isArray(data)) throw new MarketContentError("unavailable", contentUnavailable);
  const current: ContentSnapshot["current"] = {};
  for (const value of data) { const r = parseRevision(value); if (r.state !== "published" || current[r.key]) throw new MarketContentError("unavailable", contentUnavailable); current[r.key] = r; }
  if (!current.policy) throw new MarketContentError("unavailable", contentUnavailable);
  return { mode: "managed", current };
}
export async function readContentManagement(client: SupabaseClient): Promise<ContentManagement> {
  const { data, error } = await client.rpc("get_market_content_management");
  if (error) contentFailure(error);
  if (!data || !Array.isArray(data.current) || !Array.isArray(data.drafts) || !Array.isArray(data.history)) throw new MarketContentError("unavailable", contentUnavailable);
  const current: ContentManagement["current"] = {};
  for (const value of data.current) { const r = parseRevision(value); current[r.key] = r; }
  return { current, drafts: data.drafts.map(parseRevision), history: data.history.map(parseRevision) };
}
export async function writeContent(client: SupabaseClient, input: ContentCommand): Promise<ContentRevision> {
  if (!input || !["save", "publish"].includes(input.operation) || !contentKeys.includes(input.key) ||
    !contentUuid.test(input.draftId) || !contentUuid.test(input.requestId) || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 ||
    (input.baseId !== null && !contentUuid.test(input.baseId)) || typeof input.reason !== "string" || !input.reason.trim() || input.reason.length > 2000 ||
    (input.key === "policy" && !input.content.visible)) throw new MarketContentError("validation", "초안·변경 사유를 확인해 주세요.");
  const content = validateContent(input.content);
  const { data, error } = await client.rpc("mutate_market_content", { p_input: { ...input, content } });
  if (error) contentFailure(error);
  return parseRevision(data);
}
