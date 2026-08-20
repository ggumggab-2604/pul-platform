import { LessonsPageShell } from "@/components/lessons/LessonsPageShell";
import {
  LessonDirectoryError,
  listFeaturedPublicLessons,
  listPublicLessons,
  listPublicLessonVideos,
  type LessonDirectoryFilters,
  type PublicLessonPage,
  type PublicLessonVideoPage,
} from "@/lib/lessons/lessonDirectory";
import { createClient } from "@/lib/supabase/server";
import type {
  LessonFormat,
  LessonRegion,
  LessonScheduleTag,
  LessonTarget,
  LessonType,
  VideoLessonCategory,
} from "@/types";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "레슨·교육",
  description:
    "파크골프를 처음 시작하는 분부터 기존 골프 경험자까지, 입문 가이드와 무료 영상 강의, 유료 레슨 정보를 한곳에서 확인하세요.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const emptyLessons: PublicLessonPage = {
  items: [],
  total: 0,
  limit: 24,
  offset: 0,
  hasMore: false,
};

const emptyVideos: PublicLessonVideoPage = {
  items: [],
  total: 0,
  limit: 24,
  offset: 0,
  hasMore: false,
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function positivePage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function message(reason: unknown) {
  return reason instanceof LessonDirectoryError
    ? reason.userMessage
    : "레슨·교육 정보를 불러오지 못했습니다.";
}

export default async function LessonsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const pageNumber = positivePage(first(params.page));
  const videoPageNumber = positivePage(first(params.videoPage));
  const filters: LessonDirectoryFilters = {
    keyword: first(params.keyword),
    type: first(params.type) as LessonType | undefined,
    region: first(params.region) as LessonRegion | undefined,
    format: first(params.format) as LessonFormat | undefined,
    target: first(params.target) as LessonTarget | undefined,
    schedule: first(params.schedule) as LessonScheduleTag | undefined,
  };
  const videoCategory = first(params.videoCategory) as VideoLessonCategory | undefined;
  const client = await createClient();
  const [lessonsResult, featuredResult, videosResult] = await Promise.allSettled([
    listPublicLessons(client, filters, 24, (pageNumber - 1) * 24),
    listFeaturedPublicLessons(client, 4),
    listPublicLessonVideos(client, videoCategory, 24, (videoPageNumber - 1) * 24),
  ]);

  return (
    <LessonsPageShell
      key={JSON.stringify(params)}
      lessonPage={lessonsResult.status === "fulfilled" ? lessonsResult.value : { ...emptyLessons, offset: (pageNumber - 1) * 24 }}
      featuredLessons={featuredResult.status === "fulfilled" ? featuredResult.value : []}
      videoPage={videosResult.status === "fulfilled" ? videosResult.value : { ...emptyVideos, offset: (videoPageNumber - 1) * 24 }}
      initialFilters={filters}
      initialVideoCategory={videoCategory}
      lessonError={lessonsResult.status === "rejected" ? message(lessonsResult.reason) : null}
      videoError={videosResult.status === "rejected" ? message(videosResult.reason) : null}
    />
  );
}
