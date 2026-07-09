import { Container } from "@/components/ui/Container";
import { footerLinks } from "@/data/homeData";
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
            <div className="hidden flex-wrap gap-3 text-sm text-pul-muted sm:flex">
              <span className="cursor-pointer hover:text-pul-deep">Facebook</span>
              <span className="cursor-pointer hover:text-pul-deep">YouTube</span>
              <span className="cursor-pointer hover:text-pul-deep">Instagram</span>
              <span className="cursor-pointer hover:text-pul-deep">Blog</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-3 lg:contents">
            <div>
              <h3 className="mb-1 text-sm font-bold text-foreground lg:mb-2 lg:text-base">
                회사
              </h3>
              <ul className="space-y-0.5 text-sm leading-snug text-pul-muted lg:space-y-2">
                {footerLinks.company.map((link) => (
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
                고객센터
              </h3>
              <ul className="space-y-0.5 text-sm leading-snug text-pul-muted lg:space-y-2">
                {footerLinks.support.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="hover:text-pul-deep">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="col-span-2 lg:col-span-1">
              <h3 className="mb-1 text-sm font-bold text-foreground lg:mb-2 lg:text-base">
                제휴·입점
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
              <p className="text-sm font-bold tracking-tight text-pul-deep lg:text-xl">
                1234-5678
              </p>
              <p className="mt-0.5 text-sm text-pul-muted lg:mt-1">
                <span className="lg:hidden">평일 09:00 - 18:00</span>
                <span className="hidden lg:inline">
                  평일 09:00 - 18:00 (주말·공휴일 휴무)
                </span>
              </p>
              <p className="text-sm text-pul-muted">help@pul.co.kr</p>
              <select className="mt-2 hidden w-full rounded-lg border border-pul-border bg-[#fafbfa] px-3 py-2.5 text-sm text-pul-muted shadow-sm lg:mt-3 lg:block">
                <option>관련 사이트</option>
              </select>
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
