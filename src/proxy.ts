import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { COURSE_CUTOVER_MESSAGE, courseCutoverHeaders, courseCutoverHtml, isCourseCutoverPath, isCourseCutoverImage } from "@/lib/courses/courseCutover";

export async function proxy(request: NextRequest) {
  const image = request.nextUrl.pathname === "/_next/image";
  if (isCourseCutoverPath(request.nextUrl.pathname) ||
      (image && isCourseCutoverImage(request.nextUrl.searchParams.get("url")))) {
    const document = !image && (request.method === "GET" || request.method === "HEAD") &&
      request.headers.get("accept")?.includes("text/html");
    return new NextResponse(document ? courseCutoverHtml : JSON.stringify({ ok: false, code: "course_maintenance", message: COURSE_CUTOVER_MESSAGE }), {
      status: 503,
      headers: {
        ...courseCutoverHeaders,
        "Content-Type": document ? "text/html; charset=utf-8" : "application/json; charset=utf-8",
        // Next 16.3 forwards cross-page actions and otherwise replaces a non-Flight
        // error with HTTP 200 {}. Its unavailable-action marker preserves rejection.
        ...(request.method === "POST" && request.headers.has("next-action")
          ? { "x-nextjs-action-not-found": "1" } : {}),
      },
    });
  }
  // Image optimizer requests previously skipped session refresh.
  if (image) return NextResponse.next();
  const response = await updateSession(request);
  if (request.method === "POST") {
    for (const [key, value] of Object.entries(courseCutoverHeaders)) response.headers.set(key, value);
  }
  return response;
}
export const config = {
  matcher: [
    "/courses/:path*",
    "/_next/image",
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

