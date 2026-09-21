import "server-only";

import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { getMessage, getMessageUnreadCount, listMessageInbox, listMessageSent, listMessageReports, listMessageBlocks, MessagingError, type MessagePageInput } from "@/lib/messaging/messaging";
import { MessagingSessionBoundary } from "./MessagingSessionBoundary";
import { MailboxView, MessagingShell, MessageFailure, ReportListView } from "./MessagingViews";
import { MessageComposer, MessageDetailView, MessageReportDetailView, BlockedListView } from "./MessagingForms";
import { getMarketMessageComposeContext, getMessageMarketContext } from "@/lib/messaging/messaging";
import { recipientCodeValid } from "@/lib/messaging/messagingUi";

export type MessagingQuery = { at?: string | string[]; id?: string | string[]; status?: string | string[] };
function pageInput(query: MessagingQuery): MessagePageInput {
  if (!query.at && !query.id) return { limit: 20 };
  if (typeof query.at !== "string" || typeof query.id !== "string") throw new MessagingError("invalid");
  return { limit: 20, cursor: { at: query.at, id: query.id } };
}
async function context(path: string) {
  const value = await getAuthenticatedSupabaseContext();
  if (!value) redirect(`/login?next=${encodeURIComponent(path)}`);
  return value;
}
function failure(error: unknown) { return <MessageFailure message={(error instanceof MessagingError ? error : new MessagingError("unknown")).message} />; }
async function load<T>(work: () => Promise<T>) {
  try { return { ok: true as const, data: await work() }; }
  catch (error) { return { ok: false as const, error }; }
}

export async function MailboxPage({ box, searchParams }: { box: "inbox" | "sent"; searchParams: Promise<MessagingQuery> }) {
  const c = await context(box === "inbox" ? "/messages" : "/messages/sent");
  const result = await load(async () => {
    const input = pageInput(await searchParams);
    return box === "inbox" ? listMessageInbox(c.supabase, input) : listMessageSent(c.supabase, input);
  });
  const content = result.ok ? <MessagingSessionBoundary viewerId={c.userId}><MailboxView page={result.data} box={box} /></MessagingSessionBoundary> : failure(result.error);
  return <MessagingShell box={box}>{content}</MessagingShell>;
}
export async function ComposePage({ searchParams }: { searchParams?: Promise<{ listing?: string | string[] }> } = {}) {
  const query = await searchParams;
  const listing = query?.listing;
  const validListing = typeof listing === "string" && recipientCodeValid(listing);
  const c = await context(`/messages/new${validListing ? `?listing=${encodeURIComponent(listing)}` : ""}`);
  // Existing narrow RPC enforces active + signup-complete even on an empty compose page.
  const result = await load(async () => {
    if (listing !== undefined) {
      if (!validListing) throw new MessagingError("invalid");
      return getMarketMessageComposeContext(c.supabase, listing);
    }
    await getMessageUnreadCount(c.supabase);
    return undefined;
  });
  const content = result.ok ? <MessagingSessionBoundary viewerId={c.userId}><MessageComposer key={result.data?.listingId ?? "direct"} ownCode={c.userId} market={result.data} /></MessagingSessionBoundary> : failure(result.error);
  return <MessagingShell>{content}</MessagingShell>;
}
export async function BlockedPage({ searchParams }: { searchParams: Promise<MessagingQuery> }) {
  const c = await context("/messages/blocked");
  const result = await load(async () => {
    const input = pageInput(await searchParams);
    return { page: await listMessageBlocks(c.supabase, input), isLaterPage: Boolean(input.cursor) };
  });
  const content = result.ok ? <MessagingSessionBoundary viewerId={c.userId}><BlockedListView page={result.data.page} isLaterPage={result.data.isLaterPage} /></MessagingSessionBoundary> : failure(result.error);
  return <MessagingShell box="blocked">{content}</MessagingShell>;
}
export async function DetailPage({ params }: { params: Promise<{ messageId: string }> }) {
  const { messageId } = await params;
  const c = await context(`/messages/${encodeURIComponent(messageId)}`);
  // A prefetched/SSR render never marks a receipt as read.
  const result = await load(async () => ({ message: await getMessage(c.supabase, messageId, false), market: await getMessageMarketContext(c.supabase, messageId) }));
  const content = result.ok ? <MessagingSessionBoundary viewerId={c.userId}><MessageDetailView key={result.data.message.id} message={result.data.message} marketContext={result.data.market} /></MessagingSessionBoundary> : failure(result.error);
  return <MessagingShell>{content}</MessagingShell>;
}
export async function ReportsPage({ searchParams }: { searchParams: Promise<MessagingQuery> }) {
  const c = await context("/manage/messages/reports");
  const result = await load(async () => {
    const query = await searchParams;
    if (query.status !== undefined && query.status !== "open" && query.status !== "resolved") throw new MessagingError("invalid");
    const status = query.status ?? "open";
    const page = await listMessageReports(c.supabase, status, pageInput(query));
    return { page, status } as const;
  });
  const content = result.ok ? <MessagingSessionBoundary viewerId={c.userId}><ReportListView page={result.data.page} status={result.data.status} /></MessagingSessionBoundary> : failure(result.error);
  return <main className="min-h-[60vh] bg-pul-page px-3 py-8"><div className="mx-auto max-w-3xl space-y-5"><Link href="/manage" className="inline-flex min-h-11 items-center font-bold text-pul-point">← 운영 관리센터</Link>{content}</div></main>;
}
export async function ReportDetailPage({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const c = await context(`/manage/messages/reports/${encodeURIComponent(reportId)}`);
  // Check permission without the audited detail RPC during prefetch.
  const result = await load(() => listMessageReports(c.supabase, "open", { limit: 1 }));
  const content = result.ok ? <MessagingSessionBoundary viewerId={c.userId}><MessageReportDetailView key={reportId} reportId={reportId} /></MessagingSessionBoundary> : failure(result.error);
  return <main className="min-h-[60vh] bg-pul-page px-3 py-8"><div className="mx-auto max-w-3xl space-y-5"><Link href="/manage/messages/reports" prefetch={false} className="inline-flex min-h-11 items-center font-bold text-pul-point">← 신고 목록</Link>{content}</div></main>;
}
