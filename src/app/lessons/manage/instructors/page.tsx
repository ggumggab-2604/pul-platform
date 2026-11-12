import Link from "next/link";
import { redirect } from "next/navigation";

import { reviewInstructorChannelAction } from "@/app/lessons/instructors/actions";
import { InstructorChannelForm } from "@/components/lessons/instructors/InstructorChannelForm";
import { Container } from "@/components/ui/Container";
import {
  instructorChannelManageHref, instructorChannelRpc, type InstructorChannelReview,
} from "@/lib/lessons/lessonInstructorChannels";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export const metadata = { title: "교습가 채널 운영" };
const statusNames = { pending: "확인 대기", active: "공개 중", rejected: "반려", paused: "공개 중지" };

export default async function ManageInstructorChannelsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) redirect(`/login?next=${encodeURIComponent(instructorChannelManageHref)}`);
  const pageNumber = Math.max(1, Math.min(10000, Number.parseInt((await searchParams).page ?? "", 10) || 1));
  const applications = await instructorChannelRpc<InstructorChannelReview[]>(
    context.supabase, "list_lesson_instructor_channel_applications", { p_offset: (pageNumber - 1) * 24 },
  ).catch(() => null);
  return (
    <main className="bg-pul-page">
      <Container className="max-w-4xl space-y-4 px-3 py-6 pb-24">
        <Link href="/manage" className="font-bold text-pul-deep underline">운영 관리센터</Link>
        <h1 className="text-2xl font-black">교습가 채널 운영</h1>
        {!applications ? <p role="alert">교습가 채널 신청을 조회할 수 없습니다. 운영 권한과 연결 상태를 확인해 주세요.</p>
          : applications.length === 0 ? <p>신청 내역이 없습니다.</p>
          : applications.slice(0, 24).map(({ existing_instructors: candidates, ...application }) => (
            <article key={application.id} className="space-y-3 rounded-xl border border-pul-border bg-white p-5">
              <p className="text-sm font-semibold text-pul-muted">{statusNames[application.status]}</p>
              <h2 className="text-lg font-bold">{application.instructor_name} · {application.channel_name}</h2>
              <a href={application.channel_url} target="_blank" rel="noopener noreferrer" className="break-all font-bold text-pul-deep underline">신청한 YouTube 채널 확인</a>
              <p className="whitespace-pre-wrap break-words">{application.introduction}</p>
              {(application.status === "pending" || application.status === "paused") && (
                <InstructorChannelForm action={reviewInstructorChannelAction.bind(null, application, "activate")} buttonLabel="공개 승인">
                  {candidates.length > 0 && (
                    <InstructorLinkOptions candidates={candidates} canCreate={!candidates.some((candidate) => candidate.channel_name === application.channel_name)} />
                  )}
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="paymentConfirmed" value="yes" required /> 채널 소유와 홍보비 결제를 확인했습니다.</label>
                </InstructorChannelForm>
              )}
              {application.status === "pending" && (
                <InstructorChannelForm action={reviewInstructorChannelAction.bind(null, application, "reject")} buttonLabel="신청 반려">{null}</InstructorChannelForm>
              )}
              {application.status === "active" && (
                <InstructorChannelForm action={reviewInstructorChannelAction.bind(null, application, "pause")} buttonLabel="공개 중지">{null}</InstructorChannelForm>
              )}
            </article>
          ))}
        {applications && (pageNumber > 1 || applications.length > 24) && (
          <nav aria-label="신청 목록 페이지" className="flex gap-4 text-sm font-bold text-pul-deep">
            {pageNumber > 1 && <Link href={`?page=${pageNumber - 1}`}>이전</Link>}
            {applications.length > 24 && <Link href={`?page=${pageNumber + 1}`}>다음</Link>}
          </nav>
        )}
      </Container>
    </main>
  );
}

function InstructorLinkOptions({
  candidates, canCreate,
}: {
  candidates: InstructorChannelReview["existing_instructors"];
  canCreate: boolean;
}) {
  return (
    <fieldset className="min-w-0 space-y-3 rounded-lg border border-pul-border p-3">
      <legend className="px-1 font-bold">같은 이름의 기존 교습가</legend>
      <ul className="space-y-3 text-sm">
        {candidates.map((candidate) => (
          <li key={candidate.id} className="space-y-1">
            <p className="break-words font-bold">{candidate.instructor_name} · {candidate.channel_name}</p>
            {candidate.linked_to_other && <p className="text-red-800">다른 신청 계정에 이미 연결됨</p>}
            {candidate.videos.length === 0 ? <p>연결된 영상이 없습니다.</p> : (
              <ul className="space-y-1 pl-3">
                {candidate.videos.map((video) => (
                  <li key={video.video_key}>
                    <Link href={"/lessons/manage/videos?video=" + encodeURIComponent(video.video_key)} className="break-words text-pul-deep underline">{video.title}</Link>
                    <p className="break-all text-pul-muted">등록 채널 주소 {video.youtube_channel_url ?? "없음"}</p>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      <p className="text-sm text-pul-muted">주소로 확인할 수 없으면 채널 소유를 확인한 뒤 기존 교습가를 직접 선택해 주세요.</p>
      <label className="block space-y-1 text-sm font-bold">
        <span className="block">연결할 교습가</span>
        <select name="instructorChoice" className="min-h-11 w-full rounded-lg border border-pul-border bg-white px-2">
          <option value="">채널 주소가 일치하는 기존 교습가 연결</option>
          {candidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id} disabled={candidate.linked_to_other}>
              {candidate.instructor_name} · {candidate.channel_name}{candidate.linked_to_other ? " (이미 연결됨)" : ""}
            </option>
          ))}
          {canCreate && <option value="new">별개의 교습가로 확인해 신규 개설</option>}
        </select>
      </label>
    </fieldset>
  );
}
