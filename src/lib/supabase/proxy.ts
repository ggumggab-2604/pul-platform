import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabasePublicEnv } from "@/lib/supabase/env";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, publishableKey } = getSupabasePublicEnv();

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        const refreshedResponse = NextResponse.next({ request });

        response.cookies.getAll().forEach((cookie) => {
          refreshedResponse.cookies.set(cookie);
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          refreshedResponse.cookies.set(name, value, options);
        });

        response = refreshedResponse;
      },
    },
  });

  try {
    await supabase.auth.getClaims();
  } catch {
    // Missing or invalid authentication is treated as a public guest session.
  }

  return response;
}
