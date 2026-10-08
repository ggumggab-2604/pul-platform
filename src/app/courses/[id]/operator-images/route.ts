import { createHash } from "node:crypto";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { contentRpc, uuid } from "@/lib/courses/courseContent";
import { getCourseOperatorImages, getCourseOperatorUnfinished } from "@/lib/courses/courseOperatorImages";
import { resourceStorage } from "@/lib/courses/courseResourceStorage";
import { cleanupCourseOperatorImages } from "@/lib/courses/courseOperatorImageCleanup";
import { photoOriginMatches, readPhotoForm, PhotoRequestError } from "@/lib/images/photoRequest";
import { validatePhotoBytes } from "@/lib/images/validatePhotoBytes";
import { validateClubMediaBytes, validateClubMediaDeclaration, validateClubMediaFilename } from "@/lib/clubs/clubMediaValidation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "private, no-store" };
  let bytes: Uint8Array | undefined;
  try {
    if (!photoOriginMatches(request)) return Response.json({ error: "요청 경로를 확인해 주세요." }, { status: 403, headers });
    const context = await getAuthenticatedSupabaseContext();
    if (!context) return Response.json({ error: "로그인이 필요합니다." }, { status: 401, headers });
    const { id: courseKey } = await params;
    const current = await getCourseOperatorImages(context.supabase, courseKey);
    if (!current.canManage) return Response.json({ error: "이 구장의 이미지 관리 권한이 없습니다." }, { status: 403, headers });
    const service = resourceStorage();
    if (request.headers.get("content-type")?.startsWith("application/json")) {
      const text = await request.text();
      if (text.length > 20_000) throw Error("이미지 입력을 확인해 주세요.");
      const body = JSON.parse(text);
      let result: { version?: number; removed: string[] };
      if (body.action === "save" && uuid.test(body.requestId ?? "") && Array.isArray(body.images)) {
        result = await contentRpc(context.supabase, "course_operator_images_save", { p_course_key: courseKey, p_version: body.version, p_request_id: body.requestId, p_images: body.images });
      } else if (body.action === "discard" && Array.isArray(body.ids) && body.ids.length <= 8 && body.ids.every((id: unknown) => typeof id === "string" && uuid.test(id))) {
        result = await contentRpc(context.supabase, "course_operator_images_discard", { p_course_key: courseKey, p_ids: body.ids });
      } else throw Error("이미지 작업을 확인해 주세요.");
      let cleanupDelayed = false;
      if (result.removed.length && body.action === "discard") {
        try { await cleanupCourseOperatorImages(service, context.userId, courseKey, result.removed); }
        catch (cause) {
          if ((cause as { code?: string }).code === "42501") throw cause;
          return Response.json({ error: "사진 정리가 완료되지 않았습니다. 다시 시도해 주세요.", cleanupDelayed: true }, { status: 503, headers });
        }
      } else if (result.removed.length) {
        const removal = await service.storage.from("course-operator-images").remove(result.removed);
        cleanupDelayed = !!removal.error;
      }
      return Response.json({ ...result, cleanupDelayed }, { headers });
    }
    const form = await readPhotoForm(request);
    const file = form.get("file"), requestId = String(form.get("requestId") ?? ""), purpose = form.get("purpose");
    if (!(file instanceof File) || !uuid.test(requestId) || (purpose !== "photo" && purpose !== "document")) throw Error("사진과 용도를 확인해 주세요.");
    const mime = validateClubMediaDeclaration(file.type, file.size);
    validateClubMediaFilename(file.name, mime);
    bytes = new Uint8Array(await file.arrayBuffer());
    validateClubMediaBytes(bytes, mime, file.size, file.type);
    const dimensions = await validatePhotoBytes(bytes, mime, purpose);
    const hash = createHash("sha256").update(bytes).digest("hex");
    const intent = await contentRpc<{ id: string; uploaded: boolean }>(service, "course_operator_image_prepare", { p_actor: context.userId, p_course_key: courseKey, p_request_id: requestId, p_purpose: purpose, p_mime: mime, p_bytes: bytes.byteLength, p_hash: hash, p_width: dimensions.width, p_height: dimensions.height });
    if (!intent.uploaded) {
      try {
      const saved = await service.storage.from("course-operator-images").upload(intent.id, bytes, { contentType: mime, upsert: false });
      if (saved.error) {
        const existing = await service.storage.from("course-operator-images").download(intent.id);
        if (existing.error || createHash("sha256").update(new Uint8Array(await existing.data.arrayBuffer())).digest("hex") !== hash) throw Error("이미지를 저장하지 못했습니다. 다시 시도해 주세요.");
      }
      await contentRpc(service, "course_operator_image_finish", { p_actor: context.userId, p_course_key: courseKey, p_id: intent.id, p_hash: hash });
      } catch (cause) {
        // An explicitly cancelled upload can finish sending in another tab. Only terminal removed rows are eligible.
        try { await cleanupCourseOperatorImages(service, context.userId, courseKey, [intent.id]); } catch {}
        throw cause;
      }
    }
    return Response.json({ id: intent.id, width: dimensions.width, height: dimensions.height }, { headers });
  } catch (cause) {
    const error = cause as Error & { code?: string };
    return Response.json({ error: /[가-힣]/.test(error.message) ? error.message : "이미지 입력을 확인하고 다시 시도해 주세요." }, { status: cause instanceof PhotoRequestError ? 413 : error.code === "42501" ? 403 : error.code === "40001" ? 409 : 400, headers });
  } finally { bytes?.fill(0); }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const context = await getAuthenticatedSupabaseContext();
    if (!context) return Response.json({ error: "로그인이 필요합니다." }, { status: 401, headers });
    const { id: courseKey } = await params;
    return Response.json(await getCourseOperatorUnfinished(context.supabase, courseKey), { headers });
  } catch (cause) {
    const error = cause as Error & { code?: string };
    return Response.json({ error: /[가-힣]/.test(error.message) ? error.message : "저장하지 않은 사진을 확인하지 못했습니다." }, { status: error.code === "42501" ? 403 : 400, headers });
  }
}
