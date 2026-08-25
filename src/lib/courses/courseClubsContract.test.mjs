import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const read = (path) =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const migration = read(
  "../../../supabase/migrations/20260912000100_pul_course_club_links.sql",
);
const client = read("./courseClubs.ts");
const section = read("../../components/courses/detail/CourseClubsSection.tsx");
const detail = read(
  "../../components/courses/detail/CourseDirectoryDetailContent.tsx",
);
const page = read("../../app/courses/[id]/page.tsx");
const normalized = migration.replace(/\s+/g, " ").trim();

const testableClient = client.replace(
  /import \{\s*clubRegions,\s*type PublicClub,\s*\} from "@\/lib\/clubs\/clubDirectory";/,
  'const clubRegions = ["서울", "경기", "인천", "충북", "충남", "강원", "전북", "전남", "경북", "경남", "부산", "대구", "광주", "대전", "울산", "제주"];',
);
const compiledClient = ts.transpileModule(testableClient, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const clientModule = await import(
  `data:text/javascript;base64,${Buffer.from(compiledClient).toString("base64")}`
);

const validClub = {
  public_key: "club-1",
  name: "TEST 동호회",
  region: "서울",
  district: "마포구",
  region_label: "서울 마포구",
  summary: "TEST 동호회 공개 소개입니다.",
  recruitment_status: "recruiting",
  created_at: "2026-09-12T00:00:00.000Z",
};

test("creates one minimal N:M relation with direct table access closed", () => {
  assert.match(normalized, /create table public\.course_club_links \(/);
  assert.match(
    normalized,
    /constraint course_club_links_pkey primary key \(course_id, club_id\)/,
  );
  assert.match(
    normalized,
    /references public\.courses \(id\) on delete cascade/,
  );
  assert.match(
    normalized,
    /references public\.clubs \(id\) on delete cascade/,
  );
  assert.match(
    normalized,
    /alter table public\.course_club_links force row level security/,
  );
  assert.match(
    normalized,
    /revoke all on table public\.course_club_links from public, anon, authenticated, service_role/,
  );
  assert.doesNotMatch(migration, /create policy .*course_club_links/i);
});

test("public and authenticated RPC ACLs are explicit and role mappings stay unchanged", () => {
  assert.match(
    normalized,
    /grant execute on function public\.list_public_course_clubs\(text\) to anon, authenticated/,
  );
  for (const signature of [
    "list_manageable_course_link_clubs\\(text\\)",
    "link_club_to_course\\(text, text\\)",
    "unlink_club_from_course\\(text, text\\)",
  ]) {
    assert.match(
      normalized,
      new RegExp(`grant execute on function public\\.${signature} to authenticated`),
    );
  }
  assert.doesNotMatch(
    normalized,
    /grant execute on function public\.(?:link_club_to_course|unlink_club_from_course)[^;]+to anon/,
  );
  assert.match(migration, /'club\.settings\.manage'/);
  assert.doesNotMatch(migration, /insert into public\.club_role_permissions/);
  assert.doesNotMatch(migration, /club_manager/);
});

test("mutation functions use stable keys, active guards, relation lock, and duplicate-safe writes", () => {
  for (const functionName of ["link_club_to_course", "unlink_club_from_course"]) {
    const start = migration.indexOf(`create function public.${functionName}`);
    const end = migration.indexOf(`comment on function public.${functionName}`, start);
    const block = migration.slice(start, end);
    assert.match(block, /security definer/);
    assert.match(block, /set search_path = ''/);
    assert.match(block, /account\.account_status/);
    assert.match(block, /course\.course_status = 'active'/);
    assert.match(block, /club\.club_status = 'active'/);
    assert.match(block, /membership\.membership_status = 'active'/);
    assert.match(block, /private\.club_user_has_permission/);
    assert.match(block, /pg_advisory_xact_lock/);
    assert.doesNotMatch(block, /request_id|club_mutation_requests|audit_logs/);
  }
  assert.match(normalized, /on conflict \(course_id, club_id\) do nothing/);
  assert.match(normalized, /delete from public\.course_club_links as link where link\.course_id = v_course_id and link\.club_id = v_club_id/);
});

test("strict DTO parsers reject extra fields, inherited objects, and internal UUIDs", () => {
  assert.deepEqual(clientModule.parsePublicCourseClubs([validClub])[0], {
    publicKey: "club-1",
    name: "TEST 동호회",
    region: "서울",
    district: "마포구",
    regionLabel: "서울 마포구",
    summary: "TEST 동호회 공개 소개입니다.",
    recruitmentStatus: "recruiting",
    createdAt: "2026-09-12T00:00:00.000Z",
  });
  assert.throws(
    () => clientModule.parsePublicCourseClubs([{ ...validClub, club_id: "hidden" }]),
    /응답 형식/,
  );
  const inherited = Object.create({ hidden: true });
  Object.assign(inherited, validClub);
  assert.throws(() => clientModule.parsePublicCourseClubs([inherited]), /응답 형식/);
  assert.throws(
    () =>
      clientModule.parsePublicCourseClubs([
        { ...validClub, public_key: "11111111-1111-4111-8111-111111111111" },
      ]),
    /응답 형식/,
  );
});

test("client sends exact RPC names and argument objects", async () => {
  const calls = [];
  const rpc = async (name, args) => {
    calls.push({ name, args });
    if (name === "list_public_course_clubs") return { data: [validClub], error: null };
    if (name === "list_manageable_course_link_clubs") {
      return { data: [{ ...validClub, linked: false }], error: null };
    }
    return {
      data: {
        course_key: "course-1",
        public_key: "club-1",
        linked: name === "link_club_to_course",
        changed: true,
      },
      error: null,
    };
  };
  const mockClient = { rpc };

  await clientModule.listPublicCourseClubs(mockClient, " course-1 ");
  await clientModule.listManageableCourseLinkClubs(mockClient, "course-1");
  await clientModule.linkClubToCourse(mockClient, "course-1", "club-1");
  await clientModule.unlinkClubFromCourse(mockClient, "course-1", "club-1");

  assert.deepEqual(calls, [
    {
      name: "list_public_course_clubs",
      args: { p_course_key: "course-1" },
    },
    {
      name: "list_manageable_course_link_clubs",
      args: { p_course_key: "course-1" },
    },
    {
      name: "link_club_to_course",
      args: { p_club_key: "club-1", p_course_key: "course-1" },
    },
    {
      name: "unlink_club_from_course",
      args: { p_club_key: "club-1", p_course_key: "course-1" },
    },
  ]);
  await assert.rejects(
    () =>
      clientModule.linkClubToCourse(
        mockClient,
        "11111111-1111-4111-8111-111111111111",
        "club-1",
      ),
    /찾을 수 없습니다/,
  );
});

test("real course detail renders public clubs immediately after activity photos", () => {
  assert.match(page, /listPublicCourseClubs\(client, id\)/);
  assert.match(detail, /CourseActivityPhotoSection/);
  assert.match(detail, /CourseClubsSection/);
  assert.ok(
    detail.indexOf("<CourseClubsSection") >
      detail.indexOf("<CourseActivityPhotoSection"),
  );
  assert.match(section, /이 골프장에서 활동하는 동호회/);
  assert.match(section, /공식 제휴나 골프장 승인을 뜻하지 않습니다/);
  assert.match(section, /href=\{`\/clubs\/\$\{club\.publicKey\}`\}/);
  assert.doesNotMatch(section, /memberCount|대표 이미지|official partnership/i);
});

test("management UI clears account-scoped state and ignores stale async responses", () => {
  assert.match(section, /actorRef\.current === actorId/);
  assert.match(section, /generationRef\.current !== generation/);
  assert.match(section, /setManageableClubs\(\[\]\)/);
  assert.match(section, /setDialog\(null\)/);
  assert.match(section, /setSelectedPublicKey\(""\)/);
  assert.match(section, /setDialogError\(""\)/);
  assert.match(section, /setBusy\(false\)/);
  assert.match(section, /setSuccess\(""\)/);
  assert.match(section, /onAuthStateChange/);
  assert.match(section, /role="dialog"/);
  assert.match(section, /aria-modal="true"/);
  assert.match(section, /event\.key === "Escape"/);
  assert.match(section, /event\.key !== "Tab"/);
});
