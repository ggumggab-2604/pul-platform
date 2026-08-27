import type {
  PromotionOverviewDisplayStatus,
  PromotionSlotDefinition,
} from "./promotionManagement";
import type { PromotionContentKind, PromotionLinkType } from "./promotionDirectory";

export type PromotionEditorDraft = {
  contentKind: PromotionContentKind;
  title: string;
  summary: string;
  linkType: PromotionLinkType;
  externalUrl: string;
  slug: string;
  body: string;
  detailCtaLabel: string;
  detailCtaUrl: string;
  contentStatus: "draft" | "ready";
};

export type PromotionAreaKey =
  | "home"
  | "courses"
  | "clubs"
  | "market"
  | "community"
  | "events"
  | "lessons"
  | "certification"
  | "news"
  | "hall_of_fame";

const contentKinds = new Set<PromotionContentKind>([
  "pul_notice",
  "pul_event",
  "partnership",
  "advertisement",
  "member_guide",
  "content_recommendation",
]);
const linkTypes = new Set<PromotionLinkType>(["external", "internal_detail", "none"]);
const statuses = new Set<PromotionEditorDraft["contentStatus"]>(["draft", "ready"]);
const slugPattern = /^[a-z0-9][a-z0-9-]{0,79}$/;
const localDateTimePattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const detailUrlPattern = /^(\/[^\s]*|https:\/\/\S+)$/;

export const promotionContentKindLabels: Record<PromotionContentKind, string> = {
  pul_notice: "PUL 공지",
  pul_event: "PUL 행사",
  partnership: "제휴",
  advertisement: "광고",
  member_guide: "회원 안내",
  content_recommendation: "콘텐츠 추천",
};

export const promotionLinkTypeLabels: Record<PromotionLinkType, string> = {
  external: "외부 링크",
  internal_detail: "PUL 상세페이지",
  none: "클릭 없음",
};

export const promotionStatusLabels: Record<PromotionOverviewDisplayStatus, string> = {
  draft: "초안",
  hidden: "숨김",
  scheduled: "예약",
  live: "게시중",
  ended: "종료",
  archived: "보관됨",
};

export const promotionAreaLabels: Record<PromotionAreaKey, string> = {
  home: "메인",
  courses: "골프장",
  clubs: "동호회",
  market: "장터",
  community: "커뮤니티",
  events: "대회·이벤트",
  lessons: "레슨",
  certification: "자격증",
  news: "뉴스",
  hall_of_fame: "명예의 전당",
};

const slotLabels: Record<string, string> = {
  "home.hero.01": "메인 · 히어로",
  "home.rail_left.01": "메인 · 왼쪽 긴 세로배너",
  "home.rail_left.short.01": "메인 · 왼쪽 짧은 배너 1",
  "home.rail_left.short.02": "메인 · 왼쪽 짧은 배너 2",
  "home.rail_left.short.03": "메인 · 왼쪽 짧은 배너 3",
  "home.rail_right.01": "메인 · 오른쪽 긴 세로배너",
  "home.rail_right.short.01": "메인 · 오른쪽 짧은 배너 1",
  "home.rail_right.short.02": "메인 · 오른쪽 짧은 배너 2",
  "home.rail_right.short.03": "메인 · 오른쪽 짧은 배너 3",
  "home.feed.01": "메인 · 모바일 피드",
  "courses.top.01": "골프장 · 상단 가로배너",
  "courses.after_map.01": "골프장 · 지도·검색 아래 가로배너",
  "clubs.top.01": "동호회 · 상단 가로배너",
  "clubs.after_list.01": "동호회 · 목록 아래 가로배너",
  "market.list_top.01": "장터 · 상단 가로배너",
  "market.after_list.01": "장터 · 상품목록 아래 가로배너",
  "community.top.01": "커뮤니티 · 상단 가로배너",
  "community.after_posts.01": "커뮤니티 · 게시글 목록 아래 가로배너",
  "events.top.01": "대회·이벤트 · 상단 가로배너",
  "events.after_schedule.01": "대회·이벤트 · 주요 일정 아래 가로배너",
  "lessons.top.01": "레슨·교육 · 상단 가로배너",
  "lessons.after_content.01": "레슨·교육 · 주요 콘텐츠 아래 가로배너",
  "certification.top.01": "자격증·심판 · 상단 가로배너",
  "certification.after_content.01": "자격증·심판 · 탭 콘텐츠 아래 가로배너",
  "news.top.01": "뉴스·정보 · 상단 가로배너",
  "news.after_list.01": "뉴스·정보 · 기사목록 아래 가로배너",
  "hall_of_fame.top.01": "명예의 전당 · 상단 가로배너",
};

const slotDescriptions: Record<string, string> = {
  "home.rail_left.01": "메인 Hero 왼쪽에 길게 표시되는 PC 전용 광고입니다. 같은 쪽의 짧은 배너와 동일 기간에 함께 게시할 수 없습니다.",
  "home.rail_left.short.01": "메인 왼쪽에서 최대 3개의 짧은 광고를 세로로 운영할 수 있습니다. 긴 배너와 동일 기간에는 함께 게시할 수 없습니다.",
  "home.rail_left.short.02": "메인 왼쪽에서 최대 3개의 짧은 광고를 세로로 운영할 수 있습니다. 긴 배너와 동일 기간에는 함께 게시할 수 없습니다.",
  "home.rail_left.short.03": "메인 왼쪽에서 최대 3개의 짧은 광고를 세로로 운영할 수 있습니다. 긴 배너와 동일 기간에는 함께 게시할 수 없습니다.",
  "home.rail_right.01": "메인 Hero 오른쪽에 길게 표시되는 PC 전용 광고입니다. 같은 쪽의 짧은 배너와 동일 기간에 함께 게시할 수 없습니다.",
  "home.rail_right.short.01": "메인 오른쪽에서 최대 3개의 짧은 광고를 세로로 운영할 수 있습니다. 긴 배너와 동일 기간에는 함께 게시할 수 없습니다.",
  "home.rail_right.short.02": "메인 오른쪽에서 최대 3개의 짧은 광고를 세로로 운영할 수 있습니다. 긴 배너와 동일 기간에는 함께 게시할 수 없습니다.",
  "home.rail_right.short.03": "메인 오른쪽에서 최대 3개의 짧은 광고를 세로로 운영할 수 있습니다. 긴 배너와 동일 기간에는 함께 게시할 수 없습니다.",
  "courses.after_map.01": "골프장 지도와 검색·목록 탐색 영역 아래에 표시됩니다.",
  "clubs.after_list.01": "동호회 목록과 페이지 이동 영역 아래에 표시됩니다.",
  "market.after_list.01": "전체 상품 영역 아래, 장비 시세·구매가이드 전에 표시됩니다.",
  "community.after_posts.01": "회원 게시글 목록 아래, 관련 커뮤니티 메뉴 전에 표시됩니다.",
  "events.after_schedule.01": "주요 대회·이벤트 일정 영역 아래에 표시됩니다.",
  "lessons.after_content.01": "현재 선택한 레슨·교육 탭의 주요 콘텐츠 아래에 표시됩니다.",
  "certification.after_content.01": "현재 선택한 자격증·심판 탭의 콘텐츠 아래에 표시됩니다.",
  "news.after_list.01": "주요 뉴스·기사 목록 아래에 표시됩니다.",
};

export class PromotionUiValidationError extends Error {
  readonly userMessage: string;

  constructor(userMessage: string) {
    super(userMessage);
    this.userMessage = userMessage;
    this.name = "PromotionUiValidationError";
  }
}

function exactObject(value: unknown, expectedKeys: readonly string[]) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new PromotionUiValidationError("입력한 홍보 내용을 확인해 주세요.");
  }
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new PromotionUiValidationError("입력한 홍보 내용을 확인해 주세요.");
  }
  return record;
}

function normalizedText(value: unknown, minimum: number, maximum: number, label: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  const length = [...normalized].length;
  if (length < minimum || length > maximum) {
    throw new PromotionUiValidationError(`${label}은 ${minimum}~${maximum}자로 입력해 주세요.`);
  }
  return normalized;
}

function optionalText(value: unknown, maximum: number, label: string) {
  if (value === null || value === undefined || value === "") return "";
  return normalizedText(value, 1, maximum, label);
}

function isHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function blankPromotionDraft(): PromotionEditorDraft {
  return {
    contentKind: "pul_notice",
    title: "",
    summary: "",
    linkType: "none",
    externalUrl: "",
    slug: "",
    body: "",
    detailCtaLabel: "",
    detailCtaUrl: "",
    contentStatus: "draft",
  };
}

export function normalizePromotionEditorDraft(value: unknown): PromotionEditorDraft {
  const row = exactObject(value, [
    "contentKind",
    "title",
    "summary",
    "linkType",
    "externalUrl",
    "slug",
    "body",
    "detailCtaLabel",
    "detailCtaUrl",
    "contentStatus",
  ]);
  if (
    typeof row.contentKind !== "string" || !contentKinds.has(row.contentKind as PromotionContentKind) ||
    typeof row.linkType !== "string" || !linkTypes.has(row.linkType as PromotionLinkType) ||
    typeof row.contentStatus !== "string" || !statuses.has(row.contentStatus as PromotionEditorDraft["contentStatus"])
  ) {
    throw new PromotionUiValidationError("홍보 유형과 연결 방식을 확인해 주세요.");
  }

  const draft: PromotionEditorDraft = {
    contentKind: row.contentKind as PromotionContentKind,
    title: normalizedText(row.title, 2, 180, "제목"),
    summary: normalizedText(row.summary, 10, 500, "요약"),
    linkType: row.linkType as PromotionLinkType,
    externalUrl: optionalText(row.externalUrl, 2048, "외부 링크"),
    slug: optionalText(row.slug, 80, "상세 주소"),
    body: optionalText(row.body, 20000, "상세 본문"),
    detailCtaLabel: optionalText(row.detailCtaLabel, 40, "버튼 문구"),
    detailCtaUrl: optionalText(row.detailCtaUrl, 2048, "버튼 주소"),
    contentStatus: row.contentStatus as PromotionEditorDraft["contentStatus"],
  };

  if (draft.linkType === "external") {
    if (!isHttpsUrl(draft.externalUrl)) {
      throw new PromotionUiValidationError("외부 링크는 안전한 HTTPS 주소로 입력해 주세요.");
    }
    draft.slug = "";
    draft.body = "";
    draft.detailCtaLabel = "";
    draft.detailCtaUrl = "";
  } else if (draft.linkType === "internal_detail") {
    if (!slugPattern.test(draft.slug)) {
      throw new PromotionUiValidationError("상세 주소는 영문 소문자·숫자·하이픈으로 입력해 주세요.");
    }
    draft.body = normalizedText(draft.body, 20, 20000, "상세 본문");
    if (Boolean(draft.detailCtaLabel) !== Boolean(draft.detailCtaUrl)) {
      throw new PromotionUiValidationError("상세 버튼 문구와 주소는 함께 입력해 주세요.");
    }
    if (draft.detailCtaUrl && !detailUrlPattern.test(draft.detailCtaUrl)) {
      throw new PromotionUiValidationError("상세 버튼 주소는 PUL 내부 경로 또는 HTTPS 주소로 입력해 주세요.");
    }
    draft.externalUrl = "";
  } else {
    draft.externalUrl = "";
    draft.slug = "";
    draft.body = "";
    draft.detailCtaLabel = "";
    draft.detailCtaUrl = "";
  }

  return draft;
}

export function promotionDraftToPayload(draft: PromotionEditorDraft, includeStatus: boolean) {
  const normalized = normalizePromotionEditorDraft(draft);
  return {
    content_kind: normalized.contentKind,
    title: normalized.title,
    summary: normalized.summary,
    link_type: normalized.linkType,
    slug: normalized.slug || null,
    body: normalized.body || null,
    external_url: normalized.externalUrl || null,
    detail_cta_label: normalized.detailCtaLabel || null,
    detail_cta_url: normalized.detailCtaUrl || null,
    ...(includeStatus ? { content_status: normalized.contentStatus } : {}),
  };
}

export function slotAreaKey(slotCode: string): PromotionAreaKey | null {
  const prefix = slotCode.split(".", 1)[0];
  if (prefix === "hall_of_fame") return "hall_of_fame";
  return prefix in promotionAreaLabels ? prefix as PromotionAreaKey : null;
}

export function friendlySlotName(slot: Pick<PromotionSlotDefinition, "slotCode" | "displayName">) {
  return slotLabels[slot.slotCode] ?? slot.displayName;
}

export function slotDescription(slotCode: string) {
  return slotDescriptions[slotCode] ?? null;
}

export function slotSpecification(slot: PromotionSlotDefinition) {
  const desktop = `PC ${slot.desktopWidth}×${slot.desktopHeight}`;
  const mobile = slot.mobileWidth && slot.mobileHeight
    ? `모바일 ${slot.mobileWidth}×${slot.mobileHeight}`
    : "모바일 이미지 사용 안 함";
  return `${desktop} · ${mobile}`;
}

export function mobileMediaGuidance(slot: PromotionSlotDefinition | null) {
  if (!slot) return "슬롯을 선택하면 모바일 이미지 기준을 안내합니다.";
  if (slot.formatCode === "home_hero" || slot.formatCode === "mobile_feed") {
    return "모바일 이미지 필수";
  }
  if (slot.formatCode === "vertical_rail") return "PC 전용 · 모바일 이미지 사용 안 함";
  return "모바일 이미지 권장";
}

export function promotionMediaPreviewAspectClass(
  slot: PromotionSlotDefinition | null,
  variant: "desktop_banner" | "mobile_banner",
) {
  if (slot?.formatCode === "horizontal") {
    return variant === "desktop_banner" ? "aspect-[8/1]" : "aspect-[18/5]";
  }
  if (slot?.formatCode === "vertical_rail") {
    return slot.desktopHeight === 1500 ? "aspect-[2/5]" : "aspect-[5/4]";
  }
  return variant === "desktop_banner" ? "aspect-[5/1]" : "aspect-[9/4]";
}

export function promotionImageProductionGuidance(slot: PromotionSlotDefinition | null) {
  if (slot?.formatCode !== "horizontal") return null;
  return "가로배너는 WebP를 우선 권장합니다. 중요한 글자·로고는 좌우 5~8%, 상하 10% 안쪽에 두고, PC는 약 200~500KB·모바일은 약 120~300KB를 목표로 제작해 주세요.";
}

export function validatePromotionImageDimensions(
  dimensions: { width: number; height: number },
  slot: PromotionSlotDefinition | null,
  variant: "desktop_banner" | "mobile_banner",
) {
  if (!slot) {
    throw new PromotionUiValidationError("게시 슬롯을 먼저 선택해 주세요.");
  }
  const expectedWidth = variant === "desktop_banner" ? slot.desktopWidth : slot.mobileWidth;
  const expectedHeight = variant === "desktop_banner" ? slot.desktopHeight : slot.mobileHeight;
  if (expectedWidth === null || expectedHeight === null) {
    throw new PromotionUiValidationError("선택한 게시 위치는 모바일 이미지를 사용하지 않습니다.");
  }
  if (
    !Number.isSafeInteger(dimensions.width) || !Number.isSafeInteger(dimensions.height) ||
    dimensions.width !== expectedWidth || dimensions.height !== expectedHeight
  ) {
    const label = variant === "desktop_banner" ? "PC" : "모바일";
    throw new PromotionUiValidationError(
      `${label} 이미지는 ${expectedWidth}×${expectedHeight} 픽셀로 등록해 주세요. 선택한 파일은 ${dimensions.width}×${dimensions.height} 픽셀입니다.`,
    );
  }
  return dimensions;
}

export function kstLocalDateTimeToIso(value: string) {
  const match = localDateTimePattern.exec(value);
  if (!match) throw new PromotionUiValidationError("게시 시작·종료 일시를 확인해 주세요.");
  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const utcMillis = Date.UTC(year, month - 1, day, hour - 9, minute);
  const restored = new Date(utcMillis + 9 * 60 * 60 * 1000);
  if (
    restored.getUTCFullYear() !== year || restored.getUTCMonth() !== month - 1 ||
    restored.getUTCDate() !== day || restored.getUTCHours() !== hour ||
    restored.getUTCMinutes() !== minute
  ) throw new PromotionUiValidationError("존재하는 날짜와 시간을 입력해 주세요.");
  return new Date(utcMillis).toISOString();
}

export function isoToKstLocalDateTime(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new PromotionUiValidationError("게시 일시를 확인해 주세요.");
  const date = new Date(timestamp + 9 * 60 * 60 * 1000);
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

export function normalizePublicationPeriod(startsAt: string, endsAt: string) {
  const startsIso = kstLocalDateTimeToIso(startsAt);
  const endsIso = kstLocalDateTimeToIso(endsAt);
  if (Date.parse(endsIso) <= Date.parse(startsIso)) {
    throw new PromotionUiValidationError("게시 종료 일시는 시작 일시보다 늦어야 합니다.");
  }
  return { startsAt: startsIso, endsAt: endsIso };
}

export function formatKstDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function validatePromotionImageFile(file: { type: string; size: number; name: string }) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new PromotionUiValidationError("JPG, PNG, WebP 이미지만 등록할 수 있습니다.");
  }
  if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > 5 * 1024 * 1024) {
    throw new PromotionUiValidationError("이미지는 5MB 이하로 등록해 주세요.");
  }
  if (!/\.(jpe?g|png|webp)$/i.test(file.name)) {
    throw new PromotionUiValidationError("이미지 파일 이름의 확장자를 확인해 주세요.");
  }
  return file;
}
