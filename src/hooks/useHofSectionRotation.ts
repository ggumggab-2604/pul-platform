"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

const ROTATE_INTERVAL_MS = 8000;
const FADE_MS = 320;
const INTERACTION_PAUSE_MS = 10000;

type UseHofSectionRotationOptions = {
  /** Stable item count — do not pass a freshly created array */
  count: number;
  /** Stagger before first auto tick (0 / 2500 / 4500) */
  startDelayMs: number;
  /** Parent gates: in view + tab visible + !reducedMotion */
  autoPlay: boolean;
  /** Skip opacity fade (prefers-reduced-motion) */
  instant?: boolean;
};

export type HofSectionRotation = {
  index: number;
  fading: boolean;
  canNavigate: boolean;
  next: () => void;
  prev: () => void;
  goTo: (i: number) => void;
  markInteraction: () => void;
};

/**
 * Per-section index rotation for mobile Hall of Fame.
 * Timers live only in effects; cleaned on unmount; one interval per instance.
 */
export function useHofSectionRotation({
  count,
  startDelayMs,
  autoPlay,
  instant = false,
}: UseHofSectionRotationOptions): HofSectionRotation {
  const [index, setIndex] = useState(0);
  const [fading, setFading] = useState(false);

  const indexRef = useRef(0);
  const countRef = useRef(count);
  const pauseUntilRef = useRef(0);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const instantRef = useRef(instant);

  countRef.current = count;
  instantRef.current = instant;

  // Clamp when data length shrinks — only when count actually changes
  useEffect(() => {
    if (count <= 0) {
      indexRef.current = 0;
      setIndex(0);
      return;
    }
    if (indexRef.current >= count) {
      indexRef.current = 0;
      setIndex(0);
    }
  }, [count]);

  const clearFadeTimer = useCallback(() => {
    if (fadeTimerRef.current !== null) {
      clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
  }, []);

  const applyIndex = useCallback(
    (next: number) => {
      const n = countRef.current;
      if (n <= 0) return;
      const normalized = ((next % n) + n) % n;
      if (normalized === indexRef.current) return;

      clearFadeTimer();

      if (instantRef.current) {
        indexRef.current = normalized;
        setIndex(normalized);
        setFading(false);
        return;
      }

      setFading(true);
      fadeTimerRef.current = setTimeout(() => {
        indexRef.current = normalized;
        setIndex(normalized);
        setFading(false);
        fadeTimerRef.current = null;
      }, FADE_MS);
    },
    [clearFadeTimer],
  );

  const markInteraction = useCallback(() => {
    pauseUntilRef.current = Date.now() + INTERACTION_PAUSE_MS;
  }, []);

  const goTo = useCallback(
    (next: number, fromUser: boolean) => {
      if (countRef.current <= 1) return;
      if (fromUser) markInteraction();
      applyIndex(next);
    },
    [applyIndex, markInteraction],
  );

  const next = useCallback(() => goTo(indexRef.current + 1, true), [goTo]);
  const prev = useCallback(() => goTo(indexRef.current - 1, true), [goTo]);
  const goToIndex = useCallback((i: number) => goTo(i, true), [goTo]);

  // Auto-rotate: one interval; re-init only when gates/count/delay change
  useEffect(() => {
    if (!autoPlay || count <= 1) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;
    const startId = setTimeout(() => {
      intervalId = setInterval(() => {
        if (Date.now() < pauseUntilRef.current) return;
        applyIndex(indexRef.current + 1);
      }, ROTATE_INTERVAL_MS);
    }, startDelayMs);

    return () => {
      clearTimeout(startId);
      if (intervalId !== null) clearInterval(intervalId);
    };
  }, [autoPlay, count, startDelayMs, applyIndex]);

  useEffect(() => () => clearFadeTimer(), [clearFadeTimer]);

  return {
    index,
    fading,
    canNavigate: count > 1,
    next,
    prev,
    goTo: goToIndex,
    markInteraction,
  };
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return reduced;
}

export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const sync = () => setVisible(document.visibilityState === "visible");
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  return visible;
}

export function useElementInView<T extends Element>(
  ref: RefObject<T | null>,
  rootMargin = "0px",
): boolean {
  const [inView, setInView] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    const io = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting);
      },
      { root: null, rootMargin, threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin]);

  return inView;
}
