import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const explorer = readFileSync(
  fileURLToPath(
    new URL("../../components/hall-of-fame/HallOfFamePublicExplorer.tsx", import.meta.url),
  ),
  "utf8",
);
const page = readFileSync(
  fileURLToPath(new URL("../../app/hall-of-fame/page.tsx", import.meta.url)),
  "utf8",
);
const content = readFileSync(
  fileURLToPath(
    new URL("../../components/hall-of-fame/HallOfFamePageContent.tsx", import.meta.url),
  ),
  "utf8",
);

test("public page server-loads only the initial records and monthly ranking", () => {
  assert.match(page, /listHallOfFamePublicRecordsByType\(supabase, "all", 24, 0\)/);
  assert.match(
    page,
    /listHallOfFamePublicRankings\(supabase, "monthly", referenceDate, 20\)/,
  );
  assert.match(page, /Promise\.all\(\[[\s\S]*publicPromise,[\s\S]*publicRankingPromise/);
  assert.match(page, /timeZone: "Asia\/Seoul"/);
  assert.match(content, /<HallOfFamePublicExplorer/);
});

test("record types and ranking kinds use explicit Korean controls", () => {
  for (const label of ["전체", "홀인원", "알바트로스", "콘도르"]) {
    assert.match(explorer, new RegExp(`label: "${label}"`));
  }
  for (const label of ["월간", "연간", "지역", "동호회", "골프장"]) {
    assert.match(explorer, new RegExp(`label: "${label}"`));
  }
  assert.match(explorer, /role="tablist"[\s\S]*aria-label="명예 기록 종류"/);
  assert.match(explorer, /role="tablist"[\s\S]*aria-label="명예 기록 순위 종류"/);
  assert.match(explorer, /aria-selected=\{selected\}/g);
  assert.match(explorer, /ArrowRight/);
  assert.match(explorer, /ArrowLeft/);
  assert.match(explorer, /Home/);
  assert.match(explorer, /End/);
});

test("secondary filters and rankings load lazily and cache successful responses", () => {
  assert.match(explorer, /listHallOfFamePublicRecordsByType\(supabase, nextFilter, 24, 0\)/);
  assert.match(
    explorer,
    /listHallOfFamePublicRankings\([\s\S]*supabase,[\s\S]*nextKind,[\s\S]*referenceDate,[\s\S]*20/,
  );
  assert.match(explorer, /recordCache\.current\.get\(nextFilter\)/);
  assert.match(explorer, /rankingCache\.current\.get\(nextKind\)/);
  assert.match(explorer, /recordRequestGeneration\.current/);
  assert.match(explorer, /rankingRequestGeneration\.current/);
});

test("public records and rankings expose loading, error, and empty states", () => {
  assert.match(explorer, /role="status"/);
  assert.match(explorer, /role="alert"/);
  assert.match(explorer, /공개 명예 기록을 불러오는 중입니다/);
  assert.match(explorer, /이 종류의 공개 기록이 아직 없습니다/);
  assert.match(explorer, /명예 기록 순위를 불러오는 중입니다/);
  assert.match(explorer, /표시할 순위가 아직 없습니다/);
  assert.match(explorer, /다시 불러오기/);
});

test("public detail reuses the accessible dialog and returns focus", () => {
  assert.match(explorer, /setDetailReturnFocus\(event\.currentTarget\)/);
  assert.match(explorer, /<HallOfFameDialog/);
  assert.match(explorer, /returnFocus=\{detailReturnFocus\}/);
  assert.match(explorer, /공개에 동의한 공식 기록 정보입니다/);
  for (const label of [
    "기록 종류",
    "기록자",
    "기록 일자",
    "골프장",
    "지역",
    "코스·구간",
    "홀·기록",
    "동호회",
    "공개일",
    "획득 배지",
  ]) {
    assert.match(explorer, new RegExp(label));
  }
});

test("ranking UI uses responsive cards and explains its simple public-record rule", () => {
  assert.match(explorer, /grid gap-3/);
  assert.match(explorer, /sm:grid-cols-\[4\.5rem_1fr_auto\]/);
  assert.match(explorer, /공개가 허용된 정상 공식 기록 수만 집계합니다/);
  assert.match(explorer, /aria-label=\{`\$\{ranking\.rank\}위`\}/);
  assert.match(explorer, /recordTypeCounts\.map/);
});

test("public UI source does not render raw identity or internal workflow fields", () => {
  for (const forbidden of [
    "targetUserId",
    "canonicalRecordId",
    "applicationRecordId",
    "requestId",
    "actorUserId",
    "internalNote",
    "email",
    "evidencePath",
  ]) {
    assert.doesNotMatch(explorer, new RegExp(forbidden));
  }
});
