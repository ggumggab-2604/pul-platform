"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeLostItem } from "@/app/market/lost-items/actions";
import { lostItemButton } from "@/lib/market/lostItems";

export function LostItemCompleteButton({ id }: { id: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  return <div>
    <button disabled={pending} className={lostItemButton + " !bg-pul-point !text-white"} onClick={() => {
      startTransition(async () => {
        try {
          const result = await completeLostItem(id);
          if (!result.ok) setError(result.message);
          else router.refresh();
        } catch {
          setError("처리 결과를 확인하지 못했습니다. 다시 시도해 주세요.");
        }
      });
    }}>{pending ? "처리 중…" : "찾았어요"}</button>
    {error && <p role="alert" className="mt-2 text-sm text-rose-800">{error}</p>}
  </div>;
}
