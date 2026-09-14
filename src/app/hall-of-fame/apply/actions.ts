"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import {
  applicantError, applicantRpc, directApplicationContext, HOF_APPLICATION_POLICY,
  isUuid, loadApplicantEligibility, loadApplicantWorkspace, validateApplicantInput,
} from "@/lib/hall-of-fame/hallOfFameApplicant";
import { createHallOfFameEvidenceUploadIntent, finalizeHallOfFameEvidence, withdrawHallOfFameEvidence } from "@/lib/hall-of-fame/hallOfFameEvidenceStorage";
import { isHallOfFameEvidenceMimeType } from "@/lib/hall-of-fame/hallOfFameEvidenceValidation";

export type ApplicantActionInput = {
  operation: "create" | "save" | "consent" | "requestConfirmation" | "respond" | "submit" | "discard" | "upload" | "finalize" | "withdrawEvidence";
  sessionUserId: string; requestId: string; batchId?: string; expectedVersion?: number;
  clubId?: string; fields?: unknown; consents?: boolean[]; confirmerCode?: string;
  confirmationId?: string; response?: "confirm" | "decline";
  evidenceId?: string; mimeType?: string; byteSize?: number;
};
export type ApplicantActionResult = {
  ok: boolean; message: string; batchId?: string; submitted?: boolean;
  upload?: Awaited<ReturnType<typeof createHallOfFameEvidenceUploadIntent>>;
};

export async function performApplicantAction(input: ApplicantActionInput): Promise<ApplicantActionResult> {
  try {
    const context = await getAuthenticatedSupabaseContext();
    if (!context || input?.sessionUserId !== context.userId) throw new Error("HOF_AUTHENTICATION_REQUIRED");
    if (!isUuid(input.requestId)) throw new Error("HOF_INVALID_REQUEST");
    const client = context.supabase;
    const call = async (name: string, args: Record<string, unknown>) => {
      const data = await applicantRpc(client, name, args);
      const row = data[0];
      if (!row || !Number.isSafeInteger(row.batch_version)) throw new Error("HOF_RESPONSE_INVALID");
      return row;
    };
    if (input.operation === "create") {
      const path = directApplicationContext(await loadApplicantEligibility(client), input.clubId);
      const result = await call("create_hall_of_fame_application_draft", {
        p_application_type: path.applicationType, p_context_club_id: path.clubId, p_request_id: input.requestId,
      });
      revalidatePath("/hall-of-fame/apply");
      return { ok: true, message: "작성할 신청이 준비되었습니다. 아직 접수 전입니다.", batchId: result.application_batch_id };
    }
    if (!Number.isSafeInteger(input.expectedVersion) || (input.expectedVersion ?? 0) < 1) throw new Error("HOF_INVALID_REQUEST");
    if (input.operation === "respond") {
      if (!isUuid(input.confirmationId) || !["confirm", "decline"].includes(input.response ?? "")) throw new Error("HOF_INVALID_REQUEST");
      // The RPC verifies the designated confirmer against auth.uid(); no client actor is forwarded.
      await call("respond_hall_of_fame_record_confirmation", {
        p_confirmation_id: input.confirmationId, p_response: input.response,
        p_expected_batch_version: input.expectedVersion, p_request_id: input.requestId,
      });
      revalidatePath("/hall-of-fame/apply");
      return { ok: true, message: input.response === "confirm" ? "동반 확인을 완료했습니다." : "확인 요청을 거절했습니다." };
    }
    if (!isUuid(input.batchId)) throw new Error("HOF_INVALID_REQUEST");
    const workspace = await loadApplicantWorkspace(client, input.batchId);
    const batch = workspace.applications.find(b => b.id === input.batchId);
    if (!batch || batch.status !== "draft" || batch.records.length > 1) throw new Error("HOF_APPLICATION_NOT_EDITABLE");
    if (batch.version !== input.expectedVersion) throw new Error("HOF_STALE_APPLICATION_VERSION");
    const record = batch.records[0];
    let version = batch.version;
    const args = () => ({ p_application_batch_id: batch.id, p_expected_batch_version: version, p_request_id: input.requestId });
    let upload: ApplicantActionResult["upload"];
    if (input.operation === "save") {
      if (record) throw new Error("HOF_APPLICATION_NOT_EDITABLE");
      const fields = validateApplicantInput(input.fields);
      const path = directApplicationContext(await loadApplicantEligibility(client), batch.context_club_id);
      if (path.applicationType !== batch.application_type) throw new Error("HOF_NOT_ELIGIBLE");
      const round = await call("set_hall_of_fame_round_snapshot", {
        ...args(), p_played_on: fields.played_on, p_started_at: null,
        p_course_name: fields.course_name, p_course_region: fields.course_region,
        p_course_environment: fields.course_environment, p_round_type: fields.round_type,
        p_course_layout: null, p_event_name: null, p_notes: null,
      });
      version = round.batch_version;
      await call("add_hall_of_fame_application_record", {
        ...args(), p_request_id: randomUUID(), p_target_user_id: context.userId,
        p_target_membership_id: path.membershipId, p_record_type_code: fields.record_type_code,
        p_course_segment: fields.course_segment, p_hole_number: fields.hole_number,
        p_hole_par: fields.hole_par, p_strokes: fields.strokes,
      });
    } else if (input.operation === "discard") {
      await call("withdraw_hall_of_fame_application_draft", { ...args(), p_reason: "신청자가 작성 중인 신청을 취소함" });
    } else {
      if (!record) throw new Error("HOF_INVALID_RECORD");
      if (input.operation === "consent") {
        if (!Array.isArray(input.consents) || input.consents.length !== 3 || !input.consents.every(v => v === true)) throw new Error("HOF_REQUIRED_CONSENT_MISSING");
        for (const purpose of ["application_processing", "evidence_review"]) {
          const result = await call("set_hall_of_fame_application_consent", {
            p_application_record_id: record.id, p_consent_purpose: purpose, p_decision: "grant",
            p_policy_version: HOF_APPLICATION_POLICY, p_expected_batch_version: version, p_request_id: randomUUID(),
          });
          version = result.batch_version;
        }
        await call("set_hall_of_fame_publication_consent", {
          p_application_record_id: record.id, p_decision: "set", p_policy_version: HOF_APPLICATION_POLICY,
          p_publish_masked_display_name: true, p_publish_full_display_name: false,
          p_publish_record_date: true, p_publish_course_details: true, p_publish_avatar: false,
          p_publish_club_name: false, p_publish_badge: false,
          p_expected_batch_version: version, p_request_id: randomUUID(),
        });
      } else if (input.operation === "requestConfirmation") {
        const code = input.confirmerCode?.trim();
        if (!isUuid(code)) throw new Error("HOF_INVALID_CONFIRMATION_REQUEST");
        await call("request_hall_of_fame_record_confirmation", {
          p_application_record_id: record.id, p_confirmer_user_id: code,
          p_expected_batch_version: version, p_request_id: input.requestId,
        });
      } else if (input.operation === "upload") {
        if (!isHallOfFameEvidenceMimeType(input.mimeType ?? "") || !Number.isSafeInteger(input.byteSize) || (input.byteSize ?? 0) < 1 || (input.byteSize ?? 0) > 10485760) throw new Error("HOF_EVIDENCE_SIZE_INVALID");
        upload = await createHallOfFameEvidenceUploadIntent({ applicationRecordId: record.id, evidenceType: "scorecard",
          declaredMimeType: input.mimeType as "image/jpeg" | "image/png" | "image/webp" | "application/pdf",
          declaredByteSize: input.byteSize!, expectedBatchVersion: version, requestId: input.requestId });
      } else if (input.operation === "finalize" || input.operation === "withdrawEvidence") {
        const evidence = record.evidence.find(e => e.id === input.evidenceId);
        if (!evidence) throw new Error("HOF_EVIDENCE_NOT_AUTHORIZED");
        const payload = { evidenceId: evidence.id, expectedEvidenceVersion: evidence.version, expectedBatchVersion: version, requestId: input.requestId };
        if (input.operation === "finalize") await finalizeHallOfFameEvidence(payload);
        else await withdrawHallOfFameEvidence(payload);
      } else if (input.operation === "submit") {
        const result = await call("submit_hall_of_fame_application", args());
        if (result.status !== "submitted") throw new Error("HOF_RESPONSE_INVALID");
        revalidatePath("/hall-of-fame");
        revalidatePath("/hall-of-fame/apply");
        revalidatePath("/hall-of-fame/manage");
        return { ok: true, message: "신청이 접수되었습니다. 검토 후 승인 여부가 결정됩니다.", submitted: true };
      } else throw new Error("HOF_INVALID_REQUEST");
    }
    revalidatePath("/hall-of-fame/apply");
    revalidatePath("/hall-of-fame");
    return { ok: true, message: "저장했습니다. 신청 내용을 확인해 주세요.", batchId: batch.id, ...(upload ? { upload } : {}) };
  } catch (error) {
    // Earlier RPCs can have succeeded. Refresh the recoverable draft after partial failure.
    revalidatePath("/hall-of-fame/apply");
    return { ok: false, message: applicantError(error) };
  }
}
