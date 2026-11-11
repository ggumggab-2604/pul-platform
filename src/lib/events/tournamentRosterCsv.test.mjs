import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("./tournamentRosterCsv.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const api = {};
new Function("exports", outputText)(api);

test("CSV preserves the phone digits and prevents spreadsheet formulas in text", () => {
  assert.equal(api.csvCell("01055550000"), '"01055550000"');
  assert.equal(api.csvCell('가상 "회원", 가'), '"가상 ""회원"", 가"');
  for (const value of ["=1+1", "  +1", "-1", "@A1", "\tname"]) {
    assert.equal(api.csvCell(value), '"\'' + value + '"');
  }
});

