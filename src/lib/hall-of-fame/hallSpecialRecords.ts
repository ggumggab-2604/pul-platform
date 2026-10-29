import type { SupabaseClient } from "@supabase/supabase-js";

export const specialTypes = { condor: "콘도르", albatross: "알바트로스", hole_in_one: "홀인원" } as const;
export type SpecialType = keyof typeof specialTypes;
export type SpecialMember = { key: string; name: string; primary_club: string | null; hole_in_one: number; albatross: number; condor: number };
export type SpecialRecord = { id: string; member_key: string | null; name: string; record_type_code: SpecialType; played_on: string; course_name: string; course_region: string; course_environment: string; course_segment: string; hole_number: number; hole_par: number; strokes: number; club_name: string | null; photos: string[] };
export type SpecialPage = { items: SpecialRecord[]; total: number };
export type SpecialApplication = Omit<SpecialRecord, "id" | "member_key" | "photos"> & { application_record_id: string; version: number; status: string; started_at: string; club_id: string | null; record_id: string | null; record_version: number | null; validity: string | null; can_review: boolean; can_correct: boolean; can_revoke: boolean; can_submit: boolean; companion_name: string | null; companion_contact: string | null; photos: { id: string; purpose: string }[] };
export type SpecialWorkspace = { viewer_id: string; clubs: { id: string; key: string; name: string; can_review: boolean }[]; items: SpecialApplication[] };
export const specialPhotoUrl = (id: string) => `/hall-of-fame/special/photos/${encodeURIComponent(id)}`;

const errors: Record<string, string> = {
 HOF_DUPLICATE_EVENT: "같은 날짜·구장·코스·홀에 이미 신청하거나 등록한 기록이 있습니다. 시작 시각·기록 종류·동호회가 달라도 중복 등록할 수 없습니다.",
 SPECIAL_PHOTO_LIMIT: "사진 첨부 한도에 도달했습니다. 작성 중인 사진은 같은 파일로 다시 시도해 주세요.",
 SPECIAL_PAR_STROKES_TYPE_MISMATCH: "파3·1타는 홀인원, 파4·1타는 알바트로스, 파5·1타는 콘도르만 등록할 수 있습니다.",
 SPECIAL_STALE_VERSION: "다른 처리가 먼저 반영됐습니다. 새로고침 후 확인해 주세요.",
 SPECIAL_STALE_RECORD: "기록이 이미 정정·취소됐습니다. 새로고침 후 확인해 주세요.",
 SPECIAL_PRIVATE_PROOF_REQUIRED: "비공개 스코어 사진·동반자 사진·동반자 이름과 연락처가 필요합니다.",
 SPECIAL_ROUND_START_REQUIRED: "달성일과 같은 날짜의 라운드 시작 시각을 입력해 주세요.",
};
export async function specialRpc<T>(client: SupabaseClient, name: string, args = {}): Promise<T> {
 const { data, error } = await client.rpc(name, args);
 if (error) {
  if (error.code === "23505" && error.message.includes("open_draft")) throw Error("작성 중인 기록이 있습니다. 내 등록 목록에서 이어가거나 작성 취소해 주세요.");
  if (error.code === "23505") throw Error("같은 날짜·구장·코스·홀의 기록이 이미 있습니다. 시작 시각이 달라도 중복 등록할 수 없습니다.");
  throw Error(errors[error.message] ?? (error.code === "42501" ? "현재 계정의 소속·역할로 처리할 수 없습니다. 다시 로그인해 확인해 주세요." : "처리하지 못했습니다. 입력은 유지됩니다. 상태를 새로 확인하고 다시 시도해 주세요."));
 }
 return data as T;
}

