"use client";
import { useEffect, useState } from "react";
import { getMarketContentAction } from "@/app/market/contentActions";
import { MARKET_POLICY_VERSION } from "@/lib/market/market";
import { contentUnavailable, stalePolicyMessage, type ContentRevision } from "@/lib/market/marketContent";

export function useMarketPolicy(savedVersion?: string | null, savedConsent = false) {
  const [policy, setPolicy] = useState<ContentRevision | null>(null);
  const [version, setVersion] = useState(MARKET_POLICY_VERSION);
  const [ready, setReady] = useState(false), [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const load = async (refresh: boolean) => {
    setReady(false); setError("");
    try {
      const result = await getMarketContentAction();
      if (!result.ok) throw new Error(result.message);
      const next = result.snapshot.current.policy ?? null;
      const nextVersion = next?.consentVersion ?? MARKET_POLICY_VERSION;
      setPolicy(next); setVersion(nextVersion);
      setConfirmed(!refresh && savedConsent && savedVersion === nextVersion);
      setReady(true);
    } catch { setError(contentUnavailable); setConfirmed(false); }
  };
  useEffect(() => {
    let active = true;
    getMarketContentAction().then(result => {
      if (!active) return;
      if (!result.ok) { setError(result.message); return; }
      const next = result.snapshot.current.policy ?? null, nextVersion = next?.consentVersion ?? MARKET_POLICY_VERSION;
      setPolicy(next); setVersion(nextVersion); setConfirmed(savedConsent && savedVersion === nextVersion); setReady(true);
    }).catch(() => { if (active) setError(contentUnavailable); });
    return () => { active = false; };
  }, [savedVersion, savedConsent]);
  return { policy, version, ready, error, confirmed, setConfirmed, refresh: () => load(true), stalePolicyMessage };
}
