"use server";

import { revalidatePath } from "next/cache";

import {
  CourseDirectoryError,
  submitCourseInformationReport,
  type CourseInformationReportInput,
} from "@/lib/courses/courseDirectory";
import {
  CourseDiscussionError,
  submitCourseDiscussionPost,
} from "@/lib/courses/courseDiscussions";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export async function submitCourseInformationReportAction(input: CourseInformationReportInput) {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) {
    return {
      ok: false as const,
      error: "로그인이 필요합니다.",
      authenticationRequired: true,
    };
  }
  try {
    const data = await submitCourseInformationReport(context.supabase, input);
    revalidatePath("/courses");
    if (input.courseKey) revalidatePath(`/courses/${input.courseKey}`);
    return { ok: true as const, data };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof CourseDirectoryError
          ? error.userMessage
          : "골프장 정보 제보를 접수하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      authenticationRequired:
        error instanceof CourseDirectoryError && error.code === "authentication",
    };
  }
}

export async function submitCourseDiscussionPostAction(input: {
  courseKey: string;
  body: string;
}) {
  try {
    const data = await submitCourseDiscussionPost(
      await createClient(),
      input.courseKey,
      input.body,
    );
    revalidatePath(`/courses/${input.courseKey}`);
    revalidatePath(`/courses/${input.courseKey}/stories`);
    return { ok: true as const, data };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof CourseDiscussionError
          ? error.userMessage
          : "골프장 이야기를 등록하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      authenticationRequired:
        error instanceof CourseDiscussionError && error.code === "authentication",
    };
  }
}
