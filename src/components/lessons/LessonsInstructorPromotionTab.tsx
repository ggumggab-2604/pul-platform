"use client";

import Link from "next/link";

import { InstructorInterestButton } from "@/components/lessons/InstructorInterestButton";
import {
  instructorChannelApplyHref, instructorChannelDirectoryHref, instructorChannelHref,
  type InstructorChannelSummary,
} from "@/lib/lessons/lessonInstructorChannels";

export function LessonsInstructorPromotionTab({
  channels, page, bookmarks, onPartnerInquiry,
}: {
  channels: InstructorChannelSummary[] | null;
  page: number;
  bookmarks: { savedKeys: readonly string[]; isAuthenticated: boolean; readError: string | null };
  onPartnerInquiry: () => void;
}) {
  return (
    <section className="space-y-4">
      <header className="space-y-3 rounded-xl border border-pul-border bg-white p-5">
        <h2 className="text-xl font-black">교습가 채널</h2>
        <p className="text-sm text-pul-muted">교습가를 선택해 티샷·퍼팅 등 기술별 영상과 질문 게시판을 무료로 보세요.</p>
        <div className="flex flex-wrap gap-2">
          <Link href={instructorChannelApplyHref} className="inline-flex min-h-11 items-center rounded-lg bg-pul-deep px-4 text-sm font-bold text-white">교습가 홍보 신청·관리</Link>
          <button type="button" onClick={onPartnerInquiry} className="min-h-11 rounded-lg border border-pul-border px-4 text-sm font-bold text-pul-deep">홍보·제휴 문의</button>
        </div>
      </header>
      {channels === null ? <p role="alert" className="rounded-xl bg-white p-5">교습가 채널을 불러오지 못했습니다.</p>
        : channels.length === 0 ? <p className="rounded-xl bg-white p-5 text-pul-muted">이 페이지에 공개된 교습가 채널이 없습니다.</p>
        : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {channels.slice(0, 24).map((channel) => (
            <article key={channel.instructor_id} className="space-y-3 rounded-xl border border-pul-border bg-white p-5">
              <p className="text-xs font-bold text-pul-muted">유료 홍보 채널 · {channel.channel_name}</p>
              <h3 className="text-lg font-bold"><Link href={instructorChannelHref(channel.instructor_id)} className="underline underline-offset-2">{channel.instructor_name}</Link></h3>
              <p className="line-clamp-3 break-words text-sm text-pul-muted">{channel.introduction}</p>
              <InstructorInterestButton instructorId={channel.instructor_id} instructorName={channel.instructor_name}
                isSaved={bookmarks.savedKeys.includes(channel.instructor_id)} isAuthenticated={bookmarks.isAuthenticated} readError={bookmarks.readError} />
            </article>
          ))}
        </div>}
      {channels && (page > 1 || channels.length > 24) && (
        <nav aria-label="교습가 채널 페이지" className="flex gap-4 font-bold text-pul-deep">
          {page > 1 && <Link href={`${instructorChannelDirectoryHref}&instructorPage=${page - 1}`}>이전</Link>}
          {channels.length > 24 && <Link href={`${instructorChannelDirectoryHref}&instructorPage=${page + 1}`}>다음</Link>}
        </nav>
      )}
    </section>
  );
}
