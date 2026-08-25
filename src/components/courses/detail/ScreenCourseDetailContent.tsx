import { CourseDirectoryDetailContent } from "@/components/courses/detail/CourseDirectoryDetailContent";
import type { PublicCourse } from "@/lib/courses/courseDirectory";
import type { CourseMediaSnapshot } from "@/lib/courses/courseMedia";
import type { PublicClub } from "@/lib/clubs/clubDirectory";

type ScreenCourseDetailContentProps = {
  course: PublicCourse;
  initialMedia: CourseMediaSnapshot;
  initialCourseClubs: PublicClub[];
};

export function ScreenCourseDetailContent({
  course,
  initialMedia,
  initialCourseClubs,
}: ScreenCourseDetailContentProps) {
  return (
    <CourseDirectoryDetailContent
      course={course}
      expectedType="screen"
      initialMedia={initialMedia}
      initialCourseClubs={initialCourseClubs}
    />
  );
}
