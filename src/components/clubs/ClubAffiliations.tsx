"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MessagingSessionBoundary } from "@/components/messaging/MessagingSessionBoundary";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/client";
import { federationHref, getMyClubAffiliations, type MyClubAffiliations, type ClubAffiliation } from "@/lib/clubs/clubAffiliations";
import { contentRpc } from "@/lib/courses/courseContent";
import { ClubEditorDialog, clubButton } from "./detail/ClubEditorDialog";

export function ClubAffiliations(props: { viewerId: string; initial: MyClubAffiliations | null; choose?: string }) {
  return <MessagingSessionBoundary viewerId={props.viewerId}><Affiliations key={props.viewerId} {...props} /></MessagingSessionBoundary>;
}
function Affiliations({ viewerId, initial, choose }: { viewerId: string; initial: MyClubAffiliations | null; choose?: string }) {
  const [data, setData] = useState(initial), [target, setTarget] = useState<ClubAffiliation | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(initial ? "" : "소속을 불러오지 못했습니다."), [notice, setNotice] = useState("");
  const summary = useRef<HTMLDivElement>(null);
  const live = useRef(true), lock = useRef(false), trigger = useRef<HTMLButtonElement | null>(null), request = useRef<{ key: string; version: number; id: string } | null>(null);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const current = data?.memberships.find(c => c.is_primary);
  async function reload() { if (lock.current) return; lock.current = true; setBusy(true); try { const next = await getMyClubAffiliations(createClient(), viewerId); if (live.current) { setData(next); setError(""); } } catch (e) { if (live.current) setError(e instanceof Error ? e.message : "소속을 다시 확인해 주세요."); } finally { lock.current = false; if (live.current) setBusy(false); } }
  function close() { setTarget(null); requestAnimationFrame(() => { if (trigger.current?.isConnected) trigger.current.focus(); else summary.current?.focus(); }); }
  async function save() {
    if (!data || !target || lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const client = createClient(), who = await client.auth.getUser();
      if (who.error || who.data.user?.id !== viewerId || !live.current) throw Error("로그인 상태가 변경되었습니다.");
      const old = request.current;
      const entry = old?.key === target.club_key && old.version === data.version ? old : { key: target.club_key, version: data.version, id: crypto.randomUUID() };
      request.current = entry;
      await contentRpc(client, "select_club_primary", { p_club_key: entry.key, p_expected_version: entry.version, p_request_id: entry.id });
      const next = await getMyClubAffiliations(client, viewerId);
      if (!live.current) return;
      setData(next); setNotice("저장된 최신 주 소속과 지역 연합을 확인했습니다."); request.current = null; close();
    } catch (e) { if (live.current) setError(e instanceof Error ? e.message : "저장 결과를 확인하지 못했습니다. 같은 선택으로 다시 확인해 주세요."); }
    finally { lock.current = false; if (live.current) setBusy(false); }
  }
  return <div ref={summary} tabIndex={-1} aria-label="내 소속 변경 결과" className="space-y-5">
    <Card title="내 주 소속과 지역 연합">
      <p className="break-words font-semibold">{current ? "현재 주 소속: " + current.name : "아직 주 소속을 지정하지 않았습니다."}</p>
      {current && (!current.eligible || !data?.automatic_enabled) ? <p className="mt-2 text-sm text-pul-muted">현재 자동 연합 자격이 중지되어 있습니다. 활동 자격과 처리 안내를 확인해 주세요.</p> : null}
      <p className="mt-2 text-sm text-pul-muted">가입 승인된 야외 동호회 한 곳을 직접 선택하면 그 동호회의 소속 시도 지역 연합에 자동 연결됩니다.</p>
      {data?.federations.length ? <ul className="mt-3 space-y-2">{data.federations.map(f => <li key={f.region}><Link className="inline-flex min-h-11 items-center font-semibold text-pul-point" href={federationHref(f.region)}>{f.name}</Link><p className="text-sm text-pul-muted">{f.automatic ? "주 소속에 따른 자동 자격" : "자동 자격 없음"}{f.independent ? " · 별도 승인 자격" : ""}</p></li>)}</ul> : <p className="mt-3 text-sm text-pul-muted">현재 연결된 지역 연합 자격이 없습니다.</p>}
      <Link className={clubButton + " mt-3"} href="/clubs/federations">시도 지역 연합 보기</Link>
    </Card>
    <Card title="내 가입 동호회" action={<button className={clubButton} disabled={busy} onClick={() => void reload()}>소속 새로고침</button>}>
      {data?.memberships.length ? <ul className="divide-y divide-pul-border">{data.memberships.map(c => <li key={c.club_key} className="flex flex-wrap items-center justify-between gap-3 py-3" data-selected-entry={choose === c.club_key || undefined}><div className="min-w-0"><Link className="break-words font-semibold text-pul-deep" href={"/clubs/" + c.club_key}>{c.name}</Link><p className="mt-1 text-sm text-pul-muted">{c.region ?? "소속 시도 미확인"} · {c.status === "active" ? "활동 중" : "활동 정지"} · {c.is_primary ? "내 주 소속" : "내 다른 소속"}</p></div>{c.eligible && (!c.is_primary || !data.automatic_enabled) ? <button className={clubButton} disabled={busy} onClick={e => { trigger.current = e.currentTarget; setTarget(c); setError(""); }}>{c.is_primary ? "주 소속 선택 확인" : "주 소속으로 지정"}</button> : !c.eligible ? <span className="text-sm text-pul-muted">현재 주 소속 지정 대상이 아닙니다.</span> : null}</li>)}</ul> : <p>현재 가입한 동호회가 없습니다.</p>}
    </Card>
    {notice ? <p role="status">{notice}</p> : null}
    {error ? <p role="alert" className="text-rose-700">{error}</p> : null}
    {target ? <ClubEditorDialog title="주 소속 지정 확인" busy={busy} onClose={close}><p>이전 주 소속: {current?.name ?? "없음"}</p><p className="mt-2">새 주 소속: {target.name} · {target.region}</p><p className="mt-3">{current && current.region === target.region ? target.region + " 지역 연합 자동 자격의 근거를 새 주 소속으로 승계합니다." : (current ? current.region + " 지역 연합의 이전 자동 자격을 종료하고 " : "") + target.region + " 지역 연합 자동 자격을 연결합니다."}</p><p className="mt-2 text-sm text-pul-muted">별도 승인된 자격과 기존 글·활동 이력은 유지됩니다. 다른 동호회 가입은 바뀌지 않습니다.</p>{error ? <p role="alert" className="mt-3 text-rose-700">{error}</p> : null}<button className={clubButton + " mt-5 w-full"} disabled={busy} onClick={() => void save()}>{busy ? "저장·재조회 중…" : "이 동호회를 주 소속으로 지정"}</button></ClubEditorDialog> : null}
  </div>;
}
