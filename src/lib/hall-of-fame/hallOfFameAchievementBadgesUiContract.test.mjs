import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const component = source("../../components/hall-of-fame/HallOfFameAchievementBadges.tsx");
const memberList = source("../../components/clubs/manage/ClubMemberList.tsx");
const memberDetail = source("../../components/clubs/manage/ClubMemberDetailPanel.tsx");
const memberClient = source("../clubs/clubMemberManagement.ts");

test("common achievement component is connected to member list and detail name surfaces", () => {
  assert.match(memberList, /HallOfFameAchievementBadges/);
  assert.match(memberList, /achievements=\{item\.achievements\}/);
  assert.match(memberDetail, /HallOfFameAchievementBadges/);
  assert.match(memberDetail, /item\.membershipId === member\.membershipId/);
});

test("achievement presentation is compact, multi-badge aware, and links to the existing HOF", () => {
  assert.match(component, /MAX_VISIBLE_ACHIEVEMENTS = 2/);
  assert.match(component, /hiddenCount/);
  assert.match(component, /href="\/hall-of-fame"/);
  assert.match(component, /Trophy/);
  assert.match(component, /sourceCount/);
  assert.doesNotMatch(component, /roleKey|club_manager|club_admin/);
});

test("role pills remain separate from amber HOF achievements", () => {
  assert.match(memberList, /function MemberRoles/);
  assert.match(memberList, /border-pul-point\/25 bg-pul-light/);
  assert.match(component, /border-amber-300 bg-amber-50/);
  assert.doesNotMatch(component, /currentRoles|MemberRoles/);
});

test("achievement link has visible text, full accessible name, keyboard focus, and mobile wrapping", () => {
  assert.match(component, /aria-label=\{fullLabel\}/);
  assert.match(component, /title=\{fullLabel\}/);
  assert.match(component, /명예의 전당 성취:/);
  assert.match(component, /focus-visible:ring-2/);
  assert.match(component, /min-h-10/);
  assert.match(component, /max-w-full/);
  assert.match(component, /flex-wrap/);
});

test("member page performs one page read and one bulk achievement read, never raw HOF access", () => {
  assert.match(memberClient, /listClubMembersForManagement/);
  assert.match(memberClient, /listHallOfFamePublicAchievementsForClubMembers/);
  assert.match(memberClient, /response\.items\.map\(\(\{ membershipId \}\) => membershipId\)/);
  assert.doesNotMatch(memberClient, /for[\s\S]{0,120}listHallOfFamePublicAchievementsForClubMembers/);
  assert.doesNotMatch(memberClient, /\.from\(["']hall_of_fame_/);
});

test("technical identities are used for matching but are not added to visible labels", () => {
  assert.match(memberDetail, /membershipId === member\.membershipId/);
  assert.doesNotMatch(component + memberList + memberDetail, />\s*(UUID|membership_id|user_id)\s*</i);
  assert.doesNotMatch(component, /displayName/);
});
