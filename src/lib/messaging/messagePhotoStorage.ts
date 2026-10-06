import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

let client: SupabaseClient | undefined;

// Same server-only credential pattern as marketStorage.ts. Never return this
// client/key to a browser or replace its Authorization header with a user token.
export function getMessagePhotoService(): SupabaseClient {
  if (client) return client;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) throw new Error("MESSAGE_PHOTO_SERVER_UNAVAILABLE");
  client = createClient(getSupabasePublicEnv().url, key, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  return client;
}

