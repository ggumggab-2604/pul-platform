import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseCookieOptions } from "@/lib/supabase/cookieOptions";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const sessionHeaders = new Headers();
  const { url, publishableKey } = getSupabasePublicEnv();

  const supabase = createServerClient(url, publishableKey, {
    cookieOptions: getSupabaseCookieOptions(),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
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

        // Keep SSR-supplied headers when a later callback rebuilds the response.
        Object.entries(headers).forEach(([name, value]) => {
          sessionHeaders.set(name, value);
        });
        sessionHeaders.forEach((value, name) => {
          refreshedResponse.headers.set(name, value);
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
