"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { courseInterestStatesAction } from "@/app/my/interestActions";
import { InterestButton } from "@/components/interests/InterestButton";
import { createCourseInterestBatch, type CourseInterestSnapshot } from "@/lib/courses/courseInterestBatch";

type BatchContext = CourseInterestSnapshot & { viewer: string | null | undefined; saved: (key: string, value: boolean) => void };
const Context = createContext<BatchContext | null>(null);
const pending: CourseInterestSnapshot = { status: "loading", values: {} };

export function CourseInterestBatchProvider({ courseKeys, children }: { courseKeys: string[]; children: ReactNode }) {
  const [viewer, setViewer] = useState<{ id: string | null | undefined; epoch: number }>({ id: undefined, epoch: 0 });
  useEffect(() => {
    const client = createClient();
    let active = true;
    let observed = false;
    const update = (id: string | null) => {
      if (active) setViewer(previous => previous.id === id ? previous : { id, epoch: previous.epoch + 1 });
    };
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      observed = true; update(session?.user.id ?? null);
    });
    void client.auth.getSession().then(({ data }) => { if (!observed) update(data.session?.user.id ?? null); }).catch(() => { if (!observed) update(null); });
    const signOut = () => { observed = true; update(null); };
    window.addEventListener("pul-auth-signed-out", signOut);
    return () => { active = false; subscription.unsubscribe(); window.removeEventListener("pul-auth-signed-out", signOut); };
  }, []);
  // Stable across list/map toggles; account/page changes destroy previous state.
  const signature = JSON.stringify(courseKeys);
  return <Scope key={JSON.stringify([viewer.id, viewer.epoch, signature])} viewer={viewer.id} signature={signature}>{children}</Scope>;
}

function Scope({ viewer, signature, children }: { viewer: string | null | undefined; signature: string; children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<CourseInterestSnapshot>(pending);
  const controller = useRef<ReturnType<typeof createCourseInterestBatch> | null>(null);
  useEffect(() => {
    if (!viewer) return;
    const keys: string[] = JSON.parse(signature);
    const batch = createCourseInterestBatch(() => keys.length ? courseInterestStatesAction(keys) : Promise.resolve({}), setSnapshot);
    controller.current = batch;
    // Strict Mode's disposed setup must not start a duplicate request.
    void Promise.resolve().then(() => batch.load());
    return () => { batch.dispose(); controller.current = null; };
  }, [viewer, signature]);
  return <Context.Provider value={{ ...snapshot, viewer, saved: (key, value) => controller.current?.saved(key, value) }}>
    {viewer && snapshot.status === "failed" ? <div role="alert" className="mb-3 rounded-lg border border-pul-border bg-white p-3 text-sm"><p>관심 상태 확인 실패</p><button type="button" className="min-h-11 underline" onClick={() => void controller.current?.load()}>다시 확인</button></div> : null}
    {children}
  </Context.Provider>;
}

export function CourseInterestBatchButton({ courseKey, returnTo }: { courseKey: string; returnTo: string }) {
  const batch = useContext(Context);
  if (!batch || batch.viewer === undefined) return <button disabled className="min-h-11 rounded-lg border px-3 text-sm">관심 확인 중</button>;
  if (!batch.viewer) return <Link prefetch={false} href={`/login?next=${encodeURIComponent(returnTo)}`} className="inline-flex min-h-11 items-center rounded-lg border border-pul-border px-3 text-sm font-bold">♡ 관심</Link>;
  if (batch.status !== "ready") return <button disabled className="min-h-11 rounded-lg border px-3 text-sm">{batch.status === "failed" ? "관심 확인 실패" : "관심 확인 중"}</button>;
  if (!Object.hasOwn(batch.values, courseKey)) return <button disabled className="min-h-11 rounded-lg border px-3 text-sm">관심 이용 불가</button>;
  return <InterestButton kind="course" id={courseKey} initialSaved={batch.values[courseKey]} label="관심" onSaved={value => batch.saved(courseKey, value)} />;
}
