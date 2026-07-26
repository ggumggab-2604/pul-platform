import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const migrationUrl = new URL(
  "../../../supabase/migrations/20260805000100_pul_club_manager_role_mutation_by_membership_contract.sql",
  import.meta.url,
);
const originalRpcUrl = new URL(
  "../../../supabase/migrations/20260722000100_pul_club_manager_role_mutations.sql",
  import.meta.url,
);
const effectiveEngineUrl = new URL(
  "../../../supabase/migrations/20260724000100_pul_club_vice_admin_foundation.sql",
  import.meta.url,
);
const roleFoundationUrl = new URL(
  "../../../supabase/migrations/20260717000100_pul_club_membership_role_foundation.sql",
  import.meta.url,
);

const migration = readFileSync(fileURLToPath(migrationUrl), "utf8");
const originalRpc = readFileSync(fileURLToPath(originalRpcUrl), "utf8");
const effectiveEngine = readFileSync(fileURLToPath(effectiveEngineUrl), "utf8");
const roleFoundation = readFileSync(fileURLToPath(roleFoundationUrl), "utf8");

const normalizeSql = (sql) => sql.replace(/\s+/g, " ").trim();
const normalizedMigration = normalizeSql(migration);
const normalizedOriginalRpc = normalizeSql(originalRpc);
const normalizedEffectiveEngine = normalizeSql(effectiveEngine);
const normalizedRoleFoundation = normalizeSql(roleFoundation);

const getFunctionBlock = (sql, qualifiedName) => {
  const marker = `create function ${qualifiedName}(`;
  const start = sql.indexOf(marker);
  assert.notEqual(start, -1, `${qualifiedName} must exist`);

  const end = sql.indexOf("\n$$;", start);
  assert.notEqual(end, -1, `${qualifiedName} must have a complete body`);
  return sql.slice(start, end + 4);
};

const grantWrapper = getFunctionBlock(
  migration,
  "public.grant_club_manager_role_by_membership",
);
const revokeWrapper = getFunctionBlock(
  migration,
  "public.revoke_club_manager_role_by_membership",
);
const replayHelper = getFunctionBlock(
  migration,
  "private.resolve_completed_club_manager_role_mutation_replay_target",
);
const wrappers = [grantWrapper, revokeWrapper];

test("defines exactly the approved membership-ID public signatures", () => {
  assert.match(
    normalizedMigration,
    /create function public\.grant_club_manager_role_by_membership\( p_club_id uuid, p_target_membership_id uuid, p_request_id uuid, p_reason text \)/,
  );
  assert.match(
    normalizedMigration,
    /create function public\.revoke_club_manager_role_by_membership\( p_club_id uuid, p_target_membership_id uuid, p_request_id uuid, p_reason text \)/,
  );
  assert.doesNotMatch(
    normalizedMigration,
    /create(?: or replace)? function public\.(grant|revoke)_club_manager_role\(/,
  );
  assert.doesNotMatch(
    normalizedMigration,
    /drop function (?:if exists )?public\.(grant|revoke)_club_manager_role/,
  );
});

test("returns the exact privacy-minimized eleven-column result", () => {
  const resultContract =
    /returns table \( request_id uuid, action_code text, club_id uuid, membership_id uuid, role_code text, role_assignment_id uuid, previous_active boolean, current_active boolean, changed boolean, replayed boolean, outcome text \)/;

  for (const wrapper of wrappers) {
    const normalizedWrapper = normalizeSql(wrapper);
    assert.match(normalizedWrapper, resultContract);
    const returnStart = normalizedWrapper.indexOf("returns table (");
    const languageStart = normalizedWrapper.indexOf("language plpgsql");
    const returnContract = normalizedWrapper.slice(returnStart, languageStart);
    assert.doesNotMatch(returnContract, /target_user_id/);
  }
});

test("uses security-definer functions with an empty search path", () => {
  for (const functionBlock of [...wrappers, replayHelper]) {
    assert.match(
      normalizeSql(functionBlock),
      /language plpgsql volatile security definer set search_path = ''/,
    );
  }
});

test("restricts both public wrappers to authenticated execution", () => {
  for (const functionName of [
    "grant_club_manager_role_by_membership",
    "revoke_club_manager_role_by_membership",
  ]) {
    assert.match(
      normalizedMigration,
      new RegExp(
        `revoke all on function public\\.${functionName}\\( uuid, uuid, uuid, text \\) from public, anon, authenticated, service_role;`,
      ),
    );
    assert.match(
      normalizedMigration,
      new RegExp(
        `grant execute on function public\\.${functionName}\\( uuid, uuid, uuid, text \\) to authenticated;`,
      ),
    );
  }
});

test("keeps the replay helper private", () => {
  assert.match(
    normalizedMigration,
    /revoke all on function private\.resolve_completed_club_manager_role_mutation_replay_target\( uuid, text, uuid, uuid \) from public, anon, authenticated, service_role;/,
  );
  assert.doesNotMatch(
    normalizedMigration,
    /grant execute on function private\.resolve_completed_club_manager_role_mutation_replay_target/,
  );
});

test("checks completed replay before current permission and membership lookup", () => {
  for (const wrapper of wrappers) {
    const replayIndex = wrapper.indexOf(
      "private.resolve_completed_club_manager_role_mutation_replay_target",
    );
    const permissionIndex = wrapper.indexOf("private.club_user_has_permission");
    const membershipIndex = wrapper.indexOf(
      "from public.club_memberships as membership",
    );

    assert.ok(replayIndex >= 0);
    assert.ok(permissionIndex > replayIndex);
    assert.ok(membershipIndex > permissionIndex);
  }
});

test("binds completed replay to actor, request, action, club, role, and membership", () => {
  const helper = normalizeSql(replayHelper);

  assert.match(
    helper,
    /where ledger\.actor_id = v_actor_id and ledger\.request_id = p_request_id for update/,
  );
  assert.match(helper, /v_ledger_action_code is distinct from p_action_code/);
  assert.match(helper, /v_ledger_club_id is distinct from p_club_id/);
  assert.match(
    helper,
    /v_ledger_role_code is distinct from 'club_manager'/,
  );
  assert.match(
    helper,
    /v_result_data ->> 'membership_id' is distinct from p_target_membership_id::text/,
  );
  assert.match(helper, /where actor_account\.id = v_actor_id for share/);
});

test("validates completed ledger result structure before returning a target", () => {
  const helper = normalizeSql(replayHelper);

  assert.match(helper, /v_ledger_target_user_id is null/);
  assert.match(helper, /v_ledger_outcome not in \('success', 'noop'\)/);
  assert.match(
    helper,
    /pg_catalog\.jsonb_typeof\(v_result_data\) <> 'object'/,
  );
  assert.match(
    helper,
    /v_result_data ->> 'target_user_id' is distinct from v_ledger_target_user_id::text/,
  );
  assert.match(
    helper,
    /v_result_data ->> 'role_code' is distinct from 'club_manager'/,
  );
});

test("delegates each action to the approved user-ID public RPC", () => {
  assert.match(grantWrapper, /from public\.grant_club_manager_role\(/);
  assert.match(revokeWrapper, /from public\.revoke_club_manager_role\(/);
  assert.doesNotMatch(
    `${grantWrapper}\n${revokeWrapper}`,
    /private\.execute_club_manager_role_mutation\(/,
  );
});

test("does not duplicate role, audit, or ledger writes", () => {
  assert.doesNotMatch(
    normalizedMigration,
    /\b(insert into|update|delete from)\s+public\.club_role_assignments/i,
  );
  assert.doesNotMatch(
    normalizedMigration,
    /\b(insert into|update|delete from)\s+public\.audit_logs/i,
  );
  assert.doesNotMatch(
    normalizedMigration,
    /\b(insert into|update|delete from)\s+private\.club_mutation_requests/i,
  );
});

test("checks new-request authorization before resolving membership identity", () => {
  for (const wrapper of wrappers) {
    const permissionIndex = wrapper.indexOf("private.club_user_has_permission");
    const adminViceIndex = wrapper.indexOf(
      "private.club_user_is_active_admin_or_vice_admin",
    );
    const membershipIndex = wrapper.indexOf(
      "from public.club_memberships as membership",
    );

    assert.ok(permissionIndex >= 0);
    assert.ok(adminViceIndex > permissionIndex);
    assert.ok(membershipIndex > adminViceIndex);
    assert.match(
      normalizeSql(wrapper),
      /private\.club_user_has_permission\( v_actor_id, p_club_id, 'club\.roles\.manage' \) or not private\.club_user_is_active_admin_or_vice_admin\( v_actor_id, p_club_id \)/,
    );
  }
});

test("binds new membership lookup to the requested club without status prechecks", () => {
  for (const wrapper of wrappers) {
    const normalizedWrapper = normalizeSql(wrapper);
    assert.match(
      normalizedWrapper,
      /from public\.club_memberships as membership where membership\.id = p_target_membership_id and membership\.club_id = p_club_id/,
    );
    assert.doesNotMatch(
      normalizedWrapper,
      /membership\.membership_status\s*=\s*'active'/,
    );
  }
});

test("uses one non-enumerating error for unauthorized or unresolved new targets", () => {
  for (const wrapper of wrappers) {
    const matches = wrapper.match(
      /대상 동호회 회원 관계를 찾을 수 없거나 역할 관리 권한이 없습니다\./gu,
    );
    assert.equal(matches?.length, 2);
  }
});

test("validates delegated results against request, action, club, user, membership, and role", () => {
  for (const [wrapper, action] of [
    [grantWrapper, "role.grant_manager"],
    [revokeWrapper, "role.revoke_manager"],
  ]) {
    assert.match(wrapper, /v_result\.request_id is distinct from p_request_id/);
    assert.match(
      wrapper,
      new RegExp(
        `v_result\\.action_code is distinct from '${action.replace(".", "\\.")}'`,
      ),
    );
    assert.match(wrapper, /v_result\.club_id is distinct from p_club_id/);
    assert.match(wrapper, /v_result\.target_user_id is distinct from/);
    assert.match(
      wrapper,
      /v_result\.membership_id is distinct from p_target_membership_id/,
    );
    assert.match(
      wrapper,
      /v_result\.role_code is distinct from 'club_manager'/,
    );
  }
});

test("requires replay delegation to return replayed true", () => {
  for (const wrapper of wrappers) {
    const replayBranchEnd = wrapper.indexOf(
      "if not private.club_user_has_permission",
    );
    const replayBranch = wrapper.slice(0, replayBranchEnd);
    assert.match(
      replayBranch,
      /v_result\.replayed is distinct from true/,
    );
  }
});

test("preserves the original action codes", () => {
  assert.match(grantWrapper, /'role\.grant_manager'/);
  assert.match(revokeWrapper, /'role\.revoke_manager'/);
  assert.doesNotMatch(
    normalizedMigration,
    /role\.(grant|revoke)_manager_by_membership/,
  );
});

test("preserves the approved reason and fingerprint contract", () => {
  assert.match(
    normalizedEffectiveEngine,
    /v_reason := pg_catalog\.btrim\(p_reason\)/,
  );
  assert.match(
    normalizedEffectiveEngine,
    /pg_catalog\.char_length\(v_reason\) < 2 or pg_catalog\.char_length\(v_reason\) > 500/,
  );
  assert.match(
    normalizedEffectiveEngine,
    /'action_code', p_action_code, 'club_id', p_club_id, 'target_user_id', p_target_user_id, 'role_code', 'club_manager', 'reason', v_reason/,
  );
});

test("preserves completed replay and conflicting-request behavior", () => {
  assert.match(
    normalizedEffectiveEngine,
    /where ledger\.actor_id = v_actor_id and ledger\.request_id = p_request_id for update/,
  );
  assert.match(
    normalizedEffectiveEngine,
    /if v_completed_at is not null then return query/,
  );
  assert.match(
    normalizedEffectiveEngine,
    /같은 요청 식별자를 다른 입력에 재사용할 수 없습니다\./u,
  );
  assert.match(
    normalizeSql(replayHelper),
    /if not found or v_completed_at is null then return; end if;/,
  );
});

test("preserves active actor, permission, and admin-or-vice checks", () => {
  assert.match(
    normalizedEffectiveEngine,
    /where actor_account\.id = v_actor_id for share/,
  );
  assert.match(
    normalizedEffectiveEngine,
    /private\.club_user_has_permission\( v_actor_id, p_club_id, 'club\.roles\.manage' \)/,
  );
  assert.match(
    normalizedEffectiveEngine,
    /private\.club_user_is_active_admin_or_vice_admin\( v_actor_id, p_club_id \)/,
  );
});

test("preserves self, administrator, and vice-administrator target protection", () => {
  assert.match(
    normalizedEffectiveEngine,
    /if p_target_user_id = v_actor_id then raise exception '본인의 운영진 역할을 변경할 수 없습니다\.'/,
  );
  assert.match(
    normalizedEffectiveEngine,
    /private\.club_membership_has_unrevoked_admin_assignment\(v_membership_id\)/,
  );
  assert.match(
    normalizedEffectiveEngine,
    /private\.club_membership_has_unrevoked_vice_admin_assignment\(v_membership_id\)/,
  );
});

test("preserves active target account and active membership requirements", () => {
  assert.match(
    normalizedEffectiveEngine,
    /if v_target_account_status <> 'active' then/,
  );
  assert.match(
    normalizedEffectiveEngine,
    /if v_membership_status <> 'active' then/,
  );
});

test("preserves grant and revoke noop behavior", () => {
  assert.match(
    normalizedEffectiveEngine,
    /if p_action_code = 'role\.grant_manager' then if v_manager_assignment_id is null then insert into public\.club_role_assignments/,
  );
  assert.match(
    normalizedEffectiveEngine,
    /else if v_manager_assignment_id is not null then update public\.club_role_assignments as assignment set revoked_at = pg_catalog\.now\(\), revoked_by = v_actor_id/,
  );
  assert.match(
    normalizedEffectiveEngine,
    /v_outcome := case when v_changed then 'success' else 'noop' end/,
  );
});

test("preserves club_member while revoking only club_manager", () => {
  assert.match(
    normalizedEffectiveEngine,
    /and assignment\.role_code = 'club_manager' and assignment\.revoked_at is null returning assignment\.id into v_role_assignment_id/,
  );
  assert.doesNotMatch(
    normalizedEffectiveEngine,
    /delete from public\.club_role_assignments/,
  );
});

test("preserves the active manager uniqueness contract without new limits", () => {
  assert.match(
    normalizedRoleFoundation,
    /create unique index club_role_assignments_active_unique_idx on public\.club_role_assignments \(membership_id, role_code\) where revoked_at is null/,
  );
  assert.doesNotMatch(
    normalizedMigration,
    /\b(create|alter|drop)\s+(unique\s+)?(index|table|trigger|constraint)\b/i,
  );
});

test("preserves single audit and ledger completion in the approved engine", () => {
  assert.match(normalizedEffectiveEngine, /insert into public\.audit_logs/);
  assert.match(
    normalizedEffectiveEngine,
    /update private\.club_mutation_requests as ledger set outcome = v_outcome, result_data = v_result_data, completed_at = pg_catalog\.now\(\)/,
  );
  assert.match(
    normalizedEffectiveEngine,
    /if v_completed_ledger_count <> 1 then/,
  );
});

test("does not widen direct table privileges", () => {
  assert.doesNotMatch(
    normalizedMigration,
    /grant\s+(insert|update|delete|all).*on\s+(table\s+)?public\./i,
  );
  assert.doesNotMatch(
    normalizedMigration,
    /grant\s+(insert|update|delete|all).*on\s+(table\s+)?private\./i,
  );
});

test("does not add role definitions, permissions, triggers, or count limits", () => {
  assert.doesNotMatch(
    normalizedMigration,
    /\b(insert into|update|delete from)\s+public\.club_(role_definitions|role_permissions|permission_definitions)/i,
  );
  assert.doesNotMatch(normalizedMigration, /\bcreate trigger\b/i);
  assert.doesNotMatch(normalizedMigration, /\bmanager_(count|limit|minimum|maximum)\b/i);
});

test("keeps target user identity internal to delegation", () => {
  for (const wrapper of wrappers) {
    assert.match(wrapper, /v_target_user_id uuid/);
    assert.match(wrapper, /v_replay_target_user_id uuid/);
    assert.doesNotMatch(
      normalizeSql(wrapper),
      /return query select[^;]*v_result\.target_user_id::uuid/,
    );
  }
  assert.match(
    normalizedOriginalRpc,
    /create function public\.grant_club_manager_role\( p_club_id uuid, p_target_user_id uuid, p_request_id uuid, p_reason text \)/,
  );
  assert.match(
    normalizedOriginalRpc,
    /create function public\.revoke_club_manager_role\( p_club_id uuid, p_target_user_id uuid, p_request_id uuid, p_reason text \)/,
  );
});
