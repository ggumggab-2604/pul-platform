import { Card } from "@/components/ui/Card";
import type { CourseDetailPageData } from "@/data/courseDetailPageData";
import Link from "next/link";

export function CourseNearbyInfoSection({ detail }: { detail: CourseDetailPageData }) {
  const groups = [
    { title: "주변 스크린 파크골프장", items: detail.nearbyInfo.screenCourses },
    { title: "가까운 장비 수리·리폼", items: detail.nearbyInfo.repairShops },
    { title: "같은 지역 골프장", items: detail.nearbyInfo.sameRegion },
    { title: "관련 뉴스·공지", items: detail.nearbyInfo.news },
  ].filter((g) => g.items.length > 0);

  if (groups.length === 0) return null;

  return (
    <Card title="주변 정보" dense>
      <div className="space-y-4">
        {groups.map((group) => (
          <div key={group.title}>
            <h3 className="text-sm font-bold text-pul-deep lg:text-base">{group.title}</h3>
            <ul className="mt-2 space-y-2">
              {group.items.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className="flex items-center justify-between gap-3 rounded-lg border border-pul-border/80 px-3 py-2.5 hover:bg-pul-light/60"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-foreground lg:text-base">{item.name}</p>
                      {item.note ? (
                        <p className="text-xs text-pul-muted lg:text-sm">{item.note}</p>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-sm font-bold text-pul-point">보기 →</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}
