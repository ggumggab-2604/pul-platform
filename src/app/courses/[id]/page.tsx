import { CourseDetailContent } from "@/components/courses/CourseDetailContent";
import { CourseBreadcrumb } from "@/components/courses/detail/courseDetailShared";
import { Container } from "@/components/ui/Container";
import { courseMapItems } from "@/data/courseMapData";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

type CourseDetailPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: CourseDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const course = courseMapItems.find((item) => item.id === id);
  if (!course) {
    return { title: "골프장 정보" };
  }
  return {
    title: course.name,
    description: course.description ?? `${course.region} ${course.name} 상세 정보`,
  };
}

export function generateStaticParams() {
  return courseMapItems.map((course) => ({ id: course.id }));
}

export default async function CourseDetailPage({ params }: CourseDetailPageProps) {
  const { id } = await params;
  const course = courseMapItems.find((item) => item.id === id);

  if (!course) {
    notFound();
  }

  return (
    <div className="course-detail-page bg-pul-page overflow-visible">
      <Container className="max-w-6xl py-4 max-lg:px-3 lg:py-8">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CourseBreadcrumb course={course} />
          <Link
            href="/courses"
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-pul-border bg-white px-4 text-sm font-bold text-pul-deep hover:bg-pul-light lg:text-base"
          >
            골프장 목록으로
          </Link>
        </div>
        <CourseDetailContent course={course} />
      </Container>
    </div>
  );
}
