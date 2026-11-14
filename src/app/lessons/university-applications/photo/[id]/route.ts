import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { privateUniversityImage } from "@/lib/lessons/universityMultipart";
import { uuid } from "@/lib/lessons/universityWorkspace";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getAuthenticatedSupabaseContext();
  if (!uuid(id) || !auth) return new Response(null, { status: 404 });
  const result = await auth.supabase.rpc("get_university_applications", { p_operator: new URL(request.url).searchParams.get("review") === "1", p_id: id });
  if (result.error) return new Response(null, { status: 404 });
  return privateUniversityImage("university-representatives", result.data?.[0]?.photo_path);
}

