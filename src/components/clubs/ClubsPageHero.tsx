import { Container } from "@/components/ui/Container";
import { Icon } from "@/components/ui/Icon";
import Link from "next/link";

export function ClubsPageHero() {
  return (
    <section className="relative overflow-hidden rounded-xl border border-emerald-200/60 bg-gradient-to-br from-pul-light via-white to-emerald-50 shadow-[0_4px_20px_rgba(6,78,59,0.08)]">
      <div className="pointer-events-none absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "url('/images/banner-community.jpg')", backgroundSize: "cover", backgroundPosition: "center" }} aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/95 via-white/88 to-emerald-50/75" aria-hidden="true" />
      <Container className="relative px-4 py-5 sm:py-8 lg:py-10">
        <div className="flex max-w-2xl items-start gap-3 sm:gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-pul-deep to-pul-point text-white shadow-sm sm:h-14 sm:w-14"><Icon name="users" className="h-5 w-5 sm:h-7 sm:w-7" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-pul-point sm:text-sm">PUL Clubs</p>
            <h1 className="mt-0.5 text-xl font-bold tracking-tight text-pul-deep sm:mt-1 sm:text-3xl lg:text-4xl">동호회 찾기</h1>
            <p className="mt-1 text-sm leading-relaxed text-pul-muted sm:mt-2 sm:text-lg">실제 등록된 파크골프 동호회를 지역과 모집 상태로 찾아보세요.</p>
            <Link href="/clubs/register" className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-pul-point px-5 text-sm font-bold text-white hover:bg-pul-deep sm:w-auto">동호회 등록하기</Link>
          </div>
        </div>
      </Container>
    </section>
  );
}
