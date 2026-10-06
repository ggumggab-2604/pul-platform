import "server-only";
import { createClient } from "@/lib/supabase/server";
import { readPublishedContent, type ContentSnapshot } from "./marketContent";

// Explicit deployment switch. Never infer legacy mode from a failed managed RPC.
export function managedMarketContentEnabled() { return process.env.PUL_MARKET_CONTENT_MODE === "managed"; }
export async function getMarketContentSnapshot(): Promise<ContentSnapshot> {
  if (!managedMarketContentEnabled()) return { mode: "legacy", current: {} };
  return readPublishedContent(await createClient());
}
