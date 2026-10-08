import "server-only";
import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { validatePhotoBytes } from "./validatePhotoBytes";
const buckets = { store: "market-store-assets", vendor: "market-vendor-assets", content: "market-content-assets" } as const;
let client: SupabaseClient | undefined;
function service() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) throw Error("사진 검증 서비스를 사용할 수 없습니다.");
  return client ??= createClient(getSupabasePublicEnv().url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
/** Called only after the authenticated preparation RPC authorizes this exact asset. */
export async function completePhotoAsset(kind: keyof typeof buckets, actor: string, id: string, mime: string, size: number, hash: string) {
  const server = service();
  const observed = await server.storage.from(buckets[kind]).download(id);
  if (observed.error || !observed.data) throw Error("저장한 사진을 확인하지 못했습니다. 같은 사진으로 다시 확인해 주세요.");
  const bytes = new Uint8Array(await observed.data.arrayBuffer());
  try {
    if (bytes.byteLength !== size || observed.data.type !== mime || createHash("sha256").update(bytes).digest("hex") !== hash)
      throw Error("저장한 파일이 업로드 요청과 일치하지 않습니다.");
    if (mime !== "application/pdf") await validatePhotoBytes(bytes, mime, kind === "content" ? "document" : "photo");
    const result = await server.rpc("complete_market_photo_asset_server", {
      p_kind: kind, p_actor: actor, p_id: id, p_verified_mime: mime, p_verified_bytes: size, p_verified_sha256: hash,
    });
    if (result.error || result.data?.id !== id) throw Error("사진 검증 완료를 확인하지 못했습니다. 같은 사진으로 다시 확인해 주세요.");
    return { id };
  } finally { bytes.fill(0); }
}
