import "server-only";
import { validPhotoMessage, type PhotoMessageInput } from "./messagePhotoRules";
import type { SupabaseClient } from "@supabase/supabase-js";

// Pass the existing authenticated context's client. Never a service-role client,
// sender ID, or caller-selected mailbox owner. RPCs independently bind auth.uid().
const messages = {
  invalid: "쪽지 입력을 확인해 주세요.",
  photoUnavailable: "사진 첨부 기능이 아직 연결되지 않았습니다. 사진을 제외하고 글만 보내거나 나중에 다시 시도해 주세요.",
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
  eventState: "현재 행사 상태에서는 새 공지를 보낼 수 없습니다.",
  audience: "수신 대상이 없거나 한 번에 보낼 수 있는 10,000명을 초과했습니다.",
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
export type MarketMessageListing = { available: true; listingId: string; title: string; status: "selling" | "reserved" | "sold"; vendor?:boolean; store?:boolean; requestType?: "buy"|"exchange" };
export type MarketMessageContext = MarketMessageListing | { available: false } | null;
export type MessageKind = "direct" | "platform_broadcast" | "club_broadcast" | "club_event_broadcast" | "course_broadcast";
export type MessageSummary = { id: string; kind: MessageKind; counterpartDisplay: string; preview: string; at: string; readAt: string | null; isReply: boolean };
export type MessageDetail = { id: string; kind: MessageKind; body: string; counterpartUserId: string | null; counterpartDisplay: string; createdAt: string; replyToMessageId: string | null; isRecipient: boolean; readAt: string | null; recipientCount?: number };
export type MessagePage<T> = { items: T[]; hasMore: boolean; nextCursor: MessageCursor | null };
export type MessageBlock = { blockedUserId: string; counterpartDisplay: string; blockedAt: string };
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
    if (result.error.code === "PGRST202" && ["send_message_with_photos", "list_message_photos"].includes(name)) throw new MessagingError("photoUnavailable");
    const codes: Record<string, keyof typeof messages> = {
      photo_invalid: "invalid", photo_permission: "permission", photo_conflict: "conflict", photo_missing: "invalid",
      messaging_invalid: "invalid", messaging_login: "login", messaging_account_unavailable: "account",
      messaging_recipient_unavailable: "recipient", messaging_not_found: "missing", messaging_permission: "permission",
      messaging_cooldown: "cooldown", messaging_quota: "quota", messaging_recipient_quota: "quota",
      messaging_new_recipient_quota: "quota", messaging_report_quota: "quota", messaging_duplicate: "duplicate",
      messaging_replay_conflict: "conflict", messaging_retry_transaction: "retry",
      messaging_broadcast_audience: "audience", messaging_event_state: "eventState",
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
function marketContext(value: unknown): MarketMessageContext {
  if (value === null) return null;
  const r = object(value);
  if (r.available === false) return { available: false };
  if(r.store_id!==undefined){if(r.available!==true||!uuid(r.store_id)||!text(r.title,120)||!r.title||!["selling","reserved","sold"].includes(String(r.status)))return bad();return {available:true,listingId:r.store_id,title:r.title,status:r.status as MarketMessageListing["status"],store:true};}
  if(r.vendor_id!==undefined){if(r.available!==true||!uuid(r.vendor_id)||!text(r.title,80)||!r.title)return bad();return {available:true,listingId:r.vendor_id,title:r.title,status:"selling",vendor:true};}
  if(r.buy_request_id !== undefined){
    if(r.available!==true||!uuid(r.buy_request_id)||!text(r.title,100)||!r.title||!["buy","exchange"].includes(String(r.request_type))||!["open","closed"].includes(String(r.status)))return bad();
    return {available:true,listingId:r.buy_request_id,title:r.title,status:r.status==="open"?"selling":"sold",requestType:r.request_type as "buy"|"exchange"};
  }
  if (r.available !== true || !uuid(r.listing_id) || !text(r.title, 100) || !r.title
    || !["selling", "reserved", "sold"].includes(r.status as string)) return bad();
  return { available: true, listingId: r.listing_id, title: r.title, status: r.status as MarketMessageListing["status"] };
}
export async function getMarketMessageComposeContext(client: SupabaseClient, listingId: string): Promise<MarketMessageListing> {
  const target = id(listingId);
  const value = marketContext(await rpc(client, "get_market_message_compose_context", { p_listing_id: target }));
  if (!value?.available || value.listingId !== target || value.status === "sold") return bad();
  return value;
}
export async function sendMarketListingMessage(client: SupabaseClient, input: { listingId: string; body: string; requestId: string }): Promise<MessageReceipt> {
  if (!input) throw new MessagingError("invalid");
  return receipt(await rpc(client, "send_market_listing_message", { p_listing_id: id(input.listingId), p_body: validateMessageBody(input.body), p_request_id: id(input.requestId) }));
}
export async function getMessageMarketContext(client: SupabaseClient, messageId: string): Promise<MarketMessageContext> {
  const sale=marketContext(await rpc(client,"get_message_market_context",{p_message_id:id(messageId)}));
  return sale ?? marketContext(await rpc(client,"get_message_buy_request_context",{p_message_id:id(messageId)})) ?? marketContext(await rpc(client,"get_message_vendor_context",{p_message_id:id(messageId)})) ?? await messageStoreContext(client,messageId);
}
async function messageStoreContext(client:SupabaseClient,messageId:string):Promise<MarketMessageContext>{
  const {data,error}=await client.rpc("get_message_store_context",{p_message_id:id(messageId)});
  // Before stage 4 SQL is applied, ordinary existing conversations have no store context.
  if(error?.code==="PGRST202")return null;
  if(error)throw new MessagingError("unknown");
  return marketContext(data);
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
  const kind = messageKind(r.kind);
  if (!uuid(r.id) || !text(r.counterpart_display, 100) || !text(r.preview, 100)
    || !timestamp(r.at) || !nullableTime(r.read_at) || typeof r.is_reply !== "boolean") return bad();
  if (kind !== "direct" && r.is_reply) return bad();
  return { id: r.id, kind, counterpartDisplay: kind === "platform_broadcast" ? "PUL 공지" : kind === "club_broadcast" ? "동호회 공지" : kind === "club_event_broadcast" ? "행사 안내" : kind === "course_broadcast" ? "장소 운영공지" : r.counterpart_display, preview: r.preview, at: r.at, readAt: r.read_at, isReply: r.is_reply };
}
function messageKind(value: unknown): MessageKind {
  // Missing kind is the official 1B–1D DTO, for DB-first rollout compatibility.
  if (value === undefined || value === "direct") return "direct";
  if (value === "platform_broadcast" || value === "club_broadcast" || value === "club_event_broadcast" || value === "course_broadcast") return value;
  return bad();
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
  const kind = messageKind(r.kind);
  if (r.id !== target || !text(r.body, 2000) || !r.body || !text(r.counterpart_display, 100) || !timestamp(r.created_at)
    || (r.counterpart_user_id !== null && !uuid(r.counterpart_user_id))
    || (r.reply_to_message_id !== null && !uuid(r.reply_to_message_id)) || typeof r.is_recipient !== "boolean"
    || !nullableTime(r.read_at) || (!r.is_recipient && r.read_at !== null)) return bad();
  if (kind !== "direct" && (r.counterpart_user_id !== null || r.reply_to_message_id !== null || (!r.is_recipient && kind !== "course_broadcast"))) return bad();
  return { id: target, kind, body: r.body, counterpartUserId: r.counterpart_user_id as string | null, counterpartDisplay: kind === "platform_broadcast" ? "PUL 공지" : kind === "club_broadcast" ? "동호회 공지" : kind === "club_event_broadcast" ? "행사 안내" : kind === "course_broadcast" ? "장소 운영공지" : r.counterpart_display, createdAt: r.created_at,
    replyToMessageId: r.reply_to_message_id as string | null, isRecipient: r.is_recipient, readAt: r.read_at,
    ...(kind === "course_broadcast" && !r.is_recipient ? { recipientCount: recipientCount(r.recipient_count) } : {}) };
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
// Actor comes exclusively from the authenticated client's auth.uid() in the RPC.
export async function listMessageBlocks(client: SupabaseClient, input: MessagePageInput = {}): Promise<MessagePage<MessageBlock>> {
  const args = validateMessagePage(input);
  const r = object(await rpc(client, "list_messaging_blocks", args));
  if (!Array.isArray(r.items) || r.items.length > args.p_limit || typeof r.has_more !== "boolean") return bad();
  const items = r.items.map((value): MessageBlock => {
    const row = object(value);
    if (!uuid(row.blocked_user_id) || !text(row.counterpart_display, 100) || !timestamp(row.blocked_at)) return bad();
    return { blockedUserId: row.blocked_user_id, counterpartDisplay: row.counterpart_display, blockedAt: row.blocked_at };
  });
  let nextCursor: MessageCursor | null = null;
  if (r.has_more) {
    const cursor = object(r.next_cursor), last = items.at(-1);
    if (items.length !== args.p_limit || !timestamp(cursor.at) || !uuid(cursor.id)
      || cursor.id !== last?.blockedUserId || cursor.at !== last?.blockedAt) return bad();
    nextCursor = { at: cursor.at, id: cursor.id };
  } else if (r.next_cursor !== null) return bad();
  return { items, hasMore: r.has_more, nextCursor };
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

export type BroadcastPreview = { recipientCount: number; maximum: number; canSend: boolean };
export type BroadcastReceipt = MessageReceipt & { recipientCount: number };
export type BroadcastSummary = { id: string; at: string; preview: string; recipientCount: number };
export type BroadcastDetail = BroadcastReceipt & { body: string; senderDisplay: string };
function recipientCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 10000) return bad();
  return value;
}
export async function previewPlatformBroadcast(client: SupabaseClient): Promise<BroadcastPreview> {
  const r = object(await rpc(client, "preview_platform_broadcast"));
  if (typeof r.recipient_count !== "number" || !Number.isInteger(r.recipient_count) || r.recipient_count < 0 || r.recipient_count > 10001
    || r.maximum !== 10000 || r.can_send !== (r.recipient_count >= 1 && r.recipient_count <= 10000)) return bad();
  return { recipientCount: r.recipient_count, maximum: r.maximum, canSend: r.can_send as boolean };
}
export async function sendPlatformBroadcast(client: SupabaseClient, input: { body: string; requestId: string }): Promise<BroadcastReceipt> {
  if (!input) throw new MessagingError("invalid");
  const r = object(await rpc(client, "send_platform_broadcast", { p_body: validateMessageBody(input.body), p_request_id: id(input.requestId) }));
  return { ...receipt(r), recipientCount: recipientCount(r.recipient_count) };
}
export async function listPlatformBroadcasts(client: SupabaseClient, input: MessagePageInput = {}): Promise<MessagePage<BroadcastSummary>> {
  const args = validateMessagePage(input);
  return page(await rpc(client, "list_platform_broadcasts", args), value => {
    const r = object(value);
    if (!uuid(r.id) || !timestamp(r.at) || !text(r.preview, 100)) return bad();
    return { id: r.id, at: r.at, preview: r.preview, recipientCount: recipientCount(r.recipient_count) };
  }, args.p_limit);
}
export async function getPlatformBroadcast(client: SupabaseClient, messageId: string): Promise<BroadcastDetail> {
  const target = id(messageId), r = object(await rpc(client, "get_platform_broadcast", { p_message_id: target }));
  if (r.id !== target || !text(r.body, 2000) || !r.body || !text(r.sender_display, 100)) return bad();
  return { ...receipt(r), recipientCount: recipientCount(r.recipient_count), body: r.body, senderDisplay: r.sender_display };
}

export type ClubMessageContext = { available: true; name: string; publicKey: string } | { available: false } | null;
export type ClubBroadcastSummary = BroadcastSummary & { senderDisplay: string };
export async function previewClubBroadcast(client: SupabaseClient, clubId: string): Promise<BroadcastPreview> {
  const r = object(await rpc(client, "preview_club_broadcast", { p_club_id: id(clubId) }));
  if (typeof r.recipient_count !== "number" || !Number.isInteger(r.recipient_count) || r.recipient_count < 0 || r.recipient_count > 10001
    || r.maximum !== 10000 || r.can_send !== (r.recipient_count >= 1 && r.recipient_count <= 10000)) return bad();
  return { recipientCount: r.recipient_count, maximum: r.maximum, canSend: r.can_send as boolean };
}
export async function sendClubBroadcast(client: SupabaseClient, input: { clubId: string; body: string; requestId: string }): Promise<BroadcastReceipt> {
  if (!input) throw new MessagingError("invalid");
  const r = object(await rpc(client, "send_club_broadcast", { p_club_id: id(input.clubId), p_body: validateMessageBody(input.body), p_request_id: id(input.requestId) }));
  return { ...receipt(r), recipientCount: recipientCount(r.recipient_count) };
}
export async function listClubBroadcasts(client: SupabaseClient, clubId: string, input: MessagePageInput = {}): Promise<MessagePage<ClubBroadcastSummary>> {
  const args = validateMessagePage(input);
  return page(await rpc(client, "list_club_broadcasts", { p_club_id: id(clubId), ...args }), value => {
    const r = object(value);
    if (!uuid(r.id) || !timestamp(r.at) || !text(r.preview, 100) || !text(r.sender_display, 100)) return bad();
    return { id: r.id, at: r.at, preview: r.preview, senderDisplay: r.sender_display, recipientCount: recipientCount(r.recipient_count) };
  }, args.p_limit);
}
export async function getClubBroadcast(client: SupabaseClient, clubId: string, messageId: string): Promise<BroadcastDetail> {
  const target = id(messageId), r = object(await rpc(client, "get_club_broadcast", { p_club_id: id(clubId), p_message_id: target }));
  if (r.id !== target || !text(r.body, 2000) || !r.body || !text(r.sender_display, 100)) return bad();
  return { ...receipt(r), recipientCount: recipientCount(r.recipient_count), body: r.body, senderDisplay: r.sender_display };
}
export async function getMessageClubContext(client: SupabaseClient, messageId: string): Promise<ClubMessageContext> {
  const value = await rpc(client, "get_message_club_context", { p_message_id: id(messageId) });
  if (value === null) return null;
  const r = object(value);
  if (r.available === false) return { available: false };
  if (r.available !== true || !text(r.name, 100) || !r.name || typeof r.public_key !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(r.public_key)) return bad();
  return { available: true, name: r.name, publicKey: r.public_key };
}

export async function previewClubEventBroadcast(client: SupabaseClient, eventId: string): Promise<BroadcastPreview> {
  const r = object(await rpc(client, "preview_club_event_broadcast", { p_event_id: id(eventId) }));
  if (typeof r.recipient_count !== "number" || !Number.isInteger(r.recipient_count) || r.recipient_count < 0 || r.recipient_count > 10001
    || r.maximum !== 10000 || r.can_send !== (r.recipient_count >= 1 && r.recipient_count <= 10000)) return bad();
  return { recipientCount: r.recipient_count, maximum: r.maximum, canSend: r.can_send as boolean };
}
export async function sendClubEventBroadcast(client: SupabaseClient, input: { eventId: string; body: string; requestId: string }): Promise<BroadcastReceipt> {
  if (!input) throw new MessagingError("invalid");
  const r = object(await rpc(client, "send_club_event_broadcast", { p_event_id: id(input.eventId), p_body: validateMessageBody(input.body), p_request_id: id(input.requestId) }));
  return { ...receipt(r), recipientCount: recipientCount(r.recipient_count) };
}
export async function listClubEventBroadcasts(client: SupabaseClient, eventId: string, input: MessagePageInput = {}): Promise<MessagePage<ClubBroadcastSummary>> {
  const args = validateMessagePage(input);
  return page(await rpc(client, "list_club_event_broadcasts", { p_event_id: id(eventId), ...args }), value => {
    const r = object(value);
    if (!uuid(r.id) || !timestamp(r.at) || !text(r.preview, 100) || !text(r.sender_display, 100)) return bad();
    return { id: r.id, at: r.at, preview: r.preview, senderDisplay: r.sender_display, recipientCount: recipientCount(r.recipient_count) };
  }, args.p_limit);
}
export async function getClubEventBroadcast(client: SupabaseClient, eventId: string, messageId: string): Promise<BroadcastDetail> {
  const target = id(messageId), r = object(await rpc(client, "get_club_event_broadcast", { p_event_id: id(eventId), p_message_id: target }));
  if (r.id !== target || !text(r.body, 2000) || !r.body || !text(r.sender_display, 100)) return bad();
  return { ...receipt(r), recipientCount: recipientCount(r.recipient_count), body: r.body, senderDisplay: r.sender_display };
}

export type ClubEventSource = { eventId: string; title: string; startsAt: string; clubName: string; clubKey: string; status: string };
export type ClubEventMessageContext = (Omit<ClubEventSource, "status"> & { available: true }) | { available: false } | null;
function eventSource(value: unknown): Omit<ClubEventSource, "status"> {
  const r = object(value);
  if (!uuid(r.event_id) || !text(r.title, 120) || !r.title || !timestamp(r.starts_at) || !text(r.club_name, 100) || !r.club_name
    || typeof r.club_key !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(r.club_key)) return bad();
  return { eventId: r.event_id, title: r.title, startsAt: r.starts_at, clubName: r.club_name, clubKey: r.club_key };
}
export async function getClubEventBroadcastSource(client: SupabaseClient, eventId: string): Promise<ClubEventSource> {
  const target = id(eventId), r = object(await rpc(client, "get_club_event_broadcast_source", { p_event_id: target }));
  if (r.event_id !== target || typeof r.status !== "string" || !["draft", "scheduled", "registration_open", "registration_closed", "completed", "cancelled"].includes(r.status)) return bad();
  return { ...eventSource(r), status: r.status };
}
export async function getMessageClubEventContext(client: SupabaseClient, messageId: string): Promise<ClubEventMessageContext> {
  const value = await rpc(client, "get_message_club_event_context", { p_message_id: id(messageId) });
  if (value === null) return null;
  const r = object(value);
  if (r.available === false) return { available: false };
  if (r.available !== true) return bad();
  return { ...eventSource(r), available: true };
}

export type CourseBroadcastSource = { courseId: string; courseKey: string; name: string; courseType: "field" | "screen" };
export type CourseMessageContext = (Omit<CourseBroadcastSource, "courseId"> & { available: true }) | { available: false } | null;
function courseSource(value: unknown): Omit<CourseBroadcastSource, "courseId"> {
  const r = object(value);
  if (typeof r.course_key !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(r.course_key)
    || !text(r.name, 120) || !r.name || (r.course_type !== "field" && r.course_type !== "screen")) return bad();
  return { courseKey: r.course_key, name: r.name, courseType: r.course_type };
}
export async function getCourseBroadcastSource(client: SupabaseClient, courseKey: string): Promise<CourseBroadcastSource> {
  if (typeof courseKey !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(courseKey)) throw new MessagingError("invalid");
  const r = object(await rpc(client, "get_course_broadcast_source", { p_course_key: courseKey }));
  if (!uuid(r.course_id) || r.course_key !== courseKey) return bad();
  return { ...courseSource(r), courseId: r.course_id };
}
export async function previewCourseBroadcast(client: SupabaseClient, courseId: string): Promise<BroadcastPreview> {
  const r = object(await rpc(client, "preview_course_broadcast", { p_course_id: id(courseId) }));
  if (typeof r.recipient_count !== "number" || !Number.isInteger(r.recipient_count) || r.recipient_count < 0 || r.recipient_count > 10001
    || r.maximum !== 10000 || r.can_send !== (r.recipient_count >= 1 && r.recipient_count <= 10000)) return bad();
  return { recipientCount: r.recipient_count, maximum: r.maximum, canSend: r.can_send as boolean };
}
export async function sendCourseBroadcast(client: SupabaseClient, input: { courseId: string; body: string; requestId: string }): Promise<BroadcastReceipt> {
  if (!input) throw new MessagingError("invalid");
  const r = object(await rpc(client, "send_course_broadcast", { p_course_id: id(input.courseId), p_body: validateMessageBody(input.body), p_request_id: id(input.requestId) }));
  return { ...receipt(r), recipientCount: recipientCount(r.recipient_count) };
}
export async function getMessageCourseContext(client: SupabaseClient, messageId: string): Promise<CourseMessageContext> {
  const value = await rpc(client, "get_message_course_context", { p_message_id: id(messageId) });
  if (value === null) return null;
  const r = object(value);
  if (r.available === false) return { available: false };
  if (r.available !== true) return bad();
  return { ...courseSource(r), available: true };
}

export async function getBuyRequestMessageComposeContext(client:SupabaseClient,requestId:string):Promise<MarketMessageListing>{const target=id(requestId);const value=marketContext(await rpc(client,"get_buy_request_message_compose_context",{p_buy_request_id:target}));if(!value?.available||value.listingId!==target||!value.requestType||value.status==="sold")return bad();return value;}
export async function sendBuyRequestMessage(client:SupabaseClient,input:{buyRequestId:string;body:string;requestId:string}):Promise<MessageReceipt>{if(!input)throw new MessagingError("invalid");return receipt(await rpc(client,"send_market_buy_request_message",{p_buy_request_id:id(input.buyRequestId),p_body:validateMessageBody(input.body),p_request_id:id(input.requestId)}));}

export async function getVendorMessageComposeContext(client:SupabaseClient,vendorId:string):Promise<MarketMessageListing>{const target=id(vendorId);const v=marketContext(await rpc(client,"get_vendor_message_compose_context",{p_vendor_id:target}));if(!v?.available||v.listingId!==target||!v.vendor)return bad();return v;}
export async function sendVendorMessage(client:SupabaseClient,input:{vendorId:string;body:string;requestId:string}):Promise<MessageReceipt>{return receipt(await rpc(client,"send_market_vendor_message",{p_vendor_id:id(input.vendorId),p_body:validateMessageBody(input.body),p_request_id:id(input.requestId)}));}

export async function getStoreMessageComposeContext(client:SupabaseClient,storeId:string):Promise<MarketMessageListing>{const target=id(storeId);const value=marketContext(await rpc(client,"get_store_message_compose_context",{p_store_id:target}));if(!value?.available||value.listingId!==target||!value.store||value.status==="sold")throw new MessagingError("recipient");return value;}
export async function sendStoreMessage(client:SupabaseClient,input:{storeId:string;body:string;requestId:string}):Promise<MessageReceipt>{if(!input)throw new MessagingError("invalid");return receipt(await rpc(client,"send_market_store_message",{p_store_id:id(input.storeId),p_body:validateMessageBody(input.body),p_request_id:id(input.requestId)}));}


export async function sendMessageWithPhotos(client: SupabaseClient, input: PhotoMessageInput): Promise<MessageReceipt> {
  if (!validPhotoMessage(input)) throw new MessagingError("invalid");
  const value = object(await rpc(client, "send_message_with_photos", {
    p_kind: input.kind, p_target_id: id(input.targetId), p_body: validateMessageBody(input.body),
    p_request_id: id(input.requestId), p_draft_id: id(input.draftId), p_photo_ids: input.photoIds.map(id),
  }));
  if (!Array.isArray(value.photo_ids) || value.photo_ids.length !== input.photoIds.length ||
    value.photo_ids.some((photo, i) => photo !== input.photoIds[i].toLowerCase())) return bad();
  return receipt(value);
}
export async function listMessagePhotos(client: SupabaseClient, messageId: string): Promise<{ id: string }[]> {
  const value = await rpc(client, "list_message_photos", { p_message_id: id(messageId) });
  if (!Array.isArray(value) || value.length > 3) return bad();
  return value.map(item => { const row = object(item); if (!uuid(row.id)) return bad(); return { id: row.id }; });
}
