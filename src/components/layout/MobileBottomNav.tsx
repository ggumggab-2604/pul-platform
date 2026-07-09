"use client";

import { Icon } from "@/components/ui/Icon";
import { mobileNavItems } from "@/data/homeData";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-pul-border bg-white shadow-[0_-2px_12px_rgba(0,0,0,0.06)] pb-[env(safe-area-inset-bottom)] lg:hidden">
      <ul className="flex">
        {mobileNavItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={cn(
                  "flex min-h-[56px] flex-col items-center justify-center gap-0.5 py-2",
                  isActive ? "text-pul-deep" : "text-pul-muted",
                )}
              >
                <Icon name={item.icon} className="h-6 w-6" />
                <span className="text-[11px] font-semibold leading-tight">
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
