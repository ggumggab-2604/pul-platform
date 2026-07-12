"use client";

import { Icon } from "@/components/ui/Icon";
import { navItems } from "@/data/homeData";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

function isNavActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** 활성 메뉴를 가운데 근처로 — 끝 메뉴는 직전 항목이 반만 잘리지 않게 보정 */
function scrollActiveIntoPlace(
  scroller: HTMLElement,
  active: HTMLElement,
  behavior: ScrollBehavior,
) {
  const maxScroll = scroller.scrollWidth - scroller.clientWidth;
  if (maxScroll <= 0) return;

  const ideal =
    active.offsetLeft + active.offsetWidth / 2 - scroller.clientWidth / 2;
  let next = Math.max(0, Math.min(maxScroll, ideal));

  const prev = active.previousElementSibling as HTMLElement | null;
  if (prev) {
    const viewStart = next;
    const viewEnd = next + scroller.clientWidth;
    const prevStart = prev.offsetLeft;
    const prevEnd = prev.offsetLeft + prev.offsetWidth;
    const cutOnLeft = prevStart < viewStart && prevEnd > viewStart;

    if (cutOnLeft) {
      const showPrevFully = prevStart;
      const activeEnd = active.offsetLeft + active.offsetWidth;
      if (activeEnd <= showPrevFully + scroller.clientWidth) {
        next = Math.max(0, Math.min(maxScroll, showPrevFully));
      } else {
        /* 둘 다 온전히 못 넣으면 직전 메뉴는 완전히 숨김 */
        next = Math.max(0, Math.min(maxScroll, prevEnd + 6));
      }
    }
  }

  scroller.scrollTo({ left: next, behavior });
}

/**
 * 모바일 전용 가로 슬라이딩 메뉴.
 * 로고·검색은 스크롤로 사라지고, 이 메뉴만 sticky로 상단 고정.
 */
export function MobileSlidingNav() {
  const pathname = usePathname();
  const scrollRef = useRef<HTMLUListElement>(null);
  const activeRef = useRef<HTMLLIElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);
  const [isStuck, setIsStuck] = useState(false);

  const updateFades = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const maxScroll = scrollWidth - clientWidth;
    setShowLeftFade(scrollLeft > 4);
    setShowRightFade(maxScroll > 4 && scrollLeft < maxScroll - 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    updateFades();
    el.addEventListener("scroll", updateFades, { passive: true });
    window.addEventListener("resize", updateFades);

    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => updateFades())
        : null;
    ro?.observe(el);

    return () => {
      el.removeEventListener("scroll", updateFades);
      window.removeEventListener("resize", updateFades);
      ro?.disconnect();
    };
  }, [updateFades]);

  /* sticky 여부: 센티널이 화면에서 벗어나면 고정 상태 */
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        setIsStuck(!entry.isIntersecting);
      },
      { threshold: [1] },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, []);

  /* pathname 변경 시에만 활성 메뉴 위치 조정 (한 번) */
  useEffect(() => {
    const activeEl = activeRef.current;
    const scroller = scrollRef.current;
    if (!activeEl || !scroller) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const behavior: ScrollBehavior = prefersReducedMotion ? "auto" : "smooth";

    /* 레이아웃 확정 후 측정 */
    const frame = window.requestAnimationFrame(() => {
      scrollActiveIntoPlace(scroller, activeEl, behavior);
      window.setTimeout(updateFades, prefersReducedMotion ? 0 : 320);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [pathname, updateFades]);

  return (
    <>
      <div
        ref={sentinelRef}
        className="h-px w-full lg:hidden"
        aria-hidden="true"
      />
      <nav
        className={cn(
          "sticky top-0 z-40 bg-white lg:hidden",
          isStuck &&
            "border-b border-pul-border/70 shadow-[0_1px_3px_rgba(6,78,59,0.08)]",
        )}
        aria-label="주요 서비스 메뉴"
      >
        <div className="relative">
          <div
            data-fade="left"
            className={cn(
              "pointer-events-none absolute inset-y-0 left-0 z-10 w-8",
              "bg-gradient-to-r from-white from-40% via-white/85 to-transparent",
              "transition-opacity duration-150",
              showLeftFade ? "opacity-100" : "opacity-0",
            )}
            aria-hidden="true"
          />
          <div
            data-fade="right"
            className={cn(
              "pointer-events-none absolute inset-y-0 right-0 z-10 w-8",
              "bg-gradient-to-l from-white from-40% via-white/85 to-transparent",
              "transition-opacity duration-150",
              showRightFade ? "opacity-100" : "opacity-0",
            )}
            aria-hidden="true"
          />

          <ul
            ref={scrollRef}
            className={cn(
              "scrollbar-none flex gap-1.5 overflow-x-auto overflow-y-hidden overscroll-x-contain",
              "[-webkit-overflow-scrolling:touch]",
              "px-3 py-1",
            )}
          >
            {navItems.map((item) => {
              const active = isNavActive(pathname, item.href);
              return (
                <li
                  key={item.href}
                  ref={active ? activeRef : undefined}
                  className="shrink-0"
                >
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-flex min-h-11 items-center gap-1 whitespace-nowrap rounded-xl px-3 py-2",
                      "text-[15px] font-bold leading-none transition-colors",
                      active
                        ? "bg-pul-deep text-white shadow-sm"
                        : "bg-pul-light/70 text-pul-deep hover:bg-pul-light",
                    )}
                  >
                    <Icon
                      name={item.icon}
                      className={cn(
                        "h-4 w-4 shrink-0",
                        active ? "text-white" : "text-pul-point",
                      )}
                    />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>
    </>
  );
}
