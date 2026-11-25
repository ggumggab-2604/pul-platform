import type { MailboxType, MessageCursor, MessagingReportReason } from "./messaging";

export const reportReasonLabels: Record<MessagingReportReason, string> = {
  spam: "도배·광고", harassment: "괴롭힘·욕설", inappropriate: "부적절한 내용", fraud: "사기 의심", other: "기타",
};
export const messagingUpdatedEvent = "pul-messaging-updated";
export const messageDate = (value: string) => new Date(value).toLocaleString("ko-KR", {
  timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
});
const listDay = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" });
const listTime = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export function mailboxDate(value: string) {
  const date = new Date(value);
  return { day: listDay.format(date), time: listTime.format(date) };
}
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

export const mailboxLabels: Record<MailboxType, string> = {
  direct: "일반 쪽지", market: "장터 문의", course_inquiry: "구장 문의",
  club_event_broadcast: "동호회 행사", participation: "동호회 참가 모집", club_broadcast: "동호회 공지",
  tournament_broadcast: "대회 안내", companion: "명예의 전당", correction: "정정 요청",
  course_broadcast: "구장 운영 공지", platform_broadcast: "PUL 공지",
};
export function messageFirstLine(body: string, max = 80) {
  const line = [...(body.split(/\r?\n/).find(value => value.trim())?.trim() ?? "")];
  return line.length <= max ? line.join("") : line.slice(0, max).join("") + "…";
}
export function mailboxHref(box: "inbox" | "sent", unread = false, cursor?: MessageCursor | null) {
  const path = box === "sent" ? "/messages/sent" : "/messages";
  const query = new URLSearchParams(cursor ? { at: cursor.at, id: cursor.id } : {});
  if (box === "inbox" && unread) query.set("filter", "unread");
  return query.size ? path + "?" + query : path;
}
export type MessageDestination = {
  context?: string;
  subline?: string;
  inline?: { href: string; label: string };
  primary?: { href: string; label: string };
  secondary?: { href: string; label: string };
  unavailable?: boolean;
};
