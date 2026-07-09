import { Container } from "@/components/ui/Container";
import { Icon } from "@/components/ui/Icon";
import Link from "next/link";

export function Header() {
  return (
    <header className="border-b border-pul-border bg-white shadow-[0_1px_0_rgba(0,0,0,0.04)]">
      <Container>
        <div className="flex flex-col gap-3 py-3 lg:flex-row lg:items-center lg:gap-6 lg:py-4">
          <div className="flex items-center justify-between lg:justify-start">
            <Link href="/" className="shrink-0">
              <div className="flex items-center gap-2.5 lg:gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-pul-deep to-pul-point text-xl font-bold text-white shadow-sm lg:h-14 lg:w-14 lg:text-2xl">
                  P
                </div>
                <div>
                  <p className="text-xl font-bold tracking-tight text-pul-deep lg:text-2xl">
                    PUL
                  </p>
                  <p className="hidden text-sm font-medium text-pul-muted sm:block lg:text-base">
                    Park Golf Use &amp; Lounge
                  </p>
                  <p className="hidden text-sm text-pul-point md:block">
                    잔디 위에서 시작되는 모든 이야기
                  </p>
                </div>
              </div>
            </Link>
            <Link
              href="/my"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-pul-point text-white shadow-sm lg:hidden"
              aria-label="내 정보"
            >
              <Icon name="user" className="h-5 w-5" />
            </Link>
          </div>

          <div className="flex flex-1 items-center lg:px-4">
            <label className="relative w-full lg:max-w-2xl">
              <span className="sr-only">검색</span>
              <Icon
                name="search"
                className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-pul-point lg:left-5 lg:h-5 lg:w-5"
              />
              <input
                type="search"
                placeholder="PUL 통합 검색"
                className="h-11 w-full rounded-full border border-pul-border bg-[#f8faf9] pl-11 pr-4 text-sm shadow-inner outline-none transition-shadow focus:border-pul-point focus:bg-white focus:ring-2 focus:ring-pul-point/20 lg:h-14 lg:pl-14 lg:pr-6 lg:text-lg"
              />
            </label>
          </div>

          <div className="hidden shrink-0 items-center lg:flex">
            <Link
              href="/login"
              className="px-3 py-2 text-lg text-pul-muted transition-colors hover:text-pul-deep"
            >
              로그인
            </Link>
            <span className="text-pul-border">|</span>
            <Link
              href="/signup"
              className="px-3 py-2 text-lg text-pul-muted transition-colors hover:text-pul-deep"
            >
              회원가입
            </Link>
            <span className="text-pul-border">|</span>
            <Link
              href="/support"
              className="px-3 py-2 text-lg text-pul-muted transition-colors hover:text-pul-deep"
            >
              고객센터
            </Link>
            <Link
              href="/my"
              className="ml-2 inline-flex h-12 items-center gap-2 rounded-lg bg-pul-point px-5 text-lg font-semibold text-white shadow-sm transition-colors hover:bg-pul-deep"
            >
              <Icon name="user" className="h-5 w-5" />
              내 정보
            </Link>
          </div>
        </div>
      </Container>
    </header>
  );
}
