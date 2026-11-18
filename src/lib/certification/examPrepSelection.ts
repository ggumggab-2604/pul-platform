import {
  examPractical, examQualifications, examWritten, examYears, studyStages,
} from "@/data/certificationSources";

const questionPattern = /^([1-9]|1[0-9]|20)$/;
const selectionKeys = ["qualification", "grade", "year", "stage", "examDate", "venue", "course", "subject", "question"] as const;

export function readExamPrep(params: Pick<URLSearchParams, "get">) {
  const input = params.get("qualification");
  const qualification = input && Object.hasOwn(examQualifications, input) ? input as keyof typeof examQualifications : "life";
  const hasGrades = qualification === "life" || qualification === "disability";
  const grade = hasGrades ? params.get("grade") === "1" ? "1" : "2" : "";
  const year = examYears.find((value) => value === params.get("year")) ?? examYears[0];
  const stage = studyStages.find(([key]) => key === params.get("stage"))?.[0] ?? "written";
  const key = qualification + grade;
  const written = examWritten[key];
  const subject = [...written.required, ...written.optional].find((value) => value === params.get("subject"))
    ?? written.required[0] ?? written.optional[0];
  const rawQuestion = params.get("question") ?? "";
  const question = questionPattern.test(rawQuestion) ? rawQuestion : "1";
  const practical = examPractical[year]?.[key];
  const date = practical?.dates.find(({ date }) => date === params.get("examDate")) ?? practical?.dates[0];
  const course = practical?.courses.find((item) => item === params.get("course")) ?? practical?.courses[0] ?? "";
  return { qualification, grade, year, stage, key, written, subject, question, practical, date, course, venue: practical?.venue ?? "" };
}

export function examPrepHref(state: ReturnType<typeof readExamPrep>, changes: Record<string, string> = {}) {
  const query = new URLSearchParams({
    qualification: state.qualification, grade: state.grade, year: state.year, stage: state.stage,
    venue: state.venue, examDate: state.date?.date ?? "", course: state.course,
    subject: state.subject, question: state.question, ...changes,
  });
  const next = readExamPrep(query);
  return `/certification?${new URLSearchParams({
    tab: "exam-prep", stage: next.stage, qualification: next.qualification,
    ...(next.grade && { grade: next.grade }), year: next.year,
    ...(next.practical && next.date && { venue: next.venue, examDate: next.date.date }),
    ...(next.course && { course: next.course }),
    subject: next.subject, question: next.question,
  })}`;
}

export function safeExamPrepReturn(value: unknown) {
  if (typeof value !== "string" || value.length > 500 || !value.startsWith("/certification?")
    || /[\\\x00-\x1f#]/.test(value)) return null;
  const { pathname, searchParams } = new URL(value, "https://pul.invalid");
  if (pathname !== "/certification" || searchParams.get("tab") !== "exam-prep"
    || !studyStages.some(([stage]) => stage === searchParams.get("stage"))) return null;
  if (["tab", ...selectionKeys].some((key) => searchParams.getAll(key).length > 1)) return null;
  const state = readExamPrep(searchParams);
  const normalized = { ...state, examDate: state.date?.date ?? "" };
  if (selectionKeys.some((key) => searchParams.has(key) && searchParams.get(key) !== normalized[key])) return null;
  if (state.stage === "practical" && state.practical && (!searchParams.has("venue") || !searchParams.has("examDate"))) return null;
  return examPrepHref(state);
}
