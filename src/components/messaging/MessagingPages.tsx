import {getStoreMessageComposeContext,getVendorMessageComposeContext} from "@/lib/messaging/messaging";
import "server-only";

import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { getMessage, getMailboxDetail, getMessageUnreadCount, listMailboxPage, listMessageReports, listMessageBlocks, MessagingError, type MessagePageInput } from "@/lib/messaging/messaging";
import { MessagingSessionBoundary } from "./MessagingSessionBoundary";
import { MailboxView, MessagingShell, MessageFailure, ReportListView } from "./MessagingViews";
import { MessageComposer, MessageDetailView, MessageReportDetailView, BlockedListView } from "./MessagingForms";
import { getBuyRequestMessageComposeContext, getMarketMessageComposeContext } from "@/lib/messaging/messaging";
import { certificationActivityDetailHref, safeCertificationActivityReturn } from "@/lib/certification/certificationJobActivity";
import { certificationUuidPattern, directoryKeyPattern, type CertificationContact } from "@/lib/certification/certificationPhaseOne";
import { mailboxHref, recipientCodeValid } from "@/lib/messaging/messagingUi";
import { resolveMessageDestination } from "./MessageDestination";

export type MessagingQuery = { at?: string | string[]; id?: string | string[]; status?: string | string[]; filter?: string | string[] };
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
  const query = await searchParams;
  const unread = box === "inbox" && query.filter === "unread";
  const c = await context(mailboxHref(box, unread));
  const result = await load(async () => {
    const input = pageInput(query);
    return { page: await listMailboxPage(c.supabase, unread ? "unread" : box, input), cursor: input.cursor };
  });
  const content = result.ok ? <MessagingSessionBoundary viewerId={c.userId}><MailboxView page={result.data.page} box={box} unread={unread} cursor={result.data.cursor} /></MessagingSessionBoundary> : failure(result.error);
  return <MessagingShell box={box}>{content}</MessagingShell>;
}
export async function ComposePage({ searchParams }: { searchParams?: Promise<{ lost?:string|string[]; course?:string|string[]; story?:string|string[]; store?:string|string[]; provider?:string|string[]; listing?: string | string[];request?:string|string[]; certificationKind?: string | string[]; certificationKey?: string | string[]; certificationReturn?: string | string[] }> } = {}) {
  const query = await searchParams;
  const lost = query?.lost;
  if (lost !== undefined) {
    const other = [query?.course, query?.story, query?.listing, query?.store, query?.provider, query?.request, query?.certificationKind, query?.certificationKey];
    if (typeof lost !== "string" || !recipientCodeValid(lost) || other.some(value => value !== undefined)) {
      return <MessagingShell><MessageFailure message="분실 신고 주소를 확인해 주세요." /></MessagingShell>;
    }
    const c = await context("/messages/new?lost=" + lost);
    const { data, error } = await c.supabase.rpc("market_lost_message_context", { p_id: lost });
    return <MessagingShell>
      <Link href={"/market/lost-items/" + lost} prefetch={false} className="mb-3 inline-flex min-h-11 items-center font-bold text-pul-point underline">← 분실 신고 상세</Link>
      {error || typeof data !== "string" ? <MessageFailure message="현재 이 글쓴이에게 쪽지를 보낼 수 없습니다." /> :
        <MessagingSessionBoundary viewerId={c.userId}><MessageComposer key={lost} lost={{ id: lost, name: data }} /></MessagingSessionBoundary>}
    </MessagingShell>;
  }
  const kind = query?.certificationKind;
  const key = query?.certificationKey;
  if (kind !== undefined || key !== undefined) {
    if ((kind !== "job" && kind !== "talent") || typeof key !== "string" ||
      !(kind === "job" ? directoryKeyPattern : certificationUuidPattern).test(key) ||
      [query?.course, query?.story, query?.listing, query?.store, query?.provider, query?.request].some((part) => part !== undefined)) {
      return <MessagingShell><MessageFailure message="공고 또는 구직 프로필 주소를 확인해 주세요." /></MessagingShell>;
    }
    const returnTo = safeCertificationActivityReturn(query?.certificationReturn);
    const back = certificationActivityDetailHref(kind, key, returnTo);
    const c = await context(certificationActivityDetailHref(kind, key, returnTo, true));
    const { data, error } = await c.supabase.rpc("certification_message_context", { p_kind: kind, p_key: key });
    const target = data as Pick<CertificationContact, "name" | "binding"> | null;
    return <MessagingShell>
      <Link href={back} prefetch={false} className="mb-3 inline-flex min-h-11 items-center font-bold text-pul-point underline">← {kind === "job" ? "구인 공고" : "구직 프로필"}</Link>
      {error || !target ? <MessageFailure message="현재 이 대상에게 쪽지를 보낼 수 없습니다." /> :
        <MessagingSessionBoundary viewerId={c.userId}>
          <MessageComposer key={kind + key + target.binding} certification={{ kind, key, ...target }} />
        </MessagingSessionBoundary>}
    </MessagingShell>;
  }
  const course=query?.course,story=query?.story;
  if(course!==undefined||story!==undefined){
   const valid=typeof course==="string"&&typeof story==="string"&&/^[-a-zA-Z0-9]{1,100}$/.test(course)&&/^[a-f0-9]{32}$/.test(story)&&!query?.store&&!query?.provider&&!query?.request&&!query?.listing;
   const c=await context(valid?"/messages/new?course="+course+"&story="+story:"/messages/new");
   if(!valid)return <MessagingShell><MessageFailure message="글 주소를 확인해 주세요."/></MessagingShell>;
   const r=await c.supabase.rpc("course_story_message_context",{p_course_key:course,p_post_key:story});
   return <MessagingShell>{r.error?<MessageFailure message="현재 이 글쓴이에게 쪽지를 보낼 수 없습니다."/>:<MessagingSessionBoundary viewerId={c.userId}><MessageComposer ownCode={c.userId} story={{courseKey:course,postKey:story,name:r.data.name,id:r.data.id}}/></MessagingSessionBoundary>}</MessagingShell>;
  }
  const listing = query?.listing;
  const store=query?.store,validStore=typeof store==="string"&&recipientCodeValid(store);
  const provider=query?.provider, validProvider=typeof provider==="string"&&recipientCodeValid(provider);
  const request=query?.request, validRequest=typeof request==="string"&&recipientCodeValid(request);
  const validListing = typeof listing === "string" && recipientCodeValid(listing);
  const c = await context(`/messages/new${validStore ? `?store=${encodeURIComponent(store)}` : validProvider ? `?provider=${encodeURIComponent(provider)}` : validRequest ? `?request=${encodeURIComponent(request)}` : validListing ? `?listing=${encodeURIComponent(listing)}` : ""}`);
  // Existing narrow RPC enforces active + signup-complete even on an empty compose page.
  const result = await load(async () => {
    if(store!==undefined){if(!validStore||provider!==undefined||listing!==undefined||request!==undefined)throw new MessagingError("invalid");return getStoreMessageComposeContext(c.supabase,store);}
    if(provider!==undefined){if(!validProvider||listing!==undefined||request!==undefined)throw new MessagingError("invalid");return getVendorMessageComposeContext(c.supabase,provider);}
    if(request!==undefined){if(!validRequest||listing!==undefined)throw new MessagingError("invalid");return getBuyRequestMessageComposeContext(c.supabase,request);}
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
export async function DetailPage({ params, searchParams }: { params: Promise<{ messageId: string }>; searchParams?: Promise<MessagingQuery> }) {
  const { messageId } = await params;
  const query = await searchParams ?? {};
  const c = await context(`/messages/${encodeURIComponent(messageId)}`);
  // A prefetched/SSR render never marks a receipt as read.
  const result = await load(async () => {
    const message = await getMessage(c.supabase, messageId, false);
    const meta = await getMailboxDetail(c.supabase, message.id);
    const destination = await resolveMessageDestination(c.supabase, message, meta).catch(() => ({ unavailable: true }));
    return { message, meta, destination };
  });
  const box = result.ok && !result.data.message.isRecipient ? "sent" : "inbox";
  const cursor = typeof query.at === "string" && typeof query.id === "string" && recipientCodeValid(query.id) && Number.isFinite(Date.parse(query.at))
    ? { at: query.at, id: query.id } : null;
  const listHref = mailboxHref(box, query.filter === "unread", cursor);
  const content = result.ok ? <MessagingSessionBoundary viewerId={c.userId}><MessageDetailView key={result.data.message.id} {...result.data} listHref={listHref} /></MessagingSessionBoundary> : failure(result.error);
  return <MessagingShell box={box}>{content}</MessagingShell>;
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
