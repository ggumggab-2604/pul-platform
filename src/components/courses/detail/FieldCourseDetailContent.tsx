import { CourseDirectoryDetailContent } from "@/components/courses/detail/CourseDirectoryDetailContent";
import type { PublicCourse } from "@/lib/courses/courseDirectory";

type FieldCourseDetailContentProps = {
  course: PublicCourse;
};

export function FieldCourseDetailContent({ course }: FieldCourseDetailContentProps) {
  return <CourseDirectoryDetailContent course={course} expectedType="field" />;
}
