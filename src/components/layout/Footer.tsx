import { Container } from "@/components/ui/Container";
import { footerLinks, footerPendingItems } from "@/data/homeData";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-pul-border bg-white pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
      <Container className="py-3 lg:py-8">
        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-4 lg:gap-8">
          <div>
            <div className="mb-1.5 flex items-center gap-2 lg:mb-3 lg:gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-pul-deep to-pul-point text-sm font-bold text-white shadow-sm lg:h-11 lg:w-11 lg:text-lg">
                P
              </div>
              <div>
                <p className="text-base font-bold text-pul-deep lg:text-xl">PUL</p>
                <p className="hidden text-xs text-pul-muted sm:block lg:text-sm">
                  Park Golf Use &amp; Lounge
                </p>
              </div>
            </div>
            <p className="hidden max-w-xs text-sm leading-6 text-pul-muted sm:block">
              파크골프장, 동호회, 일정과 배움 정보를 실제 공개 데이터로 안내합니다.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-3 lg:contents">
            <div>
              <h3 className="mb-1 text-sm font-bold text-foreground lg:mb-2 lg:text-base">
                서비스
              </h3>
              <ul className="space-y-0.5 text-sm leading-snug text-pul-muted lg:space-y-2">
                {footerLinks.service.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="hover:text-pul-deep">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="mb-1 text-sm font-bold text-foreground lg:mb-2 lg:text-base">
                안내
              </h3>
              <ul className="space-y-0.5 text-sm leading-snug text-pul-muted lg:space-y-2">
                {footerPendingItems.map((label) => (
                  <li key={label}>
                    <span>{label}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="col-span-2 lg:col-span-1">
              <h3 className="mb-1 text-sm font-bold text-foreground lg:mb-2 lg:text-base">
                제휴·광고
              </h3>
              <ul className="mb-1.5 space-y-0.5 text-sm leading-snug text-pul-muted lg:mb-3 lg:space-y-2">
                {footerLinks.business.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="hover:text-pul-deep">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="text-sm leading-6 text-pul-muted">
                장터의 실제 제휴·광고 문의 창구를 이용해 주세요.
              </p>
            </div>
          </div>
        </div>

        <p className="mt-3 border-t border-pul-border/80 pt-2.5 text-center text-sm text-pul-muted lg:mt-6 lg:pt-5">
          © 2026 PUL Platform. All rights reserved.
        </p>
      </Container>
    </footer>
  );
}
