"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setBannerPostAction } from "@/app/manage/banners/community/actions";
import type { BannerPost } from "@/lib/community/communityPromotions";
import { noticeLocation, type Field } from "@/lib/community/communityPromotionsPreview";
import { primary, SelectField, TextField } from "@/components/community/CommunityPromotionForms";

export type BannerCommunitySelection = { id: string | null; title: string | null; field: Field | null; trade: string | null; locked: boolean };

export function BannerCommunityLink({ promotionKey, version, linked, options }: {
  promotionKey: string; version: number; linked: BannerCommunitySelection; options: BannerPost[];
}) {
  const router = useRouter();
  const [id, setId] = useState(linked.id ?? "");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const selected = id && (options.find((post) => post.id === id) ??
    (id === linked.id && linked.field ? { field: linked.field, trade: linked.trade ?? "" } : null));
  return <section className="mb-5 space-y-3 rounded-xl border border-pul-border bg-white p-4 sm:p-5">
    <h2 className="text-lg font-bold text-pul-deep">커뮤니티 상단 공지 연결</h2>
    {linked.locked ? <p className="text-sm">신청에서 연결한 글 · {linked.title}</p> : <form className="space-y-3" onSubmit={(event) => {
      event.preventDefault();
      if (pending) return;
      setMessage("");
      start(async () => {
        try {
          const result = await setBannerPostAction(promotionKey, version, id.trim());
          setMessage(result.ok ? "연결을 저장했습니다." : result.error);
          if (result.ok) router.refresh();
        } catch { setMessage("연결을 저장하지 못했습니다."); }
      });
    }}>
      <SelectField label="공개 홍보 글" value={options.some((post) => post.id === id) || id === linked.id ? id : ""} onChange={(event) => setId(event.target.value)}>
        <option value="">연결 안 함</option>
        {linked.id && !options.some((post) => post.id === linked.id) ? <option value={linked.id}>{linked.title}</option> : null}
        {options.map((post) => <option value={post.id} key={post.id}>{post.title}</option>)}
      </SelectField>
      <TextField label="홍보 글 키 직접 입력" value={id} onChange={(event) => setId(event.target.value)} maxLength={36} />
      <button type="submit" disabled={pending} className={primary}>연결 저장</button>
      {message ? <p role="status" className="text-sm">{message}</p> : null}
    </form>}
    {selected ? <p className="text-sm font-bold text-pul-point">공지 위치 · {noticeLocation(selected)}</p> : null}
    {linked.id ? <Link href={`/community/${linked.id}`} className="inline-flex min-h-11 items-center text-sm font-bold text-pul-point underline">연결 글 보기</Link> : null}
  </section>;
}
