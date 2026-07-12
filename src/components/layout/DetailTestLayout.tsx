import type { ReactNode } from "react";

type DetailTestLayoutProps = {
  title: ReactNode;
  sidebar: ReactNode;
  children: ReactNode;
};

/**
 * Bounded sticky 상세 레이아웃 검증용.
 * 제목은 전체 폭, 그 아래 main + aside(내부 sticky).
 * fixed / spacer / scroll 위치 제어 없음.
 */
export function DetailTestLayout({ title, sidebar, children }: DetailTestLayoutProps) {
  return (
    <div className="detail-test-page">
      {title}
      <div className="detail-test-grid">
        <main className="detail-test-main">{children}</main>
        <aside className="detail-test-aside">
          <div data-testid="detail-test-sidebar" className="detail-test-sidebar">
            {sidebar}
          </div>
        </aside>
      </div>
    </div>
  );
}
