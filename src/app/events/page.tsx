import { EventsPageContent } from "@/components/events/EventsPageContent";
import { Container } from "@/components/ui/Container";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "대회·이벤트",
  description:
    "전국 파크골프 대회, 지역 행사, 체험 이벤트, 스크린 파크골프 이벤트, 동호회 행사를 한곳에서 확인하세요.",
};

export default function EventsPage() {
  return (
    <div className="bg-pul-page">
      <Container className="px-3 py-3 sm:py-4 lg:py-5">
        <EventsPageContent />
      </Container>
    </div>
  );
}
