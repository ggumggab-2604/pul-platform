import { Icon } from "@/components/ui/Icon";
import { quickMenuItems } from "@/data/homeData";
import { cn } from "@/lib/utils";
import Link from "next/link";

type QuickMenuProps = {
  className?: string;
};

export function QuickMenu({ className }: QuickMenuProps) {
  return (
    <div className={cn("relative z-10 -mt-6 lg:-mt-8", className)}>
      <div className="grid grid-cols-3 gap-2.5 lg:grid-cols-6 lg:gap-3">
        {quickMenuItems.map((item) => (
          <Link
            key={item.href + item.label}
            href={item.href}
            className="flex min-h-[100px] flex-col items-center justify-center gap-2 rounded-xl border border-pul-border bg-white px-2 py-3.5 shadow-[0_4px_16px_rgba(6,78,59,0.1)] transition-all active:scale-[0.98] hover:border-pul-point/40 hover:shadow-[0_6px_22px_rgba(6,78,59,0.16)] lg:min-h-[118px] lg:gap-3 lg:py-4 lg:hover:-translate-y-0.5"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-pul-point/40 bg-pul-light text-pul-deep shadow-sm lg:h-14 lg:w-14">
              <Icon name={item.icon} className="h-6 w-6 lg:h-7 lg:w-7" />
            </div>
            <span className="text-center text-xs font-bold leading-tight text-gray-800 sm:text-sm">
              {item.label}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
