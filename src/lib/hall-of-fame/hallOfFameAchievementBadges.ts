import "client-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { HallOfFamePublicBadge } from "@/lib/hall-of-fame/hallOfFameMemberUi";

const canonicalUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const badgeCodePattern = /^[a-z][a-z0-9_]*$/;

export class HallOfFameAchievementBadgeError extends Error {
  readonly userMessage: string;

  constructor(userMessage: string) {
    super(userMessage);
    this.name = "HallOfFameAchievementBadgeError";
    this.userMessage = userMessage;
  }
}

function invalidResponse(): HallOfFameAchievementBadgeError {
  return new HallOfFameAchievementBadgeError("명예의 전당 성취 정보를 불러오지 못했습니다.");
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function canonicalUuid(value: unknown): string {
  if (typeof value !== "string" || !canonicalUuidPattern.test(value)) throw invalidResponse();
  return value;
}

function parseAchievements(value: unknown): HallOfFamePublicBadge[] {
  if (!Array.isArray(value)) throw invalidResponse();
  const seenCodes = new Set<string>();

  return value.map((item) => {
    if (!isPlainRecord(item) || !hasExactKeys(item, ["code", "name", "source_count"])) {
      throw invalidResponse();
    }
    if (
      typeof item.code !== "string" ||
      !badgeCodePattern.test(item.code) ||
      seenCodes.has(item.code) ||
      typeof item.name !== "string" ||
      item.name !== item.name.trim() ||
      item.name.length === 0 ||
      item.name.length > 100 ||
      typeof item.source_count !== "number" ||
      !Number.isSafeInteger(item.source_count) ||
      item.source_count < 1
    ) {
      throw invalidResponse();
    }
    seenCodes.add(item.code);
    return {
      code: item.code,
      name: item.name,
      sourceCount: item.source_count,
    };
  });
}

export function normalizeHallOfFameAchievementMembershipIds(
  membershipIds: readonly string[],
): string[] {
  if (membershipIds.length < 1 || membershipIds.length > 100) throw invalidResponse();

  const uniqueIds: string[] = [];
  const seenIds = new Set<string>();
  for (const membershipId of membershipIds) {
    const parsed = canonicalUuid(membershipId);
    if (!seenIds.has(parsed)) {
      seenIds.add(parsed);
      uniqueIds.push(parsed);
    }
  }
  return uniqueIds;
}

export function parseHallOfFameMemberAchievementRows(
  data: unknown,
  expectedMembershipIds: readonly string[],
): ReadonlyMap<string, HallOfFamePublicBadge[]> {
  if (!Array.isArray(data)) throw invalidResponse();
  const expectedIds = normalizeHallOfFameAchievementMembershipIds(expectedMembershipIds);
  if (data.length !== expectedIds.length) throw invalidResponse();

  const achievementsByMembershipId = new Map<string, HallOfFamePublicBadge[]>();
  data.forEach((row, index) => {
    if (!isPlainRecord(row) || !hasExactKeys(row, ["membership_id", "achievements"])) {
      throw invalidResponse();
    }
    const membershipId = canonicalUuid(row.membership_id);
    if (membershipId !== expectedIds[index] || achievementsByMembershipId.has(membershipId)) {
      throw invalidResponse();
    }
    achievementsByMembershipId.set(membershipId, parseAchievements(row.achievements));
  });

  return achievementsByMembershipId;
}

export async function listHallOfFamePublicAchievementsForClubMembers(
  supabase: SupabaseClient,
  clubId: string,
  membershipIds: readonly string[],
): Promise<ReadonlyMap<string, HallOfFamePublicBadge[]>> {
  const parsedClubId = canonicalUuid(clubId);
  const normalizedMembershipIds = normalizeHallOfFameAchievementMembershipIds(membershipIds);
  const { data, error } = await supabase.rpc(
    "list_hall_of_fame_public_achievements_for_club_members",
    {
      p_club_id: parsedClubId,
      p_membership_ids: normalizedMembershipIds,
    },
  );

  if (error) throw new HallOfFameAchievementBadgeError("명예의 전당 성취 정보를 불러오지 못했습니다.");
  return parseHallOfFameMemberAchievementRows(data, normalizedMembershipIds);
}
