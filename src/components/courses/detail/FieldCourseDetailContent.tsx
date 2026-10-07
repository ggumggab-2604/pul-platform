import type { ReactNode } from "react";
import { CourseDirectoryDetailContent } from "@/components/courses/detail/CourseDirectoryDetailContent";
import type { PublicCourse } from "@/lib/courses/courseDirectory";
import type { CourseMediaSnapshot } from "@/lib/courses/courseMedia";
import type { PublicClub } from "@/lib/clubs/clubDirectory";

type FieldCourseDetailContentProps = {
  discussion?: ReactNode;
  course: PublicCourse;
  initialMedia: CourseMediaSnapshot;
  initialCourseClubs: PublicClub[];
};

export function FieldCourseDetailContent({
  discussion,
  course,
  initialMedia,
  initialCourseClubs,
}: FieldCourseDetailContentProps) {
  return (
    <CourseDirectoryDetailContent
      discussion={discussion}
      course={course}
      expectedType="field"
      initialMedia={initialMedia}
      initialCourseClubs={initialCourseClubs}
    />
  );
}
