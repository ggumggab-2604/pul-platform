"use server";

import { revalidatePath } from "next/cache";

import {
  CertificationSubmissionRequestError,
  submitCertificationSubmissionRequest,
  type CertificationSubmissionRequestInput,
} from "@/lib/certification/certificationSubmissionRequests";
import { createClient } from "@/lib/supabase/server";

export async function submitCertificationSubmissionRequestAction(
  input: CertificationSubmissionRequestInput,
) {
  try {
    const data = await submitCertificationSubmissionRequest(await createClient(), input);
    revalidatePath("/certification/manage/requests");
    return { ok: true as const, data };
  } catch (error) {
    const requestError = error instanceof CertificationSubmissionRequestError ? error : null;
    return {
      ok: false as const,
      code: requestError?.code ?? "unknown",
      error:
        requestError?.userMessage
        ?? "자격증·심판 등록 문의를 접수하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      authenticationRequired: requestError?.code === "authentication",
    };
  }
}
