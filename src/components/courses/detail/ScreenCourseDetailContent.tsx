import type { ReactNode } from "react";
import { CourseDirectoryDetailContent } from "@/components/courses/detail/CourseDirectoryDetailContent";
import type { PublicCourse } from "@/lib/courses/courseDirectory";
import type { CourseMediaSnapshot } from "@/lib/courses/courseMedia";
import type { PublicClub } from "@/lib/clubs/clubDirectory";

type ScreenCourseDetailContentProps = {
  discussion?: ReactNode;
  course: PublicCourse;
  initialMedia: CourseMediaSnapshot;
  initialCourseClubs: PublicClub[];
};

export function ScreenCourseDetailContent({
  discussion,
  course,
  initialMedia,
  initialCourseClubs,
}: ScreenCourseDetailContentProps) {
  return (
    <CourseDirectoryDetailContent
      discussion={discussion}
      course={course}
      expectedType="screen"
      initialMedia={initialMedia}
      initialCourseClubs={initialCourseClubs}
    />
  );
}
