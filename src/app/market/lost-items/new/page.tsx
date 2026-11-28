import { notFound, redirect } from "next/navigation";
import { LostItemEditor } from "@/components/market/LostItemEditor";
import { contentRpc } from "@/lib/courses/courseContent";
import { getPublicCourse } from "@/lib/courses/courseDirectory";
import { readStories } from "@/lib/courses/courseSteward";
import { lostItemsPath, type LostItemCourse } from "@/lib/market/lostItems";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export default async function NewLostItemPage({ searchParams }: { searchParams: Promise<{ course?: string | string[]; post?: string | string[] }> }) {
  const { course, post } = await searchParams;
  const linked = course !== undefined || post !== undefined;
  const path = lostItemsPath + "/new";
  if (linked && (typeof course !== "string" || !/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(course) ||
    typeof post !== "string" || !/^[a-f0-9]{32}$/.test(post))) notFound();
  const auth = await getAuthenticatedSupabaseContext();
  if (!auth) redirect("/login?next=" + encodeURIComponent(path + (linked ? "?" + new URLSearchParams({ course: String(course), post: String(post) }) : "")));
  const now = new Date();
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(now);
  if (typeof course === "string" && typeof post === "string") {
    const [origin, venue] = await Promise.all([
      readStories(auth.supabase, course, { postKey: post }),
      getPublicCourse(auth.supabase, course),
    ]).catch(error => {
      if (["P0002", "notFound"].includes(error?.code)) notFound();
      throw error;
    });
    if (!origin.can_edit || origin.category !== "lost" || origin.lost_found_kind === "found") notFound();
    const resolved = origin.processing_status === "resolved";
    if (resolved && !origin.market_lost_id) redirect(`/courses/${course}/stories/${post}`);
    const publishAt = Date.parse(origin.created_at) + 48 * 60 * 60 * 1000;
    return <LostItemEditor today={today} courses={[]} source={{
      courseKey: course, courseName: venue.name, region: venue.region, postKey: post, version: origin.version,
      legacy: !origin.lost_found_kind, resolved, images: origin.images.map(image => image.id),
      details: origin.lost_details, settings: origin.lost_settings,
      publishAt: new Date(publishAt).toISOString(), alreadyDue: now.getTime() >= publishAt,
    }} />;
  }
  const courses = await contentRpc<LostItemCourse[]>(auth.supabase, "market_lost_courses", {});
  return <LostItemEditor today={today} courses={courses} />;
}
