import { revalidatePath } from "next/cache";
import { definitiveFailure, reply, universityMultipart } from "@/lib/lessons/universityMultipart";
import { resourceStorage } from "@/lib/courses/courseResourceStorage";
import { universityHref, universityKey, uuid } from "@/lib/lessons/universityWorkspace";

export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!universityKey(key)) return reply("학과를 확인해 주세요.", 404);
  const input = await universityMultipart(request);
  if (input instanceof Response) return input;
  const { auth, text, photo } = input;
  const id = text("id"), kind = text("kind"), operation = text("operation");
  const version = text("version") ? Number(text("version")) : null;
  if (!uuid(id) || !["notice","story","event"].includes(kind) || !["create","edit","delete","join","cancel"].includes(operation)
    || (version !== null && (!Number.isSafeInteger(version) || version < 1))
    || (photo && (kind !== "story" || !["create","edit"].includes(operation)))) return reply("게시물이나 일정을 확인해 주세요.");
  const access = await auth.supabase.rpc("get_university_space", { p_key: key, p_kind: kind });
  if (access.error) return reply("학과 공간 이용 권한을 확인해 주세요.", access.error.code === "42501" ? 403 : 503);
  const service = resourceStorage();
  const bucket = service.storage.from("university-activities");
  const path = photo ? id + "/" + crypto.randomUUID() : null;
  if (path && photo) {
    const uploaded = await bucket.upload(path, photo, { contentType: photo.type, upsert: false });
    if (uploaded.error) return reply("활동 사진을 업로드하지 못했습니다.", 503);
  }
  const details = Object.fromEntries(["title","body","event_date","event_time","place"].map(field => [field,text(field)]));
  const result = await Promise.resolve(service.rpc("mutate_university_space", {
    p_actor: auth.userId, p_key: key, p_id: id, p_operation: operation, p_kind: kind,
    p_version: version, p_details: details, p_photo: path,
  })).catch(() => null);
  const code = result?.error?.code ?? "";
  if (path && (definitiveFailure.has(code) || result?.data?.replay)) await bucket.remove([path]).catch(() => undefined);
  if (!result || result.error) return reply(definitiveFailure.has(code) ? result?.error?.message || "내용을 확인해 주세요." : "처리 결과를 확인하지 못했습니다. 새로고침해 최신 내용을 확인해 주세요.",
    code === "42501" ? 403 : code === "PT409" ? 409 : definitiveFailure.has(code) ? 400 : 503);
  const old = result.data?.previous_photo;
  if (typeof old === "string" && old.startsWith(id + "/") && old !== path) await bucket.remove([old]).catch(() => undefined);
  revalidatePath(universityHref(key) + "/students");
  return Response.json({ ok: true, message: operation === "join" ? "참가를 신청했습니다." : operation === "cancel" ? "참가를 취소했습니다." : operation === "delete" ? "삭제했습니다." : "저장했습니다." });
}

