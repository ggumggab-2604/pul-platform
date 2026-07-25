import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const migrationUrl = new URL(
  "../../../supabase/migrations/20260804000100_pul_club_membership_end_reactivation_by_membership_contract.sql",
  import.meta.url,
);
const engineUrl = new URL(
  "../../../supabase/migrations/20260724000100_pul_club_vice_admin_foundation.sql",
  import.meta.url,
);
const replayUrl = new URL(
  "../../../supabase/migrations/20260803000100_pul_club_membership_status_mutation_replay_priority_correction.sql",
  import.meta.url,
);
const listUrl = new URL(
  "../../../supabase/migrations/20260731000100_pul_club_member_list_read_contract.sql",
  import.meta.url,
);
const detailUrl = new URL(
  "../../../supabase/migrations/20260801000100_pul_club_member_detail_read_contract.sql",
  import.meta.url,
);

const migration = readFileSync(fileURLToPath(migrationUrl), "utf8");
const engine = readFileSync(fileURLToPath(engineUrl), "utf8");
const replay = readFileSync(fileURLToPath(replayUrl), "utf8");
const listContract = readFileSync(fileURLToPath(listUrl), "utf8");
const detailContract = readFileSync(fileURLToPath(detailUrl), "utf8");

const normalizeSql = (sql) => sql.replace(/\s+/g, " ").trim();
const normalizedMigration = normalizeSql(migration);
const normalizedEngine = normalizeSql(engine);
const normalizedReplay = normalizeSql(replay);
const normalizedListContract = normalizeSql(listContract);
const normalizedDetailContract = normalizeSql(detailContract);

const getFunctionBlock = (sql, qualifiedName) => {
  const marker = `create function ${qualifiedName}(`;
  const start = sql.indexOf(marker);
  assert.notEqual(start, -1, `${qualifiedName} must exist`);

  const end = sql.indexOf("\n$$;", start);
  assert.notEqual(end, -1, `${qualifiedName} must have a complete body`);
  return sql.slice(start, end + 4);
};

const endWrapper = getFunctionBlock(
  migration,
  "public.end_club_membership_by_membership_id",
);
const activateWrapper = getFunctionBlock(
  migration,
  "public.activate_club_membership_by_membership_id",
);
const replayHelper = getFunctionBlock(
  migration,
  "private.resolve_completed_club_membership_end_reactivation_replay",
);

test("defines only the approved membership-ID mutation signatures", () => {
  assert.match(
    normalizedMigration,
    /create function public\.end_club_membership_by_membership_id\( p_membership_id uuid, p_request_id uuid, p_reason text \)/,
  );
  assert.match(
    normalizedMigration,
    /create function public\.activate_club_membership_by_membership_id\( p_membership_id uuid, p_request_id uuid, p_reason text \)/,
  );
  assert.doesNotMatch(
    normalizedMigration,
    /create function public\.(suspend|resume)_club_membership_by_membership_id/,
  );
});

test("keeps the approved ten-column mutation result contract", () => {
  const resultContract =
    /returns table \( request_id uuid, action_code text, club_id uuid, target_user_id uuid, membership_id uuid, previous_status text, current_status text, changed boolean, replayed boolean, outcome text \)/;

  assert.match(normalizeSql(endWrapper), resultContract);
  assert.match(normalizeSql(activateWrapper), resultContract);
});

test("uses security-definer functions with an empty search path", () => {
  for (const functionBlock of [endWrapper, activateWrapper, replayHelper]) {
    const normalizedBlock = normalizeSql(functionBlock);
    assert.match(normalizedBlock, /security definer set search_path = ''/);
  }
});

test("restricts public wrappers to authenticated execution", () => {
  for (const functionName of [
    "end_club_membership_by_membership_id",
    "activate_club_membership_by_membership_id",
  ]) {
    assert.match(
      normalizedMigration,
      new RegExp(
        `revoke all on function public\\.${functionName}\\( uuid, uuid, text \\) from public, anon, authenticated, service_role;`,
      ),
    );
    assert.match(
      normalizedMigration,
      new RegExp(
        `grant execute on function public\\.${functionName}\\( uuid, uuid, text \\) to authenticated;`,
      ),
    );
  }
});

test("does not expose the replay helper to external roles", () => {
  assert.match(
    normalizedMigration,
    /revoke all on function private\.resolve_completed_club_membership_end_reactivation_replay\( uuid, text, uuid \) from public, anon, authenticated, service_role;/,
  );
  assert.doesNotMatch(
    normalizedMigration,
    /grant execute on function private\.resolve_completed_club_membership_end_reactivation_replay/,
  );
});

test("checks completed replay before current club authorization", () => {
  for (const [wrapper, action] of [
    [endWrapper, "membership.end"],
    [activateWrapper, "membership.activate"],
  ]) {
    const replayIndex = wrapper.indexOf(
      "private.resolve_completed_club_membership_end_reactivation_replay",
    );
    const permissionIndex = wrapper.indexOf(
      "private.club_user_has_permission",
    );

    assert.ok(replayIndex >= 0);
    assert.ok(permissionIndex > replayIndex);
    assert.match(wrapper, new RegExp(`'${action.replace(".", "\\.")}'`));
  }
});

test("binds completed replay to actor, request, action, and membership", () => {
  const normalizedHelper = normalizeSql(replayHelper);

  assert.match(
    normalizedHelper,
    /where ledger\.actor_id = v_actor_id and ledger\.request_id = p_request_id for update/,
  );
  assert.match(
    normalizedHelper,
    /v_ledger_action_code is distinct from p_action_code/,
  );
  assert.match(
    normalizedHelper,
    /v_result_data ->> 'membership_id' is distinct from p_membership_id::text/,
  );
  assert.match(
    normalizedHelper,
    /where actor_account\.id = v_actor_id for share/,
  );
});

test("delegates end and reactivation to the approved user-ID engine", () => {
  assert.match(endWrapper, /from public\.end_club_membership\(/);
  assert.match(
    activateWrapper,
    /from public\.activate_club_membership\(/,
  );
  assert.doesNotMatch(
    `${endWrapper}\n${activateWrapper}`,
    /\b(insert into|update|delete from)\s+public\.club_(memberships|role_assignments)/i,
  );
});

test("resolves new requests with both permission and active admin-or-vice checks", () => {
  for (const functionBlock of [endWrapper, activateWrapper]) {
    assert.match(
      normalizeSql(functionBlock),
      /from public\.club_memberships as membership where membership\.id = p_membership_id and private\.club_user_has_permission\( v_actor_id, membership\.club_id, 'club\.members\.manage' \) and private\.club_user_is_active_admin_or_vice_admin\( v_actor_id, membership\.club_id \)/,
    );
  }
});

test("validates delegated results against request, action, club, target, and membership", () => {
  for (const [functionBlock, action] of [
    [endWrapper, "membership.end"],
    [activateWrapper, "membership.activate"],
  ]) {
    assert.match(functionBlock, /v_result\.request_id is distinct from p_request_id/);
    assert.match(
      functionBlock,
      new RegExp(
        `v_result\\.action_code is distinct from '${action.replace(".", "\\.")}'`,
      ),
    );
    assert.match(functionBlock, /v_result\.club_id is distinct from/);
    assert.match(functionBlock, /v_result\.target_user_id is distinct from/);
    assert.match(
      functionBlock,
      /v_result\.membership_id is distinct from p_membership_id/,
    );
  }
});

test("does not widen direct table DML privileges", () => {
  assert.doesNotMatch(
    normalizedMigration,
    /grant\s+(insert|update|delete|all).*on\s+(table\s+)?public\.club_(memberships|role_assignments)/i,
  );
  assert.doesNotMatch(
    normalizedMigration,
    /\b(insert into|update|delete from)\s+public\.club_(memberships|role_assignments)/i,
  );
});

test("preserves the approved reason and fingerprint contract in the engine", () => {
  assert.match(
    normalizedEngine,
    /pg_catalog\.char_length\(v_reason\) < 2 or pg_catalog\.char_length\(v_reason\) > 500/,
  );
  assert.match(
    normalizedEngine,
    /'action_code', p_action_code, 'club_id', p_club_id, 'target_user_id', v_target_user_id, 'reason', v_reason/,
  );
  assert.match(
    normalizedEngine,
    /같은 요청 식별자를 다른 입력에 재사용할 수 없습니다\./u,
  );
});

test("preserves end transitions, role revocation, and membership identity", () => {
  assert.match(
    normalizedEngine,
    /elsif p_action_code = 'membership\.end' then/,
  );
  assert.match(
    normalizedEngine,
    /if v_membership_status in \('active', 'suspended'\) then update public\.club_role_assignments as assignment set revoked_at = pg_catalog\.now\(\), revoked_by = v_actor_id/,
  );
  assert.match(
    normalizedEngine,
    /update public\.club_memberships as membership set membership_status = 'left', suspended_at = null, left_at = pg_catalog\.now\(\) where membership\.id = v_membership_id/,
  );
  assert.doesNotMatch(
    normalizedEngine,
    /delete from public\.club_memberships/,
  );
});

test("preserves left reactivation without restoring privileged roles", () => {
  assert.match(
    normalizedEngine,
    /elsif v_membership_status = 'left' then/,
  );
  assert.match(
    normalizedEngine,
    /update public\.club_memberships as membership set membership_status = 'active', suspended_at = null, left_at = null where membership\.id = v_membership_id/,
  );
  assert.match(
    normalizedEngine,
    /insert into public\.club_role_assignments \( membership_id, role_code, assigned_by \) values \( v_membership_id, 'club_member', v_actor_id \)/,
  );
  assert.match(
    normalizedEngine,
    /where assignment\.membership_id = v_membership_id and assignment\.revoked_at is null and assignment\.role_code <> 'club_admin'/,
  );
});

test("preserves self, administrator, and vice-administrator protection", () => {
  assert.match(
    normalizedEngine,
    /if p_target_user_id = v_actor_id then raise exception '관리 작업으로 본인의 회원 관계를 변경할 수 없습니다\.'/,
  );
  assert.match(
    normalizedEngine,
    /private\.club_membership_has_unrevoked_admin_assignment\(v_membership_id\)/,
  );
  assert.match(
    normalizedEngine,
    /private\.club_membership_has_unrevoked_vice_admin_assignment\(v_membership_id\)/,
  );
});

test("preserves audit and single-ledger completion in the approved engine", () => {
  assert.match(normalizedEngine, /insert into public\.audit_logs/);
  assert.match(
    normalizedEngine,
    /update private\.club_mutation_requests as ledger set outcome = v_outcome, result_data = v_result_data, completed_at = pg_catalog\.now\(\)/,
  );
  assert.match(
    normalizedEngine,
    /if v_completed_ledger_count <> 1 then/,
  );
});

test("inherits the approved completed replay behavior", () => {
  assert.match(
    normalizedEngine,
    /if v_completed_at is not null then return query select p_request_id, v_ledger_action_code, v_ledger_club_id, v_ledger_target_user_id, \(v_result_data ->> 'membership_id'\)::uuid, v_result_data ->> 'previous_status', v_result_data ->> 'current_status', \(v_result_data ->> 'changed'\)::boolean, true, v_ledger_outcome; return; end if;/,
  );
  assert.match(
    normalizedReplay,
    /resolve_completed_club_membership_mutation_replay_target/,
  );
});

test("keeps left memberships addressable through list and detail contracts", () => {
  assert.match(
    normalizedListContract,
    /v_membership_status not in \('active', 'suspended', 'left'\)/,
  );
  assert.match(
    normalizedListContract,
    /'membership_id', page_member\.membership_id/,
  );
  assert.match(
    normalizedDetailContract,
    /where membership\.id = p_membership_id and membership\.club_id = p_club_id/,
  );
  assert.match(
    normalizedDetailContract,
    /v_membership_status not in \('active', 'suspended', 'left'\)/,
  );
});
