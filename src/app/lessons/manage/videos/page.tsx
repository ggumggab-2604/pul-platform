import Link from "next/link";
import { redirect } from "next/navigation";
import { LessonInstructorNamesForm } from "@/components/lessons/manage/LessonInstructorNamesForm";
import { Container } from "@/components/ui/Container";
import { getLessonVideoForManagement, LessonDirectoryError } from "@/lib/lessons/lessonDirectory";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { correctLessonVideoInstructorAction, renameLessonInstructorAction } from "./actions";

export default async function LessonVideoManagementPage({
  searchParams,
}: { searchParams: Promise<{ video?: string | string[] }> }) {
  const query = (await searchParams).video;
  const videoKey = typeof query === "string" ? query.trim() : "";
  const path = videoKey ? `/lessons/manage/videos?video=${encodeURIComponent(videoKey)}` : "/lessons/manage/videos";
  const context = await getAuthenticatedSupabaseContext();
  if (!context) redirect(`/login?next=${encodeURIComponent(path)}`);

  let video;
  try {
    video = await getLessonVideoForManagement(context.supabase, videoKey);
  } catch (error) {
    return (
      <Container className="px-3 py-8">
        <p role="alert">{error instanceof LessonDirectoryError ? error.userMessage : "운영 정보를 불러오지 못했습니다."}</p>
        <Link href="/manage" className="mt-3 inline-block font-semibold underline">운영 메뉴로 돌아가기</Link>
      </Container>
    );
  }

  return (
    <Container className="max-w-4xl space-y-5 px-3 py-8 pb-20">
      <Link href="/manage" className="text-sm font-semibold text-pul-deep underline">운영 메뉴</Link>
      <h1 className="text-2xl font-black text-foreground">레슨 영상·교습가 관리</h1>
      <form action="/lessons/manage/videos" className="flex flex-wrap items-end gap-2">
        <label className="grid flex-1 gap-1 text-sm font-semibold">
          영상 키
          <input name="video" required maxLength={64} defaultValue={videoKey} className="min-h-11 rounded-lg border border-pul-border bg-white px-3" />
        </label>
        <button type="submit" className="min-h-11 rounded-lg border border-pul-deep px-4 text-sm font-bold text-pul-deep">영상 찾기</button>
      </form>
      {videoKey && !video && <p role="status">해당 키의 영상을 찾을 수 없습니다.</p>}
      {video && (
        <>
          <p className="font-semibold text-foreground">{video.title}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {video.publicationStatus !== "removed" && (
              <LessonInstructorNamesForm
                title="이 영상의 교습가 정정"
                description="입력한 채널명과 활동명의 교습가에게 이 영상 한 편을 연결합니다."
                channelName={video.channelName}
                instructorName={video.instructorName}
                action={correctLessonVideoInstructorAction.bind(null, video.videoKey, video.version)}
                submitLabel="이 영상의 교습가 저장"
              />
            )}
            <LessonInstructorNamesForm
              title="교습가 프로필 이름 변경"
              description="같은 교습가의 프로필과 연결된 모든 영상에 새 이름을 표시합니다."
              channelName={video.channelName}
              instructorName={video.instructorName}
              action={renameLessonInstructorAction.bind(null, video.instructorId, video.channelName, video.instructorName)}
              submitLabel="프로필 이름 변경"
            />
          </div>
        </>
      )}
    </Container>
  );
}
