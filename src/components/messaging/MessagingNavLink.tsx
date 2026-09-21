"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getMessagingBadgeAction } from "@/app/messages/actions";
import { badgeText, messagingUpdatedEvent } from "@/lib/messaging/messagingUi";

export function MessagingNavLink({ variant }: { variant: "desktop" | "mobile" }) {
  const pathname = usePathname();
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const visible = () => media.matches === (variant === "desktop");
    const { auth } = createClient();
    let live = true, revision = 0;
    const clear = () => { revision++; setCount(null); };
    const refresh = async () => {
      const ticket = ++revision;
      setCount(null);
      if (!visible() || document.visibilityState === "hidden") return;
      try {
        const identity = await auth.getUser();
        if (!live || ticket !== revision || identity.error || !identity.data.user) return;
        const result = await getMessagingBadgeAction();
        if (live && ticket === revision && result.ok && result.data.viewerId === identity.data.user.id) setCount(result.data.count);
      } catch { /* The entry remains available without an unverified count. */ }
    };
    const { data } = auth.onAuthStateChange(() => { clear(); void refresh(); });
    const visibility = () => { if (document.visibilityState === "hidden") clear(); else void refresh(); };
    window.addEventListener(messagingUpdatedEvent, refresh); window.addEventListener("focus", refresh);
    window.addEventListener("pul-auth-signed-out", clear); document.addEventListener("visibilitychange", visibility);
    media.addEventListener("change", refresh); void refresh();
    return () => {
      live = false; revision++; data.subscription.unsubscribe(); media.removeEventListener("change", refresh);
      window.removeEventListener(messagingUpdatedEvent, refresh); window.removeEventListener("focus", refresh);
      window.removeEventListener("pul-auth-signed-out", clear); document.removeEventListener("visibilitychange", visibility);
    };
  }, [pathname, variant]);
  return <Link href="/messages" prefetch={false} className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 font-bold text-pul-deep" aria-label={count ? `쪽지, 안 읽은 쪽지 ${count}개` : "쪽지"}>
    쪽지{count !== null && count > 0 ? <span className="rounded-full bg-pul-point px-1.5 py-0.5 text-xs text-white">{badgeText(count)}</span> : null}
  </Link>;
}
