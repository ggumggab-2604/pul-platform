import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const migrationUrl = new URL(
  "../../../supabase/migrations/20260806000200_pul_hall_of_fame_foundation.sql",
  import.meta.url,
);

const migration = readFileSync(fileURLToPath(migrationUrl), "utf8");
const normalized = migration.replace(/\s+/g, " ").trim();

const publicTables = [
  "hall_of_fame_record_type_definitions",
  "hall_of_fame_application_batches",
  "hall_of_fame_round_snapshots",
  "hall_of_fame_application_records",
  "hall_of_fame_record_confirmations",
  "hall_of_fame_publication_consents",
  "hall_of_fame_publication_consent_history",
  "hall_of_fame_evidence_files",
  "hall_of_fame_application_messages",
  "hall_of_fame_application_reviews",
  "hall_of_fame_application_history",
  "hall_of_fame_records",
  "hall_of_fame_record_history",
  "hall_of_fame_badge_definitions",
  "hall_of_fame_badge_sources",
];

function normalizeSql(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*--.*$/gm, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractNamedTrigger(sql, triggerName) {
  const statement = normalizeSql(sql).match(
    new RegExp(`create trigger ${triggerName} [\\s\\S]*?;`),
  )?.[0];

  assert.ok(statement, `${triggerName} trigger must exist`);
  return statement;
}

function extractNamedFunction(sql, functionName) {
  const definition = normalizeSql(sql).match(
    new RegExp(
      `create function private\\.${functionName}\\(\\)[\\s\\S]*?\\$\\$;`,
    ),
  )?.[0];

  assert.ok(definition, `${functionName} function must exist`);
  return definition;
}

function assertReverseBadgeTriggerContracts(sql) {
  assert.equal(
    extractNamedTrigger(
      sql,
      "hall_of_fame_records_badge_source_invariants_before_update",
    ),
    "create trigger hall_of_fame_records_badge_source_invariants_before_update before update of target_user_id, record_type_code, validity_status on public.hall_of_fame_records for each row execute function private.enforce_hall_of_fame_record_badge_source_invariants();",
  );
  assert.equal(
    extractNamedTrigger(
      sql,
      "hall_of_fame_badge_definitions_source_invariants_before_update",
    ),
    "create trigger hall_of_fame_badge_definitions_source_invariants_before_update before update of source_record_type_code, is_active on public.hall_of_fame_badge_definitions for each row execute function private.enforce_hall_of_fame_badge_definition_source_invariants();",
  );
}

function assertPrivateTriggerFunctionContract(
  sql,
  functionName,
  requiredPatterns,
) {
  const definition = extractNamedFunction(sql, functionName);

  assert.match(definition, /security definer/);
  assert.match(definition, /set search_path = ''/);
  assert.match(definition, /returns trigger/);
  assert.match(definition, /return new;/);
  for (const pattern of requiredPatterns) {
    assert.match(definition, pattern);
  }

  const normalizedSql = normalizeSql(sql);
  assert.match(
    normalizedSql,
    new RegExp(
      `revoke all on function private\\.${functionName}\\(\\) from public, anon, authenticated, service_role;`,
    ),
  );
  assert.doesNotMatch(
    normalizedSql,
    new RegExp(
      `grant execute on function private\\.${functionName}\\(\\)[\\s\\S]*? to (?:public|anon|authenticated|service_role);`,
    ),
  );
}

function assertReverseBadgeFunctionContracts(sql) {
  assertPrivateTriggerFunctionContract(
    sql,
    "enforce_hall_of_fame_record_badge_source_invariants",
    [
      /from public\.hall_of_fame_badge_sources as source/,
      /join public\.hall_of_fame_badge_definitions as definition/,
      /HOF_BADGE_SOURCE_RECORD_NOT_ACTIVE/,
      /HOF_BADGE_SOURCE_TARGET_MISMATCH/,
      /HOF_BADGE_SOURCE_TYPE_MISMATCH/,
    ],
  );
  assertPrivateTriggerFunctionContract(
    sql,
    "enforce_hall_of_fame_badge_definition_source_invariants",
    [
      /from public\.hall_of_fame_badge_sources as source/,
      /join public\.hall_of_fame_records as record/,
      /HOF_BADGE_DEFINITION_NOT_ACTIVE/,
      /HOF_BADGE_SOURCE_TYPE_MISMATCH/,
    ],
  );
}

test("creates every approved public table and the private HOF ledger", () => {
  for (const table of publicTables) {
    assert.match(
      normalized,
      new RegExp(`create table public\\.${table} \\(`),
      `${table} must exist`,
    );
  }

  assert.match(
    normalized,
    /create table private\.hall_of_fame_mutation_requests \(/,
  );
});

test("seeds explicit club permissions without granting member or manager access", () => {
  for (const permission of [
    "club.achievement_applications.read",
    "club.achievement_applications.nominate",
    "club.achievement_applications.confirm",
    "club.achievement_applications.manage",
  ]) {
    assert.match(migration, new RegExp(`'${permission.replaceAll(".", "\\.")}'`));
  }

  assert.match(
    normalized,
    /\('club_vice_admin', 'club\.achievement_applications\.confirm'\)/,
  );
  assert.doesNotMatch(
    normalized,
    /\('club_(member|manager)', 'club\.achievement_applications\./,
  );
});

test("uses definition rows for the three record types and four badges", () => {
  for (const type of ["hole_in_one", "albatross", "condor"]) {
    assert.match(
      normalized,
      new RegExp(
        `insert into public\\.hall_of_fame_record_type_definitions[\\s\\S]*'${type}'`,
      ),
    );
  }

  for (const badge of [
    "hole_in_one",
    "albatross",
    "condor",
    "hall_of_fame_inductee",
  ]) {
    assert.match(
      normalized,
      new RegExp(
        `insert into public\\.hall_of_fame_badge_definitions[\\s\\S]*'${badge}'`,
      ),
    );
  }
});

test("enforces application types, workflow states, and one round per batch", () => {
  assert.match(
    normalized,
    /application_type in \( 'club_nomination', 'direct_application', 'club_admin_vacancy_direct_application' \)/,
  );
  assert.match(
    normalized,
    /status in \( 'draft', 'submitted', 'under_review', 'additional_info_required', 'approved', 'partially_approved', 'rejected', 'withdrawn', 'cancelled' \)/,
  );
  assert.match(
    normalized,
    /application_batch_id uuid not null unique references public\.hall_of_fame_application_batches \(id\) on delete restrict/,
  );
  assert.match(
    normalized,
    /foreign key \(round_snapshot_id, application_batch_id\) references public\.hall_of_fame_round_snapshots \(id, application_batch_id\)/,
  );
});

test("enforces per-round target-hole uniqueness and active fingerprint claims", () => {
  assert.match(
    normalized,
    /unique \( application_batch_id, target_user_id, course_segment_snapshot, hole_number \)/,
  );
  assert.match(
    normalized,
    /duplicate_fingerprint is null or pg_catalog\.octet_length\(duplicate_fingerprint\) = 32/,
  );
  assert.match(
    normalized,
    /create unique index hall_of_fame_application_records_active_fingerprint_uidx[\s\S]*where duplicate_fingerprint is not null and review_status in \( 'submitted', 'under_review', 'additional_info_required', 'approved' \);/,
  );
});

test("enforces confirmation identity XOR without raw external contacts", () => {
  assert.match(
    normalized,
    /confirmer_user_id is not null and external_contact_hmac is null and external_contact_masked is null/,
  );
  assert.match(
    normalized,
    /confirmer_user_id is null and confirmer_membership_id is null and external_contact_hmac is not null and external_contact_masked is not null/,
  );
  assert.match(
    normalized,
    /pg_catalog\.octet_length\(external_contact_hmac\) = 32/,
  );
  assert.doesNotMatch(
    normalized,
    /external_(email|phone|contact_raw|contact_value)\s+text/i,
  );
  assert.match(
    normalized,
    /create unique index hall_of_fame_record_confirmations_member_uidx/,
  );
  assert.match(
    normalized,
    /create unique index hall_of_fame_record_confirmations_external_uidx/,
  );
});

test("separates current publication consent from append-only version history", () => {
  assert.match(
    normalized,
    /create table public\.hall_of_fame_publication_consents \(/,
  );
  assert.match(
    normalized,
    /create table public\.hall_of_fame_publication_consent_history \(/,
  );
  assert.match(
    normalized,
    /unique \(application_record_id, version\)/,
  );
  assert.match(
    normalized,
    /status <> 'granted' or \( display_name_consent and record_date_consent and course_detail_consent \)/,
  );
});

test("binds evidence paths to batch and evidence IDs with private-file constraints", () => {
  assert.match(
    normalized,
    /storage_bucket = 'hall-of-fame-evidence'/,
  );
  assert.match(
    normalized,
    /storage_path = 'applications\/' \|\| application_batch_id::text \|\| '\/' \|\| id::text \|\| '\/original'/,
  );
  assert.match(normalized, /byte_size between 1 and 10485760/);
  assert.match(normalized, /pg_catalog\.octet_length\(sha256\) = 32/);
  assert.match(
    normalized,
    /mime_type <> 'application\/pdf' or evidence_type = 'scorecard'/,
  );
  assert.match(
    normalized,
    /create unique index hall_of_fame_evidence_files_available_sha_uidx[\s\S]*where status = 'available' and sha256 is not null;/,
  );
});

test("enforces same-batch acyclic evidence replacement lineage", () => {
  assert.match(
    normalized,
    /constraint hall_of_fame_evidence_files_id_batch_unique unique \(id, application_batch_id\)/,
  );
  assert.match(
    normalized,
    /constraint hall_of_fame_evidence_files_replacement_batch_fkey foreign key \(replaced_by_evidence_id, application_batch_id\) references public\.hall_of_fame_evidence_files \( id, application_batch_id \) on delete restrict/,
  );

  const replacementFunction = normalized.match(
    /create function private\.enforce_hall_of_fame_evidence_replacement_invariants\(\)[\s\S]*?revoke all on function private\.enforce_hall_of_fame_evidence_replacement_invariants\(\) from public, anon, authenticated, service_role;/,
  )?.[0];
  assert.ok(replacementFunction);
  assert.match(replacementFunction, /security definer set search_path = ''/);
  assert.match(replacementFunction, /pg_catalog\.pg_advisory_xact_lock/);
  assert.match(replacementFunction, /with recursive replacement_chain as/);
  assert.match(replacementFunction, /HOF_EVIDENCE_REPLACEMENT_BATCH_MISMATCH/);
  assert.match(replacementFunction, /HOF_EVIDENCE_REPLACEMENT_SELF_REFERENCE/);
  assert.match(replacementFunction, /HOF_EVIDENCE_REPLACEMENT_CYCLE/);
  assert.match(replacementFunction, /replacement_status in \('deleted', 'failed', 'expired'\)/);
  assert.match(
    normalized,
    /create trigger hall_of_fame_evidence_files_invariants_before_mutation before insert or update on public\.hall_of_fame_evidence_files for each row execute function private\.enforce_hall_of_fame_evidence_replacement_invariants\(\);/,
  );
  assert.match(
    normalized,
    /status = 'replaced' and replaced_by_evidence_id is not null[\s\S]*status <> 'replaced' and replaced_by_evidence_id is null/,
  );
});

test("rejects control characters in original evidence filenames", () => {
  const filenameConstraint = normalized.match(
    /constraint hall_of_fame_evidence_files_filename_check check \([\s\S]*?\), constraint hall_of_fame_evidence_files_status_check/,
  )?.[0];
  assert.ok(filenameConstraint);
  assert.match(filenameConstraint, /original_filename = pg_catalog\.btrim\(original_filename\)/);
  assert.match(filenameConstraint, /pg_catalog\.char_length\(original_filename\) <= 255/);
  assert.match(filenameConstraint, /original_filename !~ '\[\[:cntrl:\]\]'/);
});
test("keeps applicant messages and internal reviews in separate append-only tables", () => {
  assert.match(
    normalized,
    /create table public\.hall_of_fame_application_messages \(/,
  );
  assert.match(
    normalized,
    /create table public\.hall_of_fame_application_reviews \(/,
  );
  assert.match(
    normalized,
    /hall_of_fame_application_messages_guard_before_mutation[\s\S]*private\.reject_hall_of_fame_append_only_mutation\(\)/,
  );
  assert.match(
    normalized,
    /hall_of_fame_application_reviews_guard_before_mutation[\s\S]*private\.reject_hall_of_fame_append_only_mutation\(\)/,
  );
});

test("enforces scoped monotonic application history", () => {
  assert.match(
    normalized,
    /\(scope = 'batch' and application_record_id is null\) or \(scope = 'record' and application_record_id is not null\)/,
  );
  assert.match(
    normalized,
    /create unique index hall_of_fame_application_history_batch_version_uidx[\s\S]*where scope = 'batch';/,
  );
  assert.match(
    normalized,
    /create unique index hall_of_fame_application_history_record_version_uidx[\s\S]*where scope = 'record';/,
  );
});

test("separates batch and record history status domains", () => {
  const batchStatusConstraint = normalized.match(
    /constraint hall_of_fame_application_history_batch_status_check check \([\s\S]*?\), constraint hall_of_fame_application_history_record_status_check/,
  )?.[0];
  const recordStatusConstraint = normalized.match(
    /constraint hall_of_fame_application_history_record_status_check check \([\s\S]*?\), constraint hall_of_fame_application_history_version_check/,
  )?.[0];

  assert.ok(batchStatusConstraint);
  assert.ok(recordStatusConstraint);
  assert.match(batchStatusConstraint, /scope <> 'batch'/);
  assert.match(batchStatusConstraint, /partially_approved/);
  assert.match(batchStatusConstraint, /from_status is null or from_status in/);
  assert.match(batchStatusConstraint, /and to_status in/);
  assert.match(recordStatusConstraint, /scope <> 'record'/);
  assert.doesNotMatch(recordStatusConstraint, /partially_approved/);
  assert.match(recordStatusConstraint, /from_status is null or from_status in/);
  assert.match(recordStatusConstraint, /and to_status in/);
  assert.doesNotMatch(
    normalized,
    /constraint hall_of_fame_application_history_status_check/,
  );
});
test("protects canonical source, fingerprint, correction, and publication state", () => {
  assert.match(
    normalized,
    /source_application_record_id uuid not null unique/,
  );
  assert.match(
    normalized,
    /pg_catalog\.octet_length\(record_fingerprint\) = 32/,
  );
  assert.match(
    normalized,
    /create unique index hall_of_fame_records_active_fingerprint_uidx[\s\S]*where validity_status = 'active';/,
  );
  assert.match(
    normalized,
    /create unique index hall_of_fame_records_correction_successor_uidx/,
  );
  assert.match(
    normalized,
    /publication_status = 'published' and validity_status = 'active'/,
  );
  assert.match(
    normalized,
    /validity_status = 'revoked' and publication_status = 'suppressed'/,
  );
  assert.match(
    normalized,
    /validity_status <> 'corrected' or publication_status = 'suppressed'/,
  );
});

test("stores badge source history and permits only one active record-badge source", () => {
  assert.match(
    normalized,
    /status in \('active', 'inactive'\)/,
  );
  assert.match(
    normalized,
    /create unique index hall_of_fame_badge_sources_active_record_badge_uidx[\s\S]*where status = 'active';/,
  );
  assert.match(
    normalized,
    /constraint hall_of_fame_badge_sources_activation_timeline_check check \(activated_at >= created_at\)/,
  );
  assert.doesNotMatch(
    normalized,
    /delete from public\.hall_of_fame_badge_sources/i,
  );
});

test("enforces active badge source and reverse canonical invariants", () => {
  const sourceInvariant = normalized.match(
    /create function private\.enforce_hall_of_fame_badge_source_invariants\(\)[\s\S]*?revoke all on function private\.enforce_hall_of_fame_badge_source_invariants\(\) from public, anon, authenticated, service_role;/,
  )?.[0];
  assert.ok(sourceInvariant);
  assert.match(sourceInvariant, /security definer set search_path = ''/);
  assert.match(sourceInvariant, /source_validity_status <> 'active'/);
  assert.match(sourceInvariant, /not badge_is_active/);
  assert.match(
    sourceInvariant,
    /badge_source_record_type_code is not null and badge_source_record_type_code <> source_record_type_code/,
  );
  assert.match(sourceInvariant, /HOF_BADGE_SOURCE_REACTIVATION_FORBIDDEN/);
  assert.match(
    normalized,
    /create trigger hall_of_fame_badge_sources_invariants_before_mutation before insert or update on public\.hall_of_fame_badge_sources for each row execute function private\.enforce_hall_of_fame_badge_source_invariants\(\);/,
  );
  assert.match(
    normalized,
    /create function private\.enforce_hall_of_fame_record_badge_source_invariants\(\)[\s\S]*?HOF_BADGE_SOURCE_RECORD_NOT_ACTIVE/,
  );
  assert.match(
    normalized,
    /create function private\.enforce_hall_of_fame_badge_definition_source_invariants\(\)[\s\S]*?HOF_BADGE_DEFINITION_NOT_ACTIVE/,
  );
  assert.match(
    normalized,
    /'hall_of_fame_inductee', '명예의 전당 등재',[\s\S]*?null, 40, true/,
  );
});
test("binds both reverse badge invariant triggers to exact tables and events", () => {
  assertReverseBadgeTriggerContracts(migration);
});
test("secures each reverse badge invariant trigger function independently", () => {
  assertReverseBadgeFunctionContracts(migration);
});
test("detects reverse badge trigger and function contract regressions", () => {
  const recordTrigger = extractNamedTrigger(
    migration,
    "hall_of_fame_records_badge_source_invariants_before_update",
  );
  const definitionTrigger = extractNamedTrigger(
    migration,
    "hall_of_fame_badge_definitions_source_invariants_before_update",
  );
  const recordFunction = extractNamedFunction(
    migration,
    "enforce_hall_of_fame_record_badge_source_invariants",
  );
  const definitionFunction = extractNamedFunction(
    migration,
    "enforce_hall_of_fame_badge_definition_source_invariants",
  );
  const recordRevoke =
    "revoke all on function private.enforce_hall_of_fame_record_badge_source_invariants() from public, anon, authenticated, service_role;";

  const withoutRecordTrigger = normalized.replace(recordTrigger, "");

  assert.throws(() =>
    assertReverseBadgeTriggerContracts(withoutRecordTrigger),
  );
  assert.throws(() =>
    assertReverseBadgeTriggerContracts(
      `-- ${recordTrigger}\n${withoutRecordTrigger}`,
    ),
  );
  assert.throws(() =>
    assertReverseBadgeTriggerContracts(
      normalized.replace(
        definitionTrigger,
        definitionTrigger.replace(
          "on public.hall_of_fame_badge_definitions",
          "on public.hall_of_fame_records",
        ),
      ),
    ),
  );
  assert.throws(() =>
    assertReverseBadgeTriggerContracts(
      normalized.replace(
        recordTrigger,
        recordTrigger.replace(
          "private.enforce_hall_of_fame_record_badge_source_invariants()",
          "private.enforce_hall_of_fame_badge_source_invariants()",
        ),
      ),
    ),
  );
  assert.throws(() =>
    assertReverseBadgeFunctionContracts(
      normalized.replace(
        recordFunction,
        () => recordFunction.replace("security definer", ""),
      ),
    ),
  );
  assert.throws(() =>
    assertReverseBadgeFunctionContracts(
      normalized.replace(
        definitionFunction,
        () => definitionFunction.replace("set search_path = ''", ""),
      ),
    ),
  );
  assert.throws(() =>
    assertReverseBadgeFunctionContracts(
      normalized.replace(recordRevoke, ""),
    ),
  );
});
test("creates an actor-request ledger with strict fingerprints and result states", () => {
  assert.match(
    normalized,
    /unique \(actor_user_id, request_id\)/,
  );
  assert.match(
    normalized,
    /constraint hall_of_fame_mutation_requests_record_batch_presence_check check \( application_record_id is null or application_batch_id is not null \)/,
  );
  assert.match(
    normalized,
    /pg_catalog\.octet_length\(payload_fingerprint\) = 32/,
  );
  assert.match(
    normalized,
    /status in \('in_progress', 'completed', 'failed'\)/,
  );
  assert.match(
    normalized,
    /status = 'completed' and result_payload is not null and error_code is null and completed_at is not null/,
  );
});

test("creates the exact private evidence bucket without object access policies", () => {
  assert.match(
    normalized,
    /insert into storage\.buckets \( id, name, public, file_size_limit, allowed_mime_types \) values \( 'hall-of-fame-evidence', 'hall-of-fame-evidence', false, 10485760,/,
  );
  for (const mime of [
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
  ]) {
    assert.match(normalized, new RegExp(`'${mime.replace("/", "\\/")}'`));
  }
  assert.doesNotMatch(normalized, /create policy[\s\S]*storage\.objects/i);
  assert.doesNotMatch(
    normalized,
    /grant\s+(select|insert|update|delete|all)[\s\S]*storage\.(buckets|objects)/i,
  );
});

test("forces RLS and revokes table access for every public domain table", () => {
  for (const table of publicTables) {
    assert.match(
      normalized,
      new RegExp(
        `alter table public\\.${table} enable row level security; alter table public\\.${table} force row level security;`,
      ),
      `${table} must force RLS`,
    );
    assert.match(
      normalized,
      new RegExp(
        `revoke all on table public\\.${table} from public, anon, authenticated, service_role;`,
      ),
      `${table} must revoke all app-facing roles`,
    );
  }

  assert.match(
    normalized,
    /alter table private\.hall_of_fame_mutation_requests enable row level security; alter table private\.hall_of_fame_mutation_requests force row level security;/,
  );
});

test("installs deny-by-default guarded mutation and append-only protection", () => {
  assert.match(
    normalized,
    /create function private\.reject_hall_of_fame_mutation\(\)[\s\S]*security definer set search_path = ''[\s\S]*HOF_MUTATION_RPC_REQUIRED/,
  );
  assert.match(
    normalized,
    /create function private\.reject_hall_of_fame_append_only_mutation\(\)[\s\S]*security definer set search_path = ''[\s\S]*HOF_APPEND_ONLY_MUTATION_FORBIDDEN/,
  );

  for (const table of [
    "hall_of_fame_application_batches",
    "hall_of_fame_round_snapshots",
    "hall_of_fame_application_records",
    "hall_of_fame_record_confirmations",
    "hall_of_fame_publication_consents",
    "hall_of_fame_evidence_files",
    "hall_of_fame_records",
    "hall_of_fame_badge_sources",
  ]) {
    assert.match(
      normalized,
      new RegExp(
        `before insert or update or delete on public\\.${table} for each row execute function private\\.reject_hall_of_fame_mutation\\(\\);`,
      ),
    );
  }

  for (const table of [
    "hall_of_fame_publication_consent_history",
    "hall_of_fame_application_messages",
    "hall_of_fame_application_reviews",
    "hall_of_fame_application_history",
    "hall_of_fame_record_history",
  ]) {
    assert.match(
      normalized,
      new RegExp(
        `before insert or update or delete on public\\.${table} for each row execute function private\\.reject_hall_of_fame_append_only_mutation\\(\\);`,
      ),
    );
  }
});

test("does not implement the deferred Hall of Fame business RPCs", () => {
  assert.doesNotMatch(
    normalized,
    /create function public\.(submit|nominate|approve|reject|correct|revoke|prepare|finalize)_hall_of_fame/i,
  );
  assert.doesNotMatch(normalized, /create policy/i);
});
