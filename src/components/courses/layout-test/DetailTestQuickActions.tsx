import { MapPin, Pencil, Phone, Trophy, Users } from "lucide-react";

const ACTIONS = [
  { label: "길찾기", icon: MapPin, primary: true },
  { label: "전화 문의", icon: Phone, primary: false },
  { label: "이용 동호회", icon: Users, primary: false },
  { label: "이 구장 대회", icon: Trophy, primary: false },
  { label: "정보 수정 제보", icon: Pencil, primary: false },
] as const;

export function DetailTestQuickActions() {
  return (
    <section className="rounded-xl border border-pul-border bg-white p-4 shadow-[0_2px_10px_rgba(6,78,59,0.06)]">
      <h2 className="mb-3 text-base font-bold text-pul-deep lg:text-lg">빠른 이용</h2>
      <div className="space-y-2">
        {ACTIONS.map(({ label, icon: Icon, primary }) => (
          <button
            key={label}
            type="button"
            className={
              primary
                ? "inline-flex min-h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-pul-point px-4 text-base font-bold text-white"
                : "inline-flex min-h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-pul-border bg-white px-4 text-base font-bold text-pul-deep"
            }
          >
            <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}
