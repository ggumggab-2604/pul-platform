"use client";

import { Card } from "@/components/ui/Card";
import { day, isPublic, noticeLocation, placementStatus, type Placement, type Post } from "@/lib/community/communityPromotionsPreview";
import { slotLabels } from "@/lib/promotions/promotionManagementUi";
import { CalendarDays, Megaphone, Pin } from "lucide-react";
import { useState, type FormEvent } from "react";
import { primary, secondary, SelectField, TextField } from "./CommunityPromotionForms";

const placementLabels: Record<ReturnType<typeof placementStatus>, string> = {
  live: "노출 중", paused: "중단", ended: "종료", scheduled: "예약", blocked: "일시 중지 · 연결 글 비공개",
};
const scheduleDate = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" });
const dateInput = (time: number) => new Date(time + 9 * 3_600_000).toISOString().slice(0, 16);

export function BannerForm({ posts, placements, now, initialPostId, onAdd, onUpdate }: {
  posts: Post[];
  placements: Placement[];
  now: number;
  initialPostId: string;
  onAdd: (placement: Placement) => void;
  onUpdate: (id: string, action: "pause" | "end") => void;
}) {
  const [postId, setPostId] = useState(initialPostId);
  const [slot, setSlot] = useState("home.hero.01");
  const [starts, setStarts] = useState(() => dateInput(now));
  const [ends, setEnds] = useState(() => dateInput(now + 14 * day));
  const [message, setMessage] = useState("");
  const selected = posts.find((post) => post.id === postId);
  const linked = placements.filter((placement) => placement.postId === postId);
  const startsAt = Date.parse(`${starts}+09:00`);
  const endsAt = Date.parse(`${ends}+09:00`);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !isPublic(selected) || !(startsAt < endsAt && endsAt > now)) {
      setMessage("공개된 홍보 글과 유효한 게시 기간을 선택해 주세요.");
      return;
    }
    const overlaps = placements.some((placement) => placement.slotCode === slot && !placement.paused &&
      posts.some((post) => post.id === placement.postId && isPublic(post)) &&
      placement.startsAt < endsAt && startsAt < placement.endsAt && placement.endsAt > now);
    if (overlaps) {
      setMessage("이 배너 자리의 기존 노출 일정과 겹칩니다. 자리나 기간을 바꿔 주세요.");
      return;
    }
    onAdd({ id: crypto.randomUUID(), postId, slotCode: slot, startsAt, endsAt, paused: false });
    setMessage("배너와 커뮤니티 공지에 같은 기간을 적용했습니다.");
  }

  return (
    <div className="space-y-5">
      <form className="space-y-4" onSubmit={submit} onChange={() => setMessage("")}>
        <SelectField label="배너 자리" value={slot} onChange={(event) => setSlot(event.target.value)}>
          {Object.entries(slotLabels).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
        </SelectField>
        <SelectField label="연결할 홍보 글" value={postId} onChange={(event) => setPostId(event.target.value)}>
          {posts.filter((post) => isPublic(post) || post.id === postId || placements.some((placement) => placement.postId === post.id)).map((post) => (
            <option key={post.id} value={post.id}>{post.title}{isPublic(post) ? "" : " (비공개)"}</option>
          ))}
        </SelectField>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
          <p className="flex items-center gap-2 font-bold text-amber-900"><Pin size={16} aria-hidden="true" /> 커뮤니티 상단 공지 위치</p>
          <p className="mt-1 font-extrabold text-pul-deep">{selected ? noticeLocation(selected) : "홍보 글을 선택해 주세요"}</p>
          <p className="mt-1 text-pul-muted">{slotLabels[slot]} 배너와 공지에 같은 게시 기간이 적용됩니다.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="게시 시작 (한국시간)" type="datetime-local" required value={starts} onChange={(event) => setStarts(event.target.value)} />
          <TextField label="게시 종료 (한국시간)" type="datetime-local" required value={ends} onChange={(event) => setEnds(event.target.value)} />
        </div>
        {endsAt - startsAt === 14 * day ? <p className="flex items-center gap-2 text-sm font-semibold text-pul-deep"><CalendarDays size={16} aria-hidden="true" /> 배너와 상단 공지 모두 2주간 노출</p> : null}
        <button type="submit" className={primary} disabled={!selected || !isPublic(selected)}>시연 일정 등록</button>
        {message ? <p role="status" className="text-sm font-semibold text-pul-deep">{message}</p> : null}
      </form>

      <section aria-label="선택한 글의 배너 노출 상태" className="space-y-2 border-t border-pul-border pt-4">
        <h3 className="flex items-center gap-2 text-base font-bold text-pul-deep"><Megaphone size={18} aria-hidden="true" /> 연결된 배너 노출 상태</h3>
        {linked.length === 0 ? <p className="text-sm text-pul-muted">연결된 배너가 없습니다.</p> : null}
        {linked.map((placement) => {
          const status = placementStatus(placement, now, selected);
          return (
            <Card key={placement.id} dense className={status === "live" ? "border-amber-200 bg-amber-50/60" : undefined}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold text-pul-deep">{slotLabels[placement.slotCode]}</p>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${status === "live" ? "bg-amber-100 text-amber-900" : "bg-pul-page text-slate-700"}`}>{placementLabels[status]}</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-pul-muted">{scheduleDate.format(placement.startsAt)} ~ {scheduleDate.format(placement.endsAt)}</p>
              {status === "live" || status === "scheduled" ? <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className={secondary} onClick={() => onUpdate(placement.id, "pause")}>노출 중단</button>
                {status === "live" ? <button type="button" className={secondary} onClick={() => onUpdate(placement.id, "end")}>종료 처리</button> : null}
              </div> : null}
            </Card>
          );
        })}
      </section>
    </div>
  );
}
