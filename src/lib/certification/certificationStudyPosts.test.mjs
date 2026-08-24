import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const source = readFileSync(
  fileURLToPath(new URL("./certificationStudyPosts.ts", import.meta.url)),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const {
  CertificationStudyPostError,
  listPublicCertificationStudyPosts,
  parseCertificationStudyPost,
  submitCertificationStudyPost,
  validateCertificationStudyBody,
} = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const postKey = "a".repeat(32);
const createdAt = "2026-09-08T09:30:00.000Z";

function client(handler) {
  return { rpc: handler };
}

function post(overrides = {}) {
  return {
    post_key: postKey,
    body: "필기시험 준비 순서와 학습 경험을 공유합니다.",
    author_display_name: "PUL 회원",
    created_at: createdAt,
    ...overrides,
  };
}

test("public list sends exact pagination arguments and parses the minimal DTO", async () => {
  let call;
  const page = await listPublicCertificationStudyPosts(client(async (name, args) => {
    call = { name, args };
    return {
      data: { items: [post()], total: 1, limit: 3, offset: 0, has_more: false },
      error: null,
    };
  }), 3, 0);

  assert.deepEqual(call, {
    name: "list_public_certification_study_posts",
    args: { p_limit: 3, p_offset: 0 },
  });
  assert.deepEqual(page.items[0], {
    postKey,
    body: "필기시험 준비 순서와 학습 경험을 공유합니다.",
    authorDisplayName: "PUL 회원",
    createdAt,
  });
});

test("submit trims input and sends only the body", async () => {
  let call;
  const result = await submitCertificationStudyPost(client(async (name, args) => {
    call = { name, args };
    return { data: { post_key: postKey, post_status: "published" }, error: null };
  }), "  실기시험 연습 방법과 준비 경험을 공유합니다.  ");

  assert.deepEqual(call, {
    name: "submit_certification_study_post",
    args: { p_body: "실기시험 연습 방법과 준비 경험을 공유합니다." },
  });
  assert.deepEqual(result, { postKey, postStatus: "published" });
});

test("body and page validation reject invalid boundaries before RPC", async () => {
  for (const body of ["짧은 글", "가".repeat(1001)]) {
    assert.throws(
      () => validateCertificationStudyBody(body),
      (error) => error instanceof CertificationStudyPostError && error.code === "validation",
    );
  }
  for (const [limit, offset] of [[0, 0], [25, 0], [20, -1]]) {
    await assert.rejects(
      listPublicCertificationStudyPosts(
        client(async () => ({ data: null, error: null })),
        limit,
        offset,
      ),
      (error) => error instanceof CertificationStudyPostError && error.code === "validation",
    );
  }
});

test("strict post parser rejects internal identifiers and malformed fields", () => {
  assert.equal(parseCertificationStudyPost(post()).postKey, postKey);
  for (const invalid of [
    post({ id: randomUUID() }),
    post({ author_user_id: randomUUID() }),
    post({ email: "private@example.invalid" }),
    post({ created_at: "not-a-date" }),
    post({ author_display_name: "" }),
    post({ author_display_name: " PUL 회원 " }),
    post({ body: " 공백으로 감싼 시험 준비 게시글입니다. " }),
  ]) {
    assert.throws(
      () => parseCertificationStudyPost(invalid),
      (error) => error instanceof CertificationStudyPostError && error.code === "unknown",
    );
  }
});

test("database errors map to stable authentication, permission, validation, and network codes", async () => {
  for (const [message, code] of [
    ["로그인이 필요합니다.", "authentication"],
    ["정상 활동 계정만 커뮤니티에 글을 작성할 수 있습니다.", "permission"],
    ["시험 준비 이야기 내용은 10~1000자로 입력해 주세요.", "validation"],
    ["Failed to fetch", "network"],
  ]) {
    await assert.rejects(
      listPublicCertificationStudyPosts(
        client(async () => ({ data: null, error: { message } })),
        3,
        0,
      ),
      (error) => error instanceof CertificationStudyPostError && error.code === code,
    );
  }
});

test("an out-of-range page remains a valid empty result for route-level notFound handling", async () => {
  const page = await listPublicCertificationStudyPosts(client(async () => ({
    data: { items: [], total: 2, limit: 20, offset: 20, has_more: false },
    error: null,
  })), 20, 20);
  assert.equal(page.items.length, 0);
  assert.equal(page.total, 2);
});
