"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { HOF_APPLICANT_STATUS } from "@/lib/hall-of-fame/hallOfFameApplicant";

type Item = { application_batch_id: string; review_status: string; submitted_at: string; active_record_count: number };
export function HallOfFameApplicationQueue({ userId }: { userId: string }) {
  const client = useMemo(() => createClient(), []);
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const [message, setMessage] = useState("신청 목록을 불러오는 중입니다.");
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let alive = true;
    let sequence = 0;
    let authRevision = 0;
    const load = async (id?: string) => {
      const run = ++sequence;
      setItems([]);
      setVisible(id === userId);
      setMessage("신청 목록을 불러오는 중입니다.");
      if (id !== userId) return;
      try {
        const { data, error } = await client.rpc("list_hall_of_fame_review_queue", { p_limit: 10, p_offset: page * 10 });
        if (!alive || run !== sequence) return;
        if (error || !Array.isArray(data)) throw new Error("queue unavailable");
        if (data.some(row => typeof row.application_batch_id !== "string" || typeof row.review_status !== "string" || !Number.isFinite(Date.parse(row.submitted_at)) || !Number.isSafeInteger(row.active_record_count))) throw new Error("queue invalid");
        setItems(data.map(row => ({ application_batch_id: row.application_batch_id, review_status: row.review_status, submitted_at: row.submitted_at, active_record_count: row.active_record_count })));
        setMessage(data.length ? "" : "검토할 기록 신청이 없습니다.");
      } catch { if (alive && run === sequence) setMessage("기록 신청 목록을 불러오지 못했습니다. 신청 조회 권한과 연결 상태를 확인해 주세요."); }
    };
    const { data } = client.auth.onAuthStateChange((_event, session) => { authRevision++; void load(session?.user.id); });
    const initial = authRevision;
    void client.auth.getSession().then(({ data }) => { if (alive && initial === authRevision) void load(data.session?.user.id); }).catch(() => { if (alive) void load(); });
    const logout = () => { authRevision++; void load(); };
    window.addEventListener("pul-auth-signed-out", logout);
    return () => { alive = false; sequence++; data.subscription.unsubscribe(); window.removeEventListener("pul-auth-signed-out", logout); };
  }, [client, userId, page, revision]);
  if (!visible) return null;
  return <section className="mb-6 space-y-4 rounded-2xl border border-pul-border bg-white p-5" aria-labelledby="hof-application-queue">
    <h2 id="hof-application-queue" className="text-xl font-bold">기록 신청 접수 현황</h2>
    <p className="text-sm text-pul-muted">접수·확인 중·추가 정보 요청 상태의 신청입니다. 승인 여부는 기존 신청 심사 절차에서 결정됩니다.</p>
    {message && <p role="status">{message}</p>}
    <ul className="space-y-2">{items.map(item => <li key={item.application_batch_id} className="flex flex-wrap justify-between gap-2 rounded-xl border border-pul-border p-3"><span>{new Date(item.submitted_at).toLocaleString("ko-KR")} 접수 · 기록 {item.active_record_count}건</span><strong>{HOF_APPLICANT_STATUS[item.review_status] ?? "상태 확인 필요"}</strong></li>)}</ul>
    <div className="flex flex-wrap gap-2"><button className="min-h-12 rounded-lg border border-pul-border px-4" onClick={() => setRevision(v => v + 1)}>신청 목록 새로고침</button>{page > 0 && <button className="min-h-12 px-4" onClick={() => setPage(v => v - 1)}>이전</button>}{items.length === 10 && page < 1000 && <button className="min-h-12 px-4" onClick={() => setPage(v => v + 1)}>다음</button>}</div>
  </section>;
}
