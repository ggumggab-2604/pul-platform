import { completePhotoAsset } from "@/lib/images/completePhotoAsset";
import { validatePhotoBytes, PhotoValidationError } from "@/lib/images/validatePhotoBytes";
import { readPhotoForm, PhotoRequestError, photoOriginMatches } from "@/lib/images/photoRequest";
import { createHash } from "node:crypto";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { contentUuid } from "@/lib/market/marketContent";
export async function POST(request: Request) {
  if (!photoOriginMatches(request)) return Response.json({ message: "요청 출처를 확인할 수 없습니다." }, { status: 403 });
  const context = await getAuthenticatedSupabaseContext();
  if (!context) return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  if (Number(request.headers.get("content-length") ?? 0) > 6 * 1024 * 1024) return Response.json({ message: "첨부는 5MB 이하만 가능합니다." }, { status: 413 });
  try {
    const data = await readPhotoForm(request), file = data.get("file"), id = String(data.get("requestId")), vendorId = String(data.get("vendorId"));
    if (!(file instanceof File) || !contentUuid.test(id) || !contentUuid.test(vendorId) || file.size < 1 || file.size > 5 * 1024 * 1024 ||
      file.name.length > 200 || !["image/jpeg", "image/png", "image/png"].includes(file.type)) return Response.json({ message: "첨부 형식·크기를 확인해 주세요." }, { status: 400 });
    const buffer = Buffer.from(await file.arrayBuffer());
    const valid = file.type === "image/jpeg" ? buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255])) :
      file.type === "image/png" ? buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : buffer.subarray(0,5).toString() === "%PDF-";
    if (!valid) return Response.json({ message: "파일 내용과 형식이 일치하지 않습니다." }, { status: 400 });
    if (file.type !== "application/pdf") await validatePhotoBytes(buffer, file.type, "photo");
    const hash = createHash("sha256").update(buffer).digest("hex");
    const prepared = await context.supabase.rpc("prepare_market_vendor_asset", { p_id: id, p_vendor_id: vendorId, p_mime: file.type, p_bytes: file.size, p_sha256: hash });
    if (prepared.error) return Response.json({ message: "첨부 권한·초안·DB 설정을 확인할 수 없습니다." }, { status: prepared.error.code === "42501" ? 403 : 409 });
    const bucket = context.supabase.storage.from("market-vendor-assets");
    if (!prepared.data?.ready) {
      const upload = await bucket.upload(id, buffer, { contentType: file.type, upsert: false });
      if (upload.error) {
        // Uncertain upload: verify the exact immutable object; never replace or delete it.
        const observed = await bucket.download(id);
        if (observed.error || !observed.data || createHash("sha256").update(Buffer.from(await observed.data.arrayBuffer())).digest("hex") !== hash) {
          return Response.json({ message: "첨부 결과가 불확실합니다. 같은 파일을 선택해 다시 확인하세요." }, { status: 409 });
        }
      }
      await completePhotoAsset("vendor", context.userId, id, file.type, file.size, hash);
    }
    return Response.json({ id });
  } catch (error) { if(error instanceof PhotoValidationError)return Response.json({stage:"prepare",code:"preparation_rejected",message:error.message},{status:400}); if (error instanceof PhotoRequestError) return Response.json({stage:"prepare",code:"preparation_rejected",message:error.message},{status:413}); return Response.json({ message: "첨부 결과를 확인하지 못했습니다. 같은 파일로 다시 확인하세요." }, { status: 503 }); }
}
