import type { SupabaseClient } from "@supabase/supabase-js";

export type OperationsUrgency = "normal" | "attention" | "overdue";
export type OperationsSeverity = "info" | "warning" | "critical";
export type OperationsOutcome = "success" | "noop";

export type OperationsQueueKey =
  | "course_information_reports"
  | "lesson_submission_requests"
  | "lesson_information_reports"
  | "certification_submission_requests"
  | "news_inquiries"
  | "market_repair_shop_inquiries"
  | "market_partnership_inquiries"
  | "hall_of_fame_application_reviews"
  | "hall_of_fame_disputes";

export type OperationsUpcomingKey =
  | "promotions_ending_soon"
  | "events_starting_soon"
  | "events_status_mismatch";

export type OperationsSignalKey =
  | "promotion_media_attention"
  | "hall_of_fame_evidence_cleanup";

export type OperationsActivityAction =
  | "promotion.create"
  | "promotion.update"
  | "promotion.archive"
  | "promotion.placement.create"
  | "promotion.placement.update"
  | "promotion.placement.publish"
  | "promotion.placement.hide"
  | "promotion.media.finalize"
  | "promotion.media.remove"
  | "hall_of_fame.application.review.start"
  | "hall_of_fame.application.additional_info.request"
  | "hall_of_fame.application.final_decision"
  | "hall_of_fame.dispute.review.start"
  | "hall_of_fame.dispute.resolve"
  | "hall_of_fame.dispute.resolve.correction"
  | "hall_of_fame.dispute.resolve.revoke";

export type OperationsAttentionItem = {
  queueKey: OperationsQueueKey;
  count: number;
  oldestAt: string;
  ageDays: number;
  urgency: OperationsUrgency;
};

export type OperationsUpcomingItem = {
  itemKey: OperationsUpcomingKey;
  count: number;
  nextAt?: string;
  severity: OperationsSeverity;
};

export type OperationsSignalItem = {
  signalKey: OperationsSignalKey;
  count: number;
  severity: OperationsSeverity;
};

export type OperationsActivityItem = {
  domain: "promotions" | "hall_of_fame";
  action: OperationsActivityAction;
  occurredAt: string;
  outcome: OperationsOutcome;
};

export type OperationsDashboard = {
  schemaVersion: 1;
  generatedAt: string;
  attention: OperationsAttentionItem[];
  upcoming: OperationsUpcomingItem[];
  automationSignals: OperationsSignalItem[];
  recentActivity: OperationsActivityItem[];
};

type RegistryItem = {
  label: string;
  description: string;
  href?: string;
};

export const operationsQueueRegistry: Readonly<Record<OperationsQueueKey, RegistryItem>> = {
  course_information_reports: {
    label: "골프장 정보 제보",
    description: "새 골프장 또는 기존 정보 정정 제보",
    href: "/courses/manage/reports",
  },
  lesson_submission_requests: {
    label: "레슨 등록요청",
    description: "레슨·무료영상 등록 요청",
    href: "/lessons/manage/requests",
  },
  lesson_information_reports: {
    label: "레슨 정보제보",
    description: "공개 레슨 정보의 변경·오류 제보",
    href: "/lessons/manage/reports",
  },
  certification_submission_requests: {
    label: "자격증 정보 요청",
    description: "교육과정·구인정보 등록 요청",
    href: "/certification/manage/requests",
  },
  news_inquiries: {
    label: "뉴스 제보·홍보 문의",
    description: "뉴스 제보와 홍보 문의",
    href: "/news/manage/inquiries",
  },
  market_repair_shop_inquiries: {
    label: "장터 수리점 문의",
    description: "수리업체 등록 문의",
    href: "/market/manage/repair-shop-inquiries",
  },
  market_partnership_inquiries: {
    label: "장터 제휴 문의",
    description: "광고·입점·제휴 문의",
    href: "/market/manage/partnership-inquiries",
  },
  hall_of_fame_application_reviews: {
    label: "명예의 전당 신청 검토",
    description: "제출·검토·보완요청 상태의 등재 신청",
  },
  hall_of_fame_disputes: {
    label: "명예의 전당 정정·이의·신고",
    description: "접수 또는 검토 중인 운영 요청",
    href: "/hall-of-fame/manage",
  },
};

export const operationsUpcomingRegistry: Readonly<Record<OperationsUpcomingKey, RegistryItem>> = {
  promotions_ending_soon: {
    label: "7일 이내 종료 배너",
    description: "현재 게시 중이며 곧 종료되는 배너",
    href: "/manage/banners",
  },
  events_starting_soon: {
    label: "7일 이내 시작 대회·이벤트",
    description: "공개된 일정 중 시작일이 임박한 항목",
    href: "/events/manage?freshness=starting-soon",
  },
  events_status_mismatch: {
    label: "대회 날짜·접수 상태 확인",
    description: "종료일이 지났지만 접수중 또는 접수예정인 항목",
    href: "/events/manage?freshness=status-mismatch",
  },
};

export const operationsSignalRegistry: Readonly<Record<OperationsSignalKey, RegistryItem>> = {
  promotion_media_attention: {
    label: "배너 이미지 업로드 확인",
    description: "오래된 업로드 대기 또는 대체 이미지가 없는 실패 상태",
    href: "/manage/banners",
  },
  hall_of_fame_evidence_cleanup: {
    label: "명예의 전당 증빙 정리 확인",
    description: "Storage 정리 완료가 필요한 현재 증빙 상태",
    href: "/hall-of-fame/manage/evidence-cleanup",
  },
};

export const operationsActivityLabels: Readonly<Record<OperationsActivityAction, string>> = {
  "promotion.create": "배너·홍보 생성",
  "promotion.update": "배너·홍보 수정",
  "promotion.archive": "배너·홍보 보관",
  "promotion.placement.create": "배너 게시 배정 생성",
  "promotion.placement.update": "배너 게시 배정 수정",
  "promotion.placement.publish": "배너 게시",
  "promotion.placement.hide": "배너 숨김",
  "promotion.media.finalize": "배너 이미지 등록 완료",
  "promotion.media.remove": "배너 이미지 제거",
  "hall_of_fame.application.review.start": "명예의 전당 신청 검토 시작",
  "hall_of_fame.application.additional_info.request": "명예의 전당 추가 자료 요청",
  "hall_of_fame.application.final_decision": "명예의 전당 최종 결정",
  "hall_of_fame.dispute.review.start": "정정·이의·신고 검토 시작",
  "hall_of_fame.dispute.resolve": "정정·이의·신고 처리 완료",
  "hall_of_fame.dispute.resolve.correction": "정정 반영 처리 완료",
  "hall_of_fame.dispute.resolve.revoke": "기록 무효화 처리 완료",
};

const TOP_LEVEL_KEYS = [
  "schema_version",
  "generated_at",
  "attention",
  "upcoming",
  "automation_signals",
  "recent_activity",
] as const;
const ATTENTION_KEYS = ["queue_key", "count", "oldest_at", "age_days", "urgency"] as const;
const UPCOMING_KEYS = ["item_key", "count", "next_at", "severity"] as const;
const SIGNAL_KEYS = ["signal_key", "count", "severity"] as const;
const ACTIVITY_KEYS = ["domain", "action", "occurred_at", "outcome"] as const;

const queueKeys = new Set<OperationsQueueKey>(Object.keys(operationsQueueRegistry) as OperationsQueueKey[]);
const upcomingKeys = new Set<OperationsUpcomingKey>(Object.keys(operationsUpcomingRegistry) as OperationsUpcomingKey[]);
const signalKeys = new Set<OperationsSignalKey>(Object.keys(operationsSignalRegistry) as OperationsSignalKey[]);
const activityActions = new Set<OperationsActivityAction>(Object.keys(operationsActivityLabels) as OperationsActivityAction[]);
const urgencyValues = new Set<OperationsUrgency>(["normal", "attention", "overdue"]);
const severityValues = new Set<OperationsSeverity>(["info", "warning", "critical"]);
const outcomeValues = new Set<OperationsOutcome>(["success", "noop"]);

export class OperationsDashboardResponseError extends Error {
  constructor() {
    super("운영 현황 응답 형식을 확인할 수 없습니다.");
    this.name = "OperationsDashboardResponseError";
  }
}

function invalidResponse(): never {
  throw new OperationsDashboardResponseError();
}

function objectValue(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalidResponse();
  return value as Record<string, unknown>;
}

function exactObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  const row = objectValue(value);
  const actual = Object.keys(row).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    invalidResponse();
  }
  return row;
}

function arrayValue(value: unknown): unknown[] {
  if (!Array.isArray(value)) invalidResponse();
  return value;
}

function integerValue(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) invalidResponse();
  return value;
}

function timestampValue(value: unknown): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) invalidResponse();
  return value;
}

function enumValue<T extends string>(value: unknown, values: ReadonlySet<T>): T {
  if (typeof value !== "string" || !values.has(value as T)) invalidResponse();
  return value as T;
}

export function parseOperationsDashboard(value: unknown): OperationsDashboard {
  const root = exactObject(value, TOP_LEVEL_KEYS);
  if (root.schema_version !== 1) invalidResponse();

  return {
    schemaVersion: 1,
    generatedAt: timestampValue(root.generated_at),
    attention: arrayValue(root.attention).map((value) => {
      const row = exactObject(value, ATTENTION_KEYS);
      return {
        queueKey: enumValue(row.queue_key, queueKeys),
        count: integerValue(row.count),
        oldestAt: timestampValue(row.oldest_at),
        ageDays: integerValue(row.age_days),
        urgency: enumValue(row.urgency, urgencyValues),
      };
    }),
    upcoming: arrayValue(root.upcoming).map((value) => {
      const row = exactObject(value, UPCOMING_KEYS);
      if (row.next_at !== null && row.next_at !== undefined && typeof row.next_at !== "string") invalidResponse();
      const nextAt = row.next_at === null || row.next_at === undefined
        ? undefined
        : timestampValue(row.next_at);
      return {
        itemKey: enumValue(row.item_key, upcomingKeys),
        count: integerValue(row.count),
        nextAt,
        severity: enumValue(row.severity, severityValues),
      };
    }),
    automationSignals: arrayValue(root.automation_signals).map((value) => {
      const row = exactObject(value, SIGNAL_KEYS);
      return {
        signalKey: enumValue(row.signal_key, signalKeys),
        count: integerValue(row.count),
        severity: enumValue(row.severity, severityValues),
      };
    }),
    recentActivity: arrayValue(root.recent_activity).map((value) => {
      const row = exactObject(value, ACTIVITY_KEYS);
      return {
        domain: enumValue(row.domain, new Set(["promotions", "hall_of_fame"] as const)),
        action: enumValue(row.action, activityActions),
        occurredAt: timestampValue(row.occurred_at),
        outcome: enumValue(row.outcome, outcomeValues),
      };
    }),
  };
}

export async function getOperationsDashboard(
  supabase: SupabaseClient,
  options: { referenceAt?: string; recentLimit?: number } = {},
) {
  const { data, error } = await supabase.rpc("get_operations_dashboard", {
    p_reference_at: options.referenceAt ?? new Date().toISOString(),
    p_recent_limit: options.recentLimit ?? 8,
  });
  if (error) throw error;
  return parseOperationsDashboard(data);
}
