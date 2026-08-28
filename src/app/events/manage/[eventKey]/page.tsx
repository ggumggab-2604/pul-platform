import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { EventManagementForm } from "@/components/events/manage/EventManagementForm";
import { Container } from "@/components/ui/Container";
import { EventManagementError, getEventForManagement } from "@/lib/events/eventManagement";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "대회·이벤트 정보 수정" };

export default async function EditEventManagementRoute({ params }: { params: Promise<{ eventKey: string }> }) {
  const { eventKey } = await params;
  const context = await getAuthenticatedSupabaseContext();
  if (!context) redirect(`/login?next=/events/manage/${encodeURIComponent(eventKey)}`);
  let event;
  try {
    event = await getEventForManagement(context.supabase, eventKey, new Date().toISOString());
  } catch (error) {
    if (error instanceof EventManagementError && error.code === "notFound") notFound();
    const message = error instanceof EventManagementError && error.code === "permission"
      ? "대회·이벤트 정보를 수정할 권한이 없습니다."
      : "대회·이벤트 운영 정보를 불러오지 못했습니다.";
    return <main className="min-h-screen bg-pul-page"><Container className="max-w-3xl px-3 py-12"><p role="alert" className="rounded-2xl border border-red-200 bg-white p-7 text-center text-lg font-bold text-red-800">{message}</p></Container></main>;
  }
  return <main className="min-h-screen bg-pul-page"><Container className="max-w-4xl px-3 py-6 pb-20 sm:py-10"><EventManagementForm event={event} /></Container></main>;
}
