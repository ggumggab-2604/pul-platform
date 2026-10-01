import type { SupabaseClient } from "@supabase/supabase-js";
import { setLessonVideoBookmark } from "@/lib/lessons/lessonVideoBookmarks";
export type InterestKind = "market" | "lesson_video";
export type InterestFilter = InterestKind | "all";
export type InterestItem = {
  kind: InterestKind; id: string; savedAt: string; available: boolean;
  title: string | null; image: string | null; price: number | null;
  region: string | null; status: string | null; href: string | null; summary: string | null;
};
export type InterestPage = { items: InterestItem[]; hasMore: boolean };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function interestTarget(kind: InterestKind, id: string) {
  if ((kind !== "market" && kind !== "lesson_video") || typeof id !== "string" ||
      !(kind === "market" ? uuid : /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/).test(id))
    throw new Error("관심 항목을 확인해 주세요.");
}
export function marketInterestHref(id: string) {
  interestTarget("market", id);
  return `/market?view=sale&listing=${encodeURIComponent(id)}`;
}
function failure(error: { code?: string } | null): never {
  if (error?.code === "PGRST202") throw new Error("관심목록을 준비 중입니다. 잠시 후 다시 이용해 주세요.");
  throw new Error("관심목록을 처리하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.");
}
export async function setInterest(client: SupabaseClient,kind: InterestKind,id: string,saved: boolean) {
  interestTarget(kind,id);
  if (typeof saved !== "boolean") throw new Error("저장 상태를 확인해 주세요.");
  if (kind === "lesson_video") { await setLessonVideoBookmark(client,id,saved); return saved; }
  const {data,error}=await client.rpc("set_market_interest",{p_listing_id:id,p_saved:saved});
  if (error || data?.id !== id || data?.saved !== saved) failure(error);
  return saved;
}
export async function marketInterestState(client: SupabaseClient,id: string) {
  interestTarget("market",id);
  const {data,error}=await client.rpc("market_interest_state",{p_listing_id:id});
  if (error || typeof data !== "boolean") failure(error);
  return data as boolean;
}
export async function listInterests(client: SupabaseClient,kind: InterestFilter="all",offset=0): Promise<InterestPage> {
  if (!["all","market","lesson_video"].includes(kind) || !Number.isInteger(offset) || offset<0 || offset>10000)
    throw new Error("관심목록 조회 범위를 확인해 주세요.");
  const {data,error}=await client.rpc("list_my_interests",{p_kind:kind,p_limit:12,p_offset:offset});
  if (error || !Array.isArray(data?.items) || typeof data.has_more !== "boolean") failure(error);
  return {hasMore:data.has_more,items:data.items.map((row: Record<string,unknown>) => {
    const kind=row.kind as InterestKind, id=row.id as string;
    interestTarget(kind,id);
    if (typeof row.available !== "boolean" || typeof row.saved_at !== "string") failure(null);
    const available=row.available;
    const text=(value:unknown)=>typeof value==="string"?value:null;
    let href:string|null=null;
    if(available && kind==="market") href=marketInterestHref(id);
    if(available && kind==="lesson_video") {
      try {const url=new URL(String(row.url)); if(url.protocol!=="https:"||!["youtube.com","www.youtube.com","youtu.be"].includes(url.hostname)) failure(null); href=url.href;} catch {failure(null);}
    }
    const imagePath=available && kind==="market"?text(row.image_path):null;
    return {kind,id,savedAt:row.saved_at,available,title:available?text(row.title):null,
      image:imagePath?client.storage.from("market-media").getPublicUrl(imagePath).data.publicUrl:null,
      price:available && typeof row.price==="number"?row.price:null,
      region:available?text(row.region):null,status:available?text(row.status):null,href,summary:available?text(row.summary):null};
  })};
}
