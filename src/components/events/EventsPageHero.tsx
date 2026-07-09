"use client";

import { EVENTS_PAGE_COPY } from "@/data/eventsData";
import { Container } from "@/components/ui/Container";
import { Icon } from "@/components/ui/Icon";

type EventsPageHeroProps = {
  onRegisterInquiry?: () => void;
  onParticipationGuide?: () => void;
};

export function EventsPageHero({ onRegisterInquiry, onParticipationGuide }: EventsPageHeroProps) {
  return (
    <section className="relative overflow-hidden rounded-xl border border-emerald-200/60 bg-gradient-to-br from-pul-light via-white to-emerald-50 shadow-[0_4px_20px_rgba(6,78,59,0.08)]">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: "url('/images/banner-community.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/95 via-white/90 to-emerald-50/80"
        aria-hidden="true"
      />
      <Container className="relative px-4 py-5 sm:py-8 lg:py-10">
        <div className="flex max-w-3xl items-start gap-3 sm:gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-pul-deep to-pul-point text-white shadow-sm sm:h-14 sm:w-14">
            <Icon name="trophy" className="h-6 w-6 sm:h-7 sm:w-7" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-pul-point sm:text-sm">PUL Events</p>
            <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-pul-deep sm:mt-1 sm:text-3xl lg:text-4xl">
              {EVENTS_PAGE_COPY.title}
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-pul-muted sm:mt-2 sm:text-lg">
              {EVENTS_PAGE_COPY.description}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-pul-muted sm:text-sm">
              {EVENTS_PAGE_COPY.subDescription}
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:gap-3">
              <button
                type="button"
                onClick={onRegisterInquiry}
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-pul-point px-5 text-sm font-bold text-white hover:bg-pul-deep sm:min-h-12"
              >
                대회 등록 문의
              </button>
              <button
                type="button"
                onClick={onParticipationGuide}
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-pul-border bg-white px-5 text-sm font-bold text-pul-deep hover:bg-pul-light sm:min-h-12"
              >
                참가 안내 보기
              </button>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
