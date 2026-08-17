import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260815000200_pul_hall_of_fame_dispute_review_resolution_rpc.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

function functionBlock(name) {
  const markers = [
    `create function ${name}`,
    `create or replace function ${name}`,
  ];
  const start = markers
    .map((marker) => migration.indexOf(marker))
    .find((index) => index >= 0);
  assert.notEqual(start, undefined, `${name} function not found`);
  const end = migration.indexOf("\n$$;", start);
  assert.notEqual(end, -1, `${name} function terminator not found`);
  return migration.slice(start, end + 4);
}

function assertOrdered(block, markers) {
  let previous = -1;
  for (const marker of markers) {
    const current = block.indexOf(marker);
    assert.ok(current >= 0, `${marker} not found`);
    assert.ok(current > previous, `${marker} is out of order`);
    previous = current;
  }
}

test("provisions exact dispute permissions without widening moderator authority", () => {
  for (const permission of [
    "hall_of_fame.disputes.read",
    "hall_of_fame.disputes.review",
    "hall_of_fame.disputes.resolve",
  ]) {
    assert.match(migration, new RegExp(`'${permission}'`));
  }
  assert.match(
    migration,
    /'platform_moderator', 'hall_of_fame\.disputes\.read'/,
  );
  assert.match(
    migration,
    /'platform_moderator', 'hall_of_fame\.disputes\.review'/,
  );
  assert.doesNotMatch(
    migration,
    /values[\s\S]*?'platform_moderator', 'hall_of_fame\.disputes\.resolve'[\s\S]*?;/,
  );
});

test("extends current and history state with bounded resolution invariants", () => {
  for (const column of [
    "review_started_at",
    "review_started_by_user_id",
    "resolved_at",
    "resolved_by_user_id",
    "resolution_outcome",
    "resolution_message",
    "resolution_canonical_record_id",
  ]) {
    assert.match(migration, new RegExp(`add column ${column}`));
  }
  assert.match(
    migration,
    /foreign key \(resolution_canonical_record_id, subject_user_id\)[\s\S]*references public\.hall_of_fame_records \(id, target_user_id\)/,
  );
  assert.match(
    migration,
    /resolution_message = pg_catalog\.regexp_replace\([\s\S]*char_length\(resolution_message\) between 2 and 2000/,
  );
  assert.match(
    migration,
    /add column resolution_outcome text,[\s\S]*action = 'hall_of_fame\.dispute\.resolved'/,
  );
});

test("creates an append-only private review table with closed ACL and RLS", () => {
  assert.match(migration, /create table public\.hall_of_fame_dispute_reviews/);
  assert.match(migration, /unique \(actor_user_id, request_id\)/);
  assert.match(migration, /review_kind in \('internal_note', 'resolution_note'\)/);
  assert.match(
    migration,
    /alter table public\.hall_of_fame_dispute_reviews enable row level security/,
  );
  assert.match(
    migration,
    /alter table public\.hall_of_fame_dispute_reviews force row level security/,
  );
  assert.match(
    migration,
    /revoke all on table public\.hall_of_fame_dispute_reviews[\s\S]*from public, anon, authenticated, service_role/,
  );
  assert.match(migration, /if tg_op <> 'INSERT'/);
});

test("review queue, detail, and note reads are permission-bound and private", () => {
  const queue = functionBlock("public.list_hall_of_fame_dispute_review_queue");
  const detail = functionBlock("public.get_hall_of_fame_dispute_for_review");
  const notes = functionBlock("public.list_hall_of_fame_dispute_internal_notes");
  for (const block of [queue, detail, notes]) {
    assert.match(block, /security definer/);
    assert.match(block, /set search_path = ''/);
    assert.match(block, /'hall_of_fame\.disputes\.read'/);
    assert.doesNotMatch(block, /email|phone|storage|signed_url|access_token/i);
  }
  assert.match(queue, /order by dispute\.created_at, dispute\.id/);
  assert.match(queue, /p_limit not between 1 and 100/);
});

test("review start is versioned, conflict-free, replayable, and single-assignment", () => {
  const start = functionBlock("public.start_hall_of_fame_dispute_review");
  assert.match(start, /'hall_of_fame\.dispute\.review\.start'/);
  assert.match(start, /if v_claim\.replayed then/);
  assert.match(start, /'hall_of_fame\.disputes\.review'/);
  assert.match(
    start,
    /v_actor in \(v_dispute\.submitted_by_user_id, v_dispute\.subject_user_id\)/,
  );
  assert.match(start, /HOF_DISPUTE_REVIEW_ALREADY_STARTED/);
  assert.match(start, /status = 'under_review'/);
  assert.match(start, /version = dispute\.version \+ 1/);
  assert.match(start, /'hall_of_fame\.dispute\.review_started'/);
});

test("internal notes are normalized, version-neutral, private, and replay-safe", () => {
  const note = functionBlock("public.add_hall_of_fame_dispute_internal_note");
  assert.match(note, /v_note text := pg_catalog\.regexp_replace/);
  assert.match(note, /char_length\(v_note\) not between 2 and 2000/);
  assert.match(note, /if v_claim\.replayed then/);
  assert.match(note, /v_dispute\.status <> 'under_review'/);
  assert.match(note, /'internal_note'/);
  assert.doesNotMatch(note, /update public\.hall_of_fame_disputes/);
  assert.doesNotMatch(note, /insert into public\.hall_of_fame_dispute_history/);
});

test("generic resolution accepts only no-action outcomes and completes atomically", () => {
  const resolve = functionBlock("public.resolve_hall_of_fame_dispute");
  const finish = functionBlock(
    "private.finish_hall_of_fame_dispute_resolution",
  );
  assert.doesNotMatch(
    resolve,
    /correction_applied|objection_upheld_revoke_applied|fraud_substantiated_correction_applied/,
  );
  assert.match(resolve, /private\.finish_hall_of_fame_dispute_resolution/);
  assert.match(finish, /'hall_of_fame\.disputes\.resolve'/);
  assert.match(finish, /'resolution_note'/);
  assert.match(finish, /status = 'resolved'/);
  assert.match(finish, /insert into public\.hall_of_fame_dispute_history/);
  assert.match(finish, /insert into public\.audit_logs/);
  assert.match(finish, /private\.complete_hall_of_fame_request/);
});

test("correction orchestration uses a distinct child request and restores outer context", () => {
  const correct = functionBlock(
    "public.resolve_hall_of_fame_dispute_with_correction",
  );
  assert.match(correct, /'hall_of_fame\.disputes\.resolve'/);
  assert.match(correct, /'hall_of_fame\.records\.correct'/);
  assert.match(correct, /v_dispute\.canonical_record_id <> p_record_id/);
  assert.match(correct, /v_child_request_id := pg_catalog\.gen_random_uuid\(\)/);
  assert.match(correct, /v_child_request_id <> p_request_id/);
  assert.match(
    correct,
    /public\.correct_hall_of_fame_canonical_record\([\s\S]*v_child_request_id/,
  );
  assert.match(
    correct,
    /private\.restore_hall_of_fame_dispute_context\([\s\S]*private\.finish_hall_of_fame_dispute_resolution/,
  );
  assert.doesNotMatch(
    correct,
    /public\.correct_hall_of_fame_canonical_record\([\s\S]*p_request_id\s*\)/,
  );
  assertOrdered(correct, [
    "if v_claim.replayed then",
    "'hall_of_fame.disputes.resolve'",
    "'hall_of_fame.records.correct'",
    "from public.hall_of_fame_disputes as dispute",
    "v_child_request_id := pg_catalog.gen_random_uuid()",
    "public.correct_hall_of_fame_canonical_record(",
  ]);
});

test("revoke orchestration is exact-target, separately permissioned, and context-safe", () => {
  const revoke = functionBlock(
    "public.resolve_hall_of_fame_dispute_with_revoke",
  );
  assert.match(revoke, /'hall_of_fame\.disputes\.resolve'/);
  assert.match(revoke, /'hall_of_fame\.records\.revoke'/);
  assert.match(revoke, /v_dispute\.canonical_record_id <> p_record_id/);
  assert.match(revoke, /v_child_request_id <> p_request_id/);
  assert.match(
    revoke,
    /public\.revoke_hall_of_fame_canonical_record\([\s\S]*v_child_request_id/,
  );
  assert.match(
    revoke,
    /private\.restore_hall_of_fame_dispute_context\([\s\S]*private\.finish_hall_of_fame_dispute_resolution/,
  );
  assertOrdered(revoke, [
    "if v_claim.replayed then",
    "'hall_of_fame.disputes.resolve'",
    "'hall_of_fame.records.revoke'",
    "from public.hall_of_fame_disputes as dispute",
    "v_child_request_id := pg_catalog.gen_random_uuid()",
    "public.revoke_hall_of_fame_canonical_record(",
  ]);
});

test("private parent-child correlation never enters public or own DTOs", () => {
  const finish = functionBlock(
    "private.finish_hall_of_fame_dispute_resolution",
  );
  const ownList = functionBlock("public.list_my_hall_of_fame_disputes");
  const ownDetail = functionBlock("public.get_my_hall_of_fame_dispute");
  assert.match(finish, /'child_request_id', p_child_request_id/);
  assert.match(finish, /'canonical_operation', p_canonical_operation/);
  for (const block of [ownList, ownDetail]) {
    assert.match(block, /dispute\.resolution_outcome/);
    assert.match(block, /dispute\.resolution_message/);
    assert.match(block, /dispute\.resolved_at/);
    assert.doesNotMatch(
      block,
      /child_request_id|resolved_by_user_id|review_started_by_user_id|resolution_canonical_record_id/,
    );
  }
});

test("all public RPCs are authenticated-only SECURITY DEFINER functions", () => {
  const names = [
    "list_hall_of_fame_dispute_review_queue",
    "get_hall_of_fame_dispute_for_review",
    "list_hall_of_fame_dispute_internal_notes",
    "start_hall_of_fame_dispute_review",
    "add_hall_of_fame_dispute_internal_note",
    "resolve_hall_of_fame_dispute",
    "resolve_hall_of_fame_dispute_with_correction",
    "resolve_hall_of_fame_dispute_with_revoke",
  ];
  for (const name of names) {
    const block = functionBlock(`public.${name}`);
    assert.match(block, /security definer/);
    assert.match(block, /set search_path = ''/);
    assert.match(
      migration,
      new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]*?\\) to authenticated;`),
    );
  }
});

test("keeps canonical reasons independent and deferred domains absent", () => {
  const correct = functionBlock(
    "public.resolve_hall_of_fame_dispute_with_correction",
  );
  const revoke = functionBlock(
    "public.resolve_hall_of_fame_dispute_with_revoke",
  );
  assert.match(correct, /v_reason text := pg_catalog\.btrim\(p_correction_reason\)/);
  assert.match(revoke, /v_reason text := pg_catalog\.btrim\(p_revocation_reason\)/);
  assert.doesNotMatch(correct, /v_dispute\.statement|v_dispute\.category/);
  assert.doesNotMatch(revoke, /v_dispute\.statement|v_dispute\.category/);
  const executableSql = migration.replace(/^\s*--.*$/gm, "");
  assert.doesNotMatch(
    executableSql,
    /storage\.objects|hall_of_fame_dispute_(messages|evidence)|notification|reinstat|approval_reversal/i,
  );
  assert.doesNotMatch(
    executableSql,
    /fail_after_inner|test[_ ]only|fault[_ ]injection/i,
  );
});
