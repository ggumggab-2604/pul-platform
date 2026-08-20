import { CourseDirectoryDetailContent } from "@/components/courses/detail/CourseDirectoryDetailContent";
import type { PublicCourse } from "@/lib/courses/courseDirectory";

type ScreenCourseDetailContentProps = {
  course: PublicCourse;
};

export function ScreenCourseDetailContent({ course }: ScreenCourseDetailContentProps) {
  return <CourseDirectoryDetailContent course={course} expectedType="screen" />;
}
