import type { SupabaseClient } from "@supabase/supabase-js";
import type { VideoLessonCategory } from "@/types";

export const instructorChannelDirectoryHref = "/lessons?tab=instructor-promotion";
export const instructorChannelApplyHref = "/lessons/instructors/apply";
export const instructorChannelManageHref = "/lessons/manage/instructors";
export const instructorChannelHref = (id: string) => `/lessons/instructors/${id}`;

export type InstructorChannelApplication = {
  id: string;
  instructor_id: string | null;
  instructor_name: string;
  channel_name: string;
  channel_url: string;
  introduction: string;
  status: "pending" | "active" | "rejected" | "paused";
  review_version: number;
};

export type InstructorChannelReview = InstructorChannelApplication & {
  existing_instructors: {
    id: string;
    channel_name: string;
    instructor_name: string;
    linked_to_other: boolean;
    videos: { video_key: string; title: string; youtube_channel_url: string | null }[];
  }[];
};

export type InstructorChannelSummary = {
  instructor_id: string;
  instructor_name: string;
  channel_name: string;
  introduction: string;
};

export type InstructorChannel = InstructorChannelSummary & {
  channel_url: string;
  is_owner: boolean;
  can_write: boolean;
  videos: {
    key: string;
    title: string;
    category: Exclude<VideoLessonCategory, "all">;
    youtube_url: string;
    exclusive: boolean;
  }[];
  posts: {
    id: string;
    kind: "notice" | "question";
    body: string;
    reply: string | null;
    created_at: string;
  }[];
};

export async function instructorChannelRpc<T>(
  client: SupabaseClient,
  name: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw error;
  return data as T;
}

export function youtubeChannelUrl(input: string) {
  try {
    const url = new URL(input);
    if (
      url.protocol !== "https:" || url.username || url.password || url.port
      || !["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname)
    ) return null;
    const path = url.pathname.replace(/\/$/, "");
    if (!/^\/(?:@[^/?#\s]+|channel\/UC[A-Za-z0-9_-]{22})$/.test(path)) return null;
    const canonical = `https://www.youtube.com${path.startsWith("/@") ? path.toLowerCase() : path}`;
    return canonical.length <= 300 ? canonical : null;
  } catch {
    return null;
  }
}

export function youtubeVideoId(input: string) {
  if (input.length > 500) return null;
  try {
    const url = new URL(input);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    const path = url.pathname.split("/");
    let id: string | null = null;
    if (url.hostname === "youtu.be" && path.length === 2) id = path[1];
    if (["www.youtube.com", "youtube.com", "m.youtube.com"].includes(url.hostname)) {
      if (url.pathname === "/watch") id = url.searchParams.get("v");
      else if (path.length === 3 && ["shorts", "live", "embed"].includes(path[1])) id = path[2];
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}
