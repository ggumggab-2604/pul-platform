import { CourseDetailContent } from "@/components/courses/CourseDetailContent";
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

export default async function CourseDetailPage({ params }: CourseDetailPageProps) {
  const { id } = await params;
  const course = courseMapItems.find((item) => item.id === id);

  if (!course) {
    notFound();
  }

  return (
    <div className="bg-pul-page">
      <Container className="py-4 max-lg:px-3 lg:py-10">
        <Link
          href="/courses"
          className="text-sm font-medium text-pul-point hover:text-pul-deep max-lg:text-base"
        >
          ← 골프장 목록으로
        </Link>
        <div className="mt-4">
          <CourseDetailContent course={course} />
        </div>
      </Container>
    </div>
  );
}
