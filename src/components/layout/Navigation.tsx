"use client";

import { Container } from "@/components/ui/Container";
import { Icon } from "@/components/ui/Icon";
import { navItems } from "@/data/homeData";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/** 모바일에서 의미를 유지하며 짧게 표시 */
const mobileNavLabels: Record<string, string> = {
  "/events": "대회",
  "/lessons": "레슨",
  "/certification": "자격증",
  "/news": "뉴스",
};

function getMobileLabel(href: string, label: string) {
  return mobileNavLabels[href] ?? label;
}

export function Navigation() {
  const pathname = usePathname();
  const scrollRef = useRef<HTMLUListElement>(null);
  const activeRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (!activeRef.current || !scrollRef.current) return;
    if (window.matchMedia("(min-width: 1024px)").matches) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    activeRef.current.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  }, [pathname]);

  return (
    <nav className="border-b border-pul-border bg-white">
      <Container className="px-0 lg:px-3">
        <div className="relative">
          <div
            className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-white via-white/85 to-transparent lg:hidden"
            aria-hidden="true"
          />

          <ul
            ref={scrollRef}
            className={cn(
              "scrollbar-none flex gap-0.5 overflow-x-auto overscroll-x-contain px-2 py-1.5 pr-9",
              "[-webkit-overflow-scrolling:touch]",
              "lg:mx-0 lg:justify-between lg:gap-0 lg:overflow-visible lg:px-0 lg:pr-0",
            )}
          >
            {navItems.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);

              return (
                <li
                  key={item.href}
                  ref={isActive ? activeRef : undefined}
                  className="shrink-0 lg:flex-1"
                >
                  <Link
                    href={item.href}
                    className={cn(
                      "flex min-w-[56px] flex-col items-center gap-0.5 rounded-lg px-2 py-2 transition-colors",
                      "lg:min-w-0 lg:px-2.5 lg:py-3 lg:text-base",
                      isActive
                        ? "bg-pul-light text-pul-deep"
                        : "text-pul-muted hover:bg-pul-light/60 hover:text-pul-deep",
                    )}
                  >
                    <Icon
                      name={item.icon}
                      className="h-5 w-5 shrink-0 lg:h-6 lg:w-6"
                    />
                    <span className="whitespace-nowrap text-[11px] font-medium leading-tight lg:text-base">
                      <span className="lg:hidden">
                        {getMobileLabel(item.href, item.label)}
                      </span>
                      <span className="hidden lg:inline">{item.label}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </Container>
    </nav>
  );
}
