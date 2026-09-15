"use client";

import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { HOF_APPLICANT_STATUS } from "@/lib/hall-of-fame/hallOfFameApplicant";
import { parseApplicationQueue, reviewFailure, type ApplicationPermissions, type ApplicationQueueItem, type ReviewResult } from "@/lib/hall-of-fame/hallOfFameApplicationReview";
import { HallOfFameApplicationDetail, HallOfFameApplicationDecisionReceipt } from "./HallOfFameApplicationDetail";

export function HallOfFameApplicationQueue({ userId, permissions }: { userId: string; permissions: ApplicationPermissions }) {
  const client = useMemo(() => createClient(), []);
  const [sessionUserId, setSessionUserId] = useState<string>();
  useEffect(() => {
    let alive = true, revision = 0;
    const { data } = client.auth.onAuthStateChange((_event, session) => { revision++; if (alive) setSessionUserId(session?.user.id); });
    const initial = revision;
    void client.auth.getSession().then(({ data }) => { if (alive && initial === revision) setSessionUserId(data.session?.user.id); }).catch(() => { if (alive && initial === revision) setSessionUserId(undefined); });
    const logout = () => { revision++; setSessionUserId(undefined); };
    window.addEventListener("pul-auth-signed-out", logout);
    return () => { alive = false; data.subscription.unsubscribe(); window.removeEventListener("pul-auth-signed-out", logout); };
  }, [client, userId]);
  if (sessionUserId !== userId || !permissions.canRead) return null;
  return <ApplicationWorkspace key={userId} client={client} permissions={permissions} />;
}

function ApplicationWorkspace({ client, permissions }: { client: SupabaseClient; permissions: ApplicationPermissions }) {
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [items, setItems] = useState<ApplicationQueueItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Extract<ReviewResult, { operation: "decide" }> | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let current = true;
    void Promise.resolve(client.rpc("list_hall_of_fame_review_queue", { p_limit: 10, p_offset: page * 10 })).then(({ data, error }) => {
      if (!current) return;
      if (error) throw error;
      const rows = parseApplicationQueue(data);
      setItems(rows); setSelected(id => rows.some(r => r.id === id) ? id : null);
      setMessage(rows.length ? "" : "검토할 기록 신청이 없습니다."); setLoading(false);
    }).catch(cause => { if (current) { setItems([]); setSelected(null); setMessage(reviewFailure(cause).message); setLoading(false); } });
    return () => { current = false; };
  }, [client, page, revision]);
  const refresh = (keepSelection = false) => {
    setLoading(true); setMessage(""); if (!keepSelection) { setSelected(null); setReceipt(null); }
    setRevision(v => v + 1);
  };
  const changePage = (next: number) => { setSelected(null); setReceipt(null); setItems([]); setLoading(true); setMessage(""); setPage(next); };
  const selectedItem = items.find(item => item.id === selected);
  const buttonClass = "min-h-12 rounded-lg border border-pul-border px-4 py-2 font-bold disabled:opacity-50";
  return <section className="mb-6 space-y-4 rounded-2xl border border-pul-border bg-white p-5" aria-labelledby="hof-application-queue">
    <h2 id="hof-application-queue" className="text-xl font-bold">기록 신청 접수 현황</h2>
    <p className="text-sm text-pul-muted">신청을 선택하여 내용을 확인하고 권한에 따라 심사와 최종 결정을 진행하세요.</p>
    {loading && <p role="status">신청 목록을 불러오는 중입니다.</p>}
    {message && <p role="status">{message}</p>}
    <ul className="space-y-2">{items.map(item => <li key={item.id}><button type="button" disabled={loading} aria-pressed={selected === item.id} onClick={() => { setSelected(selected === item.id ? null : item.id); setReceipt(null); }} className={`flex min-h-12 w-full flex-wrap justify-between gap-2 rounded-xl border p-3 text-left ${selected === item.id ? "border-pul-point bg-pul-light" : "border-pul-border"}`}>
      <span>신청 {item.id.slice(0, 8)} · {new Date(item.submittedAt).toLocaleString("ko-KR")} 접수 · 기록 {item.count}건</span><strong>{HOF_APPLICANT_STATUS[item.status]}</strong>
    </button></li>)}</ul>
    <div className="flex flex-wrap gap-2"><button type="button" className={buttonClass} disabled={loading} onClick={() => refresh()}>신청 목록 새로고침</button>{page > 0 && <button type="button" className={buttonClass} disabled={loading} onClick={() => changePage(page - 1)}>이전</button>}{items.length === 10 && page < 1000 && <button type="button" className={buttonClass} disabled={loading} onClick={() => changePage(page + 1)}>다음</button>}{selected && <button type="button" className={buttonClass} onClick={() => setSelected(null)}>선택 해제</button>}</div>
    {receipt && <HallOfFameApplicationDecisionReceipt receipt={receipt} permissions={permissions} />}
    {selectedItem && <HallOfFameApplicationDetail key={`${selectedItem.id}:${selectedItem.version}`} client={client} batchId={selectedItem.id} permissions={permissions} onReviewed={() => refresh(true)} onDecided={result => { setReceipt(result); setSelected(null); refresh(true); }} />}
  </section>;
}
