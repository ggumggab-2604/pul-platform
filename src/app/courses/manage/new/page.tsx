import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CourseManagementForm } from "@/components/courses/manage/CourseManagementForm";
import { Container } from "@/components/ui/Container";
import { CourseManagementError, listCoursesForManagement } from "@/lib/courses/courseManagement";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "새 골프장 등록" };

export default async function NewCourseManagementRoute() {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) redirect("/login?next=/courses/manage/new");
  try {
    await listCoursesForManagement(context.supabase, undefined, undefined, undefined, 1, 0);
  } catch (error) {
    const message = error instanceof CourseManagementError && error.code === "permission"
      ? "새 골프장을 등록할 권한이 없습니다."
      : "골프장 운영 권한을 확인하지 못했습니다.";
    return <div className="min-h-screen bg-pul-page"><Container className="max-w-3xl px-3 py-12"><p role="alert" className="rounded-2xl border border-red-200 bg-white p-7 text-center text-lg font-bold text-red-800">{message}</p></Container></div>;
  }
  return <div className="min-h-screen bg-pul-page"><Container className="max-w-4xl px-3 py-6 pb-20 sm:py-10"><CourseManagementForm /></Container></div>;
}
