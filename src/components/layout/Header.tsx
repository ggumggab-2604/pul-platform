import { HeaderAuthActions } from "@/components/auth/HeaderAuthActions";
import { Container } from "@/components/ui/Container";
import { PublicSearchForm } from "@/components/layout/PublicSearchForm";
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
            <PublicSearchForm />
          </div>

          <HeaderAuthActions variant="desktop" />
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

            <HeaderAuthActions variant="mobile" />
          </div>

          <PublicSearchForm compact />
        </div>
      </Container>
    </header>
  );
}
