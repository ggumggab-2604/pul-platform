import { createClient } from "@/lib/supabase/server";

export type AuthenticatedSupabaseContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
};

export async function getAuthenticatedSupabaseContext(): Promise<
  AuthenticatedSupabaseContext | null
> {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase.auth.getClaims();
    const userId = data?.claims?.sub;

    if (error || typeof userId !== "string" || userId.length === 0) {
      return null;
    }

    return { supabase, userId };
  } catch {
    return null;
  }
}
