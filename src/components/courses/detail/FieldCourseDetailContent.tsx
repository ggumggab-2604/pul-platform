import { CourseDirectoryDetailContent } from "@/components/courses/detail/CourseDirectoryDetailContent";
import type { PublicCourse } from "@/lib/courses/courseDirectory";
import type { CourseMediaSnapshot } from "@/lib/courses/courseMedia";

type FieldCourseDetailContentProps = {
  course: PublicCourse;
  initialMedia: CourseMediaSnapshot;
};

export function FieldCourseDetailContent({ course, initialMedia }: FieldCourseDetailContentProps) {
  return (
    <CourseDirectoryDetailContent
      course={course}
      expectedType="field"
      initialMedia={initialMedia}
    />
  );
}
