"use client";

import { LessonsPageContent } from "@/components/lessons/LessonsPageContent";
import { LessonsPageHero } from "@/components/lessons/LessonsPageHero";
import { Container } from "@/components/ui/Container";
import type {
  LessonDirectoryFilters,
  PublicLesson,
  PublicLessonPage,
  PublicLessonVideoPage,
} from "@/lib/lessons/lessonDirectory";
import type { VideoLessonCategory } from "@/types";
import { useRouter } from "next/navigation";

type LessonsPageShellProps = {
  lessonPage: PublicLessonPage;
  featuredLessons: PublicLesson[];
  videoPage: PublicLessonVideoPage;
  isAuthenticated: boolean;
  savedOnly: boolean;
  initialSavedVideoKeys: string[];
  initialFilters: LessonDirectoryFilters;
  initialVideoCategory?: VideoLessonCategory;
  lessonError: string | null;
  videoError: string | null;
  bookmarkError: string | null;
};

export function LessonsPageShell(props: LessonsPageShellProps) {
  const router = useRouter();
  const contentKey = [
    props.isAuthenticated ? "authenticated" : "anonymous",
    props.savedOnly ? "saved" : "all",
    props.initialVideoCategory ?? "all",
    props.videoPage.offset,
    props.initialSavedVideoKeys.join(","),
  ].join(":");

  return (
    <div className="bg-pul-page">
      <Container className="px-2 sm:px-3">
        <LessonsPageHero onRegister={() => router.push("/lessons/submit?type=lesson")} />
      </Container>
      <Container className="px-3 py-3 sm:py-4 lg:py-5">
        <LessonsPageContent key={contentKey} {...props} />
      </Container>
    </div>
  );
}
