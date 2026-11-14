import { revalidatePath } from "next/cache";
import { applicantFields, openingFields, universityApplications, universityReview } from "@/lib/lessons/universityFollowup";
import { safeUniversityHref, universityKey, uuid } from "@/lib/lessons/universityWorkspace";
import { definitiveFailure, reply, universityMultipart } from "@/lib/lessons/universityMultipart";
import { resourceStorage } from "@/lib/courses/courseResourceStorage";

export async function POST(request: Request) {
  const input = await universityMultipart(request);
  if (input instanceof Response) return input;
  const { auth, text, photo } = input;
  const id = text("id"), retry = text("requestKey"), kind = text("kind");
  const department = text("department"), version = text("version") ? Number(text("version")) : null;
  if (!uuid(id) || !uuid(retry) || !["opening", "manager"].includes(kind) ||
    (kind === "manager" && !universityKey(department)) ||
    (version !== null && (!Number.isSafeInteger(version) || version < 1))) return reply("신청 내용을 확인해 주세요.");
  const details: Record<string, string | null> = {};
  for (const [key,, max, required] of [...applicantFields, ...(kind === "opening" ? openingFields : [])]) {
    const value = text(key);
    if ((required && !value) || [...value].length > max) return reply("필수 항목과 입력 길이를 확인해 주세요.");
    details[key] = key.endsWith("_url") ? safeUniversityHref(value) : value || null;
    if (value && !details[key]) return reply("공식 링크는 올바른 HTTPS 주소를 입력해 주세요.");
  }
  details.campus ??= null;
  details.region = text("region");
  details.program_kind = text("program_kind");
  async function duplicate() {
    const result = await auth.supabase.rpc("find_existing_university_department", {
      p_school: details.university_name, p_name: details.department_name, p_campus: details.campus,
      p_region: details.region, p_kind: details.program_kind,
    });
    return result.data;
  }
  if (photo && kind !== "opening") return reply("개설 신청에만 대표 사진을 첨부할 수 있습니다.");
  const service = resourceStorage();
  const bucket = service.storage.from("university-representatives");
  const path = photo ? "dept-" + id + "/" + crypto.randomUUID() : null;
  if (photo && path) {
    const uploaded = await bucket.upload(path, photo, { contentType: photo.type, upsert: false });
    if (uploaded.error) return reply("대표 사진을 업로드하지 못했습니다.", 503);
  }
  const result = await Promise.resolve(service.rpc("submit_university_application", {
    p_actor: auth.userId, p_id: id, p_request: retry, p_version: version,
    p_kind: kind, p_department: department || null, p_details: details, p_photo: path,
  })).catch(() => null);
  const code = result?.error?.code ?? "";
  if (path && (definitiveFailure.has(code) || result?.data?.replay)) await bucket.remove([path]).catch(() => undefined);
  if (!result || result.error) {
    const existing = kind === "opening" && code === "PT409" ? await duplicate() : null;
    return reply(definitiveFailure.has(code) ? result?.error?.message || "신청을 확인해 주세요." : "신청 결과를 확인하지 못했습니다. 내 신청 내역을 확인해 주세요.",
      code === "PT409" || code === "23505" ? 409 : code === "42501" ? 403 : definitiveFailure.has(code) ? 400 : 503, { existing });
  }
  const old = result.data?.previous_photo;
  if (path && typeof old === "string" && old.startsWith("dept-" + id + "/") && old !== path) await bucket.remove([old]).catch(() => undefined);
  revalidatePath(universityApplications);
  revalidatePath(universityReview);
  return Response.json({ ok: true, message: "신청을 접수했습니다.", id });
}

