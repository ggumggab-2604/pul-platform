import { resourceStorage } from "@/lib/courses/courseResourceStorage";
import { readUniversity, universityKey } from "@/lib/lessons/universityWorkspace";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!universityKey(key)) return new Response(null, { status: 404 });
  try {
    const client = await createClient();
    const published = await readUniversity(client, key);
    const photo = published ? published.photo_path
      : (await client.rpc("get_university_workspace", { p_key: key, p_section: "profile" })).data?.photo_path;
    if (typeof photo !== "string") return new Response(null, { status: 404 });
    const { data } = await resourceStorage().storage.from("university-representatives").download(photo);
    if (!data) return new Response(null, { status: 404 });
    return new Response(data, { headers: {
      "Content-Type": data.type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch {
    return new Response(null, { status: 503 });
  }
}
