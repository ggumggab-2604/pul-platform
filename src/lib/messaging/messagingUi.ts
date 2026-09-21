import type { MessageCursor, MessagingReportReason } from "./messaging";

export const reportReasonLabels: Record<MessagingReportReason, string> = {
  spam: "도배·광고", harassment: "괴롭힘·욕설", inappropriate: "부적절한 내용", fraud: "사기 의심", other: "기타",
};
export const messagingUpdatedEvent = "pul-messaging-updated";
export const messageDate = (value: string) => new Date(value).toLocaleString("ko-KR", {
  timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
});
export const trimMessage = (value: string) => value.replace(/^[\s\u0085]+|[\s\u0085]+$/gu, "");
export const messageLength = (value: string) => [...trimMessage(value)].length;
export const recipientCodeValid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const badgeText = (count: number) => count > 99 ? "99+" : String(count);
export function cursorHref(path: string, cursor: MessageCursor, status?: string) {
  const query = new URLSearchParams({ at: cursor.at, id: cursor.id });
  if (status) query.set("status", status);
  return `${path}?${query}`;
}
export const messageButton = "inline-flex min-h-11 items-center justify-center rounded-lg border border-pul-border bg-white px-4 py-2 font-bold text-pul-deep disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pul-point";
export const messageInput = "w-full min-w-0 rounded-lg border border-pul-border bg-white p-3 text-base focus:outline-2 focus:outline-pul-point disabled:bg-slate-100";
