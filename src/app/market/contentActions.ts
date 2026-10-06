"use server";
import { getMarketContentSnapshot } from "@/lib/market/marketContentServer";
import { contentUnavailable } from "@/lib/market/marketContent";
export async function getMarketContentAction() {
  try { return { ok: true as const, snapshot: await getMarketContentSnapshot() }; }
  catch { return { ok: false as const, message: contentUnavailable }; }
}
