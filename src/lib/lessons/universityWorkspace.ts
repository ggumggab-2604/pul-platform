import type { SupabaseClient } from "@supabase/supabase-js";

export const universityListHref = "/lessons?tab=university-departments";
export const universityHref = (key: string) => "/lessons/university-departments/" + encodeURIComponent(key);
export const universityKey = (key: string) => /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(key);
export const uuid = (value: string) => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
export const contactLabels = { received: "연락 전", contacting: "연락 중", contacted: "연락 완료" } as const;

export type UniversityDetail = {
  department_key: string;
  university_name: string;
  department_name: string;
  summary: string;
  region: string;
  official_url: string | null;
  school_url?: string | null;
  campus?: string | null;
  program_kind?: "degree" | "continuing" | null;
  admissions_url: string | null;
  guide_url: string | null;
  recruitment_title: string | null;
  recruitment_body: string | null;
  recruitment_start: string | null;
  recruitment_end: string | null;
  photo_path: string | null;
  version: number;
  can_manage: boolean;
  student_status: "pending" | "approved" | null;
};
export type UniversityConsultation = {
  id: string; member_name: string; body: string; created_at: string;
  contact_status: keyof typeof contactLabels; contact_note: string | null;
};
export type UniversityStudent = {
  user_id: string; member_name: string; requested_at: string; approved_at: string | null;
};
export type UniversityWorkspace = UniversityDetail & {
  publication_status: "published" | "hidden";
  items: Array<UniversityConsultation | UniversityStudent>;
};
export type UniversityAffiliation = Pick<UniversityDetail,
  "department_key" | "university_name" | "department_name" | "can_manage" | "student_status">;
export type UniversityResult = { ok: boolean; message: string; errors?: Record<string, string> };

export async function readUniversity(client: SupabaseClient, key: string) {
  const { data, error } = await client.rpc("get_university_department_detail", { p_key: key });
  if (error) throw error;
  return data as UniversityDetail | null;
}

export function safeUniversityHref(value: string | null) {
  if (!value || !/^https:\/\/[^/?#]/i.test(value) || /[\s\\\u0000-\u001f\u007f]/u.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && url.href.length <= 500 ? url.href : null;
  } catch { return null; }
}

export const universityPhotoHref = (key: string, version: number) => universityHref(key) + "/photo?v=" + version;
