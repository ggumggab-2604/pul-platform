"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmAnnualAward } from "@/app/clubs/[id]/scores/annual/actions";
import { awardLabels, type Award } from "@/lib/clubs/annualClubActivity";

const button = "min-h-11 rounded-lg border border-pul-border bg-white px-3 font-semibold text-pul-point disabled:opacity-60";

export function AnnualPrintButton() {
  return <button className={button} type="button" onClick={() => window.print()}>현재 활동표 인쇄</button>;
}

export function AnnualAwardButton({ viewerId, clubKey, year, member, name, category, condition }: {
  viewerId: string; clubKey: string; year: number; member: string; name: string; category: Award; condition: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return <div className="flex flex-wrap items-center gap-2">
    <button className={button} type="button" disabled={pending} onClick={() => {
      if (!window.confirm(name + " 회원의 " + awardLabels[category] + " 수상을 확정할까요?")) return;
      setError("");
      start(async () => {
        try {
          const result = await confirmAnnualAward(viewerId, clubKey, year, category, condition, member);
          if (result.error) setError(result.error);
          else router.refresh();
        } catch {
          setError("저장 결과를 확인하지 못했습니다. 다시 시도해 주세요.");
        }
      });
    }}>{pending ? "저장 중…" : "수상 확정"}</button>
    {error && <span className="text-red-700" role="alert">{error}</span>}
  </div>;
}

