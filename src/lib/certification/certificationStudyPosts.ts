import type { SupabaseClient } from "@supabase/supabase-js";

export type CertificationStudyPost = {
  postKey: string;
  body: string;
  authorDisplayName: string;
  createdAt: string;
};

export type CertificationStudyPage = {
  items: CertificationStudyPost[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

export type CertificationStudySubmissionResult = {
  postKey: string;
  postStatus: "published";
};

type JsonObject = Record<string, unknown>;

const postKeyPattern = /^[0-9a-f]{32}$/;
const postKeys = ["post_key", "body", "author_display_name", "created_at"] as const;

export class CertificationStudyPostError extends Error {
  readonly code: "authentication" | "permission" | "validation" | "network" | "unknown";
  readonly userMessage: string;

  constructor(
    code: "authentication" | "permission" | "validation" | "network" | "unknown",
    userMessage: string,
  ) {
    super(userMessage);
    this.code = code;
    this.userMessage = userMessage;
    this.name = "CertificationStudyPostError";
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
  throw new CertificationStudyPostError(
    "unknown",
    "시험 준비 게시판 응답 형식이 올바르지 않습니다.",
  );
}

function validDateTime(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

export function parseCertificationStudyPost(value: unknown): CertificationStudyPost {
  if (!isObject(value) || !exactKeys(value, postKeys)) invalidResponse();
  if (
    typeof value.post_key !== "string" || !postKeyPattern.test(value.post_key) ||
    typeof value.body !== "string" || value.body !== value.body.trim() ||
    Array.from(value.body).length < 10 || Array.from(value.body).length > 1000 ||
    typeof value.author_display_name !== "string" ||
    value.author_display_name !== value.author_display_name.trim() ||
    value.author_display_name.length < 1 || value.author_display_name.length > 100 ||
    !validDateTime(value.created_at)
  ) invalidResponse();

  return {
    postKey: value.post_key,
    body: value.body,
    authorDisplayName: value.author_display_name,
    createdAt: value.created_at,
  };
}

export function parseCertificationStudyPage(value: unknown): CertificationStudyPage {
  if (
    !isObject(value) ||
    !exactKeys(value, ["items", "total", "limit", "offset", "has_more"]) ||
    !Array.isArray(value.items) ||
    typeof value.total !== "number" || !Number.isInteger(value.total) || value.total < 0 ||
    typeof value.limit !== "number" || !Number.isInteger(value.limit) || value.limit < 1 || value.limit > 24 ||
    typeof value.offset !== "number" || !Number.isInteger(value.offset) || value.offset < 0 ||
    typeof value.has_more !== "boolean"
  ) invalidResponse();

  const items = value.items.map(parseCertificationStudyPost);
  if (items.length > value.limit) invalidResponse();
  if (value.has_more !== (value.offset + items.length < value.total)) invalidResponse();

  return {
    items,
    total: value.total,
    limit: value.limit,
    offset: value.offset,
    hasMore: value.has_more,
  };
}

function mapError(error: { message?: string } | null): never {
  const message = error?.message ?? "";
  if (/로그인|permission denied/i.test(message)) {
    throw new CertificationStudyPostError(
      "authentication",
      "로그인한 정상 활동 회원만 시험 준비 글을 작성할 수 있습니다.",
    );
  }
  if (/정상 활동/.test(message)) {
    throw new CertificationStudyPostError(
      "permission",
      "정상 활동 계정만 시험 준비 글을 작성할 수 있습니다.",
    );
  }
  if (/10~1000자|페이지 범위|확인해 주세요/.test(message)) {
    throw new CertificationStudyPostError(
      "validation",
      message || "시험 준비 이야기 내용을 확인해 주세요.",
    );
  }
  if (/fetch|network/i.test(message)) {
    throw new CertificationStudyPostError(
      "network",
      "네트워크 연결을 확인한 뒤 다시 시도해 주세요.",
    );
  }
  throw new CertificationStudyPostError(
    "unknown",
    "시험 준비 게시판을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  );
}

export function validateCertificationStudyBody(body: string) {
  const normalized = body.trim();
  const length = Array.from(normalized).length;
  if (length < 10 || length > 1000) {
    throw new CertificationStudyPostError(
      "validation",
      "시험 준비 이야기 내용은 10~1000자로 입력해 주세요.",
    );
  }
  return normalized;
}

export async function listPublicCertificationStudyPosts(
  client: SupabaseClient,
  limit = 20,
  offset = 0,
): Promise<CertificationStudyPage> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 24 || !Number.isInteger(offset) || offset < 0) {
    throw new CertificationStudyPostError(
      "validation",
      "시험 준비 게시판 페이지 범위를 확인해 주세요.",
    );
  }
  const { data, error } = await client.rpc("list_public_certification_study_posts", {
    p_limit: limit,
    p_offset: offset,
  });
  if (error) mapError(error);
  return parseCertificationStudyPage(data);
}

export async function submitCertificationStudyPost(
  client: SupabaseClient,
  body: string,
): Promise<CertificationStudySubmissionResult> {
  const normalizedBody = validateCertificationStudyBody(body);
  const { data, error } = await client.rpc("submit_certification_study_post", {
    p_body: normalizedBody,
  });
  if (error) mapError(error);
  if (
    !isObject(data) ||
    !exactKeys(data, ["post_key", "post_status"]) ||
    typeof data.post_key !== "string" || !postKeyPattern.test(data.post_key) ||
    data.post_status !== "published"
  ) invalidResponse();
  return { postKey: data.post_key, postStatus: "published" };
}
