import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function load(name, modules = {}) {
  const source = readFileSync(new URL(name + ".ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const result = { exports: {} };
  new Function("require", "exports", outputText)(key => modules[key], result.exports);
  return result.exports;
}

const { annualClubActivity } = load("./annualClubActivity", {
  "./monthlyScores": load("./monthlyScores"), "./scoreAverages": load("./scoreAverages"),
});
const row = (userId, score) => ({ userId, score, kind: "member" });
const sheet = (date, rows, options = {}) => ({
  date, rows, course: "가상 구장 AB", gameType: "field", comparison_basis: "outdoor_18_single", ...options,
});
const members = [
  { id: "a", name: "가", joined: "2025-01-01" },
  { id: "b", name: "나", joined: "2026-02-11" },
  { id: "c", name: "다", joined: "2025-01-01" },
  { id: "d", name: "라", joined: "2025-01-01" },
];

test("attendance uses saved rows, counts a month once, and separates late joiners, pending rounds and cancellations", () => {
  const workspace = { year: 2026, sheets: [
    sheet("2026-01-12", [row("a", null)]),
    sheet("2026-02-09", [row("a", 53), row("d", 54)]),
    sheet("2026-02-12", [row("b", null)]),
    sheet("2026-03-01", [row("c", 40)], { medalEligible: false }),
  ], events: [{ id: "future", date: "2026-05-09" }] };
  const { rows } = annualClubActivity(workspace, { members }, "2026-04-01");
  assert.deepEqual(rows[0].cells.slice(0, 5), ["참여·성적 미입력", "참여", "미개최/취소", "미개최/취소", "확정 전"]);
  assert.equal(rows[0].participating, 2);
  assert.equal(rows[0].attendanceAward, "perfect");
  assert.equal(rows[1].cells[0], "가입 전");
  assert.equal(rows[1].cells[1], "참여·성적 미입력");
  assert.equal(rows[1].attendanceAward, "since_join");
  assert.equal(rows[2].cells[0], "미참여");
  assert.equal(rows[2].attendanceAward, null);
  const pastPending = annualClubActivity(workspace, { members }, "2026-05-11");
  assert.equal(pastPending.rows[0].attendanceAward, null);
});

test("ranks and growth only compare matching confirmed field and screen conditions", () => {
  const workspace = { year: 2026, sheets: [
    sheet("2026-02-12", [row("a", 60), row("b", 58)]),
    sheet("2026-03-12", [row("a", 50), row("b", 52)]),
    sheet("2026-04-12", [row("a", 5)], { comparison_basis: "unconfirmed" }),
    sheet("2026-04-15", [row("a", 8)], { gameType: "screen", comparison_basis: "other" }),
    sheet("2026-04-17", [row("a", 48)], { gameType: "screen", annualScreenCondition: "18홀 · 기본" }),
  ] };
  const { leagues } = annualClubActivity(workspace, { members }, "2026-05-01");
  assert.equal(leagues.length, 2);
  const field = leagues.find(item => item.condition.startsWith("필드"));
  const screen = leagues.find(item => item.condition.startsWith("스크린"));
  assert.deepEqual(field.scores.get("a"), { id: "a", count: 2, average: 55, improvement: 10, rank: 1, growthCandidate: true });
  assert.equal(field.scores.get("b").rank, 1);
  assert.equal(screen.scores.get("a").rank, null);
  assert.equal(screen.scores.get("a").average, 48);
});

