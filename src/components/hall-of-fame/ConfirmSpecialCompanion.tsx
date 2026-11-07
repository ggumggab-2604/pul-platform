"use client";

import Link from "next/link";
import { useState } from "react";
import { MessagingSessionBoundary } from "@/components/messaging/MessagingSessionBoundary";
import { createClient } from "@/lib/supabase/client";
import { specialRpc, specialTypes, type CompanionConfirmation } from "@/lib/hall-of-fame/hallSpecialRecords";
import { clubButton } from "@/components/clubs/detail/ClubEditorDialog";

export function ConfirmSpecialCompanion(props: { messageId: string; viewerId: string; record: CompanionConfirmation }) {
  return <MessagingSessionBoundary viewerId={props.viewerId}><Confirmation {...props} /></MessagingSessionBoundary>;
}

function Confirmation({ messageId, viewerId, record }: { messageId: string; viewerId: string; record: CompanionConfirmation }) {
  const [confirmed, setConfirmed] = useState(record.confirmed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const client = createClient();
      const { data } = await client.auth.getUser();
      if (data.user?.id !== viewerId) throw Error("로그인 계정이 변경되었습니다. 새로고침해 주세요.");
      const result = await specialRpc<CompanionConfirmation>(client, "hall_special_companion_confirmation", {
        p_message_id: messageId, p_confirm: true,
      });
      setConfirmed(result.confirmed);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-6">
      <Link className={clubButton} href={`/messages/${messageId}`}>쪽지로 돌아가기</Link>
      <section className="mt-4 rounded-xl border border-pul-border bg-white p-4 sm:p-6">
        <h1 className="text-xl font-bold text-pul-deep">동반 확인</h1>
        <p className="mt-3 font-semibold">{record.name} · {specialTypes[record.type]}</p>
        <p className="mt-1 text-sm text-pul-muted">{record.date} · {record.course} · {record.segment} {record.hole}홀</p>
        {confirmed ? <p className="mt-4 font-semibold text-pul-deep" role="status">🎉 동반 확인을 완료했습니다.</p> : (
          <>
            <p className="my-4 text-sm">이 기록을 달성한 경기에 함께하셨다면 확인해 주세요. 공개 기록에는 이름 가림 기준에 따라 확인자로 표시됩니다.</p>
            <button className={clubButton} disabled={busy} onClick={() => void confirm()}>함께 경기한 기록 확인</button>
          </>
        )}
        {error && <p className="mt-3 text-sm text-rose-700" role="alert">{error}</p>}
      </section>
    </main>
  );
}
