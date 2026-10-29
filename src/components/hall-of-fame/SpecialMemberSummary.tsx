"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { specialRpc, type SpecialMember } from "@/lib/hall-of-fame/hallSpecialRecords";
import { SpecialDialog } from "./SpecialDialog";

export function SpecialCounts({ member }: { member: SpecialMember }) {
 return <span className="whitespace-nowrap text-xs font-normal text-pul-muted" aria-label={`홀인원 ${member.hole_in_one}회, 알바트로스 ${member.albatross}회, 콘도르 ${member.condor}회`}>🏅 홀{member.hole_in_one} · 알{member.albatross} · 콘{member.condor}</span>;
}
export function SpecialMemberSummary({ member }: { member: SpecialMember }) {
 const [open, setOpen] = useState(false);
 return <><button type="button" className="max-w-full break-words text-left font-semibold text-pul-deep underline-offset-4 hover:underline" onClick={() => setOpen(true)} aria-haspopup="dialog">{member.name} <SpecialCounts member={member} /></button>
 {open ? <SpecialDialog title="회원 정보" onClose={() => setOpen(false)}><p className="break-words text-lg font-bold">{member.name}</p><p className="mt-2 text-sm text-pul-muted">주 소속 · {member.primary_club ?? "공개된 주 소속 없음"}</p><p className="mt-3"><SpecialCounts member={member} /></p><Link className="mt-4 inline-flex min-h-11 items-center font-semibold text-pul-point" href={`/hall-of-fame/special?member=${member.key}`}>기록 보기</Link></SpecialDialog> : null}</>;
}
/** One authorized batch lookup for the visible post ids; no account ids or name matching. */
export function SpecialPostAuthor({ postId }: { postId: string }) {
 const [member, setMember] = useState<SpecialMember | null>(null);
 useEffect(() => { let live = true; void specialRpc<{authors: Record<string, string>; members: SpecialMember[]}>(createClient(), "get_hall_special_post_authors", {p_post_ids: [postId]}).then(data => { if (live) setMember(data.members.find(m => m.key === data.authors[postId]) ?? null); }).catch(() => { if (live) setMember(null); }); return () => { live = false; }; }, [postId]);
 return member ? <p className="mt-2 text-sm"><SpecialMemberSummary member={member} /></p> : null;
}

