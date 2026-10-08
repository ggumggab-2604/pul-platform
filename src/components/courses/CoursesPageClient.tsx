"use client";
import type { CourseRegionOption } from "@/lib/courses/courseRegions";
import type { CourseView } from "@/lib/courses/courseNavigation";

import { CourseMapExplorer } from "@/components/courses/CourseMapExplorer";
import { CourseInformationReportDialog } from "@/components/courses/CourseInformationReportDialog";
import { CoursePageHero } from "@/components/courses/CoursePageHero";
import { PromotionBanner } from "@/components/promotions/PromotionBanner";
import { Container } from "@/components/ui/Container";
import { useAuthSessionStatus } from "@/hooks/useAuthSessionStatus";
import type { CourseFilters, PublicCoursePage } from "@/lib/courses/courseDirectory";
import type { ActiveSlotPromotion } from "@/lib/promotions/promotionDirectory";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  view: CourseView;
  regionOptions: CourseRegionOption[];
  regionError: boolean;
  page: PublicCoursePage;
  filters: CourseFilters;
  error?: string;
  promotion: ActiveSlotPromotion | null;
  secondPromotion: ActiveSlotPromotion | null;
};

export function CoursesPageClient({ page, filters, error, promotion, secondPromotion, view, regionOptions, regionError }: Props) {
  const router = useRouter();
  const authStatus = useAuthSessionStatus();
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportTrigger, setReportTrigger] = useState<HTMLElement | null>(null);

  const openReport = () => {
    if (authStatus === "signedOut") {
      router.push("/login?next=/courses");
      return;
    }
    if (authStatus !== "signedIn") return;
    setReportTrigger(document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setShowReportModal(true);
  };

  return (
    <div className="bg-pul-page lg:flex lg:min-h-[calc(100vh-9rem)] lg:flex-col">
      <CoursePageHero />
      {promotion ? (
        <Container className="px-3 pt-3 lg:pt-5">
          <PromotionBanner promotion={promotion} variant="horizontal" />
        </Container>
      ) : null}
      <Container className="flex flex-1 flex-col py-3 lg:min-h-0 lg:py-5">
        <CourseMapExplorer page={page} view={view} regionOptions={regionOptions} regionError={regionError} initialFilters={filters} error={error} />
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-sm text-pul-muted"><span>찾는 구장이 없나요?</span><button className="min-h-11 font-bold text-pul-deep underline" onClick={openReport}>구장 제보</button></div>
      </Container>
      {secondPromotion ? (
        <Container className="px-3 pb-3 lg:pb-5">
          <PromotionBanner promotion={secondPromotion} variant="horizontal" />
        </Container>
      ) : null}
      {showReportModal ? (
        <CourseInformationReportDialog
          trigger={reportTrigger}
          onClose={() => setShowReportModal(false)}
        />
      ) : null}
    </div>
  );
}
