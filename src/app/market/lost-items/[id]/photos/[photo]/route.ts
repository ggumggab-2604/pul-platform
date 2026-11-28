import { contentRpc, uuid } from "@/lib/courses/courseContent";
import { resourceStorage } from "@/lib/courses/courseResourceStorage";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; photo: string }> }) {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox" };
  const missing = () => new Response(null, { status: 404, headers });
  try {
    const { id, photo } = await params;
    if (!uuid.test(id) || !uuid.test(photo)) return missing();
    const rpc = new URL(request.url).searchParams.get("preview") === "1" ? "course_lost_photo_preview" : "market_lost_photo_read";
    const mime = await contentRpc<string | null>(await createClient(), rpc, { p_id: id, p_photo: photo });
    if (!mime) return missing();
    const file = await resourceStorage().storage.from("course-story-images").download(photo);
    if (file.error || !file.data) return missing();
    return new Response(file.data, { headers: { ...headers, "Content-Type": mime } });
  } catch {
    return missing();
  }
}
