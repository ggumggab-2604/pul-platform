import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const roleActionsSource = readFileSync(
  fileURLToPath(
    new URL(
      "../../components/clubs/manage/ClubMemberRoleActions.tsx",
      import.meta.url,
    ),
  ),
  "utf8",
);
const detailPanelSource = readFileSync(
  fileURLToPath(
    new URL(
      "../../components/clubs/manage/ClubMemberDetailPanel.tsx",
      import.meta.url,
    ),
  ),
  "utf8",
);
const statusActionsSource = readFileSync(
  fileURLToPath(
    new URL(
      "../../components/clubs/manage/ClubMemberStatusActions.tsx",
      import.meta.url,
    ),
  ),
  "utf8",
);
const providerSource = readFileSync(
  fileURLToPath(
    new URL(
      "../../components/clubs/manage/ClubMemberManagementProvider.tsx",
      import.meta.url,
    ),
  ),
  "utf8",
);

function sourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

const roleActionResolverBlock = sourceBetween(
  roleActionsSource,
  "function getRoleAction",
  "function getResultMessage",
);
const dialogBlock = sourceBetween(
  roleActionsSource,
  "function ClubMemberRoleConfirmationDialog",
  "export function ClubMemberRoleActions",
);
const roleActionsComponentBlock = sourceBetween(
  roleActionsSource,
  "export function ClubMemberRoleActions",
  "    </section>\n  );\n}",
);
const dialogOpenFocusBlock = sourceBetween(
  dialogBlock,
  "  const cancelOpenFocus = useCallback",
  "  useEffect(() => {\n    if (!displayedError)",
);
const parentFocusBlock = sourceBetween(
  roleActionsComponentBlock,
  "  const cancelRestoreFocus = useCallback",
  "  useEffect(() => {\n    mountedRef.current = true;",
);
const parentLifecycleBlock = sourceBetween(
  roleActionsComponentBlock,
  "  useEffect(() => {\n    mountedRef.current = true;",
  "  if (!roleMutation?.canManageClubRoles)",
);
const closeDialogBlock = sourceBetween(
  dialogBlock,
  "  const closeDialog = useCallback",
  "  const focusInitialDialogTarget = useCallback",
);
const openDialogBlock = sourceBetween(
  roleActionsComponentBlock,
  "  const openDialog = (",
  "  return (",
);
const statusActionsComponentBlock = sourceBetween(
  statusActionsSource,
  "export function ClubMemberStatusActions",
  "    </section>\n  );\n}",
);

test("role actions are rendered only inside the detail panel with membership-scoped props", () => {
  assert.match(detailPanelSource, /import \{ ClubMemberRoleActions \}/);
  assert.match(detailPanelSource, /<ClubMemberRoleActions[\s\S]*?membershipId=\{member\.membershipId\}[\s\S]*?membershipStatus=\{member\.membershipStatus\}[\s\S]*?currentRoles=\{member\.currentRoles\}/);
  assert.doesNotMatch(roleActionsSource, /targetUserId|actorMembershipId|trustedActorMembershipId/);
});

test("role action eligibility fails closed for self, inactive and protected targets", () => {
  assert.match(roleActionResolverBlock, /!input\.canManageClubRoles \|\| input\.isSelfTarget/);
  assert.match(roleActionResolverBlock, /input\.membershipStatus !== "active"/);
  assert.match(roleActionResolverBlock, /hasUnknownRole \|\| hasAdminRole \|\| hasViceAdminRole/);
  assert.match(roleActionResolverBlock, /hasManagerRole\) return "revoke"/);
  assert.match(roleActionResolverBlock, /hasMemberRole\) return "grant"/);
});

test("role action UI delegates only to the Provider role mutation contract", () => {
  assert.match(roleActionsSource, /useClubMemberRoleMutation/);
  assert.match(dialogBlock, /roleMutation\.grantManagerRole\(membershipId, normalizedReason\)/);
  assert.match(dialogBlock, /roleMutation\.revokeManagerRole\(membershipId, normalizedReason\)/);
  assert.doesNotMatch(roleActionsSource, /grant_club_manager_role_by_membership|revoke_club_manager_role_by_membership/);
  assert.doesNotMatch(roleActionsSource, /\.(?:from|insert|update|delete)\(\s*["']/);
  assert.match(providerSource, /grantManagerRole:/);
  assert.match(providerSource, /revokeManagerRole:/);
});

test("confirmation dialog keeps approved reason and accessibility constraints", () => {
  assert.match(dialogBlock, /role="dialog"/);
  assert.match(dialogBlock, /aria-modal="true"/);
  assert.match(dialogBlock, /aria-labelledby=\{titleId\}/);
  assert.match(dialogBlock, /aria-describedby=\{descriptionId\}/);
  assert.match(dialogBlock, /requestAnimationFrame/);
  assert.match(dialogBlock, /event\.key === "Escape"/);
  assert.match(dialogBlock, /event\.key !== "Tab"/);
  assert.match(dialogBlock, /normalizeClubMemberRoleReason\(reason\)/);
  assert.match(dialogBlock, /CLUB_MEMBER_ROLE_REASON_MIN_LENGTH/);
  assert.match(dialogBlock, /CLUB_MEMBER_ROLE_REASON_MAX_LENGTH/);
  assert.match(dialogBlock, /maxLength=\{CLUB_MEMBER_ROLE_REASON_MAX_LENGTH\}/);
  assert.match(dialogBlock, /개인정보나 민감정보를 입력하지 마세요/);
});

test("open and restore focus controllers keep separate frame and generation state", () => {
  assert.match(dialogBlock, /const openFocusFrameRef = useRef<number \| undefined>\(undefined\)/);
  assert.match(dialogBlock, /const openFocusGenerationRef = useRef\(0\)/);
  assert.match(roleActionsComponentBlock, /const restoreFocusFrameRef = useRef<number \| undefined>\(undefined\)/);
  assert.match(roleActionsComponentBlock, /const restoreGenerationRef = useRef\(0\)/);
  assert.doesNotMatch(dialogOpenFocusBlock, /restoreFocusFrameRef|restoreGenerationRef/);
  assert.doesNotMatch(parentFocusBlock, /openFocusFrameRef|openFocusGenerationRef/);
});

test("dialog mount focuses a guarded textarea with a connected dialog fallback", () => {
  assert.match(dialogOpenFocusBlock, /useLayoutEffect\(\(\) => \{/);
  assert.match(dialogOpenFocusBlock, /mountedRef\.current = true/);
  assert.match(dialogOpenFocusBlock, /dialogOpenRef\.current = true/);
  assert.match(dialogOpenFocusBlock, /currentMembershipRef\.current = membershipId/);
  assert.match(dialogOpenFocusBlock, /openFocusGenerationRef\.current !== focusGeneration/);
  assert.match(dialogOpenFocusBlock, /currentMembershipRef\.current !== membershipId/);
  assert.match(dialogOpenFocusBlock, /isUsableFocusTarget\(dialog\)/);
  assert.match(dialogOpenFocusBlock, /dialog\.contains\(activeElement\)/);
  assert.match(dialogOpenFocusBlock, /input && focusWithoutScroll\(input\)/);
  assert.match(dialogOpenFocusBlock, /input\.setSelectionRange/);
  assert.match(dialogOpenFocusBlock, /return focusWithoutScroll\(dialog\)/);
  assert.equal(dialogOpenFocusBlock.match(/window\.requestAnimationFrame/g)?.length, 2);
  assert.doesNotMatch(dialogOpenFocusBlock, /setTimeout|autoFocus/);
});

test("closing cancels open focus before delegating one membership-bound restore", () => {
  const busyIndex = closeDialogBlock.indexOf("if (busy) return");
  const cancelIndex = closeDialogBlock.indexOf("cancelOpenFocus()");
  const closeIndex = closeDialogBlock.indexOf("onClose()");
  const restoreIndex = closeDialogBlock.indexOf("restoreFocus(membershipId)");
  for (const index of [busyIndex, cancelIndex, closeIndex, restoreIndex]) {
    assert.notEqual(index, -1);
  }
  assert.ok(busyIndex < cancelIndex);
  assert.ok(cancelIndex < closeIndex);
  assert.ok(closeIndex < restoreIndex);
  assert.match(dialogOpenFocusBlock, /window\.cancelAnimationFrame\(openFocusFrameRef\.current\)/);
  assert.equal(dialogBlock.match(/restoreFocus\(membershipId\)/g)?.length, 2);
  assert.doesNotMatch(dialogBlock, /returnFocus|setReturnFocus/);
});

test("restore runs after close commit and resolves the latest same-membership target", () => {
  assert.match(parentFocusBlock, /if \(dialogAction !== null\) return/);
  assert.match(parentFocusBlock, /const pendingRestore = pendingRestoreRef\.current/);
  assert.match(parentFocusBlock, /currentMembershipRef\.current !== restoreMembershipId/);
  assert.match(parentFocusBlock, /dialogMembershipRef\.current !== restoreMembershipId/);
  assert.match(parentFocusBlock, /restoreGenerationRef\.current !== generation/);
  assert.match(parentFocusBlock, /const latestTrigger = triggerRef\.current/);
  assert.match(parentFocusBlock, /!latestTrigger\.disabled/);
  assert.match(parentFocusBlock, /focusWithoutScroll\(latestTrigger\)/);
  assert.match(parentFocusBlock, /focusWithoutScroll\(sectionRef\.current\)/);
  assert.match(parentFocusBlock, /restoreFocusFrameRef\.current = window\.requestAnimationFrame/);
  assert.match(roleActionsComponentBlock, /ref=\{sectionRef\}[\s\S]*?tabIndex=\{-1\}/);
  assert.match(roleActionsComponentBlock, /ref=\{triggerRef\}/);
});

test("rapid reopen invalidates pending restore before opening the next dialog", () => {
  const cancelIndex = openDialogBlock.indexOf("cancelRestoreFocus()");
  const pendingIndex = openDialogBlock.indexOf("pendingRestoreRef.current = null");
  const generationIndex = openDialogBlock.indexOf("restoreGenerationRef.current += 1");
  const openIndex = openDialogBlock.indexOf("dialogOpenRef.current = true");
  const membershipIndex = openDialogBlock.indexOf("dialogMembershipRef.current = membershipId");
  const actionIndex = openDialogBlock.indexOf("setDialogAction(nextAction)");
  for (const index of [
    cancelIndex,
    pendingIndex,
    generationIndex,
    openIndex,
    membershipIndex,
    actionIndex,
  ]) {
    assert.notEqual(index, -1);
  }
  assert.ok(cancelIndex < pendingIndex);
  assert.ok(pendingIndex < generationIndex);
  assert.ok(generationIndex < openIndex);
  assert.ok(openIndex < membershipIndex);
  assert.ok(membershipIndex < actionIndex);
});

test("unmount and target changes invalidate both stale restore identity and UI state", () => {
  assert.match(parentLifecycleBlock, /mountedRef\.current = false/);
  assert.match(parentLifecycleBlock, /dialogOpenRef\.current = false/);
  assert.match(parentLifecycleBlock, /dialogMembershipRef\.current = null/);
  assert.match(parentLifecycleBlock, /pendingRestoreRef\.current = null/);
  assert.match(parentLifecycleBlock, /restoreGenerationRef\.current \+= 1/);
  assert.match(parentLifecycleBlock, /cancelRestoreFocus\(\)/);
  assert.match(parentLifecycleBlock, /currentMembershipRef\.current === membershipId/);
  assert.match(parentLifecycleBlock, /currentMembershipRef\.current = membershipId/);
  assert.match(parentLifecycleBlock, /setDialogAction\(null\)/);
  assert.match(dialogOpenFocusBlock, /mountedRef\.current = false/);
  assert.match(dialogOpenFocusBlock, /cancelOpenFocus\(\)/);
});

test("all non-pending close paths share cleanup while safe errors keep the dialog", () => {
  assert.match(closeDialogBlock, /if \(busy\) return/);
  assert.match(dialogBlock, /if \(!busy\) closeDialog\(\)/);
  assert.match(dialogBlock, /event\.target === event\.currentTarget && !busy/);
  assert.match(dialogBlock, /disabled=\{busy\}/);
  assert.match(dialogBlock, /setValidationError\("최신 회원 정보를 다시 확인한 뒤 시도해 주세요\."\)/);
  assert.equal(dialogBlock.match(/cancelOpenFocus\(\)/g)?.length, 3);
  assert.equal(dialogBlock.match(/restoreFocus\(membershipId\)/g)?.length, 2);
});
test("role mutation feedback and recovery stay membership scoped", () => {
  for (const api of [
    "getRoleMutationState(membershipId)",
    "isRoleMutationPending(membershipId)",
    "isMembershipMutationPending(membershipId)",
    "clearRoleMutationFeedback(membershipId)",
    "retryRoleMutationRefresh(membershipId)",
  ]) {
    assert.match(roleActionsComponentBlock, new RegExp(api.replace(/[()]/g, "\\$&")));
  }
  assert.match(roleActionsComponentBlock, /state\?\.hasRefreshRecovery === true/);
  assert.match(roleActionsComponentBlock, /state\?\.refreshRetrying === true/);
  assert.match(roleActionsComponentBlock, /state\?\.refreshWarning/);
  assert.match(roleActionsComponentBlock, /state\?\.safeError/);
  assert.match(roleActionsSource, /result\.replayed/);
  assert.match(roleActionsSource, /result\.outcome === "noop"/);
});

test("status buttons are disabled only by the same membership role operation", () => {
  assert.match(statusActionsSource, /useClubMemberRoleMutation/);
  assert.match(statusActionsComponentBlock, /roleMutation\?\.getRoleMutationState\(member\.membershipId\)/);
  assert.match(statusActionsComponentBlock, /roleMutation\?\.isRoleMutationPending\(member\.membershipId\)/);
  assert.match(statusActionsComponentBlock, /sameMembershipRoleBusy/);
  assert.match(statusActionsComponentBlock, /disabled=\{statusTriggerDisabled\}/);
  assert.match(statusActionsComponentBlock, /이 회원의 역할 변경 또는 최신 정보 갱신이 진행 중입니다/);
  assert.doesNotMatch(statusActionsComponentBlock, /isRoleMutationPending\(\)/);
});

test("role actions do not broaden existing status or provider API files", () => {
  assert.doesNotMatch(roleActionsSource, /useClubMemberManagement\(/);
  assert.doesNotMatch(roleActionsSource, /runStatusMutation|finalizeStatusMutationUi/);
  assert.doesNotMatch(statusActionsSource, /grantManagerRole|revokeManagerRole/);
  assert.doesNotMatch(detailPanelSource, /targetUserId|authenticatedUserId/);
});
