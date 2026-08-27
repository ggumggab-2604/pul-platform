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
import {
  LessonVideoBookmarkError,
  listMyLessonVideoBookmarks,
} from "@/lib/lessons/lessonVideoBookmarks";
import { findPromotionForSlot } from "@/lib/promotions/promotionRuntime";
import { loadActivePromotionsForSlots } from "@/lib/promotions/promotionRuntime.server";
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
import { redirect } from "next/navigation";

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

function bookmarkMessage(reason: unknown) {
  return reason instanceof LessonVideoBookmarkError
    ? reason.userMessage
    : "관심 영상을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

function nextPath(params: Record<string, string | string[] | undefined>) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const selected = first(value);
    if (selected) next.set(key, selected);
  }
  next.set("tab", "free-videos");
  next.set("saved", "1");
  return `/lessons?${next.toString()}`;
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
  const savedOnly = first(params.saved) === "1";
  const client = await createClient();
  const promotionPromise = loadActivePromotionsForSlots(client, ["lessons.top.01", "lessons.after_content.01"]);
  const lessonsPromise = listPublicLessons(client, filters, 24, (pageNumber - 1) * 24);
  const featuredPromise = listFeaturedPublicLessons(client, 4);
  const publicVideosPromise = savedOnly
    ? null
    : listPublicLessonVideos(client, videoCategory, 24, (videoPageNumber - 1) * 24);
  const [authResult] = await Promise.allSettled([client.auth.getClaims()]);
  const isAuthenticated = authResult.status === "fulfilled"
    && !authResult.value.error
    && typeof authResult.value.data?.claims?.sub === "string";

  if (savedOnly && !isAuthenticated) {
    redirect(`/login?next=${encodeURIComponent(nextPath(params))}`);
  }

  const [lessonsResult, featuredResult, videosResult] = await Promise.allSettled([
    lessonsPromise,
    featuredPromise,
    savedOnly
      ? listMyLessonVideoBookmarks(client, null, videoCategory, 24, (videoPageNumber - 1) * 24)
      : publicVideosPromise!,
  ]);
  let initialSavedVideoKeys: string[] = [];
  let bookmarkError: string | null = null;

  if (savedOnly && videosResult.status === "fulfilled") {
    initialSavedVideoKeys = videosResult.value.items.map((video) => video.videoKey);
  } else if (savedOnly && videosResult.status === "rejected") {
    bookmarkError = bookmarkMessage(videosResult.reason);
  } else if (isAuthenticated && videosResult.status === "fulfilled" && videosResult.value.items.length > 0) {
    try {
      const bookmarks = await listMyLessonVideoBookmarks(
        client,
        videosResult.value.items.map((video) => video.videoKey),
        undefined,
        50,
        0,
      );
      initialSavedVideoKeys = bookmarks.items.map((video) => video.videoKey);
    } catch (reason) {
      bookmarkError = bookmarkMessage(reason);
    }
  }

  const promotions = await promotionPromise;

  return (
    <LessonsPageShell
      key={JSON.stringify(params)}
      lessonPage={lessonsResult.status === "fulfilled" ? lessonsResult.value : { ...emptyLessons, offset: (pageNumber - 1) * 24 }}
      featuredLessons={featuredResult.status === "fulfilled" ? featuredResult.value : []}
      videoPage={videosResult.status === "fulfilled" ? videosResult.value : { ...emptyVideos, offset: (videoPageNumber - 1) * 24 }}
      isAuthenticated={isAuthenticated}
      savedOnly={savedOnly}
      initialSavedVideoKeys={initialSavedVideoKeys}
      initialFilters={filters}
      initialVideoCategory={videoCategory}
      lessonError={lessonsResult.status === "rejected" ? message(lessonsResult.reason) : null}
      videoError={savedOnly ? null : videosResult.status === "rejected" ? message(videosResult.reason) : null}
      bookmarkError={bookmarkError}
      promotion={findPromotionForSlot(promotions, "lessons.top.01")}
      secondPromotion={findPromotionForSlot(promotions, "lessons.after_content.01")}
    />
  );
}
