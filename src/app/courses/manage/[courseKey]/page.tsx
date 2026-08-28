import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { CourseManagementForm } from "@/components/courses/manage/CourseManagementForm";
import { Container } from "@/components/ui/Container";
import { CourseManagementError, getCourseForManagement } from "@/lib/courses/courseManagement";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "골프장 정보 수정" };

export default async function EditCourseManagementRoute({ params }: { params: Promise<{ courseKey: string }> }) {
  const { courseKey } = await params;
  const context = await getAuthenticatedSupabaseContext();
  if (!context) redirect(`/login?next=/courses/manage/${encodeURIComponent(courseKey)}`);
  let course;
  try {
    course = await getCourseForManagement(context.supabase, courseKey);
  } catch (error) {
    if (error instanceof CourseManagementError && error.code === "notFound") notFound();
    const message = error instanceof CourseManagementError && error.code === "permission"
      ? "골프장 정보를 수정할 권한이 없습니다."
      : "골프장 운영 정보를 불러오지 못했습니다.";
    return <div className="min-h-screen bg-pul-page"><Container className="max-w-3xl px-3 py-12"><p role="alert" className="rounded-2xl border border-red-200 bg-white p-7 text-center text-lg font-bold text-red-800">{message}</p></Container></div>;
  }
  return <div className="min-h-screen bg-pul-page"><Container className="max-w-4xl px-3 py-6 pb-20 sm:py-10"><CourseManagementForm course={course} /></Container></div>;
}
