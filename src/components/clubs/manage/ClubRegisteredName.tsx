"use client";

import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";

export function ClubRegisteredName({ club, membership, canEdit }: { club: string; membership: string; canEdit: boolean }) {
  const [current, setCurrent] = useState<string | null | undefined>();
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, start] = useTransition();

  function load() {
    setMessage("");
    start(async () => {
      const { data, error } = await createClient().rpc("get_club_registered_name_for_management", {
        p_club: club, p_membership: membership,
      });
      if (error) { setMessage("등록 이름을 불러오지 못했습니다."); return; }
      setCurrent(data);
      setName(data ?? "");
    });
  }

  return <div className="space-y-2 rounded-lg border border-pul-border p-3">
    {current === undefined ? <button type="button" onClick={load} disabled={busy}
      className="min-h-11 font-bold text-pul-deep underline underline-offset-4">동호회 등록 이름 확인</button> :
      <form className="space-y-2" onSubmit={(event) => {
        event.preventDefault();
        setMessage("");
        start(async () => {
          const { data, error } = await createClient().rpc("correct_club_registered_name", {
            p_club: club, p_membership: membership, p_expected: current, p_name: name.trim(),
          });
          if (error) { setMessage(error.message || "등록 이름을 저장하지 못했습니다."); return; }
          setCurrent(data);
          setName(data);
          setMessage("동호회 등록 이름을 정정했습니다.");
        });
      }}>
        {canEdit ? <>
          <label className="block text-sm font-bold">동호회 등록 이름
            <input value={name} onChange={(event) => setName(event.target.value)} required disabled={busy} maxLength={60}
              className="mt-2 min-h-11 w-full rounded-lg border border-pul-border px-3 text-base" />
          </label>
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={busy || !name.trim() || name.trim() === current}
              className="min-h-11 rounded-lg bg-pul-deep px-3 font-bold text-white disabled:opacity-50">등록 이름 정정</button>
            <button type="button" disabled={busy || name === (current ?? "")} onClick={() => setName(current ?? "")}
              className="min-h-11 px-2 font-bold text-pul-deep disabled:opacity-50">취소</button>
          </div>
        </> : <p>동호회 등록 이름 · {current ?? "미등록"}</p>}
      </form>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </div>;
}
