import { allWrittenSubjects, boryeong, hancheon, trainingInstitutions } from "@/data/certificationSources";
export { safeExamPrepReturn as safeCertificationStudyReturn } from "./examPrepSelection";

export const directoryKeyPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
export const certificationUuidPattern = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

export const courseDetailFields = [
  ["issuer", "발급기관"], ["qualification", "자격명"], ["grade", "급수"], ["registration", "등록번호"],
  ["tuition", "수강료"], ["exam_fee", "검정료"], ["issue_fee", "발급비"],
] as const;
export const jobDetailFields = [
  ["activity_date", "활동일"], ["venue", "구장"], ["issuer", "요구 자격 발급기관"], ["grade", "요구 급수"],
] as const;
export const talentFields = [
  ["qualification", "자격명", 100, true], ["issuer", "발급기관", 100, true], ["grade", "급수", 40, true],
  ["region", "가능 지역", 100, true], ["availability", "활동 가능 일정", 160, false], ["experience", "경력", 500, false],
] as const;

export type TalentProfile = Record<(typeof talentFields)[number][0], string> & {
  id: string;
  nickname: string;
  is_public?: boolean;
  is_owner?: true;
};
export type OralSubmission = {
  id: string; kind: "official" | "recalled"; question: string; answer: string; source_url: string;
  source_note?: string; status?: "pending" | "published" | "hidden";
};
export type DirectoryDetails = {
  details: Record<string, string>;
  version?: number;
  promotion_slug?: string | null;
  event_key?: string | null;
  contact_user_id?: string | null;
  can_contact?: boolean;
};
export type CertificationContact = { kind: "job" | "talent"; key: string; name: string; binding: string };

export function certificationDetailHref(kind: CertificationContact["kind"], key: string) {
  return `/certification/${kind === "job" ? "jobs" : "talent"}/${encodeURIComponent(key)}`;
}

export function certificationStudyTopicTitle(topic: string) {
  if (topic === "practical-hancheon") return hancheon.name + " 질문·후기";
  if (topic === "practical-boryeong") return boryeong.name + " 질문·후기";
  if (topic.startsWith("training-")) {
    const institution = trainingInstitutions.find(({ key }) => topic === "training-" + key);
    return institution ? institution.name + " 연수 질문·후기" : null;
  }
  if (topic.startsWith("oral-")) {
    const key = topic.slice(5);
    return key === "safety" || key === "local-rules" || certificationUuidPattern.test(key) ? "구술 질문·답변" : null;
  }
  const [, year, subject, question, extra] = topic.split("-");
  const entry = allWrittenSubjects.find(([key]) => key === subject);
  return topic.startsWith("written-") && year === "2026" && entry && /^([1-9]|1[0-9]|20)$/.test(question) && extra === undefined
    ? `2026년 ${entry[1]} ${question}번 질문·답변` : null;
}
