"use client";

import { Container } from "@/components/ui/Container";
import { Icon } from "@/components/ui/Icon";
import { CoursePageActions } from "@/components/courses/CoursePageActions";

type CoursePageHeroProps = {
  onReport?: () => void;
};

export function CoursePageHero({ onReport }: CoursePageHeroProps) {
  return (
    <section className="relative overflow-hidden rounded-xl border border-emerald-200/60 bg-gradient-to-br from-pul-light via-white to-emerald-50 shadow-[0_4px_20px_rgba(6,78,59,0.08)]">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: "url('/images/banner-course.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/95 via-white/88 to-emerald-50/75"
        aria-hidden="true"
      />
      <Container className="relative px-4 py-6 sm:py-8 lg:py-12">
        <div className="flex max-w-2xl items-start gap-4">
          <div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-pul-deep to-pul-point text-white shadow-sm sm:flex">
            <Icon name="flag" className="h-7 w-7" />
          </div>
          <div>
            <p className="text-sm font-semibold text-pul-point">PUL Course Finder</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-pul-deep sm:text-3xl lg:text-4xl">
              골프장
            </h1>
            <p className="mt-2 text-base text-pul-muted sm:text-lg">
              실제 필드 파크골프장과 스크린 파크골프장을 구분해 찾아보세요.
            </p>
            <p className="mt-1 text-sm text-pul-muted">
              지도·목록 보기, 예약 가능·전화 문의·현장 접수 필터로 확인할 수 있습니다.
            </p>
            <CoursePageActions onReport={onReport} />
          </div>
        </div>
      </Container>
    </section>
  );
}
