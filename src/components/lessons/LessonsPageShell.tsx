"use client";

import { LessonsPageContent } from "@/components/lessons/LessonsPageContent";
import { LessonsPageHero } from "@/components/lessons/LessonsPageHero";
import { PromotionBanner } from "@/components/promotions/PromotionBanner";
import { Container } from "@/components/ui/Container";
import type {
  LessonDirectoryFilters,
  PublicLesson,
  PublicLessonPage,
  PublicLessonVideoPage,
} from "@/lib/lessons/lessonDirectory";
import type { ActiveSlotPromotion } from "@/lib/promotions/promotionDirectory";
import type { VideoLessonCategory } from "@/types";
import type {
  PublicUniversityDepartment,
  UniversityDirectoryPage,
  UniversityRegion,
} from "@/lib/lessons/universityDirectory";
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
  universityDepartmentPage: UniversityDirectoryPage<PublicUniversityDepartment>;
  universityDepartmentError: string | null;
  universityKeyword: string;
  universityRegion?: UniversityRegion;
  promotion: ActiveSlotPromotion | null;
  secondPromotion: ActiveSlotPromotion | null;
};

export function LessonsPageShell({ promotion, secondPromotion, ...contentProps }: LessonsPageShellProps) {
  const router = useRouter();
  const contentKey = [
    contentProps.isAuthenticated ? "authenticated" : "anonymous",
    contentProps.savedOnly ? "saved" : "all",
    contentProps.initialVideoCategory ?? "all",
    contentProps.videoPage.offset,
    contentProps.initialSavedVideoKeys.join(","),
    contentProps.universityKeyword,
    contentProps.universityRegion ?? "all",
  ].join(":");

  return (
    <div className="bg-pul-page">
      <Container className="px-2 sm:px-3">
        <LessonsPageHero onRegister={() => router.push("/lessons/submit?type=lesson")} />
      </Container>
      {promotion ? (
        <Container className="px-3 pt-3 lg:pt-5">
          <PromotionBanner promotion={promotion} variant="horizontal" />
        </Container>
      ) : null}
      <Container className="px-3 py-3 sm:py-4 lg:py-5">
        <LessonsPageContent key={contentKey} {...contentProps} />
      </Container>
      {secondPromotion ? (
        <Container className="px-3 pb-3 sm:pb-4 lg:pb-5">
          <PromotionBanner promotion={secondPromotion} variant="horizontal" />
        </Container>
      ) : null}
    </div>
  );
}
