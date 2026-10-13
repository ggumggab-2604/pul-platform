import "server-only";
import {readStories,storyTitle} from "@/lib/courses/courseSteward";
import {contentRpc,type CourseNotice} from "@/lib/courses/courseContent";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { getCourseBroadcastSource, previewCourseBroadcast, MessagingError } from "@/lib/messaging/messaging";
import { messageButton } from "@/lib/messaging/messagingUi";
import { MessagingSessionBoundary } from "./MessagingSessionBoundary";
import { MessageFailure } from "./MessagingViews";
import { CourseBroadcastComposer } from "./CourseBroadcastComposer";

async function load<T>(work: () => Promise<T>) {
  try { return { ok: true as const, data: await work() }; }
  catch (error) { return { ok: false as const, error: error instanceof MessagingError ? error : new MessagingError("unknown") }; }
}

export async function CourseBroadcastEntry({ courseKey }: { courseKey: string }) {
  const c = await getAuthenticatedSupabaseContext();
  if (!c) return null;
  const result = await load(() => getCourseBroadcastSource(c.supabase, courseKey));
  if (!result.ok) return null; // No grant/source/count disclosure on the public detail.
  return <MessagingSessionBoundary key={c.userId} viewerId={c.userId}>
    <Link prefetch={false} href={`/courses/${encodeURIComponent(result.data.courseKey)}/messages/new`} className={messageButton}>운영공지 보내기</Link>
  </MessagingSessionBoundary>;
}

export async function CourseBroadcastNewPage({ params,searchParams }: { params: Promise<{ id: string }>;searchParams?:Promise<{story?:string;notice?:string}> }) {
  const { id } = await params;const q=await searchParams;
  const path = `/courses/${encodeURIComponent(id)}/messages/new`;
  const c = await getAuthenticatedSupabaseContext();
  if (!c) redirect(`/login?next=${encodeURIComponent(path)}`);
  const result = await load(async () => {
    const source = await getCourseBroadcastSource(c.supabase, id);
    const preview = await previewCourseBroadcast(c.supabase, source.courseId);
    let initialBody="";if(q?.story){const p=await readStories(c.supabase,id,{postKey:q.story});if(!p.pinned)throw new MessagingError("permission");initialBody="[운영공지] "+storyTitle(p)+"\n"+p.body;}else if(q?.notice){const page=await contentRpc<{items:CourseNotice[]}>(c.supabase,"course_content_notices",{p_course_key:id,p_limit:30,p_offset:0});const n=page.items.find(n=>n.id===q.notice);if(!n)throw new MessagingError("permission");initialBody="[운영공지] "+n.title+"\n"+n.body;}
    return { source, preview,initialBody };
  });
  const content = result.ok
    ? <MessagingSessionBoundary key={`${c.userId}:${result.data.source.courseId}`} viewerId={c.userId}>
      <CourseBroadcastComposer key={result.data.source.courseId} viewerId={c.userId} source={result.data.source} initialPreview={result.data.preview} initialBody={result.data.initialBody} />
    </MessagingSessionBoundary>
    : <MessageFailure message={result.error.message} />;
  return <main className="min-h-[60vh] bg-pul-page px-3 py-6 sm:py-10"><div className="mx-auto max-w-3xl space-y-5">
    <nav aria-label="장소 운영공지" className="flex flex-wrap gap-2"><Link prefetch={false} href={`/courses/${encodeURIComponent(id)}`} className={messageButton}>장소 상세</Link><Link prefetch={false} href="/messages/sent" className={messageButton}>보낸 쪽지</Link></nav>
    {content}
  </div></main>;
}
