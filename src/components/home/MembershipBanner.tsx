import { Icon } from "@/components/ui/Icon";
import { membershipBenefits } from "@/data/homeData";

export function MembershipBanner() {
  return (
    <section className="relative overflow-hidden rounded-xl bg-gradient-to-b from-pul-deep via-[#065f46] to-pul-deep px-5 py-6 text-white shadow-[0_6px_24px_rgba(6,78,59,0.22)] lg:bg-gradient-to-r lg:px-12 lg:py-8">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 50%, white 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
        aria-hidden="true"
      />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold lg:text-2xl">PUL 프리미엄 멤버십</h2>
          <p className="mt-2 text-base text-white/90">
            더 많은 혜택과 특별한 서비스를 경험하세요
          </p>
          <ul className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:mt-5 lg:grid-cols-4 lg:gap-5">
            {membershipBenefits.map((benefit) => (
              <li
                key={benefit.label}
                className="flex items-center gap-2.5 text-sm lg:text-base"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/25">
                  <Icon name={benefit.icon} className="h-4 w-4" />
                </span>
                <span className="text-white/95">{benefit.label}</span>
              </li>
            ))}
          </ul>
        </div>
        <button
          type="button"
          className="h-12 w-full shrink-0 rounded-lg bg-gradient-to-r from-pul-gold to-pul-gold-light px-6 text-base font-bold text-pul-deep shadow-[0_4px_14px_rgba(217,164,65,0.45)] transition-all active:scale-[0.98] hover:brightness-105 lg:h-14 lg:w-auto lg:px-12 lg:text-lg lg:hover:scale-[1.02]"
        >
          멤버십 가입하기 →
        </button>
      </div>
    </section>
  );
}
