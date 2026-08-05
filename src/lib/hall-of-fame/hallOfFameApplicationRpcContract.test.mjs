import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const migrationUrl = new URL(
  "../../../supabase/migrations/20260807000100_pul_hall_of_fame_application_rpc_foundation.sql",
  import.meta.url,
);
const migration = readFileSync(fileURLToPath(migrationUrl), "utf8");
const correctionMigrationUrl = new URL(
  "../../../supabase/migrations/20260807000200_pul_hall_of_fame_http_conflict_sqlstate_correction.sql",
  import.meta.url,
);
const correctionMigration = readFileSync(
  fileURLToPath(correctionMigrationUrl),
  "utf8",
);
const historicalMigrationSha256 =
  "4f51e4b9a3f589fb1fc156a327dcf86596be9caf8d46ce4a8f8284a795fa00f1";
const e2eUrl = new URL("./hallOfFameApplicationRpc.test.mjs", import.meta.url);
const e2eSource = readFileSync(fileURLToPath(e2eUrl), "utf8");

function normalizeSql(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*--.*$/gm, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const sqlIdentifierSource = String.raw`(?:"(?:[^"]|"")*"|[a-z_][a-z0-9_$]*)`;

function decodeSqlIdentifier(source) {
  if (source.startsWith('"')) {
    assert.match(source, /^"(?:[^"]|"")*"$/);
    return {
      quoted: true,
      value: source.slice(1, -1).replaceAll('""', '"'),
    };
  }

  assert.match(source, /^[a-z_][a-z0-9_$]*$/i);
  return { quoted: false, value: source.toLowerCase() };
}

function canonicalizeSqlIdentifier(source) {
  return decodeSqlIdentifier(source).value;
}

function canonicalizeTypeIdentifier(source) {
  const identifier = decodeSqlIdentifier(source);
  if (!identifier.quoted || /^[a-z_][a-z0-9_$]*$/.test(identifier.value)) {
    return identifier.value;
  }
  return `"${identifier.value.replaceAll('"', '""')}"`;
}

function protectQuotedTypeIdentifiers(source) {
  const quotedIdentifiers = [];
  let protectedSource = "";

  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== '"') {
      protectedSource += source[index].toLowerCase();
      continue;
    }

    const start = index;
    let closed = false;
    for (index += 1; index < source.length; index += 1) {
      if (source[index] !== '"') continue;
      if (source[index + 1] === '"') {
        index += 1;
        continue;
      }
      closed = true;
      break;
    }
    assert.ok(closed, "quoted type identifier must be terminated");

    const placeholder = `\uE000${quotedIdentifiers.length}\uE001`;
    quotedIdentifiers.push(
      canonicalizeTypeIdentifier(source.slice(start, index + 1)),
    );
    protectedSource += placeholder;
  }

  return {
    source: protectedSource,
    restore(value) {
      return quotedIdentifiers.reduce(
        (restored, identifier, index) =>
          restored.replaceAll(`\uE000${index}\uE001`, identifier),
        value,
      );
    },
  };
}

function findClosingParenthesis(source, openIndex) {
  let depth = 0;
  let singleQuoted = false;
  let doubleQuoted = false;

  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index];
    const nextCharacter = source[index + 1];
    if (singleQuoted) {
      if (character === "'" && nextCharacter === "'") index += 1;
      else if (character === "'") singleQuoted = false;
      continue;
    }
    if (doubleQuoted) {
      if (character === '"' && nextCharacter === '"') index += 1;
      else if (character === '"') doubleQuoted = false;
      continue;
    }
    if (character === "'") {
      singleQuoted = true;
      continue;
    }
    if (character === '"') {
      doubleQuoted = true;
      continue;
    }
    if (character === "(") depth += 1;
    if (character === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  assert.fail("function argument list must have a closing parenthesis");
}

function splitTopLevelArguments(source) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let singleQuoted = false;
  let doubleQuoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const nextCharacter = source[index + 1];
    if (singleQuoted) {
      if (character === "'" && nextCharacter === "'") index += 1;
      else if (character === "'") singleQuoted = false;
      continue;
    }
    if (doubleQuoted) {
      if (character === '"' && nextCharacter === '"') index += 1;
      else if (character === '"') doubleQuoted = false;
      continue;
    }
    if (character === "'") singleQuoted = true;
    else if (character === '"') doubleQuoted = true;
    else if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    else if (character === "," && depth === 0) {
      parts.push(source.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(source.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

function normalizeType(source) {
  const protectedType = protectQuotedTypeIdentifiers(source);
  const normalized = protectedType.source
    .replace(/\s*\.\s*/g, ".")
    .replace(/\s*\[\s*\]/g, "[]")
    .replace(/\s+/g, " ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\s*,\s*/g, ", ")
    .trim();
  return protectedType.restore(normalized);
}

function identityTypeFromArgument(argument) {
  const normalized = normalizeType(argument).replace(
    /\s+(?:default\s+|=\s*)[\s\S]*$/,
    "",
  );
  const parsed = /^(?:(in|out|inout|variadic)\s+)?("[^"]+"|[a-z_][a-z0-9_$]*)\s+(.+)$/.exec(
    normalized,
  );
  assert.ok(parsed, `function argument must include a name and type: ${argument}`);
  const mode = parsed[1] ?? "in";
  const type = normalizeType(parsed[3]);
  if (mode === "out") return null;
  if (mode === "in") return type;
  return `${mode} ${type}`;
}

function parseCorrectionFunctionDefinitions(source) {
  const definitions = [];
  const headerPattern = new RegExp(
    `^\\s*create\\s+(?:(or)\\s+replace\\s+)?function\\s+` +
      `(${sqlIdentifierSource})\\s*\\.\\s*(${sqlIdentifierSource})\\s*\\(`,
    "gim",
  );
  for (const match of source.matchAll(headerPattern)) {
    const openIndex = match.index + match[0].lastIndexOf("(");
    const closeIndex = findClosingParenthesis(source, openIndex);
    const bodyEnd = source.indexOf("$$;", closeIndex);
    assert.notEqual(
      bodyEnd,
      -1,
      `${match[2]}.${match[3]} must have a complete function body`,
    );
    const block = source.slice(match.index, bodyEnd + 3);
    const returnMatch = /\breturns\s+([\s\S]*?)\s+language\s+([a-z_][a-z0-9_$]*)\b/i.exec(
      source.slice(closeIndex + 1, bodyEnd),
    );
    assert.ok(returnMatch, `${match[2]}.${match[3]} must declare RETURNS and LANGUAGE`);
    const identityArguments = splitTopLevelArguments(
      source.slice(openIndex + 1, closeIndex),
    )
      .map(identityTypeFromArgument)
      .filter((type) => type !== null)
      .join(", ");
    const normalizedBlock = normalizeSql(block);
    const parallelMatch = /\bparallel\s+(safe|restricted|unsafe)\b/.exec(
      normalizedBlock,
    );
    definitions.push({
      schema: canonicalizeSqlIdentifier(match[2]),
      name: canonicalizeSqlIdentifier(match[3]),
      orReplace: match[1] !== undefined,
      identityArguments,
      returnType: normalizeType(returnMatch[1]),
      language: returnMatch[2].toLowerCase(),
      volatility: /\bimmutable\b/.test(normalizedBlock)
        ? "immutable"
        : /\bstable\b/.test(normalizedBlock)
          ? "stable"
          : "volatile",
      parallel: parallelMatch?.[1] ?? "unsafe",
    });
  }
  return definitions;
}

function functionRange(source, qualifiedName) {
  const pattern = new RegExp(
    `create(?: or replace)? function ${qualifiedName.replaceAll(".", "\\.")}\\(`,
  );
  const match = pattern.exec(source);
  assert.ok(match, `${qualifiedName} must exist`);
  const end = source.indexOf("\n$$;", match.index);
  assert.notEqual(end, -1, `${qualifiedName} must have a complete body`);
  return [match.index, end + 4];
}

function extractFunction(source, qualifiedName) {
  const [start, end] = functionRange(source, qualifiedName);
  return source.slice(start, end);
}

function mutateFunction(source, qualifiedName, before, after) {
  const [start, end] = functionRange(source, qualifiedName);
  const block = source.slice(start, end);
  assert.equal(
    block.split(before).length - 1,
    1,
    `${qualifiedName} mutation anchor must be unique`,
  );
  return source.slice(0, start) + block.replace(before, after) + source.slice(end);
}

function mutateSourceOnce(source, before, after, label) {
  assert.equal(
    source.split(before).length - 1,
    1,
    label + " mutation anchor must be unique",
  );
  return source.replace(before, after);
}

function mutateFunctionAll(source, qualifiedName, before, after, expectedCount) {
  const [start, end] = functionRange(source, qualifiedName);
  const block = source.slice(start, end);
  assert.equal(
    block.split(before).length - 1,
    expectedCount,
    `${qualifiedName} mutation anchor count must match`,
  );
  return source.slice(0, start) + block.replaceAll(before, after) + source.slice(end);
}

const mutationRpcs = [
  ["create_hall_of_fame_application_draft", "text, uuid, uuid"],
  [
    "set_hall_of_fame_round_snapshot",
    "uuid, integer, date, timestamptz, text, text, text, text, text, text, text, uuid",
  ],
  [
    "add_hall_of_fame_application_record",
    "uuid, integer, uuid, uuid, text, text, integer, integer, integer, uuid",
  ],
  [
    "update_hall_of_fame_application_record",
    "uuid, integer, integer, text, text, integer, integer, integer, uuid",
  ],
  [
    "withdraw_hall_of_fame_application_record",
    "uuid, integer, integer, text, uuid",
  ],
  [
    "withdraw_hall_of_fame_application_draft",
    "uuid, integer, text, uuid",
  ],
];

const editRpcs = mutationRpcs.slice(1);

const staleConflictCounts = new Map([
  ["set_hall_of_fame_round_snapshot", 2],
  ["add_hall_of_fame_application_record", 2],
  ["update_hall_of_fame_application_record", 4],
  ["withdraw_hall_of_fame_application_record", 4],
  ["withdraw_hall_of_fame_application_draft", 2],
]);


const publicMutationReturnType = normalizeType(
  "table (request_id uuid, operation text, application_batch_id uuid, " +
    "application_record_id uuid, batch_version integer, record_version integer, " +
    "changed boolean, replayed boolean, outcome text)",
);

const correctionFunctionContracts = [
  {
    schema: "private",
    name: "hall_of_fame_claim_request",
    identityArguments: "uuid, uuid, text, uuid, uuid, uuid, bytea",
    returnType: normalizeType("table (replayed boolean, result_payload jsonb)"),
    authenticatedExecute: false,
  },
  ...editRpcs.map(([name, identityArguments]) => ({
    schema: "public",
    name,
    identityArguments,
    returnType: publicMutationReturnType,
    authenticatedExecute: true,
  })),
];

function functionAclStatements(source, verb, schema, name) {
  const normalizedSource = normalizeSql(source);
  const action = verb === "revoke" ? "revoke all" : "grant execute";
  const pattern = new RegExp(
    "\\b" +
      action +
      "\\s+on\\s+function\\s+" +
      escapeRegExp(schema) +
      "\\." +
      escapeRegExp(name) +
      "\\(([^)]*)\\)\\s+([^;]+);",
    "g",
  );
  return [...normalizedSource.matchAll(pattern)].map((match) => ({
    identityArguments: normalizeType(match[1]),
    roles: normalizeType(match[2]),
  }));
}

function assertCorrectionFunctionContracts(source) {
  const definitions = parseCorrectionFunctionDefinitions(source);
  assert.equal(
    definitions.length,
    correctionFunctionContracts.length,
    "correction must contain exactly the six approved function definitions",
  );

  for (const expected of correctionFunctionContracts) {
    const qualifiedName = expected.schema + "." + expected.name;
    const matchingDefinitions = definitions.filter(
      (definition) =>
        definition.schema === expected.schema && definition.name === expected.name,
    );
    assert.equal(
      matchingDefinitions.length,
      1,
      qualifiedName + " must have exactly one CREATE OR REPLACE definition",
    );
    const [actual] = matchingDefinitions;
    assert.equal(actual.orReplace, true, qualifiedName + " must use CREATE OR REPLACE");
    assert.equal(
      actual.identityArguments,
      expected.identityArguments,
      qualifiedName + " CREATE identity signature must match",
    );
    assert.equal(
      actual.returnType,
      expected.returnType,
      qualifiedName + " return type must match",
    );
    assert.equal(actual.language, "plpgsql", qualifiedName + " language must match");
    assert.equal(actual.volatility, "volatile", qualifiedName + " volatility must match");
    assert.equal(actual.parallel, "unsafe", qualifiedName + " parallel mode must match");

    const revokes = functionAclStatements(source, "revoke", expected.schema, expected.name);
    assert.equal(revokes.length, 1, qualifiedName + " must have one REVOKE ACL");
    assert.equal(
      revokes[0].identityArguments,
      expected.identityArguments,
      qualifiedName + " REVOKE ACL signature must match CREATE",
    );
    assert.equal(
      revokes[0].roles,
      "from public, anon, authenticated, service_role",
      qualifiedName + " REVOKE roles must remain exact",
    );

    const grants = functionAclStatements(source, "grant", expected.schema, expected.name);
    if (expected.authenticatedExecute) {
      assert.equal(grants.length, 1, qualifiedName + " must have one GRANT ACL");
      assert.equal(
        grants[0].identityArguments,
        expected.identityArguments,
        qualifiedName + " GRANT ACL signature must match CREATE",
      );
      assert.equal(
        grants[0].roles,
        "to authenticated",
        qualifiedName + " GRANT role must remain authenticated-only",
      );
    } else {
      assert.equal(grants.length, 0, qualifiedName + " must not grant EXECUTE");
    }
  }
}


function assertSecuredPublicRpc(source, name, signature) {
  const normalizedSource = normalizeSql(source);
  const block = normalizeSql(extractFunction(source, `public.${name}`));
  const normalizedSignature = signature === "" ? "" : ` ${signature} `;
  assert.match(block, /security definer set search_path = ''/);
  assert.doesNotMatch(block, /p_actor(_user)?_id/);
  assert.match(
    normalizedSource,
    new RegExp(
      `revoke all on function public\\.${name}\\(${normalizedSignature}\\) from public, anon, authenticated, service_role;`,
    ),
  );
  assert.match(
    normalizedSource,
    new RegExp(
      `grant execute on function public\\.${name}\\(${normalizedSignature}\\) to authenticated;`,
    ),
  );
}

function validateMigration(source) {
  const normalizedSource = normalizeSql(source);

  assertSecuredPublicRpc(
    source,
    "get_current_user_hall_of_fame_application_eligibility",
    "",
  );
  for (const [name, signature] of mutationRpcs) {
    assertSecuredPublicRpc(source, name, signature);
  }

  const boundary = normalizeSql(
    extractFunction(source, "private.lock_hall_of_fame_authorization_boundary"),
  );
  assert.match(boundary, /security definer set search_path = ''/);
  const clubsLock = boundary.indexOf("lock table public.clubs in share mode");
  const membershipsLock = boundary.indexOf(
    "lock table public.club_memberships in share mode",
  );
  const assignmentsLock = boundary.indexOf(
    "lock table public.club_role_assignments in share mode",
  );
  assert.ok(clubsLock >= 0, "clubs lock must exist");
  assert.ok(
    membershipsLock > clubsLock,
    "club memberships lock must follow clubs lock",
  );
  assert.ok(
    assignmentsLock > membershipsLock,
    "role assignments lock must follow club memberships lock",
  );

  const authorize = normalizeSql(
    extractFunction(
      source,
      "private.lock_and_authorize_hall_of_fame_batch_edit",
    ),
  );
  assert.match(authorize, /security definer set search_path = ''/);
  assert.match(authorize, /created_by_user_id is distinct from p_actor_user_id/);
  assert.match(authorize, /membership\.membership_status = 'active'/);
  assert.match(authorize, /for share of membership, club/);
  assert.match(authorize, /assignment\.role_code = 'club_admin'/);
  assert.match(authorize, /assignment\.revoked_at is null/);
  assert.match(authorize, /for share of assignment, role_definition/);
  assert.match(authorize, /club\.achievement_applications\.manage/);
  assert.match(authorize, /HOF_PERMISSION_DENIED/);

  const draft = normalizeSql(
    extractFunction(source, "public.create_hall_of_fame_application_draft"),
  );
  const draftReplay = draft.indexOf("if v_claim.replayed then");
  const draftBoundary = draft.indexOf(
    "perform private.lock_hall_of_fame_authorization_boundary()",
  );
  const draftRecount = draft.indexOf(
    "v_active_membership_count, v_suspended_membership_count",
  );
  assert.ok(draftReplay >= 0);
  assert.ok(draftBoundary > draftReplay);
  assert.ok(draftRecount > draftBoundary);
  assert.doesNotMatch(
    draft,
    /from public\.get_current_user_hall_of_fame_application_eligibility\(\)/,
  );
  assert.match(draft, /membership\.membership_status = 'active'/);
  assert.match(
    draft,
    /membership\.membership_status = 'suspended'/,
    "draft must recount suspended memberships",
  );
  assert.match(
    draft,
    /where membership\.user_id = v_actor_user_id and membership\.membership_status = 'active' and private\.count_active_club_admins\(club\.id\) > 0/,
  );
  assert.match(draft, /v_valid_admin_club_count <> 0/);
  assert.match(draft, /private\.club_user_is_active_admin/);
  assert.match(draft, /club\.achievement_applications\.nominate/);

  for (const [name] of editRpcs) {
    const block = normalizeSql(extractFunction(source, `public.${name}`));
    const actorAccountLock = block.indexOf(
      "from public.user_accounts as account",
    );
    const advisoryLock = block.indexOf(
      "pg_catalog.hashtextextended(",
    );
    const claim = block.indexOf("private.hall_of_fame_claim_request");
    const replay = block.indexOf("if v_claim.replayed then");
    const boundaryCall = block.indexOf(
      "perform private.lock_hall_of_fame_authorization_boundary()",
    );
    const batchLock = block.indexOf(
      "from public.hall_of_fame_application_batches as batch",
      boundaryCall,
    );
    const authorizeCall = block.indexOf(
      "private.lock_and_authorize_hall_of_fame_batch_edit",
    );
    assert.ok(actorAccountLock >= 0, `${name} actor account lock must exist`);
    assert.ok(advisoryLock > actorAccountLock, `${name} advisory lock must follow actor account lock`);
    assert.ok(claim > advisoryLock, `${name} claim must follow advisory lock`);
    assert.ok(replay > claim, `${name} replay must follow claim`);
    assert.ok(boundaryCall > replay, `${name} boundary must follow replay`);
    assert.ok(batchLock > boundaryCall, `${name} batch lock must follow boundary`);
    assert.ok(authorizeCall > batchLock, `${name} authorization must follow batch lock`);
    assert.match(
      block,
      /from public\.hall_of_fame_application_batches as batch where batch\.id = (?:p_application_batch_id|v_application_batch_id) for update/,
    );
  }

  const segment = normalizeSql(
    extractFunction(source, "private.normalize_hall_of_fame_course_segment"),
  );
  assert.match(segment, /immutable strict security invoker set search_path = ''/);
  assert.match(segment, /pg_catalog\.lower\(pg_catalog\.btrim\(p_course_segment\)\)/);
  assert.match(segment, /\[\[:space:\]\]\+/);
  for (const name of [
    "add_hall_of_fame_application_record",
    "update_hall_of_fame_application_record",
  ]) {
    const block = normalizeSql(extractFunction(source, `public.${name}`));
    assert.match(
      block,
      /v_course_segment text := private\.normalize_hall_of_fame_course_segment\(p_course_segment\)/,
    );
    assert.match(block, /course_segment_snapshot = v_course_segment/);
    assert.match(block, /'course_segment', v_course_segment/);
    assert.doesNotMatch(block, /'course_segment', pg_catalog\.lower\(v_course_segment\)/);
  }
  const update = normalizeSql(
    extractFunction(source, "public.update_hall_of_fame_application_record"),
  );
  assert.match(update, /v_record\.course_segment_snapshot = v_course_segment/);
  assert.match(update, /course_segment_snapshot = v_course_segment/);

  const claim = normalizeSql(
    extractFunction(source, "private.hall_of_fame_claim_request"),
  );
  assert.match(claim, /v_existing\.payload_fingerprint is distinct from p_payload_fingerprint/);
  assert.match(claim, /for update/);
  assert.match(claim, /HOF_REQUEST_ID_PAYLOAD_MISMATCH/);
  assert.match(claim, /HOF_REQUEST_IN_PROGRESS/);
  const complete = normalizeSql(
    extractFunction(source, "private.complete_hall_of_fame_request"),
  );
  assert.match(complete, /get diagnostics v_updated_count = row_count/);
  assert.match(complete, /v_updated_count <> 1/);

  for (const name of [
    "set_hall_of_fame_round_snapshot",
    "add_hall_of_fame_application_record",
    "update_hall_of_fame_application_record",
    "withdraw_hall_of_fame_application_record",
    "withdraw_hall_of_fame_application_draft",
  ]) {
    const block = normalizeSql(extractFunction(source, `public.${name}`));
    assert.match(block, /v_batch\.version <> p_expected_batch_version/);
    assert.match(block, /HOF_STALE_VERSION/);
  }
  for (const name of [
    "update_hall_of_fame_application_record",
    "withdraw_hall_of_fame_application_record",
  ]) {
    const block = normalizeSql(extractFunction(source, `public.${name}`));
    assert.match(block, /v_record\.version <> p_expected_record_version/);
  }

  assert.doesNotMatch(
    normalizedSource,
    /grant (insert|update|delete|all) on (table )?(public|private)\./,
  );
  assert.doesNotMatch(normalizedSource, /create policy/);
  assert.doesNotMatch(normalizedSource, /storage\.(objects|buckets)/);
}

function validateHttpConflictCorrection(source, historicalSource = migration) {
  assert.equal(
    createHash("sha256").update(historicalSource).digest("hex"),
    historicalMigrationSha256,
    "the applied historical migration must remain byte-for-byte immutable",
  );

  const normalizedSource = normalizeSql(source);
  assertCorrectionFunctionContracts(source);
  assert.equal(
    [...source.matchAll(/^create or replace function public\./gm)].length,
    editRpcs.length,
    "the correction must replace exactly the five edit RPCs",
  );
  assert.equal(
    [...source.matchAll(/^create or replace function private\./gm)].length,
    1,
    "the correction may replace only the request-claim helper",
  );
  const claim = normalizeSql(
    extractFunction(source, "private.hall_of_fame_claim_request"),
  );
  assert.match(claim, /HOF_REQUEST_IN_PROGRESS/);
  assert.match(claim, /security definer set search_path = ''/);
  assert.match(claim, /errcode = 'PT409'/);
  assert.doesNotMatch(claim, /HOF_REQUEST_IN_PROGRESS[^;]*40001/);
  assert.match(
    normalizedSource,
    /revoke all on function private\.hall_of_fame_claim_request\( uuid, uuid, text, uuid, uuid, uuid, bytea \) from public, anon, authenticated, service_role;/,
  );
  assert.doesNotMatch(
    normalizedSource,
    /grant execute on function private\.hall_of_fame_claim_request/,
  );

  for (const [name, signature] of editRpcs) {
    assertSecuredPublicRpc(source, name, signature);
    const block = extractFunction(source, `public.${name}`);
    const normalizedBlock = normalizeSql(block);
    const expectedStaleCount = staleConflictCounts.get(name);
    assert.equal(
      [...block.matchAll(/message\s*=\s*'HOF_STALE_VERSION'/g)].length,
      expectedStaleCount,
      `${name} must preserve every intentional stale conflict`,
    );
    assert.equal(
      [...block.matchAll(/errcode\s*=\s*'PT409'/g)].length,
      expectedStaleCount,
      `${name} stale conflicts must use the non-retriable HTTP conflict SQLSTATE`,
    );
    assert.doesNotMatch(
      normalizedBlock,
      /HOF_STALE_VERSION[^;]*40001|40001[^;]*HOF_STALE_VERSION/,
    );
    assert.match(normalizedBlock, /security definer set search_path = ''/);
    assert.match(
      normalizedBlock,
      /returns table \( request_id uuid, operation text, application_batch_id uuid, application_record_id uuid, batch_version integer, record_version integer, changed boolean, replayed boolean, outcome text \)/,
    );
  }

  assert.equal(
    [...source.matchAll(/message\s*=\s*'HOF_STALE_VERSION'/g)].length,
    14,
  );
  assert.equal([...source.matchAll(/errcode\s*=\s*'PT409'/g)].length, 15);
  assert.doesNotMatch(normalizedSource, /create table|alter table|drop table/);
  assert.doesNotMatch(normalizedSource, /create (?:unique )?index|create trigger/);
  assert.doesNotMatch(normalizedSource, /create policy|storage\.(?:objects|buckets)/);
  assert.doesNotMatch(
    normalizedSource,
    /grant execute on function public\.[^(]+\([^)]*\) to (?:public|anon|service_role)/,
  );
  assert.doesNotMatch(
    normalizedSource,
    /grant (?:insert|update|delete|all) on (?:table )?(?:public|private)\./,
  );
}
test("validates the complete B-2A SQL security and concurrency contract", () => {
  validateMigration(migration);
});

test("keeps the privacy-minimized eligibility and typed mutation envelope", () => {
  const eligibility = normalizeSql(
    extractFunction(
      migration,
      "public.get_current_user_hall_of_fame_application_eligibility",
    ),
  );
  for (const field of [
    "eligibility_code text",
    "account_status text",
    "active_membership_count bigint",
    "suspended_membership_count bigint",
    "eligible_nomination_clubs jsonb",
    "vacant_context_clubs jsonb",
    "can_create_direct_application boolean",
    "can_create_club_nomination boolean",
    "reason_code text",
  ]) {
    assert.match(eligibility, new RegExp(field.replaceAll(" ", "\\s+")));
  }
  assert.doesNotMatch(eligibility, /user_profiles|email|phone/);
  const envelope = /returns table \( request_id uuid, operation text, application_batch_id uuid, application_record_id uuid, batch_version integer, record_version integer, changed boolean, replayed boolean, outcome text \)/;
  for (const [name] of mutationRpcs) {
    assert.match(normalizeSql(extractFunction(migration, `public.${name}`)), envelope);
  }
});

test("retains draft-only scope, append-only guards, audit, and soft withdrawal", () => {
  const normalized = normalizeSql(migration);
  assert.doesNotMatch(
    normalized,
    /create(?: or replace)? function public\.(submit|approve|reject|review|prepare|finalize|publish|revoke)_hall_of_fame/i,
  );
  assert.match(normalized, /HOF_DIRECT_DELETE_FORBIDDEN/);
  assert.match(normalized, /HOF_APPEND_ONLY_MUTATION_FORBIDDEN/);
  assert.match(normalized, /HOF_APPLICATION_HISTORY_CHAIN_MISMATCH/);
  assert.doesNotMatch(normalized, /delete from public\.hall_of_fame/i);
  for (const [name] of mutationRpcs) {
    const block = normalizeSql(extractFunction(migration, `public.${name}`));
    assert.match(block, /insert into public\.audit_logs/);
    assert.match(block, /insert into public\.hall_of_fame_application_history/);
    assert.match(block, /private\.hall_of_fame_claim_request/);
    assert.match(block, /private\.complete_hall_of_fame_request/);
  }
});

test("pins independent connection barriers and direct DML negative coverage", () => {
  assert.match(e2eSource, /class InteractivePsql/);
  assert.match(e2eSource, /waitForLockWait/);
  assert.match(e2eSource, /membership_suspend/);
  assert.match(e2eSource, /role_revoke_add/);
  assert.match(e2eSource, /role_revoke_withdraw/);
  assert.match(e2eSource, /direct_activation/);
  assert.match(e2eSource, /vacancy_context_admin/);
  assert.match(e2eSource, /vacancy_other_admin/);
  assert.match(e2eSource, /open_draft/);
  assert.match(e2eSource, /stale_round/);
  assert.match(e2eSource, /duplicate_record/);
  assert.match(e2eSource, /target_limit/);
  assert.match(e2eSource, /withdraw_update/);
  assert.match(e2eSource, /direct round insert unexpectedly succeeded/);
  assert.match(e2eSource, /direct audit insert unexpectedly succeeded/);
  assert.match(e2eSource, /direct history insert unexpectedly succeeded/);
  assert.match(e2eSource, /private ledger read unexpectedly succeeded/);
});

test("rejects each critical mutated SQL contract", () => {
  const mutations = [
    mutateFunction(
      migration,
      "public.add_hall_of_fame_application_record",
      "security definer",
      "security invoker",
    ),
    mutateFunction(
      migration,
      "private.lock_hall_of_fame_authorization_boundary",
      "  lock table public.club_memberships in share mode;\n",
      "",
    ),
    mutateFunction(
      migration,
      "public.set_hall_of_fame_round_snapshot",
      "  perform pg_catalog.pg_advisory_xact_lock(\n    pg_catalog.hashtextextended(p_application_batch_id::text, 8608)\n  );\n",
      "",
    ),
    mutateFunction(
      migration,
      "public.set_hall_of_fame_round_snapshot",
      "private.lock_and_authorize_hall_of_fame_batch_edit",
      "private.missing_batch_authorizer",
    ),
    mutateFunction(
      migration,
      "private.lock_and_authorize_hall_of_fame_batch_edit",
      "for share of assignment, role_definition",
      "for share of assignment",
    ),
    mutateFunction(
      migration,
      "public.create_hall_of_fame_application_draft",
      "  perform private.lock_hall_of_fame_authorization_boundary();\n",
      "",
    ),
    mutateFunction(
      migration,
      "public.create_hall_of_fame_application_draft",
      "v_valid_admin_club_count <> 0",
      "false",
    ),
    mutateFunction(
      migration,
      "public.create_hall_of_fame_application_draft",
      "v_active_membership_count,\n    v_suspended_membership_count",
      "0,\n    0",
    ),
    mutateFunction(
      migration,
      "public.create_hall_of_fame_application_draft",
      "where membership.user_id = v_actor_user_id\n    and membership.membership_status = 'active'\n    and private.count_active_club_admins(club.id) > 0",
      "where membership.user_id = v_actor_user_id\n    and membership.club_id = p_context_club_id\n    and membership.membership_status = 'active'\n    and private.count_active_club_admins(club.id) > 0",
    ),
    mutateFunctionAll(
      migration,
      "private.lock_and_authorize_hall_of_fame_batch_edit",
      "membership.membership_status = 'active'",
      "membership.membership_status = 'left'",
      2,
    ),
    mutateFunction(
      migration,
      "public.set_hall_of_fame_round_snapshot",
      "where batch.id = p_application_batch_id\n  for update;",
      "where batch.id = p_application_batch_id;",
    ),
    migration.replace(
      "revoke all on function public.add_hall_of_fame_application_record(\n  uuid, integer, uuid, uuid, text, text, integer, integer, integer, uuid\n) from public, anon, authenticated, service_role;",
      "",
    ),
    mutateFunction(
      migration,
      "private.normalize_hall_of_fame_course_segment",
      "pg_catalog.lower(pg_catalog.btrim(p_course_segment))",
      "pg_catalog.btrim(p_course_segment)",
    ),
    mutateFunction(
      migration,
      "public.add_hall_of_fame_application_record",
      "record.course_segment_snapshot = v_course_segment",
      "true",
    ),
    mutateFunction(
      migration,
      "public.update_hall_of_fame_application_record",
      "v_record.course_segment_snapshot = v_course_segment",
      "true",
    ),
    mutateFunction(
      migration,
      "public.add_hall_of_fame_application_record",
      "'record_type_code', v_record_type_code,\n        'course_segment', v_course_segment,\n        'hole_number'",
      "'record_type_code', v_record_type_code,\n        'course_segment', pg_catalog.lower(v_course_segment),\n        'hole_number'",
    ),
    migration.replaceAll(
      "v_existing.payload_fingerprint is distinct from p_payload_fingerprint",
      "false",
    ),
    mutateFunction(
      migration,
      "public.set_hall_of_fame_round_snapshot",
      "v_batch.version <> p_expected_batch_version",
      "false",
    ),
    mutateFunction(
      migration,
      "public.update_hall_of_fame_application_record",
      "v_record.version <> p_expected_record_version",
      "false",
    ),
    migration.replace(
      "grant execute on function public.add_hall_of_fame_application_record(\n  uuid, integer, uuid, uuid, text, text, integer, integer, integer, uuid\n) to authenticated;",
      "grant execute on function public.add_hall_of_fame_application_record(\n  uuid, integer, uuid, uuid, text, text, integer, integer, integer, uuid\n) to service_role;",
    ),
  ];

  for (const [index, changed] of mutations.entries()) {
    assert.notEqual(changed, migration, `mutation ${index + 1} must change SQL`);
    assert.throws(
      () => validateMigration(changed),
      undefined,
      `mutation ${index + 1} must fail the validator`,
    );
  }
});

test("rejects reversed shared authorization lock order", () => {
  const changed = mutateFunction(
    migration,
    "private.lock_hall_of_fame_authorization_boundary",
    "  lock table public.clubs in share mode;\n  lock table public.club_memberships in share mode;",
    "  lock table public.club_memberships in share mode;\n  lock table public.clubs in share mode;",
  );

  assert.notEqual(changed, migration);
  assert.doesNotThrow(() =>
    extractFunction(changed, "private.lock_hall_of_fame_authorization_boundary"),
  );
  assert.throws(
    () => validateMigration(changed),
    /club memberships lock must follow clubs lock/,
  );
});

test("rejects removal of the suspended-membership draft recount", () => {
  const changed = mutateFunction(
    migration,
    "public.create_hall_of_fame_application_draft",
    "where membership.membership_status = 'suspended'\n        and club.club_status = 'active'",
    "where false\n        and club.club_status = 'active'",
  );

  assert.notEqual(changed, migration);
  assert.doesNotThrow(() =>
    extractFunction(changed, "public.create_hall_of_fame_application_draft"),
  );
  assert.throws(
    () => validateMigration(changed),
    /draft must recount suspended memberships/,
  );
});

test("locks club, membership, and role authorization in deterministic order", () => {
  const block = normalizeSql(
    extractFunction(migration, "private.lock_hall_of_fame_authorization_boundary"),
  );
  const clubs = block.indexOf("lock table public.clubs in share mode");
  const memberships = block.indexOf("lock table public.club_memberships in share mode");
  const roles = block.indexOf("lock table public.club_role_assignments in share mode");
  assert.ok(clubs >= 0 && memberships > clubs && roles > memberships);
});

test("applies one batch advisory and locked authorization path to all five edits", () => {
  for (const [name] of editRpcs) {
    const block = normalizeSql(extractFunction(migration, `public.${name}`));
    assert.match(block, /hashtextextended\([^)]*8608\)/);
    assert.match(block, /private\.lock_hall_of_fame_authorization_boundary/);
    assert.match(block, /private\.lock_and_authorize_hall_of_fame_batch_edit/);
  }
});

test("recalculates direct and vacancy eligibility after the shared boundary", () => {
  const block = normalizeSql(
    extractFunction(migration, "public.create_hall_of_fame_application_draft"),
  );
  assert.match(block, /v_active_membership_count/);
  assert.match(block, /v_suspended_membership_count/);
  assert.match(block, /v_valid_admin_club_count/);
  assert.match(block, /private\.count_active_club_admins\(club\.id\) > 0/);
  assert.doesNotMatch(block, /from public\.get_current_user_hall_of_fame_application_eligibility/);
});

test("uses one canonical segment for storage, duplicate checks, fingerprints, and no-op", () => {
  const add = normalizeSql(
    extractFunction(migration, "public.add_hall_of_fame_application_record"),
  );
  const update = normalizeSql(
    extractFunction(migration, "public.update_hall_of_fame_application_record"),
  );
  for (const block of [add, update]) {
    assert.match(block, /private\.normalize_hall_of_fame_course_segment/);
    assert.match(block, /course_segment_snapshot = v_course_segment/);
    assert.match(block, /'course_segment', v_course_segment/);
  }
  assert.match(update, /v_record\.course_segment_snapshot = v_course_segment/);
});

test("keeps request claim replay and exact completion row-count protection", () => {
  const claim = normalizeSql(
    extractFunction(migration, "private.hall_of_fame_claim_request"),
  );
  const complete = normalizeSql(
    extractFunction(migration, "private.complete_hall_of_fame_request"),
  );
  assert.match(claim, /payload_fingerprint is distinct from p_payload_fingerprint/);
  assert.match(claim, /status = 'completed'/);
  assert.match(complete, /v_updated_count <> 1/);
});

test("protects batch and record optimistic versions in exact RPC blocks", () => {
  for (const [name] of editRpcs) {
    const block = normalizeSql(extractFunction(migration, `public.${name}`));
    assert.match(block, /v_batch\.version <> p_expected_batch_version/);
  }
  for (const name of [
    "update_hall_of_fame_application_record",
    "withdraw_hall_of_fame_application_record",
  ]) {
    assert.match(
      normalizeSql(extractFunction(migration, `public.${name}`)),
      /v_record\.version <> p_expected_record_version/,
    );
  }
});

test("keeps exact authenticated-only function ACLs", () => {
  for (const [name, signature] of mutationRpcs) {
    assertSecuredPublicRpc(migration, name, signature);
  }
});

test("keeps target validation, conflict review, duplicate, and 20-target limits", () => {
  const block = normalizeSql(
    extractFunction(migration, "public.add_hall_of_fame_application_record"),
  );
  assert.match(block, /HOF_TARGET_NOT_ACTIVE_MEMBER/);
  assert.match(block, /HOF_TARGET_CLUB_MISMATCH/);
  assert.match(block, /HOF_DUPLICATE_RECORD/);
  assert.match(block, /v_target_distinct_count >= 20/);
  assert.match(block, /conflict_review_required/);
});

test("keeps record and batch withdrawals soft, versioned, and append-only", () => {
  const record = normalizeSql(
    extractFunction(migration, "public.withdraw_hall_of_fame_application_record"),
  );
  const batch = normalizeSql(
    extractFunction(migration, "public.withdraw_hall_of_fame_application_draft"),
  );
  assert.match(record, /review_status = 'withdrawn'/);
  assert.match(record, /version = record\.version \+ 1/);
  assert.match(batch, /status = 'withdrawn'/);
  assert.doesNotMatch(`${record} ${batch}`, /delete from/);
});

test("does not widen table DML, Storage, RLS, or deferred workflow scope", () => {
  const normalized = normalizeSql(migration);
  assert.doesNotMatch(normalized, /grant (insert|update|delete|all) on/);
  assert.doesNotMatch(normalized, /create policy/);
  assert.doesNotMatch(normalized, /storage\.(objects|buckets)/);
  assert.doesNotMatch(
    normalized,
    /function public\.(submit|review|approve|reject|publish)_hall_of_fame/,
  );
});
test("validates the forward-only HTTP stale conflict correction", () => {
  validateHttpConflictCorrection(correctionMigration);
});

test("rejects correction mutations that restore retries or weaken its exact scope", () => {
  const staleBlock = "raise exception\n      using\n        errcode = 'PT409',\n        message = 'HOF_STALE_VERSION';";
  assert.ok(correctionMigration.includes(staleBlock));

  const retrying = correctionMigration.replace(
    staleBlock,
    "raise exception 'HOF_STALE_VERSION' using errcode = '40001';",
  );
  assert.throws(() => validateHttpConflictCorrection(retrying));
  const retryingClaim = correctionMigration.replace(
    "        errcode = 'PT409',\n        message = 'HOF_REQUEST_IN_PROGRESS';",
    "        errcode = '40001',\n        message = 'HOF_REQUEST_IN_PROGRESS';",
  );
  assert.throws(() => validateHttpConflictCorrection(retryingClaim));

  const missingMessage = correctionMigration.replace(
    "        message = 'HOF_STALE_VERSION';",
    "        message = 'HOF_STALE_VERSION_REMOVED';",
  );
  assert.throws(() => validateHttpConflictCorrection(missingMessage));
  const missingSecurityDefiner = correctionMigration.replace(
    "security definer",
    "security invoker",
  );
  assert.throws(() =>
    validateHttpConflictCorrection(missingSecurityDefiner),
  );

  const widenedSearchPath = correctionMigration.replace(
    "set search_path = ''",
    "set search_path = 'public'",
  );
  assert.throws(() => validateHttpConflictCorrection(widenedSearchPath));

  const missingExactRevoke = correctionMigration.replace(
    "revoke all on function public.set_hall_of_fame_round_snapshot(",
    "revoke all on function public.set_hall_of_fame_round_snapshot_removed(",
  );
  assert.throws(() => validateHttpConflictCorrection(missingExactRevoke));

  const missingAuthenticatedGrant = correctionMigration.replace(
    "grant execute on function public.set_hall_of_fame_round_snapshot(",
    "grant execute on function public.set_hall_of_fame_round_snapshot_removed(",
  );
  assert.throws(() =>
    validateHttpConflictCorrection(missingAuthenticatedGrant),
  );

  const weakenedAcl = correctionMigration.replace(
    ") to authenticated;",
    ") to authenticated, anon;",
  );
  assert.throws(() => validateHttpConflictCorrection(weakenedAcl));
  const widenedHelperAcl = `${correctionMigration}\ngrant execute on function private.hall_of_fame_claim_request(\n  uuid, uuid, text, uuid, uuid, uuid, bytea\n) to service_role;\n`;
  assert.throws(() => validateHttpConflictCorrection(widenedHelperAcl));

  const widenedScope = `${correctionMigration}\ncreate table public.forbidden_scope(id uuid);\n`;
  assert.throws(() => validateHttpConflictCorrection(widenedScope));

  const changedHistorical = migration.replace(
    "HOF_STALE_VERSION",
    "HOF_STALE_VERSION_CHANGED",
  );
  assert.throws(() =>
    validateHttpConflictCorrection(correctionMigration, changedHistorical),
  );


  const changedPublicArgument = mutateFunction(
    correctionMigration,
    "public.set_hall_of_fame_round_snapshot",
    "p_expected_batch_version integer,",
    "p_expected_batch_version bigint,",
  );
  assert.throws(
    () => validateHttpConflictCorrection(changedPublicArgument),
    /CREATE identity signature must match/,
  );

  const changedPrivateArgument = mutateFunction(
    correctionMigration,
    "private.hall_of_fame_claim_request",
    "p_request_id uuid,",
    "p_request_id text,",
  );
  assert.throws(
    () => validateHttpConflictCorrection(changedPrivateArgument),
    /CREATE identity signature must match/,
  );

  const changedPublicReturn = mutateFunction(
    correctionMigration,
    "public.set_hall_of_fame_round_snapshot",
    "batch_version integer,\n  record_version integer,",
    "batch_version bigint,\n  record_version integer,",
  );
  assert.throws(
    () => validateHttpConflictCorrection(changedPublicReturn),
    /return type must match/,
  );

  const changedPrivateReturn = mutateFunction(
    correctionMigration,
    "private.hall_of_fame_claim_request",
    "returns table (\n  replayed boolean,\n  result_payload jsonb\n)",
    "returns table (\n  replayed boolean,\n  result_payload text\n)",
  );
  assert.throws(
    () => validateHttpConflictCorrection(changedPrivateReturn),
    /return type must match/,
  );

  const mismatchedRevokeSignature = mutateSourceOnce(
    correctionMigration,
    "revoke all on function public.set_hall_of_fame_round_snapshot(\n  uuid, integer, date,",
    "revoke all on function public.set_hall_of_fame_round_snapshot(\n  uuid, bigint, date,",
    "public REVOKE signature",
  );
  assert.throws(
    () => validateHttpConflictCorrection(mismatchedRevokeSignature),
    /REVOKE ACL signature must match CREATE/,
  );

  const approvedBlock = extractFunction(
    correctionMigration,
    "public.set_hall_of_fame_round_snapshot",
  );
  const overloadedBlock = mutateSourceOnce(
    approvedBlock,
    "p_expected_batch_version integer,",
    "p_expected_batch_version bigint,",
    "public overload signature",
  );
  const addedOverload = correctionMigration + "\n" + overloadedBlock + "\n";
  assert.notEqual(addedOverload, correctionMigration);
  assert.throws(
    () => validateHttpConflictCorrection(addedOverload),
    /exactly the six approved function definitions/,
  );

  const duplicatedDefinition = correctionMigration + "\n" + approvedBlock + "\n";
  assert.notEqual(duplicatedDefinition, correctionMigration);
  assert.throws(
    () => validateHttpConflictCorrection(duplicatedDefinition),
    /exactly the six approved function definitions/,
  );

  const approvedHeader =
    "create or replace function public.set_hall_of_fame_round_snapshot";
  const assertAddedDefinitionRejected = (block, label) => {
    const parsed = parseCorrectionFunctionDefinitions(block);
    assert.equal(parsed.length, 1, `${label} must remain parseable`);
    const changed = correctionMigration + "\n" + block + "\n";
    assert.notEqual(changed, correctionMigration, `${label} must change SQL`);
    assert.throws(
      () => validateHttpConflictCorrection(changed),
      /exactly the six approved function definitions/,
      `${label} must fail definition accounting`,
    );
    return parsed[0];
  };

  const quotedSchemaOverload = mutateSourceOnce(
    overloadedBlock,
    approvedHeader,
    'create or replace function "public".set_hall_of_fame_round_snapshot',
    "quoted lowercase schema overload",
  );
  const quotedSchemaOverloadDefinition = assertAddedDefinitionRejected(
    quotedSchemaOverload,
    "quoted lowercase schema overload",
  );
  assert.equal(quotedSchemaOverloadDefinition.schema, "public");
  assert.equal(quotedSchemaOverloadDefinition.name, editRpcs[0][0]);
  assert.match(quotedSchemaOverloadDefinition.identityArguments, /bigint/);

  const quotedDuplicate = mutateSourceOnce(
    approvedBlock,
    approvedHeader,
    'create or replace function "public"."set_hall_of_fame_round_snapshot"',
    "quoted lowercase duplicate",
  );
  const quotedDuplicateDefinition = assertAddedDefinitionRejected(
    quotedDuplicate,
    "quoted lowercase duplicate",
  );
  assert.equal(quotedDuplicateDefinition.schema, "public");
  assert.equal(quotedDuplicateDefinition.name, editRpcs[0][0]);
  assert.equal(
    quotedDuplicateDefinition.identityArguments,
    correctionFunctionContracts[1].identityArguments,
  );

  const quotedFunctionOverload = mutateSourceOnce(
    overloadedBlock,
    approvedHeader,
    'create or replace function public."set_hall_of_fame_round_snapshot"',
    "quoted function overload",
  );
  const quotedFunctionOverloadDefinition = assertAddedDefinitionRejected(
    quotedFunctionOverload,
    "quoted function overload",
  );
  assert.equal(quotedFunctionOverloadDefinition.schema, "public");
  assert.equal(quotedFunctionOverloadDefinition.name, editRpcs[0][0]);
  assert.match(quotedFunctionOverloadDefinition.identityArguments, /bigint/);

  const mixedCaseSchemaBlock = mutateSourceOnce(
    approvedBlock,
    approvedHeader,
    'create or replace function "Public".set_hall_of_fame_round_snapshot',
    "quoted mixed-case schema",
  );
  const mixedCaseDefinition = assertAddedDefinitionRejected(
    mixedCaseSchemaBlock,
    "quoted mixed-case schema",
  );
  assert.equal(mixedCaseDefinition.schema, "Public");
  assert.notEqual(mixedCaseDefinition.schema, "public");
  assert.equal(mixedCaseDefinition.name, editRpcs[0][0]);

  const escapedIdentifierBlock = mutateSourceOnce(
    approvedBlock,
    approvedHeader,
    'create or replace function "schema""name"."function""name"',
    "escaped quoted identifiers",
  );
  const escapedDefinitions = parseCorrectionFunctionDefinitions(
    escapedIdentifierBlock,
  );
  assert.equal(escapedDefinitions.length, 1);
  assert.equal(escapedDefinitions[0].schema, 'schema"name');
  assert.equal(escapedDefinitions[0].name, 'function"name');

  const uppercaseIdentifierBlock = mutateSourceOnce(
    approvedBlock,
    approvedHeader,
    "create or replace function PUBLIC.SET_HALL_OF_FAME_ROUND_SNAPSHOT",
    "uppercase unquoted identifiers",
  );
  const [uppercaseDefinition] = parseCorrectionFunctionDefinitions(
    uppercaseIdentifierBlock,
  );
  assert.equal(uppercaseDefinition.schema, "public");
  assert.equal(uppercaseDefinition.name, editRpcs[0][0]);

  const typeDefinition = (type) => {
    const definitions = parseCorrectionFunctionDefinitions(`
create function parser.type_probe(p_value ${type})
returns text
language plpgsql
as $$ begin return null; end; $$;
`);
    assert.equal(definitions.length, 1, `${type} must remain parseable`);
    return definitions[0];
  };
  const unquotedLowercaseType = typeDefinition("public.custom_type[]");
  const quotedLowercaseType = typeDefinition('"public"."custom_type" []');
  assert.equal(
    quotedLowercaseType.identityArguments,
    unquotedLowercaseType.identityArguments,
  );
  assert.equal(quotedLowercaseType.identityArguments, "public.custom_type[]");

  const quotedUpperType = typeDefinition('"CaseSchema"."CaseType"[]');
  const quotedLowerType = typeDefinition('"caseschema"."casetype"[]');
  assert.notEqual(
    quotedUpperType.identityArguments,
    quotedLowerType.identityArguments,
  );
  assert.equal(
    quotedUpperType.identityArguments,
    '"CaseSchema"."CaseType"[]',
  );
  assert.equal(
    quotedLowerType.identityArguments,
    "caseschema.casetype[]",
  );
  assert.notEqual(
    typeDefinition('"CaseSchema".casetype').identityArguments,
    typeDefinition("caseschema.casetype").identityArguments,
  );

  const modeDefinitions = parseCorrectionFunctionDefinitions(`
create function "parser"."mode_probe"(
  p_unquoted PUBLIC.Custom_Type [],
  in p_in integer,
  inout p_inout "CaseSchema"."CaseType" [],
  variadic p_variadic text [],
  out p_out uuid,
  p_default numeric(10, 2) default pg_catalog.round((1 + 2)::numeric, 1)
)
returns table ("ResultValue" "CaseSchema"."CaseType" [])
language plpgsql
as $$ begin return; end; $$;
`);
  assert.equal(modeDefinitions.length, 1);
  assert.equal(modeDefinitions[0].schema, "parser");
  assert.equal(modeDefinitions[0].name, "mode_probe");
  assert.equal(modeDefinitions[0].orReplace, false);
  assert.equal(
    modeDefinitions[0].identityArguments,
    'public.custom_type[], integer, inout "CaseSchema"."CaseType"[], ' +
      "variadic text[], numeric(10, 2)",
  );
  assert.equal(
    modeDefinitions[0].returnType,
    normalizeType('table ("ResultValue" "CaseSchema"."CaseType"[])'),
  );
});
