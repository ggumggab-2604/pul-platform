"use client";

import { useMobileMenu } from "@/components/layout/MobileMenuContext";
import { Icon } from "@/components/ui/Icon";
import { useBodyScrollLock } from "@/components/ui/InfoModal";
import { navItems } from "@/data/homeData";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

const accountLinks = [
  { label: "로그인", href: "/login" },
  { label: "회원가입", href: "/signup" },
  { label: "고객센터", href: "/support" },
  { label: "내 정보", href: "/my" },
];

export function MobileFullMenu() {
  const { isOpen, closeMenu } = useMobileMenu();
  const pathname = usePathname();

  useBodyScrollLock(isOpen);

  useEffect(() => {
    closeMenu();
  }, [pathname, closeMenu]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, closeMenu]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label="전체 메뉴">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="메뉴 닫기"
        onClick={closeMenu}
      />

      <div className="absolute inset-y-0 right-0 flex w-[min(100%,22rem)] flex-col bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-pul-border px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <p className="text-lg font-bold text-pul-deep">전체 메뉴</p>
          <button
            type="button"
            onClick={closeMenu}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-pul-deep hover:bg-pul-light"
            aria-label="닫기"
          >
            <Icon name="close" className="h-6 w-6" />
          </button>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <p className="mb-2 px-2 text-sm font-bold text-pul-muted">주요 메뉴</p>
          <ul className="space-y-1">
            {navItems.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={closeMenu}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex min-h-12 items-center gap-3 rounded-xl px-3 py-2.5 text-base font-bold transition-colors",
                      isActive
                        ? "bg-pul-point text-white"
                        : "text-pul-deep hover:bg-pul-light",
                    )}
                  >
                    <Icon
                      name={item.icon}
                      className={cn(
                        "h-6 w-6 shrink-0",
                        isActive ? "text-white" : "text-pul-point",
                      )}
                    />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="my-4 border-t border-pul-border" />

          <p className="mb-2 px-2 text-sm font-bold text-pul-muted">회원 · 고객지원</p>
          <ul className="space-y-1">
            {accountLinks.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={closeMenu}
                  className="flex min-h-12 items-center rounded-xl px-3 py-2.5 text-base font-semibold text-pul-deep hover:bg-pul-light"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}
