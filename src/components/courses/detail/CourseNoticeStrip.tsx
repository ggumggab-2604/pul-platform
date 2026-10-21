"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
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

export function CourseNoticeStrip({ courseKey, notices }: { courseKey: string; notices: CourseStory[] }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState<boolean | null>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const reduced = useSyncExternalStore(subscribeMotion, reducedSnapshot, serverSnapshot);
  const visible = useSyncExternalStore(subscribeVisibility, visibleSnapshot, serverSnapshot);
  const current = notices[index % notices.length];
  const multiple = notices.length > 1;
  const wantsPlay = playing ?? !reduced;
  const title = current ? storyTitle(current) : "";
  // Long notices receive more reading time; height follows the complete title.
  const delay = Math.max(6000, Math.ceil(title.length / 20) * 1000);
  useEffect(() => {
    if (!multiple || !wantsPlay || hovered || focused || !visible) return;
    const timer = window.setTimeout(() => setIndex(value => (value + 1) % notices.length), delay);
    return () => window.clearTimeout(timer);
  }, [multiple, wantsPlay, hovered, focused, visible, notices.length, index, delay]);
  if (!current) return null;
  return <div className={styles.notice} aria-label="구장 공지"
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)} onBlurCapture={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
    }}>
    <span>공지</span>
    <div className={styles.noticeContent}>
      <Link key={current.post_key} prefetch={false} className={styles.noticeSlide}
        href={`/courses/${courseKey}/stories/${current.post_key}`}>{title}</Link>
    </div>
    {multiple ? <div className={styles.noticeControls}>
      <span className={styles.noticeCount}>{index % notices.length + 1}/{notices.length}</span>
      <button type="button" aria-label={`공지 자동 전환 ${wantsPlay ? "일시정지" : "재생"}`}
        onClick={() => setPlaying(!wantsPlay)}>{wantsPlay ? "정지" : "재생"}</button>
      <button type="button" aria-label="다음 공지" onClick={() => setIndex(value => (value + 1) % notices.length)}>다음</button>
    </div> : null}
  </div>;
}
