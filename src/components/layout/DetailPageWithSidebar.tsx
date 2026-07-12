import type { ReactNode } from "react";

type DetailPageWithSidebarProps = {
  children: ReactNode;
  sidebar: ReactNode;
  mainTestId?: string;
  className?: string;
};

/**
 * 상세 본문 전체 높이의 2열 레이아웃 (제목은 호출부에서 grid 밖).
 * course-detail-layout = main + aside 전체 래퍼.
 * aside 는 stretch 로 좌측 본문과 같은 높이 — sticky 의 containing block.
 * sticky 자체는 사이드바 내부(빠른 이용)에서만 처리 (fixed 금지).
 */
export function DetailPageWithSidebar({
  children,
  sidebar,
  mainTestId,
  className,
}: DetailPageWithSidebarProps) {
  return (
    <div
      className={`course-detail-layout detail-page-grid${className ? ` ${className}` : ""}`}
    >
      <main
        data-testid={mainTestId}
        className="course-detail-main detail-page-main"
      >
        {children}
      </main>
      <aside
        data-testid="course-sidebar-aside"
        className="course-detail-aside detail-page-sidebar hidden lg:block"
      >
        <div data-testid="course-sidebar" className="detail-page-sidebar-inner">
          {sidebar}
        </div>
      </aside>
    </div>
  );
}
