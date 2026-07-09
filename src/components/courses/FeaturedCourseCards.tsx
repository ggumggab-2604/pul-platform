import type { GolfCourse } from "@/types";
import Image from "next/image";
import Link from "next/link";

type FeaturedCourseCardsProps = {
  courses: GolfCourse[];
};

export function FeaturedCourseCards({ courses }: FeaturedCourseCardsProps) {
  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">추천 · 인기 골프장</h2>
          <p className="mt-1 text-sm text-pul-muted">
            PUL 회원들이 많이 찾는 파크골프장입니다.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {courses.map((course) => (
          <article
            key={course.id}
            className="flex flex-col overflow-hidden rounded-xl border border-pul-border bg-white shadow-[0_2px_10px_rgba(6,78,59,0.06)] transition-shadow hover:shadow-[0_4px_16px_rgba(6,78,59,0.1)]"
          >
            <div className="relative h-36 bg-pul-light">
              <Image
                src="/images/banner-course.jpg"
                alt=""
                fill
                className="object-cover"
                sizes="(max-width: 640px) 100vw, 320px"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
              <span className="absolute left-3 top-3 rounded-md bg-pul-point px-2 py-0.5 text-xs font-bold text-white">
                {course.holes}홀
              </span>
            </div>

            <div className="flex flex-1 flex-col p-4">
              <p className="text-xs font-semibold text-pul-point">
                {course.region} · {course.district}
              </p>
              <h3 className="mt-1 line-clamp-2 text-base font-bold leading-snug text-foreground">
                {course.name}
              </h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {course.tags.slice(0, 2).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-md bg-pul-light px-2 py-0.5 text-xs font-medium text-pul-deep"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <Link
                href={`/courses/${course.id}`}
                className="mt-4 inline-flex h-10 items-center justify-center rounded-lg border border-pul-point/30 bg-pul-light text-sm font-bold text-pul-deep transition-colors hover:bg-pul-point hover:text-white"
              >
                자세히 보기
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
