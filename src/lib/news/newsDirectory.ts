import type { SupabaseClient } from "@supabase/supabase-js";

export type NewsCategory =
  | "parkGolfNews"
  | "screenParkGolf"
  | "equipmentBrand"
  | "noticeOperation";

export type NewsSourceType =
  | "adminVerified"
  | "officialNotice"
  | "memberReport"
  | "organizationNotice"
  | "brandPromotion";

export type NewsPublicationStatus = "published" | "hidden" | "removed";
export type NewsMutationOperation = "create" | "update" | "publish" | "hide" | "remove";

export type PublicNewsArticle = {
  newsKey: string;
  category: NewsCategory;
  title: string;
  summary: string;
  body: string;
  region: string;
  sourceType: NewsSourceType;
  sourceName: string | null;
  sourceUrl: string | null;
  publishedAt: string;
  featured: boolean;
};

export type ManagementNewsArticle = PublicNewsArticle & {
  publicationStatus: NewsPublicationStatus;
  version: number;
};

export type NewsPage<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

export type PublicNewsFilters = {
  category?: NewsCategory;
  keyword?: string;
  featuredOnly?: boolean;
};

export type ManagementNewsFilters = PublicNewsFilters & {
  publicationStatus?: NewsPublicationStatus;
};

export type NewsMutationPayload = Omit<PublicNewsArticle, "newsKey" | "featured"> & {
  featured: boolean;
};

export type NewsMutationResult = {
  newsKey: string;
  publicationStatus: NewsPublicationStatus;
  version: number;
};

type JsonObject = Record<string, unknown>;

const publicKeyPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const categories = new Set<NewsCategory>([
  "parkGolfNews",
  "screenParkGolf",
  "equipmentBrand",
  "noticeOperation",
]);
const sourceTypes = new Set<NewsSourceType>([
  "adminVerified",
  "officialNotice",
  "memberReport",
  "organizationNotice",
  "brandPromotion",
]);
const publicationStatuses = new Set<NewsPublicationStatus>([
  "published",
  "hidden",
  "removed",
]);
const operations = new Set<NewsMutationOperation>([
  "create",
  "update",
  "publish",
  "hide",
  "remove",
]);
const publicKeys = [
  "news_key",
  "category",
  "title",
  "summary",
  "body",
  "region",
  "source_type",
  "source_name",
  "source_url",
  "published_at",
  "is_featured",
] as const;

export class NewsDirectoryError extends Error {
  constructor(
    readonly code:
      | "authentication"
      | "permission"
      | "validation"
      | "conflict"
      | "notFound"
      | "network"
      | "unknown",
    readonly userMessage: string,
    readonly shouldRefresh = false,
  ) {
    super(userMessage);
    this.name = "NewsDirectoryError";
  }
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: JsonObject, expected: readonly string[]) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function invalidResponse(): never {
  throw new NewsDirectoryError("unknown", "뉴스·정보 응답 형식이 올바르지 않습니다.");
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isSafeExternalUrl(value: string | null) {
  if (value === null) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && value.length <= 500 && !/\s/.test(value);
  } catch {
    return false;
  }
}

export function parsePublicNewsArticle(value: unknown): PublicNewsArticle {
  if (!isObject(value) || !exactKeys(value, publicKeys)) invalidResponse();
  if (
    typeof value.news_key !== "string" || !publicKeyPattern.test(value.news_key) ||
    typeof value.category !== "string" || !categories.has(value.category as NewsCategory) ||
    typeof value.title !== "string" || typeof value.summary !== "string" ||
    typeof value.body !== "string" || typeof value.region !== "string" ||
    typeof value.source_type !== "string" || !sourceTypes.has(value.source_type as NewsSourceType) ||
    !isNullableString(value.source_name) || !isNullableString(value.source_url) ||
    !isSafeExternalUrl(value.source_url) || typeof value.published_at !== "string" ||
    !Number.isFinite(Date.parse(value.published_at)) || typeof value.is_featured !== "boolean"
  ) invalidResponse();

  return {
    newsKey: value.news_key,
    category: value.category as NewsCategory,
    title: value.title,
    summary: value.summary,
    body: value.body,
    region: value.region,
    sourceType: value.source_type as NewsSourceType,
    sourceName: value.source_name,
    sourceUrl: value.source_url,
    publishedAt: value.published_at,
    featured: value.is_featured,
  };
}

export function parseManagementNewsArticle(value: unknown): ManagementNewsArticle {
  if (!isObject(value) || !exactKeys(value, [...publicKeys, "publication_status", "version"])) {
    invalidResponse();
  }
  const publicValue = Object.fromEntries(publicKeys.map((key) => [key, value[key]]));
  const article = parsePublicNewsArticle(publicValue);
  if (
    typeof value.publication_status !== "string" ||
    !publicationStatuses.has(value.publication_status as NewsPublicationStatus) ||
    typeof value.version !== "number" || !Number.isSafeInteger(value.version) || value.version < 1
  ) invalidResponse();
  return {
    ...article,
    publicationStatus: value.publication_status as NewsPublicationStatus,
    version: value.version,
  };
}

function parsePage<T>(value: unknown, parseItem: (item: unknown) => T): NewsPage<T> {
  if (
    !isObject(value) ||
    !exactKeys(value, ["items", "total", "limit", "offset", "has_more"]) ||
    !Array.isArray(value.items) ||
    typeof value.total !== "number" || !Number.isSafeInteger(value.total) || value.total < 0 ||
    typeof value.limit !== "number" || !Number.isSafeInteger(value.limit) ||
    value.limit < 1 || value.limit > 50 ||
    typeof value.offset !== "number" || !Number.isSafeInteger(value.offset) || value.offset < 0 ||
    typeof value.has_more !== "boolean"
  ) invalidResponse();

  return {
    items: value.items.map(parseItem),
    total: value.total,
    limit: value.limit,
    offset: value.offset,
    hasMore: value.has_more,
  };
}

function mapError(error: { message?: string } | null): never {
  const message = error?.message ?? "";
  if (/로그인/.test(message)) {
    throw new NewsDirectoryError("authentication", "로그인이 필요합니다.", true);
  }
  if (/권한/.test(message)) {
    throw new NewsDirectoryError("permission", "뉴스·정보 운영 권한이 없습니다.");
  }
  if (/변경되었습니다/.test(message)) {
    throw new NewsDirectoryError(
      "conflict",
      "다른 변경이 있습니다. 새로고침 후 다시 확인해 주세요.",
      true,
    );
  }
  if (/찾을 수 없습니다/.test(message)) {
    throw new NewsDirectoryError("notFound", "뉴스를 찾을 수 없습니다.");
  }
  if (/확인해 주세요|사용 중|지원하지 않는|제거된|constraint|invalid input/i.test(message)) {
    throw new NewsDirectoryError("validation", "입력한 뉴스·정보를 확인해 주세요.");
  }
  if (/fetch|network/i.test(message)) {
    throw new NewsDirectoryError("network", "네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
  }
  throw new NewsDirectoryError(
    "unknown",
    "뉴스·정보를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  );
}

function validPage(limit: number, offset: number) {
  if (
    !Number.isSafeInteger(limit) || limit < 1 || limit > 50 ||
    !Number.isSafeInteger(offset) || offset < 0
  ) {
    throw new NewsDirectoryError("validation", "페이지 범위를 확인해 주세요.");
  }
}

function normalizeKeyword(value?: string) {
  const keyword = value?.trim() || undefined;
  if (keyword && keyword.length > 100) {
    throw new NewsDirectoryError("validation", "검색어는 100자 이하로 입력해 주세요.");
  }
  return keyword;
}

function normalizeKey(value: string) {
  const key = value.trim();
  if (!publicKeyPattern.test(key)) {
    throw new NewsDirectoryError("validation", "공개 news key를 확인해 주세요.");
  }
  return key;
}

function validateFilters(filters: PublicNewsFilters) {
  if (filters.category && !categories.has(filters.category)) {
    throw new NewsDirectoryError("validation", "뉴스 카테고리를 확인해 주세요.");
  }
}

export async function listPublicNewsArticles(
  client: SupabaseClient,
  filters: PublicNewsFilters = {},
  limit = 24,
  offset = 0,
) {
  validPage(limit, offset);
  validateFilters(filters);
  const { data, error } = await client.rpc("list_public_news_articles", {
    p_category: filters.category ?? null,
    p_keyword: normalizeKeyword(filters.keyword) ?? null,
    p_featured_only: filters.featuredOnly ?? false,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) mapError(error);
  return parsePage(data, parsePublicNewsArticle);
}

export async function getPublicNewsArticle(client: SupabaseClient, newsKey: string) {
  const key = normalizeKey(newsKey);
  const { data, error } = await client.rpc("get_public_news_article", { p_news_key: key });
  if (error) mapError(error);
  return parsePublicNewsArticle(data);
}

export async function listNewsArticlesForManagement(
  client: SupabaseClient,
  filters: ManagementNewsFilters = {},
  limit = 30,
  offset = 0,
) {
  validPage(limit, offset);
  validateFilters(filters);
  if (filters.publicationStatus && !publicationStatuses.has(filters.publicationStatus)) {
    throw new NewsDirectoryError("validation", "뉴스 공개 상태를 확인해 주세요.");
  }
  const { data, error } = await client.rpc("list_news_articles_for_management", {
    p_category: filters.category ?? null,
    p_keyword: normalizeKeyword(filters.keyword) ?? null,
    p_publication_status: filters.publicationStatus ?? null,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) mapError(error);
  return parsePage(data, parseManagementNewsArticle);
}

function mutationBody(payload?: NewsMutationPayload) {
  if (!payload) return {};
  if (!categories.has(payload.category) || !sourceTypes.has(payload.sourceType)) {
    throw new NewsDirectoryError("validation", "입력한 뉴스·정보를 확인해 주세요.");
  }
  if (!isSafeExternalUrl(payload.sourceUrl)) {
    throw new NewsDirectoryError("validation", "공식 출처 URL을 확인해 주세요.");
  }
  if (!Number.isFinite(Date.parse(payload.publishedAt))) {
    throw new NewsDirectoryError("validation", "게시 일시를 확인해 주세요.");
  }
  return {
    category: payload.category,
    title: payload.title.trim(),
    summary: payload.summary.trim(),
    body: payload.body.trim(),
    region: payload.region.trim(),
    source_type: payload.sourceType,
    source_name: payload.sourceName?.trim() || null,
    source_url: payload.sourceUrl?.trim() || null,
    published_at: payload.publishedAt,
    is_featured: payload.featured,
  };
}

export async function mutateNewsArticle(
  client: SupabaseClient,
  operation: NewsMutationOperation,
  newsKey: string,
  expectedVersion: number | null,
  payload?: NewsMutationPayload,
): Promise<NewsMutationResult> {
  const key = normalizeKey(newsKey);
  if (!operations.has(operation)) {
    throw new NewsDirectoryError("validation", "뉴스 작업을 확인해 주세요.");
  }
  if (
    (operation === "create" && expectedVersion !== null) ||
    (operation !== "create" && (!Number.isSafeInteger(expectedVersion) || (expectedVersion ?? 0) < 1)) ||
    ((operation === "create" || operation === "update") && !payload) ||
    (!(operation === "create" || operation === "update") && payload)
  ) {
    throw new NewsDirectoryError("validation", "뉴스 작업 정보를 확인해 주세요.");
  }

  const { data, error } = await client.rpc("mutate_news_article", {
    p_operation: operation,
    p_news_key: key,
    p_expected_version: expectedVersion,
    p_payload: mutationBody(payload),
  });
  if (error) mapError(error);
  if (
    !isObject(data) || !exactKeys(data, ["news_key", "publication_status", "version"]) ||
    data.news_key !== key || typeof data.publication_status !== "string" ||
    !publicationStatuses.has(data.publication_status as NewsPublicationStatus) ||
    typeof data.version !== "number" || !Number.isSafeInteger(data.version) || data.version < 1
  ) invalidResponse();
  return {
    newsKey: key,
    publicationStatus: data.publication_status as NewsPublicationStatus,
    version: data.version,
  };
}
