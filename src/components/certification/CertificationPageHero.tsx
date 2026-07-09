import { Container } from "@/components/ui/Container";
import { Icon } from "@/components/ui/Icon";

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
              파크골프 지도자 자격증, 심판 자격증, 생활스포츠지도사,
              장애인스포츠지도사, 협회·민간 교육과정, 심판·강사 활동 정보를
              한곳에서 확인하세요.
            </p>
            <p className="mt-2 rounded-lg border border-amber-200/60 bg-amber-50/80 px-2.5 py-2 text-[11px] font-medium leading-snug text-amber-900 sm:mt-3 sm:px-3 sm:py-2.5 sm:text-sm">
              자격증의 주관기관, 인정 범위, 응시 조건, 비용, 활용 가능 여부는
              반드시 직접 확인해야 합니다.
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}
