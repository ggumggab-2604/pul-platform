import { Card } from "@/components/ui/Card";
import type { CourseDetailPageData } from "@/data/courseDetailPageData";

export function CourseInfoSection({ detail }: { detail: CourseDetailPageData }) {
  const { about } = detail;

  return (
    <Card title="골프장 소개" dense>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-pul-light/50 px-3 py-3">
          <h3 className="text-sm font-bold text-pul-deep lg:text-base">골프장 특징</h3>
          <p className="mt-1 text-base leading-relaxed text-pul-muted">
            {about.highlights[0] ?? "정보 확인 필요"}
          </p>
        </div>
        <div className="rounded-lg bg-pul-light/50 px-3 py-3">
          <h3 className="text-sm font-bold text-pul-deep lg:text-base">초보자 추천</h3>
          <p className="mt-1 text-base leading-relaxed text-pul-muted">{about.beginnerFriendly}</p>
        </div>
        <div className="rounded-lg bg-pul-light/50 px-3 py-3">
          <h3 className="text-sm font-bold text-pul-deep lg:text-base">운영 참고</h3>
          <p className="mt-1 text-base leading-relaxed text-pul-muted">
            {about.cautions[0] ?? "방문 전 운영기관 확인"}
          </p>
        </div>
        <div className="rounded-lg bg-pul-light/50 px-3 py-3">
          <h3 className="text-sm font-bold text-pul-deep lg:text-base">대회 개최</h3>
          <p className="mt-1 text-base leading-relaxed text-pul-muted">{about.tournamentCapable}</p>
        </div>
      </div>
    </Card>
  );
}
