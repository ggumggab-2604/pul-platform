"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { getCourseNotificationAction, setCourseNotificationAction, listCourseNotificationsAction } from "@/app/courses/notificationActions";
import type { CourseNotificationState, CourseNotificationPage, CourseNotificationItem } from "@/lib/courses/courseNotifications";

const buttonClass = "min-h-11 rounded-lg border border-pul-border px-4 py-2 font-bold text-pul-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pul-point disabled:cursor-wait disabled:opacity-60";
const failure = "운영알림 설정을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.";

function Session({ path, children }: { path: string; children: (viewerId: string) => ReactNode }) {
  const [viewer, setViewer] = useState<string | null>();
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState(false);
  const retry = useRef<() => void>(() => {});
  useEffect(() => {
    const { auth } = createClient();
    let live = true, revision = 0, known: string | null | undefined;
    const verify = async () => {
      const ticket = ++revision; setChecking(true); setError(false);
      try {
        const { data, error: authError } = await auth.getUser();
        if (!live || revision !== ticket) return;
        if (authError) {
          // Missing session is normal on public course details.
          if (authError.name !== "AuthSessionMissingError") throw authError;
          known = null;
        } else known = data.user?.id ?? null;
        setViewer(known); setChecking(false);
      } catch { if (live && revision === ticket) { setError(true); setChecking(true); } }
    };
    const signOut = () => { revision++; known = null; setViewer(null); setChecking(false); setError(false); };
    const { data } = auth.onAuthStateChange((_event, session) => {
      const next = session?.user.id ?? null;
      if (next === known) return; // Same-account refresh preserves an in-flight control.
      revision++; known = undefined; setViewer(undefined); setChecking(true);
      void Promise.resolve().then(() => { if (live) void verify(); });
    });
    const visibility = () => { if (document.visibilityState === "hidden") { revision++; setChecking(true); } else void verify(); };
    retry.current = () => { void verify(); };
    window.addEventListener("focus", retry.current);
    window.addEventListener("pageshow", retry.current);
    window.addEventListener("pul-auth-signed-out", signOut);
    document.addEventListener("visibilitychange", visibility);
    void verify();
    return () => {
      live = false; revision++; data.subscription.unsubscribe();
      window.removeEventListener("focus", retry.current); window.removeEventListener("pageshow", retry.current);
      window.removeEventListener("pul-auth-signed-out", signOut); document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  return <>
    {checking ? <div role={error ? "alert" : "status"}><p>{error ? "로그인 상태를 확인하지 못했습니다." : "로그인 상태 확인 중…"}</p>{error ? <button type="button" className={buttonClass} onClick={() => retry.current()}>다시 확인</button> : null}</div> : null}
    {!checking && viewer === null ? <Link prefetch={false} className={buttonClass + " inline-flex items-center"} href={`/login?next=${encodeURIComponent(path)}`}>로그인하고 운영알림 받기</Link> : null}
    {viewer ? <div key={viewer} hidden={checking} inert={checking}>{children(viewer)}</div> : null}
  </>;
}

function Control({ viewerId, courseKey, initial, onChange }: { viewerId: string; courseKey: string; initial?: CourseNotificationState; onChange?: () => void }) {
  const [state, setState] = useState(initial);
  const [pending, setPending] = useState(!initial);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const live = useRef(false), busy = useRef(false);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => {
    if (initial) return;
    let active = true;
    void getCourseNotificationAction(viewerId, courseKey).then(result => {
      if (!active) return;
      if (result.ok) setState(result.data); else setError(result.error);
    }).catch(() => { if (active) setError(failure); }).finally(() => { if (active) setPending(false); });
    return () => { active = false; };
  }, [viewerId, courseKey, initial, reload]);
  const change = async () => {
    if (!state || busy.current) return;
    busy.current = true; setPending(true); setError(null);
    try {
      const result = await setCourseNotificationAction(viewerId, courseKey, !state.subscribed);
      if (!live.current) return;
      if (result.ok) { setState(result.data); onChange?.(); } else setError(result.error);
    } catch { if (live.current) setError(failure); }
    finally { busy.current = false; if (live.current) setPending(false); }
  };
  return <div className="space-y-2" aria-busy={pending}>
    <p role="status" className="text-sm text-pul-muted">{pending ? "운영알림 설정 확인 중…" : state?.subscribed ? "운영알림 받는 중" : state ? "알림 안 받는 중" : "설정 확인 필요"}</p>
    {state ? <button type="button" className={buttonClass} disabled={pending || (!state.available && !state.subscribed)} onClick={() => void change()}>{state.subscribed ? "알림 해제" : "운영알림 받기"}</button> : null}
    {error ? <p role="alert" className="break-words text-sm text-red-700">{error}</p> : null}
    {!state && error ? <button type="button" className={buttonClass} disabled={pending} onClick={() => { setPending(true); setError(null); setReload(n => n + 1); }}>다시 확인</button> : null}
  </div>;
}

export function CourseNotificationSubscription({ courseKey }: { courseKey: string }) {
  return <section aria-label="장소 운영알림" className="space-y-3 rounded-xl border border-pul-border bg-white p-4 sm:p-5">
    <h2 className="text-lg font-bold text-pul-deep">운영알림</h2>
    <p className="text-sm leading-6 text-pul-muted">휴장·운영시간 변경 등 이용에 필요한 안내를 PUL 쪽지로 받습니다. 할인·광고 수신동의가 아닙니다.</p>
    <Session path={`/courses/${encodeURIComponent(courseKey)}`}>{viewerId => <Control key={`${viewerId}:${courseKey}`} viewerId={viewerId} courseKey={courseKey} />}</Session>
    <Link prefetch={false} href="/my/operational-notices" className="inline-flex min-h-11 items-center text-sm font-bold text-pul-point">내 운영알림 관리</Link>
  </section>;
}

function OwnList({ viewerId }: { viewerId: string }) {
  const [items, setItems] = useState<CourseNotificationItem[]>([]);
  const [page, setPage] = useState<CourseNotificationPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(true);
  const [retry, setRetry] = useState(0);
  const live = useRef(false), busy = useRef(false);
  useEffect(() => {
    let active = true;
    live.current = true;
    void listCourseNotificationsAction(viewerId).then(result => {
      if (!active) return;
      if (result.ok) { setPage(result.data); setItems(result.data.items); } else setError(result.error);
    }).catch(() => { if (active) setError(failure); }).finally(() => { if (active) setPending(false); });
    return () => { active = false; live.current = false; };
  }, [viewerId, retry]);
  const more = async () => {
    if (!page?.nextCursor || busy.current) return;
    busy.current = true; setPending(true); setError(null);
    try {
      const result = await listCourseNotificationsAction(viewerId, page.nextCursor);
      if (!live.current) return;
      if (result.ok) { setPage(result.data); setItems(old => [...old, ...result.data.items.filter(x => !old.some(y => y.courseKey === x.courseKey))]); } else setError(result.error);
    } catch { if (live.current) setError(failure); }
    finally { busy.current = false; if (live.current) setPending(false); }
  };
  return <div className="space-y-4" aria-busy={pending}>
    {pending ? <p role="status">운영알림 목록 확인 중…</p> : null}
    {!pending && page && items.length === 0 ? <p>신청한 운영알림이 없습니다.</p> : null}
    {items.map(item => <article key={item.courseKey} className="space-y-3 rounded-xl border border-pul-border bg-white p-4">
      {item.available ? <Link href={`/courses/${encodeURIComponent(item.courseKey)}`} className="inline-flex min-h-11 items-center break-words font-bold text-pul-deep">{item.name}</Link> : <p>현재 공개되지 않은 장소</p>}
      <Control viewerId={viewerId} courseKey={item.courseKey} initial={item} onChange={() => setItems(old => old.filter(x => x.courseKey !== item.courseKey))} />
    </article>)}
    {error ? <p role="alert" className="text-red-700">{error}</p> : null}
    {!page && error ? <button type="button" className={buttonClass} disabled={pending} onClick={() => { setError(null); setPending(true); setRetry(n => n + 1); }}>다시 확인</button> : null}
    {page?.nextCursor ? <button type="button" className={buttonClass} disabled={pending} onClick={() => void more()}>더 보기</button> : null}
  </div>;
}
export function MyCourseNotifications() {
  return <Session path="/my/operational-notices">{viewerId => <OwnList viewerId={viewerId} />}</Session>;
}
