"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";

export type AuthSessionStatus = "loading" | "signedOut" | "signedIn";

export function useAuthSessionStatus() {
  const [status, setStatus] = useState<AuthSessionStatus>("loading");

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (active) setStatus(data.session ? "signedIn" : "signedOut");
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setStatus(session ? "signedIn" : "signedOut");
    });

    const handleServerSignOut = () => {
      if (active) setStatus("signedOut");
    };
    window.addEventListener("pul-auth-signed-out", handleServerSignOut);

    return () => {
      active = false;
      subscription.unsubscribe();
      window.removeEventListener("pul-auth-signed-out", handleServerSignOut);
    };
  }, []);

  return status;
}
