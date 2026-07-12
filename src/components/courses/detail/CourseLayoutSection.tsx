import { Card } from "@/components/ui/Card";
import type { CourseDetailPageData } from "@/data/courseDetailPageData";
import { cn } from "@/lib/utils";

export function CourseLayoutSection({ detail }: { detail: CourseDetailPageData }) {
  return (
    <Card title="코스 정보" dense>
      <p className="mb-3 text-sm text-pul-muted lg:text-base">
        코스별 난이도와 특징을 비교해 보세요. 개발 단계 샘플 데이터일 수 있습니다.
      </p>
      <div className="grid gap-3 lg:grid-cols-2">
        {detail.courses.map((layout) => (
          <article
            key={layout.id}
            className={cn(
              "rounded-xl border border-pul-border p-4",
              layout.beginnerRecommended && "ring-1 ring-pul-point/20",
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-bold text-foreground">{layout.name}</h3>
              {layout.beginnerRecommended ? (
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-800 ring-1 ring-emerald-200/70">
                  초보자 추천
                </span>
              ) : null}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm lg:text-base">
              <div>
                <dt className="text-pul-muted">홀 수</dt>
                <dd className="font-bold text-pul-deep">{layout.holes}홀</dd>
              </div>
              <div>
                <dt className="text-pul-muted">난이도</dt>
                <dd className="font-bold text-pul-deep">{layout.difficulty}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-pul-muted">코스 특징</dt>
                <dd className="font-semibold text-foreground">{layout.features}</dd>
              </div>
              <div>
                <dt className="text-pul-muted">바닥 유형</dt>
                <dd className="font-semibold text-foreground">{layout.surface}</dd>
              </div>
              {layout.distance ? (
                <div>
                  <dt className="text-pul-muted">거리</dt>
                  <dd className="font-semibold text-foreground">{layout.distance}</dd>
                </div>
              ) : null}
              {layout.obstacles ? (
                <div className="col-span-2">
                  <dt className="text-pul-muted">주요 장애물</dt>
                  <dd className="font-semibold text-foreground">{layout.obstacles}</dd>
                </div>
              ) : null}
            </dl>
          </article>
        ))}
      </div>
    </Card>
  );
}
