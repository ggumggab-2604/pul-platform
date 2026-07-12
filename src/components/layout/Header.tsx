import { Container } from "@/components/ui/Container";
import { Icon } from "@/components/ui/Icon";
import Link from "next/link";

/**
 * PC 헤더는 기존 유지.
 * 모바일: 1행 로고 + 로그인, 2행 통합검색 (햄버거 없음 — 전체 메뉴는 하단 탭).
 */
export function Header() {
  return (
    <header className="border-b border-pul-border bg-white shadow-[0_1px_0_rgba(0,0,0,0.04)]">
      <Container>
        {/* PC: 기존 한 줄 레이아웃 유지 */}
        <div className="hidden items-center gap-6 py-4 lg:flex">
          <Link href="/" className="shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-pul-deep to-pul-point text-2xl font-bold text-white shadow-sm">
                P
              </div>
              <div>
                <p className="text-2xl font-bold tracking-tight text-pul-deep">PUL</p>
                <p className="text-base font-medium text-pul-muted">
                  Park Golf Use &amp; Lounge
                </p>
                <p className="text-sm text-pul-point">잔디 위에서 시작되는 모든 이야기</p>
              </div>
            </div>
          </Link>

          <div className="flex flex-1 items-center px-4">
            <label className="relative w-full max-w-2xl">
              <span className="sr-only">검색</span>
              <Icon
                name="search"
                className="absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-pul-point"
              />
              <input
                type="search"
                placeholder="PUL 통합 검색"
                className="h-14 w-full rounded-full border border-pul-border bg-[#f8faf9] pl-14 pr-6 text-lg shadow-inner outline-none transition-shadow focus:border-pul-point focus:bg-white focus:ring-2 focus:ring-pul-point/20"
              />
            </label>
          </div>

          <div className="flex shrink-0 items-center">
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

        {/* 모바일: 1행 로고·로그인 / 2행 검색 */}
        <div className="flex flex-col gap-2 py-2.5 lg:hidden">
          <div className="flex items-center gap-2">
            <Link href="/" className="min-w-0 shrink-0">
              <div className="flex items-center gap-2">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-pul-deep to-pul-point text-xl font-bold text-white shadow-sm">
                  P
                </div>
                <p className="text-xl font-bold tracking-tight text-pul-deep">PUL</p>
              </div>
            </Link>

            <Link
              href="/login"
              className="ml-auto inline-flex min-h-11 items-center justify-center rounded-lg bg-pul-point px-4 text-base font-bold text-white shadow-sm"
            >
              로그인
            </Link>
          </div>

          <label className="relative w-full">
            <span className="sr-only">검색</span>
            <Icon
              name="search"
              className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-pul-point"
            />
            <input
              type="search"
              placeholder="PUL 통합 검색"
              className="h-11 w-full rounded-full border border-pul-border bg-[#f8faf9] pl-12 pr-4 text-base shadow-inner outline-none transition-shadow focus:border-pul-point focus:bg-white focus:ring-2 focus:ring-pul-point/20"
            />
          </label>
        </div>
      </Container>
    </header>
  );
}
