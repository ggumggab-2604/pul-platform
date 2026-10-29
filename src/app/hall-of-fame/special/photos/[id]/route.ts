import { createClient } from "@/lib/supabase/server";
import { resourceStorage } from "@/lib/courses/courseResourceStorage";
const headers = {"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox"};
export async function GET(_request: Request, {params}: {params: Promise<{id: string}>}) {
 const {id} = await params;
 if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, {status: 404, headers});
 try {
  const client = await createClient(), {data, error} = await client.rpc("get_hall_special_photo_file", {p_id: id});
  if (error || !data || data.bucket !== "hall-of-fame-evidence" || !["image/jpeg", "image/png", "image/webp"].includes(data.mime)) return new Response(null, {status: 404, headers});
  const result = await resourceStorage().storage.from(data.bucket).download(data.path);
  if (result.error || !result.data) return new Response(null, {status: 404, headers});
  return new Response(await result.data.arrayBuffer(), {headers: {...headers, "Content-Type": data.mime}});
 } catch {return new Response(null, {status: 404, headers});}
}
