"use server";

import { revalidatePath } from "next/cache";

import {
  CourseDirectoryError,
  submitCourseInformationReport,
  type CourseInformationReportInput,
} from "@/lib/courses/courseDirectory";
import { createClient } from "@/lib/supabase/server";

export async function submitCourseInformationReportAction(input: CourseInformationReportInput) {
  try {
    const data = await submitCourseInformationReport(await createClient(), input);
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
