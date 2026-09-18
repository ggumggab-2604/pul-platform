import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  MarketBuyRequest,
  MarketListingContactMethod,
  StartupBoardPostDetail,
} from "@/types";
import {
  MarketError,
  mapError,
  parseBuyRequest,
  parseMutation,
  parsePage,
  parseStartupMutationContext,
  parseStartupPostDetail,
  validateBuyRequestInput,
  validateMarketContact,
  validateMarketStartupPostInput,
  type MarketBuyRequestInput,
  type MarketBuyRequestOperation,
  type MarketStartupPostInput,
  type MarketStartupPostMutationContext,
  type MarketStartupPostOperation,
} from "./market";
import type { MarketQuery } from "./marketNavigation";

export type MarketContact = {
  publicContactMethod: MarketListingContactMethod | null;
  publicContactValue: string | null;
};
export type ContactInput = {
  publicContactMethod: MarketListingContactMethod;
  publicContactValue: string;
  publicContactConsent: boolean;
};
export type BuyRequestInputV2 = MarketBuyRequestInput & ContactInput;
export type BuyRequestDetail = MarketBuyRequest & MarketContact;
export type ResaleDetails = {
  areaSqm: number | null;
  bayCount: number | null;
  deposit: number | null;
  monthlyRent: number | null;
  maintenance: number | null;
  askingPrice: number | null;
  negotiable: boolean | null;
  monthlyRevenue: number | null;
  rentTerms: string | null;
};
export const emptyResaleDetails = (): ResaleDetails => ({
  areaSqm: null,
  bayCount: null,
  deposit: null,
  monthlyRent: null,
  maintenance: null,
  askingPrice: null,
  negotiable: null,
  monthlyRevenue: null,
  rentTerms: null,
});
export type StartupInputV2 = MarketStartupPostInput & {
  resale: ResaleDetails | null;
  contact: ContactInput | null;
};
export type StartupDetailV2 = StartupBoardPostDetail &
  MarketContact & { resale: ResaleDetails | null; images: string[] };
export type StartupContextV2 = MarketStartupPostMutationContext &
  MarketContact & { resale: ResaleDetails | null; images: string[] };

function invalid(): never {
  throw new MarketError("unknown", "장터 응답 형식이 올바르지 않습니다.");
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).sort().join() !== keys.sort().join()) invalid();
}
function contact(value: Record<string, unknown>): MarketContact {
  const method = value.public_contact_method,
    raw = value.public_contact_value;
  if (method === null && raw === null)
    return { publicContactMethod: null, publicContactValue: null };
  if (
    !["phone", "sms", "external_url"].includes(String(method)) ||
    typeof raw !== "string"
  )
    invalid();
  const normalized = validateMarketContact({
    publicContactMethod: method as MarketListingContactMethod,
    publicContactValue: raw,
    publicContactConsent: true,
  });
  return {
    publicContactMethod: normalized.publicContactMethod,
    publicContactValue: normalized.publicContactValue,
  };
}
export function validateResaleDetails(
  value: ResaleDetails | null,
): ResaleDetails | null {
  if (value === null) return null;
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join() !==
      Object.keys(emptyResaleDetails()).sort().join()
  )
    throw new MarketError("validation", "매장 정보 입력 형식을 확인해 주세요.");
  for (const key of [
    "areaSqm",
    "bayCount",
    "deposit",
    "monthlyRent",
    "maintenance",
    "askingPrice",
    "monthlyRevenue",
  ] as const) {
    const v = value[key];
    if (
      v !== null &&
      (typeof v !== "number" ||
        !Number.isFinite(v) ||
        v < 0 ||
        v >
          (key === "areaSqm"
            ? 100000
            : key === "bayCount"
              ? 1000
              : 100000000000) ||
        (key === "areaSqm"
          ? Math.abs(Math.round(v * 100) - v * 100) > 0.000001
          : !Number.isSafeInteger(v)))
    )
      throw new MarketError(
        "validation",
        "면적·타석 수·금액 입력 범위를 확인해 주세요.",
      );
  }
  if (value.negotiable !== null && typeof value.negotiable !== "boolean")
    throw new MarketError("validation", "가격 협의 여부를 확인해 주세요.");
  if (
    value.rentTerms !== null &&
    (typeof value.rentTerms !== "string" ||
      Array.from(value.rentTerms.trim()).length > 500)
  )
    throw new MarketError(
      "validation",
      "임대조건은 500자 이하로 입력해 주세요.",
    );
  return { ...value, rentTerms: value.rentTerms?.trim() || null };
}
export async function listBuyRequestsV2(
  client: SupabaseClient,
  filters: Pick<MarketQuery, "keyword" | "category" | "region" | "status">,
  limit = 24,
  offset = 0,
) {
  const { data, error } = await client.rpc("list_market_buy_requests_v2", {
    p_keyword: filters.keyword.trim() || null,
    p_category_code: filters.category === "all" ? null : filters.category,
    p_region_code: filters.region === "전체" ? null : filters.region,
    p_request_status: filters.status === "all" ? null : filters.status,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) mapError(error);
  return parsePage(data, parseBuyRequest);
}
export async function getBuyRequestV2(
  client: SupabaseClient,
  id: string,
): Promise<BuyRequestDetail> {
  const { data, error } = await client.rpc("get_market_buy_request_v2", {
    p_buy_request_id: id,
  });
  if (error) mapError(error);
  const row = object(data);
  exact(row, ["post", "public_contact_method", "public_contact_value"]);
  return { ...parseBuyRequest(row.post), ...contact(row) };
}
export async function mutateBuyRequestV2(
  client: SupabaseClient,
  operation: MarketBuyRequestOperation,
  id: string | null,
  version: number | null,
  input: BuyRequestInputV2 | null,
  requestId: string,
) {
  const base = input ? validateBuyRequestInput(input) : null;
  const c = input ? validateMarketContact(input) : null;
  const { data, error } = await client.rpc("mutate_market_buy_request_v2", {
    p_operation: operation,
    p_buy_request_id: id,
    p_expected_version: version,
    p_request_id: requestId,
    p_payload:
      base && c
        ? {
            title: base.title,
            category: base.category,
            budget: base.budget,
            region: base.region,
            summary: base.summary,
            public_contact_method: c.publicContactMethod,
            public_contact_value: c.publicContactValue,
            public_contact_consent: c.publicContactConsent,
          }
        : {},
  });
  if (error) mapError(error);
  return parseMutation(data, "buy_request", requestId);
}
function startupExtras(postKey: string, row: Record<string, unknown>) {
  const paths = row.image_paths;
  if (
    !Array.isArray(paths) ||
    paths.length > 5 ||
    paths.some(
      (path) =>
        typeof path !== "string" ||
        !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/original$/.test(path),
    )
  )
    invalid();
  return {
    ...contact(row),
    resale: validateResaleDetails(row.resale_details as ResaleDetails | null),
    // The route rechecks current DB visibility before issuing a short-lived URL.
    images: paths.map(
      (path: string) =>
        `/market/startup-media/${encodeURIComponent(postKey)}/${path.split("/")[1]}`,
    ),
  };
}
export async function getStartupV2(
  client: SupabaseClient,
  postKey: string,
): Promise<StartupDetailV2> {
  const { data, error } = await client.rpc("get_market_startup_post_v2", {
    p_post_key: postKey,
  });
  if (error) mapError(error);
  const row = object(data);
  exact(row, [
    "post",
    "resale_details",
    "public_contact_method",
    "public_contact_value",
    "image_paths",
  ]);
  return {
    ...parseStartupPostDetail(row.post),
    ...startupExtras(postKey, row),
  };
}
export async function getStartupContextV2(
  client: SupabaseClient,
  postKey: string,
): Promise<StartupContextV2> {
  const { data, error } = await client.rpc(
    "get_my_market_startup_post_context_v2",
    { p_post_key: postKey },
  );
  if (error) mapError(error);
  const row = object(data);
  exact(row, [
    "post",
    "resale_details",
    "public_contact_method",
    "public_contact_value",
    "image_paths",
  ]);
  return {
    ...parseStartupMutationContext(row.post),
    ...startupExtras(postKey, row),
  };
}
export async function mutateStartupV2(
  client: SupabaseClient,
  operation: MarketStartupPostOperation,
  postKey: string | null,
  version: number | null,
  input: StartupInputV2 | null,
  requestId: string,
) {
  const base = input
    ? validateMarketStartupPostInput({
        ...input,
        desiredScale: input.desiredScale.trim() || "미기재",
      })
    : null;
  if (
    base?.category === "screenResale" &&
    base.consultationType === "transfer" &&
    !input?.contact
  )
    throw new MarketError(
      "validation",
      "양도글의 연락 방법과 공개 동의를 입력해 주세요.",
    );
  const c = input?.contact ? validateMarketContact(input.contact) : null;
  const resale = input ? validateResaleDetails(input.resale) : null;
  const { data, error } = await client.rpc("mutate_market_startup_post_v2", {
    p_operation: operation,
    p_post_key: postKey,
    p_expected_version: version,
    p_request_id: requestId,
    p_payload: base
      ? {
          title: base.title,
          body: base.body,
          category: base.category,
          region: base.region,
          desired_scale: base.desiredScale,
          consultation_type: base.consultationType,
          resale_details: resale,
          public_contact_method: c?.publicContactMethod ?? null,
          public_contact_value: c?.publicContactValue ?? null,
          public_contact_consent: c?.publicContactConsent ?? false,
        }
      : {},
  });
  if (error) mapError(error);
  const row = object(data);
  exact(row, [
    "post_key",
    "board_status",
    "publication_status",
    "version",
    "removed_storage_paths",
    "replayed",
  ]);
  if (
    typeof row.post_key !== "string" ||
    !/^[0-9a-f]{24}$/.test(row.post_key) ||
    typeof row.version !== "number" ||
    !Number.isInteger(row.version) ||
    row.version < 1 ||
    typeof row.replayed !== "boolean" ||
    !["open", "closed"].includes(String(row.board_status)) ||
    !["published", "hidden", "removed"].includes(
      String(row.publication_status),
    ) ||
    !Array.isArray(row.removed_storage_paths) ||
    row.removed_storage_paths.some(
      (path) =>
        typeof path !== "string" ||
        !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/original$/.test(path),
    )
  )
    invalid();
  return {
    postKey: row.post_key,
    version: row.version,
    removedStoragePaths: row.removed_storage_paths as string[],
    replayed: row.replayed,
  };
}
