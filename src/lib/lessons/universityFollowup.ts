export const universityApplications = "/lessons/university-applications";
export const universityReview = "/lessons/manage/university-departments/applications";
export const applicationStatus = { pending: "심사 대기", revision: "보완 요청", approved: "승인", rejected: "반려" } as const;
export type Application = {
  id: string; kind: "opening" | "manager"; status: keyof typeof applicationStatus;
  details: Record<string, string | null>; photo_path: string | null; note: string | null;
  version: number; department_key: string | null; university_name: string | null;
  department_name: string | null; publication_status: "published" | "hidden" | null;
};
export const openingFields = [
  ["university_name", "대학·교육기관명", 160, true],
  ["department_name", "학과·과정명", 160, true],
  ["campus", "캠퍼스", 120, true],
  ["summary", "학과·과정 소개", 1000, true],
  ["school_url", "학교 공식 홈페이지 URL", 500, true],
  ["official_url", "학과·과정 공식 페이지 URL", 500, false],
  ["recruitment_start", "모집 시작일", 10, false],
  ["recruitment_end", "모집 마감일", 10, false],
  ["guide_url", "공식 모집요강 URL", 500, false],
  ["admissions_url", "공식 원서접수 URL", 500, false],
] as const;
export const applicantFields = [
  ["applicant_name", "신청자 이름", 100, true],
  ["position", "소속·직책", 160, true],
  ["contact", "대학 공식 이메일 또는 부서 전화번호", 160, true],
  ["verification", "담당 권한을 확인할 공식 페이지 또는 설명", 1000, true],
] as const;
export const sections = { notice: "공지사항", story: "이야기방", photos: "활동사진", event: "모임·월례회" } as const;
export type SpaceKind = "notice" | "story" | "event";
export type SpaceEntry = {
  id: string; title: string; body: string; author: string; created_at: string; own: boolean;
  has_photo: boolean; version: number; event_date: string | null; event_time: string | null;
  place: string | null; participants: number | null; joined: boolean;
};
export type Space = { school: string; name: string; manager: boolean; student: boolean; items: SpaceEntry[] };

