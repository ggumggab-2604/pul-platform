"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FocusEvent, type PointerEvent } from "react";
import { storyTitle, type CourseStory } from "@/lib/courses/courseSteward";
import styles from "./CourseFieldDetail.module.css";

function subscribeMotion(notify: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}
const reducedSnapshot = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
function subscribeVisibility(notify: () => void) {
  document.addEventListener("visibilitychange", notify);
  return () => document.removeEventListener("visibilitychange", notify);
}
const visibleSnapshot = () => document.visibilityState === "visible";
const serverSnapshot = () => true;

// Both presentations rotate the existing read result independently; no fetching or global state.
export function useCourseNoticeRotation(notices: CourseStory[]) {
  const [slide, setSlide] = useState({ index: 0, previous: null as number | null });
  const [playing, setPlaying] = useState<boolean | null>(null);
  const [blocked, setBlocked] = useState(false);
  const blockers = useRef({ hover: false, focus: false, pointer: false });
  const timer = useRef<number | undefined>(undefined);
  // A motion preference change also discards any interrupted outgoing slide.
  const subscribeMotionAndFinish = useCallback((notify: () => void) => subscribeMotion(() => {
    setSlide(old => old.previous === null ? old : { ...old, previous: null });
    notify();
  }), []);
  const reduced = useSyncExternalStore(subscribeMotionAndFinish, reducedSnapshot, serverSnapshot);
  const visible = useSyncExternalStore(subscribeVisibility, visibleSnapshot, serverSnapshot);
  const count = Math.max(1, notices.length), index = slide.index % count;
  const current = notices[index], multiple = notices.length > 1, wantsPlay = playing ?? !reduced;
  const delay = Math.max(6000, Math.ceil((current ? storyTitle(current).length : 0) / 20) * 1000);
  const next = useCallback(() => setSlide(old => ({ index: (old.index + 1) % count, previous: reduced ? null : old.index % count })), [count, reduced]);
  const block = useCallback((kind: "hover" | "focus" | "pointer", value: boolean) => {
    blockers.current[kind] = value;
    const paused = Object.values(blockers.current).some(Boolean);
    // Stop synchronously at pointer-down, before a queued tick can change a tapped destination.
    if (paused) { window.clearTimeout(timer.current); timer.current = undefined; }
    setBlocked(paused);
  }, []);
  useEffect(() => {
    const release = () => block("pointer", false);
    document.addEventListener("pointerup", release, true);
    document.addEventListener("pointercancel", release, true);
    window.addEventListener("blur", release);
    return () => { document.removeEventListener("pointerup", release, true); document.removeEventListener("pointercancel", release, true); window.removeEventListener("blur", release); };
  }, [block]);
  useEffect(() => {
    if (!multiple || !wantsPlay || blocked || !visible) return;
    const id = window.setTimeout(() => {
      timer.current = undefined;
      if (!Object.values(blockers.current).some(Boolean) && document.visibilityState === "visible") next();
    }, delay);
    timer.current = id;
    return () => window.clearTimeout(id);
  }, [multiple, wantsPlay, blocked, visible, index, delay, next]);
  return {
    index, previous: slide.previous, multiple, wantsPlay, count: notices.length, next,
    toggle: () => setPlaying(!wantsPlay),
    finish: () => setSlide(old => ({ ...old, previous: null })),
    slideState: (value: number) => value === index ? "current" : value === slide.previous ? "leaving" : "hidden",
    interactions: {
      onPointerEnter: (event: PointerEvent<HTMLElement>) => { if (event.pointerType === "mouse") block("hover", true); },
      onPointerLeave: (event: PointerEvent<HTMLElement>) => { if (event.pointerType === "mouse") block("hover", false); },
      onPointerDownCapture: () => block("pointer", true),
      onFocusCapture: () => block("focus", true),
      onBlurCapture: (event: FocusEvent<HTMLElement>) => { if (!event.currentTarget.contains(event.relatedTarget)) block("focus", false); },
    },
  };
}

export function CourseNoticeControls({ rotation, labelPrefix = "" }: {
  rotation: ReturnType<typeof useCourseNoticeRotation>;
  labelPrefix?: string;
}) {
  if (!rotation.multiple) return null;
  return <div className={styles.noticeControls}>
    <span className={styles.noticeCount} style={{ minWidth: `${String(rotation.count).length * 2 + 1}ch`, textAlign: "center" }}>{rotation.index + 1}/{rotation.count}</span>
    <button type="button" aria-label={`${labelPrefix}공지 자동 전환 ${rotation.wantsPlay ? "일시정지" : "재생"}`}
      onClick={rotation.toggle}>{rotation.wantsPlay ? "정지" : "재생"}</button>
    <button type="button" aria-label={`${labelPrefix}다음 공지`} onClick={rotation.next}>다음</button>
  </div>;
}

export function CourseNoticeStrip({ courseKey, notices }: { courseKey: string; notices: CourseStory[] }) {
  const rotation = useCourseNoticeRotation(notices);
  if (!notices.length) return null;
  return <div className={styles.notice} aria-label="구장 공지" {...rotation.interactions}>
    <span>공지</span>
    <div className={styles.noticeContent} data-moving={rotation.previous !== null}>
      {notices.map((notice, index) => <span key={notice.post_key} className={styles.noticeSlide}
        data-state={rotation.slideState(index)} aria-hidden={index !== rotation.index} inert={index !== rotation.index}
        onAnimationEnd={event => { if (event.target === event.currentTarget && index === rotation.previous) rotation.finish(); }}>
        <Link prefetch={false} title={storyTitle(notice)} href={`/courses/${courseKey}/stories/${notice.post_key}`}>{storyTitle(notice)}</Link>
      </span>)}
    </div>
    <CourseNoticeControls rotation={rotation} />
  </div>;
}
