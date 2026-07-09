import { Icon } from "@/components/ui/Icon";
import type { GolfCourse } from "@/types";
import Image from "next/image";
import Link from "next/link";

type CourseListProps = {
  courses: GolfCourse[];
};

export function CourseList({ courses }: CourseListProps) {
  if (courses.length === 0) {
    return (
      <section className="rounded-xl border border-dashed border-pul-border bg-white px-6 py-14 text-center">
        <Icon name="search" className="mx-auto h-10 w-10 text-pul-muted/50" />
        <p className="mt-3 text-base font-semibold text-foreground">
          조건에 맞는 골프장이 없습니다.
        </p>
        <p className="mt-1 text-sm text-pul-muted">
          지역이나 검색어를 변경해 다시 검색해 보세요.
        </p>
      </section>
    );
  }

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-xl font-bold text-foreground">골프장 목록</h2>
        <p className="mt-1 text-sm text-pul-muted">
          전국 파크골프장 기본 정보를 확인할 수 있습니다.
        </p>
      </div>

      <ul className="grid grid-cols-1 gap-4">
        {courses.map((course) => (
          <li key={course.id}>
            <article className="overflow-hidden rounded-xl border border-pul-border bg-white shadow-[0_2px_10px_rgba(6,78,59,0.06)]">
              <div className="flex flex-col sm:flex-row">
                <div className="relative h-44 shrink-0 sm:min-h-[200px] sm:w-52">
                  <Image
                    src="/images/banner-course.jpg"
                    alt=""
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 100vw, 208px"
                  />
                  <span className="absolute left-3 top-3 rounded-md bg-pul-deep/90 px-2 py-0.5 text-xs font-bold text-white">
                    {course.holes}홀
                  </span>
                </div>

                <div className="flex min-w-0 flex-1 flex-col p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-pul-point">
                        {course.region} · {course.district}
                      </p>
                      <h3 className="mt-0.5 text-lg font-bold text-foreground">
                        {course.name}
                      </h3>
                    </div>
                    <span
                      className={
                        course.reservable
                          ? "rounded-full bg-pul-light px-2.5 py-1 text-xs font-bold text-pul-deep"
                          : "rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-pul-muted"
                      }
                    >
                      {course.reservable ? "예약 가능" : "현장 이용"}
                    </span>
                  </div>

                  <p className="mt-2 text-sm text-pul-muted">{course.address}</p>

                  <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                    <div className="flex gap-2">
                      <dt className="shrink-0 font-medium text-foreground">운영</dt>
                      <dd className="text-pul-muted">{course.operatingHours}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="shrink-0 font-medium text-foreground">문의</dt>
                      <dd className="text-pul-muted">{course.phone}</dd>
                    </div>
                  </dl>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {course.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-md bg-pul-light px-2 py-0.5 text-xs font-medium text-pul-deep"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Link
                      href={`/courses/${course.id}`}
                      className="inline-flex h-11 items-center justify-center rounded-lg bg-pul-point px-5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-pul-deep"
                    >
                      자세히 보기
                    </Link>
                    <a
                      href={`tel:${course.phone.replace(/-/g, "")}`}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-pul-border px-4 text-sm font-medium text-pul-muted transition-colors hover:border-pul-point/40 hover:text-pul-deep"
                    >
                      <Icon name="phone" className="h-4 w-4" />
                      전화 문의
                    </a>
                  </div>
                </div>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}
