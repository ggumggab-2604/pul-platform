import { CourseDirectoryDetailContent } from "@/components/courses/detail/CourseDirectoryDetailContent";
import type { PublicCourse } from "@/lib/courses/courseDirectory";
import type { CourseMediaSnapshot } from "@/lib/courses/courseMedia";
import type { PublicClub } from "@/lib/clubs/clubDirectory";

type FieldCourseDetailContentProps = {
  course: PublicCourse;
  initialMedia: CourseMediaSnapshot;
  initialCourseClubs: PublicClub[];
};

export function FieldCourseDetailContent({
  course,
  initialMedia,
  initialCourseClubs,
}: FieldCourseDetailContentProps) {
  return (
    <CourseDirectoryDetailContent
      course={course}
      expectedType="field"
      initialMedia={initialMedia}
      initialCourseClubs={initialCourseClubs}
    />
  );
}
