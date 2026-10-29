"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MessagingSessionBoundary } from "@/components/messaging/MessagingSessionBoundary";
import { getClubFederation, type ClubFederationPage } from "@/lib/clubs/clubAffiliations";
import { createClient } from "@/lib/supabase/client";
import { ClubPostComposer } from "./detail/ClubPostComposer";
import { clubButton } from "./detail/ClubEditorDialog";
import { Card } from "@/components/ui/Card";
export function ClubFederationBoard({ initial }: { initial: ClubFederationPage }) {
  return initial.viewer_id ? <MessagingSessionBoundary viewerId={initial.viewer_id}><Board key={initial.viewer_id} initial={initial} /></MessagingSessionBoundary> : <Board key="public" initial={initial} />;
}
function Board({ initial }: { initial: ClubFederationPage }) {
  const [page, setPage] = useState(initial), [editor, setEditor] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const trigger = useRef<HTMLButtonElement>(null), live = useRef(true), revision = useRef(0);
  useEffect(() => { live.current = true; const epoch = revision; return () => { live.current = false; epoch.current++; }; }, []);
  async function refresh(offset = page.offset) {
    const ticket = ++revision.current; setBusy(true);
    try { const next = await getClubFederation(createClient(), initial.region, offset); if (!live.current || ticket !== revision.current) return; if (next.viewer_id !== initial.viewer_id) throw Error("로그인 상태가 변경되었습니다."); setPage(next); setError(""); }
    catch (e) { if (live.current && ticket === revision.current) setError(e instanceof Error ? e.message : "목록을 다시 확인해 주세요."); }
    finally { if (live.current && ticket === revision.current) setBusy(false); }
  }
  function close() { setEditor(false); requestAnimationFrame(() => trigger.current?.focus()); }
  return <Card title={page.name + " 게시판"}>
    <p className="text-sm text-pul-muted">{page.can_write ? page.automatic ? "내 주 소속에 따른 자동 자격으로 이용 중입니다." : "이 지역 연합의 별도 승인 자격으로 이용 중입니다." : "공개된 글을 볼 수 있습니다. 회원 전용 글과 작성에는 이 지역 연합의 유효한 자격이 필요합니다."}</p>
    <p className="mt-2 text-sm text-pul-muted">주 소속 동호회의 소속 시도를 기준으로 자동 연결됩니다. 별도 가입은 승인 담당자와 절차 확인 후 제공됩니다.</p>
    <div className="mt-3 flex flex-wrap gap-2">{page.can_write && page.viewer_id ? <button className={clubButton} ref={trigger} onClick={() => setEditor(true)}>연합 글쓰기</button> : null}<Link className={clubButton} href={page.viewer_id ? "/my/clubs" : "/login?next=/my/clubs"}>내 주 소속·연합 확인</Link><Link className={clubButton} href="/clubs/federations">다른 시도 연합</Link></div>
    {page.items.length ? <ul className="mt-4 divide-y divide-pul-border">{page.items.map(p => <li key={p.id} className="py-3"><Link className="block break-words font-semibold text-pul-deep" href={"/clubs/" + page.club_key + "/posts/" + p.id}>{p.title}</Link><p className="mt-1 text-sm text-pul-muted">{p.visibility === "public" ? "전체 공개" : "연합 회원만"} · {new Date(p.created_at).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}</p></li>)}</ul> : <p className="mt-4 text-pul-muted">현재 열람할 수 있는 글이 없습니다.</p>}
    <div className="mt-4 flex flex-wrap items-center gap-2"><button className={clubButton} disabled={busy || page.offset === 0} onClick={() => void refresh(Math.max(0, page.offset - 20))}>이전</button><span className="text-sm">{Math.floor(page.offset / 20) + 1}쪽 · {page.total}건</span><button className={clubButton} disabled={busy || page.offset + 20 >= page.total} onClick={() => void refresh(page.offset + 20)}>다음</button><button className={clubButton} disabled={busy} onClick={() => void refresh()}>목록 새로고침</button></div>
    {error ? <p role="alert" className="mt-3 text-rose-700">{error}</p> : null}
    {editor && page.viewer_id ? <ClubPostComposer viewerId={page.viewer_id} clubKey={page.club_key} clubId={page.club_id} courses={[]} onClose={close} onSaved={() => { close(); void refresh(0); }} /> : null}
  </Card>;
}
