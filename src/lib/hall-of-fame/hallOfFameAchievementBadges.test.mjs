import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import {
  HallOfFameAchievementBadgeError,
  listHallOfFamePublicAchievementsForClubMembers,
  normalizeHallOfFameAchievementMembershipIds,
  parseHallOfFameMemberAchievementRows,
} from "./hallOfFameAchievementBadges.ts";

const clubId = randomUUID();
const firstMembershipId = randomUUID();
const secondMembershipId = randomUUID();

test("strict parser preserves member identity, verified counts, and multiple achievements", () => {
  const parsed = parseHallOfFameMemberAchievementRows(
    [
      {
        membership_id: firstMembershipId,
        achievements: [
          { code: "hole_in_one", name: "홀인원", source_count: 3 },
          { code: "albatross", name: "알바트로스", source_count: 1 },
        ],
      },
      { membership_id: secondMembershipId, achievements: [] },
    ],
    [firstMembershipId, secondMembershipId],
  );

  assert.deepEqual(parsed.get(firstMembershipId), [
    { code: "hole_in_one", name: "홀인원", sourceCount: 3 },
    { code: "albatross", name: "알바트로스", sourceCount: 1 },
  ]);
  assert.deepEqual(parsed.get(secondMembershipId), []);
});

test("duplicate requested memberships are deduplicated without display-name matching", () => {
  assert.deepEqual(
    normalizeHallOfFameAchievementMembershipIds([
      firstMembershipId,
      firstMembershipId,
      secondMembershipId,
    ]),
    [firstMembershipId, secondMembershipId],
  );
});

test("strict parser rejects reordered, missing, extra, duplicate, or malformed rows", () => {
  const invalidCases = [
    [
      [{ membership_id: secondMembershipId, achievements: [] }],
      [firstMembershipId],
    ],
    [[], [firstMembershipId]],
    [
      [{ membership_id: firstMembershipId, achievements: [], unexpected: true }],
      [firstMembershipId],
    ],
    [
      [
        {
          membership_id: firstMembershipId,
          achievements: [
            { code: "hole_in_one", name: "홀인원", source_count: 1 },
            { code: "hole_in_one", name: "홀인원", source_count: 1 },
          ],
        },
      ],
      [firstMembershipId],
    ],
    [
      [
        {
          membership_id: firstMembershipId,
          achievements: [{ code: "hole_in_one", name: "홀인원", source_count: 0 }],
        },
      ],
      [firstMembershipId],
    ],
  ];

  for (const [rows, expected] of invalidCases) {
    assert.throws(
      () => parseHallOfFameMemberAchievementRows(rows, expected),
      HallOfFameAchievementBadgeError,
    );
  }
});

test("one bulk RPC call carries canonical membership IDs and parses its response", async () => {
  const calls = [];
  const supabase = {
    async rpc(name, parameters) {
      calls.push([name, parameters]);
      return {
        data: [
          {
            membership_id: firstMembershipId,
            achievements: [{ code: "condor", name: "콘도르", source_count: 1 }],
          },
          { membership_id: secondMembershipId, achievements: [] },
        ],
        error: null,
      };
    },
  };

  const result = await listHallOfFamePublicAchievementsForClubMembers(
    supabase,
    clubId,
    [firstMembershipId, firstMembershipId, secondMembershipId],
  );
  assert.deepEqual(calls, [
    [
      "list_hall_of_fame_public_achievements_for_club_members",
      {
        p_club_id: clubId,
        p_membership_ids: [firstMembershipId, secondMembershipId],
      },
    ],
  ]);
  assert.equal(result.get(firstMembershipId)?.[0]?.name, "콘도르");
});

test("invalid IDs, empty/oversized batches, and RPC errors fail closed", async () => {
  assert.throws(() => normalizeHallOfFameAchievementMembershipIds([]));
  assert.throws(() => normalizeHallOfFameAchievementMembershipIds(["not-a-uuid"]));
  assert.throws(() =>
    normalizeHallOfFameAchievementMembershipIds(
      Array.from({ length: 101 }, () => firstMembershipId),
    ),
  );

  await assert.rejects(
    listHallOfFamePublicAchievementsForClubMembers(
      { rpc: async () => ({ data: null, error: { message: "denied" } }) },
      clubId,
      [firstMembershipId],
    ),
    HallOfFameAchievementBadgeError,
  );
});
