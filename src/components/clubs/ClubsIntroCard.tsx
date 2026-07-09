import { clubIntroText } from "@/data/clubData";
import { Icon } from "@/components/ui/Icon";

export function ClubsIntroCard() {
  return (
    <section className="rounded-xl border border-pul-border bg-white p-3 shadow-[0_2px_10px_rgba(6,78,59,0.06)] lg:p-5">
      <div className="flex items-start gap-2.5 lg:gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-pul-light text-pul-deep lg:h-10 lg:w-10">
          <Icon name="book" className="h-4 w-4 lg:h-5 lg:w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-foreground lg:text-lg">
            동호회, 왜 찾아볼까요?
          </h2>
          <p className="mt-1.5 text-xs leading-relaxed text-pul-muted lg:mt-2 lg:text-base">
            {clubIntroText}
          </p>
        </div>
      </div>
    </section>
  );
}
