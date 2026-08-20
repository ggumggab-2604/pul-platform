"use client";

import { Container } from "@/components/ui/Container";
import { Icon } from "@/components/ui/Icon";
import Link from "next/link";

export function CertificationPageHero() {
  return (
    <section className="relative overflow-hidden rounded-xl border border-amber-200/60 bg-gradient-to-br from-amber-50 via-white to-pul-light shadow-[0_4px_20px_rgba(6,78,59,0.08)]">
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/95 via-white/90 to-amber-50/70"
        aria-hidden="true"
      />
      <Container className="relative px-4 py-4 sm:py-8 lg:py-10">
        <div className="flex max-w-3xl items-start gap-2.5 sm:gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-600 to-pul-point text-white shadow-sm sm:h-14 sm:w-14">
            <Icon name="badge" className="h-5 w-5 sm:h-7 sm:w-7" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-pul-point sm:text-sm">
              PUL Qualification Center
            </p>
            <h1 className="mt-0.5 text-xl font-bold tracking-tight text-pul-deep sm:mt-1 sm:text-3xl lg:text-4xl">
              자격증·심판
            </h1>
            <p className="mt-1 text-xs leading-snug text-pul-muted sm:mt-2 sm:text-lg sm:leading-relaxed">
              지도자·심판·운영요원 관심자를 위한 자격증 안내, 시험 일정, 구인구직 정보를
              확인하세요.
            </p>
            <p className="mt-2 rounded-lg border border-amber-200/60 bg-amber-50/80 px-2.5 py-2 text-[11px] font-medium leading-snug text-amber-900 sm:mt-3 sm:px-3 sm:py-2.5 sm:text-sm">
              시험 일정, 응시 조건, 준비물, 주관기관 정보는 변경될 수 있으므로 공식 공지를
              반드시 함께 확인하세요.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Link
                href="/certification?tab=activity"
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-pul-point px-5 text-sm font-bold text-white hover:bg-pul-deep"
              >
                구인정보 확인하기
              </Link>
              <Link
                href="/events"
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-pul-border bg-white px-5 text-sm font-bold text-pul-deep hover:bg-pul-light"
              >
                대회·이벤트 구인 연결
              </Link>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
