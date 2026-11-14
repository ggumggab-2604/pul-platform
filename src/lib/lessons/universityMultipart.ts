import "server-only";
import { photoOriginMatches, readPhotoForm, PhotoRequestError } from "@/lib/images/photoRequest";
import { validatePhotoBytes } from "@/lib/images/validatePhotoBytes";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { resourceStorage } from "@/lib/courses/courseResourceStorage";

export const reply = (message: string, status = 400, extra?: object) => Response.json({ ok: false, message, ...extra }, { status });
export async function universityMultipart(request: Request) {
  if (!photoOriginMatches(request)) return reply("요청 출처를 확인해 주세요.", 403);
  const auth = await getAuthenticatedSupabaseContext();
  if (!auth) return reply("로그인이 필요합니다.", 401);
  try {
    const form = await readPhotoForm(request, false, true);
    const text = (key: string) => { const value = form.get(key); return typeof value === "string" ? value.trim() : ""; };
    if (auth.userId !== text("viewerId")) return reply("로그인 계정이 변경되었습니다.", 403);
    const file = form.get("file");
    const photo = file instanceof File && file.size > 0 ? file : null;
    if (photo) await validatePhotoBytes(new Uint8Array(await photo.arrayBuffer()), photo.type, "photo");
    return { auth, text, photo };
  } catch (error) {
    return reply(error instanceof Error ? error.message : "입력 내용을 확인해 주세요.", error instanceof PhotoRequestError ? 413 : 400);
  }
}
export const definitiveFailure = new Set(["22023", "22007", "22008", "23514", "23505", "PT409", "42501"]);
export async function privateUniversityImage(bucket: string, path: string | null | undefined) {
  if (!path) return new Response(null, { status: 404 });
  const { data } = await resourceStorage().storage.from(bucket).download(path);
  return data ? new Response(data, { headers: {
    "Content-Type": data.type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
  } }) : new Response(null, { status: 404 });
}

