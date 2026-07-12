import { Card } from "@/components/ui/Card";
import { courseTypeLabels, type CourseMapItem } from "@/data/courseMapData";
import Image from "next/image";
import Link from "next/link";

type RelatedCourseCardsProps = {
  courses: CourseMapItem[];
};

export function RelatedCourseCards({ courses }: RelatedCourseCardsProps) {
  if (courses.length === 0) return null;

  return (
    <Card title="관련 골프장 추천" dense>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
        {courses.slice(0, 4).map((course) => (
          <Link
            key={course.id}
            href={`/courses/${course.id}`}
            className="group overflow-hidden rounded-xl border border-pul-border/80 transition-shadow hover:shadow-[0_4px_16px_rgba(6,78,59,0.1)]"
          >
            <div className="relative h-28 bg-pul-light">
              <Image
                src="/images/banner-course.jpg"
                alt=""
                fill
                className="object-cover transition-transform group-hover:scale-105"
                sizes="280px"
              />
            </div>
            <div className="p-3">
              <span className="text-xs font-bold text-pul-point">
                {courseTypeLabels[course.type]}
              </span>
              <h3 className="mt-1 text-base font-bold text-foreground">{course.name}</h3>
              <p className="mt-0.5 text-sm text-pul-muted">
                {course.region} {course.city} · {course.holes}홀
              </p>
            </div>
          </Link>
        ))}
      </div>
      <Link
        href="/courses"
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-pul-border bg-white text-sm font-bold text-pul-deep hover:bg-pul-light lg:text-base"
      >
        같은 지역 골프장 목록
      </Link>
    </Card>
  );
}
