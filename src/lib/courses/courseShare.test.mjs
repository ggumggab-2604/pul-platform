import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const source = readFileSync(fileURLToPath(new URL("./courseShare.ts", import.meta.url)), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { shareCourseLink } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

const input = {
  title: "TEST 파크골프장",
  text: "TEST 골프장 상세 정보",
  url: "https://example.invalid/courses/test-course",
};

test("native share receives the exact course payload and does not copy", async () => {
  const calls = [];
  const result = await shareCourseLink(input, {
    share: async (payload) => calls.push(["share", payload]),
    clipboard: { writeText: async (url) => calls.push(["copy", url]) },
  });

  assert.equal(result, "shared");
  assert.deepEqual(calls, [["share", input]]);
});

test("user cancellation does not unexpectedly copy the link", async () => {
  let copied = false;
  const result = await shareCourseLink(input, {
    share: async () => {
      const error = new Error("cancelled");
      error.name = "AbortError";
      throw error;
    },
    clipboard: { writeText: async () => { copied = true; } },
  });

  assert.equal(result, "cancelled");
  assert.equal(copied, false);
});

test("unsupported or failed native share falls back to exact-link clipboard copy", async () => {
  for (const navigatorApi of [
    { clipboard: { writeText: async (url) => assert.equal(url, input.url) } },
    {
      share: async () => { throw new Error("share unavailable"); },
      clipboard: { writeText: async (url) => assert.equal(url, input.url) },
    },
  ]) {
    assert.equal(await shareCourseLink(input, navigatorApi), "copied");
  }
});

test("missing or rejected clipboard reports a stable failure", async () => {
  assert.equal(await shareCourseLink(input, undefined), "failed");
  assert.equal(await shareCourseLink(input, {
    clipboard: { writeText: async () => { throw new Error("denied"); } },
  }), "failed");
});

test("both visible share buttons use the same parent handler without placeholder copy", () => {
  const detail = readFileSync(
    fileURLToPath(new URL("../../components/courses/CourseDetailContent.tsx", import.meta.url)),
    "utf8",
  );
  const header = readFileSync(
    fileURLToPath(new URL("../../components/courses/detail/CourseTitleHeader.tsx", import.meta.url)),
    "utf8",
  );
  const shared = readFileSync(
    fileURLToPath(new URL("../../components/courses/detail/courseDetailShared.tsx", import.meta.url)),
    "utf8",
  );

  assert.equal((detail.match(/onShare=\{\(\) => void handleShare\(\)\}/g) ?? []).length, 2);
  assert.match(detail, /shareCourseLink\(\{/);
  assert.match(header, /onClick=\{onShare\}/);
  assert.doesNotMatch(header + shared, /COURSE_SHARE_MESSAGE|공유 기능은 추후 제공/);
});
