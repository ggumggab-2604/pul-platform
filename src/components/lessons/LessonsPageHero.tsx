import { Container } from "@/components/ui/Container";
import { Icon } from "@/components/ui/Icon";

export function LessonsPageHero() {
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
        <div className="flex max-w-2xl items-start gap-2.5 sm:gap-4">
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
              파크골프를 처음 시작하는 분부터 기존 골프 경험자까지, 입문 가이드와
              무료 영상 강의, 유료 레슨 정보를 한곳에서 확인하세요.
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}
