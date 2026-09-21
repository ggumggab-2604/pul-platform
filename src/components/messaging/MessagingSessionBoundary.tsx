"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const MessagingViewActive = createContext(true);
export function useMessagingViewActive() { return useContext(MessagingViewActive); }

/** Rechecking hides the same subject's subtree; an identity change destroys it. */
export function MessagingSessionBoundary({ viewerId, children }: { viewerId: string; children: ReactNode }) {
  const router = useRouter();
  const [verified, setVerified] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    const { auth } = createClient();
    let live = true, revision = 0;
    const clear = () => { revision++; setVerified(null); setChecking(true); };
    const conceal = () => { revision++; setChecking(true); };
    const verify = async () => {
      if (document.visibilityState === "hidden") { conceal(); return; }
      const ticket = ++revision;
      setChecking(true);
      try {
        const { data, error } = await auth.getUser();
        if (!live || ticket !== revision) return;
        if (error) return; // Remain concealed until identity can be verified.
        if (data.user?.id === viewerId) { setVerified(viewerId); setChecking(false); }
        else { clear(); router.refresh(); }
      } catch { /* A transport failure conceals the draft; it is not a subject change. */ }
    };
    const { data } = auth.onAuthStateChange((_event, session) => {
      if (session?.user.id === viewerId) void verify();
      else { clear(); router.refresh(); }
    });
    const visibility = () => { if (document.visibilityState === "hidden") conceal(); else void verify(); };
    window.addEventListener("focus", verify);
    window.addEventListener("pageshow", verify);
    window.addEventListener("pul-auth-signed-out", clear);
    document.addEventListener("visibilitychange", visibility);
    void verify();
    return () => {
      live = false; revision++; data.subscription.unsubscribe();
      window.removeEventListener("focus", verify); window.removeEventListener("pageshow", verify);
      window.removeEventListener("pul-auth-signed-out", clear); document.removeEventListener("visibilitychange", visibility);
    };
  }, [viewerId, router]);
  const matches = verified === viewerId;
  return <MessagingViewActive.Provider value={matches && !checking}>
    {!matches || checking ? <div role="status" className="rounded-xl border border-pul-border bg-white p-5">
      <p>로그인 상태를 확인하고 있습니다.</p>
      <a href="" className="mt-3 inline-flex min-h-11 items-center font-bold text-pul-point">다시 확인</a>
    </div> : null}
    {matches ? <div key={viewerId} hidden={checking} inert={checking}>{children}</div> : null}
  </MessagingViewActive.Provider>;
}
