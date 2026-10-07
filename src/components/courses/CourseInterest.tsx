"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { courseInterestStateAction } from "@/app/my/interestActions";
import { InterestButton } from "@/components/interests/InterestButton";

export function CourseInterest({ courseKey, returnTo }: { courseKey: string; returnTo: string }) {
  const [viewer, setViewer] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const client = createClient();
    let live = true;
    let observed = false;
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      observed = true;
      if (live) setViewer(session?.user.id ?? null);
    });
    void client.auth.getSession().then(({ data }) => { if (live && !observed) setViewer(data.session?.user.id ?? null); });
    const signOut = () => setViewer(null);
    window.addEventListener("pul-auth-signed-out", signOut);
    return () => { live = false; subscription.unsubscribe(); window.removeEventListener("pul-auth-signed-out", signOut); };
  }, []);
  if (viewer === undefined) return <button disabled className="min-h-11 rounded-lg border px-3 text-sm">관심 확인 중</button>;
  if (!viewer) return <Link prefetch={false} href={`/login?next=${encodeURIComponent(returnTo)}`} className="inline-flex min-h-11 items-center rounded-lg border border-pul-border px-3 text-sm font-bold">♡ 관심</Link>;
  return <SavedCourseInterest key={`${viewer}:${courseKey}`} courseKey={courseKey} />;
}

function SavedCourseInterest({ courseKey }: { courseKey: string }) {
  const [saved, setSaved] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    void courseInterestStateAction(courseKey).then(value => { if (live) { setSaved(value); setFailed(false); } }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [courseKey, retry]);
  if (failed) return <div><p role="alert" className="text-sm text-rose-700">관심 상태 확인 실패</p><button className="min-h-11 underline" onClick={() => setRetry(v => v + 1)}>다시 확인</button></div>;
  if (saved === null) return <button disabled className="min-h-11 rounded-lg border px-3 text-sm">관심 확인 중</button>;
  return <InterestButton kind="course" id={courseKey} initialSaved={saved} label="관심" />;
}
