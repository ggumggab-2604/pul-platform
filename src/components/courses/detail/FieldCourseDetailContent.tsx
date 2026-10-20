import type {CourseOperatorSnapshot} from "@/lib/courses/courseOperatorImages";
import type {CourseOverview} from "@/lib/courses/courseContent";
import type { ReactNode } from "react";
import type { CourseStory } from "@/lib/courses/courseSteward";
import { CourseDirectoryDetailContent } from "@/components/courses/detail/CourseDirectoryDetailContent";
import type { PublicCourse } from "@/lib/courses/courseDirectory";
import type { CourseMediaSnapshot } from "@/lib/courses/courseMedia";
import type { PublicClub } from "@/lib/clubs/clubDirectory";

type FieldCourseDetailContentProps = {
  overview: CourseOverview;
  operatorImages: CourseOperatorSnapshot;
  discussion?: ReactNode;
  pinnedNotice?: CourseStory;
  course: PublicCourse;
  initialMedia: CourseMediaSnapshot;
  initialCourseClubs: PublicClub[];
};

export function FieldCourseDetailContent({
  overview,
  operatorImages,
  discussion,
  pinnedNotice,
  course,
  initialMedia,
  initialCourseClubs,
}: FieldCourseDetailContentProps) {
  return (
    <CourseDirectoryDetailContent
      overview={overview}
      operatorImages={operatorImages}
      discussion={discussion}
      pinnedNotice={pinnedNotice}
      course={course}
      expectedType="field"
      initialMedia={initialMedia}
      initialCourseClubs={initialCourseClubs}
    />
  );
}
