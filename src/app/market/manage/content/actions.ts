"use server";
import { revalidatePath } from "next/cache";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { MarketContentError, readContentManagement, writeContent, type ContentCommand } from "@/lib/market/marketContent";
import { managedMarketContentEnabled } from "@/lib/market/marketContentServer";

function failure(error: unknown) {
  const e = error instanceof MarketContentError ? error : new MarketContentError("uncertain", "응답을 확인하지 못했습니다. 결과를 다시 조회해 주세요.");
  return { ok: false as const, code: e.code, message: e.message };
}
export async function loadMarketContentManagementAction() {
  try {
    const context = await getAuthenticatedSupabaseContext();
    if (!context) throw new MarketContentError("permission", "로그인과 운영 권한을 확인해 주세요.");
    return { ok: true as const, data: await readContentManagement(context.supabase) };
  } catch (error) { return failure(error); }
}
export async function saveMarketContentAction(input: ContentCommand) {
  try {
    if (input.operation === "publish" && !managedMarketContentEnabled()) throw new MarketContentError("unavailable", "새 정책 방식이 아직 활성화되지 않았습니다. 게시할 수 없습니다.");
    const context = await getAuthenticatedSupabaseContext();
    if (!context) throw new MarketContentError("permission", "로그인과 운영 권한을 확인해 주세요.");
    // DB repeats authorization and atomically resolves replay, draft version and current-policy lock.
    const revision = await writeContent(context.supabase, input);
    revalidatePath("/market"); revalidatePath("/market/policy"); revalidatePath("/market/manage/content");
    return { ok: true as const, revision };
  } catch (error) { return failure(error); }
}
