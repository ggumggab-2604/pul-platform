import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

function read(relative) {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

const actions = read("../../app/courses/manage/actions.ts");
const listPage = read("../../app/courses/manage/page.tsx");
const reportsPage = read("../../app/courses/manage/reports/page.tsx");
const form = read("../../components/courses/manage/CourseManagementForm.tsx");
const reportActions = read("../../components/courses/manage/CourseReportActions.tsx");
const operations = read("../operations/operationsDashboard.ts");

test("server actions authenticate, validate exact shapes, create fresh request IDs and revalidate public and management routes", () => {
  assert.match(actions, /^"use server";/);
  assert.match(actions, /getAuthenticatedSupabaseContext/);
  assert.match(actions, /function exact\(/);
  assert.match(actions, /randomUUID\(\)/g);
  for (const route of ["/courses", "/courses/manage", "/courses/manage/reports", "/manage"]) {
    assert.equal(actions.includes(`revalidatePath(\"${route}\")`), true);
  }
  assert.doesNotMatch(actions, /\.from\(["'](?:courses|course_information_reports)["']\)[\s\S]{0,120}\.(?:insert|update|delete)\(/);
});

test("course management routes expose list/search/filter/new/edit without UUID text or hard delete", () => {
  assert.match(listPage, /name="q"/);
  assert.match(listPage, /name="region"/);
  assert.match(listPage, /name="status"/);
  assert.match(listPage, /href="\/courses\/manage\/new"/);
  assert.match(listPage, /href="\/courses\/manage\/reports"/);
  assert.doesNotMatch(listPage + form, /hard delete|물리 삭제|UUID/i);
  assert.doesNotMatch(form, /operation:\s*["']remove["']/);
});

test("course form preserves stable key, separates duplicate warning and confirms only publication impact", () => {
  assert.match(form, /비슷한 골프장 확인/);
  assert.match(form, /다른 골프장이라면 등록을 계속할 수 있습니다/);
  assert.match(form, /expectedUpdatedAt: course\?\.updatedAt/);
  assert.match(form, /role="dialog"/);
  assert.match(form, /aria-modal="true"/);
  assert.match(form, /event\.key === "Escape"/);
  assert.match(form, /triggerRef|cancelRef/);
});

test("report UI shows privacy-minimized queue/detail, separates course editing and supports handled/dismissed", () => {
  assert.match(reportsPage, /현재 확인할 골프장 정보 제보가 없습니다/);
  assert.match(reportsPage, /이 골프장 수정하기/);
  assert.doesNotMatch(reportsPage, /reporter|신고자|제보자 이메일|user_id/i);
  assert.match(reportActions, /"handled"/);
  assert.match(reportActions, /"dismissed"/);
  assert.match(reportActions, /운영 메모 \(선택\)/);
  assert.match(reportActions, /aria-modal="true"/);
});

test("operations inbox and management home use the built course routes", () => {
  assert.match(operations, /course_information_reports:[\s\S]*?href: "\/courses\/manage\/reports"/);
  assert.equal(read("../../app/manage/page.tsx").includes('href: "/courses/manage"'), true);
});
