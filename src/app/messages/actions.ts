"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import {
  MessagingError, sendMessage, replyMessage, markMessageRead, hideMessage, getMessage,
  setMessageBlock, submitMessageReport, resolveMessageReport, getMessageReport, getMessageUnreadCount,
  type MessagingReportReason,
} from "@/lib/messaging/messaging";

async function context() {
  const value = await getAuthenticatedSupabaseContext();
  if (!value) throw new MessagingError("login");
  return value;
}
async function perform<T>(work: () => Promise<T>) {
  try { return { ok: true as const, data: await work() }; }
  catch (error) {
    const safe = error instanceof MessagingError ? error : new MessagingError("unknown");
    return { ok: false as const, error: safe.message, code: safe.code };
  }
}
function refreshMailbox() { revalidatePath("/messages", "layout"); }

export async function sendMessageAction(input: { recipientId: string; body: string; requestId: string }) {
  return perform(async () => { const c = await context(); const data = await sendMessage(c.supabase, input); refreshMailbox(); return data; });
}
export async function replyMessageAction(input: { messageId: string; body: string; requestId: string }) {
  return perform(async () => { const c = await context(); const data = await replyMessage(c.supabase, input); refreshMailbox(); return data; });
}
export async function markMessageReadAction(messageId: string) {
  return perform(async () => { const c = await context(); const data = await markMessageRead(c.supabase, messageId); refreshMailbox(); return data; });
}
export async function hideMessageAction(messageId: string) {
  return perform(async () => {
    const c = await context();
    const message = await getMessage(c.supabase, messageId, false);
    await hideMessage(c.supabase, messageId); refreshMailbox();
    return { href: message.isRecipient ? "/messages" : "/messages/sent" };
  });
}
export async function setMessageBlockAction(messageId: string, blocked: boolean) {
  return perform(async () => {
    const c = await context();
    // The UI supplies a message identifier. Derive its counterpart at the trusted boundary.
    const message = await getMessage(c.supabase, messageId, false);
    if (!message.counterpartUserId) throw new MessagingError("recipient");
    await setMessageBlock(c.supabase, message.counterpartUserId, blocked);
    return { blocked };
  });
}
export async function unblockMessageUserAction(blockedUserId: string) {
  return perform(async () => {
    const c = await context();
    // The wrapper validates the UUID; the RPC can delete only auth.uid()'s row.
    await setMessageBlock(c.supabase, blockedUserId, false);
    revalidatePath("/messages/blocked");
    return { unblocked: true };
  });
}
export async function submitMessageReportAction(input: { messageId: string; reason: MessagingReportReason; detail?: string }) {
  return perform(async () => { const c = await context(); return submitMessageReport(c.supabase, input); });
}
export async function openMessageReportAction(reportId: string) {
  // This RPC audits a read; call only after an operator actually opens the client view.
  return perform(async () => { const c = await context(); return getMessageReport(c.supabase, reportId); });
}
export async function resolveMessageReportAction(reportId: string) {
  return perform(async () => {
    const c = await context(); await resolveMessageReport(c.supabase, reportId);
    revalidatePath("/manage/messages/reports", "layout"); return { resolved: true };
  });
}
export async function getMessagingBadgeAction() {
  return perform(async () => { const c = await context(); return { count: await getMessageUnreadCount(c.supabase), viewerId: c.userId }; });
}
