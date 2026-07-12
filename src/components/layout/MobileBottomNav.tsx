"use client";

import { useMobileMenu } from "@/components/layout/MobileMenuContext";
import { Icon } from "@/components/ui/Icon";
import { mobileNavItems } from "@/data/homeData";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** 하단 탭이 아닌 전체 메뉴 경로 (활성 표시용) */
const FULL_MENU_PATHS = [
  "/events",
  "/lessons",
  "/certification",
  "/news",
  "/community",
  "/exam",
  "/login",
  "/signup",
  "/support",
  "/my",
];

function isPathActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isFullMenuRoute(pathname: string) {
  return FULL_MENU_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export function MobileBottomNav() {
  const pathname = usePathname();
  const { isOpen, openMenu } = useMobileMenu();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-pul-border bg-white shadow-[0_-2px_12px_rgba(0,0,0,0.06)] pb-[env(safe-area-inset-bottom)] lg:hidden"
      aria-label="모바일 주요 메뉴"
    >
      <ul className="grid grid-cols-5">
        {mobileNavItems.map((item) => {
          const isMenu = item.href === "#menu";
          const isActive = isMenu
            ? isOpen || isFullMenuRoute(pathname)
            : isPathActive(pathname, item.href);

          if (isMenu) {
            return (
              <li key={item.href} className="min-w-0">
                <button
                  type="button"
                  onClick={openMenu}
                  aria-pressed={isOpen}
                  className={cn(
                    "flex w-full min-h-[56px] flex-col items-center justify-center gap-0.5 px-0.5 py-1.5",
                    isActive ? "text-pul-point" : "text-pul-muted",
                  )}
                >
                  <Icon name={item.icon} className="h-6 w-6 shrink-0" />
                  <span className="max-w-full truncate text-xs font-bold leading-tight">
                    {item.label}
                  </span>
                </button>
              </li>
            );
          }

          return (
            <li key={item.href} className="min-w-0">
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-0.5 py-1.5",
                  isActive ? "text-pul-point" : "text-pul-muted",
                )}
              >
                <Icon name={item.icon} className="h-6 w-6 shrink-0" />
                <span className="max-w-full truncate text-xs font-bold leading-tight">
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
