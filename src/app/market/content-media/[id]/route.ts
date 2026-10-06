import { createClient } from "@/lib/supabase/server";
import { contentUuid } from "@/lib/market/marketContent";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!contentUuid.test(id)) return new Response("자료를 찾을 수 없습니다.", { status: 404 });
  try {
    // Storage SELECT policy permits public published references or the authorized draft owner.
    const { data, error } = await (await createClient()).storage.from("market-content-assets").download(id);
    if (error || !data) return new Response("자료를 확인할 수 없습니다.", { status: 404 });
    return new Response(data, { headers: { "Content-Type": data.type || "application/octet-stream", "Content-Disposition": 'attachment; filename="market-content-attachment"', "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store", "Content-Security-Policy": "sandbox" } });
  } catch { return new Response("첨부를 불러오지 못했습니다.", { status: 503 }); }
}
