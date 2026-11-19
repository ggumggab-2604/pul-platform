import type { PublicExamSchedule } from "./certificationDirectory";

export const refereeTopics = [
  ["referee-eligibility", "응시 자격"],
  ["referee-preparation", "검정 준비"],
  ["referee-review", "응시 후기"],
  ["referee-activity", "심판 활동"],
] as const;

export type RefereeTopic = (typeof refereeTopics)[number][0];

export function refereeTopic(value: unknown) {
  return refereeTopics.find(([key]) => key === value)?.[0];
}

export function refereeBoardHref(topic?: RefereeTopic, page = 1) {
  const query = new URLSearchParams();
  if (topic) query.set("refereeTopic", topic);
  if (topic && page > 1) query.set("refereePage", String(page));
  return `/certification${query.size ? `?${query}` : ""}#referee-board`;
}

export function safeRefereeBoardReturn(value: unknown) {
  if (typeof value !== "string" || value.length > 150 || !value.startsWith("/certification")) return null;
  const query = new URL(value, "https://pul.invalid").searchParams;
  const topic = refereeTopic(query.get("refereeTopic"));
  const page = Number(query.get("refereePage") ?? 1);
  const canonical = refereeBoardHref(topic, page);
  return Number.isSafeInteger(page) && page > 0 && value === canonical ? canonical : null;
}

export function refereeScheduleStatus(schedule: PublicExamSchedule, today: string) {
  if (schedule.examOn && schedule.examOn < today) return "지난 검정";
  if (schedule.applicationEndsOn && schedule.applicationEndsOn < today) return "application_closed" as const;
  if (schedule.applicationStartsOn && schedule.applicationStartsOn > today) return "application_planned" as const;
  if (schedule.status === "application_open" && !schedule.applicationEndsOn) return "접수 상태 공고 확인";
  return undefined;
}
