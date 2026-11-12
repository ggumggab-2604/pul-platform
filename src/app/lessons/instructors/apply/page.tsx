import Link from "next/link";
import { redirect } from "next/navigation";

import { applyInstructorChannelAction } from "@/app/lessons/instructors/actions";
import { InstructorChannelForm } from "@/components/lessons/instructors/InstructorChannelForm";
import { ShareLessonVideoForm } from "@/components/lessons/submit/ShareLessonVideoForm";
import { Container } from "@/components/ui/Container";
import {
  instructorChannelApplyHref, instructorChannelDirectoryHref, instructorChannelHref,
  instructorChannelRpc, type InstructorChannelApplication,
} from "@/lib/lessons/lessonInstructorChannels";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export const metadata = { title: "교습가 채널 신청·관리" };

const field = "min-h-11 w-full rounded-lg border border-pul-border bg-white px-3 py-2";

export default async function InstructorChannelApplyPage() {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) redirect(`/login?next=${encodeURIComponent(instructorChannelApplyHref)}`);
  const result = await instructorChannelRpc<InstructorChannelApplication | null>(
    context.supabase, "get_my_lesson_instructor_channel",
  ).then((application) => ({ application, failed: false })).catch(() => ({ application: null, failed: true }));
  const { application, failed } = result;
  const activeId = application?.status === "active" ? application.instructor_id : null;

  return (
    <main className="bg-pul-page">
      <Container className="max-w-3xl space-y-4 px-3 py-6 pb-24">
        <Link href={instructorChannelDirectoryHref} className="font-bold text-pul-deep underline">교습가 채널 목록</Link>
        <h1 className="text-2xl font-black">{activeId ? "내 교습가 채널" : "교습가 홍보 신청"}</h1>
        {failed ? <p role="alert" className="rounded-xl bg-white p-5">신청 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
          : activeId ? (
            <>
              <Link href={instructorChannelHref(activeId)} className="font-bold text-pul-deep underline">내 채널 공개 페이지</Link>
              <h2 className="text-xl font-bold">YouTube 영상 링크 등록</h2>
              <p className="text-sm text-pul-muted">무료 레슨과 내 채널에 함께 올리거나, 내 채널에만 공개할 수 있습니다.</p>
              <ShareLessonVideoForm instructorId={activeId} />
            </>
          ) : application?.status === "paused" ? (
            <p className="rounded-xl bg-white p-5">채널 공개가 중지된 상태입니다. 운영자 확인 뒤 다시 공개됩니다.</p>
          ) : (
            <section className="space-y-4 rounded-xl border border-pul-border bg-white p-5">
              <p className="text-sm text-pul-muted">교습가 채널은 유료 홍보 서비스입니다. 운영자가 채널 소유와 결제를 확인한 뒤 공개합니다. 회원은 채널과 영상 링크를 무료로 이용할 수 있습니다.</p>
              {application?.status === "pending" && <p role="status" className="text-sm font-bold text-pul-deep">확인 대기 중입니다. 신청 내용을 수정할 수 있습니다.</p>}
              {application?.status === "rejected" && <p role="status" className="text-sm font-bold text-pul-deep">신청이 승인되지 않았습니다. 내용을 수정해 다시 신청할 수 있습니다.</p>}
              <InstructorChannelForm action={applyInstructorChannelAction} buttonLabel={application?.status === "pending" ? "신청 내용 저장" : "홍보 신청"}>
                <label className="grid gap-1.5 font-semibold">교습가 활동명
                  <input name="instructorName" className={field} required maxLength={100} defaultValue={application?.instructor_name} />
                </label>
                <label className="grid gap-1.5 font-semibold">YouTube 채널명
                  <input name="channelName" className={field} required maxLength={120} defaultValue={application?.channel_name} />
                </label>
                <label className="grid gap-1.5 font-semibold">YouTube 채널 주소
                  <input name="channelUrl" className={field} type="url" placeholder="https://www.youtube.com/@채널" required maxLength={300} defaultValue={application?.channel_url} />
                </label>
                <label className="grid gap-1.5 font-semibold">채널 소개
                  <textarea name="introduction" className={field} required rows={4} minLength={2} maxLength={1000} defaultValue={application?.introduction} />
                </label>
              </InstructorChannelForm>
            </section>
          )}
      </Container>
    </main>
  );
}
