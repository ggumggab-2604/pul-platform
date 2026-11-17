import { hancheon, practicalDates, trainingInstitutions, writtenSubjects } from "@/data/certificationSources";

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
export type PracticalMaterials = Partial<Record<"video" | "yardage", string>>;

export function isPracticalCourseMaterial(scope: string, title: string, course: "A" | "B") {
  const labels = (value: string) => [...value.normalize("NFKC").toUpperCase().matchAll(
    /(?:^|[^A-Z0-9])([A-Z]+(?:\s*[·,/&+~–-]\s*[A-Z]+)*)\s*코스/g,
  )].map((match) => match[1].replace(/[^A-Z]/g, ""));
  const scopeCode = scope.normalize("NFKC").trim().toUpperCase();
  const scoped = /^[A-Z]$/.test(scopeCode) ? [scopeCode] : labels(scopeCode);
  const named = scoped.length ? scoped : labels(title);
  return named.length > 0 && named.every((value) => value === course);
}

export type CertificationContact = { kind: "job" | "talent"; key: string; name: string; binding: string };

export function certificationDetailHref(kind: CertificationContact["kind"], key: string) {
  return `/certification/${kind === "job" ? "jobs" : "talent"}/${encodeURIComponent(key)}`;
}

export function safeCertificationStudyReturn(value: unknown) {
  if (typeof value !== "string" || value.length > 500 || !value.startsWith("/certification?")
      || /[\\\r\n#]/.test(value)) return null;
  const url = new URL(value, "https://pul.invalid");
  if (url.searchParams.get("tab") !== "exam-prep") return null;
  const stage = url.searchParams.get("stage");
  const query = new URLSearchParams({ tab: "exam-prep" });
  if (stage === "practical") {
    const date = practicalDates.find(({ date }) => date === url.searchParams.get("examDate"));
    if (!date || url.searchParams.get("venue") !== hancheon.key) return null;
    query.set("stage", stage);
    query.set("examDate", date.date);
    query.set("venue", hancheon.key);
    query.set("course", url.searchParams.get("course") === "B" ? "B" : "A");
  } else if (stage === "oral" || stage === "training") {
    query.set("stage", stage);
  } else if (stage === "written") {
    query.set("stage", stage);
    const subject = writtenSubjects.find(([key]) => key === url.searchParams.get("subject"))?.[0];
    const question = url.searchParams.get("question");
    if (subject) query.set("subject", subject);
    if (question && /^([1-9]|1[0-9]|20)$/.test(question)) query.set("question", question);
  }
  return `/certification?${query}`;
}

export function certificationStudyTopicTitle(topic: string) {
  if (topic === "practical-hancheon") return hancheon.name + " 질문·후기";
  if (topic.startsWith("training-")) {
    const institution = trainingInstitutions.find(({ key }) => topic === "training-" + key);
    return institution ? institution.name + " 연수 질문·후기" : null;
  }
  if (topic.startsWith("oral-")) {
    const key = topic.slice(5);
    return key === "safety" || key === "local-rules" || certificationUuidPattern.test(key) ? "구술 질문·답변" : null;
  }
  const [, year, subject, question, extra] = topic.split("-");
  const entry = writtenSubjects.find(([key]) => key === subject);
  return topic.startsWith("written-") && year === "2026" && entry && /^([1-9]|1[0-9]|20)$/.test(question) && extra === undefined
    ? `2026년 ${entry[1]} ${question}번 질문·답변` : null;
}
