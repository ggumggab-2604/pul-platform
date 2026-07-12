"use client";

import { Container } from "@/components/ui/Container";
import { Icon } from "@/components/ui/Icon";

type LessonsPageHeroProps = {
  onRegister?: () => void;
};

export function LessonsPageHero({ onRegister }: LessonsPageHeroProps) {
  return (
    <section className="relative overflow-hidden rounded-xl border border-emerald-200/60 bg-gradient-to-br from-pul-light via-white to-emerald-50 shadow-[0_4px_20px_rgba(6,78,59,0.08)]">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage: "url('/images/ad-academy.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/95 via-white/88 to-emerald-50/75"
        aria-hidden="true"
      />
      <Container className="relative px-4 py-4 sm:py-8 lg:py-10">
        <div className="flex max-w-3xl items-start gap-2.5 sm:gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-pul-deep to-pul-point text-white shadow-sm sm:h-14 sm:w-14">
            <Icon name="book" className="h-5 w-5 sm:h-7 sm:w-7" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-pul-point sm:text-sm">
              PUL Education
            </p>
            <h1 className="mt-0.5 text-xl font-bold tracking-tight text-pul-deep sm:mt-1 sm:text-3xl lg:text-4xl">
              레슨·교육
            </h1>
            <p className="mt-1 text-xs leading-snug text-pul-muted sm:mt-2 sm:text-lg sm:leading-relaxed">
              일반 회원·초보자·실력 향상 희망자를 위한 입문 가이드, 무료 영상, 유료
              레슨·교육 정보입니다. 자격증·심판 상세는 별도 메뉴에서 확인하세요.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={onRegister}
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-pul-point px-5 text-sm font-bold text-white hover:bg-pul-deep"
              >
                강습·교육 등록 문의
              </button>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
