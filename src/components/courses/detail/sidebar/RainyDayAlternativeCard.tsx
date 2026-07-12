import type { RainyDayAlternative } from "@/data/courseDetailPageData";
import { Phone } from "lucide-react";
import Link from "next/link";

type RainyDayAlternativeCardProps = {
  alternatives: RainyDayAlternative[];
};

export function RainyDayAlternativeCard({ alternatives }: RainyDayAlternativeCardProps) {
  const item = alternatives[0];
  if (!item) return null;

  return (
    <div className="rounded-lg border border-sky-200/60 bg-sky-50/30 p-3">
      <h3 className="text-sm font-bold text-pul-deep lg:text-base">
        비 오는 날 가까운 스크린 파크골프장
      </h3>
      <p className="mt-2 text-base font-bold text-foreground">{item.name}</p>
      <ul className="mt-2 space-y-0.5 text-sm text-pul-muted lg:text-base">
        <li>{item.distance} · {item.driveTime}</li>
        <li>단체 이용 {item.groupCapacity}</li>
      </ul>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <a
          href={`tel:${item.phone.replace(/-/g, "")}`}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-pul-border bg-white text-sm font-bold text-pul-deep hover:bg-pul-light"
        >
          <Phone className="h-4 w-4" aria-hidden="true" />
          전화 문의
        </a>
        <Link
          href={item.href}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-pul-border bg-white text-sm font-bold text-pul-deep hover:bg-pul-light"
        >
          상세보기
        </Link>
      </div>
    </div>
  );
}
