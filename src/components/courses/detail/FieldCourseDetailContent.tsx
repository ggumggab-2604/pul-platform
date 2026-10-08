import type {CourseOperatorSnapshot} from "@/lib/courses/courseOperatorImages";
import type {CourseOverview} from "@/lib/courses/courseContent";
import type { ReactNode } from "react";
import { CourseDirectoryDetailContent } from "@/components/courses/detail/CourseDirectoryDetailContent";
import type { PublicCourse } from "@/lib/courses/courseDirectory";
import type { CourseMediaSnapshot } from "@/lib/courses/courseMedia";
import type { PublicClub } from "@/lib/clubs/clubDirectory";

type FieldCourseDetailContentProps = {
  overview: CourseOverview;
  operatorImages: CourseOperatorSnapshot;
  discussion?: ReactNode;
  course: PublicCourse;
  initialMedia: CourseMediaSnapshot;
  initialCourseClubs: PublicClub[];
};

export function FieldCourseDetailContent({
  overview,
  operatorImages,
  discussion,
  course,
  initialMedia,
  initialCourseClubs,
}: FieldCourseDetailContentProps) {
  return (
    <CourseDirectoryDetailContent
      overview={overview}
      operatorImages={operatorImages}
      discussion={discussion}
      course={course}
      expectedType="field"
      initialMedia={initialMedia}
      initialCourseClubs={initialCourseClubs}
    />
  );
}
