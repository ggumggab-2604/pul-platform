import { FieldCourseDetailContent } from "@/components/courses/detail/FieldCourseDetailContent";
import { ScreenCourseDetailContent } from "@/components/courses/detail/ScreenCourseDetailContent";
import { Container } from "@/components/ui/Container";
import { CourseDirectoryError, getPublicCourse } from "@/lib/courses/courseDirectory";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

type CourseDetailPageProps = {
  params: Promise<{ id: string }>;
};

const getCourseByKey = cache(async (courseKey: string) =>
  getPublicCourse(await createClient(), courseKey),
);

export async function generateMetadata({
  params,
}: CourseDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const course = await getCourseByKey(id);
    return {
      title: course.name,
      description: course.description,
    };
  } catch {
    return { title: "골프장 정보" };
  }
}

export default async function CourseDetailPage({ params }: CourseDetailPageProps) {
  const { id } = await params;
  let course;
  try {
    course = await getCourseByKey(id);
  } catch (error) {
    if (error instanceof CourseDirectoryError && error.code === "notFound") notFound();
    throw error;
  }

  const detailContent = course.courseType === "screen" ? (
    <ScreenCourseDetailContent course={course} />
  ) : (
    <FieldCourseDetailContent course={course} />
  );

  return (
    <div className="course-detail-page bg-pul-page overflow-visible">
      <Container className="max-w-6xl py-4 max-lg:px-3 lg:py-8">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <nav aria-label="경로" className="flex flex-wrap items-center gap-1.5 text-sm text-pul-muted lg:text-base">
            <Link href="/" className="font-medium hover:text-pul-point">홈</Link>
            <span aria-hidden="true">›</span>
            <Link href="/courses" className="font-medium hover:text-pul-point">골프장</Link>
            <span aria-hidden="true">›</span>
            <span className="font-medium text-pul-deep">{course.region}</span>
            <span aria-hidden="true">›</span>
            <span className="font-semibold text-foreground">{course.name}</span>
          </nav>
          <Link
            href="/courses"
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-pul-border bg-white px-4 text-sm font-bold text-pul-deep hover:bg-pul-light lg:text-base"
          >
            골프장 목록으로
          </Link>
        </div>
        {detailContent}
      </Container>
    </div>
  );
}
