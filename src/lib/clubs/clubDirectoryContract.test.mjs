import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const migration = read("../../../supabase/migrations/20260831000100_pul_club_public_directory_registration.sql");
const client = read("./clubDirectory.ts");
const listPage = read("../../app/clubs/page.tsx");
const listUi = read("../../components/clubs/ClubsPageContent.tsx");
const detailPage = read("../../app/clubs/[id]/page.tsx");
const registerPage = read("../../app/clubs/register/page.tsx");
const registerForm = read("../../components/clubs/ClubRegistrationForm.tsx");
const normalized = migration.replace(/\s+/g, " ").trim();

const compiledClient = ts.transpileModule(client, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const clientModule = await import(`data:text/javascript;base64,${Buffer.from(compiledClient).toString("base64")}`);

const publicClub = {
  public_key: "club-key",
  name: "TEST 공개 동호회",
  region: "서울",
  district: "송파구",
  region_label: "서울 송파구",
  summary: "TEST 공개 동호회 소개입니다.",
  recruitment_status: "recruiting",
  created_at: "2026-08-20T00:00:00Z",
};

test("public parser is strict, privacy-minimized, and accepts nullable legacy location fields", () => {
  assert.deepEqual(clientModule.parsePublicClub(publicClub), {
    publicKey: "club-key",
    name: "TEST 공개 동호회",
    region: "서울",
    district: "송파구",
    regionLabel: "서울 송파구",
    summary: "TEST 공개 동호회 소개입니다.",
    recruitmentStatus: "recruiting",
    createdAt: "2026-08-20T00:00:00Z",
  });
  assert.equal(clientModule.parsePublicClub({ ...publicClub, region: null, district: null }).region, null);
  assert.throws(() => clientModule.parsePublicClub({ ...publicClub, id: "internal" }), /응답 형식/);
  assert.throws(() => clientModule.parsePublicClub({ ...publicClub, recruitment_status: "fake" }), /응답 형식/);
});

test("public list and detail RPCs are bounded, active-only, and omit internal identifiers", () => {
  assert.match(normalized, /create function public\.list_public_clubs\(/);
  assert.match(normalized, /create function public\.get_public_club\(p_public_key text\)/);
  assert.match(normalized, /club\.club_status = 'active'/);
  assert.match(normalized, /least\(greatest\(coalesce\(p_limit, 24\), 1\), 30\)/);
  assert.match(normalized, /grant execute on function public\.list_public_clubs\(text, text, text, text, integer, integer\) to anon, authenticated/);
  assert.match(normalized, /grant execute on function public\.get_public_club\(text\) to anon, authenticated/);
  for (const key of ["actor_id", "membership_id", "admin_user_id", "email", "phone", "version"]) {
    assert.doesNotMatch(migration.slice(migration.indexOf("create function public.list_public_clubs"), migration.indexOf("create function public.register_club")), new RegExp(`'${key}'`));
  }
});

test("registration is authenticated, atomic, guarded, replayable, and completes one ledger row", () => {
  assert.match(normalized, /create function public\.register_club\( p_request_id uuid, p_payload jsonb \) returns jsonb language plpgsql volatile security definer set search_path = ''/);
  assert.match(normalized, /auth\.role\(\) is distinct from 'authenticated'/);
  assert.match(normalized, /from public\.user_accounts as account where account\.id = v_actor_id for share/);
  assert.match(normalized, /pg_advisory_xact_lock/);
  assert.match(normalized, /from private\.club_mutation_requests as ledger where ledger\.actor_id = v_actor_id and ledger\.request_id = p_request_id for update/);
  assert.match(normalized, /insert into public\.clubs/);
  assert.match(normalized, /insert into public\.club_memberships/);
  assert.match(normalized, /'club_member'/);
  assert.match(normalized, /'club_admin'/);
  assert.match(normalized, /insert into public\.audit_logs/);
  assert.match(normalized, /get diagnostics v_completed_count = row_count/);
  assert.match(normalized, /if v_completed_count <> 1 then/);
  assert.match(normalized, /grant execute on function public\.register_club\(uuid, jsonb\) to authenticated/);
  assert.doesNotMatch(normalized, /grant execute on function public\.register_club\(uuid, jsonb\) to (?:public|anon|service_role)/);
});

test("existing club-admin guard is extended only with a concrete registration ledger context", () => {
  const guard = migration.slice(migration.indexOf("create or replace function private.enforce_guarded_club_admin_assignment_mutation"), migration.indexOf("create function public.list_public_clubs"));
  assert.match(guard, /'club\.register'/);
  assert.match(guard, /ledger\.actor_id = v_context_actor_id/);
  assert.match(guard, /ledger\.club_id = v_context_club_id/);
  assert.match(guard, /ledger\.target_user_id = v_context_target_user_id/);
  assert.match(guard, /ledger\.outcome is null/);
  assert.match(guard, /auth\.uid\(\) is distinct from v_context_actor_id/);
  assert.match(guard, /v_context_target_user_id is distinct from v_context_actor_id/);
  assert.match(guard, /exists \(\s*select 1\s*from public\.club_role_assignments/);
});

test("actual routes use the shared real-data contract and remove static runtime fallbacks", () => {
  assert.match(listPage, /listPublicClubs/);
  assert.match(detailPage, /getPublicClub/);
  assert.match(detailPage, /cache\(/);
  assert.match(detailPage, /notFound\(\)/);
  assert.doesNotMatch(detailPage, /generateStaticParams|getClubDetailData|parkGolfClubs/);
  assert.doesNotMatch(listUi, /featuredClubs|parkGolfClubs|CLUB_REGISTER_FORM_URL|Google Form/);
  assert.match(registerPage, /login\?next=/);
  assert.match(registerForm, /registerClubAction/);
  assert.match(registerForm, /requestIdRef\.current \?\? crypto\.randomUUID\(\)/);
  assert.match(registerForm, /router\.push\(`\/clubs\/\$\{encodeURIComponent\(result\.data\.publicKey\)\}`\)/);
});

test("client sends normalized filters and rejects malformed list envelopes", async () => {
  let call;
  const fakeClient = {
    rpc: async (name, params) => {
      call = { name, params };
      return { data: { items: [publicClub], total: 1, limit: 24, offset: 0, has_more: false }, error: null };
    },
  };
  const page = await clientModule.listPublicClubs(fakeClient, { keyword: "  TEST  ", region: "서울" }, 24, 0);
  assert.equal(page.items[0].publicKey, "club-key");
  assert.equal(call.name, "list_public_clubs");
  assert.equal(call.params.p_keyword, "TEST");
  assert.equal(call.params.p_region, "서울");
  await assert.rejects(() => clientModule.listPublicClubs({ rpc: async () => ({ data: { items: [], total: 0 }, error: null }) }), /응답 형식/);
});
