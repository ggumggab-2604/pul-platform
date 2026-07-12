import { CourseDetailContent } from "@/components/courses/CourseDetailContent";
import type { FieldCourseMapItem } from "@/data/courseMapData";

type FieldCourseDetailContentProps = {
  course: FieldCourseMapItem;
};

/** 승인된 실외 상세 조립기를 변경 없이 보호하는 필드 전용 경계입니다. */
export function FieldCourseDetailContent({ course }: FieldCourseDetailContentProps) {
  return <CourseDetailContent course={course} />;
}
