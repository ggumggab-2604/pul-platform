import { createHash } from "node:crypto";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { contentUuid } from "@/lib/market/marketContent";
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ message: "요청 출처를 확인할 수 없습니다." }, { status: 403 });
  const context = await getAuthenticatedSupabaseContext();
  if (!context) return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  if (Number(request.headers.get("content-length") ?? 0) > 6 * 1024 * 1024) return Response.json({ message: "첨부는 5MB 이하만 가능합니다." }, { status: 413 });
  try {
    const data = await request.formData(), file = data.get("file"), id = String(data.get("requestId")), draftId = String(data.get("draftId"));
    if (!(file instanceof File) || !contentUuid.test(id) || !contentUuid.test(draftId) || file.size < 1 || file.size > 5 * 1024 * 1024 ||
      file.name.length > 200 || !["image/jpeg", "image/png", "application/pdf"].includes(file.type)) return Response.json({ message: "첨부 형식·크기를 확인해 주세요." }, { status: 400 });
    const buffer = Buffer.from(await file.arrayBuffer());
    const valid = file.type === "image/jpeg" ? buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255])) :
      file.type === "image/png" ? buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : buffer.subarray(0,5).toString() === "%PDF-";
    if (!valid) return Response.json({ message: "파일 내용과 형식이 일치하지 않습니다." }, { status: 400 });
    const hash = createHash("sha256").update(buffer).digest("hex");
    const prepared = await context.supabase.rpc("prepare_market_content_asset", { p_id: id, p_draft_id: draftId, p_name: file.name, p_mime: file.type, p_bytes: file.size, p_sha256: hash });
    if (prepared.error) return Response.json({ message: "첨부 권한·초안·DB 설정을 확인할 수 없습니다." }, { status: prepared.error.code === "42501" ? 403 : 409 });
    const bucket = context.supabase.storage.from("market-content-assets");
    if (prepared.data?.state !== "ready") {
      const upload = await bucket.upload(id, buffer, { contentType: file.type, upsert: false });
      if (upload.error) {
        // Uncertain upload: verify the exact immutable object; never replace or delete it.
        const observed = await bucket.download(id);
        if (observed.error || !observed.data || createHash("sha256").update(Buffer.from(await observed.data.arrayBuffer())).digest("hex") !== hash) {
          return Response.json({ message: "첨부 결과가 불확실합니다. 같은 파일을 선택해 다시 확인하세요." }, { status: 409 });
        }
      }
      const complete = await context.supabase.rpc("complete_market_content_asset", { p_id: id });
      if (complete.error) return Response.json({ message: "첨부 완료를 확인하지 못했습니다. 같은 파일로 다시 확인하세요." }, { status: 409 });
    }
    return Response.json({ id });
  } catch { return Response.json({ message: "첨부 결과를 확인하지 못했습니다. 같은 파일로 다시 확인하세요." }, { status: 503 }); }
}
