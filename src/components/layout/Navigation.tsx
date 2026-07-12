"use client";

import { Container } from "@/components/ui/Container";
import { Icon } from "@/components/ui/Icon";
import { navItems } from "@/data/homeData";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** PC 전용 상단 아이콘 메뉴 (모바일에서는 숨김) */
export function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="hidden border-b border-pul-border bg-white lg:block">
      <Container className="lg:px-3">
        <ul className="flex justify-between gap-0 py-1.5">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);

            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center justify-center gap-0.5 rounded-lg px-2.5 py-3 text-base transition-colors",
                    isActive
                      ? "bg-pul-light font-semibold text-pul-deep"
                      : "font-medium text-pul-deep hover:bg-pul-light/70",
                  )}
                >
                  <Icon
                    name={item.icon}
                    className={cn(
                      "h-6 w-6 shrink-0",
                      isActive ? "text-pul-deep" : "text-pul-point",
                    )}
                  />
                  <span className="whitespace-nowrap text-base leading-tight">
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Container>
    </nav>
  );
}
