import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { MobileFullMenu } from "@/components/layout/MobileFullMenu";
import { MobileMenuProvider } from "@/components/layout/MobileMenuContext";
import { MobileSlidingNav } from "@/components/layout/MobileSlidingNav";
import { Navigation } from "@/components/layout/Navigation";
import type { ReactNode } from "react";

type MainLayoutProps = {
  children: ReactNode;
};

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <MobileMenuProvider>
      <Header />
      {/* 모바일: 검색 아래 가로 메뉴 — sticky로만 상단 고정 */}
      <MobileSlidingNav />
      {/* PC: 기존 아이콘 내비게이션 */}
      <Navigation />
      <div className="flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
        {children}
      </div>
      <Footer />
      <MobileBottomNav />
      <MobileFullMenu />
    </MobileMenuProvider>
  );
}
