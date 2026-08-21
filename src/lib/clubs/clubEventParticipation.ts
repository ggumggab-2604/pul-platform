import type { SupabaseClient } from "@supabase/supabase-js";

export type ClubEventParticipationEntry = {
  eventId: string;
  participantCount: number;
  isParticipating: boolean;
  joinedAt?: string;
};

export type ClubEventParticipationSnapshot = {
  availability: "available" | "loadFailed" | "clubNotFound";
  authenticationStatus: "anonymous" | "authenticated";
  canJoin: boolean;
  events: ClubEventParticipationEntry[];
};

export type ClubEventParticipationMutationResult = {
  eventId: string;
  participating: boolean;
  participantCount: number;
};

type ErrorKind =
  | "authentication"
  | "permission"
  | "validation"
  | "capacity"
  | "notFound"
  | "network"
  | "unknown";

export class ClubEventParticipationError extends Error {
  constructor(
    readonly kind: ErrorKind,
    readonly userMessage: string,
    readonly shouldRefresh = false,
  ) {
    super(userMessage);
    this.name = "ClubEventParticipationError";
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

function invalidResponse(): never {
  throw new ClubEventParticipationError(
    "unknown",
    "공식 일정 참가 응답 형식을 확인할 수 없습니다.",
    true,
  );
}

export function emptyClubEventParticipation(
  availability: ClubEventParticipationSnapshot["availability"] = "loadFailed",
): ClubEventParticipationSnapshot {
  return {
    availability,
    authenticationStatus: "anonymous",
    canJoin: false,
    events: [],
  };
}

export function parseClubEventParticipationResponse(
  raw: unknown,
): ClubEventParticipationSnapshot {
  if (
    !isRecord(raw) ||
    !hasExactKeys(raw, ["authentication_status", "can_join", "events"]) ||
    (raw.authentication_status !== "anonymous" && raw.authentication_status !== "authenticated") ||
    typeof raw.can_join !== "boolean" ||
    !Array.isArray(raw.events)
  ) {
    invalidResponse();
  }

  const seen = new Set<string>();
  const events = raw.events.map((item): ClubEventParticipationEntry => {
    if (
      !isRecord(item) ||
      !hasExactKeys(item, ["event_id", "participant_count", "is_participating", "joined_at"]) ||
      typeof item.event_id !== "string" ||
      !uuidPattern.test(item.event_id) ||
      seen.has(item.event_id) ||
      typeof item.participant_count !== "number" ||
      !Number.isInteger(item.participant_count) ||
      item.participant_count < 0 ||
      typeof item.is_participating !== "boolean" ||
      (item.joined_at !== null && !isIsoDate(item.joined_at)) ||
      (item.is_participating && item.joined_at === null) ||
      (!item.is_participating && item.joined_at !== null)
    ) {
      invalidResponse();
    }
    seen.add(item.event_id);
    return {
      eventId: item.event_id,
      participantCount: item.participant_count,
      isParticipating: item.is_participating,
      joinedAt: item.joined_at ?? undefined,
    };
  });

  if (raw.authentication_status === "anonymous" && raw.can_join) invalidResponse();

  return {
    availability: "available",
    authenticationStatus: raw.authentication_status,
    canJoin: raw.can_join,
    events,
  };
}

function mapRpcError(error: { message?: string; code?: string } | null): ClubEventParticipationError {
  const message = error?.message ?? "";
  if (/로그인|JWT/i.test(message) || error?.code === "PGRST301" || error?.code === "PGRST302") {
    return new ClubEventParticipationError("authentication", "로그인 상태를 다시 확인해 주세요.", true);
  }
  if (/회원만|정상 활동 계정|활동 중인 동호회/.test(message)) {
    return new ClubEventParticipationError("permission", message || "동호회 회원만 참가할 수 있습니다.", true);
  }
  if (/정원이 모두 찼습니다/.test(message)) {
    return new ClubEventParticipationError("capacity", message, true);
  }
  if (/찾을 수 없습니다/.test(message)) {
    return new ClubEventParticipationError("notFound", message, true);
  }
  if (/현재 참가 신청|요청 값/.test(message)) {
    return new ClubEventParticipationError("validation", message, true);
  }
  return new ClubEventParticipationError(
    "network",
    "공식 일정 참가 상태를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  );
}

export async function fetchClubEventParticipation(
  supabase: SupabaseClient,
  clubUuid: string,
): Promise<ClubEventParticipationSnapshot> {
  const { data, error } = await supabase.rpc("get_club_event_participation", {
    p_club_id: clubUuid,
  });
  if (error) throw mapRpcError(error);
  return parseClubEventParticipationResponse(data);
}

export async function mutateClubEventParticipation(
  supabase: SupabaseClient,
  input: { eventId: string; operation: "join" | "leave" },
): Promise<ClubEventParticipationMutationResult> {
  const functionName = input.operation === "join" ? "join_club_event" : "leave_club_event";
  const { data, error } = await supabase.rpc(functionName, { p_event_id: input.eventId });
  if (error) throw mapRpcError(error);
  if (
    !isRecord(data) ||
    !hasExactKeys(data, ["event_id", "participating", "participant_count"]) ||
    data.event_id !== input.eventId ||
    typeof data.participating !== "boolean" ||
    data.participating !== (input.operation === "join") ||
    typeof data.participant_count !== "number" ||
    !Number.isInteger(data.participant_count) ||
    data.participant_count < 0
  ) {
    invalidResponse();
  }
  return {
    eventId: data.event_id,
    participating: data.participating,
    participantCount: data.participant_count,
  };
}
