import { Card } from "@/components/ui/Card";
import {
  dashboardBodyClass,
  dashboardCardClass,
  dashboardFooterClass,
  dashboardListClass,
} from "@/components/courses/courseDetailDashboardLayout";
import type { CourseHomeClub } from "@/data/courseMapData";
import { cn } from "@/lib/utils";
import { Users } from "lucide-react";
import Link from "next/link";

const MOBILE_CLUB_LIMIT = 3;
const PC_CLUB_LIMIT = 3;

function RecruitBadge({ status }: { status: string }) {
  const isOpen = status === "모집 중";
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-bold",
        isOpen
          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/70"
          : "bg-gray-100 text-gray-600 ring-1 ring-gray-200/80",
      )}
    >
      {status}
    </span>
  );
}

type CourseHomeClubsSectionProps = {
  clubs: CourseHomeClub[];
  className?: string;
};

export function CourseHomeClubsSection({ clubs, className }: CourseHomeClubsSectionProps) {
  return (
    <Card
      title="이 구장을 이용하는 동호회"
      dense
      className={cn(dashboardCardClass, className)}
      bodyClassName={dashboardBodyClass}
    >
      {clubs.length > 0 ? (
        <>
          <ul className={cn("space-y-2", dashboardListClass)}>
            {clubs.map((club, index) => (
              <li
                key={club.id}
                className={cn(
                  "rounded-lg border border-pul-border/80 px-3 py-2.5 max-lg:px-2.5 max-lg:py-2",
                  index >= MOBILE_CLUB_LIMIT && "hidden lg:list-item",
                  index >= PC_CLUB_LIMIT && "lg:hidden",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-foreground max-lg:text-xs">{club.name}</h3>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-pul-muted max-lg:line-clamp-1">
                      <Users className="h-3.5 w-3.5 shrink-0 text-pul-point" aria-hidden="true" />
                      {club.memberCount}명 · {club.schedule}
                    </p>
                  </div>
                  <RecruitBadge status={club.recruitStatus} />
                </div>
                <Link
                  href="/clubs"
                  className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-pul-point px-4 py-2.5 text-sm font-bold text-white hover:bg-pul-deep lg:hidden"
                >
                  동호회 보기
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href="/clubs"
            className={cn(
              "mt-3 inline-flex w-full items-center justify-center rounded-lg border border-pul-border bg-white px-4 py-2.5 text-sm font-bold text-pul-deep hover:bg-pul-light max-lg:min-h-12",
              dashboardFooterClass,
            )}
          >
            전체 보기
          </Link>
        </>
      ) : (
        <p className="text-sm text-pul-muted">등록된 동호회 정보가 없습니다.</p>
      )}
    </Card>
  );
}
