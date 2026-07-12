import { Card } from "@/components/ui/Card";
import type { CourseDetailPageData } from "@/data/courseDetailPageData";

export function ReservationGuide({ detail }: { detail: CourseDetailPageData }) {
  const guide = detail.reservationGuide;

  return (
    <Card title="이용방법 및 예약안내" dense>
      <ol className="space-y-3">
        {guide.steps.map((step, index) => (
          <li key={step} className="flex gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pul-point text-sm font-bold text-white lg:h-9 lg:w-9 lg:text-base">
              {index + 1}
            </span>
            <p className="pt-1 text-base leading-relaxed text-pul-muted">{step}</p>
          </li>
        ))}
      </ol>

      <dl className="mt-5 grid gap-2.5 sm:grid-cols-2">
        {guide.openTime ? (
          <div className="rounded-lg bg-pul-light/60 px-3 py-2.5">
            <dt className="text-xs font-semibold text-pul-muted">예약 오픈</dt>
            <dd className="text-sm font-bold text-pul-deep lg:text-base">{guide.openTime}</dd>
          </div>
        ) : null}
        {guide.individual ? (
          <div className="rounded-lg bg-pul-light/60 px-3 py-2.5">
            <dt className="text-xs font-semibold text-pul-muted">개인 예약</dt>
            <dd className="text-sm font-bold text-pul-deep lg:text-base">{guide.individual}</dd>
          </div>
        ) : null}
        {guide.group ? (
          <div className="rounded-lg bg-pul-light/60 px-3 py-2.5">
            <dt className="text-xs font-semibold text-pul-muted">단체 예약</dt>
            <dd className="text-sm font-bold text-pul-deep lg:text-base">{guide.group}</dd>
          </div>
        ) : null}
        {guide.walkIn ? (
          <div className="rounded-lg bg-pul-light/60 px-3 py-2.5">
            <dt className="text-xs font-semibold text-pul-muted">현장 접수</dt>
            <dd className="text-sm font-bold text-pul-deep lg:text-base">{guide.walkIn}</dd>
          </div>
        ) : null}
        {guide.cancelPolicy ? (
          <div className="rounded-lg bg-pul-light/60 px-3 py-2.5">
            <dt className="text-xs font-semibold text-pul-muted">취소 규정</dt>
            <dd className="text-sm font-bold text-pul-deep lg:text-base">{guide.cancelPolicy}</dd>
          </div>
        ) : null}
        {guide.idRequired ? (
          <div className="rounded-lg bg-pul-light/60 px-3 py-2.5">
            <dt className="text-xs font-semibold text-pul-muted">신분증</dt>
            <dd className="text-sm font-bold text-pul-deep lg:text-base">{guide.idRequired}</dd>
          </div>
        ) : null}
        {guide.residentPriority ? (
          <div className="rounded-lg bg-pul-light/60 px-3 py-2.5">
            <dt className="text-xs font-semibold text-pul-muted">지역 주민 우선</dt>
            <dd className="text-sm font-bold text-pul-deep lg:text-base">{guide.residentPriority}</dd>
          </div>
        ) : null}
      </dl>

      <p className="mt-4 rounded-lg border border-amber-200/60 bg-amber-50/80 px-3 py-2.5 text-sm font-medium text-amber-900 lg:text-base">
        방문 전 공식 운영기관에 다시 확인해 주세요.
      </p>
    </Card>
  );
}
