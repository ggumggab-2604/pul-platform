// Temporary release only. Remove by restoring the approved final release.
export const COURSE_CUTOVER_MESSAGE = "구장 기능을 업데이트하고 있습니다. 잠시 후 다시 이용해 주세요.";
export function stopCourseAction(): void {
  // Throw outside action result handlers: Next returns a non-success action response.
  throw new Error(COURSE_CUTOVER_MESSAGE);
}
export function isCourseCutoverPath(pathname: string): boolean {
  let path = pathname;
  try { path = decodeURIComponent(path); } catch { /* Keep the original invalid path. */ }
  return path === "/courses" || path.startsWith("/courses/") ||
    path === "/my/operational-notices" || path.startsWith("/my/operational-notices/");
}
export function isCourseCutoverImage(raw: string | null): boolean {
  if (!raw) return false;
  try {
    const url = new URL(raw, "http://local.invalid");
    const path = decodeURIComponent(url.pathname);
    return isCourseCutoverPath(path) ||
      /^\/storage\/v1\/(?:object|render\/image)\/(?:public|sign|authenticated)\/course-(?:media|resources|operator-images|story-images)(?:\/|$)/.test(path);
  } catch { return false; }
}
export const courseCutoverHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
// The existing PUL palette, spacing and card treatment, without an application/DB render.
export const courseCutoverHtml = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>구장 이용 안내 · PUL</title><style>
*{box-sizing:border-box}body{margin:0;background:#f4f6f5;color:#111827;font-family:Arial,"Malgun Gothic",sans-serif;font-size:18px;line-height:1.6}header{background:#fff;border-bottom:1px solid #e5e7eb;padding:18px 24px}header a{font-size:24px;font-weight:800;color:#064e3b;text-decoration:none}main{max-width:720px;margin:56px auto;padding:0 20px}section{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:32px}h1{font-size:26px;line-height:1.4;color:#064e3b;margin:0 0 16px}p{margin:0 0 24px}nav{display:flex;flex-wrap:wrap;gap:12px}nav a{min-height:44px;padding:10px 16px;border:1px solid #e5e7eb;border-radius:8px;text-decoration:none;color:#064e3b;font-weight:700;font-size:16px}nav a:first-child{background:#0f766e;color:white}@media(max-width:480px){main{margin:28px auto;padding:0 16px}section{padding:24px}h1{font-size:24px}}
</style></head><body><header><a href="/">PUL</a></header><main><section><h1>구장 이용 안내</h1><p>${COURSE_CUTOVER_MESSAGE}</p><nav aria-label="다른 메뉴"><a href="/">홈으로</a><a href="/messages">내 쪽지함</a></nav></section></main></body></html>`;

