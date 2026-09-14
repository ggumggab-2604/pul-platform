import type { SupabaseClient } from "@supabase/supabase-js";

export const APPLICANT_RECORD_TYPES = { hole_in_one: "홀인원", albatross: "알바트로스", condor: "콘도르" } as const;
export type ApplicantRecordType = keyof typeof APPLICANT_RECORD_TYPES;
export const HOF_APPLICATION_POLICY = "hof-applicant-2026-10-01";
export const HOF_APPLICANT_STATUS: Record<string, string> = {
  draft: "작성 중", submitted: "접수됨", under_review: "확인 중",
  additional_info_required: "추가 정보 필요", approved: "승인", rejected: "반려",
  partially_approved: "일부 승인", withdrawn: "철회", cancelled: "취소",
  pending: "확인 대기", confirmed: "동반 확인 완료", declined: "확인 거절", expired: "확인 기한 만료",
  available: "검증 완료", pending_upload: "첨부 미완료", uploaded_unverified: "검증 대기", failed: "첨부 실패",
};
export type ApplicantRound = { played_on: string; course_name: string; course_region: string; course_environment: string; round_type: string };
export type ApplicantRecord = {
  id: string; version: number; status: string; record_type_code: ApplicantRecordType;
  course_segment: string; hole_number: number; hole_par: number | null; strokes: number | null;
  processing_consent: boolean; review_consent: boolean; publication_consent: boolean;
  evidence: { id: string; version: number; status: string; evidence_type: string }[];
  confirmations: { id: string; status: string; active: boolean }[];
};
export type ApplicantBatch = {
  id: string; version: number; status: string; application_type: string; context_club_id: string | null;
  round: ApplicantRound | null; records: ApplicantRecord[];
};
export type IncomingConfirmation = {
  id: string; batch_version: number; status: string; expires_at: string; played_on: string;
  course_name: string; course_segment: string; hole_number: number; hole_par: number | null;
  strokes: number | null; record_type_code: ApplicantRecordType;
};
export type ApplicantWorkspace = {
  record_types: { code: ApplicantRecordType; name: string }[];
  applications: ApplicantBatch[]; incoming_confirmations: IncomingConfirmation[];
};
export type ApplicantEligibility = {
  eligibility_code: string; can_create_direct_application: boolean;
  vacant_context_clubs: { club_id: string; membership_id: string; club_name: string }[];
};
export type ApplicantInput = ApplicantRound & {
  record_type_code: ApplicantRecordType; course_segment: string;
  hole_number: number; hole_par: number | null; strokes: number;
};
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
export function validateApplicantInput(value: unknown): ApplicantInput {
  if (!value || typeof value !== "object") throw new Error("HOF_INVALID_RECORD");
  const input = value as Record<string, unknown>;
  const text = (key: string, max: number) => {
    const v = input[key];
    if (typeof v !== "string" || !v.trim() || v.trim().length > max) throw new Error("HOF_INVALID_RECORD");
    return v.trim();
  };
  const type = text("record_type_code", 30);
  if (!Object.hasOwn(APPLICANT_RECORD_TYPES, type)) throw new Error("HOF_INVALID_RECORD");
  const played = text("played_on", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(played) || !Number.isFinite(Date.parse(played)) || new Date(played).toISOString().slice(0, 10) !== played) throw new Error("HOF_INVALID_ROUND_SNAPSHOT");
  const hole = input.hole_number, par = input.hole_par, strokes = input.strokes;
  if (typeof hole !== "number" || !Number.isInteger(hole) || hole < 1 || hole > 36 ||
    typeof strokes !== "number" || !Number.isInteger(strokes) || strokes < 1 || strokes > 99 ||
    (par !== null && (typeof par !== "number" || !Number.isInteger(par) || par < 1 || par > 9))) throw new Error("HOF_INVALID_RECORD");
  if (type === "hole_in_one" ? strokes !== 1 : typeof par !== "number" || par - strokes < (type === "albatross" ? 3 : 4)) throw new Error("HOF_RECORD_QUALIFICATION_NOT_MET");
  const environment = text("course_environment", 10), roundType = text("round_type", 20);
  if (!["outdoor", "screen"].includes(environment) || !["casual", "club_event", "tournament", "practice"].includes(roundType)) throw new Error("HOF_INVALID_ROUND_SNAPSHOT");
  return { played_on: played, course_name: text("course_name", 200), course_region: text("course_region", 100),
    course_environment: environment, round_type: roundType, record_type_code: type as ApplicantRecordType,
    course_segment: text("course_segment", 100), hole_number: hole, hole_par: par as number | null, strokes };
}
export function applicantError(error: unknown): string {
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
  if (/AUTHENTICATION_REQUIRED/.test(message)) return "로그인 후 다시 시도해 주세요.";
  if (/ACCOUNT_NOT_ACTIVE|MEMBERSHIP_SUSPENDED/.test(message)) return "현재 계정 또는 동호회 활동 상태로는 신청할 수 없습니다.";
  if (/NOMINATION_REQUIRED|NOT_ELIGIBLE|NOT_ALLOWED|VACANCY|MEMBERSHIP|NOT_AUTHORIZED|NOT_EDITABLE|FORBIDDEN|ACTIVE_CONFIRMER/.test(message)) return "신청 자격 또는 처리 권한을 확인할 수 없습니다. 최신 상태를 확인해 주세요.";
  if (/DUPLICATE/.test(message)) return "같은 기록이 이미 신청되었거나 승인되었습니다. 내 신청과 내 기록을 확인해 주세요.";
  if (/STALE|PT409|ALREADY|UNRESOLVED/.test(message)) return "처리 상태가 바뀌었습니다. 최신 상태를 확인한 뒤 다시 시도해 주세요.";
  if (/COMPANION_CONFIRMATION_REQUIRED/.test(message)) return "다른 활성 회원의 동반 확인이 필요합니다.";
  if (/CONSENT/.test(message)) return "신청 처리·증빙 검토·공개 범위 동의를 모두 확인해 주세요.";
  if (/EVIDENCE|SCORECARD/.test(message)) return "스코어카드 첨부를 완료하지 못했습니다. 첨부 상태를 확인하고 다시 시도해 주세요.";
  if (/INVALID|QUALIFICATION|REQUIRED/.test(message)) return "필수 입력과 기록 조건을 확인해 주세요.";
  return "요청을 처리하지 못했습니다. 최신 상태를 확인한 뒤 다시 시도해 주세요.";
}
export async function applicantRpc(client: SupabaseClient, name: string, args: Record<string, unknown> = {}) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(error.message);
  if (data == null) throw new Error("HOF_RESPONSE_INVALID");
  return data;
}
export async function loadApplicantWorkspace(client: SupabaseClient, batchId: string | null = null, offset = 0): Promise<ApplicantWorkspace> {
  const data = await applicantRpc(client, "get_my_hall_of_fame_application_workspace", { p_application_batch_id: batchId, p_offset: offset });
  if (!data || !Array.isArray(data.applications) || !Array.isArray(data.incoming_confirmations) || !Array.isArray(data.record_types)) throw new Error("HOF_RESPONSE_INVALID");
  return data as ApplicantWorkspace;
}
export async function loadApplicantEligibility(client: SupabaseClient): Promise<ApplicantEligibility> {
  const data = await applicantRpc(client, "get_current_user_hall_of_fame_application_eligibility");
  const row = data[0];
  if (!row || typeof row.can_create_direct_application !== "boolean" || !Array.isArray(row.vacant_context_clubs)) throw new Error("HOF_RESPONSE_INVALID");
  return row;
}
export function directApplicationContext(eligibility: ApplicantEligibility, clubId: unknown) {
  if (!eligibility.can_create_direct_application) throw new Error("HOF_NOT_ELIGIBLE");
  if (eligibility.eligibility_code === "direct_application_allowed") {
    return { applicationType: "direct_application", clubId: null, membershipId: null };
  }
  const club = eligibility.vacant_context_clubs.find(c => c.club_id === clubId);
  if (eligibility.eligibility_code !== "direct_application_allowed_due_to_admin_vacancy" || !club) throw new Error("HOF_INVALID_APPLICATION_CONTEXT");
  return { applicationType: "club_admin_vacancy_direct_application", clubId: club.club_id, membershipId: club.membership_id };
}
