import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const client = read("./clubCoreContent.ts");
const provider = read("../../components/clubs/detail/ClubCoreContentProvider.tsx");
const sections = read("../../components/clubs/detail/ClubDetailSections.tsx");

test("8-33 reuses the guarded club core-content RPC with strict request binding", () => {
  assert.match(client, /supabase\.rpc\("mutate_club_core_content", \{/);
  for (const argument of [
    "p_content_type: input.contentType",
    "p_operation: input.operation",
    "p_request_id: input.requestId",
    "p_club_id: input.clubUuid",
  ]) {
    assert.match(client, new RegExp(argument.replaceAll(".", "\\.")));
  }
  assert.match(client, /data\.request_id !== input\.requestId/);
  assert.match(client, /hasExactKeys\(data, \["request_id", "content_type", "operation", "id", "version", "replayed"\]\)/);
  assert.doesNotMatch(client, /supabase\.from\(/);
});

test("member posting trims the form and sends a fresh request without direct DML", () => {
  assert.match(provider, /title: form\.title\.trim\(\)/);
  assert.match(provider, /contentSummary: form\.summary\.trim\(\)/);
  assert.match(provider, /requestId: crypto\.randomUUID\(\)/);
  assert.match(provider, /contentType: "post", operation: "create"/);
  assert.match(provider, /snapshot\.capabilities\.canCreatePost && authStatus === "signedIn"/);
  assert.doesNotMatch(provider, /supabase\.(?:from|insert|update|delete)\(/);
});

test("general posts do not inherit recruitment state from the specialized post form", () => {
  assert.match(provider, /const recruitmentPost = form\.kind === "flashMeeting" \|\| form\.kind === "companion"/);
  assert.match(provider, /recruitmentStatus: recruitmentPost && form\.recruitmentStatus/);
});

test("signed-out and non-member writers receive deterministic guidance", () => {
  assert.match(provider, /setAuthStatus\(userId \? "signedIn" : "signedOut"\)/);
  assert.match(provider, /\/login\?next=\$\{encodeURIComponent\(`\/clubs\/\$\{detail\.club\.id\}#club-board`\)\}/);
  assert.match(provider, />로그인 후 글쓰기<\/Link>/);
  assert.match(provider, /활동 중인 동호회 회원만 게시글을 작성할 수 있습니다/);
  assert.match(provider, /"회원만 글쓰기"/);
});

test("auth identity changes clear drafts and ignore stale mutation completion", () => {
  assert.match(provider, /setDialog\(undefined\)/);
  assert.match(provider, /setBusy\(false\)/);
  assert.equal((provider.match(/identityRef\.current !== mutationIdentity/g) ?? []).length >= 3, true);
  assert.match(provider, /setSnapshot\(\(current\) => \(\{ \.\.\.current, notices: \[\], posts: \[\], officialEvents: \[\]/);
});

test("the board empty state no longer advertises an unfinished writer", () => {
  assert.match(sections, /아직 등록된 게시글이 없습니다/);
  assert.match(sections, /활동 회원이라면 첫 번째 이야기를 남겨보세요/);
  assert.doesNotMatch(sections, /게시글 작성 기능은 준비 중입니다/);
});
