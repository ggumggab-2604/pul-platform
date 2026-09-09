import type { SupabaseClient } from "@supabase/supabase-js";
import { listPublicCourses } from "@/lib/courses/courseDirectory";
import { listPublicClubs } from "@/lib/clubs/clubDirectory";
import { listPublicNewsArticles } from "@/lib/news/newsDirectory";

export type PublicSearchSection = {
  label: string;
  href: string;
  items: { title: string; href: string; region: string }[];
  total: number;
  failed: boolean;
};

export async function searchPublicDirectories(
  client: SupabaseClient,
  input: string,
): Promise<PublicSearchSection[]> {
  const keyword = input.trim();
  if (!keyword || keyword.length > 100) return [];

  // Reuse public directory RPCs, including club eligibility, for every session.
  const results = await Promise.allSettled([
    listPublicCourses(client, { keyword }, 5, 0),
    listPublicClubs(client, { keyword }, 5, 0),
    listPublicNewsArticles(client, { keyword }, 5, 0),
  ]);
  const [courses, clubs, news] = results;
  const encoded = encodeURIComponent(keyword);

  return [
    {
      label: "골프장",
      href: `/courses?q=${encoded}`,
      items: courses.status === "fulfilled" ? courses.value.items.map((course) => ({
        title: course.name,
        href: `/courses/${encodeURIComponent(course.courseKey)}`,
        region: `${course.region} ${course.city}`.trim(),
      })) : [],
      total: courses.status === "fulfilled" ? courses.value.total : 0,
      failed: courses.status === "rejected",
    },
    {
      label: "공개 동호회",
      href: `/clubs?keyword=${encoded}`,
      items: clubs.status === "fulfilled" ? clubs.value.items.map((club) => ({
        title: club.name,
        href: `/clubs/${encodeURIComponent(club.publicKey)}`,
        region: club.regionLabel,
      })) : [],
      total: clubs.status === "fulfilled" ? clubs.value.total : 0,
      failed: clubs.status === "rejected",
    },
    {
      label: "뉴스",
      href: `/news?keyword=${encoded}`,
      items: news.status === "fulfilled" ? news.value.items.map((article) => ({
        title: article.title,
        href: `/news/${encodeURIComponent(article.newsKey)}`,
        region: article.region,
      })) : [],
      total: news.status === "fulfilled" ? news.value.total : 0,
      failed: news.status === "rejected",
    },
  ];
}
