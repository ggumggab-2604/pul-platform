import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const resolverSource = readFileSync(
  fileURLToPath(new URL("./resolveClubMemberManagement.ts", import.meta.url)),
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
const pageSource = readFileSync(
  fileURLToPath(
    new URL(
      "../../app/clubs/[id]/manage/members/page.tsx",
      import.meta.url,
    ),
  ),
  "utf8",
);
const operationStateSource = readFileSync(
  fileURLToPath(new URL("./clubMemberMutationOperationState.ts", import.meta.url)),
  "utf8",
);
const managerRoleMutationMigrationSource = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260722000100_pul_club_manager_role_mutations.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);
const membershipRoleContractMigrationSource = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260805000100_pul_club_manager_role_mutation_by_membership_contract.sql",
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

const roleMutationBlock = sourceBetween(
  providerSource,
  "const runRoleMutation = useCallback",
  "const grantManagerRole = useCallback",
);
const roleRefreshBlock = sourceBetween(
  providerSource,
  "const retryRoleMutationRefresh = useCallback",
  "const runRoleMutation = useCallback",
);
const statusMutationBlock = sourceBetween(
  providerSource,
  "const runStatusMutation = useCallback",
  "const roleCapabilityAvailable =",
);
const operationGateBlock = sourceBetween(
  providerSource,
  "const commitMembershipMutationState = useCallback",
  "const cancelPendingStatusFocus = useCallback",
);
const roleFeedbackClearBlock = sourceBetween(
  providerSource,
  "const clearRoleMutationFeedbackForId = useCallback",
  "const scheduleStatusManagementFocus = useCallback",
);
const sensitiveStateBlock = sourceBetween(
  providerSource,
  "const clearSensitiveState = useCallback",
  "const applyBrowserSessionVerification = useCallback",
);
const loadFirstPageBlock = sourceBetween(
  providerSource,
  "const loadFirstPage = useCallback",
  "  useEffect(() => {",
);

test("resolver adds club.roles.manage without weakening existing capabilities", () => {
  assert.match(resolverSource, /p_permission_code: "club\.members\.read"/);
  assert.match(resolverSource, /p_permission_code: "club\.members\.manage"/);
  assert.match(resolverSource, /p_permission_code: "club\.roles\.manage"/);
  assert.match(resolverSource, /Promise\.allSettled/);
});

test("role capability stays fail-closed on every resolver exit", () => {
  const falseReturns = resolverSource.match(/canManageClubRoles: false/g) ?? [];
  assert.equal(falseReturns.length, 4);
  const nullActorReturns = resolverSource.match(/actorMembershipId: null/g) ?? [];
  assert.equal(nullActorReturns.length, 4);
  assert.match(
    resolverSource,
    /rolePermissionResult\.status === "fulfilled"[\s\S]*?rolePermission\?\.data === true[\s\S]*?actorMembershipId !== null[\s\S]*?: false/,
  );
  assert.match(
    resolverSource,
    /actorMembershipId: canManageClubRoles \? actorMembershipId : null/,
  );
});

test("server page passes only resolved boolean capabilities", () => {
  assert.match(pageSource, /canManageClubRoles=\{management\.canManageClubRoles\}/);
  assert.match(
    pageSource,
    /canManageMembershipStatus=\{management\.canManageMembershipStatus\}/,
  );
  assert.match(
    pageSource,
    /const actorMembershipId = management\.canManageClubRoles[\s\S]*?\? management\.actorMembershipId[\s\S]*?: null/,
  );
  assert.match(pageSource, /actorMembershipId=\{actorMembershipId\}/);
  assert.match(
    pageSource,
    /key=\{`\$\{management\.authenticatedUserId\}:\$\{management\.clubUuid\}:\$\{actorMembershipId \?\? "unavailable"\}`\}/,
  );
  assert.doesNotMatch(pageSource, /ClubMemberRoleActions/);
});

test("Provider delegates to the approved role client without direct RPC or DML", () => {
  for (const identifier of [
    "mutateClubMemberRole",
    "normalizeClubMemberRoleReason",
    "resolveClubMemberRoleRequestSlot",
    "toClubMemberRoleMutationError",
  ]) {
    assert.match(providerSource, new RegExp(`\\b${identifier}\\b`));
  }
  assert.doesNotMatch(providerSource, /grant_club_manager_role_by_membership/);
  assert.doesNotMatch(providerSource, /revoke_club_manager_role_by_membership/);
  assert.doesNotMatch(providerSource, /target_user_id|targetUserId/);
  assert.doesNotMatch(providerSource, /\.(?:from|insert|update|delete)\(\s*["']/);
});

test("Provider uses the production membership operation-state helper", () => {
  assert.match(
    providerSource,
    /from "@\/lib\/clubs\/clubMemberMutationOperationState"/,
  );
  for (const identifier of [
    "claimClubMemberMutation",
    "claimClubMemberRoleOperation",
    "releaseClubMemberMutation",
    "rebaseClubMemberRoleRefreshRecoveryForQuery",
    "recordClubMemberRoleRefreshRetryProgress",
    "setClubMemberRoleRefreshRecovery",
    "beginClubMemberRoleRefreshRetry",
  ]) {
    assert.match(providerSource, new RegExp(`\\b${identifier}\\b`));
    assert.match(operationStateSource, new RegExp(`export function ${identifier}\\b`));
  }
});

test("role context exposes only membership-scoped safe UI state", () => {
  const contextType = sourceBetween(
    providerSource,
    "type ClubMemberRoleMutationContextValue",
    "const ClubMemberManagementReadContext",
  );
  for (const api of [
    "getRoleMutationState",
    "isRoleMutationPending",
    "isMembershipMutationPending",
    "clearRoleMutationFeedback",
    "retryRoleMutationRefresh",
    "isSelfTarget",
  ]) {
    assert.match(contextType, new RegExp(`\\b${api}\\b`));
  }
  assert.doesNotMatch(
    contextType,
    /roleMutationResult\?|roleMutationError\?|roleRefreshWarning\?|requestId|fingerprint|targetUserId|actorMembershipId|trustedActorMembershipId/,
  );
});

test("status and role claims use one atomic membership-keyed production gate", () => {
  assert.match(operationGateBlock, /claimClubMemberMutation/);
  assert.match(operationGateBlock, /claimClubMemberRoleOperation/);
  assert.match(operationGateBlock, /membershipMutationStateRef\.current/);
  assert.match(operationGateBlock, /releaseClubMemberMutation/);
  assert.match(roleMutationBlock, /claimRoleMembershipMutation/);
  assert.match(statusMutationBlock, /claimStatusMembershipMutation/);
  assert.match(roleMutationBlock, /ownsClubMemberMutationClaim/);
  assert.match(statusMutationBlock, /ownsClubMemberMutationClaim/);
});

test("role request slots remain independent and feedback clear does not reset them", () => {
  assert.match(
    providerSource,
    /useRef<Map<string, ClubMemberRoleRequestSlot>>\(new Map\(\)\)/,
  );
  assert.match(
    roleMutationBlock,
    /roleMutationRequestSlots\.current\.get\(membershipId\)[\s\S]*?roleMutationRequestSlots\.current\.set\(membershipId, requestSlot\)/,
  );
  assert.doesNotMatch(roleFeedbackClearBlock, /roleMutationGeneration|roleMutationRequestSlots/);
  assert.match(sensitiveStateBlock, /roleMutationRequestSlots\.current\.clear\(\)/);
});

test("feedback clear is membership-scoped and preserves a pending claim", () => {
  assert.match(roleFeedbackClearBlock, /membershipId: string/);
  assert.match(roleFeedbackClearBlock, /clearClubMemberRoleMutationFeedback/);
  assert.match(roleFeedbackClearBlock, /membershipMutationStateRef\.current/);
  assert.doesNotMatch(roleFeedbackClearBlock, /\.clear\(\)|Generation\.current \+= 1/);
  assert.match(
    operationStateSource,
    /if \(current\.pending\)[\s\S]*?pending: true[\s\S]*?operationClaim: current\.operationClaim/,
  );
});

test("same-membership status and role recovery participate in eligibility", () => {
  assert.match(roleMutationBlock, /blockedByStatusRecovery/);
  assert.match(roleMutationBlock, /blockedByRoleRecovery/);
  assert.match(
    statusMutationBlock,
    /statusRefreshRecovery\.current\?\.membershipId === membershipId/,
  );
  assert.match(statusMutationBlock, /hasClubMemberRoleRefreshRecovery/);
  assert.match(
    operationStateSource,
    /options\.hasExternalRefreshRecovery === true[\s\S]*?hasClubMemberRoleRefreshRecovery/,
  );
});

test("status finally always releases its own claim before generation-scoped UI cleanup", () => {
  const finallyIndex = statusMutationBlock.lastIndexOf("finally {");
  const releaseIndex = statusMutationBlock.indexOf(
    "releaseMembershipMutation(membershipId, claim)",
    finallyIndex,
  );
  const generationIndex = statusMutationBlock.indexOf(
    "generation === mutationGeneration.current",
    finallyIndex,
  );
  assert.ok(finallyIndex >= 0 && releaseIndex > finallyIndex);
  assert.ok(generationIndex > releaseIndex);
});

test("role action fails closed before the approved mutation client", () => {
  const capabilityCheck = roleMutationBlock.indexOf("capabilityAvailable");
  const targetCheck = roleMutationBlock.indexOf("targetIsCurrent");
  const recoveryCheck = roleMutationBlock.indexOf("blockedByStatusRecovery");
  const clientCall = roleMutationBlock.indexOf("await mutateClubMemberRole");
  assert.ok(capabilityCheck >= 0 && capabilityCheck < clientCall);
  assert.ok(targetCheck >= 0 && targetCheck < clientCall);
  assert.ok(recoveryCheck >= 0 && recoveryCheck < clientCall);
  assert.match(roleMutationBlock, /historyScope === "limited_history"/);
  assert.match(roleMutationBlock, /membershipStatus === "active"/);
});

test("role mutation refreshes the existing list and selected detail only", () => {
  assert.match(roleMutationBlock, /refreshClubMembershipStatusView/);
  assert.match(roleMutationBlock, /refreshList: \(\) => loadFirstPage/);
  assert.match(roleMutationBlock, /deriveFilterPresenceFromTarget: true/);
  assert.match(roleMutationBlock, /restoreLoadedItemCount: items\.length/);
  assert.match(
    roleMutationBlock,
    /selectedMembershipIdRef\.current === membershipId[\s\S]*?loadDetail\(membershipId[\s\S]*?: Promise\.resolve\("success"\)/,
  );
});

test("role refresh retry reloads data only and never repeats mutation", () => {
  assert.match(roleRefreshBlock, /membershipId: string/);
  assert.match(roleRefreshBlock, /beginClubMemberRoleRefreshRetry/);
  assert.match(roleRefreshBlock, /refreshClubMembershipStatusView/);
  assert.match(roleRefreshBlock, /loadFirstPage/);
  assert.match(roleRefreshBlock, /loadDetail/);
  assert.match(roleRefreshBlock, /completeClubMemberRoleRefreshRetry/);
  assert.doesNotMatch(roleRefreshBlock, /mutateClubMemberRole|requestId|resolveClubMemberRoleRequestSlot/);
  assert.match(roleRefreshBlock, /recovery\.listRefreshed/);
  assert.match(roleRefreshBlock, /recovery\.detailRefreshed/);
});

test("session and unmount reset all operation state while ordinary clear cannot", () => {
  assert.match(sensitiveStateBlock, /roleMutationGeneration\.current \+= 1/);
  assert.match(sensitiveStateBlock, /roleMutationRequestSlots\.current\.clear\(\)/);
  assert.match(sensitiveStateBlock, /resetMembershipMutationState\(\)/);
  assert.match(
    providerSource,
    /mounted\.current = false[\s\S]*?roleRequestSlots\.clear\(\)[\s\S]*?membershipMutationStateRef\.current = createClubMemberMutationOperationState\(\)/,
  );
});

test("list refresh keeps role-filter, pagination, and selection synchronization", () => {
  assert.match(loadFirstPageBlock, /deriveFilterPresenceFromTarget = false/);
  assert.match(loadFirstPageBlock, /const targetPresent = Boolean\(/);
  assert.match(loadFirstPageBlock, /restoreLoadedItemCount/);
  assert.match(loadFirstPageBlock, /selectedFilteredOut/);
  assert.match(loadFirstPageBlock, /deferSelectionClear/);
});

test("browser identity remains fail-closed and existing status context stays connected", () => {
  assert.match(
    providerSource,
    /const roleCapabilityAvailable =[\s\S]*?canManageClubRoles === true[\s\S]*?sessionVerification\.status === "matched"[\s\S]*?sessionVerification\.generation === currentSessionGeneration/,
  );
  assert.match(providerSource, /shouldProvideClubMemberStatusMutationContext/);
  assert.match(statusMutationBlock, /runClubMembershipStatusMutationLifecycle/);
  assert.match(providerSource, /ClubMemberStatusMutationContext\.Provider value=\{mutationValue\}/);
});
test("role refresh retry records monotonic partial progress before returning", () => {
  assert.match(
    roleRefreshBlock,
    /let candidateRecovery =[\s\S]*?const started = beginClubMemberRoleRefreshRetry[\s\S]*?const startedRecovery = started\.recovery;[\s\S]*?if \(!startedRecovery\) return;[\s\S]*?let recovery = startedRecovery/,
  );
  assert.match(
    roleRefreshBlock,
    /if \(refreshResult\.status === "refresh_failed"\) \{[\s\S]*?recordClubMemberRoleRefreshRetryProgress\([\s\S]*?commitMembershipMutationState\(recorded\.state\)[\s\S]*?if \(!recorded\.recovery\) return;[\s\S]*?recovery = recorded\.recovery;[\s\S]*?return;/,
  );
  assert.match(
    operationStateSource,
    /export function recordClubMemberRoleRefreshRetryProgress[\s\S]*?current\?\.refreshRecovery !== recovery[\s\S]*?!current\.refreshRetrying/,
  );
  assert.match(
    operationStateSource,
    /listRefreshed: recovery\.listRefreshed \|\| progress\.listRefreshed[\s\S]*?detailRefreshed: recovery\.detailRefreshed \|\| progress\.detailRefreshed[\s\S]*?filteredOut: recovery\.filteredOut \|\| progress\.filteredOut/,
  );
  assert.match(
    roleRefreshBlock,
    /finishClubMemberRoleRefreshRetry\([\s\S]*?membershipId,[\s\S]*?recovery/,
  );
});

test("partial progress transition stays membership-scoped and mutation-free", () => {
  const progressBlock = sourceBetween(
    operationStateSource,
    "export function recordClubMemberRoleRefreshRetryProgress",
    "export function beginClubMemberRoleRefreshRetry",
  );
  assert.match(progressBlock, /state\.roleOperations\.get\(membershipId\)/);
  assert.match(progressBlock, /withRoleOperation\(state, membershipId/);
  assert.doesNotMatch(
    progressBlock,
    /mutateClubMemberRole|mutateClubMembershipStatus|requestId|reason|targetUserId|\.rpc\(/,
  );
  assert.match(roleRefreshBlock, /recovery\.listRefreshed/);
  assert.match(roleRefreshBlock, /recovery\.detailRefreshed/);
  assert.doesNotMatch(
    roleRefreshBlock,
    /mutateClubMemberRole|mutateClubMembershipStatus|resolveClubMemberRoleRequestSlot/,
  );
});
test("role refresh retry rebases stale query progress before claiming ownership", () => {
  const queryCapture = roleRefreshBlock.indexOf(
    "const currentQueryGeneration = queryGeneration.current",
  );
  const mismatchCheck = roleRefreshBlock.indexOf(
    "candidateRecovery.queryGeneration !== currentQueryGeneration",
  );
  const rebaseCall = roleRefreshBlock.indexOf(
    "rebaseClubMemberRoleRefreshRecoveryForQuery",
  );
  const rebaseCommit = roleRefreshBlock.indexOf(
    "commitMembershipMutationState(rebased.state)",
  );
  const localIdentityUpdate = roleRefreshBlock.indexOf(
    "candidateRecovery = rebased.recovery",
  );
  const beginRetry = roleRefreshBlock.indexOf(
    "beginClubMemberRoleRefreshRetry",
  );

  assert.ok(queryCapture >= 0 && queryCapture < mismatchCheck);
  assert.ok(mismatchCheck < rebaseCall);
  assert.ok(rebaseCall < rebaseCommit);
  assert.ok(rebaseCommit < localIdentityUpdate);
  assert.ok(localIdentityUpdate < beginRetry);
  assert.match(
    roleRefreshBlock,
    /queryGeneration: currentQueryGeneration[\s\S]*?loadedItemCount: items\.length[\s\S]*?detailRequired:[\s\S]*?selectedMembershipIdRef\.current === membershipId/,
  );
});

test("query rebase resets query-bound progress and preserves operation feedback", () => {
  const rebaseBlock = sourceBetween(
    operationStateSource,
    "export function rebaseClubMemberRoleRefreshRecoveryForQuery",
    "export function recordClubMemberRoleRefreshRetryProgress",
  );

  assert.match(rebaseBlock, /current\?\.refreshRecovery !== recovery/);
  assert.match(rebaseBlock, /current\.pending \|\|[\s\S]*?current\.refreshRetrying/);
  assert.match(
    rebaseBlock,
    /recovery\.queryGeneration === input\.queryGeneration[\s\S]*?return \{ state, recovery \}/,
  );
  assert.match(rebaseBlock, /queryGeneration: input\.queryGeneration/);
  assert.match(rebaseBlock, /loadedItemCount: input\.loadedItemCount/);
  assert.match(rebaseBlock, /listRefreshed: false/);
  assert.match(rebaseBlock, /detailRefreshed: !input\.detailRequired/);
  assert.match(rebaseBlock, /filteredOut: false/);
  assert.match(rebaseBlock, /withRoleOperation\(state, membershipId/);
  assert.doesNotMatch(
    rebaseBlock,
    /result:|refreshWarning:|requestId|reason|targetUserId|mutate|\.rpc\(/,
  );
});

test("role retry rejects a query change in flight and retains refresh-only behavior", () => {
  assert.match(
    roleRefreshBlock,
    /const requestQueryGeneration = recovery\.queryGeneration/,
  );
  assert.match(
    roleRefreshBlock,
    /requestQueryGeneration === queryGeneration\.current/,
  );
  assert.match(
    roleRefreshBlock,
    /refreshRecovery === recovery/,
  );
  assert.match(
    roleRefreshBlock,
    /refreshList: \(\) => recovery\.listRefreshed[\s\S]*?: loadFirstPage\(/,
  );
  assert.match(
    roleRefreshBlock,
    /refreshDetail: \(\) =>[\s\S]*?recovery\.detailRefreshed/,
  );
  assert.match(
    roleRefreshBlock,
    /finally \{[\s\S]*?finishClubMemberRoleRefreshRetry\(/,
  );
  assert.doesNotMatch(
    roleRefreshBlock,
    /mutateClubMemberRole|mutateClubMembershipStatus|resolveClubMemberRoleRequestSlot|requestId/,
  );
  assert.match(
    providerSource,
    /const beginQueryTransition = useCallback\([\s\S]*?requestGeneration\.current \+= 1;[\s\S]*?queryGeneration\.current \+= 1;/,
  );
});

test("resolver loads the actor active membership through the authenticated RLS client in parallel", () => {
  const parallelMatch = resolverSource.match(
    /const \[[\s\S]*?actorMembershipResult,[\s\S]*?Promise\.allSettled\(\[([\s\S]*?)\]\);/,
  );
  assert.ok(parallelMatch, "missing four-way permission and membership parallel load");
  const parallelBlock = parallelMatch[0];
  for (const permission of [
    "club.members.read",
    "club.members.manage",
    "club.roles.manage",
  ]) {
    assert.match(parallelBlock, new RegExp(permission.replaceAll(".", "\\.")));
  }
  assert.match(
    parallelBlock,
    /context\.supabase[\s\S]*?\.from\("club_memberships"\)[\s\S]*?\.select\("id"\)[\s\S]*?\.eq\("club_id", club\.clubUuid\)[\s\S]*?\.eq\("user_id", context\.userId\)[\s\S]*?\.eq\("membership_status", "active"\)[\s\S]*?\.maybeSingle\(\)/,
  );
  assert.doesNotMatch(
    parallelBlock,
    /user_profiles|user_accounts|display_name|email|role_code|target_user/,
  );
});

test("resolver strictly parses only a canonical single-field membership row and isolates failures to role capability", () => {
  const parserBlock = sourceBetween(
    resolverSource,
    "function parseActorMembershipId",
    "async function resolveClubUuid",
  );
  assert.match(parserBlock, /typeof value !== "object"/);
  assert.match(parserBlock, /Array\.isArray\(value\)/);
  assert.match(parserBlock, /prototype !== Object\.prototype && prototype !== null/);
  assert.match(parserBlock, /const ownKeys = Reflect\.ownKeys\(record\)/);
  assert.match(parserBlock, /ownKeys\.length !== 1 \|\| ownKeys\[0\] !== "id"/);
  assert.match(parserBlock, /Object\.getOwnPropertyDescriptor\(record, "id"\)/);
  assert.match(parserBlock, /"value" in idDescriptor/);
  assert.match(parserBlock, /idDescriptor\.enumerable !== true/);
  assert.match(parserBlock, /canonicalUuidPattern\.test\(id\)/);
  assert.match(
    resolverSource,
    /actorMembershipResult\.status === "fulfilled"[\s\S]*?!actorMembership\?\.error[\s\S]*?parseActorMembershipId\(actorMembership\?\.data\)/,
  );
  assert.match(
    resolverSource,
    /canRead: readPermission\.data,[\s\S]*?canManageMembershipStatus: managePermission\.data,[\s\S]*?canManageClubRoles/,
  );
});

test("Provider trusts actor membership only behind server capability and keeps it out of public context", () => {
  assert.match(
    providerSource,
    /actorMembershipId\?: string \| null[\s\S]*?actorMembershipId = null/,
  );
  assert.match(
    providerSource,
    /const trustedActorMembershipId = canManageClubRoles[\s\S]*?parseCanonicalMembershipId\(actorMembershipId\)[\s\S]*?: null/,
  );
  assert.match(
    providerSource,
    /const identityKey = `\$\{authenticatedUserId\}:\$\{clubUuid\}:\$\{trustedActorMembershipId \?\? "unavailable"\}`/,
  );
  const contextType = sourceBetween(
    providerSource,
    "type ClubMemberRoleMutationContextValue",
    "const ClubMemberManagementReadContext",
  );
  assert.match(contextType, /isSelfTarget: \(membershipId: string\) => boolean/);
  assert.doesNotMatch(contextType, /actorMembershipId|trustedActorMembershipId/);
});

test("self-target predicate is canonical, capability-bound, and boolean-only", () => {
  const canonicalUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const actorId = "11111111-1111-4111-8111-111111111111";
  const otherId = "22222222-2222-4222-8222-222222222222";
  const evaluate = ({ capability, sessionMatched, actor, target }) =>
    capability === true &&
    sessionMatched === true &&
    typeof actor === "string" &&
    canonicalUuid.test(actor) &&
    typeof target === "string" &&
    canonicalUuid.test(target) &&
    target === actor;

  assert.equal(
    evaluate({ capability: true, sessionMatched: true, actor: actorId, target: actorId }),
    true,
  );
  assert.equal(
    evaluate({ capability: true, sessionMatched: true, actor: actorId, target: otherId }),
    false,
  );
  for (const input of [
    { capability: true, sessionMatched: true, actor: actorId, target: "bad-id" },
    { capability: false, sessionMatched: true, actor: actorId, target: actorId },
    { capability: true, sessionMatched: false, actor: actorId, target: actorId },
    { capability: true, sessionMatched: true, actor: null, target: actorId },
  ]) {
    assert.equal(evaluate(input), false);
  }

  const predicateBlock = sourceBetween(
    providerSource,
    "const isSelfTarget = useCallback",
    "const readValue = useMemo",
  );
  assert.match(predicateBlock, /roleCapabilityAvailable/);
  assert.match(predicateBlock, /parseCanonicalMembershipId\(membershipId\)/);
  assert.match(predicateBlock, /=== trustedActorMembershipId/);
  assert.doesNotMatch(predicateBlock, /return \{|actorMembershipId:/);
});

test("effective role capability requires server permission, actor identity, and the current browser generation", () => {
  const capabilityBlock = sourceBetween(
    providerSource,
    "const roleCapabilityAvailable =",
    "const isSelfTarget = useCallback",
  );
  assert.match(capabilityBlock, /canManageClubRoles === true/);
  assert.match(capabilityBlock, /trustedActorMembershipId !== null/);
  assert.match(capabilityBlock, /sessionVerification\.status === "matched"/);
  assert.match(
    capabilityBlock,
    /sessionVerification\.generation === currentSessionGeneration/,
  );
});

test("self role mutation is rejected before reason, claim, request slot, or client execution", () => {
  const identityCheck = roleMutationBlock.indexOf(
    "canonicalTargetMembershipId === trustedActorMembershipId",
  );
  const safeError = roleMutationBlock.indexOf(
    "\\uc774 \\ud68c\\uc6d0\\uc758 \\uc5ed\\ud560\\uc740 \\uc774 \\ud654\\uba74\\uc5d0\\uc11c \\ubcc0\\uacbd\\ud560 \\uc218 \\uc5c6\\uc2b5\\ub2c8\\ub2e4.",
  );
  const reason = roleMutationBlock.indexOf("normalizeClubMemberRoleReason");
  const claim = roleMutationBlock.indexOf("createClubMemberMutationClaim");
  const requestSlot = roleMutationBlock.indexOf("resolveClubMemberRoleRequestSlot");
  const client = roleMutationBlock.indexOf("await mutateClubMemberRole");
  assert.ok(identityCheck >= 0 && identityCheck < safeError);
  assert.ok(safeError < reason && reason < claim && claim < requestSlot);
  assert.ok(requestSlot < client);
  const selfBlock = roleMutationBlock.slice(
    identityCheck,
    roleMutationBlock.indexOf("const currentDetail", identityCheck),
  );
  assert.match(selfBlock, /setRolePreflightError/);
  assert.match(selfBlock, /return \{ status: "mutation_failed", error \}/);
  assert.doesNotMatch(
    selfBlock,
    /requestId|resolveClubMemberRoleRequestSlot|createClubMemberMutationClaim|claimRoleMembershipMutation|mutateClubMemberRole/,
  );
});

test("self-target protection does not infer identity from target profile fields and preserves the DB guard", () => {
  const selfPreflight = roleMutationBlock.slice(
    roleMutationBlock.indexOf("const serverCapabilityAvailable"),
    roleMutationBlock.indexOf("const currentDetail"),
  );
  assert.doesNotMatch(
    selfPreflight,
    /targetUser|target_user|displayName|display_name|email|roleCode|role_code|profile/,
  );
  assert.match(
    managerRoleMutationMigrationSource,
    /if p_target_user_id = v_actor_id then[\s\S]*?raise exception '\ubcf8\uc778\uc758 \uc6b4\uc601\uc9c4 \uc5ed\ud560\uc744 \ubcc0\uacbd\ud560 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4\.'/,
  );
  assert.match(
    membershipRoleContractMigrationSource,
    /from public\.grant_club_manager_role\([\s\S]*?v_target_user_id,[\s\S]*?p_request_id,[\s\S]*?p_reason/,
  );
  assert.match(
    membershipRoleContractMigrationSource,
    /from public\.revoke_club_manager_role\([\s\S]*?v_target_user_id,[\s\S]*?p_request_id,[\s\S]*?p_reason/,
  );
});
