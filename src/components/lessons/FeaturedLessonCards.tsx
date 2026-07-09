import { LessonCard } from "@/components/lessons/LessonCard";
import type { ParkGolfLesson } from "@/types";

type FeaturedLessonCardsProps = {
  lessons: ParkGolfLesson[];
  onInquiry: (lesson: ParkGolfLesson) => void;
  onDetail: (lesson: ParkGolfLesson) => void;
  mobileVisibleCount?: number;
};

export function FeaturedLessonCards({
  lessons,
  onInquiry,
  onDetail,
  mobileVisibleCount = 3,
}: FeaturedLessonCardsProps) {
  return (
    <section>
      <div className="mb-3 lg:mb-4">
        <h2 className="text-lg font-bold text-foreground lg:text-xl">추천 유료 레슨·교육</h2>
        <p className="mt-0.5 text-xs text-pul-muted lg:mt-1 lg:text-sm">
          PUL에서 추천하는 파크골프 교육 프로그램입니다.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-4 lg:gap-4">
        {lessons.slice(0, 4).map((lesson, index) => (
          <div
            key={lesson.id}
            className={index >= mobileVisibleCount ? "hidden lg:block" : undefined}
          >
            <LessonCard
              lesson={lesson}
              onInquiry={onInquiry}
              onDetail={onDetail}
              featured
            />
          </div>
        ))}
      </div>
    </section>
  );
}
