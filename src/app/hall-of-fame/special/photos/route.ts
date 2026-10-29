import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { resourceStorage } from "@/lib/courses/courseResourceStorage";
import { PHOTO_UPLOAD_BYTES, PHOTO_MULTIPART_BYTES } from "@/lib/images/photoPolicy";
import { validatePhotoBytes } from "@/lib/images/validatePhotoBytes";
import { specialRpc } from "@/lib/hall-of-fame/hallSpecialRecords";

const headers = {"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"};
export async function POST(request: Request) {
 try {
  // Same-origin transport; authorization remains in every session-scoped RPC.
  const origin = request.headers.get("origin"), site = request.headers.get("sec-fetch-site");
  if (!origin || new URL(origin).host !== request.headers.get("host") || !["http:", "https:"].includes(new URL(origin).protocol) || (site && site !== "same-origin")) return Response.json({error: "요청 출처를 확인해 주세요."}, {status: 403, headers});
  const client = await createClient(), {data, error} = await client.auth.getUser();
  if (error || !data.user) return Response.json({error: "다시 로그인해 주세요."}, {status: 401, headers});
  if (Number(request.headers.get("content-length") ?? 0) > PHOTO_MULTIPART_BYTES) throw Error("사진 전송 크기를 확인해 주세요.");
  const form = await request.formData(), file = form.get("file"), purpose = String(form.get("purpose"));
  if (form.get("viewer_id") !== data.user.id) return Response.json({error: "로그인 계정이 변경되었습니다."}, {status: 403, headers});
  if (!(file instanceof File) || file.size > PHOTO_UPLOAD_BYTES || !["public_photo", "private_score", "private_companion"].includes(purpose)) throw Error("사진과 전송 크기를 확인해 주세요.");
  const kind = String(form.get("media_kind") ?? "photo");
  if (!["photo", "document"].includes(kind)) throw Error("사진 용도를 확인해 주세요.");
  const mediaKind = purpose === "private_score" || (purpose === "public_photo" && kind === "document") ? "document" : "photo";
  const bytes = new Uint8Array(await file.arrayBuffer());
  await validatePhotoBytes(bytes, file.type, mediaKind);
  const hash = createHash("sha256").update(bytes).digest("hex");
  const intent = await specialRpc<{evidence_id: string; path: string}>(client, "mutate_hall_special_record", {p_action: "photo_intent", p_request_id: form.get("request_id"), p_input: {application_record_id: form.get("application_record_id"), version: Number(form.get("version")), purpose, media_kind: mediaKind, mime: file.type, size: file.size}});
  const storage = resourceStorage(), bucket = storage.storage.from("hall-of-fame-evidence");
  const uploaded = await bucket.upload(intent.path, bytes, {contentType: file.type, upsert: false});
  if (uploaded.error) {
   // Retry may find the immutable object from a successful transfer whose finalize response was lost.
   const existing = await bucket.download(intent.path);
   if (existing.error || !existing.data || createHash("sha256").update(Buffer.from(await existing.data.arrayBuffer())).digest("hex") !== hash) throw Error("사진 업로드에 실패했습니다. 파일 선택은 유지됩니다. 다시 시도해 주세요.");
  }
  await specialRpc<void>(storage, "finalize_hall_special_photo_server", {p_actor: data.user.id, p_evidence: intent.evidence_id, p_sha256: hash, p_size: bytes.byteLength});

  return Response.json({id: intent.evidence_id}, {headers});
 } catch (e) {
  return Response.json({error: e instanceof Error && /[가-힣]/.test(e.message) ? e.message : "사진을 저장하지 못했습니다. 다시 시도해 주세요."}, {status: 400, headers});
 }
}

