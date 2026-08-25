import type { SupabaseClient } from "@supabase/supabase-js";

export type MyActivityClub = {
  publicKey: string;
  name: string;
  regionLabel: string;
  membershipStatus: "active" | "suspended";
  joinedAt: string;
};

export type MyActivityUpcomingEvent = {
  eventId: string;
  clubPublicKey: string;
  clubName: string;
  title: string;
  startsAt: string;
  endsAt?: string;
  location: string;
  eventStatus: "scheduled" | "registration_open" | "registration_closed";
  joinedAt: string;
};

export type MyActivityPost = {
  kind: "community" | "club" | "course" | "certification";
  title: string;
  summary: string;
  contextLabel?: string;
  href: string;
  createdAt: string;
};

export type MyActivityMarketItem = {
  kind: "listing" | "buy_request";
  title: string;
  amount: number;
  region: string;
  status: "selling" | "reserved" | "sold" | "open" | "closed";
  href: string;
  createdAt: string;
};

export type MyActivityOverview = {
  clubs: MyActivityClub[];
  upcomingEvents: MyActivityUpcomingEvent[];
  posts: MyActivityPost[];
  marketItems: MyActivityMarketItem[];
};

export type MyActivityErrorKind = "authentication" | "validation" | "network" | "unknown";

export class MyActivityError extends Error {
  constructor(
    readonly kind: MyActivityErrorKind,
    readonly userMessage: string,
  ) {
    super(userMessage);
    this.name = "MyActivityError";
  }
}

const clubStatuses = new Set(["active", "suspended"]);
const eventStatuses = new Set(["scheduled", "registration_open", "registration_closed"]);
const postKinds = new Set(["community", "club", "course", "certification"]);
const marketKinds = new Set(["listing", "buy_request"]);
const marketStatuses = new Set(["selling", "reserved", "sold", "open", "closed"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

function isInternalPath(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//");
}

function invalidResponse(): never {
  throw new MyActivityError(
    "unknown",
    "내 활동 응답을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  );
}

function parseClub(value: unknown): MyActivityClub {
  if (!isRecord(value) || !exactKeys(value, ["public_key", "name", "region_label", "membership_status", "joined_at"])) {
    invalidResponse();
  }
  if (
    typeof value.public_key !== "string" || value.public_key.length === 0 ||
    typeof value.name !== "string" || value.name.length === 0 ||
    typeof value.region_label !== "string" || value.region_label.length === 0 ||
    typeof value.membership_status !== "string" || !clubStatuses.has(value.membership_status) ||
    !isIsoDate(value.joined_at)
  ) {
    invalidResponse();
  }
  return {
    publicKey: value.public_key,
    name: value.name,
    regionLabel: value.region_label,
    membershipStatus: value.membership_status as MyActivityClub["membershipStatus"],
    joinedAt: value.joined_at,
  };
}

function parseUpcomingEvent(value: unknown): MyActivityUpcomingEvent {
  if (!isRecord(value) || !exactKeys(value, [
    "event_id",
    "club_public_key",
    "club_name",
    "title",
    "starts_at",
    "ends_at",
    "location",
    "event_status",
    "joined_at",
  ])) {
    invalidResponse();
  }
  if (
    typeof value.event_id !== "string" || value.event_id.length === 0 ||
    typeof value.club_public_key !== "string" || value.club_public_key.length === 0 ||
    typeof value.club_name !== "string" || value.club_name.length === 0 ||
    typeof value.title !== "string" || value.title.length === 0 ||
    !isIsoDate(value.starts_at) ||
    (value.ends_at !== null && !isIsoDate(value.ends_at)) ||
    typeof value.location !== "string" || value.location.length === 0 ||
    typeof value.event_status !== "string" || !eventStatuses.has(value.event_status) ||
    !isIsoDate(value.joined_at)
  ) {
    invalidResponse();
  }
  return {
    eventId: value.event_id,
    clubPublicKey: value.club_public_key,
    clubName: value.club_name,
    title: value.title,
    startsAt: value.starts_at,
    endsAt: value.ends_at ?? undefined,
    location: value.location,
    eventStatus: value.event_status as MyActivityUpcomingEvent["eventStatus"],
    joinedAt: value.joined_at,
  };
}

function parsePost(value: unknown): MyActivityPost {
  if (!isRecord(value) || !exactKeys(value, ["kind", "title", "summary", "context_label", "href", "created_at"])) {
    invalidResponse();
  }
  if (
    typeof value.kind !== "string" || !postKinds.has(value.kind) ||
    typeof value.title !== "string" || value.title.length === 0 ||
    typeof value.summary !== "string" ||
    (value.context_label !== null && typeof value.context_label !== "string") ||
    !isInternalPath(value.href) ||
    !isIsoDate(value.created_at)
  ) {
    invalidResponse();
  }
  return {
    kind: value.kind as MyActivityPost["kind"],
    title: value.title,
    summary: value.summary,
    contextLabel: value.context_label ?? undefined,
    href: value.href,
    createdAt: value.created_at,
  };
}

function parseMarketItem(value: unknown): MyActivityMarketItem {
  if (!isRecord(value) || !exactKeys(value, ["kind", "title", "amount", "region", "status", "href", "created_at"])) {
    invalidResponse();
  }
  if (
    typeof value.kind !== "string" || !marketKinds.has(value.kind) ||
    typeof value.title !== "string" || value.title.length === 0 ||
    typeof value.amount !== "number" || !Number.isSafeInteger(value.amount) || value.amount < 1 ||
    typeof value.region !== "string" || value.region.length === 0 ||
    typeof value.status !== "string" || !marketStatuses.has(value.status) ||
    !isInternalPath(value.href) ||
    !isIsoDate(value.created_at)
  ) {
    invalidResponse();
  }
  return {
    kind: value.kind as MyActivityMarketItem["kind"],
    title: value.title,
    amount: value.amount,
    region: value.region,
    status: value.status as MyActivityMarketItem["status"],
    href: value.href,
    createdAt: value.created_at,
  };
}

export function parseMyActivityOverview(value: unknown): MyActivityOverview {
  if (!isRecord(value) || !exactKeys(value, ["clubs", "upcoming_events", "posts", "market_items"])) {
    invalidResponse();
  }
  if (
    !Array.isArray(value.clubs) ||
    !Array.isArray(value.upcoming_events) ||
    !Array.isArray(value.posts) ||
    !Array.isArray(value.market_items)
  ) {
    invalidResponse();
  }
  return {
    clubs: value.clubs.map(parseClub),
    upcomingEvents: value.upcoming_events.map(parseUpcomingEvent),
    posts: value.posts.map(parsePost),
    marketItems: value.market_items.map(parseMarketItem),
  };
}

function mapError(error: { message?: string; code?: string } | null): never {
  const message = error?.message ?? "";
  if (/로그인|계정 정보를 확인/.test(message) || error?.code === "PGRST301" || error?.code === "PGRST302") {
    throw new MyActivityError("authentication", "로그인 상태를 다시 확인해 주세요.");
  }
  if (/조회 범위/.test(message)) {
    throw new MyActivityError("validation", message);
  }
  if (/fetch|network/i.test(message)) {
    throw new MyActivityError("network", "네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
  }
  throw new MyActivityError("unknown", "내 활동을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
}

export async function fetchMyActivityOverview(
  client: SupabaseClient,
  itemLimit = 6,
): Promise<MyActivityOverview> {
  if (!Number.isInteger(itemLimit) || itemLimit < 1 || itemLimit > 12) {
    throw new MyActivityError("validation", "내 활동 조회 범위를 확인해 주세요.");
  }
  const { data, error } = await client.rpc("get_my_activity_overview", {
    p_item_limit: itemLimit,
  });
  if (error) mapError(error);
  return parseMyActivityOverview(data);
}
