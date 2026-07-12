"use client";

import { Card } from "@/components/ui/Card";
import type { CourseDetailPageData } from "@/data/courseDetailPageData";
import { Star } from "lucide-react";

type ReviewSummaryProps = {
  detail: CourseDetailPageData;
  onWriteReview: () => void;
};

function RatingBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 text-sm lg:text-base">
      <span className="w-20 shrink-0 font-semibold text-pul-muted">{label}</span>
      <div className="flex flex-1 items-center gap-1">
        {Array.from({ length: 5 }, (_, i) => (
          <Star
            key={i}
            className={`h-4 w-4 ${i < Math.round(value) ? "fill-amber-400 text-amber-400" : "text-gray-300"}`}
            aria-hidden="true"
          />
        ))}
      </div>
      <span className="w-8 text-right font-bold text-pul-deep">{value.toFixed(1)}</span>
    </div>
  );
}

export function ReviewSummary({ detail, onWriteReview }: ReviewSummaryProps) {
  const reviews = detail.reviews;
  const avg =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;
  const avgFacility =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.facilityRating, 0) / reviews.length
      : 0;
  const avgCourse =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.courseRating, 0) / reviews.length
      : 0;
  const avgAccess =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.accessibilityRating, 0) / reviews.length
      : 0;
  const avgCrowd =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.crowdRating, 0) / reviews.length
      : 0;

  return (
    <Card title="이용 후기" dense>
      {reviews.length > 0 ? (
        <>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <p className="text-sm font-semibold text-pul-muted">평균 평점</p>
              <p className="text-3xl font-bold text-pul-deep lg:text-4xl">{avg.toFixed(1)}</p>
              <p className="text-sm text-pul-muted">후기 {reviews.length}건</p>
            </div>
            <div className="min-w-[220px] flex-1 space-y-1.5">
              <RatingBar label="시설" value={avgFacility} />
              <RatingBar label="코스" value={avgCourse} />
              <RatingBar label="접근성" value={avgAccess} />
              <RatingBar label="혼잡도" value={avgCrowd} />
            </div>
          </div>

          <ul className="mt-5 space-y-3">
            {reviews.map((review) => (
              <li
                key={review.id}
                className="rounded-lg border border-pul-border/80 px-3 py-3 lg:px-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-foreground">{review.author}</span>
                  <div className="flex items-center gap-1">
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden="true" />
                    <span className="text-sm font-bold text-pul-deep">{review.rating}</span>
                    <time className="ml-2 text-xs text-pul-muted">{review.date}</time>
                  </div>
                </div>
                <p className="mt-2 text-base leading-relaxed text-pul-muted">{review.content}</p>
                {review.hasPhoto ? (
                  <span className="mt-2 inline-flex rounded-md bg-pul-light px-2 py-0.5 text-xs font-semibold text-pul-deep">
                    사진 후기
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-pul-border bg-pul-light/40 px-4 py-8 text-center">
          <p className="text-lg font-bold text-pul-deep">이 골프장의 첫 후기를 남겨주세요.</p>
          <p className="mt-2 text-base text-pul-muted">
            다른 회원에게 큰 도움이 됩니다. 로그인 후 작성 예정입니다.
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={onWriteReview}
        className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-pul-point px-4 text-base font-bold text-white hover:bg-pul-deep"
      >
        후기 작성하기
      </button>
    </Card>
  );
}
