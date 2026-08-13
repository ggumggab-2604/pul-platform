import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260813000100_pul_hall_of_fame_badge_publication_projection_rpc.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

function functionBlock(qualifiedName) {
  const markers = [
    `create function ${qualifiedName}(`,
    `create or replace function ${qualifiedName}(`,
  ];
  const start = markers
    .map((marker) => migration.indexOf(marker))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];
  assert.ok(Number.isInteger(start), `missing function ${qualifiedName}`);
  const end = migration.indexOf("\n$$;", start);
  assert.ok(end > start, `unterminated function ${qualifiedName}`);
  return migration.slice(start, end + 4);
}

test("projection sync RPC is actorless, versioned, typed, and authenticated-only", () => {
  const block = functionBlock("public.sync_hall_of_fame_record_projection");
  const header = block.split("returns table", 1)[0];
  assert.match(
    header,
    /p_record_id uuid,[\s\S]*p_expected_record_version integer,[\s\S]*p_request_id uuid/,
  );
  assert.doesNotMatch(header, /actor_user_id/);
  assert.match(block, /v_actor uuid := auth\.uid\(\)/);
  assert.match(block, /returns table \([\s\S]*badge_source_count integer,[\s\S]*badges_created integer,[\s\S]*changed boolean,[\s\S]*replayed boolean/);
  assert.match(
    migration,
    /revoke all on function public\.sync_hall_of_fame_record_projection\(uuid, integer, uuid\)[\s\S]*from public, anon, authenticated, service_role;[\s\S]*grant execute on function public\.sync_hall_of_fame_record_projection\(uuid, integer, uuid\)[\s\S]*to authenticated;/,
  );
});

test("projection sync uses the request ledger before canonical row locks", () => {
  const block = functionBlock("public.sync_hall_of_fame_record_projection");
  const requestLock = block.indexOf("lock_hall_of_fame_mutation_request");
  const canonicalAdvisory = block.indexOf(", 8612");
  const claim = block.indexOf("hall_of_fame_claim_request");
  const canonicalRow = block.indexOf("for update", claim);
  const consentRow = block.indexOf("for update", canonicalRow + 1);
  const definitions = block.indexOf("for share", consentRow);
  const badges = block.indexOf("for update", definitions);
  assert.ok(requestLock >= 0);
  assert.ok(canonicalAdvisory > requestLock);
  assert.ok(claim > canonicalAdvisory);
  assert.ok(canonicalRow > claim);
  assert.ok(consentRow > canonicalRow);
  assert.ok(definitions > consentRow);
  assert.ok(badges > definitions);
});

test("projection sync uses an exact active platform_admin guard", () => {
  const helper = functionBlock("private.require_hall_of_fame_projection_admin");
  assert.match(helper, /account\.account_status = 'active'/);
  assert.match(helper, /v_platform_role <> 'platform_admin'/);
  assert.doesNotMatch(helper, /applications\.decide|records\.correct|records\.revoke/);
  const block = functionBlock("public.sync_hall_of_fame_record_projection");
  assert.match(block, /require_hall_of_fame_projection_admin\(v_actor\)/);
});

test("badge mapping is deterministic and limited to approved record types", () => {
  const block = functionBlock("public.sync_hall_of_fame_record_projection");
  assert.match(block, /record_type_code not in \('hole_in_one', 'albatross', 'condor'\)/);
  assert.match(block, /values \(v_record\.record_type_code\), \('hall_of_fame_inductee'::text\)/);
  assert.match(block, /HOF_REQUIRED_BADGE_DEFINITION_MISSING/);
  assert.match(block, /HOF_BADGE_SOURCE_RECONCILIATION_FAILED/);
  assert.match(migration, /hall_of_fame_badge_sources_active_record_badge_uidx|status = 'active'/);
});

test("badge source creation is canonical-only and never deactivates provenance", () => {
  const block = functionBlock("public.sync_hall_of_fame_record_projection");
  assert.match(block, /v_record\.validity_status <> 'active'/);
  assert.match(block, /v_source_status <> 'approved'/);
  assert.match(block, /insert into public\.hall_of_fame_badge_sources/);
  assert.doesNotMatch(block, /update public\.hall_of_fame_badge_sources|delete from public\.hall_of_fame_badge_sources/);
  const withdrawal = functionBlock(
    "public.withdraw_hall_of_fame_publication_consent_after_approval",
  );
  assert.doesNotMatch(withdrawal, /hall_of_fame_badge_sources/);
});

test("current publication consent is target-bound and mandatory-scope aware", () => {
  const helper = functionBlock(
    "private.hall_of_fame_publication_consent_is_effective",
  );
  assert.match(helper, /application_record_id = p_application_record_id/);
  assert.match(helper, /target_user_id = p_target_user_id/);
  assert.match(helper, /status = 'granted'/);
  assert.match(helper, /masked_display_name_consent/);
  assert.match(helper, /record_date_consent/);
  assert.match(helper, /course_detail_consent/);
  assert.match(helper, /withdrawn_at is null/);
});

test("initial publication is hidden to published and suppression is published to suppressed", () => {
  const block = functionBlock("public.sync_hall_of_fame_record_projection");
  assert.match(block, /v_effective_consent and v_record\.publication_status = 'hidden'/);
  assert.match(block, /publication_status = 'published'/);
  assert.match(block, /not v_effective_consent and v_record\.publication_status = 'published'/);
  assert.match(block, /publication_status = 'suppressed'/);
  assert.doesNotMatch(block, /v_record\.publication_status = 'suppressed'[\s\S]{0,180}publication_status = 'published'/);
});

test("canonical publication changes are versioned, historized, audited, and completed atomically", () => {
  const block = functionBlock("public.sync_hall_of_fame_record_projection");
  assert.match(block, /version = canonical\.version \+ 1/);
  assert.match(block, /insert into public\.hall_of_fame_record_history/);
  assert.match(block, /hall_of_fame\.record\.published/);
  assert.match(block, /hall_of_fame\.record\.suppressed/);
  assert.match(block, /insert into public\.audit_logs/);
  assert.match(block, /complete_hall_of_fame_request/);
});

test("no-op synchronization completes only its ledger result", () => {
  const block = functionBlock("public.sync_hall_of_fame_record_projection");
  assert.match(block, /if v_changed then[\s\S]*insert into public\.hall_of_fame_record_history/);
  assert.match(block, /if v_changed or v_badges_created > 0 then[\s\S]*insert into public\.audit_logs/);
  assert.match(block, /'changed', v_changed or v_badges_created > 0/);
});

test("post-approval withdrawal RPC is target-only, versioned, and authenticated-only", () => {
  const block = functionBlock(
    "public.withdraw_hall_of_fame_publication_consent_after_approval",
  );
  const header = block.split("returns table", 1)[0];
  assert.match(
    header,
    /p_record_id uuid,[\s\S]*p_expected_consent_version integer,[\s\S]*p_request_id uuid/,
  );
  assert.match(block, /v_actor uuid := auth\.uid\(\)/);
  assert.match(block, /v_record\.target_user_id <> v_actor/);
  assert.match(block, /v_consent\.version <> p_expected_consent_version/);
  assert.match(
    migration,
    /revoke all on function public\.withdraw_hall_of_fame_publication_consent_after_approval\(uuid, integer, uuid\)[\s\S]*from public, anon, authenticated, service_role;[\s\S]*grant execute on function public\.withdraw_hall_of_fame_publication_consent_after_approval\(uuid, integer, uuid\)[\s\S]*to authenticated;/,
  );
});

test("withdrawal atomically clears consent scope and suppresses hidden or published canonical", () => {
  const block = functionBlock(
    "public.withdraw_hall_of_fame_publication_consent_after_approval",
  );
  assert.match(block, /status = 'withdrawn'/);
  for (const flag of [
    "display_name_consent",
    "masked_display_name_consent",
    "full_display_name_consent",
    "avatar_consent",
    "club_name_consent",
    "record_date_consent",
    "course_detail_consent",
    "badge_consent",
  ]) {
    assert.match(block, new RegExp(`${flag} = false`));
  }
  assert.match(
    block,
    /if v_record\.publication_status in \('hidden', 'published'\) then/,
  );
  assert.match(block, /Publication consent withdrawn by subject\./);
  assert.match(block, /insert into public\.hall_of_fame_publication_consent_history/);
  assert.match(
    block,
    /v_before_publication := v_record\.publication_status[\s\S]*insert into public\.hall_of_fame_record_history[\s\S]*v_before_publication,[\s\S]*'suppressed'/,
  );
  assert.match(
    block,
    /v_consent\.status = 'withdrawn'[\s\S]*v_record\.publication_status <> 'suppressed'[\s\S]*complete_hall_of_fame_request/,
  );
});

test("withdrawal shares the canonical lock domain with projection sync", () => {
  for (const name of [
    "public.sync_hall_of_fame_record_projection",
    "public.withdraw_hall_of_fame_publication_consent_after_approval",
  ]) {
    const block = functionBlock(name);
    assert.match(block, /hashtextextended\(p_record_id::text, 8612\)/);
    assert.match(block, /lock_hall_of_fame_mutation_request/);
    assert.match(block, /hall_of_fame_claim_request/);
  }
});

test("ledger and row guards are operation-specific and deny direct deletes", () => {
  const guard = functionBlock(
    "private.enforce_guarded_hall_of_fame_projection_mutation",
  );
  assert.match(guard, /HOF_DIRECT_DELETE_FORBIDDEN/);
  assert.match(guard, /hall_of_fame_mutation_context_is_valid\(\)/);
  assert.match(guard, /auth\.uid\(\) is distinct from v_actor/);
  assert.match(guard, /new\.payload_fingerprint <> old\.payload_fingerprint/);
  assert.match(guard, /HOF_LEDGER_CONTEXT_MISMATCH/);
  assert.match(migration, /hall_of_fame_badge_sources_projection_guard/);
  assert.match(migration, /hall_of_fame_publication_consents_post_approval_guard/);
});

test("history guards preserve append-only version chains", () => {
  const guard = functionBlock(
    "private.enforce_hall_of_fame_projection_history_append",
  );
  assert.match(guard, /tg_op <> 'INSERT'/);
  assert.match(guard, /previous_history\.version = new\.version - 1/);
  assert.match(guard, /previous_history\.to_publication_status = new\.from_publication_status/);
  assert.match(guard, /previous_history\.to_status = new\.from_status/);
});

test("public list RPC is anonymous-safe and returns no raw identifiers", () => {
  const block = functionBlock("public.list_hall_of_fame_public_records");
  const header = block.split("language plpgsql", 1)[0];
  assert.match(header, /p_limit integer default 50/);
  assert.match(header, /p_offset integer default 0/);
  assert.doesNotMatch(
    header,
    /record_id|target_user_id|application_record_id|evidence|request_id|actor_user_id/,
  );
  assert.match(
    migration,
    /grant execute on function public\.list_hall_of_fame_public_records\(integer, integer\)[\s\S]*to anon, authenticated;/,
  );
  assert.doesNotMatch(migration, /grant execute on function public\.list_hall_of_fame_public_records[\s\S]{0,120}service_role/);
});

test("public list requires active published canonical and current effective consent", () => {
  const block = functionBlock("public.list_hall_of_fame_public_records");
  assert.match(block, /canonical\.validity_status = 'active'/);
  assert.match(block, /canonical\.publication_status = 'published'/);
  assert.match(block, /consent\.status = 'granted'/);
  assert.match(block, /consent\.withdrawn_at is null/);
  assert.match(block, /consent\.masked_display_name_consent/);
  assert.match(block, /consent\.record_date_consent/);
  assert.match(block, /consent\.course_detail_consent/);
});

test("public privacy projection is flag-gated and excludes sensitive domains", () => {
  const block = functionBlock("public.list_hall_of_fame_public_records");
  assert.match(block, /when consent\.full_display_name_consent/);
  assert.match(block, /when consent\.masked_display_name_consent[\s\S]*'PUL member'/);
  assert.match(block, /when consent\.club_name_consent then club\.name/);
  assert.match(block, /when consent\.badge_consent then/);
  assert.match(block, /null::text/);
  assert.doesNotMatch(
    block,
    /hall_of_fame_evidence_files|hall_of_fame_application_reviews|audit_logs|hall_of_fame_mutation_requests|auth\.users|user_private_contacts/,
  );
});

test("public badges require active source, published source record, and badge consent", () => {
  const block = functionBlock("public.list_hall_of_fame_public_records");
  assert.match(block, /source\.status = 'active'/);
  assert.match(block, /source_record\.validity_status = 'active'/);
  assert.match(block, /source_record\.publication_status = 'published'/);
  assert.match(block, /source_consent\.badge_consent/);
  assert.match(block, /pg_catalog\.count\(\*\)::integer as source_count/);
  assert.match(block, /group by[\s\S]*source\.badge_code/);
});

test("all new private helpers revoke every external role", () => {
  for (const signature of [
    "private.require_hall_of_fame_projection_admin(uuid)",
    "private.hall_of_fame_publication_consent_is_effective(uuid, uuid)",
    "private.enforce_guarded_hall_of_fame_projection_mutation()",
    "private.enforce_hall_of_fame_projection_history_append()",
  ]) {
    const escaped = signature
      .replaceAll(".", "\\.")
      .replaceAll("(", "\\(")
      .replaceAll(")", "\\)");
    assert.match(
      migration,
      new RegExp(
        `revoke all on function ${escaped}\\s*from public, anon, authenticated, service_role;`,
      ),
    );
  }
});

test("scope remains badge/publication projection without final-decision rewrites", () => {
  assert.doesNotMatch(migration, /create\s+table/i);
  assert.doesNotMatch(migration, /create\s+policy/i);
  assert.doesNotMatch(migration, /alter\s+table\s+public\.platform_/i);
  assert.doesNotMatch(migration, /create\s+or\s+replace\s+function\s+public\.decide_hall_of_fame_application/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.hall_of_fame_badge_sources/i);
  assert.doesNotMatch(migration, /hall_of_fame_evidence_files/);
});
