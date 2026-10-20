"use client";
import { useEffect, useState } from "react";
import { HOUR } from "@/lib/weather/rounding";
// A single expiry alarm, not a polling loop or a provider request. Re-entry gets a fresh server reference time.
export function useForecastExpiry(initialNow: number) {
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    const deadline = (Math.floor(initialNow / HOUR) + 1) * HOUR;
    const check = () => { if (Date.now() >= deadline) setExpired(true); };
    check();
    const alarm = window.setTimeout(check, Math.max(0, deadline - Date.now()) + 25);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => { window.clearTimeout(alarm); document.removeEventListener("visibilitychange",check); window.removeEventListener("focus",check); };
  }, [initialNow]);
  return expired;
}
