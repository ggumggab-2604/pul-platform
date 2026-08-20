import { EventDetailContent } from "@/components/events/EventDetailContent";
import { Container } from "@/components/ui/Container";
import { EventDirectoryError, getPublicEvent } from "@/lib/events/eventDirectory";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

type EventDetailPageProps = { params: Promise<{ id: string }> };

const getEventByKey = cache(async (eventKey: string) => getPublicEvent(await createClient(), eventKey));

export async function generateMetadata({ params }: EventDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const event = await getEventByKey(id);
    return { title: event.title, description: event.summary };
  } catch {
    return { title: "대회·이벤트 정보" };
  }
}

export default async function EventDetailPage({ params }: EventDetailPageProps) {
  const { id } = await params;
  let event;
  try {
    event = await getEventByKey(id);
  } catch (error) {
    if (error instanceof EventDirectoryError && error.code === "notFound") notFound();
    throw error;
  }

  return (
    <div className="bg-pul-page">
      <Container className="max-w-6xl px-3 py-4 lg:py-8">
        <nav aria-label="경로" className="mb-4 flex flex-wrap items-center gap-2 text-sm text-pul-muted">
          <Link href="/" className="font-semibold hover:text-pul-point">홈</Link><span aria-hidden="true">›</span>
          <Link href="/events" className="font-semibold hover:text-pul-point">대회·이벤트</Link><span aria-hidden="true">›</span>
          <span className="font-bold text-foreground">{event.title}</span>
        </nav>
        <EventDetailContent event={event} />
        <Link href="/events" className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-pul-border bg-white px-4 text-sm font-bold text-pul-deep hover:bg-pul-light sm:w-auto">대회·이벤트 목록으로</Link>
      </Container>
    </div>
  );
}
