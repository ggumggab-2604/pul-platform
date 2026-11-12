"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { shareLessonVideoAction } from "@/app/lessons/actions";
import { instructorChannelHref } from "@/lib/lessons/lessonInstructorChannels";
import { videoLessonCategories } from "@/data/videoLessonData";

const fieldClass = "min-h-11 w-full rounded-lg border border-pul-border bg-white px-3 py-2 text-foreground";

export function ShareLessonVideoForm({ instructorId }: { instructorId?: string }) {
  const [state, action, pending] = useActionState(shareLessonVideoAction, { ok: false, message: "" });
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("");
  const [scope, setScope] = useState("both");
  if (state.ok) {
    return (
      <div className="mt-5 space-y-3 rounded-xl border border-pul-border bg-white p-5">
        <p role="status" className="font-semibold">{state.message}</p>
        <Link className="font-bold text-pul-deep underline" href={instructorId ? `${instructorChannelHref(instructorId)}?category=${state.category}` : `/lessons?tab=free-videos&videoCategory=${state.category}`}>
          {instructorId ? "교습가 페이지에서 보기" : "등록한 카테고리 보기"}
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="mt-5 space-y-4 rounded-xl border border-pul-border bg-white p-5">
      <label className="grid gap-2 font-semibold">
        YouTube 영상 주소
        <input className={fieldClass} name="youtubeUrl" type="url" inputMode="url" maxLength={500} value={url} onChange={(event) => setUrl(event.target.value)} required />
      </label>
      <label className="grid gap-2 font-semibold">
        카테고리
        <select className={fieldClass} name="category" value={category} onChange={(event) => setCategory(event.target.value)} required>
          <option value="" disabled>카테고리 선택</option>
          {videoLessonCategories.filter(({ value }) => value !== "all" && value !== "cert_referee").map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>
      {instructorId && (
        <label className="grid gap-2 font-semibold">
          공개 범위
          <select className={fieldClass} name="scope" value={scope} onChange={(event) => setScope(event.target.value)} required>
            <option value="both">무료 레슨에도 공개</option>
            <option value="exclusive">교습가 페이지에만 공개</option>
          </select>
        </label>
      )}
      {state.message && <p role="alert" className="text-sm text-red-800">{state.message}</p>}
      <button type="submit" disabled={pending} className="min-h-11 rounded-lg bg-pul-deep px-5 font-bold text-white disabled:opacity-50">
        {pending ? "등록 중…" : instructorId ? "영상 링크 등록" : "무료 영상에 등록"}
      </button>
    </form>
  );
}
