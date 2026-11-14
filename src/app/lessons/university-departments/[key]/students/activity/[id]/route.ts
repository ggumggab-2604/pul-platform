import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { privateUniversityImage } from "@/lib/lessons/universityMultipart";
import { universityKey, uuid } from "@/lib/lessons/universityWorkspace";

export async function GET(_request: Request, { params }: { params: Promise<{ key: string; id: string }> }) {
  const { key, id } = await params;
  const auth = await getAuthenticatedSupabaseContext();
  if (!auth || !universityKey(key) || !uuid(id)) return new Response(null, { status: 404 });
  const result = await auth.supabase.rpc("get_university_activity_photo", { p_key: key, p_id: id });
  return privateUniversityImage("university-activities", result.error ? null : result.data);
}

