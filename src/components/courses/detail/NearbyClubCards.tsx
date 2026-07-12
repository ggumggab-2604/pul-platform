import { Card } from "@/components/ui/Card";
import type { CourseHomeClub } from "@/data/courseMapData";
import { cn } from "@/lib/utils";
import { Users } from "lucide-react";
import Link from "next/link";

type NearbyClubCardsProps = {
  clubs: CourseHomeClub[];
  region: string;
  onRegister: () => void;
};

function RecruitBadge({ status }: { status: string }) {
  const isOpen = status === "모집 중";
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-bold ring-1",
        isOpen
          ? "bg-emerald-50 text-emerald-700 ring-emerald-200/70"
          : "bg-gray-100 text-gray-600 ring-gray-200/80",
      )}
    >
      {status}
    </span>
  );
}

export function NearbyClubCards({ clubs, region, onRegister }: NearbyClubCardsProps) {
  const display = clubs.slice(0, 4);

  return (
    <Card title="주변 동호회" dense>
      {display.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {display.map((club) => (
            <li
              key={club.id}
              className="flex flex-col rounded-xl border border-pul-border/80 p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-foreground lg:text-lg">{club.name}</h3>
                  <p className="mt-1 text-sm text-pul-muted">{region}</p>
                </div>
                <RecruitBadge status={club.recruitStatus} />
              </div>
              <p className="mt-2 flex items-center gap-1 text-sm text-pul-muted lg:text-base">
                <Users className="h-4 w-4 text-pul-point" aria-hidden="true" />
                {club.memberCount}명 · {club.schedule}
              </p>
              <Link
                href={`/clubs`}
                className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg border border-pul-border bg-white text-sm font-bold text-pul-deep hover:bg-pul-light lg:text-base"
              >
                동호회 상세보기
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-lg border border-dashed border-pul-border bg-pul-light/40 px-4 py-6 text-center">
          <p className="text-base font-bold text-pul-deep lg:text-lg">
            이 골프장에서 활동하는 동호회를 등록해 주세요.
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Link
          href="/clubs"
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-pul-border bg-white text-sm font-bold text-pul-deep hover:bg-pul-light lg:text-base"
        >
          주변 동호회 전체보기
        </Link>
        <button
          type="button"
          onClick={onRegister}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-pul-point text-sm font-bold text-white hover:bg-pul-deep lg:text-base"
        >
          동호회 등록하기
        </button>
      </div>
    </Card>
  );
}
