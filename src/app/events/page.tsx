import { EventsPageContent } from "@/components/events/EventsPageContent";
import { Container } from "@/components/ui/Container";
import {
  EventDirectoryError,
  getPublicEventRegionSummaries,
  listPublicEventReviews,
  listPublicEvents,
  type EventFilters,
  type EventRegion,
  type PublicEventPage,
  type RegistrationStatus,
} from "@/lib/events/eventDirectory";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "대회·이벤트",
  description:
    "전국 파크골프 대회, 지역 행사, 체험 이벤트, 스크린 파크골프 이벤트, 동호회 행사를 한곳에서 확인하세요.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const emptyPage: PublicEventPage = { items: [], total: 0, limit: 24, offset: 0, hasMore: false };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function EventsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const requestedPage = Number.parseInt(first(params.page) ?? "1", 10);
  const pageNumber = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const filters: EventFilters = {
    matchType: first(params.type) as EventFilters["matchType"],
    region: first(params.region) as EventRegion | undefined,
    registrationStatus: first(params.registration) as RegistrationStatus | undefined,
  };
  const client = await createClient();
  const [pageResult, regionResult, screenResult, reviewResult] = await Promise.allSettled([
    listPublicEvents(client, filters, 24, (pageNumber - 1) * 24),
    getPublicEventRegionSummaries(client, filters.registrationStatus),
    listPublicEvents(client, { matchType: "screen", region: filters.region, registrationStatus: filters.registrationStatus }, 3, 0),
    listPublicEventReviews(client),
  ]);
  const page = pageResult.status === "fulfilled" ? pageResult.value : { ...emptyPage, offset: (pageNumber - 1) * 24 };
  const error = pageResult.status === "rejected"
    ? pageResult.reason instanceof EventDirectoryError
      ? pageResult.reason.userMessage
      : "대회·이벤트 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
    : undefined;

  return (
    <div className="bg-pul-page">
      <Container className="px-3 py-3 sm:py-4 lg:py-5">
        <EventsPageContent
          key={JSON.stringify({ filters, pageNumber })}
          page={page}
          filters={filters}
          regionSummaries={regionResult.status === "fulfilled" ? regionResult.value : []}
          screenEvents={screenResult.status === "fulfilled" ? screenResult.value.items : []}
          eventReviews={reviewResult.status === "fulfilled" ? reviewResult.value : []}
          error={error}
        />
      </Container>
    </div>
  );
}
