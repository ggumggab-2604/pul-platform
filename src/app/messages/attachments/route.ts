import { validatePhotoBytes } from "@/lib/images/validatePhotoBytes";
import { readPhotoForm, PhotoRequestError, photoOriginMatches } from "@/lib/images/photoRequest";
import { createHash } from "node:crypto";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { messagePhotoUuid, validateMessagePhoto } from "@/lib/messaging/messagePhotoRules";
import { getMessagePhotoService } from "@/lib/messaging/messagePhotoStorage";
import { validateClubMediaBytes } from "@/lib/clubs/clubMediaValidation";

export async function POST(request: Request) {
  const rejected = (message: string, status: number, code = "preparation_rejected") =>
    Response.json({ stage: "prepare", code, message }, { status });
  if (!photoOriginMatches(request)) return rejected("요청 출처를 확인할 수 없습니다.", 403);
  const context = await getAuthenticatedSupabaseContext();
  if (!context) return rejected("로그인이 필요합니다.", 401);
  if (Number(request.headers.get("content-length") ?? 0) > 6 * 1024 * 1024) return rejected("사진은 각 5MB 이내로 선택해 주세요.", 413);
  try {
    const data = await readPhotoForm(request), file = data.get("file");
    const id = String(data.get("photoId")).toLowerCase(), draftId = String(data.get("draftId")).toLowerCase();
    if (!(file instanceof File) || !messagePhotoUuid.test(id) || !messagePhotoUuid.test(draftId)) return rejected("사진 입력을 확인해 주세요.", 400);
    try { validateMessagePhoto(file); } catch { return rejected("사진은 JPG/PNG, 각 5MB 이내로 선택해 주세요.", 400); }
    const buffer = Buffer.from(await file.arrayBuffer());
    try { validateClubMediaBytes(buffer, file.type, file.size, file.type); await validatePhotoBytes(buffer, file.type, "photo"); }
    catch { return rejected("파일 내용과 형식이 일치하지 않습니다.", 400); }
    const hash = createHash("sha256").update(buffer).digest("hex");
    let server;
    try { server = getMessagePhotoService(); }
    catch { return rejected("사진 첨부 기능이 아직 연결되지 않았습니다. 작성 내용과 사진은 유지됩니다. 사진을 제외하고 글만 보내거나 나중에 다시 시도해 주세요.", 503, "preparation_unavailable"); }
    // The user-scoped RPC binds auth.uid(), ownership, draft and immutable file
    // metadata BEFORE any privileged Storage operation. Ignore client owner/path fields.
    const prepared = await context.supabase.rpc("prepare_message_photo", { p_id: id, p_draft_id: draftId, p_mime: file.type, p_bytes: file.size, p_sha256: hash });
    if (prepared.error?.code === "PGRST202") return rejected("사진 첨부 기능이 아직 연결되지 않았습니다. 작성 내용과 사진은 유지됩니다. 사진을 제외하고 글만 보내거나 나중에 다시 시도해 주세요.", 503, "preparation_unavailable");
    if (prepared.error?.code === "42501" || prepared.error?.code === "22023") return rejected("이 사진을 첨부할 수 없습니다. 사진을 다시 선택해 주세요.", prepared.error.code === "42501" ? 403 : 400);
    if (prepared.error || typeof prepared.data?.ready !== "boolean") return Response.json({ message: "사진 준비 결과를 확인하지 못했습니다. 같은 사진으로 다시 확인해 주세요." }, { status: 503 });
    const bucket = server.storage.from("private-message-photos");
    if (!prepared.data.ready) {
      // No user INSERT/UPDATE/DELETE and no upsert: a verified object is immutable.
      // A duplicate/lost upload response is resolved only by reading the exact object.
      await bucket.upload(id, buffer, { contentType: file.type, upsert: false });
    }
    // Read back even on successful upload or ready=true retries. An upload receipt
    // or client-declared metadata alone must never authorize completion.
    const observed = await bucket.download(id);
    if (observed.error || !observed.data) return Response.json({ message: "사진 업로드 결과가 불확실합니다. 같은 사진으로 다시 확인해 주세요." }, { status: 409 });
    const stored = Buffer.from(await observed.data.arrayBuffer());
    try { validateClubMediaBytes(stored, file.type, file.size, observed.data.type); await validatePhotoBytes(stored, file.type, "photo"); }
    catch { return Response.json({ message: "저장된 사진 내용을 확인하지 못했습니다. 같은 사진으로 다시 확인해 주세요." }, { status: 409 }); }
    const storedHash = createHash("sha256").update(stored).digest("hex");
    if (storedHash !== hash) return Response.json({ message: "저장된 사진이 선택한 파일과 일치하지 않습니다. 같은 사진으로 다시 확인해 주세요." }, { status: 409 });
    const complete = await server.rpc("complete_message_photo_server", {
      p_actor_user_id: context.userId, p_id: id, p_draft_id: draftId,
      p_verified_mime: file.type, p_verified_bytes: stored.length, p_verified_sha256: storedHash,
    });
    if (complete.error || complete.data?.id !== id) return Response.json({ message: "사진 업로드 완료를 확인하지 못했습니다. 같은 사진으로 다시 확인해 주세요." }, { status: 409 });
    return Response.json({ id });
  } catch (error) {
    if (error instanceof PhotoRequestError) return rejected(error.message,413);
    return Response.json({ message: "사진 업로드 결과를 확인하지 못했습니다. 같은 사진으로 다시 확인해 주세요." }, { status: 503 });
  }
}

