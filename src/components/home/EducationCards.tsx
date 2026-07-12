import { Icon } from "@/components/ui/Icon";
import { educationCards } from "@/data/homeData";
import Link from "next/link";

export function EducationCards() {
  return (
    <section>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-3">
        {educationCards.map((card) => (
          <Link
            key={card.id}
            href={card.href}
            className="group flex min-h-[108px] items-center gap-4 rounded-xl border border-pul-border bg-white p-4 shadow-[0_2px_10px_rgba(6,78,59,0.06)] transition-all hover:border-pul-point/35 hover:shadow-[0_4px_14px_rgba(6,78,59,0.1)] lg:min-h-[120px] lg:p-5"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-pul-light to-emerald-100 text-pul-deep ring-1 ring-emerald-200/60 shadow-sm lg:h-14 lg:w-14">
              <Icon name={card.icon} className="h-6 w-6 lg:h-7 lg:w-7" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-center">
              <p className="text-base font-bold leading-tight text-foreground">
                {card.title}
              </p>
              <p className="mt-1 text-sm font-semibold text-pul-point group-hover:underline">
                바로가기 →
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
