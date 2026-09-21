import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Pass the existing authenticated context's client. Never a service-role client,
// sender ID, or caller-selected mailbox owner. RPCs independently bind auth.uid().
const messages = {
  invalid: "쪽지 입력을 확인해 주세요.",
  login: "로그인이 필요합니다.",
  account: "현재 계정으로 쪽지를 이용할 수 없습니다.",
  recipient: "현재 이 회원에게 쪽지를 보낼 수 없습니다.",
  missing: "쪽지를 찾을 수 없습니다.",
  permission: "이 요청을 처리할 권한이 없습니다.",
  cooldown: "잠시 후 다시 보내 주세요.",
  quota: "쪽지 이용 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.",
  duplicate: "같은 내용의 쪽지를 반복해서 보낼 수 없습니다.",
  conflict: "이 요청은 이미 다른 내용으로 처리되었습니다.",
  retry: "요청을 완료하지 못했습니다. 같은 요청으로 다시 시도해 주세요.",
  unknown: "쪽지 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
} as const;
export class MessagingError extends Error {
  constructor(public readonly code: keyof typeof messages) { super(messages[code]); }
}
export const messagingReportReasons = ["spam", "harassment", "inappropriate", "fraud", "other"] as const;
export type MessagingReportReason = typeof messagingReportReasons[number];
export type MessageCursor = { at: string; id: string };
export type MessagePageInput = { limit?: number; cursor?: MessageCursor | null };
export type MessageReceipt = { id: string; createdAt: string };
export type MessageSummary = { id: string; counterpartDisplay: string; preview: string; at: string; readAt: string | null; isReply: boolean };
export type MessageDetail = { id: string; body: string; counterpartUserId: string | null; counterpartDisplay: string; createdAt: string; replyToMessageId: string | null; isRecipient: boolean; readAt: string | null };
export type MessagePage<T> = { items: T[]; hasMore: boolean; nextCursor: MessageCursor | null };
export type MessageReportSummary = { id: string; reason: MessagingReportReason; status: "open" | "resolved"; at: string };
export type MessageReportDetail = Omit<MessageReportSummary, "at"> & {
  messageId: string; body: string; senderDisplay: string; reporterDisplay: string; detail: string;
  createdAt: string; messageCreatedAt: string; resolvedAt: string | null;
};
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const timestamp = (value: unknown): value is string => typeof value === "string"
  && /^\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(value)
  && Number.isFinite(Date.parse(value));
const nullableTime = (value: unknown): value is string | null => value === null || timestamp(value);
const text = (value: unknown, max: number): value is string => typeof value === "string" && [...value].length <= max;
const reason = (value: unknown): value is MessagingReportReason => typeof value === "string" && (messagingReportReasons as readonly string[]).includes(value);
const status = (value: unknown): value is "open" | "resolved" => value === "open" || value === "resolved";
const bad = (): never => { throw new MessagingError("unknown"); };
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return bad();
  return value as Record<string, unknown>;
}
function id(value: unknown): string {
  if (!uuid(value)) throw new MessagingError("invalid");
  return value.toLowerCase();
}
export function validateMessageBody(value: unknown): string {
  if (typeof value !== "string") throw new MessagingError("invalid");
  const body = value.replace(/^[\s\u0085]+|[\s\u0085]+$/gu, "");
  if ([...body].length < 1 || [...body].length > 2000 || body.includes("\0")) throw new MessagingError("invalid");
  return body;
}
export function validateMessagePage(input: MessagePageInput = {}) {
  if (!input || typeof input !== "object") throw new MessagingError("invalid");
  const limit = input.limit ?? 20;
  const cursor = input.cursor ?? null;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50
    || (cursor !== null && (!timestamp(cursor.at) || !uuid(cursor.id)))) throw new MessagingError("invalid");
  // Preserve PostgreSQL microseconds verbatim; Date.toISOString() would lose them.
  return { p_limit: limit, p_cursor_at: cursor?.at ?? null, p_cursor_id: cursor ? id(cursor.id) : null };
}
async function rpc(client: SupabaseClient, name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  let result;
  try { result = await client.rpc(name, args); } catch { throw new MessagingError("unknown"); }
  if (result.error) {
    const codes: Record<string, keyof typeof messages> = {
      messaging_invalid: "invalid", messaging_login: "login", messaging_account_unavailable: "account",
      messaging_recipient_unavailable: "recipient", messaging_not_found: "missing", messaging_permission: "permission",
      messaging_cooldown: "cooldown", messaging_quota: "quota", messaging_recipient_quota: "quota",
      messaging_new_recipient_quota: "quota", messaging_report_quota: "quota", messaging_duplicate: "duplicate",
      messaging_replay_conflict: "conflict", messaging_retry_transaction: "retry",
    };
    const mapped = Object.hasOwn(codes, result.error.message) ? codes[result.error.message] : undefined;
    throw new MessagingError(mapped ?? (result.error.code === "42501" ? "permission" : "unknown"));
  }
  return result.data;
}
function receipt(value: unknown): MessageReceipt {
  const r = object(value);
  if (!uuid(r.id) || !timestamp(r.created_at)) return bad();
  return { id: r.id, createdAt: r.created_at };
}
export async function sendMessage(client: SupabaseClient, input: { recipientId: string; body: string; requestId: string }): Promise<MessageReceipt> {
  if (!input) throw new MessagingError("invalid");
  return receipt(await rpc(client, "send_messaging_message", { p_recipient_id: id(input.recipientId), p_body: validateMessageBody(input.body), p_request_id: id(input.requestId) }));
}
export async function replyMessage(client: SupabaseClient, input: { messageId: string; body: string; requestId: string }): Promise<MessageReceipt> {
  if (!input) throw new MessagingError("invalid");
  return receipt(await rpc(client, "reply_messaging_message", { p_message_id: id(input.messageId), p_body: validateMessageBody(input.body), p_request_id: id(input.requestId) }));
}
function page<T>(value: unknown, parse: (value: unknown) => T, limit: number): MessagePage<T> {
  const r = object(value);
  if (!Array.isArray(r.items) || r.items.length > limit || typeof r.has_more !== "boolean") return bad();
  let nextCursor: MessageCursor | null = null;
  if (r.has_more) {
    const c = object(r.next_cursor);
    const last = object(r.items.at(-1));
    if (r.items.length !== limit || !timestamp(c.at) || !uuid(c.id) || c.id !== last.id || c.at !== last.at) return bad();
    nextCursor = { at: c.at, id: c.id };
  } else if (r.next_cursor !== null) return bad();
  return { items: r.items.map(parse), hasMore: r.has_more, nextCursor };
}
function summary(value: unknown): MessageSummary {
  const r = object(value);
  if (!uuid(r.id) || !text(r.counterpart_display, 100) || !text(r.preview, 100)
    || !timestamp(r.at) || !nullableTime(r.read_at) || typeof r.is_reply !== "boolean") return bad();
  return { id: r.id, counterpartDisplay: r.counterpart_display, preview: r.preview, at: r.at, readAt: r.read_at, isReply: r.is_reply };
}
export async function listMessageInbox(client: SupabaseClient, input: MessagePageInput = {}): Promise<MessagePage<MessageSummary>> {
  const args = validateMessagePage(input);
  return page(await rpc(client, "list_messaging_inbox", args), summary, args.p_limit);
}
export async function listMessageSent(client: SupabaseClient, input: MessagePageInput = {}): Promise<MessagePage<MessageSummary>> {
  const args = validateMessagePage(input);
  return page(await rpc(client, "list_messaging_sent", args), summary, args.p_limit);
}
// markRead is deliberately opt-in: list, prefetch and ordinary detail are read-only.
export async function getMessage(client: SupabaseClient, messageId: string, markRead = false): Promise<MessageDetail> {
  if (typeof markRead !== "boolean") throw new MessagingError("invalid");
  const target = id(messageId);
  const r = object(await rpc(client, "get_messaging_message", { p_message_id: target, p_mark_read: markRead }));
  if (r.id !== target || !text(r.body, 2000) || !r.body || !text(r.counterpart_display, 100) || !timestamp(r.created_at)
    || (r.counterpart_user_id !== null && !uuid(r.counterpart_user_id))
    || (r.reply_to_message_id !== null && !uuid(r.reply_to_message_id)) || typeof r.is_recipient !== "boolean"
    || !nullableTime(r.read_at) || (!r.is_recipient && r.read_at !== null)) return bad();
  return { id: target, body: r.body, counterpartUserId: r.counterpart_user_id as string | null, counterpartDisplay: r.counterpart_display, createdAt: r.created_at,
    replyToMessageId: r.reply_to_message_id as string | null, isRecipient: r.is_recipient, readAt: r.read_at };
}
export async function markMessageRead(client: SupabaseClient, messageId: string) {
  const target = id(messageId);
  const r = object(await rpc(client, "mark_messaging_message_read", { p_message_id: target }));
  if (r.id !== target || !timestamp(r.read_at)) return bad();
  return { id: target, readAt: r.read_at };
}
export async function hideMessage(client: SupabaseClient, messageId: string): Promise<void> {
  const target = id(messageId);
  const r = object(await rpc(client, "hide_messaging_message", { p_message_id: target }));
  if (r.id !== target || r.hidden !== true) return bad();
}
export async function getMessageUnreadCount(client: SupabaseClient): Promise<number> {
  const count = await rpc(client, "get_messaging_unread_count");
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) return bad();
  return count;
}
export async function setMessageBlock(client: SupabaseClient, userId: string, blocked: boolean): Promise<void> {
  if (typeof blocked !== "boolean") throw new MessagingError("invalid");
  const r = object(await rpc(client, "set_messaging_block", { p_user_id: id(userId), p_blocked: blocked }));
  if (r.blocked !== blocked) return bad();
}
export async function submitMessageReport(client: SupabaseClient, input: { messageId: string; reason: MessagingReportReason; detail?: string }) {
  if (!input || !reason(input.reason) || (input.detail !== undefined && typeof input.detail !== "string")) throw new MessagingError("invalid");
  const detail = (input.detail ?? "").replace(/^[\s\u0085]+|[\s\u0085]+$/gu, "");
  if ([...detail].length > 1000 || detail.includes("\0")) throw new MessagingError("invalid");
  const r = object(await rpc(client, "submit_messaging_report", { p_message_id: id(input.messageId), p_reason: input.reason, p_detail: detail }));
  if (!uuid(r.id) || typeof r.duplicate !== "boolean") return bad();
  return { id: r.id, duplicate: r.duplicate };
}
function reportSummary(value: unknown): MessageReportSummary {
  const r = object(value);
  if (!uuid(r.id) || !reason(r.reason) || !status(r.status) || !timestamp(r.at)) return bad();
  return { id: r.id, reason: r.reason, status: r.status, at: r.at };
}
export async function listMessageReports(client: SupabaseClient, filter: "open" | "resolved" = "open", input: MessagePageInput = {}): Promise<MessagePage<MessageReportSummary>> {
  if (!status(filter)) throw new MessagingError("invalid");
  const args = validateMessagePage(input);
  return page(await rpc(client, "list_messaging_reports", { p_status: filter, ...args }), reportSummary, args.p_limit);
}
export async function getMessageReport(client: SupabaseClient, reportId: string): Promise<MessageReportDetail> {
  const target = id(reportId);
  const r = object(await rpc(client, "get_messaging_report", { p_report_id: target }));
  if (r.id !== target || !uuid(r.message_id) || !text(r.body, 2000) || !r.body || !text(r.sender_display, 100)
    || !text(r.reporter_display, 100) || !reason(r.reason) || !text(r.detail, 1000) || !status(r.status)
    || !timestamp(r.created_at) || !timestamp(r.message_created_at) || !nullableTime(r.resolved_at)
    || (r.status === "open" ? r.resolved_at !== null : r.resolved_at === null)) return bad();
  return { id: target, messageId: r.message_id, body: r.body, senderDisplay: r.sender_display, reporterDisplay: r.reporter_display,
    reason: r.reason, detail: r.detail, status: r.status, createdAt: r.created_at, messageCreatedAt: r.message_created_at, resolvedAt: r.resolved_at };
}
export async function resolveMessageReport(client: SupabaseClient, reportId: string): Promise<void> {
  const target = id(reportId);
  const r = object(await rpc(client, "resolve_messaging_report", { p_report_id: target }));
  if (r.id !== target || r.status !== "resolved") return bad();
}
