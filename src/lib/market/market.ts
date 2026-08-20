import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  MarketBuyRequest,
  MarketCategory,
  MarketCondition,
  MarketListing,
  MarketSaleStatus,
  MarketTradeType,
  StartupBoardCategory,
  StartupBoardConsultationType,
  StartupBoardPost,
  StartupBoardPostDetail,
  StartupBoardStatus,
} from "@/types";

type JsonObject = Record<string, unknown>;

export type MarketListingFilters = {
  keyword: string;
  category: "all" | MarketCategory;
  region: string;
  saleStatus: "all" | MarketSaleStatus;
};

export type MarketPage<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

export type MarketListingInput = {
  title: string;
  category: MarketCategory;
  price: number;
  region: string;
  condition: MarketCondition;
  tradeType: MarketTradeType;
  description: string;
};

export type MarketBuyRequestInput = {
  title: string;
  category: MarketCategory;
  budget: number;
  region: string;
  summary: string;
};

export type MarketStartupPostFilters = {
  keyword: string;
  category: "all" | StartupBoardCategory;
  region: string;
};

export type MarketStartupPostInput = {
  title: string;
  body: string;
  category: StartupBoardCategory;
  region: string;
  desiredScale: string;
  consultationType: StartupBoardConsultationType;
};

export type MarketStartupPostMutationContext = MarketStartupPostInput & {
  postKey: string;
  status: StartupBoardStatus;
  version: number;
};

export type MarketStartupPostMutationResult = {
  postKey: string;
  status: StartupBoardStatus;
  publicationStatus: "published" | "hidden" | "removed";
  version: number;
};

export type MarketMutationResult = {
  requestId: string;
  id: string;
  status: string;
  version: number;
  replayed: boolean;
  removedStoragePaths: string[];
};

export type MarketListingOperation = "create" | "update" | "reserve" | "sell" | "delete";
export type MarketBuyRequestOperation = "create" | "update" | "close" | "delete";
export type MarketStartupPostOperation = "create" | "update" | "close" | "remove";

export class MarketError extends Error {
  constructor(
    readonly code: "authentication" | "permission" | "validation" | "conflict" | "notFound" | "network" | "unknown",
    readonly userMessage: string,
    readonly shouldRefresh = false,
  ) {
    super(userMessage);
    this.name = "MarketError";
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const startupPostKeyPattern = /^[0-9a-f]{24}$/;
const categories = new Set(["club", "ball", "bag", "apparel", "shoes", "practice", "other"]);
const conditions = new Set(["likeNew", "lightUse", "normal", "needsRepair"]);
const tradeTypes = new Set(["direct", "delivery", "negotiable"]);
const saleStatuses = new Set(["selling", "reserved", "sold"]);
const regions = new Set(["서울", "경기", "인천", "충청", "강원", "전라", "경상", "제주"]);
const startupCategories = new Set(["screenStartup", "screenResale", "fieldCourseDevelopment", "idleLandUse", "constructionFacility"]);
const startupConsultations = new Set(["startupInquiry", "resaleInquiry", "transfer", "courseDevelopment", "idleLandUse", "facilityConsulting"]);
const listingKeys = [
  "id", "name", "category", "seller_type", "price", "region", "condition",
  "trade_type", "sale_status", "description", "seller_display_name", "created_at",
  "updated_at", "version", "can_edit", "image_paths",
] as const;
const buyRequestKeys = [
  "id", "title", "category", "region", "budget", "summary", "author_display_name",
  "request_status", "created_at", "updated_at", "version", "can_edit",
] as const;
const startupPostKeys = [
  "post_key", "title", "summary", "category", "region", "desired_scale",
  "consultation_type", "author_display_name", "board_status", "created_at",
  "updated_at", "can_edit",
] as const;
const startupPostDetailKeys = [
  "post_key", "title", "body", "category", "region", "desired_scale",
  "consultation_type", "author_display_name", "board_status", "created_at",
  "updated_at", "can_edit",
] as const;
const startupMutationContextKeys = [
  "post_key", "title", "body", "category", "region", "desired_scale",
  "consultation_type", "board_status", "version",
] as const;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: JsonObject, expected: readonly string[]) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function invalidResponse(): never {
  throw new MarketError("unknown", "장터 응답 형식이 올바르지 않습니다.");
}

function formatDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) invalidResponse();
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "short", day: "numeric" }).format(date);
}

function publicMediaUrl(client: SupabaseClient, path: string) {
  return client.storage.from("market-media").getPublicUrl(path).data.publicUrl;
}

function parseListing(client: SupabaseClient, value: unknown): MarketListing {
  if (!isObject(value) || !exactKeys(value, listingKeys)) invalidResponse();
  if (
    typeof value.id !== "string" || !uuidPattern.test(value.id) ||
    typeof value.name !== "string" || value.name.length < 2 ||
    typeof value.category !== "string" || !categories.has(value.category) ||
    value.seller_type !== "personal" ||
    typeof value.price !== "number" || !Number.isSafeInteger(value.price) || value.price < 1 ||
    typeof value.region !== "string" || !regions.has(value.region) ||
    typeof value.condition !== "string" || !conditions.has(value.condition) ||
    typeof value.trade_type !== "string" || !tradeTypes.has(value.trade_type) ||
    typeof value.sale_status !== "string" || !saleStatuses.has(value.sale_status) ||
    typeof value.description !== "string" || typeof value.seller_display_name !== "string" ||
    typeof value.created_at !== "string" || typeof value.updated_at !== "string" ||
    typeof value.version !== "number" || !Number.isInteger(value.version) || value.version < 1 ||
    typeof value.can_edit !== "boolean" || !Array.isArray(value.image_paths) ||
    value.image_paths.some((path) => typeof path !== "string")
  ) invalidResponse();
  const category = value.category as MarketCategory;
  const images = (value.image_paths as string[]).map((path) => publicMediaUrl(client, path));
  return {
    id: value.id,
    name: value.name,
    category,
    sellerType: "personal",
    price: value.price,
    region: value.region,
    condition: value.condition as MarketCondition,
    tradeType: value.trade_type as MarketTradeType,
    saleStatus: value.sale_status as MarketSaleStatus,
    description: value.description,
    sellerNickname: value.seller_display_name,
    createdAt: formatDate(value.created_at),
    image: images[0] ?? `/images/banner-${category}.jpg`,
    images,
    version: value.version,
    canEdit: value.can_edit,
    isSample: false,
  };
}

function parseBuyRequest(value: unknown): MarketBuyRequest {
  if (!isObject(value) || !exactKeys(value, buyRequestKeys)) invalidResponse();
  if (
    typeof value.id !== "string" || !uuidPattern.test(value.id) ||
    typeof value.title !== "string" ||
    typeof value.category !== "string" || !categories.has(value.category) ||
    typeof value.region !== "string" || !regions.has(value.region) ||
    typeof value.budget !== "number" || !Number.isSafeInteger(value.budget) || value.budget < 1 ||
    typeof value.summary !== "string" || typeof value.author_display_name !== "string" ||
    (value.request_status !== "open" && value.request_status !== "closed") ||
    typeof value.created_at !== "string" || typeof value.updated_at !== "string" ||
    typeof value.version !== "number" || !Number.isInteger(value.version) || value.version < 1 ||
    typeof value.can_edit !== "boolean"
  ) invalidResponse();
  return {
    id: value.id,
    title: value.title,
    category: value.category as MarketCategory,
    region: value.region,
    budget: `${value.budget.toLocaleString("ko-KR")}원`,
    summary: value.summary,
    authorNickname: value.author_display_name,
    createdAt: formatDate(value.created_at),
    requestStatus: value.request_status,
    version: value.version,
    canEdit: value.can_edit,
    isSample: false,
  };
}

function isStartupCombination(category: string, consultation: string) {
  return (
    (category === "screenStartup" && consultation === "startupInquiry") ||
    (category === "screenResale" && (consultation === "resaleInquiry" || consultation === "transfer")) ||
    (category === "fieldCourseDevelopment" && consultation === "courseDevelopment") ||
    (category === "idleLandUse" && consultation === "idleLandUse") ||
    (category === "constructionFacility" && consultation === "facilityConsulting")
  );
}

function parseStartupCommon(value: JsonObject) {
  if (
    typeof value.post_key !== "string" || !startupPostKeyPattern.test(value.post_key) ||
    typeof value.title !== "string" || value.title.length < 2 ||
    typeof value.category !== "string" || !startupCategories.has(value.category) ||
    typeof value.region !== "string" || !regions.has(value.region) ||
    typeof value.desired_scale !== "string" || value.desired_scale.length < 2 ||
    typeof value.consultation_type !== "string" || !startupConsultations.has(value.consultation_type) ||
    !isStartupCombination(value.category, value.consultation_type) ||
    (value.board_status !== "open" && value.board_status !== "closed") ||
    typeof value.created_at !== "string" || typeof value.updated_at !== "string" ||
    typeof value.author_display_name !== "string" || typeof value.can_edit !== "boolean"
  ) invalidResponse();
  return {
    postKey: value.post_key,
    title: value.title,
    category: value.category as StartupBoardCategory,
    region: value.region,
    desiredScale: value.desired_scale,
    consultationType: value.consultation_type as StartupBoardConsultationType,
    authorNickname: value.author_display_name,
    createdAt: formatDate(value.created_at),
    updatedAt: formatDate(value.updated_at),
    status: value.board_status as StartupBoardStatus,
    canEdit: value.can_edit,
  };
}

function parseStartupPost(value: unknown): StartupBoardPost {
  if (!isObject(value) || !exactKeys(value, startupPostKeys) || typeof value.summary !== "string") invalidResponse();
  return { ...parseStartupCommon(value), summary: value.summary };
}

function parseStartupPostDetail(value: unknown): StartupBoardPostDetail {
  if (!isObject(value) || !exactKeys(value, startupPostDetailKeys) || typeof value.body !== "string") invalidResponse();
  return { ...parseStartupCommon(value), body: value.body };
}

function parseStartupMutationContext(value: unknown): MarketStartupPostMutationContext {
  if (
    !isObject(value) || !exactKeys(value, startupMutationContextKeys) ||
    typeof value.post_key !== "string" || !startupPostKeyPattern.test(value.post_key) ||
    typeof value.title !== "string" || typeof value.body !== "string" ||
    typeof value.category !== "string" || !startupCategories.has(value.category) ||
    typeof value.region !== "string" || !regions.has(value.region) ||
    typeof value.desired_scale !== "string" ||
    typeof value.consultation_type !== "string" || !startupConsultations.has(value.consultation_type) ||
    !isStartupCombination(value.category, value.consultation_type) ||
    (value.board_status !== "open" && value.board_status !== "closed") ||
    typeof value.version !== "number" || !Number.isInteger(value.version) || value.version < 1
  ) invalidResponse();
  return {
    postKey: value.post_key,
    title: value.title,
    body: value.body,
    category: value.category as StartupBoardCategory,
    region: value.region,
    desiredScale: value.desired_scale,
    consultationType: value.consultation_type as StartupBoardConsultationType,
    status: value.board_status,
    version: value.version,
  };
}

function parsePage<T>(value: unknown, parseItem: (item: unknown) => T): MarketPage<T> {
  if (!isObject(value) || !exactKeys(value, ["items", "total", "limit", "offset", "has_more"]) || !Array.isArray(value.items)) invalidResponse();
  if (
    typeof value.total !== "number" || !Number.isInteger(value.total) || value.total < 0 ||
    typeof value.limit !== "number" || !Number.isInteger(value.limit) || value.limit < 1 || value.limit > 30 ||
    typeof value.offset !== "number" || !Number.isInteger(value.offset) || value.offset < 0 ||
    typeof value.has_more !== "boolean"
  ) invalidResponse();
  return { items: value.items.map(parseItem), total: value.total, limit: value.limit, offset: value.offset, hasMore: value.has_more };
}

function mapError(error: { message?: string } | null): never {
  const message = error?.message ?? "";
  if (/로그인/.test(message)) throw new MarketError("authentication", "로그인 후 이용해 주세요.");
  if (/정상 활동 계정/.test(message)) throw new MarketError("permission", message);
  if (/본인의|권한/.test(message)) throw new MarketError("permission", "이 장터 글을 변경할 권한이 없습니다.");
  if (/새로고침|변경되었습니다/.test(message)) throw new MarketError("conflict", "다른 화면에서 글이 변경되었습니다. 최신 내용을 다시 불러왔습니다.", true);
  if (/찾을 수 없습니다/.test(message)) throw new MarketError("notFound", "장터 글을 찾을 수 없습니다.", true);
  if (/입력|2~|10~|최대|숫자|지원하지|식별자|종료된|진행 중인|카테고리|상담 유형|지역|희망 규모/.test(message)) throw new MarketError("validation", message || "입력 내용을 확인해 주세요.");
  if (/fetch|network/i.test(message)) throw new MarketError("network", "네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
  throw new MarketError("unknown", "장터 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
}

export function validateListingInput(input: MarketListingInput): MarketListingInput {
  const title = input.title.trim();
  const description = input.description.trim();
  if (Array.from(title).length < 2 || Array.from(title).length > 100) throw new MarketError("validation", "상품명은 2~100자로 입력해 주세요.");
  if (!categories.has(input.category) || input.category === "startupResale" || input.category === "facilityDevelopment") throw new MarketError("validation", "상품 카테고리를 확인해 주세요.");
  if (!Number.isSafeInteger(input.price) || input.price < 1 || input.price > 1_000_000_000) throw new MarketError("validation", "가격은 1원 이상 숫자로 입력해 주세요.");
  if (!regions.has(input.region) || !conditions.has(input.condition) || !tradeTypes.has(input.tradeType)) throw new MarketError("validation", "상품 상태·지역·거래 방식을 확인해 주세요.");
  if (Array.from(description).length < 10 || Array.from(description).length > 2000) throw new MarketError("validation", "상품 설명은 10~2000자로 입력해 주세요.");
  return { ...input, title, description };
}

export function validateBuyRequestInput(input: MarketBuyRequestInput): MarketBuyRequestInput {
  const title = input.title.trim();
  const summary = input.summary.trim();
  if (Array.from(title).length < 2 || Array.from(title).length > 100) throw new MarketError("validation", "구매 희망 제목은 2~100자로 입력해 주세요.");
  if (!categories.has(input.category) || input.category === "startupResale" || input.category === "facilityDevelopment") throw new MarketError("validation", "상품 카테고리를 확인해 주세요.");
  if (!Number.isSafeInteger(input.budget) || input.budget < 1 || input.budget > 1_000_000_000) throw new MarketError("validation", "희망 예산은 1원 이상 숫자로 입력해 주세요.");
  if (!regions.has(input.region)) throw new MarketError("validation", "지역을 확인해 주세요.");
  if (Array.from(summary).length < 10 || Array.from(summary).length > 1000) throw new MarketError("validation", "구매 희망 내용은 10~1000자로 입력해 주세요.");
  return { ...input, title, summary };
}

export function validateMarketStartupPostInput(input: MarketStartupPostInput): MarketStartupPostInput {
  const title = input.title.trim();
  const body = input.body.trim();
  const desiredScale = input.desiredScale.trim();
  if (Array.from(title).length < 2 || Array.from(title).length > 120) throw new MarketError("validation", "제목은 2~120자로 입력해 주세요.");
  if (Array.from(body).length < 10 || Array.from(body).length > 5000) throw new MarketError("validation", "본문은 10~5000자로 입력해 주세요.");
  if (!startupCategories.has(input.category)) throw new MarketError("validation", "창업·매매 카테고리를 확인해 주세요.");
  if (!regions.has(input.region)) throw new MarketError("validation", "지역을 확인해 주세요.");
  if (Array.from(desiredScale).length < 2 || Array.from(desiredScale).length > 100) throw new MarketError("validation", "희망 규모는 2~100자로 입력해 주세요.");
  if (!startupConsultations.has(input.consultationType) || !isStartupCombination(input.category, input.consultationType)) throw new MarketError("validation", "카테고리와 상담 유형을 확인해 주세요.");
  return { ...input, title, body, desiredScale };
}

export async function listMarketListings(client: SupabaseClient, filters: MarketListingFilters, limit = 24, offset = 0) {
  const { data, error } = await client.rpc("list_market_listings", {
    p_keyword: filters.keyword.trim() || null,
    p_category_code: filters.category === "all" || filters.category === "startupResale" || filters.category === "facilityDevelopment" ? null : filters.category,
    p_region_code: filters.region === "전체" ? null : filters.region,
    p_listing_status: filters.saleStatus === "all" ? null : filters.saleStatus,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) mapError(error);
  return parsePage(data, (item) => parseListing(client, item));
}

export async function listMarketBuyRequests(client: SupabaseClient, limit = 24, offset = 0) {
  const { data, error } = await client.rpc("list_market_buy_requests", { p_limit: limit, p_offset: offset });
  if (error) mapError(error);
  return parsePage(data, parseBuyRequest);
}

export async function listMarketStartupPosts(client: SupabaseClient, filters: MarketStartupPostFilters, limit = 24, offset = 0) {
  const { data, error } = await client.rpc("list_market_startup_posts", {
    p_keyword: filters.keyword.trim() || null,
    p_category_code: filters.category === "all" ? null : filters.category,
    p_region_code: filters.region === "전체" ? null : filters.region,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) mapError(error);
  return parsePage(data, parseStartupPost);
}

export async function getMarketStartupPost(client: SupabaseClient, postKey: string) {
  if (!startupPostKeyPattern.test(postKey)) throw new MarketError("validation", "창업·매매 게시글 식별자를 확인해 주세요.");
  const { data, error } = await client.rpc("get_market_startup_post", { p_post_key: postKey });
  if (error) mapError(error);
  return parseStartupPostDetail(data);
}

export async function getMyMarketStartupPostMutationContext(client: SupabaseClient, postKey: string) {
  if (!startupPostKeyPattern.test(postKey)) throw new MarketError("validation", "창업·매매 게시글 식별자를 확인해 주세요.");
  const { data, error } = await client.rpc("get_my_market_startup_post_mutation_context", { p_post_key: postKey });
  if (error) mapError(error);
  return parseStartupMutationContext(data);
}

function parseMutation(value: unknown, kind: "listing" | "buy_request", requestId: string): MarketMutationResult {
  if (!isObject(value)) invalidResponse();
  const idKey = kind === "listing" ? "listing_id" : "buy_request_id";
  const statusKey = kind === "listing" ? "sale_status" : "request_status";
  const expected = kind === "listing"
    ? ["request_id", idKey, statusKey, "version", "replayed", "removed_storage_paths"]
    : ["request_id", idKey, statusKey, "version", "replayed"];
  if (!exactKeys(value, expected) || value.request_id !== requestId || typeof value[idKey] !== "string" || !uuidPattern.test(value[idKey] as string) || typeof value[statusKey] !== "string" || typeof value.version !== "number" || !Number.isInteger(value.version) || typeof value.replayed !== "boolean") invalidResponse();
  const removed = kind === "listing" ? value.removed_storage_paths : [];
  if (!Array.isArray(removed) || removed.some((path) => typeof path !== "string")) invalidResponse();
  return { requestId, id: value[idKey] as string, status: value[statusKey] as string, version: value.version, replayed: value.replayed, removedStoragePaths: removed as string[] };
}

export async function mutateMarketListing(client: SupabaseClient, operation: MarketListingOperation, listingId: string | null, expectedVersion: number | null, input: MarketListingInput | null, requestId: string) {
  const payload = input ? validateListingInput(input) : null;
  const { data, error } = await client.rpc("mutate_market_listing", {
    p_operation: operation,
    p_listing_id: listingId,
    p_expected_version: expectedVersion,
    p_payload: payload ? { title: payload.title, category: payload.category, price: payload.price, region: payload.region, condition: payload.condition, trade_type: payload.tradeType, description: payload.description } : {},
    p_request_id: requestId,
  });
  if (error) mapError(error);
  return parseMutation(data, "listing", requestId);
}

export async function mutateMarketBuyRequest(client: SupabaseClient, operation: MarketBuyRequestOperation, buyRequestId: string | null, expectedVersion: number | null, input: MarketBuyRequestInput | null, requestId: string) {
  const payload = input ? validateBuyRequestInput(input) : null;
  const { data, error } = await client.rpc("mutate_market_buy_request", {
    p_operation: operation,
    p_buy_request_id: buyRequestId,
    p_expected_version: expectedVersion,
    p_payload: payload ? { title: payload.title, category: payload.category, budget: payload.budget, region: payload.region, summary: payload.summary } : {},
    p_request_id: requestId,
  });
  if (error) mapError(error);
  return parseMutation(data, "buy_request", requestId);
}

export async function mutateMarketStartupPost(client: SupabaseClient, operation: MarketStartupPostOperation, postKey: string | null, expectedVersion: number | null, input: MarketStartupPostInput | null) {
  const payload = input ? validateMarketStartupPostInput(input) : null;
  const { data, error } = await client.rpc("mutate_market_startup_post", {
    p_operation: operation,
    p_post_key: postKey,
    p_expected_version: expectedVersion,
    p_payload: payload ? {
      title: payload.title,
      body: payload.body,
      category: payload.category,
      region: payload.region,
      desired_scale: payload.desiredScale,
      consultation_type: payload.consultationType,
    } : {},
  });
  if (error) mapError(error);
  if (
    !isObject(data) || !exactKeys(data, ["post_key", "board_status", "publication_status", "version"]) ||
    typeof data.post_key !== "string" || !startupPostKeyPattern.test(data.post_key) ||
    (data.board_status !== "open" && data.board_status !== "closed") ||
    (data.publication_status !== "published" && data.publication_status !== "hidden" && data.publication_status !== "removed") ||
    typeof data.version !== "number" || !Number.isInteger(data.version) || data.version < 1
  ) invalidResponse();
  return {
    postKey: data.post_key,
    status: data.board_status,
    publicationStatus: data.publication_status,
    version: data.version,
  } as MarketStartupPostMutationResult;
}
