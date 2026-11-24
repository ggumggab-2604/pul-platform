"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { requestCommunityBannerAction } from "@/app/community/promotion-actions";
import type { BannerPost, BannerSlot } from "@/lib/community/communityPromotions";
import { noticeLocation } from "@/lib/community/communityPromotionsPreview";
import { slotLabels } from "@/lib/promotions/promotionManagementUi";
import { primary, SelectField, TextField } from "./CommunityPromotionForms";

export function CommunityBannerRequestForm({ posts, slots, initialPost, starts, ends }: {
  posts: BannerPost[]; slots: BannerSlot[]; initialPost: string; starts: string; ends: string;
}) {
  const [postId, setPostId] = useState(posts.some((post) => post.id === initialPost) ? initialPost : "");
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const selected = posts.find((post) => post.id === postId);
  if (!posts.length) return <p className="text-sm">신청할 수 있는 내 공개 홍보 글이 없습니다. <Link className="font-bold text-pul-point underline" href="/community">커뮤니티 글쓰기</Link></p>;
  return <form className="space-y-4" onSubmit={(event) => {
    event.preventDefault();
    if (pending || done) return;
    const data = new FormData(event.currentTarget);
    setMessage("");
    start(async () => {
      try {
        const result = await requestCommunityBannerAction({ postId, slot: String(data.get("slot") ?? ""),
          start: String(data.get("start") ?? ""), end: String(data.get("end") ?? "") });
        setDone(result.ok);
        setMessage(result.ok ? "배너 신청이 접수되었습니다." : result.error);
      } catch { setMessage("배너 신청을 접수하지 못했습니다."); }
    });
  }}>
    <SelectField label="배너 자리" name="slot" defaultValue="" required disabled={pending || done}>
      <option value="">자리 선택</option>{slots.map((slot) => <option value={slot.code} key={slot.code}>{slotLabels[slot.code] ?? slot.label}</option>)}
    </SelectField>
    <SelectField label="연결할 홍보 글" value={postId} onChange={(event) => setPostId(event.target.value)} required disabled={pending || done}>
      <option value="">홍보 글 선택</option>{posts.map((post) => <option value={post.id} key={post.id}>{post.title}</option>)}
    </SelectField>
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm" aria-live="polite">
      <p className="font-bold text-amber-900">커뮤니티 상단 공지 위치</p>
      <p className="mt-1 font-extrabold text-pul-deep">{selected ? noticeLocation(selected) : "홍보 글을 선택해 주세요"}</p>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <TextField label="게시 시작 (한국시간)" type="datetime-local" name="start" defaultValue={starts} required disabled={pending || done} />
      <TextField label="게시 종료 (한국시간)" type="datetime-local" name="end" defaultValue={ends} required disabled={pending || done} />
    </div>
    {message ? <p role={done ? "status" : "alert"} className="text-sm font-semibold">{message}</p> : null}
    <button type="submit" disabled={!selected || pending || done} className={primary}>{pending ? "접수 중…" : "배너 신청 보내기"}</button>
  </form>;
}
