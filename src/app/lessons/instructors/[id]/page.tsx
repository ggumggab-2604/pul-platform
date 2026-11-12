import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { writeInstructorChannelBoardAction } from "@/app/lessons/instructors/actions";
import { InstructorInterestButton } from "@/components/lessons/InstructorInterestButton";
import { InstructorChannelForm } from "@/components/lessons/instructors/InstructorChannelForm";
import { Container } from "@/components/ui/Container";
import { videoLessonCategories, videoLessonCategoryLabels } from "@/data/videoLessonData";
import { isLessonInstructorId } from "@/lib/lessons/lessonInstructorBookmarks";
import {
  instructorChannelApplyHref, instructorChannelDirectoryHref, instructorChannelHref,
  instructorChannelRpc, youtubeVideoId, type InstructorChannel,
} from "@/lib/lessons/lessonInstructorChannels";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

type Params = { category?: string; videos?: string; posts?: string };
const categories = videoLessonCategories.filter(({ value }) => value !== "cert_referee");
const boardInput = "min-h-20 w-full rounded-lg border border-pul-border px-3 py-2";

function pageNumber(input: string | undefined) {
  return Math.max(1, Math.min(10000, Number.parseInt(input ?? "", 10) || 1));
}

export default async function InstructorChannelPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<Params> }) {
  const [{ id }, search] = await Promise.all([params, searchParams]);
  if (!isLessonInstructorId(id)) notFound();

  const path = instructorChannelHref(id);
  const category = categories.find(({ value }) => value === search.category)?.value ?? "all";
  const videos = pageNumber(search.videos);
  const posts = pageNumber(search.posts);
  const client = await createClient();
  const [channel, auth] = await Promise.all([
    instructorChannelRpc<InstructorChannel | null>(client, "get_public_lesson_instructor_channel", {
      p_instructor_id: id, p_category: category === "all" ? null : category,
      p_video_offset: (videos - 1) * 24, p_post_offset: (posts - 1) * 20,
    }),
    client.auth.getClaims(),
  ]);
  if (!channel) notFound();
  const authenticated = !auth.error && Boolean(auth.data?.claims.sub);

  function channelLink(nextCategory: string, videoPage: number, postPage: number, anchor: string) {
    const query = new URLSearchParams();
    if (nextCategory !== "all") query.set("category", nextCategory);
    if (videoPage > 1) query.set("videos", String(videoPage));
    if (postPage > 1) query.set("posts", String(postPage));
    return `${path}${query.size ? `?${query}` : ""}#${anchor}`;
  }

  return (
    <main className="bg-pul-page">
      <Container className="max-w-6xl space-y-6 px-3 py-6 pb-24">
        <Link href={instructorChannelDirectoryHref} className="font-bold text-pul-deep underline">교습가 채널 목록</Link>
        <header className="space-y-3 rounded-xl border border-pul-border bg-white p-5 sm:p-7">
          <p className="text-sm font-semibold text-pul-muted">유료 홍보 채널 · {channel.channel_name}</p>
          <h1 className="text-3xl font-black">{channel.instructor_name}</h1>
          <p className="whitespace-pre-wrap break-words text-pul-muted">{channel.introduction}</p>
          <div className="flex flex-wrap items-center gap-3">
            <InstructorInterestButton instructorId={id} instructorName={channel.instructor_name} isSaved={channel.can_write} isAuthenticated={authenticated} readError={null} />
            <a href={channel.channel_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-bold text-pul-deep underline">YouTube 채널 열기</a>
            {channel.is_owner && <Link href={instructorChannelApplyHref} className="inline-flex min-h-11 items-center font-bold text-pul-deep underline">영상 링크 등록</Link>}
          </div>
        </header>

        <section id="videos" className="scroll-mt-4 space-y-4" aria-labelledby="channel-videos">
          <h2 id="channel-videos" className="text-xl font-black">레슨 영상</h2>
          <nav className="flex flex-wrap gap-2" aria-label="레슨 영상 카테고리">
            {categories.map(({ value, label }) => (
              <Link key={value} href={channelLink(value, 1, posts, "videos")} aria-current={value === category ? "page" : undefined}
                className={cn("inline-flex min-h-11 items-center rounded-full border px-3 text-sm font-bold",
                  value === category ? "border-pul-deep bg-pul-deep text-white" : "border-pul-border bg-white text-pul-deep")}>
                {label}
              </Link>
            ))}
          </nav>
          {channel.videos.length === 0 && <p className="rounded-xl border border-pul-border bg-white p-5 text-pul-muted">이 카테고리에 공개된 영상이 없습니다.</p>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {channel.videos.slice(0, 24).map((video) => {
              const youtubeId = youtubeVideoId(video.youtube_url);
              return (
                <article key={`${video.exclusive}-${video.key}`} className="overflow-hidden rounded-xl border border-pul-border bg-white">
                  <a href={video.youtube_url} target="_blank" rel="noopener noreferrer" className="block">
                    <div className="relative aspect-video bg-pul-deep">
                      {youtubeId && <Image unoptimized src={`https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`} alt="" fill sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-cover" />}
                      {video.exclusive && <span className="absolute left-2 top-2 rounded bg-pul-deep px-2 py-1 text-xs font-bold text-white">채널 단독 공개</span>}
                    </div>
                    <div className="space-y-1 p-4">
                      <p className="text-xs font-bold text-pul-deep">{videoLessonCategoryLabels[video.category]}</p>
                      <h3 className="break-words font-bold">{video.title}</h3>
                      <span className="text-sm text-pul-muted">YouTube에서 보기</span>
                    </div>
                  </a>
                </article>
              );
            })}
          </div>
          {(videos > 1 || channel.videos.length > 24) && (
            <nav aria-label="영상 페이지" className="flex gap-4 font-bold text-pul-deep">
              {videos > 1 && <Link href={channelLink(category, videos - 1, posts, "videos")}>이전 영상</Link>}
              {channel.videos.length > 24 && <Link href={channelLink(category, videos + 1, posts, "videos")}>다음 영상</Link>}
            </nav>
          )}
        </section>

        <section id="board" className="scroll-mt-4 space-y-4 rounded-xl border border-pul-border bg-white p-5" aria-labelledby="channel-board">
          <h2 id="channel-board" className="text-xl font-black">질문·소통 게시판</h2>
          {channel.is_owner || channel.can_write ? (
            <InstructorChannelForm action={writeInstructorChannelBoardAction.bind(null, id, crypto.randomUUID(), channel.is_owner ? "notice" : "question")} buttonLabel={channel.is_owner ? "공지 등록" : "질문 등록"}>
              <label className="grid gap-1 text-sm font-semibold">{channel.is_owner ? "공지 내용" : "질문 내용"}
                <textarea className={boardInput} name="body" minLength={2} maxLength={2000} required />
              </label>
            </InstructorChannelForm>
          ) : <p className="text-sm text-pul-muted">이 교습가를 관심 저장한 회원은 질문을 남길 수 있습니다.</p>}
          {channel.posts.length === 0 && <p className="text-sm text-pul-muted">아직 등록된 글이 없습니다.</p>}
          {channel.posts.slice(0, 20).map((post) => (
            <article key={post.id} className="space-y-2 border-t border-pul-border pt-3">
              <p className="text-sm font-bold text-pul-deep">{post.kind === "notice" ? "교습가 공지" : "회원 질문"}</p>
              <p className="whitespace-pre-wrap break-words">{post.body}</p>
              {post.reply && <div className="rounded-lg bg-pul-light p-3"><p className="text-sm font-bold text-pul-deep">교습가 답변</p><p className="mt-1 whitespace-pre-wrap break-words">{post.reply}</p></div>}
              {channel.is_owner && post.kind === "question" && (
                <details className="pt-1">
                  <summary className="mb-2 cursor-pointer text-sm font-semibold text-pul-deep">{post.reply ? "답변 수정" : "답변 쓰기"}</summary>
                  <InstructorChannelForm action={writeInstructorChannelBoardAction.bind(null, id, post.id, "reply")} buttonLabel="답변 저장">
                    <label className="grid gap-1 text-sm font-semibold">답변 내용
                      <textarea name="body" className={boardInput} defaultValue={post.reply ?? ""} minLength={2} maxLength={2000} required />
                    </label>
                  </InstructorChannelForm>
                </details>
              )}
            </article>
          ))}
          {(posts > 1 || channel.posts.length > 20) && (
            <nav aria-label="게시판 페이지" className="flex gap-4 font-bold text-pul-deep">
              {posts > 1 && <Link href={channelLink(category, videos, posts - 1, "board")}>이전 글</Link>}
              {channel.posts.length > 20 && <Link href={channelLink(category, videos, posts + 1, "board")}>다음 글</Link>}
            </nav>
          )}
        </section>
      </Container>
    </main>
  );
}
