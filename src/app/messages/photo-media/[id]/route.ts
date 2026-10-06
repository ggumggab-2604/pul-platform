import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { messagePhotoUuid } from "@/lib/messaging/messagePhotoRules";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox" };
  const missing = () => new Response(null, { status: 404, headers });
  const { id } = await params;
  if (!messagePhotoUuid.test(id)) return missing();
  try {
    const context = await getAuthenticatedSupabaseContext();
    if (!context) return missing();
    // Authenticated Storage policy checks the actual message participants on every read.
    const value = await context.supabase.storage.from("private-message-photos").download(id);
    if (value.error || !value.data || !["image/jpeg", "image/png"].includes(value.data.type)) return missing();
    return new Response(value.data, { headers: { ...headers, "Content-Type": value.data.type } });
  } catch { return missing(); }
}

