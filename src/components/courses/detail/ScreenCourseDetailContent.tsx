import { CourseDirectoryDetailContent } from "@/components/courses/detail/CourseDirectoryDetailContent";
import type { PublicCourse } from "@/lib/courses/courseDirectory";
import type { CourseMediaSnapshot } from "@/lib/courses/courseMedia";

type ScreenCourseDetailContentProps = {
  course: PublicCourse;
  initialMedia: CourseMediaSnapshot;
};

export function ScreenCourseDetailContent({ course, initialMedia }: ScreenCourseDetailContentProps) {
  return (
    <CourseDirectoryDetailContent
      course={course}
      expectedType="screen"
      initialMedia={initialMedia}
    />
  );
}
