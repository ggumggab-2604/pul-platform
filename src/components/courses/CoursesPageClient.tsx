"use client";

import { CourseMapExplorer } from "@/components/courses/CourseMapExplorer";
import { CourseInformationReportDialog } from "@/components/courses/CourseInformationReportDialog";
import { CoursePageHero } from "@/components/courses/CoursePageHero";
import { Container } from "@/components/ui/Container";
import { useAuthSessionStatus } from "@/hooks/useAuthSessionStatus";
import type { CourseFilters, PublicCoursePage } from "@/lib/courses/courseDirectory";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  page: PublicCoursePage;
  filters: CourseFilters;
  error?: string;
};

export function CoursesPageClient({ page, filters, error }: Props) {
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
      <CoursePageHero onReport={openReport} />
      <Container className="flex flex-1 flex-col py-3 lg:min-h-0 lg:py-5">
        <CourseMapExplorer page={page} initialFilters={filters} error={error} />
      </Container>
      {showReportModal ? (
        <CourseInformationReportDialog
          trigger={reportTrigger}
          onClose={() => setShowReportModal(false)}
        />
      ) : null}
    </div>
  );
}
