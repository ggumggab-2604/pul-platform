import { validatePhotoBytes } from "@/lib/images/validatePhotoBytes";
import { photoOriginMatches, PhotoRequestError, readPhotoForm } from "@/lib/images/photoRequest";
import { resourceStorage } from "@/lib/courses/courseResourceStorage";
import { safeUniversityHref, universityHref, universityKey } from "@/lib/lessons/universityWorkspace";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { revalidatePath } from "next/cache";

const bucket = "university-representatives";
const errorResponse = (message: string, status: number, errors?: Record<string, string>) =>
  Response.json({ ok: false, message, errors }, { status });
const aborted = new Set(["22023", "22007", "22008", "23514", "PT409", "42501"]);
const conflict = () => errorResponse("다른 곳에서 학과 정보가 변경되었습니다. 최신 정보를 확인해 주세요.", 409);

export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!universityKey(key)) return errorResponse("학과를 찾을 수 없습니다.", 404);
  if (!photoOriginMatches(request)) return errorResponse("요청 출처를 확인해 주세요.", 403);
  const auth = await getAuthenticatedSupabaseContext();
  if (!auth) return errorResponse("로그인이 필요합니다.", 401);
  const scope = await auth.supabase.rpc("get_university_workspace", { p_key: key, p_section: "profile" });
  if (scope.error) return scope.error.code === "42501"
    ? errorResponse("학과 관리 권한이 필요합니다.", 403)
    : errorResponse("학과 관리 권한을 확인하지 못했습니다. 다시 시도해 주세요.", 503);
  let form: FormData;
  try { form = await readPhotoForm(request, false, true); }
  catch (error) {
    return error instanceof PhotoRequestError ? errorResponse(error.message, 413) : errorResponse("입력 내용을 확인해 주세요.", 400);
  }
  const text = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value.trim() : "";
  };
  if (text("viewerId") !== auth.userId) return errorResponse("로그인 계정이 변경되었습니다. 페이지를 다시 열어 주세요.", 403);
  const version = Number(text("version"));
  if (version !== scope.data?.version) return conflict();
  const profile: Record<string, string | null> = {};
  const errors: Record<string, string> = {};
  for (const field of ["school_url", "official_url", "guide_url", "admissions_url"]) {
    if (field === "school_url" && !form.has(field)) continue;
    const value = text(field);
    profile[field] = safeUniversityHref(value);
    if (value && !profile[field]) errors[field] = "https://로 시작하는 올바른 주소를 입력해 주세요.";
  }
  for (const [field, min, max] of [["summary", 10, 1000], ["recruitment_title", 0, 160], ["recruitment_body", 0, 2000]] as const) {
    const value = text(field);
    profile[field] = value || null;
    if ([...value].length < min || [...value].length > max) errors[field] = min ? `${min}~${max}자로 입력해 주세요.` : `${max}자 이내로 입력해 주세요.`;
  }
  const start = text("recruitment_start"), end = text("recruitment_end");
  const date = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !value.startsWith("0000")
    && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if ((start || end) && (!date(start) || !date(end) || end < start)) errors.recruitment_end = "시작일과 마감일을 올바른 순서로 입력해 주세요.";
  profile.recruitment_start = start || null;
  profile.recruitment_end = end || null;
  if (Object.keys(errors).length) return errorResponse("입력란을 확인해 주세요.", 400, errors);

  const photo = form.get("file");
  let path: string | null = null;
  try {
    const service = resourceStorage();
    if (photo instanceof File && photo.size > 0) {
      const bytes = new Uint8Array(await photo.arrayBuffer());
      try { await validatePhotoBytes(bytes, photo.type, "photo"); }
      catch (error) {
        return errorResponse(error instanceof Error ? error.message : "사진 파일을 확인해 주세요.", 400);
      }
      path = key + "/" + crypto.randomUUID();
      const upload = await service.storage.from(bucket).upload(path, bytes, { contentType: photo.type, upsert: false });
      if (upload.error) return errorResponse("대표 사진을 업로드하지 못했습니다.", 503);
    }
    const saved = await Promise.resolve(service.rpc("save_university_profile", {
      p_key: key, p_actor: auth.userId, p_version: version, p_profile: profile, p_photo: path,
    })).catch(() => null);
    if (!saved || saved.error) {
      const code = saved?.error?.code ?? "";
      if (path) {
        let unused = aborted.has(code);
        if (!unused) {
          const current = await Promise.resolve(auth.supabase.rpc("get_university_workspace", {
            p_key: key, p_section: "profile",
          })).catch(() => null);
          // Only a committed newer version rules out both a current reference and a late save.
          unused = Boolean(current && !current.error && current.data?.version > version
            && (current.data.photo_path === null || typeof current.data.photo_path === "string")
            && current.data.photo_path !== path);
        }
        if (unused) await service.storage.from(bucket).remove([path]).catch(() => undefined);
      }
      if (code === "PT409") return conflict();
      if (code === "42501") return errorResponse("학과 관리 권한이 필요합니다.", 403);
      return errorResponse("저장 결과를 확인하지 못했습니다. 공개 학과를 확인한 뒤 다시 시도해 주세요.", 503);
    }
    const { data } = saved;
    const old = data?.previous_photo;
    if (path && typeof old === "string" && old !== path && old.startsWith(key + "/")) {
      await service.storage.from(bucket).remove([old]).catch(() => undefined);
    }
    revalidatePath("/lessons");
    revalidatePath(universityHref(key));
    revalidatePath(universityHref(key) + "/manage");
    return Response.json({ ok: true, message: "공개 학과 변경 사항을 저장했습니다.", version: data.version });
  } catch {
    return errorResponse("학과 정보를 저장하지 못했습니다. 공개 학과를 확인한 뒤 다시 시도해 주세요.", 503);
  }
}
