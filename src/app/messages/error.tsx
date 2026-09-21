"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="mx-auto max-w-3xl space-y-4 p-6"><h1 className="text-xl font-bold">쪽지를 불러오지 못했습니다.</h1><button className="min-h-11 rounded-lg bg-pul-point px-4 font-bold text-white" onClick={reset}>다시 시도</button><Link href="/messages" prefetch={false} className="ml-3 inline-flex min-h-11 items-center">쪽지함으로</Link></main>;
}
