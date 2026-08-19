import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  CommunityCategory,
  LostFoundKind,
  LostFoundStatus,
  QuestionResolveStatus,
  QuestionType,
  ReviewType,
} from "@/data/communityData";

type JsonObject = Record<string, unknown>;

export type CommunityWritableCategory = Exclude<CommunityCategory, "notice">;
export type CommunitySortOrder = "latest" | "comments";

export type CommunityPostInput = {
  category: CommunityWritableCategory;
  title: string;
  body: string;
  questionType?: QuestionType;
  reviewType?: ReviewType;
  rating?: number;
  lostFoundKind?: LostFoundKind;
  lostFoundItemName?: string;
  lostFoundPlace?: string;
  lostFoundDate?: string;
  lostFoundStatus?: Exclude<LostFoundStatus, "needsAdmin">;
};

export type CommunityPostListItem = {
  id: string;
  title: string;
  summary: string;
  category: CommunityWritableCategory;
  authorDisplayName: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  canEdit: boolean;
  commentCount: number;
  questionType: QuestionType | null;
  questionStatus: Exclude<QuestionResolveStatus, "needsAdmin"> | null;
  reviewType: ReviewType | null;
  rating: number | null;
  lostFoundKind: LostFoundKind | null;
  lostFoundItemName: string | null;
  lostFoundPlace: string | null;
  lostFoundDate: string | null;
  lostFoundStatus: Exclude<LostFoundStatus, "needsAdmin"> | null;
};

export type CommunityPostDetail = Omit<CommunityPostListItem, "summary"> & {
  body: string;
  status: "published";
};

export type CommunityComment = {
  id: string;
  body: string;
  authorDisplayName: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  canEdit: boolean;
};

export type CommunityPage<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

export type CommunityPostMutationOperation = "create" | "update" | "remove" | "resolve_question" | "update_lost_found";
export type CommunityCommentMutationOperation = "create" | "update" | "remove";

export class CommunityError extends Error {
  constructor(
    readonly code: "authentication" | "permission" | "validation" | "conflict" | "notFound" | "network" | "unknown",
    readonly userMessage: string,
    readonly shouldRefresh = false,
  ) {
    super(userMessage);
    this.name = "CommunityError";
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const categories = new Set<CommunityWritableCategory>(["free", "question", "review", "equipment", "course", "club", "lostFound", "marketReview"]);
const questionTypes = new Set<QuestionType>(["beginner", "rule", "equipment", "courseUse", "reservation", "club", "license", "etc"]);
const reviewTypes = new Set<ReviewType>(["course", "lesson", "equipment", "club", "event", "market"]);
const questionStatuses = new Set(["waiting", "answered", "resolved"]);
const lostFoundKinds = new Set<LostFoundKind>(["lost", "found"]);
const lostFoundStatuses = new Set(["searching", "holding", "resolved"]);
const listKeys = [
  "id", "title", "summary", "category", "author_display_name", "created_at", "updated_at", "version", "can_edit",
  "comment_count", "question_type", "question_status", "review_type", "rating", "lost_found_kind", "lost_found_item_name",
  "lost_found_place", "lost_found_date", "lost_found_status",
] as const;
const detailKeys: readonly string[] = [...listKeys.map((key) => key === "summary" ? "body" : key), "status"];
const commentKeys = ["id", "body", "author_display_name", "created_at", "updated_at", "version", "can_edit"] as const;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: JsonObject, expected: readonly string[]) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function invalidResponse(): never {
  throw new CommunityError("unknown", "커뮤니티 응답 형식이 올바르지 않습니다.");
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) invalidResponse();
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "short", day: "numeric" }).format(date);
}

function parsePostBase(value: JsonObject) {
  if (
    typeof value.id !== "string" || !uuidPattern.test(value.id) ||
    typeof value.title !== "string" ||
    typeof value.category !== "string" || !categories.has(value.category as CommunityWritableCategory) ||
    typeof value.author_display_name !== "string" ||
    typeof value.created_at !== "string" || typeof value.updated_at !== "string" ||
    typeof value.version !== "number" || !Number.isInteger(value.version) || value.version < 1 ||
    typeof value.can_edit !== "boolean" ||
    typeof value.comment_count !== "number" || !Number.isInteger(value.comment_count) || value.comment_count < 0 ||
    !isNullableString(value.question_type) || !isNullableString(value.question_status) ||
    !isNullableString(value.review_type) || !(value.rating === null || (typeof value.rating === "number" && Number.isInteger(value.rating) && value.rating >= 1 && value.rating <= 5)) ||
    !isNullableString(value.lost_found_kind) || !isNullableString(value.lost_found_item_name) ||
    !isNullableString(value.lost_found_place) || !isNullableString(value.lost_found_date) || !isNullableString(value.lost_found_status)
  ) invalidResponse();

  if (value.question_type !== null && !questionTypes.has(value.question_type as QuestionType)) invalidResponse();
  if (value.question_status !== null && !questionStatuses.has(value.question_status)) invalidResponse();
  if (value.review_type !== null && !reviewTypes.has(value.review_type as ReviewType)) invalidResponse();
  if (value.lost_found_kind !== null && !lostFoundKinds.has(value.lost_found_kind as LostFoundKind)) invalidResponse();
  if (value.lost_found_status !== null && !lostFoundStatuses.has(value.lost_found_status)) invalidResponse();
  if (value.lost_found_date !== null && !datePattern.test(value.lost_found_date)) invalidResponse();

  return {
    id: value.id,
    title: value.title,
    category: value.category as CommunityWritableCategory,
    authorDisplayName: value.author_display_name,
    createdAt: formatDate(value.created_at),
    updatedAt: formatDate(value.updated_at),
    version: value.version,
    canEdit: value.can_edit,
    commentCount: value.comment_count,
    questionType: value.question_type as QuestionType | null,
    questionStatus: value.question_status as Exclude<QuestionResolveStatus, "needsAdmin"> | null,
    reviewType: value.review_type as ReviewType | null,
    rating: value.rating as number | null,
    lostFoundKind: value.lost_found_kind as LostFoundKind | null,
    lostFoundItemName: value.lost_found_item_name as string | null,
    lostFoundPlace: value.lost_found_place as string | null,
    lostFoundDate: value.lost_found_date as string | null,
    lostFoundStatus: value.lost_found_status as Exclude<LostFoundStatus, "needsAdmin"> | null,
  };
}

function parsePostListItem(value: unknown): CommunityPostListItem {
  if (!isObject(value) || !exactKeys(value, listKeys) || typeof value.summary !== "string") invalidResponse();
  return { ...parsePostBase(value), summary: value.summary };
}

function parsePostDetail(value: unknown): CommunityPostDetail {
  if (!isObject(value) || !exactKeys(value, detailKeys) || typeof value.body !== "string" || value.status !== "published") invalidResponse();
  return { ...parsePostBase(value), body: value.body, status: "published" };
}

function parseComment(value: unknown): CommunityComment {
  if (
    !isObject(value) || !exactKeys(value, commentKeys) ||
    typeof value.id !== "string" || !uuidPattern.test(value.id) || typeof value.body !== "string" ||
    typeof value.author_display_name !== "string" || typeof value.created_at !== "string" || typeof value.updated_at !== "string" ||
    typeof value.version !== "number" || !Number.isInteger(value.version) || value.version < 1 || typeof value.can_edit !== "boolean"
  ) invalidResponse();
  return { id: value.id, body: value.body, authorDisplayName: value.author_display_name, createdAt: formatDate(value.created_at), updatedAt: formatDate(value.updated_at), version: value.version, canEdit: value.can_edit };
}

function parsePage<T>(value: unknown, parseItem: (item: unknown) => T, maxLimit: number): CommunityPage<T> {
  if (!isObject(value) || !exactKeys(value, ["items", "total", "limit", "offset", "has_more"]) || !Array.isArray(value.items)) invalidResponse();
  if (
    typeof value.total !== "number" || !Number.isInteger(value.total) || value.total < 0 ||
    typeof value.limit !== "number" || !Number.isInteger(value.limit) || value.limit < 1 || value.limit > maxLimit ||
    typeof value.offset !== "number" || !Number.isInteger(value.offset) || value.offset < 0 || typeof value.has_more !== "boolean"
  ) invalidResponse();
  return { items: value.items.map(parseItem), total: value.total, limit: value.limit, offset: value.offset, hasMore: value.has_more };
}

function mapError(error: { message?: string } | null): never {
  const message = error?.message ?? "";
  if (/로그인|정상 활동/.test(message)) throw new CommunityError("authentication", "로그인한 정상 활동 회원만 작성할 수 있습니다.");
  if (/본인의/.test(message)) throw new CommunityError("permission", "이 글을 변경할 권한이 없습니다.");
  if (/다른 변경|새로고침/.test(message)) throw new CommunityError("conflict", "다른 변경이 있었습니다. 최신 내용을 다시 확인해 주세요.", true);
  if (/찾을 수 없습니다/.test(message)) throw new CommunityError("notFound", "게시글 또는 댓글을 찾을 수 없습니다.", true);
  if (/확인해 주세요|입력해 주세요|지원하지|필요합니다|이미 해결/.test(message)) throw new CommunityError("validation", message || "입력 내용을 확인해 주세요.");
  if (/fetch|network/i.test(message)) throw new CommunityError("network", "네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
  throw new CommunityError("unknown", "커뮤니티 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
}

export function validateCommunityPostInput(input: CommunityPostInput): CommunityPostInput {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!categories.has(input.category)) throw new CommunityError("validation", "게시글 카테고리를 확인해 주세요.");
  if (Array.from(title).length < 2 || Array.from(title).length > 120) throw new CommunityError("validation", "제목은 2~120자로 입력해 주세요.");
  if (Array.from(body).length < 10 || Array.from(body).length > 5000) throw new CommunityError("validation", "본문은 10~5000자로 입력해 주세요.");
  if (input.category === "question" && (!input.questionType || !questionTypes.has(input.questionType))) throw new CommunityError("validation", "질문 종류를 확인해 주세요.");
  if ((input.category === "review" || input.category === "marketReview") && (!input.reviewType || !reviewTypes.has(input.reviewType) || !Number.isInteger(input.rating) || input.rating! < 1 || input.rating! > 5)) throw new CommunityError("validation", "후기 종류와 별점 1~5를 확인해 주세요.");
  if (input.category === "marketReview" && input.reviewType !== "market") throw new CommunityError("validation", "중고거래 후기 종류를 확인해 주세요.");
  if (input.category === "lostFound") {
    const itemName = input.lostFoundItemName?.trim() ?? "";
    const place = input.lostFoundPlace?.trim() ?? "";
    if (!input.lostFoundKind || !lostFoundKinds.has(input.lostFoundKind) || itemName.length < 2 || itemName.length > 100 || place.length < 2 || place.length > 200 || !input.lostFoundDate || !datePattern.test(input.lostFoundDate)) throw new CommunityError("validation", "분실·습득 물건, 장소, 날짜를 확인해 주세요.");
    const wantedStatus = input.lostFoundKind === "lost" ? "searching" : "holding";
    return { ...input, title, body, lostFoundItemName: itemName, lostFoundPlace: place, lostFoundStatus: input.lostFoundStatus === "resolved" ? "resolved" : wantedStatus };
  }
  return { ...input, title, body };
}

function toPayload(input: CommunityPostInput) {
  const valid = validateCommunityPostInput(input);
  const payload: JsonObject = { category: valid.category, title: valid.title, body: valid.body };
  if (valid.category === "question") payload.question_type = valid.questionType;
  if (valid.category === "review" || valid.category === "marketReview") { payload.review_type = valid.reviewType; payload.rating = valid.rating; }
  if (valid.category === "lostFound") {
    payload.lost_found_kind = valid.lostFoundKind;
    payload.lost_found_item_name = valid.lostFoundItemName;
    payload.lost_found_place = valid.lostFoundPlace;
    payload.lost_found_date = valid.lostFoundDate;
    payload.lost_found_status = valid.lostFoundStatus;
  }
  return payload;
}

export async function listCommunityPosts(client: SupabaseClient, category: "all" | CommunityWritableCategory, keyword: string, sortOrder: CommunitySortOrder, limit = 24, offset = 0) {
  const { data, error } = await client.rpc("list_community_posts", { p_category_code: category === "all" ? null : category, p_keyword: keyword.trim() || null, p_sort_order: sortOrder, p_limit: limit, p_offset: offset });
  if (error) mapError(error);
  return parsePage(data, parsePostListItem, 30);
}

export async function getCommunityPost(client: SupabaseClient, postId: string) {
  if (!uuidPattern.test(postId)) throw new CommunityError("notFound", "게시글을 찾을 수 없습니다.");
  const { data, error } = await client.rpc("get_community_post", { p_post_id: postId });
  if (error) mapError(error);
  return parsePostDetail(data);
}

export async function listCommunityComments(client: SupabaseClient, postId: string, limit = 50, offset = 0) {
  if (!uuidPattern.test(postId)) throw new CommunityError("notFound", "게시글을 찾을 수 없습니다.");
  const { data, error } = await client.rpc("list_community_comments", { p_post_id: postId, p_limit: limit, p_offset: offset });
  if (error) mapError(error);
  return parsePage(data, parseComment, 100);
}

export async function mutateCommunityPost(client: SupabaseClient, operation: CommunityPostMutationOperation, postId: string | null, expectedVersion: number | null, input?: CommunityPostInput | { lostFoundStatus: "searching" | "holding" | "resolved" }) {
  const payload = input && "category" in input ? toPayload(input) : input ? { lost_found_status: input.lostFoundStatus } : {};
  const { data, error } = await client.rpc("mutate_community_post", { p_operation: operation, p_post_id: postId, p_expected_version: expectedVersion, p_payload: payload });
  if (error) mapError(error);
  if (!isObject(data) || !exactKeys(data, ["post_id", "status", "version"]) || typeof data.post_id !== "string" || !uuidPattern.test(data.post_id) || (data.status !== "published" && data.status !== "removed") || typeof data.version !== "number" || !Number.isInteger(data.version)) invalidResponse();
  return { postId: data.post_id, status: data.status, version: data.version };
}

export async function mutateCommunityComment(client: SupabaseClient, operation: CommunityCommentMutationOperation, postId: string | null, commentId: string | null, expectedVersion: number | null, body?: string) {
  const normalizedBody = body?.trim() ?? null;
  if ((operation === "create" || operation === "update") && (!normalizedBody || Array.from(normalizedBody).length > 2000)) throw new CommunityError("validation", "댓글은 1~2000자로 입력해 주세요.");
  const { data, error } = await client.rpc("mutate_community_comment", { p_operation: operation, p_post_id: postId, p_comment_id: commentId, p_expected_version: expectedVersion, p_body: normalizedBody });
  if (error) mapError(error);
  if (!isObject(data) || !exactKeys(data, ["comment_id", "post_id", "version", "removed"]) || typeof data.comment_id !== "string" || !uuidPattern.test(data.comment_id) || typeof data.post_id !== "string" || !uuidPattern.test(data.post_id) || typeof data.version !== "number" || !Number.isInteger(data.version) || typeof data.removed !== "boolean") invalidResponse();
  return { commentId: data.comment_id, postId: data.post_id, version: data.version, removed: data.removed };
}
