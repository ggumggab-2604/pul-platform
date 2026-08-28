import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { EventManagementForm } from "@/components/events/manage/EventManagementForm";
import { Container } from "@/components/ui/Container";
import { EventManagementError, listEventsForManagement } from "@/lib/events/eventManagement";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "새 대회·이벤트 등록" };

export default async function NewEventManagementRoute() {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) redirect("/login?next=/events/manage/new");
  try {
    await listEventsForManagement(context.supabase, { referenceAt: new Date().toISOString() }, 1, 0);
  } catch (error) {
    const message = error instanceof EventManagementError && error.code === "permission"
      ? "새 대회·이벤트를 등록할 권한이 없습니다."
      : "대회·이벤트 운영 권한을 확인하지 못했습니다.";
    return <main className="min-h-screen bg-pul-page"><Container className="max-w-3xl px-3 py-12"><p role="alert" className="rounded-2xl border border-red-200 bg-white p-7 text-center text-lg font-bold text-red-800">{message}</p></Container></main>;
  }
  return <main className="min-h-screen bg-pul-page"><Container className="max-w-4xl px-3 py-6 pb-20 sm:py-10"><EventManagementForm /></Container></main>;
}
