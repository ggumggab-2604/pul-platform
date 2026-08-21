import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const source = readFileSync(fileURLToPath(new URL("./courseDiscussions.ts", import.meta.url)), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const {
  CourseDiscussionError,
  listPublicCourseDiscussionPosts,
  parseCourseDiscussionPost,
  submitCourseDiscussionPost,
  validateCourseDiscussionBody,
} = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const postKey = "a".repeat(32);
const createdAt = "2026-09-06T09:30:00.000Z";

function client(handler) {
  return { rpc: handler };
}

function post(overrides = {}) {
  return {
    post_key: postKey,
    body: "오늘 골프장 잔디 상태가 좋았습니다.",
    author_display_name: "PUL 회원",
    created_at: createdAt,
    ...overrides,
  };
}

test("public list sends exact stable-key pagination arguments and parses the minimal DTO", async () => {
  let call;
  const page = await listPublicCourseDiscussionPosts(client(async (name, args) => {
    call = { name, args };
    return {
      data: { items: [post()], total: 1, limit: 3, offset: 0, has_more: false },
      error: null,
    };
  }), " course-1 ", 3, 0);

  assert.deepEqual(call, {
    name: "list_public_course_discussion_posts",
    args: { p_course_key: "course-1", p_limit: 3, p_offset: 0 },
  });
  assert.deepEqual(page.items[0], {
    postKey,
    body: "오늘 골프장 잔디 상태가 좋았습니다.",
    authorDisplayName: "PUL 회원",
    createdAt,
  });
});

test("submit trims input and sends only course key and body", async () => {
  let call;
  const result = await submitCourseDiscussionPost(client(async (name, args) => {
    call = { name, args };
    return { data: { post_key: postKey, post_status: "published" }, error: null };
  }), " course-1 ", "  오늘 골프장 대기가 조금 있었습니다.  ");

  assert.deepEqual(call, {
    name: "submit_course_discussion_post",
    args: {
      p_course_key: "course-1",
      p_body: "오늘 골프장 대기가 조금 있었습니다.",
    },
  });
  assert.deepEqual(result, { postKey, postStatus: "published" });
});

test("body and page validation reject invalid boundaries before RPC", async () => {
  for (const body of ["짧은 글", "가".repeat(1001)]) {
    assert.throws(
      () => validateCourseDiscussionBody(body),
      (error) => error instanceof CourseDiscussionError && error.code === "validation",
    );
  }
  for (const [limit, offset] of [[0, 0], [25, 0], [20, -1]]) {
    await assert.rejects(
      listPublicCourseDiscussionPosts(client(async () => ({ data: null, error: null })), "course-1", limit, offset),
      (error) => error instanceof CourseDiscussionError && error.code === "validation",
    );
  }
});

test("strict post parser rejects internal identifiers, malformed dates, authors, and bodies", () => {
  assert.equal(parseCourseDiscussionPost(post()).postKey, postKey);
  for (const invalid of [
    post({ id: randomUUID() }),
    post({ course_id: randomUUID() }),
    post({ author_user_id: randomUUID() }),
    post({ created_at: "not-a-date" }),
    post({ created_at: "1" }),
    post({ author_display_name: "" }),
    post({ author_display_name: " PUL 회원 " }),
    post({ body: " 짧지 않은 내용이지만 공백으로 감쌌습니다. " }),
  ]) {
    assert.throws(
      () => parseCourseDiscussionPost(invalid),
      (error) => error instanceof CourseDiscussionError && error.code === "unknown",
    );
  }
});

test("database errors map to stable authentication, validation, notFound, and network codes", async () => {
  for (const [message, code] of [
    ["로그인이 필요합니다.", "authentication"],
    ["정상 활동 계정만 커뮤니티에 글을 작성할 수 있습니다.", "permission"],
    ["이야기 내용은 10~1000자로 입력해 주세요.", "validation"],
    ["골프장 정보를 찾을 수 없습니다.", "notFound"],
    ["Failed to fetch", "network"],
  ]) {
    await assert.rejects(
      listPublicCourseDiscussionPosts(client(async () => ({ data: null, error: { message } })), "course-1", 3, 0),
      (error) => error instanceof CourseDiscussionError && error.code === code,
    );
  }
});

test("an out-of-range page remains a valid empty result for route-level notFound handling", async () => {
  const page = await listPublicCourseDiscussionPosts(client(async () => ({
    data: { items: [], total: 2, limit: 20, offset: 20, has_more: false },
    error: null,
  })), "course-1", 20, 20);
  assert.equal(page.items.length, 0);
  assert.equal(page.total, 2);
});
